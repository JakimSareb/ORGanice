// 4.18: captura desde fuera con plantilla (/capture?text=…&plantilla=…): abre el editor de la
// tarea nueva de esa plantilla con lo compartido dentro. (Lo demás de la 4.18 va en jest: eli418.)
const { test, expect } = require('../harness');

const TEMPLATES = JSON.stringify([
  {
    id: 'tpl-leer',
    letter: 'l',
    description: 'Leer',
    template: '* TODO Leer %?',
    headerPaths: [],
    file: '',
    isAvailableInAllOrgFiles: true,
    orgFilesWhereAvailable: [],
  },
]);

test('4.18: /capture con plantilla abre su editor con lo compartido', async ({ app }) => {
  const { page } = app;
  await app.open(
    { '/tasks.org': '* NEXT Algo\n', '/inbox.org': '' },
    '/capture?text=Un%20articulo&url=https%3A%2F%2Fx.es&plantilla=l',
    { localStorage: { captureTemplates: TEMPLATES } }
  );
  const title = page.locator('[data-testid=gtd-editor-title]');
  await expect(title).toHaveValue('Leer Un articulo', { timeout: 15000 });
  await page.waitForTimeout(600);
  await page.locator('[data-testid=gtd-editor-save]').click();
  await expect
    .poll(async () => (await app.fileAfterSync('/tasks.org', 500)) || '', { timeout: 15000 })
    .toMatch(/TODO Leer Un articulo[\s\S]*https:\/\/x\.es/);
  expect(app.errors).toEqual([]);
});
