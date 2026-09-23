// ORG Mode para Eli: archivar un subárbol como `org-archive-subtree` (C-c C-x C-s) de Emacs.
//
// - Destino: propiedad ARCHIVE (heredada) > línea "#+ARCHIVE:" > "%s_archive::" (por defecto).
//   Formato "fichero::encabezado"; %s = nombre del fichero actual; fichero vacío = el mismo.
// - Se añaden las propiedades ARCHIVE_TIME, ARCHIVE_FILE, ARCHIVE_OLPATH, ARCHIVE_CATEGORY,
//   ARCHIVE_TODO y ARCHIVE_ITAGS, como hace Emacs.
// - Sin encabezado de destino, el subárbol pasa a nivel 1; con encabezado, cuelga de él.
// - Si el fichero de origen está cifrado (.gpg/.asc), el de archivo también lo estará.

import { fromJS, List } from 'immutable';
import { format } from 'date-fns';
import { exportOrg } from './export_org';
import { subheadersOfHeaderWithId } from './org_utils';
import generateId from './id_generator';

const DEFAULT_LOCATION = '%s_archive::';

const basename = (p) => p.slice(p.lastIndexOf('/') + 1);
const dirname = (p) => p.slice(0, p.lastIndexOf('/'));

const normalize = (p) => {
  const out = [];
  p.split('/').forEach((s) => {
    if (!s || s === '.') return;
    if (s === '..') out.pop();
    else out.push(s);
  });
  return '/' + out.join('/');
};

const propertyValue = (header, name) => {
  const item = (header.get('propertyListItems') || List()).find(
    (p) => p.get('property').toUpperCase() === name.toUpperCase()
  );
  if (!item || !item.get('value')) return null;
  return item
    .get('value')
    .map((part) => part.get('contents') || '')
    .join('')
    .trim();
};

// Ancestros de un encabezado (del más cercano al más lejano)
const ancestors = (headers, index) => {
  const result = [];
  let level = headers.getIn([index, 'nestingLevel']);
  for (let i = index - 1; i >= 0 && level > 1; i--) {
    const h = headers.get(i);
    if (h.get('nestingLevel') < level) {
      result.push(h);
      level = h.get('nestingLevel');
    }
  }
  return result;
};

