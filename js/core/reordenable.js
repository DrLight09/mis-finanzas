/* ═══════════════════════════════════════════════════════════════
   js/core/reordenable.js — Reordenable: arrastrar y soltar para cambiar el orden de fichas o filas.

   Núcleo eager y genérico (hoy lo usa Cuentas; mañana puede usarlo cualquier lista). No sabe nada de cuentas: se le dice qué
   elementos se mueven y qué hacer con el orden nuevo.

     const quitar = Reordenable.activar(contenedor, {
       item:      '[data-cuenta-id]',          // selector de cada ficha (dentro del contenedor)
       id:        n => n.dataset.cuentaId,     // id de una ficha
       agarre:    '.cuenta-ord-grip',          // (opcional) zona que arrastra SIN espera con el dedo; el resto de la ficha, con pulsación larga
       activo:    () => modoOrden,             // (opcional) solo reacciona mientras devuelva true
       onOrden:   ids => { ... },              // se llama al soltar con los ids en el orden nuevo (solo si cambió)
       onTeclado: (id, dir) => { ... },        // (opcional) flechas del teclado sobre el agarre: dir −1 / +1
     });

   Cómo se siente:
     · La ficha agarrada sigue al dedo/ratón (levantada, con sombra); las demás se deslizan a su sitio nuevo en vivo (solo con
       transform: no se toca el DOM hasta soltar, así no hay saltos ni parpadeos).
     · Al soltar, la ficha «encaja» en su hueco con una animación corta y entonces se llama a onOrden (que repinta con el orden nuevo
       justo donde quedaron las fichas).
     · Si el dedo/ratón se acerca al borde de la pantalla, la lista se desplaza sola.
     · Ratón: arranca tras mover 4 px. Dedo/lápiz: el agarre arranca al tocar; en el resto de la ficha, tras 220 ms quieto (pulsación
       larga) con una vibración corta, para no pelear con el desplazamiento normal de la página.
     · Escape cancela. Si el contenedor se repinta a mitad de arrastre, se cancela solo.
     · prefers-reduced-motion: sin deslizamientos, la ficha cambia de sitio directamente.

   Requisitos de las fichas: todas del MISMO tamaño (los huecos se intercambian por traslación). En CSS, el agarre lleva
   `touch-action:none` y las fichas `user-select:none`. Las clases que pone (reord-activo, reord-arrastrando, reord-mueve) las pinta
   css/styles.css.
   ═══════════════════════════════════════════════════════════════ */
