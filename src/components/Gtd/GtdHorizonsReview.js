// ORG Mode para Eli (4.07): «Revisión de horizontes» (Menú ☰ › Procesos › Periódicos), de abajo
// arriba: áreas (¿proyecto activo? ¿falta alguna de las usadas en las tareas?), objetivos (¿algún
// proyecto lo mueve? → «Planificar un proyecto nuevo»), visión y propósito (leer y editar).
// Tarjeta por pasos como los demás procesos (estilos gtd-review__* / gtd-guided__*). Modelo en
// lib/gtd/gtd_horizons.
import React, { useState } from 'react';
import { HORIZON_STEPS } from '../../lib/gtd/gtd_horizons';
import { projectState } from '../../lib/gtd/gtd_model';
import { LineInput } from './GtdGuidedProcess';

// Texto de la visión o del propósito (se guarda con el botón)
function TextStep({ kind, initial, onSave }) {
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const changed = text !== saved;
  return (
    <React.Fragment>
      <textarea
        className="gtd-guided__text gtd-horizons__text"
        rows={8}
        value={text}
        onChange={(e) => setText(e.target.value)}
        data-testid={`gtd-hz-text-${kind}`}
        aria-label={kind === 'vision' ? 'Visión' : 'Propósito y principios'}
      />
      <div className="gtd-review__tools">
        <button
          type="button"
          className="gtd-review__open"
          disabled={!changed}
          onClick={() => {
            onSave(kind, text);
            setSaved(text);
          }}
          data-testid={`gtd-hz-save-${kind}`}
        >
          <i className="fas fa-check" /> {changed ? 'Guardar' : 'Guardado'}
        </button>
      </div>
    </React.Fragment>
  );
}

