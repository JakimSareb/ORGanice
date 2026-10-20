// (4.02) Filas de GTD: W / S dentro de la casilla, ★ a la derecha en el móvil, ▾ en el ordenador
const { test, expect, gtd } = require('../harness');

const FILES = {
  '/tasks.org':
    '* PROJECT Casa\n** TODO Viaje\nSCHEDULED: <2099-01-01 Thu>\n** WAITING Llave\n** NEXT Pintar\n',
  '/inbox.org': '',
};

const openCasa = async (app) => {
  const { page } = app;
  if (app.mobile) await page.click('.gtd-main__menu');
  await app.press(page.locator('[data-testid=gtd-project]', { hasText: 'Casa' }).first());
  await page.waitForTimeout(800);
};
const row = (page, title) =>
  page.locator('[data-testid=gtd-task]', {
    has: page.locator(`[data-testid=gtd-task-title]:text-is("${title}")`),
  });

test('4.02: proyecto secuencial con W y S dentro de la casilla', async ({ app }) => {
  await app.open(FILES);
  await gtd.ready(app);
  await openCasa(app);
  const { page } = app;
  await expect(
    row(page, 'Llave').locator('[data-testid=gtd-check] [data-testid=gtd-seq-mark]')
  ).toHaveText('W');
  await expect(
    row(page, 'Viaje').locator('[data-testid=gtd-check] [data-testid=gtd-seq-mark]')
  ).toHaveText('S');
  await expect(row(page, 'Pintar').locator('[data-testid=gtd-seq-mark]')).toHaveCount(0);
  // ya no hay letra delante del título
  await expect(page.locator('.gtd-task__title [data-testid=gtd-seq-mark]')).toHaveCount(0);
  expect(app.errors).toEqual([]);
});

test('4.02: ★ a la derecha en el móvil; ▾ con el menú en el ordenador', async ({ app }) => {
  await app.open({ '/tasks.org': '* NEXT Algo\n', '/inbox.org': '' });
  await gtd.ready(app);
  await gtd.openList(app, 'Next');
  const { page } = app;
  const r = row(page, 'Algo').first();
  const star = await r.locator('[data-testid=gtd-star]').boundingBox();
  const title = await r.locator('[data-testid=gtd-task-title]').boundingBox();
  if (app.mobile) {
    expect(star.x).toBeGreaterThan(title.x + title.width);
    await expect(page.locator('[data-testid=gtd-task-menu]')).toHaveCount(0);
  } else {
    expect(star.x).toBeLessThan(title.x);
    await r.hover();
    await r.locator('[data-testid=gtd-task-menu]').click();
    await expect(page.locator('[data-testid=gtd-task-menu-popup]')).toBeVisible();
  }
  expect(app.errors).toEqual([]);
});
