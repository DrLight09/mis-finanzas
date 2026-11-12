// js/core/cuentas-fuentes.js
//
// Cuentas, libro de movimientos y fuentes de plata: Tipos de cuenta y sus getters, Libro (única vía para tocar saldos), descontarFuente/sumarFuente, Plata, Fuente + fuenteTexto/fuenteHtml, opcionesCuenta (único constructor de <option>s), poblarFuente y getSaldoFuente.
// Parte del antiguo core-state.js (dividido por responsabilidad). Clásico (<script defer>), sin type="module": sus globales son
// léxicos de script clásico. El ORDEN de carga en index.html es el de esta lista: estado → cuentas-fuentes → persistencia →
// patrimonio → ingresos → dialogos → utilidades-ui → refresh.

/**
 * _buildFuentesOpts — constructor interno de <option>s de fuentes (privado: las pantallas usan opcionesCuenta, más abajo).
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
function _buildFuentesOpts({
  selectedVal = '',
  soloConSaldo = false,
  incluirTC = true,
  mostrarSaldo = false,
  placeholder = 'Sin especificar',
  fuentesCustom = null,
  placeholderDeshabilitado = false
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
  const ph = placeholderDeshabilitado ? ` disabled${selectedVal ? '' : ' selected'}` : '';
  return `<option value=""${ph}>${placeholder}</option>${opts}`;
}

/**
 * opcionesCuenta — LA función para «¿de qué cuenta?» / «¿a qué cuenta?» (A2). Cada pantalla declara su configuración en vez de escribir
 * su propia función de <option>s; todas pasan por _buildFuentesOpts (escapa) o FuentesFiltro (filtra por saldo/cupo).
 *   sentido        'sale' (plata que SALE: cuentas con saldo ≥ $1 y tarjetas con cupo) | null (plata que ENTRA o sin filtro de saldo)
 *   preset         clave de FuentesFiltro.PRESET si no es la de salida ('SPOTIFY': saldo ≥ $50)
 *   tarjetas       incluir tarjetas de crédito (por defecto no: solo se piden cuando la plata sale con tarjeta)
 *   soloDe         lista { cuenta, label, saldo } a ofrecer en lugar de todas (p. ej. las cuentas de un encargo); [] = ninguna, null = todas
 *   mostrarSaldo   «Nombre ($saldo)»
 *   soloConSaldo   ofrecer solo las que tienen saldo > 0 (sin el filtro de $1 ni cupo de 'sale')
 *   placeholder / placeholderDeshabilitado / sinOpcionesTexto
 *   extra          HTML de opciones al final, o función (selectedVal) → HTML (p. ej. «Ganancia (no salió plata)» de préstamos)
 */
function opcionesCuenta({ selectedVal = '', sentido = null, preset = null, tarjetas = false, soloDe = null, mostrarSaldo = false, soloConSaldo = false,
  placeholder, placeholderDeshabilitado = false, sinOpcionesTexto, extra = '' } = {}) {
  const hayCustom = Array.isArray(soloDe); // `soloDe: []` = «ninguna» (solo el placeholder); `null` = todas
  let out;
  if (sentido === 'sale' && !hayCustom) {
    const base = { ...FuentesFiltro.PRESET[preset || 'SALIDA'], selectedVal };
    if (placeholder !== undefined) base.placeholder = placeholder;
    if (sinOpcionesTexto !== undefined) base.sinOpcionesTexto = sinOpcionesTexto;
    out = FuentesFiltro.optsHtml(tarjetas ? getFuentes() : getFuentesSinTC(), base);
  } else {
    const o = { selectedVal, incluirTC: tarjetas, mostrarSaldo, soloConSaldo, placeholderDeshabilitado };
    if (placeholder !== undefined) o.placeholder = placeholder;
    if (hayCustom) o.fuentesCustom = soloDe;
    out = _buildFuentesOpts(o);
  }
  return out + (typeof extra === 'function' ? extra(selectedVal) : extra);
}

