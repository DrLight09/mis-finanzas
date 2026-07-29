// js/core/async-css.js
//
// Reemplaza el onload="this.media='all'" inline que tenían los <link> de
// Font Awesome y Google Fonts en el <head> de index.html — técnica estándar
// para cargar CSS sin bloquear el render (el navegador descarga el archivo
// igual, con media="print" no lo aplica hasta que este script lo cambia a
// "all" una vez que terminó de bajar).
//
// El atributo onload="..." es un event handler inline: la CSP lo bloquea
// igual que bloquearía un <script> inline, aunque viva en un <link> y no en
// un <script> — se detectó recién al probar en navegador real después de
// sacar 'unsafe-inline' de script-src (ver CHANGELOG.md#infraestructura--seguridad,
// entrada de esta sesión). El barrido anterior de "0 atributos onclick/
// onchange/oninput/hover inline" nunca cubrió onload porque no es uno de
// esos cuatro — punto ciego real, no un falso positivo.
//
// Se carga como <script src> clásico, sin defer/async, justo después de los
// <link data-async-css> en el <head>: al no bloquear en sí (es un archivo
// chico) pero sí ejecutarse en orden de documento, corre antes de que
// cualquiera de los dos CSS (mucho más pesados) termine de descargar, así
// que alcanza a enganchar el listener 'load' a tiempo en la enorme mayoría
// de los casos. El fallback de abajo cubre el caso raro en que ya haya
// terminado de cargar (ej. viene de caché HTTP) antes de que este script
// llegue a ejecutarse.
(function () {
  document.querySelectorAll('link[data-async-css]').forEach(function (link) {
    if (link.media === 'all') return; // ya se activó (poco probable en este punto)
    link.addEventListener('load', function () {
      link.media = 'all';
    }, { once: true });
    // Fallback: si por lo que sea el CSS ya terminó de cargar antes de que
    // este script corriera, `.sheet` ya existe (mismo origen — cdnjs/fonts
    // googleapis no tienen problema de CORS para leer esta propiedad, a
    // diferencia de .cssRules, que no usamos acá).
    try {
      if (link.sheet) link.media = 'all';
    } catch (e) {
      // No debería pasar (no leemos .cssRules), pero por si acaso no
      // rompemos el arranque de la app por esto.
    }
  });
})();
