// INFO: There's an <ActionDrawer> component within the <OrgFile>
// component, as well.

import { openFavorites } from '../../../EliTools';
import React, { Fragment, useState, useEffect, useRef } from 'react';
import { useHistory } from 'react-router-dom';
import { Map, List } from 'immutable';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';

import './../../../OrgFile/components/ActionDrawer/stylesheet.css';

import * as orgActions from '../../../../actions/org';
import * as syncActions from '../../../../actions/sync_backend';

import ActionButton from '../../../OrgFile/components/ActionDrawer/components/ActionButton';
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

const ensureCompleteFilename = (fileName) => {
  return /\.org(\.gpg|\.asc)?$/.test(fileName) ? fileName : `${fileName}.org`;
};

const ActionDrawer = ({
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

  const mainButtonStyle = {
    opacity: 1,
    position: 'relative',
    zIndex: 1,
  };

  return (
    <>
      <div className="action-drawer-container nice-scroll">
        {
          <Fragment>
            <ActionButton
              iconName="copy"
              isDisabled={false}
              onClick={openFavorites}
              dataTestId="eli-favorites"
              style={mainButtonStyle}
              tooltip="Ficheros principales"
            />
            <div
              className="action-drawer__capture-buttons-container"
              style={{
                marginLeft: 'auto',
                marginRight: 0,
              }}
            >
              <ActionButton
                iconName="calendar-alt"
                isDisabled={false}
                onClick={openAgenda}
                dataTestId="eli-browser-agenda"
                style={{ ...mainButtonStyle, marginRight: 14 }}
                tooltip="Mostrar agenda"
              />
              <ActionButton
                iconName="tasks"
                isDisabled={false}
                onClick={() => history.push('/gtd')}
                dataTestId="eli-browser-gtd"
                style={{ ...mainButtonStyle, marginRight: 14 }}
                tooltip="Vista GTD (Nirvana)"
              />
              <ActionButton
                iconName="plus"
                isDisabled={false}
                onClick={handleAddNewOrgFileClick}
                style={mainButtonStyle}
                tooltip="Nuevo fichero Org"
              />
            </div>
          </Fragment>
        }
      </div>
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
  };
};

export default connect(mapStateToProps, mapDispatchToProps)(ActionDrawer);
