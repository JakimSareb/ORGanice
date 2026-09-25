# ORGanice 1.0

*ORG Mode para Eli.* Versión propia de [organice](https://github.com/200ok-ch/organice) (Org Mode en el navegador,
sin Emacs): lee y escribe tus ficheros `.org` directamente en **Dropbox**, desde el Mac, Windows
o el iPhone. Conserva toda la funcionalidad de organice y añade:

- **Búsqueda con ámbito**: *Tareas* (solo encabezados con TODO/DONE…), *Encabezados* (título) o
  *Texto* (título + contenido). En *Texto*, debajo de cada resultado se ven las líneas donde
  aparece lo buscado; al pulsar una, la app abre el encabezado, va a ese punto y lo resalta.
- **Agenda con vencidas**: el día de hoy muestra las tareas abiertas cuyo SCHEDULED o DEADLINE ya
  pasó y cuántos días llevan vencidas.
- **Ficheros principales**: botón de hojas en la barra inferior (también en el explorador) para
  abrir con un toque los ficheros que elijas. Se marcan desde el propio botón, con el icono de hojas
  del explorador o en Ajustes → File settings. Se guardan con los ajustes de organice
  (sincronizables vía Dropbox con «Store settings in sync backend»).
- **Prioridad**: estrella en los iconos del encabezado para marcar/desmarcar `[#A]` (se ve como ★
  amarilla); la agenda muestra arriba del todo las tareas abiertas con prioridad.
- **Archivar** como `org-archive-subtree` de Emacs (icono de archivador, pide confirmación): mueve el
  encabezado y sus hijos a `<fichero>_archive` (o al destino de `#+ARCHIVE:` / propiedad
  `ARCHIVE`), con las propiedades ARCHIVE_TIME, ARCHIVE_FILE, ARCHIVE_OLPATH, ARCHIVE_CATEGORY,
  ARCHIVE_TODO y ARCHIVE_ITAGS. Si el fichero está cifrado, el archivo también.
- **Pegar archivos**: al pegar una imagen o un fichero se abre un diálogo de confirmación donde
  se puede cambiar el nombre (se propone el actual; la extensión se conserva); las
  imágenes se pueden subir en tamaño pequeño (800 px), mediano (1600 px), grande (2560 px) u
  original, viendo el peso de cada opción. También con el clip 📎 (en los iconos del encabezado,
  en la barra de la ventana de edición y en el editor de texto plano).
- **Nombre del fichero en la cabecera**: dentro de un fichero se ve su nombre arriba (con 🔒 si
  está cifrado) y en la pestaña del navegador.
- **Agenda con Log**: botón *Log* que muestra u oculta las tareas terminadas en el día de su
  `CLOSED:` (como la tecla `l` de org-agenda).
- **Fecha inactiva**: icono que añade `[AAAA-MM-DD Día]` de hoy; en la ventana de edición del
  título o la descripción se inserta donde está el cursor.
- **Fases de la Luna**: botón 🌙 en la barra superior, como `M-x lunar-phases` de Emacs.
- **Sin conexión**: la app abre sin red (service worker); un indicador rosa arriba a la derecha
  avisa y, al volver la conexión, se sincroniza sola. Para editar ficheros sin conexión entre
  sesiones, activa la copia local en Ajustes → Seguridad y cifrado.
- **Copias de seguridad** en la subcarpeta `backups/` de cada carpeta.
- **Filtro por estado**: TODO, NEXT, WAITING, MAYBE, PROJECT (en Buscar, Lista de tareas y Agenda),
  combinable con los contextos. Los estados deben estar declarados en el fichero, p. ej.
  `#+TODO: TODO NEXT WAITING MAYBE PROJECT | DONE`.
- **YouTube**: los enlaces a vídeos de YouTube muestran un reproductor de 300 px (modo de
  privacidad mejorada, youtube-nocookie.com).
- **Contextos GTD**: botones de filtro generados desde las líneas `#+TAGS:` de tus ficheros
  (en los filtros solo aparecen las etiquetas que empiezan por `@` presentes en tareas abiertas).
  El editor de etiquetas muestra aparte las declaradas en `#+TAGS:` (del fichero abierto y de
  los demás ficheros cargados) y después el resto de etiquetas usadas. En Buscar,
  Lista de tareas y Agenda. Solo se muestran los contextos y estados presentes con los filtros
  actuales; varios contextos seleccionados deben cumplirse a la vez. Respeta la herencia de
  etiquetas.
- **Imágenes y multimedia desde Dropbox**: los enlaces Org a imágenes (`[[file:assets/2026/foto.jpg]]`,
  `[[./assets/2026/foto.jpg][Descripción]]`) se ven dentro de la nota (miniatura generada por
  Dropbox; al pulsar se abre el original). Vídeo y audio con reproductor; PDF y otros ficheros se
  abren al pulsar. Botón 📎 en cada encabezado para subir fotos, vídeos o archivos a
  `assets/<año>/` (junto al fichero `.org`) e insertar el enlace. Nunca sobrescribe: si el nombre
  existe, Dropbox lo renombra.
