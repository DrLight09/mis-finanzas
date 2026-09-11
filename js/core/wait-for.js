// js/core/wait-for.js
//
// Centraliza el patrón "reintentar hasta que una función/condición exista"
// para los <script> CLÁSICOS (defer). Consumidores directos hoy:
// personas-init.js y js/core/hook-global.js (que a su vez lo usa por
// debajo de hookGlobal() para gastos-fijos-progress.js/mas-menu.js/
// mejoras-adicionales.js — ver ese archivo). Antes de existir hookGlobal(),
// mejoras.js y mejoras-adicionales.js (hoy fusionados en un solo archivo,
// mejoras-adicionales.js) también llamaban a waitFor() directamente; cada
// uno reimplementaba a mano su propio setInterval/setTimeout + contador de
// reintentos antes de que este archivo existiera (ver
// CHANGELOG.md#infraestructura--seguridad).
//
// NOTA — por qué NO es un ES module (corrección tras un intento fallido):
// La primera versión de este archivo intentó ser un solo archivo híbrido
// (`export function waitFor` + `window.waitFor = waitFor`) para servir
// también a pin-bio.js/firebase-sync.js vía `import`. Eso rompió en
// producción con `ReferenceError: waitFor is not defined` en
// personas-init.js — el global no estaba listo cuando el script clásico
// corrió, pese a aparecer antes en el documento. En vez de perseguir la
// causa exacta (pudo ser orden real módulo-vs-defer, un 404 de despliegue,
// o ambos), se separó en dos archivos independientes que no comparten
// ninguna suposición de orden entre sí:
//   - este archivo (js/core/wait-for.js): <script defer> clásico, para
//     los 3 consumidores que también son <script defer> clásicos.
//   - js/core/wait-for-module.js: ES module aparte, para pin-bio.js/
//     firebase-sync.js (que cargan type="module" async), consumido con
//     `import` — nunca con un <script> propio, solo como dependencia.
// Es la misma función escrita dos veces (15 líneas), a propósito: preferible
// a una unificación "inteligente" que ya demostró romperse.
//
// Uso:
//   waitFor(() => typeof miFuncion === 'function', () => miFuncion());
//
//   waitFor(checkFn, callback, {
//     intervalMs: 200,   // default 200
//     maxAttempts: 25,   // default Infinity (reintenta indefinidamente)
//     onGiveUp: () => {} // opcional — solo se llama si se agota maxAttempts sin éxito
//   });
//
// checkFn: función sin argumentos que devuelve true/false (o cualquier
//          valor truthy/falsy). Si checkFn tiene efecto secundario propio
//          (ej. _registrarEventosPin(), que registra Y devuelve el
//          resultado), waitFor solo lo LLAMA repetidamente — no lo envuelve
//          ni lo modifica.
// callback: se llama UNA sola vez, apenas checkFn() da true. No recibe argumentos.
function waitFor(checkFn, callback, opts) {
  opts = opts || {};
  const intervalMs = opts.intervalMs != null ? opts.intervalMs : 200;
  const maxAttempts = opts.maxAttempts != null ? opts.maxAttempts : Infinity;
  let intentos = 0;

  function _tick() {
    if (checkFn()) {
      callback();
      return;
    }
    intentos++;
    if (intentos >= maxAttempts) {
      if (typeof opts.onGiveUp === 'function') opts.onGiveUp();
      return;
    }
    setTimeout(_tick, intervalMs);
  }

  _tick();
}
