// Inicialización de _inyectarPersonaSheets() al cargar datos — extraído de
// index.html. Ver auditoria-tecnica.md #2.


/* ── Inicializar todo cuando la app cargue ─────────────────────── */
// Usamos el evento 'appDataLoaded' en lugar de sobrescribir window._fbLoadData,
// porque este script es inline y se ejecuta ANTES que los módulos (type="module"),
// por lo que cualquier wrapper sobre _fbLoadData quedaría sobreescrito por el módulo.
window.addEventListener('appDataLoaded', function() {
  setTimeout(() => {
    _inyectarPersonaSheets();
  }, 600);
});

// También correr si ya cargó
if (document.readyState !== 'loading') {
  setTimeout(() => {
    if (window.S) { _inyectarPersonaSheets(); }
  }, 1000);
}
