// 4.33: ajustes sincronizados (fusión por clave), contador mensual, archivo por años y registro
import {
  mergeSettings,
  isSyncedKey,
  collectLocalPrefs,
  applyRemotePrefs,
  installPrefsWatcher,
  readStamps,
  writeStamps,
  canonical,
} from './eli_synced_prefs';
import {
  setMonthProp,
  parseMonthProps,
  setDayProp,
  cleanCounters,
  journalTitle,
  getDiaryCfg,
} from './eli_diary';
import { monthlyData, regenerateMonthly } from './eli_monthly';
import {
  planArchiveFile,
  appendTrees,
  closedDateOf,
  splitTopTrees,
  yearArchivePath,
  planSummary,
  isYearArchivePath,
} from './eli_archive_years';
import { addEvent, MAX_EVENTS, errorText, syncLogText } from './eli_sync_log';
import { isArchiveFile } from './eli_attachments';

const d = (y, m, day) => new Date(y, m - 1, day);

describe('4.33 ajustes entre dispositivos', () => {
  beforeEach(() => localStorage.clear());

  test('qué claves viajan y cuáles son de cada dispositivo', () => {
    expect(isSyncedKey('eliTools')).toBe(true);
    expect(isSyncedKey('eliMenuLayout')).toBe(true);
    expect(isSyncedKey('eliDiary')).toBe(true);
    expect(isSyncedKey('eliGtdStrict')).toBe(true);
    expect(isSyncedKey('eliWidth:gtd-side')).toBe(false);
    expect(isSyncedKey('eliContentWidth')).toBe(false);
    expect(isSyncedKey('eliTagsPos')).toBe(false);
    expect(isSyncedKey('eliLogseqEdit')).toBe(false);
    expect(isSyncedKey('eliPrefsStamps')).toBe(false);
    expect(isSyncedKey('eliSyncLog')).toBe(false);
    expect(isSyncedKey('eliGtdView')).toBe(false);
    expect(isSyncedKey('persistedFiles')).toBe(false);
    // los de organice van aparte (con su marca)
    expect(isSyncedKey('eliPagesFile', ['eliPagesFile'])).toBe(false);
  });

  test('fusión por clave: gana el cambio más reciente de cada ajuste', () => {
    const remote = {
      theme: 'Nirvana',
      fontSize: 'Large',
      eliStamps: { theme: 200, fontSize: 50 },
      eliPrefs: {
        eliTools: { v: '{"calc":false}', t: 300 },
        eliDiary: { v: '{"dir":"viejo/"}', t: 10 },
        eliMenuLayout: { v: null, t: 400 },
      },
    };
    const m = mergeSettings({
      remote,
      localStamps: { theme: 100, fontSize: 90, eliDiary: 500 },
      localPrefs: {
        eliTools: { v: '{"calc":true}', t: 100 },
        eliDiary: { v: '{"dir":"nuevo/"}', t: 500 },
        eliMenuLayout: { v: '{"order":[]}', t: 0 },
      },
      fieldNames: ['theme', 'fontSize'],
    });
    // theme: el del fichero es más nuevo; fontSize: el de aquí
    expect(m.fieldsFromRemote).toEqual(['theme']);
    expect(m.prefsFromRemote).toEqual({
      eliTools: { v: '{"calc":false}', t: 300 },
      eliMenuLayout: { v: null, t: 400 },
    });
    expect(m.stamps).toMatchObject({ theme: 200, fontSize: 90, eliTools: 300, eliDiary: 500 });
  });

  test('fichero viejo sin marcas: gana el fichero (como antes); sin fichero: nada', () => {
    const m = mergeSettings({
      remote: { theme: 'One' },
      localStamps: {},
      localPrefs: { eliTools: { v: '{}', t: 0 } },
      fieldNames: ['theme'],
    });
    expect(m.fieldsFromRemote).toEqual(['theme']);
    expect(m.prefsFromRemote).toEqual({});
    expect(mergeSettings({ remote: null, fieldNames: ['theme'] }).fieldsFromRemote).toEqual([]);
  });

  test('el vigilante marca la hora del cambio y aplicar lo remoto no cuenta como cambio', () => {
    let changes = 0;
    installPrefsWatcher({ redux: ['eliPagesFile'], changed: () => changes++ });
    localStorage.setItem('eliTools', '{"calc":true}');
    expect(readStamps().eliTools).toBeGreaterThan(0);
    expect(changes).toBe(1);
    localStorage.setItem('eliTools', '{"calc":true}'); // mismo valor: no es cambio
    expect(changes).toBe(1);
    localStorage.setItem('eliWidth:gtd', '300'); // propio del dispositivo: no viaja
    localStorage.setItem('eliPagesFile', '/p.org'); // de organice: va aparte
    expect(changes).toBe(1);
    writeStamps({});
    expect(applyRemotePrefs({ eliTools: { v: '{"calc":false}', t: 9 } })).toBe(1);
    expect(localStorage.getItem('eliTools')).toBe('{"calc":false}');
    expect(readStamps().eliTools).toBeUndefined();
    expect(changes).toBe(1);
    localStorage.removeItem('eliTools');
    expect(changes).toBe(2);
    expect(collectLocalPrefs([], readStamps()).eliTools.v).toBe(null);
  });

  test('comparar el fichero sin mirar el orden de las claves', () => {
    expect(canonical({ b: 1, a: { d: 2, c: [1, { f: 1, e: 2 }] } })).toBe(
      canonical({ a: { c: [1, { e: 2, f: 1 }], d: 2 }, b: 1 })
    );
  });
});