- **Editar como texto plano**: botón ≡ en la barra superior; edita el fichero abierto tal cual,
  como en un búfer de Emacs (⌘/Ctrl+S guarda, Esc cancela). Si hay un encabezado en modo
  *narrow*, edita solo ese encabezado con sus subencabezados y lo vuelve a colocar en su sitio
  (comprueba que conserve su nivel; si lo vacías, pregunta antes de eliminarlo). Botones:
  SCHEDULED y DEADLINE (en el encabezado donde está el cursor), fecha inactiva, Adjuntar y
  Narrow/Widen (enfocar el encabezado del cursor o volver al fichero entero).
- **Exportar a PDF**: botón PDF en la barra superior (fichero entero) o en cada encabezado (ese
  encabezado con sus subencabezados). Abre una vista previa → *PDF / Imprimir* → *Guardar como
  PDF* (en el iPhone: compartir → *Guardar en Archivos*). Incluye imágenes, tablas y listas; las
  cabeceras `:crypt:` aún cifradas salen como «[contenido cifrado]».
- **Cifrado GPG** compatible con GnuPG y Emacs: ficheros `*.org.gpg` / `*.org.asc` y cabeceras
  `:crypt:` (org-crypt); simétrico o con clave pública/privada.
- **Refile a un fichero**: además de debajo de un encabezado, se puede mover al nivel superior
  (al final) de cualquier fichero: los cargados aparecen arriba y *Otro fichero de Dropbox…*
  lista todos los `.org` (sin `backups/`).
- **Enlaces**: botón 🔗 al editar el título, la descripción o una nota (y en el texto plano):
  pega el enlace del portapapeles y pide la descripción → `[[enlace][descripción]]`.
- **Agenda** también desde el explorador de ficheros; Escape la cierra; al pulsar una tarea se
  abre su fichero con la tarea centrada en pantalla.
- **CLOSED al terminar**: al pasar una tarea a un estado terminado (DONE, CANCELLED…) se añade
  `CLOSED: [fecha hora]`, y se quita si se reabre (como `org-log-done 'time`). Los estados
  también se ofrecen en «Edit full title».
- **Atajos de teclado** (configurables en Ajustes → Keyboard shortcuts): Esc cierra la ventana de
  edición del encabezado, `a` agenda, `f` ficheros principales, `c` + letra de la plantilla para
  capturar, `s` sincronizar, `m` flechas de mover, `b` buscar (Esc cierra). No actúan mientras se
  escribe. `a`, `f` y `c` también en el explorador de ficheros. Flechas ↑/↓ para moverse por los
  encabezados e Intro para abrirlos/cerrarlos; en los menús de ficheros principales y de captura,
  ↑/↓ e Intro.
- **Capturas**: tocar fuera o Esc guardan la captura (si tiene título); el botón *Cancel* la
  descarta.
- **Buscar solo en esta hoja**: botón en la búsqueda.
- **Borrar encabezados con confirmación** (tecla Retroceso, papelera o deslizar a la izquierda).
- **Narrow/Widen** siempre en la barra superior (actúa sobre el encabezado seleccionado).
- **Seguridad reforzada** (ver abajo).

App publicada: **https://jakimsareb.github.io/ORGanice/**

## Puesta en marcha

### 1. Crear tu app de Dropbox (una sola vez)

1. <https://www.dropbox.com/developers/apps> → **Create app**.
2. *Scoped access* → **App folder** (recomendado: la app solo ve su carpeta
   `Dropbox/Aplicaciones/<nombre>`; guarda allí tus `.org`). *Full Dropbox* también funciona, pero
   da acceso a todo tu Dropbox.
3. **Permissions**: marca `files.metadata.read`, `files.content.read`, `files.content.write` →
   **Submit**.
4. **Settings**:
   - *Allow public clients (Implicit Grant & PKCE)*: **Allow**.
   - *OAuth2 → Redirect URIs*: añade
     - `https://jakimsareb.github.io/ORGanice/`
     - `http://localhost:3000/ORGanice/` (solo si también la usarás en local en el Mac)
   - Copia la **App key** (es pública por diseño; no hay ningún secreto).

### 2. Abrir e instalar la app

- **iPhone**: Safari → abre la dirección → Compartir → *Añadir a pantalla de inicio*.
- **Mac**: Safari → Archivo → *Añadir al Dock*; o Edge → *Aplicaciones → Instalar esta aplicación*.
- **Windows**: Edge → *Aplicaciones → Instalar esta aplicación*.

### 3. Conectar con Dropbox

*Sign in* → escribe la App key → logo de Dropbox → autoriza. Cada dispositivo se conecta por
separado.

### Uso local en el Mac (opcional, sin GitHub)

En la carpeta `eli/` del paquete descargable: doble clic en `Arrancar (Mac).command` →
`http://localhost:3000/ORGanice/`.

## Captura rápida desde el iPhone (menú Compartir)

