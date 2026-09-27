/* global module */

import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import './fontawesome.css';
import App from './App';
import EliSplitView from './components/EliSplitView';
import { BASE_PATH } from './lib/base_path';
import { registerServiceWorker } from './lib/eli_offline';
import { initOfflineStore, isOfflineStoreReady } from './lib/eli_offline_store';
import { flushLocalSaves } from './util/file_persister';

const rootElement = document.getElementById('root');

// ORG Mode para Eli: /split es la pantalla dividida (dos copias de la app en marcos)
const isSplitView = () => {
  const path = window.location.pathname.replace(/\/+$/, '');
  return path === `${BASE_PATH}/split` && window.self === window.top;
};

function render() {
  ReactDOM.render(isSplitView() ? <EliSplitView /> : <App />, rootElement);
}

// ORG Mode para Eli (2.12): antes de arrancar, cargar lo guardado en el dispositivo (IndexedDB)
// para usar la app sin conexión. Si tarda demasiado, se arranca igualmente.
let storeWait = null;
const storeReady = initOfflineStore();
Promise.race([storeReady, new Promise((resolve) => (storeWait = setTimeout(resolve, 20000)))]).then(
  () => {
    clearTimeout(storeWait);
    const timedOut = !isOfflineStoreReady();
    if (!timedOut) {
      try {
        window.sessionStorage.removeItem('eliStoreReload');
      } catch (e) {}
    }
    render();
    // Si el almacén llega tarde (a veces en el iPhone), se recarga una vez para no trabajar sin
    // la copia local (y no escribir encima de ella)
    if (timedOut) {
      storeReady.then((ok) => {
        let already = false;
        try {
          already = window.sessionStorage.getItem('eliStoreReload') === '1';
          window.sessionStorage.setItem('eliStoreReload', '1');
        } catch (e) {}
        if (!ok || already) return;
        // Antes de recargar se guarda lo pendiente; si se está escribiendo, se espera a que la
        // app pase a segundo plano
        const reload = () => {
          flushLocalSaves();
          setTimeout(() => window.location.reload(), 300);
        };
        const active = document.activeElement;
        const typing =
          active && (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName));
        if (!typing) reload();
        else {
          const onHide = () => {
            if (document.visibilityState !== 'hidden') return;
            document.removeEventListener('visibilitychange', onHide);
            reload();
          };
          document.addEventListener('visibilitychange', onHide);
        }
      });
    }
  },
  render
);

// ORG Mode para Eli: uso sin conexión
registerServiceWorker();

// Al pasar a segundo plano, guardar ya en el dispositivo lo pendiente (el iPhone puede cerrar la
// app después sin avisar)
const flushSaves = () => {
  if (document.visibilityState === 'hidden') flushLocalSaves();
};
document.addEventListener('visibilitychange', flushSaves);
window.addEventListener('pagehide', () => flushLocalSaves());

// Remove Parcel error overlay for e2e testing
// See: https://github.com/parcel-bundler/parcel/issues/9738
// The overlay intercepts pointer events when running e2e tests after jest
if (typeof window !== 'undefined') {
  const removeParcelErrorOverlay = () => {
    const overlay = document.querySelector('parcel-error-overlay');
    if (overlay) {
      overlay.remove();
    }
  };

  // Remove immediately
  removeParcelErrorOverlay();

  // Watch for overlay being added
  const observer = new MutationObserver(() => {
    removeParcelErrorOverlay();
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

// Enable Hot Module Replacement (full reload for ES modules)
if (module.hot) {
  module.hot.accept();
}
