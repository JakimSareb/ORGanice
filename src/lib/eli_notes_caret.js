// ORG Mode para Eli (3.06): doble clic en las notas → el cursor queda donde se ha pulsado.
// Lo que se ve (texto ya formateado: sin *, [[…]], etc.) no es igual que el texto Org, así que se
// toma un trozo del texto visible justo antes del punto pulsado y se busca en el texto Org
// (la misma aparición: si el trozo sale k veces antes, se usa la k-ésima).

let pending = null; // { headerId, anchor, nth, at }

const caretRangeAt = (x, y) => {
  try {
    if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
    if (document.caretPositionFromPoint) {
      const p = document.caretPositionFromPoint(x, y);
      if (!p) return null;
      const r = document.createRange();
      r.setStart(p.offsetNode, p.offset);
      return r;
    }
  } catch (e) {}
  return null;
};

const countOccurrences = (text, piece) => {
  if (!piece) return 0;
  let n = 0;
  let i = text.indexOf(piece);
  while (i >= 0) {
    n++;
    i = text.indexOf(piece, i + 1);
  }
  return n;
};

// Guarda dónde se pulsó (container = el bloque de las notas)
export const rememberNotesCaret = (headerId, container, x, y) => {
  pending = null;
  if (!container || typeof document === 'undefined') return;
  const r = caretRangeAt(x, y);
  if (!r || !container.contains(r.startContainer)) return;
  try {
    const pre = document.createRange();
    pre.setStart(container, 0);
    pre.setEnd(r.startContainer, r.startOffset);
    const before = pre.toString();
    // el trozo: lo que hay antes en la misma línea (hasta 24 caracteres)
    const line = before.split('\n').pop();
    const anchor = line.slice(-24);
    const nth = countOccurrences(before, anchor);
    pending = { headerId, anchor, nth, empty: !before.trim(), at: Date.now() };
  } catch (e) {
    pending = null;
  }
};

// Posición en el texto Org (o null si no se sabe)
export const caretOffsetIn = (raw, p) => {
  const text = String(raw || '');
  if (!p) return null;
  if (p.empty) return 0;
  let anchor = p.anchor || '';
  // si no aparece tal cual (formato), se prueba con trozos más cortos del final
  while (anchor.length >= 2) {
    const total = countOccurrences(text, anchor);
    if (total > 0) {
      const want = Math.min(Math.max(1, p.nth || 1), total);
      let i = -1;
      for (let k = 0; k < want; k++) i = text.indexOf(anchor, i + 1);
      return i + anchor.length;
    }
    anchor = anchor.slice(Math.ceil(anchor.length / 3));
  }
  return null;
};

// Para el editor: lo pendiente de ese encabezado (solo si es reciente) y se borra
export const takeNotesCaret = (headerId) => {
  const p = pending;
  pending = null;
  if (!p || p.headerId !== headerId || Date.now() - p.at > 5000) return null;
  return p;
};

// (3.33) Posición (carácter) de un textarea en el punto x, y de la pantalla. Se pinta un doble
// invisible del textarea con el mismo estilo, encima y con el mismo desplazamiento, y se mira qué
// carácter hay debajo del punto. null si no se puede saber.
const MIRROR_PROPS = [
  'boxSizing',
  'width',
  'height',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderStyle',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'fontVariant',
  'fontStretch',
  'lineHeight',
  'letterSpacing',
  'wordSpacing',
  'textTransform',
  'textIndent',
  'textAlign',
  'tabSize',
  'direction',
];

export const textareaOffsetAt = (el, x, y) => {
  if (!el || typeof document === 'undefined' || !document.body) return null;
  if (!document.caretRangeFromPoint && !document.caretPositionFromPoint) return null;
  const value = String(el.value || '');
  let mirror = null;
  try {
    const rect = el.getBoundingClientRect();
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;
    const cs = window.getComputedStyle(el);
    mirror = document.createElement('div');
    const s = mirror.style;
    MIRROR_PROPS.forEach((p) => {
      s[p] = cs[p];
    });
    s.position = 'fixed';
    s.left = rect.left + 'px';
    s.top = rect.top + 'px';
    s.width = rect.width + 'px';
    s.height = rect.height + 'px';
    s.boxSizing = 'border-box';
    s.margin = '0';
    s.borderColor = 'transparent';
    s.whiteSpace = 'pre-wrap';
    s.overflowWrap = 'break-word';
    s.wordWrap = 'break-word';
    s.overflow = 'hidden';
    s.color = 'transparent';
    s.background = 'transparent';
    s.opacity = '0';
    s.zIndex = '2147483647';
    // el espacio final hace que una última línea vacía también ocupe su sitio
    mirror.textContent = value + ' ';
    document.body.appendChild(mirror);
    mirror.scrollTop = el.scrollTop;
    mirror.scrollLeft = el.scrollLeft;
    const r = caretRangeAt(x, y);
    if (!r || !mirror.contains(r.startContainer)) return null;
    if (r.startContainer.nodeType !== 3) return value.length;
    return Math.max(0, Math.min(value.length, r.startOffset));
  } catch (e) {
    return null;
  } finally {
    if (mirror && mirror.parentNode) mirror.parentNode.removeChild(mirror);
  }
};
