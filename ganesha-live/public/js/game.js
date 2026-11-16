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
  sound: true,
  bannedWords: [],
  deityImage: '',
};

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
  if (/จุดธูป|ถวายธูป/.test(t)) return { kind: 'incense' };
  if (/สาธุ|🙏/.test(t)) return { kind: 'sathu' };
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
  const s = { points: 0, round: 1, totalCoins: 0, likes: 0, givers: {}, wishes: [], ...(saved || {}) };
  const lastComment = new Map();

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

  function apply(ev) {
    const cfg = getSettings();
    const out = { ...ev, t: Date.now(), user: cleanUser(ev.user) };
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
        if (c.kind !== 'chat') {
          const last = lastComment.get(out.user.id) || 0;
          if (out.t - last > 8000) {
            pts = cfg.pointsPerComment;
            lastComment.set(out.user.id, out.t);
          }
        }
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
        const g = s.givers[out.user.id] || { name: out.user.name, avatar: out.user.avatar, coins: 0 };
        g.name = out.user.name;
        if (out.user.avatar) g.avatar = out.user.avatar;
        g.coins += coins;
        s.givers[out.user.id] = g;
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

  function snapshot() {
    const top = Object.values(s.givers)
      .sort((a, b) => b.coins - a.coins)
      .slice(0, 5)
      .map(({ name, avatar, coins }) => ({ name, avatar, coins }));
    return {
      points: s.points,
      goal: Math.max(1, Math.floor(getSettings().goal) || 1),
      round: s.round,
      totalCoins: s.totalCoins,
      likes: s.likes,
      top,
      wishes: s.wishes.slice(0, 5),
    };
  }

  function reset() {
    Object.assign(s, { points: 0, round: 1, totalCoins: 0, likes: 0, givers: {}, wishes: [] });
    lastComment.clear();
  }

  function toJSON() {
    // เก็บเฉพาะผู้ร่วมถวาย 300 อันดับแรก ไม่ให้ไฟล์โตเกินไป
    const givers = Object.fromEntries(
      Object.entries(s.givers).sort((a, b) => b[1].coins - a[1].coins).slice(0, 300),
    );
    return { ...s, givers };
  }

  return { apply, snapshot, reset, toJSON };
}
