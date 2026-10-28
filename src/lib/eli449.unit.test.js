// 4.49: lote de ajustes (atajos desactivables, historial, FILETAGS, tabla mensual, árbol de
// Referencias, paso «Checklist» de la Revisión semanal)
import { Map as IMap } from 'immutable';

import {
  calculateDocKeybindings,
  calculateGtdKeybindings,
  calculateActionedKeybindings,
  bindingOfAction,
  isBindingOff,
  mayShareKey,
  setLiveKeybindings,
  liveBindingOfAction,
  OFF_PREFIX,
} from './keybindings';
import { matchesBinding } from './eli_hotkeys';
import { setWordCaseBindings } from './eli_word_case';
import { parseOrg } from './parse_org';
import { headingIndex } from './eli_heading_index';
import { monthValuesTableLines, regenerateMonthly } from './eli_monthly';
import { setDayProp, setMonthProp } from './eli_diary';
import {
  buildTasks,
  matchesFilters,
  facetsFor,
  nestProjectRefs,
  projectSections,
} from './gtd/gtd_model';
import { reviewSteps } from './gtd/gtd_review';
import { normalizeGtdSections, findChecklistSection } from './gtd/gtd_sections';
import {
  installNavHistory,
  canGoBack,
  goBack,
  pushView,
  markView,
  setViewRestorer,
} from './eli_nav_history';

describe('4.49 atajos', () => {
  test('historial y salto título ↔ notas: teclas por defecto', () => {
    const c = IMap();
    expect(bindingOfAction(c, 'eliHistoryBack')).toBe('alt+left');
    expect(bindingOfAction(c, 'eliHistoryForward')).toBe('alt+right');
    expect(bindingOfAction(c, 'eliTitleNotesJump')).toBe('tab');
    expect(matchesBinding({ key: 'ArrowLeft', altKey: true }, 'alt+left')).toBe(true);
    expect(matchesBinding({ key: 'Tab' }, 'tab')).toBe(true);
  });

  test('se pueden reasignar', () => {
    const c = IMap({
      'Historial: atrás': 'ctrl+shift+left',
      'Saltar entre el título y las notas (al editar)': 'ctrl+j',
    });
    expect(bindingOfAction(c, 'eliHistoryBack')).toBe('ctrl+shift+left');
    expect(bindingOfAction(c, 'eliTitleNotesJump')).toBe('ctrl+j');
    expect(matchesBinding({ key: 'ArrowLeft', altKey: true }, 'ctrl+shift+left')).toBe(false);
    expect(matchesBinding({ key: 'Tab' }, 'ctrl+j')).toBe(false);
  });

  test('desactivar un atajo: sin tecla efectiva, conserva la asignada y libera la tecla', () => {
    const c = IMap({ [OFF_PREFIX + 'Historial: atrás']: 'true', 'Historial: atrás': 'alt+b' });
    expect(isBindingOff(c, 'Historial: atrás')).toBe(true);
    expect(bindingOfAction(c, 'eliHistoryBack')).toBe('');
    const doc = calculateDocKeybindings(c).find((d) => d.action === 'eliHistoryBack');
    expect(doc.binding).toBe('');
    expect(doc.assigned).toBe('alt+b');
    expect(doc.off).toBe(true);
    // nadie reconoce una tecla vacía
    expect(matchesBinding({ key: 'b', altKey: true }, doc.binding)).toBe(false);
    expect(Object.fromEntries(calculateActionedKeybindings(c)).eliHistoryBack).toBe('');
    // volver a activarlo (valor vacío) recupera la tecla asignada
    const on = c.set(OFF_PREFIX + 'Historial: atrás', '');
    expect(bindingOfAction(on, 'eliHistoryBack')).toBe('alt+b');
  });

  test('vale también para los atajos de la vista GTD y los de los campos de texto', () => {
    const c = IMap({ [OFF_PREFIX + 'GTD: tarea nueva (debajo de la seleccionada)']: 'true' });
    const g = calculateGtdKeybindings(c).find((b) => b.action === 'gtdNew');
    expect(g.binding).toBe('');
    expect(g.assigned).toBe('n');
    expect(g.off).toBe(true);
    expect(calculateGtdKeybindings(IMap()).every((b) => !b.off)).toBe(true);
    // Alt+U desactivado: el atajo de las palabras no reconoce nada
    const w = IMap({
      [OFF_PREFIX + 'Palabra siguiente en MAYÚSCULAS (campos de texto)']: 'true',
    });
    expect(() => setWordCaseBindings(w)).not.toThrow();
    setWordCaseBindings(IMap());
  });

  test('registro vivo (campos de texto y barra)', () => {
    setLiveKeybindings(
      IMap({ [OFF_PREFIX + 'Saltar entre el título y las notas (al editar)']: 'true' })
    );
    expect(liveBindingOfAction('eliTitleNotesJump')).toBe('');
    setLiveKeybindings(null);
    expect(liveBindingOfAction('eliTitleNotesJump')).toBe('tab');
  });

  test('parejas que comparten tecla sin chocar', () => {
    expect(mayShareKey('eliHistoryBack', 'eliListOutdent')).toBe(true);
    expect(mayShareKey('eliListIndent', 'eliHistoryForward')).toBe(true);
    expect(mayShareKey('eliTitleNotesJump', 'toggleHeaderOpened')).toBe(true);
    expect(mayShareKey('eliHistoryBack', 'eliHistoryForward')).toBe(false);
  });
});