/* ---- Resto del motor de Diferencial (diffRenderPartes, diffCalcular, diffResumen,
   _diffActualizarMiCuenta, diffValidarIntercambios, diffAplicar, diffHtmlBloque,
   diffRenderHistorial, _diffFuentesOptsHtml, _diffInstancias) ----
   migrado a js/core/diferencial.js. Ver comentario ahí para el detalle de qué se
   migró exactamente (incluida la limpieza de onclick/oninput/onchange en
   diffRenderPartes/diffHtmlBloque). ---- */

const FUENTE_CUENTA_PREFIJO='cuenta:';
// Clases de cuenta. `ahorro` es la única con cajitas y tasa; el resto solo guarda un saldo. `etiqueta` es lo que se ve en el
// rótulo del saldo. Una clase nueva (p. ej. 'inversion') se agrega acá y en el catálogo, no repartida por el código.
// Registro de pantallas propias por clase de cuenta (hoy solo 'ahorro'): cada módulo la presenta aquí al cargar y cuentas.js la
// consulta sin importarlo. Forma: { paneles:[ids], panel:id, reiniciar(), ... }.
const CuentaPantallas={};

const TIPOS_CUENTA={
  banco:    {nombre:'Cuenta bancaria',   etiqueta:'Saldo disponible'},
  billetera:{nombre:'Billetera digital', etiqueta:'Saldo disponible'},
  efectivo: {nombre:'Efectivo',          etiqueta:'Disponible en efectivo', fija:true},
  ahorro:   {nombre:'Cuenta de ahorro',  etiqueta:'Total en ahorro'}
};
// Efectivo es PERMANENTE: casi todo el mundo maneja plata en efectivo, así que existe siempre (se crea sola) y no se archiva ni se
// elimina; sí se puede renombrar o cambiar de color. El resto de cuentas se administran sin restricción.
function esCuentaFija(c){return !!c&&!!(TIPOS_CUENTA[c.tipo]||{}).fija;}
function asegurarEfectivo(){
  const arr=_cuentasArr();
  const ef=arr.find(c=>c&&c.tipo==='efectivo');
  if(!ef){arr.push({id:'efectivo',tipo:'efectivo',nombre:'Efectivo',icono:'efectivo',color:'#f0b840',saldo:0});return true;}
  if(ef.archivada){ef.archivada=false;return true;}
  return false;
}
function esFuenteCuenta(f){return typeof f==='string'&&f.startsWith(FUENTE_CUENTA_PREFIJO);}
function fuenteDeCuenta(id){return FUENTE_CUENTA_PREFIJO+id;}
function idDeFuenteCuenta(f){return esFuenteCuenta(f)?f.slice(FUENTE_CUENTA_PREFIJO.length):'';}
function _cuentasArr(){
  if(!Array.isArray(S.cuentas))S.cuentas=[];
  return S.cuentas;
}
// Cuenta por id; undefined si no existe.
function getCuenta(id){return _cuentasArr().find(c=>c.id===id);}
// Cuenta a partir de su fuente ('cuenta:ID'); undefined para el resto (cajita:ID, tc:ID…).
function getCuentaDeFuente(fuente){return esFuenteCuenta(fuente)?getCuenta(idDeFuenteCuenta(fuente)):undefined;}
// ¿Tiene cajitas y tasa propia? (cuenta de ahorro)
function esCuentaAhorro(c){return !!c&&c.tipo==='ahorro';}
// Todas las cuentas (activas y archivadas), solo las activas y las de ahorro / con saldo propio.
function cuentasTodas(){return _cuentasArr();}
function cuentasActivas(){return _cuentasArr().filter(c=>!c.archivada);}
function cuentasAhorro(opts){return _cuentasArr().filter(c=>esCuentaAhorro(c)&&(!(opts&&opts.soloActivas)||!c.archivada));}
function cuentasConSaldo(opts){return _cuentasArr().filter(c=>!esCuentaAhorro(c)&&(!(opts&&opts.soloActivas)||!c.archivada));}
// Cajitas de una cuenta de ahorro (las que no son CDT sueltos).
function cajitasDeCuenta(cuentaId){return (S.cajitas||[]).filter(c=>c.cuentaId===cuentaId);}
// Cuenta de ahorro a la que pertenece una cajita (undefined si la cajita quedó huérfana).
function cuentaDeCajita(c){return c&&c.cuentaId?getCuenta(c.cuentaId):undefined;}
// Nombre de una cuenta para mostrar; las fuentes que ya no existen se muestran como «Cuenta eliminada».
function nombreCuenta(c){return c?(c.nombre||'Cuenta'):'Cuenta eliminada';}
// Color de una cuenta (hex); gris neutro si no tiene.
// El tema de la app es oscuro (fondo ~#181818): un color de marca muy oscuro (Bancolombia negro, BBVA azul marino) desaparece contra
// el fondo y contra su propio recuadro translúcido. colorLegible() lo aclara (mezclándolo con blanco, conservando el tono) hasta
// alcanzar un contraste mínimo; el color guardado de la cuenta no se toca, solo cómo se pinta. Los colores ya claros no cambian.
function _luminancia(hex){
  const n=parseInt(String(hex).slice(1,7),16);
  const ch=[(n>>16)&255,(n>>8)&255,n&255].map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});
  return 0.2126*ch[0]+0.7152*ch[1]+0.0722*ch[2];
}
function colorLegible(hex,minContraste){
  if(!/^#[0-9a-fA-F]{6}$/.test(String(hex||'')))return '#888880';
  const lumFondo=_luminancia('#181818'), min=minContraste||3.5;
  const n=parseInt(hex.slice(1),16), rgb=[(n>>16)&255,(n>>8)&255,n&255];
  for(let t=0;t<=1.0001;t+=0.05){
    const m=rgb.map(v=>Math.round(v+(255-v)*t));
    const c='#'+m.map(v=>v.toString(16).padStart(2,'0')).join('');
    if((_luminancia(c)+0.05)/(lumFondo+0.05)>=min)return t===0?hex:c;
  }
  return '#ffffff';
}
function colorCuenta(c){return colorLegible((c&&c.color)||'#888880');}
// "Cuenta Mínima" en pesos para mostrar un saldo cuando hay varias cuentas.
function saldoCuentas(opts){return cuentasConSaldo(opts).reduce((a,c)=>a+(c.saldo||0),0);}

/* ---- LIBRO DE MOVIMIENTOS ----
   S.libro es la lista de entradas de plata de las cuentas con saldo (cuenta:ID, cajita:ID): una entrada por
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
  const esCuenta = k => typeof k === 'string' && (esFuenteCuenta(k) || Fuente.esCajita(k));

  function _cuentasDe(st) {
    const out = {};
    // Una cuenta de ahorro no tiene saldo propio (su plata está en las cajitas): solo las demás entran al libro por su cuenta.
    _arr(st.cuentas).forEach(c => { if (c && c.id && c.tipo !== 'ahorro') out[FUENTE_CUENTA_PREFIJO + c.id] = { saldo: c.saldo || 0, nombre: c.nombre || c.id }; });
    _arr(st.cajitas).forEach(c => {
      if (!c || !c.id) return;
      const madre = _arr(st.cuentas).find(x => x && x.id === c.cuentaId);
      out['cajita:' + c.id] = { saldo: c.saldo || 0, nombre: (c.nombre || 'Cajita') + (madre ? ' (' + (madre.nombre || 'ahorro') + ')' : '') };
    });
    return out;
  }

  // Fábrica del «origen» de las patas de saldo de un módulo: `const _ogGv = Libro.origen('gastos');` y después
  // `_ogGv(ref)` → { origen:{ modulo:'gastos', ref } } al aplicar, `_ogGv(ref, true)` → { …, rev:true } al revertir (se pasa como
  // `opts` de sumarFuente/descontarFuente). Antes cada módulo repetía su propia copia de esta función (11 `_og*` idénticas);
  // un módulo nuevo solo declara su nombre. `ref`/`rev` ausentes no dejan la clave en la entrada (nada de `rev: undefined`).
  function origen(modulo) {
    return (ref, rev) => ({ origen: { modulo, ...(ref ? { ref } : {}), ...(rev ? { rev: true } : {}) } });
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

  return { esCuenta, registrar, origen, conOrigen, verificar, entradasVisibles, saldo, TOL };
})();
if (typeof window !== 'undefined') window.Libro = Libro; // los tests lo leen como ctx.Libro

/* ---- MOVER PLATA ENTRE CUENTAS ---- */
// Todo cambio de saldo de una cuenta con saldo (cuentas y cajitas de las cuentas de ahorro) pasa por sumarFuente /
// descontarFuente / ajustarSaldoCuenta y deja una entrada en S.libro, de modo que el saldo guardado SIEMPRE sea la suma
// del libro. Ningún módulo debe escribir `c.saldo` directamente.
// `opts` (opcional, en ambas): { tipo, desc, origen:{modulo, ref, rev}, fecha } — qué es el movimiento y quién lo originó.
// Sin `origen` queda como 'sin-origen' (o el de Libro.conOrigen).
const _libroPata = (fuente, monto, opts) => Libro.registrar(fuente, monto, opts);
// Fija el saldo de una cuenta a `nuevoSaldo` (intereses de Nu, chequeo rápido, CDT…) y registra la DIFERENCIA en el
// libro. Devuelve esa diferencia. Es la única forma permitida de asignar un saldo "absoluto".
function ajustarSaldoCuenta(fuente,nuevoSaldo,opts){
  const c=Fuente.esCajita(fuente)?(S.cajitas||[]).find(x=>x.id===fuente.split(':')[1]):getCuentaDeFuente(fuente);
  if(!c||esCuentaAhorro(c))return 0;
  const delta=nuevoSaldo-(c.saldo||0);
  c.saldo=nuevoSaldo;
  if(Math.abs(delta)>1e-9)_libroPata(fuente,delta,opts);
  return delta;
}
// Restar plata de una fuente. Antes recortaba el saldo en 0 (y la diferencia se perdía sin avisar); ahora el saldo
// refleja exactamente lo restado, aunque quede negativo — los selectores ya solo ofrecen cuentas con saldo
// suficiente, así que un negativo indica un movimiento mal registrado y se ve en vez de esconderse.
function descontarFuente(fuente,monto,opts){
  if(!fuente||!monto)return false;
  if(fuente==='ganancia'){
    // Plata virtual: no salió de ninguna cuenta real, es ganancia futura
    return true;
  }
  if(esFuenteCuenta(fuente)){
    const c=getCuentaDeFuente(fuente);
    if(c&&!esCuentaAhorro(c)){c.saldo=(c.saldo||0)-monto;_libroPata(fuente,-monto,opts);return true;}
  } else if(Fuente.esCajita(fuente)){
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
      return true;
    }
  } else if(Fuente.esTC(fuente)){
    // Para TC: descontar = hacer una compra = aumentar la deuda
    const id=fuente.split(':')[1];
    const tc=(S.tarjetasCredito||[]).find(x=>x.id===id);
    if(tc){tc.deuda=(tc.deuda||0)+monto;return true;}
  }
  return _fuenteHuerfana(fuente);
}
function sumarFuente(fuente,monto,opts){
  if(!fuente||!monto)return false;
  if(esFuenteCuenta(fuente)){
    const c=getCuentaDeFuente(fuente);
    if(c&&!esCuentaAhorro(c)){c.saldo=(c.saldo||0)+monto;_libroPata(fuente,monto,opts);return true;}
  } else if(Fuente.esCajita(fuente)){
    const id=fuente.split(':')[1];
    const c=(S.cajitas||[]).find(x=>x.id===id);
    if(c){
      // Ver nota equivalente en descontarFuente() más arriba.
      if(typeof materializarIntereses==='function') materializarIntereses(c);
      c.saldo=(c.saldo||0)+monto;
      _libroPata(fuente,monto,opts);
      const el=document.getElementById('cs_'+c.id);if(el)el.value=fmtInput(c.saldo);
      return true;
    }
  } else if(Fuente.esTC(fuente)){
    // Para TC: sumar = revertir compra = disminuir la deuda
    const id=fuente.split(':')[1];
    const tc=(S.tarjetasCredito||[]).find(x=>x.id===id);
    if(tc){tc.deuda=Math.max(0,(tc.deuda||0)-monto);return true;}
  }
  return _fuenteHuerfana(fuente);
}

