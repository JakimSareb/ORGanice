// Humo GTD: listas, tarea nueva (foco en el título, 3.17) y proyectos dormidos (:STATUS: sleep)
const { test, expect, gtd } = require('../harness');

const TASKS = `* PROJECT Dormido
:PROPERTIES:
:STATUS: sleep
:END:
** NEXT Tarea dormida
* PROJECT Viejo :sleep:
** NEXT Tarea despierta
* NEXT Suelta
* TODO Pendiente
`;

test('GTD: Next sin lo dormido; la etiqueta :sleep: no duerme', async ({ app }) => {
  await app.open({ '/tasks.org': TASKS, '/inbox.org': '' });
  await gtd.ready(app);
  await gtd.openList(app, 'Next');
  expect((await gtd.titles(app)).sort()).toEqual(['Suelta', 'Tarea despierta']);
  await gtd.openList(app, 'Todo');
  expect(await gtd.titles(app)).toEqual(['Pendiente']);
  expect(app.errors).toEqual([]);
});

test('GTD: «Nuevo elemento» pone el foco en el título y se guarda', async ({ app }) => {
  await app.open({ '/tasks.org': TASKS, '/inbox.org': '' });
  await gtd.ready(app);
  await gtd.openList(app, 'Next');
  await app.press(app.page.locator('[data-testid=gtd-new]'));
  await app.page.waitForSelector('[data-testid=gtd-editor-title]');
  const focused = await app.page.evaluate(() => document.activeElement.dataset.testid);
  expect(focused).toBe('gtd-editor-title');
  await app.page.keyboard.type('Escrita sin tocar');
  await app.page.keyboard.press('Enter');
  expect(await app.fileAfterSync('/tasks.org')).toMatch(/NEXT Escrita sin tocar/);
  expect(await app.page.locator('.eli-keyboard-bridge').count()).toBe(0);
});

test('GTD (3.22): /capture?text=… añade al Inbox', async ({ app }) => {
  await app.open(
    { '/tasks.org': TASKS, '/inbox.org': '' },
    '/capture?text=' + encodeURIComponent('Comprar pan\nintegral') + '&url=https%3A%2F%2Fa.es'
  );
  await gtd.ready(app);
  await app.page.waitForTimeout(1500);
  expect(await gtd.titles(app)).toContain('Comprar pan');
  const inbox = await app.fileAfterSync('/inbox.org');
  expect(inbox).toMatch(/^\* .*Comprar pan/m);
  expect(inbox).toContain('integral\nhttps://a.es');
  expect(app.errors).toEqual([]);
});

test('GTD (3.24): revisión semanal paso a paso', async ({ app }) => {
  await app.open({
    '/tasks.org': TASKS + '* PROJECT Atascado\n** TODO Algo\n',
    '/inbox.org': '* Idea\n',
  });
  await gtd.ready(app);
  const p = app.page;
  await app.press(p.locator('[data-testid=gtd-view-menu-button]'));
  await app.press(p.locator('[data-testid=gtd-menu-review]'));
  await p.waitForSelector('[data-testid=gtd-review]');
  await expect(p.locator('[data-testid=gtd-review-title]')).toContainText('Inbox');
  expect(await gtd.titles(app)).toContain('Idea');
  await app.press(p.locator('[data-testid=gtd-review-next]'));
  await expect(p.locator('[data-testid=gtd-review-title]')).toContainText('sin acción');
  await expect(p.locator('[data-testid=gtd-review-item]')).toHaveText(['Atascado']);
  await app.press(p.locator('[data-testid=gtd-review-item]'));
  await expect(p.locator('[data-testid=gtd-title]')).toContainText('Atascado');
  await expect(p.locator('[data-testid=gtd-review]')).toBeVisible();
  await app.press(p.locator('[data-testid=gtd-review-next]'));
  await expect(p.locator('[data-testid=gtd-review-item]')).toHaveText(['Dormido']);
  for (let i = 0; i < 3; i++) await app.press(p.locator('[data-testid=gtd-review-next]'));
  await p.waitForSelector('[data-testid=gtd-review-done]');
  await app.press(p.locator('[data-testid=gtd-review-finish]'));
  await expect(p.locator('[data-testid=gtd-review]')).toHaveCount(0);
  expect(app.errors).toEqual([]);
});

