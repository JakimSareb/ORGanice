// 4.10: viñeta «Org» sin pisar el título; tipo de letra de la app; Área en las filas de GTD
const { test, expect, gtd } = require('../harness');

const BASE = { '/tasks.org': '', '/inbox.org': '' };

test('4.10: viñeta Org plegada (◉ + ▸) no pisa el texto de la cabecera', async ({ app }) => {
  const { page } = app;
  await app.open({ ...BASE, '/notas.org': '* Metges\n** Hija\n* Sola\n' }, '/file/notas.org', {
    localStorage: { bulletStyle: 'Org' },
  });
  await expect(page.locator('.header', { hasText: 'Metges' }).first()).toBeVisible({
    timeout: 20000,
  });
  const header = page.locator('.header', { hasText: 'Metges' }).first();
  const bullet = header.locator('[data-testid=header-bullet]');
  await expect(bullet).toContainText('◉');
  await expect(bullet).toContainText('▸');
  const box = await bullet.boundingBox();
  const text = await header.locator('.title-line-text').first().boundingBox();
  // el contenido de la viñeta (con su ▸) acaba antes de que empiece el texto
  const contentW = await bullet.evaluate((el) => el.scrollWidth);
  expect(box.x + contentW).toBeLessThanOrEqual(text.x + 1);
  expect(app.errors).toEqual([]);
});

test('4.10: Ajustes › Apariencia › Tipo de letra se aplica a toda la app y se recuerda', async ({
  app,
}) => {
  const { page } = app;
  await app.open(BASE, '/settings');
  await page.locator('[data-testid=eli-settings-appearance] > summary').click();
  const setting = page.locator('[data-testid=eli-setting-font]');
  await expect(setting).toBeVisible({ timeout: 20000 });
  await expect(page.locator('html')).not.toHaveAttribute('data-eli-font', /.+/);
  await setting.getByText('Serif', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-eli-font', 'serif');
  const family = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(family).toMatch(/Georgia|serif/);
  await setting.getByText('Monoespaciada', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-eli-font', 'mono');
  await setting.getByText('Redondeada', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-eli-font', 'rounded');
  expect(await page.evaluate(() => localStorage.getItem('eliFont'))).toBe('rounded');
  await setting.getByText('Normal', { exact: true }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-eli-font', /.+/);
  expect(app.errors).toEqual([]);
});

test('4.10: GTD, el Área sale en las filas y se puede ocultar', async ({ app }) => {
  const { page } = app;
  const files = {
    '/tasks.org': '* NEXT Pintar\n:PROPERTIES:\n:AREA: Casa\n:END:\n',
    '/inbox.org': '',
  };
  await app.open(files);
  await gtd.ready(app);
  await gtd.openList(app, 'Next');
  await expect(page.locator('.gtd-task .gtd-meta--area', { hasText: 'Casa' })).toHaveCount(1);
  // apagado desde el ⋯ › Opciones de vista (se recuerda)
  await app.press(page.locator('[data-testid=gtd-view-menu-button]'));
  await app.press(page.locator('[data-testid=gtd-view-options]'));
  await app.press(page.locator('[data-testid=gtd-opt-area]'));
  await page.waitForTimeout(400);
  await expect(page.locator('.gtd-task .gtd-meta--area')).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('eliGtdDetails')));
  expect(saved.area).toBe(false);
  // el fichero no cambia
  expect(await app.fileAfterSync('/tasks.org')).toBe(files['/tasks.org']);
  expect(app.errors).toEqual([]);
});

test('4.10: GTD, con el Área oculta de antes, no sale en las filas', async ({ app }) => {
  const { page } = app;
  await app.open(
    { '/tasks.org': '* NEXT Pintar\n:PROPERTIES:\n:AREA: Casa\n:END:\n', '/inbox.org': '' },
    undefined,
    { localStorage: { eliGtdDetails: JSON.stringify({ area: false }) } }
  );
  await gtd.ready(app);
  await gtd.openList(app, 'Next');
  await expect(page.locator('[data-testid=gtd-task-title]', { hasText: 'Pintar' })).toBeVisible();
  await expect(page.locator('.gtd-task .gtd-meta--area')).toHaveCount(0);
  expect(app.errors).toEqual([]);
});
