// js/core/persistencia.js
//
// Carga, guardado y formatos de entrada: fmtInput/setMoneyInput/parseMoney/parsePct, clase efectiva de movimientos, migraciones de esquema, load() y save().
// Parte del antiguo core-state.js (dividido por responsabilidad). Clásico (<script defer>), sin type="module": sus globales son
// léxicos de script clásico. El ORDEN de carga en index.html es el de esta lista: estado → cuentas-fuentes → persistencia →
// patrimonio → ingresos → dialogos → utilidades-ui → refresh.

/* ---- LOAD / SAVE ---- */
function fmtInput(n){
  // Número → texto para un campo de plata (.money-input): enteros sin decimales ("500.000"), con decimales
  // siempre 2 ("1.234,50"). Es el mismo formato que deja el formateo al escribir (js/core/money-input.js).
  if(!n&&n!==0)return'';
  const num=parseFloat(n);
  if(isNaN(num)||num===0)return'';
  const cents=Math.round(Math.abs(num)*100);
  const intPart=String(Math.floor(cents/100)).replace(/\B(?=(\d{3})+(?!\d))/g,'.');
  const decPart=cents%100;
  return (num<0?'-':'')+intPart+(decPart?','+String(decPart).padStart(2,'0'):'');
}

// ÚNICA forma de precargar un valor en un input de plata (.money-input) desde JS: lo deja formateado igual que
// cuando el usuario escribe ("80.000", no "80000"). Asignar `input.value = n` directo se ve sin separador de miles,
// porque el formateo de money-input.js solo corre en el evento 'input'. Acepta el elemento o su id; n vacío/0/NaN limpia
// el campo. { evento: true } además avisa 'input' para que se actualicen las vistas previas del sheet.
function setMoneyInput(elOrId,n,opts){
  const el=typeof elOrId==='string'?document.getElementById(elOrId):elOrId;
  if(!el)return;
  el.value=fmtInput(n);
  if(opts&&opts.evento)el.dispatchEvent(new Event('input',{bubbles:true}));
}

// Clase guardada de un movimiento ('ingreso' | 'gasto' | 'neutro' | 'ajuste'), o null si no la tiene.
// Es la ÚNICA fuente de verdad: no hay reglas de respaldo que la deduzcan de etiquetas o textos (se retiraron el 2026-10-13: la
// app nace limpia y tests/nucleo.test.js, bloque `clase-cobertura`, exige que todo escritor la ponga al crear el movimiento).
function claseEfectivaMovimiento(m){
  return m && _claseValida(m.clase) ? m.clase : null;
}

// Movimientos y gastos que llegaron SIN clase válida (un módulo no la escribió). Las salidas de espejo no la necesitan:
// ningún lector de ingreso o gasto las consulta. Lo usa save() para avisar, igual que Libro.verificar() con los saldos.
function movimientosSinClase(estado){
  const st = estado || S, out = [];
  (st.movimientos || []).forEach(m => {
    if(m && typeof m === 'object' && m.tipo !== 'salida' && !_claseValida(m.clase)) out.push({ lista: 'movimientos', id: m.id, tipo: m.tipo, desc: m.desc });
  });
  (st.gastosVar || []).forEach(g => {
    if(g && typeof g === 'object' && !_claseValida(g.clase)) out.push({ lista: 'gastosVar', id: g.id, desc: g.desc });
  });
  return out;
}

/* ---- VERSIÓN DEL MODELO DE DATOS ----
   Esta versión de la app nació limpia en el esquema 9 (2026-10-18): NO migra datos de versiones anteriores y no arrastra
   migraciones antiguas (las de las versiones 8 y 9 se plegaron en el modelo actual: una sola tasa de Nu, y todo
   Spotify en S.spotify). Quien trae datos de un esquema menor los ve marcados (S._esquemaAnterior) y empieza de cero
   (Configuración → Borrar todo); un backup de esa versión se rechaza al importar.

   Para cambiar la forma de los datos guardados en el futuro: sumar { v: N+1, nombre, fn(d) } al final de MIGRACIONES. `fn`
   recibe el objeto de datos y lo modifica en sitio; debe ser idempotente. Nunca editar ni reordenar una existente. Corren UNA
   vez, en orden, sobre el estado cargado de Firestore y, vía aplicarMigraciones(), sobre un backup JSON antes de importarlo.
   La versión guardada vive en S.schemaVersion. */
