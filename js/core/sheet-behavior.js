// js/core/sheet-behavior.js
//
// Comportamiento de un `.sheet`/`.overlay` ya abierto, pensado para celular.
// Tres responsabilidades, cada una con UNA sola fuente de verdad:
//
//   1. TECLADO. Mientras el teclado está abierto, el overlay mide EXACTAMENTE
//      lo que el usuario ve (el Visual Viewport) y el sheet, alineado abajo,
//      queda pegado al teclado. Se logra con dos variables CSS en <html>
//      (--vv-top, --vv-h) y la clase `kb-open` —ver styles.css—, escritas de
//      forma síncrona (un rAF) en cada resize/scroll del viewport.
//      Ya no hay márgenes inline por sheet, ni debounce, ni esperas a que "no
//      haya toques", ni transiciones de margin-bottom: todo eso hacía que el
//      sheet llegara a su sitio con un retraso distinto cada vez (a veces
//      saltaba desde abajo del todo, a veces desde la mitad).
//
//   2. CAMPO ENFOCADO VISIBLE. Si el campo con foco queda tapado (por el
//      teclado o por el borde del sheet) se scrollea el .sheet lo mínimo, sin
//      animación, y solo si hace falta. Se evalúa tras cada cambio de layout
//      del teclado y tras el focus; nunca mientras hay un dedo apoyado.
//
//   3. GESTO DE CIERRE hacia abajo (sheets y menú "Más"). Máquina de estados
//      explícita (reposo → armado → arrastrando → asentando) con:
//        · zona de agarre (handle + franja superior) que controla el gesto
//          desde el primer píxel;
//        · en el cuerpo del sheet, solo si NADA debajo del dedo puede seguir
//          scrolleando hacia arriba (ni el sheet ni una lista interna, como
//          la de "¿De quién es la plata?");
//        · seguimiento 1:1 del dedo, escritura por rAF, velocidad medida
//          sobre ~100 ms, cierre/rebote con duración proporcional al
//          recorrido y fondo (backdrop) que se atenúa sin tocar el sheet.
//
// Depende de closeSheet (sheet-stack.js, carga antes). Expone:
//   window._makeSheetSwipeable(overlayEl)  — para overlays inyectados después
//   window.makeSwipeable(panel, closeFn)   — para paneles sueltos (Alcancía)

