// ORG Mode para Eli: edición de una tarea en la vista GTD (se despliega bajo la fila)
import React, { useState, useEffect, useRef } from 'react';
import { ENERGY_LEVELS, EFFORT_OPTIONS, PRIORITY_RE } from '../../lib/gtd/gtd_model';

const LIST_OPTIONS = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'next', label: 'Next' },
  { id: 'later', label: 'Todo' },
  { id: 'waiting', label: 'Waiting' },
  { id: 'someday', label: 'Someday' },
  { id: 'reference', label: 'Reference' },
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

export const currentListOf = (task) => {
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
  onSave,
  onCancel,
  onOpen,
  onDelete,
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

  const save = () => {
    const changes = {
      rawTitle: title.trim() || task.rawTitle,
      tags: tagInput.trim() ? Array.from(new Set([...tags, tagInput.trim()])) : tags,
      area: area.trim() || null,
      energy: energy || null,
      effort: effort || null,
      scheduled: fromDateInput(scheduled),
      deadline: fromDateInput(deadline),
    };
    if (!encrypted) changes.notes = notes;
    if (list !== currentListOf(task)) changes.list = list;
    const currentProject = task.project ? `${task.project.path}::${task.project.id}` : '';
    onSave(changes, project !== currentProject ? project : undefined);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      save();
    }
  };

  return (
    <div className="gtd-editor" onKeyDown={onKeyDown} data-testid="gtd-editor">
      <input
        ref={titleRef}
        className="gtd-editor__title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            save();
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

      <div className="gtd-editor__row">
        <span className="gtd-editor__label">Lista</span>
        <div className="gtd-seg" role="radiogroup">
          {LIST_OPTIONS.filter((o) => o.id !== 'inbox' || task.isInboxFile).map((o) => (
            <button
              key={o.id}
              type="button"
              className={'gtd-seg__btn' + (list === o.id ? ' is-on' : '')}
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
            {ENERGY_LEVELS.map((e) => (
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
            {Array.from(new Set([...EFFORT_OPTIONS, ...(effort ? [effort] : [])])).map((o) => (
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
          onClick={onOpen}
          title="Abrir en su fichero"
        >
          <i className="fas fa-external-link-alt" /> Abrir en el fichero
        </button>
        <button type="button" className="gtd-btn gtd-btn--link gtd-btn--danger" onClick={onDelete}>
          <i className="fas fa-trash" /> Borrar
        </button>
        <span className="gtd-spacer" />
        <button type="button" className="gtd-btn" onClick={onCancel}>
          Cancelar
        </button>
        <button
          type="button"
          className="gtd-btn gtd-btn--primary"
          onClick={save}
          data-testid="gtd-editor-save"
        >
          Guardar
        </button>
      </div>
    </div>
  );
}
