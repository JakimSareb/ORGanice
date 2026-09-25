import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router-dom';

import './stylesheet.css';

import AttributedString from '../OrgFile/components/AttributedString';
import { exportOrg } from '../../lib/export_org';
import {
  subheadersOfHeaderWithId,
  isRegularPlanningItem,
  STATIC_FILE_PREFIX,
} from '../../lib/org_utils';
import { renderAsText } from '../../lib/timestamps';
import {
  parseFile,
  setDirty,
  sync,
  narrowHeader,
  widenHeader,
  openHeader,
  toggleEliFavoriteFile,
  moveEliFavoriteFile,
  uploadFilesAndGetLinks,
  appendLinesToHeader,
  resetFileDisplay,
} from '../../actions/org';
import { isEncryptedPath } from '../../lib/eli_crypto';
import { orderedFavoriteSettings } from '../../reducers/org';
import {
  IMAGE_SIZES,
  isResizableImage,
  prepareImageVariants,
  formatBytes,
  pastedName,
} from '../../lib/eli_image';
import { phasesForThreeMonths, moonState } from '../../lib/lunar';
import { getCurrentTimestampAsText, getTimestampAsText } from '../../lib/timestamps';
import { setPlanning, narrowAt } from '../../lib/eli_raw_tools';
import { insertLinkInto } from '../../lib/eli_links';
import { List } from 'immutable';

// ORG Mode para Eli: herramientas de fichero
//  - Editar el fichero abierto como texto plano (como en un búfer de Emacs)
//  - Exportar un encabezado con sus subencabezados, o el fichero entero, a PDF
// Se activan con eventos de ventana para no tocar los componentes de organice:
//   window.dispatchEvent(new CustomEvent('eli:raw-edit'))
//   window.dispatchEvent(new CustomEvent('eli:print', { detail: { headerId } }))

export const openUploadDialog = (detail) =>
  window.dispatchEvent(new CustomEvent('eli:upload', { detail }));
export const openMoonPhases = () => window.dispatchEvent(new CustomEvent('eli:moon'));
export const openFavorites = () => window.dispatchEvent(new CustomEvent('eli:favorites'));
export const openRawEditor = () => window.dispatchEvent(new CustomEvent('eli:raw-edit'));
export const openPrintPreview = (headerId = null) =>
  window.dispatchEvent(new CustomEvent('eli:print', { detail: { headerId } }));

const PGP = '-----BEGIN PGP MESSAGE-----';

