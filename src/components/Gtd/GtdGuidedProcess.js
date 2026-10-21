// ORG Mode para Eli (4.06): procesos guiados puntuales y periódicos de GTD (Menú ☰ › Procesos):
// «Volcado mental», «Planificar un proyecto nuevo», «Aclarar un proyecto atascado», «Repaso de
// Waiting» y «Repaso de Someday/Maybe». Tarjeta por pasos encima de la lista, como la Revisión
// semanal y los procesos diarios (usa sus estilos). Modelo en lib/gtd/gtd_guided.
import React, { useState } from 'react';
import {
  GUIDED_PROCESSES,
  stuckProjects,
  waitingByPerson,
  somedayReview,
  personOf,
  projectPlan,
  moveItem,
} from '../../lib/gtd/gtd_guided';

// Campo de una línea con botón (Intro = el botón)
function LineInput({ placeholder, button, icon, onSubmit, testId, autoFocus }) {
  const [v, setV] = useState('');
  const go = () => {
    const t = v.trim();
    if (!t) return;
    if (onSubmit(t) !== false) setV('');
  };
  return (
    <div className="gtd-guided__line">
      <input
        type="text"
        value={v}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            go();
          }
        }}
        data-testid={`${testId}-input`}
        aria-label={placeholder}
      />
      <button
        type="button"
        className="gtd-review__btn is-primary"
        onClick={go}
        disabled={!v.trim()}
        data-testid={`${testId}-add`}
      >
        {icon && <i className={icon} />} {button}
      </button>
    </div>
  );
}

