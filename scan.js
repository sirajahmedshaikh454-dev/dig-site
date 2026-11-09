// Read-only folder walk. It only calls readdir and lstat: file CONTENTS are never opened.
import { readdirSync, lstatSync } from 'node:fs';
import { join, basename } from 'node:path';

const SKIP = new Set(['node_modules', '.git', '$RECYCLE.BIN', 'System Volume Information', 'AppData']);

// Returns { files, skipped } so the report can say what it could not read.
export function scan(root, { maxFiles = 50000, maxDepth = 6 } = {}) {
  const files = [];
  let skipped = 0, capped = false;
  const walk = (dir, depth) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { skipped++; return; }
    for (const e of entries) {
      if (files.length >= maxFiles) { capped = true; return; }
      const p = join(dir, e.name);
      if (e.isSymbolicLink()) continue;                  // never follow links out of the folder
      if (e.isDirectory()) { if (depth < maxDepth && !SKIP.has(e.name)) walk(p, depth + 1); continue; }
      if (!e.isFile()) continue;
      try { const s = lstatSync(p); files.push({ name: basename(p), path: p, size: s.size, mtime: s.mtimeMs }); } catch { skipped++; }
    }
  };
  walk(root, 0);
  return { files, skipped, capped };
}
