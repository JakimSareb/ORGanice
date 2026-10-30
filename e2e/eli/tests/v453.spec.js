// 4.53: Documentos I: «[[ ]]» al editar notas (sin cerrar el editor), clic derecho, narrow con
// pulsación de 1 s y ciclo de visibilidad. La lógica (ciclo, formato, historial) va en jest (eli453).
const { test, expect } = require('../harness');

const BASE = { '/tasks.org': '', '/inbox.org': '' };

test('4.53: «[[ ]]» al editar las notas inserta el enlace por ID sin cerrar el editor', async ({
  app,
}) => {
  const { page } = app;
  const DOC = '* Receta\n:PROPERTIES:\n:ID: REC-1\n:END:\nMezclar todo.\n* Menú\n';
  await app.open({ ...BASE, '/notas.org': DOC }, '/file/notas.org');
  const t = page.locator('text=Menú').first();
  await expect(t).toBeVisible({ timeout: 20000 });
  await app.press(t);
  await page.waitForTimeout(500);
  // título → notas
  await page.locator('[data-testid=eli-docbar-edit]').click();
  await page.locator('[data-testid=eli-docbar-edit]').click();
  const area = page.locator('[data-testid=description-textarea]');
  await expect(area).toBeVisible({ timeout: 5000 });
  await page.locator('[data-testid=eli-docbar-link-hdr]').click();
  await expect(page.locator('[data-testid=eli-ask-pick]')).toBeVisible({ timeout: 5000 });
  await page.locator('[data-testid=eli-pick-search]').fill('Receta');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-testid=eli-ask-pick]')).toHaveCount(0);
  // el editor sigue abierto y lleva el enlace
  await expect(area).toHaveValue(/\[\[id:REC-1\]\[Receta\]\]/, { timeout: 5000 });
  // lo mismo al teclear «[[» (otro camino al mismo buscador)
  await area.press('End');
  await page.keyboard.type(' y [[');
  await expect(page.locator('[data-testid=eli-ask-pick]')).toBeVisible({ timeout: 5000 });
  await page.locator('[data-testid=eli-pick-search]').fill('Receta');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-testid=eli-ask-pick]')).toHaveCount(0);
  await expect(area).toHaveValue(/\[\[id:REC-1\]\[Receta\]\].* y \[\[id:REC-1\]\[Receta\]\]/, {
    timeout: 5000,
  });
  expect(app.errors).toEqual([]);
});

test('4.53: clic derecho sobre una cabecera abre el menú con las opciones', async ({ app }) => {
  test.skip(app.mobile, 'con el ratón');
  const { page } = app;
  await app.open({ ...BASE, '/notas.org': '* Menú\nnotas\n* Otra\n' }, '/file/notas.org');
  const t = page.locator('text=Menú').first();
  await expect(t).toBeVisible({ timeout: 20000 });
  await t.click({ button: 'right' });
  await expect(page.locator('[data-testid=eli-docbar-sub-ctx]')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('[data-testid=eli-docbar-narrow]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid=eli-docbar-sub-ctx]')).toHaveCount(0);
});

test('4.53: narrow solo tras mantener el texto 1 s', async ({ app }) => {
  test.skip(app.mobile, 'con el ratón');
  const { page } = app;
  await app.open({ ...BASE, '/notas.org': '* Menú\n* Otra\n' }, '/file/notas.org');
  const t = page.locator('text=Menú').first();
  await expect(t).toBeVisible({ timeout: 20000 });
  const b = await t.boundingBox();
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  // soltar antes de 1 s: no hace nada (se sigue viendo la otra cabecera)
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.up();
  await page.waitForTimeout(300);
  await expect(page.locator('text=Otra').first()).toBeVisible();
  // mantener más de 1 s: narrow (solo queda «Menú»)
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(1400);
  await page.mouse.up();
  await expect(page.locator('text=Otra').first()).toBeHidden({ timeout: 5000 });
});

test('4.53: el botón de visibilidad cicla CERRADA → HIJOS → TODO', async ({ app }) => {
  const { page } = app;
  await app.open(
    { ...BASE, '/notas.org': '* Alfa\ntexto de alfa\n** Beta\ntexto de beta\n* Gamma\n' },
    '/file/notas.org'
  );
  await expect(page.locator('text=Gamma').first()).toBeVisible({ timeout: 20000 });
  const cycle = async () => {
    await page.locator('[data-testid=eli-more-top]').click();
    if (app.mobile) await page.locator('[data-testid=eli-menu-view]').click();
    else await page.locator('[data-testid=eli-menu-view]').hover();
    await page.locator('[data-testid=eli-cycle-visibility]').click();
    await page.waitForTimeout(300);
  };
  await expect(page.locator('text=texto de alfa').first()).toBeHidden();
  await cycle(); // HIJOS: el nivel 1 abierto, la subcabecera plegada
  await expect(page.locator('text=texto de alfa').first()).toBeVisible();
  await expect(page.locator('text=texto de beta').first()).toBeHidden();
  await cycle(); // TODO
  await expect(page.locator('text=texto de beta').first()).toBeVisible();
  await cycle(); // CERRADA
  await expect(page.locator('text=texto de alfa').first()).toBeHidden();
  expect(app.errors).toEqual([]);
});
