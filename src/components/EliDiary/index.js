// ORG Mode para Eli (4.26): diario. Hoja que se abre desde el Menú ☰ › «Diario de hoy» (evento
// `eli:diary`, con `{ date: 'AAAA-MM-DD' }` para ir a un día). Lee y escribe directamente
// `pages/diari-AAAA.org` (lib/eli_diary): no pasa por el analizador ni entra en GTD.
import { dayAnchorId, dayAnchorHref } from '../../lib/eli_diary_print';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useSelector, useStore } from 'react-redux';
import { useHistory } from 'react-router-dom';

import './stylesheet.css';

import {
  MARKS,
  markSign,
  getDiaryCfg,
  diaryDir,
  diaryPath,
  inboxNear,
  dayKey,
  parseDayKey,
  timeOf,
  longDate,
  MONTHS,
  newFileText,
  ensureDay,
  addEntry,
  setAnswer,
  ensureDayId,
  parseDays,
  daysWithEntries,
  onThisDay,
  doneOn,
  monthGrid,
  setDayProp,
  withDiaryIds,
  setMonthProp,
  parseMonthProps,
  isMonthlyCounter,
  monthKey,
  dayHasData,
  journalTitle,
  openDiary,
} from '../../lib/eli_diary';
import { startedAtRoot, takeStartAtRoot } from '../../lib/eli_mode';
import {
  monthlyPath,
  monthlyData,
  regenerateMonthly,
  isYes,
  monthValuesLine,
} from '../../lib/eli_monthly';
import { getGtdFiles } from '../../lib/gtd/gtd_sections';
import { buildTasks } from '../../lib/gtd/gtd_model';
import { gtdAddTask, createdStamp } from '../../lib/gtd/gtd_actions';
import { fileLinkTarget } from '../../lib/eli_media';
import { showMessage } from '../../lib/eli_prompt';
import EliMedia, { MediaPathContext } from '../OrgFile/components/EliMedia';
import { PrintButton } from '../EliTools';
import { eliSyncFile, eliOpenDiaryDayNarrow } from '../../actions/org';

const PAST_YEARS = 10; // «Tal día como hoy»: cuántos años atrás se buscan

