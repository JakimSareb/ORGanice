/* global process */
// ORG Mode para Eli: registro del service worker (uso sin conexión) y aviso de versión nueva.
import { BASE_PATH } from './base_path';

export const registerServiceWorker = () => {
  if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker
    .register(new URL('../../public/service-worker.js', import.meta.url), {
      type: 'module',
      scope: `${BASE_PATH}/`,
    })
    .then((registration) => {
      // Al publicarse una versión nueva, se instala en segundo plano y se avisa
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && hadController) showUpdateBanner(worker);
        });
      });
    })
    .catch((e) => console.warn('No se pudo registrar el service worker', e));
};

const showUpdateBanner = (worker) => {
  if (document.getElementById('eli-update-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'eli-update-banner';
  banner.className = 'eli-update-banner';
  banner.innerHTML =
    '<span>Hay una versión nueva de la app.</span> <button type="button" class="btn">Actualizar</button>';
  banner.querySelector('button').addEventListener('click', () => {
    worker.postMessage({ type: 'SKIP_WAITING' });
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload());
    setTimeout(() => window.location.reload(), 1500);
  });
  document.body.appendChild(banner);
};
