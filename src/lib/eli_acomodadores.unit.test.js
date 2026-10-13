import {
  parseAcom,
  saveMonth,
  weeksOf,
  emptyMonth,
  suggestedMonth,
  countersWith,
  availableFor,
  parseAssigned,
  pendingMonths,
  parseLast,
  saveConfig,
} from './eli_acomodadores';

const TODAY = new Date(2026, 9, 13);
const FILE = `#+TITLE: Acomodadores
#+ACOM_ALIAS: Toni=Antonio Vilchez; Miguel Angel Lliteras=Miguel Lliteras
* Hermanos
#+NAME: Publicadores
| Nombre          | Veces | Mes |
|-----------------+-------+-----|
| Antonio Vilchez |     3 | Ago |
| Juan Pérez      |     1 | Jun |
| Pedro Gil       |     1 | Dic |
#+NAME: Ancianos
| Nombre         | Veces | Mes |
|----------------+-------+-----|
| Miguel Lliteras |    2 | Jul |
#+NAME: Ministeriales
| Nombre  | Veces | Mes |
|---------+-------+-----|
| Luis Mas |    0 |     |
* HISTORICO
** 2026, Agosto
| Semana | Dia        | Acomodador 1 | Acomodador 2 |
|--------+------------+--------------+--------------|
| 3-Ago  | Jue-6-Ago  | Toni         | Juan Pérez   |
** 2026, Septiembre
| Semana | Dia        | Acomodador 1 | Acomodador 2 |
|--------+------------+--------------+--------------|
| 7-Sep  | Jue-10-Sep | Toni         | Luis Mas     |
|        | Sab-12-Sep | Toni         | Manuel Eslava |
| 14-Sep | Jue-17-Sep | ASAMBLEA     |              |
| XX-May |            |              |              |
`;

