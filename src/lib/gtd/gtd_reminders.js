// ORG Mode para Eli (3.25): qué avisos de fechas tocan (lógica pura, sin navegador).
// - Fechas CON hora (vence o programada): aviso a esa hora exacta.
// - Resumen diario a la hora elegida: lo que vence o está programado hoy y lo vencido.
// Igual que la revisión semanal: sin hábitos, sin proyectos, sin aparcadas ni papelera.
import { isParked } from './gtd_model';

// (4.18) Solo tareas de los ficheros del usuario: no las del manual (sample.org, que se queda
// cargado tras abrirlo: de ahí salían «Regar las plantas», «Revisar el presupuesto»…) ni las
// de ficheros internos o de prueba (STATIC_FILE_PREFIX de org_utils)
const STATIC_FILE_PREFIX = 'organice_internal_';
export const isUserTask = (t) => {
  const p = String((t && t.path) || '');
  return (
    !p.startsWith(STATIC_FILE_PREFIX) &&
    !p.startsWith('/' + STATIC_FILE_PREFIX) &&
    !p.startsWith('/__')
  );
};

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(
    2,
    '0'
  )}`;
const hm = (d) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

// Un aviso de hora exacta se da aún si llega con este retraso (app abierta tarde)
export const LATE_LIMIT_MS = 15 * 60 * 1000;

const openTasks = (tasks, now) =>
  tasks.filter(
    (t) =>
      isUserTask(t) &&
      !!t.keyword &&
      !t.isDone &&
      !t.isTrashed &&
      !t.isProject &&
      !t.isHabit &&
      !isParked(t, now)
  );

const taskKey = (t) => t.orgId || `${t.path || ''}::${t.title || ''}`;

// Avisos de hora exacta que ya tocan (entre now - LATE_LIMIT_MS y now)
export const dueTimedReminders = (tasks, now = new Date()) => {
  const out = [];
  openTasks(tasks, now).forEach((t) => {
    [
      ['deadline', t.deadline, t.deadlineTimed, 'Vence'],
      ['scheduled', t.scheduled, t.scheduledTimed, 'Programada'],
    ].forEach(([kind, date, timed, label]) => {
      if (!date || !timed) return;
      const diff = +now - +date;
      if (diff < 0 || diff > LATE_LIMIT_MS) return;
      out.push({
        key: `t:${kind}:${taskKey(t)}:${date.toISOString()}`,
        title: t.title || 'Tarea',
        body: `${label} a las ${hm(date)}`,
      });
    });
  });
  return out;
};

// Resumen del día (o null si no hay nada o aún no es la hora)
export const dailySummary = (tasks, now = new Date(), hour = 9) => {
  if (now.getHours() < hour) return null;
  const t0 = startOfDay(now);
  const isToday = (d) => !!d && +startOfDay(d) === +t0;
  const isBefore = (d) => !!d && startOfDay(d) < t0;
  const open = openTasks(tasks, now);
  const today = open.filter((t) => isToday(t.deadline) || isToday(t.scheduled));
  const overdue = open.filter(
    (t) => !today.includes(t) && (isBefore(t.deadline) || isBefore(t.scheduled))
  );
  if (!today.length && !overdue.length) return null;
  const parts = [];
  if (today.length) parts.push(`${today.length} para hoy`);
  if (overdue.length) parts.push(`${overdue.length} vencida${overdue.length === 1 ? '' : 's'}`);
  const names = [...today, ...overdue].slice(0, 4).map((t) => `• ${t.title}`);
  const more = today.length + overdue.length - names.length;
  return {
    key: `d:${ymd(now)}`,
    title: `Tareas: ${parts.join(', ')}`,
    body: [...names, more > 0 ? `y ${more} más` : ''].filter(Boolean).join('\n'),
  };
};
