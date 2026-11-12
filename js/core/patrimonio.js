// js/core/patrimonio.js
//
// Patrimonio, liquidez e historial: calcPatrimonio*, bienes, liquidez, snapshots y la limpieza del historial cuando se elimina o edita un movimiento.
// Parte del antiguo el núcleo (js/core/estado.js y hermanos) (dividido por responsabilidad). Clásico (<script defer>), sin type="module": sus globales son
// léxicos de script clásico. El ORDEN de carga en index.html es el de esta lista: estado → cuentas-fuentes → persistencia →
// patrimonio → ingresos → dialogos → utilidades-ui → refresh.


/* ---- SNAPSHOT PATRIMONIO ---- */
function _saldoCPAjeno(){
  // Calcula cuánta plata comprometida ajena está físicamente en cuentas propias.
  // Son destinos de ingresos ya recibidos donde el dinero es de otra persona
  // (gastos de cuentas y cajitas pendientes de pagar, y plata para TC aún en cajita).
  // Una vez que se paga (yaPague=true) la plata ya salió → no restar.
  let total = 0;
  (S.plataComprometida||[]).forEach(item => {
    if(!item.recibido) return; // aún no llegó → no está en ninguna cuenta
    (item.destinos||[]).forEach(d => {
      if(d.yaPague) return; // ya se pagó → salió de la cuenta
      if(d.tipo === 'gasto' && d.gastoOrigen === 'cajita' && d.gastoCajita){
        // Plata de otra persona guardada en cajita esperando el pago
        total += (d.monto||0);
      } else if(d.tipo === 'gasto' && d.gastoOrigen === 'tc' && d.gastoTcCajita){
        // Plata para pagar TC guardada en cajita intermediaria
        total += (d.monto||0);
      }
    });
  });
  return total;
}

// Deuda ajena de UNA tarjeta puntual — cuánto de tc.deuda es en realidad de
// un encargo/préstamo/favor (plata que no es tuya, solo la estás cuidando).
//
// OJO: esto es un SALDO, no un bruto histórico. Si sumáramos todo lo que
// alguna vez se cargó como ajeno sin restar los pagos, la "ajena" nunca
// bajaría aunque ya la hayas pagado — y con el tiempo terminaría inflada
// por encima de tc.deuda actual, haciendo que la parte "propia" calculada
// diera 0 aunque tengas gastos tuyos reales sin cubrir.
//
// Regla de negocio: un pago cancela PRIMERO lo ajeno (es plata que se
// recupera del encargo/préstamo y se usa específicamente para saldar esa
// parte) y lo que sobra del pago cancela lo propio. Con esto la "ajena"
// nunca puede superar la deuda actual, y calcDeudaTcPropiaDeTarjeta ya no
// necesita un floor artificial en 0 para "resolver" el desbalance.
// Saldo inicial PENDIENTE de UNA tarjeta — la parte del saldo con que se
// creó la tarjeta que todavía no se ha pagado. Se trata como "neutral": no
// sabemos si es propia o ajena (se ingresó en bloque al configurar la
// tarjeta, sin desglosar), así que no cuenta ni para un lado ni para el
// otro mientras exista. Los pagos la drenan PRIMERO, antes de tocar lo
// ajeno conocido o lo propio (ver calcDeudaAjenaDeTarjeta). Conversación
// 2026-08-07: evita que el health score penalice una suposición que podría
// estar mal (ej. saldo inicial que en realidad era 100% un favor a otra
// persona).
function calcSaldoInicialPendiente(tc){
  if(!tc || !tc.saldoInicial || tc.saldoInicial.eliminado) return 0;
  const totalPagos=(tc.pagos||[]).filter(p=>!p.eliminado).reduce((a,p)=>a+(p.monto||0),0);
  return Math.max(0, (tc.saldoInicial.monto||0) - totalPagos);
}

