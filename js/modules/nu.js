/* ═══════════════════════════════════════════════════════════════
   js/modules/nu.js

   Módulo Nu de mis-finanzas: todo lo que es exclusivo de la cuenta Nu.
   Cubre:
     · Tasa EA única de las cajitas (S.nuRate) con su historial por tramos
       (S.historialTasasNu) y la materialización de intereses
     · Cajitas: crear, eliminar, lista, detalle, "Agregar/Retirar dinero"
       (abrirNuMovimiento/confirmarNuMovimiento)
     · CDTs: crear, editar, cobrar, vencimientos
     · Metas de ahorro por cajita
     · Chequeo rápido de saldo real contra la app de Nu (con encargos
       incluidos) y la sugerencia de cambio de tasa que sale de ahí
     · Qué acciones de Nu están disponibles (botones deshabilitados con su
       motivo): actualizarBotonesNu()

   El CÁLCULO de intereses no vive acá sino en js/core/nu-calc.js (calcC,
   calcCDT, nuValorEsperadoCajita, nuTasaConfigurada…): es núcleo porque el
   patrimonio, Inicio y Encargos lo necesitan en cualquier pantalla. Este
   archivo es la parte que MUTA datos y pinta pantallas.

   Carga: grupo lazy 'cuentas', junto con js/modules/cuentas.js.
   Regla de dependencia (UN solo sentido): Nu se apoya en cuentas.js, nunca
   al revés. Nu es una cuenta más y reutiliza lo genérico de esa capa —
   _descriptorCuenta, _tituloCuentaHtml, _showCuentasPanel, _setBtnEstado,
   _setBtnTransferir, _MIN_RETIRO, getMovimientosCuenta, renderMovsCuenta,
   abrirAgregarDinero, abrirRestarDinero, abrirTransferir,
   actualizarBotonRetirar, actualizarBotonesTransferir,
   registrarEntradaConApertura, registrarSalida, _aperturaToggleUI —
   únicamente cuando una función corre. cuentas.js no
   nombra nada de este archivo: Nu se le presenta registrándose en
   CuentaPantallas (core-state.js) al cargar. La prueba 'cuentas-nu-archivos'
   (tests/cuentas.test.js) vigila las dos cosas.

   Ver docs/nu.md (objetivo, reglas y modelo de datos) y docs/cuentas.md.
   ═══════════════════════════════════════════════════════════════ */

/* ───────────────────────────────────────────────────────────────
   SECCIÓN: Nu — tasa EA (con historial por tramos) y cálculo de CDTs
   ─────────────────────────────────────────────────────────────── */
// Registra (o actualiza) un cambio de tasa Nu vigente desde una fecha específica.
// Permite corregir retroactivamente: si Nu subió la tasa el 6 de julio pero te enteraste
// el 12, registras {fecha:'2026-07-06', tasa:9.30} y calcC() recalcula automáticamente
// todos los días desde el 6 con la tasa nueva.
function registrarTasaNuHistorial(fechaStr, tasa){
  if(!fechaStr||tasa==null||isNaN(tasa))return;
  if(!S.historialTasasNu)S.historialTasasNu=[];
  const idx=S.historialTasasNu.findIndex(h=>h.fecha===fechaStr);
  if(idx>=0)S.historialTasasNu[idx].tasa=tasa;
  else S.historialTasasNu.push({fecha:fechaStr,tasa});
  S.historialTasasNu.sort((a,b)=>a.fecha<b.fecha?-1:(a.fecha>b.fecha?1:0));
  if(S.historialTasasNu.length>60)S.historialTasasNu=S.historialTasasNu.slice(-60);
}

// Materializa los intereses acumulados en el saldo (llama esto antes de depósitos/retiros)
function materializarIntereses(c){
  if(!c.fecha)c.fecha=hoy();
  const k=calcC(c);
  if(k.dias>0&&k.ganado>0.005){
    // Antes de fundir el interés en el saldo, anota cuánto rindió en cada mes (c.rendimientos): sin esto
    // se pierde para siempre en qué mes se ganó. No es un movimiento (no toca saldos ni historial):
    // Periodo.rendimientosDelMes() lo lee para mostrar los rendimientos como una línea aparte del ingreso.
    const porMes=rendimientoCajitaPorMes(c);
    if(!c.rendimientos)c.rendimientos={};
    Object.keys(porMes).forEach(mk=>{c.rendimientos[mk]=Math.round(((c.rendimientos[mk]||0)+porMes[mk])*100)/100;});
    // Los intereses entran al libro como 'rendimiento' (una entrada por cajita y mes).
    ajustarSaldoCuenta('cajita:'+c.id,k.val,{tipo:'rendimiento',desc:'Intereses de Nu',origen:{modulo:'cuentas'}});
    c.fecha=hoy();
  }else if(!((c.saldo||0)>0)&&!(_saldoEncargosEnCajita(c.id)>0)){
    // Sin plata adentro (ni propia ni de encargos) no hay intereses que sellar, pero el reloj de la cajita (c.fecha) no
    // puede quedarse en el día en que se creó: calcC() le contaría al primer depósito los días que la cajita estuvo
    // vacía. El reloj arranca HOY, que es cuando entra la plata (Nu paga el primer interés a las 12 a.m. siguientes).
    c.fecha=hoy();
  }
}

// Umbrales del chequeo rápido de Nu (ver cuentas.md §5 y §7). Un solo lugar para ajustarlos.
const _CFG_CHEQUEO_NU={
  // — Detección de cambio de tasa —
  umbralEA:0.05,      // desvío mínimo (puntos de EA) para que un punto cuente como "tasa distinta"
  minDias:5,          // días mínimos entre dos chequeos para poder compararlos (con menos, el ruido de
                      // redondeo/digitación domina: 1 peso sobre 1 día de rendimiento son ~2 puntos de EA)
  tolPesos:1,         // diferencia mínima en $ contra lo que daría la tasa actual (menos = redondeo)
  maxDesvioEA:5,      // más lejos que esto de la tasa vigente no es un cambio de tasa: es plata que entró/salió
                      // sin registrar o un valor mal digitado — ese par se descarta de la serie
  // — Aviso al guardar si el saldo anotado se aleja mucho de lo calculado —
  avisoPct:0.02,      // diferencia relativa a partir de la cual se pide confirmar...
  avisoMinPesos:1000  // ...y nunca por menos de esta cantidad de pesos
};

// Calcula, para cada fecha en que hiciste un chequeo, la tasa EA que mejor explica el
// crecimiento real de las cajitas chequeadas ese día (ponderado por saldo). Misma lógica
// validada en el laboratorio externo de cajitas Nu.
function calcularSerieTasaImplicitaNu(){
  const chequeos=S.chequeosNu||[];
  if(!chequeos.length)return[];
  const fechas=[...new Set(chequeos.map(ch=>ch.fecha))].sort();
  const prevByCajita={};
  (S.cajitas||[]).forEach(c=>{
    prevByCajita[c.id]={balance:(c.saldo||0)+_saldoEncargosEnCajita(c.id),fecha:c.fecha||hoy()};
  });
  const serie=[];
  fechas.forEach(fecha=>{
    let sumaPond=0,sumaPesos=0,difPesos=0;
    chequeos.filter(ch=>ch.fecha===fecha).forEach(ch=>{
      const prev=prevByCajita[ch.cajitaId];
      if(!prev){prevByCajita[ch.cajitaId]={balance:ch.saldoReal,fecha};return;}
      const dias=_diasEntreFechas(prev.fecha,fecha);
      // Chequeo demasiado cerca del anterior: no se compara y el punto de partida NO avanza,
      // así el próximo chequeo se mide contra uno más lejano (donde el ruido pesa menos).
      if(dias>0&&dias<_CFG_CHEQUEO_NU.minDias)return;
      if(dias>0&&prev.balance>=1000){
        const rDiaria=Math.pow(ch.saldoReal/prev.balance,1/dias)-1;
        const ea=(Math.pow(1+rDiaria,365)-1)*100;
        // Un salto imposible (Infinity/NaN, o a más de maxDesvioEA puntos de la tasa vigente) es un
        // saldo mal anotado o plata sin registrar en esa cajita, no una tasa: se descarta SOLO ese
        // par para que no contamine el promedio ponderado de las demás cajitas del mismo día.
        if(isFinite(ea)&&Math.abs(ea-_tasaVigenteEnFecha(fecha))<=_CFG_CHEQUEO_NU.maxDesvioEA){
          // Lo que habría dado la tasa vigente en cada tramo, para medir la diferencia en pesos.
          let esperado=prev.balance;
          _segmentosTasaNu(prev.fecha,fecha).forEach(seg=>{esperado*=Math.pow(1+seg.tasa/100,seg.dias/365);});
          sumaPond+=ea*prev.balance;sumaPesos+=prev.balance;
          difPesos+=ch.saldoReal-esperado;
        }
      }
      prevByCajita[ch.cajitaId]={balance:ch.saldoReal,fecha};
    });
    if(sumaPesos>0)serie.push({fecha,ea:sumaPond/sumaPesos,difPesos});
  });
  return serie;
}

// Revisa si los últimos chequeos se desviaron SOSTENIDAMENTE de la tasa registrada.
// Devuelve {sugerida, desde} si detecta un posible cambio, o null si todo cuadra.
// Un punto cuenta como desvío solo si: (1) se aleja más de umbralEA de la tasa actual, (2) la
// diferencia equivale a más de tolPesos pesos (no es redondeo). Los saltos imposibles ya se
// descartan al armar la serie (maxDesvioEA). La racha exige 2+ puntos consecutivos del MISMO lado: uno por encima y otro
// por debajo es ruido que se compensa, no una tasa nueva.
function verificarTasaNu(){
  const serie=calcularSerieTasaImplicitaNu();
  if(!serie.length)return null;
  const tasaActual=_tasaVigenteEnFecha(hoy());
  const C=_CFG_CHEQUEO_NU;
  const desvio=p=>p.ea-tasaActual;
  const esDesvio=p=>Math.abs(desvio(p))>C.umbralEA&&Math.abs(p.difPesos)>C.tolPesos;
  let racha=[];
  for(let i=serie.length-1;i>=0;i--){
    const p=serie[i];
    if(esDesvio(p)&&(!racha.length||Math.sign(desvio(p))===Math.sign(desvio(racha[0]))))racha.unshift(p); else break;
  }
  if(racha.length>=2){
    const prom=racha.reduce((a,p)=>a+p.ea,0)/racha.length;
    return{sugerida:Math.round(prom*100)/100,desde:racha[0].fecha};
  }
  return null;
}

function poblarChequeoNu(){
  const cont=document.getElementById('chequeoNuLista');
  if(!cont)return;
  // Solo las cajitas que ya generaron intereses un día completo (cada una por su cuenta): comparar el saldo real con un
  // cálculo de 0 días no dice nada de la tasa. Las nuevas aparecen solas cuando cumplen su primer día.
  const aptas=cajitasChequeables();
  const faltan=(S.cajitas||[]).length-aptas.length;
  cont.innerHTML=html`${aptas.map(c=>{
    const e=nuValorEsperadoCajita(c); // el total que debería mostrar Nu: propio + intereses + encargos guardados ahí
    return html`<div class="ig nu-chq-campo">
      <label class="il" for="chq-${c.id}">${c.nombre} <span class="nu-chq-debe">(debería verse: ${fmt(e.total)})</span></label>
      <input type="text" inputmode="decimal" class="money-input" id="chq-${c.id}" data-chq-cajita="${c.id}" placeholder="${fmt(e.total)}">
      ${e.encargos>0?html`<div class="nu-chq-nota">Incluye ${fmt(e.encargos)} de encargos guardados en esta cajita.</div>`:''}
    </div>`;
  })}${faltan>0?html`<div class="nu-chq-faltan">${faltan===1?'Hay 1 cajita que no aparece':'Hay '+faltan+' cajitas que no aparecen'}: todavía no ${faltan===1?'cumple':'cumplen'} un día completo generando intereses.</div>`:''}`;
}

