// ORG Mode para Eli (4.31): vistas sobre el índice común de cabeceras (lib/eli_heading_index):
//   - Vista por etiqueta (tocar una etiqueta): todas las cabeceras con esa etiqueta de todos los
//     ficheros cargados (sin diario ni mensual), por fichero, con notas y subcabeceras plegables.
//   - Referencias entrantes («Quién enlaza aquí», y al pie de la cabecera vista sola): las
//     cabeceras con [[id:…]] a la seleccionada.
//   - Al escribir «[[» (título/notas) o «#» (título de Documentos): los buscadores de
//     lib/eli_heading_links.
//   - Pasar el ratón por un enlace [[id:…]]: título y principio de las notas del destino.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';

import './stylesheet.css';

import {
  headingIndex,
  entriesWithTags,
  backlinkEntries,
  childrenOf,
  groupByPath,
  fileNameOf,
  hashStartsWord,
  openedDoubleBracket,
  notePreview,
  nestEntries,
  filterEntries,
  linkingParagraph,
  splitLinkParts,
} from '../../lib/eli_heading_index';
import { insertHeadingLink, pickTagForTitle } from '../../lib/eli_heading_links';
import { selectHeaderAndOpenParents, loadFileQuietly } from '../../actions/org';
import { insertIntoField } from '../EliTools';

export { openTagView, openBacklinks } from '../../lib/eli_heading_events';

// Campos donde «[[» abre el buscador (Documentos y editor de tarea de GTD)
const TITLE_FIELDS = '.title-line__edit-container textarea';
const LINK_FIELDS =
  `${TITLE_FIELDS}, .header-content__edit-container textarea, textarea.eli-note-textarea, ` +
  '[data-testid="gtd-editor-title"], [data-testid="gtd-editor-notes"]';

const selectFiles = (s) => s.org.present.get('files');

// Ir a la cabecera en su documento
export const useGoToHeading = () => {
  const dispatch = useDispatch();
  const store = useStore();
  return async (entry, after) => {
    if (!store.getState().org.present.getIn(['files', entry.path, 'headers']))
      await dispatch(loadFileQuietly(entry.path));
    window.dispatchEvent(new CustomEvent('eli:navigate', { detail: `/file${entry.path}` }));
    dispatch(selectHeaderAndOpenParents(entry.path, entry.headerId, { widen: true }));
    if (after) after();
  };
};

