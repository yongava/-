// เครื่องเล่นเสียงพูด: เข้าคิวตามความสำคัญ ข้ามประโยคที่เก่าเกินไป
// Voice queue: highest priority first, drops stale lines, falls back to the browser's Thai voice.

export function createVoice({ getSettings, resolve, onSpeaking = () => {} }) {
  const queue = [];
  let busy = false;
  let audio = null;

  function say(item) {
    if (!item || !item.text) return;
    if (!getSettings().voiceEnabled) return;
    queue.push(item);
    queue.sort((a, b) => b.priority - a.priority || a.t - b.t);
    // คิวยาวเกินไป: ทิ้งประโยคที่สำคัญน้อยที่สุด
    while (queue.length > 6) queue.pop();
    if (!busy) next();
  }

  function stale(it) {
    const age = Date.now() - it.t;
    return age > (it.priority >= 3 ? 90000 : it.priority >= 2 ? 45000 : 25000);
  }

  async function next() {
    const it = queue.shift();
    if (!it) { busy = false; onSpeaking(false); return; }
    if (stale(it)) { next(); return; }
    busy = true;
    onSpeaking(true, it);
    const url = resolve(it);
    const ok = url ? await playUrl(url) : false;
    if (!ok) await speakBrowser(it.text);
    setTimeout(next, 350);
  }

  function playUrl(url) {
    return new Promise((resolveP) => {
      audio = new Audio(url);
      audio.volume = Math.max(0, Math.min(1, (Number(getSettings().voiceVolume) || 0) / 100));
      let done = false;
      let timer = 0;
      const finish = (ok) => { if (!done) { done = true; clearTimeout(timer); resolveP(ok); } };
      // กันคิวค้าง: โหลดไม่เสร็จใน 12 วินาที หรือเล่นเกินความยาวเสียง 3 วินาที ให้ข้ามไป
      timer = setTimeout(() => finish(false), 12000);
      audio.onloadedmetadata = () => {
        clearTimeout(timer);
        const ms = Number.isFinite(audio.duration) ? audio.duration * 1000 + 3000 : 20000;
        timer = setTimeout(() => finish(true), ms);
      };
      audio.onended = () => finish(true);
      audio.onerror = () => finish(false);
      audio.play().catch(() => finish(false));
    });
  }

  function speakBrowser(text) {
    return new Promise((resolveP) => {
      const synth = window.speechSynthesis;
      if (!synth) { resolveP(); return; }
      const voice = synth.getVoices().find((v) => /^th/i.test(v.lang));
      if (!voice) { resolveP(); return; }
      const u = new SpeechSynthesisUtterance(text);
      u.voice = voice;
      u.lang = voice.lang;
      u.volume = Math.max(0, Math.min(1, (Number(getSettings().voiceVolume) || 0) / 100));
      u.onend = () => resolveP();
      u.onerror = () => resolveP();
      synth.speak(u);
      setTimeout(resolveP, 20000);
    });
  }

  function stop() {
    queue.length = 0;
    if (audio) audio.pause();
    window.speechSynthesis?.cancel();
  }

  return { say, stop };
}

// ลิงก์เสียงจากโปรแกรม (สังเคราะห์และเก็บแคชไว้ที่เครื่อง)
export function serverVoiceUrl(settings, text) {
  const q = new URLSearchParams({ text, voice: settings.voiceName, rate: settings.voiceRate });
  return `/api/tts?${q}`;
}
