// 4.43: vista por defecto del proyecto según secuencial/paralelo; tipo de letra también en GTD
import { Map } from 'immutable';
import { parseOrg } from '../parse_org';
import { buildTasks, projectSections, projectViewSequential } from './gtd_model';
import { getFont, setFont, getFontGtd, setFontGtd, applyFont } from '../eli_font';
import { LOCAL_KEYS, isSyncedKey } from '../eli_synced_prefs';

const HEAD = '#+TODO: TODO NEXT WAITING PROJECT | DONE CANCELLED\n';
const BODY = '** NEXT Pintar\n** WAITING Llave\n';
const PAR = `* PROJECT Paralelo\n${BODY}`;
const SEQ = `* PROJECT Secuencial\n:PROPERTIES:\n:ORDERED: t\n:END:\n${BODY}`;
const build = (txt) => buildTasks(Map({ '/a.org': parseOrg(HEAD + txt) }), []);
const get = (tasks, title) => tasks.find((t) => t.title === title);
const sectionIds = (tasks, project, sequential) =>
  projectSections(tasks, project.key, {}, new Date(), { sequential })
    .filter((s) => s.tasks.length)
    .map((s) => s.id);

describe('4.43: vista por defecto del proyecto', () => {
  test('sin :ORDERED: (paralelo) → lista única; con :ORDERED: t → secuencial', () => {
    const tasks = build(PAR + SEQ);
    expect(projectViewSequential(get(tasks, 'Paralelo'))).toBe(false);
    expect(projectViewSequential(get(tasks, 'Secuencial'))).toBe(true);
  });

  test('la elección a mano manda sobre el proyecto', () => {
    const tasks = build(PAR + SEQ);
    expect(projectViewSequential(get(tasks, 'Paralelo'), 'sequential')).toBe(true);
    expect(projectViewSequential(get(tasks, 'Secuencial'), 'none')).toBe(false);
    // un valor raro no cuenta como elección
    expect(projectViewSequential(get(tasks, 'Secuencial'), 'project')).toBe(true);
  });

  test('sin proyecto: lista única', () => {
    expect(projectViewSequential(null)).toBe(false);
    expect(projectViewSequential(undefined, null)).toBe(false);
  });

  test('las secciones cambian con la vista: secuencial mezcla Waiting con Next', () => {
    const tasks = build(PAR);
    const p = get(tasks, 'Paralelo');
    expect(sectionIds(tasks, p, projectViewSequential(p))).toEqual(['next', 'waiting']);
    const s = build(SEQ);
    const q = get(s, 'Secuencial');
    expect(sectionIds(s, q, projectViewSequential(q))).toEqual(['next']);
    // …y al revés, a mano
    expect(sectionIds(s, q, projectViewSequential(q, 'none'))).toEqual(['next', 'waiting']);
  });

  test('el botón ⇉/↓ cambia la vista en el acto (quitando la elección a mano)', () => {
    // al pulsar, el proyecto pasa a :ORDERED: t y no queda ninguna elección a mano
    const antes = get(build(PAR), 'Paralelo');
    const despues = get(build(SEQ.replace('Secuencial', 'Paralelo')), 'Paralelo');
    expect(projectViewSequential(antes, null)).toBe(false);
    expect(projectViewSequential(despues, null)).toBe(true);
  });
});

describe('4.43: tipo de letra también en GTD', () => {
  beforeEach(() => {
    localStorage.clear();
    applyFont();
  });

  test('por defecto apagado: sin atributo en <html>', () => {
    expect(getFontGtd()).toBe(false);
    expect(document.documentElement.hasAttribute('data-eli-font-gtd')).toBe(false);
  });

  test('encendido: se guarda y pone data-eli-font-gtd; apagado lo quita', () => {
    setFontGtd(true);
    expect(getFontGtd()).toBe(true);
    expect(localStorage.getItem('eliFontGtd')).toBe('true');
    expect(document.documentElement.getAttribute('data-eli-font-gtd')).toBe('true');
    setFontGtd(false);
    expect(getFontGtd()).toBe(false);
    expect(document.documentElement.hasAttribute('data-eli-font-gtd')).toBe(false);
  });

  test('cambiar la letra no apaga el interruptor y viceversa', () => {
    setFontGtd(true);
    setFont('mono');
    expect(getFont()).toBe('mono');
    expect(getFontGtd()).toBe(true);
    expect(document.documentElement.getAttribute('data-eli-font')).toBe('mono');
    expect(document.documentElement.getAttribute('data-eli-font-gtd')).toBe('true');
    setFontGtd(false);
    expect(getFont()).toBe('mono');
    expect(document.documentElement.getAttribute('data-eli-font')).toBe('mono');
  });

  test('applyFont() al arrancar lee los dos ajustes guardados', () => {
    localStorage.setItem('eliFont', 'serif');
    localStorage.setItem('eliFontGtd', 'true');
    applyFont();
    expect(document.documentElement.getAttribute('data-eli-font')).toBe('serif');
    expect(document.documentElement.getAttribute('data-eli-font-gtd')).toBe('true');
  });

  test('es un ajuste de este dispositivo: no viaja entre dispositivos', () => {
    expect(LOCAL_KEYS.some((l) => l.key === 'eliFontGtd')).toBe(true);
    expect(isSyncedKey('eliFontGtd')).toBe(false);
    expect(isSyncedKey('eliFont')).toBe(false);
  });
});
