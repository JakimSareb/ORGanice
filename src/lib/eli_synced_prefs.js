// ORG Mode para Eli (4.33): ajustes sincronizados entre dispositivos.
// Antes solo viajaban en `.organice-config.json` los ajustes «de organice» (Redux); los de la app
// (herramientas, Menú ☰, Diario, Pomodoro, Allen estricto, GTD…) se quedaban en el localStorage de
// cada dispositivo. Ahora:
// - Todo lo que la app guarda con nombre `eli…` viaja en el fichero (`eliPrefs`: { clave: { v, t } }),
//   salvo lo propio de cada dispositivo (LOCAL_KEYS: anchos, posición de etiquetas, Logseq, letra,
//   seguridad…) y el estado pasajero (vista abierta, plegados, últimos usados…).
// - Cada ajuste lleva su marca de tiempo (`eliStamps` para los de organice, `t` para los de la app).
//   Al leer el fichero se fusiona POR CLAVE: gana el cambio más reciente de cada ajuste, así un
//   dispositivo con ajustes viejos ya no pisa los nuevos de otro.
// Las marcas de este dispositivo se guardan en localStorage `eliPrefsStamps` ({ clave: ms }).

export const STAMPS_KEY = 'eliPrefsStamps';

// Propio de cada dispositivo (se dice en Ajustes › Sincronización)
export const LOCAL_KEYS = [
  { key: 'eliGtdTagGroupsFolded', label: 'Grupos de etiquetas plegados' },
  { key: 'eliWidth:', label: 'Anchos de los paneles', prefix: true },
  { key: 'eliDocMargin', label: 'Margen izquierdo de Documentos' },
  { key: 'eliEdgePad', label: 'Margen derecho al editar' },
  { key: 'eliTagsPos', label: 'Etiquetas al lado o debajo' },
  { key: 'eliLogseqEdit', label: 'Edición tipo Logseq' },
  { key: 'eliFont', label: 'Tipo de letra' },
  { key: 'eliFontGtd', label: 'Tipo de letra también en GTD' },
  { key: 'eliReadability', label: 'Legibilidad' },
  { key: 'eliTapMode', label: 'Toques (qué hace cada toque)' },
  { key: 'eliFormatBarOpen', label: 'Barra de formato abierta' },
  { key: 'eliDocLock', label: 'Bloqueo de edición' },
  { key: 'eliReminders', label: 'Avisos (permiso del navegador)' },
  { key: 'eliPersistPlainFiles', label: 'Copia sin conexión' },
  { key: 'eliOfflineEncrypted', label: 'Copia cifrada sin conexión' },
  { key: 'eliIdleLockMinutes', label: 'Bloqueo por inactividad' },
  { key: 'eliGpgPrivateKeys', label: 'Claves de cifrado' },
  { key: 'eliGpgPublicKeys', label: 'Claves de cifrado' },
  { key: 'eliDropboxClientId', label: 'Conexión con Dropbox' },
];

// Estado pasajero (no son ajustes): ni se sincroniza ni se lista
const STATE_KEYS = [
  STAMPS_KEY,
  // (4.41) nº de enlaces rotos del último escaneo (contador de Herramientas)
  'eliBrokenLinksCount',
  'eliSyncLog',
  'eliSyncLogSeen',
  'eliLastRoute',
  'eliLastDocRoute',
  'eliSplitView',
  'eliQuickCapture',
  'eliPomodoroState',
  'eliPaletteRecent',
  'eliRemindersFired',
  'eliGpgDefaultMode',
  'eliCapturePending',
  'eliGtdAutoA',
  'eliGtdView',
  'eliGtdArea',
  'eliGtdFolded',
  'eliGtdSepFolded',
  'eliGtdReview',
  'eliGtdDetails',
  'eliGtdDoneOpen',
  'eliGtdTagsOpen',
  'eliGtdProjectsOpen',
  'eliGtdTagHeadings',
  'eliCalView',
  'eliFountainNotes',
];
const STATE_PREFIXES = ['eliOffline', 'eliPending', 'eliCache'];

const isLocalPrefKey = (k) =>
  LOCAL_KEYS.some((l) => (l.prefix ? k.startsWith(l.key) : l.key === k));

// ¿Viaja esta clave de localStorage en `eliPrefs`? (`redux` = nombres que ya van como ajuste de
// organice, con su propia marca)
export const isSyncedKey = (k, redux = []) =>
  typeof k === 'string' &&
  /^eli[A-Z]/.test(k) &&
  !isLocalPrefKey(k) &&
  !STATE_KEYS.includes(k) &&
  !STATE_PREFIXES.some((p) => k.startsWith(p)) &&
  !redux.includes(k);

// Lectura y escritura directas (sin pasar por el vigilante de abajo)
let rawGet = (k) => {
  try {
    return window.localStorage.getItem(k);
  } catch (e) {
    return null;
  }
};
let rawSet = (k, v) => {
  try {
    window.localStorage.setItem(k, v);
  } catch (e) {}
};
let rawRemove = (k) => {
  try {
    window.localStorage.removeItem(k);
  } catch (e) {}
};