// Abre el chequeo solo si hay algo que chequear (el botón ya sale deshabilitado; esto cubre cualquier otra vía).
function abrirChequeoNu(){
  const motivo=_motivoNuChequeo();
  if(motivo){toast(motivo,'err',4000);return;}
  openSheet('chequeo-nu');
  poblarChequeoNu();
}

// Qué saldo propio quedaría en la cajita si se acepta lo que el usuario anotó, y contra qué
// valor calculado se está comparando. Cuando la cajita tiene plata de un encargo adentro, el
// usuario puede haber escrito el TOTAL físico que ve en Nu (propio + encargo, sin distinguir) o
// ya SU parte neta. Para no restar el encargo dos veces en el segundo caso, se compara el valor
// contra las dos referencias (propio vs. propio+encargo) y se asume la más cercana — la
// diferencia entre ambas es normalmente el monto completo del encargo, mucho mayor que
// cualquier corrección real de unos pocos pesos, así que no hay casos realmente ambiguos.
// Única fuente de esta lógica: la usan tanto el aviso previo como la corrección del saldo.
// Lo que se anota en el Chequeo rápido es SIEMPRE lo que muestra la app de Nu para la cajita: el total, con el dinero de
// encargos incluido (nuValorEsperadoCajita). Antes se adivinaba si el usuario había puesto el total o solo lo propio según
// cuál valor quedaba más cerca, y la pantalla mostraba solo lo propio. Ahora no hay nada que adivinar:
// saldo propio = lectura − encargos, y la referencia contra la que se compara es el total esperado.
function _interpretarLecturaChequeoNu(c,val){
  const e=nuValorEsperadoCajita(c);
  return{saldoPropio:val-e.encargos,referencia:e.total,encargos:e.encargos};
}

// Foto del estado justo antes de aplicar un chequeo, para poder deshacerlo si el usuario, al ver
// el aviso de cambio de tasa, se da cuenta de que se equivocó al anotar. Solo vive en memoria:
// no se guarda en S (si se cierra la app, el chequeo queda aplicado como siempre).
let _chequeoNuUndo=null;

async function guardarChequeoNu(){
  const motivo=_motivoNuChequeo();
  if(motivo){toast(motivo,'err',4000);return;}
  const aptas=new Set(cajitasChequeables().map(c=>c.id));
  const inputs=document.querySelectorAll('[data-chq-cajita]');
  const hoyStr=hoy();
  // 1) Leer lo anotado SIN tocar nada todavía.
  const lecturas=[];
  inputs.forEach(inp=>{
    const raw=(inp.value||'').replace(/\./g,'').replace(',','.');
    const val=parseFloat(raw);
    // Un campo money-input se rellena con "0,00" apenas se toca (focusin) y nada lo limpia al salir,
    // así que 0 significa "no anoté nada", no "esta cajita tiene $0". Antes se guardaba como lectura
    // real: ponía la cajita en 0 (solo con aviso si se alejaba más de max($1.000, 2%)) y ensuciaba
    // S.chequeosNu. Si de verdad quedó vacía, se registra el retiro como movimiento (lo dice el aviso).
    if(!raw||isNaN(val)||val<=0)return;
    if(!aptas.has(inp.dataset.chqCajita))return; // aún no cumple su primer día completo de intereses
    lecturas.push({cajitaId:inp.dataset.chqCajita,val,texto:inp.value});
  });
  // La lectura es el total de Nu: no puede ser menor que el dinero de encargos que hay en esa cajita (el saldo propio
  // saldría negativo). Casi siempre es haber anotado solo lo propio: se corrige antes de guardar nada.
  for(const l of lecturas){
    const enc=_saldoEncargosEnCajita(l.cajitaId);
    if(l.val<enc){
      const c=(S.cajitas||[]).find(cc=>cc.id===l.cajitaId);
      toast('En "'+escHtml((c&&c.nombre)||'la cajita')+'" anotaste '+fmt(l.val)+', pero ahí hay '+fmt(enc)+' de encargos. Pon el total que ves en Nu (encargos incluidos).','err',5000);
      return;
    }
  }
  if(lecturas.length===0){if(window.toast)toast('No pusiste ningún saldo para chequear.','err',3000);return;}

  // 2) Aviso previo: si algún saldo se aleja mucho de lo calculado, pedir confirmación ANTES de
  //    guardar. Un cambio de tasa mueve el saldo unos pesos por mes; una diferencia grande casi
  //    siempre es un valor mal digitado o plata que entró/salió sin registrarse. Al cancelar el
  //    sheet sigue abierto con lo que se anotó, para corregirlo.
  const anomalias=[];
  lecturas.forEach(l=>{
    const c=(S.cajitas||[]).find(cc=>cc.id===l.cajitaId);
    if(!c)return;
    const {referencia}=_interpretarLecturaChequeoNu(c,l.val);
    const dif=l.val-referencia;
    if(Math.abs(dif)>Math.max(_CFG_CHEQUEO_NU.avisoMinPesos,Math.abs(referencia)*_CFG_CHEQUEO_NU.avisoPct)){
      anomalias.push('• '+(c.nombre||'Cajita')+': anotaste '+fmt(l.val)+' y la app calculaba '+fmt(referencia)+' ('+(dif>0?'+':'−')+fmt(Math.abs(dif))+')');
    }
  });
  if(anomalias.length){
    const okAviso=await dialogo(
      'Revisa lo que anotaste',
      'Estos saldos se alejan mucho de lo calculado:\n\n'+anomalias.join('\n')+
      '\n\nUn cambio de tasa mueve el saldo apenas unos pesos por mes. Una diferencia así suele ser un valor mal digitado, o plata que entró o salió y no está registrada (si es eso, regístrala como movimiento antes de hacer el chequeo).\n\n¿Guardar de todos modos?',
      'Guardar de todos modos',
      false
    );
    if(!okAviso)return;
  }

  // 3) Guardar. Antes, foto del estado actual para poder deshacer desde el aviso de tasa.
  if(!S.chequeosNu)S.chequeosNu=[];
  _chequeoNuUndo={
    chequeos:JSON.parse(JSON.stringify(S.chequeosNu)),
    cajitas:lecturas.map(l=>{const c=(S.cajitas||[]).find(cc=>cc.id===l.cajitaId);return c?{id:c.id,saldo:c.saldo,fecha:c.fecha}:null;}).filter(Boolean),
    lecturas:lecturas.map(l=>({cajitaId:l.cajitaId,texto:l.texto}))
  };
  lecturas.forEach(l=>{
    const cajitaId=l.cajitaId,val=l.val;
    const idx=S.chequeosNu.findIndex(ch=>ch.cajitaId===cajitaId&&ch.fecha===hoyStr);
    if(idx>=0)S.chequeosNu[idx].saldoReal=val;
    else S.chequeosNu.push({fecha:hoyStr,cajitaId,saldoReal:val});
    // Corrige el saldo calculado de la cajita al valor real que reportó el usuario.
    // Sin movimiento asociado — mismo criterio silencioso que materializarIntereses():
    // es un ajuste de saldo, no plata que entra o sale de ningún lado.
    const c=(S.cajitas||[]).find(cc=>cc.id===cajitaId);
    if(c){
      // El chequeo pisa el saldo con la lectura real de Nu: la diferencia queda en el libro como 'ajuste' (antes no dejaba rastro).
      ajustarSaldoCuenta('cajita:'+c.id,_interpretarLecturaChequeoNu(c,val).saldoPropio,{tipo:'ajuste',desc:'Chequeo rápido de Nu: saldo real anotado',origen:{modulo:'cuentas'}});
      c.fecha=hoyStr;
    }
  });
  if(S.chequeosNu.length>500)S.chequeosNu=S.chequeosNu.slice(-500);
  save();refresh();
  closeSheet('chequeo-nu');
  const r=verificarTasaNu();
  if(r){
    _abrirConfirmarTasaNu(r);
  }else{
    _chequeoNuUndo=null;
    if(window.toast)toast('Chequeo guardado — saldo corregido con lo que anotaste.','ok',3000);
  }
}

// "Me equivoqué al anotar": deshace el chequeo recién guardado (saldos, fechas y puntos de
// S.chequeosNu vuelven a como estaban) y reabre el chequeo con los mismos valores para editarlos.
function corregirChequeoNu(){
  const u=_chequeoNuUndo;
  _tasaNuPendiente=null;
  closeSheet('confirmar-tasa-nu');
  if(!u)return;
  S.chequeosNu=u.chequeos;
  u.cajitas.forEach(s=>{
    const c=(S.cajitas||[]).find(x=>x.id===s.id);
    if(c){ajustarSaldoCuenta('cajita:'+c.id,s.saldo,{tipo:'ajuste',desc:'Chequeo de Nu deshecho',origen:{modulo:'cuentas'}});c.fecha=s.fecha;}
  });
  _chequeoNuUndo=null;
  save();refresh();
  openSheet('chequeo-nu');
  poblarChequeoNu();
  u.lecturas.forEach(l=>{
    const inp=document.getElementById('chq-'+l.cajitaId);
    if(inp)inp.value=l.texto;
  });
  if(window.toast)toast('Chequeo deshecho — corrige los saldos y vuelve a guardar.','ok',3500);
}

// Guarda temporalmente la sugerencia de cambio de tasa detectada en guardarChequeoNu()
// mientras el usuario decide si aplicarla — reemplaza el antiguo confirm() nativo del
// navegador (que solo daba Aceptar/Cancelar) por un sheet propio de la app donde la
// tasa sugerida y la fecha "desde" quedan editables antes de confirmar, por si el
// usuario se equivocó al anotar el saldo y quiere corregir el valor antes de guardar.
let _tasaNuPendiente=null;

function _abrirConfirmarTasaNu(r){
  _tasaNuPendiente=r;
  const tasaActual=_tasaVigenteEnFecha(hoy());
  const msgEl=document.getElementById('ctn-msg');
  if(msgEl)msgEl.textContent=`Los chequeos ya no cuadran con ${tasaActual}% desde el ${r.desde}. Con lo que anotaste, parece que ahora es ${r.sugerida}%. Revisa o corrige el valor y la fecha antes de aplicar el cambio. Tus saldos ya quedaron guardados; si te equivocaste al anotarlos, usa «Me equivoqué» y se deshace el chequeo.`;
  const tasaInput=document.getElementById('ctn-tasa');
  if(tasaInput)tasaInput.value=String(r.sugerida).replace('.',',');
  const fechaInput=document.getElementById('ctn-fecha');
  if(fechaInput)fechaInput.value=r.desde;
  openSheet('confirmar-tasa-nu');
}

function confirmarCambioTasaNu(){
  if(!_tasaNuPendiente)return;
  const tasaInput=document.getElementById('ctn-tasa');
  const fechaInput=document.getElementById('ctn-fecha');
  const tasaEditada=nuTasaDesdeTexto(tasaInput?tasaInput.value:'');
  const fechaEditada=(fechaInput&&fechaInput.value)?fechaInput.value:_tasaNuPendiente.desde;
  if(tasaEditada==null){
    if(window.toast)toast('Pon una tasa válida: solo números, con coma o punto decimal (mayor que 0 y hasta 100).','err',3500);
    return;
  }
  registrarTasaNuHistorial(fechaEditada,tasaEditada);
  const el=document.getElementById('nuTasaGlobal');
  if(el)el.value=nuTasaATexto(tasaEditada);
  S.nuRate=tasaEditada;
  save();refresh();
  _renderTasaHistorialTag();
  closeSheet('confirmar-tasa-nu');
  if(window.toast)toast('Tasa actualizada a '+tasaEditada+'% desde '+fechaEditada,'ok',4000);
  _tasaNuPendiente=null;
  _chequeoNuUndo=null;
}

// Verifica y libera CDTs vencidos automáticamente
// Cola de CDTs vencidos pendientes de confirmar (uno a la vez vía sheet 'cobrar-cdt')
let _colaCDTsVencidos=[];

