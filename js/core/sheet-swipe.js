// Swipe-to-close para bottom sheets y el menú "Más" — extraído de
// index.html. Expone window._makeSheetSwipeable para que otros módulos
// (ej. Plata Comprometida) puedan inicializar swipe en overlays que
// inyectan al DOM después de DOMContentLoaded. Depende de closeSheet
// (bloque sheet-stack/nav, carga antes). Ver auditoria-tecnica.md #2/#4.

// ── 5. CAJITAS COLAPSABLES — manejado directamente en renderCajitas() ─────────

// ── 6. ATENCIÓN section: migrado a js/modules/inicio.js — ver auditoria-tecnica.md.

// ── 7. SWIPE TO CLOSE — bottom sheets y mas-menu ─────────────────────────────
(function(){
  // Umbral de píxeles hacia abajo para cerrar, y velocidad mínima
  const CLOSE_THRESHOLD = 90;   // px
  const VELOCITY_THRESHOLD = 0.4; // px/ms

  // Helper: check if keyboard is likely open
  function isKeyboardOpen() {
    if(window.visualViewport) {
      return window.innerHeight - window.visualViewport.height > 150;
    }
    return document.activeElement && ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName);
  }

  // ── Helper: aplicar swipe a un contenedor tipo sheet ──
  function makeSwipeable(panel, closeFn, opts) {
    opts = opts || {};
    const handle = panel.querySelector('.sheet-handle, .mas-menu-handle');

    if(handle) handle.style.cursor = 'grab';

    let startY = 0, lastY = 0, lastT = 0;
    let dragging = false, animating = false;
    // started: true cuando el toque es elegible para convertirse en gesto de cierre.
    // fromHandle: true cuando el toque empezó exactamente en el handle.
    let started = false, fromHandle = false;

    // scrollEl: el .sheet mismo (que tiene overflow-y:auto)
    const scrollEl = panel.classList.contains('sheet') ? panel : (panel.querySelector('.sheet') || panel);

    function onStart(e) {
      if(animating) return;
      if(isKeyboardOpen()) { started = false; return; }
      const touch = e.touches ? e.touches[0] : e;
      startY    = touch.clientY;
      lastY     = startY;
      lastT     = Date.now();
      dragging  = false;
      // Determinar si el toque viene del handle o del cuerpo del sheet
      fromHandle = handle ? handle.contains(e.target) : false;
      // Elegible si: viene del handle, O el sheet está completamente al tope (sin scroll)
      started = fromHandle || (scrollEl.scrollTop <= 0);
    }

    function onMove(e) {
      if(!started || animating) return;
      const touch = e.touches ? e.touches[0] : e;
      const dy  = touch.clientY - startY;
      const now = Date.now();

      if(!dragging) {
        if(dy > 8) {
          // Solo iniciar el drag hacia abajo si:
          // • viene del handle (siempre permitido), O
          // • el sheet sigue en scrollTop=0 en este momento
          if(!fromHandle && scrollEl.scrollTop > 0) {
            // El sheet se scrolleó antes de que el dedo se moviera suficiente;
            // dejar que el scroll nativo maneje el gesto
            started = false;
            return;
          }
          dragging = true;
          // Bloquear scroll del sheet mientras dure el gesto de cierre
          scrollEl.style.overflowY = 'hidden';
        } else if(dy < -4) {
          // El usuario scrollea hacia arriba: cancelar gesto de cierre
          started = false;
          return;
        } else {
          lastY = touch.clientY;
          lastT = now;
          return;
        }
      }

      if(dragging && dy > 0) {
        const resistance = Math.pow(dy, 0.85);
        panel.style.transition = 'none';
        panel.style.transform = 'translateY(' + resistance + 'px)';
        const overlay = panel.closest('.overlay') || panel.closest('.mas-menu-overlay') ||
                        document.getElementById('mas-menu-overlay');
        if(overlay && overlay !== panel) {
          const pct = Math.max(0, 1 - resistance / 300);
          overlay.style.opacity = pct;
        }
        if(e.cancelable) e.preventDefault();
      }
      lastY = touch.clientY;
      lastT = now;
    }

    function onEnd(e) {
      if(!started) return;
      started = false;
      if(!dragging) return;
      dragging = false;
      // Restaurar scroll del sheet
      scrollEl.style.overflowY = '';
      const touch = e.changedTouches ? e.changedTouches[0] : e;
      const dy  = touch.clientY - startY;
      const dt  = Date.now() - lastT;
      const velocity = dt > 0 ? (touch.clientY - lastY) / dt : 0;

      const overlay = panel.closest('.overlay') || document.getElementById('mas-menu-overlay');

      if(dy > CLOSE_THRESHOLD || velocity > VELOCITY_THRESHOLD) {
        animating = true;
        panel.style.transition = 'transform .22s cubic-bezier(.4,0,1,1)';
        panel.style.transform = 'translateY(110%)';
        if(overlay && overlay !== panel) {
          overlay.style.transition = 'opacity .22s';
          overlay.style.opacity = '0';
        }
        setTimeout(()=>{
          animating = false;
          panel.style.transform = '';
          panel.style.transition = '';
          if(overlay && overlay !== panel) {
            overlay.style.opacity = '';
            overlay.style.transition = '';
          }
          closeFn();
        }, 220);
      } else {
        panel.style.transition = 'transform .3s cubic-bezier(.34,1.4,.64,1)';
        panel.style.transform = 'translateY(0)';
        if(overlay && overlay !== panel) {
          overlay.style.transition = 'opacity .3s';
          overlay.style.opacity = '1';
        }
        setTimeout(()=>{
          panel.style.transform = '';
          panel.style.transition = '';
          if(overlay && overlay !== panel) {
            overlay.style.opacity = '';
            overlay.style.transition = '';
          }
          scrollEl.style.overflowY = '';
        }, 300);
      }
    }

    // touchstart en el panel completo: la lógica de elegibilidad está en onStart/onMove
    panel.addEventListener('touchstart', onStart, { passive: true });
    // touchmove/end en el panel completo para no perder el gesto si el dedo
    // se desliza fuera del handle durante el drag
    panel.addEventListener('touchmove', onMove, { passive: false });
    panel.addEventListener('touchend',  onEnd,  { passive: true });
  }

  // _makeSheetSwipeable se define más abajo junto al loop de inicialización

  // ── Función pública para inicializar swipe en todos los overlays del DOM ─
  // Se llama en DOMContentLoaded para capturar también los sheets que están
  // declarados después de este bloque <script> en el HTML.
  function initAllOverlaySwipes() {
    document.querySelectorAll('.overlay').forEach(overlay => {
      // Evitar doble-registro: marcar el overlay como ya inicializado
      if(overlay._swipeInited) return;
      overlay._swipeInited = true;
      const sheet = overlay.querySelector('.sheet');
      if(!sheet) return;
      const sheetId = overlay.id ? overlay.id.replace('sheet-','') : null;
      const closeFn = sheetId
        ? () => { overlay.style.opacity=''; closeSheet(sheetId); }
        : () => overlay.classList.remove('open');
      makeSwipeable(sheet, closeFn);
    });

    // ── Swipe para el mas-menu ───────────────────────────────────────────────
    const masMenu = document.getElementById('mas-menu');
    const masOverlay = document.getElementById('mas-menu-overlay');
    const masBtn = document.getElementById('nav-mas-btn');
    if(masMenu && !masMenu._swipeInited) {
      masMenu._swipeInited = true;
      makeSwipeable(masMenu, ()=>{
        masMenu.style.display = 'none';
        if(masOverlay) { masOverlay.style.opacity = ''; masOverlay.classList.remove('open'); }
        masBtn && masBtn.classList.remove('active');
      });
    }
  }

  // Ejecutar después de que todo el HTML haya sido parseado
  if(document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAllOverlaySwipes);
  } else {
    // Por si este script corre después del DOMContentLoaded
    initAllOverlaySwipes();
  }

  // Exponer también para que _cpInit y otros módulos puedan llamarla
  // cuando inyectan nuevos overlays al DOM después del DOMContentLoaded
  window._makeSheetSwipeable = function(overlayEl) {
    if(!overlayEl || overlayEl._swipeInited) return;
    overlayEl._swipeInited = true;
    const sheet = overlayEl.querySelector('.sheet');
    if(!sheet) return;
    const sheetId = overlayEl.id ? overlayEl.id.replace('sheet-','') : null;
    const closeFn = sheetId
      ? () => { overlayEl.style.opacity=''; overlayEl.classList.remove('open'); }
      : () => overlayEl.classList.remove('open');
    makeSwipeable(sheet, closeFn);
  };
})();
