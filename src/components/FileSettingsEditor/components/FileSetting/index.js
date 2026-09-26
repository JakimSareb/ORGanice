import React, { useState } from 'react';
import { UnmountClosed as Collapse } from 'react-collapse';

import { Draggable } from 'react-beautiful-dnd';

import './stylesheet.css';

import Switch from '../../../UI/Switch';

import classNames from 'classnames';

export default ({ setting, index, onFieldPathUpdate, onDeleteSetting, loadedFilepaths, path }) => {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const handleHeaderBarClick = () => setIsCollapsed(!isCollapsed);

  const updateField = (fieldName) => (event) =>
    onFieldPathUpdate(setting.get('id'), [fieldName], event.target.value);

  const toggleDefaultOnStartup = () =>
    onFieldPathUpdate(setting.get('id'), ['defaultOnStartup'], !setting.get('defaultOnStartup'));

  const toggleLoadOnStartup = () =>
    onFieldPathUpdate(setting.get('id'), ['loadOnStartup'], !setting.get('loadOnStartup'));

  const toggleIncludeInAgenda = () =>
    onFieldPathUpdate(setting.get('id'), ['includeInAgenda'], !setting.get('includeInAgenda'));

  const toggleIncludeInSearch = () =>
    onFieldPathUpdate(setting.get('id'), ['includeInSearch'], !setting.get('includeInSearch'));

  const toggleIncludeInTasklist = () =>
    onFieldPathUpdate(setting.get('id'), ['includeInTasklist'], !setting.get('includeInTasklist'));

  const toggleEliFavorite = () =>
    onFieldPathUpdate(setting.get('id'), ['eliFavorite'], !setting.get('eliFavorite'));

  const toggleIncludeInRefile = () =>
    onFieldPathUpdate(setting.get('id'), ['includeInRefile'], !setting.get('includeInRefile'));

  const handleDeleteClick = () => {
    if (window.confirm(`¿Seguro que quieres eliminar los ajustes de «${setting.get('path')}»?`)) {
      onDeleteSetting(setting.get('id'));
    }
  };

  const renderPathField = (setting) => {
    if (setting.get('path') === '') {
      updateField('path')({ target: { value: path || loadedFilepaths[0] } });
    }
    return (
      <div className="file-setting__field-container">
        <div className="file-setting__field">
          <div>Ruta: </div>
          <select onChange={updateField('path')} style={{ width: '90%' }}>
            {[setting.get('path'), ...loadedFilepaths].map((path) => (
              <option key={path} value={path}>
                {path}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  };

  const renderOptionFields = (setting) => (
    <>
      <div className="file-setting__field-container">
        <div className="file-setting__field">
          <div>¿Fichero principal (acceso directo)?</div>
          <Switch isEnabled={!!setting.get('eliFavorite')} onToggle={toggleEliFavorite} />
        </div>

        <div className="file-setting__help-text">
          Aparece en la lista del botón de hojas de la barra inferior para abrirlo con un toque.
        </div>
      </div>
      <div className="file-setting__field-container">
        <div className="file-setting__field">
          <div>¿Abrir este fichero al iniciar?</div>
          <Switch isEnabled={setting.get('defaultOnStartup')} onToggle={toggleDefaultOnStartup} />
        </div>

        <div className="file-setting__help-text">
          Por defecto, al iniciar la aplicación se muestra la carpeta raíz de tus ficheros. Si
          prefieres abrir directamente un fichero Org concreto, activa esta opción. Al activarla se
          desactiva en los demás ficheros.
        </div>
      </div>
      <div className="file-setting__field-container">
        <div className="file-setting__field">
          <div>¿Sincronizar al iniciar?</div>
          <Switch isEnabled={setting.get('loadOnStartup')} onToggle={toggleLoadOnStartup} />
        </div>

        <div className="file-setting__help-text">
          Por defecto, los ficheros se cargan desde el almacenamiento local del navegador cuando
          están disponibles y solo se sincronizan al abrirlos o al sincronizar manualmente. Activa
          esta opción para sincronizar siempre este fichero al abrir la aplicación.
        </div>
      </div>

      <div className="file-setting__field-container">
        <div className="file-setting__field">
          <div>¿Incluir en la agenda?</div>
          <Switch isEnabled={setting.get('includeInAgenda')} onToggle={toggleIncludeInAgenda} />
        </div>

        <div className="file-setting__help-text">
          Por defecto, la agenda solo incluye el fichero abierto. Activa esta opción para incluir
          siempre este fichero. El fichero que estás viendo se incluye siempre.
        </div>
      </div>

      <div className="file-setting__field-container">
        <div className="file-setting__field">
          <div>¿Incluir en la búsqueda?</div>
          <Switch isEnabled={setting.get('includeInSearch')} onToggle={toggleIncludeInSearch} />
        </div>

        <div className="file-setting__help-text">
          Por defecto, la búsqueda solo incluye el fichero que estás viendo. Activa esta opción para
          incluir siempre este fichero. El fichero abierto se incluye siempre.
        </div>
      </div>

      <div className="file-setting__field-container">
        <div className="file-setting__field">
          <div>¿Incluir en la lista de tareas?</div>
          <Switch isEnabled={setting.get('includeInTasklist')} onToggle={toggleIncludeInTasklist} />
        </div>

        <div className="file-setting__help-text">
          Por defecto, la lista de tareas solo incluye el fichero que estás viendo. Activa esta
          opción para incluir siempre este fichero. El fichero abierto se incluye siempre.
        </div>
      </div>

      <div className="file-setting__field-container">
        <div className="file-setting__field">
          <div>¿Incluir al archivar (refile)?</div>
          <Switch isEnabled={setting.get('includeInRefile')} onToggle={toggleIncludeInRefile} />
        </div>

        <div className="file-setting__help-text">
          Por defecto, solo el fichero que estás viendo está disponible como destino al mover
          encabezados (refile). Activa esta opción para incluir siempre este fichero. El fichero
          abierto se incluye siempre.
        </div>
      </div>
    </>
  );

  const renderDeleteButton = () => (
    <div className="file-setting__field-container file-setting__delete-button-container">
      <button className="btn settings-btn file-setting__delete-button" onClick={handleDeleteClick}>
        Eliminar ajuste
      </button>
    </div>
  );

  const caretClassName = classNames(
    'fas fa-2x fa-caret-right file-setting-container__header__caret',
    {
      'file-setting-container__header__caret--rotated': !isCollapsed,
    }
  );

  return (
    <Draggable draggableId={`file-setting--${setting.get('path')}`} index={index}>
      {(provided, snapshot) => (
        <div
          className={classNames('file-setting-container', {
            'file-setting-container--dragging': snapshot.isDragging,
          })}
          ref={provided.innerRef}
          {...provided.draggableProps}
        >
          <div className="file-setting-container__header" onClick={handleHeaderBarClick}>
            <i className={caretClassName} />
            <div className="file-setting-icons">
              <div
                className={classNames('default-on-startup-icon', {
                  'fas fa-bookmark fa-lg file-setting-icon': setting.get('defaultOnStartup'),
                })}
              />
              <div
                className={classNames('load-on-startup-icon', {
                  'fas fa-sync-alt fa-lg file-setting-icon': setting.get('loadOnStartup'),
                })}
              />
              <div
                className={classNames({
                  'fas fa-calendar-alt fa-lg file-setting-icon': setting.get('includeInAgenda'),
                })}
              />
              <div
                className={classNames({
                  'fas fa-search fa-lg file-setting-icon': setting.get('includeInSearch'),
                })}
              />
              <div
                className={classNames({
                  'fas fa-tasks fa-lg file-setting-icon': setting.get('includeInTasklist'),
                })}
              />
              <div
                className={classNames({
                  'fas fa-file-export fa-lg file-setting-icon': setting.get('includeInRefile'),
                })}
              />
            </div>

            <span className="file_setting-container__header__title">{setting.get('path')}</span>

            <i
              className="fas fa-bars fa-lg file-setting-container__header__drag-handle"
              {...provided.dragHandleProps}
            />
          </div>

          <Collapse isOpened={!isCollapsed} springConfig={{ stiffness: 300 }}>
            <div className="file-setting-container__content">
              {renderPathField(setting)}
              {renderOptionFields(setting)}
              {renderDeleteButton()}
            </div>
          </Collapse>
        </div>
      )}
    </Draggable>
  );
};
