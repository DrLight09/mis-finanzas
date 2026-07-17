/* ═══════════════════════════════════════════════════════════════
   js/core/events.js

   Sistema centralizado de eventos. Reemplaza los onclick="..." inline
   (bloqueados por una CSP estricta) por un único listener delegado en
   `document`, compartido por TODA la app.

   Objetivo: cada módulo (spotify.js, mesada.js, ...) registra sus
   propios handlers con Events.on(...), en vez de crear su propio
   addEventListener delegado. Un solo despachador, cero duplicación.

   ── Cómo usarlo desde un módulo ──────────────────────────────────

   1. Registrar el handler UNA vez (al cargar el archivo del módulo):

        Events.on('spotify:marcarPago', marcarPagoSpotify);

      Convención de nombres: "modulo:accion" — el namespace evita que
      dos módulos elijan sin querer el mismo nombre de acción.

   2. Al armar el HTML (template strings), en vez de:

        `<span onclick="marcarPagoSpotify(${i})">...`

      escribir:

        `<span ${Events.attr('spotify:marcarPago', i)}>...`

      Events.attr() arma el data-action + data-args (JSON, escapado
      para que sea seguro embeberlo en un atributo HTML) — no hace
      falta escribir el escapado a mano en cada sitio.

   3. Los argumentos le llegan al handler en el mismo orden en que se
      pasaron a Events.attr(), tal cual estaban en la función original:

        Events.on('spotify:marcarPago', marcarPagoSpotify);
        // <span data-action="spotify:marcarPago" data-args="[3]">
        // → marcarPagoSpotify(3)

   4. Si un módulo tiene varias acciones, en vez de repetir Events.on()
      una por una, se puede registrar el lote entero de un saque con
      Events.registerAll(namespace, mapa) — mismo resultado, menos
      repetición:

        Events.registerAll('spotify', {
          marcarPago: marcarPagoSpotify,
          editar: editarSpotify,
          eliminar: deleteSpotify,
        });
        // equivale a registrar 'spotify:marcarPago', 'spotify:editar'
        // y 'spotify:eliminar' con Events.on(), una por una.

      Importante: esto es solo azúcar sintáctico sobre `on()` — el
      registro sigue siendo el mismo objeto plano de siempre. Events
      NUNCA acumula lógica de ningún módulo; solo sabe despachar
      clicks a quien se haya registrado. Si en algún momento este
      archivo empieza a tener un `if (namespace === 'spotify')` o un
      `switch` con casos por módulo, algo se torció — ese conocimiento
      le pertenece a cada modules/*.js, nunca a este archivo.

   Si un handler necesita el propio elemento clickeado o el evento,
   Events se los pasa SIEMPRE al final, como tercer/cuarto argumento
   extra — no rompe funciones existentes que no los esperan:

        function marcarPagoSpotify(i, el, evt) { ... }

   ── data-stop-propagation ────────────────────────────────────────
   Si un elemento con data-action está anidado dentro de otro elemento
   clickeable (ej. un botón "eliminar" dentro de una fila que también
   navega al detalle), agregar data-stop-propagation="true" para que
   Events llame a evt.stopPropagation() antes de despachar.
   ═══════════════════════════════════════════════════════════════ */

const Events = (function () {
  const registry = {};

  /**
   * Registra el handler de una acción. Si la acción ya existía, se
   * avisa por consola en vez de fallar en silencio — normalmente es
   * indicio de un módulo que se cargó dos veces o un nombre repetido
   * por accidente entre dos módulos.
   */
  function on(action, handler) {
    if (typeof handler !== 'function') {
      console.error(`[Events] El handler para "${action}" no es una función.`);
      return;
    }
    if (registry[action]) {
      console.warn(`[Events] La acción "${action}" ya estaba registrada — se sobrescribe.`);
    }
    registry[action] = handler;
  }

  /**
   * Arma el par data-action/data-args listo para insertar en un
   * template string. Los argumentos se serializan a JSON y se pasan
   * por escHtml() (ya definida en el núcleo de la app) para que el
   * atributo quede seguro aunque algún argumento sea texto libre.
   */
  function attr(action, ...args) {
    const json = JSON.stringify(args);
    const safeJson = (typeof escHtml === 'function') ? escHtml(json) : json;
    return `data-action="${action}" data-args="${safeJson}"`;
  }

  function dispatch(evt) {
    const el = evt.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    const handler = registry[action];
    if (!handler) {
      console.warn(`[Events] No hay handler registrado para la acción "${action}".`);
      return;
    }
    if (el.dataset.stopPropagation === 'true') evt.stopPropagation();
    let args = [];
    if (el.dataset.args) {
      try {
        args = JSON.parse(el.dataset.args);
      } catch (e) {
        console.error(`[Events] data-args inválido en la acción "${action}":`, el.dataset.args, e);
      }
    }
    handler(...args, el, evt);
  }

  /**
   * Azúcar sintáctico sobre on(): registra varias acciones de un mismo
   * módulo de una sola vez. mapa = { nombreAccion: handler, ... }.
   */
  function registerAll(namespace, mapa) {
    Object.keys(mapa || {}).forEach(key => on(`${namespace}:${key}`, mapa[key]));
  }

  document.addEventListener('click', dispatch);

  return { on, attr, registerAll };
})();
