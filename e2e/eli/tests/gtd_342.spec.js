// GTD (3.42): «Procesar Inbox» — botón «Editar» (editor normal) y se sigue en el mismo paso
const { test, expect, gtd } = require('../harness');

const opt = (app, text) => app.page.locator(`[data-testid=gtd-proc-opt]:has-text("${text}")`);

test('GTD (3.42): editar la tarea mientras se procesa el Inbox', async ({ app }) => {
  const { page } = app;
  await app.open({
    '/tasks.org': '* PROJECT Casa\n** NEXT Pintar\n',
    '/inbox.org': '* lo del grifo\n* Otra cosa\n',
  });
  await gtd.ready(app);
  await gtd.side(app, 'gtd-process-start');
  await expect(page.locator('[data-testid=gtd-process-title]')).toContainText('lo del grifo');

  // Primera pregunta respondida: «Sí, requiere acción»
  await page.keyboard.press('1');
  const question = page.locator('[data-testid=gtd-process-question]');
  const before = await question.textContent();

  // Editar: título, notas y proyecto
  await page.click('[data-testid=gtd-process-edit]');
  const title = page.locator('[data-testid=gtd-editor-title]');
  await expect(title).toBeVisible();
  await page.waitForTimeout(600);
  await title.fill('Arreglar el grifo de la cocina');
  if (!(await page.locator('textarea[data-testid=gtd-editor-notes]').count())) {
    const prev = page.locator('[data-testid=gtd-editor-notes-preview]');
    if (await prev.count()) await prev.click();
    else await page.locator('[data-testid=gtd-editor-notes]').click();
  }
  await page.locator('textarea[data-testid=gtd-editor-notes]').fill('Comprar la junta');
  await page.selectOption('[data-testid=gtd-editor-project]', { label: 'Casa' });
  await page.click('[data-testid=gtd-editor-save]');
  await expect(page.locator('.gtd-editor')).toHaveCount(0);

  // Sigue la misma tarea (ya con el título nuevo) y en el mismo paso
  await expect(page.locator('[data-testid=gtd-process-title]')).toContainText(
    'Arreglar el grifo de la cocina'
  );
  await expect(question).toHaveText(before);
  await expect(page.locator('[data-testid=gtd-process-count]')).toContainText('1 de 2');

  // Se termina de procesar: Next. (4.60, Allen) la siguiente acción ya trae el título nuevo →
  // ¿<2 min? No → aplazar → ¿proyecto? No (ya está en Casa) → ¿cuándo? Sin fecha: a Next
  await expect(page.locator('[data-testid=gtd-proc-next-title]')).toHaveValue(
    'Arreglar el grifo de la cocina'
  );
  await opt(app, 'Continuar').click();
  for (const k of ['2', '2', '1']) await page.keyboard.press(k);
  await opt(app, 'Sin fecha: a Next').click();
  await expect(page.locator('[data-testid=gtd-process-count]')).toContainText('2 de 2');
  await expect(page.locator('[data-testid=gtd-process-title]')).toContainText('Otra cosa');

  await page.waitForTimeout(3000);
  const tasks = await app.fileAfterSync('/tasks.org');
  expect(tasks).toMatch(/\* PROJECT Casa[\s\S]*\*\* NEXT Arreglar el grifo de la cocina/);
  expect(tasks).toContain('Comprar la junta');
  expect(app.errors).toEqual([]);
});
