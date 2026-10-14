// ORG Mode para Eli (3.06): en Documentos, al terminar una tarea (DONE, CANCELLED…) que tiene
// subtareas abiertas (con palabra de estado sin terminar, a cualquier profundidad) se pregunta
// «¿Marcar también las subtareas como hechas?» (Sí, todas / Solo esta / Cancelar). Solo mira los
// cambios de estado de la vista de documentos (SET_TODO_STATE / ADVANCE_TODO_STATE sueltos); la
// vista GTD pregunta por su cuenta. Las tareas que se repiten (vuelven a abrirse) no preguntan.
import { List } from 'immutable';

import { askChoice } from '../lib/eli_prompt';
import { subheadersOfHeaderWithId, todoKeywordSetForKeyword } from '../lib/org_utils';

const fileOf = (state) => {
  const path = state.org.present.get('path');
  return path ? state.org.present.getIn(['files', path]) : null;
};

const doneSetOf = (file) => {
  const out = new Set();
  (file.get('todoKeywordSets') || List()).forEach((set) =>
    (set.get('completedKeywords') || List()).forEach((k) => out.add(k))
  );
  return out;
};

// Palabra que tendrá el encabezado tras la acción (null si no se sabe)
const nextKeyword = (file, header, action) => {
  if (action.type === 'SET_TODO_STATE') return action.newTodoState || '';
  const current = header.getIn(['titleLine', 'todoKeyword']);
  const set = todoKeywordSetForKeyword(file.get('todoKeywordSets'), current);
  if (!set) return null;
  const kws = set.get('keywords');
  return kws.get(kws.indexOf(current) + 1) || '';
};

const hasRepeater = (header) =>
  (header.get('planningItems') || List()).some((p) => !!p.getIn(['timestamp', 'repeaterType']));

// La palabra de terminada para una subtarea: la misma si su conjunto la tiene; si no, la
// primera de terminadas de su conjunto
const doneKeywordFor = (file, header, wanted) => {
  const set = todoKeywordSetForKeyword(
    file.get('todoKeywordSets'),
    header.getIn(['titleLine', 'todoKeyword'])
  );
  const completed = set ? set.get('completedKeywords') || List() : List();
  if (!completed.size || completed.includes(wanted)) return wanted;
  return completed.first();
};

export const openSubheaders = (file, headerId) => {
  const headers = file.get('headers') || List();
  const done = doneSetOf(file);
  return subheadersOfHeaderWithId(headers, headerId).filter((h) => {
    const kw = h.getIn(['titleLine', 'todoKeyword']);
    return !!kw && !done.has(kw);
  });
};

export default ({ getState, dispatch }) => (next) => (action) => {
  if (
    !action ||
    typeof action !== 'object' ||
    (action.type !== 'SET_TODO_STATE' && action.type !== 'ADVANCE_TODO_STATE') ||
    action.eliSubtasksAsked
  ) {
    return next(action);
  }
  const state = getState();
  const file = fileOf(state);
  if (!file) return next(action);
  const id = action.headerId || file.get('selectedHeaderId');
  const header = (file.get('headers') || List()).find((h) => h.get('id') === id);
  if (!header || hasRepeater(header)) return next(action);
  const done = doneSetOf(file);
  const before = header.getIn(['titleLine', 'todoKeyword']);
  const after = nextKeyword(file, header, action);
  if (!after || !done.has(after) || done.has(before)) return next(action);
  const subs = openSubheaders(file, id);
  if (!subs.size) return next(action);
  askChoice({
    title: 'Subtareas',
    message: `¿Marcar también las subtareas como hechas? (${
      subs.size === 1 ? '1 abierta' : `${subs.size} abiertas`
    })`,
    choices: [
      { id: 'one', label: 'Solo esta' },
      { id: 'all', label: 'Sí, todas' },
    ],
  }).then((what) => {
    if (!what) return;
    if (what === 'all') {
      // de abajo arriba: así los contadores [n/m] de cada padre quedan bien
      subs.reverse().forEach((h) =>
        dispatch({
          type: 'SET_TODO_STATE',
          headerId: h.get('id'),
          newTodoState: doneKeywordFor(file, h, after),
          logIntoDrawer: action.logIntoDrawer,
          dirtying: true,
          timestamp: new Date(),
          eliSubtasksAsked: true,
        })
      );
    }
    dispatch({ ...action, eliSubtasksAsked: true });
  });
  return undefined;
};
