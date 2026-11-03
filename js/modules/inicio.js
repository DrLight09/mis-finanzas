/* ================================================================
   MÓDULO: INICIO (Dashboard) — js/modules/inicio.js
   ================================================================
   Migrado desde index.html — ver auditoria-tecnica.md #3.

   Contiene todo lo que renderiza/afecta específicamente la pantalla
   #screen-inicio: la sección "Necesita atención", el indicador de
   salud financiera y la proyección financiera, más el aviso de
   "Gastos altos" en el hero.

   Qué NO vive acá (a propósito):
   - refresh(): es el orquestador central compartido por las 13
     pantallas (actualiza cuentas, gastos, deudores, mesada, spotify,
     etc. además de Inicio) — moverlo rompería el patrón ya usado en
     TC/Cuentas de dejar en index.html lo que es realmente compartido.
   - El hook _renderMejoras()/_hookRefreshMejoras() que llama a
     renderHealthScore()/renderProyeccion(): sigue en index.html
     porque ese mismo hook también dispara renderPresupuestos()
     (módulo de Análisis, no de Inicio) — es infraestructura
     compartida entre dos módulos, no algo que se pueda partir sin
     tocar Análisis, que está fuera del alcance de esta sesión.

   Requiere estar cargado DESPUÉS de: mesada.js, spotify.js,
   prestado.js, tarjetas_credito.js, cuentas.js (usa spNombreDe,
   getMesadaData, tcCupoUsadoPct, etc. definidos ahí) y después de
   js/core/events.js.

   Nota (2026-08-02): las llamadas a getDeudorSaldo, getMesadaData,
   _getCuotaAnio, tcCupoUsadoPct, spPersonaPagadaVigente y spNombreDe
   ahora tienen guard typeof === 'function' — mismo patrón que ya usaba
   calcPatrimonioTotal/totalPrestadoPendiente/calcC/calcCDT en este
   mismo archivo. No cambia el comportamiento actual (todo sigue
   cargando de entrada); habilita que mesada/spotify/prestado/
   tarjetas_credito puedan volverse lazy sin romper el dashboard.
   Ver auditoria-tecnica.md #4.
   ================================================================ */

/* ---- DASHBOARD ATENCIÓN ---- */
// Migrado a html`` (js/core/html-tag.js, ver auditoria-tecnica.md "Auditoría
// exhaustiva de .innerHTML" — nota 2026-08-25, cierre de la discrepancia
// abierta desde el 2026-07-22, cuando este módulo había quedado listado como
// "migrado" sin serlo realmente). `texto` ahora se arma con html`` en cada
// `items.push(...)`: el resultado es un fragmento ya-seguro (misma propiedad
// de "anidamiento sin doble escapado" validada con el piloto de
// abrirPresupuestos()/renderPresupuestos() en analisis.js), así que el
// render final (más abajo) puede interpolar `it.texto` sin volver a escapar
// ni perder el escapado ya aplicado acá. d.nombre, tc.nombre, spNombreDe(p),
// c.nombre, enc.nombre y p.desc son los seis campos de texto libre reales de
// esta función — pNombre y _mesNombreDeKey(k) son vocabulario fijo/fechas
// calculadas, sin riesgo, pero quedan igual bajo el escapado por defecto de
// html`` sin que eso cambie cómo se ven (dígitos y texto fijo no tienen
// caracteres especiales de HTML).
// Situación financiera: lo más urgente, con las mismas reglas que Salud (calcLiquidez, Periodo, helpers de arriba), no con unas propias.
// Antes «Necesita atención» no avisaba de liquidez negativa, de meses seguidos en déficit ni de que casi no te quedan meses de reserva.
function _itemsSituacion(items){
  const mes=mesActual();
  const liq=calcLiquidez();
  const gastoRef=Periodo.gastoPromedioPrevio(mes,UMBRALES.salud.mesesReferencia).promedio;
  const cubiertos=_mesesCubiertos(liq.neta,gastoRef);
  if(liq.neta<0){
    items.push({tipo:'red',texto:html`Tus deudas superan la plata que tienes disponible en ${fmt(-liq.neta)}`});
  } else if(cubiertos!==null && _nivelRunway(cubiertos)==='critico'){
    items.push({tipo:'amber',texto:html`${_textoRunway(cubiertos)}`});
  }
  const ingresoTipico=Periodo.ingresoPromedioPrevio(mes,UMBRALES.salud.mesesReferencia).promedio;
  const racha=Periodo.rachaDeficit(mes,6);
  const n=_rachaDeficitRelevante(racha,ingresoTipico,cubiertos);
  if(n>0) items.push({tipo:n>=UMBRALES.salud.rachaDeficitMeses.alerta?'red':'amber',texto:html`Llevas ${n} meses seguidos gastando más de lo que ingresas (${fmt(-racha.acumulado)} en total)`});
}

// Gastos fijos con día de vencimiento (Periodo.gastosFijosProgramados): vencidos sin pagar (rojo), por vencer (ámbar) y la «brecha de
// caja»: si lo que vence en los próximos días (más lo que ya venció sin pagar) supera tu plata disponible, se avisa antes de que pase.
// Incluye el mes siguiente: el día 30, el arriendo del día 1 ya está a un paso.
function _itemsGastosFijos(items, liq){
  const hoyStr=hoy();
  const mes=mesActual();
  const prog=[...Periodo.gastosFijosProgramados(mes,hoyStr), ...Periodo.gastosFijosProgramados(Periodo.mesDesplazado(mes,1),hoyStr)];
  const plural=n=>n===1?'día':'días';
  prog.forEach(g=>{
    if(g.dias<0) items.push({tipo:'red',texto:html`${g.nombre} venció hace ${-g.dias} ${plural(-g.dias)} y no está pagado (${fmt(g.monto)})`});
    else if(g.dias===0) items.push({tipo:'amber',texto:html`${g.nombre} vence hoy (${fmt(g.monto)})`});
    else if(g.dias<=UMBRALES.atencion.gastoFijoAvisoDias) items.push({tipo:'amber',texto:html`${g.nombre} vence en ${g.dias} ${plural(g.dias)} (${fmt(g.monto)})`});
  });
  const N=UMBRALES.atencion.brechaCajaDias;
  const comprometido=prog.filter(g=>g.dias<=N).reduce((a,g)=>a+g.monto,0);
  const disponible=Math.max(0,liq.neta);
  if(comprometido>disponible) items.push({tipo:'red',texto:html`En los próximos ${N} días vencen ${fmt(comprometido)} y tu plata disponible es ${fmt(disponible)}`});
}

