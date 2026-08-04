/* ═══════════════════════════════════════════════════════════════
   js/modules/mesada.js

   Módulo Mesada — extraído de index.html. Ver docs/mesada.md para
   el diseño completo (modelo de datos, reglas, flujos) y
   docs/CHANGELOG.md#mesada para el historial de bugs corregidos.

   ── Dependencias y orden de carga ─────────────────────────────
   Este archivo asume que ya existen en `window`, definidos ANTES
   de que se cargue este <script>:
     - El núcleo compartido de index.html: S, save, refresh, escHtml,
       fmt, fmtInput, parseMoney, hoy, uid, toast, openSheet,
       closeSheet, dialogo, sumarFuente, descontarFuente,
       poblarFuente, buildFuentesOptsHtml, fuenteLabel,
       fuenteBadgeClass, getSaldoActual, MC (nombres de mes).
     - js/core/events.js (Events.on/attr/registerAll) — cargado una
       sola vez, bien al principio de index.html, antes que
       cualquier módulo (ver nota en auditoria-tecnica.md, punto 1).
     - El motor genérico de "split de fuentes" (crearSplitWidget,
       splitToggle, splitAgregarRow, splitGetData, splitPreview),
       que sigue viviendo en index.html porque también lo usan
       Encargos y "Yo debo" — NO se movió acá para no romper esos
       dos módulos. Por esto, este <script src="js/modules/mesada.js">
       tiene que ir DESPUÉS de que ese motor esté definido en
       index.html (mismo criterio que ya se usó al cargar
       js/modules/spotify.js: cargar donde la dependencia más
       exigente ya esté satisfecha).

   ── Eventos (CSP) ──────────────────────────────────────────────
   Los onclick inline que armaba este módulo en sus template strings
   ahora se registran acá mismo con Events.registerAll('mesada', {...})
   y se emiten en el HTML con Events.attr('mesada:accion', ...args)
   en vez de onclick="funcion(...)". Ver js/core/events.js para el
   detalle del mecanismo.
   ═══════════════════════════════════════════════════════════════ */

/* ---- MESADA ---- */
// S.mesadas = {
//   papa: { cuotas: { "2025": 90000 }, pagos: { "2025-3": {
//     monto,fecha,destino,nota,splits,
//     // Campos opcionales de "pago parcial con deuda pendiente" (ej. te dieron
//     // 60k de una cuota de 80k y te quedaron debiendo los 20k restantes):
//     cuotaEsperada,       // snapshot de la cuota del año cuando se marcó como pendiente
//     pendiente,           // cuánto falta por recibir de esa mensualidad (0/ausente = saldado)
//     pendienteHistorial,  // [{monto,fecha,destino,nota}] abonos posteriores que fueron cerrando `pendiente`
//   } } },
//   mama: { cuotas: { "2025": 80000 }, pagos: { "2025-3": {...} } }
// }

let mpParent=''; // 'papa' | 'mama'
let mpMesKey=''; // '2025-3'
let mpMesNombre=''; // 'Abril 2025'
let mppParent=''; // 'papa' | 'mama' — para el sheet de pago de lo pendiente
let mppMesKey=''; // '2025-3'

// ── "Me pagó con plata de un encargo" ──────────────────────────────────
// Si ya le tenías guardada plata a papá/mamá en un encargo (módulo
// Encargos), al registrar el pago de mesada podés usar esa plata en vez de
// que entre plata nueva: se descuenta del encargo y se cuenta como pago
// recibido. Ver confirmarMesadaPago() y _borrarMesadaPago() para el
// registro y la reversión.
let mpUsarEncargoActivo=false;
let mpEncargoActualId='';

function _normTxt(s){
  return (s||'').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
}

function _mesadaClavesParent(parent){
  return parent==='papa' ? ['papa','padre','papi'] : ['mama','madre','mami'];
}

// Encargos con saldo disponible cuyo nombre coincide con "papá"/"mamá" (o
// variantes) — candidatos a que la mesada de ese mes se haya pagado con
// plata que ya les tenías guardada. Requiere que encargos.js ya esté
// cargado (getEncargo/encargoSaldo son globales de ese módulo).
function _mesadaEncargosDelParent(parent){
  if(typeof encargoSaldo!=='function'||!S.encargos||!S.encargos.length)return [];
  const claves=_mesadaClavesParent(parent);
  return S.encargos
    .filter(e=>claves.some(c=>_normTxt(e.nombre).includes(c)))
    .map(e=>({enc:e,saldo:encargoSaldo(e)}))
    .filter(x=>x.saldo>0.5)
    .sort((a,b)=>b.saldo-a.saldo);
}

// Puebla el selector de cuentas del encargo elegido (dónde físicamente
// está guardada esa plata) — reutiliza los helpers de encargos.js.
function _poblarMpEncargoCuentas(){
  const sel=document.getElementById('mpEncargoCuentaSel');
  if(!sel)return;
  const enc=typeof getEncargo==='function'?getEncargo(mpEncargoActualId):null;
  if(!enc){sel.innerHTML='';return;}
  const cuentas=typeof _getEncargoSaldoPorCuenta==='function'?_getEncargoSaldoPorCuenta(enc):[];
  const sinCuenta=typeof _getEncargoSaldoSinCuenta==='function'?_getEncargoSaldoSinCuenta(enc):0;
  let opts=cuentas.map(c=>`<option value="${c.cuenta}">${escHtml(c.label)} (${fmt(c.saldo)})</option>`).join('');
  if(sinCuenta>0.5)opts+=`<option value="">Sin especificar (${fmt(sinCuenta)})</option>`;
  sel.innerHTML=opts||'<option value="">Sin especificar</option>';
  actualizarMpPreview();
}

// Muestra u oculta la sección normal "¿Qué hiciste con esa plata?"
// (destino simple/dividido). Se oculta cuando el pago se cubre con plata
// de un encargo ya guardada en una cuenta conocida (no hace falta volver
// a elegir destino porque la plata ya está ahí); se muestra si hace falta
// elegir dónde cae la plata (pago normal, o encargo "sin especificar").
function _mostrarSeccionDestinoNormal(mostrar){
  const header=document.querySelector('#sheet-mesada-pago .field-header');
  if(header)header.style.display=mostrar?'':'none';
  const simple=document.getElementById('mpModoSimple');
  const split=document.getElementById('mpModoDividido');
  if(!mostrar){
    if(simple)simple.style.display='none';
    if(split)split.style.display='none';
  } else {
    if(simple)simple.style.display=mpSplitMode?'none':'';
    if(split)split.style.display=mpSplitMode?'':'none';
  }
}

