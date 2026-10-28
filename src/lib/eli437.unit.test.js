// 4.37: backlinks (título una vez, contador), atrás/adelante por enlaces, defectos, menú
import thunk from 'redux-thunk';
import { createStore, applyMiddleware } from 'redux';
import { Map as IMap, Set, fromJS, List } from 'immutable';

import rootReducer from '../reducers';
import { parseFile, setPath, eliFollowOrgLink, eliRestoreView } from '../actions/org';
import {
  headingIndex,
  linkingParagraph,
  linkInTitle,
  backlinkCountOf,
  backlinkCounts,
} from './eli_heading_index';
import { installNavHistory, setViewRestorer, canGoBack, goBack } from './eli_nav_history';
import { effectiveGtdSections, normalizeGtdSections, DEFAULT_SECTIONS } from './gtd/gtd_sections';
import { MENU_ORDER, CONTEXT_TAGS, BASE_DEFAULTS } from './eli_defaults';
import { getMenuLayout } from './eli_menu_layout';
import { readInitialState } from '../util/settings_persister';

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
      base: fromJS({ customKeybindings: {}, isLoading: Set(), shouldLogIntoDrawer: true }),
    },
    applyMiddleware(thunk)
  );
  Object.keys(files).forEach((p) => store.dispatch(parseFile(p, files[p])));
  store.dispatch(setPath(Object.keys(files)[0]));
  return store;
};
const FILES = {
  '/l.org':
    '* Origen\n:PROPERTIES:\n:ID: ORI\n:END:\nAquí enlaza [[id:DST][destino]] y sigue.\n* Ver [[id:DST][destino]] en título\nNotas sin enlace.\n* Destino\n:PROPERTIES:\n:ID: DST\n:END:\n* Otro\n:PROPERTIES:\n:ID: OTR\n:END:\n',
  '/m.org': '* Más\nmira [[id:DST]] y [[id:OTR]]\n',
};
const indexOf = (store) => headingIndex(store.getState().org.present.get('files'));

describe('4.37 Backlinks', () => {
  test('el enlace en el título no se repite como párrafo', () => {
    const idx = indexOf(makeStore(FILES));
    const enTitulo = idx.find((e) => e.title.startsWith('Ver '));
    expect(linkInTitle(enTitulo, 'DST')).toBe(true);
    expect(linkingParagraph(enTitulo, 'DST')).toEqual([]);
    const enNotas = idx.find((e) => e.title === 'Origen');
    expect(linkInTitle(enNotas, 'DST')).toBe(false);
    expect(linkingParagraph(enNotas, 'DST')).toEqual(['Aquí enlaza [[id:DST][destino]] y sigue.']);
  });

  test('mapa id → nº de cabeceras que enlazan (sin contar la propia)', () => {
    const store = makeStore(FILES);
    const files = store.getState().org.present.get('files');
    expect(backlinkCountOf(files, 'DST')).toBe(3);
    expect(backlinkCountOf(files, 'dst')).toBe(3);
    expect(backlinkCountOf(files, 'OTR')).toBe(1);
    expect(backlinkCountOf(files, 'ORI')).toBe(0);
    expect(backlinkCountOf(files, null)).toBe(0);
    // memorizado por `files`: mismo objeto → mismo mapa
    expect(backlinkCounts(files)).toBe(backlinkCounts(files));
  });
});

describe('4.37 Atrás/adelante al seguir enlaces', () => {
  test('seguir un enlace dentro del mismo fichero guarda la vista y atrás la restaura', async () => {
    const store = makeStore(FILES);
    const history = require('history').createMemoryHistory({ initialEntries: ['/file/l.org'] });
    installNavHistory(history);
    const restored = [];
    setViewRestorer((v) => {
      restored.push(v);
      return store.dispatch(eliRestoreView(v));
    });
    const narrowOf = () =>
      store.getState().org.present.getIn(['files', '/l.org', 'narrowedHeaderId']);
    expect(narrowOf()).toBeFalsy();
    await store.dispatch(eliFollowOrgLink('id:DST'));
    expect(history.location.pathname).toBe('/file/l.org');
    expect(history.length).toBeGreaterThan(1);
    expect(narrowOf()).toBeTruthy();
    expect(canGoBack()).toBe(true);
    goBack(history);
    await new Promise((r) => setTimeout(r, 20));
    expect(restored.length).toBe(1);
    expect(narrowOf()).toBeFalsy(); // vuelve al documento entero
    setViewRestorer(null);
  });
});

