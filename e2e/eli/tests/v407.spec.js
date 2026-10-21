// 4.07: Horizontes GTD (fichero horizons.org): sección «Horizontes» (apagada por defecto),
// objetivo del proyecto (:OBJETIVO:) y «Revisión de horizontes» (Menú ☰ › Procesos › Periódicos).
const { test, expect, gtd } = require('../harness');

const TASKS = [
  '* PROJECT Correr una media maratón',
  ':PROPERTIES:',
  ':AREA: Salud',
  ':OBJETIVO: [[id:OBJ-1][Media maratón]]',
  ':END:',
  '** NEXT Comprar zapatillas',
  '* PROJECT Ordenar el trastero',
  ':PROPERTIES:',
  ':AREA: Casa',
  ':END:',
  '** NEXT Tirar cajas',
  '* NEXT Llamar al banco',
  ':PROPERTIES:',
  ':AREA: Dinero',
  ':END:',
  '',
].join('\n');
const HORIZONS = [
  '* Propósito y principios',
  'Vivir tranquilo.',
  '* Visión (3–5 años)',
  'Una casa ordenada.',
  '* Objetivos (1–2 años)',
  '** Media maratón',
  ':PROPERTIES:',
  ':ID: OBJ-1',
  ':AREA: Salud',
  ':END:',
  '** Aprender alemán',
  ':PROPERTIES:',
  ':ID: OBJ-2',
  ':END:',
  '* Áreas de responsabilidad',
  '** Casa',
  '** Salud',
  '** Trabajo',
  '',
].join('\n');
const FILES = { '/tasks.org': TASKS, '/inbox.org': '', '/horizons.org': HORIZONS };
const SECTION_ON = {
  localStorage: { eliGtdSections: JSON.stringify({ sections: { horizons: { show: true } } }) },
};

const openProc = async (app, testId) => {
  const { page } = app;
  await page.locator('[data-testid=eli-more-top]').click();
  await page.locator('[data-testid=eli-menu-processes]').click();
  await page.locator(`[data-testid=${testId}]`).click();
  await expect(page.locator('[data-testid=gtd-guided]')).toBeVisible({ timeout: 20000 });
};
const fileHas = (app, path, re) =>
  expect
    .poll(async () => (await app.fileAfterSync(path, 500)) || '', { timeout: 15000 })
    .toMatch(re);
const item = (app, kind, text) =>
  app.page.locator(`[data-testid=gtd-hz-${kind}]`, { hasText: text });

test('4.07: la sección Horizontes está apagada por defecto', async ({ app }) => {
  const { page } = app;
  await app.open(FILES);
  await gtd.ready(app);
  await expect(page.locator('[data-testid=gtd-list-horizons]')).toHaveCount(0);
  await page.locator('[data-testid=eli-more-top]').click();
  await page.locator('[data-testid=eli-menu-processes]').click();
  await expect(page.locator('[data-testid=eli-proc-horizons]')).toBeVisible();
  expect(app.errors).toEqual([]);
});

test('4.07: página Horizontes (objetivos y áreas con sus proyectos)', async ({ app }) => {
  const { page } = app;
  await app.open(FILES, '/gtd', SECTION_ON);
  await gtd.ready(app);
  await gtd.side(app, 'gtd-list-horizons');
  await expect(page.locator('[data-testid=gtd-horizons]')).toBeVisible({ timeout: 15000 });
  await expect(item(app, 'goal', 'Media maratón')).toContainText('Correr una media maratón');
  await expect(
    item(app, 'goal', 'Media maratón').locator('[data-testid=gtd-hz-empty]')
  ).toHaveCount(0);
  await expect(
    item(app, 'goal', 'Aprender alemán').locator('[data-testid=gtd-hz-empty]')
  ).toBeVisible();
  await expect(item(app, 'area', 'Casa')).toContainText('Ordenar el trastero');
  await expect(item(app, 'area', 'Trabajo').locator('[data-testid=gtd-hz-empty]')).toBeVisible();
  // un proyecto abre su vista
  await app.press(page.locator('[data-testid=gtd-hz-row]', { hasText: 'Ordenar el trastero' }));
  await expect(page.locator('[data-testid=gtd-title]')).toContainText('Ordenar el trastero');
  expect(app.errors).toEqual([]);
});

