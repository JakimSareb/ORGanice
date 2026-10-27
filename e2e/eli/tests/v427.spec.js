// 4.27: contadores del día y apunte → registro mensual en pages/mensual-AAAA.org
const { test, expect } = require('../harness');

const BASE = { '/tasks.org': '', '/inbox.org': '' };
const DOC = `* Padre
* Segunda
`;

test('4.27: el registro del día crea y rellena mensual-AAAA.org', async ({ app }) => {
  const { page } = app;
  const now = new Date();
  const y = now.getFullYear();
  const day = `${y}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(
    2,
    '0'
  )}`;
  await app.open({ ...BASE, '/notas.org': DOC }, '/file/notas.org');
  await expect(page.locator('text=Segunda').first()).toBeVisible({ timeout: 20000 });
  await page.locator('[data-testid=eli-more-top]').click();
  await app.press(page.locator('[data-testid=eli-diary-menu]'));
  await expect(page.locator('[data-testid=eli-diary]')).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(800);
  await app.press(page.locator('[data-testid=eli-diary-counter-B]'));
  await page.waitForTimeout(500);
  await page.locator('[data-testid=eli-diary-counter-KM]').fill('4,5');
  await page.locator('[data-testid=eli-diary-counter-KM]').press('Enter');
  await page.locator('[data-testid=eli-diary-input]').fill('Paseo');
  await app.press(page.locator('[data-testid=eli-diary-add]'));
  await expect
    .poll(async () => (await app.fileAfterSync(`/pages/${y}.org`, 500)) || '', {
      timeout: 15000,
    })
    .toMatch(/:KM: 4,5[\s\S]*\*\* \d\d:\d\d - Paseo/);
  await expect
    .poll(async () => (await app.fileAfterSync(`/pages/mensual-${y}.org`, 500)) || '', {
      timeout: 15000,
    })
    .toContain(`[[id:diari-${day}][`);
  const t = await app.fileAfterSync(`/pages/mensual-${y}.org`, 500);
  expect(t).toContain('* Totales del año');
  expect(t).toMatch(/\| X \| 4,5 \|/);
  await app.press(page.locator('[data-testid=eli-diary-close]'));
  await expect(page.locator('[data-testid=eli-diary]')).toHaveCount(0);
  expect(app.errors).toEqual([]);
});
