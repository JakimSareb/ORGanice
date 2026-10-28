// ORG Mode para Eli (4.47): Procesos ZK. Ventana con la tarjeta de los procesos GTD (mismo
// aspecto, teclas 1, 2, 3… y Atrás / Saltar / Terminar):
//   - fugaces:   procesar ZK/inbox.org una a una (como vaciar el Inbox de Allen)
//   - permanent: asistente de nota permanente (título → idea → enlaces → índice → fuente)
//   - review:    Revisión ZK (lista de comprobación, como la Revisión semanal)
//   - library:   Biblioteca (fichas de fuente con filtros)
// Las escrituras van por lib/eli_zk_actions.js; el modelo puro, en lib/eli_zk_process.js.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from 'react-redux';
import { useHistory } from 'react-router-dom';

import '../Gtd/stylesheet.css';
import './stylesheet.css';

import {
  zkCorpus,
  zkDropFugaz,
  zkFugazToGtd,
  zkFugazToLiterature,
  zkAppendToNote,
  zkCreatePermanent,
  zkEnsureLoaded,
} from '../../lib/eli_zk_actions';
import {
  zkAnalyze,
  oldFugaces,
  unprocessedPoints,
  randomNote,
  suggestLinks,
  sourceCardInfo,
  libraryList,
  OLD_FUGAZ_DAYS,
} from '../../lib/eli_zk_process';
import { SOURCE_TYPES, SOURCE_STATES } from '../../lib/eli_zk';
import { askPick, askText } from '../../lib/eli_prompt';
import { openBrokenLinks, brokenLinksCount } from '../../lib/eli_broken_links';
import { openPrintPreview } from '../EliTools';

const KIND_LABEL = {
  permanente: 'Permanente',
  literatura: 'Ficha de fuente',
  indice: 'Índice',
  otra: 'Nota',
};
const TYPE_LABEL = { libro: 'Libro', articulo: 'Artículo', video: 'Vídeo' };
const fmtDate = (d) =>
  d ? d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

const WIZ_STEPS = [
  { id: 'title', label: 'Título como una afirmación' },
  { id: 'idea', label: 'La idea, con tus palabras (una sola)' },
  { id: 'links', label: '¿Con qué notas se relaciona?' },
  { id: 'index', label: '¿A qué índice va?' },
  { id: 'source', label: 'Fuente' },
];

// Botones de opción con número (como Procesar Inbox)
const Options = ({ list }) => (
  <div className="gtd-proc__options is-big">
    {list.map((o, i) => (
      <button
        key={o.label}
        type="button"
        className={'gtd-proc__opt' + (o.primary ? ' is-primary' : '')}
        onClick={o.run}
        data-testid={o.testId || 'eli-zk-opt'}
      >
        <span className="gtd-proc__key">{i + 1}</span>
        <i className={o.icon} />
        <span className="gtd-proc__opt-label">{o.label}</span>
        {o.hint && <span className="gtd-proc__opt-hint">{o.hint}</span>}
      </button>
    ))}
  </div>
);

const Head = ({ icon, kicker, title, count = null, onClose }) => (
  <div className="gtd-review__head">
    <i className={`${icon} gtd-review__icon`} />
    <div className="gtd-review__titles">
      <div className="gtd-review__kicker" data-testid="eli-zk-kicker">
        {kicker}
      </div>
      <div className="gtd-review__title" data-testid="eli-zk-title">
        {title}
        {count !== null && <span className="gtd-review__count">{count}</span>}
      </div>
    </div>
    <button
      type="button"
      className="gtd-review__close"
      onClick={onClose}
      title="Terminar"
      aria-label="Terminar"
      data-testid="eli-zk-close"
    >
      <i className="fas fa-times" />
    </button>
  </div>
);

