// Read-only folder walk. It only calls opendir/readdir and lstat: file CONTENTS are never opened.
import { opendirSync, lstatSync } from 'node:fs';
import { join, basename } from 'node:path';

const SKIP = new Set(['node_modules', '.git', '$RECYCLE.BIN', 'System Volume Information', 'AppData']);

// Returns { files, skipped, capped } so the report can say what it could not read.
// `capped` is true only when there was at least one more FILE we refused to add.
export function scan(root, { maxFiles = 50000, maxDepth = 6 } = {}) {
  const files = [];
  let skipped = 0, capped = false;
  const walk = (dir, depth) => {
    let d;
    try { d = opendirSync(dir); } catch { skipped++; return; }
    try {
      let e;
      while ((e = d.readSync()) !== null) {          // streams entries, so a huge folder is never loaded whole
        const p = join(dir, e.name);
        if (e.isSymbolicLink()) continue;            // never follow links out of the folder
        if (e.isDirectory()) { if (depth < maxDepth && !SKIP.has(e.name)) walk(p, depth + 1); continue; }
        if (!e.isFile()) continue;
        if (files.length >= maxFiles) { capped = true; return; }
        try { const s = lstatSync(p); files.push({ name: basename(p), path: p, size: s.size, mtime: s.mtimeMs }); } catch { skipped++; }
      }
    } catch { skipped++; } finally { d.closeSync(); }
  };
  walk(root, 0);
  return { files, skipped, capped };
}
