/* ═══════════════════════════════════════════════════════════════
   js/core/wrapped-gate.js

   Ventana de disponibilidad de Wrapped (js/modules/wrapped.js) — resuelve
   la decisión que había quedado abierta en wrapped.md §7decies ("año en
   curso vs. año recién cerrado"). Hasta ahora Wrapped estaba disponible
   los 12 meses del año mostrando el año EN CURSO en vivo (opción 3 de esa
   sección, la que se había dejado así "por ahora"). Esta sesión implementa
   la opción 2 que ya estaba documentada ahí mismo: el resumen es del año
   recién cerrado, y solo se puede abrir durante una ventana corta en enero
   — como cualquier revelación de verdad, se revela cuando ya no puede
   cambiar, no mientras sigue en vivo.

   Investigación previa a esta decisión (2026-09-15): Spotify Wrapped corta
   su ventana de datos a mediados de noviembre y lo lanza a fin de
   noviembre/inicios de diciembre — un cierre ADELANTADO, porque necesitan
   varias semanas de producción para un año que todavía no terminó. Acá esa
   razón no aplica: los movimientos de diciembre ya están completos y
   guardados el 1 de enero, así que no hace falta adelantar nada — se puede
   mostrar el año recién cerrado COMPLETO (12 meses reales, no 11 como
   Spotify) desde el primer día del año nuevo.

   Ventana elegida: 1 al 31 de enero (`WRAPPED_VENTANA_DIAS`), un solo
   número para ajustar si en la práctica resulta corta o larga. Deliberadamente
   más corta que la exposición real de un Spotify Wrapped (que sigue
   accesible en la app varias semanas después de su lanzamiento): la
   escasez ("un mes al año, y ya") es justamente lo que justifica
   destacarlo en vez de tratarlo como un módulo más — un acceso disponible
   todo el año competiría de lleno con Análisis financiero, que YA es el
   lugar para consultar datos en cualquier momento (mismo argumento que
   wrapped.js ya usaba contra una versión mensual, ver su cabecera
   "IMPORTANTE").

   Eager, siempre cargado — a diferencia de wrapped.js (sigue siendo lazy,
   grupo 'wrapped', y ahora directamente NUNCA se descarga fuera de la
   ventana). Necesita estar disponible desde el arranque para tres cosas:
   1. `Loader.ensureAll()` (lazy-loader.js) lo consulta para decidir si
      precarga el grupo 'wrapped' en segundo plano — evita bajar ~4000
      líneas de un módulo que el usuario ni siquiera puede abrir los 11
      meses del año que no toca.
   2. Ocultar por completo la tarjeta destacada de Configuración fuera de la ventana
      (`#wrapped-promo` en index.html arranca con `display:none` en el
      propio HTML — fail-closed: si este script fallara en cargar, la tarjeta
      se queda oculta en vez de mostrarse siempre) y rellenar su año y días
      restantes cuando sí toca, en vez de que se vea "un módulo más".
   3. Mostrar el aviso (banner con botón "Ver mi resumen") apenas la
      ventana abre, una sola vez por año — no cada recarga.

   `_wrappedGateForzado()` permite abrir la experiencia completa fuera de
   enero con `?wrappedForzar=1` en la URL — para poder probarla o hacer
   una demo sin esperar a que llegue el año. Mismo espíritu que `?debug=1`
   en wrapped.js, pero una decisión aparte: acá se decide si el módulo
   EXISTE; allá, qué tan detallado se ve.

   Depende solo de `hoy()` (core-state.js, con guard typeof + fallback a
   `new Date()`, mismo patrón que `_wrappedHoy` en wrapped.js) y de
   `showScreen`/`toast` (núcleo eager) para el botón del banner. No toca
   `S` ni Firestore en ningún punto — lo único que persiste es un par de
   flags de UI en `localStorage` (qué banner ya se vio), mismo patrón ya
   usado en el resto de la app (`mf_lastSavedAt`, `mf-saldos-ocultos`), no
   un dato financiero nuevo.
   ═══════════════════════════════════════════════════════════════ */
