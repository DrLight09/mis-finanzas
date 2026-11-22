// js/core/wait-for.js
//
// Centraliza el patrón "reintentar hasta que una función/condición exista". Lo importan personas-init.js, pin-bio.js y firebase-sync.js
// (antes había una segunda copia, wait-for-module.js, mientras unos archivos eran scripts clásicos y otros módulos: con todo en módulos ES
// un solo archivo sirve a todos, y el `import` garantiza que existe antes de que corra quien lo usa).
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
import { exponerGlobales, exponerVariables } from './puente.js';
// Puente global (js/core/puente.js): las funciones se hoistean, así que quedan en window desde el principio.
exponerGlobales({ waitFor });

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