// Deuda ajena de UNA tarjeta puntual — cuánto de tc.deuda es en realidad de
// un encargo/préstamo/favor (plata que no es tuya, solo la estás cuidando).
//
// OJO: esto es un SALDO, no un bruto histórico. Si sumáramos todo lo que
// alguna vez se cargó como ajeno sin restar los pagos, la "ajena" nunca
// bajaría aunque ya la hayas pagado — y con el tiempo terminaría inflada
// por encima de tc.deuda actual, haciendo que la parte "propia" calculada
// diera 0 aunque tengas gastos tuyos reales sin cubrir.
//
// Regla de negocio: un pago cancela PRIMERO el saldo inicial (neutral, ver
// calcSaldoInicialPendiente), LUEGO lo ajeno conocido (encargo/préstamo/
// favor), y lo que sobra cancela lo propio. Con esto la "ajena" nunca puede
// superar la deuda actual, y calcDeudaTcPropiaDeTarjeta ya no necesita un
// floor artificial en 0 para "resolver" el desbalance.
function calcDeudaAjenaDeTarjeta(tc){
  if(!tc) return 0;
  let ajenaBruta = 0;
  (S.tcMovimientos||[]).forEach(m => {
    if (m.eliminado || m.tcId !== tc.id) return;
    if (m.tipo === 'cargo_encargo' || m.tipo === 'cargo_prestamo') ajenaBruta += (m.monto||0);
  });
  (tc.compras||[]).forEach(c => { if (!c.eliminado && c._desdeCP) ajenaBruta += (c.monto||0); });
  const totalPagos = (tc.pagos||[]).filter(p=>!p.eliminado).reduce((a,p)=>a+(p.monto||0),0);
  const saldoInicialBruto = (tc.saldoInicial && !tc.saldoInicial.eliminado) ? (tc.saldoInicial.monto||0) : 0;
  // Los pagos ya "gastados" en drenar el saldo inicial no cuentan acá —
  // solo el excedente, si lo hay, sigue bajando lo ajeno.
  const pagosParaAjena = Math.max(0, totalPagos - saldoInicialBruto);
  return Math.max(0, ajenaBruta - pagosParaAjena);
}
function calcDeudaTcPropiaDeTarjeta(tc){
  if(!tc) return 0;
  return Math.max(0, (tc.deuda||0) - calcDeudaAjenaDeTarjeta(tc) - calcSaldoInicialPendiente(tc));
}

// Calcula la deuda TC que realmente es mía, sumando la parte propia de
// cada tarjeta — una sola fuente de verdad (antes tenía su propio cálculo
// bruto separado que se podía desincronizar de calcDeudaTcPropiaDeTarjeta).
function calcDeudaTcPropia() {
  return (S.tarjetasCredito||[]).reduce((a,tc)=>a+calcDeudaTcPropiaDeTarjeta(tc),0);
}

/* ---- PATRIMONIO Y LIQUIDEZ: UNA SOLA DEFINICIÓN ----------------------------------------------------------------------
   Todo número de la app que sea «cuánto tengo» sale de calcPatrimonioDesglose() o de calcLiquidez(). Nadie más suma cuentas
   ni resta deudas a mano: el hero de Inicio, el historial (snapshotPatrimonio, medirPatrimonioParaHistorial), la gráfica
   de Análisis, la Proyección y Salud financiera leen de aquí. Antes cada uno tenía su propia fórmula y se desalinearon
   (el hero no restaba «Yo debo»; Salud tampoco). Si una regla cambia (una deuda nueva, otra cuenta), se cambia en ESTE
   bloque y todo lo demás sigue igual; tests/nucleo.test.js («patrimonio — fuente única») lo vigila.

   PATRIMONIO = activos − pasivos (patrimonio NETO)
     activos : cajitas de las cuentas de ahorro (con su interés), CDTs, el saldo de las demás cuentas, «Me deben» y Alcancía.
     pasivos : deuda de tarjetas (completa), «Yo debo» (deudas con personas) y plata ajena que guardas en tus cuentas.
   Las deudas con personas cuentan completas aunque no tengan fecha de pago: un pasivo sin vencimiento sigue siendo un pasivo
   (entre amigos casi nunca hay fecha, y no por eso la plata deja de ser de otro). Lo mismo vale para «Me deben»: es un
   activo aunque no sepas cuándo te pagan. La fecha incierta no cambia el patrimonio: cambia la LIQUIDEZ (ver abajo).
   «Visible» = patrimonio sin la Alcancía (está oculta a propósito, ver alcancia.js): es lo que se muestra y se guarda en
   `valorVisible`. El total real (con Alcancía) solo se usa por dentro.

   LIQUIDEZ = lo que podrías usar ya, sin vender nada ni esperar a nadie (para el fondo de emergencia de Salud financiera).
     suma  : cajitas y el saldo de las demás cuentas.
     resta : deuda de tarjeta PROPIA, «Yo debo» y plata ajena (esas tres salen de tu bolsillo o ya tienen dueño).
     no suma: CDTs sin vencer (bloqueados), «Me deben» (sin fecha cierta no es plata disponible) ni Alcancía (oculta).
     sí suma: un CDT ya VENCIDO (cdtVencido, nu-calc.js): la plata se puede retirar aunque sigas sin «liberarla» en la cajita.
   Es a propósito asimétrica y prudente: lo que te deben no cuenta hasta que llega, lo que debes cuenta completo. */
