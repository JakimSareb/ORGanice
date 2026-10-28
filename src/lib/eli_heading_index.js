// ORG Mode para Eli (4.31): índice común de cabeceras de los ficheros CARGADOS, para la vista por
// etiqueta, las referencias entrantes (quién enlaza aquí), el buscador «[[» y el «#» al escribir
// el título. Cada entrada: { path, headerId, orgId, title, rawTitle, level, parents (títulos de
// las madres), ownTags, tags (con las heredadas), keyword, notes, linkText, pos }.
// Modelo puro (sin Redux): se guarda en caché por fichero (la lista de cabeceras es inmutable).
import { List } from 'immutable';
import { cleanHeadingText } from './eli_org_links';
import { normalize } from './eli_fuzzy';
import { isDiaryPath } from './eli_diary';
import { STATIC_FILE_PREFIX } from './org_utils';
import { dateForTimestamp } from './timestamps';
import { attributedStringToRawText } from './export_org';
import { fileRoamInfo, parseAliases, isExcludeValue, parseRefs } from './eli_roam';

// Título para enseñar: sin prioridad ni contadores y con los enlaces como su texto
export const plainHeadingTitle = (rawTitle) =>
  cleanHeadingText(rawTitle).replace(/\[\[([^\]]*)\](?:\[([^\]]*)\])?\]/g, (m, l, d) => d || l);

const propertyText = (item) => {
  const v = item.get('value');
  if (v == null) return '';
  if (typeof v === 'string') return v;
  return v
    .map((part) =>
      part.get('type') === 'link'
        ? `[[${part.getIn(['contents', 'uri']) || ''}]]`
        : part.get('contents') || ''
    )
    .join('');
};

export const idOf = (header) => {
  const item = (header.get('propertyListItems') || List()).find(
    (p) => (p.get('property') || '').toUpperCase() === 'ID'
  );
  const id = item ? propertyText(item).trim() : '';
  return id || null;
};

// ¿Es una ruta de fichero de verdad (no un fichero interno de la app)?
export const isUserPath = (path) =>
  !!path &&
  typeof path === 'string' &&
  path.startsWith('/') &&
  !path.startsWith('/__') &&
  !path.includes(STATIC_FILE_PREFIX);

// (4.36) Fechas de una cabecera para ordenar backlinks: propiedad CREATED, planificación y día del
// diario (la madre o ella misma con ID «diari-AAAA-MM-DD»)
const planningMs = (header, type) => {
  const item = (header.get('planningItems') || List()).find((p) => p.get('type') === type);
  if (!item) return null;
  try {
    const d = dateForTimestamp(item.get('timestamp'));
    return d && !isNaN(d.getTime()) ? d.getTime() : null;
  } catch (e) {
    return null;
  }
};
const DIARY_ID_RE = /^diari-(\d{4})-(\d{2})-(\d{2})$/i;

const cache = new WeakMap();

// Entradas de un fichero (en caché mientras su lista de cabeceras no cambie)
const propOf = (h, name) => {
  const item = (h.get('propertyListItems') || List()).find(
    (p) => (p.get('property') || '').toUpperCase() === name
  );
  return item ? propertyText(item).trim() : '';
};

const PERSON_ID_RE = /\[\[id:\s*([^\]\s]+)\s*\]/gi;
const personIdsOf = (text) => {
  const out = [];
  let m;
  PERSON_ID_RE.lastIndex = 0;
  while ((m = PERSON_ID_RE.exec(text || ''))) if (!out.includes(m[1])) out.push(m[1]);
  return out;
};

