// ORG Mode para Eli (4.38): diario compatible con org-journal (+ franja «Hábitos de hoy»)
import {
  strftime,
  periodStart,
  journalFileName,
  journalFilePath,
  journalFileDate,
  journalFileDateAny,
  isDiaryPath,
  isLegacyText,
  titleDayKey,
  newFileText,
  ensureDay,
  addEntry,
  setAnswer,
  ensureDayId,
  setDayProp,
  setMonthProp,
  parseMonthProps,
  parseDays,
  withDiaryIds,
  setDiaryCfg,
  getDiaryCfg,
  habitsToday,
} from './eli_diary';
import { monthlyData, regenerateMonthly } from './eli_monthly';

const d = (y, m, day, h = 10, min = 0) => new Date(y, m - 1, day, h, min);
const J = getDiaryCfg().journal;
const OLD = `#+TITLE: Diari 2026
#+STARTUP: overview

* 2026-10 octubre
:PROPERTIES:
:CINTURA: 80
:END:
** 2026-10-24 sábado
- Lo más importante de hoy :: viejo
- 09:00 - café
`;

describe('4.38 rutas org-journal', () => {
  test('valores por defecto: anual, %Y, cabecera y fecha', () => {
    expect(J).toMatchObject({ type: 'yearly', fileFormat: '%Y', dateFormat: '%A, %d %B %Y' });
    expect(journalFilePath(d(2026, 10, 24), J, '/o/journal/')).toBe('/o/journal/2026.org');
    expect(newFileText(d(2026, 10, 24), J)).toBe('#+TITLE: Diari 2026\n#+STARTUP: folded\n\n');
    expect(strftime('%A, %d %B %Y', d(2026, 10, 24))).toBe('sábado, 24 octubre 2026');
  });
  test('nombre por tipo (fecha = inicio del periodo)', () => {
    const t = d(2026, 10, 24); // sábado
    expect(journalFileName(t, { ...J, type: 'daily', fileFormat: '%Y%m%d' })).toBe('20261024.org');
    expect(journalFileName(t, { ...J, type: 'weekly', fileFormat: '%Y%m%d' })).toBe('20261019.org');
    expect(journalFileName(t, { ...J, type: 'weekly', fileFormat: '%Y%m%d', weekStart: 7 })).toBe(
      '20261018.org'
    );
    expect(journalFileName(t, { ...J, type: 'monthly', fileFormat: '%Y%m%d' })).toBe(
      '20261001.org'
    );
    expect(journalFileName(t, { ...J, fileFormat: 'diari-%Y' })).toBe('diari-2026.org');
    expect(+periodStart(t, J)).toBe(+d(2026, 1, 1, 0));
  });
  test('fecha desde el nombre y ficheros del diario', () => {
    expect(+journalFileDate('/a/20261024.org', '%Y%m%d')).toBe(+d(2026, 10, 24, 0));
    expect(+journalFileDate('2026.org', '%Y')).toBe(+d(2026, 1, 1, 0));
    expect(journalFileDate('mensual-2026.org', '%Y')).toBe(null);
    expect(journalFileDateAny('/x/20261024.org', J).daily).toBe(true);
    window.localStorage.removeItem('eliDiary');
    expect(isDiaryPath('/org/journal/2026.org')).toBe(true);
    expect(isDiaryPath('/org/journal/20261024.org')).toBe(true);
    expect(isDiaryPath('/org/otra/2026.org')).toBe(false);
    expect(isDiaryPath('/org/journal/mensual-2026.org')).toBe(true);
    expect(isDiaryPath('/org/journal/notas.org')).toBe(false);
  });
  test('título del día → fecha', () => {
    expect(titleDayKey('sábado, 24 octubre 2026')).toBe('2026-10-24');
    expect(titleDayKey('Saturday, October 24, 2026')).toBe('2026-10-24');
    expect(titleDayKey('2026-10-24 sábado')).toBe('2026-10-24');
    expect(titleDayKey("dissabte, 24 d'octubre de 2026")).toBe('2026-10-24');
    expect(titleDayKey('Notas sueltas')).toBe(null);
  });
});

