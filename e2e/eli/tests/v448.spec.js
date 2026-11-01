// 4.48: Personas (contactos en personas.org enlazados con :PERSONA:) y Agendas (agendas.org)
const { test, expect, gtd } = require('../harness');

test('4.48 A: editor → Persona → contacto nuevo en personas.org y :PERSONA: en la tarea', async ({
  app,
}) => {
  const { page } = app;
  await app.open({ '/tasks.org': '* NEXT Pintar\n', '/inbox.org': '' });
  await gtd.ready(app);
  await gtd.openList(app, 'Next');
  const t = page.locator('[data-testid=gtd-task-title]:has-text("Pintar")');
  if (app.mobile) await app.press(t);
  else await t.dblclick();
  await expect(page.locator('.gtd-editor')).toHaveCount(1);
  await page.waitForTimeout(600);
  await app.press(page.locator('.gtd-editor [data-testid=gtd-editor-person-add]'));
  await page.locator('[data-testid=eli-pick-search]').fill('Ana');
  await app.press(page.locator('[data-testid=eli-pick-new]'));
  // personas.org no existe: se pregunta si crearlo
  await app.press(page.locator('.eli-prompt__ok'));
  await expect(page.locator('.gtd-editor [data-testid=gtd-editor-person]')).toContainText('Ana', {
    timeout: 10000,
  });
  await page.click('[data-testid=gtd-editor-save]');
  await expect
    .poll(() => app.fileAfterSync('/tasks.org', 500), { timeout: 15000 })
    .toMatch(/:PERSONA: \[\[id:[^\]]+\]\[Ana\]\]/);
  const personas = (await app.fileAfterSync('/personas.org', 500)) || '';
  expect(personas).toMatch(/\* Ana\n:PROPERTIES:\n:ID: /);
  // el id del contacto es el del enlace
  const id = /:ID: (\S+)/.exec(personas)[1];
  expect(app.store['/tasks.org']).toContain(`[[id:${id}][Ana]]`);
  expect(app.errors).toEqual([]);
});

test('4.48 A: «[[» ofrece siempre «Nueva cabecera» y «Crear contacto» (4.50: ya no «Crear página»)', async ({
  app,
}) => {
  const { page } = app;
  await app.open(
    { '/tasks.org': '', '/inbox.org': '', '/notas.org': '* Beta\n* Delta\n' },
    '/file/notas.org'
  );
  await expect(page.locator('text=Beta').first()).toBeVisible({ timeout: 20000 });
  await app.press(page.locator('text=Beta').first());
  await page.waitForTimeout(400);
  await page.locator('[data-testid=eli-docbar-insert]').click();
  await page.locator('[data-testid=eli-docbar-link-heading]').click();
  await expect(page.locator('[data-testid=eli-ask-pick]')).toBeVisible({ timeout: 5000 });
  // aunque «Delta» ya existe, salen las opciones de crear
  await page.locator('[data-testid=eli-pick-search]').fill('Delta');
  await expect(
    page.locator('[data-testid=eli-pick-new]', { hasText: 'Nueva cabecera' })
  ).toHaveCount(1);
  // (4.50) ya no se ofrece crear un fichero al enlazar
  await expect(page.locator('[data-testid=eli-pick-new]', { hasText: 'Crear página' })).toHaveCount(
    0
  );
  const contact = page.locator('[data-testid=eli-pick-new]', { hasText: 'Crear contacto' });
  await expect(contact).toHaveCount(1);
  await contact.click();
  await page.locator('.eli-prompt__ok').click();
  await expect(page.locator('[data-testid=eli-ask-pick]')).toHaveCount(0);
  await expect
    .poll(() => app.fileAfterSync('/personas.org', 500), { timeout: 15000 })
    .toMatch(/\* Delta\n:PROPERTIES:\n:ID: /);
  expect(app.errors).toEqual([]);
});

const PERSONAS = '* Mari Carmen\n:PROPERTIES:\n:ID: MC-1\n:END:\n';
const AGENDAS = `* Mari Carmen
- [ ] Preguntar por el viaje

* Quan siguem a ...
** ... Barcelona
- [ ] Xus
`;

test('4.48 B: Procesar Inbox → Hablar con Mari Carmen → punto en su agenda', async ({ app }) => {
  const { page } = app;
  await app.open({
    '/tasks.org': '',
    '/inbox.org': '* Comentar el presupuesto\n',
    '/personas.org': PERSONAS,
    '/agendas.org': AGENDAS,
  });
  await gtd.ready(app);
  await gtd.side(app, 'gtd-process-start');
  await expect(page.locator('[data-testid=gtd-process]')).toHaveCount(1);
  // ¿Requiere acción? Sí → ¿menos de 2 minutos? No → «Hablar con… (Agenda)»
  await page.keyboard.press('1');
  // (4.60, Allen) siguiente acción (Intro) antes de «¿menos de 2 minutos?»
  await page.keyboard.press('Enter');
  await page.keyboard.press('2');
  await page.locator('[data-testid=gtd-proc-opt]', { hasText: 'Hablar con' }).first().click();
  await page.locator('[data-testid=eli-pick-item]', { hasText: 'Mari Carmen' }).first().click();
  await expect
    .poll(() => app.fileAfterSync('/agendas.org', 500), { timeout: 15000 })
    .toMatch(/- \[ \] Preguntar por el viaje\n\n?\*\* Comentar el presupuesto\n/);
  // lo demás, igual
  expect(app.store['/agendas.org']).toContain('* Quan siguem a ...\n** ... Barcelona\n- [ ] Xus');
  // la página Agendas del menú lateral
  await page.waitForTimeout(500);
  await gtd.side(app, 'gtd-list-agendas');
  await expect(page.locator('[data-testid=gtd-agendas]')).toHaveCount(1);
  await expect(page.locator('[data-testid=gtd-agenda-row]')).toHaveCount(2);
  expect(app.errors).toEqual([]);
});
