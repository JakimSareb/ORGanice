// 4.36: estrella de Focus del proyecto, cabecera reducida que se pliega, enlace → narrow con
// Backlinks al pie y altura estable al teclear. El resto va en jest (eli436).
const { test, expect, gtd } = require('../harness');

const BASE = { '/tasks.org': '', '/inbox.org': '' };
const OPEN_MODE = { localStorage: { eliTapMode: JSON.stringify({ header: 'open' }) } };
const EDIT_MODE = { localStorage: { eliTapMode: JSON.stringify({ header: 'edit' }) } };

const waitDoc = async (app, title) =>
  expect(app.page.locator(`text=${title}`).first()).toBeVisible({ timeout: 20000 });

test('4.36: la estrella de Focus del proyecto alterna [#A]', async ({ app }) => {
  const { page } = app;
  await app.open(
    {
      '/tasks.org': '* PROJECT Ordenar el trastero\n** NEXT Tirar cajas\n',
      '/inbox.org': '',
    },
    '/gtd'
  );
  await gtd.ready(app);
  await app.press(
    page.locator('[data-testid=gtd-project]', { hasText: 'Ordenar el trastero' }).first()
  );
  const star = page.locator('[data-testid=gtd-project-star]');
  await expect(star).toBeVisible({ timeout: 15000 });
  await star.click();
  await expect
    .poll(async () => (await app.fileAfterSync('/tasks.org', 500)) || '', { timeout: 15000 })
    .toMatch(/\* PROJECT \[#A\] Ordenar el trastero/);
  expect(app.errors).toEqual([]);
});

test('4.36: la cabecera reducida se pliega y se despliega', async ({ app }) => {
  const { page } = app;
  await app.open(
    { ...BASE, '/notas.org': '* Raíz\nTexto de la raíz\n** Hija\n* Otra\n' },
    '/file/notas.org',
    OPEN_MODE
  );
  await waitDoc(app, 'Raíz');
  await app.press(page.locator('.title-line-text', { hasText: 'Raíz' }).first());
  await page.waitForTimeout(400);
  await page.locator('[data-testid=eli-docbar-more]').click();
  await page.locator('[data-testid=eli-docbar-narrow]').click();
  await expect(page.locator('text=Otra')).toHaveCount(0);
  const body = page.locator('text=Texto de la raíz').first();
  await expect(body).toBeVisible({ timeout: 5000 });
  for (const visible of [false, true, false]) {
    await app.press(page.locator('.title-line-text', { hasText: 'Raíz' }).first());
    await page.waitForTimeout(400);
    expect(await body.isVisible()).toBe(visible);
  }
  expect(app.errors).toEqual([]);
});

test('4.36: un enlace a otra cabecera la abre en narrow con sus Backlinks al pie', async ({
  app,
}) => {
  const { page } = app;
  const doc =
    '* Origen\nVer [[id:DEST][el destino]]\n* Destino\n:PROPERTIES:\n:ID: DEST\n:END:\nTexto destino\n';
  await app.open({ ...BASE, '/notas.org': doc }, '/file/notas.org', OPEN_MODE);
  await waitDoc(app, 'Origen');
  await app.press(page.locator('.title-line-text', { hasText: 'Origen' }).first());
  const link = page.locator('.eli-org-link', { hasText: 'el destino' }).first();
  await expect(link).toBeVisible({ timeout: 10000 });
  await link.click();
  await expect(page.locator('[data-testid=eli-narrow-back]')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('text=Texto destino').first()).toBeVisible();
  const refs = page.locator('[data-testid=eli-narrow-refs]');
  await expect(refs).toBeVisible({ timeout: 10000 });
  await expect(refs).toContainText('Origen');
  await expect(refs).toContainText('el destino');
  // el bloque entero se pliega con su título
  await page.locator('[data-testid=eli-narrow-refs-toggle]').click();
  await expect(refs.locator('[data-testid=eli-hv-item]')).toHaveCount(0);
  expect(app.errors).toEqual([]);
});

test('4.36: al teclear en una línea la altura del cuadro no crece', async ({ app }) => {
  const { page } = app;
  await app.open({ ...BASE, '/notas.org': '* Primera\n* Segunda\n' }, '/file/notas.org', EDIT_MODE);
  await waitDoc(app, 'Segunda');
  await app.press(page.locator('text=Segunda').first());
  const input = page.locator('[data-testid=titleLineInput]');
  await expect(input).toHaveCount(1, { timeout: 5000 });
  await page.waitForTimeout(400);
  const h = () => input.evaluate((el) => el.offsetHeight);
  const before = await h();
  await page.keyboard.type('abcdefghijklmnopqrst', { delay: 15 });
  await page.waitForTimeout(200);
  expect(await h()).toBe(before);
  expect(app.errors).toEqual([]);
});