// (3.25) avisos de fechas: se activan en Ajustes y la tarea con hora avisa
test('GTD: avisos de fechas (hora exacta + resumen)', async ({ app }) => {
  await app.page.addInitScript(() => {
    window.__notes = [];
    class FakeNotification {
      constructor(title, opts) {
        window.__notes.push(title + '|' + ((opts && opts.body) || ''));
      }
      close() {}
    }
    FakeNotification.permission = 'default';
    FakeNotification.requestPermission = async () => {
      FakeNotification.permission = 'granted';
      return 'granted';
    };
    window.Notification = FakeNotification;
    if (window.ServiceWorkerRegistration)
      window.ServiceWorkerRegistration.prototype.showNotification = async (title, opts) => {
        window.__notes.push(title + '|' + ((opts && opts.body) || ''));
      };
  });
  const d = new Date(Date.now() - 60000);
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} Mon ${p(
    d.getHours()
  )}:${p(d.getMinutes())}`;
  const tasks = `* TODO Llamar al médico\nDEADLINE: <${stamp}>\n* TODO Otra sin fecha\n`;
  await app.open({ '/tasks.org': tasks, '/inbox.org': '' }, '/settings');
  const row = app.page.locator('[data-testid=eli-setting-reminders]');
  await row.waitFor();
  await row.locator('.switch').click();
  await app.page.waitForSelector('[data-testid=eli-setting-reminders-hour]');
  await app.page.selectOption('[data-testid=eli-setting-reminders-hour]', '0');
  // los ficheros se cargan al abrir GTD (se mantiene lo guardado en este navegador)
  await app.open({ '/tasks.org': tasks, '/inbox.org': '' }, '/gtd');
  await gtd.ready(app);
  await app.page.evaluate(() => (window.Notification.permission = 'granted'));
  await app.page.waitForFunction(() => window.__notes.length >= 2, null, { timeout: 15000 });
  const notes = await app.page.evaluate(() => window.__notes);
  expect(notes.some((n) => n.startsWith('Llamar al médico|Vence a las'))).toBe(true);
  expect(notes.some((n) => n.startsWith('Tareas:') && n.includes('• Llamar al médico'))).toBe(true);
  expect(app.errors).toEqual([]);
});

test('GTD (3.26): tirar hacia abajo de la lista = sincronizar', async ({ app, isMobile }) => {
  test.skip(!isMobile, 'solo con el dedo');
  await app.open({ '/tasks.org': TASKS, '/inbox.org': '' }, '/gtd');
  await gtd.ready(app);
  await gtd.openList(app, 'Next');
  const box = await app.page.locator('.gtd-main').boundingBox();
  const from = { x: box.x + box.width / 2, y: box.y + 90 };
  // pulsación larga + bajar = arrastre de fila, no sincroniza
  await app.touchDrag(from, { x: from.x, y: from.y + 220 }, { hold: 700 });
  await expect(app.page.locator('[data-testid=gtd-pull]')).toHaveCount(0);
  // tirón rápido: se pregunta al servidor (el arnés no cambia la fecha, así que solo se mira la petición)
  let asked = 0;
  app.page.on('request', (r) => {
    if (/tasks\.org/.test(r.url())) asked++;
  });
  await app.touchDrag(from, { x: from.x, y: from.y + 220 }, { hold: 0 });
  await expect(app.page.locator('[data-testid=gtd-pull]')).toContainText('Sincronizando');
  await expect.poll(() => asked, { timeout: 8000 }).toBeGreaterThan(0);
  // 3.27: al terminar la ronda, un solo aviso con el resultado (y el título de la barra oculto)
  await expect(
    app.page.locator('.loading-indicator')
  ).toContainText(/Nada que sincronizar|Última versión|Cambios subidos/, { timeout: 8000 });
  await expect(app.page.locator('[data-testid=gtd-pull]')).toHaveCount(0);
  await expect(app.page.locator('.gtd-main')).not.toHaveClass(/is-pulling/, { timeout: 3000 });
  expect(app.errors).toEqual([]);
});

test('GTD (3.30): flechas ← → entre vistas', async ({ app }) => {
  await app.open({ '/tasks.org': '* TODO Algo\n', '/inbox.org': '' }, '/gtd');
  await gtd.ready(app);
  await gtd.openList(app, 'Inbox');
  await gtd.openList(app, 'Next');
  const on = () =>
    app.page.$eval('.gtd-side .gtd-side__item.is-on .gtd-side__label', (x) => x.textContent.trim());
  expect(await on()).toBe('Next');
  await app.page.locator('[data-testid=eli-nav-back]').click();
  await app.page.waitForTimeout(500);
  expect(await on()).toBe('Inbox');
  await app.page.locator('[data-testid=eli-nav-forward]').click();
  await app.page.waitForTimeout(500);
  expect(await on()).toBe('Next');
  expect(app.errors).toEqual([]);
});