export const archiveLocationFor = (file, headers, index) => {
  const own = [headers.get(index), ...ancestors(headers, index)];
  for (const h of own) {
    const v = propertyValue(h, 'ARCHIVE');
    if (v) return v;
  }
  const lines = (file.get('linesBeforeHeadings') || List()).toJS
    ? file.get('linesBeforeHeadings').toJS()
    : file.get('linesBeforeHeadings') || [];
  const configLines = (file.get('fileConfigLines') || List()).toJS
    ? file.get('fileConfigLines').toJS()
    : [];
  const line = [...configLines, ...lines].find((l) => /^#\+ARCHIVE:/i.test(l));
  if (line) return line.replace(/^#\+ARCHIVE:\s*/i, '').trim();
  return DEFAULT_LOCATION;
};

const ENCRYPTED = /\.(gpg|asc)$/i;

// Resuelve "fichero::encabezado" a { path, heading }
export const resolveArchiveLocation = (location, sourcePath) => {
  const [rawFile, ...rest] = location.split('::');
  const heading = rest.join('::').trim();
  const encrypted = ENCRYPTED.test(sourcePath);
  const name = basename(sourcePath);
  let filePart = (rawFile || '').trim();
  let path;
  if (!filePart) {
    path = sourcePath;
  } else {
    const plainName = encrypted ? name.replace(ENCRYPTED, '') : name;
    filePart = filePart.replace(/%s/g, plainName);
    path = filePart.startsWith('/')
      ? normalize(filePart)
      : normalize(`${dirname(sourcePath)}/${filePart}`);
    // Un origen cifrado nunca se archiva en claro
    if (encrypted && !ENCRYPTED.test(path)) path += sourcePath.match(ENCRYPTED)[0];
  }
  return { path, heading };
};

const headingLevel = (heading) => {
  const m = /^(\*+)\s/.exec(heading);
  return m ? m[1].length : 0;
};

/**
 * Texto Org del subárbol a archivar, con propiedades de archivo y niveles ajustados.
 */
export const buildArchivedSubtree = ({
  file,
  headers,
  headerId,
  sourcePath,
  targetLevel,
  now = new Date(),
  dontIndent = false,
}) => {
  const index = headers.findIndex((h) => h.get('id') === headerId);
  const root = headers.get(index);
  const subtree = List([root]).concat(subheadersOfHeaderWithId(headers, headerId));
  const shift = targetLevel - root.get('nestingLevel');

  const olpath = ancestors(headers, index)
    .reverse()
    .map((h) => h.getIn(['titleLine', 'rawTitle']).trim())
    .join('/');
  const inheritedTags = [];
  ancestors(headers, index).forEach((h) =>
    (h.getIn(['titleLine', 'tags']) || List()).forEach((t) => {
      if (t && !inheritedTags.includes(t)) inheritedTags.push(t);
    })
  );
  const categoryLine = (file.get('fileConfigLines') || List()).find((l) =>
    /^#\+CATEGORY:/i.test(l)
  );
  const category = categoryLine
    ? categoryLine.replace(/^#\+CATEGORY:\s*/i, '').trim()
    : basename(sourcePath).replace(/\.org(_archive)?(\.gpg|\.asc)?$/i, '');
  const todo = root.getIn(['titleLine', 'todoKeyword']);

  const props = [
    ['ARCHIVE_TIME', format(now, 'yyyy-MM-dd eee HH:mm')],
    ['ARCHIVE_FILE', sourcePath],
    olpath ? ['ARCHIVE_OLPATH', olpath] : null,
    ['ARCHIVE_CATEGORY', category],
    todo ? ['ARCHIVE_TODO', todo] : null,
    inheritedTags.length ? ['ARCHIVE_ITAGS', inheritedTags.join(' ')] : null,
  ].filter(Boolean);

  const newRoot = root.update('propertyListItems', (items) =>
    (items || List())
      .filter((p) => !props.some(([name]) => name === p.get('property')))
      .concat(
        fromJS(
          props.map(([property, contents]) => ({
            property,
            value: [{ type: 'text', contents }],
            id: generateId(),
          }))
        )
      )
  );

  const shifted = subtree
    .set(0, newRoot)
    .map((h) => h.set('nestingLevel', Math.max(1, h.get('nestingLevel') + shift)));
  return exportOrg({ headers: shifted, linesBeforeHeadings: List(), dontIndent });
};

export const newArchiveFileText = (sourcePath) =>
  `#    -*- mode: org -*-\n\n\nArchived entries from file ${sourcePath}\n\n\n`;

/**
 * Inserta el subárbol en el texto del fichero de archivo: al final, o al final del
 * encabezado de destino (que se crea si no existe).
 */
export const insertIntoArchiveText = (archiveText, subtreeText, heading) => {
  let text = archiveText || '';
  if (text && !text.endsWith('\n')) text += '\n';
  if (!heading) return text + subtreeText;
  const lines = text.split('\n');
  const level = headingLevel(heading) || 1;
  const headingTitle = heading.replace(/^\*+\s*/, '').trim();
  let start = lines.findIndex((l) => {
    const m = /^(\*+)\s+(.*?)\s*$/.exec(l);
    return m && m[1].length === level && m[2].replace(/\s+:[\w@:]+:$/, '') === headingTitle;
  });
  if (start < 0) {
    return `${text}${'*'.repeat(level)} ${headingTitle}\n${subtreeText}`;
  }
  let end = start + 1;
  while (end < lines.length) {
    const m = /^(\*+)\s/.exec(lines[end]);
    if (m && m[1].length <= level) break;
    end++;
  }
  // Quitar líneas vacías finales del bloque para insertar justo después del contenido
  let insertAt = end;
  while (insertAt > start + 1 && lines[insertAt - 1] === '') insertAt--;
  const before = lines.slice(0, insertAt).join('\n');
  const after = lines.slice(insertAt).join('\n');
  return `${before}\n${subtreeText}${
    after ? (after.startsWith('\n') ? after.slice(1) : after) : ''
  }`;
};

export const targetLevelFor = (heading) => (heading ? (headingLevel(heading) || 1) + 1 : 1);
