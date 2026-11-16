// กติกาของฉาก (ใช้ร่วมกันทั้งฝั่งเซิร์ฟเวอร์และหน้าฉาก)
// Shared scene rules: runs in Node (server.js) and in the browser (demo mode).

export const DEFAULT_SETTINGS = {
  username: '',
  title: 'ร่วมสักการะองค์พระพิฆเนศ',
  mantra: 'โอม ศรี คเณศายะ นะมะห์',
  goal: 3000,            // พลังศรัทธาที่ต้องสะสมเพื่อเริ่มพิธีอารตี
  pointsPerCoin: 10,     // ของขวัญ 1 เหรียญ = กี่แต้ม
  pointsPerLike: 1,
  pointsPerComment: 5,   // สาธุ / ขอพร / จุดธูป (คนละ 1 ครั้งต่อ 8 วินาที)
  pointsPerFollow: 20,
  pointsPerShare: 20,
  bigGiftCoins: 500,     // ของขวัญรวมกี่เหรียญขึ้นไปถึงจะมีหนูมุสิกะวิ่งมา
  chantGoal: 108,        // จำนวนครั้งที่ทุกคนช่วยกันพิมพ์สาธุ/โอม ให้ครบ
  sound: true,           // เสียงระฆัง สังข์ และเอฟเฟกต์
  sfxVolume: 80,
  bgm: false,            // เสียงดนตรีบรรยากาศ (โดรนแบบทันปุระ)
  bgmVolume: 35,
  voiceEnabled: true,    // เสียงพูดภาษาไทย
  voiceName: 'th-TH-PremwadeeNeural',
  voiceRate: '+0%',
  voiceVolume: 90,
  voiceOutput: 'scene',  // เล่นเสียงพูดที่หน้าฉาก หรือที่หน้าควบคุม
  speakGifts: true,
  speakWishes: true,
  speakWelcome: true,
  speakIdle: true,
  idleSeconds: 75,
  bannedWords: [],
  deityImage: '',
};

export const VOICES = { 'th-TH-PremwadeeNeural': 'เสียงผู้หญิง (เปรมวดี)', 'th-TH-NiwatNeural': 'เสียงผู้ชาย (นิวัฒน์)' };
export const VOICE_RATES = ['-10%', '+0%', '+10%', '+20%'];

// เซียมซีองค์พระพิฆเนศ: คำแนะนำเชิงบวก ไม่ใช่คำทำนายโชคลาภ
export const FORTUNES = [
  'เริ่มต้นสิ่งใหม่ได้ดี ขอให้ตั้งใจและเพียรพยายาม',
  'อุปสรรคที่มีจะค่อย ๆ คลี่คลาย ใจเย็นแล้วทางจะเปิด',
  'มีผู้ใหญ่คอยช่วยเหลือ อย่าลืมขอบคุณคนรอบตัว',
  'งานที่ทำอยู่จะเห็นผล หากทำอย่างสม่ำเสมอ',
  'ระวังคำพูด พูดดีแล้วจะได้มิตรเพิ่ม',
  'ใส่ใจสุขภาพ พักผ่อนให้พอ แล้วทุกอย่างจะดีขึ้น',
  'ความรักความเข้าใจในครอบครัวจะอบอุ่นขึ้น',
  'การเรียนรู้สิ่งใหม่จะพาโอกาสดีมาให้',
  'ช่วงนี้เหมาะกับการวางแผน ค่อย ๆ ทำทีละขั้น',
  'ใจที่มั่นคงคือพรที่ดีที่สุด อย่าเพิ่งท้อ',
  'การให้และการแบ่งปันจะกลับมาเป็นความสุข',
  'เรื่องที่กังวลจะผ่านไปด้วยดี ขอให้มีสติ',
  'มิตรภาพใหม่จะนำความสดใสเข้ามา',
  'ความอดทนวันนี้จะเป็นความสำเร็จในวันหน้า',
  'ทำสิ่งที่รักด้วยความตั้งใจ แล้วผลดีจะตามมา',
  'หมั่นทำความดี สิ่งดีงามจะคุ้มครอง',
];