function _ensureMesadas(){
  if(!S.mesadas)S.mesadas={papa:{cuotas:{},pagos:{}},mama:{cuotas:{},pagos:{}}};
  ['papa','mama'].forEach(p=>{
    if(!S.mesadas[p])S.mesadas[p]={cuotas:{},pagos:{}};
    if(!S.mesadas[p].cuotas)S.mesadas[p].cuotas={};
    if(!S.mesadas[p].pagos)S.mesadas[p].pagos={};
  });
}

function getMesadaData(parent){
  _ensureMesadas();
  return S.mesadas[parent].pagos;
}

// Cuentas realmente afectadas por un pago de mesada — el destino simple, o
// cada fuente del split si se repartió entre varias cuentas.
function _mesadaFuentesDe(info){
  if(info.splits&&info.splits.length)return info.splits.map(s=>s.fuente).filter(Boolean);
  return info.destino?[info.destino]:[];
}

// Cantidad de pagos de mesada (papa + mama) posteriores a este, que tocaron
// alguna de las mismas cuentas — criterio de "operaciones posteriores" de la
// protección por antigüedad (ver core-state.js#nivelAntiguedadMovimiento y
// docs/proteccion-antiguedad-movimientos.md §4: sin ciclo natural como
// Spotify, se cuenta contra la cuenta destino en su lugar).
function _mesadaOpsPosteriores(parentActual,keyActual,info){
  const fuentes=_mesadaFuentesDe(info);
  if(!fuentes.length||!info.fecha)return 0;
  let count=0;
  ['papa','mama'].forEach(p=>{
    const data=getMesadaData(p);
    Object.keys(data).forEach(k=>{
      if(p===parentActual&&k===keyActual)return;
      const otro=data[k];
      if(!otro||!otro.fecha||otro.fecha<=info.fecha)return;
      if(_mesadaFuentesDe(otro).some(f=>fuentes.includes(f)))count++;
    });
  });
  return count;
}

function _getCuotaAnio(parent,anio){
  _ensureMesadas();
  const cuotas=S.mesadas[parent].cuotas;
  const key=String(anio);
  if(cuotas[key])return cuotas[key];
  // Buscar el año más cercano hacia atrás
  const anios=Object.keys(cuotas).map(Number).sort((a,b)=>b-a);
  for(const a of anios){ if(a<=anio)return cuotas[String(a)]; }
  // Fallback al más antiguo disponible
  if(anios.length)return cuotas[String(anios[anios.length-1])];
  return 80000;
}

function getMontoPadre(parent){
  return _getCuotaAnio(parent,S.mesadaAnio||new Date().getFullYear());
}

function renderMesada(){
  _ensureMesadas();
  const a=S.mesadaAnio||new Date().getFullYear();
  const hoy=new Date().getFullYear();
  document.getElementById('anioLabel').textContent=a;

  // Deshabilitar botones en los límites ±2
  const btnP=document.getElementById('btn-anio-prev');
  const btnN=document.getElementById('btn-anio-next');
  if(btnP)btnP.disabled=(a<=hoy-2);
  if(btnN)btnN.disabled=(a>=hoy+2);

  // Poner el año en los labels de cuota
  const lblP=document.getElementById('ms-papa-anio-label');
  const lblM=document.getElementById('ms-mama-anio-label');
  if(lblP)lblP.textContent=a;
  if(lblM)lblM.textContent=a;

  // Sync inputs de cuota para el año visible
  const cuotaPapa=_getCuotaAnio('papa',a);
  const cuotaMama=_getCuotaAnio('mama',a);
  const elPapa=document.getElementById('mesadaMontoPapa');
  const elMama=document.getElementById('mesadaMonteMama');
  if(elPapa&&document.activeElement!==elPapa)elPapa.value=fmtInput(cuotaPapa);
  if(elMama&&document.activeElement!==elMama)elMama.value=fmtInput(cuotaMama);

  const hoyD=new Date();
  const anioActual=hoyD.getFullYear();
  const mesActualNum=hoyD.getMonth(); // 0-based
  const diaActual=hoyD.getDate();

  const pendientesResumen={papa:0,mama:0}; // totales de deuda pendiente, para el banner
  ['papa','mama'].forEach(parent=>{
    const data=getMesadaData(parent);
    const gridId=parent==='papa'?'mesadaGridPapa':'mesadaGridMama';
    const subId=parent==='papa'?'ms-papa-sub':'ms-mama-sub';
    const cuota=_getCuotaAnio(parent,a);
    let totalRecibido=0;
    let mesesPagados=0;
    let mesesPerdidos=0;
    let totalPendienteParent=0;
    let mesesPendientes=0;

    document.getElementById(gridId).innerHTML=MC.map((m,i)=>{
      const k=a+'-'+i;
      const info=data[k];
      const pagado=!!info;
      const tienePendiente=pagado&&(info.pendiente||0)>0;

      if(pagado){totalRecibido+=(info.monto||cuota);mesesPagados++;}
      if(tienePendiente){totalPendienteParent+=info.pendiente;mesesPendientes++;}

      // Determinar si el mes ya pasó sin pago (puede marcarse rojo)
      // Un mes "pasado" es cualquier mes cuya fecha esperada ya venció:
      // - Para papá: día 30 del mes i del año a
      // - Para mamá: día 1 del mes i+1 del año a (o sea el 1 del mes siguiente,
      //   así que dentro del propio mes i mamá nunca está vencida)
      // El mes ya es pasado si (a < anioActual) o (a === anioActual && i < mesActualNum),
      // más el caso especial de papá dentro del mes en curso (diaActual > 30).
      let esPasado=false;
      if(a<anioActual){
        esPasado=true;
      } else if(a===anioActual){
        if(i<mesActualNum) esPasado=true;
        else if(i===mesActualNum){
          // Papá: vence el 30 del mismo mes, así que dentro del mes puede
          // marcarse vencido. Mamá: vence el 1 del mes SIGUIENTE (i+1), o sea
          // que dentro del mes i todavía está en plazo — su vencimiento real
          // ya está cubierto por la rama i<mesActualNum de arriba (que se activa
          // apenas entramos al mes siguiente), así que aquí nunca es "pasado".
          esPasado=(parent==='papa'&&diaActual>30);
        }
      }
      const esPerdido=esPasado&&!pagado;
      if(esPerdido)mesesPerdidos++;

      const tooltip=tienePendiente?fmt(info.monto)+' recibidos · debe '+fmt(info.pendiente)
        :pagado?(info.fecha||'pagado')
        :esPerdido?'Sin pagar'
        :'';
      const dotClass=tienePendiente?'mes-dot on mes-dot-pend'
        :pagado?'mes-dot on'
        :esPerdido?'mes-dot perdido'
        :'mes-dot';
      return`<div class="${dotClass}" title="${tooltip}"
        ${Events.attr('mesada:clickMesDot', parent, k, m+' '+a)}>${m}</div>`;
    }).join('');

    let subTxt=fmt(totalRecibido)+' recibidos ('+mesesPagados+'/12)';
    if(mesesPerdidos>0) subTxt+=' · '+mesesPerdidos+' sin pagar';
    if(mesesPendientes>0) subTxt+=' · '+fmt(totalPendienteParent)+' pendiente';
    document.getElementById(subId).textContent=subTxt;
    pendientesResumen[parent]=totalPendienteParent;
  });

  // Banner combinado (papá + mamá) — visibilidad clara de deuda pendiente
  const bannerPend=document.getElementById('ms-pendiente-banner');
  if(bannerPend){
    const partesPend=[];
    if(pendientesResumen.papa>0)partesPend.push('Papá te debe '+fmt(pendientesResumen.papa));
    if(pendientesResumen.mama>0)partesPend.push('Mamá te debe '+fmt(pendientesResumen.mama));
    if(partesPend.length){
      bannerPend.style.display='';
      bannerPend.textContent=partesPend.join(' · ');
    } else {
      bannerPend.style.display='none';
    }
  }

  // Resumen global año
  let totalAnio=0,pagadosAnio=0,esperadosAnio=0;
  const mesesHastahoy=a<anioActual?12:(a===anioActual?mesActualNum+1:0);
  esperadosAnio=mesesHastahoy*2; // papa + mama
  ['papa','mama'].forEach(parent=>{
    const data=getMesadaData(parent);
    const cuota=_getCuotaAnio(parent,a);
    for(let i=0;i<12;i++){
      const k=a+'-'+i;
      const info=data[k];
      if(info){totalAnio+=(info.monto||cuota);pagadosAnio++;}
    }
  });
  document.getElementById('ms-total').textContent=fmt(totalAnio);
  document.getElementById('ms-count').textContent=pagadosAnio+'/'+(esperadosAnio||'—');
}

