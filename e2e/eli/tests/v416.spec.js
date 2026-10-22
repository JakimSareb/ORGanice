// 4.16: con «Allen estricto» encendido, «Planificar el día» no sale en Procesos y la «Revisión
// diaria» sí (empieza en el calendario de hoy).
const { test, expect, gtd } = require('../harness');

test('4.16: Revisión diaria y Planificar el día oculto (Allen estricto)', async ({ app }) => {
  const { page } = app;
  await app.open({ '/tasks.org': '* NEXT Algo\n', '/inbox.org': '' }, '/gtd', {
    localStorage: { eliGtdStrict: 'true' },
  });
  await gtd.ready(app);
  await page.click('[data-testid=eli-more-top]');
  await page.click('[data-testid=eli-menu-processes]');
  await expect(page.locator('[data-testid=eli-proc-daily]')).toHaveCount(1);
  await expect(page.locator('[data-testid=eli-proc-plan]')).toHaveCount(0);
  await expect(page.locator('[data-testid=eli-proc-close]')).toHaveCount(0);
  await page.click('[data-testid=eli-proc-daily]');
  await expect(page.locator('[data-testid=gtd-daily-title]')).toContainText('Calendario de hoy', {
    timeout: 10000,
  });
  await expect(page.locator('[data-testid=gtd-daily-kicker]')).toContainText('de 4');
  expect(app.errors).toEqual([]);
});
