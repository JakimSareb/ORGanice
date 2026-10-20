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

  // (3.44) el sitio de «＋ Subtarea» se comprueba en gtd_344.spec.js
  // También en «Todos los proyectos»
  await gtd.openList(app, 'Todos los proyectos');
  const ovRow = page.locator('[data-testid=gtd-overview-row]:has-text("Casa")');
  await expect(ovRow).toBeVisible();
  await ovRow.locator('[data-testid=gtd-notes-toggle]').click();
  await expect(page.locator('[data-testid=gtd-overview-notes]')).toContainText(
    'Llamar al fontanero'
  );
  expect(app.errors).toEqual([]);
});
