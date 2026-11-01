// 4.06: procesos puntuales y periódicos (Menú ☰ › Procesos): Volcado mental, Planificar un
// proyecto nuevo, Aclarar un proyecto atascado, Repaso de Waiting y Repaso de Someday/Maybe.
const { test, expect, gtd } = require('../harness');

const openProc = async (app, testId) => {
  const { page } = app;
  await page.locator('[data-testid=eli-more-top]').click();
  await page.locator('[data-testid=eli-menu-processes]').click();
  await page.locator(`[data-testid=${testId}]`).click();
  await expect(page.locator('[data-testid=gtd-guided]')).toBeVisible({ timeout: 20000 });
};
const row = (app, title) => app.page.locator('.gtd-review__row', { hasText: title });
const fileHas = (app, path, re) =>
  expect
    .poll(async () => (await app.fileAfterSync(path, 500)) || '', { timeout: 15000 })
    .toMatch(re);

test('4.06: el menú Procesos tiene los puntuales y los periódicos nuevos', async ({ app }) => {
  const { page } = app;
  await app.open({ '/tasks.org': '* NEXT Algo\n', '/inbox.org': '' });
  await gtd.ready(app);
  await page.locator('[data-testid=eli-more-top]').click();
  await page.locator('[data-testid=eli-menu-processes]').click();
  await expect(page.locator('[data-testid=eli-proc-h-oneoff]')).toBeVisible();
  for (const id of [
    'eli-proc-sweep',
    'eli-proc-project',
    'eli-proc-stuck',
    'eli-proc-waiting',
    'eli-proc-someday',
  ])
    await expect(page.locator(`[data-testid=${id}]`)).toBeVisible();
  expect(app.errors).toEqual([]);
});

test('4.06: Volcado mental (apuntar al Inbox, pasar de disparador)', async ({ app }) => {
  const { page } = app;
  await app.open({ '/tasks.org': '* NEXT Algo\n', '/inbox.org': '' });
  await gtd.ready(app);
  await openProc(app, 'eli-proc-sweep');
  await expect(page.locator('[data-testid=gtd-guided-kicker]')).toContainText('Paso 1 de 39');
  await page.locator('[data-testid=gtd-sweep-input]').fill('Terminar el informe');
  await page.locator('[data-testid=gtd-sweep-input]').press('Enter');
  await expect(page.locator('[data-testid=gtd-sweep-captured]')).toContainText(
    'Terminar el informe'
  );
  await fileHas(app, '/inbox.org', /Terminar el informe/);
  await page.locator('[data-testid=gtd-guided-next]').click();
  await expect(page.locator('[data-testid=gtd-guided-kicker]')).toContainText('Paso 2 de 39');
  await expect(page.locator('[data-testid=gtd-sweep-captured]')).toHaveCount(0);
  await expect(page.locator('[data-testid=gtd-sweep-total]')).toContainText('1');
  expect(app.errors).toEqual([]);
});

test('4.06: Planificar un proyecto nuevo (ideas en orden, primera acción = Next)', async ({
  app,
}) => {
  const { page } = app;
  await app.open({ '/tasks.org': '* NEXT Algo\n', '/inbox.org': '' });
  await gtd.ready(app);
  await openProc(app, 'eli-proc-project');
  const next = page.locator('[data-testid=gtd-guided-next]');
  await page.locator('[data-testid=gtd-plan-name]').fill('Pintar la casa');
  await page.locator('[data-testid=gtd-plan-purpose]').fill('Que se vea bonita');
  await next.click();
  await page.locator('[data-testid=gtd-plan-outcome]').fill('Todas las paredes pintadas');
  await next.click();
  for (const idea of ['Comprar pintura', 'Elegir color']) {
    await page.locator('[data-testid=gtd-plan-idea-input]').fill(idea);
    await page.locator('[data-testid=gtd-plan-idea-add]').click();
  }
  await expect(page.locator('[data-testid=gtd-plan-idea]')).toHaveCount(2);
  await next.click();
  // «Elegir color» sube al primer puesto
  await page
    .locator('[data-testid=gtd-plan-row]')
    .nth(1)
    .locator('[data-testid=gtd-plan-up]')
    .click();
  await expect(page.locator('[data-testid=gtd-plan-row]').first()).toContainText('Elegir color');
  await next.click();
  // (4.14) sin siguiente acción no se puede crear (último paso: «¿Sigue en tu mente?»)
  await next.click();
  await expect(page.locator('[data-testid=gtd-plan-create]')).toBeDisabled();
  await page.locator('[data-testid=gtd-guided-prev]').click();
  await page.locator('[data-testid=gtd-plan-first-1]').click();
  await next.click();
  await page.locator('[data-testid=gtd-plan-create]').click();
  await expect(page.locator('[data-testid=gtd-guided]')).toHaveCount(0);
  await fileHas(app, '/tasks.org', /\* PROJECT Pintar la casa/);
  const text = await app.fileAfterSync('/tasks.org', 500);
  expect(text).toContain('Propósito: Que se vea bonita');
  expect(text).toContain('Resultado: Todas las paredes pintadas');
  expect(text).toMatch(/\*\* NEXT Comprar pintura[\s\S]*\*\* TODO Elegir color/);
  expect(app.errors).toEqual([]);
});

