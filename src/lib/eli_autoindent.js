// ORG Mode para Eli (3.47): al pulsar Intro en las notas, la línea nueva empieza con la misma
// sangría (espacios o tabuladores) que la anterior, como en Emacs. Devuelve null si la línea
// del cursor no tiene sangría (entonces Intro hace lo de siempre).
export const autoIndentEnter = (value, start, end = start) => {
  const text = value || '';
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const indent = (/^[ \t]+/.exec(text.slice(lineStart, start)) || [''])[0];
  if (!indent) return null;
  const insert = '\n' + indent;
  return {
    value: text.slice(0, start) + insert + text.slice(end),
    cursor: start + insert.length,
  };
};

// ¿Es un Intro «normal» (sin modificadores ni composición de texto del teclado)?
export const isPlainEnter = (e) =>
  !!e &&
  e.key === 'Enter' &&
  !e.shiftKey &&
  !e.metaKey &&
  !e.ctrlKey &&
  !e.altKey &&
  !(e.nativeEvent ? e.nativeEvent.isComposing : e.isComposing) &&
  e.keyCode !== 229;
