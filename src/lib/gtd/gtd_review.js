// ORG Mode para Eli (3.24): revisión semanal guiada (GTD). Modelo puro: de las tareas a lo que hay
// que mirar en cada paso. Pasos: Inbox, proyectos sin acción siguiente, dormidos, fechas
// (vencidas y próximos 7 días) y «Algún día».
import {
  listOf,
  projectsOf,
  projectState,
  projectSectionOf,
  inProject,
  isParked,
} from './gtd_model';

export const REVIEW_STEPS = [
  {
    id: 'inbox',
    label: 'Vaciar el Inbox',
    icon: 'fas fa-inbox',
    hint: 'Procesa cada elemento: hazlo, pásalo a una lista o a un proyecto, prográmalo o tíralo.',
    view: 'inbox',
  },
  {
    id: 'stalled',
    label: 'Proyectos sin acción siguiente',
    icon: 'fas fa-project-diagram',
    hint: 'Cada proyecto activo necesita al menos una acción Next (o dormirlo, o cerrarlo).',
  },
  {
    id: 'sleep',
    label: 'Dormidos',
    icon: 'fas fa-bed',
    hint: '¿Hay que despertar alguno, o ya no hace falta?',
  },
  {
    id: 'dates',
    label: 'Vencidas y próximas fechas',
    icon: 'far fa-calendar-alt',
    hint: 'Lo atrasado y lo que vence o está programado en los próximos 7 días.',
  },
  {
    id: 'someday',
    label: 'Algún día',
    icon: 'fas fa-cloud',
    hint: '¿Algo que pasar a Next, o que ya se puede tirar?',
    view: 'someday',
  },
];

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
  return { inbox, stalled, sleep, overdue, upcoming, someday };
};

// Cuántos elementos hay en un paso
export const reviewCount = (r, id) =>
  id === 'dates' ? r.overdue.length + r.upcoming.length : (r[id] || []).length;
