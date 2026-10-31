// ORG Mode para Eli (4.59): visor de PDF dentro de la app con notas tipo org-noter.
// Se abre con `openPdfViewer({ path, page, orgPath })` (enlaces [[pdf:…::n]] / [[file:x.pdf]],
// el explorador de ficheros, GTD y la paleta). Una sola página a la vez (poca memoria en el
// iPhone). Las notas van en `orgPath` (o en «nombre.org» junto al PDF), en la cabecera con
// `:NOTER_DOCUMENT:`; cada nota lleva `:NOTER_PAGE:`, así que en Emacs se abren con org-noter.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';

import './stylesheet.css';

import { openPdfDocument, canvasScale, loadPdfJs } from '../../lib/eli_pdfjs';
import {
  sessionForPdf,
  addNoterNote,
  defaultNoteTitle,
  defaultNotesPath,
  noterDocMatches,
  parseNoterPage,
} from '../../lib/eli_noter';
import { resolveDropboxPath } from '../../lib/eli_media';
import { propertyValue } from '../../lib/gtd/gtd_model';
import { readText, writeText } from '../../lib/eli_zk_actions';
import { openInNewTab } from '../../lib/eli_media';
import { getOfflineBlob } from '../../lib/eli_offline_store';
import { askForm, askPick, showMessage } from '../../lib/eli_prompt';
import { STATIC_FILE_PREFIX } from '../../lib/org_utils';

export const openPdfViewer = (detail) =>
  window.dispatchEvent(new CustomEvent('eli:pdf', { detail }));

const selectClient = (state) => state.syncBackend.get('client');

const KEYWORD = /^(TODO|DONE|NEXT|WAITING|SOMEDAY|HOLD|CANCELLED|CANCELED|PROJECT|MEETING)\s+/;
// Título como lo guarda la app (sin palabra clave ni etiquetas) para abrir la nota
const plainTitle = (t) => (t || '').replace(KEYWORD, '').replace(/\s+:[^\s:]+(:[^\s:]+)*:\s*$/, '');

// Fichero cargado con una sesión de notas de este PDF (`only`: mirar solo ese fichero)
const loadedSessionFile = (state, pdfPath, only = null) => {
  const files = state.org.present.get('files');
  let found = null;
  if (!files) return null;
  files.forEach((file, p) => {
    if (found || (only && p !== only) || !file || !file.get('headers')) return;
    const has = file.get('headers').some((h) => {
      const d = propertyValue(h, 'NOTER_DOCUMENT');
      return !!d && noterDocMatches(p, d, pdfPath) > 0;
    });
    if (has) found = p;
  });
  return found;
};

// (paleta) «Abrir un PDF…»: elegir entre todos los PDF del servicio
export const pickAndOpenPdf = async (state) => {
  const client = state.syncBackend.get('client');
  if (!client || !client.listAllFiles || !client.getFileBlob) {
    showMessage(
      'Abrir un PDF',
      'Este servicio no permite buscar PDF (usa Dropbox o carpeta local).'
    );
    return;
  }
  let paths = [];
  try {
    paths = ((await client.listAllFiles()) || []).filter(
      (p) => /\.pdf$/i.test(p) && !/\/backups\//i.test(p)
    );
  } catch (e) {
    showMessage('No se pudo buscar', errorText(e));
    return;
  }
  const path = await askPick({
    title: 'Abrir un PDF',
    items: paths.sort().map((p) => ({ id: p, label: p.split('/').pop(), hint: p })),
    emptyText: 'No hay ningún PDF.',
    limit: 200,
  });
  if (path) openPdfViewer({ path, orgPath: state.org.present.get('path') });
};

// (paleta) «Abrir el PDF de esta nota»: la cabecera seleccionada (o un antepasado) con
// `:NOTER_DOCUMENT:`; la página sale de `:NOTER_PAGE:` de la nota
export const openPdfOfSelectedNote = (state) => {
  const path = state.org.present.get('path');
  const file = path && state.org.present.getIn(['files', path]);
  const headers = file && file.get('headers');
  const selId = file && file.get('selectedHeaderId');
  const idx = headers && selId ? headers.findIndex((h) => h.get('id') === selId) : -1;
  if (idx < 0) {
    showMessage('PDF de la nota', 'Selecciona una nota o la cabecera con :NOTER_DOCUMENT:.');
    return;
  }
  let page = null;
  let level = headers.getIn([idx, 'nestingLevel']) + 1;
  for (let k = idx; k >= 0; k -= 1) {
    const h = headers.get(k);
    if (h.get('nestingLevel') >= level) continue;
    level = h.get('nestingLevel');
    if (page === null) {
      const pg = parseNoterPage(propertyValue(h, 'NOTER_PAGE'));
      if (pg) page = pg.page;
    }
    const doc = propertyValue(h, 'NOTER_DOCUMENT');
    if (doc) {
      const pdfPath = resolveDropboxPath(path, doc.replace(/^file:/i, '').trim());
      if (pdfPath) openPdfViewer({ path: pdfPath, page, orgPath: path });
      return;
    }
  }
  showMessage('PDF de la nota', 'Esta cabecera no está dentro de una sesión con :NOTER_DOCUMENT:.');
};

