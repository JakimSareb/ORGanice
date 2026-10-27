// ORG Mode para Eli: diálogo mínimo (sin Redux) para pedir frases de paso.
// Devuelve una Promise<string> que se rechaza si el usuario cancela.

export const askPassphrase = ({ title, message, confirm = false }) =>
  new Promise((resolve, reject) => {
    const overlay = document.createElement('div');
    overlay.className = 'eli-prompt__overlay';
    overlay.innerHTML = `
      <form class="eli-prompt__box" autocomplete="off">
        <div class="eli-prompt__title"></div>
        <div class="eli-prompt__message"></div>
        <input type="password" class="eli-prompt__input" autocomplete="off" placeholder="Frase de paso" />
        ${
          confirm
            ? '<input type="password" class="eli-prompt__input eli-prompt__confirm" autocomplete="off" placeholder="Repite la frase de paso" />'
            : ''
        }
        <div class="eli-prompt__error"></div>
        <div class="eli-prompt__buttons">
          <button type="button" class="btn eli-prompt__cancel">Cancelar</button>
          <button type="submit" class="btn eli-prompt__ok">Aceptar</button>
        </div>
      </form>`;
    overlay.querySelector('.eli-prompt__title').textContent = title || 'Frase de paso';
    overlay.querySelector('.eli-prompt__message').textContent = message || '';
    const form = overlay.querySelector('form');
    const input = overlay.querySelector('.eli-prompt__input');
    const confirmInput = overlay.querySelector('.eli-prompt__confirm');
    const error = overlay.querySelector('.eli-prompt__error');

    const close = () => overlay.parentNode && overlay.parentNode.removeChild(overlay);
    overlay.querySelector('.eli-prompt__cancel').addEventListener('click', () => {
      close();
      reject(new Error('Cancelado por el usuario'));
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!input.value) {
        error.textContent = 'Escribe la frase de paso.';
        return;
      }
      if (confirmInput && confirmInput.value !== input.value) {
        error.textContent = 'Las frases no coinciden.';
        return;
      }
      const value = input.value;
      close();
      resolve(value);
    });
    document.body.appendChild(overlay);
    setTimeout(() => input.focus(), 50);
  });

export const showMessage = (title, message) =>
  new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'eli-prompt__overlay';
    overlay.innerHTML = `
      <div class="eli-prompt__box">
        <div class="eli-prompt__title"></div>
        <div class="eli-prompt__message"></div>
        <div class="eli-prompt__buttons"><button type="button" class="btn eli-prompt__ok">Aceptar</button></div>
      </div>`;
    overlay.querySelector('.eli-prompt__title').textContent = title;
    overlay.querySelector('.eli-prompt__message').textContent = message;
    // (2.17) Intro (o Esc) acepta el aviso, sin tener que pulsar el botón. El teclado se atiende
    // en captura para que no actúe ningún atajo de la app mientras el aviso está abierto.
    const done = () => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve();
    };
    const onKey = (e) => {
      if (e.key !== 'Enter' && e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) done();
    };
    document.addEventListener('keydown', onKey, true);
    overlay.querySelector('.eli-prompt__ok').addEventListener('click', done);
    document.body.appendChild(overlay);
    setTimeout(() => {
      const ok = overlay.querySelector('.eli-prompt__ok');
      if (ok) ok.focus();
    }, 30);
  });

