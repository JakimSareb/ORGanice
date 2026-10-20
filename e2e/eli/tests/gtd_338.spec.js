// GTD (3.38): editor — Esc guarda, «＋ Subtarea», deslizar la hoja sin teclado
const { test, expect, gtd } = require('../harness');

const TASKS = `* NEXT Tarea madre
Una nota.
* NEXT Otra tarea
`;

const openEditor = async (app, title) => {
  const t = app.page.locator(`[data-testid=gtd-task-title]:has-text("${title}")`);
  if (app.mobile) await app.press(t);
  else await t.dblclick();
  await expect(app.page.locator('.gtd-editor')).toHaveCount(1);
  await app.page.waitForTimeout(600); // fin de la animación de apertura
};

test('GTD (3.38): Esc guarda y «＋ Subtarea» crea una hija', async ({ app }) => {
  const { page } = app;
  await app.open({ '/tasks.org': TASKS, '/inbox.org': '' });
  await gtd.ready(app);
  await gtd.openList(app, 'Next');

  // Esc = guardar
  await openEditor(app, 'Otra tarea');
  const title = page.locator('[data-testid=gtd-editor-title]');
  if (app.mobile) await title.tap();
  await title.fill('Otra tarea cambiada');
  await page.keyboard.press('Escape');
  await expect(page.locator('.gtd-editor')).toHaveCount(0);
  expect(await app.fileAfterSync('/tasks.org')).toContain('* NEXT Otra tarea cambiada');

  // ＋ Subtarea: guarda la abierta y abre el editor de una hija con el cursor en el título
  await openEditor(app, 'Tarea madre');
  await page.click('[data-testid=gtd-editor-add-subtask]');
  await expect(page.locator('[data-testid=gtd-new-subtask-of]')).toContainText('Tarea madre');
  await page.waitForTimeout(300);
  const focused = await page.evaluate(
    () => document.activeElement && document.activeElement.getAttribute('data-testid')
  );
  expect(focused).toBe('gtd-editor-title');
  await page.keyboard.type('La hija');
  await page.keyboard.press('Enter');
  const f = await app.fileAfterSync('/tasks.org');
  expect(f).toMatch(/\* NEXT Tarea madre[\s\S]*\n\*\* NEXT La hija/);
  expect(app.errors).toEqual([]);
});

test('GTD (3.38): deslizar la hoja hacia abajo no saca el teclado', async ({ app }) => {
  test.skip(!app.mobile, 'solo móvil');
  const { page } = app;
  await app.open({ '/tasks.org': TASKS, '/inbox.org': '' });
  await gtd.ready(app);
  await gtd.openList(app, 'Next');
  await openEditor(app, 'Otra tarea');
  await page.evaluate(() => {
    window.__focused = [];
    document.addEventListener('focusin', (e) =>
      window.__focused.push(e.target.getAttribute('data-testid'))
    );
  });
  const box = await page.locator('[data-testid=gtd-editor-title]').boundingBox();
  const from = { x: box.x + 40, y: box.y + box.height / 2 };
  await app.touchDrag(from, { x: from.x, y: from.y + 320 }, { hold: 0 });
  await page.waitForTimeout(700);
  await expect(page.locator('.gtd-editor')).toHaveCount(0);
  const got = await page.evaluate(() => window.__focused);
  expect(got).not.toContain('gtd-editor-title');
  expect(app.errors).toEqual([]);
});
