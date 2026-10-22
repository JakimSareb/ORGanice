// ORG Mode para Eli (4.06): procesos guiados puntuales y periódicos de GTD (Menú ☰ › Procesos):
// «Volcado mental», «Planificar un proyecto nuevo», «Aclarar un proyecto atascado», «Repaso de
// Waiting» y «Repaso de Someday/Maybe». Modelo puro; la tarjeta es Gtd/GtdGuidedProcess.
import { listOf, projectsOf, projectState, projectSectionOf, inProject } from './gtd_model';

// Lista de disparadores: (4.14) la «Incompletion Trigger List» OFICIAL de David Allen (19
// profesionales + 20 personales, con sus ejemplos como pista) y un grupo «Extra» (no oficial)
export const MIND_SWEEP = [
  ['Profesional', 'Proyectos empezados', 'Lo que tienes a medias.'],
  ['Profesional', 'Proyectos por empezar', 'Lo que tendrías que arrancar.'],
  ['Profesional', 'Cosas por mirar', 'Lo que tienes que investigar, averiguar o comprobar.'],
  [
    'Profesional',
    'Compromisos y promesas a otros',
    'Jefe, socios, asesores, colegas, subordinados, clientes, otras organizaciones.',
  ],
  [
    'Profesional',
    'Comunicaciones por hacer o recibir',
    'Llamadas, correos, buzón de voz, cartas, memos, mensajes, redes sociales.',
  ],
  [
    'Profesional',
    'Escritos por terminar o entregar',
    'Informes, evaluaciones, propuestas, artículos, actas, informes de estado.',
  ],
  [
    'Profesional',
    'Leer / revisar',
    'Libros, publicaciones, artículos, webs, blogs, RSS, pódcasts.',
  ],
  [
    'Profesional',
    'Finanzas',
    'Caja, presupuesto, balance, pérdidas y ganancias, previsiones, cobros y pagos, bancos, inversores.',
  ],
  [
    'Profesional',
    'Planificación y organización',
    'Objetivos, planes, eventos, presentaciones, reuniones, conferencias, viajes, vacaciones.',
  ],
  [
    'Profesional',
    'Desarrollo de la organización',
    'Organigrama, reestructuración, líneas de autoridad, descripciones de puesto, instalaciones, liderazgo, cambio, sucesión, cultura.',
  ],
  ['Profesional', 'Marketing y promoción', 'Campañas, materiales, relaciones públicas.'],
  [
    'Profesional',
    'Administración',
    'Asuntos legales, seguros, personal, políticas y procedimientos, formación.',
  ],
  [
    'Profesional',
    'Personal a tu cargo',
    'Contratar, despedir, evaluaciones, comunicación, desarrollo, moral, feedback, retribución.',
  ],
  [
    'Profesional',
    'Sistemas',
    'Móviles, ordenadores, software, bases de datos, telecomunicaciones, oficina, archivo, suministros.',
  ],
  ['Profesional', 'Ventas', 'Clientes, ofertas, seguimientos, procesos de venta.'],
  ['Profesional', 'Reuniones', 'Próximas, por pedir o convocar, de las que hacer balance.'],
  [
    'Profesional',
    'Waiting for (esperas)',
    'Información, tareas delegadas, respuestas, pedidos, acciones de otros que tienen que pasar.',
  ],
  [
    'Profesional',
    'Desarrollo profesional',
    'Formación, seminarios, cosas por aprender o averiguar, libros, estudios, carrera, currículum.',
  ],
  ['Profesional', 'Vestuario profesional', 'Lo que necesitas para el trabajo.'],
  ['Personal', 'Proyectos empezados', 'Lo que tienes a medias.'],
  ['Personal', 'Proyectos por empezar', 'Lo que te gustaría o tendrías que arrancar.'],
  [
    'Personal',
    'Proyectos de otras organizaciones',
    'Servicio, comunidad, voluntariado, organización espiritual.',
  ],
  [
    'Personal',
    'Compromisos y promesas a otros',
    'Pareja, hijos, padres, familia, amigos, profesionales, cosas por devolver.',
  ],
  [
    'Personal',
    'Comunicaciones',
    'Llamadas, correos, tarjetas, cartas, agradecimientos, mensajes, redes sociales.',
  ],
  [
    'Personal',
    'Eventos próximos',
    'Cumpleaños, aniversarios, bodas, graduaciones, recepciones, fiestas, eventos culturales y deportivos.',
  ],
  [
    'Personal',
    'Administración',
    'Material de oficina en casa, equipos, teléfonos, audio y vídeo, Internet, TV, electrodomésticos, archivo, herramientas, copias de seguridad.',
  ],
  [
    'Personal',
    'Ocio',
    'Libros, música, vídeos, viajes, lugares y gente que visitar, fotografía, deporte, aficiones, cocina.',
  ],
  [
    'Personal',
    'Finanzas',
    'Facturas, bancos, inversiones, préstamos, impuestos, presupuesto, seguros, hipoteca, contables.',
  ],
  ['Personal', 'Mascotas', 'Veterinario, comida, cuidados.'],
  ['Personal', 'Legal', 'Testamentos, fideicomisos, herencia, asuntos legales.'],
  [
    'Personal',
    'Waiting for (esperas)',
    'Pedidos, reparaciones, reembolsos, cosas prestadas, información, confirmaciones de asistencia.',
  ],
  ['Personal', 'Familia', 'Proyectos y actividades con pareja, hijos, padres, parientes.'],
  [
    'Personal',
    'Casa / hogar',
    'Inmueble, reparaciones, obras, caseros, calefacción y aire, fontanería, electricidad, tejado, jardín, muebles, suministros, electrodomésticos, cocina, colada, sitios que purgar, limpieza, orden, almacenaje.',
  ],
  [
    'Personal',
    'Salud',
    'Médicos, dentista, óptico, especialistas, revisiones, dieta, comida, ejercicio.',
  ],
  [
    'Personal',
    'Desarrollo personal',
    'Clases, seminarios, educación, coaching, carrera, expresión creativa.',
  ],
  [
    'Personal',
    'Transporte',
    'Coches, bicis, motos, mantenimiento, reparaciones, trayectos, reservas.',
  ],
  [
    'Personal',
    'Ropa',
    'Profesional, informal, formal, deporte, accesorios, equipaje, arreglos, sastre.',
  ],
  [
    'Personal',
    'Recados',
    'Tiendas, ferretería, material, regalos, compra, farmacia, banco, tintorería.',
  ],
  ['Personal', 'Comunidad', 'Barrio, vecinos, trabajo de servicio, colegios, implicación cívica.'],
  ['Extra', 'Decisiones pendientes', 'Lo que tienes que decidir. (No es de la lista oficial.)'],
  ['Extra', 'Ideas', 'Mejoras, proyectos nuevos, «estaría bien…». (No es de la lista oficial.)'],
  [
    'Extra',
    'Algún día / quizá',
    'Sueños, ideas sueltas, «me gustaría…». (No es de la lista oficial.)',
  ],
].map(([group, label, hint], i) => ({ id: `sweep${i + 1}`, group, label, hint }));

