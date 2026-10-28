import {
  normalizeWikiFolder,
  wikiPaths,
  kindFileText,
  indexFileText,
  entryText,
  parseEntries,
  findEntryByTitle,
  appendEntry,
  addIndexLine,
  parseProcesses,
  sortProcesses,
  filterProcesses,
  setEntryProperty,
  daysSince,
  cleanTag,
} from './eli_wiki';

test('carpeta y rutas de los 5 ficheros', () => {
  expect(normalizeWikiFolder('')).toBe('wiki/');
  expect(normalizeWikiFolder('mi//wiki')).toBe('mi/wiki/');
  expect(wikiPaths('/d/wiki/').map((x) => x.path)).toEqual([
    '/d/wiki/index.org',
    '/d/wiki/tutoriales.org',
    '/d/wiki/procesos.org',
    '/d/wiki/referencia.org',
    '/d/wiki/explicacion.org',
  ]);
});

test('ficheros base: título y descripción; index con INCLUDE comentados', () => {
  expect(kindFileText('proceso')).toMatch(/^#\+TITLE: Procesos\n# Procesos: cómo/);
  const idx = indexFileText({ id: 'IDX' });
  expect(idx).toContain(':ID:       IDX');
  ['Tutoriales', 'Procesos', 'Referencia', 'Explicación'].forEach((h) =>
    expect(idx).toContain(`\n* ${h}\n`)
  );
  expect(idx).toContain('# #+INCLUDE: "./procesos.org"');
  expect(idx).not.toMatch(/^#\+INCLUDE/m);
});

test('plantilla de Proceso con propiedades y secciones fijas', () => {
  const t = entryText('proceso', {
    title: 'Cierre mensual',
    id: 'P1',
    tag: 'finanzas',
    frecuencia: 'mensual',
    responsable: { id: 'R1', title: 'Eli' },
    date: '2026-10-28',
  });
  expect(t).toMatch(/^\* Cierre mensual :finanzas:\n:PROPERTIES:\n:ID:\s+P1\n/);
  expect(t).toContain(':FRECUENCIA:      mensual');
  expect(t).toContain(':RESPONSABLE:     [[id:R1][Eli]]');
  expect(t).toContain(':ULTIMA_REVISION: 2026-10-28');
  [
    'Propósito',
    'Disparador / Entradas',
    'Pasos',
    'Salidas / Hecho cuando',
    'Ver también',
  ].forEach((h) => expect(t).toContain(`\n** ${h}\n`));
  const e = parseEntries(t)[0];
  expect(e.id).toBe('P1');
  expect(e.tags).toEqual(['finanzas']);
});

test('Proceso sin responsable ni tema; otras plantillas', () => {
  const t = entryText('proceso', { title: 'X', id: 'P2', date: '2026-01-01' });
  expect(t).not.toContain('RESPONSABLE');
  expect(t.split('\n')[0]).toBe('* X');
  expect(entryText('tutorial', { title: 'T', id: 'T1' })).toContain('** Pasos\n1. ');
  expect(entryText('referencia', { title: 'R', id: 'R1' })).toContain(
    '| Elemento | Qué hace | Notas |'
  );
  expect(entryText('explicacion', { title: 'E', id: 'E1' })).toContain(
    '** Alternativas descartadas'
  );
});

test('añadir al final sin tocar lo anterior (byte a byte)', () => {
  const base = kindFileText('proceso') + entryText('proceso', { title: 'A', id: 'A', date: 'd' });
  const next = appendEntry(base, entryText('proceso', { title: 'B', id: 'B', date: 'd' }));
  expect(next.startsWith(base)).toBe(true);
  expect(parseEntries(next).map((e) => e.title)).toEqual(['A', 'B']);
  expect(appendEntry('', 'x\n')).toBe('x\n');
  expect(appendEntry('sin salto', 'x\n')).toBe('sin salto\n\nx\n');
});

test('no duplicar: buscar por título (sin acentos, mayúsculas ni etiquetas)', () => {
  const t = '* Cierre Mensual :fin:\n:PROPERTIES:\n:ID: 1\n:END:\n';
  expect(findEntryByTitle(t, 'cierre mensual').id).toBe('1');
  expect(findEntryByTitle(t, 'otro')).toBeNull();
});

test('línea en index.org bajo la sección del tipo', () => {
  const idx = indexFileText({ id: 'IDX' });
  const a = addIndexLine(idx, 'proceso', 'P1', 'Cierre [mensual]');
  expect(a).toMatch(/\* Procesos\n- \[\[id:P1\]\[Cierre mensual\]\]\n/);
  const b = addIndexLine(a, 'proceso', 'P2', 'Otro');
  expect(b).toMatch(/\* Procesos\n- \[\[id:P1\][^\n]*\n- \[\[id:P2\]\[Otro\]\]\n\n?\* Referencia/);
  // sección ausente → se crea al final
  expect(addIndexLine('#+TITLE: W\n', 'tutorial', 'T', 'Uno')).toContain(
    '* Tutoriales\n- [[id:T][Uno]]'
  );
});

const PROCS = [
  '#+TITLE: Procesos',
  '',
  ...['A', 'B', 'C'].flatMap((n, i) => [
    `* ${n} proceso :${i === 2 ? 'ops' : 'fin'}:`,
    ':PROPERTIES:',
    `:ID: ${n}`,
    `:FRECUENCIA: ${['mensual', 'semanal', 'mensual'][i]}`,
    ...(i < 2 ? [`:RESPONSABLE: [[id:R${i}][${['Eli', 'Pau'][i]}]]`] : []),
    ...(i === 1 ? [] : [`:ULTIMA_REVISION: ${['2026-09-01', '', '2026-10-01'][i] || ''}`]),
    ':END:',
    '** Pasos',
  ]),
].join('\n');

test('parser de propiedades del Proceso', () => {
  const l = parseProcesses(PROCS);
  expect(l).toHaveLength(3);
  expect(l[0]).toMatchObject({
    id: 'A',
    tema: 'fin',
    frecuencia: 'mensual',
    responsable: 'Eli',
    responsableId: 'R0',
    ultima: '2026-09-01',
  });
  expect(l[1].ultima).toBe('');
  expect(l[2].responsable).toBe('');
});

test('orden por última revisión (sin fecha primero) y filtros', () => {
  const l = parseProcesses(PROCS);
  expect(sortProcesses(l).map((p) => p.id)).toEqual(['B', 'A', 'C']);
  expect(sortProcesses(l, 'revision', true).map((p) => p.id)).toEqual(['C', 'A', 'B']);
  expect(sortProcesses(l, 'title').map((p) => p.id)).toEqual(['A', 'B', 'C']);
  expect(filterProcesses(l, { frecuencia: 'Mensual' }).map((p) => p.id)).toEqual(['A', 'C']);
  expect(filterProcesses(l, { responsable: 'pau' }).map((p) => p.id)).toEqual(['B']);
  expect(filterProcesses(l, { tema: 'ops' }).map((p) => p.id)).toEqual(['C']);
});

test('«Revisado hoy»: cambia o inserta la propiedad y deja el resto igual', () => {
  const a = setEntryProperty(PROCS, 'A', 'ULTIMA_REVISION', '2026-10-28');
  expect(a).toContain(':ULTIMA_REVISION: 2026-10-28');
  expect(a.replace('2026-10-28', '2026-09-01')).toBe(PROCS);
  const b = setEntryProperty(PROCS, 'B', 'ULTIMA_REVISION', '2026-10-28');
  expect(parseProcesses(b)[1].ultima).toBe('2026-10-28');
  expect(b.split('\n').length).toBe(PROCS.split('\n').length + 1);
  expect(setEntryProperty(PROCS, 'ZZ', 'ULTIMA_REVISION', 'x')).toBeNull();
});

test('días desde la revisión y etiquetas limpias', () => {
  expect(daysSince('2026-10-01', '2026-10-28')).toBe(27);
  expect(daysSince('', '2026-10-28')).toBeNull();
  expect(cleanTag(' #Mi tema: uno ')).toBe('Mi_tema_uno');
});

// (D) la vista por etiqueta lee las etiquetas de cabecera: `:emacs:` reúne entradas de los 4 ficheros
describe('etiqueta de tema en los cuatro ficheros', () => {
  const { Map: IMap } = require('immutable');
  const { parseOrg } = require('./parse_org');
  const { headingIndex, entriesWithTags, allTags } = require('./eli_heading_index');
  const { WIKI_KINDS, KIND_FILE, kindFileText } = require('./eli_wiki');
  const files = IMap(
    WIKI_KINDS.map((k) => [
      `/wiki/${KIND_FILE[k]}`,
      parseOrg(
        kindFileText(k) + entryText(k, { title: `Entrada ${k}`, id: `ID-${k}`, tag: 'emacs' })
      ),
    ])
  );
  test('tocar :emacs: muestra una entrada de cada fichero', () => {
    const idx = headingIndex(files);
    const found = entriesWithTags(idx, ['emacs']).filter((e) => e.title.startsWith('Entrada'));
    expect(found.map((e) => e.path).sort()).toEqual(
      WIKI_KINDS.map((k) => `/wiki/${KIND_FILE[k]}`).sort()
    );
    expect(allTags(idx).map((t) => t.tag)).toContain('emacs');
  });
});
