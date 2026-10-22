// ORG Mode para Eli (4.15): ajuste «Allen estricto» (Ajustes). Encendido (por defecto), los procesos
// guiados siguen solo lo oficial de David Allen (Revisión semanal, Procesar Inbox, Volcado mental sin
// el bloque «Extra»). Apagado, todo como antes. No toca los datos del fichero ni las listas de GTD.
export const LS_STRICT = 'eliGtdStrict';

export const strictOn = () => {
  try {
    return window.localStorage.getItem(LS_STRICT) !== 'false';
  } catch (e) {
    return true;
  }
};

export const setStrictOn = (on) => {
  try {
    window.localStorage.setItem(LS_STRICT, on ? 'true' : 'false');
  } catch (e) {
    // sin almacenamiento: se queda el de por defecto
  }
};

// (4.16) «Planificar el día» y «Cerrar el día» no son de Allen: con «Allen estricto» encendido solo
// se ven si se activan en su interruptor (apagado por defecto); con él apagado se ven siempre.
export const NOT_ALLEN_DAILY = { plan: 'eliGtdShowPlanDay', close: 'eliGtdShowCloseDay' };

export const dailyOptIn = (kind) => {
  try {
    return window.localStorage.getItem(NOT_ALLEN_DAILY[kind]) === 'true';
  } catch (e) {
    return false;
  }
};

export const setDailyOptIn = (kind, on) => {
  try {
    window.localStorage.setItem(NOT_ALLEN_DAILY[kind], on ? 'true' : 'false');
  } catch (e) {
    // sin almacenamiento
  }
};

// ¿Se ve este proceso diario en el Menú ☰ › Procesos?
export const dailyShown = (kind, strict = strictOn()) =>
  !NOT_ALLEN_DAILY[kind] || !strict || dailyOptIn(kind);
