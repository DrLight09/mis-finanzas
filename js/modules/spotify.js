/* ═══════════════════════════════════════════════════════════════
   js/modules/spotify.js

   Módulo Spotify de mis-finanzas — funciones base (personas del plan,
   cobros, pago al servicio, ganancia). Documentación funcional
   completa en docs/spotify.md — este archivo es la implementación.

   ⚠️ ORDEN DE CARGA: este archivo debe cargarse ANTES de que
   openSheet() se defina más abajo en index.html, porque un par de
   wirings de botones de OTROS módulos (Encargos, Mesada — ver
   docs/CHANGELOG.md#infraestructura--seguridad) referencian
   addSpotify/guardarEditarSpotify de forma inmediata, no diferida,
   y necesitan que ya existan en ese punto del documento. Por eso el
   <script src> de este archivo vive en el mismo lugar donde antes
   estaba el bloque "SPOTIFY" inline (temprano en el documento).

   La integración con el sistema de Personas vive aparte, en
   js/modules/spotify-personas.js, cargado mucho más abajo — ver el
   comentario al principio de ese archivo para el porqué.

   Depende de globals del núcleo compartido (S, save, refresh,
   escHtml, fmt, toast, dialogo, uid, hoy, emptyState, getFuentes*,
   sumarFuente, descontarFuente, calcC, getSaldoActual) y de
   js/core/events.js (Events), que debe cargarse antes que este.
   ═══════════════════════════════════════════════════════════════ */

/* ---- SPOTIFY ---- */
let spDestinoIdx=null;
let spDestinoPago=0;
let spDestinoNombre='';

function getSpCajita(){
  // Finds or returns null for the Spotify cajita
  if(S.spotifyCajitaId){
    const c=(S.cajitas||[]).find(x=>x.id===S.spotifyCajitaId);
    if(c)return c;
  }
  // Try to find one named Spotify
  const c=(S.cajitas||[]).find(x=>x.nombre&&x.nombre.toLowerCase().includes('spotify'));
  if(c){S.spotifyCajitaId=c.id;return c;}
  return null;
}

function getSpCajitaSaldo(){
  const c=getSpCajita();
  return c?calcC(c).val:0;
}

// Nombre a mostrar/guardar para un integrante de Spotify: si está vinculado a una
// persona del sistema unificado, usa siempre su nombre ACTUAL (por si lo editaron
// desde "Personas"); si no hay vínculo, o la persona ya no existe, usa el nombre
// crudo guardado en el propio registro de Spotify.
function spNombreDe(p){
  if(!p)return '';
  if(p.personaId){
    const per=(typeof getPersona==='function')?getPersona(p.personaId):null;
    if(per&&per.nombre)return per.nombre;
  }
  return p.nombre||'';
}

function spPersonaPagadaVigente(p){
  // Determina si el "Pagó" de esta persona sigue vigente para el ciclo actual.
  // Si ya llegó (o pasó) su fecha de próximo pago, el ciclo vencido ya terminó
  // y debe volver a mostrarse como "Pendiente" aunque el flag pagado siga en true.
  if(!p||!p.pagado)return false;
  if(!p.proximoPago)return true;
  const hoy0=new Date();hoy0.setHours(0,0,0,0);
  const prox=new Date(p.proximoPago+'T00:00:00');
  return prox>hoy0;
}

function spPeriodosVencidos(p,fechaCorte){
  // Cuenta cuántos períodos de 30 días de este integrante ya se vencieron a la fecha
  // de corte dada, partiendo de su `proximoPago` vigente — que ya refleja todos los
  // cobros aplicados hasta ahora (cada cobro lo avanza N*30 días al confirmarse).
  // Reemplaza al viejo cálculo "monto − total cobrado en el ciclo", que solo detectaba
  // como mucho UN período de deuda por persona: si alguien pagó un período dentro de
  // un ciclo largo y luego se le venció OTRO sin pagarlo, "total cobrado ≥ una cuota"
  // ya daba pend=0 aunque en la realidad debía el período nuevo. Ver CHANGELOG.md.
  if(!p||!p.proximoPago)return 0;
  const corte=new Date(fechaCorte+'T00:00:00');
  let cursor=new Date(p.proximoPago+'T00:00:00');
  let n=0;
  while(cursor<=corte){ n++; cursor.setDate(cursor.getDate()+30); }
  return n;
}

function spCicloCobrosActual(){
  // Cobros registrados en el historial desde el último pago real a Spotify (ciclo actual).
  // Si nunca se ha pagado, todo el historial de cobros pertenece al ciclo actual.
  // Se excluyen los cobros con _pagoIdCierre: aunque queden posicionados después del
  // último pago (porque se registraron más tarde), son plata que en realidad saldó
  // deuda de ESE ciclo que ya cerró — ver confirmarSpDestino().
  const hist=S.spotifyHistorial||[];
  let lastPagoIdx=-1;
  for(let i=hist.length-1;i>=0;i--){ if(hist[i].tipo==='pago'){lastPagoIdx=i;break;} }
  return hist.map((h,idx)=>({...h,_idx:idx})).filter(h=>h.tipo==='cobro'&&h._idx>lastPagoIdx&&!h._pagoIdCierre);
}

function spCobradoDePersona(p,cicloCobros){
  // Suma lo que una persona ya aportó en el ciclo actual, vinculando por id
  // (o por nombre como respaldo para registros antiguos sin spId).
  return (cicloCobros||spCicloCobrosActual()).filter(h=>p.id?h.spId===p.id:h.nombre===p.nombre).reduce((a,h)=>a+(h.monto||0),0);
}

function nextMonthFixed(dateStr, mesesAdelantar){
  // Avanza N*30 dias desde la fechaProximoPago (no desde hoy ni desde cuando pago)
  // Ej: si la proxima fecha era el 8-jun y pago el 5-jun o el 10-jun, la siguiente es 8-jun + 30d
  if(!dateStr)return'';
  const d=new Date(dateStr+'T00:00:00');
  const dias=(mesesAdelantar||1)*30;
  d.setDate(d.getDate()+dias);
  return d.toISOString().split('T')[0];
}

