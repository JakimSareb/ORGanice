// 4.39: proyecto paralelo / secuencial (:ORDERED:), filtros de backlinks, margen derecho, fuente,
// etiqueta de sesión
import { Map } from 'immutable';
import { parseOrg } from '../parse_org';
import { buildTasks, listOf, tasksForView, isOrderedValue, markOrdered } from './gtd_model';
import {
  getHvFilters,
  setHvFilters,
  resetHvFilters,
  BACKLINKS_FILTER_DEFAULT,
} from '../eli_backlinks_view';
import { getEdgePad, setEdgePad, clampEdgePad, EDGE_PAD_DEFAULT } from '../eli_menu_layout';
import { FONTS, getFont, setFont } from '../eli_font';
import { formatSessionLabel, shortEndpoint } from '../eli_session_label';
import { LOCAL_KEYS } from '../eli_synced_prefs';

const HEAD = '#+TODO: TODO NEXT WAITING PROJECT | DONE CANCELLED\n';
const PAR = '* PROJECT Paralelo\n** NEXT A1\n** NEXT A2\n** TODO A3\n';
const SEQ =
  '* PROJECT Secuencial\n:PROPERTIES:\n:ORDERED: t\n:END:\n** NEXT B1\n** NEXT B2\n** TODO B3\n';
const build = (txt) => buildTasks(Map({ '/a.org': parseOrg(HEAD + txt) }), []);
const get = (tasks, title) => tasks.find((t) => t.title === title);

describe('4.39: proyecto secuencial (:ORDERED:)', () => {
  test('isOrderedValue: t / true / yes', () => {
    expect(isOrderedValue('t')).toBe(true);
    expect(isOrderedValue('T')).toBe(true);
    expect(isOrderedValue('yes')).toBe(true);
    expect(isOrderedValue('nil')).toBe(false);
    expect(isOrderedValue('')).toBe(false);
    expect(isOrderedValue(null)).toBe(false);
  });

  test('sin :ORDERED: todo igual que antes (paralelo)', () => {
    const tasks = build(PAR);
    expect(get(tasks, 'Paralelo').ordered).toBe(false);
    expect(tasks.some((t) => t.seqBlocked)).toBe(false);
    expect(listOf(get(tasks, 'A1'))).toBe('next');
    expect(listOf(get(tasks, 'A2'))).toBe('next');
  });

  test('con :ORDERED: t solo la primera abierta sigue en Next', () => {
    const tasks = build(SEQ);
    expect(get(tasks, 'Secuencial').ordered).toBe(true);
    expect(get(tasks, 'B1').seqBlocked).toBeFalsy();
    expect(get(tasks, 'B2').seqBlocked).toBe(true);
    expect(get(tasks, 'B3').seqBlocked).toBe(true);
    expect(listOf(get(tasks, 'B1'))).toBe('next');
    expect(listOf(get(tasks, 'B2'))).toBeNull();
    const next = tasksForView(tasks, { id: 'next' }).map((t) => t.title);
    expect(next).toEqual(['B1']);
  });

  test('al terminar la primera, pasa la siguiente', () => {
    const tasks = build(SEQ.replace('** NEXT B1', '** DONE B1'));
    expect(listOf(get(tasks, 'B2'))).toBe('next');
    expect(listOf(get(tasks, 'B3'))).toBe('later'); // TODO: no es Next de todos modos
  });

  test('un proyecto secuencial no cambia a un paralelo vecino', () => {
    const tasks = build(PAR + SEQ);
    expect(
      tasksForView(tasks, { id: 'next' })
        .map((t) => t.title)
        .sort()
    ).toEqual(['A1', 'A2', 'B1']);
  });

  test('las bloqueadas se ven en su proyecto', () => {
    const tasks = build(SEQ);
    const proj = get(tasks, 'Secuencial');
    const inProj = tasksForView(tasks, { type: 'project', key: proj.key }).map((t) => t.title);
    expect(inProj).toEqual(['B1', 'B2', 'B3']);
  });

  test('sin proyectos secuenciales markOrdered devuelve la misma lista (sin copias)', () => {
    const tasks = build(PAR);
    expect(markOrdered(tasks)).toBe(tasks);
  });
});

describe('4.39: filtros de backlinks por defecto', () => {
  beforeEach(() => resetHvFilters());
  test('Backlinks: archivadas y tareas ocultas por defecto', () => {
    expect(BACKLINKS_FILTER_DEFAULT).toBe(true);
    expect(getHvFilters(BACKLINKS_FILTER_DEFAULT)).toEqual({ hideArchived: true, hideTasks: true });
  });
  test('la vista por etiqueta sigue sin ocultar nada', () => {
    expect(getHvFilters()).toEqual({ hideArchived: false, hideTasks: false });
  });
  test('al tocar uno vale igual en las dos vistas', () => {
    setHvFilters({ hideTasks: false });
    expect(getHvFilters(true)).toEqual({ hideArchived: true, hideTasks: false });
    expect(getHvFilters()).toEqual({ hideArchived: false, hideTasks: false });
  });
});

describe('4.39: margen derecho', () => {
  beforeEach(() => window.localStorage.clear());
  test('por defecto 14 px y se limita', () => {
    expect(getEdgePad()).toBe(14);
    expect(EDGE_PAD_DEFAULT).toBe(14);
    expect(clampEdgePad(500)).toBe(60);
    expect(clampEdgePad(-3)).toBe(0);
    expect(clampEdgePad('x')).toBe(14);
  });
  test('se guarda y se aplica como variable CSS', () => {
    setEdgePad(30);
    expect(getEdgePad()).toBe(30);
    expect(document.documentElement.style.getPropertyValue('--eli-edge-pad')).toBe('30px');
  });
  test('es propio de cada dispositivo', () => {
    expect(LOCAL_KEYS.some((l) => l.key === 'eliEdgePad')).toBe(true);
  });
});

describe('4.39: fuente Iosevka y línea de sesión', () => {
  test('Iosevka en la lista de fuentes', () => {
    expect(FONTS.some((f) => f.id === 'iosevka')).toBe(true);
    window.localStorage.clear();
    setFont('iosevka');
    expect(getFont()).toBe('iosevka');
    expect(document.documentElement.getAttribute('data-eli-font')).toBe('iosevka');
  });
  test('formatSessionLabel', () => {
    expect(formatSessionLabel('Dropbox', 'eli@x.com')).toBe('Dropbox · eli@x.com');
    expect(formatSessionLabel('LocalFolder', 'ORG')).toBe('Carpeta local · ORG');
    expect(formatSessionLabel('WebDAV', 'nube.x.org')).toBe('WebDAV · nube.x.org');
    expect(formatSessionLabel('Dropbox', '')).toBe('Dropbox');
    expect(formatSessionLabel('', 'x')).toBe('');
  });
  test('shortEndpoint deja el servidor', () => {
    expect(shortEndpoint('https://nube.x.org/remote.php/dav/')).toBe('nube.x.org');
    expect(shortEndpoint('')).toBe('');
  });
});
