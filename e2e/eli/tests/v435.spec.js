// 4.35: flechas ↑/↓ mantenidas en GTD y botones nuevos del editor de tarea (Backlinks, Enviar a,
// «Lista GTD»). El resto va en jest (eli435).
const { test, expect, gtd } = require('../harness');

test('4.35: con ↓ mantenida la selección sigue bajando', async ({ app }) => {
  const { page } = app;
  if (app.mobile) test.skip();
  await app.open({
    '/tasks.org': '* NEXT Aaa\n* NEXT Bbb\n* NEXT Ccc\n* NEXT Ddd\n',
    '/inbox.org': '',
  });
  await gtd.ready(app);
  await gtd.openList(app, 'Next');
  await page.waitForTimeout(400);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(200);
  // Playwright marca como repetidas (event.repeat) las pulsaciones de una tecla ya pulsada
  await page.keyboard.down('ArrowDown');
  await page.keyboard.down('ArrowDown');
  await page.keyboard.down('ArrowDown');
  await page.keyboard.up('ArrowDown');
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const rows = Array.from(document.querySelectorAll('[data-reorder-key]'));
          return rows.findIndex((r) => r.classList.contains('is-selected'));
        }),
      { timeout: 5000 }
    )
    .toBe(3);
  expect(app.errors).toEqual([]);
});

test('4.35: el editor de tarea tiene Backlinks, Enviar a y «Lista GTD»', async ({ app }) => {
  const { page } = app;
  await app.open({ '/tasks.org': '* NEXT Pintar\nNotas\n', '/inbox.org': '' });
  await gtd.ready(app);
  await gtd.openList(app, 'Next');
  const t = page.locator('[data-testid=gtd-task-title]:has-text("Pintar")').first();
  if (app.mobile) await app.press(t);
  else await t.dblclick();
  await expect(page.locator('.gtd-editor')).toHaveCount(1);
  await page.waitForTimeout(600);
  await expect(page.locator('[data-testid=gtd-editor-move]')).toContainText('Lista GTD');
  await expect(page.locator('[data-testid=gtd-editor-backlinks]')).toBeVisible();
  await expect(page.locator('[data-testid=gtd-editor-sendto]')).toBeVisible();
  await page.locator('[data-testid=gtd-editor-backlinks]').click();
  await expect(page.locator('[data-testid=eli-backlinks]')).toBeVisible({ timeout: 5000 });
  expect(app.errors).toEqual([]);
});
