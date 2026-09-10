// Barra de progreso de "gastos fijos pagados este mes" en panel-fijo —
// extraído de index.html. Depende de S (bloque S/save, carga antes).
//
// El hook a window.refresh() pasa por hookGlobal() (js/core/hook-global.js):
// antes esto era un wrap manual que asumía sin guard que window.refresh ya
// existía en este punto (cierto solo por el orden de <script> en
// index.html, no por ninguna garantía real — el mismo tipo de suposición
// implícita que ya causó bugs en otros archivos). hookGlobal() resuelve
// eso solo: si refresh ya existe lo envuelve de inmediato, si no, espera.
// Ver auditoria-tecnica.md #2/#4.

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

  // Hook into refresh — ver js/core/hook-global.js
  hookGlobal('refresh', updateFijosProgress);
  setTimeout(updateFijosProgress, 200);
})();
