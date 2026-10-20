// 4.04: Menú ☰ con «Procesos» (por bloques) y Agenda la segunda; «Atajos de teclado» dentro de
// Ayuda (la misma ventana también en Documentos; en el Modo Notas, solo los de Documentos); tocar
// el título (1.º selecciona, 2.º edita); arrastrar cabeceras por la viñeta; estilos de viñeta.
const { test, expect, gtd } = require('../harness');

const BASE = { '/tasks.org': '', '/inbox.org': '' };
const DOC = `* Primera
* Segunda
* Tercera
`;

const openMenu = async (app) => {
  await app.page.locator('[data-testid=eli-more-top]').click();
  await expect(app.page.locator('[data-testid=eli-more-top-menu]')).toBeVisible();
};
const waitDoc = async (app, title) =>
  expect(app.page.locator(`text=${title}`).first()).toBeVisible({ timeout: 20000 });

test('4.04: Menú ☰ › Procesos (Diarios y Periódicos) lanza la revisión desde Documentos', async ({
  app,
}) => {
  const { page } = app;
  await app.open({ ...BASE, '/tasks.org': '* NEXT Algo\n', '/notas.org': DOC }, '/file/notas.org');
  await waitDoc(app, 'Segunda');
  await openMenu(app);
  await page.locator('[data-testid=eli-menu-processes]').click();
  await expect(page.locator('[data-testid=eli-proc-h-daily]')).toBeVisible();
  await expect(page.locator('[data-testid=eli-proc-h-periodic]')).toBeVisible();
  await expect(page.locator('[data-testid=eli-proc-inbox]')).toBeVisible();
  await page.locator('[data-testid=eli-proc-review]').click();
  await expect(page.locator('[data-testid=gtd-review]')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('[data-testid=gtd-review-title]')).toContainText('Terminadas');
  expect(app.errors).toEqual([]);
});

test('4.04: Procesar Inbox desde el Menú ☰ de GTD', async ({ app }) => {
  const { page } = app;
  await app.open({ '/tasks.org': '', '/inbox.org': '* Idea suelta\n' });
  await gtd.ready(app);
  await openMenu(app);
  await page.locator('[data-testid=eli-menu-processes]').click();
  await page.locator('[data-testid=eli-proc-inbox]').click();
  await expect(page.locator('[data-testid=gtd-process]')).toHaveCount(1);
  await expect(page.locator('[data-testid=gtd-process-title]')).toContainText('Idea suelta');
  expect(app.errors).toEqual([]);
});

test('4.04: Atajos dentro de Ayuda; en Documentos abre la ventana de atajos', async ({ app }) => {
  const { page } = app;
  await app.open({ ...BASE, '/notas.org': DOC }, '/file/notas.org');
  await waitDoc(app, 'Segunda');
  await openMenu(app);
  const top = await page
    .locator('[data-testid=eli-more-top-menu] .eli-more__item')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  expect(top).not.toContain('eli-shortcuts');
  await page.locator('[data-testid=eli-menu-help]').click();
  await page.locator('[data-testid=eli-shortcuts]').click();
  const modal = page.locator('[data-testid=gtd-shortcuts]');
  await expect(modal).toBeVisible();
  await expect(modal).toContainText('Vista GTD');
  await expect(modal).toContainText('Documentos');
  await page.locator('[data-testid=gtd-keys-close]').click();
  await expect(modal).toHaveCount(0);
  expect(app.errors).toEqual([]);
});

test('4.04: Modo Notas: sin Procesos; atajos solo de Documentos', async ({ app }) => {
  const { page } = app;
  await app.open({ ...BASE, '/notas.org': DOC }, '/file/notas.org', {
    localStorage: { eliNotesMode: 'true' },
  });
  await waitDoc(app, 'Segunda');
  await openMenu(app);
  await expect(page.locator('[data-testid=eli-menu-processes]')).toHaveCount(0);
  await page.locator('[data-testid=eli-menu-help]').click();
  await page.locator('[data-testid=eli-shortcuts]').click();
  const modal = page.locator('[data-testid=gtd-shortcuts]');
  await expect(modal).toBeVisible();
  await expect(modal).not.toContainText('Vista GTD');
  await expect(modal).toContainText('Documentos');
  // Configurar: en Ajustes, solo los de Documentos
  await page.locator('[data-testid=gtd-keys-config]').click();
  await expect(page.locator('.keyboard-shortcuts-editor-container')).toBeVisible();
  await expect(page.locator('[data-testid=kb-gtd-section]')).toHaveCount(0);
  expect(app.errors).toEqual([]);
});

