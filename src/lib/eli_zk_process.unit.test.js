import {
  parseFugaces,
  removeFugaz,
  oldFugaces,
  fugazText,
  zkNoteInfo,
  zkAnalyze,
  randomNote,
  pointRows,
  unprocessedPoints,
  isUnprocessedRow,
  pointFullText,
  setPointNote,
  appendToSection,
  appendParagraph,
  permanentNoteText,
  sourceLine,
  suggestLinks,
  sourceCardInfo,
  libraryList,
  idLink,
  CREATED_HEADING,
} from './eli_zk_process';
import { sourceText, addPointToText, fugazEntry, appendFugaz, indexText } from './eli_zk';
import { reviewSteps, REVIEW_STEPS, STRICT_REVIEW_STEPS } from './gtd/gtd_review';

const note = (id, title, kind, body = '') =>
  `:PROPERTIES:\n:ID:       ${id}\n:END:\n#+title: ${title}\n#+filetags: :${kind}:\n\n* Idea\n${body}\n`;

describe('4.47 Procesar fugaces', () => {
  const inbox = appendFugaz(
    appendFugaz(
      '',
      fugazEntry('Primera idea\nCon cuerpo', {
        id: 'F1',
        created: '[2026-10-10 Sat 09:00]',
        origin: '[[id:X][Diario]]',
      })
    ),
    fugazEntry('Segunda', { id: 'F2', created: '[2026-10-27 Tue 23:50]' })
  );
  test('lee cada entrada con su ID, fecha, cuerpo y origen', () => {
    const list = parseFugaces(inbox);
    expect(list.map((e) => e.title)).toEqual(['Primera idea', 'Segunda']);
    expect(list[0].id).toBe('F1');
    expect(list[0].body).toBe('Con cuerpo');
    expect(list[0].origin).toBe('[[id:X][Diario]]');
    expect(list[0].createdDate.getDate()).toBe(10);
    expect(fugazText(list[0])).toBe('Primera idea\nCon cuerpo');
  });
  test('quitar una fugaz deja las demás', () => {
    const list = parseFugaces(inbox);
    const next = removeFugaz(inbox, list[0]);
    expect(next).not.toContain('Primera idea');
    expect(next).toContain('#+title: Fugaces');
    expect(parseFugaces(next).map((e) => e.id)).toEqual(['F2']);
    expect(removeFugaz(next, { id: 'NO', title: 'nada', start: 99 })).toBeNull();
  });
  test('fugaces de más de 7 días', () => {
    const list = parseFugaces(inbox);
    const old = oldFugaces(list, new Date(2026, 9, 28, 12));
    expect(old.map((e) => e.id)).toEqual(['F1']);
  });
});

describe('4.47 Revisión ZK', () => {
  const perm1 = note('P1', 'Uno', 'permanente', 'Enlaza a [[id:P2][Dos]]');
  const perm2 = note('P2', 'Dos', 'permanente');
  const perm3 = note('P3', 'Tres sola', 'permanente');
  const idx = `${indexText({ id: 'I1', title: 'Índice' })}- [[id:P1][Uno]]\n`;
  const notes = [
    zkNoteInfo('/ZK/permanentes/1-uno.org', perm1),
    zkNoteInfo('/ZK/permanentes/2-dos.org', perm2),
    zkNoteInfo('/ZK/permanentes/3-tres.org', perm3),
    zkNoteInfo('/ZK/indices/1-indice.org', idx),
  ];
  test('tipo, ID y enlaces de cada nota', () => {
    expect(notes[0].kind).toBe('permanente');
    expect(notes[3].kind).toBe('indice');
    expect(notes[0].outIds).toEqual(['p2']);
    expect(notes[0].ownIds).toEqual(['p1']);
  });
  test('huérfanas: sin enlaces entrantes ni salientes', () => {
    const an = zkAnalyze(notes);
    expect(an.orphans.map((n) => n.title)).toEqual(['Tres sola']);
    expect(an.incoming.get('/ZK/permanentes/2-dos.org')).toBe(1);
  });
  test('permanentes sin índice', () => {
    const an = zkAnalyze(notes);
    expect(an.withoutIndex.map((n) => n.title)).toEqual(['Dos', 'Tres sola']);
  });
  test('un enlace a una cabecera de la propia nota no cuenta como saliente', () => {
    const t = `${note(
      'A',
      'A',
      'permanente',
      'ver [[id:A2][abajo]]'
    )}** Sub\n:PROPERTIES:\n:ID: A2\n:END:\n`;
    expect(zkNoteInfo('/a.org', t).outIds).toEqual([]);
  });
  test('nota al azar: otra distinta', () => {
    const n = randomNote(notes, '/ZK/permanentes/1-uno.org', () => 0);
    expect(n.path).not.toBe('/ZK/permanentes/1-uno.org');
  });
});

