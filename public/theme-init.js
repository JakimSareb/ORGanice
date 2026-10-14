// Restaura las variables de color del tema antes de cargar el CSS (evita un parpadeo).
// Está en un fichero aparte porque la política de seguridad (CSP) prohíbe scripts en línea.
try {
  var v = localStorage.getItem('themeVariables');
  if (v) {
    var vars = JSON.parse(v);
    var s = document.documentElement.style;
    for (var k in vars) s.setProperty(k, vars[k]);
  }
  // (3.05) nombre del tema y claro/oscuro (retoques propios de cada tema en CSS)
  var a = JSON.parse(localStorage.getItem('themeAttrs') || 'null');
  if (a && a.length === 2) {
    document.documentElement.setAttribute('data-eli-theme', a[0]);
    document.documentElement.setAttribute('data-eli-scheme', a[1]);
  }
} catch (e) {}
