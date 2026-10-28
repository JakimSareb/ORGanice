// GTD (3.40): «Procesar Inbox» — una a una (con atajos) y todo junto
const { test, expect, gtd } = require('../harness');

const INBOX = `* Tirar esto
* Recordar algo
* Llamar a Ana
* Comprar pan
`;
const TICKLER = `* *[ TICKLER 2027 ]*
** ENERO
*** Algo de enero
`;

const start = async (app) => {
  await gtd.side(app, 'gtd-process-start');
  await expect(app.page.locator('[data-testid=gtd-process]')).toHaveCount(1);
};
const count = (app) => app.page.locator('[data-testid=gtd-process-count]');
const opt = (app, text) => app.page.locator(`[data-testid=gtd-proc-opt]:has-text("${text}")`);

test('GTD (3.40): procesar el Inbox una a una', async ({ app }) => {
  const { page } = app;
  await app.open({
    '/tasks.org': '* NEXT Algo ya hecho\n',
    '/inbox.org': INBOX,
    '/tickler.org': TICKLER,
  });
  await gtd.ready(app);
  await start(app);
  await expect(count(app)).toContainText('1 de 4');
  await expect(page.locator('[data-testid=gtd-process-title]')).toContainText('Tirar esto');

  // 1) No requiere acción → Papelera (atajos 2 y 1)
  await page.keyboard.press('2');
  await page.keyboard.press('1');
  await expect(count(app)).toContainText('2 de 4');
  await expect(page.locator('[data-testid=gtd-process-title]')).toContainText('Recordar algo');

  // 2) Tickler con fecha
  await page.keyboard.press('2');
  await page.keyboard.press('4');
  await page.fill('[data-testid=gtd-proc-tickler-date]', '2027-12-03');
  await opt(app, 'Guardar en el Tickler').click();
  await expect(count(app)).toContainText('3 de 4');

  // 3) Delegar → Waiting con persona (4.48: contacto nuevo en personas.org, :PERSONA:)
  await page.keyboard.press('1');
  await page.keyboard.press('2');
  await page.keyboard.press('1');
  await page.click('[data-testid=gtd-proc-person]');
  await page.fill('[data-testid=eli-pick-search]', 'Ana');
  await page.click('[data-testid=eli-pick-new]');
  await page.click('.eli-prompt__ok');
  await expect(page.locator('[data-testid=gtd-proc-person]')).toContainText('Ana', {
    timeout: 10000,
  });
  await opt(app, 'Continuar').click();
  await expect(page.locator('[data-testid=gtd-process-question]')).toContainText('¿Cuándo?');
  await opt(app, 'Guardar sin fecha').click();
  await expect(count(app)).toContainText('4 de 4');

  // 4) Next con fecha límite (Atrás vuelve a la pregunta anterior)
  await page.keyboard.press('1');
  await page.click('[data-testid=gtd-process-back]');
  await expect(page.locator('[data-testid=gtd-process-question]')).toContainText(
    '¿Requiere acción?'
  );
  for (const k of ['1', '2', '2', '2', '1']) await page.keyboard.press(k);
  await page.fill('[data-testid=gtd-proc-deadline]', '2027-01-15');
  await opt(app, 'Guardar').click();
  await expect(page.locator('[data-testid=gtd-process-done]')).toHaveCount(1);

  await page.waitForTimeout(3000);
  const tickler = await app.fileAfterSync('/tickler.org');
  expect(tickler).toMatch(
    /\* \*\[ TICKLER 2027 \]\*\n\*\* DICIEMBRE\n\*\*\* Recordar algo\n\s*SCHEDULED: <2027-12-03[^>]*>[\s\S]*\*\* ENERO/
  );
  const all =
    (await app.fileAfterSync('/inbox.org')) + '\n' + (await app.fileAfterSync('/tasks.org'));
  expect(all).toMatch(/Tirar esto.*:trash:/);
  expect(all).toMatch(/\* WAITING Llamar a Ana\n[\s\S]*?:PERSONA: \[\[id:[^\]]+\]\[Ana\]\]/);
  expect(all).not.toMatch(/Llamar a Ana\s+:Ana:/);
  expect(all).toMatch(/\* NEXT Comprar pan\n\s*DEADLINE: <2027-01-15/);
  expect(all).not.toContain('Recordar algo');
  expect(app.errors).toEqual([]);
});

test('GTD (3.40): todo junto — proyecto con su primera acción', async ({ app }) => {
  const { page } = app;
  await page.addInitScript(() => window.localStorage.setItem('eliGtdProcessMode', 'all'));
  await app.open({ '/tasks.org': '', '/inbox.org': '* Mudanza\n' });
  await gtd.ready(app);
  await start(app);
  await page.fill('[data-testid=gtd-proc-first]', 'Pedir presupuestos');
  await page.click('[data-testid=gtd-proc-project]');
  await expect(page.locator('[data-testid=gtd-process-done]')).toHaveCount(1);
  await page.waitForTimeout(3000);
  const all =
    (await app.fileAfterSync('/inbox.org')) + '\n' + (await app.fileAfterSync('/tasks.org'));
  expect(all).toMatch(/\* PROJECT Mudanza[\s\S]*\n\*\* NEXT Pedir presupuestos/);
  expect(app.errors).toEqual([]);
});