// Una fuente que no se pudo aplicar (la cuenta/cajita/TC ya no existe, o es una cuenta de ahorro, que no tiene saldo propio) NO mueve
// plata. Antes callaba: si el otro lado del movimiento sí se aplicaba, la plata se creaba o se perdía sin que nadie se enterara.
// Ahora devuelve false (los callers nuevos lo respetan) y deja el aviso en consola para detectarlo.
const _huerfanasAvisadas=new Set();
function _fuenteHuerfana(fuente){
  if(fuente==='alcancia')return true; // la Alcancía se maneja en su propio módulo: aquí no hay saldo que mover
  if(!_huerfanasAvisadas.has(fuente)){_huerfanasAvisadas.add(fuente);try{console.warn('[Plata] fuente sin efecto (no existe o no guarda saldo):',fuente);}catch(_){}}
  return false;
}

/* ---- PLATA: reglas únicas para validar y mover ---- */
// Antes cada módulo comparaba el saldo a su manera (centavos exactos, +0.01, +0.5…) y con su propio mensaje, y cada transferencia
// aplicaba "descontar" y luego "sumar" por separado: si el segundo fallaba, quedaba a medias. Aquí vive la regla única:
//   · Plata.validarSalida(fuente, monto)        → { ok, disponible, motivo }  (compara en centavos; `motivo` es TEXTO plano: toast() y textContent lo pintan seguro; en innerHTML hay que escaparlo)
//   · Plata.validarSalidas([{fuente, monto}])   → { ok, motivo }  suma por fuente antes de comparar (plata dividida entre cuentas)
//   · Plata.resumenSalida(fuente, monto)        → { texto, ok }  el aviso vivo «Saldo disponible» de los formularios
//   · Plata.disponibilidad(fuente, opts)        → { ok, motivo }  ¿esa fuente puede entregar/recibir plata hoy?
//   · Plata.transferir(origen, destino, monto, { og, sinSaldo, permitirArchivada }) → { ok, motivo }  atómica: valida ANTES de tocar.
// Siguen siendo sumarFuente/descontarFuente (y el libro) quienes cambian saldos; Plata solo decide si se puede y los aplica juntos.
const Plata=(()=>{
  const cent=n=>Math.round((Number(n)||0)*100);
  const tipoDe=f=>{
    if(!f)return null;
    if(f==='ganancia'||f==='alcancia')return'virtual';
    if(esFuenteCuenta(f))return'cuenta';
    if(Fuente.esCajita(f))return'cajita';
    if(Fuente.esTC(f))return'tc';
    return null;
  };
  function disponibilidad(fuente,opts){
    const o=opts||{};
    const t=tipoDe(fuente);
    if(!t)return{ok:false,motivo:'Elige una cuenta válida'};
    if(t==='virtual')return{ok:true};
    if(t==='tc'){
      const tc=(S.tarjetasCredito||[]).find(x=>x.id===fuente.split(':')[1]);
      return tc?{ok:true}:{ok:false,motivo:'La tarjeta ya no existe'};
    }
    let cuenta;
    if(t==='cuenta'){
      cuenta=getCuentaDeFuente(fuente);
      if(!cuenta)return{ok:false,motivo:'La cuenta ya no existe'};
      if(esCuentaAhorro(cuenta))return{ok:false,motivo:nombreCuenta(cuenta)+' guarda su plata en cajitas: elige una cajita'};
    }else{
      const caj=(S.cajitas||[]).find(x=>x.id===fuente.split(':')[1]);
      if(!caj)return{ok:false,motivo:'La cajita ya no existe'};
      if(caj.esCDT)return{ok:false,motivo:'Un CDT no se puede mover como cajita'};
      cuenta=getCuenta(caj.cuentaId);
      if(!cuenta)return{ok:false,motivo:'La cuenta de esa cajita ya no existe'};
    }
    if(cuenta.archivada&&!o.permitirArchivada)return{ok:false,motivo:'"'+nombreCuenta(cuenta)+'" está archivada: reactívala o elige otra cuenta'};
    return{ok:true};
  }
  // ÚNICA regla de "¿alcanza?" de toda la app. `{ok, disponible, motivo}`; `motivo` es TEXTO plano (sin escapar): toast() y textContent lo pintan seguro; si va a innerHTML, escápalo.
  //  · Cuenta/cajita: compara en CENTAVOS contra el saldo disponible. Nunca se permite dejar una cuenta en negativo.
  //  · TC: solo falla si la tarjeta tiene cupo configurado y el cupo disponible no alcanza (sin cupo no hay límite que validar).
  //  · 'ganancia' (plata virtual) y fuente vacía («sin especificar», no mueve plata): siempre ok.
  function validarSalida(fuente,monto){
    if(!fuente||fuente==='ganancia')return{ok:true,disponible:Infinity};
    if(!(Number(monto)>0))return{ok:false,disponible:0,motivo:'Ingresa un monto válido'};
    const t=tipoDe(fuente);
    if(!t)return{ok:false,disponible:0,motivo:'Elige una cuenta válida'};
    const disponible=getSaldoFuente(fuente);
    if(t==='tc'){
      const tc=(S.tarjetasCredito||[]).find(x=>x.id===fuente.slice(3));
      if(tc&&tc.cupo&&cent(monto)>cent(disponible))return{ok:false,disponible,motivo:'Cupo insuficiente en '+fuenteLabel(fuente)+'. Disponible: '+fmt(disponible)};
      return{ok:true,disponible};
    }
    if(disponible===Infinity||cent(monto)<=cent(disponible))return{ok:true,disponible};
    return{ok:false,disponible,motivo:'Saldo insuficiente en '+fuenteLabel(fuente)+'. Disponible: '+fmt(disponible)};
  }
  // Varias salidas a la vez (plata dividida entre cuentas, pagos de varios orígenes…): se SUMA por fuente antes de comparar. Si dos filas
  // sacan de la misma cuenta, cada una por separado puede alcanzar y el total no. [{fuente, monto}] → {ok, motivo, fuente}.
  function validarSalidas(filas){
    const por=new Map();
    (filas||[]).forEach(r=>{if(r&&r.fuente&&Number(r.monto)>0)por.set(r.fuente,(por.get(r.fuente)||0)+Number(r.monto));});
    for(const [fuente,total] of por){
      const v=validarSalida(fuente,total);
      if(!v.ok)return{ok:false,motivo:v.motivo,fuente};
    }
    return{ok:true};
  }
  // Texto vivo para los avisos «Saldo disponible» de los formularios (misma regla que al confirmar). {texto, ok}.
  function resumenSalida(fuente,monto){
    if(!fuente)return{texto:'',ok:true};
    const v=validarSalida(fuente,monto>0?monto:0.01);
    const disp=getSaldoFuente(fuente);
    return{texto:(Fuente.esTC(fuente)?'Cupo disponible: ':'Saldo disponible: ')+fmt(disp),ok:monto>0?v.ok:true};
  }
  function transferir(origen,destino,monto,opts){
    const o=opts||{};
    if(!(Number(monto)>0))return{ok:false,motivo:'Ingresa un monto válido'};
    if(origen===destino)return{ok:false,motivo:'El origen y el destino no pueden ser la misma cuenta'};
    for(const f of [origen,destino]){
      const t=tipoDe(f);
      if(t!=='cuenta'&&t!=='cajita')return{ok:false,motivo:'Elige una cuenta o cajita válida'};
      const d=disponibilidad(f,o);
      if(!d.ok)return d;
    }
    if(!o.sinSaldo){const v=validarSalida(origen,monto);if(!v.ok)return{ok:false,motivo:v.motivo};}
    // Ambos lados existen y pueden operar: recién ahora se toca el saldo (los dos o ninguno).
    descontarFuente(origen,monto,o.og);
    sumarFuente(destino,monto,o.og);
    return{ok:true};
  }
  return{tipoDe,disponibilidad,validarSalida,validarSalidas,resumenSalida,transferir,centavos:cent};
})();
if(typeof window!=='undefined')window.Plata=Plata;

