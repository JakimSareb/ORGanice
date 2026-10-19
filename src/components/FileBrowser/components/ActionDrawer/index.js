// INFO: There's an <ActionDrawer> component within the <OrgFile>
// component, as well.

import { openFavorites } from '../../../EliTools';
import React, { useState, useEffect, useRef } from 'react';
import { useHistory } from 'react-router-dom';
import { Map, List } from 'immutable';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';

import './../../../OrgFile/components/ActionDrawer/stylesheet.css';

import * as orgActions from '../../../../actions/org';
import { createPlainFile } from '../../../../actions/org';
import * as syncActions from '../../../../actions/sync_backend';

import EliDocBar from '../../../OrgFile/components/EliDocBar';
import Drawer from '../../../UI/Drawer';
import AgendaModal from '../../../OrgFile/components/AgendaModal';
import EliErrorBoundary from '../../../EliErrorBoundary';
import { askText, showMessage } from '../../../../lib/eli_prompt';
import { calculateActionedKeybindings } from '../../../../lib/keybindings';
import {
  notWhileTyping,
  shouldIgnoreOrganiceHotkey,
  matchesBinding,
} from '../../../../lib/eli_hotkeys';
import { chooseCaptureTemplate } from '../../../../lib/eli_capture_menu';
import { newFileHeaderLines } from '../../../../lib/eli_todo_defaults';
import { newFountainTemplate } from '../../../../lib/eli_fountain';

const ensureCompleteFilename = (fileName) => {
  return /\.org(\.gpg|\.asc)?$/.test(fileName) ? fileName : `${fileName}.org`;
};

