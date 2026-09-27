// ORG Mode para Eli: fecha programada del editor GTD, como en Nirvana: un campo que abre un menú
// para elegir la fecha de inicio (con atajos) y para hacerla repetir (ventana «Repetir»).
// Todo se escribe como en Emacs: SCHEDULED: <2026-09-28 Mon +1w>.
import React, { useEffect, useRef, useState } from 'react';
import addDays from 'date-fns/addDays';
import addWeeks from 'date-fns/addWeeks';
import addMonths from 'date-fns/addMonths';
import addYears from 'date-fns/addYears';

import { parseRepeat } from '../../lib/gtd/gtd_model';

const pad = (n) => String(n).padStart(2, '0');
const toInput = (d) => (d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : '');
const fromInput = (s) => {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const fmt = (d, withYear = true) =>
  d
    ? d.toLocaleDateString('es-ES', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        ...(withYear ? { year: 'numeric' } : {}),
      })
    : '';

export const UNITS = [
  { id: 'd', label: 'diaria', every: ['día', 'días'], add: addDays },
  { id: 'w', label: 'semanal', every: ['semana', 'semanas'], add: addWeeks },
  { id: 'm', label: 'mensual', every: ['mes', 'meses'], add: addMonths },
  { id: 'y', label: 'anual', every: ['año', 'años'], add: addYears },
];
export const REPEAT_TYPES = [
  { id: '+', label: 'la fecha prevista' },
  { id: '++', label: 'la fecha prevista, saltando las que ya han pasado' },
  { id: '.+', label: 'el día en que la terminas' },
];

// «cada semana», «cada 2 días»…
export const describeRepeat = (text) => {
  const r = parseRepeat(text);
  if (!r) return '';
  const u = UNITS.find((x) => x.id === r.unit);
  if (!u) return `repite ${text}`;
  const every = r.value === 1 ? `cada ${u.every[0]}` : `cada ${r.value} ${u.every[1]}`;
  return r.type === '.+' ? `${every} desde que la terminas` : every;
};

export const nextDates = (start, text, count = 3) => {
  const r = parseRepeat(text);
  const u = r && UNITS.find((x) => x.id === r.unit);
  if (!start || !u) return [];
  const out = [start];
  for (let i = 1; i < count; i++) out.push(u.add(start, r.value * i));
  return out;
};

const nextMonday = (today) => addDays(today, (8 - today.getDay()) % 7 || 7);

