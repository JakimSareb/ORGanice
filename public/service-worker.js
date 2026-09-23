/* global clients */
// ORG Mode para Eli: permite abrir la app sin conexión.
// Guarda en caché los ficheros de la propia app (no tus notas: esas dependen de la opción
// "copia local" de Ajustes → Seguridad y cifrado). Las peticiones a Dropbox no pasan por aquí.

import { manifest, version } from '@parcel/service-worker';

const scope = self.registration.scope; // p. ej. https://usuario.github.io/ORGanice/
const indexUrl = new URL('index.html', scope).href;

addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(version)
      // Sin duplicados: addAll falla si la lista repite una URL
      .then((cache) =>
        cache.addAll(
          Array.from(new Set([...manifest, indexUrl].map((u) => new URL(u, scope).href)))
        )
      )
  );
});

addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      clients.claim(),
      caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== version).map((k) => caches.delete(k)))),
    ])
  );
});

addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Dropbox, YouTube…: siempre red

  // Navegación (p. ej. /ORGanice/file/Notas/gtd.org): red primero; sin red, la app en caché
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(indexUrl).then((r) => r || Response.error()))
    );
    return;
  }

  // Ficheros de la app (con hash en el nombre): caché primero
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
});

addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
