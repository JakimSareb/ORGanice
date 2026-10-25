// 4.32: procesar el Inbox con contexto de la lista y esfuerzo → propiedades en el fichero
const { test, expect, gtd } = require('../harness');

test('4.32: procesar el Inbox con contexto elegido y tiempo', async ({ app }) => {
  const { page } = app;
  await app.open({ '/tasks.org': '* NEXT Algo ya hecho\n', '/inbox.org': '* Comprar pan\n' });
  await gtd.ready(app);
  await gtd.side(app, 'gtd-process-start');
  await expect(page.locator('[data-testid=gtd-process]')).toHaveCount(1);
  // misma ruta que gtd_340: Sí → … → pantalla de «¿Cuándo?» con área/etiquetas
  for (const k of ['1', '2', '2', '2', '1']) await page.keyboard.press(k);
  const chip = page.locator('[data-testid=gtd-proc-context]').first();
  await expect(chip).toHaveCount(1);
  const name = (await chip.textContent()).trim();
  await chip.click();
  await page.selectOption('[data-testid=gtd-proc-effort]', '0:30');
  await page.locator('[data-testid=gtd-proc-opt]:has-text("Guardar")').first().click();
  await expect(page.locator('[data-testid=gtd-process-done]')).toHaveCount(1);
  await page.waitForTimeout(3000);
  const all =
    (await app.fileAfterSync('/inbox.org')) + '\n' + (await app.fileAfterSync('/tasks.org'));
  expect(all).toContain(`:${name}:`);
  expect(all).toMatch(/:Effort:\s+0:30/);
  expect(app.errors).toEqual([]);
});
