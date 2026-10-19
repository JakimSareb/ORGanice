// ORG Mode para Eli (3.13): editor de guiones Fountain (.fountain). 3.14: exportar a PDF/Fountain.
// El fichero se lee y se guarda tal cual (texto), sin pasar por el analizador de Org.
// Vistas: «Guion» (formato de guion; tocar un elemento lleva a su línea), «Texto» (editar)
// y, en pantallas anchas, «Ambos» (texto a la izquierda, guion a la derecha).
import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { connect } from 'react-redux';

import './stylesheet.css';

import FountainScript from './FountainScript';
import FountainManual from './FountainManual';
import Drawer from '../UI/Drawer';
import { parseFountain, fountainStats } from '../../lib/eli_fountain';
import { fountainToPdf, titleFields } from '../../lib/eli_fountain_pdf';
import { showMessage } from '../../lib/eli_prompt';

const MODE_KEY = 'eliFountainMode';
const NOTES_KEY = 'eliFountainNotes';
const SAVE_DELAY = 1500;

const lsGet = (k, d) => {
  try {
    const v = window.localStorage.getItem(k);
    return v === null ? d : v;
  } catch (e) {
    return d;
  }
};
const lsSet = (k, v) => {
  try {
    window.localStorage.setItem(k, v);
  } catch (e) {}
};

const isWide = () => typeof window !== 'undefined' && window.innerWidth >= 900;

const errorText = (e) =>
  (e && (e.message || e.error_summary || (e.error && e.error.error_summary))) ||
  (e ? String(e) : 'No existe o no se puede leer');

// (3.14) Entregar un fichero exportado: en el móvil, la hoja de compartir del sistema
// («Guardar en Archivos», imprimir, enviar…); si no se puede, se descarga.
const downloadBlob = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 30000);
};
const deliverFile = (data, name, mime) => {
  const blob = new Blob([data], { type: mime });
  let file = null;
  try {
    file = new File([blob], name, { type: mime });
  } catch (e) {}
  const touch = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  if (touch && file && navigator.canShare && navigator.share) {
    let ok = false;
    try {
      ok = navigator.canShare({ files: [file] });
    } catch (e) {}
    if (ok) {
      navigator.share({ files: [file], title: name }).catch((err) => {
        if (!err || err.name !== 'AbortError') downloadBlob(blob, name);
      });
      return;
    }
  }
  downloadBlob(blob, name);
};

// Posición (carácter) del principio de una línea
const lineOffset = (text, line) => {
  let pos = 0;
  for (let k = 0; k < line; k++) {
    const nl = text.indexOf('\n', pos);
    if (nl === -1) return text.length;
    pos = nl + 1;
  }
  return pos;
};
const lineAt = (text, pos) => text.slice(0, pos).split('\n').length - 1;

// Fragmentos de la barra de inserción: [etiqueta, texto antes, texto a seleccionar, texto después]
const SNIPPETS = [
  ['Escena', 'INT. ', 'LUGAR - DÍA', '\n\n'],
  ['Personaje', '', 'NOMBRE', '\n'],
  ['(Acotación)', '(', 'acotación', ')\n'],
  ['Transición', '', 'CORTE A:', '\n\n'],
  ['Nota', '[[', 'nota', ']]'],
];

