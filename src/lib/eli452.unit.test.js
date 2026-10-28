// 4.52: selector de destino navegable, Someday/Referencia con destino
import thunk from 'redux-thunk';
import { createStore, applyMiddleware } from 'redux';
import { Map as IMap, Set, fromJS, List } from 'immutable';

import rootReducer from '../reducers';
import { parseFile, setPath } from '../actions/org';
import { headingIndex } from './eli_heading_index';
import {
  askRefileTarget,
  crumbsFor,
  levelRows,
  normalizePaths,
  orderFilePaths,
  rememberTarget,
  recentTargets,
  clearRecentTargets,
  searchRows,
} from './eli_refile_picker';
import { gtdSaveTask, gtdMoveToProject } from './gtd/gtd_actions';
import { gtdSendTo } from './gtd/gtd_sendto';
import { buildTasks, listOf } from './gtd/gtd_model';
import { exportOrg } from './export_org';

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
const fileText = (store, path) => {
  const f = store.getState().org.present.getIn(['files', path]);
  return exportOrg({
    headers: f.get('headers'),
    linesBeforeHeadings: f.get('linesBeforeHeadings'),
    dontIndent: true,
  });
};
const tasksOf = (store) => buildTasks(store.getState().org.present.get('files'), []);

const TASKS = '/tasks.org';
const NOTES = '/zk/notas.org';
const INBOX = '/inbox.org';
const TASKS_TEXT =
  '#+TODO: TODO NEXT WAITING MAYBE PROJECT | DONE CANCELLED\n* PROJECT Reforma\n:PROPERTIES:\n:ID: p-1\n:END:\n** NEXT Pedir presupuesto\n* TODO Otra\n';
const NOTES_TEXT = '* Cocina\n** Armarios\n*** Pomos\n** Suelo\n* Baño\n';
const INBOX_TEXT = '* Idea de pomos :@inbox:\n:PROPERTIES:\n:ID: idea-1\n:END:\nNotas de la idea\n';

test('orden de ficheros: GTD, wiki y el resto; sin backups ni internos', () => {
  const paths = [
    '/z/otro.org',
    '/a/otro.org',
    '/wiki/referencia.org',
    '/tasks.org',
    '/backups/x.org',
    '/__interno.org',
    '/foto.png',
    '/inbox.org',
  ];
  expect(normalizePaths(paths)).toEqual([
    '/a/otro.org',
    '/inbox.org',
    '/tasks.org',
    '/wiki/referencia.org',
    '/z/otro.org',
  ]);
  const out = orderFilePaths(paths, {
    gtdPaths: ['/tasks.org', '/inbox.org'],
    wikiPaths: ['/wiki/referencia.org'],
  });
  expect(out.map((f) => f.path)).toEqual([
    '/inbox.org',
    '/tasks.org',
    '/wiki/referencia.org',
    '/a/otro.org',
    '/z/otro.org',
  ]);
  expect(out.map((f) => f.group)).toEqual(['gtd', 'gtd', 'wiki', '', '']);
});

test('niveles, migas y búsqueda entre ficheros', () => {
  const store = makeStore({ [TASKS]: TASKS_TEXT, [NOTES]: NOTES_TEXT });
  const index = headingIndex(store.getState().org.present.get('files'));
  const top = levelRows(index, NOTES, null);
  expect(top.map((r) => [r.entry.title, r.hasKids])).toEqual([
    ['Cocina', true],
    ['Baño', false],
  ]);
  const kids = levelRows(index, NOTES, top[0].entry);
  expect(kids.map((r) => [r.entry.title, r.hasKids])).toEqual([
    ['Armarios', true],
    ['Suelo', false],
  ]);
  const deep = levelRows(index, NOTES, kids[0].entry);
  expect(deep.map((r) => r.entry.title)).toEqual(['Pomos']);
  expect(crumbsFor(NOTES, [top[0].entry, kids[0].entry]).map((c) => c.label)).toEqual([
    'Ficheros',
    'notas.org',
    'Cocina',
    'Armarios',
  ]);
  const files = orderFilePaths([TASKS, NOTES], {});
  const res = searchRows(index, files, 'pomos');
  expect(res.entries.map((e) => e.title)).toEqual(['Pomos']);
  expect(searchRows(index, files, 'notas').files.map((f) => f.path)).toEqual([NOTES]);
});

test('recientes: 5 como mucho, sin repetir, el último primero', () => {
  clearRecentTargets();
  for (let i = 0; i < 7; i++) rememberTarget({ path: `/f${i}.org`, headerId: 'h', title: `T${i}` });
  rememberTarget({ path: '/f5.org', headerId: 'h', title: 'T5' });
  const r = recentTargets();
  expect(r).toHaveLength(5);
  expect(r[0].path).toBe('/f5.org');
  expect(r.filter((x) => x.path === '/f5.org')).toHaveLength(1);
  clearRecentTargets();
});

