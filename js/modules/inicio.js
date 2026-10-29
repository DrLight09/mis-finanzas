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
function renderAttencion(){
  const items=[];
  const hoyStr=hoy();
  // Deudores con saldo pendiente
  if(typeof getDeudorSaldo==='function'){
    Deudas.lista('favor').forEach(d=>{
      const s=getDeudorSaldo(d);
      if(s>0) items.push({tipo:'amber',texto:html`${d.nombre} te debe ${fmt(s)}`});
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
    if((tc.estado||'activa')!=='activa')return;
    const cupo=tc.cupo||0;
    if(!cupo)return;
    if(typeof tcCupoUsadoPct!=='function')return;
    const pct=tcCupoUsadoPct(tc);
    if(pct>=100){
      items.push({tipo:'red',texto:html`${tc.nombre}: cupo agotado — deuda ${fmt(tc.deuda||0)}`,_tcId:tc.id});
    } else if(pct>=85){
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
    if(diasRestantes>=0&&diasRestantes<=7) items.push({tipo:'amber',texto:html`CDT "${c.nombre}" vence en ${diasRestantes}d`});
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
  const tieneAlgo = patrimonio > 0 || prest > 0 || deudaTC > 0 || gastosMes > 0;

  // a) Fondo de emergencia: liquidez real vs gasto mensual TÍPICO
  // CORRECCIÓN: usamos liquidoReal (sin CDTs) — un CDT bloqueado no cubre una emergencia.
  // El gasto de referencia es el promedio de los últimos 3 meses COMPLETOS con datos (Periodo.gastoPromedioPrevio),
  // no el gasto del mes en curso: a los 2 días de empezar el mes apenas hay gastos, y «reservas / gastos del mes»
  // salía en decenas de meses y regalaba +20 puntos que se iban cayendo a medida que pasaba el mes.
  // Sin ningún mes anterior con gastos todavía no hay con qué medir: este criterio no puntúa ni aconseja.
  const gastoRef = Periodo.gastoPromedioPrevio(mes, 3).promedio;
  if(gastoRef > 0 && liquidoReal > 0){
    const mesesCubiertos = liquidoReal / gastoRef;
    if(mesesCubiertos >= 6) score += 20;
    else if(mesesCubiertos >= 3) score += 10;
    else { score -= 5; add('Tus reservas cubren menos de 3 meses de gastos.','aviso'); }
  } else if((gastosMes > 0 || gastoRef > 0) && liquidoReal <= 0 && liquidoConCDTs > 0){
    // Tiene gastos pero su liquidez inmediata es cero — salvado solo por CDTs
    score -= 8; add('Tu liquidez disponible es muy baja — tus ahorros están en CDTs, no en cuentas libres.','aviso');
  } else if(liquidoReal < 0){
    // Qué dejó la liquidez en negativo: si solo es la tarjeta se dice como siempre; si hay deudas con personas o plata ajena, se nombran.
    score -= 15;
    if(liq.yoDebo <= 0 && liq.ajeno <= 0) add('Tu deuda en tarjetas supera tu patrimonio líquido.','alerta');
    else if(liq.tcPropia <= 0 && liq.ajeno <= 0) add('Lo que debes a personas supera tu patrimonio líquido.','alerta');
    else add('Tus deudas y la plata ajena que guardas superan tu patrimonio líquido.','alerta');
  }

  // b) Deuda de tarjetas de crédito vs ingresos (ratio de endeudamiento TC)
  if(deudaTC > 0 && ingresoRef > 0){
    const ratioTC = deudaTC / ingresoRef;
    if(ratioTC > 3){ score -= 15; add('Tu deuda en TC supera 3 meses de ingresos — prioriza pagarla.','alerta'); }
    else if(ratioTC > 1.5){ score -= 8; add('Tu deuda en tarjetas es alta respecto a tus ingresos.','aviso'); }
    else score += 5;
  } else if(deudaTC > 0 && ingresoRef === 0){
    // Tiene deuda TC pero no registra ingresos — verificar vs patrimonio
    // CORRECCIÓN: cubrir el caso patrimonio <= 0 que antes se ignoraba
    if(patrimonio > 0 && deudaTC / patrimonio > 0.4){
      score -= 10; add('Tu deuda en tarjetas es alta — considera pagarla con tus ahorros.','aviso');
    } else if(patrimonio <= 0 && deudaTC > 0){
      score -= 15; add('Tienes deuda en tarjetas y tu patrimonio no la cubre — prioriza pagarla.','alerta');
    }
  }

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
      if(ratioPrest > 2){
        // Más del doble de la liquidez prestada — muy comprometido
        score -= 18; add('Tienes más del doble de tu liquidez prestada — tu situación financiera es muy vulnerable.','alerta');
      } else if(ratioPrest > 1){
        // Prestó más de lo que tiene líquido
        score -= 13; add('Tienes más plata prestada que tu liquidez disponible — queda poco para emergencias.','alerta');
      } else if(ratioPrest > 0.4){
        score -= 8; add('Tienes mucho dinero prestado sin cobrar (>40% de tu liquidez).','aviso');
      }
      // ratioPrest <= 0.4: situación sana, no penalizar
    }
  }

  // d) Ratio gastos/ingresos (disciplina de gasto)
  if(ingresoRef > 0 && gastosMes > 0){
    const ratioGasto = gastosMes / ingresoRef;
    if(ratioGasto <= 0.7) score += 10;
    else if(ratioGasto <= 0.9) score += 5;
    else if(ratioGasto > 1){ score -= 10; add('Por ahora estás gastando más de lo que ingresas.','aviso'); }
  }

  // e) CDTs activos (ahorro estructurado)
  // Si el riesgo de prestado es alto (ratio > 1), el CDT no compensa — bonus reducido a +3
  // Solo cuando la situación de liquidez es sana merece el bonus completo
  const cdts = (S.cajitas||[]).reduce((a,c)=>a+(c.cdts||[]).length,0);
  if(cdts >= 1){
    // El bono es proporcional al peso del CDT en tu plata (cuentas libres + CDTs): llega completo cuando el CDT es
    // el 10 % o más; un CDT de $1.000 dentro de $80.000 ya no regala los 10 puntos.
    const CDT_PESO_COMPLETO = 0.10;
    const cdtBonusMax = ratioPrest > 1 ? 3 : 10;
    const pesoCDT = liquidoConCDTs > 0 ? cdtVal / liquidoConCDTs : 0;
    score += Math.round(cdtBonusMax * Math.min(1, pesoCDT / CDT_PESO_COMPLETO));
  } else if(tieneAlgo && liquidoReal > 0 && deudaTC <= 0 && (gastoRef <= 0 || liquidoReal >= gastoRef * 3)){
    // Solo se sugiere con ahorros que sobran: fondo de emergencia cubierto (≥ 3 meses de gasto típico) y sin deuda de tarjeta propia.
    add('Considera poner algo en un CDT para hacer crecer tus ahorros.','sugerencia','cuentas');
  }

  // f) Gastos fijos configurados (disciplina de presupuesto)
  if((S.gastosFijos||[]).length >= 2) score += 5;

  // g) Categorías diversificadas en gastos variables (registro completo)
  // CORRECCIÓN: solo penalizar si hay gastos variables — no castigar por tener solo gastos fijos
  const cats = new Set((S.gastosVar||[]).slice(-20).map(g=>g.cat));
  if(gvMes > 0 && cats.size <= 1){ score -= 5; add('Registra las categorías de tus gastos para mejor control.','sugerencia','gastos'); }

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
  return { score, tips, consejos, sinDatos: !tieneAlgo, ingresosMes, rendimientoCDTMes };
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
  const { score, consejos } = res;
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
      ${tipsHtml}
    </div>
  </div>`;
}

/* ====================================================
   PROYECCIÓN FINANCIERA
==================================================== */
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
  if(!patrimonio){
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
  const hist = (S.patrimonioHistorial||[]).slice(-90);
  let tendenciaMensual = 0;
  let historialInsuficiente = false;
  // Niveles: 'insuficiente' | 'normal' | 'estable'
  let nivelConfianza = 'insuficiente';

  // Mínimo de separación temporal real para mostrar una proyección: un mes. Con menos días, un solo movimiento
  // grande (una mesada, un pago) domina el promedio y se extrapola a 3/6/12 meses como si se repitiera cada
  // semana (una mesada de $80.000 en una ventana de 9 días daba +$267.000 al mes, unos 3 millones al año).
  const MIN_DIAS_PARA_TENDENCIA = 30;

  let diasReales = 0; // declarado en scope externo para usarlo en el template del footer
  if(hist.length >= 2){
    // Cambio neto total (sin aperturas/ajustes) y días totales transcurridos —
    // ver más abajo por qué se promedia así en vez de por-intervalo.
    let cambioNetoTotal = 0;
    for(let i=1;i<hist.length;i++){
      const diasEntre = Math.max(1, Math.round((new Date(hist[i].fecha) - new Date(hist[i-1].fecha))/86400000));
      // valorVisible (sin alcancía) en vez de valor crudo — mismo motivo que
      // el patrimonio de arriba: un depósito/destape de alcancía no debe
      // aparecer como un salto de tendencia. Fallback a .valor para puntos
      // del historial guardados antes de que existiera valorVisible.
      const vHoy  = (hist[i].valorVisible!=null)   ? hist[i].valorVisible   : hist[i].valor;
      const vAyer = (hist[i-1].valorVisible!=null) ? hist[i-1].valorVisible : hist[i-1].valor;
      const cambioDelDia = (vHoy - vAyer) - (hist[i].montoBase||0);
      cambioNetoTotal += cambioDelDia;
      diasReales += diasEntre;
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

      // Nivel de confianza escalonado según días de historial disponible
      nivelConfianza = diasReales >= 60 ? 'estable' : 'normal';
    }
  } else {
    historialInsuficiente = true;
    nivelConfianza = 'insuficiente';
  }

  const p3 = patrimonio + tendenciaMensual * 3;
  const p6 = patrimonio + tendenciaMensual * 6;
  const p12 = patrimonio + tendenciaMensual * 12;

  // Deuda TC propia para mostrar impacto (excluye encargos y PC)
  const deudaTC = typeof calcDeudaTcPropia==='function' ? calcDeudaTcPropia() : 0;
  const deudaInfo = deudaTC > 0 ? `<div class="inicio-proy-deuda">Deuda TC propia: ${fmt(deudaTC)} ya descontada del patrimonio</div>` : '';

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
        const pct = patrimonio > 0 ? ((diff/patrimonio)*100).toFixed(1) : '0.0';
        return`<div
          data-proy-key="${key}"
          data-proy-lbl="${lbl}"
          data-proy-val="${val}"
          data-proy-diff="${diff}"
          data-proy-pct="${pct}"
          data-proy-meses="${meses}"
          class="inicio-proy-card">
          <div class="inicio-proy-card-k">${key}</div>
          <div class="inicio-proy-card-v ${val>=patrimonio?'inicio-proy-pos':'inicio-proy-neg'}">${fmt(Math.max(0,val))}</div>
        </div>`;
      }).join('')}
      <div id="_proy-tt" class="inicio-proy-tt" style="display:none;"></div>
    </div>
    ${deudaInfo}
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
      function bindCard(card, e){ e.stopPropagation(); const lbl=card.dataset.proyLbl; const val=parseFloat(card.dataset.proyVal)||0; const diff=parseFloat(card.dataset.proyDiff)||0; const pct=card.dataset.proyPct; const meses=card.dataset.proyMeses; const claseDelta=diff>=0?'inicio-tt-pos':'inicio-tt-neg'; const ico=diff>=0?'<i class="fa-solid fa-arrow-up"></i>':'<i class="fa-solid fa-arrow-down"></i>'; showTT(`<div class="inicio-tt-titulo">Proyección a ${lbl}</div><div class="inicio-tt-fila"><span class="inicio-tt-monto">${fmt2(Math.max(0,val))}</span><span class="inicio-tt-delta ${claseDelta}">${ico} ${diff>=0?'+':''}${fmt2(diff)}</span></div><div class="inicio-tt-nota">${diff>=0?'+':''}${pct}% vs hoy · acumulado ${meses} meses</div>`); card.style.background='var(--bg4)'; setTimeout(()=>{ card.style.background='var(--bg3)'; },200); }
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
  // Gasto real del mes: definición única (periodo.js). Antes sumaba TODOS los gastos variables
  // (incluidos pagos de gasto fijo y de TC, que ya estaban en el total) más TODOS los gastos
  // fijos configurados, estuvieran pagados o no.
  const gastoMes = Periodo.gastosDelMes(mesActual()).total;
  const nu = nuTotal();
  const nequi = getSaldoFuente('nequi');
  const ef = getSaldoFuente('efectivo');
  // Las cuentas personalizadas también son plata disponible: el "Disponible" del hero
  // (refresh() en core-state.js) y liquidoReal (más arriba en este archivo) ya las suman.
  const custom = cuentasCustom().reduce((a, c) => a + (c.saldo || 0), 0);
  const disp = nu + nequi + ef + custom;
  const indicator = document.getElementById('hero-change-indicator');
  if (!indicator) return;
  if (disp > 0 && gastoMes > disp * 0.8) {
    indicator.textContent = 'Gastos altos';
    indicator.style.color = 'var(--amber)';
  } else {
    indicator.textContent = '';
  }
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