export default function EliZkProcess({ start, onClose }) {
  const store = useStore();
  const history = useHistory();
  const run = (thunk) => store.dispatch(thunk);
  const [mode, setMode] = useState(start.mode);
  const [corpus, setCorpus] = useState(null);
  const [busy, setBusy] = useState(false);
  const optionsRef = useRef([]);

  const reload = async () => {
    const c = await run(zkCorpus());
    setCorpus(c);
    return c;
  };
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openNote = (path) => {
    onClose();
    history.push(`/file${path}`);
  };

  // Atajos 1, 2, 3… (fuera de los campos y sin otra ventana encima) y Esc = Terminar
  useLayoutEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('.eli-prompt__overlay')) return;
      const t = e.target;
      const inField = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if (e.key === 'Escape' && !inField) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (inField || e.shiftKey || !/^[1-9]$/.test(e.key)) return;
      const o = optionsRef.current[Number(e.key) - 1];
      if (!o) return;
      e.preventDefault();
      e.stopPropagation();
      o.run();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  let body;
  optionsRef.current = [];
  if (!corpus) {
    body = (
      <section className="gtd-review gtd-proc eli-zk-proc" data-testid="eli-zk-loading">
        <p className="gtd-review__hint">
          <i className="fas fa-spinner fa-spin" /> Leyendo notas ZK…
        </p>
      </section>
    );
  } else if (mode === 'fugaces') {
    body = (
      <Fugaces
        corpus={corpus}
        busy={busy}
        setBusy={setBusy}
        reload={reload}
        run={run}
        optionsRef={optionsRef}
        onClose={onClose}
        toWizard={(init) => setMode({ wizard: init, back: 'fugaces' })}
      />
    );
  } else if (mode === 'review') {
    body = (
      <Review
        corpus={corpus}
        onClose={onClose}
        openNote={openNote}
        toFugaces={() => setMode('fugaces')}
      />
    );
  } else if (mode === 'library') {
    body = <Library corpus={corpus} onClose={onClose} openNote={openNote} run={run} />;
  } else {
    // asistente: { wizard: datos iniciales, back } o el modo inicial 'permanent' (start.init)
    const w = typeof mode === 'object' ? mode : { wizard: start.init || {}, back: null };
    body = (
      <Wizard
        key={(w.wizard.fugaz && w.wizard.fugaz.id) || 'w'}
        init={w.wizard}
        corpus={corpus}
        run={run}
        onClose={onClose}
        openNote={openNote}
        onBack={w.back ? () => setMode(w.back) : null}
        onDone={async () => {
          await reload();
          if (w.back) setMode(w.back);
        }}
      />
    );
  }
  return (
    <div className="eli-zk-overlay" data-testid="eli-zk-overlay">
      <div className="eli-zk-overlay__box">{body}</div>
    </div>
  );
}

// --- A. Procesar fugaces ---------------------------------------------------------------------

