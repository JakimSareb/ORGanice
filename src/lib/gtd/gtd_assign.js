// ORG Mode para Eli (3.01): asignar tareas o referencias de cualquier fichero a un proyecto
// («:PROYECTO: [[id:UUID][Título]]»), con un buscador de proyectos. Se usa desde la vista GTD y
// desde Documentos (menú ⋯ de un encabezado / barra de acciones).
import { List } from 'immutable';
import { askPick, askChoice, showMessage } from '../eli_prompt';
import { fileDisplayName } from '../eli_app_name';
import { buildTasks, projectsOf, projectState } from './gtd_model';
import { gtdAssignProject, gtdUnassignProject } from './gtd_actions';
import { loadFileQuietly } from '../../actions/org';

const isArchive = (p) => /\.org_archive$/i.test(p || '');

// Proyectos para elegir: los activos primero, después los programados y los dormidos
export const projectPickItems = (projects, exclude = []) => {
  const order = { active: 0, scheduled: 1, sleep: 2 };
  const label = { scheduled: ' (programado)', sleep: ' (dormido)' };
  return projects
    .filter((p) => !exclude.includes(p.key))
    .map((p) => ({ p, st: projectState(p) }))
    .sort((a, b) => order[a.st] - order[b.st] || a.p.title.localeCompare(b.p.title))
    .map(({ p, st }) => ({
      id: p.key,
      label: `${p.title}${label[st] || ''}`,
      hint: fileDisplayName(p.path),
    }));
};

export const pickProject = async (projects, { title = 'Asignar a proyecto', message = '', exclude = [] } = {}) => {
  const id = await askPick({
    title,
    message,
    placeholder: 'Buscar proyecto…',
    items: projectPickItems(projects, exclude),
    emptyText: 'No hay proyectos (encabezados con estado PROJECT).',
  });
  return id ? projects.find((p) => p.key === id) || null : null;
};

// Ficheros de la vista GTD (los de la agenda y los de arranque, y tasks.org/inbox.org)
const gtdPaths = (state) => {
  const paths = new Set(['/tasks.org', '/inbox.org']);
  (state.org.present.get('fileSettings') || List()).forEach((s) => {
    if (s.get('path') && (s.get('includeInAgenda') || s.get('loadOnStartup'))) paths.add(s.get('path'));
  });
  return Array.from(paths);
};

const loadedTasks = (state) => {
  const files = state.org.present
    .get('files')
    .filter((f, p) => p && !p.startsWith('/__') && !isArchive(p) && f && f.get('headers'));
  return buildTasks(files, []);
};

// Desde Documentos: el encabezado (path, headerId) a un proyecto, o quitarle el proyecto
export const eliAssignHeaderToProject = (path, headerId) => async (dispatch, getState) => {
  await Promise.all(
    gtdPaths(getState()).map((p) => Promise.resolve(dispatch(loadFileQuietly(p))).catch(() => null))
  );
  const tasks = loadedTasks(getState());
  const task = tasks.find((t) => t.path === path && t.id === headerId);
  if (!task) return;
  if (task.isProject) {
    showMessage('Asignar a proyecto', 'Este encabezado ya es un proyecto.');
    return;
  }
  const projects = projectsOf(tasks);
  if (task.projRefOwn) {
    const what = await askChoice({
      title: 'Proyecto',
      message: task.project
        ? `«${task.title}» está asignado a «${task.project.title}».`
        : `«${task.title}» tiene asignado un proyecto que no se encuentra.`,
      choices: [
        { id: 'other', label: 'Asignar a otro proyecto…' },
        { id: 'remove', label: 'Quitar del proyecto' },
      ],
    });
    if (!what) return;
    if (what === 'remove') {
      dispatch(gtdUnassignProject([task]));
      return;
    }
  }
  const project = await pickProject(projects, {
    message: `«${task.title}»`,
    exclude: task.project ? [`${task.project.path}::${task.project.id}`] : [],
  });
  if (project) dispatch(gtdAssignProject([task], project));
};
