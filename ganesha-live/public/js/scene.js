// หน้าฉาก: วาดคนดู ของถวาย และเอฟเฟกต์ตามเหตุการณ์จากไลฟ์
// Scene renderer. Receives events from server.js over WebSocket (or from the built-in demo).
import { createGame, DEFAULT_SETTINGS, clip } from './game.js';
import { createSim } from './sim.js';
import { GANESHA_SVG, garlandSVG, MODAK_SLOTS } from './ganesha.js';
import { createAnnouncer } from './lines.js';
import { createVoice, serverVoiceUrl } from './voice.js';

const W = 1080;
const H = 1920;
const FIG_H = 196;
const $ = (sel) => document.querySelector(sel);
const params = new URLSearchParams(location.search);
const DEMO = params.has('demo') || window.SCENE_DEMO === true;
let settings = { ...DEFAULT_SETTINGS };
if (params.get('bg') === '0') document.body.classList.add('transparent');

const stage = $('#stage');
const layer = $('#devotees');
const flyers = $('#flyers');
const popups = $('#popups');
const toasts = $('#toasts');

function fit() {
  const box = stage.parentElement;
  const s = Math.min((box.clientWidth || innerWidth) / W, (box.clientHeight || innerHeight) / H);
  stage.style.transform = `translate(-50%, -50%) scale(${s})`;
}
addEventListener('resize', fit);
if (window.ResizeObserver) new ResizeObserver(fit).observe(stage.parentElement);
fit();

// ---------- helpers ----------
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const clipName = (n) => clip(n, 10);
function hash(str) {
  let h = 2166136261;
  for (const c of String(str)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('th', { granularity: 'grapheme' }) : null;
function initial(name) {
  const gs = seg ? [...seg.segment(name)].map((x) => x.segment) : Array.from(name);
  return (gs.find((g) => !/^[เแโใไ\s]/.test(g)) || gs[0] || '?').toUpperCase();
}

const AV_COLORS = ['#b5452b', '#c27a10', '#7a2e8f', '#2e6f8f', '#3f7a3a', '#a33b62', '#8a5a2b', '#5b4bb0'];
function avatar(user) {
  const d = el('div', 'avatar');
  d.style.setProperty('--c', AV_COLORS[hash(user.id || user.name) % AV_COLORS.length]);
  d.textContent = initial(user.name || '?');
  if (user.avatar) {
    const img = new Image();
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.decoding = 'async';
    img.onload = () => { d.textContent = ''; d.appendChild(img); };
    img.src = user.avatar;
  }
  return d;
}

// ---------- artwork ----------
const NECKLACE = (() => {
  let s = '';
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    s += `<circle cx="${(50 + 50 * t).toFixed(1)}" cy="${(14 + 26 * Math.sin(Math.PI * t)).toFixed(1)}" r="5.5" fill="${i % 2 ? '#f28c18' : '#ffc21a'}"/>`;
  }
  return s;
})();
const ROBES = [
  ['#f4ede0', '#d8cbb3', '#f2b638'], ['#f28c18', '#c4620a', '#fff1b8'], ['#8f1d2c', '#5e0c18', '#f2b638'],
  ['#e8749a', '#b44a6f', '#fff1b8'], ['#f2c94c', '#c49b0c', '#8f1d2c'], ['#ffffff', '#d6d6d6', '#e8749a'],
  ['#6a3fa0', '#432470', '#f2b638'],
];
const SKIN = ['#f1c7a1', '#e0ac7e', '#c98d5f', '#f5d3b3'];
function bodySVG(id) {
  const h = hash(id);
  const [robe, dark, sash] = ROBES[h % ROBES.length];
  const skin = SKIN[(h >>> 4) % SKIN.length];
  return `<svg class="body" viewBox="0 0 150 140" aria-hidden="true">
    <ellipse cx="75" cy="133" rx="66" ry="7" fill="rgba(0,0,0,.4)"/>
    <path d="M42 16 Q75 0 108 16 L128 108 Q132 130 110 130 L40 130 Q18 130 22 108 Z" fill="${robe}"/>
    <path d="M42 16 L112 104 L102 114 L34 30 Z" fill="${sash}" opacity=".85"/>
    <path d="M48 30 Q38 66 70 76" stroke="${dark}" stroke-width="14" fill="none" stroke-linecap="round"/>
    <path d="M102 30 Q112 66 80 76" stroke="${dark}" stroke-width="14" fill="none" stroke-linecap="round"/>
    <path d="M67 80 Q64 56 75 38 Q86 56 83 80 Z" fill="${skin}" stroke="rgba(0,0,0,.25)" stroke-width="1.5"/>
    <path d="M75 42 L75 79" stroke="rgba(0,0,0,.2)" stroke-width="1.5"/>
    <path d="M26 112 Q75 100 124 112 L126 130 L24 130 Z" fill="${dark}"/>
    <g class="necklace">${NECKLACE}</g>
  </svg>`;
}

const OFFER_SVG = {
  marigold: () => `<svg viewBox="0 0 64 64"><circle cx="32" cy="34" r="26" fill="#d9580a"/><circle cx="32" cy="34" r="21" fill="none" stroke="#f7951d" stroke-width="10" stroke-dasharray="5 3"/><circle cx="32" cy="34" r="13" fill="#ffb627"/><circle cx="32" cy="34" r="9" fill="none" stroke="#ffd34d" stroke-width="5" stroke-dasharray="3 2"/><circle cx="32" cy="34" r="4" fill="#c2410c"/></svg>`,
  garland: () => {
    let s = '<svg viewBox="0 0 64 64">';
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI * (0.05 + 0.9 * i / 12);
      s += `<circle cx="${(32 + 26 * Math.cos(a)).toFixed(1)}" cy="${(10 + 40 * Math.sin(a)).toFixed(1)}" r="6.5" fill="${i % 2 ? '#f28c18' : '#ffc21a'}"/>`;
    }
    return s + '<path d="M26 52 L32 63 L38 52 Z" fill="#d94a2b"/></svg>';
  },
  laddu: () => `<svg viewBox="0 0 64 64"><ellipse cx="32" cy="54" rx="29" ry="8" fill="url(#gold)"/><g fill="#f5a524" stroke="#c46f0c" stroke-width="1.5"><circle cx="16" cy="45" r="9"/><circle cx="32" cy="46" r="9"/><circle cx="48" cy="45" r="9"/><circle cx="24" cy="31" r="9"/><circle cx="40" cy="31" r="9"/><circle cx="32" cy="17" r="9"/></g><g fill="#ffe08a" opacity=".8"><circle cx="13" cy="42" r="2.5"/><circle cx="29" cy="43" r="2.5"/><circle cx="45" cy="42" r="2.5"/><circle cx="21" cy="28" r="2.5"/><circle cx="37" cy="28" r="2.5"/><circle cx="29" cy="14" r="2.5"/></g></svg>`,
  diya: () => `<svg viewBox="0 0 64 64"><path d="M4 40 Q32 66 60 40 Q50 35 32 37 Q14 35 4 40 Z" fill="#b5541c"/><path d="M4 40 Q32 48 60 40" stroke="#f2b638" stroke-width="3" fill="none"/><path d="M32 4 C23 17 23 28 32 35 C41 28 41 17 32 4 Z" fill="#ffb627"/><path d="M32 15 C28 21 28 28 32 32 C36 28 36 21 32 15 Z" fill="#fff6c2"/></svg>`,
  fruit: () => `<svg viewBox="0 0 64 64"><ellipse cx="32" cy="54" rx="29" ry="8" fill="url(#gold)"/><path d="M12 32 Q30 6 54 20 Q34 18 18 36 Z" fill="#ffd93b" stroke="#c49b0c" stroke-width="1.5"/><path d="M16 38 Q34 14 56 28 Q38 26 22 42 Z" fill="#ffe25a" stroke="#c49b0c" stroke-width="1.5"/><circle cx="19" cy="44" r="11" fill="#d62f2f"/><circle cx="45" cy="44" r="11" fill="#7cb342"/><circle cx="32" cy="47" r="9" fill="#ff9f1c"/><circle cx="16" cy="40" r="3" fill="#fff" opacity=".5"/></svg>`,
  grand: () => `<svg viewBox="0 0 64 64"><path d="M24 62 L40 62 L37 50 L27 50 Z" fill="url(#gold)"/><path d="M6 40 Q32 58 58 40 Z" fill="url(#gold)" stroke="#9b6512" stroke-width="1.5"/><path d="M14 40 L32 4 L50 40 Z" fill="#f28c18"/><g fill="#ffc21a"><circle cx="32" cy="14" r="4"/><circle cx="27" cy="24" r="4"/><circle cx="37" cy="24" r="4"/><circle cx="22" cy="34" r="4"/><circle cx="32" cy="34" r="4"/><circle cx="42" cy="34" r="4"/></g><circle cx="32" cy="4" r="4" fill="#fff1b8"/></svg>`,
};

