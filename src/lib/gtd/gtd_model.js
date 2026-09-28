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
import { fileTargetsInText } from '../eli_attachments';
import {
  getGtdConfig,
  exclusiveOrder,
  inboxTags,
  matchesSectionRules,
  keywordForSection,
  sectionDef,
  isCustomId,
  hasRules,
  customOrder,
} from './gtd_sections';

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

// ORG Mode para Eli: repetición de una fecha como texto de Org («+1w», «.+2d», «++1m») o ''
const planningRepeat = (header, type) => {
  const item = (header.get('planningItems') || List()).find((p) => p.get('type') === type);
  const ts = item && item.get('timestamp');
  if (!ts || !ts.get('repeaterType')) return '';
  return `${ts.get('repeaterType')}${ts.get('repeaterValue') || 1}${ts.get('repeaterUnit') || 'd'}`;
};

export const REPEAT_RE = /^(\.\+|\+\+|\+)(\d+)([hdwmy])$/;
export const parseRepeat = (text) => {
  const m = REPEAT_RE.exec(text || '');
  return m ? { type: m[1], value: Number(m[2]), unit: m[3] } : null;
};

const laterDate = (a, b) => (!a ? b || null : !b ? a : a > b ? a : b);

// ORG Mode para Eli: proyectos dormidos (etiqueta :sleep:, se hereda como en Org) y programados
// (PROJECT con SCHEDULED a futuro). Sus tareas no salen en las listas hasta que despiertan.
export const SLEEP_TAG = 'sleep';
export const hasSleepTag = (tags) => (tags || []).some((t) => t.toLowerCase() === SLEEP_TAG);
export const isSleeping = (task) => hasSleepTag(task.tags);
const isFutureDate = (d, today) => !!d && startOfDay(d) > startOfDay(today);
// Tarea (no proyecto) aparcada: dentro de algo dormido o de un proyecto que aún no empieza
export const isParked = (task, today = new Date()) =>
  !task.isProject && !task.isDone && (isSleeping(task) || isFutureDate(task.projectStart, today));
export const projectState = (project, today = new Date()) => {
  if (isSleeping(project)) return 'sleep';
  if (isFutureDate(project.scheduled, today) || isFutureDate(project.projectStart, today))
    return 'scheduled';
  return 'active';
};

// ¿Alguna fecha SCHEDULED/DEADLINE con repetición (+1w, .+1d, ++1m…)?
const hasRepeater = (header) =>
  (header.get('planningItems') || List()).some(
    (p) =>
      ['SCHEDULED', 'DEADLINE'].includes(p.get('type')) && !!p.getIn(['timestamp', 'repeaterType'])
  );

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
        repeats: hasRepeater(header),
        effort: propertyValue(header, 'EFFORT'),
        scheduled: planningDate(header, 'SCHEDULED'),
        deadline: planningDate(header, 'DEADLINE'),
        scheduledRepeat: planningRepeat(header, 'SCHEDULED'),
        deadlineRepeat: planningRepeat(header, 'DEADLINE'),
        closed: planningDate(header, 'CLOSED'),
        project: parent ? parent.project : null,
        // (2.15) encabezado padre (para reordenar solo entre hermanas)
        parentId: parent ? headers.getIn([parent.index, 'id']) : null,
        // Fecha de inicio del proyecto que la contiene (SCHEDULED del PROJECT o de uno de fuera)
        projectStart: parent ? parent.projectStart : null,
        isProject,
        isInboxFile,
        parentHasKeyword: parent ? parent.hasKeyword : false,
        hasTaskChildren: false,
        description: header.get('rawDescription') || '',
        // ORG Mode para Eli (2.11): nº de archivos adjuntos (enlaces a ficheros que no son .org)
        attachmentCount: fileTargetsInText(`${rawTitle}\n${header.get('rawDescription') || ''}`)
          .length,
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
        projectStart: isProject ? laterDate(task.scheduled, task.projectStart) : task.projectStart,
        hasKeyword: !!keyword || (parent ? parent.hasKeyword : false),
      });
    });
  }
  return tasks;
};