function Fugaces({ corpus, busy, setBusy, reload, run, optionsRef, onClose, toWizard }) {
  const [idx, setIdx] = useState(0);
  const entries = corpus.fugaces;
  const total = entries.length;
  const i = Math.min(idx, Math.max(0, total - 1));
  const e = total ? entries[i] : null;
  const act = async (thunk) => {
    if (busy) return;
    setBusy(true);
    try {
      await run(thunk);
      await reload();
    } finally {
      setBusy(false);
    }
  };
  const options = e
    ? [
        {
          label: 'Descartar',
          icon: 'fas fa-trash',
          hint: 'no sirve: se borra',
          run: () => act(zkDropFugaz(e)),
          testId: 'eli-zk-fz-trash',
        },
        {
          label: 'Tarea GTD',
          icon: 'fas fa-inbox',
          hint: 'al Inbox de GTD',
          run: () => act(zkFugazToGtd(e)),
          testId: 'eli-zk-fz-gtd',
        },
        {
          label: 'Nota de literatura',
          icon: 'fas fa-book',
          hint: 'un punto en una ficha de fuente',
          run: () => act(zkFugazToLiterature(e, corpus)),
          testId: 'eli-zk-fz-lit',
        },
        {
          label: 'Nota permanente',
          icon: 'far fa-lightbulb',
          hint: 'asistente paso a paso',
          primary: true,
          run: () => toWizard({ title: e.title, idea: e.body, origin: e.origin, fugaz: e }),
          testId: 'eli-zk-fz-perm',
        },
        {
          label: 'Añadir a nota existente',
          icon: 'fas fa-paste',
          hint: 'al final de otra nota',
          run: () => act(zkAppendToNote(e, corpus)),
          testId: 'eli-zk-fz-append',
        },
      ]
    : [];
  optionsRef.current = options;
  return (
    <section className="gtd-review gtd-proc eli-zk-proc" data-testid="eli-zk-fugaces">
      <Head
        icon="fas fa-bolt"
        kicker={`Procesar fugaces${total ? ` · ${i + 1} de ${total} · quedan ${total}` : ''}`}
        title={e ? e.title || '(sin título)' : '¡Fugaces procesadas!'}
        onClose={onClose}
      />
      {e ? (
        <div className="gtd-review__body">
          {(e.createdDate || e.body || e.origin) && (
            <div className="eli-zk-proc__note" data-testid="eli-zk-fz-body">
              {e.createdDate && <div className="eli-zk-proc__date">{fmtDate(e.createdDate)}</div>}
              {e.body && <div className="gtd-review__notes">{e.body}</div>}
              {e.origin && <div className="eli-zk-proc__date">Origen: {e.origin}</div>}
            </div>
          )}
          <div className="gtd-proc__question">¿Qué hago con ella?</div>
          <Options list={options} />
        </div>
      ) : (
        <p className="gtd-review__empty" data-testid="eli-zk-fz-done">
          <i className="fas fa-check" /> Nada más que procesar.
        </p>
      )}
      <div className="gtd-review__nav">
        <button
          type="button"
          className="gtd-review__btn"
          disabled={i === 0}
          onClick={() => setIdx(i - 1)}
          data-testid="eli-zk-back"
        >
          <i className="fas fa-chevron-left" /> Atrás
        </button>
        {i < total - 1 && (
          <button
            type="button"
            className="gtd-review__btn"
            onClick={() => setIdx(i + 1)}
            data-testid="eli-zk-skip"
          >
            Saltar <i className="fas fa-chevron-right" />
          </button>
        )}
        <button
          type="button"
          className="gtd-review__btn is-primary"
          onClick={onClose}
          data-testid="eli-zk-finish"
        >
          Terminar
        </button>
      </div>
    </section>
  );
}

// --- B. Asistente de nota permanente ---------------------------------------------------------

