// ORG Mode para Eli (2.12): abrir la paleta de comandos con el cursor ya en el cuadro de texto.
//
// En el iPhone/iPad el teclado solo aparece si el campo recibe el foco durante el propio toque.
// La paleta se dibuja un instante después, así que primero se da el foco (dentro del toque) a
// un campo invisible y la paleta lo pasa a su cuadro de búsqueda en cuanto aparece; el teclado
// se queda abierto.
const PROXY_ID = 'eli-focus-proxy';

export const primeKeyboardFocus = () => {
  if (typeof document === 'undefined') return;
  let el = document.getElementById(PROXY_ID);
  if (!el) {
    el = document.createElement('input');
    el.id = PROXY_ID;
    el.type = 'text';
    el.setAttribute('aria-hidden', 'true');
    el.tabIndex = -1;
    el.autocomplete = 'off';
    // Visible para el navegador (si no, no admite el foco) pero sin verse ni mover la página
    el.style.cssText =
      'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;border:0;padding:0;' +
      'font-size:16px;pointer-events:none;';
    document.body.appendChild(el);
  }
  try {
    el.focus({ preventScroll: true });
  } catch (e) {
    el.focus();
  }
};

export const openPalette = () => {
  primeKeyboardFocus();
  window.dispatchEvent(new CustomEvent('eli:palette'));
};
