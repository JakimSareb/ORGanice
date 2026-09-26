import React, { Fragment, useState } from 'react';
import { UnmountClosed as Collapse } from 'react-collapse';

import { Draggable } from 'react-beautiful-dnd';

import './stylesheet.css';

import ActionButton from '../../../OrgFile/components/ActionDrawer/components/ActionButton';
import Switch from '../../../UI/Switch/';
import ExternalLink from '../../../UI/ExternalLink';

import classNames from 'classnames';

export default ({
  template,
  index,
  onFieldPathUpdate,
  onAddNewTemplateOrgFileAvailability,
  onRemoveTemplateOrgFileAvailability,
  onAddNewTemplateHeaderPath,
  onRemoveTemplateHeaderPath,
  onDeleteTemplate,
  syncBackendType,
  loadedFilePaths,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(!!template.get('description'));
  const handleHeaderBarClick = () => setIsCollapsed(!isCollapsed);

  const updateField = (fieldName) => (event) =>
    onFieldPathUpdate(template.get('id'), [fieldName], event.target.value);

  const toggleAvailabilityInAllOrgFiles = () =>
    onFieldPathUpdate(
      template.get('id'),
      ['isAvailableInAllOrgFiles'],
      !template.get('isAvailableInAllOrgFiles')
    );

  const togglePrepend = () =>
    onFieldPathUpdate(template.get('id'), ['shouldPrepend'], !template.get('shouldPrepend'));

  const handleAddNewOrgFileAvailability = () => {
    onAddNewTemplateOrgFileAvailability(template.get('id'));
  };

  const handleRemoveOrgFileAvailability = (index) => () =>
    onRemoveTemplateOrgFileAvailability(template.get('id'), index);

  const handleOrgFileAvailabilityChange = (orgFileAvailabilityIndex) => (event) =>
    onFieldPathUpdate(
      template.get('id'),
      ['orgFilesWhereAvailable', orgFileAvailabilityIndex],
      event.target.value
    );

  const handleAddNewHeaderPath = () => onAddNewTemplateHeaderPath(template.get('id'));

  const handleRemoveHeaderPath = (headerPathIndex) => () =>
    onRemoveTemplateHeaderPath(template.get('id'), headerPathIndex);

  const handleHeaderPathChange = (headerPathIndex) => (event) =>
    onFieldPathUpdate(template.get('id'), ['headerPaths', headerPathIndex], event.target.value);

  const handleDeleteClick = () => {
    if (
      window.confirm(`¿Seguro que quieres eliminar la plantilla «${template.get('description')}»?`)
    ) {
      onDeleteTemplate(template.get('id'));
    }
  };

  const renderDescriptionField = (template) => (
    <div className="capture-template__field-container">
      <div className="capture-template__field">
        <div>Descripción:</div>
        <input
          type="text"
          className="textfield"
          value={template.get('description', '')}
          onChange={updateField('description')}
        />
      </div>
    </div>
  );

  const renderIconField = (template) => (
    <div className="capture-template__field-container">
      <div className="capture-template__field">
        <div>Letra:</div>
        <input
          type="text"
          className="textfield capture-template__letter-textfield"
          maxLength="1"
          value={template.get('letter', '')}
          onChange={updateField('letter')}
          autoCapitalize="none"
        />
      </div>

      <div className="capture-template__field__or-container">
        <div className="capture-template__field__or-line" />
        <div className="capture-template__field__or">o</div>
        <div className="capture-template__field__or-line" />
      </div>

      <div className="capture-template__field">
        <div>Nombre del icono:</div>
        <input
          type="text"
          className="textfield"
          value={template.get('iconName')}
          onChange={updateField('iconName')}
          autoCapitalize="none"
          autoCorrect="none"
        />
      </div>

      <div className="capture-template__help-text">
        En lugar de una letra, puedes indicar el nombre de cualquier icono gratuito de Font Awesome
        (como lemon o calendar-plus) para usarlo como icono de captura. Puedes buscar los iconos
        disponibles{' '}
        <ExternalLink href="https://fontawesome.com/icons?d=gallery&s=solid&m=free">
          aquí
        </ExternalLink>
        .
      </div>
    </div>
  );

  const renderOrgFileAvailability = (template) => (
    <div className="capture-template__field-container">
      <div className="capture-template__field">
        <div>¿Disponible en todos los ficheros org?</div>
        <Switch
          isEnabled={template.get('isAvailableInAllOrgFiles')}
          onToggle={toggleAvailabilityInAllOrgFiles}
        />
      </div>

      <div className="capture-template__help-text">
        Puedes hacer que esta plantilla de captura esté disponible en todos los ficheros org o solo
        en los que indiques.
        {syncBackendType === 'Dropbox' && (
          <Fragment>
            {' '}
            Indica rutas completas desde la raíz de tu Dropbox, como <code>/org/todo.org</code>
          </Fragment>
        )}
      </div>

      <Collapse
        isOpened={!template.get('isAvailableInAllOrgFiles')}
        springConfig={{ stiffness: 300 }}
      >
        <div className="multi-textfields-container">
          {template.get('orgFilesWhereAvailable').map((orgFilePath, index) => (
            <div key={`org-file-availability-${index}`} className="multi-textfield-container">
              <input
                type="text"
                placeholder="p. ej., /org/todo.org"
                className="textfield multi-textfield-field"
                value={orgFilePath}
                onChange={handleOrgFileAvailabilityChange(index)}
              />
              <button
                className="fas fa-times fa-lg remove-multi-textfield-button"
                onClick={handleRemoveOrgFileAvailability(index)}
              />
            </div>
          ))}
        </div>

        <div className="add-new-multi-textfield-button-container">
          <button
            className="fas fa-plus add-new-multi-textfield-button"
            onClick={handleAddNewOrgFileAvailability}
          />
        </div>
      </Collapse>
    </div>
  );

  const renderFilePath = (template) => {
    return (
      <div className="capture-template__field-container">
        <div className="capture-template__field">
          <div>Fichero: </div>
          <select onChange={updateField('file')} style={{ width: '90%' }}>
            {(loadedFilePaths.filter((path) => (path === template.get('file', '')).length) !== 0
              ? loadedFilePaths
              : [template.get('file'), ...loadedFilePaths]
            ).map((path) => (
              <option key={path} value={path} selected={path === template.get('file')}>
                {path}
              </option>
            ))}
          </select>
        </div>
        <div className="capture-template__help-text">
          Por defecto, la captura se guarda en el fichero abierto en ese momento. Elige un fichero
          concreto si quieres que esta plantilla capture siempre en él. El fichero tiene que estar
          cargado para poder elegirlo aquí. También puedes configurarlo para que se cargue al
          iniciar en los ajustes de ficheros, así estará siempre disponible.
        </div>
      </div>
    );
  };

  const renderHeaderPaths = (template) => (
    <div className="capture-template__field-container">
      <div className="capture-template__field" style={{ marginTop: 7 }}>
        <div>Ruta del encabezado</div>
      </div>

      <div className="capture-template__help-text">
        Indica la ruta del encabezado bajo el que se guardará el nuevo encabezado. Un encabezado por
        campo de texto.
      </div>

      <div className="multi-textfields-container">
        {template.get('headerPaths').map((headerPath, index) => (
          <div key={`header-path-${index}`} className="multi-textfield-container">
            <input
              type="text"
              placeholder="p. ej., Tareas"
              className="textfield multi-textfield-field"
              value={headerPath}
              onChange={handleHeaderPathChange(index)}
            />
            <button
              className="fas fa-times fa-lg remove-multi-textfield-button"
              onClick={handleRemoveHeaderPath(index)}
            />
          </div>
        ))}
      </div>

      <div className="add-new-multi-textfield-button-container">
        <button
          className="fas fa-plus add-new-multi-textfield-button"
          onClick={handleAddNewHeaderPath}
        />
      </div>
    </div>
  );

  const renderPrependField = (template) => (
    <div className="capture-template__field-container">
      <div className="capture-template__field">
        <div>¿Añadir al principio?</div>
        <Switch isEnabled={template.get('shouldPrepend')} onToggle={togglePrepend} />
      </div>

      <div className="capture-template__help-text">
        Por defecto, los nuevos encabezados capturados se añaden al final de la ruta indicada.
        Activa esta opción para añadirlos al principio.
      </div>
    </div>
  );

  const renderTemplateField = (template) => (
    <div className="capture-template__field-container">
      <div className="capture-template__field" style={{ marginTop: 7 }}>
        <div>Plantilla</div>
      </div>

      <textarea
        className="textarea template-textarea"
        rows="3"
        value={template.get('template')}
        onChange={updateField('template')}
      />

      <div className="capture-template__help-text">
        La plantilla con la que se crea el elemento capturado. Puedes usar las siguientes variables,
        que se sustituyen al capturar:
        <ul>
          <li>
            <code>%?</code> - Coloca aquí el cursor.
          </li>
          <li>
            <code>%t</code> - Marca de tiempo, solo fecha.
          </li>
          <li>
            <code>%T</code> - Marca de tiempo, con fecha y hora.
          </li>
          <li>
            <code>%u</code> - Marca de tiempo inactiva, solo fecha.
          </li>
          <li>
            <code>%U</code> - Marca de tiempo inactiva, con fecha y hora.
          </li>
          <li>
            <code>%r</code> - Marca de tiempo sin formato, solo fecha, sin signos alrededor.
            <ul>
              <li>
                Crea expresiones personalizadas como{' '}
                <code>TODO Monthly - %?\n DEADLINE: &lt;%r .+1m&gt;</code>
              </li>
            </ul>
          </li>
          <li>
            <code>%R</code> - Marca de tiempo sin formato, con fecha y hora, sin signos alrededor.
          </li>
          <li>
            <code>%y</code> - Año sin formato
          </li>
          <li>
            <code>%{'<custom variable>'}</code> - Una variable personalizada de una captura con
            parámetros en la URL. Consulta{' '}
            <ExternalLink href="https://organice.200ok.ch/documentation.html#capture_templates">
              la documentación
            </ExternalLink>{' '}
            para más detalles.
          </li>
        </ul>
        También puedes usar <code>%u</code> y <code>%t</code> en la ruta del encabezado.
      </div>
    </div>
  );

  const renderDeleteButton = () => (
    <div className="capture-template__field-container capture-template__delete-button-container">
      <button
        className="btn settings-btn capture-template__delete-button"
        onClick={handleDeleteClick}
      >
        Eliminar plantilla
      </button>
    </div>
  );

  const caretClassName = classNames(
    'fas fa-2x fa-caret-right capture-template-container__header__caret',
    {
      'capture-template-container__header__caret--rotated': !isCollapsed,
    }
  );

  return (
    <Draggable draggableId={`capture-template--${template.get('id')}`} index={index}>
      {(provided, snapshot) => (
        <div
          className={classNames('capture-template-container', {
            'capture-template-container--dragging': snapshot.isDragging,
          })}
          ref={provided.innerRef}
          {...provided.draggableProps}
        >
          <div className="capture-template-container__header" onClick={handleHeaderBarClick}>
            <i className={caretClassName} />
            <ActionButton
              iconName={template.get('iconName')}
              letter={template.get('letter')}
              onClick={() => {}}
              style={{ marginRight: 20 }}
            />
            <span className="capture-template-container__header__title">
              {template.get('description')}
            </span>
            <i
              className="fas fa-bars fa-lg capture-template-container__header__drag-handle"
              {...provided.dragHandleProps}
            />
          </div>

          <Collapse isOpened={!isCollapsed} springConfig={{ stiffness: 300 }}>
            <div className="capture-template-container__content">
              {renderDescriptionField(template)}
              {renderIconField(template)}
              {renderOrgFileAvailability(template)}
              {renderFilePath(template)}
              {renderHeaderPaths(template)}
              {renderPrependField(template)}
              {renderTemplateField(template)}
              {renderDeleteButton()}
            </div>
          </Collapse>
        </div>
      )}
    </Draggable>
  );
};
