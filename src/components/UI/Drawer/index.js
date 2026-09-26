import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';

import './stylesheet.css';

import { Motion, spring } from 'react-motion';
import classNames from 'classnames';

export default ({ children, shouldIncludeCloseButton, onClose, maxSize = false }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [dragOffsetY, setDragOffsetY] = useState(null);

  useLayoutEffect(() => {
    setIsVisible(true);
  }, []);

  const initialClientY = useRef();
  const innerContainer = useRef();

  const innerContainerHeight = useRef();
  useLayoutEffect(() => {
    innerContainerHeight.current = innerContainer.current.offsetHeight;
  });

  const handleInnerContainerClick = (event) => event.stopPropagation();

  const handleClose = () => setIsVisible(false);

  // ORG Mode para Eli: solo se cierra al tocar fuera si la pulsación EMPEZÓ fuera. Si se
  // selecciona texto dentro y se suelta el ratón fuera, el navegador envía un «click» al
  // contenedor exterior y antes se cerraba la ventana.
  const pressStartedOutside = useRef(false);
  const handleOuterPressStart = (event) => {
    pressStartedOutside.current = event.target === event.currentTarget;
  };
  const handleOuterClick = (event) => {
    const startedOutside = pressStartedOutside.current;
    pressStartedOutside.current = false;
    if (event.target !== event.currentTarget || !startedOutside) return;
    handleClose();
  };

  const handleAnimationRest = () => (!isVisible && !!onClose ? onClose() : void 0);

  const handleTouchStart = (event) => (initialClientY.current = event.targetTouches[0].clientY);

  const handleTouchMove = (event) => {
    if (event.target.classList.contains('drag-handle')) {
      return;
    }

    const isScrollingDown = initialClientY.current > event.targetTouches[0].clientY;

    if (
      isScrollingDown &&
      innerContainer.current.scrollHeight - innerContainer.current.scrollTop <=
        innerContainer.current.clientHeight
    ) {
      event.preventDefault();
    } else if (!isScrollingDown && innerContainer.current.scrollTop === 0) {
      event.preventDefault();

      setDragOffsetY(event.targetTouches[0].clientY - initialClientY.current);
    }
  };

  useEffect(() => {
    const endInnerContainerDrag = () => {
      setIsVisible(dragOffsetY <= innerContainerHeight.current * 0.3);
      setDragOffsetY(null);
    };
    const handleTouchEndOrCancel = () => endInnerContainerDrag();

    if (!!innerContainer.current) {
      // Super annoying logic for disabling scrolling of the body when a slide up is active.
      // Briefly: if we're already at the top of our Drawer and trying to scroll up, disable
      // scrolling. Likewise, if we're already at the bottom of our Drawer and trying to scroll
      // down, disable scrolling.
      innerContainer.current.addEventListener('touchstart', handleTouchStart);
      innerContainer.current.addEventListener('touchmove', handleTouchMove);
      innerContainer.current.addEventListener('touchend', handleTouchEndOrCancel);
      innerContainer.current.addEventListener('touchcancel', handleTouchEndOrCancel);

      // Tmp variable for cleanup. Otherwise the linter will complain
      // that the `current` value will change. It suggested this tmp
      // variable.
      const innerContainerCurrent = innerContainer.current;

      return () => {
        innerContainerCurrent.removeEventListener('touchstart', handleTouchStart);
        innerContainerCurrent.removeEventListener('touchmove', handleTouchMove);
        innerContainerCurrent.removeEventListener('touchend', handleTouchEndOrCancel);
        innerContainerCurrent.removeEventListener('touchcancel', handleTouchEndOrCancel);
      };
    } else {
      return null;
    }
  }, [innerContainer, dragOffsetY]);

  const outerClassName = classNames('drawer-outer-container', {
    'drawer-outer-container--visible': isVisible,
  });

  const innerStyle = {
    offsetY:
      dragOffsetY ||
      spring(isVisible ? 0 : innerContainerHeight.current || window.innerHeight, {
        stiffness: 300,
      }),
  };

  return (
    <Motion style={innerStyle} onRest={handleAnimationRest}>
      {(style) => {
        const interpolatedStyle = {
          transform: `translateY(${style.offsetY}px)`,
        };

        // For maximized drawers, there's different rules:
        if (maxSize) {
          interpolatedStyle.height = '92%';
          interpolatedStyle.overflow = 'none';
        }

        return (
          <div
            className={outerClassName}
            onMouseDown={handleOuterPressStart}
            onTouchStart={handleOuterPressStart}
            onClick={!!onClose ? handleOuterClick : null}
            data-testid="drawer-outer-container"
          >
            <div
              onClick={handleInnerContainerClick}
              onDragStart={(event) => {
                // ORG Mode para Eli: no arrastrar el texto seleccionado fuera del cuadro (se
                // movería y desaparecería de donde estaba)
                if (/^(TEXTAREA|INPUT)$/.test(event.target.tagName)) event.preventDefault();
              }}
              className="drawer-inner-container nice-scroll"
              data-testid="drawer"
              ref={innerContainer}
              style={interpolatedStyle}
            >
              <div className="drawer__grabber" />

              {shouldIncludeCloseButton && (
                <button className="fas fa-times fa-lg drawer__close-button" onClick={handleClose} />
              )}

              {children}
            </div>
          </div>
        );
      }}
    </Motion>
  );
};
