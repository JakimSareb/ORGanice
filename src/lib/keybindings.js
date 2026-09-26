const DEFAULT_BINDINGS = [
  ['Select next header', 'selectNextVisibleHeader', 'ctrl+down'],
  ['Select previous header', 'selectPreviousVisibleHeader', 'ctrl+up'],
  ['Toggle header opened', 'toggleHeaderOpened', 'tab'],
  ['Advance todo state', 'advanceTodo', 'alt+t'],
  ['Edit title', 'editTitle', 'ctrl+h'],
  ['Edit description', 'editDescription', 'ctrl+d'],
  ['Exit edit mode', 'exitEditMode', 'alt+enter'],
  ['Add header', 'addHeader', 'ctrl+enter'],
  ['Remove header', 'removeHeader', 'backspace'],
  ['Move header up', 'moveHeaderUp', 'alt+up'],
  ['Move header down', 'moveHeaderDown', 'alt+down'],
  ['Move header left', 'moveHeaderLeft', 'alt+shift+left'],
  ['Move header right', 'moveHeaderRight', 'alt+shift+right'],
  ['Undo', 'undo', 'ctrl+/'],
  // ORG Mode para Eli
  ['Cerrar la ventana de edición', 'closeEditor', 'escape'],
  ['Abrir la agenda', 'openAgenda', 'a'],
  ['Abrir la vista GTD', 'openGtd', 'g'],
  ['Abrir ficheros principales', 'openFavorites', 'f'],
  ['Capturar (después, la letra de la plantilla)', 'openCapture', 'c'],
  ['Sincronizar', 'syncFile', 's'],
  ['Mover encabezados (flechas)', 'openMoveMenu', 'm'],
  ['Buscar', 'openSearch', 'b'],
  ['Seleccionar el encabezado siguiente (flecha)', 'eliSelectNext', 'down'],
  ['Seleccionar el encabezado anterior (flecha)', 'eliSelectPrev', 'up'],
  ['Abrir/cerrar el encabezado seleccionado (intro)', 'eliToggleOpen', 'enter'],
];

export const calculateNamedKeybindings = (customKeybindings) =>
  DEFAULT_BINDINGS.map(([bindingName, _bindingAction, binding]) => [
    bindingName,
    customKeybindings.get(bindingName, binding),
  ]);

export const calculateActionedKeybindings = (customKeybindings) =>
  DEFAULT_BINDINGS.map(([bindingName, bindingAction, binding]) => [
    bindingAction,
    customKeybindings.get(bindingName, binding),
  ]);

// ORG Mode para Eli: el primer elemento de cada atajo es la clave con la que se guardan los
// atajos personalizados, así que no se traduce; solo se traduce al mostrarlo.
export const KEYBINDING_LABELS_ES = {
  'Select next header': 'Seleccionar el encabezado siguiente',
  'Select previous header': 'Seleccionar el encabezado anterior',
  'Toggle header opened': 'Abrir/cerrar el encabezado',
  'Advance todo state': 'Avanzar el estado TODO',
  'Edit title': 'Editar el título',
  'Edit description': 'Editar la descripción',
  'Exit edit mode': 'Salir del modo de edición',
  'Add header': 'Añadir encabezado',
  'Remove header': 'Eliminar encabezado',
  'Move header up': 'Subir el encabezado',
  'Move header down': 'Bajar el encabezado',
  'Move header left': 'Mover el encabezado a la izquierda',
  'Move header right': 'Mover el encabezado a la derecha',
  Undo: 'Deshacer',
};

export const keybindingLabel = (name) => KEYBINDING_LABELS_ES[name] || name;
