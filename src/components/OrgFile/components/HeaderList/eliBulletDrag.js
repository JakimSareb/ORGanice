// ORG Mode para Eli (4.04): arrastrar una cabecera por su VIÑETA (asterisco / punto), siempre con
// sus subcabeceras (que se esconden mientras se arrastra). Una línea marca dónde cae.
//   Ratón: pulsar la viñeta y mover. Dedo: mantenerla ~0,5 s (se «levanta») y arrastrar.
//   Moverse a la derecha / izquierda durante el arrastre cambia el nivel (hija de la de arriba /
//   un nivel menos). Cerca de los bordes de arriba y abajo, la página se desplaza sola.
// Mantener pulsado el TEXTO sigue siendo «narrow» (no se toca aquí).
import { edgeDir, visibleSpan } from '../../../Gtd/useRowDrag';

const HOLD_MS = 500;
const MOUSE_SLOP = 6;
const TOUCH_SLOP = 10;
const INDENT = 20; // px por nivel (como el sangrado de Header)
const SPEED = 14;
const EDGE = 70;

let lastDropAt = 0;
// el clic que llega al soltar no debe plegar/desplegar la viñeta
export const justDragged = () => Date.now() - lastDropAt < 450;

const scroller = () => {
  const app = document.querySelector('.App');
  if (app && app.scrollHeight > app.clientHeight + 1) {
    const st = window.getComputedStyle(app);
    if (/(auto|scroll)/.test(st.overflowY)) return app;
  }
  return document.scrollingElement || document.documentElement;
};

const esc = (s) => (window.CSS && window.CSS.escape ? window.CSS.escape(s) : s);

const vib = () => {
  try {
    if (navigator.vibrate) navigator.vibrate(15);
  } catch (e) {}
};

// Filas que se ven (sin la arrastrada ni sus subcabeceras), en orden
const visibleRows = (hidden) =>
  Array.from(document.querySelectorAll('.header-list-container .header[data-header-id]'))
    .filter((el) => !hidden.has(el.getAttribute('data-header-id')))
    .map((el) => ({ id: el.getAttribute('data-header-id'), el }));

/**
 * Empieza (o prepara) el arrastre desde la viñeta.
 * opts: { headerId, event, headers (List), narrowedHeaderId, onDrop(headerId, {beforeId,
 *   afterId, level}) }
 */
