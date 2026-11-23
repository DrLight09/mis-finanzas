/* ═══════════════════════════════════════════════════════════════
   js/modules/tarjetas-credito.js

   Módulo "Tarjetas de Crédito", extraído de index.html.

   Migrado siguiendo el mismo patrón que Spotify, Mesada y Encargos:
   - Los `onclick="..."` inline se reemplazaron por `data-action` +
     `Events.on(...)` (ver js/core/events.js). Los botones de la UI
     invocan las acciones a través del despachador centralizado en
     vez de handlers propios.
   - El HTML de las pantallas/sheets (#screen-tarjetas,
     #sheet-nueva-tc, #sheet-compra-tc, #sheet-pagar-tc,
     #tc-deuda-card; el detalle de la tarjeta ya no es hoja: es el panel #tc-detalle) se quedó en index.html; solo
     se movió el JS.
   - A diferencia de Spotify y Encargos, este módulo NO necesitó
     partirse en dos archivos: no tiene una dependencia de
     integración con Personas ni con nada definido más abajo en el
     documento. El "Feed de actividad financiera" lee S.tarjetasCredito
     y S.tcMovimientos directamente (no llama funciones de este
     módulo), así que no genera una dependencia de orden de carga.

   Qué NO se movió acá aunque compartía el mismo <script> original:
   - `navTo(screen)` — función de navegación global que vivía en
     js/core/nav.js. Este módulo era su único caller real (el botón
     "Ver todo" → `Events.on('tarjetas:verTodo', ...)`); al confirmarlo
     (2026-09-10) se cambió ese handler para llamar
     `closeMas(); showScreen('tarjetas');` — mismo patrón que ya usa
     mas-menu.js para sus propios ítems — y con eso `navTo()` se quedó
     sin ningún caller conocido y se retiró junto con js/core/nav.js.
     Ver changelog/infraestructura-seguridad.md.
   - El "Feed de actividad financiera" — un módulo distinto que
     compartía el mismo tag <script> por casualidad de cómo estaba
     armado el archivo, no por relación real con Tarjetas de Crédito.

   Fixes de `.innerHTML`/`toast()` sin escapar aplicados en esta
   migración (mismo patrón ya confirmado en Spotify/Mesada/Encargos:
   texto libre envuelto en una función, invisible al barrido por
   nombre de campo conocido):
   - `toast()` con `tc.nombre` sin escapar (cupo insuficiente al
     registrar una compra)
   - `toast()` con `fuenteLabel(fuente)` sin escapar (saldo
     insuficiente al pagar)
   - `fuenteLabel(p.fuente)` sin escapar en el badge de origen del
     detalle de un pago
   - `descPago` (arma texto con `tc.nombre` + nota libre del pago)
     insertado sin escapar en el detalle de un pago
   - la opción del selector de cuenta de pago (`f.label`, nombre de
     cajita/cuenta personalizada) sin escapar

   Hallazgo colateral, fuera de alcance de esta sesión: el mismo
   patrón (`f.label` sin escapar) existe en `opcionesCuenta()`,
   función núcleo compartida por TODA la app (no solo por Tarjetas de
   Crédito) — no se tocó acá por el mismo criterio que ya aplicó la
   auditoría a `toast()`: cambiar una función compartida en medio de
   una migración de un solo módulo puede afectar pantallas fuera de
   este alcance. Queda como hallazgo pendiente para una sesión propia.

   Nota (2026-08-02) — intento de volver este módulo LAZY (docs/
   auditoria-tecnica.md #4): el wiring de botones que esperaba
   'DOMContentLoaded' se corrigió a top-level (mismo bug/mismo fix que
   ya se aplicó en actividad-reciente.js) — ver más abajo.

   RESUELTO (2026-08-02, ronda posterior): con el núcleo real en
   mano se confirmó que tcNormalizarTarjetas() SÍ tiene guard typeof en
   refresh() (aunque tcNormalizarTarjetas no es una de las 12 render*
   originalmente mapeadas) y que renderTCDashboard() — que no lo tenía —
   ya se corrigió ahí también. movimientos.js (que llama
   tcEliminarCompraInterna/tcEliminarPagoInterna sin guard) y spotify.js
   (getTCById/tcCupoDisponible/tcRecalcular sin guard) también se
   corrigieron con Loader.ensure('tarjetas'). El wrapper de abrirDetalleMovimiento
   de este archivo (ver Events.registerAll más abajo) ya resuelve el
   nombre en tiempo de click, no de carga — es lazy-safe sin cambios. Ya
   se puede agregar `tarjetas` a Loader.GROUPS — ver js/core/lazy-loader.js
   y el <script> correspondiente en index.html.

   RESUELTO (2026-08-04): getTCById(), tcCupoUsadoPct() y
   tcCupoDisponible() se sacaron de este archivo y ahora viven en
   js/core/calc-helpers.js, que carga de entrada. Motivo: Inicio
   (inicio.js, "Necesita atención") necesitaba estas 3 funciones puras
   pero forzar la carga de este módulo completo (60KB) solo para
   leerlas anulaba el beneficio de haberlo vuelto lazy. Efecto
   colateral bueno: spotify.js y movimientos.js ya no necesitan esperar
   Loader.ensure('tarjetas') para llamar getTCById/tcCupoDisponible
   (siguen necesitándolo para tcRecalcular, que sigue acá y sigue lazy).
   ═══════════════════════════════════════════════════════════════ */

import { exponerGlobales, exponerVariables } from '../core/puente.js';
import { Fuente, Libro, Plata, descontarFuente, fuenteBadgeClass, fuenteLabel, getFuentesSinTC, getSaldoFuente, sumarFuente } from '../core/cuentas-fuentes.js';
import { S, escHtml, fmt, getCatsVar, hoy, mesKey, poblarCatSelect, uid } from '../core/estado.js';
import { fmtInput, parseMoney, registrarSonda, save } from '../core/persistencia.js';
import { html, raw } from '../core/html-tag.js';
import { closeSheet, openSheet, showScreen } from '../core/navegacion.js';
import { Deudas, getTCById, tcCupoDisponible, tcCupoUsadoPct } from '../core/calc-helpers.js';
import { marcarColorSeleccionado } from '../core/color-picker.js';
import { avisarMovimientoBloqueado, confirmarBorrarMovimientoViejo, confirmarEliminar, dialogo, nivelAntiguedadMovimiento, toast } from '../core/dialogos.js';
import { refresh } from '../core/refresh.js';
import { botonEliminarFila, emptyInline, emptyState } from '../core/utilidades-ui.js';
import { Events } from '../core/events.js';
import { calcC } from '../core/nu-calc.js';
import { FuentesFiltro } from '../core/fuentes-filtro.js';
import { mesActual } from '../core/ingresos.js';
import { Personas } from '../core/personas-core.js';
import { medirPatrimonioParaHistorial, purgarEfectoEnHistorial } from '../core/patrimonio.js';
import { abrirDetalleMovimiento } from '../core/movimientos.js';
import { Ui } from '../core/ui.js';
// Puente global (js/core/puente.js): las funciones se hoistean, así que quedan en window desde el principio.
exponerGlobales({ _tcOperacionesPosteriores, tcDeudaTotal, tcEstadoInfo, _tcEsCargoExterno, tcDeudaCalculada, tcRecalcular, tcNormalizarTarjetas, tcCrearCompra, tcEliminarCompraInterna, tcBuscarCompraPorIdOMatch, tcCrearPago, tcEliminarPagoInterna, _tcPoblarSelectCajita, abrirNuevaTarjeta, abrirEditarTC, tcSelColor, guardarTC, eliminarTC, _tcPanelPc, _tcMarcarActiva, _tcCerrarDetalle, renderTCScreen, renderTCDashboard, abrirCompraTC, confirmarCompraTC, abrirCargoEspecialTC, confirmarCargoEspecialTC, abrirPagarTC, ptcSetMonto, ptcActualizarPreview, confirmarPagarTC, abrirDetalleTCSheet, eliminarCompraTC, eliminarPagoTC });

export let _tcActualId = null;
export let _tcCompraTcId = null;
export let _tcEditId = null;
export let _tcColorSel = null;
export let _tcCargoEspecialId = null;

export const TC_ESTADOS = {
  activa:    {label:'Activa',    badge:null},
  bloqueada: {label:'Bloqueada', badge:'bg-amber'},
  cancelada: {label:'Cancelada', badge:'bg-red'},
  vencida:   {label:'Vencida',   badge:'bg-red'}
};

// Cargos especiales (ver §7 tarjetas-credito.md): a diferencia de una
// compra, este es un caso donde el BANCO impone el cargo (intereses,
// comisiones, correcciones de cierre) — no una decisión de gasto propia.
// Por eso el flujo de "+ Cargo especial" NO valida cupo disponible, a
// propósito, mientras que una compra normal (tcCrearCompra vía
// confirmarCompraTC) sí lo hace siempre.
export const TC_MOTIVOS_CARGO = {
  interes: 'Interés',
  comision: 'Comisión',
  otro: 'Otro cargo del banco'
};

