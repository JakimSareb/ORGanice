// 4.55: GTD I. La lógica (estado Referencia, :CREATED:/:ORDERED:, recurrentes, orden) va en jest
// (gtd455); aquí lo que necesita un navegador: la lista de ficheros de Ajustes y el orden por asa.
const { test, expect } = require('../harness');

const BASE = {
  '/tasks.org': '* NEXT Algo\n',
  '/inbox.org': '',
  '/a.org': '',
  '/b.org': '',
  '/c.org': '',
  '/d.org': '',
  '/e.org': '',
  '/f.org': '',
  '/zeta.org': '',
};

test('4.55: Ajustes › GTD: lista de ficheros con buscador y casilla', async ({ app }) => {
  test.skip(app.mobile, 'ajustes de escritorio');
  const { page } = app;
  await app.open(BASE, '/gtd');
  await page.waitForTimeout(1500);
  // a Ajustes sin recargar (para que los ficheros sigan cargados)
  await page.evaluate(() => {
    window.history.pushState({}, '', '/settings');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.waitForTimeout(800);
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)));
  const list = page.locator('[data-testid=eli-gtdfiles-archive-list]');
  await list.scrollIntoViewIfNeeded();
  await expect(list).toBeVisible({ timeout: 20000 });
  const search = page.locator('[data-testid=eli-gtdfiles-archive-search]');
  await expect(search).toBeVisible();
  await expect(page.locator('[data-testid="eli-gtdfiles-archive-/tasks.org"]')).toBeVisible();
  await search.fill('inbox');
  await expect(page.locator('[data-testid="eli-gtdfiles-archive-/inbox.org"]')).toBeVisible();
  await expect(page.locator('[data-testid="eli-gtdfiles-archive-/tasks.org"]')).toHaveCount(0);
  await page.locator('[data-testid="eli-gtdfiles-archive-/inbox.org"]').check();
  await expect(page.locator('[data-testid="eli-gtdfiles-archive-/inbox.org"]')).toBeChecked();
  expect(app.errors).toEqual([]);
});

test('4.55: Ajustes › GTD: las secciones se ordenan arrastrando su asa', async ({ app }) => {
  test.skip(app.mobile, 'con el ratón');
  const { page } = app;
  await app.open(BASE, '/settings');
  const grip = page.locator('[data-testid=eli-gtdsec-next-grip]');
  // (4.56) con carga, los desplegables salen después: se abren hasta que el asa se ve
  await expect
    .poll(
      async () => {
        await page.evaluate(() =>
          document.querySelectorAll('details').forEach((d) => (d.open = true))
        );
        return grip.isVisible();
      },
      { timeout: 30000 }
    )
    .toBe(true);
  const ids = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-drag-id]')).map((e) =>
        e.getAttribute('data-drag-id')
      )
    );
  await grip.scrollIntoViewIfNeeded();
  await expect(grip).toBeVisible({ timeout: 20000 });
  const before = await ids();
  const from = before.indexOf('next');
  const target = page.locator(`[data-drag-id="${before[from + 2]}"]`);
  const gb = await grip.boundingBox();
  const tb = await target.boundingBox();
  await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
  await page.mouse.down();
  await page.mouse.move(gb.x + 5, gb.y + 40, { steps: 4 });
  await page.mouse.move(gb.x + 5, tb.y + tb.height - 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await ids()).indexOf('next')).toBe(from + 2);
  expect(app.errors).toEqual([]);
});
