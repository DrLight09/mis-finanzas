// js/core/estado.js
//
// Estado global y utilidades base: S (el estado), categorías por defecto, Dinero/fmt, uid, hoy, escHtml, mesKey, avatares. Carga PRIMERO entre las partes del núcleo: todo lo demás asume que S/fmt/uid existen.
// Parte del antiguo core-state.js (dividido por responsabilidad). Clásico (<script defer>), sin type="module": sus globales son
// léxicos de script clásico. El ORDEN de carga en index.html es el de esta lista: estado → cuentas-fuentes → persistencia →
// patrimonio → ingresos → dialogos → utilidades-ui → refresh.

const MC=Fecha.MESES_CORTOS;   // alias de la lista única de js/core/fecha.js
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
  invitacionCuentasOculta:false, // la persona cerró (×) el aviso de Inicio «Agrega tu primera cuenta»; no vuelve a salir
  cajitas:[], // cajitas de las cuentas de ahorro: {id, cuentaId, nombre, saldo, fecha, cdts}; la tasa EA es de la CUENTA (cuenta.tasaEA)
  personas:[],
  deudores:[],misDeudas:[],mesadas:{papa:{cuotas:{},pagos:{}},mama:{cuotas:{},pagos:{}}},mesadaAnio:new Date().getFullYear(),
  spotify:{personas:[],costo:0,fuenteId:'',historial:[]}, // todo el estado de Spotify en una llave (migración v9); ver _ensureSpotify()
  gastosFijos:[],
  bienes:[], // activos NO líquidos (una moto, un computador): {id,nombre,valor,fecha,depreciacionAnual?,origenGastoId?}; ver calcBienes()
  pagosGastosFijos:{},
  gastosVar:[],
  encargos:[],
  movimientos:[],
  libro:[],
  modulos:{mesada:true,spotify:true},
  catsVar:[],
  catsFijo:[],
  cuentas:[], // cuentas del usuario (ver "CUENTAS: MODELO ÚNICO"); Efectivo se crea sola (asegurarEfectivo) y el resto las crea cada persona
  patrimonioHistorial:[],
  patrimonioCierres:{},
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
// cuentas: modelo único de cuentas (ver "CUENTAS: MODELO ÚNICO" más abajo):
//   {id, tipo:'banco'|'billetera'|'efectivo'|'ahorro', nombre, icono, color, saldo, archivada?}  (los movimientos viven en S.movimientos / el libro, no dentro de la cuenta)
//   y, solo en las de ahorro: tasaEA (% EA, null = sin configurar) e historialTasas:[{fecha,tasa}] (sin `saldo` propio).
// Cajita structure: {id, nombre, saldo (saldo actual total con intereses ya "materializados"),
//   fecha (reloj de sus intereses: último sellado de intereses o primer depósito; NO la fecha de creación),
//   cdts: [{monto, tasa, inicio, vence, ...}]}  — la tasa EA de la cajita es la de su cuenta de ahorro (cuenta.tasaEA);
//   solo cada CDT guarda su propia tasa.
// El interés es diario compuesto: a las 12am cada día se "paga" el interés y queda en el saldo.
// Nosotros simulamos esto: el saldo mostrado = saldo_guardado * (1 + tasaDiaria)^diasTranscurridos
// Cuando el usuario agrega/retira plata, se materializa el interés acumulado primero.

let pagoIdx=null;
let pagoDestino='';
// mesFilter/gastoTab: migrados a js/modules/gastos.js

/* ---- DINERO: el ÚNICO formateador de pesos ----
   Dinero.fmt(n, { decimales, redondeo, signo }) → '$1.234.567' / '$1.234,50' / '-$500' / '+$500'.
     decimales: 'auto' (por defecto: centavos solo si los hay) | 0 (sin centavos) | 2 (siempre dos).
     redondeo:  'redondear' (por defecto) | 'truncar' — solo importa con decimales:0 (el selector de Cuentas trunca a propósito).
     signo:     true → antepone '+' a los positivos (variaciones: «+$20.000»).
   fmt() y fmtNoCents() son atajos de esta función; ninguna pantalla debe armar su propio `toLocaleString(…currency…)` (Proyección
   tenía dos copias con Intl + un .replace del espacio duro; la salida era la misma, pero eran dos sitios más que mantener y
   alinear). NaN/undefined/null se muestran como $0 (nunca «$NaN»). `compacto` ($1,2 M) NO existe todavía a propósito: ninguna
   pantalla lo necesita y una opción sin uso es código muerto — agregarlo aquí cuando haya dónde usarlo. */
const Dinero = (() => {
  function fmt(n, o) {
    o = o || {};
    let num = Number(n); if (!isFinite(num)) num = 0;
    const dec = o.decimales === undefined || o.decimales === null ? 'auto' : o.decimales;
    const cents = dec === 0
      ? (o.redondeo === 'truncar' ? Math.trunc(num) : Math.round(num)) * 100
      : Math.round(num * 100);
    const abs = Math.abs(cents);
    const ent = Math.floor(abs / 100), dd = abs % 100;
    const sign = cents < 0 ? '-' : (o.signo && cents > 0 ? '+' : '');
    const decimales = dec === 2 || (dec === 'auto' && dd !== 0) ? ',' + String(dd).padStart(2, '0') : '';
    return sign + '$' + ent.toLocaleString('es-CO') + decimales;
  }
  return { fmt };
})();
if (typeof window !== 'undefined') window.Dinero = Dinero;
function fmt(n){ return Dinero.fmt(n); }
function fmtNoCents(n){ return Dinero.fmt(n, { decimales: 0, redondeo: 'truncar' }); }
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
function hoy(){return Fecha.hoy();}   // alias: la lógica vive en js/core/fecha.js

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
   Ninguna cuenta viene de fábrica salvo Efectivo (permanente, se crea sola); cada usuario crea las suyas (Nequi, Caja Social, efectivo, una
   cuenta de ahorro…). Todas son del MISMO tipo de objeto y se identifican igual en toda la app:
     cuenta  : {id, tipo, nombre, icono, color, saldo, archivada?, movimientos:[…]}
     fuente  : 'cuenta:ID'  (los movimientos, el libro, los gastos, los encargos y los préstamos guardan este texto)
   `tipo` solo describe qué clase de cuenta es y qué sabe hacer (ver TIPOS_CUENTA): 'banco', 'billetera', 'efectivo' y
   'ahorro'. Una cuenta de AHORRO no guarda un saldo propio: su plata vive en cajitas (S.cajitas, fuente 'cajita:ID', cada
   una con su `cuentaId`) que rinden intereses con la tasa EA de LA CUENTA (cuenta.tasaEA + cuenta.historialTasas) y pueden
   tener CDTs. Nu es solo un preset del catálogo (ICONOS_CUENTA, cuentas.js) que crea una cuenta de ahorro.
   Cambiar de banco = crear la cuenta nueva, mover el saldo y ARCHIVAR la vieja: archivar no borra, la cuenta sigue en
   S.cuentas (su historial se conserva y los movimientos viejos se siguen mostrando con su nombre), solo deja de ofrecerse
   como origen/destino y de aparecer en el selector y en Inicio. Para archivar el saldo debe ser $0.
   El saldo de una cuenta se lee y se escribe SOLO por sumarFuente/descontarFuente/ajustarSaldoCuenta (puerta única del
   libro): ningún módulo toca `c.saldo` directamente. */
