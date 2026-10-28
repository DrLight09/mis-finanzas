// Núcleo de la app: estado global S, load()/save(), motor de mover plata
// (descontarFuente/sumarFuente/getFuentes/getSaldoFuente), helpers usados
// por absolutamente todos los módulos (fmt, fmtNoCents, uid, hoy, escHtml,
// mesKey, parseMoney, parsePct, toast, dialogo), calcPatrimonioTotal/
// snapshotPatrimonio, los helpers centralizados _esGastoVarNoReal/
// _esEntradaEspejoNoIngreso, y la definición BASE de refresh() (se envuelve
// después vía hookGlobal(), ver js/core/gastos-fijos-progress.js y
// js/core/mejoras-adicionales.js) — extraído de index.html. Debe cargar ANTES que cualquier módulo de
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
      // FIX (auditoria-tecnica.md, hallazgo repetido en 8 módulos): f.label
      // puede ser texto libre editado por el usuario (nombre de cuenta
      // personalizada, cajita, etc.) — se escapa acá, en la función núcleo
      // compartida, en vez de en cada caller. `val` también se escapa por
      // las dudas (va dentro de un atributo con comillas dobles).
      return `<option value="${escHtml(val)}"${val === selectedVal ? ' selected' : ''}>${escHtml(label)}</option>`;
    })
    .filter(Boolean)
    .join('');
  return `<option value="">${placeholder}</option>${opts}`;
}

/* ---- Resto del motor de Diferencial (diffRenderPartes, diffCalcular, diffResumen,
   _diffActualizarMiCuenta, diffValidarIntercambios, diffAplicar, diffHtmlBloque,
   diffRenderHistorial, _diffFuentesOptsHtml, _diffInstancias) ----
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
  nuRate:null,cajitas:[], // nuRate: tasa EA % de TODAS las cajitas de Nu (null = sin configurar; ver nuTasaConfigurada() en nu-calc.js)
  personas:[],
  deudores:[],misDeudas:[],mesadas:{papa:{cuotas:{},pagos:{}},mama:{cuotas:{},pagos:{}}},mesadaAnio:new Date().getFullYear(),
  spotify:{personas:[],costo:0,cajitaId:'',historial:[]}, // todo el estado de Spotify en una llave (migración v9); ver _ensureSpotify()
  gastosFijos:[],
  pagosGastosFijos:{},
  gastosVar:[],
  encargos:[],
  movimientos:[],
  libro:[],
  modulos:{mesada:true,spotify:true},
  catsVar:[],
  catsFijo:[],
  cuentas:[{id:'nequi',tipo:'nequi',saldo:0},{id:'efectivo',tipo:'efectivo',saldo:0}],
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
      gastos:{opsAviso:2,opsBloqueo:5},
      alcancia:{opsAviso:2,opsBloqueo:5},
      plata_comprometida:{opsAviso:2,opsBloqueo:5}
    }
  }
  // alcancia: {saldoRegistrado, depositos, fechaInicio, movimientos:[{id,monto,fecha,tipo,tipoLabel,desc,fuenteOrigen,ts,partes?}], historial:[...]}
  //   tipo: yo-cuenta|yo-directo|regalo|mandado|cobro-deuda (un solo origen) | multi (varios: partes:[{origen,monto,fuente?,movId}])
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
// cuentas: modelo único de cuentas (ver "CUENTAS: MODELO ÚNICO" más abajo). Nequi y Efectivo:
//   {id:'nequi'|'efectivo', tipo, saldo}. Personalizadas:
//   {id, tipo:'custom', nombre, icono, color, saldo, movimientos:[{id,tipo,monto,fecha,nota}]}
// (reemplaza a S.nequiSaldo, S.efectivoSaldo y S.cuentasPersonalizadas)
// Cajita structure: {id, nombre, saldo (saldo actual total con intereses ya "materializados"),
//   fecha (reloj de sus intereses: último sellado de intereses o primer depósito; NO la fecha de creación),
//   cdts: [{monto, tasa, inicio, vence, ...}]}  — la tasa EA de la cajita es S.nuRate (una sola para todas);
//   solo cada CDT guarda su propia tasa.
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
// Formato del saldo en el selector de Cuentas (todas las cuentas, fijas y personalizadas,
// pasan por acá desde renderSelectorCuentas() en cuentas.js). Hoy: solo entero con puntos de
// mil, truncado. Cambiar el formato del selector (redondear, agregar "COP", etc.) es editar
// esta función — el detalle de cada cuenta sigue usando fmt() con centavos.
function fmtSaldoSelector(n){return fmtNoCents(n);}
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
  return {id:uid(),tipo:'apertura',clase:'ajuste',monto,fecha:fecha||hoy(),desc:nota||'Saldo inicial',nota:nota||'Saldo inicial'};
}
// Escapa caracteres HTML para prevenir XSS al insertar datos de usuario en innerHTML
function escHtml(s){if(!s&&s!==0)return '';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function mesKey(d){return d?d.substring(0,7):'';}

// Pinta un elemento .avatar con el color de una persona del sistema unificado
// (S.personas). Antes vivía copiado byte a byte en encargos.js, prestado.js y
// spotify.js (los 3 módulos con integración de Personas) — spotify.js y
// encargos.js lo tenían repetido dos veces cada uno, con leves variantes de
// opacidad según el contexto (selector activo vs. avatar ya pintado en una
// lista/detalle). Centralizado acá porque olvidarse de aplicarlo en un lugar
// nuevo ya causó un bug real (renderEncargosList() sin esta lógica, ver
// CHANGELOG.md#encargos) — con una sola función, ese olvido deja de ser posible.
//
// opts.mostrar     — si el avatar arranca oculto (display:none) y hay que
//                     mostrarlo (ej. justo después de elegir persona en un
//                     selector). Default: no lo toca.
// opts.conIniciales — si hay que escribir las iniciales en el avatar (ej. un
//                     selector recién confirmado). Default: true. Ponlo en
//                     false si el avatar ya tiene sus iniciales de un render
//                     previo y solo hace falta actualizar el color.
// opts.alphaFondo / opts.alphaBorde — sufijo hex de opacidad para el color de
//                     fondo/borde ('22'/'44' es el par usado en selectores;
//                     '1a'/'33' el usado en algunos listados). Default: '22'/'44'.
function pintarAvatarPersona(av, persona, opts){
  if(!av||!persona)return;
  opts=opts||{};
  const color=persona.color||'#60b0f0';
  const alphaFondo=opts.alphaFondo||'22';
  const alphaBorde=opts.alphaBorde||'44';
  if(opts.mostrar)av.style.display='flex';
  av.style.background=color+alphaFondo;
  av.style.color=color;
  av.style.borderColor=color+alphaBorde;
  if(opts.conIniciales!==false)av.textContent=iniciales(persona.nombre);
}

/* ---- CUENTAS: MODELO ÚNICO ----
   S.cuentas es la única fuente de verdad de los saldos de Nequi, Efectivo y las cuentas
   personalizadas (Nu sigue en S.cajitas). Antes eran tres campos distintos: S.nequiSaldo,
   S.efectivoSaldo y S.cuentasPersonalizadas, y save() releía los dos primeros de inputs
   ocultos del DOM. Ya no hay inputs: el saldo se lee y se escribe en el objeto de la cuenta.
     Nequi / Efectivo : {id:'nequi'|'efectivo', tipo, saldo}   (nombre y color viven en el
                         descriptor de cuentas.js: son cuentas fijas de la app)
     Personalizada    : {id, tipo:'custom', nombre, icono, color, saldo, movimientos:[...]}
   Identificador de fuente en toda la app: 'nequi' | 'efectivo' | 'custom:ID'.
   Garantía (_cuentasArr): S.cuentas siempre existe y siempre trae Nequi y Efectivo; si faltan
   (documento nuevo, nube vacía, backup sin 'cuentas') se crean en 0. La migración desde los campos
   viejos (migrarCuentasLegacy) se eliminó el 2026-10-05: el único documento existente ya estaba
   migrado y desde ahí las cuentas se crean ya en el modelo nuevo. Un backup en el formato viejo
   se rechaza al importar (ver _validarEstructuraJSON en configuracion.js). */
