// ORG Mode para Eli: vista GTD (estilo Nirvana). Modelo puro: de los ficheros Org a tareas y
// listas, sin tocar nada. Reglas (acordadas con el usuario):
//   Inbox     = etiqueta @inbox, o encabezados sin estado del fichero de entrada (inbox.org)
//   Next      = NEXT · Todo (id 'later') = TODO · Waiting = WAITING · Someday = MAYBE
//   Scheduled = con SCHEDULED posterior a hoy (hasta ese día no aparece en ninguna otra vista;
//               al llegar el día vuelve a su lista y se le pone [#A], salvo a los hábitos;
//               lo mismo al llegar su DEADLINE). Con DEADLINE se ven siempre en su lista.
//   Projects  = PROJECT (sus descendientes son sus acciones)
//   Focus     = ★ [#A] o programado/vence hoy o antes (abiertas; sin hábitos)
//   Deadline  = tareas abiertas con DEADLINE (vencidas incluidas), por fecha de vencimiento
//   Logbook   = terminadas (DONE, CANCELLED…) · Reference = encabezados sin estado ni tareas debajo
//   Áreas     = propiedad :AREA: (se hereda) · Energía :ENERGY: · Tiempo :EFFORT:
import { List } from 'immutable';
import { attributedStringToRawText } from '../export_org';
import { dateForTimestamp } from '../timestamps';
import { DEFAULT_ENERGY, DEFAULT_EFFORT } from '../eli_todo_defaults';

export const LISTS = [
  { id: 'focus', label: 'Focus', icon: 'fas fa-star' },
  { id: 'inbox', label: 'Inbox', icon: 'fas fa-inbox' },
  { id: 'next', label: 'Next', icon: 'fas fa-play' },
  { id: 'later', label: 'Todo', icon: 'fas fa-forward' },
  { id: 'waiting', label: 'Waiting', icon: 'fas fa-hourglass-half' },
  { id: 'scheduled', label: 'Scheduled', icon: 'far fa-calendar-alt' },
  { id: 'deadline', label: 'Deadline', icon: 'fas fa-flag' },
  { id: 'someday', label: 'Someday', icon: 'fas fa-cloud' },
];
export const EXTRA_LISTS = [
  { id: 'reference', label: 'Reference', icon: 'far fa-file-alt' },
  { id: 'logbook', label: 'Logbook', icon: 'fas fa-check' },
];

export const KEYWORD_FOR_LIST = {
  next: 'NEXT',
  later: 'TODO',
  waiting: 'WAITING',
  someday: 'MAYBE',
  scheduled: 'TODO',
  inbox: null,
  reference: null,
};
const LIST_FOR_KEYWORD = { NEXT: 'next', TODO: 'later', WAITING: 'waiting', MAYBE: 'someday' };

// Energía y tiempo: como en Emacs, «#+PROPERTY: Energy_ALL …» y «#+PROPERTY: Effort_ALL …»
// (valores por defecto en lib/eli_todo_defaults)
export const ENERGY_LEVELS = DEFAULT_ENERGY;
export const EFFORT_OPTIONS = DEFAULT_EFFORT;
export const TIME_BUCKETS = [
  { id: '10', label: '≤ 10 min', max: 10 },
  { id: '30', label: '≤ 30 min', max: 30 },
  { id: '60', label: '≤ 1 h', max: 60 },
  { id: '120', label: '≤ 2 h', max: 120 },
  { id: 'more', label: '> 2 h', min: 121 },
];

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// "1:30" → 90; "45" → 45; "2h" → 120
export const effortMinutes = (effort) => {
  if (!effort) return null;
  const s = String(effort).trim();
  let m = /^(\d+):(\d{1,2})$/.exec(s);
  if (m) return +m[1] * 60 + +m[2];
  m = /^(\d+(?:[.,]\d+)?)\s*h$/i.exec(s);
  if (m) return Math.round(parseFloat(m[1].replace(',', '.')) * 60);
  m = /^(\d+)\s*(min|m)?$/i.exec(s);
  if (m) return +m[1];
  return null;
};

export const propertyValue = (header, name) => {
  const item = (header.get('propertyListItems') || List()).find(
    (p) => (p.get('property') || '').toUpperCase() === name.toUpperCase()
  );
  if (!item || !item.get('value')) return null;
  const v = attributedStringToRawText(item.get('value')).trim();
  return v || null;
};

const planningDate = (header, type) => {
  const item = (header.get('planningItems') || List()).find((p) => p.get('type') === type);
  if (!item) return null;
  try {
    return dateForTimestamp(item.get('timestamp'));
  } catch (e) {
    return null;
  }
};

