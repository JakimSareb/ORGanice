# ORGanice – historial de versiones

## 1.2 (septiembre de 2026)

- **Vista GTD al estilo de Nirvana** (botón de la barra superior y, en el explorador, junto a la
  agenda): menú lateral con Agenda, Focus, Inbox, Next, Later, Waiting, Scheduled, Deadline,
  Someday, Proyectos, Reference y Logbook, con contadores; selector
  de áreas y búsqueda; a la derecha las tareas con filtros (etiquetas/contextos, energía, tiempo,
  con fecha). Añadir, completar (con CLOSED), ★ Focus, editar en línea (lista, fechas, área,
  proyecto, energía, tiempo, etiquetas, notas), mover a un proyecto, borrar, abrir en su fichero,
  deshacer/rehacer. Guarda en Org estándar: estados, `[#A]`, `SCHEDULED`/`DEADLINE`, `:AREA:`,
  `:ENERGY:`, `:EFFORT:`. En el móvil el menú se despliega con ☰.
- En la vista GTD: la lista Later se llama **Todo**; Focus no muestra los hábitos
  (`:STYLE: habit`); las tareas nuevas van a `tasks.org` (las de Inbox, a `inbox.org`); el cuadro
  de notas del editor es 4 veces más alto y sus casillas `- [ ]`/`+ [ ]` se marcan con un clic;
  «Abrir en el fichero» abre la tarea o el proyecto con la vista reducida (narrow).
- La agenda también abre la tarea pulsada con la vista reducida (narrow).
- **Conflictos de sincronización**: aviso propio (en cualquier pantalla) que dice qué fichero, y
  deja quedarse con la versión propia, con la de Dropbox/carpeta, o ver las diferencias y elegir
  cambio a cambio (la mía, la otra o las dos). Si las dos versiones son iguales, no pregunta.
- **Sangría como Emacs** (`org-adapt-indentation nil`): SCHEDULED, DEADLINE, CLOSED y los cajones
  se escriben pegados al margen, así no aparecen diferencias falsas con Emacs. Para el estilo
  antiguo: Ajustes → «Sangrar como el Emacs antiguo».
- Vista GTD: las tareas programadas para más adelante (sin fecha límite) solo se ven en Scheduled;
  las que tienen DEADLINE se ven siempre en su lista y, agrupadas, en Deadline; al llegar su
  fecha (SCHEDULED o DEADLINE) vuelven a su lista y reciben ★ [#A] automáticamente (una vez; si
  se quita a mano no vuelve; los hábitos no). Inbox = etiqueta **@inbox** (además de los
  encabezados sin estado del fichero de entrada); al procesarla se quita @inbox. En el editor:
  contextos de #+TAGS para marcar con un clic y enlaces de las notas que se pueden abrir.
- Ficheros sin línea `#+TODO`: se usan los estados de Emacs del usuario (`NEXT TODO MAYBE WAITING
  PROJECT | DONE CANCELLED`), como hace Emacs. Si un fichero declara su propio #+TODO sin un
  estado, la vista GTD no lo escribe y avisa (antes se estropeaba el título).
- Al abrir una tarea o proyecto en narrow (desde GTD o la agenda) se ve con todo desplegado.
- Al arrancar, una descarga que termina tarde ya no pisa cambios hechos mientras tanto.
- Atajo **g**: abre la vista GTD (desde la hoja y el explorador; configurable).
- Estrella (prioridad [#A]) al principio del editor de título, también en «Edit full title».
- - **Adjuntos al borrar**: si el encabezado borrado tiene adjuntos, la app pregunta uno a uno si se
  borran también (avisa si otro encabezado los usa; «Conservar» es la opción por defecto).

## 1.1 (septiembre de 2026)

- **Carpeta local del ordenador** en lugar de Dropbox (pantalla de acceso → «Elegir carpeta…»).
  Edge o Chrome de ordenador (File System Access API). Los ficheros no salen del ordenador; todo
  funciona igual: explorador y subcarpetas, agenda, búsqueda, refile, cifrado, adjuntos en
  `assets/<año>/`, copias en `backups/`, ajustes en `.organice-config.json`. Si el navegador vuelve
  a pedir permiso, la app muestra un botón «Permitir acceso». Para cambiar a Dropbox: Ajustes →
  Sign out.

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