/* ---- CUENTAS FIJAS: nombre, color y badge en UN solo lugar ----
   Nequi, Nu y Efectivo no viven en S.cuentas con nombre propio (Nu ni siquiera vive ahí), así que
   antes su nombre/color/clase de badge estaban escritos a mano en fuenteLabel(), fuenteBadgeClass(),
   getFuentes() y en cuentas.js. Ahora esos datos salen de acá. cuentas.js (lazy) le suma a cada
   descriptor lo que solo él necesita: ícono, saldo, estilo del selector (CUENTAS_FIJAS_SELECTOR).
   Campos: fuente ('nequi'|'nu'|'efectivo'), nombre, color (texto, puede ser var(--x)),
   rgb ("r,g,b" para bordes/fondos), badge (clase CSS de fuenteBadgeClass). */
const CUENTAS_FIJAS=[
  {fuente:'nequi',   nombre:'Nequi',   color:'#ff4da6',         rgb:'229,0,116',  badge:'bg-nequi'},
  {fuente:'nu',      nombre:'Nu',      color:'var(--nu-light)', rgb:'192,96,240', badge:'bg-nu'},
  {fuente:'efectivo',nombre:'Efectivo',color:'var(--amber)',    rgb:'240,184,64', badge:'bg-amber'}
];
// Cuenta fija por su fuente; undefined si no es una de las tres (cajita:ID, custom:ID, tc:ID…).
function getCuentaFija(fuente){return CUENTAS_FIJAS.find(d=>d.fuente===fuente);}
/* Cuentas con pantalla propia (hoy solo Nu). cuentas.js es la capa genérica de cuentas y NO conoce a Nu: cada
   cuenta con pantalla propia se registra acá (desde su archivo, al cargar) y cuentas.js le pregunta lo que necesita.
   Vive en el núcleo para que el orden de carga de los archivos lazy no importe.
   CuentaPantallas[fuente] = {
     paneles: [ids de sus paneles dentro de #screen-cuentas],  // _showCuentasPanel los oculta/muestra
     panel:   id del panel que se abre al tocar la cuenta en el selector,
     reiniciar(),         // al abrir cualquier cuenta o volver al selector: deja en blanco su estado interno (cajita abierta…)
     render(),            // pinta su detalle (renderDetalleCuenta)
     actualizarBotones()  // botones de Mover/Transferir de sus pantallas (actualizarBotonesTransferir)
   } */
const CuentaPantallas={};
function _cuentasArr(){
  if(!Array.isArray(S.cuentas))S.cuentas=[];
  ['nequi','efectivo'].forEach(id=>{if(!S.cuentas.some(c=>c.id===id))S.cuentas.push({id,tipo:id,saldo:0});});
  return S.cuentas;
}
// Cuenta por id: 'nequi' | 'efectivo' | id de una personalizada. undefined si no existe.
function getCuenta(id){return _cuentasArr().find(c=>c.id===id);}
// Solo personalizadas (undefined si el id es de una cuenta fija o ya no existe).
function getCuentaCustom(id){const c=getCuenta(id);return c&&c.tipo==='custom'?c:undefined;}
// Lista de personalizadas, en el orden en que se crearon.
function cuentasCustom(){return _cuentasArr().filter(c=>c.tipo==='custom');}
// Cuenta a partir de una fuente ('nequi' | 'efectivo' | 'custom:ID'); undefined para el resto.
function getCuentaDeFuente(fuente){
  if(!fuente)return undefined;
  if(fuente==='nequi'||fuente==='efectivo')return getCuenta(fuente);
  if(fuente.startsWith('custom:'))return getCuentaCustom(fuente.slice('custom:'.length));
  return undefined;
}

/* ---- LIBRO DE MOVIMIENTOS ----
   S.libro es la lista de entradas de plata de las cuentas con saldo (nequi, efectivo, custom:ID, cajita:ID): una entrada por
   cada cambio de saldo. Regla central: el saldo guardado de una cuenta == la suma de sus entradas (Libro.verificar).
   Vive en el núcleo porque sumarFuente/descontarFuente (la puerta única de saldos) lo necesitan en CUALQUIER pantalla.
   Entrada: { id, fecha, cuenta, monto (con signo), tipo, desc?, origen:{modulo, ref?, rev?} }
     tipo: 'apertura' | 'movimiento' | 'reversion' | 'rendimiento' | 'ajuste' | 'cdt'
   Documentación: libro-de-movimientos.md. */
const Libro = (() => {
  const TOL = 0.01; // diferencia máxima tolerada entre el saldo guardado y el libro
  let _seq = 0, _ctx = null;
  const _arr = x => (Array.isArray(x) ? x : []);
  const _id = () => 'l' + Date.now().toString(36) + (_seq++).toString(36);
  const esCuenta = k => typeof k === 'string' && (k === 'nequi' || k === 'efectivo' || k.startsWith('custom:') || k.startsWith('cajita:'));

  function _cuentasDe(st) {
    const out = {};
    _arr(st.cuentas).forEach(c => { if (c && c.id) out[c.tipo === 'custom' ? 'custom:' + c.id : c.id] = { saldo: c.saldo || 0, nombre: c.tipo === 'custom' ? (c.nombre || c.id) : c.id }; });
    _arr(st.cajitas).forEach(c => { if (c && c.id) out['cajita:' + c.id] = { saldo: c.saldo || 0, nombre: (c.nombre || 'Cajita') + ' (Nu)' }; });
    return out;
  }

  // Contexto de origen para código SÍNCRONO: Libro.conOrigen({modulo, ref, rev}, () => { sumarFuente(...); ... }).
  function conOrigen(origen, fn) { const prev = _ctx; _ctx = origen; try { return fn(); } finally { _ctx = prev; } }

  // Añade una entrada. `o`: { tipo, desc, origen, fecha }. Devuelve su id (o null si la cuenta no tiene saldo en el libro).
  function registrar(cuenta, monto, o, estado) {
    if (!esCuenta(cuenta) || !monto) return null;
    const st = estado || S; if (!Array.isArray(st.libro)) st.libro = [];
    o = o || {};
    const og = o.origen || _ctx || { modulo: 'sin-origen' };
    const fecha = o.fecha || hoy(), tipo = o.tipo || (og.rev ? 'reversion' : 'movimiento');
    if (tipo === 'rendimiento') { // intereses: una entrada por cuenta y mes (evita ~1 entrada/día/cajita)
      const mes = fecha.slice(0, 7);
      for (let i = st.libro.length - 1, n = 0; i >= 0 && n < 400; i--, n++) {
        const l = st.libro[i];
        if (l && l.cuenta === cuenta && l.tipo === 'rendimiento' && String(l.fecha).slice(0, 7) === mes) { l.monto += monto; if (fecha > l.fecha) l.fecha = fecha; return l.id; }
      }
    }
    const reg = { id: _id(), fecha, cuenta, monto, tipo };
    if (o.desc) reg.desc = o.desc;
    reg.origen = og;
    st.libro.push(reg);
    return reg.id;
  }

  // Saldo guardado vs suma del libro, por cuenta. ok=false → algún código movió un saldo sin pasar por la puerta única.
  function verificar(estado) {
    const st = estado || S, cu = _cuentasDe(st), suma = {};
    _arr(st.libro).forEach(l => { if (l && cu[l.cuenta]) suma[l.cuenta] = (suma[l.cuenta] || 0) + (l.monto || 0); });
    const filas = Object.keys(cu).map(k => ({ cuenta: k, nombre: cu[k].nombre, guardado: cu[k].saldo, libro: suma[k] || 0, dif: cu[k].saldo - (suma[k] || 0) }));
    const descuadres = filas.filter(f => Math.abs(f.dif) >= TOL);
    return { ok: descuadres.length === 0, filas, descuadres };
  }
  const saldo = (cuenta, estado) => _arr((estado || S).libro).reduce((a, l) => (l && l.cuenta === cuenta ? a + (l.monto || 0) : a), 0);

  // Entradas que NINGÚN registro de módulo representa (no tienen fila propia en el historial de una cuenta): intereses de Nu,
  // ajustes y CDT. getMovimientosCuenta() (cuentas.js) las añade como filas para que el historial explique TODO el saldo.
  function entradasVisibles(estado) {
    return _arr((estado || S).libro).filter(l => l && esCuenta(l.cuenta) && (l.tipo === 'rendimiento' || l.tipo === 'ajuste' || l.tipo === 'cdt'));
  }

  return { esCuenta, registrar, conOrigen, verificar, entradasVisibles, saldo, TOL };
})();
if (typeof window !== 'undefined') window.Libro = Libro; // los tests lo leen como ctx.Libro