export const INBOX_TAG = '@inbox';
const lower = (x) => (x || '').toLowerCase();
// ORG Mode para Eli: etiqueta(s) de Inbox según Ajustes (por defecto @inbox)
export const inboxTag = () => inboxTags()[0] || INBOX_TAG;
export const hasInboxTag = (task) => {
  const tags = inboxTags().map(lower);
  return !!tags.length && (task.ownTags || []).some((t) => tags.includes(lower(t)));
};

// Estado al llevar una tarea a una lista: { has, keyword } (según Ajustes; si no, lo de siempre)
export const keywordForList = (list) => {
  const k = keywordForSection(list);
  if (k !== undefined) return { has: true, keyword: k };
  if (Object.prototype.hasOwnProperty.call(KEYWORD_FOR_LIST, list)) {
    return { has: true, keyword: KEYWORD_FOR_LIST[list] };
  }
  return { has: false };
};

// Etiquetas al cambiar de lista: se quitan las etiquetas que marcan OTRAS listas (p. ej. @inbox al
// sacarla de Inbox) y, si la lista de destino se marca con etiqueta (y no con estado), se pone
// (salvo en Inbox si la tarea ya está en el fichero de entrada).
export const tagsForList = (task, list, tags = task.ownTags || []) => {
  const cfg = getGtdConfig();
  const target = (sectionDef(list) || {}).kind === 'list' ? cfg.sections[list] : null;
  const targetTags = target ? target.tags.map(lower) : [];
  const others = [];
  exclusiveOrder(cfg)
    .filter((id) => id !== list)
    .forEach((id) => cfg.sections[id].tags.forEach((t) => others.push(lower(t))));
  let out = tags.filter((x) => !others.includes(lower(x)) || targetTags.includes(lower(x)));
  if (target && target.tags.length && !target.states.length) {
    const has = out.some((x) => targetTags.includes(lower(x)));
    if (!has && !(target.inboxFile && task.isInboxFile)) out = [...out, target.tags[0]];
  }
  return out;
};

// Programada para más adelante
export const isFutureScheduled = (task, today = new Date()) =>
  !!task.scheduled && startOfDay(task.scheduled) > startOfDay(today);

// ORG Mode para Eli: oculta hasta su fecha (solo se ve en Scheduled): programada a futuro, tenga o
// no fecha límite. Si tiene prioridad ([#A], [#B]…), se ve también en su lista y en el resto.
// (Por defecto; cada sección lo decide con sus ticks en Ajustes → Vista GTD: secciones.)
export const isHiddenUntilScheduled = (task, today = new Date()) =>
  isFutureScheduled(task, today) && !task.priority;

const propertyOfTask = (task, name) => (task.header ? propertyValue(task.header, name) : null);
const isTaskLike = (t) => !!t.keyword || hasInboxTag(t);
const isFutureTask = (t, today) => isTaskLike(t) && isFutureScheduled(t, today);

// Ticks de la sección: hábitos, programadas a futuro (con o sin prioridad) y proyectos aparcados
const hiddenBy = (t, s, today) => {
  if (isParked(t, today) && !s.parked) return 'parked';
  if (t.isHabit && isTaskLike(t) && !s.habits) return 'habit';
  if (isFutureTask(t, today) && !(t.priority ? s.futurePriority : s.future)) return 'scheduled';
  return null;
};

// ¿Entra en esta lista exclusiva? (reglas + casos especiales de Inbox y Reference)
const matchesList = (task, s) => {
  if (matchesSectionRules(task, s, propertyOfTask)) return true;
  if (s.inboxFile && !task.keyword && task.isInboxFile && !task.parentHasKeyword) return true;
  if (s.noStateLeaf && !task.keyword && !task.hasTaskChildren && !task.parentHasKeyword) {
    return true;
  }
  return false;
};

