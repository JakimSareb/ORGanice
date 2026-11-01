// ORG Mode para Eli (4.60): cuadro «Nueva reunión» (ficha de persona, cabecera de cada agenda,
// título «Agendas», detalle del proyecto y la entrada de actas `/gtd?acta=…`). Crea la reunión en
// reuniones.org (lib/gtd/gtd_agendas_actions.js: createMeeting) y la abre en Documentos con las
// notas listas para escribir el acta. Sin IA: el texto lo da el teléfono (Notas de voz / Atajos).
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDispatch, useSelector, useStore } from 'react-redux';
import { useHistory, useLocation } from 'react-router-dom';
import {
  createMeeting,
  openHeadingInDocs,
  openPointsOf,
  pickTemplate,
  loadedProjects,
  meetingTasksToInbox,
} from '../../lib/gtd/gtd_agendas_actions';
import {
  pickPerson,
  contactsFromState,
  personasPathFor,
  ensurePeopleFile,
} from '../../lib/gtd/gtd_persons_actions';
import { pickProject } from '../../lib/gtd/gtd_assign';
import { meetingTitle, detectTasks } from '../../lib/gtd/gtd_meetings';
import { PersonChip } from './PersonChip';

// Abrir el cuadro desde cualquier sitio. detail = { persons: [{ id, title }], project (tarea del
// modelo: path, id, orgId, title), agendaId, agendaName, transcript }
export const openNewMeeting = (detail = {}) =>
  window.dispatchEvent(new CustomEvent('eli:new-meeting', { detail }));

