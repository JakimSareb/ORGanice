// ORG Mode para Eli (3.18): arnés de las pruebas E2E propias.
// - WebDAV simulado (PROPFIND/GET/PUT/DELETE) con fechas y ETag estables: los ficheros viven en
//   `app.store` y se pueden leer después para ver lo que ha escrito la app.
// - La app arranca ya «conectada» a https://dav.test (localStorage).
// - Proyectos «ordenador» y «movil» (ver playwright.eli.config.js); `app.mobile` dice cuál es.
// Uso: const { test, expect } = require('../harness');  test('…', async ({ app }) => { … });
const base = require('@playwright/test');

const DAV = 'https://dav.test';
const STAMP = 'Mon, 19 Oct 2026 10:00:00 GMT';

const etagOf = (text) => {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return `"e${(h >>> 0).toString(16)}-${text.length}"`;
};
const xmlEscape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const propEntry = (path, content) => {
  const isDir = content === null;
  const name = path.split('/').filter(Boolean).pop() || '';
  const props = isDir
    ? '<d:resourcetype><d:collection/></d:resourcetype>'
    : '<d:resourcetype/>' +
      `<d:getcontentlength>${Buffer.byteLength(content)}</d:getcontentlength>` +
      '<d:getcontenttype>text/plain</d:getcontenttype>' +
      `<d:getetag>${etagOf(content)}</d:getetag>`;
  return (
    `<d:response><d:href>${xmlEscape(encodeURI(path))}</d:href><d:propstat><d:prop>` +
    `<d:displayname>${xmlEscape(name)}</d:displayname>` +
    `<d:getlastmodified>${STAMP}</d:getlastmodified>${props}` +
    '</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>'
  );
};

// Carpetas que hay que listar aunque solo existan por sus ficheros
const dirsOf = (store) => {
  const dirs = new Set(['/']);
  Object.keys(store).forEach((k) => {
    const parts = k.split('/').filter(Boolean);
    for (let i = 1; i < parts.length; i++) dirs.add('/' + parts.slice(0, i).join('/'));
  });
  return dirs;
};

const mockWebDav = async (context, store) => {
  await context.route(`${DAV}/**`, async (route) => {
    const req = route.request();
    const p = decodeURIComponent(new URL(req.url()).pathname).replace(/\/+$/, '') || '/';
    const method = req.method().toUpperCase();
    if (method === 'PROPFIND') {
      // La ruta de un fichero devuelve ESE fichero (si no, p. ej. un guion sale «No existe»)
      let body;
      if (store[p] !== undefined) body = propEntry(p, store[p]);
      else if (dirsOf(store).has(p)) {
        const dir = p === '/' ? '/' : p + '/';
        const kids = new Set();
        Object.keys(store).forEach((k) => {
          if (!k.startsWith(dir)) return;
          const rest = k.slice(dir.length);
          kids.add(rest.includes('/') ? dir + rest.split('/')[0] : k);
        });
        body =
          propEntry(dir, null) +
          Array.from(kids)
            .map((k) => propEntry(k, store[k] !== undefined ? store[k] : null))
            .join('');
      } else return route.fulfill({ status: 404, body: '' });
      return route.fulfill({
        status: 207,
        contentType: 'application/xml; charset=utf-8',
        body: `<?xml version="1.0" encoding="utf-8"?><d:multistatus xmlns:d="DAV:">${body}</d:multistatus>`,
      });
    }
    if (method === 'GET') {
      if (store[p] === undefined) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({
        status: 200,
        contentType: 'text/plain; charset=utf-8',
        headers: { 'Last-Modified': STAMP, ETag: etagOf(store[p]) },
        body: store[p],
      });
    }
    if (method === 'PUT') {
      store[p] = req.postData() || '';
      return route.fulfill({ status: 201, body: '' });
    }
    if (method === 'DELETE') {
      delete store[p];
      return route.fulfill({ status: 204, body: '' });
    }
    if (method === 'MKCOL') return route.fulfill({ status: 201, body: '' });
    return route.fulfill({ status: 200, body: '' });
  });
};

const test = base.test.extend({
  app: async ({ page, context, isMobile }, use) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    const app = {
      page,
      mobile: !!isMobile,
      store: {},
      errors,
      // Abre la app con estos ficheros ({ '/tasks.org': '…' }) en la ruta indicada
      async open(files = {}, path = '/gtd', { localStorage = {} } = {}) {
        Object.assign(app.store, files);
        await mockWebDav(context, app.store);
        await context.addInitScript((extra) => {
          if (sessionStorage.getItem('__e2e')) return;
          sessionStorage.setItem('__e2e', '1');
          localStorage.setItem('authenticatedSyncService', 'WebDAV');
          localStorage.setItem('webdavEndpoint', 'https://dav.test');
          localStorage.setItem('webdavUsername', 'e2e');
          localStorage.setItem('webdavPassword', 'e2e');
          // (3.46) las subtareas vienen apagadas; las pruebas anteriores las usan encendidas
          localStorage.setItem('eliGtdSubtasks', 'true');
          Object.keys(extra).forEach((k) => localStorage.setItem(k, extra[k]));
        }, localStorage);
        await page.goto(path);
        return app;
      },
      // Espera a que se suba lo cambiado (sincronización) y devuelve el fichero
      async fileAfterSync(path, ms = 3000) {
        await page.waitForTimeout(ms);
        return app.store[path];
      },
      // Toque (móvil) o clic (ordenador)
      async press(locator) {
        if (app.mobile) await locator.tap();
        else await locator.click();
      },
      // Arrastre táctil con pulsación larga (CDP), de un punto a otro
      async touchDrag(from, to, { hold = 700, steps = 12 } = {}) {
        const cdp = await context.newCDPSession(page);
        const pt = (p) => [{ x: p.x, y: p.y }];
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(from) });
        await page.waitForTimeout(hold);
        for (let i = 1; i <= steps; i++) {
          const p = {
            x: from.x + ((to.x - from.x) * i) / steps,
            y: from.y + ((to.y - from.y) * i) / steps,
          };
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(p) });
          await page.waitForTimeout(30);
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      },
    };
    await use(app);
  },
});

// --- GTD ---
const gtd = {
  // Espera a que la vista GTD esté lista
  async ready(app) {
    await app.page.waitForSelector('[data-testid=gtd-new]', { timeout: 20000 });
    await app.page.waitForTimeout(1000);
  },
  // Abre una lista del menú lateral (en el móvil abre antes el menú)
  async openList(app, name) {
    if (app.mobile) await app.page.click('.gtd-main__menu');
    const item = app.page.locator(`text=/^${name}$/`).first();
    await app.press(item);
    await app.page.waitForTimeout(600);
  },
  // (4.0) Abre una entrada del menú lateral (Procesar Inbox, Revisión…); en el móvil, antes el menú
  async side(app, testId) {
    if (app.mobile) await app.page.click('.gtd-main__menu');
    await app.press(app.page.locator(`[data-testid=${testId}]`));
    await app.page.waitForTimeout(400);
  },
  async titles(app) {
    return app.page.$$eval('[data-testid=gtd-task-title]', (a) =>
      a.map((x) => x.textContent.trim())
    );
  },
};

module.exports = { test, expect: base.expect, gtd };
