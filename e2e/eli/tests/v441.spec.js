// 4.41: herramienta «Enlaces rotos»: un [[id:…]] sin destino aparece y «Dejar solo el texto»
// cambia el fichero. El resto (org-roam, menciones, reparar…) va en jest (eli441).
const { test, expect } = require('../harness');

test('4.41: Enlaces rotos: aparece el roto y «Dejar solo el texto» escribe el fichero', async ({
  app,
}) => {
  const { page } = app;
  const doc =
    '* Origen\nVer [[id:NO-EXISTE][Texto roto]] y [[id:BIEN][bueno]].\n' +
    '* Destino\n:PROPERTIES:\n:ID: BIEN\n:END:\n';
  await app.open({ '/tasks.org': '', '/inbox.org': '', '/notas.org': doc }, '/file/notas.org');
  await expect(page.locator('text=Origen').first()).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(500);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('eli:broken-links')));
  const box = page.locator('[data-testid=eli-broken-links]');
  await expect(box).toBeVisible({ timeout: 15000 });
  const group = page.locator('[data-testid=eli-broken-group]');
  await expect(group).toHaveCount(1, { timeout: 20000 });
  await expect(group).toContainText('id:NO-EXISTE');
  await group.locator('[data-testid=eli-broken-open]').click();
  await group.locator('[data-testid=eli-broken-text]').click();
  await expect(page.locator('[data-testid=eli-broken-none]')).toBeVisible({ timeout: 10000 });
  await expect
    .poll(async () => (await app.fileAfterSync('/notas.org', 500)) || '', { timeout: 15000 })
    .toContain('Ver Texto roto y [[id:BIEN][bueno]].');
  expect(app.errors).toEqual([]);
});
