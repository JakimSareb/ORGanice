// ORG Mode para Eli (4.05): procesos diarios de GTD (Menú ☰ › Procesos › Diarios): «Planificar el
// día», «Cerrar el día» y «¿Qué hago ahora?». Tarjeta por pasos encima de la lista, como la
// Revisión semanal (usa sus estilos). Modelo en lib/gtd/gtd_daily.
import React, { useState } from 'react';
import {
  DAILY_PROCESSES,
  dailyCount,
  NOW_TIMES,
  NOW_ENERGY,
  whatNow,
  placeTags,
} from '../../lib/gtd/gtd_daily';

const MAX = 12;
const NOW_N = 3;
const fmt = (d) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
const isoDay = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(
    2,
    '0'
  )}`;

// Botones de cada fila según el paso: [tipo, icono, texto]
const ACTIONS = {
  due: [
    ['done', 'fas fa-check', 'Hecha'],
    ['tomorrow', 'fas fa-share', 'Mañana'],
  ],
  waiting: [
    ['done', 'fas fa-check', 'Recibida'],
    ['tomorrow', 'fas fa-share', 'Mañana'],
  ],
  tickler: [['inbox', 'fas fa-inbox', 'Al Inbox']],
  done: [['done', 'fas fa-check', 'Hecha']],
  next: [['done', 'fas fa-check', 'Hecha']],
  now: [['done', 'fas fa-check', 'Hecha']],
};

export default function GtdDailyProcess({
  kind,
  data,
  tasks,
  step,
  today,
  skipTags = [],
  onStep,
  onClose,
  onOpenTask,
  onMove,
  onCapture,
  onProcess,
  onNow,
  notAllen = false,
}) {
  const [expanded, setExpanded] = useState({});
  const [kept, setKept] = useState({});
  const [dateFor, setDateFor] = useState(null);
  const [now, setNow] = useState({ tag: null, time: null, energy: null, quick: false, page: 0 });
  const proc = DAILY_PROCESSES[kind];
  const steps = proc.steps;
  const multi = steps.length > 1;
  const done = multi && step >= steps.length;
  const s = steps[Math.min(step, steps.length - 1)];
  const t0 = +new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const tomorrow = new Date(t0 + 86400000);

  const rowActions = (t, id) => {
    if (id === 'pick') {
      const on = t.priority === 'A';
      return [['star', on ? 'fas fa-star' : 'far fa-star', on ? 'Quitar ★' : 'Poner ★', on]];
    }
    if (id === 'leftover') {
      const a = [['keep', 'fas fa-thumbtack', 'Se queda']];
      if (t.priority === 'A') a.push(['unstar', 'far fa-star', 'Quitar ★']);
      a.push(['tomorrow', 'fas fa-share', 'Mañana']);
      a.push(['date', 'far fa-calendar-alt', 'Otra fecha']);
      return a;
    }
    return ACTIONS[id] || null;
  };

  const act = (t, k) => {
    if (k === 'keep') setKept((x) => ({ ...x, [t.key]: true }));
    else if (k === 'date') setDateFor(dateFor === t.key ? null : t.key);
    else if (k === 'tomorrow') onMove(t, 'schedule', tomorrow);
    else onMove(t, k);
  };

  const renderList = (list, id) => {
    const all = !!expanded[id];
    const shown = all ? list : list.slice(0, MAX);
    return (
      <ul className="gtd-review__list">
        {shown.map((t) => {
          const d = t.deadline || t.scheduled;
          const actions = rowActions(t, id);
          return (
            <li key={t.key} className="gtd-review__row-wrap">
              <div className="gtd-review__row">
                <button
                  type="button"
                  className="gtd-review__item"
                  onClick={() => onOpenTask(t)}
                  data-testid="gtd-daily-item"
                >
                  <i className={t.priority === 'A' ? 'fas fa-star' : 'far fa-circle'} />
                  <span className="gtd-review__item-title">{t.title || '(sin título)'}</span>
                  {d && (
                    <span className={'gtd-review__date' + (+d < t0 ? ' is-overdue' : '')}>
                      {t.deadline ? (
                        <i className="fas fa-flag" />
                      ) : (
                        <i className="far fa-calendar-alt" />
                      )}{' '}
                      {fmt(d)}
                    </span>
                  )}
                  {id === 'now' && t.effort && (
                    <span className="gtd-review__date">
                      <i className="far fa-clock" /> {t.effort}
                    </span>
                  )}
                </button>
                {actions &&
                  actions.map(([k, icon, label, on]) => (
                    <button
                      key={k}
                      type="button"
                      className={'gtd-review__act gtd-review__act--' + k + (on ? ' is-on' : '')}
                      onClick={() => act(t, k)}
                      title={label}
                      aria-label={`${label}: ${t.title || ''}`}
                      data-testid={`gtd-daily-act-${k}`}
                    >
                      <i className={icon} />
                    </button>
                  ))}
              </div>
              {dateFor === t.key && (
                <div className="gtd-daily__date">
                  <input
                    type="date"
                    min={isoDay(tomorrow)}
                    defaultValue={isoDay(tomorrow)}
                    data-testid="gtd-daily-date"
                    aria-label="Nueva fecha"
                  />
                  <button
                    type="button"
                    className="gtd-review__btn is-primary"
                    data-testid="gtd-daily-date-ok"
                    onClick={(e) => {
                      const v = e.currentTarget.previousSibling.value;
                      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
                      if (!m) return;
                      setDateFor(null);
                      onMove(t, 'schedule', new Date(+m[1], +m[2] - 1, +m[3]));
                    }}
                  >
                    Reprogramar
                  </button>
                </div>
              )}
            </li>
          );
        })}
        {list.length > MAX && (
          <li className="gtd-review__more">
            <button
              type="button"
              className="gtd-review__more-btn"
              onClick={() => setExpanded((e) => ({ ...e, [id]: !all }))}
            >
              {all ? 'Ver menos' : `y ${list.length - MAX} más… (ver todas)`}
            </button>
          </li>
        )}
      </ul>
    );
  };

  const sub = (title, list, id) =>
    list.length > 0 && (
      <React.Fragment>
        <div className="gtd-review__sub">
          {title} ({list.length})
        </div>
        {renderList(list, id)}
      </React.Fragment>
    );

  const chip = (label, on, onClick, testId) => (
    <button
      key={testId}
      type="button"
      className={'gtd-daily__chip' + (on ? ' is-on' : '')}
      aria-pressed={on}
      onClick={onClick}
      data-testid={testId}
    >
      {label}
    </button>
  );
  const setNowOpt = (k, v) => setNow((n) => ({ ...n, [k]: n[k] === v ? null : v, page: 0 }));

  const renderNow = () => {
    const tags = placeTags(tasks, today, skipTags);
    const found = whatNow(tasks, now, today);
    const pages = Math.max(1, Math.ceil(found.length / NOW_N));
    const page = now.page % pages;
    const shown = found.slice(page * NOW_N, page * NOW_N + NOW_N);
    return (
      <React.Fragment>
        {tags.length > 0 && (
          <div className="gtd-daily__chips" data-testid="gtd-daily-tags">
            <span className="gtd-daily__label">Dónde</span>
            {tags.map((g) => chip(g, now.tag === g, () => setNowOpt('tag', g), `gtd-now-tag-${g}`))}
          </div>
        )}
        <div className="gtd-daily__chips">
          <span className="gtd-daily__label">Tiempo</span>
          {NOW_TIMES.map((b) =>
            chip(b.label, now.time === b.id, () => setNowOpt('time', b.id), `gtd-now-time-${b.id}`)
          )}
        </div>
        <div className="gtd-daily__chips">
          <span className="gtd-daily__label">Energía</span>
          {NOW_ENERGY.map((e) =>
            chip(
              { Low: 'Baja', Medium: 'Media', High: 'Alta' }[e],
              now.energy === e,
              () => setNowOpt('energy', e),
              `gtd-now-energy-${e}`
            )
          )}
          {chip(
            <span>
              <i className="fas fa-bolt" /> Rápido
            </span>,
            now.quick,
            () => setNow((n) => ({ ...n, quick: !n.quick, page: 0 })),
            'gtd-now-quick'
          )}
        </div>
        {found.length === 0 ? (
          <p className="gtd-review__empty" data-testid="gtd-review-empty">
            <i className="fas fa-coffee" /> Nada encaja ahora. Prueba con menos filtros.
          </p>
        ) : (
          <React.Fragment>
            <div className="gtd-review__sub" data-testid="gtd-now-count">
              Te propongo ({found.length} encajan)
            </div>
            {renderList(shown, 'now')}
            {pages > 1 && (
              <div className="gtd-review__tools">
                <button
                  type="button"
                  className="gtd-review__open"
                  onClick={() => setNow((n) => ({ ...n, page: n.page + 1 }))}
                  data-testid="gtd-now-other"
                >
                  <i className="fas fa-sync-alt" /> Otras
                </button>
              </div>
            )}
          </React.Fragment>
        )}
      </React.Fragment>
    );
  };

  const body = () => {
    if (done) {
      return (
        <p className="gtd-review__hint" data-testid="gtd-daily-done">
          {kind === 'plan'
            ? '¡Día planificado! A por ello.'
            : kind === 'daily'
            ? '¡Revisión diaria hecha!'
            : '¡Día cerrado! Hasta mañana.'}
        </p>
      );
    }
    if (kind === 'now') {
      return (
        <React.Fragment>
          <p className="gtd-review__hint">{s.hint}</p>
          {renderNow()}
        </React.Fragment>
      );
    }
    const n = dailyCount(data, s.id);
    let content = null;
    const tools = [];
    if (s.id === 'done') {
      content = (
        <React.Fragment>
          {sub('Focus', data.focus, 'done')}
          {sub('Next', data.next, 'done-next')}
        </React.Fragment>
      );
    } else if (s.id === 'capture') {
      content = (
        <p className="gtd-review__hint" data-testid="gtd-daily-inbox">
          <i className="fas fa-inbox" /> En el Inbox hay {data.inbox.length}.
        </p>
      );
    } else if (s.id === 'leftover') {
      const list = data.leftover.filter((t) => !kept[t.key]);
      content = list.length ? renderList(list, 'leftover') : null;
    } else if (s.id === 'pick') {
      content = (
        <React.Fragment>
          <p
            className={'gtd-daily__stars' + (data.stars > 5 ? ' is-many' : '')}
            data-testid="gtd-daily-stars"
          >
            <i className="fas fa-star" /> {data.stars} con ★
            {data.stars < 3
              ? ' · elige alguna más'
              : data.stars > 5
              ? ' · son muchas'
              : ' · ¡bien!'}
          </p>
          {renderList(data.pick, 'pick')}
        </React.Fragment>
      );
    } else {
      content = n ? renderList(data[s.id], s.id) : null;
    }
    // (4.16) la Revisión diaria acaba en «¿Qué hago ahora?»
    if (kind === 'daily' && s.id === 'next' && onNow) {
      tools.push(
        <button
          key="now"
          type="button"
          className="gtd-review__open"
          onClick={onNow}
          data-testid="gtd-daily-now"
        >
          <i className="fas fa-bolt" /> ¿Qué hago ahora?
        </button>
      );
    }
    if (s.id === 'capture') {
      tools.push(
        <button
          key="cap"
          type="button"
          className="gtd-review__open"
          onClick={onCapture}
          data-testid="gtd-daily-capture"
        >
          <i className="fas fa-plus" /> Apuntar algo
        </button>
      );
      if (data.inbox.length)
        tools.push(
          <button
            key="proc"
            type="button"
            className="gtd-review__open"
            onClick={onProcess}
            data-testid="gtd-daily-process"
          >
            <i className="fas fa-filter" /> Procesar Inbox
          </button>
        );
    }
    const empty =
      s.id !== 'capture' &&
      (s.id === 'leftover' ? !data.leftover.some((t) => !kept[t.key]) : n === 0);
    return (
      <React.Fragment>
        {notAllen && (
          <p className="gtd-review__hint gtd-daily__notallen" data-testid="gtd-daily-notallen">
            <i className="fas fa-info-circle" /> No es de Allen: lo tienes activado en Ajustes ›
            Allen estricto.
          </p>
        )}
        <p className="gtd-review__hint">{s.hint}</p>
        {empty ? (
          <p className="gtd-review__empty" data-testid="gtd-review-empty">
            <i className="fas fa-check" /> Nada aquí.
          </p>
        ) : (
          content
        )}
        {tools.length > 0 && <div className="gtd-review__tools">{tools}</div>}
      </React.Fragment>
    );
  };

  return (
    <section className="gtd-review gtd-daily" data-testid="gtd-daily" aria-label={proc.label}>
      <div className="gtd-review__head">
        <i className={proc.icon + ' gtd-review__icon'} />
        <div className="gtd-review__titles">
          <div className="gtd-review__kicker" data-testid="gtd-daily-kicker">
            {proc.label}
            {multi && !done && ` · Paso ${step + 1} de ${steps.length}`}
          </div>
          <div className="gtd-review__title" data-testid="gtd-daily-title">
            {done ? 'Terminado' : s.label}
            {!done && kind !== 'now' && (
              <span className="gtd-review__count">{dailyCount(data, s.id)}</span>
            )}
          </div>
        </div>
        <button
          type="button"
          className="gtd-review__close"
          onClick={onClose}
          title="Cerrar"
          aria-label="Cerrar"
          data-testid="gtd-daily-close"
        >
          <i className="fas fa-times" />
        </button>
      </div>
      {multi && (
        <div className="gtd-review__steps" role="tablist">
          {steps.map((x, i) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              aria-selected={i === step}
              className={
                'gtd-review__dot' + (i === step ? ' is-on' : '') + (i < step ? ' is-past' : '')
              }
              title={x.label}
              onClick={() => onStep(i)}
              data-testid={`gtd-daily-dot-${x.id}`}
            >
              <i className={x.icon} />
              {x.id !== 'capture' && dailyCount(data, x.id) > 0 && (
                <span className="gtd-review__dot-n">{dailyCount(data, x.id)}</span>
              )}
            </button>
          ))}
        </div>
      )}
      <div className="gtd-review__body">{body()}</div>
      <div className="gtd-review__nav">
        {multi && (
          <button
            type="button"
            className="gtd-review__btn"
            disabled={step === 0}
            onClick={() => onStep(step - 1)}
            data-testid="gtd-daily-prev"
          >
            <i className="fas fa-chevron-left" /> Anterior
          </button>
        )}
        {!multi || done ? (
          <button
            type="button"
            className="gtd-review__btn is-primary"
            onClick={onClose}
            data-testid="gtd-daily-finish"
          >
            Cerrar
          </button>
        ) : (
          <button
            type="button"
            className="gtd-review__btn is-primary"
            onClick={() => onStep(step + 1)}
            data-testid="gtd-daily-next"
          >
            {step === steps.length - 1 ? 'Terminar' : 'Siguiente'}{' '}
            <i className="fas fa-chevron-right" />
          </button>
        )}
      </div>
    </section>
  );
}