export const SWEEP_GROUPS = ['Profesional', 'Personal', 'Extra'];

// «Saltar este bloque»: primer paso del grupo siguiente (o el final)
export const nextGroupStep = (steps, i) => {
  const g = steps[i] && steps[i].group;
  let j = i + 1;
  while (j < steps.length && steps[j].group === g) j++;
  return j;
};

// (4.14) Project Brainstorm Trigger List oficial (preguntas como pista)
export const BRAINSTORM_TRIGGERS = [
  [
    'Recursos',
    '¿Quién puede aportar? ¿Se ha hecho antes? ¿Qué errores y éxitos hay de los que aprender? ¿Qué recursos tengo y cuáles necesito?',
  ],
  [
    'Asuntos ejecutivos',
    '¿Cómo encaja con el plan estratégico y con otras prioridades? ¿Qué efecto tiene en la posición competitiva?',
  ],
  [
    'Administración',
    '¿Quién responde del éxito? Comunicación, estructuras, personal, subcontratas, habilidades, formación, quién tiene que saber qué, políticas afectadas, moral, diversión.',
  ],
  ['Finanzas', '¿Cuánto cuesta? ¿De dónde sale el dinero? ¿Qué retorno tiene? ¿Quién lo autoriza?'],
  [
    'Operaciones',
    '¿Plazos? ¿Fechas inamovibles? ¿Quién hace el trabajo? ¿Cómo se entrega completo?',
  ],
  ['Calidad', '¿Cómo se vigila el progreso? ¿Qué datos e informes hacen falta?'],
  ['Política', '¿El apoyo de quién hace falta?'],
  [
    'Partes interesadas',
    'Consejo, accionistas, empleados, proveedores, clientes, comunidad: ¿qué necesita cada uno?',
  ],
  ['Legal', '¿Qué asuntos legales o normativa afectan?'],
  ['Espacio, instalaciones y equipos', '¿Qué sitio, instalaciones o equipos hacen falta?'],
  ['Investigación', '¿Qué podría necesitar saber?'],
  ['Relaciones públicas', '¿Qué hay que comunicar fuera, y a quién?'],
  ['Riesgos', '¿Qué podría pasar? ¿Podría manejarlo?'],
  [
    'Pensamiento creativo',
    '¿A quién le importaría el éxito? ¿Qué diría o aportaría que aún no he considerado? La peor idea imaginable y su contraria. Lo más descabellado. ¿Qué lo haría único? ¿Qué no me he preguntado aún?',
  ],
].map(([label, hint], i) => ({ id: `bt${i + 1}`, label, hint }));

