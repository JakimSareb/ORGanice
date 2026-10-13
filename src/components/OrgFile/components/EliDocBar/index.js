// ORG Mode para Eli (3.02): es la ÚNICA barra de Documentos. En el ordenador no se desliza: los
// iconos que no caben pasan solos al ⋯ (los últimos primero). En el teléfono es una píldora
// flotante que se desliza a los lados, separada del borde de abajo (en el iPhone, deslizar abajo
// del todo cambia de app). Los submenús (estado, Aa, fechas, enlace, adjuntos, ⋯) son un menú
// vertical encima del botón. Con el candado (modo lectura) solo hay acciones que no editan, y
// mientras se edita una tabla salen sus botones (filas y columnas).
// ORG Mode para Eli (3.01): barra de acciones de Documentos, al estilo de Logseq. Una sola fila de
// iconos (desplazable a los lados, siempre en el mismo orden) con todo a dos toques como mucho:
//   ← → sangrar · ↑ ↓ mover · TODO (cicla; mantener = otro conjunto) · ★ · 📅 Fechas › · # ·
//   [Aa › editando] · 🔗 Enlace › · 📎 › · ＋ (mantener = duplicar) · ⋯ › · ↶ ↷ · [⌨↓ editando]
// Sale FIJA ABAJO al seleccionar un encabezado (tocarlo solo lo selecciona) y desaparece al
// quitar la selección; mientras se edita el título o la descripción, la misma barra sube encima
// del teclado (visualViewport). Los submenús son una fila de chips (icono + texto) con ← para
// volver. «/» en el texto que se edita abre un buscador con todas las acciones.
// Sustituye a los iconos que salían dentro del encabezado (y a su ⋯), a los botones de subir y
// sangrar del editor de título y a la barra de formato «Aa» plegada.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Map as IMap } from 'immutable';
import { ActionCreators as undoActions } from 'redux-undo';

import * as orgActions from '../../../../actions/org';
import * as baseActions from '../../../../actions/base';
import { getCurrentTimestampAsText, getCurrentTimestamp } from '../../../../lib/timestamps';
import { storeHeadingLink } from '../../../../lib/eli_org_links';
import { taskStateOf, clockTotals, formatMillis } from '../../../../lib/eli_task_state';
import { attachmentsOfHeader } from '../../../../lib/eli_attachments';
import { confirmRemoveHeader } from '../../../../lib/eli_confirm_remove';
import { insertLinkInto } from '../../../../lib/eli_links';
import { showMessage, askPick } from '../../../../lib/eli_prompt';
import { getPriority } from '../../../../lib/eli_priority';
import { shareContent } from '../../../../lib/share_utils';
import { exportHeaderWithSubheaders } from '../../../../lib/export_org';
import { ORG_EMPHASIS } from '../../../../lib/eli_format';
import { eliAssignHeaderToProject } from '../../../../lib/gtd/gtd_assign';
import {
  openPrintPreview,
  openUploadDialog,
  openRawEditor,
  insertIntoField,
} from '../../../EliTools';
import { applyEmphasis, applyList } from '../../../EliFormatBar';

import { subscribeActiveTable, getActiveTable } from '../../../../lib/eli_table_focus';
import { useDocLock, toggleDocLock } from '../../../../lib/eli_doc_lock';
import './stylesheet.css';

const isCoarse = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia &&
  window.matchMedia('(pointer: coarse)').matches;

// Campo de texto que se está editando (título, descripción o nota)
const TITLE_SEL = '.title-line__edit-container textarea';
const DESC_SEL = '.header-content__edit-container textarea, textarea.eli-note-textarea';
const activeField = () => document.querySelector(`${TITLE_SEL}, ${DESC_SEL}`);
const isListField = (el) => !!el && el.matches && el.matches(DESC_SEL);

// Pulsación larga (dedo o ratón): onLong a los 550 ms; si no, onClick al soltar
const useLongPress = () => {
  const timer = useRef(null);
  const fired = useRef(false);
  return (onClick, onLong) => ({
    onPointerDown: (e) => {
      if (!onLong) return;
      fired.current = false;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        fired.current = true;
        if (navigator.vibrate) {
          try {
            navigator.vibrate(15);
          } catch (err) {}
        }
        onLong(e);
      }, 550);
    },
    onPointerUp: () => clearTimeout(timer.current),
    onPointerLeave: () => clearTimeout(timer.current),
    onPointerCancel: () => clearTimeout(timer.current),
    onContextMenu: (e) => onLong && e.preventDefault(),
    onClick: (e) => {
      if (onLong && fired.current) {
        fired.current = false;
        return;
      }
      onClick && onClick(e);
    },
  });
};