function calcPatrimonioDesglose(){
  const cajitas=(S.cajitas||[]).reduce((a,c)=>a+calcC(c).val,0);
  const cdts=(S.cajitas||[]).reduce((a,c)=>a+(c.cdts||[]).reduce((b,cdt)=>b+calcCDT(cdt).val,0),0);
  // NOTA: ya NO se resta plata de encargos guardada en las cuentas con saldo.
  // Registrar una entrada de encargo con esa cuenta es solo
  // metadata de dónde está físicamente esa plata — nunca suma nada al saldo
  // real de la cuenta (a diferencia de una cajita de ahorro, donde sí forma parte
  // de la base que gana interés en calcC()/_saldoEncargosEnCajita()). Restarla
  // acá contaba de menos un patrimonio que en realidad nunca se sumó. Ver
  // CHANGELOG.md#encargos.
  const cuentas=saldoCuentas(); // todas las cuentas con saldo propio (las de ahorro cuentan por sus cajitas, arriba)
  // Deudas (calc-helpers.js, carga de entrada) — calcPatrimonioTotal() corre en
  // CADA save() de la app (vía snapshotPatrimonio), no solo en refresh().
  const meDeben=typeof Deudas!=='undefined'?Deudas.totalPendiente('favor'):0;
  // Alcancía: el saldo registrado es plata real tuya aunque esté "oculta"
  const alcancia=(S.alcancia&&S.alcancia.saldoRegistrado)?S.alcancia.saldoRegistrado:0;
  // Math.max(0, …) por tarjeta: un saldo a favor (tc.deuda negativo: pagaste de más; el flujo normal de pagos lo recorta en 0, así que
  // solo llega por datos importados o editados a mano) no es plata disponible ni un activo — hay que pedir el reembolso o esperar a que
  // se aplique a compras futuras. Sumarlo inflaba el patrimonio y lo hacía distinto del «neto de tarjetas» de Inicio, que ya lo trata así.
  const deudaTC=(S.tarjetasCredito||[]).reduce((a,tc)=>a+Math.max(0,tc.deuda||0),0);
  // Lo que le debo a otras personas (S.misDeudas) — esa plata está físicamente en
  // mis cuentas pero no es mía, así que se resta igual que la deuda de TC.
  const yoDebo=typeof Deudas!=='undefined'?Deudas.totalPendiente('contra'):0;
  // Restar plata comprometida ajena que está físicamente en cuentas propias
  // (igual que se restan encargos) — es plata de otras personas que administras
  const ajeno=_saldoCPAjeno();
  const activos=cajitas+cdts+cuentas+meDeben+alcancia;
  const pasivos=deudaTC+yoDebo+ajeno;
  const total=cajitas+cdts+cuentas+meDeben+alcancia-deudaTC-yoDebo-ajeno;
  return {
    cajitas, cdts, cuentas, meDeben, alcancia,                      // activos
    deudaTC, yoDebo, ajeno,                                         // pasivos
    activos, pasivos,
    total,                    // patrimonio neto real (con Alcancía)
    visible: total-alcancia,  // el que se muestra y se guarda en el historial (sin Alcancía)
  };
}

// Patrimonio neto real (con Alcancía). Nombre histórico: delega en calcPatrimonioDesglose().
function calcPatrimonioTotal(){ return calcPatrimonioDesglose().total; }

// Patrimonio visible (sin Alcancía): el número del hero, de la Proyección, de Salud y de `valorVisible` en el historial.
function calcPatrimonioVisible(){ return calcPatrimonioDesglose().visible; }

/* ================================================================
   BIENES (una moto, un computador) — activos NO líquidos, aparte del patrimonio financiero
   ================================================================
   Una moto de 15 M no «desaparece»: vale algo, aunque se deprecie. Pero va APARTE a propósito:
     · el patrimonio financiero (el del hero, el historial, la Proyección) sigue siendo lo que te protege en una emergencia; meter el
       bien adentro escondería el golpe de la compra justo cuando más importa verlo;
     · nunca entra en la liquidez ni en el runway (calcLiquidez no los mira): no se pueden gastar sin venderlos.
   El valor es una ESTIMACIÓN del usuario: la app no sabe lo que vale tu moto. `valor` es lo que vale en `fecha`; con
   `depreciacionAnual` (% al año, compuesto) baja desde esa fecha. Para revaluarlo, el usuario edita el valor y la fecha.
   ================================================================ */
