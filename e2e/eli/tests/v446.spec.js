// 4.46: Zettelkasten. «+ Punto» (⋯ de una ficha de fuente) añade la fila a «Puntos destacados» y,
// con «Cita larga abajo», el texto entero queda en «Citas» con su :ID:. El resto (plantillas, | en
// las celdas, fugaces, alias) va en jest (eli_zk.unit.test.js).
const { test, expect } = require('../harness');

const BASE = { '/tasks.org': '', '/inbox.org': '' };
const FICHA = [
  ':PROPERTIES:',
  ':ID:       FICHA-1',
  ':END:',
  '#+title: Un libro',
  '#+filetags: :literatura:libro:',
  '* Por qué lo leo',
  '* Puntos destacados',
  '| Dónde | Sección | Punto o cita | Tipo | Nota ZK |',
  '|-------+---------+--------------+------+---------|',
  '* Citas',
  '',
].join('\n');

test('4.46: + Punto añade la fila y la cita larga baja a «Citas»', async ({ app }) => {
  const { page } = app;
  await app.open({ ...BASE, '/ficha.org': FICHA }, '/file/ficha.org');
  const t = page.locator('text=Por qué lo leo').first();
  await expect(t).toBeVisible({ timeout: 20000 });
  await app.press(t);
  await page.waitForTimeout(500);
  await page.locator('[data-testid=eli-docbar-more]').click();
  await page.locator('[data-testid=eli-zk-add-point]').click();
  await expect(page.locator('[data-testid=eli-ask-form]')).toBeVisible({ timeout: 5000 });
  await page.locator('[data-testid=eli-form-where]').fill('p. 41');
  await page
    .locator('[data-testid=eli-form-text]')
    .fill('Una cita | con barra y bastante larga para el caso');
  await page.locator('[data-testid=eli-form-longQuote]').check();
  await page.locator('[data-testid=eli-ask-form] button[type=submit]').click();
  await expect(page.locator('[data-testid=eli-ask-form]')).toHaveCount(0);
  await expect
    .poll(async () => (await app.fileAfterSync('/ficha.org', 500)) || '', { timeout: 15000 })
    .toContain('\\vert{}');
  const text = (await app.fileAfterSync('/ficha.org', 500)) || '';
  expect(text).toMatch(/\| p\. 41 .*\[\[id:[^\]]+\]\[↓\]\]/);
  expect(text).toMatch(/\* Citas\n\*\* p\. 41 — /);
  expect(text).toContain('Una cita \\vert{} con barra y…');
  expect(text).toContain('\nUna cita | con barra y bastante larga para el caso\n');
  expect(app.errors).toEqual([]);
});