export default function GtdGuidedProcess({
  kind,
  tasks,
  today,
  skipTags = [],
  onClose,
  onOpenTask,
  onCapture,
  onCreateProject,
  onProjectAction,
  onMove,
  onCopy,
}) {
  const proc = GUIDED_PROCESSES[kind];
  const [step, setStep] = useState(0);
  // Volcado mental: lo apuntado (en esta sesión)
  const [captured, setCaptured] = useState([]);
  // Planificar un proyecto
  const [plan, setPlan] = useState({ name: '', purpose: '', outcome: '', ideas: [], first: '' });
  // Aclarar un proyecto atascado: los que había al empezar (se recorren uno a uno)
  const [queue] = useState(() =>
    kind === 'stuck' ? stuckProjects(tasks, today).map((x) => x.project.key) : []
  );
  const [nextFor, setNextFor] = useState(false);
  const [busy, setBusy] = useState(false);
  // Repasos: abierto «Reclamar», reclamadas y las que «se quedan»
  const [chaseFor, setChaseFor] = useState(null);
  const [chased, setChased] = useState({});
  const [kept, setKept] = useState({});

  const steps = proc.steps;
  const multi = steps.length > 1 || kind === 'stuck';
  const total = kind === 'stuck' ? queue.length : steps.length;
  const done = multi && step >= total;
  const s = steps.length ? steps[Math.min(step, steps.length - 1)] : null;
  const go = (i) => {
    setNextFor(false);
    setStep(Math.max(0, Math.min(total, i)));
  };

  // ---- Volcado mental
  const renderSweep = () => {
    const here = captured.filter((c) => c.step === step);
    return (
      <React.Fragment>
        <p className="gtd-review__hint">{s.hint} ¿Hay algo? Apúntalo (una cosa cada vez).</p>
        <LineInput
          key={step}
          placeholder="Apuntar al Inbox…"
          button="Apuntar"
          icon="fas fa-inbox"
          testId="gtd-sweep"
          onSubmit={(t) => {
            if (onCapture(t) === false) return false;
            setCaptured((c) => [...c, { step, title: t }]);
            return true;
          }}
        />
        {here.length > 0 && (
          <ul className="gtd-review__list" data-testid="gtd-sweep-captured">
            {here.map((c, i) => (
              <li key={i} className="gtd-guided__captured">
                <i className="fas fa-check" /> {c.title}
              </li>
            ))}
          </ul>
        )}
        <p className="gtd-guided__total" data-testid="gtd-sweep-total">
          <i className="fas fa-inbox" /> Apuntadas en total: {captured.length}
        </p>
      </React.Fragment>
    );
  };

  // ---- Planificar un proyecto nuevo
  const setP = (k, v) => setPlan((p) => ({ ...p, [k]: v }));
  const textArea = (k, placeholder) => (
    <textarea
      className="gtd-guided__text"
      rows={3}
      value={plan[k]}
      placeholder={placeholder}
      onChange={(e) => setP(k, e.target.value)}
      data-testid={`gtd-plan-${k}`}
      aria-label={placeholder}
    />
  );
  const renderPlan = () => {
    if (s.id === 'purpose')
      return (
        <React.Fragment>
          <p className="gtd-review__hint">{s.hint}</p>
          <input
            type="text"
            className="gtd-guided__name"
            value={plan.name}
            placeholder="Nombre del proyecto"
            onChange={(e) => setP('name', e.target.value)}
            data-testid="gtd-plan-name"
            aria-label="Nombre del proyecto"
          />
          {textArea('purpose', 'Propósito: ¿por qué?')}
        </React.Fragment>
      );
    if (s.id === 'outcome')
      return (
        <React.Fragment>
          <p className="gtd-review__hint">{s.hint}</p>
          {textArea('outcome', 'Resultado: ¿cómo será cuando esté hecho?')}
        </React.Fragment>
      );
    if (s.id === 'ideas')
      return (
        <React.Fragment>
          <p className="gtd-review__hint">{s.hint}</p>
          <LineInput
            placeholder="Una idea…"
            button="Añadir"
            icon="fas fa-plus"
            testId="gtd-plan-idea"
            onSubmit={(t) => setP('ideas', [...plan.ideas, t])}
          />
          {plan.ideas.length > 0 && (
            <ul className="gtd-review__list">
              {plan.ideas.map((x, i) => (
                <li key={i} className="gtd-guided__captured" data-testid="gtd-plan-idea">
                  <i className="far fa-lightbulb" /> {x}
                </li>
              ))}
            </ul>
          )}
        </React.Fragment>
      );
    if (s.id === 'order')
      return (
        <React.Fragment>
          <p className="gtd-review__hint">{s.hint}</p>
          {plan.ideas.length === 0 ? (
            <p className="gtd-review__empty" data-testid="gtd-guided-empty">
              <i className="far fa-lightbulb" /> No hay ideas (puedes seguir).
            </p>
          ) : (
            <ul className="gtd-review__list">
              {plan.ideas.map((x, i) => (
                <li key={i} className="gtd-review__row-wrap">
                  <div className="gtd-review__row" data-testid="gtd-plan-row">
                    <span className="gtd-review__item">
                      <span className="gtd-guided__n">{i + 1}</span>
                      <span className="gtd-review__item-title">{x}</span>
                    </span>
                    {[
                      ['up', 'fas fa-arrow-up', 'Subir', () => moveItem(plan.ideas, i, -1)],
                      ['down', 'fas fa-arrow-down', 'Bajar', () => moveItem(plan.ideas, i, 1)],
                      [
                        'remove',
                        'fas fa-times',
                        'Quitar',
                        () => plan.ideas.filter((_y, j) => j !== i),
                      ],
                    ].map(([k, icon, label, f]) => (
                      <button
                        key={k}
                        type="button"
                        className={'gtd-review__act gtd-review__act--' + k}
                        onClick={() => setP('ideas', f())}
                        title={label}
                        aria-label={`${label}: ${x}`}
                        data-testid={`gtd-plan-${k}`}
                      >
                        <i className={icon} />
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </React.Fragment>
      );
    // Primera acción
    const fromIdeas = plan.ideas.includes(plan.first);
    return (
      <React.Fragment>
        <p className="gtd-review__hint">{s.hint}</p>
        {plan.ideas.length > 0 && (
          <div className="gtd-daily__chips">
            {plan.ideas.map((x, i) => (
              <button
                key={i}
                type="button"
                className={'gtd-daily__chip' + (plan.first === x ? ' is-on' : '')}
                aria-pressed={plan.first === x}
                onClick={() => setP('first', x)}
                data-testid={`gtd-plan-first-${i}`}
              >
                {x}
              </button>
            ))}
          </div>
        )}
        <input
          type="text"
          className="gtd-guided__name"
          value={fromIdeas ? '' : plan.first}
          placeholder={plan.ideas.length ? 'U otra acción…' : 'Primera acción…'}
          onChange={(e) => setP('first', e.target.value)}
          data-testid="gtd-plan-first"
          aria-label="Primera acción"
        />
        {!plan.name.trim() && (
          <p className="gtd-guided__warn" data-testid="gtd-plan-noname">
            <i className="fas fa-exclamation-triangle" /> Falta el nombre del proyecto (paso 1).
          </p>
        )}
      </React.Fragment>
    );
  };
  const canCreate = !!plan.name.trim() && !!plan.first.trim();
  const createProject = () => {
    if (!canCreate) return;
    onCreateProject(plan.name.trim(), projectPlan(plan));
    onClose();
  };

  // ---- Aclarar un proyecto atascado
  const renderStuck = () => {
    const live = stuckProjects(tasks, today);
    const key = queue[step];
    const cur = live.find((x) => x.project.key === key);
    if (!cur) {
      return (
        <p className="gtd-review__empty" data-testid="gtd-guided-empty">
          <i className="fas fa-check" /> Este ya está en marcha.
        </p>
      );
    }
    const p = cur.project;
    const sleeping = cur.why === 'sleep';
    const after = (r) => Promise.resolve(r).then((ok) => ok !== false && go(step + 1));
    const act = (k, text) => {
      if (busy) return;
      setBusy(true);
      after(onProjectAction(p, k, text)).finally(() => setBusy(false));
    };
    return (
      <React.Fragment>
        <button
          type="button"
          className="gtd-review__item gtd-guided__project"
          onClick={() => onOpenTask(p)}
          data-testid="gtd-stuck-project"
        >
          <i className="fas fa-folder" />
          <span className="gtd-review__item-title">{p.title}</span>
          <span className="gtd-review__date">{sleeping ? 'Dormido' : 'Sin acción en Next'}</span>
        </button>
        <p className="gtd-review__hint">¿Sigue vivo?</p>
        <div className="gtd-review__tools">
          <button
            type="button"
            className={'gtd-review__open' + (nextFor ? ' is-on' : '')}
            onClick={() => setNextFor(!nextFor)}
            data-testid="gtd-stuck-alive"
          >
            <i className="fas fa-play" /> Sí: siguiente paso
          </button>
          {sleeping ? (
            <button
              type="button"
              className="gtd-review__open"
              onClick={() => go(step + 1)}
              data-testid="gtd-stuck-keep"
            >
              <i className="fas fa-bed" /> Que siga dormido
            </button>
          ) : (
            <button
              type="button"
              className="gtd-review__open"
              onClick={() => act('sleep')}
              data-testid="gtd-stuck-sleep"
            >
              <i className="fas fa-cloud" /> Someday (dormir)
            </button>
          )}
          <button
            type="button"
            className="gtd-review__open"
            onClick={() => act('close')}
            data-testid="gtd-stuck-close"
          >
            <i className="fas fa-check" /> Cerrar
          </button>
        </div>
        {nextFor && (
          <LineInput
            placeholder="Siguiente acción…"
            button="Añadir"
            icon="fas fa-plus"
            testId="gtd-stuck-next"
            autoFocus
            onSubmit={(t) => {
              act('next', t);
              return true;
            }}
          />
        )}
        {sleeping && nextFor && (
          <p className="gtd-guided__total">
            <i className="fas fa-sun" /> Al añadirla, el proyecto se despierta.
          </p>
        )}
      </React.Fragment>
    );
  };

  // ---- Filas de los repasos
  const row = (t, actions, extra = null) => (
    <li key={t.key} className="gtd-review__row-wrap">
      <div className="gtd-review__row">
        <button
          type="button"
          className="gtd-review__item"
          onClick={() => onOpenTask(t)}
          data-testid="gtd-guided-item"
        >
          <i
            className={
              t.isProject ? 'fas fa-folder' : chased[t.key] ? 'fas fa-check' : 'far fa-circle'
            }
          />
          <span className="gtd-review__item-title">{t.title || '(sin título)'}</span>
        </button>
        {actions.map(([k, icon, label, f, on]) => (
          <button
            key={k}
            type="button"
            className={'gtd-review__act gtd-review__act--' + k + (on ? ' is-on' : '')}
            onClick={f}
            title={label}
            aria-label={`${label}: ${t.title || ''}`}
            data-testid={`gtd-guided-act-${k}`}
          >
            <i className={icon} />
          </button>
        ))}
      </div>
      {extra}
    </li>
  );

  const renderWaiting = () => {
    const groups = waitingByPerson(tasks, today, skipTags);
    if (!groups.length)
      return (
        <p className="gtd-review__empty" data-testid="gtd-guided-empty">
          <i className="fas fa-check" /> No esperas nada.
        </p>
      );
    return groups.map(({ person, items }) => (
      <React.Fragment key={person || '-'}>
        <div className="gtd-review__sub" data-testid="gtd-waiting-person">
          <i className="fas fa-user" /> {person || 'Sin persona'} ({items.length})
        </div>
        <ul className="gtd-review__list">
          {items.map((t) =>
            row(
              t,
              [
                ['done', 'fas fa-check', 'Recibida', () => onMove(t, 'done')],
                [
                  'chase',
                  'fas fa-paper-plane',
                  'Reclamar',
                  () => setChaseFor(chaseFor === t.key ? null : t.key),
                  chaseFor === t.key,
                ],
              ],
              chaseFor === t.key && (
                <div className="gtd-daily__date">
                  <button
                    type="button"
                    className="gtd-review__open"
                    onClick={() => {
                      onMove(t, 'chase', personOf(t, skipTags));
                      setChased((c) => ({ ...c, [t.key]: true }));
                      setChaseFor(null);
                    }}
                    data-testid="gtd-chase-task"
                  >
                    <i className="fas fa-plus" /> Tarea en Next
                  </button>
                  <button
                    type="button"
                    className="gtd-review__open"
                    onClick={() => {
                      onCopy(t, personOf(t, skipTags));
                      setChased((c) => ({ ...c, [t.key]: true }));
                      setChaseFor(null);
                    }}
                    data-testid="gtd-chase-copy"
                  >
                    <i className="far fa-copy" /> Copiar mensaje
                  </button>
                </div>
              )
            )
          )}
        </ul>
      </React.Fragment>
    ));
  };

  const renderSomeday = () => {
    const { items, projects } = somedayReview(tasks, today);
    const its = items.filter((t) => !kept[t.key]);
    const prs = projects.filter((t) => !kept[t.key]);
    const keep = (t) => setKept((k) => ({ ...k, [t.key]: true }));
    if (!its.length && !prs.length)
      return (
        <p className="gtd-review__empty" data-testid="gtd-guided-empty">
          <i className="fas fa-check" /> Nada que repasar.
        </p>
      );
    return (
      <React.Fragment>
        {its.length > 0 && (
          <React.Fragment>
            <div className="gtd-review__sub">Someday ({its.length})</div>
            <ul className="gtd-review__list">
              {its.map((t) =>
                row(t, [
                  ['next', 'fas fa-play', 'Activar (→ Next)', () => onMove(t, 'next')],
                  ['keep', 'fas fa-thumbtack', 'Se queda', () => keep(t)],
                  ['trash', 'fas fa-trash-alt', 'A la Papelera', () => onMove(t, 'trash')],
                ])
              )}
            </ul>
          </React.Fragment>
        )}
        {prs.length > 0 && (
          <React.Fragment>
            <div className="gtd-review__sub">Proyectos dormidos ({prs.length})</div>
            <ul className="gtd-review__list">
              {prs.map((t) =>
                row(t, [
                  ['wake', 'fas fa-sun', 'Activar (despertar)', () => onMove(t, 'wake')],
                  ['keep', 'fas fa-thumbtack', 'Se queda', () => keep(t)],
                ])
              )}
            </ul>
          </React.Fragment>
        )}
      </React.Fragment>
    );
  };

  const body = () => {
    if (kind === 'stuck' && !queue.length)
      return (
        <p className="gtd-review__empty" data-testid="gtd-guided-empty">
          <i className="fas fa-check" /> No hay proyectos atascados.
        </p>
      );
    if (done)
      return (
        <p className="gtd-review__hint" data-testid="gtd-guided-done">
          {kind === 'sweep'
            ? `¡Cabeza vacía! Has apuntado ${captured.length} al Inbox. Procésalas cuando puedas.`
            : '¡Hecho!'}
        </p>
      );
    if (kind === 'sweep') return renderSweep();
    if (kind === 'project') return renderPlan();
    if (kind === 'stuck') return renderStuck();
    if (kind === 'waiting') return renderWaiting();
    return renderSomeday();
  };

  let title = done ? 'Terminado' : s ? s.label : proc.label;
  if (kind === 'stuck')
    title = done || !queue.length ? 'Terminado' : `Proyecto ${step + 1} de ${total}`;
  if (kind === 'waiting') title = 'Por persona';
  if (kind === 'someday') title = '¿Activar, dejar o borrar?';
  const kicker =
    proc.label +
    (multi && !done && kind !== 'stuck' && total ? ` · Paso ${step + 1} de ${total}` : '');
  const lastStep = step === total - 1;
  const atEnd = !multi || done || (kind === 'stuck' && !queue.length);

  return (
    <section
      className="gtd-review gtd-daily gtd-guided"
      data-testid="gtd-guided"
      aria-label={proc.label}
    >
      <div className="gtd-review__head">
        <i className={proc.icon + ' gtd-review__icon'} />
        <div className="gtd-review__titles">
          <div className="gtd-review__kicker" data-testid="gtd-guided-kicker">
            {kicker}
            {kind === 'sweep' && !done && ` · ${s.group}`}
          </div>
          <div className="gtd-review__title" data-testid="gtd-guided-title">
            {title}
          </div>
        </div>
        <button
          type="button"
          className="gtd-review__close"
          onClick={onClose}
          title="Cerrar"
          aria-label="Cerrar"
          data-testid="gtd-guided-close"
        >
          <i className="fas fa-times" />
        </button>
      </div>
      {kind === 'project' && (
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
              onClick={() => go(i)}
              data-testid={`gtd-guided-dot-${x.id}`}
            >
              <i className={x.icon} />
            </button>
          ))}
        </div>
      )}
      {kind === 'sweep' && !done && (
        <div className="gtd-guided__progress" aria-hidden="true">
          <div style={{ width: `${Math.round(((step + 1) / total) * 100)}%` }} />
        </div>
      )}
      <div className="gtd-review__body">{body()}</div>
      <div className="gtd-review__nav">
        {multi && !atEnd && (
          <button
            type="button"
            className="gtd-review__btn"
            disabled={step === 0}
            onClick={() => go(step - 1)}
            data-testid="gtd-guided-prev"
          >
            <i className="fas fa-chevron-left" /> Anterior
          </button>
        )}
        {atEnd ? (
          <button
            type="button"
            className="gtd-review__btn is-primary"
            onClick={onClose}
            data-testid="gtd-guided-finish"
          >
            Cerrar
          </button>
        ) : kind === 'project' && lastStep ? (
          <button
            type="button"
            className="gtd-review__btn is-primary"
            disabled={!canCreate}
            onClick={createProject}
            data-testid="gtd-plan-create"
          >
            <i className="fas fa-check" /> Crear proyecto
          </button>
        ) : (
          <button
            type="button"
            className="gtd-review__btn is-primary"
            onClick={() => go(step + 1)}
            data-testid="gtd-guided-next"
          >
            {kind === 'stuck'
              ? lastStep
                ? 'Terminar'
                : 'Saltar'
              : lastStep
              ? 'Terminar'
              : 'Siguiente'}{' '}
            <i className="fas fa-chevron-right" />
          </button>
        )}
      </div>
    </section>
  );
}