function clickMesDot(parent,key,nombre){
  const data=getMesadaData(parent);
  if(data[key]){
    // Ya pagado → mostrar detalle
    abrirDetalleMesada(parent,key,nombre);
  } else {
    // No pagado → registrar pago
    abrirRegistrarMesada(parent,key,nombre);
  }
}

let mpSplitMode=false;

crearSplitWidget('mp', {
  simpleId:'mpModoSimple', splitId:'mpModoDividido', toggleId:'mpSplitToggle', rowsId:'mpSplitRows',
  getModo:()=>mpSplitMode, setModo:v=>{mpSplitMode=v;},
  getFuentesFn:getFuentesOptions,
  onPreview:actualizarMpPreview
});

function toggleMpSplit(){ splitToggle('mp'); }

function getFuentesOptions(selectedVal){
  return buildFuentesOptsHtml({ selectedVal, placeholder: 'No especificar', incluirTC:false });
}

function agregarMpSplitRow(){ splitAgregarRow('mp'); }

function getMpSplitData(){ return splitGetData('mp'); }

function abrirRegistrarMesada(parent,key,nombre){
  mpParent=parent;mpMesKey=key;mpMesNombre=nombre;
  mpSplitMode=false;
  const cuota=getMontoPadre(parent);
  const pNombre=parent==='papa'?'Papá':'Mamá';
  document.getElementById('mpTitle').textContent=pNombre+' · '+nombre;
  document.getElementById('mpDesc').textContent='Registrá cuándo te pagó y qué hiciste con esa plata.';
  document.getElementById('mpMonto').value=cuota||'';
  document.getElementById('mpFecha').value=hoy();
  document.getElementById('mpNota').value='';
  document.getElementById('mpPreview').textContent='';
  document.getElementById('mpModoSimple').style.display='';
  document.getElementById('mpModoDividido').style.display='none';
  document.getElementById('mpSplitRows').innerHTML='';
  document.getElementById('mpSplitToggle').textContent='Dividir ÷';
  document.getElementById('mpSplitToggle').style.background='rgba(200,240,96,.1)';
  document.getElementById('mpSplitToggle').style.borderColor='rgba(200,240,96,.3)';
  document.getElementById('mpSplitToggle').style.color='var(--accent)';
  poblarFuente('mpDestino', false, false);
  const sel=document.getElementById('mpDestino');
  sel.innerHTML='<option value="">No especificar / lo gasté</option>'+sel.innerHTML.replace('<option value="">Sin especificar</option>','');
  // Resetear toggle "quedó debiendo la diferencia"
  const chkDebe=document.getElementById('mpQuedaDebiendo');
  if(chkDebe){ chkDebe.checked=false; }
  const debeWrap=document.getElementById('mpDebeWrap');
  if(debeWrap){ debeWrap.style.display='none'; }

  // ── "Me pagó con plata de un encargo" — resetear y poblar si aplica ──
  mpUsarEncargoActivo=false;
  mpEncargoActualId='';
  const boxEnc=document.getElementById('mpEncargoBox');
  const chkEnc=document.getElementById('mpUsarEncargo');
  const detEnc=document.getElementById('mpEncargoDetalle');
  if(chkEnc)chkEnc.checked=false;
  if(detEnc)detEnc.style.display='none';
  if(boxEnc){
    const encMatches=_mesadaEncargosDelParent(parent);
    if(encMatches.length){
      boxEnc.style.display='';
      const totalDisp=encMatches.reduce((a,x)=>a+x.saldo,0);
      const subEnc=document.getElementById('mpEncargoSub');
      if(subEnc)subEnc.textContent='Tenés '+fmt(totalDisp)+' guardados de '+pNombre+' en encargos';
      const selEnc=document.getElementById('mpEncargoSel');
      if(selEnc)selEnc.innerHTML=encMatches.map(x=>`<option value="${x.enc.id}">${escHtml(x.enc.nombre)} (${fmt(x.saldo)})</option>`).join('');
      const selWrapEnc=document.getElementById('mpEncargoSelWrap');
      if(selWrapEnc)selWrapEnc.style.display=encMatches.length>1?'':'none';
      mpEncargoActualId=encMatches[0].enc.id;
      _poblarMpEncargoCuentas();
    } else {
      boxEnc.style.display='none';
    }
  }
  _mostrarSeccionDestinoNormal(true);
  openSheet('mesada-pago');
}

