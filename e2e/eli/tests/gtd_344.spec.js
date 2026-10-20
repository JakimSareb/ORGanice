// GTD (3.44): botones del editor (Subtarea al principio, nombre del fichero = Abrir, «Mover»),
// fecha y hora en las notas, y Procesar Inbox / Revisión semanal como secciones del menú
const { test, expect, gtd } = require('../harness');

const sideOrder = async (app) => {
  if (app.mobile) {
    await app.page.click('.gtd-main__menu');
    await app.page.waitForTimeout(500);
  }
  return app.page.evaluate(() =>
    Array.from(document.querySelectorAll('.gtd-side .gtd-side__item'))
      .map((e) => e.getAttribute('data-testid'))
      .filter(Boolean)
  );
};

test('GTD (3.44): botones del editor y fecha y hora en las notas', async ({ app }) => {
  const { page } = app;
  await app.open({
    '/tasks.org': '* NEXT Pintar\nNotas de pintar\n',
    '/inbox.org': '',
  });
  await gtd.ready(app);
  await gtd.openList(app, 'Next');
  const t = page.locator('[data-testid=gtd-task-title]:has-text("Pintar")');
  if (app.mobile) await app.press(t);
  else await t.dblclick();
  await expect(page.locator('.gtd-editor')).toHaveCount(1);
  await page.waitForTimeout(600);

  const order = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.gtd-editor__actions [data-testid]')).map((e) =>
      e.getAttribute('data-testid')
    )
  );
  // «＋ Subtarea» el primero; luego el nombre del fichero y «Mover»
  expect(order[0]).toBe('gtd-editor-add-subtask');
  expect(order[1]).toBe('gtd-editor-file');
  expect(order[2]).toBe('gtd-editor-move');
  const actions = page.locator('.gtd-editor__actions');
  await expect(actions.locator('button:has-text("Abrir")')).toHaveCount(0);
  await expect(page.locator('[data-testid=gtd-editor-file]')).toHaveAttribute(
    'title',
    /Abrir en su fichero/
  );

  // Botón de fecha y hora (4.01: en la barra de arriba del editor)
  const notes = page.locator('[data-testid=gtd-editor-notes]');
  const preview = page.locator('[data-testid=gtd-editor-notes-preview]');
  if (await preview.isVisible()) await preview.click();
  else await notes.click();
  await page.waitForTimeout(400);
  await page.keyboard.press('End');
  // (4.01) el reloj está fuera del «Aa», tras deshacer/rehacer
  await page.click('.gtd-editor [data-testid=gtd-editor-now]');
  await expect(notes).toHaveValue(/Notas de pintar\s+\[\d{4}-\d\d-\d\d \w+ \d\d:\d\d\]/);
  await page.click('[data-testid=gtd-editor-cancel]');
  await expect(page.locator('.gtd-editor')).toHaveCount(0);
  expect(app.errors).toEqual([]);
});

test('GTD (3.44): Procesar Inbox y Revisión semanal, secciones del menú', async ({ app }) => {
  await app.open({ '/tasks.org': '* NEXT Algo\n', '/inbox.org': '' });
  await gtd.ready(app);
  // Por defecto, después de Logbook
  const order = await sideOrder(app);
  const lb = order.indexOf('gtd-list-logbook');
  expect(lb).toBeGreaterThanOrEqual(0);
  expect(order.indexOf('gtd-process-start')).toBe(lb + 1);
  expect(order.indexOf('gtd-review-start')).toBe(lb + 2);
  expect(app.errors).toEqual([]);
});

test('GTD (3.44): Procesar Inbox oculto en Ajustes no sale en el menú', async ({ app }) => {
  await app.open({ '/tasks.org': '* NEXT Algo\n', '/inbox.org': '' }, '/gtd', {
    localStorage: { eliGtdSections: JSON.stringify({ sections: { process: { show: false } } }) },
  });
  await gtd.ready(app);
  const order = await sideOrder(app);
  expect(order).not.toContain('gtd-process-start');
  expect(order).toContain('gtd-review-start');
  expect(app.errors).toEqual([]);
});
