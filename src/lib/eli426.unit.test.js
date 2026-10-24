// ORG Mode para Eli (4.26): diario
import {
  diaryDir,
  diaryPath,
  isDiaryPath,
  inboxNear,
  ensureDay,
  addEntry,
  setAnswer,
  ensureDayId,
  parseDays,
  daysWithEntries,
  onThisDay,
  doneOn,
  monthGrid,
  dayOfOrgId,
  templateFromText,
  getDiaryCfg,
  setDiaryCfg,
} from './eli_diary';
import { MENU_ENTRIES } from './eli_menu_layout';

const d = (y, m, day, h = 10, min = 0) => new Date(y, m - 1, day, h, min);

describe('4.26 rutas', () => {
  test('pages/diari-AAAA.org junto al de entrada', () => {
    const dir = diaryDir('', '/Dropbox/org/inbox.org');
    expect(dir).toBe('/Dropbox/org/pages/');
    expect(diaryPath(2026, dir)).toBe('/Dropbox/org/pages/diari-2026.org');
    expect(diaryDir('diario', '/a/inbox.org')).toBe('/a/diario/');
    expect(diaryDir('/x/y', '/a/inbox.org')).toBe('/x/y/');
    expect(isDiaryPath('/a/pages/diari-2026.org')).toBe(true);
    expect(isDiaryPath('/a/diario-2026.org')).toBe(false);
    expect(inboxNear(null, ['/b/c/inbox.org', '/z/inbox.org'])).toBe('/z/inbox.org');
    expect(inboxNear(null, [])).toBe('/inbox.org');
  });
  test('«diary» en el Menú ☰ tras «scratch»', () => {
    const ids = MENU_ENTRIES.map((e) => e.id);
    expect(ids.indexOf('diary')).toBe(ids.indexOf('scratch') + 1);
  });
});

describe('4.26 fichero', () => {
  const tpl = ['¿Cómo me siento hoy?', 'Agradecido por…'];
  test('crea mes y día con la plantilla, en orden cronológico', () => {
    let t = ensureDay('', d(2026, 10, 24), tpl).text;
    expect(t).toContain('#+TITLE: Diari 2026');
    expect(t).toContain('* 2026-10 octubre\n** 2026-10-24 sábado\n- ¿Cómo me siento hoy? ::\n');
    t = ensureDay(t, d(2026, 10, 2), tpl).text;
    t = ensureDay(t, d(2026, 9, 30), []).text;
    const order = ['2026-09 ', '2026-09-30', '2026-10 ', '2026-10-02', '2026-10-24'].map((k) =>
      t.indexOf(k)
    );
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(ensureDay(t, d(2026, 10, 24), tpl).created).toBe(false);
  });
  test('apuntes por hora, con marca y en orden', () => {
    let t = addEntry('', d(2026, 10, 24), { text: 'café', time: '13:23' }, []);
    t = addEntry(t, d(2026, 10, 24), { text: 'cita\nen el centro', mark: 'o', time: '09:05' }, []);
    t = addEntry(t, d(2026, 10, 24), { text: 'ojo', mark: '!', time: '20:00' }, []);
    // (4.27) como notas del día, no como cabeceras
    expect(t).toContain('- 09:05 o cita\n  en el centro\n- 13:23 - café\n- 20:00 ! ojo');
    expect(t).not.toContain('***');
    const day = parseDays(t)[0];
    expect(day.entries.map((e) => e.mark)).toEqual(['o', '-', '!']);
    expect(day.entries[0].body).toBe('en el centro');
    expect(daysWithEntries(t).has('2026-10-24')).toBe(true);
  });
  test('respuestas de la plantilla', () => {
    let t = ensureDay('', d(2026, 10, 24), ['Lo más importante']).text;
    expect(daysWithEntries(t).size).toBe(0);
    t = setAnswer(t, d(2026, 10, 24), 'Lo más importante', 'terminar la 4.26');
    expect(t).toContain('- Lo más importante :: terminar la 4.26');
    expect(parseDays(t)[0].answers).toEqual([
      { question: 'Lo más importante', answer: 'terminar la 4.26' },
    ]);
    expect(daysWithEntries(t).has('2026-10-24')).toBe(true);
  });
  test(':ID: del día legible y estable', () => {
    const t0 = addEntry('', d(2026, 10, 24), { text: 'x', time: '10:00' }, ['P']);
    const r = ensureDayId(t0, d(2026, 10, 24));
    expect(r.id).toBe('diari-2026-10-24');
    expect(r.text).toContain(
      '** 2026-10-24 sábado\n:PROPERTIES:\n:ID: diari-2026-10-24\n:END:\n- P ::'
    );
    expect(ensureDayId(r.text, d(2026, 10, 24)).text).toBe(r.text);
    expect(dayOfOrgId(r.id)).toBe('2026-10-24');
    expect(parseDays(r.text)[0].notes).toEqual([]);
  });
});

describe('4.26 lectura', () => {
  test('tal día como hoy entre ficheros', () => {
    const t25 = addEntry('', d(2025, 10, 24), { text: 'hace un año', time: '08:00' }, []);
    const t24 = addEntry('', d(2024, 10, 23), { text: 'otro día', time: '08:00' }, []);
    const r = onThisDay({ 2025: t25, 2024: t24, 2026: '' }, d(2026, 10, 24));
    expect(r.map((x) => x.year)).toEqual([2025]);
    expect(r[0].day.entries[0].text).toBe('hace un año');
  });
  test('hecho hoy = CLOSED ese día', () => {
    const tasks = [
      { title: 'a', closed: d(2026, 10, 24, 18) },
      { title: 'b', closed: d(2026, 10, 23, 18) },
      { title: 'c', closed: d(2026, 10, 24, 9) },
      { title: 'd', closed: null },
      { title: 'e', closed: d(2026, 10, 24, 9), isTrashed: true },
    ];
    expect(doneOn(tasks, d(2026, 10, 24)).map((t) => t.title)).toEqual(['c', 'a']);
  });
  test('calendario empieza en lunes', () => {
    const g = monthGrid(2026, 9); // octubre 2026: el 1 es jueves
    expect(g[0][3]).toEqual({ key: '2026-10-01', day: 1, inMonth: true });
    expect(g[0][0].inMonth).toBe(false);
  });
  test('ajuste y plantilla', () => {
    expect(templateFromText(' a \n\n b ')).toEqual(['a', 'b']);
    setDiaryCfg({ templateOn: false, dir: 'diario/' });
    expect(getDiaryCfg()).toMatchObject({ templateOn: false, dir: 'diario/', inSystem: true });
    window.localStorage.removeItem('eliDiary');
    expect(getDiaryCfg().templateOn).toBe(true);
  });
});
