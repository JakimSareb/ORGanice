// 4.45: Diario (hora del apunte, aviso de enviado al INBOX), herramientas en la barra superior,
// atajos «,» «j» Alt+U/Alt+C, cabecera del proyecto dentro de la tarjeta y ventana de Atajos
const { test, expect, gtd } = require('../harness');

const BASE = { '/tasks.org': '', '/inbox.org': '' };
const DOC = `* Cabecera
* Otra
`;
const pad = (n) => String(n).padStart(2, '0');

const openDoc = async (app, localStorage = {}) => {
  const { page } = app;
  await app.open({ ...BASE, '/notas.org': DOC }, '/file/notas.org', { localStorage });
  await expect(page.locator('text=Cabecera').first()).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(400);
};

test('4.45 C: «,» abre Ajustes y «j» el diario en Documentos', async ({ app }) => {
  test.skip(app.mobile, 'teclas');
  const { page } = app;
  await openDoc(app);
  await page.locator('text=Cabecera').first().click();
  await page.keyboard.press('j');
  await expect(page.locator('[data-testid=eli-diary]')).toBeVisible({ timeout: 20000 });
  await page.locator('[data-testid=eli-diary-close]').click();
  await expect(page.locator('[data-testid=eli-diary]')).toHaveCount(0);
  await page.keyboard.press(',');
  await expect(page).toHaveURL(/settings/, { timeout: 10000 });
  expect(app.errors).toEqual([]);
});

test('4.45 C: Alt+U pone en mayúsculas la palabra siguiente del título', async ({ app }) => {
  test.skip(app.mobile, 'teclas');
  const { page } = app;
  await openDoc(app);
  await page.locator('text=Cabecera').first().click();
  await page.waitForTimeout(300);
  await page.locator('text=Cabecera').first().click(); // 2.º toque = editar el título
  await page.waitForTimeout(500);
  await page.keyboard.press('Home');
  await page.keyboard.press('Alt+u');
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await expect
    .poll(async () => (await app.fileAfterSync('/notas.org', 500)) || '', { timeout: 15000 })
    .toContain('* CABECERA');
  expect(app.errors).toEqual([]);
});

test('4.45 B: una herramienta por encima de la línea «Barra superior» sale como icono de la barra', async ({
  app,
}) => {
  const { page } = app;
  await openDoc(app, { eliMenuLayout: JSON.stringify({ bar: 2 }) });
  await expect(page.locator('[data-testid=eli-find-menu-top]')).toBeVisible();
  // no se repite en el menú ☰
  await page.locator('[data-testid=eli-more-top]').click();
  await expect(
    page.locator('[data-testid=eli-more-top-menu] [data-testid=eli-find-menu]')
  ).toHaveCount(0);
  expect(app.errors).toEqual([]);
});

test('4.45 B: en Ajustes la línea «Barra superior» está arriba y se puede bajar', async ({
  app,
}) => {
  const { page } = app;
  await app.open(BASE, '/settings');
  const line = page.locator('[data-testid=eli-tools-topbar-line]');
  await line.scrollIntoViewIfNeeded().catch(() => {});
  await expect(line).toHaveCount(1);
  await page.evaluate(() => {
    document.querySelectorAll('details').forEach((d) => (d.open = true));
  });
  await page.locator('[data-testid=eli-menu-layout-down-topbar]').click();
  await expect
    .poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('eliMenuLayout')).bar))
    .toBe(1);
  expect(app.errors).toEqual([]);
});

test('4.45 A: diario: hora elegida y aviso de enviado al INBOX', async ({ app }) => {
  const { page } = app;
  await app.open(BASE, '/gtd');
  await page.waitForTimeout(1500);
  await page.locator('[data-testid=eli-more-top]').click();
  await app.press(page.locator('[data-testid=eli-diary-menu]'));
  await expect(page.locator('[data-testid=eli-diary]')).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(600);
  const time = page.locator('[data-testid=eli-diary-time]');
  await expect(time).toHaveCount(1);
  await time.fill('09:15');
  await page.locator('[data-testid=eli-diary-input]').fill('Cita con la hora puesta');
  await app.press(page.locator('[data-testid=eli-diary-add]'));
  await expect
    .poll(
      () =>
        Object.entries(app.store).find(
          ([k, v]) => /\/pages\//.test(k) && /\*\* 09:15 .*Cita con la hora puesta/.test(v)
        ),
      { timeout: 20000 }
    )
    .toBeTruthy();
  // el campo vuelve a «ahora»
  await expect(time).not.toHaveValue('09:15');
  // al INBOX: aviso y marca
  const toInbox = page.locator('[data-testid=eli-diary-entry-inbox]').first();
  if (await toInbox.count()) {
    await app.press(toInbox);
    await expect(page.locator('[data-testid=eli-diary-status]')).toContainText('Enviado al INBOX', {
      timeout: 10000,
    });
    await expect(page.locator('[data-testid=eli-diary-sent]')).toHaveCount(1);
  }
  expect(app.errors).toEqual([]);
});

