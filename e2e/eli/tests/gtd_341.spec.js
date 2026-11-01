// GTD (3.41): revisión semanal con los pasos de la checklist oficial. (4.60) Solo la de Allen:
// «Revisar Next» (hecha), Waiting (recibida) y Someday/Maybe (activar)
const { test, expect, gtd } = require('../harness');

const TASKS = `* NEXT Hacer ya
* NEXT Dejar para otra
* TODO Para la semana
* MAYBE Soñar despierto
* WAITING Paquete de Correos
`;

const row = (app, text, kind) =>
  app.page
    .locator('.gtd-review__row', { hasText: text })
    .locator(`[data-testid=gtd-review-act-${kind}]`);

test('GTD (3.41): revisar Next, Waiting y Someday', async ({ app }) => {
  const p = app.page;
  await app.open({ '/tasks.org': TASKS, '/inbox.org': '' });
  await gtd.ready(app);
  await gtd.side(app, 'gtd-review-start');
  await expect(p.locator('[data-testid=gtd-review-kicker]')).toContainText('Despejar');
  // (4.60) solo la revisión oficial (Allen): primero, papeles sueltos
  await expect(p.locator('[data-testid=gtd-review-title]')).toContainText('Papeles');

  // Revisar Next: solo «Hecha»
  await app.press(p.locator('[data-testid=gtd-review-dot-next]'));
  await expect(p.locator('[data-testid=gtd-review-title]')).toContainText('Revisar Next');
  await expect(p.locator('[data-testid=gtd-review-kicker]')).toContainText('Al día');
  await app.press(row(app, 'Hacer ya', 'done'));
  await expect(p.locator('.gtd-review__row', { hasText: 'Hacer ya' })).toHaveCount(0);

  // Waiting: recibida = hecha
  await app.press(p.locator('[data-testid=gtd-review-dot-waiting]'));
  await expect(p.locator('[data-testid=gtd-review-title]')).toContainText('Waiting');
  await app.press(row(app, 'Paquete de Correos', 'done'));

  // Someday / Maybe: activar
  await app.press(p.locator('[data-testid=gtd-review-dot-someday]'));
  await expect(p.locator('[data-testid=gtd-review-title]')).toContainText('Someday');
  await app.press(row(app, 'Soñar despierto', 'next'));
  await expect(p.locator('.gtd-review__row', { hasText: 'Soñar' })).toHaveCount(0);

  await p.waitForTimeout(3000);
  const f = await app.fileAfterSync('/tasks.org');
  expect(f).toMatch(/DONE.*Hacer ya/);
  expect(f).toMatch(/NEXT.*Dejar para otra/);
  expect(f).toMatch(/TODO.*Para la semana/);
  expect(f).toMatch(/NEXT.*Soñar despierto/);
  expect(f).toMatch(/DONE.*Paquete de Correos/);
  expect(app.errors).toEqual([]);
});