// Detecta CDTs vencidos y los encola para que el usuario confirme el valor REAL
// depositado por Nu (igual que abrirCobrarCDT/confirmarCobrarCDT).
// Ya NO acredita automáticamente el estimado de la app — eso causaba que el
// monto (a veces ligeramente distinto al real) entrara solo, sin que el usuario
// pudiera corregirlo, porque el CDT ya se había borrado del array antes de
// que la pantalla terminara de cargar.
function verificarVencimientosCDT(){
  _colaCDTsVencidos=[];
  (S.cajitas||[]).forEach(c=>{
    (c.cdts||[]).forEach(cdt=>{
      if(cdt.vence){
        // Antes: new Date(cdt.vence+'T00:00:00'). Con una fecha sin padear
        // (ej. '2026-9-26') esto da Invalid Date, y new Date()>=Invalid Date
        // es SIEMPRE false — el CDT nunca se detecta como vencido, ni
        // aparece en la cola para cobrar. Es la otra cara del mismo bug que
        // dejó "Patrimonio visible $0" (ver calcCDT() y _fechaSafe()).
        const vence=_fechaSafe(cdt.vence);
        if(new Date()>=vence){
          _colaCDTsVencidos.push({cajitaId:c.id,cdtId:cdt.id});
        }
      }
    });
  });
  _procesarSiguienteCDTVencido();
}

// Abre el sheet de cobro real para el siguiente CDT vencido en cola (si hay).
function _procesarSiguienteCDTVencido(){
  if(!_colaCDTsVencidos.length)return;
  const {cajitaId,cdtId}=_colaCDTsVencidos[0];
  const c=(S.cajitas||[]).find(x=>x.id===cajitaId);
  const cdt=c&&(c.cdts||[]).find(x=>x.id===cdtId);
  // Si ya no existe (cobrado/editado/borrado entretanto), saltar al siguiente
  if(!c||!cdt){
    _colaCDTsVencidos.shift();
    _procesarSiguienteCDTVencido();
    return;
  }
  abrirCobrarCDT(cajitaId,cdtId,true);
}

/* ───────────────────────────────────────────────────────────────
   SECCIÓN: Nu — cajitas, metas de ahorro y CDTs (UI)
   ─────────────────────────────────────────────────────────────── */
/* ---- METAS DE AHORRO EN CAJITAS ---- */
// meta = { objetivo, inicio, fin, aportes:[{desc,monto}], minimo }
let _metaCajitaId = null;
let _metaAportesTemp = [];

function calcMetaProgreso(c){
  const meta = c.meta;
  if(!meta || !meta.objetivo || !meta.fin) return null;
  const saldo = calcC(c).val;
  const obj = meta.objetivo;
  const hoyStr = hoy();
  const inicio = meta.inicio || hoyStr;
  const fin = meta.fin;
  const totalMeses = Math.max(1, Math.round((_fechaSafe(fin) - _fechaSafe(inicio)) / (1000*60*60*24*30.44)));
  const mesesPasados = Math.max(0, Math.round((_fechaSafe(hoyStr) - _fechaSafe(inicio)) / (1000*60*60*24*30.44)));
  const mesesRestantes = Math.max(0, Math.round((_fechaSafe(fin) - _fechaSafe(hoyStr)) / (1000*60*60*24*30.44)));
  const esperadoHoy = obj * (mesesPasados / totalMeses);
  const cuotaMensual = meta.aportes && meta.aportes.length ? meta.aportes.reduce((a,ap)=>a+(ap.monto||0),0) : (obj / totalMeses);
  const pct = Math.min(100, (saldo / obj) * 100);
  // cuánto falta para llegar a la meta
  const falta = Math.max(0, obj - saldo);
  // cuánto debería haber acumulado ya
  const diferencia = saldo - esperadoHoy; // positivo = adelantado, negativo = atrasado
  return { saldo, obj, pct, falta, cuotaMensual, esperadoHoy, diferencia, mesesRestantes, totalMeses, mesesPasados };
}

function renderMetaProgress(c){
  const p = calcMetaProgreso(c);
  if(!p) return '';
  const estado = p.diferencia >= 0 ? 'ok' : (p.diferencia > -(p.cuotaMensual*0.5) ? 'warn' : 'late');
  const estadoLabels = {ok:'Al día', warn:'Un poco atrás', late:'Atrasado/a'};
  const aportesHtml = c.meta.aportes && c.meta.aportes.length ? c.meta.aportes.map(ap=>`<span class="cajita-meta-aporte-chip">${escHtml(ap.desc)}: ${fmt(ap.monto)}/mes</span>`).join('') : '';
  // saldo mínimo
  const minInfo = c.meta.minimo ? `<div class="nu-min-caja">
    <div class="nu-min-cap">Saldo mínimo configurado</div>
    <div class="nu-fila-sb">
      <span class="nu-min-txt">Mínimo: <b class="nu-b-text">${fmt(c.meta.minimo)}</b></span>
      ${p.saldo < c.meta.minimo ? `<span class="nu-min-bajo">¡Bajo el mínimo! Faltan ${fmt(c.meta.minimo - p.saldo)}</span>` : `<span class="nu-min-ok">OK (${fmt(p.saldo - c.meta.minimo)} sobre el mínimo)</span>`}
    </div>
    ${_calcPrestadoMeta(c.id) > 0 ? `<div class="nu-prestado-aviso">${fmt(_calcPrestadoMeta(c.id))} prestado de esta cajita · Debería haber: ${fmt(p.saldo + _calcPrestadoMeta(c.id))}</div>` : ''}
  </div>` : '';
  return `<div class="cajita-meta-box">
    <div class="cajita-meta-header">
      <span class="cajita-meta-title">Meta: ${fmt(p.obj)}</span>
      <button type="button" ${Events.attr('nu:abrirMetaCajita', c.id)} data-stop-propagation="true" class="nu-link-editar">editar</button>
    </div>
    <div class="cajita-meta-progress"><div class="cajita-meta-fill nu-fill-${estado}" style="width:${p.pct.toFixed(1)}%;"></div></div>
    <div class="nu-meta-pct-fila">
      <span>${p.pct.toFixed(0)}% logrado</span>
      <span>${p.mesesRestantes} ${p.mesesRestantes===1?'mes':'meses'} restantes · ${fmt(p.falta)} por ahorrar</span>
    </div>
    <div class="cajita-meta-stats">
      <div class="cajita-meta-stat"><div class="cajita-meta-stat-label">Cuota/mes</div><div class="cajita-meta-stat-val">${fmt(p.cuotaMensual)}</div></div>
      <div class="cajita-meta-stat"><div class="cajita-meta-stat-label">Esperado hoy</div><div class="cajita-meta-stat-val">${fmt(p.esperadoHoy)}</div></div>
      <div class="cajita-meta-stat"><div class="cajita-meta-stat-label">Estado</div><div class="cajita-meta-stat-val ${estado}">${estadoLabels[estado]}</div></div>
    </div>
    ${aportesHtml ? `<div class="cajita-meta-aporte-row">${aportesHtml}</div>` : ''}
    ${minInfo}
  </div>`;
}

function _calcPrestadoMeta(cajitaId){
  // Suma todos los préstamos pendientes que incluyen esta cajita como fuente
  let total = 0;
  Deudas.lista('favor').forEach(d=>{
    (d.movimientos||[]).forEach(m=>{
      if(m.tipo==='prestamo'){
        // fuente simple
        if(m.fuente && m.fuente === 'cajita:'+cajitaId) total += m.monto;
        // fuente dividida
        if(m.fuentes && Array.isArray(m.fuentes)){
          m.fuentes.forEach(f=>{ if(f.fuente==='cajita:'+cajitaId) total += (f.monto||0); });
        }
      }
      // restar abonos que pueden haber regresado a la cajita
      if(m.tipo==='abono' || m.tipo==='pago-completo'){
        // destino simple
        if(m.destino==='cajita:'+cajitaId) total -= m.monto;
        // destino dividido
        if(m.destinos && Array.isArray(m.destinos)){
          m.destinos.forEach(r=>{ if(r.fuente==='cajita:'+cajitaId) total -= (r.monto||0); });
        }
      }
    });
  });
  return Math.max(0, total);
}

function abrirMetaCajita(cajitaId){
  _metaCajitaId = cajitaId;
  const c = (S.cajitas||[]).find(x=>x.id===cajitaId);
  if(!c) return;
  const meta = c.meta || {};
  document.getElementById('meta_objetivo').value = meta.objetivo ? fmtInput(meta.objetivo) : '';
  document.getElementById('meta_inicio').value = meta.inicio || hoy();
  document.getElementById('meta_fin').value = meta.fin || '';
  document.getElementById('meta_minimo').value = meta.minimo ? fmtInput(meta.minimo) : '';
  _metaAportesTemp = (meta.aportes || []).map(a=>({...a}));
  const wrap = document.getElementById('meta_min_wrap');
  wrap.style.display = meta.minimo ? '' : 'none';
  document.getElementById('btn-toggle-meta-min').innerHTML = meta.minimo ? '<i class="fa-solid fa-chevron-up nu-ico-r4"></i>Ocultar saldo mínimo' : '<i class="fa-solid fa-chevron-down nu-ico-r4"></i>Configurar saldo mínimo';
  document.getElementById('btn-quitar-meta').style.display = meta.objetivo ? '' : 'none';
  _renderMetaAportes();
  _updateMetaCuotaPreview();
  openSheet('meta-cajita');
}

function _renderMetaAportes(){
  const el = document.getElementById('meta_aportes_list');
  if(!el) return;
  el.innerHTML = html`${_metaAportesTemp.map((ap,i)=>html`
    <div class="prest-split-row nu-aporte-fila">
      <input type="text" value="${ap.desc||''}" placeholder="Ej: Papá, Mamá" class="meta-aporte-desc nu-aporte-desc" data-idx="${i}">
      <input type="text" inputmode="decimal" value="${ap.monto?fmtInput(ap.monto):''}" placeholder="$0" class="money-input meta-aporte-monto nu-aporte-monto" data-idx="${i}">
      <button class="prest-split-del" ${raw(Events.attr('nu:metaAporteEliminar', i))}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`)}`;
  // Reemplaza los oninput="_metaAportesTemp[i]..." inline (CSP los bloquea).
  // Un solo listener delegado en el contenedor, enganchado una sola vez —
  // #meta_aportes_list no se recrea entre renders, solo su innerHTML, así
  // que hace falta guard (mismo patrón que sheet._personaHook en
  // deudores-personas.js) para no acumular. A diferencia del bug de
  // renderAttencion() (Inicio), acá el listener no cierra sobre `i` ni
  // sobre `ap` — lee el índice de data-idx en el momento del evento, así
  // que no hay problema de "valor viejo" aunque se enganche una sola vez.
  if(!el._metaAportesHooked){
    el._metaAportesHooked = true;
    el.addEventListener('input', (e)=>{
      const descInput = e.target.closest('.meta-aporte-desc');
      if(descInput){
        const idx = Number(descInput.dataset.idx);
        if(_metaAportesTemp[idx]) _metaAportesTemp[idx].desc = descInput.value;
        return;
      }
      const montoInput = e.target.closest('.meta-aporte-monto');
      if(montoInput){
        const idx = Number(montoInput.dataset.idx);
        if(_metaAportesTemp[idx]){
          _metaAportesTemp[idx].monto = parseMoney(montoInput.value)||0;
          _updateMetaCuotaPreview();
        }
      }
    });
  }
}

// Wrapper con nombre propio para el data-action (antes era un onclick con 3
// sentencias inline: splice + re-render + actualizar preview).
function _metaAporteEliminar(i){
  _metaAportesTemp.splice(i,1);
  _renderMetaAportes();
  _updateMetaCuotaPreview();
}