describe('4.49 historial: atrás directo', () => {
  test('atrás desde una cabecera reducida restaura la entrada anterior sin paso intermedio', () => {
    const stack = [{ pathname: '/file/a.org', key: undefined }];
    let pos = 0;
    let listener = null;
    let n = 0;
    const h = {
      get location() {
        return stack[pos];
      },
      listen: (f) => {
        listener = f;
      },
      push: (pathname) => {
        stack.splice(pos + 1);
        stack.push({ pathname, key: 'k' + ++n });
        pos++;
        listener(stack[pos], 'PUSH');
      },
      go: (d) => {
        pos += d;
        listener(stack[pos], 'POP');
      },
    };
    installNavHistory(h);
    const restored = [];
    setViewRestorer((v) => restored.push(v));
    markView({ path: '/file/a.org', narrowId: null });
    // seguir un enlace: nueva entrada con la cabecera reducida
    pushView('/file/a.org', { path: '/file/a.org', narrowId: 'H1' });
    expect(canGoBack()).toBe(true);
    goBack(h);
    return new Promise((resolve) =>
      setTimeout(() => {
        // una sola vuelta atrás: la vista de antes (el fichero entero), sin pasar por «widen»
        expect(restored).toEqual([{ path: '/file/a.org', narrowId: null }]);
        resolve();
      }, 10)
    );
  });
});

describe('4.49 #+FILETAGS: para todo el documento', () => {
  const text = '#+FILETAGS: :wiki:guia:\n* Uno\n** Dos :x:\n* Tres\n';
  const files = IMap({ '/wiki/a.org': parseOrg(text), '/b.org': parseOrg('* Cuatro :y:\n') });

  test('el índice de cabeceras: todas las del fichero heredan las etiquetas', () => {
    const idx = headingIndex(files);
    const by = (t) => idx.find((e) => e.title === t);
    expect(by('Uno').tags).toEqual(['wiki', 'guia']);
    expect(by('Dos').tags).toEqual(['wiki', 'guia', 'x']);
    expect(by('Dos').ownTags).toEqual(['x']);
    expect(by('Tres').tags).toEqual(['wiki', 'guia']);
    // un fichero sin FILETAGS no cambia
    expect(by('Cuatro').tags).toEqual(['y']);
  });

  test('GTD: cuentan en los filtros y en la lista de etiquetas, pero no cambian la lista', () => {
    const tasks = buildTasks(
      IMap({ '/wiki/a.org': parseOrg('#+FILETAGS: :wiki:\n* TODO Tarea :propia:\n') }),
      []
    );
    const t = tasks.find((x) => x.title === 'Tarea');
    expect(t.fileTags).toEqual(['wiki']);
    expect(t.tags).toEqual(['propia']);
    expect(matchesFilters(t, { tags: ['wiki'] })).toBe(true);
    expect(matchesFilters(t, { tags: ['wiki'], ownTagsOnly: true })).toBe(false);
    expect(matchesFilters(t, { tags: ['wiki'], noInherited: true })).toBe(false);
    const f = facetsFor([t]);
    expect(f.tags).toContain('wiki');
    expect(f.hasInherited).toBe(true);
    expect(facetsFor([t], { ownOnly: true }).tags).not.toContain('wiki');
  });
});

