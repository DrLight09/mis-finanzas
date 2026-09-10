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

  // Hook a openSheet — ver js/core/hook-global.js. Reemplaza el wrap manual
  // + fallback con waitFor() que tenía este archivo (y de paso se saca un
  // bug latente sin efecto real que tenía esa rama: comparaba
  // `window.openSheet !== arguments.callee` dentro de un arrow function,
  // donde arguments.callee apuntaba al IIFE completo, no a la función
  // interna — la comparación nunca hacía lo que parecía. hookGlobal() no
  // necesita esa comparación: waitFor() ya resuelve "esperar hasta que
  // exista" con su propio checkFn).
  hookGlobal('openSheet', function(id) {
    const focusId = focusMap[id];
    if (focusId) {
      setTimeout(() => {
        const el = document.getElementById(focusId);
        if (el && typeof el.focus === 'function') el.focus();
      }, 250);
    }
  }, { intervalMs: 100 });
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
