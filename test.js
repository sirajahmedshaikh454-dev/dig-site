import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, utimesSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strata, layerFor, humanAge, humanSize, kindOf, radiusFor, seeded, LAYERS } from './strata.js';
import { scan } from './scan.js';

const DAY = 864e5, NOW = Date.UTC(2026, 10, 9);

test('age buckets are exclusive-on-top and cover everything, including future dates', () => {
  assert.equal(layerFor(0).id, 'topsoil');
  assert.equal(layerFor(7).id, 'topsoil');
  assert.equal(layerFor(7.01).id, 'loam');
  assert.equal(layerFor(5000).id, 'bedrock');
  assert.equal(layerFor(-3).id, 'topsoil');           // clock skew: modified "in the future"
  assert.equal(LAYERS.at(-1).max, Infinity);
});

test('strata finds the oldest file and the biggest boulder, sorted big-first', () => {
  const f = (name, days, size) => ({ name, path: name, size, mtime: NOW - days * DAY });
  const s = strata([f('a.txt', 2, 10), f('b.zip', 400, 5e9), f('c.png', 2, 900), f('old.doc', 2000, 1)], NOW);
  assert.equal(s.oldest.name, 'old.doc');
  assert.equal(s.biggest.name, 'b.zip');
  assert.deepEqual(s.layers[0].files.map(x => x.name), ['c.png', 'a.txt']);
  assert.equal(s.layers.find(l => l.id === 'limestone').files[0].name, 'b.zip');
  assert.equal(s.total, 4);
  assert.deepEqual(strata([], NOW).oldest, null);     // empty folder must not crash
});

test('formatting and fossil kinds', () => {
  assert.equal(humanAge(0.4), 'today');
  assert.equal(humanAge(1), '1 day');
  assert.equal(humanAge(400), '13 months');
  assert.equal(humanAge(1160), '3 years, 2 months');
  assert.equal(humanAge(-5), 'today');
  assert.equal(humanSize(1536), '1.5 KB');
  assert.equal(humanSize(0), '0 B');
  assert.equal(kindOf('Photo.JPG'), 'image');
  assert.equal(kindOf('Makefile'), 'other');
  assert.ok(radiusFor(0) >= 3 && radiusFor(1e13) <= 34);
  assert.equal(seeded('x'), seeded('x'));
});

test('scan reads metadata only, skips node_modules, never follows symlinks, survives a missing folder', () => {
  const root = mkdtempSync(join(tmpdir(), 'dig-'));
  try {
    mkdirSync(join(root, 'sub')); mkdirSync(join(root, 'node_modules'));
    writeFileSync(join(root, 'a.txt'), 'hello');
    writeFileSync(join(root, 'sub', 'b.png'), 'x'.repeat(100));
    writeFileSync(join(root, 'node_modules', 'skip.js'), 'no');
    const old = (NOW - 800 * DAY) / 1000;
    utimesSync(join(root, 'a.txt'), old, old);
    const { files } = scan(root);
    assert.deepEqual(files.map(x => x.name).sort(), ['a.txt', 'b.png']);
    assert.ok(Math.abs(files.find(x => x.name === 'a.txt').mtime - old * 1000) < 2000);
    assert.equal(scan(join(root, 'nope')).files.length, 0);
    assert.equal(scan(root, { maxFiles: 1 }).capped, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
