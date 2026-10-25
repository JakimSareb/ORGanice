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
import { Map as IMap, List } from 'immutable';

import * as orgActions from '../../../../actions/org';
import * as baseActions from '../../../../actions/base';
import { getCurrentTimestampAsText, getCurrentTimestamp } from '../../../../lib/timestamps';
import { storeHeadingLink } from '../../../../lib/eli_org_links';
import { headerOrgId, withOrgIdProperty } from '../../../../lib/eli_id_links';
import { newOrgId } from '../../../../lib/gtd/gtd_model';
import generateId from '../../../../lib/id_generator';
import { taskStateOf, clockTotals, formatMillis } from '../../../../lib/eli_task_state';
import { attachmentsOfHeader } from '../../../../lib/eli_attachments';
import { confirmRemoveHeader } from '../../../../lib/eli_confirm_remove';
import { insertLinkInto } from '../../../../lib/eli_links';
import { showMessage, askPick, askText, askDate, askConfirm } from '../../../../lib/eli_prompt';
import { getPriority } from '../../../../lib/eli_priority';
import { shareContent } from '../../../../lib/share_utils';
import { exportHeaderWithSubheaders, exportOrg } from '../../../../lib/export_org';
import { useNotesMode } from '../../../../lib/eli_notes_mode';
import { ORG_EMPHASIS } from '../../../../lib/eli_format';
import { eliAssignHeaderToProject } from '../../../../lib/gtd/gtd_assign';
import {
  openPrintPreview,
  openUploadDialog,
  openRawEditor,
  insertIntoField,
} from '../../../EliTools';
import { applyEmphasis, applyList, cycleListIn, sortListIn } from '../../../EliFormatBar';
import { emptyOrgTable } from '../../../../lib/eli_format';

import { subscribeActiveTable, getActiveTable } from '../../../../lib/eli_table_focus';
import { useDocLock, toggleDocLock, isDocLocked } from '../../../../lib/eli_doc_lock';
import { justDragged } from '../HeaderList/eliBulletDrag';
import {
  useMulti,
  setMulti,
  clearMulti,
  getMulti,
  multiActions,
  batchOf,
  topIds,
  orderedIds,
  rangeIds,
  toggleId,
  parseTagEdit,
  visibleHeaderIds,
} from '../../../../lib/eli_multi_select';
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

