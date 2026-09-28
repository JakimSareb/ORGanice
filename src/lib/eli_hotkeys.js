// ORG Mode para Eli: cuándo NO deben actuar los atajos de teclado de organice.
//
// organice registra sus atajos para toda la página (react-hotkeys con ignoreTags: []) y solo
// los desactiva con sus propias ventanas. Las ventanas de ORG Mode para Eli (editor de texto
// plano, diálogo de adjuntos, frases de paso, favoritos, vista de impresión…) viven fuera, así
// que sin esta comprobación teclas como Retroceso borraban el encabezado seleccionado.

const ELI_OVERLAYS = '.eli-raw, .eli-print, .eli-prompt__overlay, [role="dialog"]';

export const isEditable = (el) =>
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
// Nombre de la tecla pulsada en el formato de los atajos de organice ("a", "up", "tab", "/"…).
// Las letras y números se toman de la tecla física si hace falta (con Alt en el Mac la tecla
// produce otro carácter: Alt+T = "†").
const NAMED_KEYS = {
  arrowup: 'up',
  arrowdown: 'down',
  arrowleft: 'left',
  arrowright: 'right',
  escape: 'escape',
  esc: 'escape',
  enter: 'enter',
  tab: 'tab',
  backspace: 'backspace',
  delete: 'del',
  ' ': 'space',
  spacebar: 'space',
};
export const keyNameOf = (event) => {
  const key = (event.key || '').toLowerCase();
  if (/^[a-z0-9]$/.test(key)) return key;
  if (NAMED_KEYS[key]) return NAMED_KEYS[key];
  const code = event.code || '';
  const fromCode = /^Key[A-Z]$/.test(code)
    ? code.slice(3).toLowerCase()
    : /^Digit\d$/.test(code)
    ? code.slice(5)
    : null;
  // Con Alt (Mac) o teclas muertas el carácter no sirve: se usa la tecla física
  if (fromCode && (event.altKey || key.length !== 1 || key === 'dead')) return fromCode;
  return key || fromCode || '';
};

const BINDING_ALIASES = {
  esc: 'escape',
  return: 'enter',
  delete: 'del',
  '"': "'",
  option: 'alt',
  command: 'meta',
  cmd: 'meta',
  control: 'ctrl',
};

// ¿Coincide la tecla pulsada con un atajo como "a", "ctrl+z", "alt+shift+left" o "escape"?
export const matchesBinding = (event, binding) => {
  if (!binding || !event) return false;
  const text = String(binding).toLowerCase().trim();
  // "ctrl++" o "+" no se usan en organice; se separa por "+" conservando un "+" final
  const parts = text.endsWith('++') ? [...text.slice(0, -2).split('+'), '+'] : text.split('+');
  const rawKey = parts.pop();
  const key = BINDING_ALIASES[rawKey] || rawKey;
  const mods = new Set(parts.map((m) => BINDING_ALIASES[m] || m));
  if (!!event.ctrlKey !== mods.has('ctrl')) return false;
  if (!!event.altKey !== mods.has('alt')) return false;
  if (!!event.metaKey !== mods.has('meta')) return false;
  // Mayúsculas: se exige si el atajo la lleva; si no, solo importa en letras (para símbolos
  // como "/" que en algunos teclados necesitan Mayúsculas)
  const isSymbol = key.length === 1 && !/^[a-z0-9]$/.test(key);
  if (mods.has('shift') !== !!event.shiftKey && (mods.has('shift') || !isSymbol)) {
    return false;
  }
  const pressed = keyNameOf(event);
  return pressed === (BINDING_ALIASES[key] || key) || (key === "'" && pressed === '"');
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

// Intro sobre un botón o enlace enfocado ya lo "pulsa": el atajo no debe actuar además
export const notOnButton = (handler) => (event) => {
  const el = document.activeElement;
  if (el && el.closest && el.closest('button, a, [role="button"], select')) return;
  return handler(event);
};

// ORG Mode para Eli (2.13): mientras se escribe en un campo de texto (título, descripción,
// elemento de una lista…), los atajos SIN Ctrl/Alt/⌘ no actúan: «d», Intro, Tab o Retroceso
// son texto. Solo Escape (cerrar) sigue funcionando.
const ALWAYS_WHILE_TYPING = ['closeEditor'];
export const blockedWhileTyping = (event, action, binding) => {
  const target =
    (event && event.target) || (typeof document !== 'undefined' && document.activeElement);
  if (!isEditable(target)) return false;
  if (ALWAYS_WHILE_TYPING.includes(action)) return false;
  const mods = String(binding || '')
    .toLowerCase()
    .split('+')
    .slice(0, -1);
  return !mods.some((m) =>
    ['ctrl', 'control', 'alt', 'option', 'meta', 'cmd', 'command'].includes(m)
  );
};

// ORG Mode para Eli (2.15): nombre de la tecla FÍSICA pulsada, igual que la graba el editor de
// atajos (Ajustes → Atajos de teclado): «a», «1», «[», «,», «/»…
const CODE_NAMES = {
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: '"',
  Backslash: '\\',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Space: 'space',
  Escape: 'escape',
  Enter: 'enter',
  Tab: 'tab',
  Backspace: 'backspace',
};
export const physicalKeyName = (event) => {
  const code = (event && event.code) || '';
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return code.slice(6);
  return CODE_NAMES[code] || null;
};

// Atajos de la vista GTD (teclas sueltas, como Nirvana). Coincide si coincide la tecla física
// con los mismos modificadores (así funciona «Mayús+0» en un teclado español) o si coincide el
// CARÁCTER escrito: para «[», «]», «/», «?»… se admite AltGr / Opción / Mayúsculas, que en un
// teclado español son necesarias para escribirlos.
export const gtdMatchesBinding = (event, binding) => {
  if (!binding || !event || event.metaKey) return false;
  const text = String(binding).toLowerCase().trim();
  const parts =
    text.length > 1 && text.endsWith('++')
      ? [...text.slice(0, -2).split('+'), '+']
      : text.split('+');
  const key = BINDING_ALIASES[parts[parts.length - 1]] || parts[parts.length - 1];
  const mods = new Set(parts.slice(0, -1).map((m) => BINDING_ALIASES[m] || m));
  if (mods.has('meta')) return false;
  const phys = physicalKeyName(event);
  if (
    phys &&
    phys === key &&
    !!event.ctrlKey === mods.has('ctrl') &&
    !!event.altKey === mods.has('alt') &&
    !!event.shiftKey === mods.has('shift')
  ) {
    return true;
  }
  const ch = event.key || '';
  const isSymbol = key.length === 1 && !/^[a-z0-9]$/.test(key);
  if (isSymbol && !mods.size) {
    // Ctrl sola (sin Alt) no es AltGr: entonces no
    if (event.ctrlKey && !event.altKey) return false;
    return ch === key;
  }
  if (/^[a-z]$/.test(key)) {
    return (
      ch.toLowerCase() === key &&
      !event.ctrlKey &&
      !event.altKey &&
      !!event.shiftKey === mods.has('shift') &&
      !mods.has('ctrl') &&
      !mods.has('alt')
    );
  }
  return false;
};
