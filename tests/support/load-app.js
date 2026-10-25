'use strict';
const fs = require('fs');
const vm = require('vm');
const { createDocumentStub } = require('./dom-stub');

/**
 * Carga uno o más .js de la app REAL (sin copiar ni modificar nada) en un
 * contexto vm aislado, igual que el navegador carga <script defer>
 * clásicos: todos comparten el mismo scope léxico de nivel superior
 * (let/const de un archivo son visibles en los siguientes que se cargan
 * después, en el mismo contexto), y las `function` de nivel superior
 * cuelgan de `window` automáticamente — mismo patrón que usa la app real
 * (ver core-state.js: "No exportar como type=module: el resto del
 * archivo depende de que estas sean variables globales léxicas normales
 * de script clásico").
 *
 * Es la misma técnica que ya usás para validar con jsdom en la auditoría
 * técnica (ver auditoria-tecnica.md) — acá queda como test permanente en
 * vez de una pasada puntual, y sin tocar ningún archivo de producción.
 *
 * @param {string[]} appFiles     Rutas absolutas de los .js a cargar, en orden.
 * @param {object}   [options]
 * @param {boolean}  [options.permissive=false]  Si true, cualquier global
 *                    no definida (funciones de UI de otros archivos core
 *                    que no cargaste, ej. openSheet/toast/dialogo) cae a
 *                    un no-op en vez de ReferenceError. Necesario para
 *                    cargar cuentas.js/prestado.js sueltos. NO lo uses en
 *                    tests que dependen de que una función NO exista
 *                    (los tests de guard con `typeof X==='function'`
 *                    fallan si activás esto, porque todo pasa a ser
 *                    "function") — para esos, dejalo en false.
 * @returns {object}              El contexto vm. Ej: ctx.calcPatrimonioTotal(),
 *                                 ctx.S, ctx.window (=== ctx).
 */
function loadApp(appFiles, options = {}) {
  const { permissive = false } = options;
  const sandbox = {
    console,
    Math, Date, JSON, Object, Array, String, Number, Boolean, RegExp, Error,
    Set, Map, Promise,
    parseInt, parseFloat, isNaN, isFinite, Infinity, NaN,
    encodeURIComponent, decodeURIComponent,
    setTimeout, clearTimeout, setInterval, clearInterval,
    document: createDocumentStub(),
    localStorage: createLocalStorageStub(),
    navigator: { onLine: true },
    location: { href: 'https://drlight09.github.io/mis-finanzas/' },
    // Stub de js/core/events.js (sistema centralizado data-action /
    // Events.registerAll — no incluido en este harness). Los módulos lo
    // llaman al cargar para registrar su wiring de delegación de eventos;
    // ninguna de las funciones de cálculo bajo test lo usa.
    Events: {
      registerAll() {},
      on() {},
      attr() { return ''; },
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  // core-state.js llama window.addEventListener('beforeunload', ...) a
  // nivel de módulo (línea ~940, guardado de emergencia al cerrar pestaña).
  sandbox.addEventListener = function () {};
  sandbox.removeEventListener = function () {};

  // ── Fallback para globals no cargadas (opt-in, ver `permissive`) ───
  // cuentas.js/prestado.js referencian por nombre corto, a nivel de
  // módulo (dentro de Events.registerAll(...) y wiring de listeners),
  // funciones de UI que viven en otros archivos core que este harness
  // NO carga (openSheet/closeSheet/toast/dialogo — sheet-stack.js /
  // events.js). Sin esto, cargarlos revienta con un ReferenceError
  // distinto por cada función de UI que no conocemos.
  let context = sandbox;
  if (permissive) {
    const handler = {
      get(target, prop, receiver) {
        if (prop in target || typeof prop === 'symbol') return Reflect.get(target, prop, receiver);
        return function () {};
      },
      has() { return true; },
    };
    context = new Proxy(sandbox, handler);
  }

  vm.createContext(context);

  for (const file of appFiles) {
    const code = fs.readFileSync(file, 'utf8');
    vm.runInContext(code, context, { filename: file });
  }

  return sandbox;
}

function createLocalStorageStub() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

module.exports = { loadApp };
