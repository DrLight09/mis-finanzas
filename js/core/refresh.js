// js/core/refresh.js
//
// Refresh: repintado de la app: Refresh.registrar/refresh(), el repintado de Inicio (_refreshNucleo, renderCuentasInicio) y saveAndRefresh.
// Parte del antiguo el núcleo (js/core/estado.js y hermanos) (dividido por responsabilidad). Clásico (<script defer>), sin type="module": sus globales son
// léxicos de script clásico. El ORDEN de carga en index.html es el de esta lista: estado → cuentas-fuentes → persistencia →
// patrimonio → ingresos → dialogos → utilidades-ui → refresh.

const Refresh = (() => {
  const partes = []; // { id, fn, pantallas, orden, n }
  let n = 0;
  const activa = nombre => { const el = typeof document !== 'undefined' && document.getElementById('screen-' + nombre); return !!(el && el.classList.contains('active')); };
  function registrar(id, fn, opts) {
    if (typeof id !== 'string' || !id || typeof fn !== 'function') throw new Error('Refresh.registrar(id, fn, opts): id (texto) y fn (función) son obligatorios');
    const o = opts || {};
    const pantallas = o.pantalla == null ? null : [].concat(o.pantalla);
    const i = partes.findIndex(p => p.id === id);
    const parte = { id, fn, pantallas, orden: o.orden == null ? 100 : o.orden, n: i >= 0 ? partes[i].n : n++ };
    if (i >= 0) partes[i] = parte; else partes.push(parte);
    partes.sort((a, b) => a.orden - b.orden || a.n - b.n);
  }
  function ejecutar() {
    partes.slice().forEach(p => {
      if (p.pantallas && !p.pantallas.some(activa)) return;
      try { p.fn(); } catch (e) { console.error('[Refresh:' + p.id + ']', e); }
    });
  }
  const quitar = id => { const i = partes.findIndex(p => p.id === id); if (i >= 0) partes.splice(i, 1); };
  const registrados = () => partes.map(p => ({ id: p.id, pantalla: p.pantallas, orden: p.orden }));
  return { registrar, ejecutar, quitar, registrados };
})();
if (typeof window !== 'undefined') window.Refresh = Refresh;

function refresh(){
  asegurarEfectivo(); // Efectivo siempre existe; se guarda con el próximo save()
  _refreshNucleo();
  Refresh.ejecutar();
}

/* Resumen de cuentas de Inicio: un recuadro por cada cuenta activa (con su color), más «Prestado» y los CDTs si hay una cuenta de
   ahorro. Se pinta desde S.cuentas, no desde HTML fijo: quien tiene dos cuentas ve dos recuadros, quien tiene seis ve seis. */
