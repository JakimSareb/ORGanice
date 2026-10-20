import {
  isNotesMode,
  setNotesMode,
  toolOn,
  setToolOn,
  subscribeNotesMode,
  _resetNotesModeForTests,
} from './eli_notes_mode';

beforeEach(() => {
  window.localStorage.clear();
  _resetNotesModeForTests();
});

test('por defecto: modo completo y herramientas encendidas', () => {
  expect(isNotesMode()).toBe(false);
  expect(toolOn('calc')).toBe(true);
  expect(toolOn('cal')).toBe(true);
});

test('Modo Notas: herramientas apagadas de inicio, se pueden encender', () => {
  setNotesMode(true);
  expect(isNotesMode()).toBe(true);
  expect(window.localStorage.getItem('eliNotesMode')).toBe('true');
  expect(document.body.classList.contains('eli-notes-mode')).toBe(true);
  expect(toolOn('moon')).toBe(false);
  setToolOn('moon', true);
  expect(toolOn('moon')).toBe(true);
  expect(toolOn('acom')).toBe(false);
  // al volver al modo completo, vuelven a su valor de inicio
  setNotesMode(false);
  expect(toolOn('acom')).toBe(true);
  expect(document.body.classList.contains('eli-notes-mode')).toBe(false);
});

test('avisa a los suscritos', () => {
  const seen = [];
  const off = subscribeNotesMode((v) => seen.push(v));
  setNotesMode(true);
  setToolOn('calc', true);
  off();
  setNotesMode(false);
  expect(seen).toEqual([true, true]);
});