export const GUIDED_PROCESSES = {
  sweep: {
    label: 'Volcado mental',
    icon: 'fas fa-box-open',
    steps: MIND_SWEEP,
  },
  // (4.14) Modelo de Planificación Natural de Allen, completo
  project: {
    label: 'Planificar un proyecto nuevo',
    icon: 'fas fa-drafting-compass',
    steps: [
      {
        id: 'purpose',
        label: 'Propósito y principios',
        icon: 'fas fa-bullseye',
        hint:
          '¿Por qué lo haces? Y los principios: las normas y estándares con que decidirás (p. ej. «sin pasarse del presupuesto», «que todos estén de acuerdo»).',
      },
      {
        id: 'outcome',
        label: 'Resultado deseado',
        icon: 'fas fa-flag-checkered',
        hint: '¿Cómo sería con éxito total? ¿Cómo sabrás que está terminado? Imagínalo hecho.',
      },
      {
        id: 'ideas',
        label: 'Lluvia de ideas',
        icon: 'far fa-lightbulb',
        hint:
          'Todo lo que se te ocurra, sin juzgar ni ordenar: la realidad actual, lo que no sabes, lo que aún no has considerado. Mira el proyecto desde todos los lados (las preguntas de abajo ayudan).',
      },
      {
        id: 'order',
        label: 'Organizar',
        icon: 'fas fa-sitemap',
        hint:
          '¿Qué tiene que pasar para que pase todo? Ordena (secuencia o prioridad), quita lo que sobre y marca como componente lo que sea una parte con varias acciones.',
      },
      {
        id: 'first',
        label: 'Siguientes acciones',
        icon: 'fas fa-play',
        hint:
          'Para cada parte que pueda avanzar ya: ¿cuál es la siguiente acción física? (y, si no la haces tú, ¿quién?). Si aún no se sabe, «hace falta planificar más».',
      },
      {
        id: 'mind',
        label: '¿Sigue en tu mente?',
        icon: 'fas fa-question-circle',
        hint:
          'Si el proyecto ya no te ronda la cabeza, has planificado lo suficiente. Si sigue en tu mente, falta: si falta claridad, sube (propósito, resultado); si falta movimiento, baja (acciones).',
      },
    ],
  },
  stuck: {
    label: 'Aclarar un proyecto atascado',
    icon: 'fas fa-unlock-alt',
    steps: [],
  },
  waiting: {
    label: 'Repaso de Waiting',
    icon: 'fas fa-hourglass-half',
    steps: [],
  },
  someday: {
    label: 'Repaso de Someday/Maybe',
    icon: 'fas fa-cloud',
    steps: [],
  },
  // (4.07) tarjeta propia: Gtd/GtdHorizonsReview (pasos en gtd_horizons)
  horizons: {
    label: 'Revisión de horizontes',
    icon: 'fas fa-binoculars',
    steps: [],
  },
};

const byTitle = (a, b) => (a.title || '').localeCompare(b.title || '');

// Proyectos atascados: activos sin ninguna acción en Next (ni subproyecto abierto) y dormidos
export const stuckProjects = (tasks, today = new Date()) => {
  const live = tasks.filter((t) => !t.isTrashed);
  const hasNext = (p) =>
    live.some(
      (t) =>
        inProject(t, p) &&
        !t.isDone &&
        (t.isProject || (!!t.keyword && projectSectionOf(t, today) === 'next'))
    );
  const projects = projectsOf(live).filter((p) => !p.isDone);
  const noNext = projects
    .filter((p) => projectState(p, today) === 'active' && !hasNext(p))
    .sort(byTitle);
  const sleep = projects.filter((p) => p.ownSleep).sort(byTitle);
  return [
    ...noNext.map((p) => ({ project: p, why: 'noNext' })),
    ...sleep.map((p) => ({ project: p, why: 'sleep' })),
  ];
};

