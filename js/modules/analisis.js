/* ═══════════════════════════════════════════════════════════════
   js/modules/analisis.js

   Módulo de Análisis financiero: resumen del mes, ingresos fijos,
   comparación con el mes anterior, historial de patrimonio, top
   categorías, gráfico de gastos por mes, ranking de meses y
   presupuestos por categoría.

   Este módulo nunca apareció en docs/auditoria-tecnica.md — se
   descubrió al revisar los onclick restantes tras cerrar el hueco
   de Configuración. Es la primera vez que se extrae, siguiendo el
   mismo patrón data-action/Events.registerAll que Spotify, Mesada,
   Encargos, Préstamos, Tarjetas de Crédito, Cuentas, Gastos, Plata
   Comprometida, Alcancía y Configuración.

   Lo que NO vive acá a propósito (núcleo compartido):
     - calcPatrimonioTotal() / snapshotPatrimonio() están en js/core/core-state.js:
       las llama save() en CADA guardado, no solo al entrar a Análisis, para
       alimentar el historial que después se grafica acá.
     - renderHealthScore()/renderProyeccion() están en js/modules/inicio.js.
     - Todo lo que cuenta como ingreso o gasto de un mes sale de Periodo
       (js/core/periodo.js), la misma fuente que usan Inicio, el cierre de mes,
       el CSV de Configuración y Wrapped.

   ═══════════════════════════════════════════════════════════════ */

