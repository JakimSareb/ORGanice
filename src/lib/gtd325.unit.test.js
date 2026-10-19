import { dueTimedReminders, dailySummary, LATE_LIMIT_MS } from './gtd/gtd_reminders';

const base = { keyword: 'TODO', isDone: false, isTrashed: false, isProject: false, isHabit: false };
const at = (y, m, d, h = 12, mi = 0) => new Date(y, m - 1, d, h, mi);

describe('3.25 avisos de fechas', () => {
  const now = at(2026, 10, 19, 10, 5);

  test('aviso a la hora exacta solo para fechas con hora, hasta 15 min tarde', () => {
    const tasks = [
      {
        ...base,
        title: 'Llamar',
        path: '/a.org',
        deadline: at(2026, 10, 19, 10, 0),
        deadlineTimed: true,
      },
      {
        ...base,
        title: 'Sin hora',
        path: '/a.org',
        scheduled: at(2026, 10, 19),
        scheduledTimed: false,
      },
      {
        ...base,
        title: 'Futura',
        path: '/a.org',
        scheduled: at(2026, 10, 19, 11, 0),
        scheduledTimed: true,
      },
      {
        ...base,
        title: 'Vieja',
        path: '/a.org',
        scheduled: new Date(+now - LATE_LIMIT_MS - 1000),
        scheduledTimed: true,
      },
      {
        ...base,
        title: 'Hecha',
        isDone: true,
        path: '/a.org',
        deadline: at(2026, 10, 19, 10, 0),
        deadlineTimed: true,
      },
      {
        ...base,
        title: 'Hábito',
        isHabit: true,
        path: '/a.org',
        deadline: at(2026, 10, 19, 10, 0),
        deadlineTimed: true,
      },
    ];
    const r = dueTimedReminders(tasks, now);
    expect(r.map((x) => x.title)).toEqual(['Llamar']);
    expect(r[0].body).toBe('Vence a las 10:00');
  });

  test('resumen diario: hoy + vencidas, solo desde la hora elegida', () => {
    const tasks = [
      { ...base, title: 'Hoy', scheduled: at(2026, 10, 19) },
      { ...base, title: 'Ayer', deadline: at(2026, 10, 18) },
      { ...base, title: 'Mañana', deadline: at(2026, 10, 20) },
    ];
    expect(dailySummary(tasks, now, 11)).toBeNull();
    const s = dailySummary(tasks, now, 9);
    expect(s.key).toBe('d:2026-10-19');
    expect(s.title).toBe('Tareas: 1 para hoy, 1 vencida');
    expect(s.body).toBe('• Hoy\n• Ayer');
  });

  test('sin nada para hoy no hay resumen', () => {
    expect(dailySummary([{ ...base, title: 'X', deadline: at(2026, 10, 25) }], now, 9)).toBeNull();
  });
});
