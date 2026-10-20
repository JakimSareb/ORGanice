// ORG Mode para Eli (3.24): revisión semanal guiada. Tarjeta encima de la lista que va paso a paso.
// Se queda abierta al cambiar de vista, para poder ir a cada lista o proyecto y volver al paso
// siguiente. (3.41) Pasos de la checklist oficial de GTD (Despejar → Al día → Crear), con «Revisar
// Next» y «Elegir para la semana» (botones → Next / quitar de Next / hecha en cada fila).
import React, { useState } from 'react';
import { REVIEW_STEPS, REVIEW_PHASES, reviewCount } from '../../lib/gtd/gtd_review';

const MAX = 12;
const fmt = (d) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

// Botones de cada fila según el paso: [tipo, icono, texto]
const ACTIONS = {
  next: [
    ['done', 'fas fa-check', 'Hecha'],
    ['later', 'fas fa-minus', 'Quitar de Next'],
  ],
  week: [['next', 'fas fa-play', 'Next']],
  waiting: [['done', 'fas fa-check', 'Recibida']],
};

export default function GtdWeeklyReview({
  review,
  step,
  lastReview,
  today,
  onStep,
  onClose,
  onFinish,
  onOpenView,
  onOpenTask,
  onMove,
  onProcess,
  onCapture,
  onAgenda,
}) {
  const [expanded, setExpanded] = useState({});
  const done = step >= REVIEW_STEPS.length;
  const s = REVIEW_STEPS[Math.min(step, REVIEW_STEPS.length - 1)];
  const n = done ? 0 : reviewCount(review, s.id);
  const t0 = +new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const renderList = (list, opts = {}) => {
    const { dated = false, actions = null, id = s.id } = opts;
    const all = !!expanded[id];
    const shown = all ? list : list.slice(0, MAX);
    return (
      <ul className="gtd-review__list">
        {shown.map((t) => {
          const d = t.deadline || t.scheduled;
          return (
            <li key={t.key} className="gtd-review__row">
              <button
                type="button"
                className="gtd-review__item"
                onClick={() => onOpenTask(t)}
                data-testid="gtd-review-item"
              >
                <i className={t.isProject ? 'fas fa-project-diagram' : 'far fa-circle'} />
                <span className="gtd-review__item-title">{t.title || '(sin título)'}</span>
                {dated && d && (
                  <span className={'gtd-review__date' + (+d < t0 ? ' is-overdue' : '')}>
                    {t.deadline ? (
                      <i className="fas fa-flag" />
                    ) : (
                      <i className="far fa-calendar-alt" />
                    )}{' '}
                    {fmt(d)}
                  </span>
                )}
              </button>
              {actions &&
                actions.map(([kind, icon, label]) => (
                  <button
                    key={kind}
                    type="button"
                    className={'gtd-review__act gtd-review__act--' + kind}
                    onClick={() => onMove(t, kind)}
                    title={label}
                    aria-label={`${label}: ${t.title || ''}`}
                    data-testid={`gtd-review-act-${kind}`}
                  >
                    <i className={icon} />
                    {kind === 'next' && <span> {label}</span>}
                  </button>
                ))}
            </li>
          );
        })}
        {list.length > MAX && (
          <li className="gtd-review__more">
            <button
              type="button"
              className="gtd-review__more-btn"
              onClick={() => setExpanded((e) => ({ ...e, [id]: !all }))}
              data-testid="gtd-review-more"
            >
              {all ? 'Ver menos' : `y ${list.length - MAX} más… (ver todas)`}
            </button>
          </li>
        )}
      </ul>
    );
  };

  const sub = (title, list, opts) =>
    list.length > 0 && (
      <React.Fragment>
        <div className="gtd-review__sub">
          {title} ({list.length})
        </div>
        {renderList(list, opts)}
      </React.Fragment>
    );

  const extraButtons = () => {
    const b = [];
    if (s.id === 'inbox') {
      if (n > 0)
        b.push(
          <button
            key="proc"
            type="button"
            className="gtd-review__open"
            onClick={onProcess}
            data-testid="gtd-review-process"
          >
            <i className="fas fa-random" /> Procesar Inbox
          </button>
        );
    }
    if (s.id === 'dates')
      b.push(
        <button
          key="agenda"
          type="button"
          className="gtd-review__open"
          onClick={onAgenda}
          data-testid="gtd-review-agenda"
        >
          <i className="fas fa-calendar-alt" /> Abrir la agenda
        </button>
      );
    if (s.id === 'inbox' || s.id === 'someday')
      b.push(
        <button
          key="cap"
          type="button"
          className="gtd-review__open"
          onClick={onCapture}
          data-testid="gtd-review-capture"
        >
          <i className="fas fa-plus" /> {s.id === 'inbox' ? 'Apuntar algo' : 'Apuntar una idea'}
        </button>
      );
    if (s.view && s.id !== 'next' && s.id !== 'waiting')
      b.push(
        <button
          key="open"
          type="button"
          className="gtd-review__open"
          onClick={() => onOpenView(s.view)}
          data-testid="gtd-review-open"
        >
          <i className={s.icon} /> Abrir {s.id === 'inbox' ? 'Inbox' : 'Someday'}
        </button>
      );
    return b.length ? <div className="gtd-review__tools">{b}</div> : null;
  };

  const body = () => {
    if (done) {
      return (
        <p className="gtd-review__hint" data-testid="gtd-review-done">
          ¡Revisión terminada! Todo está al día.
        </p>
      );
    }
    let content = null;
    if (['stalled', 'sleep', 'next', 'waiting'].includes(s.id)) {
      content = n ? renderList(review[s.id], { actions: ACTIONS[s.id] }) : null;
    } else if (s.id === 'week') {
      content = (
        <React.Fragment>
          {sub('Todo', review.later, { actions: ACTIONS.week, id: 'week-later' })}
          {sub('Someday', review.someday, { actions: ACTIONS.week, id: 'week-someday' })}
        </React.Fragment>
      );
    } else if (s.id === 'dates') {
      content = (
        <React.Fragment>
          {sub('Atrasadas', review.overdue, { dated: true, id: 'overdue' })}
          {sub('Próximos 7 días', review.upcoming, { dated: true, id: 'upcoming' })}
        </React.Fragment>
      );
    }
    return (
      <React.Fragment>
        <p className="gtd-review__hint">{s.hint}</p>
        {n === 0 ? (
          <p className="gtd-review__empty" data-testid="gtd-review-empty">
            <i className="fas fa-check" /> Nada que revisar aquí.
          </p>
        ) : (
          content
        )}
        {extraButtons()}
      </React.Fragment>
    );
  };

  return (
    <section className="gtd-review" data-testid="gtd-review" aria-label="Revisión semanal">
      <div className="gtd-review__head">
        <i className="fas fa-clipboard-check gtd-review__icon" />
        <div className="gtd-review__titles">
          <div className="gtd-review__kicker" data-testid="gtd-review-kicker">
            Revisión semanal
            {!done && ` · ${REVIEW_PHASES[s.phase]} · Paso ${step + 1} de ${REVIEW_STEPS.length}`}
          </div>
          <div className="gtd-review__title" data-testid="gtd-review-title">
            {done ? 'Terminada' : s.label}
            {!done && <span className="gtd-review__count">{n}</span>}
          </div>
        </div>
        <button
          type="button"
          className="gtd-review__close"
          onClick={onClose}
          title="Cerrar la revisión"
          aria-label="Cerrar la revisión"
          data-testid="gtd-review-close"
        >
          <i className="fas fa-times" />
        </button>
      </div>
      <div className="gtd-review__steps" role="tablist">
        {REVIEW_STEPS.map((x, i) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={i === step}
            className={
              'gtd-review__dot' +
              (i === step ? ' is-on' : '') +
              (i < step ? ' is-past' : '') +
              (i > 0 && REVIEW_STEPS[i - 1].phase !== x.phase ? ' is-phase' : '')
            }
            title={`${REVIEW_PHASES[x.phase]}: ${x.label}`}
            onClick={() => onStep(i)}
            data-testid={`gtd-review-dot-${x.id}`}
          >
            <i className={x.icon} />
            {reviewCount(review, x.id) > 0 && (
              <span className="gtd-review__dot-n">{reviewCount(review, x.id)}</span>
            )}
          </button>
        ))}
      </div>
      <div className="gtd-review__body">{body()}</div>
      <div className="gtd-review__nav">
        {lastReview && (
          <span className="gtd-review__last">Última: {fmt(new Date(lastReview))}</span>
        )}
        <button
          type="button"
          className="gtd-review__btn"
          disabled={step === 0}
          onClick={() => onStep(step - 1)}
          data-testid="gtd-review-prev"
        >
          <i className="fas fa-chevron-left" /> Anterior
        </button>
        {done ? (
          <button
            type="button"
            className="gtd-review__btn is-primary"
            onClick={onClose}
            data-testid="gtd-review-finish"
          >
            Cerrar
          </button>
        ) : (
          <button
            type="button"
            className="gtd-review__btn is-primary"
            onClick={() => (step === REVIEW_STEPS.length - 1 ? onFinish() : onStep(step + 1))}
            data-testid="gtd-review-next"
          >
            {step === REVIEW_STEPS.length - 1 ? 'Terminar' : 'Siguiente'}{' '}
            <i className="fas fa-chevron-right" />
          </button>
        )}
      </div>
    </section>
  );
}
