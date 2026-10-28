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
  // (4.04) primero, lo terminado desde la última revisión (para verlo y celebrarlo; ¿pide algo?)
  {
    id: 'closed',
    phase: 'clear',
    label: 'Terminadas desde la última revisión',
    icon: 'fas fa-check-double',
    hint:
      'Repasa lo que has terminado desde la última revisión semanal (sin revisión anterior, ' +
      'los últimos 7 días). ¿Falta apuntar algún paso siguiente o avisar a alguien?',
    view: 'logbook',
  },
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

// (4.15) «Allen estricto»: la checklist oficial de la Weekly Review, paso a paso y sin extras
// (Terminadas, Elegir para la semana y Dormidos solo salen con el ajuste apagado).
export const STRICT_REVIEW_STEPS = [
  {
    id: 'loose',
    phase: 'clear',
    label: 'Papeles y materiales sueltos',
    icon: 'fas fa-folder-open',
    hint:
      'Recoge papeles, notas, tarjetas, recibos y demás cosas sueltas (también en el bolso, la ' +
      'mesa o el móvil) y mételas en el Inbox.',
    capture: 'Apuntar al Inbox',
  },
  {
    id: 'inbox',
    phase: 'clear',
    label: 'Inbox a cero',
    icon: 'fas fa-inbox',
    hint: 'Procesa cada cosa del Inbox hasta dejarlo vacío.',
    view: 'inbox',
  },
  {
    id: 'mind',
    phase: 'clear',
    label: 'Vaciar la cabeza',
    icon: 'fas fa-box-open',
    hint:
      'Apunta todo lo que tengas en la cabeza: proyectos, acciones, esperas, ideas. El Volcado ' +
      'mental te lo pregunta por categorías.',
    capture: 'Apuntar al Inbox',
  },
  {
    id: 'next',
    phase: 'current',
    label: 'Revisar Next',
    icon: 'fas fa-play',
    hint: 'Tacha lo que ya está hecho. ¿Hay más pasos que apuntar?',
    view: 'next',
    capture: 'Apuntar un paso al Inbox',
  },
  {
    id: 'past',
    phase: 'current',
    label: 'Calendario pasado',
    icon: 'fas fa-history',
    hint:
      'Repasa con detalle lo que tenía fecha desde la última revisión (y lo atrasado): ¿quedó ' +
      'alguna acción pendiente, algo que apuntar o que guardar como referencia?',
    capture: 'Apuntar al Inbox',
  },
  {
    id: 'upcoming',
    phase: 'current',
    label: 'Calendario próximo',
    icon: 'far fa-calendar-alt',
    hint:
      'Mira lo que viene, a corto y a largo plazo: ¿hay que preparar algo o dispara alguna acción?',
    capture: 'Apuntar al Inbox',
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
    id: 'projects',
    phase: 'current',
    label: 'Proyectos, uno a uno',
    icon: 'fas fa-project-diagram',
    hint:
      'Cada proyecto activo: ¿cómo va? ¿sigue teniendo sentido su resultado? Mira sus notas y ' +
      'material: cada uno necesita al menos una acción siguiente.',
  },
  {
    id: 'goals',
    phase: 'current',
    label: 'Objetivos y resultados mayores',
    icon: 'fas fa-bullseye',
    hint: 'Repasa tus objetivos y resultados mayores: ¿piden algún proyecto o acción nueva?',
    capture: 'Apuntar al Inbox',
  },
  {
    id: 'checklists',
    phase: 'current',
    label: 'Checklists relevantes',
    icon: 'fas fa-tasks',
    hint:
      'Repasa las listas de control que uses (responsabilidades, rutinas, viajes, eventos…): ' +
      '¿falta hacer algo?',
    // (4.49) abre la sección «Checklist» (la propia del usuario; ver findChecklistSection)
    view: 'checklist',
    capture: 'Apuntar al Inbox',
  },
  {
    id: 'someday',
    phase: 'creative',
    label: 'Someday / Maybe',
    icon: 'fas fa-cloud',
    hint: 'Activa lo que ya toque (pásalo a su lista) y borra lo que ya no te interese.',
    view: 'someday',
  },
  {
    id: 'creative',
    phase: 'creative',
    label: 'Sé creativo y valiente',
    icon: 'fas fa-lightbulb',
    hint: '¿Alguna idea nueva, atrevida o creativa que añadir? Apúntala, por loca que parezca.',
    capture: 'Apuntar una idea',
  },
];

