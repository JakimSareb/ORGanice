// ORG Mode para Eli (3.40): «Procesar Inbox» (estilo FacileThings). Tarjeta encima de la lista,
// como la revisión semanal: una tarea del Inbox cada vez, con Saltar / Atrás / Terminar y «n de N».
// Dos pantallas (Ajustes → Apariencia): una a una (preguntas con botones grandes y atajos 1, 2, 3…)
// o todo junto (grupos «No requiere acción» / «Requiere acción» / «¿Cuándo?»).
// La decisión se entrega a `onDecide(d)`: d.kind = trash | reference | someday | tickler | done |
// waiting | project | next | later, con los datos que haga falta (fechas, persona, área, etiquetas…).
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { toDateInput, fromDateInput } from './TaskEditor';
import { parseTagsInput } from '../../lib/gtd/gtd_process';

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
  // (4.15) Allen estricto
  nextact: '¿Cuál es la siguiente acción?',
  isproj: '¿Forma parte de un proyecto (un resultado con más de un paso)?',
  newproj: 'Proyecto nuevo: ¿cómo se llama?',
  pickproj: '¿De qué proyecto?',
  // (4.52) Someday y Referencia con destino
  somedayproj: '¿Pertenece a algún proyecto?',
  refdest: '¿Dónde guardo esta referencia?',
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
  projects = [],
  contextTags = [],
  effortOptions = [],
  energyOptions = [],
  onDecide,
  onSkip,
  onBack,
  onFinish,
  onOpenTask,
  // (4.48) elegir (o crear) un contacto → Promise<{ id, title } | null>
  onPickPerson = null,
  // (4.52) selector de destino (Promise<{ path, headerId, title } | null>) y «Abrir y terminar de editar»
  onPickDest = null,
  onEditFile = null,
  // estado de la pregunta al volver de editar el fichero: { step, hist, base, nextTitle, person }
  restore = null,
}) {
  const [step, setStep] = useState((restore && restore.step) || 'action');
  const [hist, setHist] = useState((restore && restore.hist) || []);
  const [base, setBase] = useState((restore && restore.base) || null);
  const [tickDate, setTickDate] = useState(toDateInput(tomorrow(today)));
  const [tickTime, setTickTime] = useState('');
  // (4.48) persona = contacto de personas.org ({ id, title }) o null
  const [person, setPerson] = useState((restore && restore.person) || null);
  const pickPersonNow = async () => {
    if (!onPickPerson) return;
    const p = await onPickPerson();
    if (p) setPerson(p);
  };
  const renderPerson = (grow = false) => (
    <>
      <button
        type="button"
        className={'gtd-proc__input gtd-proc__person' + (grow ? ' gtd-proc__input--grow' : '')}
        onClick={pickPersonNow}
        data-testid="gtd-proc-person"
      >
        <i className="fas fa-user" /> {person ? person.title : 'Elegir persona…'}
      </button>
      {person && (
        <button
          type="button"
          className="gtd-proc__opt"
          onClick={() => setPerson(null)}
          aria-label="Quitar la persona"
          data-testid="gtd-proc-person-clear"
        >
          ×
        </button>
      )}
    </>
  );
  const [first, setFirst] = useState('');
  const [area, setArea] = useState('');
  const [tagsText, setTagsText] = useState('');
  // (4.32) esfuerzo (Effort) y energía, como en el editor de tarea
  const [effort, setEffort] = useState('');
  const [energy, setEnergy] = useState('');
  const [sched, setSched] = useState('');
  const [schedTime, setSchedTime] = useState('');
  const [deadline, setDeadline] = useState('');
  // (4.15) Allen estricto: título de la siguiente acción y proyecto
  const [nextTitle, setNextTitle] = useState(
    (restore && restore.nextTitle) || (task && task.title) || ''
  );
  // (4.60) si se cambia el título con «Editar» mientras se procesa, la siguiente acción lo sigue
  // (si no se había reescrito a mano)
  const lastTitleRef = useRef(task ? task.title : '');
  useEffect(() => {
    const now = task ? task.title : '';
    if (now !== lastTitleRef.current) {
      const old = lastTitleRef.current;
      lastTitleRef.current = now;
      setNextTitle((t) => (t === old ? now : t));
    }
  }, [task]);
  const [projName, setProjName] = useState('');
  const [projKey, setProjKey] = useState('');
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
    effort: effort || undefined,
    energy: energy || undefined,
    scheduled: fromDateInput(sched),
    scheduledTime: sched ? schedTime : '',
    deadline: fromDateInput(deadline),
  });
  // (4.15) con la siguiente acción reescrita, se guarda también el título nuevo
  const decide = (d) => {
    const t = nextTitle.trim();
    onDecide(t && task && t !== task.title ? { ...d, title: t } : d);
  };
  // (4.15) tras «¿hay un proyecto?»: hecha → guardar; si no, «¿cuándo?»
  const finishStrict = (b) => {
    if (['done', 'someday', 'reference'].includes(b.kind)) decide(b);
    else withWhen(b);
  };
  const toProject = (b) => {
    setBase(b);
    go('isproj');
  };
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
    // (4.15) Allen estricto (diagrama «Clarifying»): ¿accionable? → NO: papelera / referencia /
    // incubar · SÍ: ¿siguiente acción? → <2 min (hacerla) / delegar (Waiting) / aplazar (con fecha
    // = calendario, sin fecha = Next), y en TODAS las ramas «¿hay un proyecto?»
    if (step === 'action') {
      options = [
        { label: 'Sí', hint: 'hay algo que hacer', icon: 'fas fa-check', run: () => go('nextact') },
        {
          label: 'No',
          hint: 'tirar, guardar o incubar',
          icon: 'fas fa-times',
          run: () => go('noaction'),
        },
      ];
    } else if (step === 'nextact') {
      fields = (
        <input
          className="gtd-proc__input"
          value={nextTitle}
          onChange={(e) => setNextTitle(e.target.value)}
          placeholder="Acción física y visible"
          data-testid="gtd-proc-next-title"
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && nextTitle.trim() && go('two')}
        />
      );
      options = [
        {
          label: 'Continuar',
          icon: 'fas fa-arrow-right',
          primary: true,
          run: () => nextTitle.trim() && go('two'),
        },
      ];
    } else if (step === 'two') {
      options = [
        {
          label: 'Sí: hacerla ya',
          hint: 'hazla ahora y márcala',
          icon: 'fas fa-check-double',
          run: () => toProject({ kind: 'done' }),
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
        {
          label: 'No: aplazar',
          hint: 'calendario o Next',
          icon: 'fas fa-user',
          run: () => toProject({ kind: 'next' }),
        },
        // (4.48) Allen: lo que hay que hablar con alguien va a su agenda
        {
          label: 'Hablar con… (Agenda)',
          hint: 'punto en una agenda',
          icon: 'fas fa-comments',
          run: () => decide({ kind: 'agenda' }),
        },
      ];
    } else if (step === 'person') {
      fields = renderPerson();
      options = [
        {
          label: 'Continuar',
          icon: 'fas fa-arrow-right',
          primary: true,
          run: () => toProject({ kind: 'waiting', person }),
        },
      ];
    } else if (step === 'isproj') {
      options = [
        { label: 'No', icon: 'fas fa-arrow-right', run: () => finishStrict(base) },
        { label: 'Sí: proyecto nuevo', icon: 'fas fa-plus', run: () => go('newproj') },
      ];
      if (projects.length)
        options.push({
          label: 'Sí: uno que ya existe',
          icon: 'fas fa-project-diagram',
          run: () => go('pickproj'),
        });
    }
  }
  // (4.15, 4.52) proyecto nuevo / uno que ya existe: lo usan «¿Hay un proyecto?», Someday y Referencia
  if (mode !== 'all' && task && ['newproj', 'pickproj'].includes(step)) {
    if (step === 'newproj') {
      const ok = () =>
        projName.trim() && finishStrict({ ...base, project: { name: projName.trim() } });
      fields = (
        <input
          className="gtd-proc__input"
          value={projName}
          onChange={(e) => setProjName(e.target.value)}
          placeholder="Resultado deseado"
          data-testid="gtd-proc-project-name"
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && ok()}
        />
      );
      options = [{ label: 'Continuar', icon: 'fas fa-arrow-right', primary: true, run: ok }];
    } else {
      const ok = () => projKey && finishStrict({ ...base, project: { key: projKey } });
      fields = (
        <select
          className="gtd-proc__input"
          value={projKey}
          onChange={(e) => setProjKey(e.target.value)}
          data-testid="gtd-proc-project-pick"
          aria-label="Proyecto"
        >
          <option value="">Elige el proyecto…</option>
          {projects.map((p) => (
            <option key={p.key} value={p.key}>
              {p.title}
            </option>
          ))}
        </select>
      );
      options = [{ label: 'Continuar', icon: 'fas fa-arrow-right', primary: true, run: ok }];
    }
  }
  if (
    mode !== 'all' &&
    task &&
    ['noaction', 'tickler', 'when', 'somedayproj', 'refdest'].includes(step)
  ) {
    if (step === 'noaction') {
      options = [
        { label: 'Papelera', icon: 'fas fa-trash', run: () => decide({ kind: 'trash' }) },
        { label: 'Referencia', icon: 'far fa-file-alt', run: () => go('refdest') },
        {
          label: 'Someday / Maybe',
          hint: 'incubar',
          icon: 'fas fa-cloud',
          run: () => go('somedayproj'),
        },
        {
          label: 'Tickler',
          hint: 'recordármelo un día',
          icon: 'far fa-bell',
          run: () => go('tickler'),
        },
      ];
    } else if (step === 'somedayproj') {
      // (4.52) Someday: ¿forma parte de un proyecto? Si sí, queda DENTRO del proyecto (estado Someday)
      options = [
        {
          label: 'No',
          hint: 'Someday suelto',
          icon: 'fas fa-times',
          run: () => decide({ kind: 'someday' }),
        },
        {
          label: 'Sí: proyecto nuevo',
          icon: 'fas fa-plus',
          run: () => {
            setBase({ kind: 'someday' });
            go('newproj');
          },
        },
      ];
      if (projects.length)
        options.push({
          label: 'Sí: uno que ya existe',
          icon: 'fas fa-project-diagram',
          run: () => {
            setBase({ kind: 'someday' });
            go('pickproj');
          },
        });
    } else if (step === 'refdest') {
      // (4.52) Referencia: a un proyecto, a otra cabecera del sistema, o dejarla; y editar el fichero
      options = [];
      if (projects.length)
        options.push({
          label: 'Proyecto…',
          hint: 'dentro de un proyecto',
          icon: 'fas fa-project-diagram',
          run: () => {
            setBase({ kind: 'reference' });
            go('pickproj');
          },
        });
      if (onPickDest)
        options.push({
          label: 'Enviar a una cabecera…',
          hint: 'otro fichero o la wiki',
          icon: 'fas fa-paper-plane',
          run: async () => {
            const dest = await onPickDest();
            if (dest) decide({ kind: 'reference', dest });
          },
        });
      options.push({
        label: 'Dejar en Referencia',
        icon: 'far fa-file-alt',
        run: () => decide({ kind: 'reference' }),
      });
      if (onEditFile)
        options.push({
          label: '✎ Abrir y terminar de editar',
          hint: 'vuelves a esta pregunta',
          icon: 'fas fa-pen',
          run: () => onEditFile(task, { step, hist, base, nextTitle, person }),
        });
    } else if (step === 'tickler') {
      fields = renderTickler();
      options = [
        { label: 'Guardar en el Tickler', icon: 'far fa-bell', primary: true, run: tickler },
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
          label:
            sched || deadline
              ? 'Guardar'
              : base && base.kind === 'next'
              ? 'Sin fecha: a Next'
              : 'Guardar sin fecha',
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
      // (4.15/4.60) Allen: no hay Todo (todo lo accionable sin fecha → Next)
    ];
  }
  optionsRef.current = options;

  // Atajos 1, 2, 3… (fuera de los campos de texto). (3.43) useLayoutEffect: con useEffect, justo
  // al cambiar de tarjeta había un momento sin atajos y se perdían las teclas pulsadas deprisa
  useLayoutEffect(() => {
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
          placeholder="Etiquetas (contextos…) o uno nuevo"
          data-testid="gtd-proc-tags"
        />
        {effortOptions.length > 0 && (
          <select
            className="gtd-proc__input"
            value={effort}
            onChange={(e) => setEffort(e.target.value)}
            data-testid="gtd-proc-effort"
            aria-label="Tiempo (Effort)"
          >
            <option value="">Tiempo</option>
            {effortOptions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        )}
        {energyOptions.length > 0 && (
          <select
            className="gtd-proc__input"
            value={energy}
            onChange={(e) => setEnergy(e.target.value)}
            data-testid="gtd-proc-energy"
            aria-label="Energía (Energy)"
          >
            <option value="">Energía</option>
            {energyOptions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        )}
        {contextTags.length > 0 && (
          <div className="gtd-proc__chips" data-testid="gtd-proc-contexts">
            {contextTags.map((c) => {
              const cur = parseTagsInput(tagsText);
              const on = cur.some((x) => x.toLowerCase() === c.toLowerCase());
              return (
                <button
                  key={c}
                  type="button"
                  className={'gtd-proc__chip' + (on ? ' is-on' : '')}
                  aria-pressed={on}
                  onClick={() =>
                    setTagsText(
                      (on
                        ? cur.filter((x) => x.toLowerCase() !== c.toLowerCase())
                        : [...cur, c]
                      ).join(', ')
                    )
                  }
                  data-testid="gtd-proc-context"
                >
                  {c}
                </button>
              );
            })}
          </div>
        )}
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
            {renderPerson(true)}
            <button
              type="button"
              className="gtd-proc__opt"
              onClick={() => decide({ kind: 'waiting', person, ...details() })}
              data-testid="gtd-proc-waiting"
            >
              <i className="fas fa-hourglass-half" />{' '}
              <span className="gtd-proc__opt-label">Waiting</span>
            </button>
            <button
              type="button"
              className="gtd-proc__opt"
              onClick={() => decide({ kind: 'agenda' })}
              data-testid="gtd-proc-agenda"
            >
              <i className="fas fa-comments" /> <span className="gtd-proc__opt-label">Agenda</span>
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
