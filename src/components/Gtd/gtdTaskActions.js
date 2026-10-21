// ORG Mode para Eli (4.11): enlace propio, exportar (PDF y Org) y reloj de una tarea de GTD.
// Los usan el editor de la tarea y el menú de la fila.
import { shareContent, isWebShareSupported } from '../../lib/share_utils';
import { showMessage } from '../../lib/eli_prompt';
import { openPrintPreview } from '../EliTools';
import { gtdEnsureOrgId, gtdOrgText, gtdClockToggle } from '../../lib/gtd/gtd_actions';
import { taskLinkText, copyText } from '../../lib/gtd/gtd_tools';

// Copia [[id:…][Título]] (le pone :ID: si no lo tiene). Devuelve el aviso para mostrar.
export const copyTaskLink = (task) => async (dispatch) => {
  const text = taskLinkText(dispatch(gtdEnsureOrgId(task)), task.title);
  if (await copyText(text)) return 'Enlace de la tarea copiado';
  showMessage('Enlace de la tarea', text);
  return '';
};

// Tarea + notas + subtareas como texto Org: hoja de compartir del móvil o portapapeles
export const shareTaskOrg = (task) => async (dispatch) => {
  const text = dispatch(gtdOrgText(task));
  if (!text) return '';
  if (isWebShareSupported()) {
    const r = await shareContent({ title: task.title, text });
    return r && r.success ? '' : '';
  }
  if (await copyText(text)) return 'Tarea copiada como texto Org';
  showMessage(task.title, text);
  return '';
};

// Vista previa para guardar en PDF (con notas y subtareas)
export const exportTaskPdf = (task) => () => openPrintPreview(task.id, task.path);

export const toggleTaskClock = (task) => (dispatch) =>
  dispatch(gtdClockToggle(task)) ? 'Reloj en marcha' : 'Reloj parado';