function actualizarMpPreview(){
  const v=parseMoney(document.getElementById('mpMonto').value)||0;
  const prev=document.getElementById('mpPreview');
  _syncMpDebeWrap(v);
  if(!v){prev.textContent='';return;}
  if(mpUsarEncargoActivo){
    const enc=typeof getEncargo==='function'?getEncargo(mpEncargoActualId):null;
    if(!enc){prev.textContent='';return;}
    const cuentaSel=document.getElementById('mpEncargoCuentaSel')?document.getElementById('mpEncargoCuentaSel').value:'';
    const disponible=cuentaSel
      ?(typeof _getEncargoSaldoEnCuenta==='function'?_getEncargoSaldoEnCuenta(enc,cuentaSel):0)
      :(typeof _getEncargoSaldoSinCuenta==='function'?_getEncargoSaldoSinCuenta(enc):0);
    if(v>disponible+0.5){
      prev.textContent='Ahí solo tenés '+fmt(disponible)+' de '+enc.nombre;
      prev.style.color='var(--red)';
    } else {
      prev.textContent='Se descuenta de lo que le tenías guardado a '+enc.nombre+' · queda '+fmt(disponible-v);
      prev.style.color='var(--blue)';
    }
    return;
  }
  if(mpSplitMode){
    const splits=getMpSplitData();
    const totalSplit=splits.reduce((a,s)=>a+s.monto,0);
    const restante=v-totalSplit;
    if(splits.length===0){prev.textContent=fmt(v)+' por distribuir';prev.style.color='var(--text2)';return;}
    let lines=splits.map(s=>fuenteLabel(s.fuente||'')+': +'+fmt(s.monto)).join(' · ');
    if(restante>0){prev.textContent=lines+' · Sin asignar: '+fmt(restante);prev.style.color='var(--amber)';}
    else if(restante<0){prev.textContent=lines+' · Excede por: '+fmt(-restante);prev.style.color='var(--red)';}
    else{prev.textContent=lines+' Todo distribuido';prev.style.color='var(--accent)';}
  } else {
    const dest=document.getElementById('mpDestino').value;
    if(dest){
      const actual=getSaldoActual(dest);
      prev.textContent=fuenteLabel(dest)+': '+fmt(actual)+' + '+fmt(v)+' = '+fmt(actual+v);
      prev.style.color='var(--accent)';
    } else {
      prev.textContent=fmt(v)+' registrados';
      prev.style.color='var(--text2)';
    }
  }
}

// Muestra/oculta el toggle "me quedó debiendo la diferencia" según el monto
// ingresado vs. la cuota esperada. Se llama desde actualizarMpPreview() cada
// vez que cambia el monto.
function _syncMpDebeWrap(v){
  const wrap=document.getElementById('mpDebeWrap');
  const chk=document.getElementById('mpQuedaDebiendo');
  const lbl=document.getElementById('mpDebeLabel');
  if(!wrap||!chk)return;
  const cuota=mpParent?getMontoPadre(mpParent):0;
  const diff=cuota-v;
  if(v>0&&diff>0){
    wrap.style.display='flex';
    if(lbl)lbl.textContent='Te está debiendo '+fmt(diff)+' — ¿marcar como pendiente?';
  } else {
    wrap.style.display='none';
    chk.checked=false;
  }
}

// Registra un movimiento "espejo" visible en la cuenta destino cuando entra
// plata de mesada — mismo patrón que usan Prestado, Encargos y Spotify. Sin
// esto, el saldo de la cuenta sube pero no queda ningún rastro en su propio
// historial de que esa plata vino de mesada (candado + "Automático"). Devuelve
// el id del movimiento creado, para poder revertirlo si se borra el pago de
// mesada, o null si el destino no corresponde a una cuenta rastreable (ej.
// destino vacío = "no especificar").
function _registrarMovSecundarioMesada(destino,monto,fecha,desc){
  if(!destino||!monto)return null;
  const id=uid();
  if(destino==='efectivo'||destino==='nequi'){
    if(!S.movimientos)S.movimientos=[];
    S.movimientos.push({id,tipo:'entrada',fuente:destino,monto,fecha,desc,_secundario:true,_origenSeccion:'Mesada'});
  } else if(destino.startsWith('custom:')){
    const cId=destino.split(':')[1];
    const cObj=(S.cuentasPersonalizadas||[]).find(x=>x.id===cId);
    if(cObj){
      if(!cObj.movimientos)cObj.movimientos=[];
      cObj.movimientos.push({id,tipo:'ingreso',monto,fecha,nota:desc,_secundario:true,_origenSeccion:'Mesada'});
    }
  } else if(destino.startsWith('cajita:')){
    const cId=destino.split(':')[1];
    const cObj=(S.cajitas||[]).find(x=>x.id===cId);
    if(cObj){
      if(!cObj.historial)cObj.historial=[];
      cObj.historial.push({id,tipo:'entrada',monto,fecha,nota:desc,_secundario:true,_origenSeccion:'Mesada'});
    }
  } else {
    return null;
  }
  return id;
}

// Elimina el movimiento espejo generado por _registrarMovSecundarioMesada,
// dado el destino original donde se creó y el id guardado.
function _borrarMovSecundarioMesada(destino,movSecId){
  if(!destino||!movSecId)return;
  if(destino==='efectivo'||destino==='nequi'){
    S.movimientos=(S.movimientos||[]).filter(x=>x.id!==movSecId);
  } else if(destino.startsWith('custom:')){
    const cId=destino.split(':')[1];
    const cObj=(S.cuentasPersonalizadas||[]).find(x=>x.id===cId);
    if(cObj&&cObj.movimientos)cObj.movimientos=cObj.movimientos.filter(x=>x.id!==movSecId);
  } else if(destino.startsWith('cajita:')){
    const cId=destino.split(':')[1];
    const cObj=(S.cajitas||[]).find(x=>x.id===cId);
    if(cObj&&cObj.historial)cObj.historial=cObj.historial.filter(x=>x.id!==movSecId);
  }
}

