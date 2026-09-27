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

// ---------------------------------------------------------------------------
// ORG Mode para Eli (2.10): borrar adjuntos desde un encabezado (hoja) o desde el editor de GTD

const baseName = (p) => (p || '').split('/').pop();

// Adjuntos del propio encabezado (título y cuerpo), sin sus subencabezados
export const attachmentsOfHeader = (header, orgFilePath) => {
  const out = [];
  if (!header) return out;
  fileTargetsInText(headerText(header)).forEach((target) => {
    const path = resolveDropboxPath(orgFilePath, target);
    if (path && !out.some((x) => x.path === path)) out.push({ target, path, name: baseName(path) });
  });
  return out;
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Quita del texto los enlaces a `target` ([[file:x][desc]], [[file:x]], [[x]] o file:x suelto).
// Las líneas que se quedan vacías por ello desaparecen.
export const removeLinksToTarget = (text, target) => {
  if (!text || !target) return text || '';
  const t = escapeRe(target);
  const bracket = new RegExp(`\\[\\[(?:file:)?${t}(?:::[^\\]]*)?\\](?:\\[[^\\]]*\\])?\\]`, 'g');
  const bare = new RegExp(`(^|[\\s(])file:${t}(?=$|[\\s)\\]])`, 'g');
  return text
    .split('\n')
    .map((line) => {
      const next = line.replace(bracket, '').replace(bare, '$1');
      if (next === line) return line;
      return next.trim() === '' ? null : next.replace(/\s+$/, '');
    })
    .filter((line) => line !== null)
    .join('\n');
};

/**
 * Pide confirmación y borra el archivo adjunto de Dropbox o de la carpeta.
 * @returns {Promise<'deleted'|'missing'|false>} 'missing' si ya no existía (y se acepta quitar el enlace)
 */
export const confirmAndDeleteAttachment = async ({
  client,
  files,
  orgFilePath,
  path,
  excludedIds = new Set(),
}) => {
  if (!client || !client.deleteFile) {
    await showMessage('Borrar adjunto', 'Esta conexión no permite borrar archivos.');
    return false;
  }
  let exists = true;
  if (client.pathExists) {
    try {
      exists = await client.pathExists(path);
    } catch (e) {
      exists = true;
    }
  }
  if (!exists) {
    const ok = await askConfirm({
      title: 'El adjunto ya no existe',
      message: `${path}\n\nNo está en ${
        client.type === 'LocalFolder' ? 'la carpeta' : 'Dropbox'
      }. ¿Quitar el enlace?`,
      okLabel: 'Quitar el enlace',
      cancelLabel: 'Cancelar',
      focusCancel: true,
    });
    return ok ? 'missing' : false;
  }
  const others = otherReferences(files, path, orgFilePath, excludedIds);
  const ok = await askConfirm({
    title: '¿Borrar este adjunto?',
    message:
      `${path}\n\n` +
      (others.length
        ? `⚠ También está enlazado en: ${others.join(', ')}. Ese enlace dejará de funcionar.\n\n`
        : '') +
      (client.type === 'LocalFolder'
        ? 'Se borrará definitivamente de la carpeta del ordenador.'
        : 'Dropbox lo guarda un tiempo en «Archivos eliminados» por si necesitas recuperarlo.') +
      '\nTambién se quita su enlace del texto. Deshacer (↶) no recupera el archivo.',
    okLabel: 'Borrar adjunto',
    cancelLabel: 'Cancelar',
    focusCancel: true,
  });
  if (!ok) return false;
  try {
    await client.deleteFile(path);
    return 'deleted';
  } catch (e) {
    await showMessage(
      'No se pudo borrar el adjunto',
      `${path}\n\n${(e && e.message) || ''}`.trim()
    );
    return false;
  }
};

// Lista de adjuntos para elegir cuál borrar. Devuelve el elegido o null.
export const chooseAttachmentToDelete = (list) =>
  new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'eli-prompt__overlay';
    overlay.innerHTML = `
      <div class="eli-prompt__box" role="dialog" data-testid="eli-attachments-dialog">
        <div class="eli-prompt__title"><i class="fas fa-paperclip"></i> Adjuntos del encabezado</div>
        <ul class="eli-attachments"></ul>
        <div class="eli-prompt__buttons">
          <button type="button" class="btn eli-prompt__cancel">Cerrar</button>
        </div>
      </div>`;
    const ul = overlay.querySelector('.eli-attachments');
    const done = (v) => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(v);
    };
    list.forEach((a) => {
      const li = document.createElement('li');
      li.className = 'eli-attachments__item';
      const name = document.createElement('span');
      name.className = 'eli-attachments__name';
      name.textContent = a.name;
      name.title = a.path;
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn eli-attachments__delete';
      del.setAttribute('data-testid', 'eli-attachment-delete');
      del.innerHTML = '<i class="fas fa-trash"></i> Borrar';
      del.addEventListener('click', () => done(a));
      li.append(name, del);
      ul.appendChild(li);
    });
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        done(null);
      }
    };
    document.addEventListener('keydown', onKey, true);
    overlay.querySelector('.eli-prompt__cancel').addEventListener('click', () => done(null));
    document.body.appendChild(overlay);
  });
