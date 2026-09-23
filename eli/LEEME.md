# ORG Mode para Eli

Fork de [organice](https://github.com/200ok-ch/organice) (Org Mode en el navegador, sin Emacs)
que se ejecuta en local y lee/escribe los ficheros `.org` directamente en Dropbox.
Conserva toda la funcionalidad de organice (agenda, TODO, etiquetas, propiedades, tablas,
clocking, capture templates, búsqueda, etc.).

Cambios respecto al original:

- La **App key de Dropbox se introduce en la pantalla de acceso** (no hace falta recompilar).
- **Imágenes y multimedia**: enlaces a `assets/<año>/…` se ven en la nota; botón 📎 para subir.
- **Texto plano y PDF**: editar el fichero como texto; exportar fichero o encabezado a PDF.
- **Seguridad**: bloqueo de envíos a terceros, bloqueo por inactividad y sin copia local de
  ficheros sin cifrar (configurable en Ajustes → Seguridad y cifrado).
- **Búsqueda con ámbito**: en *Buscar* elige **Tareas** (solo encabezados con TODO/DONE…),
  **Encabezados** (título de cualquier encabezado) o **Texto** (título + contenido).
- **Agenda con vencidas**: el día de hoy muestra una sección *Vencidas* con las tareas abiertas
  cuyo SCHEDULED o DEADLINE ya pasó y los días de retraso.
- **Ficheros principales** (botón ★), **filtro por estado** (TODO, NEXT, WAITING, MAYBE, PROJECT)
  y **previsualización de YouTube**.
- **Filtro por contextos GTD**: botones generados a partir de las líneas `#+TAGS:` de tus ficheros
  (solo las etiquetas que empiezan por `@`, p. ej. `#+TAGS: @casa(c) @oficina(o) @llamadas`).
  Aparecen en Buscar, Lista de tareas y Agenda. Varios seleccionados = cualquiera de ellos.
  Respeta la herencia de etiquetas de Org.
- **Cifrado GPG** (compatible con GnuPG y Emacs):
  - Ficheros `*.org.gpg` (binario, como EPA) y `*.org.asc` (ASCII): se descifran al abrir y se
    vuelven a cifrar al guardar, igual que estaban (misma frase de paso o mismos destinatarios).
  - Cabeceras con la etiqueta `:crypt:` (org-crypt): botón *Descifrar*; al guardar se vuelven a
    cifrar automáticamente. La línea SCHEDULED/DEADLINE y el cajón `:PROPERTIES:` quedan en claro,
    como en Emacs. `:CRYPTKEY:` elige la clave pública.
  - Simétrico (frase de paso) o clave pública/privada. Gestión de claves en
    **Ajustes → Seguridad y cifrado**: importar tu clave de GnuPG, importar claves públicas, crear un par
    nuevo, elegir el modo por defecto.
  - Las frases de paso solo viven en memoria. El texto descifrado nunca se guarda en el
    navegador ni se sube a Dropbox en claro (tampoco las copias `.organice-bak`).
    Consecuencia: los cambios en ficheros cifrados necesitan conexión para guardarse.

## Uso local en el Mac

La app principal está publicada en **https://jakimsareb.github.io/ORGanice/** (instrucciones
completas y notas de seguridad en el `README.md` del repositorio). Esta carpeta sirve para usarla
en local en el Mac, sin depender de GitHub:

1. En tu app de Dropbox (dropbox.com/developers/apps → Settings → Redirect URIs) añade
   `http://localhost:3000/ORGanice/`.
2. Doble clic en **`Arrancar (Mac).command`** (la primera vez: clic derecho → Abrir). Se abre
   `http://localhost:3000/ORGanice/`. Deja la ventana de Terminal abierta mientras trabajas.
3. *Sign in* → App key → logo de Dropbox → autoriza.

El servidor local solo escucha en tu Mac (127.0.0.1), no en la red. El antiguo modo para el
iPhone por la Wi‑Fi del Mac se ha retirado por seguridad (exigía instalar un certificado raíz
propio en el iPhone); en el iPhone usa la versión publicada.

## Estructura

- `dist/` – la app compilada
- `servir.py` – servidor local
- `codigo-fuente/` – el código fuente (igual que el repositorio de GitHub)
