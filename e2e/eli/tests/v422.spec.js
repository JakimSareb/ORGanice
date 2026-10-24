// 4.22: un proyecto dentro de otro sale en el menú lateral colgando de su madre (↳) y como una
// fila más dentro del proyecto padre.
const { test, expect, gtd } = require('../harness');

const TASKS = `#+TODO: TODO NEXT WAITING MAYBE PROJECT | DONE CANCELLED
* PROJECT Casa
** NEXT Pintar
** PROJECT Cocina
*** NEXT Azulejos
`;

test('4.22: subproyecto en el menú lateral y en el proyecto padre', async ({ app }) => {
  const { page } = app;
  await app.open({ '/tasks.org': TASKS, '/inbox.org': '' });
  await gtd.ready(app);
  if (app.mobile) await page.click('.gtd-main__menu');
  const sub = page.locator('[data-testid=gtd-project]', { hasText: 'Cocina' }).first();
  await expect(sub).toBeVisible({ timeout: 15000 });
  await expect(sub.locator('.gtd-side__sub-arrow')).toHaveCount(1);
  await app.press(page.locator('[data-testid=gtd-project]', { hasText: 'Casa' }).first());
  await page.waitForTimeout(800);
  await expect(
    page.locator('[data-testid=gtd-task-title]', { hasText: 'Cocina' }).first()
  ).toBeVisible({ timeout: 10000 });
  expect(app.errors).toEqual([]);
});
