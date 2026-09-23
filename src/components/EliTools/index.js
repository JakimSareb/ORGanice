import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router-dom';

import './stylesheet.css';

import AttributedString from '../OrgFile/components/AttributedString';
import { exportOrg } from '../../lib/export_org';
import { subheadersOfHeaderWithId, isRegularPlanningItem, STATIC_FILE_PREFIX } from '../../lib/org_utils';
import { renderAsText } from '../../lib/timestamps';
import {
  parseFile,
  setDirty,
  sync,
  narrowHeader,
  widenHeader,
  toggleEliFavoriteFile,
} from '../../actions/org';
import { List } from 'immutable';

// ORG Mode para Eli: herramientas de fichero
//  - Editar el fichero abierto como texto plano (como en un búfer de Emacs)
//  - Exportar un encabezado con sus subencabezados, o el fichero entero, a PDF
// Se activan con eventos de ventana para no tocar los componentes de organice:
//   window.dispatchEvent(new CustomEvent('eli:raw-edit'))
//   window.dispatchEvent(new CustomEvent('eli:print', { detail: { headerId } }))

export const openFavorites = () => window.dispatchEvent(new CustomEvent('eli:favorites'));
export const openRawEditor = () => window.dispatchEvent(new CustomEvent('eli:raw-edit'));
export const openPrintPreview = (headerId = null) =>
  window.dispatchEvent(new CustomEvent('eli:print', { detail: { headerId } }));

const PGP = '-----BEGIN PGP MESSAGE-----';

const fileTitle = (path, file) => {
  const lines = (file && file.get('linesBeforeHeadings')) || [];
  const titleLine = (lines.toJS ? lines.toJS() : lines).find((l) => /^#\+TITLE:/i.test(l));
  if (titleLine) return titleLine.replace(/^#\+TITLE:\s*/i, '').trim();
  return (path || '').split('/').pop().replace(/\.org(_archive)?(\.gpg|\.asc)?$/i, '');
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
  if (!m) return { ok: false, reason: 'La primera línea debe ser el encabezado (empezar por asteriscos).' };
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

function RawEditor({ path, initialText, narrow, onClose }) {
  const dispatch = useDispatch();
  const [text, setText] = useState(initialText);
  const ref = useRef(null);
  const changed = text !== initialText;

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

  const save = () => {
    if (!changed) {
      onClose();
      return;
    }
    let normalized = text.endsWith('\n') || text === '' ? text : text + '\n';
    let deleted = false;
    if (narrow) {
      const check = validateSubtreeText(normalized, narrow.level);
      if (check.empty) {
        // eslint-disable-next-line no-restricted-globals
        if (!window.confirm('El texto está vacío: se eliminará este encabezado entero. ¿Continuar?')) return;
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
    if (narrow) dispatch(widenHeader());
    dispatch(parseFile(path, normalized));
    if (narrow && !deleted) {
      // Los encabezados reciben ids nuevos al volver a analizar el fichero: se vuelve a
      // enfocar (narrow) el encabezado que ocupa la misma posición.
      dispatch((d, getState) => {
        const headers = getState().org.present.getIn(['files', path, 'headers']) || List();
        const h = headers.get(narrow.index);
        if (h && h.get('nestingLevel') === narrow.level) d(narrowHeader(h.get('id')));
      });
    }
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
        {todo && <span className={`eli-print__todo eli-print__todo--${todo.toLowerCase()}`}>{todo} </span>}
        <AttributedString parts={titleLine.get('title')} subPartDataAndHandlers={readOnlyHandlers} />
        {tags.size > 0 && <span className="eli-print__tags">{tags.map((t) => `:${t}`).join('')}:</span>}
      </Tag>
      {planning && <div className="eli-print__planning">{planning}</div>}
      {encrypted ? (
        <div className="eli-print__encrypted">[contenido cifrado]</div>
      ) : (
        <div className="eli-print__body">
          <AttributedString parts={header.get('description')} subPartDataAndHandlers={readOnlyHandlers} />
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
  (fileSettings || List())
    .filter((s) => s.get('eliFavorite') && s.get('path'))
    .map((s) => s.get('path'))
    .toArray();

const fileName = (p) => p.split('/').pop().replace(/\.org(_archive)?(\.gpg|\.asc)?$/i, '');
const fileDir = (p) => p.replace(/\/[^/]*$/, '') || '/';

function FavoritesPopup({ currentPath, onClose }) {
  const dispatch = useDispatch();
  const history = useHistory();
  const favorites = favoritePaths(useSelector(selectFileSettings));
  const canToggleCurrent = !!currentPath && !currentPath.startsWith(STATIC_FILE_PREFIX);
  const currentIsFavorite = favorites.includes(currentPath);

  const open = (p) => {
    onClose();
    history.push(`/file${p}`);
  };

  return ReactDOM.createPortal(
    <div className="eli-prompt__overlay" onClick={onClose}>
      <div className="eli-prompt__box eli-fav" onClick={(e) => e.stopPropagation()}>
        <div className="eli-prompt__title">
          <i className="fas fa-star eli-fav__star" /> Ficheros principales
        </div>
        {favorites.length === 0 ? (
          <div className="eli-prompt__message">
            Aún no hay ninguno. Abre un fichero y márcalo aquí, o usa la ☆ del explorador de
            ficheros.
          </div>
        ) : (
          <ul className="eli-fav__list">
            {favorites.map((p) => (
              <li key={p}>
                <button
                  className={'eli-fav__item' + (p === currentPath ? ' is-current' : '')}
                  onClick={() => open(p)}
                >
                  <span className="eli-fav__name">
                    {/\.(gpg|asc)$/i.test(p) && <i className="fas fa-lock" />} {fileName(p)}
                  </span>
                  <span className="eli-fav__dir">{fileDir(p)}</span>
                </button>
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
                <i className="far fa-star" /> Quitar «{fileName(currentPath)}»
              </>
            ) : (
              <>
                <i className="fas fa-star" /> Añadir «{fileName(currentPath)}»
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

const selectPath = (state) => state.org.present.get('path');
const selectFiles = (state) => state.org.present.get('files');
const selectDontIndent = (state) => state.base.get('shouldNotIndentOnExport');

export default function EliTools() {
  const path = useSelector(selectPath);
  const files = useSelector(selectFiles);
  const file = path && files ? files.get(path) : null;
  const dontIndent = useSelector(selectDontIndent);
  const [raw, setRaw] = useState(null); // { path, text }
  const [print, setPrint] = useState(null); // { headerId }
  const [favorites, setFavorites] = useState(false);

  useEffect(() => {
    const onFav = () => setFavorites(true);
    window.addEventListener('eli:favorites', onFav);
    return () => window.removeEventListener('eli:favorites', onFav);
  }, []);

  const usable = !!path && !!file && !!file.get('headers') && !path.startsWith(STATIC_FILE_PREFIX);

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
        const part = (hs, lines) => exportOrg({ headers: hs, linesBeforeHeadings: lines, dontIndent });
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
          onClose={() => setRaw(null)}
        />
      )}
      {favorites && <FavoritesPopup currentPath={path} onClose={() => setFavorites(false)} />}
      {print && usable && (
        <PrintPreview path={path} file={file} headerId={print.headerId} onClose={() => setPrint(null)} />
      )}
    </>
  );
}