// ของขวัญแต่ละราคา (เหรียญต่อชิ้น) กลายเป็นของถวายอะไร
export const OFFERINGS = [
  { key: 'marigold', name: 'ดอกดาวเรือง', min: 1 },
  { key: 'garland', name: 'พวงมาลัยดาวเรือง', min: 5 },
  { key: 'laddu', name: 'ขนมลาดู', min: 20 },
  { key: 'diya', name: 'ประทีปบูชา', min: 100 },
  { key: 'fruit', name: 'ถาดผลไม้มงคล', min: 300 },
  { key: 'grand', name: 'พานบูชาทองคำ', min: 1000 },
];

export const BLESSINGS = [
  'ขอให้อุปสรรคผ่านพ้น',
  'ขอให้สมความปรารถนา',
  'ขอให้การงานราบรื่น',
  'ขอให้สุขภาพแข็งแรง',
  'ขอให้ครอบครัวอบอุ่น',
  'ขอให้เริ่มต้นสิ่งใหม่ได้ดี',
];

export function offeringFor(coinsPerUnit) {
  let pick = OFFERINGS[0];
  for (const o of OFFERINGS) if (coinsPerUnit >= o.min) pick = o;
  return pick;
}

export function classifyComment(text) {
  const t = (text || '').trim();
  let m;
  if ((m = t.match(/^(ขอพร|อธิษฐาน)\s*[:：\-]?\s*([\s\S]*)$/))) return { kind: 'wish', wish: m[2].trim() };
  if (/^ขอให้/.test(t)) return { kind: 'wish', wish: t };
  if (/เซียมซี|เสี่ยงทาย/.test(t)) return { kind: 'fortune' };
  if (/ตีระฆัง|สั่นระฆัง|^ระฆัง|🔔/.test(t)) return { kind: 'bell' };
  if (/จุดธูป|ถวายธูป/.test(t)) return { kind: 'incense' };
  if (/สาธุ|🙏|ไหว้|^9{2,}$/.test(t)) return { kind: 'sathu' };
  if (/^โอม|คเณศ|ॐ|🕉/.test(t)) return { kind: 'om' };
  return { kind: 'chat' };
}

export function clip(text, max) {
  const chars = Array.from(String(text ?? '').replace(/\s+/g, ' ').trim());
  return chars.length > max ? chars.slice(0, max - 1).join('') + '…' : chars.join('');
}

export function censor(text, words) {
  let out = text;
  for (const w of words || []) {
    const word = String(w).trim();
    if (word) out = out.split(word).join('*'.repeat(Math.min(5, Array.from(word).length)));
  }
  return out;
}