export const fileHeadings = (path, file) => {
  const headers = file && file.get && file.get('headers');
  if (!headers || typeof headers.forEach !== 'function') return [];
  const lbh = file.get('linesBeforeHeadings') || null;
  const hit = cache.get(headers);
  if (hit && hit.path === path && hit.lbh === lbh) return hit.entries;
  const entries = [];
  const stack = []; // [{ level, title, tags }]
  // (4.41) org-roam: #+filetags: las heredan todas las cabeceras; :ROAM_EXCLUDE: del fichero
  // deja fuera todo el fichero (y el de una cabecera, todo su subárbol)
  const roam = fileRoamInfo(file);
  headers.forEach((h) => {
    const level = h.get('nestingLevel') || 1;
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    const rawTitle = h.getIn(['titleLine', 'rawTitle']) || '';
    const ownTags = ((h.getIn(['titleLine', 'tags']) || List()).toArray
      ? h.getIn(['titleLine', 'tags']).toArray()
      : h.getIn(['titleLine', 'tags']) || []
    ).filter(Boolean);
    const inherited = stack.length ? stack[stack.length - 1].tags : roam.filetags;
    const tags = Array.from(new Set([...inherited, ...ownTags]));
    const title = plainHeadingTitle(rawTitle);
    const props = (h.get('propertyListItems') || List()).map(propertyText).toArray();
    const notes = h.get('rawDescription') || '';
    const orgId = idOf(h);
    const createdItem = (h.get('propertyListItems') || List()).find(
      (p) => (p.get('property') || '').toUpperCase() === 'CREATED'
    );
    const diaryHere = orgId && DIARY_ID_RE.exec(orgId);
    const diaryUp = stack.length ? stack[stack.length - 1].diaryDay : null;
    const diaryDay = diaryHere ? `${diaryHere[1]}-${diaryHere[2]}-${diaryHere[3]}` : diaryUp;
    const exclude =
      (stack.length ? stack[stack.length - 1].exclude : roam.exclude) ||
      isExcludeValue(propOf(h, 'ROAM_EXCLUDE'));
    entries.push({
      path,
      headerId: h.get('id'),
      orgId,
      title,
      rawTitle,
      level,
      parents: stack.map((s) => s.title),
      // (4.35) posiciones de TODAS las madres (la más cercana al final), para colgar resultados
      ancestorPos: stack.map((s) => s.pos),
      ownTags,
      tags,
      keyword: h.getIn(['titleLine', 'todoKeyword']) || null,
      notes,
      linkText: `${rawTitle}\n${notes}\n${props.join('\n')}`,
      // (4.36) fechas para ordenar
      created:
        createdItem && createdItem.get('value')
          ? attributedStringToRawText(createdItem.get('value')).trim() || null
          : null,
      closed: planningMs(h, 'CLOSED'),
      scheduled: planningMs(h, 'SCHEDULED'),
      deadline: planningMs(h, 'DEADLINE'),
      diaryDay,
      // (4.41) org-roam
      aliases: parseAliases(propOf(h, 'ROAM_ALIASES')),
      refs: parseRefs(propOf(h, 'ROAM_REFS')),
      // (4.48) personas enlazadas con :PERSONA: [[id:…]] (ids)
      persons: personIdsOf(propOf(h, 'PERSONA')),
      exclude,
      pos: entries.length,
    });
    stack.push({ level, title, tags, pos: entries.length - 1, diaryDay, exclude });
  });
  cache.set(headers, { path, entries, lbh });
  return entries;
};

/**
 * Índice de todos los ficheros cargados. `files` = Map ruta → fichero (Immutable) o un objeto.
 * opts.skipDiary: sin el diario ni el mensual (diari-AAAA.org, mensual-AAAA.org).
 * Devuelve un array con `.byPath` (Map ruta → entradas del fichero, en orden).
 */
export const headingIndex = (files, { skipDiary = false } = {}) => {
  const out = [];
  out.byPath = new Map();
  if (!files) return out;
  const each = (file, path) => {
    if (!isUserPath(path)) return;
    if (skipDiary && isDiaryPath(path)) return;
    const entries = fileHeadings(path, file);
    if (!entries.length) return;
    out.byPath.set(path, entries);
    entries.forEach((e) => out.push(e));
  };
  if (typeof files.forEach === 'function' && files.get) files.forEach(each);
  else Object.keys(files).forEach((p) => each(files[p], p));
  return out;
};

// Subcabeceras directas de una entrada (en su fichero)
export const childrenOf = (index, entry) => {
  const list = (index.byPath && index.byPath.get(entry.path)) || [];
  const out = [];
  const depth = entry.parents.length + 1;
  for (let i = entry.pos + 1; i < list.length; i++) {
    const e = list[i];
    if (e.level <= entry.level) break;
    if (e.parents.length === depth) out.push(e);
  }
  return out;
};

const hasTag = (list, tag) => {
  const t = String(tag || '').toLowerCase();
  return list.some((x) => String(x).toLowerCase() === t);
};

/**
 * Cabeceras con TODAS las etiquetas `tags` (con heredadas si `inherited`).
 * (4.44) Con heredadas salen TODAS (también las hijas que la heredan): la vista las anida bajo su
 * madre (nestEntries), sangradas y plegables. Antes solo salían las de más arriba y la casilla
 * «Incluir heredadas» no parecía hacer nada.
 */
