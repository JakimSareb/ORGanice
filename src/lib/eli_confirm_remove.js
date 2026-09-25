// ORG Mode para Eli: confirmación antes de borrar un encabezado (con sus subencabezados).
import { askConfirm } from './eli_prompt';
import { subheadersOfHeaderWithId } from './org_utils';
import { attachmentCount } from './eli_attachments';

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
    return await askConfirm({ title: '¿Borrar este encabezado?', message, okLabel: 'Borrar' });
  } finally {
    open = false;
  }
};