function RepeatDialog({ date, repeat, deadlineSame, onCancel, onSave, onRemove }) {
  const r = parseRepeat(repeat) || { type: '+', value: 1, unit: 'd' };
  const [unit, setUnit] = useState(['d', 'w', 'm', 'y'].includes(r.unit) ? r.unit : 'd');
  const [every, setEvery] = useState(String(r.value || 1));
  const [type, setType] = useState(r.type || '+');
  const [next, setNext] = useState(toInput(date || new Date()));
  const [addDue, setAddDue] = useState(!!deadlineSame);
  const n = Math.max(1, Math.min(999, parseInt(every, 10) || 1));
  const text = `${type}${n}${unit}`;
  const u = UNITS.find((x) => x.id === unit);
  const preview = nextDates(fromInput(next), text, 3);
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }
  };
  return (
    <div className="gtd-repeat__overlay" onKeyDown={onKey}>
      <div className="gtd-repeat" role="dialog" aria-label="Repetir" data-testid="gtd-repeat">
        <div className="gtd-repeat__title">
          <i className="fas fa-redo-alt" /> Repetir
        </div>
        <label className="gtd-repeat__row">
          <span>Repetición</span>
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            data-testid="gtd-repeat-unit"
          >
            {UNITS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <div className="gtd-repeat__box">
          <label className="gtd-repeat__row">
            <span>Cada</span>
            <input
              type="number"
              min="1"
              max="999"
              value={every}
              onChange={(e) => setEvery(e.target.value)}
              data-testid="gtd-repeat-every"
            />
            <span>{n === 1 ? u.every[0] : u.every[1]}</span>
          </label>
          <label className="gtd-repeat__row">
            <span>Próxima</span>
            <input
              type="date"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              data-testid="gtd-repeat-next"
            />
          </label>
          {preview.length > 0 && (
            <div className="gtd-repeat__preview" data-testid="gtd-repeat-preview">
              {preview.map((d) => (
                <span key={+d}>→ {fmt(d)}</span>
              ))}
              <span>…</span>
            </div>
          )}
          <label className="gtd-repeat__row">
            <span>Cuenta desde</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              data-testid="gtd-repeat-type"
            >
              {REPEAT_TYPES.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="gtd-repeat__check">
          <input
            type="checkbox"
            checked={addDue}
            onChange={(e) => setAddDue(e.target.checked)}
            data-testid="gtd-repeat-due"
          />
          <span>Añadir también la fecha límite (vence el mismo día y se repite igual)</span>
        </label>
        <div className="gtd-repeat__hint">
          Se escribe como en Emacs: <code>SCHEDULED: &lt;… {text}&gt;</code>
        </div>
        <div className="gtd-repeat__buttons">
          {repeat && (
            <button
              type="button"
              className="gtd-btn gtd-btn--link gtd-btn--danger"
              onClick={onRemove}
              data-testid="gtd-repeat-remove"
            >
              Quitar la repetición
            </button>
          )}
          <span className="gtd-spacer" />
          <button type="button" className="gtd-btn gtd-btn--cancel" onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="button"
            className="gtd-btn gtd-btn--primary"
            onClick={() => onSave({ date: fromInput(next), repeat: text, addDue })}
            data-testid="gtd-repeat-save"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * value: 'yyyy-mm-dd' · repeat: «+1w» o '' · onChange(value, repeat) ·
 * deadline / deadlineRepeat + onDeadline(value, repeat) para «Añadir también la fecha límite»
 */
export default function ScheduleField({
  value,
  repeat,
  onChange,
  deadline,
  deadlineRepeat,
  onDeadline,
  label = 'empieza',
}) {
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState(false);
  const ref = useRef(null);
  const date = fromInput(value);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open]);

  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const pick = (d) => {
    onChange(toInput(d), d ? repeat : '');
    setOpen(false);
  };
  const summary = date ? `${fmt(date)}${repeat ? ` · ${describeRepeat(repeat)}` : ''}` : '';

  return (
    <div className="gtd-sched" ref={ref}>
      <button
        type="button"
        className={'gtd-ed__field gtd-sched__btn' + (value ? ' has-value' : '')}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        title="Programar: fecha de inicio y repetición"
        data-testid="gtd-editor-schedule-btn"
      >
        <i className={repeat ? 'fas fa-redo-alt' : 'far fa-calendar-alt'} aria-hidden="true" />
        {value ? (
          <span className="gtd-sched__text">
            <span className="gtd-sched__kind">Programada ›</span> {summary}
          </span>
        ) : (
          <span className="gtd-ed__field-label">{label}</span>
        )}
        <i className="fas fa-caret-down gtd-sched__caret" aria-hidden="true" />
      </button>
      {open && (
        <div className="gtd-sched__menu" role="menu" data-testid="gtd-schedule-menu">
          <div className="gtd-sched__head">Fecha de inicio</div>
          <input
            type="date"
            value={value}
            onChange={(e) => {
              onChange(e.target.value, e.target.value ? repeat : '');
              setOpen(false);
            }}
            data-testid="gtd-editor-scheduled"
          />
          <div className="gtd-sched__quick">
            <button type="button" onClick={() => pick(t0)}>
              Hoy
            </button>
            <button type="button" onClick={() => pick(addDays(t0, 1))}>
              Mañana
            </button>
            <button type="button" onClick={() => pick(nextMonday(t0))}>
              El lunes
            </button>
            <button type="button" onClick={() => pick(addWeeks(t0, 1))}>
              En una semana
            </button>
            <button type="button" onClick={() => pick(addMonths(t0, 1))}>
              En un mes
            </button>
          </div>
          <div className="gtd-sched__sep" />
          <button
            type="button"
            className="gtd-sched__item"
            onClick={() => {
              setOpen(false);
              setDialog(true);
            }}
            data-testid="gtd-editor-repeat"
          >
            <i className="fas fa-redo-alt" /> {repeat ? 'Cambiar la repetición…' : 'Repetir…'}
          </button>
          {repeat && (
            <button
              type="button"
              className="gtd-sched__item"
              onClick={() => {
                onChange(value, '');
                // la fecha límite que se añadió con la misma repetición deja de repetirse también
                if (deadlineRepeat && deadlineRepeat === repeat && onDeadline) {
                  onDeadline(deadline, '');
                }
                setOpen(false);
              }}
              data-testid="gtd-editor-repeat-remove"
            >
              <i className="fas fa-ban" /> Quitar la repetición
            </button>
          )}
          {value && (
            <button
              type="button"
              className="gtd-sched__item"
              onClick={() => pick(null)}
              data-testid="gtd-editor-scheduled-clear"
            >
              <i className="fas fa-times" /> Quitar la fecha
            </button>
          )}
        </div>
      )}
      {dialog && (
        <RepeatDialog
          date={date}
          repeat={repeat}
          deadlineSame={!!deadline && deadline === value && !!deadlineRepeat}
          onCancel={() => setDialog(false)}
          onRemove={() => {
            onChange(value, '');
            if (deadline === value && deadlineRepeat && onDeadline) onDeadline(deadline, '');
            setDialog(false);
          }}
          onSave={({ date: d, repeat: r, addDue }) => {
            const v = toInput(d || t0);
            onChange(v, r);
            if (onDeadline) {
              if (addDue) onDeadline(v, r);
              else if (deadline === value && deadlineRepeat) onDeadline(deadline, '');
            }
            setDialog(false);
          }}
        />
      )}
    </div>
  );
}
