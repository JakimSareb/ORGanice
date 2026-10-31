// ORG Mode para Eli (3.24): revisión semanal guiada. Tarjeta encima de la lista que va paso a paso.
// Se queda abierta al cambiar de vista, para poder ir a cada lista o proyecto y volver al paso
// siguiente. (3.41) Pasos de la checklist oficial de GTD (Despejar → Al día → Crear), con «Revisar
// Next» y «Elegir para la semana» (botones → Next / quitar de Next / hecha en cada fila).
import { personOf } from '../../lib/gtd/gtd_guided';
import React, { useState } from 'react';
import { REVIEW_STEPS, REVIEW_PHASES, reviewCount } from '../../lib/gtd/gtd_review';
import { objectiveRefOf } from '../../lib/gtd/gtd_horizons';
import { zkCommand } from '../../lib/eli_zk_actions';

// (4.15) pasos sin lista: solo pista y cuadro para apuntar (no «Nada que revisar aquí»)
// (4.47) 'zk': la Revisión ZK, con su botón
const NO_LIST = ['loose', 'mind', 'checklists', 'creative', 'zk'];

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
  // (4.15) Allen estricto: en Next solo tachar; en Someday activar o borrar
  strictNext: [['done', 'fas fa-check', 'Hecha']],
  someday: [
    ['next', 'fas fa-play', 'Activar'],
    ['trash', 'fas fa-trash', 'Borrar'],
  ],
};

const NO_OPEN_BTN = ['loose', 'mind', 'past', 'upcoming', 'projects', 'goals', 'creative'];

