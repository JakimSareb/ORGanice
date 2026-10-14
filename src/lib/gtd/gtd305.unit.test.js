// ORG Mode para Eli (3.05): proyectos secuenciales con en espera / programadas, «Sin etiquetas»,
// tiempo que lleva vencida, separadores del menú lateral y adjuntos de org-attach.
import { Map, List } from 'immutable';
import { parseOrg } from '../parse_org';
import { setGtdConfig, normalizeGtdSections, isSepId } from './gtd_sections';
import {
  buildTasks,
  tasksForView,
  projectSections,
  firstPerProject,
  matchesFilters,
  facetsFor,
  overdueAgo,
  dueInfo,
  NO_TAGS,
  projectSectionOfSeq,
} from './gtd_model';
import { orgAttachDir, linkTargetFor, orgAttachDirPath } from '../eli_org_attach';
import { notesLinesOf } from '../../components/Gtd';

const HEAD = '#+TODO: TODO NEXT WAITING MAYBE PROJECT | DONE CANCELLED\n';
const TODAY = new Date(2026, 9, 14);
const A = '/a.org';
const tasksFrom = (text) => buildTasks(Map([[A, parseOrg(HEAD + text)]]), []);
const titles = (list) => list.map((t) => t.title);

beforeAll(() => setGtdConfig(null));

describe('3.05: proyecto secuencial con en espera y programadas', () => {
  const text =
    '* PROJECT Casa\n' +
    '** NEXT Pintar\n' +
    '** WAITING Presupuesto\n' +
    '** NEXT Lijar\n' +
    '* PROJECT Coche\n' +
    '** WAITING Pieza\n' +
    '** NEXT Montar\n' +
    '* PROJECT Viaje\n' +
    '** TODO Billetes\n' +
    '   SCHEDULED: <2026-11-01 Sun>\n' +
    '** NEXT Maleta\n';
  const tasks = tasksFrom(text);

  test('en la lista del proyecto van mezcladas con las Next (secuencial)', () => {
    const casa = tasks.find((t) => t.title === 'Casa');
    const secs = projectSections(tasks, casa.key, {}, TODAY, { sequential: true });
    expect(titles(secs.find((s) => s.id === 'next').tasks)).toEqual([
      'Pintar',
      'Presupuesto',
      'Lijar',
    ]);
    expect(secs.find((s) => s.id === 'waiting').tasks).toEqual([]);
    // sin el modo secuencial, como siempre
    const plain = projectSections(tasks, casa.key, {}, TODAY);
    expect(titles(plain.find((s) => s.id === 'waiting').tasks)).toEqual(['Presupuesto']);
    const viaje = tasks.find((t) => t.title === 'Viaje');
    const vs = projectSections(tasks, viaje.key, {}, TODAY, { sequential: true });
    expect(titles(vs.find((s) => s.id === 'next').tasks)).toEqual(['Billetes', 'Maleta']);
    const billetes = tasks.find((t) => t.title === 'Billetes');
    expect(projectSectionOfSeq(billetes, TODAY, true)).toBe('next');
    expect(projectSectionOfSeq(billetes, TODAY, false)).toBe('scheduled');
  });

  test('en Next general, una en espera / programada antes bloquea las siguientes', () => {
    const next = tasksForView(tasks, { id: 'next' }, {}, TODAY);
    expect(titles(firstPerProject(next))).toEqual(['Pintar', 'Montar', 'Maleta']);
    expect(titles(firstPerProject(next, tasks, TODAY))).toEqual(['Pintar']);
  });
});

describe('3.05: filtro «Sin etiquetas»', () => {
  const tasks = tasksFrom('* NEXT Una :casa:\n* NEXT Dos\n* NEXT Tres :sleep:\n');
  test('solo esas, o tachada', () => {
    const only = tasks.filter((t) => matchesFilters(t, { tags: [NO_TAGS] }));
    expect(titles(only)).toEqual(['Dos', 'Tres']);
    const not = tasks.filter((t) => matchesFilters(t, { notTags: [NO_TAGS] }));
    expect(titles(not)).toEqual(['Una']);
    expect(facetsFor(tasks).hasUntagged).toBe(true);
  });
});

