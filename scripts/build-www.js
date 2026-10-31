// Kopiert die Web-App nach www/ für die APK. Admin-Oberfläche und Service Worker gehören nicht in die App.
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'public');
const dst = path.join(__dirname, '..', 'www');
const skip = new Set(['admin.html', 'js/admin.js', 'sw.js']);

fs.rmSync(dst, { recursive: true, force: true });
(function copy(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    const rel = path.relative(src, full).split(path.sep).join('/');
    if (skip.has(rel)) continue;
    const out = path.join(dst, rel);
    if (e.isDirectory()) {
      fs.mkdirSync(out, { recursive: true });
      copy(full);
    } else {
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.copyFileSync(full, out);
    }
  }
})(src);
console.log('www/ erstellt');