test('Someday dentro de un proyecto: sale en Someday (no en Next) y queda en el proyecto', () => {
  const store = makeStore({ [TASKS]: TASKS_TEXT, [INBOX]: INBOX_TEXT });
  const idea = tasksOf(store).find((t) => t.title === 'Idea de pomos');
  const proj = tasksOf(store).find((t) => t.isProject);
  store.dispatch(gtdSaveTask(idea, { list: 'someday', tags: [] }));
  const saved = tasksOf(store).find((t) => t.title === 'Idea de pomos');
  store.dispatch(
    gtdMoveToProject({ path: saved.path, id: saved.id }, { path: proj.path, id: proj.id })
  );
  const now = tasksOf(store).find((t) => t.title === 'Idea de pomos');
  expect(now.path).toBe(TASKS);
  expect(listOf(now)).toBe('someday');
  expect(now.project && now.project.title).toBe('Reforma');
  expect(fileText(store, TASKS)).toContain('** MAYBE Idea de pomos');
});

test('Referencia a una cabecera de otro fichero: conserva el :ID: y no toca el resto', () => {
  const store = makeStore({ [INBOX]: INBOX_TEXT, [NOTES]: NOTES_TEXT });
  const idea = tasksOf(store).find((t) => t.title === 'Idea de pomos');
  const headers = store.getState().org.present.getIn(['files', NOTES, 'headers']);
  const suelo = headers.find((h) => h.getIn(['titleLine', 'rawTitle']) === 'Suelo').get('id');
  const r = store.dispatch(gtdSendTo(idea, NOTES, suelo));
  expect(r.moved).toBeTruthy();
  const notes = fileText(store, NOTES);
  expect(notes).toContain('*** Idea de pomos');
  expect(notes).toContain(':ID: idea-1');
  expect(notes).toContain('Notas de la idea');
  expect(notes.replace(/\*\*\* Idea de pomos[\s\S]*?Notas de la idea\n/, '')).toBe(NOTES_TEXT);
  expect(fileText(store, INBOX)).not.toContain('Idea de pomos');
});

describe('diálogo del selector', () => {
  const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  const q = (id) => Array.from(document.querySelectorAll(`[data-testid="${id}"]`));
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const fileRow = (name) => q('eli-refile-file').find((b) => b.textContent.startsWith(name));
  afterEach(() => {
    document.body.innerHTML = '';
  });

  const open = (extra = {}) => {
    const store = makeStore({ [TASKS]: TASKS_TEXT, [NOTES]: NOTES_TEXT });
    const loaded = [];
    const files = orderFilePaths([TASKS, NOTES, '/sin/abrir.org'], { gtdPaths: [TASKS] });
    const p = askRefileTarget({
      title: 'Enviar a',
      files,
      getIndex: () => headingIndex(store.getState().org.present.get('files'), { skipDiary: true }),
      ensureLoaded: async (path) => {
        loaded.push(path);
        return !!store.getState().org.present.getIn(['files', path, 'headers']);
      },
      ...extra,
    });
    return { p, loaded };
  };

  test('lista todos los ficheros, entra, baja dos niveles y elige', async () => {
    clearRecentTargets();
    const { p, loaded } = open();
    await tick();
    expect(
      q('eli-refile-file')
        .map((b) => b.textContent.split(/\d| sin/)[0].replace(/(\.org).*/, '$1'))
        .sort()
    ).toEqual(['abrir.org', 'notas.org', 'tasks.org']);
    click(fileRow('notas.org'));
    await tick();
    expect(loaded).toContain(NOTES);
    expect(q('eli-refile-here')[0].textContent).toContain('Elegir este fichero');
    // Cocina › Armarios
    click(q('eli-refile-enter')[0]);
    await tick();
    click(q('eli-refile-enter')[0]);
    await tick();
    expect(q('eli-refile-crumb').map((b) => b.textContent)).toEqual([
      'Ficheros',
      'notas.org',
      'Cocina',
      'Armarios',
    ]);
    click(q('eli-refile-entry')[0]); // Pomos
    const t = await p;
    expect(t.path).toBe(NOTES);
    expect(t.title).toBe('Pomos');
    expect(t.headerId).toBeTruthy();
    expect(recentTargets()[0].title).toBe('Pomos');
    clearRecentTargets();
  });

  test('migas suben; buscador encuentra cabeceras de varios ficheros; Cancelar → null', async () => {
    const { p } = open();
    await tick();
    click(fileRow('notas.org'));
    await tick();
    click(q('eli-refile-enter')[0]);
    await tick();
    click(q('eli-refile-crumb')[1]); // notas.org
    await tick();
    expect(q('eli-refile-entry').map((b) => b.textContent)).toEqual(['Cocina', 'Baño']);
    click(q('eli-refile-crumb')[0]); // Ficheros
    await tick();
    const input = q('eli-refile-search')[0];
    input.value = 'presupuesto';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    expect(q('eli-refile-entry').map((b) => b.textContent)).toEqual([
      expect.stringContaining('Pedir presupuesto'),
    ]);
    document.querySelector('.eli-prompt__cancel').click();
    expect(await p).toBeNull();
  });

  test('un fichero que no se puede abrir no se elige; atajo de la wiki devuelve el fichero', async () => {
    const { p } = open({
      shortcuts: [
        { label: 'Wiki › Referencia', path: NOTES, headerId: null, title: 'Wiki › Referencia' },
      ],
    });
    await tick();
    click(fileRow('abrir.org')); // sin abrir → no carga
    await tick();
    expect(document.querySelector('[data-testid="eli-refile-pick"]').textContent).toContain(
      'No se ha podido abrir'
    );
    click(q('eli-refile-shortcut')[0]);
    const t = await p;
    expect(t).toEqual({ path: NOTES, headerId: null, title: 'Wiki › Referencia' });
  });
});

