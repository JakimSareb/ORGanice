// 4.57: Agendas y Personas — filtrar por texto, editar/borrar puntos, título que abre el fichero,
// sin «convertir en contacto», «＋ Nueva subcabecera aquí» al llevar a reunión.
// (El arrastre de secciones de Ajustes está en v455.spec.js: ratón y dedo.)
const { test, expect, gtd } = require('../harness');

const PERSONAS =
  '* Mari Carmen\n:PROPERTIES:\n:ID: MC-1\n:END:\n* Luis\n:PROPERTIES:\n:ID: LU-2\n:END:\n';
const AGENDAS = `* Mari Carmen
** Punto uno
Notas del uno.
** Punto dos
* Quan siguem a ...
** Barcelona
- [ ] Xus
`;
const REUNIONES = '* Reunión lunes\n** Orden del día\n';
const FILES = {
  '/tasks.org': '',
  '/inbox.org': '',
  '/personas.org': PERSONAS,
  '/agendas.org': AGENDAS,
  '/reuniones.org': REUNIONES,
};

const filterFor = async (app, text) => {
  const { page } = app;
  const box = page.locator('[data-testid=gtd-sec-filter]');
  if (!(await box.count())) await app.press(page.locator('[data-testid=gtd-sec-filter-btn]'));
  await box.fill(text);
};

test('4.57: Agendas — filtro por texto, sin «convertir en contacto», editar y borrar un punto', async ({
  app,
}) => {
  const { page } = app;
  await app.open(FILES);
  await gtd.ready(app);
  await gtd.side(app, 'gtd-list-agendas');
  await expect(page.locator('[data-testid=gtd-agenda-row]')).toHaveCount(2);

  // filtro: «barcelona» solo coincide dentro de «Quan siguem a ...» (sale abierta)
  await filterFor(app, 'barcelona');
  await expect(page.locator('[data-testid=gtd-agenda-row]')).toHaveCount(1);
  await expect(page.locator('[data-testid=gtd-agenda-point-title]')).toHaveCount(1);
  // «- [ ] Xus» ya no lleva el botón de convertir en contacto
  await expect(page.locator('[data-testid=gtd-agenda-to-contact]')).toHaveCount(0);
  await filterFor(app, 'zzz');
  await expect(page.locator('[data-testid=gtd-agendas-nomatch]')).toHaveCount(1);
  await filterFor(app, '');
  await expect(page.locator('[data-testid=gtd-agenda-row]')).toHaveCount(2);

  // editar el título y las notas de «Punto uno»
  await app.press(page.locator('[data-testid=gtd-agenda-toggle]').first());
  const one = page.locator('[data-testid=gtd-agenda-point]', { hasText: 'Punto uno' }).first();
  await app.press(one.locator('[data-testid=gtd-agenda-point-edit]').first());
  await page.locator('[data-testid=gtd-agenda-edit-title]').fill('Punto uno revisado');
  await page.locator('[data-testid=gtd-agenda-edit-notes]').fill('Notas nuevas.');
  await app.press(page.locator('[data-testid=gtd-agenda-edit-save]'));
  await expect
    .poll(() => app.fileAfterSync('/agendas.org', 500), { timeout: 15000 })
    .toContain('** Punto uno revisado\nNotas nuevas.\n** Punto dos\n');

  // borrar «Punto dos» (pide confirmar)
  const two = page.locator('[data-testid=gtd-agenda-point]', { hasText: 'Punto dos' }).first();
  await app.press(two.locator('[data-testid=gtd-agenda-point-edit]').first());
  await app.press(page.locator('[data-testid=gtd-agenda-edit-delete]'));
  await app.press(page.locator('.eli-prompt__ok'));
  await expect
    .poll(() => app.fileAfterSync('/agendas.org', 500), { timeout: 15000 })
    .not.toContain('Punto dos');
  expect(app.errors).toEqual([]);
});

test('4.57: Agendas — notas de la agenda principal', async ({ app }) => {
  const { page } = app;
  await app.open(FILES);
  await gtd.ready(app);
  await gtd.side(app, 'gtd-list-agendas');
  await app.press(page.locator('[data-testid=gtd-agenda-toggle]').first());
  await app.press(page.locator('[data-testid=gtd-agenda-edit-root]'));
  await page.locator('[data-testid=gtd-agenda-edit-notes]').fill('- [ ] Primera casilla');
  await app.press(page.locator('[data-testid=gtd-agenda-edit-save]'));
  await expect
    .poll(() => app.fileAfterSync('/agendas.org', 500), { timeout: 15000 })
    .toContain('* Mari Carmen\n- [ ] Primera casilla\n** Punto uno\n');
  expect(app.errors).toEqual([]);
});

