// ORG Mode para Eli: si una parte de la app falla, se muestra el error (y cómo salir) en vez de
// dejar la pantalla en blanco/negro.
import React, { Component } from 'react';

export default class EliErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('ORGanice:', error, info && info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const { onClose, label = 'esta ventana' } = this.props;
    const detail = `${(error && (error.message || String(error))) || 'Error desconocido'}`;
    return (
      <div className="eli-error" role="alert" data-testid="eli-error">
        <div className="eli-error__title">
          <i className="fas fa-exclamation-triangle" /> Algo ha fallado en {label}
        </div>
        <pre className="eli-error__detail">{detail}</pre>
        <div className="eli-error__buttons">
          {onClose && (
            <button
              className="btn"
              onClick={() => {
                this.setState({ error: null });
                onClose();
              }}
            >
              Cerrar
            </button>
          )}
          <button className="btn" onClick={() => window.location.reload()}>
            Recargar la app
          </button>
        </div>
      </div>
    );
  }
}
