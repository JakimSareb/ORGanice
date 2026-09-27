// ORG Mode para Eli: edición de una tarea en la vista GTD (se despliega bajo la fila)
import React, { useState, useEffect, useRef } from 'react';
import EliFormatBar from '../EliFormatBar';
import ScheduleField from './ScheduleField';
import { fileLinkTarget } from '../../lib/eli_media';
import { removeLinksToTarget, fileTargetsInText } from '../../lib/eli_attachments';
import EliMedia from '../OrgFile/components/EliMedia';
import {
  ENERGY_LEVELS,
  EFFORT_OPTIONS,
  PRIORITY_RE,
  hasInboxTag,
  tagsForList,
  hasSleepTag,
  SLEEP_TAG,
} from '../../lib/gtd/gtd_model';

const LIST_OPTIONS = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'next', label: 'Next' },
  { id: 'later', label: 'Todo' },
  { id: 'waiting', label: 'Waiting' },
  { id: 'someday', label: 'Someday' },
  { id: 'reference', label: 'No task' },
  // Estados terminados
  { id: 'done', label: 'Done', done: true },
  { id: 'cancelled', label: 'Cancelled', done: true },
];

const pad = (n) => String(n).padStart(2, '0');
export const toDateInput = (d) =>
  d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : '';
export const fromDateInput = (s) => {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

// Casillas de lista: "- [ ] texto", "+ [X] texto", "1. [-] texto"
const CHECK_RE = /^(\s*(?:[-+*]|\d+[.)])\s+\[)([ xX-])(\])(.*)$/;

// Marca o desmarca la casilla de la línea `index` (0 = primera línea)
export const toggleCheckboxLine = (text, index) => {
  const lines = (text || '').split('\n');
  const m = CHECK_RE.exec(lines[index] || '');
  if (!m) return text;
  lines[index] = `${m[1]}${m[2] === ' ' ? 'X' : ' '}${m[3]}${m[4]}`;
  return lines.join('\n');
};

export const checkboxesOf = (text) =>
  (text || '')
    .split('\n')
    .map((line, index) => {
      const m = CHECK_RE.exec(line);
      return m ? { index, checked: m[2] !== ' ', partial: m[2] === '-', label: m[4].trim() } : null;
    })
    .filter(Boolean);

// Enlaces del texto: [[destino][descripción]], [[destino]] y direcciones web sueltas
const ORG_LINK_RE = /\[\[([^\]]+)\](?:\[([^\]]*)\])?\]/g;
const URL_RE = /\bhttps?:\/\/[^\s<>\][)"']+/g;
export const linksOf = (text) => {
  const out = [];
  const seen = new Set();
  const add = (target, label) => {
    if (!target || seen.has(target)) return;
    seen.add(target);
    out.push({ target, label: label || target });
  };
  let m;
  const t = text || '';
  ORG_LINK_RE.lastIndex = 0;
  while ((m = ORG_LINK_RE.exec(t))) add(m[1].trim(), (m[2] || '').trim());
  const rest = t.replace(ORG_LINK_RE, ' ');
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(rest))) add(m[0].replace(/[.,;:]+$/, ''));
  return out;
};
const isWebLink = (target) => /^(https?:|mailto:)/i.test(target);
// ORG Mode para Eli (2.11): enlaces a archivos adjuntos (se ven en «Adjuntos») y el resto
const fileLinksOf = (text) => {
  const labelled = linksOf(text);
  return fileTargetsInText(text).map((file) => {
    const l = labelled.find((x) => !isWebLink(x.target) && fileLinkTarget(x.target) === file);
    return l ? { ...l, file } : { target: `file:${file}`, label: file, file };
  });
};
const otherLinksOf = (text) =>
  linksOf(text).filter((l) => isWebLink(l.target) || !fileLinkTarget(l.target));