function calcValorBien(b, hoyStr){
  const v=Number(b&&b.valor)||0;
  const dep=Number(b&&b.depreciacionAnual)||0;
  if(!(dep>0)||!(b&&b.fecha))return v;
  const anios=(_fechaSafe(hoyStr||hoy())-_fechaSafe(b.fecha))/(365.25*Fecha.MS_DIA);
  if(!isFinite(anios))return v;
  return Math.round(v*Math.pow(1-Math.min(dep,100)/100,Math.max(0,anios)));
}
// → { items:[{id,nombre,valor,fecha,depreciacionAnual,origenGastoId,valorEstimado}], total }
function calcBienes(hoyStr){
  const items=(S.bienes||[]).map(b=>({id:b.id,nombre:b.nombre,valor:b.valor||0,fecha:b.fecha,depreciacionAnual:b.depreciacionAnual||0,origenGastoId:b.origenGastoId,valorEstimado:calcValorBien(b,hoyStr)}));
  return {items,total:items.reduce((a,x)=>a+x.valorEstimado,0)};
}
// Patrimonio financiero + bienes (valor estimado). Solo para mostrarlo APARTE (Análisis): no reemplaza al patrimonio del hero.
function calcPatrimonioConBienes(hoyStr){ return calcPatrimonioVisible()+calcBienes(hoyStr).total; }

// Texto del hero con lo que de verdad entra en la cuenta: solo menciona los pasivos que existen hoy.
function patrimonioFormulaTexto(d){
  d=d||calcPatrimonioDesglose();
  // Solo lo que la persona tiene hoy: siempre «Cuentas»; los CDTs y lo prestado, únicamente si existen.
  const suma=['Cuentas'];
  if(d.cdts>0)suma.push('CDTs');
  if(d.meDeben>0)suma.push('Prestado');
  const resta=[];
  if(d.deudaTC>0)resta.push('Deuda TC');
  if(d.yoDebo>0)resta.push('Yo debo');
  if(d.ajeno>0)resta.push('Plata ajena');
  return suma.join(' + ')+resta.map(t=>' − '+t).join('');
}

// Liquidez: lo que se puede usar ya (ver el bloque de arriba). La deuda de tarjeta es solo la PROPIA: la parte de la
// tarjeta que es de un préstamo o un encargo se cubre con lo que te deben, que tampoco entra aquí.
function calcLiquidez(){
  const d=calcPatrimonioDesglose();
  const libre=d.cajitas+d.cuentas;
  // CDT ya vencidos: dejaron de estar bloqueados. Antes seguían fuera de la liquidez hasta «liberarlos», y con 20 M vencidos y nada en
  // cuentas la Salud decía «tus ahorros están en CDTs» aunque ya se podían cobrar (Inicio sí avisa «venció — ¡libera tu plata!»).
  const ahora=new Date();
  const cdtsVencidos=(S.cajitas||[]).reduce((a,c)=>a+(c.cdts||[]).reduce((b,cdt)=>b+(cdtVencido(cdt,ahora)?calcCDT(cdt).val:0),0),0);
  const tcPropia=typeof calcDeudaTcPropia==='function'?calcDeudaTcPropia():0;
  const obligaciones=tcPropia+d.yoDebo+d.ajeno;
  const neta=libre+cdtsVencidos-obligaciones;
  // Peor caso: la deuda de tarjeta COMPLETA (incluye la parte ajena: el banco cobra el 100 %, y la app no sabe si ya te devolvieron esa plata).
  // `neta` es el escenario «lo ajeno de la tarjeta me lo pagan»; `netaPeorCaso` es «lo pago todo yo». Los dos son verdad, según el caso.
  const tcs=S.tarjetasCredito||[];
  const tcTotal=tcs.reduce((a,tc)=>a+Math.max(0,tc.deuda||0),0);
  const saldoAFavorTC=tcs.reduce((a,tc)=>a+Math.max(0,-(tc.deuda||0)),0);
  const netaPeorCaso=libre+cdtsVencidos-(tcTotal+d.yoDebo+d.ajeno);
  const cdtsBloqueados=d.cdts-cdtsVencidos;
  return {
    libre, tcPropia, yoDebo:d.yoDebo, ajeno:d.ajeno, obligaciones,
    tcTotal, saldoAFavorTC, netaPeorCaso,
    neta,                    // liquidez real: la que mide el fondo de emergencia
    cdts:d.cdts,             // todos los CDTs (vencidos o no): es la parte del patrimonio
    cdtsVencidos,            // ya sumados en `neta`
    cdtsBloqueados,          // los que aún no vencen: no sirven de emergencia
    conCDTs:neta+cdtsBloqueados, // si además se cuentan los CDTs bloqueados (= libre + cdts − obligaciones)
    meDeben:d.meDeben,
  };
}

