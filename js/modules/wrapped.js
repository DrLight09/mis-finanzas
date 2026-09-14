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
/* Mesada + Ingresos fijos como ingreso del período — mismo criterio EXACTO
   que analisis.js (§2 de analisis-financiero.md, líneas 59-84 del código
   real): "Ingresos estimados" ahí es mesada + ingresos fijos + entradas
   manuales, nunca solo esto último. Antes de este fix, `totalIngresos` de
   acá abajo solo sumaba entradas manuales — eso hacía que "Tu mejor/peor
   mes" pudiera dar un balance más bajo (incluso negativo) que el que
   Análisis financiero ya muestra para ese mismo mes, con la misma plata
   real. Se lee `S.mesadas`/`S.ingresosFijos` directo, sin pasar por
   `getMesadaData()`/`_getCuotaAnio()`/`getIngresosFijosMes()` (funciones
   de otros módulos lazy que pueden no estar cargados) — no hace falta ni
   el guard `typeof` porque acá solo se lee la FORMA de `S`, ya
   documentada (mesada.md §4, analisis-financiero.md §3), igual que el
   resto de este archivo lee `S.alcancia`/`S.gastosVar` directo. */
function _wrappedCuotaAnioFallback(cuotas, anio){
  if(!cuotas || typeof cuotas !== 'object') return 0;
  let mejorAnio = null;
  Object.keys(cuotas).forEach(k => {
    const kn = parseInt(k,10);
    if(Number.isFinite(kn) && kn <= anio && (mejorAnio===null || kn>mejorAnio)) mejorAnio = kn;
  });
  return mejorAnio!==null ? (cuotas[mejorAnio]||0) : 0;
}
function _wrappedMesadaMes(S, anio, mesIdx){
  const mesadas = S.mesadas;
  if(!mesadas || typeof mesadas !== 'object' || !(S.modulos && S.modulos.mesada)) return 0;
  const key = anio + '-' + mesIdx;
  let total = 0;
  ['papa','mama'].forEach(parent => {
    const p = mesadas[parent];
    const info = p && p.pagos && p.pagos[key];
    if(info) total += (info.monto || _wrappedCuotaAnioFallback(p.cuotas, anio) || 0);
  });
  return total;
}
function _wrappedIngresosFijosMes(S, mesK){
  const fijos = S.ingresosFijos;
  if(!Array.isArray(fijos)) return 0;
  return fijos.reduce((s,ing) => (!ing.desde || ing.desde<=mesK) ? s+(ing.monto||0) : s, 0);
}

/* Extraído de `_wrappedCalcularPeriodo` (2026-09-14) para que las nuevas
   funciones de la tercera tanda (comparaciones, récords, descubrimientos,
   ver más abajo) puedan filtrar "gasto real del período" sin reimplementar
   el mismo filtro — mismo principio de §3, nunca duplicar un cálculo ya
   centralizado. No cambia ningún comportamiento existente: `_wrappedCalcularPeriodo`
   ahora llama a esto en vez de tener las mismas líneas inline. */
function _wrappedItemsRealesPeriodo(S, tipo, mesK, anioK){
  const gastosVar = S.gastosVar || [];
  // S.pagosGastosFijos puede llegar como array O como objeto/mapa (visto
  // en datos reales de producción) — normalizamos para no romper la
  // pantalla si algún día no es un array plano.
  const pagosFijosRaw = S.pagosGastosFijos;
  const pagosFijos = Array.isArray(pagosFijosRaw) ? pagosFijosRaw : Object.values(pagosFijosRaw || {});
  const esGastoNoReal = typeof _esGastoVarNoReal === 'function' ? _esGastoVarNoReal : (()=>false);
  return {
    gastosVarPeriodo: gastosVar.filter(g => _wrappedEnRango(g.fecha, tipo, mesK, anioK) && !esGastoNoReal(g)),
    pagosFijosPeriodo: pagosFijos.filter(p => _wrappedEnRango(p.fecha, tipo, mesK, anioK))
  };
}

