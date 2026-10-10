/* ═══════════════════════════════════════════════════════════════
   js/core/nu-calc.js

   Cálculo puro de Nu (cajitas con interés compuesto por tramos de tasa EA
   y CDTs). Sin DOM, sin UI: solo depende de `S`, hoy(), _fechaSafe() y
   _saldoEncargosEnCuenta() (core-state.js).

   Por qué vive en el núcleo: calcPatrimonioTotal(), snapshotPatrimonio(),
   la salud financiera, Encargos, Inicio y Cuentas necesitan estos números
   en CUALQUIER pantalla. Antes estaban en cuentas.js (lazy) y el núcleo
   se protegía con `typeof calcC === 'function'` y valores de respaldo:
   un patrimonio artificialmente bajo quedaba grabado en el historial si
   se guardaba antes de que cargara Cuentas. Con el cálculo siempre
   disponible esos guards ya no existen.

   Carga de entrada (<script defer>) justo después de core-state.js.
   Lo que muta datos (materializarIntereses, registrarTasaNuHistorial)
   sigue en cuentas.js: acá solo se calcula.
   ═══════════════════════════════════════════════════════════════ */

function _saldoEncargosEnCajita(cajitaId){
  if(!cajitaId)return 0;
  return _saldoEncargosEnCuenta('cajita:'+cajitaId);
}

// Devuelve la tasa EA vigente en una fecha dada, según S.historialTasasNu.
// Si la fecha es anterior a cualquier cambio registrado, usa la tasa base (S.nuTasaGlobal).
function _tasaVigenteEnFecha(fechaStr){
  const hist=(S.historialTasasNu||[]).slice().sort((a,b)=>a.fecha<b.fecha?-1:(a.fecha>b.fecha?1:0));
  let tasa=(S.nuTasaGlobal!=null?S.nuTasaGlobal:(S.nuRate||9.25));
  let encontrada=null;
  for(const h of hist){
    if(h.fecha<=fechaStr) encontrada=h.tasa; else break;
  }
  if(encontrada!=null) tasa=encontrada;
  else if(hist.length) tasa=hist[0].tasa;
  return tasa;
}

function _diasEntreFechas(a,b){
  // Ver _fechaSafe() en core-state.js: new Date(str+'T00:00:00') da Invalid
  // Date si a/b no tienen mes/día de 2 dígitos, propagando NaN en silencio
  // a calcC() y todo lo que dependa de esta función.
  return Math.round((_fechaSafe(b)-_fechaSafe(a))/86400000);
}
function _segmentosTasaNu(desdeStr,hastaStr){
  const cambios=(S.historialTasasNu||[])
    .filter(h=>h.fecha>desdeStr&&h.fecha<hastaStr)
    .sort((a,b)=>a.fecha<b.fecha?-1:1);
  const puntos=[desdeStr,...cambios.map(h=>h.fecha),hastaStr];
  const segmentos=[];
  for(let i=0;i<puntos.length-1;i++){
    const dias=_diasEntreFechas(puntos[i],puntos[i+1]);
    if(dias<=0)continue;
    segmentos.push({desde:puntos[i],hasta:puntos[i+1],dias,tasa:_tasaVigenteEnFecha(puntos[i])});
  }
  return segmentos;
}

// Reconstruye cuánto saldo de encargos había en una cajita a una fecha dada (solo contando
// movimientos del encargo hasta esa fecha inclusive) — a diferencia de
// _saldoEncargosEnCajita()/_saldoEncargosEnCuenta(), que siempre da el saldo de HOY.
// Se usa en calcC() para no darle intereses retroactivos a plata de un encargo que
// todavía no había entrado en tramos anteriores del periodo (ver CHANGELOG.md#cuentas).
function _saldoEncargosEnCajitaEnFecha(cajitaId,fechaStr){
  const cuentaKey='cajita:'+cajitaId;
  let total=0;
  (S.encargos||[]).forEach(enc=>{
    const map={};
    if((enc.saldoInicial||0)>0){
      const k=enc.cuentaInicial||'__sin__';
      map[k]=(map[k]||0)+(enc.saldoInicial||0);
    }
    (enc.movimientos||[]).forEach(m=>{
      if((m.fecha||'')>fechaStr)return; // ignora movimientos posteriores a la fecha pedida
      const k=m.cuenta||'__sin__';
      if(m.tipo==='entrada')map[k]=(map[k]||0)+(m.monto||0);
      else map[k]=(map[k]||0)-(m.monto||0);
    });
    const v=map[cuentaKey]||0;
    if(v>0)total+=v;
  });
  return total;
}