function cleanUser(u) {
  const id = String(u?.id || u?.name || 'guest');
  return { id, name: clip(u?.name || 'ผู้มีจิตศรัทธา', 24), avatar: u?.avatar || '' };
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function createGame(getSettings, saved) {
  const s = {
    points: 0, round: 1, totalCoins: 0, likes: 0, givers: {}, wishes: [], chant: 0, chantRounds: 0,
    ...(saved || {}),
  };
  const lastPoints = new Map();
  const lastFortune = new Map();
  const lastBell = new Map();
  const seen = new Set();

  function addPoints(n) {
    s.points += n;
    const goal = Math.max(1, Math.floor(getSettings().goal) || 1);
    let finished = 0;
    while (s.points >= goal) {
      s.points -= goal;
      finished = s.round;
      s.round += 1;
    }
    return finished;
  }

  function addChant(n) {
    s.chant += n;
    const goal = Math.max(1, Math.floor(getSettings().chantGoal) || 108);
    if (s.chant < goal) return 0;
    s.chant -= goal;
    s.chantRounds += 1;
    return s.chantRounds;
  }

  function cooled(map, id, now, ms) {
    if (now - (map.get(id) || 0) < ms) return false;
    map.set(id, now);
    return true;
  }

  function apply(ev) {
    const cfg = getSettings();
    const out = { ...ev, t: Date.now(), user: cleanUser(ev.user) };
    const id = out.user.id;
    if (!seen.has(id)) {
      seen.add(id);
      if (seen.size > 20000) seen.clear();
      out.firstSeen = true;
    }
    let pts = 0;

    switch (ev.type) {
      case 'chat': {
        out.text = censor(clip(ev.text, 80), cfg.bannedWords);
        const c = classifyComment(out.text);
        out.kind = c.kind;
        if (c.kind === 'wish') {
          out.wish = clip(c.wish || 'ขอพรองค์พระพิฆเนศ', 48);
          s.wishes.unshift({ name: out.user.name, text: out.wish, t: out.t });
          s.wishes.length = Math.min(s.wishes.length, 20);
        }
        if (c.kind === 'sathu' || c.kind === 'om') {
          const done = addChant(1);
          if (done) out.chantDone = done;
        }
        if (c.kind === 'fortune') {
          const wait = 5 * 60 * 1000 - (out.t - (lastFortune.get(id) || 0));
          if (wait <= 0) {
            lastFortune.set(id, out.t);
            const n = 1 + Math.floor(Math.random() * FORTUNES.length);
            out.fortune = { n, text: FORTUNES[n - 1] };
          } else {
            out.fortuneWait = Math.ceil(wait / 60000);
          }
        }
        if (c.kind === 'bell') out.bell = cooled(lastBell, id, out.t, 6000);
        if (c.kind !== 'chat' && cooled(lastPoints, id, out.t, 8000)) pts = cfg.pointsPerComment;
        break;
      }
      case 'gift': {
        const unit = Math.max(1, Math.floor(ev.gift?.diamonds) || 1);
        const count = Math.max(1, Math.floor(ev.gift?.count) || 1);
        const coins = unit * count;
        out.gift = { name: ev.gift?.name || 'ของขวัญ', diamonds: unit, count, image: ev.gift?.image || '' };
        out.coins = coins;
        out.offering = offeringFor(unit);
        out.big = coins >= cfg.bigGiftCoins;
        out.blessing = pick(BLESSINGS);
        const g = s.givers[id] || { name: out.user.name, avatar: out.user.avatar, coins: 0 };
        g.name = out.user.name;
        if (out.user.avatar) g.avatar = out.user.avatar;
        g.coins += coins;
        s.givers[id] = g;
        s.totalCoins += coins;
        pts = coins * cfg.pointsPerCoin;
        break;
      }
      case 'like': {
        out.likes = Math.max(1, Math.floor(ev.likes) || 1);
        s.likes += out.likes;
        pts = out.likes * cfg.pointsPerLike;
        break;
      }
      case 'follow': pts = cfg.pointsPerFollow; break;
      case 'share': pts = cfg.pointsPerShare; break;
      default: break;
    }

    out.points = pts;
    const finished = addPoints(pts);
    if (finished) out.ceremony = finished;
    return out;
  }

  // ผู้ดำเนินไลฟ์กดเริ่มพิธีอารตีเองจากหน้าควบคุม
  function startCeremony() {
    const round = s.round;
    s.round += 1;
    return { type: 'ceremony', t: Date.now(), ceremony: round };
  }

  function snapshot() {
    const top = Object.entries(s.givers)
      .sort((a, b) => b[1].coins - a[1].coins)
      .slice(0, 5)
      .map(([id, { name, avatar, coins }]) => ({ id, name, avatar, coins }));
    return {
      points: s.points,
      goal: Math.max(1, Math.floor(getSettings().goal) || 1),
      round: s.round,
      totalCoins: s.totalCoins,
      likes: s.likes,
      chant: s.chant,
      chantGoal: Math.max(1, Math.floor(getSettings().chantGoal) || 108),
      chantRounds: s.chantRounds,
      top,
      wishes: s.wishes.slice(0, 5),
    };
  }

  function reset() {
    Object.assign(s, { points: 0, round: 1, totalCoins: 0, likes: 0, givers: {}, wishes: [], chant: 0, chantRounds: 0 });
    lastPoints.clear();
    lastFortune.clear();
    lastBell.clear();
  }

  function toJSON() {
    // เก็บเฉพาะผู้ร่วมถวาย 300 อันดับแรก ไม่ให้ไฟล์โตเกินไป
    const givers = Object.fromEntries(
      Object.entries(s.givers).sort((a, b) => b[1].coins - a[1].coins).slice(0, 300),
    );
    return { ...s, givers };
  }

  return { apply, startCeremony, snapshot, reset, toJSON };
}