test('4.06: Aclarar un proyecto atascado (siguiente paso y Someday)', async ({ app }) => {
  const { page } = app;
  await app.open({
    '/tasks.org': '* PROJECT Atascado\n** TODO Algo pendiente\n* PROJECT Olvidado\n',
    '/inbox.org': '',
  });
  await gtd.ready(app);
  await openProc(app, 'eli-proc-stuck');
  await expect(page.locator('[data-testid=gtd-guided-title]')).toContainText('Proyecto 1 de 2');
  await expect(page.locator('[data-testid=gtd-stuck-project]')).toContainText('Atascado');
  await page.locator('[data-testid=gtd-stuck-alive]').click();
  await page.locator('[data-testid=gtd-stuck-next-input]').fill('Llamar al pintor');
  await page.locator('[data-testid=gtd-stuck-next-add]').click();
  await expect(page.locator('[data-testid=gtd-stuck-project]')).toContainText('Olvidado');
  await page.locator('[data-testid=gtd-stuck-sleep]').click();
  await expect(page.locator('[data-testid=gtd-guided-finish]')).toBeVisible();
  await fileHas(app, '/tasks.org', /:STATUS: +sleep/);
  const text = await app.fileAfterSync('/tasks.org', 500);
  expect(text).toMatch(
    /\* PROJECT Atascado[\s\S]*\*\* NEXT Llamar al pintor[\s\S]*\* PROJECT Olvidado/
  );
  expect(app.errors).toEqual([]);
});

test('4.06: Repaso de Waiting (por persona, reclamar con tarea en Next)', async ({ app }) => {
  const { page } = app;
  await app.open({
    // (4.48) la persona va en :PERSONA: (contacto), no en una etiqueta
    '/tasks.org':
      '* WAITING Contrato firmado\n:PROPERTIES:\n:PERSONA: [[id:A1][Ana]]\n:END:\n* WAITING Paquete\n',
    '/inbox.org': '',
  });
  await gtd.ready(app);
  await openProc(app, 'eli-proc-waiting');
  await expect(page.locator('[data-testid=gtd-waiting-person]')).toHaveCount(2);
  await expect(page.locator('[data-testid=gtd-waiting-person]').first()).toContainText('Ana');
  await row(app, 'Contrato firmado').locator('[data-testid=gtd-guided-act-chase]').click();
  await page.locator('[data-testid=gtd-chase-task]').click();
  await fileHas(
    app,
    '/tasks.org',
    /NEXT Reclamar a Ana: Contrato firmado[\s\S]*:PERSONA: \[\[id:A1\]\[Ana\]\]/
  );
  await row(app, 'Paquete').locator('[data-testid=gtd-guided-act-done]').click();
  await fileHas(app, '/tasks.org', /DONE Paquete/);
  expect(app.errors).toEqual([]);
});

test('4.06: Repaso de Someday/Maybe (activar, dejar, borrar)', async ({ app }) => {
  const { page } = app;
  await app.open({
    '/tasks.org': '* MAYBE Aprender piano\n* MAYBE Ir a Japón\n* MAYBE Leer el Quijote\n',
    '/inbox.org': '',
  });
  await gtd.ready(app);
  await openProc(app, 'eli-proc-someday');
  await row(app, 'Aprender piano').locator('[data-testid=gtd-guided-act-next]').click();
  await row(app, 'Leer el Quijote').locator('[data-testid=gtd-guided-act-keep]').click();
  await expect(row(app, 'Leer el Quijote')).toHaveCount(0);
  await row(app, 'Ir a Japón').locator('[data-testid=gtd-guided-act-trash]').click();
  await fileHas(app, '/tasks.org', /NEXT Aprender piano/);
  await fileHas(app, '/tasks.org', /Ir a Japón.*:trash:/);
  const text = await app.fileAfterSync('/tasks.org', 500);
  expect(text).toContain('MAYBE Leer el Quijote');
  expect(app.errors).toEqual([]);
});
