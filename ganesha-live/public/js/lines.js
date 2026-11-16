// บทพูดภาษาไทย และตัวตัดสินว่าจะพูดอะไรเมื่อไร
// Thai speech lines + an announcer that rate-limits what gets spoken. Shared by server.js and demo mode.
import { clip } from './game.js';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ชื่อสำหรับอ่านออกเสียง: ตัดอีโมจิและสัญลักษณ์ทิ้ง
export function speechName(name) {
  const cleaned = String(name || '')
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return clip(cleaned, 20).replace('…', '') || 'ผู้มีจิตศรัทธา';
}
function speechText(text, max) {
  return clip(String(text || '').replace(/[^\p{L}\p{N}\p{M}\s.,!?*]/gu, ' ').replace(/\*+/g, ' ').replace(/\s+/g, ' ').trim(), max).replace('…', '');
}

const GIFT_LINES = {
  marigold: ['ขอบคุณคุณ{n} ที่ร่วมถวายดอกดาวเรืองค่ะ', 'คุณ{n} ถวายดอกดาวเรือง สาธุค่ะ'],
  garland: ['คุณ{n} คล้องพวงมาลัยถวายองค์พระพิฆเนศ ขอบคุณค่ะ', 'ขอบคุณคุณ{n} ที่ร่วมคล้องพวงมาลัยถวายค่ะ'],
  laddu: ['คุณ{n} ถวายขนมลาดู ของโปรดขององค์พระพิฆเนศ ขอบคุณค่ะ', 'ขอบคุณคุณ{n} ที่ถวายขนมลาดูค่ะ องค์พระโปรดมากเลยค่ะ'],
  diya: ['คุณ{n} จุดประทีปบูชา ขอให้แสงสว่างนำทางชีวิตนะคะ'],
  fruit: ['ขอบพระคุณคุณ{n} ที่ถวายถาดผลไม้มงคลค่ะ'],
  grand: ['ขอบพระคุณคุณ{n} ที่ร่วมถวายพานบูชาทองคำ ขอเชิญทุกท่านร่วมสาธุพร้อมกันค่ะ'],
};

const WELCOME = [
  'ยินดีต้อนรับคุณ{n} ค่ะ พิมพ์ สาธุ เพื่อร่วมกราบไหว้องค์พระพิฆเนศได้เลยนะคะ',
  'สวัสดีค่ะคุณ{n} เชิญร่วมสักการะองค์พระพิฆเนศด้วยกันนะคะ',
  'ยินดีต้อนรับคุณ{n} ค่ะ พิมพ์ ขอพร ตามด้วยคำอธิษฐานได้เลยนะคะ',
];

export const IDLE_LINES = [
  'ใครยังไม่ได้ไหว้ พิมพ์ สาธุ ร่วมกราบไหว้องค์พระพิฆเนศได้เลยนะคะ',
  'อยากขอพรเรื่องไหน พิมพ์ ขอพร ตามด้วยคำอธิษฐาน แล้วคำอธิษฐานจะลอยไปถึงองค์พระค่ะ',
  'พิมพ์ เซียมซี เพื่อเสี่ยงเซียมซีองค์พระพิฆเนศได้เลยค่ะ',
  'พิมพ์ จุดธูป ร่วมจุดธูปบูชา หรือพิมพ์ ตีระฆัง ร่วมตีระฆังได้นะคะ',
];

// บทพูดแบบไม่ระบุชื่อ ใช้ในหน้าตัวอย่างที่อัดเสียงไว้ล่วงหน้า
export const ANON_LINES = {
  gift_marigold: 'ขอบคุณที่ร่วมถวายดอกดาวเรืองค่ะ ขอให้อุปสรรคผ่านพ้นนะคะ',
  gift_garland: 'ขอบคุณที่คล้องพวงมาลัยถวายองค์พระพิฆเนศค่ะ',
  gift_laddu: 'ขอบคุณที่ถวายขนมลาดู ของโปรดขององค์พระพิฆเนศค่ะ',
  gift_diya: 'ขอบคุณที่จุดประทีปบูชา ขอให้แสงสว่างนำทางชีวิตนะคะ',
  gift_fruit: 'ขอบพระคุณที่ถวายถาดผลไม้มงคลค่ะ',
  gift_grand: 'ขอบพระคุณที่ร่วมถวายพานบูชาทองคำ ขอเชิญทุกท่านร่วมสาธุพร้อมกันค่ะ',
  follow: 'ขอบคุณที่กดติดตามนะคะ',
  share: 'ขอบคุณที่ช่วยแชร์ไลฟ์นะคะ',
  wish: 'ขอให้คำอธิษฐานสมความปรารถนานะคะ',
  welcome: 'ยินดีต้อนรับค่ะ เชิญร่วมสักการะองค์พระพิฆเนศด้วยกันนะคะ',
  chant: 'ครบหนึ่งร้อยแปดครั้งแล้วค่ะ ขอบคุณทุกท่านที่ร่วมสาธุพร้อมกัน',
  ceremony: 'ครบพลังศรัทธาแล้วค่ะ ขอเชิญทุกท่านร่วมพิธีอารตีบูชาองค์พระพิฆเนศ โอม ศรี คเณศายะ นะมะห์',
  idle_0: IDLE_LINES[0],
  idle_1: IDLE_LINES[1],
  idle_2: IDLE_LINES[2],
  idle_3: IDLE_LINES[3],
};

