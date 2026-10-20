// GTD (3.45): al arrastrar una tarea, el menú lateral se desplaza solo cerca de sus extremos; y
// soltarla en otro grupo de estado (proyecto, o Focus agrupado por estado) le cambia el estado
const { test, expect, gtd } = require('../harness');

// Arrastre con el ratón hasta un punto (sin soltar si keep)
const mouseDrag = async (page, locator, to, { keep = false } = {}) => {
  const b = await locator.boundingBox();
  await page.mouse.move(b.x + 40, b.y + b.height / 2);
  await page.mouse.down();
  // en vertical: en horizontal sería deslizar (hecha / papelera), no arrastrar
  await page.mouse.move(b.x + 40, b.y + b.height / 2 + 14, { steps: 3 });
  // el destino se mide ya arrastrando (en un proyecto salen entonces las secciones vacías)
  await page.waitForTimeout(300);
  if (typeof to === 'function') to = await to();
  await page.mouse.move(to.x, to.y, { steps: 15 });
  await page.waitForTimeout(300);
  if (!keep) await page.mouse.up();
};
// Punto en la parte baja de una cabecera de sección (cuenta como el principio de esa sección)
const belowHeader = async (locator) => {
  const b = await locator.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height * 0.8 };
};

test('GTD (3.45): el menú lateral se desplaza solo al arrastrar una tarea', async ({
  app,
  isMobile,
}) => {
  test.skip(isMobile, 'con el ratón');
  let tasks = '* NEXT Suelta\n';
  for (let i = 1; i <= 40; i++) tasks += `* PROJECT Proyecto ${i}\n** NEXT Paso ${i}\n`;
  await app.open({ '/tasks.org': tasks, '/inbox.org': '' });
  await gtd.ready(app);
  await gtd.openList(app, 'Next');
  const { page } = app;
  const side = page.locator('.gtd-side');
  const scrollTop = () => side.evaluate((el) => el.scrollTop);
  expect(await side.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  expect(await scrollTop()).toBe(0);
  const sb = await side.boundingBox();
  const row = page.locator('[data-testid=gtd-task-title]:has-text("Suelta")').first();
  // abajo del menú: baja solo
  await mouseDrag(page, row, { x: sb.x + sb.width / 2, y: sb.y + sb.height - 15 }, { keep: true });
  await page.waitForTimeout(1200);
  const down = await scrollTop();
  expect(down).toBeGreaterThan(50);
  // arriba del menú: sube solo
  await page.mouse.move(sb.x + sb.width / 2, sb.y + 15, { steps: 8 });
  await page.waitForTimeout(1200);
  expect(await scrollTop()).toBeLessThan(down);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.waitForTimeout(500);
  expect(app.errors).toEqual([]);
});

test('GTD (3.45): en un proyecto, soltar en «Waiting» cambia el estado', async ({
  app,
  isMobile,
}) => {
  test.skip(isMobile, 'con el ratón');
  // (sin «Acciones siguientes secuenciales», que mezcla Waiting con Next)
  await app.open(
    { '/tasks.org': '* PROJECT Casa\n** NEXT Pintar\n** WAITING Llave\n', '/inbox.org': '' },
    undefined,
    { localStorage: { eliGtdGroup: JSON.stringify('none') } }
  );
  await gtd.ready(app);
  const { page } = app;
  await app.press(page.locator('[data-testid=gtd-project]', { hasText: 'Casa' }).first());
  await page.waitForTimeout(800);
  const row = page.locator('[data-testid=gtd-task-title]:has-text("Pintar")').first();
  await mouseDrag(page, row, () => belowHeader(page.locator('[data-testid=gtd-psec-waiting]')));
  await page.waitForTimeout(3000);
  const text = await app.fileAfterSync('/tasks.org');
  expect(text).toMatch(/\*\* WAITING Pintar/);
  expect(app.errors).toEqual([]);
});

test('GTD (3.45): Focus agrupado por estado: soltar en otro grupo cambia el estado', async ({
  app,
  isMobile,
}) => {
  test.skip(isMobile, 'con el ratón');
  await app.open(
    {
      '/tasks.org': '* NEXT [#A] Pintar\n* WAITING [#A] Llave\n',
      '/inbox.org': '',
    },
    undefined,
    { localStorage: { eliGtdGroup: JSON.stringify('status') } }
  );
  await gtd.ready(app);
  const { page } = app;
  const waiting = page.locator('[data-testid=gtd-group-status]', { hasText: 'Waiting' }).first();
  await expect(waiting).toHaveCount(1);
  const row = page.locator('[data-testid=gtd-task-title]:has-text("Pintar")').first();
  await mouseDrag(page, row, () => belowHeader(waiting));
  await page.waitForTimeout(3000);
  const text = await app.fileAfterSync('/tasks.org');
  expect(text).toMatch(/\* WAITING \[#A\] Pintar/);
  expect(app.errors).toEqual([]);
});
