// Builds the self-contained HTML page. Pure (reads only this project's own files), so it is testable.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = p => fileURLToPath(new URL(p, import.meta.url));

// Escape "<" and the two JS line separators so a hostile file name cannot close the script tag or break the string.
export function safeJson(data) {
  const BS = String.fromCharCode(92);
  const risky = new RegExp('[' + String.fromCharCode(60, 0x2028, 0x2029) + ']', 'g');
  return JSON.stringify(data).replace(risky, c => BS + 'u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

// strata.js is inlined with its `export` keywords stripped, so the page works from file:// with no server.
export function renderPage(data) {
  const lib = readFileSync(here('./strata.js'), 'utf8').replace(/^export /gm, '');
  const script = `<script>\nconst DATA = ${safeJson(data)};\n${lib}\n${readFileSync(here('./page.js'), 'utf8')}\n</script>`;
  return readFileSync(here('./template.html'), 'utf8').replace('<!--SCRIPT-->', () => script);
}
