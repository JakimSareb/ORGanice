import EliMoreMenu from '../../../../../EliMoreMenu';
import React, { PureComponent } from 'react';

import './stylesheet.css';

export default class HeaderActionDrawer extends PureComponent {
  constructor(props) {
    super(props);
    this.longPressTimer = null;
    this.isLongPressing = false;
  }

  // A nasty hack required to get click handling to work properly in Firefox. No idea why its
  // broken in the first place or why this fixes it.
  iconWithFFClickCatcher({ className, onClick, onLongPress, title, testId = '' }) {
    const handleMouseDown = onLongPress
      ? (e) => {
          // ORG Mode para Eli: que el encabezado no reciba esta pulsación (su propia pulsación
          // larga cancelaba la del icono)
          e.stopPropagation();
          this.isLongPressing = false;
          // Store reference to the target element to avoid React event pooling issues
          const targetElement = e.currentTarget;
          // Add visual feedback class immediately for better UX
          targetElement.classList.add('header-action-drawer__long-press-feedback');
          this.longPressTimer = setTimeout(() => {
            this.isLongPressing = true;
            onLongPress(e);
            // Add success feedback class
            targetElement.classList.add('header-action-drawer__long-press-success');
          }, 600);
        }
      : undefined;

    const handleMouseUp = onLongPress
      ? (e) => {
          if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
          }
          // Remove visual feedback classes
          e.currentTarget.classList.remove('header-action-drawer__long-press-feedback');
          e.currentTarget.classList.remove('header-action-drawer__long-press-success');
        }
      : undefined;

