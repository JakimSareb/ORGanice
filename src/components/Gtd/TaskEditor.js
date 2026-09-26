// ORG Mode para Eli: edición de una tarea en la vista GTD (se despliega bajo la fila)
import React, { useState, useEffect, useRef } from 'react';
import {
  ENERGY_LEVELS,
  EFFORT_OPTIONS,
  PRIORITY_RE,
  hasInboxTag,
  tagsForList,
} from '../../lib/gtd/gtd_model';

const LIST_OPTIONS = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'next', label: 'Next' },
  { id: 'later', label: 'Todo' },
  { id: 'waiting', label: 'Waiting' },
  { id: 'someday', label: 'Someday' },
  { id: 'reference', label: 'Reference' },
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
}) {
  const [title, setTitle] = useState((task.rawTitle || '').replace(PRIORITY_RE, ''));
  const [notes, setNotes] = useState(task.description || '');
  const [list, setList] = useState(currentListOf(task));
  const [area, setArea] = useState(task.ownArea || '');
  const [tags, setTags] = useState(task.ownTags);
  const [tagInput, setTagInput] = useState('');
  const [energy, setEnergy] = useState(task.energy || '');
  const [effort, setEffort] = useState(task.effort || '');
  const [scheduled, setScheduled] = useState(toDateInput(task.scheduled));
  const [deadline, setDeadline] = useState(toDateInput(task.deadline));
  const [project, setProject] = useState(
    task.project ? `${task.project.path}::${task.project.id}` : ''
  );
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
    project,
  };
  const latest = useRef(current);
  latest.current = current;
  const baseline = useRef(null);
  if (baseline.current === null) baseline.current = { ...current };
  const propsRef = useRef({ onSave, task, encrypted });
  propsRef.current = { onSave, task, encrypted };

  const commit = () => {
    const c = latest.current;
    const b = baseline.current;
    const { task: t, onSave: save, encrypted: enc } = propsRef.current;
    const changes = {};
    if (c.title.trim() && c.title !== b.title) changes.rawTitle = c.title.trim();
    let finalTags = c.tagInput.trim()
      ? Array.from(new Set([...c.tags, c.tagInput.trim()]))
      : c.tags;
    if (c.list !== b.list || finalTags.join(' ') !== b.tags.join(' ')) {
      // Inbox = etiqueta @inbox: al sacarla de Inbox se quita; al llevarla a Inbox (fuera del
      // fichero de entrada) se pone
      changes.tags = tagsForList(t, c.list, finalTags);
    }
    if (c.area !== b.area) changes.area = c.area.trim() || null;
    if (c.energy !== b.energy) changes.energy = c.energy || null;
    if (c.effort !== b.effort) changes.effort = c.effort || null;
    if (c.scheduled !== b.scheduled) changes.scheduled = fromDateInput(c.scheduled);
    if (c.deadline !== b.deadline) changes.deadline = fromDateInput(c.deadline);
    if (!enc && c.notes !== b.notes) changes.notes = c.notes;
    if (c.list !== b.list) changes.list = c.list;
    const projectChanged = c.project !== b.project;
    if (!Object.keys(changes).length && !projectChanged) return;
    baseline.current = { ...c, tagInput: '' };
    save(changes, projectChanged ? c.project : undefined);
  };

  // Al desmontarse (se cierra, se abre otra tarea, se cambia de vista…) se guarda
  useEffect(() => () => commit(), []);

  // Clic o toque fuera del editor: se guarda y se cierra. Si es sobre la propia fila de la
  // tarea, ya la cierra ella.
  const editorRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onDown = (e) => {
      const el = editorRef.current;
      if (!el || el.contains(e.target)) return;
      const row = el.previousElementSibling;
      if (row && row.contains(e.target)) return;
      closeRef.current();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
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

  return (
    <div className="gtd-editor" ref={editorRef} onKeyDown={onKeyDown} data-testid="gtd-editor">
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
        placeholder="Título"
        data-testid="gtd-editor-title"
      />
      <textarea
        ref={notesRef}
        className="gtd-editor__notes"
        value={encrypted ? '(contenido cifrado: ábrelo en su fichero para verlo)' : notes}
        disabled={encrypted}
        onChange={(e) => setNotes(e.target.value)}
        onClick={onNotesClick}
        placeholder="Notas"
        rows={12}
        data-testid="gtd-editor-notes"
      />
      {checkboxes.length > 0 && (
        <div className="gtd-checklist" data-testid="gtd-checklist">
          {checkboxes.map((c) => (
            <label key={c.index} className={'gtd-checklist__item' + (c.checked ? ' is-done' : '')}>
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

      {!encrypted && linksOf(notes).length > 0 && (
        <div className="gtd-links" data-testid="gtd-links">
          <span className="gtd-editor__label">Enlaces</span>
          {linksOf(notes).map((l) =>
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
              <button
                key={l.target}
                type="button"
                className="gtd-link"
                title={l.target}
                onClick={() => onOpenLink && onOpenLink(l.target)}
              >
                <i className="fas fa-paperclip" /> {l.label}
              </button>
            )
          )}
        </div>
      )}

      <div className="gtd-editor__row">
        <span className="gtd-editor__label">Lista</span>
        <div className="gtd-seg" role="radiogroup">
          {LIST_OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              className={
                'gtd-seg__btn' + (list === o.id ? ' is-on' : '') + (o.done ? ' is-done-state' : '')
              }
              onClick={() => setList(o.id)}
              data-testid={`gtd-editor-list-${o.id}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="gtd-editor__grid">
        <label>
          <span className="gtd-editor__label">Empieza (Scheduled)</span>
          <input
            type="date"
            value={scheduled}
            onChange={(e) => setScheduled(e.target.value)}
            data-testid="gtd-editor-scheduled"
          />
        </label>
        <label>
          <span className="gtd-editor__label">Vence (Deadline)</span>
          <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </label>
        <label>
          <span className="gtd-editor__label">Área</span>
          <input
            list="gtd-areas"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            placeholder={task.area && !task.ownArea ? `${task.area} (heredada)` : 'Sin área'}
            data-testid="gtd-editor-area"
          />
          <datalist id="gtd-areas">
            {areas.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </label>
        <label>
          <span className="gtd-editor__label">Proyecto</span>
          <select
            value={project}
            onChange={(e) => setProject(e.target.value)}
            data-testid="gtd-editor-project"
          >
            <option value="">Sin proyecto</option>
            {projects.map((p) => (
              <option key={p.key} value={p.key}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="gtd-editor__label">Energía</span>
          <select value={energy} onChange={(e) => setEnergy(e.target.value)}>
            <option value="">—</option>
            {Array.from(new Set([...energyOptions, ...(energy ? [energy] : [])])).map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="gtd-editor__label">Tiempo</span>
          <select value={effort} onChange={(e) => setEffort(e.target.value)}>
            <option value="">—</option>
            {Array.from(new Set([...effortOptions, ...(effort ? [effort] : [])])).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="gtd-editor__row">
        <span className="gtd-editor__label">Etiquetas</span>
        <div className="gtd-tags-edit">
          {contextTags.length > 0 && (
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
          {tags
            .filter((t) => !contextTags.includes(t))
            .map((t) => (
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
              }
            }}
            onBlur={() => tagInput && addTag(tagInput)}
            placeholder="+ etiqueta"
            data-testid="gtd-editor-tag"
          />
          <datalist id="gtd-alltags">
            {allTags.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="gtd-editor__actions">
        <button
          type="button"
          className="gtd-btn gtd-btn--link"
          onClick={withCommit(onOpen)}
          title="Abrir en su fichero"
        >
          <i className="fas fa-external-link-alt" /> Abrir en el fichero
        </button>
        {onArchive && (
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
        <button type="button" className="gtd-btn gtd-btn--link gtd-btn--danger" onClick={onDelete}>
          <i className="fas fa-trash" /> Borrar
        </button>
        <span className="gtd-spacer" />
        <button
          type="button"
          className="gtd-btn"
          onClick={withCommit(onUndo)}
          disabled={!canUndo && !dirty}
          title="Deshacer"
          data-testid="gtd-editor-undo"
        >
          <i className="fas fa-undo" /> Deshacer
        </button>
        <button
          type="button"
          className="gtd-btn"
          onClick={withCommit(onRedo)}
          disabled={!canRedo}
          title="Rehacer"
          data-testid="gtd-editor-redo"
        >
          <i className="fas fa-redo" /> Rehacer
        </button>
      </div>
    </div>
  );
}