const LOTUS_LAMP = `<svg viewBox="0 0 86 70" aria-hidden="true"><path d="M43 2 C35 13 35 23 43 30 C51 23 51 13 43 2 Z" fill="#ffd34d"/><path d="M43 12 C40 17 40 23 43 27 C46 23 46 17 43 12 Z" fill="#fff6c2"/><g fill="#ff9fb8" stroke="#fff0c0" stroke-width="1.5"><path d="M43 30 C30 34 24 48 28 62 C40 58 46 44 43 30 Z"/><path d="M43 30 C56 34 62 48 58 62 C46 58 40 44 43 30 Z"/><path d="M8 44 C22 40 34 48 38 62 C22 64 12 56 8 44 Z"/><path d="M78 44 C64 40 52 48 48 62 C64 64 74 56 78 44 Z"/></g><ellipse cx="43" cy="63" rx="30" ry="6" fill="#f2b638"/></svg>`;

const MUSHIKA_SVG = `<svg viewBox="0 0 190 120" aria-hidden="true">
  <path d="M150 74 C178 66 186 42 176 20" stroke="#7a5c48" stroke-width="6" fill="none" stroke-linecap="round"/>
  <ellipse cx="108" cy="74" rx="52" ry="34" fill="#8d6e5a"/>
  <ellipse cx="100" cy="88" rx="34" ry="16" fill="#c9a88f"/>
  <circle cx="54" cy="60" r="27" fill="#8d6e5a"/>
  <circle cx="64" cy="33" r="15" fill="#8d6e5a"/><circle cx="64" cy="33" r="9" fill="#f2a7b5"/>
  <circle cx="40" cy="37" r="12" fill="#8d6e5a"/><circle cx="40" cy="37" r="7" fill="#f2a7b5"/>
  <path d="M42 36 L46 22 L52 31 L58 20 L63 34 Z" fill="url(#gold)" stroke="#9b6512" stroke-width="1"/>
  <circle cx="44" cy="56" r="4.5" fill="#1a0a05"/><circle cx="45.5" cy="54.5" r="1.5" fill="#fff"/>
  <circle cx="28" cy="66" r="5" fill="#e0607a"/>
  <path d="M30 70 L8 64 M30 73 L10 78" stroke="#3a2a20" stroke-width="1.5"/>
  <circle cx="44" cy="94" r="13" fill="#f5a524" stroke="#c46f0c" stroke-width="2"/><circle cx="40" cy="90" r="3" fill="#ffe08a"/>
  <ellipse cx="82" cy="106" rx="11" ry="5" fill="#6d5242"/><ellipse cx="132" cy="106" rx="11" ry="5" fill="#6d5242"/>
</svg>`;

const CROWN_SVG = `<svg viewBox="0 0 60 40" aria-hidden="true"><path d="M4 36 L8 10 L20 24 L30 4 L40 24 L52 10 L56 36 Z" fill="url(#gold)" stroke="#8a4b0c" stroke-width="2"/><circle cx="30" cy="26" r="4.5" fill="#e0243e"/><circle cx="16" cy="30" r="3" fill="#1fae74"/><circle cx="44" cy="30" r="3" fill="#1fae74"/></svg>`;

const FORTUNE_CUP_SVG = `<svg viewBox="0 0 120 170" aria-hidden="true">
  <g fill="#e8c88a" stroke="#9b6512" stroke-width="1.5">
    <rect x="34" y="18" width="7" height="60" rx="3" transform="rotate(-10 37 48)"/><rect x="46" y="10" width="7" height="66" rx="3" transform="rotate(-4 49 43)"/>
    <rect x="58" y="14" width="7" height="62" rx="3"/><rect x="70" y="10" width="7" height="66" rx="3" transform="rotate(5 73 43)"/>
    <rect x="80" y="20" width="7" height="58" rx="3" transform="rotate(11 83 49)"/>
  </g>
  <rect x="22" y="58" width="78" height="104" rx="12" fill="#b3192e" stroke="url(#gold)" stroke-width="5"/>
  <rect x="22" y="72" width="78" height="8" fill="url(#gold)"/><rect x="22" y="140" width="78" height="8" fill="url(#gold)"/>
  <circle cx="61" cy="110" r="16" fill="none" stroke="url(#gold)" stroke-width="4"/>
  <text x="61" y="117" text-anchor="middle" font-size="20" font-weight="700" fill="#ffd772">ॐ</text>
</svg>`;

