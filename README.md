# ORGanice 2.4

<img src="src/images/logo-unicornio.svg" alt="" width="96" align="right">

**ORGanice** es un editor de ficheros [Org Mode](https://orgmode.org) para el móvil y el
ordenador. Lee y escribe tus ficheros `.org` directamente en **Dropbox** (o en una carpeta de tu
ordenador), con una **vista GTD** al estilo de Nirvana, una **agenda** clara y total
compatibilidad con Emacs.

App publicada: **https://jakimsareb.github.io/ORGanice/**

## Documentación

- **Manual de uso**: [`sample.org`](sample.org). Es también el fichero de práctica de la app: en la
  pantalla de inicio, «Probar con el manual», o dentro de la app en Ajustes → *Manual de uso*.
- **Novedades**: [`changelog.org`](changelog.org) (en la app: Ajustes → *Novedades*).

## Qué ofrece

- Vista GTD: Focus, Inbox, Next, Todo, Waiting, Scheduled, Deadline, Someday, proyectos, áreas,
  contextos, energía y tiempo; arrastrar tareas entre listas.
- Agenda con vencidas, prioritarias, hábitos y registro de lo terminado.
- Todo Org Mode: estados, prioridades, etiquetas, fechas y repeticiones, tablas, listas con
  casillas, reloj, adjuntos, enlaces, búsqueda, refile y archivado.
- Sincronización con avisos de conflicto y diferencias; uso sin conexión; copias de seguridad.
- Cifrado GPG compatible con Emacs y bloqueo por inactividad.
- Interfaz en español, atajos de teclado configurables y captura rápida desde el iPhone.

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

*Iniciar sesión* → escribe la App key → logo de Dropbox → autoriza. Cada dispositivo se conecta por
separado.

### Uso local en el Mac (opcional, sin GitHub)

En la carpeta `eli/` del paquete descargable: doble clic en `Arrancar (Mac).command` →
`http://localhost:3000/ORGanice/`.

## Carpeta local (sin nube)

En la pantalla de acceso, **«O trabaja con una carpeta de este ordenador» → Elegir carpeta…**.
Funciona en Microsoft Edge y Google Chrome de ordenador (Windows, Mac, Linux); Safari y el iPhone
no lo permiten. La app guarda en el navegador solo la referencia a la carpeta (IndexedDB), nunca su
contenido; al volver a abrirla, el navegador puede pedir confirmar el permiso (botón *Permitir
acceso*). La captura rápida (capture.html) sigue siendo solo para Dropbox.

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

Cada cambio visible para quien usa la app se documenta en el manual (`sample.org`) y en las
novedades (`changelog.org`). El manual admite fechas relativas a hoy (`%HOY%`, `%HOY+3%`,
`%HOY-1 10:00%`) para que la agenda de ejemplo siempre tenga contenido.

## Licencia

AGPL-3.0, como organice (ver `LICENSE`). Basado en [organice](https://github.com/200ok-ch/organice),
commit `eedd30c` (agosto 2026).
