// ORG Mode para Eli: vista GTD (estilo Nirvana). Modelo puro: de los ficheros Org a tareas y
// listas, sin tocar nada. Reglas (acordadas con el usuario):
//   Inbox     = encabezados sin estado del fichero de entrada (inbox.org)
//   Next      = NEXT · Later = TODO · Waiting = WAITING · Someday = MAYBE
//   Scheduled = con SCHEDULED posterior a hoy (hasta ese día no aparece en su lista)
//   Projects  = PROJECT (sus descendientes son sus acciones)
//   Focus     = ★ [#A] o programado/vence hoy o antes (abiertas)
//   Deadline  = tareas abiertas con DEADLINE (vencidas incluidas), por fecha de vencimiento
//   Logbook   = terminadas (DONE, CANCELLED…) · Reference = encabezados sin estado ni tareas debajo
//   Áreas     = propiedad :AREA: (se hereda) · Energía :ENERGY: · Tiempo :EFFORT:
import { List } from 'immutable';
import { attributedStringToRawText } from '../export_org';
import { dateForTimestamp } from '../timestamps';

export const LISTS = [
  { id: 'focus', label: 'Focus', icon: 'fas fa-star' },
  { id: 'inbox', label: 'Inbox', icon: 'fas fa-inbox' },
  { id: 'next', label: 'Next', icon: 'fas fa-play' },
  { id: 'later', label: 'Later', icon: 'fas fa-forward' },
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

export const ENERGY_LEVELS = ['baja', 'media', 'alta'];
export const TIME_BUCKETS = [
  { id: '5', label: '≤ 5 min', max: 5 },
  { id: '15', label: '≤ 15 min', max: 15 },
  { id: '30', label: '≤ 30 min', max: 30 },
  { id: '60', label: '≤ 1 h', max: 60 },
  { id: 'more', label: '> 1 h', min: 61 },
];
export const EFFORT_OPTIONS = [
  '0:05',
  '0:10',
  '0:15',
  '0:30',
  '0:45',
  '1:00',
  '2:00',
  '3:00',
  '4:00',
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
export const buildTasks = (files, inboxPaths = []) => {
  const tasks = [];
  if (!files) return tasks;
  files.forEach((file, path) => {
    if (!path || !file || !file.get('headers')) return;
    const headers = file.get('headers');
    const done = completedKeywordsOf(file);
    const isInboxFile = inboxPaths.includes(path);
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
        energy: (propertyValue(header, 'ENERGY') || '').toLowerCase() || null,
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
  });
  return tasks;
};

// Lista a la que pertenece una tarea (una sola; Focus es aparte)
export const listOf = (task, today = new Date()) => {
  if (task.isDone) return 'logbook';
  if (task.isProject) return 'project';
  const t0 = startOfDay(today);
  if (!task.keyword) {
    if (task.isInboxFile && !task.parentHasKeyword) return 'inbox';
    if (!task.hasTaskChildren && !task.parentHasKeyword) return 'reference';
    return null;
  }
  if (task.scheduled && startOfDay(task.scheduled) > t0) return 'scheduled';
  return LIST_FOR_KEYWORD[task.keyword] || null;
};

export const isFocus = (task, today = new Date()) => {
  if (task.isDone || task.isProject || !task.keyword) return false;
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
  if (energy && task.energy !== energy) return false;
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
        !t.isProject
    );
  } else if (view.id === 'focus') {
    out = tasks.filter((t) => isFocus(t, today));
  } else if (view.id === 'deadline') {
    out = tasks.filter((t) => t.deadline && t.keyword && !t.isDone && !t.isProject);
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
    energy: ENERGY_LEVELS.filter((e) => energy.has(e)),
    hasEffort,
    hasDates,
  };
};
