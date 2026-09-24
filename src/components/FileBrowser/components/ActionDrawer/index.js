// INFO: There's an <ActionDrawer> component within the <OrgFile>
// component, as well.

import { openFavorites } from '../../../EliTools';
import React, { Fragment, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';
import _ from 'lodash';

import './../../../OrgFile/components/ActionDrawer/stylesheet.css';

import * as orgActions from '../../../../actions/org';
import * as syncActions from '../../../../actions/sync_backend';

import ActionButton from '../../../OrgFile/components/ActionDrawer/components/ActionButton';
import Drawer from '../../../UI/Drawer';
import AgendaModal from '../../../OrgFile/components/AgendaModal';

const ensureCompleteFilename = (fileName) => {
  return /\.org(\.gpg|\.asc)?$/.test(fileName) ? fileName : `${fileName}.org`;
};

const ActionDrawer = ({ org, files, syncBackend, path, agendaFilesToLoad }) => {
  // ORG Mode para Eli: agenda también desde el explorador de ficheros
  const [showAgenda, setShowAgenda] = useState(false);
  const history = useHistory();
  const openAgenda = () => {
    // Descargar los ficheros de la agenda que aún no estén cargados
    agendaFilesToLoad.forEach((p) => syncBackend.downloadFile(p));
    setShowAgenda(true);
  };
  const openFileFromAgenda = (filePath) => {
    setShowAgenda(false);
    history.push(`/file${filePath}`);
  };

  const handleAddNewOrgFileClick = () => {
    const content = '* First header\nExtend the file from here.';
    let fileName = prompt('New filename:');

    if (!fileName) return;

    fileName = ensureCompleteFilename(fileName);
    let newPath = `${path}/${fileName}`;

    if (_.includes(files, newPath)) {
      alert('File already exists. Aborting.');
    } else {
      syncBackend.createFile(newPath, content);
      org.addNewFile(newPath, content);
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
                tooltip="Show agenda"
              />
              <ActionButton
                iconName="plus"
                isDisabled={false}
                onClick={handleAddNewOrgFileClick}
                style={mainButtonStyle}
                tooltip="Add new Org file"
              />
            </div>
          </Fragment>
        }
      </div>
      {showAgenda && (
        <Drawer onClose={() => setShowAgenda(false)} maxSize>
          <AgendaModal onClose={() => setShowAgenda(false)} onOpenFile={openFileFromAgenda} />
        </Drawer>
      )}
    </>
  );
};

const mapStateToProps = (state) => {
  const path = state.syncBackend.get('currentPath');
  let files = state.syncBackend.getIn(['currentFileBrowserDirectoryListing', 'listing']);
  files = files ? files.map((e) => e.get('id')).toJS() : [];
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
  };
};

const mapDispatchToProps = (dispatch) => {
  return {
    org: bindActionCreators(orgActions, dispatch),
    syncBackend: bindActionCreators(syncActions, dispatch),
  };
};

export default connect(mapStateToProps, mapDispatchToProps)(ActionDrawer);