function renderAttencion(){
  const items=[];
  const hoyStr=hoy();
  _itemsSituacion(items);
  _itemsGastosFijos(items, calcLiquidez());
  // Deudores con saldo pendiente
  if(typeof getDeudorSaldo==='function'){
    Deudas.lista('favor').forEach(d=>{
      const s=getDeudorSaldo(d);
      if(s>0) items.push({tipo:'amber',texto:html`${d.nombre} te debe ${fmt(s)}`});
    });
    // Lo que tú debes a personas («Yo debo»): antes no aparecía en ningún aviso, solo contaba dentro de la liquidez.
    Deudas.lista('contra').forEach(d=>{
      const s=getDeudorSaldo(d);
      if(s>0) items.push({tipo:'amber',texto:html`Le debes ${fmt(s)} a ${d.nombre}`});
    });
  }
  // Mesadas con pago parcial que quedó pendiente
  if(S.modulos&&S.modulos.mesada&&typeof getMesadaData==='function'){
    ['papa','mama'].forEach(parent=>{
      const data=getMesadaData(parent);
      const pNombre=parent==='papa'?'Papá':'Mamá';
      Object.keys(data).forEach(k=>{
        const info=data[k];
        if(info&&info.pendiente>0){
          items.push({tipo:'amber',texto:html`${pNombre} te debe ${fmt(info.pendiente)} de la mesada de ${_mesNombreDeKey(k)}`});
        }
      });
    });
  }
  // Tarjetas de crédito con el cupo casi agotado (sin fechas — este modelo no
  // simula ciclos de facturación, solo avisa cuando el cupo disponible es bajo)
  (S.tarjetasCredito||[]).forEach(tc=>{
    if((tc.estado||'activa')!=='activa'){
      // Una tarjeta que ya no está activa pero sigue con deuda también se debe: antes quedaba fuera de todos los avisos.
      if((tc.deuda||0)>0) items.push({tipo:'amber',texto:html`${tc.nombre}: tarjeta ${tc.estado} con deuda de ${fmt(tc.deuda)}`,_tcId:tc.id});
      return;
    }
    const cupo=tc.cupo||0;
    if(!cupo)return;
    if(typeof tcCupoUsadoPct!=='function')return;
    const pct=tcCupoUsadoPct(tc);
    if(pct>=100){
      items.push({tipo:'red',texto:html`${tc.nombre}: cupo agotado — deuda ${fmt(tc.deuda||0)}`,_tcId:tc.id});
    } else if(pct>=UMBRALES.atencion.cupoTcCasiAgotadoPct){
      items.push({tipo:'amber',texto:html`${tc.nombre}: cupo casi agotado (${pct.toFixed(0)}% usado)`,_tcId:tc.id});
    }
  });
  // Spotify personas vencidas (solo si el módulo está activo)
  if(S.modulos&&S.modulos.spotify&&typeof spPersonaPagadaVigente==='function'&&typeof spNombreDe==='function'){
    (S.spotify.personas||[]).forEach(p=>{
      if(p.proximoPago&&p.proximoPago<hoyStr&&!spPersonaPagadaVigente(p)){
        // spNombreDe() devuelve texto libre (nombre de persona) — html`` lo
        // escapa por defecto. Mismo hallazgo que motivó el fix original con
        // escHtml() a mano (2026-07-22), ahora bajo la protección automática.
        items.push({tipo:'red',texto:html`Cobro Spotify de ${spNombreDe(p)} vencido`});
      }
    });
  }
  // Cajitas con CDT próximas a vencer (7 días)
  (S.cajitas||[]).forEach(c=>{(c.cdts||[]).filter(cdt=>cdt.vence).forEach(cdt=>{
    const diasRestantes=Math.ceil((_fechaSafe(cdt.vence)-new Date())/86400000);
    if(diasRestantes>=0&&diasRestantes<=UMBRALES.atencion.cdtAvisoDias) items.push({tipo:'amber',texto:html`CDT "${c.nombre}" vence en ${diasRestantes}d`});
    if(diasRestantes<0) items.push({tipo:'red',texto:html`CDT "${c.nombre}" venció — ¡libera tu plata!`});
  });});
  // Partes comprometidas de un encargo (§ "¿Para qué es esta plata?") cuya
  // fecha de uso ya está cerca. Desde 1 día antes avisa en ámbar; si ya
  // pasó la fecha y sigue sin marcarse "ya la usé", avisa en rojo — esa
  // plata sigue comprometida y sin usar.
  (S.encargos||[]).forEach(enc=>{
    (enc.partes||[]).filter(p=>!p.usada&&p.fecha).forEach(p=>{
      const dias=Math.round((_fechaSafe(p.fecha)-_fechaSafe(hoyStr))/86400000);
      if(dias<0){
        items.push({tipo:'red',texto:html`${enc.nombre}: "${p.desc}" (${fmt(p.monto)}) venció hace ${Math.abs(dias)}d sin usarse — sigue comprometida`});
      } else if(dias<=1){
        items.push({tipo:'amber',texto:html`${enc.nombre}: "${p.desc}" (${fmt(p.monto)}) es ${dias===0?'hoy':'mañana'} — esa plata ya está comprometida`});
      }
    });
  });
  const sec=document.getElementById('s-attn-section');
  const list=document.getElementById('s-attn-list');
  if(!items.length){sec.style.display='none';return;}
  sec.style.display='';

  // Toggle colapsable con detección de items nuevos
  const hasRed = items.some(i=>i.tipo==='red');
  const titleEl = sec.querySelector('.sec-title');
  if(titleEl) {
    // Fingerprint = string con los textos de todos los items actuales
    const fingerprint = items.map(i=>i.texto).sort().join('|');
    const lastFingerprint = localStorage.getItem('attn-fingerprint');
    const storedOpen = localStorage.getItem('attn-open');
    // `items` depende de Préstamos/Spotify/Tarjetas/Mesada (getDeudorSaldo,
    // getMesadaData, etc. más abajo, todos con guard typeof), que son módulos
    // lazy (lazy-loader.js). renderAttencion() corre en cada refresh(), y hay
    // refresh() tempranos (antes de que esos módulos terminen de cargar) donde
    // `items` viene incompleto. Si se comparara ese fingerprint parcial contra
    // el completo de la sesión anterior, `hayNuevos` daría true por la carga
    // en sí (no porque haya algo realmente nuevo) y reabriría la sección
    // aunque la hubieras dejado cerrada. Por eso solo se compara/guarda una
    // vez que `window._appFullyLoaded` es true (lazy-loader.js la pone en
    // true recién cuando ensureAll() termina y dispara su refresh() final,
    // con todos los módulos ya cargados). Si Loader no existe (entorno sin
    // lazy-loading), se trata como ya cargado.
    const appLoaded = typeof window._appFullyLoaded === 'undefined' ? true : window._appFullyLoaded;
    // Abrir automáticamente solo si los items cambiaron desde la última vez que se vieron.
    // Se usa localStorage (no sessionStorage) para que esta comparación sobreviva a cerrar
    // el navegador del todo: si no, al no haber lastFingerprint en una sesión nueva,
    // hayNuevos daba siempre true y abría la sección aunque no hubiera nada nuevo.
    const hayNuevos = appLoaded && fingerprint !== lastFingerprint;
    const isOpen = hayNuevos ? true : (storedOpen === '1');
    // Si había items nuevos y ahora abrimos, guardar el fingerprint como "visto"
    if(appLoaded && hayNuevos) localStorage.setItem('attn-fingerprint', fingerprint);
    titleEl.style.cursor = 'pointer';
    titleEl.style.display = 'flex';
    titleEl.style.justifyContent = 'space-between';
    titleEl.style.alignItems = 'center';
    // Evita que taps rápidos/repetidos seleccionen el texto del título o el
    // número del badge (el navegador en móvil reinterpreta clicks sucesivos
    // muy rápidos como un "doble tap = seleccionar palabra").
    titleEl.style.userSelect = 'none';
    titleEl.style.webkitUserSelect = 'none';
    titleEl.style.webkitTouchCallout = 'none';
    // touch-action:manipulation quita el pequeño delay que el navegador usa
    // para esperar un posible doble-tap (zoom), que es justo la ventana en la
    // que un tap rápido termina reinterpretándose como selección de texto.
    titleEl.style.touchAction = 'manipulation';
    titleEl.innerHTML = `Necesita atención <span class="inicio-attn-badge ${hasRed?'inicio-attn-badge-red':'inicio-attn-badge-amber'}">${items.length} <i class="fa-solid ${isOpen?'fa-chevron-up':'fa-chevron-down'}"></i></span>`;
    // NOTA: renderAttencion() corre en cada refresh() y titleEl es el MISMO
    // nodo del DOM entre renders (solo se le pisa el innerHTML, no se
    // recrea) — por eso hay que sacar el listener anterior antes de agregar
    // uno nuevo. Antes se hacía addEventListener sin guardar referencia
    // para sacarlo: se iban acumulando uno por cada refresh(), y con un
    // número par acumulado, un click disparaba todos y se cancelaban entre
    // sí (abre-cierra-abre-cierra), sin efecto visible — bug real, detectado
    // en producción, no relacionado con la extracción de sheet-stack.js.
    // No alcanza con guardar el handler una sola vez (ej. patrón
    // sheet._personaHook de otros módulos): `items` es una variable local
    // de este renderAttencion(), y el handler la usa en el badge al hacer
    // toggle — si el handler quedara fijo del primer render, mostraría
    // el `items.length` de ESE momento para siempre, no el actual.
    if(titleEl._attnClickHandler) titleEl.removeEventListener('click', titleEl._attnClickHandler);
    titleEl._attnClickHandler = () => {
      const nowOpen = list.style.display === 'none';
      list.style.display = nowOpen ? '' : 'none';
      localStorage.setItem('attn-open', nowOpen ? '1' : '0');
      const badge = titleEl.querySelector('span');
      if(badge) badge.innerHTML = `${items.length} <i class="fa-solid ${nowOpen?'fa-chevron-up':'fa-chevron-down'}"></i>`;
    };
    titleEl.addEventListener('click', titleEl._attnClickHandler);
    // El userSelect:none/touchAction:manipulation de arriba no alcanza en algunos
    // navegadores Android (Brave/Chrome) para bloquear el "doble tap = seleccionar
    // palabra". Mismo patrón que ya usa renderProyeccion() (header/cards 3m-6m-12m):
    // preventDefault() en touchend evita que el navegador dispare la selección nativa.
    if(titleEl._attnTouchHandler) titleEl.removeEventListener('touchend', titleEl._attnTouchHandler);
    titleEl._attnTouchHandler = (e) => { e.preventDefault(); titleEl._attnClickHandler(); };
    titleEl.addEventListener('touchend', titleEl._attnTouchHandler, {passive:false});
    list.style.display = isOpen ? '' : 'none';
    localStorage.setItem('attn-open', isOpen ? '1' : '0');
  }

  // it.texto ya es un fragmento html`` seguro (armado más arriba, en cada
  // items.push) — se interpola tal cual, sin volver a pasar por escapado
  // (misma propiedad de anidamiento que abrirPresupuestos()/renderPresupuestos()
  // en analisis.js). raw(it.tipo) porque tipo es vocabulario fijo del propio
  // código ('red'/'amber'), nunca texto del usuario.
  list.innerHTML=html`${items.map(it=>html`<div class="card card-sm ${raw(it.tipo==='red'?'attn-card-red':'attn-card')} inicio-attn-item">
    <div class="inicio-attn-texto ${raw(it.tipo==='red'?'inicio-attn-texto-red':'inicio-attn-texto-amber')}">${it.texto}</div>
  </div>`)}`;
}

