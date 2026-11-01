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
import { attributedStringToRawText, createRawDescriptionText } from '../export_org';
import { dateForTimestamp } from '../timestamps';
import { DEFAULT_ENERGY, DEFAULT_EFFORT } from '../eli_todo_defaults';
import { fileTargetsInText } from '../eli_attachments';
import { fileRoamInfo } from '../eli_roam';
import {
  getGtdConfig,
  exclusiveOrder,
  inboxTags,
  matchesSectionRules,
  matchesAllSectionRules,
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
  { id: 'trash', label: 'Papelera', icon: 'fas fa-trash' },
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

// (4.55) :CREATED: → Date (o null)
export const parseCreated = (v) => {
  const m =
    /(\d{4})-(\d{2})-(\d{2})/.exec(v || '') || /^\s*(\d{4})(\d{2})(\d{2})\s*$/.exec(v || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};

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

// (4.56) Propiedad `:TYPE:` = marca explícita del tipo de una cabecera: checklist, agenda, persona o
// reunión (además del fichero/sección que ya las identifica). Los HÁBITOS NO la usan: siguen con
// `:STYLE: habit` (org-habit). Solo se lee `:TYPE:` (no hay lectura de `:STYLE:` para estos tipos).
export const TYPE_PROPERTY = 'TYPE';
export const GTD_TYPES = ['checklist', 'agenda', 'persona', 'meeting'];
// Valor de :TYPE: de la propia cabecera (minúsculas, sin acentos de más) o null
export const ownTypeOf = (header) => {
  const v = header ? propertyValue(header, TYPE_PROPERTY) : null;
  return v ? v.toLowerCase() : null;
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

// (3.25) ¿la fecha lleva hora? (<2026-10-19 lun 10:30>)
const planningHasTime = (header, type) => {
  const item = (header.get('planningItems') || List()).find((p) => p.get('type') === type);
  const ts = item && item.get('timestamp');
  return !!(ts && ts.get('startHour') && ts.get('startMinute'));
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

// ORG Mode para Eli: proyectos dormidos y programados (PROJECT con SCHEDULED a futuro). Sus
// tareas no salen en las listas hasta que despiertan. (3.17) Dormido = propiedad «:STATUS: sleep»
// en el cajón PROPERTIES (se hereda: lo que cuelga de algo dormido también duerme). La antigua
// etiqueta :sleep: ya no significa nada: es una etiqueta más.
export const STATUS_PROPERTY = 'STATUS';
export const SLEEP_STATUS = 'sleep';
export const isSleepStatus = (value) =>
  String(value || '')
    .trim()
    .toLowerCase() === SLEEP_STATUS;
// (3.0) Papelera (como Nirvana): la etiqueta :trash: (se hereda: lo que cuelga de algo tirado a la
// papelera también está en ella). «Vaciar papelera» borra esos encabezados de verdad.
export const TRASH_TAG = 'trash';
export const hasTrashTag = (tags) => (tags || []).some((t) => t.toLowerCase() === TRASH_TAG);
// (3.0) Grupo «Hecho» de cada lista (como Nirvana): una tarea terminada desde la vista GTD lleva la
// propiedad DONE_IN con la lista en la que estaba («next», «next focus»…) hasta la «Limpieza» (c),
// que se la quita y la pasa al Logbook. Las terminadas sin DONE_IN están ya en el Logbook.
export const DONE_IN_PROPERTY = 'DONE_IN';
export const doneInLists = (task) =>
  String((task && task.doneIn) || '')
    .toLowerCase()
    .split(/[\s,]+/)
    .filter(Boolean);
export const isSleeping = (task) => !!(task && task.sleeping);
const isFutureDate = (d, today) => !!d && startOfDay(d) > startOfDay(today);
// Tarea (no proyecto) aparcada: dentro de algo dormido o de un proyecto que aún no empieza
export const isParked = (task, today = new Date()) =>
  !task.isProject &&
  !task.isDone &&
  (isSleeping(task) || !!task.projectSleeping || isFutureDate(task.projectStart, today));
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
// (2.18) Contador de Org en el título: «[1/6]» o «[66%]» (se ve aparte, como pastilla)
// (solo el del final del título, que es donde lo pone la app y Emacs)
export const COOKIE_RE = /\s*\[(\d*\/\d*|\d*%)\]\s*$/;
export const cookieOf = (rawTitle) => {
  const m = COOKIE_RE.exec(rawTitle || '');
  return m && m[1] !== '/' && m[1] !== '%' ? m[1] : null;
};

export const displayTitle = (rawTitle) =>
  (rawTitle || '')
    .replace(PRIORITY_RE, '')
    .replace(COOKIE_RE, '')
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

// (3.01) Tareas y referencias de OTROS ficheros asignadas a un proyecto: propiedad
// «:PROYECTO: [[id:UUID][Título]]» (el proyecto lleva «:ID: UUID», como org-id). Se resuelven con
// todos los ficheros a la vista: cuentan como las del proyecto (project, projectExternal); si no
// se encuentra el proyecto (borrado, archivado, fichero sin cargar…), badProject y se comportan
// como sueltas. Lo de debajo de una tarea asignada va con ella (salvo otro proyecto en medio).
export const PROJECT_LINK_PROPERTY = 'PROYECTO';
const ID_LINK_RE = /^\s*\[\[id:([^\]]+)\](?:\[([^\]]*)\])?\]\s*$/i;
export const parseProjectLink = (value) => {
  if (!value) return null;
  const m = ID_LINK_RE.exec(String(value));
  if (m) return { id: m[1].trim(), title: (m[2] || '').trim() };
  const bare = /^\s*id:(\S+)\s*$/i.exec(String(value));
  return bare ? { id: bare[1], title: '' } : null;
};
// (4.48) Personas de una cabecera: «:PERSONA: [[id:A][Ana]] [[id:B][Luis]]» → [{ id, title }]
const PERSON_LINK_RE = /\[\[id:([^\]]+)\](?:\[([^\]]*)\])?\]/gi;
export const parsePersonLinks = (value) => {
  const out = [];
  if (!value) return out;
  const text = String(value);
  let m;
  PERSON_LINK_RE.lastIndex = 0;
  while ((m = PERSON_LINK_RE.exec(text))) {
    const id = m[1].trim();
    if (id && !out.some((x) => x.id.toLowerCase() === id.toLowerCase()))
      out.push({ id, title: (m[2] || '').trim() });
  }
  return out;
};
export const projectLinkFor = (orgId, title) =>
  `[[id:${orgId}][${String(title || '').replace(/[\[\]]/g, '')}]]`;