// ── Helpers básicos ─────────────────────────────────────────────
// getTCById(), tcCupoUsadoPct() y tcCupoDisponible() se movieron a
// js/core/calc-helpers.js: Inicio las necesita para
// "Necesita atención" y este módulo ahora es lazy, así que esas 3
// funciones puras viven en un archivo que carga de entrada. Acá se
// siguen usando igual, como globales.

// Cantidad de compras/pagos posteriores (no eliminados) de la misma tarjeta
// — criterio de "operaciones posteriores" de la protección por antigüedad
// (ver js/core/dialogos.js#nivelAntiguedadMovimiento y
// docs/proteccion-antiguedad-movimientos.md §4: sin ciclo natural como
// Spotify, se cuenta contra la cuenta/tarjeta afectada en su lugar).
// ── Libro (js/core/cuentas-fuentes.js) ─────────────────────────────────────────────────────────────────────────────────
// _origenLibroTc(ref, rev): cada sumar/descontarFuente deja en el libro { modulo:'tarjetas', ref:<id del pago de la tarjeta> }. Con rev=true es una reversión (tipo 'reversion', mismo ref que lo que deshace).
export const _origenLibroTc = Libro.origen('tarjetas');

export function _tcOperacionesPosteriores(tc, fecha, excludeId){
  if(!fecha)return 0;
  const compras=(tc.compras||[]).filter(c=>!c.eliminado&&c.id!==excludeId&&c.fecha>fecha).length;
  const pagos=(tc.pagos||[]).filter(p=>!p.eliminado&&p.id!==excludeId&&p.fecha>fecha).length;
  return compras+pagos;
}

export function tcDeudaTotal(){
  return (S.tarjetasCredito||[]).reduce((a,tc)=>a+(tc.deuda||0),0);
}

export function tcEstadoInfo(estado){
  return TC_ESTADOS[estado]||TC_ESTADOS.activa;
}

// ── Regla de consistencia: recalcular la deuda desde los movimientos ──
// tc.deuda hace de cupoUtilizado Y de deudaActual a la vez (por eso
// esa igualdad nunca se puede romper). Esta función la reconstruye
// sumando el saldo inicial, las compras no eliminadas y los cargos
// externos (encargos/préstamos pagados con esta TC), y restando los
// pagos no eliminados. Nunca deja valores negativos.
// Cargos "externos" de S.tcMovimientos: suben tc.deuda y tienen que ser reconstruibles
// desde sus registros (tcRecalcular corre en cada refresh y pisa tc.deuda). Un tipo
// que no esté en esta lista se perdería en el siguiente refresh().
//   cargo_encargo / cargo_prestamo / cargo_spotify — plata ajena (ver calcDeudaAjenaDeTarjeta)
//   cargo_deuda — pago de una deuda PROPIA ("Yo debo") con esta tarjeta: es deuda tuya, no ajena
export function _tcEsCargoExterno(m){
  return m.tipo==='cargo_encargo'||m.tipo==='cargo_prestamo'||m.tipo==='cargo_spotify'||m.tipo==='cargo_deuda';
}
// Deuda de una tarjeta calculada desde sus movimientos (saldo inicial + compras + cargos − pagos, sin los eliminados, con piso en 0).
// PURA: no escribe nada. Es la única definición de esa cuenta: tcRecalcular la guarda en tc.deuda y la sonda «tarjetas» de la huella
// (js/core/huella.js) la lee para comprobar que un cambio de almacenamiento no la altera.
export function tcDeudaCalculada(tc){
  if(!tc) return 0;
  let total=0;
  if(tc.saldoInicial && !tc.saldoInicial.eliminado) total+=(tc.saldoInicial.monto||0);
  (tc.compras||[]).forEach(c=>{ if(!c.eliminado) total+=(c.monto||0); });
  (S.tcMovimientos||[]).forEach(m=>{
    if(m.tcId===tc.id && _tcEsCargoExterno(m) && !m.eliminado) total+=(m.monto||0);
  });
  (tc.pagos||[]).forEach(p=>{ if(!p.eliminado) total-=(p.monto||0); });
  return Math.max(0,total);
}
export function tcRecalcular(tc){
  if(!tc) return 0;
  tc.deuda=tcDeudaCalculada(tc);
  return tc.deuda;
}

// Sonda de la huella: deuda calculada vs guardada, cupo y estado de cada tarjeta. `coherente` detecta un tc.deuda desactualizado.
registrarSonda('tarjetas',estadoActual=>{
  const entidades={};
  (estadoActual.tarjetasCredito||[]).forEach(tc=>{
    const calculada=tcDeudaCalculada(tc), guardada=tc.deuda||0;
    entidades[tc.id]={saldo:calculada,guardada,coherente:Math.abs(calculada-guardada)<0.01,cupo:tc.cupo||0,estado:tc.estado||'activa'};
  });
  return {entidades,totalDeuda:Object.keys(entidades).reduce((a,k)=>a+entidades[k].saldo,0)};
});

// ── Migración y auto-sanación ────────────────────────────────────
// Se ejecuta en cada refresh(). Es idempotente (se puede llamar todas
// las veces que haga falta sin generar duplicados ni efectos raros):
//   · agrega los campos nuevos (banco, franquicia, color, estado,
//     eliminado...) con valores por defecto a las
//     tarjetas creadas antes de este refactor;
//   · infiere un movimiento de "Saldo inicial" para que el historial
//     cuadre exactamente con la deuda que ya existía;
//   · limpia avisos de corte, que ya no existen en este modelo;
//   · recalcula la deuda de cada tarjeta desde sus movimientos.
export function tcNormalizarTarjetas(){
  if(!Array.isArray(S.tarjetasCredito)) S.tarjetasCredito=[];
  if(Array.isArray(S.tcMovimientos)){
    S.tcMovimientos=S.tcMovimientos.filter(m=>m.tipo!=='corte_aviso');
  }
  S.tarjetasCredito.forEach(tc=>{
    if(typeof tc.banco!=='string') tc.banco='';
    if(typeof tc.franquicia!=='string') tc.franquicia='';
    if(tc.color===undefined) tc.color=null;
    if(!tc.estado||!TC_ESTADOS[tc.estado]) tc.estado='activa';
    if(!Array.isArray(tc.compras)) tc.compras=[];
    if(!Array.isArray(tc.pagos)) tc.pagos=[];
    tc.compras.forEach(c=>{
      if(typeof c.eliminado!=='boolean') c.eliminado=false;
    });
    tc.pagos.forEach(p=>{ if(typeof p.eliminado!=='boolean') p.eliminado=false; });
    // "undefined" = tarjeta de antes del refactor, nunca tocada → inferir.
    // "null" = ya se decidió (en creación) que no había deuda previa.
    if(tc.saldoInicial===undefined){
      const sumCompras=tc.compras.filter(c=>!c.eliminado).reduce((a,c)=>a+(c.monto||0),0);
      const sumPagos=tc.pagos.filter(p=>!p.eliminado).reduce((a,p)=>a+(p.monto||0),0);
      const sumCargos=(S.tcMovimientos||[]).filter(m=>m.tcId===tc.id&&_tcEsCargoExterno(m)&&!m.eliminado).reduce((a,m)=>a+(m.monto||0),0);
      const inferido=Math.max(0,(tc.deuda||0)-sumCompras-sumCargos+sumPagos);
      let fechaInferida=hoy();
      const fechasConocidas=[...tc.compras.map(c=>c.fecha),...tc.pagos.map(p=>p.fecha)].filter(Boolean).sort();
      if(fechasConocidas.length) fechaInferida=fechasConocidas[0];
      tc.saldoInicial=inferido>0?{id:uid(),monto:inferido,fecha:fechaInferida,nota:'Saldo inicial',eliminado:false}:null;
    }
    tcRecalcular(tc);
  });
}

// ── Compras: capa de datos (sin tocar UI ni gastosVar) ───────────
export function tcCrearCompra(tc,datos){
  if(!Array.isArray(tc.compras)) tc.compras=[];
  const compra={
    id:uid(),
    desc:datos.desc||'',
    cat:datos.cat||'',
    fecha:datos.fecha||hoy(),
    monto:datos.monto||0,
    nota:datos.nota||'',
    eliminado:false
  };
  if(datos._esFavor) compra._esFavor=true;
  if(datos._desdePlataComprometida) compra._desdePlataComprometida=true;
  if(datos._esCargoEspecial){ compra._esCargoEspecial=true; compra._motivoCargo=datos._motivoCargo||'otro'; }
  tc.compras.push(compra);
  tcRecalcular(tc);
  return compra;
}

// Marca una compra como eliminada (nunca se borra físicamente del
// array), recalcula la deuda y devuelve la compra para que quien
// llama limpie lo que corresponda (p.ej. el gasto variable espejo).
export function tcEliminarCompraInterna(tc,compraId){
  const compra=(tc.compras||[]).find(c=>c.id===compraId&&!c.eliminado);
  if(!compra) return null;
  compra.eliminado=true;
  tcRecalcular(tc);
  return compra;
}

// Busca una compra por id; si no la encuentra (registros de antes de
// este refactor no siempre tenían un id enlazado del lado del gasto),
// cae de vuelta a un match por descripción+monto sin eliminar.
export function tcBuscarCompraPorIdOMatch(tc,compraId,desc,monto){
  if(compraId){
    const porId=(tc.compras||[]).find(c=>c.id===compraId&&!c.eliminado);
    if(porId) return porId;
  }
  return (tc.compras||[]).find(c=>!c.eliminado&&c.desc===desc&&Math.abs((c.monto||0)-(monto||0))<1);
}

