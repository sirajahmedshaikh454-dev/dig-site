// Pure logic: turn a flat file list into geological strata. No I/O, so it is fully testable.

const DAY = 864e5;

// Newest on top, oldest at the bottom. `max` is the upper age limit in days.
export const LAYERS = [
  { id: 'topsoil', name: 'Topsoil', note: 'this week', max: 7, color: '#7a5a3a' },
  { id: 'loam', name: 'Loam', note: 'this month', max: 30, color: '#9a7440' },
  { id: 'clay', name: 'Clay', note: 'last 3 months', max: 90, color: '#b0643c' },
  { id: 'sandstone', name: 'Sandstone', note: 'this year', max: 365, color: '#c79a5e' },
  { id: 'limestone', name: 'Limestone', note: '1 to 3 years', max: 1095, color: '#bdb39b' },
  { id: 'bedrock', name: 'Bedrock', note: 'older than 3 years', max: Infinity, color: '#5d6068' },
];

// Fossil kind by extension. Anything unknown is a plain pebble.
const KINDS = {
  archive: 'zip rar 7z tar gz iso msi exe dmg',
  image: 'png jpg jpeg gif webp svg bmp heic raw psd',
  doc: 'pdf doc docx txt md rtf odt xls xlsx ppt pptx csv',
  code: 'js ts jsx tsx py java c cpp h cs go rs php html css json sh ipynb',
  media: 'mp4 mov avi mkv mp3 wav flac webm m4a',
};
const BY_EXT = Object.fromEntries(Object.entries(KINDS).flatMap(([k, v]) => v.split(' ').map(e => [e, k])));
export const kindOf = name => BY_EXT[(name.split('.').pop() || '').toLowerCase()] || 'other';

export function layerFor(ageDays) {
  return LAYERS.find(l => ageDays <= l.max);
}

// "3 years, 2 months" style, rounded to two units. Negative ages (clock skew) count as today.
export function humanAge(ageDays) {
  const d = Math.max(0, Math.floor(ageDays));
  if (d < 1) return 'today';
  if (d < 60) return d + (d === 1 ? ' day' : ' days');
  const m = Math.floor(d / 30.44);
  if (m < 24) return m + ' months';
  const y = Math.floor(m / 12), r = m % 12;
  return y + (y === 1 ? ' year' : ' years') + (r ? ', ' + r + (r === 1 ? ' month' : ' months') : '');
}

export function humanSize(bytes) {
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = bytes;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return (i ? v.toFixed(v < 10 ? 1 : 0) : v) + ' ' + u[i];
}

// files: [{ name, path, size, mtime }]  ->  { layers, total, oldest, biggest }
export function strata(files, now = Date.now()) {
  const layers = LAYERS.map(l => ({ ...l, files: [], bytes: 0 }));
  let oldest = null, biggest = null;
  for (const f of files) {
    const age = (now - f.mtime) / DAY;
    const item = { ...f, age, kind: kindOf(f.name) };
    const layer = layers.find(l => l.id === layerFor(age).id);
    layer.files.push(item); layer.bytes += f.size;
    if (!oldest || item.age > oldest.age) oldest = item;
    if (!biggest || item.size > biggest.size) biggest = item;
  }
  for (const l of layers) l.files.sort((a, b) => b.size - a.size);
  return { layers, total: files.length, bytes: layers.reduce((s, l) => s + l.bytes, 0), oldest, biggest };
}

// Deterministic 0..1 hash of a string, so a file always lands in the same spot between runs.
export function seeded(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}

// Fossil radius in px from file size: log scale so one 4 GB ISO doesn't swallow the page.
export const radiusFor = (bytes, min = 3, max = 34) => Math.min(max, min + Math.log10(Math.max(bytes, 1) + 1) * 3.4);