function confirmarMesadaPago(){
  const monto=parseMoney(document.getElementById('mpMonto').value)||0;
  const fecha=document.getElementById('mpFecha').value||hoy();
  const nota=document.getElementById('mpNota').value.trim();
  if(!monto||!mpParent||!mpMesKey)return;
  const data=getMesadaData(mpParent);
  // "Quedó debiendo la diferencia": solo aplica si el usuario marcó
  // explícitamente el toggle. Si no lo marca, un monto menor a la cuota
  // simplemente se registra tal cual, sin deuda (ej: "ese mes solo fueron
  // 60mil, no me quedó debiendo nada").
  const chkDebe=document.getElementById('mpQuedaDebiendo');
  const quedaDebiendo=!!(chkDebe&&chkDebe.checked);
  const cuotaDelMes=getMontoPadre(mpParent);
  const pendienteInicial=quedaDebiendo?Math.max(0,cuotaDelMes-monto):0;
  const pNombre=mpParent==='papa'?'Papá':'Mamá';
  const descMov='Mesada — '+pNombre+' · '+_mesNombreDeKey(mpMesKey);

  if(mpUsarEncargoActivo){
    const enc=typeof getEncargo==='function'?getEncargo(mpEncargoActualId):null;
    if(!enc){toast('Selecciona un encargo válido','err');return;}
    const cuentaSel=document.getElementById('mpEncargoCuentaSel')?document.getElementById('mpEncargoCuentaSel').value:'';
    const disponible=cuentaSel
      ?(typeof _getEncargoSaldoEnCuenta==='function'?_getEncargoSaldoEnCuenta(enc,cuentaSel):0)
      :(typeof _getEncargoSaldoSinCuenta==='function'?_getEncargoSaldoSinCuenta(enc):0);
    if(monto>disponible+0.5){
      toast('Ahí solo hay '+fmt(disponible)+' guardados de '+enc.nombre,'err');
      return;
    }
    if(!enc.movimientos)enc.movimientos=[];
    const movEnc={id:uid(),tipo:'salida',desc:descMov,monto,cuenta:cuentaSel||'',fecha,nota:'Usado para mesada',ts:Date.now()};
    enc.movimientos.push(movEnc);
    let destinoFinal=cuentaSel;
    let sumado=false; // true si de verdad entró plata a una cuenta (caso "sin especificar")
    let movSecId=null;
    if(cuentaSel){
      // Esa plata ya estaba contada dentro del saldo de esa cuenta (era del
      // encargo); solo se re-etiqueta como tuya, no se vuelve a sumar.
      movSecId=_registrarMovSecundarioMesada(cuentaSel,monto,fecha,descMov);
    } else {
      // Plata "sin especificar" del encargo: no estaba en ninguna cuenta
      // rastreada, así que sí entra de verdad a donde elijas.
      const destinoLibre=document.getElementById('mpDestino')?document.getElementById('mpDestino').value:'';
      destinoFinal=destinoLibre;
      if(destinoLibre){
        sumarFuente(destinoLibre,monto);
        sumado=true;
        movSecId=_registrarMovSecundarioMesada(destinoLibre,monto,fecha,descMov);
      }
    }
    data[mpMesKey]={
      monto,fecha,nota,
      destino:destinoFinal||'',
      _movSecId:movSecId,
      origenEncargo:{encargoId:enc.id,movId:movEnc.id,nombre:enc.nombre,sumado}
    };
  } else if(mpSplitMode){
    const splits=getMpSplitData();
    const totalSplit=splits.reduce((a,s)=>a+s.monto,0);
    if(totalSplit>monto+1){
      document.getElementById('mpPreview').textContent='El total dividido supera el monto recibido';
      document.getElementById('mpPreview').style.color='var(--red)';
      return;
    }
    data[mpMesKey]={monto,fecha,destino:'',splits,nota};
    splits.forEach(s=>{
      if(s.fuente){
        sumarFuente(s.fuente,s.monto);
        s._movSecId=_registrarMovSecundarioMesada(s.fuente,s.monto,fecha,descMov);
      }
    });
  } else {
    const destino=document.getElementById('mpDestino').value;
    data[mpMesKey]={monto,fecha,destino,nota};
    if(destino){
      sumarFuente(destino,monto);
      data[mpMesKey]._movSecId=_registrarMovSecundarioMesada(destino,monto,fecha,descMov);
    }
  }
  if(pendienteInicial>0){
    data[mpMesKey].cuotaEsperada=cuotaDelMes;
    data[mpMesKey].pendiente=pendienteInicial;
    data[mpMesKey].pendienteHistorial=[];
  }
  save();refresh();
  closeSheet('mesada-pago');
  if(pendienteInicial>0){
    toast('Guardado — quedó pendiente '+fmt(pendienteInicial),'info',3500);
  } else if(mpUsarEncargoActivo){
    toast('Guardado — se descontó de lo que le tenías guardado','ok',3000);
  }
}