/* ---- MOVER PLATA ENTRE CUENTAS ---- */
// Todo cambio de saldo de una cuenta con saldo (Nequi, Efectivo, personalizadas, cajitas de Nu) pasa por sumarFuente /
// descontarFuente / ajustarSaldoCuenta y deja una entrada en S.libro, de modo que el saldo guardado SIEMPRE sea la suma
// del libro. Ningún módulo debe escribir `c.saldo` directamente.
// `opts` (opcional, en ambas): { tipo, desc, origen:{modulo, ref, rev}, fecha } — qué es el movimiento y quién lo originó.
// Sin `origen` queda como 'sin-origen' (o el de Libro.conOrigen).
const _libroPata = (fuente, monto, opts) => Libro.registrar(fuente, monto, opts);
// Fija el saldo de una cuenta a `nuevoSaldo` (intereses de Nu, chequeo rápido, CDT…) y registra la DIFERENCIA en el
// libro. Devuelve esa diferencia. Es la única forma permitida de asignar un saldo "absoluto".
function ajustarSaldoCuenta(fuente,nuevoSaldo,opts){
  const c=fuente.startsWith('cajita:')?(S.cajitas||[]).find(x=>x.id===fuente.split(':')[1]):getCuentaDeFuente(fuente);
  if(!c)return 0;
  const delta=nuevoSaldo-(c.saldo||0);
  c.saldo=nuevoSaldo;
  if(Math.abs(delta)>1e-9)_libroPata(fuente,delta,opts);
  return delta;
}
// Restar plata de una fuente. Antes recortaba el saldo en 0 (y la diferencia se perdía sin avisar); ahora el saldo
// refleja exactamente lo restado, aunque quede negativo — los selectores ya solo ofrecen cuentas con saldo
// suficiente, así que un negativo indica un movimiento mal registrado y se ve en vez de esconderse.
function descontarFuente(fuente,monto,opts){
  if(!fuente||!monto)return;
  if(fuente==='ganancia'){
    // Plata virtual: no salió de ninguna cuenta real, es ganancia futura
    return;
  }
  if(fuente==='nequi'||fuente==='efectivo'||fuente.startsWith('custom:')){
    const c=getCuentaDeFuente(fuente);
    if(c){c.saldo=(c.saldo||0)-monto;_libroPata(fuente,-monto,opts);}
  } else if(fuente.startsWith('cajita:')){
    const id=fuente.split(':')[1];
    const c=(S.cajitas||[]).find(x=>x.id===id);
    if(c){
      // FIX 2026-08-13: materializarIntereses (nu.js, grupo lazy) sin
      // guard acá — a diferencia del guard que ya existía en firebase-sync.js
      // (arranque), este vive en descontarFuente(), el motor de mover plata
      // usado desde CUALQUIER módulo (Gastos, Encargos, Préstamos) cuando la
      // fuente es una cajita Nu, no solo desde Cuentas. Si nu.js no
      // cargó, se salta la materialización del interés del día (mismo
      // riesgo ya aceptado para mesada/tarjetas: el saldo puede quedar sin
      // el interés de ese día hasta que se visite Cuentas) en vez de tumbar
      // el gasto/movimiento completo con un ReferenceError.
      if(typeof materializarIntereses==='function') materializarIntereses(c);
      c.saldo=(c.saldo||0)-monto;
      _libroPata(fuente,-monto,opts);
      const el=document.getElementById('cs_'+c.id);if(el)el.value=fmtInput(c.saldo);
    }
  } else if(fuente.startsWith('tc:')){
    // Para TC: descontar = hacer una compra = aumentar la deuda
    const id=fuente.split(':')[1];
    const tc=(S.tarjetasCredito||[]).find(x=>x.id===id);
    if(tc)tc.deuda=(tc.deuda||0)+monto;
  }
}
function sumarFuente(fuente,monto,opts){
  if(!fuente||!monto)return;
  if(fuente==='nequi'||fuente==='efectivo'||fuente.startsWith('custom:')){
    const c=getCuentaDeFuente(fuente);
    if(c){c.saldo=(c.saldo||0)+monto;_libroPata(fuente,monto,opts);}
  } else if(fuente.startsWith('cajita:')){
    const id=fuente.split(':')[1];
    const c=(S.cajitas||[]).find(x=>x.id===id);
    if(c){
      // Ver nota equivalente en descontarFuente() más arriba.
      if(typeof materializarIntereses==='function') materializarIntereses(c);
      c.saldo=(c.saldo||0)+monto;
      _libroPata(fuente,monto,opts);
      const el=document.getElementById('cs_'+c.id);if(el)el.value=fmtInput(c.saldo);
    }
  } else if(fuente.startsWith('tc:')){
    // Para TC: sumar = revertir compra = disminuir la deuda
    const id=fuente.split(':')[1];
    const tc=(S.tarjetasCredito||[]).find(x=>x.id===id);
    if(tc)tc.deuda=Math.max(0,(tc.deuda||0)-monto);
  }
}

