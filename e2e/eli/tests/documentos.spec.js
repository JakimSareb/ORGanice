// Humo Documentos: abrir un fichero, ver sus cabeceras y desplegar una
const { test, expect } = require('../harness');

const DOC = `* Primera cabecera
Texto de la primera.
** Hija de la primera
* Segunda cabecera
`;

test('Documentos: abre el fichero y despliega una cabecera', async ({ app }) => {
  await app.open({ '/notas.org': DOC, '/tasks.org': '', '/inbox.org': '' }, '/file/notas.org');
  const first = app.page.locator('text=Primera cabecera').first();
  await expect(first).toBeVisible({ timeout: 20000 });
  await expect(app.page.locator('text=Segunda cabecera').first()).toBeVisible();
  // 1.er toque = seleccionar; 2.º = desplegar
  await app.press(first);
  await app.page.waitForTimeout(500);
  await app.press(first);
  await expect(app.page.locator('text=Hija de la primera').first()).toBeVisible();
  expect(app.errors).toEqual([]);
});

test('Explorador: lista los ficheros de la carpeta', async ({ app }) => {
  await app.open(
    {
      '/notas.org': DOC,
      '/guion.fountain': 'INT. CASA - DÍA\n',
      '/tasks.org': '',
      '/inbox.org': '',
    },
    '/files'
  );
  await expect(app.page.locator('text=notas.org').first()).toBeVisible({ timeout: 20000 });
  await expect(app.page.locator('text=guion.fountain').first()).toBeVisible();
});

test('Flechas ← →: se ven en la lista de Ficheros (3.28)', async ({ app }) => {
  await app.open({ '/notas.org': DOC, '/tasks.org': '', '/inbox.org': '' }, '/files');
  await expect(app.page.locator('[data-testid=eli-nav-back]')).toBeVisible({ timeout: 20000 });
  await expect(app.page.locator('[data-testid=eli-nav-forward]')).toBeVisible();
});

test('Explorador: barra de herramientas sin fichero abierto (3.29)', async ({ app }) => {
  await app.open({ '/notas.org': DOC, '/tasks.org': '', '/inbox.org': '' }, '/files');
  const bar = app.page.locator('[data-testid=eli-docbar]');
  await expect(bar).toBeVisible({ timeout: 20000 });
  // (4.0) Ficheros principales (Menú) y Agenda (GTD) ya no se repiten en la barra
  for (const id of ['new', 'capture']) {
    await expect(app.page.locator(`[data-testid=eli-docbar-${id}]`)).toBeVisible();
  }
  // Nuevo › Fichero Org / Guion Fountain
  await app.page.locator('[data-testid=eli-docbar-new]').click();
  await expect(app.page.locator('[data-testid=eli-docbar-new-org]')).toBeVisible();
  await expect(app.page.locator('[data-testid=eli-docbar-new-fountain]')).toBeVisible();
  expect(app.errors).toEqual([]);
});

const TASKS = `* TODO Llamar al banco
* Una nota sin estado
`;

test('Abrir en GTD: una tarea se abre en GTD; un encabezado sin estado avisa (3.29)', async ({
  app,
}) => {
  await app.open({ '/tasks.org': TASKS, '/inbox.org': '' }, '/file/tasks.org');
  const plain = app.page.locator('text=Una nota sin estado').first();
  await expect(plain).toBeVisible({ timeout: 20000 });
  // sin estado: aviso y se queda en Documentos
  await app.press(plain);
  await app.page.locator('[data-testid=eli-docbar-more]').click();
  await app.page.locator('[data-testid=eli-docbar-gtd]').click();
  await expect(app.page.locator('text=No es una tarea').first()).toBeVisible();
  // un solo aviso, y se cierra con Esc
  await expect(app.page.locator('.eli-prompt__overlay')).toHaveCount(1);
  await app.page.keyboard.press('Escape');
  await expect(app.page.locator('.eli-prompt__overlay')).toHaveCount(0);
  // con estado: va a GTD
  const task = app.page.locator('text=Llamar al banco').first();
  await app.press(task);
  await app.page.waitForTimeout(300);
  await app.page.locator('[data-testid=eli-docbar-more]').click();
  await app.page.locator('[data-testid=eli-docbar-gtd]').click();
  await expect(app.page).toHaveURL(/\/gtd/, { timeout: 20000 });
  await expect(app.page.locator('.gtd-editor').first()).toBeVisible({ timeout: 20000 });
  expect(app.errors).toEqual([]);
});

test('Flechas (3.30): atrás funciona tras abrir y cerrar la Agenda', async ({ app }) => {
  await app.open(
    { '/notas.org': DOC, '/otra.org': DOC, '/tasks.org': '', '/inbox.org': '' },
    '/files'
  );
  await app.page.locator('text=notas.org').first().click();
  await expect(app.page).toHaveURL(/notas\.org/, { timeout: 20000 });
  // Abrir y cerrar la Agenda (ventana que reescribía la entrada del historial y la estropeaba)
  // (4.0) la Agenda ya no está en la barra: con su tecla (a)
  await app.page.waitForTimeout(800);
  await app.page.keyboard.press('a');
  await expect(app.page).toHaveURL(/#agenda/);
  await app.page.keyboard.press('Escape');
  await app.page.waitForTimeout(500);
  await app.page.locator('[data-testid=eli-nav-back]').click();
  await expect(app.page).toHaveURL(/\/files/);
  await app.page.locator('[data-testid=eli-nav-forward]').click();
  await expect(app.page).toHaveURL(/notas\.org/);
  expect(app.errors).toEqual([]);
});

test('Explorador sin conexión: abre una carpeta ya vista (3.31)', async ({ app }) => {
  const alerts = [];
  app.page.on('dialog', (d) => {
    alerts.push(d.message());
    d.dismiss().catch(() => {});
  });
  await app.open(
    { '/notas.org': DOC, '/Viaje/plan.org': '* Plan\n', '/tasks.org': '', '/inbox.org': '' },
    '/files'
  );
  const folder = app.page.locator('text=Viaje').first();
  await expect(folder).toBeVisible({ timeout: 20000 });
  await folder.click();
  await expect(app.page.locator('text=plan.org').first()).toBeVisible({ timeout: 20000 });
  await app.page.goBack();
  await expect(app.page.locator('text=notas.org').first()).toBeVisible({ timeout: 20000 });
  await app.page.context().setOffline(true);
  await app.page.locator('text=Viaje').first().click();
  await expect(app.page.locator('text=plan.org').first()).toBeVisible({ timeout: 20000 });
  await app.page.goBack();
  await expect(app.page.locator('text=notas.org').first()).toBeVisible({ timeout: 20000 });
  await app.page.context().setOffline(false);
  expect(alerts).toEqual([]);
});
