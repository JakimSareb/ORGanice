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
  await gtd.side(app, 'gtd-review-start');
  await p.waitForSelector('[data-testid=gtd-review]');
  // (4.60) solo la revisión oficial (Allen estricto): papeles sueltos, luego el Inbox
  await expect(p.locator('[data-testid=gtd-review-title]')).toContainText('Papeles');
  await app.press(p.locator('[data-testid=gtd-review-next]'));
  await expect(p.locator('[data-testid=gtd-review-title]')).toContainText('Inbox');
  expect(await gtd.titles(app)).toContain('Idea');
  // se salta directo con su punto
  await app.press(p.locator('[data-testid=gtd-review-dot-projects]'));
  await expect(p.locator('[data-testid=gtd-review-title]')).toContainText('Proyectos');
  await expect(p.locator('[data-testid=gtd-review]')).toBeVisible();
  await app.press(p.locator('[data-testid=gtd-review-dot-creative]'));
  await app.press(p.locator('[data-testid=gtd-review-next]'));
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
  // (3.47) las secciones empiezan plegadas; (4.37) los avisos de GTD viven en «GTD»
  await app.page.locator('[data-testid=eli-settings-gtd] > summary').click();
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

test('GTD (3.33): editor — título sin espacios de etiquetas; cerrar arrastrando desde un campo', async ({
  app,
  isMobile,
}) => {
  await app.open(
    {
      '/tasks.org': '* NEXT Con etiquetas                                   :casa:\n',
      '/inbox.org': '',
    },
    '/gtd'
  );
  await gtd.ready(app);
  await gtd.openList(app, 'Next');
  const row = app.page
    .locator('[data-testid=gtd-task-title]', { hasText: 'Con etiquetas' })
    .first();
  if (isMobile) await app.press(row);
  else await row.dblclick();
  const title = app.page.locator('[data-testid=gtd-editor-title]');
  await expect(title).toHaveValue('Con etiquetas');
  if (isMobile) {
    const box = await app.page
      .locator('.gtd-ed__field--date', {
        has: app.page.locator('[data-testid=gtd-editor-deadline]'),
      })
      .boundingBox();
    const from = { x: box.x + 20, y: box.y + box.height / 2 };
    await app.touchDrag(from, { x: from.x, y: from.y + 260 }, { hold: 0 });
    await expect(app.page.locator('.gtd-editor')).toHaveCount(0, { timeout: 3000 });
  }
  expect(await app.fileAfterSync('/tasks.org')).toMatch(/NEXT Con etiquetas +:casa:/);
  expect(app.errors).toEqual([]);
});

test('GTD (3.34): programada — vaciar = hoy, hora; el icono de notas alterna', async ({
  app,
  isMobile,
}) => {
  await app.open(
    {
      '/tasks.org':
        '* NEXT Con hora\nSCHEDULED: <2026-01-05 Mon>\n* NEXT Con notas\nuna\ndos\ntres\n',
      '/inbox.org': '',
    },
    '/gtd'
  );
  await gtd.ready(app);
  await gtd.openList(app, 'Next');
  const page = app.page;
  // espera a que se ponga la ★ automática (programada pasada) antes de abrir el editor
  await app.fileAfterSync('/tasks.org');
  // (c) icono de notas: nada ⇄ todo
  const notesRow = page.locator('[data-testid=gtd-task]', { hasText: 'Con notas' }).first();
  const toggle = notesRow.locator('[data-testid=gtd-notes-toggle]');
  await toggle.click();
  await expect(notesRow).toContainText('tres');
  await toggle.click();
  await expect(notesRow).not.toContainText('una');
  // (a) programada
  const row = page.locator('[data-testid=gtd-task-title]', { hasText: 'Con hora' }).first();
  if (isMobile) await app.press(row);
  else await row.dblclick();
  await page.locator('[data-testid=gtd-editor-schedule-btn]').click();
  await page.locator('[data-testid=gtd-editor-scheduled]').fill('');
  await page.locator('[data-testid=gtd-editor-schedule-btn]').click();
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const today = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  await expect(page.locator('[data-testid=gtd-editor-scheduled]')).toHaveValue(today);
  await page.locator('[data-testid=gtd-editor-scheduled-time]').fill('10:30');
  await page.locator('[data-testid=gtd-editor-title]').click();
  await page.locator('[data-testid=gtd-editor-title]').press('Enter');
  expect(await app.fileAfterSync('/tasks.org')).toContain(`SCHEDULED: <${today} `);
  expect(await app.fileAfterSync('/tasks.org')).toMatch(/SCHEDULED: <[^>]* 10:30>/);
  expect(app.errors).toEqual([]);
});

