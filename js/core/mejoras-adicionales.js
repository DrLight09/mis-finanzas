// "MEJORAS ADICIONALES" (parte 2): registro de Service Worker, autofocus de
// formularios al abrir un sheet, aria-labels de pantallas — extraído de
// index.html. Ver auditoria-tecnica.md #2.

/* ================================================================
   SERVICE WORKER — PWA offline
   ================================================================ */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/mis-finanzas/sw.js', { scope: '/mis-finanzas/' })
    .then(() => console.info('[SW] Registrado correctamente'))
    .catch(err => console.info('[SW] No disponible:', err.message));
} // fin if ('serviceWorker' in navigator)

/* ================================================================
   NAVEGACIÓN POR GESTOS — manejado por makeSwipeable() (sección 7)
   ================================================================ */

/* ================================================================
   AUTOFOCUS en formularios al abrirse
   ================================================================ */
(function() {
  // Mapeo de sheet-id → id del primer campo a enfocar
  const focusMap = {
    'gasto-var': 'gv_desc',
    'gasto-fijo': 'gf_n',
    'nueva-persona': 'np_nombre',
    'spotify': 'sp_n',
    'nuevo-encargo': 'enc_nombre',
    'nueva-cuenta': 'nc_nombre',
    'agregar-dinero': 'adDesc',
    'restar-dinero': 'rdDesc',
    'mesada-pago': 'mpMonto',
    'mesada-pend': 'mppMonto',
    'transferir': 'tr_monto',
  };

  const _origOpenSheet = window.openSheet;
  if (typeof _origOpenSheet !== 'function') {
    console.warn('[Autofocus] openSheet no estaba definida al momento del parcheo. Reintentando...');
    // Reintentar una vez que esté disponible
    const _t = setInterval(() => {
      if (typeof window.openSheet === 'function' && window.openSheet !== arguments.callee) {
        clearInterval(_t);
        const _r = window.openSheet;
        window.openSheet = function(id) {
          _r.apply(this, arguments);
          const focusId = focusMap[id];
          if (focusId) setTimeout(() => { const el = document.getElementById(focusId); if (el && typeof el.focus === 'function') el.focus(); }, 250);
        };
      }
    }, 100);
    return;
  }
  window.openSheet = function(id) {
    _origOpenSheet.apply(this, arguments);
    const focusId = focusMap[id];
    if (focusId) {
      setTimeout(() => {
        const el = document.getElementById(focusId);
        if (el && typeof el.focus === 'function') el.focus();
      }, 250);
    }
  };
})();

/* ================================================================
   MEJORA SEMÁNTICA — aria-labels y roles
   ================================================================ */
(function() {
  // Añadir role="main" al scroll-area
  const main = document.getElementById('scrollArea');
  if (main && !main.getAttribute('role')) main.setAttribute('role', 'main');

  // Añadir aria-label a las pantallas
  const screenLabels = {
    'screen-inicio': 'Inicio',
    'screen-cuentas': 'Cuentas',
    'screen-gastos': 'Gastos',
    'screen-prestamos': 'Préstamos',
    'screen-analisis': 'Análisis',
    'screen-config': 'Configuración',
    'screen-historial': 'Actividad reciente',
    'screen-personas': 'Personas',
  };
  Object.entries(screenLabels).forEach(([id, label]) => {
    const el = document.getElementById(id);
    if (el) el.setAttribute('aria-label', label);
  });
})();
