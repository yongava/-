// ตัวจำลองเหตุการณ์ไลฟ์ ไว้ทดสอบฉากโดยไม่ต้องเปิดไลฟ์จริง
// Fake live events for testing the scene without going live.

const NAMES = [
  'น้องฟ้า', 'พี่ต้น', 'มายด์', 'บอส', 'ป้าแดง', 'น้ำหวาน', 'กอล์ฟ', 'เจ๊หมวย', 'ต้นข้าว', 'ปาล์ม',
  'แพรวา', 'ลุงชัย', 'มะปราง', 'ไอซ์', 'เบียร์', 'ฝน', 'โอ๊ต', 'จูน', 'นุ่น', 'อาร์ม', 'ขวัญใจ',
  'ตาล', 'ภูมิ', 'แก้ม', 'เต้ย', 'พลอย', 'ก้อง', 'มิ้นท์', 'หนูดี', 'เอิร์ธ', 'ส้มโอ', 'เฟิร์น',
  'ครูเอ', 'แม่ค้าส้มตำ', 'พี่หมี', 'ใบเตย', 'กานต์', 'ปูเป้', 'ลูกหมี', 'นิว',
];

const SATHU = ['สาธุ 🙏', 'สาธุๆๆ', 'สาธุ 99', '🙏🙏🙏', 'สาธุค่ะ', 'สาธุครับ'];
const WISHES = [
  'ขอพร ให้ค้าขายดี ลูกค้าเยอะ',
  'ขอให้สอบผ่านเทอมนี้',
  'ขอให้ครอบครัวสุขภาพแข็งแรง',
  'อธิษฐาน ขอให้งานใหม่ราบรื่น',
  'ขอพร ให้ผ่านอุปสรรคไปได้',
  'ขอให้ได้งานที่ดี',
  'ขอพร ให้คุณแม่หายป่วยไวๆ',
  'ขอให้ร้านใหม่เปิดแล้วรุ่ง',
];
const OTHER = [
  'มาร่วมบุญด้วยคนค่ะ', 'สวยมาก', 'องค์ท่านงามมาก', 'เข้ามาไหว้ค่ะ', 'โอม ศรี คเณศายะ นะมะห์',
  'จุดธูป', 'จุดธูปถวายค่ะ', 'สวัสดีทุกคน', 'ไลฟ์ทุกวันเลยนะ', 'ขนลุกเลย',
];

export const GIFT_TIERS = {
  small: [{ name: 'Rose', diamonds: 1 }, { name: 'TikTok', diamonds: 1 }, { name: 'Finger Heart', diamonds: 5 }],
  medium: [{ name: 'Perfume', diamonds: 20 }, { name: 'Doughnut', diamonds: 30 }, { name: 'Hand Hearts', diamonds: 100 }],
  large: [{ name: 'Corgi', diamonds: 299 }, { name: 'Money Gun', diamonds: 500 }],
  huge: [{ name: 'Galaxy', diamonds: 1000 }, { name: 'Lion', diamonds: 29999 }],
};

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function createSim() {
  const users = NAMES.map((name, i) => ({ id: `sim-${i}`, name, avatar: '' }));
  const joined = [];
  let n = 0;

  function someone() {
    if (joined.length === 0) return join().user;
    return pick(joined);
  }

  function join() {
    const fresh = users.filter((u) => !joined.includes(u));
    let user;
    if (fresh.length) user = pick(fresh);
    else user = { id: `sim-x${n++}`, name: pick(NAMES) + (n % 9), avatar: '' };
    joined.push(user);
    return { type: 'join', user, sim: true };
  }

  const BY_KIND = {
    sathu: SATHU,
    wish: WISHES,
    incense: ['จุดธูป', 'จุดธูปถวายค่ะ'],
    fortune: ['เซียมซี', 'ขอเสี่ยงเซียมซีค่ะ'],
    bell: ['ตีระฆัง', 'ตีระฆัง 🔔'],
    om: ['โอม ศรี คเณศายะ นะมะห์', 'โอม'],
  };
  function chat(kind) {
    let pool = BY_KIND[kind];
    if (!pool) {
      const r = Math.random();
      pool = r < 0.42 ? SATHU : r < 0.62 ? WISHES : r < 0.72 ? BY_KIND.fortune : r < 0.8 ? BY_KIND.bell : OTHER;
    }
    return { type: 'chat', user: someone(), text: pick(pool), sim: true };
  }

  function gift(tier) {
    const r = Math.random();
    const t = tier || (r < 0.72 ? 'small' : r < 0.93 ? 'medium' : r < 0.99 ? 'large' : 'huge');
    const g = pick(GIFT_TIERS[t]);
    const count = t === 'small' ? pick([1, 1, 3, 5, 10]) : 1;
    return { type: 'gift', user: someone(), gift: { ...g, count, image: '' }, sim: true };
  }

  function like() {
    return { type: 'like', user: someone(), likes: pick([3, 5, 8, 12, 15]), sim: true };
  }

  function make(type, opt) {
    switch (type) {
      case 'join': return join();
      case 'chat': return chat(opt);
      case 'gift': return gift(opt);
      case 'like': return like();
      case 'follow': return { type: 'follow', user: someone(), sim: true };
      case 'share': return { type: 'share', user: someone(), sim: true };
      default: return chat();
    }
  }

  function next() {
    const r = Math.random();
    if (joined.length < 8 || r < 0.2) return join();
    if (r < 0.58) return chat();
    if (r < 0.76) return like();
    if (r < 0.95) return gift();
    if (r < 0.985) return make('follow');
    return make('share');
  }

  return { next, make, join };
}
