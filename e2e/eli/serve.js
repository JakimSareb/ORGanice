/* global process, __dirname */
// ORG Mode para Eli (3.18): servidor estático para las pruebas E2E. Sirve el build de
// `build-e2e/` y, si la ruta no existe (rutas de la app como /gtd o /file/…), devuelve
// index.html, como haría GitHub Pages con la SPA.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.env.E2E_BUILD_DIR || path.join(__dirname, '../../build-e2e'));
const PORT = Number(process.env.E2E_PORT || 4317);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.pdf': 'application/pdf',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json',
  '.org': 'text/plain; charset=utf-8',
};

if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
  console.error(`No hay build en ${ROOT}. Ejecuta antes «yarn e2e:build».`);
  process.exit(1);
}

http
  .createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT)) file = ROOT;
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory())
      file = path.join(ROOT, 'index.html');
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, '127.0.0.1', () => console.log(`E2E: http://127.0.0.1:${PORT}`));
