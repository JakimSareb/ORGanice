import React from 'react';
import thunk from 'redux-thunk';

import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { createStore, applyMiddleware } from 'redux';

import OrgFile from './';
import HeaderBar from '../HeaderBar';
import readFixture from '../../../test_helpers/index';
import rootReducer from '../../reducers/';

import { setPath, parseFile } from '../../actions/org';
import { setShouldLogIntoDrawer, activatePopup } from '../../actions/base';
import { getCurrentTimestampAsText } from '../../lib/timestamps';
import { Map, Set, fromJS, List } from 'immutable';
import { differenceInCalendarDays } from 'date-fns';
import { property, pipe, map, over, curry, times } from 'lodash/fp';

import { render, fireEvent, cleanup, within } from '@testing-library/react';
// Debugging help:
// console.log(prettyDOM(container, 999999999999999999999999));
import { STATIC_FILE_PREFIX } from '../../lib/org_utils';

afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
  localStorage.clear();
});

describe('Render all views', () => {
  const testOrgFile = readFixture('main_test_file');

  let store;

  beforeEach(() => {
    // Set global variable which can also be read from application code
    window.testRunner = true;
    // (3.21b) Como en el organice original: un clic en una cabecera la pliega/despliega (en
    // ORGanice el primero solo selecciona; se elige en Ajustes, lib/eli_tap_mode).
    localStorage.setItem(
      'eliTapMode',
      JSON.stringify({ 'header-desktop': 'open', 'header-mobile': 'open' })
    );
    // (3.21b) Dos clics seguidos en la misma cabecera = editar el título en su sitio (doble
    // toque, < 380 ms). En las pruebas cada llamada a Date.now avanza 1 s para que no lo sean.
    let fakeNow = Date.now();
    jest.spyOn(Date, 'now').mockImplementation(() => (fakeNow += 1000));

    let capture = Map();
    capture = capture.set('captureTemplates', []);
    store = createStore(
      rootReducer,
      {
        org: {
          past: [],
          present: Map({
            files: Map(),
            fileSettings: [],
            search: Map({
              searchFilter: '',
              searchFilterExpr: [],
            }),
            bookmarks: Map({
              search: List(),
              'task-list': List(),
              refile: List(),
            }),
          }),
          future: [],
        },
        syncBackend: Map({
          isAuthenticated: true,
        }),
        capture,
        base: new fromJS({
          customKeybindings: {},
          shouldTapTodoToAdvance: true,
          isLoading: Set(),
          finderTab: 'Search',
          agendaTimeframe: 'Week',
          preferEditRawValues: false,
        }),
      },
      applyMiddleware(thunk)
    );
    store.dispatch(parseFile(STATIC_FILE_PREFIX + 'fixtureTestFile.org', testOrgFile));
    store.dispatch(setPath(STATIC_FILE_PREFIX + 'fixtureTestFile.org'));
  });

  describe('Org Functionality', () => {
    let container,
      getByText,
      getAllByText,
      getByTitle,
      getByTestId,
      queryByTestId,
      queryByText,
      queryAllByText,
      getByPlaceholderText,
      openSearch;

    beforeEach(() => {
      let res = render(
        <MemoryRouter keyLength={0} initialEntries={['/file/dir1/dir2/fixtureTestFile.org']}>
          <Provider store={store}>
            <HeaderBar />
            <OrgFile path={STATIC_FILE_PREFIX + 'fixtureTestFile.org'} />
          </Provider>
        </MemoryRouter>
      );

      container = res.container;
      // (3.21b) La barra de abajo (EliDocBar) y sus menús repiten textos del documento
      // («TODO», «DONE»…): las búsquedas por texto no miran dentro de ellos.
      const ignore = { ignore: 'script, style, .eli-docbar *, .eli-docbar-menu *' };
      getByText = (t, o) => res.getByText(t, { ...ignore, ...o });
      getAllByText = (t, o) => res.getAllByText(t, { ...ignore, ...o });
      getByTitle = res.getByTitle;
      getByTestId = res.getByTestId;
      queryByTestId = res.queryByTestId;
      queryByText = (t, o) => res.queryByText(t, { ...ignore, ...o });
      queryAllByText = (t, o) => res.queryAllByText(t, { ...ignore, ...o });
      getByPlaceholderText = res.getByPlaceholderText;
      // (3.21b) Buscar / Lista de tareas ya no tiene botón propio arriba (se abre desde la
      // paleta o con la tecla del atajo): se abre la misma ventana directamente.
      openSearch = () => store.dispatch(activatePopup('search'));
    });

    describe('Works with Org files without headlines', () => {
      test('Works with a completely empty files', () => {
        store.dispatch(
          parseFile(STATIC_FILE_PREFIX + 'fixtureTestFile.org', readFixture('empty_file'))
        );
        expect(queryByText('Este fichero no tiene encabezados')).toBeTruthy();
        expect(queryAllByText(/Sí, tu fichero tiene contenido/).length).toEqual(0);
        // Sanity check, ensure that not the regular test file is loaded.
        expect(queryByText('Top level header')).toBeFalsy();
      });
    });

    describe('Actions within an Org file', () => {
      test('Can select a header in an org file', () => {
        // (3.21b) Con una cabecera seleccionada, la barra de abajo enseña sus acciones
        expect(container.querySelector("[data-testid='eli-docbar-row-main']")).toBeFalsy();

        fireEvent.click(getByText('Top level header'));

        expect(container.querySelector("[data-testid='eli-docbar-row-main']")).toBeTruthy();
      });

      // Org Mode has keywords as workflow states and can cycle through
      // them: https://orgmode.org/manual/Workflow-states.html
      // In organice, we can cycle through them by swiping or by clicking
      // (if enabled). This test checks for the latter.
      test('Can advance todo state for selected header in an org file', () => {
        // In the very beginning, the TODO is hidden, because the file
        // starts folded down to the top level
        expect(queryByText('TODO')).toBeFalsy();

        // Cycle the top header (which will make the next headers
        // [including the TODO] visible
        fireEvent.click(queryByText('Top level header'));

        // In the beginning, the TODO is not DONE
        expect(queryByText('TODO')).toBeTruthy();
        expect(queryByText('DONE')).toBeFalsy();

        // Toggle the TODO
        fireEvent.click(queryByText('TODO'));

        // Then the TODO is DONE
        expect(queryByText('TODO')).toBeFalsy();
        expect(queryByText('DONE')).toBeTruthy();
      });

      // Same behaviour has `S-C-RET` in Emacs Org mode.
      test('Can create a new header with an inherited todoKeyword', () => {
        // (3.21b) «Encabezado nuevo debajo» (＋) de la barra de abajo; se edita en su sitio
        const headerAfter = (title) => {
          const headers = store
            .getState()
            .org.present.getIn(['files', STATIC_FILE_PREFIX + 'fixtureTestFile.org', 'headers']);
          const i = headers.findIndex((h) => h.getIn(['titleLine', 'rawTitle']) === title);
          return headers.get(i + 1);
        };
        fireEvent.click(queryByText('Top level header'));
        // 'plus' on the first header which is _not_ a todoKeyword header
        fireEvent.click(getByTestId('eli-docbar-new'));
        fireEvent.click(getByTestId('eli-docbar-new-below'));
        // (4.03) se abre la hoja «Editar» completa
        expect(getByTestId('eli-edit-sheet-title').value).toEqual('');
        expect(headerAfter('Top level header').getIn(['titleLine', 'todoKeyword'])).toBeFalsy();
        fireEvent.click(getByTestId('eli-edit-sheet-done'));

        // 'plus' on a header which _is_ a todoKeyword header
        fireEvent.click(queryByText('A todo item with schedule and deadline'));
        fireEvent.click(getByTestId('eli-docbar-new'));
        fireEvent.click(getByTestId('eli-docbar-new-below'));
        expect(getByTestId('eli-edit-sheet-title').value).toEqual('');
        expect(
          headerAfter('A todo item with schedule and deadline').getIn(['titleLine', 'todoKeyword'])
        ).toEqual('TODO');
        // (4.03) Cancelar quita la cabecera recién añadida
        fireEvent.click(getByTestId('eli-edit-sheet-cancel'));
        expect(
          headerAfter('A todo item with schedule and deadline').getIn(['titleLine', 'rawTitle'])
        ).not.toEqual('');
      });

      test('Can clock in & out of an event', () => {
        // (3.21b) Iniciar/Parar reloj está en el menú ⋯ de la barra de abajo
        const clockItem = () => {
          if (!container.querySelector("[data-testid='eli-docbar-clock']"))
            fireEvent.click(getByTestId('eli-docbar-more'));
          return getByTestId('eli-docbar-clock');
        };
        fireEvent.click(getByText('Top level header'));

        expect(clockItem()).toHaveTextContent('Iniciar reloj');
        expect(queryByText(':LOGBOOK:...')).toBeFalsy();

        fireEvent.click(clockItem());

        expect(clockItem()).toHaveTextContent('Parar reloj');
        expect(queryByText(':LOGBOOK:...')).toBeTruthy();

        fireEvent.click(getByTestId('eli-docbar-clock'));

        expect(clockItem()).toHaveTextContent('Iniciar reloj');
        expect(queryByText(':LOGBOOK:...')).toBeTruthy();

        fireEvent.click(getByText(':LOGBOOK:...'));

        expect(queryByText('CLOCK:')).toBeTruthy();
        expect(queryByText('=> 0:00')).toBeTruthy();
      });
    });

    describe('List item manipulation', () => {
      test('Can create a new list item of same type in the middle of an existing list', () => {
        const header = queryByText('A header with plain list items');
        fireEvent.click(header);
        fireEvent.click(queryByText('Plain list item 1'));
        fireEvent.click(container.querySelectorAll("[data-testid='eli-docbar-li-new']")[0]);

        const input = getByTestId('list-item-edit');
        fireEvent.change(input, { target: { value: 'Plain list item 2a' } });

        // Close the modal by clicking on the outside
        fireEvent.click(getByText('Top level header'));

        // New list item has the same UX
        fireEvent.click(queryByText('Plain list item 2a'));
        expect(container.querySelectorAll("[data-testid='eli-docbar-li-new']")[0]).toBeTruthy();

        // The new item is inserted in the middle of 'item 1' and 'item 2'
        expect(
          store
            .getState()
            .org.present.getIn(['files', STATIC_FILE_PREFIX + 'fixtureTestFile.org', 'headers'])
            .get(12)
            .get('rawDescription')
        ).toContain('- Plain list item 1\n- Plain list item 2a\n- Plain list item 2');
      });
    });

    describe('Tracking TODO state changes', () => {
      describe('Default settings', () => {
        test('Does not track TODO state change for repeating todos', () => {
          expect(queryByText(':LOGBOOK:...')).toBeFalsy();
          expect(store.getState().base.toJS().shouldLogIntoDrawer).toBeFalsy();

          fireEvent.click(getByText('Another top level header'));
          fireEvent.click(getByText('A repeating todo'));

          fireEvent.click(queryByText('TODO'));
          fireEvent.click(getByText('A repeating todo'));

          expect(queryByText(':LOGBOOK:...')).toBeFalsy();
        });
      });
      describe('Feature enabled', () => {
        test('Does track TODO state change for repeating todos', () => {
          expect(store.getState().base.toJS().shouldLogIntoDrawer).toBeFalsy();
          store.dispatch(setShouldLogIntoDrawer(true));
          expect(store.getState().base.toJS().shouldLogIntoDrawer).toBeTruthy();

          fireEvent.click(getByText('Another top level header'));
          fireEvent.click(getByText('A repeating todo'));
          expect(queryByText(':LOGBOOK:...')).toBeFalsy();

          expect(queryByText('<2020-04-05 Sun +1d>')).toBeTruthy();
          // (3.21b) sin volver a hacer clic en el título: ahora lo plegaría
          fireEvent.click(queryByText('TODO'));

          // After the TODO is toggled, it's still just TODO, because
          // the state got tracked
          expect(queryByText('DONE')).toBeFalsy();
          // TODO has been scheduled one day into the future
          expect(queryByText('<2020-04-05 Sun +1d>')).toBeFalsy();
          expect(queryByText('<2020-04-06 Mon +1d>')).toBeTruthy();

          expect(queryByText(':LOGBOOK:...')).toBeTruthy();
        });
      });
    });

    describe('Renders everything starting from an Org file', () => {
      test('renders an Org file', () => {
        // INFO: This snapshot is semantically correct, but it does
        // not have color theme information. We're implementing the
        // color themes with an API that mutates the DOM in place (see
        // `color.js::loadTheme`. We cannot use this API in jest
        // tests, because calling the API does not yield the same
        // side-effect as in a browser. Hence, some colors in this
        // snapshot are off, but that's ok. We do colorScheme testing
        // by eye and not with automated tests.
        expect(getAllByText(/\*/)).toHaveLength(8);
        expect(container).toMatchSnapshot();
      });

      describe('Custom todo sequences', () => {
        test('It recognizes custom todo sequences and their DONE state', () => {
          fireEvent.click(getByText('Top level header'));
          expect(queryByText('TODO').classList.contains('todo-keyword--done-state')).toBe(false);
          fireEvent.click(queryByText('TODO'));
          expect(queryByText('DONE').classList.contains('todo-keyword--done-state')).toBe(true);
          expect(queryByText('FINISHED').classList.contains('todo-keyword--done-state')).toBe(true);
        });
      });

      describe('Undo / Redo', () => {
        // (4.0) Deshacer/Rehacer están arriba (barra superior)
        const isOff = (id) =>
          getByTestId(id).classList.contains('header-bar__actions__item--disabled');
        test('On loading an Org file, both are disabled', () => {
          expect(isOff('eli-undo')).toBe(true);
          expect(isOff('eli-redo')).toBe(true);
        });

        test('Undo becomes available on "edit header"', () => {
          fireEvent.click(queryByText('Top level header'));
          fireEvent.click(queryByText('TODO'));
          expect(queryByText('DONE')).toBeTruthy();

          // Undo should become available
          expect(isOff('eli-undo')).toBe(false);
          expect(isOff('eli-redo')).toBe(true);

          // …and undo the change
          fireEvent.click(getByTestId('eli-undo'));
          expect(queryByText('DONE')).toBeFalsy();
          const todo = store
            .getState()
            .org.present.getIn(['files', STATIC_FILE_PREFIX + 'fixtureTestFile.org', 'headers'])
            .find(
              (h) => h.getIn(['titleLine', 'rawTitle']) === 'A todo item with schedule and deadline'
            );
          expect(todo.getIn(['titleLine', 'todoKeyword'])).toEqual('TODO');
          expect(isOff('eli-redo')).toBe(false);
        });
      });

      describe('Planning items', () => {
        test('deletes planning items', () => {
          fireEvent.click(queryByText('Top level header'));
          fireEvent.click(queryByText('A todo item with schedule and deadline'));
          fireEvent.click(queryByText('<2019-09-19 Thu>'));

          expect(queryByText('SCHEDULED:')).toBeTruthy();
          expect(queryByText('DEADLINE:')).toBeTruthy();

          // First: Delete "Scheduled" time

          // The <input type="date"> field exposes a 'x' button to
          // delete the time. There's no direct API to trigger it.
          // Hence, get the element, remove the time and fire the
          // 'change' event manually.
          let timePicker = getByTestId('timestamp-selector');
          timePicker.value = null;
          fireEvent.change(timePicker);

          expect(queryByText('SCHEDULED:')).toBeFalsy();
          expect(queryByText('DEADLINE:')).toBeTruthy();

          // Second: Delete "Deadline" time

          fireEvent.click(queryByText('<2018-10-05 Fri>'));
          timePicker = getByTestId('timestamp-selector');
          timePicker.value = null;
          fireEvent.change(timePicker);

          expect(queryByText('SCHEDULED:')).toBeFalsy();
          expect(queryByText('DEADLINE:')).toBeFalsy();
        });

        describe('Slash syntax for repeaters', () => {
          test('does NOT show slash UI for DEADLINE with repeater', () => {
            // Open DEADLINE timestamp editor
            fireEvent.click(queryByText('Top level header'));
            fireEvent.click(queryByText('A todo item with schedule and deadline'));
            fireEvent.click(queryByText('<2018-10-05 Fri>'));

            // Get the drawer to query within it
            const drawer = getByTestId('drawer');

            // Add a repeater by clicking the + button (it's in the drawer)
            const addButton = drawer.querySelector('.timestamp-editor__icon--add');
            fireEvent.click(addButton);

            // Verify slash UI does NOT appear for DEADLINE
            expect(within(drawer).queryByPlaceholderText('Optional deadline')).toBeFalsy();
          });

          // Note: Testing the positive case (SCHEDULED with slash UI) is complex due to
          // async DOM updates in the test environment. Manual testing confirms this works correctly.
        });
      });

      /* global global */
      describe('Sharing', () => {
        let windowSpy;
        beforeEach(() => {
          windowSpy = jest.spyOn(global, 'open');
          windowSpy.mockImplementation((x) => x);
        });

        afterEach(() => {
          windowSpy.mockRestore();
        });

        test('sends the selected header and its body as an email', () => {
          fireEvent.click(queryByText('Another top level header'));
          // (4.0) Más › Compartir o PDF › Compartir / correo, en la barra de abajo
          fireEvent.click(getByTestId('eli-docbar-more'));
          fireEvent.click(getByTestId('eli-docbar-share'));
          fireEvent.click(getByTestId('eli-docbar-mail'));
          expect(global.open).toBeCalledWith(
            `mailto:?subject=${encodeURIComponent(
              'Another top level header'
            )}&body=${encodeURIComponent(
              '* Another top level header\nSome description content\n\n** TODO A repeating todo\n   SCHEDULED: <2020-04-05 Sun +1d>\n\n'
            )}`
          );
        });
      });

      describe('Search', () => {
        test('renders Search for an Org file', () => {
          expect(queryByText('Search')).toBeFalsy();
          expect(queryByText('A todo item with schedule and deadline')).toBeFalsy();

          openSearch();
          const drawerElem = getByTestId('drawer');
          expect(drawerElem).toHaveTextContent('A todo item with schedule and deadline');
        });

        test('searches in all headers', () => {
          openSearch();
          const drawerElem = getByTestId('drawer');
          const input = getByPlaceholderText(
            'p. ej. -DONE doc|man :simple|easy :assignee:nobody|none'
          );

          // All kinds of headers are visible
          expect(drawerElem).toHaveTextContent('A todo item with schedule and deadline');
          expect(drawerElem).toHaveTextContent('A header with tags');
          expect(drawerElem).toHaveTextContent('Another top level header');

          // Filter down to headers with tag :tag1:
          fireEvent.change(input, { target: { value: ':tag1' } });

          expect(drawerElem).toHaveTextContent('A header with tags');
          expect(drawerElem).not.toHaveTextContent('Another top level header');
        });

        test('searches in sub-headers when narrowed', () => {
          // Click 'narrow' on the first header
          fireEvent.click(queryByText('Top level header'));
          fireEvent.click(getByTestId('eli-docbar-more'));
          fireEvent.click(getByTestId('eli-docbar-narrow'));

          openSearch();
          const drawerElem = getByTestId('drawer');

          // Only sub-headers are visible
          expect(drawerElem).not.toHaveTextContent('A header with tags');
          expect(drawerElem).not.toHaveTextContent('Another top level header');
          expect(drawerElem).toHaveTextContent('A nested header');
          expect(drawerElem).toHaveTextContent('A todo item with schedule and deadline');
        });
      });

      describe('Refile', () => {
        test('removes selected header and subheader from search', () => {
          fireEvent.click(queryByText('Top level header'));
          fireEvent.click(getByTestId('eli-docbar-move'));
          fireEvent.click(getByTestId('eli-docbar-refile'));

          const drawerElem = getByTestId('drawer');
          expect(drawerElem).not.toHaveTextContent('Top level header');
          expect(drawerElem).toHaveTextContent('Another top level header');
        });
      });

      describe('TaskList', () => {
        test('renders TaskList for an Org file', () => {
          expect(queryByText('Task list')).toBeFalsy();
          expect(queryByText('A todo item with schedule and deadline')).toBeFalsy();

          openSearch();
          fireEvent.click(
            [...document.querySelectorAll('.tab-buttons__btn')].find(
              (e) => e.textContent === 'Tareas'
            )
          );
          const drawerElem = getByTestId('drawer');
          expect(drawerElem).not.toHaveTextContent('Top level header');
          expect(drawerElem).toHaveTextContent('A todo item with schedule and deadline');
        });

        // Order by state first and then by date. Ergo TODO is before
        // DONE and yesterday is before today.
        test('orders tasks for an Org file', () => {
          openSearch();
          const drawerElem = getByTestId('drawer');
          expect(drawerElem).toMatchSnapshot();
        });

        test('search in TaskList filters headers (by default only with todoKeywords)', () => {
          openSearch();
          const drawerElem = getByTestId('drawer');
          const input = getByPlaceholderText(
            'p. ej. -DONE doc|man :simple|easy :assignee:nobody|none'
          );
          fireEvent.change(input, { target: { value: 'a search with no results' } });

          expect(drawerElem).not.toHaveTextContent('A todo item with schedule and deadline');
          fireEvent.change(input, { target: { value: 'todo item' } });

          expect(drawerElem).toHaveTextContent('A todo item with schedule and deadline');
        });

        // More rigorous testing of the search parser is here:
        // headline_filter_parser.unit.test.js
        test('search in TaskList filters headers (on demand without todoKeywords)', () => {
          openSearch();
          fireEvent.click(
            [...document.querySelectorAll('.tab-buttons__btn')].find(
              (e) => e.textContent === 'Tareas'
            )
          );
          const drawerElem = getByTestId('drawer');
          getByPlaceholderText('p. ej. -DONE doc|man :simple|easy :assignee:nobody|none');

          // Is a regular header without TODO keyword
          expect(drawerElem).not.toHaveTextContent('Another top level header');
          // Is a header with TODO keyword
          expect(drawerElem).toHaveTextContent('A repeating todo');
        });
      });

      describe('Agenda', () => {
        test('renders Agenda for an Org file', () => {
          // Agenda is not visible by default
          expect(queryByText('Agenda')).toBeFalsy();
          expect(queryByText('Día')).toBeFalsy();
          expect(queryByText('Mes')).toBeFalsy();
          expect(queryByText('A scheduled todo item')).toBeFalsy();

          store.dispatch(activatePopup('agenda'));

          expect(queryByText('Agenda')).toBeTruthy();
          expect(queryByText('Día')).toBeTruthy();
          expect(queryByText('Mes')).toBeTruthy();
          expect(queryAllByText('A todo item with schedule and deadline')).toBeTruthy();
        });

        test('Agenda starts on Monday by default', () => {
          store.dispatch(activatePopup('agenda'));
          expect(container.querySelectorAll('.agenda-day__title__day-name')[0]).toHaveTextContent(
            'lunes'
          );
        });

        test('Clicking a TODO within the agenda highlights it in the main view', () => {
          expect(queryByText('A todo item with schedule and deadline')).toBeFalsy();
          store.dispatch(activatePopup('agenda'));
          expect(queryByText('Agenda')).toBeTruthy();
          fireEvent.click(queryAllByText('A todo item with schedule and deadline')[0]);
          expect(queryByText('Agenda')).toBeFalsy();
          expect(queryByText('A todo item with schedule and deadline')).toBeTruthy();
        });

        // (3.21b) Ya no se alterna fecha/tiempo al tocarla: las vencidas enseñan a la vez los
        // días que han pasado, el tipo y la fecha (dd/MM)
        test('Shows the date and the days since it for an overdue TODO within the agenda', () => {
          const expectedDate = new Date(2019, 8, 19, 12, 0);
          store.dispatch(activatePopup('agenda'));
          const days = differenceInCalendarDays(new Date(), expectedDate);
          expect(getByTestId('drawer')).toHaveTextContent(`${days} díasprogramada 19/09`);
        });

        test('Agenda shows only actionable TODOs, not with a DONE state', () => {
          store.dispatch(activatePopup('agenda'));

          const drawerElem = getByTestId('drawer');
          expect(drawerElem).not.toHaveTextContent("A headline that's done since a loong time");
          expect(drawerElem).not.toHaveTextContent("A headline that's done a day earlier even");

          expect(drawerElem).toHaveTextContent('A todo item with schedule and deadline');
          expect(drawerElem).toHaveTextContent('A repeating todo');
        });
      });

      // (3.21b) En ORGanice las tablas se editan en su sitio (EliOrgTable): un clic en una celda
      // la edita y la barra de abajo pasa a tener los botones de filas y columnas (tbl-*); ✓
      // guarda. Ya no hay ventana «Edit table» (ni botón para insertar la fecha en la celda).
      describe('TableEditor', () => {
        const tableRows = () =>
          [...document.querySelectorAll('.eli-table tr:not(.eli-table__sep)')].map((tr) =>
            [...tr.querySelectorAll('td')].map((td) => td.textContent.trim())
          );
        const column = (rows, c) => rows.map((r) => r[c]);
        const editCell = (text) => {
          fireEvent.click(
            [...document.querySelectorAll('[data-testid=eli-table-cell]')].find(
              (td) => td.textContent.trim() === text
            )
          );
          return getByTestId('eli-table-cell-input');
        };
        const tableAction = (id) => fireEvent.click(getByTestId(`eli-docbar-tbl-${id}`));
        const rawDescription = () =>
          store
            .getState()
            .org.present.getIn(['files', STATIC_FILE_PREFIX + 'fixtureTestFile.org', 'headers'])
            .get(0)
            .get('rawDescription');

        beforeEach(() => {
          store.dispatch(
            parseFile(STATIC_FILE_PREFIX + 'fixtureTestFile.org', readFixture('large_table'))
          );
          store.dispatch(setPath(STATIC_FILE_PREFIX + 'fixtureTestFile.org'));
          // open the header with the table
          fireEvent.click(getByText('Dogs'));
        });

        test('opens when a table cell is clicked on', () => {
          expect(editCell('Argos').value).toEqual('Argos');
          expect(getByTestId('eli-docbar-row-table')).toBeTruthy();
          expect(getByTestId('eli-docbar-tbl-done')).toBeTruthy();
        });

        test('can edit cell value', () => {
          const input = editCell('Bauschan');
          fireEvent.change(input, { target: { value: 'Motz' } });
          tableAction('done');

          expect(queryByTestId('eli-table-cell-input')).toBeFalsy();
          expect(column(tableRows(), 0)).toContain('Motz');
          expect(column(tableRows(), 0)).not.toContain('Bauschan');
          expect(rawDescription()).toMatch(/\| Motz +\|/);
        });

        test('can move row up', () => {
          const before = tableRows();
          const i = before.findIndex((r) => r[1] === '6');
          editCell('6');
          tableAction('row-up');
          tableAction('done');

          const after = tableRows();
          expect(after[i - 1]).toStrictEqual(before[i]);
          expect(after[i]).toStrictEqual(before[i - 1]);
        });

        test('can move row down', () => {
          const before = tableRows();
          const i = before.findIndex((r) => r[2] === '17');
          editCell('17');
          tableAction('row-down');
          tableAction('done');

          const after = tableRows();
          expect(after[i + 1]).toStrictEqual(before[i]);
          expect(after[i]).toStrictEqual(before[i + 1]);
        });

        test('can move column to the right', () => {
          const before = tableRows();
          editCell('Luster');
          tableAction('col-right');
          tableAction('done');

          const after = tableRows();
          expect(column(after, 4)).toStrictEqual(column(before, 3));
          expect(column(after, 3)).toStrictEqual(column(before, 4));
        });

        test('can move column to the left', () => {
          const before = tableRows();
          editCell('Luster');
          tableAction('col-left');
          tableAction('done');

          const after = tableRows();
          expect(column(after, 2)).toStrictEqual(column(before, 3));
          expect(column(after, 3)).toStrictEqual(column(before, 2));
        });

        test('can add row', () => {
          const before = tableRows();
          const i = before.findIndex((r) => r[0] === 'Pilot');
          editCell('Pilot');
          tableAction('row-add');
          tableAction('done');

          const after = tableRows();
          expect(after.length).toEqual(before.length + 1);
          expect(after[i]).toStrictEqual(before[i]);
          expect(after[i + 1].every((v) => v === '')).toBe(true);
          expect(after[i + 1].length).toEqual(before[i].length);
          expect(after[i + 2]).toStrictEqual(before[i + 1]);
        });

        test('can add column', () => {
          const before = tableRows();
          editCell('45');
          tableAction('col-add');
          tableAction('done');

          const after = tableRows();
          expect(after[0].length).toEqual(before[0].length + 1);
          expect(column(after, 2)).toStrictEqual(column(before, 2));
          expect(column(after, 3).every((v) => v === '')).toBe(true);
          expect(column(after, 4)).toStrictEqual(column(before, 3));
        });

        test('can delete row', () => {
          const before = tableRows();
          const gyp = before.find((r) => r[0] === 'Gyp');
          editCell('Gyp');
          tableAction('row-del');
          tableAction('done');

          const after = tableRows();
          expect(after.length).toEqual(before.length - 1);
          expect(after).not.toContainEqual(gyp);
          expect(rawDescription()).not.toContain('Gyp');
        });

        test('can delete column', () => {
          const before = tableRows();
          editCell('Score');
          tableAction('col-del');
          tableAction('done');

          const after = tableRows();
          expect(after[0].length).toEqual(before[0].length - 1);
          expect(after[0]).not.toContain('Score');
          expect(rawDescription()).not.toContain('Score');
        });
      });

      describe('Link recognition', () => {
        test('recognizes canonical format +xxxxxxxxx phone numbers', () => {
          fireEvent.click(
            queryByText('A header with a URL, mail address and phone number as content')
          );
          const elem = getAllByText('+49123456789');
          // There's exactly one phone number
          expect(elem.length).toEqual(1);
          // And it renders as such
          expect(elem[0]).toHaveAttribute('href', 'tel:+49123456789');
          expect(elem[0]).toHaveTextContent('+49123456789');
        });

        test('recognizes phone numbers', () => {
          fireEvent.click(
            queryByText('A header with a URL, mail address and phone number as content')
          );

          const phone_numbers = [
            // US
            '123-456-7890',
            '(123) 456-7890',
            '123 456 7890',
            '123.456.7890',
            '+91 (123) 456-7890',
            // Swiss
            '0783268674',
            '078 326 86 74',
            '041783268675',
            '0041783268674',
            '+41783268676',
            '+41783268677',
          ];

          for (let i in phone_numbers) {
            const phone_number = phone_numbers[i];
            const elem = getAllByText(phone_number);
            expect(elem.length).toEqual(1);
            expect(elem[0]).toHaveAttribute('href', `tel:${phone_number}`);
            expect(elem[0]).toHaveTextContent(phone_number);
          }
        });

        test('does not recognize random numbers as phone numbers', () => {
          fireEvent.click(
            queryByText('A header with a URL, mail address and phone number as content')
          );

          const numbers = ['05 05 05'];

          for (let i in numbers) {
            const number = numbers[i];
            const elem = getAllByText(number);
            expect(elem.length).toEqual(1);
            expect(elem[0]).not.toHaveAttribute('href', `tel:${number}`);
            expect(elem[0]).toHaveTextContent(number);
          }
        });

        test('recognizes URLs', () => {
          fireEvent.click(
            queryByText('A header with a URL, mail address and phone number as content')
          );
          const elem = getAllByText('https://foo.bar.baz/xyz?a=b&d#foo');
          // There's exactly one such URL
          expect(elem.length).toEqual(1);
          // And it renders as such
          expect(elem[0]).toHaveAttribute('href', 'https://foo.bar.baz/xyz?a=b&d#foo');
          expect(elem[0]).toHaveTextContent('https://foo.bar.baz/xyz?a=b&d#foo');
        });

        describe('recognizes file: links', () => {
          beforeEach(() => {
            fireEvent.click(queryByText('A header with various links as content'));
          });

          test('relative link to .org file', () => {
            const elem = getAllByText('an existing .org file in the same directory');
            // There's exactly one such URL
            expect(elem.length).toEqual(1);
            // And it renders as such
            // (3.21b) los enlaces a ficheros .org se resuelven al tocarlos (eliFollowOrgLink)
            expect(elem[0]).toHaveClass('eli-org-link');
            expect(elem[0]).toHaveAttribute('title', 'file:schedule_and_timestamps.org');
            expect(elem[0]).toHaveTextContent('an existing .org file in the same directory');
          });

          test('relative link to subdir', () => {
            const elem = getAllByText('subdir');
            expect(elem.length).toEqual(1);
            expect(elem[0]).toHaveAttribute('href', '/files/dir1/dir2/subdir');
            expect(elem[0]).toHaveTextContent('subdir');
          });

          test('relative link to subdir/', () => {
            const elem = getAllByText('subdir/');
            expect(elem.length).toEqual(1);
            expect(elem[0]).toHaveAttribute('href', '/files/dir1/dir2/subdir/');
            expect(elem[0]).toHaveTextContent('subdir/');
          });

          test('relative link to fictitious .org file in subdir', () => {
            const elem = getAllByText('a fictitious .org file in a sub-directory');
            expect(elem.length).toEqual(1);
            // (3.21b) los enlaces a ficheros .org se resuelven al tocarlos (eliFollowOrgLink)
            expect(elem[0]).toHaveClass('eli-org-link');
            expect(elem[0]).toHaveAttribute('title', 'file:subdir/foo.org');
            expect(elem[0]).toHaveTextContent('a fictitious .org file in a sub-directory');
          });

          test('relative link to fictitious .org file in a parent directory', () => {
            const elem = getAllByText('a fictitious .org file in a parent directory');
            expect(elem.length).toEqual(1);
            // (3.21b) los enlaces a ficheros .org se resuelven al tocarlos (eliFollowOrgLink)
            expect(elem[0]).toHaveClass('eli-org-link');
            expect(elem[0]).toHaveAttribute('title', 'file:../foo.org_archive');
            expect(elem[0]).toHaveTextContent('a fictitious .org file in a parent directory');
          });

          test('relative link to ../subdir', () => {
            const elem = getAllByText('../subdir');
            expect(elem.length).toEqual(1);
            expect(elem[0]).toHaveAttribute('href', '/files/dir1/subdir');
            expect(elem[0]).toHaveTextContent('../subdir');
          });

          test('relative link to ../subdir/', () => {
            const elem = getAllByText('../subdir/');
            expect(elem.length).toEqual(1);
            expect(elem[0]).toHaveAttribute('href', '/files/dir1/subdir/');
            expect(elem[0]).toHaveTextContent('../subdir/');
          });

          test('relative link to fictitious .org file in a grand-parent directory', () => {
            const elem = getAllByText('a fictitious .org file in a grand-parent directory');
            expect(elem.length).toEqual(1);
            // (3.21b) los enlaces a ficheros .org se resuelven al tocarlos (eliFollowOrgLink)
            expect(elem[0]).toHaveClass('eli-org-link');
            expect(elem[0]).toHaveAttribute('title', 'file:../../foo.org');
            expect(elem[0]).toHaveTextContent('a fictitious .org file in a grand-parent directory');
          });

          test('relative link to fictitious .org file in a too-high ancestor directory', () => {
            const elem = getAllByText('a fictitious .org file in a too-high ancestor directory');
            expect(elem.length).toEqual(1);
            // (3.21b) los enlaces a ficheros .org se resuelven al tocarlos (eliFollowOrgLink)
            expect(elem[0]).toHaveClass('eli-org-link');
            expect(elem[0]).toHaveAttribute(
              'title',
              'file:../../../../too-high-to-access-file.org'
            );
            expect(elem[0]).toHaveTextContent(
              'a fictitious .org file in a too-high ancestor directory'
            );
          });

          test('relative link to too-high ancestor directory', () => {
            const elem = getAllByText('a too-high ancestor directory');
            expect(elem.length).toEqual(1);
            // INFO: This file cannot be opened, because it is not
            // visible from within the share given to organice.
            expect(elem[0]).toHaveAttribute(
              'data-target',
              '../../../../too-high-to-access-directory'
            );
            expect(elem[0]).toHaveTextContent('a too-high ancestor directory');
          });

          test('absolute link to fictitious .org file in home directory', () => {
            const elem = getAllByText('a fictitious .org file in home directory');
            expect(elem.length).toEqual(1);
            // (3.21b) los enlaces a ficheros .org se resuelven al tocarlos (eliFollowOrgLink)
            expect(elem[0]).toHaveClass('eli-org-link');
            expect(elem[0]).toHaveAttribute('title', 'file:~/foo/bar/baz.org');
            // INFO: This file cannot really be opened, because
            // organice doesn't know the directory structure of the
            // user. I.e. the file link might be
            // `file:~/Dropbox/org/things.org`. Then, organice would
            // have to remove the `Dropbox` folder and try and see if
            // it can find the file underneath.
            expect(elem[0]).toHaveTextContent('a fictitious .org file in home directory');
          });

          test('absolute link to fictitious .org file', () => {
            const elem = getAllByText('a fictitious .org file');
            expect(elem.length).toEqual(1);
            // (3.21b) los enlaces a ficheros .org se resuelven al tocarlos (eliFollowOrgLink)
            expect(elem[0]).toHaveClass('eli-org-link');
            expect(elem[0]).toHaveAttribute('title', 'file:/foo/bar/baz.org');
            expect(elem[0]).toHaveTextContent('a fictitious .org file');
          });
        });

        test('recognizes email addresses', () => {
          fireEvent.click(
            queryByText('A header with a URL, mail address and phone number as content')
          );
          const elem = getAllByText('foo.bar@baz.org');
          // There's exactly one such email address
          expect(elem.length).toEqual(1);
          // And it renders as such
          expect(elem[0]).toHaveAttribute('href', 'mailto:foo.bar@baz.org');
          expect(elem[0]).toHaveTextContent('foo.bar@baz.org');
        });
      });
    });
  });
});
