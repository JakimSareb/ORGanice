// 4.11: Documentos: margen libre a la izquierda con el dedo y ajuste del toque en el título;
// GTD: enlaces, reloj (CLOCK), exportar (PDF / Org) y enlace propio de la tarea
const { test, expect, gtd } = require('../harness');

const BASE = { '/tasks.org': '', '/inbox.org': '' };
const DOC = `* Padre
Texto del padre
** Hija
* Segunda
`;
const TIMED = `* NEXT Pintar
:LOGBOOK:
CLOCK: [2026-10-21 Wed 10:00]--[2026-10-21 Wed 11:30] =>  1:30
:END:
Notas de pintar
** TODO Imprimar
* NEXT Barnizar
`;

const waitDoc = async (app, title) =>
  expect(app.page.locator(`text=${title}`).first()).toBeVisible({ timeout: 20000 });

const openTask = async (app, title) => {
  const t = app.page.locator(`[data-testid=gtd-task-title]:has-text("${title}")`).first();
  if (app.mobile) await app.press(t);
  else await t.dblclick();
  await expect(app.page.locator('.gtd-editor')).toHaveCount(1);
  await app.page.waitForTimeout(600);
};

test('4.11: Ajustes › Apariencia: el toque en el título se elige y sale también en Modo Notas', async ({
  app,
}) => {
  const { page } = app;
  await app.open(BASE, '/settings');
  await page.locator('[data-testid=eli-settings-appearance] > summary').click();
  const setting = page.locator('[data-testid=eli-setting-tap-header]');
  await expect(setting).toBeVisible({ timeout: 20000 });
  await expect(page.locator('[data-testid=eli-setting-tap-task-mobile]')).toHaveCount(1);
  await setting.getByText('Editar', { exact: true }).click();
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('eliTapMode') || '{}').header)
  ).toBe('edit');
  // Modo Notas: solo el de las cabeceras
  await page.evaluate(() => localStorage.setItem('eliNotesMode', 'true'));
  await page.goto('/settings');
  await page.locator('[data-testid=eli-settings-appearance] > summary').click();
  await expect(page.locator('[data-testid=eli-setting-tap-header]')).toBeVisible({
    timeout: 20000,
  });
  await expect(page.locator('[data-testid=eli-setting-tap-task-mobile]')).toHaveCount(0);
  expect(app.errors).toEqual([]);
});

test('4.11: toque «Editar»: el primer toque en el título ya lo edita', async ({ app }) => {
  const { page } = app;
  await app.open({ ...BASE, '/notas.org': DOC }, '/file/notas.org', {
    localStorage: { eliTapMode: JSON.stringify({ header: 'edit' }) },
  });
  await waitDoc(app, 'Segunda');
  await app.press(page.locator('text=Segunda').first());
  await expect(page.locator('[data-testid=titleLineInput]')).toHaveCount(1, { timeout: 5000 });
  expect(app.errors).toEqual([]);
});

test('4.11: toque «Desplegar»: el toque en el título pliega y despliega', async ({ app }) => {
  const { page } = app;
  await app.open({ ...BASE, '/notas.org': DOC }, '/file/notas.org', {
    localStorage: { eliTapMode: JSON.stringify({ header: 'open' }) },
  });
  await waitDoc(app, 'Segunda');
  const body = page.locator('text=Texto del padre');
  const before = await body.first().isVisible();
  await app.press(page.locator('.title-line-text', { hasText: 'Padre' }).first());
  await page.waitForTimeout(400);
  expect(await body.first().isVisible()).toBe(!before);
  await expect(page.locator('[data-testid=titleLineInput]')).toHaveCount(0);
  expect(app.errors).toEqual([]);
});

test('4.11: con el dedo, la lista deja 14 px libres a la izquierda (ordenador: ninguno)', async ({
  app,
}) => {
  const { page } = app;
  await app.open({ ...BASE, '/notas.org': DOC }, '/file/notas.org');
  await waitDoc(app, 'Segunda');
  const pad = await page
    .locator('.header-list-container')
    .first()
    .evaluate((el) => getComputedStyle(el).paddingLeft);
  expect(pad).toBe(app.mobile ? '14px' : '0px');
  expect(app.errors).toEqual([]);
});