// Confirmación en la propia ventana. Devuelve Promise<boolean>.
export const askConfirm = ({
  title,
  message,
  okLabel = 'Aceptar',
  cancelLabel = 'Cancelar',
  focusCancel = false,
}) =>
  new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'eli-prompt__overlay';
    overlay.innerHTML = `
      <div class="eli-prompt__box" role="dialog">
        <div class="eli-prompt__title"></div>
        <div class="eli-prompt__message" style="white-space: pre-line"></div>
        <div class="eli-prompt__buttons">
          <button type="button" class="btn eli-prompt__cancel"></button>
          <button type="button" class="btn eli-prompt__ok"></button>
        </div>
      </div>`;
    overlay.querySelector('.eli-prompt__title').textContent = title;
    overlay.querySelector('.eli-prompt__message').textContent = message;
    overlay.querySelector('.eli-prompt__cancel').textContent = cancelLabel;
    overlay.querySelector('.eli-prompt__ok').textContent = okLabel;
    // (2.16) Esc cancela. (2.17) Intro acepta (o cancela, si el foco está en Cancelar o la
    // confirmación pide el foco en Cancelar); con el foco en un botón, Intro lo pulsa él.
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        done(false);
      } else if (e.key === 'Enter') {
        const a = document.activeElement;
        if (a && overlay.contains(a) && a.tagName === 'BUTTON') return;
        e.preventDefault();
        e.stopPropagation();
        if (!e.repeat) done(!focusCancel);
      }
    };
    const done = (v) => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(v);
    };
    document.addEventListener('keydown', onKey, true);
    overlay.querySelector('.eli-prompt__cancel').addEventListener('click', () => done(false));
    overlay.querySelector('.eli-prompt__ok').addEventListener('click', () => done(true));
    document.body.appendChild(overlay);
    setTimeout(
      () => overlay.querySelector(focusCancel ? '.eli-prompt__cancel' : '.eli-prompt__ok').focus(),
      30
    );
  });

// ORG Mode para Eli: cerrar un proyecto. Devuelve Promise<{ state: 'done'|'cancelled',
// cancelOpen: boolean } | null>.
export const askCloseProject = ({ title, openCount = 0 }) =>
  new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'eli-prompt__overlay';
    overlay.innerHTML = `
      <div class="eli-prompt__box" role="dialog" data-testid="eli-close-project">
        <div class="eli-prompt__title">Cerrar el proyecto</div>
        <div class="eli-prompt__message"></div>
        <label class="eli-prompt__check" style="display:none">
          <input type="checkbox" data-testid="eli-close-project-cancel-open" />
          <span></span>
        </label>
        <div class="eli-prompt__buttons">
          <button type="button" class="btn eli-prompt__cancel">Cancelar</button>
          <button type="button" class="btn eli-prompt__cancelled" data-testid="eli-close-project-cancelled">Cancelado</button>
          <button type="button" class="btn eli-prompt__ok" data-testid="eli-close-project-done">Terminado</button>
        </div>
      </div>`;
    overlay.querySelector('.eli-prompt__message').textContent = `¿Cómo quieres cerrar «${title}»?`;
    const check = overlay.querySelector('.eli-prompt__check');
    const box = check.querySelector('input');
    if (openCount > 0) {
      check.style.display = 'flex';
      check.querySelector('span').textContent =
        `Quedan ${openCount} ${openCount === 1 ? 'tarea' : 'tareas'} sin hacer: cancelarlas ` +
        `también (si no, se quedan como tareas sueltas)`;
    }
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
    document.addEventListener('keydown', onKey, true);
    overlay.querySelector('.eli-prompt__cancel').addEventListener('click', () => done(null));
    overlay
      .querySelector('.eli-prompt__cancelled')
      .addEventListener('click', () => done({ state: 'cancelled', cancelOpen: box.checked }));
    overlay
      .querySelector('.eli-prompt__ok')
      .addEventListener('click', () => done({ state: 'done', cancelOpen: box.checked }));
    document.body.appendChild(overlay);
    setTimeout(() => overlay.querySelector('.eli-prompt__cancel').focus(), 30);
  });

// Pide un texto (sustituye a window.prompt, que no es fiable en las apps de la pantalla de
// inicio). Devuelve Promise<string|null>.
export const askText = ({
  title,
  message = '',
  placeholder = '',
  value = '',
  okLabel = 'Aceptar',
}) =>
  new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'eli-prompt__overlay';
    overlay.innerHTML = `
      <form class="eli-prompt__box" autocomplete="off" data-testid="eli-ask-text">
        <div class="eli-prompt__title"></div>
        <div class="eli-prompt__message"></div>
        <input type="text" class="eli-prompt__input" autocapitalize="off" autocorrect="off" spellcheck="false" />
        <div class="eli-prompt__error"></div>
        <div class="eli-prompt__buttons">
          <button type="button" class="btn eli-prompt__cancel">Cancelar</button>
          <button type="submit" class="btn eli-prompt__ok"></button>
        </div>
      </form>`;
    overlay.querySelector('.eli-prompt__title').textContent = title;
    overlay.querySelector('.eli-prompt__message').textContent = message;
    overlay.querySelector('.eli-prompt__ok').textContent = okLabel;
    const input = overlay.querySelector('.eli-prompt__input');
    input.placeholder = placeholder;
    input.value = value;
    const done = (v) => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        done(null);
      }
    };
    document.addEventListener('keydown', onKey, true);
    overlay.querySelector('.eli-prompt__cancel').addEventListener('click', () => done(null));
    overlay.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      if (!input.value.trim()) {
        overlay.querySelector('.eli-prompt__error').textContent = 'Escribe un nombre.';
        input.focus();
        return;
      }
      done(input.value.trim());
    });
    document.body.appendChild(overlay);
    setTimeout(() => input.focus(), 50);
  });