function renderSpotify(){
  const el=document.getElementById('spotifyList');
  const p=S.spotifyPersonas||[];
  const costo=S.spotifyCosto||0;
  // "Recaudado"/"Pendiente" se calculan desde el historial del ciclo actual (movimientos reales),
  // no desde el flag "pagado" — así no se descuadran si solo tocas el badge para corregir un error.
  const cicloCobros=spCicloCobrosActual();
  const cob=cicloCobros.reduce((a,h)=>a+(h.monto||0),0);
  // Si alguien prepagó varios períodos, su cobertura puede caer en un ciclo anterior
  // (antes del último pago real) y "desaparecer" de cicloCobros — pero mientras su
  // proximoPago siga en el futuro, sigue cubierto y no debe contar como pendiente.
  const cobPend=p.reduce((a,x)=>{
    if(spPersonaPagadaVigente(x))return a;
    return a+spPeriodosVencidos(x,hoy())*(x.monto||0);
  },0);
  const cajitaSaldo=getSpCajitaSaldo();
  
  document.getElementById('spCob').textContent=fmt(cob);
  document.getElementById('spPend').textContent=fmt(cobPend);
  document.getElementById('spProg').style.width=(costo>0?Math.min(100,cob/costo*100):0).toFixed(0)+'%';
  document.getElementById('spProgLabel').textContent=(costo>0?Math.round(cob/costo*100)+'% recaudado':'');

  // Aviso cuando no está configurado el costo del plan
  let warnEl=document.getElementById('sp-costo-warn');
  if(costo===0){
    if(!warnEl){
      warnEl=document.createElement('div');
      warnEl.id='sp-costo-warn';
      warnEl.style.cssText='display:flex;align-items:center;gap:8px;background:rgba(240,184,64,0.12);border:1.5px solid var(--amber);border-radius:var(--radius-sm);padding:10px 13px;margin-bottom:12px;font-size:12px;color:var(--amber);cursor:pointer;';
      warnEl.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><span>No configuraste el costo del plan — los cálculos de ganancia no son precisos. <u>Configurar ahora</u></span>';
      warnEl.addEventListener('click', ()=>{ const inp=document.getElementById('spotifyCosto'); if(inp){ inp.focus(); inp.select(); } });
      const spList=document.getElementById('spotifyList');
      if(spList&&spList.parentNode) spList.parentNode.insertBefore(warnEl,spList);
    }
  } else {
    if(warnEl) warnEl.remove();
  }

  // Estado de la cajita = ¿alcanza lo guardado ahí para cubrir el costo?
  // (Esto es solo un chequeo de liquidez de la cajita puntual, no la ganancia real:
  // la ganancia real ya se calcula en renderSpStats a partir de todo el historial,
  // sin importar a qué cuenta llegó cada cobro.)
  const cajitaEl=document.getElementById('spCajitaSaldo');
  cajitaEl.textContent=fmt(cajitaSaldo);
  const statusEl=document.getElementById('spCajitaStatus');
  if(costo>0){
    const diferencia=cajitaSaldo-costo;
    if(diferencia>0){
      statusEl.textContent='Te sobra '+fmt(diferencia);
      statusEl.style.color='var(--accent)';
    } else if(cajitaSaldo>0){
      statusEl.textContent='Faltan '+fmt(-diferencia)+' para pagar';
      statusEl.style.color='var(--amber)';
    } else {
      statusEl.textContent='Sin saldo en cajita';
      statusEl.style.color='var(--text3)';
    }
  } else {
    statusEl.textContent='';
  }
  
  if(!p.length){el.innerHTML=emptyState(
    '<svg width="20" height="20" viewBox="0 0 25 26" fill="none"><path d="M12.046 23.6856C18.257 23.6856 23.292 18.5625 23.292 12.2428C23.292 5.92312 18.257 0.800003 12.046 0.800003C5.835 0.800003 0.799988 5.92312 0.799988 12.2428C0.799988 18.5625 5.835 23.6856 12.046 23.6856Z" stroke="var(--text3)" stroke-width="1.8"/></svg>',
    'Sin personas en Spotify',
    'Agrega a las personas que comparten tu plan para hacer seguimiento de sus cobros mensuales.',
    'Agregar persona',
    {action:'spotify:abrirSheetAgregar'}
  );}
  else {
    // Ordenar por proximidad al próximo pago: vencidos primero (más negativos), luego más próximos
    const pOrdenado=[...p].map((x,i)=>({...x,_origIdx:i})).sort((a,b)=>{
      const far=99999;
      const dA=a.proximoPago?Math.ceil((new Date(a.proximoPago+'T00:00:00')-new Date())/86400000):far;
      const dB=b.proximoPago?Math.ceil((new Date(b.proximoPago+'T00:00:00')-new Date())/86400000):far;
      return dA-dB;
    });
    el.innerHTML=`<div class="card">${pOrdenado.map((x)=>{
    const i=x._origIdx;
      let fechaInfo='';
      if(x.proximoPago){
        const diasRestantes=Math.ceil((new Date(x.proximoPago+'T00:00:00')-new Date())/86400000);
        const vencido=diasRestantes<0;
        const hoy0=diasRestantes===0;
        fechaInfo=`<span class="badge ${vencido?'bg-red':hoy0?'bg-amber':'bg-purple'}" style="font-size:9px;">${vencido?'Vencido hace '+Math.abs(diasRestantes)+'d':hoy0?'Vence hoy':'Paga en '+diasRestantes+'d · '+x.proximoPago}</span>`;
      }
      const destinoBadge=x.ultimoDestino?`<span class="badge ${fuenteBadgeClass(x.ultimoDestino)}" style="font-size:8px;display:inline-flex;align-items:center;gap:3px;"><svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg> ${fuenteLabel(x.ultimoDestino)}</span>`:'';
      return`<div class="sp-row">
        <div style="display:flex;align-items:center;">
          <div class="avatar">${escHtml(spNombreDe(x).substring(0,2).toUpperCase())}</div>
          <div>
            <div class="row-name" style="font-size:13px;">${escHtml(spNombreDe(x))}</div>
            <div class="row-sub">${fmt(x.monto)}/período${(x.mesesAdelantados>1&&spPersonaPagadaVigente(x))?' · <span class="sp-meses-badge">'+x.mesesAdelantados+'p adelantados</span>':''}</div>
            ${fechaInfo?'<div style="margin-top:3px;">'+fechaInfo+'</div>':''}
            ${destinoBadge?'<div style="margin-top:2px;">'+destinoBadge+'</div>':''}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:7px;">
          <span class="badge ${spPersonaPagadaVigente(x)?'bg-green':'bg-red'}" ${Events.attr('spotify:marcarPago', i)} style="cursor:pointer;" title="${spPersonaPagadaVigente(x)?'Ya pagó · clic para revertir':'Cobrar a '+escHtml(spNombreDe(x))}">${spPersonaPagadaVigente(x)?'Pagó':'Cobrar'}</span>
          <div style="display:flex;align-items:center;gap:2px;">
            <button type="button" class="btn-icon" style="color:var(--accent);min-width:34px;min-height:34px;" ${Events.attr('spotify:editar', i)} title="Editar"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
            <button type="button" class="btn-icon" style="min-width:34px;min-height:34px;" ${Events.attr('spotify:eliminar', i)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
          </div>
        </div>
      </div>`;
    }).join('')}</div>`;
  }
  
  // Badge en home: avisar si hay pagos próximos o vencidos (<= 3 días)

  // Historial
  renderSpHistorial();
  // Estadísticas
  renderSpStats();
}

function renderSpHistorial(){
  const el=document.getElementById('spHistorial');
  if(!el)return;
  const total=S.spotifyHistorial||[];
  // Mapear con índice real antes de invertir
  const hist=total.map((h,i)=>({...h,_realIdx:i})).reverse().slice(0,12);
  if(!hist.length){el.innerHTML='<div style="font-size:12px;color:var(--text3);padding:4px 0;">Sin pagos registrados aún.</div>';return;}
  el.innerHTML=hist.map(h=>`
    <div class="card card-sm" style="margin-bottom:7px;">
      <div class="row" style="align-items:flex-start;gap:10px;">
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;font-weight:500;">${h.tipo==='pago'?'Pago a Spotify':'Cobro de '+escHtml(h.nombre)}</div>
          <div style="font-size:10px;color:var(--text2);margin-top:1px;">${h.fecha}${h.fuente?' · '+fuenteLabel(h.fuente):''}${h.nota?' · <span style="color:var(--blue);">'+escHtml(h.nota)+'</span>':''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
          <div style="font-size:13px;font-weight:500;font-family:'DM Mono',monospace;white-space:nowrap;color:${h.tipo==='pago'?'var(--red)':'var(--accent)'};">${h.tipo==='pago'?'−':'+'} ${fmt(h.monto)}</div>
          <button type="button" class="btn-icon" style="color:var(--text3);min-width:36px;min-height:36px;" ${Events.attr('spotify:eliminarHistorial', h._realIdx)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
        </div>
      </div>
    </div>`).join('');
}

function renderSpStats(){
  const el=document.getElementById('spStats');
  if(!el)return;
  const personas=S.spotifyPersonas||[];
  const hist=S.spotifyHistorial||[];
  const costo=S.spotifyCosto||0;

  if(!personas.length&&!hist.length){
    el.innerHTML='';
    return;
  }

  // ── Cobros y pagos del historial
  const cobros=hist.filter(h=>h.tipo==='cobro');
  const pagosSpotify=hist.filter(h=>h.tipo==='pago');
  const totalCobradoHist=cobros.reduce((a,h)=>a+(h.monto||0),0);
  const totalPagadoHist=pagosSpotify.reduce((a,h)=>a+(h.monto||0),0);

  // ── Cuota del admin (su "plan gratis")
  const totalSlots=personas.length+1;
  const cuotaAdmin=costo>0?Math.round(costo/totalSlots):0;
  const ciclosPagados=pagosSpotify.length;
  // Se usa la cuota guardada en cada pago (según la cantidad de personas de esa época);
  // los registros antiguos que no la tengan usan la cuota actual como respaldo.
  const ahorroCuotaAdmin=pagosSpotify.reduce((a,h)=>a+(h._cuotaAdmin!=null?h._cuotaAdmin:cuotaAdmin),0);

  // ── Ingreso mensual estimado (personas activas) — solo se usa como respaldo
  // mientras no haya ningún ciclo pagado todavía
  const ingresoEstimado=personas.reduce((a,p)=>a+(p.monto||0),0);
  const margen=costo>0?ingresoEstimado-costo+cuotaAdmin:0;

  // ── Ganancia REAL por ciclo pagado: recorre el historial y corta un "ciclo"
  // cada vez que aparece un pago real a Spotify. Así el flujo mensual deja de
  // ser un número teórico fijo y refleja lo que de verdad ganaste cada mes.
  const ciclosCompletos=[];
  {
    let cobroAcum=0;
    // Mapea el id de cada "pago" ya procesado al índice de su ciclo en ciclosCompletos,
    // para poder sumarle ahí un cobro atrasado que llega después marcado con
    // _pagoIdCierre — en vez de sumarlo al ciclo que esté acumulando en ese momento.
    const cicloPorPagoId={};
    for(const h of hist){
      if(h.tipo==='cobro'){
        if(h._pagoIdCierre&&cicloPorPagoId[h._pagoIdCierre]!==undefined){
          const idxCiclo=cicloPorPagoId[h._pagoIdCierre];
          ciclosCompletos[idxCiclo].cobrado+=(h.monto||0);
          ciclosCompletos[idxCiclo].ganancia+=(h.monto||0);
        } else {
          // Cobro normal del ciclo en curso, o _pagoIdCierre que ya no existe (el pago
          // que referenciaba fue eliminado) — cae al ciclo que se está acumulando.
          cobroAcum+=(h.monto||0);
        }
      }
      else if(h.tipo==='pago'){
        const cuotaAdminDeEseCiclo=h._cuotaAdmin!=null?h._cuotaAdmin:cuotaAdmin;
        ciclosCompletos.push({fecha:h.fecha, cobrado:cobroAcum, pagado:h.monto||0, ganancia:cobroAcum-(h.monto||0)+cuotaAdminDeEseCiclo});
        cicloPorPagoId[h.id]=ciclosCompletos.length-1;
        cobroAcum=0;
      }
    }
  }
  const promedioCiclo=ciclosCompletos.length?ciclosCompletos.reduce((a,c)=>a+c.ganancia,0)/ciclosCompletos.length:null;
  const ultimoCiclo=ciclosCompletos.length?ciclosCompletos[ciclosCompletos.length-1].ganancia:null;
  const mejorCiclo=ciclosCompletos.length?Math.max(...ciclosCompletos.map(c=>c.ganancia)):null;
  const peorCiclo=ciclosCompletos.length?Math.min(...ciclosCompletos.map(c=>c.ganancia)):null;

  // ── Ganancia real: solo calculable cuando hay pagos registrados
  const gananciaReal=totalCobradoHist-totalPagadoHist+ahorroCuotaAdmin;
  const hayCiclo=ciclosPagados>0;

  const cV=(v)=>v>0?'var(--accent)':v<0?'var(--red)':'var(--text2)';

  let html=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:7px;">`;

  // Flujo mensual: promedio real por ciclo pagado (si ya hay al menos uno),
  // o una proyección teórica mientras tanto — claramente marcada como tal.
  if(promedioCiclo!==null){
    html+=`<div class="stat" style="grid-column:1/-1;">
      <div class="stat-label">Promedio real por ciclo pagado</div>
      <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;">
        <div class="stat-value" style="color:${cV(promedioCiclo)};">${promedioCiclo>=0?'+':'\u2212'}${fmt(Math.abs(promedioCiclo))}</div>
        <div style="font-size:11px;color:var(--text2);">basado en ${ciclosCompletos.length} ciclo${ciclosCompletos.length!==1?'s':''} pagado${ciclosCompletos.length!==1?'s':''}</div>
      </div>
      <div style="font-size:10px;color:var(--text3);margin-top:3px;">último: ${ultimoCiclo>=0?'+':'\u2212'}${fmt(Math.abs(ultimoCiclo))}${ciclosCompletos.length>1?` · mejor: +${fmt(mejorCiclo)} · peor: ${peorCiclo>=0?'+':'\u2212'}${fmt(Math.abs(peorCiclo))}`:''}</div>
    </div>`;
  } else {
    html+=`<div class="stat" style="grid-column:1/-1;">
      <div class="stat-label">Margen proyectado</div>
      <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;">
        <div class="stat-value" style="color:${cV(margen)};">${margen>=0?'+':''}${fmt(Math.abs(margen))}</div>
        <div style="font-size:11px;color:var(--text2);">cobras ${fmt(ingresoEstimado)} en cuotas · el plan cuesta ${costo>0?fmt(costo):'—'}</div>
      </div>
      <div style="font-size:10px;color:var(--text3);margin-top:3px;">proyección con tu configuración actual, no con tu frecuencia real de pago — registrá un pago a Spotify para ver el promedio real por ciclo</div>
    </div>`;
  }

  // Total cobrado
  html+=`<div class="stat">
    <div class="stat-label">Total cobrado</div>
    <div class="stat-value c-green">${fmt(totalCobradoHist)}</div>
    <div style="font-size:10px;color:var(--text3);margin-top:3px;">${cobros.length} cobro${cobros.length!==1?'s':''}</div>
  </div>`;

  // Segunda stat: ganancia real si hay ciclo, balance del ciclo si no
  if(!hayCiclo&&totalCobradoHist>0&&costo>0){
    // Sin pagos a Spotify aún: mostrar cuánto falta/sobra para cubrir el costo
    const pendiente=costo-totalCobradoHist;
    const sobra=totalCobradoHist-costo;
    html+=`<div class="stat">
      <div class="stat-label">Balance del ciclo</div>
      ${pendiente>0
        ?`<div class="stat-value" style="color:var(--amber);">\u2212${fmt(pendiente)}</div>
          <div style="font-size:10px;color:var(--text3);margin-top:3px;" title="Falta recaudar para cubrir el plan completo, tu parte incluida.">falta para cubrir el plan</div>`
        :`<div class="stat-value" style="color:var(--accent);">+${fmt(sobra)}</div>
          <div style="font-size:10px;color:var(--text3);margin-top:3px;" title="Esto es lo que ganas después de cubrir el plan completo, incluida tu propia parte.">ya cubriste el plan</div>`
      }
    </div>`;
  } else if(hayCiclo){
    html+=`<div class="stat">
      <div class="stat-label">Ganancia acumulada</div>
      <div class="stat-value" style="color:${cV(gananciaReal)};">${gananciaReal>=0?'+':'\u2212'}${fmt(Math.abs(gananciaReal))}</div>
      <div style="font-size:10px;color:var(--text3);margin-top:3px;" title="${ahorroCuotaAdmin>0?'Cobrado menos pagado, más tu parte del plan, que ya quedó cubierta y no la pagaste de tu bolsillo.':'Cobrado menos pagado.'}">${gananciaReal<0?'de tu bolsillo · ':''}cobrado \u2212 pagado${ahorroCuotaAdmin>0?' + tu parte':''}</div>
    </div>`;
  } else {
    html+=`<div class="stat">
      <div class="stat-label">Ganancia acumulada</div>
      <div class="stat-value" style="color:var(--text3);">\u2014</div>
      <div style="font-size:10px;color:var(--text3);margin-top:3px;">sin cobros aún</div>
    </div>`;
  }

  // Aviso contextual mientras no haya un ciclo pagado
  if(!hayCiclo&&costo>0){
    html+=`<div style="grid-column:1/-1;font-size:10px;color:var(--text3);padding:6px 0 2px;">
      Registrá el pago a Spotify cuando lo hagas para ver la ganancia real acumulada.
    </div>`;
  }

  html+=`</div>`;
  el.innerHTML=html;
}
async function deleteSpHistorial(i){
  const ok=await dialogo('Eliminar movimiento','¿Eliminar este registro del historial? Esta acción no se puede deshacer. Esto también revierte la plata movida por este registro.','Eliminar',true);
  if(!ok)return;
  const h=S.spotifyHistorial[i];
  if(!h)return;

  if(h.tipo==='cobro'){
    // Revertir el movimiento secundario: la plata que entró a la cuenta destino al cobrar
    if(h.fuente)descontarFuente(h.fuente,h.monto||0);
    // Si este cobro estaba saldando deuda de un ciclo ya cerrado (_pagoIdCierre), devolver
    // esa plata al pendiente congelado de ese pago — si el pago referenciado ya no existe
    // (se borró aparte), no hay nada que restaurar, se queda como estaba.
    if(h._pagoIdCierre&&h.spId){
      const pagoRef=(S.spotifyHistorial||[]).find(x=>x.id===h._pagoIdCierre&&x.tipo==='pago');
      if(pagoRef){
        if(!pagoRef._pendienteAlCerrar)pagoRef._pendienteAlCerrar={};
        pagoRef._pendienteAlCerrar[h.spId]=(pagoRef._pendienteAlCerrar[h.spId]||0)+(h.monto||0);
      }
    }
    // Si este era el cobro MÁS RECIENTE de la persona, su "Pagó" queda sin respaldo → vuelve a Pendiente.
    // Si no es el más reciente (la persona pagó 2+ veces este ciclo y se borra uno viejo), no se toca
    // el estado, porque el cobro más nuevo sigue respaldando el "Pagó".
    const p=(S.spotifyPersonas||[]).find(x=>h.spId?x.id===h.spId:x.nombre===h.nombre);
    if(p){
      const mismaPersona=(h2)=>h.spId?h2.spId===h.spId:h2.nombre===h.nombre;
      const esElMasReciente=!S.spotifyHistorial.some((h2,idx2)=>idx2>i&&h2.tipo==='cobro'&&mismaPersona(h2));
      if(esElMasReciente){
        p.pagado=false;
        // Si ya no queda ningún "hermano" del mismo lote (mismos meses adelantados desde la
        // misma fecha previa), es seguro devolver la fecha de próximo pago a como estaba antes.
        if(h.proximoPagoAntes!==undefined){
          const quedaHermano=S.spotifyHistorial.some((h2,idx2)=>idx2!==i&&h2.tipo==='cobro'&&mismaPersona(h2)&&h2.proximoPagoAntes===h.proximoPagoAntes);
          if(!quedaHermano)p.proximoPago=h.proximoPagoAntes;
        }
      }
    }
  } else if(h.tipo==='pago'){
    // Revertir el movimiento secundario: la plata que salió de la cuenta al pagar Spotify
    if(h.fuente)sumarFuente(h.fuente,h.monto||0);
    // Eliminar el gasto variable que se generó junto con este pago
    if(h._gastoVarId&&S.gastosVar){
      S.gastosVar=S.gastosVar.filter(g=>g.id!==h._gastoVarId);
    }
    // Este pago reseteó "pagado" a false para el ciclo — devolver a cada persona
    // exactamente el estado que tenía justo antes de ese reseteo masivo, en vez de
    // dejar a todo el mundo en "Pendiente" sin forma de deshacerlo.
    if(h._estadoAntes&&Array.isArray(h._estadoAntes)){
      h._estadoAntes.forEach(snap=>{
        const per=(S.spotifyPersonas||[]).find(x=>x.id===snap.id);
        if(per)per.pagado=snap.pagado;
      });
    }
  }

  S.spotifyHistorial.splice(i,1);
  save();refresh();
  toast('Movimiento eliminado y plata revertida','ok');
}

function marcarPagoSpotify(i){
  const p=S.spotifyPersonas[i];
  if(spPersonaPagadaVigente(p)){
    // Ya pagó (y sigue vigente) → esto es solo una corrección manual del badge.
    // NO revierte ningún cobro ni movimiento de plata: si quieres revertir el dinero
    // cobrado, elimina el movimiento correspondiente en el Historial de pagos.
    p.pagado=false;
    save();renderSpotify();
    return;
  }
  // Cobrar → abrir sheet con períodos adelantados + destino
  spDestinoIdx=i;
  spDestinoPago=p.monto||0;
  spDestinoNombre=spNombreDe(p);
  // Desc
  document.getElementById('spDestinoDesc').textContent=`${spNombreDe(p)} — ${fmt(p.monto)}/período`;
  // Meses: select con 1 mes predeterminado
  const mesesSel=document.getElementById('spMesesSelect');
  mesesSel.value='1';
  document.getElementById('spMesesTotal').textContent='Total a cobrar: '+fmt(p.monto*1);
  // Fuentes: select, forzando una elección explícita (incluida "Sin especificar")
  // No se puede guardar plata ajena en una TC (mismo criterio que Encargos, "Yo debo",
  // Mis deudas y Alcancía) — por eso getFuentesSinTC() y no getFuentes().
  const fuentes=getFuentesSinTC();
  const destSel=document.getElementById('spDestinoSelect');
  destSel.innerHTML='<option value="" disabled selected>Selecciona una opción...</option>'
    +fuentes.map(f=>`<option value="${f.val}">${f.label}</option>`).join('')
    +'<option value="__sin_especificar__">Sin especificar (no mover)</option>';
  // Editable para poder anotar un cobro días después sin que quede fechado hoy
  // por error (ver auditoria-tecnica.md — atribución de ciclo por deuda, no por fecha).
  const fechaEl=document.getElementById('spFecha');
  if(fechaEl)fechaEl.value=hoy();
  openSheet('sp-destino');
}

function selSpMeses(){
  const n=parseInt(document.getElementById('spMesesSelect').value)||1;
  const monto=(S.spotifyPersonas[spDestinoIdx]?.monto||0)*n;
  document.getElementById('spMesesTotal').textContent='Total a cobrar: '+fmt(monto);
}

function confirmarSpDestino(){
  if(spDestinoIdx===null)return;
  const destVal=document.getElementById('spDestinoSelect').value;
  if(!destVal){
    toast('Selecciona a dónde metiste la plata (o marca "Sin especificar")','err');
    return;
  }
  const fechaEl=document.getElementById('spFecha');
  const fechaCobro=(fechaEl&&fechaEl.value)?fechaEl.value:hoy();
  const spDestinoSel=destVal==='__sin_especificar__'?'':destVal;
  const p=S.spotifyPersonas[spDestinoIdx];
  const nombreActual=spNombreDe(p);
  const meses=parseInt(document.getElementById('spMesesSelect').value)||1;
  const montoTotal=(p.monto||0)*meses;
  const proximoPagoAntes=p.proximoPago||'';
  p.pagado=true;
  p.mesesAdelantados=meses;
  p.ultimoDestino=spDestinoSel||'';
  // Sumar dinero a la fuente si se especificó
  if(spDestinoSel)sumarFuente(spDestinoSel,montoTotal);
  // Avanzar fecha de cobro N meses pero respetando el día original fijo
  if(p.proximoPago)p.proximoPago=nextMonthFixed(p.proximoPago,meses);
  if(!S.spotifyHistorial)S.spotifyHistorial=[];
  const notaBase=meses>1?`${meses} períodos × ${fmt(p.monto||0)} (pago adelantado)`:'';

  // Si el último pago a Spotify cerró un ciclo donde esta persona quedó debiendo algo
  // (_pendienteAlCerrar, congelado en confirmarPagarSpotify), este cobro salda primero
  // esa deuda vieja — se registra como un movimiento aparte atribuido a ESE ciclo
  // cerrado, no al ciclo actual, sin importar que hoy ya vayamos en uno nuevo. Solo lo
  // que sobre después de saldarla cuenta como plata del ciclo en curso. Así una persona
  // puede pagar atrasado después de que yo ya le pagué a Spotify (porque confío en que
  // me va a pagar) sin que esa plata infle "Recaudado" del ciclo nuevo ni le reste
  // ganancia al ciclo que ya cerré. Ver auditoria-tecnica.md.
  let lastPago=null;
  for(let i=S.spotifyHistorial.length-1;i>=0;i--){ if(S.spotifyHistorial[i].tipo==='pago'){lastPago=S.spotifyHistorial[i];break;} }
  let restante=montoTotal;
  if(lastPago&&lastPago._pendienteAlCerrar&&lastPago._pendienteAlCerrar[p.id]>0){
    const pendienteViejo=lastPago._pendienteAlCerrar[p.id];
    const cierreMonto=Math.min(restante,pendienteViejo);
    lastPago._pendienteAlCerrar[p.id]=pendienteViejo-cierreMonto;
    if(lastPago._pendienteAlCerrar[p.id]<=0)delete lastPago._pendienteAlCerrar[p.id];
    S.spotifyHistorial.push({id:uid(),spId:p.id,tipo:'cobro',nombre:nombreActual,monto:cierreMonto,periodos:meses,fuente:spDestinoSel||'',fecha:fechaCobro,nota:'Pago atrasado del ciclo anterior'+(notaBase?' · '+notaBase:''),proximoPagoAntes,_pagoIdCierre:lastPago.id,_secundario:true,_origenSeccion:'Spotify'});
    restante-=cierreMonto;
  }
  // Registrar en historial el resto (o el total, si no había deuda vieja) como UN solo
  // registro — aunque cubra varios períodos, es una sola plata que entró en un solo
  // movimiento a la cuenta. El detalle de cuántos períodos y a cómo cada uno queda en
  // la nota. Se guarda el nombre ACTUAL de la persona vinculada, no el crudo, para que
  // no quede fijado desactualizado.
  if(restante>0){
    S.spotifyHistorial.push({id:uid(),spId:p.id,tipo:'cobro',nombre:nombreActual,monto:restante,periodos:meses,fuente:spDestinoSel||'',fecha:fechaCobro,nota:notaBase,proximoPagoAntes,_secundario:true,_origenSeccion:'Spotify'});
  }
  spDestinoIdx=null;
  save();refresh();closeSheet('sp-destino');
  toast(meses>1?`Cobrados ${meses} períodos adelantados a ${escHtml(nombreActual)} · ${fmt(montoTotal)}`:`Cobro registrado · ${escHtml(nombreActual)}`,'ok');
}

function openSheet_pagarSpotify(){
  const costo=S.spotifyCosto||0;
  const cajitaSaldo=getSpCajitaSaldo();
  // Pre-llenar con el costo
  document.getElementById('spPagarMonto').value=costo?fmtInput(costo):'';
  // Info cajita
  const infoEl=document.getElementById('spPagarSaldoInfo');
  const cajita=getSpCajita();
  if(cajita){
    infoEl.textContent='Cajita Spotify: '+fmt(cajitaSaldo)+(cajitaSaldo>=costo?' Suficiente':' — faltan '+fmt(costo-cajitaSaldo));
  } else {
    infoEl.textContent='No tienes cajita de Spotify configurada en Nu.';
  }
  // Poblar fuentes
  const sel=document.getElementById('spPagarFuente');
  const fuentes=getFuentes();
  sel.innerHTML='<option value="">Sin especificar</option>'+fuentes.map(f=>`<option value="${f.val}"${cajita&&f.val==='cajita:'+cajita.id?' selected':''}>${f.label}</option>`).join('');
  actualizarSpPagarPreview();
  const notaEl=document.getElementById('spPagarNota');
  if(notaEl)notaEl.value='';
  // Editable para poder registrar tarde un pago que en la realidad ya ocurrió antes
  // (ver auditoria-tecnica.md — atribución de ciclo por fecha real, no por orden de
  // entrada en el sistema).
  const fechaPagoEl=document.getElementById('spPagarFecha');
  if(fechaPagoEl)fechaPagoEl.value=hoy();
}

function actualizarSpPagarPreview(){
  const monto=parseMoney(document.getElementById('spPagarMonto').value)||0;
  const fuente=document.getElementById('spPagarFuente').value;
  const prev=document.getElementById('spPagarPreview');
  const fuenteInfo=document.getElementById('spPagarFuenteSaldo');
  if(fuente){
    const actual=getSaldoActual(fuente);
    fuenteInfo.textContent='Saldo disponible: '+fmt(actual);
    if(monto>0){
      const resultado=actual-monto;
      prev.textContent=fmt(actual)+' − '+fmt(monto)+' = '+fmt(resultado);
      prev.style.color=resultado<0?'var(--red)':'var(--accent)';
    } else{prev.textContent='';}
  } else {
    fuenteInfo.textContent='';prev.textContent='';
  }
}

function confirmarPagarSpotify(){
  const monto=parseMoney(document.getElementById('spPagarMonto').value)||0;
  const fuente=document.getElementById('spPagarFuente').value;
  const nota=document.getElementById('spPagarNota')?document.getElementById('spPagarNota').value.trim():'';
  if(!monto){toast('Ingresa el monto a pagar','err');return;}
  if(fuente){
    const saldoDisp=getSaldoActual(fuente);
    if(saldoDisp<monto){
      toast('Saldo insuficiente en '+fuenteLabel(fuente)+'. Disponible: '+fmt(saldoDisp),'err',3500);
      return;
    }
    descontarFuente(fuente,monto);
  }
  if(!S.spotifyHistorial)S.spotifyHistorial=[];
  // Registrar también como gasto variable para que aparezca en la sección Gastos
  if(!S.gastosVar)S.gastosVar=[];
  const gastoId=uid();
  S.gastosVar.push({id:gastoId,desc:'Spotify Premium',monto,fecha:hoy(),cat:'Suscripciones',fuente,nota:nota||'Pago mensual Spotify',_secundario:true,_origenSeccion:'Spotify'});
  // Se guarda la cuota del administrador vigente EN ESTE MOMENTO (según cuántas personas
  // hay ahora), para que si la cantidad de integrantes cambia en el futuro, la ganancia
  // de este ciclo ya pagado no se recalcule con datos de otra época.
  const totalSlotsAhora=(S.spotifyPersonas||[]).length+1;
  const cuotaAdminAhora=S.spotifyCosto>0?Math.round(S.spotifyCosto/totalSlotsAhora):0;
  // Foto de quién estaba "Pagó" justo antes de resetear el ciclo: si más adelante se
  // elimina este pago del historial, hay que poder devolver a cada persona a como
  // estaba, no dejar a todos en "Pendiente" sin poder deshacerlo.
  const estadoAntesReset=(S.spotifyPersonas||[]).map(p=>({id:p.id,pagado:!!p.pagado}));

  const fechaPagoEl=document.getElementById('spPagarFecha');
  const fechaPago=(fechaPagoEl&&fechaPagoEl.value)?fechaPagoEl.value:hoy();

  // Este pago puede registrarse DÍAS después de haber ocurrido en la realidad (ej: pagué
  // el 1, pero recién hoy lo anoto). Si mientras tanto ya se registraron cobros que en la
  // fecha real ya eran del ciclo NUEVO (posteriores a fechaPago), no hay que tratarlos
  // como si hubieran cerrado el ciclo viejo — hay que "moverlos" después de este pago en
  // el historial para que spCicloCobrosActual() los cuente donde de verdad corresponden.
  // Ver auditoria-tecnica.md — atribución de ciclo por fecha real, no por orden de entrada.
  let lastPagoIdx=-1;
  for(let i=S.spotifyHistorial.length-1;i>=0;i--){ if(S.spotifyHistorial[i].tipo==='pago'){lastPagoIdx=i;break;} }
  const antesDelSegmento=S.spotifyHistorial.slice(0,lastPagoIdx+1);
  const segmentoAbierto=S.spotifyHistorial.slice(lastPagoIdx+1);

  const quedanCerrando=[];   // de verdad pertenecen al ciclo que se está cerrando ahora
  const pasanANuevo=[];      // ya eran, en la realidad, del ciclo que arranca con este pago
  const cubiertoPorPersona={}; // acumulado ya confirmado como "cerrando", para el desempate del mismo día
  segmentoAbierto.forEach(h=>{
    // Los cobros que ya son cierre de un ciclo aún más viejo (_pagoIdCierre) no se tocan.
    if(h.tipo!=='cobro'||h._pagoIdCierre){ quedanCerrando.push(h); return; }
    if(h.fecha<fechaPago){
      quedanCerrando.push(h);
      if(h.spId)cubiertoPorPersona[h.spId]=(cubiertoPorPersona[h.spId]||0)+(h.monto||0);
    } else if(h.fecha>fechaPago){
      pasanANuevo.push(h);
    } else {
      // Mismo día que este pago: desempate por deuda, no por hora exacta. Si esa persona
      // ya tenía cubierta su cuota del ciclo que se cierra ANTES de este cobro puntual,
      // este cobro ya era, en la realidad, del ciclo nuevo — aunque comparta fecha.
      const persona=h.spId?(S.spotifyPersonas||[]).find(x=>x.id===h.spId):null;
      const cuota=persona?(persona.monto||0):0;
      const yaCubierto=h.spId?(cubiertoPorPersona[h.spId]||0):0;
      if(cuota>0&&yaCubierto>=cuota){
        pasanANuevo.push(h);
      } else {
        quedanCerrando.push(h);
        if(h.spId)cubiertoPorPersona[h.spId]=yaCubierto+(h.monto||0);
      }
    }
  });

  // Foto de cuánto le quedó debiendo cada persona al ciclo que se está cerrando (mismo
  // cálculo que "Pendiente por cobrar" en pantalla, pero congelado por persona y calculado
  // solo sobre lo que de verdad quedó en este ciclo tras la separación de arriba). Sirve
  // para que, si alguien paga atrasado DESPUÉS de este pago, ese cobro se le atribuya al
  // ciclo que en realidad estaba saldando — ver confirmarSpDestino() y auditoria-tecnica.md.
  const pendienteAlCerrar={};
  (S.spotifyPersonas||[]).forEach(x=>{
    if(spPersonaPagadaVigente(x))return;
    // Se cuenta por PERÍODOS vencidos (via proximoPago), no por dinero total cobrado
    // contra una sola cuota — un ciclo puede durar más de un período de esta persona,
    // y alguien puede pagar el primero y dejar vencer un segundo sin pagarlo dentro del
    // mismo ciclo. Comparar solo "cobrado ≥ una cuota" no detectaba ese segundo período.
    const periodosVencidos=spPeriodosVencidos(x,fechaPago);
    const pend=periodosVencidos*(x.monto||0);
    if(pend>0)pendienteAlCerrar[x.id]=pend;
  });

  const pagoObj={id:uid(),tipo:'pago',monto,fuente,fecha:fechaPago,nota,_gastoVarId:gastoId,_cuotaAdmin:cuotaAdminAhora,_estadoAntes:estadoAntesReset,_pendienteAlCerrar:pendienteAlCerrar};
  S.spotifyHistorial=[...antesDelSegmento,...quedanCerrando,pagoObj,...pasanANuevo];
  // Reset pagados del ciclo — pero respeta a quienes ya prepagaron períodos futuros:
  // si su próxima fecha de cobro sigue en el futuro, su "Pagó" sigue vigente y no debe
  // volver a Pendiente solo porque yo ya le pagué a Spotify.
  (S.spotifyPersonas||[]).forEach(p=>{
    const hoy0=new Date();hoy0.setHours(0,0,0,0);
    const sigueVigente=p.proximoPago&&new Date(p.proximoPago+'T00:00:00')>hoy0;
    if(!sigueVigente)p.pagado=false;
  });
  save();refresh();closeSheet('pagar-spotify');
}

function addSpotify(){
  const n=document.getElementById('sp_n').value.trim();
  const m=parseMoney(document.getElementById('sp_m').value)||0;
  if(!n){toast('Ingresa el nombre','err');return;}
  const yaExisteNombre=(S.spotifyPersonas||[]).some(p=>(p.nombre||'').trim().toLowerCase()===n.toLowerCase());
  if(yaExisteNombre){
    toast(`Ya hay un integrante llamado "${escHtml(n)}". Usa un nombre distinto (agregá un apellido o apodo) para no mezclar sus cobros en el historial.`,'err',4200);
    return;
  }
  const fechaIngresoRaw=document.getElementById('sp_fecha_ingreso').value;
  if(!fechaIngresoRaw){toast('Ingresa la fecha de ingreso','err');return;}
  // proximoPago = fechaIngreso + 30 dias (primer cobro)
  const dIng=new Date(fechaIngresoRaw+'T00:00:00');
  dIng.setDate(dIng.getDate()+30);
  const proximoPago=dIng.toISOString().split('T')[0];
  S.spotifyPersonas.push({id:uid(),nombre:n,monto:m,pagado:false,proximoPago,fechaIngreso:fechaIngresoRaw,ultimoDestino:'',mesesAdelantados:1});
  document.getElementById('sp_n').value='';
  document.getElementById('sp_m').value='';
  document.getElementById('sp_fecha_ingreso').value='';
  save();refresh();closeSheet('spotify');
  toast(`${escHtml(n)} agregado · primer cobro el ${proximoPago}`,'ok');
}
async function deleteSpotify(i){
  const p=(S.spotifyPersonas||[])[i];
  if(!p)return;
  const nombreActual=spNombreDe(p);
  const ok=await dialogo('Eliminar integrante',`¿Eliminar a ${nombreActual} de Spotify? Esta acción no se puede deshacer. Su historial de cobros anteriores se conserva en las estadísticas, pero dejará de aparecer en la lista.`,'Eliminar',true);
  if(!ok)return;
  S.spotifyPersonas.splice(i,1);
  save();refresh();
  toast(`${escHtml(nombreActual)} eliminado de Spotify`,'ok');
}

let _spEditIdx = null;
function editarSpotify(i) {
  const p = S.spotifyPersonas[i];
  if (!p) return;
  _spEditIdx = i;
  document.getElementById('sp_edit_n').value = p.nombre || '';
  // Cargar monto
  const mEl = document.getElementById('sp_edit_m');
  if (mEl) { mEl.value = fmtInput(p.monto || 0); mEl.dispatchEvent(new Event('input', {bubbles:true})); }
  document.getElementById('sp_edit_fecha_ingreso').value = p.fechaIngreso || '';
  openSheet('editar-spotify');
}
function guardarEditarSpotify() {
  if (_spEditIdx === null) return;
  const p = S.spotifyPersonas[_spEditIdx];
  if (!p) return;
  const n = document.getElementById('sp_edit_n').value.trim();
  if (!n) { toast('Ingresa el nombre', 'err'); return; }
  const m = parseMoney(document.getElementById('sp_edit_m').value) || 0;
  const fechaIngresoRaw = document.getElementById('sp_edit_fecha_ingreso').value;
  const fechaAnterior = p.fechaIngreso;
  p.nombre = n;
  p.monto = m;
  if (fechaIngresoRaw) {
    // Recalcular próximo pago SOLO si la fecha de ingreso realmente cambió — si no,
    // se pisaría el avance ya ganado por pagos adelantados o ciclos ya cobrados.
    if (fechaIngresoRaw !== fechaAnterior) {
      if (fechaAnterior && p.proximoPago) {
        // Es una corrección de una fecha de ingreso que ya se venía usando (no la primera
        // vez que se define): desplazar proximoPago por la misma cantidad de días que
        // cambió la fecha de ingreso, para no perder los períodos que ya se pagaron.
        const deltaDias = Math.round((new Date(fechaIngresoRaw + 'T00:00:00') - new Date(fechaAnterior + 'T00:00:00')) / 86400000);
        const dProx = new Date(p.proximoPago + 'T00:00:00');
        dProx.setDate(dProx.getDate() + deltaDias);
        p.proximoPago = dProx.toISOString().split('T')[0];
      } else {
        // No había fecha de ingreso previa: es la primera vez que se calcula, cálculo normal.
        const dIng = new Date(fechaIngresoRaw + 'T00:00:00');
        dIng.setDate(dIng.getDate() + 30);
        p.proximoPago = dIng.toISOString().split('T')[0];
      }
    }
    p.fechaIngreso = fechaIngresoRaw;
  }
  _spEditIdx = null;
  save(); refresh(); closeSheet('editar-spotify');
  toast(escHtml(n) + ' actualizado', 'ok');
}

/* ── Wiring de controles propios de la pantalla ──────────────────────────
   Movido desde _initEventListeners() (index.html) el 2026-07-26 — ver
   auditoria-tecnica.md, punto 3. No son onclick inline (no hay problema
   de CSP acá), es solo mover el addEventListener directo a su módulo
   dueño en vez de dejarlo mezclado con el de otros ~15 dominios en
   index.html. Todos estos ids ya existen en el DOM estático antes de
   este <script> (verificado contra index.html), así que no hace falta
   esperar a DOMContentLoaded. ── */
const _spBtnAdd = document.getElementById('btn-add-spotify-persona');
if (_spBtnAdd) _spBtnAdd.addEventListener('click', () => openSheet('spotify'));
const _spBtnPagar = document.getElementById('btn-pagar-spotify');
if (_spBtnPagar) _spBtnPagar.addEventListener('click', () => openSheet('pagar-spotify'));

const _spBtnSave = document.getElementById('btn-guardar-spotify');
// OJO: igual que con Gastos — index.html sobrescribe el global addSpotify
// más abajo (_injectErrorSpans(), le agrega validación inline) DESPUÉS de
// que este módulo se carga. Llamar addSpotify() dentro de una flecha
// resuelve la referencia en vivo al momento del click, no la capturada
// acá. Corregido 2026-07-26, ver auditoria-tecnica.md punto 3.
if (_spBtnSave) _spBtnSave.addEventListener('click', () => addSpotify());
const _spBtnDest = document.getElementById('btn-confirmar-sp-destino');
if (_spBtnDest) _spBtnDest.addEventListener('click', confirmarSpDestino);
const _spMesesSelect = document.getElementById('spMesesSelect');
if (_spMesesSelect) _spMesesSelect.addEventListener('change', selSpMeses);
const _spBtnPagarConf = document.getElementById('btn-confirmar-pagar-spotify');
if (_spBtnPagarConf) _spBtnPagarConf.addEventListener('click', confirmarPagarSpotify);

const _spPagarFuente = document.getElementById('spPagarFuente');
if (_spPagarFuente) _spPagarFuente.addEventListener('change', actualizarSpPagarPreview);
const _spPagarMonto = document.getElementById('spPagarMonto');
if (_spPagarMonto) _spPagarMonto.addEventListener('input', actualizarSpPagarPreview);

/* ═══════════════════════════════════════════════════════════════
   REGISTRO DE EVENTOS (funciones base — la integración con Personas
   registra las suyas en spotify-personas.js)
   ═══════════════════════════════════════════════════════════════ */

Events.registerAll('spotify', {
  marcarPago: marcarPagoSpotify,
  // OJO: NO pasar editarSpotify directo acá. spotify-personas.js lo
  // reemplaza (monkeypatch) para precargar la persona vinculada al abrir
  // el sheet — si acá se captura la referencia original, el botón queda
  // pegado a la versión sin esa parte. Con la flecha se resuelve el
  // nombre en cada click, igual que hacía el onclick="..." de antes.
  editar: (...args) => editarSpotify(...args),
  eliminar: deleteSpotify,
  eliminarHistorial: deleteSpHistorial,
});
Events.on('spotify:abrirSheetAgregar', () => openSheet('spotify'));