// (3.29) `external` = {items, subs}: la barra del explorador de ficheros (sin fichero abierto), con
// solo lo que tiene sentido ahí (ficheros principales, nuevo, agenda, capturar).
export default function EliDocBar({
  editing = false,
  commitEditing = null,
  // (4.04) qué se edita en su sitio (title-editor / description-editor) y cómo pasar al otro
  editingKind = null,
  switchEditor = null,
  hidden = false,
  external = null,
}) {
  const dispatch = useDispatch();
  const path = useSelector((s) => s.org.present.get('path'));
  const file = useSelector((s) =>
    s.org.present.getIn(['files', s.org.present.get('path')], IMap())
  );
  const headerId = file.get('selectedHeaderId');
  const headers = file.get('headers');
  const header = headerId && headers ? headers.find((h) => h.get('id') === headerId) : null;
  // (3.04) Elemento de lista («-» o «+») de las notas seleccionado: sus acciones van en la barra
  const listItemId = file.get('selectedListItemId') || null;
  const listEditMode = file.get('editMode');
  const todoKeywordSets = file.get('todoKeywordSets');
  const narrowedId = file.get('narrowedHeaderId');
  const logIntoDrawer = useSelector((s) => s.base.get('shouldLogIntoDrawer'));
  const indentOnExport = useSelector((s) => s.base.get('eliIndentOnExport') === true);
  // (4.0) Modo Notas: sin lo de tareas (estado, ★, fechas, reloj, propiedades, GTD…)
  const notes = useNotesMode();
  const [sub, setSub] = useState(null); // submenú abierto (id)
  const [bottom, setBottom] = useState(0);
  const press = useLongPress();
  const locked = useDocLock();
  // (4.28) varias cabeceras seleccionadas
  const multi = useMulti();
  const multiAnchor = useRef(null);
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

  // (3.04) Siempre a la vista en el documento: sin nada seleccionado, una píldora pequeña con
  // Agenda, Capturar y deshacer/rehacer (antes, botones redondos grandes abajo).
  const multiOn = !locked && (multi.ids.length > 1 || (multi.touch && multi.ids.length > 0));
  const idle = !header && !table && !multiOn && !(listItemId && !locked);
  const visible = !hidden && (!!external || (!!path && file.has('headers')));

  // Encima del teclado (visualViewport): lo que tapa el teclado por abajo
  useLayoutEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    // (3.10) En el iPhone, con un documento largo (vista normal), al abrir el teclado Safari
    // desplaza la página y window.innerHeight puede encogerse como el visualViewport: el
    // cálculo daba 0 y la barra se quedaba debajo del teclado (en narrow, página corta, iba
    // bien). Se usa la altura de la ventana medida SIN teclado (por ancho de pantalla) y se
    // recalcula también al desplazar la ventana y al entrar/salir de un campo.
    const base = { w: 0, h: 0 };
    const typing = () => {
      const a = document.activeElement;
      return !!(
        a &&
        (a.tagName === 'TEXTAREA' ||
          (a.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|range|file)$/i.test(a.type)) ||
          a.isContentEditable)
      );
    };
    const update = () => {
      const w = window.innerWidth;
      if (w !== base.w) {
        base.w = w;
        base.h = 0;
      }
      if (!typing() || !base.h) base.h = window.innerHeight;
      // (3.16) sin un campo de texto activo no hay teclado: la barra va pegada abajo (en el
      // iPhone, sin teclado, a veces salía hacia la mitad de la pantalla)
      if (!typing()) {
        setBottom(0);
        return;
      }
      const fullH = typing() ? Math.max(base.h, window.innerHeight) : window.innerHeight;
      const covered = Math.max(0, fullH - (vv.height + vv.offsetTop));
      setBottom(covered > 40 ? covered : 0);
    };
    const timers = [];
    const later = () => {
      update();
      [80, 250, 500, 900].forEach((ms) => timers.push(setTimeout(update, ms)));
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    window.addEventListener('scroll', update, { passive: true });
    document.addEventListener('focusin', later);
    document.addEventListener('focusout', later);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('scroll', update);
      document.removeEventListener('focusin', later);
      document.removeEventListener('focusout', later);
      timers.forEach(clearTimeout);
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
    if (!visible || editing || external) return undefined;
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
      if (listItemId) dispatch(orgActions.setSelectedListItemId(null));
      clearMulti();
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [visible, editing, external, dispatch, listItemId]);

  // Al cambiar de encabezado o de modo, se cierra el submenú
  useEffect(() => setSub(null), [headerId, editing, locked, !!table, listItemId]);

  const id = header ? header.get('id') : null;
  const org = (name, ...args) => dispatch(orgActions[name](...args));
  const base = (name, ...args) => dispatch(baseActions[name](...args));
  // Las acciones sobre el encabezado guardan antes lo que se esté escribiendo (y cierran el editor)
  const commit = () => {
    if (editing && commitEditing) commitEditing();
  };
  const run = (fn, { text = false, keepOpen = false } = {}) => (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (!text) commit();
    if (!keepOpen) setSub(null);
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
  // (4.28) `pick` (selección múltiple): qué hacer con el estado elegido
  const todoMenu = (pick = null) => {
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
          current: !pick && kw === keyword,
          group: si,
          done: isDone,
          onClick: () =>
            pick ? pick(kw) : kw !== keyword && org('setTodoState', id, kw, logIntoDrawer),
        });
      });
    });
    out.push({
      id: 'st-none',
      label: 'Sin estado',
      icon: 'fas fa-minus',
      current: !pick && !keyword,
      group: 'none',
      onClick: () => (pick ? pick('') : keyword && org('setTodoState', id, '', logIntoDrawer)),
    });
    return out;
  };
  const planningIdx = (type) =>
    header ? header.get('planningItems', []).findIndex((p) => p.get('type') === type) : -1;
  const planDate = (type) => {
    const i = planningIdx(type);
    if (i === -1) return '';
    const t = header.getIn(['planningItems', i, 'timestamp']);
    return t ? `${t.get('day')}/${t.get('month')}` : '';
  };
  const planning = (type) => {
    let idx = planningIdx(type);
    // (3.03) sin fecha todavía: se pone hoy y se abre ya para cambiarla (sin el paso «Añadir»)
    if (idx === -1) {
      idx = (header.get('planningItems') || []).size || 0;
      org('addNewPlanningItem', id, type);
    }
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
  // (3.04) Agenda y plantillas de captura (antes, botones redondos grandes)
  // (3.29) Abrir el encabezado seleccionado en la vista GTD (si es una tarea, es decir, tiene
  // estado); GTD lo selecciona y abre su editor (orden `openTask`, ver Gtd/index.js)
  const openInGtd = () => {
    if (!header || !path) return;
    if (!keyword) {
      showMessage(
        'No es una tarea',
        'Solo se puede abrir en GTD un encabezado con estado (TODO, NEXT…). Ponle uno y vuelve a probar.'
      );
      return;
    }
    window.__eliGtdPending = { openTask: { path, id } };
    window.dispatchEvent(new CustomEvent('eli:open-gtd'));
  };
  // (3.03) Editar las notas (descripción) en el sitio
  const editNotes = () => {
    org('openHeader', id);
    base('activatePopup', 'description-editor');
  };
  const copyLink = async () => {
    // (4.24) Siempre por ID: si la cabecera no tiene :ID:, se le pone
    let orgId = headerOrgId(header);
    if (!orgId) {
      orgId = newOrgId();
      org(
        'updatePropertyListItems',
        id,
        withOrgIdProperty(header.get('propertyListItems'), orgId, generateId())
      );
    }
    const text = storeHeadingLink(orgId, header.getIn(['titleLine', 'rawTitle']));
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch (e) {}
    showMessage(
      copied ? 'Enlace copiado' : 'Enlace',
      (copied ? 'Pégalo donde quieras. ' : 'No se ha podido copiar; cópialo a mano:\n\n') +
        `${text}\n\nEs un enlace por ID: vale desde cualquier fichero aunque la cabecera cambie de sitio o de nombre.`
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
  // (4.0) Todo el fichero: compartir, PDF o copiar su texto Org (antes, ⋯ › Exportar de arriba)
  const fileText = () =>
    exportOrg({
      headers,
      linesBeforeHeadings: file.get('linesBeforeHeadings') || List(),
      dontIndent: !indentOnExport,
    });
  const fileName = () => (path || '').split('/').pop();
  const shareFile = () => shareContent({ title: fileName(), text: fileText() });
  const copyFile = () => {
    const name = fileName();
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(fileText()))
      .then(
        () => showMessage('Copiado', `El texto de «${name}» está en el portapapeles.`),
        () => showMessage('No se ha podido copiar', 'El navegador no deja usar el portapapeles.')
      );
  };
  // (4.0) «Hecha / Pendiente»: hecha (DONE) o vuelve a pendiente (el primer estado activo)
  const pendingKeyword = () => {
    const sets = todoKeywordSets || List();
    const set =
      sets.find((x) => (x.get('keywords') || List()).includes(keyword)) || sets.first() || null;
    if (!set) return 'TODO';
    const done = set.get('completedKeywords') || List();
    const active = (set.get('keywords') || List()).filter((k) => !done.includes(k));
    return active.first() || 'TODO';
  };
  const toggleDone = () =>
    st.kind === 'done'
      ? org('setTodoState', id, pendingKeyword(), logIntoDrawer)
      : org('setTodoState', id, st.kind === 'active' ? st.doneKeyword : 'DONE', logIntoDrawer);
  const remove = () => {
    const before = headers;
    confirmRemoveHeader(before, id).then((ok) => {
      if (!ok) return;
      org('selectNextSiblingHeader', id);
      org('removeHeader', id);
      org('eliOfferDeleteAttachments', before, id);
    });
  };
  const hideKeyboard = () => {
    const el = document.activeElement;
    if (el && el.blur) el.blur();
  };
  const fieldNow = () => activeField();
  // (3.06) Acciones de Formato que van en las notas: si no se están editando, se abren (cursor
  // al final) y se aplica allí
  const withNotes = (fn) => {
    const f = fieldNow();
    if (isListField(f)) {
      fn(f);
      return;
    }
    if (editing) commit();
    editNotes();
    let tries = 0;
    const go = () => {
      const g = activeField();
      if (g && isListField(g)) {
        try {
          g.focus();
          g.setSelectionRange(g.value.length, g.value.length);
        } catch (e) {}
        fn(g);
      } else if (tries++ < 20) setTimeout(go, 50);
    };
    setTimeout(go, 60);
  };
  // (3.06) Formato › Tabla: tabla vacía en el cursor y el editor de tablas en la 1ª celda
  const insertTable = () =>
    withNotes((f) => {
      const v = f.value || '';
      const s0 = f.selectionStart == null ? v.length : f.selectionStart;
      const lineStart = v.lastIndexOf('\n', s0 - 1) + 1;
      const lineText = v.slice(lineStart, s0);
      // dentro de un elemento de lista, con su sangría
      const indent = /^\s*([-+]|\d+[.)])\s/.test(v.slice(lineStart).split('\n')[0])
        ? ' '.repeat((/^\s*/.exec(lineText) || [''])[0].length + 2)
        : (/^\s*/.exec(lineText) || [''])[0];
      const lineEnd = v.indexOf('\n', s0) < 0 ? v.length : v.indexOf('\n', s0);
      // va en líneas propias, después de la línea del cursor (si tiene texto)
      const at = lineText.trim() || v.slice(s0, lineEnd).trim() ? lineEnd : lineStart;
      const pre = at > 0 && v[at - 1] !== '\n' ? '\n' : '';
      const post = at < v.length && v[at] !== '\n' ? '\n' : '';
      const block = pre + emptyOrgTable(indent) + post;
      // nº de tablas que hay antes en el texto (para encontrarla luego en la vista)
      const before = v.slice(0, at).split('\n');
      let ord = 0;
      before.forEach((l, i) => {
        if (/^\s*\|/.test(l) && !(i > 0 && /^\s*\|/.test(before[i - 1]))) ord++;
      });
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(f, v.slice(0, at) + block + v.slice(at));
      f.dispatchEvent(new Event('input', { bubbles: true }));
      const hid = id;
      // se guarda (se cierra el editor) y se abre la 1ª celda de la tabla nueva
      setTimeout(() => {
        if (commitEditing) commitEditing();
        let tries = 0;
        const open = () => {
          const box = document.querySelector(`[data-header-id="${hid}"]`);
          const tables = box ? box.querySelectorAll('[data-testid="eli-org-table"]') : [];
          const t = tables[Math.min(ord, tables.length - 1)];
          const cell = t && t.querySelector('[data-testid="eli-table-cell"]');
          if (cell) cell.click();
          else if (tries++ < 20) setTimeout(open, 60);
        };
        setTimeout(open, 80);
      }, 30);
    });

  // (4.28) Selección múltiple: Mayús+clic (rango) y Cmd/Ctrl+clic (sueltas) en el ordenador; en el
  // teléfono, tras mantener la viñeta, cada toque añade o quita. Un clic normal la quita.
  const selRef = useRef(headerId);
  selRef.current = headerId;
  const headersRef = useRef(headers);
  headersRef.current = headers;
  useEffect(() => {
    if (!visible || external) return undefined;
    const boxOf = (t) =>
      t && t.closest ? t.closest('.header-list-container .header[data-header-id]') : null;
    const skip = (t) =>
      !!t.closest(
        'textarea, input, select, [contenteditable="true"], .eli-docbar, .eli-docbar-menu, ' +
          '.eli-prompt__overlay'
      );
    const onDown = (e) => {
      // Mayús+clic no debe seleccionar texto
      if (e.shiftKey && boxOf(e.target) && !skip(e.target)) e.preventDefault();
    };
    const onClickCap = (e) => {
      const t = e.target;
      const box = boxOf(t);
      if (!box || skip(t) || isDocLocked()) return;
      const hid = box.getAttribute('data-header-id');
      const cur = getMulti();
      const mod = e.metaKey || e.ctrlKey;
      if (e.shiftKey || mod) {
        e.preventDefault();
        e.stopPropagation();
        const sel = selRef.current != null ? String(selRef.current) : null;
        const baseIds = cur.ids.length ? cur.ids : sel ? [sel] : [];
        let next;
        if (e.shiftKey) {
          const anchor = multiAnchor.current || sel || hid;
          next = rangeIds(visibleHeaderIds(), anchor, hid);
          if (mod) next = Array.from(new Set([...baseIds, ...next]));
        } else {
          next = toggleId(baseIds, hid);
          multiAnchor.current = hid;
        }
        if (!sel) {
          const hs = headersRef.current;
          const real = hs && hs.find((h) => String(h.get('id')) === hid);
          if (real) dispatch(orgActions.selectHeader(real.get('id')));
        }
        setMulti(next, false);
        return;
      }
      if (cur.touch && cur.ids.length) {
        e.preventDefault();
        e.stopPropagation();
        if (justDragged()) return;
        setMulti(toggleId(cur.ids, hid), true);
        return;
      }
      if (cur.ids.length) {
        multiAnchor.current = null;
        clearMulti();
      }
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('click', onClickCap, true);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('click', onClickCap, true);
    };
  }, [visible, external, dispatch]);
  // otro fichero o candado: sin selección múltiple
  useEffect(() => {
    multiAnchor.current = null;
    clearMulti();
  }, [path, locked]);
  // Esc quita la selección (si no hay un menú ni un aviso abiertos)
  useEffect(() => {
    if (!multiOn) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape' && e.key !== 'Esc') return;
      if (document.querySelector('.eli-prompt__overlay, .eli-docbar-menu')) return;
      e.preventDefault();
      e.stopPropagation();
      clearMulti();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [multiOn]);

  const multiIds = multiOn ? multi.ids : [];
  const multiCount = multiOn ? orderedIds(headers, multiIds).length : 0;
  const doMulti = (op, args) => {
    const action = batchOf(multiActions(headers, multiIds, op, args));
    if (action) dispatch(action);
  };
  const multiTags = async () => {
    const text = await askText({
      title: `Etiquetas (${multiCount} cabeceras)`,
      message:
        'Etiquetas que se añaden, separadas por espacios. Con «-» delante se quitan (p. ej. «casa -trabajo»).',
      placeholder: 'casa -trabajo',
    });
    if (text == null) return;
    const edit = parseTagEdit(text);
    if (edit.add.length || edit.remove.length) doMulti('tags', edit);
  };
  const multiPlan = async (type) => {
    const date = await askDate({
      title: type === 'DEADLINE' ? 'Fecha límite' : 'Programada',
      message: `Para las ${multiCount} cabeceras seleccionadas`,
    });
    if (date) doMulti('plan', { type, date });
  };
  const multiArchive = async () => {
    const tops = topIds(headers, multiIds);
    const ok = await askConfirm({
      title: 'Archivar',
      message: `¿Archivar ${tops.length} cabecera(s) con sus subcabeceras?`,
      okLabel: 'Archivar',
    });
    if (!ok) return;
    clearMulti();
    dispatch(orgActions.eliArchiveMany(tops.map((hid) => ({ path, id: hid }))));
  };
  const multiRemove = async () => {
    const tops = topIds(headers, multiIds);
    const ok = await askConfirm({
      title: 'Borrar',
      message: `¿Borrar ${tops.length} cabecera(s) con sus subcabeceras? Se puede deshacer (↶).`,
      okLabel: 'Borrar',
      focusCancel: true,
    });
    if (!ok) return;
    doMulti('remove');
    clearMulti();
    dispatch(orgActions.selectHeader(null));
  };
  useEffect(() => {
    if (!multiOn) return undefined;
    const onTags = () => multiTags();
    window.addEventListener('eli:multi-tags', onTags);
    return () => window.removeEventListener('eli:multi-tags', onTags);
  }); // eslint-disable-line
  const multiSubs = multiOn
    ? {
        mtodo: todoMenu((kw) => doMulti('todo', { keyword: kw, logIntoDrawer })),
        mmore: [
          ...(notes
            ? []
            : [
                {
                  id: 'm-star',
                  icon: 'far fa-star',
                  label: 'Prioridad A (★)',
                  hint: 'pone o quita',
                  onClick: () => doMulti('priority'),
                },
                {
                  id: 'm-sched',
                  icon: 'far fa-calendar-check',
                  label: 'Programada…',
                  onClick: () => multiPlan('SCHEDULED'),
                },
                {
                  id: 'm-dead',
                  icon: 'fas fa-calendar-check',
                  label: 'Fecha límite…',
                  onClick: () => multiPlan('DEADLINE'),
                },
                {
                  id: 'm-archive',
                  icon: 'fas fa-archive',
                  label: 'Archivar…',
                  onClick: multiArchive,
                },
              ]),
          { id: 'sep-m', sep: true },
          {
            id: 'm-delete',
            icon: 'fas fa-trash',
            label: 'Borrar…',
            onClick: multiRemove,
            danger: true,
          },
        ],
      }
    : {};
  const multiMain = multiOn
    ? [
        {
          id: 'multi-clear',
          icon: 'fas fa-times',
          label: String(multiCount),
          title: 'Quitar la selección (Esc)',
          onClick: () => clearMulti(),
        },
        {
          id: 'multi-outdent',
          icon: 'fas fa-angle-double-left',
          title: 'Hacia fuera (con subcabeceras)',
          onClick: () => doMulti('outdent'),
        },
        {
          id: 'multi-indent',
          icon: 'fas fa-angle-double-right',
          title: 'Hacia dentro (con subcabeceras)',
          onClick: () => doMulti('indent'),
        },
        { id: 'multi-up', icon: 'fas fa-arrow-up', title: 'Subir', onClick: () => doMulti('up') },
        {
          id: 'multi-down',
          icon: 'fas fa-arrow-down',
          title: 'Bajar',
          onClick: () => doMulti('down'),
        },
        ...(notes
          ? []
          : [{ id: 'multi-todo', icon: 'far fa-check-circle', title: 'Estado', sub: 'mtodo' }]),
        { id: 'multi-tags', icon: 'fas fa-tags', title: 'Etiquetas', onClick: multiTags },
        { id: 'multi-more', icon: 'fas fa-ellipsis-h', title: 'Más', sub: 'mmore' },
      ]
    : [];

  // Submenús: [{ id, icon, label, onClick, text, danger }]
  const subs = header
    ? {
        dates: [
          {
            id: 'sched',
            icon: 'far fa-calendar-check',
            label: 'Programada',
            hint: planDate('SCHEDULED'),
            onClick: () => planning('SCHEDULED'),
          },
          {
            id: 'dead',
            icon: 'fas fa-calendar-check',
            label: 'Fecha límite',
            hint: planDate('DEADLINE'),
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
          ...(planningIdx('SCHEDULED') !== -1 || planningIdx('DEADLINE') !== -1
            ? [{ id: 'sep-dates', sep: true }]
            : []),
          ...(planningIdx('SCHEDULED') !== -1
            ? [
                {
                  id: 'sched-del',
                  icon: 'far fa-calendar-times',
                  label: 'Quitar la fecha programada',
                  onClick: () => org('removePlanningItem', id, planningIdx('SCHEDULED')),
                },
              ]
            : []),
          ...(planningIdx('DEADLINE') !== -1
            ? [
                {
                  id: 'dead-del',
                  icon: 'fas fa-calendar-times',
                  label: 'Quitar la fecha límite',
                  onClick: () => org('removePlanningItem', id, planningIdx('DEADLINE')),
                },
              ]
            : []),
        ],
        format: [
          ...(fieldNow() ? ORG_EMPHASIS : []).map((it) => ({
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
          ...(fieldNow() ? [{ id: 'sep-fmt', sep: true }] : []),
          // (3.06) listas y tablas: también sin estar editando (se abren las notas)
          ...(!fieldNow() || isListField(fieldNow())
            ? [
                { id: 'fmt-list', icon: 'fas fa-list-ul', label: 'Lista', openSub: 'list' },
                {
                  id: 'fmt-table',
                  icon: 'fas fa-table',
                  label: 'Tabla',
                  text: true,
                  onClick: insertTable,
                },
              ]
            : []),
        ],
        list: [
          ...[
            ['check', 'Casilla', 'far fa-check-square', '- [ ]'],
            ['dash', 'Guion', 'fas fa-list-ul', '-'],
            ['plus', 'Más', 'fas fa-plus', '+'],
            ['num', 'Numerada', 'fas fa-list-ol', '1.'],
            ['none', 'Quitar', 'fas fa-eraser', ''],
          ].map(([kind, label, icon, hint]) => ({
            id: `list-${kind}`,
            icon,
            label,
            hint,
            text: true,
            onClick: () => withNotes((f) => applyList(f, kind)),
          })),
          { id: 'sep-list', sep: true },
          {
            id: 'list-cycle',
            icon: 'fas fa-sync-alt',
            label: 'Cambiar tipo',
            hint: 'Ctrl+Mayús+-',
            text: true,
            keepOpen: true,
            onClick: () => withNotes((f) => cycleListIn(f)),
          },
          {
            id: 'list-sort',
            icon: 'fas fa-sort-alpha-down',
            label: 'Ordenar lista',
            openSub: 'listsort',
          },
        ],
        listsort: [
          ['alpha', 'A → Z', 'fas fa-sort-alpha-down'],
          ['alpha-desc', 'Z → A', 'fas fa-sort-alpha-up'],
          ['num', 'Por número', 'fas fa-sort-numeric-down'],
          ['check', 'Casillas hechas al final', 'far fa-check-square'],
        ].map(([mode, label, icon]) => ({
          id: `sort-${mode}`,
          icon,
          label,
          text: true,
          onClick: () => withNotes((f) => sortListIn(f, mode)),
        })),
        todo: todoMenu(),
        // (4.0) Nueva: debajo o como subcabecera; (4.03) también arriba; (4.04) en su sitio, sin hoja
        new: [
          {
            id: 'new-above',
            icon: 'fas fa-level-up-alt',
            label: 'Arriba',
            onClick: () => org('eliAddHeaderWithSheet', id, 'above'),
          },
          {
            id: 'new-below',
            icon: 'fas fa-level-down-alt',
            label: 'Debajo',
            onClick: () => org('eliAddHeaderWithSheet', id, 'below'),
          },
          {
            id: 'new-sub',
            icon: 'fas fa-indent',
            label: 'Subcabecera',
            onClick: () => org('eliAddHeaderWithSheet', id, 'sub'),
          },
        ],
        // (4.0) Mover: el menú se queda abierto para mover varias veces seguidas
        move: [
          {
            id: 'up',
            icon: 'fas fa-arrow-up',
            label: 'Subir',
            keepOpen: true,
            onClick: () => org('moveHeaderUp', id),
          },
          {
            id: 'down',
            icon: 'fas fa-arrow-down',
            label: 'Bajar',
            keepOpen: true,
            onClick: () => org('moveHeaderDown', id),
          },
          {
            id: 'indent-tree',
            icon: 'fas fa-angle-double-right',
            label: 'Hacia dentro',
            hint: 'con subcabeceras',
            keepOpen: true,
            onClick: () => org('moveSubtreeRight', id),
          },
          {
            id: 'outdent-tree',
            icon: 'fas fa-angle-double-left',
            label: 'Hacia fuera',
            hint: 'con subcabeceras',
            disabled: level <= 1,
            keepOpen: true,
            onClick: () => level > 1 && org('moveSubtreeLeft', id),
          },
          {
            id: 'indent',
            icon: 'fas fa-arrow-right',
            label: 'Solo la cabecera hacia dentro',
            keepOpen: true,
            onClick: () => org('moveHeaderRight', id),
          },
          {
            id: 'outdent',
            icon: 'fas fa-arrow-left',
            label: 'Solo la cabecera hacia fuera',
            disabled: level <= 1,
            keepOpen: true,
            onClick: () => level > 1 && org('moveHeaderLeft', id),
          },
          { id: 'sep-move', sep: true },
          {
            id: 'refile',
            icon: 'fas fa-file-export',
            label: 'A otro fichero…',
            onClick: () => base('activatePopup', 'refile'),
          },
          ...(!notes && path && !path.startsWith('/__')
            ? [
                {
                  id: 'assign',
                  icon: 'fas fa-project-diagram',
                  label: 'Asignar a proyecto…',
                  onClick: () => dispatch(eliAssignHeaderToProject(path, id)),
                },
              ]
            : []),
        ],
        // (4.0) Añadir: archivo o foto, enlace y la fecha de hoy (en el texto que se edita o en
        // las notas)
        insert: [
          {
            id: 'att-add',
            icon: 'fas fa-paperclip',
            label: 'Archivo o foto…',
            onClick: attach,
            text: true,
          },
          {
            id: 'link-insert',
            icon: 'fas fa-link',
            label: 'Enlace (nota o web)…',
            onClick: insertLink,
            text: true,
          },
          {
            id: 'date-today',
            icon: 'far fa-calendar-plus',
            label: 'Fecha de hoy',
            onClick: insertDate,
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
        // (4.0) Compartir o PDF: esta cabecera o todo el fichero
        share: [
          { id: 'mail', icon: 'fas fa-share', label: 'Compartir / correo', onClick: share },
          {
            id: 'pdf',
            icon: 'fas fa-file-pdf',
            label: 'PDF / imprimir',
            onClick: () => openPrintPreview(id),
          },
          ...(path && !path.startsWith('/__')
            ? [{ id: 'link-copy', icon: 'far fa-copy', label: 'Copiar enlace', onClick: copyLink }]
            : []),
          { id: 'sep-share', sep: true },
          {
            id: 'file-share',
            icon: 'fas fa-share-square',
            label: 'Todo el fichero: compartir',
            onClick: shareFile,
          },
          {
            id: 'file-pdf',
            icon: 'far fa-file-pdf',
            label: 'Todo el fichero: PDF',
            onClick: () => openPrintPreview(null),
          },
          {
            id: 'file-copy',
            icon: 'far fa-clipboard',
            label: 'Todo el fichero: copiar el texto Org',
            onClick: copyFile,
          },
        ],
        more: [
          {
            id: 'done-toggle',
            icon: st.kind === 'done' ? 'far fa-square' : 'far fa-check-square',
            label: st.kind === 'done' ? 'Pendiente' : 'Hecha',
            onClick: toggleDone,
          },
          narrowedId === id
            ? {
                id: 'widen',
                icon: 'fas fa-expand',
                label: 'Ver todo',
                onClick: () => org('widenHeaderToTop'),
              }
            : {
                id: 'narrow',
                icon: 'fas fa-compress',
                label: 'Ver sola',
                hint: 'se vuelve con Atrás',
                onClick: () => org('narrowHeader', id),
              },
          // (4.28) Etiquetas y Estado: en la fila de la barra (ya no en ⋯)
          { id: 'share', icon: 'fas fa-share-alt', label: 'Compartir o PDF', openSub: 'share' },
          {
            id: 'dup',
            icon: 'far fa-clone',
            label: 'Duplicar',
            onClick: () => org('duplicateHeader', id),
          },
          ...(notes
            ? []
            : [
                { id: 'sep-tasks', sep: true },
                {
                  id: 'star',
                  icon: getPriority(header) === 'A' ? 'fas fa-star' : 'far fa-star',
                  label: 'Prioridad A (★)',
                  current: getPriority(header) === 'A',
                  onClick: () => org('togglePriorityA', id),
                },
                { id: 'dates', icon: 'far fa-calendar-alt', label: 'Fechas', openSub: 'dates' },
                ...(st.kind === 'active'
                  ? [
                      {
                        id: 'cancel',
                        icon: 'far fa-window-close',
                        label: 'Cancelada',
                        onClick: () => org('setTodoState', id, st.cancelKeyword, logIntoDrawer),
                      },
                    ]
                  : []),
                {
                  id: 'props',
                  icon: 'fas fa-list',
                  label: 'Propiedades',
                  onClick: () => base('activatePopup', 'property-list-editor'),
                },
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
                  label: 'Añadir nota al registro',
                  onClick: () => base('activatePopup', 'note-editor'),
                },
                {
                  id: 'plain',
                  icon: 'fas fa-code',
                  label: 'Texto plano (esta cabecera)',
                  onClick: () => {
                    org('narrowHeader', id);
                    openRawEditor(id);
                  },
                },
                {
                  id: 'archive',
                  icon: 'fas fa-archive',
                  label: 'Archivar',
                  onClick: () => org('archiveSubtree', id),
                },
                {
                  id: 'gtd',
                  icon: 'fas fa-bullseye',
                  label: 'Abrir en GTD',
                  onClick: openInGtd,
                },
                // (4.17) Capturar (plantillas): ahora en el Menú ☰ de arriba
              ]),
          { id: 'sep-more', sep: true },
          { id: 'delete', icon: 'fas fa-trash', label: 'Borrar', onClick: remove, danger: true },
        ],
      }
    : {};

  // (4.0) Fila principal: 5 botones grandes con texto (Editar · Nueva · Añadir · Mover · Más);
  // editando en el sitio, además el formato (Aa) y ocultar el teclado
  const main = header
    ? [
        // (4.04) Editar, sin hoja: el título en su sitio; otra vez, las notas; otra vez, el
        // título. El botón dice dónde se está (Título / Notas).
        {
          id: 'edit',
          icon:
            editingKind === 'title-editor'
              ? 'fas fa-heading'
              : editingKind === 'description-editor'
              ? 'fas fa-align-left'
              : 'fas fa-pencil-alt',
          label:
            editingKind === 'title-editor'
              ? 'Título'
              : editingKind === 'description-editor'
              ? 'Notas'
              : 'Editar',
          title:
            editingKind === 'title-editor'
              ? 'Editando el título (pulsa para pasar a las notas)'
              : editingKind === 'description-editor'
              ? 'Editando las notas (pulsa para pasar al título)'
              : 'Editar el título (otra vez: las notas)',
          on: editingKind === 'title-editor' || editingKind === 'description-editor',
          text: true,
          onClick: () => {
            if (editingKind === 'title-editor' && switchEditor) switchEditor('description-editor');
            else if (editingKind === 'description-editor' && switchEditor)
              switchEditor('title-editor');
            else {
              commit();
              base('activatePopup', 'title-editor');
            }
          },
        },
        // (4.28) Estado (menú con los del fichero y «Sin estado») y Etiquetas, a la vista
        ...(notes
          ? []
          : [
              {
                id: 'todo',
                icon: 'far fa-check-circle',
                label: keyword || 'Estado',
                title: 'Estado de la tarea',
                sub: 'todo',
              },
            ]),
        {
          id: 'tags',
          icon: 'fas fa-tags',
          label: 'Etiquetas',
          title: 'Etiquetas (tecla #)',
          onClick: () => base('activatePopup', 'tags-editor'),
        },
        { id: 'new', icon: 'fas fa-plus', label: 'Nueva', title: 'Cabecera nueva', sub: 'new' },
        { id: 'insert', icon: 'fas fa-paperclip', label: 'Añadir', title: 'Añadir', sub: 'insert' },
        { id: 'move', icon: 'fas fa-arrows-alt', label: 'Mover', title: 'Mover', sub: 'move' },
        { id: 'more', icon: 'fas fa-ellipsis-h', label: 'Más', title: 'Más', sub: 'more' },
        ...(editing
          ? [
              { id: 'format', label: 'Aa', title: 'Formato', sub: 'format' },
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
        if (b.sub)
          (s[b.sub] || [])
            .filter((x) => !x.sep && !x.disabled)
            .forEach((x) => all.push({ ...x, group: b.title }));
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
        narrowedId === id
          ? {
              id: 'widen',
              icon: 'fas fa-expand',
              label: 'Ver todo',
              title: 'Ver todo',
              onClick: () => org('widenHeaderToTop'),
            }
          : {
              id: 'narrow',
              icon: 'fas fa-compress',
              label: 'Ver sola',
              title: 'Ver sola (se vuelve con Atrás)',
              onClick: () => org('narrowHeader', id),
            },
        {
          id: 'share',
          icon: 'fas fa-share-alt',
          label: 'Compartir',
          title: 'Compartir o PDF',
          sub: 'share',
        },
        ...(notes
          ? []
          : [
              {
                id: 'clock-total',
                icon: 'far fa-clock',
                title: 'Tiempo registrado',
                onClick: clockReport,
              },
              {
                id: 'gtd',
                icon: 'fas fa-bullseye',
                title: 'Abrir en GTD (la tarea seleccionada)',
                onClick: openInGtd,
              },
            ]),
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
  // (3.04) Elemento de lista seleccionado: lo que antes salía debajo del elemento (✎, editar
  // contenido, ＋, ✕), más subir/bajar, deshacer/rehacer y ✓ (terminar).
  const listMain = listItemId
    ? [
        {
          id: 'li-title',
          icon: 'fas fa-pencil-alt',
          title: 'Editar el texto del elemento',
          on: listEditMode === 'list-title',
          onClick: () => org('enterEditMode', 'list-title'),
          text: true,
        },
        {
          id: 'li-contents',
          icon: 'far fa-edit',
          title: 'Editar el contenido (notas) del elemento',
          on: listEditMode === 'list-contents',
          onClick: () => org('enterEditMode', 'list-contents'),
          text: true,
        },
        {
          id: 'li-new',
          icon: 'fas fa-plus',
          title: 'Elemento nuevo debajo',
          onClick: () => org('addNewListItemAndEdit'),
          text: true,
        },
        {
          id: 'li-up',
          icon: 'fas fa-arrow-up',
          title: 'Subir elemento',
          onClick: () => org('moveListItemUp'),
          text: true,
        },
        {
          id: 'li-down',
          icon: 'fas fa-arrow-down',
          title: 'Bajar elemento',
          onClick: () => org('moveListItemDown'),
          text: true,
        },
        {
          id: 'li-left',
          icon: 'fas fa-outdent',
          title: 'Subir de nivel el elemento',
          onClick: () => org('moveListItemLeft'),
          text: true,
        },
        {
          id: 'li-right',
          icon: 'fas fa-indent',
          title: 'Bajar de nivel el elemento',
          onClick: () => org('moveListItemRight'),
          text: true,
        },
        {
          id: 'li-del',
          icon: 'fas fa-times',
          title: 'Borrar elemento',
          onClick: () => org('removeListItem'),
          text: true,
        },
        {
          id: 'li-done',
          icon: 'fas fa-check',
          title: 'Terminar',
          onClick: () => {
            // primero se sale de la edición (guarda el texto); luego se quita la selección
            org('exitEditMode');
            setTimeout(() => org('setSelectedListItemId', null), 0);
          },
          text: true,
        },
      ]
    : [];
  // (4.0) Sin nada seleccionado: Capturar (en el modo completo) o quitar el candado. Agenda
  // está en GTD y deshacer/rehacer, arriba.
  const idleMain = locked
    ? [
        {
          id: 'unlock',
          icon: 'fas fa-lock',
          on: true,
          title: 'Quitar el candado (volver a editar)',
          onClick: toggleDocLock,
        },
      ]
    : // (4.17) Capturar (plantillas) pasó al Menú ☰ de arriba (tecla c, igual)
      [];
  const rowItems = external
    ? external.items
    : table
    ? tableMain
    : multiOn
    ? multiMain
    : listItemId && !locked
    ? listMain
    : idle
    ? idleMain
    : locked
    ? lockedMain
    : main;
  const mode = external
    ? 'browser'
    : table
    ? 'table'
    : multiOn
    ? 'multi'
    : listItemId && !locked
    ? 'list'
    : idle
    ? 'idle'
    : locked
    ? 'locked'
    : 'main';

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

  // (3.03) Tecla m (o «Mover» en la paleta): abre el menú Mover de la barra
  useEffect(() => {
    if (!visible || locked || table || !header) return undefined;
    const onMove = () => {
      const btn = document.querySelector('.eli-docbar__btn[data-bid="move"]');
      anchorRef.current = btn || null;
      setSub((cur) => (cur === 'move' ? null : 'move'));
    };
    window.addEventListener('eli:move-menu', onMove);
    return () => window.removeEventListener('eli:move-menu', onMove);
  }, [visible, locked, table, !!header]); // eslint-disable-line

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
        // (4.03) con un aviso abierto (eli-prompt), Esc es para él: el menú solo se cierra
        if (document.querySelector('.eli-prompt__overlay')) {
          setSub(null);
          return;
        }
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

  if (!visible || !rowItems.length) return null;

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
          (b.label && b.icon ? ' is-big' : '') +
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
  let menuItems = sub
    ? (external ? external.subs || {} : { ...subs, ...multiSubs })[sub] || []
    : null;
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
    let el = anchorRef.current;
    // abierto con el teclado (tecla m) o el botón está en el ⋯: encima de la barra
    if (!el || !el.isConnected) el = rowRef.current;
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
        const groupBreak =
          (sub === 'todo' || sub === 'mtodo') && prev && !prev.sep && prev.group !== c.group;
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
                  : run(c.onClick, { text: !!c.text, keepOpen: !!c.keepOpen })
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
export const DOCBAR_ORDER = ['edit', 'todo', 'tags', 'new', 'insert', 'move', 'more'];