function _updateMetaCuotaPreview(){
  const obj = parseMoney(document.getElementById('meta_objetivo').value)||0;
  const inicio = document.getElementById('meta_inicio').value;
  const fin = document.getElementById('meta_fin').value;
  const el = document.getElementById('meta_cuota_preview');
  if(!el) return;
  if(!obj || !fin){ el.textContent=''; return; }
  const meses = Math.max(1, Math.round((_fechaSafe(fin) - _fechaSafe(inicio||hoy())) / (1000*60*60*24*30.44)));
  const totalAportes = _metaAportesTemp.reduce((a,ap)=>a+(ap.monto||0),0);
  const cuota = totalAportes || (obj / meses);
  el.textContent = `${meses} meses · cuota estimada: ${fmt(cuota)}/mes${totalAportes&&totalAportes!==cuota?' (suma de tus aportes)':''}`;
}

function guardarMetaCajita(){
  const c = (S.cajitas||[]).find(x=>x.id===_metaCajitaId);
  if(!c){ toast('Cajita no encontrada','err'); return; }
  const obj = parseMoney(document.getElementById('meta_objetivo').value)||0;
  const fin = document.getElementById('meta_fin').value;
  if(!obj){ toast('Ingresa el monto objetivo','err'); return; }
  if(!fin){ toast('Ingresa la fecha límite','err'); return; }
  const minimo = parseMoney(document.getElementById('meta_minimo').value)||0;
  const inicio = document.getElementById('meta_inicio').value || hoy();
  if(!c.meta) c.meta = {};
  c.meta.objetivo = obj;
  c.meta.inicio = inicio;
  c.meta.fin = fin;
  c.meta.aportes = _metaAportesTemp.filter(a=>a.monto>0);
  if(minimo) c.meta.minimo = minimo; else delete c.meta.minimo;
  save();
  closeSheet('meta-cajita');
  refresh();
  toast('Meta guardada','ok');
}

// Migrado desde un onclick inline en index.html (botón #btn-toggle-meta-min,
// sheet meta cajita) — usaba `this` para el botón clickeado; acá se busca
// por id en vez de depender de `this`, para que funcione igual vía
// data-action (ver Events.registerAll más abajo).
function toggleMetaMinWrap(){
  const wrap=document.getElementById('meta_min_wrap');
  const btn=document.getElementById('btn-toggle-meta-min');
  if(!wrap||!btn)return;
  const abierto=wrap.style.display==='none';
  wrap.style.display=abierto?'':'none';
  btn.innerHTML=abierto
    ?'<i class="fa-solid fa-chevron-up nu-ico-r4"></i>Ocultar saldo mínimo'
    :'<i class="fa-solid fa-chevron-down nu-ico-r4"></i>Configurar saldo mínimo';
}

function quitarMetaCajita(){
  const c = (S.cajitas||[]).find(x=>x.id===_metaCajitaId);
  if(!c) return;
  delete c.meta;
  save();
  closeSheet('meta-cajita');
  refresh();
  toast('Meta eliminada','info');
}

// Sección "Préstamo con origen dividido" (togglePrestSplit / _renderPrestSplit /
// _updatePrestSplitResumen) migrada a js/modules/prestado.js — ver docs/prestado.md.

// Muestra un resumen corto ("9,25% hasta 05 jul · 9,30% desde 06 jul") de los últimos
// cambios de tasa registrados.
function _renderTasaHistorialTag(){
  const tag=document.getElementById('nuTasaHistorialTag');
  if(!tag)return;
  const hist=(S.historialTasasNu||[]).slice().sort((a,b)=>a.fecha<b.fecha?-1:1);
  if(!hist.length){tag.textContent='';return;}
  const fmtFecha=f=>{const d=_fechaSafe(f);return d.toLocaleDateString('es-CO',{day:'2-digit',month:'short'}).replace('.','');};
  const partes=hist.slice(-3).map(h=>String(h.tasa).replace('.',',')+'% desde '+fmtFecha(h.fecha));
  tag.textContent=partes.join(' · ');
}

function addCajita(){
  if(!nuTasaConfigurada()){
    toast(_motivoNuSinTasa(),'err',4000);
    const inp=document.getElementById('nuTasaGlobal');
    if(inp)inp.focus();
    return;
  }
  if(!S.cajitas)S.cajitas=[];
  if(S.cajitas.length>=MAX)return;
  const nombre='Cajita '+(S.cajitas.length+1);
  S.cajitas.push({id:uid(),nombre,saldo:0,cdts:[]});
  save();renderCajitas();
  const _newId=S.cajitas[S.cajitas.length-1].id;
  if(window.logCambio)logCambio('Creaste una cajita',nombre,0,'cajita',_newId);
}

async function deleteCajita(id){
  const c=(S.cajitas||[]).find(x=>x.id===id);
  if(!c)return;
  if(c.cdts&&c.cdts.length){
    await dialogo('No se puede eliminar','Esta cajita tiene CDTs activos. Espera a que venzan para eliminarla.','Entendido',false);
    return;
  }
  const saldoActual=calcC(c).val;
  if(saldoActual>0){
    await dialogo('No se puede eliminar','Para eliminar esta cajita primero debes retirar todo el dinero. Saldo actual: '+fmt(saldoActual)+'.','Entendido',false);
    return;
  }
  const tcVinculadas=(S.tarjetasCredito||[]).filter(x=>x.cajitaId===id);
  const msgCajita='¿Seguro que quieres eliminar "'+c.nombre+'"? Esta acción no se puede deshacer.'
    +(tcVinculadas.length?' '+(tcVinculadas.length===1?'La tarjeta "'+tcVinculadas[0].nombre+'" está':'Las tarjetas '+tcVinculadas.map(x=>'"'+x.nombre+'"').join(', ')+' están')+' vinculada'+(tcVinculadas.length===1?'':'s')+' a esta cajita para su pago y quedará'+(tcVinculadas.length===1?'':'n')+' sin cajita asignada.':'');
  const ok=await dialogo('Eliminar cajita',msgCajita,'Eliminar',true);
  if(!ok)return;
  const nombreEl=c.nombre;
  S.cajitas=(S.cajitas||[]).filter(x=>x.id!==id);
  // Desvincular tarjetas que pagaban desde esta cajita — sin esto quedaban
  // apuntando a una cajita fantasma (mismo espíritu que eliminarTC con tcMovimientos).
  if(tcVinculadas.length) tcVinculadas.forEach(x=>{x.cajitaId=null;});
  save();refresh();
  toast('Cajita eliminada','info');
  if(window.logCambio)logCambio('Eliminaste cajita "'+nombreEl+'"','',0,'eliminar');
}

let _cdtCajitaId=null;
// Interruptor ÚNICO del sheet "crear-cdt": null = crear; con un id = editar ese CDT. El botón del sheet
// tiene UN solo listener (confirmarSheetCDT) que mira esta variable. Antes el modo edición le sumaba un
// segundo handler con `btn.onclick`, y al guardar corrían los dos: confirmarCrearCDT() (que exige saldo en la
// cajita y, con saldo, creaba un CDT duplicado descontándolo) y guardarCDT().
let _cdtEditId=null;

// Pinta el sheet para crear (editando=false) o editar (true): título, texto, botón, y qué campos aplican.
// En edición el capital NO se puede cambiar (la plata ya está en el CDT) y no tiene sentido mostrar el
// saldo disponible ni "Invertir todo".
function _cdtModoSheet(editando){
  const set=(id,fn)=>{const el=document.getElementById(id);if(el)fn(el);};
  set('cdtSheetTitle',e=>{e.textContent=editando?'Editar CDT':'Crear CDT en cajita';});
  set('cdtDesc',e=>{e.textContent=editando
    ?'El capital ya está invertido y no cambia. Puedes corregir la tasa, las fechas y la retención; el valor del CDT se recalcula.'
    :'La plata sale de la cajita y queda bloqueada en el CDT hasta la fecha de vencimiento. Al vencer, regresa con los intereses generados.';});
  set('cdtDisponibleBox',e=>{e.style.display=editando?'none':'';});
  set('btn-cdt-invertir-todo',e=>{e.style.display=editando?'none':'';});
  set('cdtMontoLabel',e=>{e.textContent=editando?'Capital invertido (no se puede cambiar)':'Monto a invertir (mín. $50.000)';});
  set('cdt_monto',e=>{e.readOnly=editando;});
  set('btn-confirmar-crear-cdt',e=>{e.textContent=editando?'Guardar cambios':'Crear CDT';});
}

function confirmarSheetCDT(){
  if(_cdtEditId)guardarCDT(_cdtCajitaId,_cdtEditId);
  else confirmarCrearCDT();
}

function abrirCrearCDT(cajitaId){
  _cdtCajitaId=cajitaId;
  _cdtEditId=null;
  _cdtModoSheet(false);
  const c=(S.cajitas||[]).find(x=>x.id===cajitaId);
  if(!c)return;
  const k=calcC(c);
  document.getElementById('cdtCajitaSaldo').textContent=fmt(k.val);
  document.getElementById('cdt_monto').value='';
  document.getElementById('cdt_tasa').value=nuTasaConfigurada()?nuTasaATexto(S.nuRate):''; // precarga la tasa global; cada CDT guarda la suya
  document.getElementById('cdt_inicio').value=hoy();
  document.getElementById('cdt_vence').value='';
  document.getElementById('cdt_rte').value='4,00';
  document.getElementById('cdt_preview').textContent='';
  // Botón invertir todo
  const btnInv=document.getElementById('btn-cdt-invertir-todo');
  if(btnInv){
    btnInv.onclick=function(){
      const saldo=calcC((S.cajitas||[]).find(x=>x.id===_cdtCajitaId)||{}).val||0;
      document.getElementById('cdt_monto').value=fmtInput(saldo);
      document.getElementById('cdt_monto').dispatchEvent(new Event('input',{bubbles:true}));
    };
  }
  openSheet('crear-cdt');
}

// Reglas de los campos de un CDT (tasa, retención, fechas): UNA sola vez, para crear (confirmarCrearCDT) y
// para editar (guardarCDT). Pura: no lee el DOM ni muestra avisos; recibe los textos del formulario.
//  · tasa:   vacía → tasaDefecto; si no, un número > 0 (lo que lea parsePct).
//  · rte:    vacía → rteDefecto; si no, número 0–100 con punto o coma (0 es válido; texto o negativo se rechaza).
//  · inicio: vacío → inicioDefecto; no puede ser futuro.
//  · vence:  obligatoria y posterior a la apertura.
// Devuelve {ok:true, tasa, rte, inicio, vence} o {ok:false, mensaje}. `ahora` solo existe para poder probarla.
function validarCamposCDT(o,ahora){
  const err=mensaje=>({ok:false,mensaje});
  const txt=v=>(v==null?'':String(v)).trim();
  const tasaRaw=txt(o.tasa);
  const tasa=tasaRaw===''?o.tasaDefecto:parsePct(tasaRaw);
  if(!(tasa>0))return err('La tasa (EA) debe ser un número mayor que 0');
  const rteRaw=txt(o.rte);
  if(rteRaw!==''&&!/^\d+([.,]\d+)?$/.test(rteRaw))return err('La retención (RTE) no es un número válido');
  const rte=rteRaw===''?o.rteDefecto:parsePct(rteRaw);
  if(rte>100)return err('La retención (RTE) no puede pasar de 100 %');
  const inicio=o.inicio||o.inicioDefecto;
  const vence=o.vence;
  if(_fechaSafe(inicio)>(ahora||new Date()))return err('La fecha de apertura no puede ser futura');
  if(!vence)return err('Debes definir la fecha de vencimiento');
  if(_fechaSafe(vence)<=_fechaSafe(inicio))return err('La fecha de vencimiento debe ser posterior a la apertura');
  return{ok:true,tasa,rte,inicio,vence};
}