/* ---- ANÁLISIS FINANCIERO ---- */
function renderAnalisis(){
  const mes=mesActual();
  const MESES_NOMBRE=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  // ── Ingresos fijos (card editable) ────────────────────────────────────
  renderIngresosFijos();

  // ── Gastos del mes actual ──────────────────────────────────────────────
  // Nota: no hace falta excluir "favores" pagados con plata comprometida aquí —
  // esos gastos nunca se guardan en S.gastosVar. Viven en tc.compras (con
  // _esFavor/_desdeCP cuando se pagan con TC) o son solo una reposición de
  // cajita marcada con _esReposicionCP en S.movimientos. Ver _esEntradaEspejoNoIngreso.
  // También excluir _esExtraPrestamo: es plata de un extra/propina que se gastó de inmediato
  // (nunca se registró como ingreso, así que contarla como gasto real infla el balance negativamente)
  // conRendimientos: en Análisis los intereses de Nu (cajitas y CDT) cuentan como ingreso del mes, para que el balance
  // mida cuánto creció el patrimonio. Inicio/Salud financiera no lo piden: sus ratios miden flujo de caja operativo.
  const _bal=Periodo.balanceDelMes(mes,undefined,{conRendimientos:true});
  const gastosMesDet=_bal.gastos;
  const gvTotal=gastosMesDet.gvTotal;
  const gfTotal=gastosMesDet.gfTotal;
  const gastosTotalMes=gastosMesDet.total;

  // ── Ingresos del mes: mesada + ingresos fijos + entradas reales (periodo.js, regla única
  // compartida con Inicio, cierre de mes y Wrapped) ─────────────────────
  const mesNum=parseInt(mes.split('-')[1])-1;
  const anio=parseInt(mes.split('-')[0]);
  const ingresosEstimados=_bal.ingresos.total;

  // ── Balance ────────────────────────────────────────────────────────────
  const balance=ingresosEstimados-gastosTotalMes;
  const _rendNu=_bal.ingresos.rendimientos||0; // intereses de cajitas y CDT incluidos en los ingresos del mes
  const _hayIngresos=ingresosEstimados-_rendNu>0; // sin ingresos operativos no hay balance que evaluar, aunque haya intereses
  const _cero=Math.abs(balance)<0.005;        // el cero exacto no es ni ahorro ni déficit: se queda neutro
  const hero=document.getElementById('analisis-balance-hero');
  if(hero){
    // Un estado por escenario: color (clase an-hero-pos/neg/neu), signo del monto y mensaje dicen lo mismo.
    //   sin ingresos y sin gastos → neutro · sin ingresos y con gastos → rojo · ingresos > gastos → verde
    //   ingresos = gastos → neutro · gastos > ingresos → rojo
    const sinIngresos=!_hayIngresos;
    const sinMovs=sinIngresos&&gastosTotalMes<0.005;
    const estado=sinMovs?'neu':sinIngresos?'neg':_cero?'neu':balance>0?'pos':'neg';
    const claseTono={pos:'c-green',neg:'c-red',neu:'an-t-muted'}[estado];
    const mes2d=MESES_NOMBRE[mesNum]+' '+anio;
    const flecha=trazo=>`<svg aria-hidden="true" class="an-hero-flecha" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${trazo}</svg>`;
    const icono=estado==='pos'?flecha('<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>')
      :estado==='neg'?flecha('<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>'):'';
    let mensaje, monto;
    if(sinMovs){ mensaje='Aún no hay ingresos ni gastos que cuenten para este mes.'; monto=fmt(0); }
    else if(sinIngresos){ mensaje=`Has gastado ${fmt(gastosTotalMes)} y aún no registras ingresos este mes. Registra tus ingresos para ver el balance del mes.`; monto=fmt(gastosTotalMes*-1); }
    else if(_cero){ mensaje='Por ahora has gastado todo lo que has recibido este mes.'; monto=fmt(0); }
    else if(balance>0){ mensaje='Por ahora vas bien: has gastado menos de lo que has recibido este mes.'; monto='+'+fmt(balance); }
    else { mensaje='Por ahora has gastado más de lo que has recibido este mes.'; monto=fmt(balance); }
    hero.className='ix-analisis-balance-hero '+{pos:'an-hero-pos',neg:'an-hero-neg',neu:'an-hero-neu'}[estado];
    hero.innerHTML=html`
      <div class="an-hero-lbl ${claseTono}">${raw(icono)} Balance de ${mes2d}</div>
      <div class="an-hero-monto ${claseTono}">${monto}</div>
      <div class="an-hero-msg">${mensaje}</div>
      ${(!sinIngresos&&_rendNu>0.5)?raw(`<div class="an-hero-rend">Incluye ${fmt(_rendNu)} de rendimientos de Nu <span class="an-opaco">(intereses de cajitas y CDT)</span></div>`):''}
    `;
  }

  // ── Stats ──────────────────────────────────────────────────────────────
  const elIng=document.getElementById('an-ingresos');
  const elGas=document.getElementById('an-gastos');
  const elFij=document.getElementById('an-fijos');
  const elVar=document.getElementById('an-variables');
  if(elIng) elIng.textContent=_hayIngresos?fmt(ingresosEstimados):'—';
  if(elGas) elGas.textContent=fmt(gastosTotalMes);
  if(elFij) elFij.textContent=fmt(gfTotal);
  if(elVar) elVar.textContent=fmt(gvTotal);

  // ── Top categorías este mes ────────────────────────────────────────────
  const catMap=Periodo.gastoPorCategoria(mes);
  const catsOrdenadas=Object.entries(catMap).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const maxCat=catsOrdenadas.length?catsOrdenadas[0][1]:1;
  const catsEl=document.getElementById('an-cats-mes');
  if(catsEl){
    if(!catsOrdenadas.length){
      catsEl.innerHTML='<div class="an-vacio an-vacio-4">Sin gastos registrados este mes.</div>';
    } else {
      // Migrado a html`` (ver auditoria-tecnica.md, cierre de la discrepancia
      // 2026-08-25 — este era el último sitio de renderAnalisis() sin migrar).
      // `col` es un valor fijo tomado de un array de variables CSS del propio
      // código, nunca texto de usuario — se envuelve en raw() a propósito,
      // igual que ya hace renderPresupuestos() con su variable `col` análoga.
      catsEl.innerHTML=html`${catsOrdenadas.map(([cat,monto],i)=>{
        const pct=Math.round((monto/maxCat)*100);
        const tonos=['red','amber','accent','blue','purple'];
        const tono=tonos[i]||'text2';
        return html`<div class="an-cat-fila${i<catsOrdenadas.length-1?'':' an-cat-fila-ult'}">
          <div class="an-fila-sb an-fila-sb-4">
            <span class="an-nom-12">${cat}</span>
            <span class="an-cat-monto an-t-${raw(tono)}">${fmt(monto)}</span>
          </div>
          <div class="an-barra-riel">
            <div class="an-barra-fill an-barra-anim an-bg-${raw(tono)}" style="width:${pct}%;"></div>
          </div>
        </div>`;
      })}`;
    }
  }

  // ── Gráfico de barras — últimos 12 meses ──────────────────────────────
  const hoy12=Periodo.ultimosMeses(12,mes).map(k=>({k,label:MESES_NOMBRE[parseInt(k.split('-')[1])-1],total:Periodo.gastosDelMes(k).total}));
  const maxBar=Math.max(...hoy12.map(x=>x.total),1);
  const barEl=document.getElementById('an-grafico-barras');
  const labEl=document.getElementById('an-grafico-labels');
  if(barEl&&labEl){
    barEl.innerHTML=hoy12.map(({k,total,label},idx)=>{
      const pct=Math.max(total>0?Math.round((total/maxBar)*100):0,2);
      const esMesActual=k===mes;
      return`<div data-bar-label="${label}" data-bar-val="${total}" data-bar-mes="${k}" class="an-bar ${esMesActual?'an-bar-act':'an-bar-inact'}" style="height:${pct}%;min-height:${total>0?4:2}px;"></div>`;
    }).join('');
    labEl.innerHTML=hoy12.map(({label,k})=>{
      const esMesActual=k===mes;
      return`<div class="an-bar-lbl ${esMesActual?'an-bar-lbl-act':''}">${label}</div>`;
    }).join('');
    // Event delegation en el contenedor — funciona para touch y click
    barEl.ontouchstart = barEl.onclick = function(e){
      const bar = e.target.closest('[data-bar-val]');
      if(!bar) return;
      const fmt2 = window.fmt || (x=>x.toLocaleString('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}));
      const label = bar.dataset.barLabel || '';
      const val = parseFloat(bar.dataset.barVal) || 0;
      // Limpiar tooltip previo
      const old = document.getElementById('_bar-tt');
      if(old){ old.remove(); if(old._lastBar === bar){ return; } }
      if(!val) return;
      const tt = document.createElement('div');
      tt.id = '_bar-tt';
      tt._lastBar = bar;
      tt.style.cssText = 'position:fixed;background:#1a1a1a;border:1px solid #383838;border-radius:9px;padding:9px 13px;font-family:\'DM Mono\',monospace;z-index:99999;pointer-events:none;box-shadow:0 4px 24px rgba(0,0,0,.8);text-align:center;min-width:90px;';
      tt.innerHTML = `<div class="an-tt-lbl">${label}</div><div class="an-tt-val ${val>0?'an-tt-val-pos':''}">${fmt2(val)}</div>`;
      document.body.appendChild(tt);
      const rect = bar.getBoundingClientRect();
      const ttW = tt.offsetWidth || 110;
      let left = rect.left + rect.width/2 - ttW/2;
      if(left < 8) left = 8;
      if(left + ttW > window.innerWidth - 8) left = window.innerWidth - ttW - 8;
      const top = rect.top - tt.offsetHeight - 8;
      tt.style.left = left + 'px';
      tt.style.top = (top < 8 ? rect.bottom + 8 : top) + 'px';
      clearTimeout(window._barTT_t);
      window._barTT_t = setTimeout(()=>{ const t=document.getElementById('_bar-tt'); if(t) t.remove(); }, 2500);
    };
  }

  // ── Ranking meses ──────────────────────────────────────────────────────
  // Recopilar todos los meses con datos
  const mesesConDatos=Periodo.gastosPorMes();
  const ranking=Object.entries(mesesConDatos)
    .sort((a,b)=>b[1]-a[1])
    .slice(0,6);
  const rkEl=document.getElementById('an-ranking-meses');
  if(rkEl){
    if(!ranking.length){
      rkEl.innerHTML='<div class="an-vacio an-vacio-13">Sin datos suficientes.</div>';
    } else {
      const maxRk=ranking[0][1]||1;
      rkEl.innerHTML=ranking.map(([k,total],i)=>{
        const [ay,am]=k.split('-');
        const label=MESES_NOMBRE[parseInt(am)-1]+' '+ay;
        const esMesActual=k===mes;
        const pct=Math.round((total/maxRk)*100);
        const medal=['1º','2º','3º','4º','5º','6º'][i];
        return`<div class="an-rank-fila${i<ranking.length-1?' an-rank-fila-sep':''}">
          <div class="an-fila-sb an-fila-sb-5">
            <div class="an-flex-8">
              <span class="an-medal">${medal}</span>
              <span class="an-rank-nombre${esMesActual?' an-rank-nombre-act':''}">${label}${esMesActual?' (este mes)':''}</span>
            </div>
            <span class="an-rank-monto">${fmt(total)}</span>
          </div>
          <div class="an-barra-riel">
            <div class="an-barra-fill ${esMesActual?'an-bg-accent':'an-bg-red'}" style="width:${pct}%;"></div>
          </div>
        </div>`;
      }).join('');
    }
  }

  // ── Mesada ─────────────────────────────────────────────────────────────
  const mesadaSection=document.getElementById('an-mesada-section');
  const mesadaTotal=document.getElementById('an-mesada-total');
  if(S.modulos&&S.modulos.mesada&&mesadaSection&&mesadaTotal&&typeof getMesadaData==='function'){
    mesadaSection.style.display='';
    let totalMesada=0;
    for(let m=1;m<=12;m++) totalMesada+=Periodo.mesadaDelMes(anio+'-'+String(m).padStart(2,'0'));
    mesadaTotal.textContent=fmt(totalMesada);
  } else if(mesadaSection) mesadaSection.style.display='none';

  // ── Tasa de ahorro ────────────────────────────────────────────────────
  const elTasaAhorro=document.getElementById('an-tasa-ahorro');
  const elAhorrado=document.getElementById('an-ahorrado');
  if(elTasaAhorro&&elAhorrado){
    if(_hayIngresos){
      const tasa=balance/ingresosEstimados*100;
      const esPos=!_cero&&balance>0;
      const tonoAhorro=_cero?'var(--text3)':esPos?'var(--accent)':'var(--red)';
      elTasaAhorro.textContent=(esPos?'+':'')+(_cero?'0':tasa.toFixed(1))+'%';
      elTasaAhorro.style.color=tonoAhorro;
      elAhorrado.textContent=(esPos?'+':'')+fmt(balance);
      elAhorrado.style.color=tonoAhorro;
    } else {
      elTasaAhorro.textContent='—';
      elTasaAhorro.style.color='var(--text3)';
      elAhorrado.textContent='—';
      elAhorrado.style.color='var(--text3)';
    }
  }

  // ── Comparación con el mes anterior ───────────────────────────────────
  const compEl=document.getElementById('an-comparacion');
  if(compEl){
    // Calcular mes anterior
    const dPrev=new Date(parseInt(mes.split('-')[0]),parseInt(mes.split('-')[1])-2,1);
    const mesPrev=dPrev.getFullYear()+'-'+String(dPrev.getMonth()+1).padStart(2,'0');
    const mesNomPrev=MESES_NOMBRE[dPrev.getMonth()]+' '+dPrev.getFullYear();
    const balPrev=Periodo.balanceDelMes(mesPrev,undefined,{conRendimientos:true});
    const totalPrev=balPrev.gastos.total;
    const balancePrev=balPrev.balance;
    const ingresosPrev=balPrev.ingresos.total-(balPrev.ingresos.rendimientos||0); // solo ingresos operativos: decide si hay datos que comparar

    // Este mes aún no termina y el anterior sí: la comparación es «hasta hoy contra el mes completo», así que los
    // textos dicen «por ahora» en vez de dar el mes por cerrado («Mejoró»/«Empeoró»).
    const diffGastos=gastosTotalMes-totalPrev;
    const diffBalance=balance-balancePrev;
    const hayDatos=totalPrev>0;

    function arrow(val){ return val>0?'<i class="fa-solid fa-arrow-up"></i>':'<i class="fa-solid fa-arrow-down"></i>'; }
    function diffClase(val,invertir){ return invertir?(val<0?'c-green':'c-red'):(val>0?'c-green':'c-red'); }

    if(!hayDatos){
      compEl.innerHTML='<div class="an-vacio an-vacio-c6">Sin datos del mes anterior para comparar.</div>';
    } else {
      compEl.innerHTML=`
        <div class="an-comp-titulo">vs. ${mesNomPrev}</div>
        <div class="an-col-10">
          <div class="an-fila-sb an-fila-sb-c">
            <div>
              <div class="an-nom-13">Gastos</div>
              <div class="an-comp-sub an-t-muted">Antes: ${fmt(totalPrev)}</div>
            </div>
            <div class="an-der">
              <div class="an-comp-val ${diffClase(diffGastos,true)}">${diffGastos===0?'=':arrow(diffGastos)} ${fmt(Math.abs(diffGastos))}</div>
              <div class="an-comp-sub an-t-muted">${totalPrev>0?Math.abs(Math.round(diffGastos/totalPrev*100))+'%':''} ${diffGastos<0?'menos':'más'} por ahora</div>
            </div>
          </div>
          <div class="an-sep"></div>
          ${_hayIngresos&&ingresosPrev>0?`
          <div class="an-fila-sb an-fila-sb-c">
            <div>
              <div class="an-nom-13">Balance</div>
              <div class="an-comp-sub an-t-muted">Antes: ${balancePrev>=0?'+':''}${fmt(balancePrev)}</div>
            </div>
            <div class="an-der">
              <div class="an-comp-val ${diffClase(diffBalance,false)}">${diffBalance===0?'=':arrow(diffBalance)} ${fmt(Math.abs(diffBalance))}</div>
              <div class="an-comp-sub ${diffClase(diffBalance,false)}">${diffBalance===0?'Sin cambio por ahora':diffBalance>0?'Va mejor por ahora':'Va peor por ahora'}</div>
            </div>
          </div>`:''}
        </div>`;
    }
  }

  // ── Historial de patrimonio ────────────────────────────────────────────
  const patriEl=document.getElementById('an-patrimonio-chart');
  if(patriEl){
    const hist=(S.patrimonioHistorial||[]).slice(-30); // últimos 30 días
    if(hist.length<2){
      patriEl.innerHTML='<div class="an-vacio an-vacio-c20">Aún no hay suficiente historial. Vuelve mañana.</div>';
    } else {
      let aperturaAcumulada = 0;
      const valsReales = hist.map(h=>{
        aperturaAcumulada += (h.montoBase || 0);
        const base = (h.valorVisible!=null) ? h.valorVisible : h.valor;
        return base - aperturaAcumulada;
      });
      const maxV=Math.max(...valsReales);
      const minV=Math.min(...valsReales);
      const rng=maxV-minV||1;
      const W=320,H=90,PAD=4;
      // El eje X reparte los puntos por FECHA, no en partes iguales: un registro solo se guarda los días en que abres la app y
      // guardas algo, así que un salto de 10 días no debe verse igual que uno de 1 día. (Sin fechas distintas, partes iguales.)
      const _ms=h=>new Date(h.fecha+'T00:00:00').getTime();
      const _t0=_ms(hist[0]), _span=_ms(hist[hist.length-1])-_t0;
      const _diasVentana=_span>0?Math.round(_span/86400000)+1:hist.length;
      const pts=valsReales.map((v,i)=>{
        const px=PAD+(_span>0?(_ms(hist[i])-_t0)/_span:i/(hist.length-1))*(W-PAD*2);
        const py=PAD+(1-(v-minV)/rng)*(H-PAD*2);
        return[px,py];
      });
      const polyline=pts.map(([x,y])=>x+','+y).join(' ');
      const areaPath='M '+pts[0][0]+','+H+' L '+pts.map(([x,y])=>x+','+y).join(' L ')+' L '+pts[pts.length-1][0]+','+H+' Z';
      const primero=hist[0];
      const ultimo2=hist[hist.length-1];
      // diffTotal: cambio real de patrimonio en la ventana, calculado sobre la serie ya
      // ajustada (valsReales) — no restando aperturas aparte del cambio crudo, porque eso
      // doble-cuenta el montoBase del primer punto (que ya forma parte de "primero.valor").
      const primeroReal = valsReales[0];
      const ultimoReal = valsReales[valsReales.length-1];
      const diffTotal = ultimoReal - primeroReal;
      // Sin cambio en la ventana (p. ej. todo en $0): ni «+», ni verde, ni rojo; la línea se pinta neutra.
      const sinCambio=Math.abs(diffTotal)<0.005;
      const diffColor=sinCambio?'var(--text3)':(diffTotal>=0?'var(--accent)':'var(--red)'); // para el trazo SVG y data-diffcolor (el JS del tooltip lo lee)
      const diffColorGrad=sinCambio?'#8e8e84':(diffTotal>=0?'#c8f060':'#f06868');
      const diffClasePat=sinCambio?'an-t-muted':(diffTotal>=0?'c-green':'c-red');
      const diffSigno=sinCambio?'':(diffTotal>=0?'+':'');
      // Sin base (el primer punto vale 0) un porcentaje no tiene sentido: se muestra «—», no «+0.0%» junto a un cambio en pesos.
      const diffPct = primeroReal!==0 ? diffTotal/Math.abs(primeroReal)*100 : null;
      const diffPctTxt = diffPct===null ? '—' : (sinCambio||diffPct<0?'':'+')+diffPct.toFixed(1)+'%';
      patriEl.innerHTML=`
        <div class="an-pat-cab">
          <div>
            <div class="an-pat-tit">Últimos ${_diasVentana} días</div>
            <div class="an-pat-val">${fmt(ultimo2.valorVisible!=null?ultimo2.valorVisible:ultimo2.valor)}</div>
          </div>
          <div class="an-der">
            <div class="an-pat-diff ${diffClasePat}">${diffSigno}${fmt(diffTotal)}</div>
            <div class="an-pat-pct ${diffClasePat}">${diffPctTxt}</div>
          </div>
        </div>
        <div id="_pat-wrap" class="an-pat-wrap">
          <svg aria-hidden="true" viewBox="0 0 ${W} ${H}" class="an-pat-svg">
            <defs>
              <linearGradient id="pgGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="${diffColorGrad}" stop-opacity="0.25"/>
                <stop offset="100%" stop-color="${diffColorGrad}" stop-opacity="0"/>
              </linearGradient>
            </defs>
            <path d="${areaPath}" fill="url(#pgGrad)"/>
            <polyline points="${polyline}" fill="none" stroke="${diffColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <circle id="_pat-dot" cx="${pts[pts.length-1][0]}" cy="${pts[pts.length-1][1]}" r="4" fill="${diffColor}"/>
            <line id="_pat-line" x1="0" y1="0" x2="0" y2="${H}" stroke="${diffColor}" stroke-width="1" stroke-dasharray="3,3" opacity="0" class="an-pe-none"/>
          </svg>
          <div id="_pat-tt" class="an-pat-tt" style="display:none;"></div>
          <div id="_pat-overlay" class="an-pat-overlay" data-pts='${JSON.stringify(pts.map(([px,py],i)=>({px,py,fecha:hist[i].fecha,valor:valsReales[i],valorReal:(hist[i].valorVisible!=null?hist[i].valorVisible:hist[i].valor)})))}' data-W="${W}" data-H="${H}" data-diffcolor="${diffColor}"></div>
        </div>
        <div class="an-pat-pie">
          <span class="an-pat-fecha">${primero.fecha.slice(5)}</span>
          <span class="an-pat-fecha">${ultimo2.fecha.slice(5)}</span>
        </div>`;
      // Bind touch/click on the transparent overlay
      (function(){
        const overlay = patriEl.querySelector('#_pat-overlay');
        const tt = patriEl.querySelector('#_pat-tt');
        const dot = patriEl.querySelector('#_pat-dot');
        const vline = patriEl.querySelector('#_pat-line');
        if(!overlay||!tt||!dot||!vline) return;
        const ptsData = JSON.parse(overlay.dataset.pts);
        const svgW = parseInt(overlay.dataset.w);
        const svgH = parseInt(overlay.dataset.h);
        const diffCol = overlay.dataset.diffcolor;
        const fmt2 = window.fmt || (x=>x.toLocaleString('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}));
        const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
        function getClosest(rect, clientX){
          const relX = (clientX - rect.left) / rect.width; // 0-1
          const svgX = relX * svgW;
          let best = 0, bestD = Infinity;
          ptsData.forEach((p,i)=>{ const d=Math.abs(p.px - svgX); if(d<bestD){bestD=d;best=i;} });
          return ptsData[best];
        }
        function showTT(clientX){
          // Todas las LECTURAS de geometría primero (rect no se invalida
          // hasta que empecemos a escribir el DOM más abajo).
          const rect = overlay.getBoundingClientRect();
          const p = getClosest(rect, clientX);
          if(!p) return;
          const relX = p.px / svgW;
          const leftPx = relX * rect.width;
          let fechaFmt = p.fecha;
          if(p.fecha && p.fecha.length>=10){
            const [y,m,d] = p.fecha.slice(0,10).split('-');
            fechaFmt = `${parseInt(d)} ${MESES[parseInt(m)-1]}`;
          }
          const valorTxt = fmt2(p.valorReal !== undefined ? p.valorReal : p.valor);
          // Ancho del tooltip medido con canvas (no toca el DOM, no fuerza
          // reflow) en vez de leer tt.offsetWidth después de escribir el
          // innerHTML — eso era lo que causaba el forced reflow en cada
          // touchmove al arrastrar sobre la gráfica.
          const ttW = Math.max(
            medirAnchoTexto(fechaFmt, '9px "DM Mono", monospace'),
            medirAnchoTexto(valorTxt, '700 13px "DM Mono", monospace')
          ) + 24; // padding:8px 12px del tooltip
          let ttLeft = leftPx;
          const wrapW = rect.width;
          if(ttLeft - ttW/2 < 0) ttLeft = ttW/2;
          if(ttLeft + ttW/2 > wrapW) ttLeft = wrapW - ttW/2;
          // Ahora sí, todas las ESCRITURAS juntas al final.
          tt.innerHTML = `<div class="an-pt-fecha">${fechaFmt}</div><div class="an-pt-valor">${valorTxt}</div>`;
          tt.style.display = 'block';
          tt.style.left = ttLeft + 'px';
          tt.style.top = '2px';
          dot.setAttribute('cx', p.px);
          dot.setAttribute('cy', p.py);
          vline.setAttribute('x1', p.px); vline.setAttribute('x2', p.px);
          vline.setAttribute('opacity','0.5');
        }
        function hideTT(){
          tt.style.display='none';
          vline.setAttribute('opacity','0');
          // Restaurar dot al último punto
          const last = ptsData[ptsData.length-1];
          dot.setAttribute('cx',last.px); dot.setAttribute('cy',last.py);
        }
        overlay.addEventListener('touchstart', function(e){ e.stopPropagation(); showTT(e.touches[0].clientX); }, {passive:true});
        overlay.addEventListener('touchmove', function(e){ showTT(e.touches[0].clientX); }, {passive:true});
        overlay.addEventListener('touchend', function(){ clearTimeout(window._patTT_t); window._patTT_t=setTimeout(hideTT,2000); }, {passive:true});
        overlay.addEventListener('click', function(e){ showTT(e.clientX); clearTimeout(window._patTT_t); window._patTT_t=setTimeout(hideTT,2500); });
      })();
    }
  }
}

/* ---- INGRESOS FIJOS ---- */
let _ifEditId=null;

function renderIngresosFijos(){
  const el=document.getElementById('an-ingresos-fijos-list');
  if(!el)return;
  const lista=S.ingresosFijos||[];
  if(!lista.length){
    el.innerHTML='<div class="an-vacio an-vacio-13">Sin ingresos fijos. Agrega tu sueldo, freelance u otro ingreso recurrente y registra su cobro cada vez que te paguen.</div>';
    return;
  }
  // Migrado a html`` (ver auditoria-tecnica.md, cierre de la discrepancia
  // 2026-08-25). `ing.nombre` e `ing.desde` son los dos campos de texto libre
  // reales acá (nombre del ingreso, fecha "desde" — texto libre según lo ya
  // anotado el 2026-08-15, sin confirmar si el input es type="month" o
  // texto suelto; con html`` deja de importar). `Events.attr(...)` se
  // envuelve en raw(): arma su propio HTML de atributos y solo recibe
  // `ing.id` (uid interno generado por el propio código, no texto de
  // usuario) — sin relación con el hallazgo abierto sobre Events.attr() en
  // configuracion.js (ese es con texto libre real). El array se sigue
  // uniendo con `.join(divider)` en vez de dejar que el html`` externo lo
  // autoconcatene: acá hace falta el separador visual entre ingresos, algo
  // que el patrón "arrays sin .join()" no cubre (ese concatena sin nada en
  // el medio). Cada `html\`...\`` interno ya devuelve un fragmento seguro;
  // `.join()` lo coacciona a string vía su propio `toString()`, sin volver
  // a escapar nada — misma coerción implícita ya validada para innerHTML.
  const mes=mesActual();
  el.innerHTML=lista.map(ing=>{
    const desdeLabel=ing.desde?html`<span class="an-desde">desde ${ing.desde}</span>`:'';
    // Estado del mes en curso: un ingreso fijo solo suma cuando se registra su cobro.
    const est=ingresoFijoEstadoMes(ing,mes);
    const estadoHtml=est.cobrado>0
      ?html`<span class="an-ing-estado an-ing-estado-ok">Cobrado este mes · ${fmt(est.cobrado)}</span>`
      :(est.esperado?html`<span class="an-ing-estado an-ing-estado-pend">Sin cobrar este mes</span>`:'');
    const recientes=cobrosDeIngresoFijo(ing).slice().sort((x,y)=>String(y.fecha||'').localeCompare(String(x.fecha||''))).slice(0,3);
    const cobrosHtml=recientes.length?html`<div class="an-cobros">${raw(recientes.map(c=>html`<div class="an-cobro-fila">
        <span class="an-cobro-txt">${c.fecha||''} · cubre ${cobroMesTexto(c.mesCubre)}${cobroFuentesDe(c).length?' · '+cobroFuentesDe(c).map(f=>fuenteLabel(f)).join(', '):''}</span>
        <span class="an-cobro-acc"><span class="an-cobro-monto">+${fmt(c.monto||0)}</span>
          <button type="button" ${raw(Events.attr('analisis:eliminarCobro', ing.id, c.id))} class="an-btn-icono an-t-muted" title="Borrar este cobro" aria-label="Borrar este cobro">
            <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button></span>
      </div>`).join(''))}</div>`:'';
    return html`<div class="an-ing-bloque">
      <div class="row an-ing-row">
        <div class="an-col-2">
          <span class="an-nom-13">${ing.nombre||'Sin nombre'}</span>
          <span class="an-desde-fila">${raw(estadoHtml)}${desdeLabel}</span>
        </div>
        <div class="an-flex-10">
          <span class="an-ing-monto">${fmt(ing.monto||0)}</span>
          <button type="button" ${raw(Events.attr('analisis:cobrarIngresoFijo', ing.id))} class="btn-chip btn-chip-accent">Cobrar</button>
          <button type="button" ${raw(Events.attr('analisis:editarIngresoFijo', ing.id))} class="an-btn-icono an-t-muted" aria-label="Editar">
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button type="button" ${raw(Events.attr('analisis:eliminarIngresoFijo', ing.id))} class="an-btn-icono an-t-red" aria-label="Eliminar">
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>
      </div>
      ${raw(cobrosHtml)}
    </div>`;
  }).join('<div class="divider"></div>');
}

function abrirSheetIngresoFijo(id){
  _ifEditId=id||null;
  const titleEl=document.getElementById('ingreso-fijo-sheet-title');
  const nEl=document.getElementById('if_n');
  const mEl=document.getElementById('if_m');
  const dEl=document.getElementById('if_d');
  // Mes actual como default para "desde"
  const mesHoy=new Date().getFullYear()+'-'+String(new Date().getMonth()+1).padStart(2,'0');
  if(_ifEditId){
    const ing=(S.ingresosFijos||[]).find(x=>x.id===_ifEditId);
    if(!ing)return;
    if(titleEl)titleEl.textContent='Editar ingreso fijo';
    if(nEl)nEl.value=ing.nombre||'';
    if(mEl)mEl.value=fmtInput(ing.monto||0);
    if(dEl)dEl.value=ing.desde||mesHoy;
  } else {
    if(titleEl)titleEl.textContent='Ingreso fijo mensual';
    if(nEl)nEl.value='';
    if(mEl)mEl.value='';
    if(dEl)dEl.value=mesHoy;
  }
  openSheet('ingreso-fijo');
}

function editarIngresoFijo(id){ abrirSheetIngresoFijo(id); }

async function eliminarIngresoFijo(id){
  const ing=(S.ingresosFijos||[]).find(x=>x.id===id);
  if(!ing)return;
  const cobros=cobrosDeIngresoFijo(ing);
  const aviso=cobros.length?' Se quitarán también sus '+cobros.length+(cobros.length===1?' cobro registrado':' cobros registrados')+(cobros.some(c=>cobroFuentesDe(c).length)?' y la plata que entró a tus cuentas se descontará.':'.'):'';
  const ok=await dialogo('Eliminar ingreso','¿Eliminar "'+ing.nombre+'"?'+aviso,'Eliminar',true);
  if(!ok)return;
  const _histAntes=medirPatrimonioParaHistorial();
  cobros.forEach(c=>{cobroRevertir(c);});
  S.ingresosFijos=(S.ingresosFijos||[]).filter(x=>x.id!==id);
  cobros.forEach(c=>purgarEfectoEnHistorial(_histAntes,c));
  save();refresh();renderAnalisis();
}

function guardarIngresoFijo(){
  const n=(document.getElementById('if_n').value||'').trim();
  const m=parseMoney(document.getElementById('if_m').value);
  const d=(document.getElementById('if_d').value||'').trim();
  if(!n){toast('Ingresa un nombre','err');return;}
  if(!m||m<=0){toast('Ingresa un monto válido','err');return;}
  if(!S.ingresosFijos)S.ingresosFijos=[];
  if(_ifEditId){
    const ing=S.ingresosFijos.find(x=>x.id===_ifEditId);
    if(ing){ing.nombre=n;ing.monto=m;ing.desde=d||undefined;}
  } else {
    S.ingresosFijos.push({id:uid(),nombre:n,monto:m,desde:d||undefined});
  }
  closeSheet('ingreso-fijo');
  save();renderIngresosFijos();renderAnalisis();
  toast(_ifEditId?'Ingreso actualizado':'Ingreso guardado');
}

/* ---- COBRO DE UN INGRESO FIJO ----
   Reglas de negocio en js/core/cobros.js (cobroRegistrar / cobroBorrar). Acá solo la pantalla: leer el sheet, llamar a esas
   reglas y repintar. Mismo molde que «Registrar pago» de Mesada: monto, fecha en que te pagaron, destino (o dividir). */
let _cbId=null;
let cbSplitMode=false;

crearSplitWidget('cb',{
  simpleId:'cbModoSimple',splitId:'cbModoDividido',toggleId:'cbSplitToggle',rowsId:'cbSplitRows',
  getModo:()=>cbSplitMode,setModo:v=>{cbSplitMode=v;},
  getFuentesFn:selectedVal=>buildFuentesOptsHtml({selectedVal,placeholder:'No especificar',incluirTC:false}),
  onPreview:()=>actualizarCbPreview(),
});

function actualizarCbAvisoMes(){
  const el=document.getElementById('cbAvisoMes');
  if(el)el.textContent=cobroAvisoMes(document.getElementById('cbMes').value,document.getElementById('cbFecha').value);
}

function actualizarCbPreview(){
  const prev=document.getElementById('cbPreview');
  if(!prev)return;
  const v=parseMoney(document.getElementById('cbMonto').value)||0;
  if(!v){prev.textContent='';return;}
  if(cbSplitMode){
    const splits=splitGetData('cb');
    const total=splits.reduce((a,x)=>a+x.monto,0),resto=v-total;
    if(!splits.length){prev.textContent=fmt(v)+' por distribuir';prev.style.color='var(--text2)';return;}
    const lineas=splits.map(x=>fuenteLabel(x.fuente||'')+': +'+fmt(x.monto)).join(' · ');
    if(resto>0){prev.textContent=lineas+' · Sin asignar: '+fmt(resto);prev.style.color='var(--amber)';}
    else if(resto<0){prev.textContent=lineas+' · Excede por: '+fmt(-resto);prev.style.color='var(--red)';}
    else{prev.textContent=lineas+' · Todo distribuido';prev.style.color='var(--accent)';}
    return;
  }
  const dest=document.getElementById('cbDestino').value;
  if(dest){
    const actual=getSaldoFuente(dest);
    prev.textContent=fuenteLabel(dest)+': '+fmt(actual)+' + '+fmt(v)+' = '+fmt(actual+v);
    prev.style.color='var(--accent)';
  }else{
    prev.textContent=fmt(v)+' registrados';
    prev.style.color='var(--text2)';
  }
}

function abrirCobroIngresoFijo(id){
  const ing=(S.ingresosFijos||[]).find(x=>x.id===id);
  if(!ing)return;
  _cbId=id;
  document.getElementById('cbTitle').textContent='Cobro · '+(ing.nombre||'Ingreso fijo');
  setMoneyInput('cbMonto',ing.monto||0);
  document.getElementById('cbMes').value=mesActual();
  document.getElementById('cbFecha').value=hoy(); // valor por defecto: quien registra el cobro de otro día cambia la fecha
  document.getElementById('cbNota').value='';
  document.getElementById('cbPreview').textContent='';
  splitReset('cb');
  document.getElementById('cbSplitToggle').style.display='';
  document.getElementById('cbDestino').innerHTML=buildFuentesOptsHtml({placeholder:'No especificar / lo gasté',incluirTC:false});
  actualizarCbAvisoMes();
  actualizarCbPreview();
  openSheet('cobro-ingreso');
}

function confirmarCobroIngresoFijo(){
  const r=cobroRegistrar({
    id:_cbId,
    mesCubre:document.getElementById('cbMes').value,
    monto:parseMoney(document.getElementById('cbMonto').value)||0,
    fecha:document.getElementById('cbFecha').value||hoy(),
    nota:(document.getElementById('cbNota').value||'').trim(),
    destino:document.getElementById('cbDestino').value,
    splitMode:cbSplitMode,
    splits:cbSplitMode?splitGetData('cb'):null,
  });
  if(!r.ok){
    if(r.motivo==='monto-invalido')toast('Ingresa el monto que te pagaron','err');
    else if(r.motivo==='mes-invalido')toast('Elige el mes que cubre este cobro','err');
    else if(r.motivo==='split-excede'){const prev=document.getElementById('cbPreview');prev.textContent='El total dividido supera el monto recibido';prev.style.color='var(--red)';}
    return;
  }
  closeSheet('cobro-ingreso');
  save();refresh();renderAnalisis();
  toast('Cobro registrado');
}

async function eliminarCobroIngresoFijo(id,cobroId){
  const ing=(S.ingresosFijos||[]).find(x=>x.id===id);
  const c=ing&&cobrosDeIngresoFijo(ing).find(x=>x.id===cobroId);
  if(!c)return;
  // Protección por antigüedad (docs/proteccion-antiguedad-movimientos.md): solo si borrar mueve el saldo de alguna cuenta.
  const fuentes=cobroFuentesDe(c);
  if(fuentes.length){
    const nivel=nivelAntiguedadMovimiento(c.fecha,0,'ingreso-fijo');
    if(nivel==='bloqueado'){await avisarMovimientoBloqueado();return;}
    if(nivel==='viejo'){
      const nombre=fuentes.length>1?fuentes.length+' cuentas':fuenteLabel(fuentes[0]);
      if(!await confirmarBorrarMovimientoViejo(nombre,c.monto||0,'baja'))return;
    }
  }else if(!await dialogo('Borrar cobro','¿Borrar este cobro de '+fmt(c.monto||0)+'? Dejará de contar como ingreso.','Borrar',true))return;
  const _histAntes=medirPatrimonioParaHistorial();
  cobroBorrar(id,cobroId);
  purgarEfectoEnHistorial(_histAntes,c);
  save();refresh();renderAnalisis();
}

/* ---- PRESUPUESTOS ----
   Vivía dentro de una IIFE compartida con Búsqueda global y el hook de
   refresh en index.html ("6. PRESUPUESTOS" de esa numeración). El
   window.abrirPresupuestos=... que tenía ahí ya no hace falta: acá es
   un <script src> clásico, así que la declaración de función ya cuelga
   de window por sí sola. */
function abrirPresupuestos(){
  if(!S.presupuestos) S.presupuestos = {};
  const cats = window.getCatsVar ? window.getCatsVar() : ['Alimentación','Transporte','Salud','Entretenimiento','Otro'];
  const lista = document.getElementById('presupuestos-lista');
  if(!lista) return;
  // Migrado a html`` (js/core/html-tag.js, ver auditoria-tecnica.md "Auditoría
  // exhaustiva de .innerHTML"): escapa cat y val por defecto, sin depender de
  // acordarse de envolver cada interpolación en escHtml() a mano. De paso cierra
  // un caso que este mismo archivo tenía sin escapar: `val` (línea original)
  // nunca pasaba por escHtml() — bajo riesgo real hoy porque siempre es un monto
  // numérico (S.presupuestos[cat]), pero con html`` deja de depender de que siga
  // siendo siempre así.
  lista.innerHTML = html`${cats.map((cat, i) => {
    // Se muestra con puntos de miles (500.000); lo guardado sigue siendo el número (500000).
    const val = S.presupuestos[cat] ? _milesFormatear(String(Math.round(S.presupuestos[cat]))) : '';
    return html`<div class="ig">
      <label class="il" for="presup-input-${i}">${cat}</label>
      <div class="an-flex-8">
        <input type="text" inputmode="numeric" id="presup-input-${i}" class="presup-input miles-input an-presup-input" data-cat="${cat}" placeholder="Sin límite" value="${val}">
        <span class="an-presup-mes">/mes</span>
      </div>
    </div>`;
  })}`;

  lista.querySelectorAll('.presup-input').forEach(inp => {
    inp.addEventListener('change', function(){
      const cat = this.dataset.cat;
      const val = parseMiles(this.value); // sin puntos: nunca se guarda "1.500.000"
      if(!S.presupuestos) S.presupuestos = {};
      if(val > 0) S.presupuestos[cat] = val;
      else { delete S.presupuestos[cat]; this.value = ''; } // vacío o 0 = sin límite
      if(window._fbSaveToCloud) window._fbSaveToCloud();
      renderPresupuestos();
    });
  });

  if(window.openSheet) window.openSheet('presupuestos');
}

function renderPresupuestos(){
  const el = document.getElementById('an-presupuestos');
  if(!el) return;
  // Registro persistente de avisos ya mostrados (cat+mes), NO se resetea en
  // cada render — renderPresupuestos() corre en cada refresh() de la app
  // (cambiar de pantalla, guardar, etc.), así que resetear acá hacía que el
  // toast de "80%+" reapareciera en cada refresh mientras la categoría
  // siguiera entre 80% y 100%. Ver CHANGELOG.md / auditoria-tecnica.md.
  if(!window._presupWarnedKeys) window._presupWarnedKeys = new Set();
  const presup = S.presupuestos || {};
  const cats = Object.keys(presup);
  if(!cats.length){ el.innerHTML='<div class="an-vacio an-vacio-c8">Sin presupuestos configurados. Toca "Editar" para definirlos.</div>'; return; }
  const mes = window.mesActual ? window.mesActual() : '';

  // Gasto por categoría este mes (periodo.js: mismo criterio que el resto de la pantalla)
  const gastoCat = Periodo.gastoPorCategoria(mes);

  // Migrado a html`` — ver nota en abrirPresupuestos() más arriba. El toast()
  // de aviso al 80% se queda con escHtml() a mano (no es un innerHTML, toast()
  // no pasa por html``) — mismo criterio ya documentado en
  // auditoria-tecnica.md sobre por qué no se tocó la firma de toast() en general.
  el.innerHTML = html`${cats.map(cat => {
    const limite = presup[cat];
    const gasto = gastoCat[cat]||0;
    const pct = Math.min(100, Math.round(gasto/limite*100));
    const tono = pct >= 100 ? 'red' : pct >= 80 ? 'amber' : 'accent';
    const warnKey = cat+'_'+mes;
    if(pct >= 80 && pct < 100 && !window._presupWarnedKeys.has(warnKey)) {
      window._presupWarnedKeys.add(warnKey);
      if(window.toast) window.toast(`¡Atención! Llevas ${pct}% del presupuesto de ${escHtml(cat)}`,'info',4000);
    }
    return html`<div class="presup-row">
      <div class="presup-label-row">
        <span class="an-nom-12">${cat}</span>
        <span class="an-presup-uso an-t-${raw(tono)}">${fmt(gasto)} / ${fmt(limite)}</span>
      </div>
      <div class="presup-bar">
        <div class="presup-bar-fill an-bg-${raw(tono)}" style="width:${pct}%;"></div>
      </div>
    </div>`;
  })}`;
}

/* ---- EVENTOS: acciones con data-action="analisis:..." ---- */
// Events llama a cada handler con (...args, elemento, evento). El botón "+ Agregar" no lleva
// argumentos, así que sin este envoltorio abrirSheetIngresoFijo recibiría el botón como `id`,
// no encontraría ese ingreso y saldría sin abrir el sheet.
Events.registerAll('analisis', {
  abrirSheetIngresoFijo: () => abrirSheetIngresoFijo(),
  editarIngresoFijo,
  eliminarIngresoFijo,
  cobrarIngresoFijo: abrirCobroIngresoFijo,
  eliminarCobro: eliminarCobroIngresoFijo,
  abrirPresupuestos,
});

/* ---- WIRING de controles que no son data-action simples ---- */
const _btnGuardarIngresoFijo = document.getElementById('btn-guardar-ingreso-fijo');
if (_btnGuardarIngresoFijo) _btnGuardarIngresoFijo.addEventListener('click', guardarIngresoFijo);

// Controles estáticos del sheet «Registrar cobro» (los ids ya existen en index.html).
[
  ['btn-confirmar-cobro','click',confirmarCobroIngresoFijo],
  ['cbMonto','input',actualizarCbPreview],
  ['cbDestino','change',actualizarCbPreview],
  ['cbMes','input',actualizarCbAvisoMes],
  ['cbMes','change',actualizarCbAvisoMes],
  ['cbFecha','input',actualizarCbAvisoMes],
  ['cbFecha','change',actualizarCbAvisoMes],
  ['cbSplitToggle','click',()=>splitToggle('cb')],
  ['btn-add-split-row-cb','click',()=>splitAgregarRow('cb')],
].forEach(([id,evt,fn])=>{const el=document.getElementById(id);if(el)el.addEventListener(evt,fn);});
