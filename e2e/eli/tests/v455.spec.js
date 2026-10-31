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
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)));
  const ids = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-drag-id]')).map((e) =>
        e.getAttribute('data-drag-id')
      )
    );
  const grip = page.locator('[data-testid=eli-gtdsec-next-grip]');
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

// (4.57) Con el dedo: el asa no debe dejar que la página haga scroll (pointercancel). Esta prueba
// habría detectado el fallo real de la 4.55 (base.css fijaba touch-action: manipulation al botón).
test('4.57: Ajustes › GTD: las secciones se ordenan con el dedo', async ({ app }) => {
  test.skip(!app.mobile, 'solo con toque');
  const { page } = app;
  await app.open(BASE, '/settings');
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)));
  const grip = page.locator('[data-testid=eli-gtdsec-next-grip]');
  await grip.scrollIntoViewIfNeeded();
  await expect(grip).toBeVisible({ timeout: 20000 });
  expect(await grip.evaluate((el) => getComputedStyle(el).touchAction)).toBe('none');
  const ids = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-drag-id]')).map((e) =>
        e.getAttribute('data-drag-id')
      )
    );
  const before = await ids();
  const from = before.indexOf('next');
  const gb = await grip.boundingBox();
  const target = page.locator(`[data-drag-id="${before[from + 2]}"]`);
  const tb = await target.boundingBox();
  const cdp = await page.context().newCDPSession(page);
  const cx = gb.x + gb.width / 2;
  const cy = gb.y + gb.height / 2;
  const endY = tb.y + tb.height - 2;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: cx, y: cy }],
  });
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: cx, y: cy + ((endY - cy) * i) / 10 }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(async () => (await ids()).indexOf('next')).toBe(from + 2);
  expect(app.errors).toEqual([]);
});
