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
      onInsertInactiveDate,
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

    // ORG Mode para Eli: todos los iconos en una rejilla uniforme (5 columnas en el móvil,
    // 8 en pantallas medianas y una sola fila en pantallas anchas), agrupados por función.
    const icons = [
      // Prioridad (primera posición)
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
      // Editar
      {
        className: 'fas fa-pencil-alt fa-lg',
        onClick: onTitleClick,
        title: 'Editar título del encabezado',
        testId: 'drawer-action-edit-title',
      },
      {
        className: 'fas fa-edit fa-lg',
        onClick: onDescriptionClick,
        title: 'Editar descripción del encabezado',
        testId: 'edit-header-title',
      },
      {
        className: 'fas fa-tags fa-lg',
        onClick: onTagsClick,
        title: 'Modificar etiquetas',
        testId: 'drawer-action-tags',
      },
      { className: 'far fa-sticky-note fa-lg', onClick: onAddNote, title: 'Añadir una nota' },
      // Fechas y tiempo
      {
        className: 'fas fa-calendar-check fa-lg',
        onClick: onDeadlineClick,
        testId: 'drawer-action-deadline',
        title: 'Fijar fecha límite',
      },
      {
        className: 'far fa-calendar-check fa-lg',
        onClick: onScheduledClick,
        testId: 'drawer-action-scheduled',
        title: 'Fijar fecha programada',
      },
      onInsertInactiveDate && {
        className: 'far fa-calendar-plus fa-lg',
        onClick: onInsertInactiveDate,
        testId: 'eli-inactive-date',
        title: 'Añadir la fecha de hoy como fecha inactiva, p. ej. [2026-09-23 Wed]',
      },
      hasActiveClock
        ? {
            className: 'fas fa-hourglass-end fa-lg',
            onClick: onClockInOutClick,
            onLongPress: onClockTotals,
            testId: 'org-clock-out',
            title: 'Parar reloj (mantén pulsado: tiempo total registrado)',
          }
        : {
            className: 'fas fa-hourglass-start fa-lg',
            onClick: onClockInOutClick,
            onLongPress: onClockTotals,
            testId: 'org-clock-in',
            title: 'Iniciar reloj (mantén pulsado: tiempo total registrado)',
          },
      {
        className: 'fas fa-list fa-lg',
        onClick: onPropertiesClick,
        title: 'Modificar propiedades',
        testId: 'drawer-action-properties',
      },
      onAttachFiles && {
        className: 'fas fa-paperclip fa-lg',
        onClick: onAttachFiles,
        testId: 'eli-attach',
        title: 'Adjuntar imagen o archivo (se sube a assets/año en Dropbox)',
      },
      // Estructura y salida
      {
        className: 'fas fa-plus fa-lg',
        onClick: onAddNewHeader,
        onLongPress: handleDuplicateHeader,
        testId: 'header-action-plus',
        title: 'Crear encabezado debajo (mantén pulsado para duplicar el actual)',
      },
      {
        className: 'fas fa-file-export fa-lg',
        onClick: onRefileHeader,
        testId: 'org-refile',
        title: 'Mover (refile) este encabezado a otro encabezado',
      },
      onArchive && {
        className: 'fas fa-archive fa-lg',
        onClick: onArchive,
        testId: 'eli-archive',
        title: 'Archivar (como org-archive-subtree; pide confirmación)',
      },
      onCopyLink && {
        className: 'fas fa-link fa-lg eli-copy-link-icon',
        onClick: onCopyLink,
        testId: 'eli-copy-link',
        title: 'Copiar el enlace a este encabezado (como C-c l en Emacs)',
      },
      {
        className: 'fas fa-share fa-lg',
        onClick: onShareHeader,
        testId: 'share',
        title: 'Compartir este encabezado por correo',
      },
      onExportPdf && {
        className: 'fas fa-file-pdf fa-lg',
        onClick: onExportPdf,
        testId: 'eli-print-header',
        title: 'Exportar este encabezado y sus subencabezados a PDF',
      },
      // Borrar (al final; pide confirmación)
      onRemoveHeader && {
        className: 'fas fa-trash fa-lg eli-drawer-trash',
        onClick: onRemoveHeader,
        testId: 'eli-remove-header',
        title: 'Borrar este encabezado (pide confirmación)',
      },
    ].filter(Boolean);

    return (
      <div className="header-action-drawer-container" data-testid="header-action-drawer">
        <div className="header-action-drawer__grid" style={{ '--eli-icon-count': icons.length }}>
          {icons.map((icon) => (
            <React.Fragment key={icon.className + (icon.testId || '')}>
              {this.iconWithFFClickCatcher(icon)}
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  }
}