// Pide una fecha (calendario del sistema). Devuelve Promise<Date|null>.
export const askDate = ({ title, message = '', value = new Date(), okLabel = 'Aceptar' }) =>
  new Promise((resolve) => {
    const pad = (n) => String(n).padStart(2, '0');
    const toInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const overlay = document.createElement('div');
    overlay.className = 'eli-prompt__overlay';
    overlay.innerHTML = `
      <form class="eli-prompt__box" autocomplete="off" data-testid="eli-ask-date">
        <div class="eli-prompt__title"></div>
        <div class="eli-prompt__message"></div>
        <input type="date" class="eli-prompt__input" required />
        <div class="eli-prompt__buttons">
          <button type="button" class="btn eli-prompt__cancel">Cancelar</button>
          <button type="submit" class="btn eli-prompt__ok"></button>
        </div>
      </form>`;
    overlay.querySelector('.eli-prompt__title').textContent = title;
    overlay.querySelector('.eli-prompt__message').textContent = message;
    overlay.querySelector('.eli-prompt__ok').textContent = okLabel;
    const input = overlay.querySelector('.eli-prompt__input');
    input.value = toInput(value || new Date());
    const done = (v) => {
      overlay.remove();
      resolve(v);
    };
    overlay.querySelector('.eli-prompt__cancel').addEventListener('click', () => done(null));
    overlay.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const [y, m, d] = (input.value || '').split('-').map(Number);
      done(y && m && d ? new Date(y, m - 1, d) : null);
    });
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        done(null);
      }
    });
    document.body.appendChild(overlay);
    setTimeout(() => input.focus(), 30);
  });