// Una cabecera con ▸ (notas y subcabeceras plegables). (4.35) `node.children` = resultados de la
// lista que cuelgan de esta (indentados y plegables con su propio ▸/▾). `paragraphFor` (solo en
// «Quién enlaza aquí»): enseña el párrafo que enlaza y un botón «Ver el resto».
const Item = ({
  node,
  index,
  onGo,
  depth = 0,
  showContext = false,
  preview = false,
  paragraphFor = null,
}) => {
  const entry = node.entry;
  const nested = node.children || [];
  const [open, setOpen] = useState(false);
  const [showNested, setShowNested] = useState(true);
  const nestedIds = useMemo(() => new Set(nested.map((n) => n.entry.headerId)), [nested]);
  const own = useMemo(() => childrenOf(index, entry).filter((k) => !nestedIds.has(k.headerId)), [
    index,
    entry,
    nestedIds,
  ]);
  const hasMore = !!entry.notes.trim() || own.length > 0;
  const previewLines = useMemo(() => (preview ? notePreview(entry.notes, 2) : []), [
    preview,
    entry,
  ]);
  const paragraphs = useMemo(() => (paragraphFor ? paragraphFor(entry) : []), [
    paragraphFor,
    entry,
  ]);
  return (
    <li className="eli-hv__item" data-testid="eli-hv-item">
      <div className="eli-hv__row">
        <button
          type="button"
          className={'eli-hv__fold' + (hasMore ? '' : ' is-empty')}
          onClick={() => hasMore && setOpen(!open)}
          aria-label={open ? 'Plegar' : 'Desplegar'}
          data-testid="eli-hv-fold"
        >
          {hasMore ? (open ? '▾' : '▸') : '•'}
        </button>
        <button
          type="button"
          className="eli-hv__title"
          onClick={() => onGo(entry)}
          data-testid="eli-hv-title"
        >
          {entry.keyword && <span className="eli-hv__kw">{entry.keyword}</span>}
          {entry.title || '(sin título)'}
          {entry.ownTags.length > 0 && (
            <span className="eli-hv__tags">{entry.ownTags.join(' ')}</span>
          )}
        </button>
        {nested.length > 0 && (
          <button
            type="button"
            className="eli-hv__nest"
            onClick={() => setShowNested(!showNested)}
            aria-label={showNested ? 'Ocultar subcabeceras' : 'Mostrar subcabeceras'}
            data-testid="eli-hv-nest"
          >
            {showNested ? '▾' : '▸'} {nested.length}
          </button>
        )}
      </div>
      {showContext && entry.parents.length > 0 && (
        <div className="eli-hv__ctx">{entry.parents.join(' › ')}</div>
      )}
      {paragraphs.length > 0 && (
        <div className="eli-hv__links" data-testid="eli-hv-link-paragraphs">
          {paragraphs.map((p, i) => (
            <div key={i} className="eli-hv__link-par" data-testid="eli-hv-link-paragraph">
              {p.map((part, j) =>
                part.link ? (
                  <mark key={j} className="eli-hv__link-mark">
                    {part.text}
                  </mark>
                ) : (
                  <span key={j}>{part.text}</span>
                )
              )}
            </div>
          ))}
          {hasMore && (
            <button
              type="button"
              className="eli-hv__more"
              onClick={() => setOpen(!open)}
              data-testid="eli-hv-more"
            >
              {open ? 'Ocultar' : 'Ver el resto'}
            </button>
          )}
        </div>
      )}
      {preview && !open && previewLines.length > 0 && (
        <div className="eli-hv__preview" data-testid="eli-hv-preview">
          {previewLines.map((l, i) => (
            <div key={i} className="eli-hv__preview-line">
              {l}
            </div>
          ))}
        </div>
      )}
      {open && (
        <div className="eli-hv__body">
          {entry.notes.trim() && <div className="eli-hv__notes">{entry.notes.trim()}</div>}
          {own.length > 0 && (
            <ul className="eli-hv__list">
              {own.map((k) => (
                <Item
                  key={k.headerId}
                  node={{ entry: k, children: [] }}
                  index={index}
                  onGo={onGo}
                  depth={depth + 1}
                />
              ))}
            </ul>
          )}
        </div>
      )}
      {nested.length > 0 && showNested && (
        <ul className="eli-hv__list eli-hv__list--nested" data-testid="eli-hv-nested">
          {nested.map((n) => (
            <Item
              key={`${n.entry.path}|${n.entry.headerId}`}
              node={n}
              index={index}
              onGo={onGo}
              depth={depth + 1}
              showContext={false}
              preview={preview}
              paragraphFor={paragraphFor}
            />
          ))}
        </ul>
      )}
    </li>
  );
};

export const Groups = ({
  entries,
  index,
  onGo,
  showContext,
  preview = false,
  paragraphFor = null,
}) => (
  <div className="eli-hv__groups">
    {groupByPath(entries).map((g) => (
      <section key={g.path} className="eli-hv__group" data-testid="eli-hv-group">
        <h4 className="eli-hv__file">
          <i className="fas fa-file-alt" /> {fileNameOf(g.path)}
          <span className="eli-hv__count">{g.entries.length}</span>
        </h4>
        <ul className="eli-hv__list">
          {nestEntries(g.entries).map((n) => (
            <Item
              key={`${n.entry.path}|${n.entry.headerId}`}
              node={n}
              index={index}
              onGo={onGo}
              showContext={showContext}
              preview={preview}
              paragraphFor={paragraphFor}
            />
          ))}
        </ul>
      </section>
    ))}
  </div>
);

