// Núcleo de la app: estado global S, load()/save(), motor de mover plata
// (descontarFuente/sumarFuente/getFuentes/getSaldoFuente), helpers usados
// por absolutamente todos los módulos (fmt, fmtNoCents, uid, hoy, escHtml,
// mesKey, parseMoney, parsePct, toast, dialogo), calcPatrimonioTotal/
// snapshotPatrimonio, los helpers centralizados _esGastoVarNoReal/
// _esEntradaEspejoNoIngreso, y la definición BASE de refresh() (se wrappea
// después, ver js/core/gastos-fijos-progress.js y js/core/mejoras.js) —
// extraído de index.html. Debe cargar ANTES que cualquier módulo de
// js/modules/ (todos asumen que S/fmt/uid/etc. ya existen como globales).
// No exportar como type="module": el resto del archivo depende de que
// estas sean variables globales léxicas normales de script clásico.
// Ver auditoria-tecnica.md #1/#4 y CHANGELOG.md#infraestructura--seguridad.

/* ---- MOTOR DE DIFERENCIAL: migrado a js/core/diferencial.js (diffRegistrarInstancia,
   diffInst, diffReset, diffToggle, diffEstaAbierto, diffAddParte, diffRemoveParte,
   diffSetNombre, diffSetMonto, diffTogglePagoYo, diffSetCuentaSalida, diffSetCuentaEntrada).
   Se carga justo después de js/core/events.js — ver ese archivo para el detalle completo,
   incluida la nota de por qué se carga tan temprano. buildFuentesOptsHtml() se queda acá
   abajo: es canónica y la usan muchos módulos más, no es exclusiva de este motor. ---- */

/**
 * buildFuentesOptsHtml — función canónica para generar <option>s de fuentes.
 * Reemplaza: getFuentesOptions, _diffFuentesOptsHtml, poblarFuente,
 *            _cpPoblarCuentas (y sirve de base para las variantes de encargos).
 *
 * @param {Object}  opts
 * @param {string}  [opts.selectedVal='']         Valor a pre-seleccionar.
 * @param {boolean} [opts.soloConSaldo=false]      Omitir fuentes con saldo <= 0.
 * @param {boolean} [opts.incluirTC=true]          Incluir tarjetas de crédito.
 * @param {boolean} [opts.mostrarSaldo=false]      Mostrar saldo entre paréntesis.
 * @param {string}  [opts.placeholder='Sin especificar']  Texto del option vacío.
 * @param {Array}   [opts.fuentesCustom=null]      Lista custom (ej: cuentas de encargo).
 *                  Cada item debe tener { val, label } o { cuenta, label, saldo }.
 */
function buildFuentesOptsHtml({
  selectedVal = '',
  soloConSaldo = false,
  incluirTC = true,
  mostrarSaldo = false,
  placeholder = 'Sin especificar',
  fuentesCustom = null
} = {}) {
  const fuentes = fuentesCustom ?? (incluirTC ? getFuentes() : getFuentesSinTC());
  const opts = fuentes
    .map(f => {
      const val   = f.val ?? f.cuenta;
      const saldo = mostrarSaldo || soloConSaldo ? (f.saldo !== undefined ? f.saldo : getSaldoFuente(val)) : 0;
      if (soloConSaldo && saldo <= 0) return null;
      const label = mostrarSaldo ? `${f.label} (${fmt(saldo)})` : f.label;
      return `<option value="${val}"${val === selectedVal ? ' selected' : ''}>${label}</option>`;
    })
    .filter(Boolean)
    .join('');
  return `<option value="">${placeholder}</option>${opts}`;
}

/* ---- Resto del motor de Diferencial (diffRenderPartes, diffCalcular, diffResumen,
   _diffActualizarMiCuenta, diffValidarIntercambios, diffAplicar, diffHtmlBloque,
   diffRenderHistorial, _difRenderHistorial, _diffFuentesOptsHtml, _diffInstancias) ----
   migrado a js/core/diferencial.js. Ver comentario ahí para el detalle de qué se
   migró exactamente (incluida la limpieza de onclick/oninput/onchange en
   diffRenderPartes/diffHtmlBloque). ---- */
const MC=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const CATS_VAR_DEFAULT=['Alimentación','Transporte','Salud','Entretenimiento','Ropa','Hogar','Educación','Servicios','Cuidado personal','Otro'];
const CATS_FIJO_DEFAULT=['Vivienda','Transporte','Alimentación','Entretenimiento','Salud','Educación','Servicios','Suscripciones','Otro'];
const MAX=10;

// Retorna las categorías actuales (default + personalizadas guardadas en S)
function getCatsVar(){return S.catsVar&&S.catsVar.length?S.catsVar:[...CATS_VAR_DEFAULT];}
function getCatsFijo(){return S.catsFijo&&S.catsFijo.length?S.catsFijo:[...CATS_FIJO_DEFAULT];}

function poblarCatSelect(selectId, cats, valorActual){
  const sel=document.getElementById(selectId);
  if(!sel)return;
  sel.innerHTML=cats.map(c=>`<option value="${c}"${c===valorActual?' selected':''}>${c}</option>`).join('');
}

let S={
  nuRate:9.25,cajitas:[],nequiSaldo:0,efectivoSaldo:0,
  personas:[],
  deudores:[],misDeudas:[],mesadas:{papa:{cuotas:{},pagos:{}},mama:{cuotas:{},pagos:{}}},mesadaAnio:new Date().getFullYear(),
  spotifyPersonas:[],spotifyCosto:0,spotifyCajitaId:'',spotifyHistorial:[],
  gastosFijos:[],
  pagosGastosFijos:{},
  gastosVar:[],
  encargos:[],
  movimientos:[],
  modulos:{mesada:true,spotify:true},
  catsVar:[],
  catsFijo:[],
  cuentasPersonalizadas:[],
  patrimonioHistorial:[],
  tarjetasCredito:[],
  ingresosFijos:[],
  alcancia:null,
  config:{
    proteccionAntiguedad:{
      diasAviso:90,
      diasBloqueo:365,
      spotify:{opsAviso:2,opsBloqueo:5},
      mesada:{opsAviso:2,opsBloqueo:5},
      prestamos:{opsAviso:2,opsBloqueo:5},
      encargos:{opsAviso:2,opsBloqueo:5},
      tarjetas:{opsAviso:2,opsBloqueo:5},
      cuentas:{opsAviso:2,opsBloqueo:5},
      gastos:{opsAviso:2,opsBloqueo:5}
    }
  }
  // alcancia: {saldoRegistrado, depositos, fechaInicio, movimientos:[{id,monto,fecha,fuenteOrigen,ts}], historial:[...]}
  // alcanciaSaldoOfuscado: string (XOR+Base64 del JSON {saldo:N}) — guardado en S pero no visible en UI
  // ingresosFijos: [{id, nombre, monto, desde}]
  // desde: 'YYYY-MM' — el mes desde el cual aplica este ingreso (para escalar en el futuro)
  // tarjetasCredito: [{id, nombre, cupo, deuda, fechaCorte (1-28), fechaPago (1-28), color, icono, compras:[{id,desc,monto,fecha,cat,pagadoEnTC:false}], pagos:[{id,monto,fecha,fuente,nota}]}]
  // personas: [{id, nombre, color, alias, notas, creadoEn}]
  // deudores[].personaId → referencia a personas[]
  // encargos[].personaId → referencia a personas[]
};
// Exponer S globalmente para que el módulo de Firebase pueda accederlo
window.S = S;
// patrimonioHistorial: [{fecha:'YYYY-MM-DD', valor:number}]
// cuentasPersonalizadas: [{id, nombre, icono, color, saldo, movimientos:[{id,tipo,monto,fecha,nota}]}]
// Cajita structure: {id, nombre, saldo (saldo actual total con intereses ya "materializados"), 
//   fecha (cuando se creó / última vez que se materializó intereses),
//   tasa (EA %), cdt: {monto, tasa, inicio, vence} | null}
// El interés es diario compuesto: a las 12am cada día se "paga" el interés y queda en el saldo.
// Nosotros simulamos esto: el saldo mostrado = saldo_guardado * (1 + tasaDiaria)^diasTranscurridos
// Cuando el usuario agrega/retira plata, se materializa el interés acumulado primero.

