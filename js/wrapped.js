/* ═══════════════════════════════════════════════════════════════
   js/modules/wrapped.js

   Módulo "Wrapped" — experiencia de revelación anual tipo Spotify
   Wrapped, pantalla nueva accesible desde "Más" → Tu resumen. Duodécimo
   grupo lazy (ver js/core/lazy-loader.js).

   FORMATO: presentación tipo "historias" (Instagram/Spotify Wrapped) —
   una revelación por pantalla completa, avanzando con tap, swipe o
   flechas del teclado, con una barra de progreso tipo stories arriba.
   Reemplaza la versión anterior de una sola pantalla con scroll de
   tarjetas apiladas (ver CHANGELOG.md#wrapped) — era el punto abierto
   de diseño documentado en wrapped.md §7 ("reconsiderar UX hacia una
   presentación tipo slide/story tap-through").

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
   - `showScreen` — núcleo eager (sheet-stack.js); usada solo para volver
     a "Más" al cerrar la historia. Con guard typeof: si no existe, el
     botón cerrar simplemente no navega (no rompe nada).
   - `fmt`, `escHtml`, `hoy` — núcleo eager.
   ═══════════════════════════════════════════════════════════════ */
(function(){
'use strict';

function _wrappedEnRango(fecha, tipo, mesK, anioK){
  if(!fecha) return false;
  return tipo === 'mes' ? fecha.slice(0,7) === mesK : fecha.slice(0,4) === anioK;
}

function _wrappedHoy(){
  return typeof hoy === 'function' ? hoy() : new Date().toISOString().slice(0,10);
}

function _wrappedCalcularPeriodo(S, tipo, mesK, anioK){
  S = S || {};
  const gastosVar  = S.gastosVar || [];
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

  const catMap = {};
  [...gastosVarPeriodo, ...pagosFijosPeriodo].forEach(g => {
    const cat = g.cat || 'Sin categoría';
    catMap[cat] = (catMap[cat]||0) + (g.monto||0);
  });
  let topCategoria = null;
  Object.keys(catMap).forEach(cat => {
    if(!topCategoria || catMap[cat] > topCategoria.monto) topCategoria = { cat, monto: catMap[cat] };
  });
  if(topCategoria) topCategoria.catShare = totalGastos > 0 ? topCategoria.monto / totalGastos : 0;

  let gastoMasGrande = null;
  gastosVarPeriodo.forEach(g => {
    if(!gastoMasGrande || (g.monto||0) > gastoMasGrande.monto) gastoMasGrande = { desc: g.desc || g.cat || 'Gasto', monto: g.monto||0, cat: g.cat || null };
  });

  let alcanciaPeriodo = 0;
  const a = S.alcancia;
  if(a){
    (a.movimientos||[]).forEach(m => { if(_wrappedEnRango(m.fecha, tipo, mesK, anioK)) alcanciaPeriodo += (m.monto||0); });
    (a.historial||[]).forEach(h => { if(_wrappedEnRango(h.fechaFin, tipo, mesK, anioK)) alcanciaPeriodo += (h.saldoRegistrado||0); });
  }

  return { totalGastos, totalIngresos, balance, topCategoria, gastoMasGrande, alcanciaPeriodo };
}

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
  if(!meses.length) return { mejor: null, peor: null, promedio: null };
  const mejor = meses.reduce((a,b)=> b.balance > a.balance ? b : a);
  const peor  = meses.reduce((a,b)=> b.balance < a.balance ? b : a);
  const promedio = meses.reduce((s,m)=>s+m.balance,0) / meses.length;
  return { mejor, peor, promedio };
}

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

function _wrappedCopyPatrimonio(patrimonio){
  const { diff, pct } = patrimonio;
  if(pct === null){
    return `tu patrimonio ${diff>=0?'creció':'bajó'} este año.`;
  }
  const pctTxt = Math.abs(Math.round(pct));
  if(diff >= 0){
    if(pct >= 50)  return `fue un año grande: tu patrimonio subió +${pctTxt}%.`;
    if(pct >= 15)  return `tu patrimonio creció con fuerza este año (+${pctTxt}%).`;
    return `tu patrimonio subió un poco este año (+${pctTxt}%).`;
  }
  if(pct <= -25) return `este año le exigiste bastante al bolsillo (-${pctTxt}%).`;
  return `tu patrimonio bajó un poco este año (-${pctTxt}%).`;
}

function _wrappedCopyCategoria(topCategoria){
  const share = topCategoria.catShare || 0;
  if(share >= 0.4) return `Le diste con todo a esta categoría — fue, por lejos, tu categoría del año.`;
  if(share >= 0.2) return `Fue tu categoría del año.`;
  return `Fue tu categoría más frecuente del año.`;
}

function _wrappedCopyMejorMes(mejor, promedio){
  if(promedio !== null && promedio > 0 && mejor.balance > promedio * 1.5){
    return 'muy por encima de tu ritmo normal.';
  }
  if(mejor.balance > 0) return 'tu mes con mejor resultado del año.';
  return 'el menos difícil de todos — que también cuenta.';
}

function _wrappedCopyPeorMes(peor, promedio){
  if(peor.balance >= 0) return 'y ni en tu peor mes te fue mal.';
  if(promedio !== null && promedio > 0 && peor.balance < promedio * -0.5){
    return 'se salió bastante de tu ritmo normal.';
  }
  return 'tu mes más ajustado del año.';
}

function _wrappedCopyAlcancia(alcanciaPeriodo, gastoMasGrande){
  if(gastoMasGrande && alcanciaPeriodo >= gastoMasGrande.monto){
    const descSeguro = gastoMasGrande.desc ? escHtml(gastoMasGrande.desc) : null;
    return `Eso es más de lo que gastaste en ${descSeguro ? '"'+descSeguro+'"' : 'tu gasto más grande'}, tu compra más grande del año.`;
  }
  return 'una plata que, sin la Alcancía, seguramente ni hubieras notado que tenías.';
}

function _wrappedCopyRacha(racha){
  if(racha >= 6) return `Eso ya no es suerte, es una costumbre.`;
  if(racha >= 4) return 'vas agarrando el ritmo.';
  return 'cada una ahorrando más que la anterior.';
}

function _wrappedCopyCierre(ctx){
  const { anioK, patrimonio, racha, s, gastoMasGrande } = ctx;

  if(patrimonio && patrimonio.pct !== null && patrimonio.pct >= 50){
    return `¿${anioK}? El año en que tu patrimonio casi se duplicó.`;
  }
  if(racha >= 4){
    return `${anioK} fue el año de la racha: ${racha} alcancías seguidas mejorando.`;
  }
  if(patrimonio && patrimonio.pct !== null && patrimonio.pct <= -25){
    return `${anioK} no fue el año de acumular. Fue el año de sostener — y eso también cuenta.`;
  }
  if(s.alcanciaPeriodo > 0 && gastoMasGrande && s.alcanciaPeriodo >= gastoMasGrande.monto){
    return `${anioK}: el año en que ahorraste más de lo que gastaste en tu compra más grande.`;
  }
  if(s.topCategoria && (s.topCategoria.catShare||0) >= 0.4){
    return `${anioK}, resumido en una palabra: ${escHtml(s.topCategoria.cat)}.`;
  }
  return `Eso fue ${anioK}. Nos vemos el año que viene.`;
}

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
  const dots = coords.map((c,i) => `<circle class="wrapped-dot" style="animation-delay:${(0.5 + i*0.09).toFixed(2)}s" cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3.5" fill="${color}"/>`).join('');
  const labelIni = `<text x="${coords[0].x.toFixed(1)}" y="${h-2}" font-size="9" fill="var(--text3)" text-anchor="start" font-family="'DM Mono',monospace">${_wrappedMesKaAbrev(serie[0].mesK)}</text>`;
  const labelFin = `<text x="${coords[coords.length-1].x.toFixed(1)}" y="${h-2}" font-size="9" fill="var(--text3)" text-anchor="end" font-family="'DM Mono',monospace">${_wrappedMesKaAbrev(serie[serie.length-1].mesK)}</text>`;
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" style="display:block;overflow:visible;">
    <path class="wrapped-line-path" d="${pathD}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${dots}
    ${labelIni}${labelFin}
  </svg>`;
}

function _wrappedAnimarLinea(slideEl){
  const path = slideEl ? slideEl.querySelector('.wrapped-line-path') : document.querySelector('.wrapped-line-path');
  if(!path || typeof path.getTotalLength !== 'function') return;
  let len;
  try { len = path.getTotalLength(); } catch(e){ return; }
  if(!len) return;
  path.style.strokeDasharray = String(len);
  path.style.strokeDashoffset = String(len);
  path.getBoundingClientRect();
  path.style.transition = 'stroke-dashoffset 1.1s cubic-bezier(.4,0,.2,1)';
  requestAnimationFrame(() => { path.style.strokeDashoffset = '0'; });
}

function _wrappedFmtSigned(fmt2, n){
  return (n>=0 ? '+' : '−') + fmt2(Math.abs(n));
}

function _wrappedAnimarNumeros(container, fmt2){
  if(!container || !container.querySelectorAll) return;
  const reduce = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const nodos = container.querySelectorAll('.wrapped-bignum[data-value]');
  nodos.forEach(el => {
    const target = parseFloat(el.getAttribute('data-value')) || 0;
    const signed = el.getAttribute('data-signed') === '1';
    const formatear = v => signed ? _wrappedFmtSigned(fmt2, v) : fmt2(v);
    if(reduce || typeof requestAnimationFrame !== 'function'){
      el.textContent = formatear(target);
      return;
    }
    const dur = 850;
    const start = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    function frame(now){
      const p = Math.min(1, (now-start)/dur);
      const eased = 1 - Math.pow(1-p, 3);
      el.textContent = formatear(target*eased);
      if(p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
}

function _wrappedLanzarConfeti(slideEl){
  if(typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if(!slideEl || !slideEl.querySelector) return;
  let cont = slideEl.querySelector('.wrapped-confetti');
  if(!cont){
    cont = document.createElement('div');
    cont.className = 'wrapped-confetti';
    slideEl.appendChild(cont);
  }
  cont.innerHTML = '';
  const colores = ['var(--accent)','var(--amber)','var(--blue)','var(--red)','var(--purple)'];
  for(let i=0; i<18; i++){
    const pieza = document.createElement('i');
    pieza.style.left = (Math.random()*100).toFixed(1) + '%';
    pieza.style.background = colores[i % colores.length];
    pieza.style.animationDelay = (Math.random()*0.35).toFixed(2) + 's';
    pieza.style.transform = 'rotate(' + Math.floor(Math.random()*360) + 'deg)';
    cont.appendChild(pieza);
  }
}

function _wrappedInyectarEstilos(){
  if(document.getElementById('wrapped-story-styles')) return;
  const style = document.createElement('style');
  style.id = 'wrapped-story-styles';
  style.textContent = `
#wrapped-overlay{position:fixed;inset:0;z-index:2000;background:var(--bg);display:flex;flex-direction:column;font-family:'DM Sans',sans-serif;color:var(--text);}
#wrapped-progress{display:flex;gap:5px;padding:calc(env(safe-area-inset-top,0px) + 14px) 14px 0;flex-shrink:0;}
.wrapped-seg{flex:1;height:3px;background:var(--border2);border-radius:3px;overflow:hidden;}
.wrapped-seg>i{display:block;height:100%;width:0%;background:var(--accent);border-radius:3px;}
.wrapped-seg.done>i{width:100%;}
#wrapped-topbar{display:flex;justify-content:space-between;align-items:center;padding:10px 14px 2px;flex-shrink:0;}
.wrapped-brand{font-size:11px;font-family:'DM Mono',monospace;letter-spacing:1px;text-transform:uppercase;color:var(--text3);}
#wrapped-close{width:32px;height:32px;border-radius:10px;background:var(--bg3);border:1px solid var(--border2);color:var(--text2);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:14px;line-height:1;}
#wrapped-slides{position:relative;flex:1;overflow:hidden;}
.wrapped-slide{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:20px 26px 46px;opacity:0;visibility:hidden;transform:translateY(10px);transition:opacity .35s ease,transform .4s ease;}
.wrapped-slide.active{opacity:1;visibility:visible;transform:translateY(0);z-index:1;}
.wrapped-slide-inner{max-width:340px;width:100%;text-align:center;}
.wrapped-eyebrow{font-family:'DM Mono',monospace;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:var(--text3);margin-bottom:10px;}
.wrapped-headline{font-size:21px;font-weight:700;line-height:1.3;margin:0 0 6px;color:var(--text);}
.wrapped-headline b{color:var(--accent);}
.wrapped-sub{font-size:13px;color:var(--text2);line-height:1.55;margin:6px 0 0;}
.wrapped-bignum{font-family:'DM Mono',monospace;font-weight:700;font-size:clamp(30px,10vw,42px);letter-spacing:-.5px;margin:8px 0 2px;}
.wrapped-chart-card{background:var(--bg2);border:1px solid var(--border2);border-radius:var(--radius);padding:16px 12px 10px;margin-bottom:16px;}
.wrapped-cta-row{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:22px;}
.wrapped-cta{display:inline-flex;align-items:center;gap:6px;background:var(--accent);color:#0a0a0a;border:none;border-radius:999px;font-family:'DM Sans',sans-serif;font-weight:700;font-size:14px;padding:12px 22px;cursor:pointer;}
.wrapped-cta.ghost{background:transparent;color:var(--text);border:1px solid var(--border2);}
.wrapped-confetti{position:absolute;inset:0;overflow:hidden;pointer-events:none;}
.wrapped-confetti i{position:absolute;top:-10%;width:7px;height:12px;border-radius:2px;opacity:.9;animation:wrappedConfettiFall 1.5s ease-in forwards;}
@keyframes wrappedConfettiFall{to{transform:translateY(115vh) rotate(280deg);opacity:.15;}}
@media (prefers-reduced-motion: reduce){.wrapped-slide{transition:none;}.wrapped-confetti{display:none;}}
`;
  document.head.appendChild(style);
}

function _wrappedSlideBignum(eyebrow, headline, value, color, opts){
  opts = opts || {};
  const valorSeguro = Number.isFinite(value) ? value : 0;
  return `<div class="wrapped-slide-inner">
    <div class="wrapped-eyebrow">${eyebrow}</div>
    ${headline ? `<div class="wrapped-headline">${headline}</div>` : ''}
    <div class="wrapped-bignum" data-value="${valorSeguro}"${opts.signed?' data-signed="1"':''} style="color:${color};">0</div>
    ${opts.sub ? `<div class="wrapped-sub">${opts.sub}</div>` : ''}
  </div>`;
}

function _wrappedBuildSlides(S, fmt2){
  const anioK = _wrappedHoy().slice(0,4);
  const s = _wrappedCalcularPeriodo(S, 'anio', null, anioK);
  const patrimonio = _wrappedPatrimonioAnio(S, anioK);
  const serie = _wrappedSerieMensualAnio(S, anioK);
  const { mejor, peor, promedio } = _wrappedMejorPeorMesAnio(S, anioK);
  const graficoSvg = _wrappedGraficoAnimadoSvg(serie);

  let racha = 0;
  if(typeof window !== 'undefined' && typeof window._alcRachaAhorro === 'function' && S.alcancia && S.alcancia.historial){
    racha = window._alcRachaAhorro(S.alcancia.historial);
  }

  const slides = [];

  slides.push({
    id: 'intro',
    html: `<div class="wrapped-slide-inner">
      <div class="wrapped-eyebrow">Tu resumen</div>
      <div class="wrapped-headline" style="font-size:15px;font-weight:500;color:var(--text2);">${anioK}</div>
      <div class="wrapped-bignum" style="color:var(--accent);">${anioK}</div>
      <div class="wrapped-sub">Un repaso rápido a tu año — nada que ya no supieras, solo para verlo junto.</div>
    </div>`
  });

  if(graficoSvg){
    let bignum = '', sub = '';
    if(patrimonio && Number.isFinite(patrimonio.diff)){
      const color = patrimonio.diff >= 0 ? 'var(--accent)' : 'var(--red)';
      bignum = `<div class="wrapped-bignum" data-value="${patrimonio.diff}" data-signed="1" style="color:${color};">0</div>`;
      sub = `<div class="wrapped-sub">${_wrappedCopyPatrimonio(patrimonio)}</div>`;
    }
    slides.push({
      id: 'patrimonio',
      html: `<div class="wrapped-slide-inner">
        <div class="wrapped-eyebrow">Tu patrimonio en ${anioK}</div>
        <div class="wrapped-chart-card">${graficoSvg}</div>
        ${bignum}${sub}
      </div>`
    });
  }

  if(s.topCategoria){
    slides.push({ id:'categoria', html: _wrappedSlideBignum('Tu categoría del año', escHtml(s.topCategoria.cat), s.topCategoria.monto, 'var(--purple)', {
      sub: _wrappedCopyCategoria(s.topCategoria)
    }) });
  }

  if(mejor){
    slides.push({ id:'mejor', html: _wrappedSlideBignum('Tu mejor mes', _wrappedMesKaNombre(mejor.mesK), mejor.balance, 'var(--accent)', {
      sub: _wrappedCopyMejorMes(mejor, promedio)
    }) });
  }
  if(peor && (!mejor || peor.mesK !== mejor.mesK)){
    slides.push({ id:'peor', html: _wrappedSlideBignum('Tu mes más difícil', _wrappedMesKaNombre(peor.mesK), peor.balance, 'var(--red)', {
      sub: _wrappedCopyPeorMes(peor, promedio)
    }) });
  }

  if(s.gastoMasGrande){
    slides.push({ id:'gasto', html: _wrappedSlideBignum('Tu gasto más grande', escHtml(s.gastoMasGrande.desc), s.gastoMasGrande.monto, 'var(--blue)') });
  }

  if(s.alcanciaPeriodo > 0){
    slides.push({ id:'alcancia', html: _wrappedSlideBignum('Guardaste en la Alcancía', '', s.alcanciaPeriodo, 'var(--amber)', {
      sub: _wrappedCopyAlcancia(s.alcanciaPeriodo, s.gastoMasGrande)
    }) });
  }

  if(racha >= 2){
    slides.push({
      id: 'racha',
      html: `<div class="wrapped-slide-inner">
        <div class="wrapped-eyebrow">Racha de ahorro</div>
        <div class="wrapped-bignum" style="color:var(--amber);">${racha}</div>
        <div class="wrapped-sub">alcancías seguidas — ${_wrappedCopyRacha(racha)}</div>
      </div>`
    });
  }

  const huboAlgo = slides.length > 1;

  if(!huboAlgo){
    return [{
      id: 'vacio',
      html: `<div class="wrapped-slide-inner">
        <div class="wrapped-eyebrow">Tu resumen</div>
        <div class="wrapped-headline">Todavía no hay mucho que contar</div>
        <div class="wrapped-sub">Todavía no hay suficiente historial este año para contarte algo. Volvé más adelante.</div>
      </div>`
    }];
  }

  const lineaCierre = _wrappedCopyCierre({ anioK, patrimonio, racha, s, gastoMasGrande: s.gastoMasGrande });

  slides.push({
    id: 'cierre',
    confetti: true,
    html: `<div class="wrapped-slide-inner">
      <div class="wrapped-eyebrow">Eso fue ${anioK}</div>
      <div class="wrapped-headline">${lineaCierre}</div>
      <div class="wrapped-cta-row">
        <button type="button" class="wrapped-cta" data-wrapped-action="replay">Ver de nuevo</button>
        <button type="button" class="wrapped-cta ghost" data-wrapped-action="cerrar">Cerrar</button>
      </div>
    </div>`
  });

  return slides;
}

let _wrappedNav = null;

function _wrappedLimpiarNav(){
  if(_wrappedNav && _wrappedNav.onKeydown){
    document.removeEventListener('keydown', _wrappedNav.onKeydown);
  }
  _wrappedNav = null;
}

function _wrappedGoTo(i){
  if(!_wrappedNav) return;
  const { slidesEls, segEls, fmt2 } = _wrappedNav;
  if(i < 0 || i >= slidesEls.length) return;
  const anterior = slidesEls[_wrappedNav.current];
  if(anterior) anterior.classList.remove('active');
  _wrappedNav.current = i;
  const el = slidesEls[i];
  el.classList.add('active');
  segEls.forEach((seg, idx) => {
    seg.classList.toggle('done', idx < i);
    const barra = seg.querySelector('i');
    if(barra) barra.style.width = (idx <= i) ? '100%' : '0%';
  });
  _wrappedAnimarNumeros(el, fmt2);
  if(el.querySelector('.wrapped-line-path')){
    requestAnimationFrame(() => requestAnimationFrame(() => _wrappedAnimarLinea(el)));
  }
  if(el.getAttribute('data-confetti') === '1'){
    _wrappedLanzarConfeti(el);
  }
}

function _wrappedCerrar(){
  _wrappedLimpiarNav();
  // 'mas' NUNCA fue una pantalla real: el menú "Más" es un overlay
  // (#mas-menu/#mas-menu-overlay en index.html), no existe #screen-mas.
  // showScreen('mas') buscaba document.getElementById('screen-mas'),
  // que da null, y explotaba en sheet-stack.js con "Cannot read
  // properties of null (reading 'classList')". Como showScreen está
  // envuelta por hookGlobal (hook-global.js), ese error quedaba
  // atrapado en el try/catch y solo se logueaba — Wrapped "se cerraba"
  // a medias sin avisar visiblemente. Se vuelve a 'inicio' (Home), que
  // sí existe y es la pantalla por defecto de la app.
  if(typeof showScreen === 'function') showScreen('inicio');
}

function _wrappedVisible(el){
  if(!el || !el.isConnected) return false;
  if(typeof window === 'undefined' || !window.getComputedStyle) return true;
  let nodo = el;
  while(nodo){
    if(window.getComputedStyle(nodo).display === 'none') return false;
    nodo = nodo.parentElement;
  }
  return true;
}

function _wrappedSetupNav(overlay, fmt2){
  _wrappedLimpiarNav();

  const slidesEls = Array.prototype.slice.call(overlay.querySelectorAll('.wrapped-slide'));
  const segEls    = Array.prototype.slice.call(overlay.querySelectorAll('.wrapped-seg'));
  const contSlides = overlay.querySelector('#wrapped-slides');
  const closeBtn   = overlay.querySelector('#wrapped-close');

  _wrappedNav = { slidesEls, segEls, fmt2, current: 0, onKeydown: null };

  function siguiente(){ _wrappedGoTo(_wrappedNav.current + 1); }
  function anterior(){ _wrappedGoTo(_wrappedNav.current - 1); }

  contSlides.addEventListener('click', function(e){
    const interactivo = e.target.closest && e.target.closest('button, a, input, select, textarea');
    if(interactivo){
      const accion = interactivo.getAttribute('data-wrapped-action');
      if(accion === 'replay') _wrappedGoTo(0);
      else if(accion === 'cerrar') _wrappedCerrar();
      return;
    }
    const rect = contSlides.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if(x < rect.width * 0.34) anterior();
    else siguiente();
  });

  let touchX = null, touchY = null;
  contSlides.addEventListener('touchstart', function(e){
    touchX = e.touches[0].clientX;
    touchY = e.touches[0].clientY;
  }, { passive: true });
  contSlides.addEventListener('touchend', function(e){
    if(touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    const dy = e.changedTouches[0].clientY - touchY;
    if(Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy)){
      dx < 0 ? siguiente() : anterior();
    }
    touchX = null; touchY = null;
  }, { passive: true });

  if(closeBtn) closeBtn.addEventListener('click', _wrappedCerrar);

  const onKeydown = function(e){
    if(!_wrappedVisible(overlay)) return;
    const activo = document.activeElement;
    if(activo && /^(INPUT|TEXTAREA|SELECT)$/.test(activo.tagName)) return;
    if(e.key === 'ArrowRight') siguiente();
    else if(e.key === 'ArrowLeft') anterior();
  };
  document.addEventListener('keydown', onKeydown);
  _wrappedNav.onKeydown = onKeydown;
}

window.renderWrapped = function(){
  const S = window.S || {};
  const fmt2 = typeof fmt === 'function' ? fmt : v => '$' + Math.round(v).toLocaleString('es-CO');
  const body = document.getElementById('wrapped-body');
  if(!body) return;

  _wrappedInyectarEstilos();

  const slides = _wrappedBuildSlides(S, fmt2);

  const progresoHtml = slides.map(() => `<div class="wrapped-seg"><i></i></div>`).join('');
  const slidesHtml = slides.map(sl => `<div class="wrapped-slide"${sl.confetti ? ' data-confetti="1"' : ''}>${sl.html}</div>`).join('');

  body.innerHTML = `<div id="wrapped-overlay">
    <div id="wrapped-progress">${progresoHtml}</div>
    <div id="wrapped-topbar">
      <span class="wrapped-brand">Tu resumen</span>
      <button type="button" id="wrapped-close" aria-label="Cerrar">✕</button>
    </div>
    <div id="wrapped-slides">${slidesHtml}</div>
  </div>`;

  const overlay = body.querySelector('#wrapped-overlay');
  _wrappedSetupNav(overlay, fmt2);
  _wrappedGoTo(0);
};

window._wrappedInternals = {
  _wrappedCalcularPeriodo,
  _wrappedMejorPeorMesAnio,
  _wrappedPatrimonioAnio,
  _wrappedSerieMensualAnio,
  _wrappedGraficoAnimadoSvg,
  _wrappedMesKaNombre,
  _wrappedBuildSlides,
  _wrappedFmtSigned,
  _wrappedCopyPatrimonio,
  _wrappedCopyCategoria,
  _wrappedCopyMejorMes,
  _wrappedCopyPeorMes,
  _wrappedCopyAlcancia,
  _wrappedCopyRacha,
  _wrappedCopyCierre
};

})();
