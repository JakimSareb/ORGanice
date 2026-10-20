// 4.0: Modo Notas (sin GTD, herramientas apagadas/encendidas), barra de abajo de 5 botones,
// barra de arriba (← → ↶ ↷ nube Menú) y menús de GTD sin duplicados
const { test, expect, gtd } = require('../harness');

const BASE = { '/tasks.org': '', '/inbox.org': '' };
const DOC = `* Primera
Texto de la primera
* Segunda
`;
const NOTES = { eliNotesMode: 'true' };

const select = async (app, title) => {
  const t = app.page.locator(`text=${title}`).first();
  await expect(t).toBeVisible({ timeout: 20000 });
  await app.press(t);
  await app.page.waitForTimeout(500);
};
const openMenu = async (app) => {
  await app.page.locator('[data-testid=eli-more-top]').click();
  await expect(app.page.locator('[data-testid=eli-more-top-menu]')).toBeVisible();
};

test('4.0: barra de abajo con 5 botones (Editar · Nueva · Añadir · Mover · Más)', async ({
  app,
}) => {
  await app.open({ ...BASE, '/notas.org': DOC }, '/file/notas.org');
  await select(app, 'Segunda');
  const row = app.page.locator('[data-testid=eli-docbar-row-main] > button');
  await expect(row).toHaveCount(5);
  expect(await row.evaluateAll((b) => b.map((x) => x.getAttribute('data-bid')))).toEqual([
    'edit',
    'new',
    'insert',
    'move',
    'more',
  ]);
  // Mover: con y sin subcabeceras, y a otro fichero
  await app.page.locator('[data-testid=eli-docbar-move]').click();
  for (const id of ['up', 'down', 'indent-tree', 'outdent-tree', 'indent', 'outdent', 'refile'])
    await expect(app.page.locator(`[data-testid=eli-docbar-${id}]`)).toBeVisible();
  await app.page.keyboard.press('Escape');
  // Añadir
  await app.page.locator('[data-testid=eli-docbar-insert]').click();
  for (const id of ['att-add', 'link-insert', 'insert'])
    await expect(app.page.locator(`[data-testid=eli-docbar-${id}]`)).toBeVisible();
  await app.page.keyboard.press('Escape');
  // Más (modo completo): también lo de tareas
  await app.page.locator('[data-testid=eli-docbar-more]').click();
  for (const id of ['done-toggle', 'narrow', 'tags', 'share', 'dup', 'delete', 'clock', 'gtd'])
    await expect(app.page.locator(`[data-testid=eli-docbar-${id}]`)).toBeVisible();
  expect(app.errors).toEqual([]);
});

test('4.0: Nueva › Subcabecera crea una hija', async ({ app }) => {
  await app.open({ ...BASE, '/notas.org': DOC }, '/file/notas.org');
  await select(app, 'Segunda');
  await app.page.locator('[data-testid=eli-docbar-new]').click();
  await app.page.locator('[data-testid=eli-docbar-new-sub]').click();
  const input = app.page.locator('[data-testid=titleLineInput]');
  await expect(input).toBeVisible();
  await input.fill('Hija nueva');
  await input.press('Enter');
  const text = await app.fileAfterSync('/notas.org');
  expect(text).toMatch(/\* Segunda\n\*\* Hija nueva/);
  expect(app.errors).toEqual([]);
});

test('4.0: Editar abre una hoja con el título y el texto', async ({ app }) => {
  await app.open({ ...BASE, '/notas.org': DOC }, '/file/notas.org');
  await select(app, 'Primera');
  await app.page.locator('[data-testid=eli-docbar-edit]').click();
  const title = app.page.locator('[data-testid=eli-edit-sheet-title]');
  const notes = app.page.locator('[data-testid=eli-edit-sheet-notes]');
  await expect(title).toHaveValue('Primera');
  await expect(notes).toHaveValue(/Texto de la primera/);
  await expect(app.page.locator('[data-testid=eli-format-bold]')).toBeVisible();
  await expect(app.page.locator('[data-testid=eli-edit-sheet-table]')).toBeVisible();
  await title.fill('Primera cambiada');
  await notes.fill('Otro texto');
  await app.page.locator('[data-testid=eli-edit-sheet-done]').click();
  await expect(app.page.locator('[data-testid=eli-edit-sheet]')).toHaveCount(0);
  const text = await app.fileAfterSync('/notas.org');
  expect(text).toContain('* Primera cambiada\nOtro texto');
  expect(app.errors).toEqual([]);
});

test('4.0: arriba ← → ↶ ↷ nube y Menú (Buscar dentro); Atrás vuelve de «Ver sola»', async ({
  app,
}) => {
  await app.open({ ...BASE, '/notas.org': DOC }, '/file/notas.org');
  await select(app, 'Primera');
  for (const id of ['eli-nav-back', 'eli-nav-forward', 'eli-undo', 'eli-redo', 'eli-sync-btn'])
    await expect(app.page.locator(`.header-bar [data-testid=${id}]`)).toBeVisible();
  // la lupa ya no está a la vista: está en el Menú
  await expect(
    app.page.locator('.header-bar__actions > [data-testid=eli-palette-btn]')
  ).toHaveCount(0);
  await openMenu(app);
  for (const id of ['eli-menu-file', 'eli-palette-btn', 'eli-settings', 'eli-menu-help'])
    await expect(app.page.locator(`[data-testid=${id}]`)).toBeVisible();
  await app.page.keyboard.press('Escape');
  // Ver sola y Atrás
  await app.page.locator('[data-testid=eli-docbar-more]').click();
  await app.page.locator('[data-testid=eli-docbar-narrow]').click();
  await expect(app.page.locator('text=Segunda')).toHaveCount(0);
  await app.page.locator('[data-testid=eli-nav-back]').click();
  await expect(app.page.locator('text=Segunda').first()).toBeVisible();
  await expect(app.page).toHaveURL(/notas\.org/);
  expect(app.errors).toEqual([]);
});

