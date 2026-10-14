// ORG Mode para Eli (3.05): al marcar como hecha una tarea con adjuntos (enlaces a ficheros o
// carpeta de org-attach con :ATTACH:), preguntar si se borran. Vale para la vista GTD y para los
// documentos: mira los cambios de estado (SET_TODO_STATE / ADVANCE_TODO_STATE, también dentro de
// ELI_IN_FILE y ELI_BATCH) y, si una tarea pasa de abierta a terminada, lo ofrece. Las que se
// repiten (vuelven a TODO) no preguntan.
import { List } from 'immutable';

import { attachmentsOfHeader, otherReferences } from '../lib/eli_attachments';
import { orgAttachDirPath, hasAttachTag } from '../lib/eli_org_attach';
import { askConfirm, showMessage } from '../lib/eli_prompt';
import { eliRemoveAttachmentLink, sync } from '../actions/org';

const collect = (action, path, out) => {
  if (!action || typeof action !== 'object') return;
  if (action.type === 'ELI_BATCH') {
    (action.actions || []).forEach((a) => collect(a, path, out));
  } else if (action.type === 'ELI_IN_FILE') {
    [].concat(action.inner || []).forEach((a) => collect(a, action.path, out));
  } else if (action.type === 'SET_TODO_STATE' || action.type === 'ADVANCE_TODO_STATE') {
    out.push({ path, headerId: action.headerId || null });
  }
};

const fileOf = (state, path) => state.org.present.getIn(['files', path]);
const headerOf = (state, path, headerId) => {
  const file = fileOf(state, path);
  if (!file) return null;
  const id = headerId || file.get('selectedHeaderId');
  return (file.get('headers') || List()).find((h) => h.get('id') === id) || null;
};
const isDoneIn = (state, path, header) => {
  if (!header) return false;
  const kw = header.getIn(['titleLine', 'todoKeyword']);
  if (!kw) return false;
  const sets = (fileOf(state, path) || new Map()).get('todoKeywordSets') || List();
  return sets.some((set) => (set.get('completedKeywords') || List()).includes(kw));
};

let queue = Promise.resolve();
const exists = async (client, path) => {
  if (!client.pathExists) return true;
  try {
    return await client.pathExists(path);
  } catch (e) {
    return true;
  }
};

export const offerDoneAttachments = async ({ getState, dispatch }, path, headerId) => {
  const state = getState();
  const client = state.syncBackend.get('client');
  if (!client || !client.deleteFile || !path) return;
  const header = headerOf(state, path, headerId);
  if (!header) return;
  const links = [];
  for (const a of attachmentsOfHeader(header, path)) {
    if (await exists(client, a.path)) links.push(a);
  }
  let dir = orgAttachDirPath(header, path);
  if (dir && !(await exists(client, dir))) dir = null;
  if (!links.length && !dir) return;

  const files = getState().org.present.get('files');
  const excluded = new Set([header.get('id')]);
  const lines = links.map((a) => {
    const others = otherReferences(files, a.path, path, excluded);
    return `• ${a.name}${others.length ? `  (⚠ también enlazado en ${others.join(', ')})` : ''}`;
  });
  if (dir) lines.push(`• Carpeta de adjuntos (org-attach): ${dir}`);
  const isLocal = client.type === 'LocalFolder';
  const title = (header.getIn(['titleLine', 'rawTitle']) || '').trim();
  const ok = await askConfirm({
    title: '¿Borrar los adjuntos de la tarea terminada?',
    message:
      `«${title}»\n\n${lines.join('\n')}\n\n` +
      (isLocal
        ? 'Se borrarán definitivamente de la carpeta del ordenador.'
        : 'Dropbox los guarda un tiempo en «Archivos eliminados» por si necesitas recuperarlos.') +
      '\nDeshacer (↶) no recupera los archivos borrados.',
    okLabel: 'Borrar adjuntos',
    cancelLabel: 'Conservar',
    focusCancel: true,
  });
  if (!ok) return;
  const failed = [];
  const id = header.get('id');
  for (const a of links) {
    try {
      await client.deleteFile(a.path);
      dispatch(eliRemoveAttachmentLink(path, id, a.target));
    } catch (e) {
      failed.push(a.path);
    }
  }
  if (dir) {
    try {
      await (client.deleteFolder ? client.deleteFolder(dir) : client.deleteFile(dir));
      // como org-attach-delete-all: se quita también la etiqueta :ATTACH:
      const h = headerOf(getState(), path, id);
      if (h && hasAttachTag(h)) {
        const tags = (h.getIn(['titleLine', 'tags']) || List()).filter(
          (t) => String(t).toUpperCase() !== 'ATTACH'
        );
        dispatch({
          type: 'ELI_IN_FILE',
          path,
          dirtying: true,
          inner: { type: 'SET_HEADER_TAGS', headerId: id, tags, dirtying: true },
        });
        dispatch(sync({ path, shouldSuppressMessages: true }));
      }
    } catch (e) {
      failed.push(dir);
    }
  }
  if (failed.length) await showMessage('No se pudieron borrar', failed.join('\n'));
};

const doneAttachments = (store) => (next) => (action) => {
  const found = [];
  collect(action, store.getState().org.present.get('path'), found);
  if (!found.length) return next(action);
  const before = store.getState();
  const wasOpen = found.map(({ path, headerId }) => {
    const h = headerOf(before, path, headerId);
    return h ? { path, id: h.get('id'), open: !isDoneIn(before, path, h) } : null;
  });
  const result = next(action);
  const after = store.getState();
  wasOpen.forEach((w) => {
    if (!w || !w.open) return;
    if (!isDoneIn(after, w.path, headerOf(after, w.path, w.id))) return;
    // una tras otra (si se terminan varias a la vez), después de que se vea el cambio
    queue = queue
      .then(() => new Promise((r) => setTimeout(r, 250)))
      .then(() => offerDoneAttachments(store, w.path, w.id))
      .catch(() => {});
  });
  return result;
};

export default doneAttachments;