(function(){
'use strict';

const WRAPPED_VENTANA_DIAS = 31; // 1-31 de enero. Ver nota arriba.

function _wrappedGateHoy(){
  return typeof hoy === 'function' ? hoy() : new Date().toISOString().slice(0,10);
}

function _wrappedGateForzado(){
  try{
    return /[?&#]wrappedForzar=1\b/.test(location.search) || /[?&#]wrappedForzar=1\b/.test(location.hash);
  }catch(_){ return false; }
}

// Único punto de verdad de todo el archivo (y de wrapped.js, vía
// window._wrappedAnioObjetivo/_wrappedDisponible más abajo): nadie más
// recalcula la fecha de cierre ni decide el año por su cuenta.
function _wrappedVentana(){
  const hoyStr = _wrappedGateHoy();
  const anioActual = hoyStr.slice(0,4);
  const mes = parseInt(hoyStr.slice(5,7),10);
  const dia = parseInt(hoyStr.slice(8,10),10);
  const forzado = _wrappedGateForzado();
  const enEnero = mes === 1 && dia <= WRAPPED_VENTANA_DIAS;
  const disponible = forzado || enEnero;
  // El objetivo siempre es el año recién cerrado (anioActual - 1) — nunca
  // el año en curso en vivo, esa era la opción vieja (§7decies, opción 3,
  // reemplazada acá). Si alguien fuerza la ventana fuera de enero para
  // probar/hacer una demo, igual apunta al año anterior: forzar sirve para
  // ver "el wrapped de verdad", no una versión a medias del año en curso.
  const anioObjetivo = String(parseInt(anioActual,10) - 1);
  const fechaCierre = anioActual + '-01-' + String(WRAPPED_VENTANA_DIAS).padStart(2,'0');
  const diasRestantes = enEnero ? Math.max(0, WRAPPED_VENTANA_DIAS - dia) : 0;
  return { disponible, anioObjetivo, fechaCierre, diasRestantes, forzado };
}

window._wrappedDisponible = function(){ return _wrappedVentana().disponible; };
window._wrappedAnioObjetivo = function(){ return _wrappedVentana().anioObjetivo; };
window._wrappedVentanaInfo = _wrappedVentana; // uso interno/debug, no público

/* ─── TARJETA DESTACADA EN CONFIGURACIÓN ───────────────────────────────
   #wrapped-promo ya existe en index.html como HTML estático, arriba del
   todo en la pantalla de Configuración (sobre "Cuenta") — este archivo
   solo decide si se ve y rellena el año y los días restantes, nunca su
   estructura. Hasta el 2026-09-16 esto era una fila dentro de la lista de
   "Herramientas" (#cfg-wrapped-row, .cfg-toggle-destacado): se veía como
   un parche, así que pasó a ser una tarjeta propia sobre .hero.
   No depende de que configuracion.js (lazy, grupo 'config') haya cargado:
   la tarjeta ya está en el HTML de entrada, así que esto corre bien
   incluso si el usuario nunca abrió Configuración todavía. */
function _wrappedGateAplicarFila(){
  const promo = document.getElementById('wrapped-promo');
  if(!promo) return;
  const info = _wrappedVentana();
  if(!info.disponible){ promo.style.display = 'none'; return; }
  promo.style.display = '';

  const anio = document.getElementById('wrapped-promo-anio');
  if(anio) anio.textContent = info.anioObjetivo;

  const dias = document.getElementById('wrapped-promo-dias');
  if(dias){
    dias.innerHTML = info.diasRestantes > 0
      ? `Disponible<br>${info.diasRestantes} día${info.diasRestantes===1?'':'s'} más`
      : 'Último día';
  }
}

/* ─── AVISO (banner) DE "YA ESTÁ DISPONIBLE" ───────────────────────────
   Se arma con JS (mismo criterio que #toast-container/#wrapped-overlay:
   nada de esto existe en index.html hasta que hace falta) y se muestra
   UNA sola vez por año — no en cada recarga de la página — usando un
   flag en localStorage, igual de "no es un dato financiero" que
   `mf-saldos-ocultos` ya usaba en el resto de la app. */
function _wrappedGateLocalKey(sufijo, anio){
  return 'mf_wrapped_' + sufijo + '_' + anio;
}

function _wrappedGateYaVisto(anio){
  try{
    return localStorage.getItem(_wrappedGateLocalKey('banner_visto', anio)) === '1'
        || localStorage.getItem(_wrappedGateLocalKey('visto', anio)) === '1'; // wrapped.js marca esta al abrir de verdad
  }catch(_){ return false; }
}

function _wrappedGateMarcarVisto(anio){
  try{ localStorage.setItem(_wrappedGateLocalKey('banner_visto', anio), '1'); }catch(_){}
}

function _wrappedGateMostrarBanner(){
  const info = _wrappedVentana();
  if(!info.disponible) return;
  if(_wrappedGateYaVisto(info.anioObjetivo)) return;
  if(document.getElementById('wrapped-banner')) return; // ya está en pantalla

  const el = document.createElement('div');
  el.id = 'wrapped-banner';
  // Sin ícono decorativo: la tira de segmentos (.wp-segs, el mismo motivo
  // de "stories" que usa #wrapped-progress en wrapped.js) dice qué es esto
  // mucho mejor que una estrellita, y no deja el bloque vacío. Los blobs
  // son los mismos de #wrapped-promo, así banner y tarjeta se leen como la
  // misma pieza. Ver el CSS en index.html.
  el.innerHTML = `<div class="wp-blob b1"></div><div class="wp-blob b2"></div>
    <button type="button" id="wrapped-banner-close" aria-label="Cerrar">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
    </button>
    <div class="wp-segs"><i class="on"></i><i class="on a"></i><i class="on p"></i><i class="on b"></i><i></i><i></i></div>
    <div class="wrapped-banner-title">Tu resumen de ${info.anioObjetivo} ya está listo</div>
    <div class="wrapped-banner-sub">${info.diasRestantes > 0 ? `Disponible ${info.diasRestantes} día${info.diasRestantes===1?'':'s'} más — después vuelve el próximo enero` : 'Hoy es el último día para verlo'}</div>
    <div class="wrapped-banner-row">
      <button type="button" class="wrapped-banner-btn">Ver mi resumen
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;"><polyline points="9 18 15 12 9 6"/></svg></button>
      <button type="button" class="wrapped-banner-later">Después</button>
    </div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('wrapped-banner-in'));

  const _cerrar = () => {
    el.classList.remove('wrapped-banner-in');
    setTimeout(() => el.remove(), 420);
  };
  el.querySelector('#wrapped-banner-close').addEventListener('click', () => {
    _wrappedGateMarcarVisto(info.anioObjetivo);
    _cerrar();
  });
  // "Después" cierra sin marcar visto: vuelve a aparecer en la próxima
  // carga, a diferencia de la X (que sí lo da por visto para el año).
  el.querySelector('.wrapped-banner-later').addEventListener('click', _cerrar);
  el.querySelector('.wrapped-banner-btn').addEventListener('click', () => {
    _wrappedGateMarcarVisto(info.anioObjetivo);
    _cerrar();
    if(typeof showScreen === 'function') showScreen('wrapped');
  });
}

// La fila del menú no depende de que los datos ya hayan cargado (es HTML
// estático con texto fijo) — se aplica de una, apenas este script corre.
_wrappedGateAplicarFila();

// El banner sí espera a 'appDataLoaded' (mismo evento que dispara
// Loader.ensureAll() en lazy-loader.js) + un margen (1.5s): que no compita
// con el toast de bienvenida ni con cualquier otro aviso que dispare la
// carga inicial de datos. Una sola vez por carga de página, igual que el
// listener equivalente de lazy-loader.js.
window.addEventListener('appDataLoaded', function(){
  setTimeout(_wrappedGateMostrarBanner, 1500);
}, { once: true });

})();
