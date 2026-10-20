import { Map } from 'immutable';
import { parseOrg } from '../parse_org';
import { buildTasks, archivableDone } from './gtd_model';

const HEAD = '#+TODO: TODO NEXT WAITING MAYBE PROJECT | DONE CANCELLED\n';
const tasksOf = (files) =>
  buildTasks(Map(Object.entries(files).map(([p, t]) => [p, parseOrg(HEAD + t)])), []);
const titles = (l) => l.map((t) => t.title).sort();

describe('3.43: archivar con proyectos', () => {
  test('no archiva las hechas de un proyecto abierto', () => {
    const tasks = tasksOf({
      '/p.org': [
        '* PROJECT Casa',
        ':PROPERTIES:',
        ':ID: 1111-casa',
        ':END:',
        '** DONE Comprar pintura',
        '** NEXT Pintar',
        '* DONE Suelta',
        '',
      ].join('\n'),
      '/q.org': [
        '* DONE Llamar al fontanero',
        ':PROPERTIES:',
        ':PROYECTO: [[id:1111-casa][Casa]]',
        ':END:',
        '',
      ].join('\n'),
    });
    const { ok, blocked } = archivableDone(tasks);
    expect(titles(ok)).toEqual(['Suelta']);
    expect(titles(blocked)).toEqual(['Comprar pintura', 'Llamar al fontanero']);
  });

  test('al terminar el proyecto se archiva todo junto', () => {
    const tasks = tasksOf({
      '/p.org': ['* DONE Casa', '** DONE Comprar pintura', '** DONE Pintar', ''].join('\n'),
    });
    const { ok, blocked } = archivableDone(tasks);
    expect(titles(ok)).toEqual(['Casa', 'Comprar pintura', 'Pintar']);
    expect(blocked).toEqual([]);
  });
});
