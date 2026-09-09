/* ═══════════════════════════════════════════════════════════════
   js/modules/wrapped.js

   Módulo "Wrapped" — experiencia de revelación anual tipo Spotify
   Wrapped, pantalla nueva accesible desde "Más" → Tu resumen. Duodécimo
   grupo lazy (ver js/core/lazy-loader.js).

   IMPORTANTE — esto NO es un dashboard de control (para eso ya existe
   Análisis financiero, que se puede consultar en cualquier momento).
   Wrapped es a propósito lo opuesto: una revelación con sorpresa y
   animación. Por eso: (1) NUNCA muestra ingresos/gastos/tasa de ahorro
   en crudo — solo "datos curiosos" (categoría del año, mejor/peor mes,
   gasto más grande, Alcancía, la curva de patrimonio animándose), y
   (2) es a propósito **solo anual, no mensual** — la especialidad de un
   wrapped depende de que no se vea seguido; una versión mensual
   competiría de lleno con "Top categorías" de Análisis financiero, que
   ya cubre ese chequeo periódico. Ver wrapped.md §7.

   No es un módulo de datos: no guarda absolutamente nada nuevo en S.
   Todo se calcula en vivo cada vez que se abre la pantalla — mismo
   principio que el resto de la app ("los movimientos son la fuente de
   verdad, nunca un valor cacheado que pueda desincronizarse").

   A propósito NO cubre Mesada, Spotify, Encargos ni Plata Comprometida:
   son plata de terceros o compartida, no el desempeño financiero propio
   del usuario — ver wrapped.md §7.

   Depende de (todas con guard typeof, ninguna es obligatoria):
   - `_esGastoVarNoReal` / `_esEntradaEspejoNoIngreso` — helpers de
     Análisis financiero (núcleo eager, ver analisis-financiero.md §9bis).
   - `window._alcRachaAhorro` — expuesta por alcancia.js (grupo lazy
     aparte); si Alcancía no cargó todavía, esa cifra puntual no se
     muestra.
   - `fmt`, `escHtml`, `hoy` — núcleo eager.
   ═══════════════════════════════════════════════════════════════ */