function buildGarland() {
  const anchors = [0, 270, 540, 810, 1080];
  let s = '<rect x="0" y="0" width="1080" height="14" fill="url(#gold)"/>';
  for (let i = 0; i < anchors.length - 1; i++) {
    const x0 = anchors[i];
    const x1 = anchors[i + 1];
    for (let k = 0; k <= 22; k++) {
      const t = k / 22;
      const x = x0 + (x1 - x0) * t;
      const y = 14 + 4 * 84 * t * (1 - t);
      s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="11" fill="${k % 2 ? '#f28c18' : '#ffc21a'}"/>`;
      s += `<circle cx="${x.toFixed(1)}" cy="${(y - 3).toFixed(1)}" r="4" fill="#ffe08a" opacity=".7"/>`;
    }
  }
  for (const x of anchors.slice(1, -1)) {
    s += `<line x1="${x}" y1="14" x2="${x}" y2="112" stroke="#c27a10" stroke-width="3"/>`;
    for (let k = 0; k < 5; k++) s += `<circle cx="${x}" cy="${30 + k * 17}" r="9" fill="${k % 2 ? '#ffc21a' : '#f28c18'}"/>`;
    s += `<path d="M${x - 12} 116 L${x} 142 L${x + 12} 116 Z" fill="#d94a2b"/>`;
  }
  $('#garland').innerHTML = s;
}

function buildArchBeads() {
  const q = (p0, p1, p2, t) => [
    (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
    (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1],
  ];
  let s = '';
  for (let t = 0.1; t < 0.98; t += 0.11) {
    for (const [a, b, c] of [[[52, 232], [52, 91], [270, 47]], [[488, 232], [488, 91], [270, 47]]]) {
      const [x, y] = q(a, b, c, t);
      s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5"/>`;
    }
  }
  for (let y = 262; y < 540; y += 40) s += `<circle cx="52" cy="${y}" r="5"/><circle cx="488" cy="${y}" r="5"/>`;
  $('#archBeads').innerHTML = s;
}

function buildCeremonyRing() {
  const ring = $('#ceremony .ring');
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const orb = el('div', 'orb');
    orb.style.left = `${Math.cos(a) * 310}px`;
    orb.style.top = `${Math.sin(a) * 310}px`;
    orb.appendChild(el('i', 'flame'));
    ring.appendChild(orb);
  }
}

buildGarland();
buildArchBeads();
buildCeremonyRing();
$('#ganesha').innerHTML = GANESHA_SVG;

// ---------- Ganesha reactions ----------
// พิกัดในรูปองค์พระ (viewBox 440x460) → พิกัดบนฉาก
const gnToStage = (x, y) => ({ x: 320 + x, y: 414 + y });
const hasImage = () => $('#deity').classList.contains('has-img');
function gnPlay(cls, ms) {
  const g = $('#ganesha');
  g.classList.remove(cls);
  void g.offsetWidth;
  g.classList.add(cls);
  setTimeout(() => g.classList.remove(cls), ms);
}
const blessHand = () => gnPlay('gn-bless', 1900);
const haloPulse = () => gnPlay('gn-halo-pulse', 2100);
const trunkTaste = () => gnPlay('gn-taste', 1700);
const trunkRaise = () => gnPlay('gn-raise', 3200);

const garlands = [];
function addGarland() {
  const box = $('#gn-garlands');
  if (!box) return;
  if (garlands.length >= 3) garlands.shift().remove();
  const layer = garlands.length;
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.innerHTML = garlandSVG(layer);
  g.classList.add('gn-new');
  box.appendChild(g);
  garlands.push(g);
  setTimeout(() => {
    const i = garlands.indexOf(g);
    if (i >= 0) { garlands.splice(i, 1); g.remove(); }
  }, 6 * 60 * 1000);
}

let modakCount = 0;
function addModak() {
  const box = $('#gn-modaks');
  if (!box) return;
  if (modakCount >= MODAK_SLOTS.length) { burst(gnToStage(302, 240).x, gnToStage(302, 240).y, 16); return; }
  const [x, y] = MODAK_SLOTS[modakCount++];
  const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  c.setAttribute('cx', x);
  c.setAttribute('cy', y);
  c.setAttribute('r', '9');
  c.setAttribute('fill', modakCount % 2 ? '#ffb53a' : '#f5a020');
  c.classList.add('gn-new');
  box.appendChild(c);
}

// ประทีปรอบซุ้ม จุดเพิ่มเมื่อมีคนถวายประทีป
const ARC_LAMPS = (() => {
  const q = (p0, p1, p2, t) => [
    (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
    (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1],
  ];
  const pts = [];
  for (const y of [430, 345, 260]) pts.push([40, y], [500, y]);
  for (const t of [0.25, 0.55, 0.85]) {
    pts.push(q([40, 230], [40, 80], [270, 34], t), q([500, 230], [500, 80], [270, 34], t));
  }
  return pts;
})();
const arcLamps = [];
function lightArcLamp() {
  const used = new Set(arcLamps.map((l) => l.i));
  let i = ARC_LAMPS.findIndex((_, k) => !used.has(k));
  if (i < 0) { const old = arcLamps.shift(); old.el.remove(); i = old.i; }
  const [x, y] = ARC_LAMPS[i];
  const lamp = el('div', 'arclamp');
  lamp.style.left = `${x}px`;
  lamp.style.top = `${y}px`;
  lamp.appendChild(el('i', 'flame'));
  $('#shrine').appendChild(lamp);
  const entry = { i, el: lamp };
  arcLamps.push(entry);
  setTimeout(() => {
    const k = arcLamps.indexOf(entry);
    if (k >= 0) { arcLamps.splice(k, 1); lamp.classList.add('out'); setTimeout(() => lamp.remove(), 1200); }
  }, 5 * 60 * 1000);
}

// ---------- sound (synthesised temple bell, conch, drone) ----------
let ac = null;
const MUTED = params.has('preview');
function audio() {
  if (MUTED) return null;
  try {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    return ac;
  } catch { return null; }
}
addEventListener('pointerdown', () => { audio(); setTimeout(syncBgm, 100); }, { once: true });
const sfx = () => (settings.sound ? Math.max(0, Math.min(1, (Number(settings.sfxVolume) || 0) / 100)) : 0);
function bell(freq = 1046, vol = 0.16, dur = 2.4) {
  const a = audio();
  if (!a || a.state !== 'running' || !sfx()) return;
  const t = a.currentTime;
  const out = a.createGain();
  out.gain.value = vol * sfx();
  out.connect(a.destination);
  for (const [m, amp] of [[1, 1], [2.01, 0.5], [2.76, 0.35], [5.4, 0.18], [8.9, 0.08]]) {
    const o = a.createOscillator();
    const g = a.createGain();
    o.frequency.value = freq * m;
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur / (m * 0.6 + 0.4));
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur);
  }
}
const gong = () => bell(98, 0.32, 6);
const chime = () => bell(1568, 0.1, 1.6);

