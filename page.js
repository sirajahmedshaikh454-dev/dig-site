// Runs in the generated page. Globals provided by cli.js: DATA, plus everything from strata.js.
const $ = id => document.getElementById(id);
const BONE = '#efe3c8', INK = '#2a1d12', RUST = '#d0612f';
const S = strata(DATA.files, DATA.now);
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
const cv = $('dig'), g = cv.getContext('2d'), card = $('card');
let W = 0, H = 0, bands = [], spots = [], rex = false;

// ---------- header, footer, ledger (all text via textContent, never innerHTML) ----------
document.title = 'Dig Site: ' + DATA.folder;
$('lede').textContent = 'Excavation of "' + DATA.folder + '". Every file is a fossil. Newest layers sit on top; whatever you stopped touching has sunk to the bottom.';
for (const [v, label] of [[S.total.toLocaleString('en-US'), 'fossils'], [humanSize(S.bytes), 'in the ground'], [S.oldest ? humanAge(S.oldest.age) : 'none', 'oldest find']]) {
  const d = el('div'); d.append(el('b', v), el('span', label)); $('stats').append(d);
}
const carbon = $('carbon');
if (S.oldest) {
  carbon.append(el('h2', 'Carbon-dating complete.'));
  carbon.append(el('p', 'The oldest fossil is ' + S.oldest.name + ', untouched for ' + humanAge(S.oldest.age) + '. The biggest boulder is ' + S.biggest.name + ' at ' + humanSize(S.biggest.size) + '.'));
} else carbon.append(el('h2', 'Nothing here but bare rock.'), el('p', 'The folder had no files to dig up.'));
$('note').textContent = DATA.skipped ? DATA.skipped + ' folder(s) could not be read and were skipped.' + (DATA.capped ? ' Scan stopped at the file limit.' : '') : (DATA.capped ? 'Scan stopped at the file limit.' : '');

function table(title, rows, col) {
  const t = el('table'), c = el('caption', title), h = el('tr');
  t.append(c);
  for (const x of ['File', col, 'Size']) h.append(el('th', x));
  t.append(h);
  for (const f of rows) { const r = el('tr'); r.append(el('td', f.name), el('td', col === 'Age' ? humanAge(f.age) : humanSize(f.size)), el('td', humanSize(f.size))); t.append(r); }
  return t;
}
const all = S.layers.flatMap(l => l.files);
$('ledger').append(
  table('25 oldest files', [...all].sort((a, b) => b.age - a.age).slice(0, 25), 'Age'),
  table('25 biggest files', [...all].sort((a, b) => b.size - a.size).slice(0, 25), 'Age'));

// ---------- seeded random so the same folder always looks the same ----------
function rng(seed) { let a = Math.floor(seed * 4294967296) >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const wave = (x, i) => Math.sin(x * 0.011 + i * 3) * 5 + Math.sin(x * 0.027 + i) * 3;

// ---------- layout: one band per layer, fossils placed without overlapping ----------
function build() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  W = Math.min(innerWidth, 1100);
  bands = []; spots = [];
  let y = 0;
  for (const l of S.layers) { const h = Math.round(Math.max(110, Math.min(460, 110 + Math.sqrt(l.files.length) * 26))); bands.push({ l, y0: y, y1: y + h }); y += h; }
  H = y;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px';
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (const b of bands) {
    const r0 = rng(seeded(b.l.id));
    b.grains = [];
    for (let i = 0; i < Math.min(b.l.files.length, 400); i++) b.grains.push([r0() * W, b.y0 + 12 + r0() * (b.y1 - b.y0 - 24)]);
    for (const f of b.l.files.slice(0, 70)) {
      const rnd = rng(seeded(f.path || f.name)), r = radiusFor(f.size, 5, W < 700 ? 22 : 32) * (rex && f === S.biggest ? 1.5 : 1);
      for (let tries = 0; tries < 30; tries++) {
        const x = r + 10 + rnd() * (W - 2 * r - 20), yy = b.y0 + r + 16 + rnd() * Math.max(1, b.y1 - b.y0 - 2 * r - 26);
        if (x < 210 && yy < b.y0 + 62) continue;                         // keep the layer label readable
        if (spots.some(s => (s.x - x) ** 2 + (s.y - yy) ** 2 < (s.r + r + 4) ** 2) && tries < 29) continue;
        spots.push({ x, y: yy, r, f }); break;
      }
    }
  }
  draw();
}

