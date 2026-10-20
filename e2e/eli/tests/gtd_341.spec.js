// GTD (3.41): revisión semanal con los pasos de la checklist oficial: «Revisar Next» (hecha / quitar
// de Next), «Elegir para la semana» (Todo y Someday → Next) y Waiting (recibida)
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

test('GTD (3.41): revisar Next, elegir para la semana y Waiting', async ({ app }) => {
  const p = app.page;
  await app.open({ '/tasks.org': TASKS, '/inbox.org': '' });
  await gtd.ready(app);
  await app.press(p.locator('[data-testid=gtd-view-menu-button]'));
  await app.press(p.locator('[data-testid=gtd-menu-review]'));
  await expect(p.locator('[data-testid=gtd-review-kicker]')).toContainText('Despejar');
  await expect(p.locator('[data-testid=gtd-review-capture]')).toBeVisible();

  // Paso 2: Revisar Next (sigue a Inbox; abre la lista Next)
  await app.press(p.locator('[data-testid=gtd-review-next]'));
  await expect(p.locator('[data-testid=gtd-review-title]')).toContainText('Revisar Next');
  await expect(p.locator('[data-testid=gtd-review-kicker]')).toContainText('Al día');
  await app.press(row(app, 'Hacer ya', 'done'));
  await app.press(row(app, 'Dejar para otra', 'later'));
  await expect(p.locator('.gtd-review__row')).toHaveCount(0);

  // Paso 3: Elegir para la semana (Todo + Someday)
  await app.press(p.locator('[data-testid=gtd-review-next]'));
  await expect(p.locator('[data-testid=gtd-review-title]')).toContainText('Elegir para la semana');
  await expect(p.locator('.gtd-review__row', { hasText: 'Dejar para otra' })).toHaveCount(1);
  await app.press(row(app, 'Para la semana', 'next'));
  await app.press(row(app, 'Soñar despierto', 'next'));
  await expect(p.locator('.gtd-review__row', { hasText: 'Soñar' })).toHaveCount(0);

  // Waiting: recibida = hecha
  await app.press(p.locator('[data-testid=gtd-review-dot-waiting]'));
  await expect(p.locator('[data-testid=gtd-review-title]')).toContainText('Waiting');
  await app.press(row(app, 'Paquete de Correos', 'done'));

  await p.waitForTimeout(3000);
  const f = await app.fileAfterSync('/tasks.org');
  expect(f).toMatch(/DONE.*Hacer ya/);
  expect(f).toMatch(/TODO.*Dejar para otra/);
  expect(f).toMatch(/NEXT.*Para la semana/);
  expect(f).toMatch(/NEXT.*Soñar despierto/);
  expect(f).toMatch(/DONE.*Paquete de Correos/);
  expect(app.errors).toEqual([]);
});
