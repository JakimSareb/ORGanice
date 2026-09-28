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

// ORG Mode para Eli (2.15): atajos de la vista GTD (al estilo de Nirvana). Se guardan con los
// demás atajos personalizados (su nombre es la clave, así que no se cambia). [nombre, acción,
// tecla, grupo]
export const GTD_BINDINGS = [
  ['GTD: tarea nueva en esta lista', 'gtdNew', 'n', 'Crear'],
  ['GTD: tarea nueva arriba de esta lista', 'gtdNewTop', 'shift+n', 'Crear'],
  ['GTD: tarea nueva en Inbox', 'gtdNewInbox', 'i', 'Crear'],
  ['GTD: tarea nueva en Next', 'gtdNewNext', 'x', 'Crear'],
  ['GTD: tarea nueva en Waiting', 'gtdNewWaiting', 'w', 'Crear'],
  ['GTD: tarea nueva programada (Scheduled)', 'gtdNewScheduled', 's', 'Crear'],
  ['GTD: tarea nueva en Someday', 'gtdNewSomeday', 'y', 'Crear'],
  ['GTD: tarea nueva en Focus (★)', 'gtdNewFocus', 'f', 'Crear'],
  ['GTD: proyecto nuevo', 'gtdNewProject', 'p', 'Crear'],
  ['GTD: referencia nueva', 'gtdNewReference', 'l', 'Crear'],
  ['GTD: capturar con una plantilla', 'gtdCapture', 'c', 'Crear'],
  ['GTD: ir a Inbox', 'gtdGoInbox', '1', 'Navegación'],
  ['GTD: ir a Next', 'gtdGoNext', '2', 'Navegación'],
  ['GTD: ir a Todo', 'gtdGoLater', '3', 'Navegación'],
  ['GTD: ir a Waiting', 'gtdGoWaiting', '4', 'Navegación'],
  ['GTD: ir a Scheduled', 'gtdGoScheduled', '5', 'Navegación'],
  ['GTD: ir a Someday', 'gtdGoSomeday', '6', 'Navegación'],
  ['GTD: ir a Focus', 'gtdGoFocus', '7', 'Navegación'],
  ['GTD: ir a Todos los proyectos', 'gtdGoProjects', '8', 'Navegación'],
  ['GTD: ir a Reference', 'gtdGoReference', '9', 'Navegación'],
  ['GTD: ir a Logbook', 'gtdGoLogbook', '0', 'Navegación'],
  ['GTD: lista anterior', 'gtdPrevList', '[', 'Navegación'],
  ['GTD: lista siguiente', 'gtdNextList', ']', 'Navegación'],
  ['GTD: todas las áreas', 'gtdAreaAll', 'shift+0', 'Áreas'],
  ['GTD: área siguiente', 'gtdAreaNext', 'shift+]', 'Áreas'],
  ['GTD: área anterior', 'gtdAreaPrev', 'shift+[', 'Áreas'],
  ['GTD: sin área', 'gtdAreaNone', 'shift+9', 'Áreas'],
  ['GTD: buscar', 'gtdSearch', '/', 'Más'],
  ['GTD: sincronizar', 'gtdSync', 'r', 'Más'],
  ['GTD: agenda', 'gtdAgenda', 'a', 'Más'],
  ['GTD: limpiar (archivar las terminadas)', 'gtdCleanup', 'shift+c', 'Más'],
  ['GTD: ajustes', 'gtdSettings', ',', 'Más'],
  ['GTD: manual', 'gtdManual', 'h', 'Más'],
  ['GTD: ventana de atajos', 'gtdShortcuts', 'k', 'Más'],
  ['GTD: ventana de atajos (otra tecla)', 'gtdShortcuts2', '?', 'Más'],
];

export const calculateGtdKeybindings = (customKeybindings) =>
  GTD_BINDINGS.map(([name, action, binding, group]) => ({
    name,
    action,
    group,
    binding: customKeybindings.get(name, binding),
  }));

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
  'Abrir la vista GTD': 'Cambiar entre Documentos y GTD',
};

export const keybindingLabel = (name) =>
  KEYBINDING_LABELS_ES[name] || String(name).replace(/^GTD: /, '');