// ── Pagos: capa de datos ──────────────────────────────────────────
export function tcCrearPago(tc,datos){
  if(!Array.isArray(tc.pagos)) tc.pagos=[];
  const pago={
    id:uid(),
    monto:datos.monto||0,
    fecha:datos.fecha||hoy(),
    fuente:datos.fuente||'',
    nota:datos.nota||'',
    eliminado:false
  };
  tc.pagos.push(pago);
  tcRecalcular(tc);
  return pago;
}

export function tcEliminarPagoInterna(tc,pagoId){
  const pago=(tc.pagos||[]).find(p=>p.id===pagoId&&!p.eliminado);
  if(!pago) return null;
  pago.eliminado=true;
  tcRecalcular(tc);
  return pago;
}

// ── Nueva / editar tarjeta ────────────────────────────────────────
// Repuebla el <select> de cajita vinculada cada vez que se abre el form,
// por si el usuario creó/eliminó cajitas desde la última vez.
export function _tcPoblarSelectCajita(selectedId){
  const sel=document.getElementById('tc_cajita_vinculada');
  if(!sel)return;
  const opciones=(S.cajitas||[]).map(c=>html`<option value="${c.id}">${c.nombre}</option>`).join('');
  sel.innerHTML=html`<option value="">Ninguna</option>${raw(opciones)}`;
  // Si la cajita guardada ya no existe (fue eliminada), selectedId no matchea
  // ninguna <option> y el select cae solo en "Ninguna" — no rompe nada.
  sel.value=selectedId||'';
}

export function abrirNuevaTarjeta(){
  _tcEditId=null;
  document.getElementById('tc-form-title').textContent='Nueva tarjeta de crédito';
  document.getElementById('tc_nombre').value='';
  document.getElementById('tc_banco').value='';
  document.getElementById('tc_franquicia').value='Visa';
  document.getElementById('tc_cupo').value='';
  document.getElementById('tc_tasa').value='';
  document.getElementById('tc_deuda_ini').value='';
  document.getElementById('tc-deuda-ini-grupo').style.display='';
  document.getElementById('tc-estado-grupo').style.display='none';
  _tcPoblarSelectCajita(null);
  tcSelColor(null);
  document.getElementById('btn-guardar-tc').textContent='Guardar tarjeta';
  openSheet('nueva-tc');
  focusSheetField('tc_nombre');
}

export function abrirEditarTC(id){
  const tc=getTCById(id);
  if(!tc)return;
  _tcEditId=id;
  document.getElementById('tc-form-title').textContent='Editar tarjeta';
  document.getElementById('tc_nombre').value=tc.nombre||'';
  document.getElementById('tc_banco').value=tc.banco||'';
  document.getElementById('tc_franquicia').value=tc.franquicia||'Visa';
  document.getElementById('tc_cupo').value=tc.cupo?fmtInput(tc.cupo):'';
  document.getElementById('tc_tasa').value=tc.tasaEA?String(tc.tasaEA).replace('.',','):'';
  document.getElementById('tc-deuda-ini-grupo').style.display='none';
  document.getElementById('tc_estado').value=tc.estado||'activa';
  document.getElementById('tc-estado-grupo').style.display='';
  _tcPoblarSelectCajita(tc.cajitaId||null);
  tcSelColor(tc.color||null);
  document.getElementById('btn-guardar-tc').textContent='Guardar cambios';
  openSheet('nueva-tc');
}

export function tcSelColor(color){
  _tcColorSel=color;
  marcarColorSeleccionado('.tc-color-opt', color); // js/core/color-picker.js
}

export function guardarTC(){
  const nombre=document.getElementById('tc_nombre').value.trim();
  if(!nombre){toast('Ingresa el nombre de la tarjeta','err');return;}
  const banco=document.getElementById('tc_banco').value.trim();
  const franquicia=document.getElementById('tc_franquicia').value;
  const cupo=parseMoney(document.getElementById('tc_cupo').value)||0;
  // El cupo es obligatorio (al crear y al editar): los selectores de "de dónde sale la plata"
  // solo ofrecen una TC si tiene cupo disponible (FuentesFiltro, js/core/fuentes-filtro.js),
  // y sin cupo configurado no hay forma de saber cuánto se le puede cargar.
  if(cupo<=0){
    toast('Ingresa el cupo total de la tarjeta','err');
    const cupoEl=document.getElementById('tc_cupo');
    if(cupoEl)cupoEl.focus();
    return;
  }
  // Tasa E.A. opcional (P2): vacío = no se calcula costo de la deuda (la app no simula al banco). Entre 0 y 100 %.
  const tasaTxt=(document.getElementById('tc_tasa').value||'').trim().replace(',','.');
  const tasaEA=tasaTxt===''?null:Number(tasaTxt);
  if(tasaEA!==null&&(!isFinite(tasaEA)||tasaEA<0||tasaEA>100)){toast('La tasa E.A. debe estar entre 0 y 100','err');return;}
  const cajitaSel=document.getElementById('tc_cajita_vinculada');
  const cajitaId=cajitaSel&&cajitaSel.value?cajitaSel.value:null;
  if(!S.tarjetasCredito)S.tarjetasCredito=[];
  if(_tcEditId){
    const tc=getTCById(_tcEditId);
    if(tc){
      if(cupo>0&&cupo<tc.deuda){toast('El cupo no puede ser menor a la deuda actual ('+fmt(tc.deuda)+')','err');return;}
      tc.nombre=nombre;
      tc.banco=banco;
      tc.franquicia=franquicia;
      tc.cupo=cupo;
      if(tasaEA===null) delete tc.tasaEA; else tc.tasaEA=tasaEA;
      tc.color=_tcColorSel;
      tc.cajitaId=cajitaId;
      const estadoSel=document.getElementById('tc_estado');
      if(estadoSel&&TC_ESTADOS[estadoSel.value]) tc.estado=estadoSel.value;
      tcRecalcular(tc);
    }
    toast('Tarjeta actualizada','ok');
  } else {
    const deudaIni=parseMoney(document.getElementById('tc_deuda_ini').value)||0;
    if(cupo>0&&deudaIni>cupo){toast('La deuda inicial no puede ser mayor al cupo ('+fmt(cupo)+')','err');return;}
    const nuevo={
      id:uid(),nombre,banco,franquicia,color:_tcColorSel,
      cupo,deuda:0,estado:'activa',cajitaId,
      ...(tasaEA!==null?{tasaEA}:{}),
      saldoInicial:deudaIni>0?{id:uid(),monto:deudaIni,fecha:hoy(),nota:'Saldo inicial',eliminado:false}:null,
      compras:[],pagos:[],
      creadoEn:hoy()
    };
    S.tarjetasCredito.push(nuevo);
    tcRecalcular(nuevo);
    toast('Tarjeta agregada','ok');
  }
  closeSheet('nueva-tc');
  save();refresh();
  renderTCScreen();
}

export async function eliminarTC(id){
  const tc=getTCById(id);
  if(!tc)return;
  const tieneVinculos=(S.tcMovimientos||[]).some(m=>m.tcId===id);
  const ok=await confirmarEliminar({titulo:'Eliminar tarjeta',objeto:'"'+tc.nombre+'" y todo su historial',
    detalle:tieneVinculos?'Hay encargos o préstamos que se pagaron con esta tarjeta y perderán esa referencia.':''});
  if(!ok)return;
  S.tarjetasCredito=(S.tarjetasCredito||[]).filter(x=>x.id!==id);
  // Limpiar movimientos secundarios asociados — sin esto quedaban
  // gastos y cargos huérfanos apuntando a una tarjeta que ya no existe.
  if(S.gastosVar) S.gastosVar=S.gastosVar.filter(g=>g._tcId!==id);
  if(S.tcMovimientos) S.tcMovimientos=S.tcMovimientos.filter(m=>m.tcId!==id);
  save();refresh();renderTCScreen();
  toast('Tarjeta eliminada','ok');
}

// ── Dashboard ─────────────────────────────────────────────────────
/* ── Pantalla de Tarjetas (como el prototipo). PC (≥900 px): resumen arriba y debajo la lista de tarjetas | compras y pagos de la tarjeta elegida
   (la primera mientras no se toque otra). Celular: la lista de siempre; «Ver» abre el detalle como pantalla propia (con «Volver»), no como hoja.
   Qué se ve lo deciden el CSS y dos atributos de #screen-tarjetas: data-vacio (sin tarjetas) y data-detalle-abierto (solo celular). ── */
