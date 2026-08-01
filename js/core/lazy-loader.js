/* ═══════════════════════════════════════════════════════════════
   js/core/lazy-loader.js

   Motor genérico de carga bajo demanda por pantalla — fase 1 de la
   modularización (docs/auditoria-tecnica.md #4). Reemplaza, para las
   pantallas registradas en GROUPS, la carga de entrada (<script defer>
   en index.html) por una descarga la primera vez que el usuario entra
   a esa pantalla.

   Piloto: "alcancia" y "comprometida" en GROUPS por ahora (ver
   CHANGELOG.md). El resto de las pantallas sigue cargando de entrada
   como siempre — Loader.GROUPS[name] === undefined para ellas, así
   que showScreen() (sheet-stack.js) ni siquiera pasa por este archivo
   para esos casos.

   ── Por qué en orden y no en paralelo (Promise.all) ──────────────
   El patrón "parchar la función original" (const _orig = X; X =
   function(){...}) usado en spotify-personas.js/encargos-personas.js/
   prestado-personas.js/deudores-personas.js/alcancia.js exige que cada
   archivo cargue DESPUÉS de que el anterior ya haya definido lo que va
   a parchar. Cargar los archivos de un grupo en paralelo podría hacer
   que el segundo intente parchar una función que el primero todavía no
   definió. Se cargan uno por vez, en el orden declarado en GROUPS.
   ═══════════════════════════════════════════════════════════════ */

const Loader = (function () {
  // pantalla → archivos que hay que cargar, EN ESTE ORDEN, la primera
  // vez que se visita. Pantallas que no aparecen acá siguen cargando
  // de entrada (comportamiento actual, sin cambios).
  const GROUPS = {
    alcancia: ['js/modules/alcancia.js'],
    // (docs/auditoria-tecnica.md #4) Segundo grupo lazy. A diferencia de
    // Alcancía, plata_comprometida.js NO tenía su pantalla ni su ítem de
    // menú "Más" como HTML estático — los auto-inyectaba en tiempo de
    // ejecución (_injectScreen()/_injectMasItem(), ambas con guard por
    // id, así que siguen ahí sin cambios y ahora son no-op). Se copió
    // ese HTML tal cual a index.html (#screen-comprometida,
    // #mas-comprometida) para que el ítem de menú exista desde el
    // arranque — si no, no habría nada que el usuario pudiera tocar
    // para disparar la carga lazy en primer lugar. Ver CHANGELOG.md#arranque.
    comprometida: ['js/modules/plata_comprometida.js'],
    // Tercer grupo lazy. Más simple que los dos anteriores: #screen-config
    // y #mas-config YA eran HTML estático desde antes (no hubo que copiar
    // nada), y el único caller externo de una función suya (renderCatsConfig,
    // desde sheet-stack.js) ya tenía guard `typeof` desde la sesión del
    // piloto de Alcancía. import-validado.js debe cargar DESPUÉS de
    // configuracion.js (parchea leerArchivoImport a nivel superior del
    // archivo — necesita que la versión base ya exista al parsear), por
    // eso el orden dentro del array. gastos.js quedó afuera a propósito:
    // sheet-stack.js (núcleo) parchea addGastoVar/addGastoFijo a nivel
    // superior de SU propio archivo — haría lazy-loading imposible sin
    // tocar antes ese núcleo. Ver CHANGELOG.md#arranque.
    config: ['js/modules/configuracion.js', 'js/modules/import-validado.js'],
    // Cuarto grupo lazy. Entrada única: el botón "Actividad reciente"
    // dentro de Configuración (#cfg-historial-row, data-action=
    // "config:irA" con args ["historial"]) — no hay ítem en el menú
    // "Más" ni en el nav inferior, así que no hizo falta estatizar ni
    // copiar HTML (a diferencia de Plata Comprometida): #screen-historial
    // y el botón que dispara la carga ya son estáticos, y ese botón vive
    // en configuracion.js, que solo es alcanzable si Configuración ya
    // cargó — mismo prerequisito que ya existía antes de esto.
    // Requirió UN cambio real en actividad_reciente.js (no solo sacar el
    // <script>): el módulo se auto-renderizaba por DOMContentLoaded/
    // appDataLoaded/clic, los 3 eventos que con carga lazy ya pasaron
    // para cuando el archivo llega a existir — se agregó un cuarto
    // trigger sin condición de evento al final del archivo. Ver ese
    // archivo y CHANGELOG.md#arranque para el detalle.
    historial: ['js/modules/actividad_reciente.js'],
  };

  const loaded = new Set();   // grupos ya cargados (no se vuelven a pedir)
  const loading = new Map();  // grupo → Promise en curso (evita pedidos duplicados)

  function _loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('No se pudo cargar ' + src));
      document.body.appendChild(s);
    });
  }

  function ensure(group) {
    if (loaded.has(group)) return Promise.resolve();
    if (loading.has(group)) return loading.get(group);
    const files = GROUPS[group];
    if (!files) return Promise.resolve(); // grupo desconocido = no es lazy, no hay nada que cargar

    const p = files
      .reduce((chain, src) => chain.then(() => _loadScript(src)), Promise.resolve())
      .then(() => { loaded.add(group); loading.delete(group); })
      .catch(err => { loading.delete(group); throw err; });

    loading.set(group, p);
    return p;
  }

  // Puro a propósito: solo dice si ESE grupo específico ya cargó. La pregunta
  // "¿esta pantalla es lazy?" es responsabilidad de quien llama (showScreen
  // chequea Loader.GROUPS[name] aparte, antes de llamar a esto).
  function isLoaded(group) {
    return loaded.has(group);
  }

  return { ensure, isLoaded, GROUPS };
})();
