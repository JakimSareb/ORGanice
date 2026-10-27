// 4.42: «Citar»: desde ⋯ se inserta la línea #+transclude: en las notas; se ve como bloque de solo
// lectura con el contenido del origen y el fichero solo guarda esa línea. El resto (opciones,
// :level, ciclos, enlaces rotos) va en jest (eli442).
const { test, expect } = require('../harness');

const BASE = { '/tasks.org': '', '/inbox.org': '' };
const DOC = '* Receta\n:PROPERTIES:\n:ID: REC-1\n:END:\nMezclar todo.\n* Menú\n';

test('4.42: Citar… inserta la línea, se ve el contenido citado y el fichero solo tiene la línea', async ({
  app,
}) => {
  const { page } = app;
  await app.open({ ...BASE, '/notas.org': DOC }, '/file/notas.org');
  const t = page.locator('text=Menú').first();
  await expect(t).toBeVisible({ timeout: 20000 });
  await app.press(t);
  await page.waitForTimeout(500);
  await page.locator('[data-testid=eli-docbar-more]').click();
  await page.locator('[data-testid=eli-docbar-quote-insert]').click();
  await expect(page.locator('[data-testid=eli-ask-pick]')).toBeVisible({ timeout: 5000 });
  await page.locator('[data-testid=eli-pick-search]').fill('Receta');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-testid=eli-ask-pick]')).toHaveCount(0);
  const area = page.locator('[data-testid=description-textarea]');
  await expect(area).toHaveValue(/#\+transclude: \[\[id:REC-1\]\[Receta\]\]/, { timeout: 5000 });
  await area.press('Escape');
  const block = page.locator('[data-testid=eli-transclusion]');
  await expect(block).toBeVisible({ timeout: 10000 });
  await expect(block).toContainText('Mezclar todo.');
  await expect(block.locator('[data-testid=eli-transclusion-title]')).toContainText('Receta');
  await expect
    .poll(async () => (await app.fileAfterSync('/notas.org', 500)) || '', { timeout: 15000 })
    .toContain('#+transclude: [[id:REC-1][Receta]]');
  const text = (await app.fileAfterSync('/notas.org', 500)) || '';
  // el contenido citado NO se copia: «Mezclar todo.» sigue una sola vez en el fichero
  expect((text.match(/Mezclar todo\./g) || []).length).toBe(1);
  expect(app.errors).toEqual([]);
});
