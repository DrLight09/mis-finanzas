/* ═══════════════════════════════════════════════════════════════
   js/core/lazy-loader.js

   Motor genérico de carga bajo demanda por pantalla — fase 1 de la
   modularización (docs/auditoria-tecnica.md #4). Reemplaza, para las
   pantallas registradas en GROUPS, la carga de entrada (<script defer>
   en index.html) por una descarga la primera vez que el usuario entra
   a esa pantalla.

   Piloto: solo "alcancia" está en GROUPS por ahora (ver CHANGELOG.md).
   El resto de las pantallas sigue cargando de entrada como siempre —
   Loader.GROUPS[name] === undefined para ellas, así que showScreen()
   (sheet-stack.js) ni siquiera pasa por este archivo para esos casos.

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