export let _tcSelId=null;
export const _consultaPcTC=typeof window.matchMedia==='function'?window.matchMedia('(min-width: 900px)'):null;
export function _tcPanelPc(){
  if(!_consultaPcTC||!_consultaPcTC.matches)return false;
  const pantalla=document.getElementById('screen-tarjetas');
  return !!(pantalla&&pantalla.classList.contains('active')&&document.getElementById('tc-detalle'));
}
export function _tcMarcarActiva(){
  document.querySelectorAll('#tc-lista .tc-card[data-tc-id]').forEach(c=>c.classList.toggle('tc-card-activa',_tcPanelPc()&&c.getAttribute('data-tc-id')===_tcSelId));
}
// Celular: vuelve de la pantalla de detalle a la lista.
export function _tcCerrarDetalle(){
  const pantalla=document.getElementById('screen-tarjetas');
  if(!pantalla||pantalla.dataset.detalleAbierto!=='si')return;
  pantalla.dataset.detalleAbierto='no';
  const scroll=document.getElementById('scrollArea');
  if(scroll)scroll.scrollTop=0;
}
Ui.pantalla('*',nombre=>{if(nombre!=='tarjetas')_tcCerrarDetalle();},{key:'tarjetas-cerrar-detalle'});
export function renderTCScreen(){
  const tarjetas=S.tarjetasCredito||[];
  const hero=document.getElementById('tc-hero-deuda');
  const heroCupo=document.getElementById('tc-hero-cupo');
  const lista=document.getElementById('tc-lista');
  if(!hero||!lista)return;
  const deudaTotal=tcDeudaTotal();
  const cupoTotal=tarjetas.reduce((a,tc)=>a+(tc.cupo||0),0);
  hero.textContent=fmt(deudaTotal);
  if(heroCupo)heroCupo.textContent=cupoTotal?'Cupo total: '+fmt(cupoTotal):'';
  const cupoMonto=document.getElementById('tc-cupo-total'),cupoSub=document.getElementById('tc-cupo-sub');
  if(cupoMonto)cupoMonto.textContent=fmt(cupoTotal);
  if(cupoSub)cupoSub.textContent=tarjetas.length+(tarjetas.length===1?' tarjeta':' tarjetas');
  const panelTC=document.getElementById('tc-detalle');
  if(panelTC)panelTC.hidden=!tarjetas.length;
  const pantalla=document.getElementById('screen-tarjetas');
  if(pantalla)pantalla.dataset.vacio=tarjetas.length?'no':'si'; // sin tarjetas el CSS esconde el resumen y «Agregar tarjeta» (el estado vacío trae el suyo)
  if(!tarjetas.length){
    _tcCerrarDetalle();
    lista.innerHTML=emptyState(
      '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="1.8" stroke-linecap="round"><rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 10h20"/><path d="M6 15h3"/></svg>',
      'Sin tarjetas de crédito',
      'Agrega tu primera tarjeta para registrar compras y controlar tu cupo.',
      'Agregar tarjeta',
      {action:'tarjetas:nueva'});
    return;
  }

  lista.innerHTML=tarjetas.map(tc=>{
    const deuda=tc.deuda||0;
    const cupo=tc.cupo||0;
    const disponible=tcCupoDisponible(tc);
    const pct=tcCupoUsadoPct(tc);
    const estadoInfo=tcEstadoInfo(tc.estado);
    const activa=(tc.estado||'activa')==='activa';
    // tc.banco es texto libre (input); tc.franquicia viene de un <select> con
    // opciones fijas (Visa/Mastercard/...) — de todas formas ambos pasan por
    // html`` acá, no hace daño escapar un valor fijo.
    const subtitulo=[tc.banco,tc.franquicia].filter(Boolean).join(' · ');
    const colorIcono=tc.color||'currentColor';

    return html`<div class="card tc-card" data-tc-id="${tc.id}">
      <div class="tc-cab">
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${colorIcono}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="tc-ico-tarjeta"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/></svg>
        <div class="tc-flex1-min0">
          <div class="tc-nombre">${tc.nombre}
            ${raw(estadoInfo.badge?`<span class="badge ${estadoInfo.badge} badge-xs">${estadoInfo.label}</span>`:'')}
          </div>
          ${subtitulo?html`<div class="tc-sub">${subtitulo}</div>`:''}
        </div>
        <div class="tc-acciones">
          <button type="button" ${raw(Events.attr('tarjetas:editar',tc.id))} class="tc-btn-editar" aria-label="Editar ${tc.nombre}"><svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
          <button type="button" ${raw(Events.attr('tarjetas:eliminar',tc.id))} class="tc-btn-borrar" aria-label="Eliminar ${tc.nombre}"><svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg></button>
        </div>
      </div>

      <div class="tc-resumen-grid">
        <div class="tc-caja-deuda">
          <div class="tc-cap">Deuda actual</div>
          <div class="tc-val-rojo">${fmt(deuda)}</div>
          <div class="tc-hint-mono">= cupo utilizado</div>
        </div>
        <div class="tc-caja-disp">
          <div class="tc-cap">Cupo disponible</div>
          <div class="tc-val-verde">${fmt(disponible)}</div>
          <div class="tc-hint-mono">de ${fmt(cupo)} en total</div>
        </div>
      </div>

      <div class="tc-cupo">
        <div class="tc-cupo-cab">
          <span class="tc-cap">Usado</span>
          <span class="tc-cupo-pct ${pct>80?'tc-c-red':pct>50?'tc-c-amber':'tc-c-text3'}">${pct.toFixed(0)}%</span>
        </div>
        <div class="tc-barra">
          <div class="tc-fill ${pct>80?'tc-bg-red':pct>50?'tc-bg-amber':'tc-bg-accent'}" style="width:${pct.toFixed(0)}%;"></div>
        </div>
      </div>

      <div class="tc-btns">
        ${raw(activa?`<button type="button" ${Events.attr('tarjetas:compra',tc.id)} class="tc-btn-compra-act">+ Compra</button>`
          :`<button type="button" disabled class="tc-btn-compra-off">+ Compra</button>`)}
        <button type="button" ${raw(Events.attr('tarjetas:pagar',tc.id))} ${raw(deuda<=0?'disabled':'')} class="tc-btn-pagar ${deuda<=0?'tc-btn-pagar-off':'tc-btn-pagar-on'}">Pagar</button>
        <button type="button" ${raw(Events.attr('tarjetas:verDetalle',tc.id))} class="tc-btn-ver">Ver</button>
      </div>
    </div>`;
  }).join('');
  if(_tcPanelPc()){
    // PC: la tarjeta elegida (la primera por defecto) con su detalle a la derecha.
    if(!_tcSelId||!getTCById(_tcSelId))_tcSelId=tarjetas[0].id;
    abrirDetalleTCSheet(_tcSelId);
  }else if(pantalla&&pantalla.dataset.detalleAbierto==='si'){
    // Celular con el detalle abierto: se repinta (una compra, un pago o un borrado cambian lo que muestra); si la tarjeta ya no existe, vuelve a la lista.
    if(getTCById(_tcSelId))abrirDetalleTCSheet(_tcSelId);else _tcCerrarDetalle();
  }
  _tcMarcarActiva();
}
// Tocar el cuerpo de una tarjeta (no sus botones) la elige. Solo en PC: en celular la tarjeta no es clicable (se usa «Ver»).
document.addEventListener('click',e=>{
  if(!_consultaPcTC||!_consultaPcTC.matches)return;
  const card=e.target.closest&&e.target.closest('#tc-lista .tc-card[data-tc-id]');
  if(!card||e.target.closest('button,[data-action]'))return;
  abrirDetalleTCSheet(card.getAttribute('data-tc-id'));
});

