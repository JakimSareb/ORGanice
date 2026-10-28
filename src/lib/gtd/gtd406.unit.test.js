import { Map } from 'immutable';
import { parseOrg } from '../parse_org';
import { buildTasks } from './gtd_model';
import {
  MIND_SWEEP,
  stuckProjects,
  waitingByPerson,
  somedayReview,
  chaseTitle,
  chaseMessage,
  projectPlan,
  moveItem,
} from './gtd_guided';

const HEAD = '#+TODO: TODO NEXT WAITING MAYBE PROJECT | DONE CANCELLED\n';
const TODAY = new Date(2026, 9, 21);
const tasksOf = (text, path = '/p.org') => buildTasks(Map({ [path]: parseOrg(HEAD + text) }), []);
const titles = (l) => l.map((t) => t.title);

describe('4.06: Volcado mental', () => {
  test('la lista larga de disparadores (Trabajo y Personal)', () => {
    // (4.14) lista oficial: 19 + 20 + 3 extra
    expect(MIND_SWEEP.length).toBe(42);
    expect(new Set(MIND_SWEEP.map((s) => s.group))).toEqual(
      new Set(['Profesional', 'Personal', 'Extra'])
    );
    expect(new Set(MIND_SWEEP.map((s) => s.id)).size).toBe(42);
  });
});

describe('4.06: proyectos atascados', () => {
  const tasks = tasksOf(
    [
      '* PROJECT En marcha',
      '** NEXT Hacer algo',
      '* PROJECT Sin siguiente',
      '** TODO Algún día habrá',
      '* PROJECT Vacío',
      '* PROJECT Dormido',
      ':PROPERTIES:',
      ':STATUS: sleep',
      ':END:',
      '* DONE Cerrado',
    ].join('\n')
  );
  const r = stuckProjects(tasks, TODAY);
  test('sin acción en Next primero, luego los dormidos', () => {
    expect(r.map((x) => [x.project.title, x.why])).toEqual([
      ['Sin siguiente', 'noNext'],
      ['Vacío', 'noNext'],
      ['Dormido', 'sleep'],
    ]);
  });
});

describe('4.06: Repaso de Waiting', () => {
  const tasks = tasksOf(
    [
      // (4.48) la persona va en :PERSONA: (contacto), no en una etiqueta
      '* WAITING Contrato',
      ':PROPERTIES:',
      ':PERSONA: [[id:A1][Ana]]',
      ':END:',
      '* WAITING Factura :Ana:',
      ':PROPERTIES:',
      ':PERSONA: [[id:A1][Ana]]',
      ':END:',
      '* WAITING Paquete',
      '* WAITING Llaves',
      ':PROPERTIES:',
      ':PERSONA: [[id:L1][Luis]]',
      ':END:',
    ].join('\n')
  );
  const g = waitingByPerson(tasks, TODAY, ['inbox']);
  test('agrupadas por persona (sin persona al final)', () => {
    expect(g.map((x) => x.person)).toEqual(['Ana', 'Luis', null]);
    expect(titles(g[0].items)).toEqual(['Contrato', 'Factura']);
  });
  test('tarea y mensaje para reclamar', () => {
    const t = g[0].items[0];
    expect(chaseTitle(t, 'Ana')).toBe('Reclamar a Ana: Contrato');
    expect(chaseTitle(t, '@Luis')).toBe('Reclamar a Luis: Contrato');
    expect(chaseTitle(t, null)).toBe('Reclamar: Contrato');
    expect(chaseMessage(t, 'Ana')).toContain('Ana');
    expect(chaseMessage(t, 'Ana')).toContain('«Contrato»');
  });
});

describe('4.06: Repaso de Someday/Maybe', () => {
  const tasks = tasksOf(
    [
      '* MAYBE Piano',
      '* NEXT Otra',
      '* PROJECT Viaje',
      ':PROPERTIES:',
      ':STATUS: sleep',
      ':END:',
    ].join('\n')
  );
  test('las de Someday y los proyectos dormidos', () => {
    const r = somedayReview(tasks, TODAY);
    expect(titles(r.items)).toEqual(['Piano']);
    expect(titles(r.projects)).toEqual(['Viaje']);
  });
});

describe('4.06: Planificar un proyecto', () => {
  test('notas y tareas (la primera acción = Next, sin repetir)', () => {
    const p = projectPlan({
      purpose: 'Para vivir mejor',
      outcome: 'Casa pintada',
      ideas: ['Comprar pintura', 'Elegir color', 'Pintar'],
      first: 'Elegir color',
    });
    expect(p.notes).toBe('Propósito: Para vivir mejor\nResultado: Casa pintada');
    expect(p.tasks).toEqual([
      { title: 'Elegir color', list: 'next' },
      { title: 'Comprar pintura', list: 'later' },
      { title: 'Pintar', list: 'later' },
    ]);
  });
  test('sin primera acción no hay tareas', () => {
    expect(projectPlan({ ideas: ['a'] }).tasks).toEqual([]);
  });
  test('ordenar', () => {
    expect(moveItem(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
  });
});