test('4.04: tocar el título: 1.º selecciona, 2.º lo pone en edición', async ({ app }) => {
  const { page } = app;
  await app.open({ ...BASE, '/notas.org': DOC }, '/file/notas.org');
  await waitDoc(app, 'Segunda');
  const t = page.locator('text=Segunda').first();
  await app.press(t);
  await expect(page.locator('.header--selected')).toContainText('Segunda');
  await expect(page.locator('[data-testid=titleLineInput]')).toHaveCount(0);
  await page.waitForTimeout(500);
  await app.press(page.locator('text=Segunda').first());
  const input = page.locator('[data-testid=titleLineInput]');
  await expect(input).toBeVisible();
  await expect(input).toHaveValue('Segunda');
  expect(app.errors).toEqual([]);
});

// Arrastra la viñeta de «from» hasta el borde de arriba (dy < 0) o de abajo de «to», moviéndose dx
const dragBullet = async (app, from, to, { below = false, dx = 0 } = {}) => {
  const { page } = app;
  const bullet = page
    .locator('.header', { hasText: from })
    .first()
    .locator('[data-testid=header-bullet]');
  const b = await bullet.boundingBox();
  const target = await page.locator('.header', { hasText: to }).first().boundingBox();
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  const ty = below ? target.y + target.height * 0.8 : target.y + target.height * 0.2;
  if (app.mobile) {
    // dedo: mantener ~0,5 s y arrastrar (eventos de puntero táctil)
    const send = (type, px, py) =>
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
        [type, px, py]
      );
    await send('pointerdown', x, y);
    await page.waitForTimeout(700);
    await send('pointermove', x + dx / 2, (y + ty) / 2);
    await send('pointermove', x + dx, ty);
    await page.waitForTimeout(100);
    await expect(page.locator('[data-testid=eli-hdrag-line]')).toHaveCount(1);
    await send('pointerup', x + dx, ty);
  } else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 3, y + 10, { steps: 2 });
    await page.mouse.move(x + dx, ty, { steps: 6 });
    await expect(page.locator('[data-testid=eli-hdrag-line]')).toHaveCount(1);
    await page.mouse.up();
  }
  await expect(page.locator('[data-testid=eli-hdrag-line]')).toHaveCount(0);
};

test('4.04: arrastrar una cabecera por su viñeta (con sus hijas)', async ({ app }) => {
  await app.open(
    { ...BASE, '/notas.org': '* Primera\n** Hija de la primera\n* Segunda\n* Tercera\n' },
    '/file/notas.org'
  );
  await waitDoc(app, 'Tercera');
  await dragBullet(app, 'Primera', 'Tercera', { below: true });
  const text = await app.fileAfterSync('/notas.org');
  expect(text).toMatch(/^\* Segunda\n\* Tercera\n\* Primera\n\*\* Hija de la primera/);
  expect(app.errors).toEqual([]);
});

test('4.04: arrastrar a la derecha la hace hija de la de arriba', async ({ app }) => {
  await app.open({ ...BASE, '/notas.org': DOC }, '/file/notas.org');
  await waitDoc(app, 'Tercera');
  // «Tercera» se queda en su sitio pero un nivel más adentro (hija de Segunda)
  await dragBullet(app, 'Tercera', 'Tercera', { dx: 30 });
  const text = await app.fileAfterSync('/notas.org');
  expect(text).toMatch(/\* Segunda\n\*\* Tercera/);
  expect(app.errors).toEqual([]);
});

test('4.04: estilos de viñeta por nivel (Estrellas) y plegada con triángulo', async ({ app }) => {
  const { page } = app;
  await app.open({ ...BASE, '/notas.org': '* Madre\n** Hija\n* Sola\n' }, '/file/notas.org', {
    localStorage: { bulletStyle: 'Stars' },
  });
  await waitDoc(app, 'Madre');
  const bulletOf = (t) =>
    page.locator('.header', { hasText: t }).first().locator('[data-testid=header-bullet]');
  // plegada: mismo icono + triángulo
  await expect(bulletOf('Madre')).toContainText('★');
  await expect(bulletOf('Madre')).toContainText('▸');
  await expect(bulletOf('Sola')).toHaveText('★');
  const b = bulletOf('Madre');
  if (app.mobile) await b.dispatchEvent('click');
  else await b.click();
  await expect(page.locator('text=Hija').first()).toBeVisible();
  await expect(bulletOf('Hija')).toHaveText('✦');
  await expect(bulletOf('Madre')).not.toContainText('▸');
  expect(app.errors).toEqual([]);
});