// Fechas (dentro de (desde, hasta]) en que algún movimiento de encargo tocó esta cajita —
// puntos donde el saldo de encargos "vigente" cambia, para partir el cálculo de interés ahí.
function _fechasCambioEncargoEnCajita(cajitaId,desdeStr,hastaStr){
  const cuentaKey='cajita:'+cajitaId;
  const fechas=new Set();
  (S.encargos||[]).forEach(enc=>{
    (enc.movimientos||[]).forEach(m=>{
      if((m.cuenta||'')===cuentaKey&&m.fecha>desdeStr&&m.fecha<=hastaStr)fechas.add(m.fecha);
    });
  });
  return fechas;
}

function calcC(c,hastaStr){
  // hastaStr (opcional, 'YYYY-MM-DD'): calcula el valor a esa fecha en vez de hoy; se usa para repartir el
  // interés por mes (ver rendimientoCajitaPorMes). Sin argumento todo funciona exactamente como siempre.
  // Interés diario compuesto sobre el saldo total físico en la cajita (propio + lo que haya
  // de encargos guardado ahí — Nu no distingue de quién es la plata al pagar interés; esos
  // intereses son del dueño de la cajita, ver nota en core-state.js). c.saldo guarda solo la
  // porción propia; el saldo de encargos se reconstruye aparte con _saldoEncargosEnCajita().
  //
  // IMPORTANTE: el cálculo se hace POR TRAMOS, partiendo tanto en cada cambio de tasa EA
  // (ver S.historialTasasNu) como en cada fecha en que cambió el saldo de encargos dentro
  // de esta cajita — así una plata de encargo que entra a mitad del periodo solo compone
  // intereses desde el día en que realmente llegó, no desde la última vez que se
  // materializó la cajita completa.
  // Corregido (ver CHANGELOG.md#cuentas): antes se usaba el saldo de encargos DE HOY
  // aplicado a TODO el periodo compuesto, dándole intereses retroactivos a cualquier plata
  // de encargo recién depositada.
  const saldoPropio=c.saldo||0;
  const tasaHoy=_tasaVigenteEnFecha(hoy());
  const saldoEncargosHoy=_saldoEncargosEnCajita(c.id);
  if(!c.fecha||(!saldoPropio&&!saldoEncargosHoy))return{val:saldoPropio,ganado:0,dias:0,tasaDiaria:0,tasa:tasaHoy,saldoEncargos:saldoEncargosHoy};
  const hoyStr=hastaStr||hoy();
  if(hoyStr<=c.fecha)return{val:saldoPropio,ganado:0,dias:0,tasaDiaria:0,tasa:tasaHoy,saldoEncargos:saldoEncargosHoy};
  const cambiosTasa=(S.historialTasasNu||[]).filter(h=>h.fecha>c.fecha&&h.fecha<=hoyStr).map(h=>h.fecha);
  const cambiosEncargo=[..._fechasCambioEncargoEnCajita(c.id,c.fecha,hoyStr)];
  const puntos=[...new Set([c.fecha,...cambiosTasa,...cambiosEncargo,hoyStr])].sort();
  let saldoEncActual=_saldoEncargosEnCajitaEnFecha(c.id,c.fecha);
  let valor=saldoPropio+saldoEncActual;
  let diasTotal=0;
  for(let i=0;i<puntos.length-1;i++){
    const desde=puntos[i],hasta=puntos[i+1];
    const dias=_diasEntreFechas(desde,hasta);
    if(dias>0){
      const tasaTramo=_tasaVigenteEnFecha(desde);
      const tasaDiariaTramo=Math.pow(1+tasaTramo/100,1/365)-1;
      valor=valor*Math.pow(1+tasaDiariaTramo,dias);
      diasTotal+=dias;
    }
    // Al llegar a este punto, actualizar el saldo de encargos vigente desde acá en
    // adelante (si el quiebre fue por un movimiento de encargo, no solo por tasa).
    const nuevoSaldoEnc=_saldoEncargosEnCajitaEnFecha(c.id,hasta);
    if(nuevoSaldoEnc!==saldoEncActual){
      valor+=(nuevoSaldoEnc-saldoEncActual);
      saldoEncActual=nuevoSaldoEnc;
    }
  }
  const val=valor-saldoEncActual; // saldoEncActual ya quedó igual a saldoEncargosHoy
  const ganado=val-saldoPropio;
  const tasaDiaria=Math.pow(1+tasaHoy/100,1/365)-1;
  return{val,ganado,dias:diasTotal,tasaDiaria,tasa:tasaHoy,saldoEncargos:saldoEncActual};
}