// calcC/calcCDT (nu-calc.js) y Deudas (calc-helpers.js) son núcleo de carga de
// entrada, así que el patrimonio ya no depende de ningún módulo lazy: el snapshot
// siempre se puede tomar. Se conserva la función como guard mínimo por si el
// orden de <script> se rompiera (un snapshot sin estas piezas grabaría un valor
// artificialmente bajo en S.patrimonioHistorial).
function _patrimonioDependenciasListas(){
  return typeof calcC==='function'
      && typeof calcCDT==='function'
      && typeof Deudas!=='undefined';
}

// Ajuste por destape de la alcancía, por fecha: sobrante (+) o faltante (−) entre el efectivo real y
// lo que estaba registrado. Es plata que ya existía y no estaba anotada (o dinero que faltaba), no
// crecimiento del día: se suma a `montoBase` para que ni la gráfica de Análisis ni la Proyección lo
// tomen como ritmo normal de ahorro (2026-09-29). Sigue contando como ingreso/gasto del mes en Análisis.
// - Sobrante: S.movimientos, tipo 'entrada', _esAlcancia (sin _esAlcanciaIngreso, que son depósitos).
// - Faltante: S.gastosVar con _esAlcanciaAjuste.
function _ajusteAlcanciaPorFecha(){
  const r={};
  (S.movimientos||[]).forEach(m=>{
    if(m&&m.tipo==='entrada'&&m._esAlcancia&&!m._esAlcanciaIngreso&&m.fecha){ r[m.fecha]=(r[m.fecha]||0)+(m.monto||0); }
  });
  (S.gastosVar||[]).forEach(g=>{
    if(g&&g._esAlcanciaAjuste&&g.fecha){ r[g.fecha]=(r[g.fecha]||0)-(g.monto||0); }
  });
  return r;
}

// Recalcula `montoBase` de cada punto del historial de patrimonio a partir de los datos actuales (aperturas, ajustes de
// saldo inicial, destapes de alcancía y deudas sin pata de caja). load() la llama en cada carga, así las correcciones
// valen también hacia atrás sin migración; scripts/conciliacion.js la usa para medir lo mismo que ve la app.
function recalcularMontoBaseHistorial(){
  // Eliminar un saldo inicial ya no deja ningún registro aparte (ver purgarAperturaDelHistorial): la base sale solo de
  // lo que existe. `_ajustesBaseLog` era ese registro y, con el movimiento ya borrado, quedaba como un ajuste negativo
  // sin respaldo que inflaba la gráfica; se retira de los datos que aún lo traen.
  delete S._ajustesBaseLog;
  // Calcular el monto exacto de aperturas y ajustes de saldo inicial por fecha en el historial de patrimonio. Así la
  // tendencia mensual descuenta solo esa parte del cambio del día y conserva cualquier ingreso real que haya ocurrido
  // la misma fecha, sin tener que esperar a un nuevo snapshot.
  if(S.patrimonioHistorial.length){
    const montoAperturaPorFecha = {};
    const sumarApertura=(m)=>{
      if(m.tipo==='apertura'){ montoAperturaPorFecha[m.fecha]=(montoAperturaPorFecha[m.fecha]||0)+(m.monto||0); }
      if(m._ajustes){ m._ajustes.forEach(aj=>{ montoAperturaPorFecha[aj.fecha]=(montoAperturaPorFecha[aj.fecha]||0)+(aj.monto||0); }); }
    };
    (S.movimientos||[]).forEach(sumarApertura);
    // Destapes de alcancía ya hechos (sobrante/faltante): mismo tratamiento que una apertura — ver _ajusteAlcanciaPorFecha().
    const _ajAlc=_ajusteAlcanciaPorFecha();
    Object.keys(_ajAlc).forEach(f=>{ montoAperturaPorFecha[f]=(montoAperturaPorFecha[f]||0)+_ajAlc[f]; });
    // Deudas sin pata de caja (ver _movsDeudaSinCuenta): ajuste de base, no crecimiento. Vale hacia atrás: se recalcula en cada carga.
    const _ajDeu=_ajusteDeudasSinCuentaPorFecha();
    Object.keys(_ajDeu).forEach(f=>{ montoAperturaPorFecha[f]=(montoAperturaPorFecha[f]||0)+_ajDeu[f]; });
    S.patrimonioHistorial.forEach(h=>{
      if(montoAperturaPorFecha[h.fecha]&&montoAperturaPorFecha[h.fecha]!==0){ h.montoBase=montoAperturaPorFecha[h.fecha]; }
      else { delete h.baseAjustada; delete h.montoBase; } // sin respaldo en los datos actuales: se limpia (p. ej. se borró el préstamo sin cuenta que lo originó)
    });
  }
}

