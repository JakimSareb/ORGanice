// ORG Mode para Eli: varias copias de la app abiertas a la vez (pantalla dividida u otra
// ventana). Cuando una guarda un fichero, avisa a las demás para que lo recarguen; así no se
// pisan los cambios.
const CHANNEL = 'eli-organice-files';
const instanceId = Math.random().toString(36).slice(2);
let channel = null;

const getChannel = () => {
  if (channel || typeof BroadcastChannel === 'undefined') return channel;
  try {
    channel = new BroadcastChannel(CHANNEL);
  } catch (e) {
    channel = null;
  }
  return channel;
};

export const announceSaved = (path) => {
  const ch = getChannel();
  if (!ch || !path) return;
  try {
    ch.postMessage({ type: 'saved', path, at: Date.now(), from: instanceId });
  } catch (e) {}
};

/**
 * Escucha los avisos de las otras copias. `onSaved(path, at)` se llama con cada fichero
 * guardado por otra copia.
 */
export const listenForSaves = (onSaved) => {
  const ch = getChannel();
  if (!ch) return () => {};
  const handler = (event) => {
    const msg = event && event.data;
    if (!msg || msg.type !== 'saved' || msg.from === instanceId || !msg.path) return;
    onSaved(msg.path, msg.at);
  };
  ch.addEventListener('message', handler);
  return () => ch.removeEventListener('message', handler);
};

export const isInsideSplitPane = () => {
  try {
    return window.self !== window.top && window.top.__eliSplitView === true;
  } catch (e) {
    return false;
  }
};
