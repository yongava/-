// องค์พระพิฆเนศแบบเวกเตอร์ (รูปปั้นทองคำ) พร้อมส่วนที่ขยับได้
// Vector golden Ganesha. Parts with ids are animated by scene.js:
//   gn-trunk, gn-ears-l/r, gn-bless-glow, gn-modaks (sweets in the bowl), gn-garlands, gn-halo

function haloPetals() {
  let s = '';
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const x = 220 + Math.cos(a) * 138;
    const y = 150 + Math.sin(a) * 138;
    const deg = (a * 180) / Math.PI + 90;
    s += `<path d="M0 -12 C6 -4 6 4 0 9 C-6 4 -6 -4 0 -12 Z" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${deg.toFixed(1)})"/>`;
  }
  return s;
}

const EAR = `
  <path d="M182 100 C150 70 102 72 86 104 C74 130 78 170 96 190 C114 210 150 214 178 200 Z" fill="url(#gn-skin-ear)" stroke="#8f5a0c" stroke-opacity=".55" stroke-width="1.5"/>
  <path d="M170 112 C146 96 116 100 106 122 C98 142 102 172 116 186 C132 198 156 198 168 190 Z" fill="#c4851e" opacity=".55"/>
  <path d="M92 120 C88 140 90 166 104 182" stroke="#fff1c0" stroke-opacity=".5" stroke-width="3" fill="none" stroke-linecap="round"/>
  <circle cx="150" cy="206" r="6" fill="url(#gn-ruby)"/>
  <path d="M150 212 L146 226 L154 226 Z" fill="url(#gn-gold)"/>`;

