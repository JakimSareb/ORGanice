// ORG Mode para Eli: edición de una tarea en la vista GTD (se despliega bajo la fila)
import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { focusField } from '../../lib/eli_keyboard_bridge';
import { askPick } from '../../lib/eli_prompt';
import EliFormatBar, { insertNowIn } from '../EliFormatBar';
import { insertLinkInto } from '../../lib/eli_links';
import { insertIntoField } from '../EliTools';
import { continueListOnEnter, insertEmptyTable } from '../../lib/eli_format';
import { noteTextParts, hasNoteLinks, isWebUri } from '../../lib/eli_note_links';
import ScheduleField from './ScheduleField';
import GtdPropertiesDialog from './GtdPropertiesDialog';
import TaskTools from './TaskTools';
import { fileLinkTarget } from '../../lib/eli_media';
import { linkTargetFor } from '../../lib/eli_org_attach';
import { removeLinksToTarget, fileTargetsInText } from '../../lib/eli_attachments';
import EliMedia from '../OrgFile/components/EliMedia';
import EliOrgTable from '../EliOrgTable';
import { tableBlocks, tableLinesAt, replaceTableAt } from '../../lib/eli_org_table';
import { textareaOffsetAt } from '../../lib/eli_notes_caret';
import {
  ENERGY_LEVELS,
  EFFORT_OPTIONS,
  PRIORITY_RE,
  hasInboxTag,
  tagsForList,
  STATUS_PROPERTY,
  SLEEP_STATUS,
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
// ORG Mode para Eli (2.11): enlaces a archivos adjuntos (se ven en «Adjuntos») y el resto
// (3.05) …y los de org-attach ([[attachment:x]], en la carpeta de adjuntos de la tarea)
const isAttachLink = (target) => /^attachment:/i.test(target || '');
const fileLinksOf = (text, header = null) => {
  const labelled = linksOf(text);
  const files = fileTargetsInText(text).map((file) => {
    const l = labelled.find((x) => !isWebLink(x.target) && fileLinkTarget(x.target) === file);
    return l ? { ...l, file } : { target: `file:${file}`, label: file, file };
  });
  labelled
    .filter((l) => isAttachLink(l.target))
    .forEach((l) => {
      const file = linkTargetFor(l.target, header);
      if (file && !files.some((x) => x.file === file)) files.push({ ...l, file, orgAttach: true });
    });
  return files;
};
const otherLinksOf = (text) =>
  linksOf(text).filter(
    (l) => isWebLink(l.target) || (!fileLinkTarget(l.target) && !isAttachLink(l.target))
  );

// (2.16) lista de antes de terminarla, por tarea (para reabrirla en la misma)
const reopenMemory = new Map();

export const currentListOf = (task) => {
  if (task.isDone) return task.keyword === 'CANCELLED' ? 'cancelled' : 'done';
  if (hasInboxTag(task)) return 'inbox';
  if (!task.keyword) return task.isInboxFile ? 'inbox' : 'reference';
  return (
    { NEXT: 'next', TODO: 'later', WAITING: 'waiting', MAYBE: 'someday' }[task.keyword] || 'later'
  );
};

// (3.09) pantalla táctil (móvil o tableta)
const isCoarsePointer = () => {
  try {
    return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  } catch (e) {
    return false;
  }
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
  parentOptions = [],
  parentTaskId = '',
  onGoToParent,
  noAutoFocus = false,
  inTrash = false,
  // (3.05) móvil: se abre en vista previa; título y notas se editan al tocarlos
  preview = false,
  onMove = null, // (3.06) hoja del móvil: «→ Lista GTD» (abre el menú Mover a)
  onBacklinks = null, // (4.35) «Backlinks»: quién enlaza a esta tarea
  onSendTo = null, // (4.35) «Enviar a»: mover la cabecera dentro de otra
  onSaveProperties = null, // (3.11) ver y editar PROPERTIES
  onAddSubtask = null, // (3.38) «＋ Subtarea»: guarda esta y abre el editor de una hija nueva
  objective = null, // (4.07) objetivo del proyecto (nombre) y elegirlo (fichero de horizontes)
  onPickObjective = null,
  onPickTaskLink = null, // (4.11) elegir otra tarea y devolver su enlace [[id:…][Título]]
}) {
  const [propsOpen, setPropsOpen] = useState(false);
  const [editingText, setEditingText] = useState(!preview);
  // (3.06) en el móvil, la vista previa es una hoja a pantalla completa, como Nirvana
  const [sheet] = useState(
    () =>
      !!preview &&
      typeof window !== 'undefined' &&
      !!window.matchMedia &&
      window.matchMedia('(max-width: 720px)').matches
  );
  // Al tocar el título o las notas en vista previa: editable y con el teclado (en el mismo toque,
  // para que iOS lo saque)
  // (3.33) el cursor va siempre donde se ha tocado (antes, tras desplazar la hoja, iOS lo dejaba
  // en el 1.er carácter): se calcula el carácter bajo el dedo y se pone a mano
  const pendingCaret = useRef(null);
  // (3.38) un arrastre (p. ej. deslizar la hoja hacia abajo para cerrarla) no empieza a editar:
  // si no, el pointerup del final enfocaba el título o las notas y salía el teclado
  const sheetDragRef = useRef(false);
  const downAt = useRef(null);
  const markDown = (e) => {
    downAt.current = { x: e.clientX, y: e.clientY };
  };
  const startEditing = (e) => {
    if (editingText) return;
    const d = downAt.current;
    downAt.current = null;
    if (sheetDragRef.current) return;
    if (d && e.clientX !== undefined && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10) return;
    const el = e.currentTarget;
    const pos = el.tagName === 'TEXTAREA' ? textareaOffsetAt(el, e.clientX, e.clientY) : null;
    el.readOnly = false;
    try {
      el.focus();
    } catch (err) {}
    if (pos !== null) {
      pendingCaret.current = { pos, at: Date.now() };
      const put = () => {
        try {
          if (document.activeElement === el) el.setSelectionRange(pos, pos);
        } catch (err) {}
      };
      put();
      requestAnimationFrame(put);
      setTimeout(put, 60);
    }
    setEditingText(true);
  };
  // (3.33) sin los espacios del final (los del alineado de etiquetas de Documentos)
  const [title, setTitle] = useState((task.rawTitle || '').replace(PRIORITY_RE, '').trimEnd());
  const [notes, setNotes] = useState(task.description || '');
  const [list, setList] = useState(currentListOf(task));
  // Lista a la que vuelve al reabrirla (se recuerda aunque el editor se vuelva a crear al guardar)
  const reopenList = useRef(reopenMemory.get(task.key) || currentListOf(task));
  const [area, setArea] = useState(task.ownArea || '');
  // ORG Mode para Eli: en un proyecto, «Activo / Dormido» = propiedad «:STATUS: sleep» (3.17)
  const isProject = !!task.isProject;
  const [sleep, setSleep] = useState(isProject && !!task.ownSleep);
  const [tags, setTags] = useState(task.ownTags);
  const [tagInput, setTagInput] = useState('');
  const [energy, setEnergy] = useState(task.energy || '');
  const [effort, setEffort] = useState(task.effort || '');
  const [scheduled, setScheduled] = useState(toDateInput(task.scheduled));
  const [deadline, setDeadline] = useState(toDateInput(task.deadline));
  // ORG Mode para Eli: repeticiones («+1w», «.+2d»…) de la fecha programada y de la límite
  const [sRepeat, setSRepeat] = useState(task.scheduledRepeat || '');
  // (3.34) hora de la programada ('HH:MM' o '')
  const [sTime, setSTime] = useState(
    task.scheduled && task.scheduledTimed
      ? `${pad(task.scheduled.getHours())}:${pad(task.scheduled.getMinutes())}`
      : ''
  );
  const [dRepeat, setDRepeat] = useState(task.deadlineRepeat || '');
  const [star, setStar] = useState(task.priority === 'A');
  const [showContexts, setShowContexts] = useState(false);
  const [project, setProject] = useState(
    task.project ? `${task.project.path}::${task.project.id}` : ''
  );
  // ORG Mode para Eli: convertir la tarea en proyecto ('project') o el proyecto en tarea ('task')
  const [convert, setConvert] = useState('');
  // (2.18) «Subtarea de»: id de la tarea madre ('' = ninguna)
  // (los ids de los encabezados son números; el desplegable trabaja con texto)
  const [parent, setParent] = useState(parentTaskId ? String(parentTaskId) : '');
  const titleRef = useRef(null);
  const notesRef = useRef(null);
  const encrypted = /-----BEGIN PGP MESSAGE-----/.test(task.description || '');

  // (3.17) tarea o proyecto nuevo (también desde una plantilla): el cursor va directo al título,
  // al final de lo que traiga, en el mismo paso en que aparece (así iOS mantiene el teclado)
  useLayoutEffect(() => {
    if (isNew && !noAutoFocus && !preview) focusField(titleRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isNew && !noAutoFocus && !preview) return;
    // (2.18) al llegar desde «↳ tarea madre» no se pone el cursor en el título: así Alt+← vuelve
    if (noAutoFocus || preview) {
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      return;
    }
    if (titleRef.current) titleRef.current.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clic sobre "[ ]" dentro del cuadro de notas: marcar/desmarcar (como en la vista de hoja)
  const onNotesClick = (e) => {
    const el = e.target;
    // (3.33) el clic que sigue al toque que empezó a editar: el cursor, donde se tocó
    const pc = pendingCaret.current;
    pendingCaret.current = null;
    if (pc && Date.now() - pc.at < 800) {
      try {
        el.setSelectionRange(pc.pos, pc.pos);
      } catch (err) {}
    }
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
  // (3.09) en la vista previa, las notas con enlaces se pintan aparte (enlaces clicables)
  const notesPreviewLinks = !editingText && !encrypted && hasNoteLinks(notes);

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
    sTime,
    dRepeat,
    project,
    parent,
  };
  const latest = useRef(current);
  latest.current = current;
  const baseline = useRef(null);
  // En un proyecto nuevo cuenta todo lo rellenado (también lo que ya venía puesto)
  if (baseline.current === null)
    baseline.current = isNew ? { ...current, title: '', area: '' } : { ...current };
  const propsRef = useRef({ onSave, task, encrypted });
  propsRef.current = { onSave, task, encrypted, parentOptions };

  const commit = () => {
    const c = latest.current;
    const b = baseline.current;
    const { task: t, onSave: save, encrypted: enc, parentOptions: pOpts } = propsRef.current;
    const changes = {};
    if (c.title.trim() && c.title !== b.title) changes.rawTitle = c.title.trim();
    if (c.star !== b.star) changes.priority = c.star ? 'A' : t.priority === 'A' ? null : t.priority;
    let finalTags = c.tagInput.trim()
      ? Array.from(new Set([...c.tags, c.tagInput.trim()]))
      : c.tags;
    const baseTags = b.tags;
    const targetList =
      c.convert === 'project' ? 'project' : c.convert === 'task' ? 'later' : c.list;
    if (
      c.list !== b.list ||
      c.convert !== b.convert ||
      finalTags.join(' ') !== baseTags.join(' ')
    ) {
      // Inbox = etiqueta @inbox: al sacarla de Inbox se quita; al llevarla a Inbox (fuera del
      // fichero de entrada) se pone. (2.18) Solo al cambiar de lista y solo sobre las etiquetas
      // que ya tenía: las puestas a mano ahora no se quitan nunca.
      const listChanged = c.list !== b.list || c.convert !== b.convert;
      if (listChanged) {
        const added = finalTags.filter((x) => !baseTags.includes(x));
        const kept = finalTags.filter((x) => baseTags.includes(x));
        const moved = tagsForList(t, targetList, kept);
        changes.tags = Array.from(new Set([...moved, ...added]));
      } else {
        changes.tags = finalTags;
      }
    }
    if (c.area !== b.area) changes.area = c.area.trim() || null;
    if (isProject) {
      const wantSleep = c.sleep && c.convert !== 'task';
      if (wantSleep !== (b.sleep && b.convert !== 'task'))
        changes.props = { [STATUS_PROPERTY]: wantSleep ? SLEEP_STATUS : null };
    }
    if (c.energy !== b.energy) changes.energy = c.energy || null;
    if (c.effort !== b.effort) changes.effort = c.effort || null;
    if (c.scheduled !== b.scheduled) changes.scheduled = fromDateInput(c.scheduled);
    if (c.deadline !== b.deadline) changes.deadline = fromDateInput(c.deadline);
    if (c.sRepeat !== b.sRepeat) changes.scheduledRepeat = c.sRepeat;
    if (c.sTime !== b.sTime) changes.scheduledTime = c.sTime;
    if (c.dRepeat !== b.dRepeat) changes.deadlineRepeat = c.dRepeat;
    if (!enc && c.notes !== b.notes) changes.notes = c.notes;
    if (c.list !== b.list) changes.list = c.list;
    if (c.convert && c.convert !== b.convert) changes.list = targetList;
    const projectChanged = c.project !== b.project;
    // (2.18) tarea ⇄ subtarea (no a la vez que se cambia de proyecto o se convierte)
    if (c.parent !== b.parent && !projectChanged && !c.convert) {
      const opt = (pOpts || []).find((o) => String(o.id) === c.parent);
      changes.parentTaskId = c.parent ? (opt ? opt.id : null) : null;
      if (c.parent && !opt) delete changes.parentTaskId;
    }
    if (!Object.keys(changes).length && !projectChanged) return;
    // (si «Subtarea de» no se ha aplicado, se queda como pendiente para la próxima vez)
    baseline.current = {
      ...c,
      tagInput: '',
      parent: changes.parentTaskId !== undefined || c.parent === b.parent ? c.parent : b.parent,
    };
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
  const sheetCloseRef = useRef(null);
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
      // (3.10) la hoja del móvil va en un portal: su «hermano» es toda la app, no la fila
      if (!modeRef.current.replacesRow && !sheet) {
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
      // (3.10) hoja del móvil: tocar fuera = guardar y cerrar (lo que hacía «Hecho»)
      if (sheet && sheetCloseRef.current) {
        e.preventDefault();
        // que ese mismo toque no abra/seleccione lo que hay debajo
        const eat = (ev) => {
          ev.stopPropagation();
          ev.preventDefault();
        };
        document.addEventListener('click', eat, { capture: true, once: true });
        setTimeout(() => document.removeEventListener('click', eat, true), 450);
        sheetCloseRef.current();
        return;
      }
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

  // (4.01) fecha y hora de ahora: en el título si es donde está el cursor; si no, en las notas
  // (si no se estaban editando, al final)
  const insertNow = (e) => {
    if (e) e.stopPropagation();
    const t = titleRef.current;
    const el = t && document.activeElement === t ? t : notesRef.current;
    if (!el) return;
    if (document.activeElement !== el) {
      try {
        el.setSelectionRange(el.value.length, el.value.length);
      } catch (err) {}
    }
    el.readOnly = false;
    setEditingText(true);
    insertNowIn(el);
  };
  // (4.11) enlaces: campo con el cursor (título o notas; si no, las notas, al final)
  const linkField = () => {
    const t = titleRef.current;
    const el = t && document.activeElement === t ? t : notesRef.current;
    if (!el) return null;
    if (document.activeElement !== el) {
      try {
        el.setSelectionRange(el.value.length, el.value.length);
      } catch (err) {}
    }
    el.readOnly = false;
    setEditingText(true);
    return el;
  };
  // 🔗 enlace web o de Org (diálogo; con un enlace copiado, ya viene puesto)
  const insertLink = (e) => {
    if (e) e.stopPropagation();
    insertLinkInto(linkField(), insertIntoField);
  };
  // enlace a otra tarea (se le pone :ID: si no lo tiene): para saltar entre tareas
  const insertTaskLink = async (e) => {
    if (e) e.stopPropagation();
    const el = linkField();
    if (!el || !onPickTaskLink) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const text = await onPickTaskLink();
    if (text) insertIntoField(el, text, start, end);
  };
  // (4.09) tabla vacía en las notas (como Formato › Tabla de Documentos) y su 1.ª celda abierta
  const insertTable = (e) => {
    if (e) e.stopPropagation();
    const el = notesRef.current;
    if (!el) return;
    const cur = document.activeElement === el ? el.selectionStart : null;
    const r = insertEmptyTable(el.value, cur);
    setNotes(r.value);
    let tries = 0;
    const open = () => {
      const box = document.querySelector('[data-testid="gtd-editor-tables"]');
      const tables = box ? box.querySelectorAll('[data-testid="gtd-editor-table"]') : [];
      const t = tables[Math.min(r.ord, tables.length - 1)];
      const cell = t && t.querySelector('[data-testid="eli-table-cell"]');
      if (cell) cell.click();
      else if (tries++ < 20) setTimeout(open, 50);
    };
    setTimeout(open, 60);
  };
  // (4.09) Área: buscador con las áreas que ya hay (como el del 🎯 Objetivo) o escribir una nueva
  const pickArea = async () => {
    const items = (areas || []).map((a) => ({ id: a, label: a }));
    if (area) items.unshift({ id: '__none', label: 'Sin área', hint: 'Quitar el área' });
    const r = await askPick({
      title: 'Área',
      message: task.area && !task.ownArea ? `Heredada: ${task.area}` : '',
      placeholder: 'Buscar o escribir un área…',
      items,
      emptyText: 'No hay áreas todavía: escribe una nueva.',
      newItem: (q) => ({ label: `＋ Nueva área: ${q}` }),
    });
    if (r == null) return;
    if (r === '__none') setArea('');
    else if (typeof r === 'object') setArea(r.new);
    else setArea(r);
  };
  const withCommit = (fn) => () => {
    commit();
    if (fn) fn();
  };

  // ORG Mode para Eli (2.15): una tarea nueva que se cierra sin título no se crea (se borra)
  const closeEditor = () => {
    if (mustDecide && onCancelNew && !latest.current.title.trim()) {
      cancelledRef.current = true;
      onCancelNew();
      return;
    }
    onClose();
  };

  // (3.09) Hoja del móvil: arrastrarla hacia abajo (desde arriba del todo) = guardar y cerrar,
  // como las hojas de iOS
  const closeEditorRef = useRef(closeEditor);
  closeEditorRef.current = closeEditor;
  sheetCloseRef.current = closeEditor;
  useEffect(() => {
    const el = editorRef.current;
    if (!sheet || !el) return undefined;
    let start = null;
    let dy = 0;
    let dragging = false;
    const reset = () => {
      if (sheetDragRef.current) setTimeout(() => (sheetDragRef.current = false), 400);
      el.style.transition = 'transform 0.2s ease';
      el.style.transform = '';
      start = null;
      dy = 0;
      dragging = false;
    };
    const onStart = (e) => {
      if (e.touches.length !== 1 || el.scrollTop > 0) return;
      const t = e.target;
      // no al escribir (el campo de texto con el foco) ni en menús o tablas. (3.33) Sí desde los
      // campos que se eligen (fecha, proyecto, lista…): un toque los abre; arrastrar cierra
      if (t && t.closest && t.closest('.eli-org-table, .gtd-sched__menu')) return;
      if (
        t &&
        t === document.activeElement &&
        (t.tagName === 'TEXTAREA' ||
          (t.tagName === 'INPUT' && !/^(date|datetime-local|time|checkbox|radio)$/i.test(t.type)))
      )
        return;
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      dy = 0;
      dragging = false;
    };
    const onMove = (e) => {
      if (!start) return;
      const mx = e.touches[0].clientX - start.x;
      const my = e.touches[0].clientY - start.y;
      if (!dragging) {
        if (my < 8 && Math.abs(mx) < 8) return;
        if (my < 8 || Math.abs(mx) > my || el.scrollTop > 0) {
          start = null;
          return;
        }
        dragging = true;
        sheetDragRef.current = true;
      }
      dy = Math.max(0, my);
      if (e.cancelable) e.preventDefault();
      el.style.transition = 'none';
      el.style.transform = `translateY(${dy}px)`;
    };
    const onEnd = () => {
      if (sheetDragRef.current) setTimeout(() => (sheetDragRef.current = false), 400);
      if (!start) return;
      const close = dragging && dy > Math.min(140, window.innerHeight * 0.18);
      if (close) {
        el.style.transition = 'transform 0.18s ease';
        el.style.transform = `translateY(${window.innerHeight}px)`;
        start = null;
        setTimeout(() => closeEditorRef.current(), 160);
      } else reset();
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', reset);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', reset);
    };
  }, [sheet]);

  // (3.0) Como Nirvana: Intro (en el título) o Mayús+Intro (en cualquier campo) guardan.
  // (3.38) Esc también guarda y cierra; solo el botón Cancelar descarta
  const cancelEditor = () => {
    cancelledRef.current = true;
    if (onCancelNew) onCancelNew();
    else onClose();
  };
  // (3.07) en el ordenador, Tab recorre Título › Etiquetas › Notas › Estado › Proyecto
  // (Mayús+Tab al revés); desde ahí y en el resto de campos, el orden normal de la ventana.
  const TAB_ORDER = [
    ['gtd-editor-title'],
    ['gtd-editor-tag', 'gtd-editor-area-add', 'gtd-editor-area-chip'],
    ['gtd-editor-notes'],
    ['gtd-editor-list', 'gtd-editor-project-state'],
    ['gtd-editor-project'],
    // (4.19) …y sigue: tiempo › energía › vence › empieza › Guardar. «vence» (campo de fecha)
    // solo se entra desde el anterior: dentro conserva el Tab por sus partes (día/mes/año)
    ['gtd-editor-effort'],
    ['gtd-editor-energy'],
    ['gtd-editor-deadline'],
    ['gtd-editor-schedule-btn'],
    ['gtd-editor-save'],
  ];
  const tabTarget = (ids) => {
    const root = editorRef.current;
    if (!root) return null;
    for (const id of ids) {
      const el = root.querySelector(`[data-testid="${id}"]`);
      if (el && !el.disabled && el.offsetParent !== null) return el;
    }
    return null;
  };
  const onTabKey = (e) => {
    if (sheet || e.ctrlKey || e.metaKey || e.altKey) return false;
    const id = e.target && e.target.getAttribute && e.target.getAttribute('data-testid');
    if (id === 'gtd-editor-deadline') return false;
    const idx = TAB_ORDER.findIndex((ids) => ids.includes(id));
    if (idx < 0) return false;
    const step = e.shiftKey ? -1 : 1;
    for (let i = idx + step; i >= 0 && i < TAB_ORDER.length; i += step) {
      const el = tabTarget(TAB_ORDER[i]);
      if (el) {
        e.preventDefault();
        e.stopPropagation();
        el.focus();
        if (el.readOnly) startEditing({ currentTarget: el });
        return true;
      }
    }
    return false;
  };
  const onKeyDown = (e) => {
    if (e.key === 'Tab' && onTabKey(e)) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeEditor();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || e.shiftKey)) {
      if (e.nativeEvent && e.nativeEvent.isComposing) return;
      // (3.09) en el móvil, el teclado pone Mayúsculas tras un salto de línea y el 2.º Intro
      // llega como Mayús+Intro: dentro de las notas solo es un salto de línea
      if (
        e.shiftKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        e.target &&
        e.target.tagName === 'TEXTAREA' &&
        isCoarsePointer()
      )
        return;
      e.preventDefault();
      e.stopPropagation();
      closeEditor();
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
      {/* (3.37) sin botón «Hoy» (solo el icono del campo) */}
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

  // (2.16) Casilla para terminar (DONE; con Mayúsculas, CANCELLED) en el sitio de la ★, que pasa
  // abajo. Se guarda al momento y el editor no se cierra: se queda en gris.
  const showDone = !isNew && !isProject && !!onSave;
  const finished = list === 'done' || list === 'cancelled';
  const renderStar = () => (
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
  );
  const toggleDone = (e) => {
    const target = finished
      ? baseline.current && !['done', 'cancelled'].includes(reopenList.current)
        ? reopenList.current
        : 'later'
      : e && e.shiftKey
      ? 'cancelled'
      : 'done';
    if (!finished) {
      reopenList.current = list;
      reopenMemory.set(task.key, list);
    }
    commit();
    latest.current = { ...latest.current, list: target };
    baseline.current = { ...baseline.current, list: target };
    setList(target);
    // Al reabrirla, las etiquetas de su lista (p. ej. @inbox), como al cambiarla de lista
    onSave(finished ? { list: target, tags: tagsForList(task, target, tags) } : { list: target });
  };

  const renderListField = () => (
    <label className="gtd-ed__field has-value" title="Lista o estado">
      <i className="far fa-arrow-alt-circle-right" aria-hidden="true" />
      <select value={list} onChange={(e) => setList(e.target.value)} data-testid="gtd-editor-list">
        {listOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
  // ORG Mode para Eli: diseño como el de Nirvana: a la izquierda ★, título, etiquetas y notas;
  // a la derecha, tiempo, energía, fechas, lista, proyecto y área.
  const editorEl = (
    <div
      className={
        'gtd-editor gtd-editor--nirvana' +
        (sheet ? ' gtd-editor--sheet' : '') +
        (editingText ? ' is-editing-text' : '') +
        (replacesRow ? ' gtd-editor--inline' : '') +
        (mustDecide ? ' gtd-editor--new' : '') +
        (finished && showDone ? ' is-finished' : '') +
        (finished && showDone && list === 'cancelled' ? ' is-cancelled' : '')
      }
      ref={editorRef}
      onKeyDown={onKeyDown}
      data-testid="gtd-editor"
    >
      {/* (3.10) pestaña tipo iOS: sin «Hecho»; se cierra (y guarda) deslizando hacia abajo o
          tocando fuera */}
      {sheet && (
        <div className="gtd-sheet__top" data-testid="gtd-sheet-grabber">
          <span className="gtd-sheet__grabber" aria-hidden="true" />
        </div>
      )}
      <div className="gtd-ed__main">
        <div className="gtd-ed__title-row">
          {showDone ? (
            <button
              type="button"
              className={'gtd-ed__done' + (finished ? ' is-on' : '')}
              onClick={toggleDone}
              title={
                finished
                  ? 'Volver a abrir la tarea'
                  : 'Terminar la tarea (DONE); con Mayúsculas, cancelarla (CANCELLED)'
              }
              aria-pressed={finished}
              data-testid="gtd-editor-done"
            >
              {list === 'cancelled' ? (
                <i className="fas fa-times" />
              ) : finished ? (
                <i className="fas fa-check" />
              ) : null}
            </button>
          ) : (
            renderStar()
          )}
          <input
            ref={titleRef}
            className={'gtd-editor__title' + (editingText ? '' : ' is-preview')}
            readOnly={!editingText}
            onPointerDown={markDown}
            onPointerUp={startEditing}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                closeEditor();
              }
            }}
            placeholder={
              isNew
                ? isProject
                  ? 'Nombre del proyecto nuevo'
                  : 'Tarea nueva'
                : isProject
                ? 'Proyecto'
                : 'Tarea'
            }
            data-testid="gtd-editor-title"
          />
          {sheet && showDone && renderStar()}
        </div>
        {sheet && !isProject && (
          <div className="gtd-sheet__row gtd-sheet__status" data-testid="gtd-sheet-status">
            <span className="gtd-sheet__icon is-blue" aria-hidden="true">
              »
            </span>
            {renderListField()}
          </div>
        )}

        {finished && (
          <div className="gtd-ed__finished" data-testid="gtd-editor-finished">
            {list === 'cancelled' ? 'Cancelada' : 'Terminada'}
          </div>
        )}
        <div className="gtd-ed__tags">
          {sheet && <i className="fas fa-tag gtd-sheet__icon" aria-hidden="true" />}
          {!sheet && showDone && renderStar()}
          {/* (3.06) el área va dentro del cuadro de etiquetas, como un chip distinto */}
          {area ? (
            <span className="gtd-chip gtd-chip--area" title="Área (tocar para cambiarla)">
              <span
                className="gtd-chip__label"
                role="button"
                tabIndex={0}
                onClick={pickArea}
                data-testid="gtd-editor-area-chip"
              >
                <i className="far fa-folder" aria-hidden="true" /> {area}
              </span>
              <button type="button" onClick={() => setArea('')} aria-label="Quitar el área">
                ×
              </button>
            </span>
          ) : (
            <button
              type="button"
              className={'gtd-chip gtd-chip--area is-empty'}
              onClick={pickArea}
              title={task.area ? `Área heredada: ${task.area}` : 'Poner un área'}
              data-testid="gtd-editor-area-add"
            >
              <i className="far fa-folder" aria-hidden="true" />{' '}
              {task.area && !task.ownArea ? task.area : 'Área'}
            </button>
          )}
          {/* (4.07) objetivo del proyecto (:OBJETIVO:), elegido de la lista de horizontes */}
          {isProject && onPickObjective && (
            <button
              type="button"
              className={'gtd-chip gtd-chip--area' + (objective ? '' : ' is-empty')}
              onClick={onPickObjective}
              title={
                objective ? `Objetivo: ${objective} (tocar para cambiarlo)` : 'Poner un objetivo'
              }
              data-testid="gtd-editor-objective"
            >
              <i className="fas fa-bullseye" aria-hidden="true" /> {objective || 'Objetivo'}
            </button>
          )}
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
              if ((e.key === 'Enter' && !e.shiftKey) || e.key === ',' || e.key === ' ') {
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
          {sheet && (tags.length > 0 || area) && (
            <button
              type="button"
              className="gtd-sheet__clear"
              onClick={() => {
                setTags([]);
                setArea('');
              }}
              title="Quitar etiquetas y área"
              aria-label="Quitar etiquetas y área"
              data-testid="gtd-sheet-clear-tags"
            >
              ✕
            </button>
          )}
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
            getListField={() => notesRef.current}
            hideNow
            // (3.04) deshacer y rehacer, antes del botón de formato. (4.01) Y luego, el reloj:
            // fecha y hora de ahora en el cursor (título o notas)
            before={
              <>
                {!isNew && onUndo ? (
                  <>
                    <button
                      type="button"
                      className="eli-format-bar__btn"
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
                      className="eli-format-bar__btn"
                      onClick={withCommit(onRedo)}
                      disabled={!canRedo}
                      title="Rehacer"
                      aria-label="Rehacer"
                      data-testid="gtd-editor-redo"
                    >
                      <i className="fas fa-redo" />
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  className="eli-format-bar__btn"
                  onClick={insertNow}
                  title="Insertar la fecha y la hora de ahora"
                  aria-label="Insertar la fecha y la hora de ahora"
                  data-testid="gtd-editor-now"
                >
                  <i className="far fa-clock" />
                </button>
                <button
                  type="button"
                  className="eli-format-bar__btn"
                  onClick={insertTable}
                  title="Insertar una tabla"
                  aria-label="Insertar una tabla"
                  data-testid="gtd-editor-table-btn"
                >
                  <i className="fas fa-table" />
                </button>
                <button
                  type="button"
                  className="eli-format-bar__btn"
                  onClick={insertLink}
                  title="Insertar un enlace"
                  aria-label="Insertar un enlace"
                  data-testid="gtd-editor-link"
                >
                  <i className="fas fa-link" />
                </button>
                {onPickTaskLink && !isNew && (
                  <button
                    type="button"
                    className="eli-format-bar__btn"
                    onClick={insertTaskLink}
                    title="Insertar un enlace a otra tarea"
                    aria-label="Insertar un enlace a otra tarea"
                    data-testid="gtd-editor-link-task"
                  >
                    <i className="fas fa-sitemap" />
                  </button>
                )}
              </>
            }
          />
        )}
        {/* (3.09) vista previa (móvil) con enlaces: se pueden pulsar sin entrar en edición; un
            toque en el resto edita, con el cursor donde se ha tocado */}
        {notesPreviewLinks && (
          <div
            className="gtd-editor__notes gtd-editor__notes-preview is-preview"
            onClick={(e) => {
              if (e.target.closest && e.target.closest('.gtd-note-link')) return;
              let pos = notes.length;
              try {
                const r = document.caretRangeFromPoint
                  ? document.caretRangeFromPoint(e.clientX, e.clientY)
                  : null;
                const node = r && r.startContainer;
                const seg =
                  node && (node.nodeType === 3 ? node.parentElement : node).closest('[data-raw]');
                if (seg) pos = Number(seg.dataset.raw) + (r ? r.startOffset : 0);
              } catch (err) {}
              const el = notesRef.current;
              if (!el) return;
              el.readOnly = false;
              try {
                el.focus();
                el.setSelectionRange(pos, pos);
              } catch (err) {}
              setEditingText(true);
            }}
            data-testid="gtd-editor-notes-preview"
          >
            {noteTextParts(notes).map((p, i) =>
              !p.link ? (
                <span key={i} data-raw={p.start}>
                  {p.text}
                </span>
              ) : isWebUri(p.link) ? (
                <a
                  key={i}
                  className="gtd-note-link"
                  href={p.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="gtd-note-link"
                >
                  {p.text}
                </a>
              ) : (
                <span
                  key={i}
                  className="gtd-note-link"
                  role="link"
                  tabIndex={0}
                  onClick={(e) => {
                    e.preventDefault();
                    if (onOpenLink) onOpenLink(p.link);
                  }}
                  data-testid="gtd-note-link"
                >
                  {p.text}
                </span>
              )
            )}
          </div>
        )}
        <textarea
          ref={notesRef}
          className={
            'gtd-editor__notes' +
            (editingText ? '' : ' is-preview') +
            (notesPreviewLinks ? ' is-behind-preview' : '')
          }
          readOnly={!editingText}
          onPointerDown={markDown}
          onPointerUp={startEditing}
          value={encrypted ? '(contenido cifrado: ábrelo en su fichero para verlo)' : notes}
          disabled={encrypted}
          onChange={(e) => setNotes(e.target.value)}
          // (2.16) Intro en una línea de lista: la siguiente empieza con el mismo marcador
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
            if (e.nativeEvent && e.nativeEvent.isComposing) return;
            if (e.keyCode === 229) return; // (4.18) teclado del iPhone escribiendo una palabra
            const el = e.currentTarget;
            if (el.selectionStart !== el.selectionEnd) return;
            const r = continueListOnEnter(el.value, el.selectionStart);
            if (!r) return;
            e.preventDefault();
            // Se cambia el campo ya (con el cursor en su sitio) y después el estado, así no se
            // pierde nada de lo que se escribe justo a continuación
            el.value = r.value;
            try {
              el.setSelectionRange(r.pos, r.pos);
            } catch (err) {}
            setNotes(r.value);
          }}
          onClick={onNotesClick}
          placeholder="Notas"
          rows={10}
          data-eli-orgpath={task.path}
          data-testid="gtd-editor-notes"
        />
        {/* (3.46) «Vista previa» ya no va sobre las notas, sino sobre lo que se ve ya presentado
            debajo de ellas (tablas y casillas) */}
        {!encrypted && (tableBlocks(notes).length > 0 || checkboxes.length > 0) && (
          <span
            className="gtd-ed__preview-label gtd-ed__preview-label--below"
            data-testid="gtd-editor-preview-label"
          >
            Vista previa
          </span>
        )}
        {/* (3.02) tablas Org de las notas, vistas como tabla (se pueden editar en su sitio) */}
        {!encrypted && tableBlocks(notes).length > 0 && (
          <div className="gtd-editor__tables" data-testid="gtd-editor-tables">
            {tableBlocks(notes).map((b, i) => (
              <EliOrgTable
                key={i}
                lines={tableLinesAt(notes, i)}
                editable
                commitOnPointerDown
                onChange={(next) => setNotes((n) => replaceTableAt(n, i, next))}
                testId="gtd-editor-table"
              />
            ))}
          </div>
        )}
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
        {!encrypted && fileLinksOf(notes, task.header).length > 0 && (
          <div className="gtd-attachments" data-testid="gtd-attachments">
            <span className="gtd-editor__label">
              <i className="fas fa-paperclip" /> Adjuntos
            </span>
            <div className="gtd-attachments__grid">
              {fileLinksOf(notes, task.header).map((l) => (
                <div key={l.target} className="gtd-attachment" data-testid="gtd-attachment">
                  <EliMedia
                    target={l.file}
                    title={l.label !== l.target ? l.label : null}
                    orgPath={task.path}
                  />
                  {onDeleteFile && !l.orgAttach && (
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
            if (!v) setSTime('');
          }}
          time={sTime}
          onTime={setSTime}
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
              <option value="sleep">Proyecto dormido</option>
            </select>
          </label>
        ) : sheet ? null : (
          renderListField()
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
        {/* (2.18) Subtarea de otra tarea abierta del mismo proyecto o fichero */}
        {!isProject && !isNew && (parentOptions.length > 0 || parentTaskId) && (
          <label className={'gtd-ed__field' + (parent ? ' has-value' : '')} title="Subtarea de">
            <i className="fas fa-level-up-alt fa-rotate-90" aria-hidden="true" />
            <select
              value={parent}
              onChange={(e) => setParent(e.target.value)}
              data-testid="gtd-editor-parent"
              aria-label="Subtarea de"
            >
              <option value="">Subtarea de: — ninguna —</option>
              {parentTaskId && !parentOptions.some((o) => o.id === parentTaskId) && (
                <option value={String(parentTaskId)}>Subtarea de: (su madre actual)</option>
              )}
              {parentOptions.map((o) => (
                <option key={o.id} value={String(o.id)}>
                  Subtarea de: {o.title}
                </option>
              ))}
            </select>
            {parentTaskId && parent === String(parentTaskId) && onGoToParent && (
              <button
                type="button"
                className="gtd-btn gtd-btn--link gtd-ed__go-parent"
                onClick={(e) => {
                  e.preventDefault();
                  commit();
                  onGoToParent();
                }}
                title="Ir a la tarea madre (Alt+← vuelve)"
                data-testid="gtd-editor-go-parent"
              >
                <i className="fas fa-external-link-alt" />
              </button>
            )}
          </label>
        )}
      </div>

      {/* (4.13) pie del editor: herramientas, botones y, siempre la última, Cancelar + Guardar */}
      <div className="gtd-editor__footer" data-testid="gtd-editor-footer">
        {/* (4.11) reloj, enlace propio y exportar (PDF / Org) */}
        {!isNew && <TaskTools task={task} commit={commit} />}

        <div className="gtd-editor__actions">
          {/* (3.44) «＋ Subtarea» otra vez al principio de la línea de botones */}
          {!isNew && onAddSubtask && (
            <button
              type="button"
              className="gtd-btn gtd-btn--link"
              onClick={withCommit(onAddSubtask)}
              title={
                isProject
                  ? 'Guardar y añadir una acción al proyecto'
                  : 'Guardar y añadir una subtarea'
              }
              data-testid="gtd-editor-add-subtask"
            >
              <i className="fas fa-plus" /> Subtarea
            </button>
          )}
          {/* (3.44) el nombre del fichero abre la tarea en su fichero (antes, «Abrir») */}
          {onOpen && !isNew ? (
            <button
              type="button"
              className="gtd-ed__file gtd-ed__file--open"
              title={`Fichero: ${task.path} · Abrir en su fichero`}
              onClick={(e) => {
                commit();
                onOpen(e);
              }}
              data-testid="gtd-editor-file"
            >
              <i className="far fa-file-alt" /> {(task.path || '').replace(/^\//, '')}
            </button>
          ) : (
            <span
              className="gtd-ed__file"
              title={`Fichero: ${task.path}`}
              data-testid="gtd-editor-file"
            >
              <i className="far fa-file-alt" /> {(task.path || '').replace(/^\//, '')}
            </span>
          )}
          {/* (3.44) «Mover a…» (lo que hacía el nombre del fichero), donde estaba «Abrir» */}
          {onMove && !isNew && (
            <button
              type="button"
              className="gtd-btn gtd-btn--link"
              onClick={(e) => {
                commit();
                onMove(e);
              }}
              title="Mover a otra lista, proyecto o fichero"
              data-testid="gtd-editor-move"
            >
              <i className="fas fa-share" /> Lista GTD
            </button>
          )}
          {/* (4.35) quién enlaza a esta tarea y enviarla dentro de otra cabecera */}
          {onBacklinks && !isNew && (
            <button
              type="button"
              className="gtd-btn gtd-btn--link"
              onClick={() => {
                commit();
                onBacklinks();
              }}
              title="Quién enlaza a esta tarea"
              data-testid="gtd-editor-backlinks"
            >
              <i className="fas fa-link" /> Backlinks
            </button>
          )}
          {onSendTo && !isNew && (
            <button
              type="button"
              className="gtd-btn gtd-btn--link"
              onClick={() => {
                commit();
                onSendTo();
              }}
              title="Enviar a otra cabecera o fichero (se mueve dentro de la elegida)"
              data-testid="gtd-editor-sendto"
            >
              <i className="fas fa-paper-plane" /> Enviar a
            </button>
          )}
          {/* (3.11) ver y editar las PROPERTIES de la tarea */}
          {!isNew && onSaveProperties && (
            <button
              type="button"
              className="gtd-btn gtd-btn--link"
              onClick={() => {
                commit();
                setPropsOpen(true);
              }}
              title="Ver y editar las propiedades (PROPERTIES)"
              data-testid="gtd-editor-props"
            >
              <i className="fas fa-list-ul" /> Propiedades
            </button>
          )}
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
              title={inTrash ? 'Borrar para siempre' : 'A la Papelera'}
              data-testid="gtd-editor-trash"
            >
              <i className="fas fa-trash" /> {inTrash ? 'Borrar' : 'Papelera'}
            </button>
          )}
        </div>
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
        <div className="gtd-editor__actions gtd-editor__saverow">
          <span className="gtd-spacer" />
          {/* (3.37) Cancelar y Guardar siempre juntos en la misma línea */}
          <span className="gtd-ed__save-pair">
            <button
              type="button"
              className="gtd-btn gtd-btn--cancel"
              onClick={cancelEditor}
              title={
                onCancelNew
                  ? 'Descartar la tarea nueva (se borra)'
                  : 'Descartar los cambios y cerrar'
              }
              data-testid="gtd-editor-cancel"
            >
              Cancelar
            </button>
            <button
              type="button"
              className="gtd-btn gtd-btn--primary"
              onClick={() => closeEditor()}
              title="Guardar y cerrar"
              data-testid="gtd-editor-save"
            >
              Guardar
            </button>
          </span>
        </div>
      </div>
      {propsOpen && (
        <GtdPropertiesDialog
          task={task}
          onSave={(rows) => onSaveProperties(rows)}
          onClose={() => setPropsOpen(false)}
        />
      )}
    </div>
  );
  return sheet && typeof document !== 'undefined'
    ? createPortal(editorEl, document.body)
    : editorEl;
}
