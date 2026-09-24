// ORG Mode para Eli: insertar enlaces Org [[enlace][descripción]] en el texto que se edita.

export const formatOrgLink = (link, description) => {
  const l = (link || '').trim().replace(/\]\]/g, '%5D%5D');
  const d = (description || '').trim().replace(/\]\]/g, '] ]');
  if (!l) return '';
  return d ? `[[${l}][${d}]]` : `[[${l}]]`;
};

// Texto del portapapeles (una línea), si el navegador lo permite
export const readClipboardText = async () => {
  try {
    if (!navigator.clipboard || !navigator.clipboard.readText) return '';
    const text = await navigator.clipboard.readText();
    const line = (text || '').trim();
    return line && !line.includes('\n') && line.length <= 2000 ? line : '';
  } catch (e) {
    return '';
  }
};

// Diálogo Enlace + Descripción. Devuelve Promise<{ link, description } | null>
export const askLink = ({ link = '', description = '' } = {}) =>
  new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'eli-prompt__overlay';
    overlay.innerHTML = `
      <form class="eli-prompt__box eli-link" autocomplete="off" data-testid="eli-link-dialog">
        <div class="eli-prompt__title"><i class="fas fa-link"></i> Insertar enlace</div>
        <label class="eli-link__label">Enlace
          <input type="text" class="eli-prompt__input eli-link__url" autocapitalize="off"
            autocorrect="off" spellcheck="false" placeholder="https://… o file:ruta/fichero.org" />
        </label>
        <label class="eli-link__label">Descripción (opcional)
          <input type="text" class="eli-prompt__input eli-link__desc" placeholder="Texto que se verá" />
        </label>
        <div class="eli-link__preview"></div>
        <div class="eli-prompt__buttons">
          <button type="button" class="btn eli-prompt__cancel">Cancelar</button>
          <button type="submit" class="btn eli-prompt__ok">Insertar</button>
        </div>
      </form>`;
    const form = overlay.querySelector('form');
    const url = overlay.querySelector('.eli-link__url');
    const desc = overlay.querySelector('.eli-link__desc');
    const preview = overlay.querySelector('.eli-link__preview');
    url.value = link;
    desc.value = description;
    const update = () => (preview.textContent = formatOrgLink(url.value, desc.value));
    url.addEventListener('input', update);
    desc.addEventListener('input', update);
    update();
    const done = (value) => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        done(null);
      }
    };
    document.addEventListener('keydown', onKey, true);
    overlay.querySelector('.eli-prompt__cancel').addEventListener('click', () => done(null));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!url.value.trim()) {
        url.focus();
        return;
      }
      done({ link: url.value.trim(), description: desc.value.trim() });
    });
    document.body.appendChild(overlay);
    // Con el enlace ya pegado, el cursor va directo a la descripción
    setTimeout(() => (link ? desc : url).focus(), 50);
  });

// Flujo completo sobre un <textarea>/<input>: portapapeles → diálogo → insertar en el cursor.
// `insert(el, text, start, end)` es la función que inserta respetando React.
export const insertLinkInto = async (el, insert) => {
  if (!el) return;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const selected = (el.value || '').slice(start, end);
  const clip = await readClipboardText();
  const looksLikeUrl = (s) => /^([a-z][\w+.-]*:|\/|\.\/|~\/|www\.)/i.test(s);
  // Si lo seleccionado es un enlace, va al campo Enlace; si no, es la descripción
  const result = await askLink(
    selected && looksLikeUrl(selected)
      ? { link: selected, description: '' }
      : { link: clip, description: selected }
  );
  if (!result) {
    try {
      el.focus();
      el.setSelectionRange(start, end);
    } catch (e) {}
    return;
  }
  // Conservar los espacios que rodeaban a lo seleccionado
  const lead = (selected.match(/^\s*/) || [''])[0];
  const trail = selected.trim() ? (selected.match(/\s*$/) || [''])[0] : '';
  insert(el, lead + formatOrgLink(result.link, result.description) + trail, start, end);
};
