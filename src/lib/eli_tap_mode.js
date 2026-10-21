// ORG Mode para Eli (3.07): qué hace un toque/clic en una tarea (GTD) o en una cabecera
// (Documentos), por separado en el móvil (dedo) y en el ordenador (ratón). Se guarda en este
// navegador.
const KEY = 'eliTapMode';

export const TAP_MODES = {
  'task-mobile': {
    label: 'Al tocar una tarea (móvil)',
    def: 'open',
    options: [
      { id: 'open', label: 'Abrirla' },
      { id: 'select', label: 'Seleccionarla' },
    ],
  },
  'task-desktop': {
    label: 'Al hacer clic en una tarea (ordenador)',
    def: 'auto',
    options: [
      { id: 'auto', label: 'Según dónde' },
      { id: 'open', label: 'Abrirla' },
      { id: 'select', label: 'Seleccionarla' },
    ],
  },
  // (4.11) toque en el TÍTULO de una cabecera de Documentos (la viñeta siempre pliega/despliega y,
  // arrastrándola, mueve). Por defecto (4.04): 1.er toque selecciona y el 2.º edita.
  header: {
    label: 'Al tocar el título de una cabecera',
    def: 'select',
    options: [
      { id: 'select', label: 'Seleccionar, luego editar' },
      { id: 'edit', label: 'Editar' },
      { id: 'open', label: 'Desplegar' },
    ],
  },
};

const readAll = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch (e) {
    return {};
  }
};

// (4.04) Solo para las pruebas jest de organice (window.testRunner): «un clic pliega/despliega» en
// las cabeceras, como en el organice original. En la app ya no hay ajuste.
export const legacyHeaderTapOpen = () => {
  try {
    return (
      (!!window.testRunner && readAll()['header-desktop'] === 'open') || readAll().header === 'open'
    );
  } catch (e) {
    return false;
  }
};

// (4.11) ajuste del toque en el título de las cabeceras: 'select' | 'edit' | 'open'
export const headerTapMode = () => getTapMode('header');

export const getTapMode = (which) => {
  const spec = TAP_MODES[which];
  const v = readAll()[which];
  return spec && spec.options.some((o) => o.id === v) ? v : spec ? spec.def : null;
};

export const setTapMode = (which, value) => {
  const all = readAll();
  all[which] = value;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch (e) {}
};

// ¿El toque viene de un dedo (móvil/tableta)? Por el tipo de puntero del evento y, si no lo
// trae, por el dispositivo.
export const isTouchEvent = (e) => {
  const t = e && ((e.nativeEvent && e.nativeEvent.pointerType) || e.pointerType);
  if (t) return t !== 'mouse';
  try {
    return !!window.matchMedia && window.matchMedia('(hover: none)').matches;
  } catch (err) {
    return false;
  }
};
