// 4.49: lote de ajustes. Menú ☰ › Vista siempre completo, el scroll sigue a la cabecera que se
// mueve, Atrás tira atrás directamente, y los atajos del historial / del salto título ↔ notas se
// pueden reasignar y desactivar (ventana de Atajos). El resto va en jest (eli449).
const { test, expect } = require('../harness');

const BASE = { '/tasks.org': '', '/inbox.org': '' };
const OPEN_MODE = { localStorage: { eliTapMode: JSON.stringify({ header: 'open' }) } };

const waitDoc = async (app, title) =>
  expect(app.page.locator(`text=${title}`).first()).toBeVisible({ timeout: 20000 });

const openView = async (app) => {
  const { page } = app;
  await page.locator('[data-testid=eli-more-top]').click();
  if (app.mobile) await page.locator('[data-testid=eli-menu-view]').click();
  else await page.locator('[data-testid=eli-menu-view]').hover();
};

test('4.49: ☰ › Vista lleva siempre «Dos columnas» y «Editar como texto plano»', async ({
  app,
}) => {
  const { page } = app;
  await app.open({ ...BASE, '/notas.org': '* Uno\n* Dos\n' }, '/file/notas.org');
  await waitDoc(app, 'Dos');
  await openView(app);
  await expect(page.locator('[data-testid=eli-split-open]')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('[data-testid=eli-raw-edit]')).toBeVisible();
  // con un fichero abierto, «Editar como texto plano» está activo
  await expect(page.locator('[data-testid=eli-raw-edit]')).toBeEnabled();
  // sin duplicados: ya no está en «Mis ficheros»
  await page.keyboard.press('Escape');
  expect(app.errors).toEqual([]);
});

test('4.49: en la vista GTD (sin fichero) siguen visibles, atenuadas', async ({ app }) => {
  const { page } = app;
  await app.open(BASE, '/gtd');
  await page.waitForTimeout(800);
  await openView(app);
  await expect(page.locator('[data-testid=eli-raw-edit]')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('[data-testid=eli-raw-edit]')).toBeDisabled();
  await expect(page.locator('[data-testid=eli-split-open]')).toBeVisible();
  expect(app.errors).toEqual([]);
});

test('4.49: al mover una cabecera con las flechas, el scroll la sigue', async ({ app }) => {
  test.skip(app.mobile, 'Alt+flechas: solo con teclado');
  const { page } = app;
  const rows = Array.from({ length: 45 }, (_, i) => `* Cab ${String(i + 1).padStart(2, '0')}\n`);
  await app.open({ ...BASE, '/notas.org': rows.join('') }, '/file/notas.org');
  await waitDoc(app, 'Cab 45');
  await app.press(page.locator('.title-line-text', { hasText: 'Cab 01' }).first());
  await page.waitForTimeout(400);
  const visible = async () => {
    const box = await page.locator('.title-line-text', { hasText: 'Cab 01' }).first().boundingBox();
    const h = await page.evaluate(() => window.innerHeight);
    return !!box && box.y >= 0 && box.y + box.height <= h;
  };
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Alt+ArrowDown');
    await page.waitForTimeout(60);
  }
  await expect.poll(visible, { timeout: 5000 }).toBe(true);
  // y hacia arriba otra vez
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Alt+ArrowUp');
    await page.waitForTimeout(60);
  }
  await expect.poll(visible, { timeout: 5000 }).toBe(true);
  expect(app.errors).toEqual([]);
});

const DOC =
  '* Origen\nVer [[id:DEST][el destino]]\n* Relleno\n* Destino\n:PROPERTIES:\n:ID: DEST\n:END:\nTexto destino\nIr [[id:FIN][al fin]]\n* Fin\n:PROPERTIES:\n:ID: FIN\n:END:\nTexto del fin\n';

const followBoth = async (app) => {
  const { page } = app;
  await app.press(page.locator('.title-line-text', { hasText: 'Origen' }).first());
  const l1 = page.locator('.eli-org-link', { hasText: 'el destino' }).first();
  await expect(l1).toBeVisible({ timeout: 10000 });
  await l1.click();
  await expect(page.locator('[data-testid=eli-narrow-back]')).toBeVisible({ timeout: 10000 });
  const l2 = page.locator('.eli-org-link', { hasText: 'al fin' }).first();
  await page.waitForTimeout(500);
  if (!(await l2.isVisible())) {
    await app.press(page.locator('.title-line-text', { hasText: 'Destino' }).first());
  }
  await expect(l2).toBeVisible({ timeout: 10000 });
  await l2.click();
  await expect(page.locator('text=Texto del fin').first()).toBeVisible({ timeout: 10000 });
};

test('4.49: la flecha ← tira atrás directamente (sin salir antes de narrow)', async ({ app }) => {
  const { page } = app;
  await app.open({ ...BASE, '/notas.org': DOC }, '/file/notas.org', OPEN_MODE);
  await waitDoc(app, 'Origen');
  await followBoth(app);
  // un solo toque en ←: la vista anterior (Destino, todavía reducida), no el fichero entero
  await page.locator('[data-testid=eli-nav-back]').click();
  await expect(page.locator('text=Texto destino').first()).toBeVisible({ timeout: 10000 });
  await expect(page.locator('[data-testid=eli-narrow-back]')).toBeVisible();
  await expect(page.locator('text=Relleno')).toHaveCount(0);
  // otra vez: ya sí, el fichero entero
  await page.locator('[data-testid=eli-nav-back]').click();
  await expect(page.locator('text=Relleno').first()).toBeVisible({ timeout: 10000 });
  expect(app.errors).toEqual([]);
});

