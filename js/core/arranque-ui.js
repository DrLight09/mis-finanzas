// js/core/arranque-ui.js
//
// Pequeños retoques de arranque de la interfaz:
//   · render de salud financiera, proyección y presupuestos tras cada refresh() y al terminar de cargar los datos;
//   · fade-in de la app cuando se oculta la pantalla de carga;
//   · role/aria-label de la zona principal y de cada pantalla.
(function(){
  // Renderizar salud y proyección directamente (sin depender del hook de refresh)
  function _renderMejoras() {
    try { renderHealthScore(); } catch(e){}
    try { renderProyeccion(); } catch(e){}
    try { renderPresupuestos(); } catch(e){}
  }

  Refresh.registrar('mejoras-render', _renderMejoras);

  // Llamar directamente cuando Firebase termina de cargar los datos.
  // Necesario porque los módulos type="module" se ejecutan DESPUÉS que los scripts
  // inline, por lo que cuando _initAppUI llama refresh() el hook aún no está instalado.
  window.addEventListener('appDataLoaded', function() {
    setTimeout(_renderMejoras, 300);
  });

  // ── Fade-in de la app ──
  // Animacion fade-in: se aplica cuando _finishFirstLoad oculta el loader.
  // Ya no envolvemos _fbLoadData porque ahora usa onSnapshot (no es awaitable).
  (function(){
    const app = document.querySelector('.app');
    const loadingEl = document.getElementById('fb-loading-screen');
    if(app && loadingEl){
      app.style.opacity='0'; app.style.transition='opacity .4s';
      const _obs = new MutationObserver(()=>{
        if(loadingEl.style.display==='none'){ requestAnimationFrame(()=>{ app.style.opacity='1'; }); _obs.disconnect(); }
      });
      _obs.observe(loadingEl,{attributes:true,attributeFilter:['style']});
    }
  })();

  // ── Accesibilidad: role="main" y aria-label de las pantallas ──
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
