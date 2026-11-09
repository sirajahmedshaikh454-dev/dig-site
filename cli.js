#!/usr/bin/env node
// Usage: node cli.js [folder] [--out file.html] [--anonymize] [--open] [--max N]
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve, extname } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scan } from './scan.js';
import { strata, humanAge, humanSize } from './strata.js';

const here = p => fileURLToPath(new URL(p, import.meta.url));
const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); return i >= 0 ? (args.splice(i, 1), true) : false; };
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : fallback; };
const anonymize = flag('--anonymize'), open = flag('--open');
const maxFiles = Math.max(100, Math.min(200000, parseInt(opt('--max', '20000'), 10) || 20000));
const outPath = resolve(opt('--out', 'dig-site.html'));
const downloads = join(homedir(), 'Downloads');
const root = resolve(args[0] ?? (existsSync(downloads) ? downloads : '.'));

if (!existsSync(root) || !statSync(root).isDirectory()) { console.error(`Not a folder: ${root}`); process.exit(1); }
if (extname(outPath).toLowerCase() !== '.html') { console.error('--out must end in .html'); process.exit(1); }

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
  ? { name: 'specimen-' + String(i + 1).padStart(4, '0') + extname(f.name), path: '', size: f.size, mtime: f.mtime }
  : { name: f.name, path: f.path, size: f.size, mtime: f.mtime }) };
// Escape "<" and the two JS line separators so a hostile file name cannot close the script tag or break the string.
const BS = String.fromCharCode(92);
const risky = new RegExp('[' + String.fromCharCode(60, 0x2028, 0x2029) + ']', 'g');
const json = JSON.stringify(data).replace(risky, c => BS + 'u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const lib = readFileSync(here('./strata.js'), 'utf8').replace(/^export /gm, '');
const script = `<script>\nconst DATA = ${json};\n${lib}\n${readFileSync(here('./page.js'), 'utf8')}\n</script>`;
writeFileSync(outPath, readFileSync(here('./template.html'), 'utf8').replace('<!--SCRIPT-->', () => script));
console.log(`\nDig site written: ${outPath}${skipped ? `\n(${skipped} folder(s) could not be read)` : ''}${capped ? '\n(stopped at the file limit; raise it with --max)' : ''}`);

if (open) {
  const [cmd, a] = process.platform === 'win32' ? ['explorer.exe', [outPath]] : process.platform === 'darwin' ? ['open', [outPath]] : ['xdg-open', [outPath]];
  spawn(cmd, a, { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
}