// Movimientos de DEUDAS que cambian el patrimonio sin pasar por ninguna cuenta ("sin pata de caja"): un préstamo
// "Me deben" sin cuenta ni tarjeta de origen (sube lo que te deben y ninguna cuenta baja → patrimonio +), un abono
// o pago recibido sin cuenta destino (baja lo que te deben y ninguna cuenta sube → −), y lo mismo en "Yo debo"
// (recibido sin cuenta → −, pago sin cuenta → +). No son ingreso ni gasto del mes: si se contaran como flujo,
// inflarían o hundirían el balance; y si no se descuentan de la tendencia, la gráfica y la proyección de Inicio
// los leen como crecimiento real (un solo préstamo de $500.000 sin cuenta llevó la proyección a 12 meses de
// +$1,2 M a +$6,7 M). Por eso se tratan como ajuste de base, igual que una apertura de cuenta (montoBase).
// Quedan fuera: los perdones (ya cuentan como gasto/ingreso), lo pagado con TC (`_viaTC`: la tarjeta es la otra
// pata) y los movimientos con `fuentes`/`destinos` repartidos (la diferencia puede ser un margen ya registrado).
// Si el movimiento trae `clase:'ingreso'` es plata nueva (p. ej. un regalo): cuenta como ingreso del mes y NO como base.
function _movsDeudaSinCuenta(estado){
  const st=estado||S, out=[];
  const veces=(lista,abre,reduce)=>(lista||[]).forEach(d=>(d.movimientos||[]).forEach(m=>{
    if(!m||!m.fecha||!(m.monto>0)||m._perdon||m._viaTC) return;
    if(m.fuente||m.destino||(m.fuentes&&m.fuentes.length)||(m.destinos&&m.destinos.length)) return;
    let signo=0;
    if(abre.indexOf(m.tipo)!==-1) signo=abre===ME_DEBEN_ABRE?1:-1;
    else if(reduce.indexOf(m.tipo)!==-1) signo=abre===ME_DEBEN_ABRE?-1:1;
    if(signo) out.push({m,deuda:d,fecha:m.fecha,monto:signo*m.monto,clase:m.clase});
  }));
  veces(st.deudores,ME_DEBEN_ABRE,['abono','pago-completo']);
  veces(st.misDeudas,YO_DEBO_ABRE,['pago','abono','pago-completo']);
  return out;
}
const ME_DEBEN_ABRE=['prestamo'], YO_DEBO_ABRE=['recibido'];
function _ajusteDeudasSinCuentaPorFecha(){
  const r={};
  _movsDeudaSinCuenta().forEach(x=>{ if(x.clase!=='ingreso') r[x.fecha]=(r[x.fecha]||0)+x.monto; });
  return r;
}

// Cierre de cada mes (un punto por mes, SIN límite): la serie diaria se poda a 365 días, y a mediados de enero ya no queda el 1 de enero
// del año anterior, así que el Wrapped no podía medir el año completo. Cada mes guarda su último valor y la suma de los montos de apertura
// (`base`, lo que no es crecimiento real). Se rellena desde la serie diaria (también los meses anteriores a esta versión) y se vuelve a
// calcular en cada snapshot solo con lo que la serie aún conserva; un mes cuyos días ya se podaron conserva su cierre.
function _actualizarCierresPatrimonio(){
  if(!S.patrimonioCierres||typeof S.patrimonioCierres!=='object')S.patrimonioCierres={};
  const porMes={};
  (S.patrimonioHistorial||[]).forEach(h=>{
    if(!h||!h.fecha)return;
    const m=h.fecha.slice(0,7);
    const g=porMes[m]||(porMes[m]={ult:null,base:0});
    if(!g.ult||h.fecha>=g.ult.fecha)g.ult=h;
    g.base+=(h.montoBase||0);
  });
  const mesesSerie=Object.keys(porMes).sort();
  mesesSerie.forEach((m,i)=>{
    const g=porMes[m];
    const previo=S.patrimonioCierres[m];
    // El primer mes de una serie ya podada (365 puntos) puede estar incompleto: sus aperturas anteriores solo viven en el cierre guardado.
    const recortado=i===0&&previo&&(S.patrimonioHistorial||[]).length>=365;
    S.patrimonioCierres[m]={valor:g.ult.valor,valorVisible:(g.ult.valorVisible!=null?g.ult.valorVisible:g.ult.valor),base:recortado?previo.base:g.base};
  });
}