const Reordenable = (function () {
  const UMBRAL_RATON = 4;      // px de movimiento para empezar con el ratón
  const UMBRAL_CANCELA = 9;    // px que cancelan una pulsación larga (el usuario estaba desplazando la página)
  const ESPERA_TOQUE = 220;    // ms de pulsación larga con el dedo fuera del agarre
  const BORDE_AUTOSCROLL = 72; // px del borde visible donde empieza el desplazamiento automático
  const MAX_VELOCIDAD = 16;    // px por cuadro

  function _menosMovimiento() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  // Ancestro con scroll vertical (o el documento si no hay).
  function _scroller(el) {
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const o = getComputedStyle(n).overflowY;
      if ((o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight + 1) return n;
    }
    return document.scrollingElement || document.documentElement;
  }

  function activar(cont, op) {
    if (!cont) return function () {};
    const cfg = Object.assign({ activo: () => true, retardoToque: ESPERA_TOQUE }, op);
    let pend = null;   // pulsación todavía sin arrancar
    let drag = null;   // arrastre en curso

    /* ───────── geometría ───────── */
    function _esRaiz(sc) { return sc === document.scrollingElement || sc === document.documentElement || sc === document.body; }
    function _origen(sc) { return _esRaiz(sc) ? { x: 0, y: 0 } : (function () { const r = sc.getBoundingClientRect(); return { x: r.left, y: r.top }; })(); }
    // Coordenadas «de contenido» (no cambian al desplazar): permiten comparar el dedo con los huecos aunque la lista se haya movido.
    function _aContenido(d, cx, cy) {
      const o = _origen(d.sc);
      return { x: cx - o.x + d.sc.scrollLeft, y: cy - o.y + d.sc.scrollTop };
    }

    /* ───────── ciclo de vida ───────── */
    function _limpiaListeners() {
      window.removeEventListener('pointermove', _mover, true);
      window.removeEventListener('pointerup', _soltar, true);
      window.removeEventListener('pointercancel', _cancelar, true);
      window.removeEventListener('keydown', _tecla, true);
    }
    function _ponListeners() {
      window.addEventListener('pointermove', _mover, true);
      window.addEventListener('pointerup', _soltar, true);
      window.addEventListener('pointercancel', _cancelar, true);
      window.addEventListener('keydown', _tecla, true);
    }

    function _empezar(item, e) {
      const items = Array.from(cont.querySelectorAll(cfg.item));
      const from = items.indexOf(item);
      if (from < 0) return false;
      const sc = _scroller(cont);
      const d = { items, from, to: from, sc, pointerId: e.pointerId, cx: e.clientX, cy: e.clientY, raf: 0, fin: false };
      d.slots = items.map(n => {
        const r = n.getBoundingClientRect(), p = _aContenido(d, r.left, r.top);
        return { x: p.x, y: p.y, cx: p.x + r.width / 2, cy: p.y + r.height / 2 };
      });
      d.ini = _aContenido(d, e.clientX, e.clientY);
      drag = d;
      cont.classList.add('reord-activo');
      items.forEach(n => { if (n !== item) n.classList.add('reord-mueve'); });
      item.classList.add('reord-arrastrando');
      try { item.setPointerCapture(e.pointerId); } catch (_) {}
      if (navigator.vibrate) { try { navigator.vibrate(12); } catch (_) {} }
      _actualiza();
      _bucleAutoscroll();
      return true;
    }

    // Hueco más cercano al centro de la ficha arrastrada, y colocación de las demás según el orden virtual.
    function _actualiza() {
      const d = drag;
      if (!d || d.fin) return;
      if (!d.items[0] || !d.items[0].isConnected) { _terminar(false, true); return; } // se repintó a mitad de arrastre
      const p = _aContenido(d, d.cx, d.cy);
      const dx = p.x - d.ini.x, dy = p.y - d.ini.y;
      const movimiento = d.items[d.from];
      movimiento.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(1.04)';
      const cx = d.slots[d.from].cx + dx, cy = d.slots[d.from].cy + dy;
      let mejor = d.to, dist = Infinity;
      d.slots.forEach((s, k) => {
        const dd = (s.cx - cx) * (s.cx - cx) + (s.cy - cy) * (s.cy - cy);
        if (dd < dist) { dist = dd; mejor = k; }
      });
      if (mejor !== d.to) { d.to = mejor; _coloca(); }
    }

    function _ordenVirtual(d) {
      const idx = d.items.map((_, i) => i).filter(i => i !== d.from);
      idx.splice(d.to, 0, d.from);
      return idx; // idx[posición] = índice original de la ficha que va ahí
    }
    function _coloca() {
      const d = drag, orden = _ordenVirtual(d), reducir = _menosMovimiento();
      orden.forEach((orig, pos) => {
        if (orig === d.from) return;
        const n = d.items[orig], a = d.slots[orig], b = d.slots[pos];
        const dx = b.x - a.x, dy = b.y - a.y;
        if (reducir) n.classList.remove('reord-mueve');
        n.style.transform = (dx || dy) ? 'translate(' + dx + 'px,' + dy + 'px)' : '';
      });
    }

    function _bucleAutoscroll() {
      const d = drag;
      if (!d || d.fin) return;
      const sc = d.sc, raiz = _esRaiz(sc);
      const arriba = raiz ? 0 : sc.getBoundingClientRect().top;
      const abajo = raiz ? window.innerHeight : sc.getBoundingClientRect().bottom;
      let v = 0;
      if (d.cy < arriba + BORDE_AUTOSCROLL) v = -MAX_VELOCIDAD * Math.min(1, (arriba + BORDE_AUTOSCROLL - d.cy) / BORDE_AUTOSCROLL);
      else if (d.cy > abajo - BORDE_AUTOSCROLL) v = MAX_VELOCIDAD * Math.min(1, (d.cy - (abajo - BORDE_AUTOSCROLL)) / BORDE_AUTOSCROLL);
      if (v) {
        const antes = sc.scrollTop;
        sc.scrollTop += v;
        if (sc.scrollTop !== antes) _actualiza();
      }
      d.raf = requestAnimationFrame(_bucleAutoscroll);
    }

    // commit=true: encaja en el hueco elegido y avisa con el orden nuevo; false: vuelve a su sitio original.
    function _terminar(commit, abortado) {
      const d = drag;
      if (!d || d.fin) return;
      d.fin = true;
      cancelAnimationFrame(d.raf);
      _limpiaListeners();
      try { d.items[d.from].releasePointerCapture(d.pointerId); } catch (_) {}
      const movimiento = d.items[d.from];
      const ids = (function () {
        const base = d.items.map(n => cfg.id(n));
        const idx = commit ? _ordenVirtual(d) : d.items.map((_, i) => i);
        return idx.map(i => base[i]);
      })();
      const cambio = commit && d.to !== d.from;
      const limpiar = function () {
        d.items.forEach(n => { n.style.transform = ''; n.style.transition = ''; n.classList.remove('reord-mueve', 'reord-arrastrando'); });
        cont.classList.remove('reord-activo');
        drag = null;
        if (cambio && !abortado && typeof cfg.onOrden === 'function') cfg.onOrden(ids);
      };
      if (abortado || !movimiento.isConnected) { limpiar(); return; }
      // Encaje: la ficha viaja a su hueco; las demás ya están en el suyo (se les quita el transform al repintar).
      const meta = commit ? d.to : d.from;
      const a = d.slots[d.from], b = d.slots[meta];
      const dx = b.x - a.x, dy = b.y - a.y;
      if (!commit) d.items.forEach((n, i) => { if (i !== d.from) n.style.transform = ''; });
      if (_menosMovimiento()) { limpiar(); return; }
      movimiento.style.transition = 'transform .2s cubic-bezier(.2,.8,.2,1), box-shadow .2s';
      movimiento.classList.remove('reord-arrastrando');
      movimiento.classList.add('reord-encaja');
      movimiento.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      let hecho = false;
      const fin = function () { if (hecho) return; hecho = true; movimiento.classList.remove('reord-encaja'); limpiar(); };
      movimiento.addEventListener('transitionend', fin, { once: true });
      setTimeout(fin, 260);
    }

    /* ───────── eventos ───────── */
    function _mover(e) {
      if (e.pointerId !== (drag ? drag.pointerId : pend && pend.pointerId)) return;
      if (drag) {
        drag.cx = e.clientX; drag.cy = e.clientY;
        _actualiza();
        e.preventDefault();
        return;
      }
      if (!pend) return;
      const mx = e.clientX - pend.x, my = e.clientY - pend.y;
      const lejos = Math.hypot(mx, my);
      if (pend.espera) {
        // Dedo fuera del agarre, esperando la pulsación larga: si se mueve, es un desplazamiento normal de la página.
        if (lejos > UMBRAL_CANCELA) _anula();
      } else if (lejos > UMBRAL_RATON) {
        const item = pend.item, ev = { pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY };
        _anula(true);
        _ponListeners();
        pend = null;
        _empezar(item, ev);
      }
    }
    function _soltar(e) {
      if (drag) { if (e.pointerId === drag.pointerId) _terminar(true); return; }
      if (pend && e.pointerId === pend.pointerId) _anula();
    }
    function _cancelar(e) {
      if (drag) { if (e.pointerId === drag.pointerId) _terminar(false); return; }
      if (pend && e.pointerId === pend.pointerId) _anula();
    }
    function _tecla(e) {
      if (e.key === 'Escape' && drag) { e.preventDefault(); _terminar(false); }
    }
    function _anula(conservaListeners) {
      if (pend && pend.timer) clearTimeout(pend.timer);
      pend = null;
      if (!conservaListeners && !drag) _limpiaListeners();
    }

    function _abajo(e) {
      if (drag || !cfg.activo()) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const item = e.target.closest && e.target.closest(cfg.item);
      if (!item || !cont.contains(item)) return;
      const enAgarre = !cfg.agarre || !!e.target.closest(cfg.agarre);
      const tactil = e.pointerType !== 'mouse';
      _anula();
      pend = { item, pointerId: e.pointerId, x: e.clientX, y: e.clientY, espera: false, timer: 0 };
      _ponListeners();
      if (tactil && cfg.agarre && enAgarre) {
        // Agarre con el dedo: arranca al instante.
        const ev = { pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY };
        pend = null;
        _empezar(item, ev);
      } else if (tactil) {
        pend.espera = true;
        pend.timer = setTimeout(function () {
          const p = pend; if (!p) return;
          pend = null;
          _empezar(p.item, { pointerId: p.pointerId, clientX: p.x, clientY: p.y });
        }, cfg.retardoToque);
      }
      // Ratón: espera a moverse UMBRAL_RATON px (en _mover).
    }

    function _teclaAgarre(e) {
      if (!cfg.activo() || typeof cfg.onTeclado !== 'function') return;
      const g = cfg.agarre && e.target.closest && e.target.closest(cfg.agarre);
      if (!g) return;
      const dir = (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -1 : (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1 : 0;
      if (!dir) return;
      const item = g.closest(cfg.item);
      if (!item) return;
      e.preventDefault();
      cfg.onTeclado(cfg.id(item), dir);
    }

    // Mientras se arrastra, el navegador no debe desplazar la página ni abrir el menú contextual (pulsación larga en móvil).
    function _toqueMueve(e) { if (drag) e.preventDefault(); }
    function _menu(e) { if (cfg.activo() && (drag || pend)) e.preventDefault(); }

    cont.addEventListener('pointerdown', _abajo);
    cont.addEventListener('keydown', _teclaAgarre);
    cont.addEventListener('touchmove', _toqueMueve, { passive: false });
    cont.addEventListener('contextmenu', _menu);
    return function desactivar() {
      cont.removeEventListener('pointerdown', _abajo);
      cont.removeEventListener('keydown', _teclaAgarre);
      cont.removeEventListener('touchmove', _toqueMueve);
      cont.removeEventListener('contextmenu', _menu);
      if (drag) _terminar(false, true);
      _anula();
    };
  }

  return { activar };
})();