// Texto con enlaces: las fotos/ficheros con EliMedia; los demás enlaces, su descripción
const LINK = /\[\[([^\]]+)\](?:\[([^\]]*)\])?\]/g;
export const DiaryText = ({ text, path }) => {
  const out = [];
  let last = 0;
  let m;
  const s = String(text || '');
  LINK.lastIndex = 0;
  while ((m = LINK.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const media = fileLinkTarget(m[1]);
    out.push(
      media ? (
        <EliMedia key={m.index} target={media} title={m[2] || null} orgPath={path} />
      ) : (
        <span key={m.index} className="eli-diary__link">
          {m[2] || m[1]}
        </span>
      )
    );
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return <>{out}</>;
};

const Entry = ({ e, path, onInbox }) => (
  <div className={`eli-diary__entry eli-diary__entry--${e.mark === '!' ? 'imp' : 'n'}`}>
    <span className="eli-diary__time">{e.time}</span>
    <span className="eli-diary__mark" title={(MARKS.find((x) => x.id === e.mark) || {}).label}>
      {markSign(e.mark)}
    </span>
    <span className="eli-diary__etext">
      <DiaryText text={e.text} path={path} />
      {e.body && (
        <span className="eli-diary__ebody">
          <DiaryText text={e.body} path={path} />
        </span>
      )}
    </span>
    {onInbox && (
      <button
        type="button"
        className="eli-diary__mini"
        onClick={() => onInbox(e)}
        title="Al Inbox"
        aria-label="Al Inbox"
        data-testid="eli-diary-entry-inbox"
      >
        <i className="fas fa-inbox" />
      </button>
    )}
  </div>
);

// Vista previa del PDF (mes o año) con aspecto de diario
const DiaryPrint = ({ title, days, path, onClose, monthly }) => {
  const docRef = useRef(null);
  useEffect(() => {
    const prev = document.title;
    document.title = title.replace(/[\\/:*?"<>|]/g, '-');
    document.documentElement.classList.add('eli-printing');
    return () => {
      document.title = prev;
      document.documentElement.classList.remove('eli-printing');
    };
  }, [title]);
  let portal = document.getElementById('eli-diary-print-portal');
  if (!portal) {
    portal = document.createElement('div');
    portal.id = 'eli-diary-print-portal';
    document.body.appendChild(portal);
  }
  return ReactDOM.createPortal(
    <div className="eli-print" role="dialog" aria-label="Exportar a PDF">
      <div className="eli-print__bar eli-no-print">
        <button className="btn eli-raw__btn" onClick={onClose}>
          Cerrar
        </button>
        <div className="eli-raw__title">Vista previa</div>
        <PrintButton docRef={docRef} testId="eli-diary-print-go" />
      </div>
      <MediaPathContext.Provider value={path}>
        <article
          className="eli-print__doc eli-diary-print"
          ref={docRef}
          data-testid="eli-diary-print"
        >
          <h1 className="eli-print__doctitle">{title}</h1>
          {monthly && <MonthlyTables data={monthly} hasDays={(days || []).length > 0} />}
          {(days || []).map((d) => (
            <section key={d.key} id={dayAnchorId(d.key)} className="eli-diary-print__day">
              <h2>{longDate(parseDayKey(d.key))}</h2>
              {d.answers
                .filter((a) => a.answer)
                .map((a) => (
                  <p key={a.question} className="eli-diary-print__answer">
                    <em>{a.question}</em> {a.answer}
                  </p>
                ))}
              {d.notes.map((n, i) => (
                <p key={'n' + i}>
                  <DiaryText text={n} path={path} />
                </p>
              ))}
              {d.entries.map((e, i) => (
                <Entry key={i} e={e} path={path} />
              ))}
            </section>
          ))}
          {!monthly && !days.length && <p>(sin apuntes)</p>}
        </article>
      </MediaPathContext.Provider>
    </div>,
    portal
  );
};

// (4.27) Registro mensual en el PDF: una tabla por mes (y los totales del año si hay varios)
const MonthlyTables = ({ data, hasDays = false }) => (
  <div className="eli-diary-monthly" data-testid="eli-diary-monthly-print">
    {data.months.map((m) => (
      <section key={m.key} className="eli-diary-print__day">
        <h2>
          {m.label} {data.year}
        </h2>
        {monthValuesLine(data.monthCounters, m.monthValues) && (
          <p className="eli-diary-monthly__mvals">
            {monthValuesLine(data.monthCounters, m.monthValues)}
          </p>
        )}
        <table className="eli-diary-monthly__table">
          <thead>
            <tr>
              <th>Día</th>
              <th>Lo más importante</th>
              {data.counters.map((c) => (
                <th key={c.key} title={c.name}>
                  {c.key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {m.rows.map((r, i) =>
              r.type === 'day' ? (
                <tr key={i}>
                  <td className="eli-diary-monthly__d">
                    {r.link && hasDays ? (
                      <a
                        href={dayAnchorHref(r.key)}
                        data-testid="eli-diary-monthly-daylink"
                        onClick={(ev) => {
                          // en la vista previa no se navega: se baja hasta el día
                          ev.preventDefault();
                          const el = document.getElementById(dayAnchorId(r.key));
                          if (el && el.scrollIntoView) el.scrollIntoView();
                        }}
                      >
                        {r.label}
                      </a>
                    ) : (
                      r.label
                    )}
                  </td>
                  <td>
                    {r.lines.map((l, j) => (
                      <div key={j}>{l}</div>
                    ))}
                  </td>
                  {r.values.map((v, j) => (
                    <td key={j} className="eli-diary-monthly__n">
                      {v}
                    </td>
                  ))}
                </tr>
              ) : r.type === 'week' ? (
                data.counters.some((c) => c.type !== 'note') && (
                  <tr key={i} className="eli-diary-monthly__week">
                    <td>Semana</td>
                    <td />
                    {r.values.map((v, j) => (
                      <td key={j} className="eli-diary-monthly__n">
                        {v}
                      </td>
                    ))}
                  </tr>
                )
              ) : (
                <tr key={i} className="eli-diary-monthly__total">
                  <td>Total</td>
                  <td>{r.days} días con algo</td>
                  {r.values.map((v, j) => (
                    <td key={j} className="eli-diary-monthly__n">
                      {v}
                    </td>
                  ))}
                </tr>
              )
            )}
          </tbody>
        </table>
      </section>
    ))}
    {!data.months.length && <p>(sin datos)</p>}
  </div>
);

// (4.27) Fila «Registro de hoy»: un botón por contador Sí/No, un cuadro por Número o Nota.
// (4.33) Los mensuales muestran (y cambian) el valor del MES, con «/mes».
const Counters = ({ counters, props, monthProps, dayK, onSet }) => (
  <div className="eli-diary__counters" data-testid="eli-diary-counters">
    <span className="eli-diary__counters-title">Registro</span>
    {counters.map((c) => {
      const monthly = isMonthlyCounter(c);
      const v = ((monthly ? monthProps : props) || {})[c.key] || '';
      const label = monthly ? `${c.key}/mes` : c.key;
      const title = monthly ? `${c.name} (del mes)` : c.name;
      if (c.type === 'bool')
        return (
          <button
            type="button"
            key={c.key}
            className={`eli-diary__markbtn${isYes(v) ? ' is-on' : ''}${
              monthly ? ' is-monthly' : ''
            }`}
            onClick={() => onSet(c, isYes(v) ? '' : 'X')}
            title={title}
            aria-pressed={isYes(v)}
            data-testid={`eli-diary-counter-${c.key}`}
          >
            {isYes(v) ? '✓' : '○'} {label}
          </button>
        );
      return (
        <label
          key={c.key + (monthly ? dayK.slice(0, 7) : dayK) + v}
          className={`eli-diary__counter${monthly ? ' is-monthly' : ''}`}
          title={title}
        >
          {label}
          <input
            type="text"
            inputMode={c.type === 'num' ? 'decimal' : undefined}
            className={`eli-diary__counter-input eli-diary__counter-input--${c.type}`}
            defaultValue={v}
            onBlur={(e) => e.target.value.trim() !== v && onSet(c, e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') e.target.blur();
            }}
            data-testid={`eli-diary-counter-${c.key}`}
          />
        </label>
      );
    })}
  </div>
);

// (4.36) Subcabeceras del usuario bajo el día (`*** Título`): plegadas, con su título
const Heads = ({ heads, path }) =>
  heads && heads.length ? (
    <div className="eli-diary__heads" data-testid="eli-diary-heads">
      {heads.map((h, i) => (
        <details key={i} className="eli-diary__head" data-testid="eli-diary-head">
          <summary>
            <DiaryText text={h.title} path={path} />
          </summary>
          {h.body && (
            <div className="eli-diary__note">
              <DiaryText text={h.body} path={path} />
            </div>
          )}
        </details>
      ))}
    </div>
  ) : null;

// (4.33) Día anterior en el diario continuo (tipo Logseq): título, respuestas (editables en línea),
// notas y apuntes. Tocar el título lo abre arriba.
const PastDay = ({ d, path, counters, onOpen, onAnswer, onEdit }) => {
  const date = parseDayKey(d.key);
  const vals = counters
    .filter((c) => !isMonthlyCounter(c) && (d.props || {})[c.key])
    .map((c) => `${c.key} ${c.type === 'bool' ? '✓' : d.props[c.key]}`);
  return (
    <section className="eli-diary__pday" data-testid="eli-diary-pday">
      <h2 className="eli-diary__ptitle">
        <button type="button" className="eli-diary__link-btn" onClick={() => onOpen(date)}>
          {journalTitle(date)}
        </button>
        <button
          type="button"
          className="eli-diary__edit-day"
          onClick={() => onEdit(date)}
          title="Editar el día como documento (subcabeceras, enlaces, etiquetas…)"
          aria-label="Editar día"
          data-testid="eli-diary-pday-edit"
        >
          <i className="fas fa-pen" />
        </button>
      </h2>
      {vals.length > 0 && <div className="eli-diary__pvals">{vals.join(' · ')}</div>}
      {d.answers
        .filter((a) => a.answer)
        .map((a) => (
          <label key={a.question + d.key + a.answer} className="eli-diary__q eli-diary__q--inline">
            <span>{a.question}</span>
            <input
              type="text"
              defaultValue={a.answer}
              onBlur={(e) => onAnswer(date, a.question, e.target.value, a.answer)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') e.target.blur();
              }}
            />
          </label>
        ))}
      {d.notes.map((n, i) => (
        <div key={'n' + i} className="eli-diary__note">
          <DiaryText text={n} path={path} />
        </div>
      ))}
      {d.entries.map((e, i) => (
        <Entry key={i} e={e} path={path} />
      ))}
      <Heads heads={d.heads} path={path} />
    </section>
  );
};

const STREAM_STEP = 7; // días anteriores que se añaden con «Más días»

export default function EliDiary() {
  const store = useStore();
  const history = useHistory();
  const files = useSelector((s) => s.org.present.get('files'));
  const isAuthenticated = useSelector((s) => !!s.syncBackend.get('client'));
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(() => new Date());
  const [view, setView] = useState('day'); // 'day' | 'cal'
  const [cal, setCal] = useState(() => ({ y: new Date().getFullYear(), m: new Date().getMonth() }));
  const [texts, setTexts] = useState({}); // { año: texto } ('' = no existe)
  const [status, setStatus] = useState('');
  const [input, setInput] = useState('');
  const [mark, setMark] = useState('-');
  const [print, setPrint] = useState(null);
  const [cfg, setCfg] = useState(getDiaryCfg());
  const [streamN, setStreamN] = useState(STREAM_STEP);
  const textsRef = useRef({});
  const existsRef = useRef({});
  const dirRef = useRef('');
  const queue = useRef(Promise.resolve());
  const inputRef = useRef(null);

  const client = () => store.getState().syncBackend.get('client');
  const loadedPaths = () => {
    const f = store.getState().org.present.get('files');
    return f && f.keySeq ? f.keySeq().toArray() : [];
  };
  const pathFor = (year) => diaryPath(year, dirRef.current);

  const setText = (year, text) => {
    textsRef.current = { ...textsRef.current, [year]: text };
    setTexts(textsRef.current);
  };

  // Carga el fichero de un año (una vez). Devuelve su texto ('' si no existe).
  const load = async (year) => {
    if (textsRef.current[year] !== undefined) return textsRef.current[year];
    const c = client();
    let body = '';
    try {
      const exists = c.pathExists ? await c.pathExists(pathFor(year)) : true;
      existsRef.current[year] = exists;
      if (exists) body = (await c.getFileContents(pathFor(year))) || '';
    } catch (e) {
      existsRef.current[year] = false;
    }
    setText(year, body);
    return body;
  };

  // Escribe (en cola, para que no se crucen dos guardados)
  // (4.27) Rehace las tablas de `mensual-AAAA.org` (lee el fichero cada vez: lo de fuera de las
  // marcas lo puede haber cambiado el usuario)
  const regenMonthly = async (year, diaryText) => {
    const c = client();
    const mp = monthlyPath(year, dirRef.current);
    let exists = false;
    let old = '';
    try {
      exists = c.pathExists ? await c.pathExists(mp) : false;
      if (exists) old = (await c.getFileContents(mp)) || '';
    } catch (e) {
      exists = false;
    }
    const next = regenerateMonthly(old, year, diaryText, getDiaryCfg().counters);
    if (next == null || next === old) return;
    if (exists) await c.updateFile(mp, next);
    else {
      await c.createFile(mp, next);
      setStatus(
        'Registro mensual creado: sus tablas se rehacen solas (lo editado dentro se pierde)'
      );
    }
  };

  const write = (year, text0) => {
    const monthly = getDiaryCfg().monthlyOn;
    const text = monthly ? withDiaryIds(text0) : text0;
    setText(year, text);
    setStatus('Guardando…');
    queue.current = queue.current.then(async () => {
      try {
        const c = client();
        if (existsRef.current[year]) await c.updateFile(pathFor(year), text);
        else await c.createFile(pathFor(year), text);
        existsRef.current[year] = true;
        setStatus('Guardado');
        if (monthly) await regenMonthly(year, text);
      } catch (e) {
        setStatus('');
        showMessage('Diario', 'No se ha podido guardar: ' + ((e && e.message) || e));
      }
    });
    return queue.current;
  };

  const template = () => (cfg.templateOn ? cfg.template : []);

  // Asegura el día (con la plantilla) y lo escribe si se ha creado
  const ensure = async (d, c = cfg) => {
    const year = d.getFullYear();
    const text = await load(year);
    const r = ensureDay(text || newFileText(year), d, c.templateOn ? c.template : []);
    if (r.created || !text) await write(year, r.text);
  };

  const loadPast = async (year) => {
    for (let y = year - 1; y >= year - PAST_YEARS; y--) await load(y);
  };

  useEffect(() => {
    const onOpen = async (e) => {
      if (!client()) return;
      const c = getDiaryCfg();
      setCfg(c);
      dirRef.current = diaryDir(c.dir, inboxNear(getGtdFiles().inbox, loadedPaths()));
      textsRef.current = {};
      existsRef.current = {};
      setTexts({});
      const mo = e && e.detail && /^(\d{4})-(\d{2})$/.exec(e.detail.month || '');
      const d =
        (e && e.detail && parseDayKey(e.detail.date)) ||
        (mo ? new Date(+mo[1], +mo[2] - 1, 1) : new Date());
      setDate(d);
      setCal({ y: d.getFullYear(), m: d.getMonth() });
      // (4.27) [[id:diari-AAAA-MM]] («Ver en el diari» del registro): el calendario de ese mes
      setView(mo ? 'cal' : 'day');
      setInput('');
      setMark('-');
      setStatus('Cargando…');
      setOpen(true);
      // «Diario de hoy»: crea el fichero del año, el mes y el día si faltan
      if (!(e && e.detail && (e.detail.date || e.detail.month))) await ensure(d, c);
      else await load(d.getFullYear());
      setStatus('');
      setTimeout(() => inputRef.current && inputRef.current.focus(), 50);
      loadPast(d.getFullYear());
    };
    window.addEventListener('eli:diary', onOpen);
    return () => window.removeEventListener('eli:diary', onOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (4.33) Al abrir la app desde el icono (página inicial): el Diario de hoy (Ajustes › Diario ›
  // Al abrir la app). Se espera a tener los ficheros (para saber dónde está el de entrada y, con
  // él, la carpeta del diario); como mucho unos segundos.
  const startDone = useRef(!startedAtRoot());
  const startReady = useSelector((st) => {
    const f = st.org.present.get('files');
    const loading = st.base.get('isLoading');
    if (!f || !f.size || (loading && loading.size)) return false;
    return (
      !!getGtdFiles().inbox ||
      f
        .keySeq()
        .toArray()
        .some((p) => /(^|\/)inbox\.org$/i.test(p))
    );
  });
  useEffect(() => {
    if (!isAuthenticated || startDone.current) return undefined;
    const go = () => {
      if (startDone.current) return;
      startDone.current = true;
      if (!takeStartAtRoot()) return;
      if (getDiaryCfg().startView !== 'last') openDiary({});
    };
    const t = setTimeout(go, startReady ? 300 : 8000);
    return () => clearTimeout(t);
  }, [isAuthenticated, startReady]);

  // (4.33) Días anteriores con algo, del más nuevo al más viejo (diario continuo bajo el de hoy)
  const curKey = dayKey(date);
  const pastDays = useMemo(() => {
    if (!open) return [];
    const out = [];
    Object.keys(texts).forEach((y) => {
      if (!texts[y]) return;
      parseDays(texts[y]).forEach((d) => {
        if (d.key < curKey && dayHasData(d)) out.push({ ...d, year: +y });
      });
    });
    return out.sort((a, b) => (a.key < b.key ? 1 : -1));
  }, [open, texts, curKey]);
  useEffect(() => setStreamN(STREAM_STEP), [curKey]);

  if (!open || !isAuthenticated) return null;

  const year = date.getFullYear();
  const key = dayKey(date);
  const text = texts[year] || '';
  const day = parseDays(text).find((d) => d.key === key) || null;
  const path = pathFor(year);
  const isToday = key === dayKey(new Date());

  const goTo = async (d) => {
    setDate(d);
    setView('day');
    const box = document.querySelector('[data-testid=eli-diary-day]');
    if (box && box.parentElement) box.parentElement.scrollTop = 0;
    await load(d.getFullYear());
    loadPast(d.getFullYear());
  };
  const shift = (n) => goTo(new Date(year, date.getMonth(), date.getDate() + n));

  const apuntar = async () => {
    const t = input.trim();
    if (!t) return;
    const now = new Date();
    const base = await load(year);
    const next = addEntry(base, date, { text: t, mark, time: timeOf(now) }, template());
    setInput('');
    setMark('-');
    await write(year, next);
    inputRef.current && inputRef.current.focus();
  };

  const answer = async (q, value) => {
    const base = await load(year);
    const cur = ((day && day.answers.find((a) => a.question === q)) || {}).answer || '';
    if (cur === value.trim()) return;
    await write(year, setAnswer(base, date, q, value));
  };

  // (4.27) contador del día (propiedad del día en el diari)
  const setCounter = async (c, value) => {
    const base = await load(year);
    // (4.33) los mensuales, en el mes
    if (isMonthlyCounter(c)) await write(year, setMonthProp(base, date, c.key, value));
    else await write(year, setDayProp(base, date, c.key, value, template()));
  };

  // (4.33) respuesta de otro día (diario continuo)
  const answerOn = async (d, q, value, cur) => {
    if ((cur || '') === String(value || '').trim()) return;
    const y = d.getFullYear();
    const base = await load(y);
    await write(y, setAnswer(base, d, q, value));
  };

  // (integración) apunte → tarea en el Inbox con enlace al día
  const toInbox = async (e) => {
    const base = await load(year);
    const r = ensureDayId(base, date);
    if (r.text !== base) await write(year, r.text);
    const title = e.text.trim() || `Del diario ${key}`;
    const notes = `Del diario: [[id:${r.id}][${key} ${e.time}]]`;
    const inbox = inboxNear(getGtdFiles().inbox, loadedPaths());
    const state = store.getState();
    if (state.org.present.getIn(['files', inbox, 'headers'])) {
      const id = store.dispatch(
        gtdAddTask({ path: inbox }, { title, list: 'inbox', notes, created: true })
      );
      setStatus(id ? '→ Inbox' : 'No se ha podido añadir al Inbox');
      return;
    }
    // el de entrada no está cargado: se añade al final del fichero tal cual
    try {
      const c = client();
      const exists = c.pathExists ? await c.pathExists(inbox) : true;
      const old = exists ? (await c.getFileContents(inbox)) || '' : '';
      const add = `* ${title}\n:PROPERTIES:\n:CREATED: ${createdStamp()}\n:END:\n${notes}\n`;
      const body = (old && !old.endsWith('\n') ? old + '\n' : old) + add;
      if (exists) await c.updateFile(inbox, body);
      else await c.createFile(inbox, body);
      setStatus('→ Inbox');
    } catch (err) {
      showMessage('Diario', 'No se ha podido añadir al Inbox: ' + ((err && err.message) || err));
    }
  };

  const close = async () => {
    await queue.current;
    setOpen(false);
  };
  // (4.36) «Editar día»: abre el documento del año con ese día en NARROW (editor normal de
  // Documentos: subcabeceras, enlaces, etiquetas…). El día se crea con su :ID: si falta, se guarda
  // lo pendiente y se recarga el fichero. «← Diario» (en el narrow) vuelve aquí.
  const editDay = async (d) => {
    const year = d.getFullYear();
    try {
      setStatus('Abriendo el día…');
      await queue.current;
      await store.dispatch(eliSyncFile(pathFor(year)));
      delete textsRef.current[year];
      const base = await load(year);
      const r = ensureDayId(base || newFileText(year), d);
      if (r.text !== base) await write(year, r.text);
      await queue.current;
      setOpen(false);
      await store.dispatch(eliOpenDiaryDayNarrow(pathFor(year), r.id));
      setStatus('');
    } catch (e) {
      setStatus('');
      showMessage('Diario', 'No se ha podido abrir el día: ' + ((e && e.message) || e));
    }
  };

  const asDocument = async () => {
    await queue.current;
    setOpen(false);
    history.push(`/file${path}`);
  };

  const done = cfg.inSystem ? doneOn(buildTasks(files), date) : [];
  const past = onThisDay(texts, date);
  const answers = (template().length ? template() : []).map((q) => ({
    question: q,
    answer: ((day && day.answers.find((a) => a.question === q)) || {}).answer || '',
  }));
  // respuestas a preguntas que ya no están en la plantilla
  ((day && day.answers) || []).forEach((a) => {
    if (!answers.some((x) => x.question === a.question)) answers.push(a);
  });

  const openPrint = async (kind) => {
    const y = cal.y;
    const t = await load(y);
    const mk = `${y}-${String(cal.m + 1).padStart(2, '0')}`;
    const days = parseDays(t).filter((d) => kind === 'year' || d.key.startsWith(mk));
    setPrint({
      title: kind === 'year' ? `Diari ${y}` : `Diari ${MONTHS[cal.m]} ${y}`,
      days,
      path: pathFor(y),
    });
  };

  const openMonthlyPrint = async (kind) => {
    const y = cal.y;
    const t = await load(y);
    const data = monthlyData(t, y, cfg.counters);
    const mk = `${y}-${String(cal.m + 1).padStart(2, '0')}`;
    if (kind === 'month') data.months = data.months.filter((m) => m.key === mk);
    // (4.37) los días van después del resumen y cada fila del mensual enlaza a su día
    const days = parseDays(t).filter((d) => kind === 'year' || d.key.startsWith(mk));
    setPrint({
      title: kind === 'year' ? `Mensual ${y}` : `Mensual ${MONTHS[cal.m]} ${y}`,
      days,
      monthly: data,
      path: pathFor(y),
    });
  };
  const openMonthly = async () => {
    const y = cal.y;
    const t = await load(y);
    await queue.current;
    try {
      await regenMonthly(y, t);
    } catch (e) {
      // sin fichero o sin conexión: se abre lo que haya
    }
    setOpen(false);
    history.push(`/file${monthlyPath(y, dirRef.current)}`);
  };

  const renderCalendar = () => {
    const marked = daysWithEntries(texts[cal.y] || '');
    const move = (n) => {
      const d = new Date(cal.y, cal.m + n, 1);
      setCal({ y: d.getFullYear(), m: d.getMonth() });
      load(d.getFullYear());
    };
    return (
      <div className="eli-diary__cal" data-testid="eli-diary-cal">
        <div className="eli-diary__nav">
          <button
            type="button"
            className="eli-diary__btn"
            onClick={() => move(-1)}
            aria-label="Mes anterior"
          >
            ‹
          </button>
          <strong className="eli-diary__navtitle">
            {MONTHS[cal.m]} {cal.y}
          </strong>
          <button
            type="button"
            className="eli-diary__btn"
            onClick={() => move(1)}
            aria-label="Mes siguiente"
          >
            ›
          </button>
        </div>
        <div className="eli-diary__grid">
          {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((w) => (
            <span key={w} className="eli-diary__wd">
              {w}
            </span>
          ))}
          {monthGrid(cal.y, cal.m).map((week) =>
            week.map((c) => (
              <button
                type="button"
                key={c.key}
                className={[
                  'eli-diary__cell',
                  c.inMonth ? '' : 'is-out',
                  marked.has(c.key) ? 'is-marked' : '',
                  c.key === dayKey(new Date()) ? 'is-today' : '',
                ].join(' ')}
                onClick={() => goTo(parseDayKey(c.key))}
                data-testid={marked.has(c.key) ? 'eli-diary-cal-marked' : undefined}
              >
                {c.day}
              </button>
            ))
          )}
        </div>
        <div className="eli-diary__row">
          <button
            type="button"
            className="eli-diary__btn"
            onClick={() => openPrint('month')}
            data-testid="eli-diary-pdf-month"
          >
            <i className="fas fa-file-pdf" /> PDF del mes
          </button>
          <button
            type="button"
            className="eli-diary__btn"
            onClick={() => openPrint('year')}
            data-testid="eli-diary-pdf-year"
          >
            <i className="fas fa-file-pdf" /> PDF del año
          </button>
        </div>
        {cfg.monthlyOn && (
          <div className="eli-diary__row">
            <button
              type="button"
              className="eli-diary__btn"
              onClick={openMonthly}
              data-testid="eli-diary-monthly-open"
            >
              <i className="fas fa-table" /> Registro mensual
            </button>
            <button
              type="button"
              className="eli-diary__btn"
              onClick={() => openMonthlyPrint('month')}
              data-testid="eli-diary-monthly-pdf-month"
            >
              <i className="fas fa-file-pdf" /> Registro del mes
            </button>
            <button
              type="button"
              className="eli-diary__btn"
              onClick={() => openMonthlyPrint('year')}
              data-testid="eli-diary-monthly-pdf-year"
            >
              <i className="fas fa-file-pdf" /> Registro del año
            </button>
          </div>
        )}
      </div>
    );
  };

  const monthProps = parseMonthProps(text)[monthKey(date)] || {};
  const shownPast = pastDays.slice(0, streamN);

  // (4.33) Aspecto tipo Logseq: el día con su título grande, las preguntas ya puestas para
  // rellenar en línea y, debajo, los días anteriores en scroll continuo
  const renderDay = () => (
    <div className="eli-diary__day eli-diary__journal" data-testid="eli-diary-day">
      <div className="eli-diary__nav eli-diary__nav--small">
        <button
          type="button"
          className="eli-diary__btn"
          onClick={() => shift(-1)}
          aria-label="Día anterior"
          title="Día anterior"
        >
          ‹
        </button>
        <button
          type="button"
          className="eli-diary__btn"
          onClick={() => shift(1)}
          aria-label="Día siguiente"
          title="Día siguiente"
        >
          ›
        </button>
        {!isToday && (
          <button type="button" className="eli-diary__btn" onClick={() => goTo(new Date())}>
            Hoy
          </button>
        )}
        <span className="eli-diary__navdate">{longDate(date)}</span>
      </div>
      <h1 className="eli-diary__jtitle" data-testid="eli-diary-date">
        {journalTitle(date)}
        <button
          type="button"
          className="eli-diary__edit-day"
          onClick={() => editDay(date)}
          title="Editar el día como documento (subcabeceras, enlaces, etiquetas…)"
          aria-label="Editar día"
          data-testid="eli-diary-edit-day"
        >
          <i className="fas fa-pen" />
        </button>
      </h1>

      {cfg.counters.length > 0 && (
        <Counters
          counters={cfg.counters}
          props={day ? day.props : {}}
          monthProps={monthProps}
          dayK={key}
          onSet={setCounter}
        />
      )}

      {answers.length > 0 && (
        <div className="eli-diary__qs" data-testid="eli-diary-questions">
          {answers.map((a) => (
            <label key={a.question + key} className="eli-diary__q eli-diary__q--inline">
              <span>{a.question}</span>
              <input
                type="text"
                defaultValue={a.answer}
                placeholder="…"
                onBlur={(e) => answer(a.question, e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') e.target.blur();
                }}
                data-testid="eli-diary-answer"
              />
            </label>
          ))}
        </div>
      )}

      <div className="eli-diary__entries">
        {day &&
          day.notes.map((n, i) => (
            <div key={'n' + i} className="eli-diary__note">
              <DiaryText text={n} path={path} />
            </div>
          ))}
        {day && day.entries.length ? (
          day.entries.map((e, i) => (
            <Entry key={i} e={e} path={path} onInbox={cfg.inSystem ? toInbox : null} />
          ))
        ) : day && day.heads && day.heads.length ? null : (
          <div className="eli-diary__empty">Sin apuntes.</div>
        )}
        <Heads heads={day && day.heads} path={path} />
      </div>

      <div className="eli-diary__marks" role="group" aria-label="Marca">
        {MARKS.map((m) => (
          <button
            type="button"
            key={m.id}
            className={`eli-diary__markbtn${mark === m.id ? ' is-on' : ''}`}
            onClick={() => setMark(m.id)}
            title={m.label}
            data-testid={`eli-diary-mark-${m.id === '!' ? 'imp' : m.id}`}
          >
            {m.sign} {m.label}
          </button>
        ))}
      </div>
      <div className="eli-diary__add">
        <textarea
          ref={inputRef}
          rows={2}
          className="eli-diary__input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && !e.shiftKey && e.keyCode !== 229) {
              e.preventDefault();
              apuntar();
            }
            if (e.key === 'Escape') close();
          }}
          placeholder={
            isToday ? `${timeOf(new Date())} — ¿Qué ha pasado?` : 'Apunte para este día…'
          }
          data-testid="eli-diary-input"
        />
        <button
          type="button"
          className="eli-diary__btn eli-diary__btn--primary"
          onClick={apuntar}
          data-testid="eli-diary-add"
        >
          Apuntar
        </button>
      </div>

      {cfg.inSystem && (
        <details className="eli-diary__block" data-testid="eli-diary-done">
          <summary>
            Hecho {isToday ? 'hoy' : 'este día'} ({done.length})
          </summary>
          {done.length ? (
            done.map((t) => (
              <div key={t.path + t.id} className="eli-diary__done">
                <span className="eli-diary__mark">×</span> {t.title}
              </div>
            ))
          ) : (
            <div className="eli-diary__empty">Ninguna tarea cerrada.</div>
          )}
        </details>
      )}

      {past.length > 0 && (
        <details className="eli-diary__block" data-testid="eli-diary-past">
          <summary>Tal día como hoy ({past.length})</summary>
          {past.map(({ year: y, day: d }) => (
            <div key={y} className="eli-diary__past">
              <button
                type="button"
                className="eli-diary__link-btn"
                onClick={() => goTo(parseDayKey(d.key))}
              >
                {y}
              </button>
              {d.entries.map((e, i) => (
                <Entry key={i} e={e} path={pathFor(y)} />
              ))}
              {d.answers
                .filter((a) => a.answer)
                .map((a) => (
                  <div key={a.question} className="eli-diary__note">
                    <em>{a.question}</em> {a.answer}
                  </div>
                ))}
            </div>
          ))}
        </details>
      )}

      {shownPast.length > 0 && (
        <div className="eli-diary__stream" data-testid="eli-diary-stream">
          {shownPast.map((d) => (
            <PastDay
              key={d.key}
              d={d}
              path={pathFor(d.year)}
              counters={cfg.counters}
              onOpen={goTo}
              onAnswer={answerOn}
              onEdit={editDay}
            />
          ))}
          {pastDays.length > shownPast.length && (
            <button
              type="button"
              className="eli-diary__btn eli-diary__more"
              onClick={() => setStreamN((n) => n + STREAM_STEP)}
              data-testid="eli-diary-more"
            >
              Más días
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div
      className="eli-scratch__overlay eli-diary__overlay"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
      data-testid="eli-diary"
    >
      <div className="eli-scratch eli-diary" role="dialog" aria-label="Diario">
        <div className="eli-scratch__bar">
          <strong>Diario</strong>
          <span className="eli-scratch__spacer" />
          <button
            type="button"
            className="eli-scratch__btn"
            onClick={() => {
              if (view === 'cal') setView('day');
              else {
                setCal({ y: year, m: date.getMonth() });
                setView('cal');
              }
            }}
            data-testid="eli-diary-cal-btn"
          >
            <i className={view === 'cal' ? 'fas fa-pen' : 'far fa-calendar-alt'} />{' '}
            {view === 'cal' ? 'Día' : 'Calendario'}
          </button>
          <button
            type="button"
            className="eli-scratch__btn"
            onClick={asDocument}
            data-testid="eli-diary-open"
          >
            Abrir como documento
          </button>
          <button
            type="button"
            className="eli-scratch__btn"
            onClick={close}
            data-testid="eli-diary-close"
          >
            Cerrar
          </button>
        </div>
        {view === 'cal' ? renderCalendar() : renderDay()}
        <div className="eli-scratch__status" data-testid="eli-diary-status">
          {status}
        </div>
      </div>
      {print && <DiaryPrint {...print} onClose={() => setPrint(null)} />}
    </div>
  );
}
