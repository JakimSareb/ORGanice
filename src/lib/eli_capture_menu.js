// ORG Mode para Eli: elegir plantilla de captura con su letra (o tocándola). Promise<template|null>
export const chooseCaptureTemplate = (templates) =>
  new Promise((resolve) => {
    const list = (templates && templates.toArray ? templates.toArray() : templates) || [];
    if (!list.length) {
      resolve(null);
      return;
    }
    const overlay = document.createElement('div');
    overlay.className = 'eli-prompt__overlay';
    overlay.innerHTML = `
      <div class="eli-prompt__box" role="dialog" data-testid="eli-capture-menu">
        <div class="eli-prompt__title"><i class="fas fa-plus"></i> Capturar</div>
        <div class="eli-capture-menu"></div>
        <div class="eli-prompt__message" style="font-size: 0.85em">Pulsa la letra de la plantilla (Esc para cancelar).</div>
      </div>`;
    const box = overlay.querySelector('.eli-capture-menu');
    const done = (value) => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(value);
    };
    list.forEach((t) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn eli-capture-menu__item';
      const letter = document.createElement('span');
      letter.className = 'eli-capture-menu__letter';
      letter.textContent = t.get('letter') || '·';
      b.append(letter, ` ${t.get('description') || ''}`);
      b.addEventListener('click', () => done(t));
      box.appendChild(b);
    });
    const onKey = (e) => {
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') return done(null);
      const t = list.find((x) => (x.get('letter') || '').toLowerCase() === e.key.toLowerCase());
      if (t) done(t);
    };
    overlay.addEventListener('click', (e) => e.target === overlay && done(null));
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
  });