const fileTitle = (path, file) => {
  const lines = (file && file.get('linesBeforeHeadings')) || [];
  const titleLine = (lines.toJS ? lines.toJS() : lines).find((l) => /^#\+TITLE:/i.test(l));
  if (titleLine) return titleLine.replace(/^#\+TITLE:\s*/i, '').trim();
  return (path || '')
    .split('/')
    .pop()
    .replace(/\.org(_archive)?(\.gpg|\.asc)?$/i, '');
};

const ensurePortal = (id) => {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    document.body.appendChild(el);
  }
  return el;
};

// ---------------------------------------------------------------------------
// Editor de texto plano

// Comprueba que el texto de un subárbol sigue siendo un subárbol del mismo nivel
export const validateSubtreeText = (text, level) => {
  const lines = text.split('\n');
  const first = lines.find((l) => l.trim() !== '');
  if (first === undefined) return { ok: false, empty: true };
  const m = /^(\*+)\s/.exec(first);
  if (!m)
    return {
      ok: false,
      reason: 'La primera línea debe ser el encabezado (empezar por asteriscos).',
    };
  if (m[1].length !== level) {
    return { ok: false, reason: `El encabezado debe mantener su nivel (${'*'.repeat(level)}).` };
  }
  const escapes = lines.filter((l) => {
    const h = /^(\*+)\s/.exec(l);
    return h && h[1].length <= level;
  }).length;
  if (escapes > 1) {
    return {
      ok: false,
      reason:
        'Hay otro encabezado de nivel igual o superior: quedaría fuera de este bloque ' +
        '(se convertiría en un encabezado hermano).',
      soft: true,
    };
  }
  return { ok: true };
};

function RawEditor({ path, initialText, narrow: initialNarrow, onClose, dontIndent }) {
  const dispatch = useDispatch();
  const [text, setText] = useState(initialText);
  // ORG Mode para Eli: el narrow se puede cambiar dentro del editor (botón Narrow/Widen)
  const [narrow, setNarrow] = useState(initialNarrow || null);
  const [planning, setPlanningPrompt] = useState(null); // { type, date, time }
  const ref = useRef(null);
  const wrap = (n, t) => (n ? n.before + t + n.after : t);
  const originalFull = wrap(initialNarrow, initialText);
  const changed = wrap(narrow, text) !== originalFull;
  const narrowChanged = (initialNarrow ? initialNarrow.index : -1) !== (narrow ? narrow.index : -1);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  const cancel = () => {
    // eslint-disable-next-line no-restricted-globals
    if (changed && !window.confirm('¿Descartar los cambios hechos en el texto?')) return;
    onClose();
  };

  const placeCursor = (pos) =>
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      try {
        el.focus();
        el.setSelectionRange(pos, pos);
      } catch (e) {}
    });

  const cursorPos = () => (ref.current ? ref.current.selectionStart : 0);

  const toggleNarrow = () => {
    const pos = cursorPos();
    if (narrow) {
      // Widen: volver al fichero entero sin perder lo escrito
      setText(narrow.before + text + narrow.after);
      setNarrow(null);
      placeCursor(narrow.before.length + pos);
      return;
    }
    const n = narrowAt(text, pos);
    if (!n) {
      window.alert('Coloca el cursor dentro de un encabezado para enfocarlo (narrow).');
      return;
    }
    setNarrow({ before: n.before, after: n.after, level: n.level, index: n.index, title: n.title });
    setText(n.text);
    placeCursor(n.cursor);
  };

  const openPlanning = (type) => {
    const now = new Date();
    const pad = (x) => String(x).padStart(2, '0');
    setPlanningPrompt({
      type,
      date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
      time: '',
      pos: cursorPos(),
    });
  };

  const applyPlanning = () => {
    if (!planning || !planning.date) return;
    const [y, m, d] = planning.date.split('-').map(Number);
    const [hh, mm] = (planning.time || '').split(':').map(Number);
    const date = new Date(y, m - 1, d, hh || 0, mm || 0);
    const stamp = getTimestampAsText(date, { isActive: true, withStartTime: !!planning.time });
    const result = setPlanning(text, planning.pos, planning.type, stamp, {
      indent: !dontIndent,
    });
    setPlanningPrompt(null);
    if (!result) {
      window.alert('Coloca el cursor dentro de un encabezado (en su título o en su texto).');
      return;
    }
    setText(result.text);
    placeCursor(result.cursor);
  };

  const attach = () => {
    const el = ref.current;
    const target = el ? { el, start: el.selectionStart, end: el.selectionEnd } : null;
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const files = Array.from(input.files || []);
      input.remove();
      if (files.length) openUploadDialog({ files, target, source: 'attach' });
    });
    document.body.appendChild(input);
    input.click();
  };

  const insertInactive = () => {
    const el = ref.current;
    insertIntoField(
      el,
      getCurrentTimestampAsText({ isActive: false }),
      el.selectionStart,
      el.selectionEnd
    );
  };

  // Enfoca en la app el encabezado que ocupa la posición `index` (tras volver a analizar)
  const narrowAppTo = (index, level) =>
    dispatch((d, getState) => {
      const headers = getState().org.present.getIn(['files', path, 'headers']) || List();
      const h = headers.get(index);
      if (h && h.get('nestingLevel') === level) {
        // Abrir los padres (y el propio encabezado): si no, un subencabezado quedaría oculto
        d({ type: 'OPEN_PARENTS_OF_HEADER', headerId: h.get('id') });
        d(openHeader(h.get('id')));
        d(narrowHeader(h.get('id')));
      }
    });

  const save = () => {
    if (!changed) {
      if (narrowChanged) {
        dispatch(widenHeader());
        if (narrow) narrowAppTo(narrow.index, narrow.level);
      }
      onClose();
      return;
    }
    let normalized = text.endsWith('\n') || text === '' ? text : text + '\n';
    let deleted = false;
    if (narrow) {
      const check = validateSubtreeText(normalized, narrow.level);
      if (check.empty) {
        // eslint-disable-next-line no-restricted-globals
        if (
          !window.confirm('El texto está vacío: se eliminará este encabezado entero. ¿Continuar?')
        )
          return;
        normalized = '';
        deleted = true;
      } else if (!check.ok) {
        if (!check.soft) {
          window.alert(check.reason);
          return;
        }
        // eslint-disable-next-line no-restricted-globals
        if (!window.confirm(check.reason + ' ¿Guardar de todos modos?')) return;
      }
      normalized = narrow.before + normalized + narrow.after;
    }
    // Se sale del narrow antes de volver a analizar (los ids de los encabezados cambian)
    dispatch(widenHeader());
    dispatch(parseFile(path, normalized));
    // Los encabezados reciben ids nuevos al volver a analizar el fichero: se vuelve a
    // enfocar (narrow) el encabezado que ocupa la misma posición.
    if (narrow && !deleted) narrowAppTo(narrow.index, narrow.level);
    dispatch(setDirty(true, path));
    dispatch(sync({ path, shouldSuppressMessages: true }));
    onClose();
  };

  const onKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      save();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    } else if (e.key === 'Tab' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      const el = ref.current;
      const { selectionStart: s, selectionEnd: t } = el;
      const next = text.slice(0, s) + '  ' + text.slice(t);
      setText(next);
      requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2));
    }
  };

  return ReactDOM.createPortal(
    <div className="eli-raw" role="dialog" aria-label="Editar como texto plano">
      <div className="eli-raw__bar">
        <button className="btn eli-raw__btn" onClick={cancel}>
          Cancelar
        </button>
        <div className="eli-raw__title">
          {narrow ? 'Texto plano: solo este encabezado' : 'Texto plano'}
          {changed ? ' •' : ''}
          <span className="eli-raw__path">{narrow ? `${path} › ${narrow.title}` : path}</span>
        </div>
        <button className="btn eli-raw__btn eli-raw__btn--primary" onClick={save}>
          Guardar
        </button>
      </div>
      <div className="eli-raw__tools" role="toolbar" aria-label="Herramientas">
        <button
          className="eli-raw__tool"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => openPlanning('SCHEDULED')}
          title="Programar (SCHEDULED) el encabezado donde está el cursor"
          data-testid="eli-raw-scheduled"
        >
          <i className="far fa-calendar-check" /> <span>SCHEDULED</span>
        </button>
        <button
          className="eli-raw__tool"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => openPlanning('DEADLINE')}
          title="Fecha límite (DEADLINE) del encabezado donde está el cursor"
          data-testid="eli-raw-deadline"
        >
          <i className="fas fa-calendar-check" /> <span>DEADLINE</span>
        </button>
        <button
          className="eli-raw__tool"
          onMouseDown={(e) => e.preventDefault()}
          onClick={insertInactive}
          title="Insertar la fecha de hoy como fecha inactiva"
          data-testid="eli-raw-inactive"
        >
          <i className="far fa-calendar-plus" /> <span>Fecha</span>
        </button>
        <button
          className="eli-raw__tool"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => insertLinkInto(ref.current, insertIntoField)}
          title="Insertar enlace [[enlace][descripción]]"
          data-testid="eli-raw-link"
        >
          <i className="fas fa-link" /> <span>Enlace</span>
        </button>
        <button
          className="eli-raw__tool"
          onMouseDown={(e) => e.preventDefault()}
          onClick={attach}
          title="Adjuntar archivos (se suben a assets/AAAA y se inserta el enlace)"
          data-testid="eli-raw-attach"
        >
          <i className="fas fa-paperclip" /> <span>Adjuntar</span>
        </button>
        <button
          className={'eli-raw__tool' + (narrow ? ' is-active' : '')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggleNarrow}
          title={
            narrow
              ? 'Widen: volver a ver el fichero entero'
              : 'Narrow subtree: editar solo el encabezado donde está el cursor'
          }
          data-testid="eli-raw-narrow"
        >
          <i className={narrow ? 'fas fa-expand' : 'fas fa-compress'} />{' '}
          <span>{narrow ? 'Widen' : 'Narrow'}</span>
        </button>
      </div>
      {planning && (
        <div className="eli-raw__planning" data-testid="eli-raw-planning">
          <strong>{planning.type}:</strong>
          <input
            type="date"
            value={planning.date}
            onChange={(e) => setPlanningPrompt({ ...planning, date: e.target.value })}
            aria-label="Fecha"
          />
          <input
            type="time"
            value={planning.time}
            onChange={(e) => setPlanningPrompt({ ...planning, time: e.target.value })}
            aria-label="Hora (opcional)"
          />
          <button className="btn eli-raw__btn eli-raw__btn--primary" onClick={applyPlanning}>
            Poner
          </button>
          <button className="btn eli-raw__btn" onClick={() => setPlanningPrompt(null)}>
            Cancelar
          </button>
        </div>
      )}
      <textarea
        ref={ref}
        className="eli-raw__textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        wrap="soft"
        autoFocus
      />
    </div>,
    ensurePortal('eli-raw-portal')
  );
}

