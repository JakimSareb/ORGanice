// ORG Mode para Eli (4.06): procesos guiados puntuales y periódicos de GTD (Menú ☰ › Procesos):
// «Volcado mental», «Planificar un proyecto nuevo», «Aclarar un proyecto atascado», «Repaso de
// Waiting» y «Repaso de Someday/Maybe». Modelo puro; la tarjeta es Gtd/GtdGuidedProcess.
import { listOf, projectsOf, projectState, projectSectionOf, inProject } from './gtd_model';

// Lista de disparadores (la «Incompletion Trigger List» de David Allen, adaptada): uno por paso
export const MIND_SWEEP = [
  ['Trabajo', 'Proyectos empezados sin terminar', 'Lo que tienes a medias.'],
  ['Trabajo', 'Proyectos por empezar', 'Lo que tendrías que arrancar.'],
  ['Trabajo', 'Compromisos con otros', 'Jefe, compañeros, clientes, proveedores.'],
  ['Trabajo', 'Llamadas, correos y mensajes', 'Por hacer o por contestar.'],
  ['Trabajo', 'Escritos por terminar', 'Informes, propuestas, presentaciones, artículos.'],
  ['Trabajo', 'Reuniones', 'Por preparar, por convocar o de las que salió algo.'],
  ['Trabajo', 'Lo que has delegado', 'A quién le pediste algo y aún no ha llegado.'],
  ['Trabajo', 'Lo que te deben', 'Respuestas, entregas, firmas, pagos.'],
  ['Trabajo', 'Dinero', 'Facturas, gastos, presupuestos, previsiones.'],
  ['Trabajo', 'Planes y objetivos', 'Del año, del trimestre, del equipo.'],
  ['Trabajo', 'Personas del equipo', 'Contratar, evaluar, ayudar, agradecer.'],
  ['Trabajo', 'Clientes y ventas', 'Seguimientos, ofertas, quejas, ideas.'],
  ['Trabajo', 'Sistemas y organización', 'Ordenador, ficheros, archivo, procedimientos.'],
  ['Trabajo', 'Oficina y material', 'Lo que falta, se rompió o sobra.'],
  ['Trabajo', 'Formación', 'Cursos, lecturas, cosas que aprender para el trabajo.'],
  ['Trabajo', 'Papeles y asuntos legales', 'Contratos, permisos, trámites.'],
  ['Trabajo', 'Viajes y eventos', 'Viajes de trabajo, congresos, ferias.'],
  ['Trabajo', 'Decisiones pendientes', 'Lo que tienes que decidir.'],
  ['Trabajo', 'Cosas por mirar', 'Investigar, comparar, probar.'],
  ['Trabajo', 'Ideas', 'Mejoras, proyectos nuevos, «estaría bien…».'],
  ['Personal', 'Proyectos personales empezados', 'Lo que tienes a medias fuera del trabajo.'],
  ['Personal', 'Proyectos personales por empezar', 'Lo que te gustaría arrancar.'],
  ['Personal', 'Compromisos con familia y amigos', 'Lo que has prometido.'],
  ['Personal', 'Llamadas, mensajes y cartas', 'A quién tienes que llamar, escribir o contestar.'],
  ['Personal', 'Fechas especiales', 'Cumpleaños, aniversarios, celebraciones, regalos.'],
  ['Personal', 'Casa', 'Reparaciones, mejoras, limpieza, muebles, jardín.'],
  ['Personal', 'Recados y compras', 'Lo que hay que comprar, devolver o recoger.'],
  ['Personal', 'Dinero', 'Facturas, banco, impuestos, seguros, ahorro.'],
  ['Personal', 'Papeles y trámites', 'DNI, coche, colegios, ayuntamiento, garantías.'],
  ['Personal', 'Salud', 'Médico, dentista, revisiones, medicinas, ejercicio.'],
  ['Personal', 'Familia', 'Pareja, hijos, padres: lo que necesitan o habéis hablado.'],
  ['Personal', 'Mascotas', 'Veterinario, comida, cuidados.'],
  ['Personal', 'Coche y transporte', 'Revisión, ITV, seguro, abonos.'],
  ['Personal', 'Aparatos', 'Ordenador, móvil, copias de seguridad, actualizaciones.'],
  ['Personal', 'Ropa', 'Lo que hay que arreglar, comprar o dar.'],
  ['Personal', 'Viajes y vacaciones', 'Por planear, reservar o preparar.'],
  ['Personal', 'Ocio y aficiones', 'Libros, películas, música, deporte, salidas.'],
  ['Personal', 'Aprender', 'Idiomas, cursos, habilidades.'],
  ['Personal', 'Comunidad', 'Vecinos, asociaciones, voluntariado.'],
  ['Personal', 'Algún día / quizá', 'Sueños, ideas sueltas, «me gustaría…».'],
].map(([group, label, hint], i) => ({ id: `sweep${i + 1}`, group, label, hint }));

export const GUIDED_PROCESSES = {
  sweep: {
    label: 'Volcado mental',
    icon: 'fas fa-box-open',
    steps: MIND_SWEEP,
  },
  project: {
    label: 'Planificar un proyecto nuevo',
    icon: 'fas fa-drafting-compass',
    steps: [
      {
        id: 'purpose',
        label: 'Nombre y propósito',
        icon: 'fas fa-bullseye',
        hint: '¿Cómo se llama el proyecto y por qué lo haces?',
      },
      {
        id: 'outcome',
        label: 'Resultado',
        icon: 'fas fa-flag-checkered',
        hint: '¿Cómo sabrás que está terminado? Imagínalo hecho.',
      },
      {
        id: 'ideas',
        label: 'Ideas',
        icon: 'far fa-lightbulb',
        hint: 'Todo lo que se te ocurra que hay que hacer, sin orden.',
      },
      {
        id: 'order',
        label: 'Ordenar',
        icon: 'fas fa-sort',
        hint: 'Pon las ideas en el orden en que se harían (y quita las que sobren).',
      },
      {
        id: 'first',
        label: 'Primera acción',
        icon: 'fas fa-play',
        hint: '¿Qué es lo primero que harías? Una acción concreta (obligatoria).',
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

// Planificar un proyecto: notas (propósito y resultado) y tareas en orden (la primera = Next)
export const projectPlan = ({ purpose = '', outcome = '', ideas = [], first = '' }) => {
  const notes = [
    purpose.trim() && `Propósito: ${purpose.trim()}`,
    outcome.trim() && `Resultado: ${outcome.trim()}`,
  ]
    .filter(Boolean)
    .join('\n');
  const f = first.trim();
  const rest = ideas.map((x) => x.trim()).filter((x) => x && x !== f);
  return {
    notes,
    tasks: f
      ? [{ title: f, list: 'next' }, ...rest.map((title) => ({ title, list: 'later' }))]
      : [],
  };
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
