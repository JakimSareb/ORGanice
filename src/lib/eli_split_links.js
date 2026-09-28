// ORG Mode para Eli (2.15): con «Dos columnas», un enlace a un fichero o encabezado Org se puede
// abrir en la columna de al lado. Cada columna es la app entera en su marco (mismo origen), así
// que se le pide a la otra que siga el enlace con un evento.

export const inSplitFrame = () => {
  try {
    return window.parent !== window && !!window.parent.__eliSplitView;
  } catch (e) {
    return false;
  }
};

const otherFrameWindow = () => {
  try {
    const frames = Array.from(window.parent.document.querySelectorAll('iframe'));
    const other = frames.find((f) => f.contentWindow && f.contentWindow !== window);
    return other ? other.contentWindow : null;
  } catch (e) {
    return null;
  }
};

// ¿Dónde abrirlo? Promise<'here' | 'other' | null>
const askWhere = () =>
  new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'eli-prompt__overlay';
    overlay.innerHTML = `
      <div class="eli-prompt__box" role="dialog" data-testid="eli-split-link">
        <div class="eli-prompt__title">¿Dónde lo abro?</div>
        <div class="eli-prompt__message" style="font-size: 0.85em">Consejo: Ctrl+clic (⌘+clic en el Mac) lo abre directamente en la otra columna.</div>
        <div class="eli-prompt__buttons">
          <button type="button" class="btn eli-prompt__cancel" data-where="here">Aquí</button>
          <button type="button" class="btn eli-prompt__ok" data-where="other">En la otra columna</button>
        </div>
      </div>`;
    const done = (v) => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        done(null);
      }
    };
    overlay
      .querySelectorAll('[data-where]')
      .forEach((b) => b.addEventListener('click', () => done(b.getAttribute('data-where'))));
    overlay.addEventListener('click', (e) => e.target === overlay && done(null));
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    setTimeout(() => overlay.querySelector('.eli-prompt__ok').focus(), 30);
  });

/**
 * Seguir un enlace Org teniendo en cuenta las dos columnas. followHere() lo abre en esta.
 * event: el del clic (Ctrl/⌘ = directamente en la otra columna).
 */
export const followOrgLinkSplitAware = (uri, basePath, followHere, event) =>
  openSplitAware(followHere, 'eli:follow-link', { uri, basePath }, event);

/**
 * (2.16) Genérico: abrir aquí (openHere) o mandar a la otra columna el evento `eventName` con
 * `detail` (p. ej. el botón «Abrir» del editor de la vista GTD).
 */
export const openSplitAware = async (openHere, eventName, detail, event) => {
  const other = inSplitFrame() ? otherFrameWindow() : null;
  if (!other) return openHere();
  const direct = event && (event.ctrlKey || event.metaKey);
  const where = direct ? 'other' : await askWhere();
  if (where === 'here') return openHere();
  if (where === 'other') other.dispatchEvent(new CustomEvent(eventName, { detail }));
  return null;
};
