// ORG Mode para Eli (2.13): calendario para consultar, al estilo de `M-x calendar` de Emacs.
// Solo fechas (sin tareas): tres meses (o el año entero), semanas ISO, festivos de España,
// fases de la Luna y cuenta de días entre dos fechas.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getISOWeek, getDayOfYear, differenceInCalendarDays } from 'date-fns';

import './stylesheet.css';

import { REGIONS, holidaysForYear, keyOfDate, workingDaysBetween } from '../../lib/eli_holidays';
import { phasesBetween } from '../../lib/lunar';
import { askDate } from '../../lib/eli_prompt';
import { isEditable } from '../../lib/eli_hotkeys';
import { requestAgendaDate } from '../../lib/eli_agenda_request';
import { activatePopup } from '../../actions/base';
import { useDispatch } from 'react-redux';
import { useHistory, useLocation } from 'react-router-dom';

export const openCalendar = () => window.dispatchEvent(new CustomEvent('eli:calendar'));

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];
const WEEKDAYS = ['lu', 'ma', 'mi', 'ju', 'vi', 'sá', 'do'];
const WEEKDAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const LS = {
  tap: 'eliCalTap', // 'agenda' (abre la agenda de ese día) | 'info' (datos y contar días)
  view: 'eliCalView', // 'three' | 'year'
  weeks: 'eliCalWeeks', // 'false' para ocultar
  moon: 'eliCalMoon', // 'false' para ocultar
  region: 'eliCalRegion',
  custom: 'eliCalCustom',
};
const readLS = (k, def) => {
  try {
    const v = window.localStorage.getItem(k);
    return v === null ? def : v;
  } catch (e) {
    return def;
  }
};
const writeLS = (k, v) => {
  try {
    window.localStorage.setItem(k, v);
  } catch (e) {}
};

