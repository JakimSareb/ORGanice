// 4.21b: en el Tickler los botones de cada entrada están ocultos hasta pulsar el lápiz.
const { test, expect, gtd } = require('../harness');

const TICKLER = `#+TITLE: Tickler
* *[ TICKLER 2030 ]*
** MARZO
*** Llamar a Luis
SCHEDULED: <2030-03-05 Tue>
`;

test('4.21b: Tickler con los botones ocultos hasta pulsar el lápiz', async ({ app }) => {
  const { page } = app;
  await app.open({ '/tasks.org': '* NEXT Algo\n', '/inbox.org': '', '/tickler.org': TICKLER });
  await gtd.ready(app);
  await gtd.side(app, 'gtd-list-tickler');
  const row = page.locator('[data-testid=gtd-tickler-row]').first();
  await expect(row).toContainText('Llamar a Luis', { timeout: 15000 });
  await expect(row.locator('[data-testid=gtd-tickler-inbox]')).toHaveCount(0);
  await row.locator('[data-testid=gtd-tickler-acts-toggle]').click();
  await expect(row.locator('[data-testid=gtd-tickler-inbox]')).toBeVisible();
  await row.locator('[data-testid=gtd-tickler-acts-toggle]').click();
  await expect(row.locator('[data-testid=gtd-tickler-inbox]')).toHaveCount(0);
  expect(app.errors).toEqual([]);
});
