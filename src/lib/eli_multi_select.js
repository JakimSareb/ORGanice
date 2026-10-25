// ORG Mode para Eli (4.28): selección de VARIAS cabeceras en Documentos.
//   Ordenador: Mayús+clic = rango (desde la seleccionada), Cmd/Ctrl+clic = sueltas.
//   Teléfono: mantener la viñeta y soltar sin moverla = empezar a seleccionar; luego cada toque
//   en una cabecera la añade o la quita. Esc o tocar fuera = deseleccionar.
// Con varias seleccionadas, la barra de abajo actúa sobre todas en UN solo paso de deshacer
// (ELI_BATCH). Aquí: el estado (fuera de Redux, como el candado) y el modelo puro (qué acciones
// hacer), que se prueba con jest (eli428).
import { useEffect, useState } from 'react';
import { List } from 'immutable';

import { toggledPriorityATitle, getPriority } from './eli_priority';
import { timestampForDate } from './timestamps';

// ---------- modelo puro ----------

const sid = (x) => String(x);

// Índice de cada id en el fichero
const indexMap = (headers) => {
  const m = new Map();
  (headers || List()).forEach((h, i) => m.set(sid(h.get('id')), i));
  return m;
};

// Ids reales (los del fichero) de los elegidos, en el orden del documento
export const orderedIds = (headers, ids) => {
  const want = new Set((ids || []).map(sid));
  const out = [];
  (headers || List()).forEach((h) => {
    if (want.has(sid(h.get('id')))) out.push(h.get('id'));
  });
  return out;
};

// Solo los de arriba: si se ha elegido también un antepasado, esa cabecera ya va con él
export const topIds = (headers, ids) => {
  const want = new Set((ids || []).map(sid));
  const out = [];
  let coverLevel = 0; // nivel del último elegido cuyo subárbol cubre lo que sigue
  (headers || List()).forEach((h) => {
    const lvl = h.get('nestingLevel');
    if (coverLevel && lvl > coverLevel) return;
    coverLevel = 0;
    if (want.has(sid(h.get('id')))) {
      out.push(h.get('id'));
      coverLevel = lvl;
    }
  });
  return out;
};

// Hermana anterior / siguiente (índice) o -1
const prevSibling = (headers, idx) => {
  const lvl = headers.get(idx).get('nestingLevel');
  for (let i = idx - 1; i >= 0; i--) {
    const l = headers.get(i).get('nestingLevel');
    if (l < lvl) return -1;
    if (l === lvl) return i;
  }
  return -1;
};
const nextSibling = (headers, idx) => {
  const lvl = headers.get(idx).get('nestingLevel');
  for (let i = idx + 1; i < headers.size; i++) {
    const l = headers.get(i).get('nestingLevel');
    if (l < lvl) return -1;
    if (l === lvl) return i;
  }
  return -1;
};

// Ids que el rango Mayús+clic abarca: entre `fromId` y `toId` en la lista `visible` (ids de las
// cabeceras que se ven, en orden)
export const rangeIds = (visible, fromId, toId) => {
  const list = (visible || []).map(sid);
  const a = list.indexOf(sid(fromId));
  const b = list.indexOf(sid(toId));
  if (b < 0) return [];
  if (a < 0) return [list[b]];
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return list.slice(lo, hi + 1);
};

// Cmd/Ctrl+clic: añade o quita
export const toggleId = (ids, id) => {
  const s = sid(id);
  const list = (ids || []).map(sid);
  return list.includes(s) ? list.filter((x) => x !== s) : [...list, s];
};

