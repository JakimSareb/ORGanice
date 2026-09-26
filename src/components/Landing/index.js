// ORGanice: pantalla de inicio (sin sesión iniciada). Sencilla, con los colores del logo.
import React from 'react';
import { Link } from 'react-router-dom';

import './stylesheet.css';

import logo from 'url:../../images/logo-unicornio.svg';
import shotGtd from 'url:../../images/landing-gtd.png';
import shotAgenda from 'url:../../images/landing-agenda.png';

const FEATURES = [
  {
    icon: 'fas fa-tasks',
    title: 'Vista GTD',
    text:
      'Focus, Inbox, Next, proyectos y áreas, al estilo de Nirvana. Filtra por contexto, energía y tiempo, y arrastra las tareas de una lista a otra.',
  },
  {
    icon: 'far fa-calendar-alt',
    title: 'Agenda clara',
    text:
      'Lo vencido, lo prioritario y lo que viene, con los días que faltan. Hábitos con su gráfico de constancia.',
  },
  {
    icon: 'fas fa-feather-alt',
    title: 'Org Mode de verdad',
    text:
      'Tus ficheros siguen siendo texto Org: estados, prioridades, etiquetas, fechas, tablas, reloj y archivado, compatibles con Emacs.',
  },
  {
    icon: 'fab fa-dropbox',
    title: 'Tus ficheros, tuyos',
    text:
      'En tu Dropbox o en una carpeta de tu ordenador. Funciona sin conexión y te avisa si hay cambios en dos sitios a la vez.',
  },
  {
    icon: 'fas fa-lock',
    title: 'Privado',
    text:
      'Cifrado GPG compatible con Emacs, bloqueo por inactividad y ningún servidor intermedio: la app habla directamente con tu Dropbox.',
  },
  {
    icon: 'fas fa-mobile-alt',
    title: 'Móvil y ordenador',
    text:
      'Pensada para el dedo y para el teclado: gestos, atajos, captura rápida desde el iPhone y la app instalable en la pantalla de inicio.',
  },
];

export default () => (
  <div className="eli-landing">
    <header className="eli-landing__nav">
      <Link to="/" className="eli-landing__brand">
        <img src={logo} alt="" width="40" height="40" />
        <span>ORGanice</span>
      </Link>
      <nav className="eli-landing__links">
        <Link to="/sample" className="eli-landing__link" data-testid="landing-docs-link">
          Manual
        </Link>
        <Link
          to="/sign_in"
          className="eli-landing__btn eli-landing__btn--small"
          data-testid="landing-sign-in-navbar"
        >
          Iniciar sesión
        </Link>
      </nav>
    </header>

    <main>
      <section className="eli-landing__hero">
        <div className="eli-landing__hero-text">
          <h1>
            Tus tareas en Org Mode,
            <br />
            <span>ordenadas y siempre a mano.</span>
          </h1>
          <p>
            ORGanice es un editor de ficheros Org para el móvil y el ordenador, con una vista GTD
            sencilla y una agenda clara. Trabaja directamente con tus ficheros de Dropbox o de tu
            ordenador, sin cambiar nada de cómo los usas en Emacs.
          </p>
          <div className="eli-landing__actions">
            <Link to="/sign_in" className="eli-landing__btn" data-testid="landing-sign-in-hero">
              Iniciar sesión
            </Link>
            <Link
              to="/sample"
              className="eli-landing__btn eli-landing__btn--ghost"
              data-testid="landing-live-demo-hero"
            >
              Probar con el manual
            </Link>
          </div>
          <p className="eli-landing__hint">
            «Probar con el manual» abre un fichero de ejemplo que puedes tocar sin iniciar sesión.
            Nada se guarda.
          </p>
        </div>
        <div className="eli-landing__hero-shots">
          <img className="eli-landing__shot eli-landing__shot--wide" src={shotGtd} alt="Vista GTD" />
          <img
            className="eli-landing__shot eli-landing__shot--phone"
            src={shotAgenda}
            alt="Agenda en el móvil"
          />
        </div>
      </section>

      <section className="eli-landing__features" aria-label="Qué ofrece ORGanice">
        {FEATURES.map((f) => (
          <article key={f.title} className="eli-landing__card">
            <i className={f.icon} aria-hidden="true" />
            <h2>{f.title}</h2>
            <p>{f.text}</p>
          </article>
        ))}
      </section>

      <section className="eli-landing__steps">
        <h2>Empieza en un minuto</h2>
        <ol>
          <li>
            <strong>Inicia sesión</strong> con Dropbox, o elige una carpeta de tu ordenador (Edge o
            Chrome).
          </li>
          <li>
            <strong>Abre tus ficheros .org</strong> y márcalos para la agenda en Ajustes → Ajustes de
            ficheros.
          </li>
          <li>
            <strong>Pulsa g</strong> (o el botón de la lista) para entrar en la vista GTD.
          </li>
        </ol>
        <Link to="/sample" className="eli-landing__btn eli-landing__btn--ghost">
          Leer el manual
        </Link>
      </section>
    </main>

    <footer className="eli-landing__footer">
      <span>ORGanice</span>
      <span aria-hidden="true">·</span>
      <a href="https://github.com/JakimSareb/ORGanice" target="_blank" rel="noopener noreferrer">
        Código
      </a>
      <span aria-hidden="true">·</span>
      <span>
        Basada en{' '}
        <a href="https://github.com/200ok-ch/organice" target="_blank" rel="noopener noreferrer">
          organice
        </a>{' '}
        (AGPL)
      </span>
      <span aria-hidden="true">·</span>
      <Link to="/privacy-policy">Privacidad</Link>
    </footer>
  </div>
);
