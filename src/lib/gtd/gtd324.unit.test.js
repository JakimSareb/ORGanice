import { Map } from 'immutable';
import { parseOrg } from '../parse_org';
import { buildTasks } from './gtd_model';
import { weeklyReview, reviewCount } from './gtd_review';

const HEAD = '#+TODO: TODO NEXT WAITING MAYBE PROJECT | DONE CANCELLED\n';
const TODAY = new Date(2026, 9, 19); // lunes 19-oct-2026
const tasksOf = (text) => buildTasks(Map({ '/p.org': parseOrg(HEAD + text) }), []);
const titles = (l) => l.map((t) => t.title);

describe('3.24: revisión semanal', () => {
  const r = weeklyReview(
    tasksOf(
      [
        '* Idea suelta :@inbox:',
        '* PROJECT Con siguiente',
        '** NEXT Llamar',
        '* PROJECT Atascado',
        '** TODO Algo',
        '** DONE Hecho',
        '* PROJECT Madre',
        '** PROJECT Hijo',
        '*** NEXT Paso',
        '* PROJECT Durmiendo',
        '  :PROPERTIES:',
        '  :STATUS: sleep',
        '  :END:',
        '** TODO Dentro del dormido',
        '   DEADLINE: <2026-10-01 jue>',
        '* TODO Tarea dormida',
        '  :PROPERTIES:',
        '  :STATUS: sleep',
        '  :END:',
        '* TODO Atrasada',
        '  DEADLINE: <2026-10-10 sáb>',
        '* TODO Programada pasada',
        '  SCHEDULED: <2026-10-18 dom>',
        '* TODO En tres días',
        '  SCHEDULED: <2026-10-22 jue>',
        '* TODO Lejos',
        '  DEADLINE: <2026-11-30 lun>',
        '* MAYBE Aprender piano',
        '* TODO Tirada :trash:',
        '  DEADLINE: <2026-10-01 jue>',
      ].join('\n')
    ),
    TODAY
  );
  test('Inbox y Algún día', () => {
    expect(titles(r.inbox)).toEqual(['Idea suelta']);
    expect(titles(r.someday)).toEqual(['Aprender piano']);
  });
  test('proyectos activos sin acción Next (subproyecto abierto cuenta)', () => {
    expect(titles(r.stalled)).toEqual(['Atascado']);
  });
  test('dormidos: los propios, no lo de dentro', () => {
    expect(titles(r.sleep)).toEqual(['Durmiendo', 'Tarea dormida']);
  });
  test('fechas: vencidas y próximos 7 días (sin aparcadas ni papelera)', () => {
    expect(titles(r.overdue)).toEqual(['Atrasada', 'Programada pasada']);
    expect(titles(r.upcoming)).toEqual(['En tres días']);
    expect(reviewCount(r, 'dates')).toBe(3);
  });
});
