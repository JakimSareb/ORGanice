import { chooseCaptureTemplate } from '../../../../lib/eli_capture_menu';
import React, { Fragment, useState, useMemo, useRef, useEffect } from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';

import { Motion, spring } from 'react-motion';

import './stylesheet.css';

import { List, Map } from 'immutable';

import * as orgActions from '../../../../actions/org';
import * as captureActions from '../../../../actions/capture';
import * as baseActions from '../../../../actions/base';

import sampleCaptureTemplates from '../../../../lib/sample_capture_templates';

import ActionButton from './components/ActionButton/';
import { determineIncludedFiles } from '../../../../reducers/org';

const ActionDrawer = ({
  org,
  selectedHeaderId,
  base,
  staticFile,
  captureTemplates,
  path,
  selectedTableCellId,
  selectedListItemId,
  activeClocks,
}) => {
  const [isDisplayingArrowButtons, setIsDisplayingArrowButtons] = useState(false);
  const [isDisplayingCaptureButtons, setIsDisplayingCaptureButtons] = useState(false);

  const mainArrowButton = useRef(null);

  const mainArrowButtonBoundingRect = useMemo(
    () => (!!mainArrowButton.current ? mainArrowButton.current.getBoundingClientRect() : null),
    [mainArrowButton]
  );

  const handleUpClick = () =>
    !!selectedHeaderId
      ? org.moveHeaderUp(selectedHeaderId)
      : !!selectedTableCellId
      ? org.moveTableRowUp()
      : org.moveListItemUp();

  const handleDownClick = () =>
    !!selectedHeaderId
      ? org.moveHeaderDown(selectedHeaderId)
      : !!selectedTableCellId
      ? org.moveTableRowDown()
      : org.moveListItemDown();

  const handleLeftClick = () =>
    !!selectedHeaderId
      ? org.moveHeaderLeft(selectedHeaderId)
      : !!selectedTableCellId
      ? org.moveTableColumnLeft()
      : org.moveListItemLeft();

  const handleRightClick = () =>
    !!selectedHeaderId
      ? org.moveHeaderRight(selectedHeaderId)
      : !!selectedTableCellId
      ? org.moveTableColumnRight()
      : org.moveListItemRight();

  const handleMoveSubtreeLeftClick = () =>
    !!selectedHeaderId ? org.moveSubtreeLeft(selectedHeaderId) : org.moveListSubtreeLeft();

  const handleMoveSubtreeRightClick = () =>
    !!selectedHeaderId ? org.moveSubtreeRight(selectedHeaderId) : org.moveListSubtreeRight();

  const handleCaptureButtonClick = (template) => () => {
    setIsDisplayingCaptureButtons(false);
    base.activatePopup('capture', {
      templateId: template.get('id'),
      templateDescription: template.get('description'),
    });
  };

  const getSampleCaptureTemplates = () => sampleCaptureTemplates;

  const getAvailableCaptureTemplates = () =>
    staticFile === 'sample'
      ? getSampleCaptureTemplates()
      : captureTemplates.filter(
          (template) =>
            template.get('isAvailableInAllOrgFiles') ||
            template
              .get('orgFilesWhereAvailable')
              .map((availablePath) =>
                availablePath.trim().startsWith('/')
                  ? availablePath.trim()
                  : '/' + availablePath.trim()
              )
              .includes((path || '').trim())
        );

  const handleMainArrowButtonClick = () => setIsDisplayingArrowButtons(!isDisplayingArrowButtons);

  const handleSearchButtonClick = () => {
    base.activatePopup('search');
  };

  const handleMainCaptureButtonClick = () => {
    if (!isDisplayingCaptureButtons && getAvailableCaptureTemplates().size === 0) {
      alert(
        'No tienes plantillas de captura para este fichero. Añade alguna en Ajustes > Plantillas de captura.'
      );
      return;
    }

    setIsDisplayingCaptureButtons(!isDisplayingCaptureButtons);
  };

  // ORG Mode para Eli: atajo de captura (tecla c, configurable): muestra las plantillas y la
  // siguiente tecla elige la plantilla por su letra (Escape cancela)
  const latest = useRef();
  latest.current = { getAvailableCaptureTemplates, handleCaptureButtonClick };
  useEffect(() => {
    const onMenu = async () => {
      const templates = latest.current.getAvailableCaptureTemplates();
      if (!templates || templates.size === 0) {
        alert('No hay plantillas de captura para este fichero (Ajustes → Plantillas de captura).');
        return;
      }
      const template = await chooseCaptureTemplate(templates);
      if (template) latest.current.handleCaptureButtonClick(template)();
    };
    window.addEventListener('eli:capture-menu', onMenu);
    return () => window.removeEventListener('eli:capture-menu', onMenu);
  }, []);

  // ORG Mode para Eli: tecla m (configurable) abre/cierra las flechas de mover; Esc las cierra
  const arrowsOpen = useRef(false);
  arrowsOpen.current = isDisplayingArrowButtons;
  useEffect(() => {
    const onMove = () => {
      setIsDisplayingCaptureButtons(false);
      setIsDisplayingArrowButtons(!arrowsOpen.current);
    };
    const onKey = (e) => {
      if (e.key !== 'Escape' || !arrowsOpen.current) return;
      if (document.querySelector('.eli-prompt__overlay, [data-testid="drawer"]')) return;
      e.preventDefault();
      setIsDisplayingArrowButtons(false);
    };
    window.addEventListener('eli:move-menu', onMove);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('eli:move-menu', onMove);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const renderCaptureButtons = () => {
    const availableCaptureTemplates = getAvailableCaptureTemplates();

    const baseCaptureButtonStyle = {
      position: 'absolute',
      zIndex: 0,
      left: 0,
      opacity: isDisplayingArrowButtons ? 0 : 1,
    };
    if (!isDisplayingCaptureButtons) {
      baseCaptureButtonStyle.boxShadow = 'none';
    }

    const mainButtonStyle = {
      opacity: isDisplayingArrowButtons ? 0 : 1,
      position: 'relative',
      zIndex: 1,
    };

    const animatedStyle = {
      bottom: spring(isDisplayingCaptureButtons ? 70 : 0, { stiffness: 300 }),
    };

    return (
      <Motion style={animatedStyle}>
        {(style) => (
          <div className="action-drawer__capture-buttons-container">
            <ActionButton
              iconName={isDisplayingCaptureButtons ? 'times' : 'plus'}
              isDisabled={false}
              onClick={handleMainCaptureButtonClick}
              style={mainButtonStyle}
              dataTestId="capture-main-button"
              tooltip={
                isDisplayingCaptureButtons
                  ? 'Ocultar plantillas de captura'
                  : 'Mostrar plantillas de captura'
              }
            />

            {availableCaptureTemplates.map((template, index) => (
              <ActionButton
                key={template.get('id')}
                letter={template.get('letter')}
                iconName={template.get('iconName')}
                isDisabled={false}
                onClick={handleCaptureButtonClick(template)}
                style={{ ...baseCaptureButtonStyle, bottom: style.bottom * (index + 1) }}
                dataTestId={`capture-template-${template
                  .get('description')
                  .toLowerCase()
                  .replace(/\s+/g, '-')}`}
                tooltip={`Activar la plantilla de captura «${template.get('description')}»`}
              />
            ))}
          </div>
        )}
      </Motion>
    );
  };

  const renderMovementButtons = () => {
    const baseArrowButtonStyle = {
      opacity: isDisplayingCaptureButtons ? 0 : 1,
    };
    if (!isDisplayingArrowButtons) {
      baseArrowButtonStyle.boxShadow = 'none';
    }

    let centerXOffset = 0;
    if (!!mainArrowButtonBoundingRect) {
      centerXOffset =
        window.screen.width / 2 -
        (mainArrowButtonBoundingRect.x + mainArrowButtonBoundingRect.width / 2);
    }

    const animatedStyles = {
      centerXOffset: spring(isDisplayingArrowButtons ? centerXOffset : 0, { stiffness: 300 }),
      topRowYOffset: spring(isDisplayingArrowButtons ? 150 : 0, { stiffness: 300 }),
      bottomRowYOffset: spring(isDisplayingArrowButtons ? 80 : 0, { stiffness: 300 }),
      firstColumnXOffset: spring(isDisplayingArrowButtons ? 70 : 0, {
        stiffness: 300,
      }),
      secondColumnXOffset: spring(isDisplayingArrowButtons ? 140 : 0, {
        stiffness: 300,
      }),
    };

    let subIconNameStr = null;
    let tooltipUpStr = 'Subir encabezado';
    let tooltipDownStr = 'Bajar encabezado';
    let tooltipLeftStr = 'Subir de nivel el encabezado';
    let tooltipRightStr = 'Bajar de nivel el encabezado';
    if (!!selectedTableCellId) {
      subIconNameStr = 'table';
      tooltipUpStr = 'Subir fila';
      tooltipDownStr = 'Bajar fila';
      tooltipLeftStr = 'Mover columna a la izquierda';
      tooltipRightStr = 'Mover columna a la derecha';
    } else if (!!selectedListItemId) {
      subIconNameStr = 'list';
      tooltipUpStr = 'Subir elemento de lista';
      tooltipDownStr = 'Bajar elemento de lista';
      tooltipLeftStr = 'Subir de nivel el elemento de lista';
      tooltipRightStr = 'Bajar de nivel el elemento de lista';
    }

    return (
      <Motion style={animatedStyles}>
        {(style) => (
          <div
            className={
              'action-drawer__arrow-buttons-container eli-arrows' +
              (isDisplayingArrowButtons ? ' is-open' : '')
            }
            style={{
              pointerEvents:
                isDisplayingCaptureButtons || !isDisplayingArrowButtons ? 'none' : 'all',
            }}
          >
            <ActionButton
              additionalClassName="action-drawer__arrow-button"
              iconName="arrow-up"
              subIconName={subIconNameStr}
              isDisabled={false}
              onClick={handleUpClick}
              style={{ ...baseArrowButtonStyle, bottom: style.topRowYOffset }}
              tooltip={tooltipUpStr}
            />
            <ActionButton
              additionalClassName="action-drawer__arrow-button"
              iconName="arrow-down"
              subIconName={subIconNameStr}
              isDisabled={false}
              onClick={handleDownClick}
              style={{ ...baseArrowButtonStyle, bottom: style.bottomRowYOffset }}
              tooltip={tooltipDownStr}
            />
            <ActionButton
              additionalClassName="action-drawer__arrow-button"
              iconName="arrow-left"
              subIconName={subIconNameStr}
              isDisabled={false}
              onClick={handleLeftClick}
              style={{
                ...baseArrowButtonStyle,
                bottom: style.bottomRowYOffset,
                right: style.firstColumnXOffset,
              }}
              tooltip={tooltipLeftStr}
            />
            <ActionButton
              additionalClassName="action-drawer__arrow-button"
              iconName="arrow-right"
              subIconName={subIconNameStr}
              isDisabled={false}
              onClick={handleRightClick}
              style={{
                ...baseArrowButtonStyle,
                bottom: style.bottomRowYOffset,
                left: style.firstColumnXOffset,
              }}
              tooltip={tooltipRightStr}
            />
            {!selectedTableCellId && (
              <Fragment>
                <ActionButton
                  additionalClassName="action-drawer__arrow-button"
                  iconName="chevron-left"
                  subIconName={subIconNameStr}
                  isDisabled={false}
                  onClick={handleMoveSubtreeLeftClick}
                  style={{
                    ...baseArrowButtonStyle,
                    bottom: style.bottomRowYOffset,
                    right: style.secondColumnXOffset,
                  }}
                  tooltip="Subir de nivel todo el subárbol"
                />
                <ActionButton
                  additionalClassName="action-drawer__arrow-button"
                  iconName="chevron-right"
                  subIconName={subIconNameStr}
                  isDisabled={false}
                  onClick={handleMoveSubtreeRightClick}
                  style={{
                    ...baseArrowButtonStyle,
                    bottom: style.bottomRowYOffset,
                    left: style.secondColumnXOffset,
                  }}
                  tooltip="Bajar de nivel todo el subárbol"
                />
              </Fragment>
            )}

            <ActionButton
              iconName={isDisplayingArrowButtons ? 'times' : 'arrows-alt'}
              subIconName={subIconNameStr}
              additionalClassName="action-drawer__main-arrow-button"
              isDisabled={false}
              onClick={handleMainArrowButtonClick}
              style={{
                opacity: isDisplayingCaptureButtons ? 0 : 1,
                pointerEvents: isDisplayingCaptureButtons ? 'none' : 'all',
              }}
              tooltip={
                isDisplayingArrowButtons
                  ? 'Ocultar botones de movimiento'
                  : 'Mostrar botones de movimiento'
              }
              onRef={mainArrowButton}
            />
          </div>
        )}
      </Motion>
    );
  };

  const handleAgendaClick = () => base.activatePopup('agenda');

  return (
    <div className="action-drawer-container nice-scroll">
      {
        <Fragment>
          {/* ORG Mode para Eli: abajo solo Buscar, Agenda y Capturar. Sincronizar, Ficheros
              principales y Mover (flechas) están en el menú «⋯» de arriba (y con s, f y m). */}
          {renderMovementButtons()}

          <ActionButton
            iconName={'search'}
            isDisabled={false}
            onClick={handleSearchButtonClick}
            additionalClassName={activeClocks !== 0 ? 'active-clock-indicator' : undefined}
            style={{
              opacity: isDisplayingArrowButtons || isDisplayingCaptureButtons ? 0 : 1,
              position: 'relative',
              zIndex: 1,
              pointerEvents:
                isDisplayingArrowButtons || isDisplayingCaptureButtons ? 'none' : 'all',
            }}
            tooltip="Mostrar búsqueda / lista de tareas"
          />

          <ActionButton
            iconName="calendar-alt"
            isDisabled={false}
            onClick={handleAgendaClick}
            style={{
              opacity: isDisplayingArrowButtons || isDisplayingCaptureButtons ? 0 : 1,
              pointerEvents:
                isDisplayingArrowButtons || isDisplayingCaptureButtons ? 'none' : 'all',
            }}
            tooltip="Mostrar agenda"
          />

          {renderCaptureButtons()}
        </Fragment>
      }
    </div>
  );
};

const mapStateToProps = (state) => {
  const path = state.org.present.get('path');
  const files = state.org.present.get('files');
  const file = state.org.present.getIn(['files', path], Map());
  const fileSettings = state.org.present.get('fileSettings');
  const searchFiles = determineIncludedFiles(files, fileSettings, path, 'includeInSearch', false);
  const activeClocks = Object.values(
    searchFiles.map((f) => (f.get('headers').size ? f.get('activeClocks') : 0)).toJS()
  ).reduce((acc, val) => (typeof val === 'number' ? acc + val : acc), 0);
  return {
    selectedHeaderId: file.get('selectedHeaderId'),
    isDirty: file.get('isDirty'),
    isNarrowedHeaderActive: !!file.get('narrowedHeaderId'),
    selectedTableCellId: file.get('selectedTableCellId'),
    selectedListItemId: file.get('selectedListItemId'),
    captureTemplates: state.capture.get('captureTemplates', List()),
    path,
    isLoading: !state.base.get('isLoading').isEmpty(),
    online: state.base.get('online'),
    activeClocks,
  };
};

const mapDispatchToProps = (dispatch) => {
  return {
    org: bindActionCreators(orgActions, dispatch),
    capture: bindActionCreators(captureActions, dispatch),
    base: bindActionCreators(baseActions, dispatch),
  };
};

export default connect(mapStateToProps, mapDispatchToProps)(ActionDrawer);