const NewMeetingDialog = ({ detail, onClose }) => {
  const dispatch = useDispatch();
  const store = useStore();
  const firstName =
    (detail.persons && detail.persons[0] && detail.persons[0].title) ||
    (detail.project && detail.project.title) ||
    detail.agendaName ||
    '';
  const [title, setTitle] = useState(() => meetingTitle(firstName));
  const [persons, setPersons] = useState(() => detail.persons || []);
  const [project, setProject] = useState(() => detail.project || null);
  const nOpen = useMemo(() => openPointsOf(store.getState(), detail.agendaId), [
    store,
    detail.agendaId,
  ]);
  const [bring, setBring] = useState(true);
  const [template, setTemplate] = useState(null);
  const [transcript, setTranscript] = useState(detail.transcript || '');
  const [showText, setShowText] = useState(!!detail.transcript || !!detail.askPaste);
  const [pasteError, setPasteError] = useState('');
  const [picked, setPicked] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  // contactos para reconocer a las personas del acta (personas.org se carga si hace falta)
  const personasFile = useSelector((st) =>
    st.org.present.getIn(['files', personasPathFor(store.getState())])
  );
  useEffect(() => {
    dispatch(ensurePeopleFile(personasPathFor(store.getState())));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const contacts = useMemo(() => contactsFromState(store.getState()), [store, personasFile]);
  const found = useMemo(() => detectTasks(transcript, contacts), [transcript, contacts]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && document.querySelectorAll('.eli-prompt__overlay').length < 2) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const addPerson = async () => {
    const p = await dispatch(pickPerson({ title: 'Asistente', linked: persons.map((x) => x.id) }));
    if (!p) return;
    setPersons((ps) =>
      ps.some((x) => x.id.toLowerCase() === p.id.toLowerCase())
        ? ps.filter((x) => x.id.toLowerCase() !== p.id.toLowerCase())
        : [...ps, p]
    );
  };
  const chooseProject = async () => {
    const p = await pickProject(loadedProjects(store.getState()), { title: 'Proyecto' });
    if (p) setProject(p);
  };
  const chooseTemplate = async () => {
    const t = await dispatch(pickTemplate());
    if (t) setTemplate(t);
  };
  // iOS solo deja leer el portapapeles con un toque: este botón (si no se puede, se pega a mano)
  const paste = async () => {
    setShowText(true);
    setPasteError('');
    try {
      const t = await navigator.clipboard.readText();
      if (t && t.trim()) setTranscript((x) => (x.trim() ? `${x.trim()}\n\n${t}` : t));
      else setPasteError('El portapapeles está vacío: pega el texto en el cuadro.');
    } catch (e) {
      setPasteError('No se ha podido leer el portapapeles: pega el texto en el cuadro.');
    }
  };
  const create = async () => {
    if (busy || !title.trim()) return;
    setBusy(true);
    const r = await dispatch(
      createMeeting({
        title,
        persons,
        project,
        agendaId: detail.agendaId || null,
        bringPoints: bring && nOpen > 0,
        template,
        transcript,
      })
    );
    setBusy(false);
    if (!r) return;
    const chosen = found.filter((x, i) => picked.has(i));
    if (chosen.length)
      dispatch(meetingTasksToInbox(chosen, { orgId: r.orgId, title: title.trim() }));
    onClose();
    window.dispatchEvent(new CustomEvent('eli:hv-close'));
    dispatch(openHeadingInDocs({ path: r.path, headerId: r.headerId, editNotes: true }));
  };

  const box = (
    <div
      className="eli-prompt__overlay gtd-meeting__overlay"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="eli-prompt__box gtd-meeting"
        role="dialog"
        aria-label="Nueva reunión"
        data-testid="gtd-meeting-new"
        onKeyDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="eli-prompt__title">
          <i className="fas fa-users" /> Nueva reunión
        </div>
        <label className="gtd-meeting__label">
          Título
          <input
            type="text"
            className="gtd-tickler__input gtd-meeting__title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                create();
              }
            }}
            data-testid="gtd-meeting-title"
          />
        </label>
        <div className="gtd-meeting__label">Asistentes</div>
        <div className="gtd-meeting__chips" data-testid="gtd-meeting-persons">
          {persons.map((p) => (
            <PersonChip
              key={p.id}
              name={p.title}
              testId="gtd-meeting-person"
              onRemove={() => setPersons((ps) => ps.filter((x) => x.id !== p.id))}
            />
          ))}
          <button
            type="button"
            className="gtd-review__btn"
            onClick={addPerson}
            data-testid="gtd-meeting-add-person"
          >
            <i className="fas fa-user-plus" /> Añadir
          </button>
        </div>
        <div className="gtd-meeting__label">Proyecto</div>
        <div className="gtd-meeting__chips">
          {project ? (
            <span className="gtd-chip" data-testid="gtd-meeting-project">
              <span className="gtd-chip__label">
                <i className="fas fa-project-diagram" /> {project.title}
              </span>
              <button type="button" onClick={() => setProject(null)} aria-label="Quitar">
                ×
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="gtd-review__btn"
              onClick={chooseProject}
              data-testid="gtd-meeting-pick-project"
            >
              <i className="fas fa-project-diagram" /> Elegir… (opcional)
            </button>
          )}
        </div>
        {nOpen > 0 && (
          <label className="gtd-meeting__check">
            <input
              type="checkbox"
              checked={bring}
              onChange={(e) => setBring(e.target.checked)}
              data-testid="gtd-meeting-bring"
            />{' '}
            Traer {nOpen === 1 ? 'el punto abierto' : `los ${nOpen} puntos abiertos`} de la agenda
          </label>
        )}
        <div className="gtd-meeting__chips">
          {template ? (
            <span className="gtd-chip" data-testid="gtd-meeting-template">
              <span className="gtd-chip__label">
                <i className="far fa-clone" /> {template.title}
              </span>
              <button type="button" onClick={() => setTemplate(null)} aria-label="Quitar">
                ×
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="gtd-review__btn"
              onClick={chooseTemplate}
              data-testid="gtd-meeting-pick-template"
            >
              <i className="far fa-clone" /> Insertar plantilla…
            </button>
          )}
          <button
            type="button"
            className="gtd-review__btn"
            onClick={paste}
            data-testid="gtd-meeting-paste"
          >
            <i className="fas fa-paste" /> Pegar transcripción
          </button>
        </div>
        {showText && (
          <>
            <textarea
              className="gtd-tickler__input gtd-meeting__text"
              value={transcript}
              rows={6}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Pega aquí la transcripción o el acta…"
              data-testid="gtd-meeting-transcript"
            />
            {pasteError && <div className="gtd-people__hint">{pasteError}</div>}
          </>
        )}
        {found.length > 0 && (
          <div className="gtd-meeting__tasks" data-testid="gtd-meeting-tasks">
            <div className="gtd-meeting__label">¿Crear como tarea? (van al Inbox)</div>
            {found.map((t, i) => (
              <label key={i} className="gtd-meeting__check" data-testid="gtd-meeting-task">
                <input
                  type="checkbox"
                  checked={picked.has(i)}
                  onChange={() =>
                    setPicked((s) => {
                      const n = new Set(s);
                      if (n.has(i)) n.delete(i);
                      else n.add(i);
                      return n;
                    })
                  }
                />{' '}
                {t.text}
                {t.person && <small className="gtd-people__hint"> · {t.person.title}</small>}
              </label>
            ))}
          </div>
        )}
        <div className="eli-prompt__buttons">
          <button type="button" className="btn" onClick={onClose} data-testid="gtd-meeting-cancel">
            Cancelar
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy || !title.trim()}
            onClick={create}
            data-testid="gtd-meeting-create"
          >
            Crear
          </button>
        </div>
      </div>
    </div>
  );
  return typeof document !== 'undefined' ? createPortal(box, document.body) : box;
};

// Anfitrión (siempre montado con la sesión abierta): abre el cuadro con el evento
// «eli:new-meeting» y con la entrada de actas `?acta=<texto>` / `?acta=portapapeles` (un Atajo de
// iOS con «Abrir URL»; el parámetro se quita de la dirección al leerlo).
export default function GtdNewMeetingHost() {
  const [detail, setDetail] = useState(null);
  const location = useLocation();
  const history = useHistory();
  useEffect(() => {
    const on = (e) => setDetail({ ...(e.detail || {}), rev: Date.now() });
    window.addEventListener('eli:new-meeting', on);
    return () => window.removeEventListener('eli:new-meeting', on);
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(location.search || '');
    if (!params.has('acta')) return;
    const raw = params.get('acta') || '';
    params.delete('acta');
    const rest = params.toString();
    history.replace(`${location.pathname}${rest ? `?${rest}` : ''}${location.hash || ''}`);
    const fromClipboard = /^(portapapeles|clipboard)$/i.test(raw.trim());
    setDetail({
      transcript: fromClipboard ? '' : raw,
      askPaste: fromClipboard,
      rev: Date.now(),
    });
  }, [location, history]);
  if (!detail) return null;
  return <NewMeetingDialog key={detail.rev} detail={detail} onClose={() => setDetail(null)} />;
}
