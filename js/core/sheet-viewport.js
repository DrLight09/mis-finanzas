// Ajustes de viewport para sheets: scroll-into-view al enfocar un input
// dentro de un sheet, y reposicionamiento cuando el teclado se abre en
// Android (visualViewport) — extraído de index.html. Autocontenido.
// Ver auditoria-tecnica.md #2/#4.

// ── 2. SHEET SWIPE-TO-CLOSE — manejado por makeSwipeable() en sección 7 ──────

// ── 3. SCROLL INTO VIEW ON INPUT FOCUS (sheet keyboard fix) ─────────────────
document.addEventListener('focusin', function(e){
  const input = e.target;
  if(!['INPUT','TEXTAREA','SELECT'].includes(input.tagName)) return;
  const sheet = input.closest('.sheet');
  if(!sheet) return;
  // Delay to let keyboard animate in, then scroll the input into center view
  setTimeout(()=>{
    try {
      input.scrollIntoView({behavior:'smooth', block:'center'});
    } catch(ex) {
      input.scrollIntoView(false);
    }
  }, 350);
});

// ── 3b. VISUAL VIEWPORT: reposition overlay when keyboard opens (Android fix) ─
// Usa debounce para evitar que el sheet "tiemble" mientras el teclado anima su entrada.
(function(){
  if(!window.visualViewport) return;
  var _vvTimer = null;
  var _lastAppliedKb = -1; // evitar relayouts innecesarios

  function applyKbLayout(){
    var vv = window.visualViewport;
    var kbHeight = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    // Solo actuar si el cambio es significativo (>20px) para evitar micro-ajustes
    if(Math.abs(kbHeight - _lastAppliedKb) < 20) return;
    _lastAppliedKb = kbHeight;

    document.querySelectorAll('.overlay.open').forEach(function(overlay){
      var sheet = overlay.querySelector('.sheet');
      if(!sheet) return;
      if(kbHeight > 100){
        sheet.style.marginBottom = kbHeight + 'px';
        sheet.style.maxHeight = (vv.height * 0.92) + 'px';
      } else {
        sheet.style.marginBottom = '';
        sheet.style.maxHeight = '';
      }
    });
  }

  function onViewportResize(){
    // Debounce: esperar 120ms después del último evento antes de aplicar
    clearTimeout(_vvTimer);
    _vvTimer = setTimeout(applyKbLayout, 120);
  }

  window.visualViewport.addEventListener('resize', onViewportResize);
  window.visualViewport.addEventListener('scroll', onViewportResize);

  // Reset when sheet closes
  var _sheetObserver = new MutationObserver(function(mutations){
    mutations.forEach(function(m){
      if(m.type === 'attributes' && m.attributeName === 'class'){
        var overlay = m.target;
        if(!overlay.classList.contains('open')){
          var sheet = overlay.querySelector('.sheet');
          if(sheet){ sheet.style.marginBottom = ''; sheet.style.maxHeight = ''; }
        }
      }
    });
  });
  document.querySelectorAll('.overlay').forEach(function(ov){
    _sheetObserver.observe(ov, {attributes:true});
  });
})();