// Acciones abiertas de un proyecto (para el aviso de cerrar)
export const openActionsOf = (tasks, project) =>
  tasks.filter(
    (t) => inProject(t, project) && !!t.keyword && !t.isDone && !t.isProject && !t.isTrashed
  );

const personName = (person) =>
  String(person || '')
    .replace(/^@/, '')
    .replace(/_/g, ' ');

// Persona de una espera = su (primera) etiqueta, sin las de las listas
export const personOf = (task, skip = []) => {
  const lower = skip.map((s) => String(s).toLowerCase());
  return (
    (task.tags || []).find(
      (g) => !lower.includes(String(g).toLowerCase()) && String(g).toLowerCase() !== 'trash'
    ) || null
  );
};

// Repaso de Waiting: las esperas agrupadas por persona (las sin persona, al final)
export const waitingByPerson = (tasks, today = new Date(), skip = []) => {
  const list = tasks
    .filter((t) => !t.isTrashed && !t.isDone && !t.isProject && listOf(t, today) === 'waiting')
    .sort(byTitle);
  const groups = new Map();
  list.forEach((t) => {
    const p = personOf(t, skip);
    if (!groups.has(p)) groups.set(p, []);
    groups.get(p).push(t);
  });
  return Array.from(groups.entries())
    .sort(([a], [b]) =>
      a === null ? 1 : b === null ? -1 : personName(a).localeCompare(personName(b))
    )
    .map(([person, items]) => ({ person, items }));
};

// Título de la tarea de seguimiento
export const chaseTitle = (task, person) =>
  person ? `Reclamar a ${personName(person)}: ${task.title}` : `Reclamar: ${task.title}`;

// Mensaje para copiar
export const chaseMessage = (task, person) =>
  `Hola${person ? ' ' + personName(person) : ''}, ¿cómo va «${task.title}»? Gracias.`;

// Repaso de Someday/Maybe: las tareas de Someday y los proyectos dormidos
export const somedayReview = (tasks, today = new Date()) => {
  const live = tasks.filter((t) => !t.isTrashed && !t.isDone);
  const items = live.filter((t) => !t.isProject && listOf(t, today) === 'someday').sort(byTitle);
  const projects = projectsOf(live)
    .filter((p) => p.ownSleep)
    .sort(byTitle);
  return { items, projects };
};

// ---- (4.14) Planificar un proyecto (Modelo de Planificación Natural)
// plan: { purpose, principles, outcome, stakeholders,
//   ideas: [string | { title, component, actions: [string], existing }],
//   first, firstWho, firstMore,              ← siguiente acción del proyecto («General»)
//   nexts: { [título del componente]: { action, who, more } } }
const NOTE_FIELDS = [
  ['purpose', 'Propósito'],
  ['principles', 'Principios'],
  ['outcome', 'Resultado'],
  ['stakeholders', 'Partes interesadas'],
];
const tagOf = (who) =>
  String(who || '')
    .trim()
    .replace(/^@/, '')
    .replace(/\s+/g, '_');
export const ideaOf = (x) =>
  typeof x === 'string'
    ? { title: x, component: false, actions: [], existing: false }
    : { component: false, actions: [], existing: false, ...x };
export const PLAN_MORE = (title) => `Planificar: ${title}`;

// Notas del proyecto: «Propósito: …» / «Principios: …» / «Resultado: …» / «Partes interesadas: …»
export const planNotes = (plan) =>
  NOTE_FIELDS.map(([k, label]) => (plan[k] || '').trim() && `${label}: ${plan[k].trim()}`)
    .filter(Boolean)
    .join('\n');

// Leer esas líneas de unas notas (el resto se devuelve en `rest`)
export const parsePlanNotes = (notes = '') => {
  const out = { purpose: '', principles: '', outcome: '', stakeholders: '' };
  const rest = [];
  String(notes || '')
    .split('\n')
    .forEach((line) => {
      const f = NOTE_FIELDS.find(([, label]) => line.startsWith(`${label}:`));
      if (f && !out[f[0]]) out[f[0]] = line.slice(f[1].length + 1).trim();
      else rest.push(line);
    });
  return { ...out, rest: rest.join('\n').trim() };
};

// Notas nuevas respetando el resto de las que había (las del plan, arriba)
export const mergePlanNotes = (oldNotes, plan) => {
  const { rest } = parsePlanNotes(oldNotes);
  return [planNotes(plan), rest].filter(Boolean).join('\n');
};