// Scheduled: programadas a futuro y hábitos (según sus ticks) o sus reglas extra
const isScheduledView = (t, today) => {
  const s = getGtdConfig().sections.scheduled;
  if (t.isDone || t.isProject) return false;
  const base = isTaskLike(t) && (isFutureScheduled(t, today) || (t.isHabit && s.habits));
  if (!base && !matchesSectionRules(t, s, propertyOfTask)) return false;
  return !hiddenBy(t, s, today);
};

// Lista a la que pertenece una tarea (una sola; Focus es aparte): la primera (en el orden de
// Ajustes) cuyas reglas cumple. Si sus ticks la ocultan: 'parked', 'habit' o 'scheduled'.
export const listOf = (task, today = new Date()) => {
  if (task.isDone) return 'logbook';
  if (task.isProject) return 'project';
  const cfg = getGtdConfig();
  for (const id of exclusiveOrder(cfg)) {
    const s = cfg.sections[id];
    if (s.show === false || !matchesList(task, s)) continue;
    return hiddenBy(task, s, today) || id;
  }
  return isParked(task, today) ? 'parked' : null;
};

// Ha llegado su fecha programada o su fecha límite (hoy o antes) y aún no tiene ★: se le pone
// [#A] (no a los hábitos ni a las terminadas)
const isDue = (date, today) => !!date && startOfDay(date) <= startOfDay(today);
export const needsAutoPriority = (task, today = new Date()) =>
  getGtdConfig().sections.focus.autoStar !== false &&
  !!task.keyword &&
  !task.isDone &&
  !task.isProject &&
  !task.isHabit &&
  !isParked(task, today) &&
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

// Focus: ★ [#A] o fecha (programada o límite) de hoy o vencida, o sus reglas extra; sin hábitos,
// sin proyectos aparcados ni programadas a futuro sin prioridad (por defecto)
export const isFocus = (task, today = new Date()) => {
  if (task.isDone || task.isProject) return false;
  const s = getGtdConfig().sections.focus;
  const t0 = startOfDay(today);
  const base =
    !!task.keyword &&
    ((s.star !== false && task.priority === 'A') ||
      (s.due !== false &&
        ((task.scheduled && startOfDay(task.scheduled) <= t0) ||
          (task.deadline && startOfDay(task.deadline) <= t0))));
  if (!base && !matchesSectionRules(task, s, propertyOfTask)) return false;
  return !hiddenBy(task, s, today);
};

export const matchesFilters = (task, filters) => {
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
  // ORG Mode para Eli: búsqueda propia del Logbook (título, notas, etiquetas y área)
  if (filters && filters.logText) {
    const words = filters.logText.toLowerCase().split(/\s+/).filter(Boolean);
    const hay = `${task.title} ${task.description} ${(task.tags || []).join(' ')} ${
      task.area || ''
    }`.toLowerCase();
    if (!words.every((w) => hay.includes(w))) return false;
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
    const s = getGtdConfig().sections.projects;
    out = tasks.filter(
      (t) =>
        t.path === projectTask.path &&
        t.project &&
        t.project.id === projectTask.id &&
        t.keyword &&
        !t.isDone &&
        !t.isProject &&
        !hiddenBy(t, s, today)
    );
  } else if (view.id === 'focus') {
    out = tasks.filter((t) => isFocus(t, today));
  } else if (view.id === 'deadline') {
    const s = getGtdConfig().sections.deadline;
    out = tasks.filter(
      (t) =>
        !t.isDone &&
        !t.isProject &&
        ((t.deadline && t.keyword) || matchesSectionRules(t, s, propertyOfTask)) &&
        !hiddenBy(t, s, today)
    );
  } else if (view.id === 'scheduled') {
    // Todas las programadas a futuro (también las que tienen DEADLINE y se ven en su lista)
    out = tasks.filter((t) => isScheduledView(t, today));
  } else if (isCustomId(view.id)) {
    // (2.16) Sección propia: tareas abiertas que cumplen sus reglas (sin reglas, todas)
    const s = getGtdConfig().sections[view.id];
    if (!s) return [];
    const withRules = hasRules(s);
    out = tasks.filter(
      (t) =>
        !t.isDone &&
        !t.isProject &&
        (withRules ? matchesSectionRules(t, s, propertyOfTask) : !!t.keyword) &&
        !hiddenBy(t, s, today)
    );
  } else {
    out = tasks.filter((t) => listOf(t, today) === view.id);
  }
  out = out.filter((t) => matchesFilters(t, filters));
  if (view.id === 'logbook') {
    return out.sort((a, b) => (b.closed || 0) - (a.closed || 0)).slice(0, 300);
  }
  if (view.id === 'scheduled') return out.sort((a, b) => (a.scheduled || 0) - (b.scheduled || 0));
  if (view.id === 'deadline') {
    const far = 8.64e15;
    return out.sort((a, b) => (a.deadline || far) - (b.deadline || far));
  }
  if (view.type === 'project') return dueFirstFileOrder(out, today); // orden del fichero
  return out.sort(byDateThenTitle);
};

