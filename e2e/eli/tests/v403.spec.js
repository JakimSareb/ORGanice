// 4.03: «Nueva › Arriba» y la viñeta que siempre pliega/despliega. (4.04) Nueva en su sitio, sin
// hoja; la que se deja vacía se borra sola. El ajuste «Editarla» ya no existe.
const { test, expect } = require('../harness');

const BASE = { '/tasks.org': '', '/inbox.org': '' };
const DOC = `* Primera
Texto de la primera
* Segunda
`;
const FOLD = `* Primera cabecera
** Hija de la primera
* Segunda cabecera
`;

const select = async (app, title) => {
  const t = app.page.locator(`text=${title}`).first();
  await expect(t).toBeVisible({ timeout: 20000 });
  await app.press(t);
  await app.page.waitForTimeout(500);
};

test('4.03/4.04: Nueva › Arriba añade antes, con el título en edición en su sitio', async ({
  app,
}) => {
  await app.open({ ...BASE, '/notas.org': DOC }, '/file/notas.org');
  await select(app, 'Segunda');
  await app.page.locator('[data-testid=eli-docbar-new]').click();
  await expect(app.page.locator('[data-testid=eli-docbar-new-below]')).toBeVisible();
  await expect(app.page.locator('[data-testid=eli-docbar-new-sub]')).toBeVisible();
  await app.page.locator('[data-testid=eli-docbar-new-above]').click();
  const title = app.page.locator('[data-testid=titleLineInput]');
  await expect(title).toBeVisible();
  await expect(title).toHaveValue('');
  await expect(app.page.locator('[data-testid=eli-edit-sheet]')).toHaveCount(0);
  await title.fill('Nueva arriba');
  await title.press('Enter');
  const text = await app.fileAfterSync('/notas.org');
  expect(text).toMatch(/\* Nueva arriba\n\* Segunda/);
  expect(text).toMatch(/^\* Primera\n/);
  expect(app.errors).toEqual([]);
});

test('4.04: Nueva › Debajo que se deja vacía se borra sola (y no deja paso en deshacer)', async ({
  app,
}) => {
  await app.open({ ...BASE, '/notas.org': DOC }, '/file/notas.org');
  await select(app, 'Primera');
  const headers = app.page.locator('.header');
  await expect(headers).toHaveCount(2);
  const undo = app.page.locator('[data-testid=eli-undo]');
  const undoBefore = await undo.getAttribute('aria-disabled');
  await app.page.locator('[data-testid=eli-docbar-new]').click();
  await app.page.locator('[data-testid=eli-docbar-new-below]').click();
  const title = app.page.locator('[data-testid=titleLineInput]');
  await expect(title).toBeVisible();
  await expect(headers).toHaveCount(3);
  // salir sin escribir nada
  await title.press('Escape');
  await expect(title).toHaveCount(0);
  await expect(headers).toHaveCount(2);
  await expect(undo).toHaveAttribute('aria-disabled', undoBefore);
  expect(app.errors).toEqual([]);
});

test('4.03: la viñeta pliega/despliega con un toque (ajuste por defecto)', async ({ app }) => {
  await app.open({ ...BASE, '/notas.org': FOLD }, '/file/notas.org');
  await expect(app.page.locator('text=Primera cabecera').first()).toBeVisible({ timeout: 20000 });
  const child = app.page.locator('text=Hija de la primera');
  await expect(child).toHaveCount(0);
  const bullet = app.page
    .locator('.header', { hasText: 'Primera cabecera' })
    .first()
    .locator('.header__bullet')
    .first();
  // la viñeta ya no queda tapada por la línea del título
  const onTop = await bullet.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (hit === el || el.contains(hit));
  });
  expect(onTop).toBe(true);
  // en el móvil, Chromium «corrige» el toque hacia el título (como en gtd_347): se le manda el clic
  const tapBullet = async () => {
    if (app.mobile) await bullet.dispatchEvent('click');
    else await bullet.click();
  };
  await tapBullet();
  await expect(child.first()).toBeVisible();
  await app.page.waitForTimeout(600);
  await tapBullet();
  await expect(child).toHaveCount(0);
  expect(app.errors).toEqual([]);
});
