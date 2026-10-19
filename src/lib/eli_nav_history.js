// ORG Mode para Eli (2.15): botones Atrás / Adelante de la barra. El navegador no dice si se
// puede ir hacia delante, así que se lleva la cuenta aquí con las claves de las entradas del
// historial (location.key) de React Router.
// 3.28: historial separado por zona: GTD (/gtd…) y Documentos (todo lo demás: ficheros,
// carpetas, guiones). Atrás/Adelante saltan solo entre entradas de la zona en la que se está.
let entries = []; // { key, area }
let index = -1;
let installed = null;

export const areaOf = (pathname) => (/^\/gtd(\/|$)/.test(pathname || '') ? 'gtd' : 'docs');

const notify = () => {
  try {
    window.dispatchEvent(new CustomEvent('eli:nav-history'));
  } catch (e) {}
};

const entryFor = (location) => ({
  // La primera entrada del historial no tiene clave
  key: location.key || 'inicio',
  area: areaOf(location.pathname),
});

export const installNavHistory = (history) => {
  if (!history || installed === history) return;
  installed = history;
  entries = [entryFor(history.location)];
  index = 0;
  history.listen((location, action) => {
    const entry = entryFor(location);
    if (action === 'PUSH') {
      entries = [...entries.slice(0, index + 1), entry];
      index = entries.length - 1;
    } else if (action === 'REPLACE') {
      entries[index] = entry;
    } else {
      const i = entries.findIndex((e) => e.key === entry.key);
      if (i >= 0) index = i;
    }
    notify();
  });
  notify();
};

// Posición (relativa a la actual) de la entrada anterior/siguiente de la misma zona; 0 = no hay
const targetDelta = (dir) => {
  if (index < 0 || !entries[index]) return 0;
  const area = entries[index].area;
  for (let i = index + dir; i >= 0 && i < entries.length; i += dir) {
    if (entries[i].area === area) return i - index;
  }
  return 0;
};

export const canGoBack = () => targetDelta(-1) !== 0;
export const canGoForward = () => targetDelta(1) !== 0;

export const goBack = (history) => {
  const d = targetDelta(-1);
  if (d) history.go(d);
};

export const goForward = (history) => {
  const d = targetDelta(1);
  if (d) history.go(d);
};