function Wizard({ init, corpus, run, onClose, openNote, onBack, onDone }) {
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState(init.title || '');
  const [idea, setIdea] = useState(init.idea || '');
  const [links, setLinks] = useState([]);
  const [warned, setWarned] = useState(false);
  const [index, setIndex] = useState(null); // null = ninguno · { path, title } · { create }
  const [card, setCard] = useState(init.card || null);
  const [where, setWhere] = useState(init.where || '');
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState(null);
  const s = WIZ_STEPS[step];
  const nodes = corpus.notes.filter((n) => n.id && n.kind !== 'fugaz');
  const chosen = new Set(links.map((l) => l.id.toLowerCase()));
  const suggested = suggestLinks(`${title}\n${idea}`, nodes).filter(
    (n) => !chosen.has(n.id.toLowerCase())
  );
  const indexes = corpus.notes.filter((n) => n.kind === 'indice');
  const addLink = (n) => setLinks((l) => [...l, { id: n.id, title: n.title }]);

  const searchLink = async () => {
    const id = await askPick({
      title: 'Enlazar con…',
      placeholder: 'Buscar nota…',
      emptyText: 'No hay notas en la carpeta ZK.',
      items: nodes
        .filter((n) => !chosen.has(n.id.toLowerCase()))
        .map((n) => ({ id: n.id, label: n.title, hint: KIND_LABEL[n.kind] || '' })),
    });
    const n = id && nodes.find((x) => x.id === id);
    if (n) addLink(n);
  };
  const newIndex = async () => {
    const t = await askText({ title: 'Índice nuevo', okLabel: 'Crear' });
    if (t && t.trim()) setIndex({ create: t.trim() });
  };
  const pickCard = async () => {
    const cards = corpus.notes.filter((n) => n.kind === 'literatura');
    const path = await askPick({
      title: 'Ficha de fuente',
      placeholder: 'Buscar ficha…',
      emptyText: 'No hay fichas de fuente.',
      items: cards.map((c) => ({ id: c.path, label: c.title, hint: c.keywords.AUTOR || '' })),
    });
    const c = path && cards.find((x) => x.path === path);
    if (c) setCard({ path: c.path, id: c.id, title: c.title });
  };

  const create = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await run(
        zkCreatePermanent({
          title: title.trim(),
          idea,
          links,
          index,
          card,
          cells: init.cells || null,
          where,
          origin: card ? '' : init.origin || '',
          fugaz: init.fugaz || null,
        })
      );
      if (!res) return;
      if (onBack) await onDone();
      else {
        setMade(res);
        onDone();
      }
    } finally {
      setBusy(false);
    }
  };
  const next = () => {
    if (step === 0 && !title.trim()) return;
    if (step === 2 && !links.length && !warned) {
      setWarned(true);
      return;
    }
    if (step === WIZ_STEPS.length - 1) create();
    else setStep(step + 1);
  };

  if (made)
    return (
      <section className="gtd-review gtd-proc eli-zk-proc" data-testid="eli-zk-wizard">
        <Head
          icon="far fa-lightbulb"
          kicker="Nota permanente"
          title="Nota creada ✓"
          onClose={onClose}
        />
        <div className="gtd-review__nav">
          <button
            type="button"
            className="gtd-review__btn"
            onClick={() => openNote(made.path)}
            data-testid="eli-zk-wiz-open"
          >
            <i className="far fa-file-alt" /> Abrir la nota
          </button>
          <button
            type="button"
            className="gtd-review__btn is-primary"
            onClick={onClose}
            data-testid="eli-zk-finish"
          >
            Cerrar
          </button>
        </div>
      </section>
    );

  let fields = null;
  if (s.id === 'title') {
    fields = (
      <input
        className="gtd-proc__input eli-zk-proc__wide"
        value={title}
        autoFocus
        placeholder="p. ej. Repartir el estudio en días fija mejor que estudiar de golpe"
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && next()}
        data-testid="eli-zk-wiz-title"
      />
    );
  } else if (s.id === 'idea') {
    fields = (
      <textarea
        className="gtd-proc__input eli-zk-proc__wide eli-zk-proc__area"
        value={idea}
        autoFocus
        rows={6}
        placeholder="Explícala como si se la contaras a alguien, sin copiar."
        onChange={(e) => setIdea(e.target.value)}
        data-testid="eli-zk-wiz-idea"
      />
    );
  } else if (s.id === 'links') {
    fields = (
      <React.Fragment>
        {suggested.length > 0 && (
          <React.Fragment>
            <div className="gtd-review__sub">Sugeridas (las menciona el texto)</div>
            <div className="gtd-proc__chips">
              {suggested.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className="gtd-proc__chip"
                  onClick={() => addLink(n)}
                  data-testid="eli-zk-wiz-suggest"
                >
                  + {n.title}
                </button>
              ))}
            </div>
          </React.Fragment>
        )}
        {links.length > 0 && (
          <ul className="gtd-review__list">
            {links.map((l) => (
              <li key={l.id} className="gtd-review__row" data-testid="eli-zk-wiz-link">
                <span className="gtd-review__item">
                  <i className="fas fa-link" />
                  <span className="gtd-review__item-title">{l.title}</span>
                </span>
                <button
                  type="button"
                  className="gtd-review__act"
                  onClick={() => setLinks((x) => x.filter((y) => y.id !== l.id))}
                  title="Quitar"
                  aria-label={`Quitar ${l.title}`}
                >
                  <i className="fas fa-times" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className="gtd-review__btn"
          onClick={searchLink}
          data-testid="eli-zk-wiz-search"
        >
          <i className="fas fa-search" /> Buscar nota…
        </button>
        {warned && !links.length && (
          <p className="gtd-review__empty is-warn" data-testid="eli-zk-wiz-warn">
            Una permanente debería enlazar al menos con otra nota.
          </p>
        )}
      </React.Fragment>
    );
  } else if (s.id === 'index') {
    const isOn = (p) => index && index.path === p;
    fields = (
      <div className="gtd-proc__chips">
        <button
          type="button"
          className={'gtd-proc__chip' + (!index ? ' is-on' : '')}
          onClick={() => setIndex(null)}
          data-testid="eli-zk-wiz-noindex"
        >
          Ninguno
        </button>
        {indexes.map((n) => (
          <button
            key={n.path}
            type="button"
            className={'gtd-proc__chip' + (isOn(n.path) ? ' is-on' : '')}
            onClick={() => setIndex({ path: n.path, title: n.title })}
            data-testid="eli-zk-wiz-index"
          >
            {n.title}
          </button>
        ))}
        {index && index.create ? (
          <button type="button" className="gtd-proc__chip is-on" onClick={newIndex}>
            Nuevo: {index.create}
          </button>
        ) : (
          <button
            type="button"
            className="gtd-proc__chip"
            onClick={newIndex}
            data-testid="eli-zk-wiz-newindex"
          >
            + Crear índice…
          </button>
        )}
      </div>
    );
  } else {
    fields = card ? (
      <div className="eli-zk-proc__note">
        <div>
          <i className="fas fa-book" /> {card.title}
        </div>
        <input
          className="gtd-proc__input eli-zk-proc__wide"
          value={where}
          placeholder="Dónde (página, posición o minuto)"
          onChange={(e) => setWhere(e.target.value)}
          data-testid="eli-zk-wiz-where"
        />
      </div>
    ) : (
      <React.Fragment>
        {init.origin && <p className="gtd-review__hint">Origen: {init.origin}</p>}
        <button
          type="button"
          className="gtd-review__btn"
          onClick={pickCard}
          data-testid="eli-zk-wiz-card"
        >
          <i className="fas fa-book" /> Elegir ficha de fuente… (opcional)
        </button>
      </React.Fragment>
    );
  }

  const last = step === WIZ_STEPS.length - 1;
  return (
    <section className="gtd-review gtd-proc eli-zk-proc" data-testid="eli-zk-wizard">
      <Head
        icon="far fa-lightbulb"
        kicker={`Nota permanente · Paso ${step + 1} de ${WIZ_STEPS.length}`}
        title={s.label}
        onClose={onClose}
      />
      <div className="gtd-review__steps" role="tablist">
        {WIZ_STEPS.map((x, k) => (
          <span
            key={x.id}
            className={
              'gtd-review__dot eli-zk-proc__dot' +
              (k === step ? ' is-on' : k < step ? ' is-past' : '')
            }
          />
        ))}
      </div>
      <div className="gtd-review__body">{fields}</div>
      <div className="gtd-review__nav">
        <button
          type="button"
          className="gtd-review__btn"
          disabled={step === 0 && !onBack}
          onClick={() => (step === 0 ? onBack() : setStep(step - 1))}
          data-testid="eli-zk-back"
        >
          <i className="fas fa-chevron-left" /> Atrás
        </button>
        <button
          type="button"
          className="gtd-review__btn is-primary"
          disabled={busy || (step === 0 && !title.trim())}
          onClick={next}
          data-testid={last ? 'eli-zk-wiz-create' : 'eli-zk-next'}
        >
          {last
            ? 'Crear nota'
            : step === 2 && warned && !links.length
            ? 'Seguir sin enlaces'
            : 'Siguiente'}{' '}
          <i className={last ? 'fas fa-check' : 'fas fa-chevron-right'} />
        </button>
      </div>
    </section>
  );
}

// --- D. Revisión ZK ----------------------------------------------------------------------------

function Review({ corpus, onClose, openNote, toFugaces }) {
  const [step, setStep] = useState(0);
  const [randomPath, setRandomPath] = useState(null);
  const an = zkAnalyze(corpus.notes);
  const old = oldFugaces(corpus.fugaces, new Date());
  const pending = corpus.notes
    .filter((n) => n.kind === 'literatura')
    .map((n) => ({ n, k: unprocessedPoints(n.text).length }))
    .filter((x) => x.k > 0);
  const broken = brokenLinksCount();
  const rnd =
    (randomPath && corpus.notes.find((n) => n.path === randomPath)) ||
    randomNote(corpus.notes) ||
    null;
  const noteRow = (n, hint) => ({ key: n.path, title: n.title, hint, path: n.path });
  const steps = [
    {
      id: 'old',
      label: `Fugaces de más de ${OLD_FUGAZ_DAYS} días`,
      icon: 'fas fa-bolt',
      hint: 'Una fugaz es para unos días: procésala o descártala.',
      items: old.map((e) => ({
        key: e.id || e.start,
        title: e.title,
        hint: fmtDate(e.createdDate),
      })),
      action: corpus.fugaces.length
        ? { label: 'Procesar fugaces', icon: 'fas fa-bolt', run: toFugaces }
        : null,
    },
    {
      id: 'orphans',
      label: 'Notas huérfanas',
      icon: 'fas fa-unlink',
      hint: 'No enlazan a nada y nada las enlaza: relaciónalas con otras o con un índice.',
      items: an.orphans.map((n) => noteRow(n, KIND_LABEL[n.kind])),
    },
    {
      id: 'noindex',
      label: 'Permanentes sin índice',
      icon: 'fas fa-list-ul',
      hint: 'Añade cada una a un índice (en el índice, un enlace a la nota).',
      items: an.withoutIndex.map((n) => noteRow(n, '')),
    },
    {
      id: 'points',
      label: 'Fichas con puntos sin procesar',
      icon: 'fas fa-book',
      hint: 'Abre la ficha y usa «→ Permanente» en cada fila sin nota ZK.',
      items: pending.map((x) => noteRow(x.n, `${x.k} sin procesar`)),
    },
    {
      id: 'broken',
      label: 'Enlaces rotos',
      icon: 'fas fa-unlink',
      hint:
        broken === null
          ? 'La herramienta «Enlaces rotos» busca en todas las notas (también las de ZK).'
          : `En el último repaso de «Enlaces rotos» había ${broken}.`,
      items: [],
      noList: true,
      action: {
        label: 'Abrir Enlaces rotos',
        icon: 'fas fa-unlink',
        run: () => {
          onClose();
          openBrokenLinks();
        },
      },
    },
    {
      id: 'random',
      label: 'Una nota al azar',
      icon: 'fas fa-random',
      hint: 'Reléela: ¿sigue siendo cierta? ¿Con qué otra nota se relaciona?',
      items: rnd ? [noteRow(rnd, KIND_LABEL[rnd.kind])] : [],
      action: rnd
        ? {
            label: 'Otra',
            icon: 'fas fa-sync-alt',
            run: () => {
              const n = randomNote(corpus.notes, rnd.path);
              if (n) setRandomPath(n.path);
            },
            testId: 'eli-zk-review-other',
          }
        : null,
    },
  ];
  const s = steps[step];
  const n = s.items.length;
  const lastStep = step === steps.length - 1;
  return (
    <section className="gtd-review eli-zk-proc" data-testid="eli-zk-review">
      <Head
        icon="fas fa-clipboard-check"
        kicker={`Revisión ZK · Paso ${step + 1} de ${steps.length}`}
        title={s.label}
        count={s.noList || s.id === 'random' ? null : n}
        onClose={onClose}
      />
      <div className="gtd-review__steps" role="tablist">
        {steps.map((x, i) => (
          <button
            key={x.id}
            type="button"
            className={'gtd-review__dot' + (i === step ? ' is-on' : i < step ? ' is-past' : '')}
            onClick={() => setStep(i)}
            title={x.label}
            aria-label={x.label}
            data-testid={`eli-zk-review-dot-${x.id}`}
          >
            <i className={x.icon} />
            {!x.noList && x.id !== 'random' && x.items.length > 0 && (
              <span className="gtd-review__dot-n">{x.items.length}</span>
            )}
          </button>
        ))}
      </div>
      <p className="gtd-review__hint">{s.hint}</p>
      {!s.noList &&
        (n ? (
          <ul className="gtd-review__list">
            {s.items.map((it) => (
              <li key={it.key} className="gtd-review__row">
                <button
                  type="button"
                  className="gtd-review__item"
                  onClick={() => it.path && openNote(it.path)}
                  data-testid="eli-zk-review-item"
                >
                  <i className="far fa-file-alt" />
                  <span className="gtd-review__item-title">{it.title || '(sin título)'}</span>
                  {it.hint && <span className="gtd-review__date">{it.hint}</span>}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="gtd-review__empty" data-testid="eli-zk-review-empty">
            <i className="fas fa-check" /> Nada que revisar aquí.
          </p>
        ))}
      {s.action && (
        <button
          type="button"
          className="gtd-review__btn"
          onClick={s.action.run}
          data-testid={s.action.testId || 'eli-zk-review-action'}
        >
          <i className={s.action.icon} /> {s.action.label}
        </button>
      )}
      <div className="gtd-review__nav">
        <button
          type="button"
          className="gtd-review__btn"
          disabled={step === 0}
          onClick={() => setStep(step - 1)}
          data-testid="eli-zk-back"
        >
          <i className="fas fa-chevron-left" /> Atrás
        </button>
        <button
          type="button"
          className="gtd-review__btn is-primary"
          onClick={() => (lastStep ? onClose() : setStep(step + 1))}
          data-testid="eli-zk-next"
        >
          {lastStep ? 'Terminar' : 'Siguiente'} <i className="fas fa-chevron-right" />
        </button>
      </div>
    </section>
  );
}

// --- E. Biblioteca -----------------------------------------------------------------------------

function Library({ corpus, onClose, openNote, run }) {
  const [type, setType] = useState('');
  const [state, setState] = useState('');
  const cards = corpus.notes
    .filter((n) => n.kind === 'literatura')
    .map((n) => sourceCardInfo(n.path, n.text, n));
  const list = libraryList(cards, { type, state });
  const print = async (path) => {
    const ok = await run(zkEnsureLoaded(path));
    if (!ok) return;
    onClose();
    openPrintPreview(null, path);
  };
  return (
    <section className="gtd-review eli-zk-proc" data-testid="eli-zk-library">
      <Head
        icon="fas fa-book"
        kicker="Biblioteca"
        title="Fichas de fuente"
        count={list.length}
        onClose={onClose}
      />
      <div className="gtd-proc__row gtd-proc__row--wrap eli-zk-proc__filters">
        <select
          className="gtd-proc__input"
          value={type}
          onChange={(e) => setType(e.target.value)}
          data-testid="eli-zk-lib-type"
        >
          <option value="">Todos los tipos</option>
          {SOURCE_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <select
          className="gtd-proc__input"
          value={state}
          onChange={(e) => setState(e.target.value)}
          data-testid="eli-zk-lib-state"
        >
          <option value="">Todos los estados</option>
          {SOURCE_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      {list.length ? (
        <ul className="gtd-review__list">
          {list.map((c) => (
            <li key={c.path} className="gtd-review__row" data-testid="eli-zk-lib-row">
              <button
                type="button"
                className="gtd-review__item eli-zk-lib__item"
                onClick={() => openNote(c.path)}
                data-testid="eli-zk-lib-open"
              >
                <i className="fas fa-book" />
                <span className="gtd-review__item-title">
                  <span className="eli-zk-lib__title">{c.title}</span>
                  <span className="eli-zk-lib__meta">
                    {[
                      c.author,
                      TYPE_LABEL[c.type] || '',
                      c.state,
                      c.rating ? `★ ${c.rating}` : '',
                      c.end ? `fin ${c.end}` : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                {c.pending > 0 && (
                  <span className="gtd-review__date eli-zk-lib__pending">
                    {c.pending} sin procesar
                  </span>
                )}
              </button>
              <button
                type="button"
                className="gtd-review__act"
                onClick={() => print(c.path)}
                title="PDF / Imprimir"
                aria-label={`Imprimir ${c.title}`}
                data-testid="eli-zk-lib-print"
              >
                <i className="fas fa-print" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="gtd-review__empty" data-testid="eli-zk-lib-empty">
          {cards.length
            ? 'Ninguna ficha con ese filtro.'
            : 'Aún no hay fichas de fuente (☰ › Nueva nota ZK › Ficha de fuente).'}
        </p>
      )}
      <div className="gtd-review__nav">
        <button
          type="button"
          className="gtd-review__btn is-primary"
          onClick={onClose}
          data-testid="eli-zk-finish"
        >
          Cerrar
        </button>
      </div>
    </section>
  );
}
