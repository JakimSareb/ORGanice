// GTD (3.43): «＋ Subtarea» al final de los botones, icono de notas más grande y notas en las
// filas de proyecto
const { test, expect, gtd } = require('../harness');

test('GTD (3.43): botón Subtarea, icono de notas y notas de proyecto', async ({ app }) => {
  const { page } = app;
  await app.open({
    '/tasks.org':
      '* PROJECT [#A] Casa\nLlamar al fontanero\n** NEXT [#A] Pintar\nNotas de pintar\n',
    '/inbox.org': '',
  });
  await gtd.ready(app);

  // La fila del proyecto (con ★, en Focus) tiene icono de notas y las despliega
  const projRow = page.locator('.gtd-task.is-project-row:has-text("Casa")');
  await expect(projRow).toBeVisible();
  const toggle = projRow.locator('[data-testid=gtd-notes-toggle]');
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(projRow.locator('[data-testid=gtd-task-below]')).toContainText(
    'Llamar al fontanero'
  );

  // Icono un poco más grande
  const size = await toggle.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThanOrEqual(14);

  // «＋ Subtarea» es el último de la línea de botones (tras «Papelera»)
  const t = page.locator('[data-testid=gtd-task-title]:has-text("Pintar")');
  if (app.mobile) await app.press(t);
  else await t.dblclick();
  await expect(page.locator('.gtd-editor')).toHaveCount(1);
  await page.waitForTimeout(600);
  const order = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.gtd-editor__actions [data-testid]')).map((e) =>
      e.getAttribute('data-testid')
    )
  );
  const sub = order.indexOf('gtd-editor-add-subtask');
  expect(sub).toBeGreaterThan(order.indexOf('gtd-editor-trash'));
  expect(sub).toBeLessThan(order.indexOf('gtd-editor-cancel'));
  await page.click('[data-testid=gtd-editor-cancel]');
  await expect(page.locator('.gtd-editor')).toHaveCount(0);
  expect(app.errors).toEqual([]);
});
