// 4.12: Menú ☰ ordenable (y entradas ocultables) y margen izquierdo de Documentos ajustable.
// (Las carpetas excluidas no se pueden probar aquí: el arnés no lista ficheros; van en jest, eli412.)
const { test, expect } = require('../harness');

const BASE = { '/tasks.org': '', '/inbox.org': '' };
const DOC = `* Padre
** Hija
* Segunda
`;

test('4.12: el Menú ☰ sigue el orden guardado y no muestra las entradas apagadas', async ({
  app,
}) => {
  const { page } = app;
  await app.open({ ...BASE, '/notas.org': DOC }, '/file/notas.org', {
    localStorage: {
      // (4.17) las entradas que faltan en el orden guardado van en su sitio por defecto (Buscar
      // (B), Agenda y Capturar, delante de Ayuda): también apagadas
      eliMenuLayout: JSON.stringify({
        order: ['help', 'search'],
        hidden: ['search', 'find', 'agenda', 'capture'],
      }),
    },
  });
  await expect(page.locator('text=Segunda').first()).toBeVisible({ timeout: 20000 });
  await page.locator('[data-testid=eli-more-top]').click();
  await expect(page.locator('[data-testid=eli-menu-help]')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('[data-testid=eli-palette-btn]')).toHaveCount(0);
  await expect(
    page.locator('[data-testid=eli-more-top-menu] .eli-more__item').first()
  ).toContainText('Ayuda');
  await expect(
    page.locator('[data-testid=eli-more-top-menu] .eli-more__item').last()
  ).toContainText('Ajustes');
  expect(app.errors).toEqual([]);
});

test('4.12: Ajustes › Apariencia: Menú ☰ y margen izquierdo se guardan', async ({ app }) => {
  const { page } = app;
  await app.open(BASE, '/settings');
  await page.locator('[data-testid=eli-settings-appearance] > summary').click();
  await expect(page.locator('[data-testid=eli-setting-menu-layout]')).toBeVisible({
    timeout: 20000,
  });
  await page.locator('[data-testid=eli-menu-layout-down-find]').click();
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('eliMenuLayout')).order[0])
  ).toBe('agenda');
  await page.locator('[data-testid=eli-doc-margin]').fill('30');
  expect(await page.evaluate(() => localStorage.getItem('eliDocMargin'))).toBe('30');
  expect(
    await page.evaluate(() => document.documentElement.style.getPropertyValue('--eli-doc-margin'))
  ).toBe('30px');
  expect(app.errors).toEqual([]);
});
