// 4.17: vista Tickler de GTD (agrupar por fecha, fechas rápidas, añadir y cambiar de fecha) y
// entradas nuevas del Menú ☰ (Buscar con B y Capturar).
import thunk from 'redux-thunk';
import { createStore, applyMiddleware } from 'redux';
import { Map, Set, fromJS, List } from 'immutable';

import rootReducer from '../../reducers';
import { parseFile } from '../../actions/org';
import { parseOrg } from '../parse_org';
import { buildTasks } from './gtd_model';
import { gtdTicklerAdd, gtdTicklerReschedule } from './gtd_actions';
import { exportOrg } from '../export_org';
import {
  groupTickler,
  ticklerEntries,
  shiftTicklerDate,
  ticklerMonthChanges,
  toDateInput,
  fromDateInput,
} from './gtd_tickler';
import { normalizeLayout, applyMenuLayout, MENU_ENTRIES } from '../eli_menu_layout';
import { SECTION_IDS, normalizeGtdSections, isSectionShown } from './gtd_sections';

const TODAY = new Date(2026, 9, 22);
const TICKLER = [
  '* *[ TICKLER 2026 ]*',
  '** DICIEMBRE',
  '*** Felicitar a Ana',
  'SCHEDULED: <2026-12-03 Thu>',
  '** NOVIEMBRE',
  '*** Pagar seguro',
  'SCHEDULED: <2026-11-02 Mon>',
  '** OCTUBRE',
  '*** Revisar caldera',
  'SCHEDULED: <2026-10-28 Wed>',
  '*** Llamar a Luis',
  'SCHEDULED: <2026-10-23 Fri>',
  '*** Atrasada',
  'SCHEDULED: <2026-10-20 Tue>',
  '*** Hoy',
  'SCHEDULED: <2026-10-22 Thu>',
  '*** Sin fecha',
  '',
].join('\n');
const tasksOf = (text, path = '/tickler.org') => buildTasks(Map({ [path]: parseOrg(text) }), []);

describe('4.17: Tickler (modelo)', () => {
  const tasks = tasksOf(TICKLER);

  test('ni años ni meses cuentan como entradas', () => {
    expect(ticklerEntries(tasks).map((t) => t.title)).not.toContain('OCTUBRE');
    expect(ticklerEntries(tasks)).toHaveLength(7);
  });

  test('agrupa: hoy (o antes) → mañana → días del mes → meses → sin fecha', () => {
    const g = groupTickler(tasks, TODAY);
    expect(g.map((x) => x.id)).toEqual([
      'today',
      'tomorrow',
      'd28',
      'm2026-10',
      'm2026-11',
      'nodate',
    ]);
    expect(g[0].list.map((t) => t.title)).toEqual(['Atrasada', 'Hoy']);
    expect(g[1].list.map((t) => t.title)).toEqual(['Llamar a Luis']);
    expect(g[3].label).toBe('Noviembre 2026');
  });

  test('fechas rápidas (sin pasar de hoy hacia atrás; 31 + 1 mes = fin de mes)', () => {
    const d = new Date(2026, 9, 28);
    expect(toDateInput(shiftTicklerDate(d, 'day', 1, TODAY))).toBe('2026-10-29');
    expect(toDateInput(shiftTicklerDate(d, 'week', 1, TODAY))).toBe('2026-11-04');
    expect(toDateInput(shiftTicklerDate(d, 'month', 1, TODAY))).toBe('2026-11-28');
    expect(toDateInput(shiftTicklerDate(d, 'week', -1, TODAY))).toBe('2026-10-22');
    expect(toDateInput(shiftTicklerDate(new Date(2027, 0, 31), 'month', 1, TODAY))).toBe(
      '2027-02-28'
    );
    expect(ticklerMonthChanges(d, new Date(2026, 9, 1))).toBe(false);
    expect(ticklerMonthChanges(d, new Date(2026, 10, 1))).toBe(true);
    expect(+fromDateInput('2026-11-04')).toBe(+new Date(2026, 10, 4));
    expect(fromDateInput('')).toBe(null);
  });
});