const PROJ = {
  '/tasks.org':
    '* PROJECT Reforma\n** PROJECT Baño nuevo :obras:@casa:\nDEADLINE: <2099-11-15 Sun>\n' +
    ':PROPERTIES:\n:ENERGY: alta\n:EFFORT: 2:00\n:AREA: Familia\n:END:\n*** NEXT Elegir azulejos\n',
  '/inbox.org': '',
};

test('4.45 D: cabecera del proyecto: botones y datos dentro de la tarjeta', async ({ app }) => {
  const { page } = app;
  await app.open(PROJ);
  await gtd.ready(app);
  if (app.mobile) await page.click('.gtd-main__menu');
  await app.press(page.locator('[data-testid=gtd-project]', { hasText: 'Baño nuevo' }).first());
  await page.waitForTimeout(800);
  const head = await page.locator('.gtd-main__head--project').boundingBox();
  const inside = (b) => {
    expect(b).not.toBeNull();
    expect(b.y).toBeGreaterThanOrEqual(head.y - 1);
    expect(b.y + b.height).toBeLessThanOrEqual(head.y + head.height + 1);
  };
  const ids = ['gtd-view-menu-button', 'gtd-undo', 'gtd-sec-filter-btn', 'gtd-new'];
  const xs = [];
  for (const id of ids) {
    const b = await page.locator(`.gtd-main__head--project [data-testid=${id}]`).boundingBox();
    inside(b);
    xs.push(b.x);
  }
  for (let i = 0; i < xs.length - 1; i++) expect(xs[i]).toBeLessThan(xs[i + 1]);
  // padre, fecha y etiquetas dentro de la tarjeta
  inside(await page.locator('[data-testid=gtd-project-parent]').boundingBox());
  await expect(page.locator('[data-testid=gtd-project-parent]')).toContainText('Reforma');
  inside(await page.locator('[data-testid=gtd-project-due]').boundingBox());
  await expect(page.locator('[data-testid=gtd-project-tag]')).toHaveCount(2);
  inside(await page.locator('[data-testid=gtd-project-tag]').first().boundingBox());
  // sin la fila suelta de antes
  await expect(page.locator('.gtd-project-info')).toHaveCount(0);
  expect(app.errors).toEqual([]);
});

test('4.45 D: «Next Up» en un proyecto secuencial; «Next» en uno paralelo', async ({ app }) => {
  const { page } = app;
  await app.open({
    '/tasks.org':
      '* PROJECT Sec\n:PROPERTIES:\n:ORDERED: t\n:END:\n** NEXT Uno\n* PROJECT Par\n** NEXT Dos\n',
    '/inbox.org': '',
  });
  await gtd.ready(app);
  const open = async (t) => {
    if (app.mobile) await page.click('.gtd-main__menu');
    await app.press(page.locator('[data-testid=gtd-project]', { hasText: t }).first());
    await page.waitForTimeout(600);
  };
  await open('Sec');
  await expect(page.locator('[data-testid=gtd-psec-next]')).toContainText('Next Up');
  await open('Par');
  await expect(page.locator('[data-testid=gtd-psec-next]')).not.toContainText('Next Up');
  expect(app.errors).toEqual([]);
});

test('4.45 E: ventana de Atajos: grupos, buscador y cambiar una tecla', async ({ app }) => {
  test.skip(app.mobile, 'teclas');
  const { page } = app;
  await app.open(BASE);
  await gtd.ready(app);
  await page.keyboard.press('k');
  const modal = page.locator('[data-testid=gtd-shortcuts]');
  await expect(modal).toBeVisible();
  await expect(modal).toContainText('Vista GTD');
  await expect(page.locator('[data-testid=gtd-keys-group-Crear]')).toHaveCount(1);
  await page.locator('[data-testid=gtd-keys-search]').fill('diario');
  await expect(page.locator('[data-testid=gtd-keys-row]').first()).toBeVisible();
  const row = page.locator('[data-testid=gtd-keys-row]', { hasText: 'diario de hoy' }).first();
  await row.locator('[data-testid=gtd-keys-chip]').click();
  await page.keyboard.press('Alt+KeyY');
  await expect(row.locator('[data-testid=gtd-keys-chip]')).toContainText('Alt Y');
  await row.locator('[data-testid=gtd-keys-reset]').click();
  await expect(row.locator('[data-testid=gtd-keys-chip]')).toContainText('J');
  expect(app.errors).toEqual([]);
});
