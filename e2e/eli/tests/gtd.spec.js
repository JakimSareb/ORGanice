// Humo GTD: listas, tarea nueva (foco en el título, 3.17) y proyectos dormidos (:STATUS: sleep)
const { test, expect, gtd } = require('../harness');

const TASKS = `* PROJECT Dormido
:PROPERTIES:
:STATUS: sleep
:END:
** NEXT Tarea dormida
* PROJECT Viejo :sleep:
** NEXT Tarea despierta
* NEXT Suelta
* TODO Pendiente
`;

test('GTD: Next sin lo dormido; la etiqueta :sleep: no duerme', async ({ app }) => {
  await app.open({ '/tasks.org': TASKS, '/inbox.org': '' });
  await gtd.ready(app);
  await gtd.openList(app, 'Next');
  expect((await gtd.titles(app)).sort()).toEqual(['Suelta', 'Tarea despierta']);
  await gtd.openList(app, 'Todo');
  expect(await gtd.titles(app)).toEqual(['Pendiente']);
  expect(app.errors).toEqual([]);
});

test('GTD: «Nuevo elemento» pone el foco en el título y se guarda', async ({ app }) => {
  await app.open({ '/tasks.org': TASKS, '/inbox.org': '' });
  await gtd.ready(app);
  await gtd.openList(app, 'Next');
  await app.press(app.page.locator('[data-testid=gtd-new]'));
  await app.page.waitForSelector('[data-testid=gtd-editor-title]');
  const focused = await app.page.evaluate(() => document.activeElement.dataset.testid);
  expect(focused).toBe('gtd-editor-title');
  await app.page.keyboard.type('Escrita sin tocar');
  await app.page.keyboard.press('Enter');
  expect(await app.fileAfterSync('/tasks.org')).toMatch(/NEXT Escrita sin tocar/);
  expect(await app.page.locator('.eli-keyboard-bridge').count()).toBe(0);
});

test('GTD (3.22): /capture?text=… añade al Inbox', async ({ app }) => {
  await app.open(
    { '/tasks.org': TASKS, '/inbox.org': '' },
    '/capture?text=' + encodeURIComponent('Comprar pan\nintegral') + '&url=https%3A%2F%2Fa.es'
  );
  await gtd.ready(app);
  await app.page.waitForTimeout(1500);
  expect(await gtd.titles(app)).toContain('Comprar pan');
  const inbox = await app.fileAfterSync('/inbox.org');
  expect(inbox).toMatch(/^\* .*Comprar pan/m);
  expect(inbox).toContain('integral\nhttps://a.es');
  expect(app.errors).toEqual([]);
});

test('GTD (3.24): revisión semanal paso a paso', async ({ app }) => {
  await app.open({
    '/tasks.org': TASKS + '* PROJECT Atascado\n** TODO Algo\n',
    '/inbox.org': '* Idea\n',
  });
  await gtd.ready(app);
  const p = app.page;
  await app.press(p.locator('[data-testid=gtd-view-menu-button]'));
  await app.press(p.locator('[data-testid=gtd-menu-review]'));
  await p.waitForSelector('[data-testid=gtd-review]');
  await expect(p.locator('[data-testid=gtd-review-title]')).toContainText('Inbox');
  expect(await gtd.titles(app)).toContain('Idea');
  await app.press(p.locator('[data-testid=gtd-review-next]'));
  await expect(p.locator('[data-testid=gtd-review-title]')).toContainText('sin acción');
  await expect(p.locator('[data-testid=gtd-review-item]')).toHaveText(['Atascado']);
  await app.press(p.locator('[data-testid=gtd-review-item]'));
  await expect(p.locator('[data-testid=gtd-title]')).toContainText('Atascado');
  await expect(p.locator('[data-testid=gtd-review]')).toBeVisible();
  await app.press(p.locator('[data-testid=gtd-review-next]'));
  await expect(p.locator('[data-testid=gtd-review-item]')).toHaveText(['Dormido']);
  for (let i = 0; i < 3; i++) await app.press(p.locator('[data-testid=gtd-review-next]'));
  await p.waitForSelector('[data-testid=gtd-review-done]');
  await app.press(p.locator('[data-testid=gtd-review-finish]'));
  await expect(p.locator('[data-testid=gtd-review]')).toHaveCount(0);
  expect(app.errors).toEqual([]);
});
