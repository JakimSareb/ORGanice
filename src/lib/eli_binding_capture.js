// ORG Mode para Eli (4.45): de una tecla pulsada al texto de un atajo («ctrl+shift+n», «alt+left»,
// «,»…). Lo usan la fila de Ajustes › Atajos y la ventana de Atajos. Las teclas modificadoras solas
// devuelven null (no terminan la grabación); una tecla sin nombre conocido, también.
const KEY_NAMES = {
  Minus: '-',
  Equal: '=',
  Backspace: 'backspace',
  Enter: 'enter',
  Return: 'return',
  Tab: 'tab',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: '"',
  Backslash: '\\',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Escape: 'escape',
  Space: 'space',
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

export const bindingFromEvent = (event) => {
  if (['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return null;
  const code = event.code || '';
  let key = null;
  if (code.startsWith('Key')) key = code.substr(3).toLowerCase();
  else if (code.startsWith('Digit')) key = code.substr(5);
  else key = KEY_NAMES[code];
  if (!key) return null;
  const mods = [
    ['ctrlKey', 'ctrl'],
    ['altKey', 'alt'],
    ['metaKey', 'meta'],
    ['shiftKey', 'shift'],
  ]
    .filter(([m]) => event[m])
    .map(([, symbol]) => symbol)
    .join('+');
  return `${mods}${mods ? '+' : ''}${key}`;
};
