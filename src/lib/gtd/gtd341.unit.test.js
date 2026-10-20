import { Map } from 'immutable';
import { parseOrg } from '../parse_org';
import { buildTasks } from './gtd_model';
import {
  weeklyReview,
  reviewCount,
  REVIEW_STEPS,
  REVIEW_PHASES,
  reviewStepIndex,
} from './gtd_review';

const HEAD = '#+TODO: TODO NEXT WAITING MAYBE PROJECT | DONE CANCELLED\n';
const TODAY = new Date(2026, 9, 20);
const tasksOf = (text) => buildTasks(Map({ '/p.org': parseOrg(HEAD + text) }), []);
const titles = (l) => l.map((t) => t.title);

describe('3.41: revisión semanal con la checklist oficial', () => {
  test('pasos en orden: Despejar → Al día → Crear; semana justo después de Next', () => {
    const ids = REVIEW_STEPS.map((s) => s.id);
    expect(ids[0]).toBe('inbox');
    expect(reviewStepIndex('week')).toBe(reviewStepIndex('next') + 1);
    expect(ids[ids.length - 1]).toBe('someday');
    const phases = REVIEW_STEPS.map((s) => s.phase);
    expect([...new Set(phases)]).toEqual(['clear', 'current', 'creative']);
    phases.forEach((ph) => expect(REVIEW_PHASES[ph]).toBeTruthy());
  });
  test('Next, Todo, Waiting y la cuenta de «Elegir para la semana»', () => {
    const r = weeklyReview(
      tasksOf(
        [
          '* NEXT Beta',
          '* NEXT Alfa',
          '* TODO Más tarde',
          '* WAITING Respuesta',
          '* MAYBE Algún día',
          '* DONE Ya está',
          '* PROJECT Proy',
          '** NEXT Paso del proyecto',
        ].join('\n')
      ),
      TODAY
    );
    expect(titles(r.next)).toEqual(['Alfa', 'Beta', 'Paso del proyecto']);
    expect(titles(r.later)).toEqual(['Más tarde']);
    expect(titles(r.waiting)).toEqual(['Respuesta']);
    expect(reviewCount(r, 'week')).toBe(2);
  });
});
