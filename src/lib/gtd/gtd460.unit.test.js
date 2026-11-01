// 4.60: agendas de proyecto, «Nueva reunión», reuniones de persona/proyecto, plantillas, actas
// desde texto (detector de tareas), cabeceras sin tarea en árbol, solo «Allen estricto», barra
// superior configurable y eliminar contactos.
import thunk from 'redux-thunk';
import { createStore, applyMiddleware } from 'redux';
import { Map as IMap, Set as ISet, fromJS, List } from 'immutable';
import rootReducer from '../../reducers';
import { parseFile } from '../../actions/org';
import { exportOrg } from '../export_org';
import { parseOrg } from '../parse_org';
import { parseAgendas, agendaOfProject, agendaChoices } from './gtd_agendas';
import { agendasFromState } from './gtd_persons_actions';
import {
  createProjectAgenda,
  createMeeting,
  meetingTasksToInbox,
  deleteHeading,
  templateContent,
} from './gtd_agendas_actions';
import {
  meetingTitle,
  meetingsIn,
  filterMeetings,
  detectTasks,
  isOrgSummary,
  transcriptBody,
  templatesIn,
} from './gtd_meetings';
import { buildTasks, nestMeetingRows } from './gtd_model';
import { reviewSteps, REVIEW_STEPS, STRICT_REVIEW_STEPS } from './gtd_review';
import { sweepSteps, MIND_SWEEP, SWEEP_GROUPS } from './gtd_guided';
import { strictOn, dailyShown } from './gtd_strict';
import {
  normalizeTopBar,
  topBarRows,
  moveTopBarRow,
  placeTopBarRow,
  toggleTopBarHidden,
  topBarPlace,
  topBarOrder,
  TOPBAR_MENU_LINE,
} from '../eli_menu_layout';
import { ActionTypes } from 'redux-undo';

jest.mock('../eli_prompt', () => ({
  ...jest.requireActual('../eli_prompt'),
  askConfirm: jest.fn(async () => true),
}));

// (CRA reinicia los mocks entre pruebas)
beforeEach(() => {
  // eslint-disable-next-line global-require
  require('../eli_prompt').askConfirm.mockImplementation(async () => true);
});

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
const tasksOf = (store) =>
  buildTasks(
    store
      .getState()
      .org.present.get('files')
      .filter((f, p) => p && f.get('headers')),
    []
  );
const projectNamed = (store, title) => tasksOf(store).find((t) => t.isProject && t.title === title);

const TASKS = [
  '#+TODO: TODO NEXT WAITING PROJECT | DONE CANCELLED',
  '* PROJECT Mudanza',
  ':PROPERTIES:',
  ':ID: PRJ-1',
  ':END:',
  '** NEXT Pedir presupuesto',
  '* PROJECT Web nueva',
  '** NEXT Elegir hosting',
  '',
].join('\n');
const PERSONAS =
  '* Ana García\n:PROPERTIES:\n:ID: ANA-1\n:END:\n* Luis\n:PROPERTIES:\n:ID: LU-2\n:END:\n';
const AGENDAS = [
  '#+TODO: TODO | DONE',
  '* Ana García',
  '** Punto abierto',
  ':PROPERTIES:',
  ':ID: PA-1',
  ':END:',
  'Detalle.',
  '*** Sub',
  '** DONE Punto tratado',
  '* Mudanza (agenda)',
  ':PROPERTIES:',
  ':PROYECTO: [[id:PRJ-1][Mudanza]]',
  ':TYPE: agenda',
  ':END:',
  '** Hablar del camión',
  '* Oficina',
  '** Llevar llaves',
  '* Viejo proyecto',
  ':PROPERTIES:',
  ':PROYECTO: [[id:NO-EXISTE][Viejo]]',
  ':END:',
  '',
].join('\n');