// Cuentas personalizadas migradas a js/modules/cuentas.js (ver docs/cuentas.md).
// Lista de cuentas que se pueden elegir como origen/destino. Orden: cajitas de Nu, Nequi, Efectivo,
// personalizadas y (si incluirTC) tarjetas activas. getFuentes() y getFuentesSinTC() son la misma
// lista, con y sin TC — antes eran dos copias casi idénticas.
function _listaFuentes(incluirTC){
  const arr=[];
  (S.cajitas||[]).forEach(c=>{if(!c.esCDT)arr.push({val:'cajita:'+c.id,label:c.nombre+' (Nu)'});});
  ['nequi','efectivo'].forEach(f=>arr.push({val:f,label:getCuentaFija(f).nombre}));
  cuentasCustom().forEach(c=>arr.push({val:'custom:'+c.id,label:c.nombre}));
  if(incluirTC)(S.tarjetasCredito||[]).filter(tc=>(tc.estado||'activa')==='activa').forEach(tc=>arr.push({val:'tc:'+tc.id,label:tc.nombre+' (TC)'}));
  return arr;
}
function getFuentes(){return _listaFuentes(true);}
function getFuentesSinTC(){return _listaFuentes(false);}

function fuenteLabel(val){
  if(!val)return'Sin especificar';
  if(val==='alcancia')return'Alcancía';
  if(val==='ganancia')return'<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ico-inline"><ellipse cx="12" cy="17" rx="8" ry="5"/><path d="M4 17v-4c0-2.76 3.58-5 8-5s8 2.24 8 5v4"/><path d="M4 13c0-2.76 3.58-5 8-5s8 2.24 8 5"/></svg> Ganancia (no desembolsada)';
  if(val==='nequi'||val==='efectivo')return getCuentaFija(val).nombre;
  if(val.startsWith('cajita:')){
    const id=val.split(':')[1];
    const c=(S.cajitas||[]).find(x=>x.id===id);
    return c?c.nombre+' (Nu)':'Cajita Nu';
  }
  if(val.startsWith('custom:')){
    const id=val.split(':')[1];
    const c=getCuentaCustom(id);
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
  if(val==='nequi'||val==='efectivo')return getCuentaFija(val).badge;
  if(val.startsWith('cajita:'))return getCuentaFija('nu').badge;
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
  if(fuente==='nequi'||fuente==='efectivo'||fuente.startsWith('custom:')){
    const c=getCuentaDeFuente(fuente);
    return c?c.saldo||0:0;
  }
  if(fuente.startsWith('cajita:')){
    const id=fuente.split(':')[1];
    const c=(S.cajitas||[]).find(x=>x.id===id);
    return c?calcC(c).val:0;
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
// ¿Se puede sacar `monto` de esta fuente? Un solo lugar para el "Saldo/Cupo insuficiente" que antes
// escribía a mano cada módulo (Gastos, Spotify…) con redacción distinta y, en Spotify, sin escapar el
// nombre de la cuenta antes de toast() (que pinta HTML). Devuelve {ok:true} o {ok:false, mensaje}, con
// `mensaje` YA escapado y listo para toast(). No toca el DOM ni los saldos.
//  · Cuenta/cajita: falla si el saldo disponible es menor que el monto.
//  · TC: falla solo si la tarjeta tiene cupo configurado y el cupo disponible no alcanza (sin cupo, no
//    hay límite que validar; una TC inexistente tampoco bloquea: eso lo decide quien la busca).
//  · Fuente vacía: ok (el gasto "sin especificar" no mueve plata).
// Comparación estricta (disponible < monto), igual que los módulos que la usaban.
function validarSalidaFuente(fuente,monto){
  if(!fuente)return{ok:true};
  const disp=getSaldoFuente(fuente);
  if(fuente.startsWith('tc:')){
    const tc=(S.tarjetasCredito||[]).find(x=>x.id===fuente.slice(3));
    if(tc&&tc.cupo&&disp<monto)return{ok:false,mensaje:'Cupo insuficiente en '+escHtml(fuenteLabel(fuente))+'. Disponible: '+fmt(disp)};
    return{ok:true};
  }
  if(disp<monto)return{ok:false,mensaje:'Saldo insuficiente en '+escHtml(fuenteLabel(fuente))+'. Disponible: '+fmt(disp)};
  return{ok:true};
}

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
   migraciones antiguas (las de las versiones 8 y 9 se plegaron en el modelo actual: una sola tasa de Nu, S.nuRate, y todo
   Spotify en S.spotify). Quien trae datos de un esquema menor los ve marcados (S._esquemaAnterior) y empieza de cero
   (Configuración → Borrar todo); un backup de esa versión se rechaza al importar.

   Para cambiar la forma de los datos guardados en el futuro: sumar { v: N+1, nombre, fn(d) } al final de MIGRACIONES. `fn`
   recibe el objeto de datos y lo modifica en sitio; debe ser idempotente. Nunca editar ni reordenar una existente. Corren UNA
   vez, en orden, sobre el estado cargado de Firestore y, vía aplicarMigraciones(), sobre un backup JSON antes de importarlo.
   La versión guardada vive en S.schemaVersion. */
const SCHEMA_BASE = 9;     // primera versión compatible (y la actual mientras MIGRACIONES esté vacía)
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
  if(typeof S.spotify.cajitaId!=='string')S.spotify.cajitaId='';
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
  _cuentasArr(); // garantiza S.cuentas con Nequi y Efectivo (ver "CUENTAS: MODELO ÚNICO")
  if(!S.catsVar)S.catsVar=[];
  if(!S.catsFijo)S.catsFijo=[];
  if(!S.patrimonioHistorial)S.patrimonioHistorial=[];
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
  const nuTasaEl=document.getElementById('nuTasaGlobal');
  if(nuTasaEl)nuTasaEl.value=nuTasaConfigurada()?nuTasaATexto(S.nuRate):'';
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
  // PROTECCIÓN: no guardar si los datos aún no se han cargado desde Firebase.
  // Esto evita sobreescribir datos válidos con el estado inicial vacío.
  if(window._fbLoadData && !window._dataLoaded) {
    console.warn('[save] Bloqueado: datos de Firebase aún no cargados.');
    return;
  }
  // Cuota mensual por año — guardada en S.mesadas[parent].cuotas[anio]
  // Cuotas de Mesada y costo de Spotify: los inputs escriben directo en S (ver
  // _bindInputsAS() en sheet-stack.js); save() ya no lee nada del DOM.
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

/* ---- SNAPSHOT PATRIMONIO ---- */
function _saldoCPAjeno(){
  // Calcula cuánta plata comprometida ajena está físicamente en cuentas propias.
  // Son destinos de ingresos ya recibidos donde el dinero es de otra persona
  // (gastos de cajita/nequi/efectivo pendientes de pagar, y plata para TC aún en cajita).
  // Una vez que se paga (yaPague=true) la plata ya salió → no restar.
  let total = 0;
  (S.plataComprometida||[]).forEach(item => {
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
  const nu=(S.cajitas||[]).reduce((a,c)=>a+calcC(c).val,0);
  const cdts=(S.cajitas||[]).reduce((a,c)=>a+(c.cdts||[]).reduce((b,cdt)=>b+calcCDT(cdt).val,0),0);
  // NOTA: ya NO se resta plata de encargos guardada en Nequi/Efectivo/cuentas
  // personalizadas. Registrar una entrada de encargo con esa cuenta es solo
  // metadata de dónde está físicamente esa plata — nunca suma nada al saldo
  // real de la cuenta (a diferencia de una cajita de Nu, donde sí forma parte
  // de la base que gana interés en calcC()/_saldoEncargosEnCajita()). Restarla
  // acá contaba de menos un patrimonio que en realidad nunca se sumó. Ver
  // CHANGELOG.md#encargos.
  const nequi=getSaldoFuente('nequi');
  const ef=getSaldoFuente('efectivo');
  // Deudas (calc-helpers.js, carga de entrada) — calcPatrimonioTotal() corre en
  // CADA save() de la app (vía snapshotPatrimonio), no solo en refresh().
  const prest=typeof Deudas!=='undefined'?Deudas.totalPendiente('favor'):0;
  const custom=cuentasCustom().reduce((a,c)=>a+(c.saldo||0),0);
  const deudaTC=(S.tarjetasCredito||[]).reduce((a,tc)=>a+(tc.deuda||0),0);
  // Lo que le debo a otras personas (S.misDeudas) — esa plata está físicamente en
  // mis cuentas pero no es mía, así que se resta igual que la deuda de TC.
  const misDeudas=typeof Deudas!=='undefined'?Deudas.totalPendiente('contra'):0;
  // Restar plata comprometida ajena que está físicamente en cuentas propias
  // (igual que se restan encargos) — es plata de otras personas que administras
  const cpAjeno = _saldoCPAjeno();
  // Alcancía: el saldo registrado es plata real tuya aunque esté "oculta"
  const alcancia = (S.alcancia && S.alcancia.saldoRegistrado) ? S.alcancia.saldoRegistrado : 0;
  return nu+cdts+nequi+ef+prest+custom+alcancia-deudaTC-misDeudas-cpAjeno;
}

// calcC/calcCDT (nu-calc.js) y Deudas (calc-helpers.js) son núcleo de carga de
// entrada, así que el patrimonio ya no depende de ningún módulo lazy: el snapshot
// siempre se puede tomar. Se conserva la función como guard mínimo por si el
// orden de <script> se rompiera (un snapshot sin estas piezas grabaría un valor
// artificialmente bajo en S.patrimonioHistorial).
function _patrimonioDependenciasListas(){
  return typeof calcC==='function'
      && typeof calcCDT==='function'
      && typeof Deudas!=='undefined';
}

// Ajuste por destape de la alcancía, por fecha: sobrante (+) o faltante (−) entre el efectivo real y
// lo que estaba registrado. Es plata que ya existía y no estaba anotada (o dinero que faltaba), no
// crecimiento del día: se suma a `montoBase` para que ni la gráfica de Análisis ni la Proyección lo
// tomen como ritmo normal de ahorro (2026-09-29). Sigue contando como ingreso/gasto del mes en Análisis.
// - Sobrante: S.movimientos, tipo 'entrada', _esAlcancia (sin _esAlcanciaIngreso, que son depósitos).
// - Faltante: S.gastosVar con _esAlcanciaAjuste.
function _ajusteAlcanciaPorFecha(){
  const r={};
  (S.movimientos||[]).forEach(m=>{
    if(m&&m.tipo==='entrada'&&m._esAlcancia&&!m._esAlcanciaIngreso&&m.fecha){ r[m.fecha]=(r[m.fecha]||0)+(m.monto||0); }
  });
  (S.gastosVar||[]).forEach(g=>{
    if(g&&g._esAlcanciaAjuste&&g.fecha){ r[g.fecha]=(r[g.fecha]||0)-(g.monto||0); }
  });
  return r;
}

// Recalcula `montoBase` de cada punto del historial de patrimonio a partir de los datos actuales (aperturas, ajustes de
// saldo inicial, destapes de alcancía y deudas sin pata de caja). load() la llama en cada carga, así las correcciones
// valen también hacia atrás sin migración; scripts/conciliacion.js la usa para medir lo mismo que ve la app.
function recalcularMontoBaseHistorial(){
  // Eliminar un saldo inicial ya no deja ningún registro aparte (ver purgarAperturaDelHistorial): la base sale solo de
  // lo que existe. `_ajustesBaseLog` era ese registro y, con el movimiento ya borrado, quedaba como un ajuste negativo
  // sin respaldo que inflaba la gráfica; se retira de los datos que aún lo traen.
  delete S._ajustesBaseLog;
  // Calcular el monto exacto de aperturas y ajustes de saldo inicial por fecha en el historial de patrimonio. Así la
  // tendencia mensual descuenta solo esa parte del cambio del día y conserva cualquier ingreso real que haya ocurrido
  // la misma fecha, sin tener que esperar a un nuevo snapshot.
  if(S.patrimonioHistorial.length){
    const montoAperturaPorFecha = {};
    const sumarApertura=(m)=>{
      if(m.tipo==='apertura'){ montoAperturaPorFecha[m.fecha]=(montoAperturaPorFecha[m.fecha]||0)+(m.monto||0); }
      if(m._ajustes){ m._ajustes.forEach(aj=>{ montoAperturaPorFecha[aj.fecha]=(montoAperturaPorFecha[aj.fecha]||0)+(aj.monto||0); }); }
    };
    (S.movimientos||[]).forEach(sumarApertura);
    // Destapes de alcancía ya hechos (sobrante/faltante): mismo tratamiento que una apertura — ver _ajusteAlcanciaPorFecha().
    const _ajAlc=_ajusteAlcanciaPorFecha();
    Object.keys(_ajAlc).forEach(f=>{ montoAperturaPorFecha[f]=(montoAperturaPorFecha[f]||0)+_ajAlc[f]; });
    // Deudas sin pata de caja (ver _movsDeudaSinCuenta): ajuste de base, no crecimiento. Vale hacia atrás: se recalcula en cada carga.
    const _ajDeu=_ajusteDeudasSinCuentaPorFecha();
    Object.keys(_ajDeu).forEach(f=>{ montoAperturaPorFecha[f]=(montoAperturaPorFecha[f]||0)+_ajDeu[f]; });
    S.patrimonioHistorial.forEach(h=>{
      if(montoAperturaPorFecha[h.fecha]&&montoAperturaPorFecha[h.fecha]!==0){ h.montoBase=montoAperturaPorFecha[h.fecha]; }
      else { delete h.baseAjustada; delete h.montoBase; } // sin respaldo en los datos actuales: se limpia (p. ej. se borró el préstamo sin cuenta que lo originó)
    });
  }
}

// Movimientos de DEUDAS que cambian el patrimonio sin pasar por ninguna cuenta ("sin pata de caja"): un préstamo
// "Me deben" sin cuenta ni tarjeta de origen (sube lo que te deben y ninguna cuenta baja → patrimonio +), un abono
// o pago recibido sin cuenta destino (baja lo que te deben y ninguna cuenta sube → −), y lo mismo en "Yo debo"
// (recibido sin cuenta → −, pago sin cuenta → +). No son ingreso ni gasto del mes: si se contaran como flujo,
// inflarían o hundirían el balance; y si no se descuentan de la tendencia, la gráfica y la proyección de Inicio
// los leen como crecimiento real (un solo préstamo de $500.000 sin cuenta llevó la proyección a 12 meses de
// +$1,2 M a +$6,7 M). Por eso se tratan como ajuste de base, igual que una apertura de cuenta (montoBase).
// Quedan fuera: los perdones (ya cuentan como gasto/ingreso), lo pagado con TC (`_viaTC`: la tarjeta es la otra
// pata) y los movimientos con `fuentes`/`destinos` repartidos (la diferencia puede ser un margen ya registrado).
// Si el movimiento trae `clase:'ingreso'` es plata nueva (p. ej. un regalo): cuenta como ingreso del mes y NO como base.
function _movsDeudaSinCuenta(estado){
  const st=estado||S, out=[];
  const veces=(lista,abre,reduce)=>(lista||[]).forEach(d=>(d.movimientos||[]).forEach(m=>{
    if(!m||!m.fecha||!(m.monto>0)||m._perdon||m._viaTC) return;
    if(m.fuente||m.destino||(m.fuentes&&m.fuentes.length)||(m.destinos&&m.destinos.length)) return;
    let signo=0;
    if(abre.indexOf(m.tipo)!==-1) signo=abre===ME_DEBEN_ABRE?1:-1;
    else if(reduce.indexOf(m.tipo)!==-1) signo=abre===ME_DEBEN_ABRE?-1:1;
    if(signo) out.push({m,deuda:d,fecha:m.fecha,monto:signo*m.monto,clase:m.clase});
  }));
  veces(st.deudores,ME_DEBEN_ABRE,['abono','pago-completo']);
  veces(st.misDeudas,YO_DEBO_ABRE,['pago','abono','pago-completo']);
  return out;
}
const ME_DEBEN_ABRE=['prestamo'], YO_DEBO_ABRE=['recibido'];
function _ajusteDeudasSinCuentaPorFecha(){
  const r={};
  _movsDeudaSinCuenta().forEach(x=>{ if(x.clase!=='ingreso') r[x.fecha]=(r[x.fecha]||0)+x.monto; });
  return r;
}

function snapshotPatrimonio(){
  if(!_patrimonioDependenciasListas()) return;
  const hoyStr=hoy();
  if(!S.patrimonioHistorial)S.patrimonioHistorial=[];
  const val=calcPatrimonioTotal();
  if(val==null||isNaN(val)){
    // Mismo motivo que el guard de refresh() más abajo: antes esto fallaba
    // en silencio total (ni siquiera un $0 en pantalla, solo un snapshot que
    // nunca se grababa). Ver CHANGELOG.md#patrimonio-y-cálculos-globales.
    console.error('[snapshotPatrimonio] calcPatrimonioTotal() dio', val, '— no se graba el punto de hoy. Revisar fechas corruptas u otra fuente de NaN.');
    return;
  }
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
    + (_ajusteAlcanciaPorFecha()[hoyStr]||0)
    + (_ajusteDeudasSinCuentaPorFecha()[hoyStr]||0);
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

// ── Eliminar un movimiento no deja rastro en el historial de patrimonio ─────────────────────────────────────────
// S.patrimonioHistorial guarda una instantánea por día (el patrimonio al cierre de ese día). Si después se elimina algo
// que ya estaba contado (un ingreso puesto por error, un gasto mal registrado), las instantáneas desde el día en que se
// creó siguen incluyéndolo: la gráfica mostraría un salto sin ningún movimiento que lo respalde. Quitar de esas
// instantáneas lo que cambió el patrimonio al eliminar hace que borrar equivalga a «nunca ocurrió». Cada flujo de
// eliminación mide el patrimonio antes de revertir y llama a purgarEfectoEnHistorial() antes de guardar. Editar un
// movimiento es eliminar y crear otro, así que queda cubierto por el mismo camino.
// Límite: el efecto se resta por igual en todos los días desde la creación; el interés que una cajita de Nu haya
// generado sobre ese dinero entre medias entra en el cálculo como si hubiera estado desde el primer día.

// Patrimonio total y el «visible» (sin Alcancía, el que guarda valorVisible), o null si no se puede medir.
function medirPatrimonioParaHistorial(){
  if(!_patrimonioDependenciasListas()) return null;
  const val=calcPatrimonioTotal();
  if(val==null||isNaN(val)) return null;
  const alc=(S.alcancia&&S.alcancia.saldoRegistrado)?S.alcancia.saldoRegistrado:0;
  return {val, vis:val-alc};
}

// Día (YYYY-MM-DD) en que el movimiento entró al patrimonio: el de su creación (ts, o la hora que lleva su id de uid()),
// no la fecha que el usuario le puso, que puede ser pasada. Sin ninguno de los dos, su fecha.
function diaCreacionMov(item){
  if(!item) return '';
  let ms=Number(item.ts);
  if(!Number.isFinite(ms)||ms<=0){
    const id=item.id!=null?item.id:item._id;
    ms=(typeof id==='string'&&/^[0-9a-z]{10,12}$/.test(id))?parseInt(id.slice(0,-3),36):NaN;
  }
  if(Number.isFinite(ms)&&ms>1.5778e12&&ms<=Date.now()+864e5){
    const d=new Date(ms);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  return item.fecha||'';
}

// Suma `delta` (y `deltaVisible`, por defecto igual) a las instantáneas con fecha >= dia.
function quitarDeHistorial(dia, delta, deltaVisible){
  if(!dia||!S.patrimonioHistorial) return;
  const dv=deltaVisible===undefined?delta:deltaVisible;
  const r=n=>Math.round(n*1e6)/1e6;
  S.patrimonioHistorial.forEach(h=>{
    if(!h.fecha||h.fecha<dia) return;
    h.valor=r((h.valor||0)+delta);
    if(h.valorVisible!=null) h.valorVisible=r(h.valorVisible+dv);
  });
}

// `antes` viene de medirPatrimonioParaHistorial() justo antes de revertir; `item` es lo que se eliminó.
function purgarEfectoEnHistorial(antes, item){
  const despues=medirPatrimonioParaHistorial();
  if(!antes||!despues) return;
  const d=despues.val-antes.val, dv=despues.vis-antes.vis;
  if(Math.abs(d)<0.005&&Math.abs(dv)<0.005) return;
  quitarDeHistorial(diaCreacionMov(item), d, dv);
}

// Un saldo inicial entró por partes: el monto original el día que se creó la cuenta y cada corrección (`_ajustes`, que
// confirmarEditarApertura deja con su fecha) el día en que se hizo. `m.monto` ya incluye las correcciones.
function purgarAperturaDelHistorial(m){
  if(!m) return;
  const ajustes=m._ajustes||[];
  const original=(m.monto||0)-ajustes.reduce((a,x)=>a+(x.monto||0),0);
  quitarDeHistorial(diaCreacionMov(m), -original);
  ajustes.forEach(x=>quitarDeHistorial(x.fecha, -(x.monto||0)));
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
// Nu: tasa EA (historial por tramos) y cálculo de CDTs migrados a js/modules/nu.js (el cálculo puro, a nu-calc.js).

function mesActual(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');}

function gastosMes(mesK){
  return(S.gastosVar||[]).filter(g=>mesKey(g.fecha)===mesK);
}

// Suma los ingresos fijos configurados que aplican para un mes dado (YYYY-MM)
function getIngresosFijosMes(mesK){ return Periodo.ingresosFijosDelMes(mesK); }

// ── CLASE EXPLÍCITA (docs/analisis-financiero.md y docs/libro-de-movimientos.md §7) ──
// Cada movimiento nace con `clase`: 'ingreso' (sube el patrimonio), 'gasto' (lo baja), 'neutro' (mueve plata sin cambiar el
// patrimonio: el "espejo" de Mesada, Préstamos, Encargos, plata comprometida…) o 'ajuste' (corrección de datos, ej. la apertura
// de una cuenta). Todo lector pasa por claseEfectivaMovimiento(): no hay otro camino que mire etiquetas ni textos.
const CLASES_MOV = ['ingreso', 'gasto', 'neutro', 'ajuste'];
const _claseValida = c => CLASES_MOV.indexOf(c) !== -1;

// ¿Esta entrada NO cuenta como ingreso real? Solo cuenta la que tiene `clase: 'ingreso'`; una sin clase no cuenta (y save() avisa).
function _esEntradaEspejoNoIngreso(m){
  if(!m) return false;
  return claseEfectivaMovimiento(m) !== 'ingreso';
}

// ── INGRESO REAL: UNA sola definición para Inicio, Análisis y Wrapped (2026-10-04) ──
// Antes cada pantalla armaba su propia lista: Inicio exigía además una cuenta (o
// `_prestadoDirectamente`) y sumaba por separado los `ingreso` de c.movimientos de las
// cuentas personalizadas; Análisis y Wrapped solo miraban S.movimientos. Esa condición
// de cuenta ya hizo fallar al perdón de "Yo debo" (subía el patrimonio pero no el
// ingreso del mes). Regla única: ingreso real = plata nueva que sube el patrimonio,
// tenga o no cuenta (el margen de un préstamo y el perdón recibido no la tienen).
//
// Devuelve la LISTA de movimientos que cuentan; cada pantalla filtra por fecha y suma.
//   · S.movimientos tipo 'entrada' que no sean espejo (_esEntradaEspejoNoIngreso), de CUALQUIER cuenta: Nequi, Efectivo,
//     personalizadas y cajitas de Nu (todas viven aquí, con `fuente`). Un espejo con clase 'ingreso'
//     (extra de Spotify, extra de un pago de deuda, perdón recibido) es plata NUEVA aunque entre directo a una cajita.
//   · Deudas sin pata de caja marcadas `clase:'ingreso'` (p. ej. un regalo registrado como "Me deben").
// `estado` es opcional (por defecto S): Wrapped recibe el estado como parámetro.
function entradasIngresoReal(estado){
  const st = estado || S;
  const lista = [];
  (st.movimientos||[]).forEach(m => {
    if(!m || m.tipo!=='entrada' || _esEntradaEspejoNoIngreso(m)) return;
    lista.push(m);
  });
  // Deudas sin pata de caja marcadas `clase:'ingreso'` (p. ej. un regalo registrado como "Me deben"): plata nueva.
  _movsDeudaSinCuenta(st).forEach(x=>{ if(x.clase==='ingreso'&&x.monto>0) lista.push({id:x.m.id,tipo:'entrada',monto:x.monto,fecha:x.fecha,desc:x.m.nota||('Ingreso vía '+(x.deuda.nombre||'deuda')),clase:'ingreso',_esDeudaSinCuenta:true}); });
  return lista;
}

// Suma de ingresos reales de un mes 'YYYY-MM' (no incluye mesada ni ingresos fijos:
// esos los suma cada pantalla aparte).
function ingresosRealesDelMes(mes, estado){
  return entradasIngresoReal(estado).reduce((a,m) => mesKey(m.fecha)===mes ? a+(m.monto||0) : a, 0);
}

// ¿Este gasto de S.gastosVar queda fuera del "gasto real" del mes (balance, salud financiera, ranking, presupuestos, cierre de
// mes)? Sí cuando su `clase` no es 'gasto': 'neutro' (pago de gasto fijo, que ya cuenta aparte; pago de TC, que cancela una deuda
// ya contada; alcancía, que solo cambió de lugar; extra de un préstamo gastado de inmediato). Un gasto sin clase cuenta como gasto,
// que es lo que es por estar en esta lista, y save() avisa del módulo que no la puso.
function _esGastoVarNoReal(g){
  if(!g) return false;
  const c = claseEfectivaMovimiento(g);
  return c ? c !== 'gasto' : false;
}

/* ---- TOAST ---- */
// REVERTIDO (2026-08-17): la versión anterior de este fix agregaba un 4º
// parámetro `msgEsHtml` y escapaba `msg` completo por defecto, asumiendo que
// el problema eran unas pocas llamadas con HTML intencional (íconos). Al
// revisar los ~63 call sites reales (alcancia/analisis/encargos/mesada/
// prestado/spotify/tarjetas_credito/cuentas/gastos.js) resultó que NINGUNO
// pasa HTML de ícono — pero la gran mayoría (~60) ya sigue el patrón
// establecido en todo el proyecto: escapar el texto libre en el punto de
// interpolación (`toast('Cuenta "'+escHtml(nombre)+'" creada')`, etc.), no
// en `toast()`. Escapar `msg` completo ahí adentro las hubiera
// DOBLE-escapado — cualquier mensaje con comillas o "&" literales
// (`Cuenta "${escHtml(nombre)}" creada`, con comillas fuera del escHtml)
// habría mostrado `&quot;`/`&amp;` en vez del carácter real. Se revierte a
// la firma y comportamiento original; los 3 bugs reales encontrados
// (texto libre interpolado SIN escHtml) se corrigieron en su lugar real:
// `encargos.js`/`guardarEditarEncargo()`, `prestado.js`/
// `guardarEditarMiDeuda()` (ambos: `nombre` del input sin escapar) y
// `diferencial.js`/`diffValidarIntercambios()` (`fuenteLabel(...)` sin
// escapar). Ver CHANGELOG.md para el detalle de esos tres.
function toast(msg, tipo='ok', dur=2800){
  // El color indica el RESULTADO de la acción, no el tipo de dato: 'ok' (se hizo: registrar, guardar, eliminar; verde) · 'salida'
  //       (se hizo y es plata que sale: verde con flecha, para distinguirla de una entrada sin confundirla con un error) · 'warn' (se
  //       hizo, pero con algo que revisar; ámbar) · 'err' (no se hizo o falló; rojo con X) · 'info' (neutro, nada cambió; azul).
  //       Los colores y el tamaño están en la clase .toast-<tipo> (CSS crítico de index.html, espejo en styles.css).
  const c=document.getElementById('toast-container');
  const el=document.createElement('div');
  const svg=(trazo,ancho)=>`<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${ancho}" stroke-linecap="round" stroke-linejoin="round">${trazo}</svg>`;
  const ICONOS={
    ok:svg('<polyline points="20 6 9 17 4 12"/>',3),
    salida:svg('<line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>',2.6),
    err:svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',3),
    warn:svg('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',2.5),
    info:svg('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',2.5)
  };
  el.className='toast toast-'+tipo;
  el.setAttribute('role',tipo==='err'?'alert':'status');
  el.innerHTML=`<span class="toast-ico">${ICONOS[tipo]||'•'}</span><span class="toast-msg">${msg}</span>`;
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
    // Un solo diálogo a la vez: si ya hay uno abierto se cancela (resuelve en false) en vez de perder su resolvedor, que dejaba
    // la función que lo esperaba colgada para siempre y, con un doble disparo, una acción pendiente que nunca se cancelaba.
    if(window._dialogResolve){ const _previo=window._dialogResolve; window._dialogResolve=null; _previo(false); }
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

// Convierte un string de fecha 'YYYY-M-D' o 'YYYY-MM-DD' (con o sin ceros a
// la izquierda en mes/día) en un Date válido a medianoche local, construido
// por componentes numéricos en vez de confiar en el parser de strings de JS.
//
// Blindaje ante un bug real (2026-09-26): `new Date(fechaStr+'T00:00:00')` —
// patrón usado en 14 sitios entre este archivo y cuentas.js — da `Invalid
// Date` si mes o día no tienen 2 dígitos (ej. '2026-9-26' en vez de
// '2026-09-26'). Sin el sufijo de hora el parser de JS es permisivo, pero
// CON él exige ISO 8601 estricto. Ese `Invalid Date` se propaga como `NaN`
// en cualquier cálculo downstream (calcCDT, nivelAntiguedadMovimiento, etc.)
// sin tirar ningún error — y `fmt()`/`fmtNoCents()` lo muestran como "$0"
// (`NaN||0`), indistinguible de un valor real de cero. Así se vio: un CDT
// con `vence` sin padear dejó `calcCDT().val` en NaN, que subió a
// `_patrimonioVisible` en refresh() y mostró "Patrimonio visible $0" y
// "CDTs Nu $0" con datos reales de sobra en las demás cuentas. Ver
// CHANGELOG.md#patrimonio-y-cálculos-globales.
//
// Por la UI normal esto no puede pasar (los `<input type="date">` siempre
// devuelven YYYY-MM-DD con ceros a la izquierda) — apareció por una edición
// manual de datos fuera de la app. Este helper cierra la puerta para
// cualquier otra vía futura (import, script, edición directa en Firebase).
function _fechaSafe(fechaStr){
  if(!fechaStr) return new Date(NaN);
  const partes=String(fechaStr).split('-').map(Number);
  if(partes.length!==3||partes.some(isNaN)) return new Date(NaN);
  const [anio,mes,dia]=partes;
  return new Date(anio,mes-1,dia); // hora local 00:00:00, sin pasar por el parser de strings ISO
}

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
  const dias=Math.floor((Date.now()-_fechaSafe(fecha).getTime())/86400000);
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

// Segundo candado de las acciones destructivas (mejora 13): con PIN activo, vuelve a pedirlo ANTES de ejecutar la acción.
// Devuelve true si se puede seguir: no hay PIN (todo como antes) o se escribió el correcto; false si se canceló o con un PIN
// activo no se pudo verificar (módulo del PIN sin cargar): en ese caso no se ejecuta nada. Se llama justo después de la
// confirmación propia de cada acción: `if (!await pedirPinAntesDe('Para borrar todos los datos')) return;`
// Acciones que lo piden: borrarTodo, importar un backup, eliminar la cuenta, quitar el PIN y quitar la huella.
async function pedirPinAntesDe(motivo) {
  let hayPin = false;
  try { hayPin = !!localStorage.getItem('mf_pin'); } catch (e) { /* sin acceso a localStorage: no hay PIN que pedir */ }
  if (!hayPin) return true;
  if (typeof window._pinVerificar !== 'function') return false;
  const ok = await window._pinVerificar(motivo);
  if (!ok && typeof toast === 'function') toast('Acción cancelada', 'info');
  return ok;
}

// Muestra u oculta un elemento según el estado de la pantalla (JS, no CSS):
// lo usan los botones de pie de lista que sobran cuando el estado vacío ya
// trae su propio botón de acción (un solo botón por estado vacío).
function mostrarSi(el, visible) {
  if (el) el.style.display = visible ? '' : 'none';
}

// renderAttencion() migrada a js/modules/inicio.js — ver auditoria-tecnica.md.
// De paso se corrigió un caso más de .innerHTML sin escapar (spNombreDe()
// interpolado directo, mismo patrón ya visto 5 veces en otros módulos).

// ── Guards de carga bajo demanda para cuentas.js (FIX 2026-08-13) ──────────

function refresh(){
  // Auto-sanación de tarjetas de crédito: agrega campos nuevos, infiere el
  // saldo inicial de tarjetas migradas y recalcula la deuda de cada una a
  // partir de sus movimientos (regla de consistencia). Es idempotente.
  if(typeof tcNormalizarTarjetas==='function') tcNormalizarTarjetas();
  const nu=nuTotal();
  // NOTA: ya NO se resta plata de encargos guardada en Nequi/Efectivo/cuentas
  // personalizadas — mismo criterio y misma razón que en calcPatrimonioTotal().
  const nequi=getSaldoFuente('nequi');
  const ef=getSaldoFuente('efectivo');
  // FIX 2026-08-13: totalPrestadoPendiente (prestado.js, grupo lazy) sin
  // guard — mismo patrón de fallback (0) que ya usa inicio.js línea ~253
  // (window.totalPrestadoPendiente?...:0) para el mismo caso.
  const prest=typeof Deudas!=='undefined'?Deudas.totalPendiente('favor'):0;
  // CDTs value comes from calcCDT nested in cajitas
  const cdts=(S.cajitas||[]).reduce((a,c)=>a+(c.cdts||[]).reduce((b,cdt)=>b+calcCDT(cdt).val,0),0);
  const cajitasLibres=(S.cajitas||[]).reduce((a,c)=>a+calcC(c).val,0);
  // Cuentas personalizadas marcadas para incluir en total
  const customTotal=cuentasCustom().reduce((a,c)=>a+(c.saldo||0),0);
  const disp=cajitasLibres+nequi+ef+customTotal;
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
  const _globalTasa=getNuTasaGlobal();
  const interesesTotalHoy=(S.cajitas||[]).reduce((a,c)=>{
    const k=calcC(c);
    const tasaCajita=_globalTasa; // una sola tasa para todas las cajitas
    // Incluir saldo de encargos en la base del interés (son intereses a mi favor)
    const baseInteres=k.val+(k.saldoEncargos||0);
    return a+(baseInteres>0?baseInteres*(Math.pow(1+tasaCajita/100,1/365)-1):0);
  },0);

  const deudaTCTotal=(S.tarjetasCredito||[]).reduce((a,tc)=>a+(tc.deuda||0),0);
  const _cpAjenoHero=typeof _saldoCPAjeno==='function'?_saldoCPAjeno():0;
  // Alcancía: el patrimonio real la incluye, pero el hero la oculta para mantener la sorpresa
  const _alcSaldo = (S.alcancia && S.alcancia.saldoRegistrado) ? S.alcancia.saldoRegistrado : 0;
  const _patrimonioVisible = disp+prest+cdts-deudaTCTotal-_cpAjenoHero; // sin alcancía
  // Red de seguridad (2026-09-26): fmt()/fmtNoCents() hacen `n||0`, así que un
  // NaN acá se mostraría como "$0" silencioso, indistinguible de un patrimonio
  // real en cero — exactamente lo que pasó con el bug de fecha sin padear en
  // un CDT (ver _fechaSafe() más arriba). Esto no arregla la causa, pero deja
  // rastro en consola para no perder otra sesión entera diagnosticando a ciegas.
  if(isNaN(_patrimonioVisible)){
    console.error('[refresh] _patrimonioVisible dio NaN — revisar fechas corruptas u otra fuente de NaN en cajitas/CDTs/deudores/tarjetas', {disp,prest,cdts,deudaTCTotal,_cpAjenoHero});
  }
  document.getElementById('heroTotal').textContent=fmt(_patrimonioVisible);
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
  // Detalle de la cuenta abierta (Nequi, Nu, Efectivo o personalizada): renderDetalleCuenta()
  // recibe la fuente ('custom:ID' para las personalizadas) y ya ignora una cuenta borrada.
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
  // a su pantalla (showScreen(), ver sheet-stack.js) — Cuentas y Gastos
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