const TagView = ({ tag, onClose }) => {
  const files = useSelector(selectFiles);
  const index = useMemo(() => headingIndex(files, { skipDiary: true }), [files]);
  const [inherited, setInherited] = useState(true);
  // (4.35) interruptores pasajeros (apagados al abrir la vista)
  const [hideArchived, setHideArchived] = useState(false);
  const [hideTasks, setHideTasks] = useState(false);
  const [extra, setExtra] = useState([]);
  const go = useGoToHeading();
  const entries = useMemo(
    () =>
      filterEntries(entriesWithTags(index, [tag, ...extra], { inherited }), {
        hideArchived,
        hideTasks,
      }),
    [index, tag, extra, inherited, hideArchived, hideTasks]
  );
  // Otras etiquetas de lo que sale (para afinar), como la barra de filtros de GTD
  const coTags = useMemo(() => {
    const counts = new Map();
    entries.forEach((e) =>
      (inherited ? e.tags : e.ownTags).forEach((t) => {
        const k = t.toLowerCase();
        if (k === tag.toLowerCase() || extra.some((x) => x.toLowerCase() === k)) return;
        counts.set(t, (counts.get(t) || 0) + 1);
      })
    );
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 24)
      .map(([t]) => t);
  }, [entries, inherited, tag, extra]);
  return (
    <Overlay
      title={
        <>
          <i className="fas fa-tag" /> {tag}
        </>
      }
      count={entries.length}
      onClose={onClose}
      testId="eli-tag-view"
    >
      <div className="eli-hv__filters" data-testid="eli-tag-view-filters">
        <label className="eli-hv__inherit">
          <input
            type="checkbox"
            checked={inherited}
            onChange={(e) => setInherited(e.target.checked)}
            data-testid="eli-tag-view-inherited"
          />{' '}
          Incluir heredadas
        </label>
        <label className="eli-hv__inherit">
          <input
            type="checkbox"
            checked={hideArchived}
            onChange={(e) => setHideArchived(e.target.checked)}
            data-testid="eli-tag-view-hide-archived"
          />{' '}
          Ocultar archivadas
        </label>
        <label className="eli-hv__inherit">
          <input
            type="checkbox"
            checked={hideTasks}
            onChange={(e) => setHideTasks(e.target.checked)}
            data-testid="eli-tag-view-hide-tasks"
          />{' '}
          Ocultar tareas
        </label>
        {extra.map((t) => (
          <button
            type="button"
            key={t}
            className="eli-hv__chip is-on"
            onClick={() => setExtra(extra.filter((x) => x !== t))}
          >
            {t} ✕
          </button>
        ))}
        {coTags.map((t) => (
          <button
            type="button"
            key={t}
            className="eli-hv__chip"
            onClick={() => setExtra([...extra, t])}
          >
            {t}
          </button>
        ))}
      </div>
      {entries.length ? (
        <Groups entries={entries} index={index} onGo={(e) => go(e, onClose)} showContext preview />
      ) : (
        <div className="eli-hv__empty">Ninguna cabecera con esta etiqueta.</div>
      )}
    </Overlay>
  );
};

const BacklinksView = ({ path, headerId, onClose }) => {
  const files = useSelector(selectFiles);
  const index = useMemo(() => headingIndex(files), [files]);
  const go = useGoToHeading();
  const self = useMemo(
    () => ((index.byPath && index.byPath.get(path)) || []).find((e) => e.headerId === headerId),
    [index, path, headerId]
  );
  const refs = useMemo(() => (self && self.orgId ? backlinkEntries(index, self.orgId) : []), [
    index,
    self,
  ]);
  // (4.35) de cada resultado, solo el párrafo que enlaza (el enlace resaltado) + «Ver el resto»
  const paragraphFor = useMemo(
    () =>
      self && self.orgId
        ? (e) => linkingParagraph(e, self.orgId).map((p) => splitLinkParts(p, self.orgId))
        : null,
    [self]
  );
  return (
    <Overlay
      title={
        <>
          <i className="fas fa-link" /> Quién enlaza a «{self ? self.title : '…'}»
        </>
      }
      count={refs.length}
      onClose={onClose}
      testId="eli-backlinks"
    >
      {!self || !self.orgId ? (
        <div className="eli-hv__empty" data-testid="eli-backlinks-none">
          Sin enlaces: esta cabecera aún no tiene :ID:, así que nada la enlaza.
        </div>
      ) : refs.length ? (
        <Groups
          entries={refs}
          index={index}
          onGo={(e) => go(e, onClose)}
          showContext
          paragraphFor={paragraphFor}
        />
      ) : (
        <div className="eli-hv__empty" data-testid="eli-backlinks-none">
          Sin enlaces: ninguna cabecera de los ficheros abiertos enlaza aquí.
        </div>
      )}
    </Overlay>
  );
};

const Overlay = ({ title, count, onClose, testId, children }) => {
  const overlayRef = useRef(null);
  const scrollRef = useRef(null);
  // (4.34) El fondo no se mueve mientras la vista está abierta: al plegar un elemento la lista
  // podía quedar sin recorrido y el gesto de scroll pasaba a la pantalla de detrás
  useEffect(() => {
    document.body.classList.add('eli-hv-open');
    const el = overlayRef.current;
    // (4.35) solo se bloquea el gesto FUERA de la lista; dentro manda su propio scroll
    // (`overscroll-behavior: contain` evita que pase al fondo)
    const onTouch = (e) => {
      const sc = scrollRef.current;
      if (!sc || !sc.contains(e.target)) e.preventDefault();
    };
    const onWheel = (e) => {
      const sc = scrollRef.current;
      if (!sc || !sc.contains(e.target)) e.preventDefault();
    };
    if (el) {
      el.addEventListener('touchmove', onTouch, { passive: false });
      el.addEventListener('wheel', onWheel, { passive: false });
    }
    return () => {
      document.body.classList.remove('eli-hv-open');
      if (el) {
        el.removeEventListener('touchmove', onTouch);
        el.removeEventListener('wheel', onWheel);
      }
    };
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !document.querySelector('.eli-prompt__overlay')) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="eli-hv__overlay" onClick={onClose} ref={overlayRef}>
      <div className="eli-hv__box" data-testid={testId} onClick={(e) => e.stopPropagation()}>
        <div className="eli-hv__head">
          <div className="eli-hv__heading">{title}</div>
          <span className="eli-hv__total" data-testid={`${testId}-count`}>
            {count}
          </span>
          <button
            type="button"
            className="eli-hv__close"
            onClick={onClose}
            aria-label="Cerrar"
            data-testid={`${testId}-close`}
          >
            <i className="fas fa-times" />
          </button>
        </div>
        <div className="eli-hv__scroll" ref={scrollRef}>
          {children}
        </div>
      </div>
    </div>
  );
};

