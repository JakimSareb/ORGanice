// 4.48: Personas y Agendas (modelo puro)
import { Map } from 'immutable';
import { parseOrg } from '../parse_org';
import { buildTasks, matchesFilters, facetsFor } from './gtd_model';
import {
  personsOf,
  parsePersonLinks,
  personLinksValue,
  parseContacts,
  contactNamed,
  personCard,
} from './gtd_persons';
import { parseAgendas, addPointToBody, toggleBodyCheckbox, openCount } from './gtd_agendas';
import { headingIndex, backlinkEntries } from '../eli_heading_index';
import { waitingByPerson, projectPlan } from './gtd_guided';

const HEAD = '#+TODO: TODO NEXT WAITING MAYBE PROJECT | DONE CANCELLED\n';
const TODAY = new Date(2026, 9, 28);
const ANA = 'AAAA-1';
const LUIS = 'BBBB-2';
const PERSONAS = [
  '* Ana López',
  ':PROPERTIES:',
  `:ID: ${ANA}`,
  ':EMAIL: ana@example.com',
  ':ALIAS: Anita',
  ':END:',
  '* Luis',
  ':PROPERTIES:',
  `:ID: ${LUIS}`,
  ':END:',
  '* Mari Carmen',
  ':PROPERTIES:',
  ':ID: CCCC-3',
  ':END:',
].join('\n');
const TASKS = [
  '* WAITING Contrato',
  ':PROPERTIES:',
  `:PERSONA: [[id:${ANA}][Ana López]]`,
  ':END:',
  '* NEXT Llamar',
  ':PROPERTIES:',
  `:PERSONA: [[id:${ANA}][Ana López]] [[id:${LUIS}][Luis]]`,
  ':END:',
  '* WAITING Paquete',
  '* Reunión del lunes',
  ':PROPERTIES:',
  `:PERSONA: [[id:${LUIS}][Luis]]`,
  ':END:',
  'Acta: hablamos de todo.',
  '* Nota suelta',
  `Hoy he visto a [[id:${ANA}][Ana]].`,
].join('\n');
const files = () =>
  Map({ '/tasks.org': parseOrg(HEAD + TASKS), '/personas.org': parseOrg(PERSONAS) });

describe('4.48 A: personas en las cabeceras (:PERSONA:)', () => {
  const tasks = buildTasks(Map({ '/tasks.org': parseOrg(HEAD + TASKS) }), []);
  const by = (t) => tasks.find((x) => x.title === t);
  test('personsOf: una o varias personas, en tareas y cabeceras sin estado', () => {
    const f = parseOrg(HEAD + TASKS);
    const hs = f.get('headers');
    expect(personsOf(hs.get(0))).toEqual([ANA]);
    expect(personsOf(hs.get(1))).toEqual([ANA, LUIS]);
    expect(personsOf(hs.get(2))).toEqual([]);
    expect(personsOf(hs.get(3))).toEqual([LUIS]);
    expect(by('Llamar').persons).toEqual([ANA, LUIS]);
    expect(by('Reunión del lunes').persons).toEqual([LUIS]);
  });
  test('valor de :PERSONA: (ida y vuelta)', () => {
    const links = parsePersonLinks(`[[id:${ANA}][Ana López]] [[id:${LUIS}]]`);
    expect(links).toEqual([
      { id: ANA, title: 'Ana López' },
      { id: LUIS, title: '' },
    ]);
    expect(personLinksValue([{ id: ANA, title: 'Ana' }])).toBe(`[[id:${ANA}][Ana]]`);
    expect(personLinksValue([])).toBe('');
  });
  test('filtro por persona y personas de la barra', () => {
    const open = tasks.filter((t) => t.keyword);
    expect(open.filter((t) => matchesFilters(t, { person: LUIS })).map((t) => t.title)).toEqual([
      'Llamar',
    ]);
    expect(open.filter((t) => matchesFilters(t, { person: ANA })).length).toBe(2);
    expect(facetsFor(open).persons.map((p) => p.name)).toEqual(['Ana López', 'Luis']);
  });
  test('Waiting agrupado por persona (sin persona al final); ya no por etiquetas', () => {
    const t2 = buildTasks(
      Map({ '/t.org': parseOrg(HEAD + TASKS + '\n* WAITING Llaves :Pepe:\n') }),
      []
    );
    const g = waitingByPerson(t2, TODAY, ['inbox']);
    expect(g.map((x) => x.person)).toEqual(['Ana López', null]);
    expect(g[1].items.map((t) => t.title).sort()).toEqual(['Llaves', 'Paquete']);
  });
  test('planificar: «Quién» = contacto → Waiting con :PERSONA:, sin etiqueta', () => {
    const out = projectPlan({
      name: 'P',
      ideas: ['A'],
      first: 'A',
      firstWho: { id: ANA, title: 'Ana López' },
      nexts: {},
    });
    expect(out.tasks[0]).toMatchObject({
      title: 'A',
      list: 'waiting',
      props: { PERSONA: `[[id:${ANA}][Ana López]]` },
    });
    expect(out.tasks[0].tags).toBeUndefined();
  });
});

