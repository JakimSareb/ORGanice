// 4.14: Replanificar un proyecto existente (⋯ de la vista del proyecto) con el Modelo de
// Planificación Natural: precarga el propósito de las notas y añade solo lo nuevo.
const { test, expect, gtd } = require('../harness');

test('4.14: Replanificar un proyecto: propósito precargado y se añade la acción nueva', async ({
  app,
}) => {
  const { page } = app;
  await app.open({
    '/tasks.org': '* PROJECT Casa\nPropósito: Tener un hogar bonito\nOtras notas\n** NEXT Pintar\n',
    '/inbox.org': '',
  });
  await gtd.ready(app);
  if (app.mobile) await page.click('.gtd-main__menu');
  await app.press(page.locator('[data-testid=gtd-project]', { hasText: 'Casa' }).first());
  await page.waitForTimeout(800);
  await app.press(page.locator('[data-testid=gtd-view-menu-button]'));
  await page.click('[data-testid=gtd-menu-replan]');
  await expect(page.locator('[data-testid=gtd-guided]')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('[data-testid=gtd-plan-existing]')).toContainText('Casa');
  await expect(page.locator('[data-testid=gtd-plan-purpose]')).toHaveValue('Tener un hogar bonito');
  await page.locator('[data-testid=gtd-plan-principles]').fill('Sin deudas');
  const next = page.locator('[data-testid=gtd-guided-next]');
  for (let i = 0; i < 4; i++) await next.click();
  await page.locator('[data-testid=gtd-plan-first]').fill('Llamar al pintor');
  await next.click();
  await page.locator('[data-testid=gtd-plan-create]').click();
  await expect(page.locator('[data-testid=gtd-guided]')).toHaveCount(0);
  await expect
    .poll(async () => (await app.fileAfterSync('/tasks.org', 500)) || '', { timeout: 15000 })
    .toMatch(/Llamar al pintor/);
  const text = await app.fileAfterSync('/tasks.org', 500);
  expect(text).toContain('Principios: Sin deudas');
  expect(text).toContain('Otras notas');
  expect(text.match(/Pintar$/gm).length).toBe(1);
  expect(app.errors).toEqual([]);
});
