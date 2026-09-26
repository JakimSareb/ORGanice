// ORG Mode para Eli: valores por defecto configurables en Ajustes (como la configuración global
// de Emacs): estados de las tareas (activos | terminados) para ficheros sin línea #+TODO,
// etiquetas (contextos) por defecto y cabecera de los ficheros nuevos.
import { fromJS } from 'immutable';

export const DEFAULT_TODO_LINE =
  '#+TODO: NEXT(n) TODO(t) MAYBE(m) WAITING(w) PROJECT(p) | DONE(d) CANCELLED(c) <(<) >(>)';
export const DEFAULT_TAGS_LINE =
  '#+TAGS: @ordenador @casa @llamadas @inbox @videos @leer @recados @anywhere';
export const DEFAULT_ENERGY = ['Low', 'Medium', 'High', 'QuickWin'];
export const DEFAULT_EFFORT = ['0:10', '0:30', '1:00', '2:00', '3:00', '4:00'];
export const ENERGY_PROPERTY = 'Energy';
export const EFFORT_PROPERTY = 'Effort';

// "#+TODO: A(a) B | C" (o solo "A B | C") → { keywords, completedKeywords }; null si no vale
export const parseTodoLine = (line) => {
  const text = String(line || '')
    .trim()
    .replace(/^#\+(SEQ_|TYP_)?TODO:\s*/i, '');
  const tokens = text.split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;
  const clean = (k) => k.replace(/\(.[!@]?(\/[!@])?\)$/, '');
  const pipe = tokens.indexOf('|');
  const active = (pipe >= 0 ? tokens.slice(0, pipe) : tokens.slice(0, -1)).map(clean);
  const done = (pipe >= 0 ? tokens.slice(pipe + 1) : tokens.slice(-1)).map(clean);
  const keywords = [...active, ...done].filter(Boolean);
  if (!keywords.length || !done.length) return null;
  return { keywords, completedKeywords: done.filter(Boolean) };
};

// Etiquetas de una línea "#+TAGS: @a(a) b { c d }" (o sin el prefijo)
export const parseTagsLine = (line) =>
  String(line || '')
    .trim()
    .replace(/^#\+TAGS:\s*/i, '')
    .split(/\s+/)
    .map((t) => t.replace(/\(.*\)$/, '').replace(/^[{[]|[}\]]$/g, ''))
    .filter((t) => t && !/^[{}[\]:]+$/.test(t) && t !== '\\n');

const stored = (key) => {
  try {
    return window.localStorage.getItem(key);
  } catch (e) {
    return null;
  }
};

let todo = parseTodoLine(stored('eliTodoKeywordsLine')) || parseTodoLine(DEFAULT_TODO_LINE);
let tagsLine = stored('eliDefaultTagsLine') || DEFAULT_TAGS_LINE;

export const setDefaultTodoLine = (line) => {
  todo = parseTodoLine(line) || parseTodoLine(DEFAULT_TODO_LINE);
};
export const setDefaultTagsLine = (line) => {
  tagsLine = line && parseTagsLine(line).length ? line : DEFAULT_TAGS_LINE;
};

export const defaultKeywords = () => todo.keywords.slice();
export const defaultCompletedKeywords = () => todo.completedKeywords.slice();
export const defaultTodoKeywordSets = () =>
  fromJS([
    {
      keywords: todo.keywords,
      completedKeywords: todo.completedKeywords,
      default: true,
    },
  ]);
export const defaultTagsLine = () =>
  /^#\+TAGS:/i.test(tagsLine.trim()) ? tagsLine.trim() : `#+TAGS: ${tagsLine.trim()}`;
export const defaultTags = () => parseTagsLine(tagsLine);

// Líneas que se añaden a la cabecera de un fichero nuevo
export const newFileHeaderLines = () => [
  '#+FILETAGS:',
  defaultTagsLine(),
  `#+PROPERTY: ${ENERGY_PROPERTY}_ALL ${DEFAULT_ENERGY.join(' ')}`,
  `#+PROPERTY: ${EFFORT_PROPERTY}_ALL ${DEFAULT_EFFORT.join(' ')}`,
  '#+COLUMNS: %40ITEM %10Effort %10Energy %CLOCKSUM',
];

// Valores permitidos de una propiedad según "#+PROPERTY: Nombre_ALL a b c" de los ficheros
export const allowedValuesFromConfigLines = (configLines, property, fallback) => {
  const re = new RegExp(`^#\\+PROPERTY:\\s*${property}_ALL\\s+(.+)$`, 'i');
  const values = [];
  (configLines || []).forEach((line) => {
    const m = re.exec(String(line).trim());
    if (m) m[1].split(/\s+/).forEach((v) => v && !values.includes(v) && values.push(v));
  });
  return values.length ? values : fallback.slice();
};
