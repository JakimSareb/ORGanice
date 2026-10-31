// 4.59: visor de PDF con notas org-noter. Abre un PDF pequeño desde un enlace [[pdf:…::2]],
// crea una nota en la página 2 (el fichero gana :NOTER_DOCUMENT: y :NOTER_PAGE:), va a la 1 y
// salta a la 2 tocando la nota. La lógica (orden, byte a byte, enlaces) va en jest (eli459).
const { test, expect } = require('../harness');

// PDF de 2 páginas en ASCII puro (el WebDAV simulado sirve texto)
const pdfOf = (texts) => {
  const objs = [];
  const n = texts.length;
  objs.push('<< /Type /Catalog /Pages 2 0 R >>');
  const kids = texts.map((_, i) => `${3 + i * 2} 0 R`).join(' ');
  objs.push(`<< /Type /Pages /Kids [${kids}] /Count ${n} >>`);
  const font = 3 + n * 2;
  texts.forEach((t, i) => {
    objs.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents ${4 + i * 2} 0 R ` +
        `/Resources << /Font << /F1 ${font} 0 R >> >> >>`
    );
    const s = `BT /F1 24 Tf 40 100 Td (${t}) Tj ET`;
    objs.push(`<< /Length ${s.length} >>\nstream\n${s}\nendstream`);
  });
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let out = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => {
    offs.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offs.forEach((o) => (out += `${String(o).padStart(10, '0')} 00000 n \n`));
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
};

test('4.59: PDF desde un enlace, nota en la página 2 y salto desde la nota', async ({ app }) => {
  const { page } = app;
  const DOC = '* Leer [[pdf:libro.pdf::2][el libro]]\n';
  await app.open(
    {
      '/tasks.org': '',
      '/inbox.org': '',
      '/lecturas.org': DOC,
      '/libro.pdf': pdfOf(['Pagina uno', 'Pagina dos']),
    },
    '/file/lecturas.org'
  );
  const link = page.locator('[data-testid=eli-pdf-link]').first();
  await expect(link).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(300);
  await app.press(link);
  const box = page.locator('[data-testid=eli-pdf-pagebox]');
  await expect(box).toHaveAttribute('data-page', '2', { timeout: 20000 });
  await expect(page.locator('.eli-pdf .textLayer')).toContainText('Pagina dos', { timeout: 10000 });

  await app.press(page.locator('[data-testid=eli-pdf-add-note]'));
  const title = page.locator('[data-testid=eli-form-pdf-title]');
  await expect(title).toBeVisible({ timeout: 5000 });
  await title.fill('Idea clave');
  await app.press(page.locator('.eli-prompt__ok'));

  await expect
    .poll(async () => (await app.fileAfterSync('/lecturas.org', 500)) || '', { timeout: 15000 })
    .toMatch(
      /:NOTER_DOCUMENT: libro\.pdf\n:END:\n[\s\S]*\*\* Idea clave\n:PROPERTIES:\n:NOTER_PAGE: 2\n:END:/
    );
  expect(app.store['/lecturas.org'].startsWith(DOC)).toBe(true);

  const note = page.locator('[data-testid=eli-pdf-note]').first();
  await expect(note).toContainText('Idea clave', { timeout: 10000 });
  await app.press(page.locator('[data-testid=eli-pdf-prev]'));
  await expect(box).toHaveAttribute('data-page', '1', { timeout: 10000 });
  await app.press(note.locator('.eli-pdf__note-main'));
  await expect(box).toHaveAttribute('data-page', '2', { timeout: 10000 });
  expect(app.errors).toEqual([]);
});
