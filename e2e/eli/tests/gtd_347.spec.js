// 3.47: Documentos (widen, un toque para plegar, sangría al pulsar Intro, cursor visible en notas
// largas) y Ajustes (Apariencia plegada)
const { test, expect } = require('../harness');

const BASE = { '/tasks.org': '', '/inbox.org': '' };

// Selecciona el encabezado y abre «Editar notas» en su sitio
const editNotes = async (app, title) => {
  const t = app.page.locator(`text=${title}`).first();
  await expect(t).toBeVisible({ timeout: 20000 });
  await app.press(t);
  await app.page.waitForTimeout(500);
  await app.page.locator('[data-testid=eli-docbar-edit]').click();
  await app.page.locator('[data-testid=eli-docbar-edit-notes]').click();
  const ta = app.page.locator('[data-testid=description-textarea]');
  await expect(ta).toBeVisible();
  await app.page.waitForTimeout(500);
  return ta;
};

test('Ajustes (3.47): «Apariencia» empieza plegada y se despliega', async ({ app }) => {
  await app.open(BASE, '/settings');
  const sec = app.page.locator('[data-testid=eli-settings-appearance]');
  await sec.waitFor({ timeout: 20000 });
  expect(await sec.evaluate((d) => d.open)).toBe(false);
  await sec.locator('> summary').click();
  expect(await sec.evaluate((d) => d.open)).toBe(true);
  await expect(app.page.locator('[data-testid=eli-setting-tap-header-mobile]')).toBeVisible();
});

const FOLD = `* Primera cabecera
** Hija de la primera
* Segunda cabecera
`;

test('Documentos (3.47): con «Plegar / desplegar» basta un toque (título o viñeta)', async ({
  app,
}) => {
  await app.open({ ...BASE, '/notas.org': FOLD }, '/file/notas.org', {
    localStorage: {
      eliTapMode: JSON.stringify({ 'header-desktop': 'open', 'header-mobile': 'open' }),
    },
  });
  const first = app.page.locator('text=Primera cabecera').first();
  await expect(first).toBeVisible({ timeout: 20000 });
  const child = app.page.locator('text=Hija de la primera');
  await expect(child).toHaveCount(0);
  // un toque en el título: despliega
  await app.press(first);
  await expect(child.first()).toBeVisible();
  await app.page.waitForTimeout(600);
  // otro toque: pliega
  await app.press(first);
  await expect(child).toHaveCount(0);
  await app.page.waitForTimeout(600);
  const second = app.page.locator('.header', { hasText: 'Segunda cabecera' }).first();
  await app.press(app.page.locator('text=Segunda cabecera').first());
  await app.page.waitForTimeout(600);
  const bullet = app.page
    .locator('.header', { hasText: 'Primera cabecera' })
    .first()
    .locator('.header__bullet')
    .first();
  // la viñeta queda bajo la línea del título: se le manda el clic directamente
  await bullet.dispatchEvent('click');
  await expect(child.first()).toBeVisible();
  await expect(second).toBeVisible();
  expect(app.errors).toEqual([]);
});

test('Documentos (3.47): Intro en las notas copia la sangría de la línea', async ({ app }) => {
  await app.open(
    { ...BASE, '/notas.org': '* Con sangría\n   línea sangrada\n' },
    '/file/notas.org'
  );
  const ta = await editNotes(app, 'Con sangría');
  await ta.evaluate((el) => {
    const i = el.value.indexOf('sangrada') + 'sangrada'.length;
    el.focus();
    el.setSelectionRange(i, i);
  });
  await app.page.keyboard.press('Enter');
  await app.page.keyboard.type('nueva');
  expect(await ta.inputValue()).toContain('   línea sangrada\n   nueva');
  expect(app.errors).toEqual([]);
});

const LONG =
  '* Primera\n* Nota larga\n' +
  Array.from({ length: 90 }, (_, i) => `línea ${i + 1} de una nota muy larga`).join('\n') +
  '\n* Última\n';

test('Documentos (3.47): en una nota larga la vista sigue al cursor', async ({ app }) => {
  await app.open({ ...BASE, '/notas.org': LONG }, '/file/notas.org');
  const ta = await editNotes(app, 'Nota larga');
  // cursor al final de la nota (muy por debajo de la pantalla) y escribir
  await ta.evaluate((el) => {
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  });
  await app.page.keyboard.type('Z');
  await app.page.waitForTimeout(800);
  const pos = await ta.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const bar = document.querySelector('.eli-docbar');
    const b = bar ? bar.getBoundingClientRect() : null;
    const limit = Math.min(window.innerHeight, b && b.height > 0 ? b.top : window.innerHeight);
    return { bottom: r.bottom, limit };
  });
  // el final del cuadro (donde está el cursor) se ve, por encima de la barra de abajo
  expect(pos.bottom).toBeLessThanOrEqual(pos.limit + 4);
  expect(pos.bottom).toBeGreaterThan(0);
  expect(app.errors).toEqual([]);
});

const NARROW =
  Array.from({ length: 70 }, (_, i) => `* Cabecera ${i + 1}\nTexto ${i + 1}.`).join('\n') + '\n';

test('Documentos (3.47): al volver de Narrow a Wide, la cabecera queda arriba', async ({ app }) => {
  await app.open({ ...BASE, '/notas.org': NARROW }, '/file/notas.org');
  const t = app.page.locator('text=Cabecera 25').first();
  await expect(app.page.locator('text=Cabecera 1').first()).toBeVisible({ timeout: 20000 });
  await t.scrollIntoViewIfNeeded();
  await app.press(t);
  await app.page.waitForTimeout(500);
  await app.page.locator('[data-testid=eli-docbar-more]').click();
  await app.page.locator('[data-testid=eli-docbar-narrow]').click();
  await expect(app.page.locator('text=Cabecera 3').first()).not.toBeVisible();
  await app.page.waitForTimeout(500);
  await app.page.locator('[data-testid=eli-docbar-more]').click();
  await app.page.locator('[data-testid=eli-docbar-widen]').click();
  await app.page.waitForTimeout(1000);
  const top = await app.page
    .locator('.header', { hasText: 'Cabecera 25' })
    .first()
    .evaluate((el) => {
      const bar = document.querySelector('.header-bar');
      return {
        top: el.getBoundingClientRect().top,
        bar: bar ? bar.getBoundingClientRect().bottom : 0,
      };
    });
  expect(top.top).toBeGreaterThanOrEqual(top.bar - 2);
  expect(top.top).toBeLessThan(top.bar + 40);
  expect(app.errors).toEqual([]);
});
