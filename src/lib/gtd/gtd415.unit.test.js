import { Map } from 'immutable';
import { parseOrg } from '../parse_org';
import { buildTasks } from './gtd_model';
import { weeklyReview, reviewCount, reviewSteps, REVIEW_STEPS } from './gtd_review';
import { sweepSteps, MIND_SWEEP } from './gtd_guided';
import { strictOn } from './gtd_strict';

const HEAD = '#+TODO: TODO NEXT WAITING MAYBE PROJECT | DONE CANCELLED\n';
const TODAY = new Date(2026, 9, 20);
const tasksOf = (text) => buildTasks(Map({ '/p.org': parseOrg(HEAD + text) }), []);
const titles = (l) => l.map((t) => t.title);

describe('4.15: ajuste «Allen estricto»', () => {
  afterEach(() => window.localStorage.removeItem('eliGtdStrict'));
  // (4.60) siempre encendido: ya no es un ajuste (un valor guardado antiguo se ignora)
  test('siempre encendido', () => {
    expect(strictOn()).toBe(true);
    window.localStorage.setItem('eliGtdStrict', 'false');
    expect(strictOn()).toBe(true);
  });
  test('el Volcado mental sin el bloque Extra', () => {
    expect(sweepSteps().length).toBe(39);
    expect(sweepSteps().some((s) => s.group === 'Extra')).toBe(false);
    expect(sweepSteps()).toBe(MIND_SWEEP);
  });
});

describe('4.15: Revisión semanal oficial', () => {
  test('pasos oficiales en orden, sin los propios', () => {
    const ids = reviewSteps(true).map((s) => s.id);
    expect(ids).toEqual([
      'loose',
      'inbox',
      'mind',
      'next',
      'past',
      'upcoming',
      'waiting',
      'projects',
      'goals',
      'checklists',
      'someday',
      'creative',
    ]);
    ['closed', 'week', 'sleep'].forEach((x) => expect(ids).not.toContain(x));
    expect(reviewSteps(false)).toBe(REVIEW_STEPS);
    const next = reviewSteps(true).find((s) => s.id === 'next');
    expect(next.hint).not.toMatch(/esta semana/);
  });
  test('calendario pasado y próximo (corto y largo plazo)', () => {
    const r = weeklyReview(
      tasksOf(
        [
          '* NEXT Atrasada',
          'DEADLINE: <2026-10-10 Sat>',
          '* DONE Reunión del lunes',
          'CLOSED: [2026-10-19 Mon 10:00] SCHEDULED: <2026-10-19 Mon>',
          '* NEXT Mañana',
          'SCHEDULED: <2026-10-21 Wed>',
          '* NEXT En diciembre',
          'SCHEDULED: <2026-12-01 Tue>',
        ].join('\n')
      ),
      TODAY,
      new Date(2026, 9, 15).toISOString()
    );
    expect(titles(r.overdue)).toEqual(['Atrasada']);
    expect(titles(r.pastDone)).toEqual(['Reunión del lunes']);
    expect(reviewCount(r, 'past')).toBe(2);
    expect(titles(r.upcoming)).toEqual(['Mañana']);
    expect(titles(r.farther)).toEqual(['En diciembre']);
    expect(reviewCount(r, 'upcoming')).toBe(2);
  });
  test('proyectos activos uno a uno con sus acciones Next', () => {
    const r = weeklyReview(
      tasksOf(
        [
          '* PROJECT Casa',
          '** NEXT Pintar',
          '* PROJECT Viaje',
          '* PROJECT Dormido',
          ':PROPERTIES:',
          ':STATUS: sleep',
          ':END:',
        ].join('\n')
      ),
      TODAY
    );
    expect(r.projects.map((c) => c.project.title)).toEqual(['Casa', 'Viaje']);
    expect(titles(r.projects[0].next)).toEqual(['Pintar']);
    expect(r.projects[1].next).toEqual([]);
    expect(reviewCount(r, 'projects')).toBe(2);
    expect(reviewCount(r, 'checklists')).toBe(0);
  });
});