(function(){
'use strict';

/* ─── HELPERS DE RANGO DE FECHA ────────────────────────────────────────────
   Todas las fechas en S son strings "YYYY-MM-DD" — comparación por slice,
   sin depender de ningún formato de "mesK" propio de otra pantalla. */
function _wrappedEnRango(fecha, tipo, mesK, anioK){
  if(!fecha) return false;
  return tipo === 'mes' ? fecha.slice(0,7) === mesK : fecha.slice(0,4) === anioK;
}

function _wrappedHoy(){
  return typeof hoy === 'function' ? hoy() : new Date().toISOString().slice(0,10);
}

/* ─── CÁLCULO PURO de un período (mes o año) ──────────────────────────────
   Sigue calculando ingresos/gastos/balance internamente (hace falta para
   rankear "mejor/peor mes"), pero el render NUNCA pinta esos números
   crudos — solo los usa como insumo de datos curiosos (top categoría,
   gasto más grande, ranking de meses). Reutiliza los mismos criterios de
   "gasto/ingreso real" que Análisis financiero (analisis-financiero.md
   §9bis). */
function _wrappedCalcularPeriodo(S, tipo, mesK, anioK){
  S = S || {};
  const gastosVar  = S.gastosVar || [];
  // S.pagosGastosFijos puede llegar como array O como objeto/mapa (visto
  // en datos reales de producción) — normalizamos para no romper la
  // pantalla si algún día no es un array plano.
  const pagosFijosRaw = S.pagosGastosFijos;
  const pagosFijos = Array.isArray(pagosFijosRaw) ? pagosFijosRaw : Object.values(pagosFijosRaw || {});
  const movs       = S.movimientos || [];

  const esGastoNoReal    = typeof _esGastoVarNoReal === 'function' ? _esGastoVarNoReal : (()=>false);
  const esEntradaNoReal  = typeof _esEntradaEspejoNoIngreso === 'function' ? _esEntradaEspejoNoIngreso : (()=>false);

  const gastosVarPeriodo  = gastosVar.filter(g => _wrappedEnRango(g.fecha, tipo, mesK, anioK) && !esGastoNoReal(g));
  const pagosFijosPeriodo = pagosFijos.filter(p => _wrappedEnRango(p.fecha, tipo, mesK, anioK));
  const ingresosPeriodo   = movs.filter(m => m.tipo==='entrada' && _wrappedEnRango(m.fecha, tipo, mesK, anioK) && !esEntradaNoReal(m));

  const totalGastos   = gastosVarPeriodo.reduce((s,g)=>s+(g.monto||0),0) + pagosFijosPeriodo.reduce((s,p)=>s+(p.monto||0),0);
  const totalIngresos = ingresosPeriodo.reduce((s,m)=>s+(m.monto||0),0);
  const balance = totalIngresos - totalGastos;

  // Top categoría (gastos variables reales + gastos fijos pagados).
  const catMap = {};
  [...gastosVarPeriodo, ...pagosFijosPeriodo].forEach(g => {
    const cat = g.cat || 'Sin categoría';
    catMap[cat] = (catMap[cat]||0) + (g.monto||0);
  });
  let topCategoria = null;
  Object.keys(catMap).forEach(cat => {
    if(!topCategoria || catMap[cat] > topCategoria.monto) topCategoria = { cat, monto: catMap[cat] };
  });

  // Gasto más grande del período — "dato curioso" tipo Wrapped, nunca
  // mostrado así de puntual en Análisis financiero.
  let gastoMasGrande = null;
  gastosVarPeriodo.forEach(g => {
    if(!gastoMasGrande || (g.monto||0) > gastoMasGrande.monto) gastoMasGrande = { desc: g.desc || g.cat || 'Gasto', monto: g.monto||0 };
  });

  // Alcancía del período: depósitos del ciclo activo dentro del rango +
  // ciclos ya destapados cuyo cierre (fechaFin) cae dentro del rango.
  let alcanciaPeriodo = 0;
  const a = S.alcancia;
  if(a){
    (a.movimientos||[]).forEach(m => { if(_wrappedEnRango(m.fecha, tipo, mesK, anioK)) alcanciaPeriodo += (m.monto||0); });
    (a.historial||[]).forEach(h => { if(_wrappedEnRango(h.fechaFin, tipo, mesK, anioK)) alcanciaPeriodo += (h.saldoRegistrado||0); });
  }

  return { totalGastos, totalIngresos, balance, topCategoria, gastoMasGrande, alcanciaPeriodo };
}

/* ─── Mejor y peor mes del año ─────────────────────────────────────────── */
function _wrappedMejorPeorMesAnio(S, anioK){
  const anioActual = String(new Date().getFullYear());
  const mesMax = (anioK === anioActual) ? new Date().getMonth() : 11;
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

/* ─── Resumen de crecimiento de patrimonio en el año (número final) ──────
   Mismo criterio que analisis-financiero.md §5: `valorVisible` (sin
   alcancía) y se resta el `montoBase` acumulado para no contar
   aperturas/ajustes como crecimiento real. */
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

/* ─── Serie mensual de patrimonio (Enero → mes actual) para el gráfico
   animado ─────────────────────────────────────────────────────────────
   Un punto por mes: el último `valorVisible` conocido de ese mes
   (forward-fill desde el mes anterior si ese mes no tuvo snapshot propio).
   Los meses sin ningún dato todavía (ni propio ni heredado) se recortan
   del principio de la serie — no se puede graficar antes del primer dato
   real. */
function _wrappedSerieMensualAnio(S, anioK){
  const anioActual = String(new Date().getFullYear());
  const mesMax = (anioK === anioActual) ? new Date().getMonth() : 11;
  const hist = (S.patrimonioHistorial || [])
    .filter(p => p.fecha)
    .slice()
    .sort((a,b) => a.fecha.localeCompare(b.fecha));
  const val = p => (typeof p.valorVisible === 'number') ? p.valorVisible : (p.valor||0);

  let ultimoConocido = null;
  hist.forEach(p => { if(p.fecha.slice(0,4) < anioK) ultimoConocido = val(p); });

  const serie = [];
  for(let m=0; m<=mesMax; m++){
    const mesK = anioK + '-' + String(m+1).padStart(2,'0');
    const puntosDelMes = hist.filter(p => p.fecha.slice(0,7) === mesK);
    if(puntosDelMes.length) ultimoConocido = val(puntosDelMes[puntosDelMes.length-1]);
    serie.push({ mesK, valor: ultimoConocido });
  }
  const primerIdxConDato = serie.findIndex(p => p.valor !== null);
  return primerIdxConDato === -1 ? [] : serie.slice(primerIdxConDato);
}

const _MES_NOMBRE = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
function _wrappedMesKaNombre(mesK){
  const partes = (mesK||'').split('-');
  const idx = parseInt(partes[1],10) - 1;
  return (_MES_NOMBRE[idx]||'') + ' ' + (partes[0]||'');
}
function _wrappedMesKaAbrev(mesK){
  const partes = (mesK||'').split('-');
  return _MES_NOMBRE[parseInt(partes[1],10)-1] || '';
}

/* ─── RENDER: gráfico de línea animado (SVG) ──────────────────────────────
   Puntos conectados por líneas, uno por mes, coloreado según si el
   patrimonio terminó arriba o abajo de donde empezó. El *dibujo* de la
   línea se anima con stroke-dasharray/-dashoffset (ver
   `_wrappedAnimarLinea`, se dispara después de insertar el HTML) — no es
   una gráfica estática como la de Análisis financiero, es una
   revelación. Devuelve '' si hay menos de 2 meses con dato. */
function _wrappedGraficoAnimadoSvg(serie){
  if(!serie || serie.length < 2) return '';
  const w = 300, h = 150, padX = 14, padY = 20;
  const valores = serie.map(p => p.valor);
  const min = Math.min(...valores), max = Math.max(...valores);
  const rango = (max - min) || 1;
  const stepX = (w - padX*2) / (serie.length - 1);
  const coords = serie.map((p,i) => ({
    x: padX + i*stepX,
    y: padY + (1 - (p.valor - min)/rango) * (h - padY*2)
  }));
  const subeOBaja = serie[serie.length-1].valor >= serie[0].valor;
  const color = subeOBaja ? 'var(--accent)' : 'var(--red)';
  const pathD = coords.map((c,i) => (i===0?'M':'L') + c.x.toFixed(1) + ',' + c.y.toFixed(1)).join(' ');
  const dots = coords.map((c,i) => `<circle class="wrapped-dot" style="animation-delay:${(1.1 + i*0.09).toFixed(2)}s" cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3.5" fill="${color}"/>`).join('');
  const labelIni = `<text x="${coords[0].x.toFixed(1)}" y="${h-2}" font-size="9" fill="var(--text3)" text-anchor="start" font-family="'DM Mono',monospace">${_wrappedMesKaAbrev(serie[0].mesK)}</text>`;
  const labelFin = `<text x="${coords[coords.length-1].x.toFixed(1)}" y="${h-2}" font-size="9" fill="var(--text3)" text-anchor="end" font-family="'DM Mono',monospace">${_wrappedMesKaAbrev(serie[serie.length-1].mesK)}</text>`;
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" style="display:block;overflow:visible;">
    <path id="wrappedLinePath" d="${pathD}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${dots}
    ${labelIni}${labelFin}
  </svg>`;
}

/* Dispara la animación de "dibujado" de la línea (stroke-dasharray →
   stroke-dashoffset → 0). Si el navegador no soporta getTotalLength() en
   SVG (no debería pasar en un webview moderno, pero por si acaso — y
   jsdom tampoco lo soporta en tests), degrada mostrando la línea ya
   completa sin animar en vez de romper. */
function _wrappedAnimarLinea(){
  const path = document.getElementById('wrappedLinePath');
  if(!path || typeof path.getTotalLength !== 'function') return;
  let len;
  try { len = path.getTotalLength(); } catch(e){ return; }
  if(!len) return;
  path.style.strokeDasharray = String(len);
  path.style.strokeDashoffset = String(len);
  // Forzar reflow antes de animar, si no el navegador puede saltarse
  // directo al estado final sin transición visible.
  path.getBoundingClientRect();
  path.style.transition = 'stroke-dashoffset 1.1s cubic-bezier(.4,0,.2,1)';
  requestAnimationFrame(() => { path.style.strokeDashoffset = '0'; });
}

/* ─── RENDER: tarjeta de "dato curioso" (reveal), no de dashboard ─────────
   Estilo consistente para cada revelación — nunca una fila plana de
   ingresos/gastos, siempre enmarcado como hallazgo. `delay` escalona la
   aparición (fade-up) de cada tarjeta para que se sientan una revelación
   en cadena, no toda la info de una sola vez. */
function _wrappedTarjeta(emoji, titulo, valorHtml, delay, borderColor){
  return `<div class="card card-sm wrapped-reveal" style="margin-bottom:12px;animation-delay:${delay}s;${borderColor?('border-color:'+borderColor+';'):''}">
    <div style="font-size:11px;color:var(--text3);margin-bottom:6px;">${emoji} ${titulo}</div>
    <div style="font-size:15px;color:var(--text);">${valorHtml}</div>
  </div>`;
}

/* ─── RENDER: vista anual (única vista) ───────────────────────────────── */
function _wrappedRenderAnio(S, fmt2){
  const anioK = _wrappedHoy().slice(0,4);
  const s = _wrappedCalcularPeriodo(S, 'anio', null, anioK);
  const patrimonio = _wrappedPatrimonioAnio(S, anioK);
  const serie = _wrappedSerieMensualAnio(S, anioK);
  const { mejor, peor } = _wrappedMejorPeorMesAnio(S, anioK);
  const graficoSvg = _wrappedGraficoAnimadoSvg(serie);

  let html = `<div class="sec-title" style="margin-top:0;text-align:center;">${anioK}</div>`;

  if(graficoSvg){
    html += `<div class="card" style="padding:14px 10px 8px;margin-bottom:6px;">${graficoSvg}</div>`;
    if(patrimonio){
      const color = patrimonio.diff >= 0 ? 'var(--accent)' : 'var(--red)';
      // La revelación del número final se retrasa hasta que la línea
      // termina de dibujarse (ver _wrappedAnimarLinea, ~1.1s).
      html += `<div class="wrapped-reveal" style="text-align:center;margin-bottom:16px;animation-delay:1.2s;">
        <span style="font-size:20px;font-weight:700;font-family:'DM Mono',monospace;color:${color};">${patrimonio.diff>=0?'+':'−'}${fmt2(Math.abs(patrimonio.diff))}</span>
        <div style="font-size:12px;color:var(--text3);margin-top:2px;">tu patrimonio ${patrimonio.diff>=0?'creció':'bajó'} este año${patrimonio.pct!==null?' ('+(patrimonio.pct>=0?'+':'')+Math.round(patrimonio.pct)+'%)':''}</div>
      </div>`;
    }
  } else {
    html += `<div class="feed-empty" style="margin-bottom:16px;">Todavía no hay suficiente historial de patrimonio este año para dibujar la curva.</div>`;
  }

  let delay = 1.5;

  if(s.topCategoria){
    html += _wrappedTarjeta('🏆', 'Tu categoría del año fue', `<b>${escHtml(s.topCategoria.cat)}</b> · ${fmt2(s.topCategoria.monto)}`, delay);
    delay += 0.15;
  }

  if(mejor){
    html += _wrappedTarjeta('📈', 'Tu mejor mes fue', `<b>${_wrappedMesKaNombre(mejor.mesK)}</b> · ${fmt2(mejor.balance)}`, delay);
    delay += 0.15;
  }
  if(peor && (!mejor || peor.mesK !== mejor.mesK)){
    html += _wrappedTarjeta('📉', 'Tu mes más difícil fue', `<b>${_wrappedMesKaNombre(peor.mesK)}</b> · ${fmt2(peor.balance)}`, delay);
    delay += 0.15;
  }

  if(s.gastoMasGrande){
    html += _wrappedTarjeta('💸', 'Tu gasto más grande del año', `<b>${escHtml(s.gastoMasGrande.desc)}</b> · ${fmt2(s.gastoMasGrande.monto)}`, delay);
    delay += 0.15;
  }

  if(s.alcanciaPeriodo > 0){
    html += _wrappedTarjeta('🐷', 'Total guardado en la Alcancía', fmt2(s.alcanciaPeriodo), delay, 'rgba(240,184,64,.25)');
    delay += 0.15;
  }

  let racha = 0;
  if(typeof window._alcRachaAhorro === 'function' && S.alcancia && S.alcancia.historial){
    racha = window._alcRachaAhorro(S.alcancia.historial);
    if(racha >= 2){
      html += `<div class="wrapped-reveal" style="font-size:12px;color:var(--amber);padding:10px 12px;background:rgba(240,184,64,.06);border-radius:var(--radius-sm);margin-bottom:12px;animation-delay:${delay}s;">🔥 Llevas ${racha} alcancías seguidas ahorrando más que la anterior.</div>`;
      delay += 0.15;
    }
  }

  // Si no hubo ni gráfico ni un solo dato curioso (usuario nuevo, día 1),
  // no dejar la pantalla en blanco.
  const huboAlgo = !!(graficoSvg || s.topCategoria || mejor || peor || s.gastoMasGrande || s.alcanciaPeriodo > 0 || racha >= 2);
  if(!huboAlgo){
    html += `<div class="feed-empty wrapped-reveal" style="animation-delay:.15s;">Todavía no hay suficiente historial este año para contarte algo. Volvé más adelante.</div>`;
  }

  return html;
}

/* ─── ENTRADA PRINCIPAL ────────────────────────────────────────────────── */
window.renderWrapped = function(){
  const S = window.S || {};
  const fmt2 = typeof fmt === 'function' ? fmt : v => '$' + Math.round(v).toLocaleString('es-CO');
  const body = document.getElementById('wrapped-body');
  if(!body) return;

  body.innerHTML = _wrappedRenderAnio(S, fmt2);

  // La animación de la línea necesita medir el <path> ya insertado en el
  // DOM (getTotalLength), así que se dispara en el siguiente frame, no
  // durante la construcción del HTML.
  requestAnimationFrame(() => requestAnimationFrame(_wrappedAnimarLinea));
};

/* Sin Events.registerAll: ya no hay pestañas ni ninguna interacción del
   usuario en esta pantalla — es una revelación de solo lectura. */

/* Exportadas solo para poder testear los cálculos puros de forma aislada
   — no se usan desde ningún otro archivo. */
window._wrappedInternals = {
  _wrappedCalcularPeriodo,
  _wrappedMejorPeorMesAnio,
  _wrappedPatrimonioAnio,
  _wrappedSerieMensualAnio,
  _wrappedGraficoAnimadoSvg,
  _wrappedMesKaNombre
};

})();