export const GANESHA_SVG = `
<svg class="ganesha" viewBox="0 0 440 460" aria-hidden="true">
  <defs>
    <linearGradient id="gn-gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff4c4"/><stop offset=".3" stop-color="#f6c955"/>
      <stop offset=".68" stop-color="#d99a26"/><stop offset="1" stop-color="#9a620d"/>
    </linearGradient>
    <linearGradient id="gn-gold-v" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#b87a16"/><stop offset=".35" stop-color="#ffe7a0"/>
      <stop offset=".7" stop-color="#e3a432"/><stop offset="1" stop-color="#9a620d"/>
    </linearGradient>
    <radialGradient id="gn-skin" cx=".4" cy=".35" r=".75">
      <stop offset="0" stop-color="#fff3c8"/><stop offset=".42" stop-color="#f3c450"/>
      <stop offset=".85" stop-color="#c98a1d"/><stop offset="1" stop-color="#8f5a0c"/>
    </radialGradient>
    <radialGradient id="gn-skin-ear" cx=".7" cy=".4" r=".8">
      <stop offset="0" stop-color="#ffe9a8"/><stop offset=".6" stop-color="#e0a232"/><stop offset="1" stop-color="#94600f"/>
    </radialGradient>
    <linearGradient id="gn-limb" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffe7a0"/><stop offset=".55" stop-color="#e8ae3c"/><stop offset="1" stop-color="#a86d12"/>
    </linearGradient>
    <linearGradient id="gn-red" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#d42a40"/><stop offset="1" stop-color="#6e0a18"/>
    </linearGradient>
    <radialGradient id="gn-ruby" cx=".35" cy=".35" r=".7">
      <stop offset="0" stop-color="#ff9aa8"/><stop offset=".5" stop-color="#e0243e"/><stop offset="1" stop-color="#8a0c20"/>
    </radialGradient>
    <radialGradient id="gn-emerald" cx=".35" cy=".35" r=".7">
      <stop offset="0" stop-color="#9ff5cc"/><stop offset=".5" stop-color="#1fae74"/><stop offset="1" stop-color="#0a5a3a"/>
    </radialGradient>
    <linearGradient id="gn-ivory" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fffdf5"/><stop offset="1" stop-color="#d9c79e"/>
    </linearGradient>
    <linearGradient id="gn-steel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f4f8fb"/><stop offset="1" stop-color="#7d8d99"/>
    </linearGradient>
    <radialGradient id="gn-glow">
      <stop offset="0" stop-color="#fffbe6" stop-opacity="1"/><stop offset=".35" stop-color="#ffd76a" stop-opacity=".8"/>
      <stop offset="1" stop-color="#ffb02e" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="gn-halo-fill">
      <stop offset="0" stop-color="#ffe6a0" stop-opacity=".55"/><stop offset=".7" stop-color="#f2a93a" stop-opacity=".18"/>
      <stop offset="1" stop-color="#f2a93a" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- halo -->
  <g id="gn-halo">
    <circle cx="220" cy="150" r="132" fill="url(#gn-halo-fill)"/>
    <circle cx="220" cy="150" r="126" fill="none" stroke="url(#gn-gold)" stroke-width="5"/>
    <circle cx="220" cy="150" r="116" fill="none" stroke="#ffd772" stroke-opacity=".45" stroke-width="2" stroke-dasharray="3 7"/>
    <g fill="url(#gn-gold)">${haloPetals()}</g>
  </g>

  <!-- ears -->
  <g id="gn-ears-l" class="gn-ear">${EAR}</g>
  <g id="gn-ears-r" class="gn-ear"><g transform="matrix(-1 0 0 1 440 0)">${EAR}</g></g>

  <!-- upper arms with axe (viewer's left) and lotus (viewer's right) -->
  <g id="gn-arm-axe">
    <path d="M58 246 L58 104" stroke="#7a4a1c" stroke-width="7" stroke-linecap="round"/>
    <path d="M58 110 C32 98 14 118 20 144 C32 134 46 132 60 136 Z" fill="url(#gn-steel)" stroke="#5d6b75" stroke-width="1.5"/>
    <path d="M162 238 L96 246 L60 196" stroke="url(#gn-limb)" stroke-width="24" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M124 237 L125 255" stroke="url(#gn-gold)" stroke-width="9" stroke-linecap="round"/>
    <path d="M62 214 L80 204" stroke="#e0243e" stroke-width="6" stroke-linecap="round"/>
    <circle cx="59" cy="186" r="13" fill="url(#gn-limb)" stroke="#8f5a0c" stroke-opacity=".5"/>
  </g>
  <g id="gn-arm-lotus">
    <path d="M382 186 C384 160 386 140 386 120" stroke="#2e7d4f" stroke-width="5" fill="none" stroke-linecap="round"/>
    <g stroke="#fff0c0" stroke-width="1.2">
      <path d="M386 118 C372 110 368 94 374 82 C382 90 388 104 386 118 Z" fill="#f08aa8"/>
      <path d="M386 118 C400 110 404 94 398 82 C390 90 384 104 386 118 Z" fill="#f08aa8"/>
      <path d="M386 118 C378 104 378 84 386 70 C394 84 394 104 386 118 Z" fill="#ffb8cc"/>
      <path d="M386 120 C370 120 360 112 358 102 C370 104 380 110 386 120 Z" fill="#e0688c"/>
      <path d="M386 120 C402 120 412 112 414 102 C402 104 392 110 386 120 Z" fill="#e0688c"/>
    </g>
    <path d="M278 238 L344 246 L380 196" stroke="url(#gn-limb)" stroke-width="24" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M316 237 L315 255" stroke="url(#gn-gold)" stroke-width="9" stroke-linecap="round"/>
    <path d="M378 214 L360 204" stroke="#e0243e" stroke-width="6" stroke-linecap="round"/>
    <circle cx="381" cy="186" r="13" fill="url(#gn-limb)" stroke="#8f5a0c" stroke-opacity=".5"/>
  </g>

  <!-- dhoti and seated legs -->
  <path d="M126 346 C112 380 112 424 150 444 L290 444 C328 424 328 380 314 346 C280 370 160 370 126 346 Z" fill="url(#gn-red)"/>
  <path d="M130 424 C180 444 260 444 310 424" stroke="url(#gn-gold)" stroke-width="7" fill="none"/>
  <path d="M170 380 C190 404 196 424 194 440 M270 380 C250 404 244 424 246 440 M220 372 L220 440" stroke="#4a0610" stroke-opacity=".45" stroke-width="2" fill="none"/>
  <ellipse cx="176" cy="436" rx="24" ry="10" fill="url(#gn-limb)"/>
  <ellipse cx="264" cy="436" rx="24" ry="10" fill="url(#gn-limb)"/>

  <!-- torso and belly -->
  <path d="M148 238 C148 214 182 204 220 204 C258 204 292 214 292 238 L300 304 L140 304 Z" fill="url(#gn-skin)"/>
  <ellipse cx="220" cy="314" rx="82" ry="70" fill="url(#gn-skin)" stroke="#8f5a0c" stroke-opacity=".45" stroke-width="1.5"/>
  <ellipse cx="196" cy="292" rx="34" ry="22" fill="#fff8dc" opacity=".28"/>
  <ellipse cx="220" cy="326" rx="5" ry="6" fill="#b07818"/><ellipse cx="220" cy="327" rx="2.6" ry="3.4" fill="#7a4a0c"/>
  <path d="M168 222 C196 270 244 322 290 352" stroke="#fff6d8" stroke-width="3" fill="none"/>
  <path d="M140 348 C180 370 260 370 300 348 L302 362 C260 384 180 384 138 362 Z" fill="url(#gn-gold)" stroke="#8f5a0c" stroke-opacity=".5"/>
  <circle cx="220" cy="372" r="7" fill="url(#gn-ruby)"/>
  <circle cx="180" cy="366" r="4.5" fill="url(#gn-emerald)"/>
  <circle cx="260" cy="366" r="4.5" fill="url(#gn-emerald)"/>

  <!-- necklace and garlands -->
  <path d="M172 220 Q220 266 268 220" stroke="url(#gn-gold)" stroke-width="7" fill="none" stroke-linecap="round"/>
  <path d="M184 226 Q220 252 256 226" stroke="#e0243e" stroke-width="3" stroke-dasharray="2 6" fill="none" stroke-linecap="round"/>
  <path d="M220 244 L210 258 L220 272 L230 258 Z" fill="url(#gn-gold)" stroke="#8f5a0c" stroke-opacity=".5"/>
  <circle cx="220" cy="258" r="5" fill="url(#gn-ruby)"/>
  <g id="gn-garlands"></g>

  <!-- lower right arm: blessing hand (abhaya mudra) -->
  <g id="gn-arm-bless">
    <circle id="gn-bless-glow" cx="112" cy="236" r="58" fill="url(#gn-glow)" opacity="0"/>
    <path d="M156 248 L118 312 L112 270" stroke="url(#gn-limb)" stroke-width="25" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M128 286 L148 298" stroke="url(#gn-gold)" stroke-width="7" stroke-linecap="round"/>
    <path d="M100 274 L124 274" stroke="#e0243e" stroke-width="6" stroke-linecap="round"/>
    <g fill="url(#gn-limb)" stroke="#8f5a0c" stroke-opacity=".55" stroke-width="1.2">
      <rect x="96" y="206" width="8" height="26" rx="4"/>
      <rect x="104" y="200" width="8" height="30" rx="4"/>
      <rect x="112" y="202" width="8" height="30" rx="4"/>
      <rect x="120" y="208" width="8" height="26" rx="4"/>
      <path d="M94 228 L130 228 C132 248 126 264 112 266 C98 264 92 248 94 228 Z"/>
      <path d="M128 240 C138 234 142 226 140 220 C134 220 128 228 126 236 Z"/>
    </g>
    <circle cx="112" cy="246" r="5" fill="url(#gn-ruby)"/>
  </g>

  <!-- lower left arm holding a bowl of sweets -->
  <g id="gn-arm-bowl">
    <path d="M284 248 L322 312 L300 304" stroke="url(#gn-limb)" stroke-width="25" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M312 286 L292 298" stroke="url(#gn-gold)" stroke-width="7" stroke-linecap="round"/>
    <ellipse cx="300" cy="306" rx="18" ry="10" fill="url(#gn-limb)"/>
    <path d="M264 286 Q300 326 336 286 Z" fill="url(#gn-gold)" stroke="#8f5a0c" stroke-opacity=".6"/>
    <g id="gn-modaks" stroke="#b5600c" stroke-width="1.2">
      <circle cx="286" cy="280" r="9" fill="#f7a828"/>
      <circle cx="302" cy="279" r="9" fill="#f5a020"/>
      <circle cx="318" cy="281" r="9" fill="#f7a828"/>
      <circle cx="294" cy="268" r="9" fill="#ffb53a"/>
      <circle cx="310" cy="268" r="9" fill="#f5a020"/>
    </g>
    <ellipse cx="300" cy="287" rx="36" ry="6" fill="none" stroke="url(#gn-gold)" stroke-width="4"/>
  </g>

  <!-- head -->
  <path d="M156 128 C154 82 286 82 284 128 C284 168 266 192 248 202 L192 202 C174 192 156 168 156 128 Z" fill="url(#gn-skin)" stroke="#8f5a0c" stroke-opacity=".45" stroke-width="1.5"/>
  <ellipse cx="214" cy="112" rx="42" ry="16" fill="#fff8dc" opacity=".25"/>
  <path d="M170 168 C180 186 196 196 206 198 M270 168 C260 186 244 196 234 198" stroke="#9a620d" stroke-opacity=".4" stroke-width="2" fill="none"/>

  <!-- eyes, brows, tilak -->
  <g id="gn-eyes">
    <path d="M174 132 Q190 122 206 130" stroke="#7a4a0c" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M234 130 Q250 122 266 132" stroke="#7a4a0c" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M178 144 Q191 134 204 144 Q191 151 178 144 Z" fill="#fffaf0"/>
    <path d="M236 144 Q249 134 262 144 Q249 151 236 144 Z" fill="#fffaf0"/>
    <circle cx="192" cy="143.5" r="4.6" fill="#2a1406"/>
    <circle cx="248" cy="143.5" r="4.6" fill="#2a1406"/>
    <circle cx="193.6" cy="142" r="1.5" fill="#fff"/>
    <circle cx="249.6" cy="142" r="1.5" fill="#fff"/>
    <path d="M177 143 Q191 133 205 143 M235 143 Q249 133 263 143" stroke="#7a4a0c" stroke-width="2" fill="none"/>
  </g>
  <path d="M220 100 C213 110 213 120 220 128 C227 120 227 110 220 100 Z" fill="#d4243b"/>
  <circle cx="220" cy="116" r="2.6" fill="#fff1b8"/>

  <!-- tusks -->
  <path d="M202 184 C194 190 190 198 191 206 L199 205 C198 198 201 192 207 188 Z" fill="url(#gn-ivory)" stroke="#a89060" stroke-width="1"/>
  <path d="M238 184 C252 194 262 212 262 232 C256 224 248 210 234 194 Z" fill="url(#gn-ivory)" stroke="#a89060" stroke-width="1"/>

  <!-- trunk -->
  <g id="gn-trunk">
    <path d="M205 172 C200 204 202 234 222 256 C237 272 262 276 277 263 C287 254 288 242 280 237 C273 233 267 240 270 247 C265 253 250 254 240 244 C230 232 231 204 235 172 C234 158 226 150 220 150 C214 150 206 158 205 172 Z" fill="url(#gn-gold-v)"/>
    <path d="M205 178 C200 206 202 234 222 256 C237 272 262 276 277 263 C287 254 288 242 280 237 C273 233 267 240 270 247 C265 253 250 254 240 244 C230 232 231 206 235 178" stroke="#8f5a0c" stroke-opacity=".5" stroke-width="1.5" fill="none"/>
    <g stroke="#9a620d" stroke-opacity=".45" stroke-width="1.6" fill="none">
      <path d="M205 188 Q220 193 234 188"/><path d="M205 200 Q220 205 233 200"/>
      <path d="M206 212 Q219 217 232 212"/><path d="M208 224 Q220 229 232 224"/>
      <path d="M213 236 Q223 241 234 236"/>
    </g>
  </g>

  <!-- crown -->
  <g id="gn-crown" stroke="#8f5a0c" stroke-opacity=".6" stroke-width="1.2">
    <path d="M150 96 C140 84 142 72 152 66 C154 78 160 86 168 90 Z" fill="url(#gn-gold)"/>
    <path d="M290 96 C300 84 298 72 288 66 C286 78 280 86 272 90 Z" fill="url(#gn-gold)"/>
    <path d="M182 58 L258 58 L272 86 L168 86 Z" fill="url(#gn-gold)"/>
    <path d="M196 34 L244 34 L256 58 L184 58 Z" fill="url(#gn-gold)"/>
    <path d="M206 16 L234 16 L242 34 L198 34 Z" fill="url(#gn-gold)"/>
    <path d="M220 0 C213 7 211 12 214 16 L226 16 C229 12 227 7 220 0 Z" fill="url(#gn-gold)"/>
    <path d="M158 102 Q220 80 282 102 L278 86 Q220 68 162 86 Z" fill="url(#gn-gold)"/>
    <circle cx="220" cy="83" r="7.5" fill="url(#gn-ruby)"/>
    <circle cx="190" cy="89" r="5" fill="url(#gn-emerald)"/>
    <circle cx="250" cy="89" r="5" fill="url(#gn-emerald)"/>
    <circle cx="220" cy="70" r="6" fill="url(#gn-ruby)"/>
    <circle cx="220" cy="46" r="5" fill="url(#gn-emerald)"/>
    <circle cx="220" cy="25" r="4" fill="url(#gn-ruby)"/>
  </g>
</svg>`;

// พวงมาลัยคล้องคอองค์พระ (เพิ่มได้หลายชั้น)
export function garlandSVG(layer) {
  const drop = 34 + layer * 14;
  const w = 58 + layer * 6;
  let s = '';
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const x = 220 - w + 2 * w * t;
    const y = 214 + layer * 4 + drop * Math.sin(Math.PI * t);
    const colors = layer % 2 ? ['#ffffff', '#f6e7c8'] : ['#f28c18', '#ffc21a'];
    s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="${colors[i % 2]}" stroke="#b5600c" stroke-opacity=".35"/>`;
  }
  const by = 214 + layer * 4 + drop;
  s += `<path d="M214 ${by + 4} L220 ${by + 24} L226 ${by + 4} Z" fill="#d94a2b"/>`;
  return s;
}

// ตำแหน่งขนมลาดูที่เพิ่มในชามทีละลูก
export const MODAK_SLOTS = [
  [302, 257], [286, 258], [318, 259], [294, 247], [310, 247], [302, 237], [278, 270], [326, 271], [302, 227],
];
