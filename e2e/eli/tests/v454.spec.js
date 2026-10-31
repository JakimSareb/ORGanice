// 4.54: Documentos II: copiar/pegar cabeceras con el teclado real e «Insertar estructura…».
// La lógica (niveles, IDs nuevos, HTML, carpeta, letra) va en jest (eli454).
const { test, expect } = require('../harness');

const BASE = { '/tasks.org': '', '/inbox.org': '' };

test('4.54: Ctrl+C / Ctrl+V copian una cabecera con sus hijas como subcabecera de otra', async ({
  app,
}) => {
  test.skip(app.mobile, 'con el teclado');
  const { page } = app;
  const DOC = '* Alfa\n:PROPERTIES:\n:ID: AAA-1\n:END:\n** Hija\n* Beta\n';
  await app.open({ ...BASE, '/notas.org': DOC }, '/file/notas.org');
  const alfa = page.locator('text=Alfa').first();
  await expect(alfa).toBeVisible({ timeout: 20000 });
  await alfa.click();
  await page.waitForTimeout(300);
  await page.keyboard.press('Control+c');
  await page.waitForTimeout(300);
  await page.locator('text=Beta').first().click();
  await page.waitForTimeout(300);
  await page.keyboard.press('Control+v');
  await expect
    .poll(async () => (await app.fileAfterSync('/notas.org', 500)) || '', { timeout: 15000 })
    .toMatch(/\* Beta\n\*\* Alfa\n[\s\S]*\*\*\* Hija/);
  const out = app.store['/notas.org'];
  // el original sigue ahí y la copia lleva otro :ID:
  expect(out.startsWith('* Alfa\n:PROPERTIES:\n:ID: AAA-1\n:END:\n** Hija\n* Beta\n')).toBe(true);
  expect(out.match(/:ID: AAA-1/g)).toHaveLength(1);
  expect(out.match(/:ID: /g)).toHaveLength(2);
  expect(app.errors).toEqual([]);
});

test('4.54: ⋯ › Insertar estructura… mete la plantilla como subcabecera', async ({ app }) => {
  test.skip(app.mobile, 'con el ratón');
  const { page } = app;
  await app.open({ ...BASE, '/notas.org': '* Proyecto\n* Otro\n' }, '/file/notas.org');
  const t = page.locator('text=Proyecto').first();
  await expect(t).toBeVisible({ timeout: 20000 });
  await t.click({ button: 'right' });
  const item = page.locator('[data-testid=eli-doc-insert-structure]');
  await expect(item).toBeVisible({ timeout: 5000 });
  await item.click();
  await expect(page.locator('[data-testid=eli-capture-menu]')).toBeVisible({ timeout: 5000 });
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => (await app.fileAfterSync('/notas.org', 500)) || '', { timeout: 15000 })
    .toMatch(/\* Proyecto\n\*\* TODO[^\n]*\n\* Otro/);
  expect(app.errors).toEqual([]);
});
