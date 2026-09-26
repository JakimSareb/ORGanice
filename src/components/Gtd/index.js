// ORG Mode para Eli: vista GTD al estilo de Nirvana (menú lateral de listas y proyectos; las
// tareas, filtradas, a la derecha). Trabaja sobre los mismos ficheros Org.
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
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
  INBOX_TAG,
  tagsForList,
  needsAutoPriority,
  autoPriorityKey,
  logbookGroupOf,
  archivableDone,
  matchesFilters,
} from '../../lib/gtd/gtd_model';
import {
  gtdSaveTask,
  gtdToggleDone,
  gtdToggleStar,
  gtdAddTask,
  gtdDeleteTask,
  gtdMoveToProject,
  gtdArchiveTask,
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
} from '../../actions/org';
import { parseOrgLink } from '../../lib/eli_org_links';
import { declaredTagsFromConfigLines } from '../../lib/gtd_contexts';
import { confirmRemoveHeader } from '../../lib/eli_confirm_remove';
import TaskEditor from './TaskEditor';
import Drawer from '../UI/Drawer';
import AgendaModal from '../OrgFile/components/AgendaModal';
import EliErrorBoundary from '../EliErrorBoundary';
import { fileLinkTarget, resolveDropboxPath, openInNewTab } from '../../lib/eli_media';
import { showMessage, askDate, askConfirm } from '../../lib/eli_prompt';
import {
  defaultTags,
  allowedValuesFromConfigLines,
  DEFAULT_ENERGY,
  DEFAULT_EFFORT,
} from '../../lib/eli_todo_defaults';
import useTaskDrag from './useTaskDrag';

const selectClient = (s) => s.syncBackend.get('client');

// Tareas a las que ya se les puso ★ automáticamente (para no repetirlo si se quita a mano)
const LS_AUTO_A = 'eliGtdAutoA';

const selectFiles = (s) => s.org.present.get('files');
const selectFileSettings = (s) => s.org.present.get('fileSettings');
const selectTemplates = (s) => s.capture.get('captureTemplates') || List();
const selectCanUndo = (s) => s.org.past.length > 0;
const selectCanRedo = (s) => s.org.future.length > 0;

