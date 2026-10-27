// 4.36: cabecera reducida plegable, enlace → narrow, Focus del proyecto, ajuste del hueco tras
// cabeceras, filtros / etiquetas / fechas de los backlinks, texto renderizado, lo que se imprime,
// subcabeceras del usuario bajo un día del diario
import React from 'react';
import thunk from 'redux-thunk';
import { createStore, applyMiddleware } from 'redux';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { render, fireEvent } from '@testing-library/react';
import { Map as IMap, Set, fromJS, List } from 'immutable';

import rootReducer from '../reducers';
import {
  parseFile,
  setPath,
  narrowHeader,
  toggleHeaderOpened,
  eliFollowOrgLink,
} from '../actions/org';
import {
  headingIndex,
  backlinkEntries,
  filterBacklinks,
  tagsOf,
  entryDate,
  sortByDate,
  anyDated,
  linkingParagraph,
} from './eli_heading_index';
import { applyBacklinksView, serializeBacklinks, normalizeOrder } from './eli_backlinks_view';
import { getGapHeaders, setGapHeaders } from './eli_gap_headers';
import { gtdToggleStar } from './gtd/gtd_actions';
import { buildTasks } from './gtd/gtd_model';
import { parseDays, daysWithEntries, dayHasData } from './eli_diary';
import { exportOrg } from './export_org';
import { OrgText, OrgTitle } from '../components/EliHeadingViews/OrgRender';
import { EliNarrowRefs } from '../components/EliHeadingViews';
import { getBacklinksSnapshot, backlinksKey, setHvFilters } from './eli_backlinks_view';

