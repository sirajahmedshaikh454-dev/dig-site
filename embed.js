// Builds the self-contained HTML page. Pure (reads only this project's own files), so it is testable.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = p => fileURLToPath(new URL(p, import.meta.url));

const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
  + '<link href="https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet">';

// Escape "<" and the two JS line separators so a hostile file name cannot close the script tag or break the string.
export function safeJson(data) {
  const BS = String.fromCharCode(92);
  const risky = new RegExp('[' + String.fromCharCode(60, 0x2028, 0x2029) + ']', 'g');
  return JSON.stringify(data).replace(risky, c => BS + 'u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

// fonts:false builds a page that makes NO network request at all (used for --anonymize, which is meant for sharing).
// The Content-Security-Policy is a second line of defence: even if injected script ever ran, it could not phone home.
export function renderPage(data, { fonts = true } = {}) {
  const csp = "default-src 'none'; script-src 'unsafe-inline'; "
    + (fonts ? "style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com" : "style-src 'unsafe-inline'");
  // strata.js is inlined with its `export` keywords stripped, so the page works from file:// with no server.
  const lib = readFileSync(here('./strata.js'), 'utf8').replace(/^export /gm, '');
  const script = `<script>\nconst DATA = ${safeJson(data)};\n${lib}\n${readFileSync(here('./page.js'), 'utf8')}\n</script>`;
  return readFileSync(here('./template.html'), 'utf8')
    .replace('<!--FONTS-->', () => (fonts ? FONTS : ''))
    .replace('<!--CSP-->', () => `<meta http-equiv="Content-Security-Policy" content="${csp}">`)
    .replace('<!--SCRIPT-->', () => script);          // last, so file data can never be mistaken for a placeholder
}