export const currentListOf = (task) => {
  if (task.isDone) return task.keyword === 'CANCELLED' ? 'cancelled' : 'done';
  if (hasInboxTag(task)) return 'inbox';
  if (!task.keyword) return task.isInboxFile ? 'inbox' : 'reference';
  return (
    { NEXT: 'next', TODO: 'later', WAITING: 'waiting', MAYBE: 'someday' }[task.keyword] || 'later'
  );
};

export default function TaskEditor({
  task,
  projects,
  areas,
  allTags,
  contextTags = [],
  energyOptions = ENERGY_LEVELS,
  effortOptions = EFFORT_OPTIONS,
  onArchive,
  onOpenLink,
  onSave,
  onClose,
  onOpen,
  onDelete,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  isNew = false,
  onCloseProject,
  mustDecide = false,
  onCancelNew,
  replacesRow = false,
  onAttachFiles,
  onDeleteFile,
}) {
  const [title, setTitle] = useState((task.rawTitle || '').replace(PRIORITY_RE, ''));
  const [notes, setNotes] = useState(task.description || '');
  const [list, setList] = useState(currentListOf(task));
  const [area, setArea] = useState(task.ownArea || '');
  // ORG Mode para Eli: en un proyecto, la etiqueta :sleep: se maneja con «Activo / Dormido»
  const isProject = !!task.isProject;
  const [sleep, setSleep] = useState(isProject && hasSleepTag(task.ownTags));
  const [tags, setTags] = useState(
    isProject ? task.ownTags.filter((t) => t.toLowerCase() !== SLEEP_TAG) : task.ownTags
  );
  const [tagInput, setTagInput] = useState('');
  const [energy, setEnergy] = useState(task.energy || '');
  const [effort, setEffort] = useState(task.effort || '');
  const [scheduled, setScheduled] = useState(toDateInput(task.scheduled));
  const [deadline, setDeadline] = useState(toDateInput(task.deadline));
  // ORG Mode para Eli: repeticiones («+1w», «.+2d»…) de la fecha programada y de la límite
  const [sRepeat, setSRepeat] = useState(task.scheduledRepeat || '');
  const [dRepeat, setDRepeat] = useState(task.deadlineRepeat || '');
  const [star, setStar] = useState(task.priority === 'A');
  const [showContexts, setShowContexts] = useState(false);
  const [project, setProject] = useState(
    task.project ? `${task.project.path}::${task.project.id}` : ''
  );
  // ORG Mode para Eli: convertir la tarea en proyecto ('project') o el proyecto en tarea ('task')
  const [convert, setConvert] = useState('');
  const titleRef = useRef(null);
  const notesRef = useRef(null);
  const encrypted = /-----BEGIN PGP MESSAGE-----/.test(task.description || '');

  useEffect(() => {
    if (titleRef.current) titleRef.current.focus();
  }, []);

  // Clic sobre "[ ]" dentro del cuadro de notas: marcar/desmarcar (como en la vista de hoja)
  const onNotesClick = (e) => {
    const el = e.target;
    if (el.selectionStart !== el.selectionEnd) return;
    const pos = el.selectionStart;
    const before = notes.slice(0, pos);
    const index = before.split('\n').length - 1;
    const column = pos - (before.lastIndexOf('\n') + 1);
    const line = notes.split('\n')[index] || '';
    const m = CHECK_RE.exec(line);
    if (!m) return;
    const open = m[1].length - 1; // posición de "["
    if (column < open || column > open + 3) return;
    const next = toggleCheckboxLine(notes, index);
    setNotes(next);
    requestAnimationFrame(() => {
      if (notesRef.current) notesRef.current.setSelectionRange(pos, pos);
    });
  };
  const checkboxes = encrypted ? [] : checkboxesOf(notes);

  const addTag = (raw) => {
    const t = (raw || '').trim().replace(/[\s:]+/g, '');
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput('');
  };

  const toggleTag = (t) => setTags(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t]);

  // ORG Mode para Eli: sin Guardar ni Cancelar. Lo cambiado se guarda al salir del editor
  // (clic fuera, Esc, Intro, otra tarea, otra vista…). Solo se escriben los campos que han
  // cambiado respecto a como estaban al abrirlo, para no pisar lo que llegue de otro sitio.
  const current = {
    convert,
    sleep,
    star,
    title,
    notes,
    list,
    area,
    tags,
    tagInput,
    energy,
    effort,
    scheduled,
    deadline,
    sRepeat,
    dRepeat,
    project,
  };
  const latest = useRef(current);
  latest.current = current;
  const baseline = useRef(null);
  // En un proyecto nuevo cuenta todo lo rellenado (también lo que ya venía puesto)
  if (baseline.current === null)
    baseline.current = isNew ? { ...current, title: '', area: '' } : { ...current };
  const propsRef = useRef({ onSave, task, encrypted });
  propsRef.current = { onSave, task, encrypted };

  const commit = () => {
    const c = latest.current;
    const b = baseline.current;
    const { task: t, onSave: save, encrypted: enc } = propsRef.current;
    const changes = {};
    if (c.title.trim() && c.title !== b.title) changes.rawTitle = c.title.trim();
    if (c.star !== b.star) changes.priority = c.star ? 'A' : t.priority === 'A' ? null : t.priority;
    let finalTags = c.tagInput.trim()
      ? Array.from(new Set([...c.tags, c.tagInput.trim()]))
      : c.tags;
    if (isProject && c.sleep && c.convert !== 'task') finalTags = [...finalTags, SLEEP_TAG];
    const baseTags = isProject && b.sleep ? [...b.tags, SLEEP_TAG] : b.tags;
    const targetList =
      c.convert === 'project' ? 'project' : c.convert === 'task' ? 'later' : c.list;
    if (
      c.list !== b.list ||
      c.convert !== b.convert ||
      finalTags.join(' ') !== baseTags.join(' ')
    ) {
      // Inbox = etiqueta @inbox: al sacarla de Inbox se quita; al llevarla a Inbox (fuera del
      // fichero de entrada) se pone
      changes.tags = tagsForList(t, targetList, finalTags);
    }
    if (c.area !== b.area) changes.area = c.area.trim() || null;
    if (c.energy !== b.energy) changes.energy = c.energy || null;
    if (c.effort !== b.effort) changes.effort = c.effort || null;
    if (c.scheduled !== b.scheduled) changes.scheduled = fromDateInput(c.scheduled);
    if (c.deadline !== b.deadline) changes.deadline = fromDateInput(c.deadline);
    if (c.sRepeat !== b.sRepeat) changes.scheduledRepeat = c.sRepeat;
    if (c.dRepeat !== b.dRepeat) changes.deadlineRepeat = c.dRepeat;
    if (!enc && c.notes !== b.notes) changes.notes = c.notes;
    if (c.list !== b.list) changes.list = c.list;
    if (c.convert && c.convert !== b.convert) changes.list = targetList;
    const projectChanged = c.project !== b.project;
    if (!Object.keys(changes).length && !projectChanged) return;
    baseline.current = { ...c, tagInput: '' };
    save(changes, projectChanged ? c.project : undefined);
  };

  // Al desmontarse (se cierra, se abre otra tarea, se cambia de vista…) se guarda
  const cancelledRef = useRef(false);
  useEffect(
    () => () => {
      if (!cancelledRef.current) commit();
    },
    []
  );

  // Clic o toque fuera del editor: se guarda y se cierra. Si es sobre la propia fila de la
  // tarea, ya la cierra ella.
  const editorRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const modeRef = useRef({ mustDecide, replacesRow });
  modeRef.current = { mustDecide, replacesRow };
  // ORG Mode para Eli: una tarea recién creada no se cierra al tocar fuera: el editor se «agita»
  // para recordar que hay que Guardar o Cancelar
  const attention = () => {
    const el = editorRef.current;
    if (!el) return;
    el.classList.remove('is-attention');
    void el.offsetWidth; // eslint-disable-line no-void
    el.classList.add('is-attention');
  };
  // ORG Mode para Eli: se cierra con un TOQUE fuera (pulsar y soltar sin moverse). Si el dedo o el
  // ratón se mueven (p. ej. para desplazar la lista), no se cierra.
  useEffect(() => {
    let pending = null;
    const isOutside = (e) => {
      const el = editorRef.current;
      if (!el || el.contains(e.target)) return false;
      // ventanas propias (fecha, repetir, confirmaciones, paleta) abiertas desde el editor
      if (e.target.closest && e.target.closest('.eli-prompt__overlay, .eli-palette__overlay')) {
        return false;
      }
      if (!modeRef.current.replacesRow) {
        const row = el.previousElementSibling;
        if (row && row.contains(e.target)) return false;
      }
      return true;
    };
    const onDown = (e) => {
      pending = isOutside(e) ? { id: e.pointerId, x: e.clientX, y: e.clientY } : null;
    };
    const onMove = (e) => {
      if (pending && e.pointerId === pending.id) {
        if (Math.hypot(e.clientX - pending.x, e.clientY - pending.y) > 10) pending = null;
      }
    };
    const onUp = (e) => {
      const p = pending;
      pending = null;
      if (!p || e.pointerId !== p.id) return;
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) return;
      if (modeRef.current.mustDecide) {
        attention();
        return;
      }
      closeRef.current();
    };
    const onCancel = () => {
      pending = null; // el navegador ha empezado a desplazar la página
    };
    const onScroll = () => {
      pending = null;
    };
    const onAttention = () => modeRef.current.mustDecide && attention();
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onCancel, true);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('eli:gtd-attention', onAttention);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', onCancel, true);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('eli:gtd-attention', onAttention);
    };
  }, []);

  const b0 = baseline.current;
  const dirty = Object.keys(current).some((k) =>
    k === 'tags' ? current.tags.join(' ') !== b0.tags.join(' ') : current[k] !== b0[k]
  );

  const withCommit = (fn) => () => {
    commit();
    if (fn) fn();
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };

  const selectField = ({ icon, placeholder, value, onChange, options, testId, title }) => (
    <label className={'gtd-ed__field' + (value ? ' has-value' : '')} title={title}>
      <i className={icon} aria-hidden="true" />
      <select value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId}>
        <option value="">{placeholder}</option>
        {options.map((o) =>
          typeof o === 'string' ? (
            <option key={o} value={o}>
              {o}
            </option>
          ) : (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          )
        )}
      </select>
    </label>
  );

  const dateField = ({ icon, label, value, onChange, testId }) => (
    <label className={'gtd-ed__field gtd-ed__field--date' + (value ? ' has-value' : '')}>
      <i className={icon} aria-hidden="true" />
      <span className="gtd-ed__field-label">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
      />
      {value && (
        <button
          type="button"
          className="gtd-ed__clear"
          onClick={(e) => {
            e.preventDefault();
            onChange('');
          }}
          aria-label={`Quitar ${label}`}
          title={`Quitar ${label}`}
        >
          ×
        </button>
      )}
    </label>
  );

  const listOptions = LIST_OPTIONS.map((o) => ({ value: o.id, label: o.label }));

  // ORG Mode para Eli: diseño como el de Nirvana: a la izquierda ★, título, etiquetas y notas;
  // a la derecha, tiempo, energía, fechas, lista, proyecto y área.
  return (
    <div
      className={
        'gtd-editor gtd-editor--nirvana' +
        (replacesRow ? ' gtd-editor--inline' : '') +
        (mustDecide ? ' gtd-editor--new' : '')
      }
      ref={editorRef}
      onKeyDown={onKeyDown}
      data-testid="gtd-editor"
    >
      <div className="gtd-ed__main">
        <div className="gtd-ed__title-row">
          <button
            type="button"
            className={'gtd-ed__star' + (star ? ' is-on' : '')}
            onClick={() => setStar(!star)}
            title={star ? 'Quitar la estrella [#A]' : 'Poner la estrella [#A]'}
            aria-pressed={star}
            data-testid="gtd-editor-star"
          >
            <i className={star ? 'fas fa-star' : 'far fa-star'} />
          </button>
          <input
            ref={titleRef}
            className="gtd-editor__title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                onClose();
              }
            }}
            placeholder={isNew ? 'Nombre del proyecto nuevo' : isProject ? 'Proyecto' : 'Tarea'}
            data-testid="gtd-editor-title"
          />
        </div>

        <div className="gtd-ed__tags">
          {tags.map((t) => (
            <span key={t} className="gtd-chip is-on">
              {t}
              <button
                type="button"
                onClick={() => setTags(tags.filter((x) => x !== t))}
                aria-label={`Quitar ${t}`}
              >
                ×
              </button>
            </span>
          ))}
          <input
            list="gtd-alltags"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                addTag(tagInput);
              } else if (e.key === 'Backspace' && !tagInput && tags.length) {
                setTags(tags.slice(0, -1));
              }
            }}
            onBlur={() => tagInput && addTag(tagInput)}
            placeholder={tags.length ? '' : 'Etiquetas (contextos, personas…)'}
            data-testid="gtd-editor-tag"
          />
          <datalist id="gtd-alltags">
            {allTags.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          {contextTags.length > 0 && (
            <button
              type="button"
              className={'gtd-ed__tags-toggle' + (showContexts ? ' is-open' : '')}
              onClick={() => setShowContexts(!showContexts)}
              title="Contextos"
              aria-expanded={showContexts}
              data-testid="gtd-editor-contexts-toggle"
            >
              <i className="fas fa-caret-down" />
            </button>
          )}
        </div>
        {showContexts && contextTags.length > 0 && (
          <div className="gtd-tags-predefined" data-testid="gtd-editor-contexts">
            {contextTags.map((t) => (
              <button
                key={t}
                type="button"
                className={'gtd-chip' + (tags.includes(t) ? ' is-on' : '')}
                onClick={() => toggleTag(t)}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {!encrypted && (
          <EliFormatBar
            compact
            collapsible
            getField={() =>
              document.activeElement === titleRef.current ? titleRef.current : notesRef.current
            }
          />
        )}
        <textarea
          ref={notesRef}
          className="gtd-editor__notes"
          value={encrypted ? '(contenido cifrado: ábrelo en su fichero para verlo)' : notes}
          disabled={encrypted}
          onChange={(e) => setNotes(e.target.value)}
          onClick={onNotesClick}
          placeholder="Notas"
          rows={10}
          data-eli-orgpath={task.path}
          data-testid="gtd-editor-notes"
        />
        {checkboxes.length > 0 && (
          <div className="gtd-checklist" data-testid="gtd-checklist">
            {checkboxes.map((c) => (
              <label
                key={c.index}
                className={'gtd-checklist__item' + (c.checked ? ' is-done' : '')}
              >
                <input
                  type="checkbox"
                  checked={c.checked}
                  ref={(el) => el && (el.indeterminate = c.partial)}
                  onChange={() => setNotes((n) => toggleCheckboxLine(n, c.index))}
                />
                <span>{c.label || '(sin texto)'}</span>
              </label>
            ))}
          </div>
        )}

        {/* ORG Mode para Eli (2.11): adjuntos a la vista (miniaturas, vídeo, audio y ficheros) */}
        {!encrypted && fileLinksOf(notes).length > 0 && (
          <div className="gtd-attachments" data-testid="gtd-attachments">
            <span className="gtd-editor__label">
              <i className="fas fa-paperclip" /> Adjuntos
            </span>
            <div className="gtd-attachments__grid">
              {fileLinksOf(notes).map((l) => (
                <div key={l.target} className="gtd-attachment" data-testid="gtd-attachment">
                  <EliMedia
                    target={l.file}
                    title={l.label !== l.target ? l.label : null}
                    orgPath={task.path}
                  />
                  {onDeleteFile && (
                    <button
                      type="button"
                      className="gtd-link-delete"
                      title="Borrar este archivo adjunto"
                      aria-label={`Borrar ${l.label}`}
                      onClick={async () => {
                        if (await onDeleteFile(l.file)) {
                          setNotes((n) => removeLinksToTarget(n, l.file));
                        }
                      }}
                      data-testid="gtd-link-delete"
                    >
                      <i className="fas fa-trash-alt" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {!encrypted && otherLinksOf(notes).length > 0 && (
          <div className="gtd-links" data-testid="gtd-links">
            <span className="gtd-editor__label">Enlaces</span>
            {otherLinksOf(notes).map((l) =>
              isWebLink(l.target) ? (
                <a
                  key={l.target}
                  href={l.target}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gtd-link"
                  title={l.target}
                >
                  <i className="fas fa-external-link-alt" /> {l.label}
                </a>
              ) : (
                <span key={l.target} className="gtd-link-wrap">
                  <button
                    type="button"
                    className="gtd-link"
                    title={l.target}
                    onClick={() => onOpenLink && onOpenLink(l.target)}
                  >
                    <i className="fas fa-link" /> {l.label}
                  </button>
                </span>
              )
            )}
          </div>
        )}
      </div>

      <div className="gtd-ed__side">
        {selectField({
          icon: 'far fa-clock',
          placeholder: 'tiempo',
          value: effort,
          onChange: setEffort,
          options: Array.from(new Set([...effortOptions, ...(effort ? [effort] : [])])),
          testId: 'gtd-editor-effort',
          title: 'Tiempo (Effort)',
        })}
        {selectField({
          icon: 'fas fa-signal',
          placeholder: 'energía',
          value: energy,
          onChange: setEnergy,
          options: Array.from(new Set([...energyOptions, ...(energy ? [energy] : [])])),
          testId: 'gtd-editor-energy',
          title: 'Energía (Energy)',
        })}
        {dateField({
          icon: 'fas fa-flag',
          label: dRepeat ? 'vence ↻' : 'vence',
          value: deadline,
          onChange: (v) => {
            setDeadline(v);
            if (!v) setDRepeat('');
          },
          testId: 'gtd-editor-deadline',
        })}
        <ScheduleField
          value={scheduled}
          repeat={sRepeat}
          onChange={(v, r) => {
            setScheduled(v);
            setSRepeat(v ? r || '' : '');
          }}
          deadline={deadline}
          deadlineRepeat={dRepeat}
          onDeadline={(v, r) => {
            setDeadline(v);
            setDRepeat(v ? r || '' : '');
          }}
        />

        <div className="gtd-ed__gap" />

        {isProject ? (
          <label className="gtd-ed__field has-value" title="Estado del proyecto">
            <i className={sleep ? 'fas fa-bed' : 'fas fa-project-diagram'} aria-hidden="true" />
            <select
              value={sleep ? 'sleep' : 'active'}
              onChange={(e) => setSleep(e.target.value === 'sleep')}
              data-testid="gtd-editor-project-state"
            >
              <option value="active">Proyecto activo</option>
              <option value="sleep">Proyecto dormido (:sleep:)</option>
            </select>
          </label>
        ) : (
          <label className="gtd-ed__field has-value" title="Lista o estado">
            <i className="far fa-arrow-alt-circle-right" aria-hidden="true" />
            <select
              value={list}
              onChange={(e) => setList(e.target.value)}
              data-testid="gtd-editor-list"
            >
              {listOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="gtd-ed__field has-value" title="Proyecto">
          <i className="fas fa-long-arrow-alt-right" aria-hidden="true" />
          <select
            value={convert ? `__to_${convert}__` : project}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '__to_project__' || v === '__to_task__') {
                setConvert(v === '__to_project__' ? 'project' : 'task');
              } else {
                setConvert('');
                setProject(v);
              }
            }}
            data-testid="gtd-editor-project"
          >
            <option value="">Suelta (sin proyecto)</option>
            {projects.map((p) => (
              <option key={p.key} value={p.key}>
                {p.title}
              </option>
            ))}
            {!isNew && !task.isDone && <option disabled>──────────</option>}
            {!isNew && !task.isDone && (
              <option value={isProject ? '__to_task__' : '__to_project__'}>
                {isProject ? '⇩ Convertir proyecto en tarea' : '⇧ Convertir tarea en proyecto'}
              </option>
            )}
          </select>
        </label>
        <label className={'gtd-ed__field' + (area ? ' has-value' : '')} title="Área">
          <i className="far fa-folder" aria-hidden="true" />
          <input
            list="gtd-areas"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            placeholder={task.area && !task.ownArea ? `${task.area} (heredada)` : 'área'}
            data-testid="gtd-editor-area"
          />
          <datalist id="gtd-areas">
            {areas.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </label>
      </div>

      <div className="gtd-editor__actions">
        <span
          className="gtd-ed__file"
          title={`Fichero: ${task.path}`}
          data-testid="gtd-editor-file"
        >
          <i className="far fa-file-alt" /> {(task.path || '').replace(/^\//, '')}
        </span>
        {onAttachFiles && !encrypted && (
          <label className="gtd-btn gtd-btn--link gtd-ed__attach" title="Adjuntar archivos">
            <i className="fas fa-paperclip" /> Adjuntar
            <input
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                e.target.value = '';
                if (!files.length) return;
                const el = notesRef.current;
                const end = el ? el.value.length : 0;
                onAttachFiles(files, el ? { el, start: end, end } : null);
              }}
              data-testid="gtd-editor-attach"
            />
          </label>
        )}
        {!isNew && (
          <button
            type="button"
            className="gtd-btn gtd-btn--link"
            onClick={withCommit(onOpen)}
            title="Abrir en su fichero"
          >
            <i className="fas fa-external-link-alt" /> Abrir
          </button>
        )}
        {!isNew && onArchive && (
          <button
            type="button"
            className="gtd-btn gtd-btn--link"
            onClick={withCommit(onArchive)}
            title="Archivar (como en Emacs: al fichero _archive)"
            data-testid="gtd-editor-archive"
          >
            <i className="fas fa-archive" /> Archivar
          </button>
        )}
        {!isNew && (
          <button
            type="button"
            className="gtd-btn gtd-btn--link gtd-btn--danger"
            onClick={onDelete}
            title="Borrar la tarea"
          >
            <i className="fas fa-trash" /> Borrar
          </button>
        )}
        <span className="gtd-spacer" />
        {!isNew && (
          <>
            <button
              type="button"
              className="gtd-btn gtd-btn--icon"
              onClick={withCommit(onUndo)}
              disabled={!canUndo && !dirty}
              title="Deshacer"
              aria-label="Deshacer"
              data-testid="gtd-editor-undo"
            >
              <i className="fas fa-undo" />
            </button>
            <button
              type="button"
              className="gtd-btn gtd-btn--icon"
              onClick={withCommit(onRedo)}
              disabled={!canRedo}
              title="Rehacer"
              aria-label="Rehacer"
              data-testid="gtd-editor-redo"
            >
              <i className="fas fa-redo" />
            </button>
          </>
        )}
        <button
          type="button"
          className="gtd-btn gtd-btn--cancel"
          onClick={() => {
            cancelledRef.current = true;
            if (onCancelNew) onCancelNew();
            else onClose();
          }}
          title={
            onCancelNew ? 'Descartar la tarea nueva (se borra)' : 'Descartar los cambios y cerrar'
          }
          data-testid="gtd-editor-cancel"
        >
          Cancelar
        </button>
        <button
          type="button"
          className="gtd-btn gtd-btn--primary"
          onClick={() => onClose()}
          title="Guardar y cerrar"
          data-testid="gtd-editor-save"
        >
          Guardar
        </button>
        {isProject && !isNew && !task.isDone && onCloseProject && (
          <div className="gtd-ed__close-row">
            <button
              type="button"
              className="gtd-ed__close-project"
              onClick={withCommit(onCloseProject)}
              title="Marcar el proyecto como terminado o cancelado"
              data-testid="gtd-editor-close-project"
            >
              Cerrar proyecto…
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
