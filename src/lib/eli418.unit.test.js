import { fromJS } from 'immutable';

import { dueTimedReminders, dailySummary, isUserTask } from './gtd/gtd_reminders';
import { commitUnitAction, planReady, projectPlan, planUnits } from './gtd/gtd_guided';
import {
  parseQuickCapture,
  findCaptureTemplate,
  fillCaptureDraft,
  stashQuickCapture,
  peekQuickCapture,
  takeQuickCapture,
} from './eli_quick_capture';
import { toolOn, setToolOn, TOOLS } from './eli_notes_mode';

const base = { keyword: 'TODO', isDone: false, isTrashed: false, isProject: false, isHabit: false };
const at = (y, m, d, h = 12, mi = 0) => new Date(y, m - 1, d, h, mi);

describe('4.18 avisos solo de los ficheros del usuario', () => {
  const now = at(2026, 10, 24, 10, 5);
  const t = (title, path) => ({
    ...base,
    title,
    path,
    deadline: at(2026, 10, 24, 10, 0),
    deadlineTimed: true,
  });
  test('el manual (sample.org) y los internos no avisan', () => {
    const tasks = [
      t('Regar las plantas', 'organice_internal_sample'),
      t('Revisar el presupuesto', '/__plantilla__'),
      t('Llamar', '/tasks.org'),
    ];
    expect(dueTimedReminders(tasks, now).map((r) => r.title)).toEqual(['Llamar']);
    const s = dailySummary(tasks, now, 9);
    expect(s.title).toBe('Tareas: 1 para hoy');
    expect(s.body).not.toMatch(/Regar/);
    expect(isUserTask({ path: '/dropbox/inbox.org' })).toBe(true);
  });
  test('sin tareas del usuario no hay resumen', () => {
    expect(dailySummary([t('Esta ya va con retraso', 'organice_internal_sample')], now, 9)).toBe(
      null
    );
  });
});

describe('4.18 Planificar: «U otra acción…»', () => {
  test('en el proyecto: pasa a idea y queda elegida', () => {
    const plan = { name: 'Casa', ideas: ['Pintar'], first: '', nexts: {} };
    const p = commitUnitAction(plan, '', '  Llamar al pintor ');
    expect(p.first).toBe('Llamar al pintor');
    expect(p.ideas).toEqual(['Pintar', 'Llamar al pintor']);
    expect(planReady(p)).toBe(true);
    expect(planUnits(p)[0].choices).toContain('Llamar al pintor');
    // sin duplicar tareas al crear
    const titles = projectPlan(p).tasks.map((x) => x.title);
    expect(titles).toEqual(['Llamar al pintor', 'Pintar']);
    // dos veces no la repite
    expect(commitUnitAction(p, '', 'Llamar al pintor').ideas).toHaveLength(2);
  });
  test('en un componente: acción nueva del componente', () => {
    const plan = {
      name: 'Boda',
      ideas: [{ title: 'Banquete', component: true, actions: ['Pedir presupuestos'] }],
      first: '',
      nexts: {},
    };
    const p = commitUnitAction(plan, 'Banquete', 'Visitar fincas');
    expect(p.ideas[0].actions).toEqual(['Pedir presupuestos', 'Visitar fincas']);
    expect(p.nexts.Banquete.action).toBe('Visitar fincas');
    expect(planReady(p)).toBe(true);
    const sub = projectPlan(p).tasks[0];
    expect(sub.children.map((c) => [c.title, c.list])).toEqual([
      ['Visitar fincas', 'next'],
      ['Pedir presupuestos', 'later'],
    ]);
  });
  test('vacío: no cambia nada', () => {
    const plan = { name: 'X', ideas: [], first: '', nexts: {} };
    expect(commitUnitAction(plan, '', '  ')).toBe(plan);
  });
});

describe('4.18 captura desde fuera con plantilla', () => {
  const templates = fromJS([
    { id: '1', letter: 't', description: 'Tarea' },
    { id: '2', letter: 'L', description: 'Leer más tarde' },
  ]);
  test('el enlace trae la plantilla (o vacía = preguntar)', () => {
    expect(parseQuickCapture('?text=Hola&plantilla=l')).toEqual({
      title: 'Hola',
      notes: '',
      edit: false,
      withTemplate: true,
      template: 'l',
    });
    expect(parseQuickCapture('?plantilla=')).toMatchObject({ withTemplate: true, template: '' });
    expect(parseQuickCapture('?text=Hola')).toEqual({ title: 'Hola', notes: '', edit: false });
    expect(parseQuickCapture('')).toBe(null);
  });
  test('se guarda aunque no traiga texto', () => {
    stashQuickCapture(parseQuickCapture('?plantilla=t'));
    expect(peekQuickCapture()).toMatchObject({ withTemplate: true, template: 't' });
    takeQuickCapture();
    expect(peekQuickCapture()).toBe(null);
  });
  test('buscar la plantilla por letra o nombre', () => {
    expect(findCaptureTemplate(templates, 'L').get('id')).toBe('2');
    expect(findCaptureTemplate(templates, 'l').get('id')).toBe('2');
    expect(findCaptureTemplate(templates, 'tarea').get('id')).toBe('1');
    expect(findCaptureTemplate(templates, 'nada')).toBe(null);
    expect(findCaptureTemplate(templates, '')).toBe(null);
  });
  test('lo compartido entra en la tarea', () => {
    expect(fillCaptureDraft('', '', { title: 'Artículo', notes: 'https://x.es' })).toEqual({
      title: 'Artículo',
      notes: 'https://x.es',
    });
    expect(fillCaptureDraft('Leer ', 'Fuente', { title: 'Artículo', notes: '' })).toEqual({
      title: 'Leer Artículo',
      notes: 'Fuente',
    });
    expect(fillCaptureDraft('Leer', 'Fuente\n', { title: 'Artículo', notes: 'url' })).toEqual({
      title: 'Leer',
      notes: 'Artículo\nFuente\nurl',
    });
    expect(fillCaptureDraft('Leer', 'n', null)).toEqual({ title: 'Leer', notes: 'n' });
  });
});

describe('4.18 herramienta Fountain', () => {
  test('encendida de inicio y se puede apagar', () => {
    expect(TOOLS.map((t) => t.id)).toContain('fountain');
    expect(toolOn('fountain')).toBe(true);
    setToolOn('fountain', false);
    expect(toolOn('fountain')).toBe(false);
    setToolOn('fountain', true);
  });
});
