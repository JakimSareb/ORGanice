// ORG Mode para Eli (4.15): «Allen estricto». (4.60) Ya no es un ajuste: los procesos guiados SIEMPRE
// siguen solo lo oficial de David Allen (Revisión semanal, Procesar Inbox, Volcado mental). No toca
// los datos del fichero ni las listas de GTD.
export const LS_STRICT = 'eliGtdStrict';

// (4.60) Solo existe «Allen estricto»: el ajuste se quitó y un valor guardado antiguo se ignora
export const strictOn = () => true;

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
export const dailyShown = (kind) => !NOT_ALLEN_DAILY[kind] || dailyOptIn(kind);
