// 4.13: GTD: reloj naranja en la fila, pie del editor (Cancelar + Guardar al final), icono de notas
// del proyecto junto al nombre, exportar la vista; herramienta Pomodoro
const { test, expect, gtd } = require('../harness');

const CLOCKED = `* NEXT Reloj corriendo
:LOGBOOK:
CLOCK: [2026-10-21 Wed 08:00]
:END:
* NEXT Otra cosa
`;

const openTask = async (app, title) => {
  const t = app.page.locator(`[data-testid=gtd-task-title]:has-text("${title}")`).first();
  if (app.mobile) await app.press(t);
  else await t.dblclick();
  await expect(app.page.locator('.gtd-editor')).toHaveCount(1);
  await app.page.waitForTimeout(600);
};

test('4.13: la fila con el reloj en marcha lleva el relojito naranja', async ({ app }) => {
  const { page } = app;
  await app.open({ '/tasks.org': CLOCKED, '/inbox.org': '' });
  await gtd.ready(app);
  await gtd.openList(app, 'Next');
  await page.waitForTimeout(600);
  await expect(page.locator('[data-testid=gtd-task-running]')).toHaveCount(1);
  expect(app.errors).toEqual([]);
});

test('4.13: editor de tarea: la última fila es Cancelar + Guardar', async ({ app }) => {
  const { page } = app;
  await app.open({ '/tasks.org': '* NEXT Pintar\nNotas\n', '/inbox.org': '' });
  await gtd.ready(app);
  await gtd.openList(app, 'Next');
  await openTask(app, 'Pintar');
  const info = await page.evaluate(() => {
    const footer = document.querySelector('[data-testid=gtd-editor-footer]');
    const last = footer && footer.lastElementChild;
    const kids = footer ? Array.from(footer.children) : [];
    const tools = footer && footer.querySelector('[data-testid=gtd-editor-tools]');
    const move = footer && footer.querySelector('[data-testid=gtd-editor-move]');
    return {
      hasFooter: !!footer,
      lastHasSave: !!(last && last.querySelector('[data-testid=gtd-editor-save]')),
      lastHasCancel: !!(last && last.querySelector('[data-testid=gtd-editor-cancel]')),
      toolsBeforeMove: !!(
        tools &&
        move &&
        kids.indexOf(tools) < kids.indexOf(move.closest('.gtd-editor__footer > *'))
      ),
    };
  });
  expect(info).toEqual({
    hasFooter: true,
    lastHasSave: true,
    lastHasCancel: true,
    toolsBeforeMove: true,
  });
  await page.click('[data-testid=gtd-editor-cancel]');
  expect(app.errors).toEqual([]);
});

test('4.13: proyecto abierto: el icono de notas va dentro del título y las alterna', async ({
  app,
}) => {
  const { page } = app;
  await app.open({
    '/tasks.org': '* PROJECT Casa\nNotas del proyecto\n** NEXT Pintar\n',
    '/inbox.org': '',
  });
  await gtd.ready(app);
  if (app.mobile) await page.click('.gtd-main__menu');
  await app.press(page.locator('[data-testid=gtd-project]', { hasText: 'Casa' }).first());
  await page.waitForTimeout(800);
  const icon = page.locator('[data-testid=gtd-title] [data-testid=gtd-project-notes-toggle]');
  await expect(icon).toHaveCount(1);
  const before = await page.locator('[data-testid=gtd-project-notes]').count();
  await icon.click();
  await expect(page.locator('[data-testid=gtd-project-notes]')).toHaveCount(before ? 0 : 1);
  expect(app.errors).toEqual([]);
});

test('4.13: exportar la vista a PDF: vista previa con las tareas de la lista', async ({ app }) => {
  const { page } = app;
  await app.open({ '/tasks.org': '* NEXT Pintar\nNotas\n* NEXT Barrer\n', '/inbox.org': '' });
  await gtd.ready(app);
  await gtd.openList(app, 'Next');
  await page.waitForTimeout(600);
  await page.click('[data-testid=gtd-view-menu-button]');
  await expect(page.locator('[data-testid=gtd-view-export-org]')).toBeVisible();
  await page.click('[data-testid=gtd-view-export-pdf]');
  const doc = page.locator('[data-testid=eli-print-tasks]');
  await expect(doc).toBeVisible({ timeout: 5000 });
  await expect(doc).toContainText('Pintar');
  await expect(doc).toContainText('Barrer');
  expect(app.errors).toEqual([]);
});

test('4.13: Pomodoro: se inicia desde el Menú y el chip se puede parar', async ({ app }) => {
  const { page } = app;
  await app.open({ '/tasks.org': '* NEXT Pintar\n', '/inbox.org': '' }, '/gtd', {
    localStorage: { eliTools: JSON.stringify({ pomo: true }) },
  });
  await gtd.ready(app);
  await page.click('[data-testid=eli-more-top]');
  await page.click('[data-testid=eli-menu-tools]');
  await page.click('[data-testid=eli-pomodoro-menu]');
  const chip = page.locator('[data-testid=eli-pomodoro]');
  await expect(chip).toBeVisible({ timeout: 5000 });
  await expect(chip).toContainText(/\d+:\d\d/);
  await chip.click();
  await page.click('[data-testid=eli-pomodoro-stop]');
  await expect(chip).toHaveCount(0);
  expect(app.errors).toEqual([]);
});

test('4.13: Pomodoro: un pomodoro terminado pendiente se guarda como CLOCK en «Pomodoro»', async ({
  app,
}) => {
  const start = Date.UTC(2026, 9, 21, 12, 0);
  const pending = [{ start, end: start + 25 * 60000, ms: 25 * 60000 }];
  await app.open({ '/tasks.org': '* NEXT Pintar\n', '/inbox.org': '' }, '/gtd', {
    localStorage: {
      eliTools: JSON.stringify({ pomo: true }),
      eliPomodoroState: JSON.stringify({ status: 'idle', phase: 'work', count: 1, pending }),
    },
  });
  await gtd.ready(app);
  await expect
    .poll(() => app.fileAfterSync('/tasks.org'), { timeout: 20000 })
    .toMatch(/\* Pomodoro\n:LOGBOOK:\nCLOCK: \[\d{4}-\d\d-\d\d \w+ \d\d:\d\d\]--\[/);
  expect(app.errors).toEqual([]);
});
