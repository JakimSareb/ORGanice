// Humo Fountain: abrir un guion, ver la escena, escribir y exportar
const { test, expect } = require('../harness');

const SCRIPT = `Title: Prueba
Author: Eli

INT. COCINA - NOCHE

Ana entra y enciende la luz.

ANA
¿Hay alguien?
`;

test('Fountain: abre el guion y exporta a PDF, Fountain y FDX', async ({ app }) => {
  await app.open(
    { '/guion.fountain': SCRIPT, '/tasks.org': '', '/inbox.org': '' },
    '/fountain/guion.fountain'
  );
  await app.page.waitForSelector('[data-testid=eli-ftn-mode-text]', { timeout: 20000 });
  await expect(app.page.locator('.eli-ftn__view').first()).toContainText('COCINA');
  for (const kind of ['pdf', 'fountain', 'fdx']) {
    await app.press(app.page.locator('[data-testid=eli-ftn-export]'));
    const [download] = await Promise.all([
      app.page.waitForEvent('download', { timeout: 10000 }),
      app.press(app.page.locator(`[data-testid=eli-ftn-export-${kind}]`)),
    ]);
    expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${kind}$`));
  }
  expect(app.errors).toEqual([]);
});

test('Fountain: lo escrito en «Texto» se guarda solo', async ({ app }) => {
  await app.open(
    { '/guion.fountain': SCRIPT, '/tasks.org': '', '/inbox.org': '' },
    '/fountain/guion.fountain'
  );
  await app.page.waitForSelector('[data-testid=eli-ftn-mode-text]', { timeout: 20000 });
  await app.press(app.page.locator('[data-testid=eli-ftn-mode-text]'));
  const area = app.page.locator('textarea').first();
  await area.click();
  await app.page.keyboard.press('Control+End');
  await app.page.keyboard.type('\n\nEXT. JARDÍN - DÍA\n');
  expect(await app.fileAfterSync('/guion.fountain', 3500)).toMatch(/EXT\. JARDÍN - DÍA/);
});
