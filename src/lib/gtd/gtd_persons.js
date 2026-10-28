// ORG Mode para Eli (4.48): Personas. Modelo puro.
//   - Contactos en un único fichero `personas.org` (Ajustes › GTD › Ficheros; por defecto junto al
//     de tareas): una cabecera de nivel 1 por persona con :ID: y, si se quiere, :EMAIL:, :PHONE:,
//     :ALIAS:, :EMPRESA:, :BIRTHDAY: (formato org-contacts: Emacs lo lee tal cual; con org-roam
//     cada persona es un nodo).
//   - Cualquier cabecera (tarea, acta de reunión, nota) se enlaza con una o varias personas con
//     «:PERSONA: [[id:A][Ana]] [[id:B][Luis]]» (mismo patrón que :PROYECTO:, solo por ID).
//   - Un solo método: NO hay etiquetas de persona.
import { displayTitle, propertyValue, parsePersonLinks } from './gtd_model';

export const PERSON_PROPERTY = 'PERSONA';
export const PERSONAS_NAME = 'personas.org';
export const AGENDAS_NAME = 'agendas.org';
export const PERSONAS_TEMPLATE = '#+TITLE: Personas\n';

// Fichero con ese nombre en la carpeta de `path` (o en la raíz)
export const pathNear = (path, name) => {
  const i = (path || '').lastIndexOf('/');
  return (i >= 0 ? path.slice(0, i + 1) : '/') + name;
};
export const isPersonasPath = (p) => /(^|\/)personas\.org$/i.test(p || '');
export const isAgendasPath = (p) => /(^|\/)agendas\.org$/i.test(p || '');

// Enlaces [[id:X][Nombre]] (o [[id:X]]) de un valor de :PERSONA: → [{ id, title }] (en gtd_model)
export { parsePersonLinks };
export const personLink = (orgId, name) =>
  `[[id:${orgId}][${String(name || '').replace(/[[\]]/g, '')}]]`;
// Valor de :PERSONA: para una lista [{ id, title }] ('' = ninguna: se quita la propiedad)
export const personLinksValue = (list) =>
  (list || [])
    .filter((x) => x && x.id)
    .map((x) => personLink(x.id, x.title))
    .join(' ');

// Ids de las personas de una cabecera (Immutable)
export const personsOf = (header) =>
  header ? parsePersonLinks(propertyValue(header, PERSON_PROPERTY)).map((x) => x.id) : [];

// Comparar nombres sin mayúsculas ni acentos
export const plainName = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const splitAliases = (value) => {
  const v = String(value || '').trim();
  if (!v) return [];
  const parts = v.includes(',') ? v.split(',') : v.split(/\s+/);
  return Array.from(new Set([v, ...parts.map((x) => x.trim())].filter(Boolean)));
};

// Contactos de personas.org (fichero Immutable) → [{ name, orgId, headerId, path, email, phone,
// aliases, empresa, birthday }] (solo las cabeceras de nivel 1)
export const parseContacts = (file, path) => {
  const headers = file && file.get && file.get('headers');
  if (!headers) return [];
  const out = [];
  headers.forEach((h) => {
    if ((h.get('nestingLevel') || 1) !== 1) return;
    const name = displayTitle(h.getIn(['titleLine', 'rawTitle']) || '');
    if (!name) return;
    out.push({
      name,
      orgId: propertyValue(h, 'ID'),
      headerId: h.get('id'),
      path,
      email: propertyValue(h, 'EMAIL'),
      phone: propertyValue(h, 'PHONE'),
      empresa: propertyValue(h, 'EMPRESA'),
      birthday: propertyValue(h, 'BIRTHDAY'),
      aliases: splitAliases(propertyValue(h, 'ALIAS')),
    });
  });
  return out.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
};

// Contacto cuyo nombre o alias es `text` (sin mayúsculas ni acentos)
export const contactNamed = (contacts, text) => {
  const q = plainName(text);
  if (!q) return null;
  return (
    (contacts || []).find(
      (c) => plainName(c.name) === q || (c.aliases || []).some((a) => plainName(a) === q)
    ) || null
  );
};
export const contactById = (contacts, id) =>
  (contacts || []).find((c) => c.orgId && id && c.orgId.toLowerCase() === id.toLowerCase()) || null;

// Nombre que se ve de una persona enlazada (el del contacto; si no, el del enlace)
export const personName = (contacts, link) => {
  const c = contactById(contacts, link.id);
  return (c && c.name) || link.title || '?';
};

// Personas de las tareas (para el filtro de la barra): [{ id, name }] por nombre
export const personsInTasks = (tasks, contacts = []) => {
  const seen = new Map();
  (tasks || []).forEach((t) =>
    (t.personLinks || []).forEach((l) => {
      const k = l.id.toLowerCase();
      if (!seen.has(k)) seen.set(k, { id: l.id, name: personName(contacts, l) });
    })
  );
  return Array.from(seen.values()).sort((a, b) =>
    a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
  );
};

export const hasPerson = (task, id) =>
  !!id && (task.persons || []).some((p) => p.toLowerCase() === String(id).toLowerCase());

// Grupos de la ficha según el estado de la tarea
const KEYWORD_GROUPS = [
  { id: 'waiting', label: 'Waiting', keywords: ['WAITING'] },
  { id: 'next', label: 'Next', keywords: ['NEXT'] },
  { id: 'todo', label: 'Todo', keywords: ['TODO'] },
  { id: 'someday', label: 'Someday', keywords: ['MAYBE', 'SOMEDAY'] },
  { id: 'project', label: 'Proyectos', keywords: ['PROJECT'] },
  { id: 'done', label: 'Hechas', keywords: ['DONE', 'CANCELLED'] },
];
const groupOfKeyword = (k) => {
  const g = KEYWORD_GROUPS.find((x) => x.keywords.includes(String(k).toUpperCase()));
  return g ? g.id : 'other';
};

/**
 * Ficha de una persona a partir del índice de cabeceras (lib/eli_heading_index: entradas con
 * `persons`, `keyword`, `linkText`…) y de los enlaces entrantes (`mentions`).
 * → { tasks: [{ id, label, items }], notes: [entradas], mentions: [entradas] }
 */
export const personCard = (index, orgId, mentions = []) => {
  const empty = { tasks: [], notes: [], mentions: [] };
  if (!orgId) return empty;
  const mine = (index || []).filter(
    (e) =>
      e.orgId !== orgId && (e.persons || []).some((p) => p.toLowerCase() === orgId.toLowerCase())
  );
  const withState = mine.filter((e) => !!e.keyword);
  const tasks = [...KEYWORD_GROUPS, { id: 'other', label: 'Otras', keywords: [] }]
    .map((g) => ({
      id: g.id,
      label: g.label,
      items: withState.filter((e) => groupOfKeyword(e.keyword) === g.id),
    }))
    .filter((g) => g.items.length);
  const notes = mine.filter((e) => !e.keyword);
  const inCard = new Set(mine.map((e) => `${e.path}::${e.headerId}`));
  return {
    tasks,
    notes,
    mentions: (mentions || []).filter((e) => !inCard.has(`${e.path}::${e.headerId}`)),
  };
};

// Ids de :PERSONA: en un texto de propiedad ya aplanado (índice de cabeceras: [[id:X]])
export const personIdsInText = (text) => parsePersonLinks(text).map((x) => x.id);