test('4.11: GTD, reloj: iniciar y parar desde el editor', async ({ app }) => {
  const { page } = app;
  await app.open({ '/tasks.org': '* NEXT Pintar\n', '/inbox.org': '' });
  await gtd.ready(app);
  await gtd.openList(app, 'Next');
  await openTask(app, 'Pintar');
  const toggle = page.locator('[data-testid=gtd-editor-clock-toggle]');
  await expect(toggle).toContainText('Iniciar reloj');
  await toggle.click();
  await expect
    .poll(() => app.fileAfterSync('/tasks.org'), { timeout: 15000 })
    .toMatch(/:LOGBOOK:\n\s*CLOCK: \[\d{4}-\d\d-\d\d \w{3} \d\d:\d\d\]\n/);
  await expect(page.locator('[data-testid=gtd-editor-clock-toggle]')).toContainText('Parar reloj');
  await expect(page.locator('[data-testid=gtd-editor-clock-summary]')).toContainText(
    'reloj en marcha'
  );
  await page.locator('[data-testid=gtd-editor-clock-toggle]').click();
  await expect
    .poll(() => app.fileAfterSync('/tasks.org'), { timeout: 15000 })
    .toMatch(/CLOCK: \[[^\]]+\]--\[[^\]]+\] =>/);
  expect(app.errors).toEqual([]);
});

test('4.11: GTD, registros CLOCK: total, cambiar el fin y borrar', async ({ app }) => {
  const { page } = app;
  await app.open({ '/tasks.org': TIMED, '/inbox.org': '' });
  await gtd.ready(app);
  await gtd.openList(app, 'Next');
  await openTask(app, 'Pintar');
  const summary = page.locator('[data-testid=gtd-editor-clock-summary]');
  await expect(summary).toContainText('1:30');
  await expect(summary).toContainText('1 registro');
  await summary.click();
  await expect(page.locator('[data-testid=gtd-clock-row]')).toHaveCount(1);
  await expect(page.locator('[data-testid=gtd-clock-total]')).toContainText('1:30');
  const end = page.locator('[data-testid=gtd-clock-end]');
  await end.fill('2026-10-21T12:00');
  await end.blur();
  await expect
    .poll(() => app.fileAfterSync('/tasks.org'), { timeout: 15000 })
    .toMatch(/--\[2026-10-21 Wed 12:00\] =>\s+2:00/);
  await expect(page.locator('[data-testid=gtd-clock-total]')).toContainText('2:00', {
    timeout: 10000,
  });
  await page.locator('[data-testid=gtd-clock-delete]').click();
  await expect
    .poll(() => app.fileAfterSync('/tasks.org'), { timeout: 15000 })
    .not.toMatch(/CLOCK:/);
  expect(app.errors).toEqual([]);
});

test('4.11: GTD, el resumen del tiempo sale al final de las notas de la fila', async ({ app }) => {
  const { page } = app;
  await app.open({ '/tasks.org': TIMED, '/inbox.org': '' });
  await gtd.ready(app);
  await gtd.openList(app, 'Next');
  // el icono de notas recorre ocultas → parciales → completas
  const clock = page.locator('[data-testid=gtd-notes-clock]');
  for (let i = 0; i < 3 && !(await clock.first().isVisible()); i++) {
    await app.press(page.locator('[data-testid=gtd-notes-toggle]').first());
    await page.waitForTimeout(400);
  }
  await expect(clock.first()).toContainText('1:30', { timeout: 10000 });
  expect(app.errors).toEqual([]);
});

