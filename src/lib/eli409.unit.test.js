// 4.09: tabla vacía en las notas de GTD; Agenda del Menú en el Modo Notas
import { insertEmptyTable } from './eli_format';
import {
  notesAgendaOn,
  setNotesAgendaOn,
  setNotesMode,
  _resetNotesModeForTests,
} from './eli_notes_mode';

const TABLE = '|   |   |   |\n|---+---+---|\n|   |   |   |\n|   |   |   |';

test('tabla en unas notas vacías', () => {
  expect(insertEmptyTable('', null)).toEqual({ value: TABLE, ord: 0 });
});

test('sin cursor: al final, en líneas propias', () => {
  expect(insertEmptyTable('Hola', null).value).toBe('Hola\n' + TABLE);
});

test('con el cursor en medio de una línea: después de esa línea', () => {
  const r = insertEmptyTable('Uno\nDos\nTres', 5);
  expect(r.value).toBe('Uno\nDos\n' + TABLE + '\nTres');
});

test('ord cuenta las tablas que hay antes', () => {
  const v = 'Antes\n| a | b |\n| c | d |\nDespués';
  const r = insertEmptyTable(v, v.length);
  expect(r.ord).toBe(1);
  expect(r.value.endsWith('Después\n' + TABLE)).toBe(true);
});

test('dentro de un elemento de lista, con su sangría', () => {
  const r = insertEmptyTable('- uno', 5);
  expect(r.value.split('\n')[1]).toBe('  |   |   |   |');
});

test('Agenda del Modo Notas: encendida por defecto; se apaga y no cambia con el modo', () => {
  window.localStorage.clear();
  _resetNotesModeForTests();
  expect(notesAgendaOn()).toBe(true);
  setNotesAgendaOn(false);
  expect(notesAgendaOn()).toBe(false);
  setNotesMode(true);
  expect(notesAgendaOn()).toBe(false);
  setNotesAgendaOn(true);
  expect(notesAgendaOn()).toBe(true);
  setNotesMode(false);
});
