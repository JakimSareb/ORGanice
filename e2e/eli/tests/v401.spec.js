// 4.01: GTD, botón de fecha y hora en la barra de arriba del editor (entre Rehacer y «Aa»);
// Menú ☰ con «Buscar» la primera opción y «Ajustes» la última; «Agenda» en el Menú de Documentos
const { test, expect, gtd } = require('../harness');

const STAMP = /\[\d{4}-\d\d-\d\d \w+ \d\d:\d\d\]/;

const topItems = async (app) => {
  await app.page.locator('[data-testid=eli-more-top]').click();
  const menu = app.page.locator('[data-testid=eli-more-top-menu]');
  await expect(menu).toBeVisible();
  return menu
    .locator('.eli-more__item')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
};

test('4.01: GTD, fecha y hora entre Rehacer y el formato (notas y título)', async ({ app }) => {
  const { page } = app;
  await app.open({ '/tasks.org': '* NEXT Pintar\nNotas de pintar\n', '/inbox.org': '' });
  await gtd.ready(app);
  await gtd.openList(app, 'Next');
  const t = page.locator('[data-testid=gtd-task-title]:has-text("Pintar")');
  if (app.mobile) await app.press(t);
  else await t.dblclick();
  await expect(page.locator('.gtd-editor')).toHaveCount(1);
  await page.waitForTimeout(600);

  const order = await page
    .locator('.gtd-editor [data-testid=eli-format-bar] > button')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  // (4.09) y luego la tabla
  // (4.11) y los enlaces (a la web / a otra tarea)
  expect(order.slice(0, 8)).toEqual([
    'gtd-editor-undo',
    'gtd-editor-redo',
    'gtd-editor-now',
    'gtd-editor-table-btn',
    'gtd-editor-link',
    'gtd-editor-link-heading',
    'gtd-editor-link-task',
    'eli-format-toggle',
  ]);
  // con el cursor en las notas: en las notas
  const notes = page.locator('[data-testid=gtd-editor-notes]');
  const preview = page.locator('[data-testid=gtd-editor-notes-preview]');
  if (await preview.isVisible()) await preview.click();
  else await notes.click();
  await page.waitForTimeout(400);
  await page.keyboard.press('End');
  // dentro del «Aa» ya no está repetido (en el móvil, la fila sale al editar)
  const toggle = page.locator('.gtd-editor [data-testid=eli-format-toggle]');
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(page.locator('.gtd-editor [data-testid=eli-format-now]')).toHaveCount(0);

  await page.click('.gtd-editor [data-testid=gtd-editor-now]');
  await expect(notes).toHaveValue(new RegExp('Notas de pintar\\s*' + STAMP.source));

  // con el cursor en el título: en el título
  const title = page.locator('[data-testid=gtd-editor-title]');
  await title.click();
  await page.waitForTimeout(300);
  await page.keyboard.press('End');
  await page.click('.gtd-editor [data-testid=gtd-editor-now]');
  await expect(title).toHaveValue(new RegExp('^Pintar\\s*' + STAMP.source));
  await page.click('[data-testid=gtd-editor-cancel]');
  await expect(page.locator('.gtd-editor')).toHaveCount(0);
  expect(app.errors).toEqual([]);
});

test('4.01/4.04: Menú ☰ de GTD: Buscar la primera, Agenda la segunda, Ajustes la última', async ({
  app,
}) => {
  await app.open({ '/tasks.org': '* NEXT Algo\n', '/inbox.org': '' });
  await gtd.ready(app);
  const items = await topItems(app);
  expect(items[0]).toBe('eli-find-menu');
  expect(items[1]).toBe('eli-agenda-menu');
  expect(items[items.length - 1]).toBe('eli-settings');
  expect(app.errors).toEqual([]);
});

test('4.01: Menú ☰ de Documentos: Buscar, …, Agenda, …, Ajustes', async ({ app }) => {
  const { page } = app;
  await app.open(
    { '/tasks.org': '', '/inbox.org': '', '/notas.org': '* TODO Una\n* Dos\n' },
    '/file/notas.org'
  );
  await expect(page.locator('text=Dos').first()).toBeVisible({ timeout: 20000 });
  const items = await topItems(app);
  expect(items[0]).toBe('eli-find-menu');
  expect(items[items.length - 1]).toBe('eli-settings');
  expect(items[1]).toBe('eli-agenda-menu');
  await page.locator('[data-testid=eli-agenda-menu]').click();
  await expect(page.locator('.agenda__tab-container')).toBeVisible();
  expect(app.errors).toEqual([]);
});

// (4.09) en el Modo Notas sale salvo que se apague (eliNotesAgenda = 'false')
test('4.01/4.09: Modo Notas con la Agenda apagada: sin Agenda en el Menú', async ({ app }) => {
  const { page } = app;
  await app.open(
    { '/tasks.org': '', '/inbox.org': '', '/notas.org': '* Una\n* Dos\n' },
    '/file/notas.org',
    { localStorage: { eliNotesMode: 'true', eliNotesAgenda: 'false' } }
  );
  await expect(page.locator('text=Dos').first()).toBeVisible({ timeout: 20000 });
  const items = await topItems(app);
  expect(items[0]).toBe('eli-find-menu');
  expect(items[items.length - 1]).toBe('eli-settings');
  expect(items).not.toContain('eli-agenda-menu');
  expect(app.errors).toEqual([]);
});