describe('4.49 recuento mensual en tabla', () => {
  const mc = [{ key: 'CINTURA', name: 'Cintura', type: 'num', freq: 'month' }];

  test('tabla `| Cintura | 100 |` con cabecera y columnas alineadas', () => {
    const lines = monthValuesTableLines(mc, ['100']);
    expect(lines).toEqual(['| Dato    | Valor |', '|---------+-------|', '| Cintura |   100 |']);
    // sin valores, no hay tabla
    expect(monthValuesTableLines(mc, [''])).toEqual([]);
    expect(monthValuesTableLines(mc, [])).toEqual([]);
  });

  test('varios datos, acentos; solo los que tienen valor', () => {
    const many = [
      { key: 'CINTURA', name: 'Cintura', type: 'num', freq: 'month' },
      { key: 'PESO', name: 'Peso', type: 'num', freq: 'month' },
      { key: 'ANIMO', name: 'Ánimo', type: 'note', freq: 'month' },
    ];
    const lines = monthValuesTableLines(many, ['82', '', 'bueno']);
    expect(lines.join('\n')).toContain('Cintura');
    expect(lines.join('\n')).toContain('Ánimo');
    expect(lines.join('\n')).not.toContain('Peso');
  });

  test('el mensual la escribe y es idempotente (no duplica)', () => {
    let t = '* 2026-10 octubre\n';
    t = setDayProp(t, new Date(2026, 9, 3), 'B', 'X', []);
    t = setMonthProp(t, new Date(2026, 9, 25), 'CINTURA', '100');
    const C = [
      { key: 'B', name: 'B', type: 'bool' },
      { key: 'CINTURA', name: 'Cintura', type: 'num', freq: 'month' },
    ];
    const once = regenerateMonthly('', 2026, t, C);
    expect(once).toMatch(/# BEGIN mensual 2026-10\n\| Dato +\| Valor \|\n/);
    expect(once).toMatch(/\| Cintura \| +100 \|/);
    expect(once).not.toMatch(/Cintura: 100/);
    const twice = regenerateMonthly(once, 2026, t, C);
    expect(twice).toBe(once);
  });
});

describe('4.49 Referencias de un proyecto como árbol', () => {
  const HEAD = '#+TODO: TODO NEXT WAITING MAYBE PROJECT | DONE CANCELLED\n';
  const text = `${HEAD}* PROJECT Casa\n** Presupuestos\nNotas\n*** Oferta A\n**** Detalle\n*** Oferta B\n** Planos\n** NEXT Comprar\n`;
  const tasks = buildTasks(IMap({ '/tasks.org': parseOrg(text) }), []);
  const project = tasks.find((t) => t.title === 'Casa');
  const refs = projectSections(tasks, project.key, {}, new Date(2026, 9, 28)).find(
    (s) => s.id === 'refs'
  ).tasks;

  test('cada referencia cuelga de su madre más cercana de la lista, con profundidad y nº de hijas', () => {
    const out = nestProjectRefs(tasks, refs);
    expect(out.map((n) => [n.task.title, n.depth, n.kidCount])).toEqual([
      ['Presupuestos', 0, 2],
      ['Oferta A', 1, 1],
      ['Detalle', 2, 0],
      ['Oferta B', 1, 0],
      ['Planos', 0, 0],
    ]);
    expect(out[0].hasKids).toBe(true);
    expect(out[4].hasKids).toBe(false);
  });

  test('una referencia cuya madre inmediata no sale, cuelga de la siguiente que sí', () => {
    const sub = refs.filter((t) => t.title !== 'Oferta A');
    const out = nestProjectRefs(tasks, sub);
    const detalle = out.find((n) => n.task.title === 'Detalle');
    expect(detalle.depth).toBe(1); // «Presupuestos» › «Detalle»
  });

  test('sin referencias, nada', () => {
    expect(nestProjectRefs(tasks, [])).toEqual([]);
  });
});

describe('4.49 Revisión semanal: «Checklists relevantes» abre la sección Checklist', () => {
  test('el paso lleva destino «checklist» (también en Allen estricto)', () => {
    [true, false].forEach((strict) => {
      const step = reviewSteps(strict).find((s) => s.id === 'checklists');
      if (step) expect(step.view).toBe('checklist');
    });
    expect(reviewSteps(true).find((s) => s.id === 'checklists').view).toBe('checklist');
  });

  test('se encuentra la sección propia llamada Checklist(s), sin mirar mayúsculas ni acentos', () => {
    const cfg = normalizeGtdSections({
      custom: [
        { id: 'c_uno', label: 'Viajes' },
        { id: 'c_dos', label: 'Checklists' },
      ],
    });
    expect(findChecklistSection(cfg)).toBe('c_dos');
    const cfg2 = normalizeGtdSections({ custom: [{ id: 'c_x', label: ' CHECKLIST ' }] });
    expect(findChecklistSection(cfg2)).toBe('c_x');
    expect(findChecklistSection(normalizeGtdSections(null))).toBeNull();
  });
});
