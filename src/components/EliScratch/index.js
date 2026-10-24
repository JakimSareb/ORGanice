// ORG Mode para Eli (4.23): bloc de notas rápido. Hoja con un cuadro de texto grande sobre
// scratch.org (junto al de entrada). Se guarda al salir del campo, a los 2 s de dejar de
// escribir y al cerrar. «Abrir como documento» lo abre como un fichero normal.
import React, { useEffect, useRef, useState } from 'react';
import { useSelector, useStore } from 'react-redux';
import { useHistory } from 'react-router-dom';

import './stylesheet.css';

import { scratchPath } from '../../lib/eli_scratch';
import { getGtdFiles } from '../../lib/gtd/gtd_sections';
import { showMessage } from '../../lib/eli_prompt';

const TITLE = '#+TITLE: Bloc de notas rápido\n\n';

export default function EliScratch() {
  const store = useStore();
  const history = useHistory();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [status, setStatus] = useState(''); // '' | 'Cargando…' | 'Guardado' | 'Guardando…'
  const pathRef = useRef('');
  const existsRef = useRef(true);
  const savedRef = useRef('');
  const textRef = useRef('');
  const timer = useRef(null);
  const areaRef = useRef(null);
  const isAuthenticated = useSelector((s) => !!s.syncBackend.get('client'));

  const client = () => store.getState().syncBackend.get('client');

  const save = async () => {
    clearTimeout(timer.current);
    const c = client();
    const value = textRef.current;
    if (!c || !pathRef.current || value === savedRef.current) return true;
    setStatus('Guardando…');
    try {
      const body = value.startsWith('#+') || !value.trim() ? value : TITLE + value;
      if (existsRef.current) await c.updateFile(pathRef.current, body);
      else await c.createFile(pathRef.current, body);
      existsRef.current = true;
      savedRef.current = value;
      setStatus('Guardado');
      return true;
    } catch (e) {
      setStatus('');
      showMessage('Bloc de notas', 'No se ha podido guardar: ' + ((e && e.message) || e));
      return false;
    }
  };

  useEffect(() => {
    const onOpen = async () => {
      const c = client();
      if (!c) return;
      const files = store.getState().org.present.get('files');
      pathRef.current = scratchPath(
        getGtdFiles().inbox,
        files && files.keySeq ? files.keySeq().toArray() : []
      );
      setText('');
      textRef.current = '';
      savedRef.current = '';
      setStatus('Cargando…');
      setOpen(true);
      try {
        existsRef.current = c.pathExists ? await c.pathExists(pathRef.current) : true;
        let body = '';
        if (existsRef.current) body = (await c.getFileContents(pathRef.current)) || '';
        // el título automático no se enseña
        const shown = body.startsWith(TITLE) ? body.slice(TITLE.length) : body;
        savedRef.current = shown;
        textRef.current = shown;
        setText(shown);
        setStatus('');
        setTimeout(() => areaRef.current && areaRef.current.focus(), 50);
      } catch (e) {
        existsRef.current = false;
        setStatus('');
      }
    };
    window.addEventListener('eli:scratch', onOpen);
    return () => window.removeEventListener('eli:scratch', onOpen);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  if (!open || !isAuthenticated) return null;

  const close = async () => {
    await save();
    setOpen(false);
  };
  const asDocument = async () => {
    if (!(await save())) return;
    const path = pathRef.current;
    setOpen(false);
    history.push(`/file${path}`);
  };
  const onChange = (e) => {
    setText(e.target.value);
    textRef.current = e.target.value;
    setStatus('');
    clearTimeout(timer.current);
    timer.current = setTimeout(save, 2000);
  };

  return (
    <div
      className="eli-scratch__overlay"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
      data-testid="eli-scratch"
    >
      <div className="eli-scratch" role="dialog" aria-label="Bloc de notas rápido">
        <div className="eli-scratch__bar">
          <strong>Bloc de notas</strong>
          <span className="eli-scratch__status" data-testid="eli-scratch-status">
            {status}
          </span>
          <span className="eli-scratch__spacer" />
          <button
            type="button"
            className="eli-scratch__btn"
            onClick={asDocument}
            data-testid="eli-scratch-open"
          >
            Abrir como documento
          </button>
          <button
            type="button"
            className="eli-scratch__btn"
            onClick={close}
            data-testid="eli-scratch-close"
          >
            Cerrar
          </button>
        </div>
        <textarea
          ref={areaRef}
          className="eli-scratch__text"
          value={text}
          onChange={onChange}
          onBlur={save}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') close();
          }}
          placeholder="Apunta lo que sea…"
          data-testid="eli-scratch-text"
        />
      </div>
    </div>
  );
}