const SCHEMA_BASE = 10;    // primera versión compatible (y la actual mientras MIGRACIONES esté vacía)
const MIGRACIONES = [];
const SCHEMA_VERSION_ACTUAL = MIGRACIONES.length ? MIGRACIONES[MIGRACIONES.length - 1].v : SCHEMA_BASE;

function aplicarMigraciones(d) {
  if (!d || typeof d !== 'object') return d;
  const actual = Number(d.schemaVersion) || 0;
  if (actual > SCHEMA_VERSION_ACTUAL) {
    console.warn('[migraciones] datos de una versión más nueva (' + actual + ' > ' + SCHEMA_VERSION_ACTUAL + '): no se tocan');
    return d;
  }
  if (actual === 0) { d.schemaVersion = SCHEMA_BASE; } // datos nuevos: nacen en la versión base
  else if (actual < SCHEMA_BASE) { d._esquemaAnterior = actual; return d; } // incompatible: se marca y no se toca
  MIGRACIONES.filter(m => m.v > (Number(d.schemaVersion) || 0)).sort((a, b) => a.v - b.v).forEach(m => {
    try { m.fn(d); d.schemaVersion = m.v; }
    catch (e) { console.error('[migraciones] falló v' + m.v + ' (' + m.nombre + '):', e); throw e; }
  });
  return d;
}

// S.spotify siempre existe y trae sus cuatro campos (como _ensureMesadas con S.mesadas): el resto de la app lo lee sin guardas.
function _ensureSpotify(){
  if(!S.spotify||typeof S.spotify!=='object'||Array.isArray(S.spotify))S.spotify={};
  if(!Array.isArray(S.spotify.personas))S.spotify.personas=[];
  if(!Array.isArray(S.spotify.historial))S.spotify.historial=[];
  if(typeof S.spotify.costo!=='number')S.spotify.costo=Number(S.spotify.costo)||0;
  // `fuenteId`: cuenta o cajita donde guarda la plata de Spotify ('cajita:ID' | 'cuenta:ID'); '' = ninguna.
  if(typeof S.spotify.fuenteId!=='string')S.spotify.fuenteId='';
}

/* ---- REGISTRO DE SONDAS (huella de invariantes) ----
   js/core/huella.js se carga BAJO DEMANDA (grupo 'cierre' del Loader: solo al abrir Configuración), mientras que los módulos con historia
   (tarjetas, encargos, alcancía, Wrapped) se precargan al arrancar. Por eso no pueden llamar a Huella.registrar directamente: llegarían
   antes que ella. Llaman a esto: si Huella ya existe registra la sonda; si no, la deja en cola y huella.js la registra al cargarse.
   Así el orden de carga no importa. Una sonda nueva se registra siempre con registrarSonda, nunca con Huella.registrar. */
function registrarSonda(nombre, fn){
  if(typeof Huella !== 'undefined' && typeof Huella.registrar === 'function') Huella.registrar(nombre, fn);
  else (window._sondasPendientes || (window._sondasPendientes = [])).push([nombre, fn]);
}

/* ---- ESTADO AISLADO (huella / cierre de períodos) ----
   conEstadoAislado(estado, fn) ejecuta `fn` SÍNCRONA con `estado` como el S global y lo restaura siempre al terminar. Existe para
   poder calcular la huella de invariantes (js/core/huella.js) y la vista previa del cierre (js/core/cierre.js) sobre una COPIA con
   las mismas funciones de la app (calcPatrimonioDesglose, Deudas, calcC… leen el S global): así no hay una segunda versión de
   ninguna regla contable solo para comparar. Mientras dura, window._estadoAislado es true y save()/_fbSaveToCloud() no escriben
   nada: un estado de prueba nunca llega a la nube. Si `fn` devuelve una promesa lanza error (su continuación correría con el S real). */
