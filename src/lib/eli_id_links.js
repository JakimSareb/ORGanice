// ORG Mode para Eli (4.24): enlaces por ID ([[id:…]]) a encabezados.
// - El enlace que se copia siempre es por ID (nunca por ruta): se pone :ID: si falta.
// - Antes de borrar un encabezado, se buscan en los ficheros CARGADOS los enlaces que apuntan a él
//   (o a sus subencabezados) para avisar y, si se quiere, dejarlos como texto.
import { List, fromJS } from 'immutable';
import { subheadersOfHeaderWithId } from './org_utils';
import { cleanHeadingText } from './eli_org_links';

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Valor de texto de una propiedad (lista de partes { type, contents })
const propertyText = (item) => {
  const v = item.get('value');
  if (v == null) return '';
  if (typeof v === 'string') return v;
  return v
    .map((part) =>
      part.get('type') === 'link'
        ? `[[${part.getIn(['contents', 'uri']) || ''}]${
            part.getIn(['contents', 'title']) ? `[${part.getIn(['contents', 'title'])}]` : ''
          }]`
        : part.get('contents') || ''
    )
    .join('');
};

// :ID: del encabezado (o null)
export const headerOrgId = (header) => {
  if (!header) return null;
  const item = (header.get('propertyListItems') || List()).find(
    (p) => (p.get('property') || '').toUpperCase() === 'ID'
  );
  const id = item ? propertyText(item).trim() : '';
  return id || null;
};

// Lista de propiedades con :ID: añadido (al principio, como org-id)
export const withOrgIdProperty = (items, orgId, newItemId) =>
  (items || List()).unshift(
    fromJS({ id: newItemId, property: 'ID', value: [{ type: 'text', contents: orgId }] })
  );

// Enlace por ID: [[id:X][Título limpio]]
export const idHeadingLink = (orgId, rawTitle) => {
  const desc = cleanHeadingText(rawTitle).replace(/[[\]]/g, '').replace(/\s+/g, ' ').trim();
  return desc ? `[[id:${orgId}][${desc}]]` : `[[id:${orgId}]]`;
};

// Los :ID: del encabezado y de sus subencabezados → Map id → título limpio
export const subtreeOrgIds = (headers, headerId) => {
  const out = new Map();
  if (!headers) return out;
  const header = headers.find((h) => h.get('id') === headerId);
  if (!header) return out;
  [header, ...subheadersOfHeaderWithId(headers, headerId).toArray()].forEach((h) => {
    const id = headerOrgId(h);
    if (id) out.set(id, cleanHeadingText(h.getIn(['titleLine', 'rawTitle'])));
  });
  return out;
};

const linkRe = (ids) =>
  new RegExp(`\\[\\[id:\\s*(${ids.map(escapeRe).join('|')})\\s*\\](?:\\[([^\\]]*)\\])?\\]`, 'gi');

// Título para enseñar: sin prioridad ni contadores y con los enlaces como su texto
const plainTitle = (rawTitle) =>
  cleanHeadingText(rawTitle).replace(/\[\[([^\]]*)\](?:\[([^\]]*)\])?\]/g, (m, l, d) => d || l);

const containsLink = (text, re) => {
  if (!text) return false;
  re.lastIndex = 0;
  return re.test(text);
};

/**
 * Encabezados de los ficheros cargados que enlazan a alguno de `ids` (Map o array).
 * `skip` = { path, headerIds: Set } para no contar el propio subárbol que se borra.
 * → [{ path, headerId, title, inTitle, inBody, props: [nombres] }]
 */
export const idLinkReferences = (files, ids, skip = {}) => {
  const list = Array.from(ids instanceof Map ? ids.keys() : ids || []);
  const out = [];
  if (!files || !list.length) return out;
  const re = linkRe(list);
  files.forEach((file, path) => {
    if (!path || !file || !file.get || !file.get('headers')) return;
    file.get('headers').forEach((h) => {
      if (path === skip.path && skip.headerIds && skip.headerIds.has(h.get('id'))) return;
      const inTitle = containsLink(h.getIn(['titleLine', 'rawTitle']), re);
      const inBody = containsLink(h.get('rawDescription'), re);
      const props = (h.get('propertyListItems') || List())
        .filter((p) => containsLink(propertyText(p), re))
        .map((p) => p.get('property'))
        .toArray();
      if (inTitle || inBody || props.length)
        out.push({
          path,
          headerId: h.get('id'),
          title: plainTitle(h.getIn(['titleLine', 'rawTitle'])) || '(sin título)',
          inTitle,
          inBody,
          props,
        });
    });
  });
  return out;
};

// Cambia en `text` los enlaces [[id:X][desc]] a `ids` por su texto (desc o, sin él, el título
// del encabezado enlazado)
export const idLinksToText = (text, ids) => {
  const map = ids instanceof Map ? ids : new Map(Array.from(ids || []).map((i) => [i, '']));
  if (!text || !map.size) return text || '';
  const titleOf = (id) => {
    for (const [k, v] of map) if (k.toLowerCase() === id.toLowerCase()) return v;
    return '';
  };
  return text.replace(
    linkRe(Array.from(map.keys())),
    (m, id, desc) => (desc && desc.trim()) || titleOf(id) || `id:${id}`
  );
};

// ¿La propiedad es solo un enlace a uno de `ids`? (p. ej. :PROYECTO: [[id:X][Nombre]])
export const isOnlyIdLink = (item, ids) => {
  const list = Array.from(ids instanceof Map ? ids.keys() : ids || []);
  if (!list.length) return false;
  const text = propertyText(item).trim();
  const re = new RegExp(`^${linkRe(list).source}$`, 'i');
  return re.test(text);
};

// Texto del aviso antes de borrar
export const referencesMessage = (refs) => {
  const byFile = new Map();
  refs.forEach((r) => {
    if (!byFile.has(r.path)) byFile.set(r.path, []);
    byFile.get(r.path).push(r);
  });
  const lines = [];
  byFile.forEach((list, path) => {
    lines.push(`${path.split('/').pop()}:`);
    list.slice(0, 8).forEach((r) => lines.push(`  • ${r.title}`));
    if (list.length > 8) lines.push(`  • … y ${list.length - 8} más`);
  });
  return (
    `${
      refs.length === 1 ? 'Hay 1 enlace' : `Hay ${refs.length} encabezados con enlaces`
    } [[id:…]] ` +
    `a lo que vas a borrar:\n\n${lines.join('\n')}\n\n` +
    'Solo se han mirado los ficheros cargados ahora; otros ficheros podrían tener más.'
  );
};
