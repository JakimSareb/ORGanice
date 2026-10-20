// GTD (3.36): buscar en todas las secciones, filtro por sección y etiquetas heredadas
const { test, expect, gtd } = require('../harness');

const TASKS = `* PROJECT Casa :@casa:
** NEXT Pintar valla
* NEXT Llamar valla :@casa:
* TODO Comprar valla
* NEXT Otra
`;

const openMenu = async (app) => {
  if (app.mobile) await app.page.click('.gtd-main__menu');
};

test('GTD (3.36): buscar en todo, filtrar la sección y «Heredadas»', async ({ app }) => {
  const { page } = app;
  await app.open({ '/tasks.org': TASKS, '/inbox.org': '' });
  await gtd.ready(app);
  await gtd.openList(app, 'Next');

  // (a) buscador del menú lateral: resultados de varias secciones, agrupados
  await openMenu(app);
  await page.fill('[data-testid=gtd-search]', 'valla');
  await page.press('[data-testid=gtd-search]', 'Enter');
  await expect(page.locator('[data-testid=gtd-search-results]')).toBeVisible();
  await expect(page.locator('.gtd-search__group >> nth=0')).toContainText('Next');
  await expect(page.locator('.gtd-search__group >> nth=1')).toContainText('Todo');
  await expect(
    page.locator('.gtd-search__group >> nth=0 >> [data-testid=gtd-search-result]')
  ).toHaveCount(2);
  await expect(
    page.locator('.gtd-search__group >> nth=1 >> [data-testid=gtd-search-result]')
  ).toHaveCount(1);
  // plegar un grupo
  await page.click('.gtd-search__group >> nth=0 >> [data-testid=gtd-search-group-toggle]');
  await expect(
    page.locator('.gtd-search__group >> nth=0 >> [data-testid=gtd-search-result]')
  ).toHaveCount(0);
  // tocar un resultado: va a su sección y lo abre
  await page.click('.gtd-search__group >> nth=1 >> [data-testid=gtd-search-result]');
  await expect(page.locator('[data-testid=gtd-search-results]')).toHaveCount(0);
  await expect(page.locator('.gtd-editor')).toHaveCount(1);
  await expect(page.locator('[data-testid=gtd-editor-title]')).toHaveValue(/Comprar valla/);
  await page.press('[data-testid=gtd-editor-title]', 'Enter');
  await expect(page.locator('.gtd-editor')).toHaveCount(0);

  // filtro de la sección (lupa de la cabecera)
  await gtd.openList(app, 'Next');
  await page.click('[data-testid=gtd-sec-filter-btn]');
  await page.fill('[data-testid=gtd-sec-filter]', 'valla');
  await page.waitForTimeout(400);
  expect((await gtd.titles(app)).sort()).toEqual(['Llamar valla', 'Pintar valla']);
  await page.click('[data-testid=gtd-sec-filter-clear]');
  await expect(page.locator('[data-testid=gtd-sec-filter-row]')).toHaveCount(0);
  await page.waitForTimeout(400);
  expect((await gtd.titles(app)).length).toBe(3);
  // se borra al cambiar de sección
  await page.click('[data-testid=gtd-sec-filter-btn]');
  await page.fill('[data-testid=gtd-sec-filter]', 'valla');
  await gtd.openList(app, 'Todo');
  await expect(page.locator('[data-testid=gtd-sec-filter-row]')).toHaveCount(0);

  // (b) «Heredadas»: con ella @casa incluye «Pintar valla» (del proyecto); sin ella, no
  await gtd.openList(app, 'Next');
  await page.click('[data-testid=gtd-chip-tag]:has-text("@casa")');
  await page.waitForTimeout(400);
  expect((await gtd.titles(app)).sort()).toEqual(['Llamar valla', 'Pintar valla']);
  await page.click('[data-testid=gtd-chip-inherit]');
  await page.waitForTimeout(400);
  expect((await gtd.titles(app)).sort()).toEqual(['Llamar valla']);
  expect(app.errors).toEqual([]);
});
