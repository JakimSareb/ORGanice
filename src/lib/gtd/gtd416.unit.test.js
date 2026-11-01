// 4.16: Revisión diaria, Planificar/Cerrar el día dentro de «Allen estricto» y plazos y
// frecuencias de Horizontes.
import { Map } from 'immutable';
import { parseOrg } from '../parse_org';
import { buildTasks } from './gtd_model';
import { DAILY_PROCESSES, dailyReview } from './gtd_daily';
import { dailyShown, setDailyOptIn, NOT_ALLEN_DAILY } from './gtd_strict';
import {
  parseHorizons,
  termOf,
  objectivesByTerm,
  horizonReminders,
  markHzReviewed,
  getHzLastReview,
} from './gtd_horizons';

const HEAD = '#+TODO: TODO NEXT WAITING | DONE CANCELLED\n';
const TODAY = new Date(2026, 9, 21);
const tasksOf = (text, path = '/p.org') => buildTasks(Map({ [path]: parseOrg(HEAD + text) }), []);
const titles = (l) => l.map((t) => t.title);

describe('4.16: Revisión diaria', () => {
  const tasks = tasksOf(
    [
      '* NEXT Ayer',
      'SCHEDULED: <2026-10-20 Tue>',
      '* TODO Límite hoy',
      'DEADLINE: <2026-10-21 Wed>',
      '* WAITING Espera vencida',
      'DEADLINE: <2026-10-19 Mon>',
      '* NEXT Normal',
      '* NEXT [#A] Con estrella',
    ].join('\n')
  );
  const tickler = tasksOf('* Hoy toca\nSCHEDULED: <2026-10-21 Wed>\n', '/tickler.org');
  const r = dailyReview(tasks, TODAY, tickler);

  test('pasos oficiales', () => {
    expect(DAILY_PROCESSES.daily.steps.map((s) => s.id)).toEqual([
      'due',
      'tickler',
      'waiting',
      'next',
    ]);
  });
  test('calendario, tickler y Waiting de hoy', () => {
    expect(titles(r.due)).toEqual(expect.arrayContaining(['Ayer', 'Límite hoy']));
    expect(titles(r.tickler)).toEqual(['Hoy toca']);
    expect(titles(r.waiting)).toEqual(['Espera vencida']);
  });
  test('repaso de Next con ★ primero', () => {
    expect(titles(r.next)).toEqual(expect.arrayContaining(['Normal', 'Con estrella']));
    expect(r.next[0].title).toBe('Con estrella');
  });
});

describe('4.16: Planificar/Cerrar el día dentro de Allen estricto', () => {
  beforeEach(() => window.localStorage.clear());
  test('estricto (por defecto): ocultos salvo que se activen', () => {
    expect(dailyShown('plan')).toBe(false);
    expect(dailyShown('close')).toBe(false);
    expect(dailyShown('daily')).toBe(true);
    expect(dailyShown('now')).toBe(true);
    setDailyOptIn('plan', true);
    expect(dailyShown('plan')).toBe(true);
    expect(dailyShown('close')).toBe(false);
    expect(window.localStorage.getItem(NOT_ALLEN_DAILY.plan)).toBe('true');
  });
  // (4.60) ya no hay modo NO estricto: un valor guardado antiguo se ignora
  test('un «sin estricto» guardado antiguo no los enseña', () => {
    window.localStorage.setItem('eliGtdStrict', 'false');
    expect(dailyShown('plan')).toBe(false);
    expect(dailyShown('close')).toBe(false);
  });
});

describe('4.16: plazos de los objetivos', () => {
  const h = parseHorizons(
    parseOrg(
      [
        '* Objetivos (1–2 años)',
        '** Media maratón',
        ':PROPERTIES:',
        ':PLAZO: Este trimestre',
        ':END:',
        '** Aprender alemán',
        ':PROPERTIES:',
        ':PLAZO: 1–2 años',
        ':END:',
        '** Pintar la casa',
        ':PROPERTIES:',
        ':PLAZO: Este año',
        ':END:',
        '** Sin fecha',
        '',
      ].join('\n')
    ),
    '/horizons.org'
  );
  test('lee :PLAZO:', () => {
    expect(h.objectives.map((o) => o.term)).toEqual(['quarter', '2y', 'year', null]);
    expect(termOf('1-2 años')).toBe('2y');
    expect(termOf('este año')).toBe('year');
    expect(termOf('')).toBe(null);
  });
  test('agrupa por plazo en orden (sin plazo al final)', () => {
    const g = objectivesByTerm(h.objectives);
    expect(g.map((x) => x.id)).toEqual(['quarter', 'year', '2y', 'none']);
    expect(g[0].items.map((o) => o.title)).toEqual(['Media maratón']);
  });
});

describe('4.16: frecuencias de revisión', () => {
  beforeEach(() => window.localStorage.clear());
  test('sin revisar: proyectos, áreas y objetivos', () => {
    expect(horizonReminders({}, TODAY).map((r) => r.id)).toEqual(['projects', 'areas', 'goals']);
  });
  test('al día: nada; objetivos de hace 4 meses = recalibrar', () => {
    const last = { projects: '2026-10-20', areas: '2026-10-01', goals: '2026-06-01' };
    const r = horizonReminders(last, TODAY);
    expect(r.map((x) => [x.id, x.kind])).toEqual([['goals', 'recal']]);
  });
  test('áreas de hace más de un mes', () => {
    const r = horizonReminders(
      { projects: '2026-10-20', areas: '2026-09-01', goals: '2026-10-01' },
      TODAY
    );
    expect(r.map((x) => x.id)).toEqual(['areas']);
    expect(r[0].since).toBe(50);
  });
  test('marcar un nivel como revisado', () => {
    markHzReviewed('areas', TODAY);
    expect(getHzLastReview()).toEqual({ areas: '2026-10-21' });
  });
});