describe('4.60 A: agendas de proyecto (:PROYECTO:)', () => {
  test('parseAgendas: persona > proyecto > lugar; projects con nombre y enlace roto', () => {
    const titles = { 'prj-1': 'Mudanza' };
    const ag = parseAgendas(
      parseOrg(AGENDAS).set('headers', parseOrg(AGENDAS).get('headers')),
      [{ orgId: 'ANA-1', name: 'Ana García', aliases: [] }],
      '/agendas.org',
      (id) => titles[String(id).toLowerCase()] || null
    );
    expect(ag.persons.map((a) => a.title)).toEqual(['Ana García']);
    expect(ag.projects.map((a) => a.project.name)).toEqual(['Mudanza', 'Viejo']);
    expect(ag.projects[1].project.missing).toBe(true);
    expect(ag.projects[0].project.missing).toBe(false);
    expect(ag.places.map((a) => a.title)).toEqual(['Oficina']);
    expect(agendaOfProject(ag, 'prj-1').title).toBe('Mudanza (agenda)');
    // el selector jerárquico ofrece también las de proyecto
    expect(agendaChoices(ag).some((c) => c.root.project && c.depth === 1)).toBe(true);
  });

  test('una cabecera con :PERSONA: y :PROYECTO: es de persona', () => {
    const text =
      '* X\n:PROPERTIES:\n:PERSONA: [[id:ANA-1][Ana]]\n:PROYECTO: [[id:PRJ-1][M]]\n:END:\n';
    const ag = parseAgendas(parseOrg(text), [], '/agendas.org', () => 'M');
    expect(ag.persons).toHaveLength(1);
    expect(ag.projects).toHaveLength(0);
  });

  test('crear la agenda de un proyecto sin :ID:: se le pone el ID y el resto de agendas.org no cambia', async () => {
    const store = makeStore({
      '/tasks.org': TASKS,
      '/agendas.org': AGENDAS,
      '/personas.org': PERSONAS,
    });
    const before = fileText(store, '/agendas.org');
    const web = projectNamed(store, 'Web nueva');
    expect(web.orgId).toBeFalsy();
    const id = await store.dispatch(createProjectAgenda(web));
    expect(id).toBeTruthy();
    const tasks = fileText(store, '/tasks.org');
    const orgId = /\* PROJECT Web nueva\n:PROPERTIES:\n:ID: (\S+)\n:END:/.exec(tasks)[1];
    const after = fileText(store, '/agendas.org');
    expect(after.startsWith(before.replace(/\n$/, ''))).toBe(true);
    expect(after).toContain(
      `* Web nueva\n:PROPERTIES:\n:PROYECTO: [[id:${orgId}][Web nueva]]\n:TYPE: agenda\n:END:`
    );
    // otra vez: devuelve la misma, sin crear otra
    const again = await store.dispatch(createProjectAgenda(projectNamed(store, 'Web nueva')));
    expect(again).toBe(id);
    expect(agendasFromState(store.getState()).projects.map((a) => a.project.name)).toContain(
      'Web nueva'
    );
  });
});