/* ====================================================
   INDICADOR DE SALUD FINANCIERA
==================================================== */
/* ----------------------------------------------------------------
   Reglas compartidas por Salud y «Necesita atención» (una sola definición: antes cada una habría tenido su copia y habrían derivado)
   ---------------------------------------------------------------- */
// «Runway»: cuántos meses de gasto típico cubre tu liquidez, sin contar ingresos. null si aún no hay gasto típico; 0 si la liquidez no
// es positiva.
function _mesesCubiertos(liquidoReal, gastoRef){
  return gastoRef > 0 ? Math.max(0, liquidoReal) / gastoRef : null;
}
// Nivel del runway según UMBRALES.runway: 'critico' | 'atencion' | 'ok'.
function _nivelRunway(meses){
  return meses < UMBRALES.runway.critico ? 'critico' : meses < UMBRALES.runway.atencion ? 'atencion' : 'ok';
}
// Texto del runway («Cubres 3,4 meses de gastos»).
function _textoRunway(meses){
  if(meses <= 0) return 'Tu plata disponible no cubre tus gastos';
  if(meses < 1) return 'Cubres menos de 1 mes de gastos';
  if(meses >= 24) return 'Cubres más de 24 meses de gastos';
  const n = meses.toFixed(1).replace('.', ',');
  return 'Cubres ' + n + (n === '1,0' ? ' mes' : ' meses') + ' de gastos';
}
// Meses seguidos de déficit que merecen aviso (0 si no merecen): solo con ingreso reciente registrado (sin él, «déficit» sería solo
// no haber anotado ingresos) y sin un fondo sólido (≥ 6 meses de gasto) que la absorba.
function _rachaDeficitRelevante(racha, ingresoTipico, mesesCubiertos){
  if(!(ingresoTipico > 0)) return 0;
  if(mesesCubiertos !== null && mesesCubiertos >= UMBRALES.salud.fondoMeses.completo) return 0;
  return racha.meses >= UMBRALES.salud.rachaDeficitMeses.aviso ? racha.meses : 0;
}