describe('4.38 escritura org-journal (anual)', () => {
  const tpl = ['¿Cómo me siento hoy?', 'Lo más importante de hoy'];
  test('día con :CREATED:, plantilla bajo cabecera y orden ascendente', () => {
    let t = ensureDay('', d(2026, 10, 24), tpl, J).text;
    expect(t).toBe(
      '#+TITLE: Diari 2026\n#+STARTUP: folded\n* sábado, 24 octubre 2026\n:PROPERTIES:\n' +
        ':CREATED:  20261024\n:END:\n** Plantilla del día\n- ¿Cómo me siento hoy? ::\n' +
        '- Lo más importante de hoy ::\n'
    );
    expect(isLegacyText(t)).toBe(false);
    t = ensureDay(t, d(2026, 10, 2), [], J).text;
    t = ensureDay(t, d(2026, 11, 1), [], J).text;
    const order = ['20261002', '20261024', '20261101'].map((k) => t.indexOf(k));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(ensureDay(t, d(2026, 10, 24), tpl, J).created).toBe(false);
    expect(parseDays(t).map((x) => x.key)).toEqual(['2026-10-02', '2026-10-24', '2026-11-01']);
  });
  test('apuntes `** HH:MM marca` con continuación, en orden por hora', () => {
    let t = addEntry('', d(2026, 10, 24), { text: 'café', time: '13:23' }, ['P'], J);
    t = addEntry(
      t,
      d(2026, 10, 24),
      { text: 'cita\nen el centro', mark: 'o', time: '09:05' },
      [],
      J
    );
    t = addEntry(
      t,
      d(2026, 10, 24),
      { text: 'ojo\n* no es cabecera', mark: '!', time: '20:00' },
      [],
      J
    );
    expect(t).toContain(
      '** Plantilla del día\n- P ::\n** 09:05 o cita\nen el centro\n** 13:23 - café\n** 20:00 ! ojo\n * no es cabecera'
    );
    const day = parseDays(t)[0];
    expect(day.entries.map((e) => [e.time, e.mark, e.text])).toEqual([
      ['09:05', 'o', 'cita'],
      ['13:23', '-', 'café'],
      ['20:00', '!', 'ojo'],
    ]);
    expect(day.entries[0].body).toBe('en el centro');
    expect(day.heads).toEqual([]);
    expect(day.answers).toEqual([{ question: 'P', answer: '' }]);
  });
  test('respuestas, :ID: tras :CREATED: y cabeceras sin hora del usuario', () => {
    let t = ensureDay('', d(2026, 10, 24), ['A'], J).text;
    t = setAnswer(t, d(2026, 10, 24), 'A', 'uno', J);
    t = setAnswer(t, d(2026, 10, 24), 'B', 'dos', J);
    expect(t).toContain('** Plantilla del día\n- A :: uno\n- B :: dos');
    const r = ensureDayId(t + '** Viaje\nnotas\n', d(2026, 10, 24), J);
    expect(r.id).toBe('diari-2026-10-24');
    expect(r.text).toContain(':PROPERTIES:\n:CREATED:  20261024\n:ID: diari-2026-10-24\n:END:');
    const day = parseDays(r.text)[0];
    expect(day.answers.map((a) => a.answer)).toEqual(['uno', 'dos']);
    expect(day.heads).toEqual([{ title: 'Viaje', body: 'notas' }]);
    // withDiaryIds: solo días con algo y sin :ID: de mes
    const w = withDiaryIds(ensureDay(t, d(2026, 10, 25), ['A'], J).text);
    expect(w).toContain(':ID: diari-2026-10-24');
    expect(w).not.toContain(':ID: diari-2026-10-25');
    expect(w).not.toContain(':ID: diari-2026-10\n');
  });
  test('contadores diarios y mensuales (valor del mes = el último)', () => {
    let t = setDayProp('', d(2026, 10, 3), 'km', '4,5', [], J);
    expect(t).toContain(':CREATED:  20261003\n:KM: 4,5\n:END:');
    t = setMonthProp(t, d(2026, 10, 5), 'cintura', '82', J);
    expect(t).toContain(
      '* lunes, 05 octubre 2026\n:PROPERTIES:\n:CREATED:  20261005\n:CINTURA: 82'
    );
    expect(parseMonthProps(t)['2026-10']).toEqual({ KM: '4,5', CINTURA: '82' });
    // cambiarlo otro día del mes cambia el que ya hay
    t = setMonthProp(t, d(2026, 10, 20), 'cintura', '81', J);
    expect(t).toContain(':CINTURA: 81');
    expect(t).not.toContain('20261020');
    // a mano en un día posterior: manda el último
    t = setDayProp(t, d(2026, 10, 28), 'CINTURA', '79', [], J);
    expect(parseMonthProps(t)['2026-10'].CINTURA).toBe('79');
    expect(parseMonthProps(t)['2026-10'].ID).toBeUndefined();
    t = setMonthProp(t, d(2026, 10, 1), 'cintura', '', J);
    expect(parseMonthProps(t)['2026-10'].CINTURA).toBe('81');
  });
  test('ficheros diarios: sin :CREATED: y fecha por el nombre', () => {
    const jd = { ...J, type: 'daily', fileFormat: '%Y%m%d' };
    const t = addEntry('', d(2026, 10, 24), { text: 'hola', time: '08:00' }, [], jd);
    expect(t).not.toContain(':CREATED:');
    expect(parseDays(t.replace('* sábado, 24 octubre 2026', '* Hoy'), '2026-10-24')[0].key).toBe(
      '2026-10-24'
    );
  });
});

