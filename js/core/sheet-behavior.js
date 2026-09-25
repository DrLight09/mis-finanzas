// js/core/sheet-behavior.js
//
// Comportamiento de un `.sheet`/`.overlay` ya abierto, pensado para celular:
//   1. Mantener visible el campo de texto enfocado, moviendo lo mínimo.
//   2. Reposicionar el sheet cuando el teclado se abre o se cierra
//      (Visual Viewport, Android).
//   3. Gesto de cierre por swipe hacia abajo (sheets y menú "Más").
//
// Regla de diseño: la pantalla no se mueve por iniciativa propia mientras hay
// un dedo apoyado, ni en el instante siguiente a un toque. Un ajuste de layout
// que llega entre "vi el botón" y "lo toqué" hace que el toque caiga sobre
// otro elemento (se siente peor cuanto más rápido se toca un botón tras otro).
// Por eso todo ajuste automático (reposicionar por el teclado, scroll hacia el
// campo enfocado) espera a que la pantalla lleve un momento quieta —ver
// `whenQuiet`— y solo se aplica si de verdad hace falta.
//
// Depende de closeSheet (sheet-stack.js, carga antes). Expone
// window._makeSheetSwipeable para que otros módulos (ej. Plata Comprometida)
// puedan inicializar swipe en overlays que inyectan al DOM después de
// DOMContentLoaded.

