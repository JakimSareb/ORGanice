import React, { Fragment } from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';

import { Droppable } from 'react-beautiful-dnd';

import './stylesheet.css';

import * as orgActions from '../../actions/org';
import * as baseActions from '../../actions/base';
import Switch from '../UI/Switch';

import FileSetting from './components/FileSetting';

import { List } from 'immutable';
import { STATIC_FILE_PREFIX } from '../../lib/org_utils';
import { askConfirm, showMessage } from '../../lib/eli_prompt';

const FileSettingsEditor = ({
  fileSettings,
  loadedFilepaths,
  currentPathIfWithoutFileSetting,
  client,
  allOrgFiles,
  org,
  base,
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
        'tareas y el refile, y los que crees más adelante se añadirán solos. Los que ' +
        'borres se quitarán de la lista.\n\n' +
        'Con muchos ficheros, la agenda tarda más en abrirse la primera vez.',
      okLabel: 'Activar',
    });
    if (ok) {
      base.setEliSetting('eliAllOrgFiles', true);
      org.eliAddAllFileSettings(paths);
    }
  };

  // Desactivar el modo automático: los ajustes se quedan como estén y se vuelven a gestionar
  // fichero a fichero
  const handleAllOrgFilesToggle = () => {
    if (allOrgFiles) base.setEliSetting('eliAllOrgFiles', false);
    else handleAddAllClick();
  };
  const handleRefreshClick = async () => {
    setIsListing(true);
    const paths = await org.eliRefreshAllOrgFiles({ force: true });
    setIsListing(false);
    if (!paths) showMessage('Ficheros', 'No se ha podido leer la carpeta. Comprueba la conexión.');
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
        <div className="file-setting__field eli-file-settings__auto">
          <div>
            <div>Todos los ficheros .org, automáticamente</div>
            <div className="file-setting__help-text">
              Los de tu carpeta y subcarpetas, también los que crees más adelante, entran solos en
              la agenda (y la vista GTD), la búsqueda, la lista de tareas y el refile. Desactívalo
              para elegirlos uno a uno.
            </div>
          </div>
          {isListing ? (
            <i className="fas fa-sync-alt fa-spin" />
          ) : (
            <Switch isEnabled={!!allOrgFiles} onToggle={handleAllOrgFilesToggle} />
          )}
        </div>
        {allOrgFiles && (
          <div className="eli-file-settings__auto-info" data-testid="eli-file-settings-auto-info">
            {fileSettings.size} ficheros incluidos.{' '}
            <button
              type="button"
              className="eli-file-settings__refresh"
              onClick={handleRefreshClick}
              disabled={isListing}
              data-testid="eli-file-settings-refresh"
            >
              Buscar ficheros nuevos ahora
            </button>
          </div>
        )}
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
      {!allOrgFiles && (
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
                  Los ajustes de ficheros permiten configurar cómo se tratan ficheros concretos
                  cuando hay varios cargados. El fichero tiene que estar cargado para poder crear un
                  ajuste.
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
      )}

      {!allOrgFiles && loadedFilepaths.length !== 0 && (
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
    allOrgFiles: !!state.base.get('eliAllOrgFiles'),
    fileSettings,
    loadedFilepaths,
    currentPathIfWithoutFileSetting,
  };
};

const mapDispatchToProps = (dispatch) => {
  return {
    org: bindActionCreators(orgActions, dispatch),
    base: bindActionCreators(baseActions, dispatch),
  };
};

export default connect(mapStateToProps, mapDispatchToProps)(FileSettingsEditor);