function calcHealthScore(){
  const S = window.S || {};
  if(!S.cajitas) return null;
  let score = 50;
  // Cada consejo lleva su TIPO explícito (no se deduce del texto):
  //   ok         → algo ya cumplido o bien hecho (check verde)
  //   alerta     → importante, hay que atenderlo (rojo, advertencia)
  //   aviso      → conviene mirarlo (ámbar, advertencia)
  //   sugerencia → oportunidad o tarea pendiente, no un logro (neutro, ícono de información); `ir` = pantalla donde se resuelve
  const consejos = [];
  const add = (texto, tipo, ir) => { consejos.push({ texto, tipo, ir: ir || '' }); };

  // ── Cálculos base ────────────────────────────────────────────────────
  // Patrimonio VISIBLE (sin alcancía) — mismo criterio que renderProyeccion().
  // El riesgo real acá es bajo: `patrimonio` solo se usa como gate booleano
  // (tieneAlgo) y en el ratio deudaTC/patrimonio cuando no hay ingresos del
  // mes registrados (líneas más abajo) — nunca se muestra el monto en pesos,
  // a diferencia de la Proyección financiera. Aun así, restarla acá evita
  // cualquier filtración indirecta (ej. un depósito grande a la alcancía
  // haciendo que "tieneAlgo" pase de false a true, o cambiando qué tip
  // aparece) y mantiene el mismo principio en toda la app: mientras esté
  // tapada, es como si esa plata no existiera para nada visible al usuario.
  // Patrimonio VISIBLE (sin alcancía): una sola definición en core-state.js (calcPatrimonioVisible), la misma del hero, el historial
  // y la Proyección. Resta TODAS las deudas (tarjetas, «Yo debo», plata ajena), así que ya no hay que corregirlo aquí.
  const patrimonio = calcPatrimonioVisible();
  const mes = window.mesActual ? window.mesActual() : '';

  // Gastos e ingresos del mes: definición única en periodo.js (la misma de Análisis, cierre de mes y Wrapped).
  const _gMes = Periodo.gastosDelMes(mes);
  const gvMes = _gMes.gvTotal;
  const gastosMes = _gMes.total;

  // Deuda TC que realmente es mía (excluye encargos, plata comprometida, préstamos TC)
  const deudaTC = typeof calcDeudaTcPropia==='function' ? calcDeudaTcPropia() : 0;

  // Ingresos del mes: mesada + ingresos fijos + entradas reales (periodo.js).
  const ingresosMes = Periodo.ingresosDelMes(mes).total;
  // Ingreso de REFERENCIA para los ratios (b, d y «sin ingresos»): el mayor entre lo ingresado este mes y el ingreso típico de los
  // últimos 3 meses con ingreso. Con la regla de caja el ingreso llega en pocos días (la mesada, el sueldo, las cuotas de Spotify): a
  // principio de mes aún no ha llegado y comparar contra $0 haría ver una deuda enorme o «gastas más de lo que ingresas» cada mes
  // antes de cobrar. Si este mes ya entró más que lo típico, manda lo de este mes; sin meses anteriores con ingreso, todo sigue igual.
  const ingresoRef = Math.max(ingresosMes, Periodo.ingresoPromedioPrevio(mes, 3).promedio);

  // ── Rendimiento de CDTs generado este mes (Opción 2: patrimonio real) ──
  // Es plata que el patrimonio total ya ganó este mes, pero sigue bloqueada
  // dentro del CDT — NO es efectivo disponible, así que NO se suma a ingresosMes
  // (que mide flujo de caja real para los ratios de deuda/gasto).
  // Se expone aparte para que la app "sepa" que ese rendimiento existe.
  const rendimientoCDTMes = Periodo.rendimientosDelMes(mes).total; // cajitas + CDTs (ver periodo.js)

  // ── Liquidez real: una sola definición en core-state.js (calcLiquidez) ─────
  // Suma lo que se puede usar ya (cajitas, Nequi, Efectivo, cuentas propias) y resta lo que no es tuyo o ya debes: la tarjeta
  // propia, lo que debes a personas (aunque no haya fecha de pago: entre amigos casi nunca la hay, y es plata que te pueden
  // pedir en cualquier momento) y la plata ajena que guardas. NO suma los CDTs (bloqueados) ni lo que te deben (sin fecha
  // cierta no es plata disponible). Ver el bloque «PATRIMONIO Y LIQUIDEZ» de core-state.js.
  const liq = calcLiquidez();
  const liquidoReal = liq.neta;
  const cdtVal = liq.cdts;
  // patrimonio total sí incluye CDTs para otros cálculos
  const liquidoConCDTs = liq.conCDTs;

  // ── Plata prestada a otros ────────────────────────────────────────────
  const prest = liq.meDeben;

  // ── Hay datos suficientes para evaluar? ───────────────────────────────
  // Cualquier activo o deuda cuenta como dato, también las deudas con personas y la plata ajena: antes solo contaban un patrimonio
  // positivo, lo prestado, la tarjeta o los gastos del mes, y quien solo debía («Yo debo») veía «Registra más datos» justo cuando su
  // situación era más delicada.
  const tieneAlgo = patrimonio !== 0 || prest > 0 || deudaTC > 0 || liq.yoDebo > 0 || liq.ajeno > 0 || liq.libre !== 0 || liq.cdts > 0 || gastosMes > 0;
  const U = UMBRALES.salud;

  // a) Fondo de emergencia: liquidez real vs gasto mensual TÍPICO
  // Se usa liquidoReal (sin CDTs sin vencer) — un CDT bloqueado no cubre una emergencia.
  // El gasto de referencia es el promedio de los últimos meses COMPLETOS con datos (Periodo.gastoPromedioPrevio), no el gasto del mes
  // en curso: a los 2 días de empezar el mes apenas hay gastos, y «reservas / gastos del mes» salía en decenas de meses y regalaba +20
  // puntos que se iban cayendo a medida que pasaba el mes. Sin ningún mes anterior con gastos todavía no hay con qué medir.
  const gastoRef = Periodo.gastoPromedioPrevio(mes, U.mesesReferencia).promedio;
  const mesesCubiertos = _mesesCubiertos(liquidoReal, gastoRef); // «runway»: cuántos meses aguantas sin ingresos (null si no hay gasto típico)
  let avisoDeudaTC = false; // si la deuda de tarjeta ya se avisó por liquidez negativa, (b) no la penaliza otra vez
  if(liquidoReal > 0){
    if(gastoRef > 0){
      if(mesesCubiertos >= U.fondoMeses.completo) score += 20;
      else if(mesesCubiertos >= U.fondoMeses.minimo) score += 10;
      else { score -= 5; add(`Tus reservas cubren menos de ${U.fondoMeses.minimo} meses de gastos.`,'aviso'); }
    }
  } else if(liquidoReal < 0){
    // Debes más de lo que tienes disponible. Se nombra QUÉ deuda es. Si lo cubren CDTs sin vencer es menos grave (la plata existe, solo está
    // bloqueada). Antes un CDT mandaba este caso a «tus ahorros están en CDTs» y el consejo no decía que la liquidez era negativa.
    const quien = (liq.yoDebo <= 0 && liq.ajeno <= 0) ? 'Tu deuda en tarjetas supera'
      : (liq.tcPropia <= 0 && liq.ajeno <= 0) ? 'Lo que debes a personas supera'
      : 'Tus deudas y la plata ajena que guardas superan';
    avisoDeudaTC = liq.tcPropia > 0;
    if(liquidoConCDTs >= 0){ score -= 8; add(`${quien} la plata que tienes disponible; lo que cubre la diferencia está en tus CDTs.`,'aviso'); }
    else { score -= 15; add(`${quien} la plata que tienes disponible.`,'alerta'); }
  } else if((gastosMes > 0 || gastoRef > 0) && liquidoConCDTs > 0){
    // Liquidez justo en cero y solo CDTs sin vencer: el ahorro existe pero no está libre.
    score -= 8; add('Tu liquidez disponible es muy baja — tus ahorros están en CDTs, no en cuentas libres.','aviso');
  }

  // b) Deuda de tarjetas de crédito vs ingresos (ratio de endeudamiento TC)
  if(deudaTC > 0 && ingresoRef > 0){
    const ratioTC = deudaTC / ingresoRef;
    if(ratioTC > U.tcSobreIngreso.critico){ score -= 15; add(`Tu deuda en TC supera ${U.tcSobreIngreso.critico} meses de ingresos — prioriza pagarla.`,'alerta'); }
    else if(ratioTC > U.tcSobreIngreso.alto){ score -= 8; add('Tu deuda en tarjetas es alta respecto a tus ingresos.','aviso'); }
    // Hasta 1,5 meses de ingreso es una deuda manejable: no suma ni resta. Antes SUMABA +5 por tenerla (incentivo invertido: quien
    // no debe nada recibía 0). El punto a favor es de quien no tiene deudas propias, más abajo.
  } else if(deudaTC > 0 && ingresoRef === 0){
    // Tiene deuda TC pero no registra ingresos — verificar vs patrimonio
    if(patrimonio > 0 && deudaTC / patrimonio > 0.4){
      score -= 10; add('Tu deuda en tarjetas es alta — considera pagarla con tus ahorros.','aviso');
    } else if(patrimonio <= 0 && !avisoDeudaTC){
      // Sin la guarda se penalizaba dos veces la MISMA deuda (−15 aquí y −15 por liquidez negativa, con dos alertas casi iguales).
      score -= 15; add('Tienes deuda en tarjetas y tu patrimonio no la cubre — prioriza pagarla.','alerta');
    }
  }
  // Sin deudas propias y con plata disponible: lo único que se premia en endeudamiento.
  if(deudaTC <= 0 && liq.yoDebo <= 0 && liq.ajeno <= 0 && liquidoReal > 0) score += 5;

  // c) Plata prestada a otros (riesgo de incobrabilidad / inmovilización)
  // Penalización escalonada por ratio — independiente del bonus de CDTs
  let ratioPrest = 0;
  if(prest > 0){
    if(liquidoReal <= 0){
      // Sin liquidez libre y con plata prestada sin cobrar — caso crítico (la liquidez puede estar en cero por lo prestado o por lo que debes)
      score -= 15; add('No te queda liquidez libre y tienes plata prestada sin cobrar — no tienes nada disponible para emergencias.','alerta');
      ratioPrest = Infinity;
    } else {
      ratioPrest = prest / liquidoReal;
      if(ratioPrest > U.prestadoSobreLiquidez.vulnerable){
        score -= 18; add('Tienes más del doble de tu liquidez prestada — tu situación financiera es muy vulnerable.','alerta');
      } else if(ratioPrest > U.prestadoSobreLiquidez.comprometido){
        score -= 13; add('Tienes más plata prestada que tu liquidez disponible — queda poco para emergencias.','alerta');
      } else if(ratioPrest > U.prestadoSobreLiquidez.vigilar){
        score -= 8; add('Tienes mucho dinero prestado sin cobrar (>40% de tu liquidez).','aviso');
      }
      // ratioPrest <= 0.4: situación sana, no penalizar
    }
  }

  // d) Ritmo de gasto vs ingreso (disciplina de gasto) y h) racha de déficit.
  // d) se mide con lo TÍPICO de los meses completos (gasto típico ÷ ingreso típico), no con «gastado hasta hoy ÷ ingreso del mes
  // completo»: a los 3 días eso daba ≈ 0,05 y regalaba +10 puntos que se iban cayendo a medida que avanzaba el mes (el mismo defecto
  // que ya se corrigió en el fondo de emergencia, a). Lo único que el mes en curso puede decir sin riesgo de parcialidad es que YA se
  // pasó: si lo gastado hasta hoy supera el ingreso de referencia, el mes cierra en déficit pase lo que pase.
  const ingresoTipico = Periodo.ingresoPromedioPrevio(mes, U.mesesReferencia).promedio;
  // h) Tendencia: meses completos SEGUIDOS cerrando en déficit. Es la dirección que la foto de a)–c) no ve: alguien puede llevar meses
  // gastando más de lo que entra y seguir en «Regular» porque aún tiene colchón. Un fondo sólido (≥ 6 meses) la absorbe y no puntúa.
  const racha = Periodo.rachaDeficit(mes, 6);
  const rachaMeses = _rachaDeficitRelevante(racha, ingresoTipico, mesesCubiertos);
  let enDeficit = false;
  if(rachaMeses >= U.rachaDeficitMeses.alerta){
    score -= 15; enDeficit = true; add(`Llevas ${rachaMeses} meses seguidos gastando más de lo que ingresas.`,'alerta');
  } else if(rachaMeses >= U.rachaDeficitMeses.aviso){
    score -= 8; enDeficit = true; add(`Llevas ${rachaMeses} meses seguidos gastando más de lo que ingresas.`,'aviso');
  }
  if(ingresoTipico > 0 && gastoRef > 0){
    const ratioGasto = gastoRef / ingresoTipico;
    if(ratioGasto <= U.gastoSobreIngreso.sano) score += 10;
    else if(ratioGasto <= U.gastoSobreIngreso.ajustado) score += 5;
    else if(ratioGasto > U.gastoSobreIngreso.deficit && !enDeficit){ score -= 10; enDeficit = true; add('Vienes gastando más de lo que ingresas.','aviso'); }
  }
  if(!enDeficit && ingresoRef > 0 && gastosMes > ingresoRef){ score -= 10; add('Por ahora estás gastando más de lo que ingresas.','aviso'); }

  // e) CDTs activos (ahorro estructurado)
  // Si el riesgo de prestado es alto (ratio > 1) o la liquidez es negativa, el CDT no compensa — bonus reducido a +3.
  // Solo cuando la situación de liquidez es sana merece el bonus completo.
  const cdts = (S.cajitas||[]).reduce((a,c)=>a+(c.cdts||[]).length,0);
  if(cdts >= 1){
    // El bono es proporcional al peso del CDT en tu plata (cuentas libres + CDTs): llega completo cuando el CDT es el 10 % o más;
    // un CDT de $1.000 dentro de $80.000 ya no regala los 10 puntos.
    const cdtBonusMax = (ratioPrest > U.prestadoSobreLiquidez.comprometido || liquidoReal < 0) ? 3 : 10;
    const pesoCDT = liquidoConCDTs > 0 ? cdtVal / liquidoConCDTs : 0;
    score += Math.round(cdtBonusMax * Math.min(1, pesoCDT / U.cdtPesoCompleto));
  } else if(tieneAlgo && liquidoReal > 0 && deudaTC <= 0 && ratioPrest <= U.prestadoSobreLiquidez.comprometido && (gastoRef <= 0 || liquidoReal >= gastoRef * U.fondoMeses.minimo)){
    // Solo se sugiere con ahorros que sobran: fondo de emergencia cubierto (≥ 3 meses de gasto típico), sin deuda de tarjeta propia
    // y sin tener prestado más de lo que tienes disponible (junto a «tu situación es muy vulnerable» sonaba contradictorio).
    add('Considera poner algo en un CDT para hacer crecer tus ahorros.','sugerencia','cuentas');
  }

  // f) y g) (≥ 2 gastos fijos configurados: +5; una sola categoría en gastos variables: −5) ya NO puntúan: miden cómo usas la app, no
  // tu salud financiera, y mezclaban dos cosas distintas en un mismo número. La sugerencia de categorías se conserva como consejo.
  const cats = new Set((S.gastosVar||[]).slice(-20).map(g=>g.cat));
  if(gvMes > 0 && cats.size <= 1) add('Registra las categorías de tus gastos para mejor control.','sugerencia','gastos');

  // Sin gasto típico no se puede medir cuántos meses cubren tus reservas: se dice en vez de quedarse en un «Regular» mudo.
  if(tieneAlgo && liquidoReal > 0 && gastoRef <= 0) add('Cuando completes un mes de gastos podremos medir cuántos meses cubren tus reservas.','sugerencia');

  // Sin ingresos registrados no se puede evaluar la disciplina de gasto ni el endeudamiento (los ratios b y d se saltan):
  // no puede salir «Excelente», y se avisa igual que el balance de Análisis.
  const sinIngresos = ingresoRef <= 0 && gastosMes > 0;
  if(sinIngresos){
    score = Math.min(score, 74);
    add('Registra tus ingresos para que la calificación pueda evaluar tus gastos y deudas.','sugerencia');
  }
  score = Math.max(0, Math.min(100, score));
  if(!consejos.length){
    if(score >= 80) add('¡Excelente! Tus finanzas están muy bien.','ok');
    else if(score >= 60) add('Vas bien — diversifica tus ahorros o reduce gastos variables para subir tu puntaje.','sugerencia');
    else if(tieneAlgo) add('Hay espacio para mejorar: revisa tus gastos y ahorros para subir tu puntaje.','sugerencia');
    else add('Registra más movimientos para un análisis más preciso.','sugerencia');
  }
  // Lo urgente primero y las sugerencias suaves después (el orden es estable dentro de cada tipo).
  const ORDEN = { alerta: 0, aviso: 1, sugerencia: 2, ok: 3 };
  consejos.sort((a, b) => ORDEN[a.tipo] - ORDEN[b.tipo]);
  const tips = consejos.map(c => c.texto); // los textos, para quien solo necesita la lista
  return { score, tips, consejos, sinDatos: !tieneAlgo, ingresosMes, rendimientoCDTMes, mesesCubiertos, rachaDeficit: rachaMeses };
}

