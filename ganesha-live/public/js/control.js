// หน้าควบคุม: เชื่อมต่อไลฟ์ ทดสอบฉาก และตั้งค่า
const $ = (sel) => document.querySelector(sel);
const base = `${location.protocol}//${location.host}`;
$('#sceneUrl').textContent = `${base}/scene.html`;
$('#sceneUrlClear').textContent = `${base}/scene.html?bg=0`;
$('#preview').src = 'scene.html?preview=1';

let ws = null;
function cmd(msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }

function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onopen = () => setConn(true);
  ws.onclose = () => { setConn(false); setTimeout(connect, 2000); };
  ws.onmessage = (m) => {
    let msg;
    try { msg = JSON.parse(m.data); } catch { return; }
    if (msg.type === 'hello') {
      fillSettings(msg.settings);
      showStatus(msg.status);
      $('#log').replaceChildren();
      (msg.log || []).forEach(addLog);
      if (msg.settings.username && !$('#username').value) $('#username').value = `@${msg.settings.username}`;
    } else if (msg.type === 'status') showStatus(msg.status);
    else if (msg.type === 'log') addLog(msg.line);
    else if (msg.type === 'settings') fillSettings(msg.settings);
  };
}

function setConn(ok) {
  const p = $('#conn');
  p.textContent = ok ? 'โปรแกรมทำงานอยู่' : 'ติดต่อโปรแกรมไม่ได้ — เปิดโปรแกรมไว้หรือยัง?';
  p.className = `pill ${ok ? 'ok' : 'bad'}`;
}

function showStatus(st) {
  $('#dot').className = `dot ${st.state}`;
  $('#statusText').textContent = st.message;
  $('#viewers').textContent = st.state === 'connected' && st.viewers ? `· ผู้ชม ${st.viewers.toLocaleString()} คน` : '';
  $('#autoSim').checked = Boolean(st.autoSim);
}

function addLog(line) {
  const ol = $('#log');
  const li = document.createElement('li');
  li.textContent = line;
  ol.prepend(li);
  while (ol.children.length > 120) ol.lastChild.remove();
}

let editing = false;
function fillSettings(s) {
  if (editing) return;
  const f = $('#settingsForm');
  for (const el of f.elements) {
    if (!el.name || !(el.name in s)) continue;
    if (el.type === 'checkbox') el.checked = Boolean(s[el.name]);
    else if (Array.isArray(s[el.name])) el.value = s[el.name].join(', ');
    else el.value = s[el.name];
  }
  $('#deityMsg').textContent = s.deityImage ? 'ใส่รูปแล้ว' : 'ยังไม่ได้ใส่รูป (แสดง ॐ)';
}

$('#settingsForm').addEventListener('focusin', () => { editing = true; });
$('#settingsForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const out = {};
  for (const el of f.elements) {
    if (!el.name) continue;
    out[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  }
  editing = false;
  cmd({ cmd: 'settings', settings: out });
  $('#saved').textContent = 'บันทึกแล้ว ✓';
  setTimeout(() => { $('#saved').textContent = ''; }, 2500);
});

$('#connectForm').addEventListener('submit', (e) => {
  e.preventDefault();
  cmd({ cmd: 'connect', username: $('#username').value });
});
$('#disconnect').addEventListener('click', () => cmd({ cmd: 'disconnect' }));

document.querySelectorAll('[data-sim]').forEach((b) => {
  b.addEventListener('click', () => cmd({ cmd: 'sim', kind: b.dataset.sim, option: b.dataset.opt }));
});
$('#autoSim').addEventListener('change', (e) => cmd({ cmd: 'autoSim', on: e.target.checked }));

$('#reset').addEventListener('click', () => {
  if (confirm('รีเซ็ตพลังศรัทธาและอันดับผู้ร่วมถวายทั้งหมด?')) cmd({ cmd: 'reset' });
});

document.querySelectorAll('[data-copy]').forEach((b) => {
  b.addEventListener('click', async () => {
    const text = $(`#${b.dataset.copy}`).textContent;
    try { await navigator.clipboard.writeText(text); b.textContent = 'คัดลอกแล้ว ✓'; }
    catch { b.textContent = 'คัดลอกเองนะ'; }
    setTimeout(() => { b.textContent = 'คัดลอก'; }, 2000);
  });
});

$('#deityFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  $('#deityMsg').textContent = 'กำลังอัปโหลด…';
  const res = await fetch('/api/deity-image', { method: 'POST', headers: { 'Content-Type': file.type }, body: file }).catch(() => null);
  $('#deityMsg').textContent = res && res.ok ? 'ใส่รูปแล้ว ✓' : `ใส่รูปไม่สำเร็จ ${res ? await res.text() : ''}`;
  e.target.value = '';
});
$('#deityRemove').addEventListener('click', async () => {
  await fetch('/api/deity-image', { method: 'DELETE' }).catch(() => null);
});

connect();
