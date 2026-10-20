import { Map } from 'immutable';
import { parseOrg } from '../parse_org';
import { buildTasks } from './gtd_model';
import { weeklyReview, reviewCount, REVIEW_STEPS } from './gtd_review';

const HEAD = '#+TODO: TODO NEXT WAITING | DONE CANCELLED\n';
const TODAY = new Date(2026, 9, 20);
const tasksOf = (text) => buildTasks(Map({ '/p.org': parseOrg(HEAD + text) }), []);
const titles = (l) => l.map((t) => t.title);
const TEXT = [
  '* DONE Hoy',
  'CLOSED: [2026-10-20 Tue 10:00]',
  '* DONE Hace tres días',
  'CLOSED: [2026-10-17 Sat 09:00]',
  '* DONE Hace un mes',
  'CLOSED: [2026-09-20 Sun 09:00]',
  '* NEXT Abierta',
].join('\n');

describe('4.04: revisión semanal, primero las terminadas desde la última', () => {
  test('es el primer paso', () => {
    expect(REVIEW_STEPS[0].id).toBe('closed');
  });
  test('desde la última revisión (las más nuevas primero)', () => {
    const r = weeklyReview(tasksOf(TEXT), TODAY, new Date(2026, 9, 18).toISOString());
    expect(titles(r.closed)).toEqual(['Hoy']);
    expect(reviewCount(r, 'closed')).toBe(1);
  });
  test('sin revisión anterior: los últimos 7 días', () => {
    const r = weeklyReview(tasksOf(TEXT), TODAY, null);
    expect(titles(r.closed)).toEqual(['Hoy', 'Hace tres días']);
  });
});
