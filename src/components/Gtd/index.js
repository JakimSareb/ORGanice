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
} from '../../lib/gtd/gtd_model';
import {
  gtdSaveTask,
  gtdToggleDone,
  gtdToggleStar,
  gtdAddTask,
  gtdDeleteTask,
  gtdMoveToProject,
  gtdUndo,
  gtdRedo,
} from '../../lib/gtd/gtd_actions';
import { ActionCreators } from 'redux-undo';
import {
  loadFileQuietly,
  selectHeaderAndOpenParents,
  narrowHeader,
  sync,
  eliOfferDeleteAttachments,
} from '../../actions/org';
import { declaredTagsFromConfigLines } from '../../lib/gtd_contexts';
import { confirmRemoveHeader } from '../../lib/eli_confirm_remove';
import TaskEditor from './TaskEditor';
import Drawer from '../UI/Drawer';
import AgendaModal from '../OrgFile/components/AgendaModal';
import EliErrorBoundary from '../EliErrorBoundary';

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

function TaskRow({ task, open, onToggleOpen, dispatch, today, showProject }) {
  const due = task.deadline;
  const overdue = due && due < today;
  return (
    <div
      className={'gtd-task' + (open ? ' is-open' : '') + (task.isDone ? ' is-done' : '')}
      data-testid="gtd-task"
    >
      <div className="gtd-task__row" onClick={onToggleOpen}>
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
  const canUndo = useSelector(selectCanUndo);
  const canRedo = useSelector(selectCanRedo);

  const [view, setView] = useState(() => readLS(LS_VIEW, { id: 'focus' }));
  const [area, setArea] = useState(() => readLS(LS_AREA, '*'));
  const [filters, setFilters] = useState({ tags: [], energy: null, time: null, dated: false });
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
  const projectTask = view.type === 'project' ? tasks.find((t) => t.key === view.key) : null;

  const allTags = useMemo(() => {
    const declared = declaredTagsFromConfigLines(
      scopePaths.flatMap((p) => (files.getIn([p, 'fileConfigLines']) || List()).toArray())
    );
    const used = new Set();
    tasks.forEach((t) => t.ownTags.forEach((x) => used.add(x)));
    return Array.from(new Set([...declared, ...Array.from(used).sort()]));
  }, [tasks, files, scopePaths]);

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
    dispatch(narrowHeader(task.id));
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
    dispatch(
      gtdAddTask(target, {
        title,
        list: list === 'focus' ? 'next' : list,
        area: area !== '*' && area !== '-' ? area : null,
        priority: view.id === 'focus' ? 'A' : null,
        scheduled,
        deadline: view.id === 'deadline' ? today : null,
        tags: filters.tags,
      })
    );
    setNewTitle('');
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
    setOpenKey(null);
  };

  const deleteTask = async (task) => {
    const headers = files.getIn([task.path, 'headers']);
    if (await confirmRemoveHeader(headers, task.id)) {
      dispatch(gtdDeleteTask(task));
      setOpenKey(null);
      dispatch(eliOfferDeleteAttachments(headers, task.id, task.path));
    }
  };

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
      className={'gtd-side__item' + (view.id === l.id && view.type !== 'project' ? ' is-on' : '')}
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
    <div className={'gtd' + (sideOpen ? ' is-side-open' : '')} data-testid="gtd">
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
                className={
                  'gtd-side__item gtd-side__item--project' + (view.key === p.key ? ' is-on' : '')
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
            {facets.tags.map((t) => (
              <button
                key={t}
                className={'gtd-chip' + (filters.tags.includes(t) ? ' is-on' : '')}
                onClick={() => toggleTag(t)}
              >
                {t}
              </button>
            ))}
            {facets.energy.map((e) => (
              <button
                key={e}
                className={'gtd-chip gtd-chip--energy' + (filters.energy === e ? ' is-on' : '')}
                onClick={() => setFilters((f) => ({ ...f, energy: f.energy === e ? null : e }))}
              >
                <i className="fas fa-bolt" /> {e}
              </button>
            ))}
            {facets.hasEffort &&
              TIME_BUCKETS.map((b) => (
                <button
                  key={b.id}
                  className={'gtd-chip gtd-chip--time' + (filters.time === b.id ? ' is-on' : '')}
                  onClick={() => setFilters((f) => ({ ...f, time: f.time === b.id ? null : b.id }))}
                >
                  <i className="far fa-clock" /> {b.label}
                </button>
              ))}
            {facets.hasDates && (
              <button
                className={'gtd-chip' + (filters.dated ? ' is-on' : '')}
                onClick={() => setFilters((f) => ({ ...f, dated: !f.dated }))}
              >
                <i className="far fa-calendar-alt" /> Con fecha
              </button>
            )}
            {(filters.tags.length > 0 || filters.energy || filters.time || filters.dated) && (
              <button
                className="gtd-chip gtd-chip--clear"
                onClick={() => setFilters({ tags: [], energy: null, time: null, dated: false })}
              >
                × Quitar filtros
              </button>
            )}
          </div>
        )}

        <div className="gtd-list">
          {loading && visible.length === 0 && <div className="gtd-empty">Cargando ficheros…</div>}
          {!loading && visible.length === 0 && (
            <div className="gtd-empty">
              {view.id === 'inbox' ? 'Inbox vacío. ¡Bien hecho!' : 'No hay nada aquí.'}
            </div>
          )}
          {visible.map((task) => (
            <React.Fragment key={task.key}>
              <TaskRow
                task={task}
                open={openKey === task.key}
                onToggleOpen={() => setOpenKey(openKey === task.key ? null : task.key)}
                dispatch={dispatch}
                today={today}
                showProject={view.type !== 'project'}
              />
              {openKey === task.key && (
                <TaskEditor
                  key={task.key + task.header.hashCode()}
                  task={task}
                  projects={allProjects.filter((p) => p.key !== task.key)}
                  areas={areas}
                  allTags={allTags}
                  onSave={(changes, projectKey) => saveTask(task, changes, projectKey)}
                  onCancel={() => setOpenKey(null)}
                  onOpen={() => openInFile(task)}
                  onDelete={() => deleteTask(task)}
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