const sameDay = (a, b) =>
  !!a &&
  !!b &&
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const longDate = (d) =>
  `${WEEKDAY_NAMES[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
const shiftMonth = ({ year, month }, n) => {
  const d = new Date(year, month + n, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
};

const relative = (d, today) => {
  const n = differenceInCalendarDays(d, today);
  if (n === 0) return 'hoy';
  if (n === 1) return 'mañana';
  if (n === -1) return 'ayer';
  return n > 0 ? `dentro de ${n} días` : `hace ${-n} días`;
};

function Month({
  year,
  month,
  today,
  weeks,
  holidayOf,
  moonOf,
  selected,
  range,
  onPick,
  onOpenDay,
  compact,
}) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // lunes primero
  const days = new Date(year, month + 1, 0).getDate();
  const rows = [];
  let day = 1 - offset;
  while (day <= days) {
    const row = [];
    for (let i = 0; i < 7; i++, day++) row.push(day >= 1 && day <= days ? day : null);
    rows.push(row);
  }
  return (
    <div className={'eli-cal__month' + (compact ? ' is-compact' : '')} data-testid="eli-cal-month">
      <div className="eli-cal__month-title">
        {MONTHS[month]} {year}
      </div>
      <table className="eli-cal__grid">
        <thead>
          <tr>
            {weeks && <th className="eli-cal__wk">sem</th>}
            {WEEKDAYS.map((w, i) => (
              <th key={w} className={i >= 5 ? 'is-weekend' : undefined}>
                {w}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => {
            const firstDay = row.find((x) => x !== null);
            return (
              <tr key={r}>
                {weeks && (
                  <td className="eli-cal__wk">{getISOWeek(new Date(year, month, firstDay))}</td>
                )}
                {row.map((dNum, i) => {
                  if (dNum === null) return <td key={i} className="is-empty" />;
                  const date = new Date(year, month, dNum);
                  const hol = holidayOf(date);
                  const moon = moonOf(date);
                  const inRange =
                    range && date >= range[0] && date <= range[1] && !sameDay(date, selected);
                  const cls = [
                    'eli-cal__day',
                    i >= 5 && 'is-weekend',
                    hol && 'is-holiday',
                    sameDay(date, today) && 'is-today',
                    sameDay(date, selected) && 'is-selected',
                    range && (sameDay(date, range[0]) || sameDay(date, range[1])) && 'is-edge',
                    inRange && 'is-in-range',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <td key={i}>
                      <button
                        type="button"
                        className={cls}
                        onClick={() => onPick(date)}
                        onDoubleClick={() => onOpenDay && onOpenDay(date)}
                        title={[hol && hol.join(', '), moon && moon.name]
                          .filter(Boolean)
                          .join(' · ')}
                        data-date={keyOfDate(date)}
                      >
                        {dNum}
                        {moon && <span className="eli-cal__moon">{moon.emoji}</span>}
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function EliCalendar() {
  const [open, setOpen] = useState(false);
  const [today, setToday] = useState(() => startOfDay(new Date()));
  const [anchor, setAnchor] = useState(() => ({
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  }));
  const [view, setView] = useState(() => readLS(LS.view, 'three'));
  const [weeks, setWeeks] = useState(() => readLS(LS.weeks, 'true') !== 'false');
  const [moonOn, setMoonOn] = useState(() => readLS(LS.moon, 'true') !== 'false');
  const [tapMode, setTapMode] = useState(() => readLS(LS.tap, 'agenda'));
  const dispatch = useDispatch();
  const history = useHistory();
  const location = useLocation();
  const [region, setRegion] = useState(() => readLS(LS.region, ''));
  const [custom, setCustom] = useState(() => readLS(LS.custom, ''));
  const [showOptions, setShowOptions] = useState(false);
  const [selected, setSelected] = useState(null);
  const [rangeEnd, setRangeEnd] = useState(null);
  const boxRef = useRef(null);
  const touch = useRef(null);

  useEffect(() => {
    const onOpen = () => {
      const now = startOfDay(new Date());
      setToday(now);
      setAnchor({ year: now.getFullYear(), month: now.getMonth() });
      setSelected(null);
      setRangeEnd(null);
      setShowOptions(false);
      setOpen(true);
    };
    window.addEventListener('eli:calendar', onOpen);
    return () => window.removeEventListener('eli:calendar', onOpen);
  }, []);

  // Meses a la vista
  const months = useMemo(
    () =>
      view === 'year'
        ? Array.from({ length: 12 }, (_, m) => ({ year: anchor.year, month: m }))
        : [-1, 0, 1].map((n) => shiftMonth(anchor, n)),
    [view, anchor]
  );

  // Festivos de los años a la vista (y de los de la selección)
  const holidays = useMemo(() => {
    const years = new Set(months.map((m) => m.year));
    // Todos los años entre las dos fechas elegidas (para contar bien los laborables)
    if (selected) years.add(selected.getFullYear());
    if (selected && rangeEnd) {
      const [y1, y2] = [selected.getFullYear(), rangeEnd.getFullYear()].sort((a, b) => a - b);
      for (let y = y1; y <= y2 && y - y1 < 50; y++) years.add(y);
    }
    const out = new Map();
    const approx = [];
    years.forEach((y) => {
      const { map, exact } = holidaysForYear(y, region, custom);
      map.forEach((v, k) => out.set(k, v));
      if (!exact) approx.push(y);
    });
    return { map: out, approx: approx.sort() };
  }, [months, region, custom, selected, rangeEnd]);
  const holidayOf = (date) => holidays.map.get(keyOfDate(date)) || null;

  // Fases principales de la Luna
  const moons = useMemo(() => {
    if (!moonOn) return new Map();
    const start = new Date(months[0].year, months[0].month, 1);
    const last = months[months.length - 1];
    const end = new Date(last.year, last.month + 1, 1);
    const map = new Map();
    phasesBetween(start, end).forEach((p) => map.set(keyOfDate(p.date), p));
    return map;
  }, [months, moonOn]);
  const moonOf = (date) => moons.get(keyOfDate(date)) || null;

  const close = () => setOpen(false);
  const move = (n) => setAnchor((a) => shiftMonth(a, n));
  const goToday = () => {
    const now = startOfDay(new Date());
    setToday(now);
    setAnchor({ year: now.getFullYear(), month: now.getMonth() });
    setSelected(null);
    setRangeEnd(null);
  };
  const goTo = async () => {
    const d = await askDate({ title: 'Ir a la fecha', value: selected || today, okLabel: 'Ir' });
    if (!d) return;
    setAnchor({ year: d.getFullYear(), month: d.getMonth() });
    setSelected(startOfDay(d));
    setRangeEnd(null);
  };
  const toggle = (key, value, setter) => {
    setter(value);
    writeLS(key, String(value));
  };
  const toggleView = () => toggle(LS.view, view === 'year' ? 'three' : 'year', setView);

  // ORG Mode para Eli (2.14): la agenda de un día (en la hoja abierta o en la vista GTD)
  const openAgendaFor = (date) => {
    requestAgendaDate(date);
    setOpen(false);
    const path = (location && location.pathname) || '';
    if (path.startsWith('/file/')) {
      dispatch(activatePopup('agenda'));
    } else if (path === '/gtd') {
      window.dispatchEvent(new CustomEvent('eli:gtd', { detail: { agenda: true } }));
    } else {
      window.__eliGtdPending = { agenda: true };
      history.push('/gtd');
    }
  };

  // Tocar un día: según la opción, abre su agenda, o lo selecciona (y tocar otro después
  // cuenta los días entre ambos)
  const pick = (date) => {
    if (tapMode === 'agenda') {
      openAgendaFor(date);
      return;
    }
    if (selected && !rangeEnd && !sameDay(date, selected)) {
      setRangeEnd(date);
      return;
    }
    if (selected && sameDay(date, selected) && !rangeEnd) {
      setSelected(null);
      return;
    }
    setSelected(date);
    setRangeEnd(null);
  };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      const typing = isEditable(e.target);
      // Otra ventana encima (p. ej. «Ir a la fecha»)
      const overlays = document.querySelectorAll('.eli-prompt__overlay');
      if (overlays.length) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (showOptions) setShowOptions(false);
        else close();
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      let handled = true;
      const by = view === 'year' ? 12 : 1;
      if (k === 'ArrowLeft' || k === '<') move(e.shiftKey && k === 'ArrowLeft' ? -12 : -by);
      else if (k === 'ArrowRight' || k === '>') move(e.shiftKey && k === 'ArrowRight' ? 12 : by);
      else if (k === 'PageUp' || k === '{') move(-12);
      else if (k === 'PageDown' || k === '}') move(12);
      else if (k === '.' || k === 't') goToday();
      else if (k === 'g') goTo();
      else if (k === 'y' || k === 'a') toggleView();
      else if (k === 'w') toggle(LS.weeks, !weeks, setWeeks);
      else if (k === 'l' || k === 'm') toggle(LS.moon, !moonOn, setMoonOn);
      else if (k === 'Enter' && selected) openAgendaFor(selected);
      else handled = false;
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  });

  useEffect(() => {
    if (open && boxRef.current) boxRef.current.focus({ preventScroll: true });
  }, [open]);

  if (!open) return null;

  // Línea de información
  let info = null;
  if (selected && rangeEnd) {
    const [a, b] = selected <= rangeEnd ? [selected, rangeEnd] : [rangeEnd, selected];
    const diff = differenceInCalendarDays(b, a);
    const work = workingDaysBetween(a, b, holidayOf);
    info = (
      <>
        <b>
          Del {a.getDate()} de {MONTHS[a.getMonth()]}
          {a.getFullYear() !== b.getFullYear() ? ` de ${a.getFullYear()}` : ''} al {b.getDate()} de{' '}
          {MONTHS[b.getMonth()]} de {b.getFullYear()}
        </b>
        : {diff} {diff === 1 ? 'día' : 'días'} de diferencia ({diff + 1} contando ambos) · {work}{' '}
        {work === 1 ? 'laborable' : 'laborables'}
      </>
    );
  } else if (selected) {
    const hol = holidayOf(selected);
    const moon = moonOf(selected);
    info = (
      <>
        <b>{longDate(selected)}</b> · semana {getISOWeek(selected)} · día {getDayOfYear(selected)} ·{' '}
        {relative(selected, today)}
        {hol && <span className="eli-cal__info-holiday"> · {hol.join(', ')}</span>}
        {moon && (
          <span>
            {' '}
            · {moon.emoji} {moon.name}
          </span>
        )}
        <span className="eli-cal__hint"> · toca otro día para contar los días</span>{' '}
        <button
          type="button"
          className="eli-cal__agenda-link"
          onClick={() => openAgendaFor(selected)}
          data-testid="eli-cal-open-agenda"
        >
          <i className="fas fa-calendar-day" /> Ver su agenda
        </button>
      </>
    );
  } else {
    info = (
      <span className="eli-cal__hint">
        {tapMode === 'agenda'
          ? 'Toca un día para abrir su agenda. (En Opciones puedes cambiarlo para ver sus datos y contar días.)'
          : 'Toca un día para ver sus datos; toca otro para contar los días entre ambos. Doble toque: su agenda.'}
      </span>
    );
  }
  const range = selected && rangeEnd ? [selected, rangeEnd].sort((a, b) => a - b) : null;

  const onTouchStart = (e) => {
    const t = e.touches && e.touches[0];
    touch.current = t ? { x: t.clientX, y: t.clientY } : null;
  };
  const onTouchEnd = (e) => {
    const s = touch.current;
    touch.current = null;
    const t = e.changedTouches && e.changedTouches[0];
    if (!s || !t) return;
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy))
      move(dx < 0 ? (view === 'year' ? 12 : 1) : view === 'year' ? -12 : -1);
  };

  const step = view === 'year' ? 12 : 1;
  const regionName = (REGIONS.find(([id]) => id === region) || REGIONS[0])[1];

  return (
    <div
      className="eli-cal__overlay"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
      data-testid="eli-calendar"
    >
      <div
        className={'eli-cal' + (view === 'year' ? ' is-year' : '')}
        role="dialog"
        aria-label="Calendario"
        tabIndex={-1}
        ref={boxRef}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="eli-cal__bar">
          <button
            type="button"
            className="eli-cal__nav"
            onClick={() => move(-12)}
            title="Año anterior (Mayús+←)"
            aria-label="Año anterior"
            data-testid="eli-cal-prev-year"
          >
            «
          </button>
          <button
            type="button"
            className="eli-cal__nav"
            onClick={() => move(-step)}
            title="Anterior (←)"
            aria-label="Anterior"
            data-testid="eli-cal-prev"
          >
            ‹
          </button>
          <button
            type="button"
            className="eli-cal__today"
            onClick={goToday}
            title="Hoy (.)"
            data-testid="eli-cal-today"
          >
            Hoy
          </button>
          <button
            type="button"
            className="eli-cal__nav"
            onClick={() => move(step)}
            title="Siguiente (→)"
            aria-label="Siguiente"
            data-testid="eli-cal-next"
          >
            ›
          </button>
          <button
            type="button"
            className="eli-cal__nav"
            onClick={() => move(12)}
            title="Año siguiente (Mayús+→)"
            aria-label="Año siguiente"
            data-testid="eli-cal-next-year"
          >
            »
          </button>
          <span className="eli-cal__spacer" />
          <button
            type="button"
            className={'eli-cal__tool' + (view === 'year' ? ' is-on' : '')}
            onClick={toggleView}
            title={view === 'year' ? 'Volver a tres meses (y)' : 'Año entero (y)'}
            data-testid="eli-cal-year"
          >
            Año
          </button>
          <button
            type="button"
            className={'eli-cal__tool' + (moonOn ? ' is-on' : '')}
            onClick={() => toggle(LS.moon, !moonOn, setMoonOn)}
            title={moonOn ? 'Ocultar las fases de la Luna (l)' : 'Mostrar las fases de la Luna (l)'}
            aria-pressed={moonOn}
            data-testid="eli-cal-moon"
          >
            <i className="fas fa-moon" />
          </button>
          <button
            type="button"
            className="eli-cal__tool"
            onClick={goTo}
            title="Ir a una fecha (g)"
            data-testid="eli-cal-goto"
          >
            <i className="fas fa-search" />
          </button>
          <button
            type="button"
            className={'eli-cal__tool' + (showOptions ? ' is-on' : '')}
            onClick={() => setShowOptions((v) => !v)}
            title="Opciones"
            data-testid="eli-cal-options-btn"
          >
            <i className="fas fa-cog" />
          </button>
          <button
            type="button"
            className="eli-cal__tool"
            onClick={close}
            title="Cerrar (Esc)"
            data-testid="eli-cal-close"
          >
            <i className="fas fa-times" />
          </button>
        </div>

        {showOptions && (
          <div className="eli-cal__options" data-testid="eli-cal-options">
            <label>
              <input
                type="checkbox"
                checked={weeks}
                onChange={(e) => toggle(LS.weeks, e.target.checked, setWeeks)}
              />{' '}
              Números de semana (w)
            </label>
            <label>
              <input
                type="checkbox"
                checked={moonOn}
                onChange={(e) => toggle(LS.moon, e.target.checked, setMoonOn)}
              />{' '}
              Fases de la Luna (l)
            </label>
            <label>
              Al tocar un día:{' '}
              <select
                value={tapMode}
                onChange={(e) => {
                  toggle(LS.tap, e.target.value, setTapMode);
                  setSelected(null);
                  setRangeEnd(null);
                }}
                data-testid="eli-cal-tap"
              >
                <option value="agenda">abrir su agenda</option>
                <option value="info">ver sus datos y contar días</option>
              </select>
            </label>
            <label>
              Festivos:{' '}
              <select
                value={region}
                onChange={(e) => toggle(LS.region, e.target.value, setRegion)}
                data-testid="eli-cal-region"
              >
                {REGIONS.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="eli-cal__custom">
              Festivos propios (locales, de empresa…), uno por línea: «15/05 San Isidro» (todos los
              años) o «24/09/2026 La Mercè» (solo ese año)
              <textarea
                rows={3}
                value={custom}
                onChange={(e) => toggle(LS.custom, e.target.value, setCustom)}
                data-testid="eli-cal-custom"
                spellCheck={false}
              />
            </label>
          </div>
        )}

        <div className={'eli-cal__months' + (view === 'year' ? ' is-year' : '')}>
          {months.map((m) => (
            <Month
              key={`${m.year}-${m.month}`}
              {...m}
              today={today}
              weeks={weeks}
              holidayOf={holidayOf}
              moonOf={moonOf}
              selected={selected}
              range={range}
              onPick={pick}
              onOpenDay={tapMode === 'info' ? openAgendaFor : null}
              compact={view === 'year'}
            />
          ))}
        </div>

        <div className="eli-cal__info" data-testid="eli-cal-info">
          {info}
        </div>
        <div className="eli-cal__legend">
          <span className="eli-cal__legend-holiday">■</span> festivo ({regionName}
          {holidays.approx.length ? `; ${holidays.approx.join(', ')}: aproximados` : ''}) ·{' '}
          <span className="eli-cal__legend-today">■</span> hoy
          <span className="eli-cal__keys">
            {' '}
            · ← → meses · Mayús+← → años · . hoy · g ir a · y año · Esc cerrar
          </span>
        </div>
      </div>
    </div>
  );
}
