// Inicialización de _inyectarPersonaSheets() al cargar datos — extraído de
// index.html. Ver auditoria-tecnica.md #2.

/* ── Inicializar todo cuando la app cargue ─────────────────────── */
// Usamos el evento 'appDataLoaded' en lugar de sobrescribir window._fbLoadData,
// porque este script es inline y se ejecuta ANTES que los módulos (type="module"),
// por lo que cualquier wrapper sobre _fbLoadData quedaría sobreescrito por el módulo.
//
// Nota (2026-08-02): antes esto era un setTimeout fijo (600ms al recibir
// 'appDataLoaded', 1000ms si el documento ya había terminado de cargar) que
// asumía sin guard que _inyectarPersonaSheets() ya existía para ese momento.
// Eso era cierto SOLO porque personas.js carga eager, justo antes de este
// script, en index.html — un dato de orden de carga, no una garantía real.
// Mismo tipo de bug ya encontrado y corregido con Events('authgate'/'pin', ...)
// en firebase-sync.js/pin-bio.js (ver CHANGELOG.md#infraestructura--seguridad):
// un timeout fijo sin reintento puede disparar antes de que la función exista
// y fallar en silencio, para siempre, sin ningún error visible.
//
// Se reemplaza por waitFor() (js/core/wait-for.js) — dispara apenas
// _inyectarPersonaSheets() está disponible en vez de esperar un número mágico,
// y no se rompe si algún día personas.js (o algo que dependa de él) deja de
// cargar eager. Tope de 25 intentos (~5s) para no reintentar para siempre si
// algo salió mal de verdad. Antes esto era un loop propio (setTimeout +
// contador a mano); ver CHANGELOG.md#infraestructura--seguridad, entrada de
// consolidación de este patrón (estaba triplicado con mejoras.js/
// mejoras-adicionales.js).
//
// onGiveUp (agregado 2026-09-08): antes, si los 25 intentos se agotaban sin
// que _inyectarPersonaSheets() apareciera, la falla era 100% silenciosa —
// nada en consola, solo los sheets de personas nunca se inyectaban. Este
// console.warn no cambia el comportamiento del camino exitoso (que sigue
// siendo el mismo de siempre); solo le da un rastro diagnosticable al único
// camino que hoy fallaba sin dejar ninguna pista.
function _intentarInyectarPersonaSheets() {
  waitFor(
    () => typeof _inyectarPersonaSheets === 'function',
    _inyectarPersonaSheets,
    {
      maxAttempts: 25,
      onGiveUp: () => console.warn('[personas-init] _inyectarPersonaSheets() no apareció tras 25 intentos (~5s) — los sheets de personas no se inyectaron.')
    }
  );
}

window.addEventListener('appDataLoaded', function() {
  _intentarInyectarPersonaSheets();
});

// También correr si ya cargó
if (document.readyState !== 'loading') {
  if (window.S) { _intentarInyectarPersonaSheets(); }
}
