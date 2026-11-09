import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { safeExt, kindOf, humanSize, humanAge } from './strata.js';
import { renderPage } from './embed.js';
import { scan } from './scan.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const NOW = Date.UTC(2026, 10, 9);
const cli = (args, cwd) => spawnSync(process.execPath, [join(root, 'cli.js'), ...args], { cwd, encoding: 'utf8' });
const tmp = () => mkdtempSync(join(tmpdir(), 'dig-'));

test('anonymising keeps no part of a real name; odd extensions are not prototype lookups', () => {
  assert.equal(safeExt('a.John Smith resume'), '');
  assert.equal(safeExt('Report.PDF'), '.pdf');
  assert.equal(safeExt('Makefile'), '');
  assert.equal(safeExt('.gitignore'), '');
  assert.equal(kindOf('zip'), 'other');                 // a bare name is not an extension
  for (const n of ['x.constructor', 'x.__proto__', 'x.toString', 'x.hasOwnProperty', 'x.']) assert.equal(kindOf(n), 'other');
});

test('shared pages make no network request and carry a strict Content-Security-Policy', () => {
  const data = { folder: 'f', now: NOW, skipped: 0, capped: false, files: [] };
  const quiet = renderPage(data, { fonts: false }), normal = renderPage(data);
  assert.ok(!quiet.includes('googleapis') && !quiet.includes('gstatic'));
  assert.ok(quiet.includes(`content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'"`));
  assert.ok(normal.includes('fonts.googleapis.com/css2'));
  assert.ok(normal.includes('<meta name="generator" content="dig-site">'));
});

test('size and age labels never go backwards or say "1 months" or "1024 KB"', () => {
  assert.equal(humanSize(1048575), '1 MB');
  assert.equal(humanSize(1023.6 * 1024), '1 MB');
  assert.equal(humanSize(10200), '10 KB');
  assert.equal(humanSize(1536), '1.5 KB');
  assert.equal(humanAge(59), '59 days');
  assert.equal(humanAge(60), '2 months');
  assert.equal(humanAge(365), '12 months');
  assert.equal(humanAge(730), '2 years');
});

test('capped is not triggered by a directory that follows the last file', () => {
  const dir = tmp();
  try {
    writeFileSync(join(dir, 'a.txt'), '1'); writeFileSync(join(dir, 'b.txt'), '2'); mkdirSync(join(dir, 'sub'));
    assert.equal(scan(dir, { maxFiles: 2 }).capped, false);
    assert.equal(scan(dir, { maxFiles: 1 }).capped, true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('cli: bad arguments exit with a message, not a stack trace', () => {
  const dir = tmp();
  try {
    for (const args of [[dir, '--out'], [dir, '--max', 'abc'], ['--max', dir], [dir, '--out', 'notes.txt']]) {
      const r = cli(args, dir);
      assert.equal(r.status, 1, args.join(' '));
      assert.ok(!r.stderr.includes('    at '), 'no stack trace: ' + r.stderr);
    }
    assert.equal(cli([join(dir, 'missing')], dir).status, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('cli end to end: anonymised page leaks no name, own pages are overwritten, foreign files are protected', () => {
  const dir = tmp(), out = join(dir, 'out.html');
  try {
    writeFileSync(join(dir, 'secret plan.John Smith resume'), 'x'); writeFileSync(join(dir, 'photo.png'), 'y');
    let r = cli([dir, '--anonymize', '--out', out], dir);
    assert.equal(r.status, 0, r.stderr);
    const html = readFileSync(out, 'utf8');
    assert.ok(!html.includes('John Smith') && !html.includes('secret plan') && !html.includes('googleapis'));
    assert.ok(html.includes('specimen-0001') || html.includes('specimen-0002'));
    assert.equal(cli([dir, '--anonymize', '--out', out], dir).status, 0);          // our own page: fine to overwrite
    const mine = join(dir, 'mine.html'); writeFileSync(mine, '<p>my own report</p>');
    r = cli([dir, '--out', mine], dir);
    assert.equal(r.status, 1);
    assert.equal(readFileSync(mine, 'utf8'), '<p>my own report</p>');                // untouched
    assert.equal(cli([dir, '--out', mine, '--force'], dir).status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