function confirmarCrearCDT(){
  const c=(S.cajitas||[]).find(x=>x.id===_cdtCajitaId);
  if(!c){toast('Cajita no encontrada','err');return;}
  const monto=parseMoney(document.getElementById('cdt_monto').value)||0;
  // Tasa, RTE y fechas: validarCamposCDT (mismas reglas que al editar). Vacío = tasa 9,25 y RTE 4 (valores por
  // defecto del formulario); la RTE 0 es válida.
  const v=validarCamposCDT({
    tasa:document.getElementById('cdt_tasa').value, rte:document.getElementById('cdt_rte').value,
    inicio:document.getElementById('cdt_inicio').value, vence:document.getElementById('cdt_vence').value,
    tasaDefecto:9.25, rteDefecto:4, inicioDefecto:hoy()
  });
  if(!v.ok){toast(v.mensaje,'err');return;}
  const {tasa,rte,inicio,vence}=v;
  if(monto<50000){toast('El monto mínimo para un CDT es $50.000','err');return;}
  // Calcular saldo real incluyendo intereses sub-día (lo mismo que muestra el modal)
  const saldoReal=calcC(c).val;
  // Tolerancia de 1 centavo: fmtInput() redondea el saldo mostrado (p.ej. al usar
  // "Invertir todo"), mientras que el saldo interno puede tener precisión de
  // sub-centavo. Sin esta tolerancia, "invertir todo" podía fallar por diferencias
  // de fracción de centavo que no son un déficit real.
  if(monto>saldoReal+0.01){toast(`Saldo insuficiente. Solo tienes ${fmt(saldoReal)} en la cajita.`,'err');return;}
  const montoFinal=Math.min(monto,saldoReal);
  // Materializar los intereses acumulados y descontar el monto del CDT
  ajustarSaldoCuenta('cajita:'+c.id,saldoReal,{tipo:'rendimiento',desc:'Intereses de Nu',origen:{modulo:'cuentas'}});
  c.fecha=hoy();
  ajustarSaldoCuenta('cajita:'+c.id,c.saldo-montoFinal,{tipo:'cdt',desc:'Capital invertido en CDT',origen:{modulo:'cuentas'}});
  // Agregar CDT al array de CDTs de la cajita
  if(!c.cdts)c.cdts=[];
  c.cdts.push({id:uid(),monto:montoFinal,tasa,rte,inicio,vence});
  _cdtEditId=null;
  save();
  closeSheet('crear-cdt');
  refresh();
  if(window.logCambio)logCambio('Invertiste en un CDT en "'+c.nombre+'"',fmt(montoFinal)+' al '+String(tasa).replace('.',',')+' % EA · vence '+vence,montoFinal,'ahorro',c.id);
  toast(`CDT creado por ${fmt(montoFinal)} al ${String(tasa).replace('.',',')}% EA — se libera el ${vence}`,'ok',4000);
}

async function liberarCDTManual(cajitaId,cdtId){
  const c=(S.cajitas||[]).find(x=>x.id===cajitaId);
  if(!c)return;
  const cdt=(c.cdts||[]).find(x=>x.id===cdtId);
  if(!cdt)return;
  const k=calcCDT(cdt);
  const ok=await dialogo('Cerrar CDT','Se cierra el CDT y los '+fmt(k.val)+' (capital '+fmt(cdt.monto)+' + '+fmt(k.ganado)+' de intereses netos) se suman al saldo de la cajita "'+c.nombre+'".','Cerrar y acreditar',false);
  if(!ok)return;
  materializarIntereses(c);
  ajustarSaldoCuenta('cajita:'+c.id,(c.saldo||0)+k.val,{tipo:'cdt',desc:'CDT cerrado (capital + intereses)',origen:{modulo:'cuentas',ref:cdtId}});
  c.fecha=hoy();
  c.cdts=(c.cdts||[]).filter(x=>x.id!==cdtId);
  refresh();save();
  if(window.logCambio)logCambio('Cerraste CDT en "'+c.nombre+'"','Capital '+fmt(cdt.monto)+' + intereses acreditados',k.val,'ingreso',c.id);
  toast(`CDT cerrado — ${fmt(k.val)} acreditados a "${escHtml(c.nombre)}"`,'ok',4000);
}


let _cobrarCajitaId=null, _cobrarCdtId=null;

function abrirCobrarCDT(cajitaId,cdtId,esVencimientoAuto){
  const c=(S.cajitas||[]).find(x=>x.id===cajitaId);
  if(!c)return;
  const cdt=(c.cdts||[]).find(x=>x.id===cdtId);
  if(!cdt)return;
  const k=calcCDT(cdt);
  _cobrarCajitaId=cajitaId;
  _cobrarCdtId=cdtId;
  document.getElementById('cobrar_estimado').textContent=fmt(k.val);
  document.getElementById('cobrar_detalle_est').textContent=
    'Capital '+fmt(cdt.monto)+' + '+fmt(k.ganado)+' netos (RTE '+fmt(k.retencion)+')';
  // Título y aviso del sheet: si viene del chequeo automático de vencimientos,
  // aclaramos que el CDT ya venció y se necesita el valor real antes de acreditar.
  const tituloEl=document.querySelector('#sheet-cobrar-cdt .sheet-title');
  if(tituloEl)tituloEl.textContent=esVencimientoAuto
    ?'CDT "'+c.nombre+'" venció'
    :'Cobrar CDT vencido';
  const inp=document.getElementById('cobrar_valor');
  inp.value='';
  document.getElementById('cobrar_diff').textContent='';
  // Preview de diferencia en tiempo real
  inp.oninput=()=>{
    const v=parseMoney(inp.value);
    const diff=document.getElementById('cobrar_diff');
    if(!v||isNaN(v)){diff.textContent='';return;}
    const d=v-k.val;
    const abs=Math.abs(d).toFixed(2);
    if(Math.abs(d)<0.01){diff.innerHTML='<i class="fa-solid fa-check nu-ico-r4"></i>Coincide exacto con el estimado';diff.style.color='var(--accent)';}
    else if(d>0){diff.textContent='↑ +$'+abs.replace('.',',') +' más que el estimado';diff.style.color='var(--purple)';}
    else{diff.textContent='↓ −$'+abs.replace('.',',')+' menos que el estimado';diff.style.color='var(--text3)';}
  };
  openSheet('cobrar-cdt');
}

async function confirmarCobrarCDT(){
  const cajitaId=_cobrarCajitaId, cdtId=_cobrarCdtId;
  const c=(S.cajitas||[]).find(x=>x.id===cajitaId);
  if(!c)return;
  const cdt=(c.cdts||[]).find(x=>x.id===cdtId);
  if(!cdt)return;
  const valorReal=parseMoney(document.getElementById('cobrar_valor').value);
  if(!valorReal||valorReal<=0){toast('Pon el valor real que te depositó Nu','err');return;}
  if(valorReal<cdt.monto){toast('El valor no puede ser menor al capital invertido','err');return;}
  const ok=await dialogo('Cobrar CDT',
    fmt(valorReal)+' se acreditarán a la cajita "'+c.nombre+'". Este valor reemplaza el estimado de la app.',
    'Confirmar cobro',false);
  if(!ok)return;
  materializarIntereses(c);
  ajustarSaldoCuenta('cajita:'+c.id,(c.saldo||0)+valorReal,{tipo:'cdt',desc:'CDT cobrado (valor real de Nu)',origen:{modulo:'cuentas',ref:cdtId}});
  c.fecha=hoy();
  c.cdts=(c.cdts||[]).filter(x=>x.id!==cdtId);
  closeSheet('cobrar-cdt');
  refresh();save();
  if(window.logCambio)logCambio('Cobraste CDT de "'+c.nombre+'"','Valor real acreditado a la cajita',valorReal,'ingreso',c.id);
  toast('CDT cobrado — '+fmt(valorReal)+' acreditados a "'+escHtml(c.nombre)+'"','ok',4000);
  // Si este CDT venía de la cola de vencimientos automáticos, sacarlo y seguir
  // con el siguiente pendiente (si hay más vencidos esperando confirmación).
  if(_colaCDTsVencidos.length&&_colaCDTsVencidos[0].cajitaId===cajitaId&&_colaCDTsVencidos[0].cdtId===cdtId){
    _colaCDTsVencidos.shift();
    setTimeout(_procesarSiguienteCDTVencido,400);
  }
}

// Si el usuario cancela el sheet de "Cobrar CDT" sin confirmar:
// - El CDT sigue en S.cdts con fecha vencida (volverá a preguntarse después).
// - Si hay más CDTs vencidos en cola, mostramos el siguiente (no nos quedamos
//   atorados esperando que el usuario abra el sheet manualmente).
function _cancelarCobrarCDT(){
  if(_colaCDTsVencidos.length){
    const {cajitaId,cdtId}=_colaCDTsVencidos[0];
    if(cajitaId===_cobrarCajitaId&&cdtId===_cobrarCdtId){
      _colaCDTsVencidos.shift();
      setTimeout(_procesarSiguienteCDTVencido,400);
    }
  }
}

async function editarCDT(cajitaId,cdtId){
  const ok=await dialogo('Editar CDT','Los CDTs están diseñados para no tocarse. Editar puede cambiar los intereses calculados. ¿Estás seguro?','Editar de todas formas',true);
  if(!ok)return;
  const c=(S.cajitas||[]).find(x=>x.id===cajitaId);
  if(!c)return;
  const cdt=(c.cdts||[]).find(x=>x.id===cdtId);
  if(!cdt)return;
  // Reutiliza el sheet de creación en modo edición (ver _cdtModoSheet): el botón no se re-cablea.
  _cdtCajitaId=cajitaId;
  _cdtEditId=cdtId;
  _cdtModoSheet(true);
  document.getElementById('cdt_monto').value=fmtInput(cdt.monto);
  document.getElementById('cdt_tasa').value=String(cdt.tasa).replace('.',',');
  document.getElementById('cdt_inicio').value=cdt.inicio||hoy();
  document.getElementById('cdt_vence').value=cdt.vence||'';
  document.getElementById('cdt_rte').value=cdt.rte!=null?String(cdt.rte).replace('.',','):'4';
  document.getElementById('cdt_preview').textContent='';
  document.getElementById('cdt_tasa').dispatchEvent(new Event('input',{bubbles:true})); // preview con los valores actuales
  openSheet('crear-cdt');
}

// Guarda los cambios de un CDT existente. SOLO toca tasa, fechas y retención: el capital (cdt.monto) y el
// saldo de la cajita no se tocan, así que no depende del saldo disponible. Los campos se validan con
// validarCamposCDT, igual que al crear.
function guardarCDT(cajitaId,cdtId){
  const c=(S.cajitas||[]).find(x=>x.id===cajitaId);
  if(!c){toast('Cajita no encontrada','err');return;}
  const cdt=(c.cdts||[]).find(x=>x.id===cdtId);
  if(!cdt){toast('Ese CDT ya no existe','err');return;}
  const v=validarCamposCDT({
    tasa:document.getElementById('cdt_tasa').value, rte:document.getElementById('cdt_rte').value,
    inicio:document.getElementById('cdt_inicio').value, vence:document.getElementById('cdt_vence').value,
    tasaDefecto:cdt.tasa, rteDefecto:cdt.rte!=null?cdt.rte:4, inicioDefecto:cdt.inicio||hoy() // vacío = conserva el valor actual
  });
  if(!v.ok){toast(v.mensaje,'err');return;}
  cdt.tasa=v.tasa;
  cdt.rte=v.rte;
  cdt.inicio=v.inicio;
  cdt.vence=v.vence;
  _cdtEditId=null;
  _cdtModoSheet(false);
  save();
  closeSheet('crear-cdt');
  refresh();
  if(window.logCambio)logCambio('Editaste CDT en "'+c.nombre+'"','Tasa o fechas modificadas',0,'editar',cajitaId);
  toast('CDT actualizado','ok',3000);
}

