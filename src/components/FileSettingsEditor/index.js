import React, { Fragment } from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';

import { Droppable } from 'react-beautiful-dnd';

import './stylesheet.css';

import * as orgActions from '../../actions/org';

import FileSetting from './components/FileSetting';

import { List } from 'immutable';
import { STATIC_FILE_PREFIX } from '../../lib/org_utils';
import { askConfirm, showMessage } from '../../lib/eli_prompt';

const FileSettingsEditor = ({
  fileSettings,
  loadedFilepaths,
  currentPathIfWithoutFileSetting,
  client,
  org,
}) => {
  // ORG Mode para Eli: añadir de una vez todos los ficheros .org de la carpeta y subcarpetas
  const [isListing, setIsListing] = React.useState(false);
  const handleAddAllClick = async () => {
    if (!client || !client.listOrgFiles) {
      showMessage('Ficheros', 'No se puede leer la lista de ficheros con este almacenamiento.');
      return;
    }
    setIsListing(true);
    let paths = [];
    try {
      paths = await client.listOrgFiles();
    } catch (e) {
      setIsListing(false);
      showMessage('Ficheros', 'No se ha podido leer la carpeta. Comprueba la conexión.');
      return;
    }
    setIsListing(false);
    if (!paths.length) {
      showMessage('Ficheros', 'No se han encontrado ficheros .org en tu carpeta.');
      return;
    }
    const known = new Set(fileSettings.map((setting) => setting.get('path')).toArray());
    const added = paths.filter((path) => !known.has(path)).length;
    const ok = await askConfirm({
      title: 'Todos los ficheros',
      message:
        `Se han encontrado ${paths.length} ficheros .org en tu carpeta y subcarpetas` +
        ` (${added} nuevos en esta lista).\n\n` +
        'Todos quedarán incluidos en la agenda (y la vista GTD), la búsqueda, la lista de ' +
        'tareas y el refile. El resto de opciones de cada fichero no cambian.\n\n' +
        'Con muchos ficheros, la agenda tarda más en abrirse la primera vez.',
      okLabel: 'Añadir todos',
    });
    if (ok) org.eliAddAllFileSettings(paths);
  };

  const startupSetting = fileSettings.find((setting) => setting.get('defaultOnStartup'));
  const handleStartupChange = (event) => {
    // el valor del <select> es texto; los ids de los ajustes son números
    const chosen = fileSettings.find((setting) => String(setting.get('id')) === event.target.value);
    if (chosen) {
      org.updateFileSettingFieldPathValue(chosen.get('id'), ['defaultOnStartup'], true);
    } else if (startupSetting) {
      org.updateFileSettingFieldPathValue(startupSetting.get('id'), ['defaultOnStartup'], false);
    }
  };

  const handleAddNewSettingClick = () => org.addNewEmptyFileSetting();

  const handleFieldPathUpdate = (settingId, fieldPath, newValue) =>
    org.updateFileSettingFieldPathValue(settingId, fieldPath, newValue);

  const handleDeleteSetting = (settingId) => org.deleteFileSetting(settingId);

  const handleReorderSetting = (fromIndex, toIndex) => org.reorderFileSetting(fromIndex, toIndex);

  return (
    <div>
      <div className="eli-file-settings__common" data-testid="eli-file-settings-common">
        <button
          type="button"
          className="btn settings-btn eli-file-settings__add-all"
          onClick={handleAddAllClick}
          disabled={isListing}
          data-testid="eli-file-settings-add-all"
        >
          <i className={isListing ? 'fas fa-sync-alt fa-spin' : 'fas fa-folder-plus'} />{' '}
          {isListing ? 'Buscando ficheros…' : 'Añadir todos los ficheros .org'}
        </button>
        <div className="file-setting__help-text">
          Busca en tu carpeta y sus subcarpetas y los incluye en la agenda, la búsqueda, la lista de
          tareas y el refile.
        </div>
        {fileSettings.size > 0 && (
          <label className="eli-file-settings__unique">
            <span>Fichero que se abre al iniciar (solo uno):</span>
            <select
              value={startupSetting ? startupSetting.get('id') : ''}
              onChange={handleStartupChange}
              data-testid="eli-file-settings-startup"
            >
              <option value="">Ninguno (carpeta de ficheros)</option>
              {fileSettings.map((setting) => (
                <option key={setting.get('id')} value={setting.get('id')}>
                  {setting.get('path')}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <Droppable droppableId="file-setting-editor-droppable" type="FILE-SETTING">
        {(provided) => (
          <div
            className="file-setting-container"
            ref={provided.innerRef}
            {...provided.droppableProps}
          >
            {fileSettings.size === 0 ? (
              <div className="no-file-setting-message">
                Todavía no tienes ajustes de ficheros. Añade uno pulsando el botón{' '}
                <i className="fas fa-plus" />.
                <br />
                <br />
                Los ajustes de ficheros permiten configurar cómo se tratan ficheros concretos cuando
                hay varios cargados. El fichero tiene que estar cargado para poder crear un ajuste.
              </div>
            ) : (
              <Fragment>
                {fileSettings.map((setting, index) => (
                  <FileSetting
                    key={setting.get('id')}
                    index={index}
                    setting={setting}
                    path={currentPathIfWithoutFileSetting}
                    loadedFilepaths={loadedFilepaths}
                    onFieldPathUpdate={handleFieldPathUpdate}
                    onDeleteSetting={handleDeleteSetting}
                    onReorder={handleReorderSetting}
                  />
                ))}

                {provided.placeholder}
              </Fragment>
            )}
          </div>
        )}
      </Droppable>

      {loadedFilepaths.length !== 0 && (
        <div className="new-capture-template-button-container">
          <button
            className="fas fa-plus fa-lg btn btn--circle"
            onClick={handleAddNewSettingClick}
          />
        </div>
      )}
    </div>
  );
};

const mapStateToProps = (state) => {
  const path = state.base.get('lastViewedPath');
  const fileSettings = state.org.present.get('fileSettings', List());
  const existingSettings = fileSettings.map((setting) => setting.get('path'));
  const paths = state.org.present.get('files', List()).keySeq();
  const currentPathIfWithoutFileSetting = !existingSettings.find((filePath) => filePath === path)
    ? path
    : null;
  const loadedFilepaths = paths
    .filter((path) => !path.startsWith(STATIC_FILE_PREFIX))
    .filter((path) => !existingSettings.find((settingPath) => settingPath === path))
    .toJS();
  return {
    client: state.syncBackend.get('client'),
    fileSettings,
    loadedFilepaths,
    currentPathIfWithoutFileSetting,
  };
};

const mapDispatchToProps = (dispatch) => {
  return {
    org: bindActionCreators(orgActions, dispatch),
  };
};

export default connect(mapStateToProps, mapDispatchToProps)(FileSettingsEditor);
