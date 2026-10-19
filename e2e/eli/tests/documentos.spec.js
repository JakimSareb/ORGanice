// Humo Documentos: abrir un fichero, ver sus cabeceras y desplegar una
const { test, expect } = require('../harness');

const DOC = `* Primera cabecera
Texto de la primera.
** Hija de la primera
* Segunda cabecera
`;

test('Documentos: abre el fichero y despliega una cabecera', async ({ app }) => {
  await app.open({ '/notas.org': DOC, '/tasks.org': '', '/inbox.org': '' }, '/file/notas.org');
  const first = app.page.locator('text=Primera cabecera').first();
  await expect(first).toBeVisible({ timeout: 20000 });
  await expect(app.page.locator('text=Segunda cabecera').first()).toBeVisible();
  // 1.er toque = seleccionar; 2.º = desplegar
  await app.press(first);
  await app.page.waitForTimeout(500);
  await app.press(first);
  await expect(app.page.locator('text=Hija de la primera').first()).toBeVisible();
  expect(app.errors).toEqual([]);
});

test('Explorador: lista los ficheros de la carpeta', async ({ app }) => {
  await app.open(
    {
      '/notas.org': DOC,
      '/guion.fountain': 'INT. CASA - DÍA\n',
      '/tasks.org': '',
      '/inbox.org': '',
    },
    '/files'
  );
  await expect(app.page.locator('text=notas.org').first()).toBeVisible({ timeout: 20000 });
  await expect(app.page.locator('text=guion.fountain').first()).toBeVisible();
});

test('Flechas ← →: se ven en la lista de Ficheros (3.28)', async ({ app }) => {
  await app.open({ '/notas.org': DOC, '/tasks.org': '', '/inbox.org': '' }, '/files');
  await expect(app.page.locator('[data-testid=eli-nav-back]')).toBeVisible({ timeout: 20000 });
  await expect(app.page.locator('[data-testid=eli-nav-forward]')).toBeVisible();
});
