// js/core/saldos-ocultos.js
//
// «Ocultar saldos»: botón del ojo (#btn-toggle-saldos) que difumina los montos de la app y recuerda la elección en
// localStorage ('mf-saldos-ocultos', '1'/'0'; wrapped.js lee esa misma llave). Cubre los elementos fijos (MONEY_SELECTORS) y las
// áreas que se repintan con innerHTML (SALDO_DINAMICO_IDS: se re-aplica tras cada render de esas áreas).
(function(){
  const SALDOS_OCULTOS_KEY = 'mf-saldos-ocultos';
  let _saldosOcultos = localStorage.getItem(SALDOS_OCULTOS_KEY) === '1';
  const MONEY_SELECTORS = [
    '#heroTotal','#hero-estado','#s-disp','#s-nu','#s-ef','#s-nequi','#s-prest','#s-cdt',
    '#s-gf','#s-gv','#s-gtotal','.hero-amount','.stat-value','.row-amount',
    '#det-cuenta-saldo','#nuTotalDisp','.cajita-val','#tc-hero-cupo','.an-bien-monto'
  ];
  // #det-cuenta-saldo: saldo del detalle de Nequi, Efectivo y cuentas personalizadas (una sola
  // pantalla; reemplaza a #det-nequi-saldo, #det-ef-saldo y #det-custom-saldo). Los saldos del
  // selector de Cuentas (#sel-nequi-saldo, #sel-nu-saldo, #sel-ef-saldo, antes elementos fijos) ya
  // no son elementos fijos: renderSelectorCuentas() reescribe todo el contenedor con innerHTML,
  // por eso se tratan como área dinámica (SALDO_DINAMICO_IDS, 'selector-cuentas-lista').

  // Aplica el estado actual de _saldosOcultos al ícono del botón y a los
  // elementos de dinero, sin cambiar el valor de _saldosOcultos. Se usa
  // tanto al hacer click (toggleSaldos) como al restaurar el estado
  // guardado en localStorage al cargar la página.
  function _aplicarEstadoSaldos(){
    const btn = document.getElementById('btn-toggle-saldos');
    if(_saldosOcultos){
      btn.innerHTML = `<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
      btn.style.color = 'var(--accent)';
    } else {
      btn.innerHTML = `<svg aria-hidden="true" id="ojo-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
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
    // vencidos), tarjetas de crédito, selector de cuentas y las listas
    // de gastos: los montos ya están envueltos en spans .saldo-inline
    // (ver 1b más abajo), acá solo se prende/apaga.
    _aplicarOcultoEnAreas();
  }

  function toggleSaldos(){
    _saldosOcultos = !_saldosOcultos;
    localStorage.setItem(SALDOS_OCULTOS_KEY, _saldosOcultos ? '1' : '0');
    _aplicarEstadoSaldos();
  }

  document.getElementById('btn-toggle-saldos').addEventListener('click', toggleSaldos);

  /* ====================================================
     1b. OCULTAR MONTOS EN ÁREAS DINÁMICAS
         (Tendencia mensual/proyección, "Necesita atención" —
         deudas de personas y cobros vencidos—, tarjetas de
         crédito, el selector de cuentas en "Cuentas" (Nequi, Nu, Efectivo y personalizadas), las
         listas de gastos variables/fijos en "Gastos", los
         listados y el historial de Préstamos (me deben / yo
         debo), la lista y estadísticas de Spotify, la lista
         de tarjetas en la pantalla Tarjetas de crédito, y todo
         el contenido de Análisis financiero: balance del mes,
         comparación con el mes anterior, historial de
         patrimonio, categorías, gráfico de gastos por mes,
         ranking de meses y presupuestos). Estos
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
  const SALDO_DINAMICO_IDS = ['proyeccion-card','s-attn-list','tc-deuda-card','selector-cuentas-lista','gastosVarList','gastosFijosList',
    // Préstamos (lo que me deben / lo que debo): listas y detalle
    'deudoresList','misDeudasList','ddHistorial','mdHistorial',
    // Spotify: lista de personas, estadísticas (ganancias) e historial de cobros
    'spotifyList','spStats','spHistorial',
    // Tarjetas de crédito: lista de tarjetas (screen-tarjetas)
    'tc-lista',
    // Análisis financiero: balance del mes, comparación con mes
    // anterior, historial de patrimonio, categorías, gráfico de
    // gastos por mes, ranking de meses, presupuestos e ingresos fijos
    'analisis-balance-hero','an-comparacion','an-patrimonio-chart',
    'an-cats-mes','an-grafico-barras','an-grafico-labels',
    'an-ranking-meses','an-presupuestos','an-ingresos-fijos-list'];
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

  // Restaurar de una vez el estado guardado (botón + montos ya presentes en
  // el HTML inicial). Se hace acá, después de definir SALDO_DINAMICO_IDS y
  // _aplicarOcultoEnAreas (más arriba), porque _aplicarEstadoSaldos() llama
  // a _aplicarOcultoEnAreas() y esta última depende de SALDO_DINAMICO_IDS —
  // llamarla antes de que ese const se inicialice tira
  // "Cannot access 'SALDO_DINAMICO_IDS' before initialization" (TDZ).
  _aplicarEstadoSaldos();
})();