function _wrappedCalcularPeriodo(S, tipo, mesK, anioK){
  S = S || {};
  const movs = S.movimientos || [];

  const esEntradaNoReal  = typeof _esEntradaEspejoNoIngreso === 'function' ? _esEntradaEspejoNoIngreso : (()=>false);

  const { gastosVarPeriodo, pagosFijosPeriodo } = _wrappedItemsRealesPeriodo(S, tipo, mesK, anioK);
  const ingresosPeriodo   = movs.filter(m => m.tipo==='entrada' && _wrappedEnRango(m.fecha, tipo, mesK, anioK) && !esEntradaNoReal(m));

  // Mesada + ingresos fijos del período, sumados mes a mes (ver comentario
  // arriba de `_wrappedMesadaMes`/`_wrappedIngresosFijosMes`) — para "mes"
  // es un solo mes; para "anio" se recorren los meses transcurridos, nunca
  // meses futuros del año en curso (un ingreso fijo recurrente no debe
  // contarse antes de que ese mes exista).
  let ingresoMesadaFijos = 0;
  if(tipo === 'mes' && mesK){
    const anio = parseInt(mesK.split('-')[0], 10);
    const mesIdx = parseInt(mesK.split('-')[1], 10) - 1;
    ingresoMesadaFijos = _wrappedMesadaMes(S, anio, mesIdx) + _wrappedIngresosFijosMes(S, mesK);
  } else if(tipo === 'anio' && anioK){
    const anio = parseInt(anioK, 10);
    const { anioActual, mesActualIdx } = _wrappedAnioYMesActual();
    const mesMax = (anioK === anioActual) ? mesActualIdx : 11;
    for(let m=0; m<=mesMax; m++){
      const mesKLoop = anioK + '-' + String(m+1).padStart(2,'0');
      ingresoMesadaFijos += _wrappedMesadaMes(S, anio, m) + _wrappedIngresosFijosMes(S, mesKLoop);
    }
  }

  const totalGastos   = gastosVarPeriodo.reduce((s,g)=>s+(g.monto||0),0) + pagosFijosPeriodo.reduce((s,p)=>s+(p.monto||0),0);
  const totalIngresos = ingresosPeriodo.reduce((s,m)=>s+(m.monto||0),0) + ingresoMesadaFijos;
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

/* ─── VISTA MENSUAL — "Este mes pasó algo" (2026-09-13) ────────────────
   Reabre la decisión descartada en la versión original de wrapped.md §7
   ("vista mensual... competiría con Top categorías de Análisis, le
   quitaría a Wrapped la sensación de sorpresa") — decisión de producto
   explícita del usuario, no una reconsideración técnica.

   Para evitar justamente el riesgo que motivó el descarte original, esto
   NO es un slide por mes (serían hasta 12 pantallas casi idénticas en
   forma, deslucido comparado con el resto de la historia) — es UNA sola
   pantalla con una lista compacta de una frase por mes, exactamente lo
   que pedía el brief original ("no mostrar doce tablas... mostrar
   solamente pequeñas historias"). Reutiliza `_wrappedCalcularPeriodo`
   mes a mes — el mismo patrón de loop que ya usa `_wrappedMejorPeorMesAnio`
   — nunca reimplementa el cálculo de balance/categoría por su cuenta.
   Omite meses sin ningún ingreso/gasto real (no forzar una frase sobre un
   mes vacío) y no se muestra si quedan menos de 3 meses con actividad. */
function _wrappedLineaMes(mes, avgBalance){
  if(avgBalance !== 0 && mes.balance > avgBalance * 1.4 && mes.balance > 0) return 'Uno de tus mejores meses.';
  if(mes.balance < 0 || (avgBalance > 0 && mes.balance < avgBalance * 0.5)) return 'Uno de tus meses más ajustados.';
  // "Sin categoría" es el bucket de gastos SIN `cat` (típicamente pagos de
  // gasto fijo) — como casi siempre son el gasto más grande del mes, sin
  // esta excepción "dominaba" casi todos los meses del año con una frase
  // que no dice nada real (encontrado probando contra un JSON real).
  if(mes.topCategoria && mes.topCategoria.cat !== 'Sin categoría' && (mes.topCategoria.catShare||0) >= 0.4){
    return `Dominado por ${escHtml(mes.topCategoria.cat)}.`;
  }
  return 'Un mes tranquilo, sin grandes sobresaltos.';
}
function _wrappedHistoriasMensuales(S, anioK, mesMax){
  if(mesMax < 2) return null; // menos de 3 meses posibles: no amerita un repaso mes a mes
  const meses = [];
  for(let m=0; m<=mesMax; m++){
    const mesK = anioK + '-' + String(m+1).padStart(2,'0');
    const stats = _wrappedCalcularPeriodo(S, 'mes', mesK, anioK);
    if(stats.totalIngresos > 0 || stats.totalGastos > 0){
      meses.push({ mesK, balance: stats.balance, topCategoria: stats.topCategoria });
    }
  }
  if(meses.length < 3) return null;

  const avgBalance = meses.reduce((s,m)=>s+m.balance,0) / meses.length;
  return meses.map(mes => ({ mesK: mes.mesK, balance: mes.balance, linea: _wrappedLineaMes(mes, avgBalance) }));
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

/* ─── BANCO DE FRASES ("banco de ideas", 2026-09-14) ────────────────────
   Extiende el sistema de copy contextual de §7 sin contradecirlo: la
   rama que aplica (leve/fuerte/extremo, etc.) sigue eligiéndose por una
   señal real de los datos, exactamente igual que antes — eso es lo que
   carga información de verdad y wrapped.md §7 explícitamente decidió NO
   reemplazar por un sorteo. Lo único que agrega esta capa es variedad de
   REDACCIÓN dentro de cada rama: antes, caer en "patrimonio subió
   fuerte" siempre mostraba la misma oración exacta, año tras año. Ahora
   cada rama tiene 2-4 formas de decir lo mismo y se elige una.

   La elección es determinista, no un `Math.random()` suelto (rompería
   la regla de "sin estado nuevo" de §3 si alguna vez hiciera falta
   reproducir el mismo resumen, ej. al generar una tarjeta para
   compartir): la semilla sale de `s.totalIngresos`/`s.totalGastos` y el
   patrimonio del año — los mismos totales que `_wrappedCalcularPeriodo`
   ya calcula solo para uso interno (§3), nunca mostrados en pantalla.
   Mismos datos → mismas frases (no se siente "con bug" al tocar "Ver de
   nuevo"); otro año o otro usuario → frases distintas. Dentro de una
   misma apertura se evita repetir la frase exacta en dos slides
   distintos (`_wrappedFrasesUsadas`). Ver `_wrappedIniciarBanco`,
   llamada una vez al principio de `_wrappedBuildSlides`. */
let _wrappedBankSeed = '';
let _wrappedFrasesUsadas = null;

function _wrappedHashStr(str){
  let h = 0;
  for(let i=0;i<str.length;i++) h = (h*31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}
/* Generador determinista simple (Park-Miller) — alcanza para elegir
   entre un puñado de frases, no hace falta nada más sofisticado. */
function _wrappedSeededRandom(seed){
  let s = seed % 2147483647;
  if(s <= 0) s += 2147483646;
  return function(){
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
function _wrappedIniciarBanco(seedBase){
  _wrappedBankSeed = String(seedBase);
  _wrappedFrasesUsadas = new Set();
}
/* `disambiguador` es opcional — agrega entropía propia del dato en
   cuestión (ej. el mes, el nombre de la categoría o de la persona) para
   que dos claves distintas con el mismo `_wrappedBankSeed` no terminen
   sincronizadas en la misma posición del arreglo por casualidad. */
function _wrappedBankPick(key, opciones, disambiguador){
  if(!opciones || opciones.length === 0) return '';
  if(opciones.length === 1) return opciones[0];
  const rand = _wrappedSeededRandom(_wrappedHashStr(_wrappedBankSeed + '|' + key + '|' + (disambiguador||'')) || 1);
  let elegido, intentos = 0;
  do {
    elegido = opciones[Math.floor(rand() * opciones.length)];
    intentos++;
  } while(_wrappedFrasesUsadas && _wrappedFrasesUsadas.has(elegido) && intentos < 8);
  if(_wrappedFrasesUsadas) _wrappedFrasesUsadas.add(elegido);
  return elegido;
}

function _wrappedCopyPatrimonio(patrimonio){
  const { diff, pct } = patrimonio;
  if(pct === null){
    return diff >= 0
      ? _wrappedBankPick('patrimonio-sinBase-sube', [
          'tu patrimonio creció este año.',
          'tu patrimonio terminó más arriba de donde empezó.',
          'este año tu patrimonio fue para arriba.',
        ])
      : _wrappedBankPick('patrimonio-sinBase-baja', [
          'tu patrimonio bajó este año.',
          'tu patrimonio terminó más abajo de donde empezó.',
          'este año tu patrimonio fue para abajo.',
        ]);
  }
  const pctTxt = Math.abs(Math.round(pct));
  if(diff >= 0){
    if(pct >= 50) return _wrappedBankPick('patrimonio-fuerte', [
      `fue un año grande: tu patrimonio subió +${pctTxt}%.`,
      `+${pctTxt}%. Este año tu patrimonio jugó en otra liga.`,
      `tu patrimonio casi se ${pct>=90?'duplicó':'redondeó'} este año (+${pctTxt}%).`,
      `pocas veces un año rinde +${pctTxt}% — este fue de esos.`,
    ]);
    if(pct >= 15) return _wrappedBankPick('patrimonio-medio', [
      `tu patrimonio creció con fuerza este año (+${pctTxt}%).`,
      `+${pctTxt}% de crecimiento — nada de qué quejarse.`,
      `este año tu plata trabajó de verdad (+${pctTxt}%).`,
    ]);
    return _wrappedBankPick('patrimonio-leve', [
      `tu patrimonio subió un poco este año (+${pctTxt}%).`,
      `+${pctTxt}%, sin hacer ruido pero yendo para arriba.`,
      `no fue un año explosivo, pero tu patrimonio sí subió (+${pctTxt}%).`,
    ]);
  }
  if(pct <= -25) return _wrappedBankPick('patrimonio-cayoFuerte', [
    `este año le exigiste bastante al bolsillo (-${pctTxt}%).`,
    `-${pctTxt}%. Este año pesó, y se nota.`,
    `no fue un año fácil para tu patrimonio (-${pctTxt}%).`,
  ]);
  return _wrappedBankPick('patrimonio-cayoLeve', [
    `tu patrimonio bajó un poco este año (-${pctTxt}%).`,
    `-${pctTxt}%, sin ser dramático.`,
    `bajó un poco, nada que no se recupere (-${pctTxt}%).`,
  ]);
}

function _wrappedCopyCategoria(topCategoria){
  const share = topCategoria.catShare || 0;
  let base;
  if(share >= 0.4) base = _wrappedBankPick('categoria-dominante', [
    'Le diste con todo a esta categoría — fue, por lejos, la que más plata se llevó.',
    'Esta categoría no tuvo competencia real este año.',
    'Ganó por goleada: ninguna otra categoría se le acercó.',
  ], topCategoria.cat);
  else if(share >= 0.2) base = _wrappedBankPick('categoria-fuerte', [
    'Fue la que más plata se llevó este año.',
    'Se llevó la mayor tajada de tu gasto.',
    'Ninguna otra categoría gastó tanto como esta.',
  ], topCategoria.cat);
  else base = _wrappedBankPick('categoria-normal', [
    'Fue la categoría donde más gastaste este año.',
    'De todas, esta fue la que más te costó.',
    'La que más veces vio salir tu plata.',
  ], topCategoria.cat);
  // Si la categoría que más se REPITIÓ es otra distinta a la que más
  // plata consumió (ver `_wrappedTopCategoriaDe`), vale la pena
  // mencionarlo — "gastaste más en viajes, pero mercado fue con la que
  // más veces pagaste" cuenta una historia distinta a solo el monto.
  if(topCategoria.topPorFrecuencia){
    base += ' ' + _wrappedBankPick('categoria-frecuencia', [
      `Aunque la que más se repitió fue ${escHtml(topCategoria.topPorFrecuencia.cat)}.`,
      `Eso sí — la que más veces pagaste fue ${escHtml(topCategoria.topPorFrecuencia.cat)}.`,
      `Frecuencia y monto no coincidieron: la más repetida fue ${escHtml(topCategoria.topPorFrecuencia.cat)}.`,
    ], topCategoria.topPorFrecuencia.cat);
  }
  return base;
}

function _wrappedCopyMejorMes(mejor, promedio, empate){
  if(empate) return _wrappedBankPick('mejorMes-empate', [
    'empatado con otro mes — los dos fueron tu mejor resultado del año.',
    'no hubo un solo ganador: este mes empató el primer lugar.',
  ], mejor.mesK);
  if(promedio !== null && promedio > 0 && mejor.balance > promedio * 1.5){
    return _wrappedBankPick('mejorMes-lejos', [
      'muy por encima de tu ritmo normal.',
      'se salió por completo de tu promedio — para bien.',
      'nada que ver con un mes cualquiera.',
    ], mejor.mesK);
  }
  if(mejor.balance > 0) return _wrappedBankPick('mejorMes-positivo', [
    'tu mes con mejor resultado del año.',
    'el mes que más plata te dejó.',
    'el que se lleva la corona este año.',
  ], mejor.mesK);
  return _wrappedBankPick('mejorMes-menosMalo', [
    'el menos difícil de todos — que también cuenta.',
    'no fue positivo, pero fue el que menos dolió.',
  ], mejor.mesK);
}

function _wrappedCopyPeorMes(peor, promedio, empate){
  if(empate) return _wrappedBankPick('peorMes-empate', [
    'empatado con otro mes — ninguno de los dos fue fácil.',
    'dos meses se pelearon el último lugar.',
  ], peor.mesK);
  if(peor.balance >= 0) return _wrappedBankPick('peorMes-noTanMal', [
    'y ni en tu peor mes te fue mal.',
    'el "peor" mes del año y aun así cerró positivo.',
    'hasta tu mes más flojo se mantuvo en verde.',
  ], peor.mesK);
  if(promedio !== null && promedio > 0 && peor.balance < promedio * -0.5){
    return _wrappedBankPick('peorMes-lejos', [
      'se salió bastante de tu ritmo normal.',
      'nada que ver con cómo te fue el resto del año.',
    ], peor.mesK);
  }
  return _wrappedBankPick('peorMes-normal', [
    'tu mes más ajustado del año.',
    'el que más apretó el bolsillo.',
    'el mes que costó un poco más sostener.',
  ], peor.mesK);
}

/* Contextualiza el gasto más grande: en qué mes fue y qué tan grande fue
   *en relación al propio gasto típico del usuario* (nunca contra un
   umbral fijo en pesos, que no tendría sentido entre personas con gastos
   de escalas muy distintas). */
function _wrappedCopyGasto(gastoMasGrande, avgGasto){
  const mesTxt = gastoMasGrande.fecha ? _wrappedMesKaNombre(gastoMasGrande.fecha.slice(0,7)) : null;
  let intensidad;
  if(avgGasto > 0 && gastoMasGrande.monto >= avgGasto * 5){
    const veces = Math.round(gastoMasGrande.monto / avgGasto);
    intensidad = _wrappedBankPick('gasto-extremo', [
      `${veces} veces más grande que tu gasto promedio — muchísimo más que cualquiera de tus otros gastos del año.`,
      `${veces} veces tu gasto típico. En otra categoría, literalmente.`,
      `nada se le acerca: ${veces} veces por encima de lo que gastás normalmente.`,
    ], gastoMasGrande.desc);
  } else if(avgGasto > 0 && gastoMasGrande.monto >= avgGasto * 2){
    const veces = (gastoMasGrande.monto / avgGasto).toFixed(1).replace(/\.0$/,'');
    intensidad = _wrappedBankPick('gasto-alto', [
      `${veces} veces tu gasto típico.`,
      `${veces} veces más de lo que gastás normalmente.`,
    ], gastoMasGrande.desc);
  } else {
    intensidad = _wrappedBankPick('gasto-normal', [
      'el que más te costó este año.',
      'tu gasto más grande del año, sin más vueltas.',
    ], gastoMasGrande.desc);
  }
  if(!mesTxt) return intensidad.charAt(0).toUpperCase() + intensidad.slice(1);
  return _wrappedBankPick('gasto-conector', [
    `Pasó en ${mesTxt} — ${intensidad}`,
    `Fue en ${mesTxt}: ${intensidad}`,
    `${mesTxt} se llevó el título — ${intensidad}`,
  ], mesTxt);
}

function _wrappedCopyAlcancia(alcanciaPeriodo, gastoMasGrande){
  if(gastoMasGrande && alcanciaPeriodo >= gastoMasGrande.monto){
    const descSeguro = gastoMasGrande.desc ? escHtml(gastoMasGrande.desc) : null;
    const gastoTxt = descSeguro ? '"'+descSeguro+'"' : 'tu gasto más grande';
    return _wrappedBankPick('alcancia-superaGasto', [
      `Eso es más de lo que gastaste en ${gastoTxt}, tu compra más grande del año.`,
      `Ahorraste más de lo que costó ${gastoTxt} — tu gasto más grande del año.`,
      `Sí: guardaste más plata de la que se fue en ${gastoTxt}.`,
    ], gastoMasGrande.desc);
  }
  return _wrappedBankPick('alcancia-generica', [
    'una plata que, sin la Alcancía, seguramente ni hubieras notado que tenías.',
    'plata que se fue guardando sin que la extrañaras.',
    'ahorro que pasó casi desapercibido, pero ahí está.',
  ]);
}

function _wrappedCopyRacha(racha){
  if(racha >= 6) return _wrappedBankPick('racha-larga', [
    'Eso ya no es suerte, es una costumbre.',
    'A esta altura, ya es un hábito instalado.',
    'Ya no es racha, es tu forma de ahorrar.',
  ], racha);
  if(racha >= 4) return _wrappedBankPick('racha-media', [
    'vas agarrando el ritmo.',
    'ya le encontraste la vuelta.',
  ], racha);
  return _wrappedBankPick('racha-corta', [
    'cada una ahorrando más que la anterior.',
    'un buen comienzo de racha.',
  ], racha);
}

/* Línea de cierre: se arma en base a "señales" (candidatas, con
   prioridad) derivadas de lo que ya se calculó para el resto de la
   historia — se elige la primera que aplique, nunca al azar, para que el
   cierre siempre hable de lo más notable que realmente pasó ese año.
   Dentro de la señal elegida sí hay banco de variantes (ver cabecera de
   sección), igual que el resto del sistema de copy. */
function _wrappedCopyCierre(ctx){
  const { anioK, patrimonio, racha, s, gastoMasGrande } = ctx;

  if(patrimonio && patrimonio.pct !== null && patrimonio.pct >= 50){
    return _wrappedBankPick('cierre-patrimonioFuerte', [
      `¿${anioK}? El año en que tu patrimonio casi se duplicó.`,
      `${anioK} en una línea: tu patrimonio se disparó.`,
      `El año en que tu plata dio un salto grande. Eso fue ${anioK}.`,
    ], anioK);
  }
  if(racha >= 4){
    return _wrappedBankPick('cierre-racha', [
      `${anioK} fue el año de la racha: ${racha} alcancías seguidas mejorando.`,
      `${racha} alcancías seguidas — así se resume tu ${anioK}.`,
    ], anioK);
  }
  if(patrimonio && patrimonio.pct !== null && patrimonio.pct <= -25){
    return _wrappedBankPick('cierre-patrimonioCayo', [
      `${anioK} no fue el año de acumular. Fue el año de sostener — y eso también cuenta.`,
      `${anioK} pesó, pero seguiste de pie.`,
    ], anioK);
  }
  if(s.alcanciaPeriodo > 0 && gastoMasGrande && s.alcanciaPeriodo >= gastoMasGrande.monto){
    return _wrappedBankPick('cierre-ahorroSuperaGasto', [
      `${anioK}: el año en que ahorraste más de lo que gastaste en tu compra más grande.`,
      `${anioK}, resumido: guardaste más de lo que gastaste en grande.`,
    ], anioK);
  }
  if(s.topCategoria && (s.topCategoria.catShare||0) >= 0.4){
    return _wrappedBankPick('cierre-categoria', [
      `${anioK}, resumido en una palabra: ${escHtml(s.topCategoria.cat)}.`,
      `Si ${anioK} fuera una palabra, sería ${escHtml(s.topCategoria.cat)}.`,
    ], anioK + s.topCategoria.cat);
  }
  return _wrappedBankPick('cierre-generico', [
    `Eso fue ${anioK}. Nos vemos el año que viene.`,
    `${anioK}, en el archivo. Hasta el próximo resumen.`,
    `Ese fue tu ${anioK}. Gracias por seguir registrando.`,
  ], anioK);
}

/* Copy de los dominios "de terceros" — mismo criterio que el resto del
   sistema de copy: solo eligen el tono, nunca recalculan nada. */
function _wrappedCopyEncargos(e){
  if(e.nPersonas > 1) return _wrappedBankPick('encargos-varias', [
    `Repartida entre ${e.nPersonas} personas que confiaron en vos para guardarla.`,
    `${e.nPersonas} personas te encargaron su plata este año.`,
  ], e.nPersonas);
  if(e.topEncargo && e.topEncargo.nombre) return _wrappedBankPick('encargos-una', [
    `La mayor parte te la encargó ${_wrappedNombrePersona(e.topEncargo.personaId, e.topEncargo.nombre)}.`,
    `Fue ${_wrappedNombrePersona(e.topEncargo.personaId, e.topEncargo.nombre)} quien más confió en vos para guardarle plata.`,
  ], e.topEncargo.nombre);
  return _wrappedBankPick('encargos-generica', [
    'Plata ajena que pasó por tus manos este año.',
    'Este año también cuidaste plata que no era tuya.',
  ]);
}
function _wrappedCopyPrestado(p){
  if(p.topDeudor && p.topDeudor.nombre) return _wrappedBankPick('prestado-topDeudor', [
    `A ${_wrappedNombrePersona(p.topDeudor.personaId, p.topDeudor.nombre)} fue a quien más le prestaste.`,
    `${_wrappedNombrePersona(p.topDeudor.personaId, p.topDeudor.nombre)} fue tu cliente más grande del año.`,
  ], p.topDeudor.nombre);
  if(p.totalDevuelto >= p.totalPrestado && p.totalDevuelto > 0) return _wrappedBankPick('prestado-cobradoTodo', [
    'Y este año te pagaron más de lo que prestaste.',
    'Y salieron las cuentas: te devolvieron más de lo que prestaste.',
  ]);
  return _wrappedBankPick('prestado-generica', [
    'Plata que le diste una mano a alguien más.',
    'Este año le tendiste la mano a alguien con plata.',
  ]);
}
function _wrappedCopyMisDeudas(m){
  if(m.totalPagado >= m.totalRecibido && m.totalPagado > 0) return _wrappedBankPick('misDeudas-pagoTodo', [
    'Y este año pagaste más de lo que te prestaron.',
    'Cuentas saldadas: pagaste más de lo que te prestaron.',
  ]);
  return _wrappedBankPick('misDeudas-generica', [
    'Plata que alguien más te prestó a vos.',
    'Este año también recibiste una mano de alguien.',
  ]);
}
function _wrappedCopyMesada(m){
  const partes = [];
  if(m.porPadre.papa) partes.push('papá');
  if(m.porPadre.mama) partes.push('mamá');
  if(partes.length === 2) return _wrappedBankPick('mesada-ambos', [
    'Entre papá y mamá, sin faltar un mes.',
    'Papá y mamá, mes tras mes, sin fallar.',
  ]);
  return _wrappedBankPick('mesada-uno', [
    `De parte de ${partes[0]}.`,
    `${partes[0].charAt(0).toUpperCase()+partes[0].slice(1)} no falló ni un mes.`,
  ], partes[0]);
}
function _wrappedCopySpotify(s){
  if(s.balance > 0) return _wrappedBankPick('spotify-favor', [
    'Administrar la cuenta te dejó plata a favor este año.',
    'Cobraste más de lo que pagaste por la cuenta compartida.',
  ]);
  if(s.balance < 0) return _wrappedBankPick('spotify-contra', [
    'Este año pusiste algo de tu bolsillo para cubrir la cuenta.',
    'Este año la cuenta te costó un poco de tu propio bolsillo.',
  ]);
  return _wrappedBankPick('spotify-parejo', [
    'Cobraste y pagaste el plan, sin ganar ni perder.',
    'La cuenta quedó exactamente pareja este año.',
  ]);
}
function _wrappedCopyComprometida(c){
  if(c.topItem && c.topItem.desc) return _wrappedBankPick('comprometida-item', [
    `La más grande fue "${escHtml(c.topItem.desc)}".`,
    `Nada le ganó a "${escHtml(c.topItem.desc)}" este año.`,
  ], c.topItem.desc);
  return _wrappedBankPick('comprometida-generica', [
    'Plata que estabas esperando y por fin llegó.',
    'Plata comprometida que finalmente cayó este año.',
  ]);
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
    const sufijo = el.getAttribute('data-sufijo') || '';
    // `data-sufijo` (ej. "%") es la ÚNICA excepción al formato moneda de
    // `fmt2` — se usa para valores que no son plata (progreso de una
    // meta, %). Con sufijo, el número se redondea plano, sin `$`.
    const formatear = v => sufijo ? (Math.round(v) + sufijo) : (signed ? _wrappedFmtSigned(fmt2, v) : fmt2(v));
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
.wrapped-mes-lista{width:100%;max-height:280px;overflow-y:auto;text-align:left;margin-top:6px;}
.wrapped-mes-row{display:flex;justify-content:space-between;gap:10px;padding:9px 4px;border-bottom:1px solid var(--border2);font-size:13px;}
.wrapped-mes-row:last-child{border-bottom:none;}
.wrapped-mes-nombre{font-family:'DM Mono',monospace;color:var(--text3);flex-shrink:0;}
.wrapped-mes-linea{text-align:right;line-height:1.4;}
.wrapped-cta-row{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:22px;}
.wrapped-cta{display:inline-flex;align-items:center;gap:6px;background:var(--accent);color:#0a0a0a;border:none;border-radius:999px;font-family:'DM Sans',sans-serif;font-weight:700;font-size:14px;padding:12px 22px;cursor:pointer;}
.wrapped-cta.ghost{background:transparent;color:var(--text);border:1px solid var(--border2);}
.wrapped-slide-inner-wide{max-width:380px;}
.wrapped-mes-detalle{width:100%;text-align:left;margin-top:14px;padding-top:10px;border-top:1px solid var(--border2);}
.wrapped-mes-head{font-family:'DM Mono',monospace;font-size:12px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;}
.wrapped-mes-fila{display:flex;justify-content:space-between;font-size:13px;padding:4px 0;}
.wrapped-mes-fila span{color:var(--text2);}
.wrapped-mes-compara{font-size:12px;color:var(--text3);margin-top:8px;line-height:1.5;}
.wrapped-mes-label.activo{fill:var(--text);font-weight:700;}
.wrapped-dot-ingreso{fill:var(--accent);}
.wrapped-dot-gasto{fill:var(--red);}
.wrapped-frases{width:100%;text-align:left;margin-top:6px;}
.wrapped-frase-item{font-size:13px;color:var(--text2);line-height:1.5;padding:9px 4px;border-bottom:1px solid var(--border2);}
.wrapped-frase-item:last-child{border-bottom:none;}
.wrapped-records-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;width:100%;margin-top:10px;}
.wrapped-record{background:var(--bg2);border:1px solid var(--border2);border-radius:var(--radius-sm);padding:12px 10px;text-align:left;}
.wrapped-record-l{font-size:11px;color:var(--text3);margin-bottom:4px;}
.wrapped-record-v{font-family:'DM Mono',monospace;font-weight:700;font-size:15px;color:var(--text);}
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
    <div class="wrapped-bignum" data-value="${valorSeguro}"${opts.signed?' data-signed="1"':''}${opts.sufijo?` data-sufijo="${opts.sufijo}"`:''} style="color:${color};">0</div>
    ${opts.sub ? `<div class="wrapped-sub">${opts.sub}</div>` : ''}
  </div>`;
}

/* Corte "primera mitad / segunda mitad" del año transcurrido — extraído
   de `_wrappedCambioDeHabitos` para que `_wrappedFasesAnio` (abajo) use
   exactamente el mismo corte de fechas, en vez de reimplementarlo. */
function _wrappedCorteMitadAnio(anioK, mesMax){
  const mitad = Math.floor((mesMax+1) / 2);
  const mesKDeCorte = anioK + '-' + String(mitad+1).padStart(2,'0'); // primer mesK de la segunda mitad
  return {
    enPrimera: fecha => typeof fecha === 'string' && fecha.slice(0,4) === anioK && fecha.slice(0,7) < mesKDeCorte,
    enSegunda: fecha => typeof fecha === 'string' && fecha.slice(0,4) === anioK && fecha.slice(0,7) >= mesKDeCorte
  };
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

  const { enPrimera, enSegunda } = _wrappedCorteMitadAnio(anioK, mesMax);

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

/* ─── FASES DEL AÑO (2026-09-13) ───────────────────────────────────────
   Detecta si el AHORRO (Alcancía) o el PRÉSTAMO A OTROS (Prestado · Me
   deben) se concentró de forma marcada en una mitad del año — la misma
   idea de "dos etapas" que `_wrappedCambioDeHabitos` ya aplica a
   categorías de gasto, extendida a estas dos señales.

   Umbral DELIBERADAMENTE relativo (70/30 de concentración entre
   mitades), nunca un monto fijo en pesos — mismo criterio que el
   `catShare >= 0.15` de `_wrappedCambioDeHabitos` y que el z-score de
   `_wrappedGastoMasRandom`: un umbral en pesos no tiene el mismo
   significado para dos usuarios distintos, uno relativo al propio año sí.
   Prioriza ahorro sobre préstamo si ambos califican (es la señal más
   "sobre el usuario mismo", préstamo depende también de que otras
   personas pidieran). Devuelve `null` si ninguna señal es lo bastante
   clara — no fuerza una narrativa de "fases" en un año parejo (§33 del
   pedido original). */
function _wrappedCambioFuerte(primera, segunda){
  // Ambas mitades necesitan actividad real (>0) para que esto sea un
  // CAMBIO de comportamiento y no una cuenta que simplemente no existía
  // en la primera mitad (ej. Alcancía activada a mitad de año) — eso no
  // es una fase, es que el dato todavía no existía. Verificado con un
  // backup real de una cuenta creada en septiembre: sin esta guarda,
  // "el único depósito del año cayó en la segunda mitad" se leía como
  // "aumentaste tu ahorro", un falso positivo (ver wrapped.md §7sexies).
  if(primera <= 0 || segunda <= 0) return null;
  const total = primera + segunda;
  const shareSegunda = segunda / total;
  if(shareSegunda >= 0.70) return { direccion: 'crecio', shareSegunda };
  if(shareSegunda <= 0.30) return { direccion: 'cayo', shareSegunda };
  return null;
}
function _wrappedFasesAnio(S, anioK, mesMax){
  if(mesMax < 5) return null; // mismo mínimo que _wrappedCambioDeHabitos

  const { enPrimera, enSegunda } = _wrappedCorteMitadAnio(anioK, mesMax);

  const alcMovs = (S.alcancia && Array.isArray(S.alcancia.movimientos)) ? S.alcancia.movimientos : [];
  const ahorroPrimera = alcMovs.filter(m => m && enPrimera(m.fecha)).reduce((s,m)=>s+(m.monto||0),0);
  const ahorroSegunda = alcMovs.filter(m => m && enSegunda(m.fecha)).reduce((s,m)=>s+(m.monto||0),0);
  const cambioAhorro = _wrappedCambioFuerte(ahorroPrimera, ahorroSegunda);
  if(cambioAhorro){
    return { tipo:'ahorro', direccion: cambioAhorro.direccion };
  }

  const deudores = S.deudores || [];
  const sumaPrestamos = (filtro) => deudores.reduce((s,d) =>
    s + (d.movimientos||[]).filter(m => m && m.tipo==='prestamo' && filtro(m.fecha)).reduce((a,m)=>a+(m.monto||0),0), 0);
  const prestPrimera = sumaPrestamos(enPrimera);
  const prestSegunda = sumaPrestamos(enSegunda);
  const cambioPrestamo = _wrappedCambioFuerte(prestPrimera, prestSegunda);
  if(cambioPrestamo){
    return { tipo:'prestamo', direccion: cambioPrestamo.direccion };
  }

  return null;
}
function _wrappedCopyFases(f){
  if(f.tipo === 'ahorro'){
    return f.direccion === 'crecio' ? _wrappedBankPick('fases-ahorroSubio', [
      'Tu año tuvo dos etapas: empezaste ahorrando poco y en la segunda mitad le metiste mucho más a la alcancía.',
      'Tu año tuvo un antes y un después: el ahorro se disparó en la segunda mitad.',
    ]) : _wrappedBankPick('fases-ahorroBajo', [
      'Tu año tuvo dos etapas: arrancaste ahorrando fuerte y en la segunda mitad bajaste el ritmo.',
      'Tu año tuvo un antes y un después: el ahorro se frenó en la segunda mitad.',
    ]);
  }
  return f.direccion === 'crecio' ? _wrappedBankPick('fases-prestamoSubio', [
    'Tu año tuvo dos etapas: empezaste tranquilo y en la segunda mitad te volviste banco de varias personas.',
    'Tu año tuvo un antes y un después: prestar más se volvió costumbre en la segunda mitad.',
  ]) : _wrappedBankPick('fases-prestamoBajo', [
    'Tu año tuvo dos etapas: prestaste bastante al principio y en la segunda mitad frenaste.',
    'Tu año tuvo un antes y un después: prestaste menos en la segunda mitad.',
  ]);
}

/* ─── "SI TU AÑO FUERA UNA PELÍCULA" (2026-09-13) ──────────────────────
   Puramente decorativo — no calcula NADA nuevo, solo le pone una frase a
   señales que este archivo ya calculó para otros slides (fases, cambio
   de hábitos, racha, patrimonio). Reglas deterministas en orden de más
   específico a más genérico, mismo criterio que `_wrappedPersonalidad`.
   Nunca inventa un evento que no esté respaldado por esas señales —
   el fallback genérico es deliberadamente aburrido en vez de forzar un
   dato que no existe (§33 del pedido original). */
function _wrappedSiTuAnioFuera(ctx){
  const { fasesAnio, cambioHabitos, racha, patrimonio } = ctx;
  if(fasesAnio && fasesAnio.tipo === 'ahorro' && fasesAnio.direccion === 'crecio'){
    return _wrappedBankPick('pelicula-ahorroSubio', [
      'Sería una de crecimiento, con un giro a mitad de año: el momento en que le agarraste el gusto a ahorrar.',
      'Sería de esas donde el personaje cambia a mitad de historia — acá, el momento en que empezaste a ahorrar en serio.',
    ]);
  }
  if(fasesAnio && fasesAnio.tipo === 'prestamo' && fasesAnio.direccion === 'crecio'){
    return _wrappedBankPick('pelicula-prestamoSubio', [
      'Sería una donde el protagonista termina manejando más plata ajena de la que esperaba al principio.',
      'Sería de las que arrancan con un favor pequeño y terminan con el protagonista manejando la plata de medio barrio.',
    ]);
  }
  if(cambioHabitos){
    return _wrappedBankPick('pelicula-cambioHabitos', [
      `Tendría un giro de guion a mitad de año: empezó siendo de ${escHtml(cambioHabitos.catPrimera)} y terminó siendo de ${escHtml(cambioHabitos.catSegunda)}.`,
      `El giro de la trama: arrancó siendo de ${escHtml(cambioHabitos.catPrimera)} y terminó siendo de ${escHtml(cambioHabitos.catSegunda)}.`,
    ], cambioHabitos.catPrimera + cambioHabitos.catSegunda);
  }
  if(racha >= 4){
    return _wrappedBankPick('pelicula-racha', [
      'Sería sobre disciplina silenciosa — el personaje que no falla ni un capítulo.',
      'Sería de ritmo constante, sin sobresaltos — el tipo de historia que gana por perseverancia.',
    ]);
  }
  if(patrimonio && Number.isFinite(patrimonio.diff) && patrimonio.diff > 0){
    return _wrappedBankPick('pelicula-patrimonioSubio', [
      'De las que terminan mejor de lo que empezaron, sin necesitar un clímax dramático para lograrlo.',
      'Sin gran clímax, pero con un final mejor que el comienzo — esas también son buenas historias.',
    ]);
  }
  return _wrappedBankPick('pelicula-generica', [
    'De las que no tienen gran clímax, pero tampoco fueron aburridas.',
    'Sin giros grandes, pero con suficiente para no aburrir.',
  ]);
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
   (esa es la cuota vigente hoy, no lo históricamente recibido).

   OJO — esto es DELIBERADAMENTE distinto de `_wrappedMesadaMes` (arriba,
   usada dentro de `_wrappedCalcularPeriodo` para el balance interno de
   "mejor/peor mes"): esa otra función busca el pago por su CLAVE de mes
   ("a qué mes representa este pago", igual que `analisis.js`), esta
   busca por su `fecha` real ("cuándo entró la plata"). Son dos
   preguntas distintas — "cuánto mesada te tocó este año" vs. "cuánto
   entró de mesada en este mes calendario para el balance" — no una
   duplicación evitable. */
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

/* ─── META DE AHORRO DE CAJITA ─────────────────────────────────────────
   Reutiliza `calcMetaProgreso(c)`, YA centralizada en `cuentas.js` (nunca
   se recalcula `pct`/`esperadoHoy`/`diferencia` acá — regla de §3). Como
   esa función depende de toda la cadena de cálculo de Cuentas (`calcC`,
   `_saldoEncargosEnCajita`, tasas por tramos), se llama envuelta en
   try/catch: si algo de esa cadena no cargó todavía o cambia de forma,
   Wrapped simplemente no muestra este slide en vez de romper toda la
   historia por un módulo ajeno. Elige la meta con MAYOR progreso (`pct`),
   no la de mayor objetivo en pesos — es "la más cerca de tu logro este
   año", no "la más ambiciosa". */
function _wrappedMetaCajita(S){
  if(typeof calcMetaProgreso !== 'function') return null;
  const cajitas = _wrappedListaCajitas(S);
  let mejor = null;
  cajitas.forEach(c => {
    if(!c || !c.meta) return;
    let prog = null;
    try { prog = calcMetaProgreso(c); } catch(e){ prog = null; }
    if(!prog || !Number.isFinite(prog.pct)) return;
    if(!mejor || prog.pct > mejor.prog.pct){
      mejor = { nombre: c.nombre || 'Tu meta', prog };
    }
  });
  return mejor;
}
function _wrappedCopyMeta(m){
  const p = m.prog;
  if(p.pct >= 100) return _wrappedBankPick('meta-cumplida', [
    '¡La cumpliste! Y con saldo suficiente para mostrarlo.',
    'Meta cumplida. Sin peros.',
    'Lo lograste — y no por poco.',
  ]);
  if(p.diferencia > 0) return _wrappedBankPick('meta-adelantado', [
    'Vas adelantado a tu propio plan.',
    'Vas más rápido de lo que te propusiste.',
  ]);
  if(p.diferencia < 0) return _wrappedBankPick('meta-atrasado', [
    'Un poco atrasado del ritmo esperado, pero sigue en pie.',
    'Vas un poco más lento de lo planeado, pero la meta sigue viva.',
  ]);
  return _wrappedBankPick('meta-alRitmo', [
    'Justo en el ritmo que te propusiste.',
    'Vas exactamente como lo planeaste.',
  ]);
}

/* ═══════════════════════════════════════════════════════════════════════
   SEGUNDA TANDA (2026-09-13) — Personalidad financiera, Gasto más random,
   Tus protagonistas. Reabre 2 de las 3 decisiones descartadas en
   wrapped.md §7 (personalidad financiera y, en un slide futuro, share
   cards) — decisión de producto explícita del usuario, documentada en
   wrapped.md §7cuater. La vista mensual sigue sin implementarse (backlog
   aparte, no en esta pasada).
   ═══════════════════════════════════════════════════════════════════════ */

/* Lista de cajitas: en el modelo documentado (cuentas.md §4) viven en
   `S.nu.cajitas[]`, pero en datos reales de producción (verificado contra
   mis-finanzas-poblado-2026.json) viven directo en `S.cajitas[]`, sin el
   contenedor `S.nu`. Se prueban ambas rutas, la real primero — mismo
   espíritu que ya tiene `_wrappedValidarDatos` con `pagosGastosFijos`. */
function _wrappedListaCajitas(S){
  if(Array.isArray(S.cajitas)) return S.cajitas;
  if(S.nu && Array.isArray(S.nu.cajitas)) return S.nu.cajitas;
  return [];
}

/* ─── PERSONALIDAD FINANCIERA ──────────────────────────────────────────
   Clasificación LÚDICA (nunca un puntaje financiero serio, ver el propio
   pedido del usuario §10) elegida por reglas deterministas sobre datos
   que YA se calculan en otro lado de este archivo — nunca un cálculo
   nuevo por su cuenta, mismo principio de §3. Se prueba en orden de más
   específico/raro a más genérico y se queda con el primer match: un CDT
   es un dato inequívoco (`_wrappedCalcularPeriodo` ignora esto porque no
   es gasto/ingreso), mientras que "equilibrista" es el fallback más
   débil (cualquier año sin nada más raro cae ahí). Si NINGUNA regla
   aplica con datos suficientes, devuelve `null` — nunca fuerza una
   personalidad de relleno (regla del propio pedido, §33 "no forzar
   insights"). */
function _wrappedPersonalidad(S, anioK){
  const cajitas = _wrappedListaCajitas(S);
  const cuentasPersonalizadas = S.cuentasPersonalizadas || [];
  const deudores = S.deudores || [];
  const prestado = _wrappedCalcularPrestado(S, 'anio', null, anioK);
  const periodo = _wrappedCalcularPeriodo(S, 'anio', null, anioK);
  let racha = 0;
  if(typeof window !== 'undefined' && typeof window._alcRachaAhorro === 'function' && S.alcancia && S.alcancia.historial){
    racha = window._alcRachaAhorro(S.alcancia.historial);
  }
  const catsDistintas = new Set((S.gastosVar||[]).map(g => g.cat).filter(Boolean)).size;
  const tieneCdt = cajitas.some(c => Array.isArray(c.cdts) && c.cdts.length > 0);

  if(tieneCdt){
    return { tipo:'El Inversionista', frase: _wrappedBankPick('personalidad-inversionista', [
      'No solo guardaste plata — la pusiste a producir.',
      'Tu plata no se quedó quieta: la pusiste a rendir.',
    ]) };
  }
  if(prestado && prestado.totalPrestado > 0 && deudores.length >= 3){
    return { tipo:'El Banquero', frase: _wrappedBankPick('personalidad-banquero', [
      `Este año también fuiste banco de ${deudores.length} personas.`,
      `${deudores.length} personas contaron con vos como su banco personal este año.`,
    ], deudores.length) };
  }
  if(racha >= 4){
    return { tipo:'El Acumulador', frase: _wrappedBankPick('personalidad-acumulador', [
      `${racha} alcancías seguidas sin fallar — eso no es suerte.`,
      `${racha} veces seguidas mejorando tu ahorro. Eso ya es un patrón.`,
    ], racha) };
  }
  if((cajitas.length + cuentasPersonalizadas.length) >= 6){
    return { tipo:'El Multicuenta', frase: _wrappedBankPick('personalidad-multicuenta', [
      'Tu plata vive repartida en muchos lugares distintos.',
      'Tenés más cuentas que la mayoría — y a todas les llevás la cuenta.',
    ]) };
  }
  if(catsDistintas >= 6){
    return { tipo:'El Organizador', frase: _wrappedBankPick('personalidad-organizador', [
      `Repartiste tus gastos entre ${catsDistintas} categorías distintas.`,
      `${catsDistintas} categorías distintas — a tu plata no le falta orden.`,
    ], catsDistintas) };
  }
  if(Number.isFinite(periodo.balance) && periodo.totalIngresos > 0 && Math.abs(periodo.balance)/periodo.totalIngresos < 0.15){
    return { tipo:'El Equilibrista', frase: _wrappedBankPick('personalidad-equilibrista', [
      'Lo que entró y lo que salió estuvieron muy parejos.',
      'Ingresos y gastos casi calcados este año — un balance envidiable.',
    ]) };
  }
  return null; // no forzar una personalidad si ninguna señal es clara
}

/* ─── GASTO MÁS RANDOM ─────────────────────────────────────────────────
   Distinto de "Tu gasto más grande" (que ya existe y usa `_wrappedCalcularPeriodo`):
   ese es el mayor en pesos; este es el más INESPERADO — una descripción
   que no se repitió ni una vez más en el período (`frecuencia === 1`) y
   que además se aleja bastante del gasto típico del usuario (z-score de
   su propio promedio y desviación, nunca un umbral fijo en pesos —
   mismo criterio "en relación al propio usuario" que ya usa
   `_wrappedCopyGasto`). Reutiliza el MISMO filtro de gasto real que
   `_wrappedCalcularPeriodo` (nunca un filtro propio, ver §3) recorriendo
   `S.gastosVar` con `_esGastoVarNoReal()`. Nunca elige el mismo gasto que
   ya ganó "el más grande" — sería repetir el mismo dato con otro marco. */
function _wrappedGastoMasRandom(S, tipo, mesK, anioK, gastoMasGrande){
  const gastosVar = S.gastosVar || [];
  const esGastoNoReal = typeof _esGastoVarNoReal === 'function' ? _esGastoVarNoReal : (()=>false);
  const periodo = gastosVar.filter(g => _wrappedEnRango(g.fecha, tipo, mesK, anioK) && !esGastoNoReal(g));
  if(periodo.length < 5) return null; // muy poca base para que un "z-score" signifique algo

  const montos = periodo.map(g => g.monto||0);
  const mean = montos.reduce((a,b)=>a+b,0) / montos.length;
  const variance = montos.reduce((a,b)=>a+(b-mean)*(b-mean),0) / montos.length;
  const std = Math.sqrt(variance);
  if(std <= 0) return null;

  const frecuencia = {};
  periodo.forEach(g => {
    const k = (g.desc||'').trim().toLowerCase();
    frecuencia[k] = (frecuencia[k]||0) + 1;
  });

  let candidato = null, mejorZ = 0;
  periodo.forEach(g => {
    if(gastoMasGrande && g.desc === gastoMasGrande.desc && g.monto === gastoMasGrande.monto) return; // no repetir el mismo slide
    const k = (g.desc||'').trim().toLowerCase();
    if(frecuencia[k] !== 1) return; // solo pasó una vez
    const z = Math.abs(((g.monto||0) - mean) / std);
    if(z > mejorZ){ mejorZ = z; candidato = g; }
  });

  if(!candidato || mejorZ < 0.8) return null; // nada realmente fuera de patrón
  return { desc: candidato.desc || 'Ese gasto', monto: candidato.monto||0, cat: candidato.cat||null, z: mejorZ };
}

/* ─── TUS PROTAGONISTAS ────────────────────────────────────────────────
   Con quién tuviste más actividad financiera en el período, sumando
   movimientos de TODOS los módulos que involucran personas (Encargos,
   Prestado, Spotify) — nunca solo uno. Cuenta MOVIMIENTOS (interacción),
   no plata — es una pregunta distinta de "quién te encargó más" o "a
   quién le prestaste más" (esas ya las responden sus propios slides de
   §7ter). Agrupa por `personaId` cuando existe; si no, por nombre crudo
   — mismo criterio de "sin perfil" de personas.md §2/§6. */
function _wrappedProtagonistas(S, tipo, mesK, anioK){
  const conteo = {}; // key -> {nombre, personaId, n}
  const sumar = (key, nombre, personaId, n) => {
    if(!key) return;
    if(!conteo[key]) conteo[key] = { nombre, personaId, n: 0 };
    conteo[key].n += n;
  };

  (S.encargos||[]).forEach(enc => {
    const n = (enc.movimientos||[]).filter(m => m && _wrappedEnRango(m.fecha, tipo, mesK, anioK)).length;
    if(n>0) sumar(enc.personaId||enc.nombre, enc.nombre, enc.personaId||null, n);
  });
  (S.deudores||[]).forEach(d => {
    const n = (d.movimientos||[]).filter(m => m && _wrappedEnRango(m.fecha, tipo, mesK, anioK)).length;
    if(n>0) sumar(d.personaId||d.nombre, d.nombre, d.personaId||null, n);
  });
  (S.misDeudas||[]).forEach(d => {
    const n = (d.movimientos||[]).filter(m => m && _wrappedEnRango(m.fecha, tipo, mesK, anioK)).length;
    if(n>0) sumar(d.personaId||d.nombre, d.nombre, d.personaId||null, n);
  });
  (S.spotifyHistorial||[]).forEach(h => {
    if(h && h.tipo==='cobro' && h.spId && _wrappedEnRango(h.fecha, tipo, mesK, anioK)){
      const sp = (S.spotifyPersonas||[]).find(p => p.id === h.spId);
      const nombre = sp ? sp.nombre : h.nombre;
      const personaId = sp ? sp.personaId : null;
      sumar(personaId||nombre, nombre, personaId||null, 1);
    }
  });

  const lista = Object.values(conteo).sort((a,b) => b.n - a.n);
  if(!lista.length) return null;
  return { top: lista[0], total: lista.length };
}

/* ═══════════════════════════════════════════════════════════════════════
   TERCERA TANDA (2026-09-14) — Gráfico mensual Ingresos/Gastos interactivo,
   comparaciones curiosas, suscripciones personales, recuperación de
   préstamo más rápida, "cosas que no sabías", "lo más extremo del año" y
   "tu año en una frase". Traído a pedido explícito del usuario desde un
   prototipo standalone (my-money-wrapped.html) que no comparte código con
   este módulo.

   OJO CON §1/§3 DE wrapped.md: el gráfico mensual de acá abajo SÍ pinta
   ingresos y gastos reales mes a mes — una excepción puntual y consciente
   a "Wrapped nunca muestra ingresos/gastos en crudo", pedida
   explícitamente por el usuario después de ver el chart equivalente del
   prototipo. Documentada acá y en wrapped.md §7, no es una
   reinterpretación silenciosa de la regla. El resto de esta tanda (récords,
   comparaciones, descubrimientos) SÍ respeta la regla original: solo
   valores puntuales (un gasto, un préstamo, un mes) o conteos, nunca el
   ingreso/gasto/balance agregado de todo el año — por eso, por ejemplo,
   "Lo más extremo del año" no incluye "ahorro neto" (sería literalmente
   el balance del año completo) aunque el prototipo original sí lo tenía. */

/* ─── GRÁFICO MENSUAL INGRESOS/GASTOS (interactivo) ────────────────────
   Reutiliza `_wrappedCalcularPeriodo` mes a mes — mismo patrón de loop
   que ya usan `_wrappedHistoriasMensuales`/`_wrappedMejorPeorMesAnio` —
   nunca reimplementa el cálculo de ingresos/gastos por su cuenta. */
function _wrappedSerieMensualIngresoGasto(S, anioK, mesMax){
  const meses = [];
  for(let m=0; m<=mesMax; m++){
    const mesK = anioK + '-' + String(m+1).padStart(2,'0');
    const stats = _wrappedCalcularPeriodo(S, 'mes', mesK, anioK);
    if(stats.totalIngresos > 0 || stats.totalGastos > 0){
      meses.push({ mesK, ingresos: stats.totalIngresos, gastos: stats.totalGastos, balance: stats.balance });
    }
  }
  return meses.length >= 2 ? meses : null;
}

/* Dos líneas (ingresos/gastos) + una zona invisible tappable por mes
   (`data-wrapped-mesidx`, ver `_wrappedSetupNav`) + un punto por mes en
   cada línea. A diferencia de `_wrappedGraficoAnimadoSvg` (patrimonio, se
   anima "dibujándose" con dasharray), este no se dibuja: revela sus
   puntos con un delay escalonado (ver `_wrappedSetupGraficoMensual`) y
   arranca seleccionado en el último mes. */
function _wrappedGraficoMensualSvg(meses){
  const w = 300, h = 140, padX = 10, padY = 16, padLabel = 14;
  const maxV = Math.max(1, ...meses.map(m => Math.max(m.ingresos, m.gastos)));
  const stepX = meses.length > 1 ? (w - padX*2) / (meses.length - 1) : 0;
  const xOf = i => padX + i*stepX;
  const yOf = v => (h - padY - padLabel) - (v/maxV) * (h - padY*2 - padLabel);
  const pathDe = key => meses.map((m,i) => (i===0?'M':'L') + xOf(i).toFixed(1) + ',' + yOf(m[key]).toFixed(1)).join(' ');
  const dotsDe = (key, clase) => meses.map((m,i) => `<circle class="wrapped-mes-dot ${clase}" data-idx="${i}" cx="${xOf(i).toFixed(1)}" cy="${yOf(m[key]).toFixed(1)}" r="3.5"/>`).join('');
  const labels = meses.map((m,i) => `<text class="wrapped-mes-label" data-idx="${i}" x="${xOf(i).toFixed(1)}" y="${h-2}" font-size="9" text-anchor="middle" font-family="'DM Mono',monospace" fill="var(--text3)">${_wrappedMesKaAbrev(m.mesK)}</text>`).join('');
  const hitzones = meses.map((m,i) => `<rect data-wrapped-mesidx="${i}" x="${(xOf(i)-(stepX||w)/2).toFixed(1)}" y="0" width="${(stepX||w).toFixed(1)}" height="${h}" fill="transparent" style="cursor:pointer;"/>`).join('');
  return `<svg class="wrapped-mensual-svg" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" style="display:block;overflow:visible;">
    <path d="${pathDe('ingresos')}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${pathDe('gastos')}" fill="none" stroke="var(--red)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <g>${dotsDe('ingresos','wrapped-dot-ingreso')}${dotsDe('gastos','wrapped-dot-gasto')}</g>
    <g>${labels}</g>
    <g>${hitzones}</g>
  </svg>`;
}

function _wrappedMesDetalleHtml(meses, idx, fmt2){
  const m = meses[idx];
  const prev = meses[idx-1];
  let comparacion;
  if(prev){
    const diff = m.gastos - prev.gastos;
    const pctDiff = prev.gastos ? Math.abs(Math.round((diff/prev.gastos)*100)) : 0;
    comparacion = pctDiff >= 5
      ? `Gastaste un ${pctDiff}% ${diff>0?'más':'menos'} que en ${_wrappedMesKaNombre(prev.mesK)}.`
      : `Gastaste casi lo mismo que en ${_wrappedMesKaNombre(prev.mesK)}.`;
  } else {
    comparacion = 'Tu primer mes con datos este año.';
  }
  const colorBalance = m.balance >= 0 ? 'var(--accent)' : 'var(--red)';
  return `<div class="wrapped-mes-head">${_wrappedMesKaNombre(m.mesK)}</div>
    <div class="wrapped-mes-fila"><span>Ingresos</span><b style="color:var(--accent);">${fmt2(m.ingresos)}</b></div>
    <div class="wrapped-mes-fila"><span>Gastos</span><b style="color:var(--red);">${fmt2(m.gastos)}</b></div>
    <div class="wrapped-mes-fila"><span>Balance</span><b style="color:${colorBalance};">${_wrappedFmtSigned(fmt2, m.balance)}</b></div>
    <div class="wrapped-mes-compara">${comparacion}</div>`;
}

/* Estado del gráfico mensual activo — un único global que se reemplaza
   por completo en cada apertura de la pantalla (mismo patrón que
   `_wrappedNav`), porque el click delegado de `_wrappedSetupNav` necesita
   acceso a los datos del mes tocado sin tener que rearmar el HTML. */
let _wrappedMesChart = null;

function _wrappedSeleccionarMes(slideEl, idx){
  if(!_wrappedMesChart || !slideEl) return;
  const { meses, fmt2 } = _wrappedMesChart;
  if(idx < 0 || idx >= meses.length) return;
  slideEl.querySelectorAll('.wrapped-mes-label').forEach(t => t.classList.toggle('activo', parseInt(t.getAttribute('data-idx'),10) === idx));
  slideEl.querySelectorAll('.wrapped-mes-dot').forEach(c => c.setAttribute('r', parseInt(c.getAttribute('data-idx'),10) === idx ? '5.5' : '3.5'));
  const detalle = slideEl.querySelector('.wrapped-mes-detalle');
  if(detalle) detalle.innerHTML = _wrappedMesDetalleHtml(meses, idx, fmt2);
}

/* Se dispara al entrar al slide del gráfico mensual (ver `_wrappedGoTo`):
   revela los puntos de cada mes con un delay escalonado (mismo espíritu
   de "revelación" que el resto de Wrapped) y deja seleccionado el último
   mes por default. Respeta prefers-reduced-motion mostrando todo de una. */
function _wrappedSetupGraficoMensual(slideEl){
  if(!_wrappedMesChart || !slideEl) return;
  const { meses } = _wrappedMesChart;
  const dots = slideEl.querySelectorAll('.wrapped-mes-dot');
  const reduce = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  dots.forEach(d => { d.style.opacity = '0'; });
  if(reduce || typeof setTimeout !== 'function'){
    dots.forEach(d => { d.style.opacity = '1'; });
    _wrappedSeleccionarMes(slideEl, meses.length - 1);
    return;
  }
  meses.forEach((_, i) => {
    setTimeout(() => {
      slideEl.querySelectorAll(`.wrapped-mes-dot[data-idx="${i}"]`).forEach(d => { d.style.transition = 'opacity .25s ease'; d.style.opacity = '1'; });
    }, i * (700 / Math.max(meses.length,1)));
  });
  setTimeout(() => _wrappedSeleccionarMes(slideEl, meses.length - 1), 750);
}

/* Lista simple de frases sueltas — reusada por comparaciones, suscripciones
   y descubrimientos (todas son "una lista de datos curiosos en prosa",
   nunca una tabla de cifras). */
function _wrappedFrasesHtml(frases){
  return `<div class="wrapped-frases">${frases.map(f => `<div class="wrapped-frase-item">${f}</div>`).join('')}</div>`;
}

/* ─── COMPARACIONES QUE SE ENTIENDEN MEJOR ASÍ ─────────────────────────
   Ninguna cifra nueva: relaciona números que este archivo ya calcula en
   otro lado (gasto más grande vs. gasto promedio, ambos de `s`; el mismo
   `S.spotifyCosto` que usa `spotify.js`; los depósitos de Alcancía del
   período que ya sabe contar `_wrappedCalcularPeriodo`) — nunca un
   cálculo propio, mismo principio de §3. Necesita al menos 2
   comparaciones reales para armar el slide — una sola suelta no amerita
   su propio slide. */
function _wrappedAlcanciaDepositosPeriodo(S, tipo, mesK, anioK){
  const a = S.alcancia;
  if(!a) return 0;
  let n = 0;
  if(!a._destapada){
    n += (a.movimientos||[]).filter(m => m && _wrappedEnRango(m.fecha, tipo, mesK, anioK)).length;
  }
  (a.historial||[]).forEach(h => { if(h && _wrappedEnRango(h.fechaFin, tipo, mesK, anioK)) n += (h.depositos||0); });
  return n;
}
function _wrappedComparaciones(S, tipo, mesK, anioK, s){
  const frases = [];
  let intensidadMax = 0;

  const { gastosVarPeriodo } = _wrappedItemsRealesPeriodo(S, tipo, mesK, anioK);
  const transporte = gastosVarPeriodo.filter(g => g.cat === 'Transporte').reduce((a,g)=>a+(g.monto||0),0);
  const spotifyCosto = S.spotifyCosto || 0;
  if(transporte > 0 && spotifyCosto > 0){
    const veces = transporte / spotifyCosto;
    if(veces >= 0.3){
      frases.push(`Tu gasto en transporte equivalió a ${veces.toFixed(1)} meses de tu Spotify compartido.`);
      intensidadMax = Math.max(intensidadMax, Math.min(4, veces));
    }
  }

  if(s.gastoMasGrande && s.avgGasto > 0){
    const veces = s.gastoMasGrande.monto / s.avgGasto;
    if(veces >= 2){
      frases.push(`Tu gasto más grande fue ${veces.toFixed(1)} veces más grande que tu gasto promedio.`);
      intensidadMax = Math.max(intensidadMax, Math.min(4, veces/2));
    }
  }

  if(s.alcanciaPeriodo > 0){
    const depositos = _wrappedAlcanciaDepositosPeriodo(S, tipo, mesK, anioK);
    if(depositos > 0){
      frases.push(`Tu alcancía guardó plata en ${depositos} depósito${depositos===1?'':'s'} silenciosos.`);
      intensidadMax = Math.max(intensidadMax, 1);
    }
  }

  return frases.length >= 2 ? { frases, intensidadMax } : null;
}

/* ─── SUSCRIPCIONES Y GASTOS RECURRENTES ───────────────────────────────
   Spotify ya tiene su propio slide de ganancia/pérdida (dominios "de
   terceros" arriba) — este es un ángulo distinto: "cuánto te cuesta cada
   mes solo por existir". SIMPLIFICACIÓN RECONOCIDA: usa la cuota VIGENTE
   HOY de cada gasto fijo categoría "Suscripciones" (`S.gastosFijos`), no
   un total histórico pagado durante el año — no hay en este archivo forma
   segura de reconstruir esa suma sin conocer la forma interna exacta de
   `S.pagosGastosFijos` más allá de lo ya documentado (array u
   objeto/mapa). Mismo tipo de simplificación honesta que ya reconoce este
   archivo para la ganancia de Spotify (ver comentario de
   `_wrappedCalcularSpotify`). */
function _wrappedSuscripciones(S){
  const fijos = Array.isArray(S.gastosFijos) ? S.gastosFijos : [];
  const personales = fijos
    .filter(f => f && f.cat === 'Suscripciones')
    .map(f => ({ desc: f.nombre || 'Suscripción', monto: f.monto || 0 }))
    .filter(p => p.monto > 0);

  const spotifyActivo = Array.isArray(S.spotifyPersonas) && S.spotifyPersonas.length > 0;
  if(!personales.length && !spotifyActivo) return null;

  return {
    personales,
    spotify: spotifyActivo ? { personas: S.spotifyPersonas.length, costoMensual: S.spotifyCosto || 0 } : null
  };
}

/* ─── RECUPERACIÓN MÁS RÁPIDA DE UN PRÉSTAMO ───────────────────────────
   Solo considera el caso simple —un deudor con exactamente un préstamo y
   un pago que lo cubre por completo—: con varios ciclos de
   préstamo/abono mezclados, "primero a último movimiento" daría un
   número de días engañoso, así que esos deudores simplemente no
   participan de este dato en vez de mostrar algo probablemente
   incorrecto. Filtra a préstamos otorgados dentro del año — un préstamo
   de un año anterior devuelto rápido este año no es "un dato de este
   año". */
function _wrappedRecuperacionMasRapida(S, anioK){
  const deudores = S.deudores || [];
  let mejor = null;
  deudores.forEach(d => {
    const movs = (Array.isArray(d.movimientos) ? d.movimientos : [])
      .filter(m => m && typeof m.fecha === 'string')
      .slice()
      .sort((a,b) => a.fecha.localeCompare(b.fecha));
    if(movs.length !== 2) return;
    const [primero, segundo] = movs;
    if(primero.tipo !== 'prestamo') return;
    if(!(segundo.tipo === 'abono' || segundo.tipo === 'pago-completo')) return;
    if((segundo.monto||0) < (primero.monto||0)) return;
    if(primero.fecha.slice(0,4) !== anioK) return;
    const dias = Math.round((new Date(segundo.fecha) - new Date(primero.fecha)) / 86400000);
    if(!Number.isFinite(dias) || dias < 0) return;
    if(!mejor || dias < mejor.dias){
      mejor = { dias, nombre: d.nombre, personaId: d.personaId || null, monto: primero.monto||0 };
    }
  });
  return mejor;
}

/* ─── "COSAS QUE PROBABLEMENTE NO SABÍAS" ──────────────────────────────
   Sobras curiosas que no ameritan su propio slide dedicado. Necesita al
   menos 2 para armarse. El día más activo cuenta movimientos de todos los
   dominios que ya filtra el resto del archivo por fecha (gasto real,
   movimientos de cuentas sin aperturas, préstamos, Alcancía) — nunca una
   fuente nueva. La comparación "prestaste más de lo que te entró" A
   PROPÓSITO nunca muestra el ingreso total del año en pantalla
   (`s.totalIngresos` es de uso interno únicamente, ver §3) — solo lo usa
   para decidir si la frase (sin cifra) aplica. */
function _wrappedDescubrimientos(S, anioK, s, prestadoAnio){
  const leftovers = [];
  const { gastosVarPeriodo } = _wrappedItemsRealesPeriodo(S, 'anio', null, anioK);

  const conteoDias = {};
  const bump = fecha => { if(typeof fecha === 'string' && fecha.slice(0,4) === anioK) conteoDias[fecha] = (conteoDias[fecha]||0) + 1; };
  gastosVarPeriodo.forEach(g => bump(g.fecha));
  (S.movimientos||[]).forEach(m => { if(m && m.tipo !== 'apertura') bump(m.fecha); });
  (S.deudores||[]).forEach(d => (d.movimientos||[]).forEach(m => m && bump(m.fecha)));
  (S.misDeudas||[]).forEach(d => (d.movimientos||[]).forEach(m => m && bump(m.fecha)));
  if(S.alcancia && Array.isArray(S.alcancia.movimientos)) S.alcancia.movimientos.forEach(m => m && bump(m.fecha));
  const diasOrdenados = Object.entries(conteoDias).sort((a,b) => b[1]-a[1]);
  if(diasOrdenados.length && diasOrdenados[0][1] >= 3){
    const [fechaTop, n] = diasOrdenados[0];
    const dia = parseInt(fechaTop.slice(8,10),10);
    const mesTxt = _MES_NOMBRE[parseInt(fechaTop.slice(5,7),10)-1] || '';
    leftovers.push(`Tu día más movido fue el ${dia} de ${mesTxt}, con ${n} movimientos.`);
  }

  const conNota = gastosVarPeriodo.find(g => g.nota && String(g.nota).trim().length > 3);
  if(conNota){
    leftovers.push(`Hasta tus notas cuentan historias: sobre "${escHtml(conNota.desc||'ese gasto')}" dejaste escrito "${escHtml(String(conNota.nota).trim())}".`);
  }

  if(prestadoAnio && prestadoAnio.totalPrestado > 0 && s.totalIngresos > 0 && prestadoAnio.totalPrestado > s.totalIngresos){
    leftovers.push('Prestaste más plata de la que te entró en ingresos este año — generoso, aunque el bolsillo lo haya sentido.');
  }

  return leftovers.length >= 2 ? leftovers : null;
}

/* ─── "LO MÁS EXTREMO DEL AÑO" ─────────────────────────────────────────
   Grid de récords puntuales — nunca agregados del año completo. A
   PROPÓSITO no incluye "ahorro neto" (a diferencia del prototipo del que
   se trajo esta idea): sería literalmente el `balance` de todo el año,
   exactamente lo que §3 prohíbe mostrar. Cada campo de acá es un extremo
   puntual (el gasto más grande, el mes más caro) o un conteo, igual que
   el resto de "datos curiosos" de este módulo. */
function _wrappedRecordsAnio(S, anioK, s, prestadoAnio, serieMensual){
  const esEntradaNoReal = typeof _esEntradaEspejoNoIngreso === 'function' ? _esEntradaEspejoNoIngreso : (()=>false);
  let mayorIngreso = null;
  (S.movimientos||[]).forEach(m => {
    if(m && m.tipo==='entrada' && _wrappedEnRango(m.fecha,'anio',null,anioK) && !esEntradaNoReal(m) && (m.monto||0) > (mayorIngreso?mayorIngreso.monto:0)){
      mayorIngreso = { monto: m.monto||0 };
    }
  });

  let mayorPrestamo = null;
  (S.deudores||[]).forEach(d => (d.movimientos||[]).forEach(m => {
    if(m && m.tipo==='prestamo' && _wrappedEnRango(m.fecha,'anio',null,anioK) && (m.monto||0) > (mayorPrestamo?mayorPrestamo.monto:0)){
      mayorPrestamo = { monto: m.monto||0 };
    }
  }));

  let mesMasCaro = null;
  if(serieMensual){
    serieMensual.forEach(m => { if(!mesMasCaro || m.gastos > mesMasCaro.gastos) mesMasCaro = m; });
  }

  const { gastosVarPeriodo } = _wrappedItemsRealesPeriodo(S, 'anio', null, anioK);
  let totalMovs = gastosVarPeriodo.length + (S.movimientos||[]).length;
  (S.deudores||[]).forEach(d => totalMovs += (d.movimientos||[]).length);
  (S.misDeudas||[]).forEach(d => totalMovs += (d.movimientos||[]).length);

  const registros = [
    { l:'Mayor gasto', v: s.gastoMasGrande ? s.gastoMasGrande.monto : null, fmt:'money' },
    { l:'Mayor ingreso', v: mayorIngreso ? mayorIngreso.monto : null, fmt:'money' },
    { l:'Mayor préstamo', v: mayorPrestamo ? mayorPrestamo.monto : null, fmt:'money' },
    { l:'Mes más caro', v: mesMasCaro ? _wrappedMesKaAbrev(mesMasCaro.mesK) : null, fmt:'text' },
    { l:'Ahorro neto', v: s.balance, fmt:'money' },
    { l:'Movimientos totales', v: totalMovs || null, fmt:'text' }
  ];
  return registros.some(r => r.v !== null) ? registros : null;
}

/* Cuenta identidades distintas involucradas en dominios "de terceros" —
   deudores, "yo debo", integrantes de Spotify, encargantes — usando
   `personaId` cuando existe y el nombre crudo como fallback, para no
   contar dos veces a la misma persona vinculada al sistema unificado. */
function _wrappedPersonasInvolucradas(S){
  const set = new Set();
  const add = (personaId, nombre) => { if(personaId) set.add('p:'+personaId); else if(nombre) set.add('n:'+String(nombre).toLowerCase()); };
  (S.deudores||[]).forEach(d => add(d.personaId, d.nombre));
  (S.misDeudas||[]).forEach(d => add(d.personaId, d.nombre));
  (S.spotifyPersonas||[]).forEach(p => add(p.personaId, p.nombre));
  (S.encargos||[]).forEach(e => add(e.personaId, e.nombre));
  return set.size;
}

/* ─── "TU AÑO EN NÚMEROS" ──────────────────────────────────────────────
   A diferencia de todo lo demás en este archivo, este slide SÍ muestra
   los agregados completos del año (ingresos, gastos, ahorro neto, dinero
   movido) — decisión explícita del usuario (2026-09-14) para que el
   módulo quede igual al prototipo del que se trajo esta idea, ver
   wrapped.md §1/§3/§7decies para el detalle de qué regla se relajó y
   por qué. */
function _wrappedPeriodoEnNumeros(S, anioK, s, prestadoAnio, serieMensual){
  const { gastosVarPeriodo } = _wrappedItemsRealesPeriodo(S, 'anio', null, anioK);
  const categorias = new Set(gastosVarPeriodo.map(g => g.cat).filter(Boolean)).size;
  let totalMovs = gastosVarPeriodo.length + (S.movimientos||[]).length;
  (S.deudores||[]).forEach(d => totalMovs += (d.movimientos||[]).length);
  (S.misDeudas||[]).forEach(d => totalMovs += (d.movimientos||[]).length);
  return [
    { l:'Dinero movido', v: s.totalIngresos + s.totalGastos, fmt:'money' },
    { l:'Ingresos', v: s.totalIngresos, fmt:'money' },
    { l:'Gastos', v: s.totalGastos, fmt:'money' },
    { l:'Ahorro neto', v: s.balance, fmt:'money' },
    { l:'Prestado', v: prestadoAnio ? prestadoAnio.totalPrestado : 0, fmt:'money' },
    { l:'Personas', v: _wrappedPersonasInvolucradas(S), fmt:'text' },
    { l:'Categorías', v: categorias, fmt:'text' },
    { l:'Meses activos', v: serieMensual ? serieMensual.length : 0, fmt:'text' },
    { l:'Movimientos', v: totalMovs, fmt:'text' }
  ];
}
function _wrappedRecordsHtml(registros, fmt2){
  const filas = registros.map(r => `<div class="wrapped-record"><div class="wrapped-record-l">${r.l}</div><div class="wrapped-record-v">${r.v===null?'—':(r.fmt==='money'?fmt2(r.v):escHtml(String(r.v)))}</div></div>`).join('');
  return `<div class="wrapped-records-grid">${filas}</div>`;
}

/* ─── "TU AÑO EN UNA FRASE" ─────────────────────────────────────────────
   Puramente decorativo, mismo criterio que `_wrappedSiTuAnioFuera`: no
   calcula nada nuevo, solo junta frases candidatas según señales que
   este archivo ya calculó en otro lado. `tasaAhorroInterna` se usa
   SOLO para elegir la frase, nunca se pinta (mismo criterio de §3 que ya
   aplica `balance`/`promedio` en el resto del archivo). Semilla
   determinística (año + cantidad de opciones que aplicaron) para que no
   cambie de frase si se re-renderiza la misma historia. */
function _wrappedFraseDelAnio(ctx){
  const { anioK, esBanquero, tasaAhorroInterna, fasesAnio, prestadoDistintoDeRecuperacion } = ctx;
  const opciones = [];
  if(esBanquero && tasaAhorroInterna > 0.25) opciones.push('Un año de prestar, recuperar y aun así seguir ahorrando.');
  if(esBanquero) opciones.push('Un año donde tu dinero también salió a trabajar para otros.');
  if(tasaAhorroInterna > 0.3) opciones.push('Un año de aprender a guardar dinero sin dejar de disfrutarlo.');
  if(fasesAnio) opciones.push('Un año que no fue igual de principio a fin.');
  if(esBanquero && prestadoDistintoDeRecuperacion) opciones.push('Ahorraste, prestaste, gastaste y, contra todo pronóstico, llegaste al final.');
  opciones.push('Un año de organizar más que de gastar.');

  // Reutiliza el mismo banco de frases del resto del módulo (ver
  // cabecera de sección de `_wrappedBankPick`) en vez de su propio hash
  // local — misma semilla determinista basada en datos reales, en vez
  // de solo `anioK + opciones.length` (que antes podía coincidir entre
  // años distintos con la misma cantidad de opciones aplicables).
  return _wrappedBankPick('fraseDelAnio', opciones, opciones.length);
}

/* ─── ARMADO DE LA LISTA DE SLIDES DEL AÑO ────────────────────────────────
   Solo incluye un slide por cada dato curioso que realmente exista —
   mismas condiciones que ya usaba la versión de una sola pantalla, ahora

   cada una es su propia revelación en vez de una tarjeta más en la
   lista. */
/* ─── MOTOR DE SCORING DE INSIGHTS (2026-09-13) ────────────────────────
   Reabre §6/§32 del brief original: "no mostrar 50 insights aleatorios...
   crear un sistema de scoring... así el Wrapped se siente curado." Antes
   de esto, CADA dominio de terceros + CADA "descubrimiento" (gasto
   random, protagonistas, meta, cambio de hábitos, fases) se mostraba
   incondicionalmente si existía — un usuario con los 6 módulos de
   terceros activos + los 5 descubrimientos podía terminar con 11 slides
   extra, exactamente el "aluvión sin curar" que el brief pedía evitar.

   Solo entran al pool de scoring los datos que PUEDEN acumularse sin
   límite según cuántos módulos tenga activos el usuario (dominios de
   terceros + descubrimientos). El "esqueleto" narrativo — intro,
   patrimonio, categoría del año, vista mensual, mejor/peor mes, gasto
   más grande, alcancía, racha, personalidad, "si tu año fuera", cierre —
   NO entra al pool: son como máximo 1 de cada uno, nunca se acumulan, y
   recortarlos por puntaje debilitaría la promesa central de Wrapped en
   vez de curarla.

   El puntaje es la SUMA de señales que el propio candidato ya sabe sobre
   sí mismo (nunca un cálculo nuevo — cada bandera sale de datos que su
   propia función `_wrappedCalcular*`/`_wrappedFases*` ya devolvió):
   - `esRecord` (+3): es un extremo real, no un promedio (récord, o ya
     pasó su propio filtro estadístico — ej. `_wrappedGastoMasRandom` ya
     exige z-score, así que CUALQUIER resultado suyo es por definición un
     record local).
   - `esCambioComportamiento` (+3): es una fase/cambio de hábito, no un
     dato estático — más "historia", no solo una cifra.
   - `involucraMeta` (+2): tiene una meta de por medio (más personal que
     un movimiento suelto).
   - `involucraPersona` (+1): nombra a alguien — mismo criterio suave de
     `wrapped.md §7ter` sobre por qué el protagonista se elige por
     actividad, no al azar.
   - `intensidad` (0 a 4, capado): qué tan lejos de "lo normal" está este
     dato para ESTE usuario — reutiliza valores relativos que cada
     función ya calculó (el `z` de `_wrappedGastoMasRandom`, el `pct` de
     una meta, la cantidad de personas involucradas), NUNCA un monto fijo
     en pesos, mismo criterio de todo el archivo. */
function _wrappedScoreInsight(c){
  let score = 0;
  if(c.esRecord) score += 3;
  if(c.esCambioComportamiento) score += 3;
  if(c.involucraMeta) score += 2;
  if(c.involucraPersona) score += 1;
  if(Number.isFinite(c.intensidad)) score += Math.max(0, Math.min(4, c.intensidad));
  return score;
}
/* Cuántos slides del pool de insights se muestran como máximo — el resto
   simplemente no se cuenta esta vez (nunca se pierden datos reales de
   `S`, solo no todos caben en UNA historia de un año sin sentirse
   inflada). Un número, no una fracción de todos los candidatos posibles,
   porque el objetivo es un tamaño de historia consistente entre un
   usuario con 2 módulos activos y uno con los 11 — mismo espíritu que
   Spotify Wrapped, que no crece sin límite aunque hayas escuchado más
   artistas. */
const WRAPPED_MAX_INSIGHTS_POOL = 8;

function _wrappedBuildSlides(S, fmt2){
  const anioK = _wrappedHoy().slice(0,4);
  const { anioActual, mesActualIdx } = _wrappedAnioYMesActual();
  const mesMax = (anioK === anioActual) ? mesActualIdx : 11;
  const s = _wrappedCalcularPeriodo(S, 'anio', null, anioK);
  const patrimonio = _wrappedPatrimonioAnio(S, anioK);
  const serie = _wrappedSerieMensualAnio(S, anioK);
  const { mejor, peor, promedio, empateMejor, empatePeor } = _wrappedMejorPeorMesAnio(S, anioK);
  const cambioHabitos = _wrappedCambioDeHabitos(S, anioK, mesMax);
  const fasesAnio = _wrappedFasesAnio(S, anioK, mesMax);
  const historiasMensuales = _wrappedHistoriasMensuales(S, anioK, mesMax);
  const graficoSvg = _wrappedGraficoAnimadoSvg(serie);
  const serieMensualIngresoGasto = _wrappedSerieMensualIngresoGasto(S, anioK, mesMax);

  // Arranca el banco de frases con una semilla determinista para esta
  // apertura (ver cabecera de sección de `_wrappedBankPick`) — reutiliza
  // `s.totalIngresos`/`s.totalGastos` (ya calculados solo para uso
  // interno, §3) y el patrimonio del año, nunca un cálculo nuevo.
  _wrappedIniciarBanco(anioK + '|' + s.totalIngresos + '|' + s.totalGastos + '|' + (patrimonio && Number.isFinite(patrimonio.diff) ? patrimonio.diff : 0));

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

  // Segunda tanda (2026-09-13): personalidad, gasto random, protagonistas.
  const personalidad   = _wrappedPersonalidad(S, anioK);
  const gastoRandom    = _wrappedGastoMasRandom(S, 'anio', null, anioK, s.gastoMasGrande);
  const protagonistas  = _wrappedProtagonistas(S, 'anio', null, anioK);
  const metaCajita     = _wrappedMetaCajita(S);

  // Tercera tanda (2026-09-14) — ver comentario de cabecera de esa sección.
  const comparaciones   = _wrappedComparaciones(S, 'anio', null, anioK, s);
  const suscripciones   = _wrappedSuscripciones(S);
  const recuperacion    = _wrappedRecuperacionMasRapida(S, anioK);
  const descubrimientos = _wrappedDescubrimientos(S, anioK, s, prestadoAnio);
  const recordsAnio     = _wrappedRecordsAnio(S, anioK, s, prestadoAnio, serieMensualIngresoGasto);
  // Uso puramente interno para elegir la frase del año — nunca se pinta en
  // pantalla (mismo criterio que `balance`/`promedio` en el resto del
  // archivo, ver §3).
  const tasaAhorroInterna = s.totalIngresos > 0 ? s.balance / s.totalIngresos : 0;
  const fraseAnio = _wrappedFraseDelAnio({
    anioK,
    esBanquero: !!(prestadoAnio && prestadoAnio.totalPrestado > 0),
    tasaAhorroInterna,
    fasesAnio,
    prestadoDistintoDeRecuperacion: !!(prestadoAnio && prestadoAnio.topDeudor && recuperacion && prestadoAnio.topDeudor.nombre !== recuperacion.nombre)
  });

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

  if(historiasMensuales){
    const filas = historiasMensuales.map(m => {
      const color = m.balance > 0 ? 'var(--accent)' : (m.balance < 0 ? 'var(--red)' : 'var(--text2)');
      return `<div class="wrapped-mes-row">
        <span class="wrapped-mes-nombre">${_wrappedMesKaNombre(m.mesK)}</span>
        <span class="wrapped-mes-linea" style="color:${color};">${m.linea}</span>
      </div>`;
    }).join('');
    slides.push({
      id: 'vista-mensual',
      html: `<div class="wrapped-slide-inner">
        <div class="wrapped-eyebrow">Este año, mes a mes</div>
        <div class="wrapped-mes-lista">${filas}</div>
      </div>`
    });
  }

  if(serieMensualIngresoGasto){
    _wrappedMesChart = { meses: serieMensualIngresoGasto, fmt2 };
    slides.push({
      id: 'grafico-mensual',
      html: `<div class="wrapped-slide-inner wrapped-slide-inner-wide">
        <div class="wrapped-eyebrow">Mes a mes</div>
        <div class="wrapped-headline">Así se movió tu plata.</div>
        <div class="wrapped-chart-card">${_wrappedGraficoMensualSvg(serieMensualIngresoGasto)}</div>
        <div class="wrapped-mes-detalle">${_wrappedMesDetalleHtml(serieMensualIngresoGasto, serieMensualIngresoGasto.length-1, fmt2)}</div>
      </div>`
    });
  } else {
    _wrappedMesChart = null;
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

  // ─── Pool de insights con scoring (ver comentario arriba de
  // `_wrappedScoreInsight`) — cada candidato trae su HTML ya armado más
  // las banderas para puntuarlo. Se arma la lista completa, se puntúa, se
  // ordena de mayor a menor, y solo entran los primeros
  // `WRAPPED_MAX_INSIGHTS_POOL` a la historia final.
  const candidatosInsights = [];

  if(encargosAnio){
    candidatosInsights.push({
      involucraPersona: true,
      intensidad: Math.min(4, encargosAnio.nPersonas),
      html: _wrappedSlideBignum('Plata que te encargaron cuidar', '', encargosAnio.totalEncargado, 'var(--purple)', {
        sub: _wrappedCopyEncargos(encargosAnio)
      })
    });
  }

  if(prestadoAnio && prestadoAnio.totalPrestado > 0){
    candidatosInsights.push({
      involucraPersona: true,
      esRecord: !!prestadoAnio.topDeudor,
      intensidad: prestadoAnio.totalDevuelto > 0 ? 2 : 1,
      html: _wrappedSlideBignum('Le prestaste a otros', '', prestadoAnio.totalPrestado, 'var(--blue)', {
        sub: _wrappedCopyPrestado(prestadoAnio)
      })
    });
  }

  if(misDeudasAnio && misDeudasAnio.totalRecibido > 0){
    candidatosInsights.push({
      intensidad: 1,
      html: _wrappedSlideBignum('Te prestaron a vos', '', misDeudasAnio.totalRecibido, 'var(--blue)', {
        sub: _wrappedCopyMisDeudas(misDeudasAnio)
      })
    });
  }

  if(mesadaAnio){
    candidatosInsights.push({
      intensidad: 1, // es un ingreso esperado y recurrente, no una sorpresa
      html: _wrappedSlideBignum('Tu mesada del año', '', mesadaAnio.total, 'var(--accent)', {
        sub: _wrappedCopyMesada(mesadaAnio)
      })
    });
  }

  if(spotifyAnio){
    const color = spotifyAnio.balance >= 0 ? 'var(--accent)' : 'var(--red)';
    candidatosInsights.push({
      involucraPersona: true,
      esRecord: spotifyAnio.balance !== 0,
      intensidad: 2,
      html: _wrappedSlideBignum('Administrar Spotify te dejó', '', spotifyAnio.balance, color, {
        signed: true, sub: _wrappedCopySpotify(spotifyAnio)
      })
    });
  }

  if(comprometidaAnio){
    candidatosInsights.push({
      esRecord: true, // ya pasó el filtro de `recibido:true` — es un evento real, no un promedio
      intensidad: 2,
      html: _wrappedSlideBignum('Plata comprometida que llegó', '', comprometidaAnio.total, 'var(--amber)', {
        sub: _wrappedCopyComprometida(comprometidaAnio)
      })
    });
  }

  if(metaCajita){
    candidatosInsights.push({
      involucraMeta: true,
      esRecord: metaCajita.prog.pct >= 100,
      intensidad: metaCajita.prog.pct >= 100 ? 4 : 2,
      html: _wrappedSlideBignum(`Tu meta "${escHtml(metaCajita.nombre)}"`, '', metaCajita.prog.pct, 'var(--accent)', {
        sufijo: '%', sub: _wrappedCopyMeta(metaCajita)
      })
    });
  }

  if(comparaciones){
    candidatosInsights.push({
      intensidad: comparaciones.intensidadMax,
      html: `<div class="wrapped-slide-inner">
        <div class="wrapped-eyebrow">Números que se entienden mejor así</div>
        <div class="wrapped-headline">Un poco de contexto.</div>
        ${_wrappedFrasesHtml(comparaciones.frases)}
      </div>`
    });
  }

  if(suscripciones){
    const filas = [];
    if(suscripciones.spotify){
      filas.push(`Spotify compartido: ${fmt2(suscripciones.spotify.costoMensual)} al mes entre ${suscripciones.spotify.personas} persona${suscripciones.spotify.personas===1?'':'s'}.`);
    }
    suscripciones.personales.forEach(p => filas.push(`${escHtml(p.desc)}: ${fmt2(p.monto)} al mes.`));
    candidatosInsights.push({
      intensidad: 1,
      html: `<div class="wrapped-slide-inner">
        <div class="wrapped-eyebrow">Tus gastos que aparecen cada mes sin pedir permiso</div>
        <div class="wrapped-headline">Suscripciones y recurrentes.</div>
        ${_wrappedFrasesHtml(filas)}
      </div>`
    });
  }

  if(recuperacion){
    candidatosInsights.push({
      involucraPersona: true,
      esRecord: true,
      intensidad: Math.max(0, Math.min(4, (30 - recuperacion.dias) / 6)),
      html: `<div class="wrapped-slide-inner">
        <div class="wrapped-eyebrow">El regreso triunfal</div>
        <div class="wrapped-headline">${_wrappedNombrePersona(recuperacion.personaId, recuperacion.nombre)}</div>
        <div class="wrapped-bignum" style="color:var(--accent);">${recuperacion.dias}</div>
        <div class="wrapped-sub">día${recuperacion.dias===1?'':'s'} para devolverte por completo lo que le prestaste.</div>
      </div>`
    });
  }

  if(descubrimientos){
    candidatosInsights.push({
      intensidad: 1,
      html: `<div class="wrapped-slide-inner">
        <div class="wrapped-eyebrow">Cosas que probablemente no sabías</div>
        <div class="wrapped-headline">Un poco de trivia sobre tu año.</div>
        ${_wrappedFrasesHtml(descubrimientos)}
      </div>`
    });
  }

  if(recordsAnio){
    candidatosInsights.push({
      esRecord: true,
      intensidad: 3,
      html: `<div class="wrapped-slide-inner">
        <div class="wrapped-eyebrow">Lo más extremo</div>
        <div class="wrapped-headline">Lo más extremo del período.</div>
        ${_wrappedRecordsHtml(recordsAnio, fmt2)}
      </div>`
    });
  }

  if(gastoRandom){
    candidatosInsights.push({
      esRecord: true, // ya pasó el propio filtro de z-score de `_wrappedGastoMasRandom`
      intensidad: gastoRandom.z, // reutiliza el mismo z ya calculado, nunca uno nuevo
      html: `<div class="wrapped-slide-inner">
        <div class="wrapped-eyebrow">Premio al gasto más inesperado</div>
        <div class="wrapped-headline">🏆 ${escHtml(gastoRandom.desc)}</div>
        <div class="wrapped-bignum" data-value="${gastoRandom.monto}" style="color:var(--purple);">0</div>
        <div class="wrapped-sub">No esperábamos verte por acá este año.</div>
      </div>`
    });
  }

  if(protagonistas && protagonistas.top && protagonistas.top.n >= 3){
    const nombre = _wrappedNombrePersona(protagonistas.top.personaId, protagonistas.top.nombre);
    candidatosInsights.push({
      involucraPersona: true,
      intensidad: Math.min(4, protagonistas.top.n / 5),
      html: `<div class="wrapped-slide-inner">
        <div class="wrapped-eyebrow">Tu protagonista del año</div>
        <div class="wrapped-headline">${nombre}</div>
        <div class="wrapped-sub">${protagonistas.top.n} movimientos juntos entre préstamos, encargos o Spotify${protagonistas.total>1?` — de ${protagonistas.total} personas con las que tuviste actividad`:''}.</div>
      </div>`
    });
  }

  if(cambioHabitos){
    candidatosInsights.push({
      esCambioComportamiento: true,
      intensidad: 3,
      html: `<div class="wrapped-slide-inner">
        <div class="wrapped-eyebrow">Cambiaste de hábitos a mitad de año</div>
        <div class="wrapped-headline">De <b>${escHtml(cambioHabitos.catPrimera)}</b> a <b>${escHtml(cambioHabitos.catSegunda)}</b></div>
        <div class="wrapped-sub">tu categoría más fuerte pasó de una a otra entre la primera y la segunda mitad del año.</div>
      </div>`
    });
  }

  if(fasesAnio){
    candidatosInsights.push({
      esCambioComportamiento: true,
      intensidad: 3,
      html: `<div class="wrapped-slide-inner">
        <div class="wrapped-eyebrow">Tu año tuvo dos etapas</div>
        <div class="wrapped-sub">${_wrappedCopyFases(fasesAnio)}</div>
      </div>`
    });
  }

  candidatosInsights
    .map(c => ({ ...c, score: _wrappedScoreInsight(c) }))
    .sort((a,b) => b.score - a.score) // sort estable: empates conservan el orden en que se agregaron arriba
    .slice(0, WRAPPED_MAX_INSIGHTS_POOL)
    .forEach((c, i) => slides.push({ id: 'insight-' + i, html: c.html }));

  if(personalidad){
    slides.push({
      id: 'personalidad',
      html: `<div class="wrapped-slide-inner">
        <div class="wrapped-eyebrow">Tu personalidad financiera</div>
        <div class="wrapped-headline">${escHtml(personalidad.tipo.toUpperCase())}</div>
        <div class="wrapped-sub">${escHtml(personalidad.frase)}</div>
      </div>`
    });
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
    id: 'frase-anio',
    html: `<div class="wrapped-slide-inner">
      <div class="wrapped-eyebrow">Tu ${anioK} en una frase</div>
      <div class="wrapped-headline">"${fraseAnio}"</div>
    </div>`
  });

  slides.push({
    id: 'periodo-en-numeros',
    html: `<div class="wrapped-slide-inner">
      <div class="wrapped-eyebrow">Tu ${anioK} en números</div>
      <div class="wrapped-headline">El resumen rápido.</div>
      ${_wrappedRecordsHtml(_wrappedPeriodoEnNumeros(S, anioK, s, prestadoAnio, serieMensualIngresoGasto), fmt2)}
    </div>`
  });

  // "Si tu año fuera una película" siempre tiene ALGO que decir (hasta su
  // fallback es una frase honesta, no una inventada) — por eso se agrega
  // DESPUÉS de la guarda `huboAlgo`: si no hubo ningún dato real este año,
  // no debe ser esta frase decorativa la que rompa el estado vacío de
  // "Todavía no hay mucho que contar".
  slides.push({
    id: 'si-tu-anio-fuera',
    html: `<div class="wrapped-slide-inner">
      <div class="wrapped-eyebrow">Si tu año financiero fuera una película...</div>
      <div class="wrapped-sub">${_wrappedSiTuAnioFuera({ fasesAnio, cambioHabitos, racha, patrimonio })}</div>
    </div>`
  });

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
  if(el.querySelector('.wrapped-mensual-svg')){
    _wrappedSetupGraficoMensual(el);
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
    // Un tap sobre una zona de mes del gráfico interactivo (ver
    // `_wrappedGraficoMensualSvg`) selecciona ese mes en vez de navegar de
    // slide — se resuelve ANTES que la lista de "interactivo" de abajo
    // porque el hitzone es un <rect> dentro del SVG, no un elemento de
    // formulario.
    const mesHit = e.target.closest && e.target.closest('[data-wrapped-mesidx]');
    if(mesHit){
      const slideEl = mesHit.closest('.wrapped-slide');
      _wrappedSeleccionarMes(slideEl, parseInt(mesHit.getAttribute('data-wrapped-mesidx'),10));
      return;
    }
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
  _wrappedBankPick,
  _wrappedIniciarBanco,
  _wrappedHashStr,
  _wrappedSeededRandom,
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
  _wrappedNombrePersona,
  _wrappedMesadaMes,
  _wrappedIngresosFijosMes,
  _wrappedCuotaAnioFallback,
  _wrappedListaCajitas,
  _wrappedPersonalidad,
  _wrappedGastoMasRandom,
  _wrappedProtagonistas,
  _wrappedMetaCajita,
  _wrappedCopyMeta,
  _wrappedCorteMitadAnio,
  _wrappedCambioFuerte,
  _wrappedFasesAnio,
  _wrappedCopyFases,
  _wrappedSiTuAnioFuera,
  _wrappedHistoriasMensuales,
  _wrappedLineaMes,
  _wrappedScoreInsight,
  _wrappedItemsRealesPeriodo,
  _wrappedSerieMensualIngresoGasto,
  _wrappedGraficoMensualSvg,
  _wrappedMesDetalleHtml,
  _wrappedComparaciones,
  _wrappedAlcanciaDepositosPeriodo,
  _wrappedSuscripciones,
  _wrappedRecuperacionMasRapida,
  _wrappedDescubrimientos,
  _wrappedRecordsAnio,
  _wrappedPersonasInvolucradas,
  _wrappedPeriodoEnNumeros,
  _wrappedFraseDelAnio
};

})();