Página `capture.html`: recibe un enlace, se conecta al Dropbox de la **App key que va en el propio
enlace** (cada App key es un entorno independiente, con su propio permiso en el navegador) y
añade una entrada usando la plantilla de captura de organice guardada en `.organice-config.json`
de ese entorno (`t=INBOX`, por nombre o letra). Parámetros: `k` App key · `t` plantilla ·
`f` fichero (opcional) · `url` · `title` · `text` · `auto=1` (guardar sin preguntar).

1. En cada app de Dropbox → Settings → *Redirect URIs*, añade
   `https://jakimsareb.github.io/ORGanice/capture.html`.
2. Ajustes → *Captura rápida* genera la dirección para el Atajo y un marcador para el ordenador.
3. Atajo de iOS «Enviar a ORGanice» (Mostrar en hoja de compartir; URL y páginas de Safari):
   *Obtener detalles de páginas web de Safari* (URL y Nombre) → *Codificar URL* de cada uno →
   *Texto* `https://jakimsareb.github.io/ORGanice/capture.html?k=APPKEY&t=INBOX&url=…&title=…` →
   *Abrir URLs*. Para dos entornos, *Elegir del menú* con una dirección (App key) por opción.

La primera vez en cada navegador pide conectar con Dropbox. Los ficheros `.gpg`/`.asc` también
funcionan (pide la frase de paso).

## Seguridad

**Dónde está cada cosa**

| Sitio | Qué contiene |
|---|---|
| GitHub (este repositorio y la web) | Solo el código de la app. Ningún dato, clave ni credencial. |
| Tu navegador, en cada dispositivo | Permiso de acceso a Dropbox, claves GPG (cifradas con su frase), ajustes. Los ficheros sin cifrar solo si activas la copia local. |
| Memoria, mientras la app está abierta | Frases de paso, claves desbloqueadas, texto descifrado. |
| Dropbox | Tus ficheros (los `.gpg` / `:crypt:` cifrados). |

El inicio de sesión en Dropbox se hace **en la web de Dropbox** (OAuth con PKCE): tu contraseña de
Dropbox nunca pasa por esta app ni por GitHub. La app habla directamente con Dropbox desde tu
navegador; no hay servidor intermedio.

**Protecciones**

- **Bloqueo de envíos a terceros** (Content-Security-Policy): la app solo puede conectarse con este
  mismo sitio y con la API de Dropbox (y reproducir vídeo/audio desde los enlaces temporales de
  descarga de Dropbox; los únicos marcos permitidos son los reproductores de youtube-nocookie.com). Ni scripts en línea, ni marcos, ni formularios externos.
  Los enlaces de tus notas con esquemas peligrosos (`javascript:`…) se muestran como texto.
- **Bloqueo por inactividad** (por defecto 10 min, configurable o desactivable): guarda lo
  pendiente, olvida frases y claves y recarga la app. Solo actúa si hay algo cifrado abierto.
- **Sin copia local de ficheros sin cifrar** (por defecto; se puede activar para trabajar sin
  conexión). El texto descifrado nunca se guarda en el navegador ni se sube en claro.
- **Compilación verificable**: la web la compila GitHub Actions a partir de este código
  (`.github/workflows/pages.yml`) con las versiones exactas de `yarn.lock`; el registro queda en la
  pestaña *Actions* y la web publica `SHA256SUMS` con el hash de cada fichero.

Todo se configura en **Ajustes → Seguridad y cifrado**.

**Recomendaciones**

- Activa la verificación en dos pasos de GitHub (mejor con passkey o llave física): quien controle
  esta cuenta controla el código que se ejecuta.
- No publiques otras webs en `jakimsareb.github.io`: compartirían el mismo almacenamiento del
  navegador.
- Usa un par de claves GPG **dedicado** a tus notas, nunca tu clave principal, con una frase larga.
- Abre la app en un perfil de navegador sin extensiones, o instalada como app.
- Si pierdes un dispositivo: Dropbox → Configuración → *Aplicaciones conectadas* → revoca la app.

Los archivos adjuntos (carpeta `assets`) se guardan **sin cifrar** en Dropbox, también cuando
la nota está en un fichero `.gpg` (la app avisa antes de subir).

Riesgo residual: la política de seguridad deja hablar con la API de Dropbox, así que un código
malicioso que llegara a ejecutarse (ver recomendaciones) podría, en teoría, subir datos a *otra*
cuenta de Dropbox. Por eso lo más importante es proteger quién puede cambiar el código.

Limitación conocida: con la política de seguridad activa solo funciona la sincronización con
Dropbox (WebDAV y GitLab, que organice también admite, quedan bloqueados).

## Desarrollo

```
yarn install --ignore-engines
yarn --ignore-engines build      # compila en dist/ para /ORGanice/
npx jest src/lib                 # pruebas (incluye interoperabilidad con GnuPG si está instalado)
```

## Licencia

AGPL-3.0, como organice (ver `LICENSE`). Basado en organice, commit `eedd30c` (agosto 2026);
documentación original en `README-organice.org`.