// (4.47) Paso opcional al final: la Revisión ZK (ajuste «Añadir la Revisión ZK como paso de la
// Revisión semanal», apagado por defecto: sin él, los pasos de Allen no cambian)
export const ZK_REVIEW_STEP = {
  id: 'zk',
  phase: 'creative',
  label: 'Revisión ZK',
  icon: 'far fa-lightbulb',
  hint: 'Repasa el Zettelkasten: fugaces, notas huérfanas, índices y fichas sin procesar.',
};
export const zkReviewOn = () => {
  try {
    return window.localStorage.getItem('eliZkWeeklyReview') === 'true';
  } catch (e) {
    return false;
  }
};

// Pasos según el ajuste «Allen estricto» (y el de la Revisión ZK)
export const reviewSteps = (strict, { zk = false } = {}) => {
  const base = strict ? STRICT_REVIEW_STEPS : REVIEW_STEPS;
  return zk ? [...base, ZK_REVIEW_STEP] : base;
};

// Índice de un paso por su id (−1 si no existe)
export const reviewStepIndex = (id, steps = REVIEW_STEPS) => steps.findIndex((s) => s.id === id);

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

export const weeklyReview = (tasks, today = new Date(), lastReview = null) => {
  const live = tasks.filter((t) => !t.isTrashed);
  const t0 = startOfDay(today);
  // (4.04) terminadas desde la última revisión (o en los últimos 7 días), las más nuevas primero
  const lastAt = lastReview ? new Date(lastReview) : null;
  const since = lastAt && !isNaN(+lastAt) ? lastAt : new Date(+t0 - 7 * DAY);
  const closed = live
    .filter((t) => t.isDone && !!t.closed && +t.closed >= +since)
    .sort((a, b) => +b.closed - +a.closed);
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
  // (4.15) calendario pasado: lo que tenía fecha desde la última revisión (también lo hecho);
  // las atrasadas aparte. Próximo: 7 días y «más adelante» (largo plazo)
  const dated = live.filter((t) => !!t.keyword && !t.isProject && !t.isHabit);
  const pastDone = dated
    .filter((t) => !overdue.includes(t))
    .filter((t) =>
      [t.deadline, t.scheduled].some(
        (d) => !!d && startOfDay(d) < t0 && +startOfDay(d) >= +startOfDay(since)
      )
    )
    .sort(byDate);
  const farther = open
    .filter((t) => {
      const d = firstDate(t);
      return !!d && startOfDay(d) > in7;
    })
    .sort(byDate);
  // proyectos activos, uno a uno, con sus acciones Next
  const projectCards = projects
    .filter((p) => projectState(p, today) === 'active')
    .sort(byTitle)
    .map((p) => ({
      project: p,
      next: live.filter(
        (t) =>
          inProject(t, p) &&
          !t.isDone &&
          !t.isProject &&
          !!t.keyword &&
          projectSectionOf(t, today) === 'next'
      ),
    }));
  return {
    closed,
    inbox,
    next,
    later,
    waiting,
    stalled,
    sleep,
    overdue,
    upcoming,
    someday,
    pastDone,
    farther,
    projects: projectCards,
  };
};

// Cuántos elementos hay en un paso
// (3.41) «Elegir para la semana» = Todo + Someday
export const reviewCount = (r, id) =>
  id === 'past'
    ? r.overdue.length + r.pastDone.length
    : id === 'upcoming'
    ? r.upcoming.length + r.farther.length
    : id === 'dates'
    ? r.overdue.length + r.upcoming.length
    : id === 'week'
    ? r.later.length + r.someday.length
    : (r[id] || []).length;