// Lista de cuentas que se pueden elegir como origen/destino: las cajitas de cada cuenta de ahorro activa, las demás cuentas
// activas (en el orden en que se crearon) y, si incluirTC, las tarjetas activas. Las archivadas no se ofrecen. getFuentes() y
// getFuentesSinTC() son la misma lista, con y sin TC.
function _listaFuentes(incluirTC){
  const arr=[];
  const activas=cuentasActivas();
  const activasId=new Set(activas.map(c=>c.id));
  (S.cajitas||[]).forEach(c=>{
    if(c.esCDT||!activasId.has(c.cuentaId))return;
    arr.push({val:'cajita:'+c.id,label:c.nombre+' ('+nombreCuenta(getCuenta(c.cuentaId))+')'});
  });
  activas.filter(c=>!esCuentaAhorro(c)).forEach(c=>arr.push({val:fuenteDeCuenta(c.id),label:c.nombre}));
  if(incluirTC)(S.tarjetasCredito||[]).filter(tc=>(tc.estado||'activa')==='activa').forEach(tc=>arr.push({val:'tc:'+tc.id,label:tc.nombre+' (TC)'}));
  return arr;
}
function getFuentes(){return _listaFuentes(true);}
function getFuentesSinTC(){return _listaFuentes(false);}

