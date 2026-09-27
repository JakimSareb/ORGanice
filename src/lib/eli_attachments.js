// ORG Mode para Eli: al borrar un encabezado con adjuntos (enlaces a ficheros que no son .org),
// preguntar uno a uno si se borran también los ficheros.
import { fileLinkTarget, resolveDropboxPath } from './eli_media';
import { subheadersOfHeaderWithId, STATIC_FILE_PREFIX } from './org_utils';
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

const HEADING_RE = /^\*+\s/;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Quita del texto los enlaces a `target` ([[file:x][desc]], [[file:x]], [[x]] o file:x suelto).
// Las líneas que se quedan vacías por ello desaparecen.
export const removeLinksToTarget = (text, target, { skipHeadings = false } = {}) => {
  if (!text || !target) return text || '';
  const t = escapeRe(target);
  const bracket = new RegExp(`\\[\\[(?:file:)?${t}(?:::[^\\]]*)?\\](?:\\[[^\\]]*\\])?\\]`, 'g');
  const bare = new RegExp(`(^|[\\s(])file:${t}(?=$|[\\s)\\]])`, 'g');
  return text
    .split('\n')
    .map((line) => {
      if (skipHeadings && HEADING_RE.test(line)) return line;
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

// ---------------------------------------------------------------------------
// ORG Mode para Eli (2.11): indicador de adjuntos y revisión de los adjuntos de tareas
// terminadas, canceladas o archivadas

// Número de archivos adjuntos del propio encabezado (título y cuerpo)
export const attachmentCountOfHeader = (header) =>
  header ? fileTargetsInText(headerText(header)).length : 0;

// Título legible: [[destino][texto]] → texto, [[destino]] → destino
export const plainTitle = (raw) =>
  (raw || '')
    .replace(/\[\[([^\]]+)\]\[([^\]]*)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

export const isArchiveFile = (path) => /\.org_archive$/i.test(path || '');

const TITLE_RE = /^(\*+)\s+(.*)$/;
const splitKeyword = (title, keywords) => {
  const m = title.match(/^([A-Z][A-Z_-]+)(?:\s+|$)(.*)$/);
  if (m && (!keywords || keywords.includes(m[1]))) return { keyword: m[1], rest: m[2] };
  return { keyword: null, rest: title };
};
const stripTags = (t) => t.replace(/\s+:[^\s:]+(?::[^\s:]+)*:\s*$/, '');

/**
 * Encabezados de un fichero de archivo (texto sin cargar en la app) que tienen adjuntos.
 * @returns [{ title, keyword, line, targets: [target] }]
 */
export const entriesWithAttachmentsInText = (text) => {
  const out = [];
  if (!text) return out;
  const lines = text.split('\n');
  let current = null;
  const flush = () => {
    if (!current) return;
    const targets = fileTargetsInText(current.body.join('\n'));
    if (targets.length) out.push({ ...current.info, targets });
  };
  lines.forEach((line, i) => {
    const m = line.match(TITLE_RE);
    if (m) {
      flush();
      const { keyword, rest } = splitKeyword(m[2]);
      current = { info: { title: plainTitle(stripTags(rest)), keyword, line: i }, body: [line] };
    } else if (current) {
      current.body.push(line);
    }
  });
  flush();
  return out;
};

const kindOfKeyword = (keyword) =>
  keyword === 'CANCELLED' || keyword === 'CANCELED' ? 'cancelled' : 'done';

/**
 * Tareas terminadas o canceladas (ficheros cargados) y encabezados archivados (ficheros
 * *_archive, cargados o no) que tienen archivos adjuntos.
 * @param files     state.org.present.get('files')
 * @param isDone    (path, keyword) => boolean
 * @param archives  [{ path, text }] ficheros de archivo sin cargar
 * @param existing  Set de rutas en minúsculas que existen (o null si no se sabe)
 * @returns grupos [{ key, title, kind, keyword, orgPath, headerId, attachments: [{target, path, name, missing}] }]
 */
export const findFinishedAttachments = ({ files, isDone, archives = [], existing = null }) => {
  const groups = [];
  const toAttachments = (orgPath, targets) => {
    const list = [];
    targets.forEach((target) => {
      const path = resolveDropboxPath(orgPath, target);
      if (!path || list.some((a) => a.path === path)) return;
      list.push({
        target,
        path,
        name: baseName(path),
        missing: existing ? !existing.has(path.toLowerCase()) : false,
      });
    });
    return list;
  };
  if (files) {
    files.forEach((file, orgPath) => {
      if (!orgPath || !file || !file.get('headers') || orgPath.startsWith(STATIC_FILE_PREFIX))
        return;
      const archived = isArchiveFile(orgPath);
      file.get('headers').forEach((h) => {
        const keyword = h.getIn(['titleLine', 'todoKeyword']) || null;
        if (!archived && !(keyword && isDone(orgPath, keyword))) return;
        const targets = fileTargetsInText(headerText(h));
        if (!targets.length) return;
        const attachments = toAttachments(orgPath, targets);
        if (!attachments.length) return;
        groups.push({
          key: `${orgPath}::${h.get('id')}`,
          title: plainTitle(h.getIn(['titleLine', 'rawTitle'])) || '(sin título)',
          kind: archived ? 'archived' : kindOfKeyword(keyword),
          keyword,
          orgPath,
          headerId: h.get('id'),
          attachments,
        });
      });
    });
  }
  archives.forEach(({ path: orgPath, text }) => {
    entriesWithAttachmentsInText(text).forEach((e) => {
      const attachments = toAttachments(orgPath, e.targets);
      if (!attachments.length) return;
      groups.push({
        key: `${orgPath}::L${e.line}`,
        title: e.title || '(sin título)',
        kind: 'archived',
        keyword: e.keyword,
        orgPath,
        headerId: null,
        attachments,
      });
    });
  });
  return groups;
};

// ¿Lo enlaza algún encabezado cargado que no esté en `candidateKeys` («ruta::id»)?
export const referencedOutside = (files, attachmentPath, candidateKeys) => {
  let found = false;
  if (!files) return false;
  files.forEach((file, path) => {
    if (found || !path || !file || !file.get('headers')) return;
    found = file
      .get('headers')
      .some(
        (h) =>
          !candidateKeys.has(`${path}::${h.get('id')}`) &&
          fileTargetsInText(headerText(h)).some(
            (t) => resolveDropboxPath(path, t) === attachmentPath
          )
      );
  });
  return found;
};

const KIND_LABEL = { done: 'Terminada', cancelled: 'Cancelada', archived: 'Archivada' };

const isTopOverlay = (overlay) => {
  const all = document.querySelectorAll('.eli-prompt__overlay');
  return all.length && all[all.length - 1] === overlay;
};

/**
 * Ventana con los adjuntos de tareas terminadas, canceladas o archivadas.
 * @param groupsPromise Promise de los grupos (se muestra «Buscando…» mientras tanto)
 * @param onOpen   (group, att) => void               abrir el archivo
 * @param onDelete (group, att) => Promise<boolean>   borrar uno (true si se quitó)
 * @param onDeleteAll (groups) => Promise<Set<string>> borra todos; devuelve las rutas quitadas
 */
export const reviewAttachmentsDialog = ({ groupsPromise, onOpen, onDelete, onDeleteAll }) =>
  new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'eli-prompt__overlay';
    overlay.innerHTML = `
      <div class="eli-prompt__box eli-review" role="dialog" data-testid="eli-review-attachments">
        <div class="eli-prompt__title"><i class="fas fa-paperclip"></i> Adjuntos de tareas terminadas</div>
        <div class="eli-review__intro">Tareas terminadas, canceladas o archivadas que tienen archivos adjuntos. Si ya no los necesitas, puedes borrarlos. Deshacer (↶) no recupera un archivo borrado.</div>
        <div class="eli-review__body"><div class="eli-review__empty"><i class="fas fa-spinner fa-spin"></i> Buscando adjuntos…</div></div>
        <div class="eli-prompt__buttons">
          <button type="button" class="btn eli-review__all" data-testid="eli-review-delete-all" style="display:none"></button>
          <button type="button" class="btn eli-prompt__cancel" data-testid="eli-review-close">Cerrar</button>
        </div>
      </div>`;
    const body = overlay.querySelector('.eli-review__body');
    const allBtn = overlay.querySelector('.eli-review__all');
    let groups = [];
    let busy = false;
    const done = () => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve();
    };
    const pending = () => groups.reduce((n, g) => n + g.attachments.length, 0);
    const render = () => {
      groups = groups.filter((g) => g.attachments.length);
      body.innerHTML = '';
      const n = pending();
      if (!n) {
        const empty = document.createElement('div');
        empty.className = 'eli-review__empty';
        empty.textContent = 'No hay tareas terminadas ni archivadas con adjuntos.';
        body.appendChild(empty);
        allBtn.style.display = 'none';
        return;
      }
      const summary = document.createElement('div');
      summary.className = 'eli-review__summary';
      summary.setAttribute('data-testid', 'eli-review-summary');
      summary.textContent = `${n} ${n === 1 ? 'adjunto' : 'adjuntos'} en ${groups.length} ${
        groups.length === 1 ? 'tarea' : 'tareas'
      }`;
      body.appendChild(summary);
      groups.forEach((g) => {
        const box = document.createElement('div');
        box.className = 'eli-review__task';
        box.setAttribute('data-testid', 'eli-review-task');
        const head = document.createElement('div');
        head.className = 'eli-review__head';
        const badge = document.createElement('span');
        badge.className = `eli-review__badge eli-review__badge--${g.kind}`;
        badge.textContent = KIND_LABEL[g.kind] || g.kind;
        const title = document.createElement('span');
        title.className = 'eli-review__title';
        title.textContent = g.title;
        const file = document.createElement('span');
        file.className = 'eli-review__file';
        file.textContent = g.orgPath;
        head.append(badge, title, file);
        box.appendChild(head);
        const ul = document.createElement('ul');
        ul.className = 'eli-attachments';
        g.attachments.forEach((a) => {
          const li = document.createElement('li');
          li.className = 'eli-attachments__item';
          const name = document.createElement(a.missing ? 'span' : 'button');
          name.className =
            'eli-attachments__name' + (a.missing ? ' is-missing' : ' eli-attachments__open');
          name.title = a.path;
          name.textContent = a.name + (a.missing ? ' (ya no existe)' : '');
          if (!a.missing) {
            name.type = 'button';
            name.addEventListener('click', () => onOpen && onOpen(g, a));
          }
          const del = document.createElement('button');
          del.type = 'button';
          del.className = 'btn eli-attachments__delete';
          del.setAttribute('data-testid', 'eli-review-delete');
          del.innerHTML = a.missing
            ? '<i class="fas fa-unlink"></i> Quitar enlace'
            : '<i class="fas fa-trash"></i> Borrar';
          del.addEventListener('click', async () => {
            if (busy) return;
            busy = true;
            try {
              if (await onDelete(g, a)) {
                g.attachments = g.attachments.filter((x) => x !== a);
                render();
              }
            } finally {
              busy = false;
            }
          });
          li.append(name, del);
          ul.appendChild(li);
        });
        box.appendChild(ul);
        body.appendChild(box);
      });
      allBtn.style.display = '';
      allBtn.innerHTML = `<i class="fas fa-trash"></i> Borrar todos (${n})`;
    };
    allBtn.addEventListener('click', async () => {
      if (busy || !onDeleteAll) return;
      busy = true;
      try {
        const removed = await onDeleteAll(groups);
        if (removed && removed.size) {
          groups.forEach((g) => {
            g.attachments = g.attachments.filter((a) => !removed.has(`${g.key}|${a.path}`));
          });
          render();
        }
      } finally {
        busy = false;
      }
    });
    const onKey = (e) => {
      if (e.key === 'Escape' && isTopOverlay(overlay)) {
        e.preventDefault();
        e.stopPropagation();
        done();
      }
    };
    document.addEventListener('keydown', onKey, true);
    overlay.querySelector('.eli-prompt__cancel').addEventListener('click', done);
    document.body.appendChild(overlay);
    Promise.resolve(groupsPromise).then(
      (g) => {
        groups = g || [];
        render();
      },
      (e) => {
        body.innerHTML = '';
        const err = document.createElement('div');
        err.className = 'eli-review__empty';
        err.textContent = `No se pudieron buscar los adjuntos. ${(e && e.message) || ''}`;
        body.appendChild(err);
      }
    );
  });
