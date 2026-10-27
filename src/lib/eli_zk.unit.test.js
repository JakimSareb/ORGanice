import {
  zkTimestamp,
  zkNotePath,
  zkInboxPath,
  normalizeZkFolder,
  isSourceCard,
  permanentText,
  indexText,
  sourceText,
  formatAliases,
  escapeCell,
  addPointToText,
  fugazEntry,
  appendFugaz,
  INBOX_HEAD,
} from './eli_zk';
import { parsePreamble, parseAliases, parseRefs } from './eli_roam';

describe('4.46 Zettelkasten: nombres', () => {
  test('timestamp y ruta estilo org-roam', () => {
    const d = new Date(2026, 9, 27, 23, 5, 9);
    expect(zkTimestamp(d)).toBe('20261027230509');
    expect(zkNotePath('/ZK/', 'permanente', 'Una idea Ñandú', d)).toBe(
      '/ZK/permanentes/20261027230509-una_idea_nandu.org'
    );
    expect(zkNotePath('/ZK/', 'literatura', 'X', d)).toMatch(/^\/ZK\/literatura\//);
    expect(zkNotePath('/ZK/', 'indice', 'X', d)).toMatch(/^\/ZK\/indices\//);
    expect(zkInboxPath('/ZK/')).toBe('/ZK/inbox.org');
  });
  test('carpeta del ajuste', () => {
    expect(normalizeZkFolder('')).toBe('ZK/');
    expect(normalizeZkFolder('  Notas//ZK ')).toBe('Notas/ZK/');
    expect(normalizeZkFolder('/zk/')).toBe('/zk/');
  });
});

describe('4.46 Zettelkasten: plantillas', () => {
  test('permanente e índice llevan ID, título y tipo', () => {
    const p = parsePreamble(permanentText({ title: 'Mi idea', id: 'ABC' }).split('\n'));
    expect(p.props.ID).toBe('ABC');
    expect(p.title).toBe('Mi idea');
    expect(p.filetags).toEqual(['permanente']);
    expect(permanentText({ title: 'T', id: 'X' })).toMatch(
      /\* Idea[\s\S]*\* Enlaces[\s\S]*\* Fuente/
    );
    expect(parsePreamble(indexText({ title: 'I', id: 'Y' }).split('\n')).filetags).toEqual([
      'indice',
    ]);
  });
  test('ficha de fuente', () => {
    const t = sourceText({
      id: 'F1',
      type: 'video',
      title: 'Charla',
      author: 'Ana',
      year: '2024',
      source: 'Canal X',
      url: 'https://ex.org/v',
      isbn: '',
      alias: 'La charla',
    });
    const p = parsePreamble(t.split('\n'));
    expect(p.filetags).toEqual(['literatura', 'video']);
    expect(isSourceCard(p.filetags)).toBe(true);
    expect(parseRefs(p.props.ROAM_REFS)[0].url).toBe('https://ex.org/v');
    expect(parseAliases(p.props.ROAM_ALIASES)).toEqual(['La charla']);
    expect(t).toMatch(/#\+ESTADO: pendiente/);
    expect(t).toMatch(/\* Puntos destacados\n\| Dónde/);
    expect(t).toMatch(/\* Notas permanentes creadas/);
  });
  test('ISBN + URL en ROAM_REFS; tipo desconocido = libro', () => {
    const t = sourceText({ id: 'F', type: '??', title: 'L', isbn: '978', url: 'http://a.b' });
    expect(t).toMatch(/:ROAM_REFS: isbn:978 http:\/\/a\.b/);
    expect(t).toMatch(/:literatura:libro:/);
  });
  test('alias con espacios entre comillas', () => {
    expect(formatAliases(['uno', 'dos tres', ' '])).toBe('uno "dos tres"');
    expect(parseAliases(formatAliases(['dos tres', 'a"b']))).toEqual(['dos tres', 'a"b']);
  });
});

describe('4.46 Zettelkasten: + Punto', () => {
  const base = sourceText({ id: 'F', type: 'libro', title: 'L' });
  const rowsOf = (t) => t.split('\n').filter((l) => /^\|[^-]/.test(l));
  test('fila nueva con | escapado y tabla alineada', () => {
    const out = addPointToText(base, {
      where: 'p. 41',
      section: 'Cap. 2',
      text: 'a | b\nc',
      type: 'idea',
    });
    const rows = rowsOf(out);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatch(/p\. 41/);
    expect(rows[1]).toMatch(/a \\vert\{\} b c/);
    expect(rows[1]).toMatch(/idea/);
    // alineada: todas las filas de la tabla miden lo mismo
    const lens = out
      .split('\n')
      .filter((l) => /^\|/.test(l))
      .map((l) => l.length);
    expect(new Set(lens).size).toBe(1);
    expect(out).not.toMatch(/\[\[id:/);
    expect(out).not.toMatch(/\*\* p\. 41/);
  });
  test('cita larga abajo solo si se marca', () => {
    const text = 'una cita bastante larga que se guarda entera en la sección de citas';
    const on = addPointToText(
      base,
      { where: 'p. 7', section: '', text, type: 'cita' },
      { longQuote: true, newId: 'Q1' }
    );
    expect(on).toMatch(/una cita bastante larga que se… \[\[id:Q1\]\[↓\]\]/);
    expect(on).toMatch(
      /\* Citas\n\*\* p\. 7 — una cita bastante larga que se…\n:PROPERTIES:\n:ID:\s+Q1\n:END:\n/
    );
    expect(on).toContain(text);
    const off = addPointToText(base, { where: 'p. 7', text, type: 'cita' }, { newId: 'Q1' });
    expect(off).not.toMatch(/Q1/);
    expect(off).toContain(text);
  });
  test('crea tabla y citas si faltan', () => {
    const out = addPointToText(
      '#+title: X\n',
      { where: '1', text: 'hola', type: 'dato' },
      {
        longQuote: true,
        newId: 'Z',
      }
    );
    expect(out).toMatch(/\* Puntos destacados\n\| Dónde/);
    expect(out).toMatch(/\* Citas\n\*\* 1 — hola/);
  });
  test('dos puntos seguidos', () => {
    let t = addPointToText(base, { where: '1', text: 'uno', type: 'idea' });
    t = addPointToText(t, { where: '2', text: 'dos', type: 'dato' });
    expect(rowsOf(t)).toHaveLength(3);
  });
  test('escapeCell', () => {
    expect(escapeCell(' a|b ')).toBe('a\\vert{}b');
  });
});

describe('4.46 Zettelkasten: fugaces', () => {
  test('entrada con ID, fecha y origen', () => {
    const e = fugazEntry('Idea rápida\nmás detalle', {
      id: 'I1',
      created: '[2026-10-27 Tue 23:50]',
      origin: '[[id:D1][Diario]]',
    });
    expect(e).toBe(
      '* Idea rápida\n:PROPERTIES:\n:ID:       I1\n:CREATED:  [2026-10-27 Tue 23:50]\n:END:\nmás detalle\nOrigen: [[id:D1][Diario]]\n'
    );
  });
  test('fichero nuevo con cabecera y añadido al final', () => {
    const a = appendFugaz('', fugazEntry('uno'));
    expect(a.startsWith(INBOX_HEAD)).toBe(true);
    const b = appendFugaz(a.trimEnd(), fugazEntry('dos'));
    expect(b.match(/^\* /gm)).toHaveLength(2);
    expect(fugazEntry('')).toMatch(/^\* Fugaz\n/);
  });
});