/* ---- CÓDIGO DE FUENTE: Fuente.parsear y etiquetas ----
   Una «fuente» es el código de dónde sale o a dónde entra la plata: '' (sin especificar), 'alcancia', 'ganancia' (plata virtual),
   'cuenta:ID', 'cajita:ID' o 'tc:ID'. El prefijo se interpreta SOLO acá (Fuente.*), nunca con startsWith/split en cada módulo.
     Fuente.parsear(val) → { tipo: 'vacia'|'alcancia'|'ganancia'|'cuenta'|'cajita'|'tc'|'otra', id }
     Fuente.esCuenta / esCajita / esTC(val) · Fuente.id(val) (la parte tras «:») · Fuente.de(tipo, id) (arma el código)
   Etiquetas (contrato explícito, ya no depende del contexto):
     fuenteTexto(val) → SIEMPRE texto plano. Usar con textContent, toast, logCambio o dentro de html`` (que lo escapa).
     fuenteHtml(val)  → SIEMPRE HTML seguro (texto escapado; 'ganancia' lleva su ícono). Solo para armar strings de HTML a mano
                        o dentro de raw(); en html`` usar ${raw(fuenteHtml(v))}.
     fuenteLabel(val) → alias de fuenteTexto (compatibilidad). */
const Fuente = (() => {
  const PREFIJOS = { cuenta: 'cuenta:', cajita: 'cajita:', tc: 'tc:' };
  const tipoDe = val => {
    if (!val || typeof val !== 'string') return 'vacia';
    if (val === 'alcancia' || val === 'ganancia') return val;
    for (const t in PREFIJOS) if (val.startsWith(PREFIJOS[t])) return t;
    return 'otra';
  };
  return {
    parsear: val => { const tipo = tipoDe(val); return { tipo, id: PREFIJOS[tipo] ? val.slice(PREFIJOS[tipo].length) : '' }; },
    tipo: tipoDe,
    esCuenta: val => tipoDe(val) === 'cuenta',
    esCajita: val => tipoDe(val) === 'cajita',
    esTC: val => tipoDe(val) === 'tc',
    id: val => { const t = tipoDe(val); return PREFIJOS[t] ? val.slice(PREFIJOS[t].length) : ''; },
    de: (tipo, id) => (PREFIJOS[tipo] || '') + id,
  };
})();
if (typeof window !== 'undefined') window.Fuente = Fuente;

