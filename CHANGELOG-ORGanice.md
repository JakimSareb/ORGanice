# ORGanice – historial de versiones

## 1.0 (septiembre de 2026)

Primera versión estable de ORGanice (ORG Mode para Eli), basada en organice (commit eedd30c).

**Ficheros y Dropbox**
- Conexión con Dropbox por OAuth PKCE; ficheros principales (reordenables); crear ficheros;
  copias en `backups/`; uso sin conexión con sincronización al volver la red.
- Cifrado GPG compatible con Emacs: ficheros `.gpg`/`.asc` y cabeceras `:crypt:`.
- Seguridad: política CSP estricta, bloqueo por inactividad, sin copia local en claro.

**Edición**
- Editor de texto plano (fichero o encabezado) con SCHEDULED, DEADLINE, fecha inactiva, adjuntar,
  enlaces y Narrow/Widen. Narrow/Widen también en la barra superior.
- Adjuntos e imágenes en `assets/<año>/` (pegar, renombrar, cuatro tamaños); YouTube.
- Enlaces `[[enlace][descripción]]` desde el portapapeles.
- Prioridad [#A], etiquetas de `#+TAGS:`, CLOSED al terminar tareas, archivar como Emacs,
  refile a cualquier fichero (también al nivel superior), borrar con confirmación.
- Exportar a PDF (fichero o encabezado).

**Agenda y búsqueda**
- Agenda con vencidas, prioritarias, Log (CLOSED), contextos GTD (@) y estados; también desde el
  explorador de ficheros; la tarea pulsada queda centrada.
- Búsqueda por Tareas/Encabezados/Texto con fragmentos y salto al texto exacto; «Solo esta hoja».

**Captura**
- Plantillas de captura (tocar fuera o Esc guarda; Cancel descarta).
- Captura rápida desde el iPhone (Atajos) o un marcador, con App key por entorno.

**Teclado** (configurable en Keyboard shortcuts)
- Esc, a (agenda), f (ficheros principales), c (captura), s (sincronizar), m (mover),
  b (buscar), ↑/↓ e Intro por encabezados y menús, además de los atajos de organice.

**Otros**
- Fases de la Luna, logo propio, nombre del fichero en la cabecera, avisos de error legibles.
