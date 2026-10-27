// 4.44: elementos de lista (teclado/plegado), árbol de heredadas, áreas a horizons.org,
// seleccionar con el ratón y soltar fuera del cuadro (D) y notas en texto plano (E)
const { test, expect, gtd } = require('../harness');

const BASE = { '/tasks.org': '', '/inbox.org': '' };
const DOC = `* Cabecera
- Seccion uno
  texto debajo uno
  mas texto uno
- Seccion dos
  texto dos
* Otra
`;

const openDoc = async (app, localStorage = {}) => {
  const { page } = app;
  await app.open({ ...BASE, '/notas.org': DOC }, '/file/notas.org', { localStorage });
  await expect(page.locator('text=Cabecera').first()).toBeVisible({ timeout: 20000 });
  await page.locator('text=Cabecera').first().click();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
};

// arrastrar con el ratón desde dentro del cuadro hasta (x, y) fuera y soltar
const dragOut = async (page, box, to) => {
  await page.mouse.move(box.x + 40, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(to[0], to[1], { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(600);
};

for (const logseq of [false, true]) {
  test(`4.44 D: soltar fuera del cuadro de una sección no pierde lo escrito (logseq ${logseq})`, async ({
    app,
  }) => {
    test.skip(app.mobile, 'con el ratón');
    const { page } = app;
    await openDoc(app, logseq ? { eliLogseqEdit: 'true' } : {});
    await page.locator('text=Seccion uno').first().click();
    await page.waitForTimeout(300);
    await page.click('[data-testid=eli-docbar-li-contents]');
    const ta = page.locator('.attributed-string__list-part textarea');
    await expect(ta).toHaveCount(1);
    await ta.press('End');
    await page.keyboard.type('X');
    const b = await ta.boundingBox();
    // hacia la izquierda (fuera del cuadro) y luego hacia abajo
    await dragOut(page, b, [Math.max(2, b.x - 30), b.y + 10]);
    await expect(page.locator('[data-testid=description-textarea]')).toHaveCount(0);
    if ((await ta.count()) === 1) {
      const b2 = await ta.boundingBox();
      await dragOut(page, b2, [b2.x + 40, b2.y + b2.height + 30]);
      await expect(page.locator('[data-testid=description-textarea]')).toHaveCount(0);
    }
    await page.keyboard.press('Escape');
    await expect
      .poll(async () => (await app.fileAfterSync('/notas.org', 500)) || '', { timeout: 15000 })
      .toContain('mas texto unoX');
    const f = (await app.fileAfterSync('/notas.org', 500)) || '';
    expect(f).toContain('texto debajo uno');
    expect(f).toContain('- Seccion dos');
    expect(app.errors).toEqual([]);
  });
}

// ---------- A: elementos de lista con teclado y plegado ----------
const selected = (page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('.list-part__item--selected')).map((e) =>
      e.textContent.trim()
    )
  );
const bodyVisible = (page) => page.locator('text=texto debajo uno').first().isVisible();

test('4.44 A: ↓ desde la cabecera entra en la lista; ←/→ y la viñeta pliegan la sección', async ({
  app,
}) => {
  test.skip(app.mobile, 'con teclado y ratón');
  const { page } = app;
  await openDoc(app);
  // la cabecera queda seleccionada: ↓ = primer elemento de sus notas
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => selected(page)).toEqual(['Seccion uno']);
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => selected(page)).toEqual(['Seccion dos']);
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => selected(page)).toEqual(['Seccion uno']);
  // ← pliega la sección (su texto de debajo deja de verse); → la despliega
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => bodyVisible(page)).toBe(false);
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => bodyVisible(page)).toBe(true);
  // ↑ en el primer elemento = la cabecera; ↓ vuelve al elemento
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => selected(page)).toEqual([]);
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => selected(page)).toEqual(['Seccion uno']);
  // ↑ desde la cabecera de debajo entra en el último elemento de la lista de encima
  await page.locator('text=Otra').first().click();
  await page.waitForTimeout(300);
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => selected(page)).toEqual(['Seccion dos']);
  // tocar la viñeta (a la izquierda del texto) pliega y no abre las notas
  const r = await page.locator('li[data-list-item-id] >> text=Seccion uno').first().boundingBox();
  await page.mouse.click(r.x - 8, r.y + r.height / 2);
  await expect.poll(() => bodyVisible(page)).toBe(false);
  await page.mouse.click(r.x - 8, r.y + r.height / 2);
  await expect.poll(() => bodyVisible(page)).toBe(true);
  await expect(page.locator('[data-testid=description-textarea]')).toHaveCount(0);
  expect(app.errors).toEqual([]);
});

