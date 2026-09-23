// ORG Mode para Eli: contextos GTD.
//
// Los contextos se definen en la cabecera de cada fichero Org con la sintaxis
// estándar de Org:   #+TAGS: @casa(c) @oficina(o) { @llamadas @recados } proyecto
// Se consideran contextos las etiquetas que empiezan por "@". Si en #+TAGS: no hay ninguna con
// "@", se consideran contextos todas las declaradas. "casa" y "@casa" son el mismo contexto.

import { Set as ISet, Map as IMap } from 'immutable';

const TAGS_LINE = /^#\+TAGS:\s*(.*)$/i;

// Todas las etiquetas declaradas en #+TAGS: ("@casa(c)" -> "@casa"; sin { } [ ] \n ni grupos)
export const declaredTagsFromConfigLines = (configLines) => {
  const tags = [];
  (configLines || []).forEach((line) => {
    const match = TAGS_LINE.exec(String(line).trim());
    if (!match) return;
    match[1].split(/\s+/).forEach((token) => {
      const tag = token.replace(/\(.*\)$/, '').replace(/^[{[]|[}\]]$/g, '').trim();
      if (!tag || /^[{}[\]:]+$/.test(tag) || tag === '\\n' || tags.includes(tag)) return;
      tags.push(tag);
    });
  });
  return tags;
};

export const contextsFromConfigLines = (configLines) => {
  const declared = declaredTagsFromConfigLines(configLines);
  const withAt = declared.filter((t) => t.startsWith('@') && t.length > 1);
  return withAt.length ? withAt : declared;
};

// "casa" y "@casa" son el mismo contexto
export const contextKey = (tag) => String(tag || '').replace(/^@/, '').toLowerCase();
export const tagsHaveContext = (tags, context) =>
  !!tags && tags.some((t) => contextKey(t) === contextKey(context));

// Etiquetas para el editor: primero las declaradas en #+TAGS: (en su orden), luego el resto
export const allTagsForEditor = (headers, configLines) => {
  const declared = declaredTagsFromConfigLines(configLines);
  const used = (headers || [])
    .flatMap((h) => h.getIn(['titleLine', 'tags']) || [])
    .filter((t) => !!t && !declared.includes(t))
    .toSet()
    .sort()
    .toArray();
  return declared.concat(used);
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

// Filtra las cabeceras de un fichero dejando las que tienen TODOS los contextos
// seleccionados (Y). Sin selección, no filtra.
export const filterHeadersByContexts = (headers, selectedContexts) => {
  if (!selectedContexts || selectedContexts.size === 0 || selectedContexts.length === 0) {
    return headers;
  }
  const selected = ISet(selectedContexts);
  const tagsById = inheritedTagsById(headers);
  return headers.filter((h) => {
    const tags = tagsById.get(h.get('id'));
    return !!tags && selected.every((c) => tagsHaveContext(tags, c));
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

// ORG Mode para Eli: estados de tarea por los que se puede filtrar
export const TODO_FILTER_KEYWORDS = ['TODO', 'NEXT', 'WAITING', 'MAYBE', 'PROJECT'];

export const filterFilesByTodo = (files, selectedTodos) => {
  if (!selectedTodos || selectedTodos.size === 0) return files;
  return files.map((file) =>
    file.get('headers')
      ? file.set(
          'headers',
          file
            .get('headers')
            .filter((h) => selectedTodos.includes(h.getIn(['titleLine', 'todoKeyword'])))
        )
      : file
  );
};

// Contextos y estados que tienen sentido mostrar con los filtros actuales (filtros facetados):
//  - contextos: los declarados en #+TAGS: (con @) presentes en encabezados que cumplen
//    el estado y TODOS los contextos ya seleccionados;
//  - estados: los de TODO_FILTER_KEYWORDS presentes en encabezados que cumplen los contextos.
// Los seleccionados se incluyen siempre, para poder quitarlos.
export const availableFacets = (files, selectedContexts, selectedTodos) => {
  const declared = ISet(collectContexts(files));
  const selC = ISet(selectedContexts || []);
  const selT = ISet(selectedTodos || []);
  let contexts = ISet();
  let todos = ISet();
  if (files) {
    files.forEach((file) => {
      const headers = file.get('headers');
      if (!headers) return;
      const tagsById = inheritedTagsById(headers);
      headers.forEach((h) => {
        const own = tagsById.get(h.get('id')) || ISet();
        const tags = declared.filter((d) => tagsHaveContext(own, d));
        const kw = h.getIn(['titleLine', 'todoKeyword']);
        const matchesContexts = selC.every((c) => tagsHaveContext(tags, c));
        const matchesTodo = selT.size === 0 || selT.has(kw);
        if (matchesContexts && kw && TODO_FILTER_KEYWORDS.includes(kw)) todos = todos.add(kw);
        if (matchesContexts && matchesTodo) contexts = contexts.union(tags);
      });
    });
  }
  return {
    contexts: contexts
      .union(selC)
      .toArray()
      .sort((a, b) => a.localeCompare(b)),
    todos: TODO_FILTER_KEYWORDS.filter((k) => todos.has(k) || selT.has(k)),
  };
};
