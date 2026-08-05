/* ═══════════════════════════════════════════════════════════════
   js/core/calc-helpers.js

   Funciones de cálculo puras (solo dependen de `S`/`MC`, sin DOM ni UI)
   que Inicio (inicio.js) necesita para "Necesita atención" y el
   health score, pero que conceptualmente "viven" en mesada.js y
   tarjetas_credito.js — módulos que ahora son lazy (ver
   js/core/lazy-loader.js) y solo cargan cuando el usuario visita
   esas pantallas.

   Por qué existe este archivo: forzar la carga de esos dos módulos
   completos (44KB + 60KB) desde Inicio solo para leer 2-3 números
   anulaba el beneficio de haberlos vuelto lazy — con este archivo,
   Inicio tiene lo que necesita sin arrastrar el resto (botones,
   sheets, wiring de esas pantallas). Ver CHANGELOG.md.

   Este archivo carga de entrada (<script defer>, sin passar por
   Loader), justo después de core-state.js — ver orden de <script>
   en index.html. mesada.js y tarjetas_credito.js YA NO definen estas
   funciones: las usan como globales definidas acá. Por eso este
   archivo tiene que estar cargado ANTES que ellos (irrelevante en la
   práctica ya que son lazy y cargan mucho después, pero se respeta
   el mismo criterio de orden que el resto de la app).
   ═══════════════════════════════════════════════════════════════ */

/* ---- Mesada (antes en mesada.js) ---- */
function _ensureMesadas(){
  if(!S.mesadas)S.mesadas={papa:{cuotas:{},pagos:{}},mama:{cuotas:{},pagos:{}}};
  ['papa','mama'].forEach(p=>{
    if(!S.mesadas[p])S.mesadas[p]={cuotas:{},pagos:{}};
    if(!S.mesadas[p].cuotas)S.mesadas[p].cuotas={};
    if(!S.mesadas[p].pagos)S.mesadas[p].pagos={};
  });
}

function getMesadaData(parent){
  _ensureMesadas();
  return S.mesadas[parent].pagos;
}

function _getCuotaAnio(parent,anio){
  _ensureMesadas();
  const cuotas=S.mesadas[parent].cuotas;
  const key=String(anio);
  if(cuotas[key])return cuotas[key];
  // Buscar el año más cercano hacia atrás
  const anios=Object.keys(cuotas).map(Number).sort((a,b)=>b-a);
  for(const a of anios){ if(a<=anio)return cuotas[String(a)]; }
  // Fallback al más antiguo disponible
  if(anios.length)return cuotas[String(anios[anios.length-1])];
  return 80000;
}

// Formatea una clave "2026-4" → "Mayo 2026" (depende de MC, la lista de
// nombres de mes definida en el núcleo de index.html — no de S).
function _mesNombreDeKey(key){
  const partes=String(key).split('-');
  const anio=partes[0];
  const mesIdx=parseInt(partes[1],10)||0;
  return (MC[mesIdx]||'')+' '+anio;
}

/* ---- Tarjetas de crédito (antes en tarjetas_credito.js) ---- */
function getTCById(id){ return (S.tarjetasCredito||[]).find(x=>x.id===id); }

function tcCupoUsadoPct(tc){
  const cupo=tc.cupo||0;
  if(!cupo) return 0;
  return Math.min(100,((tc.deuda||0)/cupo)*100);
}

function tcCupoDisponible(tc){
  return Math.max(0,(tc.cupo||0)-(tc.deuda||0));
}