export default function GtdHorizonsReview({
  horizons,
  data,
  missing = [],
  startStep = 0,
  fileName = '',
  today,
  onClose,
  onOpenTask,
  onAddArea,
  onAddObjective,
  onSaveText,
  onPlan,
}) {
  const [step, setStep] = useState(Math.max(0, Math.min(HORIZON_STEPS.length, startStep)));
  const [goalArea, setGoalArea] = useState('');
  const total = HORIZON_STEPS.length;
  const done = step >= total;
  const s = HORIZON_STEPS[Math.min(step, total - 1)];
  const view = data || { objectives: [], areas: [], loose: [] };

  const projectsOf = (list) =>
    list.length > 0 && (
      <ul className="gtd-horizons__projects">
        {list.map((p) => {
          const st = projectState(p, today);
          return (
            <li key={p.key}>
              <button
                type="button"
                className={'gtd-horizons__project' + (st !== 'active' ? ' is-parked' : '')}
                onClick={() => onOpenTask(p)}
                data-testid="gtd-hz-project"
              >
                <i className="fas fa-project-diagram" /> {p.title}
                {st !== 'active' && (
                  <span className="gtd-review__date">
                    {st === 'sleep' ? 'Dormido' : 'Por empezar'}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    );

  const block = (x, icon, kind, label, extra = null) => (
    <li
      key={x.key}
      className={'gtd-horizons__item' + (x.empty ? ' is-empty' : '')}
      data-testid={`gtd-hz-${kind}`}
    >
      <div className="gtd-horizons__head">
        <i className={icon} />
        <span className="gtd-horizons__name">{label}</span>
        {extra}
        {x.empty && (
          <span className="gtd-horizons__warn" data-testid="gtd-hz-empty">
            {kind === 'goal' ? 'Ningún proyecto lo mueve' : 'Sin proyecto activo'}
          </span>
        )}
      </div>
      {projectsOf(x.projects)}
      {x.empty && (
        <button
          type="button"
          className="gtd-review__open"
          onClick={() =>
            onPlan(kind === 'goal' ? { objective: x } : { area: x.name }, kind === 'goal' ? 1 : 0)
          }
          data-testid={`gtd-hz-plan-${kind}`}
        >
          <i className="fas fa-drafting-compass" /> Planificar un proyecto
        </button>
      )}
    </li>
  );

  const renderAreas = () => (
    <React.Fragment>
      <p className="gtd-review__hint">{s.hint}</p>
      {view.areas.length === 0 ? (
        <p className="gtd-review__empty" data-testid="gtd-guided-empty">
          <i className="fas fa-map-signs" /> No hay áreas en {fileName}.
        </p>
      ) : (
        <ul className="gtd-review__list">
          {view.areas.map((a) => block(a, 'fas fa-map-signs', 'area', a.name))}
        </ul>
      )}
      {missing.length > 0 && (
        <React.Fragment>
          <div className="gtd-review__sub">Usadas en tareas, pero no están en {fileName}</div>
          <div className="gtd-daily__chips">
            {missing.map((a) => (
              <button
                key={a}
                type="button"
                className="gtd-daily__chip"
                onClick={() => onAddArea(a)}
                title="Añadirla a las áreas"
                data-testid="gtd-hz-add-missing"
              >
                <i className="fas fa-plus" /> {a}
              </button>
            ))}
          </div>
        </React.Fragment>
      )}
      <LineInput
        placeholder="Área nueva…"
        button="Añadir"
        icon="fas fa-plus"
        testId="gtd-hz-area"
        onSubmit={(t) => onAddArea(t)}
      />
    </React.Fragment>
  );

  const renderGoals = () => (
    <React.Fragment>
      <p className="gtd-review__hint">{s.hint}</p>
      {view.objectives.length === 0 ? (
        <p className="gtd-review__empty" data-testid="gtd-guided-empty">
          <i className="fas fa-bullseye" /> No hay objetivos. Apunta el primero.
        </p>
      ) : (
        <ul className="gtd-review__list">
          {view.objectives.map((o) =>
            block(
              o,
              'fas fa-bullseye',
              'goal',
              o.title,
              o.area && <span className="gtd-meta gtd-meta--area">{o.area}</span>
            )
          )}
        </ul>
      )}
      <LineInput
        placeholder="Objetivo nuevo…"
        button="Añadir"
        icon="fas fa-plus"
        testId="gtd-hz-goal"
        onSubmit={(t) => onAddObjective(t, goalArea)}
      />
      {horizons.areaList.length > 0 && (
        <label className="gtd-horizons__area">
          <span>Área del objetivo nuevo</span>
          <select
            value={goalArea}
            onChange={(e) => setGoalArea(e.target.value)}
            data-testid="gtd-hz-goal-area"
          >
            <option value="">(ninguna)</option>
            {horizons.areaList.map((a) => (
              <option key={a.key} value={a.name}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </React.Fragment>
  );

  const body = () => {
    if (done)
      return (
        <p className="gtd-review__hint" data-testid="gtd-guided-done">
          ¡Hecho! Lo que hagas cada día ya apunta a algún sitio.
        </p>
      );
    if (s.id === 'areas') return renderAreas();
    if (s.id === 'goals') return renderGoals();
    const sec = horizons[s.id];
    return (
      <React.Fragment>
        <p className="gtd-review__hint">{s.hint}</p>
        <TextStep
          key={s.id}
          kind={s.id}
          initial={sec ? sec.description || '' : ''}
          onSave={onSaveText}
        />
      </React.Fragment>
    );
  };

  const lastStep = step === total - 1;
  return (
    <section
      className="gtd-review gtd-daily gtd-guided gtd-horizons-review"
      data-testid="gtd-guided"
      aria-label="Revisión de horizontes"
    >
      <div className="gtd-review__head">
        <i className="fas fa-binoculars gtd-review__icon" />
        <div className="gtd-review__titles">
          <div className="gtd-review__kicker" data-testid="gtd-guided-kicker">
            Revisión de horizontes{!done && ` · Paso ${step + 1} de ${total}`}
          </div>
          <div className="gtd-review__title" data-testid="gtd-guided-title">
            {done ? 'Terminado' : s.label}
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
      <div className="gtd-review__steps" role="tablist">
        {HORIZON_STEPS.map((x, i) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={i === step}
            className={
              'gtd-review__dot' + (i === step ? ' is-on' : '') + (i < step ? ' is-past' : '')
            }
            title={x.label}
            onClick={() => setStep(i)}
            data-testid={`gtd-guided-dot-${x.id}`}
          >
            <i className={x.icon} />
          </button>
        ))}
      </div>
      <div className="gtd-review__body">{body()}</div>
      <div className="gtd-review__nav">
        {!done && (
          <button
            type="button"
            className="gtd-review__btn"
            disabled={step === 0}
            onClick={() => setStep(step - 1)}
            data-testid="gtd-guided-prev"
          >
            <i className="fas fa-chevron-left" /> Anterior
          </button>
        )}
        {done ? (
          <button
            type="button"
            className="gtd-review__btn is-primary"
            onClick={onClose}
            data-testid="gtd-guided-finish"
          >
            Cerrar
          </button>
        ) : (
          <button
            type="button"
            className="gtd-review__btn is-primary"
            onClick={() => setStep(step + 1)}
            data-testid="gtd-guided-next"
          >
            {lastStep ? 'Terminar' : 'Siguiente'} <i className="fas fa-chevron-right" />
          </button>
        )}
      </div>
    </section>
  );
}
