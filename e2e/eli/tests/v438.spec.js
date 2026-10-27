// 4.38: diario org-journal. Un `diari-AAAA.org` del formato ANTERIOR se sigue escribiendo en su
// formato (no se crea `AAAA.org`), y la franja «Hábitos de hoy» marca el hábito en su fichero.
const { test, expect } = require('../harness');

const pad = (n) => String(n).padStart(2, '0');

test('4.38: fichero antiguo sigue en su formato y hábitos de hoy', async ({ app }) => {
  const { page } = app;
  const now = new Date();
  const y = now.getFullYear();
  const mk = `${y}-${pad(now.getMonth() + 1)}`;
  const day = `${mk}-${pad(now.getDate())}`;
  const OLD = `#+TITLE: Diari ${y}\n\n* ${mk} mes\n** ${day} hoy\n- 07:00 - madrugón\n`;
  const TASKS = `* TODO Leer un rato\nSCHEDULED: <${day} .+1d>\n:PROPERTIES:\n:STYLE: habit\n:END:\n`;
  await app.open(
    {
      '/tasks.org': TASKS,
      '/inbox.org': '',
      [`/pages/diari-${y}.org`]: OLD,
    },
    '/gtd'
  );
  // desde GTD (así sus ficheros ya están cargados para los hábitos)
  await page.waitForTimeout(2000);
  await page.locator('[data-testid=eli-more-top]').click();
  await app.press(page.locator('[data-testid=eli-diary-menu]'));
  await expect(page.locator('[data-testid=eli-diary]')).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(800);
  // lo apuntado antes se ve
  await expect(page.locator('text=madrugón').first()).toBeVisible({ timeout: 10000 });
  await page.locator('[data-testid=eli-diary-input]').fill('Sigue en el antiguo');
  await app.press(page.locator('[data-testid=eli-diary-add]'));
  await expect
    .poll(async () => (await app.fileAfterSync(`/pages/diari-${y}.org`, 500)) || '', {
      timeout: 15000,
    })
    .toMatch(/- 07:00 - madrugón\n- \d\d:\d\d - Sigue en el antiguo/);
  expect(app.store[`/pages/${y}.org`]).toBeUndefined();
  // hábitos de hoy
  const habit = page.locator('[data-testid=eli-diary-habit]').first();
  await expect(habit).toContainText('Leer un rato');
  await app.press(habit);
  await expect(habit).toHaveClass(/is-done/);
  // como en GTD: el repetidor pasa la fecha al día siguiente (se escribe en tasks.org)
  await expect
    .poll(async () => (await app.fileAfterSync('/tasks.org', 500)) || '', { timeout: 15000 })
    .not.toContain(`<${day}`);
  await app.press(page.locator('[data-testid=eli-diary-close]'));
  await expect(page.locator('[data-testid=eli-diary]')).toHaveCount(0);
  expect(app.errors).toEqual([]);
});