describe('Procesar Inbox: tarjetas nuevas', () => {
  const React = require('react');
  const { render, screen, fireEvent, cleanup } = require('@testing-library/react');
  const GtdProcessInbox = require('../components/Gtd/GtdProcessInbox').default;
  afterEach(cleanup);
  const task = { key: 'k', title: 'Idea', path: '/inbox.org' };
  const mount = (props = {}) => {
    const onDecide = jest.fn();
    render(
      React.createElement(GtdProcessInbox, {
        task,
        index: 0,
        total: 1,
        mode: 'one',
        areas: [],
        today: new Date(2026, 9, 28),
        projects: [{ key: 'p', title: 'Reforma' }],
        onDecide,
        onSkip: () => {},
        onBack: () => {},
        onFinish: () => {},
        onOpenTask: () => {},
        ...props,
      })
    );
    return onDecide;
  };
  const opt = (text) =>
    screen.getAllByTestId('gtd-proc-opt').find((b) => b.textContent.includes(text));
  const toNoAction = () => fireEvent.click(opt('No'));

  test('Someday pregunta por el proyecto; «No» = Someday suelto; «Sí» → proyecto elegido', () => {
    const onDecide = mount();
    toNoAction();
    fireEvent.click(opt('Someday'));
    expect(screen.getByTestId('gtd-process-question').textContent).toBe(
      '¿Pertenece a algún proyecto?'
    );
    fireEvent.click(opt('uno que ya existe'));
    fireEvent.change(screen.getByTestId('gtd-proc-project-pick'), { target: { value: 'p' } });
    fireEvent.click(opt('Continuar'));
    expect(onDecide).toHaveBeenCalledWith({ kind: 'someday', project: { key: 'p' } });
    // atrás vuelve a la pregunta anterior
    fireEvent.click(screen.getByTestId('gtd-process-back'));
    expect(screen.getByTestId('gtd-process-question').textContent).toBe(
      '¿Pertenece a algún proyecto?'
    );
    fireEvent.click(opt('No'));
    expect(onDecide).toHaveBeenLastCalledWith({ kind: 'someday' });
  });

  test('Referencia: proyecto, cabecera, dejar, y «Abrir y terminar de editar» con su estado', async () => {
    const dest = { path: '/zk/n.org', headerId: 'h', title: 'Suelo' };
    const onEditFile = jest.fn();
    const onDecide = mount({ onPickDest: async () => dest, onEditFile });
    toNoAction();
    fireEvent.click(opt('Referencia'));
    expect(screen.getByTestId('gtd-process-question').textContent).toBe(
      '¿Dónde guardo esta referencia?'
    );
    fireEvent.click(opt('Enviar a una cabecera'));
    await new Promise((r) => setTimeout(r, 0));
    expect(onDecide).toHaveBeenCalledWith({ kind: 'reference', dest });
    fireEvent.click(opt('Dejar en Referencia'));
    expect(onDecide).toHaveBeenLastCalledWith({ kind: 'reference' });
    fireEvent.click(opt('Abrir y terminar de editar'));
    expect(onEditFile).toHaveBeenCalledTimes(1);
    expect(onEditFile.mock.calls[0][1].step).toBe('refdest');
    fireEvent.click(opt('Proyecto…'));
    fireEvent.change(screen.getByTestId('gtd-proc-project-pick'), { target: { value: 'p' } });
    fireEvent.click(opt('Continuar'));
    expect(onDecide).toHaveBeenLastCalledWith({ kind: 'reference', project: { key: 'p' } });
  });

  test('al volver de editar el fichero sigue en la misma pregunta', () => {
    mount({
      onEditFile: () => {},
      restore: {
        step: 'refdest',
        hist: ['action', 'noaction'],
        base: null,
        nextTitle: 'Idea',
        person: null,
      },
    });
    expect(screen.getByTestId('gtd-process-question').textContent).toBe(
      '¿Dónde guardo esta referencia?'
    );
    fireEvent.click(screen.getByTestId('gtd-process-back'));
    expect(screen.getByTestId('gtd-process-question').textContent).toBe('¿Qué hago con ella?');
  });
});
