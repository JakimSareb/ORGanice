// ORG Mode para Eli: vista GTD al estilo de Nirvana (menú lateral de listas y proyectos; las
// tareas, filtradas, a la derecha). Trabaja sobre los mismos ficheros Org.
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import { useHistory } from 'react-router-dom';
import { List } from 'immutable';

import './stylesheet.css';

import {
  LISTS,
  EXTRA_LISTS,
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
  projectSectionOf,
  groupByProject,
  isGroupableList,
  keywordForList,
  PRIORITY_RE,
} from '../../lib/gtd/gtd_model';
import {
  gtdSaveTask,
  gtdToggleDone,
  gtdToggleStar,
  gtdAddTask,
  gtdDeleteTask,
  gtdMoveToProject,
  gtdArchiveTask,
  gtdCloseProject,
  gtdUndo,
  gtdRedo,
} from '../../lib/gtd/gtd_actions';
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
} from '../../actions/org';
import { parseOrgLink } from '../../lib/eli_org_links';
import { followOrgLinkSplitAware, openSplitAware } from '../../lib/eli_split_links';
import { declaredTagsFromConfigLines } from '../../lib/gtd_contexts';
import { confirmRemoveHeader } from '../../lib/eli_confirm_remove';
import TaskEditor from './TaskEditor';
import Drawer from '../UI/Drawer';
import AgendaModal from '../OrgFile/components/AgendaModal';
import EliErrorBoundary from '../EliErrorBoundary';
import { fileLinkTarget, resolveDropboxPath, openInNewTab } from '../../lib/eli_media';
import { showMessage, askDate, askConfirm, askCloseProject } from '../../lib/eli_prompt';
import {
  defaultTags,
  allowedValuesFromConfigLines,
  DEFAULT_ENERGY,
  DEFAULT_EFFORT,
} from '../../lib/eli_todo_defaults';
import { openUploadDialog } from '../EliTools';
import { confirmAndDeleteAttachment } from '../../lib/eli_attachments';
import useTaskDrag from './useTaskDrag';
import useReorderDrag from './useReorderDrag';
import {
  setGtdConfig,
  isSectionShown,
  sectionLabel,
  sectionDef,
  isCustomId,
} from '../../lib/gtd/gtd_sections';
import { createRawDescriptionText } from '../../lib/export_org';
import { getShowArchived, setShowArchived, isArchiveFile } from '../../lib/eli_archived';
import { Map as IMap } from 'immutable';
import { parseCaptureTemplate } from '../../lib/capture_template_parsing';
import { headerWithPath } from '../../lib/org_utils';
import { chooseCaptureTemplate } from '../../lib/eli_capture_menu';
import { gtdMatchesBinding, isEditable, shouldIgnoreOrganiceHotkey } from '../../lib/eli_hotkeys';
import { calculateGtdKeybindings } from '../../lib/keybindings';
import GtdShortcutsModal from './GtdShortcutsModal';
import { pushModalPage } from '../../actions/base';

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

const LS_VIEW = 'eliGtdView';
const LS_GROUP = 'eliGtdGroupByProject';
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

