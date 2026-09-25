// ORG Mode para Eli: al borrar un encabezado con adjuntos (enlaces a ficheros que no son .org),
// preguntar uno a uno si se borran también los ficheros.
import { fileLinkTarget, resolveDropboxPath } from './eli_media';
import { subheadersOfHeaderWithId } from './org_utils';
import { askConfirm, showMessage } from './eli_prompt';

const LINK_RE = /\[\[([^\]]+)\](?:\[[^\]]*\])?\]/g;
const BARE_FILE_RE = /(^|[\s(])(file:[^\s\])]+)/g;

// Destinos de los enlaces a ficheros en un texto (sin repetir, en orden)
export const fileTargetsInText = (text) => {
  const out = [];
  if (!text) return out;
  const add = (uri) => {
    const t = fileLinkTarget(uri);
    if (t && !out.includes(t)) out.push(t);
  };
  let m;
  LINK_RE.lastIndex = 0;
  while ((m = LINK_RE.exec(text))) add(m[1]);
  const withoutBracketLinks = text.replace(LINK_RE, ' ');
  BARE_FILE_RE.lastIndex = 0;
  while ((m = BARE_FILE_RE.exec(withoutBracketLinks))) add(m[2]);
  return out;
};

const headerText = (header) =>
  `${header.getIn(['titleLine', 'rawTitle']) || ''}\n${header.get('rawDescription') || ''}`;

const subtreeOf = (headers, headerId) => {
  if (!headers) return [];
  const header = headers.find((h) => h.get('id') === headerId);
  if (!header) return [];
  return [header, ...subheadersOfHeaderWithId(headers, headerId).toArray()];
};

// Rutas (absolutas en Dropbox/carpeta) de los adjuntos del encabezado y sus subencabezados
export const attachmentsOfSubtree = (headers, headerId, orgFilePath) => {
  const out = [];
  subtreeOf(headers, headerId).forEach((h) =>
    fileTargetsInText(headerText(h)).forEach((target) => {
      const path = resolveDropboxPath(orgFilePath, target);
      if (path && !out.some((x) => x.path === path)) out.push({ target, path });
    })
  );
  return out;
};

export const attachmentCount = (headers, headerId) => {
  const targets = new Set();
  subtreeOf(headers, headerId).forEach((h) =>
    fileTargetsInText(headerText(h)).forEach((t) => targets.add(t))
  );
  return targets.size;
};

/**
 * Otros sitios (ficheros cargados) que enlazan al mismo adjunto, sin contar el subárbol borrado.
 * @returns {string[]} rutas de los ficheros .org donde aparece
 */
export const otherReferences = (files, attachmentPath, sourcePath, excludedIds) => {
  const where = [];
  if (!files) return where;
  files.forEach((file, path) => {
    if (!path || !file || !file.get('headers')) return;
    const found = file.get('headers').some((h) => {
      if (path === sourcePath && excludedIds.has(h.get('id'))) return false;
      return fileTargetsInText(headerText(h)).some(
        (t) => resolveDropboxPath(path, t) === attachmentPath
      );
    });
    if (found) where.push(path);
  });
  return where;
};

let running = false;

/**
 * Pregunta, uno a uno, si se borran los adjuntos del subárbol. Solo borra los que se confirman.
 * @param headers encabezados del fichero ANTES de quitar el subárbol
 */
export const offerToDeleteAttachments = async ({
  headers,
  headerId,
  orgFilePath,
  client,
  files,
}) => {
  if (running || !client || !client.deleteFile || !orgFilePath) return [];
  const attachments = attachmentsOfSubtree(headers, headerId, orgFilePath);
  if (!attachments.length) return [];
  const excludedIds = new Set(subtreeOf(headers, headerId).map((h) => h.get('id')));
  const isLocal = client.type === 'LocalFolder';
  const deleted = [];
  running = true;
  try {
    for (let i = 0; i < attachments.length; i++) {
      const { path } = attachments[i];
      if (client.pathExists) {
        try {
          if (!(await client.pathExists(path))) continue;
        } catch (e) {
          // si no se puede comprobar, se pregunta igualmente
        }
      }
      const others = otherReferences(files, path, orgFilePath, excludedIds);
      const counter = attachments.length > 1 ? ` (${i + 1} de ${attachments.length})` : '';
      const message =
        `${path}\n\n` +
        (others.length
          ? `⚠ También está enlazado en: ${others.join(
              ', '
            )}. Si lo borras, ese enlace dejará de funcionar.\n\n`
          : '') +
        (isLocal
          ? 'Se borrará definitivamente de la carpeta del ordenador.'
          : 'Dropbox lo guarda un tiempo en «Archivos eliminados» por si necesitas recuperarlo.') +
        '\nDeshacer (↶) no recupera los adjuntos borrados.';
      const ok = await askConfirm({
        title: `¿Borrar también este adjunto?${counter}`,
        message,
        okLabel: 'Borrar adjunto',
        cancelLabel: 'Conservar',
        focusCancel: true,
      });
      if (!ok) continue;
      try {
        await client.deleteFile(path);
        deleted.push(path);
      } catch (e) {
        await showMessage(
          'No se pudo borrar el adjunto',
          `${path}\n\n${(e && e.message) || ''}`.trim()
        );
      }
    }
  } finally {
    running = false;
  }
  return deleted;
};