(function(){
  'use strict';

  // ── ACTIVIDAD TÁCTIL (compartida por las tres secciones de abajo) ─────────
  // "Quieta" = ningún dedo apoyado y ningún toque terminó hace menos de
  // QUIET_MS. Si un touchend se pierde, un dedo "apoyado" sin ningún evento
  // durante STALE_MS deja de contar, para no bloquear los ajustes para siempre.
  var QUIET_MS = 300;
  var STALE_MS = 5000;
  var fingers = 0, lastTouchEvt = 0, lastTouchEnd = 0;

  function trackTouch(e){
    var now = Date.now();
    fingers = e.touches ? e.touches.length : 0;
    lastTouchEvt = now;
    if(e.type !== 'touchstart' && e.type !== 'touchmove' && fingers === 0) lastTouchEnd = now;
  }
  ['touchstart','touchmove','touchend','touchcancel'].forEach(function(t){
    document.addEventListener(t, trackTouch, {capture:true, passive:true});
  });

  function isBusy(){
    var now = Date.now();
    if(fingers > 0 && now - lastTouchEvt < STALE_MS) return true;
    return now - lastTouchEnd < QUIET_MS;
  }

  // Ejecuta fn en cuanto la pantalla esté quieta (inmediatamente si ya lo está).
  function whenQuiet(fn){
    if(!isBusy()){ fn(); return; }
    var wait = fingers > 0 ? 100 : Math.max(20, QUIET_MS - (Date.now() - lastTouchEnd) + 10);
    setTimeout(function(){ whenQuiet(fn); }, wait);
  }

  // ── CAMPO ENFOCADO SIEMPRE VISIBLE ────────────────────────────────────────
  // Solo se mueve el scroll del propio .sheet, solo si el campo quedó tapado
  // (por el teclado o por el borde del sheet), lo mínimo necesario y sin
  // animación. Antes se hacía scrollIntoView({block:'center', smooth}) 350 ms
  // después de CUALQUIER focus (incluidos checkbox, selects y campos ya
  // visibles), lo que movía el contenido justo cuando el usuario iba por el
  // siguiente botón.
  var focusEl = null, focusTimer = null;

  // Tipos de <input> que no abren el teclado de texto: no hay nada que revelar.
  var NO_KEYBOARD_TYPES = ['checkbox','radio','range','button','submit','reset',
    'color','file','image','hidden','date','time','datetime-local','month','week'];

  function needsKeyboard(el){
    if(!el || el.readOnly || el.disabled) return false;
    if(el.tagName === 'TEXTAREA') return true;
    if(el.tagName !== 'INPUT') return false;   // <select> usa su selector nativo
    return NO_KEYBOARD_TYPES.indexOf((el.type || 'text').toLowerCase()) === -1;
  }

  function ensureFocusedVisible(){
    var el = focusEl;
    if(!el || !el.isConnected || document.activeElement !== el) return;
    var sheet = el.closest('.sheet');
    if(!sheet) return;
    var overlay = sheet.closest('.overlay');
    if(overlay && !overlay.classList.contains('open')) return;
    if(sheet.scrollHeight <= sheet.clientHeight + 1) return;   // nada que scrollear

    var vv = window.visualViewport;
    var viewTop = vv ? vv.offsetTop : 0;
    var viewBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
    var s = sheet.getBoundingClientRect();
    var r = el.getBoundingClientRect();
    var MARGIN = 16;
    var topLimit = Math.max(viewTop, s.top) + MARGIN;
    var bottomLimit = Math.min(viewBottom, s.bottom) - MARGIN;

    var delta = 0;
    if(r.height > bottomLimit - topLimit) delta = r.top - topLimit;   // campo más alto que el área visible: alinear arriba
    else if(r.bottom > bottomLimit)       delta = r.bottom - bottomLimit;
    else if(r.top < topLimit)             delta = r.top - topLimit;
    if(Math.abs(delta) < 2) return;       // ya se ve: no tocar nada
    sheet.scrollTop += delta;
  }

  // Si el teclado está a mitad de abrirse, el margen del sheet (ver más abajo,
  // "TECLADO") todavía no llegó a su valor final. Medir el campo enfocado
  // en ese momento da un resultado que la propia animación del teclado deja
  // desactualizado un instante después — se ve como un segundo ajuste extra
  // justo después del primero. true si no hay nada pendiente (no hay
  // visualViewport, no hay sheet, o el margen ya quedó donde debía).
  function focusedSheetMarginListo(){
    if(!window.visualViewport) return true;
    var sheet = focusEl && focusEl.closest ? focusEl.closest('.sheet') : null;
    if(!sheet) return true;
    var vv = window.visualViewport;
    var raw = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    var eff = raw > 100 ? raw : 0;
    var actual = parseFloat(sheet.style.marginBottom) || 0;
    return Math.abs(actual - eff) < 20;
  }

  document.addEventListener('focusin', function(e){
    var el = e.target;
    if(!needsKeyboard(el) || !el.closest('.sheet')) return;
    focusEl = el;
    clearTimeout(focusTimer);
    // Da tiempo a que el teclado empiece a animar; el ajuste real espera
    // además a que no haya toques en curso y a que el margen del teclado
    // ya haya llegado a destino (máx. 10 reintentos de 60ms = 600ms extra,
    // por si algo impide que el margen se actualice — mejor centrar tarde
    // que nunca a que quedar esperando para siempre).
    focusTimer = setTimeout(function(){
      var intentos = 0;
      (function esperar(){
        whenQuiet(function(){
          if(!focusedSheetMarginListo() && intentos++ < 10){ setTimeout(esperar, 60); return; }
          ensureFocusedVisible();
        });
      })();
    }, 350);
  });
  document.addEventListener('focusout', function(e){
    if(e.target === focusEl){ focusEl = null; clearTimeout(focusTimer); }
  });

  // ── TECLADO: reposicionar el sheet (Android, Visual Viewport) ─────────────
  // Estado efectivo del teclado: kb = 0 (cerrado) o la altura real (> 100 px).
  // Se compara contra el último estado aplicado, así que un cambio pequeño que
  // cruza el umbral de 100 px nunca deja un margen "pegado".
  var kbState = { kb: 0, h: 0 };
  var watchOverlay = function(){};   // no-op si el navegador no tiene visualViewport

  if(window.visualViewport){
    var kbTimer = null, kbQueued = false;

    var styleSheet = function(sheet, st){
      if(st.kb > 0){
        sheet.style.marginBottom = st.kb + 'px';
        sheet.style.maxHeight = (st.h * 0.92) + 'px';
      } else {
        sheet.style.marginBottom = '';
        sheet.style.maxHeight = '';
      }
    };

    // Espera a que el sheet indicado termine su transición de margin-bottom/
    // max-height (definida en styles.css) antes de llamar fn. Sin esto,
    // ensureFocusedVisible medía la posición del campo a mitad de camino del
    // salto del teclado, calculaba mal cuánto scrollear, y el resultado se
    // veía como "el sheet sube de golpe y después baja un poco" — dos
    // movimientos en vez de uno solo.
    function afterSheetSettles(sheet, fn){
      if(!sheet){ fn(); return; }
      var done = false;
      var finish = function(){
        if(done) return;
        done = true;
        sheet.removeEventListener('transitionend', onEnd);
        fn();
      };
      var onEnd = function(e){
        if(e.target === sheet && (e.propertyName === 'margin-bottom' || e.propertyName === 'max-height')) finish();
      };
      sheet.addEventListener('transitionend', onEnd);
      // Respaldo por si el navegador no dispara transitionend (ej. el valor
      // no cambió lo suficiente para animar, o la transición está deshabilitada
      // en ese momento por el swipe — ver makeSwipeable). 260ms = duración de
      // la transición (220ms, en sync con .sheet en styles.css) + margen.
      setTimeout(finish, 260);
    }

    var applyKbLayout = function(){
      var vv = window.visualViewport;
      var raw = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      var eff = raw > 100 ? raw : 0;
      if(Math.abs(eff - kbState.kb) < 20) return;   // sin cambio significativo
      kbState = { kb: eff, h: vv.height };
      // Todos los sheets (no solo los abiertos ni los que existían al cargar):
      // así un sheet inyectado después, o uno que cerró con el teclado abierto,
      // nunca conserva un margen viejo.
      document.querySelectorAll('.overlay .sheet').forEach(function(s){ styleSheet(s, kbState); });
      var focusedSheet = focusEl && focusEl.closest ? focusEl.closest('.sheet') : null;
      afterSheetSettles(focusedSheet, ensureFocusedVisible);
    };

    // Debounce de 120 ms para no reaccionar a cada frame de la animación del
    // teclado, y además espera a que no haya toques en curso: si el teclado
    // se cierra justo cuando el usuario toca un botón, el toque se completa
    // sobre el layout que vio y recién después se reacomoda.
    var scheduleKb = function(){
      clearTimeout(kbTimer);
      kbTimer = setTimeout(function(){
        if(kbQueued) return;
        kbQueued = true;
        whenQuiet(function(){ kbQueued = false; applyKbLayout(); });
      }, 120);
    };

    window.visualViewport.addEventListener('resize', scheduleKb);
    window.visualViewport.addEventListener('scroll', scheduleKb);

    // Un overlay que se abre con el teclado ya visible arranca con el margen
    // correcto; uno que se cierra queda limpio.
    var overlayObserver = new MutationObserver(function(mutations){
      mutations.forEach(function(m){
        var ov = m.target;
        var sheet = ov.querySelector('.sheet');
        if(!sheet) return;
        styleSheet(sheet, ov.classList.contains('open') ? kbState : { kb: 0, h: 0 });
      });
    });
    watchOverlay = function(ov){
      if(!ov || ov._kbWatched) return;
      ov._kbWatched = true;
      overlayObserver.observe(ov, { attributes: true, attributeFilter: ['class'] });
    };
  }

  // ── SWIPE TO CLOSE — bottom sheets y mas-menu ─────────────────────────────
  var CLOSE_THRESHOLD = 90;        // px arrastrados hacia abajo para cerrar
  var FLICK_MIN_DISTANCE = 40;     // px mínimos para que un "flick" rápido cierre
  var VELOCITY_THRESHOLD = 0.5;    // px/ms de velocidad al soltar
  var DRAG_START_PX = 14;          // movimiento vertical antes de considerarlo un arrastre (un toque con el dedo algo movido no arrastra el sheet)
  var FIELD_TAGS = ['INPUT','TEXTAREA','SELECT'];

  function isKeyboardOpen(){
    if(window.visualViewport){
      return window.innerHeight - window.visualViewport.height > 150;
    }
    return document.activeElement && FIELD_TAGS.indexOf(document.activeElement.tagName) !== -1;
  }

  function makeSwipeable(panel, closeFn){
    var handle = panel.querySelector('.sheet-handle, .mas-menu-handle');
    if(handle) handle.style.cursor = 'grab';

    var startX = 0, startY = 0, lastY = 0, lastT = 0, velocity = 0;
    var dragging = false, animating = false;
    // started: el toque es elegible para convertirse en gesto de cierre.
    // fromHandle: el toque empezó exactamente en el handle.
    var started = false, fromHandle = false;

    // scrollEl: el .sheet mismo (que tiene overflow-y:auto)
    var scrollEl = panel.classList.contains('sheet') ? panel : (panel.querySelector('.sheet') || panel);
    // Que llegar al tope/fondo del sheet no "encadene" el scroll ni el rebote
    // hacia la pantalla de atrás.
    scrollEl.style.overscrollBehaviorY = 'contain';

    function onStart(e){
      if(animating) return;
      if(isKeyboardOpen()){ started = false; return; }
      var touch = e.touches ? e.touches[0] : e;
      startX = touch.clientX;
      startY = touch.clientY;
      lastY = startY;
      lastT = Date.now();
      velocity = 0;
      dragging = false;
      fromHandle = handle ? handle.contains(e.target) : false;
      // Un toque sobre un campo de texto/select es para el campo (mover el
      // cursor, seleccionar), nunca para cerrar el sheet.
      var onField = !fromHandle && e.target && FIELD_TAGS.indexOf(e.target.tagName) !== -1;
      // Elegible si viene del handle, o si el sheet está completamente al tope.
      started = !onField && (fromHandle || scrollEl.scrollTop <= 0);
    }

    function onMove(e){
      if(!started || animating) return;
      var touch = e.touches ? e.touches[0] : e;
      var dy = touch.clientY - startY;
      var dx = touch.clientX - startX;
      var now = Date.now();

      if(!dragging){
        if(dy > DRAG_START_PX){
          // Un gesto más horizontal que vertical no es un cierre.
          if(Math.abs(dx) > dy){ started = false; return; }
          // Si el sheet se scrolleó antes de que el dedo se moviera lo
          // suficiente, dejar que el scroll nativo maneje el gesto.
          if(!fromHandle && scrollEl.scrollTop > 0){ started = false; return; }
          dragging = true;
          // Bloquear scroll del sheet mientras dure el gesto de cierre
          scrollEl.style.overflowY = 'hidden';
        } else if(dy < -4){
          // El usuario scrollea hacia arriba: cancelar gesto de cierre
          started = false;
          return;
        } else {
          lastY = touch.clientY;
          lastT = now;
          return;
        }
      }

      if(dragging && dy > 0){
        // El arrastre parte de 0 (descontando el umbral) para que el sheet no "salte" al empezar.
        var resistance = Math.pow(Math.max(0, dy - DRAG_START_PX), 0.85);
        panel.style.transition = 'none';
        panel.style.transform = 'translateY(' + resistance + 'px)';
        var overlay = panel.closest('.overlay') || panel.closest('.mas-menu-overlay') ||
                      document.getElementById('mas-menu-overlay');
        if(overlay && overlay !== panel){
          overlay.style.opacity = Math.max(0, 1 - resistance / 300);
        }
        if(e.cancelable) e.preventDefault();
      }
      // Velocidad instantánea entre los dos últimos movimientos.
      var dt = now - lastT;
      if(dt > 0) velocity = (touch.clientY - lastY) / dt;
      lastY = touch.clientY;
      lastT = now;
    }

    function onEnd(e){
      if(!started) return;
      started = false;
      if(!dragging) return;
      dragging = false;
      // Restaurar scroll del sheet
      scrollEl.style.overflowY = '';
      var cancelled = e.type === 'touchcancel';   // el sistema interrumpió el gesto: nunca cerrar
      var touch = e.changedTouches ? e.changedTouches[0] : e;
      var dy = touch.clientY - startY;
      // Si el dedo se quedó quieto antes de soltar, no es un flick.
      var v = (Date.now() - lastT) > 100 ? 0 : velocity;

      var overlay = panel.closest('.overlay') || document.getElementById('mas-menu-overlay');
      var shouldClose = !cancelled && (dy > CLOSE_THRESHOLD || (dy > FLICK_MIN_DISTANCE && v > VELOCITY_THRESHOLD));

      if(shouldClose){
        animating = true;
        panel.style.transition = 'transform .22s cubic-bezier(.4,0,1,1)';
        panel.style.transform = 'translateY(110%)';
        if(overlay && overlay !== panel){
          overlay.style.transition = 'opacity .22s';
          overlay.style.opacity = '0';
        }
        setTimeout(function(){
          animating = false;
          panel.style.transform = '';
          panel.style.transition = '';
          if(overlay && overlay !== panel){
            overlay.style.opacity = '';
            overlay.style.transition = '';
          }
          closeFn();
        }, 220);
      } else {
        panel.style.transition = 'transform .3s cubic-bezier(.34,1.4,.64,1)';
        panel.style.transform = 'translateY(0)';
        if(overlay && overlay !== panel){
          overlay.style.transition = 'opacity .3s';
          overlay.style.opacity = '1';
        }
        setTimeout(function(){
          panel.style.transform = '';
          panel.style.transition = '';
          if(overlay && overlay !== panel){
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
    panel.addEventListener('touchcancel', onEnd, { passive: true });
  }

  // ── Inicializar swipe (y vigilancia del teclado) en todos los overlays ────
  // Se llama en DOMContentLoaded para capturar también los sheets que están
  // declarados después de este <script> en el HTML.
  function initAllOverlaySwipes(){
    document.querySelectorAll('.overlay').forEach(function(overlay){
      watchOverlay(overlay);
      // Evitar doble-registro: marcar el overlay como ya inicializado
      if(overlay._swipeInited) return;
      overlay._swipeInited = true;
      var sheet = overlay.querySelector('.sheet');
      if(!sheet) return;
      var sheetId = overlay.id ? overlay.id.replace('sheet-','') : null;
      var closeFn = sheetId
        ? function(){ overlay.style.opacity = ''; closeSheet(sheetId); }
        : function(){ overlay.classList.remove('open'); };
      makeSwipeable(sheet, closeFn);
    });

    // ── Swipe para el mas-menu ─────────────────────────────────────────────
    var masMenu = document.getElementById('mas-menu');
    var masOverlay = document.getElementById('mas-menu-overlay');
    var masBtn = document.getElementById('nav-mas-btn');
    if(masMenu && !masMenu._swipeInited){
      masMenu._swipeInited = true;
      makeSwipeable(masMenu, function(){
        masMenu.style.display = 'none';
        if(masOverlay){ masOverlay.style.opacity = ''; masOverlay.classList.remove('open'); }
        if(masBtn) masBtn.classList.remove('active');
      });
    }
  }

  // Ejecutar después de que todo el HTML haya sido parseado
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', initAllOverlaySwipes);
  } else {
    // Por si este script corre después del DOMContentLoaded
    initAllOverlaySwipes();
  }

  // Exponer también para que _cpInit y otros módulos puedan llamarla
  // cuando inyectan nuevos overlays al DOM después del DOMContentLoaded
  window._makeSheetSwipeable = function(overlayEl){
    if(!overlayEl) return;
    watchOverlay(overlayEl);
    if(overlayEl._swipeInited) return;
    overlayEl._swipeInited = true;
    var sheet = overlayEl.querySelector('.sheet');
    if(!sheet) return;
    var sheetId = overlayEl.id ? overlayEl.id.replace('sheet-','') : null;
    var closeFn = sheetId
      ? function(){ overlayEl.style.opacity = ''; overlayEl.classList.remove('open'); }
      : function(){ overlayEl.classList.remove('open'); };
    makeSwipeable(sheet, closeFn);
  };
})();
