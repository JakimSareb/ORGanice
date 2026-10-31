// 4.58: copias rotativas. La rotación, el zip y el restaurar van en jest (eli458, eli_backups y
// BackupsSettings). Aquí solo lo que necesita un navegador: Ajustes › Copias de seguridad sale y
// no rompe la pantalla (el servidor de pruebas es WebDAV, que no admite copias: lo explica).
const { test, expect } = require('../harness');

test('4.58: Ajustes › Copias de seguridad aparece y explica que WebDAV no las admite', async ({
  app,
}) => {
  test.skip(app.mobile, 'ajustes de escritorio');
  const { page } = app;
  await app.open({ '/tasks.org': '* NEXT Algo\n', '/inbox.org': '' }, '/settings');
  await page.waitForTimeout(1000);
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)));
  await expect(page.locator('[data-testid=eli-settings-backups]')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-testid=eli-backups-unsupported]')).toBeVisible();
  expect(app.errors).toEqual([]);
});