// เสียงสังข์
function conch() {
  const a = audio();
  if (!a || a.state !== 'running' || !sfx()) return;
  const t = a.currentTime;
  const o = a.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(220, t);
  o.frequency.linearRampToValueAtTime(247, t + 0.6);
  o.frequency.setValueAtTime(247, t + 2.2);
  o.frequency.linearRampToValueAtTime(220, t + 2.9);
  const lfo = a.createOscillator();
  lfo.frequency.value = 5.5;
  const lg = a.createGain();
  lg.gain.value = 3;
  lfo.connect(lg).connect(o.frequency);
  const f = a.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 1100;
  f.Q.value = 4;
  const g = a.createGain();
  const v = 0.14 * sfx();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(v, t + 0.4);
  g.gain.setValueAtTime(v, t + 2.3);
  g.gain.linearRampToValueAtTime(0, t + 3);
  o.connect(f).connect(g).connect(a.destination);
  o.start(t); lfo.start(t);
  o.stop(t + 3.1); lfo.stop(t + 3.1);
}

// ดนตรีบรรยากาศ: เสียงโดรนแบบทันปุระ (สร้างสดในเครื่อง ไม่มีลิขสิทธิ์เพลง)
let bgm = null;
let speaking = false;
function syncBgm() {
  if (!settings.bgm) {
    if (bgm) { clearInterval(bgm.timer); bgm.pad.forEach((o) => o.stop()); bgm.master.disconnect(); bgm = null; }
    return;
  }
  const a = audio();
  if (!a || a.state !== 'running') return;
  if (!bgm) {
    const master = a.createGain();
    master.gain.value = 0;
    master.connect(a.destination);
    const filter = a.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    filter.Q.value = 0.7;
    filter.connect(master);
    const pad = [65.41, 98.0, 130.81].map((fq) => {
      const o = a.createOscillator();
      o.frequency.value = fq;
      const g = a.createGain();
      g.gain.value = 0.05;
      o.connect(g).connect(filter);
      o.start();
      return o;
    });
    const notes = [98.0, 130.81, 130.81, 65.41];
    let i = 0;
    const pluck = () => {
      const t = a.currentTime;
      const fq = notes[i++ % notes.length];
      for (const det of [-4, 0, 4]) {
        const o = a.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = fq;
        o.detune.value = det;
        const g = a.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.045, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0005, t + 4.5);
        o.connect(g).connect(filter);
        o.start(t);
        o.stop(t + 4.6);
      }
    };
    pluck();
    bgm = { master, pad, timer: setInterval(pluck, 1250) };
  }
  const level = (Math.max(0, Math.min(100, Number(settings.bgmVolume) || 0)) / 100) * (speaking ? 0.35 : 1) * 0.8;
  bgm.master.gain.setTargetAtTime(level, a.currentTime, 0.4);
}

// ---------- Thai voice ----------
const DEMO_VOICES = new Set(window.DEMO_VOICES || []);
const voice = createVoice({
  getSettings: () => settings,
  resolve: (it) => (DEMO ? (DEMO_VOICES.has(it.key) ? `voice/${it.key}.mp3` : null) : serverVoiceUrl(settings, it.text)),
  onSpeaking: (on) => {
    speaking = on;
    $('#shrine').classList.toggle('speaking', on);
    syncBgm();
  },
});
const voiceHere = () => !MUTED && (DEMO || settings.voiceOutput !== 'control');

// ---------- particles ----------
const ctx = $('#fx').getContext('2d');
const P = [];
const addP = (p) => { if (P.length < 900) P.push(p); };
let rainUntil = 0;
let motes = 0;

function petals(n) {
  for (let i = 0; i < n; i++) {
    addP({
      k: 'petal', x: rand(40, W - 40), y: rand(-160, -10), vx: rand(-0.8, 0.8), vy: rand(1.8, 3.4),
      rot: rand(0, 6.28), vr: rand(-0.08, 0.08), size: rand(10, 17), sway: rand(0, 6.28),
      color: pick(['#f28c18', '#ffc21a', '#ff9f1c', '#e85d75', '#ffd34d']), life: 520, age: 0,
    });
  }
}
function burst(x, y, n, palette = 'gold') {
  const colors = palette === 'gold' ? ['#fff1b8', '#ffd34d', '#f2b638'] : ['#ff9fb8', '#ffd34d', '#ffffff'];
  for (let i = 0; i < n; i++) {
    const a = rand(0, 6.283);
    const sp = rand(2, 7.5);
    addP({ k: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, size: rand(2.5, 6), life: rand(40, 85), age: 0, color: pick(colors) });
  }
}

const BOWL = { x0: 118, x1: 226, y: 950 };
const sticks = [];
function addStick() {
  if (sticks.length >= 14) sticks.shift();
  sticks.push({ x: rand(BOWL.x0, BOWL.x1), ang: rand(-0.22, 0.22), len: rand(105, 135), born: performance.now() });
}
for (let i = 0; i < 3; i++) addStick();

function drawSticks(now, dt) {
  for (let i = sticks.length - 1; i >= 0; i--) {
    const s = sticks[i];
    const age = (now - s.born) / 1000;
    const len = s.len - age * 0.25;
    if (len < 40) { sticks.splice(i, 1); continue; }
    const tx = s.x + Math.sin(s.ang) * len;
    const ty = BOWL.y - Math.cos(s.ang) * len;
    ctx.strokeStyle = '#7a2e12';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(s.x, BOWL.y); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.strokeStyle = '#c0391b';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(s.x, BOWL.y); ctx.lineTo(s.x + Math.sin(s.ang) * 26, BOWL.y - Math.cos(s.ang) * 26); ctx.stroke();
    const glow = 0.75 + Math.sin(now / 90 + i) * 0.25;
    ctx.fillStyle = `rgba(255,120,30,${0.35 * glow})`;
    ctx.beginPath(); ctx.arc(tx, ty, 9, 0, 6.283); ctx.fill();
    ctx.fillStyle = `rgba(255,220,120,${glow})`;
    ctx.beginPath(); ctx.arc(tx, ty, 3.5, 0, 6.283); ctx.fill();
    if (Math.random() < 0.28 * dt) {
      addP({ k: 'smoke', x: tx, y: ty - 4, vx: rand(-0.15, 0.15), vy: rand(-1.0, -0.6), r: 3, life: rand(150, 240), age: 0, seed: rand(0, 6.28) });
    }
  }
}

