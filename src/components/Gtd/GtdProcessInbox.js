// ORG Mode para Eli (3.40): «Procesar Inbox» (estilo FacileThings). Tarjeta encima de la lista,
// como la revisión semanal: una tarea del Inbox cada vez, con Saltar / Atrás / Terminar y «n de N».
// Dos pantallas (Ajustes → Apariencia): una a una (preguntas con botones grandes y atajos 1, 2, 3…)
// o todo junto (grupos «No requiere acción» / «Requiere acción» / «¿Cuándo?»).
// La decisión se entrega a `onDecide(d)`: d.kind = trash | reference | someday | tickler | done |
// waiting | project | next | later, con los datos que haga falta (fechas, persona, área, etiquetas…).
import React, { useEffect, useRef, useState } from 'react';
import { toDateInput, fromDateInput } from './TaskEditor';
import { parseTagsInput, personTag } from '../../lib/gtd/gtd_process';

const tomorrow = (today) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

const QUESTIONS = {
  action: '¿Requiere acción?',
  noaction: '¿Qué hago con ella?',
  tickler: '¿Cuándo quieres que te lo recuerde?',
  two: '¿Se hace en menos de 2 minutos?',
  who: '¿La tiene que hacer otra persona?',
  person: '¿Quién? (pasa a Waiting)',
  steps: '¿Necesita varios pasos?',
  project: 'Proyecto: ¿cuál es la primera acción?',
  week: '¿La harás esta semana?',
  when: '¿Cuándo?',
};

