// (4.20) Filas de GTD: W en la casilla de Waiting, total de reloj en gris, icono de notas con título largo
const { test, expect, gtd } = require('../harness');

const LONG = 'Titulo muy largo '.repeat(8).trim();
const FILES = {
  '/tasks.org':
    '* WAITING Espero algo\n' +
    `* NEXT ${LONG}\n:LOGBOOK:\nCLOCK: [2026-10-21 Wed 10:00]--[2026-10-21 Wed 11:30] =>  1:30\n:END:\nUna nota\n`,
  '/inbox.org': '',
};

test('4.20: W en Waiting (sin proyecto)', async ({ app }) => {
  await app.open(FILES);
  await gtd.ready(app);
  await gtd.openList(app, 'Waiting');
  await expect(app.page.locator('[data-testid=gtd-seq-mark]').first()).toHaveText('W');
  expect(app.errors).toEqual([]);
});

test('4.20: total de reloj gris e icono de notas visible con título largo', async ({ app }) => {
  await app.open(FILES);
  await gtd.ready(app);
  await gtd.openList(app, 'Next');
  const { page } = app;
  await expect(page.locator('[data-testid=gtd-task-clock-total]').first()).toBeVisible();
  await expect(page.locator('[data-testid=gtd-notes-toggle]').first()).toBeVisible();
  expect(app.errors).toEqual([]);
});
