// ORG Mode para Eli (3.01): herramienta «Turnos de acomodadores» (menú de la app y paleta).
// Lee y escribe pages/acomodadores.org (ver lib/eli_acomodadores.js; en Emacs, lo mismo con
// emacs/lisp/organice-acomodadores.el).
import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { List } from 'immutable';

import { exportOrg } from '../../lib/export_org';
import { loadFileQuietly, parseFile, setDirty, sync } from '../../actions/org';
import { showMessage, askConfirm } from '../../lib/eli_prompt';
import {
  ACOM_PATH,
  DAYS,
  MONTHS_ES,
  parseAcom,
  saveMonth,
  saveConfig,
  weeksOf,
  emptyMonth,
  suggestedMonth,
  countersForDraft,
  availableFor,
  parseAssigned,
  pendingMonths,
  allPeople,
  monthLabel,
  shortDate,
  resolveName,
} from '../../lib/eli_acomodadores';

import './stylesheet.css';

export const openAcomodadores = () => window.dispatchEvent(new CustomEvent('eli:acomodadores'));

const findPath = (files) => {
  if (files.getIn([ACOM_PATH, 'headers'])) return ACOM_PATH;
  const other = Array.from(files.keys()).find(
    (p) => /(^|\/)acomodadores\.org$/i.test(p || '') && files.getIn([p, 'headers'])
  );
  return other || null;
};