function conEstadoAislado(estado, fn){
  if(!estado||typeof estado!=='object')throw new Error('conEstadoAislado: se necesita un estado (objeto)');
  if(typeof fn!=='function')throw new Error('conEstadoAislado: se necesita una función');
  if(estado===S)return fn();
  const prev=S,prevFlag=window._estadoAislado;
  let r;
  S=estado;window.S=estado;window._estadoAislado=true;
  try{r=fn();}
  finally{S=prev;window.S=prev;window._estadoAislado=prevFlag;}
  if(r&&typeof r.then==='function')throw new Error('conEstadoAislado: la función debe ser síncrona');
  return r;
}

function load(){
  // Firebase version: datos ya cargados en S por _fbLoadData()
  // Solo inicializamos campos faltantes y sincronizamos el DOM
  aplicarMigraciones(S);
  _ensureSpotify();
  if(S._esquemaAnterior && typeof toast==='function')
    toast('Estos datos son de una versión anterior (esquema '+S._esquemaAnterior+') y esta versión empieza de cero. Exporta un backup si lo quieres y usa la opción «Borrar todo» de Configuración.','err',12000);
  if(!S.encargos)S.encargos=[];
  if(!S.movimientos)S.movimientos=[];
  if(!Array.isArray(S.libro))S.libro=[];
  _cuentasArr(); // garantiza que S.cuentas sea un arreglo (ver "CUENTAS: MODELO ÚNICO")
  if(!S.catsVar)S.catsVar=[];
  if(!S.catsFijo)S.catsFijo=[];
  if(!S.patrimonioHistorial)S.patrimonioHistorial=[];
  if(!S.patrimonioCierres||typeof S.patrimonioCierres!=='object')S.patrimonioCierres={};
  if(!S.personas)S.personas=[];
  if(!S.ingresosFijos)S.ingresosFijos=[];
  if(!S.misDeudas)S.misDeudas=[];
  if(!S.config)S.config={};
  if(!S.config.proteccionAntiguedad)S.config.proteccionAntiguedad={diasAviso:90,diasBloqueo:365};
  // Backfill por módulo: agrega los umbrales de cualquier módulo que todavía
  // no exista en la config YA GUARDADA (cuentas con datos de antes de que ese
  // módulo tuviera su propia entrada) sin pisar valores que el usuario haya
  // ajustado a mano en los que ya existen. Antes esto solo corría si
  // proteccionAntiguedad faltaba por completo, así que agregar un módulo
  // nuevo (ver alcancia/plata_comprometida, 2026-09-01) nunca llegaba a una
  // cuenta con datos ya guardados — ver CHANGELOG.md#alcancía.
  const _paDefaults={spotify:{opsAviso:2,opsBloqueo:5},mesada:{opsAviso:2,opsBloqueo:5},prestamos:{opsAviso:2,opsBloqueo:5},encargos:{opsAviso:2,opsBloqueo:5},tarjetas:{opsAviso:2,opsBloqueo:5},cuentas:{opsAviso:2,opsBloqueo:5},gastos:{opsAviso:2,opsBloqueo:5},alcancia:{opsAviso:2,opsBloqueo:5},plata_comprometida:{opsAviso:2,opsBloqueo:5}};
  Object.keys(_paDefaults).forEach(k=>{ if(!S.config.proteccionAntiguedad[k])S.config.proteccionAntiguedad[k]=_paDefaults[k]; });
  // Sincronizar color de misDeudas desde la persona vinculada (fuente de verdad)
  // load() puede correr antes de que calc-helpers.js (donde vive Deudas) haya cargado: guard.
  (typeof Deudas !== 'undefined' ? Deudas.lista('contra') : (S.misDeudas || [])).forEach(d => {
    if (d.personaId && S.personas) {
      const p = S.personas.find(x => x.id === d.personaId);
      if (p && p.color) d.color = p.color;
    }
  });
  recalcularMontoBaseHistorial();
  if(S.cajitas){
    S.cajitas=S.cajitas.map(c=>{
      if(!c.cdts)c.cdts=[];
      if(!c.fecha)c.fecha=hoy();
      return c;
    });
  }
  if(S.gastosFijos){S.gastosFijos=S.gastosFijos.filter(x=>!(x.id==='gf1'&&x.nombre==='Spotify Premium'&&(x.monto||0)===0));}
  if(!S.pagosGastosFijos)S.pagosGastosFijos={};
  if(typeof _getCuotaAnio==='function'){
    if(document.getElementById('mesadaMontoPapa'))document.getElementById('mesadaMontoPapa').value=fmtInput(_getCuotaAnio('papa',S.mesadaAnio||new Date().getFullYear()));
    if(document.getElementById('mesadaMontoMama'))document.getElementById('mesadaMontoMama').value=fmtInput(_getCuotaAnio('mama',S.mesadaAnio||new Date().getFullYear()));
  }
  document.getElementById('spotifyCosto').value=fmtInput(S.spotify.costo);
  document.getElementById('gv_fecha').value=hoy();
  document.getElementById('mov_fecha').value=hoy();
}