export const entriesWithTags = (index, tags, { inherited = true } = {}) => {
  const want = (Array.isArray(tags) ? tags : [tags]).filter(Boolean);
  if (!want.length) return [];
  const matches = (e) => want.every((t) => hasTag(inherited ? e.tags : e.ownTags, t));
  const out = [];
  (index.byPath || new Map()).forEach((list) => {
    list.forEach((e) => {
      if (matches(e)) out.push(e);
    });
  });
  return out;
};

// Todas las etiquetas (propias) del índice → [{ tag, count }] por nombre
export const allTags = (index) => {
  const counts = new Map();
  index.forEach((e) =>
    e.ownTags.forEach((t) => {
      const k = t.toLowerCase();
      const prev = counts.get(k);
      counts.set(k, { tag: prev ? prev.tag : t, count: (prev ? prev.count : 0) + 1 });
    })
  );
  return Array.from(counts.values()).sort((a, b) =>
    a.tag.localeCompare(b.tag, 'es', { sensitivity: 'base' })
  );
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Cabeceras que enlazan a `orgId` con [[id:…]] (título, notas o propiedades), sin la propia
export const backlinkEntries = (index, orgId) => {
  if (!orgId) return [];
  const re = new RegExp(`\\[\\[id:\\s*${escapeRe(orgId)}\\s*\\]`, 'i');
  // (4.41) las cabeceras con :ROAM_EXCLUDE: no salen
  return index.filter((e) => e.orgId !== orgId && !e.exclude && re.test(e.linkText));
};

// (4.37) Nº de cabeceras que enlazan a cada ID, para el indicador de la cabecera. Barato: se
// cuenta UNA vez por lista de entradas de cada fichero (en caché mientras sus cabeceras no cambien)
// y se suma por `files`; el título de cada cabecera solo consulta el mapa.
const LINK_ID_RE = /\[\[id:\s*([^\]\s]+)\s*\]/gi;
const idCountsCache = new WeakMap(); // entradas de un fichero → Map(id → nº de cabeceras)
const idCountsOf = (entries) => {
  let hit = idCountsCache.get(entries);
  if (hit) return hit;
  hit = new Map();
  entries.forEach((e) => {
    const seen = new Set();
    const text = e.linkText || '';
    let m;
    LINK_ID_RE.lastIndex = 0;
    while ((m = LINK_ID_RE.exec(text))) {
      const id = m[1].toLowerCase();
      if (id === (e.orgId || '').toLowerCase() || seen.has(id)) continue;
      seen.add(id);
      hit.set(id, (hit.get(id) || 0) + 1);
    }
  });
  idCountsCache.set(entries, hit);
  return hit;
};
const totalsCache = new WeakMap(); // files → Map(id → nº)
export const backlinkCounts = (files) => {
  if (!files || typeof files !== 'object') return new Map();
  const hit = totalsCache.get(files);
  if (hit) return hit;
  const total = new Map();
  const each = (file, path) => {
    if (!isUserPath(path)) return;
    const entries = fileHeadings(path, file);
    if (!entries.length) return;
    idCountsOf(entries).forEach((n, id) => total.set(id, (total.get(id) || 0) + n));
  };
  if (typeof files.forEach === 'function' && files.get) files.forEach(each);
  totalsCache.set(files, total);
  return total;
};
export const backlinkCountOf = (files, orgId) =>
  orgId ? backlinkCounts(files).get(String(orgId).trim().toLowerCase()) || 0 : 0;

// Agrupar por fichero, en el orden en que salen → [{ path, entries }]
export const groupByPath = (entries) => {
  const map = new Map();
  entries.forEach((e) => {
    if (!map.has(e.path)) map.set(e.path, []);
    map.get(e.path).push(e);
  });
  return Array.from(map.entries()).map(([path, list]) => ({ path, entries: list }));
};

export const fileNameOf = (path) =>
  String(path || '')
    .split('/')
    .pop();

// «Madre › Abuela · fichero.org»
export const contextLabel = (entry) =>
  [entry.parents.length ? entry.parents.join(' › ') : '', fileNameOf(entry.path)]
    .filter(Boolean)
    .join(' · ');

/**
 * Buscar cabeceras por título (sin tildes ni mayúsculas; todas las palabras). Primero las que
 * empiezan por la búsqueda. Vacío = todas (hasta `limit`).
 */
export const searchHeadings = (index, query, limit = 60) => {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const scored = [];
  index.forEach((e) => {
    if (!e.title) return;
    // (4.41) también por sus alias (:ROAM_ALIASES:)
    const t = normalize([e.title, ...(e.aliases || [])].join(' '));
    if (!words.every((w) => t.includes(w))) return;
    const starts = words.length && t.startsWith(words[0]) ? 0 : 1;
    scored.push({ e, starts, len: t.length });
  });
  scored.sort((a, b) => a.starts - b.starts || a.len - b.len);
  return scored.slice(0, limit).map((s) => s.e);
};

// --- «#» al escribir el título ---

const TAG_GROUP_RE = /(\s+):([\w@#%:]+):\s*$/u;

// Separa las etiquetas «:a:b:» del final del título → { title, tags }
export const splitTrailingTags = (text) => {
  const s = String(text || '');
  const m = TAG_GROUP_RE.exec(s);
  if (!m) return { title: s, tags: [] };
  return {
    title: s.slice(0, m.index).replace(/\s+$/, ''),
    tags: m[2].split(':').filter(Boolean),
  };
};

// Añade `tag` al final del texto del título como «:tag:» (o dentro del grupo que ya haya)
export const appendTagToTitle = (text, tag) => {
  const clean = String(tag || '')
    .trim()
    .replace(/^#+/, '')
    .replace(/[^\w@#%]/gu, '_');
  if (!clean) return String(text || '');
  const { title, tags } = splitTrailingTags(text);
  const next = hasTag(tags, clean) ? tags : [...tags, clean];
  return `${title.replace(/\s+$/, '')} :${next.join(':')}:`;
};

// Une las etiquetas que el usuario ha escrito al final del título con las que ya tenía
export const mergeTitleTags = (titleText, existingTags = []) => {
  const { title, tags } = splitTrailingTags(titleText);
  if (!tags.length) return { title: titleText, tags: existingTags, changed: false };
  const out = [...existingTags];
  tags.forEach((t) => !hasTag(out, t) && out.push(t));
  return { title, tags: out, changed: true };
};

// ¿Se acaba de escribir un «#» que empieza palabra? (posición del cursor tras escribirlo)
export const hashStartsWord = (value, pos) => {
  if (!value || pos < 1 || value[pos - 1] !== '#') return false;
  return pos === 1 || /\s/.test(value[pos - 2]);
};

// ¿Se acaba de escribir el segundo «[» de «[[»?
export const openedDoubleBracket = (value, pos) =>
  !!value && pos >= 2 && value[pos - 1] === '[' && value[pos - 2] === '[' && value[pos - 3] !== '[';

// --- Fichero para páginas nuevas ---

export const PAGES_NAME = 'paginas.org';

export const pagesFilePath = (chosen, inboxPath) => {
  const c = String(chosen || '').trim();
  if (c) return c.startsWith('/') ? c : `/${c}`;
  const i = (inboxPath || '').lastIndexOf('/');
  return (i >= 0 ? inboxPath.slice(0, i + 1) : '/') + PAGES_NAME;
};

export const newPageFileText = (title, orgId) =>
  `#+TITLE: Páginas\n\n* ${String(title || '').trim()}\n:PROPERTIES:\n:ID: ${orgId}\n:END:\n`;

// (4.34) Las primeras líneas de las notas de una cabecera para la vista previa (sin cajones,
// planificación, reloj ni líneas «#+»); cada línea recortada a 160 caracteres
export const notePreview = (notes, maxLines = 2) => {
  const out = [];
  let inDrawer = false;
  String(notes || '')
    .split('\n')
    .forEach((raw) => {
      if (out.length >= maxLines) return;
      const line = raw.trim();
      if (!line) return;
      if (inDrawer) {
        if (/^:END:$/i.test(line)) inDrawer = false;
        return;
      }
      if (/^:[A-Za-z_-]+:$/.test(line) && !/^:END:$/i.test(line)) {
        inDrawer = true;
        return;
      }
      if (/^(CLOSED|SCHEDULED|DEADLINE):/.test(line) || /^#\+/.test(line)) return;
      if (/^CLOCK:/.test(line)) return;
      out.push(line.length > 160 ? `${line.slice(0, 160)}…` : line);
    });
  return out;
};

// --- (4.35) Jerarquía en listas de resultados ---

const keyOf = (e) => `${e.path}\u0000${e.pos}`;

/**
 * Cuelga cada resultado de su madre MÁS CERCANA que también esté en la lista (aunque entre medias
 * haya madres que no salen). Devuelve los nodos de primer nivel: [{ entry, children: [nodos] }],
 * en el orden de los ficheros (por primera aparición) y del documento.
 */
export const nestEntries = (entries) => {
  const order = [];
  const byFile = new Map();
  (entries || []).forEach((e) => {
    if (!byFile.has(e.path)) {
      byFile.set(e.path, []);
      order.push(e.path);
    }
    byFile.get(e.path).push(e);
  });
  const roots = [];
  order.forEach((path) => {
    const list = byFile
      .get(path)
      .slice()
      .sort((a, b) => a.pos - b.pos);
    const nodes = new Map();
    list.forEach((e) => nodes.set(e.pos, { entry: e, children: [] }));
    list.forEach((e) => {
      const node = nodes.get(e.pos);
      const ap = e.ancestorPos || [];
      let parent = null;
      for (let i = ap.length - 1; i >= 0 && !parent; i--) parent = nodes.get(ap[i]) || null;
      if (parent && parent !== node) parent.children.push(node);
      else roots.push(node);
    });
  });
  return roots;
};

// Nº de resultados en un árbol de nodos
export const countNodes = (nodes) =>
  nodes.reduce((n, node) => n + 1 + countNodes(node.children), 0);

/**
 * Orden jerárquico para el buscador «[[»: por fichero, nivel 1 primero y bajo cada una sus hijas
 * (orden del documento). `matches` = las cabeceras que coinciden con el texto; si coincide una
 * hija sale bajo su madre aunque la madre no coincida (entonces `dim: true`).
 * → [{ entry, depth, dim }]
 */
export const orderHierarchical = (matches, index) => {
  const matched = new Set((matches || []).map(keyOf));
  const files = [];
  const seen = new Set();
  (matches || []).forEach((e) => {
    if (!seen.has(e.path)) {
      seen.add(e.path);
      files.push(e.path);
    }
  });
  const out = [];
  files.forEach((path) => {
    const list = (index && index.byPath && index.byPath.get(path)) || [];
    const wanted = new Set();
    (matches || [])
      .filter((e) => e.path === path)
      .forEach((e) => {
        wanted.add(e.pos);
        (e.ancestorPos || []).forEach((p) => wanted.add(p));
      });
    list.forEach((e) => {
      if (!wanted.has(e.pos)) return;
      out.push({
        entry: e,
        depth: (e.ancestorPos || []).length,
        dim: !matched.has(keyOf(e)),
      });
    });
  });
  return out;
};

// --- (4.35) Filtros de la vista por etiqueta ---

export const isArchivedEntry = (e) =>
  /\.org_archive$/i.test(e.path || '') || (e.tags || []).some((t) => /^archive$/i.test(t));

export const isTaskEntry = (e) => !!e.keyword;

export const filterEntries = (entries, { hideArchived = false, hideTasks = false } = {}) =>
  entries.filter((e) => !(hideArchived && isArchivedEntry(e)) && !(hideTasks && isTaskEntry(e)));

// --- (4.35) Backlinks: solo el párrafo que enlaza ---

// Bloques de texto de unas notas: párrafos (separados por línea en blanco) y, dentro, cada ítem de
// lista por separado
const textBlocks = (notes) => {
  const out = [];
  String(notes || '')
    .split(/\n[ \t]*\n/)
    .forEach((para) => {
      const lines = para.split('\n');
      if (lines.some((l) => /^\s*(?:[-+*]|\d+[.)])\s/.test(l))) {
        let cur = null;
        lines.forEach((l) => {
          if (/^\s*(?:[-+*]|\d+[.)])\s/.test(l)) {
            if (cur !== null) out.push(cur);
            cur = l.trim();
          } else if (cur !== null && /^\s+\S/.test(l)) cur += `\n${l.trim()}`;
          else {
            if (cur !== null) out.push(cur);
            cur = null;
            if (l.trim()) out.push(l.trim());
          }
        });
        if (cur !== null) out.push(cur);
      } else if (para.trim()) out.push(para.trim());
    });
  return out;
};

const linkRe = (orgId, flags = 'i') =>
  new RegExp(`\\[\\[id:\\s*${escapeRe(orgId)}\\s*\\](?:\\[([^\\]]*)\\])?\\]`, flags);

/**
 * Párrafos (o ítems de lista) de la cabecera `entry` donde aparece el enlace al ID `orgId`: el
 * título si el enlace está ahí y los bloques de las notas que lo llevan.
 */
export const linkingParagraph = (entry, orgId) => {
  if (!entry || !orgId) return [];
  const re = linkRe(orgId);
  const out = [];
  // (4.37) Si el enlace está en el TÍTULO, la cabecera ya se pinta con el enlace resaltado: no se
  // repite su texto como párrafo. Solo salen los bloques de las notas que llevan el enlace.
  textBlocks(entry.notes).forEach((b) => re.test(b) && out.push(b));
  return out;
};

// ¿El enlace al ID está en el título de la cabecera? (4.37)
export const linkInTitle = (entry, orgId) =>
  !!entry && !!orgId && linkRe(orgId).test(entry.rawTitle || '');

// Trozos de un párrafo con el enlace al ID resaltado → [{ text, link }] (el enlace se enseña con
// su descripción, o con su ID si no la tiene)
export const splitLinkParts = (paragraph, orgId) => {
  const re = linkRe(orgId, 'gi');
  const text = String(paragraph || '');
  const parts = [];
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), link: false });
    parts.push({ text: m[1] || `id:${orgId}`, link: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), link: false });
  return parts;
};

// --- (4.36) Backlinks: filtros, etiquetas y orden por fecha ---

/**
 * Filtra los backlinks: `hideArchived`, `hideTasks` (como la vista por etiqueta), `inherited`
 * (las etiquetas heredadas cuentan al filtrar por `tags`) y `tags` (TODAS las elegidas).
 */
export const filterBacklinks = (
  entries,
  { hideArchived = false, hideTasks = false, inherited = true, tags = [] } = {}
) => {
  const want = (tags || []).filter(Boolean);
  return filterEntries(entries, { hideArchived, hideTasks }).filter((e) =>
    want.every((t) => hasTag(inherited ? e.tags : e.ownTags, t))
  );
};

// Etiquetas de los resultados → [{ tag, count }] (más usadas primero)
export const tagsOf = (entries, { inherited = true } = {}) => {
  const counts = new Map();
  (entries || []).forEach((e) =>
    (inherited ? e.tags : e.ownTags).forEach((t) => {
      const k = t.toLowerCase();
      const prev = counts.get(k);
      counts.set(k, { tag: prev ? prev.tag : t, count: (prev ? prev.count : 0) + 1 });
    })
  );
  return Array.from(counts.values()).sort(
    (a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'es', { sensitivity: 'base' })
  );
};

const STAMP_RE = /[<[](\d{4})-(\d{2})-(\d{2})(?:\s+[^\d\s>\]]+)?(?:\s+(\d{1,2}):(\d{2}))?[^>\]]*[>\]]/;
const stampMs = (text) => {
  const m = STAMP_RE.exec(String(text || ''));
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0).getTime();
};

