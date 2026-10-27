// 4.27: apuntes como notas, contadores del día y registro mensual (mensual-AAAA.org)
import {
  addEntry,
  setAnswer,
  setDayProp,
  parseDays,
  withDiaryIds,
  diaryLinkDetail,
  isDiaryPath,
  cleanCounters,
  ensureDay,
} from './eli_diary';
import {
  monthlyPath,
  parseNum,
  fmtNum,
  monthlyData,
  regenerateMonthly,
  BEGIN,
  END,
} from './eli_monthly';

// (4.38) Estas pruebas son del formato ANTERIOR (`* AAAA-MM mes` › `** AAAA-MM-DD día`): se parte
// de un fichero que ya está en ese formato (uno vacío se crea ya en formato org-journal).
const OLD = '#+TITLE: Diari 2026\n#+STARTUP: overview\n\n* 2026-01 enero\n';
const d = (y, m, day) => new Date(y, m - 1, day);
const C = [
  { key: 'B', name: 'Biblia', type: 'bool' },
  { key: 'KM', name: 'Kilómetros', type: 'num' },
];

describe('4.27 diario', () => {
  test('apuntes como notas del día; lee también los *** viejos', () => {
    const old =
      '#+TITLE: Diari 2026\n\n* 2026-10 octubre\n** 2026-10-24 sábado\n*** 12:00 x viejo\n';
    let t = addEntry(old, d(2026, 10, 24), { text: 'nuevo', mark: 'o', time: '13:00' }, []);
    t = addEntry(t, d(2026, 10, 24), { text: 'antes', time: '09:00' }, []);
    expect(t).toContain(
      '** 2026-10-24 sábado\n- 09:00 - antes\n- 13:00 o nuevo\n*** 12:00 x viejo'
    );
    expect(parseDays(t)[0].entries.map((e) => e.text)).toEqual(['antes', 'viejo', 'nuevo']);
  });
  test('respuesta nueva va antes de los apuntes', () => {
    let t = addEntry(OLD, d(2026, 10, 24), { text: 'a', time: '09:00' }, ['P']);
    t = setAnswer(t, d(2026, 10, 24), 'Q', 'r');
    expect(t).toContain('- P ::\n- Q :: r\n- 09:00 - a');
    expect(parseDays(t)[0].answers.length).toBe(2);
  });
  test('contadores = propiedades del día', () => {
    let t = setDayProp(OLD, d(2026, 10, 24), 'km', '4,5', []);
    t = setDayProp(t, d(2026, 10, 24), 'B', 'X', []);
    expect(t).toContain(':PROPERTIES:\n:KM: 4,5\n:B: X\n:END:');
    expect(parseDays(t)[0].props).toEqual({ KM: '4,5', B: 'X' });
    t = setDayProp(t, d(2026, 10, 24), 'KM', '', []);
    t = setDayProp(t, d(2026, 10, 24), 'B', '', []);
    expect(t).not.toContain(':PROPERTIES:');
  });
  test(':ID: en días con algo y en su mes; enlaces de mes', () => {
    let t = ensureDay(OLD, d(2026, 10, 23), ['P']).text;
    t = addEntry(t, d(2026, 10, 24), { text: 'a', time: '09:00' }, ['P']);
    const w = withDiaryIds(t);
    expect(w).toContain('* 2026-10 octubre\n:PROPERTIES:\n:ID: diari-2026-10\n:END:');
    expect(w).toContain('** 2026-10-24 sábado\n:PROPERTIES:\n:ID: diari-2026-10-24\n:END:');
    expect(w).not.toContain('diari-2026-10-23');
    expect(withDiaryIds(w)).toBe(w);
    expect(diaryLinkDetail('diari-2026-10')).toEqual({ month: '2026-10' });
    expect(diaryLinkDetail('diari-2026-10-24')).toEqual({ date: '2026-10-24' });
    expect(isDiaryPath('/x/pages/mensual-2026.org')).toBe(true);
  });
  test('contadores limpios', () => {
    expect(
      cleanCounters([{ key: 'km', type: 'num' }, { key: 'KM' }, { key: 'id' }, { key: '' }])
    ).toEqual([{ key: 'KM', name: 'KM', type: 'num' }]);
  });
});