function snapshotPatrimonio(){
  if(!_patrimonioDependenciasListas()) return;
  const hoyStr=hoy();
  if(!S.patrimonioHistorial)S.patrimonioHistorial=[];
  const _pat=calcPatrimonioDesglose();
  const val=_pat.total;
  if(val==null||isNaN(val)){
    // Mismo motivo que el guard de refresh() más abajo: antes esto fallaba
    // en silencio total (ni siquiera un $0 en pantalla, solo un snapshot que
    // nunca se grababa). Ver CHANGELOG.md#patrimonio-y-cálculos-globales.
    console.error('[snapshotPatrimonio] calcPatrimonioTotal() dio', val, '— no se graba el punto de hoy. Revisar fechas corruptas u otra fuente de NaN.');
    return;
  }
  // Alcancía: se resta para el valor "visible" del historial/gráfica de Análisis Financiero.
  // El total real (val) sí la incluye y es el que usan el health score y la proyección,
  // pero mostrar la serie cruda en la gráfica revelaría los depósitos día a día —
  // rompiendo el propósito de "ocultar" el saldo (igual que ya hace el hero de Inicio).
  const valVisible=_pat.visible;
  // ¿Hoy se registró algún saldo inicial (cajita nueva, Nequi, Efectivo, cuenta personalizada)
  // o se corrigió uno existente? La app ya sabe distinguir esto vía tipo:'apertura' (ver
  // crearMovimientoApertura) y vía _ajustes (ver confirmarEditarApertura). Guardamos el
  // MONTO exacto (no solo un flag) para que el cálculo de tendencia pueda restar únicamente
  // esa parte del cambio del día y conservar cualquier ingreso real que haya ocurrido el
  // mismo día (ej. apertura + mesada el mismo día).
  const sumarAperturasYAjustesDeHoy = (movs)=> (movs||[]).reduce((a,m)=>{
    let t = 0;
    if(m.tipo==='apertura'&&m.fecha===hoyStr) t += (m.monto||0);
    if(m._ajustes) t += m._ajustes.filter(aj=>aj.fecha===hoyStr).reduce((b,aj)=>b+(aj.monto||0),0);
    return a+t;
  },0);
  const montoAperturaHoy =
    sumarAperturasYAjustesDeHoy(S.movimientos)
    + (_ajusteAlcanciaPorFecha()[hoyStr]||0)
    + (_ajusteDeudasSinCuentaPorFecha()[hoyStr]||0);
  const ultimo=S.patrimonioHistorial[S.patrimonioHistorial.length-1];
  if(ultimo&&ultimo.fecha===hoyStr){
    ultimo.valor=val;
    ultimo.valorVisible=valVisible;
    if(montoAperturaHoy!==0)ultimo.montoBase=montoAperturaHoy; else delete ultimo.montoBase;
  }
  else{
    const punto={fecha:hoyStr,valor:val,valorVisible:valVisible};
    if(montoAperturaHoy!==0)punto.montoBase=montoAperturaHoy;
    S.patrimonioHistorial.push(punto);
  }
  _actualizarCierresPatrimonio();
  if(S.patrimonioHistorial.length>365)S.patrimonioHistorial=S.patrimonioHistorial.slice(-365);
  // (No localStorage — Firebase lo guarda _fbSaveToCloud)
}

// ── Eliminar un movimiento no deja rastro en el historial de patrimonio ─────────────────────────────────────────
// S.patrimonioHistorial guarda una instantánea por día (el patrimonio al cierre de ese día). Si después se elimina algo
// que ya estaba contado (un ingreso puesto por error, un gasto mal registrado), las instantáneas desde el día en que se
// creó siguen incluyéndolo: la gráfica mostraría un salto sin ningún movimiento que lo respalde. Quitar de esas
// instantáneas lo que cambió el patrimonio al eliminar hace que borrar equivalga a «nunca ocurrió». Cada flujo de
// eliminación mide el patrimonio antes de revertir y llama a purgarEfectoEnHistorial() antes de guardar. Editar un
// movimiento es eliminar y crear otro, así que queda cubierto por el mismo camino.
// Límite: el efecto se resta por igual en todos los días desde la creación; el interés que una cajita de Nu haya
// generado sobre ese dinero entre medias entra en el cálculo como si hubiera estado desde el primer día.

// Patrimonio total y el «visible» (sin Alcancía, el que guarda valorVisible), o null si no se puede medir.
function medirPatrimonioParaHistorial(){
  if(!_patrimonioDependenciasListas()) return null;
  const d=calcPatrimonioDesglose();
  if(d.total==null||isNaN(d.total)) return null;
  return {val:d.total, vis:d.visible};
}