// Bloque plegado «Referencias» al pie de la cabecera vista sola (narrow), como en Logseq
export const EliNarrowRefs = ({ path, headerId }) => {
  const files = useSelector(selectFiles);
  const index = useMemo(() => headingIndex(files), [files]);
  const go = useGoToHeading();
  const self = useMemo(
    () => ((index.byPath && index.byPath.get(path)) || []).find((e) => e.headerId === headerId),
    [index, path, headerId]
  );
  const refs = useMemo(() => (self && self.orgId ? backlinkEntries(index, self.orgId) : []), [
    index,
    self,
  ]);
  if (!refs.length) return null;
  return (
    <details className="eli-narrow-refs" data-testid="eli-narrow-refs">
      <summary>
        <i className="fas fa-link" /> Referencias{' '}
        <span className="eli-hv__count">{refs.length}</span>
      </summary>
      <Groups entries={refs} index={index} onGo={(e) => go(e)} showContext />
    </details>
  );
};

export default function EliHeadingViews() {
  const dispatch = useDispatch();
  const store = useStore();
  const [view, setView] = useState(null);

  useEffect(() => {
    const onTag = (e) => e.detail && e.detail.tag && setView({ kind: 'tag', tag: e.detail.tag });
    const onRefs = (e) => e.detail && setView({ kind: 'refs', ...e.detail });
    window.addEventListener('eli:tag-view', onTag);
    window.addEventListener('eli:backlinks', onRefs);
    return () => {
      window.removeEventListener('eli:tag-view', onTag);
      window.removeEventListener('eli:backlinks', onRefs);
    };
  }, []);

  // «[[» y «#» mientras se escribe
  useEffect(() => {
    const onInput = (e) => {
      const el = e.target;
      if (!el || !el.matches || !el.matches(LINK_FIELDS)) return;
      if (e.isComposing) return;
      const pos = el.selectionStart;
      if (pos !== el.selectionEnd) return;
      const value = el.value || '';
      if (e.data === '[' && openedDoubleBracket(value, pos)) {
        dispatch(insertHeadingLink(el, insertIntoField, { start: pos - 2, end: pos }));
        return;
      }
      if (
        e.data === '#' &&
        !store.getState().base.get('eliNoHashTagTitle') &&
        el.matches(TITLE_FIELDS) &&
        hashStartsWord(value, pos)
      ) {
        dispatch(pickTagForTitle(el, insertIntoField, pos));
      }
    };
    document.addEventListener('input', onInput, true);
    return () => document.removeEventListener('input', onInput, true);
  }, [dispatch, store]);

  // Vista previa de un enlace [[id:…]] al pasar el ratón
  useEffect(() => {
    const onOver = (e) => {
      const link = e.target && e.target.closest && e.target.closest('.eli-org-link');
      if (!link) return;
      const uri = link.getAttribute('data-eli-uri') || '';
      const m = /^id:\s*(.+)$/i.exec(uri.trim());
      if (!m) return;
      const index = headingIndex(store.getState().org.present.get('files'));
      const target = index.find((x) => x.orgId && x.orgId.toLowerCase() === m[1].toLowerCase());
      if (!target) return;
      const notes = target.notes.trim().replace(/\s+/g, ' ');
      link.title =
        `${target.title} — ${fileNameOf(target.path)}` +
        (notes ? `\n\n${notes.slice(0, 280)}${notes.length > 280 ? '…' : ''}` : '');
    };
    document.addEventListener('mouseover', onOver, true);
    return () => document.removeEventListener('mouseover', onOver, true);
  }, [store]);

  if (!view) return null;
  const close = () => setView(null);
  if (view.kind === 'tag') return <TagView key={view.tag} tag={view.tag} onClose={close} />;
  return <BacklinksView path={view.path} headerId={view.headerId} onClose={close} />;
}
