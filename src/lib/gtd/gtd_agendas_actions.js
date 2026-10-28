// ORG Mode para Eli (4.50): «Llevar a reunión…» — mueve puntos de agendas.org (subcabeceras, con
// todo su contenido y subpuntos, conservando su :ID:) a una cabecera de reuniones.org. Vive en un
// fichero aparte porque junta el selector de eli_heading_links y los thunks de personas.
import { gtdRefileTo } from './gtd_actions';
import { pickRefileTarget } from '../eli_heading_links';
import { askConfirm, showMessage } from '../eli_prompt';
import { createPlainFile, loadFileQuietly } from '../../actions/org';
import { agendasPathFor, reunionesPathFor } from './gtd_persons_actions';

const isLoaded = (getState, path) => !!getState().org.present.getIn(['files', path, 'headers']);

/**
 * Llevar los puntos `headerIds` (de agendas.org) a reuniones.org: se elige la cabecera de destino
 * (o el nivel superior) y se mueven en un solo paso de Deshacer. Si reuniones.org no existe se
 * pregunta si crearlo. → nº de puntos movidos (0 = nada / cancelado)
 */
export const agendaToMeeting = (headerIds) => async (dispatch, getState) => {
  const ids = (headerIds || []).filter(Boolean);
  if (!ids.length) return 0;
  const from = agendasPathFor(getState());
  const to = reunionesPathFor(getState());
  if (!isLoaded(getState, to))
    await Promise.resolve(dispatch(loadFileQuietly(to))).catch(() => null);
  if (!isLoaded(getState, to)) {
    const ok = await askConfirm({
      title: 'Reuniones',
      message: `No se encuentra ${to}. ¿Crearlo?`,
      okLabel: 'Crear',
    });
    if (!ok || !(await dispatch(createPlainFile(to, '#+TITLE: Reuniones\n')))) return 0;
    await Promise.resolve(dispatch(loadFileQuietly(to))).catch(() => null);
    if (!isLoaded(getState, to)) return 0;
  }
  const target = await dispatch(
    pickRefileTarget({
      title:
        ids.length === 1 ? 'Llevar a la reunión…' : `Llevar ${ids.length} puntos a la reunión…`,
      onlyPath: to,
    })
  );
  if (!target) return 0;
  const n = dispatch(
    gtdRefileTo(
      ids.map((id) => ({ path: from, id, key: `${from}::${id}` })),
      target.path,
      target.headerId
    )
  );
  if (!n) showMessage('Reunión', 'No se ha podido llevar el punto.');
  return n;
};