describe('4.27 registro mensual', () => {
  const diary = () => {
    let t = setAnswer(OLD, d(2026, 10, 1), 'Lo más importante de hoy', 'empezar | bien');
    t = setDayProp(t, d(2026, 10, 1), 'B', 'X', []);
    t = setDayProp(t, d(2026, 10, 1), 'KM', '4,5', []);
    t = setDayProp(t, d(2026, 10, 2), 'KM', '3.5', []);
    t = setDayProp(t, d(2026, 10, 5), 'B', 'x', []);
    t = setDayProp(t, d(2026, 10, 5), 'KM', '2', []);
    t = addEntry(t, d(2026, 10, 5), { text: 'solo apunte', time: '10:00' }, []);
    return withDiaryIds(t);
  };
  test('números con coma o punto', () => {
    expect(parseNum('4,5')).toBe(4.5);
    expect(parseNum('4.5')).toBe(4.5);
    expect(parseNum('abc')).toBe(null);
    expect(fmtNum(8)).toBe('8');
    expect(fmtNum(4.5 + 3.5 + 0.25)).toBe('8,25');
  });
  test('semanas, subtotales y total; texto = lo más importante', () => {
    const m = monthlyData(diary(), 2026, C).months;
    expect(m.map((x) => x.key)).toEqual(['2026-10']);
    const rows = m[0].rows;
    expect(rows.filter((r) => r.type === 'day').length).toBe(31);
    const weeks = rows.filter((r) => r.type === 'week');
    expect(weeks[0].values).toEqual(['1', '8']); // 1–4 oct. (jue–dom)
    expect(weeks[1].values).toEqual(['1', '2']);
    expect(rows[rows.length - 1]).toEqual({ type: 'total', values: ['2', '10'], days: 3 });
    expect(rows[0].lines).toEqual(['empezar | bien']);
    expect(rows[0].link).toBe('diari-2026-10-01');
    expect(rows.find((r) => r.key === '2026-10-05').lines).toEqual([]);
    expect(rows.find((r) => r.key === '2026-10-03').link).toBe(null);
  });
  test('fichero nuevo: totales al principio, mes con enlaces', () => {
    expect(monthlyPath(2026, '/a/pages/')).toBe('/a/pages/mensual-2026.org');
    expect(regenerateMonthly('', 2026, '', C)).toBe(null);
    const t = regenerateMonthly('', 2026, diary(), C);
    expect(t.indexOf('* Totales del año')).toBeLessThan(t.indexOf('* 2026-10 octubre'));
    expect(t).toContain('* 2026-10 octubre [[id:diari-2026-10][Ver en el diari]]');
    expect(t).toContain('| [[id:diari-2026-10-01][01 jue.]] | empezar ¦ bien | X | 4,5 |');
    expect(t).toContain('| 03 sáb. |  |  |  |');
    expect(t).toContain('| Semana |  | 1 | 8 |');
    expect(t).toContain('| Total | 3 días con algo | 2 | 10 |');
    expect(t).toContain('| octubre | 3 | 2 | 10 |');
    expect(t).toContain('#+ATTR_LATEX');
  });
  test('rehacer respeta lo de fuera de las marcas y pierde lo de dentro', () => {
    const t = regenerateMonthly('', 2026, diary(), C);
    const edited = t
      .replace('* 2026-10 octubre', 'Mi nota de arriba\n* 2026-10 octubre')
      .replace(END('2026-10'), END('2026-10') + '\nComentario de octubre')
      .replace('| Semana |  | 1 | 8 |', '| Semana |  | 1 | 99 |');
    let more = setDayProp(diary(), d(2026, 11, 3), 'KM', '1', []);
    more = setDayProp(more, d(2026, 9, 3), 'B', 'X', []);
    const r = regenerateMonthly(edited, 2026, more, C);
    expect(r).toContain('Mi nota de arriba');
    expect(r).toContain('Comentario de octubre');
    expect(r).not.toContain('99');
    expect(r.split(BEGIN('2026-10')).length).toBe(2);
    const order = ['* 2026-09', '* 2026-10', 'Comentario de octubre', '* 2026-11'].map((k) =>
      r.indexOf(k)
    );
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(regenerateMonthly(r, 2026, more, C)).toBe(r);
  });
  test('mes con apartado pero sin marcas: tabla al principio', () => {
    const r = regenerateMonthly('#+TITLE: x\n\n* 2026-10 octubre\ntexto mío\n', 2026, diary(), C);
    expect(r).toContain(`* 2026-10 octubre\n${BEGIN('2026-10')}\n#+ATTR_LATEX`);
    expect(r).toContain(`${END('2026-10')}\ntexto mío`);
    expect(r).not.toContain('Totales del año');
  });
});