test('4.07: objetivo del proyecto desde su editor', async ({ app }) => {
  test.skip(app.mobile, 'con el ratón');
  const { page } = app;
  await app.open(FILES, '/gtd', SECTION_ON);
  await gtd.ready(app);
  await app.press(
    page.locator('[data-testid=gtd-project]', { hasText: 'Ordenar el trastero' }).first()
  );
  await page.locator('[data-testid=gtd-edit-project]').click();
  await page.waitForTimeout(600);
  await page.locator('[data-testid=gtd-editor-objective]').click();
  await page.locator('[data-testid=eli-pick-item]', { hasText: 'Aprender alemán' }).click();
  await fileHas(app, '/tasks.org', /:OBJETIVO: +\[\[id:OBJ-2\]\[Aprender alemán\]\]/);
  expect(app.errors).toEqual([]);
});

test('4.07: Revisión de horizontes (áreas, objetivos, visión)', async ({ app }) => {
  const { page } = app;
  await app.open(FILES);
  await gtd.ready(app);
  await openProc(app, 'eli-proc-horizons');
  const title = page.locator('[data-testid=gtd-guided-title]');
  await expect(title).toContainText('Áreas');
  await expect(item(app, 'area', 'Trabajo').locator('[data-testid=gtd-hz-empty]')).toBeVisible();
  // «Dinero» se usa en una tarea y no está en el fichero
  await page.locator('[data-testid=gtd-hz-add-missing]', { hasText: 'Dinero' }).click();
  await fileHas(app, '/horizons.org', /\* Áreas de responsabilidad[\s\S]*\*\* Dinero/);
  await expect(page.locator('[data-testid=gtd-hz-add-missing]')).toHaveCount(0);
  await page.locator('[data-testid=gtd-guided-next]').click();
  await expect(title).toContainText('Objetivos');
  await expect(item(app, 'goal', 'Media maratón')).toContainText('Correr una media maratón');
  await page.locator('[data-testid=gtd-hz-goal-input]').fill('Leer 20 libros');
  await page.locator('[data-testid=gtd-hz-goal-add]').click();
  await fileHas(app, '/horizons.org', /\*\* Leer 20 libros\s*\n\s*:PROPERTIES:\s*\n\s*:ID:/);
  await page.locator('[data-testid=gtd-guided-next]').click();
  await expect(title).toContainText('Visión');
  const vision = page.locator('[data-testid=gtd-hz-text-vision]');
  await expect(vision).toHaveValue(/Una casa ordenada/);
  await vision.fill('Una casa ordenada y un jardín.');
  await page.locator('[data-testid=gtd-hz-save-vision]').click();
  await fileHas(app, '/horizons.org', /Una casa ordenada y un jardín\./);
  await page.locator('[data-testid=gtd-guided-next]').click();
  await expect(title).toContainText('Propósito');
  await page.locator('[data-testid=gtd-guided-next]').click();
  await page.locator('[data-testid=gtd-guided-finish]').click();
  await expect(page.locator('[data-testid=gtd-guided]')).toHaveCount(0);
  expect(app.errors).toEqual([]);
});

test('4.07: planificar un proyecto para un objetivo y volver a la revisión', async ({ app }) => {
  const { page } = app;
  await app.open(FILES);
  await gtd.ready(app);
  await openProc(app, 'eli-proc-horizons');
  await page.locator('[data-testid=gtd-guided-next]').click();
  await item(app, 'goal', 'Aprender alemán').locator('[data-testid=gtd-hz-plan-goal]').click();
  await expect(page.locator('[data-testid=gtd-plan-for]')).toContainText('Aprender alemán');
  await page.locator('[data-testid=gtd-plan-name]').fill('Curso de alemán');
  for (let i = 0; i < 4; i++) await page.locator('[data-testid=gtd-guided-next]').click();
  await page.locator('[data-testid=gtd-plan-first]').fill('Buscar academias');
  await page.locator('[data-testid=gtd-plan-create]').click();
  // de vuelta en la revisión, en Objetivos
  await expect(page.locator('[data-testid=gtd-guided-title]')).toContainText('Objetivos');
  await fileHas(
    app,
    '/tasks.org',
    /\* PROJECT Curso de alemán[\s\S]*:OBJETIVO: +\[\[id:OBJ-2\]\[Aprender alemán\]\][\s\S]*\*\* NEXT Buscar academias/
  );
  await expect(
    item(app, 'goal', 'Aprender alemán').locator('[data-testid=gtd-hz-empty]')
  ).toHaveCount(0);
  expect(app.errors).toEqual([]);
});