export const PRIORITY_RE = /^\s*\[#([A-Z0-9])\]\s*/;

// Título "limpio" (sin prioridad) y sin enlaces en bruto: [[url][texto]] → texto
export const displayTitle = (rawTitle) =>
  (rawTitle || '')
    .replace(PRIORITY_RE, '')
    .replace(/\[\[([^\]]+)\]\[([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .trim();

const completedKeywordsOf = (file) =>
  new Set(
    (file.get('todoKeywordSets') || List())
      .flatMap((s) => s.get('completedKeywords') || List())
      .toArray()
  );

/**
 * Tareas de todos los ficheros cargados.
 * @param files Immutable Map path → file
 * @param inboxPaths rutas de los ficheros de entrada
 */
// ORG Mode para Eli: las tareas de cada fichero se calculan una vez y se reutilizan mientras el
// fichero no cambie (los ficheros son inmutables: si no cambian, son el mismo objeto). Así, volver
// a la vista GTD o cambiar de lista no recalcula miles de encabezados.
const fileTasksCache = new WeakMap();

export const buildTasks = (files, inboxPaths = []) => {
  const tasks = [];
  if (!files) return tasks;
  files.forEach((file, path) => {
    if (!path || !file || !file.get('headers')) return;
    const isInboxFile = inboxPaths.includes(path);
    const cached = fileTasksCache.get(file);
    if (cached && cached.path === path && cached.isInboxFile === isInboxFile) {
      for (const t of cached.tasks) tasks.push(t);
      return;
    }
    const fileTasks = buildFileTasks(file, path, isInboxFile);
    fileTasksCache.set(file, { path, isInboxFile, tasks: fileTasks });
    for (const t of fileTasks) tasks.push(t);
  });
  return tasks;
};

const buildFileTasks = (file, path, isInboxFile) => {
  const tasks = [];
  {
    const headers = file.get('headers');
    const done = completedKeywordsOf(file);
    const stack = []; // antepasados: {level, tags, area, keyword, project, isTaskish}
    const byIndex = [];
    headers.forEach((header, index) => {
      const level = header.get('nestingLevel');
      while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
      const parent = stack.length ? stack[stack.length - 1] : null;
      const keyword = header.getIn(['titleLine', 'todoKeyword']) || null;
      const ownTags = (header.getIn(['titleLine', 'tags']) || List()).toArray().filter(Boolean);
      const inheritedTags = parent ? parent.tags : [];
      const ownArea = propertyValue(header, 'AREA');
      const area = ownArea || (parent ? parent.area : null);
      const rawTitle = header.getIn(['titleLine', 'rawTitle']) || '';
      const pm = PRIORITY_RE.exec(rawTitle);
      const isProject = keyword === 'PROJECT';
      const task = {
        key: `${path}::${header.get('id')}`,
        id: header.get('id'),
        path,
        index,
        level,
        header,
        keyword,
        isDone: !!keyword && done.has(keyword),
        rawTitle,
        title: displayTitle(rawTitle),
        priority: pm ? pm[1] : null,
        ownTags,
        tags: Array.from(new Set([...inheritedTags, ...ownTags])),
        area,
        ownArea,
        energy: propertyValue(header, 'ENERGY'),
        isHabit: (propertyValue(header, 'STYLE') || '').toLowerCase() === 'habit',
        effort: propertyValue(header, 'EFFORT'),
        scheduled: planningDate(header, 'SCHEDULED'),
        deadline: planningDate(header, 'DEADLINE'),
        closed: planningDate(header, 'CLOSED'),
        project: parent ? parent.project : null,
        isProject,
        isInboxFile,
        parentHasKeyword: parent ? parent.hasKeyword : false,
        hasTaskChildren: false,
        description: header.get('rawDescription') || '',
      };
      // Marcar a los antepasados que tienen tareas debajo
      if (keyword) stack.forEach((s) => (byIndex[s.index].hasTaskChildren = true));
      tasks.push(task);
      byIndex[index] = task;
      stack.push({
        level,
        index,
        tags: task.tags,
        area,
        project: isProject ? { id: header.get('id'), path, title: task.title } : task.project,
        hasKeyword: !!keyword || (parent ? parent.hasKeyword : false),
      });
    });
  }
  return tasks;
};

export const INBOX_TAG = '@inbox';
export const hasInboxTag = (task) =>
  (task.ownTags || []).some((t) => t.toLowerCase() === INBOX_TAG);

// Etiquetas al cambiar de lista: Inbox = @inbox (se quita al sacarla; se pone al llevarla a
// Inbox fuera del fichero de entrada)
export const tagsForList = (task, list, tags = task.ownTags || []) => {
  const isInboxTag = (x) => x.toLowerCase() === INBOX_TAG;
  if (list !== 'inbox') return tags.filter((x) => !isInboxTag(x));
  if (!task.isInboxFile && !tags.some(isInboxTag)) return [...tags, INBOX_TAG];
  return tags;
};

// Programada para más adelante
export const isFutureScheduled = (task, today = new Date()) =>
  !!task.scheduled && startOfDay(task.scheduled) > startOfDay(today);

// Oculta hasta su fecha (solo se ve en Scheduled): programada a futuro y SIN fecha límite. Las
// que tienen DEADLINE se ven siempre en su lista (y en Deadline)
export const isHiddenUntilScheduled = (task, today = new Date()) =>
  isFutureScheduled(task, today) && !task.deadline;

const isScheduledView = (t, today) =>
  !t.isDone && !t.isProject && (!!t.keyword || hasInboxTag(t)) && isFutureScheduled(t, today);

// Lista a la que pertenece una tarea (una sola; Focus es aparte)
export const listOf = (task, today = new Date()) => {
  if (task.isDone) return 'logbook';
  if (task.isProject) return 'project';
  const inbox = hasInboxTag(task);
  if ((task.keyword || inbox) && isHiddenUntilScheduled(task, today)) return 'scheduled';
  // Inbox: etiqueta @inbox, o encabezados sin estado del fichero de entrada
  if (inbox) return 'inbox';
  if (!task.keyword) {
    if (task.isInboxFile && !task.parentHasKeyword) return 'inbox';
    if (!task.hasTaskChildren && !task.parentHasKeyword) return 'reference';
    return null;
  }
  return LIST_FOR_KEYWORD[task.keyword] || null;
};

// Ha llegado su fecha programada o su fecha límite (hoy o antes) y aún no tiene ★: se le pone
// [#A] (no a los hábitos ni a las terminadas)
const isDue = (date, today) => !!date && startOfDay(date) <= startOfDay(today);
export const needsAutoPriority = (task, today = new Date()) =>
  !!task.keyword &&
  !task.isDone &&
  !task.isProject &&
  !task.isHabit &&
  task.priority !== 'A' &&
  (isDue(task.scheduled, today) || isDue(task.deadline, today));

// Clave estable (no depende de los ids, que cambian al releer el fichero) con las fechas que ya
// han llegado: si luego llega otra (p. ej. la límite), vuelve a ponerse la ★
export const autoPriorityKey = (task, today = new Date()) =>
  [
    task.path,
    task.title,
    isDue(task.scheduled, today) ? `S${startOfDay(task.scheduled).toISOString()}` : '',
    isDue(task.deadline, today) ? `D${startOfDay(task.deadline).toISOString()}` : '',
  ].join('|');

export const isFocus = (task, today = new Date()) => {
  if (task.isDone || task.isProject || !task.keyword) return false;
  if (task.isHabit) return false; // los hábitos (:STYLE: habit) no se ven en Focus
  if (isHiddenUntilScheduled(task, today)) return false; // hasta su fecha, solo en Scheduled
  if (task.priority === 'A') return true;
  const t0 = startOfDay(today);
  if (task.scheduled && startOfDay(task.scheduled) <= t0) return true;
  if (task.deadline && startOfDay(task.deadline) <= t0) return true;
  return false;
};

const matchesFilters = (task, filters) => {
  const { area, tags = [], energy, time, dated, text } = filters || {};
  if (area && area !== '*' && (task.area || '') !== (area === '-' ? '' : area)) return false;
  if (tags.length && !tags.every((t) => task.tags.includes(t))) return false;
  if (energy && (task.energy || '').toLowerCase() !== energy.toLowerCase()) return false;
  if (time) {
    const minutes = effortMinutes(task.effort);
    const bucket = TIME_BUCKETS.find((b) => b.id === time);
    if (minutes == null || !bucket) return false;
    if (bucket.max != null && minutes > bucket.max) return false;
    if (bucket.min != null && minutes < bucket.min) return false;
  }
  if (dated && !task.deadline && !task.scheduled) return false;
  if (text) {
    const q = text.toLowerCase();
    if (!`${task.title} ${task.description}`.toLowerCase().includes(q)) return false;
  }
  return true;
};

const byDateThenTitle = (a, b) => {
  const da = a.deadline || a.scheduled;
  const db = b.deadline || b.scheduled;
  if (da && db && +da !== +db) return da - db;
  if (da && !db) return -1;
  if (!da && db) return 1;
  if ((a.priority === 'A') !== (b.priority === 'A')) return a.priority === 'A' ? -1 : 1;
  return 0;
};

// Tareas de una vista (lista, proyecto) con los filtros aplicados
export const tasksForView = (tasks, view, filters = {}, today = new Date()) => {
  let out;
  if (view.type === 'project') {
    const projectTask = tasks.find((t) => t.key === view.key);
    if (!projectTask) return [];
    out = tasks.filter(
      (t) =>
        t.path === projectTask.path &&
        t.project &&
        t.project.id === projectTask.id &&
        t.keyword &&
        !t.isDone &&
        !t.isProject &&
        !isHiddenUntilScheduled(t, today)
    );
  } else if (view.id === 'focus') {
    out = tasks.filter((t) => isFocus(t, today));
  } else if (view.id === 'deadline') {
    out = tasks.filter((t) => t.deadline && t.keyword && !t.isDone && !t.isProject);
  } else if (view.id === 'scheduled') {
    // Todas las programadas a futuro (también las que tienen DEADLINE y se ven en su lista)
    out = tasks.filter((t) => isScheduledView(t, today));
  } else {
    out = tasks.filter((t) => listOf(t, today) === view.id);
  }
  out = out.filter((t) => matchesFilters(t, filters));
  if (view.id === 'logbook') {
    return out.sort((a, b) => (b.closed || 0) - (a.closed || 0)).slice(0, 300);
  }
  if (view.id === 'scheduled') return out.sort((a, b) => (a.scheduled || 0) - (b.scheduled || 0));
  if (view.id === 'deadline') return out.sort((a, b) => a.deadline - b.deadline);
  if (view.type === 'project') return out; // orden del fichero
  return out.sort(byDateThenTitle);
};

export const projectsOf = (tasks, filters = {}) =>
  tasks
    .filter((t) => t.isProject && !t.isDone)
    .filter(
      (t) =>
        !filters.area ||
        filters.area === '*' ||
        (t.area || '') === (filters.area === '-' ? '' : filters.area)
    );

export const areasOf = (tasks) =>
  Array.from(new Set(tasks.map((t) => t.area).filter(Boolean))).sort((a, b) => a.localeCompare(b));

export const countsFor = (tasks, filters = {}, today = new Date()) => {
  const counts = {};
  [...LISTS, ...EXTRA_LISTS].forEach((l) => {
    counts[l.id] = tasksForView(tasks, { id: l.id }, { area: filters.area }, today).length;
  });
  return counts;
};

// Valores disponibles para los filtros de la lista actual
export const facetsFor = (tasks) => {
  const tags = new Set();
  const energy = new Set();
  let hasEffort = false;
  let hasDates = false;
  tasks.forEach((t) => {
    t.tags.forEach((x) => tags.add(x));
    if (t.energy) energy.add(t.energy);
    if (t.effort) hasEffort = true;
    if (t.deadline || t.scheduled) hasDates = true;
  });
  return {
    tags: Array.from(tags).sort((a, b) => {
      const ac = a.startsWith('@');
      const bc = b.startsWith('@');
      return ac !== bc ? (ac ? -1 : 1) : a.localeCompare(b);
    }),
    energy: [
      ...DEFAULT_ENERGY.filter((e) => energy.has(e)),
      ...Array.from(energy).filter((e) => !DEFAULT_ENERGY.includes(e)),
    ],
    hasEffort,
    hasDates,
  };
};

// ORG Mode para Eli: secciones del Logbook según la fecha de cierre (CLOSED)
export const logbookGroupOf = (closed, today = new Date()) => {
  const d0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const weekStart = new Date(d0);
  weekStart.setDate(d0.getDate() - ((d0.getDay() + 6) % 7)); // lunes
  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setDate(weekStart.getDate() - 7);
  const lastMonthStart = new Date(d0.getFullYear(), d0.getMonth() - 1, 1);
  const yearStart = new Date(d0.getFullYear(), 0, 1);
  if (!closed) return { id: 'older', label: 'Anteriores' };
  if (closed >= weekStart) return { id: 'week', label: 'Esta semana' };
  if (closed >= lastWeekStart) return { id: 'lastweek', label: 'La semana pasada' };
  if (closed >= lastMonthStart) return { id: 'lastmonth', label: 'El mes pasado' };
  if (closed >= yearStart) return { id: 'year', label: 'Este año' };
  return { id: 'older', label: 'Anteriores' };
};
