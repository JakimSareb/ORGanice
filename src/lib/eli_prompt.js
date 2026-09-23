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
