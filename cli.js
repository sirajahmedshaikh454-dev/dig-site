#!/usr/bin/env node
// Usage: node cli.js [folder] [--out file.html] [--anonymize] [--open] [--max N] [--force]
import { writeFileSync, existsSync, statSync, lstatSync, openSync, readSync, closeSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve, extname } from 'node:path';
import { spawn } from 'node:child_process';
import { scan } from './scan.js';
import { strata, humanAge, humanSize, safeExt } from './strata.js';
import { renderPage } from './embed.js';

const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); return i >= 0 ? (args.splice(i, 1), true) : false; };
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  const v = args.splice(i, 2)[1];
  if (v === undefined || v.startsWith('--')) { console.error(`${name} needs a value`); process.exit(1); }
  return v;
};
const anonymize = flag('--anonymize'), open = flag('--open'), force = flag('--force');
const maxArg = opt('--max', '50000');
if (!/^\d+$/.test(maxArg)) { console.error('--max needs a whole number'); process.exit(1); }
const maxFiles = Math.max(100, Math.min(200000, parseInt(maxArg, 10)));
const outPath = resolve(opt('--out', 'dig-site.html'));
const downloads = join(homedir(), 'Downloads');
const root = resolve(args[0] ?? (existsSync(downloads) ? downloads : '.'));

if (!existsSync(root) || !statSync(root).isDirectory()) { console.error(`Not a folder: ${root}`); process.exit(1); }
if (extname(outPath).toLowerCase() !== '.html') { console.error('--out must end in .html'); process.exit(1); }

// Never overwrite a link, or a file that is not a previous Dig Site page, unless --force.
const prior = lstatSync(outPath, { throwIfNoEntry: false });
if (prior && !force) {
  let ours = false;
  if (prior.isFile()) {
    const fd = openSync(outPath, 'r'), buf = Buffer.alloc(2000), n = readSync(fd, buf, 0, 2000, 0); closeSync(fd);
    ours = buf.toString('utf8', 0, n).includes('<meta name="generator" content="dig-site">');
  }
  if (!ours) { console.error(`${outPath} exists and is not a Dig Site page (or is a link). Pick another --out or add --force.`); process.exit(1); }
}

const { files, skipped, capped } = scan(root, { maxFiles });
const now = Date.now();
const s = strata(files, now);

// Terminal summary
console.log(`\nDig Site: ${root}\n${files.length.toLocaleString('en-US')} fossils, ${humanSize(s.bytes)}\n`);
const widest = Math.max(1, ...s.layers.map(l => l.files.length));
for (const l of s.layers) console.log(`${l.name.padEnd(10)} ${l.note.padEnd(20)} ${'#'.repeat(Math.round(l.files.length / widest * 24)).padEnd(24)} ${String(l.files.length).padStart(6)}  ${humanSize(l.bytes)}`);
if (s.oldest) console.log(`\nOldest find:    ${anonymize ? 'specimen' : s.oldest.name} (${humanAge(s.oldest.age)})\nBiggest boulder: ${anonymize ? 'specimen' : s.biggest.name} (${humanSize(s.biggest.size)})`);

// Page: the module source is inlined (export keywords stripped) so the file works from file:// with no server.
const data = { folder: anonymize ? 'the folder' : basename(root) || root, now, skipped, capped, files: files.map((f, i) => anonymize
  ? { name: 'specimen-' + String(i + 1).padStart(4, '0') + safeExt(f.name), path: '', size: f.size, mtime: f.mtime }
  : { name: f.name, path: f.path, size: f.size, mtime: f.mtime }) };
try { writeFileSync(outPath, renderPage(data, { fonts: !anonymize })); } catch (err) { console.error(`Could not write ${outPath}: ${err.code || err.message}`); process.exit(1); }
console.log(`\nDig site written: ${outPath}${skipped ? `\n(${skipped} folder(s) could not be read)` : ''}${capped ? '\n(stopped at the file limit; raise it with --max)' : ''}`);

if (open) {
  const [cmd, a] = process.platform === 'win32' ? ['explorer.exe', [outPath]] : process.platform === 'darwin' ? ['open', [outPath]] : ['xdg-open', [outPath]];
  spawn(cmd, a, { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
}