function abrirDetalleMesada(parent,key,nombre){
  const data=getMesadaData(parent);
  const info=data[key];
  const pNombre=parent==='papa'?'Papá':'Mamá';
  document.getElementById('mdTitle').textContent=pNombre+' · '+nombre;
  let destinoHtml='';
  const origenEncargoHtml=info.origenEncargo
    ?`<div class="row" style="margin-bottom:6px;"><span style="font-size:12px;color:var(--text2);">Pagó con</span><span class="badge" style="background:rgba(96,176,240,.15);color:var(--blue);border-color:rgba(96,176,240,.3);">Plata guardada de ${escHtml(info.origenEncargo.nombre)}</span></div>`
    :'';
  if(info.splits&&info.splits.length){
    destinoHtml=`<div style="margin-bottom:6px;"><span style="font-size:12px;color:var(--text2);">Dividido en</span>
      <div style="margin-top:5px;display:flex;flex-direction:column;gap:4px;">
        ${info.splits.map(s=>`<div style="display:flex;justify-content:space-between;align-items:center;"><span class="badge ${fuenteBadgeClass(s.fuente||'')}" style="font-size:9px;">${escHtml(fuenteLabel(s.fuente||''))}</span><span style="font-size:12px;font-family:\'DM Mono\',monospace;color:var(--accent);">+${fmt(s.monto)}</span></div>`).join('')}
      </div></div>`;
  } else if(info.destino){
    destinoHtml=`<div class="row" style="margin-bottom:6px;"><span style="font-size:12px;color:var(--text2);">Lo metiste en</span><span class="badge ${fuenteBadgeClass(info.destino)}">${escHtml(fuenteLabel(info.destino))}</span></div>`;
  }
  destinoHtml=origenEncargoHtml+destinoHtml;
  // ── Pendiente: estado y acciones ──────────────────────────────────
  const anioKey=parseInt(key.split('-')[0],10);
  const cuotaDelMesDet=_getCuotaAnio(parent,anioKey);
  const tienePendienteDet=(info.pendiente||0)>0;
  const tieneHistorialDet=!!(info.pendienteHistorial&&info.pendienteHistorial.length);
  const puedeMarcarPendiente=!info.cuotaEsperada&&!tienePendienteDet&&(info.monto||0)<cuotaDelMesDet;

  let pendienteHtml='';
  if(info.cuotaEsperada&&(tienePendienteDet||tieneHistorialDet)){
    pendienteHtml=`
    <div class="card card-sm" style="margin-bottom:10px;border-left:4px solid ${tienePendienteDet?'var(--amber)':'var(--accent)'};background:${tienePendienteDet?'rgba(240,184,64,.06)':'rgba(200,240,96,.06)'};">
      <div class="row" style="margin-bottom:6px;"><span style="font-size:12px;color:var(--text2);">Cuota esperada</span><span style="font-size:13px;font-family:'DM Mono',monospace;">${fmt(info.cuotaEsperada)}</span></div>
      ${tienePendienteDet?`<div class="row" style="margin-bottom:2px;"><span style="font-size:12px;color:var(--amber);font-weight:600;">Pendiente</span><span class="row-amount c-amber">${fmt(info.pendiente)}</span></div>`:`<div style="font-size:12px;color:var(--accent);font-weight:600;">✓ Ya te dio todo lo que faltaba</div>`}
      ${tieneHistorialDet?`<div style="margin-top:9px;display:flex;flex-direction:column;gap:5px;">${info.pendienteHistorial.map((h,idx)=>`<div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--text2);gap:8px;"><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${h.fecha||''}${h.destino?' · '+escHtml(fuenteLabel(h.destino)):''}${h.nota?' · '+escHtml(h.nota):''}</span><span style="display:flex;align-items:center;gap:7px;flex-shrink:0;"><span style="font-family:'DM Mono',monospace;color:var(--accent);">+${fmt(h.monto)}</span><span ${Events.attr('mesada:deshacerPendiente', parent, key, idx)} style="cursor:pointer;color:var(--red);font-size:13px;line-height:1;" title="Deshacer este abono">✕</span></span></div>`).join('')}</div>`:''}
      ${tienePendienteDet?`<button type="button" class="btn" style="margin-top:10px;background:rgba(240,184,64,.12);border-color:rgba(240,184,64,.3);color:var(--amber);" ${Events.attr('mesada:resolverPendiente', parent, key)}>Registrar pago de lo pendiente</button>`:''}
    </div>`;
  } else if(puedeMarcarPendiente){
    pendienteHtml=`
    <div class="card card-sm" style="margin-bottom:10px;border-left:4px solid var(--border2);">
      <div style="font-size:12px;color:var(--text2);margin-bottom:8px;">Este mes recibiste menos que la cuota (${fmt(cuotaDelMesDet)}). ¿Te quedó debiendo la diferencia?</div>
      <button type="button" class="btn" style="background:rgba(240,184,64,.1);border-color:rgba(240,184,64,.3);color:var(--amber);" ${Events.attr('mesada:marcarPendiente', parent, key)}>Marcar diferencia como pendiente</button>
    </div>`;
  }

  let html=`
    <div class="card card-sm" style="margin-bottom:10px;">
      <div class="row" style="margin-bottom:6px;"><span style="font-size:12px;color:var(--text2);">Monto</span><span class="row-amount c-green">${fmt(info.monto)}</span></div>
      <div class="row" style="margin-bottom:6px;"><span style="font-size:12px;color:var(--text2);">Fecha</span><span style="font-size:13px;font-family:'DM Mono',monospace;">${info.fecha||'—'}</span></div>
      ${destinoHtml}
      ${info.nota?`<div style="font-size:12px;color:var(--text2);margin-top:4px;">${escHtml(info.nota)}</div>`:''}
    </div>
    ${pendienteHtml}
    <button type="button" class="btn" style="background:rgba(240,104,104,.1);border-color:rgba(240,104,104,.3);color:var(--red);" ${Events.attr('mesada:eliminarPago', parent, key)}>Borrar este registro</button>
  `;
  document.getElementById('mdContent').innerHTML=html;
  openSheet('mesada-det');
}

async function eliminarMesadaPago(parent,key){
  const data=getMesadaData(parent);
  const info=data[key];
  if(!info)return;

  // Protección por antigüedad — ver docs/proteccion-antiguedad-movimientos.md.
  // Nivel 1 (reciente) no cambia nada, sigue igual que siempre (sin aviso previo).
  const opsPosteriores=_mesadaOpsPosteriores(parent,key,info);
  const nivel=nivelAntiguedadMovimiento(info.fecha,opsPosteriores,'mesada');
  if(nivel==='bloqueado'){
    await avisarMovimientoBloqueado();
    return;
  }
  if(nivel==='viejo'){
    const fuentes=_mesadaFuentesDe(info);
    const nombreCuenta=fuentes.length>1?`${fuentes.length} cuentas`:fuenteLabel(fuentes[0]);
    const ok=await confirmarBorrarMovimientoViejo(nombreCuenta,info.monto||0,'baja');
    if(!ok)return;
  }
  _borrarMesadaPago(parent,key,info);
}

