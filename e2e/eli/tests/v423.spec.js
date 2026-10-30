// 4.23: bloc de notas rápido (scratch.org) y submenús del Menú ☰ al pasar el ratón.
const { test, expect } = require('../harness');

const BASE = { '/tasks.org': '', '/inbox.org': '' };
const DOC = `* Padre
** Hija
* Segunda
`;

test('4.23: el Menú ☰ abre el bloc de notas y lo guarda en scratch.org', async ({ app }) => {
  const { page } = app;
  await app.open({ ...BASE, '/notas.org': DOC }, '/file/notas.org');
  await expect(page.locator('text=Segunda').first()).toBeVisible({ timeout: 20000 });
  await page.locator('[data-testid=eli-more-top]').click();
  await app.press(page.locator('[data-testid=eli-scratch-menu]'));
  await expect(page.locator('[data-testid=eli-scratch]')).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(600);
  await page.locator('[data-testid=eli-scratch-text]').fill('Comprar pan');
  await app.press(page.locator('[data-testid=eli-scratch-close]'));
  await expect(page.locator('[data-testid=eli-scratch]')).toHaveCount(0);
  await expect
    .poll(async () => (await app.fileAfterSync('/scratch.org', 500)) || '', { timeout: 15000 })
    .toContain('Comprar pan');
  expect(app.errors).toEqual([]);
});

test('4.23: con ratón, un submenú se abre al pasar por encima y se recoge al volver', async ({
  app,
}) => {
  test.skip(app.mobile, 'solo con ratón (pointer: fine)');
  const { page } = app;
  await app.open({ ...BASE, '/notas.org': DOC }, '/file/notas.org');
  await expect(page.locator('text=Segunda').first()).toBeVisible({ timeout: 20000 });
  await page.locator('[data-testid=eli-more-top]').click();
  await page.locator('[data-testid=eli-menu-view]').hover();
  await expect(page.locator('[data-testid=eli-menu-view-flyout]')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('[data-testid=eli-cycle-visibility]')).toBeVisible();
  await page.locator('[data-testid=eli-menu-help]').hover();
  await expect(page.locator('[data-testid=eli-menu-view-flyout]')).toHaveCount(0, {
    timeout: 5000,
  });
  expect(app.errors).toEqual([]);
});
