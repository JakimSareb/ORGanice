// ORG Mode para Eli: contextos GTD.
//
// Los contextos se definen en la cabecera de cada fichero Org con la sintaxis
// estándar de Org:   #+TAGS: @casa(c) @oficina(o) { @llamadas @recados } proyecto
// Solo las etiquetas que empiezan por "@" se consideran contextos.

import { Set as ISet, Map as IMap } from 'immutable';

const TAGS_LINE = /^#\+TAGS:\s*(.*)$/i;

// "@casa(c)" -> "@casa"; descarta separadores de grupos { } [ ] \n
export const contextsFromConfigLines = (configLines) => {
  const contexts = [];
  (configLines || []).forEach((line) => {
    const match = TAGS_LINE.exec(String(line).trim());
    if (!match) return;
    match[1].split(/\s+/).forEach((token) => {
      const tag = token.replace(/\(.*\)$/, '').trim();
      if (tag.startsWith('@') && tag.length > 1 && !contexts.includes(tag)) contexts.push(tag);
    });
  });
  return contexts;
};

// Contextos de todos los ficheros cargados (Immutable Map path -> file)
export const collectContexts = (files) => {
  let all = ISet();
  if (!files) return [];
  files.forEach((file) => {
    const lines = file.get('fileConfigLines');
    all = all.union(contextsFromConfigLines(lines ? lines.toJS() : []));
  });
  return all.toArray().sort((a, b) => a.localeCompare(b));
};

// Map headerId -> Set de etiquetas propias + heredadas de los ancestros
// (la herencia de etiquetas está activa por defecto en Org Mode).
export const inheritedTagsById = (headers) => {
  let result = IMap();
  const stack = []; // [{level, tags}]
  headers.forEach((header) => {
    const level = header.get('nestingLevel');
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    const parentTags = stack.length ? stack[stack.length - 1].tags : ISet();
    const own = ISet(header.getIn(['titleLine', 'tags']) || []);
    const tags = parentTags.union(own);
    stack.push({ level, tags });
    result = result.set(header.get('id'), tags);
  });
  return result;
};

// Filtra las cabeceras de un fichero dejando las que tienen alguno de los
// contextos seleccionados (OR). Sin selección, no filtra.
export const filterHeadersByContexts = (headers, selectedContexts) => {
  if (!selectedContexts || selectedContexts.size === 0 || selectedContexts.length === 0) {
    return headers;
  }
  const selected = ISet(selectedContexts);
  const tagsById = inheritedTagsById(headers);
  return headers.filter((h) => {
    const tags = tagsById.get(h.get('id'));
    return tags && tags.some((t) => selected.has(t));
  });
};

export const filterFilesByContexts = (files, selectedContexts) => {
  if (!selectedContexts || selectedContexts.size === 0) return files;
  return files.map((file) =>
    file.get('headers')
      ? file.set('headers', filterHeadersByContexts(file.get('headers'), selectedContexts))
      : file
  );
};