// Cuerpo real del borrado, separado para que ambos caminos (confirmación
// normal y aviso por antigüedad) terminen acá sin duplicar la reversión.
function _borrarMesadaPago(parent,key,info){
  const data=getMesadaData(parent);
    // Si hubo abonos posteriores que fueron saldando un "pendiente", info.monto
    // ya incluye esos abonos además del pago original. Hay que separarlos para
    // devolver cada plata a la cuenta correcta (pueden ser cuentas distintas).
    const historialTotal=(info.pendienteHistorial||[]).reduce((acc,h)=>acc+(h.monto||0),0);
    // Devolver el dinero del pago original a las cuentas correspondientes
    if(info.origenEncargo){
      // Este pago se cubrió con plata que ya le tenías guardada en un
      // encargo: hay que devolverle ese saldo al encargo (quitando el
      // movimiento de salida que se creó) y, solo si de verdad había
      // entrado plata nueva a una cuenta (caso "sin especificar"), revertir
      // esa entrada también.
      const oe=info.origenEncargo;
      const enc=typeof getEncargo==='function'?getEncargo(oe.encargoId):null;
      let montoOrig=0;
      if(enc&&enc.movimientos){
        const mv=enc.movimientos.find(m=>m.id===oe.movId);
        if(mv)montoOrig=mv.monto||0;
        enc.movimientos=enc.movimientos.filter(m=>m.id!==oe.movId);
      }
      if(oe.sumado&&info.destino&&montoOrig){
        descontarFuente(info.destino,montoOrig);
      }
      _borrarMovSecundarioMesada(info.destino,info._movSecId);
    } else if(info.splits&&info.splits.length){
      info.splits.forEach(s=>{
        if(s.fuente){
          descontarFuente(s.fuente,s.monto);
          _borrarMovSecundarioMesada(s.fuente,s._movSecId);
        }
      });
    } else if(info.destino){
      const montoOriginal=Math.max(0,(info.monto||0)-historialTotal);
      descontarFuente(info.destino,montoOriginal);
      _borrarMovSecundarioMesada(info.destino,info._movSecId);
    }
    // Devolver también los abonos que fueron saldando lo pendiente
    (info.pendienteHistorial||[]).forEach(h=>{
      if(h.destino){
        descontarFuente(h.destino,h.monto);
        _borrarMovSecundarioMesada(h.destino,h._movSecId);
      }
    });
  delete data[key];
  save();refresh();
  closeSheet('mesada-det');
}

// ── Pago parcial con deuda pendiente ──────────────────────────────────────

function _mesNombreDeKey(key){
  const partes=String(key).split('-');
  const anio=partes[0];
  const mesIdx=parseInt(partes[1],10)||0;
  return (MC[mesIdx]||'')+' '+anio;
}

// Convierte retroactivamente un mes ya cerrado (registrado con menos plata de
// la cuota, sin haber marcado el toggle al momento de guardar) en un mes con
// deuda pendiente. Útil para el caso típico: "ya anoté los 60mil, pero ahora
// caigo en que me quedó debiendo los 20mil restantes".
function marcarMesadaComoPendiente(parent,key){
  const data=getMesadaData(parent);
  const info=data[key];
  if(!info)return;
  const anio=parseInt(String(key).split('-')[0],10);
  const cuota=_getCuotaAnio(parent,anio);
  const pend=Math.max(0,cuota-(info.monto||0));
  if(pend<=0){toast('Ese mes ya está completo, no hay diferencia pendiente','info');return;}
  info.cuotaEsperada=cuota;
  info.pendiente=pend;
  if(!info.pendienteHistorial)info.pendienteHistorial=[];
  save();refresh();
  toast('Marcado como pendiente — debe '+fmt(pend),'info',3000);
  abrirDetalleMesada(parent,key,_mesNombreDeKey(key));
}

// Abre el sheet para registrar cuánto pagó de lo que había quedado pendiente.
function abrirResolverPendiente(parent,key){
  const data=getMesadaData(parent);
  const info=data[key];
  if(!info||!(info.pendiente>0))return;
  mppParent=parent;mppMesKey=key;
  const pNombre=parent==='papa'?'Papá':'Mamá';
  document.getElementById('mppTitle').textContent=pNombre+' · '+_mesNombreDeKey(key);
  document.getElementById('mppDesc').textContent='Te debía '+fmt(info.pendiente)+'. ¿Cuánto te dio ahora?';
  document.getElementById('mppMonto').value=fmtInput(info.pendiente);
  document.getElementById('mppFecha').value=hoy();
  document.getElementById('mppNota').value='';
  poblarFuente('mppDestino', false, false);
  const sel=document.getElementById('mppDestino');
  sel.innerHTML='<option value="">No especificar / lo gasté</option>'+sel.innerHTML.replace('<option value="">Sin especificar</option>','');
  actualizarMppPreview();
  openSheet('mesada-pend');
}

function actualizarMppPreview(){
  const prev=document.getElementById('mppPreview');
  const data=getMesadaData(mppParent);
  const info=data[mppMesKey];
  const v=parseMoney(document.getElementById('mppMonto').value)||0;
  if(!info||!v){prev.textContent='';return;}
  if(v>info.pendiente+1){
    prev.textContent='Eso es más de lo que quedó pendiente ('+fmt(info.pendiente)+')';
    prev.style.color='var(--red)';
    return;
  }
  const restante=info.pendiente-v;
  prev.textContent=restante>0?('Quedaría debiendo '+fmt(restante)+' más'):'Con esto queda saldado ✓';
  prev.style.color=restante>0?'var(--amber)':'var(--accent)';
}

function confirmarPendienteMesada(){
  const data=getMesadaData(mppParent);
  const info=data[mppMesKey];
  if(!info||!(info.pendiente>0))return;
  let monto=parseMoney(document.getElementById('mppMonto').value)||0;
  if(monto<=0)return;
  if(monto>info.pendiente)monto=info.pendiente; // no se puede saldar más de lo que quedó pendiente
  const fecha=document.getElementById('mppFecha').value||hoy();
  const destino=document.getElementById('mppDestino').value;
  const nota=document.getElementById('mppNota').value.trim();
  if(!info.pendienteHistorial)info.pendienteHistorial=[];
  const pNombre=mppParent==='papa'?'Papá':'Mamá';
  const descMov='Mesada (pendiente) — '+pNombre+' · '+_mesNombreDeKey(mppMesKey);
  let movSecId=null;
  if(destino){
    sumarFuente(destino,monto);
    movSecId=_registrarMovSecundarioMesada(destino,monto,fecha,descMov);
  }
  info.pendienteHistorial.push({monto,fecha,destino,nota,_movSecId:movSecId});
  info.pendiente=Math.max(0,info.pendiente-monto);
  info.monto=(info.monto||0)+monto;
  save();refresh();
  closeSheet('mesada-pend');
  toast(info.pendiente>0?('Abono registrado — todavía debe '+fmt(info.pendiente)):'¡Pendiente saldado! 🎉','ok',3000);
  abrirDetalleMesada(mppParent,mppMesKey,_mesNombreDeKey(mppMesKey));
}