describe('3.05: cuánto lleva vencida', () => {
  test('días, semanas, meses y años', () => {
    expect(overdueAgo(3)).toBe('3 d');
    expect(overdueAgo(13)).toBe('13 d');
    expect(overdueAgo(15)).toBe('2 sem');
    expect(overdueAgo(45)).toBe('6 sem');
    expect(overdueAgo(70)).toBe('2 meses');
    expect(overdueAgo(400)).toBe('1 año');
    expect(dueInfo(new Date(2026, 9, 11), TODAY)).toMatchObject({
      text: 'Atrasada',
      ago: '3 d',
    });
    expect(dueInfo(new Date(2026, 9, 14), TODAY).ago).toBeUndefined();
  });
});

describe('3.05: separadores del menú lateral', () => {
  test('se guardan en el orden y sin nombre son una línea', () => {
    const cfg = normalizeGtdSections({
      order: ['agenda', 's_a', 'focus', 's_b', 'inbox'],
      separators: [
        { id: 's_a', label: '' },
        { id: 's_b', label: ' Listas ' },
        { id: 'x_bad', label: 'no' },
      ],
    });
    expect(cfg.order.slice(0, 5)).toEqual(['agenda', 's_a', 'focus', 's_b', 'inbox']);
    expect(cfg.separators).toEqual([
      { id: 's_a', label: '' },
      { id: 's_b', label: 'Listas' },
    ]);
    expect(isSepId('s_a')).toBe(true);
    expect(cfg.sections.s_a).toBeUndefined();
    // un separador sin guardar en el orden va al final
    const cfg2 = normalizeGtdSections({ separators: [{ id: 's_c', label: '' }] });
    expect(cfg2.order[cfg2.order.length - 1]).toBe('s_c');
  });
});

describe('3.05: adjuntos de org-attach', () => {
  const file = parseOrg(
    HEAD +
      '* TODO Con id :ATTACH:\n:PROPERTIES:\n:ID: 3f2a9c1e-0000\n:END:\n[[attachment:foto.png]]\n' +
      '* TODO Con dir\n:PROPERTIES:\n:DIR: adjuntos/x\n:END:\n' +
      '* TODO Sin nada\n'
  );
  const [withId, withDir, none] = file.get('headers').toArray();
  test('carpeta y enlaces attachment:', () => {
    expect(orgAttachDir(withId)).toBe('data/3f/2a9c1e-0000');
    expect(orgAttachDir(withDir)).toBe('adjuntos/x');
    expect(orgAttachDir(none)).toBe(null);
    expect(linkTargetFor('attachment:foto.png', withId)).toBe('data/3f/2a9c1e-0000/foto.png');
    expect(linkTargetFor('file:assets/2026/a.pdf', none)).toBe('assets/2026/a.pdf');
    expect(linkTargetFor('https://x.y', none)).toBe(null);
    expect(orgAttachDirPath(withId, '/Notas/a.org')).toBe('/Notas/data/3f/2a9c1e-0000');
    expect(orgAttachDirPath(none, '/Notas/a.org')).toBe(null);
  });
  test('notas de la fila: el enlace sale como vista previa', () => {
    const lines = notesLinesOf(
      'Mira esto:\n[[attachment:foto.png][La foto]]\n[[https://a.b][web]]',
      (u) => linkTargetFor(u, withId)
    );
    expect(lines[1]).toEqual({
      index: 1,
      text: '',
      media: [{ target: 'data/3f/2a9c1e-0000/foto.png', label: 'La foto' }],
    });
    expect(lines[2]).toEqual({ index: 2, text: 'web' });
    // sin resolutor, como antes
    expect(notesLinesOf('[[file:a/b.png][B]]')[0]).toEqual({ index: 0, text: 'B' });
  });
});
