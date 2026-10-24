// ORG Mode para Eli: vista GTD al estilo de Nirvana (menú lateral de listas y proyectos; las
// tareas, filtradas, a la derecha). Trabaja sobre los mismos ficheros Org.
import React, { useEffect, useMemo, useState, useCallback, useRef, useLayoutEffect } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import { useHistory } from 'react-router-dom';
import { List } from 'immutable';
import { fileDisplayName } from '../../lib/eli_app_name';

import './stylesheet.css';

import {
  LISTS,
  EXTRA_LISTS,
  nestSubtasks,
  buildTasks,
  tasksForView,
  projectsOf,
  areasOf,
  countsFor,
  facetsFor,
  TIME_BUCKETS,
  inboxTag,
  tagsForList,
  needsAutoPriority,
  autoPriorityKey,
  logbookGroupOf,
  archivableDone,
  matchesFilters,
  projectState,
  projectsOverview,
  projectSections,
  projectSectionOfSeq,
  seqMarkOf,
  NO_TAGS,
  groupByProject,
  isGroupableList,
  keywordForList,
  PRIORITY_RE,
  listOf,
  doneForView,
  doneWaitingCleanup,
  dueInfo,
  sortByDue,
  tasksToOrg,
  firstPerProject,
  totalEffort,
  hasTrashTag,
  PROJECT_LINK_PROPERTY,
  projectLinkFor,
  newOrgId,
  STATUS_PROPERTY,
  SLEEP_STATUS,
  inProject,
  nestProjects,
  collapseRefs,
  taskByOrgId,
} from '../../lib/gtd/gtd_model';
import {
  gtdSaveTask,
  gtdPlaceNextTo,
  gtdToggleStar,
  gtdAddTask,
  capturedTitle,
  gtdDeleteTask,
  gtdMoveToProject,
  linksInsteadOfMoves,
  gtdArchiveTask,
  gtdCloseProject,
  gtdUndo,
  gtdRedo,
  gtdRefileInbox,
  gtdSetProperties,
  gtdRefileTo,
  tasksFileForRefile,
  gtdSetParent,
  canBeParentOf,
  gtdSaveMany,
  gtdCleanup,
  gtdTrash,
  gtdEmptyTrash,
  gtdDuplicate,
  untrashChanges,
  doneChangesFor,
  openSubtasksOf,
  autoCollect,
  LS_AUTO_COLLECT,
  gtdRenameTag,
  gtdRenameArea,
  gtdAssignProject,
  gtdUnassignProject,
  assignProjectEntries,
  gtdToTickler,
  gtdTicklerAdd,
  gtdTicklerReschedule,
  pathOfHeader,
  gtdEnsureOrgId,
} from '../../lib/gtd/gtd_actions';
import { clockSummary, taskLinkText, isClockRunning } from '../../lib/gtd/gtd_tools';
import { ROW_FN_PROPS, rowPropsEqual } from '../../lib/gtd/gtd_rowmemo';
import { clockTotalsOf, clockTotalLabel } from '../../lib/gtd/gtd_clock';
import {
  copyTaskLink,
  shareTaskOrg,
  exportTaskPdf,
  toggleTaskClock,
  exportViewPdf,
  exportViewOrg,
} from './gtdTaskActions';
import GtdProcessInbox from './GtdProcessInbox';
import {
  getProcessMode,
  mergeTags,
  isTicklerPath,
  ticklerPathNear,
} from '../../lib/gtd/gtd_process';
import { pickProject } from '../../lib/gtd/gtd_assign';
import {
  groupTickler,
  filterTickler,
  shiftTicklerDate,
  toDateInput,
  fromDateInput,
} from '../../lib/gtd/gtd_tickler';
import {
  parseRapidEntry,
  findProjectByName,
  rapidTokenAt,
  rapidSuggestions,
  applyRapidSuggestion,
} from '../../lib/gtd/gtd_rapid';
import GtdMenu from './GtdMenu';
import GtdWeeklyReview from './GtdWeeklyReview';
import GtdDailyProcess from './GtdDailyProcess';
import { planDay, closeDay, dailyReview, DAILY_PROCESSES } from '../../lib/gtd/gtd_daily';
import GtdGuidedProcess from './GtdGuidedProcess';
import {
  GUIDED_PROCESSES,
  chaseTitle,
  chaseMessage,
  projectPlan,
  mergePlanNotes,
  planAdditions,
} from '../../lib/gtd/gtd_guided';
import GtdHorizonsReview from './GtdHorizonsReview';
import {
  HORIZONS_TEMPLATE,
  OBJECTIVE_PROPERTY,
  horizonsPathNear,
  parseHorizons,
  horizonsView,
  missingAreas,
  objectivePickItems,
  objectiveRefOf,
  TERM_PROPERTY,
  HORIZON_TERMS,
  NO_TERM,
  objectivesByTerm,
  horizonReminders,
  getHzLastReview,
  markHzReviewed,
} from '../../lib/gtd/gtd_horizons';
import { weeklyReview, reviewSteps } from '../../lib/gtd/gtd_review';
import { strictOn, NOT_ALLEN_DAILY } from '../../lib/gtd/gtd_strict';
import GtdTagManager from './GtdTagManager';
import useRowDrag, { useLasso } from './useRowDrag';
import EliOrgTable from '../EliOrgTable';
import { toggleCheckboxLine } from './TaskEditor';
import { openDocuments } from '../../lib/eli_mode';
import { ActionCreators } from 'redux-undo';
import {
  loadFileQuietly,
  selectHeaderAndOpenParents,
  eliNarrowAndExpand,
  sync,
  eliOfferDeleteAttachments,
  eliFollowOrgLink,
  eliArchiveMany,
  eliReviewFinishedAttachments,
  eliRemoveAttachmentLink,
  eliLoadArchivedFiles,
  createPlainFile,
} from '../../actions/org';
import { parseOrgLink } from '../../lib/eli_org_links';
import { followOrgLinkSplitAware, openSplitAware } from '../../lib/eli_split_links';
import { declaredTagsFromConfigLines } from '../../lib/gtd_contexts';
import { confirmRemoveHeader } from '../../lib/eli_confirm_remove';
import { noteTextParts, isWebUri } from '../../lib/eli_note_links';
import TaskEditor from './TaskEditor';
import Drawer from '../UI/Drawer';
import AgendaModal from '../OrgFile/components/AgendaModal';
import EliErrorBoundary from '../EliErrorBoundary';
import { fileLinkTarget, resolveDropboxPath, openInNewTab } from '../../lib/eli_media';
import {
  showMessage,
  askDate,
  askConfirm,
  askCloseProject,
  askText,
  askChoice,
  askPick,
} from '../../lib/eli_prompt';
import {
  defaultTags,
  defaultTagsLine,
  allowedValuesFromConfigLines,
  DEFAULT_ENERGY,
  DEFAULT_EFFORT,
} from '../../lib/eli_todo_defaults';
import { openUploadDialog } from '../EliTools';
import { confirmAndDeleteAttachment } from '../../lib/eli_attachments';
import { linkTargetFor } from '../../lib/eli_org_attach';
import EliMedia from '../OrgFile/components/EliMedia';
import {
  setGtdConfig,
  isSectionShown,
  isActionSection,
  sectionLabel,
  sectionDef,
  isCustomId,
  isSepId,
  separatorOf,
} from '../../lib/gtd/gtd_sections';
import { createRawDescriptionText } from '../../lib/export_org';
import { getShowArchived, setShowArchived, isArchiveFile } from '../../lib/eli_archived';
import { Map as IMap } from 'immutable';
import { parseCaptureTemplate } from '../../lib/capture_template_parsing';
import { headerWithPath, STATIC_FILE_PREFIX } from '../../lib/org_utils';
import { chooseCaptureTemplate } from '../../lib/eli_capture_menu';
import { primeKeyboard, focusField } from '../../lib/eli_keyboard_bridge';
import {
  peekQuickCapture,
  takeQuickCapture,
  findCaptureTemplate,
  fillCaptureDraft,
} from '../../lib/eli_quick_capture';
import { gtdMatchesBinding, isEditable, shouldIgnoreOrganiceHotkey } from '../../lib/eli_hotkeys';
import { calculateGtdKeybindings } from '../../lib/keybindings';
import GtdShortcutsModal from './GtdShortcutsModal';
import {
  pushModalPage,
  setDisappearingLoadingMessage,
  setEliSetting,
  setLoadingMessage,
  hideLoadingMessage,
} from '../../actions/base';
import { getTapMode } from '../../lib/eli_tap_mode';
import { usePullToRefresh, pullReady } from '../../lib/eli_pull_refresh';
import { isDiaryPath, diaryLinkDetail, openDiary } from '../../lib/eli_diary';

const selectClient = (s) => s.syncBackend.get('client');

// Tareas a las que ya se les puso ★ automáticamente (para no repetirlo si se quita a mano)
const LS_AUTO_A = 'eliGtdAutoA';

const selectFiles = (s) => s.org.present.get('files');
const selectFileSettings = (s) => s.org.present.get('fileSettings');
const selectGtdSections = (s) => s.base.get('eliGtdSections');
const selectNoSwipeGtd = (s) => s.base.get('eliNoSwipeGtd') === true;
const selectArchiveInSubfolder = (s) => s.base.get('eliArchiveInSubfolder') === true;
const selectTemplates = (s) => s.capture.get('captureTemplates') || List();
const selectCanUndo = (s) => s.org.past.length > 0;
const selectCanRedo = (s) => s.org.future.length > 0;
const selectCustomKeybindings = (s) => s.base.get('customKeybindings');

// 3.35: ancho de la franja del borde izquierdo desde la que deslizar abre el menú lateral
const EDGE_SWIPE_ZONE = 24;
const LS_VIEW = 'eliGtdView';
// (3.01) filtros de la barra: etiquetas (incluir y tachadas = excluir), energía, tiempo, con
// fecha y «Proyecto no encontrado»
const EMPTY_FILTERS = {
  tags: [],
  notTags: [],
  energy: null,
  time: null,
  dated: false,
  badProject: false,
};
const LS_TAG_INHERIT = 'eliGtdTagInherit';
const LS_GROUP = 'eliGtdGroupByProject';
// 3.39a: pantalla en la que el menú lateral se despliega (mismo límite que el CSS)
const isNarrowGtd = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia &&
  window.matchMedia('(max-width: 720px)').matches;
// (4.02) móvil (estrecho o táctil): sin el ▾ de la fila (el menú sale con el clic derecho)
const isTouchGtd = () =>
  isNarrowGtd() ||
  (typeof window !== 'undefined' &&
    !!window.matchMedia &&
    window.matchMedia('(hover: none) and (pointer: coarse)').matches);
const LS_AREA = 'eliGtdArea';
const readLS = (k, fallback) => {
  try {
    const v = window.localStorage.getItem(k);
    return v ? JSON.parse(v) : fallback;
  } catch (e) {
    return fallback;
  }
};
const writeLS = (k, v) => {
  try {
    window.localStorage.setItem(k, JSON.stringify(v));
  } catch (e) {}
};

// (3.02) plegado de subtareas, recordado: por :ID: si lo tiene; si no, fichero + título
const LS_FOLDED = 'eliGtdFolded';
const foldIdOf = (t) =>
  t.orgId ? `id:${String(t.orgId).toLowerCase()}` : `${t.path}::${t.title || ''}`;

const norm = (p) => (!p ? null : p.startsWith('/') ? p : `/${p}`);

// Ficheros que usa la vista: los de la agenda, los de arranque y los de las plantillas de captura
export const gtdFilePaths = (fileSettings, templates) => {
  const paths = new Set();
  (fileSettings || List()).forEach((s) => {
    if (s.get('path') && (s.get('includeInAgenda') || s.get('loadOnStartup'))) {
      paths.add(s.get('path'));
    }
  });
  (templates || List()).forEach((t) => t.get('file') && paths.add(norm(t.get('file'))));
  // Ficheros por defecto para las tareas nuevas (si existen)
  paths.add(DEFAULT_TASKS);
  paths.add(DEFAULT_INBOX);
  return Array.from(paths);
};

const DEFAULT_TASKS = '/tasks.org';
const DEFAULT_INBOX = '/inbox.org';

// El fichero llamado así (el de ruta más corta si hay varios)
export const pickByName = (paths, name) =>
  paths
    .filter((p) => p.toLowerCase().split('/').pop() === name)
    .sort((a, b) => a.length - b.length)[0] || null;

export const inboxPathsOf = (templates, loadedPaths) => {
  const fromTemplates = (templates || List())
    .filter((t) => /inbox|entrada/i.test(t.get('description') || '') && t.get('file'))
    .map((t) => norm(t.get('file')))
    .toArray();
  const named = loadedPaths.filter((p) => /(^|\/)inbox\.org$/i.test(p));
  return Array.from(new Set([...fromTemplates, ...named]));
};

// Tareas nuevas: en tasks.org (si no existe, el de la plantilla «Tasks» u otro fichero)
export const tasksFileOf = (templates, loadedPaths, inboxPaths) => {
  const named = pickByName(loadedPaths, 'tasks.org');
  if (named) return named;
  const t = (templates || List()).find(
    (x) => /task|tarea/i.test(x.get('description') || '') && x.get('file')
  );
  const p = t && norm(t.get('file'));
  if (p && loadedPaths.includes(p)) return p;
  return loadedPaths.find((x) => !inboxPaths.includes(x)) || inboxPaths[0] || loadedPaths[0];
};

const fmtDate = (d) => (d ? d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '');

// (3.0) Notas bajo la fila (como Nirvana: completas, parciales u ocultas). Sin la línea :Created:
// ni cajones (:LOGBOOK: …); las casillas «- [ ]» se pueden marcar desde la lista.
const NOTE_CHECK_RE = /^(\s*(?:[-+*]|\d+[.)])\s+\[)([ xX-])(\])(.*)$/;
// (3.05) Con `linkTarget` (uri → destino o null), los enlaces a ficheros ([[file:…]] y los de
// org-attach [[attachment:…]]) salen como vista previa (imagen, vídeo, audio o fichero) en lugar
// del texto del enlace
const NOTE_LINK_RE = /\[\[([^\]]+)\](?:\[([^\]]*)\])?\]/g;
const noteLineWithMedia = (index, line, linkTarget) => {
  const media = [];
  const rest = line.replace(NOTE_LINK_RE, (m, uri, desc) => {
    const target = linkTarget ? linkTarget(uri) : null;
    if (target) {
      if (!media.some((x) => x.target === target)) media.push({ target, label: desc || null });
      return '';
    }
    return desc || uri;
  });
  // (3.09) `raw`: la línea con los enlaces que no son adjuntos (para pintarlos clicables)
  const raw = line.replace(NOTE_LINK_RE, (m, uri) => (linkTarget && linkTarget(uri) ? '' : m));
  const out = media.length
    ? { index, text: rest.replace(/\s+$/, '').replace(/^\s*[-+]\s*$/, ''), media }
    : { index, text: rest };
  if (/\[\[|https?:\/\//.test(line)) {
    const r = media.length ? raw.replace(/\s+$/, '').replace(/^\s*[-+]\s*$/, '') : raw;
    if (r !== out.text) out.raw = r;
  }
  return out;
};

// (3.09) Texto de las notas con los enlaces clicables (web, file:, id:, cabeceras…), sin entrar
// en edición
export function NoteText({ text, onOpenLink }) {
  const parts = noteTextParts(text);
  if (!parts.some((p) => p.link)) return text || ' ';
  const stop = (e) => e.stopPropagation();
  return parts.map((p, i) =>
    !p.link ? (
      <React.Fragment key={i}>{p.text}</React.Fragment>
    ) : isWebUri(p.link) ? (
      <a
        key={i}
        className="gtd-note-link"
        href={p.link}
        target="_blank"
        rel="noopener noreferrer"
        title={p.link}
        onClick={stop}
        onDoubleClick={stop}
        onPointerDown={stop}
        onPointerUp={stop}
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
        title={p.link}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          if (onOpenLink) onOpenLink(p.link);
        }}
        onDoubleClick={stop}
        onPointerDown={stop}
        onPointerUp={stop}
        data-testid="gtd-note-link"
      >
        {p.text}
      </span>
    )
  );
}
export const notesLinesOf = (text, linkTarget = null) => {
  const out = [];
  let inDrawer = false;
  (text || '').split('\n').forEach((line, index) => {
    if (/^\s*:[A-Za-z_]+:\s*$/.test(line)) {
      inDrawer = !/^\s*:END:\s*$/i.test(line);
      return;
    }
    if (inDrawer || /^\s*:Created:/i.test(line) || /^\s*-----BEGIN PGP/.test(line)) return;
    if (!line.trim() && !out.length) return;
    const m = NOTE_CHECK_RE.exec(line);
    out.push(
      m
        ? { index, check: true, checked: m[2] !== ' ', text: m[4].trim() }
        : linkTarget
        ? noteLineWithMedia(index, line, linkTarget)
        : { index, text: line.replace(/\[\[([^\]]+)\]\[([^\]]+)\]\]/g, '$2') }
    );
  });
  while (
    out.length &&
    !out[out.length - 1].text.trim() &&
    !out[out.length - 1].check &&
    !out[out.length - 1].media
  )
    out.pop();
  return out;
};

// (3.02) Líneas de notas seguidas que forman una tabla Org → un solo elemento { table: [líneas] }
const groupNoteTables = (lines) => {
  const out = [];
  lines.forEach((l) => {
    const isRow = !l.check && /^\s*\|/.test(l.text || '');
    const last = out[out.length - 1];
    if (isRow && last && last.table && last.lastIndex === l.index - 1) {
      last.table.push(l.text);
      last.lastIndex = l.index;
    } else if (isRow) {
      out.push({ index: l.index, lastIndex: l.index, table: [l.text] });
    } else {
      out.push(l);
    }
  });
  return out;
};

// (3.09) Notas de una fila (o de un proyecto) a la vista: tablas, casillas, adjuntos y enlaces
function NotesLines({
  task,
  lines,
  notesMode = 'full',
  onToggleCheck,
  onOpenLink,
  className = '',
}) {
  return (
    <div
      className={
        'gtd-task__notes' +
        (notesMode === 'partial' ? ' is-partial' : '') +
        (className ? ` ${className}` : '')
      }
      data-testid="gtd-task-notes"
    >
      {groupNoteTables(lines).map((l) =>
        l.table ? (
          // (3.02) tablas Org vistas como tabla (solo lectura)
          <EliOrgTable key={`t${l.index}`} lines={l.table} testId="gtd-note-table" />
        ) : l.check && notesMode === 'full' ? (
          <label
            key={l.index}
            className={'gtd-task__note-check' + (l.checked ? ' is-done' : '')}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={l.checked}
              onChange={() => onToggleCheck && onToggleCheck(l.index)}
            />
            <span>
              <NoteText text={l.text} onOpenLink={onOpenLink} />
            </span>
          </label>
        ) : l.media ? (
          <div
            key={l.index}
            className="gtd-task__note-line gtd-task__note-media"
            data-testid="gtd-note-media"
          >
            {(l.raw !== undefined ? l.raw : l.text).trim() ? (
              <span>
                <NoteText text={l.raw !== undefined ? l.raw : l.text} onOpenLink={onOpenLink} />
              </span>
            ) : null}
            {l.media.map((m) => (
              <span
                key={m.target}
                className="gtd-task__note-attach"
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <EliMedia target={m.target} title={m.label} orgPath={task.path} />
              </span>
            ))}
          </div>
        ) : (
          <div key={l.index} className="gtd-task__note-line">
            {l.check ? `${l.checked ? '☑' : '☐'} ` : null}
            <NoteText text={l.raw !== undefined ? l.raw : l.text} onOpenLink={onOpenLink} />
          </div>
        )
      )}
      {/* (4.11) al final de las notas, el tiempo registrado (CLOCK) */}
      {notesMode === 'full' && task.header && clockSummary(task.header) ? (
        <div className="gtd-task__note-line gtd-task__clock" data-testid="gtd-notes-clock">
          {clockSummary(task.header)}
        </div>
      ) : null}
    </div>
  );
}