export const readStamps = () => {
  try {
    const v = JSON.parse(rawGet(STAMPS_KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch (e) {
    return {};
  }
};
export const writeStamps = (stamps) => rawSet(STAMPS_KEY, JSON.stringify(stamps || {}));

// Ajustes de la app de este dispositivo: { clave: { v, t } }
export const collectLocalPrefs = (redux = [], stamps = readStamps()) => {
  const out = {};
  let keys = [];
  try {
    keys = Object.keys(window.localStorage);
  } catch (e) {
    keys = [];
  }
  keys.forEach((k) => {
    if (!isSyncedKey(k, redux)) return;
    out[k] = { v: rawGet(k), t: stamps[k] || 0 };
  });
  // borrados (con marca, sin valor): también viajan, para que se borren en los demás
  Object.keys(stamps).forEach((k) => {
    if (!out[k] && isSyncedKey(k, redux) && !redux.includes(k))
      out[k] = { v: null, t: stamps[k] || 0 };
  });
  return out;
};

// Fusión por clave (pura). `remote` = el objeto del fichero; `localStamps` = marcas de aquí;
// `localPrefs` = collectLocalPrefs(); `fieldNames` = ajustes de organice.
// Devuelve qué ajustes de organice se toman del fichero, qué ajustes de la app se aplican y las
// marcas resultantes. Empate (p. ej. los dos sin marca): gana el fichero, como antes.
export const mergeSettings = ({ remote, localStamps = {}, localPrefs = {}, fieldNames = [] }) => {
  const r = remote && typeof remote === 'object' ? remote : {};
  const rStamps = r.eliStamps && typeof r.eliStamps === 'object' ? r.eliStamps : {};
  const stamps = { ...localStamps };
  const fieldsFromRemote = [];
  fieldNames.forEach((name) => {
    if (r[name] === undefined) return;
    const lt = localStamps[name] || 0;
    const rt = rStamps[name] || 0;
    if (lt > rt) return; // lo de aquí es más nuevo
    fieldsFromRemote.push(name);
    stamps[name] = rt;
  });
  const rPrefs = r.eliPrefs && typeof r.eliPrefs === 'object' ? r.eliPrefs : {};
  const prefsFromRemote = {};
  Object.keys(rPrefs).forEach((k) => {
    const rp = rPrefs[k];
    if (!rp || typeof rp !== 'object' || !isSyncedKey(k, fieldNames)) return;
    const rt = +rp.t || 0;
    const lp = localPrefs[k];
    const lt = lp ? +lp.t || 0 : localStamps[k] || 0;
    if (lt > rt) return;
    const rv = rp.v === undefined ? null : rp.v === null ? null : String(rp.v);
    if (!lp || lp.v !== rv) prefsFromRemote[k] = { v: rv, t: rt };
    stamps[k] = rt;
  });
  return { fieldsFromRemote, prefsFromRemote, stamps };
};

// ---- Vigilante: marca la hora de cada cambio de un ajuste de la app ----
let applying = false;
let ready = false;
let onChange = () => {};
let reduxNames = [];

// Mientras se aplican los ajustes llegados del fichero, no se marca nada como cambio de aquí
export const withRemoteApply = (fn) => {
  applying = true;
  try {
    return fn();
  } finally {
    applying = false;
  }
};
export const isApplyingRemote = () => applying;
export const setPrefsReady = (v = true) => {
  ready = !!v;
};

const stampKey = (k, before) => {
  const st = readStamps();
  // Antes de leer el fichero, un valor que se escribe por primera vez (p. ej. un valor por
  // defecto) no cuenta como cambio más nuevo que el del otro dispositivo
  st[k] = !ready && before === null ? 1 : Date.now();
  writeStamps(st);
  onChange(k);
};

export const installPrefsWatcher = ({ redux = [], changed } = {}) => {
  reduxNames = redux;
  if (changed) onChange = changed;
  if (typeof window === 'undefined' || !window.localStorage) return;
  const ls = window.localStorage;
  const proto = Object.getPrototypeOf(ls);
  if (!proto || proto.__eliPrefsWatched) return;
  const origSet = proto.setItem;
  const origGet = proto.getItem;
  const origRemove = proto.removeItem;
  rawGet = (k) => {
    try {
      return origGet.call(ls, k);
    } catch (e) {
      return null;
    }
  };
  rawSet = (k, v) => {
    try {
      origSet.call(ls, k, v);
    } catch (e) {}
  };
  rawRemove = (k) => {
    try {
      origRemove.call(ls, k);
    } catch (e) {}
  };
  proto.setItem = function (k, v) {
    if (this !== ls || applying || !isSyncedKey(k, reduxNames)) return origSet.call(this, k, v);
    const before = origGet.call(this, k);
    const out = origSet.call(this, k, v);
    if (before !== String(v)) {
      try {
        stampKey(k, before);
      } catch (e) {}
    }
    return out;
  };
  proto.removeItem = function (k) {
    if (this !== ls || applying || !isSyncedKey(k, reduxNames)) return origRemove.call(this, k);
    const before = origGet.call(this, k);
    const out = origRemove.call(this, k);
    if (before !== null) {
      try {
        stampKey(k, before);
      } catch (e) {}
    }
    return out;
  };
  proto.__eliPrefsWatched = true;
};

// Aplica los ajustes de la app llegados del fichero. Devuelve cuántos han cambiado.
export const applyRemotePrefs = (prefs) => {
  let n = 0;
  withRemoteApply(() => {
    Object.keys(prefs || {}).forEach((k) => {
      const { v } = prefs[k];
      if (v === null) {
        if (rawGet(k) !== null) n++;
        rawRemove(k);
      } else if (rawGet(k) !== v) {
        rawSet(k, v);
        n++;
      }
    });
  });
  if (n) {
    try {
      window.dispatchEvent(new CustomEvent('eli:prefs-applied'));
    } catch (e) {}
  }
  return n;
};

// JSON con las claves ordenadas (para comparar el fichero con lo de aquí sin mirar el orden)
export const canonical = (obj) => {
  const sort = (x) => {
    if (Array.isArray(x)) return x.map(sort);
    if (x && typeof x === 'object')
      return Object.keys(x)
        .sort()
        .reduce((o, k) => {
          o[k] = sort(x[k]);
          return o;
        }, {});
    return x;
  };
  return JSON.stringify(sort(obj));
};