function TaskRow({
  task,
  open,
  onToggleOpen,
  dispatch,
  today,
  showProject,
  onPointerDown,
  isDragging,
  hideActions = false,
  reorderSection = null,
  onReorderStart = null,
  isReordering = false,
  isSelected = false,
  archivedFrom = null,
}) {
  const due = task.deadline;
  const overdue = due && due < today;
  return (
    <div
      className={
        'gtd-task' +
        (open ? ' is-open' : '') +
        (task.isDone ? ' is-done' : '') +
        (isDragging ? ' is-dragging' : '') +
        (isReordering ? ' is-reordering' : '') +
        (isSelected ? ' is-selected' : '') +
        (onReorderStart ? ' has-handle' : '')
      }
      data-testid="gtd-task"
      data-reorder-slot=""
      data-reorder-key={task.key}
      data-reorder-section={reorderSection || 'list'}
    >
      <div className="gtd-task__row" onClick={onToggleOpen} onPointerDown={onPointerDown}>
        {/* ORG Mode para Eli (2.15): asa para reordenar arrastrando */}
        {onReorderStart && (
          <button
            type="button"
            className="gtd-task__handle"
            onPointerDown={onReorderStart}
            onClick={(e) => e.stopPropagation()}
            title="Arrastra para cambiar el orden"
            aria-label="Cambiar el orden"
            data-testid="gtd-reorder-handle"
          >
            <i className="fas fa-grip-vertical" />
          </button>
        )}
        {/* ORG Mode para Eli: en el Logbook no se reabre ni se pone ★ desde la fila (se edita
            abriendo la tarea) */}
        {!hideActions && (
          <>
            <button
              className={'gtd-check' + (task.isDone ? ' is-on' : '')}
              onClick={(e) => {
                e.stopPropagation();
                dispatch(gtdToggleDone(task));
              }}
              title={task.isDone ? 'Reabrir' : 'Completar'}
              data-testid="gtd-check"
            >
              {task.isDone ? <i className="fas fa-check" /> : null}
            </button>
            <button
              className={'gtd-star' + (task.priority === 'A' ? ' is-on' : '')}
              onClick={(e) => {
                e.stopPropagation();
                dispatch(gtdToggleStar(task));
              }}
              title="Focus (★ [#A])"
              data-testid="gtd-star"
            >
              <i className={task.priority === 'A' ? 'fas fa-star' : 'far fa-star'} />
            </button>
          </>
        )}
        <div className="gtd-task__main">
          <div className="gtd-task__title">{task.title || '(sin título)'}</div>
          <div className="gtd-task__meta">
            {archivedFrom && (
              <span className="gtd-meta" title="Archivada en">
                <i className="fas fa-archive" /> {archivedFrom.replace(/^\//, '')}
              </span>
            )}
            {showProject && task.project && (
              <span className="gtd-meta gtd-meta--project">
                <i className="fas fa-project-diagram" /> {task.project.title}
              </span>
            )}
            {task.area && <span className="gtd-meta gtd-meta--area">{task.area}</span>}
            {task.tags
              .filter((t) => t.toLowerCase() !== 'sleep')
              .map((t) => (
                <span key={t} className="gtd-meta gtd-meta--tag">
                  {t}
                </span>
              ))}
            {task.energy && (
              <span className="gtd-meta" title="Energía">
                <i className="fas fa-bolt" /> {task.energy}
              </span>
            )}
            {task.effort && (
              <span className="gtd-meta" title="Tiempo">
                <i className="far fa-clock" /> {task.effort}
              </span>
            )}
            {task.description.trim() && (
              <i className="far fa-sticky-note gtd-meta" title="Tiene notas" />
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
          </div>
        </div>
        <div className="gtd-task__dates">
          {task.scheduled && task.scheduled > today && (
            <span className="gtd-date" title="Empieza">
              <i className="far fa-calendar-alt" /> {fmtDate(task.scheduled)}
            </span>
          )}
          {due && (
            <span
              className={'gtd-date gtd-date--due' + (overdue ? ' is-overdue' : '')}
              title="Vence"
            >
              <i className="fas fa-flag" /> {fmtDate(due)}
            </span>
          )}
          {task.isDone && task.closed && <span className="gtd-date">{fmtDate(task.closed)}</span>}
        </div>
      </div>
    </div>
  );
}

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

  const [view, setView] = useState(() => readLS(LS_VIEW, { id: 'focus' }));
  const [area, setArea] = useState(() => readLS(LS_AREA, '*'));
  const [filters, setFilters] = useState({ tags: [], energy: null, time: null, dated: false });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilterCount =
    filters.tags.length +
    (filters.energy ? 1 : 0) +
    (filters.time ? 1 : 0) +
    (filters.dated ? 1 : 0);
  const [text, setText] = useState('');
  const [logText, setLogText] = useState('');
  // ORG Mode para Eli: tareas creadas ahora en esta lista: se ven arriba del todo (hasta cambiar
  // de lista)
  const [freshKeys, setFreshKeys] = useState([]);
  const [projGroupsOpen, setProjGroupsOpen] = useState({});
  // ORG Mode para Eli (2.15): agrupar las listas por proyecto (se recuerda) y, en un proyecto,
  // la sección de terminadas plegada
  const [groupByProj, setGroupByProj] = useState(() => readLS(LS_GROUP, false) === true);
  const [doneOpen, setDoneOpen] = useState(false);
  const [openKey, setOpenKey] = useState(null);
  // (2.16) tarea seleccionada con el teclado (↑ ↓; Intro la abre, Supr la borra)
  const [selKey, setSelKey] = useState(null);
  // ORG Mode para Eli: tarea recién creada con su editor abierto: no se cierra al tocar fuera
  // (hay que Guardar o Cancelar; Cancelar la borra)
  const [newKey, setNewKey] = useState(null);
  const noSwipeGtd = useSelector(selectNoSwipeGtd);
  const archiveInSubfolder = useSelector(selectArchiveInSubfolder);
  // ORG Mode para Eli: proyecto nuevo en el editor (aún no existe en el fichero)
  const [newProject, setNewProject] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [sideOpen, setSideOpen] = useState(false);
  const [showAgenda, setShowAgenda] = useState(false);
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
  const scopePaths = useMemo(
    () => loadedPaths.filter((p) => wanted.includes(p) || !wanted.length),
    [loadedPaths, wanted]
  );
  const scopedFiles = useMemo(() => files.filter((_f, p) => scopePaths.includes(p)), [
    files,
    scopePaths,
  ]);
  const inboxPaths = useMemo(() => inboxPathsOf(templates, scopePaths), [templates, scopePaths]);
  const tasksFile = tasksFileOf(templates, scopePaths, inboxPaths);
  // Inbox nuevo: en inbox.org (si no existe, el de la plantilla de entrada)
  const inboxFile =
    pickByName(scopePaths, 'inbox.org') || inboxPaths.find((p) => scopePaths.includes(p)) || null;

  // ORG Mode para Eli: secciones configurables (Ajustes → Vista GTD: secciones). Al cambiar la
  // configuración se vuelve a calcular todo.
  const gtdCfg = setGtdConfig(useSelector(selectGtdSections));
  const tasks = useMemo(
    () => buildTasks(scopedFiles, inboxPaths),
    // eslint-disable-next-line
    [scopedFiles, inboxPaths, gtdCfg]
  );
  const counts = useMemo(() => countsFor(tasks, { area }, today), [tasks, area, today]);
  const projects = useMemo(() => projectsOf(tasks, { area }), [tasks, area]);
  const allProjects = useMemo(() => projectsOf(tasks, {}), [tasks]);
  const overview = useMemo(
    () =>
      view.id === 'projects'
        ? projectsOverview(tasks, { area }, today)
        : { active: [], scheduled: [], sleep: [] },
    [view.id, tasks, area, today]
  );
  // ORG Mode para Eli: proyectos activos, programados (SCHEDULED a futuro) y dormidos (:sleep:)
  const projectGroups = useMemo(() => {
    const g = { active: [], scheduled: [], sleep: [] };
    projects.forEach((p) => g[projectState(p, today)].push(p));
    return g;
  }, [projects, today]);
  const areas = useMemo(() => areasOf(tasks), [tasks]);

  const baseList = useMemo(() => tasksForView(tasks, view, { area, text }, today), [
    tasks,
    view,
    area,
    text,
    today,
  ]);
  const facets = useMemo(() => facetsFor(baseList), [baseList]);
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
      : visible;
    if (freshKeys.length) {
      const fresh = freshKeys.map((k) => list.find((t) => t.key === k)).filter(Boolean);
      if (fresh.length) list = [...fresh, ...list.filter((t) => !freshKeys.includes(t.key))];
    }
    return list;
  }, [visible, splitHabits, freshKeys]);
  const sectionStarts = useMemo(() => {
    const out = {};
    if (splitHabits) {
      const isFresh = (t) => freshKeys.includes(t.key);
      const firstRep = rendered.find((t) => !isFresh(t) && !t.isHabit && t.repeats);
      if (firstRep)
        out[firstRep.key] = { id: 'repeats', label: 'Se repiten', icon: 'fas fa-sync-alt' };
      const first = rendered.find((t) => !isFresh(t) && t.isHabit);
      if (first) out[first.key] = { id: 'habits', label: 'Hábitos', icon: 'fas fa-redo-alt' };
    } else if (view.id === 'logbook') {
      let prev = null;
      rendered.forEach((t) => {
        const g = logbookGroupOf(t.closed, today);
        if (g.id !== prev) out[t.key] = { ...g, icon: 'fas fa-check' };
        prev = g.id;
      });
    }
    return out;
  }, [rendered, splitHabits, view.id, today, freshKeys]);

  // ORG Mode para Eli (2.15): lo que se pinta en la lista: cabeceras y filas. En un proyecto, por
  // secciones de estado (como Nirvana); en las listas, opcionalmente agrupado por proyecto.
  const isProjectView = view.type === 'project';
  const canGroup = !isProjectView && isGroupableList(view.id);
  const grouped = canGroup && groupByProj;
  const canReorderLoose = !isProjectView && isGroupableList(view.id);
  const projSections = useMemo(
    () =>
      isProjectView ? projectSections(tasks, view.key, { area, text, ...filters }, today) : null,
    [isProjectView, tasks, view.key, area, text, filters, today]
  );
  const onReorderDropRef = useRef(null);
  const { startReorder, reordering: reorderingKey, dropSection } = useReorderDrag({
    onDrop: (task, pos) => onReorderDropRef.current && onReorderDropRef.current(task, pos),
  });
  const buildDeps = useMemo(
    () => ({}),
    // eslint-disable-next-line
    [
      isProjectView,
      projSections,
      grouped,
      rendered,
      sectionStarts,
      today,
      canReorderLoose,
      doneOpen,
      reorderingKey,
    ]
  );
  // (2.16) La tarea abierta en el editor no desaparece de la lista aunque deje de encajar en
  // ella (p. ej. al terminarla desde el editor): se queda en su sitio hasta cerrarla
  const stickyRef = useRef(null);
  const items = useMemo(() => {
    const out = buildItems();
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
  }, [buildDeps, openKey, tasks]);
  function buildItems() {
    const out = [];
    if (isProjectView && projSections) {
      projSections.forEach((sec) => {
        const isDone = sec.id === 'done';
        // Mientras se arrastra se ven también las secciones vacías (para poder soltar en ellas)
        if (!sec.tasks.length && !reorderingKey) return;
        out.push({
          kind: 'header',
          id: `ps-${sec.id}`,
          section: sec.id,
          label: sec.label,
          icon: sec.icon,
          count: sec.tasks.length,
          reorder: true,
          collapsible: isDone,
          collapsed: isDone && !doneOpen,
          testId: `gtd-psec-${sec.id}`,
        });
        if (isDone && !doneOpen) return;
        sec.tasks.forEach((t) =>
          out.push({ kind: 'task', task: t, section: sec.id, reorderable: !isDone })
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
    const { ok, blocked } = archivableDone(tasks);
    return {
      ok: ok.filter((t) => matchesFilters(t, f)),
      blocked: blocked.filter((t) => matchesFilters(t, f)),
    };
  }, [isLogbook, tasks, area, text, filters, logSearch]);
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

  // ORG Mode para Eli (2.11): terminadas o canceladas (sin archivar) que tienen adjuntos
  const doneWithAttachments = useMemo(
    () => (isLogbook ? tasks.filter((t) => t.isDone && t.attachmentCount > 0).length : 0),
    [isLogbook, tasks]
  );
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
        ', como hace Emacs (org-archive-subtree).',
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

  const allTags = useMemo(() => {
    const declared = declaredTags;
    const used = new Set();
    tasks.forEach((t) => t.ownTags.forEach((x) => used.add(x)));
    return Array.from(new Set([...declared, ...Array.from(used).sort()]));
  }, [tasks, declaredTags]);

  const selectView = useCallback((v) => {
    setView(v);
    writeLS(LS_VIEW, v);
    setFilters({ tags: [], energy: null, time: null, dated: false }); // como Nirvana
    setOpenKey(null);
    setFreshKeys([]);
    setSideOpen(false);
    setSelKey(null);
  }, []);
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
      (id) => !['agenda', 'projects'].includes(id) && isSectionShown(id, gtdCfg)
    );
    if (first && first !== view.id) selectView({ id: first });
  }, [view, gtdCfg, selectView]);

  // Si la vista guardada es un proyecto que ya no existe, volver a Focus
  useEffect(() => {
    if (view.type === 'project' && tasks.length && !projectTask) selectView({ id: 'focus' });
  }, [view, tasks, projectTask, selectView]);

  const toggleTag = (t) =>
    setFilters((f) => ({
      ...f,
      tags: f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t],
    }));

  // Abrir en su fichero con la vista reducida (narrow) a la tarea o proyecto
  // (2.16) con dos columnas, pregunta si abrirla aquí o en la otra (Ctrl/⌘+clic: en la otra)
  const openInFile = (task, event) =>
    openSplitAware(
      () => {
        dispatch(selectHeaderAndOpenParents(task.path, task.id, { widen: true }));
        dispatch(eliNarrowAndExpand(task.id));
        history.push(`/file${task.path}`);
      },
      'eli:open-task',
      { path: task.path, index: task.index, title: task.rawTitle },
      event
    );

  const addTask = () => {
    const title = newTitle.trim();
    if (!title) return;
    const isInbox = view.id === 'inbox';
    let target;
    let list = view.id;
    if (view.type === 'project' && projectTask) {
      target = { path: projectTask.path, parentId: projectTask.id };
      list = 'next';
    } else {
      target = { path: (isInbox && inboxFile) || tasksFile };
      if (view.id === 'focus') list = 'next';
      if (view.id === 'scheduled' || view.id === 'logbook' || view.id === 'deadline')
        list = 'later';
    }
    // (2.16) sección propia: su primer estado (o TODO) y su primera etiqueta
    const customSec = isCustomId(view.id) ? gtdCfg.sections[view.id] : null;
    if (customSec) list = 'later';
    const scheduled = view.id === 'scheduled' ? new Date(today.getTime() + 86400000) : null;
    const newId = dispatch(
      gtdAddTask(target, {
        title,
        list: list === 'focus' ? 'next' : list,
        ...(customSec && customSec.states.length ? { keyword: customSec.states[0] } : {}),
        area: area !== '*' && area !== '-' ? area : null,
        priority: view.id === 'focus' ? 'A' : null,
        scheduled,
        deadline: view.id === 'deadline' ? today : null,
        // Si Inbox no va a su fichero de entrada, se marca con @inbox para que se vea en Inbox
        tags:
          isInbox && !inboxPaths.includes(target.path)
            ? Array.from(new Set([...filters.tags, inboxTag()]))
            : customSec && customSec.tags.length
            ? Array.from(new Set([...filters.tags, customSec.tags[0]]))
            : filters.tags,
      })
    );
    setNewTitle('');
    // ORG Mode para Eli: la tarea nueva se abre en el editor para completar sus datos
    if (newId) {
      const key = `${target.path}::${newId}`;
      setFreshKeys((k) => [key, ...k.filter((x) => x !== key)]);
      setOpenKey(key);
      setNewKey(key);
    }
  };

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
  const draftFor = (kind, { top = false } = {}) => {
    let list = kind;
    if (kind === 'current') {
      if (isProjectView) list = 'next';
      else if (view.id === 'projects') return null;
      else list = view.id;
    }
    const d = {
      rev: Date.now(),
      top,
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
    return d;
  };
  const openDraft = (kind, opts) => {
    if (!tasksFile) return;
    const d = draftFor(kind, opts);
    if (!d) {
      addProject();
      return;
    }
    setOpenKey(null);
    setNewProject(null);
    setDraft(d);
  };
  // Plantilla de captura (tecla c o botón): el editor de tarea nueva con lo que trae la plantilla
  const captureWithTemplate = async () => {
    const list = templates.toArray();
    if (!list.length) {
      showMessage(
        'Plantillas de captura',
        'No tienes plantillas de captura. Añade alguna en Ajustes → Plantillas de captura.'
      );
      return;
    }
    const t = await chooseCaptureTemplate(list);
    if (!t) return;
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
    setOpenKey(null);
    setNewProject(null);
    setDraft({
      rev: Date.now(),
      template: t.get('description') || t.get('letter') || '',
      list: null,
      keyword: fake.keyword,
      // Sin recortar el final: «Llamar a %?» deja el cursor tras «a »
      title: (fake.rawTitle || '')
        .replace(PRIORITY_RE, '')
        .replace(/^\s+/, '')
        .replace(/\s+$/, ' '),
      priority: fake.priority,
      scheduled: fake.scheduled,
      deadline: fake.deadline,
      tags: fake.ownTags,
      area: fake.ownArea || areaPreset,
      notes: fake.description,
      templateHeader: parsed.header,
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
  const createFromDraft = (changes, projectKey) => {
    const d = draft;
    if (!d) return;
    const title = (changes.rawTitle !== undefined ? changes.rawTitle : d.title || '').trim();
    if (!title) return;
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
      })
    );
    if (!newId) return;
    const key = `${target.path}::${newId}`;
    // 2) después, lo cambiado en el editor (lista, fechas, etiquetas, notas…)
    const rest = { ...changes };
    delete rest.rawTitle;
    const created = () =>
      buildTasks(
        IMap({ [target.path]: store.getState().org.present.getIn(['files', target.path]) }),
        inboxPaths
      ).find((t) => t.id === newId);
    if (Object.keys(rest).length) {
      const t = created();
      if (t) dispatch(gtdSaveTask(t, rest));
    }
    // 3) «arriba de la lista»: delante de la primera tarea que se ve de su mismo fichero
    if (d.top) {
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
    setFreshKeys((k) => [key, ...k.filter((x) => x !== key)]);
  };
  const renderDraftEditor = () => (
    <div className="gtd-new-project gtd-new-task" data-testid="gtd-new-task">
      {draft.template && (
        <div className="gtd-new-task__template">
          <i className="fas fa-plus" /> Plantilla: {draft.template}
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
    if (!answer) return;
    setOpenKey(null);
    dispatch(gtdCloseProject(project, answer.state, answer.cancelOpen ? open : []));
    if (view.type === 'project' && view.key === project.key) selectView({ id: 'projects' });
  };

  const saveTask = (task, changes, projectKey) => {
    dispatch(gtdSaveTask(task, changes));
    // Proyecto convertido en tarea desde su propia vista: se va a Todo, donde queda la tarea
    if (task.isProject && changes.list === 'later' && view.key === task.key) {
      selectView({ id: 'later' });
    }
    if (projectKey !== undefined) {
      const project = projectKey ? allProjects.find((p) => p.key === projectKey) : null;
      dispatch(gtdMoveToProject(task, project ? { path: project.path, id: project.id } : null));
    }
  };

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

  // Arrastrar una tarea a una lista o proyecto del menú lateral
  const applyDrop = async (task, dropId) => {
    setSideOpen(false);
    const [kind, ...rest] = dropId.split(':');
    const id = rest.join(':');
    if (kind === 'project') {
      const project = allProjects.find((p) => p.key === id);
      if (!project || project.key === task.key) return;
      if (!task.keyword) {
        dispatch(gtdSaveTask(task, { list: 'next', tags: tagsForList(task, 'next') }));
      }
      dispatch(gtdMoveToProject(task, { path: project.path, id: project.id }));
      return;
    }
    const day = (n) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + n);
    if (id === 'focus') {
      dispatch(gtdSaveTask(task, { priority: 'A' }));
    } else if (id === 'scheduled' || id === 'deadline') {
      const isScheduled = id === 'scheduled';
      const date = await askDate({
        title: isScheduled ? 'Programar (Scheduled)' : 'Fecha límite (Deadline)',
        message: `«${task.title}»`,
        value: isScheduled ? task.scheduled || day(1) : task.deadline || day(0),
      });
      if (!date) return;
      const changes = isScheduled ? { scheduled: date } : { deadline: date };
      if (!task.keyword) {
        changes.list = 'later';
        changes.tags = tagsForList(task, 'later');
      }
      dispatch(gtdSaveTask(task, changes));
    } else if (id === 'logbook') {
      dispatch(gtdSaveTask(task, { list: 'done' }));
    } else if (isCustomId(id)) {
      // (2.16) sección propia: su primer estado y su primera etiqueta (si tiene)
      const sec = gtdCfg.sections[id];
      if (!sec) return;
      const changes = {};
      if (sec.states.length && task.keyword !== sec.states[0]) changes.keyword = sec.states[0];
      else if (!task.keyword && !sec.states.length) changes.keyword = 'TODO';
      if (sec.tags.length && !(task.ownTags || []).includes(sec.tags[0])) {
        changes.tags = [...(task.ownTags || []), sec.tags[0]];
      }
      if (Object.keys(changes).length) dispatch(gtdSaveTask(task, changes));
    } else {
      dispatch(gtdSaveTask(task, { list: id, tags: tagsForList(task, id) }));
    }
  };
  // ORG Mode para Eli (2.15): soltar una tarea reordenada. En un proyecto, si se suelta en otra
  // sección, cambia de estado; y en todo caso se coloca junto a la tarea de al lado en el fichero.
  onReorderDropRef.current = async (task, pos) => {
    const rows = items.filter((i) => i.kind === 'task' && i.task.key !== task.key);
    const rowTasks = rows.map((i) => i.task);
    const keyIndex = (k) => rowTasks.findIndex((t) => t.key === k);
    if (isProjectView) {
      const target = pos.section;
      if (!target) return;
      const own = projectSectionOf(task, today);
      const inTarget = rows.filter((i) => i.section === target).map((i) => i.task);
      const before = pos.beforeKey && inTarget.find((t) => t.key === pos.beforeKey);
      const after = pos.afterKey && inTarget.find((t) => t.key === pos.afterKey);
      const changes = {};
      if (target !== 'done') {
        if (before) changes.moveNextTo = { targetId: before.id, position: 'before' };
        else if (after) changes.moveNextTo = { targetId: after.id, position: 'after' };
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
        'Las tareas sueltas se ordenan entre las demás tareas sueltas de su mismo fichero y de ' +
          'su mismo encabezado.'
      );
      return;
    }
    dispatch(gtdSaveTask(task, { moveNextTo: move }));
  };

  const { onPointerDown, dragging, dropTarget, clickSuppressed } = useTaskDrag({
    onDrop: applyDrop,
    canSwipe: (task) => !noSwipeGtd && !task.isDone && view.id !== 'logbook',
    onSwipe: (task, dir) => {
      if (dir === 'right') dispatch(gtdToggleDone(task));
      else deleteTask(task);
    },
    onStart: () => {
      setOpenKey(null);
      if (window.matchMedia && window.matchMedia('(max-width: 720px)').matches) {
        setSideOpen(true);
      }
    },
  });
  const dropProps = (dropId) => ({
    'data-drop': dropId,
    className: dropTarget === dropId ? ' is-drop' : '',
  });

  const syncAll = () =>
    scopePaths.forEach((p) => dispatch(sync({ path: p, shouldSuppressMessages: true })));

  // ORG Mode para Eli: órdenes de la paleta de comandos (ver EliCommandPalette)
  const gtdCmdRef = useRef();
  gtdCmdRef.current = (cmd) => {
    if (!cmd) return;
    if (cmd.view) selectView(cmd.view);
    if (cmd.agenda) setShowAgenda(true);
    if (cmd.shortcuts) setShowShortcuts(true);
    if (cmd.newProject) addProject();
    if (cmd.sync) syncAll();
    if (cmd.focusAdd) {
      setTimeout(() => {
        const el = document.querySelector('[data-testid="gtd-add"]');
        if (el) el.focus();
      }, 50);
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
      if (!isSectionShown(id, gtdCfg) || id === 'agenda') return;
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
  const cleanup = () => {
    const { ok } = archivableDone(tasks);
    if (!ok.length) {
      showMessage('Limpiar', 'No hay tareas terminadas para archivar.');
      return;
    }
    archiveTasks(ok);
  };
  const gtdActions = {
    gtdNew: () => openDraft('current'),
    gtdNewTop: () => openDraft('current', { top: true }),
    gtdNewInbox: () => openDraft('inbox'),
    gtdNewNext: () => openDraft('next'),
    gtdNewWaiting: () => openDraft('waiting'),
    gtdNewScheduled: () => openDraft('scheduled'),
    gtdNewSomeday: () => openDraft('someday'),
    gtdNewFocus: () => openDraft('focus'),
    gtdNewProject: () => addProject(),
    gtdNewReference: () => openDraft('reference'),
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
    gtdPrevList: () => stepList(-1),
    gtdNextList: () => stepList(1),
    gtdAreaAll: () => selectArea('*'),
    gtdAreaNext: () => stepArea(1),
    gtdAreaPrev: () => stepArea(-1),
    gtdAreaNone: () => selectArea('-'),
    gtdSearch: () => {
      if (window.matchMedia && window.matchMedia('(max-width: 720px)').matches) setSideOpen(true);
      setTimeout(() => {
        const el = document.querySelector('[data-testid="gtd-search"]');
        if (el) el.focus();
      }, 50);
    },
    gtdSync: () => syncAll(),
    gtdAgenda: () => setShowAgenda(true),
    gtdCleanup: () => cleanup(),
    gtdSettings: () => history.push('/settings'),
    gtdManual: () => history.push('/sample'),
    gtdShortcuts: () => setShowShortcuts(true),
    gtdShortcuts2: () => setShowShortcuts(true),
  };
  // (2.16) Recorrer la lista con el teclado: ↓ empieza por la primera tarea, ↑ por la última;
  // Intro abre la seleccionada; Supr o Retroceso la borran (con confirmación: Intro confirma);
  // ← vuelve al menú lateral; Esc quita la selección
  const listKey = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    const t = e.target;
    if (t && t.closest && t.closest('.gtd-side')) return false;
    const rows = items.filter((i) => i.kind === 'task').map((i) => i.task);
    const idx = selKey ? rows.findIndex((x) => x.key === selKey) : -1;
    const select = (task) => {
      setSelKey(task ? task.key : null);
      if (!task) return;
      setTimeout(() => {
        const el = document.querySelector(`[data-reorder-key="${CSS.escape(task.key)}"]`);
        if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
      }, 0);
    };
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (e.shiftKey || !rows.length) return false;
      e.preventDefault();
      const down = e.key === 'ArrowDown';
      const next =
        idx < 0
          ? down
            ? 0
            : rows.length - 1
          : Math.max(0, Math.min(rows.length - 1, idx + (down ? 1 : -1)));
      select(rows[next]);
      return true;
    }
    if (e.key === 'ArrowLeft' && !e.shiftKey) {
      const on = document.querySelector('.gtd-side .gtd-side__item.is-on');
      if (!on || !on.offsetParent) return false;
      e.preventDefault();
      setSelKey(null);
      on.focus();
      return true;
    }
    if (idx < 0) return false;
    const task = rows[idx];
    if (e.key === 'Enter') {
      if (t && t.closest && t.closest('button, a, select')) return false;
      e.preventDefault();
      setOpenKey(task.key);
      return true;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      const after = rows[idx + 1] || rows[idx - 1] || null;
      deleteTask(task).then((deleted) => deleted && select(after));
      return true;
    }
    if (e.key === 'Escape') {
      setSelKey(null);
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
        document.querySelectorAll('.gtd-side .gtd-side__item:not(.gtd-side__item--agenda)')
      ).filter((b) => b.offsetParent);
      const i = all.indexOf(item);
      const next = all[i + (e.key === 'ArrowDown' ? 1 : -1)];
      e.preventDefault();
      if (next) {
        next.focus();
        next.click();
      }
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      item.blur();
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
    if (showAgenda || showShortcuts || draft || newProject || openKey) return;
    if (
      document.querySelector(
        '.eli-cal__overlay, .eli-calc__overlay, .drawer, [data-testid="drawer"]'
      )
    )
      return;
    if (listKey(e)) return;
    const hit = gtdBindings.find((b) => gtdMatchesBinding(e, b.binding));
    if (!hit || !gtdActions[hit.action]) return;
    e.preventDefault();
    gtdActions[hit.action]();
  };
  useEffect(() => {
    const onKey = (e) => keyRef.current && keyRef.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
      onDelete={() => deleteTask(task)}
      onArchive={() => {
        setOpenKey(null);
        dispatch(gtdArchiveTask(task));
      }}
      onCloseProject={task.isProject ? () => closeProject(task) : undefined}
      onAttachFiles={(list, target) =>
        openUploadDialog({ files: list, source: 'attach', path: task.path, target })
      }
      onDeleteFile={(target) => deleteAttachmentFile(task, target)}
      energyOptions={energyOptions}
      effortOptions={effortOptions}
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

  const renderProjectButton = (p) => {
    const n = tasksForView(tasks, { type: 'project', key: p.key }, { area: '*' }, today).length;
    return (
      <button
        key={p.key}
        data-drop={`project:${p.key}`}
        className={
          'gtd-side__item gtd-side__item--project' +
          (view.key === p.key ? ' is-on' : '') +
          dropProps(`project:${p.key}`).className
        }
        onClick={(e) => {
          selectView({ type: 'project', key: p.key });
          afterSideClick(e);
        }}
        data-testid="gtd-project"
      >
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
      {counts[l.id] > 0 && l.id !== 'logbook' && (
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
  const renderProjectsBlock = () => (
    <React.Fragment>
      <div className="gtd-side__section">
        <span>Proyectos</span>
        <button
          className="gtd-side__add"
          title="Nuevo proyecto"
          onClick={addProject}
          data-testid="gtd-add-project"
        >
          +
        </button>
      </div>
      <nav className="gtd-side__projects">
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
        {projectGroups.active.map(renderProjectButton)}
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
              {projGroupsOpen[id] && projectGroups[id].map(renderProjectButton)}
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
    gtdCfg.order.forEach((id) => {
      if (!isSectionShown(id, gtdCfg)) return;
      if (id === 'agenda') {
        flush();
        out.push(<React.Fragment key="agenda">{renderAgendaButton()}</React.Fragment>);
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

  const loading = pendingLoads;
  const showAddRow = view.id !== 'logbook' && view.id !== 'reference' && view.id !== 'projects';

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
            title="Área"
            data-testid="gtd-area"
          >
            <option value="*">Todas las áreas</option>
            {areas.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
            <option value="-">Sin área</option>
          </select>
        </div>
        <div className="gtd-side__search">
          <i className="fas fa-search" />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // (2.16) Esc: fuera del buscador, de vuelta a la lista (el texto se queda)
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                e.currentTarget.blur();
                setSideOpen(false);
              }
            }}
            placeholder="Buscar"
            data-testid="gtd-search"
          />
        </div>
        {sidebarBlocks()}
      </aside>

      <div className="gtd-scrim" onClick={() => setSideOpen(false)} />

      <main className="gtd-main">
        <header className="gtd-main__head">
          <button className="gtd-main__menu" onClick={() => setSideOpen(true)} aria-label="Menú">
            <i className="fas fa-bars" />
          </button>
          <h1 className="gtd-main__title" data-testid="gtd-title">
            {title}
            <span className="gtd-main__count">
              {view.id === 'projects'
                ? overview.active.length + overview.scheduled.length + overview.sleep.length
                : visible.length}
            </span>
          </h1>
          {/* (2.16) sin fila «Añadir» (Logbook, Reference, Todos los proyectos), capturar va aquí */}
          {!showAddRow && (
            <button
              className="gtd-main__sync"
              onClick={() => captureWithTemplate()}
              title="Capturar con una plantilla (c)"
              aria-label="Capturar con una plantilla"
              data-testid="gtd-capture"
            >
              <i className="fas fa-plus-square" />
            </button>
          )}
          {canGroup && (
            <button
              className={'gtd-main__sync gtd-main__group' + (groupByProj ? ' is-on' : '')}
              onClick={() => {
                const v = !groupByProj;
                setGroupByProj(v);
                writeLS(LS_GROUP, v);
              }}
              aria-pressed={groupByProj}
              title={groupByProj ? 'Ver sin agrupar' : 'Agrupar por proyecto'}
              data-testid="gtd-group-toggle"
            >
              <i className="fas fa-stream" />
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
            onClick={() => dispatch(gtdRedo())}
            disabled={!canRedo}
            title="Rehacer"
          >
            <i className="fas fa-redo" />
          </button>
        </header>

        {newProject && renderNewProjectEditor()}
        {draft && renderDraftEditor()}

        {projectTask && (
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
            <button
              className="gtd-btn gtd-btn--link"
              onClick={() => setOpenKey(openKey === projectTask.key ? null : projectTask.key)}
              data-testid="gtd-edit-project"
            >
              <i className="fas fa-pen" /> Editar el proyecto
            </button>
            <button className="gtd-btn gtd-btn--link" onClick={(e) => openInFile(projectTask, e)}>
              <i className="fas fa-external-link-alt" /> Abrir en su fichero
            </button>
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
                    <button
                      key={r.project.key}
                      className="gtd-overview__row"
                      onClick={() => selectView({ type: 'project', key: r.project.key })}
                      data-testid="gtd-overview-row"
                    >
                      <span className="gtd-overview__title">
                        <i className="fas fa-project-diagram" /> {r.project.title}
                      </span>
                      <span className="gtd-overview__meta">
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
                  ))}
                </section>
              ) : null
            )}
            {!overview.active.length && !overview.scheduled.length && !overview.sleep.length && (
              <div className="gtd-empty">No hay proyectos (encabezados con estado PROJECT).</div>
            )}
          </div>
        )}

        {showAddRow && (
          <div className="gtd-add-row">
            <div className="gtd-add">
              <i className="fas fa-plus" />
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTask()}
                placeholder={
                  view.type === 'project'
                    ? 'Añadir acción al proyecto'
                    : view.id === 'inbox'
                    ? 'Añadir a Inbox'
                    : `Añadir a ${title}`
                }
                data-testid="gtd-add"
              />
            </div>
            {/* (2.16) plantillas de captura: a la vista, pero discreto */}
            <button
              type="button"
              className="gtd-capture-pill"
              onClick={() => captureWithTemplate()}
              title="Capturar con una plantilla (tecla c)"
              data-testid="gtd-capture"
            >
              <i className="fas fa-plus" /> Capturar
            </button>
          </div>
        )}

        {(facets.tags.length > 0 ||
          facets.energy.length > 0 ||
          facets.hasEffort ||
          facets.hasDates) && (
          <div className="gtd-filters" data-testid="gtd-filters">
            {/* ORG Mode para Eli: los filtros van plegados tras «Filtrar»; fuera solo se ven los
                que están activos */}
            <div className="gtd-filters__bar">
              <button
                className={'gtd-chip gtd-filters__toggle' + (filtersOpen ? ' is-open' : '')}
                onClick={() => setFiltersOpen(!filtersOpen)}
                aria-expanded={filtersOpen}
                data-testid="gtd-filters-toggle"
              >
                <i className="fas fa-filter" /> Filtrar
                {activeFilterCount > 0 && (
                  <span className="gtd-filters__count">{activeFilterCount}</span>
                )}
              </button>
              {!filtersOpen &&
                filters.tags.map((t) => (
                  <button key={t} className="gtd-chip is-on" onClick={() => toggleTag(t)}>
                    {t} ×
                  </button>
                ))}
              {!filtersOpen && filters.energy && (
                <button
                  className="gtd-chip gtd-chip--energy is-on"
                  onClick={() => setFilters((f) => ({ ...f, energy: null }))}
                >
                  <i className="fas fa-signal" /> {filters.energy} ×
                </button>
              )}
              {!filtersOpen && filters.time && (
                <button
                  className="gtd-chip gtd-chip--time is-on"
                  onClick={() => setFilters((f) => ({ ...f, time: null }))}
                >
                  <i className="far fa-clock" />{' '}
                  {(TIME_BUCKETS.find((x) => x.id === filters.time) || {}).label} ×
                </button>
              )}
              {!filtersOpen && filters.dated && (
                <button
                  className="gtd-chip is-on"
                  onClick={() => setFilters((f) => ({ ...f, dated: false }))}
                >
                  <i className="far fa-calendar-alt" /> Con fecha ×
                </button>
              )}
              {activeFilterCount > 0 && (
                <button
                  className="gtd-chip gtd-chip--clear"
                  onClick={() => setFilters({ tags: [], energy: null, time: null, dated: false })}
                >
                  Quitar filtros
                </button>
              )}
            </div>
            {filtersOpen && (
              <div className="gtd-filters__panel" data-testid="gtd-filters-panel">
                {facets.tags.length > 0 && (
                  <div className="gtd-filters__group">
                    <span className="gtd-filters__label">Contexto</span>
                    {facets.tags.map((t) => (
                      <button
                        key={t}
                        className={'gtd-chip' + (filters.tags.includes(t) ? ' is-on' : '')}
                        onClick={() => toggleTag(t)}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
                {facets.energy.length > 0 && (
                  <div className="gtd-filters__group">
                    <span className="gtd-filters__label">Energía</span>
                    {facets.energy.map((e) => (
                      <button
                        key={e}
                        className={
                          'gtd-chip gtd-chip--energy' + (filters.energy === e ? ' is-on' : '')
                        }
                        onClick={() =>
                          setFilters((f) => ({ ...f, energy: f.energy === e ? null : e }))
                        }
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                )}
                {facets.hasEffort && (
                  <div className="gtd-filters__group">
                    <span className="gtd-filters__label">Tiempo</span>
                    {TIME_BUCKETS.map((tb) => (
                      <button
                        key={tb.id}
                        className={
                          'gtd-chip gtd-chip--time' + (filters.time === tb.id ? ' is-on' : '')
                        }
                        onClick={() =>
                          setFilters((f) => ({ ...f, time: f.time === tb.id ? null : tb.id }))
                        }
                      >
                        {tb.label}
                      </button>
                    ))}
                  </div>
                )}
                {facets.hasDates && (
                  <div className="gtd-filters__group">
                    <span className="gtd-filters__label">Fecha</span>
                    <button
                      className={'gtd-chip' + (filters.dated ? ' is-on' : '')}
                      onClick={() => setFilters((f) => ({ ...f, dated: !f.dated }))}
                    >
                      Con fecha
                    </button>
                  </div>
                )}
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
              placeholder="Buscar en las terminadas…"
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
        {isLogbook && (
          <div className="gtd-archive-bar" data-testid="gtd-archive-bar">
            <span>
              {archivable.ok.length === 1
                ? '1 terminada sin archivar'
                : `${archivable.ok.length} terminadas sin archivar`}
              {logSearch ? ' (con esta búsqueda)' : ''}
              {archivable.blocked.length > 0 && (
                <span
                  className="gtd-archive-bar__note"
                  title="Tienen alguna subtarea sin terminar: no se archivan para no llevársela"
                >
                  {' '}
                  · {archivable.blocked.length} con subtareas abiertas
                </span>
              )}
            </span>
            <button
              type="button"
              className="gtd-btn"
              disabled={!archivable.ok.length}
              onClick={() => archiveTasks(archivable.ok)}
              data-testid="gtd-archive-all"
            >
              <i className="fas fa-archive" /> {logSearch ? 'Archivar estas' : 'Archivar todas'}
            </button>
          </div>
        )}

        {isLogbook && (
          <div className="gtd-archive-bar gtd-attach-bar" data-testid="gtd-attach-bar">
            <span>
              <i className="fas fa-paperclip" />{' '}
              {doneWithAttachments === 0
                ? 'Adjuntos de terminadas y archivadas'
                : doneWithAttachments === 1
                ? '1 terminada con adjuntos'
                : `${doneWithAttachments} terminadas con adjuntos`}
            </span>
            <button
              type="button"
              className="gtd-btn"
              onClick={() => dispatch(eliReviewFinishedAttachments())}
              data-testid="gtd-review-attachments"
              title="Ver y borrar los adjuntos de las tareas terminadas, canceladas o archivadas"
            >
              <i className="fas fa-search" /> Revisar
            </button>
          </div>
        )}

        <div
          className={'gtd-list' + (reorderingKey ? ' is-reordering' : '')}
          style={view.id === 'projects' ? { display: 'none' } : undefined}
          data-reorder-container=""
        >
          {loading && items.length === 0 && <div className="gtd-empty">Cargando ficheros…</div>}
          {!loading &&
            items.length === 0 &&
            !(isLogbook && showArchived && archivedTasks.length) && (
              <div className="gtd-empty">
                {view.id === 'inbox' ? 'Inbox vacío. ¡Bien hecho!' : 'No hay nada aquí.'}
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
                      onClick={() => setDoneOpen((o) => !o)}
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
                </div>
              )
            ) : openKey === item.task.key ? (
              <React.Fragment key={item.task.key}>{renderEditor(item.task)}</React.Fragment>
            ) : (
              <TaskRow
                key={item.task.key}
                task={item.task}
                open={false}
                onToggleOpen={() => {
                  if (clickSuppressed()) return;
                  // con una tarea nueva a medio crear, primero hay que guardarla o cancelarla
                  if (newKey && openKey === newKey) {
                    window.dispatchEvent(new CustomEvent('eli:gtd-attention'));
                    return;
                  }
                  setOpenKey(item.task.key);
                }}
                onPointerDown={onPointerDown(item.task)}
                isDragging={dragging === item.task.key}
                dispatch={dispatch}
                today={today}
                showProject={!isProjectView && !(grouped && item.task.project)}
                hideActions={isLogbook}
                reorderSection={item.section}
                onReorderStart={item.reorderable ? startReorder(item.task) : null}
                isReordering={reorderingKey === item.task.key}
                isSelected={selKey === item.task.key}
              />
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
                  open={false}
                  onToggleOpen={(e) => openInFile(t, e)}
                  onPointerDown={() => {}}
                  dispatch={dispatch}
                  today={today}
                  showProject
                  hideActions
                  archivedFrom={t.path}
                />
              ))}
            </>
          )}
        </div>
      </main>
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
        <Drawer onClose={() => setShowAgenda(false)} maxSize>
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
