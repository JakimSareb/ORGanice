// 4.28: selección múltiple de cabeceras (indentar dos a la vez) y «Edición estilo Logseq»
const { test, expect } = require('../harness');

const BASE = { '/tasks.org': '', '/inbox.org': '' };
// (al abrir, las cabeceras salen plegadas: todo a nivel 1)
const DOC = `* Alfa
* Beta
* Gamma
* Otra
Notas de otra
`;

// Mantener la viñeta (dedo) y soltarla sin moverla
const holdBullet = async (app, title) => {
  const bullet = app.page
    .locator('.header', { hasText: title })
    .first()
    .locator('[data-testid=header-bullet]');
  const b = await bullet.boundingBox();
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  const send = (type) =>
    bullet.evaluate(
      (el, [type, px, py]) => {
        const ev = new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 7,
          pointerType: 'touch',
          isPrimary: true,
          clientX: px,
          clientY: py,
          button: 0,
        });
        (type === 'pointerdown' ? el : window).dispatchEvent(ev);
      },
      [type, x, y]
    );
  await send('pointerdown');
  await app.page.waitForTimeout(700);
  await send('pointerup');
};

test('4.28: seleccionar dos cabeceras e indentarlas de una vez', async ({ app }) => {
  const { page } = app;
  await app.open({ ...BASE, '/notas.org': DOC }, '/file/notas.org');
  await expect(page.locator('text=Gamma').first()).toBeVisible({ timeout: 20000 });
  if (app.mobile) {
    await holdBullet(app, 'Beta');
    await page.waitForTimeout(300);
    await app.press(page.locator('text=Gamma').first());
  } else {
    await page.locator('text=Beta').first().click();
    await page.waitForTimeout(300);
    await page
      .locator('text=Gamma')
      .first()
      .click({ modifiers: ['Shift'] });
  }
  await expect(page.locator('[data-testid=eli-docbar-row-multi]')).toBeVisible();
  await expect(page.locator('[data-testid=eli-docbar-multi-clear]')).toContainText('2');
  await page.locator('[data-testid=eli-docbar-multi-indent]').click();
  await expect
    .poll(async () => (await app.fileAfterSync('/notas.org', 500)) || '', { timeout: 15000 })
    .toContain('* Alfa\n** Beta\n** Gamma\n');
  // Esc quita la selección
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid=eli-docbar-row-multi]')).toHaveCount(0);
  expect(app.errors).toEqual([]);
});

test('4.28: con «Edición estilo Logseq», un toque en las notas las edita', async ({ app }) => {
  const { page } = app;
  await app.open({ ...BASE, '/notas.org': DOC }, '/file/notas.org', {
    localStorage: { eliLogseqEdit: 'true' },
  });
  await expect(page.locator('text=Otra').first()).toBeVisible({ timeout: 20000 });
  // desplegar «Otra» con su viñeta
  await app.press(
    page.locator('.header', { hasText: 'Otra' }).first().locator('[data-testid=header-bullet]')
  );
  const notes = page.locator('text=Notas de otra').first();
  await expect(notes).toBeVisible({ timeout: 5000 });
  await app.press(notes);
  const area = page.locator('[data-testid=description-textarea]');
  await expect(area).toBeVisible({ timeout: 5000 });
  await area.fill('Notas cambiadas');
  await area.press('Escape');
  await expect
    .poll(async () => (await app.fileAfterSync('/notas.org', 500)) || '', { timeout: 15000 })
    .toContain('* Otra\nNotas cambiadas');
  expect(app.errors).toEqual([]);
});
