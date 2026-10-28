// 4.47: Procesos ZK. Recorrido ☰ › Procesos ZK › Procesar fugaces → «Nota permanente» → asistente
// (título, idea, enlace sugerido por mención, índice) → la permanente se crea con su enlace, el
// índice la enlaza y la fugaz sale de ZK/inbox.org. La lógica (huérfanas, sin índice, filas sin
// procesar, celda «Nota ZK») va en jest (eli_zk_process.unit.test.js).
const { test, expect } = require('../harness');

const BASE = { '/tasks.org': '', '/inbox.org': '', '/notas.org': '* Algo\n' };
const INBOX = [
  '#+title: Fugaces',
  '#+filetags: :fugaz:',
  '',
  '* Repasar en días distintos',
  ':PROPERTIES:',
  ':ID:       F1',
  ':CREATED:  [2026-10-27 Tue 23:50]',
  ':END:',
  'Lo leí en el libro.',
  '',
].join('\n');
const PERM = [
  ':PROPERTIES:',
  ':ID:       P2',
  ':END:',
  '#+title: Memoria espaciada',
  '#+filetags: :permanente:',
  '',
  '* Idea',
  'Repasar a intervalos.',
  '',
].join('\n');
const INDEX = [
  ':PROPERTIES:',
  ':ID:       I1',
  ':END:',
  '#+title: Aprender',
  '#+filetags: :indice:',
  '',
  '* Notas',
  '',
].join('\n');

test('4.47: procesar una fugaz como nota permanente con enlace e índice', async ({ app }) => {
  const { page } = app;
  await app.open(
    {
      ...BASE,
      '/ZK/inbox.org': INBOX,
      '/ZK/permanentes/20261001000000-memoria_espaciada.org': PERM,
      '/ZK/indices/20261001000000-aprender.org': INDEX,
    },
    '/file/notas.org',
    { localStorage: { eliZkFolder: '/ZK/' } }
  );
  await expect(page.locator('text=Algo').first()).toBeVisible({ timeout: 20000 });
  await page.locator('[data-testid=eli-more-top]').click();
  await page.locator('[data-testid=eli-menu-zk-processes]').click();
  await page.locator('[data-testid=eli-zk-proc-fugaces]').click();
  await expect(page.locator('[data-testid=eli-zk-fugaces]')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('[data-testid=eli-zk-kicker]')).toContainText('quedan 1');
  await expect(page.locator('[data-testid=eli-zk-title]')).toContainText(
    'Repasar en días distintos'
  );
  await page.locator('[data-testid=eli-zk-fz-perm]').click();
  await expect(page.locator('[data-testid=eli-zk-wizard]')).toBeVisible({ timeout: 5000 });
  await page.locator('[data-testid=eli-zk-wiz-title]').fill('Espaciar el repaso fija lo aprendido');
  await page.locator('[data-testid=eli-zk-next]').click();
  await page
    .locator('[data-testid=eli-zk-wiz-idea]')
    .fill('Con la memoria espaciada se olvida menos.');
  await page.locator('[data-testid=eli-zk-next]').click();
  await page.locator('[data-testid=eli-zk-wiz-suggest]', { hasText: 'Memoria espaciada' }).click();
  await expect(page.locator('[data-testid=eli-zk-wiz-link]')).toHaveCount(1);
  await page.locator('[data-testid=eli-zk-next]').click();
  await page.locator('[data-testid=eli-zk-wiz-index]', { hasText: 'Aprender' }).click();
  await page.locator('[data-testid=eli-zk-next]').click();
  await page.locator('[data-testid=eli-zk-wiz-create]').click();
  await expect(page.locator('[data-testid=eli-zk-fz-done]')).toBeVisible({ timeout: 20000 });

  const permPath = () =>
    Object.keys(app.store).find((p) => /^\/ZK\/permanentes\/\d{14}-espaciar/.test(p));
  await expect.poll(() => permPath() || '', { timeout: 15000 }).not.toBe('');
  const perm = app.store[permPath()];
  expect(perm).toContain('#+title: Espaciar el repaso fija lo aprendido');
  expect(perm).toContain('#+filetags: :permanente:');
  expect(perm).toContain('* Enlaces\n- [[id:P2][Memoria espaciada]]');
  const id = /:ID:\s+(\S+)/.exec(perm)[1];
  await expect
    .poll(
      async () => (await app.fileAfterSync('/ZK/indices/20261001000000-aprender.org', 500)) || '',
      { timeout: 15000 }
    )
    .toContain(`[[id:${id}][Espaciar el repaso fija lo aprendido]]`);
  await expect
    .poll(async () => (await app.fileAfterSync('/ZK/inbox.org', 500)) || '', { timeout: 15000 })
    .not.toContain('Repasar en días distintos');
  expect(app.errors).toEqual([]);
});

