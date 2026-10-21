import { Map } from 'immutable';
import { parseOrg } from '../parse_org';
import { buildTasks } from './gtd_model';
import { normalizeGtdSections, isActionSection } from './gtd_sections';
import {
  parseHorizons,
  horizonsView,
  missingAreas,
  objectiveRefOf,
  objectivePickItems,
  horizonsPathNear,
  horizonKindOf,
  HORIZONS_TEMPLATE,
} from './gtd_horizons';

const HEAD = '#+TODO: TODO NEXT WAITING MAYBE PROJECT | DONE CANCELLED\n';
const tasksOf = (text) => buildTasks(Map({ '/tasks.org': parseOrg(HEAD + text) }), []);
const HORIZONS = [
  '* Propósito y principios',
  'Vivir tranquilo.',
  '* Visión (3–5 años)',
  'Una casa ordenada.',
  '* Objetivos (1–2 años)',
  '** Media maratón',
  ':PROPERTIES:',
  ':ID: OBJ-1',
  ':AREA: Salud',
  ':END:',
  '** Aprender alemán',
  '* Áreas de responsabilidad',
  '** Casa',
  '** Salud',
  '** Trabajo',
  '',
].join('\n');
const h = parseHorizons(parseOrg(HORIZONS), '/horizons.org');
const TASKS = [
  '* PROJECT Correr',
  ':PROPERTIES:',
  ':AREA: Salud',
  ':OBJETIVO: [[id:obj-1][Media maratón]]',
  ':END:',
  '** NEXT Comprar zapatillas',
  '* PROJECT Trastero',
  ':PROPERTIES:',
  ':AREA: Casa',
  ':STATUS: sleep',
  ':END:',
  '* PROJECT Suelto',
  '* NEXT Llamar al banco',
  ':PROPERTIES:',
  ':AREA: Dinero',
  ':END:',
  '',
].join('\n');

describe('4.07: fichero de horizontes', () => {
  test('lee propósito, visión, objetivos y áreas', () => {
    expect(h.purpose.description).toContain('Vivir tranquilo');
    expect(h.vision.description).toContain('Una casa ordenada');
    expect(h.objectives.map((o) => o.title)).toEqual(['Media maratón', 'Aprender alemán']);
    expect(h.objectives[0].orgId).toBe('OBJ-1');
    expect(h.objectives[0].area).toBe('Salud');
    expect(h.objectives[1].orgId).toBe(null);
    expect(h.areaList.map((a) => a.name)).toEqual(['Casa', 'Salud', 'Trabajo']);
  });

  test('sin fichero, vacío', () => {
    const e = parseHorizons(null, '/horizons.org');
    expect(e.objectives).toEqual([]);
    expect(e.vision).toBe(null);
  });

  test('la plantilla se lee', () => {
    const t = parseHorizons(parseOrg(HORIZONS_TEMPLATE), '/h.org');
    expect(t.purpose && t.vision && t.goals && t.areas).toBeTruthy();
    expect(t.areaList.length).toBeGreaterThan(0);
  });

  test('ruta y tipos', () => {
    expect(horizonsPathNear('/gtd/inbox.org')).toBe('/gtd/horizons.org');
    expect(horizonsPathNear('')).toBe('/horizons.org');
    expect(horizonKindOf('Visión (3–5 años)')).toBe('vision');
    expect(horizonKindOf('Areas de responsabilidad')).toBe('areas');
    expect(horizonKindOf('Otra cosa')).toBe(null);
  });
});

describe('4.07: objetivos y áreas con sus proyectos', () => {
  const tasks = tasksOf(TASKS);
  const v = horizonsView(h, tasks, new Date(2026, 9, 21));

  test('objetivo con su proyecto (enlace :OBJETIVO:, sin mirar mayúsculas)', () => {
    expect(v.objectives[0].projects.map((p) => p.title)).toEqual(['Correr']);
    expect(v.objectives[0].empty).toBe(false);
    expect(v.objectives[1].empty).toBe(true);
    expect(objectiveRefOf(tasks.find((t) => t.title === 'Correr')).id).toBe('obj-1');
  });

  test('áreas: un dormido no cuenta como activo', () => {
    const by = (n) => v.areas.find((a) => a.name === n);
    expect(by('Casa').projects.map((p) => p.title)).toEqual(['Trastero']);
    expect(by('Casa').empty).toBe(true);
    expect(by('Salud').empty).toBe(false);
    expect(by('Trabajo').empty).toBe(true);
  });

  test('sin objetivo ni área de la lista', () => {
    expect(v.loose.map((p) => p.title)).toEqual(['Suelto']);
  });

  test('áreas usadas que faltan en el fichero', () => {
    expect(missingAreas(h, tasks)).toEqual(['Dinero']);
  });

  test('lista para elegir objetivo', () => {
    expect(objectivePickItems(h).map((x) => x.label)).toEqual(['Media maratón', 'Aprender alemán']);
  });
});

describe('4.07: sección Horizontes', () => {
  test('apagada por defecto y fuera de las listas', () => {
    const cfg = normalizeGtdSections(null);
    expect(cfg.order).toContain('horizons');
    expect(cfg.sections.horizons.show).toBe(false);
    expect(isActionSection('horizons')).toBe(true);
    expect(cfg.files.horizons).toBe('');
  });

  test('se puede encender y elegir el fichero', () => {
    const cfg = normalizeGtdSections({
      sections: { horizons: { show: true } },
      files: { horizons: 'gtd/metas.org' },
    });
    expect(cfg.sections.horizons.show).toBe(true);
    expect(cfg.files.horizons).toBe('/gtd/metas.org');
  });
});
