// GTD (3.37): editor (Cancelar/Guardar juntos, sin «Hoy» en vence, vista previa, hechas en verde)
const { test, expect, gtd } = require('../harness');

const TASKS = `* NEXT Tarea con notas
Una nota de prueba.
* DONE Ya hecha
`;

const openEditor = async (app, title) => {
  const t = app.page.locator(`[data-testid=gtd-task-title]:has-text("${title}")`);
  if (app.mobile) await app.press(t);
  else await t.dblclick();
  await expect(app.page.locator('.gtd-editor')).toHaveCount(1);
};

test('GTD (3.37): retoques del editor', async ({ app }) => {
  const { page } = app;
  await app.open({ '/tasks.org': TASKS, '/inbox.org': '' });
  await gtd.ready(app);
  await gtd.openList(app, 'Next');

  // notas de la fila: abrirlas con su icono marca el despliegue animado
  // (si ya estaban completas, la 1.ª pulsación las oculta y la 2.ª las abre)
  await page.click('[data-testid=gtd-notes-toggle]');
  await page.waitForTimeout(300);
  if ((await page.locator('.gtd-task__below.is-unfold').count()) === 0)
    await page.click('[data-testid=gtd-notes-toggle]');
  await expect(page.locator('.gtd-task__below.is-unfold')).toHaveCount(1);

  await openEditor(app, 'Tarea con notas');
  // vence: sin botón «Hoy»
  await expect(page.locator('[data-testid=gtd-editor-deadline-today]')).toHaveCount(0);
  // Cancelar y Guardar en la misma línea
  await page.waitForTimeout(600); // fin de la animación de apertura
  const c = await page.locator('[data-testid=gtd-editor-cancel]').boundingBox();
  const s = await page.locator('[data-testid=gtd-editor-save]').boundingBox();
  expect(Math.abs(c.y - s.y)).toBeLessThan(4);
  // (3.46) sin rótulo «Vista previa» sobre las notas (va sobre tablas y casillas: gtd_346)
  await expect(page.locator('[data-testid=gtd-editor-preview-label]')).toHaveCount(0);
  await page.click('[data-testid=gtd-editor-cancel]');
  await expect(page.locator('.gtd-editor')).toHaveCount(0);

  // hecha: sin transparencia ni tachado en el editor
  await gtd.openList(app, 'Logbook');
  await openEditor(app, 'Ya hecha');
  await page.waitForTimeout(600); // fin de la animación de apertura
  const st = await page.evaluate(() => {
    const ed = document.querySelector('.gtd-editor');
    const t = document.querySelector('[data-testid=gtd-editor-title]');
    return {
      finished: ed.classList.contains('is-finished'),
      opacity: getComputedStyle(ed).opacity,
      deco: getComputedStyle(t).textDecorationLine,
    };
  });
  expect(st.finished).toBe(true);
  expect(st.opacity).toBe('1');
  expect(st.deco).toBe('none');
  expect(app.errors).toEqual([]);
});
