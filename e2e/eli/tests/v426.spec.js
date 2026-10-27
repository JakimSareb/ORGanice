// 4.26: Diario de hoy (Menú ☰) crea el fichero del año con el día y el apunte.
// (4.38) Formato org-journal: pages/AAAA.org, día con :CREATED: y apunte `** HH:MM`.
const { test, expect } = require('../harness');

const BASE = { '/tasks.org': '', '/inbox.org': '' };
const DOC = `* Padre
* Segunda
`;

test('4.26: Diario de hoy crea el fichero del año con el día y el apunte', async ({ app }) => {
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
  await page.locator('[data-testid=eli-diary-input]').fill('Paseo por el puerto');
  await app.press(page.locator('[data-testid=eli-diary-add]'));
  await expect
    .poll(async () => (await app.fileAfterSync(`/pages/${y}.org`, 500)) || '', {
      timeout: 15000,
    })
    .toMatch(
      new RegExp(
        `:CREATED:  ${day.replace(
          /-/g,
          ''
        )}\\n[\\s\\S]*\\n\\*\\* \\d\\d:\\d\\d - Paseo por el puerto`
      )
    );
  await app.press(page.locator('[data-testid=eli-diary-close]'));
  await expect(page.locator('[data-testid=eli-diary]')).toHaveCount(0);
  expect(app.errors).toEqual([]);
});