// Etiquetas: «a b -c» → añade a y b, quita c
export const parseTagEdit = (text) => {
  const add = [];
  const remove = [];
  String(text || '')
    .split(/[\s,:]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .forEach((t) => {
      if (t.startsWith('-')) {
        const x = t.slice(1).replace(/^#/, '');
        if (x) remove.push(x);
      } else add.push(t.replace(/^#/, ''));
    });
  return { add: add.filter(Boolean), remove };
};

/**
 * Acciones de Redux para hacer `op` sobre las cabeceras `ids` del fichero `headers`. Se meten
 * todas en un ELI_BATCH (un solo deshacer). ops:
 *   indent / outdent (con subárbol) · up / down · todo {keyword, logIntoDrawer} ·
 *   tags {add, remove} · priority · plan {type: SCHEDULED|DEADLINE, date} · remove
 */
export const multiActions = (headers, ids, op, args = {}) => {
  if (!headers || !ids || !ids.length) return [];
  const idx = indexMap(headers);
  const at = (id) => headers.get(idx.get(sid(id)));
  const all = orderedIds(headers, ids);
  const tops = topIds(headers, ids);
  const topSet = new Set(tops.map(sid));
  switch (op) {
    case 'indent': {
      // la primera de un grupo de hermanas sin hermana anterior no puede entrar (ni las que van
      // detrás de ella en el grupo)
      const out = [];
      const blocked = new Set();
      tops.forEach((id) => {
        const p = prevSibling(headers, idx.get(sid(id)));
        const pid = p < 0 ? null : sid(headers.get(p).get('id'));
        if (p < 0 || (topSet.has(pid) && blocked.has(pid))) {
          blocked.add(sid(id));
          return;
        }
        out.push({ type: 'MOVE_SUBTREE_RIGHT', headerId: id, dirtying: true });
      });
      return out;
    }
    case 'outdent':
      return tops
        .filter((id) => at(id).get('nestingLevel') > 1)
        .map((id) => ({ type: 'MOVE_SUBTREE_LEFT', headerId: id, dirtying: true }));
    case 'up': {
      const out = [];
      const blocked = new Set();
      tops.forEach((id) => {
        const p = prevSibling(headers, idx.get(sid(id)));
        const pid = p < 0 ? null : sid(headers.get(p).get('id'));
        if (p < 0 || (topSet.has(pid) && blocked.has(pid))) {
          blocked.add(sid(id));
          return;
        }
        out.push({ type: 'MOVE_HEADER_UP', headerId: id, dirtying: true });
      });
      return out;
    }
    case 'down': {
      const out = [];
      const blocked = new Set();
      [...tops].reverse().forEach((id) => {
        const n = nextSibling(headers, idx.get(sid(id)));
        const nid = n < 0 ? null : sid(headers.get(n).get('id'));
        if (n < 0 || (topSet.has(nid) && blocked.has(nid))) {
          blocked.add(sid(id));
          return;
        }
        out.push({ type: 'MOVE_HEADER_DOWN', headerId: id, dirtying: true });
      });
      return out;
    }
    case 'todo':
      return all
        .filter((id) => (at(id).getIn(['titleLine', 'todoKeyword']) || '') !== (args.keyword || ''))
        .map((id) => ({
          type: 'SET_TODO_STATE',
          headerId: id,
          newTodoState: args.keyword || '',
          logIntoDrawer: args.logIntoDrawer,
          dirtying: true,
          timestamp: args.timestamp || new Date(),
        }));
    case 'tags': {
      const add = args.add || [];
      const remove = new Set(args.remove || []);
      const out = [];
      all.forEach((id) => {
        const cur = at(id).getIn(['titleLine', 'tags']) || List();
        let next = cur.filter((t) => t && !remove.has(t));
        add.forEach((t) => {
          if (!next.includes(t)) next = next.push(t);
        });
        if (!next.equals(cur)) out.push({ type: 'SET_HEADER_TAGS', headerId: id, tags: next });
      });
      return out.map((a) => ({ ...a, dirtying: true }));
    }
    case 'priority': {
      // si todas tienen ★ se quita; si no, se pone a las que no la tienen
      const allA = all.every((id) => getPriority(at(id)) === 'A');
      return all
        .filter((id) => (getPriority(at(id)) === 'A') === allA)
        .map((id) => ({
          type: 'UPDATE_HEADER_TITLE',
          headerId: id,
          newRawTitle: toggledPriorityATitle(at(id)),
          dirtying: true,
        }));
    }
    case 'plan': {
      // sin esa fecha: se añade; con ella: cambia el día (se conserva la hora y el repetidor)
      const { type, date } = args;
      const t = timestampForDate(date);
      const out = [];
      all.forEach((id) => {
        const items = at(id).get('planningItems') || List();
        const i = items.findIndex((p) => p.get('type') === type);
        if (i < 0)
          out.push({
            type: 'ADD_NEW_PLANNING_ITEM',
            headerId: id,
            planningType: type,
            timestamp: date,
            dirtying: true,
          });
        else
          out.push({
            type: 'UPDATE_PLANNING_ITEM_TIMESTAMP',
            headerId: id,
            planningItemIndex: i,
            newTimestamp: items
              .getIn([i, 'timestamp'])
              .merge({ year: t.year, month: t.month, day: t.day, dayName: t.dayName }),
            dirtying: true,
          });
      });
      return out;
    }
    case 'remove':
      return tops.map((id) => ({ type: 'REMOVE_HEADER', headerId: id, dirtying: true }));
    default:
      return [];
  }
};

// Varias acciones en un solo paso de deshacer
export const batchOf = (actions) =>
  !actions.length
    ? null
    : actions.length === 1
    ? actions[0]
    : { type: 'ELI_BATCH', actions, dirtying: true };

// ---------- estado (fuera de Redux) ----------

let state = { ids: [], touch: false };
const listeners = new Set();

const esc = (s) =>
  typeof window !== 'undefined' && window.CSS && window.CSS.escape ? window.CSS.escape(s) : s;

// Las elegidas se marcan con una regla CSS (no se toca el componente de cada cabecera)
const paint = () => {
  if (typeof document === 'undefined') return;
  let el = document.getElementById('eli-multi-style');
  if (!el) {
    el = document.createElement('style');
    el.id = 'eli-multi-style';
    document.head.appendChild(el);
  }
  el.textContent = state.ids.length
    ? state.ids
        .map((id) => `.header-list-container .header[data-header-id="${esc(id)}"]`)
        .join(',\n') + ' { background: var(--eli-multi-bg, rgba(38, 139, 210, 0.16)); }'
    : '';
  document.body.classList.toggle('eli-multi-on', state.ids.length > 0);
};

export const getMulti = () => state;
export const isMultiActive = () => state.ids.length > 1 || (state.touch && state.ids.length > 0);

export const setMulti = (ids, touch = state.touch) => {
  const list = Array.from(new Set((ids || []).map(sid)));
  state = { ids: list, touch: list.length ? !!touch : false };
  paint();
  listeners.forEach((l) => l(state));
};
export const clearMulti = () => {
  if (state.ids.length || state.touch) setMulti([], false);
};

export const subscribeMulti = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const useMulti = () => {
  const [v, setV] = useState(state);
  useEffect(() => subscribeMulti(setV), []);
  return v;
};

// Ids de las cabeceras que se ven ahora, en orden
export const visibleHeaderIds = () =>
  typeof document === 'undefined'
    ? []
    : Array.from(
        document.querySelectorAll('.header-list-container .header[data-header-id]')
      ).map((el) => el.getAttribute('data-header-id'));
