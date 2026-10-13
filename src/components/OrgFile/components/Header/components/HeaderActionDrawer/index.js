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
      onDeleteAttachments,
      onExportPdf,
      onRemoveHeader,
      onTogglePriority,
      isPriorityA,
      onArchive,
      taskState,
      onCompleteTask,
      onClockTotals,
      onCopyLink,
      onNarrow,
      onEditPlain,
      onWiden,
      isNarrowed,
      onAssignProject,
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
      // (2.18) Etiquetas, a la vista (antes en «⋯»)
      {
        className: 'fas fa-tags fa-lg',
        onClick: onTagsClick,
        testId: 'drawer-action-tags',
        title: 'Etiquetas',
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
      // (2.18) «Marcar como hecha» (antes, casilla a la vista): DONE; o CANCELLED
      onCompleteTask &&
        taskState === 'active' && {
          icon: 'far fa-check-square',
          label: 'Marcar como hecha',
          onClick: () => onCompleteTask(false),
          testId: 'eli-complete-task',
        },
      onCompleteTask &&
        taskState === 'active' && {
          icon: 'far fa-window-close',
          label: 'Cancelar la tarea (CANCELLED)',
          onClick: () => onCompleteTask(true),
          testId: 'eli-cancel-task',
        },
      // (2.18) editar solo este encabezado (y sus subencabezados) como texto plano
      onEditPlain && {
        icon: 'fas fa-code',
        label: 'Editar como texto plano',
        onClick: onEditPlain,
        testId: 'eli-header-edit-plain',
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
      // 2.15: reducir al encabezado (narrow) desde su propio menú; si ya está reducido, «Ver todo»
      isNarrowed
        ? onWiden && {
            icon: 'fas fa-expand',
            label: 'Ver todo el fichero (widen)',
            onClick: onWiden,
            testId: 'eli-header-widen',
          }
        : onNarrow && {
            icon: 'fas fa-compress',
            label: 'Reducir a este encabezado (narrow)',
            onClick: onNarrow,
            testId: 'eli-header-narrow',
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
      onDeleteAttachments && {
        icon: 'fas fa-trash-alt',
        label: 'Borrar adjuntos…',
        onClick: onDeleteAttachments,
        testId: 'eli-delete-attachments',
      },
      {
        icon: 'far fa-clone',
        label: 'Duplicar',
        onClick: handleDuplicateHeader,
        testId: 'eli-duplicate-header',
      },
      // (3.01) asignar a un proyecto (aunque esté en otro fichero)
      onAssignProject && {
        icon: 'fas fa-project-diagram',
        label: 'Asignar a proyecto…',
        onClick: onAssignProject,
        testId: 'eli-assign-project',
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
