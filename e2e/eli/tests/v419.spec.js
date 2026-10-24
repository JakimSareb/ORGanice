// 4.19: Alt+↓ mueve la tarea seleccionada (cambia el orden en el fichero); Mayús+B abre el filtro
// de la sección. (El resto —Tab, orden del tabulador del editor— se ve en la pantalla; el orden
// de movimiento va en jest: gtd419.)
const { test, expect, gtd } = require('../harness');

test('4.19: Alt+↓ mueve la tarea seleccionada y Mayús+B abre el filtro de la sección', async ({
  app,
}) => {
  const { page } = app;
  await app.open({ '/tasks.org': '* NEXT Aaa\n* NEXT Bbb\n* NEXT Ccc\n', '/inbox.org': '' });
  await gtd.ready(app);
  await gtd.openList(app, 'Next');
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(300);
  await page.keyboard.press('Alt+ArrowDown');
  await expect
    .poll(
      async () => {
        const f = (await app.fileAfterSync('/tasks.org', 500)) || '';
        return f.indexOf('Bbb') < f.indexOf('Aaa') && f.indexOf('Aaa') < f.indexOf('Ccc');
      },
      { timeout: 15000 }
    )
    .toBe(true);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+B');
  await expect(page.locator('[data-testid=gtd-sec-filter]')).toBeVisible({ timeout: 5000 });
  expect(app.errors).toEqual([]);
});