export default function GtdWeeklyReview({
  steps: stepsProp,
  strict = false,
  horizonsOn = false,
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
  onCaptureText,
  onSweep,
  onProjectAction,
  onReplan,
  onHorizons,
  checklistId = null, // (4.49) id de la sección «Checklist» del usuario (null: no hay)
  agendas = [], // (4.48) agendas con casillas abiertas: [{ headerId, label, open }]
}) {
  const REVIEW_STEPS_NOW = stepsProp || REVIEW_STEPS;
  const [expanded, setExpanded] = useState({});
  const [capText, setCapText] = useState('');
  const [projIdx, setProjIdx] = useState(0);
  const [projNext, setProjNext] = useState('');
  const done = step >= REVIEW_STEPS_NOW.length;
  const s = REVIEW_STEPS_NOW[Math.min(step, REVIEW_STEPS_NOW.length - 1)];
  const n = done ? 0 : reviewCount(review, s.id);
  const t0 = +new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const renderList = (list, opts = {}) => {
    const { dated = false, actions = null, id = s.id, done: doneList = false } = opts;
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
                <i
                  className={
                    t.isProject
                      ? 'fas fa-project-diagram'
                      : doneList
                      ? 'far fa-check-circle'
                      : 'far fa-circle'
                  }
                />
                <span className="gtd-review__item-title">{t.title || '(sin título)'}</span>
                {doneList && t.closed && <span className="gtd-review__date">{fmt(t.closed)}</span>}
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
    if (s.id === 'zk')
      b.push(
        <button
          key="zk"
          type="button"
          className="gtd-review__open"
          onClick={() => zkCommand({ action: 'review' })}
          data-testid="gtd-review-zk"
        >
          <i className="far fa-lightbulb" /> Abrir la Revisión ZK
        </button>
      );
    if (s.id === 'mind' && onSweep)
      b.push(
        <button
          key="sweep"
          type="button"
          className="gtd-review__open"
          onClick={onSweep}
          data-testid="gtd-review-sweep"
        >
          <i className="fas fa-box-open" /> Volcado mental
        </button>
      );
    if (s.id === 'goals' && horizonsOn && onHorizons)
      b.push(
        <button
          key="hz"
          type="button"
          className="gtd-review__open"
          onClick={onHorizons}
          data-testid="gtd-review-horizons"
        >
          <i className="fas fa-binoculars" /> Revisión de horizontes
        </button>
      );
    if (s.id === 'dates' || s.id === 'past' || s.id === 'upcoming')
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
    // (4.56) los pasos que solo saltan de sección (sin botón «Abrir») van en NO_OPEN_BTN
    if (
      s.view &&
      !NO_OPEN_BTN.includes(s.id) &&
      s.id !== 'next' &&
      s.id !== 'waiting' &&
      (s.id !== 'checklists' || checklistId)
    )
      b.push(
        <button
          key="open"
          type="button"
          className="gtd-review__open"
          onClick={() => onOpenView(s.view)}
          data-testid="gtd-review-open"
        >
          <i className={s.icon} /> Abrir{' '}
          {s.id === 'inbox'
            ? 'Inbox'
            : s.id === 'closed'
            ? 'el Logbook'
            : s.id === 'checklists'
            ? 'Checklist'
            : 'Someday'}
        </button>
      );
    return (
      <React.Fragment>
        {s.capture && onCaptureText && renderCapture()}
        {b.length ? <div className="gtd-review__tools">{b}</div> : null}
      </React.Fragment>
    );
  };

  // (4.15) cuadro para apuntar al Inbox lo que dispare el paso
  function renderCapture() {
    const add = () => {
      const v = capText.trim();
      if (v && onCaptureText(v) !== false) setCapText('');
    };
    return (
      <div className="gtd-proc__row gtd-review__capture">
        <input
          className="gtd-proc__input"
          value={capText}
          onChange={(e) => setCapText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder={s.capture}
          data-testid="gtd-review-capture-input"
        />
        <button
          type="button"
          className="gtd-review__open"
          onClick={add}
          disabled={!capText.trim()}
          data-testid="gtd-review-capture-add"
        >
          <i className="fas fa-plus" /> Apuntar
        </button>
      </div>
    );
  }

  // (4.15) proyectos uno a uno
  function renderProjects() {
    const cards = review.projects || [];
    if (!cards.length) return null;
    const i = Math.min(projIdx, cards.length - 1);
    const { project: p, next } = cards[i];
    const ref = objectiveRefOf(p);
    const notes = (p.description || '').trim();
    const go = (j) => {
      setProjIdx(Math.max(0, Math.min(j, cards.length - 1)));
      setProjNext('');
    };
    const addNext = () => {
      const v = projNext.trim();
      if (!v) return;
      if (onProjectAction(p, 'next', v) !== false) setProjNext('');
    };
    return (
      <div className="gtd-review__project" data-testid="gtd-review-proj">
        <div className="gtd-review__sub">
          Proyecto {i + 1} de {cards.length}
        </div>
        <ul className="gtd-review__list">
          <li className="gtd-review__row">
            <button
              type="button"
              className="gtd-review__item"
              onClick={() => onOpenTask(p)}
              data-testid="gtd-review-proj-title"
            >
              <i className="fas fa-project-diagram" />
              <span className="gtd-review__item-title">{p.title || '(sin título)'}</span>
            </button>
          </li>
        </ul>
        {(p.area || ref) && (
          <p className="gtd-review__hint">
            {p.area && (
              <span>
                <i className="fas fa-map-signs" /> {p.area}{' '}
              </span>
            )}
            {ref && (
              <span>
                <i className="fas fa-bullseye" /> {ref.title || ref.id}
              </span>
            )}
          </p>
        )}
        {notes && (
          <p className="gtd-review__hint gtd-review__notes" data-testid="gtd-review-proj-notes">
            {notes.length > 300 ? notes.slice(0, 300) + '…' : notes}
          </p>
        )}
        {next.length ? (
          renderList(next, { id: 'proj-next-' + p.key })
        ) : (
          <p className="gtd-review__empty is-warn" data-testid="gtd-review-proj-nonext">
            <i className="fas fa-exclamation-triangle" /> Sin acción siguiente
          </p>
        )}
        <div className="gtd-proc__row">
          <input
            className="gtd-proc__input"
            value={projNext}
            onChange={(e) => setProjNext(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addNext()}
            placeholder="Añadir una acción siguiente"
            data-testid="gtd-review-proj-next-input"
          />
          <button
            type="button"
            className="gtd-review__open"
            onClick={addNext}
            disabled={!projNext.trim()}
            data-testid="gtd-review-proj-next-add"
          >
            <i className="fas fa-plus" /> Next
          </button>
        </div>
        <div className="gtd-review__tools">
          <button
            type="button"
            className="gtd-review__open"
            disabled={!next.length}
            onClick={() => go(i + 1)}
            data-testid="gtd-review-proj-ok"
          >
            <i className="fas fa-check" /> Tiene siguiente acción
          </button>
          <button
            type="button"
            className="gtd-review__open"
            onClick={() => onReplan(p)}
            data-testid="gtd-review-proj-replan"
          >
            <i className="fas fa-drafting-compass" /> Replanificar
          </button>
          <button
            type="button"
            className="gtd-review__open"
            onClick={() => onProjectAction(p, 'sleep')}
            data-testid="gtd-review-proj-sleep"
          >
            <i className="fas fa-bed" /> Dormir
          </button>
          <button
            type="button"
            className="gtd-review__open"
            onClick={() => onProjectAction(p, 'close')}
            data-testid="gtd-review-proj-close"
          >
            <i className="fas fa-flag-checkered" /> Cerrar
          </button>
        </div>
        <div className="gtd-review__tools">
          <button
            type="button"
            className="gtd-review__btn"
            disabled={i === 0}
            onClick={() => go(i - 1)}
            data-testid="gtd-review-proj-prev"
          >
            <i className="fas fa-chevron-left" /> Proyecto anterior
          </button>
          <button
            type="button"
            className="gtd-review__btn"
            disabled={i >= cards.length - 1}
            onClick={() => go(i + 1)}
            data-testid="gtd-review-proj-skip"
          >
            Proyecto siguiente <i className="fas fa-chevron-right" />
          </button>
        </div>
      </div>
    );
  }

  const body = () => {
    if (done) {
      return (
        <p className="gtd-review__hint" data-testid="gtd-review-done">
          ¡Revisión terminada! Todo está al día.
        </p>
      );
    }
    let content = null;
    if (s.id === 'closed') {
      content = n ? renderList(review.closed, { done: true }) : null;
    } else if (s.id === 'next' && strict) {
      content = n ? renderList(review.next, { actions: ACTIONS.strictNext }) : null;
    } else if (s.id === 'someday' && strict) {
      content = n ? renderList(review.someday, { actions: ACTIONS.someday }) : null;
    } else if (s.id === 'waiting') {
      // (4.48) agrupado por persona (:PERSONA:); sin persona, al final
      const groups = new Map();
      review.waiting.forEach((t) => {
        const p = personOf(t);
        if (!groups.has(p)) groups.set(p, []);
        groups.get(p).push(t);
      });
      const keys = Array.from(groups.keys()).sort((a, b) =>
        a === null ? 1 : b === null ? -1 : a.localeCompare(b, 'es', { sensitivity: 'base' })
      );
      content = n ? (
        <React.Fragment>
          {keys.map((k) => (
            <React.Fragment key={k || '-'}>
              {sub(
                <span data-testid="gtd-review-waiting-person">
                  <i className="fas fa-user" /> {k || 'Sin persona'}
                </span>,
                groups.get(k),
                { actions: ACTIONS.waiting, id: `waiting-${k || '-'}` }
              )}
            </React.Fragment>
          ))}
        </React.Fragment>
      ) : null;
    } else if (['stalled', 'sleep', 'next'].includes(s.id)) {
      content = n ? renderList(review[s.id], { actions: ACTIONS[s.id] }) : null;
    } else if (s.id === 'projects') {
      content = renderProjects();
    } else if (s.id === 'goals') {
      content = n ? (
        <ul className="gtd-review__list">
          {review.goals.map((g) => (
            <li key={g.key} className="gtd-review__row" data-testid="gtd-review-goal">
              <span className="gtd-review__item">
                <i className="fas fa-bullseye" />
                <span className="gtd-review__item-title">{g.title}</span>
                {g.area && <span className="gtd-review__date">{g.area}</span>}
              </span>
            </li>
          ))}
        </ul>
      ) : null;
    } else if (s.id === 'past') {
      content = (
        <React.Fragment>
          {sub('Atrasadas', review.overdue, { dated: true, id: 'overdue' })}
          {sub('Desde la última revisión', review.pastDone, { dated: true, id: 'pastdone' })}
        </React.Fragment>
      );
    } else if (s.id === 'upcoming') {
      content = (
        <React.Fragment>
          {sub('Próximos 7 días', review.upcoming, { dated: true, id: 'upcoming' })}
          {sub('Más adelante', review.farther, { dated: true, id: 'farther' })}
        </React.Fragment>
      );
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
        {s.id === 'goals' && n === 0 ? (
          <p className="gtd-review__empty" data-testid="gtd-review-empty">
            {horizonsOn
              ? 'No hay objetivos apuntados en Horizontes.'
              : 'Repasa tus objetivos y resultados (puedes apuntarlos en Horizontes, en Ajustes › Secciones).'}
          </p>
        ) : NO_LIST.includes(s.id) ? null : n === 0 ? (
          <p className="gtd-review__empty" data-testid="gtd-review-empty">
            <i className="fas fa-check" /> Nada que revisar aquí.
          </p>
        ) : (
          content
        )}
        {/* (4.48) Allen cuenta las Agendas como listas de acción: las que tienen algo abierto */}
        {s.id === 'next' && agendas.length > 0 && (
          <div data-testid="gtd-review-agendas">
            <div className="gtd-review__sub">
              <i className="fas fa-comments" /> Agendas ({agendas.length})
            </div>
            <ul className="gtd-review__list">
              {agendas.map((a) => (
                <li key={a.headerId} className="gtd-review__row">
                  <button
                    type="button"
                    className="gtd-review__item"
                    onClick={() => onOpenView('agendas')}
                  >
                    <span className="gtd-review__item-title">{a.label}</span>
                    <span className="gtd-review__date">{a.open}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
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
            {!done &&
              ` · ${REVIEW_PHASES[s.phase]} · Paso ${step + 1} de ${REVIEW_STEPS_NOW.length}`}
          </div>
          <div className="gtd-review__title" data-testid="gtd-review-title">
            {done ? 'Terminada' : s.label}
            {!done && !NO_LIST.includes(s.id) && <span className="gtd-review__count">{n}</span>}
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
        {REVIEW_STEPS_NOW.map((x, i) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={i === step}
            className={
              'gtd-review__dot' +
              (i === step ? ' is-on' : '') +
              (i < step ? ' is-past' : '') +
              (i > 0 && REVIEW_STEPS_NOW[i - 1].phase !== x.phase ? ' is-phase' : '')
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
            onClick={() => (step === REVIEW_STEPS_NOW.length - 1 ? onFinish() : onStep(step + 1))}
            data-testid="gtd-review-next"
          >
            {step === REVIEW_STEPS_NOW.length - 1 ? 'Terminar' : 'Siguiente'}{' '}
            <i className="fas fa-chevron-right" />
          </button>
        )}
      </div>
    </section>
  );
}