export const QUICK_LINES = [
  'สวัสดีค่ะทุกคน ยินดีต้อนรับสู่ไลฟ์สักการะองค์พระพิฆเนศค่ะ',
  'ช่วยกันพิมพ์ สาธุ ให้ครบหนึ่งร้อยแปดครั้งนะคะ',
  'พิมพ์ ขอพร ตามด้วยคำอธิษฐาน แล้วคำอธิษฐานจะลอยไปถึงองค์พระค่ะ',
  'พิมพ์ เซียมซี เพื่อเสี่ยงเซียมซีได้เลยค่ะ',
  'ขอบคุณทุกท่านที่มาร่วมสักการะในวันนี้ค่ะ ขอให้ทุกคนมีความสุขนะคะ',
];

let nextId = 1;
function item(text, priority, key) {
  return { id: nextId++, text, priority, key, t: Date.now() };
}

export function createAnnouncer(getSettings, { anonymous = false } = {}) {
  let lastWelcome = 0;
  let lastActivity = Date.now();
  let lastIdle = Date.now();
  let idleIdx = 0;
  const lastWish = new Map();

  const fill = (tpl, ev) => tpl.replace('{n}', speechName(ev.user?.name));
  const say = (key, tpl, ev, priority) => item(anonymous ? ANON_LINES[key] : fill(tpl, ev), priority, key);

  function onEvent(ev, state) {
    const cfg = getSettings();
    const out = [];
    if (!cfg.voiceEnabled) return out;
    const now = Date.now();
    if (ev.type === 'chat' || ev.type === 'gift' || ev.type === 'follow' || ev.type === 'share') lastActivity = now;

    if (ev.type === 'gift' && cfg.speakGifts) {
      const key = ev.offering.key;
      let line = pick(GIFT_LINES[key]);
      if (!anonymous && key !== 'grand' && key !== 'diya') line += ` ${ev.blessing}นะคะ`;
      out.push(say(`gift_${key}`, line, ev, ev.big ? 3 : 2));
    }
    if (ev.type === 'follow' && cfg.speakGifts) out.push(say('follow', 'ขอบคุณคุณ{n} ที่กดติดตามนะคะ', ev, 2));
    if (ev.type === 'share' && cfg.speakGifts) out.push(say('share', 'ขอบคุณคุณ{n} ที่ช่วยแชร์ไลฟ์ ชวนเพื่อนมาร่วมสักการะด้วยกันนะคะ', ev, 2));

    if (ev.type === 'chat' && ev.kind === 'wish' && cfg.speakWishes) {
      const id = ev.user?.id;
      if (now - (lastWish.get(id) || 0) > 45000) {
        lastWish.set(id, now);
        const wish = speechText(ev.wish, 48);
        out.push(anonymous ? item(ANON_LINES.wish, 1, 'wish')
          : item(`คุณ${speechName(ev.user.name)} ขอพรว่า ${wish} ขอให้สมความปรารถนานะคะ`, 1, 'wish'));
      }
    }
    if (ev.type === 'chat' && ev.fortune) {
      const text = `${anonymous ? '' : `คุณ${speechName(ev.user.name)} ได้`}เซียมซีใบที่ ${ev.fortune.n} ${ev.fortune.text}`;
      out.push(item(text, 1, `fortune_${ev.fortune.n}`));
    }
    if (ev.chantDone) out.push(item(ANON_LINES.chant, 3, 'chant'));
    if (ev.ceremony) out.push(item(ANON_LINES.ceremony, 3, 'ceremony'));

    if (ev.firstSeen && cfg.speakWelcome && ev.type !== 'gift' && now - lastWelcome > 25000 && out.length === 0) {
      lastWelcome = now;
      out.push(say('welcome', pick(WELCOME), ev, 0));
    }
    return out;
  }

  // เรียกทุก ๆ ไม่กี่วินาที: ถ้าเงียบนานจะชวนคนดูมีส่วนร่วม
  function idle(state) {
    const cfg = getSettings();
    if (!cfg.voiceEnabled || !cfg.speakIdle) return null;
    const now = Date.now();
    const gap = Math.max(30, Number(cfg.idleSeconds) || 75) * 1000;
    if (now - lastActivity < gap || now - lastIdle < gap) return null;
    lastIdle = now;
    const i = idleIdx++ % (IDLE_LINES.length + 1);
    if (i === IDLE_LINES.length) {
      if (anonymous || !state) return item(ANON_LINES.idle_0, 0, 'idle_0');
      return item(`ช่วยกันพิมพ์ สาธุ ให้ครบ ${state.chantGoal} ครั้งนะคะ ตอนนี้ได้ ${state.chant} ครั้งแล้วค่ะ`, 0, 'idle_chant');
    }
    return item(IDLE_LINES[i], 0, `idle_${i}`);
  }

  function custom(text) {
    return item(speechText(text, 200), 3, 'custom');
  }

  return { onEvent, idle, custom };
}