// (3.01) Elegir de una lista con buscador (p. ej. «Asignar a proyecto…»). items: [{ id, label,
// hint }]. ↑ ↓ para moverse, Intro elige, Esc cancela. Devuelve Promise<id|null>.
// (4.09) newItem(texto) → { label, hint }: con algo escrito que no está en la lista, sale al final
// una opción para crearlo; si se elige, devuelve { new: texto }.
const plainText = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
export const askPick = ({
  title,
  message = '',
  placeholder = 'Buscar…',
  items = [],
  emptyText = 'Nada que elegir.',
  newItem = null,
  // (4.31) como mucho tantas filas a la vista (listas muy largas: todas las cabeceras)
  limit = 0,
}) =>
  new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'eli-prompt__overlay';
    overlay.innerHTML = `
      <form class="eli-prompt__box eli-pick" autocomplete="off" data-testid="eli-ask-pick">
        <div class="eli-prompt__title"></div>
        <div class="eli-prompt__message"></div>
        <input type="text" class="eli-prompt__input" autocapitalize="off" autocorrect="off" spellcheck="false" data-testid="eli-pick-search" />
        <div class="eli-pick__list" role="listbox"></div>
        <div class="eli-prompt__buttons">
          <button type="button" class="btn eli-prompt__cancel">Cancelar</button>
        </div>
      </form>`;
    overlay.querySelector('.eli-prompt__title').textContent = title;
    overlay.querySelector('.eli-prompt__message').textContent = message;
    const input = overlay.querySelector('.eli-prompt__input');
    input.placeholder = placeholder;
    const listEl = overlay.querySelector('.eli-pick__list');
    let shown = [];
    let active = 0;
    const paint = () => {
      const q = plainText(input.value.trim());
      const test = (it) => {
        if (!q) return true;
        // (4.41) `keywords`: más texto por el que se encuentra (p. ej. los alias de una nota)
        if (it.__plain === undefined)
          it.__plain = plainText(`${it.label} ${it.hint || ''} ${it.keywords || ''}`);
        return q.split(/\s+/).every((w) => it.__plain.includes(w));
      };
      shown = items.filter(test);
      // (4.35) lista jerárquica (items con `depth`, en orden de documento): lo que coincide sale
      // bajo sus madres, y las madres que no coinciden salen atenuadas
      if (q && items.some((it) => it.depth !== undefined)) {
        const keep = new Array(items.length).fill(false);
        const dim = new Array(items.length).fill(false);
        let need = -1;
        for (let i = items.length - 1; i >= 0; i--) {
          const d = items[i].depth || 0;
          if (test(items[i])) {
            keep[i] = true;
            need = need < 0 ? d : Math.min(need, d);
          } else if (need >= 0 && d < need) {
            keep[i] = true;
            dim[i] = true;
            need = d;
          }
        }
        shown = items
          .map((it, i) => (keep[i] ? (dim[i] ? { ...it, dim: true } : it) : null))
          .filter(Boolean);
      }
      if (limit && shown.length > limit) shown = shown.slice(0, limit);
      const raw = input.value.trim();
      if (newItem && raw && !items.some((it) => plainText(it.label) === plainText(raw))) {
        // (4.41) newItem puede devolver varias opciones: [{ label, hint, kind }] → { new, kind }
        const made = newItem(raw);
        shown = shown.concat(
          (Array.isArray(made) ? made : [made]).map((x) => ({
            ...x,
            id: x.kind ? { new: raw, kind: x.kind } : { new: raw },
            isNew: true,
          }))
        );
      }
      if (active >= shown.length) active = Math.max(0, shown.length - 1);
      listEl.innerHTML = '';
      if (!shown.length) {
        const empty = document.createElement('div');
        empty.className = 'eli-pick__empty';
        empty.textContent = items.length ? 'No hay coincidencias.' : emptyText;
        listEl.appendChild(empty);
        return;
      }
      shown.forEach((it, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className =
          'eli-pick__item' + (i === active ? ' is-active' : '') + (it.dim ? ' is-dim' : '');
        if (it.depth) b.style.paddingLeft = `${10 + 16 * it.depth}px`;
        b.setAttribute('data-testid', it.isNew ? 'eli-pick-new' : 'eli-pick-item');
        const label = document.createElement('span');
        label.textContent = it.label;
        b.appendChild(label);
        if (it.hint) {
          const hint = document.createElement('small');
          hint.textContent = it.hint;
          b.appendChild(hint);
        }
        b.addEventListener('click', () => done(it.id));
        listEl.appendChild(b);
      });
      const on = listEl.querySelector('.is-active');
      if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
    };
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
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!shown.length) return;
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length;
        paint();
      }
    };
    document.addEventListener('keydown', onKey, true);
    input.addEventListener('input', () => {
      active = 0;
      paint();
    });
    overlay.querySelector('.eli-prompt__cancel').addEventListener('click', () => done(null));
    overlay.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      if (shown[active]) done(shown[active].id);
    });
    document.body.appendChild(overlay);
    paint();
    setTimeout(() => input.focus(), 50);
  });

// (3.01) Pregunta con varias respuestas (botones). choices: [{ id, label, danger }]. Devuelve
// Promise<id|null> (null = Cancelar o Esc).
export const askChoice = ({ title, message = '', choices = [] }) =>
  new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'eli-prompt__overlay';
    overlay.innerHTML = `
      <div class="eli-prompt__box" role="dialog" data-testid="eli-ask-choice">
        <div class="eli-prompt__title"></div>
        <div class="eli-prompt__message"></div>
        <div class="eli-prompt__buttons eli-prompt__buttons--column">
          <button type="button" class="btn eli-prompt__cancel">Cancelar</button>
        </div>
      </div>`;
    overlay.querySelector('.eli-prompt__title').textContent = title;
    overlay.querySelector('.eli-prompt__message').textContent = message;
    const buttons = overlay.querySelector('.eli-prompt__buttons');
    const done = (v) => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(v);
    };
    choices.forEach((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn eli-prompt__ok' + (c.danger ? ' is-danger' : '');
      b.textContent = c.label;
      b.setAttribute('data-testid', `eli-choice-${c.id}`);
      b.addEventListener('click', () => done(c.id));
      buttons.insertBefore(b, buttons.firstChild);
    });
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        done(null);
      }
    };
    document.addEventListener('keydown', onKey, true);
    overlay.querySelector('.eli-prompt__cancel').addEventListener('click', () => done(null));
    document.body.appendChild(overlay);
    setTimeout(() => overlay.querySelector('.eli-prompt__cancel').focus(), 30);
  });