export default function EliDocBar({ editing = false, commitEditing = null, hidden = false }) {
  const dispatch = useDispatch();
  const path = useSelector((s) => s.org.present.get('path'));
  const file = useSelector((s) =>
    s.org.present.getIn(['files', s.org.present.get('path')], IMap())
  );
  const headerId = file.get('selectedHeaderId');
  const headers = file.get('headers');
  const header = headerId && headers ? headers.find((h) => h.get('id') === headerId) : null;
  const todoKeywordSets = file.get('todoKeywordSets');
  const narrowedId = file.get('narrowedHeaderId');
  const logIntoDrawer = useSelector((s) => s.base.get('shouldLogIntoDrawer'));
  const canUndo = useSelector((s) => s.org.past.length > 0);
  const canRedo = useSelector((s) => s.org.future.length > 0);
  const [sub, setSub] = useState(null); // submenú abierto (id)
  const [bottom, setBottom] = useState(0);
  const press = useLongPress();
  const locked = useDocLock();
  const [table, setTable] = useState(getActiveTable());
  useEffect(() => subscribeActiveTable(setTable), []);
  const [coarse, setCoarse] = useState(isCoarse());
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia('(pointer: coarse)');
    const on = () => setCoarse(mq.matches);
    if (mq.addEventListener) mq.addEventListener('change', on);
    return () => mq.removeEventListener && mq.removeEventListener('change', on);
  }, []);
  // ordenador: cuántos botones caben (el resto va al ⋯)
  const [fit, setFit] = useState(Infinity);
  const rowRef = useRef(null);
  const widths = useRef({});
  const anchorRef = useRef(null);

  const visible = !hidden && (!!header || !!table);

  // Encima del teclado (visualViewport): lo que tapa el teclado por abajo
  useLayoutEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const update = () => {
      const covered = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
      setBottom(covered > 40 ? covered : 0);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  // Margen abajo (para no tapar el último encabezado ni lo de abajo del editor)
  useEffect(() => {
    const body = document.body;
    body.classList.toggle('eli-docbar-on', visible);
    body.classList.toggle('eli-docbar-editing', visible && editing);
    return () => {
      body.classList.remove('eli-docbar-on');
      body.classList.remove('eli-docbar-editing');
    };
  }, [visible, editing]);

  // Tocar en el hueco (fuera de los encabezados, de la barra y de las ventanas) quita la selección
  useEffect(() => {
    if (!visible || editing) return undefined;
    const onClick = (e) => {
      const t = e.target;
      if (!t || !t.closest || !t.isConnected) return;
      if (
        t.closest(
          '.header, .eli-docbar, .drawer-outer-container, .eli-prompt__overlay, .header-bar, ' +
            '.eli-more-menu, .eli-palette__overlay, .eli-cal__overlay, .action-drawer-container, ' +
            '.dirty-indicator, .org-file__parsing-error-message, a, button, input, textarea, select'
        )
      )
        return;
      if (!t.closest('.org-file-container') && t !== document.body && !t.closest('.App, #root'))
        return;
      dispatch(orgActions.selectHeader(null));
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [visible, editing, dispatch]);

  // Al cambiar de encabezado o de modo, se cierra el submenú
  useEffect(() => setSub(null), [headerId, editing, locked, !!table]);

  const id = header ? header.get('id') : null;
  const org = (name, ...args) => dispatch(orgActions[name](...args));
  const base = (name, ...args) => dispatch(baseActions[name](...args));
  // Las acciones sobre el encabezado guardan antes lo que se esté escribiendo (y cierran el editor)
  const commit = () => {
    if (editing && commitEditing) commitEditing();
  };
  const run = (fn, { text = false } = {}) => (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (!text) commit();
    setSub(null);
    fn(e);
  };

  // --- acciones ---
  const level = header ? header.get('nestingLevel') : 1;
  const st = header ? taskStateOf(header, todoKeywordSets) : { kind: 'none' };
  const keyword = header ? header.getIn(['titleLine', 'todoKeyword']) : null;
  const hasClock =
    !!header &&
    header
      .get('logBookEntries')
      .filter((entry) => entry.get('raw') === undefined)
      .some((entry) => !entry.get('end'));
  const attachments = header && path ? attachmentsOfHeader(header, path) : [];

  // (3.02) estados del fichero (#+TODO / #+SEQ_TODO; sin línea, los de Ajustes), por conjunto
  const todoMenu = () => {
    const out = [];
    const seen = new Set();
    (todoKeywordSets || []).forEach((set, si) => {
      const done = set.get('completedKeywords') || [];
      (set.get('keywords') || []).forEach((kw) => {
        if (!kw || seen.has(kw)) return;
        seen.add(kw);
        const isDone = done.includes(kw);
        out.push({
          id: `st-${kw}`,
          label: kw,
          icon: isDone ? 'far fa-check-square' : 'far fa-square',
          current: kw === keyword,
          group: si,
          done: isDone,
          onClick: () => kw !== keyword && org('setTodoState', id, kw, logIntoDrawer),
        });
      });
    });
    out.push({
      id: 'st-none',
      label: 'Sin estado',
      icon: 'fas fa-minus',
      current: !keyword,
      group: 'none',
      onClick: () => keyword && org('setTodoState', id, '', logIntoDrawer),
    });
    return out;
  };
  const planning = (type) => {
    const idx = header.get('planningItems', []).findIndex((p) => p.get('type') === type);
    base('activatePopup', type === 'DEADLINE' ? 'deadline-editor' : 'scheduled-editor', {
      headerId: id,
      planningItemIndex: idx,
    });
    org('openHeader', id);
  };
  const insertDate = () => {
    const stamp = getCurrentTimestampAsText({ isActive: false });
    const field = activeField();
    if (field) insertIntoField(field, stamp, field.selectionStart, field.selectionEnd);
    else org('insertInactiveDate', id);
  };
  const insertLink = () => {
    const field = activeField();
    if (field) {
      insertLinkInto(field, insertIntoField);
      return;
    }
    // sin editar: se abre la descripción y el enlace va en ella
    org('openHeader', id);
    base('activatePopup', 'description-editor');
    setTimeout(() => insertLinkInto(activeField(), insertIntoField), 120);
  };
  const copyLink = async () => {
    const text = storeHeadingLink(path, header.getIn(['titleLine', 'rawTitle']));
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch (e) {}
    showMessage(
      copied ? 'Enlace copiado' : 'Enlace',
      (copied ? 'Pégalo donde quieras. ' : 'No se ha podido copiar; cópialo a mano:\n\n') +
        `${text}\n\nCon el botón de enlace del editor se inserta con la ruta correcta desde cualquier fichero.`
    );
  };
  const attach = () => {
    const field = activeField();
    const target = field
      ? { el: field, start: field.selectionStart, end: field.selectionEnd }
      : null;
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const files = Array.from(input.files || []);
      input.remove();
      if (files.length) openUploadDialog({ files, headerId: id, target, source: 'attach' });
    });
    document.body.appendChild(input);
    input.click();
  };
  const clockInOut = () => {
    const logBook = header.get('logBookEntries', []);
    const open = logBook.findIndex((entry) => entry.get('end') === null);
    const now = getCurrentTimestamp({ isActive: false, withStartTime: true });
    if (open !== -1) org('setLogEntryStop', id, logBook.getIn([open, 'id']), now);
    else org('createLogEntryStart', id, now);
  };
  const clockReport = () => {
    const t = clockTotals(headers, id);
    if (!t) {
      showMessage('Tiempo registrado', 'Este encabezado no tiene tiempo registrado.');
      return;
    }
    const title = (header.getIn(['titleLine', 'rawTitle']) || '').trim();
    showMessage(
      'Tiempo registrado',
      `«${title}»\n\nTotal: ${formatMillis(t.total)}` +
        (t.subheaders
          ? `\n(este encabezado: ${formatMillis(t.own)}; subencabezados: ${formatMillis(
              t.total - t.own
            )})`
          : '') +
        (t.running ? '\n\nIncluye un reloj en marcha.' : '')
    );
  };
  const share = () => {
    const titleLine = header.get('titleLine');
    const kw = titleLine.get('todoKeyword');
    const title = titleLine.get('rawTitle').trim();
    shareContent({
      title: kw ? `${kw} ${title}` : title,
      text: exportHeaderWithSubheaders(header, headers, {
        includeSubheaders: true,
        recursive: true,
        includeTitle: true,
        dontIndent: false,
      }),
    });
  };
  const remove = () => {
    const before = headers;
    confirmRemoveHeader(before, id).then((ok) => {
      if (!ok) return;
      org('selectNextSiblingHeader', id);
      org('removeHeader', id);
      org('eliOfferDeleteAttachments', before, id);
    });
  };
  const undo = () => dispatch(undoActions.undo());
  const redo = () => dispatch(undoActions.redo());
  const hideKeyboard = () => {
    const el = document.activeElement;
    if (el && el.blur) el.blur();
  };
  const fieldNow = () => activeField();

  // Submenús: [{ id, icon, label, onClick, text, danger }]
  const subs = header
    ? {
        dates: [
          {
            id: 'sched',
            icon: 'far fa-calendar-check',
            label: 'Programada',
            onClick: () => planning('SCHEDULED'),
          },
          {
            id: 'dead',
            icon: 'fas fa-calendar-check',
            label: 'Fecha límite',
            onClick: () => planning('DEADLINE'),
          },
          {
            id: 'insert',
            icon: 'far fa-calendar-plus',
            label: 'Insertar fecha',
            onClick: insertDate,
            text: true,
          },
          {
            id: 'repeat',
            icon: 'fas fa-redo-alt',
            label: 'Repetir…',
            onClick: () => planning('SCHEDULED'),
          },
        ],
        format: [
          ...ORG_EMPHASIS.map((it) => ({
            id: `fmt-${it.id}`,
            icon: it.icon,
            label:
              {
                bold: 'Negrita',
                italic: 'Cursiva',
                underline: 'Subrayado',
                strike: 'Tachado',
                code: 'Código',
                verbatim: 'Verbatim',
              }[it.id] || it.title,
            hint: `${it.marker}texto${it.marker}`,
            text: true,
            onClick: () => applyEmphasis(fieldNow(), it.marker),
          })),
          { id: 'fmt-link', icon: 'fas fa-link', label: 'Enlace', text: true, onClick: insertLink },
          ...(isListField(fieldNow())
            ? [
                ['dash', 'Lista', 'fas fa-list-ul'],
                ['num', 'Lista numerada', 'fas fa-list-ol'],
                ['check', 'Casilla', 'far fa-check-square'],
              ].map(([kind, label, icon]) => ({
                id: `list-${kind}`,
                icon,
                label,
                text: true,
                onClick: () => applyList(fieldNow(), kind),
              }))
            : []),
        ],
        todo: todoMenu(),
        link: [
          {
            id: 'link-insert',
            icon: 'fas fa-link',
            label: 'Insertar enlace',
            onClick: insertLink,
            text: true,
          },
          ...(path && !path.startsWith('/__')
            ? [{ id: 'link-copy', icon: 'far fa-copy', label: 'Copiar enlace', onClick: copyLink }]
            : []),
        ],
        attach: [
          {
            id: 'att-add',
            icon: 'fas fa-paperclip',
            label: 'Adjuntar archivo',
            onClick: attach,
            text: true,
          },
          ...(attachments.length
            ? [
                {
                  id: 'att-del',
                  icon: 'fas fa-trash-alt',
                  label: 'Borrar adjuntos…',
                  onClick: () => org('eliDeleteHeaderAttachments', id),
                },
              ]
            : []),
        ],
        more: [
          {
            id: 'clock',
            icon: hasClock ? 'fas fa-hourglass-end' : 'fas fa-hourglass-start',
            label: hasClock ? 'Parar reloj' : 'Iniciar reloj',
            onClick: clockInOut,
          },
          {
            id: 'clock-total',
            icon: 'far fa-clock',
            label: 'Tiempo registrado',
            onClick: clockReport,
          },
          {
            id: 'note',
            icon: 'far fa-sticky-note',
            label: 'Nota',
            onClick: () => base('activatePopup', 'note-editor'),
          },
          {
            id: 'props',
            icon: 'fas fa-list',
            label: 'Propiedades',
            onClick: () => base('activatePopup', 'property-list-editor'),
          },
          {
            id: 'refile',
            icon: 'fas fa-file-export',
            label: 'Mover (refile)',
            onClick: () => base('activatePopup', 'refile'),
          },
          ...(path && !path.startsWith('/__')
            ? [
                {
                  id: 'assign',
                  icon: 'fas fa-project-diagram',
                  label: 'Asignar a proyecto…',
                  onClick: () => dispatch(eliAssignHeaderToProject(path, id)),
                },
              ]
            : []),
          {
            id: 'archive',
            icon: 'fas fa-archive',
            label: 'Archivar',
            onClick: () => org('archiveSubtree', id),
          },
          {
            id: 'dup',
            icon: 'far fa-clone',
            label: 'Duplicar',
            onClick: () => org('duplicateHeader', id),
          },
          ...(st.kind === 'active'
            ? [
                {
                  id: 'done',
                  icon: 'far fa-check-square',
                  label: 'Hecha',
                  onClick: () => org('setTodoState', id, st.doneKeyword, logIntoDrawer),
                },
                {
                  id: 'cancel',
                  icon: 'far fa-window-close',
                  label: 'Cancelada',
                  onClick: () => org('setTodoState', id, st.cancelKeyword, logIntoDrawer),
                },
              ]
            : []),
          narrowedId === id
            ? {
                id: 'widen',
                icon: 'fas fa-expand',
                label: 'Ver todo (widen)',
                onClick: () => org('widenHeader'),
              }
            : {
                id: 'narrow',
                icon: 'fas fa-compress',
                label: 'Reducir (narrow)',
                onClick: () => org('narrowHeader', id),
              },
          {
            id: 'plain',
            icon: 'fas fa-code',
            label: 'Texto plano',
            onClick: () => {
              org('narrowHeader', id);
              openRawEditor(id);
            },
          },
          { id: 'mail', icon: 'fas fa-share', label: 'Correo', onClick: share },
          { id: 'pdf', icon: 'fas fa-file-pdf', label: 'PDF', onClick: () => openPrintPreview(id) },
          { id: 'delete', icon: 'fas fa-trash', label: 'Borrar', onClick: remove, danger: true },
        ],
      }
    : {};

  // Fila principal (orden fijo)
  const main = header
    ? [
        {
          id: 'outdent',
          icon: 'fas fa-arrow-left',
          title: 'Sangrar hacia fuera (mantener: con sus subencabezados)',
          onClick: () => level > 1 && org('moveHeaderLeft', id),
          onLong: () => level > 1 && org('moveSubtreeLeft', id),
        },
        {
          id: 'indent',
          icon: 'fas fa-arrow-right',
          title: 'Sangrar hacia dentro (mantener: con sus subencabezados)',
          onClick: () => org('moveHeaderRight', id),
          onLong: () => org('moveSubtreeRight', id),
        },
        {
          id: 'up',
          icon: 'fas fa-arrow-up',
          title: 'Subir',
          onClick: () => org('moveHeaderUp', id),
        },
        {
          id: 'down',
          icon: 'fas fa-arrow-down',
          title: 'Bajar',
          onClick: () => org('moveHeaderDown', id),
        },
        {
          id: 'todo',
          label: keyword || 'TODO',
          dim: !keyword,
          title: 'Estado',
          sub: 'todo',
        },
        {
          id: 'star',
          icon: getPriority(header) === 'A' ? 'fas fa-star' : 'far fa-star',
          on: getPriority(header) === 'A',
          title: 'Prioridad A (★)',
          onClick: () => org('togglePriorityA', id),
        },
        { id: 'dates', icon: 'far fa-calendar-alt', title: 'Fechas', sub: 'dates' },
        {
          id: 'tags',
          icon: 'fas fa-hashtag',
          title: 'Etiquetas',
          onClick: () => base('activatePopup', 'tags-editor'),
        },
        ...(editing ? [{ id: 'format', label: 'Aa', title: 'Formato', sub: 'format' }] : []),
        { id: 'link', icon: 'fas fa-link', title: 'Enlace', sub: 'link' },
        { id: 'attach', icon: 'fas fa-paperclip', title: 'Adjuntos', sub: 'attach' },
        {
          id: 'new',
          icon: 'fas fa-plus',
          title: 'Encabezado nuevo debajo (mantener: duplicar)',
          onClick: () => org('addHeaderAndEdit', id),
          onLong: () => org('duplicateHeader', id),
        },
        { id: 'more', icon: 'fas fa-ellipsis-h', title: 'Más', sub: 'more' },
        { id: 'undo', icon: 'fas fa-undo', title: 'Deshacer', onClick: undo, disabled: !canUndo },
        { id: 'redo', icon: 'fas fa-redo', title: 'Rehacer', onClick: redo, disabled: !canRedo },
        ...(editing
          ? [
              {
                id: 'kbd',
                icon: 'fas fa-keyboard',
                badge: '↓',
                title: 'Ocultar el teclado',
                onClick: hideKeyboard,
                text: true,
              },
            ]
          : []),
      ]
    : [];

  // «/» en el texto: buscador de acciones
  const latest = useRef();
  latest.current = { main, subs, run, editing };
  useEffect(() => {
    if (!editing) return undefined;
    const onInput = async (e) => {
      const el = e.target;
      if (!el || !el.matches || !el.matches(`${TITLE_SEL}, ${DESC_SEL}`)) return;
      if (e.data !== '/') return;
      const pos = el.selectionStart;
      const before = el.value.slice(0, pos - 1);
      if (before && !/\s$/.test(before)) return;
      const { main: m, subs: s } = latest.current;
      const all = [];
      m.forEach((b) => {
        if (b.sub) (s[b.sub] || []).forEach((x) => all.push({ ...x, group: b.title }));
        else if (b.id !== 'kbd' && !b.disabled) all.push({ ...b, label: b.title });
      });
      const chosen = await askPick({
        title: 'Acciones',
        placeholder: 'Buscar acción…',
        items: all.map((x, i) => ({ id: String(i), label: x.label, hint: x.group || '' })),
      });
      if (chosen === null) {
        try {
          el.focus();
        } catch (err) {}
        return;
      }
      // se quita la «/» escrita y se hace la acción
      const value = el.value;
      const at = pos - 1;
      if (value[at] === '/') {
        insertIntoField(el, '', at, at + 1);
      }
      const act = all[Number(chosen)];
      if (act) latest.current.run(act.onClick, { text: !!act.text })();
    };
    document.addEventListener('input', onInput, true);
    return () => document.removeEventListener('input', onInput, true);
  }, [editing]);

  // (3.02) Con el candado (modo lectura): solo acciones que no editan
  const lockedMain = header
    ? [
        ...(path && !path.startsWith('/__')
          ? [{ id: 'link-copy', icon: 'far fa-copy', title: 'Copiar enlace', onClick: copyLink }]
          : []),
        narrowedId === id
          ? {
              id: 'widen',
              icon: 'fas fa-expand',
              title: 'Ver todo (widen)',
              onClick: () => org('widenHeader'),
            }
          : {
              id: 'narrow',
              icon: 'fas fa-compress',
              title: 'Reducir (narrow)',
              onClick: () => org('narrowHeader', id),
            },
        {
          id: 'clock-total',
          icon: 'far fa-clock',
          title: 'Tiempo registrado',
          onClick: clockReport,
        },
        { id: 'mail', icon: 'fas fa-share', title: 'Correo', onClick: share },
        { id: 'pdf', icon: 'fas fa-file-pdf', title: 'PDF', onClick: () => openPrintPreview(id) },
        {
          id: 'unlock',
          icon: 'fas fa-lock',
          on: true,
          title: 'Quitar el candado (volver a editar)',
          onClick: toggleDocLock,
        },
      ]
    : [];
  // (3.02) Editando una celda de tabla: filas y columnas
  const tableMain = table
    ? [
        {
          id: 'tbl-row-add',
          icon: 'fas fa-plus',
          badge: '═',
          title: 'Añadir fila debajo',
          onClick: () => table.addRow(),
          text: true,
        },
        {
          id: 'tbl-row-del',
          icon: 'fas fa-minus',
          badge: '═',
          title: 'Borrar fila',
          onClick: () => table.delRow(),
          text: true,
        },
        {
          id: 'tbl-col-add',
          icon: 'fas fa-plus',
          badge: '║',
          title: 'Añadir columna a la derecha',
          onClick: () => table.addCol(),
          text: true,
        },
        {
          id: 'tbl-col-del',
          icon: 'fas fa-minus',
          badge: '║',
          title: 'Borrar columna',
          onClick: () => table.delCol(),
          text: true,
        },
        {
          id: 'tbl-row-up',
          icon: 'fas fa-arrow-up',
          title: 'Subir fila (Alt+↑)',
          onClick: () => table.moveRow(-1),
          text: true,
        },
        {
          id: 'tbl-row-down',
          icon: 'fas fa-arrow-down',
          title: 'Bajar fila (Alt+↓)',
          onClick: () => table.moveRow(1),
          text: true,
        },
        {
          id: 'tbl-col-left',
          icon: 'fas fa-arrow-left',
          title: 'Columna a la izquierda (Alt+←)',
          onClick: () => table.moveCol(-1),
          text: true,
        },
        {
          id: 'tbl-col-right',
          icon: 'fas fa-arrow-right',
          title: 'Columna a la derecha (Alt+→)',
          onClick: () => table.moveCol(1),
          text: true,
        },
        {
          id: 'tbl-done',
          icon: 'fas fa-check',
          title: 'Terminar (guardar la tabla)',
          onClick: () => table.done(),
          text: true,
        },
      ]
    : [];
  const rowItems = table ? tableMain : locked ? lockedMain : main;
  const mode = table ? 'table' : locked ? 'locked' : 'main';

  // Ordenador: medir y mandar al ⋯ lo que no cabe (el ⋯ siempre se queda)
  const canOverflow = !coarse && mode === 'main';
  const ids = rowItems.map((b) => b.id).join(',');
  useLayoutEffect(() => {
    if (!canOverflow) {
      if (fit !== Infinity) setFit(Infinity);
      return undefined;
    }
    const row = rowRef.current;
    if (!row) return undefined;
    const measure = () => {
      Array.from(row.children).forEach((el) => {
        const bid = el.getAttribute('data-bid');
        if (bid) widths.current[bid] = el.offsetWidth + 2;
      });
      // ancho disponible (no el de la barra: ésta se encoge a lo que lleva dentro)
      const avail = Math.min(window.innerWidth - 24, 900) - 24;
      const list = latestItems.current;
      const moreW = widths.current.more || 44;
      let used = moreW;
      let n = 0;
      for (let i = 0; i < list.length; i++) {
        if (list[i].id === 'more') {
          n++;
          continue;
        }
        const w = widths.current[list[i].id] || 44;
        if (used + w > avail) break;
        used += w;
        n++;
      }
      const all = list.length;
      const next = n >= all ? Infinity : n;
      setFit((cur) => (cur === next ? cur : next));
    };
    measure();
    // al cambiar el tamaño de la ventana (ResizeObserver sobre la página)
    let ro = null;
    if (window.ResizeObserver) {
      ro = new window.ResizeObserver(() => measure());
      ro.observe(document.documentElement);
    } else {
      window.addEventListener('resize', measure);
    }
    return () => {
      if (ro) ro.disconnect();
      else window.removeEventListener('resize', measure);
    };
  }, [canOverflow, ids, visible]); // eslint-disable-line
  const latestItems = useRef(rowItems);
  latestItems.current = rowItems;

  // Menú abierto: se cierra al tocar fuera o con Esc
  useEffect(() => {
    if (!sub) return undefined;
    const onDown = (e) => {
      const t = e.target;
      if (t && t.closest && t.closest('.eli-docbar-menu, .eli-docbar__btn.is-open')) return;
      setSub(null);
    };
    const onKey = (e) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault();
        e.stopPropagation();
        setSub(null);
      }
    };
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [sub]);

  if (!visible) return null;

  const keep = (e) => e.preventDefault(); // no quitar el foco (ni el teclado) al editar
  const shown =
    canOverflow && fit !== Infinity
      ? rowItems.filter((b, i) => i < fit || b.id === 'more')
      : rowItems;
  const overflow =
    canOverflow && fit !== Infinity ? rowItems.filter((b, i) => i >= fit && b.id !== 'more') : [];

  const openSub = (subId, el) => {
    anchorRef.current = el || null;
    setSub((cur) => (cur === subId ? null : subId));
  };

  const renderButton = (b) => {
    const handlers = b.sub
      ? {
          onClick: (e) => {
            e.stopPropagation();
            openSub(b.sub, e.currentTarget);
          },
        }
      : press(run(b.onClick, { text: !!b.text }), b.onLong ? run(b.onLong) : null);
    return (
      <button
        key={b.id}
        type="button"
        className={
          'eli-docbar__btn' +
          (b.on ? ' is-on' : '') +
          (b.dim ? ' is-dim' : '') +
          (b.label ? ' has-label' : '') +
          (b.sub && sub === b.sub ? ' is-open' : '')
        }
        title={b.title}
        aria-label={b.title}
        aria-haspopup={b.sub ? 'menu' : undefined}
        aria-expanded={b.sub ? sub === b.sub : undefined}
        disabled={b.disabled}
        onMouseDown={keep}
        data-bid={b.id}
        data-testid={`eli-docbar-${b.id}`}
        {...handlers}
      >
        {b.icon && <i className={b.icon} />}
        {b.label && <span className="eli-docbar__label">{b.label}</span>}
        {b.badge && <span className="eli-docbar__badge">{b.badge}</span>}
      </button>
    );
  };

  // Submenú: lista vertical encima del botón (lo del ⋯ incluye lo que no cabe en la fila)
  let menuItems = sub ? subs[sub] || [] : null;
  if (sub === 'more' && overflow.length) {
    menuItems = [
      ...overflow.map((b) => ({
        id: b.id,
        icon: b.icon || (b.id === 'format' ? 'fas fa-font' : 'far fa-circle'),
        label: b.title,
        disabled: b.disabled,
        openSub: b.sub || null,
        onClick: b.onClick,
        text: b.text,
      })),
      { id: 'sep-overflow', sep: true },
      ...menuItems,
    ];
  }
  const menuStyle = () => {
    const el = anchorRef.current;
    if (!el || !el.getBoundingClientRect) return {};
    const r = el.getBoundingClientRect();
    const w = Math.min(280, window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8));
    return { left, width: w, bottom: window.innerHeight - r.top + 8 };
  };
  const renderMenu = () => (
    <div
      className="eli-docbar-menu"
      role="menu"
      style={menuStyle()}
      data-testid={`eli-docbar-sub-${sub}`}
      onMouseDown={keep}
      onClick={(e) => e.stopPropagation()}
    >
      {menuItems.map((c, i) => {
        if (c.sep) return <div key={c.id} className="eli-docbar-menu__sep" role="separator" />;
        const prev = menuItems[i - 1];
        const groupBreak = sub === 'todo' && prev && !prev.sep && prev.group !== c.group;
        return (
          <React.Fragment key={c.id}>
            {groupBreak && <div className="eli-docbar-menu__sep" role="separator" />}
            <button
              type="button"
              role="menuitem"
              className={
                'eli-docbar-menu__item' +
                (c.danger ? ' is-danger' : '') +
                (c.current ? ' is-current' : '') +
                (c.done ? ' is-done' : '')
              }
              disabled={c.disabled}
              onMouseDown={keep}
              onClick={
                c.openSub
                  ? (e) => {
                      e.stopPropagation();
                      setSub(c.openSub);
                    }
                  : run(c.onClick, { text: !!c.text })
              }
              data-testid={`eli-docbar-${c.id}`}
            >
              <i className={c.icon} />
              <span className="eli-docbar-menu__label">{c.label}</span>
              {c.hint && <span className="eli-docbar-menu__hint">{c.hint}</span>}
              {c.current && <i className="fas fa-check eli-docbar-menu__mark" />}
              {c.openSub && <i className="fas fa-chevron-right eli-docbar-menu__mark" />}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );

  return (
    <>
      {menuItems && renderMenu()}
      <div
        className={
          'eli-docbar' +
          (editing ? ' is-editing' : '') +
          (coarse ? ' is-touch' : ' is-desk') +
          (bottom ? ' has-keyboard' : '') +
          ` is-${mode}`
        }
        style={bottom ? { bottom: bottom + 6 } : undefined}
        data-testid="eli-docbar"
        onMouseDown={keep}
        onPointerDownCapture={editing || table ? keep : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={'eli-docbar__row' + (canOverflow ? ' is-fit' : '')}
          ref={rowRef}
          data-testid={`eli-docbar-row-${mode}`}
        >
          {shown.map(renderButton)}
        </div>
      </div>
    </>
  );
}

// Para pruebas: lo que tiene que estar en la barra, en orden
export const DOCBAR_ORDER = [
  'outdent',
  'indent',
  'up',
  'down',
  'todo',
  'star',
  'dates',
  'tags',
  'link',
  'attach',
  'new',
  'more',
  'undo',
  'redo',
];
