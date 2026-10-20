// ORG Mode para Eli (3.24): revisión semanal guiada (GTD). Modelo puro: de las tareas a lo que hay
// que mirar en cada paso (desde 3.41, los de la checklist oficial: ver REVIEW_STEPS).
import {
  listOf,
  projectsOf,
  projectState,
  projectSectionOf,
  inProject,
  isParked,
} from './gtd_model';

// (3.41) Pasos adaptados a la checklist oficial de GTD (Weekly Review®, David Allen Company):
// DESPEJAR (Get Clear: recoger papeles, Inbox a cero, vaciar la cabeza) → AL DÍA (Get Current:
// listas de acciones, calendario pasado y próximo, Waiting, proyectos) → CREAR (Get Creative:
// Someday/Maybe e ideas nuevas). «Elegir para la semana» va justo después de revisar Next.
export const REVIEW_PHASES = { clear: 'Despejar', current: 'Al día', creative: 'Crear' };

export const REVIEW_STEPS = [
  {
    id: 'inbox',
    phase: 'clear',
    label: 'Vaciar la cabeza y el Inbox',
    icon: 'fas fa-inbox',
    hint:
      'Junta papeles, notas, correos y mensajes; apunta lo que tengas en la cabeza (proyectos, ' +
      'acciones, esperas, ideas) y deja el Inbox a cero.',
    view: 'inbox',
  },
  {
    id: 'next',
    phase: 'current',
    label: 'Revisar Next',
    icon: 'fas fa-play',
    hint: 'Marca lo hecho y quita de Next lo que esta semana no se va a hacer.',
    view: 'next',
  },
  {
    id: 'week',
    phase: 'current',
    label: 'Elegir para la semana',
    icon: 'fas fa-hand-pointer',
    hint: 'Pasa a Next lo que quieras hacer esta semana, de Todo o de Someday.',
  },
  {
    id: 'dates',
    phase: 'current',
    label: 'Calendario: atrasado y próximo',
    icon: 'far fa-calendar-alt',
    hint:
      'Lo que se quedó atrás y lo que vence o está programado en los próximos 7 días. ' +
      '¿Pide alguna acción nueva?',
  },
  {
    id: 'waiting',
    phase: 'current',
    label: 'Waiting',
    icon: 'fas fa-hourglass-half',
    hint: 'Marca lo que ya ha llegado y apunta un seguimiento para lo que se retrasa.',
    view: 'waiting',
  },
  {
    id: 'stalled',
    phase: 'current',
    label: 'Proyectos sin acción siguiente',
    icon: 'fas fa-project-diagram',
    hint: 'Cada proyecto activo necesita al menos una acción Next (o dormirlo, o cerrarlo).',
  },
  {
    id: 'sleep',
    phase: 'current',
    label: 'Dormidos',
    icon: 'fas fa-bed',
    hint: '¿Hay que despertar alguno, o ya no hace falta?',
  },
  {
    id: 'someday',
    phase: 'creative',
    label: 'Someday e ideas nuevas',
    icon: 'fas fa-cloud',
    hint:
      '¿Algún proyecto que activar? Tira lo que ya no interese y apunta cualquier idea nueva, ' +
      'por loca que parezca.',
    view: 'someday',
  },
];

// Índice de un paso por su id (−1 si no existe)
export const reviewStepIndex = (id) => REVIEW_STEPS.findIndex((s) => s.id === id);

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const DAY = 86400000;
const firstDate = (t) => {
  const ds = [t.deadline, t.scheduled].filter(Boolean);
  return ds.length ? new Date(Math.min(...ds.map((d) => +d))) : null;
};
const byDate = (a, b) => (firstDate(a) || 0) - (firstDate(b) || 0);
const byTitle = (a, b) => (a.title || '').localeCompare(b.title || '');

// Proyecto activo «atascado»: sin ninguna acción abierta en Next (ni subproyectos abiertos)
const isStalled = (p, tasks, today) =>
  !tasks.some(
    (t) =>
      inProject(t, p) &&
      !t.isDone &&
      !t.isTrashed &&
      (t.isProject || (!!t.keyword && projectSectionOf(t, today) === 'next'))
  );

export const weeklyReview = (tasks, today = new Date()) => {
  const live = tasks.filter((t) => !t.isTrashed);
  const t0 = startOfDay(today);
  const in7 = new Date(+t0 + 7 * DAY);
  const inbox = live.filter((t) => listOf(t, today) === 'inbox');
  const someday = live.filter((t) => listOf(t, today) === 'someday');
  // (3.41) acciones de Next (todas, no solo la 1.ª de cada proyecto), Todo y Waiting
  const next = live.filter((t) => !t.isProject && listOf(t, today) === 'next').sort(byTitle);
  const later = live.filter((t) => !t.isProject && listOf(t, today) === 'later');
  const waiting = live.filter((t) => !t.isProject && listOf(t, today) === 'waiting');
  const projects = projectsOf(live);
  const stalled = projects
    .filter((p) => projectState(p, today) === 'active' && isStalled(p, live, today))
    .sort(byTitle);
  // Dormidos: los proyectos y las tareas con su propio :STATUS: sleep (no lo que hay debajo)
  const sleep = live
    .filter((t) => !t.isDone && t.ownSleep && (t.isProject || !!t.keyword))
    .sort((a, b) => (a.isProject === b.isProject ? byTitle(a, b) : a.isProject ? -1 : 1));
  const open = live.filter(
    (t) => !!t.keyword && !t.isDone && !t.isProject && !t.isHabit && !isParked(t, today)
  );
  const before = (d) => !!d && startOfDay(d) < t0;
  const soon = (d) => !!d && startOfDay(d) >= t0 && startOfDay(d) <= in7;
  const overdue = open.filter((t) => before(t.deadline) || before(t.scheduled)).sort(byDate);
  const upcoming = open
    .filter((t) => !overdue.includes(t) && (soon(t.deadline) || soon(t.scheduled)))
    .sort(byDate);
  return { inbox, next, later, waiting, stalled, sleep, overdue, upcoming, someday };
};

// Cuántos elementos hay en un paso
// (3.41) «Elegir para la semana» = Todo + Someday
export const reviewCount = (r, id) =>
  id === 'dates'
    ? r.overdue.length + r.upcoming.length
    : id === 'week'
    ? r.later.length + r.someday.length
    : (r[id] || []).length;