function renderHealthScore(){
  const el = document.getElementById('health-score-card');
  if(!el) return;
  const res = calcHealthScore();
  // El min-height:148px inline (ver comentario en index.html) solo existe para
  // que el skeleton no cause CLS mientras carga. Una vez que hay contenido real
  // (con o sin datos) el alto lo debe definir el contenido, no el skeleton —
  // si no, queda espacio vacío de sobra cuando el contenido es corto.
  el.style.minHeight = '';
  if(!res || res.sinDatos){ el.innerHTML = '<div class="inicio-salud-vacio">Registra más datos para calcular tu salud financiera.</div>'; return; }
  const { score, consejos, mesesCubiertos } = res;
  const col = score >= 75 ? 'var(--accent)' : score >= 50 ? 'var(--amber)' : 'var(--red)';
  const claseSalud = score >= 75 ? 'inicio-salud-ok' : score >= 50 ? 'inicio-salud-warn' : 'inicio-salud-mal';
  const label = score >= 75 ? 'Excelente' : score >= 50 ? 'Regular' : 'Necesita atención';
  const r = 28, circ = 2 * Math.PI * r;
  // A score=100 el patrón dash/gap (dash=circ, gap=circ) con linecap round deja
  // una costura visible donde el trazo se "cierra" sobre sí mismo — el cap
  // redondeado del inicio y del final no terminan de fundirse en un círculo
  // limpio. Con la barra llena no hace falta cap redondeado ni gap: se dibuja
  // el círculo completo con linecap "butt" y sin dasharray.
  const lleno = score >= 100;
  const dash = (score / 100) * circ;
  const dasharrayAttr = lleno ? '' : `stroke-dasharray="${dash.toFixed(1)} ${circ.toFixed(1)}"`;
  const linecap = lleno ? 'butt' : 'round';
  // Un solo punto asigna color e ícono según el TIPO del consejo (no según su texto). Íconos de Font Awesome de la app.
  const ESTILO = {
    ok:         { clase: 'inicio-tip-ok',   ico: 'fa-circle-check' },
    alerta:     { clase: 'inicio-tip-mal',  ico: 'fa-triangle-exclamation' },
    aviso:      { clase: 'inicio-tip-warn', ico: 'fa-triangle-exclamation' },
    sugerencia: { clase: 'inicio-tip-info', ico: 'fa-circle-info' }
  };
  const tipsHtml = consejos.map(c => {
    const e = ESTILO[c.tipo] || ESTILO.sugerencia;
    const cuerpo = `<i class="fa-solid ${e.ico} inicio-tip-ico"></i><span>${escHtml(c.texto)}</span>`;
    // Un consejo accionable lleva a donde se resuelve.
    return c.ir
      ? `<button type="button" class="inicio-tip ${e.clase} inicio-tip-accion" ${Events.attr('inicio:irConsejo', c.ir)}>${cuerpo}<i class="fa-solid fa-arrow-right inicio-tip-ir"></i></button>`
      : `<div class="inicio-tip ${e.clase}">${cuerpo}</div>`;
  }).join('');
  // «Cubres X meses de gastos»: la cifra más útil en una crisis. Solo con gasto típico (sin él no hay con qué medir).
  const runwayHtml = mesesCubiertos == null ? '' : `<div class="inicio-salud-runway inicio-runway-${_nivelRunway(mesesCubiertos)}">${_textoRunway(mesesCubiertos)}</div>`;
  el.innerHTML = `<div class="health-ring-wrap inicio-salud-wrap">
    <svg aria-hidden="true" width="76" height="76" viewBox="0 0 76 76" class="health-ring inicio-salud-anillo">
      <circle cx="38" cy="38" r="${r}" fill="none" stroke="var(--bg3)" stroke-width="7"/>
      <circle cx="38" cy="38" r="${r}" fill="none" stroke="${col}" stroke-width="7"
        ${dasharrayAttr}
        transform="rotate(-90 38 38)"
        stroke-linecap="${linecap}" class="inicio-salud-arco"/>
      <text x="38" y="43" text-anchor="middle" font-size="16" font-weight="600" fill="${col}" font-family="DM Mono,monospace">${score}</text>
    </svg>
    <div class="health-details">
      <div class="health-score-num ${claseSalud}">${label}</div>
      ${runwayHtml}
      ${tipsHtml}
    </div>
  </div>`;
}

/* ====================================================
   HERO: estado del patrimonio (color y una línea de contexto)
==================================================== */
// El hero era verde fijo: un patrimonio de −$800.000 se veía igual que uno de +$8.000.000 (solo el signo «−» lo delataba), y quien
// tenía valor pero liquidez negativa (un CDT y una tarjeta alta) veía «todo bien» mientras Salud gritaba alerta.
// → { estado, clase (color del monto), tono ('red'|'amber'|'gris'|''), mensaje }. Prioridad: negativo > cero > liquidez negativa > prestado.
function calcEstadoHero(d, liq){
  d = d || calcPatrimonioDesglose();
  liq = liq || calcLiquidez();
  const p = d.visible;
  if(!isFinite(p)) return { estado:'desconocido', clase:'c-green', tono:'', mensaje:'' };
  if(p < 0) return { estado:'negativo', clase:'c-red', tono:'red', mensaje:'Debes más de lo que tienes: ' + fmtNoCents(-p) };
  const hayDatos = (d.activos - d.alcancia) > 0 || d.pasivos > 0; // la alcancía no cuenta: está oculta a propósito
  if(p === 0 && hayDatos) return { estado:'cero', clase:'c-text2', tono:'gris', mensaje:'Lo que tienes y lo que debes se compensan' };
  if(liq.neta < 0) return { estado:'liquidez-negativa', clase:'c-amber', tono:'amber', mensaje:'Tienes valor, pero tus deudas superan tu plata disponible en ' + fmtNoCents(-liq.neta) };
  // «Me deben» cuenta al 100 % en el patrimonio sin provisión de incobrabilidad: si pesa mucho, se muestra también sin eso.
  if(liq.meDeben > 0 && liq.meDeben >= p * UMBRALES.hero.meDebenFraccion) return { estado:'prestado', clase:'c-green', tono:'gris', mensaje:'Sin contar lo que te deben: ' + fmtNoCents(p - liq.meDeben) };
  return { estado:'sano', clase:'c-green', tono:'', mensaje:'' };
}
function renderHeroEstado(d){
  const hero = document.getElementById('heroTotal');
  if(!hero) return;
  const e = calcEstadoHero(d);
  ['c-green','c-red','c-amber','c-text2'].forEach(c => hero.classList.remove(c));
  hero.classList.add(e.clase);
  const el = document.getElementById('hero-estado');
  if(!el) return;
  el.textContent = e.mensaje;
  ['red','amber','gris'].forEach(t => el.classList.remove('ix-hero-estado-' + t));
  if(e.tono) el.classList.add('ix-hero-estado-' + e.tono);
}