// Unidades con siguiente acción: el proyecto («General», si hay ideas sueltas o ningún
// componente) y cada componente (todos se consideran independientes)
export const planUnits = (plan) => {
  const ideas = (plan.ideas || []).map(ideaOf);
  const comps = ideas.filter((i) => i.component);
  const loose = ideas.filter((i) => !i.component);
  const units = [];
  if (loose.length || !comps.length)
    units.push({ key: '', title: 'El proyecto', choices: loose.map((i) => i.title) });
  comps.forEach((c) => units.push({ key: c.title, title: c.title, choices: c.actions }));
  return units;
};

// Siguiente acción elegida para una unidad: { action, who, more }
export const unitNext = (plan, key) =>
  key
    ? { action: '', who: '', more: false, ...((plan.nexts || {})[key] || {}) }
    : { action: plan.first || '', who: plan.firstWho || '', more: !!plan.firstMore };
const unitReady = (n) => !!(n.more || (n.action || '').trim());
// Se puede crear: con al menos una siguiente acción (o «planificar más»)
export const planReady = (plan) => planUnits(plan).some((u) => unitReady(unitNext(plan, u.key)));

// Tareas de una unidad: la siguiente (Next) primero y el resto (Todo) en orden
const unitTasks = (titles, n, title) => {
  const f = (n.action || '').trim();
  const who = tagOf(n.who);
  const head = [];
  if (n.more) head.push({ title: PLAN_MORE(title), list: 'next' });
  if (f) head.push({ title: f, list: n.more ? 'later' : 'next', ...(who ? { tags: [who] } : {}) });
  const rest = titles
    .map((x) => x.trim())
    .filter((x) => x && x !== f)
    .map((t) => ({ title: t, list: 'later' }));
  return [...head, ...rest];
};

// Planificar un proyecto: notas y tareas. Componente con ≥2 acciones = subproyecto
// ({ list: 'project', children }); con 1 = esa tarea; sin acciones = tarea con su nombre.
export const projectPlan = (plan) => {
  const ideas = (plan.ideas || []).map(ideaOf);
  const loose = ideas.filter((i) => !i.component).map((i) => i.title);
  const general = unitNext(plan, '');
  const hasGeneral = unitReady(general);
  const tasks = [];
  // sin ninguna siguiente acción no se crean tareas (como en la 4.06)
  if (!planReady(plan)) return { notes: planNotes(plan), tasks: [] };
  if (hasGeneral || loose.length) tasks.push(...unitTasks(loose, general, plan.name || ''));
  ideas
    .filter((i) => i.component)
    .forEach((c) => {
      const n = unitNext(plan, c.title);
      const children = unitTasks(c.actions, n, c.title);
      if (children.length >= 2) tasks.push({ title: c.title, list: 'project', children });
      else if (children.length === 1) tasks.push(children[0]);
      else tasks.push({ title: c.title, list: 'later' });
    });
  return { notes: planNotes(plan), tasks };
};

// Relanzar sobre un proyecto existente: el plan precargado (notas y tareas abiertas)
export const planFromProject = (tasks, project) => {
  const n = parsePlanNotes(project.description);
  const open = (p) =>
    tasks.filter((t) => inProject(t, p) && !!t.keyword && !t.isDone && !t.isTrashed);
  const ideas = open(project).map((t) =>
    t.isProject
      ? {
          title: t.title,
          component: true,
          existing: true,
          actions: open(t)
            .filter((c) => !c.isProject)
            .map((c) => c.title),
        }
      : { title: t.title, component: false, existing: true, actions: [] }
  );
  const { rest, ...fields } = n;
  return { name: project.title, ...fields, ideas, first: '', nexts: {} };
};

// Lo que hay que AÑADIR a un proyecto existente: solo títulos nuevos (sin distinguir
// mayúsculas); un subproyecto que ya existe se conserva (`existing`) para añadir sus hijas
export const planAdditions = (planTasks, existingTitles) => {
  const has = new Set(existingTitles.map((t) => String(t).trim().toLowerCase()));
  const out = [];
  planTasks.forEach((t) => {
    const known = has.has(t.title.trim().toLowerCase());
    if (t.children) {
      const children = planAdditions(t.children, existingTitles);
      if (!known) out.push({ ...t, children });
      else if (children.length) out.push({ ...t, existing: true, children });
    } else if (!known) out.push(t);
  });
  return out;
};

// Mover un elemento de una lista (ordenar ideas)
export const moveItem = (list, i, delta) => {
  const j = i + delta;
  if (i < 0 || i >= list.length || j < 0 || j >= list.length) return list;
  const out = list.slice();
  const [x] = out.splice(i, 1);
  out.splice(j, 0, x);
  return out;
};
