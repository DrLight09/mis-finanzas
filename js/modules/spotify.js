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

   Pagar Spotify con una tarjeta de crédito (fuente 'tc:<id>') es un CARGO a la
   tarjeta, no un descuento de saldo — usa getTCById/tcCupoDisponible/tcRecalcular
   de js/modules/tarjetas_credito.js, igual que Encargos/Préstamos (S.tcMovimientos
   con tipo 'cargo_*'). FIX 2026-08-02: antes se asumía que tarjetas_credito.js ya
   estaba cargado porque cargaba eager — dejó de ser una asunción segura (ver
   auditoria-tecnica.md, acoplamiento spotify↔tarjetas_credito). Los 3 puntos que
   usan esas funciones ahora pasan primero por _spEnsureTC(), que llama a
   Loader.ensure('tarjetas') si hace falta — ver ese helper, arriba de
   openSheet_pagarSpotify(). Funciona igual si tarjetas_credito.js sigue cargando
   eager (no-op inmediato) que si se vuelve lazy.
   ═══════════════════════════════════════════════════════════════ */

/* ---- SPOTIFY ---- */
let spDestinoIdx=null;
let spDestinoPago=0;
let spDestinoNombre='';

/* ── Split de fuentes (motor genérico, ver js/core/split.js) ─────
   Dos instancias: 'spc' (cobro — plata que ENTRA, mismo patrón que
   Mesada) y 'spp' (pago a Spotify — plata que SALE, mismo patrón que
   "Ya la usé" en Encargos). Sin TC en ninguna de las dos: cobrar plata
   ajena a una tarjeta no aplica (mismo criterio que ya usaba el select
   simple de cobro, getFuentesSinTC), y el motor de split trata cada
   fila por igual (sumar/descontar saldo) — no distingue un cargo a TC
   de un movimiento de cuenta, así que combinarlas en un split no lo
   soporta el motor genérico. El modo simple de "Pagar Spotify" sigue
   permitiendo TC exactamente igual que antes. */
let spcSplitMode=false;
let sppSplitMode=false;

// Cuando un solo cobro dividido termina repartido en DOS registros de historial
// (parte cierra deuda de un ciclo viejo, el resto es del ciclo nuevo — ver
// confirmarSpDestino), cada registro necesita su propia porción del split para
// que borrar uno solo revierta solo esa porción de cada cuenta, no el total.
function _spProporcionarSplits(splits,montoParcial,montoTotal){
  if(!splits||!splits.length||montoTotal<=0||montoParcial<=0)return null;
  const factor=montoParcial/montoTotal;
  return splits.map(s=>({fuente:s.fuente,monto:Math.round(s.monto*factor)}));
}

function _spSplitFuentesOpts(selectedVal){
  const fuentes=getFuentesSinTC();
  return '<option value="" disabled'+(selectedVal?'':' selected')+'>Selecciona una cuenta...</option>'
    +fuentes.map(f=>`<option value="${f.val}"${f.val===selectedVal?' selected':''}>${f.label}</option>`).join('');
}

crearSplitWidget('spc', {
  simpleId:'spCobModoSimple', splitId:'spCobModoDividido', toggleId:'spCobSplitToggle', rowsId:'spCobSplitRows',
  getModo:()=>spcSplitMode, setModo:v=>{spcSplitMode=v;},
  getFuentesFn:_spSplitFuentesOpts,
  onPreview:actualizarSpDestinoPreview
});
function toggleSpCobSplit(){ splitToggle('spc'); }
function agregarSpCobSplitRow(){ splitAgregarRow('spc'); }
function getSpCobSplitData(){ return splitGetData('spc'); }

