import { Map } from 'immutable';
import { parseOrg } from '../parse_org';
import { buildTasks, nestRefKids, filterHeadings } from './gtd_model';
import { projectPlan } from './gtd_guided';
import { describeRepeat } from '../../components/Gtd/ScheduleField';

const HEAD = '#+TODO: TODO NEXT WAITING PROJECT | DONE CANCELLED\n';
const file = parseOrg(
  HEAD +
    '* Ref\nnota de Ref\n** Sub\nnota de Sub\n*** SubSub\n* Otra\n* PROJECT Proy :uno:\n:PROPERTIES:\n:ID: p1\n:END:\n** Material :mat:\n** NEXT Hacer\n'
);
const tasks = buildTasks(Map({ '/a.org': file }), []);
const byTitle = (t) => tasks.find((x) => x.title === t);
const items = ['Ref', 'Sub', 'SubSub', 'Otra'].map((t) => ({
  kind: 'task',
  task: byTitle(t),
  section: 'list',
}));
const idOf = (t) => t.key;

describe('4.32: Referencias expandibles', () => {
  test('plegadas: solo las raíces, con ▸ si tienen hijas', () => {
    const out = nestRefKids(items, tasks, new Set(), idOf);
    expect(out.map((i) => i.task.title)).toEqual(['Ref', 'Otra']);
    expect(out[0].hasKids).toBe(true);
    expect(out[0].folded).toBe(true);
    expect(out[1].hasKids).toBeFalsy();
  });
  test('desplegadas a varios niveles', () => {
    const open = new Set([byTitle('Ref').key, byTitle('Sub').key]);
    const out = nestRefKids(items, tasks, open, idOf);
    expect(out.map((i) => [i.task.title, i.depth || 0])).toEqual([
      ['Ref', 0],
      ['Sub', 1],
      ['SubSub', 2],
      ['Otra', 0],
    ]);
    expect(out[1].forceNotes).toBe(true);
  });
  test('una hija abierta con ▸ pero la madre plegada no sale', () => {
    const out = nestRefKids(items, tasks, new Set([byTitle('Sub').key]), idOf);
    expect(out.map((i) => i.task.title)).toEqual(['Ref', 'Otra']);
  });
});

describe('4.32: icono de repetición', () => {
  test('el repetidor se lee y se describe', () => {
    const f = parseOrg(HEAD + '* NEXT Cada semana\nSCHEDULED: <2026-10-26 lun +1w>\n');
    const t = buildTasks(Map({ '/r.org': f }), [])[0];
    expect(t.scheduledRepeat).toBe('+1w');
    expect(describeRepeat(t.scheduledRepeat)).toBe('cada semana');
  });
});

describe('4.32: Quién al planificar = delegar', () => {
  test('con Quién la acción va a Waiting con la persona', () => {
    const out = projectPlan({
      name: 'P',
      ideas: ['A'],
      first: 'A',
      firstWho: '@Ana López',
      nexts: {},
    });
    expect(out.tasks[0]).toMatchObject({ title: 'A', list: 'waiting', tags: ['Ana_López'] });
  });
  test('sin Quién sigue en Next', () => {
    const out = projectPlan({ name: 'P', ideas: ['A'], first: 'A', nexts: {} });
    expect(out.tasks[0].list).toBe('next');
  });
});

describe('4.32: cabeceras sin estado y la barra de etiquetas', () => {
  test('las Referencias de un proyecto aportan sus etiquetas', () => {
    const proj = byTitle('Proy');
    const heads = filterHeadings(tasks, { type: 'project', key: proj.key });
    expect(heads.map((t) => t.title)).toEqual(['Material']);
    expect(heads[0].tags).toEqual(expect.arrayContaining(['mat', 'uno']));
  });
  test('vista de etiqueta con cabeceras: solo si está activada', () => {
    const view = { id: 'tag', tag: 'mat' };
    expect(filterHeadings(tasks, view, false)).toEqual([]);
    expect(filterHeadings(tasks, view, true).map((t) => t.title)).toEqual(['Material']);
  });
});
