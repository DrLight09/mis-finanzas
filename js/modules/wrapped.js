/* ═══════════════════════════════════════════════════════════════
   js/modules/wrapped.js

   Módulo "Wrapped" — resumen narrativo tipo Spotify Wrapped de mes/año,
   pantalla nueva accesible desde "Más" → Tu resumen. Duodécimo grupo lazy
   (ver js/core/lazy-loader.js).

   No es un módulo de datos: no guarda absolutamente nada nuevo en S.
   Todo se calcula en vivo, cada vez que se abre la pantalla o se cambia
   de pestaña (mes/año), a partir de estructuras que YA existen y que
   otras pantallas ya usan como fuente de verdad — mismo principio que el
   resto de la app ("los movimientos son la fuente de verdad, nunca un
   valor cacheado que pueda desincronizarse").

   A propósito NO cubre Mesada, Spotify, Encargos ni Plata Comprometida:
   son plata de terceros o compartida, no el desempeño financiero propio
   del usuario — ver wrapped.md §7 "Decisiones de diseño" para el detalle
   de esta decisión.

   Depende de (todas con guard typeof, ninguna es obligatoria):
   - `_esGastoVarNoReal` / `_esEntradaEspejoNoIngreso` — helpers centralizados
     de Análisis financiero (viven en un archivo núcleo eager, no en
     analisis.js, ya que Inicio también los usa sin ser lazy — ver
     analisis-financiero.md §9bis).
   - `calcPatrimonioTotal` — núcleo, eager.
   - `window._alcRachaAhorro` / `window._alcMejorCiclo` — expuestas por
     alcancia.js (grupo lazy aparte); si Alcancía no cargó todavía, esa
     cifra puntual simplemente no se muestra.
   - `fmt` — formateador de moneda, núcleo.
   ═══════════════════════════════════════════════════════════════ */