// ---------------------------------------------------------------------------
// Vista de impresión / PDF

const noop = () => {};
const readOnlyHandlers = {
  shouldDisableActions: true,
  onTableSelect: undefined,
  onCheckboxClick: noop,
  onListItemSelect: noop,
  onEnterListTitleEditMode: noop,
  onExitListTitleEditMode: noop,
  onListTitleValueUpdate: noop,
  onEnterListContentsEditMode: noop,
  onExitListContentsEditMode: noop,
  onListContentsValueUpdate: noop,
  onAddNewListItem: noop,
  onRemoveListItem: noop,
  onTimestampClick: noop,
  selectedListItemId: null,
  inListTitleEditMode: false,
  inListContentsEditMode: false,
};

function PrintHeader({ header, baseLevel }) {
  const level = Math.min(6, Math.max(1, header.get('nestingLevel') - baseLevel + 1));
  const Tag = `h${level}`;
  const titleLine = header.get('titleLine');
  const todo = titleLine.get('todoKeyword');
  const tags = titleLine.get('tags') || [];
  const planning = header
    .get('planningItems')
    .filter(isRegularPlanningItem)
    .map((p) => `${p.get('type')}: ${renderAsText(p.get('timestamp'))}`)
    .join('   ');
  const encrypted = (header.get('rawDescription') || '').includes(PGP);

  return (
    <section className="eli-print__section">
      <Tag className="eli-print__heading">
        {todo && (
          <span className={`eli-print__todo eli-print__todo--${todo.toLowerCase()}`}>{todo} </span>
        )}
        <AttributedString
          parts={titleLine.get('title')}
          subPartDataAndHandlers={readOnlyHandlers}
        />
        {tags.size > 0 && (
          <span className="eli-print__tags">{tags.map((t) => `:${t}`).join('')}:</span>
        )}
      </Tag>
      {planning && <div className="eli-print__planning">{planning}</div>}
      {encrypted ? (
        <div className="eli-print__encrypted">[contenido cifrado]</div>
      ) : (
        <div className="eli-print__body">
          <AttributedString
            parts={header.get('description')}
            subPartDataAndHandlers={readOnlyHandlers}
          />
        </div>
      )}
    </section>
  );
}

