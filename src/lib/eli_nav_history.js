// ORG Mode para Eli (2.15): botones Atrás / Adelante de la barra. El navegador no dice si se
// puede ir hacia delante, así que se lleva la cuenta aquí con las claves de las entradas del
// historial (location.key) de React Router.
// 3.28: historial separado por zona: GTD (/gtd…) y Documentos (todo lo demás: ficheros,
// carpetas, guiones). Atrás/Adelante saltan solo entre entradas de la zona en la que se está.
// 3.30: la lista se guarda en sessionStorage (sobrevive a recargar la página) y, si al volver
// atrás con el navegador sale una entrada desconocida, se empieza de cero en vez de saltar mal.
let entries = []; // { key, area }
let index = -1;
let installed = null;
let restorer = null; // (4.37) restaura la vista (fichero + cabecera reducida) de una entrada
const SS_KEY = 'eliNavHistory';

const save = () => {
  try {
    window.sessionStorage.setItem(SS_KEY, JSON.stringify({ entries, index }));
  } catch (e) {}
};
const load = () => {
  try {
    const v = JSON.parse(window.sessionStorage.getItem(SS_KEY) || 'null');
    if (v && Array.isArray(v.entries)) return v;
  } catch (e) {}
  return null;
};

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
  const first = entryFor(history.location);
  const saved = first.key !== 'inicio' ? load() : null;
  const at = saved ? saved.entries.findIndex((e) => e.key === first.key) : -1;
  if (at >= 0) {
    entries = saved.entries;
    entries[at] = first;
    index = at;
  } else {
    entries = [first];
    index = 0;
  }
  save();
  history.listen((location, action) => {
    const entry = entryFor(location);
    if (action === 'PUSH') {
      entries = [...entries.slice(0, index + 1), entry];
      index = entries.length - 1;
    } else if (action === 'REPLACE') {
      entries[index] = { ...entry, view: entries[index] && entries[index].view };
    } else {
      // Se busca primero cerca de la posición actual (la clave 'inicio' puede repetirse)
      let i = -1;
      let best = Infinity;
      entries.forEach((e, j) => {
        if (e.key === entry.key && Math.abs(j - index) < best) {
          best = Math.abs(j - index);
          i = j;
        }
      });
      if (i >= 0) {
        index = i;
        entries[i] = { ...entry, view: entries[i].view };
        // (4.37) atrás/adelante entre saltos por enlace: se restaura la cabecera reducida
        if (entries[i].view && restorer) {
          const v = entries[i].view;
          setTimeout(() => restorer(v), 0);
        }
      } else {
        entries = [entry];
        index = 0;
      }
    }
    save();
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

// --- (4.37) Saltos por enlace dentro de un mismo fichero ---
// El historial del navegador solo conoce la ruta; seguir un enlace a otra cabecera del MISMO
// fichero (o abrirla desde Backlinks) no cambiaba la ruta y «atrás» no volvía. Ahora cada salto
// guarda en su entrada la vista { path, narrowId } y atrás/adelante la restauran.
export const setViewRestorer = (fn) => {
  restorer = fn;
};

// Guarda la vista actual en la entrada de historial en curso
export const markView = (view) => {
  if (entries[index] && view) {
    entries[index].view = view;
    save();
  }
};

// Empuja una entrada nueva (aunque la ruta sea la misma) con la vista de destino.
// Devuelve false si el historial aún no está instalado (pruebas): el llamador navega como antes.
export const pushView = (pathname, view) => {
  if (!installed) return false;
  installed.push(pathname);
  markView(view);
  return true;
};

export const sameView = (a, b) =>
  !!a && !!b && a.path === b.path && (a.narrowId || null) === (b.narrowId || null);