describe('4.33 contador mensual', () => {
  const C = cleanCounters([
    { key: 'B', name: 'Biblia', type: 'bool' },
    { key: 'cintura', name: 'Cintura', type: 'num', freq: 'month' },
  ]);

  test('se guarda como propiedad del mes y se cambia o se quita', () => {
    expect(C[1]).toEqual({ key: 'CINTURA', name: 'Cintura', type: 'num', freq: 'month' });
    expect(C[0].freq).toBeUndefined();
    let t = setDayProp('', d(2026, 10, 3), 'B', 'X', []);
    t = setMonthProp(t, d(2026, 10, 25), 'CINTURA', '82');
    expect(t).toContain('* 2026-10 octubre\n:PROPERTIES:\n:CINTURA: 82\n:END:\n** 2026-10-03');
    expect(parseMonthProps(t)['2026-10']).toEqual({ CINTURA: '82' });
    t = setMonthProp(t, d(2026, 10, 1), 'CINTURA', '81,5');
    expect(parseMonthProps(t)['2026-10']).toEqual({ CINTURA: '81,5' });
    // mes que aún no existe: se crea en orden
    const t2 = setMonthProp(t, d(2026, 9, 1), 'CINTURA', '84');
    expect(t2.indexOf('* 2026-09')).toBeLessThan(t2.indexOf('* 2026-10'));
    expect(setMonthProp(t, d(2026, 10, 1), 'CINTURA', '')).not.toContain(':PROPERTIES:\n:END:');
    expect(parseMonthProps(setMonthProp(t, d(2026, 10, 1), 'CINTURA', ''))['2026-10']).toEqual({});
  });

  test('sale en la cabecera del mes del mensual y en «Totales del año»', () => {
    let t = setDayProp('', d(2026, 10, 3), 'B', 'X', []);
    t = setMonthProp(t, d(2026, 10, 25), 'CINTURA', '82');
    t = setMonthProp(t, d(2026, 9, 1), 'CINTURA', '84');
    const data = monthlyData(t, 2026, C);
    expect(data.counters.map((c) => c.key)).toEqual(['B']);
    expect(data.months.map((m) => [m.key, m.monthValues])).toEqual([
      ['2026-09', ['84']],
      ['2026-10', ['82']],
    ]);
    const out = regenerateMonthly('', 2026, t, C);
    expect(out).toContain('| Mes | Días | B | CINTURA |');
    expect(out).toContain('| septiembre | 0 |  | 84 |');
    expect(out).toContain('| octubre | 1 | 1 | 82 |');
    expect(out).toContain('| Total | 1 | 1 |  |');
    expect(out).toMatch(/# BEGIN mensual 2026-10\nCintura: 82\n/);
    // la tabla del mes solo lleva los diarios
    expect(out).toContain('| Día | Lo más importante | B |');
  });

  test('ajuste «Al abrir la app» (por defecto, el Diario) y título tipo Logseq', () => {
    localStorage.clear();
    expect(getDiaryCfg().startView).toBe('diary');
    localStorage.setItem('eliDiary', JSON.stringify({ startView: 'last' }));
    expect(getDiaryCfg().startView).toBe('last');
    expect(journalTitle(d(2026, 10, 25))).toBe('Domingo, 25 oct 2026');
  });
});

describe('4.33 archivo por años', () => {
  const NOW = d(2026, 10, 25);
  const ARCH = [
    '#    -*- mode: org -*-',
    '',
    'Archived entries from file /tasks.org',
    '',
    '* DONE Vieja 2023',
    'CLOSED: [2023-05-02 mar 10:00]',
    ':PROPERTIES:',
    ':ARCHIVE_TIME: 2023-06-01 jue 09:00',
    ':END:',
    '** DONE Hija',
    'CLOSED: [2026-01-01 jue 10:00]',
    '* DONE Sin CLOSED',
    ':PROPERTIES:',
    ':ARCHIVE_TIME: 2024-02-03 sáb 11:00',
    ':END:',
    '* DONE Reciente',
    'CLOSED: [2026-03-01 dom 10:00]',
    '* Sin fecha',
    '',
  ].join('\n');

  test('fecha de cierre: CLOSED del propio encabezado o ARCHIVE_TIME', () => {
    const trees = splitTopTrees(ARCH).trees;
    expect(trees.map((t) => closedDateOf(t) && closedDateOf(t).getFullYear())).toEqual([
      2023,
      2024,
      2026,
      null,
    ]);
  });

  test('plan: lo de hace más de un año por año; lo demás se queda', () => {
    const p = planArchiveFile(ARCH, NOW);
    expect(p.count).toBe(2);
    expect(Object.keys(p.moves)).toEqual(['2023', '2024']);
    expect(p.moves[2023][0]).toMatch(/^\* DONE Vieja 2023[\s\S]*\*\* DONE Hija/);
    expect(p.keepText).toContain('Archived entries from file /tasks.org');
    expect(p.keepText).toContain('* DONE Reciente');
    expect(p.keepText).toContain('* Sin fecha');
    expect(p.keepText).not.toContain('Vieja 2023');
    expect(planSummary([p])).toBe('Se moverán 2 árboles a 2023, 2024');
    expect(planArchiveFile(p.keepText, NOW).count).toBe(0);
    expect(yearArchivePath('/org/archive/tasks.org_archive', 2023)).toBe(
      '/org/archive/archive-2023.org'
    );
  });

  test('idempotente: relanzarlo no duplica ni cambia nada', () => {
    const p = planArchiveFile(ARCH, NOW);
    const once = appendTrees('', p.moves[2023], 2023);
    expect(once).toContain('#+TITLE: Archivo 2023');
    expect(once.match(/Vieja 2023/g).length).toBe(1);
    expect(appendTrees(once, p.moves[2023], 2023)).toBe(once);
    // destino ya escrito y origen sin quitar (fallo a medias): al repetir, no se duplica
    const again = planArchiveFile(ARCH, NOW);
    expect(appendTrees(once, again.moves[2023], 2023)).toBe(once);
  });

  test('los archive-AAAA.org cuentan como archivo', () => {
    expect(isYearArchivePath('/a/archive-2023.org')).toBe(true);
    expect(isArchiveFile('/a/archive-2023.org')).toBe(true);
    expect(isArchiveFile('/a/tasks.org_archive')).toBe(true);
    expect(isArchiveFile('/a/archive.org')).toBe(false);
  });
});

describe('4.33 registro de sincronización', () => {
  test('los más nuevos primero y como mucho 200', () => {
    let list = [];
    for (let i = 0; i < MAX_EVENTS + 5; i++)
      list = addEvent(list, { at: `t${i}`, file: '/a.org', op: 'subir', error: 'x' + i });
    expect(list.length).toBe(MAX_EVENTS);
    expect(list[0].error).toBe('x' + (MAX_EVENTS + 4));
    expect(errorText(new Error('sin red'))).toBe('sin red');
    expect(errorText(undefined)).toBe('sin detalle');
    expect(syncLogText([{ at: 'h', op: 'subir', file: '/a', error: 'e' }])).toBe('h\tsubir\t/a\te');
  });
});