let pagoIdx=null;
let pagoDestino='';
// mesFilter/gastoTab: migrados a js/modules/gastos.js

function fmt(n){
  const num=n||0;
  const cents=Math.round(num*100);
  const intPart=Math.floor(Math.abs(cents)/100);
  const decPart=Math.abs(cents)%100;
  const sign=cents<0?'-':'';
  if(decPart===0){return sign+'$'+intPart.toLocaleString('es-CO');}
  return sign+'$'+intPart.toLocaleString('es-CO')+','+String(decPart).padStart(2,'0');
}
function fmtNoCents(n){
  const num=n||0;
  const sign=num<0?'-':'';
  const intPart=Math.floor(Math.abs(num));
  return sign+'$'+intPart.toLocaleString('es-CO');
}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,5);}
// Mide el ancho de un texto sin tocar el DOM (evita forced reflow en tooltips
// que se reposicionan muy seguido, ej. arrastrar sobre gráficos). Un canvas
// fuera del documento no depende del layout de la página, así que medir con
// él no obliga al navegador a recalcular nada.
const _medirCtx = document.createElement('canvas').getContext('2d');
function medirAnchoTexto(texto, font){
  _medirCtx.font = font;
  return _medirCtx.measureText(texto).width;
}
function hoy(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}

function crearMovimientoApertura(monto,fecha,nota){
  // Objeto de movimiento "apertura" estándar. Cualquier sheet que necesite
  // registrar un saldo inicial en un array de movimientos propio (ej: cuenta
  // personalizada recién creada) debe usar esto en vez de armar el objeto a mano,
  // así el tipo y la forma del movimiento quedan consistentes en toda la app.
  return {id:uid(),tipo:'apertura',monto,fecha:fecha||hoy(),desc:nota||'Saldo inicial',nota:nota||'Saldo inicial'};
}
// Escapa caracteres HTML para prevenir XSS al insertar datos de usuario en innerHTML
function escHtml(s){if(!s&&s!==0)return '';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function mesKey(d){return d?d.substring(0,7):'';}

/* ---- MOVER PLATA ENTRE CUENTAS ---- */
function descontarFuente(fuente,monto){
  if(!fuente||!monto)return;
  if(fuente==='ganancia'){
    // Plata virtual: no salió de ninguna cuenta real, es ganancia futura
    return;
  }
  if(fuente==='nequi'){
    S.nequiSaldo=Math.max(0,(S.nequiSaldo||0)-monto);
    document.getElementById('nequiSaldo').value=fmtInput(S.nequiSaldo);
  } else if(fuente==='efectivo'){
    S.efectivoSaldo=Math.max(0,(S.efectivoSaldo||0)-monto);
    document.getElementById('efectivoSaldo').value=fmtInput(S.efectivoSaldo);
  } else if(fuente.startsWith('cajita:')){
    const id=fuente.split(':')[1];
    const c=(S.cajitas||[]).find(x=>x.id===id);
    if(c){
      materializarIntereses(c);
      c.saldo=Math.max(0,(c.saldo||0)-monto);
      const el=document.getElementById('cs_'+c.id);if(el)el.value=fmtInput(c.saldo);
    }
  } else if(fuente.startsWith('custom:')){
    const id=fuente.split(':')[1];
    const c=(S.cuentasPersonalizadas||[]).find(x=>x.id===id);
    if(c)c.saldo=Math.max(0,(c.saldo||0)-monto);
  } else if(fuente.startsWith('tc:')){
    // Para TC: descontar = hacer una compra = aumentar la deuda
    const id=fuente.split(':')[1];
    const tc=(S.tarjetasCredito||[]).find(x=>x.id===id);
    if(tc)tc.deuda=(tc.deuda||0)+monto;
  }
}
function sumarFuente(fuente,monto){
  if(!fuente||!monto)return;
  if(fuente==='nequi'){
    S.nequiSaldo=(S.nequiSaldo||0)+monto;
    document.getElementById('nequiSaldo').value=fmtInput(S.nequiSaldo);
  } else if(fuente==='efectivo'){
    S.efectivoSaldo=(S.efectivoSaldo||0)+monto;
    document.getElementById('efectivoSaldo').value=fmtInput(S.efectivoSaldo);
  } else if(fuente.startsWith('cajita:')){
    const id=fuente.split(':')[1];
    const c=(S.cajitas||[]).find(x=>x.id===id);
    if(c){
      materializarIntereses(c);
      c.saldo=(c.saldo||0)+monto;
      const el=document.getElementById('cs_'+c.id);if(el)el.value=fmtInput(c.saldo);
    }
  } else if(fuente.startsWith('custom:')){
    const id=fuente.split(':')[1];
    const c=(S.cuentasPersonalizadas||[]).find(x=>x.id===id);
    if(c)c.saldo=(c.saldo||0)+monto;
  } else if(fuente.startsWith('tc:')){
    // Para TC: sumar = revertir compra = disminuir la deuda
    const id=fuente.split(':')[1];
    const tc=(S.tarjetasCredito||[]).find(x=>x.id===id);
    if(tc)tc.deuda=Math.max(0,(tc.deuda||0)-monto);
  }
}

// Cuentas personalizadas migradas a js/modules/cuentas.js (ver docs/cuentas.md).
function getFuentes(){
  const arr=[];
  (S.cajitas||[]).forEach(c=>{if(!c.esCDT)arr.push({val:'cajita:'+c.id,label:c.nombre+' (Nu)'});});
  arr.push({val:'nequi',label:'Nequi'});
  arr.push({val:'efectivo',label:'Efectivo'});
  (S.cuentasPersonalizadas||[]).forEach(c=>arr.push({val:'custom:'+c.id,label:c.nombre}));
  (S.tarjetasCredito||[]).filter(tc=>(tc.estado||'activa')==='activa').forEach(tc=>arr.push({val:'tc:'+tc.id,label:tc.nombre+' (TC)'}));
  return arr;
}

function getFuentesSinTC(){
  const arr=[];
  (S.cajitas||[]).forEach(c=>{if(!c.esCDT)arr.push({val:'cajita:'+c.id,label:c.nombre+' (Nu)'});});
  arr.push({val:'nequi',label:'Nequi'});
  arr.push({val:'efectivo',label:'Efectivo'});
  (S.cuentasPersonalizadas||[]).forEach(c=>arr.push({val:'custom:'+c.id,label:c.nombre}));
  return arr;
}

function fuenteLabel(val){
  if(!val)return'Sin especificar';
  if(val==='ganancia')return'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block"><ellipse cx="12" cy="17" rx="8" ry="5"/><path d="M4 17v-4c0-2.76 3.58-5 8-5s8 2.24 8 5v4"/><path d="M4 13c0-2.76 3.58-5 8-5s8 2.24 8 5"/></svg> Ganancia (no desembolsada)';
  if(val==='nequi')return'Nequi';
  if(val==='efectivo')return'Efectivo';
  if(val.startsWith('cajita:')){
    const id=val.split(':')[1];
    const c=(S.cajitas||[]).find(x=>x.id===id);
    return c?c.nombre+' (Nu)':'Cajita Nu';
  }
  if(val.startsWith('custom:')){
    const id=val.split(':')[1];
    const c=(S.cuentasPersonalizadas||[]).find(x=>x.id===id);
    return c?c.nombre:val;
  }
  if(val.startsWith('tc:')){
    const id=val.split(':')[1];
    const tc=(S.tarjetasCredito||[]).find(x=>x.id===id);
    return tc?tc.nombre:'Tarjeta de crédito';
  }
  return val;
}

function fuenteBadgeClass(val){
  if(!val)return'bg-blue';
  if(val==='ganancia')return'bg-green';
  if(val==='nequi')return'bg-nequi';
  if(val==='efectivo')return'bg-amber';
  if(val.startsWith('cajita:'))return'bg-nu';
  if(val.startsWith('custom:'))return'bg-blue';
  if(val.startsWith('tc:'))return'bg-red';
  return'bg-nu';
}

function poblarFuente(selectId, required=false, incluirTC=true){
  const sel=document.getElementById(selectId);
  if(!sel)return;
  sel.innerHTML=buildFuentesOptsHtml({ placeholder: required ? 'Seleccionar cuenta' : 'Sin especificar', incluirTC });
}

function getSaldoFuente(fuente){
  if(!fuente)return 0;
  if(fuente==='nequi')return S.nequiSaldo||0;
  if(fuente==='efectivo')return S.efectivoSaldo||0;
  if(fuente.startsWith('cajita:')){
    const id=fuente.split(':')[1];
    const c=(S.cajitas||[]).find(x=>x.id===id);
    return c?_calcCSafe(c).val:0;
  }
  if(fuente.startsWith('custom:')){
    const id=fuente.split(':')[1];
    const c=(S.cuentasPersonalizadas||[]).find(x=>x.id===id);
    return c?c.saldo||0:0;
  }
  if(fuente.startsWith('tc:')){
    // TC: retornar el cupo disponible real (cupo - deuda).
    // Si la TC no tiene cupo configurado, retornar Infinity para no bloquear
    // (el gasto en TC no descuenta plata real, solo aumenta la deuda).
    const tcId=fuente.split(':')[1];
    const tc=(S.tarjetasCredito||[]).find(x=>x.id===tcId);
    if(!tc)return 0;
    if(!tc.cupo)return 999999999; // sin cupo configurado: sin restricción
    return Math.max(0,(tc.cupo||0)-(tc.deuda||0));
  }
  return 0;
}
// Alias canónico: getSaldoFuente es la función completa (maneja tc:, guard null).
// getSaldoActual se mantiene como alias para compatibilidad con todos los call sites existentes.
const getSaldoActual = getSaldoFuente;

/* ---- LOAD / SAVE ---- */
function fmtInput(n){
  // Format a raw number for display in a money-input field (calculator style: always show 2 decimals)
  if(!n&&n!==0)return'';
  const num=parseFloat(n);
  if(isNaN(num)||num===0)return'';
  // Always show with 2 decimals, using es-CO separators
  const cents=Math.round(num*100);
  const intPart=Math.floor(cents/100);
  const decPart=String(cents%100).padStart(2,'0');
  return intPart.toLocaleString('es-CO')+','+decPart;
}

// Calculator-style money input: digits push right-to-left from centavos
// Stores raw digit string per input element
const _moneyDigits=new WeakMap();

function _moneyRender(digits){
  // digits: string of up to N digit chars, e.g. "300" → "3,00"
  if(!digits||digits==='0'||digits==='')return'0,00';
  // Pad to at least 3 digits so we always have 2 decimal places
  const padded=digits.padStart(3,'0');
  const intRaw=padded.slice(0,-2);
  const dec=padded.slice(-2);
  // Remove leading zeros from integer part
  const intNum=parseInt(intRaw,10)||0;
  const intFmt=intNum.toLocaleString('es-CO');
  return intFmt+','+dec;
}

function _moneyValue(digits){
  if(!digits||digits==='0')return 0;
  const padded=digits.padStart(3,'0');
  const intRaw=padded.slice(0,-2);
  const dec=padded.slice(-2);
  return parseInt(intRaw||'0',10)+(parseInt(dec,10)/100);
}

function load(){
  // Firebase version: datos ya cargados en S por _fbLoadData()
  // Solo inicializamos campos faltantes y sincronizamos el DOM
  if(!S.encargos)S.encargos=[];
  if(!S.movimientos)S.movimientos=[];
  if(!S.cuentasPersonalizadas)S.cuentasPersonalizadas=[];
  if(!S.catsVar)S.catsVar=[];
  if(!S.catsFijo)S.catsFijo=[];
  if(!S.patrimonioHistorial)S.patrimonioHistorial=[];
  if(!S.personas)S.personas=[];
  if(!S.ingresosFijos)S.ingresosFijos=[];
  if(!S.misDeudas)S.misDeudas=[];
  if(!S.config)S.config={};
  if(!S.config.proteccionAntiguedad)S.config.proteccionAntiguedad={diasAviso:90,diasBloqueo:365,spotify:{opsAviso:2,opsBloqueo:5},mesada:{opsAviso:2,opsBloqueo:5},prestamos:{opsAviso:2,opsBloqueo:5},encargos:{opsAviso:2,opsBloqueo:5},tarjetas:{opsAviso:2,opsBloqueo:5},cuentas:{opsAviso:2,opsBloqueo:5},gastos:{opsAviso:2,opsBloqueo:5}};
  // Sincronizar color de misDeudas desde la persona vinculada (fuente de verdad)
  (S.misDeudas || []).forEach(d => {
    if (d.personaId && S.personas) {
      const p = S.personas.find(x => x.id === d.personaId);
      if (p && p.color) d.color = p.color;
    }
  });
  // Migración retroactiva: calcular el monto exacto de aperturas y ajustes de saldo inicial
  // (incluyendo borrados de apertura, que generan un ajuste negativo en _ajustesBaseLog)
  // por fecha en el historial de patrimonio que ya existía antes de este fix. Así la
  // tendencia mensual descuenta solo esa parte del cambio del día y conserva cualquier
  // ingreso real que haya ocurrido la misma fecha, sin tener que esperar a un nuevo snapshot.
  if(S.patrimonioHistorial.length){
    const montoAperturaPorFecha = {};
    const sumarApertura=(m)=>{
      if(m.tipo==='apertura'){ montoAperturaPorFecha[m.fecha]=(montoAperturaPorFecha[m.fecha]||0)+(m.monto||0); }
      if(m._ajustes){ m._ajustes.forEach(aj=>{ montoAperturaPorFecha[aj.fecha]=(montoAperturaPorFecha[aj.fecha]||0)+(aj.monto||0); }); }
    };
    (S.movimientos||[]).forEach(sumarApertura);
    (S.cuentasPersonalizadas||[]).forEach(c=>(c.movimientos||[]).forEach(sumarApertura));
    (S._ajustesBaseLog||[]).forEach(aj=>{ montoAperturaPorFecha[aj.fecha]=(montoAperturaPorFecha[aj.fecha]||0)+(aj.monto||0); });
    S.patrimonioHistorial.forEach(h=>{
      if(montoAperturaPorFecha[h.fecha]&&montoAperturaPorFecha[h.fecha]!==0){ h.montoBase=montoAperturaPorFecha[h.fecha]; }
      else { delete h.baseAjustada; } // limpiar flag de versión anterior del fix, si existe
    });
  }
  if(S.cajitas){
    S.cajitas=S.cajitas.map(c=>{
      if(!c.cdts)c.cdts=[];
      if(!c.tasa)c.tasa=S.nuRate||9.25;
      if(!c.fecha)c.fecha=hoy();
      return c;
    });
  }
  if(S.gastosFijos){S.gastosFijos=S.gastosFijos.filter(x=>!(x.id==='gf1'&&x.nombre==='Spotify Premium'&&(x.monto||0)===0));}
  if(!S.pagosGastosFijos)S.pagosGastosFijos={};
  document.getElementById('nuRate').value=S.nuRate||9.25;
  const nuTasaEl=document.getElementById('nuTasaGlobal');
  if(nuTasaEl)nuTasaEl.value=(S.nuTasaGlobal!=null)?String(S.nuTasaGlobal).replace('.',','):'';
  document.getElementById('nequiSaldo').value=fmtInput(S.nequiSaldo);
  document.getElementById('efectivoSaldo').value=fmtInput(S.efectivoSaldo);
  if(typeof _getCuotaAnio==='function'){
    if(document.getElementById('mesadaMontoPapa'))document.getElementById('mesadaMontoPapa').value=fmtInput(_getCuotaAnio('papa',S.mesadaAnio||new Date().getFullYear()));
    if(document.getElementById('mesadaMonteMama'))document.getElementById('mesadaMonteMama').value=fmtInput(_getCuotaAnio('mama',S.mesadaAnio||new Date().getFullYear()));
  }
  document.getElementById('spotifyCosto').value=fmtInput(S.spotifyCosto);
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
  // PROTECCIÓN: no guardar si los datos aún no se han cargado desde Firebase.
  // Esto evita sobreescribir datos válidos con el estado inicial vacío.
  if(window._fbLoadData && !window._dataLoaded) {
    console.warn('[save] Bloqueado: datos de Firebase aún no cargados.');
    return;
  }
  // Leer del DOM solo si el input existe y tiene un valor real (no vacío/placeholder).
  // Esto evita sobreescribir S con 0 cuando el input está oculto o sin foco.
  function _readMoney(id, fallback){
    const el=document.getElementById(id);
    if(!el)return fallback;
    const v=parseMoney(el.value);
    // Si el input está vacío o su valor parseado es 0 pero el saldo guardado es positivo,
    // conservamos el valor de S para no sobrescribir con 0 accidentalmente.
    if(!el.value.trim()&&fallback>0)return fallback;
    return v||fallback||0;
  }
  S.nuRate=parseMoney(document.getElementById('nuRate').value)||9.25;
  S.nequiSaldo=_readMoney('nequiSaldo', S.nequiSaldo);
  S.efectivoSaldo=_readMoney('efectivoSaldo', S.efectivoSaldo);
  // Cuota mensual por año — guardada en S.mesadas[parent].cuotas[anio]
  const _anioActivo=S.mesadaAnio||new Date().getFullYear();
  if(!S.mesadas)S.mesadas={papa:{cuotas:{},pagos:{}},mama:{cuotas:{},pagos:{}}};
  ['papa','mama'].forEach(p=>{
    if(!S.mesadas[p])S.mesadas[p]={cuotas:{},pagos:{}};
    if(!S.mesadas[p].cuotas)S.mesadas[p].cuotas={};
    if(!S.mesadas[p].pagos)S.mesadas[p].pagos={};
  });
  const _elPapa=document.getElementById('mesadaMontoPapa');
  const _elMama=document.getElementById('mesadaMonteMama');
  // Solo grabamos una cuota explícita para este año si el valor en pantalla
  // realmente difiere del heredado (_getCuotaAnio). Si coincide, es porque el
  // usuario nunca tocó el input — sigue siendo el fallback de un año anterior,
  // no una decisión explícita — y grabarlo igual "congelaría" ese número en
  // cuanto se disparara CUALQUIER save() de la app (agregar un gasto, marcar
  // un pago de Nu, etc.), rompiendo la herencia hacia años futuros.
  if(typeof _getCuotaAnio==='function'){
    if(_elPapa&&_elPapa.value.trim()){const v=parseMoney(_elPapa.value);if(v&&v!==_getCuotaAnio('papa',_anioActivo))S.mesadas.papa.cuotas[String(_anioActivo)]=v;}
    if(_elMama&&_elMama.value.trim()){const v=parseMoney(_elMama.value);if(v&&v!==_getCuotaAnio('mama',_anioActivo))S.mesadas.mama.cuotas[String(_anioActivo)]=v;}
  }
  S.spotifyCosto=parseMoney(document.getElementById('spotifyCosto').value)||0;
  (S.cajitas||[]).forEach(c=>{
    const elN=document.getElementById('cn_'+c.id);
    const elS=document.getElementById('cs_'+c.id);
    if(elN)c.nombre=elN.value||c.nombre;
    if(elS && !(c.cdts&&c.cdts.length))c.saldo=parseMoney(elS.value)||0;
    const globalTasa=_getNuTasaGlobalSafe();
    c.tasa=globalTasa;
    if(!c.fecha)c.fecha=hoy();
    (c.cdts||[]).forEach(function(cdt){
      const elCT=document.getElementById('cdt_tasa_'+c.id+'_'+cdt.id);
      const elCV=document.getElementById('cdt_vence_'+c.id+'_'+cdt.id);
      const elCR=document.getElementById('cdt_rte_'+c.id+'_'+cdt.id);
      if(elCT)cdt.tasa=parsePct(elCT.value)||cdt.tasa;
      if(elCV)cdt.vence=elCV.value||cdt.vence;
      if(elCR&&elCR.value.trim()!==''){const rv=parsePct(elCR.value);if(rv!=null)cdt.rte=rv;}
    });
  });
  snapshotPatrimonio();
  // Guardar en Firebase con debounce de 1.5s
  if(typeof window._fbSaveToCloud === 'function') {
    window._fbSaveToCloud();
  }
}

/* ---- SNAPSHOT PATRIMONIO ---- */
function _saldoCPAjeno(){
  // Calcula cuánta plata comprometida ajena está físicamente en cuentas propias.
  // Son destinos de ingresos ya recibidos donde el dinero es de otra persona
  // (gastos de cajita/nequi/efectivo pendientes de pagar, y plata para TC aún en cajita).
  // Una vez que se paga (yaPague=true) la plata ya salió → no restar.
  let total = 0;
  (S.plataCometida||[]).forEach(item => {
    if(!item.recibido) return; // aún no llegó → no está en ninguna cuenta
    (item.destinos||[]).forEach(d => {
      if(d.yaPague) return; // ya se pagó → salió de la cuenta
      if(d.tipo === 'gasto' && d.gastoOrigen === 'cajita' && d.gastoCajita){
        // Plata de otra persona guardada en cajita esperando el pago
        total += (d.monto||0);
      } else if(d.tipo === 'gasto' && d.gastoOrigen === 'tc' && d.gastoTcCajita){
        // Plata para pagar TC guardada en cajita intermediaria
        total += (d.monto||0);
      }
    });
  });
  return total;
}

// Deuda ajena de UNA tarjeta puntual — cuánto de tc.deuda es en realidad de
// un encargo/préstamo/favor (plata que no es tuya, solo la estás cuidando).
//
// OJO: esto es un SALDO, no un bruto histórico. Si sumáramos todo lo que
// alguna vez se cargó como ajeno sin restar los pagos, la "ajena" nunca
// bajaría aunque ya la hayas pagado — y con el tiempo terminaría inflada
// por encima de tc.deuda actual, haciendo que la parte "propia" calculada
// diera 0 aunque tengas gastos tuyos reales sin cubrir.
//
// Regla de negocio: un pago cancela PRIMERO lo ajeno (es plata que se
// recupera del encargo/préstamo y se usa específicamente para saldar esa
// parte) y lo que sobra del pago cancela lo propio. Con esto la "ajena"
// nunca puede superar la deuda actual, y calcDeudaTcPropiaDeTarjeta ya no
// necesita un floor artificial en 0 para "resolver" el desbalance.
// Saldo inicial PENDIENTE de UNA tarjeta — la parte del saldo con que se
// creó la tarjeta que todavía no se ha pagado. Se trata como "neutral": no
// sabemos si es propia o ajena (se ingresó en bloque al configurar la
// tarjeta, sin desglosar), así que no cuenta ni para un lado ni para el
// otro mientras exista. Los pagos la drenan PRIMERO, antes de tocar lo
// ajeno conocido o lo propio (ver calcDeudaAjenaDeTarjeta). Conversación
// 2026-08-07: evita que el health score penalice una suposición que podría
// estar mal (ej. saldo inicial que en realidad era 100% un favor a otra
// persona).
function calcSaldoInicialPendiente(tc){
  if(!tc || !tc.saldoInicial || tc.saldoInicial.eliminado) return 0;
  const totalPagos=(tc.pagos||[]).filter(p=>!p.eliminado).reduce((a,p)=>a+(p.monto||0),0);
  return Math.max(0, (tc.saldoInicial.monto||0) - totalPagos);
}

// Deuda ajena de UNA tarjeta puntual — cuánto de tc.deuda es en realidad de
// un encargo/préstamo/favor (plata que no es tuya, solo la estás cuidando).
//
// OJO: esto es un SALDO, no un bruto histórico. Si sumáramos todo lo que
// alguna vez se cargó como ajeno sin restar los pagos, la "ajena" nunca
// bajaría aunque ya la hayas pagado — y con el tiempo terminaría inflada
// por encima de tc.deuda actual, haciendo que la parte "propia" calculada
// diera 0 aunque tengas gastos tuyos reales sin cubrir.
//
// Regla de negocio: un pago cancela PRIMERO el saldo inicial (neutral, ver
// calcSaldoInicialPendiente), LUEGO lo ajeno conocido (encargo/préstamo/
// favor), y lo que sobra cancela lo propio. Con esto la "ajena" nunca puede
// superar la deuda actual, y calcDeudaTcPropiaDeTarjeta ya no necesita un
// floor artificial en 0 para "resolver" el desbalance.
function calcDeudaAjenaDeTarjeta(tc){
  if(!tc) return 0;
  let ajenaBruta = 0;
  (S.tcMovimientos||[]).forEach(m => {
    if (m.eliminado || m.tcId !== tc.id) return;
    if (m.tipo === 'cargo_encargo' || m.tipo === 'cargo_prestamo') ajenaBruta += (m.monto||0);
  });
  (tc.compras||[]).forEach(c => { if (!c.eliminado && c._desdeCP) ajenaBruta += (c.monto||0); });
  const totalPagos = (tc.pagos||[]).filter(p=>!p.eliminado).reduce((a,p)=>a+(p.monto||0),0);
  const saldoInicialBruto = (tc.saldoInicial && !tc.saldoInicial.eliminado) ? (tc.saldoInicial.monto||0) : 0;
  // Los pagos ya "gastados" en drenar el saldo inicial no cuentan acá —
  // solo el excedente, si lo hay, sigue bajando lo ajeno.
  const pagosParaAjena = Math.max(0, totalPagos - saldoInicialBruto);
  return Math.max(0, ajenaBruta - pagosParaAjena);
}
function calcDeudaTcPropiaDeTarjeta(tc){
  if(!tc) return 0;
  return Math.max(0, (tc.deuda||0) - calcDeudaAjenaDeTarjeta(tc) - calcSaldoInicialPendiente(tc));
}

// Calcula la deuda TC que realmente es mía, sumando la parte propia de
// cada tarjeta — una sola fuente de verdad (antes tenía su propio cálculo
// bruto separado que se podía desincronizar de calcDeudaTcPropiaDeTarjeta).
function calcDeudaTcPropia() {
  return (S.tarjetasCredito||[]).reduce((a,tc)=>a+calcDeudaTcPropiaDeTarjeta(tc),0);
}

function calcPatrimonioTotal(){
  const nu=(S.cajitas||[]).reduce((a,c)=>a+_calcCSafe(c).val,0);
  const cdts=(S.cajitas||[]).reduce((a,c)=>a+(c.cdts||[]).reduce((b,cdt)=>b+_calcCDTSafe(cdt).val,0),0);
  // NOTA: ya NO se resta plata de encargos guardada en Nequi/Efectivo/cuentas
  // personalizadas. Registrar una entrada de encargo con esa cuenta es solo
  // metadata de dónde está físicamente esa plata — nunca suma nada al saldo
  // real de la cuenta (a diferencia de una cajita de Nu, donde sí forma parte
  // de la base que gana interés en calcC()/_saldoEncargosEnCajita()). Restarla
  // acá contaba de menos un patrimonio que en realidad nunca se sumó. Ver
  // CHANGELOG.md#encargos.
  const nequi=(S.nequiSaldo||0);
  const ef=(S.efectivoSaldo||0);
  // FIX (auditoria-tecnica.md #5): getDeudorSaldoPatrimonio (prestado.js) se
  // llamaba sin guard typeof — calcPatrimonioTotal() corre en CADA save() de
  // la app (vía snapshotPatrimonio), no solo en refresh(), así que esto
  // bloqueaba volver lazy Préstamos igual que tcNormalizarTarjetas bloqueaba
  // Tarjetas de Crédito.
  const prest=(S.deudores||[]).reduce((a,d)=>{ const s=typeof getDeudorSaldoPatrimonio==='function'?getDeudorSaldoPatrimonio(d):0; return a+(s>0?s:0); },0);
  const custom=(S.cuentasPersonalizadas||[]).reduce((a,c)=>a+(c.saldo||0),0);
  const deudaTC=(S.tarjetasCredito||[]).reduce((a,tc)=>a+(tc.deuda||0),0);
  // Lo que le debo a otras personas (S.misDeudas) — esa plata está físicamente en
  // mis cuentas pero no es mía, así que se resta igual que la deuda de TC.
  const misDeudas=typeof totalMisDeudasPendiente==="function"?totalMisDeudasPendiente():0;
  // Restar plata comprometida ajena que está físicamente en cuentas propias
  // (igual que se restan encargos) — es plata de otras personas que administrás
  const cpAjeno = _saldoCPAjeno();
  // Alcancía: el saldo registrado es plata real tuya aunque esté "oculta"
  const alcancia = (S.alcancia && S.alcancia.saldoRegistrado) ? S.alcancia.saldoRegistrado : 0;
  return nu+cdts+nequi+ef+prest+custom+alcancia-deudaTC-misDeudas-cpAjeno;
}

function snapshotPatrimonio(){
  const hoyStr=hoy();
  if(!S.patrimonioHistorial)S.patrimonioHistorial=[];
  const val=calcPatrimonioTotal();
  if(val==null||isNaN(val))return;
  // Alcancía: se resta para el valor "visible" del historial/gráfica de Análisis Financiero.
  // El total real (val) sí la incluye y es el que usan el health score y la proyección,
  // pero mostrar la serie cruda en la gráfica revelaría los depósitos día a día —
  // rompiendo el propósito de "ocultar" el saldo (igual que ya hace el hero de Inicio).
  const _alcSnap=(S.alcancia&&S.alcancia.saldoRegistrado)?S.alcancia.saldoRegistrado:0;
  const valVisible=val-_alcSnap;
  // ¿Hoy se registró algún saldo inicial (cajita nueva, Nequi, Efectivo, cuenta personalizada)
  // o se corrigió uno existente? La app ya sabe distinguir esto vía tipo:'apertura' (ver
  // crearMovimientoApertura) y vía _ajustes (ver confirmarEditarApertura). Guardamos el
  // MONTO exacto (no solo un flag) para que el cálculo de tendencia pueda restar únicamente
  // esa parte del cambio del día y conservar cualquier ingreso real que haya ocurrido el
  // mismo día (ej. apertura + mesada el mismo día).
  const sumarAperturasYAjustesDeHoy = (movs)=> (movs||[]).reduce((a,m)=>{
    let t = 0;
    if(m.tipo==='apertura'&&m.fecha===hoyStr) t += (m.monto||0);
    if(m._ajustes) t += m._ajustes.filter(aj=>aj.fecha===hoyStr).reduce((b,aj)=>b+(aj.monto||0),0);
    return a+t;
  },0);
  const montoAperturaHoy =
    sumarAperturasYAjustesDeHoy(S.movimientos)
    + (S.cuentasPersonalizadas||[]).reduce((a,c)=>a+sumarAperturasYAjustesDeHoy(c.movimientos),0)
    + (S._ajustesBaseLog||[]).filter(aj=>aj.fecha===hoyStr).reduce((a,aj)=>a+(aj.monto||0),0);
  const ultimo=S.patrimonioHistorial[S.patrimonioHistorial.length-1];
  if(ultimo&&ultimo.fecha===hoyStr){
    ultimo.valor=val;
    ultimo.valorVisible=valVisible;
    if(montoAperturaHoy!==0)ultimo.montoBase=montoAperturaHoy; else delete ultimo.montoBase;
  }
  else{
    const punto={fecha:hoyStr,valor:val,valorVisible:valVisible};
    if(montoAperturaHoy!==0)punto.montoBase=montoAperturaHoy;
    S.patrimonioHistorial.push(punto);
  }
  if(S.patrimonioHistorial.length>365)S.patrimonioHistorial=S.patrimonioHistorial.slice(-365);
  // (No localStorage — Firebase lo guarda _fbSaveToCloud)
}
// Calcula cuánta plata de encargos (dinero que estás cuidando de otra persona,
// "No es tuyo") está guardada físicamente en una cuenta cualquiera — cajita de Nu,
// Nequi, Efectivo o una cuenta personalizada. cuentaKey usa el mismo formato que
// getFuentesSinTC(): 'cajita:ID', 'nequi', 'efectivo', 'custom:ID'.
function _saldoEncargosEnCuenta(cuentaKey){
  if(!S||!S.encargos||!cuentaKey)return 0;
  let total=0;
  (S.encargos||[]).forEach(enc=>{
    const map={};
    if((enc.saldoInicial||0)>0){
      const k=enc.cuentaInicial||'__sin__';
      map[k]=(map[k]||0)+(enc.saldoInicial||0);
    }
    (enc.movimientos||[]).forEach(m=>{
      const k=m.cuenta||'__sin__';
      if(m.tipo==='entrada')map[k]=(map[k]||0)+(m.monto||0);
      else map[k]=(map[k]||0)-(m.monto||0);
    });
    const v=map[cuentaKey]||0;
    if(v>0)total+=v;
  });
  return total;
}
// Caso específico de cajitas de Nu — Nu genera interés sobre TODO el dinero de
// la cajita (propio + encargos), y esos intereses son del dueño de la cajita.
// Se mantiene esta función con nombre propio porque calcC() ya la usa así.
// Nu: tasa EA (historial por tramos) y cálculo de CDTs migrados a js/modules/cuentas.js.

function mesActual(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');}

function gastosMes(mesK){
  return(S.gastosVar||[]).filter(g=>mesKey(g.fecha)===mesK);
}

// Suma los ingresos fijos configurados que aplican para un mes dado (YYYY-MM)
function getIngresosFijosMes(mesK){
  return(S.ingresosFijos||[]).reduce((acc,ing)=>{
    // Solo contar si el ingreso ya estaba activo ese mes (desde <= mesK, o sin desde)
    if(!ing.desde||ing.desde<=mesK) acc+=(ing.monto||0);
    return acc;
  },0);
}

// Determina si un movimiento tipo:'entrada' es un movimiento "espejo" generado
// automáticamente por otro módulo (Mesada, Prestado, Encargos) y que por lo tanto
// NO debe contarse como ingreso nuevo en Análisis financiero ni en Salud financiera:
// - Mesada: la plata ya se cuenta directamente desde getMesadaData(); contarla de
//   nuevo aquí sería doble conteo.
// - Prestado · Me deben: es la devolución de plata que ya era tuya (un abono de
//   deuda), no ingreso nuevo.
// - Prestado · Yo debo: es plata que te prestaron (deuda tuya), no ingreso.
// - Encargos (_esIntercambioEncargo/_intercambioEntrada/_encMovId, desc "Margen..."):
//   es capital o margen de encargo que se maneja aparte.
// - _esReposicionCP: devolución de plata comprometida que ya salió antes.
function _esEntradaEspejoNoIngreso(m){
  if(!m) return false;
  if(m._esReposicionCP) return true;
  // Fallback por desc para movimientos viejos sin _esReposicionCP
  if(/^(Reposición[: ]|Para pagar TC \()/.test(m.desc||'')) return true;
  if(m._esIntercambioEncargo||m._intercambioEntrada) return true;
  if(m._encMovId) return true;
  if((m.desc||'').startsWith('Margen')) return true;
  if(m._origenSeccion==='Mesada') return true;
  if((m._origenSeccion||'').indexOf('Prestado')===0) return true;
  return false;
}

// Determina si un gasto de S.gastosVar debe excluirse de los cálculos de "gasto real"
// del mes (balance/tasa de ahorro, salud financiera, ranking, presupuestos, resumen de
// cierre de mes, etc.) porque su efecto ya está contabilizado o neutralizado en otro lado:
// - esPagoGastoFijo: ya se cuenta aparte en gfTotal (gastos fijos pagados)
// - _esPagoTC: cancelación de deuda ya contada cuando se hizo la compra, no gasto nuevo
// - _esAlcancia: sigue siendo plata tuya, solo cambió de lugar
// - _esExtraPrestamo: extra/propina de un préstamo gastado de inmediato — nunca se contó
//   como ingreso, así que tampoco debe contar como gasto real (ver CHANGELOG)
// Centralizado acá para que un flag nuevo de exclusión no tenga que agregarse a mano en
// cada pantalla — ya pasó dos veces que un filtro se corrigiera en un lugar y no en otro.
function _esGastoVarNoReal(g){
  if(!g) return false;
  if(g.esPagoGastoFijo) return true;
  if(g._esPagoTC) return true;
  if(g._esAlcancia) return true;
  if(g._esExtraPrestamo) return true;
  return false;
}

/* ---- TOAST ---- */
function toast(msg, tipo='ok', dur=2800){
  const c=document.getElementById('toast-container');
  const el=document.createElement('div');
  const col={ok:'var(--accent)',err:'var(--red)',info:'var(--blue)'}[tipo]||'var(--text2)';
  const ico={ok:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>',err:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',info:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'}[tipo]||'•';
  el.className='toast toast-'+tipo;
  el.innerHTML=`<span style="font-size:15px;color:${col};">${ico}</span><span>${msg}</span>`;
  c.appendChild(el);
  setTimeout(()=>{el.classList.add('hiding');setTimeout(()=>el.remove(),220);},dur);
}

/* ---- DIALOG (reemplaza confirm) ---- */
window._dialogResolve=null;
function _closeDialog(val){
  if(window._dialogResolve){
    const fn=window._dialogResolve;
    window._dialogResolve=null;
    document.getElementById('dialog-overlay').classList.remove('open');
    fn(val);
  }
}
function dialogo(titulo, msg, btnOk='Confirmar', peligro=false){
  return new Promise(res=>{
    window._dialogResolve=res;
    document.getElementById('dialog-title').textContent=titulo;
    document.getElementById('dialog-msg').textContent=msg;
    const btn=document.getElementById('dialog-confirm');
    btn.textContent=btnOk;
    btn.style.background=peligro?'rgba(240,104,104,.2)':'rgba(200,240,96,.15)';
    btn.style.borderColor=peligro?'rgba(240,104,104,.4)':'rgba(200,240,96,.4)';
    btn.style.color=peligro?'var(--red)':'var(--accent)';
    document.getElementById('dialog-overlay').classList.add('open');
  });
}
document.getElementById('dialog-overlay').addEventListener('click',function(e){
  if(e.target===this) _closeDialog(false);
});

/* ---- PROTECCIÓN POR ANTIGÜEDAD DE MOVIMIENTOS ---- */
// Ver docs/proteccion-antiguedad-movimientos.md para el detalle completo.
// Un movimiento viejo ya se mezcló lógicamente con todo lo que pasó en su
// cuenta después: revertirlo hoy no "deshace el error", introduce un
// descuadre nuevo. Estas funciones son el único lugar donde vive esa regla
// — cada módulo (Spotify, Mesada, Préstamos, Encargos, Tarjetas) las llama
// desde su(s) punto(s) de borrado en vez de reimplementar el cálculo.

// Nivel de protección de un movimiento, según DOS criterios independientes
// (basta con que se cumpla uno): tiempo transcurrido desde su fecha, y
// cantidad de operaciones posteriores que ya tocaron la misma cuenta/ciclo.
// Los umbrales de tiempo son globales; los de cantidad son por módulo.
//
// @param {string} fecha           Fecha del movimiento, 'YYYY-MM-DD'.
// @param {number} opsPosteriores  Cantidad de operaciones posteriores ya
//                                 registradas sobre la misma cuenta/ciclo
//                                 (0 si el módulo aún no define este criterio).
// @param {string} modulo          Clave dentro de S.config.proteccionAntiguedad
//                                 con los umbrales opsAviso/opsBloqueo del
//                                 módulo (ej: 'spotify'). Si el módulo todavía
//                                 no tiene esos umbrales definidos, el nivel
//                                 se decide solo por tiempo.
// @returns {'reciente'|'viejo'|'bloqueado'}
function nivelAntiguedadMovimiento(fecha, opsPosteriores, modulo){
  const cfg=S.config.proteccionAntiguedad;
  const modCfg=cfg[modulo]||{};
  const dias=Math.floor((Date.now()-new Date(fecha+'T00:00:00').getTime())/86400000);
  const ops=opsPosteriores||0;
  if(dias>cfg.diasBloqueo || (modCfg.opsBloqueo!=null && ops>=modCfg.opsBloqueo)) return 'bloqueado';
  if(dias>cfg.diasAviso || (modCfg.opsAviso!=null && ops>=modCfg.opsAviso)) return 'viejo';
  return 'reciente';
}

// Aviso para nivel 'viejo': muestra qué cuenta se afecta y de cuánto sube o
// baja su saldo si se confirma, y deja decidir al usuario con esa
// información — nunca a ciegas. Devuelve true si confirma, false si cancela.
// No usar para nivel 'bloqueado' (ver avisarMovimientoBloqueado).
//
// @param {string} nombreCuenta    Nombre a mostrar de la cuenta afectada.
// @param {number} montoRevertido  Monto que se revertirá (siempre positivo).
// @param {'sube'|'baja'} direccion  Si el campo de esa cuenta sube o baja al revertir.
// @param {'saldo'|'deuda'} [campo='saldo']  Qué campo cambia (ej: 'deuda' para
//                                            revertir un cargo hecho a una TC).
function confirmarBorrarMovimientoViejo(nombreCuenta, montoRevertido, direccion, campo='saldo'){
  const verbo=direccion==='sube'?'sube':'baja';
  return dialogo(
    'Movimiento antiguo',
    `Este movimiento ya tiene tiempo y puede estar mezclado con operaciones más recientes de "${nombreCuenta}". Si lo eliminas, su ${campo} ${verbo} ${fmt(montoRevertido)} ahora mismo — no se recalcula el historial completo. ¿Eliminar de todas formas?`,
    'Eliminar de todas formas', true
  );
}

// Aviso para nivel 'bloqueado': solo informa, no ofrece la opción de
// continuar (coherente con dialogo(), que ya soporta este patrón de un solo
// botón — ver el uso existente para movimientos secundarios en movimientos.js).
function avisarMovimientoBloqueado(){
  return dialogo(
    'No se puede eliminar',
    'Este movimiento es demasiado antiguo o ya está muy mezclado con operaciones posteriores de esa cuenta. Eliminarlo ahora dejaría un descuadre imposible de corregir a mano. Si hay un error real, corrígelo editando el dato (nota o fecha) sin borrar el movimiento.',
    'Entendido', false
  );
}

/* ---- DEBOUNCE SAVE ---- */
var _saveTimer=null;
// Flag: true solo si este dispositivo hizo cambios reales en esta sesión.
// Evita que un dispositivo que solo abrió y leyó datos pise Firestore al cerrar.
window._locallyModified = false;
function debounceSave(delay=800){
  window._locallyModified = true; // El usuario tocó algo en este dispositivo
  clearTimeout(_saveTimer);
  _saveTimer=setTimeout(()=>saveAndRefresh(),delay);
  // Exponer en window para que el módulo Firebase (scope de módulo) pueda cancelarlo en signOut
  window._debounceTimer=_saveTimer;
}

/* ---- GUARDADO DE EMERGENCIA al cerrar pestaña ---- */
// Evita pérdida de datos si el usuario cierra antes de que el debounce dispare.
window.addEventListener('beforeunload', function() {
  if (!window._dataLoaded) return; // Nunca guardar si los datos no se cargaron
  // CRÍTICO: Solo guardar si este dispositivo realmente modificó algo en esta sesión.
  // Si el dispositivo solo abrió y leyó datos (sin editar), NO sobreescribir Firestore.
  // Esto evita que abrir la app en PC/otra pestaña con datos desactualizados pise
  // los cambios recientes hechos desde otro dispositivo (ej: celular todo el día).
  if (!window._locallyModified) return;
  // Siempre intentar guardar al cerrar si hay datos cargados, haya o no timer pendiente
  if (window._fbUser && window._fb && window.S) {
    try {
      clearTimeout(_saveTimer); _saveTimer = null;
      clearTimeout(window._fbSaveTimer); window._fbSaveTimer = null;
      const {db, doc, setDoc} = window._fb;
      const data = JSON.parse(JSON.stringify(window.S));
      const closingTs = Date.now();
      // Persistir el timestamp ANTES de cerrar para que al reabrir
      // la página sepa que "yo fui el último en guardar" y no deje
      // que un snapshot antiguo de otro dispositivo pise estos datos.
      try { localStorage.setItem('mf_lastSavedAt', String(closingTs)); } catch(_){}
      window._lastSavedAt = closingTs;
      setDoc(doc(db,'usuarios',window._fbUser.uid,'data','finanzas'),
        {payload: JSON.stringify(data), updatedAt: closingTs}
      ).catch(()=>{});
    } catch(e) {}
  }
});

/* ---- CATEGORÍAS PERSONALIZADAS, BACKUP JSON: migrado a js/modules/configuracion.js ---- */

/* ---- EMPTY STATES ACCIONABLES ---- */
// btnFn siempre usa el despachador central de eventos (js/core/events.js):
// {action, args}. La forma vieja que esta función aceptaba por compatibilidad
// hacia atrás (string con onclick="..." crudo, para Gastos/Tarjetas de
// crédito mientras migraban) se sacó esta sesión: se revisaron TODAS las
// llamadas a emptyState() en toda la app (gastos.js ×2, spotify.js ×1 — las
// únicas 3 que existen) y las 3 ya usaban la forma nueva. El comentario
// viejo había quedado desactualizado — Gastos ya había migrado sin que
// nadie lo actualizara. Se saca la rama entera (no solo el comentario) para
// que ningún módulo futuro pueda reintroducir un onclick inline acá por
// costumbre. Ver auditoria-tecnica.md #1 y CHANGELOG.md#infraestructura--seguridad.
function emptyState(icon, title, sub, btnLabel, btnFn){
  let btnHtml = '';
  if (btnLabel && btnFn && btnFn.action) {
    btnHtml = `<button type="button" class="empty-state-btn" ${Events.attr(btnFn.action, ...(btnFn.args || []))}>${btnLabel}</button>`;
  }
  return `<div class="empty-state">
    <div class="empty-state-icon">${icon}</div>
    <div class="empty-state-title">${title}</div>
    <div class="empty-state-sub">${sub}</div>
    ${btnHtml}
  </div>`;
}

// renderAttencion() migrada a js/modules/inicio.js — ver auditoria-tecnica.md.
// De paso se corrigió un caso más de .innerHTML sin escapar (spNombreDe()
// interpolado directo, mismo patrón ya visto 5 veces en otros módulos).

// ── Guards de carga bajo demanda para cuentas.js (FIX 2026-08-13) ──────────
// cuentas.js se volvió grupo lazy (auditoria-tecnica.md, ronda de
// modularización de spotify/prestado/cuentas/analisis/encargos), pero
// calcC/calcCDT/nuTotal/getNuTasaGlobal se seguían llamando SIN guard desde
// calcPatrimonioTotal() y refresh() — que corren en CADA save()/refresh()
// de la app, no solo al visitar Cuentas. A diferencia de mesada/tarjetas
// (features secundarias que se pueden saltar en silencio), esto tumbaba
// TODA la app con un ReferenceError en el primer save() o refresh(), sin
// que el usuario hubiera hecho nada relacionado con Cuentas. Mismo patrón
// de fallback que ya usa inicio.js (window.calcC?...:c.saldo||0) — se
// centraliza acá para no repetirlo suelto en cada punto de uso.
function _calcCSafe(c){
  if(typeof calcC==='function') return calcC(c);
  return { val:(c&&c.saldo)||0, saldoEncargos:0 };
}
function _calcCDTSafe(cdt){
  if(typeof calcCDT==='function') return calcCDT(cdt);
  return { val:(cdt&&cdt.monto)||0 };
}
function _nuTotalSafe(){
  if(typeof nuTotal==='function') return nuTotal();
  return (S.cajitas||[]).reduce((a,c)=>a+_calcCSafe(c).val,0);
}
function _getNuTasaGlobalSafe(){
  if(typeof getNuTasaGlobal==='function') return getNuTasaGlobal();
  return S.nuTasaGlobal||9.25;
}

function refresh(){
  // Auto-sanación de tarjetas de crédito: agrega campos nuevos, infiere el
  // saldo inicial de tarjetas migradas y recalcula la deuda de cada una a
  // partir de sus movimientos (regla de consistencia). Es idempotente.
  if(typeof tcNormalizarTarjetas==='function') tcNormalizarTarjetas();
  const nu=_nuTotalSafe();
  // NOTA: ya NO se resta plata de encargos guardada en Nequi/Efectivo/cuentas
  // personalizadas — mismo criterio y misma razón que en calcPatrimonioTotal().
  const nequi=(S.nequiSaldo||0);
  const ef=(S.efectivoSaldo||0);
  const prest=totalPrestadoPendiente();
  // CDTs value comes from calcCDT nested in cajitas
  const cdts=(S.cajitas||[]).reduce((a,c)=>a+(c.cdts||[]).reduce((b,cdt)=>b+_calcCDTSafe(cdt).val,0),0);
  const cajitasLibres=(S.cajitas||[]).reduce((a,c)=>a+_calcCSafe(c).val,0);
  // Cuentas personalizadas marcadas para incluir en total
  const customTotal=(S.cuentasPersonalizadas||[]).reduce((a,c)=>a+(c.saldo||0),0);
  const disp=cajitasLibres+nequi+ef+customTotal;
  const mes=mesActual();
  const _gfFijos=(S.gastosFijos||[]).reduce((a,g)=>{
    // Solo sumar si fue pagado este mes
    const pagos=S.pagosGastosFijos||{};
    return pagos[g.id+'_'+mes]?a+(g.monto||0):a;
  },0);
  // _spFijo eliminado: el costo mensual de Spotify es solo un valor de referencia para el módulo.
  // Se cuenta como gasto real únicamente cuando se registra el pago (queda en gastosVar).
  const gfTotal=_gfFijos;
  // Excluir de variables los que son pagos de gastos fijos (ya se cuentan en gfTotal) y los pagos de TC (no son gasto real)
  const gvMes=gastosMes(mes).filter(g=>!_esGastoVarNoReal(g)).reduce((a,g)=>a+(g.monto||0),0);

  // Total intereses generados hoy en cajitas libres (base = saldo propio + encargos en la cajita)
  const _globalTasa=S.nuTasaGlobal||9.25;
  const interesesTotalHoy=(S.cajitas||[]).reduce((a,c)=>{
    const k=_calcCSafe(c);
    const tasaCajita=(!(c.cdts&&c.cdts.length)&&c.tasa!=null)?c.tasa:_globalTasa;
    // Incluir saldo de encargos en la base del interés (son intereses a mi favor)
    const baseInteres=k.val+(k.saldoEncargos||0);
    return a+(baseInteres>0?baseInteres*(Math.pow(1+tasaCajita/100,1/365)-1):0);
  },0);

  const deudaTCTotal=(S.tarjetasCredito||[]).reduce((a,tc)=>a+(tc.deuda||0),0);
  const _cpAjenoHero=typeof _saldoCPAjeno==='function'?_saldoCPAjeno():0;
  // Alcancía: el patrimonio real la incluye, pero el hero la oculta para mantener la sorpresa
  const _alcSaldo = (S.alcancia && S.alcancia.saldoRegistrado) ? S.alcancia.saldoRegistrado : 0;
  const _patrimonioVisible = disp+prest+cdts-deudaTCTotal-_cpAjenoHero; // sin alcancía
  document.getElementById('heroTotal').textContent=fmt(_patrimonioVisible);
  // Indicador de alcancía en el hero
  const _heroAlcInd = document.getElementById('hero-alcancia-indicator');
  const _heroLabel  = document.getElementById('hero-patrimonio-label');
  if(_heroAlcInd){
    if(_alcSaldo > 0){
      _heroAlcInd.style.display = '';
      if(_heroLabel) _heroLabel.textContent = 'Patrimonio visible';
    } else {
      _heroAlcInd.style.display = 'none';
      if(_heroLabel) _heroLabel.textContent = 'Patrimonio total';
    }
  }
  document.getElementById('s-disp').textContent=fmtNoCents(disp);
  document.getElementById('s-nu').textContent=fmtNoCents(cajitasLibres);
  document.getElementById('s-ef').textContent=fmtNoCents(ef);
  const sNequiEl=document.getElementById('s-nequi');if(sNequiEl)sNequiEl.textContent=fmtNoCents(nequi);
  document.getElementById('s-prest').textContent=fmtNoCents(prest);
  document.getElementById('s-cdt').textContent=fmtNoCents(cdts);
  document.getElementById('s-gf').textContent=fmtNoCents(gfTotal);
  document.getElementById('s-gv').textContent=fmtNoCents(gvMes);
  document.getElementById('s-gtotal').textContent=fmtNoCents(gfTotal+gvMes);
  document.getElementById('nuTotalDisp').textContent=fmt(nu);
  const nuInterEl=document.getElementById('nuTotalIntereses');
  if(nuInterEl)nuInterEl.textContent=interesesTotalHoy>0.5?'+'+fmt(interesesTotalHoy)+' intereses estimados hoy':'';

  // Actualizar saldos en el selector de cuentas
  const selNequi=document.getElementById('sel-nequi-saldo');
  const selNu=document.getElementById('sel-nu-saldo');
  const selEf=document.getElementById('sel-ef-saldo');
  if(selNequi)selNequi.textContent=fmt(nequi);
  if(selNu)selNu.textContent=fmt(nu);
  if(selEf)selEf.textContent=fmt(ef);
  // Si hay una cuenta abierta, actualizar su detalle
  // FIX (auditoria-tecnica.md #5): las llamadas de este bloque no tenían
  // guard typeof — bloqueaban de raíz volver lazy cuentas/encargos/gastos/
  // prestado/spotify/inicio/tarjetas_credito (ReferenceError en el primer
  // refresh() tras cargar el módulo bajo demanda). Mismo patrón defensivo
  // ya usado para renderMesada/_refreshCajitaDet/renderTCScreen — no cambia
  // el comportamiento actual (todo sigue cargando de entrada).
  if(cuentaActual){ if(typeof renderDetalleCuenta==='function') renderDetalleCuenta(cuentaActual); }
  else if(_customCuentaActualId){
    const _cc=(S.cuentasPersonalizadas||[]).find(x=>x.id===_customCuentaActualId);
    if(_cc){
      const saldoEl=document.getElementById('det-custom-saldo');
      if(saldoEl)saldoEl.textContent=fmt(_cc.saldo||0);
      if(typeof renderMovsCustom==='function') renderMovsCustom(_cc);
      if(typeof renderEncargosEnCuenta==='function') renderEncargosEnCuenta('det-custom-encargos', 'custom:'+_customCuentaActualId);
    }
  } else { if(typeof renderCajitas==='function') renderCajitas(); }
  // Siempre actualizar el detalle/sub-pantallas de cajita si hay una abierta
  if(typeof _refreshCajitaDet==='function') _refreshCajitaDet();
  if(typeof renderGastosVar==='function') renderGastosVar();
  if(typeof renderGastosFijos==='function') renderGastosFijos();
  if(typeof renderDeudoresList==='function') renderDeudoresList();
  if(typeof renderMesada==='function') renderMesada();
  if(typeof renderSpotify==='function') renderSpotify();
  if(typeof renderMesFiltros==='function') renderMesFiltros();
  if(typeof renderAttencion==='function') renderAttencion();
  if(typeof renderCustomCuentasList==='function') renderCustomCuentasList();
  if(typeof renderTCDashboard==='function') renderTCDashboard();
  // FIX: faltaba acá — la pantalla de Tarjetas (renderTCScreen) solo se
  // actualizaba al crear/editar/eliminar una tarjeta. Si Firestore traía
  // los datos DESPUÉS de haber entrado a la pantalla (o mientras estaba
  // abierta), se quedaba pegada mostrando el estado vacío ("$0 · Agregar
  // tarjeta de crédito") hasta que alguna acción la forzara a redibujar.
  if(typeof renderTCScreen==='function') renderTCScreen();
}


/* ---- ANÁLISIS FINANCIERO: migrado a js/modules/analisis.js (renderAnalisis, Ingresos Fijos, Presupuestos).
   calcPatrimonioTotal()/snapshotPatrimonio() se quedan acá — son núcleo, los llama save() en cada guardado. ---- */

// Nu: cajitas, metas de ahorro y CDTs (UI) migrados a js/modules/cuentas.js.

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
// js/modules/prestado.js — ver docs/prestado.md. La integración con
// Personas vive aparte, en prestado-personas.js, cargada más abajo — ver
// el comentario de ese archivo. El <script src> real está más abajo,
// junto a mesada.js/spotify.js — depende de crearSplitWidget() y
// diffRegistrarInstancia(), definidos en este bloque de acá.

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
// existan. La integración con Personas vive aparte, en spotify-personas.js,
// cargada mucho más abajo — ver el comentario de ese archivo.

// Módulo Mesada migrado a js/modules/mesada.js — ver docs/mesada.md.
// Carga acá y no más arriba (donde vivía antes) porque depende de
// crearSplitWidget(), definido justo arriba en este mismo bloque —
// mismo criterio que Spotify: cargar donde la dependencia más
// exigente ya esté satisfecha.
