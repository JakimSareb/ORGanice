// 4.43: GTD: tipo de letra también en GTD (interruptor), vista por defecto del proyecto según
// secuencial/paralelo, cabecera del proyecto (sin contador, botones debajo, ⇉/↓ dentro, título
// largo con sangría colgante)
const { test, expect, gtd } = require('../harness');

const SEQ = {
  '/tasks.org':
    '* PROJECT Casa\n:PROPERTIES:\n:ORDERED: t\n:END:\n** NEXT Pintar\n** WAITING Llave\n',
  '/inbox.org': '',
};
const LONG =
  'Preparar el viaje largo de verano con toda la familia y revisar todos los billetes de tren, los hoteles reservados, los seguros de viaje y los permisos de los niños';
const LARGO = {
  '/tasks.org': `* PROJECT ${LONG}\n** NEXT Comprar billetes\n`,
  '/inbox.org': '',
};

const openProject = async (app, text) => {
  const { page } = app;
  if (app.mobile) await page.click('.gtd-main__menu');
  await app.press(page.locator('[data-testid=gtd-project]', { hasText: text }).first());
  await page.waitForTimeout(800);
};
const fontOfGtd = (page) =>
  page.evaluate(() => getComputedStyle(document.querySelector('.gtd')).fontFamily);

test('4.43: letra de GTD: con el interruptor encendido GTD toma la letra elegida', async ({
  app,
}) => {
  await app.open(SEQ, '/gtd', { localStorage: { eliFont: 'mono', eliFontGtd: 'true' } });
  await gtd.ready(app);
  expect(await fontOfGtd(app.page)).toContain('Menlo');
  expect(app.errors).toEqual([]);
});

test('4.43: letra de GTD: apagado (por defecto) GTD conserva su letra de siempre', async ({
  app,
}) => {
  await app.open(SEQ, '/gtd', { localStorage: { eliFont: 'mono' } });
  await gtd.ready(app);
  expect(await fontOfGtd(app.page)).not.toContain('Menlo');
  expect(app.errors).toEqual([]);
});

test('4.43: proyecto secuencial abre en vista secuencial; ⇉/↓ la cambia y Next no se toca', async ({
  app,
}) => {
  const { page } = app;
  await app.open(SEQ);
  await gtd.ready(app);
  await openProject(app, 'Casa');
  // secuencial: Waiting va mezclada con Next (no hay sección Waiting aparte)
  await expect(page.locator('[data-testid=gtd-psec-next]')).toHaveCount(1);
  await expect(page.locator('[data-testid=gtd-psec-waiting]')).toHaveCount(0);
  // el botón está dentro de la cabecera; un toque lo pasa a paralelo → lista única
  const toggle = page.locator('.gtd-main__head [data-testid=gtd-project-order-toggle]');
  await expect(toggle).toHaveCount(1);
  await toggle.click();
  await expect(page.locator('[data-testid=gtd-psec-waiting]')).toHaveCount(1, { timeout: 10000 });
  const text = await app.fileAfterSync('/tasks.org');
  expect(text).not.toMatch(/:ORDERED:/);
  // el ajuste global (el de Next) no se ha tocado
  expect(await page.evaluate(() => localStorage.getItem('eliGtdGroup'))).toBeNull();
  expect(app.errors).toEqual([]);
});

test('4.43: cabecera del proyecto: sin contador, botones debajo en una línea, título con sangría', async ({
  app,
}) => {
  const { page } = app;
  await app.open(LARGO);
  await gtd.ready(app);
  await openProject(app, 'Preparar el viaje');
  // sin número de tareas
  await expect(page.locator('[data-testid=gtd-title] .gtd-main__count')).toHaveCount(0);
  // (4.45) los botones están DENTRO de la tarjeta de cabecera, en su orden: ⋯ < deshacer < buscar < nuevo
  const head = await page.locator('.gtd-main__head--project').boundingBox();
  const tools = page.locator('.gtd-main__head--project [data-testid=gtd-project-tools]');
  await expect(tools).toHaveCount(1);
  const ids = ['gtd-view-menu-button', 'gtd-undo', 'gtd-sec-filter-btn', 'gtd-new'];
  const boxes = [];
  for (const id of ids) {
    const b = await tools.locator(`[data-testid=${id}]`).boundingBox();
    expect(b).not.toBeNull();
    boxes.push(b);
  }
  boxes.forEach((b) => {
    expect(b.y).toBeGreaterThanOrEqual(head.y);
    expect(b.y + b.height).toBeLessThanOrEqual(head.y + head.height + 1);
    expect(Math.abs(b.y - boxes[0].y)).toBeLessThan(10); // una sola línea
  });
  for (let i = 0; i < boxes.length - 1; i++) expect(boxes[i].x).toBeLessThan(boxes[i + 1].x);
  // ⇉/↓ dentro de la cabecera
  await expect(page.locator('.gtd-main__head [data-testid=gtd-project-order-toggle]')).toHaveCount(
    1
  );
  const title = page.locator('[data-testid=gtd-edit-project]');
  const rects = await title.evaluate((el) =>
    Array.from(el.getClientRects()).map((r) => ({ left: r.left, right: r.right }))
  );
  expect(rects.length).toBeGreaterThan(1); // el título ocupa más de una línea
  // sangría colgante: la 2.ª línea empieza donde la 1.ª, ya a la derecha de la estrella
  const star = await page.locator('[data-testid=gtd-project-star]').boundingBox();
  expect(Math.abs(rects[1].left - rects[0].left)).toBeLessThan(2);
  expect(rects[0].left).toBeGreaterThanOrEqual(star.x + star.width - 1);
  expect(app.errors).toEqual([]);
});
