// 4.33: al abrir la app desde el icono (página inicial) sale el Diario de hoy, tipo Logseq
const { test, expect } = require('../harness');

const BASE = { '/tasks.org': '* NEXT Algo\n', '/inbox.org': '' };

test('4.33: la app abre en el Diario de hoy', async ({ app }) => {
  const { page } = app;
  const y = new Date().getFullYear();
  await app.open({ ...BASE }, '/');
  await expect(page.locator('[data-testid=eli-diary]')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('[data-testid=eli-diary-date]')).toBeVisible();
  // las preguntas de la plantilla, ya puestas para rellenar en línea
  await expect(page.locator('[data-testid=eli-diary-answer]').first()).toBeVisible();
  await expect
    .poll(async () => (await app.fileAfterSync(`/pages/diari-${y}.org`, 500)) || '', {
      timeout: 15000,
    })
    .toContain('- Lo más importante de hoy ::');
  await app.press(page.locator('[data-testid=eli-diary-close]'));
  await expect(page.locator('[data-testid=eli-diary]')).toHaveCount(0);
  expect(app.errors).toEqual([]);
});
