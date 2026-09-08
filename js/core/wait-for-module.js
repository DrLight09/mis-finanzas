// js/core/wait-for-module.js
//
// Misma función que js/core/wait-for.js, pero como ES module de verdad
// (`export`), para pin-bio.js/firebase-sync.js — que cargan
// `type="module" async`, sin garantía de orden frente a un <script defer>
// clásico. Se consume con `import { waitFor } from './wait-for-module.js'`
// — nunca tiene su propio <script> en index.html, solo existe como
// dependencia de esos dos módulos. Un `import` de ES module se resuelve
// garantizado (se descarga y ejecuta antes de correr el código de nivel
// superior del módulo que importa) sin depender de ningún orden de
// <script> en el documento.
//
// Es la misma función que wait-for.js escrita dos veces a propósito, en vez
// de un solo archivo compartido entre los dos tipos de script: un intento
// anterior de unificarlos en un solo archivo híbrido rompió en producción
// con `ReferenceError: waitFor is not defined` en los consumidores
// clásicos — ver el comentario en js/core/wait-for.js y
// CHANGELOG.md#infraestructura--seguridad para el detalle completo.
//
// Uso: import { waitFor } from './wait-for-module.js';
//      waitFor(() => typeof miFuncion === 'function', () => miFuncion());
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