function renderCajitas(){
  actualizarBotonesNu(); // depende solo de S: se evalúa antes de los retornos de abajo
  const el=document.getElementById('cajitasList');
  const msg=document.getElementById('cajitasMsg');
  const btn=document.getElementById('btnAddCajita');
  const cajitas=S.cajitas||[];
  if(!cajitas.length){
    el.innerHTML='<div class="nu-vacio">Sin cajitas. Agrega tu primera cajita de Nu — empieza en $0 y crece sola.</div>';
    msg.textContent='';btn.style.display='';return;
  }
  el.innerHTML=html`${cajitas.map(c=>{
    const k=calcC(c);
    const cdts=c.cdts||[];
    const hasCDTs=cdts.length>0;
    const totalCDT=cdts.reduce((a,cdt)=>a+calcCDT(cdt).val,0);
    const tasaDisplay=getNuTasaGlobal();
    // El interés diario se calcula sobre la base completa (saldo propio + encargos en la cajita)
    const _baseInteresRender=k.val+(k.saldoEncargos||0);
    const interesHoy=_baseInteresRender>0?(_baseInteresRender*(Math.pow(1+tasaDisplay/100,1/365)-1)):0;
    const hasMeta=!!(c.meta&&c.meta.objetivo);
    const metaPct=hasMeta?Math.min(100,(k.val/c.meta.objetivo)*100):0;
    // Badges indicadores
    const cdtBadge=hasCDTs?html`<span class="nu-badge-cdt"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>${cdts.length===1?fmt(totalCDT):cdts.length+' CDTs'}</span>`:'';
    const metaBadge=hasMeta?html`<span class="nu-badge-meta">${metaPct.toFixed(0)}%</span>`:'';
    return html`<div class="cajita-row-hover nu-cajita-fila" id="cajita-row-${c.id}" ${raw(Events.attr('nu:abrirDetalleCajita', c.id))}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--nu-light)" stroke-width="2" stroke-linecap="round" class="nu-no-shrink"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>
      <div class="nu-cajita-cuerpo">
        <div class="nu-cajita-nombre">${c.nombre}</div>
        ${interesHoy>0.1?html`<div class="nu-cajita-dia">+${fmt(interesHoy)}/día</div>`:''}
      </div>
      <div class="nu-cajita-badges">${cdtBadge}${metaBadge}</div>
      <div class="nu-cajita-der">
        <div class="nu-cajita-saldo">${fmt(k.val)}</div>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2.5" stroke-linecap="round" class="nu-no-shrink"><polyline points="9 18 15 12 9 6"/></svg>
    </div>`;
  })}`;
  if(cajitas.length>=MAX){msg.innerHTML=html`<div class="cajita-limit-msg">Límite alcanzado (${MAX}/${MAX})</div>`;btn.style.display='none';}
  else{msg.innerHTML=html`<div class="cajita-limit-msg">${cajitas.length}/${MAX} cajitas</div>`;btn.style.display='';}
}

/* ══ PANTALLA DE NU (detalle de la cuenta) ══
   Lo que cuentas.js le pide a una cuenta con pantalla propia (ver CuentaPantallas en core-state.js). */
function renderDetalleNu(){
  // Color, título y rótulo salen del descriptor de Nu, igual que el detalle simple: el color llega por
  // --cuenta / --cuenta-rgb sobre #cuentas-detalle-nu y los estilos .cuenta-hero / .cuenta-action-btn lo usan.
  const dNu=_descriptorCuenta('nu');
  const contNu=document.getElementById('cuentas-detalle-nu');
  if(dNu&&contNu){
    contNu.style.setProperty('--cuenta',dNu.color);
    contNu.style.setProperty('--cuenta-rgb',dNu.rgb);
    document.getElementById('det-nu-nombre').innerHTML=_tituloCuentaHtml(dNu);
    document.getElementById('det-nu-label').textContent=dNu.etiquetaDetalle;
  }
  // Cajitas
  renderCajitas();
  // Encargos en Nu (cualquier cajita)
  if(typeof renderEncargosEnCuenta==='function') renderEncargosEnCuenta('det-nu-encargos','nu');
  // Movimientos Nu (cajitas)
  renderMovsCuenta('det-nu-movs',getMovimientosCuenta('nu'),dNu?dNu.color:'var(--nu-light)','nu');
}

// Pantalla Nu: activo si alguna cajita (no CDT) tiene saldo movible; y el "Mover" de la cajita abierta.
function _nuActualizarBotonesTransferir(){
  const hayNu=(S.cajitas||[]).some(c=>!c.esCDT&&FuentesFiltro.puedeMover('cajita:'+c.id));
  _setBtnTransferir(document.getElementById('btn-transferir-nu-det'),hayNu);
  if(_cajitaActualId) _setBtnTransferir(document.getElementById('cajita-det-mover'),FuentesFiltro.puedeMover('cajita:'+_cajitaActualId));
}

CuentaPantallas.nu={
  paneles:['cuentas-detalle-nu','cuentas-detalle-cajita','cuentas-sub-meta','cuentas-sub-cdts'],
  panel:'cuentas-detalle-nu',
  reiniciar:()=>{_cajitaActualId=null;},
  render:renderDetalleNu,
  actualizarBotones:_nuActualizarBotonesTransferir,
};

/* ══ NAVEGACIÓN CAJITA DETAIL ══ */
let _cajitaActualId = null;

function volverANu(){
  _cajitaActualId = null;
  renderCajitas();
  _showCuentasPanel('cuentas-detalle-nu');
}

function volverADetalleCajita(){
  const c=(S.cajitas||[]).find(x=>x.id===_cajitaActualId);
  if(c) _renderDetalleCajita(c);
  _showCuentasPanel('cuentas-detalle-cajita');
}

function abrirDetalleCajita(cajitaId){
  const c=(S.cajitas||[]).find(x=>x.id===cajitaId);
  if(!c) return;
  _cajitaActualId = cajitaId;
  _renderDetalleCajita(c);
  _showCuentasPanel('cuentas-detalle-cajita');
}

function _renderDetalleCajita(c){
  if(!c) c=(S.cajitas||[]).find(x=>x.id===_cajitaActualId);
  if(!c) return;
  // El color de una cajita es el de Nu: llega por --cuenta / --cuenta-rgb (como en los detalles de cuenta) a
  // .cuenta-hero, al título y al campo de nombre. Todas las rutas al detalle de cajita pasan por acá.
  const _dNuCaj=_descriptorCuenta('nu'), _pCaj=document.getElementById('cuentas-detalle-cajita');
  if(_dNuCaj&&_pCaj){_pCaj.style.setProperty('--cuenta',_dNuCaj.color);_pCaj.style.setProperty('--cuenta-rgb',_dNuCaj.rgb);}
  const k=calcC(c);
  const tasaDisplay=getNuTasaGlobal();
  // Interés diario sobre la base completa (saldo propio + encargos en la cajita)
  const _baseInteresDet=k.val+(k.saldoEncargos||0);
  const interesHoy=_baseInteresDet>0?(_baseInteresDet*(Math.pow(1+tasaDisplay/100,1/365)-1)):0;
  const cdts=c.cdts||[];
  const hasCDTs=cdts.length>0;
  const totalCDT=cdts.reduce((a,cdt)=>a+calcCDT(cdt).val,0);
  const hasMeta=!!(c.meta&&c.meta.objetivo);

  // Nombre en header
  document.getElementById('cajita-det-nombre').textContent=c.nombre;
  // Saldo hero
  document.getElementById('cajita-det-saldo').textContent=fmt(k.val);
  document.getElementById('cajita-det-interes').textContent=interesHoy>0.1?'+'+fmt(interesHoy)+'/día · '+String(tasaDisplay).replace('.',',')+'% EA':'';
  // Input nombre editable — sync con el campo
  const nameInput=document.getElementById('cajita-det-name-input');
  if(nameInput){
    nameInput.value=c.nombre;
    let _renameTimer=null;
    let _nombreAntes=c.nombre;
    nameInput.oninput=()=>{
      c.nombre=nameInput.value;
      document.getElementById('cajita-det-nombre').textContent=nameInput.value;
      save();
      clearTimeout(_renameTimer);
      _renameTimer=setTimeout(()=>{
        if(nameInput.value&&nameInput.value!==_nombreAntes){
          if(window.logCambio)logCambio('Renombraste cajita a "'+nameInput.value+'"',_nombreAntes?'antes: '+_nombreAntes:'',0,'editar',c.id);
          _nombreAntes=nameInput.value;
        }
      },1200);
    };
  }

  // Botones acción
  document.getElementById('cajita-det-agregar').onclick=()=>abrirAgregarDinero('cajita:'+c.id, c.nombre);
  document.getElementById('cajita-det-retirar').onclick=()=>abrirRestarDinero('cajita:'+c.id, c.nombre);
  actualizarBotonRetirar(document.getElementById('cajita-det-retirar'), 'cajita:'+c.id);
  document.getElementById('cajita-det-mover').onclick=()=>abrirTransferir('cajita:'+c.id);
  actualizarBotonesTransferir();

  // Card Meta preview
  const metaPreview=document.getElementById('cajita-det-meta-preview');
  const metaBarWrap=document.getElementById('cajita-det-meta-bar-wrap');
  const metaBar=document.getElementById('cajita-det-meta-bar');
  if(hasMeta){
    const pct=Math.min(100,(k.val/c.meta.objetivo)*100);
    metaPreview.textContent=fmt(c.meta.objetivo)+' · '+pct.toFixed(0)+'% logrado';
    metaPreview.style.color='var(--accent)';
    metaBarWrap.style.display='';
    metaBar.style.width=pct.toFixed(1)+'%';
  } else {
    metaPreview.textContent='Toca para configurar una meta';
    metaPreview.style.color='var(--text3)';
    metaBarWrap.style.display='none';
  }

  // Card CDTs preview
  const cdtPreview=document.getElementById('cajita-det-cdt-preview');
  if(hasCDTs){
    cdtPreview.textContent=cdts.length+' CDT'+(cdts.length>1?'s':'')+' · '+fmt(totalCDT)+' bloqueado';
    cdtPreview.style.color='var(--purple)';
  } else {
    cdtPreview.textContent='Toca para crear un CDT';
    cdtPreview.style.color='var(--text3)';
  }
}

async function _cajitaDetDelete(){
  if(!_cajitaActualId) return;
  await deleteCajita(_cajitaActualId);
  // Si se eliminó, volver a Nu
  const aun=(S.cajitas||[]).find(x=>x.id===_cajitaActualId);
  if(!aun){ _cajitaActualId=null; _showCuentasPanel('cuentas-detalle-nu'); }
}

