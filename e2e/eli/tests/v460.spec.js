// 4.60: agendas de proyecto + «Nueva reunión» (trae los puntos y abre el acta), entrada de actas
// `/gtd?acta=…`, Agendas sin scroll horizontal, plegar con el dedo una «sección» de las notas y la
// barra superior configurable. La lógica (crear, plantillas, Deshacer…) va en jest (gtd460).
const { test, expect, gtd } = require('../harness');

const TASKS =
  '#+TODO: TODO NEXT WAITING PROJECT | DONE CANCELLED\n* PROJECT Mudanza\n:PROPERTIES:\n:ID: PRJ-1\n:END:\n** NEXT Pedir presupuesto\n';
const PERSONAS = '* Ana García\n:PROPERTIES:\n:ID: ANA-1\n:END:\n';
const AGENDAS = `* Ana García
** Primer punto con un título bastante largo para comprobar que no desborda la pantalla
*** Subpunto también con un título largo que ocupa varias palabras seguidas
**** Nivel tres con https://example.com/una/ruta/muy/larga/sin/espacios/que/no/se/parte/nunca
** Segundo punto
* Mudanza
:PROPERTIES:
:PROYECTO: [[id:PRJ-1][Mudanza]]
:TYPE: agenda
:END:
** Hablar del camión
`;

test('4.60 A/B: agenda de proyecto y «Nueva reunión» que trae los puntos abiertos', async ({
  app,
}) => {
  const { page } = app;
  await app.open({
    '/tasks.org': TASKS,
    '/inbox.org': '',
    '/personas.org': PERSONAS,
    '/agendas.org': AGENDAS,
    '/reuniones.org': '#+TITLE: Reuniones\n',
  });
  await gtd.ready(app);
  await gtd.side(app, 'gtd-list-agendas');
  await expect(page.locator('[data-testid=gtd-agendas]')).toHaveCount(1);
  await expect(page.locator('[data-testid=gtd-agendas-projects]')).toHaveCount(1);
  // filtro por tipo: solo proyectos
  await app.press(page.locator('[data-testid=gtd-agendas-kind-project]'));
  await expect(page.locator('[data-testid=gtd-agenda-row]')).toHaveCount(1);
  await expect(page.locator('[data-testid=gtd-agenda-row]')).toContainText('Mudanza');
  // «Nueva reunión» desde la agenda del proyecto
  await app.press(page.locator('[data-testid=gtd-agenda-new-meeting]').first());
  const dlg = page.locator('[data-testid=gtd-meeting-new]');
  await expect(dlg).toBeVisible();
  await expect(page.locator('[data-testid=gtd-meeting-title]')).toHaveValue(
    /^\d{4}-\d\d-\d\d Reunión con Mudanza$/
  );
  await expect(page.locator('[data-testid=gtd-meeting-project]')).toContainText('Mudanza');
  await expect(page.locator('[data-testid=gtd-meeting-bring]')).toBeChecked();
  await app.press(page.locator('[data-testid=gtd-meeting-create]'));
  await expect(dlg).toHaveCount(0);
  await expect
    .poll(() => app.fileAfterSync('/reuniones.org', 500), { timeout: 15000 })
    .toMatch(
      /\* \d{4}-\d\d-\d\d Reunión con Mudanza\n:PROPERTIES:\n[\s\S]*:TYPE: meeting\n[\s\S]*:PROYECTO: \[\[id:PRJ-1\]\[Mudanza\]\]\n:END:\n\[\d{4}-\d\d-\d\d \w+\]\n\*\* Hablar del camión/
    );
  expect(app.store['/agendas.org']).not.toContain('Hablar del camión');
  // se abre la reunión en Documentos
  await expect(page).toHaveURL(/\/file\/reuniones\.org/);
  expect(app.errors).toEqual([]);
});

