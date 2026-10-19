// ORG Mode para Eli (3.24): revisión semanal guiada. Tarjeta encima de la lista que va paso a paso
// (Inbox → proyectos sin acción siguiente → dormidos → fechas → Algún día). Se queda abierta al
// cambiar de vista, para poder ir a cada lista o proyecto y volver al paso siguiente.
import React from 'react';
import { REVIEW_STEPS, reviewCount } from '../../lib/gtd/gtd_review';

const MAX = 12;
const fmt = (d) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

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
}) {
  const done = step >= REVIEW_STEPS.length;
  const s = REVIEW_STEPS[Math.min(step, REVIEW_STEPS.length - 1)];
  const n = done ? 0 : reviewCount(review, s.id);

  const renderList = (list, dated = false) => (
    <ul className="gtd-review__list">
      {list.slice(0, MAX).map((t) => {
        const d = t.deadline || t.scheduled;
        return (
          <li key={t.key}>
            <button
              type="button"
              className="gtd-review__item"
              onClick={() => onOpenTask(t)}
              data-testid="gtd-review-item"
            >
              <i className={t.isProject ? 'fas fa-project-diagram' : 'far fa-circle'} />
              <span className="gtd-review__item-title">{t.title || '(sin título)'}</span>
              {dated && d && (
                <span
                  className={
                    'gtd-review__date' +
                    (+d < +new Date(today.getFullYear(), today.getMonth(), today.getDate())
                      ? ' is-overdue'
                      : '')
                  }
                >
                  {t.deadline ? (
                    <i className="fas fa-flag" />
                  ) : (
                    <i className="far fa-calendar-alt" />
                  )}{' '}
                  {fmt(d)}
                </span>
              )}
            </button>
          </li>
        );
      })}
      {list.length > MAX && <li className="gtd-review__more">y {list.length - MAX} más…</li>}
    </ul>
  );

  const body = () => {
    if (done) {
      return (
        <p className="gtd-review__hint" data-testid="gtd-review-done">
          ¡Revisión terminada! Todo está al día.
        </p>
      );
    }
    let content = null;
    if (s.id === 'stalled' || s.id === 'sleep') {
      content = n ? renderList(review[s.id]) : null;
    } else if (s.id === 'dates') {
      content = (
        <React.Fragment>
          {review.overdue.length > 0 && (
            <React.Fragment>
              <div className="gtd-review__sub">Atrasadas ({review.overdue.length})</div>
              {renderList(review.overdue, true)}
            </React.Fragment>
          )}
          {review.upcoming.length > 0 && (
            <React.Fragment>
              <div className="gtd-review__sub">Próximos 7 días ({review.upcoming.length})</div>
              {renderList(review.upcoming, true)}
            </React.Fragment>
          )}
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
        {s.view && (
          <button
            type="button"
            className="gtd-review__open"
            onClick={() => onOpenView(s.view)}
            data-testid="gtd-review-open"
          >
            <i className={s.icon} /> Abrir {s.id === 'inbox' ? 'Inbox' : 'Algún día'}
          </button>
        )}
      </React.Fragment>
    );
  };

  return (
    <section className="gtd-review" data-testid="gtd-review" aria-label="Revisión semanal">
      <div className="gtd-review__head">
        <i className="fas fa-clipboard-check gtd-review__icon" />
        <div className="gtd-review__titles">
          <div className="gtd-review__kicker">
            Revisión semanal
            {!done && ` · Paso ${step + 1} de ${REVIEW_STEPS.length}`}
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
              'gtd-review__dot' + (i === step ? ' is-on' : '') + (i < step ? ' is-past' : '')
            }
            title={x.label}
            onClick={() => onStep(i)}
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
