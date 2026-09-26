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
    overlay.querySelector('.eli-prompt__ok').addEventListener('click', () => {
      overlay.parentNode.removeChild(overlay);
      resolve();
    });
    document.body.appendChild(overlay);
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
    const done = (v) => {
      overlay.remove();
      resolve(v);
    };
    overlay.querySelector('.eli-prompt__cancel').addEventListener('click', () => done(false));
    overlay.querySelector('.eli-prompt__ok').addEventListener('click', () => done(true));
    document.body.appendChild(overlay);
    setTimeout(
      () => overlay.querySelector(focusCancel ? '.eli-prompt__cancel' : '.eli-prompt__ok').focus(),
      30
    );
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
