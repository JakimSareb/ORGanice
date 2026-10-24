// 4.21: el Tickler se filtra como el resto de secciones (texto, etiquetas, Área).
import { Map } from 'immutable';

import { parseOrg } from '../parse_org';
import { buildTasks, facetsFor, NO_TAGS } from './gtd_model';
import { filterTickler, groupTickler } from './gtd_tickler';

const TODAY = new Date(2026, 9, 22);
const TICKLER = [
  '* *[ TICKLER 2026 ]*',
  '** OCTUBRE',
  '*** Revisar caldera :casa:',
  'SCHEDULED: <2026-10-28 Wed>',
  'Llamar al técnico',
  '*** Llamar a Luis :llamadas:',
  'SCHEDULED: <2026-10-23 Fri>',
  '*** Pagar seguro :casa:',
  ':PROPERTIES:',
  ':AREA: Hogar',
  ':END:',
  'SCHEDULED: <2026-10-30 Fri>',
  '*** Sin etiqueta',
  'SCHEDULED: <2026-10-25 Sun>',
  '',
].join('\n');
const tasks = buildTasks(Map({ '/tickler.org': parseOrg(TICKLER) }), []);
const titles = (list) => list.map((t) => t.title).sort();

describe('4.21: filtrar el Tickler', () => {
  test('sin filtros salen todas las entradas (no los contenedores)', () => {
    expect(filterTickler(tasks, {})).toHaveLength(4);
  });

  test('texto: busca en título y en notas, sin distinguir mayúsculas', () => {
    expect(titles(filterTickler(tasks, { text: 'LUIS' }))).toEqual(['Llamar a Luis']);
    expect(titles(filterTickler(tasks, { text: 'técnico' }))).toEqual(['Revisar caldera']);
    expect(filterTickler(tasks, { text: 'nada de esto' })).toHaveLength(0);
  });

  test('etiquetas: solo las que la llevan, tachadas y «sin etiquetas»', () => {
    expect(titles(filterTickler(tasks, { tags: ['casa'] }))).toEqual([
      'Pagar seguro',
      'Revisar caldera',
    ]);
    expect(titles(filterTickler(tasks, { notTags: ['casa'] }))).toEqual([
      'Llamar a Luis',
      'Sin etiqueta',
    ]);
    expect(titles(filterTickler(tasks, { tags: [NO_TAGS] }))).toEqual(['Sin etiqueta']);
  });

  test('Área: solo las de esa área, «-» las que no tienen', () => {
    expect(titles(filterTickler(tasks, { area: 'Hogar' }))).toEqual(['Pagar seguro']);
    expect(filterTickler(tasks, { area: '-' })).toHaveLength(3);
    expect(filterTickler(tasks, { area: '*' })).toHaveLength(4);
  });

  test('las etiquetas de la barra salen de las entradas del Tickler', () => {
    const f = facetsFor(filterTickler(tasks, {}));
    expect(f.tags.sort()).toEqual(['casa', 'llamadas']);
  });

  test('agrupa lo filtrado igual que antes (por fecha)', () => {
    const g = groupTickler(filterTickler(tasks, { tags: ['casa'] }), TODAY);
    expect(g.map((x) => x.id)).toEqual(['d28', 'd30']);
  });
});
