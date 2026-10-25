// 4.29: tocar una etiqueta abre la vista por etiqueta; «Añadir › Enlace a cabecera» inserta [[id:
const { test, expect } = require('../harness');

const BASE = { '/tasks.org': '', '/inbox.org': '' };
// (al abrir, las cabeceras salen plegadas: todo a nivel 1)
const DOC = `* Alfa :casa:
* Beta
* Gamma :casa:
* Delta
`;

test('4.29: tocar una etiqueta abre la vista con sus cabeceras', async ({ app }) => {
  const { page } = app;
  await app.open({ ...BASE, '/notas.org': DOC }, '/file/notas.org');
  await expect(page.locator('text=Gamma').first()).toBeVisible({ timeout: 20000 });
  await page.locator('[data-testid=eli-header-tag]').first().click();
  const view = page.locator('[data-testid=eli-tag-view]');
  await expect(view).toBeVisible({ timeout: 5000 });
  await expect(view.locator('[data-testid=eli-hv-item]')).toHaveCount(2);
  await expect(page.locator('[data-testid=eli-tag-view-count]')).toHaveText('2');
  await page.locator('[data-testid=eli-tag-view-close]').click();
  await expect(view).toHaveCount(0);
  expect(app.errors).toEqual([]);
});

test('4.29: Añadir › Enlace a cabecera inserta un enlace por ID', async ({ app }) => {
  const { page } = app;
  await app.open({ ...BASE, '/notas.org': DOC }, '/file/notas.org');
  await expect(page.locator('text=Beta').first()).toBeVisible({ timeout: 20000 });
  await app.press(page.locator('text=Beta').first());
  await page.waitForTimeout(400);
  await page.locator('[data-testid=eli-docbar-insert]').click();
  await page.locator('[data-testid=eli-docbar-link-heading]').click();
  await expect(page.locator('[data-testid=eli-ask-pick]')).toBeVisible({ timeout: 5000 });
  await page.locator('[data-testid=eli-pick-search]').fill('Delta');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-testid=eli-ask-pick]')).toHaveCount(0);
  const area = page.locator('[data-testid=description-textarea]');
  await expect(area).toHaveValue(/\[\[id:[^\]]+\]\[Delta\]\]/, { timeout: 5000 });
  await area.press('Escape');
  await expect
    .poll(async () => (await app.fileAfterSync('/notas.org', 500)) || '', { timeout: 15000 })
    .toMatch(/\* Beta\n\[\[id:[^\]]+\]\[Delta\]\][\s\S]*\* Delta\n:PROPERTIES:\n:ID: /);
  expect(app.errors).toEqual([]);
});
