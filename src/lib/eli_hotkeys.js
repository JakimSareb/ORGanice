// ORG Mode para Eli: cuándo NO deben actuar los atajos de teclado de organice.
//
// organice registra sus atajos para toda la página (react-hotkeys con ignoreTags: []) y solo
// los desactiva con sus propias ventanas. Las ventanas de ORG Mode para Eli (editor de texto
// plano, diálogo de adjuntos, frases de paso, favoritos, vista de impresión…) viven fuera, así
// que sin esta comprobación teclas como Retroceso borraban el encabezado seleccionado.

const ELI_OVERLAYS = '.eli-raw, .eli-print, .eli-prompt__overlay, [role="dialog"]';

const isEditable = (el) =>
  !!el &&
  (el.isContentEditable ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    (el.tagName === 'INPUT' &&
      !/^(checkbox|radio|button|submit|reset|range|color|file)$/i.test(el.type || '')));

export const shouldIgnoreOrganiceHotkey = (event, orgFileContainer) => {
  if (typeof document === 'undefined') return false;
  const target = (event && event.target) || document.activeElement;
  // Con una ventana propia abierta, ningún atajo de organice
  if (document.querySelector(ELI_OVERLAYS)) return true;
  if (target && target.closest && target.closest(ELI_OVERLAYS)) return true;
  // Campos de texto fuera del fichero Org (y de las ventanas de organice, que están dentro)
  if (isEditable(target)) {
    const insideOrganice =
      (orgFileContainer && orgFileContainer.contains && orgFileContainer.contains(target)) ||
      (target.closest && target.closest('.drawer, .drawer-modal, .org-file-container'));
    if (!insideOrganice) return true;
  }
  return false;
};

// Atajos de una sola letra: nunca mientras se escribe en un campo de texto
export const notWhileTyping = (handler) => (event) => {
  const target = (event && event.target) || document.activeElement;
  if (isEditable(target) || isEditable(document.activeElement)) return;
  return handler(event);
};

// ¿Coincide la tecla pulsada con un atajo como "a", "ctrl+z" o "escape"?
export const matchesBinding = (event, binding) => {
  if (!binding || !event) return false;
  const parts = String(binding).toLowerCase().split('+');
  const key = parts.pop();
  const mods = new Set(parts);
  const want = (m) => mods.has(m) || (m === 'meta' && mods.has('command'));
  if (!!event.ctrlKey !== want('ctrl')) return false;
  if (!!event.altKey !== (want('alt') || mods.has('option'))) return false;
  if (!!event.metaKey !== want('meta')) return false;
  if (!!event.shiftKey !== want('shift')) return false;
  const pressed = (event.key || '').toLowerCase();
  const names = { escape: 'escape', esc: 'escape', space: ' ', enter: 'enter', return: 'enter' };
  return pressed === (names[key] || key);
};

// Atajos propios de ORG Mode para Eli (se gestionan con un listener propio, no react-hotkeys)
export const ELI_HOTKEY_ACTIONS = [
  'closeEditor',
  'openAgenda',
  'openFavorites',
  'openCapture',
  'syncFile',
  'openMoveMenu',
  'openSearch',
];

// Al perder el foco la ventana (Cmd+Tab…) el navegador no envía el keyup de las teclas
// modificadoras y react-hotkeys las cree pulsadas: se las "suelta" a mano.
export const releaseStuckModifiers = () => {
  ['Meta', 'Control', 'Alt', 'Shift'].forEach((key) => {
    try {
      document.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
    } catch (e) {}
  });
};