function parseMoney(v){
  if(!v&&v!==0)return 0;
  if(typeof v==='number')return v;
  const s=String(v).trim();
  if(!s)return 0;
  // Format: "1.234,56" → remove dots (thousands), replace comma with dot
  return parseFloat(s.replace(/\./g,'').replace(',','.'))||0;
}

function parsePct(v){
  if(!v&&v!==0)return 0;
  if(typeof v==='number')return v;
  const s=String(v).trim();
  if(!s)return 0;
  if(s.includes(','))return parseFloat(s.replace(',','.'))||0;
  return parseFloat(s)||0;
}

// (window._fbSaveTimer lo gestiona el módulo Firebase — no declarar aquí)

function save(){
  // Estado aislado (conEstadoAislado): nunca se guarda un estado de prueba.
  if(window._estadoAislado)return;
  // PROTECCIÓN: no guardar si los datos aún no se han cargado desde Firebase.
  // Esto evita sobreescribir datos válidos con el estado inicial vacío.
  if(window._fbLoadData && !window._dataLoaded) {
    console.warn('[save] Bloqueado: datos de Firebase aún no cargados.');
    return;
  }
  // Cuota mensual por año — guardada en S.mesadas[parent].cuotas[anio]
  // Cuotas de Mesada y costo de Spotify: los inputs escriben directo en S (ver
  // _bindInputsAS() en navegacion.js); save() ya no lee nada del DOM.
  if(typeof _ensureMesadas==='function')_ensureMesadas();
  // Las cajitas ya no tienen inputs en el DOM (nombre, saldo y CDT se editan por sheets que
  // escriben directo en S): save() solo normaliza lo que vive en S.
  (S.cajitas||[]).forEach(c=>{
    if(!c.fecha)c.fecha=hoy();
  });
  // La clase de cada movimiento la escribe el módulo que lo crea (no hay deducción de respaldo). Si alguno llega sin ella se
  // avisa UNA vez por sesión (consola; detalle en window._movimientosSinClase): sin clase un movimiento no cuenta como ingreso.
  {
    const _sc = movimientosSinClase(S);
    window._movimientosSinClase = _sc;
    if(_sc.length && !window._claseAvisada){
      window._claseAvisada = true;
      console.warn('[clase] ' + _sc.length + ' movimiento(s) sin clase: revisar qué módulo los creó.', _sc);
    }
  }
  // Invariante del libro: saldo guardado == suma de S.libro. Un descuadre significa que algún código movió un saldo
  // sin pasar por sumarFuente/descontarFuente/ajustarSaldoCuenta. Se avisa UNA vez por sesión (consola + aviso).
  {
    const _lv=Libro.verificar();
    window._libroDescuadres=_lv.ok?[]:_lv.descuadres;
    if(!_lv.ok&&!window._libroAvisado){
      window._libroAvisado=true;
      console.warn('[libro] el saldo guardado no coincide con la suma del libro:',_lv.descuadres);
      if(typeof toast==='function')toast('El libro no cuadra con el saldo de '+_lv.descuadres.map(f=>f.nombre).join(', ')+' (ver consola).','err',6000);
    }
  }
  snapshotPatrimonio();
  // Guardar en Firebase con debounce de 1.5s
  if(typeof window._fbSaveToCloud === 'function') {
    window._fbSaveToCloud();
  }
}