function fuenteTexto(val){
  if(!val)return'Sin especificar';
  if(val==='alcancia')return'Alcancía';
  if(val==='ganancia')return'Ganancia (no desembolsada)';
  const f=Fuente.parsear(val);
  if(f.tipo==='cuenta')return nombreCuenta(getCuentaDeFuente(val));
  if(f.tipo==='cajita'){
    const c=(S.cajitas||[]).find(x=>x.id===f.id);
    return c?c.nombre+' ('+nombreCuenta(cuentaDeCajita(c))+')':'Cajita eliminada';
  }
  if(f.tipo==='tc'){
    const tc=(S.tarjetasCredito||[]).find(x=>x.id===f.id);
    return tc?tc.nombre:'Tarjeta de crédito';
  }
  return val;
}
const _ICONO_GANANCIA='<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ico-inline"><ellipse cx="12" cy="17" rx="8" ry="5"/><path d="M4 17v-4c0-2.76 3.58-5 8-5s8 2.24 8 5v4"/><path d="M4 13c0-2.76 3.58-5 8-5s8 2.24 8 5"/></svg>';
function fuenteHtml(val){
  return val==='ganancia' ? _ICONO_GANANCIA+' Ganancia (no desembolsada)' : escHtml(fuenteTexto(val));
}
function fuenteLabel(val){ return fuenteTexto(val); }

