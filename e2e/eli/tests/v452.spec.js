// 4.52: Procesar Inbox — Someday y Referencia con destino; selector de destino navegable
const { test, expect, gtd } = require('../harness');

const TASKS =
  '#+TODO: TODO NEXT WAITING MAYBE PROJECT | DONE CANCELLED\n* PROJECT Reforma\n** NEXT Pedir presupuesto\n';
const NOTAS = '* Cocina\n** Armarios\n*** Pomos\n* Baño\n';
const opt = (app, text) =>
  app.page.locator('[data-testid=gtd-proc-opt]', { hasText: text }).first();
const question = (app) => app.page.locator('[data-testid=gtd-process-question]');

const startToNoAction = async (app) => {
  await gtd.ready(app);
  await gtd.side(app, 'gtd-process-start');
  await expect(app.page.locator('[data-testid=gtd-process]')).toHaveCount(1);
  await opt(app, 'No').click(); // ¿requiere acción? No
  await expect(question(app)).toHaveText('¿Qué hago con ella?');
};

test('4.52: Someday → pertenece a un proyecto → queda dentro con estado Someday', async ({
  app,
}) => {
  await app.open({ '/tasks.org': TASKS, '/inbox.org': '* Cambiar los pomos\n' });
  await startToNoAction(app);
  await opt(app, 'Someday').click();
  await expect(question(app)).toHaveText('¿Pertenece a algún proyecto?');
  await opt(app, 'uno que ya existe').click();
  await app.page.selectOption('[data-testid=gtd-proc-project-pick]', { label: 'Reforma' });
  await opt(app, 'Continuar').click();
  await expect
    .poll(() => app.fileAfterSync('/tasks.org', 500), { timeout: 15000 })
    .toMatch(/\* PROJECT Reforma[\s\S]*\*\* MAYBE Cambiar los pomos/);
  expect(app.errors).toEqual([]);
});

test('4.52: Referencia → Enviar a una cabecera → entra en otro fichero, baja dos niveles y elige', async ({
  app,
}) => {
  const { page } = app;
  await app.open({
    '/tasks.org': TASKS,
    '/inbox.org': '* Medidas de los pomos\n:PROPERTIES:\n:ID: ref-1\n:END:\n',
    '/zk/notas.org': NOTAS,
  });
  await startToNoAction(app);
  await opt(app, 'Referencia').click();
  await expect(question(app)).toHaveText('¿Dónde guardo esta referencia?');
  await opt(app, 'Enviar a una cabecera').click();
  // lista de ficheros (no solo tasks.org) → entrar en notas.org
  await expect(page.locator('[data-testid=eli-refile-file]', { hasText: 'tasks.org' })).toHaveCount(
    1
  );
  await page.locator('[data-testid=eli-refile-file]', { hasText: 'notas.org' }).first().click();
  await page.locator('[data-testid=eli-refile-enter]').first().click(); // Cocina ›
  await page.locator('[data-testid=eli-refile-enter]').first().click(); // Armarios ›
  await expect(page.locator('[data-testid=eli-refile-crumb]')).toHaveCount(4);
  await page.locator('[data-testid=eli-refile-entry]', { hasText: 'Pomos' }).first().click();
  await expect
    .poll(() => app.fileAfterSync('/zk/notas.org', 500), { timeout: 15000 })
    .toMatch(/\*\* Armarios\n\*\*\* Pomos\n\*\*\*\* Medidas de los pomos[\s\S]*:ID: ref-1/);
  expect(app.errors).toEqual([]);
});

test('4.52: Referencia → Abrir y terminar de editar → Volver sigue en la misma pregunta', async ({
  app,
}) => {
  const { page } = app;
  await app.open({
    '/tasks.org': TASKS,
    '/inbox.org': '* Medidas de los pomos\n* Otra cosa\n',
  });
  await startToNoAction(app);
  await opt(app, 'Referencia').click();
  await opt(app, 'Abrir y terminar de editar').click();
  await expect(page.locator('[data-testid=gtd-proc-return]')).toBeVisible();
  await page.locator('[data-testid=gtd-proc-return-btn]').click();
  await expect(page.locator('[data-testid=gtd-process]')).toHaveCount(1);
  await expect(question(app)).toHaveText('¿Dónde guardo esta referencia?');
  await expect(page.locator('[data-testid=gtd-process-title]')).toContainText(
    'Medidas de los pomos'
  );
  expect(app.errors).toEqual([]);
});
