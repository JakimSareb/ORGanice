// ORG Mode para Eli (4.35): «Enviar a…» desde el editor de tarea de GTD. Mueve la cabecera (con
// sus subcabeceras) dentro de la cabecera o al nivel superior del fichero elegido (refile).
//   - Si la tarea estaba en un proyecto (dentro de él o enlazada) y el destino NO es un proyecto,
//     queda ENLAZADA a ese proyecto (:PROYECTO: [[id:…][Título]]): sale de su sitio pero no deja
//     de ser del proyecto. Enlaces siempre por ID. Si ya estaba enlazada, la propiedad viaja con ella.
//   - Si el destino es otro proyecto, la tarea pasa a ser suya (por estar dentro) y se quita el
//     enlace anterior (se «re-enlaza» al nuevo).
import { buildTasks, newOrgId, PROJECT_LINK_PROPERTY, projectLinkFor } from './gtd_model';
import { gtdRefileTo, gtdSaveMany, gtdUnassignProject } from './gtd_actions';

const isArchive = (p) => /\.org_archive$/i.test(p || '');

const loadedTasks = (state) =>
  buildTasks(
    state.org.present
      .get('files')
      .filter((f, p) => p && !p.startsWith('/__') && !isArchive(p) && f && f.get('headers')),
    []
  );

// Qué hay que hacer con el vínculo de proyecto antes de mover (función pura, para probarla):
//   { unlink: bool, link: proyecto|null }
export const sendPlan = (task, dest, tasks) => {
  const destIsProject = !!(dest && dest.isProject);
  if (destIsProject) return { unlink: !!task.projRefOwn, link: null };
  if (task.project && !task.projectExternal) {
    const project = tasks.find(
      (t) => t.isProject && t.path === task.project.path && t.id === task.project.id
    );
    if (project) return { unlink: false, link: project };
  }
  return { unlink: false, link: null };
};

// → { moved, linkedTo (título del proyecto o null) }
export const gtdSendTo = (task, targetPath, targetHeaderId = null) => (dispatch, getState) => {
  const tasks = loadedTasks(getState());
  const me = tasks.find((t) => t.path === task.path && t.id === task.id) || task;
  const dest = targetHeaderId
    ? tasks.find((t) => t.path === targetPath && t.id === targetHeaderId)
    : null;
  const plan = sendPlan(me, dest, tasks);
  if (plan.unlink) dispatch(gtdUnassignProject([me]));
  if (plan.link) {
    const entries = [];
    let orgId = plan.link.orgId;
    if (!orgId) {
      orgId = newOrgId();
      entries.push([plan.link, { props: { ID: orgId } }]);
    }
    entries.push([
      me,
      { props: { [PROJECT_LINK_PROPERTY]: projectLinkFor(orgId, plan.link.title) } },
    ]);
    dispatch(gtdSaveMany(entries));
  }
  const moved = dispatch(gtdRefileTo([me], targetPath, targetHeaderId));
  return { moved, linkedTo: moved && plan.link ? plan.link.title : null };
};