const ActionDrawer = ({
  createFountainFile,
  org,
  files,
  syncBackend,
  path,
  agendaFilesToLoad,
  customKeybindings,
  captureTemplates,
}) => {
  // ORG Mode para Eli: agenda también desde el explorador de ficheros
  const [showAgenda, setShowAgenda] = useState(false);
  const history = useHistory();
  const openAgenda = () => {
    // Descargar los ficheros de la agenda que aún no estén cargados
    // (en silencio: si alguno no existe, no se muestra ningún error)
    agendaFilesToLoad.forEach((p) => org.loadFileQuietly(p));
    setShowAgenda(true);
  };
  const openFileFromAgenda = (filePath) => {
    setShowAgenda(false);
    history.push(`/file${filePath}`);
  };

  // ORG Mode para Eli: capturar desde el explorador: se elige la plantilla (por su letra) y se
  // abre su fichero de destino con la ventana de captura
  const startCapture = async () => {
    const templates = (captureTemplates || []).filter((t) => !!t.get('file'));
    if (!templates.length) {
      showMessage(
        'Sin plantillas',
        'No hay plantillas de captura con fichero de destino. Añade alguna en Ajustes → Plantillas de captura.'
      );
      return;
    }
    const template = await chooseCaptureTemplate(templates);
    if (!template) return;
    const file = template.get('file').startsWith('/')
      ? template.get('file')
      : `/${template.get('file')}`;
    window.__eliPendingCapture = {
      path: file,
      templateId: template.get('id'),
      templateDescription: template.get('description'),
    };
    history.push(`/file${file}`);
  };

  // Atajos (los mismos que dentro de un fichero, configurables en Keyboard shortcuts)
  const latest = useRef();
  latest.current = { openAgenda, startCapture, showAgenda, customKeybindings };
  const newFileRef = useRef();
  const newFountainRef = useRef();
  useEffect(() => {
    const onNewFile = () => newFileRef.current && newFileRef.current();
    const onNewFountain = () => newFountainRef.current && newFountainRef.current();
    window.addEventListener('eli:new-file', onNewFile);
    window.addEventListener('eli:new-fountain', onNewFountain);
    return () => {
      window.removeEventListener('eli:new-file', onNewFile);
      window.removeEventListener('eli:new-fountain', onNewFountain);
    };
  }, []);
  useEffect(() => {
    const onKey = notWhileTyping((event) => {
      const { showAgenda: agendaOpen, customKeybindings: custom } = latest.current;
      if (agendaOpen || shouldIgnoreOrganiceHotkey(event, null)) return;
      const bindings = Object.fromEntries(calculateActionedKeybindings(custom));
      const actions = {
        openAgenda: () => latest.current.openAgenda(),
        openGtd: () => window.dispatchEvent(new CustomEvent('eli:open-gtd')),
        openFavorites: () => openFavorites(),
        openCapture: () => latest.current.startCapture(),
      };
      const hit = Object.keys(actions).find((a) => matchesBinding(event, bindings[a]));
      if (!hit) return;
      event.preventDefault();
      actions[hit]();
    });
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // ORG Mode para Eli: crear un fichero con un diálogo propio (window.prompt no es fiable en las
  // apps de la pantalla de inicio), avisando si algo falla, y abrirlo al terminar.
  const handleAddNewOrgFileClick = async () => {
    const name = await askText({
      title: 'Nuevo fichero',
      message: `Se creará en ${path || '/'}`,
      placeholder: 'nombre (se añade .org)',
      okLabel: 'Crear',
    });
    if (!name) return;
    const fileName = ensureCompleteFilename(name.replace(/[\\/:*?"<>|]/g, '-'));
    const newPath = `${path}/${fileName}`;
    if (files.includes(newPath.toLowerCase())) {
      showMessage('Ya existe', `Ya hay un fichero llamado ${fileName} en esta carpeta.`);
      return;
    }
    const title = fileName.replace(/\.org(\.gpg|\.asc)?$/i, '');
    // Cabecera de los ficheros nuevos: etiquetas, energía, tiempo y columnas (Ajustes)
    const content = `#+TITLE: ${title}\n${newFileHeaderLines().join(
      '\n'
    )}\n\n* Primer encabezado\n`;
    const ok = await org.createNewFile(newPath, content);
    if (ok) {
      syncBackend.getDirectoryListing(path);
      history.push(`/file${newPath}`);
    }
  };

  newFileRef.current = handleAddNewOrgFileClick;

  // (3.13) Nuevo guion Fountain: se crea con una plantilla y se abre en su editor
  const handleAddNewFountainClick = async () => {
    const name = await askText({
      title: 'Nuevo guion',
      message: `Se creará en ${path || '/'}`,
      placeholder: 'título (se añade .fountain)',
      okLabel: 'Crear',
    });
    if (!name) return;
    const clean = name.trim().replace(/[\\/:*?"<>|]/g, '-');
    const fileName = /\.fountain$/i.test(clean) ? clean : `${clean}.fountain`;
    const newPath = `${path}/${fileName}`;
    if (files.includes(newPath.toLowerCase())) {
      showMessage('Ya existe', `Ya hay un fichero llamado ${fileName} en esta carpeta.`);
      return;
    }
    const ok = await createFountainFile(
      newPath,
      newFountainTemplate(fileName.replace(/\.fountain$/i, ''))
    );
    if (ok) {
      syncBackend.getDirectoryListing(path);
      history.push(`/fountain${newPath}`);
    }
  };
  newFountainRef.current = handleAddNewFountainClick;

  // (3.29) Sin fichero abierto: la misma barra de herramientas que dentro de un documento, con solo
  // lo que tiene sentido aquí (antes eran botones propios en la parte de arriba)
  const browserBar = {
    items: [
      {
        id: 'favorites',
        icon: 'fas fa-copy',
        title: 'Ficheros principales',
        onClick: openFavorites,
      },
      { id: 'new', icon: 'fas fa-plus', title: 'Nuevo fichero', sub: 'new' },
      { id: 'agenda', icon: 'far fa-calendar-check', title: 'Agenda', onClick: openAgenda },
      {
        id: 'capture',
        icon: 'fas fa-inbox',
        badge: '+',
        title: 'Capturar (plantillas de captura)',
        onClick: startCapture,
      },
    ],
    subs: {
      new: [
        {
          id: 'new-org',
          icon: 'far fa-file-alt',
          label: 'Fichero Org',
          onClick: handleAddNewOrgFileClick,
        },
        {
          id: 'new-fountain',
          icon: 'fas fa-film',
          label: 'Guion Fountain',
          onClick: handleAddNewFountainClick,
        },
      ],
    },
  };

  return (
    <>
      <EliDocBar external={browserBar} hidden={showAgenda} />
      {showAgenda && (
        <Drawer onClose={() => setShowAgenda(false)} maxSize>
          <EliErrorBoundary label="la agenda" onClose={() => setShowAgenda(false)}>
            <AgendaModal onClose={() => setShowAgenda(false)} onOpenFile={openFileFromAgenda} />
          </EliErrorBoundary>
        </Drawer>
      )}
    </>
  );
};

const mapStateToProps = (state) => {
  const path = state.syncBackend.get('currentPath');
  let files = state.syncBackend.getIn(['currentFileBrowserDirectoryListing', 'listing']);
  // ORG Mode para Eli: rutas en minúsculas (Dropbox no distingue mayúsculas)
  files = files ? files.map((e) => (e.get('path') || '').toLowerCase()).toJS() : [];
  const loaded = state.org.present.get('files');
  const agendaFilesToLoad = state.org.present
    .get('fileSettings')
    .filter((s) => s.get('includeInAgenda') && !loaded.has(s.get('path')))
    .map((s) => s.get('path'))
    .toArray();
  return {
    path,
    files,
    agendaFilesToLoad,
    customKeybindings: state.base.get('customKeybindings') || Map(),
    captureTemplates: state.capture.get('captureTemplates', List()),
  };
};

const mapDispatchToProps = (dispatch) => {
  return {
    org: bindActionCreators(orgActions, dispatch),
    syncBackend: bindActionCreators(syncActions, dispatch),
    createFountainFile: (path, content) => dispatch(createPlainFile(path, content)),
  };
};

export default connect(mapStateToProps, mapDispatchToProps)(ActionDrawer);