describe('4.38 convivencia con el formato anterior', () => {
  test('un fichero antiguo se sigue escribiendo en el formato antiguo', () => {
    expect(isLegacyText(OLD)).toBe(true);
    const t = addEntry(OLD, d(2026, 10, 25), { text: 'paseo', time: '10:00' }, [], J);
    expect(t).toContain('** 2026-10-25 domingo\n- 10:00 - paseo');
    expect(t).not.toContain(':CREATED:');
    expect(setMonthProp(OLD, d(2026, 10, 2), 'cintura', '81', J)).toContain(
      '* 2026-10 octubre\n:PROPERTIES:\n:CINTURA: 81'
    );
  });
  test('se leen ambos formatos juntos (paquete del año)', () => {
    const nuevo = addEntry('', d(2026, 10, 26), { text: 'nuevo', time: '11:00' }, [], J);
    const b = {
      year: 2026,
      files: [
        { path: '/j/2026.org', text: nuevo },
        { path: '/j/diari-2026.org', text: OLD },
        { path: '/j/20251229.org', text: addEntry('', d(2025, 12, 30), { text: 'x' }, [], J) },
      ],
    };
    const days = parseDays(b);
    expect(days.map((x) => [x.key, x.path])).toEqual([
      ['2026-10-24', '/j/diari-2026.org'],
      ['2026-10-26', '/j/2026.org'],
    ]);
    expect(days[0].entries[0].text).toBe('café');
    expect(days[0].answers[0].answer).toBe('viejo');
    expect(parseMonthProps(b)['2026-10'].CINTURA).toBe('80');
    // registro mensual: enlace al :ID: del mes si lo hay; si no, al primer día con algo
    const m = monthlyData(b, 2026, []);
    expect(m.months[0].link).toBe('diari-2026-10-24');
    const only = { year: 2026, files: [{ path: '/j/2026.org', text: nuevo }] };
    const out = regenerateMonthly('', 2026, only, []);
    expect(out).toContain('* 2026-10 octubre [[id:diari-2026-10-26][Ver en el diari]]');
    const old = out.replace('[[id:diari-2026-10-26]', '[[id:diari-2026-10]');
    expect(regenerateMonthly(old, 2026, only, [])).toContain('[[id:diari-2026-10-26]');
  });
});

describe('4.38 ajustes y hábitos', () => {
  test('ajuste org-journal limpio y guardado', () => {
    setDiaryCfg({ journal: { type: 'semanal?', fileFormat: ' diari-%Y.org ', weekStart: 9 } });
    expect(getDiaryCfg().journal).toMatchObject({
      type: 'yearly',
      fileFormat: 'diari-%Y',
      weekStart: 1,
    });
    expect(getDiaryCfg().habitsOn).toBe(true);
    window.localStorage.removeItem('eliDiary');
  });
  test('hábitos que tocan hoy', () => {
    const today = d(2026, 10, 27, 12);
    const tasks = [
      { title: 'Leer', keyword: 'TODO', isHabit: true, scheduled: d(2026, 10, 27, 0) },
      { title: 'Correr', keyword: 'TODO', isHabit: true, scheduled: d(2026, 10, 25, 0) },
      { title: 'Futuro', keyword: 'TODO', isHabit: true, scheduled: d(2026, 10, 29, 0) },
      {
        title: 'Agua',
        keyword: 'TODO',
        isHabit: true,
        scheduled: d(2026, 10, 28, 0),
        description: '- State "DONE"       from "TODO"       [2026-10-27 mar 09:00]',
      },
      { title: 'No hábito', keyword: 'TODO', scheduled: d(2026, 10, 27, 0) },
      { title: 'Tirado', keyword: 'TODO', isHabit: true, isTrashed: true, scheduled: today },
    ];
    expect(habitsToday(tasks, today).map((h) => [h.task.title, h.done])).toEqual([
      ['Agua', true],
      ['Correr', false],
      ['Leer', false],
    ]);
  });
});
