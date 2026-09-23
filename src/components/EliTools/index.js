import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useDispatch, useSelector } from 'react-redux';

import './stylesheet.css';

import AttributedString from '../OrgFile/components/AttributedString';
import { exportOrg } from '../../lib/export_org';
import { subheadersOfHeaderWithId, isRegularPlanningItem, STATIC_FILE_PREFIX } from '../../lib/org_utils';
import { renderAsText } from '../../lib/timestamps';
import { parseFile, setDirty, sync } from '../../actions/org';

// ORG Mode para Eli: herramientas de fichero
//  - Editar el fichero abierto como texto plano (como en un búfer de Emacs)
//  - Exportar un encabezado con sus subencabezados, o el fichero entero, a PDF
// Se activan con eventos de ventana para no tocar los componentes de organice:
//   window.dispatchEvent(new CustomEvent('eli:raw-edit'))
//   window.dispatchEvent(new CustomEvent('eli:print', { detail: { headerId } }))

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

function RawEditor({ path, initialText, onClose }) {
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
    if (changed) {
      const normalized = text.endsWith('\n') ? text : text + '\n';
      dispatch(parseFile(path, normalized));
      dispatch(setDirty(true, path));
      dispatch(sync({ path, shouldSuppressMessages: true }));
    }
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
          Texto plano{changed ? ' •' : ''}
          <span className="eli-raw__path">{path}</span>
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

  const usable = !!path && !!file && !!file.get('headers') && !path.startsWith(STATIC_FILE_PREFIX);

  useEffect(() => {
    const onRaw = () => {
      if (!usable) return;
      setRaw({
        path,
        text: exportOrg({
          headers: file.get('headers'),
          linesBeforeHeadings: file.get('linesBeforeHeadings'),
          dontIndent,
        }),
      });
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
      {raw && <RawEditor path={raw.path} initialText={raw.text} onClose={() => setRaw(null)} />}
      {print && usable && (
        <PrintPreview path={path} file={file} headerId={print.headerId} onClose={() => setPrint(null)} />
      )}
    </>
  );
}