export const newOrgId = () => {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID)
      return crypto.randomUUID().toUpperCase();
  } catch (e) {}
  const h = () =>
    Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .slice(1);
  return `${h()}${h()}-${h()}-4${h().slice(1)}-${h()}-${h()}${h()}${h()}`.toUpperCase();
};
// (4.39) Proyecto paralelo / secuencial: `:ORDERED: t` en el proyecto (como org-mode). Por defecto
// PARALELO (sin la propiedad no cambia nada). En secuencial solo la primera tarea abierta del
// proyecto puede ser siguiente acción: las demás (`seqBlocked`) quedan fuera de las listas (Next…)
// pero se ven en el proyecto.
export const ORDERED_PROPERTY = 'ORDERED';
export const isOrderedValue = (v) => /^(t|true|yes)$/i.test(String(v || '').trim());
const projectKeyOfTask = (t) => (t.project ? `${t.project.path}::${t.project.id}` : null);
// Devuelve la MISMA lista si no hay proyectos secuenciales; si no, copias solo de las bloqueadas
// (las tareas de buildTasks se comparten: no se mutan)
export const markOrdered = (tasks) => {
  const ordered = new Set();
  tasks.forEach((t) => t.ordered && !t.isTrashed && ordered.add(`${t.path}::${t.id}`));
  if (!ordered.size) return tasks;
  const groups = new Map();
  tasks.forEach((t) => {
    const k = projectKeyOfTask(t);
    if (!k || !ordered.has(k) || t.isProject || t.isDone || t.isTrashed || t.isHabit) return;
    if (!t.keyword) return;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  });
  const blocked = new Set();
  groups.forEach((list) => {
    // el orden del proyecto: primero las de su fichero, luego las asignadas desde otros ficheros
    list
      .slice()
      .sort(
        (a, b) =>
          (a.projectExternal ? 1 : 0) - (b.projectExternal ? 1 : 0) ||
          (a.projectExternal ? (a.path < b.path ? -1 : a.path > b.path ? 1 : 0) : 0) ||
          a.index - b.index
      )
      .slice(1)
      .forEach((t) => blocked.add(t.key));
  });
  if (!blocked.size) return tasks;
  return tasks.map((t) => (blocked.has(t.key) ? { ...t, seqBlocked: true } : t));
};

const resolveProjectLinks = (tasks) => {
  if (!tasks.some((t) => t.projRef)) return tasks;
  const byOrgId = new Map();
  tasks.forEach((t) => {
    if (t.isProject && t.orgId && !t.isTrashed) byOrgId.set(t.orgId.toLowerCase(), t);
  });
  return tasks.map((t) => {
    if (!t.projRef || t.isProject) return t;
    const p = byOrgId.get(t.projRef.id.toLowerCase());
    if (!p) return t.isDone ? t : { ...t, badProject: true };
    if (p.path === t.path && t.project && t.project.id === p.id) return t; // ya es suya
    return {
      ...t,
      project: { id: p.id, path: p.path, title: p.title },
      projectExternal: true,
      projectStart: laterDate(p.scheduled, p.projectStart),
      projectSleeping: !!p.sleeping,
    };
  });
};

// (4.25) Caché por CONTENIDO del fichero (cabeceras + estados), no por el objeto fichero: al
// sincronizar cambian isDirty/lastSyncAt y antes se recalculaban todas las tareas. Se guarda una
// variante por «es Inbox o no» (GTD y los avisos lo piden distinto y se pisaban). Si las partes
// no cambian, se devuelve EXACTAMENTE la misma lista (así no se recalcula nada de la vista).
const fileTasksFor = (file, path, isInboxFile) => {
  const headers = file.get('headers');
  const todo = file.get('todoKeywordSets');
  let entry = fileTasksCache.get(headers);
  if (!entry || entry.path !== path || entry.todo !== todo) {
    entry = { path, todo, variants: {} };
    fileTasksCache.set(headers, entry);
  }
  const k = isInboxFile ? 'inbox' : 'plain';
  if (!entry.variants[k]) entry.variants[k] = buildFileTasks(file, path, isInboxFile);
  return entry.variants[k];
};

const lastBuilds = []; // [{parts, result}] (los últimos, para varias llamadas distintas)
const MAX_BUILDS = 6;
const sameParts = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

export const buildTasks = (files, inboxPaths = []) => {
  if (!files) return [];
  const parts = [];
  files.forEach((file, path) => {
    if (!path || !file || !file.get('headers')) return;
    parts.push(fileTasksFor(file, path, inboxPaths.includes(path)));
  });
  const hit = lastBuilds.find((b) => sameParts(b.parts, parts));
  if (hit) return hit.result;
  const tasks = [];
  for (const part of parts) for (const t of part) tasks.push(t);
  const result = markOrdered(resolveProjectLinks(tasks));
  lastBuilds.unshift({ parts, result });
  if (lastBuilds.length > MAX_BUILDS) lastBuilds.pop();
  return result;
};

