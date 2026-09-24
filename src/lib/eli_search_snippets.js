// ORG Mode para Eli: búsqueda en el texto con contexto.
//  - searchTerms: palabras buscadas (sin exclusiones ni etiquetas/propiedades)
//  - snippetsFor: fragmentos del contenido de un encabezado donde aparecen, con contexto
//  - revealTextInHeader: tras abrir el encabezado, lleva la vista al texto exacto y lo resalta

export const searchTerms = (expr) => {
  const terms = [];
  (expr || []).forEach((x) => {
    if (x.exclude) return;
    if (x.type === 'ignore-case' || x.type === 'case-sensitive') {
      (x.words || []).forEach((w) => {
        if (w && !terms.some((t) => t.text === w)) {
          terms.push({ text: w, cs: x.type === 'case-sensitive' });
        }
      });
    }
  });
  return terms;
};

const norm = (s, cs) => (cs ? s : s.toLowerCase());

// Todas las apariciones de los términos en `text`: [{ start, end, term, occurrence }]
// (occurrence = nº de aparición de ese término en el texto, empezando en 0)
export const findOccurrences = (text, terms) => {
  const found = [];
  terms.forEach((term) => {
    const hay = norm(text, term.cs);
    const needle = norm(term.text, term.cs);
    if (!needle) return;
    let from = 0;
    let occurrence = 0;
    for (;;) {
      const i = hay.indexOf(needle, from);
      if (i < 0) break;
      found.push({ start: i, end: i + needle.length, term, occurrence });
      occurrence++;
      from = i + needle.length;
    }
  });
  return found.sort((a, b) => a.start - b.start);
};

// Fragmentos del contenido (una línea con contexto) para mostrar debajo del resultado
export const snippetsFor = (description, terms, { max = 3, context = 45 } = {}) => {
  const text = description || '';
  if (!text || !terms.length) return [];
  const result = [];
  const usedLines = new Set();
  for (const occ of findOccurrences(text, terms)) {
    if (result.length >= max) break;
    const lineStart = text.lastIndexOf('\n', occ.start - 1) + 1;
    let lineEnd = text.indexOf('\n', occ.end);
    if (lineEnd < 0) lineEnd = text.length;
    if (usedLines.has(lineStart)) continue;
    usedLines.add(lineStart);
    const from = Math.max(lineStart, occ.start - context);
    const to = Math.min(lineEnd, occ.end + context);
    result.push({
      before: (from > lineStart ? '…' : '') + text.slice(from, occ.start).replace(/^\s+/, ''),
      match: text.slice(occ.start, occ.end),
      after: text.slice(occ.end, to) + (to < lineEnd ? '…' : ''),
      term: occ.term,
      occurrence: occ.occurrence,
    });
  }
  return result;
};

// Busca el texto en los nodos de texto de `root` (aunque esté partido entre varios nodos)
const rangeForText = (root, term, occurrence) => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let full = '';
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    nodes.push({ node: n, start: full.length });
    full += n.nodeValue;
  }
  const occs = findOccurrences(full, [term]);
  const occ = occs[Math.min(occurrence, occs.length - 1)];
  if (!occ) return null;
  const locate = (pos, isEnd) => {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const { node, start } = nodes[i];
      if (isEnd ? start < pos : start <= pos) return { node, offset: pos - start };
    }
    return null;
  };
  const a = locate(occ.start, false);
  const b = locate(occ.end, true);
  if (!a || !b) return null;
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  return range;
};

let clearTimer = null;

export const revealTextInHeader = (headerId, term, occurrence = 0) => {
  if (typeof document === 'undefined' || !headerId || !term) return;
  let tries = 0;
  const attempt = () => {
    tries++;
    const esc = window.CSS && CSS.escape ? CSS.escape(headerId) : headerId;
    const headerEl = document.querySelector(`[data-header-id="${esc}"]`);
    const content = headerEl && headerEl.querySelector('.header-content-container');
    const range = content && rangeForText(content, term, occurrence);
    if (!range) {
      if (tries < 12) setTimeout(attempt, 150);
      return;
    }
    // Centrar el texto (sirve tanto si desplaza la ventana como un contenedor interno); se
    // repite por si organice desplaza después al encabezado seleccionado
    const el = range.startContainer.parentElement;
    const center = () => el && el.isConnected && el.scrollIntoView({ block: 'center' });
    center();
    setTimeout(center, 400);
    // Resaltado sin tocar el DOM de React (CSS Custom Highlight API); si no existe, selección
    if (window.CSS && CSS.highlights && window.Highlight) {
      CSS.highlights.set('eli-search', new window.Highlight(range));
      clearTimeout(clearTimer);
      clearTimer = setTimeout(() => CSS.highlights.delete('eli-search'), 6000);
    } else {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  };
  setTimeout(attempt, 350);
};