/**
 * Fecha de una cabecera (ms) o null. Prioridad: CREATED → CLOSED → día del diario → SCHEDULED /
 * DEADLINE → primer timestamp <…> o […] del título o las notas.
 */
export const entryDate = (e) => {
  if (!e) return null;
  const created = stampMs(e.created);
  if (created !== null) return created;
  if (e.closed != null) return e.closed;
  if (e.diaryDay) {
    const [y, m, d] = e.diaryDay.split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
  }
  if (e.scheduled != null) return e.scheduled;
  if (e.deadline != null) return e.deadline;
  return stampMs(`${e.rawTitle || ''}\n${e.notes || ''}`);
};

/**
 * Ordena por fecha (`dir` 'desc' = la más reciente primero). Sin fecha, al final y en su orden.
 * → { dated: [entradas], undated: [entradas] }
 */
export const sortByDate = (entries, dir = 'desc') => {
  const dated = [];
  const undated = [];
  (entries || []).forEach((e, i) => {
    const t = entryDate(e);
    if (t === null) undated.push(e);
    else dated.push({ e, t, i });
  });
  const sign = dir === 'asc' ? 1 : -1;
  dated.sort((a, b) => sign * (a.t - b.t) || a.i - b.i);
  return { dated: dated.map((x) => x.e), undated };
};

// ¿Alguna entrada tiene fecha? (si no, «Por fecha» sale deshabilitado)
export const anyDated = (entries) => (entries || []).some((e) => entryDate(e) !== null);
