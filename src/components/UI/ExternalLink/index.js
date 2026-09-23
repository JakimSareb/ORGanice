import React from 'react';

// ORG Mode para Eli: solo se enlazan esquemas seguros (evita enlaces javascript: y similares
// en ficheros .org). El resto se muestra como texto.
const SAFE = /^(https?:|mailto:|tel:)/i;

export default ({ href, children }) => {
  if (!href || !SAFE.test(String(href).trim())) {
    return <span className="external-link--blocked">{children ? children : href}</span>;
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children ? children : href}
    </a>
  );
};