test('4.60 D: /gtd?acta=… abre «Nueva reunión» con el texto y propone tareas', async ({ app }) => {
  const { page } = app;
  const acta = 'Ana se encarga de pedir el camión. Hablamos del tiempo.';
  await app.open(
    { '/tasks.org': TASKS, '/inbox.org': '', '/personas.org': PERSONAS },
    `/gtd?acta=${encodeURIComponent(acta)}`
  );
  await expect(page.locator('[data-testid=gtd-meeting-new]')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('[data-testid=gtd-meeting-transcript]')).toHaveValue(acta);
  await expect(page.locator('[data-testid=gtd-meeting-task]')).toHaveCount(1);
  await expect(page.locator('[data-testid=gtd-meeting-task]')).toContainText('Ana García');
  // el parámetro se quita de la dirección
  await expect(page).not.toHaveURL(/acta=/);
  await app.press(page.locator('[data-testid=gtd-meeting-cancel]'));
  await expect(page.locator('[data-testid=gtd-meeting-new]')).toHaveCount(0);
  expect(app.errors).toEqual([]);
});

test('4.60 E: Agendas con 3 niveles desplegados sin scroll horizontal', async ({ app }) => {
  const { page } = app;
  await app.open({
    '/tasks.org': TASKS,
    '/inbox.org': '',
    '/personas.org': PERSONAS,
    '/agendas.org': AGENDAS,
  });
  await gtd.ready(app);
  await gtd.side(app, 'gtd-list-agendas');
  await app.press(page.locator('[data-testid=gtd-agenda-toggle]').first());
  await expect(
    page.locator('[data-testid=gtd-agenda-point-title]', { hasText: 'Nivel tres' })
  ).toBeVisible();
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw).toBeLessThanOrEqual(cw);
  expect(app.errors).toEqual([]);
});

test('4.60 E: tocar la viñeta de una «sección» de las notas la pliega (también con el dedo)', async ({
  app,
}) => {
  const { page } = app;
  const DOC = '* Reunión\n- Sección uno\n  Notas de la sección.\n  - sub punto\n- Sección dos\n';
  await app.open({ '/tasks.org': '', '/inbox.org': '', '/notas.org': DOC }, '/file/notas.org');
  await expect(page.locator('text=Reunión').first()).toBeVisible({ timeout: 20000 });
  await app.press(page.locator('text=Reunión').first());
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  const hit = page.locator('[data-testid=list-fold-hit]').first();
  await hit.waitFor({ state: 'attached', timeout: 10000 });
  const b = await hit.boundingBox();
  if (app.mobile) await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  else await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await expect(page.locator('.list-part__li--folded')).toHaveCount(1);
  expect(app.errors).toEqual([]);
});

test('4.60 E: barra superior — «Sincronizar» pasa al Menú ☰', async ({ app }) => {
  const { page } = app;
  await app.open({ '/tasks.org': TASKS, '/inbox.org': '' });
  await gtd.ready(app);
  await expect(page.locator('[data-testid=eli-sync-btn]')).toHaveCount(1);
  await page.evaluate(() => {
    window.history.pushState({}, '', '/settings');
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
  });
  await page
    .locator('[data-testid=eli-setting-topbar]')
    .waitFor({ state: 'attached', timeout: 20000 });
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)));
  // bajar «Sincronizar» por debajo de la línea «Menú ☰»
  await page.locator('[data-testid=eli-topbar-down-sync]').click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const l = JSON.parse(localStorage.getItem('eliTopBarLayout') || '{}');
        return l.order && l.order.indexOf('sync') >= l.bar;
      })
    )
    .toBe(true);
  await page.evaluate(() => {
    window.history.pushState({}, '', '/gtd');
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
  });
  await gtd.ready(app);
  await expect(page.locator('[data-testid=eli-sync-btn]')).toHaveCount(0);
  await page.locator('[data-testid=eli-more-top]').click();
  await expect(page.locator('[data-testid=eli-topbar-menu-sync]')).toBeVisible();
  expect(app.errors).toEqual([]);
});
