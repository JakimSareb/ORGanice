// Restaura las variables de color del tema antes de cargar el CSS (evita un parpadeo).
// Está en un fichero aparte porque la política de seguridad (CSP) prohíbe scripts en línea.
try {
  var v = localStorage.getItem('themeVariables');
  if (v) {
    var vars = JSON.parse(v);
    var s = document.documentElement.style;
    for (var k in vars) s.setProperty(k, vars[k]);
  }
} catch (e) {}
