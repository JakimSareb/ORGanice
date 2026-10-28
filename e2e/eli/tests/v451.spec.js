// 4.51: Wiki Divio. ☰ › Wiki › Nueva entrada… ofrece crear la estructura (5 ficheros), crea un
// Proceso con sus propiedades y la línea en index.org; ☰ › Wiki › Procesos lo lista y «Revisado
// hoy» pone la fecha. Plantillas, orden, filtros y la etiqueta de tema van en jest (eli_wiki.unit.test.js).
const { test, expect } = require('../harness');

const BASE = { '/tasks.org': '', '/inbox.org': '', '/notas.org': '* Algo\n' };

test('4.51: crear estructura, nuevo Proceso y tabla de Procesos', async ({ app }) => {
  const { page } = app;
  await app.open(BASE, '/file/notas.org');
  await expect(page.locator('text=Algo').first()).toBeVisible({ timeout: 20000 });
  await page.locator('[data-testid=eli-more-top]').click();
  await page.locator('[data-testid=eli-menu-wiki]').click();
  await page.locator('[data-testid=eli-wiki-new]').click();
  // falta la estructura: se ofrece crearla
  await page.locator('.eli-prompt__ok').click();
  await expect
    .poll(() => Object.keys(app.store).filter((p) => p.startsWith('/wiki/')).length, {
      timeout: 20000,
    })
    .toBe(5);
  await page.locator('[data-testid=eli-choice-proceso]').click();
  await page.locator('[data-testid=eli-form-title]').fill('Cierre mensual');
  await page.locator('[data-testid=eli-ask-form] button[type=submit]').click();
  await page.locator('[data-testid=eli-pick-search]').fill('finanzas');
  await page.locator('[data-testid=eli-pick-new]').click();
  // responsable: Cancelar = sin responsable
  await page.locator('.eli-prompt__cancel').click();

  await expect
    .poll(async () => (await app.fileAfterSync('/wiki/procesos.org', 500)) || '', {
      timeout: 20000,
    })
    .toContain('* Cierre mensual :finanzas:');
  const text = app.store['/wiki/procesos.org'];
  expect(text).toMatch(/:ID:\s+\S+/);
  expect(text).toMatch(/:ULTIMA_REVISION: \d{4}-\d{2}-\d{2}/);
  expect(text).toContain('** Salidas / Hecho cuando');
  await expect
    .poll(async () => (await app.fileAfterSync('/wiki/index.org', 500)) || '', { timeout: 15000 })
    .toMatch(/\* Procesos\n- \[\[id:[^\]]+\]\[Cierre mensual\]\]/);

  // tabla de Procesos
  await page.locator('[data-testid=eli-more-top]').click();
  await page.locator('[data-testid=eli-menu-wiki]').click();
  await page.locator('[data-testid=eli-wiki-processes]').click();
  await expect(page.locator('[data-testid=eli-wiki-row]')).toHaveCount(1, { timeout: 15000 });
  await expect(page.locator('[data-testid=eli-wiki-row]')).toContainText('Cierre mensual');
  await expect(page.locator('[data-testid=eli-wiki-row]')).toContainText('finanzas');
  await page.locator('[data-testid=eli-wiki-reviewed]').click();
  await expect(page.locator('[data-testid=eli-wiki-last]')).toContainText('hoy');
  expect(app.errors).toEqual([]);
});
