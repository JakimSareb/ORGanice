// 4.50: Agendas como árbol de cabeceras, «Llevar a reunión», persona en las filas, editor GTD
const { test, expect, gtd } = require('../harness');

const PERSONAS =
  '* Mari Carmen\n:PROPERTIES:\n:ID: MC-1\n:END:\n* Luis\n:PROPERTIES:\n:ID: LU-2\n:END:\n';
const AGENDAS = `* Mari Carmen
** Punto uno
:PROPERTIES:
:ID: P-1
:END:
Notas del uno.
*** Sub uno
** Punto dos
* Quan siguem a ...
** Barcelona
- [ ] Xus
`;
const REUNIONES = '* Reunión lunes\n** Orden del día\n';

test('4.50 B: Inbox → Hablar con… → punto de la lista (nivel 2) cuelga como subcabecera de nivel 3', async ({
  app,
}) => {
  const { page } = app;
  await app.open({
    '/tasks.org': '',
    '/inbox.org': '* Llamar a Pere\n',
    '/personas.org': PERSONAS,
    '/agendas.org': AGENDAS,
  });
  await gtd.ready(app);
  await gtd.side(app, 'gtd-process-start');
  await expect(page.locator('[data-testid=gtd-process]')).toHaveCount(1);
  await page.keyboard.press('1');
  // (4.60, Allen) siguiente acción (Intro) antes de «¿menos de 2 minutos?»
  await page.keyboard.press('Enter');
  await page.keyboard.press('2');
  await page.locator('[data-testid=gtd-proc-opt]', { hasText: 'Hablar con' }).first().click();
  // el selector es jerárquico: se puede elegir «Barcelona» (nivel 2)
  await page.locator('[data-testid=eli-pick-item]', { hasText: 'Barcelona' }).first().click();
  await expect
    .poll(() => app.fileAfterSync('/agendas.org', 500), { timeout: 15000 })
    .toMatch(/\*\* Barcelona\n- \[ \] Xus\n\*\*\* Llamar a Pere\n/);
  expect(app.errors).toEqual([]);
});

test('4.50 A/C: Agendas → tratar un punto (DONE) y llevarlo a una reunión', async ({ app }) => {
  const { page } = app;
  await app.open({
    '/tasks.org': '',
    '/inbox.org': '',
    '/personas.org': PERSONAS,
    '/agendas.org': AGENDAS,
    '/reuniones.org': REUNIONES,
  });
  await gtd.ready(app);
  await gtd.side(app, 'gtd-list-agendas');
  await expect(page.locator('[data-testid=gtd-agendas]')).toHaveCount(1);
  await expect(page.locator('[data-testid=gtd-agenda-row]')).toHaveCount(2);
  await app.press(page.locator('[data-testid=gtd-agenda-toggle]').first());
  const points = page.locator('[data-testid=gtd-agenda-point-title]');
  await expect(points.filter({ hasText: 'Punto uno' })).toHaveCount(1);
  // tratado = DONE; con «Ocultar tratados» desaparece
  const two = page.locator('[data-testid=gtd-agenda-point]', { hasText: 'Punto dos' }).first();
  await app.press(two.locator('[data-testid=gtd-agenda-point-done]').first());
  await expect
    .poll(() => app.fileAfterSync('/agendas.org', 500), { timeout: 15000 })
    .toContain('** DONE Punto dos\n');
  await expect(points.filter({ hasText: 'Punto dos' })).toHaveCount(0);
  // «Llevar a reunión…» mueve el punto con sus notas, subpuntos y :ID:
  const one = page.locator('[data-testid=gtd-agenda-point]', { hasText: 'Punto uno' }).first();
  await app.press(one.locator('[data-testid=gtd-agenda-point-meeting]').first());
  // (4.52) el selector es navegable: «Reunión lunes ›» y luego «Orden del día»
  await page.locator('[data-testid=eli-refile-enter]').first().click();
  await page
    .locator('[data-testid=eli-refile-entry]', { hasText: 'Orden del día' })
    .first()
    .click();
  await expect
    .poll(() => app.fileAfterSync('/reuniones.org', 500), { timeout: 15000 })
    .toMatch(
      /\*\* Orden del día\n\*\*\* Punto uno\n:PROPERTIES:\n:ID: P-1\n:END:\nNotas del uno\.\n\*\*\*\* Sub uno/
    );
  await expect
    .poll(() => app.fileAfterSync('/agendas.org', 500), { timeout: 15000 })
    .not.toContain('Punto uno');
  expect(app.errors).toEqual([]);
});

test('4.50 E: la persona se ve en la fila de Waiting (un chip por persona)', async ({ app }) => {
  const { page } = app;
  await app.open({
    '/tasks.org':
      '#+TODO: TODO NEXT WAITING MAYBE PROJECT | DONE CANCELLED\n' +
      '* WAITING Contrato\n:PROPERTIES:\n:PERSONA: [[id:MC-1][Mari Carmen]] [[id:LU-2][Luis]]\n:END:\n' +
      '* WAITING Sin persona\n',
    '/inbox.org': '',
    '/personas.org': PERSONAS,
  });
  await gtd.ready(app);
  await gtd.openList(app, 'Waiting');
  const chips = page.locator('[data-testid=gtd-task-person]');
  await expect(chips).toHaveCount(2);
  await expect(chips.nth(0)).toContainText('Mari Carmen');
  await expect(chips.nth(1)).toContainText('Luis');
  expect(app.errors).toEqual([]);
});

test('4.50 F: editor de tarea: botón «[[ ]]» y formato en una fila inferior', async ({ app }) => {
  const { page } = app;
  await app.open({ '/tasks.org': '* NEXT Pintar\n', '/inbox.org': '' });
  await gtd.ready(app);
  await gtd.openList(app, 'Next');
  const t = page.locator('[data-testid=gtd-task-title]:has-text("Pintar")');
  if (app.mobile) await app.press(t);
  else await t.dblclick();
  await expect(page.locator('.gtd-editor')).toHaveCount(1);
  await page.waitForTimeout(600);
  await expect(page.locator('.gtd-editor [data-testid=gtd-editor-link-heading]')).toHaveText(
    '[[ ]]'
  );
  // (en el móvil la barra de formato sale al editar: cursor en las notas)
  const notes = page.locator('[data-testid=gtd-editor-notes]');
  const preview = page.locator('[data-testid=gtd-editor-notes-preview]');
  if (await preview.isVisible()) await preview.click();
  else await notes.click();
  await page.waitForTimeout(400);
  const toggle = page.locator('.gtd-editor [data-testid=eli-format-toggle]');
  await app.press(toggle);
  const row = page.locator('.gtd-editor [data-testid=eli-format-row]');
  await expect(row).toHaveCount(1);
  const tb = await toggle.boundingBox();
  const rb = await row.boundingBox();
  expect(rb.y).toBeGreaterThan(tb.y + tb.height - 1);
  // sin scroll horizontal en la página; la fila de formato se desplaza sola
  const over = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth - window.innerWidth,
    row: getComputedStyle(document.querySelector('[data-testid=eli-format-row]')).overflowX,
  }));
  expect(over.page).toBeLessThanOrEqual(1);
  expect(over.row).toBe('auto');
  // se pliega al pulsar otra vez
  await app.press(toggle);
  await expect(row).toHaveCount(0);
  expect(app.errors).toEqual([]);
});
