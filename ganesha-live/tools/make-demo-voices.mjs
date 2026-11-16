// สร้างไฟล์เสียงพูดแบบไม่ระบุชื่อ สำหรับหน้าตัวอย่างที่ไม่มีโปรแกรมรันอยู่
// Usage: node tools/make-demo-voices.mjs <output-dir> [voice]
// Writes <key>.mp3 for every anonymous line and prints the list of keys as JSON.
import fs from 'node:fs';
import path from 'node:path';
import msedge from 'msedge-tts';
import { FORTUNES } from '../public/js/game.js';
import { ANON_LINES } from '../public/js/lines.js';

const { MsEdgeTTS, OUTPUT_FORMAT } = msedge;
const out = process.argv[2];
const voice = process.argv[3] || 'th-TH-PremwadeeNeural';
if (!out) {
  console.error('usage: node tools/make-demo-voices.mjs <output-dir> [voice]');
  process.exit(1);
}
fs.mkdirSync(out, { recursive: true });

const lines = { ...ANON_LINES };
FORTUNES.forEach((text, i) => { lines[`fortune_${i + 1}`] = `เซียมซีใบที่ ${i + 1} ${text}`; });

let tts = null;
async function synth(text) {
  if (!tts) {
    tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  }
  const { audioStream } = tts.toStream(text, { rate: '0%' });
  const chunks = [];
  for await (const c of audioStream) chunks.push(c);
  return Buffer.concat(chunks);
}
for (const [key, text] of Object.entries(lines)) {
  const file = path.join(out, `${key}.mp3`);
  if (fs.existsSync(file) && fs.statSync(file).size > 2000) continue;
  for (let attempt = 1; ; attempt++) {
    try {
      fs.writeFileSync(file, await synth(text));
      break;
    } catch (err) {
      try { tts?.close(); } catch { /* ignore */ }
      tts = null;
      if (attempt >= 4) throw new Error(`${key}: ${err.message}`);
    }
  }
}
try { tts?.close(); } catch { /* ignore */ }
console.log(JSON.stringify(Object.keys(lines)));