let lastT = performance.now();
function frame(now) {
  const dt = Math.min(3, (now - lastT) / 16.67);
  lastT = now;
  ctx.clearRect(0, 0, W, H);
  drawSticks(now, dt);
  if (now < rainUntil) {
    for (let i = 0; i < 4 * dt; i++) addP({ k: 'rain', x: rand(0, W), y: rand(-40, 0), vy: rand(9, 15), len: rand(14, 30), size: rand(1.5, 3), life: 240, age: 0 });
  }
  while (motes < 34) {
    motes++;
    addP({ k: 'mote', x: rand(220, 860), y: rand(420, 1000), vx: rand(-0.2, 0.2), vy: rand(-0.5, -0.12), size: rand(1.4, 3), life: rand(220, 420), age: 0, tw: rand(0, 6.28) });
  }
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i];
    p.age += dt;
    if (p.age > p.life || p.y > H + 40) {
      if (p.k === 'mote') motes--;
      P.splice(i, 1);
      continue;
    }
    const fade = 1 - p.age / p.life;
    switch (p.k) {
      case 'petal': {
        p.sway += 0.05 * dt;
        p.x += (p.vx + Math.sin(p.sway) * 0.9) * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        ctx.save();
        ctx.globalAlpha = Math.min(1, fade * 3);
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, 6.283); ctx.fill();
        ctx.restore();
        break;
      }
      case 'spark': {
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 0.08 * dt; p.vx *= 0.97;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = fade * 0.35;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 2.4, 0, 6.283); ctx.fill();
        ctx.globalAlpha = fade;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.283); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        break;
      }
      case 'smoke': {
        p.x += (p.vx + Math.sin(p.age * 0.04 + p.seed) * 0.35) * dt; p.y += p.vy * dt; p.r += 0.12 * dt;
        ctx.fillStyle = `rgba(230,220,210,${0.16 * fade})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
        break;
      }
      case 'mote': {
        p.x += p.vx * dt; p.y += p.vy * dt; p.tw += 0.08 * dt;
        ctx.fillStyle = `rgba(255,214,120,${(0.4 + Math.sin(p.tw) * 0.3) * Math.min(1, fade * 4)})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.283); ctx.fill();
        break;
      }
      case 'rain': {
        p.y += p.vy * dt;
        ctx.strokeStyle = `rgba(255,215,110,${0.85 * fade})`;
        ctx.lineWidth = p.size;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - p.len); ctx.stroke();
        break;
      }
      default: break;
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- devotees ----------
const ROWS = [
  { y: 1122, s: 0.62, n: 6 }, { y: 1258, s: 0.70, n: 6 }, { y: 1410, s: 0.80, n: 6 },
  { y: 1572, s: 0.90, n: 5 }, { y: 1742, s: 1.0, n: 5 }, { y: 1916, s: 1.1, n: 4 },
];
const slots = [];
ROWS.forEach((r, ri) => {
  const margin = 92;
  const span = W - margin * 2;
  for (let i = 0; i < r.n; i++) {
    slots.push({ x: margin + (span * (i + 0.5)) / r.n + (ri % 2 ? 26 : -26), y: r.y, s: r.s, row: ri, who: null });
  }
});
// คนมาก่อนได้นั่งแถวหน้าใกล้แท่นบูชา เริ่มจากตรงกลาง
slots.sort((a, b) => a.row - b.row || Math.abs(a.x - W / 2) - Math.abs(b.x - W / 2));

const devotees = new Map();

function spawn(user) {
  let d = devotees.get(user.id);
  if (d) { d.last = Date.now(); return d; }
  let slot = slots.find((s) => !s.who);
  if (!slot) {
    let oldest = null;
    for (const v of devotees.values()) if (!oldest || v.last < oldest.last) oldest = v;
    slot = oldest.slot;
    leave(oldest);
  }
  const node = el('div', 'devotee walking');
  node.style.setProperty('--s', slot.s);
  node.style.zIndex = String(10 + slot.row);
  const fig = el('div', 'fig');
  fig.innerHTML = bodySVG(user.id);
  fig.prepend(avatar(user));
  const bubble = el('div', 'bubble');
  const crown = el('div', 'crown');
  crown.innerHTML = CROWN_SVG;
  fig.appendChild(crown);
  node.append(bubble, fig, el('div', 'tag', clipName(user.name)));
  const startX = slot.x < W / 2 ? -100 : W + 100;
  node.style.left = `${startX}px`;
  node.style.top = `${slot.y}px`;
  layer.appendChild(node);
  const dur = Math.min(3.2, Math.max(1.2, Math.abs(slot.x - startX) / 380));
  node.getBoundingClientRect();
  node.style.transition = `left ${dur}s linear`;
  node.style.left = `${slot.x}px`;
  d = { user, slot, el: node, bubble, last: Date.now(), bubbleTimer: 0 };
  slot.who = d;
  devotees.set(user.id, d);
  setTimeout(() => node.classList.remove('walking'), dur * 1000);
  return d;
}

function leave(d) {
  devotees.delete(d.user.id);
  d.slot.who = null;
  d.el.classList.add('leaving');
  setTimeout(() => d.el.remove(), 1100);
}

function headPos(d) {
  if (!d) return { x: W / 2, y: 1500 };
  const x = parseFloat(getComputedStyle(d.el).left) || d.slot.x;
  return { x, y: d.slot.y - (FIG_H - 36) * d.slot.s };
}

function say(d, text, cls = '') {
  if (!d || !text) return;
  d.bubble.textContent = clip(text, 60);
  d.bubble.className = `bubble show ${cls}`;
  d.el.style.zIndex = '18';
  clearTimeout(d.bubbleTimer);
  d.bubbleTimer = setTimeout(() => {
    d.bubble.classList.remove('show');
    d.el.style.zIndex = String(10 + d.slot.row);
  }, 5200);
}

function bow(d, delay = 0) {
  if (!d) return;
  setTimeout(() => {
    d.el.classList.remove('bow');
    void d.el.offsetWidth;
    d.el.classList.add('bow');
    setTimeout(() => d.el.classList.remove('bow'), 1500);
  }, delay);
}

function floater(x, y, text) {
  const f = el('div', 'floater', text);
  f.style.left = `${x}px`;
  f.style.top = `${y}px`;
  flyers.appendChild(f);
  setTimeout(() => f.remove(), 1900);
}

