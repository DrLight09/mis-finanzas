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
    (S.deudores||[]).forEach(d=>{
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
    (S.spotifyPersonas||[]).forEach(p=>{
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
    const diasRestantes=Math.ceil((new Date(cdt.vence+'T00:00:00')-new Date())/86400000);
    if(diasRestantes>=0&&diasRestantes<=7) items.push({tipo:'amber',texto:html`CDT "${c.nombre}" vence en ${diasRestantes}d`});
    if(diasRestantes<0) items.push({tipo:'red',texto:html`CDT "${c.nombre}" venció — ¡libera tu plata!`});
  });});
  // Partes comprometidas de un encargo (§ "¿Para qué es esta plata?") cuya
  // fecha de uso ya está cerca. Desde 1 día antes avisa en ámbar; si ya
  // pasó la fecha y sigue sin marcarse "ya la usé", avisa en rojo — esa
  // plata sigue comprometida y sin usar.
  (S.encargos||[]).forEach(enc=>{
    (enc.partes||[]).filter(p=>!p.usada&&p.fecha).forEach(p=>{
      const dias=Math.round((new Date(p.fecha+'T00:00:00')-new Date(hoyStr+'T00:00:00'))/86400000);
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
    titleEl.innerHTML = `Necesita atención <span style="font-size:11px;font-family:'DM Mono',monospace;color:${hasRed?'var(--red)':'var(--amber)'};background:${hasRed?'rgba(240,104,104,.12)':'rgba(240,184,64,.12)'};padding:2px 8px;border-radius:20px;">${items.length} <i class="fa-solid ${isOpen?'fa-chevron-up':'fa-chevron-down'}"></i></span>`;
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
  list.innerHTML=html`${items.map(it=>html`<div class="card card-sm ${raw(it.tipo==='red'?'attn-card-red':'attn-card')}" style="margin-bottom:7px;">
    <div style="font-size:12px;color:${raw(it.tipo==='red'?'var(--red)':'var(--amber)')};">${it.texto}</div>
  </div>`)}`;
}

/* ====================================================
   INDICADOR DE SALUD FINANCIERA
==================================================== */
function calcHealthScore(){
  const S = window.S || {};
  if(!S.cajitas) return null;
  let score = 50;
  const tips = [];

  // ── Cálculos base ────────────────────────────────────────────────────
  const patrimonio = window.calcPatrimonioTotal ? window.calcPatrimonioTotal() : 0;
  const mes = window.mesActual ? window.mesActual() : '';
  const pagosGF = S.pagosGastosFijos || {};

  // Gastos del mes: variables + fijos pagados (ver _esGastoVarNoReal para el criterio de exclusión, compartido con Análisis financiero)
  const gvMes = (S.gastosVar||[]).filter(g=>window.mesKey?window.mesKey(g.fecha)===mes&&!(window._esGastoVarNoReal&&window._esGastoVarNoReal(g)):true).reduce((a,g)=>a+(g.monto||0),0);
  const gfTotal = (S.gastosFijos||[]).reduce((a,g)=>pagosGF[g.id+'_'+mes]?a+(g.monto||0):a,0);
  const gastosMes = gvMes + gfTotal;

  // Deuda TC que realmente es mía (excluye encargos, plata comprometida, préstamos TC)
  const deudaTC = typeof calcDeudaTcPropia==='function' ? calcDeudaTcPropia() : 0;

  // Ingresos del mes: mesada + movimientos tipo ingreso de cuentas personalizadas
  const mesNum = mes ? parseInt(mes.split('-')[1])-1 : 0;
  const anio = mes ? parseInt(mes.split('-')[0]) : 0;
  let ingresosMes = 0;
  if(S.modulos && S.modulos.mesada && typeof getMesadaData==='function'){
    const _mk=anio+'-'+mesNum;
    const _infoPapa=getMesadaData('papa')[_mk];
    const _infoMama=getMesadaData('mama')[_mk];
    const _cuota = typeof _getCuotaAnio==='function' ? _getCuotaAnio : ()=>0;
    if(_infoPapa) ingresosMes += (_infoPapa.monto||_cuota('papa',anio)||0);
    if(_infoMama) ingresosMes += (_infoMama.monto||_cuota('mama',anio)||0);
  }
  // Sumar ingresos de cuentas personalizadas del mes actual
  // (excluye movimientos espejo de Mesada/Prestado/Encargos — ver _esEntradaEspejoNoIngreso)
  (S.cuentasPersonalizadas||[]).forEach(c => {
    (c.movimientos||[]).filter(m=>(m.tipo==='ingreso')&&window.mesKey&&window.mesKey(m.fecha)===mes&&!(window._esEntradaEspejoNoIngreso&&window._esEntradaEspejoNoIngreso(m))).forEach(m=>{ ingresosMes += (m.monto||0); });
  });
  // Entradas manuales a Nequi, Efectivo y cajitas (igual que el análisis de tendencia)
  // Excluir: apertura, _encMovId (encargos), _esReposicionCP (plata comprometida devuelta),
  // Mesada y Prestado (movimientos espejo — ver _esEntradaEspejoNoIngreso, que ya incluye
  // el fallback por desc para movimientos viejos sin _esReposicionCP)
  if(window.mesKey){
    (S.movimientos||[]).filter(m=>
      m.tipo==='entrada' &&
      !(window._esEntradaEspejoNoIngreso&&window._esEntradaEspejoNoIngreso(m)) &&
      (m.fuente==='nequi'||m.fuente==='efectivo'||(m.fuente&&m.fuente.startsWith('cajita:'))||m._prestadoDirectamente) &&
      window.mesKey(m.fecha)===mes
    ).forEach(m=>{ ingresosMes += (m.monto||0); });
  }
  // Ingresos fijos configurados (sueldo, freelance, etc.)
  if(window.getIngresosFijosMes) ingresosMes+=getIngresosFijosMes(mes);

  // ── Rendimiento de CDTs generado este mes (Opción 2: patrimonio real) ──
  // Es plata que el patrimonio total ya ganó este mes, pero sigue bloqueada
  // dentro del CDT — NO es efectivo disponible, así que NO se suma a ingresosMes
  // (que mide flujo de caja real para los ratios de deuda/gasto).
  // Se expone aparte para que la app "sepa" que ese rendimiento existe.
  const rendimientoCDTMes = window.calcRendimientoCDTsMes ? window.calcRendimientoCDTsMes(mes) : 0;

  // ── Liquidez real (solo cuentas disponibles, sin CDTs bloqueados) ─────
  const nu = (S.cajitas||[]).reduce((a,c)=>a+(window.calcC?window.calcC(c).val:c.saldo||0),0);
  const cdtVal = (S.cajitas||[]).reduce((a,c)=>a+(c.cdts||[]).reduce((b,cdt)=>b+(window.calcCDT?window.calcCDT(cdt).val:cdt.monto||0),0),0);
  // CORRECCIÓN: liquido excluye CDTs (son ahorros bloqueados, no disponibles de inmediato).
  // NOTA: ya NO se resta plata de encargos guardada en Nequi/Efectivo/cuentas personalizadas —
  // registrar una entrada de encargo con esa cuenta nunca suma esa plata al saldo real (a
  // diferencia de una cajita de Nu, donde sí forma parte de la base que gana interés), así que
  // restarla acá producía una liquidez negativa falsa. Ver CHANGELOG.md#encargos.
  const liquidoReal = nu + (S.nequiSaldo||0) + (S.efectivoSaldo||0)
    + (S.cuentasPersonalizadas||[]).reduce((a,c)=>a+(c.saldo||0),0)
    - deudaTC;
  // patrimonio total sí incluye CDTs para otros cálculos
  const liquidoConCDTs = liquidoReal + cdtVal;

  // ── Plata prestada a otros ────────────────────────────────────────────
  const prest = window.totalPrestadoPendiente ? window.totalPrestadoPendiente() : 0;

  // ── Hay datos suficientes para evaluar? ───────────────────────────────
  const tieneAlgo = patrimonio > 0 || prest > 0 || deudaTC > 0 || gastosMes > 0;

  // a) Fondo de emergencia: liquidez real vs gastos mensuales
  // CORRECCIÓN: usamos liquidoReal (sin CDTs) — un CDT bloqueado no cubre una emergencia
  if(gastosMes > 0 && liquidoReal > 0){
    const mesesCubiertos = liquidoReal / gastosMes;
    if(mesesCubiertos >= 6) score += 20;
    else if(mesesCubiertos >= 3) score += 10;
    else { score -= 5; tips.push('Tus reservas cubren menos de 3 meses de gastos.'); }
  } else if(gastosMes > 0 && liquidoReal <= 0 && liquidoConCDTs > 0){
    // Tiene gastos pero su liquidez inmediata es cero — salvado solo por CDTs
    score -= 8; tips.push('Tu liquidez disponible es muy baja — tus ahorros están en CDTs, no en cuentas libres.');
  } else if(liquidoReal < 0){
    score -= 15; tips.push('Tu deuda en tarjetas supera tu patrimonio líquido.');
  }

  // b) Deuda de tarjetas de crédito vs ingresos (ratio de endeudamiento TC)
  if(deudaTC > 0 && ingresosMes > 0){
    const ratioTC = deudaTC / ingresosMes;
    if(ratioTC > 3){ score -= 15; tips.push('Tu deuda en TC supera 3 meses de ingresos — prioriza pagarla.'); }
    else if(ratioTC > 1.5){ score -= 8; tips.push('Tu deuda en tarjetas es alta respecto a tus ingresos.'); }
    else score += 5;
  } else if(deudaTC > 0 && ingresosMes === 0){
    // Tiene deuda TC pero no registra ingresos — verificar vs patrimonio
    // CORRECCIÓN: cubrir el caso patrimonio <= 0 que antes se ignoraba
    if(patrimonio > 0 && deudaTC / patrimonio > 0.4){
      score -= 10; tips.push('Tu deuda en tarjetas es alta — considera pagarla con tus ahorros.');
    } else if(patrimonio <= 0 && deudaTC > 0){
      score -= 15; tips.push('Tienes deuda en tarjetas y tu patrimonio no la cubre — prioriza pagarla.');
    }
  }

  // c) Plata prestada a otros (riesgo de incobrabilidad / inmovilización)
  // Penalización escalonada por ratio — independiente del bonus de CDTs
  let ratioPrest = 0;
  if(prest > 0){
    if(liquidoReal <= 0){
      // Toda la liquidez está prestada — caso crítico
      score -= 15; tips.push('Toda tu liquidez está prestada — no tienes nada disponible para emergencias.');
      ratioPrest = Infinity;
    } else {
      ratioPrest = prest / liquidoReal;
      if(ratioPrest > 2){
        // Más del doble de la liquidez prestada — muy comprometido
        score -= 18; tips.push('Tienes más del doble de tu liquidez prestada — tu situación financiera es muy vulnerable.');
      } else if(ratioPrest > 1){
        // Prestó más de lo que tiene líquido
        score -= 13; tips.push('Tienes más plata prestada que tu liquidez disponible — queda poco para emergencias.');
      } else if(ratioPrest > 0.4){
        score -= 8; tips.push('Tienes mucho dinero prestado sin cobrar (>40% de tu liquidez).');
      }
      // ratioPrest <= 0.4: situación sana, no penalizar
    }
  }

  // d) Ratio gastos/ingresos (disciplina de gasto)
  if(ingresosMes > 0 && gastosMes > 0){
    const ratioGasto = gastosMes / ingresosMes;
    if(ratioGasto <= 0.7) score += 10;
    else if(ratioGasto <= 0.9) score += 5;
    else if(ratioGasto > 1){ score -= 10; tips.push('Estás gastando más de lo que ingresas este mes.'); }
  }

  // e) CDTs activos (ahorro estructurado)
  // Si el riesgo de prestado es alto (ratio > 1), el CDT no compensa — bonus reducido a +3
  // Solo cuando la situación de liquidez es sana merece el bonus completo
  const cdts = (S.cajitas||[]).reduce((a,c)=>a+(c.cdts||[]).length,0);
  if(cdts >= 1){
    const cdtBonus = ratioPrest > 1 ? 3 : 10;
    score += cdtBonus;
  } else if(tieneAlgo && liquidoReal > 0){
    tips.push('Considera poner algo en un CDT para hacer crecer tus ahorros.');
  }

  // f) Gastos fijos configurados (disciplina de presupuesto)
  if((S.gastosFijos||[]).length >= 2) score += 5;

  // g) Categorías diversificadas en gastos variables (registro completo)
  // CORRECCIÓN: solo penalizar si hay gastos variables — no castigar por tener solo gastos fijos
  const cats = new Set((S.gastosVar||[]).slice(-20).map(g=>g.cat));
  if(gvMes > 0 && cats.size <= 1){ score -= 5; tips.push('Registra las categorías de tus gastos para mejor control.'); }

  score = Math.max(0, Math.min(100, score));
  if(!tips.length){
    if(score >= 80) tips.push('¡Excelente! Tus finanzas están muy bien.');
    else if(score >= 60) tips.push('Vas bien — diversifica tus ahorros o reduce gastos variables para subir tu puntaje.');
    else if(tieneAlgo) tips.push('Hay espacio para mejorar: revisa tus gastos y ahorros para subir tu puntaje.');
    else tips.push('Registra más movimientos para un análisis más preciso.');
  }
  return { score, tips, ingresosMes, rendimientoCDTMes };
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
  if(!res){ el.innerHTML = '<div style="font-size:12px;color:var(--text3);">Registra más datos para calcular tu salud financiera.</div>'; return; }
  const { score, tips } = res;
  const col = score >= 75 ? 'var(--accent)' : score >= 50 ? 'var(--amber)' : 'var(--red)';
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
  const icoWarn = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
  const icoOk = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
  const positivosPrefijos = ['¡Excelente','Vas bien','Registra más','Considera poner'];
  const tipsHtml = tips.map(t => {
    const esPositivo = positivosPrefijos.some(p => t.startsWith(p));
    const color = esPositivo ? 'var(--accent)' : 'var(--amber)';
    const icon = esPositivo ? icoOk : icoWarn;
    return `<div style="display:flex;align-items:flex-start;gap:5px;margin-top:4px;color:${color};font-size:11px;line-height:1.4;">${icon}<span>${t}</span></div>`;
  }).join('');
  el.innerHTML = `<div class="health-ring-wrap" style="align-items:flex-start;">
    <svg class="health-ring" width="76" height="76" viewBox="0 0 76 76" style="flex-shrink:0;">
      <circle cx="38" cy="38" r="${r}" fill="none" stroke="var(--bg3)" stroke-width="7"/>
      <circle cx="38" cy="38" r="${r}" fill="none" stroke="${col}" stroke-width="7"
        ${dasharrayAttr}
        stroke-dashoffset="${(circ/4).toFixed(1)}"
        stroke-linecap="${linecap}" style="transition:stroke-dasharray .8s cubic-bezier(.4,0,.2,1);"/>
      <text x="38" y="43" text-anchor="middle" font-size="16" font-weight="600" fill="${col}" font-family="DM Mono,monospace">${score}</text>
    </svg>
    <div class="health-details">
      <div class="health-score-num" style="color:${col};">${label}</div>
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
  // calcPatrimonioTotal() incluye la alcancía siempre, tapada o no (es plata
  // real, y así la sigue viendo Salud financiera). Pero esta card sí muestra
  // un número puntual al usuario en cada render — si se usa el total crudo,
  // depositar en la alcancía hace que "Tendencia mensual"/3m/6m/12m salten
  // al instante por el monto exacto del depósito, delatando "acabás de
  // guardar $X" tan claro como si el gráfico de Análisis mostrara la curva
  // cruda (mismo problema que ya se corrigió ahí con valorVisible — ver
  // CHANGELOG.md#alcancía). Se resta acá también para que la sorpresa se
  // mantenga; cuando se destape, esa plata entra a una cuenta real y el
  // patrimonio visible sube solo, de forma natural.
  const _alcSaldoOculto = (S.alcancia && S.alcancia.saldoRegistrado) ? S.alcancia.saldoRegistrado : 0;
  const patrimonioReal = window.calcPatrimonioTotal ? window.calcPatrimonioTotal() : 0;
  const patrimonio = patrimonioReal - _alcSaldoOculto;
  if(!patrimonio){ el.innerHTML = '<div class="row"><span style="font-size:12px;color:var(--text3);">Sin datos suficientes</span></div>'; return; }

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
  // Niveles: 'insuficiente' | 'preliminar' | 'normal' | 'estable'
  let nivelConfianza = 'insuficiente';

  // Mínimo de separación temporal real para confiar en una proyección. Con menos días,
  // un solo movimiento grande se extrapola de forma absurda.
  const MIN_DIAS_PARA_TENDENCIA = 7;

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
      if(diasReales >= 60)       nivelConfianza = 'estable';
      else if(diasReales >= 30)  nivelConfianza = 'normal';
      else                       nivelConfianza = 'preliminar';
    }
  } else {
    historialInsuficiente = true;
    nivelConfianza = 'insuficiente';
  }

  const p3 = patrimonio + tendenciaMensual * 3;
  const p6 = patrimonio + tendenciaMensual * 6;
  const p12 = patrimonio + tendenciaMensual * 12;
  const col = tendenciaMensual >= 0 ? 'var(--accent)' : 'var(--red)';

  // Deuda TC propia para mostrar impacto (excluye encargos y PC)
  const deudaTC = typeof calcDeudaTcPropia==='function' ? calcDeudaTcPropia() : 0;
  const deudaInfo = deudaTC > 0 ? `<div style="font-size:10px;color:var(--red);margin-top:5px;font-family:'DM Mono',monospace;">Deuda TC propia: ${fmt(deudaTC)} ya descontada del patrimonio</div>` : '';

  // Calcular diferencias absolutas para el tooltip de cada card
  const proyCards = [
    { lbl:'3 meses', key:'3m', val:p3, meses:3 },
    { lbl:'6 meses', key:'6m', val:p6, meses:6 },
    { lbl:'1 año',   key:'12m', val:p12, meses:12 }
  ];

  el.innerHTML = historialInsuficiente ? `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding:2px 0;">
      <span style="font-size:12px;color:var(--text2);">Tendencia mensual<span style="font-size:9px;color:var(--text3);margin-left:5px;"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="8"/><line x1="12" y1="12" x2="12" y2="16"/></svg></span></span>
      <span style="font-size:13px;font-weight:600;font-family:'DM Mono',monospace;color:var(--text3);">—</span>
    </div>
    <div style="text-align:center;background:var(--bg3);border-radius:8px;padding:16px 10px;">
      <div style="font-size:11px;color:var(--text3);line-height:1.5;">Aún no hay suficiente historial para proyectar.<br>Vuelve en unos días para ver tendencias y proyecciones.</div>
    </div>
    ${deudaInfo}
  ` : `
    <div id="_proy-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;cursor:pointer;padding:2px 0;" data-tendencia="${tendenciaMensual}">
      <span style="font-size:12px;color:var(--text2);">Tendencia mensual<span style="font-size:9px;color:var(--text3);margin-left:5px;"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="8"/><line x1="12" y1="12" x2="12" y2="16"/></svg></span></span>
      <span style="font-size:13px;font-weight:600;font-family:'DM Mono',monospace;color:${col};">${tendenciaMensual>=0?'+':''}${fmt(tendenciaMensual)}</span>
    </div>
    <div id="_proy-cards-wrap" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px;position:relative;">
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
          style="text-align:center;background:var(--bg3);border-radius:8px;padding:10px 6px;min-width:0;cursor:pointer;-webkit-tap-highlight-color:rgba(200,240,96,.12);transition:background .12s;">
          <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.7px;font-family:'DM Mono',monospace;margin-bottom:4px;">${key}</div>
          <div style="font-size:clamp(10px,3vw,13px);font-weight:600;font-family:'DM Mono',monospace;color:${val>=patrimonio?'var(--accent)':'var(--red)'};overflow-wrap:break-word;word-break:break-word;">${fmt(Math.max(0,val))}</div>
        </div>`;
      }).join('')}
      <div id="_proy-tt" style="display:none;position:absolute;top:calc(100% + 8px);left:0;right:0;background:#1a1a1a;border:1px solid #383838;border-radius:10px;padding:10px 13px;font-family:'DM Mono',monospace;z-index:50;box-shadow:0 4px 20px rgba(0,0,0,.7);"></div>
    </div>
    ${deudaInfo}
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
      <span style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;">Basado en ${diasReales} días de historial</span>
      ${nivelConfianza==='preliminar'
        ? `<span style="font-size:9px;font-family:'DM Mono',monospace;color:#e8a838;background:rgba(232,168,56,.12);border:1px solid rgba(232,168,56,.25);border-radius:4px;padding:1px 6px;letter-spacing:.3px;">PRELIMINAR</span>`
        : nivelConfianza==='estable'
        ? `<span style="font-size:9px;font-family:'DM Mono',monospace;color:var(--accent);background:rgba(200,240,96,.08);border:1px solid rgba(200,240,96,.2);border-radius:4px;padding:1px 6px;letter-spacing:.3px;">ESTABLE</span>`
        : `<span style="font-size:9px;font-family:'DM Mono',monospace;color:var(--text3);border-radius:4px;padding:1px 6px;">estimación</span>`
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
      function bindHeader(ev){ ev.stopPropagation(); const t=parseFloat(header.dataset.tendencia)||0; const pos=t>=0; showTT(`<div style="font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">¿Qué significa esto?</div><div style="font-size:11px;color:#f0ede8;line-height:1.5;">Ritmo mensual de <b style="color:${pos?'#c8f060':'#f06868'}">crecimiento real del patrimonio</b> (ingresos, gastos, intereses y rendimientos — sin contar saldos iniciales ni ajustes de base).</div><div style="font-size:9px;color:var(--text3);margin-top:4px;">${pos?'Tu patrimonio está creciendo ~'+fmt2(t)+' por mes en promedio.':'Tu patrimonio está bajando ~'+fmt2(Math.abs(t))+'/mes en promedio.'}</div>`); }
      header.addEventListener('click', bindHeader);
      header.addEventListener('touchend', function(e){ e.preventDefault(); bindHeader(e); });
    }
    // Cards 3m/6m/12m
    const wrap = el.querySelector('#_proy-cards-wrap');
    if(wrap){
      function bindCard(card, e){ e.stopPropagation(); const lbl=card.dataset.proyLbl; const val=parseFloat(card.dataset.proyVal)||0; const diff=parseFloat(card.dataset.proyDiff)||0; const pct=card.dataset.proyPct; const meses=card.dataset.proyMeses; const col2=diff>=0?'#c8f060':'#f06868'; const ico=diff>=0?'↑':'↓'; showTT(`<div style="font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Proyección a ${lbl}</div><div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;"><span style="font-size:14px;font-weight:700;color:#f0ede8;">${fmt2(Math.max(0,val))}</span><span style="font-size:11px;font-weight:600;color:${col2};">${ico} ${diff>=0?'+':''}${fmt2(diff)}</span></div><div style="font-size:9px;color:var(--text3);">${diff>=0?'+':''}${pct}% vs hoy · acumulado ${meses} meses</div>`); card.style.background='var(--bg4)'; setTimeout(()=>{ card.style.background='var(--bg3)'; },200); }
      wrap.addEventListener('click', function(e){ const card=e.target.closest('[data-proy-key]'); if(card) bindCard(card,e); });
      wrap.addEventListener('touchend', function(e){ const card=e.target.closest('[data-proy-key]'); if(card){ e.preventDefault(); bindCard(card,e); } });
    }
    // Cerrar al tocar fuera
    document.addEventListener('click', function(e){ if(!e.target.closest('#proyeccion-card')){ tt.style.display='none'; } });
  })();
}

/* ================================================================
   ALERTA DE GASTO ALTO EN EL HERO
   ================================================================ */
function _checkGastoAlto() {
  const mes = mesActual();
  const gvMes = gastosMes(mes).reduce((a,g) => a + (g.monto||0), 0);
  const gfTotal = (S.gastosFijos||[]).reduce((a,g) => a + (g.monto||0), 0);
  // GUARD defensivo: nuTotal() vive en cuentas.js. Si en algún momento
  // cuentas.js no está cargado (lazy sin terminar de resolver, o revertido
  // más adelante), esto no debe tirar la app entera — se salta el chequeo
  // de gasto alto esta vez, refresh() sigue con todo lo demás.
  const nu = typeof nuTotal === 'function' ? nuTotal() : 0;
  const nequi = S.nequiSaldo || 0;
  const ef = S.efectivoSaldo || 0;
  const disp = nu + nequi + ef;
  const indicator = document.getElementById('hero-change-indicator');
  if (!indicator) return;
  if (disp > 0 && (gvMes + gfTotal) > disp * 0.8) {
    indicator.textContent = 'Gastos altos';
    indicator.style.color = 'var(--amber)';
  } else {
    indicator.textContent = '';
  }
}

// Hook _checkGastoAlto en refresh — refresh() ya existe para este punto
// (se define en index.html, cargado antes que este módulo).
const _origRefreshInicio = window.refresh;
window.refresh = function() {
  if (_origRefreshInicio) _origRefreshInicio.apply(this, arguments);
  _checkGastoAlto();
};

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