const LS_VIEW = 'eliGtdView';
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
}) {
  const due = task.deadline;
  const overdue = due && due < today;
  return (
    <div
      className={
        'gtd-task' +
        (open ? ' is-open' : '') +
        (task.isDone ? ' is-done' : '') +
        (isDragging ? ' is-dragging' : '')
      }
      data-testid="gtd-task"
    >
      <div className="gtd-task__row" onClick={onToggleOpen} onPointerDown={onPointerDown}>
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
        <div className="gtd-task__main">
          <div className="gtd-task__title">{task.title || '(sin título)'}</div>
          <div className="gtd-task__meta">
            {showProject && task.project && (
              <span className="gtd-meta gtd-meta--project">
                <i className="fas fa-project-diagram" /> {task.project.title}
              </span>
            )}
            {task.area && <span className="gtd-meta gtd-meta--area">{task.area}</span>}
            {task.tags.map((t) => (
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
  const [openKey, setOpenKey] = useState(null);
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

  const tasks = useMemo(() => buildTasks(scopedFiles, inboxPaths), [scopedFiles, inboxPaths]);
  const counts = useMemo(() => countsFor(tasks, { area }, today), [tasks, area, today]);
  const projects = useMemo(() => projectsOf(tasks, { area }), [tasks, area]);
  const allProjects = useMemo(() => projectsOf(tasks, {}), [tasks]);
  const areas = useMemo(() => areasOf(tasks), [tasks]);

  const baseList = useMemo(() => tasksForView(tasks, view, { area, text }, today), [
    tasks,
    view,
    area,
    text,
    today,
  ]);
  const facets = useMemo(() => facetsFor(baseList), [baseList]);
  const visible = useMemo(() => tasksForView(tasks, view, { area, text, ...filters }, today), [
    tasks,
    view,
    area,
    text,
    filters,
    today,
  ]);
  // ORG Mode para Eli: en Scheduled, los hábitos van siempre abajo, en su propia sección; en el
  // Logbook, secciones por fecha de cierre (esta semana, la pasada, el mes pasado, este año…)
  const splitHabits = view.id === 'scheduled';
  const rendered = useMemo(
    () =>
      splitHabits
        ? [...visible.filter((t) => !t.isHabit), ...visible.filter((t) => t.isHabit)]
        : visible,
    [visible, splitHabits]
  );
  const sectionStarts = useMemo(() => {
    const out = {};
    if (splitHabits) {
      const first = rendered.find((t) => t.isHabit);
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
  }, [rendered, splitHabits, view.id, today]);

  // ORG Mode para Eli: Logbook → terminadas sin archivar (todas, no solo las 300 que se ven) y
  // botones para archivarlas de una vez, en total o por sección
  const isLogbook = view.id === 'logbook';
  const archivable = useMemo(() => {
    if (!isLogbook) return { ok: [], blocked: [] };
    const f = { area, text, ...filters };
    const { ok, blocked } = archivableDone(tasks);
    return {
      ok: ok.filter((t) => matchesFilters(t, f)),
      blocked: blocked.filter((t) => matchesFilters(t, f)),
    };
  }, [isLogbook, tasks, area, text, filters]);
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
        '?\n\nSe moverán con sus subencabezados al fichero _archive de su fichero, como hace ' +
        'Emacs (org-archive-subtree).',
      okLabel: 'Archivar',
    });
    if (!ok) return;
    setOpenKey(null);
    await dispatch(eliArchiveMany(list.map((t) => ({ path: t.path, id: t.id }))));
  };
  const projectTask = view.type === 'project' ? tasks.find((t) => t.key === view.key) : null;

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
    return all.some((t) => t.toLowerCase() === INBOX_TAG) ? all : [...all, INBOX_TAG];
  }, [declaredTags]);

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
      dispatch(eliFollowOrgLink(target, task.path));
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
    setSideOpen(false);
  }, []);
  const selectArea = (a) => {
    setArea(a);
    writeLS(LS_AREA, a);
  };

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
  const openInFile = (task) => {
    dispatch(selectHeaderAndOpenParents(task.path, task.id, { widen: true }));
    dispatch(eliNarrowAndExpand(task.id));
    history.push(`/file${task.path}`);
  };

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
    const scheduled = view.id === 'scheduled' ? new Date(today.getTime() + 86400000) : null;
    const newId = dispatch(
      gtdAddTask(target, {
        title,
        list: list === 'focus' ? 'next' : list,
        area: area !== '*' && area !== '-' ? area : null,
        priority: view.id === 'focus' ? 'A' : null,
        scheduled,
        deadline: view.id === 'deadline' ? today : null,
        // Si Inbox no va a su fichero de entrada, se marca con @inbox para que se vea en Inbox
        tags:
          isInbox && !inboxPaths.includes(target.path)
            ? Array.from(new Set([...filters.tags, INBOX_TAG]))
            : filters.tags,
      })
    );
    setNewTitle('');
    // ORG Mode para Eli: la tarea nueva se abre en el editor para completar sus datos
    if (newId) setOpenKey(`${target.path}::${newId}`);
  };

  const addProject = () => {
    const title = newTitle.trim();
    if (!title) return;
    dispatch(
      gtdAddTask(
        { path: tasksFile },
        { title, list: 'project', area: area !== '*' && area !== '-' ? area : null }
      )
    );
    setNewTitle('');
  };

  const saveTask = (task, changes, projectKey) => {
    dispatch(gtdSaveTask(task, changes));
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
    }
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
    } else {
      dispatch(gtdSaveTask(task, { list: id, tags: tagsForList(task, id) }));
    }
  };
  const { onPointerDown, dragging, dropTarget, clickSuppressed } = useTaskDrag({
    onDrop: applyDrop,
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

  const title =
    view.type === 'project'
      ? projectTask
        ? projectTask.title
        : 'Proyecto'
      : ([...LISTS, ...EXTRA_LISTS].find((l) => l.id === view.id) || {}).label;

  const renderListItem = (l) => (
    <button
      key={l.id}
      data-drop={`list:${l.id}`}
      className={
        'gtd-side__item' +
        (view.id === l.id && view.type !== 'project' ? ' is-on' : '') +
        dropProps(`list:${l.id}`).className
      }
      onClick={() => selectView({ id: l.id })}
      data-testid={`gtd-list-${l.id}`}
    >
      <i className={l.icon + ' gtd-side__icon'} />
      <span className="gtd-side__label">{l.label}</span>
      {counts[l.id] > 0 && l.id !== 'logbook' && (
        <span className="gtd-side__count">{counts[l.id]}</span>
      )}
    </button>
  );

  const loading = pendingLoads;

  return (
    <div
      className={'gtd' + (sideOpen ? ' is-side-open' : '') + (dragging ? ' is-dragging' : '')}
      data-testid="gtd"
    >
      <aside className="gtd-side">
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
            placeholder="Buscar"
            data-testid="gtd-search"
          />
        </div>
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
        <nav className="gtd-side__lists">{LISTS.map(renderListItem)}</nav>
        <div className="gtd-side__section">
          <span>Proyectos</span>
          <button
            className="gtd-side__add"
            title="Nuevo proyecto (escribe el nombre en «Añadir» y pulsa aquí)"
            onClick={addProject}
          >
            +
          </button>
        </div>
        <nav className="gtd-side__projects">
          {projects.length === 0 && (
            <div className="gtd-side__empty">Sin proyectos (estado PROJECT)</div>
          )}
          {projects.map((p) => {
            const n = tasksForView(tasks, { type: 'project', key: p.key }, { area: '*' }, today)
              .length;
            return (
              <button
                key={p.key}
                data-drop={`project:${p.key}`}
                className={
                  'gtd-side__item gtd-side__item--project' +
                  (view.key === p.key ? ' is-on' : '') +
                  dropProps(`project:${p.key}`).className
                }
                onClick={() => selectView({ type: 'project', key: p.key })}
                data-testid="gtd-project"
              >
                <i className="fas fa-project-diagram gtd-side__icon" />
                <span className="gtd-side__label">{p.title}</span>
                {n > 0 && <span className="gtd-side__count">{n}</span>}
              </button>
            );
          })}
        </nav>
        <nav className="gtd-side__lists gtd-side__lists--extra">
          {EXTRA_LISTS.map(renderListItem)}
        </nav>
      </aside>

      <div className="gtd-scrim" onClick={() => setSideOpen(false)} />
      {/* ORG Mode para Eli: en el móvil, con el menú escondido, una pestaña pequeña a media
          altura del borde izquierdo lo vuelve a sacar */}
      <button
        type="button"
        className="gtd-side-tab"
        onClick={() => setSideOpen(true)}
        aria-label="Mostrar el menú"
        title="Mostrar el menú"
        data-testid="gtd-side-tab"
      >
        <i className="fas fa-chevron-right" />
      </button>

      <main className="gtd-main">
        <header className="gtd-main__head">
          <button className="gtd-main__menu" onClick={() => setSideOpen(true)} aria-label="Menú">
            <i className="fas fa-bars" />
          </button>
          <h1 className="gtd-main__title" data-testid="gtd-title">
            {title}
            <span className="gtd-main__count">{visible.length}</span>
          </h1>
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
          <button className="gtd-main__sync" onClick={syncAll} title="Sincronizar">
            <i className="fas fa-sync-alt" />
          </button>
        </header>

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
            <button className="gtd-btn gtd-btn--link" onClick={() => openInFile(projectTask)}>
              <i className="fas fa-external-link-alt" /> Abrir el proyecto en su fichero
            </button>
          </div>
        )}

        {view.id !== 'logbook' && view.id !== 'reference' && (
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
          <div className="gtd-archive-bar" data-testid="gtd-archive-bar">
            <span>
              {archivable.ok.length === 1
                ? '1 terminada sin archivar'
                : `${archivable.ok.length} terminadas sin archivar`}
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
              <i className="fas fa-archive" /> Archivar todas
            </button>
          </div>
        )}

        <div className="gtd-list">
          {loading && visible.length === 0 && <div className="gtd-empty">Cargando ficheros…</div>}
          {!loading && visible.length === 0 && (
            <div className="gtd-empty">
              {view.id === 'inbox' ? 'Inbox vacío. ¡Bien hecho!' : 'No hay nada aquí.'}
            </div>
          )}
          {rendered.map((task) => (
            <React.Fragment key={task.key}>
              {sectionStarts[task.key] && (
                <div
                  className="gtd-section"
                  data-testid={`gtd-section-${sectionStarts[task.key].id}`}
                >
                  <i className={sectionStarts[task.key].icon} /> {sectionStarts[task.key].label}
                  {isLogbook && (archivableBySection[sectionStarts[task.key].id] || []).length > 0 && (
                    <button
                      type="button"
                      className="gtd-section__action"
                      onClick={() =>
                        archiveTasks(
                          archivableBySection[sectionStarts[task.key].id],
                          sectionStarts[task.key].label
                        )
                      }
                      title="Archivar las terminadas de esta sección"
                      data-testid={`gtd-archive-section-${sectionStarts[task.key].id}`}
                    >
                      <i className="fas fa-archive" /> Archivar (
                      {archivableBySection[sectionStarts[task.key].id].length})
                    </button>
                  )}
                </div>
              )}
              <TaskRow
                task={task}
                open={openKey === task.key}
                onToggleOpen={() =>
                  !clickSuppressed() && setOpenKey(openKey === task.key ? null : task.key)
                }
                onPointerDown={onPointerDown(task)}
                isDragging={dragging === task.key}
                dispatch={dispatch}
                today={today}
                showProject={view.type !== 'project'}
              />
              {openKey === task.key && (
                <TaskEditor
                  key={task.key + task.header.hashCode() + ':' + editorRev}
                  task={task}
                  projects={allProjects.filter((p) => p.key !== task.key)}
                  areas={areas}
                  allTags={allTags}
                  contextTags={contextTags}
                  onOpenLink={(target) => openLink(task, target)}
                  onSave={(changes, projectKey) => saveTask(task, changes, projectKey)}
                  onClose={() => setOpenKey(null)}
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
                  onOpen={() => openInFile(task)}
                  onDelete={() => deleteTask(task)}
                  onArchive={() => {
                    setOpenKey(null);
                    dispatch(gtdArchiveTask(task));
                  }}
                  energyOptions={energyOptions}
                  effortOptions={effortOptions}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      </main>
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