/* ── Sub-pantalla: Meta ── */
function abrirSubMeta(){
  const c=(S.cajitas||[]).find(x=>x.id===_cajitaActualId);
  if(!c) return;
  const el=document.getElementById('sub-meta-content');
  const p=calcMetaProgreso(c);
  if(!p){
    // Sin meta — mostrar formulario rápido
    el.innerHTML=html`<div class="card nu-meta-vacia">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" class="nu-mb12"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <div class="nu-meta-vacia-titulo">Sin meta configurada</div>
      <div class="nu-meta-vacia-txt">Define un objetivo de ahorro para esta cajita y lleva el seguimiento mes a mes.</div>
      <button type="button" class="btn btn-primary" ${raw(Events.attr('nu:abrirMetaCajita', c.id))}>Configurar meta</button>
    </div>`;
  } else {
    const estadoLabels={ok:'Al día',warn:'Un poco atrás',late:'Atrasado/a'};
    const estado=p.diferencia>=0?'ok':(p.diferencia>-(p.cuotaMensual*0.5)?'warn':'late');
    const aportesHtml=c.meta.aportes&&c.meta.aportes.length?html`${c.meta.aportes.map(ap=>html`<span class="cajita-meta-aporte-chip">${ap.desc}: ${fmt(ap.monto)}/mes</span>`)}`:'';
    const minimoHtml=c.meta.minimo?html`<div class="nu-min-caja-lg">
      <div class="nu-min-cap-lg">Saldo mínimo</div>
      <div class="nu-fila-sb">
        <span class="nu-min-txt-12">Mínimo: <b class="nu-b-text">${fmt(c.meta.minimo)}</b></span>
        ${p.saldo<c.meta.minimo?html`<span class="nu-min-bajo-11">¡Bajo! −${fmt(c.meta.minimo-p.saldo)}</span>`:html`<span class="nu-min-ok-11">OK +${fmt(p.saldo-c.meta.minimo)}</span>`}
      </div>
    </div>`:'';
    el.innerHTML=html`
      <div class="card nu-meta-card">
        <div class="nu-meta-cab">
          <div>
            <div class="nu-meta-obj">${fmt(p.obj)}</div>
            <div class="nu-meta-obj-etq">Objetivo</div>
          </div>
          <span class="badge nu-estado-${estado}">${estadoLabels[estado]}</span>
        </div>
        <div class="nu-meta-barra">
          <div class="nu-meta-fill nu-fill-${estado}" style="width:${p.pct.toFixed(1)}%;"></div>
        </div>
        <div class="nu-meta-pie">
          <span>${p.pct.toFixed(0)}% logrado · ${fmt(p.saldo)} ahorrado</span>
          <span>Faltan ${fmt(p.falta)}</span>
        </div>
        <div class="nu-meta-stats ${aportesHtml||minimoHtml?'nu-mb12':'nu-mb0'}">
          <div class="cajita-meta-stat"><div class="cajita-meta-stat-label">Cuota/mes</div><div class="cajita-meta-stat-val">${fmt(p.cuotaMensual)}</div></div>
          <div class="cajita-meta-stat"><div class="cajita-meta-stat-label">Esperado hoy</div><div class="cajita-meta-stat-val">${fmt(p.esperadoHoy)}</div></div>
          <div class="cajita-meta-stat"><div class="cajita-meta-stat-label">Meses rest.</div><div class="cajita-meta-stat-val">${p.mesesRestantes}</div></div>
        </div>
        ${aportesHtml?html`<div class="cajita-meta-aporte-row nu-chq-campo">${aportesHtml}</div>`:''}
        ${minimoHtml}
      </div>
      <button type="button" class="btn btn-ghost nu-mb8" ${raw(Events.attr('nu:abrirMetaCajita', c.id))}>Editar meta</button>
      <button type="button" class="btn btn-ghost nu-btn-peligro" ${raw(Events.attr('nu:quitarMetaCajita'))}>Eliminar meta</button>`;
  }
  _showCuentasPanel('cuentas-sub-meta');
}

/* ── Sub-pantalla: CDTs ── */
function abrirSubCDTs(){
  const c=(S.cajitas||[]).find(x=>x.id===_cajitaActualId);
  if(!c) return;
  const el=document.getElementById('sub-cdts-content');
  const cdts=c.cdts||[];
  const saldoDisp=calcC(c).val;
  let contenido='';
  if(!cdts.length){
    contenido=html`<div class="card nu-cdt-vacio">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" stroke-width="1.5" stroke-linecap="round" class="nu-mb12"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
      <div class="nu-meta-vacia-titulo">Sin CDTs activos</div>
      <div class="nu-meta-vacia-txt">Bloquea parte del saldo de esta cajita como CDT y gana intereses mientras esperas el vencimiento.</div>
    </div>`;
  } else {
    contenido=html`${cdts.map(cdt=>{
      const cdtK=calcCDT(cdt);
      const dr=cdt.vence?Math.ceil((_fechaSafe(cdt.vence)-new Date())/86400000):null;
      const vencido=dr!==null&&dr<=0;
      return html`<div class="card nu-cdt-card">
        <div class="nu-cdt-cab">
          <div>
            <div class="nu-cdt-val">${fmt(cdtK.val)}</div>
            <div class="nu-meta-obj-etq">Capital: ${fmt(cdt.monto)} · +${fmt(cdtK.ganado)} netos · ${String(cdt.tasa).replace('.',',')}% EA</div>
            ${cdtK.retencion>0.01?html`<div class="nu-cdt-rte">RTE ${cdt.rte!=null?cdt.rte:4}%: −${fmt(cdtK.retencion)}</div>`:''}
          </div>
          ${dr!==null?html`<span class="badge ${vencido?'bg-red':'bg-purple'}">${vencido?'¡Venció!':dr+'d'}</span>`:''}
        </div>
        <div class="nu-cdt-grid">
          <div class="nu-cdt-celda">
            <div class="nu-cdt-cap">Apertura</div>
            <div class="nu-cdt-dato">${cdt.inicio||'—'}</div>
          </div>
          <div class="nu-cdt-celda">
            <div class="nu-cdt-cap">Vence</div>
            <div class="nu-cdt-dato">${cdt.vence||'—'}</div>
          </div>
        </div>
        <div class="nu-cdt-btns">
          <button type="button" class="btn btn-ghost btn-sm nu-flex1" ${raw(Events.attr('nu:editarCDT', c.id, cdt.id))}>Editar</button>
          ${vencido
            ? html`<button type="button" class="btn btn-sm nu-btn-cobrar" ${raw(Events.attr('nu:abrirCobrarCDT', c.id, cdt.id))}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="nu-ico-chk"><polyline points="20 6 9 17 4 12"/></svg>
            Cobrar CDT
          </button>`
            : html`<button type="button" class="btn btn-sm nu-btn-reinvertir" ${raw(Events.attr('nu:liberarCDTManual', c.id, cdt.id))}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="nu-ico-chk"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/><circle cx="12" cy="16" r="1" fill="currentColor"/></svg>
            Cerrar CDT
          </button>`}
        </div>
      </div>`;
    })}`;
  }
  contenido=html`${contenido}<button type="button" class="btn btn-ghost ${cdts.length?'nu-mt4':'nu-mt0'}" ${raw(Events.attr('nu:abrirCrearCDT', c.id))}>
    <span class="nu-btn-crear-ico">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      ${cdts.length?'Agregar otro CDT':'Crear CDT'}
    </span>
  </button>
  <div class="nu-disp">Disponible en cajita: ${fmt(saldoDisp)}</div>`;
  el.innerHTML=contenido;
  _showCuentasPanel('cuentas-sub-cdts');
}

// Cuando se guarde/refresh, actualizar el detalle de cajita si está abierto
function _refreshCajitaDet(){
  // Usar _cajitaActualId, o _metaCajitaId como fallback (cuando se abre meta desde lista)
  const idActual = _cajitaActualId || _metaCajitaId;
  if(!idActual) return;
  const c=(S.cajitas||[]).find(x=>x.id===idActual);
  if(!c) return;
  const panel=document.getElementById('cuentas-detalle-cajita');
  if(panel&&panel.style.display!=='none') _renderDetalleCajita(c);
  const subMeta=document.getElementById('cuentas-sub-meta');
  if(subMeta&&subMeta.style.display!=='none') abrirSubMeta();
  const subCDTs=document.getElementById('cuentas-sub-cdts');
  if(subCDTs&&subCDTs.style.display!=='none') abrirSubCDTs();
}

/* ---- ENTRÓ / SALIÓ PLATA EN NU ---- */
let _nuMovTipo = 'entrada'; // 'entrada' | 'salida'
let _nuMovCajitaSel = null; // fuente seleccionada: 'cajita:id'

function abrirNuMovimiento(tipo) {
  const motivo = _motivoNuMovimiento(tipo);
  if (motivo) { toast(motivo, 'err', 4000); return; } // los botones ya salen deshabilitados; esto cubre cualquier otra vía
  save();
  _nuMovTipo = tipo;
  _nuMovCajitaSel = null;
  const esEntrada = tipo === 'entrada';

  document.getElementById('nuMovTitle').textContent = esEntrada ? 'Agregar a Nu' : 'Retirar de Nu';
  document.getElementById('nuMovSubtitle').innerHTML = esEntrada
    ? 'El valor se <b class="nu-c-nu">sumará</b> a la cajita que elijas y contará como ingreso del mes.'
    : 'El valor se <b class="nu-c-red">restará</b> de la cajita que elijas.';
  document.getElementById('nuMovDescLabel').innerHTML = esEntrada
    ? '¿De dónde viene esta plata? <span class="nu-c-red">*</span>'
    : '¿En qué se gastó o a dónde fue? <span class="nu-c-red">*</span>';
  document.getElementById('nuMovMontoLabel').textContent = esEntrada ? '¿Cuánto recibiste?' : '¿Cuánto vas a restar?';
  const btnConf = document.getElementById('btn-confirmar-nu-mov');
  if (btnConf) {
    btnConf.textContent = esEntrada ? 'Registrar ingreso' : 'Registrar salida';
    btnConf.style.background = esEntrada ? 'rgba(192,96,240,.85)' : 'var(--red)';
    btnConf.style.boxShadow = esEntrada ? '0 2px 14px rgba(192,96,240,.3)' : '0 2px 14px rgba(240,104,104,.3)';
  }

  // Ocultar toggle apertura en salida, y también si la config lo desactiva
  const aperturaWrap = document.getElementById('nuMovAperturaWrap');
  const _mostrarApertura = esEntrada && (S.modulos?.corregirSaldo !== false);
  if (aperturaWrap) aperturaWrap.style.display = _mostrarApertura ? 'flex' : 'none';
  const chk = document.getElementById('nuMovEsApertura');
  if (chk) chk.checked = false;

  // Resetear campos
  document.getElementById('nuMovDesc').value = '';
  document.getElementById('nuMovMonto').value = '';
  document.getElementById('nuMovFecha').value = hoy();
  const nuMovNotaEl = document.getElementById('nuMovNota');
  if (nuMovNotaEl) nuMovNotaEl.value = '';
  document.getElementById('nuMovPreview').textContent = '';

  // Renderizar selector de cajitas
  _nuMovRenderCajitas();

  openSheet('nu-movimiento');
  setTimeout(() => document.getElementById('nuMovDesc').focus(), 200);
}

function _nuMovRenderCajitas() {
  const wrap = document.getElementById('nuMovCajitasWrap');
  if (!wrap) return;
  const cajitas = S.cajitas || [];
  if (!cajitas.length) {
    wrap.innerHTML = '<div class="nu-sel-vacio">No tenés cajitas. Creá una primero desde la pantalla de Nu.</div>';
    return;
  }
  wrap.innerHTML = html`${cajitas.map(c => {
    const saldo = calcC(c).val;
    return html`<div data-nu-cajita="cajita:${c.id}"
      class="nu-sel-fila">
      <div>
        <div class="nu-sel-nombre">${c.nombre||'Cajita'}</div>
        <div class="nu-sel-saldo">${fmt(saldo)}</div>
      </div>
      <div id="_nuMovCheck_${c.id}" class="nu-sel-radio"></div>
    </div>`;
  })}`;

  wrap.querySelectorAll('[data-nu-cajita]').forEach(el => {
    el.addEventListener('click', function() {
      _nuMovCajitaSel = this.dataset.nuCajita;
      // Resaltar selección
      wrap.querySelectorAll('[data-nu-cajita]').forEach(e => {
        e.style.borderColor = 'var(--border2)';
        e.style.background = 'var(--bg3)';
        const cid = e.dataset.nuCajita.split(':')[1];
        const chkEl = document.getElementById('_nuMovCheck_'+cid);
        if (chkEl) chkEl.innerHTML = '';
      });
      this.style.borderColor = 'var(--nu-light)';
      this.style.background = 'rgba(192,96,240,.08)';
      const selId = _nuMovCajitaSel.split(':')[1];
      const chkEl = document.getElementById('_nuMovCheck_'+selId);
      if (chkEl) chkEl.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--nu-light)" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>';
      _nuMovActualizarPreview();
    });
  });

  // Auto-seleccionar si solo hay una cajita
  if (cajitas.length === 1) {
    const único = wrap.querySelector('[data-nu-cajita]');
    if (único) único.click();
  }
}

function _nuMovToggleApertura() {
  _aperturaToggleUI({chk:'nuMovEsApertura',lbl:'nuMovDescLabel',inp:'nuMovDesc',descPlaceholder:'Ej: Salario, mesada, bono...'});
}

