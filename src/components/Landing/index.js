import { BASE_PATH } from '../../lib/base_path';
import React from 'react';
import { Link } from 'react-router-dom';

import * as classes from './vendor_css/template.scss';

document.body.className = classes.body;

import './stylesheet.css';

// import AOS from 'aos';
// import 'aos/dist/aos.css';

import logo from 'url:../../images/logo-unicornio.svg';
import screenshotOverview from 'url:../../images/screenshot-overview.png';
import screenshotWide from 'url:../../images/screenshot-wide.png';
// import ExternalLink from '../UI/ExternalLink';

import { useEffect } from 'react';

import { Menu, ArrowRight, CheckSquare, EyeOff, Calendar } from 'react-feather';

export default () => {
  // FIXME: AOS does not animate/show the screenshot section in the
  // middle. It works for the hero. On https://200ok.ch/organice.html
  // it works for all elements weirdly enough. Could be related to
  // <Landing /> being implemented in React.

  // useEffect(() => {
  //   AOS.init({
  //     disable: 'mobile',
  //     duration: 1000,
  //     once: true,
  //   });
  // }, []);

  // Load Bootstrap and FontAwesome JS via dynamic import
  useEffect(() => {
    let mounted = true;

    const loadScripts = async () => {
      if (!mounted) return;

      try {
        // Load Bootstrap JS first (no dependencies, but foundation for others)
        await import('bootstrap/dist/js/bootstrap.bundle.min.js');
        // Load FontAwesome JS second (replaces <i> tags with <svg>)
        await import('@fortawesome/fontawesome-free/js/all.min.js');
      } catch (err) {
        console.error('Failed to load scripts:', err);
      }
    };

    loadScripts();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <>
      <div id="layoutDefault">
        <div id="layoutDefault_content">
          <main>
            {/* Navbar */}
            <nav className="navbar navbar-marketing navbar-expand-lg bg-transparent navbar-dark fixed-top navbar-scrolled">
              <div className="container px-5">
                <img
                  className="landing-logo"
                  src={logo}
                  alt="Logo"
                  style={{
                    height: '4rem',
                    filter: 'drop-shadow(0px 0px 18px #fdf6e3)',
                  }}
                />
                <button
                  className="navbar-toggler"
                  type="button"
                  data-bs-toggle="collapse"
                  data-bs-target="#navbarSupportedContent"
                  aria-controls="navbarSupportedContent"
                  aria-expanded="false"
                  aria-label="Mostrar u ocultar la navegación"
                >
                  <Menu />
                </button>
                <div className="collapse navbar-collapse" id="navbarSupportedContent">
                  <ul className="navbar-nav ms-auto me-lg-5">
                    <li className="nav-item">
                      <a
                        target="_blank"
                        className="nav-link navbar-brand"
                        href="https://github.com/sponsors/200ok-ch"
                        rel="noreferrer noopener"
                      >
                        Precios
                      </a>
                    </li>

                    <li className="nav-item">
                      <a
                        target="_blank"
                        className="nav-link navbar-brand"
                        href="https://github.com/200ok-ch/organice"
                        rel="noreferrer noopener"
                        data-testid="landing-github-link"
                      >
                        Código
                      </a>
                    </li>

                    <li className="nav-item">
                      <a
                        target="_blank"
                        className="nav-link navbar-brand"
                        href="https://organice.200ok.ch/documentation.html"
                        rel="noreferrer noopener"
                        data-testid="landing-docs-link"
                      >
                        Documentación
                      </a>
                    </li>
                  </ul>
                  <a
                    className="btn fw-500 ms-lg-4 btn-teal"
                    href={`${BASE_PATH}/sign_in`}
                    data-testid="landing-sign-in-navbar"
                  >
                    Iniciar sesión
                    {/* <i className="ms-2" data-feather="arrow-right"></i> */}
                    <ArrowRight className="ms-2" />
                  </a>
                </div>
              </div>
            </nav>
            {/* Page Header */}
            <header className="page-header-ui page-header-ui-dark bg-gradient-primary-to-secondary">
              <div className="page-header-ui-content pt-10">
                <div className="container px-5">
                  <div className="row gx-5 align-items-center">
                    <div className="col-lg-6" data-aos="fade-up">
                      <h1 className="page-header-ui-title">
                        organice es la mejor forma de sacar las cosas adelante
                      </h1>
                      <p>
                        Tanto si planificas varios proyectos de trabajo, compartes la lista de la
                        compra con tu pareja o preparas unas vacaciones, organice te ayuda a
                        completar todas tus tareas personales y profesionales.
                      </p>
                      <p>
                        organice es software libre y de código abierto que trabaja sobre ficheros de
                        Org mode.
                      </p>

                      <a
                        className="btn btn-teal fw-500 me-2"
                        href={`${BASE_PATH}/sample`}
                        data-testid="landing-live-demo-hero"
                      >
                        Demo en vivo
                        {/* <i className="ms-2" data-feather="arrow-right"></i> */}
                        <ArrowRight className="ms-2" />
                      </a>

                      <a
                        className="btn btn-white fw-500 me-2"
                        href={`${BASE_PATH}/sign_in`}
                        data-testid="landing-sign-in-hero"
                      >
                        Iniciar sesión
                        {/* <i className="ms-2" data-feather="arrow-right"></i> */}
                        <ArrowRight className="ms-2" />
                      </a>
                    </div>
                    <div
                      className="col-lg-6 mt-5 mt-lg-0 d-lg-block text-center"
                      data-aos="fade-up"
                      data-aos-delay="1000"
                    >
                      <img
                        className="img-fluid main-image"
                        alt=""
                        src={screenshotOverview}
                        style={{ filter: 'drop-shadow(0.5em 0.5em 0.5em #444)' }}
                      />
                    </div>
                  </div>
                </div>
                <div className="svg-border-rounded text-white">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 144.54 17.34"
                    preserveAspectRatio="none"
                    fill="currentColor"
                  >
                    <path d="M144.54,17.34H0V0H144.54ZM0,0S32.36,17.34,72.27,17.34,144.54,0,144.54,0"></path>
                  </svg>
                </div>
              </div>
            </header>

            <div className="row">
              {/* TODO: Reprogram false_bottom the React way */}
              {/* <div id="false-bottom-preventor" className="fixed-bottom text-end"> */}
              {/*   <p> */}
              {/*     Learn more <i className="fas fa-arrow-circle-down"></i> */}
              {/*   </p> */}
              {/* </div> */}
              <section className="bg-white py-10">
                <div className="container px-5">
                  <div className="row gx-5 text-center">
                    <div className="col-lg-4 mb-5 mb-lg-0">
                      <div className="icon-stack icon-stack-xl bg-gradient-primary-to-secondary text-white mb-4">
                        {/* <i data-feather="check-square"></i> */}
                        <CheckSquare />
                      </div>
                      <h3>Planifica cualquier cosa</h3>
                      <p className="mb-0">
                        Organiza y comparte tus listas de tareas, trabajo, compra, películas y casa.
                        Planifiques lo que planifiques, sea la tarea grande o pequeña, organice te
                        lo pone muy fácil para sacarlo adelante.
                      </p>
                    </div>

                    <div className="col-lg-4 mb-5 mb-lg-0">
                      <div className="icon-stack icon-stack-xl bg-gradient-primary-to-secondary text-white mb-4">
                        {/* <i data-feather="calendar"></i> */}
                        <Calendar />
                      </div>
                      <h3>Consulta tu agenda cuando quieras</h3>
                      <p className="mb-0">
                        Programa tareas y ponles fechas límite. Tanto si son de trabajo como de
                        ocio, con organice no volverás a saltarte una fecha límite.
                      </p>
                    </div>

                    <div className="col-lg-4 mb-5 mb-lg-0">
                      <div className="icon-stack icon-stack-xl bg-gradient-primary-to-secondary text-white mb-4">
                        {/* <i data-feather="eye-off"></i> */}
                        <EyeOff />
                      </div>
                      <h3>Privacidad y libertad ante todo</h3>
                      <p className="mb-0">
                        organice es software libre y de código abierto que protege tu libertad de
                        ejecutar, copiar, distribuir, estudiar, modificar y mejorar el software. Tus
                        datos más importantes nunca deberían estar encerrados en un sistema cerrado.
                        <br />
                        <br />
                        Además, nunca vemos tus datos: solo los ves tú y tu proveedor de
                        almacenamiento. organice guarda tus ficheros en el formato libre de Org
                        mode, así que siempre podrás abrirlos con cualquier herramienta, en
                        cualquier momento.
                      </p>
                    </div>
                  </div>

                  <div id="icons" className="row pt-10 d-flex flex-wrap align-items-center">
                    <h1 className="text-center mb-5">Accede desde cualquier lugar</h1>
                    <strong className="text-center mb-5">
                      Disponible en iPhone, Android y la web, organice funciona sin problemas en
                      todos los dispositivos habituales.
                    </strong>

                    <div className="col-md-4">
                      <i className="fas fa-mobile-alt"></i>
                    </div>

                    <div className="col-md-4">
                      <i className="fab fa-android"></i>
                    </div>

                    <div className="col-md-4">
                      <i className="fab fa-firefox"></i>
                    </div>
                  </div>
                </div>

                <div className="svg-border-rounded text-light">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 144.54 17.34"
                    preserveAspectRatio="none"
                    fill="currentColor"
                  >
                    <path d="M144.54,17.34H0V0H144.54ZM0,0S32.36,17.34,72.27,17.34,144.54,0,144.54,0"></path>
                  </svg>
                </div>
              </section>

              <section className="bg-light py-10">
                <div className="container px-5">
                  <div className="row gx-5 align-items-center justify-content-center">
                    <div className="col-md-9 col-lg-6 order-1 order-lg-0" data-aos="fade-right">
                      <div className="content-skewed content-skewed-right">
                        <img
                          className="content-skewed-item img-fluid shadow-lg rounded-3"
                          src={screenshotWide}
                          alt="Documento de ejemplo en organice"
                        />
                      </div>
                    </div>
                    <div className="col-lg-6 order-0 order-lg-1 mb-5 mb-lg-0" data-aos="fade-left">
                      <div className="mb-5">
                        <h2>Acuérdate de todo</h2>
                        <p className="lead">Saca adelante cada proyecto</p>
                      </div>

                      <div className="row gx-5">
                        <div className="col-md-6 mb-4">
                          <h6>Trabaja desde cualquier sitio</h6>
                          <p className="mb-2 small mb-0">
                            organice funciona en las principales plataformas, así que puedes acceder
                            a tu información estés donde estés.
                          </p>
                        </div>

                        <div className="col-md-6 mb-4">
                          <h6>Encuentra tu contenido rápidamente</h6>
                          <p className="mb-2 small mb-0">
                            Gracias a un lenguaje de consulta flexible y a un sistema de marcadores,
                            encuentras tu contenido importante de forma rápida y fiable.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="bg-white pt-10">
                <div className="container px-5">
                  <div className="row gx-5 mb-10">
                    <h1 className="text-center mb-5">Qué dicen nuestros usuarios</h1>
                    <div
                      className="col-lg-6 mb-5 mb-lg-0 divider-right aos-init aos-animate"
                      data-aos="fade"
                    >
                      <div className="testimonial p-lg-5">
                        <p className="testimonial-quote text-primary">
                          «Es un proyecto ESPECTACULAR y me alegro de haberlo encontrado. organice
                          toma la enorme potencia de Org mode y la hace fácil de usar. Unido a la
                          posibilidad de alojar tus propios datos, organice ofrece una opción
                          extremadamente flexible y segura para cubrir las necesidades de
                          organización de cualquiera.»
                        </p>
                        <div className="row">
                          <div className="col-3">
                            <img
                              className="card-img"
                              src="https://github.com/dmorlitz.png"
                              alt="@dmorlitz"
                            />
                          </div>
                          <div className="col-9">
                            <div className="testimonial-name">
                              <a
                                target="_blank"
                                href="https://github.com/dmorlitz"
                                style={{ color: '#363d47' }}
                                rel="noopener noreferrer"
                              >
                                @dmorlitz
                              </a>
                            </div>
                            <div className="testimonial-position">Colaborador</div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div
                      className="col-lg-6 aos-init aos-animate"
                      data-aos="fade"
                      data-aos-delay="100"
                    >
                      <div className="testimonial p-lg-5">
                        <p className="testimonial-quote text-primary">
                          «Llevo años usando organice. Para mí es, con diferencia, la solución más
                          cómoda para trabajar con ficheros org en el móvil.»
                        </p>
                        <div className="row">
                          <div className="col-3">
                            <img
                              className="card-img"
                              src="https://github.com/jcpst.png"
                              alt="@jcpst"
                            />
                          </div>
                          <div className="col-9">
                            <div className="testimonial-name">
                              <a
                                target="_blank"
                                href="https://github.com/jcpst"
                                style={{ color: '#363d47' }}
                                rel="noopener noreferrer"
                              >
                                @jcpst
                              </a>
                            </div>
                            <div className="testimonial-position">Usuario</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <hr className="m-0" />

              <section className="bg-dark py-10">
                <div className="container px-5">
                  <div className="row gx-5 my-10">
                    <div className="col-lg-6 mb-5">
                      <div className="d-flex h-100">
                        <div className="icon-stack flex-shrink-0 bg-teal text-white">
                          <i className="fas fa-question"></i>
                        </div>

                        <div className="ms-4">
                          <h5 className="text-white">Vídeo de introducción</h5>
                          <p className="text-white-50">
                            Si te interesa saber por qué empezamos con organice, aquí lo tienes.
                            Para{' '}
                            <a
                              target="_blank"
                              href="https://emacsconf.org/2019/"
                              rel="noreferrer noopener"
                            >
                              {' '}
                              EmacsConf 2019
                            </a>
                            , preparamos un vídeo de introducción de 10 minutos sobre las ideas y el
                            uso de organice.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="col-lg-6 mb-5">
                      <div className="d-flex h-100">
                        <div className="tutorial container text-center my-5 ratio ratio-16x9">
                          <iframe
                            src="https://www.youtube.com/embed/aQKc0hcFXCk"
                            title="Reproductor de vídeo de YouTube"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          ></iframe>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="row gx-5 justify-content-center text-center">
                    <div className="col-lg-8">
                      <div className="badge bg-transparent-light rounded-pill badge-marketing mb-4"></div>
                      <h2 className="text-white">Empieza ya</h2>
                      <div className="lead text-white-50 mb-5">
                        <p>
                          organice es{' '}
                          <a
                            target="_blank"
                            href="https://www.gnu.org/philosophy/free-sw.en.html"
                            rel="noreferrer noopener"
                          >
                            software libre
                          </a>{' '}
                          y lo seguirá siendo. Deja atrás los sistemas cerrados y da libertad a tu
                          conocimiento. Empieza con la demo en vivo: ni siquiera necesitas
                          registrarte. Pruébala primero y regístrate después.
                        </p>
                      </div>

                      <a
                        className="btn btn-teal fw-500"
                        href={`${BASE_PATH}/sample`}
                        data-testid="landing-live-demo-bottom"
                      >
                        Demo en vivo
                      </a>
                    </div>
                  </div>
                </div>
                <div className="svg-border-rounded text-white">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 144.54 17.34"
                    preserveAspectRatio="none"
                    fill="currentColor"
                  >
                    <path d="M144.54,17.34H0V0H144.54ZM0,0S32.36,17.34,72.27,17.34,144.54,0,144.54,0"></path>
                  </svg>
                </div>
              </section>

              <section className="bg-light py-10">
                <div className="container px-5 mt-5">
                  <div className="row gx-5 align-items-center">
                    <div className="col-lg-6">
                      <h4>¿Tienes más preguntas?</h4>
                      <p className="lead mb-5 mb-lg-0 text-gray-500">
                        Únete al chat de la comunidad, abierto y amigable, y hablemos.
                      </p>
                    </div>
                    <div className="col-lg-6 text-lg-end">
                      <a
                        className="btn btn-primary fw-500 me-3 my-2"
                        href="https://matrix.to/#/#organice:matrix.org"
                      >
                        Matrix
                      </a>

                      <a
                        className="btn btn-white fw-500 my-2 shadow"
                        href="https://web.libera.chat/"
                      >
                        IRC (&#35;organice)
                      </a>
                    </div>
                  </div>
                </div>
              </section>
              <hr className="m-0" />
            </div>
          </main>
        </div>

        <div id="layoutDefault_footer">
          <footer className="footer pt-10 pb-5 mt-auto bg-light footer-light">
            <div className="container px-5">
              <div className="row gx-5">
                <div className="col-lg-3">
                  <div className="footer-brand">200ok GmbH</div>
                  <div className="mb-3">Glarus, Suiza</div>
                  <div>
                    <a href="tel:+41764050567">
                      <i className="fas fa-phone-square"></i>&nbsp;+41 76 405 05 67
                    </a>
                  </div>
                  <div>
                    <a href="mailto:info@200ok.ch">
                      <i className="fas fa-envelope-square"></i>&nbsp;info@200ok.ch
                    </a>
                  </div>
                </div>
                <div className="col-lg-9">
                  <div className="row gx-5">
                    <div className="col-lg-6">
                      <div className="footer-brand">&nbsp;</div>
                      <div className="mb-3">Síguenos en redes sociales</div>
                      <div className="icon-list-social mb-5">
                        <a
                          className="icon-list-social-link"
                          target="_blank"
                          href="https://200ok.ch/atom.xml"
                          rel="noreferrer noopener"
                        >
                          <i className="fas fa-rss-square"></i>
                        </a>
                        <a
                          className="icon-list-social-link"
                          target="_blank"
                          href="https://github.com/200ok-ch/"
                          rel="noreferrer noopener"
                        >
                          <i className="fab fa-github"></i>
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <hr className="my-5" />
              <div className="row gx-5 align-items-center">
                <div className="col-md-6 small">Copyright &copy; 200ok GmbH 2022</div>
                <div className="col-md-6 text-md-end small">
                  {/* TODO: Privacy Policy could have the same design as LP */}
                  <Link to="/privacy-policy">Política de privacidad</Link>
                  &middot;
                  {/* TODO: Create a TOS */}
                  {/* <a href="/terms-of-service.html">Terms &amp; Conditions</a> */}
                </div>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </>
  );
};