(function(){
'use strict';

/* ─── ESTADO LOCAL DE LA PANTALLA (qué pestaña se está viendo) ───────────── */
let _wrappedTab = 'mes'; // 'mes' | 'anio'

/* ─── HELPERS DE RANGO DE FECHA ────────────────────────────────────────────
   Todas las fechas en S son strings "YYYY-MM-DD" (mismo formato en
   Mesada/Spotify/Alcancía, ver sus .md) — comparación por slice, sin
   depender de ningún formato de "mesK" propio de otra pantalla. */
function _wrappedEnRango(fecha, tipo, mesK, anioK){
  if(!fecha) return false;
  return tipo === 'mes' ? fecha.slice(0,7) === mesK : fecha.slice(0,4) === anioK;
}

function _wrappedHoy(){
  return typeof hoy === 'function' ? hoy() : new Date().toISOString().slice(0,10);
}

/* ─── CÁLCULO PURO: gasto/ingreso real + top categoría + alcancía de un
   período (mes o año) ──────────────────────────────────────────────────
   Reutiliza los mismos criterios de "gasto/ingreso real" que Análisis
   financiero, Inicio, Salud financiera y Presupuestos — nunca un filtro
   propio (ver analisis-financiero.md §9bis). Sin `S`, o sin esos helpers
   disponibles, degrada a no filtrar nada (mejor mostrar de más que
   romper la pantalla). */
function _wrappedCalcularPeriodo(S, tipo, mesK, anioK){
  S = S || {};
  const gastosVar  = S.gastosVar || [];
  const pagosFijos = S.pagosGastosFijos || [];
  const movs       = S.movimientos || [];

  const esGastoNoReal    = typeof _esGastoVarNoReal === 'function' ? _esGastoVarNoReal : (()=>false);
  const esEntradaNoReal  = typeof _esEntradaEspejoNoIngreso === 'function' ? _esEntradaEspejoNoIngreso : (()=>false);

  const gastosVarPeriodo  = gastosVar.filter(g => _wrappedEnRango(g.fecha, tipo, mesK, anioK) && !esGastoNoReal(g));
  const pagosFijosPeriodo = pagosFijos.filter(p => _wrappedEnRango(p.fecha, tipo, mesK, anioK));
  const ingresosPeriodo   = movs.filter(m => m.tipo==='entrada' && _wrappedEnRango(m.fecha, tipo, mesK, anioK) && !esEntradaNoReal(m));

  const totalGastos   = gastosVarPeriodo.reduce((s,g)=>s+(g.monto||0),0) + pagosFijosPeriodo.reduce((s,p)=>s+(p.monto||0),0);
  const totalIngresos = ingresosPeriodo.reduce((s,m)=>s+(m.monto||0),0);
  const balance    = totalIngresos - totalGastos;
  const tasaAhorro = totalIngresos > 0 ? (balance/totalIngresos)*100 : null;

  // Top categoría (gastos variables reales + gastos fijos pagados, mismo
  // universo que "Top categorías" de Análisis financiero §6).
  const catMap = {};
  [...gastosVarPeriodo, ...pagosFijosPeriodo].forEach(g => {
    const cat = g.cat || 'Sin categoría';
    catMap[cat] = (catMap[cat]||0) + (g.monto||0);
  });
  let topCategoria = null;
  Object.keys(catMap).forEach(cat => {
    if(!topCategoria || catMap[cat] > topCategoria.monto) topCategoria = { cat, monto: catMap[cat] };
  });

  // Alcancía del período: depósitos del ciclo activo dentro del rango +
  // ciclos ya destapados cuyo cierre (fechaFin) cae dentro del rango.
  // Deliberadamente no reparte un ciclo entre dos períodos si empezó
  // antes — se cuenta completo en el período donde se DESTAPÓ, igual
  // criterio simple que ya usa Alcancía para "duración" de un ciclo.
  let alcanciaPeriodo = 0;
  const a = S.alcancia;
  if(a){
    (a.movimientos||[]).forEach(m => { if(_wrappedEnRango(m.fecha, tipo, mesK, anioK)) alcanciaPeriodo += (m.monto||0); });
    (a.historial||[]).forEach(h => { if(_wrappedEnRango(h.fechaFin, tipo, mesK, anioK)) alcanciaPeriodo += (h.saldoRegistrado||0); });
  }

  return { totalGastos, totalIngresos, balance, tasaAhorro, topCategoria, alcanciaPeriodo };
}

/* ─── Mejor y peor mes del año (para la vista anual) ──────────────────────
   Solo cuenta meses con al menos un ingreso o gasto real registrado — un
   mes en blanco (antes de empezar a usar la app, o un año futuro) no
   compite como "peor mes" solo por no tener datos. */
function _wrappedMejorPeorMesAnio(S, anioK){
  const anioActual = String(new Date().getFullYear());
  const mesMax = (anioK === anioActual) ? new Date().getMonth() : 11; // 0-indexado
  const meses = [];
  for(let m=0; m<=mesMax; m++){
    const mesK = anioK + '-' + String(m+1).padStart(2,'0');
    const stats = _wrappedCalcularPeriodo(S, 'mes', mesK, anioK);
    if(stats.totalIngresos > 0 || stats.totalGastos > 0){
      meses.push({ mesK, balance: stats.balance });
    }
  }
  if(!meses.length) return { mejor: null, peor: null };
  const mejor = meses.reduce((a,b)=> b.balance > a.balance ? b : a);
  const peor  = meses.reduce((a,b)=> b.balance < a.balance ? b : a);
  return { mejor, peor };
}

/* ─── Crecimiento de patrimonio en el año ─────────────────────────────────
   Mismo criterio documentado en analisis-financiero.md §5: usa
   `valorVisible` (sin alcancía, nunca revelarla vía una gráfica — mismo
   motivo que el Historial de patrimonio de Análisis) y resta el
   `montoBase` acumulado del período para no contar aperturas/ajustes de
   saldo inicial como si fueran crecimiento real. */
function _wrappedPatrimonioAnio(S, anioK){
  const hist = (S.patrimonioHistorial || [])
    .filter(p => (p.fecha||'').slice(0,4) === anioK)
    .slice()
    .sort((a,b) => (a.fecha||'').localeCompare(b.fecha||''));
  if(hist.length < 2) return null;
  const val = p => (typeof p.valorVisible === 'number') ? p.valorVisible : (p.valor||0);
  const primero = hist[0], ultimo = hist[hist.length-1];
  let montoBaseAcumulado = 0;
  hist.forEach(p => { if(p !== primero) montoBaseAcumulado += (p.montoBase||0); });
  const diff = (val(ultimo) - val(primero)) - montoBaseAcumulado;
  const pct = val(primero) !== 0 ? (diff/Math.abs(val(primero)))*100 : null;
  return { diff, pct };
}

const _MES_NOMBRE = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
function _wrappedMesKaNombre(mesK){
  const partes = (mesK||'').split('-');
  const idx = parseInt(partes[1],10) - 1;
  return (_MES_NOMBRE[idx]||'') + ' ' + (partes[0]||'');
}

/* ─── RENDER: tarjeta de una fila simple (label/valor) ────────────────────
   Pequeño helper para no repetir el mismo bloque de estilos 8 veces. */
function _wrappedFila(label, valorHtml, color){
  return `<div class="row" style="margin-bottom:8px;">
    <span style="font-size:12px;color:var(--text3);">${label}</span>
    <span style="font-size:13px;font-family:'DM Mono',monospace;${color?('color:'+color+';'):''}">${valorHtml}</span>
  </div>`;
}

/* ─── RENDER: vista "Este mes" ─────────────────────────────────────────── */
function _wrappedRenderMes(S, fmt2){
  const hoyStr = _wrappedHoy();
  const mesK = hoyStr.slice(0,7);
  const anioK = hoyStr.slice(0,4);
  const s = _wrappedCalcularPeriodo(S, 'mes', mesK, anioK);

  const balanceColor = s.balance > 0 ? 'var(--accent)' : s.balance < 0 ? 'var(--red)' : 'var(--text3)';
  const balanceMsg = s.totalIngresos === 0
    ? 'Todavía no registraste ingresos este mes.'
    : s.balance >= 0
      ? `Vas ${fmt2(s.balance)} arriba este mes 🎉`
      : `Vas ${fmt2(Math.abs(s.balance))} abajo este mes`;

  let html = `
    <div class="card" style="padding:16px;margin-bottom:12px;background:rgba(200,240,96,.05);border-color:rgba(200,240,96,.2);text-align:center;">
      <div style="font-size:22px;font-weight:700;font-family:'DM Mono',monospace;color:${balanceColor};margin-bottom:4px;">${s.totalIngresos===0?'—':(s.balance>=0?'+':'−')+fmt2(Math.abs(s.balance))}</div>
      <div style="font-size:12px;color:var(--text3);">${balanceMsg}</div>
    </div>
    <div class="card card-sm" style="margin-bottom:12px;">
      ${_wrappedFila('Ingresos reales', fmt2(s.totalIngresos), 'var(--accent)')}
      ${_wrappedFila('Gastos reales', fmt2(s.totalGastos), 'var(--red)')}
      ${_wrappedFila('Tasa de ahorro', s.tasaAhorro===null ? '—' : Math.round(s.tasaAhorro)+'%', 'var(--text2)')}
    </div>`;

  if(s.topCategoria){
    html += `<div class="card card-sm" style="margin-bottom:12px;">
      <div style="font-size:11px;color:var(--text3);margin-bottom:4px;font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:.6px;">Categoría en la que más gastaste</div>
      <div class="row"><span style="font-size:13px;color:var(--text);">${escHtml(s.topCategoria.cat)}</span><span style="font-size:13px;font-family:'DM Mono',monospace;color:var(--red);">${fmt2(s.topCategoria.monto)}</span></div>
    </div>`;
  }

  if(s.alcanciaPeriodo > 0){
    html += `<div class="card card-sm" style="margin-bottom:12px;border-color:rgba(240,184,64,.25);">
      <div class="row"><span style="font-size:13px;color:var(--text2);">🐷 Guardaste en la Alcancía</span><span style="font-size:13px;font-family:'DM Mono',monospace;color:var(--amber);">${fmt2(s.alcanciaPeriodo)}</span></div>
    </div>`;
  }

  // Racha de Alcancía — opcional, solo si el módulo Alcancía ya cargó.
  if(typeof window._alcRachaAhorro === 'function' && S.alcancia && S.alcancia.historial){
    const racha = window._alcRachaAhorro(S.alcancia.historial);
    if(racha >= 2){
      html += `<div style="font-size:12px;color:var(--amber);padding:8px 12px;background:rgba(240,184,64,.06);border-radius:var(--radius-sm);margin-bottom:12px;">🔥 Llevas ${racha} alcancías seguidas ahorrando más que la anterior.</div>`;
    }
  }

  return html;
}

/* ─── RENDER: vista "Este año" ─────────────────────────────────────────── */
function _wrappedRenderAnio(S, fmt2){
  const anioK = _wrappedHoy().slice(0,4);
  const s = _wrappedCalcularPeriodo(S, 'anio', null, anioK);
  const patrimonio = _wrappedPatrimonioAnio(S, anioK);
  const { mejor, peor } = _wrappedMejorPeorMesAnio(S, anioK);

  let html = `<div class="sec-title" style="margin-top:0;">${anioK}</div>`;

  if(patrimonio){
    const color = patrimonio.diff >= 0 ? 'var(--accent)' : 'var(--red)';
    html += `<div class="card" style="padding:16px;margin-bottom:12px;background:rgba(200,240,96,.05);border-color:rgba(200,240,96,.2);text-align:center;">
      <div style="font-size:22px;font-weight:700;font-family:'DM Mono',monospace;color:${color};margin-bottom:4px;">${patrimonio.diff>=0?'+':'−'}${fmt2(Math.abs(patrimonio.diff))}</div>
      <div style="font-size:12px;color:var(--text3);">tu patrimonio ${patrimonio.diff>=0?'creció':'bajó'} este año${patrimonio.pct!==null?' ('+(patrimonio.pct>=0?'+':'')+Math.round(patrimonio.pct)+'%)':''}</div>
    </div>`;
  } else {
    html += `<div class="feed-empty" style="margin-bottom:12px;">Todavía no hay suficiente historial de patrimonio este año para mostrar una tendencia.</div>`;
  }

  html += `<div class="card card-sm" style="margin-bottom:12px;">
    ${_wrappedFila('Ingresos reales del año', fmt2(s.totalIngresos), 'var(--accent)')}
    ${_wrappedFila('Gastos reales del año', fmt2(s.totalGastos), 'var(--red)')}
    ${_wrappedFila('Tasa de ahorro promedio', s.tasaAhorro===null ? '—' : Math.round(s.tasaAhorro)+'%', 'var(--text2)')}
  </div>`;

  if(mejor || peor){
    html += `<div class="card card-sm" style="margin-bottom:12px;">
      ${mejor ? _wrappedFila('Tu mejor mes', _wrappedMesKaNombre(mejor.mesK)+' · '+fmt2(mejor.balance), 'var(--accent)') : ''}
      ${peor && peor.mesK !== (mejor&&mejor.mesK) ? _wrappedFila('Tu mes más difícil', _wrappedMesKaNombre(peor.mesK)+' · '+fmt2(peor.balance), peor.balance<0?'var(--red)':'var(--text2)') : ''}
    </div>`;
  }

  if(s.topCategoria){
    html += `<div class="card card-sm" style="margin-bottom:12px;">
      <div style="font-size:11px;color:var(--text3);margin-bottom:4px;font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:.6px;">Categoría campeona del año</div>
      <div class="row"><span style="font-size:13px;color:var(--text);">${escHtml(s.topCategoria.cat)}</span><span style="font-size:13px;font-family:'DM Mono',monospace;color:var(--red);">${fmt2(s.topCategoria.monto)}</span></div>
    </div>`;
  }

  if(s.alcanciaPeriodo > 0){
    html += `<div class="card card-sm" style="margin-bottom:12px;border-color:rgba(240,184,64,.25);">
      <div class="row"><span style="font-size:13px;color:var(--text2);">🐷 Total guardado en la Alcancía</span><span style="font-size:13px;font-family:'DM Mono',monospace;color:var(--amber);">${fmt2(s.alcanciaPeriodo)}</span></div>
    </div>`;
  }

  return html;
}

/* ─── ENTRADA PRINCIPAL ────────────────────────────────────────────────── */
window.renderWrapped = function(){
  const S = window.S || {};
  const fmt2 = typeof fmt === 'function' ? fmt : v => '$' + Math.round(v).toLocaleString('es-CO');
  const body = document.getElementById('wrapped-body');
  if(!body) return;

  const tabMes = document.getElementById('wrapped-tab-mes');
  const tabAnio = document.getElementById('wrapped-tab-anio');
  if(tabMes && tabAnio){
    tabMes.className  = _wrappedTab === 'mes'  ? 'btn btn-primary' : 'btn btn-ghost';
    tabAnio.className = _wrappedTab === 'anio' ? 'btn btn-primary' : 'btn btn-ghost';
    tabMes.style.flex = tabAnio.style.flex = '1';
  }

  body.innerHTML = _wrappedTab === 'anio' ? _wrappedRenderAnio(S, fmt2) : _wrappedRenderMes(S, fmt2);
};

window.wrappedVerMes = function(){ _wrappedTab = 'mes'; window.renderWrapped(); };
window.wrappedVerAnio = function(){ _wrappedTab = 'anio'; window.renderWrapped(); };

/* ─── EVENTOS (data-action="wrapped:...") ─────────────────────────────── */
Events.registerAll('wrapped', {
  verMes:  window.wrappedVerMes,
  verAnio: window.wrappedVerAnio
});

/* Exportadas solo para poder testear los cálculos puros de forma aislada
   (ver test de este módulo) — no se usan desde ningún otro archivo. */
window._wrappedInternals = {
  _wrappedCalcularPeriodo,
  _wrappedMejorPeorMesAnio,
  _wrappedPatrimonioAnio,
  _wrappedMesKaNombre
};

})();