/* ====================================================
   PROYECCIÓN FINANCIERA
==================================================== */
// Ritmo mensual (cambio neto ÷ días × 30) de cada tercio del historial, en orden. `intervalos`: [{dias, cambio}] entre puntos
// consecutivos. Un intervalo cae en el tercio donde está su punto medio.
function _ritmosPorTercio(intervalos, diasTotal){
  const t = [{d:0,c:0},{d:0,c:0},{d:0,c:0}];
  let acum = 0;
  intervalos.forEach(it => {
    const i = Math.min(2, Math.floor(((acum + it.dias/2) / diasTotal) * 3));
    t[i].d += it.dias; t[i].c += it.cambio; acum += it.dias;
  });
  return t.filter(x => x.d > 0).map(x => x.c / x.d * 30);
}

function renderProyeccion(){
  const el = document.getElementById('proyeccion-card');
  if(!el) return;
  const S = window.S || {};
  // Formato SIN decimales, específico de esta card: los centavos en una proyección
  // a 3/6/12 meses no aportan nada (es una estimación, no un saldo exacto) y solo
  // generan ruido visual. No se usa window.fmt aquí para no depender de si ese
  // formateador global decide mostrar decimales.
  const fmt = x=>Math.round(x).toLocaleString('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).replace(/\u00a0/g,'');
  // ── Patrimonio VISIBLE (sin alcancía) ─────────────────────────────────
  // Una sola definición en core-state.js (calcPatrimonioVisible): la misma del hero y de `valorVisible` en el historial, que es
  // de donde sale la tendencia. Esta card muestra un número puntual en cada render; con el total crudo, depositar en la alcancía
  // haría saltar 3m/6m/12m por el monto exacto del depósito y delataría la sorpresa. Cuando se destape, esa plata entra a una
  // cuenta real y el patrimonio visible sube solo.
  const patrimonio = (typeof calcPatrimonioVisible==='function') ? calcPatrimonioVisible() : 0;
  // «Sin datos» = no hay ningún activo visible ni deuda (la alcancía no cuenta: está oculta a propósito y no debe delatarse). Un patrimonio
  // EXACTAMENTE cero con cuentas y deudas es un caso real (todo gastado, o cuentas compensadas con deuda), no «sin datos».
  const _dp = (typeof calcPatrimonioDesglose==='function') ? calcPatrimonioDesglose() : null;
  const sinNada = _dp ? ((_dp.activos - _dp.alcancia) === 0 && _dp.pasivos === 0) : !patrimonio;
  if(sinNada){
    el.innerHTML = `<div class="inicio-proy-vacio">
      <div class="inicio-proy-vacio-ico">
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
      </div>
      <div class="inicio-proy-vacio-titulo">Sin datos suficientes</div>
      <div class="inicio-proy-vacio-texto">Registra movimientos para ver tu proyección a 3, 6 y 12 meses.</div>
    </div>`;
    return;
  }

  // ── Tendencia mensual: única fuente de verdad = crecimiento real del patrimonio ──
  // crecimiento real = cambio de patrimonio día a día, restando exactamente el monto
  // que correspondió a saldos iniciales o ajustes de base ese día (montoBase, ver
  // snapshotPatrimonio). No se usan ingresos/gastos registrados por separado: cualquier
  // cambio real de patrimonio (ingreso, gasto, interés de cajita, rendimiento, pérdida)
  // ya queda reflejado aquí, sin depender de si el usuario registró un movimiento formal.
  // Transferencias entre cuentas propias y préstamos a terceros no afectan el patrimonio
  // total, así que tampoco distorsionan este cálculo.
  // Últimos 120 puntos (≈ 4 meses): con 90 la ventana nunca llegaba a los 90 días que exige «estable» (89 días con un punto diario).
  const hist = (S.patrimonioHistorial||[]).slice(-UMBRALES.proyeccion.puntosHistorial);
  let tendenciaMensual = 0;
  let historialInsuficiente = false;
  // Niveles: 'insuficiente' | 'normal' | 'estable'
  let nivelConfianza = 'insuficiente';

  // Mínimo de separación temporal real para mostrar una proyección: un mes. Con menos días, un solo movimiento
  // grande (una mesada, un pago) domina el promedio y se extrapola a 3/6/12 meses como si se repitiera cada
  // semana (una mesada de $80.000 en una ventana de 9 días daba +$267.000 al mes, unos 3 millones al año).
  const MIN_DIAS_PARA_TENDENCIA = UMBRALES.proyeccion.diasMinimos;

  let diasReales = 0; // declarado en scope externo para usarlo en el template del footer
  let ritmos = [];    // ritmo mensual de cada tercio del historial (para saber si la tendencia fue consistente)
  const intervalos = [];
  if(hist.length >= 2){
    // Cambio neto total (sin aperturas/ajustes) y días totales transcurridos —
    // ver más abajo por qué se promedia así en vez de por-intervalo.
    let cambioNetoTotal = 0;
    for(let i=1;i<hist.length;i++){
      // _fechaSafe: una fecha mal formada («2026-9-26») haría NaN en toda la tendencia; si aun así no se puede leer, el intervalo cuenta 1 día.
      const _dd = Math.round((_fechaSafe(hist[i].fecha) - _fechaSafe(hist[i-1].fecha))/86400000);
      const diasEntre = isFinite(_dd) ? Math.max(1, _dd) : 1;
      // valorVisible (sin alcancía) en vez de valor crudo — mismo motivo que
      // el patrimonio de arriba: un depósito/destape de alcancía no debe
      // aparecer como un salto de tendencia. Fallback a .valor para puntos
      // del historial guardados antes de que existiera valorVisible.
      const vHoy  = (hist[i].valorVisible!=null)   ? hist[i].valorVisible   : hist[i].valor;
      const vAyer = (hist[i-1].valorVisible!=null) ? hist[i-1].valorVisible : hist[i-1].valor;
      const cambioDelDia = (vHoy - vAyer) - (hist[i].montoBase||0);
      cambioNetoTotal += cambioDelDia;
      diasReales += diasEntre;
      intervalos.push({ dias: diasEntre, cambio: cambioDelDia });
    }

    if(diasReales < MIN_DIAS_PARA_TENDENCIA){
      historialInsuficiente = true;
      nivelConfianza = 'insuficiente';
    } else {
      // Promedio ponderado por días (cambio neto total ÷ días totales), no
      // promedio de tasas por-intervalo: el ingreso real llega en pocos días
      // grandes (mesada, pagos), no repartido parejo día a día. Una mediana o
      // un trimmed-mean de tasas por-intervalo termina mirando casi siempre un
      // día "de solo interés" e ignorando esos días de ingreso real —
      // subestimando la tendencia real. Sumar el cambio neto y dividir por los
      // días totales sí refleja el ingreso real proporcionalmente, y de paso
      // autocorrige una caída de un día que se revierte al siguiente (el par
      // se cancela casi solo en la suma), sin necesitar filtrar outliers a mano.
      tendenciaMensual = (cambioNetoTotal / diasReales) * 30;

      // «Estable» exige 90 días (antes 60: dos meses de datos no son estables y la etiqueta da confianza) Y que el ritmo haya ido en la
      // misma dirección en los tres tercios del historial. Si una compra grande cayó en un solo tercio, el ritmo no fue consistente y la
      // proyección dice «estimación» y muestra el rango, en vez de extrapolar esa compra como si fuera un ritmo mensual.
      ritmos = _ritmosPorTercio(intervalos, diasReales);
      const _tol = Math.abs(tendenciaMensual) * 0.1;
      const consistente = ritmos.length >= 3 && ritmos.every(r => r * Math.sign(tendenciaMensual) >= -_tol);
      nivelConfianza = (diasReales >= UMBRALES.proyeccion.diasEstable && consistente) ? 'estable' : 'normal';
    }
  } else {
    historialInsuficiente = true;
    nivelConfianza = 'insuficiente';
  }

  const p3 = patrimonio + tendenciaMensual * 3;
  const p6 = patrimonio + tendenciaMensual * 6;
  const p12 = patrimonio + tendenciaMensual * 12;

  // Deuda de tarjeta descontada del patrimonio: el patrimonio resta la deuda TOTAL (incluida la parte de encargos y préstamos), así que el
  // texto muestra el total y, si difiere, cuánto de eso es propio. Antes decía «Deuda TC propia: $400.000 ya descontada» cuando se
  // descontaban $1.000.000.
  const deudaTCPropia = typeof calcDeudaTcPropia==='function' ? calcDeudaTcPropia() : 0;
  const deudaTCTotal = _dp ? _dp.deudaTC : deudaTCPropia;
  const deudaInfo = deudaTCTotal > 0
    ? `<div class="inicio-proy-deuda">Deuda TC: ${fmt(deudaTCTotal)}${Math.abs(deudaTCTotal - deudaTCPropia) > 0.5 ? ' (propia ' + fmt(deudaTCPropia) + ')' : ''} ya descontada del patrimonio</div>` : '';
  // Cuánto aguanta tu plata disponible si el patrimonio sigue bajando a este ritmo (solo con tendencia negativa y liquidez positiva).
  let runwayInfo = '';
  if(!historialInsuficiente && tendenciaMensual < 0 && typeof calcLiquidez==='function'){
    const ln = calcLiquidez().neta;
    if(ln > 0){
      const m = Math.max(1, Math.round(ln / Math.abs(tendenciaMensual)));
      if(m <= UMBRALES.proyeccion.maxMesesRunway) runwayInfo = `<div class="inicio-proy-runway">A este ritmo, tu plata disponible duraría unos ${m} ${m === 1 ? 'mes' : 'meses'}</div>`;
    }
  }
  // Ritmo irregular: se muestra el rango en vez de una cifra que no representa ningún período.
  const irregularInfo = (!historialInsuficiente && nivelConfianza !== 'estable' && ritmos.length >= 3 && (Math.max(...ritmos) - Math.min(...ritmos)) > Math.abs(tendenciaMensual))
    ? `<div class="inicio-proy-irregular">Tu ritmo cambió mucho entre períodos (de ${fmt(Math.min(...ritmos))} a ${fmt(Math.max(...ritmos))} al mes): toma la proyección con cautela</div>` : '';

  // Calcular diferencias absolutas para el tooltip de cada card
  const proyCards = [
    { lbl:'3 meses', key:'3m', val:p3, meses:3 },
    { lbl:'6 meses', key:'6m', val:p6, meses:6 },
    { lbl:'1 año',   key:'12m', val:p12, meses:12 }
  ];

  el.innerHTML = historialInsuficiente ? `
    <div class="inicio-proy-fila">
      <span class="inicio-proy-etiqueta">Tendencia mensual<span class="inicio-proy-info"><svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="8"/><line x1="12" y1="12" x2="12" y2="16"/></svg></span></span>
      <span class="inicio-proy-valor inicio-proy-valor-nulo">—</span>
    </div>
    <div class="inicio-proy-aviso">
      <div class="inicio-proy-aviso-txt">Tendencia en construcción: llevas ${Math.min(diasReales, MIN_DIAS_PARA_TENDENCIA)} de ${MIN_DIAS_PARA_TENDENCIA} días de historial.<br>Vuelve en unos días para ver tendencias y proyecciones.</div>
    </div>
    ${deudaInfo}
  ` : `
    <div id="_proy-header" class="inicio-proy-fila inicio-proy-fila-click" data-tendencia="${tendenciaMensual}">
      <span class="inicio-proy-etiqueta">Tendencia mensual<span class="inicio-proy-info"><svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="8"/><line x1="12" y1="12" x2="12" y2="16"/></svg></span></span>
      <span class="inicio-proy-valor ${tendenciaMensual>=0?'inicio-proy-pos':'inicio-proy-neg'}">${tendenciaMensual>=0?'+':''}${fmt(tendenciaMensual)}</span>
    </div>
    <div id="_proy-cards-wrap" class="inicio-proy-grid">
      ${proyCards.map(({lbl,key,val,meses})=>{
        const diff = val - patrimonio;
        // Porcentaje solo sobre una base positiva: sobre cero o negativa no significa nada (antes salía «0.0 %» fijo).
        const pct = patrimonio > 0 ? ((diff/patrimonio)*100).toFixed(1) : '';
        return`<div
          data-proy-key="${key}"
          data-proy-lbl="${lbl}"
          data-proy-val="${val}"
          data-proy-diff="${diff}"
          data-proy-pct="${pct}"
          data-proy-hoy="${patrimonio}"
          data-proy-meses="${meses}"
          class="inicio-proy-card">
          <div class="inicio-proy-card-k">${key}</div>
          <div class="inicio-proy-card-v ${val>=patrimonio?'inicio-proy-pos':'inicio-proy-neg'}">${fmt(val)}</div>
        </div>`;
      }).join('')}
      <div id="_proy-tt" class="inicio-proy-tt" style="display:none;"></div>
    </div>
    ${deudaInfo}
    ${runwayInfo}
    ${irregularInfo}
    <div class="inicio-proy-pie">
      <span class="inicio-proy-base">Basado en ${diasReales} días de historial</span>
      ${nivelConfianza==='estable'
        ? `<span class="inicio-proy-chip inicio-proy-chip-estable">ESTABLE</span>`
        : `<span class="inicio-proy-chip inicio-proy-chip-est">estimación</span>`
      }
    </div>`;

  // Bind listeners DESPUÉS de setear innerHTML
  (function(){
    const fmt2 = x=>Math.round(x).toLocaleString('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).replace(/\u00a0/g,'');
    const tt = el.querySelector('#_proy-tt');
    if(!tt) return;
    function showTT(html){ tt.innerHTML=html; tt.style.display='block'; clearTimeout(window._proyTT_t); window._proyTT_t=setTimeout(()=>{ tt.style.display='none'; },3000); }
    // Header (tendencia mensual)
    const header = el.querySelector('#_proy-header');
    if(header){
      function bindHeader(ev){ ev.stopPropagation(); const t=parseFloat(header.dataset.tendencia)||0; const pos=t>=0; showTT(`<div class="inicio-tt-titulo">¿Qué significa esto?</div><div class="inicio-tt-cuerpo">Ritmo mensual de <b class="${pos?'inicio-tt-pos':'inicio-tt-neg'}">crecimiento real del patrimonio</b> (ingresos, gastos, intereses y rendimientos — sin contar saldos iniciales ni ajustes de base).</div><div class="inicio-tt-nota inicio-tt-nota-top">${pos?'Tu patrimonio está creciendo ~'+fmt2(t)+' por mes en promedio.':'Tu patrimonio está bajando ~'+fmt2(Math.abs(t))+'/mes en promedio.'}</div>`); }
      header.addEventListener('click', bindHeader);
      header.addEventListener('touchend', function(e){ e.preventDefault(); bindHeader(e); });
    }
    // Cards 3m/6m/12m
    const wrap = el.querySelector('#_proy-cards-wrap');
    if(wrap){
      function bindCard(card, e){ e.stopPropagation(); const lbl=card.dataset.proyLbl; const val=parseFloat(card.dataset.proyVal)||0; const diff=parseFloat(card.dataset.proyDiff)||0; const pct=card.dataset.proyPct; const meses=card.dataset.proyMeses; const hoyV=parseFloat(card.dataset.proyHoy)||0;
        // Con base ≤ 0 no hay porcentaje: se dice qué pasa con el signo (números rojos) y se muestra el cambio absoluto.
        const nota = (val<0 && hoyV>=0) ? 'Pasarías a números rojos' : (val>=0 && hoyV<0) ? 'Saldrías de números rojos' : pct ? `${diff>=0?'+':''}${pct}% vs hoy` : (val<0 ? 'Seguirías en números rojos' : 'vs hoy'); const claseDelta=diff>=0?'inicio-tt-pos':'inicio-tt-neg'; const ico=diff>=0?'<i class="fa-solid fa-arrow-up"></i>':'<i class="fa-solid fa-arrow-down"></i>'; showTT(`<div class="inicio-tt-titulo">Proyección a ${lbl}</div><div class="inicio-tt-fila"><span class="inicio-tt-monto">${fmt2(val)}</span><span class="inicio-tt-delta ${claseDelta}">${ico} ${diff>=0?'+':''}${fmt2(diff)}</span></div><div class="inicio-tt-nota">${nota} · acumulado ${meses} meses</div>`); card.style.background='var(--bg4)'; setTimeout(()=>{ card.style.background='var(--bg3)'; },200); }
      wrap.addEventListener('click', function(e){ const card=e.target.closest('[data-proy-key]'); if(card) bindCard(card,e); });
      wrap.addEventListener('touchend', function(e){ const card=e.target.closest('[data-proy-key]'); if(card){ e.preventDefault(); bindCard(card,e); } });
    }
    // "Cerrar al tocar fuera": un solo listener global (más abajo, _initCierreTooltipProyeccion),
    // no uno nuevo por cada render — esta función corre en cada refresh().
  })();
}

// Cierra el tooltip de Proyección al tocar fuera de la tarjeta. Se registra UNA vez al cargar el
// módulo y busca el tooltip vigente en cada click (el DOM de la tarjeta se reemplaza en cada render).
(function _initCierreTooltipProyeccion(){
  document.addEventListener('click', function(e){
    if(e.target.closest('#proyeccion-card')) return;
    const tt = document.getElementById('_proy-tt');
    if(tt) tt.style.display = 'none';
  });
})();

/* ================================================================
   ALERTA DE GASTO ALTO EN EL HERO
   ================================================================ */
function _checkGastoAlto() {
  const indicator = document.getElementById('hero-change-indicator');
  if (!indicator) return;
  // Gasto real del mes: definición única (periodo.js).
  const mes = mesActual();
  const gastoMes = Periodo.gastosDelMes(mes).total;
  // Contra el INGRESO (el mismo de referencia de Salud: el mayor entre lo de este mes y lo típico), no contra el disponible de ahora.
  // Antes se comparaba con el disponible, que ya descuenta ese gasto: no medía si gastas más de lo que ingresas, y con disponible ≤ 0
  // (justo el caso peor) no avisaba nada. Gastar «hasta hoy» más que el ingreso de referencia es déficit seguro (el mes solo puede crecer).
  const ingresoRef = Math.max(Periodo.ingresosDelMes(mes).total, Periodo.ingresoPromedioPrevio(mes, UMBRALES.salud.mesesReferencia).promedio);
  let nivel = '', texto = '';
  if (ingresoRef > 0) {
    if (gastoMes > ingresoRef) { nivel = 'red'; texto = 'Gastas más de lo que ingresas'; }
    else if (gastoMes >= ingresoRef * UMBRALES.gastoAlto.fraccionDelIngreso) { nivel = 'amber'; texto = 'Gastos altos'; }
  } else if (gastoMes > 0) {
    // Sin ingresos registrados no hay contra qué comparar: solo se avisa si ya no queda plata disponible.
    const custom = cuentasCustom().reduce((a, c) => a + (c.saldo || 0), 0);
    const disp = nuTotal() + getSaldoFuente('nequi') + getSaldoFuente('efectivo') + custom;
    if (disp <= 0) { nivel = 'red'; texto = 'Sin plata disponible'; }
  }
  indicator.textContent = texto;
  indicator.classList.remove('ix-hero-alerta-red', 'ix-hero-alerta-amber');
  if (nivel) indicator.classList.add('ix-hero-alerta-' + nivel);
}

/* ================================================================
   DISPONIBLE NETO DE DEUDA DE TC (2026-09-20: rehecho — ver
   CHANGELOG.md#inicio)
   ================================================================
   No toca tarjetas_credito.js ni le agrega fechas de corte/pago —
   esa es una decisión de diseño explícita de ese módulo (ver
   tarjetas-credito.md §7: "no simula un banco real"). Este bloque
   solo AGREGA una segunda lectura junto a "Disponible". Se resta la
   deuda TOTAL de cada tarjeta, sin descontar lo confirmado como
   ajeno (ver el comentario dentro de _renderDispNetoTC por qué).

   El disponible bruto (#s-disp) no se toca ni se reemplaza — sigue
   mostrando lo mismo que hoy. Esto es información adicional, no un
   reemplazo: los días en que sabes que va a entrar plata antes de
   pagar la tarjeta (ej. "me pagan en 3 días"), el bruto sigue siendo
   la cifra correcta a mirar; el resto de los días, el neto es el que
   avisa que parte de ese disponible ya tiene dueño.
   ================================================================ */
function _renderDispNetoTC() {
  const el = document.getElementById('s-disp-neto-tc');
  if (!el) return;
  // Se resta la deuda TOTAL de la tarjeta, IGNORANDO qué parte es "ajena".
  // La app sabe distinguir deuda propia de ajena (calcDeudaAjenaDeTarjeta),
  // pero no sabe si esa parte ajena ya te la devolvieron aparte (efectivo/
  // Nequi/Nu) o sigue pendiente — calcDeudaAjenaDeTarjeta solo baja cuando
  // hay un PAGO real a la tarjeta, no cuando recibes el reembolso por otro
  // lado. Restar solo lo propio asumía sin poder verificarlo que seguía
  // pendiente; si ya te pagaron, esa plata ya está contada en tu disponible
  // Y la deuda de la tarjeta por esa parte sigue siendo 100% tuya de pagar
  // hasta que hagas el pago real. Sin forma de distinguir los dos casos,
  // se asume el peor caso: toda la deuda es tuya de pagar (mismo criterio
  // que ya usa el widget de "cobertura" de Tarjetas de crédito —
  // tarjetas-credito.md §2: "el banco cobra el 100% sin importar esta
  // distinción").
  // Math.max(0, ...) por tarjeta, NO sobre la suma total: si una tarjeta
  // tiene tc.deuda negativo (saldo a favor — pagaste de más), esa tarjeta
  // no debe restar del total de deuda de las demás. Un saldo a favor no es
  // plata que tengas disponible ahora mismo (hay que pedir reembolso o
  // esperar a que se aplique a compras futuras), así que tampoco debe
  // inflar el "peor caso" de Neto por encima de Disponible.
  const deudaTCTotal = (S.tarjetasCredito||[]).reduce((a,tc)=>a+Math.max(0,tc.deuda||0), 0);
  if (!deudaTCTotal || deudaTCTotal <= 0) { el.textContent = ''; return; }
  // Ya NO se recalcula "disponible" acá (nu+nequi+ef+customTotal por
  // separado) — eso ya causó dos veces que Neto quedara desalineado de
  // Disponible por pequeñas diferencias entre este cálculo y el real. Se
  // usa directamente window._dispActualHoy, el MISMO número que refresh()
  // (core-state.js) acaba de usar para pintar #s-disp — por definición no
  // se pueden desalinear. refresh() llama a _origRefreshInicio() (que
  // setea window._dispActualHoy) ANTES de llamar a esta función, así que
  // siempre llega actualizado.
  const disp = window._dispActualHoy || 0;
  const neto = disp - deudaTCTotal;
  el.textContent = `Neto de TC: ${fmt(neto)}`;
  el.style.color = neto < 0 ? 'var(--red)' : 'var(--text3)';
}

// Hook _checkGastoAlto/_renderDispNetoTC en refresh. refresh() se define en core-state.js, que
// carga antes que este módulo; calcC/nuTotal (nu-calc.js) también son núcleo de entrada, así que
// no hace falta ningún reintento ni guard por carga lazy.
const _origRefreshInicio = window.refresh;
window.refresh = function() {
  if (_origRefreshInicio) _origRefreshInicio.apply(this, arguments);
  _checkGastoAlto();
  _renderDispNetoTC();
};

// Primer intento inmediato al cargar el módulo, sin esperar al próximo
// refresh() real.
_renderDispNetoTC();

// Nota (2026-08-04): "Necesita atención" depende de getMesadaData/
// _getCuotaAnio (mesada) y tcCupoUsadoPct (tarjetas de crédito), que
// hasta acá vivían en mesada.js/tarjetas_credito.js — módulos lazy que
// solo cargan cuando el usuario visita esas pantallas (ver
// js/core/lazy-loader.js). Como Inicio es la pantalla de entrada,
// esas funciones podían no existir todavía en el primer render y sus
// ítems se salteaban en silencio (guard typeof==='function' de más
// abajo) sin que nada los volviera a pedir.
// Se resolvió de raíz: esas 3 funciones puras (solo dependen de `S`,
// sin DOM/UI) se movieron a js/core/calc-helpers.js, que carga de
// entrada — así están disponibles desde el arranque sin tener que
// forzar la descarga de mesada.js/tarjetas_credito.js completos (44KB
// + 60KB) solo para leer un par de números. El guard typeof de abajo
// se deja igual, como red de seguridad, pero en la práctica ya
// debería cumplirse siempre.

// Mover la sección "Necesita atención" justo debajo del hero de Inicio.
(function(){
  const attnSection = document.getElementById('s-attn-section');
  const hero = document.querySelector('#screen-inicio .hero');
  if(attnSection && hero && hero.parentNode) {
    hero.parentNode.insertBefore(attnSection, hero.nextSibling);
  }
})();

// Consejo de «Salud financiera» accionable: abre la pantalla donde se resuelve.
Events.registerAll('inicio', {
  irConsejo: (destino) => { if (typeof showScreen === 'function' && document.getElementById('screen-' + destino)) showScreen(destino); }
});
