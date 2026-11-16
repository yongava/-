// โปรแกรมหลัก: ดึงเหตุการณ์จากไลฟ์ TikTok แล้วส่งต่อให้หน้าฉาก
// Main program: reads TikTok LIVE events and relays them to the scene page over WebSocket.
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { TikTokLiveConnection, WebcastEvent, ControlEvent, UserOfflineError } from 'tiktok-live-connector';
import msedge from 'msedge-tts';
import { createGame, DEFAULT_SETTINGS, VOICES, VOICE_RATES } from './public/js/game.js';
import { createSim } from './public/js/sim.js';
import { createAnnouncer, IDLE_LINES } from './public/js/lines.js';

const { MsEdgeTTS, OUTPUT_FORMAT } = msedge;

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const PORT = Number(process.env.PORT) || 3939;
const HOST = process.env.HOST || '127.0.0.1';
const SETTINGS_FILE = path.join(DATA, 'settings.json');
const STATE_FILE = path.join(DATA, 'state.json');
const DEITY_FILE = path.join(DATA, 'deity-image');
const TTS_DIR = path.join(DATA, 'tts-cache');

fs.mkdirSync(TTS_DIR, { recursive: true });

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

let settings = { ...DEFAULT_SETTINGS, ...readJSON(SETTINGS_FILE, {}) };
const game = createGame(() => settings, readJSON(STATE_FILE, null));
const sim = createSim();
const announcer = createAnnouncer(() => settings);

let saveTimer = null;
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fsp.writeFile(STATE_FILE, JSON.stringify(game.toJSON())).catch(() => {});
  }, 1500);
}
function saveSettings() {
  fsp.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2)).catch(() => {});
}

// ---------- WebSocket hub ----------
const clients = new Set();
const logLines = [];
const status = { state: 'idle', message: 'ยังไม่ได้เชื่อมต่อไลฟ์', username: settings.username, viewers: 0, autoSim: false };

function send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function broadcast(msg) { const s = JSON.stringify(msg); for (const ws of clients) if (ws.readyState === 1) ws.send(s); }

function log(text) {
  const line = `${new Date().toLocaleTimeString('th-TH', { hour12: false })}  ${text}`;
  logLines.push(line);
  if (logLines.length > 200) logLines.shift();
  broadcast({ type: 'log', line });
  console.log(line);
}

function setStatus(state, message) {
  Object.assign(status, { state, message });
  broadcast({ type: 'status', status });
  log(message);
}

const LABEL = {
  join: (e) => `👋 ${e.user.name} เข้ามาในไลฟ์`,
  chat: (e) => `💬 ${e.user.name}: ${e.text}`,
  gift: (e) => `🎁 ${e.user.name} ส่ง ${e.gift.name} ×${e.gift.count} (${e.coins} เหรียญ) → ${e.offering.name}`,
  like: (e) => `❤️ ${e.user.name} กดใจ ${e.likes} ครั้ง`,
  follow: (e) => `➕ ${e.user.name} กดติดตาม`,
  share: (e) => `📣 ${e.user.name} แชร์ไลฟ์`,
};

function handle(ev) {
  publish(game.apply(ev), ev.sim);
}

function publish(out, isSim) {
  const state = game.snapshot();
  broadcast({ type: 'event', event: out, state });
  if (out.type !== 'join' && out.type !== 'like' && out.type !== 'ceremony') log(`${isSim ? '[ทดสอบ] ' : ''}${LABEL[out.type]?.(out) ?? out.type}`);
  if (out.chantDone) log(`📿 ทุกคนช่วยกันสาธุครบ ${state.chantGoal} ครั้ง (รอบที่ ${out.chantDone})`);
  if (out.ceremony) log(`🪔 เริ่มพิธีอารตีรอบที่ ${out.ceremony}`);
  speak(announcer.onEvent(out, state));
  saveSoon();
}

// ---------- Thai voice (text to speech) ----------
// ใช้เสียงภาษาไทยของ Microsoft Edge (ฟรี ไม่ต้องใช้คีย์) ถ้าใช้ไม่ได้จะสลับไปใช้ Google Translate
let edge = null;
let edgeVoice = '';
let ttsChain = Promise.resolve();
const ttsInFlight = new Map();

