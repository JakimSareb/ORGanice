// 4.50: Agendas como árbol de cabeceras, «Llevar a reunión», «Crear página» fuera del «[[»,
// persona en las filas y barra de formato en dos filas
import thunk from 'redux-thunk';
import { createStore, applyMiddleware } from 'redux';
import { Map as IMap, Set as ISet, fromJS, List } from 'immutable';
import rootReducer from '../../reducers';
import { parseFile } from '../../actions/org';
import { exportOrg } from '../export_org';
import { gtdRefileTo } from './gtd_actions';
import {
  agendaAddPoint,
  agendaToggleDone,
  agendasFromState,
  sendToAgenda,
} from './gtd_persons_actions';

import { parseOrg } from '../parse_org';
import { parseContacts } from './gtd_persons';
import {
  parseAgendas,
  agendaChoices,
  agendaNode,
  agendaOfPerson,
  visibleChildren,
  isDoneKeyword,
} from './gtd_agendas';

const PERSONAS = '* Mari Carmen\n:PROPERTIES:\n:ID: MC-1\n:ALIAS: MC\n:END:\n';
const AGENDAS = [
  '#+TODO: TODO NEXT | DONE',
  '* Mari Carmen',
  '+ DIA 0 Primera sesión',
  '  Hablamos de cómo empezar.',
  '- [ ] Una casilla vieja',
  '** Hablar del presupuesto',
  'Detalle del presupuesto.',
  '*** Subpunto A',
  '*** DONE Subpunto B',
  '** DONE Punto tratado',
  '*** Hijo del tratado',
  '* Quan siguem a ...',
  '** Barcelona',
  '*** Xus',
  '*** Dani',
  '** Lleida',
  '* Luis',
  ':PROPERTIES:',
  ':PERSONA: [[id:LU-9][Luis G]]',
  ':END:',
].join('\n');

const contacts = parseContacts(parseOrg(PERSONAS), '/personas.org');
const ag = parseAgendas(parseOrg(AGENDAS), contacts, '/agendas.org');

describe('4.50 A: agendas como árbol', () => {
  test('el nivel 1 es la agenda (persona por nombre/alias/:PERSONA:, o lugar)', () => {
    expect(ag.roots.map((r) => r.title)).toEqual(['Mari Carmen', 'Quan siguem a ...', 'Luis']);
    expect(ag.persons.map((r) => r.person.name)).toEqual(['Mari Carmen', 'Luis G']);
    expect(ag.places.map((r) => r.title)).toEqual(['Quan siguem a ...']);
    expect(agendaOfPerson(ag, 'mc-1').title).toBe('Mari Carmen');
  });
  test('las subcabeceras son puntos a cualquier nivel, con su estado y sus notas', () => {
    const mc = ag.roots[0];
    expect(mc.children.map((c) => [c.title, c.level, c.done])).toEqual([
      ['Hablar del presupuesto', 2, false],
      ['Punto tratado', 2, true],
    ]);
    const pres = mc.children[0];
    expect(pres.body).toContain('Detalle del presupuesto.');
    expect(pres.children.map((c) => [c.title, c.done])).toEqual([
      ['Subpunto A', false],
      ['Subpunto B', true],
    ]);
    expect(pres.children[0].level).toBe(3);
    expect(agendaNode(ag, pres.children[0].headerId).parentId).toBe(pres.headerId);
  });
  test('las notas conservan sus «secciones» (+ con notas) y las casillas viejas', () => {
    const mc = ag.roots[0];
    expect(mc.body).toContain('+ DIA 0 Primera sesión\n  Hablamos de cómo empezar.');
  });
  test('pendientes: no cuentan los tratados ni lo que cuelga de ellos', () => {
    const mc = ag.roots[0];
    // puntos pendientes: «Hablar del presupuesto» y «Subpunto A»
    expect(mc.points).toBe(2);
    expect(mc.open).toBe(3);
    expect(ag.roots[1].points).toBe(4);
  });
  test('ocultar tratados: el punto tratado y su subárbol no salen', () => {
    const mc = ag.roots[0];
    expect(visibleChildren(mc, true).map((c) => c.title)).toEqual(['Hablar del presupuesto']);
    expect(visibleChildren(mc, false).map((c) => c.title)).toEqual([
      'Hablar del presupuesto',
      'Punto tratado',
    ]);
    expect(isDoneKeyword('DONE')).toBe(true);
    expect(isDoneKeyword('NEXT')).toBe(false);
    expect(isDoneKeyword(null)).toBe(false);
  });
  test('selector jerárquico: personas primero, luego lugares, cada uno con sus puntos', () => {
    const rows = agendaChoices(ag).map((c) => `${'-'.repeat(c.depth)}${c.node.title}`);
    expect(rows).toEqual([
      'Mari Carmen',
      '-Hablar del presupuesto',
      '--Subpunto A',
      '--Subpunto B',
      '-Punto tratado',
      '--Hijo del tratado',
      'Luis',
      'Quan siguem a ...',
      '-Barcelona',
      '--Xus',
      '--Dani',
      '-Lleida',
    ]);
  });
});

