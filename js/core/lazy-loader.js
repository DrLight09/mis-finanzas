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
  // false hasta que ensureAll() (precarga en segundo plano de todos los
  // grupos lazy) termine — ver _iniciarEnsureAll() más abajo. La lee
  // inicio.js (renderAttencion) para no comparar un fingerprint parcial.
  window._appFullyLoaded = false;

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
    // Quinto grupo lazy (2026-08-02). #screen-mesada y #mas-mesada ya eran
    // HTML estático desde antes, así que no hubo que copiar/inyectar nada
    // (mismo caso que Configuración/Actividad Reciente, a diferencia de
    // Plata Comprometida). No requirió ningún cambio dentro de mesada.js:
    // su wiring de botones (btn-anio-prev, btn-confirmar-mesada, etc.) ya
    // corría top-level contra ids del DOM estático sin esperar
    // DOMContentLoaded (mismo patrón seguro que ya usaba alcancia.js), y no
    // monkey-patchea ninguna función ajena. Su único caller externo
    // conocido, inicio.js (getMesadaData/_getCuotaAnio en renderAttencion/
    // calcHealthScore), ya tenía guard typeof desde la sesión anterior —
    // ver auditoria-tecnica.md #4. Sin verificar: si analisis.js (no
    // auditado a este nivel) también llama alguna función de mesada.js sin
    // guard — queda anotado como hallazgo abierto, no investigado acá.
    mesada: ['js/modules/mesada.js'],
    // Sexto grupo lazy (2026-08-02, ronda de resolver de raíz el acoplamiento
    // spotify↔tarjetas_credito). A diferencia de los 5 anteriores, este no
    // partió de "¿cuál es la próxima pantalla candidata?" sino de un bug de
    // acoplamiento ya encontrado: spotify.js llamaba funciones de
    // tarjetas_credito.js (getTCById/tcCupoDisponible/tcRecalcular) asumiendo
    // que ya estaba cargado porque siempre cargaba eager. En vez de solo
    // documentar la decisión de producto, se resolvió de raíz: tarjetas_credito
    // pasa a ser lazy de verdad, y los 3 puntos en spotify.js (más 2 en
    // movimientos.js: tcEliminarCompraInterna/tcEliminarPagoInterna) ya esperan
    // Loader.ensure('tarjetas') antes de usar esas funciones — ver
    // js/modules/spotify.js (_spEnsureTC) y js/core/movimientos.js.
    // #screen-tarjetas y #mas-tarjetas ya eran HTML estático (mismo caso que
    // Mesada/Configuración). Sí requirió 2 cambios reales dentro del propio
    // archivo (ver su header): el wiring de botones que esperaba
    // 'DOMContentLoaded' se corrigió a top-level (mismo fix que
    // actividad_reciente.js), y tcNormalizarTarjetas()/renderTCDashboard()
    // (llamadas desde refresh()/save() en core-state.js, no desde acá) ya
    // tienen guard typeof — confirmado con el archivo real, ver
    // auditoria-tecnica.md. Su wrapper de abrirDetalleMov (Events.registerAll
    // más abajo en el archivo) ya resolvía el nombre en tiempo de click, no
    // de carga, así que es lazy-safe sin tocarlo. Efecto secundario aceptado,
    // no corregido: el parche a window.mostrarAlertaFuente al final del
    // archivo (hint "se carga a la TC" al elegir una tarjeta como fuente en
    // Gastos/Encargos/Préstamos) no aplica hasta que el usuario visite
    // Tarjetas por primera vez — el hint simplemente no aparece hasta
    // entonces, no rompe nada.
    tarjetas: ['js/modules/tarjetas_credito.js'],
    // Séptimo a undécimo grupo lazy (ronda de modularización de spotify/
    // prestado/cuentas/analisis/encargos — ver auditoria-tecnica.md). Los 5
    // se auditaron línea por línea contra el mismo criterio de siempre
    // (código de nivel superior sin dependencia real de orden de carga,
    // llamadas cruzadas a otros módulos de dominio con guard typeof) y
    // aparecieron confirmados seguros en todos los casos SALVO dos bugs
    // reales, ya corregidos como parte de esta misma ronda:
    // 1. openSheet() en spotify.js estaba envuelto en un listener
    //    DOMContentLoaded que, con carga lazy, nunca dispara (el evento ya
    //    pasó) — se corrigió a top-level, ver cabecera de ese bloque en
    //    spotify.js.
    // 2. sheet-stack.js (núcleo, siempre eager) tenía dos referencias sin
    //    guard a globales de estos módulos que corrían en CADA llamada a
    //    showScreen(), no solo al entrar a esas pantallas: el bloque de
    //    reset de Préstamos (deudorActualId/miDeudaActualId/
    //    prestamosTabActiva) y la captura de addSpotify dentro de
    //    _injectErrorSpans(). Ambos ya tienen guard typeof — ver
    //    sheet-stack.js.
    // #screen-spotify/#screen-prestamos/#screen-cuentas/#screen-encargos ya
    // eran HTML estático desde antes (mismo caso que Mesada/Tarjetas), y
    // #screen-analisis vive dentro de "Más", también estático — ninguno
    // necesitó copiar/inyectar HTML. Se agregaron ramas de re-render en
    // showScreen() (sheet-stack.js) para spotify y prestamos, replicando el
    // fix que ya se había hecho para tarjetas — cuentas/encargos/analisis ya
    // las tenían desde antes (antes de volverse lazy, esas ramas ya
    // corrían, solo que sobre un módulo cargado de entrada).
    spotify: ['js/modules/spotify.js'],
    prestamos: ['js/modules/prestado.js'],
    // cuentas: REACTIVADO como lazy (2026-08-13, segundo intento). El primer
    // intento se revirtió por 3 ReferenceError encadenados al arrancar
    // (nuTotal/getNuTasaGlobal/_renderTasaHistorialTag llamados sin guard
    // desde core-state.js y firebase-sync.js). Se recibieron y auditaron
    // los 5 archivos núcleo que faltaban (core-state.js, firebase-sync.js,
    // pin-bio.js, gastos-fijos-progress.js, mejoras.js): los tres puntos
    // del error, más calcC/calcCDT/materializarIntereses/
    // registrarTasaNuHistorial/verificarVencimientosCDT (todo lo demás que
    // cuentas.js expone y que estos archivos llegan a tocar), ya tienen
    // guard `typeof` — confirmado contra el código real, no por inferencia.
    // pin-bio.js/mejoras.js/gastos-fijos-progress.js no llaman ninguna
    // función de cuentas.js. Ver auditoria-tecnica.md, corrección del
    // 2026-08-13.
    cuentas: ['js/modules/cuentas.js'],
    analisis: ['js/modules/analisis.js'],
    encargos: ['js/modules/encargos.js'],
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

  // ── Precarga total en segundo plano ───────────────────────────────────────
  // Por qué existe: "Necesita atención" en Inicio (inicio.js) depende de
  // funciones de Préstamos/Tarjetas/Mesada/Spotify — todas lazy. Sin esto,
  // esa sección solo se completa a medida que el usuario visita cada
  // pantalla a mano, y un ítem pendiente real (ej. "Hermanito te debe
  // $630.000") puede quedar invisible por sesiones enteras si nunca se
  // entra a Préstamos. Se decidió explícitamente NO forzar la carga desde
  // dentro de inicio.js/renderAttencion() (eso reintroduciría el problema
  // que la modularización por pantalla buscaba resolver: bloquear Inicio
  // con el peso de TODOS los módulos). En cambio, se precarga todo en
  // PARALELO (no uno por uno) recién después de que la app ya pintó y
  // cargó datos reales — así el primer pintado de Inicio sigue tan rápido
  // como con los 11 grupos lazy, y el costo de red se paga una sola vez,
  // en segundo plano, sin bloquear nada visible.
  //
  // Dentro de cada grupo los archivos siguen cargando en orden (ver
  // ensure() arriba, sigue aplicando el motivo del header de este
  // archivo); ENTRE grupos no hay dependencia de orden — cada pantalla es
  // independiente — así que sí se piden todas a la vez.
  function ensureAll() {
    return Promise.all(Object.keys(GROUPS).map(g => ensure(g).catch(() => {})));
  }

  // FIX (2026-08-17, confirmado con dos corridas reales de Lighthouse — ver
  // CHANGELOG.md#infraestructura--seguridad): el disparo inmediato de acá
  // abajo SÍ contaba dentro de la ventana que Lighthouse mide como Total
  // Blocking Time. Prueba encontrada en los propios reportes: "Avoid long
  // main-thread tasks" mostraba tareas de cuentas.js/plata_comprometida.js/
  // alcancia.js/import-validado.js corriendo varios segundos después del
  // primer pintado (una de 106ms a los 8.6s de carga), y "Reduce unused
  // JavaScript" marcaba cuentas.js con 76% de su peso sin usar — confirma
  // que ensureAll() se estaba disparando y ejecutando adentro de la ventana
  // auditada, no "de verdad en segundo plano" como asumía el diseño
  // original (comentario de abajo, sin tocar por valor histórico).
  //
  // Se reemplaza el disparo inmediato por requestIdleCallback: es la
  // semántica correcta para "trabajo de fondo que no debe competir con
  // nada" — el navegador lo corre solo cuando el hilo principal está
  // realmente libre, cediendo el paso a cualquier interacción real del
  // usuario que llegue primero (un tap en un nav-item, por ejemplo).
  // timeout:5000 garantiza que igual corra si el hilo nunca queda idle por
  // su cuenta — mismo patrón de "timeout de seguridad" que ya usa el resto
  // de la app (window._pinGateTimeout, window._authgateReadyTimeout en
  // firebase-init.js). Fallback a setTimeout para Safari (sin soporte de
  // requestIdleCallback al momento de escribir esto).
  //
  // Nota honesta, no prometer de más: en la corrida de Lighthouse en sí
  // (una pestaña sola, sin otra interacción real compitiendo) es posible
  // que requestIdleCallback dispare casi enseguida igual, porque ahí no
  // hay ningún otro trabajo esperando el hilo principal — así que el
  // número de TBT podría no bajar mucho en ese entorno sintético
  // específico. El beneficio real es para un usuario de verdad, que sí
  // puede estar tocando algo justo en ese momento.
  function _iniciarEnsureAll() {
    ensureAll().then(() => {
      // Bandera global: recién acá `items` de renderAttencion() (inicio.js)
      // queda completo — antes de esto, algunos de sus datos (Préstamos/
      // Spotify/Tarjetas/Mesada) pueden faltar por no haber cargado todavía,
      // ver CHANGELOG.md#sheets--ui. inicio.js la lee para no comparar/guardar
      // un fingerprint parcial contra el completo de la sesión anterior.
      window._appFullyLoaded = true;
      if (typeof refresh === 'function') refresh();
      if (typeof applyModulos === 'function') applyModulos();
    });
  }

  // Disparo automático, una sola vez por carga de página: apenas termina
  // la primera carga real de datos (evento 'appDataLoaded', ver
  // firebase-sync.js#_finishFirstLoad — se dispara tanto con datos de la
  // nube como en el camino de error/sin conexión, así que cubre ambos
  // casos). Al terminar, un solo refresh()/applyModulos() para que
  // "Necesita atención" (y cualquier otra cosa que dependía de un módulo
  // lazy) se actualice sola, sin que el usuario tenga que tocar nada ni
  // volver a entrar a Inicio.
  // Descartado (2026-08-17, sesión de investigación del punto 12 de
  // auditoria-tecnica.md): se probó acá un guard con MutationObserver sobre
  // #pin-screen.open, bajo la hipótesis de que _iniciarEnsureAll podía
  // disparar mientras el PIN seguía sin desbloquear. Se revirtió al
  // confirmar, con pin-bio.js + firebase-init.js + firebase-sync.js en
  // mano, que la hipótesis es imposible en la arquitectura actual:
  // appDataLoaded solo lo dispara _finishFirstLoad() (firebase-sync.js),
  // que solo corre dentro del onSnapshot de _fbLoadData(), que solo se
  // llama desde _launchApp() (pin-bio.js) — y ahí SIEMPRE después de
  // _hidePin() (que ya sacó la clase 'open'). No hay ningún camino de
  // código en el que este evento pueda disparar con el PIN todavía en
  // pantalla. Ver CHANGELOG.md#infraestructura--seguridad para el detalle
  // completo de la investigación y qué explica el TBT real medido.
  window.addEventListener('appDataLoaded', function () {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(_iniciarEnsureAll, { timeout: 5000 });
    } else {
      setTimeout(_iniciarEnsureAll, 2000);
    }
  }, { once: true });

  return { ensure, ensureAll, isLoaded, GROUPS };
})();
