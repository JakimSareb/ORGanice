// 4.17: Menú ☰ con «Buscar (B)» y «Capturar con plantilla»; vista Tickler en GTD.
// (La lógica del Tickler —agrupar, fechas rápidas, añadir, cambiar de mes— va en jest: gtd417.)
const { test, expect, gtd } = require('../harness');

const TICKLER = `#+TITLE: Tickler
* *[ TICKLER 2030 ]*
** MARZO
*** Llamar a Luis
SCHEDULED: <2030-03-05 Tue>
`;

test('4.17: Menú ☰ con Buscar y Capturar; la vista Tickler abre con sus entradas', async ({
  app,
}) => {
  const { page } = app;
  await app.open({ '/tasks.org': '* NEXT Algo\n', '/inbox.org': '', '/tickler.org': TICKLER });
  await gtd.ready(app);
  await page.locator('[data-testid=eli-more-top]').click();
  const menu = page.locator('[data-testid=eli-more-top-menu]');
  await expect(menu).toBeVisible();
  const items = await menu
    .locator('.eli-more__item')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  expect(items[0]).toBe('eli-find-menu');
  expect(items).toContain('eli-capture-menu');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await gtd.side(app, 'gtd-list-tickler');
  await expect(page.locator('[data-testid=gtd-tickler]')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('[data-testid=gtd-tickler-row]').first()).toContainText(
    'Llamar a Luis',
    { timeout: 15000 }
  );
  expect(app.errors).toEqual([]);
});