// Reparte por mes el interés que una cajita lleva acumulado SIN materializar (desde c.fecha hasta hoy):
// { 'YYYY-MM': pesos }. Es la misma cuenta de calcC() cortada en cada fin de mes (la suma de los meses da
// calcC(c).ganado). Sirve para saber cuánto rindió la cajita EN un mes, no solo en total.
function rendimientoCajitaPorMes(c){
  const out={};
  if(!c||!c.fecha)return out;
  const hasta=hoy();
  if(hasta<=c.fecha)return out;
  const p2=n=>String(n).padStart(2,'0');
  let[a,m]=c.fecha.slice(0,7).split('-').map(Number);
  let prev=0;
  for(;;){
    const mes=a+'-'+p2(m);
    const fin=mes+'-'+p2(new Date(a,m,0).getDate());
    if(fin>=hasta)break; // el último tramo (hasta hoy) se cierra abajo
    if(fin>c.fecha){const g=calcC(c,fin).ganado;out[mes]=g-prev;prev=g;}
    m++;if(m>12){m=1;a++;}
  }
  out[hasta.slice(0,7)]=(out[hasta.slice(0,7)]||0)+(calcC(c,hasta).ganado-prev);
  Object.keys(out).forEach(k=>{if(!(out[k]>0))delete out[k];});
  return out;
}

// Calcula intereses del CDT de una cajita
// Nu calcula el CDT así:
// 1. Rendimiento bruto = monto × ((1 + EA)^(dias/365) - 1)  [compuesto, base 365]
// 2. Nu redondea el bruto al $0,50 más cercano: round(bruto × 2) / 2
// 3. RTE = bruto_redondeado × rte%
// 4. Rendimiento neto = bruto_redondeado - RTE
// 5. Total neto = monto + rendimiento neto
// Verificado con dos CDTs reales: replica exactamente los valores de la app Nu.
function calcCDT(cdt){
  if(!cdt||!cdt.monto||!cdt.inicio)return{val:cdt?cdt.monto:0,ganado:0,ganado_bruto:0,retencion:0,dias:0};
  const rate=cdt.tasa/100;
  const rte=(cdt.rte!=null?cdt.rte:4)/100; // retención en fuente (default 4%)
  const desde=_fechaSafe(cdt.inicio);
  const hasta=cdt.vence?_fechaSafe(cdt.vence):new Date();
  const ahora=new Date();
  const fechaFin=ahora<hasta?ahora:hasta;
  const dias=Math.max(0,Math.floor((fechaFin-desde)/86400000));
  // Rendimiento bruto compuesto (fórmula EA base 365, igual que Nu)
  const ganado_bruto_exacto=cdt.monto*(Math.pow(1+rate,dias/365)-1);
  // Nu redondea el bruto al $0,50 más cercano antes de calcular RTE
  const ganado_bruto=Math.round(ganado_bruto_exacto*2)/2;
  // RTE se aplica sobre el bruto redondeado
  const retencion=ganado_bruto*rte;
  const ganado=ganado_bruto-retencion;
  const val=cdt.monto+ganado;
  return{val,ganado,ganado_bruto,retencion,dias};
}

