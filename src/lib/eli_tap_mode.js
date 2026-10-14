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
  'header-mobile': {
    label: 'Al tocar una cabecera (móvil)',
    def: 'select',
    options: [
      { id: 'select', label: 'Seleccionarla' },
      { id: 'open', label: 'Plegar / desplegar' },
    ],
  },
  'header-desktop': {
    label: 'Al hacer clic en una cabecera (ordenador)',
    def: 'select',
    options: [
      { id: 'select', label: 'Seleccionarla' },
      { id: 'open', label: 'Plegar / desplegar' },
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