export const startBulletDrag = ({ headerId, event, headers, narrowedHeaderId, onDrop }) => {
  if (!event || (event.button !== undefined && event.button !== 0 && event.pointerType === 'mouse'))
    return;
  if (headerId === narrowedHeaderId) return;
  const idx = headers.findIndex((h) => String(h.get('id')) === String(headerId));
  if (idx < 0) return;
  const srcId = headers.get(idx).get('id');
  const srcLevel = headers.get(idx).get('nestingLevel');
  const levelOf = new Map();
  const realId = new Map();
  headers.forEach((h) => {
    levelOf.set(String(h.get('id')), h.get('nestingLevel'));
    realId.set(String(h.get('id')), h.get('id'));
  });
  // la arrastrada y sus subcabeceras
  const hidden = new Set([String(srcId)]);
  for (let i = idx + 1; i < headers.size; i++) {
    if (headers.get(i).get('nestingLevel') <= srcLevel) break;
    hidden.add(String(headers.get(i).get('id')));
  }
  let narrowLevel = 0;
  if (narrowedHeaderId) {
    const n = headers.find((h) => h.get('id') === narrowedHeaderId);
    if (n) narrowLevel = n.get('nestingLevel');
  }

  const touch = event.pointerType && event.pointerType !== 'mouse';
  const x0 = event.clientX;
  const y0 = event.clientY;
  const pointerId = event.pointerId;
  const bullet = event.currentTarget;
  let x = x0;
  let y = y0;
  let lifted = false;
  let holdTimer = null;
  let raf = null;
  let ghost = null;
  let line = null;
  let slot = null; // { beforeId, afterId, level, noop }
  const srcEl = document.querySelector(`.header[data-header-id="${esc(String(srcId))}"]`);
  const hiddenEls = [];

  // el hueco donde caería: entre dos filas que se ven, con el nivel según el desplazamiento
  const computeSlot = () => {
    const rows = visibleRows(hidden);
    let k = rows.length;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].el.getBoundingClientRect();
      if (y < r.top + r.height / 2) {
        k = i;
        break;
      }
    }
    // narrow: no se puede salir de la cabecera reducida
    if (narrowLevel && k === 0) k = 1;
    const prev = rows[k - 1];
    const next = rows[k];
    const maxL = prev ? levelOf.get(prev.id) + 1 : 1;
    let minL = Math.max(1, next ? levelOf.get(next.id) : 1, narrowLevel ? narrowLevel + 1 : 1);
    if (minL > maxL) minL = maxL;
    const want = srcLevel + Math.round((x - x0) / INDENT);
    const level = Math.max(minL, Math.min(maxL, want));
    // ¿se queda donde estaba?
    const origRows = Array.from(
      document.querySelectorAll('.header-list-container .header[data-header-id]')
    ).map((el) => el.getAttribute('data-header-id'));
    const at = origRows.indexOf(String(srcId));
    const origPrev = origRows
      .slice(0, at)
      .reverse()
      .find((id) => !hidden.has(id));
    const origNext = origRows.slice(at + 1).find((id) => !hidden.has(id));
    const noop =
      level === srcLevel &&
      (prev ? prev.id : undefined) === origPrev &&
      (next ? next.id : undefined) === origNext;
    let lineY;
    if (next) lineY = next.el.getBoundingClientRect().top;
    else if (prev) lineY = prev.el.getBoundingClientRect().bottom;
    else lineY = y;
    return {
      beforeId: next ? realId.get(next.id) : null,
      afterId: !next && prev ? realId.get(prev.id) : null,
      level,
      noop,
      lineY,
    };
  };

  const paint = () => {
    slot = computeSlot();
    if (ghost) {
      ghost.style.transform = `translate(${x - x0}px, ${y - y0}px)`;
    }
    if (line && srcEl) {
      const r = srcEl.getBoundingClientRect();
      const pad = parseFloat(srcEl.style.paddingLeft || 0) || 0;
      const left = r.left + pad + (slot.level - srcLevel) * INDENT - 16;
      line.style.top = `${Math.round(slot.lineY) - 1}px`;
      line.style.left = `${Math.max(4, Math.round(left))}px`;
      line.style.right = '8px';
      line.setAttribute('data-level', String(slot.level));
    }
  };

  const loop = () => {
    if (!lifted) return;
    const sc = scroller();
    const vh = window.innerHeight || 0;
    const span = visibleSpan(
      sc === document.scrollingElement || sc === document.documentElement
        ? { top: 0, bottom: vh }
        : sc.getBoundingClientRect(),
      vh
    );
    const dir = edgeDir(y, span, touch ? EDGE + 20 : EDGE);
    if (dir) {
      sc.scrollTop += dir * SPEED;
      paint();
    }
    raf = requestAnimationFrame(loop);
  };

  const lift = () => {
    lifted = true;
    vib();
    document.body.classList.add('eli-hdrag-on');
    if (srcEl) {
      srcEl.classList.add('eli-hdrag-src');
      // las subcabeceras se esconden mientras se arrastra
      hidden.forEach((id) => {
        if (id === String(srcId)) return;
        const el = document.querySelector(`.header[data-header-id="${esc(id)}"]`);
        if (el) {
          hiddenEls.push([el, el.style.display]);
          el.style.display = 'none';
        }
      });
      const r = srcEl.getBoundingClientRect();
      ghost = document.createElement('div');
      ghost.className = 'eli-hdrag-ghost';
      const title = srcEl.querySelector('.title-line');
      ghost.textContent = title ? title.textContent : '';
      if (hidden.size > 1) {
        const n = document.createElement('span');
        n.className = 'eli-hdrag-ghost__count';
        n.textContent = ` +${hidden.size - 1}`;
        ghost.appendChild(n);
      }
      ghost.style.top = `${r.top}px`;
      ghost.style.left = `${r.left + parseFloat(srcEl.style.paddingLeft || 0)}px`;
      ghost.style.width = `${Math.max(120, r.width - parseFloat(srcEl.style.paddingLeft || 0))}px`;
      document.body.appendChild(ghost);
    }
    line = document.createElement('div');
    line.className = 'eli-hdrag-line';
    line.setAttribute('data-testid', 'eli-hdrag-line');
    document.body.appendChild(line);
    paint();
    raf = requestAnimationFrame(loop);
  };

  const cleanup = () => {
    clearTimeout(holdTimer);
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('pointerup', onUp, true);
    window.removeEventListener('pointercancel', onCancel, true);
    window.removeEventListener('touchmove', onTouchMove, { capture: true });
    window.removeEventListener('keydown', onKey, true);
    try {
      if (bullet && bullet.releasePointerCapture) bullet.releasePointerCapture(pointerId);
    } catch (e) {}
    document.body.classList.remove('eli-hdrag-on');
    if (srcEl) srcEl.classList.remove('eli-hdrag-src');
    hiddenEls.forEach(([el, d]) => (el.style.display = d));
    if (ghost) ghost.remove();
    if (line) line.remove();
  };

  function onMove(e) {
    if (e.pointerId !== pointerId) return;
    x = e.clientX;
    y = e.clientY;
    const dist = Math.hypot(x - x0, y - y0);
    if (!lifted) {
      if (touch) {
        // el dedo se movió antes de tiempo: no es un arrastre
        if (dist > TOUCH_SLOP) cleanup();
        return;
      }
      if (dist > MOUSE_SLOP) lift();
      else return;
    }
    if (e.cancelable) e.preventDefault();
    paint();
  }
  // iOS: mientras se arrastra con el dedo, la página no se desplaza
  function onTouchMove(e) {
    if (lifted && e.cancelable) e.preventDefault();
  }
  function onUp(e) {
    if (e.pointerId !== pointerId) return;
    const was = lifted;
    if (was) {
      x = e.clientX;
      y = e.clientY;
      slot = computeSlot();
    }
    const s = slot;
    cleanup();
    if (!was) return;
    lastDropAt = Date.now();
    if (s && !s.noop) onDrop(srcId, { beforeId: s.beforeId, afterId: s.afterId, level: s.level });
  }
  function onCancel(e) {
    if (e.pointerId !== pointerId) return;
    if (lifted) lastDropAt = Date.now();
    cleanup();
  }
  function onKey(e) {
    if (e.key === 'Escape' && lifted) {
      e.preventDefault();
      e.stopPropagation();
      lastDropAt = Date.now();
      cleanup();
    }
  }

  try {
    if (bullet && bullet.setPointerCapture) bullet.setPointerCapture(pointerId);
  } catch (e) {}
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerup', onUp, true);
  window.addEventListener('pointercancel', onCancel, true);
  window.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
  window.addEventListener('keydown', onKey, true);
  if (touch) holdTimer = setTimeout(lift, HOLD_MS);
};
