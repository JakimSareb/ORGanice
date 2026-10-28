import { Map } from 'immutable';
import { parseOrg } from '../parse_org';
import { buildTasks } from './gtd_model';
import {
  MIND_SWEEP,
  nextGroupStep,
  BRAINSTORM_TRIGGERS,
  projectPlan,
  planUnits,
  planReady,
  parsePlanNotes,
  mergePlanNotes,
  planFromProject,
  planAdditions,
} from './gtd_guided';

const HEAD = '#+TODO: TODO NEXT WAITING MAYBE PROJECT | DONE CANCELLED\n';
const tasksOf = (text, path = '/p.org') => buildTasks(Map({ [path]: parseOrg(HEAD + text) }), []);

describe('4.14: Volcado mental oficial', () => {
  test('19 profesionales, 20 personales y 3 extra', () => {
    const n = (g) => MIND_SWEEP.filter((s) => s.group === g).length;
    expect(n('Profesional')).toBe(19);
    expect(n('Personal')).toBe(20);
    expect(n('Extra')).toBe(3);
    // los huecos de antes ya están
    const labels = MIND_SWEEP.map((s) => s.label);
    ['Leer / revisar', 'Marketing y promoción', 'Legal', 'Vestuario profesional'].forEach((l) =>
      expect(labels).toContain(l)
    );
    expect(MIND_SWEEP.filter((s) => s.label.startsWith('Waiting for')).length).toBe(2);
  });
  test('Saltar este bloque va al primer paso del grupo siguiente', () => {
    expect(nextGroupStep(MIND_SWEEP, 0)).toBe(19);
    expect(nextGroupStep(MIND_SWEEP, 5)).toBe(19);
    expect(nextGroupStep(MIND_SWEEP, 19)).toBe(39);
    expect(nextGroupStep(MIND_SWEEP, 40)).toBe(42);
  });
  test('Project Brainstorm Trigger List: 14 categorías', () => {
    expect(BRAINSTORM_TRIGGERS.length).toBe(14);
  });
});

describe('4.14: Planificación Natural', () => {
  test('notas con propósito, principios y resultado', () => {
    const p = projectPlan({
      purpose: 'Vivir mejor',
      principles: 'Sin deudas',
      outcome: 'Casa pintada',
      ideas: ['A'],
      first: 'A',
    });
    expect(p.notes).toBe('Propósito: Vivir mejor\nPrincipios: Sin deudas\nResultado: Casa pintada');
  });
  test('componentes: con ≥2 acciones = subproyecto; con 1 = tarea; quién = delegar (Waiting con la persona)', () => {
    const plan = {
      name: 'Boda',
      ideas: [
        'Invitaciones',
        { title: 'Banquete', component: true, actions: ['Pedir presupuestos', 'Elegir menú'] },
        { title: 'Música', component: true, actions: ['Contratar DJ'] },
        { title: 'Viaje', component: true, actions: [] },
      ],
      first: 'Invitaciones',
      nexts: {
        // (4.48) «Quién» = contacto ({ id, title }) → :PERSONA:
        Banquete: { action: 'Pedir presupuestos', who: { id: 'A1', title: 'Ana' } },
        Viaje: { more: true },
      },
    };
    expect(planUnits(plan).map((u) => u.key)).toEqual(['', 'Banquete', 'Música', 'Viaje']);
    expect(projectPlan(plan).tasks).toEqual([
      { title: 'Invitaciones', list: 'next' },
      {
        title: 'Banquete',
        list: 'project',
        children: [
          {
            title: 'Pedir presupuestos',
            list: 'waiting',
            props: { PERSONA: '[[id:A1][Ana]]' },
          },
          { title: 'Elegir menú', list: 'later' },
        ],
      },
      { title: 'Contratar DJ', list: 'later' },
      { title: 'Planificar: Viaje', list: 'next' },
    ]);
  });
  test('sin ninguna siguiente acción no se puede crear', () => {
    expect(planReady({ ideas: ['a'] })).toBe(false);
    expect(planReady({ ideas: [], firstMore: true })).toBe(true);
  });
});

describe('4.14: Replanificar un proyecto existente', () => {
  test('lee y fusiona las notas sin perder el resto', () => {
    const n = parsePlanNotes('Propósito: X\nOtra cosa\nResultado: Y');
    expect(n).toMatchObject({ purpose: 'X', outcome: 'Y', principles: '', rest: 'Otra cosa' });
    expect(mergePlanNotes('Propósito: X\nOtra cosa', { purpose: 'Z', principles: 'P' })).toBe(
      'Propósito: Z\nPrincipios: P\nOtra cosa'
    );
  });
  test('precarga ideas y componentes de las tareas abiertas', () => {
    const tasks = tasksOf(
      [
        '* PROJECT Casa',
        'Propósito: Hogar',
        '** NEXT Pintar',
        '** DONE Barrer',
        '** PROJECT Jardín',
        '*** TODO Podar',
      ].join('\n')
    );
    const p = tasks.find((t) => t.title === 'Casa');
    const plan = planFromProject(tasks, p);
    expect(plan.name).toBe('Casa');
    expect(plan.purpose).toBe('Hogar');
    expect(plan.ideas).toEqual([
      { title: 'Pintar', component: false, existing: true, actions: [] },
      { title: 'Jardín', component: true, existing: true, actions: ['Podar'] },
    ]);
  });
  test('solo se añade lo nuevo (sin duplicar títulos)', () => {
    const add = planAdditions(
      [
        { title: 'Pintar', list: 'later' },
        { title: 'Llamar', list: 'next' },
        {
          title: 'Jardín',
          list: 'project',
          children: [
            { title: 'podar', list: 'next' },
            { title: 'Regar', list: 'later' },
          ],
        },
      ],
      ['Pintar', 'Jardín', 'Podar']
    );
    expect(add).toEqual([
      { title: 'Llamar', list: 'next' },
      {
        title: 'Jardín',
        list: 'project',
        existing: true,
        children: [{ title: 'Regar', list: 'later' }],
      },
    ]);
  });
});
