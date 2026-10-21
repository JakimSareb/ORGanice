import { Map } from 'immutable';
import { parseOrg } from '../parse_org';
import { buildTasks } from './gtd_model';
import { planDay, closeDay, whatNow, placeTags } from './gtd_daily';

const HEAD = '#+TODO: TODO NEXT WAITING | DONE CANCELLED\n';
const TODAY = new Date(2026, 9, 21);
const tasksOf = (text, path = '/p.org') => buildTasks(Map({ [path]: parseOrg(HEAD + text) }), []);
const titles = (l) => l.map((t) => t.title);

describe('4.05: Planificar el día', () => {
  const tasks = tasksOf(
    [
      '* NEXT Ayer',
      'SCHEDULED: <2026-10-20 Tue>',
      '* TODO Límite hoy',
      'DEADLINE: <2026-10-21 Wed>',
      '* NEXT Mañana',
      'SCHEDULED: <2026-10-22 Thu>',
      '* WAITING Espera vencida',
      'DEADLINE: <2026-10-19 Mon>',
      '* WAITING Espera sin fecha',
      '* NEXT [#A] Con estrella',
      '* NEXT Normal',
    ].join('\n')
  );
  const tickler = tasksOf(
    '* Hoy toca\nSCHEDULED: <2026-10-21 Wed>\n* Otro día\nSCHEDULED: <2026-11-02 Mon>\n',
    '/tickler.org'
  );
  const r = planDay(tasks, TODAY, tickler);
  test('programadas de hoy y vencidas', () => {
    expect(titles(r.due)).toEqual(['Ayer', 'Límite hoy']);
  });
  test('Waiting atrasados: solo con fecha vencida', () => {
    expect(titles(r.waiting)).toEqual(['Espera vencida']);
  });
  test('tickler de hoy', () => {
    expect(titles(r.tickler)).toEqual(['Hoy toca']);
  });
  test('para elegir: las de ★ primero, sin repetir', () => {
    expect(r.pick[0].title).toBe('Con estrella');
    expect(titles(r.pick)).toContain('Normal');
    expect(new Set(titles(r.pick)).size).toBe(r.pick.length);
    expect(r.stars).toBe(1);
  });
});

describe('4.05: Cerrar el día', () => {
  test('Focus (★ o con fecha de hoy) y el resto de Next', () => {
    const r = closeDay(
      tasksOf('* NEXT [#A] Uno\n* NEXT Dos\n* DONE [#A] Hecha\n* Suelta\n', '/inbox.org'),
      TODAY
    );
    expect(titles(r.focus)).toEqual(['Uno']);
    expect(titles(r.next)).toEqual(['Dos']);
  });
});

describe('4.05: ¿Qué hago ahora?', () => {
  const eff = (e, en) =>
    `:PROPERTIES:\n${e ? `:EFFORT: ${e}\n` : ''}${en ? `:ENERGY: ${en}\n` : ''}:END:\n`;
  const tasks = tasksOf(
    '* NEXT Larga :@casa:\n' +
      eff('2:00', 'High') +
      '* NEXT Corta :@casa:\n' +
      eff('0:10', 'Low') +
      '* NEXT Ganga :@calle:\n' +
      eff(null, 'QuickWin') +
      '* NEXT [#A] Importante :@casa:\n' +
      '* TODO No es Next :@casa:\n'
  );
  test('lugares: las etiquetas @', () => {
    expect(placeTags(tasks, TODAY)).toEqual(['@calle', '@casa']);
  });
  test('por lugar: ★ primero, luego lo más corto', () => {
    expect(titles(whatNow(tasks, { tag: '@casa' }, TODAY))).toEqual([
      'Importante',
      'Corta',
      'Larga',
    ]);
  });
  test('tiempo y energía', () => {
    expect(titles(whatNow(tasks, { tag: '@casa', time: '30' }, TODAY))).toEqual([
      'Importante',
      'Corta',
    ]);
    expect(titles(whatNow(tasks, { energy: 'Low' }, TODAY))).not.toContain('Larga');
  });
  test('rápido: QuickWin o 0:10', () => {
    expect(titles(whatNow(tasks, { quick: true }, TODAY)).sort()).toEqual(['Corta', 'Ganga']);
  });
});
