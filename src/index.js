/* global module */

import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import './fontawesome.css';
import App from './App';
import EliSplitView from './components/EliSplitView';
import { BASE_PATH } from './lib/base_path';
import { registerServiceWorker } from './lib/eli_offline';

const rootElement = document.getElementById('root');

// ORG Mode para Eli: /split es la pantalla dividida (dos copias de la app en marcos)
const isSplitView = () => {
  const path = window.location.pathname.replace(/\/+$/, '');
  return path === `${BASE_PATH}/split` && window.self === window.top;
};

function render() {
  ReactDOM.render(isSplitView() ? <EliSplitView /> : <App />, rootElement);
}

render();

// ORG Mode para Eli: uso sin conexión
registerServiceWorker();

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