describe('4.60 B: «Nueva reunión»', () => {
  const setup = () =>
    makeStore({
      '/tasks.org': TASKS,
      '/agendas.org': AGENDAS,
      '/personas.org': PERSONAS,
      '/reuniones.org': '#+TITLE: Reuniones\n* Anterior\n',
      '/plantillas.org': [
        '* Acta tipo',
        ':PROPERTIES:',
        ':TYPE: plantilla',
        ':ID: TPL-1',
        ':END:',
        'Notas de la plantilla.',
        '** Asistentes',
        ':PROPERTIES:',
        ':ID: TPL-2',
        ':END:',
        '** Acuerdos',
        '',
      ].join('\n'),
    });

  test('título por defecto', () => {
    expect(meetingTitle('Ana', new Date(2026, 10, 1))).toBe('2026-11-01 Reunión con Ana');
    expect(meetingTitle('', new Date(2026, 10, 1))).toBe('2026-11-01 Reunión');
  });

  test('crea la reunión al final con asistentes, proyecto, plantilla (IDs nuevos), transcripción y los puntos abiertos; un Deshacer lo revierte todo', async () => {
    const store = setup();
    const ag = agendasFromState(store.getState());
    const ana = ag.persons[0];
    const before = {
      ag: fileText(store, '/agendas.org'),
      re: fileText(store, '/reuniones.org'),
    };
    // (redux-undo no guarda la primera acción: se «arranca» el historial con una vacía)
    store.dispatch({ type: 'ELI_BATCH', actions: [], dirtying: true });
    const pastBefore = store.getState().org.past.length;
    const r = await store.dispatch(
      createMeeting({
        title: '2026-11-01 Reunión con Ana García',
        persons: [
          { id: 'ANA-1', title: 'Ana García' },
          { id: 'LU-2', title: 'Luis' },
        ],
        project: projectNamed(store, 'Mudanza'),
        agendaId: ana.headerId,
        bringPoints: true,
        template: {
          path: '/plantillas.org',
          headerId: templatesIn(store.getState().org.present.get('files'))[0].headerId,
        },
        transcript: 'Ana se encarga de pedir el camión. Hablamos del tiempo.',
        date: new Date(2026, 10, 1),
      })
    );
    expect(r).toBeTruthy();
    expect(r.moved).toBe(1);
    // un solo paso de Deshacer
    expect(store.getState().org.past.length).toBe(pastBefore + 1);
    const re = fileText(store, '/reuniones.org');
    expect(
      re.startsWith('#+TITLE: Reuniones\n* Anterior\n* 2026-11-01 Reunión con Ana García\n')
    ).toBe(true);
    expect(re).toMatch(/:TYPE: meeting\n/);
    expect(re).toMatch(/:ID: \S+\n/);
    expect(re).toMatch(/:CREATED: \[\d{4}-\d\d-\d\d /);
    expect(re).toContain(':PERSONA: [[id:ANA-1][Ana García]] [[id:LU-2][Luis]]');
    expect(re).toContain(':PROYECTO: [[id:PRJ-1][Mudanza]]');
    expect(re).toMatch(/:END:\n\[2026-11-01 \w+\]\nNotas de la plantilla\./);
    // el punto abierto, con su :ID: y su subpunto; el tratado se queda en la agenda
    expect(re).toContain('** Punto abierto\n:PROPERTIES:\n:ID: PA-1\n:END:\nDetalle.\n*** Sub');
    expect(re).not.toContain('Punto tratado');
    expect(fileText(store, '/agendas.org')).toContain('** DONE Punto tratado');
    expect(fileText(store, '/agendas.org')).not.toContain('Punto abierto');
    // plantilla: subcabeceras con ID NUEVO (no TPL-2) y sin :TYPE: plantilla
    expect(re).toContain('** Asistentes\n:PROPERTIES:\n:ID: ');
    expect(re).not.toContain('TPL-2');
    expect(re).not.toContain(':TYPE: plantilla');
    expect(re).toContain('** Acuerdos');
    expect(re).toContain('** Transcripción\nAna se encarga de pedir el camión.');
    // Deshacer: todo como antes
    store.dispatch({ type: ActionTypes.UNDO });
    expect(fileText(store, '/agendas.org')).toBe(before.ag);
    expect(fileText(store, '/reuniones.org')).toBe(before.re);
  });

  test('sin traer puntos (casilla apagada) la agenda no cambia; acta en formato Org va bajo «Acta»', async () => {
    const store = setup();
    const ana = agendasFromState(store.getState()).persons[0];
    const before = fileText(store, '/agendas.org');
    await store.dispatch(
      createMeeting({
        title: 'R',
        persons: [{ id: 'ANA-1', title: 'Ana García' }],
        agendaId: ana.headerId,
        bringPoints: false,
        transcript: '* Temas\n- uno\n* Acuerdos\n- dos',
      })
    );
    expect(fileText(store, '/agendas.org')).toBe(before);
    expect(fileText(store, '/reuniones.org')).toContain(
      '** Acta\n*** Temas\n- uno\n*** Acuerdos\n- dos'
    );
  });

  test('un proyecto sin :ID: lo recibe al crear la reunión con él', async () => {
    const store = setup();
    await store.dispatch(createMeeting({ title: 'R', project: projectNamed(store, 'Web nueva') }));
    const orgId = /\* PROJECT Web nueva\n:PROPERTIES:\n:ID: (\S+)\n/.exec(
      fileText(store, '/tasks.org')
    )[1];
    expect(fileText(store, '/reuniones.org')).toContain(`:PROYECTO: [[id:${orgId}][Web nueva]]`);
  });

  test('tareas del acta al Inbox con :PERSONA: y enlace a la reunión', () => {
    const store = makeStore({ '/tasks.org': TASKS, '/inbox.org': '' });
    const n = store.dispatch(
      meetingTasksToInbox(
        [
          { text: 'Ana se encarga del camión', person: { id: 'ANA-1', title: 'Ana García' } },
          { text: 'Hay que pagar', person: null },
        ],
        { orgId: 'M-1', title: 'Reunión' }
      )
    );
    expect(n).toBe(2);
    const inbox = fileText(store, '/inbox.org');
    expect(inbox).toMatch(/^\* Ana se encarga del camión/m);
    expect(inbox).toContain(':PERSONA: [[id:ANA-1][Ana García]]');
    expect(inbox).toContain('Reunión: [[id:M-1][Reunión]]');
  });

  test('plantilla: el contenido renueva los :ID:', () => {
    const store = setup();
    const t = templatesIn(store.getState().org.present.get('files'));
    expect(t.map((x) => x.title)).toEqual(['Acta tipo']);
    const c = templateContent(store.getState, t[0], '/reuniones.org');
    expect(c.notes).toBe('Notas de la plantilla.');
    expect(c.headers.size).toBe(2);
    const ids = c.headers
      .map((h) => (h.get('propertyListItems') || List()).find((p) => p.get('property') === 'ID'))
      .filter(Boolean);
    expect(ids.size).toBe(1);
  });
});

describe('4.60 C: reuniones de una persona o de un proyecto', () => {
  const RE = [
    '* 2026-10-01 Reunión vieja',
    ':PROPERTIES:',
    ':TYPE: meeting',
    ':CREATED: [2026-10-01 Thu 10:00]',
    ':PERSONA: [[id:ANA-1][Ana]]',
    ':END:',
    '** Punto dentro',
    ':PROPERTIES:',
    ':TYPE: meeting',
    ':PERSONA: [[id:ANA-1][Ana]]',
    ':END:',
    '* 2026-10-20 Con Luis',
    ':PROPERTIES:',
    ':TYPE: meeting',
    ':CREATED: [2026-10-20 Tue 09:00]',
    ':PERSONA: [[id:LU-2][Luis]]',
    ':PROYECTO: [[id:PRJ-1][Mudanza]]',
    ':END:',
    '* 2026-10-25 Con Ana otra vez',
    ':PROPERTIES:',
    ':TYPE: meeting',
    ':CREATED: [2026-10-25 Sun 18:30]',
    ':PERSONA: [[id:LU-2][Luis]] [[id:ANA-1][Ana]]',
    ':END:',
    '* Nota sin tipo',
    ':PROPERTIES:',
    ':PERSONA: [[id:ANA-1][Ana]]',
    ':END:',
    '',
  ].join('\n');
  test('filtra por persona/proyecto, solo nivel superior de meeting, de la más reciente a la más antigua', () => {
    const f = parseOrg(RE);
    expect(meetingsIn(f, '/r.org', { personId: 'ana-1' }).map((m) => m.title)).toEqual([
      '2026-10-25 Con Ana otra vez',
      '2026-10-01 Reunión vieja',
    ]);
    expect(meetingsIn(f, '/r.org', { projectId: 'PRJ-1' }).map((m) => m.date)).toEqual([
      '2026-10-20',
    ]);
    const all = meetingsIn(f, '/r.org');
    expect(all).toHaveLength(3);
    expect(filterMeetings(all, 'luis').map((m) => m.title)).toEqual(['2026-10-20 Con Luis']);
  });
});

describe('4.60 D: acta desde texto', () => {
  test('detector de tareas (frases típicas) y reconocimiento de la persona', () => {
    const text = [
      'Empezamos a las diez.',
      'Ana se encarga de llamar al proveedor. Luis tiene que revisar el contrato.',
      'Quedamos en vernos el jueves.',
      'Hace buen tiempo.',
      '- [ ] Enviar el acta',
      'Hay que pagar la factura para el viernes.',
    ].join('\n');
    const found = detectTasks(text, [
      { orgId: 'ANA-1', name: 'Ana García', aliases: ['Ana'] },
      { orgId: 'LU-2', name: 'Luis' },
    ]);
    expect(found.map((x) => x.text)).toEqual([
      'Ana se encarga de llamar al proveedor.',
      'Luis tiene que revisar el contrato.',
      'Quedamos en vernos el jueves.',
      'Enviar el acta',
      'Hay que pagar la factura para el viernes.',
    ]);
    expect(found[0].person).toEqual({ id: 'ANA-1', title: 'Ana García' });
    expect(found[1].person).toEqual({ id: 'LU-2', title: 'Luis' });
    expect(found[2].person).toBe(null);
  });
  test('acta Org vs transcripción', () => {
    expect(isOrgSummary('* Temas\n- a')).toBe(true);
    expect(isOrgSummary('Hola\n* no')).toBe(false);
    expect(transcriptBody('Hola\n* raro')).toBe('Hola\n,* raro');
    expect(transcriptBody('* A\n** B', 1)).toBe('** A\n*** B');
  });
});

describe('4.60 E: secciones propias con «cabeceras sin tarea» en árbol', () => {
  test('todas las cabeceras sin estado van con su jerarquía y su nº de hijas', () => {
    const text = '* Ref\n** Hija\n*** Nieta\n* TODO Tarea\n* Otra ref\n';
    const store = makeStore({ '/tasks.org': text });
    const tasks = tasksOf(store);
    const by = (t) => tasks.find((x) => x.title === t);
    const list = ['Tarea', 'Ref', 'Hija', 'Nieta', 'Otra ref'].map(by);
    const r = nestMeetingRows(tasks, list, (t) => !t.keyword && !t.isProject);
    expect(r.list.map((t) => t.title)).toEqual(['Tarea', 'Ref', 'Hija', 'Nieta', 'Otra ref']);
    expect(['Ref', 'Hija', 'Nieta', 'Otra ref'].map((t) => r.depth.get(by(t).key))).toEqual([
      0,
      1,
      2,
      0,
    ]);
    expect(r.kids.get(by('Ref').key)).toBe(1);
    expect(r.kids.get(by('Nieta').key)).toBe(0);
  });
});

describe('4.60 E: solo «Allen estricto»', () => {
  afterEach(() => window.localStorage.removeItem('eliGtdStrict'));
  test('un ajuste guardado antiguo se ignora; revisión y volcado siempre los oficiales', () => {
    window.localStorage.setItem('eliGtdStrict', 'false');
    expect(strictOn()).toBe(true);
    expect(REVIEW_STEPS).toBe(STRICT_REVIEW_STEPS);
    expect(reviewSteps(false)).toBe(STRICT_REVIEW_STEPS);
    expect(reviewSteps({ zk: true })).toHaveLength(STRICT_REVIEW_STEPS.length + 1);
    expect(sweepSteps(false)).toBe(MIND_SWEEP);
    expect(SWEEP_GROUPS).toEqual(['Profesional', 'Personal']);
    expect(MIND_SWEEP.some((s) => s.group === 'Extra')).toBe(false);
    expect(dailyShown('plan')).toBe(false);
  });
});

describe('4.60 E: barra superior configurable', () => {
  test('por defecto todos en la barra; un guardado antiguo sin ellos los pone en la barra', () => {
    const d = normalizeTopBar(null);
    expect(d.order).toEqual(['mode', 'nav', 'undo', 'sync']);
    expect(d.bar).toBe(4);
    expect(topBarRows(d)[4]).toBe(TOPBAR_MENU_LINE);
    expect(topBarOrder(d)).toEqual(['mode', 'nav', 'undo', 'sync']);
  });
  test('mover al menú, ordenar, apagar y arrastrar', () => {
    let l = normalizeTopBar(null);
    l = moveTopBarRow(l, 'sync', 1); // cruza la línea: al menú
    expect(topBarPlace('sync', l)).toBe('menu');
    expect(topBarOrder(l)).toEqual(['mode', 'nav', 'undo']);
    l = moveTopBarRow(l, 'undo', -1);
    expect(topBarOrder(l)).toEqual(['mode', 'undo', 'nav']);
    l = toggleTopBarHidden(l, 'mode');
    expect(topBarPlace('mode', l)).toBe('off');
    expect(topBarOrder(l)).toEqual(['undo', 'nav']);
    l = placeTopBarRow(l, 'sync', 0); // arrastre: arriba del todo
    expect(topBarPlace('sync', l)).toBe('bar');
    expect(normalizeTopBar({ order: ['sync'], bar: 0 }).bar).toBe(3);
  });
});

describe('4.60 E: eliminar (contacto, reunión, agenda)', () => {
  test('borrar un contacto no toca los :PERSONA: que lo enlazan; se puede deshacer', async () => {
    const store = makeStore({
      '/tasks.org': '* NEXT Llamar\n:PROPERTIES:\n:PERSONA: [[id:ANA-1][Ana García]]\n:END:\n',
      '/personas.org': PERSONAS,
    });
    const tasksBefore = fileText(store, '/tasks.org');
    store.dispatch({ type: 'ELI_BATCH', actions: [], dirtying: true });
    const ana = store.getState().org.present.getIn(['files', '/personas.org', 'headers']).first();
    const ok = await store.dispatch(
      deleteHeading({
        path: '/personas.org',
        headerId: ana.get('id'),
        what: 'el contacto',
        title: 'Ana García',
      })
    );
    expect(ok).toBe(true);
    expect(fileText(store, '/personas.org')).not.toContain('Ana García');
    expect(fileText(store, '/tasks.org')).toBe(tasksBefore);
    store.dispatch({ type: ActionTypes.UNDO });
    expect(fileText(store, '/personas.org')).toContain('Ana García');
  });
});