function PrintPreview({ path, file, headerId, onClose }) {
  const headers = file.get('headers');
  let selected = headers;
  let title = fileTitle(path, file);
  if (headerId) {
    const root = headers.find((h) => h.get('id') === headerId);
    if (root) {
      selected = subheadersOfHeaderWithId(headers, headerId).unshift(root);
      title = root.getIn(['titleLine', 'rawTitle']).trim();
    }
  }
  const baseLevel = selected.size ? selected.first().get('nestingLevel') : 1;

  useEffect(() => {
    const prevTitle = document.title;
    // El título del documento es el nombre por defecto del PDF al guardar
    document.title = title.replace(/[\\/:*?"<>|]/g, '-');
    document.documentElement.classList.add('eli-printing');
    return () => {
      document.title = prevTitle;
      document.documentElement.classList.remove('eli-printing');
    };
  }, [title]);

  return ReactDOM.createPortal(
    <div className="eli-print" role="dialog" aria-label="Exportar a PDF">
      <div className="eli-print__bar eli-no-print">
        <button className="btn eli-raw__btn" onClick={onClose}>
          Cerrar
        </button>
        <div className="eli-raw__title">Vista previa</div>
        <button className="btn eli-raw__btn eli-raw__btn--primary" onClick={() => window.print()}>
          <i className="fas fa-file-pdf" /> PDF / Imprimir
        </button>
      </div>
      <div className="eli-print__hint eli-no-print">
        En el diálogo elige <strong>Guardar como PDF</strong> (Mac/Windows) o, en el iPhone,
        compartir → <strong>Guardar en Archivos</strong>.
      </div>
      <article className="eli-print__doc">
        {!headerId && <h1 className="eli-print__doctitle">{title}</h1>}
        {selected.map((h) => (
          <PrintHeader key={h.get('id')} header={h} baseLevel={headerId ? baseLevel : 0} />
        ))}
      </article>
    </div>,
    ensurePortal('eli-print-portal')
  );
}

// ---------------------------------------------------------------------------
// Ficheros principales

const selectFileSettings = (state) => state.org.present.get('fileSettings');

export const favoritePaths = (fileSettings) =>
  orderedFavoriteSettings(fileSettings)
    .map(({ s }) => s.get('path'))
    .toArray();

const fileName = (p) =>
  p
    .split('/')
    .pop()
    .replace(/\.org(_archive)?(\.gpg|\.asc)?$/i, '');
const fileDir = (p) => p.replace(/\/[^/]*$/, '') || '/';

function FavoritesPopup({ currentPath, onClose }) {
  const dispatch = useDispatch();
  const history = useHistory();
  const favorites = favoritePaths(useSelector(selectFileSettings));
  const canToggleCurrent = !!currentPath && !currentPath.startsWith(STATIC_FILE_PREFIX);
  const currentIsFavorite = favorites.includes(currentPath);

  // Teclado: Esc cierra; ↑/↓ eligen; Intro abre el elegido
  const [active, setActive] = useState(() => Math.max(0, favorites.indexOf(currentPath)));
  const keyState = useRef();
  keyState.current = { active, favorites };
  useEffect(() => {
    const onKey = (e) => {
      const { active: a, favorites: list } = keyState.current;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && list.length) {
        e.preventDefault();
        e.stopPropagation();
        setActive((a + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length);
      } else if (e.key === 'Enter' && list[a]) {
        e.preventDefault();
        e.stopPropagation();
        openRef.current(list[a]);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  const openRef = useRef();

  const open = (p) => {
    onClose();
    if (p === currentPath) return;
    // Cambiar de fichero como al volver al explorador: guardar el actual y soltarlo; si no,
    // organice redirige de vuelta al fichero abierto
    if (currentPath && !currentPath.startsWith(STATIC_FILE_PREFIX)) {
      dispatch(sync({ path: currentPath }));
    }
    dispatch(resetFileDisplay());
    history.push(`/file${p}`);
  };
  openRef.current = open;

  return ReactDOM.createPortal(
    <div className="eli-prompt__overlay" onClick={onClose}>
      <div className="eli-prompt__box eli-fav" onClick={(e) => e.stopPropagation()}>
        <div className="eli-prompt__title">
          <i className="fas fa-copy eli-fav__star" /> Ficheros principales
        </div>
        {favorites.length === 0 ? (
          <div className="eli-prompt__message">
            Aún no hay ninguno. Abre un fichero y márcalo aquí, o pulsa el icono de hojas junto a
            cada fichero en el explorador.
          </div>
        ) : (
          <ul className="eli-fav__list">
            {favorites.map((p, i) => (
              <li key={p}>
                <button
                  className={
                    'eli-fav__item' +
                    (p === currentPath ? ' is-current' : '') +
                    (i === active ? ' is-active' : '')
                  }
                  onClick={() => open(p)}
                >
                  <span className="eli-fav__name">
                    {/\.(gpg|asc)$/i.test(p) && <i className="fas fa-lock" />} {fileName(p)}
                  </span>
                  {fileDir(p) !== '/' && <span className="eli-fav__dir">{fileDir(p)}</span>}
                </button>
                <span className="eli-fav__order">
                  <button
                    className="eli-fav__move"
                    title="Subir"
                    disabled={i === 0}
                    onClick={() => dispatch(moveEliFavoriteFile(p, -1))}
                    data-testid={`eli-fav-up-${i}`}
                  >
                    <i className="fas fa-chevron-up" />
                  </button>
                  <button
                    className="eli-fav__move"
                    title="Bajar"
                    disabled={i === favorites.length - 1}
                    onClick={() => dispatch(moveEliFavoriteFile(p, 1))}
                    data-testid={`eli-fav-down-${i}`}
                  >
                    <i className="fas fa-chevron-down" />
                  </button>
                </span>
                <button
                  className="eli-fav__remove"
                  title="Quitar de principales"
                  onClick={() => dispatch(toggleEliFavoriteFile(p, false))}
                >
                  <i className="fas fa-times" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {canToggleCurrent && (
          <button
            className="btn eli-fav__toggle"
            onClick={() => dispatch(toggleEliFavoriteFile(currentPath, !currentIsFavorite))}
          >
            {currentIsFavorite ? (
              <>
                <i className="far fa-copy" /> Quitar «{fileName(currentPath)}»
              </>
            ) : (
              <>
                <i className="fas fa-copy" /> Añadir «{fileName(currentPath)}»
              </>
            )}
          </button>
        )}
        <div className="eli-fav__hint">
          También en Ajustes → File settings («Fichero principal»).
        </div>
        <div className="eli-prompt__buttons">
          <button className="btn eli-prompt__ok" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>,
    ensurePortal('eli-fav-portal')
  );
}

// ---------------------------------------------------------------------------
// Subida de archivos (pegar o clip): confirmación y tamaño de las imágenes

// Inserta texto en un <textarea>/<input> controlado por React en la posición indicada
export const insertIntoField = (el, text, start, end) => {
  const proto =
    el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  const value = el.value || '';
  const s = start == null ? value.length : start;
  const t = end == null ? s : end;
  setter.call(el, value.slice(0, s) + text + value.slice(t));
  el.dispatchEvent(new Event('input', { bubbles: true }));
  try {
    el.focus();
    el.setSelectionRange(s + text.length, s + text.length);
  } catch (e) {}
};

// Separa "foto.jpg" en ["foto", ".jpg"]
export const splitExt = (name) => {
  const m = /^(.+?)(\.[A-Za-z0-9]{1,8})?$/.exec(name || '');
  return m ? [m[1], m[2] || ''] : [name || '', ''];
};

// Nombre final: el que escribe el usuario (sin extensión) + la extensión real del fichero
export const renamedFile = (file, base) => {
  const [origBase, ext] = splitExt(file.name);
  const clean = (base || '')
    .replace(/[\\/:*?"<>|]/g, '')
    .split('')
    .filter((c) => c.charCodeAt(0) >= 32)
    .join('')
    .trim()
    .replace(/\.+$/, '');
  const finalBase = clean || origBase;
  if (finalBase === origBase) return file;
  return new File([file], finalBase + ext, { type: file.type, lastModified: file.lastModified });
};

const headerLabel = (h) =>
  `${'  '.repeat(Math.max(0, h.get('nestingLevel') - 1))}${h
    .getIn(['titleLine', 'rawTitle'])
    .trim()}`;

function UploadDialog({ request, path, headers, onClose }) {
  const dispatch = useDispatch();
  const { files: rawFiles, target, source } = request;
  const [prepared, setPrepared] = useState(null); // [{file, name, variants?}]
  const [size, setSize] = useState('medium');
  const [headerId, setHeaderId] = useState(
    request.headerId || (headers && headers.size ? headers.first().get('id') : null)
  );
  const [busy, setBusy] = useState(false);
  const [names, setNames] = useState([]); // nombres editables (sin extensión)

  useEffect(() => {
    let alive = true;
    (async () => {
      const list = [];
      for (const f of rawFiles) {
        const name = source === 'paste' ? pastedName(f) : f.name;
        if (isResizableImage(f)) {
          const info = await prepareImageVariants(f, name);
          list.push({ file: f, name, ...info });
        } else {
          list.push({
            file: f,
            name,
            variants: { original: new File([f], name, { type: f.type }) },
          });
        }
      }
      if (alive) {
        setPrepared(list);
        setNames(list.map((p) => splitExt(p.name)[0]));
      }
    })();
    return () => {
      alive = false;
    };
  }, [rawFiles, source]);

  const hasImages = prepared && prepared.some((p) => Object.keys(p.variants).length > 1);
  const pick = (p) => p.variants[size] || p.variants.original;
  const totalFor = (id) =>
    prepared
      ? prepared.reduce((acc, p) => acc + (p.variants[id] || p.variants.original).size, 0)
      : null;
  const originalTotal = rawFiles.reduce((a, f) => a + f.size, 0);

  const confirm = async () => {
    if (!prepared || busy) return;
    setBusy(true);
    const links = await dispatch(
      uploadFilesAndGetLinks(prepared.map((p, i) => renamedFile(pick(p), names[i])))
    );
    if (links.length) {
      if (target && target.el && document.body.contains(target.el)) {
        insertIntoField(target.el, links.join('\n'), target.start, target.end);
      } else if (headerId) {
        dispatch(appendLinesToHeader(headerId, links));
      }
    }
    onClose();
  };

  return ReactDOM.createPortal(
    <div className="eli-prompt__overlay">
      <div className="eli-prompt__box eli-upload" role="dialog" aria-label="Subir archivos">
        <div className="eli-prompt__title">
          <i className="fas fa-paperclip" /> {source === 'paste' ? 'Pegar' : 'Adjuntar'}{' '}
          {rawFiles.length === 1 ? 'archivo' : `${rawFiles.length} archivos`}
        </div>
        <ul className="eli-upload__files">
          {(prepared || rawFiles.map((f) => ({ file: f, name: f.name }))).map((p, i) => (
            <li key={i}>
              {p.variants && p.variants.original && /^image\//.test(p.file.type) ? (
                <i className="fas fa-image" />
              ) : (
                <i className="fas fa-file" />
              )}{' '}
              {prepared ? (
                <span className="eli-upload__name">
                  <input
                    type="text"
                    className="eli-upload__name-input"
                    aria-label="Nombre del archivo"
                    value={names[i] == null ? '' : names[i]}
                    onChange={(e) => {
                      const v = e.target.value;
                      setNames((prev) => prev.map((n, j) => (j === i ? v : n)));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        confirm();
                      }
                    }}
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    autoFocus={i === 0}
                    onFocus={(e) => e.target.select()}
                    data-testid={`eli-upload-name-${i}`}
                  />
                  <span className="eli-upload__ext">{splitExt(pick(p).name)[1]}</span>
                </span>
              ) : (
                p.name
              )}
              <span className="eli-upload__muted">
                {' '}
                · {formatBytes(p.file.size)}
                {p.width ? ` · ${p.width}×${p.height}` : ''}
              </span>
            </li>
          ))}
        </ul>

        {!prepared && (
          <div className="eli-upload__muted">
            <i className="fas fa-spinner fa-spin" /> Calculando tamaños…
          </div>
        )}

        {hasImages && (
          <div className="eli-upload__sizes" role="radiogroup" aria-label="Tamaño de la imagen">
            {IMAGE_SIZES.map((s, i) => (
              <label
                key={s.id}
                className={'eli-upload__size' + (size === s.id ? ' is-selected' : '')}
              >
                <input
                  type="radio"
                  name="eli-size"
                  checked={size === s.id}
                  onChange={() => setSize(s.id)}
                />
                <span className="eli-upload__size-name">
                  {i + 1}) {s.label}
                </span>
                <span className="eli-upload__size-detail">
                  {s.max ? `hasta ${s.max} px` : 'sin cambios'}
                </span>
                <span className="eli-upload__size-weight">{formatBytes(totalFor(s.id))}</span>
              </label>
            ))}
          </div>
        )}

        {prepared && !hasImages && (
          <div className="eli-upload__muted">Tamaño total: {formatBytes(originalTotal)}</div>
        )}

        <div className="eli-upload__dest">
          Se guardará en <code>assets/{new Date().getFullYear()}/</code> junto al fichero y se
          añadirá el enlace{' '}
          {target && target.el ? (
            'en el texto que estás editando.'
          ) : headers && headers.size ? (
            <>
              al encabezado:{' '}
              <select value={headerId || ''} onChange={(e) => setHeaderId(e.target.value)}>
                {headers.map((h) => (
                  <option key={h.get('id')} value={h.get('id')}>
                    {headerLabel(h)}
                  </option>
                ))}
              </select>
            </>
          ) : (
            '(el fichero no tiene encabezados).'
          )}
        </div>
        {isEncryptedPath(path) && (
          <div className="eli-upload__warn">
            Este fichero está cifrado, pero los adjuntos se guardan SIN cifrar en Dropbox.
          </div>
        )}
        <div className="eli-prompt__buttons">
          <button className="btn eli-prompt__cancel" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button
            className="btn eli-prompt__ok"
            onClick={confirm}
            disabled={!prepared || busy || (!headerId && !(target && target.el))}
            data-testid="eli-upload-confirm"
          >
            {busy ? 'Subiendo…' : 'Subir'}
          </button>
        </div>
      </div>
    </div>,
    ensurePortal('eli-upload-portal')
  );
}

// ---------------------------------------------------------------------------
// Fases de la Luna (como `M-x lunar-phases` de Emacs)

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function MoonPhases({ onClose }) {
  const now = new Date();
  const [offset, setOffset] = useState(0); // meses respecto al actual
  const center = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const phases = phasesForThreeMonths(center.getFullYear(), center.getMonth());
  const state = moonState(now);
  const dayFmt = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const timeFmt = new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
  const monthFmt = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });
  const from = new Date(center.getFullYear(), center.getMonth() - 1, 1);
  const to = new Date(center.getFullYear(), center.getMonth() + 1, 1);
  const todayKey = now.toDateString();

  return ReactDOM.createPortal(
    <div className="eli-prompt__overlay" onClick={onClose}>
      <div className="eli-prompt__box eli-moon" onClick={(e) => e.stopPropagation()}>
        <div className="eli-prompt__title">Fases de la Luna</div>
        <div className="eli-moon__today">
          <span className="eli-moon__big">{state.emoji}</span>
          <span>
            Hoy: <strong>{state.name}</strong>
            <br />
            {Math.round(state.illumination * 100)} % iluminada ·{' '}
            {state.age.toFixed(1).replace('.', ',')} días
          </span>
        </div>
        <div className="eli-moon__nav">
          <button
            className="btn"
            onClick={() => setOffset(offset - 1)}
            aria-label="Meses anteriores"
          >
            <i className="fas fa-chevron-left" />
          </button>
          <span>
            {capitalize(monthFmt.format(from))} – {monthFmt.format(to)}
          </span>
          <button
            className="btn"
            onClick={() => setOffset(offset + 1)}
            aria-label="Meses siguientes"
          >
            <i className="fas fa-chevron-right" />
          </button>
        </div>
        <ul className="eli-moon__list">
          {phases.map((p) => {
            const isPast = p.date < now;
            return (
              <li
                key={p.date.toISOString()}
                className={
                  (isPast ? 'is-past ' : '') +
                  (p.date.toDateString() === todayKey ? 'is-today' : '')
                }
              >
                <span className="eli-moon__emoji">{p.emoji}</span>
                <span className="eli-moon__date">{capitalize(dayFmt.format(p.date))}</span>
                <span className="eli-moon__phase">
                  {p.name} <span className="eli-moon__time">{timeFmt.format(p.date)}</span>
                </span>
              </li>
            );
          })}
        </ul>
        <div className="eli-prompt__buttons">
          {offset !== 0 && (
            <button className="btn" onClick={() => setOffset(0)}>
              Hoy
            </button>
          )}
          <button className="btn eli-prompt__ok" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>,
    ensurePortal('eli-moon-portal')
  );
}

// ---------------------------------------------------------------------------

const selectPath = (state) => state.org.present.get('path');
const selectFiles = (state) => state.org.present.get('files');
const selectDontIndent = (state) => state.base.get('shouldNotIndentOnExport');

export default function EliTools() {
  const path = useSelector(selectPath);
  const files = useSelector(selectFiles);
  const file = path && files ? files.get(path) : null;
  const dontIndent = useSelector(selectDontIndent);
  const usable = !!path && !!file && !!file.get('headers') && !path.startsWith(STATIC_FILE_PREFIX);
  const [raw, setRaw] = useState(null); // { path, text }
  const [print, setPrint] = useState(null); // { headerId }
  const [favorites, setFavorites] = useState(false);
  const [upload, setUpload] = useState(null); // { files, headerId?, target?, source }
  const [moon, setMoon] = useState(false);

  useEffect(() => {
    const onFav = () => setFavorites(true);
    const onMoon = () => setMoon(true);
    const onUpload = (e) => setUpload(e.detail);
    window.addEventListener('eli:favorites', onFav);
    window.addEventListener('eli:moon', onMoon);
    window.addEventListener('eli:upload', onUpload);
    return () => {
      window.removeEventListener('eli:favorites', onFav);
      window.removeEventListener('eli:moon', onMoon);
      window.removeEventListener('eli:upload', onUpload);
    };
  }, []);

  // Pegar archivos o imágenes desde el portapapeles
  useEffect(() => {
    const onPaste = (e) => {
      if (!usable || !e.clipboardData) return;
      const pasted = Array.from(e.clipboardData.files || []);
      if (!pasted.length) return;
      const active = document.activeElement;
      const isField =
        !!active &&
        (active.tagName === 'TEXTAREA' ||
          (active.tagName === 'INPUT' && /^(text|search)$/i.test(active.type)));
      const text = (e.clipboardData.getData && e.clipboardData.getData('text/plain')) || '';
      // Si hay texto y se pega en un campo de texto, se respeta el pegado normal
      if (isField && text.trim()) return;
      if (active && active.closest && active.closest('.eli-prompt__overlay')) return;
      e.preventDefault();
      setUpload({
        files: pasted,
        source: 'paste',
        headerId: file.get('selectedHeaderId') || file.get('narrowedHeaderId') || null,
        target: isField
          ? { el: active, start: active.selectionStart, end: active.selectionEnd }
          : null,
      });
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [usable, file]);

  useEffect(() => {
    const onRaw = () => {
      if (!usable) return;
      const headers = file.get('headers');
      const linesBeforeHeadings = file.get('linesBeforeHeadings') || List();
      const narrowedId = file.get('narrowedHeaderId');
      const index = narrowedId ? headers.findIndex((h) => h.get('id') === narrowedId) : -1;
      if (index >= 0) {
        // Modo narrow: solo el encabezado enfocado y sus subencabezados
        const root = headers.get(index);
        const end = index + 1 + subheadersOfHeaderWithId(headers, narrowedId).size;
        const part = (hs, lines) =>
          exportOrg({ headers: hs, linesBeforeHeadings: lines, dontIndent });
        setRaw({
          path,
          text: part(headers.slice(index, end), List()),
          narrow: {
            index,
            level: root.get('nestingLevel'),
            title: root.getIn(['titleLine', 'rawTitle']).trim(),
            before: part(headers.slice(0, index), linesBeforeHeadings),
            after: part(headers.slice(end), List()),
          },
        });
        return;
      }
      setRaw({ path, text: exportOrg({ headers, linesBeforeHeadings, dontIndent }) });
    };
    const onPrint = (e) => {
      if (!usable) return;
      setPrint({ headerId: (e.detail && e.detail.headerId) || null });
    };
    window.addEventListener('eli:raw-edit', onRaw);
    window.addEventListener('eli:print', onPrint);
    return () => {
      window.removeEventListener('eli:raw-edit', onRaw);
      window.removeEventListener('eli:print', onPrint);
    };
  }, [usable, path, file, dontIndent]);

  return (
    <>
      {raw && (
        <RawEditor
          path={raw.path}
          initialText={raw.text}
          narrow={raw.narrow}
          dontIndent={dontIndent}
          onClose={() => setRaw(null)}
        />
      )}
      {favorites && <FavoritesPopup currentPath={path} onClose={() => setFavorites(false)} />}
      {moon && <MoonPhases onClose={() => setMoon(false)} />}
      {upload && usable && (
        <UploadDialog
          request={upload}
          path={path}
          headers={file.get('headers')}
          onClose={() => setUpload(null)}
        />
      )}
      {print && usable && (
        <PrintPreview
          path={path}
          file={file}
          headerId={print.headerId}
          onClose={() => setPrint(null)}
        />
      )}
    </>
  );
}
