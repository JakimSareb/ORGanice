// 4.37: atrás/adelante al seguir un enlace, indicador de backlinks, título largo en el editor GTD,
// ajustes reagrupados y valores por defecto de una instalación nueva. El resto va en jest (eli437).
const { test, expect, gtd } = require('../harness');

const BASE = { '/tasks.org': '', '/inbox.org': '' };
const OPEN_MODE = { localStorage: { eliTapMode: JSON.stringify({ header: 'open' }) } };

const waitDoc = async (app, title) =>
  expect(app.page.locator(`text=${title}`).first()).toBeVisible({ timeout: 20000 });

const DOC =
  '* Origen\nVer [[id:DEST][el destino]]\n* Otra\n* Destino\n:PROPERTIES:\n:ID: DEST\n:END:\nTexto destino\n';

test('4.37: seguir un enlace y volver con Atrás / Adelante', async ({ app }) => {
  const { page } = app;
  await app.open({ ...BASE, '/notas.org': DOC }, '/file/notas.org', OPEN_MODE);
  await waitDoc(app, 'Origen');
  await app.press(page.locator('.title-line-text', { hasText: 'Origen' }).first());
  const link = page.locator('.eli-org-link', { hasText: 'el destino' }).first();
  await expect(link).toBeVisible({ timeout: 10000 });
  await link.click();
  await expect(page.locator('[data-testid=eli-narrow-back]')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('text=Otra')).toHaveCount(0);
  // Atrás: vuelve al documento entero
  await page.goBack();
  await expect(page.locator('[data-testid=eli-narrow-back]')).toHaveCount(0, { timeout: 10000 });
  await expect(page.locator('text=Otra').first()).toBeVisible({ timeout: 10000 });
  // Adelante: otra vez la cabecera reducida
  await page.goForward();
  await expect(page.locator('[data-testid=eli-narrow-back]')).toBeVisible({ timeout: 10000 });
  expect(app.errors).toEqual([]);
});

test('4.37: la cabecera con backlinks lleva «↩ n» y se pulsa', async ({ app }) => {
  const { page } = app;
  await app.open({ ...BASE, '/notas.org': DOC }, '/file/notas.org', OPEN_MODE);
  await waitDoc(app, 'Destino');
  const ind = page.locator('[data-testid=eli-backlinks-indicator]');
  await expect(ind).toHaveCount(1, { timeout: 10000 });
  await expect(ind).toContainText('1');
  await ind.click();
  await expect(page.locator('[data-testid=eli-backlinks]')).toBeVisible({ timeout: 10000 });
  expect(app.errors).toEqual([]);
});

test('4.37: el título largo del editor GTD crece (varias líneas)', async ({ app }) => {
  const { page } = app;
  await app.open({ '/tasks.org': '* NEXT Algo corto\n', '/inbox.org': '' });
  await gtd.ready(app);
  await gtd.openList(app, 'Next');
  const t = page.locator('[data-testid=gtd-task-title]:has-text("Algo corto")');
  if (app.mobile) await app.press(t);
  else await t.dblclick();
  const title = page.locator('[data-testid=gtd-editor-title]');
  await expect(title).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(600);
  const h0 = await title.evaluate((el) => el.offsetHeight);
  await title.evaluate((el) => {
    el.readOnly = false;
  });
  await title.fill(
    'Un título larguísimo que no cabe en una sola línea del cuadro de edición de la tarea ' +
      'y que debe seguir creciendo porque no hay tope de líneas, ni en el móvil ni en el ordenador'
  );
  await page.waitForTimeout(300);
  const h1 = await title.evaluate((el) => el.offsetHeight);
  expect(h1).toBeGreaterThan(h0 + 10);
  expect(app.errors).toEqual([]);
});

test('4.37: Ajustes reagrupados (toques en Documentos, avisos en GTD)', async ({ app }) => {
  const { page } = app;
  await app.open(BASE, '/settings');
  await page.locator('[data-testid=eli-settings-docs] > summary').click();
  await expect(page.locator('[data-testid=eli-setting-tap-header]')).toBeVisible({
    timeout: 20000,
  });
  await page.locator('[data-testid=eli-settings-gtd] > summary').click();
  await expect(page.locator('[data-testid=eli-setting-reminders]')).toBeVisible();
  await page.locator('[data-testid=eli-settings-appearance] > summary').click();
  await expect(page.locator('[data-testid=eli-setting-gap-headers]')).toBeVisible();
  // cada ajuste, una sola vez
  for (const id of ['eli-setting-gap-headers', 'eli-setting-tap-header', 'eli-setting-reminders'])
    await expect(page.locator(`[data-testid=${id}]`)).toHaveCount(1);
  expect(app.errors).toEqual([]);
});

test('4.37: una instalación nueva arranca con los valores por defecto del usuario', async ({
  app,
}) => {
  const { page } = app;
  await app.open(BASE, '/settings', { fresh: true });
  await expect(page.locator('[data-testid=eli-setting-notes-mode]')).toBeVisible({
    timeout: 20000,
  });
  await expect(page.locator('html')).toHaveAttribute('data-eli-theme', 'Nirvana');
  await expect(page.locator('html')).toHaveAttribute('data-eli-scheme', 'Light');
  await page.locator('[data-testid=eli-settings-appearance] > summary').click();
  await expect(page.locator('[data-testid=eli-bullet-style]')).toHaveValue('Triangles');
  expect(await page.evaluate(() => localStorage.getItem('eliSlashMenu'))).toBe('true');
  expect(app.errors).toEqual([]);
});
