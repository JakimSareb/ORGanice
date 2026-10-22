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
