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

   Funciones que se QUEDAN en index.html a propósito, por ser núcleo
   compartido (mismo criterio que renderCatsConfig/agregarCat con
   Gastos en configuracion.js):
     - calcPatrimonioTotal() / snapshotPatrimonio(): las llama save()
       en CADA guardado (no solo al entrar a Análisis) para alimentar
       el historial que después se grafica acá. Moverlas habría hecho
       que Análisis "fuera dueño" de algo que en realidad es del ciclo
       de guardado central.
     - renderHealthScore()/renderProyeccion() (js/modules/inicio.js) y
       el hook _renderMejoras() que las llama junto con
       renderPresupuestos(): ese hook vive en index.html porque
       conecta tres módulos distintos (Inicio + Análisis) al ciclo de
       refresh() — no es exclusivo de ninguno.

   Presupuestos vivía metido dentro de una IIFE compartida en
   index.html ("1. Ocultar/mostrar saldos ... 8. Hook en refresh")
   junto con Búsqueda global y el hook de refresh — mismo problema de
   "código no relacionado en el mismo bloque" que ya describía la
   auditoría para TC y Cuentas. Se mueve acá completo.
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
  const gvMes=(S.gastosVar||[]).filter(g=>mesKey(g.fecha)===mes&&!_esGastoVarNoReal(g));
  const gvTotal=gvMes.reduce((a,g)=>a+(g.monto||0),0);

  const pagosGF=S.pagosGastosFijos||{};
  const gfTotal=(S.gastosFijos||[]).reduce((a,g)=>pagosGF[g.id+'_'+mes]?a+(g.monto||0):a,0);
  const gastosTotalMes=gvTotal+gfTotal;

  // ── Ingresos estimados del mes (mesada + ingresos fijos) ─────────────
  const mesNum=parseInt(mes.split('-')[1])-1;
  const anio=parseInt(mes.split('-')[0]);
  let ingresosEstimados=0;
  if(S.modulos&&S.modulos.mesada&&typeof getMesadaData==='function'){
    // mesKey2 nunca estaba definida acá (bug real, no relacionado a lazy
    // loading — ver CHANGELOG.md 2026-08-04). Mismo cálculo que ya usa
    // inicio.js (calcHealthScore, variable local `_mk`) para lo mismo: la
    // clave con la que getMesadaData() indexa los pagos, "año-mesIdx"
    // (mesIdx 0-indexado, no la misma convención que mesKey(fecha)).
    const mesKey2=anio+'-'+mesNum;
    const infoPapa=getMesadaData('papa')[mesKey2];
    const infoMama=getMesadaData('mama')[mesKey2];
    if(infoPapa) ingresosEstimados+=(infoPapa.monto||_getCuotaAnio('papa',anio)||0);
    if(infoMama) ingresosEstimados+=(infoMama.monto||_getCuotaAnio('mama',anio)||0);
  }
  // Sumar ingresos fijos configurados (sueldo, freelance, etc.)
  ingresosEstimados+=getIngresosFijosMes(mes);
  // Sumar entradas reales registradas en movimientos (trabajos puntuales, regalos, etc.)
  // Excluir: apertura, transferencias, intercambios de encargo, reposiciones de plata comprometida, margenes de encargo
  (S.movimientos||[]).forEach(function(m){
    if(m.tipo==='entrada' && mesKey(m.fecha)===mes){
      if(_esEntradaEspejoNoIngreso(m)) return;
      ingresosEstimados+=m.monto||0;
    }
  });

  // ── Balance ────────────────────────────────────────────────────────────
  const balance=ingresosEstimados-gastosTotalMes;
  const hero=document.getElementById('analisis-balance-hero');
  if(hero){
    const esPositivo=balance>=0;
    const sinIngresos=ingresosEstimados===0;
    const color=sinIngresos?'var(--text3)':esPositivo?'var(--accent)':'var(--red)';
    const bgColor=sinIngresos?'rgba(255,255,255,.04)':esPositivo?'rgba(200,240,96,.07)':'rgba(240,104,104,.07)';
    const borderColor=sinIngresos?'var(--border2)':esPositivo?'rgba(200,240,96,.25)':'rgba(240,104,104,.25)';
    const mes2d=MESES_NOMBRE[mesNum]+' '+anio;
    const emoji=sinIngresos?'':esPositivo?'↑':' ↓';
    let mensaje='';
    const moduloMesadaActivo=!!(S.modulos&&S.modulos.mesada);
    if(sinIngresos) mensaje=moduloMesadaActivo?'Registrá tus ingresos en Mesada para ver el balance.':'Total gastado este mes.';
    else if(esPositivo) mensaje='¡Vas bien! Gastaste menos de lo que entraste.';
    else mensaje='Ojo: gastaste más de lo que entraste este mes.';
    hero.style.cssText='border-radius:var(--radius);padding:20px;margin-bottom:10px;background:'+bgColor+';border:1px solid '+borderColor+';';
    hero.innerHTML=`
      <div style="font-size:10px;color:${sinIngresos?'var(--text3)':color};text-transform:uppercase;letter-spacing:1px;font-family:'DM Mono',monospace;">${emoji} Balance de ${mes2d}</div>
      <div style="font-size:36px;font-weight:300;letter-spacing:-2px;font-family:'DM Mono',monospace;color:${color};margin:6px 0 6px;">${sinIngresos?fmt(gastosTotalMes*-1):(balance>=0?'+':'')+fmt(balance)}</div>
      <div style="font-size:11px;color:var(--text3);">${mensaje}</div>
    `;
  }

  // ── Stats ──────────────────────────────────────────────────────────────
  const elIng=document.getElementById('an-ingresos');
  const elGas=document.getElementById('an-gastos');
  const elFij=document.getElementById('an-fijos');
  const elVar=document.getElementById('an-variables');
  if(elIng) elIng.textContent=ingresosEstimados>0?fmt(ingresosEstimados):'—';
  if(elGas) elGas.textContent=fmt(gastosTotalMes);
  if(elFij) elFij.textContent=fmt(gfTotal);
  if(elVar) elVar.textContent=fmt(gvTotal);

  // ── Top categorías este mes ────────────────────────────────────────────
  const catMap={};
  gvMes.forEach(g=>{
    const c=g.cat||'Otro';
    catMap[c]=(catMap[c]||0)+(g.monto||0);
  });
  // También contar gastos fijos pagados por categoría
  (S.gastosFijos||[]).forEach(g=>{
    if(pagosGF[g.id+'_'+mes]){
      const c=g.cat||'Otro';
      catMap[c]=(catMap[c]||0)+(g.monto||0);
    }
  });
  const catsOrdenadas=Object.entries(catMap).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const maxCat=catsOrdenadas.length?catsOrdenadas[0][1]:1;
  const catsEl=document.getElementById('an-cats-mes');
  if(catsEl){
    if(!catsOrdenadas.length){
      catsEl.innerHTML='<div style="font-size:12px;color:var(--text3);padding:4px 0;">Sin gastos registrados este mes.</div>';
    } else {
      catsEl.innerHTML=catsOrdenadas.map(([cat,monto],i)=>{
        const pct=Math.round((monto/maxCat)*100);
        const colors=['var(--red)','var(--amber)','var(--accent)','var(--blue)','var(--purple)'];
        const col=colors[i]||'var(--text2)';
        return`<div style="margin-bottom:${i<catsOrdenadas.length-1?'11':'0'}px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <span style="font-size:12px;font-weight:600;">${cat}</span>
            <span style="font-size:12px;font-family:'DM Mono',monospace;color:${col};">${fmt(monto)}</span>
          </div>
          <div style="height:3px;background:var(--bg3);border-radius:2px;overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:${col};border-radius:2px;transition:width .5s;"></div>
          </div>
        </div>`;
      }).join('');
    }
  }

  // ── Gráfico de barras — últimos 12 meses ──────────────────────────────
  const hoy12=[];
  const d=new Date();
  for(let i=11;i>=0;i--){
    const dd=new Date(d.getFullYear(),d.getMonth()-i,1);
    const k=dd.getFullYear()+'-'+String(dd.getMonth()+1).padStart(2,'0');
    const label=MESES_NOMBRE[dd.getMonth()];
    // Nota: gastoOrigen "cajita"/"tc" desde Plata comprometida nunca escribe en
    // S.gastosVar (ver comentario en "Gastos del mes actual"), así que no hace
    // falta filtrar por eso aquí — el filtro viejo (g.fuente!=='plata-comprometida')
    // era código muerto: gastosVar.fuente nunca toma ese valor.
    const gv=(S.gastosVar||[]).filter(g=>mesKey(g.fecha)===k&&!_esGastoVarNoReal(g)).reduce((a,g)=>a+(g.monto||0),0);
    const gf=(S.gastosFijos||[]).reduce((a,g)=>pagosGF[g.id+'_'+k]?a+(g.monto||0):a,0);
    hoy12.push({k,label,total:gv+gf});
  }
  const maxBar=Math.max(...hoy12.map(x=>x.total),1);
  const barEl=document.getElementById('an-grafico-barras');
  const labEl=document.getElementById('an-grafico-labels');
  if(barEl&&labEl){
    barEl.innerHTML=hoy12.map(({k,total,label},idx)=>{
      const pct=Math.max(total>0?Math.round((total/maxBar)*100):0,2);
      const esMesActual=k===mes;
      const col=esMesActual?'var(--accent)':'var(--bg3)';
      const border=esMesActual?'none':'1px solid var(--border2)';
      return`<div data-bar-label="${label}" data-bar-val="${total}" data-bar-mes="${k}" style="flex:1;background:${col};border:${border};border-radius:4px 4px 0 0;height:${pct}%;min-height:${total>0?4:2}px;transition:height .4s;cursor:pointer;-webkit-tap-highlight-color:rgba(200,240,96,.18);"></div>`;
    }).join('');
    labEl.innerHTML=hoy12.map(({label,k})=>{
      const esMesActual=k===mes;
      return`<div style="flex:1;text-align:center;font-size:8px;font-family:'DM Mono',monospace;color:${esMesActual?'var(--accent)':'var(--text3)'};font-weight:${esMesActual?'700':'400'};">${label}</div>`;
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
      tt.innerHTML = `<div style="color:var(--text2);font-size:9px;text-transform:uppercase;letter-spacing:.7px;margin-bottom:4px;">${label}</div><div style="color:${val>0?'#f06868':'var(--text2)'};font-size:14px;font-weight:700;">${fmt2(val)}</div>`;
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
  const mesesConDatos={};
  // Nota: mismo caso que arriba — S.gastosVar nunca contiene gastos de
  // plata comprometida, así que no se filtra por eso (ver "Gastos del mes actual").
  (S.gastosVar||[]).forEach(g=>{
    if(!_esGastoVarNoReal(g)){
      const k=mesKey(g.fecha);
      if(k) mesesConDatos[k]=(mesesConDatos[k]||0)+(g.monto||0);
    }
  });
  Object.keys(pagosGF).forEach(key=>{
    // key = "gfId_YYYY-MM"
    const parts=key.split('_');
    const mesK=parts[parts.length-1];
    const gfId=parts.slice(0,-1).join('_');
    const gf=(S.gastosFijos||[]).find(g=>g.id===gfId);
    if(gf&&mesK) mesesConDatos[mesK]=(mesesConDatos[mesK]||0)+(gf.monto||0);
  });
  const ranking=Object.entries(mesesConDatos)
    .sort((a,b)=>b[1]-a[1])
    .slice(0,6);
  const rkEl=document.getElementById('an-ranking-meses');
  if(rkEl){
    if(!ranking.length){
      rkEl.innerHTML='<div style="font-size:12px;color:var(--text3);padding:13px 0;">Sin datos suficientes.</div>';
    } else {
      const maxRk=ranking[0][1]||1;
      rkEl.innerHTML=ranking.map(([k,total],i)=>{
        const [ay,am]=k.split('-');
        const label=MESES_NOMBRE[parseInt(am)-1]+' '+ay;
        const esMesActual=k===mes;
        const pct=Math.round((total/maxRk)*100);
        const medal=['1º','2º','3º','4º','5º','6º'][i];
        return`<div style="padding:11px 0;border-bottom:${i<ranking.length-1?'1px solid var(--border)':'none'};">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:14px;">${medal}</span>
              <span style="font-size:13px;font-weight:${esMesActual?'700':'500'};color:${esMesActual?'var(--accent)':'var(--text)'};">${label}${esMesActual?' ← este mes':''}</span>
            </div>
            <span style="font-size:13px;font-family:'DM Mono',monospace;color:var(--red);">${fmt(total)}</span>
          </div>
          <div style="height:3px;background:var(--bg3);border-radius:2px;overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:${esMesActual?'var(--accent)':'var(--red)'};border-radius:2px;"></div>
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
    const dataPapa=getMesadaData('papa');
    const dataMama=getMesadaData('mama');
    let totalMesada=0;
    for(let m=0;m<12;m++){
      const k=anio+'-'+m;
      if(dataPapa[k]) totalMesada+=(dataPapa[k].monto||_getCuotaAnio('papa',anio)||0);
      if(dataMama[k]) totalMesada+=(dataMama[k].monto||_getCuotaAnio('mama',anio)||0);
    }
    mesadaTotal.textContent=fmt(totalMesada);
  } else if(mesadaSection) mesadaSection.style.display='none';

  // ── Tasa de ahorro ────────────────────────────────────────────────────
  const elTasaAhorro=document.getElementById('an-tasa-ahorro');
  const elAhorrado=document.getElementById('an-ahorrado');
  if(elTasaAhorro&&elAhorrado){
    if(ingresosEstimados>0){
      const tasa=balance/ingresosEstimados*100;
      const esPos=balance>=0;
      elTasaAhorro.textContent=(esPos?'+':'')+tasa.toFixed(1)+'%';
      elTasaAhorro.style.color=esPos?'var(--accent)':'var(--red)';
      elAhorrado.textContent=(esPos?'+':'')+fmt(balance);
      elAhorrado.style.color=esPos?'var(--accent)':'var(--red)';
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
    const gvPrev=(S.gastosVar||[]).filter(g=>mesKey(g.fecha)===mesPrev&&!_esGastoVarNoReal(g)).reduce((a,g)=>a+(g.monto||0),0);
    const gfPrev=(S.gastosFijos||[]).reduce((a,g)=>pagosGF[g.id+'_'+mesPrev]?a+(g.monto||0):a,0);
    const totalPrev=gvPrev+gfPrev;
    const mesNomPrev=MESES_NOMBRE[dPrev.getMonth()]+' '+dPrev.getFullYear();

    // Ingresos mes anterior
    const mesNumPrev=dPrev.getMonth();
    const anioPrev=dPrev.getFullYear();
    let ingresosPrev=0;
    if(S.modulos&&S.modulos.mesada&&typeof getMesadaData==='function'){
      const iPapa=getMesadaData('papa')[mesPrev];
      const iMama=getMesadaData('mama')[mesPrev];
      if(iPapa) ingresosPrev+=(iPapa.monto||_getCuotaAnio('papa',anioPrev)||0);
      if(iMama) ingresosPrev+=(iMama.monto||_getCuotaAnio('mama',anioPrev)||0);
    }
    ingresosPrev+=getIngresosFijosMes(mesPrev);
    (S.movimientos||[]).forEach(function(m){
      if(m.tipo==='entrada' && mesKey(m.fecha)===mesPrev){
        if(_esEntradaEspejoNoIngreso(m)) return;
        ingresosPrev+=m.monto||0;
      }
    });
    const balancePrev=ingresosPrev-totalPrev;

    const diffGastos=gastosTotalMes-totalPrev;
    const diffBalance=balance-balancePrev;
    const hayDatos=totalPrev>0;

    function arrow(val){ return val>0?'<i class="fa-solid fa-arrow-up"></i>':'<i class="fa-solid fa-arrow-down"></i>'; }
    function diffColor(val,invertir){ return invertir?(val<0?'var(--accent)':'var(--red)'):(val>0?'var(--accent)':'var(--red)'); }

    if(!hayDatos){
      compEl.innerHTML='<div style="font-size:12px;color:var(--text3);text-align:center;padding:6px 0;">Sin datos del mes anterior para comparar.</div>';
    } else {
      compEl.innerHTML=`
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;font-family:'DM Mono',monospace;margin-bottom:12px;">vs. ${mesNomPrev}</div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="font-size:13px;font-weight:600;">Gastos</div>
              <div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;">Antes: ${fmt(totalPrev)}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:14px;font-weight:600;font-family:'DM Mono',monospace;color:${diffColor(diffGastos,true)};">${diffGastos===0?'=':arrow(diffGastos)} ${fmt(Math.abs(diffGastos))}</div>
              <div style="font-size:10px;font-family:'DM Mono',monospace;color:var(--text3);">${totalPrev>0?Math.abs(Math.round(diffGastos/totalPrev*100))+'%':''} ${diffGastos<0?'menos':'más'}</div>
            </div>
          </div>
          <div style="height:1px;background:var(--border);"></div>
          ${ingresosEstimados>0&&ingresosPrev>0?`
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="font-size:13px;font-weight:600;">Balance</div>
              <div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;">Antes: ${balancePrev>=0?'+':''}${fmt(balancePrev)}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:14px;font-weight:600;font-family:'DM Mono',monospace;color:${diffColor(diffBalance,false)};">${diffBalance===0?'=':arrow(diffBalance)} ${fmt(Math.abs(diffBalance))}</div>
              <div style="font-size:10px;font-family:'DM Mono',monospace;color:${diffColor(diffBalance,false)};">${diffBalance>0?'Mejoró':'Empeoró'}</div>
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
      patriEl.innerHTML='<div style="font-size:12px;color:var(--text3);text-align:center;padding:20px 0;">Aún no hay suficiente historial. Vuelve mañana.</div>';
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
      const pts=valsReales.map((v,i)=>{
        const px=PAD+i*(W-PAD*2)/(hist.length-1);
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
      const diffColor=diffTotal>=0?'var(--accent)':'var(--red)';
      const diffPct = primeroReal!==0 ? (diffTotal/Math.abs(primeroReal)*100) : 0;
      patriEl.innerHTML=`
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
          <div>
            <div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:.7px;">Últimos ${hist.length} días</div>
            <div style="font-size:20px;font-weight:500;font-family:'DM Mono',monospace;margin-top:2px;">${fmt(ultimo2.valorVisible!=null?ultimo2.valorVisible:ultimo2.valor)}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:12px;font-weight:600;font-family:'DM Mono',monospace;color:${diffColor};">${diffTotal>=0?'+':''}${fmt(diffTotal)}</div>
            <div style="font-size:10px;color:${diffColor};font-family:'DM Mono',monospace;">${diffPct>=0?'+':''}${diffPct.toFixed(1)}%</div>
          </div>
        </div>
        <div id="_pat-wrap" style="position:relative;touch-action:pan-y;">
          <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:90px;display:block;">
            <defs>
              <linearGradient id="pgGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="${diffTotal>=0?'#c8f060':'#f06868'}" stop-opacity="0.25"/>
                <stop offset="100%" stop-color="${diffTotal>=0?'#c8f060':'#f06868'}" stop-opacity="0"/>
              </linearGradient>
            </defs>
            <path d="${areaPath}" fill="url(#pgGrad)"/>
            <polyline points="${polyline}" fill="none" stroke="${diffColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <circle id="_pat-dot" cx="${pts[pts.length-1][0]}" cy="${pts[pts.length-1][1]}" r="4" fill="${diffColor}"/>
            <line id="_pat-line" x1="0" y1="0" x2="0" y2="${H}" stroke="${diffColor}" stroke-width="1" stroke-dasharray="3,3" opacity="0" style="pointer-events:none;"/>
          </svg>
          <div id="_pat-tt" style="display:none;position:absolute;top:0;background:#1a1a1a;border:1px solid #383838;border-radius:9px;padding:8px 12px;font-family:'DM Mono',monospace;pointer-events:none;z-index:50;white-space:nowrap;box-shadow:0 4px 20px rgba(0,0,0,.8);transform:translateX(-50%);"></div>
          <div id="_pat-overlay" style="position:absolute;inset:0;cursor:crosshair;" data-pts='${JSON.stringify(pts.map(([px,py],i)=>({px,py,fecha:hist[i].fecha,valor:valsReales[i],valorReal:(hist[i].valorVisible!=null?hist[i].valorVisible:hist[i].valor)})))}' data-W="${W}" data-H="${H}" data-diffcolor="${diffColor}"></div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:4px;">
          <span style="font-size:9px;color:var(--text3);font-family:'DM Mono',monospace;">${primero.fecha.slice(5)}</span>
          <span style="font-size:9px;color:var(--text3);font-family:'DM Mono',monospace;">${ultimo2.fecha.slice(5)}</span>
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
          tt.innerHTML = `<div style="color:var(--text2);font-size:9px;margin-bottom:3px;">${fechaFmt}</div><div style="color:#f0ede8;font-size:13px;font-weight:700;">${valorTxt}</div>`;
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
    el.innerHTML='<div style="padding:13px 0;font-size:12px;color:var(--text3);">Sin ingresos fijos. Agregá tu sueldo, freelance u otro ingreso recurrente.</div>';
    return;
  }
  el.innerHTML=lista.map(ing=>{
    const desdeLabel=ing.desde?`<span style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;">desde ${ing.desde}</span>`:'';
    return`<div class="row" style="padding:12px 0;">
      <div style="display:flex;flex-direction:column;gap:2px;flex:1;">
        <span style="font-size:13px;font-weight:600;">${escHtml(ing.nombre||'Sin nombre')}</span>
        ${desdeLabel}
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:14px;font-family:'DM Mono',monospace;color:var(--accent);font-weight:600;">${fmt(ing.monto||0)}</span>
        <button type="button" ${Events.attr('analisis:editarIngresoFijo', ing.id)} style="background:none;border:none;color:var(--text3);cursor:pointer;padding:4px;font-size:13px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button type="button" ${Events.attr('analisis:eliminarIngresoFijo', ing.id)} style="background:none;border:none;color:var(--red);cursor:pointer;padding:4px;font-size:13px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </div>
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
  const ok=await dialogo('Eliminar ingreso','¿Eliminar "'+ing.nombre+'"?','Eliminar',true);
  if(!ok)return;
  S.ingresosFijos=(S.ingresosFijos||[]).filter(x=>x.id!==id);
  save();renderIngresosFijos();renderAnalisis();
}

function guardarIngresoFijo(){
  const n=(document.getElementById('if_n').value||'').trim();
  const m=parseMoney(document.getElementById('if_m').value);
  const d=(document.getElementById('if_d').value||'').trim();
  if(!n){toast('Ingresá un nombre','err');return;}
  if(!m||m<=0){toast('Ingresá un monto válido','err');return;}
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
  lista.innerHTML = cats.map(cat => {
    const val = S.presupuestos[cat] || '';
    return `<div class="ig">
      <label class="il">${cat}</label>
      <div style="display:flex;gap:8px;align-items:center;">
        <input type="text" inputmode="decimal" class="presup-input" data-cat="${cat}" placeholder="Sin límite" value="${val}" style="flex:1;padding:10px 13px;background:var(--bg3);border:1.5px solid var(--border2);border-radius:var(--radius-sm);color:var(--text);font-size:14px;font-family:'DM Mono',monospace;outline:none;">
        <span style="font-size:12px;color:var(--text3);flex-shrink:0;">/mes</span>
      </div>
    </div>`;
  }).join('');

  lista.querySelectorAll('.presup-input').forEach(inp => {
    inp.addEventListener('change', function(){
      const cat = this.dataset.cat;
      const val = window.parseMoney ? window.parseMoney(this.value) : parseFloat(this.value)||0;
      if(!S.presupuestos) S.presupuestos = {};
      if(val > 0) S.presupuestos[cat] = val;
      else delete S.presupuestos[cat];
      if(window._fbSaveToCloud) window._fbSaveToCloud();
      renderPresupuestos();
    });
  });

  if(window.openSheet) window.openSheet('presupuestos');
}

function renderPresupuestos(){
  const el = document.getElementById('an-presupuestos');
  if(!el) return;
  window._presupWarned = false; // Bug fix: resetear para que el aviso funcione en cada render
  const presup = S.presupuestos || {};
  const cats = Object.keys(presup);
  if(!cats.length){ el.innerHTML='<div style="font-size:12px;color:var(--text3);text-align:center;padding:8px 0;">Sin presupuestos configurados. Toca "Editar" para definirlos.</div>'; return; }
  const mes = window.mesActual ? window.mesActual() : '';
  const pagosGF = S.pagosGastosFijos || {};

  // Calcular gasto por categoría este mes
  const gastoCat = {};
  (S.gastosVar||[]).filter(g=>mesKey(g.fecha)===mes&&!_esGastoVarNoReal(g)).forEach(g=>{
    const c=g.cat||'Otro';
    gastoCat[c]=(gastoCat[c]||0)+(g.monto||0);
  });
  (S.gastosFijos||[]).forEach(g=>{ if(pagosGF[g.id+'_'+mes]){ const c=g.cat||'Otro'; gastoCat[c]=(gastoCat[c]||0)+(g.monto||0); } });

  el.innerHTML = cats.map(cat => {
    const limite = presup[cat];
    const gasto = gastoCat[cat]||0;
    const pct = Math.min(100, Math.round(gasto/limite*100));
    const col = pct >= 100 ? 'var(--red)' : pct >= 80 ? 'var(--amber)' : 'var(--accent)';
    if(pct >= 80 && pct < 100 && !window._presupWarned) { window._presupWarned=true; if(window.toast) window.toast(`¡Atención! Llevas ${pct}% del presupuesto de ${cat}`,'info',4000); }
    return `<div class="presup-row">
      <div class="presup-label-row">
        <span style="font-size:12px;font-weight:600;">${cat}</span>
        <span style="font-size:11px;font-family:'DM Mono',monospace;color:${col};">${fmt(gasto)} / ${fmt(limite)}</span>
      </div>
      <div class="presup-bar">
        <div class="presup-bar-fill" style="width:${pct}%;background:${col};"></div>
      </div>
    </div>`;
  }).join('');
}

/* ---- EVENTOS: acciones con data-action="analisis:..." ---- */
Events.registerAll('analisis', {
  abrirSheetIngresoFijo,
  editarIngresoFijo,
  eliminarIngresoFijo,
  abrirPresupuestos,
});

/* ---- WIRING de controles que no son data-action simples ---- */
const _btnGuardarIngresoFijo = document.getElementById('btn-guardar-ingreso-fijo');
if (_btnGuardarIngresoFijo) _btnGuardarIngresoFijo.addEventListener('click', guardarIngresoFijo);
