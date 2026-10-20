import { Map } from 'immutable';
import { parseOrg } from '../parse_org';
import { buildTasks, doneWaitingCleanup } from './gtd_model';
import { normalizeGtdSections, isActionSection } from './gtd_sections';
import { insertAtCursor } from '../eli_format';

const HEAD = '#+TODO: TODO NEXT WAITING MAYBE PROJECT | DONE CANCELLED\n';
const tasksOf = (files) =>
  buildTasks(Map(Object.entries(files).map(([p, t]) => [p, parseOrg(HEAD + t)])), []);
const titles = (l) => l.map((t) => t.title).sort();
const done = (title, extra = []) =>
  [`** DONE ${title}`, ':PROPERTIES:', ':DONE_IN: next', ...extra, ':END:'].join('\n');

describe('3.44: Limpieza con proyectos', () => {
  test('no toca las hechas de un proyecto abierto', () => {
    const tasks = tasksOf({
      '/p.org': [
        '* PROJECT Casa',
        ':PROPERTIES:',
        ':ID: 2222-casa',
        ':END:',
        done('Comprar pintura'),
        '** NEXT Pintar',
        '* DONE Suelta',
        ':PROPERTIES:',
        ':DONE_IN: next',
        ':END:',
        '',
      ].join('\n'),
      '/q.org': [
        '* DONE Llamar al fontanero',
        ':PROPERTIES:',
        ':DONE_IN: next',
        ':PROYECTO: [[id:2222-casa][Casa]]',
        ':END:',
        '',
      ].join('\n'),
    });
    expect(titles(doneWaitingCleanup(tasks))).toEqual(['Suelta']);
  });

  test('con el proyecto terminado, se las lleva', () => {
    const tasks = tasksOf({
      '/p.org': ['* DONE Casa', done('Comprar pintura'), done('Pintar'), ''].join('\n'),
    });
    expect(titles(doneWaitingCleanup(tasks))).toEqual(['Comprar pintura', 'Pintar']);
  });
});

describe('3.44: Procesar Inbox y Revisión semanal en el menú', () => {
  test('por defecto, justo después de Logbook', () => {
    const { order, sections } = normalizeGtdSections(null);
    const lb = order.indexOf('logbook');
    expect(order.slice(lb + 1, lb + 3)).toEqual(['process', 'review']);
    expect(sections.process.show).toBe(true);
    expect(isActionSection('review')).toBe(true);
    expect(isActionSection('agenda')).toBe(true);
    expect(isActionSection('inbox')).toBe(false);
  });

  test('un orden guardado de antes las recibe después de Logbook', () => {
    const { order } = normalizeGtdSections({
      order: ['agenda', 'focus', 'inbox', 'logbook', 'trash'],
    });
    expect(order.indexOf('process')).toBe(order.indexOf('logbook') + 1);
    expect(order.indexOf('review')).toBe(order.indexOf('logbook') + 2);
  });

  test('se pueden ocultar', () => {
    const { sections } = normalizeGtdSections({ sections: { process: { show: false } } });
    expect(sections.process.show).toBe(false);
  });
});

describe('3.44: insertar en el cursor', () => {
  test('con espacio delante si hace falta', () => {
    expect(insertAtCursor('Hola', 4, 4, '[X]')).toEqual({ value: 'Hola [X]', start: 8, end: 8 });
    expect(insertAtCursor('Hola ', 5, 5, '[X]').value).toBe('Hola [X]');
    expect(insertAtCursor('', 0, 0, '[X]').value).toBe('[X]');
    expect(insertAtCursor('a\nb', 2, 2, '[X]').value).toBe('a\n[X]b');
    expect(insertAtCursor('a sel b', 2, 5, '[X]').value).toBe('a [X] b');
  });
});