function blaze() {
  const s = $('#shrine');
  s.classList.remove('blaze');
  void s.offsetWidth;
  s.classList.add('blaze');
}

function lantern(d, name) {
  const p = headPos(d);
  const node = el('div', 'lantern');
  node.innerHTML = LOTUS_LAMP;
  node.appendChild(el('span', null, clipName(name)));
  flyers.appendChild(node);
  const tx = 540;
  const ty = 560;
  const a = node.animate([
    { transform: `translate(${p.x}px, ${p.y - 60}px) scale(.7)`, opacity: 0 },
    { transform: `translate(${p.x}px, ${p.y - 150}px) scale(1)`, opacity: 1, offset: 0.15 },
    { transform: `translate(${(p.x + tx) / 2 + rand(-90, 90)}px, ${(p.y + ty) / 2 - 140}px) scale(.95)`, opacity: 1, offset: 0.6 },
    { transform: `translate(${tx}px, ${ty}px) scale(.35)`, opacity: 0 },
  ], { duration: 4200, easing: 'ease-in-out', fill: 'forwards' });
  a.onfinish = () => { node.remove(); burst(tx, ty + 60, 26); blaze(); };
}

// ---------- offerings on the altar ----------
const ALTAR_X = [540, 460, 620, 395, 685, 330, 750];
const altar = new Array(ALTAR_X.length).fill(null);
let altarNext = 0;

function ringBellSprite() {
  const b = $('#bell');
  b.classList.remove('ring');
  void b.offsetWidth;
  b.classList.add('ring');
}

function placeOnAltar(ev) {
  const idx = altarNext % ALTAR_X.length;
  altarNext++;
  const tx = ALTAR_X[idx];
  const ty = 862;
  return {
    x: tx,
    y: ty,
    land() {
      if (altar[idx]) {
        const old = altar[idx];
        old.classList.add('fade');
        setTimeout(() => old.remove(), 1000);
      }
      const item = el('div', 'offering');
      item.innerHTML = OFFER_SVG[ev.offering.key]();
      item.style.left = `${tx}px`;
      item.style.top = `${ty - 37}px`;
      $('#offerings').appendChild(item);
      altar[idx] = item;
    },
  };
}

// ของถวายแต่ละชนิดไปลงที่ต่างกัน: พวงมาลัย→คล้องคอองค์พระ, ขนม→ชามในพระหัตถ์, อื่น ๆ→แท่นบูชา
function offeringTarget(ev) {
  const key = ev.offering.key;
  if (!hasImage() && key === 'garland') {
    const p = gnToStage(220, 246);
    return { ...p, land: addGarland };
  }
  if (!hasImage() && key === 'laddu') {
    const p = gnToStage(302, 262);
    return { ...p, land() { addModak(); trunkTaste(); } };
  }
  return placeOnAltar(ev);
}

function flyOffering(ev, d) {
  const from = headPos(d);
  const target = offeringTarget(ev);
  const fly = el('div', 'flyer');
  fly.innerHTML = OFFER_SVG[ev.offering.key]();
  flyers.appendChild(fly);
  const mx = (from.x + target.x) / 2;
  const my = Math.min(from.y, target.y) - 220;
  const a = fly.animate([
    { transform: `translate(${from.x}px, ${from.y}px) scale(.5)` },
    { transform: `translate(${mx}px, ${my}px) scale(1.35)`, offset: 0.5 },
    { transform: `translate(${target.x}px, ${target.y}px) scale(${ev.offering.key === 'garland' || ev.offering.key === 'laddu' ? 0.6 : 1})` },
  ], { duration: 1100, easing: 'ease-in-out', fill: 'forwards' });
  a.onfinish = () => {
    fly.remove();
    target.land();
    burst(target.x, target.y, 18);
    offeringEffect(ev);
  };
}

// เอฟเฟกต์ตามชนิดของถวาย
function offeringEffect(ev) {
  switch (ev.offering.key) {
    case 'marigold':
      chime();
      blessHand();
      break;
    case 'garland':
      chime();
      bell(1318, 0.1, 1.8);
      blessHand();
      petals(12);
      break;
    case 'laddu':
      bell(1046, 0.16, 2.4);
      blessHand();
      break;
    case 'diya':
      bell(880, 0.16, 2.6);
      lightArcLamp();
      blessHand();
      haloPulse();
      break;
    case 'fruit':
      bell(784, 0.18, 2.8);
      blessHand();
      haloPulse();
      petals(30);
      break;
    case 'grand':
      conch();
      blessHand();
      haloPulse();
      trunkRaise();
      blaze();
      burst(540, 560, 50);
      break;
    default:
      bell();
  }
  ringBellSprite();
}

function mushika() {
  const m = el('div', 'mushika run');
  m.innerHTML = MUSHIKA_SVG;
  flyers.appendChild(m);
  const y = 786;
  const a = m.animate([
    { transform: `translate(${W + 40}px, ${y}px)` },
    { transform: `translate(-240px, ${y}px)` },
  ], { duration: 4400, easing: 'linear' });
  const trail = setInterval(() => {
    const tr = new DOMMatrixReadOnly(getComputedStyle(m).transform);
    burst(tr.m41 + 150, y + 70, 4);
  }, 120);
  a.onfinish = () => { clearInterval(trail); m.remove(); };
}

// ---------- gift popups ----------
const giftQ = [];
let giftBusy = false;
function queueGift(ev, d) {
  giftQ.push([ev, d]);
  if (giftQ.length > 14) giftQ.splice(0, giftQ.length - 14);
  if (!giftBusy) nextGift();
}
function nextGift() {
  const item = giftQ.shift();
  if (!item) { giftBusy = false; return; }
  giftBusy = true;
  const [ev, d] = item;
  const hold = ev.big ? 3800 : giftQ.length > 3 ? 1300 : 2300;
  showGiftPop(ev, hold);
  flyOffering(ev, d);
  petals(Math.min(60, Math.round(6 + Math.sqrt(ev.coins) * 3)));
  if (ev.big) {
    mushika();
    blaze();
    burst(540, 620, 60);
    rainUntil = performance.now() + 2600;
    setTimeout(gong, 200);
  }
  setTimeout(nextGift, hold + 150);
}
function showGiftPop(ev, hold) {
  const card = el('div', `gift-pop${ev.big ? ' big' : ''}`);
  const icon = el('div', 'icon');
  icon.innerHTML = OFFER_SVG[ev.offering.key]();
  if (ev.gift.image) {
    const img = new Image();
    img.className = 'gift-img';
    img.referrerPolicy = 'no-referrer';
    img.alt = '';
    img.onerror = () => img.remove();
    img.src = ev.gift.image;
    icon.appendChild(img);
  }
  const txt = el('div', 'txt');
  const count = ev.gift.count > 1 ? ` × ${ev.gift.count}` : '';
  txt.append(
    el('div', 'who', ev.user.name),
    el('div', 'what', `ร่วมถวาย ${ev.offering.name}${count}`),
    el('div', 'bless', ev.blessing),
  );
  card.append(icon, txt);
  popups.appendChild(card);
  setTimeout(() => {
    card.classList.add('out');
    setTimeout(() => card.remove(), 400);
  }, hold);
}

