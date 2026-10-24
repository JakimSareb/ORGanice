import { Map } from 'immutable';
import { parseOrg } from '../parse_org';
import { buildTasks } from './gtd_model';
import { rowPropsEqual, ROW_FN_PROPS } from './gtd_rowmemo';

const HEAD = '#+TODO: TODO NEXT WAITING PROJECT | DONE CANCELLED\n';
const fileA = parseOrg(HEAD + '* NEXT Uno\n* TODO Dos\n');
const fileB = parseOrg(HEAD + '* PROJECT Proyecto\n:PROPERTIES:\n:ID: abc\n:END:\n');
const fileC = parseOrg(
  HEAD + '* NEXT Enlazada\n:PROPERTIES:\n:PROYECTO: [[id:abc][Proyecto]]\n:END:\n'
);

describe('4.25: buildTasks con caché por contenido', () => {
  test('mismo contenido = la MISMA lista (aunque cambie isDirty)', () => {
    const files = Map({ '/a.org': fileA, '/b.org': fileB });
    const first = buildTasks(files, []);
    const dirty = files.setIn(['/a.org', 'isDirty'], true);
    expect(buildTasks(dirty, [])).toBe(first);
  });

  test('cambiar las cabeceras = lista nueva con lo nuevo', () => {
    const files = Map({ '/a.org': fileA });
    const first = buildTasks(files, []);
    const changed = files.set('/a.org', parseOrg(HEAD + '* NEXT Uno\n* TODO Tres\n'));
    const second = buildTasks(changed, []);
    expect(second).not.toBe(first);
    expect(second.map((t) => t.title)).toEqual(['Uno', 'Tres']);
  });

  test('Inbox o no: cada variante su resultado, sin pisarse', () => {
    const files = Map({ '/a.org': fileA });
    const asInbox = buildTasks(files, ['/a.org']);
    const plain = buildTasks(files, []);
    expect(asInbox[0].isInboxFile).toBe(true);
    expect(plain[0].isInboxFile).toBe(false);
    expect(buildTasks(files, ['/a.org'])).toBe(asInbox);
    expect(buildTasks(files, [])).toBe(plain);
  });

  test('los enlaces :PROYECTO: se siguen resolviendo', () => {
    const files = Map({ '/b.org': fileB, '/c.org': fileC });
    const t = buildTasks(files, []).find((x) => x.title === 'Enlazada');
    expect(t.project && t.project.title).toBe('Proyecto');
    // otro fichero añadido: la tarea enlazada sigue con su proyecto
    const more = buildTasks(files.set('/a.org', fileA), []);
    expect(more.find((x) => x.title === 'Enlazada').project.title).toBe('Proyecto');
  });

  test('misma ruta de las cabeceras en otro fichero = sin mezclar', () => {
    const one = buildTasks(Map({ '/a.org': fileA }), []);
    const other = buildTasks(Map({ '/z.org': fileA }), []);
    expect(other[0].path).toBe('/z.org');
    expect(one[0].path).toBe('/a.org');
  });
});

describe('4.25: filas memorizadas', () => {
  const f = () => {};
  test('iguales si solo cambian las funciones', () => {
    expect(rowPropsEqual({ task: 1, onRowClick: f }, { task: 1, onRowClick: () => {} })).toBe(true);
  });
  test('distintas si cambia un dato o si una función pasa a no existir', () => {
    expect(rowPropsEqual({ task: 1, isSelected: false }, { task: 1, isSelected: true })).toBe(
      false
    );
    expect(rowPropsEqual({ task: 1, onGoProject: f }, { task: 1, onGoProject: null })).toBe(false);
    expect(rowPropsEqual({ task: 1 }, { task: 2 })).toBe(false);
  });
  test('lista de funciones de la fila', () => {
    expect(ROW_FN_PROPS).toContain('onToggleDone');
    expect(ROW_FN_PROPS).toContain('onCycleNotes');
  });
});
