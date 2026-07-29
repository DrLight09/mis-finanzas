// Barra de progreso de "gastos fijos pagados este mes" en panel-fijo —
// extraído de index.html. Segundo eslabón de la cadena de wraps de
// window.refresh (el primero es la definición base en el bloque S/save;
// el tercero ya vive en js/core/mejoras.js). Depende de S (bloque S/save,
// carga antes) y de que window.refresh ya exista en este punto — si algún
// día esto se recarga en otro orden, hay que agregarle el mismo guard
// defensivo que ya usa mejoras.js (typeof + polling). Ver
// auditoria-tecnica.md #2/#4.

// ── 4. GASTOS FIJOS PROGRESS BAR ─────────────────────────────────────────────
(function(){
  // Inject progress card into panel-fijo if not already there
  const panelFijo = document.getElementById('panel-fijo');
  if(!panelFijo) return;

  const progressCard = document.createElement('div');
  progressCard.className = 'fijos-progress-card';
  progressCard.id = 'fijos-progress-card';
  progressCard.innerHTML = `
    <div class="fijos-progress-title" id="fijos-progress-title">Cargando...</div>
    <div class="fijos-progress-bar"><div class="fijos-progress-fill" id="fijos-progress-fill" style="width:0%"></div></div>
    <div class="fijos-progress-label" id="fijos-progress-label"></div>
  `;
  panelFijo.insertBefore(progressCard, panelFijo.firstChild);

  function updateFijosProgress() {
    if(typeof S === 'undefined' || !S.gastosFijos) return;
    const mes = (function(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');})();
    const fijos = S.gastosFijos || [];
    const total = fijos.length;
    if(total === 0) {
      progressCard.style.display = 'none';
      return;
    }
    progressCard.style.display = 'block';
    const pagos = S.pagosGastosFijos || {};
    const pagados = fijos.filter(g => !!pagos[g.id+'_'+mes]).length;
    const pct = Math.round((pagados/total)*100);
    document.getElementById('fijos-progress-fill').style.width = pct+'%';
    document.getElementById('fijos-progress-title').textContent =
      pagados === total ? 'Todos pagados este mes' : `${pagados} de ${total} pagados este mes`;
    document.getElementById('fijos-progress-label').textContent =
      pagados === total ? 'Sin pagos pendientes' : `${total-pagados} pendiente${total-pagados!==1?'s':''}`;
  }

  // Hook into refresh
  const _origRefreshFijos = window.refresh;
  window.refresh = function(){
    if(_origRefreshFijos) _origRefreshFijos.apply(this, arguments);
    updateFijosProgress();
  };
  setTimeout(updateFijosProgress, 200);
})();
