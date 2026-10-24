// 4.20: aspecto de las filas GTD — letra W/S en todas las tareas y suma de tiempo (madres/proyectos).
import { Map } from 'immutable';
import { parseOrg } from '../parse_org';
import { buildTasks, seqMarkOf } from './gtd_model';
import { clockTotalsOf, clockTotalLabel } from './gtd_clock';

const HEAD = '#+TODO: TODO NEXT WAITING MAYBE PROJECT | DONE CANCELLED\n';
const TODAY = new Date(2026, 9, 24);
const tasksOf = (text, files = {}) =>
  buildTasks(
    Map({
      '/t.org': parseOrg(HEAD + text),
      ...Object.fromEntries(Object.entries(files).map(([p, x]) => [p, parseOrg(HEAD + x)])),
    }),
    []
  );
const by = (tasks, title) => tasks.find((t) => t.title === title);
const clock = (a, b, d = '2026-10-21 Wed') =>
  `:LOGBOOK:\nCLOCK: [${d} ${a}]--[${d} ${b}] =>  0:00\n:END:`;

describe('4.20 letra W/S', () => {
  const tasks = tasksOf(
    [
      '* WAITING Espero algo',
      '* NEXT Futura',
      'SCHEDULED: <2026-11-02 Mon>',
      '* NEXT Normal',
      '* DONE Hecha',
      '* NEXT Hoy',
      'SCHEDULED: <2026-10-24 Sat>',
      '* TODO Sin nada',
    ].join('\n')
  );
  test('Waiting = W, programada a futuro = S, el resto nada', () => {
    expect(seqMarkOf(by(tasks, 'Espero algo'), TODAY)).toBe('W');
    expect(seqMarkOf(by(tasks, 'Futura'), TODAY)).toBe('S');
    expect(seqMarkOf(by(tasks, 'Normal'), TODAY)).toBeNull();
    expect(seqMarkOf(by(tasks, 'Hecha'), TODAY)).toBeNull();
    expect(seqMarkOf(by(tasks, 'Hoy'), TODAY)).toBeNull();
    expect(seqMarkOf(by(tasks, 'Sin nada'), TODAY)).toBeNull();
  });
});

describe('4.20 suma de reloj', () => {
  const text = [
    '* NEXT Suelta',
    clock('10:00', '11:30'),
    '* NEXT Madre',
    clock('09:00', '09:30'),
    '** TODO Hija',
    clock('10:00', '10:20'),
    '*** TODO Nieta',
    clock('11:00', '11:10'),
    '* PROJECT Proyecto',
    clock('08:00', '08:05'),
    '** NEXT Acción A',
    clock('12:00', '13:00'),
    '** DONE Acción B',
    clock('14:00', '14:30'),
    '* NEXT En marcha',
    ':LOGBOOK:\nCLOCK: [2026-10-21 Wed 08:00]\n:END:',
    '* NEXT Sin reloj',
  ].join('\n');
  const other = [
    '* NEXT Enlazada',
    ':PROPERTIES:',
    ':PROYECTO: [[id:AAA][Proyecto]]',
    ':END:',
    clock('15:00', '15:45'),
  ].join('\n');
  const tasks = tasksOf(
    text.replace('* PROJECT Proyecto\n', '* PROJECT Proyecto\n:PROPERTIES:\n:ID: AAA\n:END:\n'),
    {
      '/otro.org': other,
    }
  );
  const totals = clockTotalsOf(tasks);
  const min = (t) => Math.round((totals.get(by(tasks, t).key) || 0) / 60000);
  test('una tarea suelta suma lo suyo', () => {
    expect(min('Suelta')).toBe(90);
  });
  test('la madre suma hija y nieta', () => {
    expect(min('Nieta')).toBe(10);
    expect(min('Hija')).toBe(30);
    expect(min('Madre')).toBe(60);
  });
  test('el proyecto suma sus acciones (hechas y enlazadas desde otro fichero)', () => {
    expect(min('Proyecto')).toBe(5 + 60 + 30 + 45);
  });
  test('el reloj en marcha no suma y sin reloj no hay entrada', () => {
    expect(totals.has(by(tasks, 'En marcha').key)).toBe(false);
    expect(totals.has(by(tasks, 'Sin reloj').key)).toBe(false);
  });
  test('se reutiliza para la misma lista de tareas', () => {
    expect(clockTotalsOf(tasks)).toBe(totals);
  });
  test('texto: nada por debajo de un minuto', () => {
    expect(clockTotalLabel(30000)).toBe('');
    expect(clockTotalLabel(90 * 60000)).not.toBe('');
  });
});