describe('4.47 Ficha de fuente: puntos y «Nota ZK»', () => {
  let card = sourceText({ id: 'C1', type: 'libro', title: 'Un libro', author: 'Ana' });
  card = addPointToText(card, { where: 'p. 3', section: 'I', text: 'Idea | uno', type: 'idea' });
  card = addPointToText(
    card,
    { where: 'p. 9', section: 'II', text: 'Una cita larga de verdad para el caso', type: 'cita' },
    { longQuote: true, newId: 'Q1' }
  );
  test('filas sin procesar', () => {
    const rows = pointRows(card);
    expect(rows).toHaveLength(2);
    expect(unprocessedPoints(card)).toHaveLength(2);
    expect(isUnprocessedRow(rows[0].cells)).toBe(true);
    expect(isUnprocessedRow(['Dónde', 'Sección', 'Punto o cita', 'Tipo', 'Nota ZK'])).toBe(false);
  });
  test('texto entero: la celda (con | de vuelta) o la cita larga de «Citas»', () => {
    const rows = pointRows(card);
    expect(pointFullText(card, rows[0])).toBe('Idea | uno');
    expect(pointFullText(card, rows[1])).toBe('Una cita larga de verdad para el caso');
  });
  test('al crear la permanente, la celda «Nota ZK» lleva el enlace y la tabla sigue alineada', () => {
    const rows = pointRows(card);
    const link = idLink('P9', 'La idea [rara]');
    const next = setPointNote(card, rows[0].cells, link);
    expect(next).toContain('[[id:P9][La idea rara]]');
    expect(unprocessedPoints(next)).toHaveLength(1);
    const widths = next
      .split('\n')
      .filter((l) => /^\|/.test(l))
      .map((l) => l.length);
    expect(new Set(widths).size).toBe(1);
    expect(setPointNote(next, rows[0].cells, link)).toBeNull();
    const withList = appendToSection(next, CREATED_HEADING, `- ${link}`);
    expect(withList).toMatch(/\* Notas permanentes creadas\n- \[\[id:P9\]/);
  });
  test('biblioteca: datos de la ficha, filtros y orden por fin', () => {
    const a = sourceCardInfo('/a.org', card.replace('#+FIN: ', '#+FIN: 2026-01-10'));
    expect(a.author).toBe('Ana');
    expect(a.type).toBe('libro');
    expect(a.state).toBe('pendiente');
    expect(a.pending).toBe(2);
    const b = { ...a, path: '/b.org', title: 'B', end: '2026-05-01', type: 'video' };
    const c = { ...a, path: '/c.org', title: 'C', end: '' };
    expect(libraryList([c, a, b]).map((x) => x.path)).toEqual(['/b.org', '/a.org', '/c.org']);
    expect(libraryList([c, a, b], { type: 'video' }).map((x) => x.path)).toEqual(['/b.org']);
    expect(libraryList([a], { state: 'leído' })).toEqual([]);
  });
});

describe('4.47 Asistente de nota permanente', () => {
  test('texto de la nota: idea, enlaces y fuente', () => {
    const t = permanentNoteText({
      id: 'P1',
      title: 'Las ideas se conectan',
      idea: 'Primera línea\n* no es cabecera',
      links: [{ id: 'P2', title: 'Otra' }],
      source: sourceLine({ card: { id: 'C1', title: 'Libro' }, where: 'p. 4' }),
    });
    expect(t).toMatch(/^:PROPERTIES:\n:ID: {7}P1\n:END:\n#\+title: Las ideas se conectan\n/);
    expect(t).toContain('#+filetags: :permanente:');
    expect(t).toContain('* Idea\nPrimera línea\n * no es cabecera\n');
    expect(t).toContain('* Enlaces\n- [[id:P2][Otra]]\n');
    expect(t).toContain('* Fuente\n- [[id:C1][Libro]] — p. 4\n');
    expect(sourceLine({ origin: '[[id:X][Diario]]' })).toBe('- [[id:X][Diario]]');
  });
  test('enlaces sugeridos: notas que el texto menciona', () => {
    const nodes = [
      { id: 'A', title: 'Memoria espaciada', aliases: [] },
      { id: 'B', title: 'Otra cosa', aliases: ['repaso'] },
      { id: 'C', title: 'Nada', aliases: [] },
    ];
    const s = suggestLinks('La memoria espaciada pide repaso.', nodes);
    expect(s.map((n) => n.id)).toEqual(['A', 'B']);
    expect(suggestLinks('La memoria espaciada', nodes, ['a'])).toEqual([]);
  });
  test('índice: el enlace va al final de «* Notas»', () => {
    const t = appendToSection(indexText({ id: 'I', title: 'Í' }), 'Notas', '- [[id:P][p]]');
    expect(t).toMatch(/\* Notas\n- \[\[id:P\]\[p\]\]\n$/);
  });
  test('añadir a nota existente: al final de «Idea»', () => {
    const p = note('P', 'P', 'permanente', 'Ya había') + '\n* Enlaces\n';
    const t = appendParagraph(p, 'Lo nuevo');
    expect(t).toContain('* Idea\nYa había\n\nLo nuevo\n');
    expect(appendParagraph('#+title: X\n', 'Otro')).toBe('#+title: X\n\nOtro\n');
  });
});

describe('4.47 Revisión semanal: paso de la Revisión ZK', () => {
  test('apagado no cambia los pasos de Allen; encendido añade uno al final', () => {
    expect(reviewSteps(false)).toBe(REVIEW_STEPS);
    expect(reviewSteps(true)).toBe(STRICT_REVIEW_STEPS);
    const on = reviewSteps(true, { zk: true });
    expect(on).toHaveLength(STRICT_REVIEW_STEPS.length + 1);
    expect(on[on.length - 1].id).toBe('zk');
  });
});
