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
// Se carga con <script defer> (ver index.html, agregado 2026-08-14 — antes
// corría como script clásico sin defer/async, bloqueando el parser un
// instante en cada carga, hallazgo de auditoria-tecnica.md), justo después
// de los <link data-async-css> en el <head>: aunque con defer ya no
// necesita ejecutarse "apenas el parser lo alcanza", su dependencia real
// con esos <link> es de ORDEN EN EL DOCUMENTO (tienen que estar arriba en
// el DOM para que el querySelectorAll de abajo los encuentre), no de
// timing — así que sigue siendo seguro sin importar cuándo el navegador
// decida correr este script en concreto. El fallback de abajo cubre el
// caso (ahora más frecuente, al ejecutarse más tarde) en que el CSS ya
// haya terminado de cargar antes de que este script llegue a correr.
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