/* Clase de «badge» de una fuente. Cada cuenta tiene su propio color, así que la clase se genera por cuenta (bg-cta-<id>) y su regla
   se inyecta una sola vez en <style id="badges-cuentas">: los sitios que escriben class="badge ${fuenteBadgeClass(f)}" no cambian. */
const _badgesInyectados=new Set();
function _clasePorCuenta(c){
  const hex=colorCuenta(c);
  const clase='bg-cta-'+String(c.id).replace(/[^a-zA-Z0-9_-]/g,'');
  try{
    if(typeof document!=='undefined'&&document&&typeof document.createElement==='function'&&!_badgesInyectados.has(clase+hex)){
      let st=document.getElementById('badges-cuentas');
      if(!st){st=document.createElement('style');st.id='badges-cuentas';(document.head||document.documentElement).appendChild(st);}
      const m=/^#?([0-9a-f]{6})$/i.exec(hex.trim());
      const rgb=m?[0,2,4].map(i=>parseInt(m[1].slice(i,i+2),16)).join(','):'136,136,128';
      st.appendChild(document.createTextNode('.'+clase+'{background:rgba('+rgb+',.12);color:'+(m?'#'+m[1]:'var(--text2)')+';}'));
      _badgesInyectados.add(clase+hex);
    }
  }catch(e){/* sin DOM (tests): la clase se devuelve igual */}
  return clase;
}
function fuenteBadgeClass(val){
  if(!val)return'bg-blue';
  if(val==='ganancia')return'bg-green';
  if(esFuenteCuenta(val)){const c=getCuentaDeFuente(val);return c?_clasePorCuenta(c):'bg-blue';}
  if(Fuente.esCajita(val)){const c=cuentaDeCajita((S.cajitas||[]).find(x=>x.id===val.split(':')[1]));return c?_clasePorCuenta(c):'bg-blue';}
  if(Fuente.esTC(val))return'bg-red';
  return'bg-blue';
}

