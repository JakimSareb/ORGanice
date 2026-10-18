// ORG Mode para Eli (3.09): enlaces dentro del texto de las notas ([[enlace][texto]], [[enlace]] y
// direcciones web sueltas), para pintarlos clicables en las vistas previas. Cada parte lleva su
// posición en el texto original (start/end) para poner el cursor donde se toca.
const NOTE_TEXT_LINK_RE = /\[\[((?:\\[[\]]|[^\]\n])+)\](?:\[([^\]\n]*)\])?\]|(https?:\/\/[^\s<>\]]+)/g;

export const noteTextParts = (text) => {
  const out = [];
  let last = 0;
  let m;
  const t = text || '';
  NOTE_TEXT_LINK_RE.lastIndex = 0;
  while ((m = NOTE_TEXT_LINK_RE.exec(t))) {
    if (m.index > last) out.push({ text: t.slice(last, m.index), start: last, end: m.index });
    const uri = m[1] || m[3];
    out.push({ link: uri, text: m[2] || uri, start: m.index, end: m.index + m[0].length });
    last = m.index + m[0].length;
  }
  if (last < t.length) out.push({ text: t.slice(last), start: last, end: t.length });
  return out;
};

export const hasNoteLinks = (text) => noteTextParts(text).some((p) => p.link);

export const isWebUri = (u) => /^(https?:|mailto:)/i.test(u || '');
