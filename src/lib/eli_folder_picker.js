// ORG Mode para Eli (4.54): selector de CARPETA (Dropbox / carpeta local) para elegir dónde se
// guarda un adjunto. Navegable: «›» entra en una carpeta, «← Subir» sale, «Nueva carpeta…» añade un
// nivel (se crea al subir el primer archivo) y «Usar esta carpeta» confirma.
// Las funciones puras (`normalizeDir`, `parentDir`, `joinDir`, `foldersOf`) se prueban en jest; el
// diálogo es DOM, como el menú de captura. Promise<string|null> (ruta sin «/» final; «» = raíz).
import { askText } from './eli_prompt';

export const normalizeDir = (dir) => {
  const d = String(dir || '')
    .replace(/\/{2,}/g, '/')
    .replace(/\/+$/, '');
  return d && !d.startsWith('/') ? `/${d}` : d;
};
export const parentDir = (dir) => normalizeDir(dir).replace(/\/[^/]*$/, '');
export const joinDir = (dir, name) =>
  normalizeDir(
    `${normalizeDir(dir)}/${String(name || '')
      .replace(/[\\/]+/g, '_')
      .trim()}`
  );

// Carpetas de un listado (List de Immutable o array), por nombre
export const foldersOf = (listing) => {
  const raw = listing && (typeof listing.toJS === 'function' ? listing.toJS() : listing);
  return (Array.isArray(raw) ? raw : [])
    .filter((e) => e && e.isDirectory)
    .map((e) => ({
      name:
        e.name ||
        String(e.path || '')
          .split('/')
          .pop(),
      path: normalizeDir(e.path),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
};

// La raíz de Dropbox es «» y la de otros servicios «/»: se prueba una y luego la otra
const listFolders = async (client, dir) => {
  const d = normalizeDir(dir);
  for (const p of d ? [d] : ['', '/']) {
    try {
      const res = await client.getDirectoryListing(p);
      return foldersOf(res && res.listing);
    } catch (e) {
      // se prueba la siguiente forma de nombrar la raíz
    }
  }
  return null;
};

const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])
  );

export const pickFolder = ({ client, start = '', title = 'Carpeta de destino' }) =>
  new Promise((resolve) => {
    let current = normalizeDir(start);
    const overlay = document.createElement('div');
    overlay.className = 'eli-prompt__overlay';
    overlay.innerHTML = `
      <div class="eli-prompt__box" role="dialog" data-testid="eli-folder-picker">
        <div class="eli-prompt__title"><i class="fas fa-folder-open"></i> ${esc(title)}</div>
        <div class="eli-folder-picker__path" data-testid="eli-folder-path"></div>
        <div class="eli-capture-menu eli-folder-picker__list"></div>
        <div class="eli-prompt__buttons">
          <button type="button" class="btn eli-prompt__cancel" data-act="cancel">Cancelar</button>
          <button type="button" class="btn" data-act="new">Nueva carpeta…</button>
          <button type="button" class="btn eli-prompt__ok" data-act="ok" data-testid="eli-folder-use">Usar esta carpeta</button>
        </div>
      </div>`;
    const pathEl = overlay.querySelector('.eli-folder-picker__path');
    const listEl = overlay.querySelector('.eli-folder-picker__list');
    const done = (value) => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(value);
    };
    const render = async () => {
      pathEl.textContent = current || '/';
      listEl.innerHTML = '';
      if (current) {
        const up = document.createElement('button');
        up.type = 'button';
        up.className = 'btn eli-capture-menu__item';
        up.textContent = '← Subir';
        up.addEventListener('click', () => {
          current = parentDir(current);
          render();
        });
        listEl.appendChild(up);
      }
      const folders = await listFolders(client, current);
      if (folders === null) {
        const note = document.createElement('div');
        note.className = 'eli-prompt__message';
        note.textContent = 'No se ha podido leer esta carpeta (puede que aún no exista).';
        listEl.appendChild(note);
        return;
      }
      folders.forEach((f) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn eli-capture-menu__item';
        b.setAttribute('data-folder', f.path);
        b.textContent = `📁 ${f.name} ›`;
        b.addEventListener('click', () => {
          current = f.path;
          render();
        });
        listEl.appendChild(b);
      });
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        done(null);
      }
    };
    overlay.addEventListener('click', async (e) => {
      if (e.target === overlay) return done(null);
      const act = e.target.closest && e.target.closest('[data-act]');
      if (!act) return;
      const kind = act.getAttribute('data-act');
      if (kind === 'cancel') done(null);
      else if (kind === 'ok') done(current);
      else if (kind === 'new') {
        const name = await askText({ title: 'Nueva carpeta', okLabel: 'Crear' });
        if (name && name.trim()) {
          current = joinDir(current, name);
          render();
        }
      }
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    render();
  });
