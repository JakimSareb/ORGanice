// 4.15: con «Allen estricto» la revisión semanal empieza en «Papeles y materiales sueltos» y el
// cuadro de ese paso apunta al Inbox.
const { test, expect, gtd } = require('../harness');

test('4.15: Revisión semanal oficial (Allen estricto)', async ({ app }) => {
  const { page } = app;
  await app.open({ '/tasks.org': '* NEXT Algo\n', '/inbox.org': '' }, '/gtd', {
    localStorage: { eliGtdStrict: 'true' },
  });
  await gtd.ready(app);
  await page.click('[data-testid=eli-more-top]');
  await page.click('[data-testid=eli-menu-processes]');
  await page.click('[data-testid=eli-proc-review]');
  await expect(
    page.locator('[data-testid=gtd-review-title]')
  ).toContainText('Papeles y materiales sueltos', { timeout: 10000 });
  await expect(page.locator('[data-testid=gtd-review-kicker]')).toContainText('de 12');
  await page.locator('[data-testid=gtd-review-capture-input]').fill('Recibo del taller');
  await page.click('[data-testid=gtd-review-capture-add]');
  await expect
    .poll(async () => (await app.fileAfterSync('/inbox.org', 500)) || '', { timeout: 15000 })
    .toMatch(/Recibo del taller/);
  expect(app.errors).toEqual([]);
});