// ORG Mode para Eli (2.15): dentro de un proyecto (y en los grupos de «agrupar por proyecto») las
// fechas no cambian el orden (manda el del fichero, que se cambia arrastrando), salvo las tareas
// cuya fecha programada o límite ya ha llegado: esas van primero. Orden estable.
export const isDueToday = (task, today = new Date()) =>
  isDue(task.scheduled, today) || isDue(task.deadline, today);
export const dueFirstFileOrder = (list, today = new Date()) => {
  const due = [];
  const rest = [];
  list.forEach((t) => (isDueToday(t, today) ? due : rest).push(t));
  return [...due, ...rest];
};

// Vista de un proyecto separada por estado, como Nirvana
export const PROJECT_SECTIONS = [
  { id: 'next', label: 'Next', icon: 'fas fa-play' },
  { id: 'later', label: 'Todo', icon: 'fas fa-forward' },
  { id: 'waiting', label: 'Waiting', icon: 'fas fa-hourglass-half' },
  { id: 'scheduled', label: 'Programadas', icon: 'far fa-calendar-alt' },
  { id: 'someday', label: 'Someday', icon: 'fas fa-cloud' },
  { id: 'done', label: 'Terminadas', icon: 'fas fa-check' },
];

// Sección de una tarea dentro de su proyecto
export const projectSectionOf = (task, today = new Date()) => {
  if (task.isDone) return 'done';
  if (isFutureScheduled(task, today)) return 'scheduled';
  for (const id of ['next', 'waiting', 'someday', 'later']) {
    const k = keywordForList(id);
    if (k.has && k.keyword && task.keyword === k.keyword) return id;
  }
  return 'later';
};

// Tareas del proyecto por secciones: [{ ...sección, tasks }] (también las vacías)
export const projectSections = (tasks, projectKey, filters = {}, today = new Date()) => {
  const projectTask = tasks.find((t) => t.key === projectKey);
  const out = PROJECT_SECTIONS.map((s) => ({ ...s, tasks: [] }));
  if (!projectTask) return out;
  const s = getGtdConfig().sections.projects;
  const byId = {};
  out.forEach((sec) => (byId[sec.id] = sec));
  tasks
    .filter(
      (t) =>
        t.path === projectTask.path &&
        t.project &&
        t.project.id === projectTask.id &&
        t.keyword &&
        !t.isProject
    )
    .filter((t) => {
      if (t.isDone) return true;
      // Aparcadas (proyecto dormido) y hábitos: según los ticks de Ajustes; las programadas a
      // futuro se ven siempre, en su sección
      const why = hiddenBy(t, s, today);
      return why !== 'parked' && why !== 'habit';
    })
    .filter((t) => matchesFilters(t, filters))
    .forEach((t) => byId[projectSectionOf(t, today)].tasks.push(t));
  out.forEach((sec) => {
    sec.tasks =
      sec.id === 'done'
        ? [...sec.tasks].sort((a, b) => (b.closed || 0) - (a.closed || 0))
        : dueFirstFileOrder(sec.tasks, today);
  });
  return out;
};

