// GTD (3.39): lupa de sección con el cursor dentro y «Heredadas» con tres estados
const { test, expect, gtd } = require('../harness');

const TASKS = `* PROJECT Casa :@casa:
** NEXT Pintar valla
* NEXT Llamar valla :@casa:
* NEXT Otra
`;

test('GTD (3.39): lupa enfocada y «Heredadas» en tres estados', async ({ app }) => {
  const { page } = app;
  await app.open({ '/tasks.org': TASKS, '/inbox.org': '' });
  await gtd.ready(app);
  await gtd.openList(app, 'Next');

  // 1. la lupa deja el cursor en el campo (en el móvil, con un toque)
  if (app.mobile) await app.page.tap('[data-testid=gtd-sec-filter-btn]');
  else await page.click('[data-testid=gtd-sec-filter-btn]');
  await page.waitForTimeout(300);
  expect(
    await page.evaluate(() => document.activeElement && document.activeElement.dataset.testid)
  ).toBe('gtd-sec-filter');
  await page.keyboard.type('valla');
  await page.waitForTimeout(400);
  expect((await gtd.titles(app)).sort()).toEqual(['Llamar valla', 'Pintar valla']);
  await page.click('[data-testid=gtd-sec-filter-clear]');
  await page.waitForTimeout(400);

  // 2. Heredadas: cuentan → solo propias → excluir → cuentan
  const chip = page.locator('[data-testid=gtd-chip-inherit]');
  await expect(chip).toHaveAttribute('data-state', 'all');
  await page.click('[data-testid=gtd-chip-inherit]');
  await expect(chip).toHaveAttribute('data-state', 'own');
  await page.click('[data-testid=gtd-chip-inherit]');
  await expect(chip).toHaveAttribute('data-state', 'exclude');
  await page.waitForTimeout(400);
  // «Pintar valla» solo tiene @casa heredada del proyecto: fuera
  expect((await gtd.titles(app)).sort()).toEqual(['Llamar valla', 'Otra']);
  // se recuerda al recargar
  expect(await page.evaluate(() => localStorage.getItem('eliGtdTagInherit'))).toBe('"exclude"');
  await page.click('[data-testid=gtd-chip-inherit]');
  await expect(chip).toHaveAttribute('data-state', 'all');
  await page.waitForTimeout(400);
  expect((await gtd.titles(app)).length).toBe(3);
  expect(app.errors).toEqual([]);
});

test('GTD (3.39a): teclado externo en pantalla estrecha — ← abre el menú lateral', async ({
  app,
}) => {
  test.skip(!app.mobile);
  const { page } = app;
  await app.open({ '/tasks.org': TASKS, '/inbox.org': '' });
  await gtd.ready(app);
  await gtd.openList(app, 'Next');
  const sideOpen = () => page.$eval('.gtd', (g) => g.classList.contains('is-side-open'));
  const focused = () =>
    page.evaluate(() => {
      const el = document.activeElement;
      return el && el.classList.contains('gtd-side__item') ? el.textContent.trim() : null;
    });
  await page.waitForTimeout(400);
  expect(await sideOpen()).toBe(false);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(400);
  expect(await sideOpen()).toBe(true);
  expect(await focused()).toContain('Next');
  // ↑ cambia de sección y el menú sigue abierto
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(400);
  expect(await sideOpen()).toBe(true);
  expect(await focused()).not.toContain('Next');
  // → vuelve a la lista y cierra el menú
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(400);
  expect(await sideOpen()).toBe(false);
  expect(app.errors).toEqual([]);
});
