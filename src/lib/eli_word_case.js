// ORG Mode para Eli (4.45): Alt+U y Alt+C en los campos de texto, como M-u y M-c de Emacs.
//   Alt+U: la palabra siguiente (desde el cursor) en MAYÚSCULAS.
//   Alt+C: la palabra siguiente con la primera letra en mayúscula y el resto en minúsculas.
// El cursor queda tras la palabra. Con texto seleccionado se aplica a la selección.
import { matchesBinding } from './eli_hotkeys';
import { textFieldOf } from './eli_drag_click_guard';

const WORD = /[\p{L}\p{N}_]/u;
const isWordChar = (c) => !!c && WORD.test(c);

const up = (s) => s.toLocaleUpperCase('es');
const low = (s) => s.toLocaleLowerCase('es');
const capital = (w) => {
  const chars = Array.from(w);
  return chars.length ? up(chars[0]) + low(chars.slice(1).join('')) : w;
};

// Aplica el cambio a UN trozo (sin selección): mode = 'upper' | 'capital'
const convert = (s, mode) =>
  mode === 'upper' ? up(s) : s.replace(/[\p{L}\p{N}_]+/gu, (w) => capital(w));

// text: contenido del campo; start/end: selección (iguales = solo cursor).
// Devuelve { from, to, replacement, cursor } para sustituir text.slice(from, to) por replacement,
// o null si no hay nada que cambiar.
export const eliWordCase = (text, start, end, mode) => {
  const s = String(text == null ? '' : text);
  let a = Math.max(0, Math.min(start, s.length));
  let b = Math.max(a, Math.min(end == null ? a : end, s.length));
  if (a === b) {
    // M-u / M-c: sáltate lo que no sea palabra y llega hasta el final de la palabra
    let i = a;
    while (i < s.length && !isWordChar(s[i])) i++;
    if (i >= s.length) return null;
    let j = i;
    while (j < s.length && isWordChar(s[j])) j++;
    // (si el cursor está a mitad de palabra, i == a: se actúa desde el cursor)
    const from = i;
    const part = s.slice(from, j);
    const replacement = mode === 'upper' ? up(part) : capital(part);
    // «a mitad de palabra» (el trozo no empieza por el principio de la palabra): Emacs pone en
    // mayúscula solo la primera letra del trozo y en minúscula el resto, igual que `capital`
    return { from, to: j, replacement, cursor: j };
  }
  const part = s.slice(a, b);
  const replacement = convert(part, mode);
  return { from: a, to: b, replacement, cursor: a + replacement.length };
};

let bindings = { upper: 'alt+u', capital: 'alt+c' };
export const setWordCaseBindings = (custom) => {
  const get = (name, def) => (custom && custom.get ? custom.get(name, def) : def);
  bindings = {
    upper: get(WORD_UPPER_NAME, 'alt+u'),
    capital: get(WORD_CAPITAL_NAME, 'alt+c'),
  };
};
export const WORD_UPPER_NAME = 'Palabra siguiente en MAYÚSCULAS (campos de texto)';
export const WORD_CAPITAL_NAME = 'Palabra siguiente con inicial en mayúscula (campos de texto)';

// Cambia el texto de un campo por el camino de «escribir» (execCommand: se puede deshacer y
// React/Org lo ven como una entrada normal); si el navegador no lo permite, valor + evento input.
export const applyToField = (field, change) => {
  if (!field || !change) return false;
  const isInput = field.tagName === 'TEXTAREA' || field.tagName === 'INPUT';
  if (isInput) {
    field.setSelectionRange(change.from, change.to);
    let ok = false;
    try {
      ok = document.execCommand && document.execCommand('insertText', false, change.replacement);
    } catch (e) {}
    if (
      !ok ||
      field.value.slice(change.from, change.from + change.replacement.length) !== change.replacement
    ) {
      const old = field.value;
      const next = old.slice(0, change.from) + change.replacement + old.slice(change.to);
      const proto =
        field.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement : window.HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(proto.prototype, 'value').set;
      setter.call(field, next);
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }
    field.setSelectionRange(change.cursor, change.cursor);
    return true;
  }
  return false;
};

const onKeyDown = (event) => {
  if (event.defaultPrevented || !event.altKey || event.ctrlKey || event.metaKey) return;
  const mode = matchesBinding(event, bindings.upper)
    ? 'upper'
    : matchesBinding(event, bindings.capital)
    ? 'capital'
    : null;
  if (!mode) return;
  const field = textFieldOf(event.target);
  if (!field) return;
  if (field.tagName === 'INPUT' && typeof field.selectionStart !== 'number') return;
  // Option+U es una tecla muerta y Option+C escribe «ç» en el Mac: se corta aquí
  event.preventDefault();
  if (field.tagName === 'TEXTAREA' || field.tagName === 'INPUT') {
    const change = eliWordCase(field.value, field.selectionStart, field.selectionEnd, mode);
    applyToField(field, change);
    return;
  }
  // contenteditable: sobre el texto del nodo donde está el cursor
  const sel = window.getSelection && window.getSelection();
  if (!sel || !sel.rangeCount) return;
  const node = sel.anchorNode;
  if (!node || node.nodeType !== 3) return;
  const collapsed = sel.isCollapsed;
  const start = collapsed ? sel.anchorOffset : Math.min(sel.anchorOffset, sel.focusOffset);
  const end = collapsed ? sel.anchorOffset : Math.max(sel.anchorOffset, sel.focusOffset);
  const change = eliWordCase(node.textContent, start, end, mode);
  if (!change) return;
  const range = document.createRange();
  range.setStart(node, change.from);
  range.setEnd(node, change.to);
  sel.removeAllRanges();
  sel.addRange(range);
  let ok = false;
  try {
    ok = document.execCommand('insertText', false, change.replacement);
  } catch (e) {}
  if (!ok)
    node.textContent =
      node.textContent.slice(0, change.from) +
      change.replacement +
      node.textContent.slice(change.to);
};

let installed = false;
export const installWordCase = (win = typeof window !== 'undefined' ? window : null) => {
  if (!win || installed) return;
  installed = true;
  // en captura, antes que los atajos de la app (que no actúan con Alt dentro de campos)
  win.addEventListener('keydown', onKeyDown, true);
};