export default function GtdProcessInbox({
  task,
  gone,
  index,
  total,
  mode,
  areas,
  today,
  paused,
  onDecide,
  onSkip,
  onBack,
  onFinish,
  onOpenTask,
}) {
  const [step, setStep] = useState('action');
  const [hist, setHist] = useState([]);
  const [base, setBase] = useState(null);
  const [tickDate, setTickDate] = useState(toDateInput(tomorrow(today)));
  const [tickTime, setTickTime] = useState('');
  const [person, setPerson] = useState('');
  const [first, setFirst] = useState('');
  const [area, setArea] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [sched, setSched] = useState('');
  const [schedTime, setSchedTime] = useState('');
  const [deadline, setDeadline] = useState('');
  const optionsRef = useRef([]);
  const rootRef = useRef(null);

  const go = (s) => {
    setHist((h) => [...h, step]);
    setStep(s);
  };
  const stepBack = () => {
    if (hist.length) {
      setStep(hist[hist.length - 1]);
      setHist((h) => h.slice(0, -1));
    } else onBack();
  };
  const details = () => ({
    area: area || undefined,
    tags: parseTagsInput(tagsText),
    scheduled: fromDateInput(sched),
    scheduledTime: sched ? schedTime : '',
    deadline: fromDateInput(deadline),
  });
  const decide = (d) => onDecide(d);
  const tickler = () => {
    const date = fromDateInput(tickDate);
    if (!date) return;
    decide({ kind: 'tickler', date, time: tickTime, tags: parseTagsInput(tagsText) });
  };
  const withWhen = (b) => {
    setBase(b);
    go('when');
  };

  // Opciones de la pregunta en curso: [{ label, hint, icon, run, primary }]
  let options = [];
  let fields = null;
  if (mode !== 'all' && task) {
    if (step === 'action') {
      options = [
        { label: 'Sí', hint: 'hay algo que hacer', icon: 'fas fa-check', run: () => go('two') },
        {
          label: 'No',
          hint: 'tirar, guardar o incubar',
          icon: 'fas fa-times',
          run: () => go('noaction'),
        },
      ];
    } else if (step === 'noaction') {
      options = [
        { label: 'Papelera', icon: 'fas fa-trash', run: () => decide({ kind: 'trash' }) },
        { label: 'Referencia', icon: 'far fa-file-alt', run: () => decide({ kind: 'reference' }) },
        {
          label: 'Someday / Maybe',
          hint: 'incubar',
          icon: 'fas fa-cloud',
          run: () => decide({ kind: 'someday' }),
        },
        {
          label: 'Tickler',
          hint: 'recordármelo un día',
          icon: 'far fa-bell',
          run: () => go('tickler'),
        },
      ];
    } else if (step === 'tickler') {
      fields = renderTickler();
      options = [
        { label: 'Guardar en el Tickler', icon: 'far fa-bell', primary: true, run: tickler },
      ];
    } else if (step === 'two') {
      options = [
        {
          label: 'Sí: hecha ya',
          hint: 'hazla ahora y márcala',
          icon: 'fas fa-check-double',
          run: () => decide({ kind: 'done' }),
        },
        { label: 'No', icon: 'fas fa-arrow-right', run: () => go('who') },
      ];
    } else if (step === 'who') {
      options = [
        {
          label: 'Sí: delegar',
          hint: 'Waiting',
          icon: 'fas fa-hourglass-half',
          run: () => go('person'),
        },
        { label: 'No, la hago yo', icon: 'fas fa-user', run: () => go('steps') },
      ];
    } else if (step === 'person') {
      fields = (
        <input
          className="gtd-proc__input"
          value={person}
          onChange={(e) => setPerson(e.target.value)}
          placeholder="Persona (opcional)"
          data-testid="gtd-proc-person"
          autoFocus
          onKeyDown={(e) =>
            e.key === 'Enter' && withWhen({ kind: 'waiting', person: personTag(person) })
          }
        />
      );
      options = [
        {
          label: 'Continuar',
          icon: 'fas fa-arrow-right',
          primary: true,
          run: () => withWhen({ kind: 'waiting', person: personTag(person) }),
        },
      ];
    } else if (step === 'steps') {
      options = [
        { label: 'Sí: proyecto', icon: 'fas fa-project-diagram', run: () => go('project') },
        { label: 'No', icon: 'fas fa-arrow-right', run: () => go('week') },
      ];
    } else if (step === 'project') {
      fields = (
        <input
          className="gtd-proc__input"
          value={first}
          onChange={(e) => setFirst(e.target.value)}
          placeholder="Primera acción (Next)"
          data-testid="gtd-proc-first"
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && withWhen({ kind: 'project', first: first.trim() })}
        />
      );
      options = [
        {
          label: 'Continuar',
          icon: 'fas fa-arrow-right',
          primary: true,
          run: () => withWhen({ kind: 'project', first: first.trim() }),
        },
      ];
    } else if (step === 'week') {
      options = [
        { label: 'Sí: Next', icon: 'fas fa-play', run: () => withWhen({ kind: 'next' }) },
        {
          label: 'Más adelante',
          hint: 'Todo, no esta semana',
          icon: 'fas fa-forward',
          run: () => withWhen({ kind: 'later' }),
        },
      ];
    } else if (step === 'when') {
      fields = (
        <React.Fragment>
          {renderWhen()}
          {renderAreaTags()}
        </React.Fragment>
      );
      options = [
        {
          label: sched || deadline ? 'Guardar' : 'Guardar sin fecha',
          icon: 'fas fa-check',
          primary: true,
          run: () => decide({ ...base, ...details() }),
        },
      ];
    }
  }
  if (mode === 'all' && task) {
    options = [
      { label: 'Papelera', icon: 'fas fa-trash', run: () => decide({ kind: 'trash' }) },
      { label: 'Referencia', icon: 'far fa-file-alt', run: () => decide({ kind: 'reference' }) },
      { label: 'Someday', icon: 'fas fa-cloud', run: () => decide({ kind: 'someday' }) },
      { label: 'Hecha ya', icon: 'fas fa-check-double', run: () => decide({ kind: 'done' }) },
      { label: 'Next', icon: 'fas fa-play', run: () => decide({ kind: 'next', ...details() }) },
      {
        label: 'Más adelante',
        icon: 'fas fa-forward',
        run: () => decide({ kind: 'later', ...details() }),
      },
    ];
  }
  optionsRef.current = options;

  // Atajos 1, 2, 3… (fuera de los campos de texto)
  useEffect(() => {
    const onKey = (e) => {
      if (paused || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (!/^[1-9]$/.test(e.key)) return;
      const o = optionsRef.current[Number(e.key) - 1];
      if (!o) return;
      e.preventDefault();
      e.stopPropagation();
      o.run();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [paused]);

  function renderTickler() {
    return (
      <div className="gtd-proc__row">
        <input
          type="date"
          className="gtd-proc__input"
          value={tickDate}
          onChange={(e) => setTickDate(e.target.value)}
          data-testid="gtd-proc-tickler-date"
        />
        <input
          type="time"
          className="gtd-proc__input gtd-proc__input--time"
          value={tickTime}
          onChange={(e) => setTickTime(e.target.value)}
          data-testid="gtd-proc-tickler-time"
          aria-label="Hora (opcional)"
        />
      </div>
    );
  }
  function renderWhen() {
    return (
      <div className="gtd-proc__when">
        <label className="gtd-proc__label">
          <span>
            <i className="far fa-calendar-alt" /> Programada
          </span>
          <span className="gtd-proc__row">
            <input
              type="date"
              className="gtd-proc__input"
              value={sched}
              onChange={(e) => setSched(e.target.value)}
              data-testid="gtd-proc-scheduled"
            />
            {sched && (
              <input
                type="time"
                className="gtd-proc__input gtd-proc__input--time"
                value={schedTime}
                onChange={(e) => setSchedTime(e.target.value)}
                data-testid="gtd-proc-scheduled-time"
                aria-label="Hora (opcional)"
              />
            )}
          </span>
        </label>
        <label className="gtd-proc__label">
          <span>
            <i className="fas fa-flag" /> Vence
          </span>
          <input
            type="date"
            className="gtd-proc__input"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            data-testid="gtd-proc-deadline"
          />
        </label>
      </div>
    );
  }
  function renderAreaTags() {
    return (
      <div className="gtd-proc__row gtd-proc__row--wrap">
        {areas.length > 0 && (
          <select
            className="gtd-proc__input"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            data-testid="gtd-proc-area"
            aria-label="Área"
          >
            <option value="">Área (la que tenga)</option>
            {areas.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        )}
        <input
          className="gtd-proc__input gtd-proc__input--grow"
          value={tagsText}
          onChange={(e) => setTagsText(e.target.value)}
          placeholder="Etiquetas (contextos…)"
          data-testid="gtd-proc-tags"
        />
      </div>
    );
  }

  const renderOptions = (list, offset = 0, big = true) => (
    <div className={'gtd-proc__options' + (big ? ' is-big' : '')}>
      {list.map((o, i) => (
        <button
          key={o.label}
          type="button"
          className={'gtd-proc__opt' + (o.primary ? ' is-primary' : '')}
          onClick={o.run}
          data-testid="gtd-proc-opt"
        >
          <span className="gtd-proc__key">{i + 1 + offset}</span>
          <i className={o.icon} />
          <span className="gtd-proc__opt-label">{o.label}</span>
          {o.hint && <span className="gtd-proc__opt-hint">{o.hint}</span>}
        </button>
      ))}
    </div>
  );

  const renderAll = () => {
    const opt = options;
    return (
      <div className="gtd-proc__all">
        <div className="gtd-proc__group">
          <div className="gtd-proc__group-title">No requiere acción</div>
          {renderOptions(opt.slice(0, 3), 0, false)}
          <div className="gtd-proc__row gtd-proc__row--wrap">
            {renderTickler()}
            <button
              type="button"
              className="gtd-proc__opt"
              onClick={tickler}
              data-testid="gtd-proc-tickler"
            >
              <i className="far fa-bell" /> <span className="gtd-proc__opt-label">Tickler</span>
            </button>
          </div>
        </div>
        <div className="gtd-proc__group">
          <div className="gtd-proc__group-title">Requiere acción</div>
          {renderOptions(opt.slice(3), 3, false)}
          <div className="gtd-proc__row gtd-proc__row--wrap">
            <input
              className="gtd-proc__input gtd-proc__input--grow"
              value={person}
              onChange={(e) => setPerson(e.target.value)}
              placeholder="Persona"
              data-testid="gtd-proc-person"
            />
            <button
              type="button"
              className="gtd-proc__opt"
              onClick={() => decide({ kind: 'waiting', person: personTag(person), ...details() })}
              data-testid="gtd-proc-waiting"
            >
              <i className="fas fa-hourglass-half" />{' '}
              <span className="gtd-proc__opt-label">Waiting</span>
            </button>
          </div>
          <div className="gtd-proc__row gtd-proc__row--wrap">
            <input
              className="gtd-proc__input gtd-proc__input--grow"
              value={first}
              onChange={(e) => setFirst(e.target.value)}
              placeholder="Primera acción del proyecto"
              data-testid="gtd-proc-first"
            />
            <button
              type="button"
              className="gtd-proc__opt"
              onClick={() => decide({ kind: 'project', first: first.trim(), ...details() })}
              data-testid="gtd-proc-project"
            >
              <i className="fas fa-project-diagram" />{' '}
              <span className="gtd-proc__opt-label">Proyecto</span>
            </button>
          </div>
          {renderAreaTags()}
        </div>
        <div className="gtd-proc__group">
          <div className="gtd-proc__group-title">
            ¿Cuándo? (Next, Más adelante, Waiting, Proyecto)
          </div>
          {renderWhen()}
        </div>
      </div>
    );
  };

  return (
    <section
      className="gtd-review gtd-proc"
      data-testid="gtd-process"
      aria-label="Procesar Inbox"
      ref={rootRef}
    >
      <div className="gtd-review__head">
        <i className="fas fa-inbox gtd-review__icon gtd-proc__icon" />
        <div className="gtd-review__titles">
          <div className="gtd-review__kicker" data-testid="gtd-process-count">
            Procesar Inbox{total ? ` · ${Math.min(index + 1, total)} de ${total}` : ''}
          </div>
          {task ? (
            <button
              type="button"
              className="gtd-proc__title"
              onClick={() => onOpenTask(task)}
              title="Abrir la tarea"
              data-testid="gtd-process-title"
            >
              {task.title || '(sin título)'}
            </button>
          ) : (
            <div className="gtd-review__title" data-testid="gtd-process-title">
              {index >= total ? '¡Inbox procesado!' : gone || 'Ya no está en el Inbox'}
            </div>
          )}
        </div>
        {task && (
          <button
            type="button"
            className="gtd-review__btn gtd-proc__edit"
            onClick={() => onOpenTask(task)}
            title="Editar: título (qué es exactamente), notas y proyecto. Al cerrar, sigues en este paso"
            data-testid="gtd-process-edit"
          >
            <i className="fas fa-pen" /> Editar
          </button>
        )}
        <button
          type="button"
          className="gtd-review__close"
          onClick={onFinish}
          title="Terminar"
          aria-label="Terminar"
          data-testid="gtd-process-close"
        >
          <i className="fas fa-times" />
        </button>
      </div>
      {task && (
        <div className="gtd-review__body">
          {mode === 'all' ? (
            renderAll()
          ) : (
            <React.Fragment>
              <div className="gtd-proc__question" data-testid="gtd-process-question">
                {QUESTIONS[step]}
              </div>
              {fields}
              {renderOptions(options)}
            </React.Fragment>
          )}
        </div>
      )}
      {!task && index >= total && (
        <p className="gtd-review__empty" data-testid="gtd-process-done">
          <i className="fas fa-check" /> Nada más que procesar.
        </p>
      )}
      <div className="gtd-review__nav">
        <button
          type="button"
          className="gtd-review__btn"
          disabled={index === 0 && !hist.length}
          onClick={mode === 'all' ? onBack : stepBack}
          data-testid="gtd-process-back"
        >
          <i className="fas fa-chevron-left" /> Atrás
        </button>
        {index < total && (
          <button
            type="button"
            className="gtd-review__btn"
            onClick={onSkip}
            data-testid="gtd-process-skip"
          >
            {task ? 'Saltar' : 'Siguiente'} <i className="fas fa-chevron-right" />
          </button>
        )}
        <button
          type="button"
          className="gtd-review__btn is-primary"
          onClick={onFinish}
          data-testid="gtd-process-finish"
        >
          Terminar
        </button>
      </div>
    </section>
  );
}
