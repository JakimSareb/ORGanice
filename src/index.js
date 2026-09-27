/* global module */

import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import './fontawesome.css';
import App from './App';
import EliSplitView from './components/EliSplitView';
import { BASE_PATH } from './lib/base_path';
import { registerServiceWorker } from './lib/eli_offline';
import { initOfflineStore } from './lib/eli_offline_store';
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
Promise.race([initOfflineStore(), new Promise((resolve) => setTimeout(resolve, 2500))]).then(
  render,
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