// Cuerpo de la nota para la lista: la cita sin las marcas del bloque
const noteBodyText = (body) =>
  (body || '')
    .replace(/^\s*#\+begin_quote\s*$/gim, '«')
    .replace(/\n?^\s*#\+end_quote\s*$/gim, '»')
    .replace(/«\n/g, '«')
    .replace(/^,(\*|#\+)/gm, '$1')
    .trim();

const errorText = (e) => (e && (e.message || e.error_summary)) || String(e || '');

export default function EliPdfViewer() {
  const dispatch = useDispatch();
  const store = useStore();
  const client = useSelector(selectClient);

  const [target, setTarget] = useState(null); // { path, orgPath }
  const [doc, setDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [status, setStatus] = useState('');
  const [notes, setNotes] = useState([]);
  const [hasSelection, setHasSelection] = useState(false);
  const [pageInput, setPageInput] = useState('1');

  const scrollRef = useRef(null);
  const canvasRef = useRef(null);
  const textRef = useRef(null);
  const pageBoxRef = useRef(null);
  const renderRef = useRef(null);
  const selectionRef = useRef('');
  const [width, setWidth] = useState(0);

  const notesPath = target ? target.notesPath : null;

  // --- Abrir / cerrar ----------------------------------------------------------------------
  useEffect(() => {
    const onOpen = (e) => {
      const d = (e && e.detail) || {};
      if (!d.path) return;
      const orgPath =
        d.orgPath && !d.orgPath.startsWith(STATIC_FILE_PREFIX) && /\.org$/i.test(d.orgPath)
          ? d.orgPath
          : null;
      // Notas: en el .org del enlace si ya tiene la sesión; si no, en otro fichero cargado que la
      // tenga; si no, en el del enlace; y sin .org, en «nombre.org» junto al PDF
      const state = store.getState();
      const notesFile =
        (orgPath && loadedSessionFile(state, d.path, orgPath)) ||
        loadedSessionFile(state, d.path) ||
        orgPath ||
        defaultNotesPath(d.path);
      setTarget({ path: d.path, notesPath: notesFile });
      setPage(d.page && d.page > 0 ? d.page : 1);
      setZoom(1);
      setStatus('Abriendo…');
    };
    window.addEventListener('eli:pdf', onOpen);
    return () => window.removeEventListener('eli:pdf', onOpen);
  }, [store]);

  const close = useCallback(() => {
    setTarget(null);
    setNotes([]);
    setNumPages(0);
    setStatus('');
    setDoc((d) => {
      if (d) d.destroy().catch(() => {});
      return null;
    });
  }, []);

  // Carga del fichero y del documento
  useEffect(() => {
    if (!target) return undefined;
    let alive = true;
    let loaded = null;
    (async () => {
      try {
        let blob = null;
        if (navigator.onLine === false) blob = await getOfflineBlob(target.path);
        if (!blob) {
          if (!client || !client.getFileBlob) throw new Error('Este servicio no permite leer PDF');
          blob = await client.getFileBlob(target.path);
        }
        const bytes = new Uint8Array(await readBlob(blob));
        loaded = await openPdfDocument(bytes);
        if (!alive) {
          loaded.destroy().catch(() => {});
          return;
        }
        setDoc(loaded);
        setNumPages(loaded.numPages);
        setPage((p) => Math.min(Math.max(1, p), loaded.numPages));
        setStatus('');
      } catch (e) {
        if (alive)
          setStatus(
            navigator.onLine === false
              ? 'No disponible sin conexión'
              : `No se pudo abrir el PDF: ${errorText(e)}`
          );
      }
    })();
    return () => {
      alive = false;
    };
  }, [target, client]);

  // --- Notas -------------------------------------------------------------------------------
  const loadNotes = useCallback(async () => {
    if (!target) return;
    try {
      const info = await readText(store.getState(), target.notesPath);
      const session = info.exists ? sessionForPdf(info.text, target.notesPath, target.path) : null;
      setNotes(session ? [...session.notes].sort((a, b) => a.page - b.page) : []);
    } catch (e) {
      setNotes([]);
    }
  }, [target, store]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const addNote = async () => {
    if (!target) return;
    const quote = selectionRef.current;
    const values = await askForm({
      title: `Nota en la página ${page}`,
      message: `Se guarda en ${target.notesPath} (org-noter)`,
      fields: [
        { id: 'pdf-title', label: 'Título', value: '', placeholder: defaultNoteTitle(page) },
        { id: 'pdf-quote', label: 'Cita del PDF', type: 'textarea', value: quote },
        { id: 'pdf-body', label: 'Nota', type: 'textarea', value: '' },
      ],
      okLabel: 'Guardar nota',
    });
    if (!values) return;
    try {
      const state = store.getState();
      const info = await readText(state, target.notesPath);
      const { text } = addNoterNote(info.text, {
        orgPath: target.notesPath,
        pdfPath: target.path,
        page,
        title: values['pdf-title'],
        quote: values['pdf-quote'],
        body: values['pdf-body'],
      });
      await writeText(dispatch, store.getState, target.notesPath, info, text);
      selectionRef.current = '';
      setHasSelection(false);
      await loadNotes();
    } catch (e) {
      showMessage('No se pudo guardar la nota', errorText(e));
    }
  };

  const openNoteInDocument = (note) => {
    const detail = { path: target.notesPath, index: note.index, title: plainTitle(note.title) };
    close();
    window.dispatchEvent(new CustomEvent('eli:open-task', { detail }));
  };

  // --- Dibujo de la página -----------------------------------------------------------------
  useEffect(() => {
    if (!target) return undefined;
    const el = scrollRef.current;
    if (!el) return undefined;
    const measure = () => setWidth(el.clientWidth);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [target, doc]);

  useEffect(() => {
    if (!doc || !width) return undefined;
    let alive = true;
    let pdfPage = null;
    (async () => {
      try {
        const lib = await loadPdfJs();
        pdfPage = await doc.getPage(page);
        if (!alive) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const cssScale = (Math.max(width - 16, 120) / base.width) * zoom;
        const viewport = pdfPage.getViewport({ scale: cssScale });
        const ratio = canvasScale(base.width, base.height, cssScale, window.devicePixelRatio);
        const canvas = canvasRef.current;
        if (!canvas) return;
        if (renderRef.current) renderRef.current.cancel();
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        const box = pageBoxRef.current;
        box.style.width = `${Math.floor(viewport.width)}px`;
        box.style.height = `${Math.floor(viewport.height)}px`;
        box.style.setProperty('--scale-factor', String(cssScale));
        const task = pdfPage.render({
          canvasContext: canvas.getContext('2d'),
          viewport,
          transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : null,
        });
        renderRef.current = task;
        await task.promise.catch((e) => {
          if (!e || e.name !== 'RenderingCancelledException') throw e;
        });
        if (!alive) return;
        // Capa de texto (para seleccionar y citar)
        const textDiv = textRef.current;
        if (textDiv) {
          textDiv.textContent = '';
          const layer = new lib.TextLayer({
            textContentSource: pdfPage.streamTextContent(),
            container: textDiv,
            viewport,
          });
          await layer.render().catch(() => {});
        }
        if (alive && box) box.setAttribute('data-page', String(page));
      } catch (e) {
        if (alive) setStatus(`No se pudo mostrar la página: ${errorText(e)}`);
      }
    })();
    return () => {
      alive = false;
      if (pdfPage) pdfPage.cleanup();
    };
  }, [doc, page, zoom, width]);

  useEffect(() => setPageInput(String(page)), [page]);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [page]);

  // Texto seleccionado en la página (se guarda: en el iPhone, al tocar un botón se pierde)
  useEffect(() => {
    if (!target) return undefined;
    const onSel = () => {
      const sel = window.getSelection && window.getSelection();
      const textDiv = textRef.current;
      if (!sel || !textDiv || !sel.rangeCount) return;
      const inside = textDiv.contains(sel.anchorNode);
      const txt = inside ? sel.toString().replace(/\s+\n/g, '\n').trim() : '';
      if (inside && txt) {
        selectionRef.current = txt;
        setHasSelection(true);
      }
    };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, [target]);

  const go = useCallback(
    (p) => {
      if (!numPages) return;
      const n = Math.min(Math.max(1, p), numPages);
      setPage(n);
      selectionRef.current = '';
      setHasSelection(false);
    },
    [numPages]
  );

  useEffect(() => {
    if (!target) return undefined;
    const onKey = (e) => {
      if (document.querySelector('.eli-prompt__overlay')) return;
      const tag = (e.target && e.target.tagName) || '';
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
        return;
      }
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        e.stopPropagation();
        go(page + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        e.stopPropagation();
        go(page - 1);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [target, page, go, close]);

  if (!target) return null;

  const name = target.path.split('/').pop();
  const canOpenOutside = !!(client && client.getTemporaryLink);

  return (
    <div className="eli-pdf" role="dialog" aria-label={`PDF ${name}`} data-testid="eli-pdf">
      <div className="eli-pdf__bar">
        <button className="eli-pdf__btn" onClick={close} title="Cerrar (Esc)" aria-label="Cerrar">
          <i className="fas fa-times" />
        </button>
        <span className="eli-pdf__name" title={target.path}>
          <i className="far fa-file-pdf" /> {name}
        </span>
        <span className="eli-pdf__pager">
          <button
            className="eli-pdf__btn"
            onClick={() => go(page - 1)}
            disabled={page <= 1}
            aria-label="Página anterior"
            data-testid="eli-pdf-prev"
          >
            <i className="fas fa-chevron-left" />
          </button>
          <input
            className="eli-pdf__page"
            value={pageInput}
            inputMode="numeric"
            aria-label="Página"
            data-testid="eli-pdf-page"
            onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ''))}
            onBlur={() => go(parseInt(pageInput, 10) || page)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') go(parseInt(pageInput, 10) || page);
            }}
          />
          <span className="eli-pdf__count">/ {numPages || '…'}</span>
          <button
            className="eli-pdf__btn"
            onClick={() => go(page + 1)}
            disabled={!numPages || page >= numPages}
            aria-label="Página siguiente"
            data-testid="eli-pdf-next"
          >
            <i className="fas fa-chevron-right" />
          </button>
        </span>
        <span className="eli-pdf__zoom">
          <button
            className="eli-pdf__btn"
            onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
            aria-label="Alejar"
          >
            <i className="fas fa-search-minus" />
          </button>
          <button
            className="eli-pdf__btn"
            onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))}
            aria-label="Acercar"
          >
            <i className="fas fa-search-plus" />
          </button>
        </span>
        <button
          className="btn eli-pdf__add"
          onClick={addNote}
          disabled={!doc}
          data-testid="eli-pdf-add-note"
          title={
            hasSelection
              ? 'Nueva nota en esta página con el texto seleccionado'
              : 'Nueva nota en esta página'
          }
        >
          <i className={`fas ${hasSelection ? 'fa-quote-right' : 'fa-plus'}`} />{' '}
          {hasSelection ? 'Nota con cita' : 'Nota'}
        </button>
        {canOpenOutside && (
          <button
            className="eli-pdf__btn"
            title="Abrir fuera de la app"
            aria-label="Abrir fuera de la app"
            onClick={() =>
              openInNewTab(client, target.path).catch((e) =>
                showMessage('No se pudo abrir', errorText(e))
              )
            }
          >
            <i className="fas fa-external-link-alt" />
          </button>
        )}
      </div>
      <div className="eli-pdf__body">
        <div className="eli-pdf__scroll" ref={scrollRef}>
          {status && <div className="eli-pdf__status">{status}</div>}
          <div className="eli-pdf__pagebox" ref={pageBoxRef} data-testid="eli-pdf-pagebox">
            <canvas ref={canvasRef} className="eli-pdf__canvas" />
            <div ref={textRef} className="textLayer" />
          </div>
        </div>
        <aside className="eli-pdf__notes" data-testid="eli-pdf-notes">
          <div className="eli-pdf__notes-title">
            Notas <span className="eli-pdf__notes-file">{notesPath}</span>
          </div>
          {notes.length === 0 && (
            <div className="eli-pdf__empty">
              Sin notas todavía. Selecciona texto (opcional) y pulsa «Nota».
            </div>
          )}
          {notes.map((n) => (
            <div
              key={`${n.line}-${n.page}`}
              className={`eli-pdf__note${n.page === page ? ' is-current' : ''}`}
              data-testid="eli-pdf-note"
            >
              <button
                className="eli-pdf__note-main"
                onClick={() => go(n.page)}
                title={`Ir a la página ${n.page}`}
              >
                <span className="eli-pdf__note-page">p. {n.page}</span>
                <span className="eli-pdf__note-title">{plainTitle(n.title)}</span>
                {n.body && <span className="eli-pdf__note-body">{noteBodyText(n.body)}</span>}
              </button>
              <button
                className="eli-pdf__btn eli-pdf__note-open"
                onClick={() => openNoteInDocument(n)}
                title="Abrir la nota en el documento"
                aria-label="Abrir la nota en el documento"
              >
                <i className="fas fa-pen" />
              </button>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}

// Blob → ArrayBuffer (Safari antiguo no tiene blob.arrayBuffer)
const readBlob = (blob) =>
  blob.arrayBuffer
    ? blob.arrayBuffer()
    : new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        r.readAsArrayBuffer(blob);
      });