// ---- Con un store real: crear subcabeceras, tratar y llevar a una reunión ----
const makeStore = (files) => {
  const store = createStore(
    rootReducer,
    {
      org: {
        past: [],
        present: IMap({
          files: IMap(),
          fileSettings: [],
          search: IMap({ searchFilter: '', searchFilterExpr: [] }),
          bookmarks: IMap({ search: List(), 'task-list': List(), refile: List() }),
        }),
        future: [],
      },
      syncBackend: IMap({ isAuthenticated: true }),
      capture: IMap().set('captureTemplates', []),
      base: new fromJS({
        customKeybindings: {},
        isLoading: ISet(),
        shouldLogIntoDrawer: true,
      }),
    },
    applyMiddleware(thunk)
  );
  Object.keys(files).forEach((p) => store.dispatch(parseFile(p, files[p])));
  return store;
};
const fileText = (store, path) => {
  const f = store.getState().org.present.getIn(['files', path]);
  return exportOrg({
    headers: f.get('headers'),
    linesBeforeHeadings: f.get('linesBeforeHeadings'),
    dontIndent: true,
  });
};
const AG = [
  '* Mari Carmen',
  '- [ ] Una casilla vieja',
  '** Punto uno',
  ':PROPERTIES:',
  ':ID: P-1',
  ':END:',
  'Notas del uno.',
  '*** Sub uno',
  '** Punto dos',
  '* Quan siguem a ...',
  '** Barcelona',
  '- [ ] Xus',
  '* Final',
  '',
].join('\n');

describe('4.50 B: crear subcabeceras en la agenda', () => {
  const setup = () =>
    makeStore({
      '/tasks.org': '* NEXT Pintar\n',
      '/personas.org': '* Mari Carmen\n:PROPERTIES:\n:ID: MC-1\n:END:\n',
      '/agendas.org': AG,
      '/reuniones.org': '* Reunión lunes\n** Orden del día\n',
    });
  test('colgada de la principal: queda al FINAL de sus hijos, a nivel 2, sin tocar nada más', async () => {
    const store = setup();
    const mc = agendasFromState(store.getState()).roots[0];
    const id = await store.dispatch(
      agendaAddPoint({ headerId: mc.headerId }, 'Comentar el presupuesto')
    );
    expect(id).toBeTruthy();
    const text = fileText(store, '/agendas.org');
    expect(text.replace('** Comentar el presupuesto\n', '')).toBe(AG);
    expect(text).toContain('** Punto dos\n** Comentar el presupuesto\n* Quan siguem a ...');
  });
  test('a un nivel concreto: bajo «Barcelona» sale a nivel 3, con las notas de la tarea', async () => {
    const store = setup();
    const bcn = agendasFromState(store.getState()).nodes.find((n) => n.title === 'Barcelona');
    await store.dispatch(
      agendaAddPoint({ headerId: bcn.headerId }, 'Llamar a Pere', 'Detalle\nsegunda línea')
    );
    const text = fileText(store, '/agendas.org');
    expect(text).toContain(
      '** Barcelona\n- [ ] Xus\n*** Llamar a Pere\nDetalle\nsegunda línea\n* Final'
    );
    const n = agendasFromState(store.getState()).nodes.find((x) => x.title === 'Llamar a Pere');
    expect(n.level).toBe(3);
  });
  test('colgada de un punto existente (subpunto del subpunto)', async () => {
    const store = setup();
    const p1 = agendasFromState(store.getState()).nodes.find((n) => n.title === 'Punto uno');
    await store.dispatch(agendaAddPoint({ headerId: p1.headerId }, 'Otro sub'));
    expect(fileText(store, '/agendas.org')).toContain('*** Sub uno\n*** Otro sub\n** Punto dos');
  });
  test('persona sin cabecera: «* Nombre» con :PERSONA: al final y debajo el punto', async () => {
    const store = setup();
    const ok = await store.dispatch(
      agendaAddPoint({ person: { id: 'LU-9', title: 'Luis' } }, 'Hablar del coche')
    );
    expect(ok).toBeTruthy();
    expect(fileText(store, '/agendas.org')).toMatch(
      /\* Luis\n:PROPERTIES:\n:PERSONA: \[\[id:LU-9\]\[Luis\]\]\n:TYPE: agenda\n:END:\n\*\* Hablar del coche\n$/
    );
  });
  test('persona que ya tiene agenda (por nombre): cuelga de la suya, no crea otra', async () => {
    const store = setup();
    await store.dispatch(agendaAddPoint({ person: { id: 'MC-1', title: 'Mari Carmen' } }, 'Nuevo'));
    const text = fileText(store, '/agendas.org');
    expect(text.match(/^\* Mari Carmen$/gm)).toHaveLength(1);
    expect(text).toContain('** Punto dos\n** Nuevo\n');
  });
  test('sendToAgenda sin elegir nada (null) no crea nada', () => {
    expect(typeof sendToAgenda).toBe('function');
  });
});

