// ORG Mode para Eli (4.41): al cambiar el TÍTULO de una nota (cabecera con :ID:), ofrecer
// actualizar el texto de los enlaces [[id:…][Título antiguo]] que la apuntan (el ID no cambia).
// Solo los que muestran exactamente el título antiguo: una descripción propia no se toca.
// Se espera a terminar de escribir (1,5 s sin cambios y sin un campo de texto con el foco).
import { List } from 'immutable';

import { headingIndex, backlinkEntries, plainHeadingTitle } from '../lib/eli_heading_index';
import { countRenamable, renameLinkDescriptions } from '../lib/eli_roam';
import { idOf } from '../lib/eli_heading_index';
import { askConfirm } from '../lib/eli_prompt';
import { eliRewriteHeadings } from '../actions/org';

const collect = (action, path, out) => {
  if (!action || typeof action !== 'object' || action.eliSkipRename) return;
  if (action.type === 'ELI_BATCH') {
    (action.actions || []).forEach((a) => collect(a, path, out));
  } else if (action.type === 'ELI_IN_FILE') {
    [].concat(action.inner || []).forEach((a) => collect(a, action.path, out));
  } else if (action.type === 'UPDATE_HEADER_TITLE' && action.headerId) {
    out.push({ path, headerId: action.headerId });
  }
};

const headerOf = (state, path, headerId) =>
  ((path && state.org.present.getIn(['files', path, 'headers'])) || List()).find(
    (h) => h.get('id') === headerId
  ) || null;

const titleOf = (h) =>
  h ? plainHeadingTitle(h.getIn(['titleLine', 'rawTitle']) || '').trim() : '';

const pending = new Map(); // `${path}|${headerId}` → { path, headerId, orgId, oldTitle, timer }

const isTyping = () => {
  const el = typeof document !== 'undefined' ? document.activeElement : null;
  return !!el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable);
};

// Edits para cambiar las descripciones → [{ path, headerId, title, notes }]
export const renameEdits = (files, orgId, oldTitle, newTitle) => {
  const index = headingIndex(files);
  const fn = (t) => renameLinkDescriptions(t, orgId, oldTitle, newTitle);
  let count = 0;
  const edits = [];
  backlinkEntries(index, orgId).forEach((e) => {
    const n = countRenamable(`${e.rawTitle}\n${e.notes}`, orgId, oldTitle);
    if (!n) return;
    count += n;
    edits.push({ path: e.path, headerId: e.headerId, title: fn, notes: fn });
  });
  return { count, edits };
};

const check = async (store, key) => {
  const p = pending.get(key);
  if (!p) return;
  if (
    isTyping() ||
    (typeof document !== 'undefined' && document.querySelector('.eli-prompt__overlay'))
  ) {
    p.timer = setTimeout(() => check(store, key), 1500);
    return;
  }
  pending.delete(key);
  const h = headerOf(store.getState(), p.path, p.headerId);
  const newTitle = titleOf(h);
  if (!h || !newTitle || newTitle === p.oldTitle) return;
  const files = store.getState().org.present.get('files');
  const { count, edits } = renameEdits(files, p.orgId, p.oldTitle, newTitle);
  if (!count) return;
  const ok = await askConfirm({
    title: 'Título cambiado',
    message:
      `${count === 1 ? 'Hay 1 enlace' : `Hay ${count} enlaces`} que ${
        count === 1 ? 'muestra' : 'muestran'
      } el título antiguo «${p.oldTitle}».\n\n` +
      `¿Cambiar su texto a «${newTitle}»? (El enlace sigue funcionando igual: va por ID.)`,
    okLabel: 'Actualizar',
    cancelLabel: 'Dejarlos',
  });
  if (ok) store.dispatch(eliRewriteHeadings(edits));
};

export default (store) => (next) => (action) => {
  const found = [];
  collect(action, null, found);
  if (!found.length) return next(action);
  const before = store.getState();
  const current = before.org.present.get('path');
  const olds = found.map((f) => {
    const path = f.path || current;
    const h = headerOf(before, path, f.headerId);
    return { path, headerId: f.headerId, orgId: h ? idOf(h) : null, oldTitle: titleOf(h) };
  });
  const result = next(action);
  olds.forEach((o) => {
    if (!o.orgId || !o.oldTitle) return;
    const key = `${o.path}|${o.headerId}`;
    const prev = pending.get(key);
    if (prev) clearTimeout(prev.timer);
    const after = titleOf(headerOf(store.getState(), o.path, o.headerId));
    if (!prev && after === o.oldTitle) return;
    const entry = { ...o, oldTitle: prev ? prev.oldTitle : o.oldTitle };
    entry.timer = setTimeout(() => check(store, key), 1500);
    pending.set(key, entry);
  });
  return result;
};
