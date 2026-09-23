# ORG Mode para Eli

Versión propia de [organice](https://github.com/200ok-ch/organice) (Org Mode en el navegador,
sin Emacs): lee y escribe tus ficheros `.org` directamente en **Dropbox**, desde el Mac, Windows
o el iPhone. Conserva toda la funcionalidad de organice y añade:

- **Búsqueda con ámbito**: *Tareas* (solo encabezados con TODO/DONE…), *Encabezados* (título) o
  *Texto* (título + contenido).
- **Agenda con vencidas**: cada día muestra las tareas abiertas cuyo SCHEDULED o DEADLINE ya pasó
  y cuántos días llevan vencidas.
- **Contextos GTD**: botones de filtro generados desde las líneas `#+TAGS:` de tus ficheros (solo
  etiquetas que empiezan por `@`, p. ej. `#+TAGS: @casa(c) @oficina(o) @llamadas`). En Buscar,
  Lista de tareas y Agenda. Respeta la herencia de etiquetas.
- **Imágenes y multimedia desde Dropbox**: los enlaces Org a imágenes (`[[file:Assets/2026/foto.jpg]]`,
  `[[./Assets/2026/foto.jpg][Descripción]]`) se ven dentro de la nota (miniatura generada por
  Dropbox; al pulsar se abre el original). Vídeo y audio con reproductor; PDF y otros ficheros se
  abren al pulsar. Botón 📎 en cada encabezado para subir fotos, vídeos o archivos a
  `Assets/<año>/` (junto al fichero `.org`) e insertar el enlace. Nunca sobrescribe: si el nombre
  existe, Dropbox lo renombra.
- **Cifrado GPG** compatible con GnuPG y Emacs: ficheros `*.org.gpg` / `*.org.asc` y cabeceras
  `:crypt:` (org-crypt); simétrico o con clave pública/privada.
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
  descarga de Dropbox). Ni scripts en línea, ni marcos, ni formularios externos.
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

Los archivos adjuntos (carpeta `Assets`) se guardan **sin cifrar** en Dropbox, también cuando
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