crearSplitWidget('spp', {
  simpleId:'spPagarModoSimple', splitId:'spPagarModoDividido', toggleId:'spPagarSplitToggle', rowsId:'spPagarSplitRows',
  getModo:()=>sppSplitMode, setModo:v=>{sppSplitMode=v;},
  getFuentesFn:_spSplitFuentesOpts,
  onPreview:actualizarSpPagarPreview
});
function toggleSpPagarSplit(){ splitToggle('spp'); }
function agregarSpPagarSplitRow(){ splitAgregarRow('spp'); }
function getSpPagarSplitData(){ return splitGetData('spp'); }

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
  // GUARD (bug real encontrado en prueba de navegador post-lazy, ver
  // auditoria-tecnica.md): calcC vive en cuentas.js. Se reusa el mismo
  // helper con fallback que ya usa core-state.js (_calcCSafe) en vez de
  // duplicar la lógica acá — si cuentas.js todavía no cargó, cae al mismo
  // saldo crudo que usa el resto de la app en ese caso.
  return c?_calcCSafe(c).val:0;
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
      const destinoBadge=x.ultimoDestinoSplit
        ?`<span class="badge bg-purple" style="font-size:8px;display:inline-flex;align-items:center;gap:3px;"><svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg> Dividido</span>`
        :(x.ultimoDestino?`<span class="badge ${fuenteBadgeClass(x.ultimoDestino)}" style="font-size:8px;display:inline-flex;align-items:center;gap:3px;"><svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg> ${escHtml(fuenteLabel(x.ultimoDestino))}</span>`:'');
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
  // Mapear con índice real, luego ordenar por fecha descendente. A igual fecha,
  // gana el orden de registro descendente (el más reciente en agregarse va primero) —
  // así un cobro atrasado con fecha vieja no se cuela por encima de uno más reciente.
  const hist=total.map((h,i)=>({...h,_realIdx:i}))
    .sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||'')||(b._realIdx-a._realIdx))
    .slice(0,12);
  if(!hist.length){el.innerHTML='<div style="font-size:12px;color:var(--text3);padding:4px 0;">Sin pagos registrados aún.</div>';return;}
  el.innerHTML=hist.map(h=>`
    <div class="card card-sm" style="margin-bottom:7px;">
      <div class="row" style="align-items:flex-start;gap:10px;">
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;font-weight:500;">${h.tipo==='pago'?'Pago a Spotify':'Cobro de '+escHtml(h.nombre)}</div>
          <div style="font-size:10px;color:var(--text2);margin-top:1px;">${h.fecha}${h.splits&&h.splits.length?' · '+h.splits.map(s=>fuenteLabel(s.fuente||'')).join(' + '):(h.fuente?' · '+fuenteLabel(h.fuente):'')}${h.nota?' · <span style="color:var(--blue);">'+escHtml(h.nota)+'</span>':''}</div>
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
  const h=S.spotifyHistorial[i];
  if(!h)return;

  // Protección por antigüedad — ver docs/proteccion-antiguedad-movimientos.md.
  // Aplica solo a 'pago' (el pago real a Spotify): un 'cobro' individual sigue
  // borrándose igual que siempre, su alcance ya es pequeño y contenido (solo
  // revierte el proximoPago de un integrante).
  if(h.tipo==='pago'){
    const opsPosteriores=S.spotifyHistorial.filter((h2,idx2)=>idx2>i&&h2.tipo==='pago').length;
    const nivel=nivelAntiguedadMovimiento(h.fecha,opsPosteriores,'spotify');
    if(nivel==='bloqueado'){
      await avisarMovimientoBloqueado();
      return;
    }
    if(nivel==='viejo'){
      const viaTC=!!h._tcMovId;
      const ok=await confirmarBorrarMovimientoViejo(fuenteLabel(h.fuente),h.monto||0,viaTC?'baja':'sube',viaTC?'deuda':'saldo');
      if(!ok)return;
      // Ya se confirmó con el aviso específico de arriba — no repetir con el genérico de abajo.
      return _borrarSpHistorial(i,h);
    }
  }

  const ok=await dialogo('Eliminar movimiento','¿Eliminar este registro del historial? Esta acción no se puede deshacer. Esto también revierte la plata movida por este registro.','Eliminar',true);
  if(!ok)return;
  return _borrarSpHistorial(i,h);
}

// Cuerpo real del borrado — separado de deleteSpHistorial() para que tanto el
// camino normal (confirmación genérica) como el de aviso por antigüedad
// (confirmación específica, ver arriba) terminen en el mismo lugar sin
// duplicar la reversión de saldos.
async function _borrarSpHistorial(i,h){

  if(h.tipo==='cobro'){
    // Revertir el movimiento secundario: la plata que entró a la(s) cuenta(s) destino al cobrar
    if(h.splits&&h.splits.length){
      h.splits.forEach(s=>{ if(s.fuente)descontarFuente(s.fuente,s.monto||0); });
    } else if(h.fuente){
      descontarFuente(h.fuente,h.monto||0);
    }
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
    // Revertir el movimiento secundario: la plata que salió de la cuenta al pagar Spotify,
    // o el cargo hecho a la tarjeta de crédito si se pagó con TC (ver confirmarPagarSpotify).
    if(h._tcMovId){
      const mov=(S.tcMovimientos||[]).find(m=>m.id===h._tcMovId&&!m.eliminado);
      if(mov){
        // mov.eliminado se marca siempre (es solo un dato) aunque la carga de
        // tarjetas_credito.js falle o tarde — así el estado no queda a medias.
        // Solo tcRecalcular() (una función real del módulo) espera la carga.
        mov.eliminado=true;
        if(await _spEnsureTC()){
          const tc=getTCById(mov.tcId);
          if(tc)tcRecalcular(tc);
        }
      }
    } else if(h.splits&&h.splits.length){
      h.splits.forEach(s=>{ if(s.fuente)sumarFuente(s.fuente,s.monto||0); });
    } else if(h.fuente){
      sumarFuente(h.fuente,h.monto||0);
    }
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
  // Resetear split (mismo patrón que abrirRegistrarMesada en mesada.js)
  spcSplitMode=false;
  document.getElementById('spCobModoSimple').style.display='';
  document.getElementById('spCobModoDividido').style.display='none';
  document.getElementById('spCobSplitRows').innerHTML='';
  const spCobToggleBtn=document.getElementById('spCobSplitToggle');
  if(spCobToggleBtn){
    spCobToggleBtn.textContent='Dividir ÷';
    spCobToggleBtn.style.background='rgba(200,240,96,.1)';
    spCobToggleBtn.style.borderColor='rgba(200,240,96,.3)';
    spCobToggleBtn.style.color='var(--accent)';
  }
  document.getElementById('spCobPreview').textContent='';
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
  actualizarSpDestinoPreview();
}

// Preview del split de cobro — mismo estilo que actualizarMpPreview() en
// mesada.js. En modo simple no hay nada que mostrar acá (spMesesTotal ya
// cubre el total); solo pinta cuando spcSplitMode está activo.
function actualizarSpDestinoPreview(){
  const prev=document.getElementById('spCobPreview');
  if(!prev)return;
  if(!spcSplitMode){prev.textContent='';return;}
  const n=parseInt(document.getElementById('spMesesSelect').value)||1;
  const monto=(S.spotifyPersonas[spDestinoIdx]?.monto||0)*n;
  const splits=getSpCobSplitData();
  const totalSplit=splits.reduce((a,s)=>a+s.monto,0);
  const restante=monto-totalSplit;
  if(splits.length===0){prev.textContent=fmt(monto)+' por distribuir';prev.style.color='var(--text2)';return;}
  const lines=splits.map(s=>fuenteLabel(s.fuente||'')+': +'+fmt(s.monto)).join(' · ');
  if(restante>0){prev.textContent=lines+' · Sin asignar: '+fmt(restante);prev.style.color='var(--amber)';}
  else if(restante<0){prev.textContent=lines+' · Excede por: '+fmt(-restante);prev.style.color='var(--red)';}
  else{prev.textContent=lines+' · Todo distribuido';prev.style.color='var(--accent)';}
}

function confirmarSpDestino(){
  if(spDestinoIdx===null)return;
  const p=S.spotifyPersonas[spDestinoIdx];
  const meses=parseInt(document.getElementById('spMesesSelect').value)||1;
  const montoTotal=(p.monto||0)*meses;

  // ── Modo dividido: validar y aplicar el split ANTES de tocar nada más ──
  let splits=null;
  let spDestinoSel='';
  if(spcSplitMode){
    splits=getSpCobSplitData();
    const totalSplit=splits.reduce((a,s)=>a+s.monto,0);
    if(splits.length===0||totalSplit<=0){
      document.getElementById('spCobPreview').textContent='Asigná el cobro a al menos una cuenta';
      document.getElementById('spCobPreview').style.color='var(--red)';
      return;
    }
    if(totalSplit>montoTotal+1){
      document.getElementById('spCobPreview').textContent='El total dividido supera lo cobrado';
      document.getElementById('spCobPreview').style.color='var(--red)';
      return;
    }
  } else {
    const destVal=document.getElementById('spDestinoSelect').value;
    if(!destVal){
      toast('Selecciona a dónde metiste la plata (o marca "Sin especificar")','err');
      return;
    }
    spDestinoSel=destVal==='__sin_especificar__'?'':destVal;
  }

  const fechaEl=document.getElementById('spFecha');
  const fechaCobro=(fechaEl&&fechaEl.value)?fechaEl.value:hoy();
  const nombreActual=spNombreDe(p);
  const proximoPagoAntes=p.proximoPago||'';
  p.pagado=true;
  p.mesesAdelantados=meses;
  p.ultimoDestino=spDestinoSel||'';
  p.ultimoDestinoSplit=!!splits;
  // Sumar dinero a la(s) fuente(s)
  if(splits){
    splits.forEach(s=>{ if(s.fuente)sumarFuente(s.fuente,s.monto); });
  } else if(spDestinoSel){
    sumarFuente(spDestinoSel,montoTotal);
  }
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
    S.spotifyHistorial.push({id:uid(),spId:p.id,tipo:'cobro',nombre:nombreActual,monto:cierreMonto,periodos:meses,fuente:spDestinoSel||'',splits:_spProporcionarSplits(splits,cierreMonto,montoTotal)||undefined,fecha:fechaCobro,nota:'Pago atrasado del ciclo anterior'+(notaBase?' · '+notaBase:''),proximoPagoAntes,_pagoIdCierre:lastPago.id,_secundario:true,_origenSeccion:'Spotify'});
    restante-=cierreMonto;
  }
  // Registrar en historial el resto (o el total, si no había deuda vieja) como UN solo
  // registro — aunque cubra varios períodos, es una sola plata que entró en un solo
  // movimiento a la cuenta. El detalle de cuántos períodos y a cómo cada uno queda en
  // la nota. Se guarda el nombre ACTUAL de la persona vinculada, no el crudo, para que
  // no quede fijado desactualizado.
  if(restante>0){
    S.spotifyHistorial.push({id:uid(),spId:p.id,tipo:'cobro',nombre:nombreActual,monto:restante,periodos:meses,fuente:spDestinoSel||'',splits:_spProporcionarSplits(splits,restante,montoTotal)||undefined,fecha:fechaCobro,nota:notaBase,proximoPagoAntes,_secundario:true,_origenSeccion:'Spotify'});
  }
  spDestinoIdx=null;
  spcSplitMode=false;
  save();refresh();closeSheet('sp-destino');
  toast(meses>1?`Cobrados ${meses} períodos adelantados a ${escHtml(nombreActual)} · ${fmt(montoTotal)}`:`Cobro registrado · ${escHtml(nombreActual)}`,'ok');
}

// FIX (auditoria-tecnica.md — acoplamiento spotify↔tarjetas_credito): las 3
// llamadas a getTCById/tcCupoDisponible/tcRecalcular de este archivo asumían
// que tarjetas_credito.js ya estaba cargado porque hasta ahora cargaba eager.
// Este helper asegura la carga bajo demanda con Loader.ensure('tarjetas')
// antes de usarlas — funciona igual si tarjetas_credito.js sigue cargando
// eager (typeof ya es 'function', Loader.ensure ni se llama) que si en el
// futuro se vuelve un grupo lazy real. Si la descarga falla (sin conexión),
// avisa con un toast en vez de dejar la acción muda.
async function _spEnsureTC(){
  if(typeof getTCById==='function') return true;
  try{
    await Loader.ensure('tarjetas');
    return true;
  }catch(err){
    toast('No se pudo cargar Tarjetas de Crédito. Revisa tu conexión e intenta de nuevo.','err',4000);
    return false;
  }
}

function openSheet_pagarSpotify(){
  const costo=S.spotifyCosto||0;
  const cajitaSaldo=getSpCajitaSaldo();
  // Resetear split (mismo patrón que abrirRegistrarMesada en mesada.js)
  sppSplitMode=false;
  document.getElementById('spPagarModoSimple').style.display='';
  document.getElementById('spPagarModoDividido').style.display='none';
  document.getElementById('spPagarSplitRows').innerHTML='';
  const sppToggleBtn=document.getElementById('spPagarSplitToggle');
  if(sppToggleBtn){
    sppToggleBtn.textContent='Dividir ÷';
    sppToggleBtn.style.background='rgba(200,240,96,.1)';
    sppToggleBtn.style.borderColor='rgba(200,240,96,.3)';
    sppToggleBtn.style.color='var(--accent)';
  }
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

async function actualizarSpPagarPreview(){
  const prev=document.getElementById('spPagarPreview');
  const fuenteInfo=document.getElementById('spPagarFuenteSaldo');
  // Modo dividido: el desglose de saldo por TC no aplica (no hay TC en split,
  // ver comentario junto a spcSplitMode/sppSplitMode más arriba).
  if(sppSplitMode){
    fuenteInfo.textContent='';
    const monto=parseMoney(document.getElementById('spPagarMonto').value)||0;
    const splits=getSpPagarSplitData();
    if(!monto){prev.textContent='';return;}
    const totalSplit=splits.reduce((a,s)=>a+s.monto,0);
    const restante=monto-totalSplit;
    if(splits.length===0){prev.textContent=fmt(monto)+' por repartir entre cuentas';prev.style.color='var(--text2)';return;}
    const lines=splits.map(s=>fuenteLabel(s.fuente||'')+': \u2212'+fmt(s.monto)).join(' · ');
    if(restante>0){prev.textContent=lines+' · Sin asignar: '+fmt(restante);prev.style.color='var(--amber)';}
    else if(restante<0){prev.textContent=lines+' · Excede por: '+fmt(-restante);prev.style.color='var(--red)';}
    else{prev.textContent=lines+' · Todo repartido';prev.style.color='var(--accent)';}
    return;
  }
  const monto=parseMoney(document.getElementById('spPagarMonto').value)||0;
  const fuente=document.getElementById('spPagarFuente').value;
  // Pagar con tarjeta de crédito es un CARGO (sube la deuda de la tarjeta), no un
  // retiro de saldo de una cuenta/cajita — por eso se muestra aparte, igual que en
  // ptcActualizarPreview() (tarjetas_credito.js) para el flujo inverso de "Pagar TC".
  if(fuente&&fuente.startsWith('tc:')){
    if(!(await _spEnsureTC())){ fuenteInfo.textContent=''; prev.textContent=''; return; }
    const tc=getTCById(fuente.slice(3));
    if(tc){
      const cupoDisp=tc.cupo?tcCupoDisponible(tc):null;
      fuenteInfo.textContent=cupoDisp!==null?'Cupo disponible: '+fmt(cupoDisp):'';
      if(monto>0){
        const nuevaDeuda=(tc.deuda||0)+monto;
        prev.innerHTML='Deuda: '+fmt(tc.deuda||0)+' <i class="fa-solid fa-arrow-right" style="margin:0 3px;font-size:10px;"></i> '+fmt(nuevaDeuda);
        prev.style.color=(cupoDisp!==null&&monto>cupoDisp)?'var(--red)':'var(--accent)';
      } else {
        prev.textContent='';
      }
    } else {
      fuenteInfo.textContent='';prev.textContent='';
    }
  } else if(fuente){
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

async function confirmarPagarSpotify(){
  const monto=parseMoney(document.getElementById('spPagarMonto').value)||0;
  const nota=document.getElementById('spPagarNota')?document.getElementById('spPagarNota').value.trim():'';
  if(!monto){toast('Ingresa el monto a pagar','err');return;}
  const fechaPagoEl0=document.getElementById('spPagarFecha');
  const fechaPago0=(fechaPagoEl0&&fechaPagoEl0.value)?fechaPagoEl0.value:hoy();
  let tcMovId=null;
  let fuente='';
  let splits=null;
  let notaGasto=nota||'Pago mensual Spotify';

  if(sppSplitMode){
    // Modo dividido: sin TC (ver comentario junto a spcSplitMode/sppSplitMode
    // más arriba) — todo o nada, valida saldo en CADA cuenta antes de
    // descontar de cualquiera, para no dejar el pago a medias si una falla.
    splits=getSpPagarSplitData();
    const totalSplit=splits.reduce((a,s)=>a+s.monto,0);
    if(splits.length===0||Math.abs(totalSplit-monto)>1){
      const prev=document.getElementById('spPagarPreview');
      prev.textContent=totalSplit<monto?'Falta asignar '+fmt(monto-totalSplit)+' a alguna cuenta':'El total dividido supera el monto a pagar';
      prev.style.color='var(--red)';
      return;
    }
    for(const s of splits){
      const saldoDisp=getSaldoActual(s.fuente);
      if(saldoDisp<s.monto){
        toast('Saldo insuficiente en '+fuenteLabel(s.fuente)+'. Disponible: '+fmt(saldoDisp),'err',3500);
        return;
      }
    }
    splits.forEach(s=>descontarFuente(s.fuente,s.monto));
    notaGasto+=' · dividido entre '+splits.map(s=>fuenteLabel(s.fuente)).join(', ');
  } else {
    fuente=document.getElementById('spPagarFuente').value;
    if(fuente&&fuente.startsWith('tc:')){
      if(!(await _spEnsureTC())) return;
      // Pagar con tarjeta de crédito es un CARGO: sube la deuda de la tarjeta, no
      // descuenta el saldo de una cuenta/cajita. Mismo patrón que Encargos/Préstamos
      // (ver tcRecalcular en tarjetas_credito.js, que suma S.tcMovimientos con
      // tipo 'cargo_*'), en vez de descontarFuente().
      const tc=getTCById(fuente.slice(3));
      if(!tc){toast('Tarjeta no encontrada','err');return;}
      if(tc.cupo&&tcCupoDisponible(tc)<monto){
        toast('Cupo insuficiente en '+fuenteLabel(fuente)+'. Disponible: '+fmt(tcCupoDisponible(tc)),'err',3500);
        return;
      }
      if(!S.tcMovimientos)S.tcMovimientos=[];
      tcMovId=uid();
      S.tcMovimientos.push({id:tcMovId,tcId:tc.id,tipo:'cargo_spotify',monto,fecha:fechaPago0,nota:nota||'Pago Spotify',eliminado:false});
      tcRecalcular(tc);
    } else if(fuente){
      const saldoDisp=getSaldoActual(fuente);
      if(saldoDisp<monto){
        toast('Saldo insuficiente en '+fuenteLabel(fuente)+'. Disponible: '+fmt(saldoDisp),'err',3500);
        return;
      }
      descontarFuente(fuente,monto);
    }
  }
  if(!S.spotifyHistorial)S.spotifyHistorial=[];
  // Registrar también como gasto variable para que aparezca en la sección Gastos
  if(!S.gastosVar)S.gastosVar=[];
  const gastoId=uid();
  S.gastosVar.push({id:gastoId,desc:'Spotify Premium',monto,fecha:hoy(),cat:'Suscripciones',fuente,nota:notaGasto,_secundario:true,_origenSeccion:'Spotify'});
  // Se guarda la cuota del administrador vigente EN ESTE MOMENTO (según cuántas personas
  // hay ahora), para que si la cantidad de integrantes cambia en el futuro, la ganancia
  // de este ciclo ya pagado no se recalcule con datos de otra época.
  const totalSlotsAhora=(S.spotifyPersonas||[]).length+1;
  const cuotaAdminAhora=S.spotifyCosto>0?Math.round(S.spotifyCosto/totalSlotsAhora):0;
  // Foto de quién estaba "Pagó" justo antes de resetear el ciclo: si más adelante se
  // elimina este pago del historial, hay que poder devolver a cada persona a como
  // estaba, no dejar a todos en "Pendiente" sin poder deshacerlo.
  const estadoAntesReset=(S.spotifyPersonas||[]).map(p=>({id:p.id,pagado:!!p.pagado}));

  const fechaPago=fechaPago0;

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

  const pagoObj={id:uid(),tipo:'pago',monto,fuente,splits:splits||undefined,fecha:fechaPago,nota,_gastoVarId:gastoId,_cuotaAdmin:cuotaAdminAhora,_estadoAntes:estadoAntesReset,_pendienteAlCerrar:pendienteAlCerrar,_tcMovId:tcMovId};
  S.spotifyHistorial=[...antesDelSegmento,...quedanCerrando,pagoObj,...pasanANuevo];
  // Reset pagados del ciclo — pero respeta a quienes ya prepagaron períodos futuros:
  // si su próxima fecha de cobro sigue en el futuro, su "Pagó" sigue vigente y no debe
  // volver a Pendiente solo porque yo ya le pagué a Spotify.
  (S.spotifyPersonas||[]).forEach(p=>{
    const hoy0=new Date();hoy0.setHours(0,0,0,0);
    const sigueVigente=p.proximoPago&&new Date(p.proximoPago+'T00:00:00')>hoy0;
    if(!sigueVigente)p.pagado=false;
  });
  sppSplitMode=false;
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
  S.spotifyPersonas.push({id:uid(),nombre:n,monto:m,pagado:false,proximoPago,fechaIngreso:fechaIngresoRaw,ultimoDestino:'',ultimoDestinoSplit:false,mesesAdelantados:1});
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

// ── Split de fuentes — cobro (spc) y pago (spp), ver crearSplitWidget arriba ──
const _spCobSplitToggle = document.getElementById('spCobSplitToggle');
if (_spCobSplitToggle) _spCobSplitToggle.addEventListener('click', toggleSpCobSplit);
const _spCobBtnAddRow = document.getElementById('btn-add-spcob-split-row');
if (_spCobBtnAddRow) _spCobBtnAddRow.addEventListener('click', agregarSpCobSplitRow);

const _spPagarSplitToggle = document.getElementById('spPagarSplitToggle');
if (_spPagarSplitToggle) _spPagarSplitToggle.addEventListener('click', toggleSpPagarSplit);
const _spPagarBtnAddRow = document.getElementById('btn-add-spp-split-row');
if (_spPagarBtnAddRow) _spPagarBtnAddRow.addEventListener('click', agregarSpPagarSplitRow);

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

/* ═══════════════════════════════════════════════════════════════
   INTEGRACIÓN CON EL SISTEMA DE PERSONAS
   (antes js/modules/spotify-personas.js — fusionado acá el 2026-08-03)

   Selector de persona al agregar/editar un integrante, para que sean
   personas reales de S.personas en vez de nombres sueltos. Ver
   docs/spotify.md.

   Antes vivía en un archivo aparte, cargado más abajo en index.html,
   por la premisa de que dependía de getPersona()/abrirSelPersona()/
   _inyectarPersonaSheets() (definidos en personas.js, que cargaba
   después). Esa premisa no se sostenía contra el código real: todas
   esas llamadas viven DENTRO de funciones (nunca a nivel superior del
   archivo), así que solo se ejecutan en el click — mucho después de
   que personas.js ya terminó de cargar, sin importar el orden entre
   <script defer>. Lo único que este bloque necesita a nivel superior
   (openSheet, addSpotify, editarSpotify, guardarEditarSpotify,
   renderSpotify) ya está definido arriba, en este mismo archivo.
   Fusión verificada con node --check; ver CHANGELOG.md#spotify.
   ═══════════════════════════════════════════════════════════════ */


/* ═══════════════════════════════════════════════════════════════
   INTEGRACIÓN SPOTIFY ↔ PERSONAS
   Conecta el módulo Spotify con el sistema de personas para que
   los miembros del plan sean personas reales de S.personas.
   ═══════════════════════════════════════════════════════════════ */

let _spPersonaId = null;       // personaId seleccionado en "Agregar"
let _spEditPersonaId = null;   // personaId en "Editar"

/* ── Reemplazar campo de texto en sheet-spotify con selector de persona ── */
function _initSpotifyPersonaSelector() {
  const sheet = document.getElementById('sheet-spotify');
  if (!sheet || sheet._personaHook) return;
  sheet._personaHook = true;

  const spNEl = document.getElementById('sp_n');
  if (!spNEl) return;
  const ig = spNEl.closest('.ig');
  if (!ig) return;

  ig.innerHTML = `
    <label class="il">¿Quién es?</label>
    <div id="sp-persona-btn" ${Events.attr('spotify:abrirSelectorPersona')}
      style="width:100%;padding:12px 14px;background:var(--bg3);border:1.5px solid var(--border2);
      border-radius:var(--radius-sm);color:var(--text2);font-size:15px;font-family:'DM Sans',sans-serif;
      cursor:pointer;display:flex;align-items:center;gap:10px;min-height:48px;transition:border-color .2s;">
      <div id="sp-persona-avatar" class="avatar" style="width:28px;height:28px;font-size:10px;margin:0;display:none;flex-shrink:0;"></div>
      <span id="sp-persona-label">Seleccionar persona...</span>
      <svg style="margin-left:auto;flex-shrink:0;" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
    </div>
    <input type="hidden" id="sp_n" value="">`;
}

function _onSelPersonaSpotify(personaId) {
  const p = getPersona(personaId);
  if (!p) return;
  _spPersonaId = personaId;
  document.getElementById('sp_n').value = p.nombre;

  const btn = document.getElementById('sp-persona-btn');
  const lbl = document.getElementById('sp-persona-label');
  const av  = document.getElementById('sp-persona-avatar');
  if (btn) btn.style.borderColor = 'var(--accent)';
  if (lbl) { lbl.textContent = p.nombre; lbl.style.color = 'var(--text)'; }
  if (av) pintarAvatarPersona(av, p, { mostrar: true });
}

/* ── Reemplazar campo de texto en sheet-editar-spotify con selector ── */
function _initSpotifyEditPersonaSelector() {
  const sheet = document.getElementById('sheet-editar-spotify');
  if (!sheet || sheet._personaEditHook) return;
  sheet._personaEditHook = true;

  const spEditNEl = document.getElementById('sp_edit_n');
  if (!spEditNEl) return;
  const ig = spEditNEl.closest('.ig');
  if (!ig) return;

  ig.innerHTML = `
    <label class="il">¿Quién es?</label>
    <div id="sp-edit-persona-btn" ${Events.attr('spotify:onClickEditPersonaBtn')}
      style="width:100%;padding:12px 14px;background:var(--bg3);border:1.5px solid var(--border2);
      border-radius:var(--radius-sm);color:var(--text2);font-size:15px;font-family:'DM Sans',sans-serif;
      cursor:pointer;display:flex;align-items:center;gap:10px;min-height:48px;transition:border-color .2s;">
      <div id="sp-edit-persona-avatar" class="avatar" style="width:28px;height:28px;font-size:10px;margin:0;display:none;flex-shrink:0;"></div>
      <span id="sp-edit-persona-label">Seleccionar persona...</span>
      <svg id="sp-edit-persona-chevron" style="margin-left:auto;flex-shrink:0;" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
    </div>
    <div id="sp-edit-persona-hint" style="font-size:11px;color:var(--text3);margin-top:5px;display:none;">Para asignarle este cobro a otra persona, eliminá este integrante y agregá uno nuevo — así el historial no se mezcla entre los dos.</div>
    <input type="hidden" id="sp_edit_n" value="">`;
}

// Si la persona editada ya está vinculada a alguien (personaId), el botón queda
// bloqueado: cambiar de persona a mitad de camino es justo lo que causaba
// desincronizaciones. Para eso ya existe un camino simple y confiable: eliminar
// este integrante y agregar uno nuevo (ver hint debajo del botón).
let _spEditPersonaLocked = false;
function _onClickSpEditPersonaBtn() {
  if (_spEditPersonaLocked) return;
  _abrirSelPersonaSpotifyEdit();
}

let _spEditPersonaPickerAbierto = false;    // se puso true al abrir el buscador en "Editar"
let _spEditPersonaPickerConfirmado = false; // se puso true solo si de verdad se eligió/creó alguien

// Wrapper del botón "¿Quién es?" en Editar: además de abrir el buscador, marca que
// se abrió, para poder detectar si se cierra sin confirmar ninguna selección nueva.
function _abrirSelPersonaSpotifyEdit() {
  _spEditPersonaPickerAbierto = true;
  abrirSelPersona(_onSelPersonaSpotifyEdit, '¿Quién es?');
}

function _onSelPersonaSpotifyEdit(personaId) {
  const p = getPersona(personaId);
  if (!p) return;
  _spEditPersonaId = personaId;
  _spEditPersonaPickerConfirmado = true;
  document.getElementById('sp_edit_n').value = p.nombre;

  const btn = document.getElementById('sp-edit-persona-btn');
  const lbl = document.getElementById('sp-edit-persona-label');
  const av  = document.getElementById('sp-edit-persona-avatar');
  if (btn) btn.style.borderColor = 'var(--accent)';
  if (lbl) { lbl.textContent = p.nombre; lbl.style.color = 'var(--text)'; }
  if (av) pintarAvatarPersona(av, p, { mostrar: true });
}

/* ── Hook en openSheet para inicializar los selectores ─────────── */
// OJO: a diferencia de addSpotify (definido arriba en este mismo archivo y
// por eso ya hoisted al parsear), openSheet vive en js/core/sheet-stack.js,
// que carga DESPUÉS de este módulo (ver comentario de orden de carga en
// sheet-stack.js). Capturar `openSheet` acá arriba, a nivel superior,
// lanzaba "openSheet is not defined" porque el global todavía no existía
// al parsear spotify.js. Antes se envolvía en DOMContentLoaded (los scripts
// con defer, incluido sheet-stack.js, ya habían terminado de ejecutarse
// para cuando ese evento disparaba). CORREGIDO (ronda de lazy-loading de
// spotify/prestado/cuentas/analisis/encargos, ver auditoria-tecnica.md):
// con spotify.js como grupo lazy, este archivo puede cargar mucho DESPUÉS
// de que DOMContentLoaded ya disparó — ese listener nunca se habría
// ejecutado, y openSheet('spotify') jamás habría inyectado los sheets de
// Personas. openSheet sigue siendo seguro de capturar acá arriba sin
// esperar ningún evento: vive en js/core/sheet-stack.js, que es núcleo y
// siempre carga eager mucho antes de que cualquier módulo lazy (spotify
// incluido) pueda siquiera empezar a descargarse.
const _origOpenSheetSpotifyPersonas = openSheet;
openSheet = function(id) {
  if (id === 'spotify') {
    _inyectarPersonaSheets();
    _spPersonaId = null;
    _initSpotifyPersonaSelector();
    // Resetear UI del selector
    const lbl = document.getElementById('sp-persona-label');
    const av  = document.getElementById('sp-persona-avatar');
    const btn = document.getElementById('sp-persona-btn');
    if (lbl) { lbl.textContent = 'Seleccionar persona...'; lbl.style.color = 'var(--text2)'; }
    if (av)  av.style.display = 'none';
    if (btn) btn.style.borderColor = 'var(--border2)';
    const spN = document.getElementById('sp_n');
    if (spN) spN.value = '';
  }
  if (id === 'editar-spotify') {
    _inyectarPersonaSheets();
    _initSpotifyEditPersonaSelector();
  }
  _origOpenSheetSpotifyPersonas.apply(this, arguments);
};

/* ── Hook en addSpotify para guardar personaId ──────────────────── */
const _origAddSpotifyPersonas = addSpotify;
addSpotify = function() {
  // Validar que se seleccionó una persona (ya que sp_n es ahora input oculto)
  const spN = document.getElementById('sp_n');
  if (spN && !spN.value.trim()) {
    const btn = document.getElementById('sp-persona-btn');
    if (btn) {
      btn.style.borderColor = 'var(--red)';
      setTimeout(() => { if (btn) btn.style.borderColor = 'var(--border2)'; }, 2000);
    }
    toast('Seleccioná una persona', 'err');
    return;
  }
  const pId = _spPersonaId;
  if (pId && (S.spotifyPersonas||[]).some(x=>x.personaId===pId)) {
    toast('Esta persona ya está agregada en Spotify','err');
    return;
  }
  _origAddSpotifyPersonas.apply(this, arguments);
  // Asignar personaId al último spotifyPersona creado
  if (pId && S.spotifyPersonas && S.spotifyPersonas.length) {
    const last = S.spotifyPersonas[S.spotifyPersonas.length - 1];
    if (last && !last.personaId) {
      last.personaId = pId;
      // Sincronizar nombre con la persona
      const p = getPersona(pId);
      if (p) last.nombre = p.nombre;
      save();
      // FIX: faltaba esto. _origAddSpotifyPersonas() (arriba) ya renderizó
      // la fila ANTES de que este hook asignara personaId — sin este
      // segundo render, la fila se quedaba con el estado de "sin persona"
      // (avatar sin color, iniciales crudas de 2 letras) hasta que alguna
      // otra acción disparara un refresh() en cualquier parte de la app.
      // El dato en S siempre quedó bien guardado — era solo la pantalla.
      renderSpotify();
    }
  }
  _spPersonaId = null;
};

/* ── Hook en editarSpotify para pre-cargar la persona vinculada ─── */
const _origEditarSpotifyPersonas = editarSpotify;
editarSpotify = function(i) {
  _origEditarSpotifyPersonas.apply(this, arguments);
  const sp = (S.spotifyPersonas || [])[i];
  if (!sp) return;
  _spEditPersonaId = sp.personaId || null;
  _spEditPersonaLocked = !!sp.personaId;
  // Pre-cargar UI del selector tras abrir el sheet
  setTimeout(() => {
    _initSpotifyEditPersonaSelector();
    const btn = document.getElementById('sp-edit-persona-btn');
    const chevron = document.getElementById('sp-edit-persona-chevron');
    const hint = document.getElementById('sp-edit-persona-hint');
    if (sp.personaId) {
      const p = getPersona(sp.personaId);
      if (p) _onSelPersonaSpotifyEdit(sp.personaId);
      // Bloqueado: ya hay una persona vinculada — se ve como texto, no como control
      if (btn) { btn.style.cursor = 'default'; btn.style.background = 'var(--bg2)'; }
      if (chevron) chevron.style.display = 'none';
      if (hint) hint.style.display = 'block';
    } else {
      // Rellenar con el nombre directo si no tiene personaId
      const lbl = document.getElementById('sp-edit-persona-label');
      const spEditN = document.getElementById('sp_edit_n');
      if (lbl && sp.nombre) { lbl.textContent = sp.nombre; lbl.style.color = 'var(--text)'; }
      if (btn && sp.nombre) btn.style.borderColor = 'var(--accent)';
      if (spEditN) spEditN.value = sp.nombre || '';
      // Sin vínculo todavía: queda disponible para elegir/crear la persona una vez
      if (btn) { btn.style.cursor = 'pointer'; btn.style.background = 'var(--bg3)'; }
      if (chevron) chevron.style.display = '';
      if (hint) hint.style.display = 'none';
    }
    // Resetear banderas DESPUÉS de precargar: mostrar el estado actual no cuenta
    // como una selección nueva confirmada por el usuario.
    _spEditPersonaPickerAbierto = false;
    _spEditPersonaPickerConfirmado = false;
  }, 80);
};

/* ── Hook en guardarEditarSpotify para guardar personaId ────────── */
const _origGuardarEditarSpotifyPersonas = guardarEditarSpotify;
guardarEditarSpotify = function() {
  // Si se abrió el buscador de "¿Quién es?" pero se cerró sin confirmar ninguna
  // selección (ni elegir a alguien de la lista, ni crear una persona nueva), el
  // input oculto sigue con el nombre anterior — avisar en vez de guardarlo en silencio.
  if (_spEditPersonaPickerAbierto && !_spEditPersonaPickerConfirmado) {
    const spActual = (S.spotifyPersonas || [])[_spEditIdx];
    toast(`No se seleccionó una persona nueva — se mantuvo a "${spActual ? escHtml(spActual.nombre) : 'la persona anterior'}"`, 'err', 4000);
  }
  // Capturar idx ANTES de llamar al original (que lo pone a null)
  const idxAntes = _spEditIdx;
  // Si se vinculó (por primera vez) a una persona que ya está usada por OTRO integrante
  // de Spotify, bloquear — mismo criterio que ya aplica en addSpotify.
  if (_spEditPersonaId) {
    const yaUsadaPorOtro = (S.spotifyPersonas || []).some((x, idx) => idx !== idxAntes && x.personaId === _spEditPersonaId);
    if (yaUsadaPorOtro) {
      toast('Esta persona ya está agregada en Spotify', 'err');
      return;
    }
  }
  _origGuardarEditarSpotifyPersonas.apply(this, arguments);
  // Asignar personaId al spotifyPersona editado (si se confirmó una selección nueva)
  if (idxAntes !== null && S.spotifyPersonas && S.spotifyPersonas[idxAntes]) {
    const sp = S.spotifyPersonas[idxAntes];
    if (_spEditPersonaId) {
      sp.personaId = _spEditPersonaId;
    }
    // Sincronización final: si el registro sigue vinculado a una persona (personaId,
    // ya sea la que había antes o la recién elegida), el nombre SIEMPRE se resuelve
    // desde ese vínculo — nunca se deja el texto crudo que haya quedado en el campo
    // oculto. Así nombre y personaId no pueden quedar desincronizados, así falle
    // silenciosamente la confirmación del buscador de personas.
    if (sp.personaId) {
      sp.nombre = spNombreDe(sp);
    }
    save();
    refresh();
  }
  _spEditPersonaId = null;
  _spEditPersonaPickerAbierto = false;
  _spEditPersonaPickerConfirmado = false;
};

/* ── Hook en renderSpotify para aplicar color de persona ─────────── */
const _origRenderSpotifyPersonas = renderSpotify;
renderSpotify = function() {
  _origRenderSpotifyPersonas.apply(this, arguments);
  // Aplicar color y nombre correcto a cada avatar del listado Spotify
  const lista = document.getElementById('spotifyList');
  if (!lista) return;
  const p = S.spotifyPersonas || [];
  // Ordenar igual que en renderSpotify
  const pOrdenado = [...p].map((x, i) => ({ ...x, _origIdx: i })).sort((a, b) => {
    const far = 99999;
    const dA = a.proximoPago ? Math.ceil((new Date(a.proximoPago + 'T00:00:00') - new Date()) / 86400000) : far;
    const dB = b.proximoPago ? Math.ceil((new Date(b.proximoPago + 'T00:00:00') - new Date()) / 86400000) : far;
    return dA - dB;
  });
  const rows = lista.querySelectorAll('.sp-row');
  rows.forEach((row, idx) => {
    const sp = pOrdenado[idx];
    if (!sp || !sp.personaId) return;
    const persona = getPersona(sp.personaId);
    if (!persona) return;
    const av = row.querySelector('.avatar');
    if (av) pintarAvatarPersona(av, persona);
    // Actualizar nombre si cambió
    const nameEl = row.querySelector('.row-name');
    if (nameEl) nameEl.textContent = persona.nombre;
  });
};

/* ═══════════════════════════════════════════════════════════════
   REGISTRO DE EVENTOS (acciones propias de la integración con
   Personas — el resto vive en spotify.js)
   ═══════════════════════════════════════════════════════════════ */

Events.registerAll('spotify', {
  abrirSelectorPersona: () => abrirSelPersona(_onSelPersonaSpotify, '¿Quién es?'),
  onClickEditPersonaBtn: _onClickSpEditPersonaBtn,
});