export default function EliAcomodadores({ onClose }) {
  const dispatch = useDispatch();
  const files = useSelector((s) => s.org.present.get('files'));
  const dontIndent = useSelector((s) => s.base.get('eliIndentOnExport') !== true);
  const [loading, setLoading] = useState(true);
  const today = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.resolve(dispatch(loadFileQuietly(ACOM_PATH)))
      .catch(() => null)
      .then(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [dispatch]);

  const path = findPath(files);
  const fileText = useMemo(() => {
    if (!path) return null;
    const f = files.get(path);
    return exportOrg({
      headers: f.get('headers'),
      linesBeforeHeadings: f.get('linesBeforeHeadings') || List(),
      dontIndent,
    });
  }, [files, path, dontIndent]);
  const acom = useMemo(() => (fileText !== null ? parseAcom(fileText, today) : null), [fileText, today]);

  // Mes elegido y su tabla (borrador)
  const [ym, setYm] = useState(null);
  const [rows, setRows] = useState(null);
  const [week, setWeek] = useState(0);
  const [assigned, setAssigned] = useState('');
  const [showCfg, setShowCfg] = useState(false);
  const [dirty, setDirtyDraft] = useState(false);

  const openMonth = (y, m, a = acom) => {
    const existing = a.months.find((x) => x.year === y && x.month === m);
    const base = emptyMonth(y, m, a.config);
    let r;
    if (existing && existing.rows.length) {
      r = existing.rows
        .filter((x) => x.dia || x.names.some(Boolean))
        .map((x) => ({ ...x, names: [...x.names] }));
    } else r = base;
    setYm({ year: y, month: m, exists: !!existing });
    setRows(r);
    setWeek(0);
    setDirtyDraft(false);
  };
  useEffect(() => {
    if (acom && !ym) {
      const s = suggestedMonth(acom, today);
      openMonth(s.year, s.month, acom);
    }
    // eslint-disable-next-line
  }, [acom]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !document.querySelector('.eli-prompt__overlay:not(.eli-acom__overlay)')) {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  });

  const close = async () => {
    if (dirty) {
      const ok = await askConfirm({
        title: 'Turnos de acomodadores',
        message: 'Hay cambios sin guardar en la tabla del mes. ¿Salir sin guardarlos?',
        okLabel: 'Salir sin guardar',
      });
      if (!ok) return;
    }
    onClose();
  };

  if (loading && !acom) {
    return (
      <Shell onClose={onClose}>
        <div className="eli-acom__empty">Cargando {ACOM_PATH}…</div>
      </Shell>
    );
  }
  if (!acom) {
    return (
      <Shell onClose={onClose}>
        <div className="eli-acom__empty">
          No encuentro el fichero <code>{ACOM_PATH}</code> en Dropbox. Crea ese fichero (o ábrelo una
          vez) con las tablas <code>#+NAME: Publicadores</code>, <code>Ancianos</code> y{' '}
          <code>Ministeriales</code> y el encabezado <code>* HISTORICO</code>.
        </div>
      </Shell>
    );
  }
  if (!ym || !rows) return null;

  // semanas del borrador (por la columna Semana)
  const weekKeys = [];
  let cur = '';
  rows.forEach((r) => {
    cur = r.semana || cur;
    if (!weekKeys.includes(cur)) weekKeys.push(cur);
  });
  const weekOfRow = [];
  cur = '';
  rows.forEach((r) => {
    cur = r.semana || cur;
    weekOfRow.push(weekKeys.indexOf(cur));
  });
  const wk = Math.min(week, Math.max(0, weekKeys.length - 1));
  const draft = { year: ym.year, month: ym.month, rows };
  const counters = countersForDraft(acom, draft);
  const { names: assignedNames, unknown: assignedUnknown } = parseAssigned(acom, assigned);
  const inWeek = new Set();
  rows.forEach((r, i) => {
    if (weekOfRow[i] !== wk) return;
    r.names.forEach((n) => {
      const who = resolveName(acom, n);
      if (who) inWeek.add(who);
    });
  });
  const groups = availableFor(counters, { exclude: assignedNames });
  const pending = pendingMonths(acom).filter((m) => !(m.year === ym.year && m.month === ym.month));
  const people = allPeople(acom).map((p) => p.name);
  const unknownInTable = Array.from(
    new Set(
      rows
        .flatMap((r) => r.names)
        .filter((n) => n && n.trim() && !/^(asamblea|-+|x+)$/i.test(n.trim()) && !resolveName(acom, n))
    )
  );

  const setCell = (i, k, v) => {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, names: k === 0 ? [v, r.names[1]] : [r.names[0], v] } : r)));
    setDirtyDraft(true);
  };
  const pick = (name) => {
    // al primer hueco de la semana elegida (día a día: acomodador 1 y 2)
    const i = rows.findIndex((r, j) => weekOfRow[j] === wk && r.dia && (!r.names[0] || !r.names[1]));
    if (i < 0) {
      showMessage('Turnos', 'Esta semana ya está completa. Borra un nombre para cambiarlo.');
      return;
    }
    setCell(i, rows[i].names[0] ? 1 : 0, name);
  };
  const changeMonth = async (delta) => {
    if (dirty) {
      const ok = await askConfirm({
        title: 'Cambiar de mes',
        message: 'Los cambios de este mes no se han guardado. ¿Cambiar de mes sin guardarlos?',
        okLabel: 'Cambiar',
      });
      if (!ok) return;
    }
    const d = new Date(ym.year, ym.month + delta, 1);
    openMonth(d.getFullYear(), d.getMonth());
  };
  const writeText = (text) => {
    dispatch(parseFile(path, text.endsWith('\n') ? text : `${text}\n`));
    dispatch(setDirty(true, path));
    dispatch(sync({ path, shouldSuppressMessages: true }));
  };
  const save = () => {
    const r = saveMonth(fileText, { year: ym.year, month: ym.month, rows }, today);
    writeText(r.text);
    setDirtyDraft(false);
    setYm((y) => ({ ...y, exists: true }));
    showMessage(
      'Guardado',
      `${monthLabel(ym.year, ym.month)} guardado en el histórico.` +
        (r.summed.length ? `\n\nSumado a los contadores: ${r.summed.join(' · ')}.` : '') +
        (r.unknown.length
          ? `\n\nNo están en la lista de hermanos (no se cuentan): ${r.unknown.join(', ')}.`
          : '')
    );
  };
  const saveSettings = (semanas, dias) => {
    writeText(saveConfig(fileText, { semanas, dias }));
    const s = { ...acom.config, semanas, dias };
    if (!ym.exists && !dirty) {
      setRows(emptyMonth(ym.year, ym.month, s));
      setWeek(0);
    }
  };
  const resetWeeks = async () => {
    const ok = await askConfirm({
      title: 'Rehacer la tabla',
      message: `¿Volver a hacer la tabla de ${monthLabel(ym.year, ym.month)} con los ajustes (${acom.config.semanas} semanas; ${acom.config.dias.join(', ')})? Se pierde lo escrito en ella.`,
      okLabel: 'Rehacer',
    });
    if (!ok) return;
    setRows(emptyMonth(ym.year, ym.month, acom.config));
    setWeek(0);
    setDirtyDraft(true);
  };

  return (
    <Shell onClose={close}>
      <div className="eli-acom__bar">
        <button type="button" className="btn" onClick={() => changeMonth(-1)} aria-label="Mes anterior" data-testid="eli-acom-prev">
          <i className="fas fa-chevron-left" />
        </button>
        <strong className="eli-acom__month" data-testid="eli-acom-month">
          {monthLabel(ym.year, ym.month)}
          {ym.exists ? ' (en el histórico)' : ' (nuevo)'}
        </strong>
        <button type="button" className="btn" onClick={() => changeMonth(1)} aria-label="Mes siguiente" data-testid="eli-acom-next">
          <i className="fas fa-chevron-right" />
        </button>
        <span className="eli-acom__spacer" />
        <button
          type="button"
          className={'btn' + (showCfg ? ' is-on' : '')}
          onClick={() => setShowCfg((v) => !v)}
          title="Ajustes: semanas y días de reunión"
          data-testid="eli-acom-settings"
        >
          <i className="fas fa-cog" />
        </button>
      </div>
      {showCfg && (
        <Settings config={acom.config} onSave={saveSettings} onRebuild={resetWeeks} />
      )}
      {pending.length > 0 && (
        <div className="eli-acom__note" data-testid="eli-acom-pending">
          Sin sumar a los contadores:{' '}
          {pending.map((m) => `${MONTHS_ES[m.month]} ${m.year}`).join(', ')} (se suman al guardar).
        </div>
      )}
      <div className="eli-acom__weeks" role="tablist">
        {weekKeys.map((k, i) => (
          <button
            key={k + i}
            type="button"
            role="tab"
            aria-selected={i === wk}
            className={'eli-acom__week' + (i === wk ? ' is-on' : '')}
            onClick={() => setWeek(i)}
            data-testid="eli-acom-week"
          >
            {k || '—'}
          </button>
        ))}
      </div>
      <div className="eli-acom__cols">
        <section className="eli-acom__side">
          <label className="eli-acom__label" htmlFor="eli-acom-assigned">
            Asignados de la semana (uno por línea)
          </label>
          <textarea
            id="eli-acom-assigned"
            className="eli-acom__assigned"
            rows={5}
            value={assigned}
            onChange={(e) => setAssigned(e.target.value)}
            placeholder={'Pega aquí los nombres\n(se quitan de los disponibles)'}
            data-testid="eli-acom-assigned"
            data-eli-noformat=""
          />
          {assignedUnknown.length > 0 && (
            <div className="eli-acom__warn">No están en la lista: {assignedUnknown.join(', ')}</div>
          )}
          <div className="eli-acom__label">Disponibles</div>
          {groups.map((g) => (
            <div key={g.id} className="eli-acom__group">
              <div className="eli-acom__group-title">{g.label}</div>
              {g.people.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  className={'eli-acom__person' + (inWeek.has(p.name) ? ' is-in' : '')}
                  onClick={() => pick(p.name)}
                  title="Ponerlo en el primer hueco de la semana"
                  data-testid="eli-acom-person"
                >
                  <span className="eli-acom__name">{p.name}</span>
                  <span className="eli-acom__meta">
                    {p.veces} · {shortDate(p.last)}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </section>
        <section className="eli-acom__table-wrap">
          <table className="eli-acom__table" data-testid="eli-acom-table">
            <thead>
              <tr>
                <th>Semana</th>
                <th>Día</th>
                <th>Acomodador 1</th>
                <th>Acomodador 2</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={weekOfRow[i] === wk ? 'is-week' : ''} onClick={() => setWeek(weekOfRow[i])}>
                  <td>{r.semana}</td>
                  <td>{r.dia}</td>
                  {[0, 1].map((k) => (
                    <td key={k}>
                      <input
                        value={r.names[k]}
                        list="eli-acom-names"
                        onChange={(e) => setCell(i, k, e.target.value)}
                        data-testid={`eli-acom-cell-${i}-${k}`}
                        data-eli-noformat=""
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <datalist id="eli-acom-names">
            {people.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          {unknownInTable.length > 0 && (
            <div className="eli-acom__warn" data-testid="eli-acom-unknown">
              No están en la lista de hermanos (no se cuentan): {unknownInTable.join(', ')}
            </div>
          )}
        </section>
      </div>
      <div className="eli-prompt__buttons">
        <button type="button" className="btn eli-prompt__cancel" onClick={close}>
          Cerrar
        </button>
        <button type="button" className="btn eli-prompt__ok" onClick={save} data-testid="eli-acom-save">
          Guardar el mes
        </button>
      </div>
    </Shell>
  );
}

function Shell({ onClose, children }) {
  return (
    <div
      className="eli-prompt__overlay eli-acom__overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="eli-prompt__box eli-acom" role="dialog" aria-label="Turnos de acomodadores" data-testid="eli-acom">
        <div className="eli-acom__head">
          <strong>
            <i className="fas fa-users" /> Turnos de acomodadores
          </strong>
          <button type="button" className="btn" onClick={onClose} aria-label="Cerrar">
            <i className="fas fa-times" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Settings({ config, onSave, onRebuild }) {
  const [semanas, setSemanas] = useState(config.semanas);
  const [dias, setDias] = useState(config.dias);
  return (
    <div className="eli-acom__cfg" data-testid="eli-acom-cfg">
      <label>
        Semanas por mes{' '}
        <input
          type="number"
          min={1}
          max={6}
          value={semanas}
          onChange={(e) => setSemanas(Math.max(1, Math.min(6, +e.target.value || 5)))}
        />
      </label>
      <div className="eli-acom__days">
        Días de reunión:
        {DAYS.map((d) => (
          <label key={d.id}>
            <input
              type="checkbox"
              checked={dias.includes(d.id)}
              onChange={(e) =>
                setDias((ds) =>
                  e.target.checked
                    ? DAYS.map((x) => x.id).filter((x) => x === d.id || ds.includes(x))
                    : ds.filter((x) => x !== d.id)
                )
              }
            />{' '}
            {d.label}
          </label>
        ))}
      </div>
      <div className="eli-acom__cfg-btns">
        <button type="button" className="btn" disabled={!dias.length} onClick={() => onSave(semanas, dias)} data-testid="eli-acom-cfg-save">
          Guardar ajustes
        </button>
        <button type="button" className="btn" onClick={onRebuild}>
          Rehacer la tabla del mes
        </button>
      </div>
      <div className="eli-acom__hint">Se guardan en el propio fichero (#+ACOM_SEMANAS, #+ACOM_DIAS), igual para Emacs.</div>
    </div>
  );
}