// (4.46) Formulario corto. fields: [{ id, label, type: 'text'|'textarea'|'select'|'check',
// value, options: [{ id, label }], placeholder, required }]. Devuelve Promise<{ [id]: valor }|null>
// (null = Cancelar o Esc). Cada campo lleva data-testid `eli-form-<id>`.
export const askForm = ({ title, message = '', fields = [], okLabel = 'Aceptar' }) =>
  new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'eli-prompt__overlay';
    overlay.innerHTML = `
      <form class="eli-prompt__box" autocomplete="off" data-testid="eli-ask-form">
        <div class="eli-prompt__title"></div>
        <div class="eli-prompt__message"></div>
        <div class="eli-prompt__fields"></div>
        <div class="eli-prompt__error"></div>
        <div class="eli-prompt__buttons">
          <button type="button" class="btn eli-prompt__cancel">Cancelar</button>
          <button type="submit" class="btn eli-prompt__ok"></button>
        </div>
      </form>`;
    overlay.querySelector('.eli-prompt__title').textContent = title;
    overlay.querySelector('.eli-prompt__message').textContent = message;
    overlay.querySelector('.eli-prompt__ok').textContent = okLabel;
    const box = overlay.querySelector('.eli-prompt__fields');
    const controls = {};
    fields.forEach((f) => {
      const row = document.createElement('label');
      row.className = 'eli-prompt__field';
      row.style.cssText = 'display:flex;flex-direction:column;gap:2px;margin:6px 0;text-align:left';
      if (f.type === 'check') row.style.cssText += ';flex-direction:row;align-items:center;gap:8px';
      const span = document.createElement('span');
      span.textContent = f.label;
      span.style.fontSize = '0.85em';
      let input;
      if (f.type === 'select') {
        input = document.createElement('select');
        (f.options || []).forEach((o) => {
          const op = document.createElement('option');
          op.value = o.id;
          op.textContent = o.label;
          input.appendChild(op);
        });
        input.value =
          f.value != null ? f.value : (f.options && f.options[0] && f.options[0].id) || '';
      } else if (f.type === 'textarea') {
        input = document.createElement('textarea');
        input.rows = 3;
        input.value = f.value || '';
      } else if (f.type === 'check') {
        input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = !!f.value;
      } else {
        input = document.createElement('input');
        input.type = 'text';
        input.value = f.value || '';
      }
      if (f.type !== 'select' && f.type !== 'check') {
        input.className = 'eli-prompt__input';
        input.placeholder = f.placeholder || '';
        input.setAttribute('autocapitalize', 'off');
        input.setAttribute('spellcheck', 'false');
      }
      input.setAttribute('data-testid', `eli-form-${f.id}`);
      if (f.type === 'check') row.append(input, span);
      else row.append(span, input);
      box.appendChild(row);
      controls[f.id] = input;
    });
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
    document.addEventListener('keydown', onKey, true);
    overlay.querySelector('.eli-prompt__cancel').addEventListener('click', () => done(null));
    overlay.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const out = {};
      fields.forEach((f) => {
        const c = controls[f.id];
        out[f.id] = f.type === 'check' ? c.checked : String(c.value || '').trim();
      });
      const missing = fields.find((f) => f.required && !out[f.id]);
      if (missing) {
        overlay.querySelector('.eli-prompt__error').textContent = `Falta: ${missing.label}.`;
        controls[missing.id].focus();
        return;
      }
      done(out);
    });
    document.body.appendChild(overlay);
    const firstText = fields.find((f) => f.type !== 'check' && f.type !== 'select');
    setTimeout(() => firstText && controls[firstText.id].focus(), 50);
  });
