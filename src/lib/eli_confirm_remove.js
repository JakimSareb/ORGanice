// ORG Mode para Eli: confirmación antes de borrar un encabezado (con sus subencabezados).
import { askConfirm, askChoice } from './eli_prompt';
import { subheadersOfHeaderWithId } from './org_utils';
import { attachmentCount } from './eli_attachments';
import { eliIdLinksToText } from '../actions/org';
import { subtreeOrgIds, idLinkReferences, referencesMessage } from './eli_id_links';

// (4.24) El store, para mirar los enlaces [[id:…]] de los ficheros cargados (lo pone store.js)
let store = null;
export const setRemoveStore = (s) => {
  store = s;
};

// Enlaces de los ficheros cargados al subárbol que se va a borrar: { ids, refs, path }
export const incomingIdLinks = (files, headers, headerId, path) => {
  const ids = subtreeOrgIds(headers, headerId);
  if (!ids.size || !files) return { ids, refs: [], path };
  const filePath =
    path || (files.findKey && files.findKey((f) => f && f.get('headers') === headers)) || null;
  const skipIds = new Set([headerId]);
  subheadersOfHeaderWithId(headers, headerId).forEach((h) => skipIds.add(h.get('id')));
  const refs = idLinkReferences(files, ids, { path: filePath, headerIds: skipIds });
  return { ids, refs, path: filePath };
};

// Si hay enlaces que apuntan a lo que se borra: cancelar / borrar y dejarlos como texto / borrar
// igualmente. → true (borrar) o false (cancelar)
const confirmLinks = async (headers, headerId) => {
  if (!store) return true;
  const st = store.getState().org.present;
  const { ids, refs } = incomingIdLinks(st.get('files'), headers, headerId);
  if (!refs.length) return true;
  const choice = await askChoice({
    title: 'Hay enlaces a este encabezado',
    message: referencesMessage(refs),
    // askChoice los pinta en orden inverso (el primero, abajo, junto a Cancelar)
    choices: [
      { id: 'delete-anyway', label: 'Borrar igualmente', danger: true },
      { id: 'links-to-text', label: 'Borrar y dejar los enlaces como texto' },
    ],
  });
  if (!choice) return false;
  if (choice === 'links-to-text') {
    store.dispatch(eliIdLinksToText(refs, ids));
  }
  return true;
};

let open = false;

export const removeHeaderMessage = (headers, headerId) => {
  const header = headers && headers.find((h) => h.get('id') === headerId);
  if (!header) return null;
  const title = (header.getIn(['titleLine', 'rawTitle']) || '').trim() || '(sin título)';
  const subs = subheadersOfHeaderWithId(headers, headerId).size;
  const attachments = attachmentCount(headers, headerId);
  return (
    `«${title}»` +
    (subs ? `\ny ${subs === 1 ? 'su subencabezado' : `sus ${subs} subencabezados`}` : '') +
    (attachments
      ? `\n\n${
          attachments === 1 ? 'Tiene 1 adjunto' : `Tiene ${attachments} adjuntos`
        }: después te preguntaré uno a uno si quieres borrarlos también.`
      : '') +
    '\n\nSe puede deshacer con la flecha ↶.'
  );
};

// Devuelve una promesa con true si se confirma. Si ya hay una confirmación abierta, false.
export const confirmRemoveHeader = async (headers, headerId) => {
  if (open) return false;
  const message = removeHeaderMessage(headers, headerId);
  if (!message) return false;
  open = true;
  try {
    const ok = await askConfirm({ title: '¿Borrar este encabezado?', message, okLabel: 'Borrar' });
    return ok ? await confirmLinks(headers, headerId) : false;
  } finally {
    open = false;
  }
};