describe('4.37 Valores por defecto', () => {
  beforeEach(() => localStorage.clear());

  test('instalación nueva: estado inicial = defectos del usuario', () => {
    const base = readInitialState().base;
    expect(base.get('theme')).toBe('Nirvana');
    expect(base.get('colorScheme')).toBe('Light');
    expect(base.get('bulletStyle')).toBe('Triangles');
    expect(base.get('eliSlashMenu')).toBe(true);
    expect(base.get('eliAllOrgFiles')).toBe(true);
    expect(base.get('eliNoSwipeDocs')).toBe(true);
    expect(base.get('orgHabitFollowingDays')).toBe(3);
    expect(base.get('editorDescriptionHeightValue')).toBe('20');
    expect(readInitialState().org.present.get('showClockDisplay')).toBe(true);
    Object.keys(BASE_DEFAULTS).forEach((k) => expect(base.get(k)).toBe(BASE_DEFAULTS[k]));
  });

  test('lo guardado gana (también un «false» frente a un defecto encendido)', () => {
    localStorage.setItem('eliSlashMenu', 'false');
    localStorage.setItem('theme', 'Solarized');
    localStorage.setItem('bulletStyle', 'Fancy');
    const base = readInitialState().base;
    expect(base.get('eliSlashMenu')).toBe(false);
    expect(base.get('theme')).toBe('Solarized');
    expect(base.get('bulletStyle')).toBe('Fancy');
  });

  test('las claves de instancia no tienen defecto', () => {
    const state = readInitialState();
    ['eliExcludedFolders', 'eliPagesFile', 'lastSeenChangelogHash'].forEach((k) =>
      expect(state.base.get(k)).toBeFalsy()
    );
    expect(state.org.present.get('fileSettings')).toEqual(expect.anything());
    expect(
      state.org.present.get('fileSettings').size ||
        state.org.present.get('fileSettings').length ||
        0
    ).toBe(0);
  });

  test('secciones de GTD por defecto: orden, ocultas y contextos', () => {
    const cfg = effectiveGtdSections(IMap());
    const fixed = cfg.order.filter((id) => !id.startsWith('c_') && !id.startsWith('s_'));
    expect(fixed).toEqual([
      'agenda',
      'focus',
      'inbox',
      'next',
      'later',
      'waiting',
      'deadline',
      'someday',
      'scheduled',
      'tickler',
      // (4.48) Agendas y Personas (solo salen si existe su fichero)
      'agendas',
      'persons',
      'reference',
      'projects',
      'horizons',
      'logbook',
      'process',
      'review',
      'trash',
    ]);
    ['deadline', 'reference', 'process', 'review'].forEach((id) =>
      expect(cfg.sections[id].show).toBe(false)
    );
    expect(cfg.sections.horizons.show).toBe(true);
    expect(cfg.custom.map((c) => c.label)).toEqual(CONTEXT_TAGS);
    cfg.custom.forEach((c) => {
      expect(cfg.sections[c.id].states).toEqual(['NEXT']);
      expect(cfg.sections[c.id].tags).toEqual([c.label]);
    });
    expect(cfg.separators.map((x) => x.label)).toEqual(['', 'Contexts']);
    // el separador «Contexts» va justo antes de los contextos
    const iCtx = cfg.order.indexOf('s_defaults_ctx');
    expect(cfg.order[iCtx + 1]).toBe(cfg.custom[0].id);
  });

  test('si ya hay secciones guardadas, no se tocan', () => {
    const saved = fromJS({ sections: { inbox: { show: false } } });
    const cfg = effectiveGtdSections(saved);
    expect(cfg.custom).toEqual([]);
    expect(cfg.sections.inbox.show).toBe(false);
    expect(cfg.sections.deadline.show).toBe(DEFAULT_SECTIONS.deadline.show !== false);
    expect(normalizeGtdSections(null).custom).toEqual([]);
  });

  test('orden por defecto del Menú ☰', () => {
    localStorage.clear();
    expect(getMenuLayout().order).toEqual(MENU_ORDER);
  });
});
