import { showMessage, askConfirm } from './eli_prompt';

const press = (key, init = {}) => {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  document.dispatchEvent(e);
  return e;
};
const overlays = () => document.querySelectorAll('.eli-prompt__overlay').length;

afterEach(() => {
  document.body.innerHTML = '';
});

describe('2.17: los avisos se aceptan con Intro', () => {
  test('showMessage: Intro lo cierra y resuelve', async () => {
    const p = showMessage('Error', 'Algo ha fallado');
    expect(overlays()).toBe(1);
    const e = press('Enter');
    await p;
    expect(overlays()).toBe(0);
    expect(e.defaultPrevented).toBe(true);
  });

  test('showMessage: Esc también lo cierra', async () => {
    const p = showMessage('Error', 'Algo ha fallado');
    press('Escape');
    await p;
    expect(overlays()).toBe(0);
  });

  test('showMessage: el botón Aceptar sigue funcionando y recibe el foco', async () => {
    const p = showMessage('Error', 'Algo ha fallado');
    await new Promise((r) => setTimeout(r, 60));
    expect(document.activeElement.className).toContain('eli-prompt__ok');
    document.querySelector('.eli-prompt__ok').click();
    await p;
    expect(overlays()).toBe(0);
  });

  test('showMessage: una tecla repetida no cierra avisos que aparezcan después', async () => {
    const p = showMessage('Uno', 'a');
    press('Enter', { repeat: true });
    expect(overlays()).toBe(1);
    press('Enter');
    await p;
    expect(overlays()).toBe(0);
  });

  test('showMessage: otras teclas no hacen nada', async () => {
    const p = showMessage('Error', 'x');
    press('a');
    expect(overlays()).toBe(1);
    press('Enter');
    await p;
  });

  test('askConfirm: Intro acepta', async () => {
    const p = askConfirm({ title: 'Borrar', message: '¿Seguro?' });
    press('Enter');
    expect(await p).toBe(true);
  });

  test('askConfirm: con focusCancel, Intro cancela (acción delicada)', async () => {
    const p = askConfirm({ title: 'Borrar', message: '¿Seguro?', focusCancel: true });
    press('Enter');
    expect(await p).toBe(false);
  });

  test('askConfirm: Esc cancela', async () => {
    const p = askConfirm({ title: 'Borrar', message: '¿Seguro?' });
    press('Escape');
    expect(await p).toBe(false);
  });
});
