// GTD (3.46): interruptor «Subtareas» del ⋯ (apagado por defecto) y «Vista previa» bajo las notas
const { test, expect, gtd } = require('../harness');

const openEditor = async (app, title) => {
  const t = app.page.locator(`[data-testid=gtd-task-title]:has-text("${title}")`);
  if (app.mobile) await app.press(t);
  else await t.dblclick();
  await expect(app.page.locator('.gtd-editor')).toHaveCount(1);
  await app.page.waitForTimeout(600); // fin de la animación de apertura
};
const closeEditor = async (app) => {
  await app.page.click('[data-testid=gtd-editor-cancel]');
  await expect(app.page.locator('.gtd-editor')).toHaveCount(0);
};

const TASKS = `* NEXT Madre [0/1]
** NEXT Hija
* NEXT Otra
`;

test('GTD (3.46): subtareas apagadas por defecto y el interruptor del ⋯', async ({ app }) => {
  const { page } = app;
  // como un usuario nuevo: sin la preferencia guardada (el arnés la enciende)
  await app.open({ '/tasks.org': TASKS, '/inbox.org': '' }, '/gtd', {
    localStorage: { eliGtdSubtasks: 'false' },
  });
  await gtd.ready(app);
  await gtd.openList(app, 'Next');
  await page.waitForTimeout(400);

  // Apagado: la hija es una tarea normal, sin sangría, plegado, indicador ni madre
  await expect(page.locator('[data-testid=gtd-task-title]:has-text("Hija")')).toHaveCount(1);
  await expect(page.locator('.gtd-task.is-sub')).toHaveCount(0);
  await expect(page.locator('[data-testid=gtd-fold]')).toHaveCount(0);
  await expect(page.locator('[data-testid=gtd-task-cookie]')).toHaveCount(0);
  await expect(page.locator('.gtd-meta--parent')).toHaveCount(0);
  await openEditor(app, 'Hija');
  await expect(page.locator('[data-testid=gtd-editor-add-subtask]')).toHaveCount(0);
  await expect(page.locator('[data-testid=gtd-editor-parent]')).toHaveCount(0);
  await closeEditor(app);

  // Encendido: vuelve todo
  await app.press(page.locator('[data-testid=gtd-view-menu-button]'));
  await app.press(page.locator('[data-testid=gtd-menu-subtasks]'));
  await page.waitForTimeout(400);
  await expect(page.locator('.gtd-task.is-sub')).toHaveCount(1);
  await openEditor(app, 'Madre');
  await expect(page.locator('[data-testid=gtd-editor-add-subtask]')).toHaveCount(1);
  await closeEditor(app);
  expect(await page.evaluate(() => localStorage.getItem('eliGtdSubtasks'))).toBe('true');

  // El fichero no cambia
  expect(await app.fileAfterSync('/tasks.org')).toBe(TASKS);
  expect(app.errors).toEqual([]);
});

test('GTD (3.46): «Vista previa» va sobre lo presentado bajo las notas', async ({ app }) => {
  const { page } = app;
  await app.open({
    '/tasks.org': '* NEXT Con casillas\nTexto\n- [ ] Uno\n- [ ] Dos\n* NEXT Sin casillas\nNada\n',
    '/inbox.org': '',
  });
  await gtd.ready(app);
  await gtd.openList(app, 'Next');

  await openEditor(app, 'Sin casillas');
  await expect(page.locator('[data-testid=gtd-editor-preview-label]')).toHaveCount(0);
  await closeEditor(app);

  await openEditor(app, 'Con casillas');
  const label = page.locator('[data-testid=gtd-editor-preview-label]');
  await expect(label).toHaveCount(1);
  const l = await label.boundingBox();
  const n = await page.locator('[data-testid=gtd-editor-notes]').boundingBox();
  const c = await page.locator('[data-testid=gtd-checklist]').boundingBox();
  expect(l.y).toBeGreaterThan(n.y);
  expect(l.y).toBeLessThan(c.y);
  await closeEditor(app);
  expect(app.errors).toEqual([]);
});