// Agrupar una lista por proyecto: primero las sueltas (sin proyecto), después cada proyecto en el
// orden en que aparece por primera vez; dentro de cada proyecto, el orden de dueFirstFileOrder
export const groupByProject = (list, today = new Date()) => {
  const loose = [];
  const groups = [];
  const byKey = {};
  list.forEach((t) => {
    if (!t.project) {
      loose.push(t);
      return;
    }
    const key = `${t.project.path}::${t.project.id}`;
    if (!byKey[key]) {
      byKey[key] = { key, project: t.project, tasks: [] };
      groups.push(byKey[key]);
    }
    byKey[key].tasks.push(t);
  });
  groups.forEach((g) => {
    g.tasks = dueFirstFileOrder(
      [...g.tasks].sort((a, b) => a.index - b.index),
      today
    );
  });
  return { loose, groups };
};

// Secciones que se pueden agrupar por proyecto (las de fechas tienen sus propias secciones)
export const GROUPABLE_LISTS = [
  'focus',
  'inbox',
  'next',
  'later',
  'waiting',
  'someday',
  'reference',
];
// Listas en las que se pueden reordenar (arrastrando) las tareas sueltas
export const REORDERABLE_LISTS = GROUPABLE_LISTS;
// (2.16) …y las secciones propias
export const isGroupableList = (id) => GROUPABLE_LISTS.includes(id) || isCustomId(id);

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
  [...LISTS, ...EXTRA_LISTS, ...customOrder().map((id) => ({ id }))].forEach((l) => {
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
    t.tags.forEach((x) => x.toLowerCase() !== SLEEP_TAG && tags.add(x));
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

// ORG Mode para Eli: tareas terminadas que se pueden archivar (Logbook → «Archivar»). Una tarea
// terminada con alguna subtarea todavía abierta NO se archiva (se llevaría la subtarea).
export const archivableDone = (tasks) => {
  const ok = [];
  const blocked = [];
  const byPath = {};
  tasks.forEach((t) => (byPath[t.path] = byPath[t.path] || []).push(t));
  Object.values(byPath).forEach((list) => {
    const sorted = [...list].sort((a, b) => a.index - b.index);
    sorted.forEach((t, i) => {
      if (!t.isDone) return;
      let open = false;
      for (let j = i + 1; j < sorted.length && sorted[j].level > t.level; j++) {
        if (sorted[j].keyword && !sorted[j].isDone) {
          open = true;
          break;
        }
      }
      (open ? blocked : ok).push(t);
    });
  });
  return { ok, blocked };
};

// ORG Mode para Eli: vista «Todos los proyectos»: cada proyecto con su estado, fechas, acciones
// pendientes y siguiente acción, agrupados (activos, programados, dormidos) y por fecha
export const projectsOverview = (tasks, filters = {}, today = new Date()) => {
  const groups = { active: [], scheduled: [], sleep: [] };
  projectsOf(tasks, filters).forEach((p) => {
    const actions = tasks.filter(
      (t) =>
        t.path === p.path &&
        t.project &&
        t.project.id === p.id &&
        t.keyword &&
        !t.isDone &&
        !t.isProject
    );
    const next = actions.find((t) => t.keyword === 'NEXT') || actions[0] || null;
    const state = projectState(p, today);
    groups[state].push({
      project: p,
      state,
      start: laterDate(p.scheduled, p.projectStart),
      deadline: p.deadline,
      pending: actions.length,
      next,
    });
  });
  const key = (r) => r.start || r.deadline || null;
  const byDate = (a, b) => {
    const da = key(a);
    const db = key(b);
    if (da && db && +da !== +db) return da - db;
    if (da && !db) return -1;
    if (!da && db) return 1;
    return a.project.title.localeCompare(b.project.title);
  };
  Object.values(groups).forEach((g) => g.sort(byDate));
  return groups;
};