function TaskRow({
  task,
  noSubtasks = false, // (3.46) interruptor «Subtareas» apagado: sin el indicador [1/3]
  today,
  showProject,
  onPointerDown,
  onRowClick,
  onRowDoubleClick,
  onContextMenu,
  onMenuButton,
  onDotsDown,
  onToggleDone,
  onToggleStar,
  onToggleCheck,
  isDragging,
  hideActions = false,
  reorderSection = null,
  isSelected = false,
  archivedFrom = null,
  depth = 0,
  parentTitle = null,
  onGoParent = null,
  notesMode = 'none',
  onCycleNotes = null,
  onGoProject = null,
  showTags = true,
  showEffort = true,
  showArea = true,
  wrapTitle = true,
  badProject = false,
  hasKids = false,
  folded = false,
  onToggleFold = null,
  onTitleClick = null,
  seqMark = null,
  clockMs = 0,
  onOpenLink = null,
}) {
  const due = dueInfo(task.deadline, today);
  const isProjectRow = !!task.isProject;
  // (3.05) adjuntos (file: y attachment:) a la vista en las notas
  const notes =
    notesMode !== 'none'
      ? notesLinesOf(task.description, (uri) => linkTargetFor(uri, task.header))
      : [];
  const shownNotes =
    notesMode === 'partial' ? notes.filter((l) => l.text.trim() || l.media).slice(0, 2) : notes;
  // (3.11) las notas de debajo empiezan donde empieza el título
  const taskRef = useRef(null);
  const mainRef = useRef(null);
  const [notesIndent, setNotesIndent] = useState(null);
  // (3.37) las notas abiertas con el icono se despliegan con una animación corta
  const [notesUnfold, setNotesUnfold] = useState(false);
  const hasBelow = shownNotes.length > 0;
  useLayoutEffect(() => {
    if (!hasBelow) return undefined;
    const measure = () => {
      const t = taskRef.current;
      const m = mainRef.current;
      if (!t || !m) return;
      const left = Math.max(
        0,
        Math.round(
          m.getBoundingClientRect().left - t.getBoundingClientRect().left - (t.clientLeft || 0)
        )
      );
      setNotesIndent((cur) => (cur === left ? cur : left));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [hasBelow, depth, hideActions, isProjectRow]);
  return (
    <div
      ref={taskRef}
      className={
        'gtd-task' +
        (task.isDone ? ' is-done' : '') +
        (task.isDone && task.keyword === 'CANCELLED' ? ' is-cancelled' : '') +
        (isDragging ? ' is-dragging' : '') +
        (isSelected ? ' is-selected' : '') +
        (isProjectRow ? ' is-project-row' : '') +
        (depth ? ` is-sub is-sub-${Math.min(depth, 3)}` : '')
      }
      data-testid="gtd-task"
      data-reorder-slot=""
      data-reorder-key={task.key}
      data-reorder-section={reorderSection || 'list'}
    >
      <div
        className="gtd-task__row"
        onClick={onRowClick}
        onDoubleClick={onRowDoubleClick}
        onPointerDown={onPointerDown}
        onContextMenu={onContextMenu}
      >
        {/* (3.0) los puntos de la izquierda: seleccionar (con lazo), como en Nirvana */}
        {onDotsDown && (
          <span
            className="gtd-task__dots"
            onPointerDown={onDotsDown}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            title="Seleccionar (arrastra para seleccionar varias)"
            data-testid="gtd-task-dots"
          >
            <i className="fas fa-grip-vertical" />
          </span>
        )}
        {/* (3.02) plegar/desplegar las subtareas */}
        {hasKids && onToggleFold ? (
          <button
            type="button"
            className={'gtd-fold' + (folded ? ' is-folded' : '')}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFold();
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            title={folded ? 'Desplegar subtareas' : 'Plegar subtareas'}
            aria-label={folded ? 'Desplegar subtareas' : 'Plegar subtareas'}
            aria-expanded={!folded}
            data-testid="gtd-fold"
          >
            <i className={folded ? 'fas fa-caret-right' : 'fas fa-caret-down'} />
          </button>
        ) : null}
        {!hideActions && (
          <>
            {isProjectRow ? (
              <span className="gtd-task__project-icon" title="Proyecto">
                <i className="fas fa-project-diagram" />
              </span>
            ) : (
              <button
                className={
                  'gtd-check' +
                  (task.isDone ? ' is-on' : '') +
                  (task.keyword === 'CANCELLED' ? ' is-cancelled' : '')
                }
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleDone && onToggleDone(e);
                }}
                onDoubleClick={(e) => e.stopPropagation()}
                title={task.isDone ? 'Reabrir' : 'Completar (Mayús: cancelar)'}
                data-testid="gtd-check"
              >
                {task.isDone ? (
                  <i className={task.keyword === 'CANCELLED' ? 'fas fa-times' : 'fas fa-check'} />
                ) : seqMark ? (
                  /* (4.02) proyecto secuencial: W = en espera, S = programada, dentro de la casilla */
                  <span
                    className="gtd-check__seq"
                    title={
                      seqMark === 'W'
                        ? 'Waiting: en espera (bloquea las de después)'
                        : 'Programada (bloquea las de después)'
                    }
                    data-testid="gtd-seq-mark"
                  >
                    {seqMark}
                  </span>
                ) : null}
              </button>
            )}
            <button
              className={'gtd-star' + (task.priority === 'A' ? ' is-on' : '')}
              onClick={(e) => {
                e.stopPropagation();
                onToggleStar && onToggleStar();
              }}
              onDoubleClick={(e) => e.stopPropagation()}
              title="Focus (★ [#A])"
              data-testid="gtd-star"
            >
              <i className={task.priority === 'A' ? 'fas fa-star' : 'far fa-star'} />
            </button>
          </>
        )}
        <div className="gtd-task__main" ref={mainRef}>
          <div className={'gtd-task__title' + (wrapTitle ? '' : ' is-nowrap')}>
            {/* (3.05) con el ratón, clic justo sobre el texto del título = editar */}
            <span
              className={'gtd-task__title-text' + (onTitleClick ? ' is-link' : '')}
              onClick={onTitleClick || undefined}
              data-testid="gtd-task-title"
            >
              {task.title || '(sin título)'}
            </span>
            {/* (3.01) icono de notas solo en esta fila; (3.34) alterna Ocultas ⇄ Completas;
                (3.11) pegado al final del título; (3.43) también en los proyectos */}
            {task.description.trim() && notesLinesOf(task.description).length > 0 && (
              <button
                type="button"
                className={'gtd-meta gtd-notes-btn' + (notesMode !== 'none' ? ' is-on' : '')}
                onClick={(e) => {
                  e.stopPropagation();
                  if (notesMode !== 'full') setNotesUnfold(true);
                  onCycleNotes && onCycleNotes();
                }}
                onDoubleClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                title={
                  notesMode === 'full'
                    ? 'Notas visibles (clic: ocultarlas)'
                    : 'Tiene notas (clic: verlas)'
                }
                data-testid="gtd-notes-toggle"
              >
                <i className={notesMode === 'none' ? 'far fa-sticky-note' : 'fas fa-sticky-note'} />
              </button>
            )}
            {task.cookie && !noSubtasks && (
              <span
                className="gtd-task__cookie"
                title="Subtareas terminadas"
                data-testid="gtd-task-cookie"
              >
                {task.cookie}
              </span>
            )}
            {(archivedFrom ||
              (parentTitle && !depth) ||
              (showProject && task.project) ||
              badProject ||
              (showArea && task.area)) && (
              <span className="gtd-task__meta">
                {archivedFrom && (
                  <span className="gtd-meta" title="Archivada en">
                    <i className="fas fa-archive" /> {archivedFrom.replace(/^\//, '')}
                  </span>
                )}
                {parentTitle && !depth && (
                  <span className="gtd-meta gtd-meta--parent" title="Subtarea de">
                    <i className="fas fa-level-up-alt fa-rotate-90" />{' '}
                    {onGoParent ? (
                      <button
                        type="button"
                        className="gtd-meta--parent-link"
                        onClick={(e) => {
                          e.stopPropagation();
                          onGoParent();
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        title="Ir a la tarea madre (Alt+← vuelve)"
                        data-testid="gtd-parent-link"
                      >
                        {parentTitle}
                      </button>
                    ) : (
                      parentTitle
                    )}
                  </span>
                )}
                {showProject && task.project && (
                  <span className="gtd-meta gtd-meta--project">
                    <i className="fas fa-project-diagram" />{' '}
                    {onGoProject ? (
                      <button
                        type="button"
                        className="gtd-meta--project-link"
                        onClick={(e) => {
                          e.stopPropagation();
                          onGoProject();
                        }}
                        onDoubleClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        title="Abrir el proyecto (Alt+← vuelve)"
                        data-testid="gtd-project-link"
                      >
                        {task.project.title}
                      </button>
                    ) : (
                      task.project.title
                    )}
                  </span>
                )}
                {badProject && (
                  <span
                    className="gtd-meta gtd-meta--bad-project"
                    title="Tiene asignado un proyecto que no se encuentra (borrado, archivado o en un fichero sin cargar)"
                    data-testid="gtd-bad-project"
                  >
                    <i className="fas fa-unlink" /> proyecto no encontrado
                  </span>
                )}
                {showArea && task.area && (
                  <span className="gtd-meta gtd-meta--area">{task.area}</span>
                )}
              </span>
            )}
          </div>
        </div>
        <div className="gtd-task__right">
          {(showTags ? task.tags : [])
            .filter((t) => !['trash'].includes(t.toLowerCase()))
            .map((t) => {
              const inherited = !(task.ownTags || []).includes(t);
              return (
                <span
                  key={t}
                  className={'gtd-meta gtd-meta--tag' + (inherited ? ' is-inherited' : '')}
                  title={inherited ? 'Heredada' : undefined}
                >
                  {t}
                </span>
              );
            })}
          {task.energy && (
            <span className="gtd-meta gtd-meta--energy" title="Energía">
              <i className="fas fa-bolt" /> {task.energy}
            </span>
          )}
          {showEffort && task.effort && (
            <span className="gtd-meta gtd-meta--effort" title="Tiempo">
              <i className="far fa-clock" /> {task.effort}
            </span>
          )}
          {task.attachmentCount > 0 && (
            <span
              className="gtd-meta gtd-meta--attach"
              title={
                task.attachmentCount === 1
                  ? 'Tiene 1 archivo adjunto'
                  : `Tiene ${task.attachmentCount} archivos adjuntos`
              }
              data-testid="gtd-task-attach"
            >
              <i className="fas fa-paperclip" />
              {task.attachmentCount > 1 ? ` ${task.attachmentCount}` : ''}
            </span>
          )}
          {task.scheduled && task.scheduled > today && (
            <span className="gtd-date" title="Empieza">
              <i className="far fa-calendar-alt" /> {fmtDate(task.scheduled)}
            </span>
          )}
          {due && !task.isDone && (
            <span
              className={`gtd-date gtd-date--due is-${due.level}`}
              title={`Vence el ${fmtDate(task.deadline)}`}
              data-testid="gtd-due"
            >
              <i className="fas fa-flag" /> {due.text}
              {due.ago && (
                <span className="gtd-date__ago" data-testid="gtd-due-ago">
                  {' '}
                  · {due.ago}
                </span>
              )}
            </span>
          )}
          {task.isDone && task.closed && <span className="gtd-date">{fmtDate(task.closed)}</span>}
        </div>
        {onMenuButton && (
          <button
            type="button"
            className="gtd-task__caret"
            onClick={(e) => {
              e.stopPropagation();
              onMenuButton(e);
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            title="Menú"
            aria-label="Menú de la tarea"
            data-testid="gtd-task-menu"
          >
            <i className="fas fa-caret-down" />
          </button>
        )}
        {/* (4.13) reloj en marcha: icono naranja en la esquina superior derecha */}
        {!task.isDone && task.header && isClockRunning(task.header) ? (
          <span
            className="gtd-task__running"
            title="Reloj en marcha"
            data-testid="gtd-task-running"
          >
            <i className="fas fa-clock" />
          </span>
        ) : clockTotalLabel(clockMs) ? (
          /* (4.20) tiempo registrado (con el de subtareas / acciones del proyecto), en gris */
          <span
            className="gtd-task__running gtd-task__clock-total"
            title={
              task.isProject || task.hasTaskChildren
                ? 'Tiempo registrado (con subtareas)'
                : 'Tiempo registrado'
            }
            data-testid="gtd-task-clock-total"
          >
            {clockTotalLabel(clockMs)}
          </span>
        ) : null}
      </div>
      {/* (3.11) notas DEBAJO de la fila (la fila no se mueve), sangradas y con una línea gris
          a la izquierda, como en Nirvana */}
      {shownNotes.length > 0 && (
        <div
          className={'gtd-task__below' + (notesUnfold ? ' is-unfold' : '')}
          style={notesIndent != null ? { marginLeft: notesIndent } : undefined}
          onClick={onRowClick}
          onDoubleClick={onRowDoubleClick}
          onPointerDown={onPointerDown}
          onContextMenu={onContextMenu}
          data-testid="gtd-task-below"
        >
          <NotesLines
            task={task}
            lines={shownNotes}
            notesMode={notesMode}
            onToggleCheck={onToggleCheck}
            onOpenLink={onOpenLink}
          />
        </div>
      )}
    </div>
  );
}

// (4.25) Rendimiento: la fila solo se vuelve a pintar si cambian sus DATOS. Las funciones que
// recibe son «proxies» estables (llaman siempre a la versión más reciente, ver `rowProxies` en
// GtdView), así que basta con comparar si existen o no.
const MemoTaskRow = React.memo(TaskRow, rowPropsEqual);

// (2.17) última tarea abierta en su fichero desde GTD: al volver se marca y se centra
let lastOpenedTaskKey = null;

export default function GtdView() {
  const dispatch = useDispatch();
  const store = useStore();
  const history = useHistory();
  const files = useSelector(selectFiles);
  const fileSettings = useSelector(selectFileSettings);
  const templates = useSelector(selectTemplates);
  // Tras deshacer/rehacer desde el editor, se vuelve a crear para que muestre lo actual
  const [editorRev, setEditorRev] = useState(0);
  const canUndo = useSelector(selectCanUndo);
  const canRedo = useSelector(selectCanRedo);
  const client = useSelector(selectClient);

  // 3.30: cada vista es una entrada del historial (estado `eliGtdView`), para las flechas ← →
  const [view, setView] = useState(() => {
    const st = history.location && history.location.state;
    return (st && st.eliGtdView) || readLS(LS_VIEW, { id: 'focus' });
  });
  const viewRef = useRef(view);
  viewRef.current = view;
  const [area, setArea] = useState(() => readLS(LS_AREA, '*'));
  const [filtersRaw, setFilters] = useState({ ...EMPTY_FILTERS });
  // 3.36: «Heredadas» en la barra de filtros: con ella (por defecto) una etiqueta del proyecto o
  // de la tarea madre también cuenta; sin ella, solo las asignadas directamente (se recuerda)
  // 3.39: tres estados como el resto de chips: 'all' (cuentan, por defecto) / 'own' (solo propias)
  // / 'exclude' (fuera las tareas con alguna heredada). Los true/false antiguos se respetan.
  const [tagInherit, setTagInherit] = useState(() => {
    const v = readLS(LS_TAG_INHERIT, 'all');
    if (v === false || v === 'own') return 'own';
    if (v === 'exclude') return 'exclude';
    return 'all';
  });
  const filters = useMemo(
    () => ({
      ...filtersRaw,
      ownTagsOnly: tagInherit !== 'all',
      noInherited: tagInherit === 'exclude',
    }),
    [filtersRaw, tagInherit]
  );
  const activeFilterCount =
    filters.tags.length +
    filters.notTags.length +
    (filters.badProject ? 1 : 0) +
    (filters.energy ? 1 : 0) +
    (filters.time ? 1 : 0) +
    (filters.dated ? 1 : 0);
  // 3.36: `text` = filtro de la sección (lupa de la cabecera; se borra al cambiar de sección);
  // `searchText` = buscador del menú lateral (resultados de todas las secciones)
  const [text, setText] = useState('');
  const [secFilterOpen, setSecFilterOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchFolded, setSearchFolded] = useState([]);
  const [logText, setLogText] = useState('');
  // ORG Mode para Eli: tareas creadas ahora en esta lista: se ven arriba del todo (hasta cambiar
  // de lista)
  const [freshKeys, setFreshKeys] = useState([]);
  const [projGroupsOpen, setProjGroupsOpen] = useState({});
  // ORG Mode para Eli (2.15): agrupar las listas por proyecto (se recuerda) y, en un proyecto,
  // la sección de terminadas plegada
  const [doneOpen, setDoneOpen] = useState(false);
  const [refsOpen, setRefsOpen] = useState(false);
  // (2.17) notas del proyecto, bajo su cabecera (plegables; se recuerda si se pliegan)
  const [projNotesOpen, setProjNotesOpen] = useState(
    () => readLS('eliGtdProjNotes', true) !== false
  );
  // (3.43) «Todos los proyectos»: notas desplegadas con su icono, por proyecto
  const [overviewNotes, setOverviewNotes] = useState(() => new Set());
  const toggleOverviewNotes = (key) =>
    setOverviewNotes((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const [openKey, setOpenKey] = useState(null);
  // (3.05) cabeceras del menú lateral plegadas
  const [sepFolded, setSepFolded] = useState(() => {
    const v = readLS('eliGtdSepFolded', []);
    return Array.isArray(v) ? v : [];
  });
  // (2.16) tarea seleccionada con el teclado (↑ ↓; Intro la abre, Supr la borra)
  const [selKey, setCursor] = useState(null);
  // (3.0) selección (varias tareas, como Nirvana: clic, Ctrl/⌘+clic, lazo con los puntos ⋮⋮)
  const [sel, setSel] = useState([]);
  // (3.01) punto de partida de Mayús+clic (la última tarea elegida)
  const anchorRef = useRef(null);
  const setSelKey = useCallback((k) => {
    anchorRef.current = k;
    setCursor(k);
    setSel(k ? [k] : []);
  }, []);
  const [menu, setMenu] = useState(null);
  const [showTagManager, setShowTagManager] = useState(false);
  // (3.0) Entrada rápida (Mayús+E), notas bajo las filas, orden por fecha límite (d), vista de
  // la lista (unificada, por proyecto o por estado) y grupo «Hecho» abierto o plegado
  const [rapidOn, setRapidOn] = useState(() => readLS('eliGtdRapid', false) === true);
  // (3.46) interruptor «Subtareas» del ⋯ (apagado por defecto): apagado, no se ve nada de
  // subtareas y las hijas salen como tareas normales; los ficheros .org no cambian
  const [subtasksOn, setSubtasksOn] = useState(() => readLS('eliGtdSubtasks', false) === true);
  const [rapidText, setRapidText] = useState('');
  // (3.01) autorrelleno de la Entrada rápida (# etiquetas y palabras, > proyectos)
  const [rapidCaret, setRapidCaret] = useState(0);
  const [acIndex, setAcIndex] = useState(0);
  const [acClosed, setAcClosed] = useState(false);
  const [notesMode, setNotesMode] = useState(() => readLS('eliGtdNotes', 'none'));
  // (3.01) notas de UNA fila (icono de notas): se impone al modo general hasta cambiar éste (⋯)
  const [notesOverride, setNotesOverride] = useState({});
  // (3.01) Opciones de vista → Detalles (como Nirvana): títulos largos en varias líneas,
  // etiquetas y tiempo (esfuerzo) a la vista
  const [details, setDetails] = useState(() => ({
    wrap: true,
    tags: true,
    effort: true,
    area: true,
    ...readLS('eliGtdDetails', {}),
  }));
  const setDetail = (k, v) => {
    const next = { ...details, [k]: v };
    setDetails(next);
    writeLS('eliGtdDetails', next);
  };
  const [sortDue, setSortDue] = useState(() => readLS('eliGtdSortDue', false) === true);
  const [groupMode, setGroupMode] = useState(() =>
    // (3.01) por defecto «Acciones siguientes secuenciales» (en Next, la 1.ª de cada proyecto)
    readLS('eliGtdGroup', readLS(LS_GROUP, false) === true ? 'project' : 'sequential')
  );
  const [doneGroupOpen, setDoneGroupOpen] = useState(
    () => readLS('eliGtdDoneOpen', true) !== false
  );
  const [tagsOpen, setTagsOpen] = useState(() => readLS('eliGtdTagsOpen', true) !== false);
  // (3.01) etiquetas cuya vista muestra también las cabeceras sin tarea (gestor de etiquetas)
  const [headingTags, setHeadingTags] = useState(() => readLS('eliGtdTagHeadings', []));
  const [headingsOpen, setHeadingsOpen] = useState(true);
  const [projectsOpen, setProjectsOpen] = useState(
    () => readLS('eliGtdProjectsOpen', true) !== false
  );
  const [autoCollectOn, setAutoCollectOn] = useState(() => autoCollect());
  const lastPointer = useRef('mouse');
  // ORG Mode para Eli: tarea recién creada con su editor abierto: no se cierra al tocar fuera
  // (hay que Guardar o Cancelar; Cancelar la borra)
  const [newKey, setNewKey] = useState(null);
  // (2.17) al cerrar el editor de una tarea, ésta queda marcada y centrada en la lista
  useEffect(() => {
    const key = lastOpenedTaskKey;
    lastOpenedTaskKey = null;
    if (!key) return;
    setSelKey(key);
    setTimeout(() => {
      const el = document.querySelector(`[data-reorder-key="${CSS.escape(key)}"]`);
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center' });
    }, 150);
  }, []);
  const prevOpenKey = useRef(null);
  useEffect(() => {
    const prev = prevOpenKey.current;
    prevOpenKey.current = openKey;
    if (!prev || openKey) return;
    setSelKey(prev);
    setTimeout(() => {
      const el = document.querySelector(`[data-reorder-key="${CSS.escape(prev)}"]`);
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center' });
    }, 50);
  }, [openKey]);
  const noSwipeGtd = useSelector(selectNoSwipeGtd);
  const archiveInSubfolder = useSelector(selectArchiveInSubfolder);
  // ORG Mode para Eli: proyecto nuevo en el editor (aún no existe en el fichero)
  const [newProject, setNewProject] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [sideOpen, setSideOpen] = useState(false);
  const keepSideRef = useRef(false);
  const [showAgenda, setShowAgenda] = useState(false);
  // (3.24) Revisión semanal guiada: paso en curso (null = cerrada; se recuerda)
  const [reviewStep, setReviewStep] = useState(() => {
    const v = readLS('eliGtdReview', null);
    return typeof v === 'number' ? v : null;
  });
  const [lastReview, setLastReview] = useState(() => readLS('eliGtdLastReview', null));
  // (3.40) «Procesar Inbox»: { queue: [{key, path, title}], i, gone: {i: texto} } (null = cerrado)
  const [proc, setProc] = useState(null);
  // (4.05) proceso diario en curso: { kind: 'plan' | 'close' | 'now', step } (null = cerrado)
  const [daily, setDaily] = useState(null);
  const [today, setToday] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  });

  // El historial de deshacer es solo de esta vista (al entrar y al salir se vacía)
  useEffect(() => {
    dispatch(ActionCreators.clearHistory());
    return () => dispatch(ActionCreators.clearHistory());
  }, [dispatch]);

  // Cargar (en silencio) los ficheros que usa la vista
  const wanted = useMemo(() => gtdFilePaths(fileSettings, templates), [fileSettings, templates]);
  const [pendingLoads, setPendingLoads] = useState(true);
  useEffect(() => {
    let alive = true;
    setPendingLoads(true);
    Promise.all(wanted.map((p) => Promise.resolve(dispatch(loadFileQuietly(p))).catch(() => null)))
      .catch(() => null)
      .then(() => alive && setPendingLoads(false));
    return () => {
      alive = false;
    };
  }, [wanted, dispatch]);
  useEffect(() => {
    const t = setInterval(() => {
      const d = new Date();
      const t0 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      setToday((prev) => (+prev === +t0 ? prev : t0));
    }, 60000);
    return () => clearInterval(t);
  }, []);

  const loadedPaths = useMemo(
    () =>
      Array.from(files.keys()).filter(
        (p) => p && !p.startsWith('/__') && files.getIn([p, 'headers'])
      ),
    [files]
  );
  // ORG Mode para Eli: secciones configurables (Ajustes → Vista GTD: secciones). Al cambiar la
  // configuración se vuelve a calcular todo.
  const gtdCfg = setGtdConfig(useSelector(selectGtdSections));
  // (4.07) el fichero de horizontes no es de tareas (aunque esté en la agenda)
  const horizonsSet = gtdCfg.files.horizons;
  const scopePaths = useMemo(
    () =>
      loadedPaths.filter(
        (p) =>
          (wanted.includes(p) || !wanted.length) &&
          p !== horizonsSet &&
          !/(^|\/)horizons\.org$/i.test(p) &&
          !isDiaryPath(p)
      ),
    [loadedPaths, wanted, horizonsSet]
  );
  const scopedFiles = useMemo(() => files.filter((_f, p) => scopePaths.includes(p)), [
    files,
    scopePaths,
  ]);
  // (2.17) ficheros elegidos en Ajustes (si están cargados); si no, los de siempre
  const chosenInbox =
    gtdCfg.files.inbox && scopePaths.includes(gtdCfg.files.inbox) ? gtdCfg.files.inbox : null;
  const chosenTasks =
    gtdCfg.files.tasks && scopePaths.includes(gtdCfg.files.tasks) ? gtdCfg.files.tasks : null;
  const inboxPaths = useMemo(() => {
    const found = inboxPathsOf(templates, scopePaths);
    return chosenInbox && !found.includes(chosenInbox) ? [chosenInbox, ...found] : found;
  }, [templates, scopePaths, chosenInbox]);
  const tasksFile = chosenTasks || tasksFileOf(templates, scopePaths, inboxPaths);
  // Inbox nuevo: el elegido en Ajustes o inbox.org (si no existe, el de la plantilla de entrada)
  const inboxFile =
    chosenInbox ||
    pickByName(scopePaths, 'inbox.org') ||
    inboxPaths.find((p) => scopePaths.includes(p)) ||
    null;

  const tasks = useMemo(
    () => buildTasks(scopedFiles, inboxPaths),
    // eslint-disable-next-line
    [scopedFiles, inboxPaths, gtdCfg]
  );
  // (4.07) Horizontes: el fichero elegido en Ajustes o horizons.org junto al de entrada
  const horizonsPath =
    horizonsSet || horizonsPathNear(inboxPaths[0] || inboxFile || tasksFile || '/inbox.org');
  const horizonsFile = files.get(horizonsPath);
  const horizons = useMemo(() => parseHorizons(horizonsFile, horizonsPath), [
    horizonsFile,
    horizonsPath,
  ]);
  const horizonsOn = isSectionShown('horizons', gtdCfg);
  // con la sección a la vista, se carga en silencio (sin crearlo)
  useEffect(() => {
    if (!horizonsOn || horizonsFile) return;
    Promise.resolve(dispatch(loadFileQuietly(horizonsPath))).catch(() => null);
    // eslint-disable-next-line
  }, [horizonsOn, horizonsPath]);
  // (4.05) procesos diarios: las entradas de tickler.org (aunque GTD no lo cargue) y lo de cada paso
  const dailyKind = daily ? daily.kind : null;
  const ticklerTasks = useMemo(
    () =>
      dailyKind === 'plan' || dailyKind === 'daily' || view.id === 'tickler'
        ? buildTasks(
            files.filter((_f, p) => isTicklerPath(p)),
            []
          )
        : [],
    // eslint-disable-next-line
    [dailyKind, files, view.id === 'tickler']
  );
  // (4.17) vista Tickler: tickler.org (el cargado o, si no, se carga el de junto al de entrada,
  // sin crearlo) y el formulario de entrada nueva
  const ticklerLoadedPath = Array.from(files.keys()).find(
    (p) => isTicklerPath(p) && files.getIn([p, 'headers'])
  );
  useEffect(() => {
    if (view.id !== 'tickler' || ticklerLoadedPath) return;
    const near = inboxPaths[0] || inboxFile;
    if (near) Promise.resolve(dispatch(loadFileQuietly(ticklerPathNear(near)))).catch(() => null);
    // eslint-disable-next-line
  }, [view.id]);
  const [tkTitle, setTkTitle] = useState('');
  // (4.21b) entradas del Tickler con los botones de acción visibles (ocultos por defecto)
  const [tkActsOpen, setTkActsOpen] = useState({});
  const [tkDate, setTkDate] = useState('');
  const dailyData = useMemo(
    () =>
      dailyKind === 'plan'
        ? planDay(tasks, today, ticklerTasks)
        : dailyKind === 'daily'
        ? dailyReview(tasks, today, ticklerTasks)
        : dailyKind === 'close'
        ? closeDay(tasks, today)
        : null,
    [dailyKind, tasks, today, ticklerTasks]
  );
  // (3.24) lo que mira la revisión semanal (solo con ella abierta)
  const reviewData = useMemo(() => {
    if (reviewStep === null) return null;
    const r = weeklyReview(tasks, today, lastReview);
    // (4.15) objetivos de Horizontes (si la sección está encendida)
    r.goals =
      horizonsOn && horizons
        ? horizons.objectives
            .filter((o) => !o.done)
            .map((o) => ({ key: o.key, title: o.title, area: o.area }))
        : [];
    return r;
  }, [reviewStep, tasks, today, lastReview, horizonsOn, horizons]);
  const counts = useMemo(() => {
    const c = countsFor(tasks, { area }, today);
    // (3.01) secuenciales: en Next cuenta solo la primera acción de cada proyecto
    if (groupMode === 'sequential') {
      c.next = firstPerProject(
        tasksForView(tasks, { id: 'next' }, { area }, today),
        tasks,
        today
      ).length;
    }
    return c;
  }, [tasks, area, today, groupMode]);
  const projects = useMemo(() => projectsOf(tasks, { area }), [tasks, area]);
  const allProjects = useMemo(() => projectsOf(tasks, {}), [tasks]);
  const overview = useMemo(
    () =>
      view.id === 'projects'
        ? projectsOverview(tasks, { area }, today)
        : { active: [], scheduled: [], sleep: [] },
    [view.id, tasks, area, today]
  );
  // (4.07) página «Horizontes» y su revisión
  const horizonsBusy = horizonsOn || view.id === 'horizons' || dailyKind === 'horizons';
  const hView = useMemo(() => (horizonsBusy ? horizonsView(horizons, tasks, today) : null), [
    horizonsBusy,
    horizons,
    tasks,
    today,
  ]);
  // (4.16) avisos de frecuencias de revisión (proyectos = la revisión semanal)
  const [hzLast, setHzLast] = useState(() => getHzLastReview());
  const hzReminders = useMemo(() => {
    if (!horizonsBusy) return [];
    const d = lastReview ? new Date(lastReview) : null;
    const projects =
      d && !isNaN(+d)
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
            d.getDate()
          ).padStart(2, '0')}`
        : null;
    return horizonReminders({ ...hzLast, projects }, today);
  }, [horizonsBusy, hzLast, lastReview, today]);
  // ORG Mode para Eli: proyectos activos, programados (SCHEDULED a futuro) y dormidos (:STATUS: sleep)
  const projectGroups = useMemo(() => {
    const g = { active: [], scheduled: [], sleep: [] };
    projects.forEach((p) => g[projectState(p, today)].push(p));
    return g;
  }, [projects, today]);
  const areas = useMemo(() => areasOf(tasks), [tasks]);
  // (4.20) tiempo registrado por tarea (con subtareas y acciones de proyecto)
  const clockTotals = useMemo(() => clockTotalsOf(tasks), [tasks]);

  // (4.21) Tickler: sus entradas con el Área y el texto de la sección (las etiquetas salen de ahí)
  const baseList = useMemo(
    () =>
      view.id === 'tickler'
        ? filterTickler(ticklerTasks, { area, text })
        : tasksForView(tasks, view, { area, text }, today),
    [tasks, view, area, text, today, ticklerTasks]
  );
  const facets = useMemo(() => facetsFor(baseList, { ownOnly: tagInherit !== 'all' }), [
    baseList,
    tagInherit,
  ]);
  // 3.36 (a): el buscador del menú lateral busca en TODAS las secciones; resultados agrupados
  // por sección en el orden del menú (las ocultas en Ajustes no salen; Agenda tampoco)
  const searchGroups = useMemo(() => {
    const q = searchText.trim();
    if (!q) return null;
    const out = [];
    gtdCfg.order.forEach((id) => {
      if (isSepId(id) || isActionSection(id) || !isSectionShown(id, gtdCfg)) return;
      const label = sectionLabel(id, gtdCfg);
      if (id === 'projects') {
        const lq = q.toLowerCase();
        const list = projects.filter((p) =>
          `${p.title} ${p.description || ''}`.toLowerCase().includes(lq)
        );
        if (list.length) out.push({ id, label, icon: 'fas fa-project-diagram', list });
        return;
      }
      const def = [...LISTS, ...EXTRA_LISTS].find((l) => l.id === id) || sectionDef(id, gtdCfg);
      if (!def) return;
      const list = tasksForView(tasks, { id }, { area, text: q }, today);
      if (list.length) out.push({ id, label, icon: def.icon, list });
    });
    return out;
  }, [searchText, gtdCfg, projects, tasks, area, today]);
  const logSearch = view.id === 'logbook' ? logText : '';
  const visible = useMemo(
    () => tasksForView(tasks, view, { area, text, ...filters, logText: logSearch }, today),
    [tasks, view, area, text, filters, today, logSearch]
  );
  // ORG Mode para Eli: en Scheduled, los hábitos van siempre abajo, en su propia sección; en el
  // Logbook, secciones por fecha de cierre (esta semana, la pasada, el mes pasado, este año…)
  const splitHabits = view.id === 'scheduled';
  const rendered = useMemo(() => {
    // Scheduled: programadas normales, luego las que se repiten y al final los hábitos
    let list = splitHabits
      ? [
          ...visible.filter((t) => !t.isHabit && !t.repeats),
          ...visible.filter((t) => !t.isHabit && t.repeats),
          ...visible.filter((t) => t.isHabit),
        ]
      : sortDue && !['scheduled', 'deadline', 'logbook'].includes(view.id)
      ? sortByDue(visible)
      : visible;
    // (3.01) «Acciones siguientes secuenciales» (como Nirvana): en Next, solo la primera acción
    // de cada proyecto
    // (3.05) las en espera / programadas del proyecto que vayan antes la bloquean
    if (view.id === 'next' && groupMode === 'sequential') {
      list = firstPerProject(list, tasks, today);
      // (3.09) en dos partes: «Sin proyecto» (sueltas) y «Proyectos» (la siguiente de cada uno)
      list = [...list.filter((t) => !t.project), ...list.filter((t) => !!t.project)];
    }
    if (freshKeys.length) {
      const fresh = freshKeys.map((k) => list.find((t) => t.key === k)).filter(Boolean);
      if (fresh.length) list = [...fresh, ...list.filter((t) => !freshKeys.includes(t.key))];
    }
    return list;
  }, [visible, splitHabits, freshKeys, sortDue, view.id, groupMode, tasks, today]);
  const sectionStarts = useMemo(() => {
    const out = {};
    if (splitHabits) {
      const isFresh = (t) => freshKeys.includes(t.key);
      const firstRep = rendered.find((t) => !isFresh(t) && !t.isHabit && t.repeats);
      if (firstRep)
        out[firstRep.key] = { id: 'repeats', label: 'Se repiten', icon: 'fas fa-sync-alt' };
      const first = rendered.find((t) => !isFresh(t) && t.isHabit);
      if (first) out[first.key] = { id: 'habits', label: 'Hábitos', icon: 'fas fa-redo-alt' };
    } else if (view.id === 'next' && groupMode === 'sequential') {
      const isFresh = (t) => freshKeys.includes(t.key);
      const firstLoose = rendered.find((t) => !isFresh(t) && !t.project);
      const firstProj = rendered.find((t) => !isFresh(t) && !!t.project);
      if (firstLoose)
        out[firstLoose.key] = { id: 'seq-loose', label: 'Sin proyecto', icon: 'fas fa-inbox' };
      if (firstProj)
        out[firstProj.key] = {
          id: 'seq-projects',
          label: 'Proyectos',
          icon: 'fas fa-project-diagram',
        };
    } else if (view.id === 'logbook') {
      let prev = null;
      rendered.forEach((t) => {
        const g = logbookGroupOf(t.closed, today);
        if (g.id !== prev) out[t.key] = { ...g, icon: 'fas fa-check' };
        prev = g.id;
      });
    }
    return out;
  }, [rendered, splitHabits, view.id, today, freshKeys, groupMode]);

  // ORG Mode para Eli (2.15): lo que se pinta en la lista: cabeceras y filas. En un proyecto, por
  // secciones de estado (como Nirvana); en las listas, opcionalmente agrupado por proyecto.
  const isProjectView = view.type === 'project';
  const canGroup = !isProjectView && isGroupableList(view.id);
  const grouped = canGroup && groupMode === 'project';
  const groupedByStatus =
    !isProjectView && (view.id === 'focus' || view.id === 'tag') && groupMode === 'status';
  const canReorderLoose = !isProjectView && isGroupableList(view.id);
  const projSections = useMemo(
    () =>
      isProjectView
        ? projectSections(tasks, view.key, { area, text, ...filters }, today, {
            sequential: groupMode === 'sequential',
          })
        : null,
    [isProjectView, tasks, view.key, area, text, filters, today, groupMode]
  );
  const onReorderDropRef = useRef(null);
  const rowDragRef = useRef({});
  const { onPointerDown, dragging, dropTarget, dropSection, clickSuppressed } = useRowDrag({
    onDrop: (list, id) => rowDragRef.current.onDrop(list, id),
    onReorder: (task, pos) => onReorderDropRef.current && onReorderDropRef.current(task, pos),
    onStart: (t) => rowDragRef.current.onStart(t),
    onNearEdge: (t) => rowDragRef.current.onNearEdge(t),
    onAwayFromEdge: (t) => rowDragRef.current.onAwayFromEdge(t),
    canSwipe: (task) => rowDragRef.current.canSwipe(task),
    onSwipe: (task, dir) => rowDragRef.current.onSwipe(task, dir),
    dragSet: (task) => rowDragRef.current.dragSet(task),
    canReorder: (task) => rowDragRef.current.canReorder(task),
  });
  const reorderingKey = dragging && dragging.length === 1 ? dragging[0] : null;
  // (3.0) grupo «Hecho» de esta lista (terminadas aún sin pasar al Logbook)
  const doneList = useMemo(() => doneForView(tasks, view, { area, text, ...filters }), [
    tasks,
    view,
    area,
    text,
    filters,
  ]);
  const cleanupCount = useMemo(() => doneWaitingCleanup(tasks).length, [tasks]);
  const tagHeadings = useMemo(() => {
    if (view.id !== 'tag' || !headingTags.includes(view.tag)) return [];
    const f = { area, text, ...filters };
    return tasks
      .filter(
        (t) =>
          !t.keyword &&
          !t.isTrashed &&
          !t.isProject &&
          (t.tags || []).includes(view.tag) &&
          listOf(t, today) !== 'inbox' &&
          matchesFilters(t, f)
      )
      .sort((a, b) => (a.path === b.path ? a.index - b.index : a.path.localeCompare(b.path)));
  }, [view, headingTags, tasks, area, text, filters, today]);
  const buildDeps = useMemo(
    () => ({}),
    // eslint-disable-next-line
    [
      isProjectView,
      projSections,
      grouped,
      groupedByStatus,
      doneList,
      doneGroupOpen,
      tagHeadings,
      headingsOpen,
      rendered,
      sectionStarts,
      today,
      canReorderLoose,
      doneOpen,
      refsOpen,
      reorderingKey,
    ]
  );
  // (2.16) La tarea abierta en el editor no desaparece de la lista aunque deje de encajar en
  // ella (p. ej. al terminarla desde el editor): se queda en su sitio hasta cerrarla
  const stickyRef = useRef(null);
  const [folded, setFolded] = useState(() => new Set(readLS(LS_FOLDED, [])));
  const toggleFold = (task) =>
    setFolded((s) => {
      const id = foldIdOf(task);
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      writeLS(LS_FOLDED, [...n].slice(-500));
      return n;
    });
  const tasksByKey = useMemo(() => new Map(tasks.map((t) => [t.key, t])), [tasks]);
  // (2.18) Tarea madre (con estado, no proyecto) de una subtarea
  const parentTaskOf = (t) => {
    const p = t && t.parentId ? tasksByKey.get(`${t.path}::${t.parentId}`) : null;
    return p && p.keyword && !p.isProject ? p : null;
  };
  // (3.46) la madre que se enseña (con el interruptor «Subtareas» apagado, ninguna); para mover
  // y reordenar se sigue usando la de verdad (parentTaskOf)
  const shownParentOf = (t) => (subtasksOn ? parentTaskOf(t) : null);
  const parentTitleOf = (t) => {
    const p = shownParentOf(t);
    return p ? p.title : null;
  };
  const items = useMemo(() => {
    // (2.17) subtareas bajo su tarea (no en las vistas ordenadas por fecha)
    const byDate = ['focus', 'scheduled', 'deadline', 'logbook', 'trash', 'tag'].includes(view.id);
    const nested = subtasksOn
      ? nestSubtasks(buildItems(), byDate ? () => true : null)
      : buildItems();
    // (3.02) subtareas plegadas (▸): se ocultan los descendientes de las tareas plegadas
    const out = [];
    let hideBelow = null;
    nested.forEach((i) => {
      if (i.kind !== 'task') {
        hideBelow = null;
        out.push(i);
        return;
      }
      const d = i.depth || 0;
      if (hideBelow !== null) {
        if (d > hideBelow) return;
        hideBelow = null;
      }
      if (i.hasKids && folded.has(foldIdOf(i.task))) {
        out.push({ ...i, folded: true });
        hideBelow = d;
      } else {
        out.push(i);
      }
    });
    if (openKey) {
      const at = out.findIndex((i) => i.kind === 'task' && i.task.key === openKey);
      if (at >= 0) {
        stickyRef.current = { key: openKey, index: at, section: out[at].section };
      } else if (stickyRef.current && stickyRef.current.key === openKey) {
        const task = tasks.find((t) => t.key === openKey);
        if (task) {
          out.splice(Math.min(stickyRef.current.index, out.length), 0, {
            kind: 'task',
            task,
            section: stickyRef.current.section,
            reorderable: false,
          });
        }
      }
    } else {
      stickyRef.current = null;
    }
    return out;
    // eslint-disable-next-line
  }, [buildDeps, openKey, tasks, view.id, folded, subtasksOn]);
  function buildItems() {
    const out = buildMainItems();
    // (3.01) Vista de una etiqueta con «cabeceras sin tarea»: los encabezados sin estado que la
    // llevan, en un grupo aparte debajo de las acciones (tocarlos abre su fichero)
    if (tagHeadings.length) {
      out.push({
        kind: 'header',
        id: 'tag-headings',
        section: 'tag-headings',
        label: 'Cabeceras sin tarea',
        icon: 'far fa-file-alt',
        count: tagHeadings.length,
        collapsible: true,
        collapsed: !headingsOpen,
        toggle: 'tagHeadings',
        testId: 'gtd-tag-headings',
      });
      if (headingsOpen) {
        tagHeadings.forEach((t) =>
          out.push({
            kind: 'task',
            task: t,
            section: 'tag-headings',
            reorderable: false,
            isRef: true,
          })
        );
      }
    }
    // (3.0) Grupo «Hecho» al final (como Nirvana): las terminadas desde esta lista hasta la
    // Limpieza (c). Se pliega tocando «Hecho».
    if (doneList.length) {
      out.push({
        kind: 'header',
        id: 'done-group',
        section: 'done-group',
        label: 'Hecho',
        icon: 'fas fa-check',
        count: doneList.length,
        collapsible: true,
        collapsed: !doneGroupOpen,
        toggle: 'doneGroup',
        testId: 'gtd-done-group',
      });
      if (doneGroupOpen) {
        doneList.forEach((t) =>
          out.push({ kind: 'task', task: t, section: 'done-group', reorderable: false })
        );
      }
    }
    return out;
  }
  function buildMainItems() {
    const out = [];
    if (groupedByStatus) {
      // (3.0) Focus agrupado por estado (como Nirvana): Next, Todo, Waiting…, y los proyectos
      const order = ['inbox', 'next', 'later', 'waiting', 'scheduled', 'someday', 'reference'];
      const label = (id) => (id === 'project' ? 'Proyectos' : sectionLabel(id, gtdCfg) || id);
      const groups = {};
      rendered.forEach((t) => {
        const l = t.isProject ? 'project' : listOf(t, today) || 'later';
        const id = order.includes(l) || l === 'project' ? l : 'later';
        (groups[id] = groups[id] || []).push(t);
      });
      [...order, 'project'].forEach((id) => {
        if (!groups[id]) return;
        out.push({
          kind: 'header',
          id: `st-${id}`,
          section: `st:${id}`,
          label: label(id),
          icon: id === 'project' ? 'fas fa-project-diagram' : (sectionDef(id, gtdCfg) || {}).icon,
          count: groups[id].length,
          testId: 'gtd-group-status',
        });
        // (3.45) se pueden arrastrar a otro grupo de estado (cambia el estado; no el orden)
        groups[id].forEach((t) =>
          out.push({
            kind: 'task',
            task: t,
            section: `st:${id}`,
            reorderable: !t.isProject && !t.isDone && !t.isHabit,
          })
        );
      });
      return out;
    }
    if (isProjectView && projSections) {
      // (3.05) «Referencias» justo después de las notas del proyecto (arriba del todo)
      const ordered = [
        ...projSections.filter((sec) => sec.id === 'refs'),
        ...projSections.filter((sec) => sec.id !== 'refs'),
      ];
      ordered.forEach((sec) => {
        const isDone = sec.id === 'done';
        const isRefs = sec.id === 'refs';
        // (4.22) cada referencia lleva su contenido (y el de las que cuelgan de ella) tras el botón
        // de notas; las anidadas no salen aparte
        const secTasks = isRefs ? collapseRefs(tasks, sec.tasks) : sec.tasks;
        // Mientras se arrastra se ven también las secciones vacías (para poder soltar en ellas)
        if (!secTasks.length && (!reorderingKey || isRefs)) return;
        const open = isRefs ? refsOpen : doneOpen;
        out.push({
          kind: 'header',
          id: `ps-${sec.id}`,
          section: sec.id,
          label: sec.label,
          icon: sec.icon,
          count: secTasks.length,
          reorder: !isRefs,
          collapsible: isDone || isRefs,
          collapsed: (isDone || isRefs) && !open,
          toggle: isRefs ? 'refs' : 'done',
          psec: true,
          testId: `gtd-psec-${sec.id}`,
        });
        if ((isDone || isRefs) && !open) return;
        secTasks.forEach((t) =>
          out.push({
            kind: 'task',
            task: t,
            section: sec.id,
            reorderable: !isDone && !isRefs,
            isRef: isRefs,
          })
        );
      });
      return out;
    }
    if (grouped) {
      const { loose, groups } = groupByProject(rendered, today);
      if (loose.length && groups.length) {
        out.push({
          kind: 'header',
          id: 'g-loose',
          section: 'loose',
          label: 'Sin proyecto',
          icon: 'far fa-circle',
          count: loose.length,
          reorder: true,
          testId: 'gtd-group-loose',
        });
      }
      loose.forEach((t) =>
        out.push({
          kind: 'task',
          task: t,
          section: 'loose',
          reorderable: canReorderLoose && !t.isDone && !t.scheduled && !t.deadline,
        })
      );
      groups.forEach((g) => {
        out.push({
          kind: 'header',
          id: `g-${g.key}`,
          section: `proj:${g.key}`,
          label: g.project.title,
          icon: 'fas fa-project-diagram',
          count: g.tasks.length,
          reorder: true,
          projectKey: g.key,
          testId: 'gtd-group-project',
        });
        g.tasks.forEach((t) =>
          out.push({ kind: 'task', task: t, section: `proj:${g.key}`, reorderable: false })
        );
      });
      return out;
    }
    rendered.forEach((t) => {
      if (sectionStarts[t.key]) {
        out.push({ kind: 'header', id: `s-${t.key}`, info: sectionStarts[t.key] });
      }
      out.push({
        kind: 'task',
        task: t,
        section: 'list',
        // Solo las sueltas sin fechas: las que tienen fecha las ordena la fecha
        reorderable: canReorderLoose && !t.project && !t.isDone && !t.scheduled && !t.deadline,
      });
    });
    return out;
  }

  // ORG Mode para Eli: Logbook → terminadas sin archivar (todas, no solo las 300 que se ven) y
  // botones para archivarlas de una vez, en total o por sección
  const isLogbook = view.id === 'logbook';
  const archivable = useMemo(() => {
    if (!isLogbook) return { ok: [], blocked: [] };
    const f = { area, text, ...filters, logText: logSearch };
    const { ok, blocked } = archivableDone(tasks, gtdCfg.files.archive);
    return {
      ok: ok.filter((t) => matchesFilters(t, f)),
      blocked: blocked.filter((t) => matchesFilters(t, f)),
    };
  }, [isLogbook, tasks, area, text, filters, logSearch, gtdCfg]);
  // (2.16) Logbook → «Archivadas»: las tareas de los ficheros *.org_archive (solo para verlas;
  // tocarlas abre su fichero)
  const [showArchived, setShowArchivedState] = useState(() => getShowArchived());
  const [loadingArchived, setLoadingArchived] = useState(false);
  useEffect(() => {
    const on = (e) => setShowArchivedState(!!(e && e.detail));
    window.addEventListener('eli:archived', on);
    return () => window.removeEventListener('eli:archived', on);
  }, []);
  useEffect(() => {
    if (!isLogbook || !showArchived) return;
    let alive = true;
    setLoadingArchived(true);
    Promise.resolve(dispatch(eliLoadArchivedFiles()))
      .catch(() => null)
      .then(() => alive && setLoadingArchived(false));
    return () => {
      alive = false;
    };
  }, [isLogbook, showArchived, dispatch]);
  const archivedTasks = useMemo(() => {
    if (!isLogbook || !showArchived) return [];
    const archFiles = files.filter((f, p) => isArchiveFile(p) && f && f.get('headers'));
    const f = { area, text, ...filters, logText: logSearch };
    return buildTasks(archFiles, [])
      .filter((t) => t.keyword && matchesFilters(t, f))
      .sort((a, b) => (b.closed || 0) - (a.closed || 0))
      .slice(0, 300);
  }, [isLogbook, showArchived, files, area, text, filters, logSearch]);

  const archivableBySection = useMemo(() => {
    const out = {};
    archivable.ok.forEach((t) => {
      const g = logbookGroupOf(t.closed, today).id;
      (out[g] = out[g] || []).push(t);
    });
    return out;
  }, [archivable, today]);
  const archiveTasks = async (list, label) => {
    if (!list.length) return;
    const n = list.length;
    const ok = await askConfirm({
      title: 'Archivar',
      message:
        `¿Archivar ${n === 1 ? '1 tarea terminada' : `${n} tareas terminadas`}` +
        (label ? ` (${label.toLowerCase()})` : '') +
        '?\n\nSe moverán con sus subencabezados al fichero _archive de su fichero' +
        (archiveInSubfolder ? ', en la subcarpeta archive de su carpeta' : '') +
        ', como hace Emacs (org-archive-subtree).' +
        // (3.43) aviso de las que se quedan
        (!label && archivable.blocked.length
          ? `\n\n${archivable.blocked.length} no se archiva${
              archivable.blocked.length === 1 ? '' : 'n'
            }: tiene${
              archivable.blocked.length === 1 ? '' : 'n'
            } alguna subtarea abierta o es de un proyecto que sigue abierto.`
          : ''),
      okLabel: 'Archivar',
    });
    if (!ok) return;
    setOpenKey(null);
    await dispatch(eliArchiveMany(list.map((t) => ({ path: t.path, id: t.id }))));
  };
  const projectTask =
    view.type === 'project' ? tasks.find((t) => t.key === view.key && t.isProject) : null;

  const declaredTags = useMemo(
    () =>
      declaredTagsFromConfigLines(
        scopePaths.flatMap((p) => (files.getIn([p, 'fileConfigLines']) || List()).toArray())
      ),
    [files, scopePaths]
  );
  // Etiquetas predefinidas (contextos @ de #+TAGS, y @inbox) para elegir con un clic
  // Contextos: los de Ajustes (por defecto) y los @ declarados en #+TAGS de los ficheros
  const contextTags = useMemo(() => {
    const at = declaredTags.filter((t) => t.startsWith('@') && t.length > 1);
    const all = Array.from(new Set([...defaultTags(), ...at]));
    const it = inboxTag();
    return all.some((t) => t.toLowerCase() === it.toLowerCase()) ? all : [...all, it];
    // eslint-disable-next-line
  }, [declaredTags, gtdCfg]);

  // Energía y tiempo: «#+PROPERTY: Energy_ALL …» / «Effort_ALL …» de los ficheros, o los de
  // por defecto
  const configLines = useMemo(
    () => scopePaths.flatMap((p) => (files.getIn([p, 'fileConfigLines']) || List()).toArray()),
    [files, scopePaths]
  );
  const energyOptions = useMemo(
    () => allowedValuesFromConfigLines(configLines, 'Energy', DEFAULT_ENERGY),
    [configLines]
  );
  const effortOptions = useMemo(
    () => allowedValuesFromConfigLines(configLines, 'Effort', DEFAULT_EFFORT),
    [configLines]
  );

  // Al llegar la fecha programada, ★ [#A] automática (una sola vez por tarea y fecha)
  useEffect(() => {
    if (pendingLoads) return; // esperar a que terminen de cargarse los ficheros
    const due = tasks.filter((t) => needsAutoPriority(t, today));
    if (!due.length) return;
    const done = new Set(readLS(LS_AUTO_A, []));
    const fresh = due.filter((t) => !done.has(autoPriorityKey(t, today)));
    if (!fresh.length) return;
    fresh.forEach((t) => {
      done.add(autoPriorityKey(t, today));
      dispatch(gtdSaveTask(t, { priority: 'A' }));
    });
    writeLS(LS_AUTO_A, Array.from(done).slice(-1000));
  }, [tasks, today, pendingLoads, dispatch]);

  const openLink = (task, target) => {
    const file = fileLinkTarget(target);
    const path = file && resolveDropboxPath(task.path, file);
    if (path) {
      openInNewTab(client, path).catch((e) =>
        showMessage('No se pudo abrir', `${path}\n\n${(e && e.message) || ''}`.trim())
      );
      return;
    }
    // (4.22) Enlace por :ID: a una tarea que GTD conoce: se abre en GTD; si no, como documento
    const idLink = parseOrgLink(target);
    // (4.26) un día del diario: la hoja del Diario
    if (idLink && idLink.id && diaryLinkDetail(idLink.id) && !taskByOrgId(tasks, idLink.id)) {
      openDiary(diaryLinkDetail(idLink.id));
      return;
    }
    if (idLink && idLink.id && !idLink.path) {
      const known = taskByOrgId(tasks, idLink.id);
      // (solo lo que GTD enseña en alguna lista o proyecto; un encabezado suelto se abre como documento)
      if (known && (known.keyword || known.isProject || listOf(known, today))) {
        if (known.isProject) goToProject({ path: known.path, id: known.id });
        else goToTask(known);
        return;
      }
    }
    // Enlace a un fichero .org o a un encabezado: se abre en la app, en ese encabezado
    if (parseOrgLink(target)) {
      // 2.15: con dos columnas, se puede abrir en la de al lado
      followOrgLinkSplitAware(target, task.path, () =>
        dispatch(eliFollowOrgLink(target, task.path))
      );
      return;
    }
    showMessage('Enlace', target);
  };

  // (3.09) enlaces de las notas a la vista (web o de la app)
  const openLinkAny = (task, target) => {
    if (/^(https?:|mailto:)/i.test(target || '')) {
      window.open(target, '_blank', 'noopener');
      return;
    }
    openLink(task, target);
  };

  const allTags = useMemo(() => {
    const declared = declaredTags;
    const used = new Set();
    tasks.forEach((t) => t.ownTags.forEach((x) => used.add(x)));
    return Array.from(new Set([...declared, ...Array.from(used).sort()]));
  }, [tasks, declaredTags]);

  const applyView = useCallback((v) => {
    setView(v);
    writeLS(LS_VIEW, v);
    setFilters({ ...EMPTY_FILTERS }); // como Nirvana
    // 3.36: el filtro de la sección se queda solo mientras se está en ella
    setText('');
    setSecFilterOpen(false);
    setOpenKey(null);
    setFreshKeys([]);
    // 3.35: al recorrer el menú con ↑ ↓ se queda abierto (en pantalla estrecha se cerraba)
    if (keepSideRef.current) keepSideRef.current = false;
    else setSideOpen(false);
    setSelKey(null);
  }, []);
  // 3.35: el historial (flechas ← →) solo apunta secciones (Inbox, Next…); abrir un proyecto no
  // crea entrada, así que ← desde un proyecto vuelve a la sección anterior
  const selectView = useCallback(
    (v) => {
      applyView(v);
      const l = history.location;
      if (v.type || !/^\/gtd(\/|$)/.test(l.pathname)) return;
      const cur = l.state && l.state.eliGtdView;
      if (JSON.stringify(v) === JSON.stringify(cur)) return;
      history.push(l.pathname + (l.search || ''), { ...(l.state || {}), eliGtdView: v });
    },
    [applyView, history]
  );
  // La entrada actual guarda la vista; al ir atrás/adelante (POP) se recupera la de esa entrada
  useEffect(() => {
    const l = history.location;
    if (!(l.state && l.state.eliGtdView) && !viewRef.current.type) {
      history.replace(l.pathname + (l.search || '') + (l.hash || ''), {
        ...(l.state || {}),
        eliGtdView: viewRef.current,
      });
    }
    return history.listen((location, action) => {
      if (action !== 'POP' || !/^\/gtd(\/|$)/.test(location.pathname)) return;
      const v = location.state && location.state.eliGtdView;
      if (v && JSON.stringify(v) !== JSON.stringify(viewRef.current)) {
        applyView(v);
        // 3.39a: las flechas de arriba (historial) solo cambian de sección; ya no abren el
        // menú lateral (eso lo hace ← del teclado)
      }
    });
  }, [history, applyView]);
  const selectArea = (a) => {
    setArea(a);
    writeLS(LS_AREA, a);
  };

  // ORG Mode para Eli: si la sección que se está viendo se ha ocultado en Ajustes, a la primera
  // que se vea
  useEffect(() => {
    const hidden =
      view.type === 'project'
        ? !isSectionShown('projects', gtdCfg)
        : view.id === 'projects'
        ? !isSectionShown('projects', gtdCfg) || gtdCfg.sections.projects.allProjects === false
        : // (2.16) una sección propia borrada tampoco existe ya
          !isSectionShown(view.id, gtdCfg) || (isCustomId(view.id) && !gtdCfg.sections[view.id]);
    if (!hidden) return;
    const first = gtdCfg.order.find(
      (id) => id !== 'projects' && !isActionSection(id) && isSectionShown(id, gtdCfg)
    );
    if (first && first !== view.id) selectView({ id: first });
  }, [view, gtdCfg, selectView]);

  // Si la vista guardada es un proyecto que ya no existe, volver a Focus
  useEffect(() => {
    if (view.type === 'project' && tasks.length && !projectTask) selectView({ id: 'focus' });
  }, [view, tasks, projectTask, selectView]);

  // Abrir en su fichero con la vista reducida (narrow) a la tarea o proyecto
  // (2.16) con dos columnas, pregunta si abrirla aquí o en la otra (Ctrl/⌘+clic: en la otra)
  const openInFile = (task, event) =>
    openSplitAware(
      () => {
        dispatch(selectHeaderAndOpenParents(task.path, task.id, { widen: true }));
        // (2.17) «Abrir»: el encabezado con sus subencabezados plegados (solo títulos)
        dispatch(eliNarrowAndExpand(task.id, { titlesOnly: true }));
        // …y al volver a GTD, la tarea sigue marcada
        lastOpenedTaskKey = task.key;
        history.push(`/file${task.path}`);
      },
      'eli:open-task',
      { path: task.path, index: task.index, title: task.rawTitle },
      event
    );

  // ORG Mode para Eli: «+» de Proyectos abre el editor con un proyecto nuevo; se crea al guardar
  const addProject = () => {
    setNewProject({ title: newTitle.trim(), stay: view.id === 'projects', rev: Date.now() });
    setNewTitle('');
    setOpenKey(null);
    setSideOpen(false);
  };
  const createProject = (changes, projectKey) => {
    const info = newProject || {};
    const title = (changes.rawTitle || '').trim();
    if (!title || !tasksFile) return;
    const parent = projectKey ? allProjects.find((p) => p.key === projectKey) : null;
    const target = parent ? { path: parent.path, parentId: parent.id } : { path: tasksFile };
    const newId = dispatch(
      gtdAddTask(target, {
        title,
        list: 'project',
        area: changes.area || null,
        priority: changes.priority || null,
        tags: changes.tags || [],
        scheduled: changes.scheduled || null,
        deadline: changes.deadline || null,
        notes: changes.notes || '',
        energy: changes.energy || null,
        effort: changes.effort || null,
      })
    );
    if (newId && !info.stay) selectView({ type: 'project', key: `${target.path}::${newId}` });
  };

  // ORG Mode para Eli (2.15): tarea NUEVA en un editor (como Nirvana): se abre sin título y con
  // las propiedades de la lista (estado, ★, fecha, proyecto, área…); no existe en el fichero hasta
  // que se guarda con título. Si se cierra sin título, no se crea nada.
  const [draft, setDraft] = useState(null);
  const day = (n) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + n);
  const areaPreset = area !== '*' && area !== '-' ? area : '';
  const draftFor = (kind, { top = false, before = null, after = null } = {}) => {
    let list = kind;
    if (kind === 'current') {
      if (isProjectView) list = 'next';
      else if (view.id === 'projects' || view.id === 'horizons' || view.id === 'tickler')
        return null;
      else list = view.id;
    }
    const d = {
      rev: Date.now(),
      top,
      before,
      after,
      list,
      keyword: undefined,
      priority: null,
      scheduled: null,
      deadline: null,
      tags: [...filters.tags],
      area: areaPreset,
      notes: '',
      target: { path: tasksFile },
      projectKey: isProjectView && projectTask ? projectTask.key : '',
    };
    if (isCustomId(list)) {
      // (2.16) sección propia: su primer estado (o TODO) y su primera etiqueta
      const sec = gtdCfg.sections[list] || { states: [], tags: [] };
      d.list = 'later';
      if (sec.states.length) d.keyword = sec.states[0];
      if (sec.tags.length) d.tags = Array.from(new Set([...d.tags, sec.tags[0]]));
    } else if (list === 'focus') {
      d.list = 'next';
      d.priority = 'A';
    } else if (list === 'scheduled') {
      d.list = 'later';
      d.scheduled = day(1);
    } else if (list === 'deadline') {
      d.list = 'later';
      d.deadline = day(0);
    } else if (list === 'logbook') {
      d.list = 'later';
    } else if (list === 'inbox') {
      d.target = { path: inboxFile || tasksFile };
      if (!inboxPaths.includes(d.target.path))
        d.tags = Array.from(new Set([...d.tags, inboxTag()]));
    }
    if (d.projectKey && projectTask && kind !== 'inbox' && kind !== 'reference') {
      d.target = { path: projectTask.path, parentId: projectTask.id };
    } else {
      d.projectKey = '';
    }
    // (3.0) encima (o 3.01: debajo) de otra tarea: con ella (mismo fichero, mismo encabezado y
    // mismo proyecto)
    const near = before || after;
    if (near && !near.isProject) {
      d.target = { path: near.path, parentId: near.parentId || null };
      d.projectKey =
        near.project && !near.projectExternal ? `${near.project.path}::${near.project.id}` : '';
      if (near.project && near.parentId !== near.project.id) d.projectKey = '';
      // (3.01) asignada a un proyecto de otro fichero: la nueva, también
      if (near.projectExternal && near.project) d.extProject = near.project;
    }
    return d;
  };
  const openDraft = (kind, opts) => {
    if (!tasksFile) return;
    const d = draftFor(kind, opts);
    if (!d) {
      addProject();
      return;
    }
    primeKeyboard(); // (3.17) teclado ya en el toque; el foco pasa al título al aparecer
    setOpenKey(null);
    setNewProject(null);
    setDraft(d);
  };
  // (3.38) «＋ Subtarea» del editor: la tarea abierta ya se ha guardado; se abre el editor de una
  // tarea nueva hija suya (en un proyecto: una acción suya), con el cursor en el título
  const addSubtask = (task) => {
    if (!task || !files.getIn([task.path, 'headers'])) return;
    const open = task.keyword && !task.isDone && !task.isProject ? task.keyword : undefined;
    primeKeyboard();
    setOpenKey(null);
    setNewProject(null);
    setDraft({
      rev: Date.now(),
      subtaskOf: task.title,
      list: task.isProject ? 'next' : 'later',
      keyword: open,
      priority: null,
      scheduled: null,
      deadline: null,
      tags: [],
      area: '',
      notes: '',
      target: { path: task.path, parentId: task.id },
      projectKey: task.isProject ? task.key : '',
    });
  };
  // Plantilla de captura (tecla c o botón): el editor de tarea nueva con lo que trae la plantilla
  // (4.18) opts: { templateId } (elegida en el Explorador), { name } (letra o nombre que trae
  // un enlace /capture?plantilla=…; si no existe, se pregunta) y { shared: { title, notes } }
  // (lo compartido desde fuera, dentro de la tarea)
  const captureWithTemplate = async (opts = {}) => {
    const list = templates.toArray();
    if (!list.length) {
      showMessage(
        'Plantillas de captura',
        'No tienes plantillas de captura. Añade alguna en Ajustes → Plantillas de captura.'
      );
      return;
    }
    const t =
      (opts.templateId && list.find((x) => x.get('id') === opts.templateId)) ||
      (opts.name && findCaptureTemplate(list, opts.name)) ||
      (await chooseCaptureTemplate(list));
    if (!t) return;
    primeKeyboard(); // (3.17) el foco irá al título de la tarea nueva
    const path = t.get('file') ? norm(t.get('file')) : tasksFile;
    const file = files.get(path);
    if (!file || !file.get('headers')) {
      showMessage('Plantilla', `No se ha podido abrir el fichero ${path} de la plantilla.`);
      return;
    }
    const parsed = parseCaptureTemplate(
      t.get('template') || '',
      file.get('todoKeywordSets') || List(),
      IMap()
    );
    const headerPath = (t.get('headerPaths') || List()).filter((x) => String(x || '').trim());
    const parent = headerPath.size ? headerWithPath(file.get('headers'), headerPath) : null;
    // La tarea de la plantilla, leída como las demás (título, estado, fechas, notas…)
    const fake = buildTasks(
      IMap({
        '/__plantilla__': IMap({
          headers: List([parsed.header.set('nestingLevel', 1)]),
          todoKeywordSets: file.get('todoKeywordSets') || List(),
        }),
      }),
      []
    )[0];
    if (!fake) return;
    // Sin recortar el final: «Llamar a %?» deja el cursor tras «a »
    const filled = fillCaptureDraft(
      (fake.rawTitle || '').replace(PRIORITY_RE, '').replace(/^\s+/, '').replace(/\s+$/, ' '),
      fake.description,
      opts.shared,
      parsed.initialSubEditor === 'title-editor'
    );
    setOpenKey(null);
    setNewProject(null);
    setDraft({
      rev: Date.now(),
      template: t.get('description') || t.get('letter') || '',
      list: null,
      keyword: fake.keyword,
      title: filled.title,
      priority: fake.priority,
      scheduled: fake.scheduled,
      deadline: fake.deadline,
      tags: fake.ownTags,
      area: fake.ownArea || areaPreset,
      notes: filled.notes,
      // (4.18) con lo compartido en las notas, el cuerpo de la plantilla las lleva
      templateHeader:
        filled.notes !== fake.description
          ? parsed.header.set('rawDescription', filled.notes)
          : parsed.header,
      target: { path, parentId: parent ? parent.get('id') : null },
      projectKey: '',
    });
  };
  const draftTask = (d) => {
    const keyword =
      d.keyword !== undefined
        ? d.keyword
        : keywordForList(d.list).has
        ? keywordForList(d.list).keyword
        : null;
    const proj = d.projectKey ? allProjects.find((p) => p.key === d.projectKey) : null;
    return {
      key: `__draft__${d.rev}`,
      path: d.target.path,
      keyword,
      isInboxFile: inboxPaths.includes(d.target.path),
      rawTitle: d.title || '',
      priority: d.priority,
      scheduled: d.scheduled,
      deadline: d.deadline,
      ownTags: d.tags,
      tags: d.tags,
      ownArea: d.area,
      description: d.notes || '',
      project: proj ? { path: proj.path, id: proj.id, title: proj.title } : null,
    };
  };
  const createFromDraft = (changes, projectKey, fromRapid = null) => {
    const d = fromRapid || draft;
    if (!d) return;
    // (3.09) sin título (pero con algo rellenado): «Capturado [fecha de hoy]»
    const title =
      (changes.rawTitle !== undefined ? changes.rawTitle : d.title || '').trim() || capturedTitle();
    const pk = projectKey !== undefined ? projectKey : d.projectKey;
    const parent = pk ? allProjects.find((p) => p.key === pk) : null;
    const target = parent ? { path: parent.path, parentId: parent.id } : d.target;
    if (!files.getIn([target.path, 'headers'])) return;
    // 1) se crea con lo que trae la lista (o la plantilla) y el título
    // Con plantilla, su cuerpo tal cual (propiedades, fechas, notas)
    const rawDescription = d.templateHeader
      ? createRawDescriptionText(
          d.templateHeader,
          false,
          store.getState().base.get('eliIndentOnExport') !== true
        )
      : undefined;
    const newId = dispatch(
      gtdAddTask(target, {
        title,
        list: d.list || undefined,
        keyword: d.keyword,
        priority: d.priority || null,
        tags: d.tags,
        area: d.area || null,
        scheduled: d.templateHeader ? null : d.scheduled,
        deadline: d.templateHeader ? null : d.deadline,
        rawDescription,
        // (2.17) sin plantilla, la tarea nueva lleva su fecha de creación
        created: !d.templateHeader,
      })
    );
    if (!newId) return;
    const key = `${target.path}::${newId}`;
    // 2) después, lo cambiado en el editor (lista, fechas, etiquetas, notas…)
    const rest = { ...changes };
    delete rest.rawTitle;
    // (3.01) junto a una tarea asignada a un proyecto de otro fichero: la nueva, también
    if (d.extProject) {
      const p = allProjects.find((x) => x.path === d.extProject.path && x.id === d.extProject.id);
      if (p) {
        const orgId = p.orgId || newOrgId();
        if (!p.orgId) dispatch(gtdSaveTask(p, { props: { ID: orgId } }));
        rest.props = {
          ...(rest.props || {}),
          [PROJECT_LINK_PROPERTY]: projectLinkFor(orgId, p.title),
        };
      }
    }
    // (3.10) la fecha de creación ya va en :PROPERTIES: (:CREATED:): las notas no la llevan
    const created = () =>
      buildTasks(
        IMap({ [target.path]: store.getState().org.present.getIn(['files', target.path]) }),
        inboxPaths
      ).find((t) => t.id === newId);
    if (Object.keys(rest).length) {
      const t = created();
      if (t) dispatch(gtdSaveTask(t, rest));
    }
    // (3.0) junto a otra tarea: el elemento nuevo va justo encima (3.01: o debajo, tras sus
    // subtareas) de ella, si es su hermana
    if (d.before || d.after) {
      const t = created();
      const b = d.before || d.after;
      if (t && b.path === target.path && (b.parentId || null) === (target.parentId || null)) {
        dispatch(
          gtdSaveTask(t, {
            moveNextTo: { targetId: b.id, position: d.before ? 'before' : 'after' },
          })
        );
      }
    }
    // 3) «arriba de la lista»: delante de la primera tarea que se ve de su mismo fichero
    if (d.top && !d.before && !d.after) {
      // …entre sus hermanas (mismo padre): si no, pasaría a otro encabezado o proyecto
      const parentId = target.parentId || null;
      const first = items.find(
        (i) =>
          i.kind === 'task' &&
          i.task.path === target.path &&
          i.task.id !== newId &&
          (i.task.parentId || null) === parentId
      );
      const t = created();
      if (first && t) {
        dispatch(gtdSaveTask(t, { moveNextTo: { targetId: first.task.id, position: 'before' } }));
      }
    }
    // la recién creada se ve arriba (con la Entrada rápida, solo con Mayús+Intro; si no, abajo)
    if (d.after) {
      // (3.01) debajo de la seleccionada: se queda ahí (no arriba) y pasa a ser la seleccionada
      setSelKey(key);
    } else if (!fromRapid || d.top) setFreshKeys((k) => [key, ...k.filter((x) => x !== key)]);
  };
  // (3.22) captura rápida (/capture?text=…): en cuanto están cargados los ficheros, al Inbox
  const quickCaptureDone = useRef(false);
  useEffect(() => {
    if (pendingLoads || quickCaptureDone.current || !tasksFile) return;
    const c = peekQuickCapture();
    if (!c) return;
    // (4.18) con plantilla (/capture?…&plantilla=…): su editor, con lo compartido dentro
    if (c.withTemplate) {
      if (!files.getIn([tasksFile, 'headers'])) return;
      quickCaptureDone.current = true;
      takeQuickCapture();
      captureWithTemplate({ name: c.template, shared: { title: c.title, notes: c.notes } });
      return;
    }
    const d = draftFor('inbox');
    if (!d || !files.getIn([d.target.path, 'headers'])) return;
    quickCaptureDone.current = true;
    takeQuickCapture();
    // Sin los filtros de la vista: solo la etiqueta del Inbox si hace falta
    const base = {
      ...d,
      top: false,
      before: null,
      after: null,
      tags: d.tags.filter((t) => t === inboxTag()),
      area: null,
      title: c.title,
    };
    if (view.id !== 'inbox') selectView({ id: 'inbox' });
    if (c.edit) {
      primeKeyboard();
      setOpenKey(null);
      setNewProject(null);
      setDraft({ ...base, notes: c.notes || '' });
      return;
    }
    createFromDraft(c.notes ? { notes: c.notes } : {}, '', base);
    dispatch(setDisappearingLoadingMessage(`Añadido al Inbox: ${c.title}`, 2500));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingLoads, tasksFile, files]);
  // (3.0) Entrada rápida (como Nirvana): Intro añade al final de la lista, Mayús+Intro arriba;
  // «#etiqueta», «#due fecha», «#focus»/«#star», «#next»/«#someday», «#project»
  const addRapid = (top) => {
    const r = parseRapidEntry(rapidText, today);
    if (!r.title) return;
    if (r.badDate) {
      showMessage('Entrada rápida', `No entiendo la fecha «${r.badDate}».`);
      return;
    }
    if (r.project) {
      if (!tasksFile) return;
      const newId = dispatch(
        gtdAddTask(
          { path: tasksFile },
          {
            title: r.title,
            list: 'project',
            area: areaPreset || null,
            priority: r.focus ? 'A' : null,
            tags: Array.from(new Set([...filters.tags, ...r.tags])),
            deadline: r.deadline,
          }
        )
      );
      if (newId) setRapidText('');
      return;
    }
    // (3.01) «>Proyecto»: la tarea va a ese proyecto
    let proj = null;
    if (r.projectName) {
      proj = findProjectByName(allProjects, r.projectName);
      if (!proj || proj === 'many') {
        showMessage(
          'Entrada rápida',
          proj === 'many'
            ? `Hay varios proyectos con «${r.projectName}»: elígelo de la lista que sale al escribir «>».`
            : `No encuentro el proyecto «${r.projectName}».`
        );
        return;
      }
    }
    const kind = r.list && !isProjectView ? r.list : 'current';
    const d = draftFor(view.id === 'projects' && kind === 'current' ? 'next' : kind, { top });
    if (!d) return;
    const rapid = {
      ...d,
      title: r.title,
      tags: Array.from(new Set([...d.tags, ...r.tags])),
      priority: r.focus ? 'A' : d.priority,
      deadline: r.deadline || d.deadline,
    };
    if (r.list && isProjectView) {
      rapid.list = r.list;
    }
    if (proj) {
      rapid.projectKey = proj.key;
      if (['inbox', 'reference'].includes(rapid.list) || !keywordForList(rapid.list).has) {
        rapid.list = 'next';
        rapid.keyword = undefined;
        rapid.tags = rapid.tags.filter((x) => x.toLowerCase() !== inboxTag().toLowerCase());
      }
    }
    createFromDraft({}, undefined, rapid);
    setRapidText('');
  };
  const acToken = rapidOn && !acClosed ? rapidTokenAt(rapidText, rapidCaret) : null;
  const acList = acToken
    ? rapidSuggestions(acToken, {
        tags: Array.from(new Set([...contextTags, ...allTags])).filter((t) => !hasTrashTag([t])),
        projects: projectGroups.active.concat(projectGroups.scheduled, projectGroups.sleep),
      })
    : [];
  const acceptSuggestion = (sug, input) => {
    if (!sug || !acToken) return;
    const r = applyRapidSuggestion(rapidText, rapidCaret, acToken, sug);
    setRapidText(r.text);
    setRapidCaret(r.caret);
    setAcIndex(0);
    setTimeout(() => {
      if (input && input.setSelectionRange) {
        input.focus();
        input.setSelectionRange(r.caret, r.caret);
      }
    }, 0);
  };
  const renderDraftEditor = () => (
    <div className="gtd-new-project gtd-new-task" data-testid="gtd-new-task">
      {draft.template && (
        <div className="gtd-new-task__template">
          <i className="fas fa-plus" /> Plantilla: {draft.template}
        </div>
      )}
      {draft.subtaskOf && (
        <div className="gtd-new-task__template" data-testid="gtd-new-subtask-of">
          <i className="fas fa-level-up-alt fa-rotate-90" /> Subtarea de «{draft.subtaskOf}»
        </div>
      )}
      <TaskEditor
        key={'draft:' + draft.rev}
        isNew
        task={draftTask(draft)}
        projects={allProjects}
        areas={areas}
        allTags={allTags}
        contextTags={contextTags}
        onSave={createFromDraft}
        onAttachFiles={(list, target) =>
          openUploadDialog({ files: list, source: 'attach', path: draft.target.path, target })
        }
        onClose={() => setDraft(null)}
        energyOptions={energyOptions}
        effortOptions={effortOptions}
      />
    </div>
  );

  // ORG Mode para Eli: cerrar un proyecto (terminado o cancelado), con confirmación
  const closeProject = async (project) => {
    const open = tasks.filter(
      (t) =>
        !t.isDone &&
        !t.isProject &&
        !!t.keyword &&
        t.project &&
        t.project.path === project.path &&
        t.project.id === project.id
    );
    const answer = await askCloseProject({ title: project.title, openCount: open.length });
    if (!answer) return false;
    setOpenKey(null);
    dispatch(gtdCloseProject(project, answer.state, answer.cancelOpen ? open : []));
    if (view.type === 'project' && view.key === project.key) selectView({ id: 'projects' });
    return true;
  };

  // (3.06) Completar una tarea con subtareas abiertas: «¿Marcar también las subtareas como
  // hechas?». Devuelve las entradas a guardar con ellas ([] = solo esta) o null (cancelar).
  const subtaskEntries = async (list, opts = {}) => {
    if (!subtasksOn) return [];
    const subs = [];
    const keys = new Set(list.map((t) => t.key));
    list
      .filter((t) => !t.isDone && !t.isProject)
      .forEach((t) =>
        openSubtasksOf(tasks, t).forEach((s) => {
          if (!keys.has(s.key)) {
            keys.add(s.key);
            subs.push(s);
          }
        })
      );
    if (!subs.length) return [];
    const what = await askChoice({
      title: 'Subtareas',
      message: `¿Marcar también las subtareas como hechas? (${
        subs.length === 1 ? '1 abierta' : `${subs.length} abiertas`
      })`,
      choices: [
        { id: 'one', label: 'Solo esta' },
        { id: 'all', label: 'Sí, todas' },
      ],
    });
    if (!what) return null;
    return what === 'all' ? subs.map((s) => [s, doneChangesFor(s, opts)]) : [];
  };
  // (4.22) Llevar una tarea a un proyecto (o sacarla): en su fichero, el de tareas o el Inbox se
  // mueve; en cualquier otro fichero se enlaza con :PROYECTO: sin moverla
  const placeInProject = (task, project) => {
    if (!project) {
      if (task.projRefOwn) dispatch(gtdUnassignProject([task]));
      else if (!task.projectExternal) dispatch(gtdMoveToProject(task, null));
      return;
    }
    if (linksInsteadOfMoves(task, project, { tasksPath: tasksFile, inboxPaths })) {
      dispatch(gtdAssignProject([task], project));
      return;
    }
    dispatch(gtdMoveToProject(task, { path: project.path, id: project.id }));
  };
  const saveTask = async (task, changes, projectKey) => {
    // (3.06) completada desde el editor: lo mismo con sus subtareas (cancelar = solo esta)
    if (!task.isDone && !task.isProject && ['done', 'cancelled'].includes(changes.list)) {
      const extra = await subtaskEntries([task], { cancel: changes.list === 'cancelled' });
      if (extra && extra.length) dispatch(gtdSaveMany(extra));
    }
    dispatch(gtdSaveTask(task, changes));
    procNoteSaved(task, changes);
    // Proyecto convertido en tarea desde su propia vista: se va a Todo, donde queda la tarea
    if (task.isProject && changes.list === 'later' && view.key === task.key) {
      selectView({ id: 'later' });
    }
    if (projectKey !== undefined) {
      const project = projectKey ? allProjects.find((p) => p.key === projectKey) : null;
      placeInProject(task, project);
    }
  };

  // (3.0) Borrar de verdad (con confirmación): solo desde la Papelera
  const deleteTask = async (task) => {
    const headers = files.getIn([task.path, 'headers']);
    if (await confirmRemoveHeader(headers, task.id)) {
      dispatch(gtdDeleteTask(task));
      setOpenKey(null);
      dispatch(eliOfferDeleteAttachments(headers, task.id, task.path));
      return true;
    }
    return false;
  };
  // (3.06) varias en la Papelera: una sola confirmación con el número
  const deleteTasks = async (list) => {
    const todo = list.filter(Boolean);
    if (todo.length <= 1) return todo.length ? deleteTask(todo[0]) : false;
    const ok = await askConfirm({
      title: 'Borrar para siempre',
      message: `¿Borrar para siempre ${todo.length} elementos (con lo que tengan debajo)?`,
      okLabel: 'Borrar',
    });
    if (!ok) return false;
    todo.forEach((t) => dispatch(gtdDeleteTask(t)));
    setOpenKey(null);
    return true;
  };
  // (3.0) A la Papelera (se puede deshacer o sacarla de ella). (3.06) Pide confirmación (con
  // varias, una sola con el número)
  const trashTasks = async (list) => {
    const todo = list.filter((t) => t && !t.isTrashed);
    if (!todo.length) return false;
    const sure = await askConfirm({
      title: 'Enviar a la Papelera',
      message:
        todo.length === 1
          ? `¿Enviar «${todo[0].title || 'Sin título'}» a la Papelera?`
          : `¿Enviar ${todo.length} tareas a la Papelera?`,
      okLabel: 'A la Papelera',
    });
    if (!sure) return false;
    // (3.01) proyecto con tareas de otros ficheros asignadas: qué hacer con ellas
    const extra = [];
    for (const p of todo.filter((t) => t.isProject)) {
      const ext = tasks.filter(
        (t) =>
          t.projectExternal &&
          t.projRefOwn &&
          t.project &&
          t.project.id === p.id &&
          t.project.path === p.path
      );
      if (!ext.length) continue;
      const what = await askChoice({
        title: 'Tareas de otros ficheros',
        message: `Hay ${
          ext.length === 1 ? '1 tarea' : `${ext.length} tareas`
        } de otros ficheros asignadas a «${p.title}».`,
        choices: [
          { id: 'unassign', label: 'Quitar la asignación' },
          { id: 'move', label: 'Pasar a otro proyecto…' },
          { id: 'keep', label: 'Dejarlas así' },
        ],
      });
      if (!what) return;
      if (what === 'unassign')
        ext.forEach((t) => extra.push([t, { props: { [PROJECT_LINK_PROPERTY]: null } }]));
      if (what === 'move') {
        const other = await pickProject(allProjects, {
          title: 'Pasar a otro proyecto',
          exclude: todo.filter((t) => t.isProject).map((t) => t.key),
        });
        if (!other) return;
        assignProjectEntries(ext, other).forEach((e) => extra.push(e));
      }
    }
    setOpenKey(null);
    if (extra.length) dispatch(gtdSaveMany(extra));
    const n = dispatch(gtdTrash(todo));
    if (n)
      dispatch(
        setDisappearingLoadingMessage(
          n === 1 ? 'A la Papelera (Deshacer la saca)' : `${n} a la Papelera`,
          2500
        )
      );
    return true;
  };
  const emptyTrash = async () => {
    const list = tasksForView(tasks, { id: 'trash' }, {}, today);
    if (!list.length) return;
    const ok = await askConfirm({
      title: 'Vaciar la papelera',
      message: `¿Borrar para siempre ${
        list.length === 1 ? '1 elemento' : `${list.length} elementos`
      } (con lo que tengan debajo)?`,
      okLabel: 'Vaciar papelera',
    });
    if (!ok) return;
    setSelKey(null);
    dispatch(gtdEmptyTrash(tasks));
  };
  const cleanupNow = () => {
    const n = dispatch(gtdCleanup(tasks));
    // (3.44) las hechas de proyectos abiertos se quedan (se avisa de cuántas)
    const kept = tasks.filter((t) => t.isDone && !!t.doneIn).length - (n || 0);
    const keptText = kept
      ? ` (${kept === 1 ? 'se queda 1' : `se quedan ${kept}`} con su proyecto abierto)`
      : '';
    dispatch(
      setDisappearingLoadingMessage(
        (n
          ? `${n === 1 ? '1 hecha pasada' : `${n} hechas pasadas`} al Logbook`
          : 'No hay nada hecho que limpiar') + keptText,
        kept ? 3500 : 2500
      )
    );
  };
  const toggleDone = (task, e) => {
    if (task.isProject) {
      closeProject(task);
      return;
    }
    const opts = { cancel: !!(e && e.shiftKey) };
    if (task.isDone) {
      dispatch(gtdSaveMany([[task, doneChangesFor(task, opts)]]));
      return;
    }
    subtaskEntries([task], opts).then((extra) => {
      if (extra === null) return;
      dispatch(gtdSaveMany([...extra, [task, doneChangesFor(task, opts)]]));
    });
  };

  // (3.0) Llevar tareas (una o varias) a una lista, proyecto, Focus, Logbook o Papelera: al
  // arrastrarlas al menú lateral o con «Mover a» del menú. dropId: 'list:next', 'project:<key>'…
  const applyDrop = async (taskOrList, dropId) => {
    setSideOpen(false);
    const list = (Array.isArray(taskOrList) ? taskOrList : [taskOrList]).filter(Boolean);
    if (!list.length) return;
    const [kind, ...rest] = dropId.split(':');
    const id = rest.join(':');
    const untrash = (t, changes) =>
      t.ownTrash
        ? { ...changes, tags: (changes.tags || t.ownTags).filter((x) => !hasTrashTag([x])) }
        : changes;
    if (kind === 'project' || kind === 'loose') {
      const project = kind === 'project' ? allProjects.find((p) => p.key === id) : null;
      if (kind === 'project' && !project) return;
      const entries = [];
      list.forEach((task) => {
        if (project && project.key === task.key) return;
        let changes = {};
        if (!task.keyword || task.isDone) {
          changes = { list: 'next', tags: tagsForList(task, 'next') };
        }
        changes = untrash(task, changes);
        if (Object.keys(changes).length) entries.push([task, changes]);
      });
      if (entries.length) dispatch(gtdSaveMany(entries));
      // (3.01) las asignadas de otro fichero: «suelta» = quitar la asignación (no se mueven)
      if (!project) {
        const ext = list.filter((t) => t.projRefOwn);
        if (ext.length) dispatch(gtdUnassignProject(ext));
      }
      // (4.22) las de otros ficheros (ni el de tareas ni el Inbox) no se mueven: se enlazan
      const toLink = project
        ? list.filter(
            (t) =>
              project.key !== t.key &&
              linksInsteadOfMoves(t, project, { tasksPath: tasksFile, inboxPaths })
          )
        : [];
      if (toLink.length) dispatch(gtdAssignProject(toLink, project));
      list.forEach((task) => {
        if (project && project.key === task.key) return;
        if (!project && task.projectExternal) return;
        if (toLink.includes(task)) return;
        const fresh = buildTasks(
          IMap({ [task.path]: store.getState().org.present.getIn(['files', task.path]) }),
          inboxPaths
        ).find((t) => t.id === task.id);
        dispatch(
          gtdMoveToProject(fresh || task, project ? { path: project.path, id: project.id } : null)
        );
      });
      return;
    }
    const day = (n) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + n);
    let entries = [];
    if (id === 'trash') {
      trashTasks(list);
      return;
    } else if (id === 'focus') {
      entries = list.map((t) => [t, untrash(t, { priority: 'A' })]);
    } else if (id === 'scheduled' || id === 'deadline') {
      const isScheduled = id === 'scheduled';
      const first = list[0];
      const date = await askDate({
        title: isScheduled ? 'Programar (Scheduled)' : 'Fecha límite (Deadline)',
        message: list.length > 1 ? `${list.length} elementos` : `«${first.title}»`,
        value: isScheduled ? first.scheduled || day(1) : first.deadline || day(0),
      });
      if (!date) return;
      entries = list.map((task) => {
        const changes = isScheduled ? { scheduled: date } : { deadline: date };
        if (!task.keyword || task.isDone) {
          changes.list = 'later';
          changes.tags = tagsForList(task, 'later');
        }
        return [task, untrash(task, changes)];
      });
    } else if (id === 'logbook') {
      entries = list.map((t) => [t, t.isDone ? { doneIn: null } : { list: 'done', doneIn: null }]);
    } else if (isCustomId(id)) {
      const sec = gtdCfg.sections[id];
      if (!sec) return;
      entries = list.map((task) => {
        const changes = {};
        if (sec.states.length && task.keyword !== sec.states[0]) changes.keyword = sec.states[0];
        else if ((!task.keyword || task.isDone) && !sec.states.length) changes.keyword = 'TODO';
        if (sec.tags.length && !(task.ownTags || []).includes(sec.tags[0])) {
          changes.tags = [...(task.ownTags || []), sec.tags[0]];
        }
        return [task, untrash(task, changes)];
      });
    } else {
      entries = list.map((task) => {
        const changes = { list: id, tags: tagsForList(task, id) };
        // Sale de Scheduled: sin fecha de inicio futura (como Nirvana al moverla a una lista)
        if (task.scheduled && task.scheduled > today) changes.scheduled = null;
        return [task, untrash(task, changes)];
      });
    }
    entries = entries.filter(([, c]) => Object.keys(c).length);
    if (entries.length) dispatch(gtdSaveMany(entries));
  };
  // ORG Mode para Eli (2.15): soltar una tarea reordenada. En un proyecto, si se suelta en otra
  // sección, cambia de estado; y en todo caso se coloca junto a la tarea de al lado en el fichero.
  onReorderDropRef.current = async (task, pos) => {
    // (3.45) Focus / etiqueta agrupados por estado: soltar en otro grupo = cambiar de estado
    if (groupedByStatus) {
      const target = pos.section && pos.section.startsWith('st:') ? pos.section.slice(3) : null;
      const it = items.find((i) => i.kind === 'task' && i.task.key === task.key);
      const own = it && it.section ? it.section.slice(3) : null;
      if (!target || target === own || target === 'project') return;
      const changes = {};
      if (target === 'scheduled') {
        const day1 = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
        const date = await askDate({
          title: 'Programar (Scheduled)',
          message: `«${task.title}»: ¿desde qué día?`,
          value: task.scheduled && task.scheduled > today ? task.scheduled : day1,
        });
        if (!date) return;
        changes.scheduled = date;
      } else {
        changes.list = target;
        changes.tags = tagsForList(task, target);
        if (own === 'scheduled') changes.scheduled = null;
      }
      dispatch(gtdSaveTask(task, changes));
      return;
    }
    const rows = items.filter((i) => i.kind === 'task' && i.task.key !== task.key);
    const rowTasks = rows.map((i) => i.task);
    const keyIndex = (k) => rowTasks.findIndex((t) => t.key === k);
    if (isProjectView) {
      const target = pos.section;
      if (!target || target === 'refs') return;
      const own = projectSectionOfSeq(task, today, groupMode === 'sequential');
      const inTarget = rows.filter((i) => i.section === target).map((i) => i.task);
      const before = pos.beforeKey && inTarget.find((t) => t.key === pos.beforeKey);
      const after = pos.afterKey && inTarget.find((t) => t.key === pos.afterKey);
      const changes = {};
      if (target !== 'done') {
        // (2.17) una subtarea solo se coloca entre sus hermanas (si no, saldría de su tarea)
        const siblingOf = (t) =>
          t && t.path === task.path && (t.parentId || null) === (task.parentId || null);
        const isSub = !!task.parentId && !(projectTask && task.parentId === projectTask.id);
        const ordered = inTarget;
        const at = (t) => ordered.findIndex((x) => x.key === t.key);
        let ref = null;
        if (before && siblingOf(before)) ref = { id: before.id, position: 'before' };
        else if (after && siblingOf(after)) ref = { id: after.id, position: 'after' };
        else if (isSub || (before && !siblingOf(before)) || (after && !siblingOf(after))) {
          // el vecino no es hermano: se busca la hermana más cercana en esa sección
          const from = before ? at(before) : after ? at(after) + 1 : ordered.length;
          const sib = (list) => list.find(siblingOf);
          const next = sib(ordered.slice(from));
          const prev = sib(ordered.slice(0, from).reverse());
          if (next) ref = { id: next.id, position: 'before' };
          else if (prev) ref = { id: prev.id, position: 'after' };
        }
        if (ref) changes.moveNextTo = { targetId: ref.id, position: ref.position };
      }
      if (target !== own) {
        if (target === 'done') {
          changes.list = 'done';
        } else if (target === 'scheduled') {
          const day1 = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
          const date = await askDate({
            title: 'Programar (Scheduled)',
            message: `«${task.title}»: ¿desde qué día?`,
            value: task.scheduled && task.scheduled > today ? task.scheduled : day1,
          });
          if (!date) return;
          changes.scheduled = date;
          if (task.isDone) changes.list = 'later';
        } else {
          changes.list = target;
          changes.tags = tagsForList(task, target);
          // Sale de «Programadas»: se quita la fecha de inicio (como al llevarla a una lista)
          if (own === 'scheduled') changes.scheduled = null;
        }
      }
      if (Object.keys(changes).length) dispatch(gtdSaveTask(task, changes));
      return;
    }
    // (3.02) Vista ordenada por fecha (d): al mover, se avisa y se pasa a orden manual
    const toManual = () => {
      if (!sortDue || ['scheduled', 'deadline', 'logbook'].includes(view.id)) return;
      toggleSortDue();
      dispatch(
        setDisappearingLoadingMessage(
          'Orden por fecha quitado: ahora la lista va en orden manual',
          3500
        )
      );
    };
    // (3.02) Junto a la tarea de al lado aunque sea de otro fichero o encabezado, si no cambia
    // nada más (proyecto, tarea madre, área ni etiquetas heredadas): así no rompe proyectos ni Next
    const inherited = (t) =>
      (t.tags || [])
        .filter((x) => !(t.ownTags || []).includes(x))
        .map((x) => x.toLowerCase())
        .sort()
        .join(':');
    const safeNeighbor = (t) =>
      t &&
      !t.project &&
      !t.isDone &&
      !t.isProject &&
      !task.project &&
      !task.isProject &&
      !t.projRef &&
      !task.projRef &&
      !!t.isInboxFile === !!task.isInboxFile &&
      !parentTaskOf(t) &&
      !parentTaskOf(task) &&
      (t.area || '') === (task.area || '') &&
      inherited(t) === inherited(task);
    const nb = pos.beforeKey && rowTasks.find((t) => t.key === pos.beforeKey);
    const na = pos.afterKey && rowTasks.find((t) => t.key === pos.afterKey);
    const sameParent = (t) =>
      t && t.path === task.path && (t.parentId || null) === (task.parentId || null);
    if (!(sameParent(nb) || sameParent(na))) {
      const near = safeNeighbor(nb) ? [nb, 'before'] : safeNeighbor(na) ? [na, 'after'] : null;
      if (near) {
        if (dispatch(gtdPlaceNextTo(task, near[0], near[1]))) toManual();
        return;
      }
    }
    // Listas: solo las tareas sueltas, y solo entre sueltas de su mismo fichero
    let idx = pos.beforeKey
      ? keyIndex(pos.beforeKey)
      : pos.afterKey
      ? keyIndex(pos.afterKey) + 1
      : rows.findIndex((i) => i.section === pos.section);
    if (idx < 0) idx = rowTasks.length;
    // Solo entre hermanas (mismo fichero y mismo encabezado padre): así la tarea no cambia de
    // sitio en el árbol (ni hereda otra área o etiquetas)
    const ok = (t) =>
      !t.project &&
      !t.isDone &&
      !t.isProject &&
      t.path === task.path &&
      (t.parentId || null) === (task.parentId || null);
    let move = null;
    for (let i = idx; i < rowTasks.length; i++) {
      if (ok(rowTasks[i])) {
        move = { targetId: rowTasks[i].id, position: 'before' };
        break;
      }
    }
    if (!move) {
      for (let i = idx - 1; i >= 0; i--) {
        if (ok(rowTasks[i])) {
          move = { targetId: rowTasks[i].id, position: 'after' };
          break;
        }
      }
    }
    if (!move) {
      showMessage(
        'No se puede colocar ahí',
        'Ahí cambiaría de proyecto, de tarea madre, de área o de etiquetas heredadas, así que no ' +
          'se ha movido. Las tareas se pueden ordenar entre las tareas sueltas de su mismo fichero ' +
          'y encabezado, o junto a otra que tenga lo mismo.'
      );
      return;
    }
    dispatch(gtdSaveTask(task, { moveNextTo: move }));
    toManual();
  };

  // (3.0) Arrastrar filas (ver useRowDrag): qué se arrastra, si se puede reordenar y deslizar
  const selectedTasks = () => {
    const byKey = new Map(items.filter((i) => i.kind === 'task').map((i) => [i.task.key, i.task]));
    return sel.map((k) => byKey.get(k) || tasksByKey.get(k)).filter(Boolean);
  };
  rowDragRef.current = {
    onDrop: applyDrop,
    onStart: (t) => {
      setOpenKey(null);
      setMenu(null);
      // (3.05) con el dedo, la pulsación larga también selecciona la tarea
      if (t && lastPointer.current !== 'mouse' && !sel.includes(t.key)) setSelKey(t.key);
    },
    // (3.16) móvil: el menú lateral con las listas solo sale al llevar la tarea al borde izquierdo;
    // si no, el arrastre solo reordena dentro de la lista
    onNearEdge: () => {
      if (window.matchMedia && window.matchMedia('(max-width: 720px)').matches) setSideOpen(true);
    },
    // (3.35) al alejar la tarea del menú, se oculta para ver la lista y poder reordenar
    onAwayFromEdge: () => {
      if (window.matchMedia && window.matchMedia('(max-width: 720px)').matches) setSideOpen(false);
    },
    canSwipe: (task) => !noSwipeGtd && !task.isDone && !task.isProject && view.id !== 'logbook',
    onSwipe: (task, dir) => {
      if (dir === 'right') toggleDone(task);
      else if (view.id === 'trash') deleteTask(task);
      else trashTasks([task]);
    },
    dragSet: (task) => (sel.includes(task.key) && sel.length > 1 ? selectedTasks() : [task]),
    canReorder: (task) => {
      const it = items.find((i) => i.kind === 'task' && i.task.key === task.key);
      return !!(it && it.reorderable);
    },
  };
  const dropProps = (dropId) => ({
    'data-drop': dropId,
    className: dropTarget === dropId ? ' is-drop' : '',
  });

  // (2.17) Sincronizar con aviso: antes se hacía en silencio y no se veía si había funcionado. Ahora
  // es la sincronización manual de siempre (como en Documentos): «Sincronizando…» y después
  // «Cambios subidos», «Nada que sincronizar» o «Última versión descargada».
  // (2.17) «Refile»: tareas con estado que siguen en el fichero de entrada
  const refileTarget = tasksFileForRefile({ org: { present: store.getState().org.present } });
  const pendingRefile = useMemo(
    () =>
      refileTarget && gtdCfg.files.moveFromInbox
        ? tasks.filter(
            (t) => t.isInboxFile && t.keyword && t.level === 1 && t.path !== refileTarget
          )
        : [],
    [tasks, refileTarget, gtdCfg]
  );
  const doRefile = () => {
    const n = dispatch(gtdRefileInbox(tasks));
    if (n)
      dispatch(
        setDisappearingLoadingMessage(
          `${n === 1 ? '1 tarea pasada' : `${n} tareas pasadas`} a ${fileDisplayName(
            refileTarget
          )}`,
          3000
        )
      );
  };
  const syncAll = () => {
    if (!store.getState().base.get('online')) {
      dispatch(setDisappearingLoadingMessage('Sin conexión: no se puede sincronizar', 2500));
      return;
    }
    dispatch(sync({ forceAction: 'manual' }));
  };

  // 3.35: en el móvil, deslizar el dedo desde el borde izquierdo abre el menú lateral (como las
  // hojas de iOS). Solo si empieza muy pegado al borde y va claramente hacia la derecha; nada con
  // el editor, un menú o una ventana abiertos. En Safari (no en la app de inicio) el borde es
  // también su «atrás», así que puede ganar el navegador.
  const edgeOkRef = useRef(false);
  edgeOkRef.current =
    !sideOpen && !openKey && !draft && !menu && !newProject && !showAgenda && !dragging;
  useEffect(() => {
    let st = null;
    const narrow = () => window.matchMedia && window.matchMedia('(max-width: 720px)').matches;
    const start = (e) => {
      st = null;
      if (e.touches.length !== 1 || !edgeOkRef.current || !narrow()) return;
      const t = e.touches[0];
      if (t.clientX > EDGE_SWIPE_ZONE) return;
      if (
        document.querySelector(
          '.eli-cal__overlay, .eli-calc__overlay, .drawer, .eli-palette__overlay'
        )
      )
        return;
      st = { x: t.clientX, y: t.clientY };
    };
    const moveT = (e) => {
      if (!st || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - st.x;
      const dy = Math.abs(t.clientY - st.y);
      if (dy > 30 && dy > dx) {
        st = null; // es un desplazamiento vertical
        return;
      }
      if (dx > 40 && dx > 1.5 * dy) {
        st = null;
        setSideOpen(true);
      }
    };
    const end = () => {
      st = null;
    };
    window.addEventListener('touchstart', start, { passive: true });
    window.addEventListener('touchmove', moveT, { passive: true });
    window.addEventListener('touchend', end, { passive: true });
    window.addEventListener('touchcancel', end, { passive: true });
    return () => {
      window.removeEventListener('touchstart', start);
      window.removeEventListener('touchmove', moveT);
      window.removeEventListener('touchend', end);
      window.removeEventListener('touchcancel', end);
    };
  }, []);

  // 3.26: tirar hacia abajo de la lista (con el dedo) = sincronizar
  const gtdMainRef = useRef(null);
  const syncAllRef = useRef();
  syncAllRef.current = syncAll;
  const {
    pull: pullDist,
    refreshing: pullRefreshing,
    dragging: pullDragging,
    settling: pullSettling,
    offset: pullOffset,
  } = usePullToRefresh(gtdMainRef, () => syncAllRef.current());
  // 3.27: la lista baja con el dedo (goma) y vuelve con muelle; el aviso queda en el hueco
  const pullMoving = pullOffset > 0 || pullSettling;

  // ORG Mode para Eli: órdenes de la paleta de comandos (ver EliCommandPalette)
  const gtdCmdRef = useRef();
  gtdCmdRef.current = (cmd) => {
    if (!cmd) return;
    if (cmd.view) selectView(cmd.view);
    if (cmd.agenda) setShowAgenda(true);
    if (cmd.shortcuts) setShowShortcuts(true);
    // (4.17) Menú ☰: Buscar (B) y Capturar con plantilla
    if (cmd.search) focusSearch();
    if (cmd.capture) {
      // (4.18) desde el Explorador se llega con GTD aún cargando: se espera al fichero de tareas
      if (!files.getIn([tasksFile, 'headers']) && (cmd.tries || 0) < 10) {
        setTimeout(() => gtdCmdRef.current({ ...cmd, tries: (cmd.tries || 0) + 1 }), 500);
        return;
      }
      captureWithTemplate(cmd.capture === true ? {} : cmd.capture);
    }
    // (4.04) procesos lanzados desde el Menú ☰ (aunque su sección esté apagada). Si GTD aún
    // está cargando las tareas, se reintenta un par de veces.
    if (cmd.process || cmd.review || cmd.daily || cmd.guided) {
      if (!tasks.length && (cmd.tries || 0) < 4) {
        setTimeout(() => gtdCmdRef.current({ ...cmd, tries: (cmd.tries || 0) + 1 }), 500);
        return;
      }
      if (cmd.daily || cmd.guided) startDaily(cmd.daily || cmd.guided);
      else if (cmd.process) startProcess();
      else startReview();
    }
    if (cmd.newProject) addProject();
    if (cmd.sync) syncAll();
    if (cmd.focusAdd) setTimeout(() => openDraft('inbox'), 50);
    if (cmd.cleanup) cleanupNow();
    if (cmd.emptyTrash) emptyTrash();
    // (3.29) «Abrir en GTD» desde Documentos: se va a la tarea y se abre su editor (si GTD aún
    // está cargando los ficheros, se reintenta una vez)
    if (cmd.openTask) {
      const key = `${cmd.openTask.path}::${cmd.openTask.id}`;
      const target = tasksByKey.get(key);
      if (target) goToTask(target);
      else if (!cmd.retried) {
        setTimeout(
          () => gtdCmdRef.current({ openTask: cmd.openTask, orFile: cmd.orFile, retried: true }),
          600
        );
      } else if (cmd.orFile) {
        // (4.09) reloj en marcha en una cabecera que no está en GTD: a su fichero
        dispatch(selectHeaderAndOpenParents(cmd.openTask.path, cmd.openTask.id, { widen: true }));
        history.push(`/file${cmd.openTask.path}`);
      } else {
        showMessage(
          'No está en GTD',
          'Esta tarea no aparece en la vista GTD (su fichero no está entre los que GTD carga: Ajustes → Vista GTD).'
        );
      }
    }
  };
  useEffect(() => {
    const onCmd = (e) => gtdCmdRef.current(e.detail);
    window.addEventListener('eli:gtd', onCmd);
    const pending = window.__eliGtdPending;
    if (pending) {
      window.__eliGtdPending = null;
      setTimeout(() => gtdCmdRef.current(pending), 0);
    }
    return () => window.removeEventListener('eli:gtd', onCmd);
  }, []);

  // ORG Mode para Eli (2.15): atajos de teclado de la vista GTD (como Nirvana; configurables en
  // Ajustes → Atajos de teclado). Nunca mientras se escribe, con una ventana abierta ni con el
  // editor de una tarea abierto.
  const customKeybindings = useSelector(selectCustomKeybindings);
  const gtdBindings = useMemo(() => calculateGtdKeybindings(customKeybindings || IMap()), [
    customKeybindings,
  ]);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const sidebarViews = () => {
    const out = [];
    gtdCfg.order.forEach((id) => {
      if (!isSectionShown(id, gtdCfg) || isActionSection(id) || isSepId(id)) return;
      if (id === 'projects') {
        if (gtdCfg.sections.projects.allProjects !== false) out.push({ id: 'projects' });
        projectGroups.active.forEach((p) => out.push({ type: 'project', key: p.key }));
      } else out.push({ id });
    });
    return out;
  };
  const stepList = (dir) => {
    const views = sidebarViews();
    if (!views.length) return;
    const i = views.findIndex((v) =>
      view.type === 'project' ? v.key === view.key : !v.type && v.id === view.id
    );
    const next = views[(i + dir + views.length) % views.length] || views[0];
    selectView(next);
  };
  const stepArea = (dir) => {
    const all = ['*', ...areas, '-'];
    const i = Math.max(0, all.indexOf(area));
    selectArea(all[(i + dir + all.length) % all.length]);
  };
  const goList = (id) => {
    if (id === 'projects' || isSectionShown(id, gtdCfg)) selectView({ id });
  };
  // (3.24) Revisión semanal
  const setReview = (step) => {
    setReviewStep(step);
    writeLS('eliGtdReview', step);
  };
  // (4.15) pasos según el ajuste «Allen estricto»
  const REVIEW_STEPS = reviewSteps(strictOn());
  const startReview = () => {
    setSideOpen(false);
    setReview(0);
    // (4.04) el primer paso es lo terminado (Logbook); (4.15) con Allen estricto, papeles sueltos
    const v = reviewSteps(strictOn())[0].view;
    if (v) goList(v);
  };
  const finishReview = () => {
    const now = new Date().toISOString();
    setLastReview(now);
    writeLS('eliGtdLastReview', now);
    setReview(REVIEW_STEPS.length);
  };
  // (3.41) botones de las filas de la revisión: → Next, quitar de Next (→ Todo), hecha/recibida
  const reviewMove = (t, kind) => {
    if (kind === 'done') {
      dispatch(gtdSaveMany([[t, doneChangesFor(t)]]));
    } else if (kind === 'trash') {
      dispatch(gtdTrash([t]));
    } else {
      dispatch(gtdSaveTask(t, { list: kind, tags: tagsForList(t, kind) }));
    }
    const label = {
      done: 'Hecha',
      next: '→ Next',
      later: 'Quitada de Next (→ Todo)',
      trash: 'Papelera',
    }[kind];
    dispatch(setDisappearingLoadingMessage(label, 1500));
  };
  const reviewOpenTask = (t) => {
    if (t.isProject) {
      backRef.current = [...backRef.current, { view, selKey, openKey }].slice(-20);
      selectView({ type: 'project', key: t.key });
    } else {
      goToTask(t);
    }
  };
  // (4.05) Procesos diarios (Menú ☰ › Procesos › Diarios)
  // (4.06) también los puntuales y periódicos (GUIDED_PROCESSES: tarjeta GtdGuidedProcess)
  const startDaily = (kind, extra = null) => {
    if (!DAILY_PROCESSES[kind] && !GUIDED_PROCESSES[kind]) return;
    // (4.07) la Revisión de horizontes necesita su fichero (si no está, se pregunta si crearlo)
    if (kind === 'horizons' && !horizonsLoaded()) {
      ensureHorizons().then((ok) => ok && startDaily(kind, extra));
      return;
    }
    setSideOpen(false);
    setDaily({ kind, step: 0, rev: Date.now(), ...(extra || {}) });
    if (kind === 'horizons' || (extra && (extra.back || extra.existing))) return;
    if (GUIDED_PROCESSES[kind]) {
      const list = { sweep: 'inbox', stuck: 'projects', waiting: 'waiting', someday: 'someday' }[
        kind
      ];
      if (list) goList(list);
    } else if (kind === 'plan' || kind === 'daily') {
      // el Tickler: el cargado o, si no, junto al fichero de entrada (sin crearlo)
      const present = store.getState().org.present;
      const loaded = Array.from(present.get('files').keys()).some(
        (p) => isTicklerPath(p) && present.getIn(['files', p, 'headers'])
      );
      const near = inboxPaths[0] || inboxFile;
      if (!loaded && near)
        Promise.resolve(dispatch(loadFileQuietly(ticklerPathNear(near)))).catch(() => null);
      goList('focus');
    } else if (kind === 'close') {
      goList('focus');
    } else {
      goList('next');
    }
  };
  const dailyMove = (t, kind, date) => {
    let label = '';
    if (kind === 'done') {
      dispatch(gtdSaveMany([[t, doneChangesFor(t)]]));
      label = t.keyword === 'WAITING' ? 'Recibida' : 'Hecha';
    } else if (kind === 'star' || kind === 'unstar') {
      dispatch(gtdSaveTask(t, { priority: t.priority === 'A' ? null : 'A' }));
      label = t.priority === 'A' ? 'Sin ★' : '★ Focus';
    } else if (kind === 'schedule' && date) {
      // reprogramada: sin ★ hasta su nueva fecha (entonces se le vuelve a poner sola)
      dispatch(gtdSaveTask(t, { scheduled: date, scheduledTime: '', priority: null }));
      label = `Para el ${date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`;
    } else if (kind === 'inbox') {
      if (!inboxFile) return;
      dispatch(gtdSaveTask(t, { tags: tagsForList(t, 'inbox') }));
      if (t.path !== inboxFile) dispatch(gtdRefileTo([t], inboxFile, null));
      label = '→ Inbox';
    }
    if (label) dispatch(setDisappearingLoadingMessage(label, 1500));
  };
  // (4.06) Procesos puntuales y periódicos
  const toast = (label) => dispatch(setDisappearingLoadingMessage(label, 1500));
  // (4.11) herramientas de la tarea (reloj, enlace, exportar) con su aviso
  const runTool = (fn, task) => async () => {
    const label = await dispatch(fn(task));
    if (label) toast(label);
  };
  const guidedCapture = (title) => {
    const path = inboxFile || tasksFile;
    if (!path || !files.getIn([path, 'headers'])) return false;
    const id = dispatch(
      gtdAddTask(
        { path },
        {
          title,
          list: 'inbox',
          tags: inboxPaths.includes(path) ? [] : [inboxTag()],
          created: true,
        }
      )
    );
    if (!id) return false;
    toast('→ Inbox');
    return true;
  };
  // (4.14) tareas de un plan (los subproyectos llevan sus hijas)
  const addPlanTasks = (path, parentId, list) =>
    list.forEach((x) => {
      const id = dispatch(
        gtdAddTask(
          { path, parentId },
          {
            title: x.title,
            list: x.list,
            ...(x.tags && x.tags.length ? { tags: x.tags } : {}),
            created: true,
          }
        )
      );
      if (id && x.children) addPlanTasks(path, id, x.children);
    });
  // (4.14) Replanificar un proyecto existente: actualiza sus notas (respetando el resto) y
  // AÑADE solo las tareas nuevas (no borra ni reordena; la siguiente acción elegida que ya
  // existía pasa a Next)
  const guidedUpdateProject = (project, plan) => {
    const fresh = tasks.find((t) => t.key === project.key) || project;
    const notes = mergePlanNotes(fresh.description, plan);
    if (notes !== (fresh.description || '')) dispatch(gtdSaveTask(fresh, { notes }));
    const all = tasks.filter((t) => !t.isTrashed);
    const members = (p) => all.filter((t) => inProject(t, p) && !!t.keyword);
    const own = members(fresh);
    const out = projectPlan(plan);
    addPlanTasks(
      fresh.path,
      fresh.id,
      planAdditions(
        out.tasks.filter((t) => !t.children),
        own.map((t) => t.title)
      )
    );
    out.tasks
      .filter((t) => t.children)
      .forEach((c) => {
        const sub = own.find(
          (t) => t.isProject && t.title.trim().toLowerCase() === c.title.trim().toLowerCase()
        );
        if (sub)
          addPlanTasks(
            sub.path,
            sub.id,
            planAdditions(
              c.children,
              members(sub).map((t) => t.title)
            )
          );
        else addPlanTasks(fresh.path, fresh.id, [c]);
      });
    // siguientes acciones elegidas entre las que ya había → Next
    const chosen = [plan.first, ...Object.values(plan.nexts || {}).map((n) => n.action)]
      .map((x) =>
        String(x || '')
          .trim()
          .toLowerCase()
      )
      .filter(Boolean);
    const scope = [...own, ...own.filter((t) => t.isProject).flatMap(members)];
    scope
      .filter(
        (t) =>
          !t.isProject &&
          !t.isDone &&
          chosen.includes(t.title.trim().toLowerCase()) &&
          listOf(t, today) !== 'next'
      )
      .forEach((t) => reviewMove(t, 'next'));
    toast('Proyecto replanificado');
  };
  const guidedCreateProject = (title, plan) => {
    if (!tasksFile) return;
    // (4.07) desde la Revisión de horizontes: con su objetivo (:OBJETIVO:) y su área
    const pre = plan.preset || {};
    const props = {};
    if (pre.objective) {
      const orgId = objectiveIdFor(pre.objective);
      if (orgId) props[OBJECTIVE_PROPERTY] = projectLinkFor(orgId, pre.objective.title);
    }
    const area = pre.area || (pre.objective && pre.objective.area) || undefined;
    const id = dispatch(
      gtdAddTask({ path: tasksFile }, { title, list: 'project', notes: plan.notes, area, props })
    );
    if (!id) return;
    addPlanTasks(tasksFile, id, plan.tasks);
    toast('Proyecto creado');
    selectView({ type: 'project', key: `${tasksFile}::${id}` });
  };
  const guidedProjectAction = (p, kind, text) => {
    if (kind === 'close') return closeProject(p);
    if (kind === 'next') {
      const id = dispatch(
        gtdAddTask({ path: p.path, parentId: p.id }, { title: text, list: 'next', created: true })
      );
      if (!id) return false;
      if (p.ownSleep) dispatch(gtdSaveTask(p, { props: { [STATUS_PROPERTY]: null } }));
      toast('→ Next');
    } else if (kind === 'sleep') {
      dispatch(gtdSaveTask(p, { props: { [STATUS_PROPERTY]: SLEEP_STATUS } }));
      toast('Dormido (Someday)');
    }
    return true;
  };
  const guidedMove = (t, kind, person) => {
    if (kind === 'done') {
      dispatch(gtdSaveMany([[t, doneChangesFor(t)]]));
      toast(t.keyword === 'WAITING' ? 'Recibida' : 'Hecha');
    } else if (kind === 'chase') {
      const path = tasksFile || t.path;
      dispatch(
        gtdAddTask(
          { path },
          {
            title: chaseTitle(t, person),
            list: 'next',
            tags: person ? [person] : [],
            created: true,
          }
        )
      );
      toast('→ Next');
    } else if (kind === 'next') {
      reviewMove(t, 'next');
    } else if (kind === 'trash') {
      dispatch(gtdTrash([t]));
      toast('A la Papelera');
    } else if (kind === 'wake') {
      dispatch(gtdSaveTask(t, { props: { [STATUS_PROPERTY]: null } }));
      toast('Activado');
    }
  };
  const guidedCopy = (t, person) => {
    const text = chaseMessage(t, person);
    const done = () => toast('Mensaje copiado');
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, () => null);
        return;
      }
    } catch (e) {}
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      done();
    } catch (e) {}
    document.body.removeChild(ta);
  };
  // (4.07) Horizontes (fichero aparte: objetivos, áreas, visión y propósito)
  const horizonsLoaded = () =>
    !!store.getState().org.present.getIn(['files', horizonsPath, 'headers']);
  const freshHorizons = () =>
    parseHorizons(store.getState().org.present.getIn(['files', horizonsPath]), horizonsPath);
  const ensureHorizons = async (create = true) => {
    const load = async () => {
      dispatch(setLoadingMessage(`Cargando ${fileDisplayName(horizonsPath)}…`));
      await Promise.resolve(dispatch(loadFileQuietly(horizonsPath))).catch(() => null);
      dispatch(hideLoadingMessage());
      return horizonsLoaded();
    };
    if (horizonsLoaded() || (await load())) return true;
    if (!create) return false;
    const ok = await askConfirm({
      title: 'Horizontes',
      message: `No se encuentra ${horizonsPath}. ¿Crearlo con la plantilla (propósito, visión, objetivos y áreas)?`,
      okLabel: 'Crear',
    });
    if (!ok) return false;
    if (!(await dispatch(createPlainFile(horizonsPath, HORIZONS_TEMPLATE)))) return false;
    return load();
  };
  // :ID: del objetivo (se le pone si no lo tiene, como org-id)
  const objectiveIdFor = (o) => {
    if (o.orgId) return o.orgId;
    const orgId = newOrgId();
    dispatch(gtdSaveTask(o.task, { props: { ID: orgId } }));
    return orgId;
  };
  // Editor del proyecto: elegir su objetivo (o quitarlo)
  const pickObjective = async (project) => {
    if (!(await ensureHorizons())) return;
    const h = freshHorizons();
    const items = objectivePickItems(h);
    if (objectiveRefOf(project))
      items.unshift({ id: '__none', label: 'Sin objetivo', hint: 'Quitar el objetivo' });
    const id = await askPick({
      title: 'Objetivo del proyecto',
      message: project.title,
      placeholder: 'Buscar objetivo…',
      items,
      emptyText: `No hay objetivos en ${fileDisplayName(
        horizonsPath
      )} (cabeceras «**» bajo «* Objetivos»).`,
    });
    if (!id) return;
    if (id === '__none') {
      dispatch(gtdSaveTask(project, { props: { [OBJECTIVE_PROPERTY]: null } }));
      toast('Sin objetivo');
      return;
    }
    const o = h.objectives.find((x) => x.key === id);
    if (!o) return;
    const changes = {
      props: { [OBJECTIVE_PROPERTY]: projectLinkFor(objectiveIdFor(o), o.title) },
    };
    if (o.area && !project.ownArea) changes.area = o.area;
    dispatch(gtdSaveTask(project, changes));
    toast(`Objetivo: ${o.title}`);
  };
  const HORIZON_TITLES = {
    purpose: 'Propósito y principios',
    vision: 'Visión (3–5 años)',
    goals: 'Objetivos (1–2 años)',
    areas: 'Áreas de responsabilidad',
  };
  // cabecera de primer nivel de esa parte (se crea al final si falta)
  const horizonSection = (kind) => {
    const h = freshHorizons();
    if (h[kind]) return h[kind].id;
    return dispatch(gtdAddTask({ path: horizonsPath }, { title: HORIZON_TITLES[kind] }));
  };
  const horizonsAddArea = (name) => {
    const parentId = horizonSection('areas');
    if (!parentId) return false;
    if (!dispatch(gtdAddTask({ path: horizonsPath, parentId }, { title: name }))) return false;
    toast('Área añadida');
    return true;
  };
  const horizonsAddObjective = (title, area, term) => {
    const parentId = horizonSection('goals');
    if (!parentId) return false;
    const props = { ID: newOrgId() };
    const tl = HORIZON_TERMS.find((x) => x.id === term);
    if (tl) props[TERM_PROPERTY] = tl.label;
    const id = dispatch(
      gtdAddTask({ path: horizonsPath, parentId }, { title, area: area || undefined, props })
    );
    if (!id) return false;
    toast('Objetivo añadido');
    return true;
  };
  const horizonsSaveText = (kind, text) => {
    const h = freshHorizons();
    if (h[kind]) dispatch(gtdSaveTask(h[kind], { notes: text }));
    else dispatch(gtdAddTask({ path: horizonsPath }, { title: HORIZON_TITLES[kind], notes: text }));
    toast('Guardado');
  };
  // (4.16) plazo de un objetivo (:PLAZO:)
  const pickTerm = async (o) => {
    const id = await askPick({
      title: 'Plazo del objetivo',
      message: o.title,
      placeholder: 'Buscar plazo…',
      items: [...HORIZON_TERMS, NO_TERM].map((x) => ({
        id: x.id,
        label: x.label,
        hint: x.id === (o.term || 'none') ? 'Ahora' : '',
      })),
    });
    if (!id) return;
    const tl = HORIZON_TERMS.find((x) => x.id === id);
    dispatch(gtdSaveTask(o.task, { props: { [TERM_PROPERTY]: tl ? tl.label : null } }));
    toast(tl ? `Plazo: ${tl.label}` : 'Sin plazo');
  };
  const horizonsReviewed = (level) => setHzLast(markHzReviewed(level, today));
  // «Planificar un proyecto nuevo» (4.06) para un objetivo o un área; al terminar se vuelve aquí
  const horizonsPlan = (preset, step) =>
    startDaily('project', { preset, back: { kind: 'horizons', step } });
  const closeGuided = () =>
    setDaily(daily && daily.back ? { ...daily.back, rev: Date.now() } : null);
  // (3.40) Procesar Inbox: una tarea cada vez (las que había en el Inbox al empezar)
  const inboxNow = () => tasks.filter((t) => !t.isProject && listOf(t, today) === 'inbox');
  const startProcess = () => {
    setSideOpen(false);
    const queue = inboxNow().map((t) => ({
      key: t.key,
      path: t.path,
      title: t.title,
      rawTitle: t.rawTitle,
    }));
    setProc({ queue, i: 0, gone: {} });
    goList('inbox');
  };
  const procTask = (() => {
    if (!proc || proc.i >= proc.queue.length || proc.gone[proc.i]) return null;
    const e = proc.queue[proc.i];
    const find = (list) =>
      list.find((t) => t.key === e.key) ||
      list.find((t) => t.path === e.path && t.rawTitle === e.rawTitle) ||
      list.find((t) => t.path === e.path && t.title === e.title) ||
      // (3.42) editada desde la tarjeta (p. ej. con proyecto): se sigue aunque salga del Inbox
      (e.edited ? list.find((t) => t.rawTitle === e.rawTitle) : null) ||
      null;
    const found = find(inboxNow());
    if (found || !e.edited) return found;
    return find(tasks.filter((t) => !t.isTrashed && !t.isDone && !t.isProject));
  })();
  // (3.42) Guardada desde el editor durante «Procesar Inbox»: se apunta para seguir con ella
  const procNoteSaved = (task, changes) => {
    if (!proc || !procTask || task.key !== procTask.key) return;
    setProc((p) => {
      if (!p || !p.queue[p.i]) return p;
      const queue = p.queue.slice();
      queue[p.i] = {
        ...queue[p.i],
        edited: true,
        rawTitle: changes.rawTitle !== undefined ? changes.rawTitle : queue[p.i].rawTitle,
      };
      return { ...p, queue };
    });
  };
  const procMove = (delta, goneText) =>
    setProc((p) =>
      p
        ? {
            ...p,
            gone: goneText !== undefined ? { ...p.gone, [p.i]: goneText } : p.gone,
            i: Math.max(0, Math.min(p.queue.length, p.i + delta)),
          }
        : p
    );
  // tickler.org: el cargado o, si no, junto al fichero de entrada (se carga o se crea)
  const ticklerFile = async (task) => {
    const present = store.getState().org.present;
    const loaded = Array.from(present.get('files').keys()).find(
      (p) => isTicklerPath(p) && present.getIn(['files', p, 'headers'])
    );
    if (loaded) return loaded;
    const path = ticklerPathNear(inboxPaths[0] || task.path);
    const load = async () => {
      dispatch(setLoadingMessage(`Cargando ${fileDisplayName(path)}…`));
      await Promise.resolve(dispatch(loadFileQuietly(path))).catch(() => null);
      dispatch(hideLoadingMessage());
      return !!store.getState().org.present.getIn(['files', path, 'headers']);
    };
    if (await load()) return path;
    const ok = await askConfirm({
      title: 'Tickler',
      message: `No se encuentra ${path}. ¿Crearlo?`,
      okLabel: 'Crear',
    });
    if (!ok) return null;
    if (!(await dispatch(createPlainFile(path, '#+TITLE: Tickler\n')))) return null;
    return (await load()) ? path : null;
  };
  const processDecide = async (d) => {
    const task = procTask;
    if (!task) return;
    const base = (list) => tagsForList(task, list);
    const dates = {};
    if (d.scheduled) {
      dates.scheduled = d.scheduled;
      dates.scheduledTime = d.scheduledTime || '';
    }
    if (d.deadline) dates.deadline = d.deadline;
    const extra = { ...dates };
    if (d.area) extra.area = d.area;
    // (4.15) Allen estricto: la siguiente acción reescrita
    if (d.title) extra.rawTitle = d.title;
    let label = '';
    if (d.kind === 'trash') {
      dispatch(gtdTrash([task]));
      label = 'Papelera';
    } else if (d.kind === 'reference') {
      dispatch(gtdSaveTask(task, { tags: base('reference') }));
      const target = tasksFileForRefile(store.getState());
      if (task.isInboxFile && target && target !== task.path)
        dispatch(gtdRefileTo([task], target, null));
      label = 'Referencia';
    } else if (d.kind === 'someday') {
      dispatch(gtdSaveTask(task, { list: 'someday', tags: base('someday') }));
      label = 'Someday';
    } else if (d.kind === 'tickler') {
      const path = await ticklerFile(task);
      if (!path) return;
      const tags = mergeTags(base('reference'), d.tags);
      if (!dispatch(gtdToTickler(task, path, d.date, d.time, tags))) return;
      label = `Tickler (${d.date.toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })})`;
    } else if (d.kind === 'done') {
      dispatch(
        gtdSaveMany([
          [task, { ...doneChangesFor(task), ...(d.title ? { rawTitle: d.title } : {}) }],
        ])
      );
      label = 'Hecha';
    } else if (['waiting', 'next', 'later'].includes(d.kind)) {
      const tags = mergeTags(base(d.kind), [...(d.tags || []), ...(d.person ? [d.person] : [])]);
      dispatch(gtdSaveTask(task, { list: d.kind, tags, ...extra }));
      label = { waiting: 'Waiting', next: 'Next', later: 'Todo (más adelante)' }[d.kind];
    } else if (d.kind === 'project') {
      const tags = mergeTags(base('project'), d.tags);
      dispatch(gtdSaveTask(task, { list: 'project', tags, ...extra }));
      if (d.first) {
        const path = pathOfHeader(store.getState, task.id, task.path);
        if (path)
          dispatch(
            gtdAddTask({ path, parentId: task.id }, { title: d.first, list: 'next', created: true })
          );
      }
      label = 'Proyecto';
    }
    // (4.15) Allen estricto: «¿hay un proyecto?» en todas las ramas → la acción va dentro
    if (d.project && ['done', 'waiting', 'next'].includes(d.kind)) {
      let target = null;
      if (d.project.key) {
        const p = allProjects.find((x) => x.key === d.project.key);
        if (p) target = { path: p.path, id: p.id };
      } else if (d.project.name && tasksFile) {
        const id = dispatch(
          gtdAddTask({ path: tasksFile }, { title: d.project.name, list: 'project', created: true })
        );
        if (id) target = { path: tasksFile, id };
      }
      // la tarea puede haber cambiado de fichero al guardarla (del de entrada al de tareas)
      const fs = store.getState().org.present.get('files');
      const path = [task.path, ...fs.keySeq().toArray()].find((fp) =>
        (fs.getIn([fp, 'headers']) || List()).some((h) => h.get('id') === task.id)
      );
      if (target && path) {
        dispatch(gtdMoveToProject({ path, id: task.id }, target));
        label += ' · en el proyecto';
      }
    }
    dispatch(setDisappearingLoadingMessage(`→ ${label}`, 1500));
    procMove(1, `Procesada: ${label}`);
  };
  const toggleRapid = (focusIt) => {
    const v = focusIt ? true : !rapidOn;
    setRapidOn(v);
    writeLS('eliGtdRapid', v);
    if (v) {
      setTimeout(() => {
        const el = document.querySelector('[data-testid="gtd-rapid"]');
        if (el) el.focus();
      }, 50);
    } else if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }
  };
  const toggleSortDue = () => {
    const v = !sortDue;
    setSortDue(v);
    writeLS('eliGtdSortDue', v);
    dispatch(
      setDisappearingLoadingMessage(v ? 'Ordenado por fecha límite' : 'Orden de siempre', 1500)
    );
  };
  // (3.01) Elemento nuevo (n, «Nuevo elemento»): justo debajo de la tarea seleccionada; sin
  // ninguna, al principio de la lista
  const newBelowCursor = () => {
    const cur =
      selKey &&
      items.find(
        (i) => i.kind === 'task' && !i.isRef && i.task.key === selKey && i.section !== 'done-group'
      );
    if (cur && !cur.task.isProject && !cur.task.isDone) openDraft('current', { after: cur.task });
    else openDraft('current', { top: true });
  };
  const gtdActions = {
    gtdNew: () => newBelowCursor(),
    gtdNewTop: () => openDraft('current', { top: true }),
    gtdNewInbox: () => openDraft('inbox'),
    gtdNewNext: () => openDraft(view.id === 'reference' ? 'reference' : 'next'),
    gtdNewWaiting: () => openDraft(view.id === 'reference' ? 'reference' : 'waiting'),
    gtdNewScheduled: () => openDraft(view.id === 'reference' ? 'reference' : 'scheduled'),
    gtdNewSomeday: () => openDraft(view.id === 'reference' ? 'reference' : 'someday'),
    gtdNewFocus: () => openDraft('focus'),
    gtdNewProject: () => addProject(),
    gtdNewReference: () => openDraft('reference'),
    // (3.05) con la entrada rápida desactivada, «e» no la muestra
    gtdRapidFocus: () => {
      if (rapidOn) toggleRapid(true);
    },
    gtdRapidToggle: () => toggleRapid(false),
    gtdCapture: () => captureWithTemplate(),
    gtdGoInbox: () => goList('inbox'),
    gtdGoNext: () => goList('next'),
    gtdGoLater: () => goList('later'),
    gtdGoWaiting: () => goList('waiting'),
    gtdGoScheduled: () => goList('scheduled'),
    gtdGoSomeday: () => goList('someday'),
    gtdGoFocus: () => goList('focus'),
    gtdGoProjects: () => goList('projects'),
    gtdGoReference: () => goList('reference'),
    gtdGoLogbook: () => goList('logbook'),
    gtdGoTrash: () => goList('trash'),
    gtdPrevList: () => stepList(-1),
    gtdNextList: () => stepList(1),
    gtdAreaAll: () => selectArea('*'),
    gtdAreaNext: () => stepArea(1),
    gtdAreaPrev: () => stepArea(-1),
    gtdSearch: () => focusSearch(),
    gtdSearch2: () => focusSearch(),
    gtdFilterSection: () => openSectionFilter(),
    gtdSync: () => syncAll(),
    gtdAgenda: () => setShowAgenda(true),
    gtdCleanup: () => cleanupNow(),
    gtdSortDue: () => toggleSortDue(),
    gtdTags: () => setShowTagManager(true),
    gtdDocs: () => openDocuments(),
    gtdSettings: () => history.push('/settings'),
    gtdManual: () => history.push('/sample'),
    gtdShortcuts: () => setShowShortcuts(true),
    gtdShortcuts2: () => setShowShortcuts(true),
  };
  // (4.19) Mayús+B = lo mismo que la lupa de la cabecera (filtrar esta sección)
  const openSectionFilter = () => {
    if (!canFilterSection) return;
    const now = document.querySelector('[data-testid="gtd-sec-filter"]');
    if (now) {
      focusField(now);
      return;
    }
    primeKeyboard();
    setSecFilterOpen(true);
    setTimeout(() => {
      focusField(document.querySelector('[data-testid="gtd-sec-filter"]'));
    }, 30);
  };
  const focusSearch = () => {
    if (window.matchMedia && window.matchMedia('(max-width: 720px)').matches) setSideOpen(true);
    setTimeout(() => {
      const el = document.querySelector('[data-testid="gtd-search"]');
      if (el) el.focus();
    }, 50);
  };
  // (2.18) Ir a otra tarea (la madre de una subtarea): se selecciona y se abre su editor; si no
  // está en la lista que se ve, se va a su proyecto o a su lista. Alt+← vuelve a donde se estaba.
  const backRef = useRef([]);
  const [jumpedKey, setJumpedKey] = useState(null);
  useEffect(() => {
    if (jumpedKey && openKey !== jumpedKey) setJumpedKey(null);
  }, [openKey, jumpedKey]);
  const goToTask = (target) => {
    if (!target) return;
    backRef.current = [...backRef.current, { view, selKey, openKey }].slice(-20);
    const visible = items.some((i) => i.kind === 'task' && i.task.key === target.key);
    if (!visible) {
      const l = listOf(target, today);
      const v = target.project
        ? { type: 'project', key: `${target.project.path}::${target.project.id}` }
        : { id: { habit: 'scheduled', parked: 'focus', project: 'focus' }[l] || l || 'focus' };
      selectView(v);
      if (area && area !== '*' && (target.area || '') !== (area === '-' ? '' : area)) setArea('*');
    }
    setSelKey(target.key);
    setOpenKey(target.key);
    setJumpedKey(target.key);
  };
  // (3.01) Clic en el nombre del proyecto de una fila: a ese proyecto (Alt+← vuelve)
  const goToProject = (p) => {
    if (!p) return;
    const key = `${p.path}::${p.id}`;
    if (!allProjects.some((x) => x.key === key)) return;
    backRef.current = [...backRef.current, { view, selKey, openKey }].slice(-20);
    selectView({ type: 'project', key });
  };
  const goBack = () => {
    const prev = backRef.current[backRef.current.length - 1];
    if (!prev) return false;
    backRef.current = backRef.current.slice(0, -1);
    setView(prev.view);
    writeLS(LS_VIEW, prev.view);
    setOpenKey(prev.openKey);
    setSelKey(prev.selKey || prev.openKey);
    return true;
  };

  // (2.18) Tab: la tarea seleccionada pasa a ser subtarea de la de encima (de su hermana anterior
  // si la de encima es una subtarea de esta); Mayús+Tab: la saca un nivel
  const indentSelected = (task, rows, idx, out) => {
    if (!subtasksOn) return;
    if (out) {
      if (parentTaskOf(task)) dispatch(gtdSetParent(task, null));
      return;
    }
    let cand = rows[idx - 1];
    while (cand && cand.level > task.level) cand = tasksByKey.get(`${cand.path}::${cand.parentId}`);
    if (cand && cand.id !== task.parentId && canBeParentOf(cand, task, tasks, tasksByKey)) {
      dispatch(gtdSetParent(task, cand.id));
    }
  };

  // (2.16) Recorrer la lista con el teclado: ↓ empieza por la primera tarea, ↑ por la última;
  // Intro abre la seleccionada; Supr o Retroceso la borran (con confirmación: Intro confirma);
  // ← vuelve al menú lateral; Esc quita la selección
  // (3.0) Teclado en la lista, como Nirvana: ↑ ↓ recorren (Mayús amplía la selección), Intro
  // edita, Supr/⌫ manda a la Papelera, Esc quita la selección, Tab va al buscador (con una tarea
  // seleccionada la hace subtarea), ⌘/Ctrl+C copia la lista como ORG Mode, ⌘/Ctrl+A todas.
  const copyOrg = (list, title) => {
    const md = tasksToOrg(title, list);
    const done = () =>
      dispatch(
        setDisappearingLoadingMessage(
          list.length === 1 ? 'Copiada como ORG Mode' : `${list.length} copiadas como ORG Mode`,
          2000
        )
      );
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(md).then(done, () => null);
        return;
      }
    } catch (e) {}
    const ta = document.createElement('textarea');
    ta.value = md;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      done();
    } catch (e) {}
    ta.remove();
  };
  // (4.19) Alt+↑/↓: mover la tarea una posición dentro de su sección, por el mismo camino que el
  // arrastre de reordenar (solo si esa fila se puede reordenar y la vecina es de su sección)
  const moveSelected = (task, dir) => {
    const all = items.filter((i) => i.kind === 'task' && !i.isRef);
    const at = all.findIndex((i) => i.task.key === task.key);
    const me = all[at];
    const nb = all[at + dir];
    if (!me || !nb || !me.reorderable || !nb.reorderable || nb.section !== me.section) return;
    if (groupedByStatus) return;
    const pos = { section: nb.section };
    if (dir < 0) pos.beforeKey = nb.task.key;
    else pos.afterKey = nb.task.key;
    if (onReorderDropRef.current) onReorderDropRef.current(task, pos);
    setTimeout(() => {
      const el = document.querySelector(`[data-reorder-key="${CSS.escape(task.key)}"]`);
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    }, 50);
  };
  const listKey = (e) => {
    const t = e.target;
    if (t && t.closest && t.closest('.gtd-side')) return false;
    const rows = items.filter((i) => i.kind === 'task' && !i.isRef).map((i) => i.task);
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
      const k = (e.key || '').toLowerCase();
      if (k === 'c') {
        const txt = window.getSelection && String(window.getSelection() || '');
        if (txt) return false; // texto seleccionado: la copia normal del navegador
        e.preventDefault();
        const chosen = sel.length ? rows.filter((r) => sel.includes(r.key)) : null;
        if (chosen && chosen.length) copyOrg(chosen, null);
        else
          copyOrg(
            rows.filter((r) => !r.isDone),
            title
          );
        return true;
      }
      if (k === 'a' && rows.length) {
        e.preventDefault();
        setSel(rows.map((r) => r.key));
        setCursor(rows[0].key);
        return true;
      }
      return false;
    }
    // (4.19) Alt+↑/↓ mueven la tarea seleccionada (como arrastrarla); Alt+→/← la sangran
    // (hacerla subtarea de la de encima / sacarla) si «Subtareas» está encendido
    if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      const ai = selKey ? rows.findIndex((x) => x.key === selKey) : -1;
      if (ai < 0) return false;
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        moveSelected(rows[ai], e.key === 'ArrowDown' ? 1 : -1);
        return true;
      }
      if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && subtasksOn) {
        if (['focus', 'scheduled', 'deadline', 'logbook', 'trash', 'tag'].includes(view.id))
          return false;
        e.preventDefault();
        indentSelected(rows[ai], rows, ai, e.key === 'ArrowLeft');
        return true;
      }
      return false;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    const idx = selKey ? rows.findIndex((x) => x.key === selKey) : -1;
    const scrollTo = (task) =>
      setTimeout(() => {
        const el = document.querySelector(`[data-reorder-key="${CSS.escape(task.key)}"]`);
        if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
      }, 0);
    const select = (task) => {
      setSelKey(task ? task.key : null);
      if (task) scrollTo(task);
    };
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!rows.length) return false;
      e.preventDefault();
      const down = e.key === 'ArrowDown';
      const next =
        idx < 0
          ? down
            ? 0
            : rows.length - 1
          : Math.max(0, Math.min(rows.length - 1, idx + (down ? 1 : -1)));
      if (e.shiftKey && idx >= 0) {
        // ampliar la selección
        const key = rows[next].key;
        setCursor(key);
        setSel((cur) => (cur.includes(key) ? cur : [...cur, key]));
        scrollTo(rows[next]);
      } else select(rows[next]);
      return true;
    }
    if (e.key === 'ArrowLeft' && !e.shiftKey) {
      const on = document.querySelector('.gtd-side .gtd-side__item.is-on');
      if (on && on.offsetParent && (sideOpen || !isNarrowGtd())) {
        e.preventDefault();
        setSelKey(null);
        on.focus();
        return true;
      }
      // 3.39a: en pantalla estrecha (iPhone en vertical con teclado externo) el menú está
      // oculto: ← lo abre y pone el foco en la sección actual (→ vuelve a la lista)
      if (!isNarrowGtd()) return false;
      e.preventDefault();
      setSelKey(null);
      setSideOpen(true);
      const focusOn = (n) => {
        const el = document.querySelector('.gtd-side .gtd-side__item.is-on');
        if (el && el.offsetParent) el.focus();
        else if (n > 0) setTimeout(() => focusOn(n - 1), 50);
      };
      setTimeout(() => focusOn(6), 0);
      return true;
    }
    if (e.key === 'Tab' && (idx < 0 || (t && t.closest && t.closest('button, a, select')))) {
      if (e.shiftKey) return false;
      e.preventDefault();
      focusSearch();
      return true;
    }
    if (e.key === 'Escape' && (sel.length || selKey)) {
      setSelKey(null);
      return true;
    }
    if (idx < 0) return false;
    const task = rows[idx];
    if (e.key === 'Tab') {
      // (4.19) Tab: plegar/desplegar las notas de la tarea seleccionada (antes: hacerla subtarea,
      // que ahora es Alt+→ / Alt+←)
      if (e.shiftKey) return false;
      e.preventDefault();
      setNotesOverride((o) => {
        const cur = o[task.key] || notesMode;
        return { ...o, [task.key]: cur === 'full' ? 'none' : 'full' };
      });
      return true;
    }
    if (e.key === 'Enter') {
      if (t && t.closest && t.closest('button, a, select')) return false;
      e.preventDefault();
      if (task.isProject && !isProjectView) selectView({ type: 'project', key: task.key });
      else setOpenKey(task.key);
      return true;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      const chosen = rows.filter((r) => sel.includes(r.key));
      const list = chosen.length ? chosen : [task];
      const after =
        rows.slice(idx + 1).find((r) => !list.includes(r)) ||
        rows
          .slice(0, idx)
          .reverse()
          .find((r) => !list.includes(r)) ||
        null;
      if (view.id === 'trash') {
        deleteTasks(list).then((deleted) => deleted && select(after));
      } else {
        trashTasks(list).then((done) => done && select(after));
      }
      return true;
    }
    return false;
  };
  // Menú lateral: con el foco en él, ↑ ↓ pasan de sección (y se ve al momento); → entra en la
  // lista. Con el ratón, al tocar una sección el teclado pasa a la lista.
  const onSideKeyDown = (e) => {
    const item = e.target && e.target.closest && e.target.closest('.gtd-side__item');
    if (!item || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const all = Array.from(
        // (3.40) sin los botones que abren algo (Agenda, Revisión, Procesar Inbox)
        document.querySelectorAll(
          '.gtd-side .gtd-side__item:not(.gtd-side__item--agenda):not(.gtd-side__item--review):not(.gtd-side__item--process)'
        )
      ).filter((b) => b.offsetParent);
      const i = all.indexOf(item);
      const next = all[i + (e.key === 'ArrowDown' ? 1 : -1)];
      e.preventDefault();
      if (next) {
        next.focus();
        keepSideRef.current = true;
        next.click();
        keepSideRef.current = false;
        if (next.scrollIntoView) next.scrollIntoView({ block: 'nearest' });
      }
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      item.blur();
      setSideOpen(false);
      const first = items.find((x) => x.kind === 'task');
      setSelKey(first ? first.task.key : null);
    }
  };
  const afterSideClick = (e) => {
    // clic con el ratón o el dedo (detail > 0); con el teclado (Intro, espacio, flechas) es 0
    if (e && e.detail > 0 && e.currentTarget && e.currentTarget.blur) e.currentTarget.blur();
  };

  const keyRef = useRef(null);
  keyRef.current = (e) => {
    if (e.defaultPrevented || e.repeat) return;
    if (['Shift', 'Control', 'Alt', 'Meta', 'AltGraph'].includes(e.key)) return;
    if (isEditable(e.target) || isEditable(document.activeElement)) return;
    if (shouldIgnoreOrganiceHotkey(e, null)) return;
    if (showAgenda || showShortcuts || showTagManager || menu || draft || newProject || openKey)
      return;
    if (
      document.querySelector(
        '.eli-cal__overlay, .eli-calc__overlay, .drawer, [data-testid="drawer"]'
      )
    )
      return;
    if (listKey(e)) return;
    // (3.0) Mayús+1…9: ir al área 1…9 (como Nirvana)
    if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && /^Digit[1-9]$/.test(e.code || '')) {
      const a = areas[Number(e.code.slice(5)) - 1];
      if (a) {
        e.preventDefault();
        selectArea(a);
        return;
      }
    }
    const hit = gtdBindings.find((b) => gtdMatchesBinding(e, b.binding));
    if (!hit || !gtdActions[hit.action]) return;
    e.preventDefault();
    gtdActions[hit.action]();
  };
  // (2.18) va antes (en captura) que el Alt+← de «atrás» de la barra de arriba
  const backKeyRef = useRef(null);
  backKeyRef.current = (e) => {
    if (e.defaultPrevented || e.repeat || !e.altKey) return;
    if (document.querySelector('.eli-palette__overlay, .eli-prompt__overlay')) return;
    // (2.18) Alt+←: volver de la tarea madre a donde se estaba (también con su editor abierto).
    // En un campo de texto solo si el cursor está al principio (si no, Opción+← en el Mac mueve
    // el cursor una palabra, y eso se respeta)
    const field = isEditable(e.target) ? e.target : null;
    const atStart =
      !field ||
      (typeof field.selectionStart === 'number' &&
        field.selectionStart === 0 &&
        field.selectionEnd === 0);
    if (
      e.altKey &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.shiftKey &&
      e.key === 'ArrowLeft' &&
      backRef.current.length &&
      atStart &&
      (!field || openKey)
    ) {
      e.preventDefault();
      e.stopPropagation();
      goBack();
    }
  };
  useEffect(() => {
    const onBack = (e) => backKeyRef.current && backKeyRef.current(e);
    window.addEventListener('keydown', onBack, true);
    return () => window.removeEventListener('keydown', onBack, true);
  }, []);
  useEffect(() => {
    const onKey = (e) => keyRef.current && keyRef.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // (3.0) Clic en una fila, como Nirvana: con el ratón, clic = seleccionar (Ctrl/⌘ añade o quita;
  // (3.01) Mayús+clic = seleccionar todas desde la última elegida hasta ésta) y doble clic =
  // editar; con el dedo, tocar = editar.
  const rowClick = (item) => (e) => {
    if (clickSuppressed()) return;
    const task = item.task;
    if (newKey && openKey === newKey) {
      window.dispatchEvent(new CustomEvent('eli:gtd-attention'));
      return;
    }
    if (e.shiftKey && !e.ctrlKey && !e.metaKey && !item.isRef) {
      const rows = items.filter((i) => i.kind === 'task' && !i.isRef).map((i) => i.task.key);
      const from = rows.indexOf(anchorRef.current || selKey);
      const to = rows.indexOf(task.key);
      if (from >= 0 && to >= 0) {
        const [a, b] = from <= to ? [from, to] : [to, from];
        setSel(rows.slice(a, b + 1));
        setCursor(task.key);
      } else {
        anchorRef.current = task.key;
        setSelKey(task.key);
      }
      return;
    }
    anchorRef.current = task.key;
    if (e.ctrlKey || e.metaKey) {
      setCursor(task.key);
      setSel((cur) =>
        cur.includes(task.key) ? cur.filter((k) => k !== task.key) : [...cur, task.key]
      );
      return;
    }
    // (3.05) con el dedo: un toque abre la tarea en vista previa (se edita al tocar el título o
    // las notas; fechas, etiquetas, estado… siguen a mano). Seleccionar = pulsación larga.
    if (lastPointer.current !== 'mouse') {
      // (3.07) Ajustes › «Al tocar una tarea (móvil)» = Seleccionarla: el primer toque la
      // selecciona (con su barra); tocar la ya seleccionada (o doble toque) la abre
      if (getTapMode('task-mobile') === 'select' && selKey !== task.key) {
        setSelKey(task.key);
        return;
      }
      rowOpen(item, e, { preview: true });
      return;
    }
    // (3.07) ordenador, «Abrirla»: un clic en cualquier parte de la fila la abre
    if (getTapMode('task-desktop') === 'open') {
      rowOpen(item, e);
      return;
    }
    setSelKey(task.key);
  };
  // (3.05) con el ratón, clic sobre el texto del título = editar (con Mayús/Ctrl/⌘, seleccionar)
  const titleClick = (item) => (e) => {
    if (lastPointer.current !== 'mouse') return;
    if (e.shiftKey || e.ctrlKey || e.metaKey) return;
    // (3.07) «Seleccionarla»: el clic en el título también solo selecciona (doble clic = abrir)
    if (getTapMode('task-desktop') === 'select') return;
    e.stopPropagation();
    if (clickSuppressed()) return;
    if (newKey && openKey === newKey) {
      window.dispatchEvent(new CustomEvent('eli:gtd-attention'));
      return;
    }
    anchorRef.current = item.task.key;
    rowOpen(item, e);
  };
  const [previewKey, setPreviewKey] = useState(null);
  useEffect(() => {
    if (!openKey && previewKey) setPreviewKey(null);
  }, [openKey, previewKey]);
  const rowOpen = (item, e, opts = {}) => {
    const task = item.task;
    if (item.isRef) {
      openInFile(task, e);
      return;
    }
    if (task.isProject && !isProjectView) {
      selectView({ type: 'project', key: task.key });
      return;
    }
    setSelKey(task.key);
    setPreviewKey(opts.preview ? task.key : null);
    setOpenKey(task.key);
  };
  // (3.01) Con tareas seleccionadas, un clic fuera de las filas (hueco, cabecera, menú lateral…)
  // quita la selección; no en los menús, ventanas, editores ni al terminar un arrastre o lazo
  const outsideRef = useRef(null);
  outsideRef.current = (e) => {
    if (!sel.length || (e.button && e.button !== 0)) return;
    if (e.shiftKey || e.ctrlKey || e.metaKey) return;
    if (clickSuppressed() || Date.now() - lassoAt.current < 400) return;
    const t = e.target;
    if (!t || !t.closest || !t.isConnected) return;
    if (!t.closest('[data-testid="gtd"]')) return;
    if (
      t.closest(
        '.gtd-task, .gtd-menu, .gtd-editor, .gtd-new-task, .gtd-new-project, .eli-prompt__overlay, ' +
          '.eli-cal__overlay, .drawer, [data-testid="drawer"], .gtd-rapid, .gtd-filterbar'
      )
    )
      return;
    setSel([]);
    setCursor(null);
  };
  useEffect(() => {
    const on = (e) => outsideRef.current && outsideRef.current(e);
    document.addEventListener('click', on);
    return () => document.removeEventListener('click', on);
  }, []);
  const lassoBase = useRef([]);
  const lassoAt = useRef(0);
  const { startLasso } = useLasso({
    onSelect: (keys, additive, toggle) => {
      lassoAt.current = Date.now();
      if (toggle) {
        const k = keys[0];
        setCursor(k);
        setSel((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
        return;
      }
      setSel(Array.from(new Set([...(additive ? lassoBase.current : []), ...keys])));
      if (keys.length) setCursor(keys[keys.length - 1]);
    },
  });
  const dotsDown = (task) => (e) => {
    lassoBase.current = sel;
    setOpenKey(null);
    startLasso(task.key)(e);
  };

  // Menú de una tarea (o de las seleccionadas): clic derecho o ▾
  const listTargets = () => {
    const out = [];
    gtdCfg.order.forEach((id) => {
      if (!isSectionShown(id, gtdCfg)) return;
      if (isActionSection(id) || ['projects', 'logbook', 'trash', 'deadline'].includes(id)) return;
      const def = [...LISTS, ...EXTRA_LISTS].find((l) => l.id === id) || sectionDef(id, gtdCfg);
      if (def) out.push({ id, label: sectionLabel(id, gtdCfg), icon: def.icon });
    });
    return out;
  };
  const openTaskMenu = (task, e) => {
    if (e && e.preventDefault) e.preventDefault();
    const inSel = sel.includes(task.key);
    const list = inSel && sel.length > 1 ? selectedTasks() : [task];
    if (!inSel) setSelKey(task.key);
    else setCursor(task.key);
    const rect =
      e && e.currentTarget && e.type === 'click' ? e.currentTarget.getBoundingClientRect() : null;
    setMenu({
      x: rect ? rect.right - 220 : e.clientX,
      y: rect ? rect.bottom + 2 : e.clientY,
      items: taskMenuItems(list),
      header:
        list.length > 1
          ? `${list.length} seleccionadas${totalEffort(list) ? ` · ${totalEffort(list)}` : ''}`
          : null,
      testId: 'gtd-task-menu-popup',
    });
  };
  // (3.01) «Asignar a proyecto…»: tareas o referencias de cualquier fichero (sin moverlas)
  const assignToProject = async (list) => {
    const one = list.length === 1 ? list[0] : null;
    const project = await pickProject(allProjects, {
      message: one ? `«${one.title}»` : `${list.length} elementos`,
      exclude:
        one && one.project && !one.badProject ? [`${one.project.path}::${one.project.id}`] : [],
    });
    if (!project) return;
    const n = dispatch(gtdAssignProject(list, project));
    if (n)
      dispatch(
        setDisappearingLoadingMessage(
          `Asignada${list.length === 1 ? '' : 's'} a «${project.title}»`,
          2000
        )
      );
  };
  // (3.11) «Mover a otro fichero…»: cualquier fichero cargado (nivel superior) o una de sus
  // cabeceras, con buscador
  // (3.23) También los ficheros .org NO cargados (de Dropbox/carpeta): al elegir uno se carga y se
  // vuelve a preguntar con sus cabeceras.
  const refileElsewhere = async (list, onlyPath = null) => {
    const present = store.getState().org.present;
    const items = [];
    const isMoved = (path, id) => list.some((t) => t.path === path && t.id === id);
    const usable = (p) =>
      p && !p.startsWith(STATIC_FILE_PREFIX) && !p.startsWith('/__') && !/\.org_archive$/i.test(p);
    const loadedPaths = Array.from(present.get('files').keys()).filter(
      (p) => usable(p) && present.getIn(['files', p, 'headers'])
    );
    let unloaded = [];
    if (!onlyPath) {
      const client = store.getState().syncBackend.get('client');
      if (client && client.listOrgFiles) {
        try {
          const all = await Promise.race([
            client.listOrgFiles(),
            new Promise((resolve) => setTimeout(() => resolve(null), 8000)),
          ]);
          unloaded = (all || []).filter((p) => usable(p) && !loadedPaths.includes(p));
        } catch (e) {
          unloaded = [];
        }
      }
    }
    const byName = (a, b) => fileDisplayName(a).localeCompare(fileDisplayName(b));
    loadedPaths
      .filter((p) => !onlyPath || p === onlyPath)
      .sort(byName)
      .forEach((p) => {
        const headers = present.getIn(['files', p, 'headers']);
        if (!headers) return;
        const name = fileDisplayName(p);
        items.push({ id: JSON.stringify([p, null]), label: `📄 ${name}`, hint: 'nivel superior' });
        let skipBelow = null;
        headers.forEach((h) => {
          const lvl = h.get('nestingLevel');
          if (skipBelow !== null) {
            if (lvl > skipBelow) return;
            skipBelow = null;
          }
          // no dentro de sí misma
          if (isMoved(p, h.get('id'))) {
            skipBelow = lvl;
            return;
          }
          const title = (h.getIn(['titleLine', 'rawTitle']) || '').trim() || '(sin título)';
          items.push({
            id: JSON.stringify([p, h.get('id')]),
            label: `${'\u2003'.repeat(Math.min(lvl - 1, 6))}${title}`,
            hint: name,
          });
        });
      });
    unloaded.sort(byName).forEach((p) => {
      items.push({
        id: JSON.stringify([p, null, 'load']),
        label: `📁 ${fileDisplayName(p)}`,
        hint: 'sin cargar: ver sus cabeceras',
      });
    });
    const picked = await askPick({
      title: 'Mover a otro fichero',
      message:
        list.length === 1
          ? `«${list[0].title}» (con sus subtareas)`
          : `${list.length} tareas (con sus subtareas)`,
      placeholder: 'Buscar fichero o cabecera…',
      items,
      emptyText: 'No hay ficheros.',
    });
    if (!picked) return;
    const [path, headerId, mode] = JSON.parse(picked);
    if (mode === 'load') {
      dispatch(setLoadingMessage(`Cargando ${fileDisplayName(path)}…`));
      await Promise.resolve(dispatch(loadFileQuietly(path))).catch(() => null);
      dispatch(hideLoadingMessage());
      if (!store.getState().org.present.getIn(['files', path, 'headers'])) {
        dispatch(setDisappearingLoadingMessage(`No se pudo cargar ${fileDisplayName(path)}`, 2500));
        return;
      }
      return refileElsewhere(list, path);
    }
    const n = dispatch(gtdRefileTo(list, path, headerId));
    if (n) {
      setSel([]);
      setSelKey(null);
    }
  };
  const taskMenuItems = (list) => {
    const single = list.length === 1 ? list[0] : null;
    const save = (fn) => () => dispatch(gtdSaveMany(list.map((t) => [t, fn(t)])));
    if (view.id === 'trash') {
      return [
        {
          label: 'Sacar de la papelera a…',
          icon: 'fas fa-undo',
          sub: listTargets().map((l) => ({
            label: l.label,
            icon: l.icon,
            onClick: () => applyDrop(list, `list:${l.id}`),
          })),
        },
        {
          label: 'Sacar de la papelera (como estaba)',
          icon: 'fas fa-reply',
          onClick: save((t) => untrashChanges(t)),
        },
        { sep: true },
        {
          label: 'Borrar para siempre…',
          icon: 'fas fa-times',
          danger: true,
          disabled: !single,
          onClick: () => single && deleteTask(single),
        },
      ];
    }
    const allStar = list.every((t) => t.priority === 'A');
    const allDone = list.every((t) => t.isDone);
    const effortSub = [
      ...effortOptions.map((v) => ({
        label: v,
        checked: list.every((t) => t.effort === v),
        onClick: save(() => ({ effort: v })),
      })),
      { sep: true },
      { label: 'Quitar', icon: 'fas fa-times', onClick: save(() => ({ effort: null })) },
    ];
    const energySub = [
      ...energyOptions.map((v) => ({
        label: v,
        checked: list.every((t) => t.energy === v),
        onClick: save(() => ({ energy: v })),
      })),
      { sep: true },
      { label: 'Quitar', icon: 'fas fa-times', onClick: save(() => ({ energy: null })) },
    ];
    const tagNames = Array.from(new Set([...contextTags, ...allTags])).filter(
      (t) => !hasTrashTag([t])
    );
    const tagSub = [
      ...tagNames.map((tag) => {
        const all = list.every((t) => (t.ownTags || []).includes(tag));
        return {
          label: tag,
          checked: all,
          onClick: save((t) => ({
            tags: all
              ? (t.ownTags || []).filter((x) => x !== tag)
              : Array.from(new Set([...(t.ownTags || []), tag])),
          })),
        };
      }),
      { sep: true },
      {
        label: 'Etiqueta nueva…',
        icon: 'fas fa-plus',
        onClick: async () => {
          const tag = await askText({ title: 'Etiqueta nueva', placeholder: '@contexto' });
          const name = String(tag || '')
            .trim()
            .replace(/[\s:]+/g, '');
          if (name) save((t) => ({ tags: Array.from(new Set([...(t.ownTags || []), name])) }))();
        },
      },
    ];
    const moveSub = [
      ...listTargets().map((l) => ({
        label: l.label,
        icon: l.icon,
        onClick: () => applyDrop(list, `list:${l.id}`),
      })),
      { sep: true },
      ...projectGroups.active
        .filter((p) => !list.some((t) => t.key === p.key))
        .map((p) => ({
          label: p.title,
          icon: 'fas fa-project-diagram',
          onClick: () => applyDrop(list, `project:${p.key}`),
        })),
      ...(list.some((t) => t.project && !t.isProject)
        ? [
            {
              label: 'Fuera del proyecto (suelta)',
              icon: 'far fa-circle',
              onClick: () =>
                applyDrop(
                  list.filter((t) => t.project),
                  'loose:'
                ),
            },
          ]
        : []),
    ];
    const convertSub = [
      {
        label: 'Acción',
        icon: 'far fa-check-square',
        disabled: list.every((t) => t.keyword && !t.isProject),
        onClick: save((t) => ({
          list: t.isProject ? 'later' : 'next',
          tags: tagsForList(t, t.isProject ? 'later' : 'next'),
        })),
      },
      {
        label: 'Proyecto',
        icon: 'fas fa-project-diagram',
        disabled: list.every((t) => t.isProject),
        onClick: save((t) => ({ list: 'project', tags: tagsForList(t, 'next') })),
      },
      {
        label: 'Referencia',
        icon: 'far fa-file-alt',
        onClick: save((t) => ({ list: 'reference', tags: tagsForList(t, 'reference') })),
      },
    ];
    const day = (n) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + n);
    return [
      ...(single
        ? [
            {
              label: single.isProject && !isProjectView ? 'Abrir el proyecto' : 'Editar',
              icon: 'fas fa-pen',
              hint: 'doble clic',
              onClick: () => rowOpen({ task: single }, null),
            },
          ]
        : []),
      {
        label: allStar ? 'Quitar de Focus' : 'Focus ★',
        icon: allStar ? 'far fa-star' : 'fas fa-star',
        onClick: save(() => ({ priority: allStar ? null : 'A' })),
      },
      ...(list.some((t) => t.isProject)
        ? []
        : [
            {
              label: allDone ? 'Reabrir' : 'Completar',
              icon: allDone ? 'fas fa-undo' : 'fas fa-check',
              onClick: async () => {
                const extra = allDone ? [] : await subtaskEntries(list);
                if (extra === null) return;
                dispatch(gtdSaveMany([...extra, ...list.map((t) => [t, doneChangesFor(t)])]));
              },
            },
          ]),
      { sep: true },
      { label: 'Mover a', icon: 'fas fa-share', sub: moveSub, testId: 'gtd-menu-move' },
      {
        label: 'Mover a otro fichero…',
        icon: 'far fa-file-alt',
        onClick: () => refileElsewhere(list),
        testId: 'gtd-menu-refile-file',
      },
      ...(list.some((t) => t.isProject)
        ? []
        : [
            {
              label: list.some((t) => t.badProject)
                ? 'Asignar a otro proyecto…'
                : 'Asignar a proyecto…',
              icon: 'fas fa-link',
              onClick: () => assignToProject(list),
              testId: 'gtd-menu-assign',
            },
            ...(list.some((t) => t.projRefOwn)
              ? [
                  {
                    label: 'Quitar del proyecto',
                    icon: 'fas fa-unlink',
                    onClick: () => dispatch(gtdUnassignProject(list)),
                    testId: 'gtd-menu-unassign',
                  },
                ]
              : []),
          ]),
      { label: 'Convertir en', icon: 'fas fa-exchange-alt', sub: convertSub },
      { label: 'Etiquetas', icon: 'fas fa-tag', sub: tagSub },
      { label: 'Tiempo', icon: 'far fa-clock', sub: effortSub },
      { label: 'Energía', icon: 'fas fa-bolt', sub: energySub },
      // (3.01) «Programar…» (SCHEDULED), también con varias seleccionadas (un solo Deshacer)
      {
        label: 'Programar…',
        icon: 'far fa-calendar-alt',
        onClick: () => applyDrop(list, 'list:scheduled'),
        testId: 'gtd-menu-schedule',
      },
      ...(list.some((t) => t.scheduled)
        ? [
            {
              label: 'Quitar la fecha programada',
              icon: 'fas fa-times',
              onClick: save(() => ({ scheduled: null })),
            },
          ]
        : []),
      {
        label: 'Fecha límite…',
        icon: 'fas fa-flag',
        onClick: async () => {
          const date = await askDate({
            title: 'Fecha límite (Deadline)',
            message: single ? `«${single.title}»` : `${list.length} elementos`,
            value: (single && single.deadline) || day(0),
          });
          if (date) save(() => ({ deadline: date }))();
        },
      },
      ...(list.some((t) => t.deadline)
        ? [
            {
              label: 'Quitar la fecha límite',
              icon: 'fas fa-times',
              onClick: save(() => ({ deadline: null })),
            },
          ]
        : []),
      // (4.11) reloj, enlace propio y exportar (con notas y subtareas)
      ...(single
        ? [
            { sep: true },
            {
              label: isClockRunning(single.header) ? 'Parar el reloj' : 'Iniciar el reloj',
              icon: isClockRunning(single.header) ? 'fas fa-stop' : 'fas fa-play',
              onClick: runTool(toggleTaskClock, single),
              testId: 'gtd-menu-clock',
            },
            {
              label: 'Copiar el enlace de la tarea',
              icon: 'fas fa-share-alt',
              onClick: runTool(copyTaskLink, single),
              testId: 'gtd-menu-copy-link',
            },
            {
              label: 'Exportar a PDF…',
              icon: 'far fa-file-pdf',
              onClick: runTool(exportTaskPdf, single),
              testId: 'gtd-menu-pdf',
            },
            {
              label: 'Compartir como Org…',
              icon: 'far fa-file-alt',
              onClick: runTool(shareTaskOrg, single),
              testId: 'gtd-menu-org',
            },
          ]
        : []),
      { sep: true },
      {
        label: 'Hacer una copia',
        icon: 'far fa-copy',
        onClick: () => dispatch(gtdDuplicate(list)),
      },
      {
        label: 'Copiar como ORG Mode',
        icon: 'far fa-clipboard',
        hint: '⌘C',
        onClick: () => copyOrg(list, null),
      },
      ...(single
        ? [
            {
              label: 'Abrir en su fichero',
              icon: 'fas fa-external-link-alt',
              onClick: () => openInFile(single, null),
            },
          ]
        : []),
      { sep: true },
      {
        label: 'Papelera',
        icon: 'fas fa-trash',
        hint: 'Supr',
        danger: true,
        onClick: () => trashTasks(list),
        testId: 'gtd-menu-trash',
      },
    ];
  };

  // Menú ⋯ de la cabecera: opciones de la vista (como Nirvana) y lo que se usa menos
  // (4.13) las tareas que se ven ahora (en el orden de la vista) y el título de la vista: con una
  // búsqueda del menú lateral, sus resultados; en «Todos los proyectos», los proyectos
  const exportView = () => {
    let list;
    let vTitle = title;
    if (searchGroups) {
      list = searchGroups.flatMap((g) => g.list);
      vTitle = `Búsqueda: ${searchText.trim()}`;
    } else if (view.id === 'projects') {
      list = ['active', 'scheduled', 'sleep'].flatMap((id) => overview[id].map((r) => r.project));
    } else if (view.id === 'horizons' || view.id === 'tickler') {
      list = [];
    } else {
      list = items.filter((i) => i.kind === 'task' && !i.isRef).map((i) => i.task);
    }
    const seen = new Set();
    list = list.filter((t) => t && t.header && !seen.has(t.key) && seen.add(t.key));
    return { list, title: vTitle || 'GTD' };
  };
  const viewMenuItems = () => {
    const setGroup = (g) => {
      setGroupMode(g);
      writeLS('eliGtdGroup', g);
    };
    const setNotes = (m) => {
      setNotesMode(m);
      writeLS('eliGtdNotes', m);
      setNotesOverride({});
    };
    // (4.0) Sin Revisión semanal ni Procesar Inbox (están en el menú lateral), ni «Editar el
    // proyecto» / «Abrir en su fichero» (clic en el título del proyecto y su editor)
    const out = [];
    // (3.01) «Opciones de vista» (como Nirvana): Acciones (una sola) y Detalles (interruptores)
    const opts = [
      { heading: 'Acciones' },
      {
        label: 'Lista única',
        checked: groupMode === 'none' || (!canGroup && groupMode === 'project'),
        onClick: () => setGroup('none'),
        testId: 'gtd-opt-single',
      },
      {
        label: 'Agrupar por proyecto',
        checked: groupMode === 'project' && canGroup,
        disabled: !canGroup,
        onClick: () => setGroup('project'),
        testId: 'gtd-group-project-opt',
      },
      {
        label: 'Acciones siguientes secuenciales',
        checked: groupMode === 'sequential',
        onClick: () => setGroup('sequential'),
        testId: 'gtd-opt-sequential',
      },
      ...(view.id === 'focus' || view.id === 'tag'
        ? [
            {
              label: 'Agrupar por estado',
              checked: groupMode === 'status',
              onClick: () => setGroup('status'),
            },
          ]
        : []),
      { sep: true },
      { heading: 'Detalles' },
      {
        label: 'Ajustar títulos largos',
        checked: details.wrap,
        onClick: () => setDetail('wrap', !details.wrap),
        testId: 'gtd-opt-wrap',
      },
      {
        label: 'Mostrar notas',
        icon: 'far fa-sticky-note',
        checked: notesMode !== 'none',
        sub: [
          { label: 'Completas', checked: notesMode === 'full', onClick: () => setNotes('full') },
          {
            label: 'Parciales',
            checked: notesMode === 'partial',
            onClick: () => setNotes('partial'),
          },
          { label: 'Ocultas', checked: notesMode === 'none', onClick: () => setNotes('none') },
        ],
        testId: 'gtd-opt-notes',
      },
      {
        label: 'Mostrar etiquetas',
        checked: details.tags,
        onClick: () => setDetail('tags', !details.tags),
        testId: 'gtd-opt-tags',
      },
      {
        label: 'Mostrar esfuerzo',
        checked: details.effort,
        onClick: () => setDetail('effort', !details.effort),
        testId: 'gtd-opt-effort',
      },
      {
        label: 'Mostrar área',
        checked: details.area,
        onClick: () => setDetail('area', !details.area),
        testId: 'gtd-opt-area',
      },
    ];
    out.push(
      {
        label: 'Opciones de vista',
        icon: 'fas fa-sliders-h',
        sub: opts,
        testId: 'gtd-view-options',
      },
      { label: 'Ordenar por fecha límite', checked: sortDue, hint: 'd', onClick: toggleSortDue },
      {
        label: 'Entrada rápida',
        checked: rapidOn,
        hint: 'Mayús E',
        onClick: () => toggleRapid(false),
      },
      {
        label: 'Subtareas',
        checked: subtasksOn,
        onClick: () => {
          const v = !subtasksOn;
          setSubtasksOn(v);
          writeLS('eliGtdSubtasks', v);
        },
        testId: 'gtd-menu-subtasks',
      },
      {
        label: 'Pasar las hechas al Logbook al momento',
        checked: autoCollectOn,
        onClick: () => {
          const v = !autoCollectOn;
          setAutoCollectOn(v);
          try {
            window.localStorage.setItem(LS_AUTO_COLLECT, v ? 'true' : 'false');
          } catch (e) {}
        },
      },
      { sep: true },
      {
        label: 'Gestionar etiquetas',
        icon: 'fas fa-tags',
        hint: 'g',
        onClick: () => setShowTagManager(true),
      },
      {
        label: 'Copiar la lista como ORG Mode',
        icon: 'far fa-clipboard',
        hint: '⌘C',
        onClick: () =>
          copyOrg(
            items.filter((i) => i.kind === 'task' && !i.task.isDone).map((i) => i.task),
            title
          ),
      },
      // (4.14) Replanificar el proyecto (Modelo de Planificación Natural sobre lo que ya hay)
      ...(projectTask
        ? [
            {
              label: 'Replanificar el proyecto',
              icon: 'fas fa-drafting-compass',
              onClick: () => startDaily('project', { existing: projectTask.key }),
              testId: 'gtd-menu-replan',
            },
          ]
        : []),
      // (4.13) exportar lo que muestra la vista en este momento (sección, proyecto, filtro,
      // búsqueda…)
      {
        label: 'Exportar la vista a PDF',
        icon: 'far fa-file-pdf',
        disabled: !exportView().list.length,
        onClick: () => {
          const v = exportView();
          exportViewPdf(v.list, v.title);
        },
        testId: 'gtd-view-export-pdf',
      },
      {
        label: 'Exportar la vista como ORG',
        icon: 'far fa-file-alt',
        disabled: !exportView().list.length,
        onClick: async () => {
          const v = exportView();
          const msg = await exportViewOrg(tasksToOrg(v.title, v.list), v.title);
          if (msg) dispatch(setDisappearingLoadingMessage(msg, 2000));
        },
        testId: 'gtd-view-export-org',
      }
    );
    if (view.id === 'logbook') {
      out.push(
        { sep: true },
        {
          label: `Archivar todas las terminadas (${archivable.ok.length})`,
          icon: 'fas fa-archive',
          disabled: !archivable.ok.length,
          onClick: () => archiveTasks(archivable.ok),
          testId: 'gtd-archive-all',
        },
        {
          label: 'Revisar los adjuntos de las terminadas…',
          icon: 'fas fa-paperclip',
          onClick: () => dispatch(eliReviewFinishedAttachments()),
        }
      );
    }
    // (4.0) Atajos de teclado (Menú de arriba), Agenda (menú lateral) y Sincronizar (la nube) ya
    // no se repiten aquí
    return out;
  };

  // (4.07) nombre del objetivo de un proyecto (el del fichero de horizontes o el del enlace)
  const objectiveLabelOf = (task) => {
    const ref = objectiveRefOf(task);
    if (!ref) return null;
    const o = horizons.objectives.find(
      (x) => x.orgId && x.orgId.toLowerCase() === ref.id.toLowerCase()
    );
    return (o && o.title) || ref.title || 'Objetivo';
  };
  // (4.11) enlace a otra tarea ([[id:…][Título]]; se le pone :ID: si no lo tiene)
  const pickTaskLink = async (from) => {
    const items = tasks
      .filter((t) => t.key !== from.key && !t.isTrashed)
      .map((t) => ({ id: t.key, label: t.title, hint: fileDisplayName(t.path) }));
    const key = await askPick({
      title: 'Enlace a otra tarea',
      message: from.title,
      placeholder: 'Buscar tarea…',
      items,
      emptyText: 'No hay otras tareas.',
    });
    const target = key && tasks.find((t) => t.key === key);
    return target ? taskLinkText(dispatch(gtdEnsureOrgId(target)), target.title) : '';
  };
  const renderEditor = (task) => (
    <TaskEditor
      key={task.key + task.header.hashCode() + ':' + editorRev}
      task={task}
      projects={allProjects.filter((p) => p.key !== task.key)}
      areas={areas}
      allTags={allTags}
      contextTags={contextTags}
      onOpenLink={(target) => openLink(task, target)}
      onSave={(changes, projectKey) => saveTask(task, changes, projectKey)}
      onSaveProperties={(rows) => dispatch(gtdSetProperties(task, rows))}
      onPickTaskLink={() => pickTaskLink(task)}
      onClose={() => {
        setOpenKey(null);
        if (newKey === task.key) setNewKey(null);
      }}
      mustDecide={newKey === task.key}
      onCancelNew={
        newKey === task.key
          ? () => {
              setOpenKey(null);
              setNewKey(null);
              setFreshKeys((k) => k.filter((x) => x !== task.key));
              dispatch(gtdDeleteTask(task));
            }
          : undefined
      }
      replacesRow
      onUndo={() => {
        dispatch(gtdUndo());
        setEditorRev((r) => r + 1);
      }}
      onRedo={() => {
        dispatch(gtdRedo());
        setEditorRev((r) => r + 1);
      }}
      canUndo={canUndo}
      canRedo={canRedo}
      onOpen={(e) => openInFile(task, e)}
      onDelete={() => (task.isTrashed ? deleteTask(task) : trashTasks([task]))}
      inTrash={!!task.isTrashed}
      onArchive={() => {
        setOpenKey(null);
        dispatch(gtdArchiveTask(task));
      }}
      onCloseProject={task.isProject ? () => closeProject(task) : undefined}
      objective={task.isProject ? objectiveLabelOf(task) : null}
      onPickObjective={
        task.isProject && (horizonsOn || objectiveRefOf(task))
          ? () => pickObjective(task)
          : undefined
      }
      onAddSubtask={
        !subtasksOn || task.isTrashed || task.isDone ? undefined : () => addSubtask(task)
      }
      onAttachFiles={(list, target) =>
        openUploadDialog({ files: list, source: 'attach', path: task.path, target })
      }
      onDeleteFile={(target) => deleteAttachmentFile(task, target)}
      energyOptions={energyOptions}
      effortOptions={effortOptions}
      parentOptions={
        task.isProject || !subtasksOn
          ? []
          : tasks
              .filter((p) => canBeParentOf(p, task, tasks, tasksByKey))
              .map((p) => ({ id: p.id, title: p.title }))
      }
      parentTaskId={(shownParentOf(task) || {}).id || ''}
      onGoToParent={() => goToTask(parentTaskOf(task))}
      noAutoFocus={jumpedKey === task.key}
      preview={previewKey === task.key}
      onMove={(e) => {
        // (3.06) hoja del móvil: «→ Mover» abre directamente «Mover a»
        const mv = taskMenuItems([task]).find((i) => i.testId === 'gtd-menu-move');
        const r = e && e.currentTarget ? e.currentTarget.getBoundingClientRect() : null;
        setMenu({
          x: r ? r.left : 8,
          y: r ? r.top - 8 : window.innerHeight,
          items: mv && mv.sub ? mv.sub : taskMenuItems([task]),
          header: 'Mover a',
          testId: 'gtd-task-menu-popup',
        });
      }}
    />
  );

  // ORG Mode para Eli: borrar un archivo adjunto desde el editor (el enlace lo quita el editor)
  const deleteAttachmentFile = async (task, target) => {
    const path = resolveDropboxPath(task.path, target);
    if (!path) return false;
    const result = await confirmAndDeleteAttachment({
      client,
      files,
      orgFilePath: task.path,
      path,
      excludedIds: new Set([task.id]),
    });
    // El enlace se quita ya del fichero (el editor lo quita también de sus notas)
    if (result && task.id) dispatch(eliRemoveAttachmentLink(task.path, task.id, target));
    return !!result;
  };

  const renderNewProjectEditor = () => (
    <div className="gtd-new-project" data-testid="gtd-new-project">
      <TaskEditor
        key={'new-project:' + newProject.rev}
        isNew
        task={{
          key: '__new_project__',
          path: tasksFile,
          isProject: true,
          rawTitle: newProject.title,
          ownTags: [],
          tags: [],
          ownArea: area !== '*' && area !== '-' ? area : '',
          description: '',
        }}
        projects={allProjects}
        areas={areas}
        allTags={allTags}
        contextTags={contextTags}
        onSave={createProject}
        onAttachFiles={(list, target) =>
          openUploadDialog({ files: list, source: 'attach', path: tasksFile, target })
        }
        onClose={() => setNewProject(null)}
        energyOptions={energyOptions}
        effortOptions={effortOptions}
      />
    </div>
  );

  // (4.22) un subproyecto cuelga de su madre: con sangría y una flechita ↳
  const renderProjectButton = (p, depth = 0) => {
    const n = tasksForView(tasks, { type: 'project', key: p.key }, { area: '*' }, today).length;
    return (
      <button
        key={p.key}
        data-drop={`project:${p.key}`}
        className={
          'gtd-side__item gtd-side__item--project' +
          (depth ? ' is-sub' : '') +
          (view.key === p.key ? ' is-on' : '') +
          dropProps(`project:${p.key}`).className
        }
        style={depth ? { paddingLeft: 12 + depth * 14 } : undefined}
        onClick={(e) => {
          selectView({ type: 'project', key: p.key });
          afterSideClick(e);
        }}
        data-testid="gtd-project"
      >
        {depth ? (
          <span className="gtd-side__sub-arrow" aria-hidden="true">
            ↳
          </span>
        ) : null}
        <i className="fas fa-project-diagram gtd-side__icon" />
        <span className="gtd-side__label">{p.title}</span>
        {n > 0 && <span className="gtd-side__count">{n}</span>}
      </button>
    );
  };

  const title =
    view.type === 'project'
      ? projectTask
        ? projectTask.title
        : 'Proyecto'
      : view.id === 'projects'
      ? 'Todos los proyectos'
      : view.id === 'tag'
      ? view.tag
      : sectionLabel(view.id, gtdCfg);

  const renderListItem = (l) => (
    <button
      key={l.id}
      data-drop={`list:${l.id}`}
      className={
        'gtd-side__item' +
        (view.id === l.id && view.type !== 'project' ? ' is-on' : '') +
        dropProps(`list:${l.id}`).className
      }
      onClick={(e) => {
        selectView({ id: l.id });
        afterSideClick(e);
      }}
      data-testid={`gtd-list-${l.id}`}
    >
      <i className={l.icon + ' gtd-side__icon'} />
      <span className="gtd-side__label">{l.label}</span>
      {counts[l.id] > 0 && l.id !== 'logbook' && l.id !== 'trash' && (
        <span className="gtd-side__count">{counts[l.id]}</span>
      )}
    </button>
  );

  // ORG Mode para Eli: menú lateral en el orden de Ajustes, sin las secciones ocultas
  const renderAgendaButton = () => (
    <button
      className="gtd-side__item gtd-side__item--agenda"
      onClick={() => {
        setSideOpen(false);
        setShowAgenda(true);
      }}
      data-testid="gtd-agenda"
    >
      <i className="fas fa-calendar-alt gtd-side__icon" />
      <span className="gtd-side__label">Agenda</span>
    </button>
  );
  // (3.24) Revisión semanal; (3.44) sección propia del menú (Ajustes)
  const renderReviewButton = () => (
    <button
      key="review"
      className={'gtd-side__item gtd-side__item--review' + (reviewStep !== null ? ' is-on' : '')}
      onClick={startReview}
      title="Revisión semanal guiada"
      data-testid="gtd-review-start"
    >
      <i className="fas fa-clipboard-check gtd-side__icon" />
      <span className="gtd-side__label">Revisión semanal</span>
    </button>
  );
  // (3.40) Procesar Inbox (asistente de una tarea cada vez); (3.44) sección propia del menú
  const renderHorizonsButton = () => (
    <button
      key="horizons"
      className={
        'gtd-side__item' + (view.id === 'horizons' && view.type !== 'project' ? ' is-on' : '')
      }
      onClick={(e) => {
        selectView({ id: 'horizons' });
        afterSideClick(e);
      }}
      data-testid="gtd-list-horizons"
    >
      <i className="fas fa-binoculars gtd-side__icon" />
      <span className="gtd-side__label">{sectionLabel('horizons', gtdCfg)}</span>
      {hGaps > 0 && (
        <span className="gtd-side__count" title="Sin nada activo">
          {hGaps}
        </span>
      )}
    </button>
  );
  // (4.17) Tickler: página con las entradas de tickler.org por fecha
  const renderTicklerButton = () => (
    <button
      key="tickler"
      className={
        'gtd-side__item' + (view.id === 'tickler' && view.type !== 'project' ? ' is-on' : '')
      }
      onClick={(e) => {
        selectView({ id: 'tickler' });
        afterSideClick(e);
      }}
      data-testid="gtd-list-tickler"
    >
      <i className="far fa-bell gtd-side__icon" />
      <span className="gtd-side__label">{sectionLabel('tickler', gtdCfg)}</span>
    </button>
  );
  const renderProcessButton = () => (
    <button
      key="process"
      className={'gtd-side__item gtd-side__item--process' + (proc ? ' is-on' : '')}
      onClick={startProcess}
      title="Procesar el Inbox: una tarea cada vez"
      data-testid="gtd-process-start"
    >
      <i className="fas fa-filter gtd-side__icon" />
      <span className="gtd-side__label">Procesar Inbox</span>
    </button>
  );
  const renderProjectsBlock = () => (
    <React.Fragment>
      <div className="gtd-side__section">
        {/* (3.01) la sección «Proyectos» se pliega y despliega (se recuerda) */}
        <button
          type="button"
          className="gtd-side__section-toggle"
          onClick={() => {
            const v = !projectsOpen;
            setProjectsOpen(v);
            writeLS('eliGtdProjectsOpen', v);
          }}
          aria-expanded={projectsOpen}
          data-testid="gtd-projects-toggle"
        >
          <i className={projectsOpen ? 'fas fa-caret-down' : 'fas fa-caret-right'} /> Proyectos
        </button>
        <button
          className="gtd-side__add"
          title="Nuevo proyecto"
          onClick={addProject}
          data-testid="gtd-add-project"
        >
          +
        </button>
      </div>
      <nav className="gtd-side__projects" style={projectsOpen ? undefined : { display: 'none' }}>
        {gtdCfg.sections.projects.allProjects !== false && (
          <button
            className={
              'gtd-side__item gtd-side__item--all-projects' +
              (view.id === 'projects' ? ' is-on' : '')
            }
            onClick={(e) => {
              selectView({ id: 'projects' });
              afterSideClick(e);
            }}
            data-testid="gtd-all-projects"
          >
            <i className="fas fa-th-list gtd-side__icon" />
            <span className="gtd-side__label">Todos los proyectos</span>
          </button>
        )}
        {projectGroups.active.length === 0 && (
          <div className="gtd-side__empty">Sin proyectos activos (estado PROJECT)</div>
        )}
        {nestProjects(projectGroups.active).map(({ p, depth }) => renderProjectButton(p, depth))}
        {[
          ['scheduled', 'Programados', 'far fa-calendar-alt'],
          ['sleep', 'Dormidos', 'fas fa-bed'],
        ].map(([id, label, icon]) =>
          projectGroups[id].length ? (
            <div key={id} className="gtd-side__group" data-testid={`gtd-projects-${id}`}>
              <button
                className="gtd-side__group-toggle"
                onClick={() => setProjGroupsOpen((g) => ({ ...g, [id]: !g[id] }))}
                aria-expanded={!!projGroupsOpen[id]}
                data-testid={`gtd-projects-${id}-toggle`}
              >
                <i className={projGroupsOpen[id] ? 'fas fa-caret-down' : 'fas fa-caret-right'} />{' '}
                <i className={icon} /> {label}
                <span className="gtd-side__count">{projectGroups[id].length}</span>
              </button>
              {projGroupsOpen[id] &&
                nestProjects(projectGroups[id]).map(({ p, depth }) =>
                  renderProjectButton(p, depth)
                )}
            </div>
          ) : null
        )}
      </nav>
    </React.Fragment>
  );
  const sidebarBlocks = () => {
    const out = [];
    let group = [];
    let afterProjects = false;
    const flush = () => {
      if (!group.length) return;
      out.push(
        <nav
          key={'lists' + out.length}
          className={'gtd-side__lists' + (afterProjects ? ' gtd-side__lists--extra' : '')}
        >
          {group}
        </nav>
      );
      group = [];
    };
    // (3.05) separadores de Ajustes: línea simple o cabecera plegable (se recuerda)
    let folded = false;
    gtdCfg.order.forEach((id) => {
      if (isSepId(id)) {
        flush();
        const sep = separatorOf(id, gtdCfg);
        if (!sep) return;
        folded = !!sep.label && sepFolded.includes(id);
        out.push(
          sep.label ? (
            <div key={id} className="gtd-side__sep gtd-side__sep--head" data-testid="gtd-side-sep">
              <button
                type="button"
                className="gtd-side__sep-toggle"
                onClick={() => {
                  const next = sepFolded.includes(id)
                    ? sepFolded.filter((x) => x !== id)
                    : [...sepFolded, id];
                  setSepFolded(next);
                  writeLS('eliGtdSepFolded', next);
                }}
                aria-expanded={!folded}
                data-testid="gtd-side-sep-toggle"
              >
                <i className={folded ? 'fas fa-caret-right' : 'fas fa-caret-down'} /> {sep.label}
              </button>
            </div>
          ) : (
            <hr key={id} className="gtd-side__sep" data-testid="gtd-side-sep" />
          )
        );
        return;
      }
      // (3.06) el ámbito de un separador con título acaba en el siguiente separador, también en
      // los «de serie» (antes de Agenda y de Proyectos, que van en su propio bloque)
      if (id === 'agenda' || id === 'projects') folded = false;
      if (folded) return;
      if (!isSectionShown(id, gtdCfg)) return;
      if (id === 'agenda') {
        flush();
        out.push(<React.Fragment key="agenda">{renderAgendaButton()}</React.Fragment>);
      } else if (id === 'process' || id === 'review') {
        // (3.44) secciones propias del menú (se muestran/ocultan y ordenan en Ajustes)
        group.push(id === 'process' ? renderProcessButton() : renderReviewButton());
      } else if (id === 'horizons') {
        // (4.07) página de Horizontes (apagada por defecto)
        group.push(renderHorizonsButton());
      } else if (id === 'tickler') {
        // (4.17) página del Tickler
        group.push(renderTicklerButton());
      } else if (id === 'projects') {
        flush();
        out.push(<React.Fragment key="projects">{renderProjectsBlock()}</React.Fragment>);
        afterProjects = true;
      } else {
        const def = [...LISTS, ...EXTRA_LISTS].find((l) => l.id === id) || sectionDef(id, gtdCfg);
        // (2.16) con el nombre de Ajustes (si se ha cambiado)
        if (def) group.push(renderListItem({ ...def, label: sectionLabel(id, gtdCfg) }));
      }
    });
    flush();
    return out;
  };

  // (4.07) página «Horizontes»: cada objetivo y cada área con sus proyectos
  const hGaps =
    horizonsOn && hView
      ? hView.objectives.filter((o) => o.empty).length + hView.areas.filter((a) => a.empty).length
      : 0;
  const renderHorizonProject = (p) => {
    const st = projectState(p, today);
    return (
      <button
        key={p.key}
        className={'gtd-overview__row' + (st !== 'active' ? ' is-parked' : '')}
        onClick={() => selectView({ type: 'project', key: p.key })}
        onContextMenu={(e) => openTaskMenu(p, e)}
        data-testid="gtd-hz-row"
      >
        <span className="gtd-overview__title">
          <i className="fas fa-project-diagram" /> {p.title}
        </span>
        <span className="gtd-overview__meta">
          {st !== 'active' && (
            <span className="gtd-meta">{st === 'sleep' ? 'Dormido' : 'Por empezar'}</span>
          )}
          {p.area && <span className="gtd-meta gtd-meta--area">{p.area}</span>}
        </span>
      </button>
    );
  };
  const renderHorizonGroup = (x, icon, label, kind, extra = null) => (
    <section key={x.key} className="gtd-horizons__group" data-testid={`gtd-hz-${kind}`}>
      <div className={'gtd-section gtd-horizons__title' + (x.empty ? ' is-empty' : '')}>
        <i className={icon} /> {label}
        {extra}
        <span className="gtd-overview__n">{x.projects.length}</span>
        {x.empty && (
          <span className="gtd-horizons__warn" data-testid="gtd-hz-empty">
            {kind === 'goal' ? 'Ningún proyecto lo mueve' : 'Sin proyecto activo'}
          </span>
        )}
      </div>
      {x.projects.map(renderHorizonProject)}
    </section>
  );
  // (4.16) botón con el plazo de un objetivo (cambia con un buscador)
  const renderTermButton = (o) => (
    <button
      type="button"
      className="gtd-meta gtd-horizons__termbtn"
      onClick={(e) => {
        e.stopPropagation();
        pickTerm(o);
      }}
      title="Cambiar el plazo"
      data-testid="gtd-hz-term-btn"
    >
      <i className="far fa-clock" />{' '}
      {o.term ? HORIZON_TERMS.find((x) => x.id === o.term).label : 'Plazo'}
    </button>
  );
  // (4.16) avisos suaves de las frecuencias oficiales
  const renderHzReminders = () =>
    hzReminders.length > 0 && (
      <div className="gtd-horizons__reminders" data-testid="gtd-hz-reminders">
        {hzReminders.map((r) => (
          <div key={r.id} className="gtd-horizons__reminder" data-testid={`gtd-hz-due-${r.id}`}>
            <i className="far fa-bell" />{' '}
            {r.kind === 'recal'
              ? `${r.label}: toca recalibrar (trimestral)`
              : `${r.label}: revisión ${r.every}`}
            {' · '}
            {r.since === null ? 'sin revisar aún' : `hace ${r.since} días`}
          </div>
        ))}
      </div>
    );
  // (4.17) Tickler: las entradas de tickler.org por fecha; cambiar la fecha, liberarlas ya (al
  // Inbox o a Next), editarlas, borrarlas y añadir otras. Al llegar su fecha siguen saliendo en
  // «Tickler de hoy» de la Revisión diaria, como siempre.
  const ticklerSetDate = (t, d) => {
    if (!d || !ticklerLoadedPath) return;
    dispatch(gtdTicklerReschedule(t, ticklerLoadedPath, d));
    toast(`Para el ${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`);
  };
  const ticklerToNext = (t) => {
    if (!tasksFile || !files.getIn([tasksFile, 'headers'])) return;
    let moved = t;
    if (t.path !== tasksFile) {
      dispatch(gtdRefileTo([t], tasksFile, null));
      moved = { ...t, path: tasksFile, key: `${tasksFile}::${t.id}` };
    }
    dispatch(gtdSaveTask(moved, { list: 'next', tags: tagsForList(t, 'next'), scheduled: null }));
    toast('→ Next');
  };
  const ticklerAdd = async () => {
    const title = tkTitle.trim();
    if (!title) return;
    const d = fromDateInput(tkDate) || shiftTicklerDate(today, 'day', 1, today);
    const path = ticklerLoadedPath || (await ticklerFile({ path: inboxFile || tasksFile }));
    if (!path) return;
    if (dispatch(gtdTicklerAdd(path, title, d))) {
      setTkTitle('');
      toast(`Tickler: ${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`);
    }
  };
  const renderTicklerRow = (t) => {
    const quick = [
      ['day', '+1 d', 'Un día después'],
      ['week', '+1 s', 'Una semana después'],
      ['month', '+1 m', 'Un mes después'],
    ];
    const actsOpen = !!tkActsOpen[t.key];
    return (
      <div key={t.key} className="gtd-tickler__row" data-testid="gtd-tickler-row">
        <div className="gtd-tickler__main">
          <span className="gtd-tickler__date">
            {t.scheduled
              ? t.scheduled.toLocaleDateString('es-ES', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                })
              : 'Sin fecha'}
          </span>
          <button
            type="button"
            className="gtd-tickler__title"
            onClick={() => setOpenKey(t.key)}
            title="Editar"
            data-testid="gtd-tickler-edit"
          >
            {t.title || '(sin título)'}
          </button>
          <button
            type="button"
            className={`gtd-tickler__btn gtd-tickler__editbtn${actsOpen ? ' is-on' : ''}`}
            onClick={() => setTkActsOpen((o) => ({ ...o, [t.key]: !o[t.key] }))}
            title={
              actsOpen ? 'Ocultar los botones' : 'Mostrar los botones (fecha, Inbox, Next, borrar)'
            }
            aria-label="Editar entrada"
            aria-pressed={actsOpen}
            data-testid="gtd-tickler-acts-toggle"
          >
            <i className="fas fa-pen" />
          </button>
        </div>
        {actsOpen && (
          <div className="gtd-tickler__acts" data-testid="gtd-tickler-acts">
            <input
              type="date"
              className="gtd-tickler__input"
              value={toDateInput(t.scheduled)}
              onChange={(e) => ticklerSetDate(t, fromDateInput(e.target.value))}
              aria-label="Fecha"
              data-testid="gtd-tickler-date"
            />
            {quick.map(([unit, label, hint]) => (
              <button
                key={unit}
                type="button"
                className="gtd-tickler__btn"
                onClick={() => ticklerSetDate(t, shiftTicklerDate(t.scheduled, unit, 1, today))}
                title={hint}
                data-testid={`gtd-tickler-plus-${unit}`}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              className="gtd-tickler__btn"
              onClick={() => dailyMove(t, 'inbox')}
              title="Liberarla ya: al Inbox"
              aria-label="Al Inbox"
              data-testid="gtd-tickler-inbox"
            >
              <i className="fas fa-inbox" />
            </button>
            <button
              type="button"
              className="gtd-tickler__btn"
              onClick={() => ticklerToNext(t)}
              title="Liberarla ya: a Next"
              aria-label="A Next"
              data-testid="gtd-tickler-next"
            >
              <i className="fas fa-play" />
            </button>
            <button
              type="button"
              className="gtd-tickler__btn is-danger"
              onClick={() => deleteTask(t)}
              title="Borrar"
              aria-label="Borrar"
              data-testid="gtd-tickler-delete"
            >
              <i className="fas fa-trash" />
            </button>
          </div>
        )}
      </div>
    );
  };
  const renderTicklerPage = () => {
    const groups = ticklerLoadedPath ? groupTickler(ticklerShown, today) : [];
    return (
      <div className="gtd-tickler" data-testid="gtd-tickler">
        <form
          className="gtd-tickler__add"
          onSubmit={(e) => {
            e.preventDefault();
            ticklerAdd();
          }}
        >
          <input
            type="text"
            className="gtd-tickler__input gtd-tickler__new"
            value={tkTitle}
            onChange={(e) => setTkTitle(e.target.value)}
            placeholder="Recordármelo…"
            data-testid="gtd-tickler-new-title"
          />
          <input
            type="date"
            className="gtd-tickler__input"
            value={tkDate || toDateInput(shiftTicklerDate(today, 'day', 1, today))}
            onChange={(e) => setTkDate(e.target.value)}
            aria-label="Fecha"
            data-testid="gtd-tickler-new-date"
          />
          <button
            type="submit"
            className="gtd-review__btn is-primary"
            disabled={!tkTitle.trim()}
            data-testid="gtd-tickler-add"
          >
            <i className="fas fa-plus" /> Añadir
          </button>
        </form>
        {!ticklerLoadedPath && (
          <div className="gtd-empty" data-testid="gtd-tickler-nofile">
            <p>No se encuentra tickler.org (al añadir la primera entrada se puede crear).</p>
          </div>
        )}
        {ticklerLoadedPath && !groups.length && (
          <div className="gtd-empty" data-testid="gtd-tickler-empty">
            {text || activeFilterCount > 0 || (area && area !== '*')
              ? 'Ninguna entrada del Tickler con ese filtro.'
              : 'El Tickler está vacío.'}
          </div>
        )}
        {groups.map((g) => (
          <section
            key={g.id}
            className="gtd-tickler__group"
            data-testid={`gtd-tickler-group-${g.id}`}
          >
            <div className="gtd-section gtd-section--group">
              {g.label} <span className="gtd-overview__n">{g.list.length}</span>
            </div>
            {g.list.map((t) =>
              openKey === t.key ? (
                <React.Fragment key={t.key}>{renderEditor(t)}</React.Fragment>
              ) : (
                renderTicklerRow(t)
              )
            )}
          </section>
        ))}
      </div>
    );
  };
  const renderHorizonsPage = () => {
    if (!horizonsFile || !horizonsFile.get('headers'))
      return (
        <div className="gtd-empty" data-testid="gtd-horizons-nofile">
          <p>No se encuentra {fileDisplayName(horizonsPath)}.</p>
          <button
            type="button"
            className="gtd-review__btn is-primary"
            onClick={() => ensureHorizons()}
            data-testid="gtd-horizons-create"
          >
            Cargar o crear el fichero
          </button>
        </div>
      );
    const v = hView || { objectives: [], areas: [], loose: [] };
    return (
      <div className="gtd-projects-overview gtd-horizons" data-testid="gtd-horizons">
        {renderHzReminders()}
        <div className="gtd-section gtd-section--group">
          <i className="fas fa-bullseye" /> Objetivos
        </div>
        {v.objectives.length ? (
          objectivesByTerm(v.objectives).map((g) => (
            <React.Fragment key={g.id}>
              <div className="gtd-horizons__term" data-testid="gtd-hz-term">
                <i className="far fa-clock" /> {g.label}
              </div>
              {g.items.map((o) =>
                renderHorizonGroup(
                  o,
                  'fas fa-bullseye',
                  o.title,
                  'goal',
                  <React.Fragment>
                    {o.area && <span className="gtd-meta gtd-meta--area">{o.area}</span>}
                    {renderTermButton(o)}
                  </React.Fragment>
                )
              )}
            </React.Fragment>
          ))
        ) : (
          <div className="gtd-empty">No hay objetivos (cabeceras «**» bajo «* Objetivos»).</div>
        )}
        <div className="gtd-section gtd-section--group">
          <i className="fas fa-map-signs" /> Áreas
        </div>
        {v.areas.length ? (
          v.areas.map((a) => renderHorizonGroup(a, 'fas fa-map-signs', a.name, 'area'))
        ) : (
          <div className="gtd-empty">No hay áreas (cabeceras «**» bajo «* Áreas»).</div>
        )}
        {v.loose.length > 0 && (
          <section className="gtd-horizons__group" data-testid="gtd-hz-loose">
            <div className="gtd-section gtd-section--group">
              <i className="fas fa-question" /> Sin objetivo ni área{' '}
              <span className="gtd-overview__n">{v.loose.length}</span>
            </div>
            {v.loose.map(renderHorizonProject)}
          </section>
        )}
      </div>
    );
  };

  const loading = pendingLoads;
  const isTrash = view.id === 'trash';
  // (3.0) «Nuevo elemento» y Entrada rápida: en las listas donde se crean cosas
  const canCreate = !['logbook', 'trash', 'projects', 'horizons', 'tickler'].includes(view.id);
  // 3.36: lupa de la cabecera (filtro de la sección); el Logbook tiene su propio buscador
  const canFilterSection = !['logbook', 'projects', 'horizons'].includes(view.id);
  // 3.36 (a): resultados del buscador del menú lateral, agrupados por sección (plegables)
  const openSearchResult = (group, task) => {
    setSearchText('');
    if (group.id === 'projects') selectView({ type: 'project', key: task.key });
    else {
      selectView({ id: group.id });
      setSelKey(task.key);
      setOpenKey(task.key);
    }
  };
  const renderSearchResults = () => {
    const total = searchGroups.reduce((n, g) => n + g.list.length, 0);
    return (
      <div className="gtd-search" data-testid="gtd-search-results">
        <header className="gtd-main__head">
          <button className="gtd-main__menu" onClick={() => setSideOpen(true)} aria-label="Menú">
            <i className="fas fa-bars" />
          </button>
          <h1 className="gtd-main__title" data-testid="gtd-search-title">
            <span className="gtd-main__title-text">«{searchText.trim()}»</span>
            <span className="gtd-main__count">{total}</span>
          </h1>
          <button
            className="gtd-main__sync"
            onClick={() => setSearchText('')}
            title="Cerrar la búsqueda"
            aria-label="Cerrar la búsqueda"
            data-testid="gtd-search-close"
          >
            <i className="fas fa-times" />
          </button>
        </header>
        {!searchGroups.length && <div className="gtd-empty">No se ha encontrado nada.</div>}
        {searchGroups.map((g) => {
          const folded = searchFolded.includes(g.id);
          return (
            <section
              key={g.id}
              className="gtd-search__group"
              data-testid={`gtd-search-group-${g.id}`}
            >
              <div className="gtd-section gtd-section--group">
                <button
                  type="button"
                  className="gtd-section__toggle"
                  onClick={() =>
                    setSearchFolded((f) =>
                      f.includes(g.id) ? f.filter((x) => x !== g.id) : [...f, g.id]
                    )
                  }
                  aria-expanded={!folded}
                  data-testid="gtd-search-group-toggle"
                >
                  <i className={folded ? 'fas fa-caret-right' : 'fas fa-caret-down'} />{' '}
                  <i className={g.icon} /> {g.label}
                </button>
                <span className="gtd-section__n">{g.list.length}</span>
              </div>
              {!folded &&
                g.list.map((t) => (
                  <button
                    type="button"
                    key={t.key}
                    className={'gtd-search__row' + (t.isDone ? ' is-done' : '')}
                    onClick={() => openSearchResult(g, t)}
                    data-testid="gtd-search-result"
                  >
                    <span className="gtd-search__title">
                      {t.keyword && !t.isProject && (
                        <span className="gtd-search__kw">{t.keyword}</span>
                      )}
                      {t.title || '(sin título)'}
                    </span>
                    {(t.project || t.area || (t.tags || []).length > 0) && (
                      <span className="gtd-search__meta">
                        {t.project && !t.isProject && (
                          <span className="gtd-meta">
                            <i className="fas fa-project-diagram" /> {t.project.title}
                          </span>
                        )}
                        {t.area && <span className="gtd-meta gtd-meta--area">{t.area}</span>}
                        {(t.tags || [])
                          .filter((x) => !hasTrashTag([x]))
                          .map((x) => (
                            <span key={x} className="gtd-meta gtd-meta--tag">
                              {x}
                            </span>
                          ))}
                      </span>
                    )}
                  </button>
                ))}
            </section>
          );
        })}
      </div>
    );
  };
  // Etiquetas del menú lateral (como Nirvana): las que llevan las tareas abiertas
  const sideTags = (() => {
    const n = {};
    tasks.forEach((t) => {
      if (t.isDone || t.isTrashed) return;
      (t.ownTags || []).forEach((x) => {
        if (['trash'].includes(x.toLowerCase())) return;
        n[x] = (n[x] || 0) + 1;
      });
    });
    return Object.keys(n)
      .sort((a, b) => {
        const ac = a.startsWith('@');
        const bc = b.startsWith('@');
        return ac !== bc ? (ac ? -1 : 1) : a.localeCompare(b);
      })
      .map((x) => ({ tag: x, n: n[x] }));
  })();
  // Filtros de la barra (como Nirvana): clic = solo ese; Ctrl/⌘+clic = añadir (todos a la vez: Y)
  // (3.01) Etiquetas: 1.er clic = solo las que la llevan, 2.º = tachada (fuera las que la llevan),
  // 3.º = quitar el filtro
  const filterChip = (kind, value, e) => {
    const add = e && (e.ctrlKey || e.metaKey);
    setFilters((f) => {
      const empty = { ...EMPTY_FILTERS };
      if (kind === 'tag') {
        if (f.notTags.includes(value))
          return { ...f, notTags: f.notTags.filter((x) => x !== value) };
        if (f.tags.includes(value)) {
          if (add) return { ...f, tags: f.tags.filter((x) => x !== value) };
          return { ...f, tags: f.tags.filter((x) => x !== value), notTags: [...f.notTags, value] };
        }
        return add ? { ...f, tags: [...f.tags, value] } : { ...empty, tags: [value] };
      }
      const isOn =
        kind === 'energy'
          ? f.energy === value
          : kind === 'time'
          ? f.time === value
          : kind === 'badProject'
          ? f.badProject
          : f.dated;
      const count =
        f.tags.length +
        f.notTags.length +
        (f.energy ? 1 : 0) +
        (f.time ? 1 : 0) +
        (f.dated ? 1 : 0) +
        (f.badProject ? 1 : 0);
      if (!add) {
        if (isOn && count === 1) return empty;
        const base = { ...empty };
        if (kind === 'energy') base.energy = value;
        if (kind === 'time') base.time = value;
        if (kind === 'dated') base.dated = true;
        if (kind === 'badProject') base.badProject = true;
        return base;
      }
      if (kind === 'energy') return { ...f, energy: isOn ? null : value };
      if (kind === 'time') return { ...f, time: isOn ? null : value };
      if (kind === 'badProject') return { ...f, badProject: !f.badProject };
      return { ...f, dated: !f.dated };
    });
  };
  // (4.21) lo que enseña el Tickler: sus entradas con Área, texto y filtros de la barra
  const ticklerShown = useMemo(
    () => (view.id === 'tickler' ? filterTickler(ticklerTasks, { area, text, ...filters }) : []),
    [view.id, ticklerTasks, area, text, filters]
  );
  const hasFacets =
    facets.tags.length > 0 ||
    facets.energy.length > 0 ||
    facets.hasEffort ||
    facets.hasDates ||
    facets.hasBadProject ||
    activeFilterCount > 0;

  // (4.25) funciones de cada fila: se guardan las de este pintado y la fila recibe proxies
  // estables que llaman a la última versión (MemoTaskRow no repinta filas sin cambios)
  const rowFns = (item) => ({
    onRowClick: rowClick(item),
    onTitleClick: titleClick(item),
    onRowDoubleClick: () => {
      if (clickSuppressed()) return;
      // (3.02) con el dedo ya lo hace el doble toque propio
      if (lastPointer.current !== 'mouse') return;
      rowOpen(item, null);
    },
    onPointerDown: (e) => {
      lastPointer.current = e.pointerType || 'mouse';
      onPointerDown(item.task)(e);
    },
    onContextMenu: (e) => openTaskMenu(item.task, e),
    onMenuButton: isTouchGtd() ? null : (e) => openTaskMenu(item.task, e),
    onDotsDown: item.isRef ? null : dotsDown(item.task),
    onToggleDone: (e) => toggleDone(item.task, e),
    onToggleStar: () => dispatch(gtdToggleStar(item.task)),
    onToggleCheck: (index) => {
      // (4.22) el contenido reunido de una referencia no es su texto real: sin casillas
      if (item.task.refAggregated) return;
      dispatch(gtdSaveTask(item.task, { notes: toggleCheckboxLine(item.task.description, index) }));
    },
    onToggleFold: () => toggleFold(item.task),
    onGoParent: () => goToTask(parentTaskOf(item.task)),
    onCycleNotes: () =>
      setNotesOverride((o) => {
        const cur = o[item.task.key] || notesMode;
        // (3.34) el icono alterna entre nada y todo (sin «parciales»)
        const next = cur === 'full' ? 'none' : 'full';
        return { ...o, [item.task.key]: next };
      }),
    onGoProject: item.task.project ? () => goToProject(item.task.project) : null,
    onOpenLink: (target) => openLinkAny(item.task, target),
  });
  const rowFnsRef = useRef(new Map());
  const rowProxyRef = useRef(new Map());
  const rowProxies = (key, fns) => {
    let px = rowProxyRef.current.get(key);
    if (!px) {
      px = {};
      ROW_FN_PROPS.forEach((n) => {
        px[n] = (...args) => {
          const f = (rowFnsRef.current.get(key) || {})[n];
          return f ? f(...args) : undefined;
        };
      });
      rowProxyRef.current.set(key, px);
    }
    const out = {};
    ROW_FN_PROPS.forEach((n) => {
      out[n] = fns[n] ? px[n] : null;
    });
    return out;
  };
  const renderRow = (item) => {
    const fns = rowFns(item);
    rowFnsRef.current.set(item.task.key, fns);
    return (
      <MemoTaskRow
        key={item.task.key}
        {...rowProxies(item.task.key, fns)}
        task={item.task}
        seqMark={seqMarkOf(item.task, today)}
        clockMs={clockTotals.get(item.task.key) || 0}
        isDragging={!!dragging && dragging.includes(item.task.key)}
        today={today}
        showProject={!isProjectView && !(grouped && item.task.project)}
        hideActions={isLogbook || isTrash || !!item.isRef}
        reorderSection={item.section}
        isSelected={sel.includes(item.task.key)}
        depth={item.depth || 0}
        hasKids={!!item.hasKids}
        folded={!!item.folded}
        parentTitle={parentTitleOf(item.task)}
        noSubtasks={!subtasksOn}
        notesMode={notesOverride[item.task.key] || notesMode}
        badProject={!!item.task.badProject}
        showTags={details.tags}
        showEffort={details.effort}
        showArea={details.area}
        wrapTitle={details.wrap}
      />
    );
  };

  return (
    <div
      className={'gtd' + (sideOpen ? ' is-side-open' : '') + (dragging ? ' is-dragging' : '')}
      data-testid="gtd"
    >
      <aside className="gtd-side" onKeyDown={onSideKeyDown}>
        <div className="gtd-side__top">
          <select
            className="gtd-side__area"
            value={area}
            onChange={(e) => selectArea(e.target.value)}
            title="Área (Mayús+número para cambiar)"
            data-testid="gtd-area"
          >
            <option value="*">Todas las áreas</option>
            {areas.map((a, i) => (
              <option key={a} value={a}>
                {i < 9 ? `${a}   ⇧${i + 1}` : a}
              </option>
            ))}
            <option value="-">Sin área</option>
          </select>
        </div>
        <div className="gtd-side__search">
          <i className="fas fa-search" />
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                if (searchText) {
                  setSearchText('');
                } else {
                  e.currentTarget.blur();
                  setSideOpen(false);
                }
              }
              // 3.36: Intro (o «Buscar» del teclado del móvil) = ver los resultados
              if (e.key === 'Enter' && searchText.trim()) {
                e.preventDefault();
                e.currentTarget.blur();
                setSideOpen(false);
              }
              if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
                // 3.36: Tab = al primer resultado (Intro lo abre)
                const first = document.querySelector('[data-testid="gtd-search-result"]');
                if (first) {
                  e.preventDefault();
                  setSideOpen(false);
                  first.focus();
                }
              }
            }}
            placeholder="Buscar en todo"
            data-testid="gtd-search"
          />
          {/* (3.09) ✕ para borrar la búsqueda */}
          {searchText && (
            <button
              type="button"
              className="gtd-side__search-clear"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setSearchText('');
                const el = document.querySelector('[data-testid="gtd-search"]');
                if (el) el.focus();
              }}
              title="Borrar la búsqueda"
              aria-label="Borrar la búsqueda"
              data-testid="gtd-search-clear"
            >
              <i className="fas fa-times-circle" />
            </button>
          )}
        </div>
        {sidebarBlocks()}
        {sideTags.length > 0 && (
          <div className="gtd-side__tags" data-testid="gtd-side-tags">
            <button
              type="button"
              className="gtd-side__section gtd-side__section--toggle"
              onClick={() => {
                const v = !tagsOpen;
                setTagsOpen(v);
                writeLS('eliGtdTagsOpen', v);
              }}
              aria-expanded={tagsOpen}
            >
              <span>
                <i className={tagsOpen ? 'fas fa-caret-down' : 'fas fa-caret-right'} /> Etiquetas
              </span>
              <span
                className="gtd-side__add"
                title="Gestionar etiquetas (g)"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowTagManager(true);
                }}
              >
                <i className="fas fa-cog" />
              </span>
            </button>
            {tagsOpen &&
              sideTags.map(({ tag, n }) => (
                <button
                  key={tag}
                  className={
                    'gtd-side__item gtd-side__item--tag' +
                    (view.id === 'tag' && view.tag === tag ? ' is-on' : '')
                  }
                  onClick={(e) => {
                    selectView({ id: 'tag', tag });
                    afterSideClick(e);
                  }}
                  data-testid="gtd-side-tag"
                >
                  <i className="fas fa-tag gtd-side__icon" />
                  <span className="gtd-side__label">{tag}</span>
                  <span className="gtd-side__count">{n}</span>
                </button>
              ))}
          </div>
        )}
      </aside>

      <div className="gtd-scrim" onClick={() => setSideOpen(false)} />

      <main
        className={
          'gtd-main' +
          (projectTask ? ' is-project-view' : '') +
          (pullMoving ? ' is-pulling' : '') +
          (pullDragging ? ' is-pull-drag' : '') +
          (searchGroups ? ' is-searching' : '')
        }
        style={pullMoving ? { '--gtd-pull': `${pullOffset}px` } : undefined}
        ref={gtdMainRef}
      >
        {(pullDist > 0 || pullRefreshing) && (
          <div
            className={'gtd-pull' + (pullReady(pullDist) || pullRefreshing ? ' is-ready' : '')}
            data-testid="gtd-pull"
          >
            <i
              className={
                'fas ' + (pullRefreshing ? 'fa-sync-alt fa-spin' : 'fa-arrow-down gtd-pull__arrow')
              }
            />
            <span>
              {pullRefreshing
                ? 'Sincronizando…'
                : pullReady(pullDist)
                ? 'Suelta para sincronizar'
                : 'Tira para sincronizar'}
            </span>
          </div>
        )}
        {searchGroups && renderSearchResults()}
        <header className="gtd-main__head">
          <button className="gtd-main__menu" onClick={() => setSideOpen(true)} aria-label="Menú">
            <i className="fas fa-bars" />
          </button>
          <h1 className="gtd-main__title" data-testid="gtd-title">
            {projectTask ? (
              <span
                className="gtd-main__title-text is-link"
                onClick={() => setOpenKey(openKey === projectTask.key ? null : projectTask.key)}
                title="Editar el proyecto"
                data-testid="gtd-edit-project"
              >
                {title}
              </span>
            ) : (
              title
            )}
            {/* (4.13) icono de notas del proyecto al final del nombre, como en las tareas */}
            {projectTask && projectTask.description.trim() && openKey !== projectTask.key && (
              <button
                type="button"
                className={'gtd-meta gtd-notes-btn' + (projNotesOpen ? ' is-on' : '')}
                aria-expanded={projNotesOpen}
                onClick={() => {
                  const v = !projNotesOpen;
                  setProjNotesOpen(v);
                  writeLS('eliGtdProjNotes', v);
                }}
                title={
                  projNotesOpen ? 'Notas visibles (clic: ocultarlas)' : 'Tiene notas (clic: verlas)'
                }
                data-testid="gtd-project-notes-toggle"
              >
                <i className={projNotesOpen ? 'fas fa-sticky-note' : 'far fa-sticky-note'} />
              </button>
            )}
            {projectTask && clockTotalLabel(clockTotals.get(projectTask.key)) && (
              <span
                className="gtd-main__clock"
                title="Tiempo registrado en el proyecto"
                data-testid="gtd-project-clock"
              >
                {clockTotalLabel(clockTotals.get(projectTask.key))}
              </span>
            )}
            <span className="gtd-main__count">
              {view.id === 'projects'
                ? overview.active.length + overview.scheduled.length + overview.sleep.length
                : view.id === 'horizons'
                ? hView
                  ? hView.objectives.length + hView.areas.length
                  : 0
                : view.id === 'tickler'
                ? ticklerShown.length
                : visible.length}
            </span>
          </h1>
          {/* 3.36 (a): filtrar la sección por texto (título y notas) */}
          {canFilterSection && (
            <button
              className={'gtd-main__sync gtd-main__filter' + (text ? ' is-on' : '')}
              onClick={() => {
                if (secFilterOpen && !text) {
                  setSecFilterOpen(false);
                  return;
                }
                // 3.39: si el campo ya está, se enfoca en el mismo toque; si no, el puente de
                // teclado (iOS solo saca el teclado si el foco se pone dentro del toque)
                const now = document.querySelector('[data-testid="gtd-sec-filter"]');
                if (now) {
                  focusField(now);
                  return;
                }
                primeKeyboard();
                setSecFilterOpen(true);
                setTimeout(() => {
                  focusField(document.querySelector('[data-testid="gtd-sec-filter"]'));
                }, 30);
              }}
              title="Filtrar esta sección"
              aria-label="Filtrar esta sección"
              data-testid="gtd-sec-filter-btn"
            >
              <i className="fas fa-search" />
            </button>
          )}
          {canCreate && (
            <button
              className="gtd-main__new"
              onClick={() => newBelowCursor()}
              title="Elemento nuevo (n: debajo de la seleccionada; Mayús+n arriba)"
              data-testid="gtd-new"
            >
              <i className="fas fa-plus" /> <span>Nuevo elemento</span>
            </button>
          )}
          {view.id === 'horizons' && (
            <button
              className="gtd-main__new"
              onClick={() => startDaily('horizons')}
              title="Revisión de horizontes"
              data-testid="gtd-horizons-review"
            >
              <i className="fas fa-binoculars" /> <span>Revisión</span>
            </button>
          )}
          {view.id === 'projects' && (
            <button
              className="gtd-main__new"
              onClick={addProject}
              title="Proyecto nuevo (p)"
              data-testid="gtd-new-project"
            >
              <i className="fas fa-plus" /> <span>Nuevo proyecto</span>
            </button>
          )}
          {/* (3.04) arriba, solo en el Logbook; en las demás listas, al final (grupo «Hecho») */}
          {cleanupCount > 0 && view.id === 'logbook' && (
            <button
              className="gtd-main__cleanup"
              onClick={cleanupNow}
              title="Limpieza (c): lo hecho pasa al Logbook"
              data-testid="gtd-cleanup"
            >
              <i className="fas fa-broom" /> <span>Limpieza</span>{' '}
              <span className="gtd-main__badge">{cleanupCount}</span>
            </button>
          )}
          {isTrash && visible.length > 0 && (
            <button
              className="gtd-main__cleanup is-danger"
              onClick={emptyTrash}
              data-testid="gtd-empty-trash"
            >
              <i className="fas fa-trash" /> <span>Vaciar papelera</span>
            </button>
          )}
          {view.id === 'inbox' && pendingRefile.length > 0 && (
            <button
              className="gtd-main__sync gtd-main__refile"
              onClick={doRefile}
              title={`Pasar ${pendingRefile.length} tarea${
                pendingRefile.length === 1 ? '' : 's'
              } con estado del fichero de entrada al de tareas`}
              data-testid="gtd-refile"
            >
              <i className="fas fa-share" /> <span>{pendingRefile.length}</span>
            </button>
          )}
          <button
            className="gtd-main__sync"
            onClick={() => dispatch(gtdUndo())}
            disabled={!canUndo}
            title="Deshacer"
            data-testid="gtd-undo"
          >
            <i className="fas fa-undo" />
          </button>
          <button
            className="gtd-main__sync"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setMenu({
                x: r.right - 260,
                y: r.bottom + 4,
                items: viewMenuItems(),
                testId: 'gtd-view-menu',
              });
            }}
            title="Opciones de la vista"
            aria-label="Opciones de la vista"
            data-testid="gtd-view-menu-button"
          >
            <i className="fas fa-ellipsis-h" />
          </button>
        </header>
        {canFilterSection && (secFilterOpen || text) && (
          <div className="gtd-secfilter" data-testid="gtd-sec-filter-row">
            <i className="fas fa-filter" />
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  if (text) setText('');
                  else {
                    setSecFilterOpen(false);
                    e.currentTarget.blur();
                  }
                }
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
              }}
              placeholder="Filtrar…"
              enterKeyHint="done"
              data-testid="gtd-sec-filter"
            />
            <button
              type="button"
              className="gtd-secfilter__clear"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setText('');
                setSecFilterOpen(false);
              }}
              title="Quitar el filtro"
              aria-label="Quitar el filtro"
              data-testid="gtd-sec-filter-clear"
            >
              ×
            </button>
          </div>
        )}

        {reviewStep !== null && (
          <GtdWeeklyReview
            steps={REVIEW_STEPS}
            strict={strictOn()}
            horizonsOn={horizonsOn}
            review={reviewData}
            step={reviewStep}
            lastReview={lastReview}
            today={today}
            onStep={(i) => {
              setReview(i);
              const st = REVIEW_STEPS[i];
              if (st && st.view) goList(st.view);
            }}
            onClose={() => setReview(null)}
            onFinish={finishReview}
            onOpenView={goList}
            onOpenTask={reviewOpenTask}
            onMove={reviewMove}
            onProcess={startProcess}
            onCapture={() => openDraft('inbox')}
            onAgenda={() => setShowAgenda(true)}
            onCaptureText={guidedCapture}
            onSweep={() => startDaily('sweep')}
            onProjectAction={guidedProjectAction}
            onReplan={(p) => startDaily('project', { existing: p.key })}
            onHorizons={() => startDaily('horizons')}
          />
        )}
        {daily && daily.kind === 'horizons' && (
          <GtdHorizonsReview
            key={daily.kind + daily.rev}
            horizons={horizons}
            data={hView}
            missing={missingAreas(horizons, tasks)}
            startStep={daily.step || 0}
            fileName={fileDisplayName(horizonsPath)}
            today={today}
            onClose={() => setDaily(null)}
            onOpenTask={reviewOpenTask}
            onAddArea={horizonsAddArea}
            onAddObjective={horizonsAddObjective}
            onSaveText={horizonsSaveText}
            onPlan={horizonsPlan}
            onPickTerm={pickTerm}
            reminders={hzReminders}
            onReviewed={horizonsReviewed}
          />
        )}
        {daily && GUIDED_PROCESSES[daily.kind] && daily.kind !== 'horizons' && (
          <GtdGuidedProcess
            key={daily.kind + daily.rev}
            kind={daily.kind}
            tasks={tasks}
            today={today}
            skipTags={[inboxTag()]}
            preset={daily.preset || null}
            existing={
              (daily.existing && tasks.find((t) => t.key === daily.existing && t.isProject)) || null
            }
            onUpdateProject={guidedUpdateProject}
            onClose={closeGuided}
            onOpenTask={reviewOpenTask}
            onCapture={guidedCapture}
            onCreateProject={guidedCreateProject}
            onProjectAction={guidedProjectAction}
            onMove={guidedMove}
            onCopy={guidedCopy}
          />
        )}
        {daily && DAILY_PROCESSES[daily.kind] && (
          <GtdDailyProcess
            key={daily.kind}
            kind={daily.kind}
            data={dailyData}
            tasks={tasks}
            step={daily.step}
            today={today}
            skipTags={[inboxTag()]}
            onStep={(i) => setDaily((d) => (d ? { ...d, step: i } : d))}
            onClose={() => setDaily(null)}
            onOpenTask={reviewOpenTask}
            onMove={dailyMove}
            onCapture={() => openDraft('inbox')}
            onProcess={startProcess}
            onNow={() => startDaily('now')}
            notAllen={!!NOT_ALLEN_DAILY[daily.kind] && strictOn()}
          />
        )}
        {proc && (
          <GtdProcessInbox
            key={proc.i}
            task={procTask}
            gone={proc.gone[proc.i]}
            index={proc.i}
            total={proc.queue.length}
            mode={getProcessMode()}
            areas={areas}
            today={today}
            paused={!!(openKey || draft || newProject || menu || showAgenda)}
            strict={strictOn()}
            projects={allProjects
              .filter((p) => !p.isTrashed)
              .sort((a, b) => (a.title || '').localeCompare(b.title || ''))}
            onDecide={processDecide}
            onSkip={() => procMove(1)}
            onBack={() => procMove(-1)}
            onFinish={() => setProc(null)}
            onOpenTask={(t) => {
              setSelKey(t.key);
              setOpenKey(t.key);
            }}
          />
        )}
        {newProject && renderNewProjectEditor()}
        {draft && renderDraftEditor()}

        {/* (3.05) sin «Editar el proyecto» ni «Abrir en su fichero»: se edita con clic en el título
            y desde su editor se abre en su fichero (4.0: ya no están en ⋯) */}
        {projectTask &&
          (projectTask.area ||
            projectTask.deadline ||
            projectState(projectTask, today) !== 'active') && (
            <div className="gtd-project-info">
              {projectTask.area && (
                <span className="gtd-meta gtd-meta--area">{projectTask.area}</span>
              )}
              {projectTask.deadline && (
                <span className="gtd-date gtd-date--due">
                  <i className="fas fa-flag" /> {fmtDate(projectTask.deadline)}
                </span>
              )}
              {projectState(projectTask, today) === 'sleep' && (
                <span className="gtd-badge gtd-badge--sleep" data-testid="gtd-project-sleeping">
                  <i className="fas fa-bed" /> Dormido
                </span>
              )}
              {projectState(projectTask, today) === 'scheduled' && (
                <span className="gtd-badge" data-testid="gtd-project-scheduled">
                  <i className="far fa-calendar-alt" /> Empieza el{' '}
                  {fmtDate(projectTask.scheduled || projectTask.projectStart)}
                </span>
              )}
            </div>
          )}
        {projectTask &&
          projectTask.description.trim() &&
          openKey !== projectTask.key &&
          projNotesOpen && (
            <div className="gtd-project-notes" data-testid="gtd-project-notes">
              {
                // (3.09) como en las tareas: enlaces clicables, imágenes y adjuntos a la vista
                <NotesLines
                  task={projectTask}
                  lines={notesLinesOf(projectTask.description, (uri) =>
                    linkTargetFor(uri, projectTask.header)
                  )}
                  notesMode="full"
                  onToggleCheck={(index) =>
                    dispatch(
                      gtdSaveTask(projectTask, {
                        notes: toggleCheckboxLine(projectTask.description, index),
                      })
                    )
                  }
                  onOpenLink={(target) => openLinkAny(projectTask, target)}
                  className="gtd-project-notes__body"
                />
              }
            </div>
          )}
        {projectTask && openKey === projectTask.key && renderEditor(projectTask)}

        {view.id === 'projects' && (
          <div className="gtd-projects-overview" data-testid="gtd-projects-overview">
            {[
              ['active', 'Activos'],
              ['scheduled', 'Programados'],
              ['sleep', 'Dormidos'],
            ].map(([id, label]) =>
              overview[id].length ? (
                <section key={id}>
                  <div className="gtd-section" data-testid={`gtd-overview-${id}`}>
                    {label} <span className="gtd-overview__n">{overview[id].length}</span>
                  </div>
                  {overview[id].map((r) => (
                    <React.Fragment key={r.project.key}>
                      <button
                        className="gtd-overview__row"
                        onClick={() => selectView({ type: 'project', key: r.project.key })}
                        onContextMenu={(e) => openTaskMenu(r.project, e)}
                        data-testid="gtd-overview-row"
                      >
                        <span className="gtd-overview__title">
                          <i className="fas fa-project-diagram" /> {r.project.title}
                          {/* (3.43) icono de notas, como en las filas de tareas */}
                          {r.project.description.trim() &&
                            notesLinesOf(r.project.description).length > 0 && (
                              <span
                                role="button"
                                tabIndex={0}
                                className={
                                  'gtd-meta gtd-notes-btn' +
                                  (overviewNotes.has(r.project.key) ? ' is-on' : '')
                                }
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleOverviewNotes(r.project.key);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key !== 'Enter' && e.key !== ' ') return;
                                  e.preventDefault();
                                  e.stopPropagation();
                                  toggleOverviewNotes(r.project.key);
                                }}
                                title={
                                  overviewNotes.has(r.project.key)
                                    ? 'Notas visibles (clic: ocultarlas)'
                                    : 'Tiene notas (clic: verlas)'
                                }
                                data-testid="gtd-notes-toggle"
                              >
                                <i
                                  className={
                                    overviewNotes.has(r.project.key)
                                      ? 'fas fa-sticky-note'
                                      : 'far fa-sticky-note'
                                  }
                                />
                              </span>
                            )}
                        </span>
                        <span className="gtd-overview__meta">
                          {clockTotalLabel(clockTotals.get(r.project.key)) && (
                            <span
                              className="gtd-meta gtd-meta--clock"
                              title="Tiempo registrado en el proyecto"
                              data-testid="gtd-overview-clock"
                            >
                              {clockTotalLabel(clockTotals.get(r.project.key))}
                            </span>
                          )}
                          {r.project.area && (
                            <span className="gtd-meta gtd-meta--area">{r.project.area}</span>
                          )}
                          {r.start && (
                            <span className="gtd-date" title="Empieza (SCHEDULED)">
                              <i className="far fa-calendar-alt" /> {fmtDate(r.start)}
                            </span>
                          )}
                          {r.deadline && (
                            <span
                              className={'gtd-date' + (r.deadline < today ? ' gtd-date--due' : '')}
                              title="Vence (DEADLINE)"
                            >
                              <i className="fas fa-flag" /> {fmtDate(r.deadline)}
                            </span>
                          )}
                          <span className="gtd-meta" title="Acciones pendientes">
                            <i className="fas fa-tasks" /> {r.pending}
                          </span>
                        </span>
                        {r.next && (
                          <span className="gtd-overview__next" title="Siguiente acción">
                            <i className="fas fa-play" /> {r.next.title}
                          </span>
                        )}
                      </button>
                      {overviewNotes.has(r.project.key) && (
                        <div className="gtd-overview__notes" data-testid="gtd-overview-notes">
                          <NotesLines
                            task={r.project}
                            lines={notesLinesOf(r.project.description, (uri) =>
                              linkTargetFor(uri, r.project.header)
                            )}
                            notesMode="full"
                            onToggleCheck={(index) =>
                              dispatch(
                                gtdSaveTask(r.project, {
                                  notes: toggleCheckboxLine(r.project.description, index),
                                })
                              )
                            }
                            onOpenLink={(target) => openLinkAny(r.project, target)}
                          />
                        </div>
                      )}
                    </React.Fragment>
                  ))}
                </section>
              ) : null
            )}
            {!overview.active.length && !overview.scheduled.length && !overview.sleep.length && (
              <div className="gtd-empty">No hay proyectos (encabezados con estado PROJECT).</div>
            )}
          </div>
        )}

        {view.id === 'horizons' && renderHorizonsPage()}

        {/* (3.0) Barra de filtros, como Nirvana: etiquetas y atributos a la vista */}
        {hasFacets && view.id !== 'projects' && view.id !== 'horizons' && (
          <div className="gtd-filterbar" data-testid="gtd-filters">
            {Array.from(new Set([...facets.tags, ...filters.tags, ...filters.notTags]))
              .filter((t) => t !== NO_TAGS)
              .map((t) => (
                <button
                  key={t}
                  className={
                    'gtd-chip' +
                    (filters.tags.includes(t) ? ' is-on' : '') +
                    (filters.notTags.includes(t) ? ' is-not' : '')
                  }
                  onClick={(e) => filterChip('tag', t, e)}
                  title={
                    filters.notTags.includes(t)
                      ? 'Tachada: fuera las que la llevan (clic: quitar el filtro)'
                      : filters.tags.includes(t)
                      ? 'Solo las que la llevan (clic: tacharla)'
                      : 'Clic: solo esta · otro clic: tachada · Ctrl/⌘+clic: añadir'
                  }
                  data-testid="gtd-chip-tag"
                >
                  {t}
                </button>
              ))}
            {/* (3.05) «Sin etiquetas»: igual que las demás (solo esas, o tachada: fuera) */}
            {((facets.hasUntagged && facets.tags.length > 0) ||
              filters.tags.includes(NO_TAGS) ||
              filters.notTags.includes(NO_TAGS)) && (
              <button
                className={
                  'gtd-chip gtd-chip--untagged' +
                  (filters.tags.includes(NO_TAGS) ? ' is-on' : '') +
                  (filters.notTags.includes(NO_TAGS) ? ' is-not' : '')
                }
                onClick={(e) => filterChip('tag', NO_TAGS, e)}
                title={
                  filters.notTags.includes(NO_TAGS)
                    ? 'Tachada: fuera las que no tienen etiquetas (clic: quitar el filtro)'
                    : filters.tags.includes(NO_TAGS)
                    ? 'Solo las que no tienen etiquetas (clic: tacharla)'
                    : 'Clic: solo las que no tienen etiquetas · otro clic: tachada · Ctrl/⌘+clic: añadir'
                }
                data-testid="gtd-chip-untagged"
              >
                Sin etiquetas
              </button>
            )}
            {/* 3.36 (b): contar o no las etiquetas heredadas (del proyecto o de la madre) */}
            {facets.tags.length > 0 && facets.hasInherited && (
              <button
                className={
                  'gtd-chip gtd-chip--inherit' +
                  (tagInherit === 'all' ? ' is-on' : tagInherit === 'exclude' ? ' is-not' : '')
                }
                onClick={() => {
                  const v = tagInherit === 'all' ? 'own' : tagInherit === 'own' ? 'exclude' : 'all';
                  setTagInherit(v);
                  writeLS(LS_TAG_INHERIT, v);
                }}
                aria-pressed={tagInherit === 'all'}
                title={
                  tagInherit === 'all'
                    ? 'Las etiquetas heredadas (del proyecto o de la tarea madre) cuentan · clic: solo las asignadas directamente'
                    : tagInherit === 'own'
                    ? 'Solo cuentan las etiquetas asignadas directamente · clic: ocultar las tareas con etiquetas heredadas'
                    : 'Ocultas las tareas con alguna etiqueta heredada · clic: volver a contarlas'
                }
                data-state={tagInherit}
                data-testid="gtd-chip-inherit"
              >
                <i className="fas fa-level-down-alt" />{' '}
                {tagInherit === 'all'
                  ? 'Heredadas'
                  : tagInherit === 'own'
                  ? 'Solo propias'
                  : 'Sin heredadas'}
              </button>
            )}
            {facets.energy.map((en) => (
              <button
                key={'e' + en}
                className={'gtd-chip gtd-chip--energy' + (filters.energy === en ? ' is-on' : '')}
                onClick={(e) => filterChip('energy', en, e)}
              >
                <i className="fas fa-bolt" /> {en}
              </button>
            ))}
            {facets.hasEffort &&
              TIME_BUCKETS.map((tb) => (
                <button
                  key={tb.id}
                  className={'gtd-chip gtd-chip--time' + (filters.time === tb.id ? ' is-on' : '')}
                  onClick={(e) => filterChip('time', tb.id, e)}
                >
                  <i className="far fa-clock" /> {tb.label}
                </button>
              ))}
            {facets.hasDates && (
              <button
                className={'gtd-chip' + (filters.dated ? ' is-on' : '')}
                onClick={(e) => filterChip('dated', true, e)}
              >
                <i className="fas fa-flag" /> Con fecha
              </button>
            )}
            {(facets.hasBadProject || filters.badProject) && (
              <button
                className={'gtd-chip gtd-chip--bad' + (filters.badProject ? ' is-on' : '')}
                onClick={(e) => filterChip('badProject', true, e)}
                title="Tareas con un proyecto asignado que no se encuentra"
                data-testid="gtd-chip-bad-project"
              >
                <i className="fas fa-unlink" /> Proyecto no encontrado
              </button>
            )}
            {activeFilterCount > 0 && (
              <button
                className="gtd-chip gtd-chip--clear"
                onClick={() => setFilters({ ...EMPTY_FILTERS })}
              >
                × Quitar
              </button>
            )}
          </div>
        )}

        {/* (4.21) el Tickler, bajo la barra de filtros como el resto de secciones */}
        {view.id === 'tickler' && renderTicklerPage()}

        {/* (3.0) Entrada rápida — (3.05) después de los filtros (Mayús+E la muestra u oculta; e pone el cursor en ella) */}
        {canCreate && rapidOn && (
          <div className="gtd-rapid">
            <i className="fas fa-plus" />
            <input
              value={rapidText}
              onChange={(e) => {
                setRapidText(e.target.value);
                setRapidCaret(e.target.selectionStart || 0);
                setAcClosed(false);
                setAcIndex(0);
              }}
              onSelect={(e) => setRapidCaret(e.currentTarget.selectionStart || 0)}
              onBlur={() => setTimeout(() => setAcClosed(true), 150)}
              onFocus={() => setAcClosed(false)}
              onKeyDown={(e) => {
                const open = acList.length > 0;
                if (open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                  e.preventDefault();
                  setAcIndex(
                    (i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + acList.length) % acList.length
                  );
                  return;
                }
                if (open && (e.key === 'Tab' || e.key === 'Enter') && !e.shiftKey) {
                  if (e.nativeEvent && e.nativeEvent.isComposing) return;
                  e.preventDefault();
                  acceptSuggestion(acList[Math.min(acIndex, acList.length - 1)], e.currentTarget);
                  return;
                }
                if (e.key === 'Enter') {
                  if (e.nativeEvent && e.nativeEvent.isComposing) return;
                  e.preventDefault();
                  addRapid(e.shiftKey);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  if (open) setAcClosed(true);
                  else e.currentTarget.blur();
                }
              }}
              placeholder="Entrada rápida: título #etiqueta #due mañana #star >proyecto"
              data-testid="gtd-rapid"
            />
            {acList.length > 0 && (
              <div className="gtd-menu gtd-rapid__ac" role="listbox" data-testid="gtd-rapid-ac">
                <div className="gtd-menu__items">
                  {acList.map((sug, i) => (
                    <button
                      key={(sug.key || sug.value) + i}
                      type="button"
                      role="option"
                      aria-selected={i === acIndex}
                      className={'gtd-menu__item' + (i === acIndex ? ' is-active' : '')}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() =>
                        acceptSuggestion(sug, document.querySelector('[data-testid="gtd-rapid"]'))
                      }
                      data-testid="gtd-rapid-ac-item"
                    >
                      <span className="gtd-menu__icon">
                        <i className={sug.icon} />
                      </span>
                      <span className="gtd-menu__label">{sug.label}</span>
                      {sug.hint && <span className="gtd-menu__hint">{sug.hint}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {isLogbook && (
          <div className="gtd-log-search">
            <i className="fas fa-search" />
            <input
              value={logText}
              onChange={(e) => setLogText(e.target.value)}
              placeholder="Buscar en el Logbook…"
              data-testid="gtd-log-search"
            />
            {logText && (
              <button
                type="button"
                onClick={() => setLogText('')}
                aria-label="Borrar la búsqueda"
                title="Borrar la búsqueda"
              >
                ×
              </button>
            )}
            <button
              type="button"
              className={
                'agenda__log-toggle gtd-archived-toggle' + (showArchived ? ' is-active' : '')
              }
              onClick={() => setShowArchived(!showArchived)}
              aria-pressed={showArchived}
              title="Mostrar también las tareas archivadas (ficheros _archive)"
              data-testid="gtd-archived-toggle"
            >
              <i className={loadingArchived ? 'fas fa-spinner fa-spin' : 'fas fa-archive'} />{' '}
              Archivadas
            </button>
          </div>
        )}

        <div
          className={'gtd-list' + (reorderingKey ? ' is-reordering' : '')}
          style={
            view.id === 'projects' || view.id === 'horizons' || view.id === 'tickler'
              ? { display: 'none' }
              : undefined
          }
          data-reorder-container=""
          onClick={(e) => {
            // clic en el hueco de la lista: quita la selección
            if (e.target === e.currentTarget && Date.now() - lassoAt.current > 400) setSelKey(null);
          }}
        >
          {loading && items.length === 0 && <div className="gtd-empty">Cargando ficheros…</div>}
          {!loading &&
            items.length === 0 &&
            !(isLogbook && showArchived && archivedTasks.length) && (
              <div className="gtd-empty">
                {view.id === 'inbox'
                  ? 'Inbox vacío. ¡Bien hecho!'
                  : isTrash
                  ? 'La papelera está vacía.'
                  : 'No hay nada aquí.'}
              </div>
            )}
          {items.map((item) =>
            item.kind === 'header' ? (
              item.info ? (
                <div
                  key={item.id}
                  className="gtd-section"
                  data-testid={`gtd-section-${item.info.id}`}
                >
                  <i className={item.info.icon} /> {item.info.label}
                  {isLogbook && (archivableBySection[item.info.id] || []).length > 0 && (
                    <button
                      type="button"
                      className="gtd-section__action"
                      onClick={() =>
                        archiveTasks(archivableBySection[item.info.id], item.info.label)
                      }
                      title="Archivar las terminadas de esta sección"
                      data-testid={`gtd-archive-section-${item.info.id}`}
                    >
                      <i className="fas fa-archive" /> Archivar (
                      {archivableBySection[item.info.id].length})
                    </button>
                  )}
                </div>
              ) : (
                <div
                  key={item.id}
                  className={
                    'gtd-section gtd-section--group' +
                    (item.projectKey ? ' is-project' : '') +
                    (item.psec ? ' is-psec' : '') +
                    (item.section === 'done-group' ? ' is-done-group' : '') +
                    (reorderingKey && dropSection === item.section ? ' is-drop' : '')
                  }
                  data-reorder-slot=""
                  data-reorder-header=""
                  data-reorder-section={item.section}
                  data-testid={item.testId}
                >
                  {item.collapsible ? (
                    <button
                      type="button"
                      className="gtd-section__toggle"
                      onClick={() => {
                        if (item.toggle === 'tagHeadings') {
                          setHeadingsOpen((o) => !o);
                        } else if (item.toggle === 'doneGroup') {
                          const v = !doneGroupOpen;
                          setDoneGroupOpen(v);
                          writeLS('eliGtdDoneOpen', v);
                        } else (item.toggle === 'refs' ? setRefsOpen : setDoneOpen)((o) => !o);
                      }}
                      aria-expanded={!item.collapsed}
                      data-testid={`${item.testId}-toggle`}
                    >
                      <i className={item.collapsed ? 'fas fa-caret-right' : 'fas fa-caret-down'} />{' '}
                      <i className={item.icon} /> {item.label}
                    </button>
                  ) : item.projectKey ? (
                    <button
                      type="button"
                      className="gtd-section__toggle"
                      onClick={() => selectView({ type: 'project', key: item.projectKey })}
                      title="Abrir el proyecto"
                    >
                      <i className={item.icon} /> {item.label}
                    </button>
                  ) : (
                    <span>
                      <i className={item.icon} /> {item.label}
                    </span>
                  )}
                  <span className="gtd-section__n">{item.count}</span>
                  {item.section === 'done-group' && (
                    <button
                      type="button"
                      className="gtd-section__action"
                      onClick={cleanupNow}
                      title="Limpieza (c): pasar lo hecho al Logbook"
                      data-testid="gtd-done-cleanup"
                    >
                      <i className="fas fa-broom" /> Limpieza
                    </button>
                  )}
                </div>
              )
            ) : openKey === item.task.key ? (
              <React.Fragment key={item.task.key}>{renderEditor(item.task)}</React.Fragment>
            ) : (
              renderRow(item)
            )
          )}
          {isLogbook && showArchived && (
            <>
              <div className="gtd-section" data-testid="gtd-section-archived">
                <i className="fas fa-archive" /> Archivadas
                <span className="gtd-section__n">
                  {loadingArchived && !archivedTasks.length ? '…' : archivedTasks.length}
                </span>
              </div>
              {archivedTasks.map((t) => (
                <TaskRow
                  key={t.key}
                  task={t}
                  onRowClick={() => setSelKey(t.key)}
                  onRowDoubleClick={(e) => openInFile(t, e)}
                  onPointerDown={() => {}}
                  today={today}
                  showProject
                  hideActions
                  isSelected={sel.includes(t.key)}
                  archivedFrom={t.path}
                />
              ))}
            </>
          )}
        </div>
      </main>
      {menu && (
        <GtdMenu
          x={menu.x}
          y={menu.y}
          items={menu.items}
          header={menu.header}
          testId={menu.testId}
          onClose={() => setMenu(null)}
        />
      )}
      {showTagManager && (
        <GtdTagManager
          tasks={tasks}
          areas={areas}
          contextTags={contextTags}
          onClose={() => setShowTagManager(false)}
          onRenameTag={(from, to) => dispatch(gtdRenameTag(tasks, from, to))}
          onDeleteTag={(tag) => dispatch(gtdRenameTag(tasks, tag, ''))}
          onRenameArea={(from, to) => dispatch(gtdRenameArea(tasks, from, to))}
          onAddDefaultTag={(tag) => {
            const line = defaultTagsLine();
            if (!defaultTags().includes(tag))
              dispatch(setEliSetting('eliDefaultTagsLine', `${line} ${tag}`));
          }}
          headingTags={headingTags}
          onToggleHeadings={(tag) => {
            const next = headingTags.includes(tag)
              ? headingTags.filter((x) => x !== tag)
              : [...headingTags, tag];
            setHeadingTags(next);
            writeLS('eliGtdTagHeadings', next);
          }}
          onRemoveDefaultTag={(tag) => {
            const line = defaultTagsLine()
              .split(/\s+/)
              .filter((x) => x.replace(/\(.*\)$/, '') !== tag)
              .join(' ');
            dispatch(setEliSetting('eliDefaultTagsLine', line));
          }}
        />
      )}
      {showShortcuts && (
        <GtdShortcutsModal
          bindings={gtdBindings}
          onClose={() => setShowShortcuts(false)}
          onConfigure={() => {
            setShowShortcuts(false);
            history.push('/settings');
            dispatch(pushModalPage('keyboard_shortcuts_editor'));
          }}
        />
      )}
      {showAgenda && (
        <Drawer
          onClose={() => setShowAgenda(false)}
          maxSize
          className="drawer-outer-container--over-gtd"
        >
          <EliErrorBoundary label="la agenda" onClose={() => setShowAgenda(false)}>
            <AgendaModal
              onClose={() => setShowAgenda(false)}
              onOpenFile={(filePath) => {
                setShowAgenda(false);
                history.push(`/file${filePath}`);
              }}
            />
          </EliErrorBoundary>
        </Drawer>
      )}
    </div>
  );
}