test('4.11: GTD, enlace a otra tarea en las notas (con :ID: en la otra)', async ({ app }) => {
  const { page } = app;
  await app.open({ '/tasks.org': TIMED, '/inbox.org': '' });
  await gtd.ready(app);
  await gtd.openList(app, 'Next');
  await openTask(app, 'Pintar');
  const preview = page.locator('[data-testid=gtd-editor-notes-preview]');
  if (await preview.isVisible()) await preview.click();
  else await page.locator('[data-testid=gtd-editor-notes]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-testid=gtd-editor-link-task]').click();
  await page.locator('[data-testid=eli-pick-item]', { hasText: 'Barnizar' }).click();
  await expect(
    page.locator('[data-testid=gtd-editor-notes]')
  ).toHaveValue(/\[\[id:[^\]]+\]\[Barnizar\]\]/, { timeout: 10000 });
  await page.locator('[data-testid=gtd-editor-save]').click();
  await expect
    .poll(() => app.fileAfterSync('/tasks.org'), { timeout: 15000 })
    .toMatch(/\* NEXT Barnizar\n:PROPERTIES:\n:ID: [^\n]+\n:END:/);
  expect(await app.fileAfterSync('/tasks.org')).toMatch(
    /Notas de pintar\n?\[\[id:[^\]]+\]\[Barnizar\]\]/
  );
  expect(app.errors).toEqual([]);
});

test('4.11: GTD, 🔗 abre el diálogo de enlace', async ({ app }) => {
  const { page } = app;
  await app.open({ '/tasks.org': TIMED, '/inbox.org': '' });
  await gtd.ready(app);
  await gtd.openList(app, 'Next');
  await openTask(app, 'Pintar');
  const preview = page.locator('[data-testid=gtd-editor-notes-preview]');
  if (await preview.isVisible()) await preview.click();
  else await page.locator('[data-testid=gtd-editor-notes]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-testid=gtd-editor-link]').click();
  await expect(page.locator('[data-testid=eli-link-dialog]')).toBeVisible({ timeout: 5000 });
  expect(app.errors).toEqual([]);
});

test('4.11: GTD, «Enlace» pone :ID: a la tarea; «PDF» lleva sus subtareas', async ({ app }) => {
  const { page } = app;
  await app.open({ '/tasks.org': TIMED, '/inbox.org': '' });
  await gtd.ready(app);
  await gtd.openList(app, 'Next');
  await openTask(app, 'Pintar');
  await page
    .context()
    .grantPermissions(['clipboard-read', 'clipboard-write'])
    .catch(() => {});
  await page.locator('[data-testid=gtd-editor-copy-link]').click();
  await expect
    .poll(() => app.fileAfterSync('/tasks.org'), { timeout: 15000 })
    .toMatch(/\* NEXT Pintar\n:PROPERTIES:\n:ID: [^\n]+\n:END:/);
  // el editor se recrea al cambiar la tarea (y si el portapapeles no deja copiar, se muestra el aviso)
  await page.waitForTimeout(800);
  const ok = page.locator('.eli-prompt__overlay .eli-prompt__ok');
  if (await ok.first().isVisible()) await ok.first().click();
  await page.locator('[data-testid=gtd-editor-export-pdf]').click();
  const doc = page.locator('.eli-print__doc');
  await expect(doc).toBeVisible({ timeout: 10000 });
  await expect(doc).toContainText('Pintar');
  await expect(doc).toContainText('Imprimar');
  await expect(doc).not.toContainText('Barnizar');
  expect(app.errors).toEqual([]);
});

test('4.11: GTD, el menú de la fila trae reloj, enlace y exportar', async ({ app }) => {
  test.skip(app.mobile, 'el menú de la fila con clic derecho es del ordenador');
  const { page } = app;
  await app.open({ '/tasks.org': TIMED, '/inbox.org': '' });
  await gtd.ready(app);
  await gtd.openList(app, 'Next');
  await page
    .locator('[data-testid=gtd-task-title]:has-text("Pintar")')
    .first()
    .click({ button: 'right' });
  for (const id of ['gtd-menu-clock', 'gtd-menu-copy-link', 'gtd-menu-pdf', 'gtd-menu-org']) {
    await expect(page.locator(`[data-testid=${id}]`)).toBeVisible({ timeout: 5000 });
  }
  await page.locator('[data-testid=gtd-menu-clock]').click();
  await expect
    .poll(() => app.fileAfterSync('/tasks.org'), { timeout: 15000 })
    .toMatch(/CLOCK: \[[^\]]+\]\n/);
  expect(app.errors).toEqual([]);
});