// ---------- E: notas en texto plano ----------
test('4.44 E: con «Notas en texto plano» un toque en una sección no la selecciona', async ({
  app,
}) => {
  test.skip(app.mobile, 'con teclado');
  const { page } = app;
  await openDoc(app, { eliNotesPlain: 'true' });
  await page.locator('text=Seccion uno').first().click();
  await page.waitForTimeout(300);
  expect(await selected(page)).toEqual([]);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(300);
  expect(await selected(page)).toEqual([]);
  // doble clic en una sección = editar las notas enteras
  await page.locator('text=Seccion dos').first().dblclick();
  await expect(page.locator('[data-testid=description-textarea]')).toHaveCount(1);
  expect(app.errors).toEqual([]);
});

// ---------- B: cabeceras que heredan la etiqueta, en árbol ----------
const TAGFILE = `* Proyecto casa :casa:
** Sub uno
*** Sub uno uno
** Sub dos
** TODO Tarea en sub
* Otra cosa :casa:
`;

test('4.44 B: GTD, vista de la etiqueta: las subcabeceras van dentro de su madre (▸)', async ({
  app,
}) => {
  const { page } = app;
  await app.open({ '/tasks.org': TAGFILE, '/inbox.org': '' });
  await gtd.ready(app);
  if (app.mobile) await page.click('.gtd-main__menu');
  await app.press(page.locator('[data-testid=gtd-side-tag]', { hasText: 'casa' }).first());
  await page.waitForTimeout(800);
  // plegadas: no salen sueltas; la tarea sí sigue en la lista
  await expect.poll(() => gtd.titles(app)).not.toContain('Sub uno');
  expect(await gtd.titles(app)).toContain('Tarea en sub');
  const madre = page.locator('[data-testid=gtd-task]', { hasText: 'Proyecto casa' }).first();
  await app.press(madre.locator('.gtd-fold'));
  await expect(page.locator('.gtd-task.is-sub-1', { hasText: 'Sub uno' })).toHaveCount(1);
  expect(app.errors).toEqual([]);
});

test('4.44 B: Documentos, vista por etiqueta: con «Incluir heredadas» salen las hijas anidadas', async ({
  app,
}) => {
  const { page } = app;
  await app.open({ ...BASE, '/casa.org': TAGFILE }, '/file/casa.org');
  await expect(page.locator('text=Proyecto casa').first()).toBeVisible({ timeout: 20000 });
  await app.press(page.locator('[data-testid=eli-header-tag]', { hasText: 'casa' }).first());
  await expect(page.locator('[data-testid=eli-tag-view]')).toBeVisible();
  const nested = page.locator('[data-testid=eli-hv-nested] [data-testid=eli-hv-title]');
  await expect(nested.filter({ hasText: 'Sub uno' }).first()).toBeVisible();
  await app.press(page.locator('[data-testid=eli-tag-view-inherited]'));
  await expect(nested).toHaveCount(0);
  expect(app.errors).toEqual([]);
});

// ---------- C: área nueva desde una tarea → horizons.org ----------
test('4.44 C: un área nueva escrita en la tarea se añade a horizons.org', async ({ app }) => {
  const { page } = app;
  await app.open({
    '/tasks.org': '* NEXT Pintar\n',
    '/inbox.org': '',
    '/horizons.org': '* Objetivos (1–2 años)\n* Áreas de responsabilidad\n** Casa\n',
  });
  await gtd.ready(app);
  await gtd.openList(app, 'Next');
  const t = page.locator('[data-testid=gtd-task-title]:has-text("Pintar")');
  if (app.mobile) await app.press(t);
  else await t.dblclick();
  await expect(page.locator('.gtd-editor')).toHaveCount(1);
  await page.waitForTimeout(600);
  await app.press(page.locator('.gtd-editor [data-testid=gtd-editor-area-add]'));
  await page.locator('[data-testid=eli-pick-search]').fill('Jardineria');
  await app.press(page.locator('[data-testid=eli-pick-new]'));
  await expect
    .poll(() => app.fileAfterSync('/horizons.org', 500), { timeout: 15000 })
    .toContain('** Jardineria');
  await page.click('[data-testid=gtd-editor-save]');
  await expect
    .poll(() => app.fileAfterSync('/tasks.org', 500), { timeout: 15000 })
    .toContain('Jardineria');
  // la siguiente vez sale en la lista (y no se duplica en horizons.org)
  expect(((await app.fileAfterSync('/horizons.org', 500)) || '').split('Jardineria').length).toBe(
    2
  );
  expect(app.errors).toEqual([]);
});
