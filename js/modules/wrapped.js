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

   NOTA HONESTA SOBRE EL FORMATO ("revelación", "dato curioso"): la
   mayoría de los slides son, a propósito, "etiqueta + número grande +
   una línea de contexto" (ver `_wrappedSlideBignum`) — no hay
   personajes, "personalidad financiera" ni animaciones por slide más
   allá del conteo ascendente, el dibujo de la línea y el confeti final.
   Es una decisión, no una carencia: cada frase de `_wrappedCopy*` ya
   varía según los datos reales de ESTE usuario (qué tan dominante fue
   su categoría, cuánto se alejó su mejor/peor mes de su propio
   promedio) en vez de ser un texto genérico — eso es lo que hace que se
   sienta "revelado" y no solo "mostrado". Si en algún momento se quiere
   ir más lejos (más variantes de copy, algo tipo "tu perfil financiero
   del año"), es una extensión de diseño nueva a discutir — no algo que
   este comentario ya prometía y el código no cumplía.

   A propósito SÍ cubre Mesada, Spotify, Encargos, Préstamos (Me deben /
   Yo debo) y Plata Comprometida — decisión de diseño nueva (2026-09-13,
   ver wrapped.md §7ter): es plata que no es "tuya" en el sentido de
   patrimonio propio, pero sigue siendo parte de la historia financiera
   del usuario en ese año ("cuidaste la plata de 3 personas", "le
   prestaste a Juan", "recibiste tu mesada todo el año sin fallar"), y
   ese es exactamente el tipo de "dato curioso" que ya cubre este módulo
   para las categorías propias. Cada dominio nuevo tiene su propia
   función `_wrappedCalcular*` que lee directamente la estructura de
   datos de su módulo dueño (`S.encargos`, `S.deudores`/`S.misDeudas`,
   `S.mesadas`, `S.spotifyHistorial`, `S.plataCometida` — sí, ese último
   con el nombre real del campo, sin la "m" de "comprometida", ver
   plata-comprometida.md §4) — nunca se copia un cálculo que ya vive
   centralizado en el módulo dueño (`getDeudorSaldo`, `encargoSaldo`,
   etc., ver prestado.md/encargos.md); donde no existe una función
   central reusable para un total anual (caso de la ganancia de Spotify,
   que solo se calcula inline dentro de `spotify.js`), este módulo hace
   su propia suma simplificada y lo dice explícito en el comentario de
   esa función, mismo criterio que ya usaba `_wrappedCalcularPeriodo`
   para ingresos/gastos propios.

   Depende de (todas con guard typeof, ninguna es obligatoria):
   - `_esGastoVarNoReal` / `_esEntradaEspejoNoIngreso` — helpers de
     Análisis financiero (núcleo eager, ver analisis-financiero.md §9bis).
   - `window._alcRachaAhorro` — expuesta por alcancia.js (grupo lazy
     aparte); si Alcancía no cargó todavía, esa cifra puntual no se
     muestra.
   - `getPersonaNombre` — expuesta por personas.js (núcleo eager, ver
     personas.md §8); si no existe todavía, cada dominio nuevo cae al
     nombre crudo que ya guarda su propio registro (`d.nombre`,
     `enc.nombre`), escapado igual con `escHtml`.
   - `showScreen` — núcleo eager (sheet-stack.js); usada solo para volver
     a "Más" al cerrar la historia. Con guard typeof: si no existe, el
     botón cerrar simplemente no navega (no rompe nada).
   - `fmt`, `escHtml`, `hoy` — núcleo eager.
   ═══════════════════════════════════════════════════════════════ */
(function(){
'use strict';

/* ─── HELPERS DE RANGO DE FECHA ────────────────────────────────────────────
   Todas las fechas en S son strings "YYYY-MM-DD" — comparación por slice,
   sin depender de ningún formato de "mesK" propio de otra pantalla. */
function _wrappedEnRango(fecha, tipo, mesK, anioK){
  // Guard estricto de tipo, no solo de "truthy": un dato corrupto donde
  // `fecha` llegara como número, `Date`, u otro tipo no-string rompería
  // `.slice()` más abajo en vez de simplemente excluir ese registro.
  if(typeof fecha !== 'string' || !fecha) return false;
  return tipo === 'mes' ? fecha.slice(0,7) === mesK : fecha.slice(0,4) === anioK;
}

function _wrappedHoy(){
  return typeof hoy === 'function' ? hoy() : new Date().toISOString().slice(0,10);
}

/* Único punto que decide "año actual" y "mes actual (0-indexado)" para todo
   el módulo — antes `_wrappedMejorPeorMesAnio` y `_wrappedSerieMensualAnio`
   llamaban a `new Date()` directamente en vez de pasar por `_wrappedHoy()`,
   dos fuentes de "hoy" que en producción siempre coinciden (`_wrappedHoy`
   ya cae a `new Date()` si no existe `hoy()`) pero que en tests hacían que
   mockear `hoy()` no alcanzara para controlar de verdad qué mes se toma
   como "el actual". */
function _wrappedAnioYMesActual(){
  const hoyStr = _wrappedHoy();
  return { anioActual: hoyStr.slice(0,4), mesActualIdx: parseInt(hoyStr.slice(5,7),10) - 1 };
}

/* ─── VALIDACIÓN DE DATOS (solo debug, nunca se muestra al usuario) ───────
   Wrapped no es dueño de ningún dato — lee estructuras que ya arma el
   resto de la app (S.movimientos, S.gastosVar, S.patrimonioHistorial,
   S.alcancia) y que van evolucionando con el tiempo, con datos JSON reales
   que a veces llegan en una forma inesperada (ver el propio comentario de
   `_wrappedCalcularPeriodo` sobre `pagosGastosFijos` llegando como objeto
   en vez de array). Esta función no cambia ningún cálculo ni bloquea el
   render: solo junta advertencias sobre la FORMA de esos datos (¿es
   array?, ¿los montos son números?, ¿las fechas tienen pinta de
   "YYYY-MM-DD"?) para que un problema de normalización aguas arriba se
   note en consola en vez de manifestarse en silencio como un slide con un
   número raro. Los cálculos de más abajo (`_wrappedCalcularPeriodo`, etc.)
   ya degradan solos ante datos faltantes o corruptos (`||[]`,
   `Number.isFinite`, el guard de tipo en `_wrappedEnRango`) — esto no
   reemplaza esa defensividad, es una capa aparte para DIAGNOSTICAR, no
   para corregir nada. */
function _wrappedFechaLuceValida(f){
  return typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f);
}

function _wrappedValidarDatos(S){
  if(!S || typeof S !== 'object'){
    return ['S no existe o no es un objeto — Wrapped no tiene nada que leer.'];
  }
  const warnings = [];
  if(S.movimientos !== undefined && !Array.isArray(S.movimientos)){
    warnings.push('S.movimientos existe pero no es un array.');
  }
  if(S.gastosVar !== undefined && !Array.isArray(S.gastosVar)){
    warnings.push('S.gastosVar existe pero no es un array.');
  }
  if(S.patrimonioHistorial !== undefined && !Array.isArray(S.patrimonioHistorial)){
    warnings.push('S.patrimonioHistorial existe pero no es un array.');
  }
  // S.pagosGastosFijos SÍ puede llegar como array u objeto/mapa en datos
  // reales de producción (ver _wrappedCalcularPeriodo, ya normaliza esto
  // con Object.values) — no es un error de forma, así que no se advierte.
  if(S.alcancia !== undefined && S.alcancia !== null && typeof S.alcancia !== 'object'){
    warnings.push('S.alcancia existe pero no es un objeto.');
  }
  if(S.encargos !== undefined && !Array.isArray(S.encargos)){
    warnings.push('S.encargos existe pero no es un array.');
  }
  if(S.deudores !== undefined && !Array.isArray(S.deudores)){
    warnings.push('S.deudores existe pero no es un array.');
  }
  if(S.misDeudas !== undefined && !Array.isArray(S.misDeudas)){
    warnings.push('S.misDeudas existe pero no es un array.');
  }
  if(S.mesadas !== undefined && S.mesadas !== null && typeof S.mesadas !== 'object'){
    warnings.push('S.mesadas existe pero no es un objeto.');
  }
  if(S.spotifyHistorial !== undefined && !Array.isArray(S.spotifyHistorial)){
    warnings.push('S.spotifyHistorial existe pero no es un array.');
  }
  if(S.plataCometida !== undefined && !Array.isArray(S.plataCometida)){
    warnings.push('S.plataCometida existe pero no es un array.');
  }

  const revisarMontos = (arr, nombre) => {
    if(!Array.isArray(arr)) return;
    const malos = arr.filter(x => x && x.monto !== undefined && !Number.isFinite(Number(x.monto))).length;
    if(malos > 0) warnings.push(nombre + ': ' + malos + ' registro(s) con "monto" que no es un número.');
  };
  revisarMontos(S.movimientos, 'S.movimientos');
  revisarMontos(S.gastosVar, 'S.gastosVar');

  const revisarFechas = (arr, nombre) => {
    if(!Array.isArray(arr)) return;
    const malas = arr.filter(x => x && x.fecha !== undefined && !_wrappedFechaLuceValida(x.fecha)).length;
    if(malas > 0) warnings.push(nombre + ': ' + malas + ' registro(s) con "fecha" que no luce "YYYY-MM-DD".');
  };
  revisarFechas(S.movimientos, 'S.movimientos');
  revisarFechas(S.gastosVar, 'S.gastosVar');
  revisarFechas(S.patrimonioHistorial, 'S.patrimonioHistorial');

  return warnings;
}

/* Imprime las advertencias en consola solo si Wrapped se abrió en modo
   debug (?debug=1 o #debug en la URL) — nunca se le muestra nada de esto
   al usuario final, ver el comentario de `_wrappedValidarDatos`. Envuelto
   en try/catch porque `URLSearchParams`/`window.location` no deberían
   fallar nunca en un navegador real, pero esta función corre en cada
   apertura de la pantalla y no vale la pena arriesgar la historia entera
   por un diagnóstico que es puramente informativo. */
function _wrappedLogDebug(S){
  let debugOn = false;
  try{
    debugOn = typeof window !== 'undefined' && !!window.location &&
      (new URLSearchParams(window.location.search).get('debug') === '1' ||
       (window.location.hash || '').indexOf('debug') !== -1);
  } catch(e){ debugOn = false; }
  if(!debugOn) return;
  const warnings = _wrappedValidarDatos(S);
  if(warnings.length && typeof console !== 'undefined' && console.warn){
    console.warn('[wrapped] advertencias de datos:', warnings);
  }
}

/* Agrupa una lista ya filtrada de gastos (variables + fijos pagados) por
   categoría y devuelve la líder por MONTO — pero también, si es distinta,
   la líder por FRECUENCIA (cantidad de movimientos). Una compra de
   $300.000 y veinte compras de $20.000 pueden "ganar" la misma categoría
   por monto sin que cuenten la misma historia — separar las dos
   dimensiones permite que el copy lo note (ver `_wrappedCopyCategoria`)
   sin inventar categorías nuevas ni depender de más de un año de
   historial (a diferencia de "categoría que más creció" o "categoría más
   inesperada", que si se hacen mal con poco historial dirían algo que no
   es realmente así — quedan fuera de esta pasada, ver wrapped.md §7).
   Función compartida entre el período completo (`_wrappedCalcularPeriodo`)
   y la comparación de mitades de año (`_wrappedCambioDeHabitos`), para no
   repetir la lógica de agrupar por categoría en dos lugares. */
function _wrappedTopCategoriaDe(items, totalGastos){
  const catMap = {}; // cat -> { monto, count }
  items.forEach(g => {
    const cat = g.cat || 'Sin categoría';
    if(!catMap[cat]) catMap[cat] = { monto: 0, count: 0 };
    catMap[cat].monto += (g.monto||0);
    catMap[cat].count += 1;
  });
  let topPorMonto = null, topPorFrecuencia = null;
  Object.keys(catMap).forEach(cat => {
    const { monto, count } = catMap[cat];
    if(!topPorMonto || monto > topPorMonto.monto) topPorMonto = { cat, monto };
    if(!topPorFrecuencia || count > topPorFrecuencia.count) topPorFrecuencia = { cat, count };
  });
  if(topPorMonto){
    // `catShare` es de uso puramente interno: sirve para elegir el tono
    // del texto ("le diste con todo a X" vs "tu categoría más frecuente
    // fue X"), nunca se pinta como número — mismo principio que ya se
    // aplicaba con `balance` para rankear el mejor/peor mes sin mostrarlo
    // en crudo.
    topPorMonto.catShare = totalGastos > 0 ? topPorMonto.monto / totalGastos : 0;
    // Si la categoría que más plata consumió NO es la misma que más se
    // repitió, guardamos la otra para que el copy pueda mencionar el
    // contraste ("gastaste más en X, pero Y fue la que más se repitió").
    topPorMonto.topPorFrecuencia = (topPorFrecuencia && topPorFrecuencia.cat !== topPorMonto.cat) ? topPorFrecuencia : null;
  }
  return topPorMonto;
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

  // Top categoría (gastos variables reales + gastos fijos pagados) —
  // devuelve tanto la líder por monto como, si difiere, la líder por
  // frecuencia (ver `_wrappedTopCategoriaDe`, comentario ahí para el
  // razonamiento de por qué importan las dos dimensiones).
  const topCategoria = _wrappedTopCategoriaDe([...gastosVarPeriodo, ...pagosFijosPeriodo], totalGastos);

  // Gasto más grande del período — "dato curioso" tipo Wrapped, nunca
  // mostrado así de puntual en Análisis financiero. Guarda también su
  // fecha y categoría (para contextualizarlo en el copy, ver
  // `_wrappedCopyGasto`) y el gasto promedio del período (uso interno,
  // solo para decidir qué tan grande fue *en relación al propio usuario*
  // — nunca en pesos fijos, que no tendría sentido entre personas con
  // gastos de escalas muy distintas).
  let gastoMasGrande = null;
  gastosVarPeriodo.forEach(g => {
    if(!gastoMasGrande || (g.monto||0) > gastoMasGrande.monto) gastoMasGrande = { desc: g.desc || g.cat || 'Gasto', monto: g.monto||0, cat: g.cat || null, fecha: g.fecha || null };
  });
  const avgGasto = gastosVarPeriodo.length ? gastosVarPeriodo.reduce((s,g)=>s+(g.monto||0),0) / gastosVarPeriodo.length : 0;

  // Alcancía del período: depósitos del ciclo activo dentro del rango +
  // ciclos ya destapados cuyo cierre (fechaFin) cae dentro del rango.
  //
  // Verificado contra alcancia.js/alcancia.md (2026-09-12): al destapar,
  // `a.saldoRegistrado` se resetea a 0 de inmediato y el ciclo cerrado
  // queda copiado en `a.historial[]` — pero `a.movimientos[]` NO se limpia
  // en ese momento. Solo se limpia cuando el usuario elige explícitamente
  // "Iniciar nueva alcancía" (`alcanciaIniciarNueva()`); mientras tanto la
  // alcancía queda en estado "fantasma" (`a._destapada === true`, ver
  // alcancia.md §2/§6) con los depósitos del ciclo ya cerrado todavía
  // presentes en `a.movimientos[]`. Sumar ambas fuentes sin excluir ese
  // solape contaría la misma plata dos veces durante esa ventana — por
  // eso `a.movimientos` solo se suma cuando hay un ciclo genuinamente
  // activo (`!a._destapada`); una vez destapado, esa plata ya vive
  // únicamente en el `historial` que se suma abajo.
  let alcanciaPeriodo = 0;
  const a = S.alcancia;
  if(a){
    if(!a._destapada){
      (a.movimientos||[]).forEach(m => { if(_wrappedEnRango(m.fecha, tipo, mesK, anioK)) alcanciaPeriodo += (m.monto||0); });
    }
    (a.historial||[]).forEach(h => { if(_wrappedEnRango(h.fechaFin, tipo, mesK, anioK)) alcanciaPeriodo += (h.saldoRegistrado||0); });
  }

  return { totalGastos, totalIngresos, balance, topCategoria, gastoMasGrande, alcanciaPeriodo, avgGasto };
}

/* ─── Mejor y peor mes del año ─────────────────────────────────────────── */
function _wrappedMejorPeorMesAnio(S, anioK){
  const { anioActual, mesActualIdx } = _wrappedAnioYMesActual();
  const mesMax = (anioK === anioActual) ? mesActualIdx : 11;
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
  // `promedio` (balance típico del año) es de uso puramente interno: sirve
  // para decidir si el mejor/peor mes fue "un poco" o "mucho" mejor/peor
  // que lo normal de ESE usuario — nunca se pinta como cifra, evita
  // depender de umbrales fijos en pesos que no tendrían sentido para
  // ingresos muy distintos entre personas.
  const promedio = meses.reduce((s,m)=>s+m.balance,0) / meses.length;
  // Empates: si más de un mes comparte exactamente el balance extremo, el
  // `reduce` de arriba se queda arbitrariamente con el primero — acá se
  // detecta el empate para que el copy pueda nombrarlo en vez de fingir
  // que hubo un único ganador (ver `_wrappedCopyMejorMes`/`_wrappedCopyPeorMes`).
  const empateMejor = meses.filter(m => m.balance === mejor.balance).length > 1;
  const empatePeor  = meses.filter(m => m.balance === peor.balance).length > 1;
  return { mejor, peor, promedio, empateMejor, empatePeor };
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
  const { anioActual, mesActualIdx } = _wrappedAnioYMesActual();
  const mesMax = (anioK === anioActual) ? mesActualIdx : 11;
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

/* ═══════════════════════════════════════════════════════════════════════
   SISTEMA DE COPY CONTEXTUAL
   ═══════════════════════════════════════════════════════════════════════
   No es un "banco de frases" grande con variantes elegidas al azar para
   evitar repetición (eso se descartó a propósito, ver wrapped.md §7: hoy
   no hay más de un año de historia real, así que "no repetirse entre
   años" todavía no es un problema real de este usuario). Es más chico y
   más simple: cada texto se elige entre 2-4 variantes fijas según una
   señal derivada de los mismos datos ya calculados arriba (qué tan
   grande fue el cambio de patrimonio en %, qué tan dominante fue la
   categoría, cuánto se alejó el mejor/peor mes del promedio del propio
   usuario). El objetivo puntual es que la historia de un año donde
   "todo estuvo parejo" se lea distinto a la de un año con un quiebre
   fuerte — no que nunca se repita la misma frase.
   Ninguna de estas funciones calcula nada nuevo: todas reciben los
   mismos objetos que ya arma `_wrappedCalcularPeriodo` /
   `_wrappedMejorPeorMesAnio` / `_wrappedPatrimonioAnio`, para no crear
   una segunda fuente de verdad sobre esas cifras (ver `mis-finanzas.md`
   → "los movimientos son la fuente de verdad" / CHANGELOG.md → filtros
   duplicados de Análisis financiero). Solo deciden *cómo contarlo*.
   ═══════════════════════════════════════════════════════════════════════ */

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
  let base;
  if(share >= 0.4) base = `Le diste con todo a esta categoría — fue, por lejos, la que más plata se llevó.`;
  else if(share >= 0.2) base = `Fue la que más plata se llevó este año.`;
  else base = `Fue la categoría donde más gastaste este año.`;
  // Si la categoría que más se REPITIÓ es otra distinta a la que más
  // plata consumió (ver `_wrappedTopCategoriaDe`), vale la pena
  // mencionarlo — "gastaste más en viajes, pero mercado fue con la que
  // más veces pagaste" cuenta una historia distinta a solo el monto.
  if(topCategoria.topPorFrecuencia){
    base += ` Aunque la que más se repitió fue ${escHtml(topCategoria.topPorFrecuencia.cat)}.`;
  }
  return base;
}

function _wrappedCopyMejorMes(mejor, promedio, empate){
  if(empate) return 'empatado con otro mes — los dos fueron tu mejor resultado del año.';
  if(promedio !== null && promedio > 0 && mejor.balance > promedio * 1.5){
    return 'muy por encima de tu ritmo normal.';
  }
  if(mejor.balance > 0) return 'tu mes con mejor resultado del año.';
  return 'el menos difícil de todos — que también cuenta.';
}

function _wrappedCopyPeorMes(peor, promedio, empate){
  if(empate) return 'empatado con otro mes — ninguno de los dos fue fácil.';
  if(peor.balance >= 0) return 'y ni en tu peor mes te fue mal.';
  if(promedio !== null && promedio > 0 && peor.balance < promedio * -0.5){
    return 'se salió bastante de tu ritmo normal.';
  }
  return 'tu mes más ajustado del año.';
}

/* Contextualiza el gasto más grande: en qué mes fue y qué tan grande fue
   *en relación al propio gasto típico del usuario* (nunca contra un
   umbral fijo en pesos, que no tendría sentido entre personas con gastos
   de escalas muy distintas). */
function _wrappedCopyGasto(gastoMasGrande, avgGasto){
  const mesTxt = gastoMasGrande.fecha ? _wrappedMesKaNombre(gastoMasGrande.fecha.slice(0,7)) : null;
  let intensidad;
  if(avgGasto > 0 && gastoMasGrande.monto >= avgGasto * 5){
    intensidad = 'muchísimo más grande que cualquiera de tus otros gastos del año.';
  } else if(avgGasto > 0 && gastoMasGrande.monto >= avgGasto * 2){
    intensidad = 'bastante más grande que tu gasto típico.';
  } else {
    intensidad = 'el que más te costó este año.';
  }
  return mesTxt ? `Pasó en ${mesTxt} — ${intensidad}` : intensidad.charAt(0).toUpperCase() + intensidad.slice(1);
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

/* Línea de cierre: se arma en base a "señales" (candidatas, con
   prioridad) derivadas de lo que ya se calculó para el resto de la
   historia — se elige la primera que aplique, nunca al azar, para que el
   cierre siempre hable de lo más notable que realmente pasó ese año. */
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

/* Copy de los dominios "de terceros" — mismo criterio que el resto del
   sistema de copy: solo eligen el tono, nunca recalculan nada. */
function _wrappedCopyEncargos(e){
  if(e.nPersonas > 1) return `Repartida entre ${e.nPersonas} personas que confiaron en vos para guardarla.`;
  if(e.topEncargo && e.topEncargo.nombre) return `La mayor parte te la encargó ${_wrappedNombrePersona(e.topEncargo.personaId, e.topEncargo.nombre)}.`;
  return 'Plata ajena que pasó por tus manos este año.';
}
function _wrappedCopyPrestado(p){
  if(p.topDeudor && p.topDeudor.nombre){
    return `A ${_wrappedNombrePersona(p.topDeudor.personaId, p.topDeudor.nombre)} fue a quien más le prestaste.`;
  }
  if(p.totalDevuelto >= p.totalPrestado && p.totalDevuelto > 0) return 'Y este año te pagaron más de lo que prestaste.';
  return 'Plata que le diste una mano a alguien más.';
}
function _wrappedCopyMisDeudas(m){
  if(m.totalPagado >= m.totalRecibido && m.totalPagado > 0) return 'Y este año pagaste más de lo que te prestaron.';
  return 'Plata que alguien más te prestó a vos.';
}
function _wrappedCopyMesada(m){
  const partes = [];
  if(m.porPadre.papa) partes.push('papá');
  if(m.porPadre.mama) partes.push('mamá');
  return partes.length === 2 ? 'Entre papá y mamá, sin faltar un mes.' : `De parte de ${partes[0]}.`;
}
function _wrappedCopySpotify(s){
  if(s.balance > 0) return 'Administrar la cuenta te dejó plata a favor este año.';
  if(s.balance < 0) return 'Este año pusiste algo de tu bolsillo para cubrir la cuenta.';
  return 'Cobraste y pagaste el plan, sin ganar ni perder.';
}
function _wrappedCopyComprometida(c){
  if(c.topItem && c.topItem.desc) return `La más grande fue "${escHtml(c.topItem.desc)}".`;
  return 'Plata que estabas esperando y por fin llegó.';
}

/* ─── RENDER: gráfico de línea animado (SVG) ──────────────────────────────
   Puntos conectados por líneas, uno por mes, coloreado según si el
   patrimonio terminó arriba o abajo de donde empezó. El *dibujo* de la
   línea se anima con stroke-dasharray/-dashoffset (ver
   `_wrappedAnimarLinea`, se dispara al entrar al slide) — no es una
   gráfica estática como la de Análisis financiero, es una revelación.
   Devuelve '' si hay menos de 2 meses con dato. */
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

/* Dispara la animación de "dibujado" de la línea (stroke-dasharray →
   stroke-dashoffset → 0) dentro de un slide dado. Recibe el slide activo
   en vez de buscar por id global — así el gráfico deja de depender de
   ser el único de la pantalla (ver wrapped.md §7, punto sobre por qué se
   usa clase en vez de id). Si el navegador no soporta getTotalLength()
   en SVG (no debería pasar en un webview moderno, pero por si acaso — y
   jsdom tampoco lo soporta en tests), degrada mostrando la línea ya
   completa sin animar en vez de romper. */
function _wrappedAnimarLinea(slideEl){
  const path = slideEl ? slideEl.querySelector('.wrapped-line-path') : document.querySelector('.wrapped-line-path');
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

/* ─── FORMATO DE NÚMEROS CON SIGNO ─────────────────────────────────────── */
function _wrappedFmtSigned(fmt2, n){
  return (n>=0 ? '+' : '−') + fmt2(Math.abs(n));
}

/* ─── ANIMACIÓN "CONTADOR" de los números grandes de cada slide ──────────
   Mismo efecto que el "roll" del wrapped original de Spotify: el número
   sube desde 0 hasta el valor real con easing, en vez de aparecer ya
   escrito. Respeta prefers-reduced-motion. */
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

/* ─── CONFETI (solo en el slide de cierre) ────────────────────────────────
   Piezas CSS simples (sin canvas, sin librerías) — coherente con "sin
   build tool" del proyecto. Se salta por completo con
   prefers-reduced-motion. */
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

/* ─── ESTILOS (inyectados una sola vez en <head>) ─────────────────────────
   Usa exclusivamente las variables CSS ya definidas en :root por la app
   (--bg, --bg2, --bg3, --border2, --text, --text2, --text3, --accent,
   --amber, --blue, --red, --purple, --radius, --radius-sm) y las mismas
   fuentes ('DM Sans' / 'DM Mono') — nada de paleta o tipografía nueva. */
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

/* ─── ARMADO DE CADA SLIDE ────────────────────────────────────────────── */
function _wrappedSlideBignum(eyebrow, headline, value, color, opts){
  opts = opts || {};
  // Robustez: si `value` llegara indefinido/NaN (dato corrupto, campo
  // faltante en un registro viejo) el slide igual debe poder pintarse —
  // nunca con `NaN` visible en el atributo ni en el conteo animado.
  const valorSeguro = Number.isFinite(value) ? value : 0;
  return `<div class="wrapped-slide-inner">
    <div class="wrapped-eyebrow">${eyebrow}</div>
    ${headline ? `<div class="wrapped-headline">${headline}</div>` : ''}
    <div class="wrapped-bignum" data-value="${valorSeguro}"${opts.signed?' data-signed="1"':''} style="color:${color};">0</div>
    ${opts.sub ? `<div class="wrapped-sub">${opts.sub}</div>` : ''}
  </div>`;
}

/* Compara la categoría líder (por monto) de la primera mitad del año
   contra la segunda — es la única comparación tipo "empezaste haciendo X,
   terminaste haciendo Y" que se agregó en esta pasada. Se calcula con
   seguridad a partir de un solo año de historia porque no depende de
   ningún umbral estadístico de anomalía (a diferencia de detectar "el día
   que rompió tu patrón" o una tendencia mes a mes — eso se dejó afuera a
   propósito, ver wrapped.md §7: con poco historial, ese tipo de detección
   corre mucho riesgo de señalar como "raro" algo que en realidad es
   normal para este usuario, y una falsa alarma en un resumen anual es
   peor que no tener esa historia). Reutiliza `_wrappedTopCategoriaDe`
   (misma agrupación por categoría que el período completo) para no
   duplicar esa lógica. Requiere al menos 6 meses transcurridos del año. */
function _wrappedCambioDeHabitos(S, anioK, mesMax){
  if(mesMax < 5) return null; // menos de 6 meses: no hay dos mitades que valga la pena comparar

  const gastosVar = S.gastosVar || [];
  const pagosFijosRaw = S.pagosGastosFijos;
  const pagosFijos = Array.isArray(pagosFijosRaw) ? pagosFijosRaw : Object.values(pagosFijosRaw || {});
  const esGastoNoReal = typeof _esGastoVarNoReal === 'function' ? _esGastoVarNoReal : (()=>false);

  const mitad = Math.floor((mesMax+1) / 2);
  const mesKDeCorte = anioK + '-' + String(mitad+1).padStart(2,'0'); // primer mesK de la segunda mitad

  const enPrimera = fecha => typeof fecha === 'string' && fecha.slice(0,4) === anioK && fecha.slice(0,7) < mesKDeCorte;
  const enSegunda = fecha => typeof fecha === 'string' && fecha.slice(0,4) === anioK && fecha.slice(0,7) >= mesKDeCorte;

  const itemsPrimera = [...gastosVar.filter(g => enPrimera(g.fecha) && !esGastoNoReal(g)), ...pagosFijos.filter(p => enPrimera(p.fecha))];
  const itemsSegunda = [...gastosVar.filter(g => enSegunda(g.fecha) && !esGastoNoReal(g)), ...pagosFijos.filter(p => enSegunda(p.fecha))];

  const totalPrimera = itemsPrimera.reduce((s,g)=>s+(g.monto||0),0);
  const totalSegunda = itemsSegunda.reduce((s,g)=>s+(g.monto||0),0);

  const topPrimera = _wrappedTopCategoriaDe(itemsPrimera, totalPrimera);
  const topSegunda = _wrappedTopCategoriaDe(itemsSegunda, totalSegunda);

  if(!topPrimera || !topSegunda || topPrimera.cat === topSegunda.cat) return null;
  // Solo cuenta como "cambio de hábitos" si la categoría fue realmente
  // dominante en cada mitad — si ambas mitades estaban parejas entre
  // varias categorías sin que ninguna destaque, no es un cambio real, es
  // ruido, y mostrarlo como si fuera una historia sería engañoso.
  if((topPrimera.catShare||0) < 0.15 || (topSegunda.catShare||0) < 0.15) return null;

  return { catPrimera: topPrimera.cat, catSegunda: topSegunda.cat };
}

/* ═══════════════════════════════════════════════════════════════════════
   DOMINIOS "DE TERCEROS" (Encargos, Prestado, Mesada, Spotify, Plata
   Comprometida) — decisión de diseño 2026-09-13, ver el comentario de
   cabecera del archivo y wrapped.md §7ter. Cada función de acá abajo lee
   directo la estructura real de su módulo dueño y nunca guarda nada
   nuevo — mismo principio que el resto del archivo. Todas devuelven
   `null` (o un objeto con totales en 0) si el módulo no tiene datos ese
   año, para que `_wrappedBuildSlides` pueda saltarse el slide entero sin
   casos especiales.
   ═══════════════════════════════════════════════════════════════════════ */

/* Nombre de una persona: preferimos el sistema unificado de Personas
   (`getPersonaNombre`, ver personas.md §2 — "el nombre mostrado siempre
   se resuelve preferentemente desde la persona vinculada") y caemos al
   nombre crudo que cada módulo ya guarda si Personas no cargó o el
   registro no tiene `personaId` ("sin perfil", ver personas.md §2/§6).
   Escapa siempre — un nombre de persona es dato del usuario. */
function _wrappedNombrePersona(personaId, nombreCrudo){
  let nombre = nombreCrudo || 'Alguien';
  if(personaId && typeof getPersonaNombre === 'function'){
    const resuelto = getPersonaNombre(personaId);
    if(resuelto) nombre = resuelto;
  }
  return escHtml(nombre);
}

/* ─── ENCARGOS ─────────────────────────────────────────────────────────
   "Cuánta plata ajena te encargaron cuidar este año" — suma de
   movimientos tipo 'entrada' (ver encargos.md §4: es lo único que
   determina el signo) con fecha en el período, sobre todos los
   encargos, sin importar si siguen activos hoy. No usamos `encargoSaldo`
   (saldo ACTUAL de un encargo) porque acá la pregunta es "cuánto entró
   este año", no "cuánto queda hoy" — son cálculos distintos a propósito. */
function _wrappedCalcularEncargos(S, tipo, mesK, anioK){
  const encargos = S.encargos || [];
  if(!Array.isArray(encargos) || !encargos.length) return null;

  let totalEncargado = 0;
  let topEncargo = null; // el que más recibió este período
  const personasSet = new Set();

  encargos.forEach(enc => {
    const movs = Array.isArray(enc.movimientos) ? enc.movimientos : [];
    let totalEsteEncargo = 0;
    movs.forEach(m => {
      if(m && m.tipo === 'entrada' && _wrappedEnRango(m.fecha, tipo, mesK, anioK)){
        totalEsteEncargo += (m.monto||0);
      }
    });
    if(totalEsteEncargo > 0){
      totalEncargado += totalEsteEncargo;
      personasSet.add(enc.personaId || enc.nombre || enc.id);
      if(!topEncargo || totalEsteEncargo > topEncargo.monto){
        topEncargo = { nombre: enc.nombre, personaId: enc.personaId || null, monto: totalEsteEncargo };
      }
    }
  });

  if(totalEncargado <= 0) return null;
  return { totalEncargado, nPersonas: personasSet.size, topEncargo };
}

/* ─── PRESTADO — Me deben (S.deudores) ────────────────────────────────
   Cuánto prestaste este período (movimientos 'prestamo', dinero que
   sale de una cuenta tuya, ver prestado.md §2.2) y cuánto te devolvieron
   ('abono'/'pago-completo'). El deudor "del año" se elige por cuánto le
   prestaste en el período — no por su deuda pendiente total, que puede
   venir de años anteriores y no sería un dato de "este año". */
function _wrappedCalcularPrestado(S, tipo, mesK, anioK){
  const deudores = S.deudores || [];
  if(!Array.isArray(deudores) || !deudores.length) return null;

  let totalPrestado = 0, totalDevuelto = 0;
  let topDeudor = null;

  deudores.forEach(d => {
    const movs = Array.isArray(d.movimientos) ? d.movimientos : [];
    let prestadoAEsta = 0;
    movs.forEach(m => {
      if(!m || !_wrappedEnRango(m.fecha, tipo, mesK, anioK)) return;
      if(m.tipo === 'prestamo'){ totalPrestado += (m.monto||0); prestadoAEsta += (m.monto||0); }
      else if(m.tipo === 'abono' || m.tipo === 'pago-completo'){ totalDevuelto += (m.monto||0); }
    });
    if(prestadoAEsta > 0 && (!topDeudor || prestadoAEsta > topDeudor.monto)){
      topDeudor = { nombre: d.nombre, personaId: d.personaId || null, monto: prestadoAEsta };
    }
  });

  if(totalPrestado <= 0 && totalDevuelto <= 0) return null;
  return { totalPrestado, totalDevuelto, topDeudor };
}

/* ─── PRESTADO — Yo debo (S.misDeudas) ────────────────────────────────
   Espejo del anterior: cuánto te prestaron a vos este período
   ('recibido') y cuánto pagaste de vuelta ('pago') — ver prestado.md
   §3.2. */
function _wrappedCalcularMisDeudas(S, tipo, mesK, anioK){
  const misDeudas = S.misDeudas || [];
  if(!Array.isArray(misDeudas) || !misDeudas.length) return null;

  let totalRecibido = 0, totalPagado = 0;

  misDeudas.forEach(d => {
    const movs = Array.isArray(d.movimientos) ? d.movimientos : [];
    movs.forEach(m => {
      if(!m || !_wrappedEnRango(m.fecha, tipo, mesK, anioK)) return;
      if(m.tipo === 'recibido') totalRecibido += (m.monto||0);
      else if(m.tipo === 'pago') totalPagado += (m.monto||0);
    });
  });

  if(totalRecibido <= 0 && totalPagado <= 0) return null;
  return { totalRecibido, totalPagado };
}

/* ─── MESADA ───────────────────────────────────────────────────────────
   Total recibido de papá + mamá este año. Simplificación reconocida: el
   campo `monto` de cada pago es el TOTAL recibido a la fecha para ese
   mes (ver mesada.md §4 — incluye abonos posteriores del pendiente), y
   se filtra por la `fecha` de ese registro (la del último abono si lo
   hubo). Un mes cuya deuda se saldó ya entrado el año siguiente movería
   ese monto al año del abono, no al del mes que representa — mismo tipo
   de aproximación que ya reconoce `_wrappedCalcularPeriodo` para el
   resto de la app, no una fuente de verdad nueva. No usa `getMontoPadre`
   (esa es la cuota vigente hoy, no lo históricamente recibido). */
function _wrappedCalcularMesada(S, tipo, mesK, anioK){
  const mesadas = S.mesadas;
  if(!mesadas || typeof mesadas !== 'object') return null;

  let total = 0;
  const porPadre = {};
  ['papa','mama'].forEach(parent => {
    const pagos = (mesadas[parent] && mesadas[parent].pagos) || {};
    let totalParent = 0;
    Object.values(pagos).forEach(v => {
      if(v && _wrappedEnRango(v.fecha, tipo, mesK, anioK)) totalParent += (v.monto||0);
    });
    if(totalParent > 0){ total += totalParent; porPadre[parent] = totalParent; }
  });

  if(total <= 0) return null;
  return { total, porPadre };
}

/* ─── SPOTIFY ──────────────────────────────────────────────────────────
   Cobrado − pagado del período, sobre `S.spotifyHistorial` (ver
   spotify.md §4). Simplificación reconocida y anotada a propósito: la
   "Ganancia acumulada" real del módulo (spotify.md §7) suma además
   `cuotaAdmin × ciclos pagados`, calculada inline dentro de
   `spotify.js` sin una función central reexportada para reusar acá —
   por eso este número puede no coincidir exactamente con el de la
   pantalla de Spotify. Es un "cobrado menos pagado del año" honesto, no
   la ganancia oficial del módulo. */
function _wrappedCalcularSpotify(S, tipo, mesK, anioK){
  const hist = S.spotifyHistorial;
  if(!Array.isArray(hist) || !hist.length) return null;

  let cobrado = 0, pagado = 0;
  hist.forEach(h => {
    if(!h || !_wrappedEnRango(h.fecha, tipo, mesK, anioK)) return;
    if(h.tipo === 'cobro') cobrado += (h.monto||0);
    else if(h.tipo === 'pago') pagado += (h.monto||0);
  });

  if(cobrado <= 0 && pagado <= 0) return null;
  return { cobrado, pagado, balance: cobrado - pagado };
}

/* ─── PLATA COMPROMETIDA ──────────────────────────────────────────────
   Plata que estabas esperando y de verdad llegó este período —
   `S.plataCometida[]` (sí, ese es el nombre real del campo en `S`, sin
   la "m" de "comprometida", ver plata-comprometida.md §4) filtrado por
   `recibido:true` y `fechaRecibido` en el período — nunca por
   `fechaLlegada`, que es solo la fecha ESTIMADA. */
function _wrappedCalcularComprometida(S, tipo, mesK, anioK){
  const items = S.plataCometida;
  if(!Array.isArray(items) || !items.length) return null;

  let total = 0, topItem = null;
  items.forEach(it => {
    if(it && it.recibido === true && _wrappedEnRango(it.fechaRecibido, tipo, mesK, anioK)){
      total += (it.montoTotal||0);
      if(!topItem || (it.montoTotal||0) > topItem.monto){
        topItem = { desc: it.desc || 'Plata comprometida', monto: it.montoTotal||0 };
      }
    }
  });

  if(total <= 0) return null;
  return { total, topItem };
}

/* ─── ARMADO DE LA LISTA DE SLIDES DEL AÑO ────────────────────────────────
   Solo incluye un slide por cada dato curioso que realmente exista —
   mismas condiciones que ya usaba la versión de una sola pantalla, ahora
   cada una es su propia revelación en vez de una tarjeta más en la
   lista. */
function _wrappedBuildSlides(S, fmt2){
  const anioK = _wrappedHoy().slice(0,4);
  const { anioActual, mesActualIdx } = _wrappedAnioYMesActual();
  const mesMax = (anioK === anioActual) ? mesActualIdx : 11;
  const s = _wrappedCalcularPeriodo(S, 'anio', null, anioK);
  const patrimonio = _wrappedPatrimonioAnio(S, anioK);
  const serie = _wrappedSerieMensualAnio(S, anioK);
  const { mejor, peor, promedio, empateMejor, empatePeor } = _wrappedMejorPeorMesAnio(S, anioK);
  const cambioHabitos = _wrappedCambioDeHabitos(S, anioK, mesMax);
  const graficoSvg = _wrappedGraficoAnimadoSvg(serie);

  let racha = 0;
  if(typeof window !== 'undefined' && typeof window._alcRachaAhorro === 'function' && S.alcancia && S.alcancia.historial){
    racha = window._alcRachaAhorro(S.alcancia.historial);
  }

  // Dominios "de terceros" — ver comentario de cabecera del archivo y
  // wrapped.md §7ter. Cada uno es independiente; si un módulo no cargó
  // datos ese año, su función devuelve null y el slide simplemente no
  // se arma (mismo patrón que topCategoria/gastoMasGrande arriba).
  const encargosAnio    = _wrappedCalcularEncargos(S, 'anio', null, anioK);
  const prestadoAnio    = _wrappedCalcularPrestado(S, 'anio', null, anioK);
  const misDeudasAnio   = _wrappedCalcularMisDeudas(S, 'anio', null, anioK);
  const mesadaAnio      = _wrappedCalcularMesada(S, 'anio', null, anioK);
  const spotifyAnio     = _wrappedCalcularSpotify(S, 'anio', null, anioK);
  const comprometidaAnio = _wrappedCalcularComprometida(S, 'anio', null, anioK);

  const slides = [];

  slides.push({
    id: 'intro',
    html: `<div class="wrapped-slide-inner">
      <div class="wrapped-eyebrow">Tu resumen ${anioK}</div>
      <div class="wrapped-headline">A ver qué te tiene guardado tu propia plata.</div>
      <div class="wrapped-sub">Lo repasamos un dato a la vez.</div>
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

  if(cambioHabitos){
    slides.push({
      id: 'cambio-habitos',
      html: `<div class="wrapped-slide-inner">
        <div class="wrapped-eyebrow">Cambiaste de hábitos a mitad de año</div>
        <div class="wrapped-headline">De <b>${escHtml(cambioHabitos.catPrimera)}</b> a <b>${escHtml(cambioHabitos.catSegunda)}</b></div>
        <div class="wrapped-sub">tu categoría más fuerte pasó de una a otra entre la primera y la segunda mitad del año.</div>
      </div>`
    });
  }

  if(mejor){
    slides.push({ id:'mejor', html: _wrappedSlideBignum('Tu mejor mes', _wrappedMesKaNombre(mejor.mesK), mejor.balance, 'var(--accent)', {
      sub: _wrappedCopyMejorMes(mejor, promedio, empateMejor)
    }) });
  }
  if(peor && (!mejor || peor.mesK !== mejor.mesK)){
    slides.push({ id:'peor', html: _wrappedSlideBignum('Tu mes más difícil', _wrappedMesKaNombre(peor.mesK), peor.balance, 'var(--red)', {
      sub: _wrappedCopyPeorMes(peor, promedio, empatePeor)
    }) });
  }

  if(s.gastoMasGrande){
    slides.push({ id:'gasto', html: _wrappedSlideBignum('Tu gasto más grande', escHtml(s.gastoMasGrande.desc), s.gastoMasGrande.monto, 'var(--blue)', {
      sub: _wrappedCopyGasto(s.gastoMasGrande, s.avgGasto)
    }) });
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

  if(encargosAnio){
    slides.push({ id:'encargos', html: _wrappedSlideBignum('Plata que te encargaron cuidar', '', encargosAnio.totalEncargado, 'var(--purple)', {
      sub: _wrappedCopyEncargos(encargosAnio)
    }) });
  }

  if(prestadoAnio && prestadoAnio.totalPrestado > 0){
    slides.push({ id:'prestado', html: _wrappedSlideBignum('Le prestaste a otros', '', prestadoAnio.totalPrestado, 'var(--blue)', {
      sub: _wrappedCopyPrestado(prestadoAnio)
    }) });
  }

  if(misDeudasAnio && misDeudasAnio.totalRecibido > 0){
    slides.push({ id:'me-prestaron', html: _wrappedSlideBignum('Te prestaron a vos', '', misDeudasAnio.totalRecibido, 'var(--blue)', {
      sub: _wrappedCopyMisDeudas(misDeudasAnio)
    }) });
  }

  if(mesadaAnio){
    slides.push({ id:'mesada', html: _wrappedSlideBignum('Tu mesada del año', '', mesadaAnio.total, 'var(--accent)', {
      sub: _wrappedCopyMesada(mesadaAnio)
    }) });
  }

  if(spotifyAnio){
    const color = spotifyAnio.balance >= 0 ? 'var(--accent)' : 'var(--red)';
    slides.push({ id:'spotify', html: _wrappedSlideBignum('Administrar Spotify te dejó', '', spotifyAnio.balance, color, {
      signed: true, sub: _wrappedCopySpotify(spotifyAnio)
    }) });
  }

  if(comprometidaAnio){
    slides.push({ id:'comprometida', html: _wrappedSlideBignum('Plata comprometida que llegó', '', comprometidaAnio.total, 'var(--amber)', {
      sub: _wrappedCopyComprometida(comprometidaAnio)
    }) });
  }

  const huboAlgo = slides.length > 1; // más que solo el intro

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

/* ─── MOTOR DE NAVEGACIÓN (tap, swipe, flechas) ───────────────────────────
   Un único estado de módulo (`_wrappedNav`) que se reemplaza por completo
   en cada apertura de la pantalla — evita acumular listeners de teclado
   "colgados" entre una apertura y otra (ver _wrappedLimpiarNav). */
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
  // El overlay se monta en document.body (no dentro de #screen-wrapped,
  // ver wrapped.md §7bis), así que hay que sacarlo del DOM a mano al
  // cerrar — showScreen('config') solo oculta pantallas .screen, no toca
  // nada fuera de ese árbol.
  //
  // 'config' ya no es una suposición: Wrapped se abre ahora desde
  // Configuración → Herramientas → "Tu resumen" (antes vivía en el menú
  // "Más", ver CHANGELOG.md#wrapped), así que volver a 'config' es
  // exactamente la pantalla de la que se entró — mismo patrón que ya usa
  // Actividad reciente para volver a Configuración.
  //
  // Esto reemplaza el intento anterior, showScreen('mas'): 'mas' nunca
  // fue un id de .screen real (el menú "Más" es el overlay #mas-menu, no
  // una pantalla), así que getElementById('screen-mas') devolvía null y
  // showScreen() reventaba justo después de sacarle 'active' a todas las
  // .screen, dejando la app sin ninguna pantalla visible — la "página
  // negra" que se veía al cerrar.
  const overlay = document.getElementById('wrapped-overlay');
  if(overlay) overlay.remove();
  if(typeof showScreen === 'function') showScreen('config');
}

/* El overlay es `position:fixed`, y por spec un elemento fixed siempre
   tiene `offsetParent === null` — no sirve para detectar visibilidad acá.
   En su lugar se camina la cadena de ancestros buscando `display:none`
   (la forma real en que la app oculta una pantalla inactiva). */
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

  // Un solo listener de click decide: si el tap fue sobre algo
  // interactivo (los botones de "Ver de nuevo" / "Cerrar" del slide de
  // cierre) lo deja pasar; si no, navega según la mitad de la pantalla
  // donde ocurrió el tap — mismo patrón de "zonas muertas" que usa la
  // navegación tipo stories.
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
    // Convención estándar de "stories": el swipe horizontal cambia de
    // historia; el eje vertical se deja libre para no sentirse raro.
    if(Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy)){
      dx < 0 ? siguiente() : anterior();
    }
    touchX = null; touchY = null;
  }, { passive: true });

  if(closeBtn) closeBtn.addEventListener('click', _wrappedCerrar);

  // Flechas de teclado — solo reaccionan si la pantalla de Wrapped sigue
  // realmente visible (evita que un listener "colgado", si el usuario
  // salió de esta pantalla sin pasar por el botón Cerrar, siga
  // interceptando flechas en el resto de la app) y si el foco no está en
  // un campo de texto.
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

/* ─── ENTRADA PRINCIPAL ────────────────────────────────────────────────── */
window.renderWrapped = function(){
  const S = window.S || {};
  const fmt2 = typeof fmt === 'function' ? fmt : v => '$' + Math.round(v).toLocaleString('es-CO');

  _wrappedLogDebug(S);
  _wrappedInyectarEstilos();

  const slides = _wrappedBuildSlides(S, fmt2);

  const progresoHtml = slides.map(() => `<div class="wrapped-seg"><i></i></div>`).join('');
  const slidesHtml = slides.map(sl => `<div class="wrapped-slide"${sl.confetti ? ' data-confetti="1"' : ''}>${sl.html}</div>`).join('');

  // Se monta directo en document.body (no dentro de #wrapped-body /
  // #screen-wrapped) — ver wrapped.md §7bis: .screen.active tiene un
  // transform:translateY(0) permanente (animation-fill-mode:both en
  // styles.css), y cualquier transform en un ancestro convierte a este
  // overlay position:fixed en algo posicionado contra ESE ancestro en
  // vez del viewport. Mismo patrón que #toast-container.
  const overlayPrevio = document.getElementById('wrapped-overlay');
  if(overlayPrevio) overlayPrevio.remove();

  const overlay = document.createElement('div');
  overlay.id = 'wrapped-overlay';
  overlay.innerHTML = `<div id="wrapped-progress">${progresoHtml}</div>
    <div id="wrapped-topbar">
      <span class="wrapped-brand">Tu resumen</span>
      <button type="button" id="wrapped-close" aria-label="Cerrar">✕</button>
    </div>
    <div id="wrapped-slides">${slidesHtml}</div>`;
  document.body.appendChild(overlay);

  _wrappedSetupNav(overlay, fmt2);
  _wrappedGoTo(0);
};

/* Sin Events.registerAll: la navegación de esta pantalla se maneja por
   completo dentro de este archivo (ver _wrappedSetupNav) — no hay
   data-action delegados al dispatcher central de eventos porque la
   interacción (tap por zona, swipe, flechas) es específica de un
   carrusel de historias, no un formulario ni una lista de botones. */

/* Exportadas solo para poder testear los cálculos y el armado de slides
   de forma aislada — no se usan desde ningún otro archivo. */
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
  _wrappedCopyCierre,
  _wrappedCopyGasto,
  _wrappedTopCategoriaDe,
  _wrappedCambioDeHabitos,
  _wrappedAnioYMesActual,
  _wrappedEnRango,
  _wrappedValidarDatos,
  _wrappedCalcularEncargos,
  _wrappedCalcularPrestado,
  _wrappedCalcularMisDeudas,
  _wrappedCalcularMesada,
  _wrappedCalcularSpotify,
  _wrappedCalcularComprometida,
  _wrappedNombrePersona
};

})();
