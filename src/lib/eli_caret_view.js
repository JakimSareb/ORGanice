// ORG Mode para Eli (3.47): en una nota larga (más alta que la pantalla) editada en su sitio, la
// vista sigue al cursor: si queda bajo el borde de abajo (la barra de Documentos o el teclado
// del iPhone) o por encima de la barra de arriba, se desplaza lo justo para verlo.

const COPY = [
  'boxSizing',
  'width',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderTopStyle',
  'borderRightStyle',
  'borderBottomStyle',
  'borderLeftStyle',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'fontStretch',
  'fontSize',
  'fontFamily',
  'lineHeight',
  'letterSpacing',
  'wordSpacing',
  'textIndent',
  'textTransform',
  'tabSize',
  'whiteSpace',
  'wordBreak',
  'overflowWrap',
];

// Altura de línea en px
const lineHeightOf = (cs) => {
  const lh = parseFloat(cs.lineHeight);
  if (lh > 0) return lh;
  return (parseFloat(cs.fontSize) || 16) * 1.3;
};

// Posición vertical del cursor dentro del cuadro (px desde su borde de arriba), con un «espejo»
// invisible que copia su letra y su ancho
export const caretTopIn = (el, pos) => {
  const cs = window.getComputedStyle(el);
  const mirror = document.createElement('div');
  COPY.forEach((p) => {
    mirror.style[p] = cs[p];
  });
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.top = '0';
  mirror.style.left = '-10000px';
  mirror.style.height = 'auto';
  mirror.style.overflow = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.width = `${el.offsetWidth}px`;
  mirror.textContent = (el.value || '').slice(0, pos);
  const mark = document.createElement('span');
  mark.textContent = '​';
  mirror.appendChild(mark);
  document.body.appendChild(mirror);
  const top = mark.offsetTop;
  mirror.parentNode.removeChild(mirror);
  return { top, height: lineHeightOf(cs) };
};

// El contenedor que desplaza al cuadro (o null = la página)
export const scrollParentOf = (el) => {
  let p = el && el.parentElement;
  while (p && p !== document.body && p !== document.documentElement) {
    const oy = window.getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight + 1) return p;
    p = p.parentElement;
  }
  return null;
};

// Franja visible (en coordenadas de la ventana): bajo la barra de arriba y sobre la barra de
// Documentos y el teclado
export const visibleBand = (scroller) => {
  const vv = window.visualViewport;
  let top = vv ? vv.offsetTop : 0;
  let bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
  if (scroller) {
    const r = scroller.getBoundingClientRect();
    top = Math.max(top, r.top);
    bottom = Math.min(bottom, r.bottom);
  }
  const bar = document.querySelector('.header-bar');
  if (bar) {
    const r = bar.getBoundingClientRect();
    if (r.bottom > top && r.top <= top + 4) top = r.bottom;
  }
  document.querySelectorAll('.eli-docbar').forEach((b) => {
    const r = b.getBoundingClientRect();
    // la barra flota cerca de abajo: lo que queda debajo de su borde de arriba no cuenta
    if (r.height > 0 && r.top < bottom && r.top > (top + bottom) / 2) bottom = r.top;
  });
  return { top, bottom };
};

// Cuánto hay que desplazar (px; + = hacia abajo) para que la línea [cTop, cBottom] se vea
export const scrollDeltaFor = (cTop, cBottom, band, margin = 12) => {
  if (band.bottom - band.top < cBottom - cTop + 2 * margin) return 0;
  if (cBottom > band.bottom - margin) return cBottom - (band.bottom - margin);
  if (cTop < band.top + margin) return cTop - (band.top + margin);
  return 0;
};

export const keepCaretVisible = (el) => {
  try {
    if (!el || !el.isConnected || document.activeElement !== el) return;
    const pos = el.selectionEnd == null ? 0 : el.selectionEnd;
    const { top, height } = caretTopIn(el, pos);
    const r = el.getBoundingClientRect();
    const cTop = r.top + top - el.scrollTop;
    const scroller = scrollParentOf(el);
    const d = scrollDeltaFor(cTop, cTop + height, visibleBand(scroller));
    if (!d) return;
    if (scroller) scroller.scrollTop += d;
    else window.scrollBy(0, d);
  } catch (e) {}
};