const makeStore = (path, text) => {
  const store = createStore(
    rootReducer,
    {
      org: {
        past: [],
        present: Map({
          files: Map(),
          fileSettings: [],
          search: Map({ searchFilter: '', searchFilterExpr: [] }),
          bookmarks: Map({ search: List(), 'task-list': List(), refile: List() }),
        }),
        future: [],
      },
      syncBackend: Map({ isAuthenticated: true }),
      capture: Map().set('captureTemplates', []),
      base: new fromJS({ customKeybindings: {}, isLoading: Set(), shouldLogIntoDrawer: true }),
    },
    applyMiddleware(thunk)
  );
  store.dispatch(parseFile(path, text));
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
const storeTasks = (store, path) =>
  buildTasks(
    store
      .getState()
      .org.present.get('files')
      .filter((_f, p) => p === path),
    []
  );

describe('4.17: Tickler (acciones)', () => {
  const P = '/tickler.org';
  const BASE =
    '#+TITLE: Tickler\n* *[ TICKLER 2026 ]*\n** OCTUBRE\n*** Revisar caldera\nSCHEDULED: <2026-10-28 Wed>\n';

  test('añadir: crea el mes que falta y la entrada sin estado con su fecha', () => {
    const store = makeStore(P, BASE);
    expect(store.dispatch(gtdTicklerAdd(P, 'Pagar seguro', new Date(2026, 10, 2)))).toBeTruthy();
    const text = fileText(store, P);
    expect(text).toMatch(/\*\* NOVIEMBRE\n\*\*\* Pagar seguro\n[^*]*SCHEDULED: <2026-11-02/);
    expect(store.dispatch(gtdTicklerAdd(P, '  ', new Date(2026, 10, 2)))).toBe(null);
  });

  test('cambiar de fecha: en el mismo mes solo la fecha; a otro mes, bajo ese mes', () => {
    const store = makeStore(P, BASE);
    let t = storeTasks(store, P).find((x) => x.title === 'Revisar caldera');
    store.dispatch(gtdTicklerReschedule(t, P, new Date(2026, 9, 30)));
    expect(fileText(store, P)).toMatch(
      /\*\* OCTUBRE\n\*\*\* Revisar caldera\nSCHEDULED: <2026-10-30/
    );
    t = storeTasks(store, P).find((x) => x.title === 'Revisar caldera');
    store.dispatch(gtdTicklerReschedule(t, P, new Date(2026, 11, 1)));
    const text = fileText(store, P);
    expect(text).toMatch(/\*\* DICIEMBRE\n\*\*\* Revisar caldera\n[^*]*SCHEDULED: <2026-12-01/);
    expect(text).not.toMatch(/OCTUBRE\n\*\*\* Revisar/);
  });
});

describe('4.17: Menú ☰ y secciones', () => {
  test('Buscar (B) y Capturar son entradas del Menú; con un orden guardado viejo van a su sitio', () => {
    const ids = MENU_ENTRIES.map((e) => e.id);
    expect(ids.slice(0, 3)).toEqual(['find', 'agenda', 'capture']);
    const old = normalizeLayout({ order: ['help', 'search', 'agenda', 'files'], hidden: [] });
    expect(old.order.indexOf('find')).toBeLessThan(old.order.indexOf('search'));
    expect(old.order.indexOf('capture')).toBe(old.order.indexOf('agenda') + 1);
    const items = applyMenuLayout(
      [{ menuId: 'search' }, { menuId: 'capture' }, { menuId: 'find' }],
      normalizeLayout({ hidden: ['capture'] })
    );
    expect(items.map((i) => i.menuId)).toEqual(['find', 'search']);
  });

  test('Tickler: sección de GTD, visible de serie y se puede ocultar', () => {
    expect(SECTION_IDS).toContain('tickler');
    expect(isSectionShown('tickler', normalizeGtdSections(null))).toBe(true);
    const off = normalizeGtdSections({ sections: { tickler: { show: false } } });
    expect(isSectionShown('tickler', off)).toBe(false);
  });
});
