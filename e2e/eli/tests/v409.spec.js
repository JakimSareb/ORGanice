// 4.09: viñeta más fácil de tocar con el dedo; GTD: botón de tabla y buscador de áreas en el
// editor; Menú ☰: Procesos bajo Herramientas, Agenda en el Modo Notas, reloj en marcha
// (relojito en el ☰ y «Mostrar tareas con reloj activo»)
const { test, expect, gtd } = require('../harness');

const BASE = { '/tasks.org': '', '/inbox.org': '' };
const CLOCKED = `* TODO Reloj corriendo
:LOGBOOK:
CLOCK: [2026-10-21 Wed 08:00]
:END:
* Otra cosa
`;

const menuItems = async (app) => {
  await app.page.locator('[data-testid=eli-more-top]').click();
  const menu = app.page.locator('[data-testid=eli-more-top-menu]');
  await expect(menu).toBeVisible();
  return menu
    .locator('.eli-more__item')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
};

const openTask = async (app, title) => {
  const t = app.page.locator(`[data-testid=gtd-task-title]:has-text("${title}")`);
  if (app.mobile) await app.press(t);
  else await t.dblclick();
  await expect(app.page.locator('.gtd-editor')).toHaveCount(1);
  await app.page.waitForTimeout(600);
};

test('4.09: GTD, botón de tabla: tabla vacía en las notas y su 1.ª celda abierta', async ({
  app,
}) => {
  const { page } = app;
  await app.open({ '/tasks.org': '* NEXT Pintar\nNotas de pintar\n', '/inbox.org': '' });
  await gtd.ready(app);
  await gtd.openList(app, 'Next');
  await openTask(app, 'Pintar');
  // en el móvil, la barra sale al editar las notas
  const preview = page.locator('[data-testid=gtd-editor-notes-preview]');
  if (await preview.isVisible()) await preview.click();
  else await page.locator('[data-testid=gtd-editor-notes]').click();
  await page.waitForTimeout(400);
  await page.locator('.gtd-editor [data-testid=gtd-editor-table-btn]').click();
  await expect(page.locator('[data-testid=gtd-editor-table]')).toHaveCount(1);
  await expect(page.locator('[data-testid=eli-table-cell-input]')).toBeVisible({ timeout: 5000 });
  await page.locator('[data-testid=gtd-editor-save]').click();
  await expect
    .poll(() => app.fileAfterSync('/tasks.org'), { timeout: 15000 })
    .toMatch(/Notas de pintar\n\s*\|.*\|\n\s*\|---\+---\+---\|/);
  expect(app.errors).toEqual([]);
});

test('4.09: GTD, el Área abre un buscador con las áreas y deja escribir una nueva', async ({
  app,
}) => {
  const { page } = app;
  await app.open({
    '/tasks.org': '* NEXT Pintar\n* NEXT Barrer\n:PROPERTIES:\n:AREA: Casa\n:END:\n',
    '/inbox.org': '',
  });
  await gtd.ready(app);
  await gtd.openList(app, 'Next');
  await openTask(app, 'Pintar');
  await page.locator('.gtd-editor [data-testid=gtd-editor-area-add]').click();
  await expect(page.locator('[data-testid=eli-ask-pick]')).toBeVisible();
  await expect(page.locator('[data-testid=eli-pick-item]', { hasText: 'Casa' })).toHaveCount(1);
  await page.locator('[data-testid=eli-pick-search]').fill('Trabajo');
  await page.locator('[data-testid=eli-pick-new]').click();
  await expect(page.locator('[data-testid=eli-ask-pick]')).toHaveCount(0);
  await expect(page.locator('.gtd-editor [data-testid=gtd-editor-area-chip]')).toContainText(
    'Trabajo'
  );
  // la que ya existe se elige de la lista
  await page.locator('.gtd-editor [data-testid=gtd-editor-area-chip]').click();
  await page.locator('[data-testid=eli-pick-item]', { hasText: 'Casa' }).click();
  await expect(page.locator('.gtd-editor [data-testid=gtd-editor-area-chip]')).toContainText(
    'Casa'
  );
  await page.locator('[data-testid=gtd-editor-save]').click();
  await expect
    .poll(() => app.fileAfterSync('/tasks.org'), { timeout: 15000 })
    .toMatch(/\* NEXT Pintar\n:PROPERTIES:\n:AREA:\s+Casa\n:END:/);
  expect(app.errors).toEqual([]);
});

test('4.09: Menú ☰: Procesos justo debajo de Herramientas', async ({ app }) => {
  await app.open({ '/tasks.org': '* NEXT Algo\n', '/inbox.org': '' });
  await gtd.ready(app);
  const items = await menuItems(app);
  const tools = items.indexOf('eli-menu-tools');
  expect(tools).toBeGreaterThan(-1);
  // (4.37) el orden por defecto es el del usuario: Procesos está en el menú, en el lugar que marca su orden
  expect(items.indexOf('eli-menu-processes')).toBeGreaterThan(-1);
  expect(app.errors).toEqual([]);
});