    const handleMouseLeave = onLongPress
      ? (e) => {
          if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
          }
          // Remove visual feedback classes
          e.currentTarget.classList.remove('header-action-drawer__long-press-feedback');
          e.currentTarget.classList.remove('header-action-drawer__long-press-success');
        }
      : undefined;

    const handleClick = onClick
      ? (e) => {
          // Only trigger regular click if it wasn't a long press
          // (la marca de pulsación larga solo cuenta para iconos que la tienen)
          if (!onLongPress || !this.isLongPressing) {
            onClick(e);
          }
          if (onLongPress) this.isLongPressing = false;
        }
      : undefined;

    return (
      <div
        title={title}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleMouseDown}
        onTouchEnd={handleMouseUp}
        onTouchCancel={handleMouseLeave}
        className="header-action-drawer__ff-click-catcher-container"
      >
        <div className="header-action-drawer__ff-click-catcher" />
        <i className={className} data-testid={testId} />
      </div>
    );
  }

  render() {
    const {
      onTitleClick,
      onDescriptionClick,
      onTagsClick,
      onPropertiesClick,
      onAddNewHeader,
      onDeadlineClick,
      onClockInOutClick,
      onScheduledClick,
      hasActiveClock,
      onShareHeader,
      onRefileHeader,
      onAddNote,
      onDuplicateHeader,
      onAttachFiles,
      onExportPdf,
      onRemoveHeader,
      onTogglePriority,
      isPriorityA,
      onArchive,
      taskState,
      onCompleteTask,
      onClockTotals,
      onCopyLink,
    } = this.props;

    // Create a fallback function for onDuplicateHeader if not provided
    const handleDuplicateHeader =
      onDuplicateHeader ||
      ((e) => {
        // As a fallback, just call the regular add new header function
        if (onAddNewHeader) {
          onAddNewHeader(e);
        }
      });

    // ORG Mode para Eli: a la vista solo lo de cada día (8 iconos); el resto en «⋯»
    const icons = [
      onTogglePriority && {
        className: `${isPriorityA ? 'fas' : 'far'} fa-star fa-lg eli-drawer-star${
          isPriorityA ? ' is-on' : ''
        }`,
        onClick: onTogglePriority,
        testId: 'eli-priority',
        title: isPriorityA ? 'Quitar la prioridad [#A]' : 'Marcar con prioridad [#A]',
      },
      // Casilla de tarea: gris si no es tarea o ya está terminada; si está activa, clic → DONE
      // y mayúsculas + clic → CANCELLED
      onCompleteTask && {
        className: `far ${
          taskState === 'done' ? 'fa-check-square' : 'fa-square'
        } fa-lg eli-drawer-task${taskState === 'active' ? ' is-active' : ' is-inactive'}`,
        onClick: (e) => taskState === 'active' && onCompleteTask(!!(e && e.shiftKey)),
        testId: 'eli-complete-task',
        title:
          taskState === 'active'
            ? 'Terminar la tarea (DONE); con mayúsculas pulsada, cancelarla (CANCELLED)'
            : taskState === 'done'
            ? 'Tarea terminada'
            : 'No es una tarea',
      },
      {
        className: 'fas fa-pencil-alt fa-lg',
        onClick: onTitleClick,
        title:
          'Editar el título (con el tabulador pasas a la descripción, las etiquetas y las fechas)',
        testId: 'drawer-action-edit-title',
      },
      {
        className: 'fas fa-edit fa-lg',
        onClick: onDescriptionClick,
        title: 'Editar la descripción',
        testId: 'edit-header-title',
      },
      {
        className: 'fas fa-calendar-check fa-lg',
        onClick: onDeadlineClick,
        testId: 'drawer-action-deadline',
        title: 'Fecha límite (DEADLINE)',
      },
      {
        className: 'far fa-calendar-check fa-lg',
        onClick: onScheduledClick,
        testId: 'drawer-action-scheduled',
        title: 'Fecha programada (SCHEDULED)',
      },
      {
        className: 'fas fa-plus fa-lg',
        onClick: onAddNewHeader,
        onLongPress: handleDuplicateHeader,
        testId: 'header-action-plus',
        title: 'Nuevo encabezado debajo (mantén pulsado para duplicar el actual)',
      },
      {
        className: 'fas fa-file-export fa-lg',
        onClick: onRefileHeader,
        testId: 'org-refile',
        title: 'Mover (refile) a otro encabezado o fichero',
      },
      // El reloj solo se ve fuera mientras está en marcha
      hasActiveClock && {
        className: 'fas fa-hourglass-end fa-lg eli-drawer-clock-on',
        onClick: onClockInOutClick,
        onLongPress: onClockTotals,
        testId: 'org-clock-out',
        title: 'Parar reloj (mantén pulsado: tiempo total registrado)',
      },
    ].filter(Boolean);

    const more = [
      {
        icon: 'fas fa-tags',
        label: 'Etiquetas',
        onClick: onTagsClick,
        testId: 'drawer-action-tags',
      },
      {
        icon: 'far fa-sticky-note',
        label: 'Añadir una nota',
        onClick: onAddNote,
        testId: 'eli-add-note',
      },
      !hasActiveClock && {
        icon: 'fas fa-hourglass-start',
        label: 'Iniciar reloj',
        onClick: onClockInOutClick,
        testId: 'org-clock-in',
      },
      onClockTotals && {
        icon: 'far fa-clock',
        label: 'Tiempo registrado',
        onClick: onClockTotals,
        testId: 'eli-clock-totals',
      },
      {
        icon: 'fas fa-list',
        label: 'Propiedades',
        onClick: onPropertiesClick,
        testId: 'drawer-action-properties',
      },
      onAttachFiles && {
        icon: 'fas fa-paperclip',
        label: 'Adjuntar archivo',
        onClick: onAttachFiles,
        testId: 'eli-attach',
      },
      {
        icon: 'far fa-clone',
        label: 'Duplicar',
        onClick: handleDuplicateHeader,
        testId: 'eli-duplicate-header',
      },
      onArchive && {
        icon: 'fas fa-archive',
        label: 'Archivar',
        onClick: onArchive,
        testId: 'eli-archive',
      },
      onCopyLink && {
        icon: 'fas fa-link',
        label: 'Copiar enlace (C-c l)',
        onClick: onCopyLink,
        testId: 'eli-copy-link',
      },
      {
        icon: 'fas fa-share',
        label: 'Compartir por correo',
        onClick: onShareHeader,
        testId: 'share',
      },
      onExportPdf && {
        icon: 'fas fa-file-pdf',
        label: 'Exportar a PDF',
        onClick: onExportPdf,
        testId: 'eli-print-header',
      },
      onRemoveHeader && {
        icon: 'fas fa-trash',
        label: 'Borrar',
        onClick: onRemoveHeader,
        testId: 'eli-remove-header',
        danger: true,
      },
    ];

    return (
      <div className="header-action-drawer-container" data-testid="header-action-drawer">
        <div
          className="header-action-drawer__grid"
          style={{ '--eli-icon-count': icons.length + 1 }}
        >
          {icons.map((icon) => (
            <React.Fragment key={icon.className + (icon.testId || '')}>
              {this.iconWithFFClickCatcher(icon)}
            </React.Fragment>
          ))}
          <div className="header-action-drawer__ff-click-catcher-container eli-drawer-more">
            <EliMoreMenu items={more} testId="eli-more-header" />
          </div>
        </div>
      </div>
    );
  }
}