function poblarFuente(selectId, required=false, incluirTC=true){
  const sel=document.getElementById(selectId);
  if(!sel)return;
  sel.innerHTML=opcionesCuenta({ placeholder: required ? 'Seleccionar cuenta' : 'Sin especificar', tarjetas: incluirTC });
}

function getSaldoFuente(fuente){
  if(!fuente)return 0;
  if(esFuenteCuenta(fuente)){
    const c=getCuentaDeFuente(fuente);
    if(!c)return 0;
    return esCuentaAhorro(c)?ahorroTotal(c.id):(c.saldo||0);
  }
  if(Fuente.esCajita(fuente)){
    const id=fuente.split(':')[1];
    const c=(S.cajitas||[]).find(x=>x.id===id);
    return c?calcC(c).val:0;
  }
  if(Fuente.esTC(fuente)){
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
// nombre de la cuenta. Devuelve {ok:true} o {ok:false, mensaje}, con
// `mensaje` en texto plano (toast() ya no pinta HTML). No toca el DOM ni los saldos.
//  · Cuenta/cajita: falla si el saldo disponible es menor que el monto.
//  · TC: falla solo si la tarjeta tiene cupo configurado y el cupo disponible no alcanza (sin cupo, no
//    hay límite que validar; una TC inexistente tampoco bloquea: eso lo decide quien la busca).
//  · Fuente vacía: ok (el gasto "sin especificar" no mueve plata).
// Comparación estricta (disponible < monto), igual que los módulos que la usaban.