function _nuMovActualizarPreview() {
  const prev = document.getElementById('nuMovPreview');
  if (!prev || !_nuMovCajitaSel) return;
  const v = parseMoney(document.getElementById('nuMovMonto').value) || 0;
  if (!v) { prev.textContent = ''; return; }
  const cid = _nuMovCajitaSel.split(':')[1];
  const caj = (S.cajitas || []).find(x => x.id === cid);
  if (!caj) return;
  const saldoActual = calcC(caj).val;
  if (_nuMovTipo === 'entrada') {
    prev.textContent = fmt(saldoActual) + ' + ' + fmt(v) + ' = ' + fmt(saldoActual + v);
    prev.style.color = 'var(--accent)';
  } else {
    const resultado = saldoActual - v;
    prev.textContent = fmt(saldoActual) + ' − ' + fmt(v) + ' = ' + fmt(resultado);
    prev.style.color = resultado < 0 ? 'var(--red)' : 'var(--accent)';
  }
}

function confirmarNuMovimiento() {
  const v = parseMoney(document.getElementById('nuMovMonto').value) || 0;
  const desc = document.getElementById('nuMovDesc').value.trim();
  const fecha = document.getElementById('nuMovFecha').value || hoy();
  const nota = document.getElementById('nuMovNota')?.value.trim() || '';
  const esApertura = _nuMovTipo === 'entrada' && (document.getElementById('nuMovEsApertura')?.checked || false);

  if (!_nuMovCajitaSel) { toast('Seleccioná una cajita', 'err'); return; }
  if (!v) { toast('Ingresá el monto', 'err'); return; }
  if (!esApertura && !desc) {
    toast(_nuMovTipo === 'entrada' ? 'Describí de dónde viene la plata' : 'Describí en qué se gastó', 'err');
    return;
  }

  const cid = _nuMovCajitaSel.split(':')[1];
  const caj = (S.cajitas || []).find(x => x.id === cid);
  if (!caj) { toast('Cajita no encontrada', 'err'); return; }

  // Guarda de saldo (2026-10-05): misma razón que confirmarRestarDinero(). descontarFuente() recorta el
  // saldo en 0 pero registrarSalida() guarda el monto completo; sacar más de lo que hay dejaba el
  // historial desfasado y borrar el movimiento devolvía de más. Se comprueba ANTES de materializar los
  // intereses para no dejar la cajita modificada a medias si se rechaza.
  if (_nuMovTipo !== 'entrada') {
    const disponible = calcC(caj).val;
    if (Math.round(v * 100) > Math.round(disponible * 100)) {
      toast('Saldo insuficiente en ' + escHtml(caj.nombre || 'cajita') + ' (' + fmt(disponible) + ')', 'err', 3500);
      return;
    }
  }

  // Materializar intereses antes de tocar el saldo
  if (typeof materializarIntereses === 'function') materializarIntereses(caj);

  if (_nuMovTipo === 'entrada') {
    const descFinal = registrarEntradaConApertura(_nuMovCajitaSel, v, fecha, desc, esApertura, nota);
    if (window.logCambio) logCambio('Agregaste dinero en ' + (caj.nombre || 'cajita'), descFinal, v, 'ingreso', cid);
    toast(fmt(v) + (esApertura ? ' registrado como saldo inicial en ' : ' agregado a ') + escHtml(caj.nombre || 'cajita'), 'ok');
  } else {
    registrarSalida(_nuMovCajitaSel, v, fecha, desc, nota);
    if (window.logCambio) logCambio('Retiraste dinero de ' + (caj.nombre || 'cajita'), desc, v, 'gasto', cid);
    toast('− ' + fmt(v) + ' de ' + escHtml(caj.nombre || 'cajita') + ' — ' + escHtml(desc), 'salida');
  }

  save();
  closeSheet('nu-movimiento');
  refresh();
  _nuMovCajitaSel = null;
}

/* ---- Acciones de Nu que dependen de la tasa y de las cajitas ----
   Una sola fuente del "por qué no" (vacío = se puede) para el botón (título y aviso) y para la lógica de cada acción. */
function _motivoNuSinCajitas() { return (S.cajitas || []).length ? '' : 'Primero crea una cajita de Nu.'; }
function _motivoNuSinTasa() { return nuTasaConfigurada() ? '' : 'Configura primero la tasa EA de Nu (campo "Tasa EA %").'; }

function _motivoNuMovimiento(tipo) {
  const m = _motivoNuSinCajitas() || _motivoNuSinTasa();
  if (m) return m;
  if (tipo === 'salida' && !(S.cajitas || []).some(c => Math.round(calcC(c).val * 100) >= Math.round(_MIN_RETIRO * 100))) {
    return 'Ninguna cajita tiene saldo para sacar.';
  }
  return '';
}

function _motivoNuChequeo() {
  const m = _motivoNuSinCajitas() || _motivoNuSinTasa();
  if (m) return m;
  if (!cajitasChequeables().length) return 'Se habilita cuando una cajita lleve un día completo generando intereses.';
  return '';
}

function actualizarBotonesNu() {
  const $ = id => document.getElementById(id);
  const mEntro = _motivoNuMovimiento('entrada'), mSalio = _motivoNuMovimiento('salida'), mChq = _motivoNuChequeo();
  _setBtnEstado($('btn-nu-entro'), !mEntro, mEntro);
  _setBtnEstado($('btn-nu-salio'), !mSalio, mSalio);
  _setBtnEstado($('btn-nu-chequeo'), !mChq, mChq);
  const sinTasa = !nuTasaConfigurada();
  const avisoTasa = $('nuTasaAviso');
  if (avisoTasa) avisoTasa.style.display = sinTasa ? '' : 'none';
  _setBtnEstado($('btnAddCajita'), !sinTasa, _motivoNuSinTasa());
  const avisoChq = $('nuChequeoAviso');
  if (avisoChq) { // el motivo a la vista (en celular no hay tooltips); si falta la tasa o las cajitas ya lo dicen otros textos
    const mostrar = !!mChq && !sinTasa && (S.cajitas || []).length > 0;
    avisoChq.style.display = mostrar ? '' : 'none';
    avisoChq.textContent = mostrar ? mChq : '';
  }
}

// --- CDT ---
const btnCDTConf = document.getElementById('btn-confirmar-crear-cdt');
if (btnCDTConf) btnCDTConf.addEventListener('click', confirmarSheetCDT); // crear o editar según _cdtEditId
const btnCobrarConf = document.getElementById('btn-confirmar-cobrar-cdt');
if (btnCobrarConf) btnCobrarConf.addEventListener('click', confirmarCobrarCDT);

// --- Meta de ahorro en cajita ---
const btnGuardarMeta = document.getElementById('btn-guardar-meta');
if (btnGuardarMeta) btnGuardarMeta.addEventListener('click', guardarMetaCajita);
const btnQuitarMeta = document.getElementById('btn-quitar-meta');
if (btnQuitarMeta) btnQuitarMeta.addEventListener('click', quitarMetaCajita);
const btnAddMetaAporte = document.getElementById('btn-add-meta-aporte');
if (btnAddMetaAporte) btnAddMetaAporte.addEventListener('click', () => { _metaAportesTemp.push({desc:'',monto:0}); _renderMetaAportes(); });
// Preview en vivo al cambiar monto objetivo / fechas en el sheet de meta
['meta_objetivo','meta_inicio','meta_fin'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', _updateMetaCuotaPreview);
});

// --- Nu: entró / salió plata ---
const btnNuEntro = document.getElementById('btn-nu-entro');
if (btnNuEntro) btnNuEntro.addEventListener('click', () => abrirNuMovimiento('entrada'));
const btnNuSalio = document.getElementById('btn-nu-salio');
if (btnNuSalio) btnNuSalio.addEventListener('click', () => abrirNuMovimiento('salida'));
const btnNuMovConf = document.getElementById('btn-confirmar-nu-mov');
if (btnNuMovConf) btnNuMovConf.addEventListener('click', confirmarNuMovimiento);
document.addEventListener('input', function(e) {
  if (e.target.id === 'nuMovMonto') _nuMovActualizarPreview();
});

// --- Cajita: agregar ---
const btnAddCajita = document.getElementById('btnAddCajita');
if (btnAddCajita) btnAddCajita.addEventListener('click', addCajita);

// Preview en vivo del sheet "crear CDT" (monto/tasa/fecha → valor neto
// estimado). Se encontró compartiendo <script> con Tarjetas de Crédito en
// index.html — mismo problema de "código no relacionado en el mismo bloque"
// que ya describía la auditoría para TC. Es de Nu (CDT), así que vive en nu.js.
// CDT preview
document.addEventListener('input',function(e){
  if(!['cdt_monto','cdt_tasa','cdt_vence','cdt_rte'].includes(e.target.id))return;
  const monto=parseMoney(document.getElementById('cdt_monto').value)||0;
  const tasa=parsePct(document.getElementById('cdt_tasa').value)||9.25;
  const rteTxt=(document.getElementById('cdt_rte').value||'').trim();
  const rte=(rteTxt===''?4:(parsePct(rteTxt)||0))/100; // vacío = 4 (por defecto); 0 es válido
  const vence=document.getElementById('cdt_vence').value;
  const prev=document.getElementById('cdt_preview');
  if(!prev)return;
  if(monto>=50000&&vence){
    const dias=Math.max(0,Math.ceil((_fechaSafe(vence)-new Date())/86400000));
    const tasaDiaria=Math.pow(1+tasa/100,1/365)-1;
    const tasaDiariaNet=tasaDiaria*(1-rte);
    const valorFinal=monto*Math.pow(1+tasaDiariaNet,dias);
    const valorBruto=monto*Math.pow(1+tasaDiaria,dias);
    const ganado=valorFinal-monto;
    const retencionTotal=valorBruto-valorFinal;
    prev.textContent=`En ${dias}d recibirás ~${fmt(valorFinal)} neto (+${fmt(ganado)} · RTE ${(rte*100).toFixed(0)}%: -${fmt(retencionTotal)})`;
    prev.style.color='var(--accent)';
  } else if(monto>0&&monto<50000&&!_cdtEditId){
    prev.textContent='Mínimo $50.000 para el CDT';
    prev.style.color='var(--red)';
  } else {
    prev.textContent='';
  }
});

// Campos de tasa EA que no tienen manejador propio (la tasa de un CDT y la que sugiere el chequeo rápido; la de las cajitas lo hace
// en firebase-sync.js): solo números y un separador decimal, coma o punto.
document.addEventListener('input',function(e){
  const t=e.target;
  if(!t||!t.matches||!t.matches('[data-tasa-ea]'))return;
  const limpio=nuTasaSanear(t.value);
  if(limpio!==t.value)t.value=limpio;
});

// ── Botones de Nu (data-action="nu:…" en index.html y en el HTML generado por este archivo) ──
Events.registerAll('nu', {
  // Cajitas / detalle / metas / CDTs
  abrirDetalleCajita,
  volverANu,
  volverADetalleCajita,
  cajitaDetDelete: _cajitaDetDelete,
  abrirSubMeta,
  abrirSubCDTs,
  abrirMetaCajita,
  metaAporteEliminar: _metaAporteEliminar,
  toggleMetaMinWrap,
  quitarMetaCajita,
  abrirCrearCDT,
  editarCDT,
  abrirCobrarCDT,
  liberarCDTManual,
  cancelarCobrarCDT: _cancelarCobrarCDT,
  // Chequeo rápido y tasa sugerida
  abrirChequeoNu,
  guardarChequeoNu,
  corregirChequeoNu,
  confirmarCambioTasaNu,
});

// El 'change' del toggle "es saldo inicial" del sheet de Agregar/Retirar de Nu (antes onchange inline en el HTML).
(function(){
  const wrap=document.getElementById('nuMovAperturaWrap');
  const chk=document.getElementById('nuMovEsApertura');
  if(wrap&&chk){
    wrap.addEventListener('click', () => chk.click());
    chk.addEventListener('click', e => e.stopPropagation());
    chk.addEventListener('change', _nuMovToggleApertura);
  }
})();