function toast(text) {
  toasts.appendChild(el('div', 'toast', text));
  while (toasts.children.length > 2) toasts.firstChild.remove();
  const t = toasts.lastChild;
  setTimeout(() => t.remove(), 3300);
}

// ป้ายใหญ่กลางจอ (ครบ 108 ครั้ง)
function bigBanner(title, sub) {
  const b = el('div', 'big-banner');
  b.append(el('b', null, title), el('span', null, sub));
  popups.appendChild(b);
  setTimeout(() => { b.classList.add('out'); setTimeout(() => b.remove(), 500); }, 4200);
}

// ---------- ceremony (goal reached) ----------
const ceremonyQ = [];
let ceremonyBusy = false;
function queueCeremony(round) {
  ceremonyQ.push(round);
  if (!ceremonyBusy) runCeremony();
}
function runCeremony() {
  const round = ceremonyQ.shift();
  if (round == null) { ceremonyBusy = false; return; }
  ceremonyBusy = true;
  const c = $('#ceremony');
  $('#ceremonyText').textContent = `ร่วมพิธีอารตี รอบที่ ${round}`;
  c.classList.add('show');
  conch();
  setTimeout(gong, 1600);
  setTimeout(() => bell(1318, 0.12, 2.2), 2400);
  setTimeout(() => bell(1046, 0.12, 2.2), 3200);
  rainUntil = performance.now() + 6500;
  blaze();
  haloPulse();
  trunkRaise();
  blessHand();
  petals(80);
  let i = 0;
  for (const d of devotees.values()) { bow(d, (i++ % 6) * 120); bow(d, 2200 + (i % 6) * 120); }
  setTimeout(() => {
    c.classList.remove('show');
    setTimeout(runCeremony, 900);
  }, 7500);
}

// ---------- fortune sticks (เซียมซี) ----------
const fortuneQ = [];
let fortuneBusy = false;
function queueFortune(ev) {
  fortuneQ.push(ev);
  if (fortuneQ.length > 4) fortuneQ.shift();
  if (!fortuneBusy) nextFortune();
}
function nextFortune() {
  const ev = fortuneQ.shift();
  if (!ev) { fortuneBusy = false; return; }
  fortuneBusy = true;
  const card = el('div', 'fortune');
  const cup = el('div', 'cup');
  cup.innerHTML = FORTUNE_CUP_SVG;
  const stick = el('div', 'stick', String(ev.fortune.n));
  cup.appendChild(stick);
  const txt = el('div', 'txt');
  txt.append(
    el('div', 'head', `เซียมซีใบที่ ${ev.fortune.n}`),
    el('div', 'who', `ของคุณ ${clipName(ev.user.name)}`),
    el('div', 'msg', ev.fortune.text),
  );
  card.append(cup, txt);
  popups.appendChild(card);
  bell(1760, 0.06, 0.6);
  setTimeout(() => bell(1975, 0.06, 0.6), 250);
  setTimeout(() => { chime(); burst(300, 420, 16); }, 1300);
  setTimeout(() => {
    card.classList.add('out');
    setTimeout(() => { card.remove(); nextFortune(); }, 450);
  }, 7000);
}

// ---------- bell ----------
function ringTempleBell(ev) {
  ringBellSprite();
  bell(1046, 0.2, 3);
  setTimeout(() => bell(1046, 0.14, 2.4), 450);
  floater(930, 860, `🔔 ${clipName(ev.user.name)}`);
  burst(930, 900, 14);
}

// ---------- 108 chant counter ----------
function renderMala(st) {
  const goal = st.chantGoal || 108;
  $('#malaNum').textContent = `${st.chant}/${goal}`;
  $('#malaFill').style.width = `${Math.min(100, (st.chant / goal) * 100)}%`;
  $('#malaLabel').textContent = st.chantRounds ? `📿 สาธุร่วมกัน ×${st.chantRounds}` : '📿 สาธุร่วมกัน';
}
function chantComplete(ev) {
  bigBanner(`ครบ ${settings.chantGoal || 108} ครั้ง 🙏`, 'ขอบคุณทุกท่านที่ร่วมสาธุพร้อมกัน');
  floater(540, 470, 'ॐ');
  haloPulse();
  blaze();
  bell(1318, 0.14, 2.4);
  petals(60);
  let i = 0;
  for (const d of devotees.values()) bow(d, (i++ % 8) * 90);
}

// ---------- event dispatch ----------
function onChat(ev, d) {
  const p = headPos(d);
  switch (ev.kind) {
    case 'sathu':
      say(d, ev.text);
      bow(d);
      floater(p.x, p.y - 30, 'สาธุ 🙏');
      burst(p.x, p.y, 14);
      break;
    case 'wish':
      say(d, `🙏 ${ev.wish}`, 'wish');
      bow(d);
      lantern(d, ev.user.name);
      break;
    case 'incense':
      say(d, ev.text);
      bow(d);
      addStick();
      floater(172, 900, `${clipName(ev.user.name)} จุดธูป`);
      break;
    case 'om':
      say(d, ev.text);
      floater(540, 470, 'ॐ');
      burst(540, 620, 22);
      haloPulse();
      break;
    case 'fortune':
      if (ev.fortune) {
        say(d, `🎋 เซียมซีใบที่ ${ev.fortune.n}`);
        queueFortune(ev);
      } else {
        say(d, `เสี่ยงใหม่ได้ในอีก ${ev.fortuneWait} นาที`);
      }
      break;
    case 'bell':
      say(d, ev.text);
      if (ev.bell) ringTempleBell(ev);
      break;
    default:
      say(d, ev.text);
  }
}

function handleEvent(ev) {
  if (!ev || !ev.type) return;
  const d = ev.user ? spawn(ev.user) : null;
  switch (ev.type) {
    case 'chat': onChat(ev, d); break;
    case 'gift':
      if (d) d.el.classList.add('gifter');
      queueGift(ev, d);
      break;
    case 'like': petals(Math.min(14, 2 + Math.ceil(ev.likes / 2))); break;
    case 'follow':
      toast(`🙏 ขอบคุณคุณ ${clipName(ev.user.name)} ที่ติดตาม`);
      if (d) { d.el.classList.add('garland'); bow(d); }
      bell(1568, 0.08, 1.4);
      break;
    case 'share':
      toast(`📣 ขอบคุณคุณ ${clipName(ev.user.name)} ที่ช่วยแชร์ไลฟ์`);
      break;
    default: break;
  }
  if (ev.chantDone) chantComplete(ev);
  if (ev.ceremony) queueCeremony(ev.ceremony);
}

