// 4.08: el título se edita SIEMPRE en el documento: ya no sale la caja «Editar título (completo)»
// aunque la cabecera no estuviera a la vista (p. ej. «Nueva › Debajo» de la cabecera reducida en
// narrow, que queda fuera de la vista reducida: se vuelve al fichero entero).
const { test, expect } = require('../harness');

const BASE = { '/tasks.org': '', '/inbox.org': '' };
const DOC = `* Casa
* Dinero
** Gastos
* Viajes
`;

const select = async (app, title) => {
  const t = app.page.locator(`text=${title}`).first();
  await expect(t).toBeVisible({ timeout: 20000 });
  await app.press(t);
  await app.page.waitForTimeout(500);
};

test('4.08: Nueva › Debajo en narrow edita el título en su sitio, sin caja', async ({ app }) => {
  const { page } = app;
  await app.open({ ...BASE, '/notas.org': DOC }, '/file/notas.org');
  await select(app, 'Dinero');
  await page.locator('[data-testid=eli-docbar-more]').click();
  await page.locator('[data-testid=eli-docbar-narrow]').click();
  await expect(page.locator('text=Viajes')).toHaveCount(0);
  await page.waitForTimeout(500);
  await page.locator('[data-testid=eli-docbar-new]').click();
  await page.locator('[data-testid=eli-docbar-new-below]').click();
  const title = page.locator('[data-testid=titleLineInput]');
  await expect(title).toBeVisible({ timeout: 5000 });
  await expect(page.locator('text=Editar título')).toHaveCount(0);
  await title.fill('Ahorro');
  await title.press('Escape');
  await expect(title).toHaveCount(0);
  await expect
    .poll(() => app.fileAfterSync('/notas.org'), { timeout: 15000 })
    .toMatch(/\* Dinero\n\*\* Gastos\n\* Ahorro\n\* Viajes/);
  expect(app.errors).toEqual([]);
});

test('4.08: Nueva › Subcabecera de una plegada también se edita en su sitio', async ({ app }) => {
  const { page } = app;
  await app.open({ ...BASE, '/notas.org': DOC }, '/file/notas.org');
  await select(app, 'Dinero');
  await page.locator('[data-testid=eli-docbar-new]').click();
  await page.locator('[data-testid=eli-docbar-new-sub]').click();
  const title = page.locator('[data-testid=titleLineInput]');
  await expect(title).toBeVisible({ timeout: 5000 });
  await expect(page.locator('text=Editar título')).toHaveCount(0);
  await title.fill('Ingresos');
  await title.press('Escape');
  await expect
    .poll(() => app.fileAfterSync('/notas.org'), { timeout: 15000 })
    .toMatch(/\*\* Gastos\n\*\* Ingresos\n\* Viajes/);
  expect(app.errors).toEqual([]);
});
