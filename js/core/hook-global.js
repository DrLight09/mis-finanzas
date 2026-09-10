// js/core/hook-global.js
//
// Centraliza el patrón "capturar la función global original, envolverla,
// y esperar si todavía no existe" — antes reimplementado a mano, casi
// idéntico, en gastos-fijos-progress.js (refresh), mejoras.js (refresh),
// mejoras-adicionales.js (openSheet) y mas-menu.js (applyModulos). Mismo
// espíritu que crearSplitWidget() en split.js: no es el primer archivo que
// resuelve esto, es la tercera/cuarta vez que aparecía el mismo problema y
// ya ameritaba sacarlo a un solo lugar (a diferencia de color-picker.js,
// donde la duplicación real era de una sola línea y montar un motor ahí sí
// hubiera sido sobre-ingeniería).
//
// NO reemplaza a Events (js/core/events.js): Events es un dispatcher de
// clicks, un solo handler por acción, y avisa+pisa si registrás la misma
// acción dos veces — a propósito, porque su modelo es "un click, un
// handler". hookGlobal() resuelve el caso contrario: varios módulos
// independientes que quieren enterarse de la MISMA función global (varios
// listeners para 'refresh', por ejemplo) sin pisarse entre sí. Mezclar
// ambos hubiera forzado a Events a hacer algo para lo que no está pensado.
//
// Uso (idéntico al de waitFor, que usa por debajo):
//   hookGlobal('refresh', miFuncion);
//   hookGlobal('openSheet', miFuncion, { intervalMs: 100 });
//
// Si window[name] ya es una función, se envuelve de inmediato. Si todavía
// no existe, espera con waitFor() (mismas opciones: intervalMs, maxAttempts,
// onGiveUp) y envuelve apenas aparezca. En ambos casos, fn recibe los
// mismos argumentos con los que se llamó a window[name] — igual que
// aplicaban `.apply(this, arguments)` los wraps manuales que reemplaza.
//
// Depende de waitFor() (js/core/wait-for.js, carga antes). Para módulos
// type="module" (pin-bio.js, firebase-sync.js) existe la versión ES module
// aparte, js/core/hook-global-module.js — mismo motivo de la duplicación
// que ya explica js/core/wait-for.js (un intento anterior de compartir un
// solo archivo entre <script defer> clásicos y type="module" async rompió
// en producción con un ReferenceError de orden de carga).
function hookGlobal(name, fn, opts) {
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