test('GTD (3.35): flechas solo entre secciones; menú lateral con ↑ ↓, borde y arrastre', async ({
  app,
  isMobile,
}) => {
  await app.open(
    { '/tasks.org': '* PROJECT Casa\n** NEXT Pintar\n* NEXT Suelta\n', '/inbox.org': '' },
    '/gtd'
  );
  await gtd.ready(app);
  const page = app.page;
  const sideOpen = () => page.$eval('.gtd', (g) => g.classList.contains('is-side-open'));
  const on = () =>
    page.$eval('.gtd-side .gtd-side__item.is-on .gtd-side__label', (x) => x.textContent.trim());
  // (a) (4.60) abrir un proyecto SÍ crea paso: ← vuelve a la MISMA sección (Next) y → al proyecto
  await gtd.openList(app, 'Inbox');
  await gtd.openList(app, 'Next');
  if (isMobile) await page.click('.gtd-main__menu');
  await app.press(page.locator('[data-testid=gtd-project]', { hasText: 'Casa' }).first());
  await page.waitForTimeout(500);
  expect(await on()).toBe('Casa');
  await page.locator('[data-testid=eli-nav-back]').click();
  await page.waitForTimeout(500);
  expect(await on()).toBe('Next');
  await page.locator('[data-testid=eli-nav-forward]').click();
  await page.waitForTimeout(500);
  expect(await on()).toBe('Casa');
  await page.locator('[data-testid=eli-nav-back]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-testid=eli-nav-back]').click();
  await page.waitForTimeout(500);
  expect(await on()).toBe('Inbox');
  await page.locator('[data-testid=eli-nav-forward]').click();
  await page.waitForTimeout(500);
  expect(await on()).toBe('Next');
  if (isMobile) {
    // (3.39a) las flechas de arriba solo son historial: no abren el menú lateral
    expect(await sideOpen()).toBe(false);
  }

  if (!isMobile) {
    // (b) ↑ ↓ en el menú: cambia de sección y el menú sigue con el foco
    await page.setViewportSize({ width: 600, height: 800 });
    await page.click('.gtd-main__menu');
    await page.locator('[data-testid=gtd-list-next]').focus();
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(300);
    expect(await sideOpen()).toBe(true);
    expect(await on()).not.toBe('Next');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    expect(await sideOpen()).toBe(false);
  } else {
    // (c) deslizar desde el borde izquierdo abre el menú
    expect(await sideOpen()).toBe(false);
    await app.touchDrag({ x: 8, y: 400 }, { x: 180, y: 405 }, { hold: 0, steps: 8 });
    await page.waitForTimeout(400);
    expect(await sideOpen()).toBe(true);
    // con el menú ya abierto, se elige Next en él (y se cierra)
    await app.press(page.locator('[data-testid=gtd-list-next]'));
    await page.waitForTimeout(600);
    expect(await sideOpen()).toBe(false);
    // (d) arrastre: al borde se abre; al alejar la tarea se oculta
    const box = await page
      .locator('[data-testid=gtd-task-title]', { hasText: 'Suelta' })
      .first()
      .boundingBox();
    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, p) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [p] : [] });
    await touch('touchStart', from);
    await page.waitForTimeout(700);
    for (const x of [from.x - 40, 100, 30, 20]) {
      await touch('touchMove', { x, y: from.y });
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(300);
    expect(await sideOpen()).toBe(true);
    const w = page.viewportSize().width;
    for (const x of [200, w - 30, w - 10]) {
      await touch('touchMove', { x, y: from.y + 60 });
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(300);
    expect(await sideOpen()).toBe(false);
    await touch('touchEnd');
  }
  expect(app.errors).toEqual([]);
});