// ---------- drawing ----------
function texture(b, i) {
  const r = rng(seeded(b.l.id + 'tex')), top = b.y0 + 8, bot = b.y1 - 8;
  g.save(); g.beginPath(); g.rect(0, top, W, bot - top); g.clip();
  const n = Math.round(W * (bot - top) / 520);
  for (let k = 0; k < n; k++) {
    const x = r() * W, y = top + r() * (bot - top), dark = r() < 0.55;
    g.fillStyle = dark ? 'rgba(0,0,0,.2)' : 'rgba(255,240,210,.16)'; g.strokeStyle = g.fillStyle; g.lineWidth = 1;
    if (b.l.id === 'topsoil') g.fillRect(x, y, 2, 2);
    else if (b.l.id === 'loam') g.fillRect(x, y, 6 + r() * 8, 1.4);
    else if (b.l.id === 'clay') g.fillRect(x, y, 30 + r() * 50, 1);
    else if (b.l.id === 'sandstone') { g.beginPath(); g.arc(x, y, 1.1, 0, 7); g.fill(); }
    else if (b.l.id === 'limestone') { g.strokeRect(x, y, 26, 10); }
    else { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 12, y + 12); g.stroke(); }
  }
  g.restore();
}

function fossil(kind, x, y, r) {
  g.save(); g.translate(x, y); g.lineWidth = Math.max(1, r / 11); g.fillStyle = BONE; g.strokeStyle = INK; g.lineJoin = 'round'; g.lineCap = 'round';
  const dot = (cx, cy, rr) => { g.beginPath(); g.arc(cx, cy, rr, 0, 7); g.fill(); g.stroke(); };
  if (kind === 'archive') {                                   // ammonite: a coiled shell
    dot(0, 0, r); g.beginPath();
    for (let a = 0; a < 14; a += 0.15) { const rr = r * 0.1 + a * r * 0.062; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    g.stroke();
  } else if (kind === 'image') {                              // scallop shell with ribs
    g.beginPath(); g.moveTo(0, r * 0.55); g.arc(0, r * 0.55, r, Math.PI, 2 * Math.PI); g.closePath(); g.fill(); g.stroke();
    for (let i = -3; i <= 3; i++) { const a = Math.PI * 1.5 + i * 0.4; g.beginPath(); g.moveTo(0, r * 0.55); g.lineTo(Math.cos(a) * r, r * 0.55 + Math.sin(a) * r); g.stroke(); }
  } else if (kind === 'doc') {                                // fossil leaf with a midrib
    g.rotate(-0.6); g.beginPath(); g.ellipse(0, 0, r * 0.6, r, 0, 0, 7); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(0, -r); g.lineTo(0, r * 0.95); g.stroke();
    for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(0, i * r * 0.32); g.lineTo(r * 0.38, i * r * 0.32 - r * 0.2); g.moveTo(0, i * r * 0.32); g.lineTo(-r * 0.38, i * r * 0.32 - r * 0.2); g.stroke(); }
  } else if (kind === 'code') {                               // trilobite: segmented oval
    g.beginPath(); g.ellipse(0, 0, r * 0.72, r, 0, 0, 7); g.fill(); g.stroke();
    for (let i = -3; i <= 3; i++) { const yy = i * r / 3.6, hx = r * 0.72 * Math.sqrt(Math.max(0, 1 - (yy / r) ** 2)); g.beginPath(); g.moveTo(-hx, yy); g.lineTo(hx, yy); g.stroke(); }
    g.beginPath(); g.moveTo(0, -r); g.lineTo(0, r); g.stroke();
  } else if (kind === 'media') {                              // a bone
    g.rotate(0.5); g.fillRect(-r, -r * 0.16, 2 * r, r * 0.32); g.strokeRect(-r, -r * 0.16, 2 * r, r * 0.32);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) dot(sx * r, sy * r * 0.24, r * 0.26);
  } else {                                                    // plain pebble
    g.beginPath(); g.ellipse(0, 0, r, r * 0.74, 0.3, 0, 7); g.fill(); g.stroke();
    g.beginPath(); g.arc(-r * 0.25, -r * 0.2, r * 0.3, 3.4, 4.5); g.stroke();
  }
  g.restore();
}

function skull(x, y, r) {                                     // easter egg
  g.save(); g.translate(x, y); g.lineWidth = Math.max(1.5, r / 14); g.fillStyle = BONE; g.strokeStyle = INK; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(-r, -r * 0.1); g.quadraticCurveTo(-r * 0.7, -r * 0.8, r * 0.1, -r * 0.7); g.quadraticCurveTo(r * 0.95, -r * 0.6, r, -r * 0.05); g.lineTo(r * 0.9, r * 0.25); g.lineTo(-r * 0.9, r * 0.25); g.closePath(); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(-r * 0.9, r * 0.25); g.lineTo(-r * 0.8, r * 0.7); g.lineTo(r * 0.8, r * 0.7); g.lineTo(r * 0.9, r * 0.25); g.stroke();
  g.beginPath(); for (let i = 0; i < 9; i++) { const tx = -r * 0.8 + i * r * 0.2; g.moveTo(tx, r * 0.25); g.lineTo(tx + r * 0.05, r * 0.45); g.lineTo(tx + r * 0.1, r * 0.25); } g.stroke();
  g.fillStyle = INK; g.beginPath(); g.ellipse(-r * 0.15, -r * 0.3, r * 0.14, r * 0.18, 0, 0, 7); g.fill();
  g.restore();
}