// ── Resumen de TC en la pantalla de Inicio ────────────────────────
export function renderTCDashboard(){
  const el=document.getElementById('tc-deuda-card');
  if(!el)return;
  const tarjetas=S.tarjetasCredito||[];
  if(!tarjetas.length){el.style.display='none';return;}
  el.style.display='';
  const items=tarjetas.map(tc=>{
    const pct=tcCupoUsadoPct(tc);
    const disponible=tcCupoDisponible(tc);
    const estadoInfo=tcEstadoInfo(tc.estado);
    return html`<div class="tc-fila">
      <div class="tc-flex1-min0">
        <div class="tc-fila-nombre">
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="tc-ico-fila"><rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 10h20"/><circle cx="7" cy="15" r="1.2" fill="currentColor" stroke="none"/></svg>${tc.nombre}
          ${raw(tc.cupo?`<span class="tc-pill ${pct>80?'tc-pill-red':pct>50?'tc-pill-amber':'tc-pill-neutro'}">${pct.toFixed(0)}% usado</span>`:'')}
          ${raw(estadoInfo.badge?`<span class="badge ${estadoInfo.badge} tc-badge-8">${estadoInfo.label}</span>`:'')}
        </div>
        ${raw(tc.cupo?`<div class="tc-barra-fila"><div class="tc-fill-sm ${pct>80?'tc-bg-red':pct>50?'tc-bg-amber':'tc-bg-accent'}" style="width:${pct.toFixed(0)}%;"></div></div>`:'')}
      </div>
      <div class="tc-fila-der">
        <div class="tc-fila-deuda">${fmt(tc.deuda||0)}</div>
        ${raw(tc.cupo?`<div class="tc-fila-disp">disp. ${fmt(disponible)}</div>`:'')}
      </div>
    </div>`;
  }).join('');
  el.innerHTML=html`<div class="sec-title tc-sec-titulo">
    <span>Tarjetas de crédito</span>
    <button type="button" ${raw(Events.attr('tarjetas:verTodo'))} class="tc-btn-vertodo">Ver todo</button>
  </div>
    <div class="card tc-lista-card">${raw(items)}</div>
    ${raw((()=>{
      // Agrupa las tarjetas por cajita vinculada (tc.cajitaId) — puede haber
      // varios grupos si distintas tarjetas pagan desde cajitas distintas.
      const grupos=new Map();
      tarjetas.forEach(tc=>{
        if(!tc.cajitaId) return;
        const cajita=(S.cajitas||[]).find(c=>c.id===tc.cajitaId);
        if(!cajita) return; // cajita eliminada — se ignora acá, el aviso vive en el detalle de la TC
        if(!grupos.has(cajita.id)) grupos.set(cajita.id,{cajita,tcs:[]});
        grupos.get(cajita.id).tcs.push(tc);
      });
      const bloquesFull=[];
      const lineasOk=[];
      grupos.forEach(({cajita,tcs})=>{
        // Deuda TOTAL (no solo la propia): el banco cobra el 100% del corte sin
        // importar si una parte viene de un encargo/préstamo que te van a pagar
        // después — la cajita necesita cubrir la plata física, no la titularidad.
        const deudaGrupo=tcs.reduce((a,x)=>a+(x.deuda||0),0);
        if(!deudaGrupo) return;
        if(typeof calcC!=='function') return;
        const saldoCajita=calcC(cajita).val;
        const diferencia=saldoCajita-deudaGrupo;
        const alcanza=diferencia>=0;
        const etiqueta=tcs.length>1?'estas tarjetas':'la deuda';
        const nombresTc=tcs.map(x=>x.nombre).join(', ');
        if(alcanza){
          // Cubierta: no necesita atención — una línea chiquita alcanza.
          lineasOk.push(html`<div class="tc-cubre-fila">
            <span class="tc-cubre-txt"><i class="fa-solid fa-check tc-cubre-ico"></i>"${cajita.nombre}" cubre ${etiqueta}${tcs.length>1?html` (${nombresTc})`:''}</span>
            <span class="tc-cubre-monto">${fmt(saldoCajita)}</span>
          </div>`.toString());
          return;
        }
        // No alcanza: esto sí necesita atención — bloque completo con barra.
        const pct=Math.min(100,Math.round(saldoCajita/deudaGrupo*100));
        bloquesFull.push(html`<div class="tc-falta-caja">
          <div class="tc-falta-cab">
            <div class="tc-falta-cap"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12" class="tc-falta-ico"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg> Cajita ${cajita.nombre}</div>
            <div class="tc-falta-monto">${fmt(saldoCajita)}</div>
          </div>
          <div class="tc-falta-barra">
            <div class="tc-falta-fill" style="width:${pct}%;"></div>
          </div>
          <div class="tc-falta-txt">
            Faltan ${fmt(-diferencia)} para cubrir ${etiqueta} (${pct}% cubierto)
          </div>
          ${tcs.length>1?html`<div class="tc-falta-nombres">${nombresTc}</div>`:''}
        </div>`.toString());
      });
      let out=bloquesFull.join('');
      if(lineasOk.length){
        out+=`<div class="tc-ok-caja ${bloquesFull.length?'tc-mt6':'tc-mt10'}">${lineasOk.join('')}</div>`;
      }
      if(!out && tarjetas.some(tc=>(tc.deuda||0)>0)){
        out=html`<div class="tc-vincular">
            <span>Vincula una cajita a tus tarjetas para ver si te alcanza cubrirlas.</span>
            <button type="button" ${raw(Events.attr('tarjetas:verTodo'))} class="tc-btn-vincular">Vincular</button>
          </div>`.toString();
      }
      return out;
    })())}`;
}

// ── Registrar compra en TC ────────────────────────────────────────
export function abrirCompraTC(tcId){
  _tcCompraTcId=tcId;
  const tc=getTCById(tcId);
  if(!tc)return;
  document.getElementById('compra-tc-deuda').textContent=fmt(tc.deuda||0);
  document.getElementById('compra-tc-nombre-header').textContent=tc.nombre;
  document.getElementById('tcc_desc').value='';
  document.getElementById('tcc_monto').value='';
  document.getElementById('tcc_fecha').value=hoy();
  document.getElementById('tcc_nota').value='';
  poblarCatSelect('tcc_cat',getCatsVar());
  openSheet('compra-tc');
  focusSheetField('tcc_desc');
}

export function confirmarCompraTC(){
  const tc=getTCById(_tcCompraTcId);
  if(!tc){toast('Tarjeta no encontrada','err');return;}
  const desc=document.getElementById('tcc_desc').value.trim();
  const monto=parseMoney(document.getElementById('tcc_monto').value)||0;
  if(!desc){toast('Ingresa una descripción','err');return;}
  if(!monto){toast('Ingresa un monto válido','err');return;}
  if(tc.cupo&&tcCupoDisponible(tc)<monto){toast('Cupo insuficiente en '+tc.nombre+' — cupo disponible: '+fmt(tcCupoDisponible(tc)),'err');return;}
  const fecha=document.getElementById('tcc_fecha').value||hoy();
  const cat=document.getElementById('tcc_cat').value;
  const nota=document.getElementById('tcc_nota').value.trim();

  const compra=tcCrearCompra(tc,{desc,cat,fecha,monto,nota});

  if(!S.gastosVar)S.gastosVar=[];
  S.gastosVar.push({
    id:uid(),desc,monto,fecha,cat,
    fuente:'tc:'+tc.id,
    nota:nota||'Compra en '+tc.nombre,
    clase:'gasto',
    _esCompraTC:true,
    _tcId:tc.id,
    _tcCompraId:compra.id
  });

  closeSheet('compra-tc');
  save();refresh();renderTCScreen();
  toast('Compra registrada — deuda: '+fmt(tc.deuda),'ok',3000);
}

// ── Cargo especial (intereses, comisiones, correcciones) ──────────
// Caso especial documentado en tarjetas-credito.md §7: el banco puede
// cobrar intereses/comisiones cuando el cupo ya estaba al tope, y ese
// cargo por definición supera el cupo configurado. No es una compra
// (no fue una decisión de gasto tuya), así que este flujo comparte la
// capa de datos de compras (tcCrearCompra/tcRecalcular/tcEliminarCompraInterna
// — se borra igual que cualquier compra desde el detalle) pero se salta
// a propósito la validación de cupo que sí aplica siempre en
// confirmarCompraTC.
export function abrirCargoEspecialTC(tcId){
  const tc=getTCById(tcId);
  if(!tc)return;
  _tcCargoEspecialId=tcId;
  document.getElementById('tcx-nombre-header').textContent=tc.nombre;
  document.getElementById('tcx-deuda-actual').textContent=fmt(tc.deuda||0);
  document.getElementById('tcx_desc').value='';
  document.getElementById('tcx_monto').value='';
  document.getElementById('tcx_motivo').value='interes';
  document.getElementById('tcx_fecha').value=hoy();
  document.getElementById('tcx_nota').value='';
  openSheet('cargo-especial-tc');
  focusSheetField('tcx_desc');
}

export async function confirmarCargoEspecialTC(){
  const tc=getTCById(_tcCargoEspecialId);
  if(!tc){toast('Tarjeta no encontrada','err');return;}
  const desc=document.getElementById('tcx_desc').value.trim();
  const monto=parseMoney(document.getElementById('tcx_monto').value)||0;
  const motivo=document.getElementById('tcx_motivo').value||'otro';
  const fecha=document.getElementById('tcx_fecha').value||hoy();
  const nota=document.getElementById('tcx_nota').value.trim();
  if(!desc){toast('Ingresa una descripción','err');return;}
  if(!monto){toast('Ingresa un monto válido','err');return;}

  // A propósito SIN validar cupo — ver comentario arriba de la función.
  const disponible=tc.cupo?tcCupoDisponible(tc):null;
  const superaCupo=tc.cupo>0 && monto>disponible;
  const motivoLbl=TC_MOTIVOS_CARGO[motivo]||'Cargo especial';
  const msgConfirm=superaCupo
    ? `${fmt(monto)} de ${motivoLbl.toLowerCase()} supera el cupo disponible de ${escHtml(tc.nombre)} (${fmt(disponible)}). Se registra igual porque es un cargo del banco, no una compra tuya — la deuda va a quedar por encima del cupo configurado. ¿Continuar?`
    : `¿Registrar ${fmt(monto)} de ${motivoLbl.toLowerCase()} en ${escHtml(tc.nombre)}? Sube la deuda directamente, sin validar cupo disponible.`;
  const ok=await dialogo('Registrar cargo especial',msgConfirm,'Registrar',true);
  if(!ok)return;

  const compra=tcCrearCompra(tc,{desc,cat:'Cargo especial',fecha,monto,nota,_esCargoEspecial:true,_motivoCargo:motivo});

  if(!S.gastosVar)S.gastosVar=[];
  S.gastosVar.push({
    id:uid(),desc,monto,fecha,cat:'Cargo especial',
    fuente:'tc:'+tc.id,
    nota:nota||(motivoLbl+' cobrado por el banco en '+tc.nombre),
    clase:'gasto',
    _esCompraTC:true,
    _tcId:tc.id,
    _tcCompraId:compra.id
  });

  closeSheet('cargo-especial-tc');
  save();refresh();renderTCScreen();
  abrirDetalleTCSheet(tc.id);
  toast('Cargo registrado — deuda: '+fmt(tc.deuda),superaCupo?'warn':'ok',3500);
}