test('4.0: Modo Notas: sin GTD ni lo de tareas', async ({ app }) => {
  await app.open({ ...BASE, '/notas.org': DOC }, '/file/notas.org', { localStorage: NOTES });
  await select(app, 'Primera');
  // sin el cambio Documentos/GTD
  await expect(app.page.locator('[data-testid=eli-mode-toggle]')).toHaveCount(0);
  await app.page.locator('[data-testid=eli-docbar-more]').click();
  for (const id of ['done-toggle', 'narrow', 'tags', 'share', 'dup', 'delete'])
    await expect(app.page.locator(`[data-testid=eli-docbar-${id}]`)).toBeVisible();
  for (const id of ['clock', 'gtd', 'todo', 'star', 'dates', 'props', 'archive', 'capture'])
    await expect(app.page.locator(`[data-testid=eli-docbar-${id}]`)).toHaveCount(0);
  await app.page.keyboard.press('Escape');
  // la vista GTD no se abre: lleva a Documentos
  await app.page.goto('/gtd');
  await expect(app.page).toHaveURL(/\/files/, { timeout: 20000 });
  expect(app.errors).toEqual([]);
});

test('4.0: Modo Notas: herramientas apagadas de inicio; se encienden en Ajustes', async ({
  app,
}) => {
  await app.open({ ...BASE, '/notas.org': DOC }, '/files', { localStorage: NOTES });
  await expect(app.page.locator('text=notas.org').first()).toBeVisible({ timeout: 20000 });
  await openMenu(app);
  await expect(app.page.locator('[data-testid=eli-menu-tools]')).toHaveCount(0);
  await app.page.keyboard.press('Escape');
  await app.page.goto('/settings');
  await expect(app.page.locator('[data-testid=eli-setting-notes-mode]')).toBeVisible({
    timeout: 20000,
  });
  // en Modo Notas no salen los ajustes de GTD ni los avanzados
  await expect(app.page.locator('[data-testid=eli-settings-gtd]')).toHaveCount(0);
  await expect(app.page.locator('[data-testid=eli-settings-advanced]')).toHaveCount(0);
  // encender la Calculadora
  await app.page.locator('[data-testid=eli-settings-tools] > summary').click();
  await app.page.locator('[data-testid=eli-tool-calc] .switch').click();
  await app.page.waitForTimeout(300);
  await app.page.goto('/files');
  await expect(app.page.locator('text=notas.org').first()).toBeVisible({ timeout: 20000 });
  await openMenu(app);
  await app.page.locator('[data-testid=eli-menu-tools]').click();
  await expect(app.page.locator('[data-testid=eli-calculator-menu]')).toBeVisible();
  await expect(app.page.locator('[data-testid=eli-moon]')).toHaveCount(0);
  expect(app.errors).toEqual([]);
});

test('4.0: Ajustes: Modo Notas arriba y «Más temas»', async ({ app }) => {
  await app.open(BASE, '/settings');
  await expect(app.page.locator('[data-testid=eli-setting-notes-mode]')).toBeVisible({
    timeout: 20000,
  });
  await app.page.locator('[data-testid=eli-settings-appearance] > summary').click();
  await expect(app.page.locator('[data-testid=eli-setting-theme]')).toContainText('Nirvana');
  await expect(app.page.locator('[data-testid=eli-theme-more-list]')).toHaveCount(0);
  await app.page.locator('[data-testid=eli-theme-more]').click();
  await expect(app.page.locator('[data-testid=eli-theme-more-list]')).toContainText('Gruvbox');
  // encender el Modo Notas: desaparece lo de GTD
  await app.page.locator('[data-testid=eli-setting-notes-mode] .switch').click();
  await expect(app.page.locator('[data-testid=eli-settings-gtd]')).toHaveCount(0);
  expect(await app.page.evaluate(() => localStorage.getItem('eliNotesMode'))).toBe('true');
  expect(app.errors).toEqual([]);
});

test('4.0: GTD sin el ▾ de la fila ni repetidos en el ⋯', async ({ app }) => {
  await app.open({ '/tasks.org': '* NEXT Algo\n', '/inbox.org': '' });
  await gtd.ready(app);
  await expect(app.page.locator('[data-testid=gtd-task-menu]')).toHaveCount(0);
  await app.press(app.page.locator('[data-testid=gtd-view-menu-button]'));
  await expect(app.page.locator('[data-testid=gtd-view-options]')).toBeVisible();
  for (const id of ['gtd-menu-review', 'gtd-menu-process'])
    await expect(app.page.locator(`[data-testid=${id}]`)).toHaveCount(0);
  await expect(app.page.locator('[data-testid=gtd-view-menu] >> text=Sincronizar')).toHaveCount(0);
  expect(app.errors).toEqual([]);
});
