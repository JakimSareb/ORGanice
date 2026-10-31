import {
  parseNoterPage,
  noterSessions,
  sessionForPdf,
  relativeDocPath,
  addNoterNote,
  pdfLinkInfo,
  noterTargetAt,
  headingIndexAtLine,
  defaultNotesPath,
} from './eli_noter';

const ORG = '/Notas/lecturas.org';
const PDF = '/Notas/assets/2026/libro.pdf';

const sample = [
  '#+TITLE: Lecturas',
  '* Otra cosa',
  'texto',
  '* Notas del libro',
  ':PROPERTIES:',
  ':NOTER_DOCUMENT: assets/2026/libro.pdf',
  ':END:',
  '** Idea de la página 2',
  ':PROPERTIES:',
  ':NOTER_PAGE: 2',
  ':END:',
  'cuerpo dos',
  '** Otra en la 7',
  ':PROPERTIES:',
  ':NOTER_PAGE: (7 . 0.25)',
  ':END:',
  '* Final',
  '',
].join('\n');

describe('4.59 org-noter', () => {
  test('parseNoterPage', () => {
    expect(parseNoterPage('3')).toEqual({ page: 3, pos: null });
    expect(parseNoterPage('(3 . 0.45)')).toEqual({ page: 3, pos: 0.45 });
    expect(parseNoterPage('(3 0.2 . 0.45)')).toEqual({ page: 3, pos: 0.45 });
    expect(parseNoterPage('x')).toBeNull();
    expect(parseNoterPage(undefined)).toBeNull();
  });

  test('sesiones y notas', () => {
    const [s] = noterSessions(sample);
    expect(s.title).toBe('Notas del libro');
    expect(s.document).toBe('assets/2026/libro.pdf');
    expect(s.notes.map((n) => [n.page, n.title])).toEqual([
      [2, 'Idea de la página 2'],
      [7, 'Otra en la 7'],
    ]);
    expect(s.notes[0].body).toBe('cuerpo dos');
    expect(sessionForPdf(sample, ORG, PDF)).toBeTruthy();
    expect(sessionForPdf(sample, ORG, '/Notas/otro.pdf')).toBeNull();
    // ruta absoluta de Emacs (otro ordenador): vale por el nombre
    const emacs = sample.replace('assets/2026/libro.pdf', '~/Dropbox/Notas/libro.pdf');
    expect(sessionForPdf(emacs, ORG, PDF)).toBeTruthy();
  });

  test('relativeDocPath y fichero de notas por defecto', () => {
    expect(relativeDocPath(ORG, PDF)).toBe('assets/2026/libro.pdf');
    expect(relativeDocPath('/A/b/n.org', '/A/c/x.pdf')).toBe('../c/x.pdf');
    expect(relativeDocPath('/n.org', '/x.pdf')).toBe('x.pdf');
    expect(defaultNotesPath('/A/Libro.PDF')).toBe('/A/Libro.org');
  });

  test('añadir nota ordenada por página, resto byte a byte', () => {
    const { text, created, line } = addNoterNote(sample, {
      orgPath: ORG,
      pdfPath: PDF,
      page: 5,
      quote: 'una cita\n* con estrella',
    });
    expect(created).toBe(false);
    const lines = text.split('\n');
    expect(lines[line]).toBe('** Notas de la página 5');
    expect(lines.slice(line, line + 8)).toEqual([
      '** Notas de la página 5',
      ':PROPERTIES:',
      ':NOTER_PAGE: 5',
      ':END:',
      '#+begin_quote',
      'una cita',
      ',* con estrella',
      '#+end_quote',
    ]);
    // quitando lo insertado queda el original exacto
    expect([...lines.slice(0, line), ...lines.slice(line + 8)].join('\n')).toBe(sample);
    // la estrella escapada no cuenta como cabecera
    expect(noterSessions(text)[0].notes.map((n) => n.page)).toEqual([2, 5, 7]);
  });

  test('página mayor que todas: al final de la sesión, antes de la siguiente cabecera', () => {
    const { text, line } = addNoterNote(sample, {
      orgPath: ORG,
      pdfPath: PDF,
      page: 9,
      title: 'Mi nota',
    });
    const lines = text.split('\n');
    expect(lines[line]).toBe('** Mi nota');
    expect(lines[line + 4]).toBe('* Final');
  });

  test('sin sesión: se crea al final con NOTER_DOCUMENT relativo', () => {
    const base = '* Algo\nhola\n';
    const { text, created, line } = addNoterNote(base, { orgPath: ORG, pdfPath: PDF, page: 1 });
    expect(created).toBe(true);
    expect(text.startsWith(base)).toBe(true);
    expect(text.slice(base.length)).toBe(
      [
        '* Notas: libro',
        ':PROPERTIES:',
        ':NOTER_DOCUMENT: assets/2026/libro.pdf',
        ':END:',
        '[[file:assets/2026/libro.pdf]]',
        '** Notas de la página 1',
        ':PROPERTIES:',
        ':NOTER_PAGE: 1',
        ':END:',
        '',
      ].join('\n')
    );
    expect(text.split('\n')[line]).toBe('** Notas de la página 1');
    // fichero vacío y fichero sin salto final
    expect(addNoterNote('', { orgPath: ORG, pdfPath: PDF, page: 2 }).text).toMatch(
      /^\* Notas: libro\n[\s\S]*:NOTER_PAGE: 2\n:END:\n$/
    );
    const noNl = addNoterNote('* A', { orgPath: ORG, pdfPath: PDF, page: 2 }).text;
    expect(noNl.startsWith('* A\n* Notas: libro')).toBe(true);
  });

  test('enlaces a PDF', () => {
    expect(pdfLinkInfo('pdf:assets/libro.pdf::12')).toEqual({
      target: 'assets/libro.pdf',
      page: 12,
    });
    expect(pdfLinkInfo('pdf:/x/libro.pdf::3++0.40')).toEqual({ target: '/x/libro.pdf', page: 3 });
    expect(pdfLinkInfo('file:libro.pdf::4')).toEqual({ target: 'libro.pdf', page: 4 });
    expect(pdfLinkInfo('file:libro.pdf')).toEqual({ target: 'libro.pdf', page: null });
    expect(pdfLinkInfo('./a/libro.pdf')).toEqual({ target: './a/libro.pdf', page: null });
    expect(pdfLinkInfo('file:libro.org')).toBeNull();
    expect(pdfLinkInfo('https://x.com/a.pdf')).toBeNull();
    expect(pdfLinkInfo('pdf:~/libro.pdf::2')).toBeNull();
  });

  test('abrir el PDF desde una nota o su sesión', () => {
    const idxNote = headingIndexAtLine(sample, 12); // «Otra en la 7»
    expect(noterTargetAt(sample, idxNote)).toEqual({ document: 'assets/2026/libro.pdf', page: 7 });
    expect(noterTargetAt(sample, 1)).toEqual({ document: 'assets/2026/libro.pdf', page: null });
    expect(noterTargetAt(sample, 0)).toBeNull();
    expect(noterTargetAt(sample, 4)).toBeNull();
  });
});
