// js/core/hook-global-module.js
//
// Misma función que js/core/hook-global.js, pero como ES module de verdad
// (`export`), para pin-bio.js — que carga `type="module" async`, sin
// garantía de orden frente a un <script defer> clásico. Se consume con
// `import { hookGlobal } from './hook-global-module.js'` — nunca tiene su
// propio <script> en index.html, solo existe como dependencia de esos
// módulos.
//
// Es la misma duplicación intencional que ya existe entre wait-for.js y
// wait-for-module.js (ver el comentario de cabecera de wait-for.js para el
// porqué completo: un intento anterior de unificar todo en un solo archivo
// híbrido rompió en producción con `ReferenceError: waitFor is not
// defined` en los consumidores clásicos). hookGlobal() depende de waitFor()
// exactamente igual que sus wraps manuales anteriores en pin-bio.js ya
// dependían de la versión importada de waitFor — así que este archivo
// importa de wait-for-module.js, nunca asume el global de wait-for.js.
//
// Uso: import { hookGlobal } from './hook-global-module.js';
//      hookGlobal('refresh', miFuncion);
import { waitFor } from './wait-for-module.js';

export function hookGlobal(name, fn, opts) {
  function attach() {
    const orig = window[name];
    window[name] = function () {
      if (orig) {
        try { orig.apply(this, arguments); }
        catch (e) { console.error(`[hookGlobal:${name}] Error en la función original:`, e); }
      }
      fn.apply(this, arguments);
    };
  }
  if (typeof window[name] === 'function') {
    attach();
  } else {
    waitFor(() => typeof window[name] === 'function', attach, opts);
  }
}