// Deshace un abono puntual de lo pendiente (por si se registró por error).
async function deshacerPendienteMesada(parent,key,idx){
  const data=getMesadaData(parent);
  const info=data[key];
  if(!info||!info.pendienteHistorial||!info.pendienteHistorial[idx])return;
  const ok=await dialogo('Deshacer abono','¿Deshacer este abono de lo pendiente? La plata se restará de la cuenta donde la registraste y volverá a quedar como deuda.','Deshacer',true);
  if(!ok)return;
  const h=info.pendienteHistorial[idx];
  if(h.destino){
    descontarFuente(h.destino,h.monto);
    _borrarMovSecundarioMesada(h.destino,h._movSecId);
  }
  info.monto=Math.max(0,(info.monto||0)-h.monto);
  info.pendiente=(info.pendiente||0)+h.monto;
  info.pendienteHistorial.splice(idx,1);
  save();refresh();
  toast('Abono deshecho','ok',2000);
  abrirDetalleMesada(parent,key,_mesNombreDeKey(key));
}

function cambiarAnio(d){const hoy=new Date().getFullYear();const nuevo=(S.mesadaAnio||hoy)+d;if(nuevo<hoy-2||nuevo>hoy+2)return;save();S.mesadaAnio=nuevo;renderMesada();}

/* ── Wiring de controles propios de la pantalla ──────────────────────────
   Movido desde _initEventListeners() (index.html) el 2026-07-26 — ver
   auditoria-tecnica.md, punto 3. No son onclick inline (no hay problema
   de CSP acá), es solo mover el addEventListener directo a su módulo
   dueño en vez de dejarlo mezclado con el de otros ~15 dominios en
   index.html. Todos estos ids ya existen en el DOM estático antes de
   este <script> (verificado contra index.html), así que no hace falta
   esperar a DOMContentLoaded. ── */
const _mBtnAnioP = document.getElementById('btn-anio-prev');
if (_mBtnAnioP) _mBtnAnioP.addEventListener('click', () => cambiarAnio(-1));
const _mBtnAnioN = document.getElementById('btn-anio-next');
if (_mBtnAnioN) _mBtnAnioN.addEventListener('click', () => cambiarAnio(1));

const _mBtnMesadaConf = document.getElementById('btn-confirmar-mesada');
if (_mBtnMesadaConf) _mBtnMesadaConf.addEventListener('click', confirmarMesadaPago);
const _mBtnMesadaPendConf = document.getElementById('btn-confirmar-mesada-pend');
if (_mBtnMesadaPendConf) _mBtnMesadaPendConf.addEventListener('click', confirmarPendienteMesada);

const _mMpDestino = document.getElementById('mpDestino');
if (_mMpDestino) _mMpDestino.addEventListener('change', actualizarMpPreview);
const _mMpMonto = document.getElementById('mpMonto');
if (_mMpMonto) _mMpMonto.addEventListener('input', actualizarMpPreview);

// "Me pagó con plata de un encargo" — toggle y selects
const _mChkUsarEncargo = document.getElementById('mpUsarEncargo');
if (_mChkUsarEncargo) _mChkUsarEncargo.addEventListener('change', () => {
  mpUsarEncargoActivo = _mChkUsarEncargo.checked;
  const det = document.getElementById('mpEncargoDetalle');
  if (det) det.style.display = mpUsarEncargoActivo ? '' : 'none';
  if (mpUsarEncargoActivo) {
    const cuentaSel = document.getElementById('mpEncargoCuentaSel');
    _mostrarSeccionDestinoNormal(!!(cuentaSel && cuentaSel.value === ''));
  } else {
    _mostrarSeccionDestinoNormal(true);
  }
  actualizarMpPreview();
});
const _mSelEncargo = document.getElementById('mpEncargoSel');
if (_mSelEncargo) _mSelEncargo.addEventListener('change', () => {
  mpEncargoActualId = _mSelEncargo.value;
  _poblarMpEncargoCuentas();
});
const _mSelEncargoCuenta = document.getElementById('mpEncargoCuentaSel');
if (_mSelEncargoCuenta) _mSelEncargoCuenta.addEventListener('change', () => {
  if (mpUsarEncargoActivo) _mostrarSeccionDestinoNormal(_mSelEncargoCuenta.value === '');
  actualizarMpPreview();
});
const _mEncargoToggleWrap = document.getElementById('mpEncargoToggleWrap');
if (_mEncargoToggleWrap) _mEncargoToggleWrap.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'mpUsarEncargo') return; // evitar doble toggle
  const chk = document.getElementById('mpUsarEncargo');
  if (chk) chk.click();
});

// mpDebeWrap / mpQuedaDebiendo: el wrap entero es clickeable (delega el click
// al checkbox real), pero el checkbox no debe re-disparar el click del wrap.
const _mMpDebeWrap = document.getElementById('mpDebeWrap');
if (_mMpDebeWrap) _mMpDebeWrap.addEventListener('click', () => document.getElementById('mpQuedaDebiendo').click());
const _mMpQuedaDebiendo = document.getElementById('mpQuedaDebiendo');
if (_mMpQuedaDebiendo) {
  _mMpQuedaDebiendo.addEventListener('click', (e) => e.stopPropagation());
  _mMpQuedaDebiendo.addEventListener('change', actualizarMpPreview);
}

const _mMppDestino = document.getElementById('mppDestino');
if (_mMppDestino) _mMppDestino.addEventListener('change', actualizarMppPreview);
const _mMppMonto = document.getElementById('mppMonto');
if (_mMppMonto) _mMppMonto.addEventListener('input', actualizarMppPreview);

const _mSplitToggle = document.getElementById('mpSplitToggle');
if (_mSplitToggle) _mSplitToggle.addEventListener('click', toggleMpSplit);
const _mBtnSplitRow = document.getElementById('btn-add-split-row');
if (_mBtnSplitRow) _mBtnSplitRow.addEventListener('click', agregarMpSplitRow);

/* ── Registro de acciones para el despachador central de eventos ──
   Reemplaza los onclick inline que este módulo armaba en sus
   template strings. Ver js/core/events.js. ── */
Events.registerAll('mesada', {
  clickMesDot: clickMesDot,
  eliminarPago: eliminarMesadaPago,
  resolverPendiente: abrirResolverPendiente,
  marcarPendiente: marcarMesadaComoPendiente,
  deshacerPendiente: deshacerPendienteMesada,
});