// Día (YYYY-MM-DD) en que el movimiento entró al patrimonio: el de su creación (ts, o la hora que lleva su id de uid()),
// no la fecha que el usuario le puso, que puede ser pasada. Sin ninguno de los dos, su fecha.
function diaCreacionMov(item){
  if(!item) return '';
  let ms=Number(item.ts);
  if(!Number.isFinite(ms)||ms<=0){
    const id=item.id!=null?item.id:item._id;
    ms=(typeof id==='string'&&/^[0-9a-z]{10,12}$/.test(id))?parseInt(id.slice(0,-3),36):NaN;
  }
  if(Number.isFinite(ms)&&ms>1.5778e12&&ms<=Date.now()+Fecha.MS_DIA){
    return Fecha.iso(new Date(ms));
  }
  return item.fecha||'';
}

// Suma `delta` (y `deltaVisible`, por defecto igual) a las instantáneas con fecha >= dia.
function quitarDeHistorial(dia, delta, deltaVisible){
  if(!dia||!S.patrimonioHistorial) return;
  const dv=deltaVisible===undefined?delta:deltaVisible;
  const r=n=>Math.round(n*1e6)/1e6;
  S.patrimonioHistorial.forEach(h=>{
    if(!h.fecha||h.fecha<dia) return;
    h.valor=r((h.valor||0)+delta);
    if(h.valorVisible!=null) h.valorVisible=r(h.valorVisible+dv);
  });
  // Los cierres mensuales (S.patrimonioCierres, sin límite) también arrastran el movimiento: los meses ya podados de la serie diaria
  // solo viven ahí. Los meses que aún están en la serie se recalculan igual en el próximo snapshot, con el mismo resultado.
  const mesDia=dia.slice(0,7), cierres=S.patrimonioCierres||{};
  Object.keys(cierres).forEach(k=>{
    const c=cierres[k];
    if(k<mesDia||!c) return;
    c.valor=r((c.valor||0)+delta);
    if(c.valorVisible!=null) c.valorVisible=r(c.valorVisible+dv);
  });
}

// `antes` viene de medirPatrimonioParaHistorial() justo antes de revertir; `item` es lo que se eliminó.
function purgarEfectoEnHistorial(antes, item){
  const despues=medirPatrimonioParaHistorial();
  if(!antes||!despues) return;
  const d=despues.val-antes.val, dv=despues.vis-antes.vis;
  if(Math.abs(d)<0.005&&Math.abs(dv)<0.005) return;
  quitarDeHistorial(diaCreacionMov(item), d, dv);
}

// Un saldo inicial entró por partes: el monto original el día que se creó la cuenta y cada corrección (`_ajustes`, que
// confirmarEditarApertura deja con su fecha) el día en que se hizo. `m.monto` ya incluye las correcciones.
function purgarAperturaDelHistorial(m){
  if(!m) return;
  const ajustes=m._ajustes||[];
  const original=(m.monto||0)-ajustes.reduce((a,x)=>a+(x.monto||0),0);
  quitarDeHistorial(diaCreacionMov(m), -original);
  ajustes.forEach(x=>quitarDeHistorial(x.fecha, -(x.monto||0)));
}

// Calcula cuánta plata de encargos (dinero que estás cuidando de otra persona,
// "No es tuyo") está guardada físicamente en una cuenta cualquiera — cajita de Nu,
// Nequi, Efectivo o una cuenta personalizada. cuentaKey usa el mismo formato que
// getFuentesSinTC(): 'cajita:ID', 'cuenta:ID'.
function _saldoEncargosEnCuenta(cuentaKey){
  if(!S||!S.encargos||!cuentaKey)return 0;
  let total=0;
  (S.encargos||[]).forEach(enc=>{
    const map={};
    if((enc.saldoInicial||0)>0){
      const k=enc.cuentaInicial||'__sin__';
      map[k]=(map[k]||0)+(enc.saldoInicial||0);
    }
    (enc.movimientos||[]).forEach(m=>{
      const k=m.cuenta||'__sin__';
      if(m.tipo==='entrada')map[k]=(map[k]||0)+(m.monto||0);
      else map[k]=(map[k]||0)-(m.monto||0);
    });
    const v=map[cuentaKey]||0;
    if(v>0)total+=v;
  });
  return total;
}
// Caso específico de cajitas de Nu — Nu genera interés sobre TODO el dinero de
// la cajita (propio + encargos), y esos intereses son del dueño de la cajita.
// Se mantiene esta función con nombre propio porque calcC() ya la usa así.
// Nu: tasa EA (historial por tramos) y cálculo de CDTs migrados a js/modules/nu.js (el cálculo puro, a nu-calc.js).