test('4.49: Alt+← y Alt+→ siguen valiendo por defecto para el historial', async ({ app }) => {
  test.skip(app.mobile, 'solo con teclado');
  const { page } = app;
  await app.open({ ...BASE, '/notas.org': DOC }, '/file/notas.org', OPEN_MODE);
  await waitDoc(app, 'Origen');
  await app.press(page.locator('.title-line-text', { hasText: 'Origen' }).first());
  await page.locator('.eli-org-link', { hasText: 'el destino' }).first().click();
  await expect(page.locator('[data-testid=eli-narrow-back]')).toBeVisible({ timeout: 10000 });
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(page.locator('[data-testid=eli-narrow-back]')).toHaveCount(0, { timeout: 10000 });
  await page.keyboard.press('Alt+ArrowRight');
  await expect(page.locator('[data-testid=eli-narrow-back]')).toBeVisible({ timeout: 10000 });
  expect(app.errors).toEqual([]);
});

const openShortcutsGtd = async (app) => {
  const { page } = app;
  await app.open({ ...BASE, '/notas.org': DOC }, '/gtd', OPEN_MODE);
  await page.waitForTimeout(800);
  await page.keyboard.press('k');
  await expect(page.locator('[data-testid=gtd-shortcuts]')).toBeVisible({ timeout: 10000 });
};
const rowOf = (page, text) => page.locator('[data-testid=gtd-keys-row]', { hasText: text }).first();
const gotoDoc = async (app, path) => {
  await app.page.keyboard.press('Escape');
  await app.page.evaluate((to) => {
    window.dispatchEvent(new CustomEvent('eli:navigate', { detail: to }));
  }, path);
};

test('4.49: reasignar «Historial: atrás» y desactivar «Historial: adelante»', async ({ app }) => {
  test.skip(app.mobile, 'solo con teclado');
  const { page } = app;
  await openShortcutsGtd(app);
  await page.locator('[data-testid=gtd-keys-search]').fill('Historial');
  const back = rowOf(page, 'Historial: atrás');
  await back.locator('[data-testid=gtd-keys-chip]').click();
  await page.keyboard.press('Alt+KeyB');
  await expect(back.locator('[data-testid=gtd-keys-chip]')).toContainText('Alt B');
  // desactivar «adelante»: queda atenuado y la tecla se conserva
  const fwd = rowOf(page, 'Historial: adelante');
  await fwd.locator('[data-testid=gtd-keys-off]').click();
  await expect(fwd).toHaveClass(/is-off/);
  await expect(fwd.locator('[data-testid=gtd-keys-chip]')).toContainText('→');
  // no cuenta como tecla repetida con «subir de nivel» de las listas (Alt+→ en otro contexto)
  await gotoDoc(app, '/file/notas.org');
  await waitDoc(app, 'Origen');
  await app.press(page.locator('.title-line-text', { hasText: 'Origen' }).first());
  await page.locator('.eli-org-link', { hasText: 'el destino' }).first().click();
  await expect(page.locator('[data-testid=eli-narrow-back]')).toBeVisible({ timeout: 10000 });
  // la tecla vieja ya no hace nada…
  await page.keyboard.press('Alt+ArrowLeft');
  await page.waitForTimeout(400);
  await expect(page.locator('[data-testid=eli-narrow-back]')).toBeVisible();
  // …y la nueva sí
  await page.keyboard.press('Alt+KeyB');
  await expect(page.locator('[data-testid=eli-narrow-back]')).toHaveCount(0, { timeout: 10000 });
  // «adelante» está desactivado: Alt+→ no vuelve
  await page.keyboard.press('Alt+ArrowRight');
  await page.waitForTimeout(400);
  await expect(page.locator('[data-testid=eli-narrow-back]')).toHaveCount(0);
  expect(app.errors).toEqual([]);
});

test('4.49: el salto título ↔ notas (Tab) se reasigna y se desactiva', async ({ app }) => {
  test.skip(app.mobile, 'solo con teclado');
  const { page } = app;
  await openShortcutsGtd(app);
  await page.locator('[data-testid=gtd-keys-search]').fill('Saltar');
  const jump = rowOf(page, 'Saltar entre el título');
  await expect(jump.locator('[data-testid=gtd-keys-chip]')).toContainText('Tab');
  await jump.locator('[data-testid=gtd-keys-chip]').click();
  await page.keyboard.press('Alt+KeyJ');
  await expect(jump.locator('[data-testid=gtd-keys-chip]')).toContainText('Alt J');
  await gotoDoc(app, '/file/notas.org');
  await waitDoc(app, 'Relleno');
  await app.press(page.locator('.title-line-text', { hasText: 'Relleno' }).first());
  await page.waitForTimeout(300);
  await page.keyboard.press('Control+KeyH');
  const title = page.locator('[data-testid=titleLineInput]');
  await expect(title).toBeVisible({ timeout: 5000 });
  // Tab ya no salta a las notas
  await title.press('Tab');
  await page.waitForTimeout(300);
  await expect(page.locator('[data-testid=description-textarea]')).toHaveCount(0);
  // la tecla nueva sí
  await title.press('Alt+KeyJ');
  await expect(page.locator('[data-testid=description-textarea]')).toBeVisible({ timeout: 5000 });
  expect(app.errors).toEqual([]);
});