function _colorSeguro(c){return /^#[0-9a-fA-F]{6}$/.test(String(c||''))?c:'var(--text2)';}
function renderCuentasInicio(){
  const el=document.getElementById('inicio-cuentas');
  if(!el)return;
  // El contenedor ES la cuadrícula (con Disponible/Prestado/CDTs ya dentro): se quitan los recuadros de la vez anterior y se
  // agregan los de ahora como hermanos directos.
  if(el.querySelectorAll)el.querySelectorAll('.stat-cuenta,.ix-cuentas-vacio').forEach(n=>n.remove());
  const activas=cuentasActivas();
  const soloEfectivo=activas.length>0&&activas.every(esCuentaFija);
  // Efectivo siempre existe (asegurarEfectivo): nunca hay «cero cuentas», así que no hay estado vacío que pintar.
  // Si la última fila queda incompleta, el último recuadro se estira para ocuparla (nunca quedan huecos).
  const fijos=2+(cuentasAhorro({soloActivas:true}).length?1:0);
  const resto=(fijos+activas.length)%3;
  const tile=(nombre,monto,color,extra)=>html`<div class="stat stat-cuenta${extra}"><div class="stat-label">${nombre}</div><div class="stat-value" data-color="${_colorSeguro(color)}">${fmtNoCents(monto)}</div></div>`;
  const marcado=html`${activas.map((c,i)=>{
    const ult=i===activas.length-1;
    const extra=ult&&resto===1?' stat-span3':ult&&resto===2?' stat-span2':'';
    return tile(c.nombre,esCuentaAhorro(c)?cajitasDeCuenta(c.id).reduce((a,x)=>a+calcC(x).val,0):(c.saldo||0),colorCuenta(c),extra);
  })}${soloEfectivo&&!S.invitacionCuentasOculta?html`<div class="card ix-cuentas-vacio stat-span3"><button type="button" class="ix-cuentas-vacio-x btn-icon" aria-label="No mostrar más" title="No mostrar más" ${raw(Events.attr('cuentas:ocultarInvitacionCuentas'))}>×</button><div class="ix-cuentas-vacio-txt">Agrega tu banco, Nequi o cuenta de ahorro para empezar a registrar.</div><button type="button" class="btn btn-primary" ${raw(Events.attr('cuentas:abrirOnboarding'))}>Agregar cuenta</button></div>`:''}`;
  if(el.insertAdjacentHTML)el.insertAdjacentHTML('beforeend',String(marcado));
  else el.innerHTML+=String(marcado);
  el.querySelectorAll('[data-color]').forEach(n=>{n.style.color=n.dataset.color;}); // color calculado: se asigna por DOM
}

function _refreshNucleo(){
  // Auto-sanación de tarjetas de crédito: agrega campos nuevos, infiere el
  // saldo inicial de tarjetas migradas y recalcula la deuda de cada una a
  // partir de sus movimientos (regla de consistencia). Es idempotente.
  if(typeof tcNormalizarTarjetas==='function') tcNormalizarTarjetas();
  // NOTA: ya NO se resta plata de encargos guardada en las cuentas con saldo — mismo criterio y misma razón que en
  // calcPatrimonioTotal().
  const cuentasSaldo=saldoCuentas({soloActivas:true});
  // FIX 2026-08-13: totalPrestadoPendiente (prestado.js, grupo lazy) sin
  // guard — mismo patrón de fallback (0) que ya usa inicio.js línea ~253
  // (window.totalPrestadoPendiente?...:0) para el mismo caso.
  const prest=typeof Deudas!=='undefined'?Deudas.totalPendiente('favor'):0;
  // CDTs value comes from calcCDT nested in cajitas
  const cdts=(S.cajitas||[]).reduce((a,c)=>a+(c.cdts||[]).reduce((b,cdt)=>b+calcCDT(cdt).val,0),0);
  const cajitasLibres=(S.cajitas||[]).reduce((a,c)=>a+calcC(c).val,0);
  const disp=cajitasLibres+cuentasSaldo;
  // Expuesto para que inicio.js (Neto de TC) reste la deuda de TC de este
  // MISMO número en vez de recalcular "disponible" por su cuenta — evita
  // que ambos cálculos se desalineen (ver CHANGELOG.md#inicio, 2026-09-20).
  window._dispActualHoy = disp;
  const mes=mesActual();
  // Gasto del mes: definición única en periodo.js (gastos fijos pagados con su monto pagado +
  // gastos variables reales, sin pagos de gasto fijo/TC/alcancía/extras de préstamo).
  const _gastosMesHoy=Periodo.gastosDelMes(mes);
  const gfTotal=_gastosMesHoy.gfTotal;
  const gvMes=_gastosMesHoy.gvTotal;

  // Total intereses generados hoy en cajitas libres (base = saldo propio + encargos en la cajita)
  const interesesDe=cajitas=>cajitas.reduce((a,c)=>{
    const k=calcC(c);
    const tasaCajita=getTasaCuenta(c.cuentaId); // la tasa EA de la cuenta de ahorro a la que pertenece
    // Incluir saldo de encargos en la base del interés (son intereses a mi favor)
    const baseInteres=k.val+(k.saldoEncargos||0);
    return a+(baseInteres>0?baseInteres*(Math.pow(1+tasaCajita/100,1/365)-1):0);
  },0);
  const interesesTotalHoy=interesesDe(S.cajitas||[]);

  // El patrimonio del hero NO se arma aquí: sale de calcPatrimonioDesglose() (arriba, junto a calcPatrimonioTotal), la misma
  // cuenta que usan el historial, la gráfica de Análisis, la Proyección y Salud. Así el hero no puede desalinearse de ellos
  // (antes tenía su propia fórmula y no restaba «Yo debo»). `visible` = sin Alcancía, que se oculta para mantener la sorpresa.
  const _pat=calcPatrimonioDesglose();
  const _alcSaldo=_pat.alcancia;
  const _patrimonioVisible=_pat.visible;
  // Red de seguridad (2026-09-26): fmt()/fmtNoCents() hacen `n||0`, así que un
  // NaN acá se mostraría como "$0" silencioso, indistinguible de un patrimonio
  // real en cero — exactamente lo que pasó con el bug de fecha sin padear en
  // un CDT (ver _fechaSafe() más arriba). Esto no arregla la causa, pero deja
  // rastro en consola para no perder otra sesión entera diagnosticando a ciegas.
  if(isNaN(_patrimonioVisible)){
    console.error('[refresh] _patrimonioVisible dio NaN — revisar fechas corruptas u otra fuente de NaN en cajitas/CDTs/deudores/tarjetas', _pat);
  }
  const _heroFormula=document.getElementById('hero-formula');
  if(_heroFormula)_heroFormula.textContent=patrimonioFormulaTexto(_pat);
  document.getElementById('heroTotal').textContent=fmt(_patrimonioVisible);
  // Color y mensaje del hero según la situación real (negativo, liquidez negativa…): calcEstadoHero/renderHeroEstado viven en inicio.js.
  if(typeof renderHeroEstado==='function')renderHeroEstado(_pat);
  // Indicador de alcancía en el hero — ícono chico junto al label, no un
  // bloque aparte (docs/auditoria-tecnica.md, "Reservar espacio para
  // #hero-alcancia-indicator (CLS)"): al vivir en la misma línea/alto que el
  // label, alternar su visibility no reserva ni desplaza nada — cero CLS sin
  // el hueco vacío permanente que tenía la versión anterior (bloque con
  // padding/borde debajo, ver historial de este archivo).
  const _heroAlcBadge = document.getElementById('hero-alcancia-badge');
  const _heroLabel    = document.getElementById('hero-patrimonio-label');
  if(_heroAlcBadge){
    if(_alcSaldo > 0){
      _heroAlcBadge.style.visibility = 'visible';
      if(_heroLabel) _heroLabel.textContent = 'Patrimonio visible';
    } else {
      _heroAlcBadge.style.visibility = 'hidden';
      if(_heroLabel) _heroLabel.textContent = 'Patrimonio total';
    }
  }
  document.getElementById('s-disp').textContent=fmtNoCents(disp);
  renderCuentasInicio();
  document.getElementById('s-prest').textContent=fmtNoCents(prest);
  document.getElementById('s-cdt').textContent=fmtNoCents(cdts);
  const _cdtTile=document.getElementById('s-cdt-tile');if(_cdtTile)_cdtTile.style.display=cuentasAhorro({soloActivas:true}).length?'':'none';
  document.getElementById('s-gf').textContent=fmtNoCents(gfTotal);
  document.getElementById('s-gv').textContent=fmtNoCents(gvMes);
  document.getElementById('s-gtotal').textContent=fmtNoCents(gfTotal+gvMes);
  // El total de la cuenta de ahorro abierta y sus intereses de hoy los pinta su pantalla (nu.js, renderDetalleAhorro).

  // Si hay una cuenta abierta, actualizar su detalle
  // FIX (auditoria-tecnica.md #5): las llamadas de este bloque no tenían
  // guard typeof — bloqueaban de raíz volver lazy cuentas/encargos/gastos/
  // prestado/spotify/inicio/tarjetas_credito (ReferenceError en el primer
  // refresh() tras cargar el módulo bajo demanda). Mismo patrón defensivo
  // ya usado para renderMesada/_refreshCajitaDet/renderTCScreen — no cambia
  // el comportamiento actual (todo sigue cargando de entrada).
  // FIX 2026-08-13: cuentaActual es una VARIABLE (no
  // función) que vive en cuentas.js, grupo lazy — a diferencia de las
  // llamadas de función de acá abajo (que sí tenían guard con
  // typeof fn==='function'), estas se referenciaban bare (if(cuentaActual)),
  // lo que también tira ReferenceError si cuentas.js no cargó. Mismo
  // guard typeof!=='undefined' que ya usa este archivo para Events.
  // Detalle de la cuenta abierta: renderDetalleCuenta() recibe su fuente ('cuenta:ID') y ya ignora una cuenta borrada.
  if(typeof renderDetalleCuenta==='function' && typeof cuentaActual!=='undefined' && cuentaActual) renderDetalleCuenta(cuentaActual);
  // Siempre actualizar el detalle/sub-pantallas de cajita si hay una abierta
  if(typeof _refreshCajitaDet==='function') _refreshCajitaDet();
  // FIX (2026-08-17, hallazgo nuevo al confirmar contra gastos.md):
  // renderGastosVar() se llamaba acá Y OTRA VEZ más abajo, indirecto, vía
  // renderMesFiltros() — gastos.md documenta que "renderMesFiltros() arma
  // los chips de filtro por mes y dispara renderGastosVar()". Resultado:
  // el historial de gasto variable se reconstruía dos veces por cada
  // refresh() (loop completo sobre gastosVar + formateo de moneda, dos
  // veces seguidas), sin ningún efecto visible distinto — trabajo tirado,
  // no un bug de datos. Se saca la llamada directa; sigue ejecutándose,
  // una sola vez, vía renderMesFiltros() más abajo.
  // OPTIMIZACIÓN TBT (2026-08-15/17, ver auditoria-tecnica.md #12): estas
  // llamadas re-renderizaban su pantalla completa en CADA refresh() — sin
  // importar si el usuario la estaba viendo. Ya se re-renderizan al ENTRAR
  // a su pantalla (showScreen(), ver navegacion.js) — Cuentas y Gastos
  // recibieron sus hooks recién el 2026-08-17 (renderCajitas/
  // renderSelectorCuentas/renderMesFiltros/renderGastosFijos, confirmado
  // contra cuentas.js/gastos.js reales que son funciones puras de render),
  // así que ya es seguro sumarlas al mismo guard "está activa AHORA" que
  // ya usan renderDeudoresList/renderMesada/renderSpotify más abajo.
  const _screenCuentasActiva=document.getElementById('screen-cuentas')&&document.getElementById('screen-cuentas').classList.contains('active');
  const _screenGastosActiva=document.getElementById('screen-gastos')&&document.getElementById('screen-gastos').classList.contains('active');
  if(_screenCuentasActiva && !(typeof cuentaActual!=='undefined' && cuentaActual)){
    if(typeof renderCajitas==='function') renderCajitas();
  }
  if(_screenCuentasActiva && typeof renderSelectorCuentas==='function') renderSelectorCuentas();
  if(_screenGastosActiva && typeof renderGastosFijos==='function') renderGastosFijos();
  if(_screenGastosActiva && typeof renderMesFiltros==='function') renderMesFiltros();
  // Préstamos tiene DOS listas (Me deben / Yo debo) y las dos viven en el DOM aunque una esté oculta: se pintan
  // las dos, así un cambio en una pestaña no deja la otra con datos viejos (antes solo se pintaba "Me deben" y
  // "Yo debo" quedaba desactualizada hasta cambiar de pantalla).
  if(document.getElementById('screen-prestamos') && document.getElementById('screen-prestamos').classList.contains('active')){
    if(typeof renderDeudoresList==='function') renderDeudoresList();
    if(typeof renderMisDeudasList==='function') renderMisDeudasList();
  }
  if(typeof renderMesada==='function' && document.getElementById('screen-mesada') && document.getElementById('screen-mesada').classList.contains('active')) renderMesada();
  if(typeof renderSpotify==='function' && document.getElementById('screen-spotify') && document.getElementById('screen-spotify').classList.contains('active')) renderSpotify();
  if(typeof renderAttencion==='function') renderAttencion();
  if(typeof renderTCDashboard==='function') renderTCDashboard();
  // FIX: faltaba acá — la pantalla de Tarjetas (renderTCScreen) solo se
  // actualizaba al crear/editar/eliminar una tarjeta. Si Firestore traía
  // los datos DESPUÉS de haber entrado a la pantalla (o mientras estaba
  // abierta), se quedaba pegada mostrando el estado vacío ("$0 · Agregar
  // tarjeta de crédito") hasta que alguna acción la forzara a redibujar.
  if(typeof renderTCScreen==='function' && document.getElementById('screen-tarjetas') && document.getElementById('screen-tarjetas').classList.contains('active')) renderTCScreen();
}


/* ---- ANÁLISIS FINANCIERO: migrado a js/modules/analisis.js (renderAnalisis, Ingresos Fijos, Presupuestos).
   calcPatrimonioTotal()/snapshotPatrimonio() se quedan acá — son núcleo, los llama save() en cada guardado. ---- */

// Nu: cajitas, metas de ahorro y CDTs (UI) migrados a js/modules/nu.js.

/* ---- GASTOS VARIABLES ---- */
// (bloque completo: switchGastoTab, renderMesFiltros, setMesFiltro,
// renderGastosVar, addGastoVar, deleteGastoVar, más abrirNuevoGastoVar/
// abrirNuevoGastoFijo) migrado a js/modules/gastos.js — ver docs/gastos.md.

/* ---- INGRESOS FIJOS: migrado a js/modules/analisis.js ---- */
/* ---- GASTOS FIJOS ---- */
// (bloque completo: renderGastosFijos, addGastoFijo, deleteGastoFijo,
// abrirPagarGastoFijo, pgfActualizarSaldo, confirmarPagarGastoFijo)
// migrado a js/modules/gastos.js — ver docs/gastos.md.

// Módulo Préstamos (Me deben / Yo debo / Préstamo con TC) migrado a
// js/modules/prestado.js — ver docs/prestado.md (la integración con Personas vive dentro
// de ese mismo módulo). El <script src> real está más abajo, junto a mesada.js/spotify.js:
// depende de crearSplitWidget() y diffRegistrarInstancia().

/* ---- MOTOR GENÉRICO "SPLIT DE FUENTES": migrado a js/core/split.js (crearSplitWidget,
   splitToggle, splitAgregarRow, splitGetData, splitPreview). Se carga junto con
   js/core/diferencial.js, antes de todos los módulos que dependen de él
   (mesada.js, encargos.js, prestado.js). Ver ese archivo para el detalle de
   qué se migró exactamente. ---- */

// Instancia 'abonoEncCuenta' del motor de split (dividir el abono entre
// varias cuentas de un mismo encargo) migrada a js/modules/prestado.js —
// ver docs/prestado.md. El motor genérico (crearSplitWidget/splitToggle/
// splitAgregarRow/splitGetData/splitPreview) sigue acá, compartido con
// Mesada y Encargos.

// Módulo Spotify migrado a js/modules/spotify.js — ver docs/spotify.md.
// Carga temprana (acá mismo, no más abajo): un par de wirings de botones de
// otros módulos referencian addSpotify/guardarEditarSpotify de forma
// inmediata (no diferida) más adelante en este archivo, y necesitan que ya
// existan. La integración con Personas vive dentro de
// spotify.js (fusionada el 2026-08-03).

// Módulo Mesada migrado a js/modules/mesada.js — ver docs/mesada.md.
// Carga acá y no más arriba (donde vivía antes) porque depende de
// crearSplitWidget(), definido justo arriba en este mismo bloque —
// mismo criterio que Spotify: cargar donde la dependencia más
// exigente ya esté satisfecha.

// Guarda y repinta: lo que casi todo handler de escritura termina llamando.
function saveAndRefresh() {
  save();
  refresh();
}
