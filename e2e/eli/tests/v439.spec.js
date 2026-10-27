// 4.39: las etiquetas vuelven al menú ⋯ de la barra flotante (ya no están en la fila)
const { test, expect } = require('../harness');

const BASE = { '/tasks.org': '', '/inbox.org': '' };
const DOC = `* Alfa
* Beta
`;

test('4.39: la barra flotante no lleva Etiquetas en la fila; están en ⋯', async ({ app }) => {
  const { page } = app;
  await app.open({ ...BASE, '/notas.org': DOC }, '/file/notas.org');
  const t = page.locator('text=Beta').first();
  await expect(t).toBeVisible({ timeout: 20000 });
  await app.press(t);
  await page.waitForTimeout(500);
  await expect(page.locator('[data-testid=eli-docbar-more]')).toBeVisible({ timeout: 5000 });
  // en la fila ya no está
  await expect(page.locator('[data-testid=eli-docbar-tags]')).toHaveCount(0);
  // …y sale dentro de ⋯
  await page.locator('[data-testid=eli-docbar-more]').click();
  await expect(page.locator('[data-testid=eli-docbar-tags]')).toBeVisible({ timeout: 5000 });
  expect(app.errors).toEqual([]);
});