const buildFileTasks = (file, path, isInboxFile) => {
  const tasks = [];
  {
    const headers = file.get('headers');
    const done = completedKeywordsOf(file);
    const stack = []; // antepasados: {level, tags, area, keyword, project, isTaskish}
    const byIndex = [];
    // (4.49) #+FILETAGS: valen para todo el documento. Van aparte de `tags` (que deciden la lista
    // de la tarea): solo cuentan en los filtros y en la lista de etiquetas, como las heredadas
    const fileTags = fileRoamInfo(file).filetags;
    headers.forEach((header, index) => {
      const level = header.get('nestingLevel');
      while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
      const parent = stack.length ? stack[stack.length - 1] : null;
      const keyword = header.getIn(['titleLine', 'todoKeyword']) || null;
      const ownTags = (header.getIn(['titleLine', 'tags']) || List()).toArray().filter(Boolean);
      const inheritedTags = parent ? parent.tags : [];
      const ownArea = propertyValue(header, 'AREA');
      const ownSleep = isSleepStatus(propertyValue(header, STATUS_PROPERTY));
      const area = ownArea || (parent ? parent.area : null);
      const rawTitle = header.getIn(['titleLine', 'rawTitle']) || '';
      const pm = PRIORITY_RE.exec(rawTitle);
      const isProject = keyword === 'PROJECT';
      const ownRef = parseProjectLink(propertyValue(header, PROJECT_LINK_PROPERTY));
      const personLinks = parsePersonLinks(propertyValue(header, 'PERSONA'));
      // (4.56) :TYPE: propio y heredado (una reunión marca también todo lo que cuelga de ella)
      const ownType = ownTypeOf(header);
      const projRef = isProject ? null : ownRef || (parent ? parent.projRef : null);
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
        cookie: cookieOf(rawTitle),
        priority: pm ? pm[1] : null,
        ownTags,
        fileTags,
        tags: Array.from(new Set([...inheritedTags, ...ownTags])),
        isTrashed: hasTrashTag(inheritedTags) || hasTrashTag(ownTags),
        ownTrash: hasTrashTag(ownTags),
        parentTrashed: hasTrashTag(inheritedTags),
        ownSleep,
        sleeping: ownSleep || (parent ? !!parent.sleeping : false),
        area,
        ownArea,
        energy: propertyValue(header, 'ENERGY'),
        isHabit: (propertyValue(header, 'STYLE') || '').toLowerCase() === 'habit',
        ownType,
        type: ownType || (parent ? parent.type : null),
        repeats: hasRepeater(header),
        effort: propertyValue(header, 'EFFORT'),
        scheduled: planningDate(header, 'SCHEDULED'),
        deadline: planningDate(header, 'DEADLINE'),
        scheduledTimed: planningHasTime(header, 'SCHEDULED'),
        deadlineTimed: planningHasTime(header, 'DEADLINE'),
        scheduledRepeat: planningRepeat(header, 'SCHEDULED'),
        // (4.56) `:DEADLINE_DAYS: N` (vence N días después de cada inicio) y
        // `:RESET_CHECK_BOXES: nil` (al repetirse NO se vacían las casillas)
        deadlineDays: propertyValue(header, 'DEADLINE_DAYS'),
        resetBoxes: !/^(nil|no|f|false|0)$/i.test(propertyValue(header, 'RESET_CHECK_BOXES') || ''),
        deadlineRepeat: planningRepeat(header, 'DEADLINE'),
        closed: planningDate(header, 'CLOSED'),
        doneIn: propertyValue(header, DONE_IN_PROPERTY),
        // (4.55) fecha de creación (:CREATED: [2026-10-31 Sat 14:39] o AAAAMMDD)
        createdAt: parseCreated(propertyValue(header, 'CREATED')),
        project: parent ? parent.project : null,
        // (2.15) encabezado padre (para reordenar solo entre hermanas)
        parentId: parent ? headers.getIn([parent.index, 'id']) : null,
        // Fecha de inicio del proyecto que la contiene (SCHEDULED del PROJECT o de uno de fuera)
        projectStart: parent ? parent.projectStart : null,
        isProject,
        // (4.39) proyecto secuencial: propiedad nativa de org `:ORDERED: t`
        ordered: isProject && isOrderedValue(propertyValue(header, ORDERED_PROPERTY)),
        // (3.01) :ID: (org-id) del encabezado y proyecto asignado con :PROYECTO:
        orgId: propertyValue(header, 'ID'),
        projRef,
        projRefOwn: !!ownRef && !isProject,
        // (4.48) personas enlazadas con :PERSONA: (ids y enlaces)
        personLinks,
        persons: personLinks.map((l) => l.id),
        isInboxFile,
        parentHasKeyword: parent ? parent.hasKeyword : false,
        // (4.22) su madre directa es un proyecto (sus encabezados sin estado = Referencia)
        parentIsProject: parent ? !!parent.isProject : false,
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
        sleeping: task.sleeping,
        area,
        project: isProject ? { id: header.get('id'), path, title: task.title } : task.project,
        projectStart: isProject ? laterDate(task.scheduled, task.projectStart) : task.projectStart,
        hasKeyword: !!keyword || (parent ? parent.hasKeyword : false),
        type: task.type,
        isProject,
        projRef: isProject ? null : projRef,
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
  // (4.55) «Descartar las tareas recurrentes» de esta sección
  if (s.noRecurring && task.repeats) return false;
  if (matchesSectionRules(task, s, propertyOfTask)) return true;
  if (s.inboxFile && !task.keyword && task.isInboxFile && !task.parentHasKeyword) return true;
  // (4.22) …también los encabezados sin estado de un proyecto (material de apoyo, como Allen):
  // una tarea llevada a Referencia desde un proyecto sigue en él y sale en la lista Referencia
  if (
    s.noStateLeaf &&
    !task.keyword &&
    !task.hasTaskChildren &&
    (!task.parentHasKeyword || task.parentIsProject)
  ) {
    return true;
  }
  return false;
};

// Scheduled: programadas a futuro y hábitos (según sus ticks) o sus reglas extra
const isScheduledView = (t, today) => {
  const s = getGtdConfig().sections.scheduled;
  if (t.isDone || t.isProject) return false;
  if (s.noRecurring && t.repeats) return false;
  const base = isTaskLike(t) && (isFutureScheduled(t, today) || (t.isHabit && s.habits));
  if (!base && !matchesSectionRules(t, s, propertyOfTask)) return false;
  return !hiddenBy(t, s, today);
};

// Lista a la que pertenece una tarea (una sola; Focus es aparte): la primera (en el orden de
// Ajustes) cuyas reglas cumple. Si sus ticks la ocultan: 'parked', 'habit' o 'scheduled'.
export const listOf = (task, today = new Date()) => {
  if (task.isTrashed) return 'trash';
  if (task.isDone) return task.doneIn ? 'done' : 'logbook';
  if (task.isProject) return 'project';
  const cfg = getGtdConfig();
  for (const id of exclusiveOrder(cfg)) {
    const s = cfg.sections[id];
    if (s.show === false || !matchesList(task, s)) continue;
    const res = hiddenBy(task, s, today) || id;
    // (4.39) proyecto secuencial: solo su primera tarea abierta es siguiente acción
    return res === 'next' && task.seqBlocked ? null : res;
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
  if (task.isDone || task.isTrashed) return false;
  // (3.0) Un proyecto con ★ también sale en Focus (como fila de proyecto), si está activo
  if (task.isProject) {
    return (
      getGtdConfig().sections.focus.star !== false &&
      task.priority === 'A' &&
      projectState(task, today) === 'active'
    );
  }
  const s = getGtdConfig().sections.focus;
  if (s.noRecurring && task.repeats) return false;
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

// (3.05) Filtro «Sin etiquetas»
export const NO_TAGS = '\u2205sin-etiquetas';
export const isUntagged = (task) =>
  !(task.tags || []).some((t) => !['trash'].includes(String(t).toLowerCase()));
export const matchesFilters = (task, filters) => {
  const { area, tags = [], energy, time, dated, text } = filters || {};
  if (area && area !== '*' && (task.area || '') !== (area === '-' ? '' : area)) return false;
  // (3.05) NO_TAGS = «Sin etiquetas» (ninguna, salvo :trash:): filtrar por ella o tacharla
  // 3.36: `ownTagsOnly` = solo las etiquetas asignadas directamente (sin las heredadas)
  // (4.49) las del fichero (#+FILETAGS:) cuentan como heredadas
  const withFile =
    task.fileTags && task.fileTags.length ? [...task.tags, ...task.fileTags] : task.tags;
  const pool = filters && filters.ownTagsOnly ? task.ownTags || [] : withFile;
  const has = (t) => (t === NO_TAGS ? isUntagged(task) : pool.includes(t));
  // 3.39: `noInherited` = fuera las tareas que tengan alguna etiqueta heredada
  if (filters && filters.noInherited) {
    const own = task.ownTags || [];
    if (withFile.some((t) => !own.includes(t))) return false;
  }
  if (tags.length && !tags.every(has)) return false;
  // (3.01) etiquetas tachadas en la barra de filtros: fuera las que las llevan
  const notTags = (filters && filters.notTags) || [];
  if (notTags.length && notTags.some(has)) return false;
  // (3.01) filtro «Proyecto no encontrado»
  if (filters && filters.badProject && !task.badProject) return false;
  // (4.48) filtro por persona (:PERSONA:)
  if (filters && filters.person) {
    const want = String(filters.person).toLowerCase();
    if (!(task.persons || []).some((p) => p.toLowerCase() === want)) return false;
  }
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

// (3.01) ¿Es de ese proyecto? (por estructura o asignada con :PROYECTO:)
export const inProject = (t, project) =>
  !!t.project && t.project.path === project.path && t.project.id === project.id;
const byProjectOrder = (a, b) => cmpRank(a, b);

// Tareas de una vista (lista, proyecto) con los filtros aplicados
export const tasksForView = (tasks, view, filters = {}, today = new Date()) => {
  let out;
  if (view.id === 'trash') {
    // (3.0) Papelera: lo que se tiró (lo de debajo va con ello), en el orden del fichero
    out = tasks.filter((t) => t.ownTrash && !t.parentTrashed);
    return out.filter((t) => matchesFilters(t, filters));
  }
  tasks = tasks.filter((t) => !t.isTrashed);
  if (view.id === 'tag') {
    // (3.0) Vista de una etiqueta (menú lateral → Etiquetas): lo abierto que la lleva, de todas
    // las listas y de los proyectos activos
    const s = getGtdConfig().sections.next;
    out = tasks.filter(
      (t) =>
        !t.isDone &&
        (t.tags || []).includes(view.tag) &&
        (t.isProject
          ? projectState(t, today) === 'active'
          : !!t.keyword || hasInboxTag(t) || listOf(t, today) === 'inbox') &&
        !(!t.isProject && hiddenBy(t, s, today))
    );
  } else if (view.type === 'project') {
    const projectTask = tasks.find((t) => t.key === view.key);
    if (!projectTask) return [];
    const s = getGtdConfig().sections.projects;
    out = tasks
      .filter(
        (t) =>
          inProject(t, projectTask) &&
          t.keyword &&
          !t.isDone &&
          !t.isProject &&
          !hiddenBy(t, s, today)
      )
      .sort(byProjectOrder);
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
    // (2.16) Sección propia: tareas abiertas que cumplen sus reglas (sin reglas, todas).
    // (3.06) Las reglas se combinan con «Y» (todas a la vez)
    const s = getGtdConfig().sections[view.id];
    if (!s) return [];
    const withRules = hasRules(s);
    out = tasks.filter(
      (t) =>
        !t.isDone &&
        !t.isProject &&
        !(s.noRecurring && t.repeats) &&
        (withRules ? matchesAllSectionRules(t, s, propertyOfTask) : !!t.keyword) &&
        // (3.01) «Mostrar cabeceras sin tarea»: también los encabezados sin estado (con reglas)
        (!!t.keyword || hasInboxTag(t) || (s.headings === true && withRules)) &&
        !hiddenBy(t, s, today)
    );
  } else {
    out = tasks.filter((t) => listOf(t, today) === view.id);
  }
  // (3.0) Como Nirvana: Inbox se ve entero aunque haya un área elegida (para vaciarlo)
  out = out.filter((t) =>
    matchesFilters(t, view.id === 'inbox' ? { ...filters, area: '*' } : filters)
  );
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

// (3.05) «Acciones siguientes secuenciales»: en la lista del proyecto, las tareas en espera
// (WAITING) y las programadas a futuro van mezcladas con las Next (y se ordenan entre sí); si una
// queda antes que las Next, las «bloquea» (no salen en la sección Next general hasta que se
// resuelva)
export const isSeqBlocker = (t, today = new Date()) => {
  if (!t || t.isDone || t.isProject || t.isTrashed || !t.keyword || t.isHabit) return false;
  const sec = projectSectionOf(t, today);
  return sec === 'waiting' || sec === 'scheduled';
};
// (4.20) Letra de la casilla: W = en espera, S = programada a futuro (todas las tareas, no solo las
// de proyectos secuenciales); null si no es ninguna de las dos o está hecha
export const seqMarkOf = (t, today = new Date()) =>
  isSeqBlocker(t, today) ? (isFutureScheduled(t, today) ? 'S' : 'W') : null;
// (4.43) Vista dentro de un proyecto: «Acciones siguientes secuenciales» (true) o «Lista única»
// (false). Por defecto la manda el proyecto (`:ORDERED: t` = secuencial; sin eso, paralelo = lista
// única). Si el usuario elige otra a mano (`override` 'sequential' | 'none') vale hasta salir del
// proyecto. NO toca el ajuste global (`eliGtdGroup`, que es el de Next).
export const projectViewSequential = (projectTask, override = null) =>
  override === 'sequential'
    ? true
    : override === 'none'
    ? false
    : !!(projectTask && projectTask.ordered);
// Sección de una tarea en su proyecto, con el modo secuencial (bloqueantes → 'next')
export const projectSectionOfSeq = (task, today = new Date(), sequential = false) =>
  sequential && isSeqBlocker(task, today) ? 'next' : projectSectionOf(task, today);

// Tareas del proyecto por secciones: [{ ...sección, tasks }] (también las vacías)
export const projectSections = (tasks, projectKey, filters = {}, today = new Date(), opts = {}) => {
  const projectTask = tasks.find((t) => t.key === projectKey);
  // (4.45) en la vista secuencial de un proyecto, el rótulo de Next es «Next Up» (solo el rótulo)
  const out = PROJECT_SECTIONS.map((s) => ({
    ...s,
    label: s.id === 'next' && opts.sequential ? 'Next Up' : s.label,
    tasks: [],
  }));
  if (!projectTask) return out;
  const s = getGtdConfig().sections.projects;
  const byId = {};
  out.forEach((sec) => (byId[sec.id] = sec));
  tasks
    // (4.22) un proyecto dentro de este sale como una fila más (sección Todo, como en Focus)
    .filter((t) => inProject(t, projectTask) && t.keyword && !t.isTrashed)
    .sort(byProjectOrder)
    .filter((t) => {
      if (t.isDone) return true;
      // Aparcadas (proyecto dormido) y hábitos: según los ticks de Ajustes; las programadas a
      // futuro se ven siempre, en su sección
      const why = hiddenBy(t, s, today);
      return why !== 'parked' && why !== 'habit';
    })
    .filter((t) => matchesFilters(t, filters))
    .forEach((t) => byId[projectSectionOfSeq(t, today, !!opts.sequential)].tasks.push(t));
  out.forEach((sec) => {
    sec.tasks =
      sec.id === 'done'
        ? [...sec.tasks].sort((a, b) => (b.closed || 0) - (a.closed || 0))
        : dueFirstFileOrder(sec.tasks, today);
  });
  // (2.17) «Referencias»: los encabezados sin estado del proyecto (notas, material…), en el orden
  // del fichero; división plegable al final, como «Terminadas»
  // (3.01) …y las de otros ficheros asignadas al proyecto, detrás
  const refs = tasks
    .filter(
      (t) => !t.keyword && !t.isTrashed && inProject(t, projectTask) && t.key !== projectTask.key
    )
    .filter((t) => matchesFilters(t, filters))
    .sort(byProjectOrder);
  out.push({ id: 'refs', label: 'Referencias', icon: 'far fa-file-alt', tasks: refs });
  return out;
};

// (4.32) Cabeceras sin estado que cuentan para las etiquetas de la barra de filtros de una vista:
// las Referencias de un proyecto (view.type 'project') o las que llevan la etiqueta de una vista
// de etiqueta con «cabeceras sin tarea» (`withHeadings`). Las demás vistas: ninguna.
export const filterHeadings = (tasks, view, withHeadings = false) => {
  if (view.type === 'project') {
    const p = tasks.find((t) => t.key === view.key && !t.isTrashed);
    return p
      ? tasks.filter((t) => !t.keyword && !t.isTrashed && inProject(t, p) && t.key !== p.key)
      : [];
  }
  if (view.id === 'tag' && withHeadings) {
    return tasks.filter(
      (t) =>
        !t.keyword &&
        !t.isTrashed &&
        !t.isProject &&
        (t.tags || []).includes(view.tag) &&
        listOf(t) !== 'inbox'
    );
  }
  return [];
};

// (4.22) Tarea (o cabecera) por su :ID: (org-id), sin distinguir mayúsculas; las de la Papelera no
export const taskByOrgId = (tasks, id) => {
  const want = String(id || '')
    .trim()
    .toLowerCase();
  if (!want) return null;
  return tasks.find((t) => !t.isTrashed && t.orgId && t.orgId.toLowerCase() === want) || null;
};

// (4.22) Proyectos con sus subproyectos debajo: [{ p, depth }]. Un subproyecto cuelga de su madre si
// esta también está en la lista; si no, va al nivel superior. Respeta el orden recibido.
export const nestProjects = (list) => {
  const keys = new Set(list.map((p) => p.key));
  const parentKey = (p) => (p.project ? `${p.project.path}::${p.project.id}` : null);
  const kids = new Map();
  const roots = [];
  list.forEach((p) => {
    const pk = parentKey(p);
    if (pk && pk !== p.key && keys.has(pk)) {
      if (!kids.has(pk)) kids.set(pk, []);
      kids.get(pk).push(p);
    } else roots.push(p);
  });
  const out = [];
  const seen = new Set();
  const walk = (p, depth) => {
    if (seen.has(p.key)) return;
    seen.add(p.key);
    out.push({ p, depth });
    (kids.get(p.key) || []).forEach((c) => walk(c, depth + 1));
  };
  roots.forEach((p) => walk(p, 0));
  // por si hubiera un ciclo raro: lo que falte va al final
  list.forEach((p) => walk(p, 0));
  return out;
};

// (4.22) Contenido de una referencia: sus notas y, debajo, los encabezados sin estado que cuelgan
// de ella (con sus notas), para verlo todo con el botón de notas de la fila
export const refContentOf = (tasks, ref) => {
  if (!ref) return '';
  const parts = [(ref.description || '').replace(/\s+$/, '')];
  const same = tasks.filter((t) => t.path === ref.path && t.index > ref.index);
  same.sort((a, b) => a.index - b.index);
  let skipLevel = null; // lo que cuelga de una tarea con estado no es contenido de la referencia
  for (const t of same) {
    if (t.level <= ref.level) break;
    if (skipLevel !== null) {
      if (t.level > skipLevel) continue;
      skipLevel = null;
    }
    if (t.keyword) {
      skipLevel = t.level;
      continue;
    }
    parts.push(`*${t.title || '(sin título)'}*`);
    const d = (t.description || '').replace(/\s+$/, '');
    if (d) parts.push(d);
  }
  return parts.filter((x) => x && x.trim()).join('\n');
};

// (4.22) Referencias de un proyecto para la vista: las que cuelgan de otra referencia de la lista
// no salen aparte; su contenido va en el de la madre (botón de notas de la fila)
export const collapseRefs = (allTasks, refs) => {
  const inList = new Set(refs.map((r) => r.key));
  const byId = new Map(allTasks.map((t) => [`${t.path}::${t.id}`, t]));
  const nested = (t) => {
    const p = t.parentId != null ? byId.get(`${t.path}::${t.parentId}`) : null;
    return !!p && inList.has(p.key);
  };
  return refs
    .filter((t) => !nested(t))
    .map((t) => {
      const content = refContentOf(allTasks, t);
      // refAggregated: la descripción lleva también lo de las hijas (no es su texto real)
      return content.trim() !== (t.description || '').trim()
        ? { ...t, description: content, refAggregated: true }
        : t;
    });
};

// (4.49) Referencias de un proyecto como ÁRBOL (como la vista por etiqueta de Documentos): cada
// referencia cuelga de su madre MÁS CERCANA que también esté en la lista (aunque entre medias haya
// madres que no salen) y lleva su propio contenido. → [{ task, depth, hasKids, kidCount }] en
// preorden, en el orden de la lista; `kidCount` = hijas directas.
export const nestProjectRefs = (allTasks, refs) => {
  const inList = new Set(refs.map((r) => r.key));
  const byKey = new Map(allTasks.map((t) => [t.key, t]));
  const nearestInList = (t) => {
    let p = t.parentId != null ? byKey.get(`${t.path}::${t.parentId}`) : null;
    let guard = 0;
    while (p && guard++ < 50) {
      if (inList.has(p.key)) return p.key;
      p = p.parentId != null ? byKey.get(`${p.path}::${p.parentId}`) : null;
    }
    return null;
  };
  const kids = new Map();
  const roots = [];
  refs.forEach((r) => {
    const pk = nearestInList(r);
    if (pk && pk !== r.key) {
      if (!kids.has(pk)) kids.set(pk, []);
      kids.get(pk).push(r);
    } else {
      roots.push(r);
    }
  });
  const out = [];
  const emit = (r, depth) => {
    const k = kids.get(r.key) || [];
    out.push({ task: r, depth, hasKids: k.length > 0, kidCount: k.length });
    k.forEach((c) => emit(c, depth + 1));
  };
  roots.forEach((r) => emit(r, 0));
  return out;
};

// (4.57) Reuniones (`:TYPE: meeting`, heredable) en una SECCIÓN PROPIA con «cabeceras sin tarea»:
// las cabeceras de tipo meeting (y las que cuelgan de ellas) salen como árbol, juntas donde estaba
// la primera de ellas; el resto de filas y su orden NO cambian. → { list, depth: Map(key → nivel) }
// (4.60) `pick` elige qué filas van en árbol (por defecto las meeting; en las secciones propias con
// «cabeceras sin tarea», todas las cabeceras sin estado). `kids` = nº de hijas directas (▾/▸).
export const nestMeetingRows = (allTasks, list, pick = (t) => t.type === 'meeting') => {
  const meeting = list.filter(pick);
  if (!meeting.length) return { list, depth: new Map(), kids: new Map() };
  const nodes = nestProjectRefs(allTasks, meeting);
  const depth = new Map(nodes.map((n) => [n.task.key, n.depth]));
  const kids = new Map(nodes.map((n) => [n.task.key, n.kidCount]));
  const out = [];
  let placed = false;
  list.forEach((t) => {
    if (!pick(t)) out.push(t);
    else if (!placed) {
      placed = true;
      nodes.forEach((n) => out.push(n.task));
    }
  });
  return { list: out, depth, kids };
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
    g.tasks = dueFirstFileOrder([...g.tasks].sort(byProjectOrder), today);
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
    .filter((t) => t.isProject && !t.isDone && !t.isTrashed)
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
export const facetsFor = (tasks, opts = {}) => {
  const tags = new Set();
  const energy = new Set();
  let hasEffort = false;
  let hasDates = false;
  let hasBadProject = false;
  let hasUntagged = false;
  let hasInherited = !!opts.ownOnly;
  const persons = new Map();
  tasks.forEach((t) => {
    (t.personLinks || []).forEach((l) => {
      const k = l.id.toLowerCase();
      if (!persons.has(k)) persons.set(k, { id: l.id, name: l.title || l.id });
    });
    if (t.badProject) hasBadProject = true;
    if (isUntagged(t)) hasUntagged = true;
    (opts.ownOnly ? t.ownTags || [] : t.tags).forEach((x) => tags.add(x));
    // (4.49) las etiquetas del fichero (#+FILETAGS:) salen como heredadas
    if (!opts.ownOnly && t.fileTags) t.fileTags.forEach((x) => tags.add(x));
    if (
      !opts.ownOnly &&
      (t.tags.length > (t.ownTags || []).length || (t.fileTags && t.fileTags.length))
    )
      hasInherited = true;
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
    hasBadProject,
    hasUntagged,
    // 3.36: hay etiquetas heredadas en la lista (o el filtro «Heredadas» está apagado)
    hasInherited,
    // (4.48) personas de las tareas de la lista (grupo «Personas» de la barra)
    persons: Array.from(persons.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
    ),
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
// (3.43) Tampoco las terminadas de un proyecto que sigue abierto: se quedan con él y, cuando el
// proyecto se termina, se archiva todo junto.
// (3.44) ¿Es una tarea (no proyecto) de un proyecto que sigue abierto? (Archivar y Limpieza)
export const inOpenProjectFn = (tasks) => {
  const openProjects = new Set(
    tasks.filter((t) => t.isProject && !t.isDone).map((t) => `${t.path}::${t.id}`)
  );
  return (t) =>
    !t.isProject && !!t.project && openProjects.has(`${t.project.path}::${t.project.id}`);
};
export const archivableDone = (tasks, onlyPaths = null) => {
  const ok = [];
  const blocked = [];
  const byPath = {};
  const inOpenProject = inOpenProjectFn(tasks);
  // (2.17) solo los ficheros elegidos en Ajustes (vacío: todos)
  const allowed = onlyPaths && onlyPaths.length ? new Set(onlyPaths) : null;
  tasks
    .filter((t) => !allowed || allowed.has(t.path))
    .forEach((t) => (byPath[t.path] = byPath[t.path] || []).push(t));
  Object.values(byPath).forEach((list) => {
    const sorted = [...list].sort((a, b) => a.index - b.index);
    sorted.forEach((t, i) => {
      if (!t.isDone) return;
      let open = inOpenProject(t);
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
    const actions = tasks
      .filter((t) => inProject(t, p) && t.keyword && !t.isDone && !t.isProject && !t.isTrashed)
      .sort(byProjectOrder);
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

// (2.17) Subtareas asociadas: dentro de cada tramo de tareas seguidas (entre dos cabeceras de
// sección), las subtareas van justo debajo de su tarea, con su profundidad (`depth`, 1 = hija).
// Una tarea cuyo padre no está en el tramo queda donde estaba (sin sangría). `skip(task)` deja
// fuera las que no deben moverse (p. ej. vistas ordenadas por fecha).
export const nestSubtasks = (items, skip = null) => {
  const out = [];
  let run = [];
  const flush = () => {
    if (!run.length) return;
    const byKey = new Map(run.map((i) => [i.task.key, i]));
    const parentKeyOf = (i) =>
      i.task.parentId && !(skip && skip(i.task)) ? `${i.task.path}::${i.task.parentId}` : null;
    const children = new Map();
    const roots = [];
    run.forEach((i) => {
      const pk = parentKeyOf(i);
      const parent = pk && byKey.get(pk);
      if (parent && !parent.task.isProject && !i.task.isProject) {
        // (3.02) como subtarea solo sale una cabecera CON palabra de acción
        if (!i.task.keyword) return;
        if (!children.has(pk)) children.set(pk, []);
        children.get(pk).push(i);
      } else {
        roots.push(i);
      }
    });
    const emit = (i, depth) => {
      const kids = children.get(i.task.key) || [];
      out.push(depth || kids.length ? { ...i, depth, hasKids: kids.length > 0 } : i);
      kids.forEach((c) => emit(c, depth + 1));
    };
    roots.forEach((r) => emit(r, 0));
    run = [];
  };
  items.forEach((i) => {
    if (i.kind === 'task') run.push(i);
    else {
      flush();
      out.push(i);
    }
  });
  flush();
  return out;
};

// (4.32) Lista Referencia con ▸: cada referencia despliega sus subcabeceras (con estado si lo
// tienen) y sus notas, a varios niveles. Las filas de la lista que cuelgan de otra fila de la lista
// no salen sueltas: van dentro de su madre. `openSet` = ids (idOf) de las desplegadas.
// (4.44) `headingsOnly` (vista de una etiqueta en GTD): solo se anidan las cabeceras SIN estado
// (las que heredan la etiqueta de su madre); las tareas siguen sueltas en su sitio, como antes.
export const nestRefKids = (items, allTasks, openSet, idOf, { headingsOnly = false } = {}) => {
  const kidsOf = new Map();
  allTasks.forEach((t) => {
    if (!t.parentId || t.isTrashed) return;
    if (headingsOnly && t.keyword) return;
    const k = `${t.path}::${t.parentId}`;
    if (!kidsOf.has(k)) kidsOf.set(k, []);
    kidsOf.get(k).push(t);
  });
  const inList = new Set(items.filter((i) => i.kind === 'task').map((i) => i.task.key));
  const byKey = new Map(allTasks.map((t) => [t.key, t]));
  const hasListAncestor = (t) => {
    let p = t.parentId ? byKey.get(`${t.path}::${t.parentId}`) : null;
    let guard = 0;
    while (p && guard++ < 50) {
      if (inList.has(p.key)) return true;
      // (4.44) solo por cabeceras sin estado: si no, la madre no la enseñaría al desplegar
      if (headingsOnly && p.keyword) return false;
      p = p.parentId ? byKey.get(`${p.path}::${p.parentId}`) : null;
    }
    return false;
  };
  const out = [];
  const emitKids = (t, depth, section) => {
    (kidsOf.get(t.key) || []).forEach((k) => {
      const sub = kidsOf.get(k.key) || [];
      out.push({
        kind: 'task',
        task: k,
        section,
        reorderable: false,
        isRef: !k.keyword,
        depth,
        refKids: true,
        hasKids: sub.length > 0,
        folded: !openSet.has(idOf(k)),
        forceNotes: true,
      });
      if (sub.length && openSet.has(idOf(k))) emitKids(k, depth + 1, section);
    });
  };
  items.forEach((i) => {
    if (i.kind !== 'task') {
      out.push(i);
      return;
    }
    if (hasListAncestor(i.task) && !(headingsOnly && i.task.keyword)) return;
    const n = (kidsOf.get(i.task.key) || []).length;
    const open = n > 0 && openSet.has(idOf(i.task));
    out.push(n ? { ...i, refKids: true, hasKids: true, folded: !open } : i);
    if (open) emitKids(i.task, (i.depth || 0) + 1, i.section);
  });
  return out;
};

// (3.0) Grupo «Hecho» de una vista: las terminadas desde ella que aún no han pasado al Logbook
// (propiedad DONE_IN; ver arriba), las últimas primero
export const doneForView = (tasks, view, filters = {}) => {
  if (!view || view.type === 'project' || !view.id) return [];
  if (['logbook', 'trash', 'projects', 'scheduled', 'deadline', 'tag'].includes(view.id)) return [];
  return tasks
    .filter((t) => t.isDone && !t.isTrashed && t.doneIn && doneInLists(t).includes(view.id))
    .filter((t) => matchesFilters(t, filters))
    .sort((a, b) => (b.closed || 0) - (a.closed || 0));
};
// Todas las que están en algún grupo «Hecho» (lo que se lleva la «Limpieza»)
// (3.44) salvo las de un proyecto que sigue abierto: se quedan con él y, cuando el proyecto se
// termina, la Limpieza se las lleva todas juntas
export const doneWaitingCleanup = (tasks) => {
  const inOpenProject = inOpenProjectFn(tasks);
  return tasks.filter((t) => t.isDone && !!t.doneIn && !inOpenProject(t));
};

// (3.0) Lista en la que está una tarea (para DONE_IN): su lista y, si tiene ★, también «focus»
export const doneInValueFor = (task, today = new Date()) => {
  const out = [];
  const l = listOf(task, today);
  if (l && !['logbook', 'done', 'trash', 'parked', 'habit', 'scheduled', 'project'].includes(l)) {
    out.push(l);
  }
  if (isFocus(task, today)) out.push('focus');
  if (!out.length) out.push(task.project ? 'next' : l === 'scheduled' ? 'later' : 'next');
  return out.join(' ');
};

// (3.0) Fecha límite como en Nirvana: «Atrasada», «Vence hoy», «Mañana», «en 3 días»…
// level: 'overdue' | 'today' | 'soon' (≤ 7 días) | 'later'
// (3.05) Tiempo que lleva vencida, corto: «3 d», «2 sem», «4 meses», «1 año»
export const overdueAgo = (days) => {
  if (!(days > 0)) return '';
  if (days < 14) return `${days} d`;
  if (days < 60) return `${Math.floor(days / 7)} sem`;
  if (days < 365) {
    const m = Math.floor(days / 30);
    return m === 1 ? '1 mes' : `${m} meses`;
  }
  const y = Math.floor(days / 365);
  return y === 1 ? '1 año' : `${y} años`;
};
export const dueInfo = (deadline, today = new Date()) => {
  if (!deadline) return null;
  const d = startOfDay(deadline);
  const t0 = startOfDay(today);
  const days = Math.round((d - t0) / 86400000);
  // (3.05) …y, discreto, cuánto lleva atrasada (3 d, 2 sem, 4 meses)
  if (days < 0) return { level: 'overdue', text: 'Atrasada', days, ago: overdueAgo(-days) };
  if (days === 0) return { level: 'today', text: 'Vence hoy', days };
  if (days === 1) return { level: 'soon', text: 'Mañana', days };
  if (days <= 7) return { level: 'soon', text: `en ${days} días`, days };
  return {
    level: 'later',
    text: d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
    days,
  };
};

// (3.0) Ordenar la lista por fecha límite (tecla d): las que vencen antes, primero
export const sortByDue = (list) => {
  const far = 8.64e15;
  return [...list].sort((a, b) => (a.deadline || far) - (b.deadline || far));
};

// (3.01) Copiar la lista (o las seleccionadas) como ORG Mode (⌘C / Ctrl+C sin texto
// seleccionado): «* TODO título :etiqueta:», un nivel más por cada subtarea que va con su madre,
// y debajo su cuerpo tal cual (SCHEDULED/DEADLINE, propiedades y notas). Con título (la lista
// entera), «#+TITLE:» delante.
const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(
    2,
    '0'
  )}`;
export const tasksToOrg = (title, list) => {
  const byKey = new Map(list.map((t) => [t.key, t]));
  const depthOf = (t) => {
    let d = 0;
    let cur = t;
    const seen = new Set();
    while (cur && cur.parentId) {
      const pk = `${cur.path}::${cur.parentId}`;
      if (seen.has(pk)) break;
      seen.add(pk);
      const p = byKey.get(pk);
      if (!p) break;
      d++;
      cur = p;
    }
    return d;
  };
  const blocks = list.map((t) => {
    const raw = (t.rawTitle || t.title || '').replace(PRIORITY_RE, '').trim() || '(sin título)';
    const tags = (t.ownTags || t.tags || []).filter(Boolean);
    const head = [t.keyword || null, t.priority ? `[#${t.priority}]` : null, raw]
      .filter(Boolean)
      .join(' ');
    const line = `${'*'.repeat(depthOf(t) + 1)} ${head}${
      tags.length ? ` :${tags.join(':')}:` : ''
    }`;
    let body = '';
    if (t.header && t.header.get) {
      try {
        body = createRawDescriptionText(t.header, false, true);
      } catch (e) {
        body = t.description || '';
      }
    } else {
      const plan = [
        t.scheduled ? `SCHEDULED: <${ymd(t.scheduled)}>` : '',
        t.deadline ? `DEADLINE: <${ymd(t.deadline)}>` : '',
      ]
        .filter(Boolean)
        .join(' ');
      body = [plan, t.description || ''].filter(Boolean).join('\n');
    }
    body = body.replace(/\s+$/, '');
    return body ? `${line}\n${body}` : line;
  });
  return title ? [`#+TITLE: ${title}`, '', ...blocks].join('\n') : blocks.join('\n');
};

// (3.01) «Acciones siguientes secuenciales» (como Nirvana): de cada proyecto, solo su primera
// acción (en el orden del proyecto: primero las suyas, en el orden del fichero, y luego las de
// otros ficheros asignadas con :PROYECTO:); las sueltas, todas
const projectKeyOf = (t) => (t.project ? `${t.project.path}::${t.project.id}` : null);
const projectRank = (t) => [t.projectExternal ? 1 : 0, t.projectExternal ? t.path : '', t.index];
const cmpRank = (a, b) => {
  const ra = projectRank(a);
  const rb = projectRank(b);
  for (let i = 0; i < ra.length; i++) {
    if (ra[i] < rb[i]) return -1;
    if (ra[i] > rb[i]) return 1;
  }
  return 0;
};
// (3.05) Con `allTasks`, las en espera / programadas del proyecto que vayan antes la bloquean
export const firstPerProject = (list, allTasks = null, today = new Date()) => {
  const best = new Map();
  const consider = (t) => {
    const k = !t.isProject && projectKeyOf(t);
    if (!k) return;
    const b = best.get(k);
    if (!b || cmpRank(t, b) < 0) best.set(k, t);
  };
  list.forEach(consider);
  if (allTasks) allTasks.forEach((t) => projectKeyOf(t) && isSeqBlocker(t, today) && consider(t));
  return list.filter((t) => t.isProject || !t.project || best.get(projectKeyOf(t)) === t);
};

// (3.0) Tiempo total de varias tareas (menú contextual con varias seleccionadas)
export const totalEffort = (list) => {
  const m = list.reduce((acc, t) => acc + (effortMinutes(t.effort) || 0), 0);
  if (!m) return '';
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return h ? `${h} h${mm ? ` ${mm} min` : ''}` : `${mm} min`;
};