const makeStore = (files) => {
  const store = createStore(
    rootReducer,
    {
      org: {
        past: [],
        present: IMap({
          files: IMap(),
          fileSettings: List(),
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
const headersOf = (store, path) => store.getState().org.present.getIn(['files', path, 'headers']);
const byTitle = (store, path, title) =>
  headersOf(store, path).find((h) => h.getIn(['titleLine', 'rawTitle']) === title);
const idOf = (store, path, title) => byTitle(store, path, title).get('id');
const openedOf = (store, path, title) => byTitle(store, path, title).get('opened');
const fileText = (store, path) => {
  const f = store.getState().org.present.getIn(['files', path]);
  return exportOrg({
    headers: f.get('headers'),
    linesBeforeHeadings: f.get('linesBeforeHeadings'),
    dontIndent: true,
  });
};

test('la cabecera reducida se pliega y se despliega todas las veces', () => {
  const store = makeStore({ '/n.org': '* Raíz\nnota\n** Hija A\n** Hija B\n' });
  const path = '/n.org';
  const raiz = idOf(store, path, 'Raíz');
  store.dispatch({ type: 'ELI_SET_ALL_OPENED', opened: true });
  store.dispatch(narrowHeader(raiz));
  // al entrar se despliega una vez, con las subcabeceras plegadas
  expect(openedOf(store, path, 'Raíz')).toBe(true);
  expect(openedOf(store, path, 'Hija A')).toBe(false);
  const seq = [];
  for (let i = 0; i < 4; i++) {
    store.dispatch(toggleHeaderOpened(raiz, false));
    seq.push(openedOf(store, path, 'Raíz'));
  }
  expect(seq).toEqual([false, true, false, true]);
  // sigue reducida todo el rato
  expect(store.getState().org.present.getIn(['files', path, 'narrowedHeaderId'])).toBe(raiz);
});

test('narrow desde cerrada: se abre una vez y luego se pliega', () => {
  const store = makeStore({ '/n.org': '* Raíz\nnota\n** Hija\n' });
  const raiz = idOf(store, '/n.org', 'Raíz');
  expect(openedOf(store, '/n.org', 'Raíz')).toBeFalsy();
  store.dispatch(narrowHeader(raiz));
  expect(openedOf(store, '/n.org', 'Raíz')).toBe(true);
  store.dispatch(toggleHeaderOpened(raiz, false));
  expect(openedOf(store, '/n.org', 'Raíz')).toBe(false);
});

test('seguir un enlace [[id:…]] abre la cabecera de destino en narrow', async () => {
  const store = makeStore({
    '/a.org': '* Origen\nVer [[id:DEST][destino]]\n',
    '/b.org': '* Destino\n:PROPERTIES:\n:ID: DEST\n:END:\nnotas\n** Hija\n',
  });
  const ok = await store.dispatch(eliFollowOrgLink('id:DEST'));
  expect(ok).toBe(true);
  const f = store.getState().org.present.getIn(['files', '/b.org']);
  expect(f.get('narrowedHeaderId')).toBe(idOf(store, '/b.org', 'Destino'));
  expect(openedOf(store, '/b.org', 'Destino')).toBe(true);
  expect(openedOf(store, '/b.org', 'Hija')).toBe(false);
  // el enlace a un fichero no cambia: sin cabecera, no reduce
  await store.dispatch(eliFollowOrgLink('file:b.org'));
  const g = store.getState().org.present.getIn(['files', '/b.org']);
  expect(g.get('narrowedHeaderId')).toBe(f.get('narrowedHeaderId'));
});

test('Focus del proyecto: la estrella alterna [#A] con la misma acción que las tareas', () => {
  const store = makeStore({
    '/t.org': '* PROJECT Casa\n:PROPERTIES:\n:ID: P1\n:END:\n** NEXT Pintar\n',
  });
  const files = () => store.getState().org.present.get('files');
  const proj = () => buildTasks(files(), []).find((t) => t.title === 'Casa');
  expect(proj().priority).toBeFalsy();
  store.dispatch(gtdToggleStar(proj()));
  expect(proj().priority).toBe('A');
  expect(fileText(store, '/t.org')).toMatch(/\* PROJECT \[#A\] Casa/);
  store.dispatch(gtdToggleStar(proj()));
  expect(proj().priority).toBeFalsy();
});

test('espacio tras cada cabecera: encendido por defecto, clave y clase en <body>', () => {
  window.localStorage.removeItem('eliGapHeaders');
  expect(getGapHeaders()).toBe(true);
  setGapHeaders(false);
  expect(window.localStorage.getItem('eliGapHeaders')).toBe('off');
  expect(document.body.classList.contains('eli-gap-headers')).toBe(false);
  expect(getGapHeaders()).toBe(false);
  setGapHeaders(true);
  expect(window.localStorage.getItem('eliGapHeaders')).toBeNull();
  expect(document.body.classList.contains('eli-gap-headers')).toBe(true);
});

const BACK = {
  '/dest.org': '* Destino\n:PROPERTIES:\n:ID: DEST\n:END:\n',
  '/uno.org':
    '* Uno :work:\n:PROPERTIES:\n:CREATED: [2026-03-01 Sun 10:00]\n:END:\nPrimero.\n\nVer [[id:DEST][destino]] ya.\n',
  '/dos.org': '* TODO Dos :home:\nCLOSED: [2026-05-02 Sat 09:00]\nVer [[id:DEST]]\n',
  '/tres.org': '* Tres :work:\nVer [[id:DEST]] el [2026-01-15 Thu]\n',
  '/cuatro.org': '* Cuatro :work:\nVer [[id:DEST]]\n',
  '/cinco.org_archive': '* Cinco :work:\nVer [[id:DEST]]\n',
  '/diari-2026.org':
    '* 2026-10 octubre\n** 2026-10-20 martes\n:PROPERTIES:\n:ID: diari-2026-10-20\n:END:\n*** Apunte :diario:\nVer [[id:DEST]]\n',
};

test('backlinks: filtros, etiquetas y fechas (funciones puras)', () => {
  const store = makeStore(BACK);
  const index = headingIndex(store.getState().org.present.get('files'));
  const refs = backlinkEntries(index, 'DEST');
  expect(refs.map((e) => e.title).sort()).toEqual(
    ['Apunte', 'Cinco', 'Cuatro', 'Dos', 'Tres', 'Uno'].sort()
  );
  const t = (list) => list.map((e) => e.title).sort();
  expect(t(filterBacklinks(refs, { hideArchived: true }))).not.toContain('Cinco');
  expect(t(filterBacklinks(refs, { hideTasks: true }))).not.toContain('Dos');
  expect(t(filterBacklinks(refs, { tags: ['work'] }))).toEqual(['Cinco', 'Cuatro', 'Tres', 'Uno']);
  // varias etiquetas = Y
  expect(filterBacklinks(refs, { tags: ['work', 'home'] })).toHaveLength(0);
  // heredadas: «Apunte» hereda de su madre (no tiene etiquetas propias de ella); sin heredadas
  // solo cuentan las propias
  expect(t(filterBacklinks(refs, { tags: ['diario'], inherited: false }))).toEqual(['Apunte']);
  const chips = tagsOf(refs);
  expect(chips.find((c) => c.tag === 'work').count).toBe(4);
  expect(chips[0].tag).toBe('work');
});

test('backlinks: fecha (CREATED › CLOSED › día del diario › primer timestamp) y orden', () => {
  const store = makeStore(BACK);
  const index = headingIndex(store.getState().org.present.get('files'));
  const refs = backlinkEntries(index, 'DEST');
  const by = (title) => refs.find((e) => e.title === title);
  expect(new Date(entryDate(by('Uno'))).getMonth()).toBe(2); // CREATED marzo
  expect(new Date(entryDate(by('Dos'))).getMonth()).toBe(4); // CLOSED mayo
  expect(new Date(entryDate(by('Apunte'))).getMonth()).toBe(9); // día del diario, octubre
  expect(new Date(entryDate(by('Tres'))).getMonth()).toBe(0); // primer timestamp, enero
  expect(entryDate(by('Cuatro'))).toBeNull();
  expect(anyDated(refs)).toBe(true);
  expect(anyDated([by('Cuatro'), by('Cinco')])).toBe(false);
  const desc = sortByDate(refs, 'desc');
  expect(desc.dated.map((e) => e.title)).toEqual(['Apunte', 'Dos', 'Uno', 'Tres']);
  expect(desc.undated.map((e) => e.title).sort()).toEqual(['Cinco', 'Cuatro']);
  expect(sortByDate(refs, 'asc').dated.map((e) => e.title)).toEqual([
    'Tres',
    'Uno',
    'Dos',
    'Apunte',
  ]);
  expect(normalizeOrder({ order: 'date', dir: 'asc' })).toEqual({ order: 'date', dir: 'asc' });
  expect(normalizeOrder(null)).toEqual({ order: 'file', dir: 'desc' });
});

test('lo que se imprime: serialización de lo que se ve (orden, filtros, «Ver el resto»)', () => {
  const store = makeStore(BACK);
  const index = headingIndex(store.getState().org.present.get('files'));
  const refs = backlinkEntries(index, 'DEST');
  const uno = refs.find((e) => e.title === 'Uno');
  const view = {
    hideArchived: true,
    hideTasks: true,
    inherited: true,
    tags: ['work'],
    order: 'date',
    dir: 'asc',
  };
  expect(applyBacklinksView(refs, view).mode).toBe('date');
  const snap = serializeBacklinks({
    refs,
    index,
    orgId: 'DEST',
    view,
    openKeys: [`${uno.path}\u0000${uno.pos}`],
    collapsed: false,
  });
  expect(snap.items.map((i) => i.entry.title)).toEqual(['Tres', 'Uno', 'Cuatro']);
  expect(snap.filters).toEqual(['sin archivadas', 'sin tareas', 'etiqueta work']);
  expect(snap.count).toBe(3);
  expect(snap.total).toBe(6);
  expect(snap.items[1].open).toBe(true);
  expect(snap.items[0].open).toBe(false);
  expect(snap.items[1].paragraphs).toEqual(linkingParagraph(uno, 'DEST'));
  expect(serializeBacklinks({ refs, index, orgId: 'DEST', view, collapsed: true }).collapsed).toBe(
    true
  );
});

test('texto renderizado: enlace de ID, URL y formato (solo lectura)', () => {
  const store = makeStore({ '/x.org': '* X\n' });
  const { container } = render(
    <Provider store={store}>
      <MemoryRouter>
        <OrgTitle rawTitle="Ver [[id:DEST][destino]] y *negrita*" />
        <OrgText
          text={
            'Mira [[https://ejemplo.com/a][la web]] o https://otra.org\n- [ ] casilla\n- *fuerte* =código='
          }
          markId="DEST"
        />
        <OrgText text="Otra vez [[id:DEST][destino]]" markId="DEST" />
      </MemoryRouter>
    </Provider>
  );
  const links = container.querySelectorAll('.eli-org-link');
  expect(links.length).toBe(2);
  expect(links[0].textContent).toBe('destino');
  expect(container.querySelectorAll('a[href="https://ejemplo.com/a"]').length).toBe(1);
  expect(container.querySelectorAll('a[href="https://otra.org"]').length).toBe(1);
  expect(container.querySelector('.attributed-string__inline-markup--bold')).toBeTruthy();
  // el enlace al ID resaltado lleva la marca
  expect(container.querySelectorAll('.eli-hv__link-mark').length).toBeGreaterThanOrEqual(1);
});

test('diario: las subcabeceras del usuario salen aparte y el día sigue contando', () => {
  const text =
    '* 2026-10 octubre\n** 2026-10-20 martes\n:PROPERTIES:\n:ID: diari-2026-10-20\n:END:\n- 09:00 - café\n*** Ideas :tag:\nUna idea [[id:X]]\n**** Detalle\n*** 10:30 - apunte antiguo\n** 2026-10-21 miércoles\n*** Solo subcabecera\n';
  const days = parseDays(text);
  const d20 = days.find((d) => d.key === '2026-10-20');
  expect(d20.entries.map((e) => e.text)).toEqual(['café', 'apunte antiguo']);
  expect(d20.heads.map((h) => h.title)).toEqual(['Ideas :tag:']);
  expect(d20.heads[0].body).toMatch(/Una idea/);
  const d21 = days.find((d) => d.key === '2026-10-21');
  expect(d21.entries).toHaveLength(0);
  expect(dayHasData(d21)).toBe(true);
  expect(Array.from(daysWithEntries(text)).sort()).toEqual(['2026-10-20', '2026-10-21']);
});

test('bloque Backlinks: desplegado, filtros, etiquetas, orden y plegar con su título', () => {
  // (4.39) por defecto ahora van ocultas las archivadas y las tareas; este test parte de «todo visible»
  setHvFilters({ hideArchived: false, hideTasks: false });
  const store = makeStore(BACK);
  const destId = idOf(store, '/dest.org', 'Destino');
  const { container, getByTestId, queryAllByTestId } = render(
    <Provider store={store}>
      <MemoryRouter>
        <EliNarrowRefs path="/dest.org" headerId={destId} />
      </MemoryRouter>
    </Provider>
  );
  // desplegado por defecto, con todos los resultados (cinco ficheros + el diario)
  expect(getByTestId('eli-narrow-refs-toggle').textContent).toMatch(/Backlinks\s*6/);
  expect(queryAllByTestId('eli-hv-item').length).toBe(6);
  // solo el párrafo que enlaza, con el enlace resaltado y renderizado
  expect(container.querySelectorAll('.eli-hv__link-mark').length).toBeGreaterThanOrEqual(5);
  // ocultar tareas
  fireEvent.click(getByTestId('eli-backlinks-hide-tasks'));
  expect(queryAllByTestId('eli-hv-item').length).toBe(5);
  fireEvent.click(getByTestId('eli-backlinks-hide-tasks'));
  // filtrar por una etiqueta de los chips
  const chip = queryAllByTestId('eli-backlinks-tag').find((c) => /^work/.test(c.textContent));
  fireEvent.click(chip);
  expect(queryAllByTestId('eli-hv-item').length).toBe(4);
  expect(queryAllByTestId('eli-backlinks-tag-on').length).toBe(1);
  fireEvent.click(getByTestId('eli-backlinks-tag-on'));
  expect(queryAllByTestId('eli-hv-item').length).toBe(6);
  // por fecha: primero las que la tienen y «Sin fecha» al final
  fireEvent.click(getByTestId('eli-backlinks-order-date'));
  expect(getByTestId('eli-hv-undated')).toBeTruthy();
  expect(getByTestId('eli-backlinks-dir').textContent).toBe('↓');
  fireEvent.click(getByTestId('eli-backlinks-order-file'));
  // «Ver el resto» abre la nota y queda reflejado para imprimir
  fireEvent.click(queryAllByTestId('eli-hv-more')[0]);
  const snap = getBacklinksSnapshot(backlinksKey('/dest.org', destId));
  expect(snap.items.some((i) => i.open)).toBe(true);
  // plegar el bloque entero
  fireEvent.click(getByTestId('eli-narrow-refs-toggle'));
  expect(queryAllByTestId('eli-hv-item').length).toBe(0);
  expect(getBacklinksSnapshot(backlinksKey('/dest.org', destId)).collapsed).toBe(true);
});
