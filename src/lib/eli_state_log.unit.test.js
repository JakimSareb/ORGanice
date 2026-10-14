import { tidyStateLog, stateLineTime } from './eli_state_log';
import { parseOrg } from './parse_org';
import { exportOrg } from './export_org';
import { fromJS } from 'immutable';
import rootOrgReducer from '../reducers/org';

describe('3.05: Ordenar historial (líneas de estado al LOGBOOK)', () => {
  test('sin cajón: lo crea tras la planificación y :PROPERTIES:, en el mismo orden', () => {
    const body = [
      'SCHEDULED: <2026-10-01 Thu>',
      ':PROPERTIES:',
      ':ID: abc',
      ':END:',
      '- State "DONE"       from "TODO"       [2026-10-02 Fri 10:00]',
      '- State "TODO"       from "NEXT"       [2026-10-01 Thu 09:00]',
      'Notas de la tarea',
    ].join('\n');
    const r = tidyStateLog(body);
    expect(r.moved).toBe(2);
    expect(r.text.split('\n')).toEqual([
      'SCHEDULED: <2026-10-01 Thu>',
      ':PROPERTIES:',
      ':ID: abc',
      ':END:',
      ':LOGBOOK:',
      '- State "DONE"       from "TODO"       [2026-10-02 Fri 10:00]',
      '- State "TODO"       from "NEXT"       [2026-10-01 Thu 09:00]',
      ':END:',
      'Notas de la tarea',
    ]);
  });

  test('con cajón: cada una delante de la primera más antigua; notas de varias líneas juntas', () => {
    const body = [
      ':LOGBOOK:',
      '- State "DONE"       from "TODO"       [2026-10-05 Mon 10:00]',
      '- State "TODO"       from "NEXT"       [2026-09-01 Tue 09:00]',
      'CLOCK: [2026-08-01 Sat 10:00]--[2026-08-01 Sat 11:00] =>  1:00',
      ':END:',
      'Texto',
      '- State "NEXT"       from "TODO"       [2026-09-10 Thu 08:00] \\\\',
      '  una nota',
      '  de dos líneas',
      '- una lista normal',
    ].join('\n');
    const r = tidyStateLog(body);
    expect(r.moved).toBe(1);
    expect(r.text.split('\n')).toEqual([
      ':LOGBOOK:',
      '- State "DONE"       from "TODO"       [2026-10-05 Mon 10:00]',
      '- State "NEXT"       from "TODO"       [2026-09-10 Thu 08:00] \\\\',
      '  una nota',
      '  de dos líneas',
      '- State "TODO"       from "NEXT"       [2026-09-01 Tue 09:00]',
      'CLOCK: [2026-08-01 Sat 10:00]--[2026-08-01 Sat 11:00] =>  1:00',
      ':END:',
      'Texto',
      '- una lista normal',
    ]);
  });

  test('nada que mover: el texto no cambia', () => {
    const body = ':LOGBOOK:\n- State "DONE" from "TODO" [2026-10-05 Mon 10:00]\n:END:\nTexto';
    expect(tidyStateLog(body)).toEqual({ text: body, moved: 0 });
    expect(stateLineTime('- State "A" from "B" [2026-10-05 Mon 10:30]')).toBe(
      new Date(2026, 9, 5, 10, 30).getTime()
    );
  });

  test('reducer: el fichero entero, y se exporta con el cajón', () => {
    const text = [
      '* DONE Tarea',
      '  CLOSED: [2026-10-02 Fri 10:00]',
      '  - State "DONE"       from "TODO"       [2026-10-02 Fri 10:00] \\\\',
      '    con nota',
      '  Cuerpo',
      '* Otra',
      '  sin historial',
      '',
    ].join('\n');
    const parsed = parseOrg(text);
    let state = fromJS({ path: '/a.org', files: {} }).setIn(['files', '/a.org'], parsed);
    state = rootOrgReducer(state, { type: 'ELI_TIDY_STATE_LOG', dirtying: true });
    const file = state.getIn(['files', '/a.org']);
    expect(file.get('isDirty')).toBe(true);
    const out = exportOrg({
      headers: file.get('headers'),
      linesBeforeHeadings: file.get('linesBeforeHeadings'),
      todoKeywordSets: file.get('todoKeywordSets'),
      fileConfigLines: file.get('fileConfigLines'),
      dontIndent: false,
    });
    expect(out).toContain(
      [
        '  CLOSED: [2026-10-02 Fri 10:00]',
        '  :LOGBOOK:',
        '  - State "DONE"       from "TODO"       [2026-10-02 Fri 10:00] \\\\',
        '    con nota',
        '  :END:',
        '  Cuerpo',
      ].join('\n')
    );
    expect(out).toContain('* Otra\n  sin historial');
  });
});