// ── Pagar TC ───────────────────────────────────────────────────────
export function abrirPagarTC(tcId){
  _tcActualId=tcId;
  const tc=getTCById(tcId);
  if(!tc)return;
  document.getElementById('pagar-tc-title').textContent='Pagar '+tc.nombre;
  document.getElementById('ptc_monto').value='';
  document.getElementById('ptc_nota').value='';
  document.getElementById('ptc_fecha').value=hoy();
  document.getElementById('ptc-preview').textContent='';

  const deuda=tc.deuda||0;
  document.getElementById('ptc-deuda-total').textContent=fmt(deuda);

  const optsEl=document.getElementById('ptc-opciones-rapidas');
  if(optsEl){
    optsEl.innerHTML=deuda>0?html`<button type="button" ${raw(Events.attr('tarjetas:pagoTotal',deuda))} class="tc-pago-total">
      <div>
        <div class="tc-pago-tit">Pago total</div>
        <div class="tc-pago-sub">${fmt(deuda)} — deja el cupo disponible al máximo</div>
      </div>
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
    </button>`:'';
  }

  const fuentesSel=document.getElementById('ptc_fuente');
  // Pagar una TC se puede con cualquier saldo positivo (se abona lo que sea), salvo efectivo:
  // ahí el mínimo es $1.000 (FuentesFiltro.PRESET.PAGO_TC, js/core/fuentes-filtro.js).
  const fuentes=FuentesFiltro.filtrar(getFuentesSinTC(),FuentesFiltro.PRESET.PAGO_TC);
  fuentesSel.innerHTML=html`<option value="">${fuentes.length?'Seleccionar cuenta':FuentesFiltro.MSG_SIN_SALDO}</option>${raw(fuentes.map(f=>html`<option value="${f.val}">${f.label}</option>`.toString()).join(''))}`;
  document.getElementById('ptc-fuente-saldo').textContent='';

  openSheet('pagar-tc');
  focusSheetField('ptc_monto');
}

export function ptcSetMonto(val){
  const el=document.getElementById('ptc_monto');
  el.value=fmtInput(val);
  el.dispatchEvent(new Event('input',{bubbles:true}));
  ptcActualizarPreview();
}

export function ptcActualizarPreview(){
  const montoEl=document.getElementById('ptc_monto');
  const monto=parseMoney(montoEl.value)||0;
  const fuente=document.getElementById('ptc_fuente').value;
  const prevEl=document.getElementById('ptc-preview');
  const saldoEl=document.getElementById('ptc-fuente-saldo');
  const tc=getTCById(_tcActualId);
  if(!tc){prevEl.textContent='';return;}
  if(fuente){
    const saldo=getSaldoFuente(fuente);
    saldoEl.textContent='Disponible: '+fmt(saldo);
    saldoEl.style.color=Math.round(saldo*100)>=Math.round(monto*100)?'var(--accent)':'var(--red)';
  } else {
    saldoEl.textContent='';
  }
  if(monto>0){
    const nuevaDeuda=Math.max(0,(tc.deuda||0)-monto);
    prevEl.innerHTML='Deuda: '+fmt(tc.deuda)+' <i class="fa-solid fa-arrow-right tc-flecha"></i> '+fmt(nuevaDeuda);
    prevEl.style.color=nuevaDeuda<(tc.deuda||0)?'var(--accent)':'var(--text3)';
  } else {
    prevEl.textContent='';
  }
}

export function confirmarPagarTC(){
  const tc=getTCById(_tcActualId);
  if(!tc){toast('Tarjeta no encontrada','err');return;}
  const montoEl=document.getElementById('ptc_monto');
  const monto=parseMoney(montoEl.value)||0;
  const fuente=document.getElementById('ptc_fuente').value;
  const fecha=document.getElementById('ptc_fecha').value||hoy();
  const nota=document.getElementById('ptc_nota').value.trim();
  if(!monto){toast('Ingresa el monto a pagar','err');return;}
  if(!fuente){toast('Selecciona la cuenta de pago','err');return;}

  const _val=Plata.validarSalida(fuente,monto);
  if(!_val.ok){toast(_val.motivo,'err');return;}

  const pago=tcCrearPago(tc,{monto,fecha,fuente,nota});
  descontarFuente(fuente,monto,_origenLibroTc(pago.id)); // después de crear el pago, para que el libro apunte a su id

  if(!S.gastosVar)S.gastosVar=[];
  S.gastosVar.push({
    id:uid(),
    desc:'Pago tarjeta '+tc.nombre,
    monto,fecha,
    cat:'Servicios',
    fuente,
    nota:nota||'Pago de tarjeta de crédito',
    clase:'neutro',
    _esPagoTC:true,
    _tcId:tc.id,
    _tcPagoId:pago.id
  });

  closeSheet('pagar-tc');
  save();refresh();renderTCScreen();
  if(window.logCambio)logCambio('Pagaste tarjeta '+tc.nombre,'',monto,'abono');
  toast('Pago registrado — deuda restante: '+fmt(tc.deuda),'ok',3000);
}

