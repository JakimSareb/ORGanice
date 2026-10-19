// ORG Mode para Eli (3.17): «puente» para que iOS saque el teclado al crear una tarea.
// iOS solo abre el teclado si el foco se pone dentro del mismo toque. Al pulsar «Añadir» todavía
// no existe el campo del título (se monta después), así que se enfoca al momento un campo
// invisible y, cuando el título aparece, el foco pasa a él: iOS mantiene el teclado abierto.

let bridge = null;
let timer = null;

const removeBridge = () => {
  if (timer) clearTimeout(timer);
  timer = null;
  if (bridge && bridge.parentNode) bridge.parentNode.removeChild(bridge);
  bridge = null;
};

export const primeKeyboard = () => {
  if (typeof document === 'undefined' || !document.body) return;
  try {
    removeBridge();
    const el = document.createElement('input');
    el.type = 'text';
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('tabindex', '-1');
    el.className = 'eli-keyboard-bridge';
    // 16 px para que iOS no amplíe la página; fuera de la vista pero «visible» para el foco
    el.style.cssText =
      'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;' +
      'border:0;padding:0;margin:0;pointer-events:none;z-index:-1;';
    document.body.appendChild(el);
    el.focus({ preventScroll: true });
    bridge = el;
    // Si el título no llega a aparecer, se quita solo
    timer = setTimeout(() => {
      const wasActive = bridge && document.activeElement === bridge;
      removeBridge();
      if (wasActive && document.activeElement && document.activeElement.blur)
        document.activeElement.blur();
    }, 2000);
  } catch (e) {
    removeBridge();
  }
};

// Pone el foco en el campo (con el cursor al final) y quita el puente
export const focusField = (el, { caretAtEnd = true } = {}) => {
  if (!el) {
    removeBridge();
    return;
  }
  try {
    el.focus();
    if (caretAtEnd && typeof el.setSelectionRange === 'function') {
      const n = (el.value || '').length;
      el.setSelectionRange(n, n);
    }
  } catch (e) {}
  removeBridge();
};