// ---------- panels & meter ----------
let lastTop = '';
let lastWish = '';
let topId = null;
function renderState(st) {
  if (!st) return;
  const pct = Math.min(100, (st.points / st.goal) * 100);
  $('#meterFill').style.width = `${pct}%`;
  $('#meterNum').textContent = `${fmt(st.points)} / ${fmt(st.goal)}`;
  $('#meterLabel').textContent = `🪔 พลังศรัทธา · สู่พิธีอารตีรอบที่ ${st.round}`;
  renderMala(st);

  const topKey = JSON.stringify(st.top);
  if (topKey !== lastTop) {
    lastTop = topKey;
    const ol = $('#topList');
    ol.replaceChildren();
    if (!st.top.length) ol.appendChild(el('li', 'empty', 'ร่วมถวายเป็นท่านแรก'));
    st.top.forEach((g, i) => {
      const li = el('li');
      const who = el('div', 'who');
      who.append(el('div', 'name', g.name), el('div', 'coins', `${fmt(g.coins)} เหรียญ`));
      li.append(el('div', 'rank', i === 0 ? '👑' : String(i + 1)), avatar({ id: g.id || g.name, name: g.name, avatar: g.avatar }), who);
      ol.appendChild(li);
    });
  }
  // มงกุฎเหนือหัวผู้ร่วมถวายอันดับ 1
  const newTop = st.top[0]?.id || null;
  if (newTop !== topId) {
    if (topId && devotees.get(topId)) devotees.get(topId).el.classList.remove('top1');
    topId = newTop;
  }
  if (topId && devotees.get(topId)) devotees.get(topId).el.classList.add('top1');

  const wishKey = JSON.stringify(st.wishes);
  if (wishKey !== lastWish) {
    const prevFirst = lastWish ? JSON.parse(lastWish)[0]?.t : null;
    lastWish = wishKey;
    const ol = $('#wishList');
    ol.replaceChildren();
    if (!st.wishes.length) ol.appendChild(el('li', 'empty', 'พิมพ์ “ขอพร” ตามด้วยคำอธิษฐาน'));
    st.wishes.slice(0, 3).forEach((w, i) => {
      const li = el('li', i === 0 && w.t !== prevFirst ? 'fresh' : '');
      li.append(el('div', 'name', w.name), el('div', 'text', w.text));
      ol.appendChild(li);
    });
  }
}

function applySettings(next) {
  settings = { ...DEFAULT_SETTINGS, ...next };
  $('#titleText').textContent = settings.title;
  $('#mantraText').textContent = settings.mantra;
  const deity = $('#deity');
  const img = $('#deityImg');
  if (settings.deityImage) {
    if (img.getAttribute('src') !== settings.deityImage) img.src = settings.deityImage;
    deity.classList.add('has-img');
  } else {
    img.removeAttribute('src');
    deity.classList.remove('has-img');
  }
  syncBgm();
}
$('#deityImg').addEventListener('error', () => $('#deity').classList.remove('has-img'));

// ---------- hints on the altar cloth ----------
const HINTS = [
  'พิมพ์ “สาธุ” 🙏 ร่วมกราบไหว้',
  'พิมพ์ “ขอพร” ตามด้วยคำอธิษฐาน',
  'พิมพ์ “เซียมซี” เสี่ยงเซียมซี',
  'พิมพ์ “จุดธูป” หรือ “ตีระฆัง”',
  'ของขวัญ → ของถวายองค์พระ',
];
let hintIdx = 0;
const hintEl = $('#hint');
hintEl.textContent = HINTS[0];
setInterval(() => {
  hintEl.style.opacity = '0';
  setTimeout(() => {
    hintIdx = (hintIdx + 1) % HINTS.length;
    hintEl.textContent = HINTS[hintIdx];
    hintEl.style.opacity = '1';
  }, 500);
}, 4500);

// ---------- data source ----------
function showStatus(text) {
  const s = $('#status');
  s.textContent = text;
  s.classList.toggle('show', Boolean(text));
}

function connect() {
  let opened = false;
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  const warn = setTimeout(() => { if (!opened) showStatus('ยังเชื่อมต่อโปรแกรมไม่ได้ ตรวจว่าเปิดโปรแกรมไว้หรือยัง'); }, 4000);
  ws.onopen = () => { opened = true; clearTimeout(warn); showStatus(''); };
  ws.onmessage = (m) => {
    let msg;
    try { msg = JSON.parse(m.data); } catch { return; }
    if (msg.type === 'hello') { applySettings(msg.settings); renderState(msg.state); }
    else if (msg.type === 'event') { handleEvent(msg.event); renderState(msg.state); }
    else if (msg.type === 'settings') applySettings(msg.settings);
    else if (msg.type === 'state') renderState(msg.state);
    else if (msg.type === 'say' && voiceHere()) voice.say(msg.item);
    else if (msg.type === 'voiceStop') voice.stop();
  };
  ws.onclose = () => {
    clearTimeout(warn);
    if (opened) showStatus('การเชื่อมต่อกับโปรแกรมหลุด กำลังเชื่อมต่อใหม่…');
    setTimeout(connect, 2000);
  };
}

function startDemo() {
  settings.goal = Number(params.get('goal')) || 900;
  const game = createGame(() => settings);
  const sim = createSim();
  const announcer = createAnnouncer(() => settings, { anonymous: true });
  const feed = (ev) => {
    const out = ev.type === 'ceremony' ? game.startCeremony() : game.apply(ev);
    const snap = game.snapshot();
    handleEvent(out);
    renderState(snap);
    for (const it of announcer.onEvent(out, snap)) voice.say(it);
  };
  setInterval(() => { const it = announcer.idle(game.snapshot()); if (it) voice.say(it); }, 5000);
  window.demo = { feed, sim };
  renderState(game.snapshot());
  for (let i = 0; i < 14; i++) setTimeout(() => feed(sim.join()), 200 + i * 260);
  if (params.get('auto') === '0') return;
  const tick = () => {
    feed(sim.next());
    setTimeout(tick, rand(900, 2000));
  };
  setTimeout(tick, 4200);
}

applySettings(settings);
if (DEMO) startDemo();
else connect();