describe('4.48 A: contactos y ficha', () => {
  const contacts = parseContacts(files().get('/personas.org'), '/personas.org');
  test('contactos de personas.org (con email y alias)', () => {
    expect(contacts.map((c) => c.name)).toEqual(['Ana López', 'Luis', 'Mari Carmen']);
    expect(contacts[0]).toMatchObject({ orgId: ANA, email: 'ana@example.com' });
    expect(contactNamed(contacts, 'anita').name).toBe('Ana López');
    expect(contactNamed(contacts, 'ana lopez').name).toBe('Ana López');
    expect(contactNamed(contacts, 'Nadie')).toBe(null);
  });
  test('ficha: tareas por lista, actas y menciones', () => {
    const index = headingIndex(files());
    const ana = personCard(index, ANA, backlinkEntries(index, ANA));
    expect(ana.tasks.map((g) => [g.id, g.items.map((e) => e.title)])).toEqual([
      ['waiting', ['Contrato']],
      ['next', ['Llamar']],
    ]);
    expect(ana.notes).toEqual([]);
    expect(ana.mentions.map((e) => e.title)).toEqual(['Nota suelta']);
    const luis = personCard(index, LUIS, backlinkEntries(index, LUIS));
    expect(luis.notes.map((e) => e.title)).toEqual(['Reunión del lunes']);
    expect(luis.mentions).toEqual([]);
  });
});

// Fichero real del usuario (28-oct), resumido
const AGENDAS = [
  '* Mari Carmen',
  '+ DIA 0 Primera sesión',
  'Hablamos de cómo empezar.',
  '+ DIA 1 Segunda',
  '* Quan siguem a ...',
  "** ... Barcelona veure'ns mb",
  '- [ ] Xus',
  '- [X] Dani Trillo',
  '- [ ] Marta',
  '',
  '** ... Lleida 🧽 Limipar',
  '- Fregar',
  '- Comprar lleixiu',
  '* Luis',
  '* Altres',
  'Text lliure sense llista.',
].join('\n');

describe('4.48 B: agendas', () => {
  const contacts = parseContacts(files().get('/personas.org'), '/personas.org');
  const ag = parseAgendas(parseOrg(AGENDAS), contacts, '/agendas.org');
  test('persona vs lugar (4.50: el nivel 1 es la agenda, lo de debajo son puntos) y casillas', () => {
    expect(ag.persons.map((a) => a.person.name)).toEqual(['Mari Carmen', 'Luis']);
    expect(ag.places.map((a) => a.title)).toEqual(['Quan siguem a ...', 'Altres']);
    const quan = ag.places[0];
    expect(quan.children.map((c) => c.title)).toEqual([
      "... Barcelona veure'ns mb",
      '... Lleida 🧽 Limipar',
    ]);
    // las casillas viejas de las notas de un punto se cuentan en el subárbol
    expect(quan.children[0].open).toBe(2);
    expect(quan.open).toBe(4);
    expect(quan.points).toBe(2);
  });
  test('añadir punto: casillas → «- [ ]», tras el último ítem y antes de la línea en blanco', () => {
    const body = '- [ ] Xus\n- [X] Dani Trillo\n- [ ] Marta\n\n';
    expect(addPointToBody(body, 'Pere')).toBe(
      '- [ ] Xus\n- [X] Dani Trillo\n- [ ] Marta\n- [ ] Pere\n\n'
    );
  });
  test('añadir punto: sin casillas → «- texto»; con «+» → «+ texto» (tras sus párrafos)', () => {
    expect(addPointToBody('- Fregar\n- Comprar lleixiu', 'Escombrar')).toBe(
      '- Fregar\n- Comprar lleixiu\n- Escombrar'
    );
    expect(addPointToBody('+ DIA 0\nHablamos.\n+ DIA 1\n  detalle\n\nFinal', 'DIA 2')).toBe(
      '+ DIA 0\nHablamos.\n+ DIA 1\n  detalle\n+ DIA 2\n\nFinal'
    );
  });
  test('añadir punto: con sangría, sin lista y vacío', () => {
    expect(addPointToBody('  - [ ] uno\n  - [ ] dos\n', 'tres')).toBe(
      '  - [ ] uno\n  - [ ] dos\n  - [ ] tres\n'
    );
    expect(addPointToBody('Texto libre.\n\n', 'algo')).toBe('Texto libre.\n- [ ] algo\n\n');
    expect(addPointToBody('', 'algo')).toBe('- [ ] algo');
  });
  test('el resto del texto no cambia ni un byte', () => {
    const body = '- [ ] Xus  \n- [x] Dani\tTrillo\n- [ ] Marta 🧽\n\n  nota final  ';
    const out = addPointToBody(body, 'Nou');
    const lines = out.split('\n');
    expect(lines.filter((l) => l !== '- [ ] Nou').join('\n')).toBe(body);
  });
  test('marcar solo cambia «[ ]» ⇄ «[X]» en esa línea', () => {
    const body = '- [ ] Xus\n- [X] Dani\n';
    expect(toggleBodyCheckbox(body, 0)).toBe('- [X] Xus\n- [X] Dani\n');
    expect(toggleBodyCheckbox(body, 1)).toBe('- [ ] Xus\n- [ ] Dani\n');
    expect(openCount(body)).toBe(1);
  });
});
