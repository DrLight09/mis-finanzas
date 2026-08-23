// "MEJORAS ADICIONALES" (parte 1): ocultar saldos, hook de refresh para
// salud financiera / proyección / presupuestos, validación de montos,
// animación de carga inicial — extraído de index.html. Ver auditoria-tecnica.md #2.

(function(){
  /* ====================================================
     1. OCULTAR/MOSTRAR SALDOS
  ==================================================== */
  let _saldosOcultos = false;
  const MONEY_SELECTORS = [
    '#heroTotal','#s-disp','#s-nu','#s-ef','#s-nequi','#s-prest','#s-cdt',
    '#s-gf','#s-gv','#s-gtotal','.hero-amount','.stat-value','.row-amount',
    '#det-nequi-saldo','#det-ef-saldo','#nuTotalDisp','#sel-nequi-saldo',
    '#sel-nu-saldo','#sel-ef-saldo','.cajita-val','#det-custom-saldo'
  ];

  function toggleSaldos(){
    _saldosOcultos = !_saldosOcultos;
    const btn = document.getElementById('btn-toggle-saldos');
    if(_saldosOcultos){
      btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
      btn.style.color = 'var(--accent)';
    } else {
      btn.innerHTML = `<svg id="ojo-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
      btn.style.color = 'var(--text2)';
    }
    // Aplicar blur a todos los elementos de dinero
    MONEY_SELECTORS.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        if(_saldosOcultos) el.classList.add('saldo-hidden');
        else el.classList.remove('saldo-hidden');
      });
    });
    // Proyección, "Necesita atención" (deudas de personas y cobros
    // vencidos), tarjetas de crédito, cuentas personalizadas y las listas
    // de gastos: los montos ya están envueltos en spans .saldo-inline
    // (ver 1b más abajo), acá solo se prende/apaga.
    _aplicarOcultoEnAreas();
  }

  document.getElementById('btn-toggle-saldos').addEventListener('click', toggleSaldos);

  /* ====================================================
     1b. OCULTAR MONTOS EN ÁREAS DINÁMICAS
         (Tendencia mensual/proyección, "Necesita atención" —
         deudas de personas y cobros vencidos—, tarjetas de
         crédito, cuentas personalizadas en "Cuentas", las
         listas de gastos variables/fijos en "Gastos", los
         listados y el historial de Préstamos (me deben / yo
         debo), la lista y estadísticas de Spotify, y la lista
         de tarjetas en la pantalla Tarjetas de crédito). Estos
         contenedores se re-renderizan completos con innerHTML
         desde otros módulos (inicio.js y los módulos de
         tarjetas/cuentas/gastos), así que en vez de apuntar a
         selectores fijos como en MONEY_SELECTORS, se busca
         cualquier texto con formato "$..." dentro de ellos, se
         envuelve en un <span class="saldo-inline"> y se observa
         el contenedor para repetir el envoltorio cada vez que
         su contenido se vuelve a pintar.

         Nota: esto solo oculta MONTOS. El nombre/descripción de
         cada gasto (ej. "Uber", "Farmacia") sigue visible — no
         se toca ese texto.
  ==================================================== */
  const SALDO_DINAMICO_IDS = ['proyeccion-card','s-attn-list','tc-deuda-card','custom-cuentas-list','gastosVarList','gastosFijosList',
    // Préstamos (lo que me deben / lo que debo): listas y detalle
    'deudoresList','misDeudasList','ddHistorial','mdHistorial',
    // Spotify: lista de personas, estadísticas (ganancias) e historial de cobros
    'spotifyList','spStats','spHistorial',
    // Tarjetas de crédito: lista de tarjetas (screen-tarjetas)
    'tc-lista'];
  const REGEX_MONTO = /[-+]?\$\s?\d[\d.,]*/g;

  function _envolverMontos(root){
    if(!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node){
        if(node.parentElement && node.parentElement.classList.contains('saldo-inline')) return NodeFilter.FILTER_REJECT;
        REGEX_MONTO.lastIndex = 0;
        return REGEX_MONTO.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const nodos = [];
    let n;
    while((n = walker.nextNode())) nodos.push(n);
    nodos.forEach(textNode => {
      REGEX_MONTO.lastIndex = 0;
      const montos = textNode.nodeValue.match(REGEX_MONTO);
      if(!montos) return;
      const partes = textNode.nodeValue.split(REGEX_MONTO);
      const frag = document.createDocumentFragment();
      partes.forEach((parte, i) => {
        if(parte) frag.appendChild(document.createTextNode(parte));
        if(montos[i]){
          const span = document.createElement('span');
          span.className = 'saldo-inline' + (_saldosOcultos ? ' saldo-hidden' : '');
          span.textContent = montos[i];
          frag.appendChild(span);
        }
      });
      textNode.parentNode.replaceChild(frag, textNode);
    });
  }

  function _aplicarOcultoEnAreas(){
    SALDO_DINAMICO_IDS.forEach(id => {
      const el = document.getElementById(id);
      if(!el) return;
      el.querySelectorAll('.saldo-inline').forEach(span => {
        span.classList.toggle('saldo-hidden', _saldosOcultos);
      });
    });
  }

  const _obsAreasSaldo = {};
  function _observarAreaSaldo(id){
    const el = document.getElementById(id);
    if(!el || _obsAreasSaldo[id]) return;
    _envolverMontos(el);
    const obs = new MutationObserver(() => {
      // Desconectar mientras tocamos el DOM nosotros mismos, para no
      // reaccionar a nuestro propio envoltorio (evita loop/recursión).
      obs.disconnect();
      _envolverMontos(el);
      _aplicarOcultoEnAreas();
      obs.observe(el, {childList:true, subtree:true});
    });
    obs.observe(el, {childList:true, subtree:true});
    _obsAreasSaldo[id] = obs;
  }

  // Los contenedores ya existen en el HTML inicial (aunque arranquen
  // vacíos o en display:none), así que se observan de una vez. appDataLoaded
  // vuelve a intentarlo por si alguno se creó después.
  SALDO_DINAMICO_IDS.forEach(_observarAreaSaldo);
  window.addEventListener('appDataLoaded', function(){
    SALDO_DINAMICO_IDS.forEach(_observarAreaSaldo);
  });

  /* ====================================================
     2. BÚSQUEDA GLOBAL — migrado a js/core/busqueda-global.js
        Ver auditoria-tecnica.md. Sin dependencia real de orden de
        carga, se carga como <script src> aparte, ver el final del
        <body> (junto a los demás módulos de js/core y js/modules).
  ==================================================== */

  /* ====================================================
     3. INDICADOR DE SALUD FINANCIERA — migrado a js/modules/inicio.js
        (calcHealthScore() y renderHealthScore()). Ver auditoria-tecnica.md.
        Quedan como funciones globales; _renderMejoras() (sección 8, más
        abajo) las sigue llamando desde acá porque ese mismo hook también
        dispara renderPresupuestos() (módulo de Análisis, no de Inicio).
  ==================================================== */

  /* ====================================================
     4. PROYECCIÓN FINANCIERA — migrado a js/modules/inicio.js
        (renderProyeccion()). Ver auditoria-tecnica.md. _renderMejoras()
        (sección 8, abajo) la sigue llamando desde acá por el mismo motivo
        que la sección 3.
  ==================================================== */


  /* ==== 6. PRESUPUESTOS: migrado a js/modules/analisis.js (abrirPresupuestos, renderPresupuestos) ==== */

  /* ====================================================
     7. EXPORTAR CSV: migrado a js/modules/configuracion.js
  ==================================================== */

  /* ====================================================
     8. HOOK EN REFRESH para nuevas funciones
  ==================================================== */
  // Renderizar salud y proyección directamente (sin depender del hook de refresh)
  function _renderMejoras() {
    try { renderHealthScore(); } catch(e){}
    try { renderProyeccion(); } catch(e){}
    try { renderPresupuestos(); } catch(e){}
  }

  // Guard: si refresh no existe aún, esperar a que esté disponible
  function _hookRefreshMejoras(originalFn) {
    window.refresh = function(){
      if(originalFn) { try { originalFn.apply(this, arguments); } catch(e){ console.error('[refresh] Error en refresh original:', e); } }
      _renderMejoras();
    };
  }
  if (typeof window.refresh === 'function') {
    _hookRefreshMejoras(window.refresh);
  } else {
    // refresh aún no definida — esperar con polling
    const _tRefresh = setInterval(() => {
      if (typeof window.refresh === 'function') {
        clearInterval(_tRefresh);
        _hookRefreshMejoras(window.refresh);
      }
    }, 100);
  }

  // Llamar directamente cuando Firebase termina de cargar los datos.
  // Necesario porque los módulos type="module" se ejecutan DESPUÉS que los scripts
  // inline, por lo que cuando _initAppUI llama refresh() el hook aún no está instalado.
  window.addEventListener('appDataLoaded', function() {
    setTimeout(_renderMejoras, 300);
  });

  /* ====================================================
     9. VALIDACIÓN MEJORADA DE MONTOS (numéricos grandes)
  ==================================================== */
  document.addEventListener('change', e => {
    const inp = e.target;
    if(!inp.classList.contains('money-input')) return;
    const val = window.parseMoney ? window.parseMoney(inp.value) : 0;
    if(val < 0){
      if(window.toast) window.toast('El monto no puede ser negativo','err');
      inp.value = '';
    }
    if(val > 1e12){
      if(window.toast) window.toast('El monto parece demasiado grande','err');
      inp.value = '';
    }
  });

  /* ====================================================
     10. ANIMACIÓN DE CARGA INICIAL (fade-in del app)
  ==================================================== */
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

})();