const escapeXml = (t) => t.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);
function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);
}

async function edgeSynth(text, voice, rate) {
  if (!edge || edgeVoice !== voice) {
    try { edge?.close(); } catch { /* ignore */ }
    edge = new MsEdgeTTS();
    await edge.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    edgeVoice = voice;
  }
  // บริการนี้ไม่รับค่า "+0%" หรือค่าว่าง แต่รับ "0%"
  const { audioStream } = edge.toStream(escapeXml(text), { rate: rate === '+0%' ? '0%' : rate });
  const chunks = [];
  for await (const c of audioStream) chunks.push(c);
  const buf = Buffer.concat(chunks);
  if (buf.length < 800) throw new Error('empty audio');
  return buf;
}

async function googleSynth(text) {
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=th&client=tw-ob&q=${encodeURIComponent(text.slice(0, 200))}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`google ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

let ttsWarned = false;
function synth(text, voice, rate) {
  const key = crypto.createHash('sha1').update(`${voice}|${rate}|${text}`).digest('hex');
  if (ttsInFlight.has(key)) return ttsInFlight.get(key);
  const file = path.join(TTS_DIR, `${key}.mp3`);
  const job = (async () => {
    try { return await fsp.readFile(file); } catch { /* not cached yet */ }
    const run = ttsChain.then(async () => {
      try { return await withTimeout(edgeSynth(text, voice, rate), 15000); } catch { edge = null; }
      try { return await withTimeout(edgeSynth(text, voice, rate), 15000); } catch (err) {
        edge = null;
        if (!ttsWarned) { ttsWarned = true; log(`⚠️ เสียงพูดของ Microsoft ใช้ไม่ได้ (${err.message}) สลับไปใช้ Google`); }
      }
      return withTimeout(googleSynth(text), 10000);
    });
    ttsChain = run.catch(() => {});
    const buf = await run;
    await fsp.writeFile(file, buf).catch(() => {});
    return buf;
  })();
  ttsInFlight.set(key, job);
  job.finally(() => ttsInFlight.delete(key)).catch(() => {});
  return job;
}

function speak(items) {
  for (const item of items) {
    broadcast({ type: 'say', item });
    log(`🗣️ ${item.text}`);
    // สังเคราะห์เสียงรอไว้ก่อน หน้าฉากจะได้เล่นได้ทันที
    synth(item.text, settings.voiceName, settings.voiceRate).catch(() => {});
  }
}

setInterval(() => {
  if (!clients.size || !(status.state === 'connected' || status.autoSim)) return;
  const item = announcer.idle(game.snapshot());
  if (item) speak([item]);
}, 5000);

// ---------- TikTok connection ----------
const tk = { conn: null, wanted: false, username: '', retry: null };

// ข้อมูลจาก TikTok มีชื่อฟิลด์ต่างกันตามรุ่นของไลบรารี จึงรองรับทั้งแบบใหม่ (v3) และแบบเก่า
function pickAvatar(user) {
  const urls = user?.avatarMedium?.urlList || user?.avatarThumb?.urlList || user?.profilePicture?.urls || [];
  return urls.find((u) => /\.jpe?g/i.test(u)) || urls[0] || '';
}
function toUser(user) {
  const handle = user?.displayId || user?.uniqueId || '';
  return {
    id: String(user?.id || user?.userId || handle || 'guest'),
    name: user?.nickname || handle || 'ผู้มีจิตศรัทธา',
    avatar: pickAvatar(user),
  };
}
function toGift(d) {
  const g = d.gift || {};
  const old = d.giftDetails || {};
  return {
    name: g.name || old.giftName || 'ของขวัญ',
    diamonds: g.diamondCount || old.diamondCount || 1,
    count: d.repeatCount || 1,
    image: g.image?.urlList?.[0] || old.giftImage?.giftPictureUrl || '',
    streakable: Boolean(g.combo || g.type === 1 || old.giftType === 1),
  };
}

function cleanUsername(input) {
  let u = String(input || '').trim();
  const m = u.match(/tiktok\.com\/@([^/?#\s]+)/i);
  if (m) u = m[1];
  return u.replace(/^@/, '').trim();
}

function scheduleRetry(ms) {
  clearTimeout(tk.retry);
  tk.retry = setTimeout(attempt, ms);
}

function wire(conn) {
  const mine = (fn) => (data) => { if (tk.conn === conn) fn(data); };
  conn.on(WebcastEvent.MEMBER, mine((d) => handle({ type: 'join', user: toUser(d.user) })));
  conn.on(WebcastEvent.CHAT, mine((d) => handle({ type: 'chat', user: toUser(d.user), text: d.content ?? d.comment ?? '' })));
  conn.on(WebcastEvent.GIFT, mine((d) => {
    const gift = toGift(d);
    // ของขวัญที่กดส่งต่อเนื่องได้ จะนับครั้งเดียวตอนจบชุด พร้อมจำนวนรวม
    if (gift.streakable && !d.repeatEnd) return;
    handle({ type: 'gift', user: toUser(d.user), gift });
  }));
  conn.on(WebcastEvent.LIKE, mine((d) => handle({ type: 'like', user: toUser(d.user), likes: d.count ?? d.likeCount ?? 1 })));
  conn.on(WebcastEvent.FOLLOW, mine((d) => handle({ type: 'follow', user: toUser(d.user) })));
  conn.on(WebcastEvent.SHARE, mine((d) => handle({ type: 'share', user: toUser(d.user) })));
  conn.on(WebcastEvent.ROOM_USER, mine((d) => {
    status.viewers = Number(d.total ?? d.viewerCount) || 0;
    broadcast({ type: 'status', status });
  }));
  conn.on(WebcastEvent.STREAM_END, mine(() => {
    tk.conn = null;
    setStatus('waiting', `ไลฟ์ของ @${tk.username} จบแล้ว จะรอเชื่อมต่อใหม่เมื่อเริ่มไลฟ์รอบถัดไป`);
    scheduleRetry(30000);
  }));
  conn.on(ControlEvent.DISCONNECTED, mine(() => {
    tk.conn = null;
    if (!tk.wanted) return;
    setStatus('reconnecting', 'การเชื่อมต่อกับไลฟ์หลุด จะลองใหม่ใน 10 วินาที');
    scheduleRetry(10000);
  }));
  conn.on(ControlEvent.ERROR, mine((err) => {
    const msg = err?.exception?.message || err?.info || String(err);
    if (/online|offline/i.test(msg)) return; // แจ้งไว้แล้วในสถานะ "ยังไม่ได้เริ่มไลฟ์"
    log(`⚠️ ${msg}`);
  }));
}

async function attempt() {
  if (!tk.wanted || !tk.username) return;
  const conn = new TikTokLiveConnection(tk.username, { processInitialData: false });
  tk.conn = conn;
  wire(conn);
  setStatus('connecting', `กำลังเชื่อมต่อไลฟ์ @${tk.username} …`);
  try {
    await conn.connect();
    if (tk.conn !== conn) { conn.disconnect().catch(() => {}); return; }
    status.viewers = 0;
    setStatus('connected', `เชื่อมต่อไลฟ์ @${tk.username} แล้ว`);
  } catch (err) {
    if (tk.conn !== conn) return;
    tk.conn = null;
    const offline = err instanceof UserOfflineError || /offline|not live|isn't live/i.test(err?.message || '');
    if (offline) setStatus('waiting', `@${tk.username} ยังไม่ได้เริ่มไลฟ์ จะลองใหม่ทุก 30 วินาที`);
    else setStatus('error', `เชื่อมต่อไม่สำเร็จ (${err?.message || err}) จะลองใหม่ใน 30 วินาที`);
    scheduleRetry(30000);
  }
}

function tkConnect(input) {
  const username = cleanUsername(input);
  if (!username) { setStatus('error', 'กรุณาใส่ชื่อช่อง TikTok ก่อน'); return; }
  tkDisconnect(true);
  tk.username = username;
  tk.wanted = true;
  status.username = username;
  settings.username = username;
  saveSettings();
  attempt();
}

function tkDisconnect(silent) {
  tk.wanted = false;
  clearTimeout(tk.retry);
  const conn = tk.conn;
  tk.conn = null;
  if (conn) conn.disconnect().catch(() => {});
  status.viewers = 0;
  if (!silent) setStatus('idle', 'ตัดการเชื่อมต่อไลฟ์แล้ว');
}

// ---------- simulator ----------
let simTimer = null;
function setAutoSim(on) {
  clearTimeout(simTimer);
  status.autoSim = Boolean(on);
  broadcast({ type: 'status', status });
  if (!on) return;
  const tick = () => { handle(sim.next()); simTimer = setTimeout(tick, 500 + Math.random() * 900); };
  tick();
}

// ---------- settings ----------
const EDITABLE = [
  'title', 'mantra', 'goal', 'pointsPerCoin', 'pointsPerLike', 'pointsPerComment', 'pointsPerFollow', 'pointsPerShare',
  'bigGiftCoins', 'chantGoal', 'sound', 'sfxVolume', 'bgm', 'bgmVolume', 'voiceEnabled', 'voiceName', 'voiceRate',
  'voiceVolume', 'voiceOutput', 'speakGifts', 'speakWishes', 'speakWelcome', 'speakIdle', 'idleSeconds', 'bannedWords',
];
const CHOICES = { voiceName: Object.keys(VOICES), voiceRate: VOICE_RATES, voiceOutput: ['scene', 'control'] };
function updateSettings(patch) {
  for (const key of EDITABLE) {
    if (!(key in patch)) continue;
    const def = DEFAULT_SETTINGS[key];
    let v = patch[key];
    if (CHOICES[key]) { if (CHOICES[key].includes(v)) settings[key] = v; continue; }
    if (typeof def === 'number') { v = Number(v); if (!Number.isFinite(v) || v < 0) continue; if (key === 'goal') v = Math.max(1, Math.round(v)); }
    else if (typeof def === 'boolean') v = Boolean(v);
    else if (Array.isArray(def)) v = (Array.isArray(v) ? v : String(v).split(/[,\n]/)).map((x) => String(x).trim()).filter(Boolean).slice(0, 200);
    else v = String(v).slice(0, 80);
    settings[key] = v;
  }
  saveSettings();
  broadcast({ type: 'settings', settings });
  broadcast({ type: 'state', state: game.snapshot() });
}

// ---------- HTTP ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const LOCAL_HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);

// กันเว็บไซต์อื่นแอบสั่งงานโปรแกรมผ่านเบราว์เซอร์ (อนุญาตเฉพาะหน้าที่เปิดจากเครื่องนี้)
function trusted(req) {
  if (HOST !== '127.0.0.1' && HOST !== 'localhost') return true;
  if (!LOCAL_HOSTS.has(req.headers.host)) return false;
  const origin = req.headers.origin;
  return !origin || origin === 'null' || LOCAL_HOSTS.has(origin.replace(/^https?:\/\//, ''));
}

async function serveStatic(req, res, urlPath) {
  const rel = decodeURIComponent(urlPath).replace(/^\/+/, '');
  const file = path.resolve(PUBLIC, rel || 'control.html');
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403).end(); return; }
  try {
    const data = await fsp.readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('ไม่พบหน้านี้');
  }
}

const server = http.createServer(async (req, res) => {
  if (!trusted(req)) { res.writeHead(403).end(); return; }
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/deity-image' && req.method === 'GET') {
    try {
      const data = await fsp.readFile(DEITY_FILE);
      res.writeHead(200, { 'Content-Type': settings.deityMime || 'image/png', 'Cache-Control': 'no-cache' });
      res.end(data);
    } catch { res.writeHead(404).end(); }
    return;
  }

  if (url.pathname === '/api/tts' && req.method === 'GET') {
    const text = (url.searchParams.get('text') || '').trim().slice(0, 240);
    const voice = url.searchParams.get('voice');
    const rate = url.searchParams.get('rate') || '+0%';
    if (!text || !VOICES[voice] || !VOICE_RATES.includes(rate)) { res.writeHead(400).end(); return; }
    try {
      const buf = await synth(text, voice, rate);
      res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': buf.length, 'Cache-Control': 'max-age=86400' });
      res.end(buf);
    } catch (err) {
      log(`⚠️ สร้างเสียงพูดไม่สำเร็จ: ${err.message}`);
      res.writeHead(502).end();
    }
    return;
  }

  if (url.pathname === '/api/deity-image' && req.method === 'POST') {
    const type = (req.headers['content-type'] || '').split(';')[0].trim();
    if (!IMAGE_TYPES.includes(type)) { res.writeHead(415).end('ใช้ได้เฉพาะไฟล์ PNG, JPG, WEBP หรือ GIF'); return; }
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 10 * 1024 * 1024) { res.writeHead(413).end('ไฟล์ใหญ่เกิน 10 MB'); return; }
      chunks.push(chunk);
    }
    await fsp.writeFile(DEITY_FILE, Buffer.concat(chunks));
    settings.deityMime = type;
    settings.deityImage = `/deity-image?v=${Date.now()}`;
    saveSettings();
    broadcast({ type: 'settings', settings });
    log('🖼️ เปลี่ยนรูปองค์พระแล้ว');
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true }));
    return;
  }

  if (url.pathname === '/api/deity-image' && req.method === 'DELETE') {
    await fsp.rm(DEITY_FILE, { force: true });
    settings.deityImage = '';
    saveSettings();
    broadcast({ type: 'settings', settings });
    log('🖼️ ลบรูปองค์พระแล้ว (กลับไปใช้สัญลักษณ์ ॐ)');
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
  await serveStatic(req, res, url.pathname);
});

const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  if (!trusted(req) || !req.url.startsWith('/ws')) { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

wss.on('connection', (ws) => {
  clients.add(ws);
  send(ws, { type: 'hello', settings, state: game.snapshot(), status, log: logLines.slice(-60) });
  ws.on('close', () => clients.delete(ws));
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    switch (msg.cmd) {
      case 'connect': tkConnect(msg.username); break;
      case 'disconnect': tkDisconnect(false); break;
      case 'sim': handle({ ...sim.make(msg.kind, msg.option), sim: true }); break;
      case 'autoSim': setAutoSim(msg.on); break;
      case 'settings': updateSettings(msg.settings || {}); break;
      case 'say': if (msg.text) speak([announcer.custom(String(msg.text))]); break;
      case 'voiceTest': speak([announcer.custom('ทดสอบเสียงค่ะ สวัสดีทุกคน ยินดีต้อนรับสู่ไลฟ์สักการะองค์พระพิฆเนศค่ะ')]); break;
      case 'voiceStop': broadcast({ type: 'voiceStop' }); break;
      case 'ceremony': publish(game.startCeremony(), false); break;
      case 'reset':
        game.reset();
        saveSoon();
        broadcast({ type: 'state', state: game.snapshot() });
        log('🔄 รีเซ็ตพลังศรัทธาและอันดับแล้ว');
        break;
      default: break;
    }
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nพอร์ต ${PORT} ถูกใช้อยู่ — โปรแกรมอาจเปิดอยู่แล้ว ลองเปิด http://localhost:${PORT}\nPort ${PORT} is busy: the app may already be running.\n`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, HOST, () => {
  const url = `http://localhost:${PORT}/`;
  console.log('');
  console.log('  🙏 ฉากสักการะพระพิฆเนศ พร้อมใช้งาน');
  console.log(`  หน้าควบคุม:  ${url}`);
  console.log(`  ลิงก์ฉาก (ใส่ใน TikTok LIVE Studio):  ${url}scene.html`);
  console.log('  ปิดหน้าต่างนี้ = ปิดโปรแกรม');
  console.log('');
  if (!process.env.NO_OPEN) {
    const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    exec(cmd, () => {});
  }
  if (settings.username) status.username = settings.username;
  // เปิดการเชื่อมต่อเสียงพูดไว้ก่อน ประโยคแรกในไลฟ์จะได้ไม่ช้า
  if (settings.voiceEnabled) synth(IDLE_LINES[0], settings.voiceName, settings.voiceRate).catch(() => {});
});

process.on('SIGINT', () => {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(game.toJSON())); } catch { /* ignore */ }
  process.exit(0);
});