(function(){
  'use strict';

  var root = document.documentElement;

  // ── DEDOS APOYADOS ────────────────────────────────────────────────────────
  // Solo se usa para no mover el scroll del sheet bajo un dedo. Si un touchend
  // se pierde, un dedo "apoyado" sin eventos durante STALE_MS deja de contar.
  var STALE_MS = 4000;
  var fingers = 0, lastTouchEvt = 0;

  function trackTouch(e){
    fingers = e.touches ? e.touches.length : 0;
    lastTouchEvt = Date.now();
  }
  ['touchstart','touchmove','touchend','touchcancel'].forEach(function(t){
    document.addEventListener(t, trackTouch, {capture:true, passive:true});
  });
  function fingerDown(){
    return fingers > 0 && Date.now() - lastTouchEvt < STALE_MS;
  }

  // ── TECLADO ───────────────────────────────────────────────────────────────
  // Modelo: con teclado, el .overlay empieza donde empieza lo VISIBLE (--vv-top) y
  // llega hasta el borde inferior del layout, o sea que se extiende por debajo del
  // teclado. El sheet, anclado abajo, reserva ese tramo con padding-bottom (--kb-pad):
  //   · su fondo ya está ahí mientras el teclado sube con su animación: nunca se ve
  //     «partido» ni con un hueco;
  //   · como el overlay SIGUE al viewport visual, los desplazamientos que hacen
  //     Android/iOS para mostrar el campo enfocado no mueven el sheet en pantalla
  //     (anclar al borde del layout hacía que saltara y luego se corrigiera);
  //   · el borde superior del sheet depende solo de lo visible y del contenido.
  // «Hay teclado» NO se deduce solo del tamaño del viewport (el navegador lo
  // informa tarde y a saltos): exige además un campo de texto enfocado y visible.
  // Si el foco se va, el espacio se libera en el siguiente frame.
  var KB_ENTER_PX = 60;              // diferencia mínima para entrar al modo teclado
  var KB_EXIT_PX = 30;               // por debajo de esto se sale (histéresis)
  var SETTLE_MS = 160;               // quietud necesaria antes de corregir el scroll
  var vv = window.visualViewport;
  var kbOpen = false;
  var kbRaf = 0;
  var lastLayoutChange = 0;          // última vez que cambió el layout del teclado
  var kbListeners = [];

  // Tipos de <input> que no abren el teclado de texto.
  var NO_KEYBOARD_TYPES = ['checkbox','radio','range','button','submit','reset',
    'color','file','image','hidden','date','time','datetime-local','month','week'];

  function needsKeyboard(el){
    if(!el || el.readOnly || el.disabled) return false;
    if(el.tagName === 'TEXTAREA') return true;
    if(el.tagName !== 'INPUT') return false;   // <select> usa su selector nativo
    return NO_KEYBOARD_TYPES.indexOf((el.type || 'text').toLowerCase()) === -1;
  }

  // Campo de texto enfocado Y visible (uno dentro de un overlay oculto no cuenta).
  function focusedTextField(){
    var el = document.activeElement;
    if(!needsKeyboard(el) || !el.getClientRects().length) return null;
    return el;
  }

  function syncViewport(){
    kbRaf = 0;
    if(!vv) return;

    // Un campo enfocado dentro de algo que se acaba de ocultar (muchos sheets se
    // abren/cierran con classList directo) se suelta ya: así el teclado se cierra
    // junto con el sheet y no cuando el navegador decida limpiar el foco.
    var ae = document.activeElement;
    if(ae && ae !== document.body && ae !== document.documentElement &&
       !ae.getClientRects().length && typeof ae.blur === 'function'){
      try{ ae.blur(); }catch(_){}
    }

    var innerH = window.innerHeight;
    var diff = innerH - vv.height;
    var zoomed = vv.scale && vv.scale > 1.02;       // el pellizco también achica el viewport
    var want = !zoomed && !!focusedTextField() && diff > (kbOpen ? KB_EXIT_PX : KB_ENTER_PX);

    var changed = false;
    if(want){
      // Parte del layout que tapa el teclado (con el desplazamiento del viewport incluido).
      var top = Math.round(vv.offsetTop * 2) / 2;
      var pad = Math.max(0, Math.round((innerH - (vv.offsetTop + vv.height)) * 2) / 2);
      var h = Math.round(vv.height * 2) / 2;
      if(root._kbTop !== top){ root._kbTop = top; root.style.setProperty('--vv-top', top + 'px'); changed = true; }
      if(root._kbPad !== pad){ root._kbPad = pad; root.style.setProperty('--kb-pad', pad + 'px'); changed = true; }
      if(root._kbH !== h){ root._kbH = h; root.style.setProperty('--vv-h', h + 'px'); changed = true; }
      if(!kbOpen){ kbOpen = true; root.classList.add('kb-open'); changed = true; }
    } else if(kbOpen){
      kbOpen = false;
      root._kbPad = root._kbH = root._kbTop = undefined;
      root.classList.remove('kb-open');
      root.style.removeProperty('--kb-pad');
      root.style.removeProperty('--vv-top');
      root.style.removeProperty('--vv-h');
      changed = true;
    }
    if(changed){ lastLayoutChange = Date.now(); kbListeners.forEach(function(fn){ fn(); }); }
  }

  function scheduleViewportSync(){
    if(!kbRaf) kbRaf = requestAnimationFrame(syncViewport);
  }

  if(vv){
    vv.addEventListener('resize', scheduleViewportSync);
    vv.addEventListener('scroll', scheduleViewportSync);
    window.addEventListener('resize', scheduleViewportSync);
    window.addEventListener('orientationchange', scheduleViewportSync);
    window.addEventListener('pageshow', scheduleViewportSync);
    // El foco manda: al enfocar/soltar un campo se re-evalúa en el siguiente frame
    // (así un cambio campo→campo, que dispara focusout y focusin seguidos, no parpadea).
    document.addEventListener('focusin', scheduleViewportSync, {capture:true, passive:true});
    document.addEventListener('focusout', scheduleViewportSync, {capture:true, passive:true});
    // Overlays que se abren/cierran con classList directo (Personas, Plata comprometida...).
    new MutationObserver(function(recs){
      for(var i = 0; i < recs.length; i++){
        if(recs[i].target.classList && recs[i].target.classList.contains('overlay')){ scheduleViewportSync(); return; }
      }
    }).observe(document.body || document.documentElement, {attributes:true, attributeFilter:['class'], subtree:true});
    syncViewport();
  }

  // ── CAMPO ENFOCADO SIEMPRE VISIBLE ────────────────────────────────────────
  var focusEl = null, focusTimers = [], ensureRaf = 0, kbSettleTimer = 0;

  function ensureFocusedVisible(){
    var el = focusEl;
    if(!el || !el.isConnected || document.activeElement !== el) return;
    var sheet = el.closest('.sheet');
    if(!sheet) return;
    var overlay = sheet.closest('.overlay');
    if(overlay && !overlay.classList.contains('open')) return;
    if(sheet.scrollHeight <= sheet.clientHeight + 1) return;   // nada que scrollear
    if(fingerDown()){ queueEnsure(100); return; }              // nunca bajo un dedo
    // Mientras el teclado/sheet todavía se mueve, medir daría posiciones a medio
    // camino y el scroll corregiría de más. Se espera a que se quede quieto.
    var sinceChange = Date.now() - lastLayoutChange;
    if(sinceChange < SETTLE_MS){ queueEnsure(SETTLE_MS - sinceChange + 10); return; }

    var viewTop = vv ? vv.offsetTop : 0;
    var viewBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
    var s = sheet.getBoundingClientRect();
    var r = el.getBoundingClientRect();
    var MARGIN = 16;
    var topLimit = Math.max(viewTop, s.top) + MARGIN;
    var bottomLimit = Math.min(viewBottom, s.bottom) - MARGIN;

    var delta = 0;
    if(r.height > bottomLimit - topLimit) delta = r.top - topLimit;   // más alto que lo visible: alinear arriba
    else if(r.bottom > bottomLimit)       delta = r.bottom - bottomLimit;
    else if(r.top < topLimit)             delta = r.top - topLimit;
    if(Math.abs(delta) < 2) return;       // ya se ve: no tocar nada
    sheet.scrollTop += delta;
  }

  // Reevaluaciones baratas (si el campo ya se ve, no hacen nada).
  function queueEnsure(delay){
    var t = setTimeout(function(){
      focusTimers = focusTimers.filter(function(x){ return x !== t; });
      ensureFocusedVisible();
    }, delay);
    focusTimers.push(t);
  }
  function clearEnsure(){
    focusTimers.forEach(clearTimeout);
    focusTimers = [];
    clearTimeout(kbSettleTimer);
    if(ensureRaf){ cancelAnimationFrame(ensureRaf); ensureRaf = 0; }
  }

  // Cuando el layout del teclado cambia, el sheet ya lo sigue (CSS). El ajuste
  // del scroll se pide una sola vez, cuando lleva SETTLE_MS quieto.
  kbListeners.push(function(){
    if(!focusEl) return;
    clearTimeout(kbSettleTimer);
    kbSettleTimer = setTimeout(ensureFocusedVisible, SETTLE_MS + 10);
  });

  document.addEventListener('focusin', function(e){
    var el = e.target;
    if(!needsKeyboard(el) || !el.closest('.sheet')) return;
    focusEl = el;
    clearEnsure();
    ensureRaf = requestAnimationFrame(function(){ ensureRaf = 0; ensureFocusedVisible(); });
    queueEnsure(150);
    queueEnsure(450);
  });
  document.addEventListener('focusout', function(e){
    if(e.target === focusEl){ focusEl = null; clearEnsure(); }
  });

  // ── CIERRE POR GESTO ──────────────────────────────────────────────────────
  var FIELD_SELECTOR = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';
  var GRAB_ZONE_PX = 56;           // franja superior del sheet que siempre "agarra"
  var START_PX_GRAB = 3;           // movimiento antes de arrancar el arrastre, desde el handle
  var START_PX_BODY = 10;          // ídem, desde el cuerpo del sheet
  var CANCEL_UP_PX = 6;            // movimiento hacia arriba que anula el gesto de cierre
  var CLOSE_FRACTION = 0.33;       // fracción de la altura que alcanza para cerrar...
  var CLOSE_MAX_PX = 170;          // ...con tope absoluto
  var FLICK_VELOCITY = 0.55;       // px/ms
  var FLICK_MIN_DIST = 28;         // px mínimos para que un flick cierre
  var VELOCITY_WINDOW_MS = 100;

  // true si bajo el dedo hay algo que todavía puede scrollear hacia arriba
  // (el propio sheet o cualquier lista interna con scroll): ese gesto es del scroll.
  function canScrollUp(target, panel, scrollEl){
    if(scrollEl.scrollTop > 0) return true;
    for(var el = target; el && el !== panel && el.nodeType === 1; el = el.parentElement){
      if(el.scrollHeight > el.clientHeight + 1 && el.scrollTop > 0){
        var oy = getComputedStyle(el).overflowY;
        if(oy === 'auto' || oy === 'scroll') return true;
      }
    }
    return false;
  }

  function translateYOf(el){
    try{
      var t = getComputedStyle(el).transform;
      if(!t || t === 'none') return 0;
      return new DOMMatrix(t).m42 || 0;
    }catch(_){ return 0; }
  }

  function makeSwipeable(panel, closeFn){
    if(!panel || panel._swipeBound) return;
    panel._swipeBound = true;

    var handle = panel.querySelector('.sheet-handle, .mas-menu-handle');
    var scrollEl = panel.classList.contains('sheet') ? panel : (panel.querySelector('.sheet') || panel);
    // Que llegar al tope/fondo del sheet no "encadene" el scroll ni el rebote
    // hacia la pantalla de atrás.
    scrollEl.style.overscrollBehaviorY = 'contain';

    function getOverlay(){
      return panel.closest('.overlay') || document.getElementById('mas-menu-overlay');
    }

    // Estado del gesto
    var armed = false, dragging = false, settling = false;
    var fromGrab = false, startThreshold = START_PX_BODY;
    var startX = 0, startY = 0, originY = 0;   // originY: desplazamiento con el que empezó (rebote interrumpido)
    var curY = 0, rafId = 0, settleTimer = 0, teHandler = null;
    var samples = [];                          // [{t, y}] para la velocidad
    var overlayEl = null, panelH = 1, kbPull = false;

    function point(e){
      return e.touches && e.touches.length ? e.touches[0] :
             (e.changedTouches && e.changedTouches.length ? e.changedTouches[0] : e);
    }

    function paint(){
      rafId = 0;
      if(!dragging) return;
      panel.style.transform = 'translate3d(0,' + curY + 'px,0)';
      if(overlayEl && overlayEl !== panel){
        var k = Math.max(0, 1 - Math.max(0, curY) / (panelH * 0.9));
        overlayEl.style.setProperty('--ov-k', k.toFixed(3));
      }
    }
    function schedulePaint(){ if(!rafId) rafId = requestAnimationFrame(paint); }

    function clearSettle(){
      clearTimeout(settleTimer); settleTimer = 0;
      if(teHandler){ panel.removeEventListener('transitionend', teHandler); teHandler = null; }
    }
    function resetStyles(){
      if(rafId){ cancelAnimationFrame(rafId); rafId = 0; }
      panel.style.transition = '';
      panel.style.transform = '';
      panel.style.willChange = '';
      if(overlayEl && overlayEl !== panel){
        overlayEl.style.transition = '';
        overlayEl.style.removeProperty('--ov-k');
      }
    }

    function disarm(){
      armed = false;
      detachMouse();
    }

    function onStart(e){
      if(e.touches && e.touches.length > 1){ if(dragging) cancelGesture(); else disarm(); return; }   // multitoque: no es cierre
      if(settling && !panel._swipeRebound) return;                 // cerrando: ignorar
      var p = point(e);
      var rect = panel.getBoundingClientRect();
      var target = e.target;
      var inHandle = !!(handle && handle.contains(target));
      // La franja superior solo es «agarre» si el sheet está arriba del todo: scrolleado,
      // esa franja es contenido y el dedo debe scrollear, no cerrar.
      fromGrab = inHandle || ((p.clientY - rect.top) <= GRAB_ZONE_PX && scrollEl.scrollTop < 8);

      // Un toque sobre un campo es para el campo (cursor, selección), nunca para cerrar.
      if(!inHandle && target && target.closest && target.closest(FIELD_SELECTOR)){ disarm(); return; }
      // Con el teclado abierto el sheet NO se mueve (sheet y teclado se desincronizan):
      // un deslizamiento hacia abajo desde la zona de agarre solo cierra el teclado,
      // y el siguiente cierra el sheet. Desde el cuerpo, el dedo scrollea.
      kbPull = false;
      if(kbOpen){
        if(!fromGrab){ disarm(); return; }
        kbPull = true;
      }
      // En el cuerpo: solo si nada debajo del dedo puede scrollear hacia arriba.
      if(!fromGrab && canScrollUp(target, panel, scrollEl)){ disarm(); return; }

      // Interrumpir un rebote en curso y seguir desde donde está.
      originY = 0;
      if(settling){
        clearSettle();
        originY = Math.max(0, translateYOf(panel));
        panel.style.transition = 'none';
        panel.style.transform = 'translate3d(0,' + originY + 'px,0)';
        settling = false; panel._swipeRebound = false;
      }

      armed = true; dragging = false;
      startX = p.clientX; startY = p.clientY;
      startThreshold = fromGrab ? START_PX_GRAB : START_PX_BODY;
      curY = originY;
      samples = [{ t: Date.now(), y: p.clientY }];
      overlayEl = getOverlay();
      panelH = panel.offsetHeight || 1;
    }

    function onMove(e){
      if(!armed) return;
      if(e.touches && e.touches.length > 1){ cancelGesture(); return; }
      var p = point(e);
      var dy = p.clientY - startY;
      var dx = p.clientX - startX;
      var now = Date.now();

      if(kbPull){
        if(dy < -CANCEL_UP_PX){ disarm(); return; }
        if(dy > 14){
          var ka = document.activeElement;
          if(ka && ka !== document.body && typeof ka.blur === 'function') ka.blur();
          if(e.cancelable) e.preventDefault();
          disarm();
        } else if(dy > 1 && e.cancelable) e.preventDefault();
        return;
      }
      if(!dragging){
        if(dy < -CANCEL_UP_PX){ disarm(); return; }                      // el usuario scrollea hacia arriba
        if(Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > startThreshold){ disarm(); return; }   // gesto horizontal
        if(dy < startThreshold){
          // Desde el handle ya es nuestro: que el navegador no empiece a scrollear.
          if(fromGrab && dy > 1 && e.cancelable) e.preventDefault();
          return;
        }
        // Recomprobar justo antes de arrancar: algo pudo scrollear mientras tanto.
        if(!fromGrab && canScrollUp(e.target, panel, scrollEl)){ disarm(); return; }
        dragging = true;
        panel.style.transition = 'none';
        panel.style.willChange = 'transform';
        if(overlayEl && overlayEl !== panel) overlayEl.style.transition = 'none';
        // Se descuenta el umbral para que el sheet no "salte" al arrancar.
        startY += startThreshold;
        dy = p.clientY - startY;
      }

      // Seguimiento 1:1 hacia abajo. Nunca por encima de su sitio: un desplazamiento
      // negativo deja ver un hueco bajo el sheet.
      curY = Math.max(0, originY + dy);
      if(e.cancelable) e.preventDefault();
      schedulePaint();

      samples.push({ t: now, y: p.clientY });
      while(samples.length > 2 && now - samples[0].t > VELOCITY_WINDOW_MS) samples.shift();
    }

    function velocity(){
      if(samples.length < 2) return 0;
      var a = samples[0], b = samples[samples.length - 1];
      if(Date.now() - b.t > VELOCITY_WINDOW_MS) return 0;   // el dedo se quedó quieto antes de soltar
      var dt = b.t - a.t;
      return dt > 0 ? (b.y - a.y) / dt : 0;
    }

    function cancelGesture(){
      var was = dragging;
      armed = false; dragging = false;
      detachMouse();
      if(was) settle(false, 0);
    }

    function onEnd(e){
      if(!armed) return;
      var wasDragging = dragging;
      armed = false; dragging = false;
      detachMouse();
      if(!wasDragging) return;
      var cancelled = e.type === 'touchcancel';   // el sistema interrumpió el gesto: nunca cerrar
      var v = velocity();
      var limit = Math.min(panelH * CLOSE_FRACTION, CLOSE_MAX_PX);
      var shouldClose = !cancelled && (curY > limit || (curY > FLICK_MIN_DIST && v > FLICK_VELOCITY));
      settle(shouldClose, v);
    }

    // Asentar: cerrar (deslizar fuera) o volver a su sitio. Duración
    // proporcional a lo que falta recorrer y a la velocidad con la que se soltó.
    function settle(close, v){
      settling = true;
      clearSettle();
      // Un cuadro de arrastre aún pendiente se aplicaría DESPUÉS de iniciar la
      // animación y devolvería el sheet a su posición anterior (se veía como
      // «se queda arriba y baja de golpe»).
      if(rafId){ cancelAnimationFrame(rafId); rafId = 0; }
      var done = false;
      var finish = function(){
        if(done) return;
        done = true;
        clearSettle();
        if(close){
          // El sheet se queda fuera de pantalla hasta que closeFn lo oculta, y
          // recién ahí se limpian los estilos: sin parpadeo al volver a abrir.
          try{ closeFn(); }finally{
            resetStyles();
            settling = false; panel._swipeRebound = false;
          }
        } else {
          resetStyles();
          settling = false; panel._swipeRebound = false;
        }
      };
      var onTe = function(ev){ if(ev.target === panel && ev.propertyName === 'transform') finish(); };

      var dur, ease, target;
      if(close){
        target = panelH + 24;
        var remaining = Math.max(40, target - curY);
        dur = Math.round(Math.min(280, Math.max(140, remaining / Math.max(0.9, v) )));
        ease = 'cubic-bezier(.3,.7,.4,1)';
        // Antes de animar la salida: si hay teclado abierto, soltarlo.
        var ae = document.activeElement;
        if(ae && panel.contains(ae) && typeof ae.blur === 'function') ae.blur();
      } else {
        target = 0;
        dur = 260;
        ease = 'cubic-bezier(.22,1,.36,1)';
        panel._swipeRebound = true;
      }
      teHandler = onTe;
      panel.addEventListener('transitionend', onTe);
      // Aplicar ya la posición final del dedo (el cuadro pendiente se descartó) y
      // forzar ese estilo antes de activar la transición: arranca desde el dedo.
      panel.style.transition = 'none';
      panel.style.transform = 'translate3d(0,' + curY + 'px,0)';
      void panel.offsetHeight;
      panel.style.transition = 'transform ' + dur + 'ms ' + ease;
      panel.style.transform = 'translate3d(0,' + target + 'px,0)';
      if(overlayEl && overlayEl !== panel){
        overlayEl.style.transition = '--ov-k ' + dur + 'ms linear';
        overlayEl.style.setProperty('--ov-k', close ? '0' : '1');
      }
      settleTimer = setTimeout(finish, dur + 60);   // respaldo si no llega transitionend
    }

    // ── Listeners táctiles ──
    // touchstart pasivo; touchmove NO pasivo para poder impedir el scroll nativo.
    panel.addEventListener('touchstart', onStart, { passive: true });
    panel.addEventListener('touchmove', onMove, { passive: false });
    panel.addEventListener('touchend', onEnd, { passive: true });
    panel.addEventListener('touchcancel', onEnd, { passive: true });

    // ── Ratón (escritorio): solo desde la zona de agarre ──
    var mouseOn = false;
    function onMouseMove(e){ onMove(e); }
    function onMouseUp(e){ onEnd(e); }
    function detachMouse(){
      if(!mouseOn) return;
      mouseOn = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }
    panel.addEventListener('mousedown', function(e){
      if(e.button !== 0) return;
      var rect = panel.getBoundingClientRect();
      var inGrab = (handle && handle.contains(e.target)) || ((e.clientY - rect.top) <= GRAB_ZONE_PX && scrollEl.scrollTop < 8);
      if(!inGrab) return;
      onStart(e);
      if(!armed) return;
      mouseOn = true;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  // ── Cerrar un overlay por gesto: siempre por closeSheet (mantiene la pila) ─
  function closeOverlayFn(overlay){
    var sheetId = overlay.id && overlay.id.indexOf('sheet-') === 0 ? overlay.id.slice(6) : null;
    return function(){
      if(sheetId && typeof closeSheet === 'function') closeSheet(sheetId);
      else overlay.classList.remove('open');
    };
  }

  function bindOverlay(overlay){
    if(!overlay || overlay._swipeInited) return;
    var sheet = overlay.querySelector('.sheet');
    if(!sheet) return;
    overlay._swipeInited = true;
    makeSwipeable(sheet, closeOverlayFn(overlay));
  }

  function bindMasMenu(){
    var masMenu = document.getElementById('mas-menu');
    var masOverlay = document.getElementById('mas-menu-overlay');
    var masBtn = document.getElementById('nav-mas-btn');
    if(!masMenu || masMenu._swipeInited) return;
    masMenu._swipeInited = true;
    makeSwipeable(masMenu, function(){
      masMenu.style.display = 'none';
      if(masOverlay) masOverlay.classList.remove('open');
      if(masBtn) masBtn.classList.remove('active');
    });
  }

  // Se llama tras el parseo completo para capturar también los sheets
  // declarados después de este <script> en el HTML.
  function initAll(){
    document.querySelectorAll('.overlay').forEach(bindOverlay);
    bindMasMenu();
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAll);
  else initAll();

  // Overlays inyectados después del DOMContentLoaded (Personas, Plata
  // comprometida, Alcancía...) piden el gesto con esta función.
  window._makeSheetSwipeable = bindOverlay;
  window.makeSwipeable = makeSwipeable;
})();