function draw() {
  g.clearRect(0, 0, W, H);
  bands.forEach((b, i) => {                                   // each layer fills everything below its wavy top edge; the next one paints over it
    g.fillStyle = b.l.color; g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 6) g.lineTo(x, b.y0 + (i ? wave(x, i) : 0));
    g.lineTo(W, H); g.closePath(); g.fill();
  });
  bands.forEach(texture);
  for (const b of bands) { g.fillStyle = 'rgba(0,0,0,.35)'; for (const [x, y] of b.grains) g.fillRect(x, y, 2, 2); }
  for (const s of spots) { if (rex && s.f === S.biggest) skull(s.x, s.y, s.r); else fossil(s.f.kind, s.x, s.y, s.r); }
  for (const b of bands) {                                    // layer labels
    g.fillStyle = 'rgba(239,227,200,.94)'; g.fillRect(14, b.y0 + 12, 188, 42);
    g.fillStyle = INK; g.textBaseline = 'alphabetic';
    g.font = '22px "DM Serif Display", Georgia, serif'; g.fillText(b.l.name, 22, b.y0 + 34);
    g.font = '12px "Courier Prime", monospace'; g.fillText(b.l.note + ' · ' + b.l.files.length.toLocaleString('en-US'), 22, b.y0 + 48);
  }
}

// ---------- hover label and click-to-copy ----------
function at(e) {
  const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  let best = null, bd = Infinity;
  for (const s of spots) { const d = Math.hypot(s.x - x, s.y - y); if (d < s.r + 5 && d < bd) { bd = d; best = s; } }
  return best;
}
function show(s, e) {
  card.replaceChildren();
  const f = s.f, dl = el('dl');
  card.append(el('h3', f.name));
  for (const [k, v] of [['Size', humanSize(f.size)], ['Age', humanAge(f.age)], ['Layer', layerFor(f.age).name], ['Kind', f.kind]]) dl.append(el('dt', k), el('dd', v));
  if (f.path) dl.append(el('dt', 'Path'), el('dd', f.path));
  card.append(dl);
  if (f === S.oldest) card.append(el('div', 'Carbon-dated: the oldest find', 'stamp'));
  else if (f === S.biggest) card.append(el('div', rex ? 'Tyrannosaurus Archivus' : 'The biggest boulder', 'stamp'));
  card.style.display = 'block';
  const w = card.offsetWidth, h = card.offsetHeight;
  card.style.left = Math.min(innerWidth - w - 8, e.clientX + 16) + 'px';
  card.style.top = Math.min(innerHeight - h - 8, e.clientY + 16) + 'px';
}
cv.addEventListener('pointermove', e => { const s = at(e); if (s) show(s, e); else card.style.display = 'none'; });
cv.addEventListener('pointerleave', () => { card.style.display = 'none'; });
cv.addEventListener('click', e => { const s = at(e); if (s && s.f.path && navigator.clipboard) navigator.clipboard.writeText(s.f.path).catch(() => {}); });

// ---------- depth gauge ----------
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const gauge = $('gauge');
S.layers.forEach((l, i) => {
  const b = el('button'); b.type = 'button';
  const dot = el('i'); dot.style.background = l.color;
  b.append(el('span', l.name), dot);
  b.setAttribute('aria-label', 'Jump to ' + l.name + ', ' + l.note);
  b.onclick = () => window.scrollTo({ top: bands[i].y0 + cv.getBoundingClientRect().top + scrollY - 8, behavior: calm ? 'auto' : 'smooth' });
  gauge.append(b);
});
function gaugeTick() {
  const mid = scrollY + innerHeight / 2 - (cv.getBoundingClientRect().top + scrollY);
  const i = Math.max(0, bands.findIndex(b => mid < b.y1) );
  [...gauge.children].forEach((b, k) => b.setAttribute('aria-current', String(k === (mid >= H ? bands.length - 1 : i))));
}
addEventListener('scroll', gaugeTick, { passive: true });

// ---------- easter egg: type "rex" ----------
let typed = '';
addEventListener('keydown', e => {
  if (e.key.length !== 1) return;
  typed = (typed + e.key.toLowerCase()).slice(-3);
  if (typed === 'rex') { typed = ''; rex = !rex; build(); }
});

let t; addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { build(); gaugeTick(); }, 120); });
(document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => { build(); gaugeTick(); });
build(); gaugeTick();