test('4.09: Modo Notas: Agenda en el Menú y ajuste para quitarla', async ({ app }) => {
  const { page } = app;
  await app.open({ ...BASE, '/notas.org': '* Una\n* Dos\n' }, '/file/notas.org', {
    localStorage: { eliNotesMode: 'true' },
  });
  await expect(page.locator('text=Dos').first()).toBeVisible({ timeout: 20000 });
  const items = await menuItems(app);
  expect(items[1]).toBe('eli-agenda-menu');
  await page.locator('[data-testid=eli-agenda-menu]').click();
  await expect(page.locator('.agenda__tab-container')).toBeVisible();
  await page.goto('/settings');
  const sw = page.locator('[data-testid=eli-setting-notes-agenda]');
  await expect(sw).toBeVisible({ timeout: 20000 });
  await sw.locator('.switch').click();
  await page.waitForTimeout(300);
  await page.goto('/file/notas.org');
  await expect(page.locator('text=Dos').first()).toBeVisible({ timeout: 20000 });
  expect(await menuItems(app)).not.toContain('eli-agenda-menu');
  expect(app.errors).toEqual([]);
});

test('4.09: reloj en marcha (Documentos): relojito en el ☰ y lista de tareas con reloj', async ({
  app,
}) => {
  const { page } = app;
  await app.open({ ...BASE, '/notas.org': CLOCKED }, '/file/notas.org');
  await expect(page.locator('text=Otra cosa').first()).toBeVisible({ timeout: 20000 });
  await expect(page.locator('[data-testid=eli-more-top-badge]')).toBeVisible();
  const items = await menuItems(app);
  expect(items).toContain('eli-running-clocks');
  await page.locator('[data-testid=eli-running-clocks]').click();
  const item = page.locator('[data-testid=eli-pick-item]', { hasText: 'Reloj corriendo' });
  await expect(item).toHaveCount(1);
  await item.click();
  await expect(page.locator('.header--selected')).toContainText('Reloj corriendo', {
    timeout: 5000,
  });
  expect(app.errors).toEqual([]);
});

test('4.09: reloj en marcha (GTD): al elegirla, se abre la tarea', async ({ app }) => {
  const { page } = app;
  await app.open({ '/tasks.org': CLOCKED, '/inbox.org': '' });
  await gtd.ready(app);
  await expect(page.locator('[data-testid=eli-more-top-badge]')).toBeVisible({ timeout: 20000 });
  await menuItems(app);
  await page.locator('[data-testid=eli-running-clocks]').click();
  await page.locator('[data-testid=eli-pick-item]', { hasText: 'Reloj corriendo' }).click();
  await expect(page.locator('.gtd-editor')).toHaveCount(1, { timeout: 5000 });
  await expect(page.locator('[data-testid=gtd-editor-title]')).toHaveValue(/Reloj corriendo/);
  expect(app.errors).toEqual([]);
});

test('4.09: sin reloj en marcha, ni relojito ni opción', async ({ app }) => {
  const { page } = app;
  await app.open({ ...BASE, '/notas.org': '* Una\n* Dos\n' }, '/file/notas.org');
  await expect(page.locator('text=Dos').first()).toBeVisible({ timeout: 20000 });
  await expect(page.locator('[data-testid=eli-more-top-badge]')).toHaveCount(0);
  expect(await menuItems(app)).not.toContain('eli-running-clocks');
  expect(app.errors).toEqual([]);
});

test('4.09: móvil: la viñeta se toca también a su izquierda (área mayor)', async ({ app }) => {
  test.skip(!app.mobile, 'solo con el dedo');
  const { page } = app;
  await app.open(
    { ...BASE, '/notas.org': '* Padre\n** Hija\n*** Nieta\n* Otro\n' },
    '/file/notas.org'
  );
  await expect(page.locator('text=Otro').first()).toBeVisible({ timeout: 20000 });
  const coarse = await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches);
  test.skip(!coarse, 'sin pointer: coarse');
  if (!(await page.locator('text=Hija').first().isVisible())) {
    await page.locator('[data-testid=eli-more-top]').click();
    await page.locator('[data-testid=eli-menu-view]').click();
    await page.locator('[data-testid=eli-expand-all]').click();
    await expect(page.locator('text=Nieta').first()).toBeVisible();
    await page.waitForTimeout(400);
  }
  // la de «Hija» (sangrada: la de primer nivel está pegada al borde de la pantalla)
  const bullet = page.locator('[data-testid=header-bullet]').nth(1);
  const box = await bullet.boundingBox();
  // a la izquierda, encima y debajo del icono también es la viñeta
  for (const [dx, dy] of [
    [-Math.min(12, box.x - 2), box.height / 2],
    [box.width / 2, -4],
    [box.width / 2, box.height + 4],
  ]) {
    const hit = await page.evaluate(
      ([x, y]) => {
        const el = document.elementFromPoint(x, y);
        return el && el.closest && el.closest('.header__bullet')
          ? 'bullet'
          : `${el && el.tagName}.${el && el.className}`;
      },
      [box.x + dx, box.y + dy]
    );
    expect(`${Math.round(dx)},${Math.round(dy)}: ${hit}`).toBe(
      `${Math.round(dx)},${Math.round(dy)}: bullet`
    );
  }
  // y no tapa el título
  const title = await page.locator('.title-line').first().boundingBox();
  const onTitle = await page.evaluate(
    ([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return !!(el && el.closest && el.closest('.title-line'));
    },
    [title.x + 8, title.y + title.height / 2]
  );
  expect(onTitle).toBe(true);
  expect(app.errors).toEqual([]);
});
