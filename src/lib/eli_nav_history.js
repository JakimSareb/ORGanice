// ORG Mode para Eli (2.15): botones Atrás / Adelante de la barra. El navegador no dice si se
// puede ir hacia delante, así que se lleva la cuenta aquí con las claves de las entradas del
// historial (location.key) de React Router.
let keys = [];
let index = -1;
let installed = null;

const notify = () => {
  try {
    window.dispatchEvent(new CustomEvent('eli:nav-history'));
  } catch (e) {}
};

export const installNavHistory = (history) => {
  if (!history || installed === history) return;
  installed = history;
  keys = [history.location.key || 'inicio'];
  index = 0;
  history.listen((location, action) => {
    // La primera entrada del historial no tiene clave
    const key = location.key || 'inicio';
    if (action === 'PUSH') {
      keys = [...keys.slice(0, index + 1), key];
      index = keys.length - 1;
    } else if (action === 'REPLACE') {
      keys[index] = key;
    } else {
      const i = keys.indexOf(key);
      if (i >= 0) index = i;
    }
    notify();
  });
  notify();
};

export const canGoBack = () => index > 0;
export const canGoForward = () => index >= 0 && index < keys.length - 1;