// ── Detalle de TC (historial: saldo inicial + compras + pagos) ────
const _TC_MESES_CORTOS=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
// '2026-11-08' → '8 nov' (con el año si no es el actual).
function _tcFechaCorta(f){
  const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(f||'');
  if(!m)return f||'';
  const txt=Number(m[3])+' '+_TC_MESES_CORTOS[Number(m[2])-1];
  return m[1]===String(new Date().getFullYear())?txt:txt+' '+m[1];
}
// Una fila del historial. Es la MISMA en PC y en celular: en PC la cuadrícula la muestra como fila de tabla (fecha | descripción | detalle | monto | borrar)
// y en celular como la lista del prototipo (nombre, fecha debajo, etiquetas y monto a la derecha). Todo lo que llega en `sub`, `det`, `acciones` y `attrs`
// ya viene escapado (html``/raw()).
function _tcFila(o){
  return html`<div class="tc-mv${o.clase?' '+o.clase:''}" ${raw(o.attrs||'')}>
    <span class="tc-mv-fecha">${_tcFechaCorta(o.fecha)}</span>
    <div class="tc-mv-desc"><div class="tc-mv-nombre">${o.nombre}</div>${o.sub?html`<div class="tc-mv-sub">${o.sub}</div>`:''}</div>
    <div class="tc-mv-det">${o.det||''}</div>
    <span class="tc-mv-monto ${o.montoClase||''}">${o.monto}</span>
    <span class="tc-mv-borrar">${o.acciones||''}</span>
  </div>`;
}
// Abre el detalle de la tarjeta: en PC lo pinta en el panel de la derecha; en celular, en la pantalla de detalle (con «Volver»).
export function abrirDetalleTCSheet(tcId){
  const tc=getTCById(tcId);
  if(!tc)return;
  _tcSelId=tc.id;
  const pantalla=document.getElementById('screen-tarjetas');
  if(!pantalla)return;
  if(!pantalla.classList.contains('active'))showScreen('tarjetas');
  const compras=(tc.compras||[]).filter(c=>!c.eliminado);
  const pagos=(tc.pagos||[]).filter(p=>!p.eliminado);
  const tcMovimientos=(S.tcMovimientos||[]).filter(m=>m.tcId===tc.id&&!m.eliminado);
  const mesClave=mesActual();

  let contenido='';

  const deuda=tc.deuda||0;
  const comprasMes=compras.filter(c=>mesKey(c.fecha)===mesClave);
  const tcMovimientosMes=tcMovimientos.filter(m=>mesKey(m.fecha)===mesClave);
  const totalMes=comprasMes.reduce((a,c)=>a+(c.monto||0),0)+tcMovimientosMes.reduce((a,m)=>a+(m.monto||0),0);
  const totalItems=comprasMes.length+tcMovimientosMes.length;
  contenido+=`<div class="tc-det-grid">
    <div class="tc-det-caja-deuda">
      <div class="tc-det-cap">Deuda actual</div>
      <div class="tc-val-rojo">${fmt(deuda)}</div>
    </div>
    <div class="tc-det-caja">
      <div class="tc-det-cap">Este mes <span class="tc-det-n">(${totalItems})</span></div>
      <div class="tc-det-val">${fmt(totalMes)}</div>
    </div>
  </div>`;

  // ── Widget de cobertura: ¿la cajita vinculada te alcanza para pagar? ──
  // Si tc.cajitaId apunta a una cajita que ya no existe (la borraron), el
  // find() no encuentra nada y simplemente no se muestra el widget — no rompe.
  const cajitaVinc = tc.cajitaId ? (S.cajitas||[]).find(c=>c.id===tc.cajitaId) : null;
  if(cajitaVinc && typeof calcC==='function'){
    // Otras tarjetas que comparten la misma cajita también cuentan para la cobertura.
    // Deuda TOTAL (no solo la propia): el banco cobra el 100% del corte sin importar
    // si una parte viene de un encargo/préstamo — la cajita necesita cubrir la plata
    // física, no la titularidad (la separación propia/ajena solo aplica al patrimonio).
    const tarjetasEnCajita=(S.tarjetasCredito||[]).filter(x=>x.cajitaId===cajitaVinc.id);
    const deudaGrupoTotal=tarjetasEnCajita.reduce((a,x)=>a+(x.deuda||0),0);
    const saldoCajita=calcC(cajitaVinc).val;
    const pct=deudaGrupoTotal>0?Math.min(100,Math.round(saldoCajita/deudaGrupoTotal*100)):100;
    const cubre=saldoCajita>=deudaGrupoTotal;
    const colorEstado=cubre?'tc-c-accent':(pct>=50?'tc-c-amber':'tc-c-red');
    const fondoEstado=cubre?'tc-bg-accent':(pct>=50?'tc-bg-amber':'tc-bg-red');
    const otrasNombres=tarjetasEnCajita.filter(x=>x.id!==tc.id).map(x=>x.nombre);
    contenido+=html`<div class="tc-cob-caja">
      <div class="tc-cob-cab">
        <div class="tc-cob-tit">Cobertura desde «${cajitaVinc.nombre}»</div>
        <span class="tc-cob-pct ${colorEstado}">${cubre?'Cubre todo':pct+'%'}</span>
      </div>
      <div class="tc-cob-barra"><div class="tc-fill ${fondoEstado}" style="width:${pct}%;"></div></div>
      <div class="tc-cob-txt">Saldo en la cajita: <b>${fmt(saldoCajita)}</b> · Deuda a cubrir: <b>${fmt(deudaGrupoTotal)}</b></div>
      ${otrasNombres.length?html`<div class="tc-falta-nombres">Compartida con: ${otrasNombres.join(', ')}.</div>`:''}
    </div>`;
  } else if(tc.cajitaId && !cajitaVinc){
    // Tenía una cajita vinculada pero ya no existe (fue eliminada). Si
    // cajitaVinc sí existe pero calcC no cargó todavía (cuentas.js), el
    // widget simplemente no se muestra esta vez — no es lo mismo que
    // "se eliminó", así que no cae acá.
    contenido+=`<div class="tc-aviso">
      La cajita que tenías vinculada para pagar esta tarjeta ya no existe. Puedes vincular una nueva desde "Editar tarjeta".
    </div>`;
  }

  const itemsLinea=[
    ...(tc.saldoInicial&&!tc.saldoInicial.eliminado?[{_tipo:'saldo_inicial',...tc.saldoInicial}]:[]),
    ...compras.map(c=>({_tipo:'compra',...c})),
    ...tcMovimientos.map(m=>({_tipo:'tcmov',...m})),
    ...pagos.map(p=>({_tipo:'pago',...p}))
  ];

  itemsLinea.sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||''));

  // Precalcular deuda histórica (antes/después) para cada item.
  const _tcDeudaPorId=new Map();
  {
    let _deudaCorriente=tc.deuda||0;
    itemsLinea.forEach(it=>{
      const efecto=it._tipo==='pago'?-(it.monto||0):+(it.monto||0);
      const despues=_deudaCorriente;
      const antes=_deudaCorriente-efecto;
      if(it.id)_tcDeudaPorId.set(it.id,{antes,despues,efecto});
      _deudaCorriente=antes;
    });
  }

  contenido+=html`<button type="button" ${raw(Events.attr('tarjetas:cargoEspecial',tc.id))} class="tc-btn-cargo">+ Cargo especial (interés, comisión…) <span class="tc-btn-cargo-nota">— no valida cupo</span></button>`;

  let filas='';
  if(!itemsLinea.length){
    filas=emptyInline('Sin movimientos registrados.',{clase:'empty-inline-sep'});
  } else {
    // Arma los data-mov-* de cada fila (los usa el sheet de detalle de
    // movimiento al hacer click) — es HTML de confianza ya escapado acá
    // adentro con html``, se interpola con raw() en cada fila.
    const _tcAttrs=(item,origenLbl,otrasCuentas,descOverride)=>{
      const sd=_tcDeudaPorId.get(item.id);
      if(!sd) return '';
      const otras=otrasCuentas?html`data-movimiento-otras="${JSON.stringify(otrasCuentas)}"`.toString():'';
      return html`data-movimiento-id="${item.id}" data-movimiento-tipo="${item._tipo==='pago'?'abono':'compra'}" data-movimiento-monto="${Math.abs(item.monto)}" data-cuenta-key="tc" data-movimiento-origen="${origenLbl}" ${raw(otras)} data-movimiento-saldo-antes="${sd.antes}" data-movimiento-saldo-despues="${sd.despues}" data-movimiento-saldo-label="Deuda ${tc.nombre}" data-movimiento-desc="${descOverride||item.desc||''}" data-movimiento-fecha="${item.fecha}" data-action="tarjetas:verMovimiento"`.toString();
    };
    const _nota=txt=>txt?html`<span class="tc-mv-nota">${txt}</span>`:'';
    filas=itemsLinea.slice(0,80).map(item=>{
      if(item._tipo==='saldo_inicial'){
        return _tcFila({
          attrs: _tcAttrs(item,'Tarjeta de crédito',null,'Saldo inicial'),
          fecha: item.fecha,
          nombre: 'Saldo inicial',
          sub: html`<span class="tc-tag">Deuda antes de usar la app</span>`,
          monto: fmt(item.monto),
          montoClase: 'tc-amount-text2'
        });
      }
      if(item._tipo==='compra'){
        const c=item;
        const esFavor=c._esFavor||c._desdePlataComprometida;
        const esCargoEspecial=!!c._esCargoEspecial;
        const _origenC=esCargoEspecial?'Cargo especial del banco':(c._desdePlataComprometida?'Plata comprometida':'Tarjeta de crédito');
        const badgeLabel=esCargoEspecial?('Cargo especial · '+(TC_MOTIVOS_CARGO[c._motivoCargo]||'Otro')):(esFavor?'Favor cubierto':(c.cat||'Sin cat.'));
        const badgeClase=esCargoEspecial?'tc-tag-amber':(esFavor?'tc-tag-azul':'');
        return _tcFila({
          attrs: _tcAttrs(c,_origenC,null),
          fecha: c.fecha,
          nombre: c.desc,
          sub: _nota(c.nota),
          det: html`<span class="tc-tag ${badgeClase}">${badgeLabel}</span>`,
          monto: fmt(c.monto),
          montoClase: esCargoEspecial?'tc-c-amber':(esFavor?'tc-c-blue':'tc-c-red'),
          acciones: botonEliminarFila('tarjetas:eliminarCompra', [tc.id, c.id])
        });
      }
      if(item._tipo==='tcmov'){
        const m=item;
        const esEncargo=m.tipo==='cargo_encargo';
        const esDeuda=m.tipo==='cargo_deuda';
        const claseMonto=esEncargo?'tc-c-amber':(esDeuda?'tc-c-red':'tc-c-purple');
        const claseTag=esEncargo?'tc-tag-amber':(esDeuda?'tc-tag-rojo':'tc-tag-morado');
        const labelBadge=esEncargo?'Encargo':(esDeuda?'Pago de deuda':'Préstamo');
        const iconoBadge=esEncargo
          ? `<i class="fa-solid fa-box tc-favor-ico"></i>`
          : (esDeuda
            ? `<i class="fa-solid fa-arrow-down tc-favor-ico"></i>`
            : `<i class="fa-solid fa-hand-holding-dollar tc-favor-ico"></i>`);
        const _origenM=esEncargo?'Encargos':(esDeuda
          ?('Préstamos · Yo debo · '+Personas.nombre((Deudas.porId('contra',m.miDeudaId)||{}).personaId))
          :('Préstamos · '+Personas.nombre((Deudas.porId('favor',m.deudorId)||{}).personaId)));
        return _tcFila({
          attrs: _tcAttrs(m,_origenM,null),
          fecha: m.fecha,
          nombre: m.desc,
          sub: _nota(m.nota),
          det: html`<span class="tc-tag ${claseTag}">${raw(iconoBadge)}${labelBadge}</span>`,
          monto: fmt(m.monto),
          montoClase: claseMonto
        });
      }
      const p=item;
      const otrasPago=p.fuente?[{fuente:p.fuente,monto:-p.monto}]:null;
      return _tcFila({
        attrs: _tcAttrs(p,'Tarjeta de crédito',otrasPago,'Abono a tu deuda'),
        fecha: p.fecha,
        nombre: 'Abono a tu deuda',
        sub: html`<span class="tc-tag tc-tag-verde"><i class="fa-solid fa-arrow-down tc-favor-ico"></i>Reduce deuda</span>${_nota(p.nota)}`,
        det: html`<span class="badge ${fuenteBadgeClass(p.fuente)} badge-xs">Desde ${fuenteLabel(p.fuente)}</span>`,
        monto: `−${fmt(p.monto)}`,
        montoClase: 'c-green',
        acciones: botonEliminarFila('tarjetas:eliminarPago', [tc.id, p.id])
      });
    }).join('');
  }
  contenido+=`<div class="tc-movs">
    <div class="tc-mov-tit">Movimientos <span class="tc-mov-n">(${itemsLinea.length})</span></div>
    ${itemsLinea.length?'<div class="tc-mv tc-mv-cab"><span>Fecha</span><span>Descripción</span><span>Detalle</span><span class="tc-mv-cab-monto">Monto</span><span></span></div>':''}
    ${filas}
  </div>`;

  document.getElementById('tc-detalle-titulo').textContent='Compras y pagos · '+tc.nombre;
  document.getElementById('tc-detalle-nombre').textContent=tc.nombre;
  document.getElementById('tc-detalle-content').innerHTML=contenido;
  // Celular: el detalle es una pantalla propia; al abrirlo se empieza desde arriba (al repintar con el detalle ya abierto, no se salta).
  if(!_consultaPcTC||!_consultaPcTC.matches){
    if(pantalla.dataset.detalleAbierto!=='si'){
      pantalla.dataset.detalleAbierto='si';
      const scroll=document.getElementById('scrollArea');
      if(scroll)scroll.scrollTop=0;
    }
  }
  _tcMarcarActiva();
}