const EliFountain = ({ path, client }) => {
  const [text, setText] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [saveState, setSaveState] = useState('saved'); // saved | dirty | saving | error
  const [mode, setMode] = useState(() => {
    const m = lsGet(MODE_KEY, '');
    if (m === 'both' && !isWide()) return 'script';
    return m || (isWide() ? 'both' : 'script');
  });
  const [showNotes, setShowNotes] = useState(() => lsGet(NOTES_KEY, '1') === '1');
  const [showManual, setShowManual] = useState(false);
  const [showScenes, setShowScenes] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const taRef = useRef(null);
  const paperRef = useRef(null);
  const latest = useRef({ text: null, dirty: false, saving: false });
  const timer = useRef(null);
  const pendingLine = useRef(null);
  const pendingSel = useRef(null);

  // Tras insertar, seleccionar el texto de ejemplo en el mismo pintado (sin esperar)
  useLayoutEffect(() => {
    const sel = pendingSel.current;
    if (!sel || !taRef.current) return;
    pendingSel.current = null;
    taRef.current.focus();
    taRef.current.setSelectionRange(sel[0], sel[1]);
  });

  const fileName = (path || '').split('/').pop();

  const load = useCallback(() => {
    setLoadError(null);
    setText(null);
    client
      .getFileContents(path)
      .then((contents) => {
        const t = typeof contents === 'string' ? contents : '';
        latest.current = { text: t, dirty: false, saving: false };
        setText(t);
        setSaveState('saved');
      })
      .catch((e) => setLoadError(errorText(e)));
  }, [client, path]);

  useEffect(() => {
    if (client && path) load();
  }, [client, path, load]);

  const save = useCallback(async () => {
    clearTimeout(timer.current);
    const cur = latest.current;
    if (!cur.dirty || cur.saving || cur.text === null) return;
    cur.saving = true;
    const contents = cur.text;
    setSaveState('saving');
    try {
      await client.updateFile(path, contents);
      cur.saving = false;
      if (latest.current.text === contents) {
        cur.dirty = false;
        setSaveState('saved');
      } else {
        setSaveState('dirty');
        timer.current = setTimeout(() => save(), SAVE_DELAY);
      }
    } catch (e) {
      cur.saving = false;
      setSaveState('error');
      showMessage('No se pudo guardar el guion', `${path}: ${errorText(e)}`);
    }
  }, [client, path]);

  // Guardar al salir (cambiar de pantalla o cerrar la pestaña)
  useEffect(() => {
    const onUnload = (e) => {
      if (latest.current.dirty) {
        save();
        e.preventDefault();
        e.returnValue = '';
      }
    };
    const onHide = () => document.visibilityState === 'hidden' && save();
    window.addEventListener('beforeunload', onUnload);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      document.removeEventListener('visibilitychange', onHide);
      save();
    };
  }, [save]);

  const change = (value) => {
    latest.current.text = value;
    latest.current.dirty = true;
    setText(value);
    setSaveState('dirty');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => save(), SAVE_DELAY);
  };

  const parsed = useMemo(() => parseFountain(text || ''), [text]);
  const stats = useMemo(() => fountainStats(parsed.elements), [parsed]);

  const chooseMode = (m) => {
    setMode(m);
    lsSet(MODE_KEY, m);
  };

  // Llevar el cursor del texto a una línea (y que se vea)
  const focusLine = (line) => {
    const ta = taRef.current;
    if (!ta || text === null) return;
    const pos = lineOffset(text, line);
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(pos, pos);
    const lh = parseFloat(window.getComputedStyle(ta).lineHeight) || 20;
    // (aproximado: las líneas largas ocupan más de una fila)
    const rows = text
      .slice(0, pos)
      .split('\n')
      .reduce((n, l) => {
        const cols = Math.max(20, Math.floor(ta.clientWidth / (lh * 0.5)));
        return n + Math.max(1, Math.ceil(l.length / cols));
      }, 0);
    ta.scrollTop = Math.max(0, (rows - 3) * lh);
  };

  useEffect(() => {
    if (pendingLine.current !== null && mode !== 'script') {
      const l = pendingLine.current;
      pendingLine.current = null;
      setTimeout(() => focusLine(l), 30);
    }
  });

  // Tocar un elemento del guion: ir a su línea en el texto
  const pick = (line) => {
    if (mode === 'script') {
      pendingLine.current = line;
      chooseMode('text');
    } else {
      focusLine(line);
    }
  };

  // Ir a una escena
  const goScene = (line) => {
    setShowScenes(false);
    if (mode === 'text') {
      focusLine(line);
      return;
    }
    const node = paperRef.current && paperRef.current.querySelector(`[data-line="${line}"]`);
    if (node) node.scrollIntoView({ block: 'start', behavior: 'smooth' });
    if (mode === 'both') focusLine(line);
  };

  // En «Ambos», el guion sigue al cursor del texto
  const syncPaper = () => {
    if (mode !== 'both' || !taRef.current || !paperRef.current || text === null) return;
    const line = lineAt(text, taRef.current.selectionStart);
    const els = parsed.elements.filter((e) => e.line <= line);
    const target = els.length ? els[els.length - 1].line : 0;
    const node = paperRef.current.querySelector(`[data-line="${target}"]`);
    if (node) {
      const box = paperRef.current.getBoundingClientRect();
      const r = node.getBoundingClientRect();
      if (r.top < box.top || r.bottom > box.bottom) {
        paperRef.current.scrollTop += r.top - box.top - box.height / 3;
      }
    }
  };

  const insert = ([, before, middle, after]) => {
    const ta = taRef.current;
    if (!ta || text === null) return;
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const head = text.slice(0, s);
    // Los elementos de bloque van en su propio párrafo
    const block = !before.startsWith('[[') && !before.startsWith('(');
    let pre = '';
    if (block && head && !head.endsWith('\n\n')) pre = head.endsWith('\n') ? '\n' : '\n\n';
    if (!block && before === '(' && head && !head.endsWith('\n')) pre = '\n';
    const sel = e > s ? text.slice(s, e) : middle;
    const value = head + pre + before + sel + after + text.slice(e);
    change(value);
    const start = s + pre.length + before.length;
    pendingSel.current = [start, start + sel.length];
  };

  // Personajes ya usados: insertar el nombre con un toque
  const insertCharacter = (name) => insert(['', '', name, '\n']);

  const onKeyDown = (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      save();
    }
    if (event.key === 'Tab' && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      // Tab: pasar a mayúsculas la línea actual (personaje / encabezado), como en otras apps
      const ta = taRef.current;
      const s = ta.selectionStart;
      const ls = text.lastIndexOf('\n', s - 1) + 1;
      let le = text.indexOf('\n', s);
      if (le === -1) le = text.length;
      const line = text.slice(ls, le);
      if (line.trim()) {
        event.preventDefault();
        change(text.slice(0, ls) + line.toUpperCase() + text.slice(le));
        pendingSel.current = [s, s];
      }
    }
  };

  const status = {
    saved: 'Guardado',
    dirty: 'Sin guardar…',
    saving: 'Guardando…',
    error: 'Error al guardar',
  }[saveState];

  if (loadError) {
    return (
      <div className="eli-ftn eli-ftn--msg">
        <p>No se ha podido abrir {fileName}.</p>
        <p className="eli-ftn__muted">{loadError}</p>
        <button className="btn" onClick={load}>
          Reintentar
        </button>
      </div>
    );
  }
  if (text === null) {
    return (
      <div className="eli-ftn eli-ftn--msg">
        <i className="fas fa-spinner fa-spin" /> Abriendo {fileName}…
      </div>
    );
  }

  const baseName = fileName.replace(/\.(fountain|spmd)$/i, '') || 'guion';
  const exportFountain = () => {
    setShowExport(false);
    deliverFile(text || '', baseName + '.fountain', 'text/plain');
  };
  const exportPdf = () => {
    setShowExport(false);
    try {
      const f = titleFields(parsed.title);
      const title = f.title ? f.title.join(' ').replace(/[*_]/g, '') : baseName;
      deliverFile(fountainToPdf(parsed, { title }), baseName + '.pdf', 'application/pdf');
    } catch (e) {
      showMessage('No se pudo crear el PDF', errorText(e));
    }
  };

  const showText = mode === 'text' || mode === 'both';
  const showScript = mode === 'script' || mode === 'both';

  return (
    <div className={'eli-ftn eli-ftn--' + mode} data-testid="eli-fountain">
      <div className="eli-ftn__bar">
        <div className="eli-ftn__name" title={path}>
          <i className="fas fa-film" /> {fileName.replace(/\.(fountain|spmd)$/i, '')}
        </div>
        <div className="eli-ftn__seg" role="tablist">
          <button
            className={mode === 'script' ? 'is-on' : ''}
            onClick={() => chooseMode('script')}
            data-testid="eli-ftn-mode-script"
          >
            Guion
          </button>
          <button
            className={mode === 'text' ? 'is-on' : ''}
            onClick={() => chooseMode('text')}
            data-testid="eli-ftn-mode-text"
          >
            Texto
          </button>
          {isWide() && (
            <button
              className={mode === 'both' ? 'is-on' : ''}
              onClick={() => chooseMode('both')}
              data-testid="eli-ftn-mode-both"
            >
              Ambos
            </button>
          )}
        </div>
        <div className="eli-ftn__tools">
          <button
            className="eli-ftn__icon"
            title={`Escenas (${stats.scenes.length})`}
            onClick={() => setShowScenes((v) => !v)}
            data-testid="eli-ftn-scenes"
          >
            <i className="fas fa-list-ol" />
          </button>
          <button
            className={'eli-ftn__icon' + (showNotes ? '' : ' is-off')}
            title={
              showNotes
                ? 'Ocultar notas, secciones y sinopsis'
                : 'Mostrar notas, secciones y sinopsis'
            }
            onClick={() => {
              setShowNotes(!showNotes);
              lsSet(NOTES_KEY, showNotes ? '0' : '1');
            }}
          >
            <i className={showNotes ? 'far fa-eye' : 'far fa-eye-slash'} />
          </button>
          <span className="eli-ftn__export">
            <button
              className={'eli-ftn__icon' + (showExport ? ' is-active' : '')}
              title="Exportar"
              onClick={() => setShowExport((v) => !v)}
              data-testid="eli-ftn-export"
            >
              <i className="fas fa-file-export" />
            </button>
            {showExport && (
              <>
                <div className="eli-ftn__export-shade" onClick={() => setShowExport(false)} />
                <div className="eli-ftn__export-menu" role="menu">
                  <button onClick={exportPdf} data-testid="eli-ftn-export-pdf">
                    <i className="far fa-file-pdf" /> PDF (A4)
                  </button>
                  <button onClick={exportFountain} data-testid="eli-ftn-export-fountain">
                    <i className="far fa-file-alt" /> Fountain (.fountain)
                  </button>
                </div>
              </>
            )}
          </span>
          <button
            className="eli-ftn__icon"
            title="Manual de Fountain"
            onClick={() => setShowManual(true)}
            data-testid="eli-ftn-manual"
          >
            <i className="far fa-question-circle" />
          </button>
        </div>
      </div>
      <div className="eli-ftn__meta">
        <span>
          {stats.scenes.length} {stats.scenes.length === 1 ? 'escena' : 'escenas'} · ≈{stats.pages}{' '}
          {stats.pages === 1 ? 'página' : 'páginas'}
        </span>
        <button
          className={'eli-ftn__status eli-ftn__status--' + saveState}
          onClick={save}
          disabled={saveState === 'saved' || saveState === 'saving'}
          data-testid="eli-ftn-status"
          title="Se guarda solo; pulsa para guardar ya (Ctrl/⌘+S)"
        >
          {status}
        </button>
      </div>

      {showScenes && (
        <div className="eli-ftn__scenes" data-testid="eli-ftn-scene-list">
          {stats.scenes.length === 0 && <div className="eli-ftn__muted">Aún no hay escenas.</div>}
          {stats.scenes.map((s, k) => (
            <button key={s.line} onClick={() => goScene(s.line)}>
              <span className="eli-ftn__muted">{s.number || k + 1}</span> {s.text}
            </button>
          ))}
        </div>
      )}

      <div className="eli-ftn__body">
        {showText && (
          <div className="eli-ftn__editor">
            <div className="eli-ftn__insert">
              {SNIPPETS.map((sn) => (
                <button
                  key={sn[0]}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insert(sn)}
                >
                  {sn[0]}
                </button>
              ))}
              {stats.characters.slice(0, 8).map((c) => (
                <button
                  key={'c' + c}
                  className="eli-ftn__char"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertCharacter(c)}
                  title="Insertar este personaje"
                >
                  {c}
                </button>
              ))}
            </div>
            <textarea
              ref={taRef}
              className="eli-ftn__textarea"
              value={text}
              onChange={(e) => change(e.target.value)}
              onKeyDown={onKeyDown}
              onKeyUp={syncPaper}
              onClick={syncPaper}
              spellCheck
              autoCapitalize="sentences"
              data-testid="eli-ftn-text"
              placeholder={'INT. LUGAR - DÍA\n\nAcción.\n\nPERSONAJE\nDiálogo.'}
            />
          </div>
        )}
        {showScript && (
          <div className="eli-ftn__view" ref={paperRef}>
            <div className="eli-ftn__paper" data-testid="eli-ftn-paper">
              {parsed.elements.length === 0 && !parsed.title ? (
                <div className="eli-ftn__muted">
                  Guion vacío. Pulsa «Texto» para escribir, o abre el manual (?).
                </div>
              ) : (
                <FountainScript parsed={parsed} onPick={pick} showNotes={showNotes} />
              )}
            </div>
          </div>
        )}
      </div>

      {showManual && (
        <Drawer onClose={() => setShowManual(false)} maxSize shouldIncludeCloseButton>
          <FountainManual />
        </Drawer>
      )}
    </div>
  );
};

const mapStateToProps = (state) => ({
  client: state.syncBackend.get('client'),
});

export default connect(mapStateToProps)(EliFountain);
