// 4.40: acciones en lote sobre varias cabeceras (quitar fechas) y tablas alineadas en el texto
const { test, expect, gtd } = require('../harness');

const BASE = { '/tasks.org': '', '/inbox.org': '' };
// (al abrir, las cabeceras salen plegadas: todo a nivel 1)
const DOC = `* TODO Alfa
SCHEDULED: <2026-10-28 mié>
* TODO Beta
SCHEDULED: <2026-10-29 jue>
* Gamma
`;

// Mantener la viñeta (dedo) y soltarla sin moverla (como v428)
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

test('4.40: seleccionar dos cabeceras y quitarles las fechas de una vez', async ({ app }) => {
  const { page } = app;
  await app.open({ ...BASE, '/notas.org': DOC }, '/file/notas.org');
  await expect(page.locator('text=Beta').first()).toBeVisible({ timeout: 20000 });
  if (app.mobile) {
    await holdBullet(app, 'Alfa');
    await page.waitForTimeout(600);
    await app.press(page.locator('text=Beta').first());
  } else {
    await page.locator('text=Alfa').first().click();
    await page.waitForTimeout(300);
    await page
      .locator('text=Beta')
      .first()
      .click({ modifiers: ['Shift'] });
  }
  await expect(page.locator('[data-testid=eli-docbar-multi-clear]')).toContainText('2');
  await page.locator('[data-testid=eli-docbar-multi-more]').click();
  await page.locator('[data-testid=eli-docbar-m-unplan]').click();
  await expect
    .poll(async () => (await app.fileAfterSync('/notas.org', 500)) || 'x', { timeout: 15000 })
    .not.toContain('SCHEDULED');
  expect(app.errors).toEqual([]);
});

test('4.40: al guardar las notas, la tabla queda con todos los | alineados', async ({ app }) => {
  const { page } = app;
  await app.open({
    '/tasks.org': '* NEXT Tarea\n| a | b |\n| ccc | d |\n',
    '/inbox.org': '',
  });
  await gtd.ready(app);
  await gtd.openList(app, 'Next');
  const t = page.locator('[data-testid=gtd-task-title]:has-text("Tarea")');
  if (app.mobile) await app.press(t);
  else await t.dblclick();
  await expect(page.locator('.gtd-editor')).toHaveCount(1);
  await page.waitForTimeout(600);
  await page.fill('[data-testid=gtd-editor-notes]', '| a | b |\n| ccc | largo |\n| x | y |');
  await page.click('[data-testid=gtd-editor-save]');
  await expect
    .poll(async () => (await app.fileAfterSync('/tasks.org', 500)) || '', { timeout: 15000 })
    .toContain('| ccc | largo |');
  const text = (await app.fileAfterSync('/tasks.org', 500)) || '';
  const rows = text.split('\n').filter((l) => l.trim().startsWith('|'));
  expect(rows.length).toBe(3);
  const pipes = (l) => [...l].map((c, i) => (c === '|' ? i : -1)).filter((i) => i >= 0);
  rows.forEach((l) => expect(pipes(l)).toEqual(pipes(rows[0])));
  expect(app.errors).toEqual([]);
});