// Rendimiento neto acumulado de un CDT después de N días (misma fórmula que calcCDT, sin fechas).
function _rendimientoCDTaDias(cdt,dias){
  if(dias<=0)return 0;
  const rate=cdt.tasa/100;
  const rte=(cdt.rte!=null?cdt.rte:4)/100;
  const ganado_bruto_exacto=cdt.monto*(Math.pow(1+rate,dias/365)-1);
  const ganado_bruto=Math.round(ganado_bruto_exacto*2)/2;
  const retencion=ganado_bruto*rte;
  return ganado_bruto-retencion;
}

// Calcula el rendimiento neto de un CDT que corresponde específicamente a un mes dado (formato 'YYYY-MM').
// No es flujo de caja disponible (el dinero sigue bloqueado en el CDT), pero sí es
// "rendimiento generado" ese mes — patrimonio que aumenta día a día aunque el efectivo
// disponible no cambie (Opción 2: patrimonio real, sin movimiento visible).
function calcRendimientoCDTMes(cdt,mesK){
  if(!cdt||!cdt.monto||!cdt.inicio||!mesK)return 0;
  const inicio=_fechaSafe(cdt.inicio);
  const [anioM,mesM]=mesK.split('-').map(Number);
  const inicioMes=new Date(anioM,mesM-1,1);
  const finMes=new Date(anioM,mesM,0); // último día del mes
  const ahora=new Date();
  const vence=cdt.vence?_fechaSafe(cdt.vence):null;
  const limiteSup=vence&&vence<ahora?vence:ahora;
  if(limiteSup<inicioMes||inicio>finMes)return 0;
  // Días acumulados desde el inicio del CDT hasta el corte de inicio/fin de este mes
  const cortePrev=inicioMes>inicio?inicioMes:inicio;
  const corteFin=limiteSup<finMes?limiteSup:finMes;
  const diasPrev=Math.max(0,Math.floor((cortePrev-inicio)/86400000));
  const diasFin=Math.max(0,Math.floor((corteFin-inicio)/86400000));
  if(diasFin<=diasPrev)return 0;
  return Math.max(0,_rendimientoCDTaDias(cdt,diasFin)-_rendimientoCDTaDias(cdt,diasPrev));
}

// Suma el rendimiento de TODOS los CDTs (en todas las cajitas) generado durante un mes dado.
// Esto es "rendimiento acumulado/patrimonio" — el patrimonio total aumenta, pero NO es
// efectivo disponible (el dinero sigue bloqueado hasta que el CDT venza/se cobre).
function calcRendimientoCDTsMes(mesK){
  let total=0;
  (S.cajitas||[]).forEach(c=>{
    (c.cdts||[]).forEach(cdt=>{
      total+=calcRendimientoCDTMes(cdt,mesK);
    });
  });
  return total;
}

function nuTotal(){
  return(S.cajitas||[]).reduce((a,c)=>{
    const k=calcC(c);
    const cdtVal=(c.cdts||[]).reduce((b,cdt)=>b+calcCDT(cdt).val,0);
    return a+k.val+cdtVal;
  },0);
}

// Tasa EA global de Nu. S es la única fuente de verdad: el input #nuTasaGlobal
// escribe en S.nuTasaGlobal en cada cambio (ver firebase-sync.js), y esta función
// ya no lee el DOM ni escribe en S como efecto colateral.
function getNuTasaGlobal(){
  return S.nuTasaGlobal||9.25;
}

function getCajitaNombre(fuente) {
  if (!fuente || !fuente.startsWith('cajita:')) return null;
  const id = fuente.split(':')[1];
  const c = (S.cajitas || []).find(x => x.id === id);
  return c ? (c.nombre || 'Cajita') : null;
}

