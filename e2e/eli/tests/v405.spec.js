// 4.05: procesos diarios (Menú ☰ › Procesos › Diarios): Planificar el día, Cerrar el día y
// ¿Qué hago ahora? (tarjeta por pasos en la vista GTD). El menú «Procesos» con su icono.
const { test, expect, gtd } = require('../harness');

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const stamp = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${DAYS[d.getDay()]}`;
};

const openProc = async (app, testId) => {
  const { page } = app;
  await page.locator('[data-testid=eli-more-top]').click();
  await page.locator('[data-testid=eli-menu-processes]').click();
  await page.locator(`[data-testid=${testId}]`).click();
  await expect(page.locator('[data-testid=gtd-daily]')).toBeVisible({ timeout: 20000 });
};
const row = (app, title) => app.page.locator('.gtd-review__row', { hasText: title });

test('4.05: el menú Procesos tiene icono y los tres procesos diarios', async ({ app }) => {
  const { page } = app;
  await app.open({ '/tasks.org': '* NEXT Algo\n', '/inbox.org': '' });
  await gtd.ready(app);
  await page.locator('[data-testid=eli-more-top]').click();
  await expect(page.locator('[data-testid=eli-menu-processes] i.fa-project-diagram')).toHaveCount(
    1
  );
  await page.locator('[data-testid=eli-menu-processes]').click();
  for (const id of ['eli-proc-plan', 'eli-proc-close', 'eli-proc-now'])
    await expect(page.locator(`[data-testid=${id}]`)).toBeVisible();
  expect(app.errors).toEqual([]);
});

test('4.05: Planificar el día (vencidas, Waiting, Tickler → Inbox, ★)', async ({ app }) => {
  const { page } = app;
  await app.open({
    '/tasks.org': [
      '* NEXT Vencida',
      `SCHEDULED: <${stamp(-1)}>`,
      '* WAITING Respuesta de Ana',
      `DEADLINE: <${stamp(-1)}>`,
      '* NEXT Llamar al banco',
      '',
    ].join('\n'),
    '/inbox.org': '',
    '/tickler.org': `* Recordatorio de hoy\nSCHEDULED: <${stamp(0)}>\n`,
  });
  await gtd.ready(app);
  await openProc(app, 'eli-proc-plan');
  await expect(page.locator('[data-testid=gtd-daily-title]')).toContainText('vencidas');
  await expect(row(app, 'Vencida')).toHaveCount(1);
  await page.locator('[data-testid=gtd-daily-next]').click();
  await expect(page.locator('[data-testid=gtd-daily-title]')).toContainText('Waiting');
  await expect(row(app, 'Respuesta de Ana')).toHaveCount(1);
  await page.locator('[data-testid=gtd-daily-next]').click();
  await expect(page.locator('[data-testid=gtd-daily-title]')).toContainText('Tickler');
  await expect(row(app, 'Recordatorio de hoy')).toHaveCount(1, { timeout: 10000 });
  await row(app, 'Recordatorio de hoy').locator('[data-testid=gtd-daily-act-inbox]').click();
  await expect
    .poll(async () => (await app.fileAfterSync('/inbox.org', 500)) || '', { timeout: 15000 })
    .toContain('Recordatorio de hoy');
  await page.locator('[data-testid=gtd-daily-next]').click();
  await expect(page.locator('[data-testid=gtd-daily-title]')).toContainText('Focus');
  await row(app, 'Llamar al banco').locator('[data-testid=gtd-daily-act-star]').click();
  await expect
    .poll(async () => (await app.fileAfterSync('/tasks.org', 500)) || '', { timeout: 15000 })
    .toContain('[#A] Llamar al banco');
  await page.locator('[data-testid=gtd-daily-next]').click();
  await expect(page.locator('[data-testid=gtd-daily-done]')).toBeVisible();
  expect(app.errors).toEqual([]);
});

test('4.05: Cerrar el día (hecha, capturar, reprogramar lo de Focus)', async ({ app }) => {
  const { page } = app;
  await app.open({
    '/tasks.org': '* NEXT [#A] Terminada hoy\n* NEXT [#A] Sin hacer\n',
    '/inbox.org': '',
  });
  await gtd.ready(app);
  await openProc(app, 'eli-proc-close');
  await row(app, 'Terminada hoy').locator('[data-testid=gtd-daily-act-done]').click();
  await expect
    .poll(async () => (await app.fileAfterSync('/tasks.org', 500)) || '', { timeout: 15000 })
    .toMatch(/DONE.*Terminada hoy/);
  await page.locator('[data-testid=gtd-daily-next]').click();
  await expect(page.locator('[data-testid=gtd-daily-capture]')).toBeVisible();
  await page.locator('[data-testid=gtd-daily-next]').click();
  await expect(row(app, 'Terminada hoy')).toHaveCount(0);
  await row(app, 'Sin hacer').locator('[data-testid=gtd-daily-act-tomorrow]').click();
  await expect
    .poll(async () => (await app.fileAfterSync('/tasks.org', 500)) || '', { timeout: 15000 })
    .toContain(`SCHEDULED: <${stamp(1)}>`);
  const text = await app.fileAfterSync('/tasks.org', 500);
  expect(text).toContain('* NEXT Sin hacer');
  expect(app.errors).toEqual([]);
});

test('4.05: ¿Qué hago ahora? (lugar, tiempo y rápido)', async ({ app }) => {
  const { page } = app;
  const eff = (e) => `:PROPERTIES:\n:EFFORT: ${e}\n:END:\n`;
  await app.open({
    '/tasks.org':
      '* NEXT Larga :@casa:\n' +
      eff('2:00') +
      '* NEXT Corta :@casa:\n' +
      eff('0:10') +
      '* NEXT Fuera :@calle:\n',
    '/inbox.org': '',
  });
  await gtd.ready(app);
  await openProc(app, 'eli-proc-now');
  const card = page.locator('[data-testid=gtd-daily]');
  await page.locator('[data-testid="gtd-now-tag-@casa"]').click();
  await expect(card.locator('[data-testid=gtd-daily-item]')).toHaveCount(2);
  await expect(card).not.toContainText('Fuera');
  await page.locator('[data-testid=gtd-now-time-10]').click();
  await expect(card.locator('[data-testid=gtd-daily-item]')).toHaveCount(1);
  await expect(card.locator('[data-testid=gtd-daily-item]')).toContainText('Corta');
  await page.locator('[data-testid=gtd-now-time-10]').click();
  await page.locator('[data-testid=gtd-now-quick]').click();
  await expect(card.locator('[data-testid=gtd-daily-item]')).toHaveCount(1);
  expect(app.errors).toEqual([]);
});
