// ORG Mode para Eli: botones de formato de texto con los marcadores estándar de Org Mode
// (*negrita*, /cursiva/, _subrayado_, +tachado+, ~código~, =literal=)

export const ORG_EMPHASIS = [
  { marker: '*', icon: 'fas fa-bold', title: 'Negrita (*texto*)', id: 'bold' },
  { marker: '/', icon: 'fas fa-italic', title: 'Cursiva (/texto/)', id: 'italic' },
  { marker: '_', icon: 'fas fa-underline', title: 'Subrayado (_texto_)', id: 'underline' },
  { marker: '+', icon: 'fas fa-strikethrough', title: 'Tachado (+texto+)', id: 'strike' },
  { marker: '~', icon: 'fas fa-code', title: 'Código (~texto~)', id: 'code' },
  { marker: '=', icon: 'fas fa-equals', title: 'Literal (=texto=)', id: 'verbatim' },
];

/**
 * Pone o quita un marcador de énfasis alrededor de la selección [start, end) de `value`.
 * - Sin selección: inserta el par de marcadores y deja el cursor en medio.
 * - Si la selección ya está rodeada por el marcador (por dentro o por fuera), lo quita.
 * - Si no, lo pone en cada línea no vacía de la selección, sin incluir los espacios de los
 *   extremos (Org no reconoce "* texto *").
 * Devuelve { value, start, end } con la nueva selección.
 */
export const toggleOrgEmphasis = (value, start, end, marker) => {
  const text = value || '';
  let s = Math.max(0, Math.min(start == null ? text.length : start, text.length));
  let e = Math.max(s, Math.min(end == null ? s : end, text.length));
  if (s === e) {
    return { value: text.slice(0, s) + marker + marker + text.slice(e), start: s + 1, end: s + 1 };
  }
  const sel = text.slice(s, e);
  // Ya marcado por dentro: *texto* seleccionado entero
  if (sel.length >= 2 && sel.startsWith(marker) && sel.endsWith(marker) && !sel.includes('\n')) {
    const inner = sel.slice(1, -1);
    return { value: text.slice(0, s) + inner + text.slice(e), start: s, end: s + inner.length };
  }
  // Ya marcado por fuera: se seleccionó solo "texto" dentro de *texto*
  if (s > 0 && text[s - 1] === marker && text[e] === marker && !sel.includes('\n')) {
    return {
      value: text.slice(0, s - 1) + sel + text.slice(e + 1),
      start: s - 1,
      end: e - 1,
    };
  }
  const wrapped = sel
    .split('\n')
    .map((line) => {
      const m = /^(\s*)(.*?)(\s*)$/.exec(line);
      return m[2] ? `${m[1]}${marker}${m[2]}${marker}${m[3]}` : line;
    })
    .join('\n');
  return { value: text.slice(0, s) + wrapped + text.slice(e), start: s, end: s + wrapped.length };
};
