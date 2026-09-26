import React, { Fragment } from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';

import { Droppable } from 'react-beautiful-dnd';

import './stylesheet.css';

import * as captureActions from '../../actions/capture';

import CaptureTemplate from './components/CaptureTemplate';

import { List } from 'immutable';
import { STATIC_FILE_PREFIX } from '../../lib/org_utils';

const CaptureTemplatesEditor = ({
  captureTemplates,
  syncBackendType,
  capture,
  loadedFilePaths,
}) => {
  const handleAddNewTemplateClick = () => capture.addNewEmptyCaptureTemplate();

  const handleFieldPathUpdate = (templateId, fieldPath, newValue) =>
    capture.updateTemplateFieldPathValue(templateId, fieldPath, newValue);

  const handleAddNewTemplateOrgFileAvailability = (templateId) =>
    capture.addNewTemplateOrgFileAvailability(templateId);

  const handleRemoveTemplateOrgFileAvailability = (templateId, orgFileAvailabilityIndex) =>
    capture.removeTemplateOrgFileAvailability(templateId, orgFileAvailabilityIndex);

  const handleAddNewTemplateHeaderPath = (templateId) =>
    capture.addNewTemplateHeaderPath(templateId);

  const handleRemoveTemplateHeaderPath = (templateId, headerPathIndex) =>
    capture.removeTemplateHeaderPath(templateId, headerPathIndex);

  const handleDeleteTemplate = (templateId) => capture.deleteTemplate(templateId);

  const handleReorderTemplate = (fromIndex, toIndex) =>
    capture.reorderCaptureTemplate(fromIndex, toIndex);

  return (
    <div>
      <Droppable droppableId="capture-templates-editor-droppable" type="CAPTURE-TEMPLATE">
        {(provided) => (
          <div
            className="capture-templates-container"
            ref={provided.innerRef}
            {...provided.droppableProps}
          >
            {captureTemplates.size === 0 ? (
              <div className="no-capture-templates-message">
                Todavía no tienes ninguna plantilla de captura. Añade una pulsando el botón{' '}
                <i className="fas fa-plus" />.
                <br />
                <br />
                Las plantillas de captura aparecen en el panel de acciones y te permiten crear
                encabezados nuevos rápidamente (como org-capture).
              </div>
            ) : (
              <Fragment>
                {captureTemplates.map((template, index) => (
                  <CaptureTemplate
                    key={template.get('id')}
                    index={index}
                    template={template}
                    syncBackendType={syncBackendType}
                    loadedFilePaths={loadedFilePaths}
                    onFieldPathUpdate={handleFieldPathUpdate}
                    onAddNewTemplateOrgFileAvailability={handleAddNewTemplateOrgFileAvailability}
                    onRemoveTemplateOrgFileAvailability={handleRemoveTemplateOrgFileAvailability}
                    onAddNewTemplateHeaderPath={handleAddNewTemplateHeaderPath}
                    onRemoveTemplateHeaderPath={handleRemoveTemplateHeaderPath}
                    onDeleteTemplate={handleDeleteTemplate}
                    onReorder={handleReorderTemplate}
                  />
                ))}

                {provided.placeholder}
              </Fragment>
            )}
          </div>
        )}
      </Droppable>

      <div className="new-capture-template-button-container">
        <button className="fas fa-plus fa-lg btn btn--circle" onClick={handleAddNewTemplateClick} />
      </div>
    </div>
  );
};

const mapStateToProps = (state) => {
  const loadedFilePaths = state.org.present
    .get('files', List())
    .keySeq()
    .toJS()
    .filter((path) => !path.startsWith(STATIC_FILE_PREFIX));
  loadedFilePaths.unshift('');
  return {
    captureTemplates: state.capture.get('captureTemplates', List()),
    syncBackendType: state.syncBackend.get('client').type,
    loadedFilePaths,
  };
};

const mapDispatchToProps = (dispatch) => {
  return {
    capture: bindActionCreators(captureActions, dispatch),
  };
};

export default connect(mapStateToProps, mapDispatchToProps)(CaptureTemplatesEditor);