describe('3.01: acomodadores', () => {
  test('lee contadores, alias y meses', () => {
    const a = parseAcom(FILE, TODAY);
    expect(a.groups.map((g) => g.id)).toEqual(['publicadores', 'ancianos', 'ministeriales']);
    expect(a.groups[0].rows[0].veces).toBe(3);
    expect(a.months.map((m) => `${m.year}-${m.month}`)).toEqual(['2026-7', '2026-8']);
    expect(pendingMonths(a).map((m) => m.month)).toEqual([8]); // desde septiembre de 2026
    // la base solo tiene el mes: el más reciente que no pase de hoy
    expect(parseLast('Dic', TODAY)).toEqual(new Date(2025, 11, 1));
    expect(parseLast('Ago', TODAY)).toEqual(new Date(2026, 7, 1));
    expect(parseLast('2026-09-10', TODAY)).toEqual(new Date(2026, 8, 10));
  });

  test('semanas = lunes del mes, con los días de reunión', () => {
    const w = weeksOf(2026, 9, { semanas: 5, dias: ['jue', 'sab'] });
    expect(w.map((x) => x.semana)).toEqual(['5-Oct', '12-Oct', '19-Oct', '26-Oct']);
    expect(w[0].days.map((d) => d.dia)).toEqual(['Jue-8-Oct', 'Sab-10-Oct']);
    expect(emptyMonth(2026, 9, { semanas: 2, dias: ['jue'] }).length).toBe(2);
    expect(suggestedMonth(parseAcom(FILE, TODAY), TODAY)).toEqual({ year: 2026, month: 9 });
  });

  test('disponibles: sin los asignados, por menos turnos y fecha más antigua', () => {
    const a = parseAcom(FILE, TODAY);
    const { names, unknown } = parseAssigned(a, 'toni\nManuel Eslava\n');
    expect(names).toEqual(['Antonio Vilchez']);
    expect(unknown).toEqual(['Manuel Eslava']);
    const av = availableFor(countersWith(a), { exclude: names });
    const pub = av.find((g) => g.id === 'publicadores').people.map((p) => p.name);
    expect(pub).toEqual(['Pedro Gil', 'Juan Pérez']); // 1 y 1: Dic-2025 antes que Jun-2026
  });

  test('guardar un mes: suma los turnos (una vez por semana), marca :SUMADO: y no repite', () => {
    const r = saveMonth(
      FILE,
      {
        year: 2026,
        month: 9,
        rows: [
          { semana: '5-Oct', dia: 'Jue-8-Oct', names: ['Pedro Gil', 'Toni'] },
          { semana: '5-Oct', dia: 'Sab-10-Oct', names: ['Pedro Gil', 'Miguel Angel Lliteras'] },
        ],
      },
      TODAY
    );
    expect(r.summed).toEqual(['2026, Septiembre', '2026, Octubre']);
    expect(r.unknown).toEqual(['Manuel Eslava']);
    const a = parseAcom(r.text, TODAY);
    const row = (n) => a.groups.flatMap((g) => g.rows).find((x) => x.name === n);
    // Toni: septiembre (1 semana, aunque fueran 2 días) + octubre (1) = 3 + 2
    expect(row('Antonio Vilchez').veces).toBe(5);
    expect(row('Antonio Vilchez').lastRaw).toBe('2026-10-08');
    expect(row('Pedro Gil').veces).toBe(2);
    expect(row('Miguel Lliteras').veces).toBe(3);
    expect(row('Luis Mas').veces).toBe(1);
    expect(row('Juan Pérez').veces).toBe(1); // agosto ya estaba en la base
    expect(a.months.every((m) => m.month === 7 || m.sumado)).toBe(true);
    expect(r.text).toMatch(
      /\*\* 2026, Octubre\n:PROPERTIES:\n:SUMADO: 2026-10-13\n:END:\n\| Semana/
    );
    // volver a guardar octubre cambiando un nombre: solo la diferencia
    const r2 = saveMonth(
      r.text,
      {
        year: 2026,
        month: 9,
        rows: [
          { semana: '5-Oct', dia: 'Jue-8-Oct', names: ['Juan Pérez', 'Toni'] },
          { semana: '5-Oct', dia: 'Sab-10-Oct', names: ['Juan Pérez', 'Toni'] },
        ],
      },
      TODAY
    );
    const b = parseAcom(r2.text, TODAY);
    const row2 = (n) => b.groups.flatMap((g) => g.rows).find((x) => x.name === n);
    expect(row2('Antonio Vilchez').veces).toBe(5);
    expect(row2('Pedro Gil').veces).toBe(1);
    expect(row2('Juan Pérez').veces).toBe(2);
    expect(row2('Miguel Lliteras').veces).toBe(2);
    expect(r2.summed).toEqual([]);
  });

  test('ajustes en el fichero', () => {
    const t = saveConfig(FILE, { semanas: 4, dias: ['mar', 'dom'] });
    const a = parseAcom(t, TODAY);
    expect(a.config).toMatchObject({ semanas: 4, dias: ['mar', 'dom'] });
  });
});

describe('(3.03) semanas de otros meses', () => {
  const { addWeek, removeWeek, emptyMonth } = require('./eli_acomodadores');
  const config = { semanas: 5, dias: ['jue', 'sab'] };
  test('semana de antes (mes anterior) y de después (mes siguiente)', () => {
    let rows = emptyMonth(2026, 8, config); // septiembre 2026: lunes 7, 14, 21, 28
    expect(rows[0].semana).toBe('7-Sep');
    rows = addWeek(rows, 'before', { year: 2026, month: 8 }, config);
    expect(rows[0].semana).toBe('31-Ago');
    expect(rows[0].dia).toBe('Jue-3-Sep');
    rows = addWeek(rows, 'before', { year: 2026, month: 8 }, config);
    expect(rows[0].semana).toBe('24-Ago');
    expect(rows[0].dia).toBe('Jue-27-Ago');
    rows = addWeek(rows, 'after', { year: 2026, month: 8 }, config);
    expect(rows[rows.length - 1].semana).toBe('5-Oct');
    expect(rows[rows.length - 1].dia).toBe('Sab-10-Oct');
    rows = removeWeek(rows, 'first');
    expect(rows[0].semana).toBe('31-Ago');
    rows = removeWeek(rows, 'last');
    expect(rows[rows.length - 1].semana).toBe('28-Sep');
  });
  test('cambio de año', () => {
    let rows = emptyMonth(2027, 0, config);
    rows = addWeek(rows, 'before', { year: 2027, month: 0 }, config);
    expect(rows[0].semana).toBe('28-Dic');
    rows = addWeek(rows, 'before', { year: 2027, month: 0 }, config);
    expect(rows[0].semana).toBe('21-Dic');
  });
});
