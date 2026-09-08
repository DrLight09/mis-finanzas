// js/core/wait-for.js
//
// Centraliza el patrón "reintentar hasta que una función/condición exista",
// que estaba reimplementado a mano con setInterval/setTimeout + su propio
// criterio de reintento en 7 sitios distintos: personas-init.js, mejoras.js,
// mejoras-adicionales.js (los 3 primeros en consolidarse, ver
// CHANGELOG.md#infraestructura--seguridad) y, desde esta sesión, también
// pin-bio.js (registro de Events('pin',...), hook de refresh()) y
// firebase-sync.js (_runWhenEventListenersReady, registro de
// Events('authgate',...)). Mismo motivo que ya llevó a centralizar Events
// (clicks) y _esGastoVarNoReal()/_esEntradaEspejoNoIngreso() (qué es gasto/
// ingreso real): una sola fuente de verdad en vez de N copias que pueden
// divergir sin querer.
//
// ── Por qué este archivo es un ES module (no un <script> clásico) ────────
// La primera consolidación (solo personas-init.js/mejoras.js/mejoras-
// adicionales.js, los 3 que cargan `defer` clásico) dejó afuera a propósito
// los reintentos de pin-bio.js/firebase-sync.js: esos dos cargan
// `type="module" async`, sin garantía de orden frente a un `<script defer>`
// — depender de un `waitFor` global habría cambiado un polling duplicado
// por un `ReferenceError` intermitente si este archivo no había terminado
// de cargar todavía.
//
// La solución no es "confiar en el orden", es no necesitar orden: un
// `import` de ES module SIEMPRE se resuelve (se descarga y ejecuta el
// módulo importado) antes de que corra el código de nivel superior del
// módulo que importa — es una garantía del propio sistema de módulos,
// independiente del atributo `async` del `<script>` que lo cargó. Por eso
// este archivo exporta `waitFor` de verdad (`export function`), y
// pin-bio.js/firebase-sync.js lo consumen con `import { waitFor } from
// './wait-for.js'` en vez de asumir un global ya cargado.
//
// Al mismo tiempo, personas-init.js/mejoras.js/mejoras-adicionales.js siguen
// siendo `<script>` clásicos (no conviene convertirlos a módulo solo por
// esto) y llaman a `waitFor(...)` como identificador global sin `import` —
// por eso este archivo TAMBIÉN cuelga la función de `window.waitFor` al
// final. El navegador deduplica por URL resuelta: aunque el módulo se
// referencie una vez por `<script type="module" src="...">` (para que
// corra y setee el global) y otra vez por `import` desde otros dos
// archivos, se descarga y ejecuta una sola vez — nunca dos.
//
// Carga como `<script type="module">` (sin `defer`: los módulos ya se
// comportan como deferred por defecto) en la misma posición que antes
// tenía como `<script defer>` — después de calc-helpers.js, antes de
// cualquier otro `defer`/módulo que lo necesite.
//
// Uso desde un <script> clásico (defer):
//   waitFor(() => typeof miFuncion === 'function', () => miFuncion());
//
// Uso desde un ES module:
//   import { waitFor } from './wait-for.js';
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
export function waitFor(checkFn, callback, opts) {
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

// Exponer también como global para los <script> clásicos (defer) que lo
// consumen como identificador bare, sin import: personas-init.js,
// mejoras.js, mejoras-adicionales.js.
window.waitFor = waitFor;