export async function eliminarCompraTC(tcId,compraId){
  const tc=getTCById(tcId);
  if(!tc)return;
  const compra=(tc.compras||[]).find(c=>c.id===compraId&&!c.eliminado);
  if(!compra)return;

  // Protección por antigüedad — ver docs/proteccion-antiguedad-movimientos.md.
  const operacionesPosteriores=_tcOperacionesPosteriores(tc,compra.fecha,compraId);
  const nivel=nivelAntiguedadMovimiento(compra.fecha,operacionesPosteriores,'tarjetas');
  if(nivel==='bloqueado'){
    await avisarMovimientoBloqueado();
    return;
  }
  const ok=nivel==='viejo'
    ? await confirmarBorrarMovimientoViejo(tc.nombre,compra.monto||0,'baja','deuda')
    : await confirmarEliminar({titulo:'Eliminar compra',objeto:'esta compra de '+fmt(compra.monto),detalle:'Se reducirá la deuda de la tarjeta.',irreversible:false});
  if(!ok)return;
  const _historialAntes=medirPatrimonioParaHistorial(); // el historial de patrimonio deja de contar esta compra
  tcEliminarCompraInterna(tc,compraId);
  if(S.gastosVar)S.gastosVar=S.gastosVar.filter(g=>!(g._esCompraTC&&g._tcCompraId===compraId));
  purgarEfectoEnHistorial(_historialAntes,compra);
  save();refresh();renderTCScreen();
  abrirDetalleTCSheet(tcId);
  toast('Compra eliminada — deuda actualizada','ok');
}

export async function eliminarPagoTC(tcId,pagoId){
  const tc=getTCById(tcId);
  if(!tc)return;
  const pago=(tc.pagos||[]).find(p=>p.id===pagoId&&!p.eliminado);
  if(!pago)return;

  // Protección por antigüedad — ver docs/proteccion-antiguedad-movimientos.md.
  const operacionesPosteriores=_tcOperacionesPosteriores(tc,pago.fecha,pagoId);
  const nivel=nivelAntiguedadMovimiento(pago.fecha,operacionesPosteriores,'tarjetas');
  if(nivel==='bloqueado'){
    await avisarMovimientoBloqueado();
    return;
  }
  const ok=nivel==='viejo'
    ? await confirmarBorrarMovimientoViejo(tc.nombre,pago.monto||0,'sube','deuda')
    : await confirmarEliminar({titulo:'Eliminar pago',objeto:'este pago de '+fmt(pago.monto),detalle:'Se devolverá el dinero a '+fuenteLabel(pago.fuente)+' y aumentará la deuda de la tarjeta.',irreversible:false});
  if(!ok)return;
  const _historialAntes=medirPatrimonioParaHistorial(); // el historial de patrimonio deja de contar este pago
  tcEliminarPagoInterna(tc,pagoId);
  if(pago.fuente) sumarFuente(pago.fuente,pago.monto,_origenLibroTc(pagoId,true));
  if(S.gastosVar)S.gastosVar=S.gastosVar.filter(g=>!(g._esPagoTC&&g._tcPagoId===pagoId));
  purgarEfectoEnHistorial(_historialAntes,pago);
  save();refresh();renderTCScreen();
  abrirDetalleTCSheet(tcId);
  toast('Pago eliminado — deuda actualizada','ok');
}

// ── Registro de acciones (reemplaza los onclick inline) ───────────
Events.registerAll('tarjetas', {
  nueva:            abrirNuevaTarjeta,
  editar:           abrirEditarTC,
  eliminar:         eliminarTC,
  compra:           abrirCompraTC,
  cargoEspecial:    abrirCargoEspecialTC,
  pagar:            abrirPagarTC,
  verDetalle:       abrirDetalleTCSheet,
  cerrarDetalle:    _tcCerrarDetalle,
  pagoTotal:        ptcSetMonto,
  eliminarCompra:   eliminarCompraTC,
  eliminarPago:     eliminarPagoTC,
  seleccionarColor: tcSelColor,          // usada por los 8 círculos de color estáticos en #sheet-nueva-tc
  verMovimiento:           (...args) => abrirDetalleMovimiento(...args), // función compartida (js/core/movimientos.js), envuelta por el mismo motivo que en prestado.js: se define más abajo (en movimientos.js, que carga DESPUÉS de este archivo), así que pasarla directo la capturaría como undefined al cargar. Envuelta así, la búsqueda del nombre global ocurre recién al hacer click.
  verTodo:          () => { closeMas(); showScreen('tarjetas'); } // antes navTo('tarjetas') — ver changelog/infraestructura-seguridad.md (2026-09-10, retiro de nav.js)
});
// ── Conectar botones TC al formulario y selects ───────────────────
// Nota: antes esto esperaba 'DOMContentLoaded'. Si este
// módulo se vuelve lazy (carga bajo demanda, ver js/core/lazy-loader.js),
// para cuando el archivo llega a existir ese evento ya disparó hace rato
// y el listener nunca correría — mismo bug ya encontrado y corregido en
// actividad-reciente.js (auditoria-tecnica.md #4, grupo "historial"). Se
// wirea directo, top-level, contra ids que ya existen en el DOM estático
// de index.html — mismo patrón ya probado en mesada.js.
export const btnGuardarTC=document.getElementById('btn-guardar-tc');
if(btnGuardarTC)btnGuardarTC.addEventListener('click',guardarTC);

export const btnCompraTC=document.getElementById('btn-confirmar-compra-tc-tarjetas');
if(btnCompraTC)btnCompraTC.addEventListener('click',confirmarCompraTC);

export const btnCargoEspecialTC=document.getElementById('btn-confirmar-cargo-especial-tc');
if(btnCargoEspecialTC)btnCargoEspecialTC.addEventListener('click',confirmarCargoEspecialTC);

export const btnPagarTC=document.getElementById('btn-confirmar-pagar-tc');
if(btnPagarTC)btnPagarTC.addEventListener('click',confirmarPagarTC);

export const ptcFuente=document.getElementById('ptc_fuente');
if(ptcFuente)ptcFuente.addEventListener('change',ptcActualizarPreview);
export const ptcMonto=document.getElementById('ptc_monto');
if(ptcMonto)ptcMonto.addEventListener('input',ptcActualizarPreview);

// Mostrar el label TC en el gasto variable al seleccionarlo: mostrarAlertaFuente() (navegacion.js) pregunta al evento
// 'fuente-alerta' (js/core/ui.js) y, si un gancho devuelve true, no pinta su aviso normal.
Ui.en('fuente-alerta', function(prefix){
  const sel=document.getElementById(prefix+'_fuente')||document.getElementById(prefix+'fuente');
  if(!sel)return false;
  const val=sel.value;
  if(!(val&&Fuente.esTC(val)))return false;
  const id=val.split(':')[1];
  const tc=getTCById(id);
  const hint=document.getElementById(prefix+'_fuente_hint')||document.getElementById(prefix+'fuente_hint');
  const saldoEl=document.getElementById(prefix+'_fuente_saldo')||document.getElementById(prefix+'fuente_saldo');
  if(hint)hint.style.visibility='visible';
  if(tc&&hint)hint.textContent='El gasto se cargará a la TC — no sale plata de tus cuentas';
  if(tc&&hint)hint.style.color='var(--red)';
  if(saldoEl)saldoEl.textContent='Deuda actual en TC: '+fmt(tc?tc.deuda||0:0);
  if(saldoEl)saldoEl.style.color='var(--red)';
  return true;
},{key:'tarjetas-alerta-fuente'});


// Sin esta rama, la primera vez que el grupo lazy termina de cargar la pantalla quedaba visible pero vacía.
Ui.pantalla('tarjetas', () => { if (typeof renderTCScreen === 'function') renderTCScreen(); }, { key: 'tarjetas-render' });

// Puente global (js/core/puente.js): constantes y clases ya inicializadas, y variables que otros archivos leen por nombre.
exponerGlobales({ TC_ESTADOS, TC_MOTIVOS_CARGO, _origenLibroTc, _consultaPcTC, btnGuardarTC, btnCompraTC, btnCargoEspecialTC, btnPagarTC, ptcFuente, ptcMonto });