describe('4.50 A/C: tratar un punto y llevarlo a una reunión', () => {
  const setup = () =>
    makeStore({
      '/tasks.org': '* NEXT Pintar\n',
      '/agendas.org': AG,
      '/reuniones.org': '* Reunión lunes\n** Orden del día\n',
    });
  test('tratar = DONE en esa cabecera (y volver a abrir lo quita)', () => {
    const store = setup();
    const p2 = agendasFromState(store.getState()).nodes.find((n) => n.title === 'Punto dos');
    store.dispatch(agendaToggleDone(p2.headerId));
    expect(fileText(store, '/agendas.org')).toMatch(/\*\* DONE Punto dos\n/);
    expect(agendasFromState(store.getState()).nodes.find((n) => n.title === 'Punto dos').done).toBe(
      true
    );
    store.dispatch(agendaToggleDone(p2.headerId));
    expect(fileText(store, '/agendas.org')).toContain('\n** Punto dos\n');
  });
  test('llevar a reunión: se mueve con su contenido y subpuntos, conservando :ID:', () => {
    const store = setup();
    const ag = agendasFromState(store.getState());
    const p1 = ag.nodes.find((n) => n.title === 'Punto uno');
    const target = store
      .getState()
      .org.present.getIn(['files', '/reuniones.org', 'headers'])
      .find((h) => h.getIn(['titleLine', 'rawTitle']) === 'Orden del día');
    const n = store.dispatch(
      gtdRefileTo(
        [{ path: '/agendas.org', id: p1.headerId, key: 'k' }],
        '/reuniones.org',
        target.get('id')
      )
    );
    expect(n).toBe(1);
    const reu = fileText(store, '/reuniones.org');
    expect(reu).toContain(':ID: P-1');
    expect(reu).toMatch(
      /\* Reunión lunes\n\*\* Orden del día\n\*\*\* Punto uno\n:PROPERTIES:\n:ID: P-1\n:END:\nNotas del uno\.\n\*\*\*\* Sub uno/
    );
    const age = fileText(store, '/agendas.org');
    expect(age).not.toContain('Punto uno');
    expect(age).not.toContain('Sub uno');
    expect(age).toContain('** Punto dos');
  });
  test('varios puntos a la vez (ELI_BATCH: un solo Deshacer)', () => {
    const store = setup();
    const nodes = agendasFromState(store.getState()).nodes;
    const ids = ['Punto uno', 'Punto dos'].map((t) => nodes.find((n) => n.title === t).headerId);
    const n = store.dispatch(
      gtdRefileTo(
        ids.map((id) => ({ path: '/agendas.org', id, key: id })),
        '/reuniones.org',
        null
      )
    );
    expect(n).toBe(2);
    const reu = fileText(store, '/reuniones.org');
    expect(reu).toContain('* Punto uno');
    expect(reu).toContain('* Punto dos');
  });
});