const FICHA = [
  ':PROPERTIES:',
  ':ID:       C1',
  ':END:',
  '#+title: Un libro',
  '#+filetags: :literatura:libro:',
  '#+AUTOR: Ana',
  '#+ESTADO: leyendo',
  '* Puntos destacados',
  '| Dónde | Sección | Punto o cita        | Tipo | Nota ZK |',
  '|-------+---------+---------------------+------+---------|',
  '| p. 7  | I       | Lo breve se recuerda | idea |         |',
  '',
  '* Notas permanentes creadas',
  '',
].join('\n');

test('4.47: «→ Permanente» en la ficha llena «Nota ZK»; Revisión ZK y Biblioteca', async ({
  app,
}) => {
  const { page } = app;
  await app.open(
    { ...BASE, '/ZK/literatura/20261001000000-un_libro.org': FICHA },
    '/file/ZK/literatura/20261001000000-un_libro.org',
    { localStorage: { eliZkFolder: '/ZK/' } }
  );
  const head = page.locator('text=Puntos destacados').first();
  await expect(head).toBeVisible({ timeout: 20000 });
  // las cabeceras salen plegadas: seleccionar + Intro despliega
  await app.press(head);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  if (!(await page.locator('[data-testid=eli-zk-to-permanent]').count())) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
  await page.locator('[data-testid=eli-zk-to-permanent]').first().click();
  await expect(page.locator('[data-testid=eli-zk-wizard]')).toBeVisible({ timeout: 20000 });
  await page.locator('[data-testid=eli-zk-wiz-title]').fill('Lo breve se recuerda mejor');
  await page.locator('[data-testid=eli-zk-next]').click();
  await expect(page.locator('[data-testid=eli-zk-wiz-idea]')).toHaveValue('Lo breve se recuerda');
  await page.locator('[data-testid=eli-zk-next]').click();
  await page.locator('[data-testid=eli-zk-next]').click(); // aviso: sin enlaces
  await expect(page.locator('[data-testid=eli-zk-wiz-warn]')).toBeVisible();
  await page.locator('[data-testid=eli-zk-next]').click(); // seguir sin enlaces
  await page.locator('[data-testid=eli-zk-next]').click(); // índice: ninguno
  await expect(page.locator('[data-testid=eli-zk-wiz-where]')).toHaveValue('p. 7');
  await page.locator('[data-testid=eli-zk-wiz-create]').click();
  await expect(page.locator('[data-testid=eli-zk-wiz-open]')).toBeVisible({ timeout: 20000 });
  await expect
    .poll(
      async () =>
        (await app.fileAfterSync('/ZK/literatura/20261001000000-un_libro.org', 500)) || '',
      { timeout: 15000 }
    )
    .toMatch(/\| p\. 7 .*\[\[id:[^\]]+\]\[Lo breve se recuerda mejor\]\] \|/);
  const card = app.store['/ZK/literatura/20261001000000-un_libro.org'];
  expect(card).toMatch(/\* Notas permanentes creadas\n- \[\[id:/);
  const permPath = Object.keys(app.store).find((p) => /^\/ZK\/permanentes\//.test(p));
  expect(app.store[permPath]).toContain('* Fuente\n- [[id:C1][Un libro]] — p. 7');
  await page.locator('[data-testid=eli-zk-finish]').click();
  await expect(page.locator('[data-testid=eli-zk-overlay]')).toHaveCount(0);

  // Revisión ZK: la permanente nueva no tiene índice
  await page.locator('[data-testid=eli-more-top]').click();
  await page.locator('[data-testid=eli-menu-zk-processes]').click();
  await page.locator('[data-testid=eli-zk-proc-review]').click();
  await expect(page.locator('[data-testid=eli-zk-review]')).toBeVisible({ timeout: 20000 });
  await page.locator('[data-testid=eli-zk-review-dot-noindex]').click();
  await expect(page.locator('[data-testid=eli-zk-review-item]')).toContainText(
    'Lo breve se recuerda mejor'
  );
  await page.locator('[data-testid=eli-zk-close]').click();

  // Biblioteca: la ficha, con su autor y estado
  await page.locator('[data-testid=eli-more-top]').click();
  await page.locator('[data-testid=eli-menu-zk-processes]').click();
  await page.locator('[data-testid=eli-zk-proc-library]').click();
  await expect(page.locator('[data-testid=eli-zk-lib-row]')).toHaveCount(1, { timeout: 20000 });
  await expect(page.locator('[data-testid=eli-zk-lib-row]')).toContainText('Ana');
  await page.locator('[data-testid=eli-zk-lib-state]').selectOption('leído');
  await expect(page.locator('[data-testid=eli-zk-lib-row]')).toHaveCount(0);
  expect(app.errors).toEqual([]);
});