test('4.57: Agendas y Personas — el título abre el fichero y Personas se filtra', async ({
  app,
}) => {
  const { page } = app;
  await app.open(FILES);
  await gtd.ready(app);
  await gtd.side(app, 'gtd-list-persons');
  await expect(page.locator('[data-testid=gtd-person-row]')).toHaveCount(2);
  await filterFor(app, 'luis');
  await expect(page.locator('[data-testid=gtd-person-row]')).toHaveCount(1);
  await filterFor(app, '');
  await app.press(page.locator('[data-testid=gtd-title-open-file]'));
  await expect(page).toHaveURL(/\/file\/personas\.org/);
  expect(app.errors).toEqual([]);
});

test('4.57: Llevar a reunión… permite crear una subcabecera nueva', async ({ app }) => {
  const { page } = app;
  await app.open(FILES);
  await gtd.ready(app);
  await gtd.side(app, 'gtd-list-agendas');
  await app.press(page.locator('[data-testid=gtd-agenda-toggle]').first());
  const one = page.locator('[data-testid=gtd-agenda-point]', { hasText: 'Punto uno' }).first();
  await app.press(one.locator('[data-testid=gtd-agenda-point-meeting]').first());
  // entra en «Reunión lunes» con «›» y crea «Ruegos» dentro
  await page.locator('[data-testid=eli-refile-enter]').first().click();
  await page.locator('[data-testid=eli-refile-new]').click();
  await page.locator('[data-testid=eli-refile-search]').fill('Ruegos');
  await page.locator('[data-testid=eli-refile-create]').click();
  await expect
    .poll(() => app.fileAfterSync('/reuniones.org', 500), { timeout: 15000 })
    .toMatch(/\* Reunión lunes\n\*\* Orden del día\n\*\* Ruegos\n\*\*\* Punto uno\n/);
  await expect
    .poll(() => app.fileAfterSync('/agendas.org', 500), { timeout: 15000 })
    .not.toContain('Punto uno');
  expect(app.errors).toEqual([]);
});

// Arrastre con el ratón hasta un punto (como gtd_345)
const mouseDrag = async (page, locator, to) => {
  const b = await locator.boundingBox();
  await page.mouse.move(b.x + 40, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + 40, b.y + b.height / 2 + 14, { steps: 3 });
  await page.waitForTimeout(300);
  const t = await to();
  await page.mouse.move(t.x, t.y, { steps: 15 });
  await page.waitForTimeout(300);
  await page.mouse.up();
};

// (4.57, comprobación pedida de la 4.55) arrastrar una tarea a «Referencias» del proyecto la pasa a
// Referencia con un navegador real (la lógica ya está en jest)
test('4.57: en un proyecto, soltar en «Referencias» pasa la tarea a Referencia', async ({
  app,
  isMobile,
}) => {
  test.skip(isMobile, 'con el ratón');
  await app.open(
    { '/tasks.org': '* PROJECT Casa\n** NEXT Pintar\n** NEXT Barrer\n', '/inbox.org': '' },
    undefined,
    { localStorage: { eliGtdGroup: JSON.stringify('none') } }
  );
  await gtd.ready(app);
  const { page } = app;
  await app.press(page.locator('[data-testid=gtd-project]', { hasText: 'Casa' }).first());
  await page.waitForTimeout(800);
  const row = page.locator('[data-testid=gtd-task-title]:has-text("Pintar")').first();
  await mouseDrag(page, row, async () => {
    const h = await page.locator('[data-testid=gtd-psec-refs]').boundingBox();
    return { x: h.x + h.width / 2, y: h.y + h.height * 0.8 };
  });
  await page.waitForTimeout(3000);
  const text = await app.fileAfterSync('/tasks.org');
  expect(text).toMatch(/\*\* Pintar\n/);
  expect(text).toContain('** NEXT Barrer');
  expect(app.errors).toEqual([]);
});
