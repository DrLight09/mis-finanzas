/* ═══════════════════════════════════════════════════════════════
   js/modules/tarjetas_credito.js

   Módulo "Tarjetas de Crédito", extraído de index.html.

   Migrado siguiendo el mismo patrón que Spotify, Mesada y Encargos:
   - Los `onclick="..."` inline se reemplazaron por `data-action` +
     `Events.on(...)` (ver js/core/events.js). Los botones de la UI
     invocan las acciones a través del despachador centralizado en
     vez de handlers propios.
   - El HTML de las pantallas/sheets (#screen-tarjetas,
     #sheet-nueva-tc, #sheet-compra-tc, #sheet-pagar-tc,
     #sheet-detalle-tc, #tc-deuda-card) se quedó en index.html; solo
     se movió el JS.
   - A diferencia de Spotify y Encargos, este módulo NO necesitó
     partirse en dos archivos: no tiene una dependencia de
     integración con Personas ni con nada definido más abajo en el
     documento. El "Feed de actividad financiera" lee S.tarjetasCredito
     y S.tcMovimientos directamente (no llama funciones de este
     módulo), así que no genera una dependencia de orden de carga.

   Qué NO se movió acá aunque compartía el mismo <script> original:
   - `navTo(screen)` — función de navegación global de toda la app
     (usada por las 13 pantallas, no solo por Tarjetas). Se quedó en
     index.html. Este módulo la sigue llamando vía
     `Events.on('tarjetas:verTodo', () => navTo('tarjetas'))`.
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
   patrón (`f.label` sin escapar) existe en `buildFuentesOptsHtml()`,
   función núcleo compartida por TODA la app (no solo por Tarjetas de
   Crédito) — no se tocó acá por el mismo criterio que ya aplicó la
   auditoría a `toast()`: cambiar una función compartida en medio de
   una migración de un solo módulo puede afectar pantallas fuera de
   este alcance. Queda como hallazgo pendiente para una sesión propia.
   ═══════════════════════════════════════════════════════════════ */

let _tcActualId = null;
let _tcCompraTcId = null;
let _tcEditId = null;
let _tcColorSel = null;

const TC_ESTADOS = {
  activa:    {label:'Activa',    badge:null},
  bloqueada: {label:'Bloqueada', badge:'bg-amber'},
  cancelada: {label:'Cancelada', badge:'bg-red'},
  vencida:   {label:'Vencida',   badge:'bg-red'}
};

// ── Helpers básicos ─────────────────────────────────────────────
function getTCById(id){ return (S.tarjetasCredito||[]).find(x=>x.id===id); }

function tcDeudaTotal(){
  return (S.tarjetasCredito||[]).reduce((a,tc)=>a+(tc.deuda||0),0);
}

function tcCupoUsadoPct(tc){
  const cupo=tc.cupo||0;
  if(!cupo) return 0;
  return Math.min(100,((tc.deuda||0)/cupo)*100);
}

function tcCupoDisponible(tc){
  return Math.max(0,(tc.cupo||0)-(tc.deuda||0));
}

function tcEstadoInfo(estado){
  return TC_ESTADOS[estado]||TC_ESTADOS.activa;
}

// ── Cuotas ───────────────────────────────────────────────────────
// Valor de cuota por defecto: total ÷ número de cuotas, redondeado.
function tcCalcularValorCuota(valorTotal,numCuotas){
  if(!numCuotas||numCuotas<1) return valorTotal||0;
  return Math.round((valorTotal||0)/numCuotas);
}
// La última cuota absorbe el residuo del redondeo, de forma que la
// suma de todas las cuotas sea EXACTAMENTE igual al valor total.
function tcValorUltimaCuota(valorTotal,valorCuota,numCuotas){
  if(!numCuotas||numCuotas<1) return valorTotal||0;
  if(numCuotas===1) return valorTotal||0;
  return (valorTotal||0)-(valorCuota||0)*(numCuotas-1);
}

// ── Regla de consistencia: recalcular la deuda desde los movimientos ──
// tc.deuda hace de cupoUtilizado Y de deudaActual a la vez (por eso
// esa igualdad nunca se puede romper). Esta función la reconstruye
// sumando el saldo inicial, las compras no eliminadas y los cargos
// externos (encargos/préstamos pagados con esta TC), y restando los
// pagos no eliminados. Nunca deja valores negativos.
function tcRecalcular(tc){
  if(!tc) return 0;
  let total=0;
  if(tc.saldoInicial && !tc.saldoInicial.eliminado) total+=(tc.saldoInicial.monto||0);
  (tc.compras||[]).forEach(c=>{ if(!c.eliminado) total+=(c.monto||0); });
  (S.tcMovimientos||[]).forEach(m=>{
    if(m.tcId===tc.id && (m.tipo==='cargo_encargo'||m.tipo==='cargo_prestamo') && !m.eliminado) total+=(m.monto||0);
  });
  (tc.pagos||[]).forEach(p=>{ if(!p.eliminado) total-=(p.monto||0); });
  tc.deuda=Math.max(0,total);
  return tc.deuda;
}

// ── Migración y auto-sanación ────────────────────────────────────
// Se ejecuta en cada refresh(). Es idempotente (se puede llamar todas
// las veces que haga falta sin generar duplicados ni efectos raros):
//   · agrega los campos nuevos (banco, franquicia, color, estado,
//     eliminado, cuotasPagadas...) con valores por defecto a las
//     tarjetas creadas antes de este refactor;
//   · infiere un movimiento de "Saldo inicial" para que el historial
//     cuadre exactamente con la deuda que ya existía;
//   · limpia avisos de corte, que ya no existen en este modelo;
//   · recalcula la deuda de cada tarjeta desde sus movimientos.
function tcNormalizarTarjetas(){
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
      if(typeof c.cuotasPagadas!=='number') c.cuotasPagadas=0;
      if(typeof c.esCuotas!=='boolean') c.esCuotas=!!c.numCuotas;
    });
    tc.pagos.forEach(p=>{ if(typeof p.eliminado!=='boolean') p.eliminado=false; });
    // "undefined" = tarjeta de antes del refactor, nunca tocada → inferir.
    // "null" = ya se decidió (en creación) que no había deuda previa.
    if(tc.saldoInicial===undefined){
      const sumCompras=tc.compras.filter(c=>!c.eliminado).reduce((a,c)=>a+(c.monto||0),0);
      const sumPagos=tc.pagos.filter(p=>!p.eliminado).reduce((a,p)=>a+(p.monto||0),0);
      const sumCargos=(S.tcMovimientos||[]).filter(m=>m.tcId===tc.id&&(m.tipo==='cargo_encargo'||m.tipo==='cargo_prestamo')&&!m.eliminado).reduce((a,m)=>a+(m.monto||0),0);
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
function tcCrearCompra(tc,datos){
  if(!Array.isArray(tc.compras)) tc.compras=[];
  const numCuotas=datos.esCuotas?Math.max(2,parseInt(datos.numCuotas,10)||2):null;
  const valorCuota=datos.esCuotas?(datos.valorCuota||tcCalcularValorCuota(datos.monto,numCuotas)):null;
  const compra={
    id:uid(),
    desc:datos.desc||'',
    cat:datos.cat||'',
    fecha:datos.fecha||hoy(),
    monto:datos.monto||0,
    nota:datos.nota||'',
    eliminado:false,
    esCuotas:!!datos.esCuotas,
    numCuotas,
    valorCuota,
    cuotasPagadas:0
  };
  if(datos._esFavor) compra._esFavor=true;
  if(datos._desdeCP) compra._desdeCP=true;
  tc.compras.push(compra);
  tcRecalcular(tc);
  return compra;
}

// Marca una compra como eliminada (nunca se borra físicamente del
// array), recalcula la deuda y devuelve la compra para que quien
// llama limpie lo que corresponda (p.ej. el gasto variable espejo).
function tcEliminarCompraInterna(tc,compraId){
  const compra=(tc.compras||[]).find(c=>c.id===compraId&&!c.eliminado);
  if(!compra) return null;
  compra.eliminado=true;
  tcRecalcular(tc);
  return compra;
}

// Busca una compra por id; si no la encuentra (registros de antes de
// este refactor no siempre tenían un id enlazado del lado del gasto),
// cae de vuelta a un match por descripción+monto sin eliminar.
function tcBuscarCompraPorIdOMatch(tc,compraId,desc,monto){
  if(compraId){
    const porId=(tc.compras||[]).find(c=>c.id===compraId&&!c.eliminado);
    if(porId) return porId;
  }
  return (tc.compras||[]).find(c=>!c.eliminado&&c.desc===desc&&Math.abs((c.monto||0)-(monto||0))<1);
}

function tcIncrementarCuotaPagada(tcId,compraId,delta){
  const tc=getTCById(tcId); if(!tc) return;
  const compra=(tc.compras||[]).find(c=>c.id===compraId);
  if(!compra||!compra.esCuotas) return;
  compra.cuotasPagadas=Math.max(0,Math.min(compra.numCuotas||0,(compra.cuotasPagadas||0)+delta));
  save();
  abrirDetalleTCSheet(tcId);
}

// ── Pagos: capa de datos ──────────────────────────────────────────
function tcCrearPago(tc,datos){
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

function tcEliminarPagoInterna(tc,pagoId){
  const pago=(tc.pagos||[]).find(p=>p.id===pagoId&&!p.eliminado);
  if(!pago) return null;
  pago.eliminado=true;
  tcRecalcular(tc);
  return pago;
}

// ── Nueva / editar tarjeta ────────────────────────────────────────
// Repuebla el <select> de cajita vinculada cada vez que se abre el form,
// por si el usuario creó/eliminó cajitas desde la última vez.
function _tcPoblarSelectCajita(selectedId){
  const sel=document.getElementById('tc_cajita_vinculada');
  if(!sel)return;
  const opciones=(S.cajitas||[]).map(c=>`<option value="${c.id}">${escHtml(c.nombre)}</option>`).join('');
  sel.innerHTML=`<option value="">Ninguna</option>${opciones}`;
  // Si la cajita guardada ya no existe (fue eliminada), selectedId no matchea
  // ninguna <option> y el select cae solo en "Ninguna" — no rompe nada.
  sel.value=selectedId||'';
}

function abrirNuevaTarjeta(){
  _tcEditId=null;
  document.getElementById('tc-form-title').textContent='Nueva tarjeta de crédito';
  document.getElementById('tc_nombre').value='';
  document.getElementById('tc_banco').value='';
  document.getElementById('tc_franquicia').value='Visa';
  document.getElementById('tc_cupo').value='';
  document.getElementById('tc_deuda_ini').value='';
  document.getElementById('tc-deuda-ini-grupo').style.display='';
  document.getElementById('tc-estado-grupo').style.display='none';
  _tcPoblarSelectCajita(null);
  tcSelColor(null);
  document.getElementById('btn-guardar-tc').textContent='Guardar tarjeta';
  openSheet('nueva-tc');
  setTimeout(()=>document.getElementById('tc_nombre').focus(),200);
}

function abrirEditarTC(id){
  const tc=getTCById(id);
  if(!tc)return;
  _tcEditId=id;
  document.getElementById('tc-form-title').textContent='Editar tarjeta';
  document.getElementById('tc_nombre').value=tc.nombre||'';
  document.getElementById('tc_banco').value=tc.banco||'';
  document.getElementById('tc_franquicia').value=tc.franquicia||'Visa';
  document.getElementById('tc_cupo').value=tc.cupo?fmtInput(tc.cupo):'';
  document.getElementById('tc-deuda-ini-grupo').style.display='none';
  document.getElementById('tc_estado').value=tc.estado||'activa';
  document.getElementById('tc-estado-grupo').style.display='';
  _tcPoblarSelectCajita(tc.cajitaId||null);
  tcSelColor(tc.color||null);
  document.getElementById('btn-guardar-tc').textContent='Guardar cambios';
  openSheet('nueva-tc');
}

function tcSelColor(color){
  _tcColorSel=color;
  document.querySelectorAll('.tc-color-opt').forEach(el=>{
    el.style.border=(color&&el.dataset.color===color)?'2px solid var(--accent)':'2px solid transparent';
  });
}

function guardarTC(){
  const nombre=document.getElementById('tc_nombre').value.trim();
  if(!nombre){toast('Ingresa el nombre de la tarjeta','err');return;}
  const banco=document.getElementById('tc_banco').value.trim();
  const franquicia=document.getElementById('tc_franquicia').value;
  const cupo=parseMoney(document.getElementById('tc_cupo').value)||0;
  const cajitaSel=document.getElementById('tc_cajita_vinculada');
  const cajitaId=cajitaSel&&cajitaSel.value?cajitaSel.value:null;
  if(!S.tarjetasCredito)S.tarjetasCredito=[];
  if(_tcEditId){
    const tc=getTCById(_tcEditId);
    if(tc){
      tc.nombre=nombre;
      tc.banco=banco;
      tc.franquicia=franquicia;
      tc.cupo=cupo;
      tc.color=_tcColorSel;
      tc.cajitaId=cajitaId;
      const estadoSel=document.getElementById('tc_estado');
      if(estadoSel&&TC_ESTADOS[estadoSel.value]) tc.estado=estadoSel.value;
      tcRecalcular(tc);
    }
    toast('Tarjeta actualizada','ok');
  } else {
    const deudaIni=parseMoney(document.getElementById('tc_deuda_ini').value)||0;
    const nuevo={
      id:uid(),nombre,banco,franquicia,color:_tcColorSel,
      cupo,deuda:0,estado:'activa',cajitaId,
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

async function eliminarTC(id){
  const tc=getTCById(id);
  if(!tc)return;
  const tieneVinculos=(S.tcMovimientos||[]).some(m=>m.tcId===id);
  const msg='¿Eliminar "'+tc.nombre+'" y todo su historial? Esta acción no se puede deshacer.'
    +(tieneVinculos?' Hay encargos o préstamos que se pagaron con esta tarjeta y perderán esa referencia.':'');
  const ok=await dialogo('Eliminar tarjeta',msg,'Eliminar',true);
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
function renderTCScreen(){
  const tarjetas=S.tarjetasCredito||[];
  const hero=document.getElementById('tc-hero-deuda');
  const heroCupo=document.getElementById('tc-hero-cupo');
  const lista=document.getElementById('tc-lista');
  if(!hero||!lista)return;
  const deudaTotal=tcDeudaTotal();
  const cupoTotal=tarjetas.reduce((a,tc)=>a+(tc.cupo||0),0);
  hero.textContent=fmt(deudaTotal);
  if(heroCupo)heroCupo.textContent=cupoTotal?'Cupo total: '+fmt(cupoTotal):'';

  if(!tarjetas.length){
    lista.innerHTML=`<div class="empty-state">
      <div class="empty-state-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="1.6" stroke-linecap="round"><rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 10h20"/><circle cx="7" cy="15" r="1.2" fill="var(--red)" stroke="none"/></svg></div>
      <div class="empty-state-title">Sin tarjetas de crédito</div>
      <div class="empty-state-sub">Agrega tu primera tarjeta para registrar compras y controlar tu cupo.</div>
      <button type="button" class="empty-state-btn" ${Events.attr('tarjetas:nueva')}>Agregar tarjeta</button>
    </div>`;
    return;
  }

  lista.innerHTML=tarjetas.map(tc=>{
    const deuda=tc.deuda||0;
    const cupo=tc.cupo||0;
    const disponible=tcCupoDisponible(tc);
    const pct=tcCupoUsadoPct(tc);
    const estadoInfo=tcEstadoInfo(tc.estado);
    const activa=(tc.estado||'activa')==='activa';
    const subtitulo=[tc.banco,tc.franquicia].filter(Boolean).join(' · ');
    const colorIcono=tc.color||'currentColor';

    return `<div class="card" style="margin-bottom:10px;border-color:${deuda>0?'rgba(240,104,104,.3)':'var(--border)'};">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px;">
        <div style="flex:1;min-width:0;">
          <div style="font-size:15px;font-weight:700;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${colorIcono}" stroke-width="2" stroke-linecap="round" style="display:inline-block;vertical-align:middle;margin-right:2px;flex-shrink:0;"><rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 10h20"/><circle cx="7" cy="15" r="1.2" fill="${colorIcono}" stroke="none"/></svg>${escHtml(tc.nombre)}
            ${estadoInfo.badge?`<span class="badge ${estadoInfo.badge}" style="font-size:9px;">${estadoInfo.label}</span>`:''}
          </div>
          ${subtitulo?`<div style="font-size:11px;color:var(--text3);margin-top:3px;">${subtitulo}</div>`:''}
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          <button type="button" ${Events.attr('tarjetas:editar',tc.id)} style="background:none;border:1px solid var(--border2);border-radius:7px;color:var(--text2);font-size:11px;padding:4px 9px;cursor:pointer;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button type="button" ${Events.attr('tarjetas:eliminar',tc.id)} style="background:none;border:1px solid rgba(240,104,104,.3);border-radius:7px;color:var(--red);font-size:11px;padding:4px 9px;cursor:pointer;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
        <div style="background:rgba(240,104,104,.07);border-radius:9px;padding:10px 12px;">
          <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.7px;font-family:'DM Mono',monospace;margin-bottom:3px;">Deuda actual</div>
          <div style="font-size:17px;font-weight:600;font-family:'DM Mono',monospace;color:var(--red);">${fmt(deuda)}</div>
          <div style="font-size:9px;color:var(--text3);font-family:'DM Mono',monospace;margin-top:1px;">= cupo utilizado</div>
        </div>
        <div style="background:rgba(200,240,96,.07);border-radius:9px;padding:10px 12px;">
          <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.7px;font-family:'DM Mono',monospace;margin-bottom:3px;">Cupo disponible</div>
          <div style="font-size:17px;font-weight:600;font-family:'DM Mono',monospace;color:var(--accent);">${fmt(disponible)}</div>
          <div style="font-size:9px;color:var(--text3);font-family:'DM Mono',monospace;margin-top:1px;">de ${fmt(cupo)} en total</div>
        </div>
      </div>

      <div style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span style="font-size:10px;color:var(--text3);">Cupo usado</span>
          <span style="font-size:10px;font-family:'DM Mono',monospace;color:${pct>80?'var(--red)':pct>50?'var(--amber)':'var(--text3)'};">${pct.toFixed(0)}%</span>
        </div>
        <div style="height:5px;background:var(--bg3);border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:${pct.toFixed(0)}%;background:${pct>80?'var(--red)':pct>50?'var(--amber)':'var(--accent)'};border-radius:3px;transition:width .4s;"></div>
        </div>
      </div>

      <div style="display:flex;gap:8px;">
        ${activa?`<button type="button" ${Events.attr('tarjetas:compra',tc.id)} style="flex:1;padding:10px;background:rgba(240,104,104,.12);border:1px solid rgba(240,104,104,.35);border-radius:9px;color:var(--red);font-size:13px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;">+ Compra</button>`
          :`<button type="button" disabled style="flex:1;padding:10px;background:var(--bg3);border:1px solid var(--border);border-radius:9px;color:var(--text3);font-size:13px;font-weight:600;cursor:not-allowed;font-family:'DM Sans',sans-serif;">+ Compra</button>`}
        <button type="button" ${Events.attr('tarjetas:pagar',tc.id)} ${deuda<=0?'disabled':''} style="flex:1;padding:10px;background:${deuda<=0?'var(--bg3)':'rgba(200,240,96,.12)'};border:1px solid ${deuda<=0?'var(--border)':'rgba(200,240,96,.35)'};border-radius:9px;color:${deuda<=0?'var(--text3)':'var(--accent)'};font-size:13px;font-weight:600;cursor:${deuda<=0?'not-allowed':'pointer'};font-family:'DM Sans',sans-serif;">Pagar</button>
        <button type="button" ${Events.attr('tarjetas:verDetalle',tc.id)} style="padding:10px 12px;background:var(--bg3);border:1px solid var(--border2);border-radius:9px;color:var(--text2);font-size:13px;cursor:pointer;">Ver</button>
      </div>
    </div>`;
  }).join('');
}

// ── Resumen de TC en la pantalla de Inicio ────────────────────────
function renderTCDashboard(){
  const el=document.getElementById('tc-deuda-card');
  if(!el)return;
  const tarjetas=S.tarjetasCredito||[];
  if(!tarjetas.length){el.style.display='none';return;}
  el.style.display='';
  const items=tarjetas.map(tc=>{
    const pct=tcCupoUsadoPct(tc);
    const disponible=tcCupoDisponible(tc);
    const estadoInfo=tcEstadoInfo(tc.estado);
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);">
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;display:flex;align-items:center;gap:6px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="display:inline-block;vertical-align:middle;margin-right:4px;flex-shrink:0;"><rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 10h20"/><circle cx="7" cy="15" r="1.2" fill="currentColor" stroke="none"/></svg>${escHtml(tc.nombre)}
          ${tc.cupo?`<span style="font-size:9px;padding:2px 6px;border-radius:20px;background:${pct>80?'rgba(240,104,104,.1)':pct>50?'rgba(240,184,64,.15)':'rgba(255,255,255,.07)'};color:${pct>80?'var(--red)':pct>50?'var(--amber)':'var(--text2)'};">${pct.toFixed(0)}% usado</span>`:''}
          ${estadoInfo.badge?`<span class="badge ${estadoInfo.badge}" style="font-size:8px;">${estadoInfo.label}</span>`:''}
        </div>
        ${tc.cupo?`<div style="margin-top:4px;height:3px;background:var(--bg3);border-radius:2px;overflow:hidden;width:100%;max-width:180px;"><div style="height:100%;width:${pct.toFixed(0)}%;background:${pct>80?'var(--red)':pct>50?'var(--amber)':'var(--accent)'};border-radius:2px;"></div></div>`:''}
      </div>
      <div style="text-align:right;flex-shrink:0;margin-left:10px;">
        <div style="font-size:13px;font-weight:600;font-family:'DM Mono',monospace;color:var(--red);">${fmt(tc.deuda||0)}</div>
        ${tc.cupo?`<div style="font-size:9px;color:var(--text3);font-family:'DM Mono',monospace;">disp. ${fmt(disponible)}</div>`:''}
      </div>
    </div>`;
  }).join('');
  el.innerHTML=`<div class="sec-title" style="margin-top:14px;display:flex;align-items:center;justify-content:space-between;">
    <span>Tarjetas de crédito</span>
    <button type="button" ${Events.attr('tarjetas:verTodo')} style="background:none;border:1px solid rgba(240,104,104,.35);border-radius:7px;color:var(--red);font-size:11px;font-weight:600;padding:4px 10px;cursor:pointer;font-family:'DM Sans',sans-serif;">Ver todo</button>
  </div>
    <div class="card" style="padding:4px 15px 2px;">${items}</div>
    ${(()=>{
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
        const saldoCajita=calcC(cajita).val;
        const diferencia=saldoCajita-deudaGrupo;
        const alcanza=diferencia>=0;
        const etiqueta=tcs.length>1?'estas tarjetas':'la deuda';
        const nombresTc=tcs.map(x=>x.nombre).join(', ');
        if(alcanza){
          // Cubierta: no necesita atención — una línea chiquita alcanza.
          lineasOk.push(`<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;font-size:11px;color:var(--text2);border-bottom:1px solid var(--border);">
            <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"><i class="fa-solid fa-check" style="color:var(--accent);margin-right:5px;font-size:9px;"></i>"${escHtml(cajita.nombre)}" cubre ${etiqueta}${tcs.length>1?' ('+escHtml(nombresTc)+')':''}</span>
            <span style="font-family:'DM Mono',monospace;color:var(--text3);white-space:nowrap;">${fmt(saldoCajita)}</span>
          </div>`);
          return;
        }
        // No alcanza: esto sí necesita atención — bloque completo con barra.
        const color='var(--amber)';
        const bg='rgba(240,184,64,.08)';
        const borderC='rgba(240,184,64,.25)';
        const pct=Math.min(100,Math.round(saldoCajita/deudaGrupo*100));
        bloquesFull.push(`<div style="margin-top:10px;background:${bg};border:1px solid ${borderC};border-radius:9px;padding:10px 12px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
            <div style="font-size:10px;color:${color};text-transform:uppercase;letter-spacing:.7px;font-family:'DM Mono',monospace;font-weight:600;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12" style="vertical-align:middle;margin-right:3px;"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg> Cajita ${escHtml(cajita.nombre)}</div>
            <div style="font-size:13px;font-weight:600;font-family:'DM Mono',monospace;color:${color};">${fmt(saldoCajita)}</div>
          </div>
          <div style="height:4px;background:var(--bg4);border-radius:2px;overflow:hidden;margin-bottom:6px;">
            <div style="height:100%;width:${pct}%;background:${color};border-radius:2px;transition:width .4s;"></div>
          </div>
          <div style="font-size:11px;font-family:'DM Mono',monospace;color:${color};">
            Faltan ${fmt(-diferencia)} para cubrir ${etiqueta} (${pct}% cubierto)
          </div>
          ${tcs.length>1?`<div style="font-size:10px;color:var(--text3);margin-top:4px;">${escHtml(nombresTc)}</div>`:''}
        </div>`);
      });
      let out=bloquesFull.join('');
      if(lineasOk.length){
        out+=`<div style="margin-top:${bloquesFull.length?'6px':'10px'};background:var(--bg3);border-radius:9px;padding:2px 12px;">${lineasOk.join('')}</div>`;
      }
      if(!out && tarjetas.some(tc=>(tc.deuda||0)>0)){
        out=`<div style="margin-top:10px;background:var(--bg3);border-radius:9px;padding:9px 12px;font-size:11px;color:var(--text3);display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <span>Vincula una cajita a tus tarjetas para ver si te alcanza cubrirlas.</span>
            <button type="button" ${Events.attr('tarjetas:verTodo')} style="background:none;border:1px solid var(--border2);border-radius:6px;color:var(--text2);font-size:10px;padding:3px 8px;cursor:pointer;white-space:nowrap;">Vincular</button>
          </div>`;
      }
      return out;
    })()}`;
}

// ── Registrar compra en TC ────────────────────────────────────────
function abrirCompraTC(tcId){
  _tcCompraTcId=tcId;
  const tc=getTCById(tcId);
  if(!tc)return;
  document.getElementById('compra-tc-deuda').textContent=fmt(tc.deuda||0);
  document.getElementById('compra-tc-nombre-header').textContent=tc.nombre;
  document.getElementById('tcc_desc').value='';
  document.getElementById('tcc_monto').value='';
  document.getElementById('tcc_fecha').value=hoy();
  document.getElementById('tcc_nota').value='';
  document.getElementById('tcc_es_cuotas').checked=false;
  document.getElementById('tcc_num_cuotas').value='';
  document.getElementById('tcc_valor_cuota').value='';
  document.getElementById('tcc-cuotas-grupo').style.display='none';
  document.getElementById('tcc-cuotas-preview').textContent='';
  poblarCatSelect('tcc_cat',getCatsVar());
  openSheet('compra-tc');
  setTimeout(()=>document.getElementById('tcc_desc').focus(),200);
}

function tccToggleCuotas(){
  const on=document.getElementById('tcc_es_cuotas').checked;
  document.getElementById('tcc-cuotas-grupo').style.display=on?'':'none';
  if(on) tccActualizarValorCuota();
}

// Recalcula el valor de cuota sugerido cuando cambian el monto o el
// número de cuotas. El usuario puede sobreescribirlo a mano después
// — solo se vuelve a autocompletar si cambia el monto o el número
// de cuotas de nuevo (así se cumple "permitir editar manualmente").
function tccActualizarValorCuota(){
  const monto=parseMoney(document.getElementById('tcc_monto').value)||0;
  const n=parseInt(document.getElementById('tcc_num_cuotas').value,10)||0;
  const campoValor=document.getElementById('tcc_valor_cuota');
  if(monto>0&&n>=2){
    campoValor.value=fmtInput(tcCalcularValorCuota(monto,n));
  }
  tccActualizarPreviewCuotas();
}

function tccActualizarPreviewCuotas(){
  const prev=document.getElementById('tcc-cuotas-preview');
  if(!prev)return;
  const monto=parseMoney(document.getElementById('tcc_monto').value)||0;
  const n=parseInt(document.getElementById('tcc_num_cuotas').value,10)||0;
  const valorCuota=parseMoney(document.getElementById('tcc_valor_cuota').value)||0;
  if(monto>0&&n>=2&&valorCuota>0){
    const ultima=tcValorUltimaCuota(monto,valorCuota,n);
    if(Math.round(ultima)===Math.round(valorCuota)){
      prev.textContent=n+' cuotas de '+fmt(valorCuota);
    } else {
      prev.textContent=(n-1)+' cuotas de '+fmt(valorCuota)+' + 1 cuota de '+fmt(ultima)+' (ajustada)';
    }
  } else {
    prev.textContent='';
  }
}

function confirmarCompraTC(){
  const tc=getTCById(_tcCompraTcId);
  if(!tc){toast('Tarjeta no encontrada','err');return;}
  const desc=document.getElementById('tcc_desc').value.trim();
  const monto=parseMoney(document.getElementById('tcc_monto').value)||0;
  if(!desc){toast('Ingresa una descripción','err');return;}
  if(!monto){toast('Ingresa un monto válido','err');return;}
  if(tc.cupo&&tcCupoDisponible(tc)<monto){toast('Cupo insuficiente en '+escHtml(tc.nombre)+' — cupo disponible: '+fmt(tcCupoDisponible(tc)),'err');return;}
  const fecha=document.getElementById('tcc_fecha').value||hoy();
  const cat=document.getElementById('tcc_cat').value;
  const nota=document.getElementById('tcc_nota').value.trim();
  const esCuotas=document.getElementById('tcc_es_cuotas').checked;
  const numCuotas=esCuotas?(parseInt(document.getElementById('tcc_num_cuotas').value,10)||0):null;
  if(esCuotas&&numCuotas<2){toast('Ingresa un número de cuotas válido (mínimo 2)','err');return;}
  const valorCuota=esCuotas?(parseMoney(document.getElementById('tcc_valor_cuota').value)||tcCalcularValorCuota(monto,numCuotas)):null;

  const compra=tcCrearCompra(tc,{desc,cat,fecha,monto,nota,esCuotas,numCuotas,valorCuota});

  if(!S.gastosVar)S.gastosVar=[];
  S.gastosVar.push({
    id:uid(),desc,monto,fecha,cat,
    fuente:'tc:'+tc.id,
    nota:nota||'Compra en '+tc.nombre,
    _esCompraTC:true,
    _tcId:tc.id,
    _tcCompraId:compra.id
  });

  closeSheet('compra-tc');
  save();refresh();renderTCScreen();
  toast('Compra registrada — deuda: '+fmt(tc.deuda),'info',3000);
}

// ── Pagar TC ───────────────────────────────────────────────────────
function abrirPagarTC(tcId){
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
    optsEl.innerHTML=deuda>0?`<button type="button" ${Events.attr('tarjetas:pagoTotal',deuda)} style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-radius:10px;background:var(--bg3);border:1.5px solid var(--border2);cursor:pointer;width:100%;text-align:left;">
      <div>
        <div style="font-size:13px;font-weight:600;color:var(--text);">Pago total</div>
        <div style="font-size:11px;color:var(--text3);font-family:'DM Mono',monospace;margin-top:2px;">${fmt(deuda)} — deja el cupo disponible al máximo</div>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
    </button>`:'';
  }

  const fuentesSel=document.getElementById('ptc_fuente');
  const fuentes=getFuentesSinTC();
  fuentesSel.innerHTML='<option value="">Seleccionar cuenta</option>'+fuentes.map(f=>`<option value="${f.val}">${escHtml(f.label)}</option>`).join('');
  document.getElementById('ptc-fuente-saldo').textContent='';

  openSheet('pagar-tc');
  setTimeout(()=>document.getElementById('ptc_monto').focus(),200);
}

function ptcSetMonto(val){
  const el=document.getElementById('ptc_monto');
  el.value=fmtInput(val);
  _initMoneyInput(el);
  _moneyDigits.set(el,String(Math.round(val*100)));
  el.dispatchEvent(new Event('input',{bubbles:true}));
  ptcActualizarPreview();
}

function ptcActualizarPreview(){
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
    saldoEl.style.color=saldo>=monto?'var(--accent)':'var(--red)';
  } else {
    saldoEl.textContent='';
  }
  if(monto>0){
    const nuevaDeuda=Math.max(0,(tc.deuda||0)-monto);
    prevEl.innerHTML='Deuda: '+fmt(tc.deuda)+' <i class="fa-solid fa-arrow-right" style="margin:0 3px;font-size:10px;"></i> '+fmt(nuevaDeuda);
    prevEl.style.color=nuevaDeuda<(tc.deuda||0)?'var(--accent)':'var(--text3)';
  } else {
    prevEl.textContent='';
  }
}

function confirmarPagarTC(){
  const tc=getTCById(_tcActualId);
  if(!tc){toast('Tarjeta no encontrada','err');return;}
  const montoEl=document.getElementById('ptc_monto');
  const monto=parseMoney(montoEl.value)||0;
  const fuente=document.getElementById('ptc_fuente').value;
  const fecha=document.getElementById('ptc_fecha').value||hoy();
  const nota=document.getElementById('ptc_nota').value.trim();
  if(!monto){toast('Ingresa el monto a pagar','err');return;}
  if(!fuente){toast('Selecciona la cuenta de pago','err');return;}

  const saldo=getSaldoFuente(fuente);
  if(saldo<monto){toast('Saldo insuficiente en '+escHtml(fuenteLabel(fuente))+' — disponible: '+fmt(saldo),'err');return;}

  descontarFuente(fuente,monto);
  const pago=tcCrearPago(tc,{monto,fecha,fuente,nota});

  if(!S.gastosVar)S.gastosVar=[];
  S.gastosVar.push({
    id:uid(),
    desc:'Pago tarjeta '+tc.nombre,
    monto,fecha,
    cat:'Servicios',
    fuente,
    nota:nota||'Pago de tarjeta de crédito',
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
function abrirDetalleTCSheet(tcId){
  const tc=getTCById(tcId);
  if(!tc)return;
  document.getElementById('detalle-tc-title').textContent=tc.nombre;
  const compras=(tc.compras||[]).filter(c=>!c.eliminado);
  const pagos=(tc.pagos||[]).filter(p=>!p.eliminado);
  const tcMovs=(S.tcMovimientos||[]).filter(m=>m.tcId===tc.id&&!m.eliminado);
  const mesClave=mesActual();

  let html='';

  const deuda=tc.deuda||0;
  const comprasMes=compras.filter(c=>mesKey(c.fecha)===mesClave);
  const tcMovsMes=tcMovs.filter(m=>mesKey(m.fecha)===mesClave);
  const totalMes=comprasMes.reduce((a,c)=>a+(c.monto||0),0)+tcMovsMes.reduce((a,m)=>a+(m.monto||0),0);
  const totalItems=comprasMes.length+tcMovsMes.length;
  html+=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
    <div style="background:rgba(240,104,104,.07);border-radius:9px;padding:11px 12px;">
      <div style="font-size:9px;color:var(--text3);text-transform:uppercase;font-family:'DM Mono',monospace;margin-bottom:3px;">Deuda actual</div>
      <div style="font-size:17px;font-weight:600;font-family:'DM Mono',monospace;color:var(--red);">${fmt(deuda)}</div>
    </div>
    <div style="background:var(--bg3);border-radius:9px;padding:11px 12px;">
      <div style="font-size:9px;color:var(--text3);text-transform:uppercase;font-family:'DM Mono',monospace;margin-bottom:3px;">Este mes <span style="font-weight:400;font-size:8px;">(${totalItems})</span></div>
      <div style="font-size:17px;font-weight:600;font-family:'DM Mono',monospace;">${fmt(totalMes)}</div>
    </div>
  </div>`;

  // ── Widget de cobertura: ¿la cajita vinculada te alcanza para pagar? ──
  // Si tc.cajitaId apunta a una cajita que ya no existe (la borraron), el
  // find() no encuentra nada y simplemente no se muestra el widget — no rompe.
  const cajitaVinc = tc.cajitaId ? (S.cajitas||[]).find(c=>c.id===tc.cajitaId) : null;
  if(cajitaVinc){
    // Otras tarjetas que comparten la misma cajita también cuentan para la cobertura.
    // Deuda TOTAL (no solo la propia): el banco cobra el 100% del corte sin importar
    // si una parte viene de un encargo/préstamo — la cajita necesita cubrir la plata
    // física, no la titularidad (la separación propia/ajena solo aplica al patrimonio).
    const tarjetasEnCajita=(S.tarjetasCredito||[]).filter(x=>x.cajitaId===cajitaVinc.id);
    const deudaGrupoTotal=tarjetasEnCajita.reduce((a,x)=>a+(x.deuda||0),0);
    const saldoCajita=calcC(cajitaVinc).val;
    const pct=deudaGrupoTotal>0?Math.min(100,Math.round(saldoCajita/deudaGrupoTotal*100)):100;
    const cubre=saldoCajita>=deudaGrupoTotal;
    const colorEstado=cubre?'var(--accent)':(pct>=50?'var(--amber)':'var(--red)');
    const compartidaMsg=tarjetasEnCajita.length>1
      ? `Compartida con: ${tarjetasEnCajita.filter(x=>x.id!==tc.id).map(x=>escHtml(x.nombre)).join(', ')}.`
      : '';
    html+=`<div style="background:var(--bg3);border-radius:9px;padding:11px 12px;margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <div style="font-size:9px;color:var(--text3);text-transform:uppercase;font-family:'DM Mono',monospace;">Cobertura desde "${escHtml(cajitaVinc.nombre)}"</div>
        <span style="font-size:10px;font-weight:700;color:${colorEstado};font-family:'DM Mono',monospace;">${cubre?'Cubre todo':pct+'%'}</span>
      </div>
      <div style="font-size:12px;color:var(--text2);">Saldo en la cajita: <b>${fmt(saldoCajita)}</b> · Deuda a cubrir: <b>${fmt(deudaGrupoTotal)}</b></div>
      ${compartidaMsg?`<div style="font-size:10px;color:var(--text3);margin-top:4px;">${compartidaMsg}</div>`:''}
    </div>`;
  } else if(tc.cajitaId){
    // Tenía una cajita vinculada pero ya no existe (fue eliminada).
    html+=`<div style="background:rgba(240,184,64,.08);border:1px solid rgba(240,184,64,.25);border-radius:9px;padding:10px 12px;margin-bottom:10px;font-size:11px;color:var(--amber);">
      La cajita que tenías vinculada para pagar esta tarjeta ya no existe. Podés vincular una nueva desde "Editar tarjeta".
    </div>`;
  }

  const itemsLinea=[
    ...(tc.saldoInicial&&!tc.saldoInicial.eliminado?[{_tipo:'saldo_inicial',...tc.saldoInicial}]:[]),
    ...compras.map(c=>({_tipo:'compra',...c})),
    ...tcMovs.map(m=>({_tipo:'tcmov',...m})),
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

  html+=`<div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1.2px;font-family:'DM Mono',monospace;margin-bottom:8px;">Movimientos <span style="font-weight:400;font-size:9px;">(${itemsLinea.length})</span></div>`;

  if(!itemsLinea.length){
    html+=`<div style="font-size:12px;color:var(--text3);margin-bottom:14px;">Sin movimientos registrados.</div>`;
  } else {
    const _tcAttrs=(item,origenLbl,otrasCuentas,descOverride)=>{
      const sd=_tcDeudaPorId.get(item.id);
      if(!sd) return '';
      const otras=otrasCuentas?`data-mov-otras="${escHtml(JSON.stringify(otrasCuentas))}"`:'';
      return `data-mov-id="${item.id}" data-mov-tipo="${item._tipo==='pago'?'abono':'compra'}" data-mov-monto="${Math.abs(item.monto)}" data-cuenta-key="tc" data-mov-origen="${escHtml(origenLbl)}" ${otras} data-mov-saldo-antes="${sd.antes}" data-mov-saldo-despues="${sd.despues}" data-mov-saldo-label="Deuda ${escHtml(tc.nombre)}" data-mov-desc="${escHtml(descOverride||item.desc||'')}" data-mov-fecha="${escHtml(item.fecha)}" style="cursor:pointer;" data-action="tarjetas:verMov"`;
    };
    html+=itemsLinea.slice(0,80).map(item=>{
      if(item._tipo==='saldo_inicial'){
        return `<div class="gasto-item" ${_tcAttrs(item,'Tarjeta de crédito',null,'Saldo inicial')} style="margin-bottom:7px;cursor:pointer;border-left:3px solid var(--text3);">
        <div class="gasto-item-top">
          <div style="flex:1;min-width:0;"><div class="row-name" style="font-size:13px;">Saldo inicial</div><div class="row-sub">${item.fecha}</div></div>
          <span class="row-amount" style="color:var(--text2);">${fmt(item.monto)}</span>
        </div>
        <div class="gasto-item-meta"><span class="badge" style="font-size:9px;background:var(--bg3);color:var(--text3);">Deuda antes de usar la app</span></div>
      </div>`;
      }
      if(item._tipo==='compra'){
        const c=item;
        const esFavor=c._esFavor||c._desdeCP;
        const favorBadge=esFavor
          ? `<span style="font-size:8px;padding:2px 6px;border-radius:8px;background:rgba(96,176,240,.12);border:1px solid rgba(96,176,240,.3);color:var(--blue);font-family:'DM Mono',monospace;white-space:nowrap;margin-left:3px;"><i class="fa-solid fa-handshake" style="margin-right:3px;font-size:7px;"></i>favor</span>`
          : '';
        const _origenC=c._desdeCP?'Plata comprometida':'Tarjeta de crédito';
        const cuotasInfo=c.esCuotas?`<span class="badge" style="font-size:9px;background:rgba(150,120,240,.12);color:rgba(180,140,255,1);">Cuota ${c.cuotasPagadas||0}/${c.numCuotas} · ${fmt(c.valorCuota||0)}</span>
          <button type="button" ${Events.attr('tarjetas:incrementarCuota',tc.id,c.id,1)} data-stop-propagation="true" style="background:none;border:1px solid var(--border2);border-radius:6px;color:var(--text2);font-size:10px;padding:1px 6px;cursor:pointer;">+1 cuota</button>
          ${c.cuotasPagadas>0?`<button type="button" ${Events.attr('tarjetas:incrementarCuota',tc.id,c.id,-1)} data-stop-propagation="true" style="background:none;border:1px solid var(--border2);border-radius:6px;color:var(--text2);font-size:10px;padding:1px 6px;cursor:pointer;">-1</button>`:''}`:'';
        return `<div class="gasto-item" ${_tcAttrs(c,_origenC,null)} style="margin-bottom:7px;cursor:pointer;${esFavor?'border-color:rgba(96,176,240,.25);':''}">
        <div class="gasto-item-top">
          <div style="flex:1;min-width:0;"><div class="row-name" style="font-size:13px;">${escHtml(c.desc)}${favorBadge}</div><div class="row-sub">${c.fecha}</div></div>
          <div style="display:flex;align-items:center;gap:6px;">
            <span class="row-amount" style="color:${esFavor?'var(--blue)':'var(--red)'};">${fmt(c.monto)}</span>
            <button type="button" ${Events.attr('tarjetas:eliminarCompra',tc.id,c.id)} data-stop-propagation="true" style="background:none;border:none;cursor:pointer;padding:4px;color:var(--text3);opacity:.6;display:flex;align-items:center;" onmouseenter="this.style.opacity='1';this.style.color='var(--red)'" onmouseleave="this.style.opacity='.6';this.style.color='var(--text3)'">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
            </button>
          </div>
        </div>
        <div class="gasto-item-meta"><span class="badge" style="font-size:9px;background:${esFavor?'rgba(96,176,240,.12)':'rgba(240,104,104,.12)'};color:${esFavor?'var(--blue)':'var(--red)'};">${esFavor?'Favor cubierto':c.cat||'Sin cat.'}</span>${cuotasInfo}${c.nota?`<span style="font-size:10px;color:var(--text3);">${escHtml(c.nota)}</span>`:''}</div>
      </div>`;
      }
      if(item._tipo==='tcmov'){
        const m=item;
        const esEncargo=m.tipo==='cargo_encargo';
        const colorBorde=esEncargo?'rgba(240,184,64,.3)':'rgba(150,120,240,.3)';
        const colorMonto=esEncargo?'var(--amber)':'rgba(180,140,255,1)';
        const colorBadgeBg=esEncargo?'rgba(240,184,64,.12)':'rgba(150,120,240,.12)';
        const colorBadgeTxt=esEncargo?'var(--amber)':'rgba(180,140,255,1)';
        const labelBadge=esEncargo?'Encargo':'Préstamo';
        const iconoBadge=esEncargo
          ? `<i class="fa-solid fa-box" style="margin-right:3px;font-size:7px;"></i>`
          : `<i class="fa-solid fa-hand-holding-dollar" style="margin-right:3px;font-size:7px;"></i>`;
        const _origenM=esEncargo?'Encargos':('Préstamos · '+(((S.deudores||[]).find(x=>x.id===m.deudorId)||{}).nombre||''));
        return `<div class="gasto-item" ${_tcAttrs(m,_origenM,null)} style="margin-bottom:7px;cursor:pointer;border-color:${colorBorde};">
        <div class="gasto-item-top">
          <div style="flex:1;min-width:0;"><div class="row-name" style="font-size:13px;">${escHtml(m.desc)}</div><div class="row-sub">${m.fecha}</div></div>
          <span class="row-amount" style="color:${colorMonto};">${fmt(m.monto)}</span>
        </div>
        <div class="gasto-item-meta">
          <span class="badge" style="font-size:9px;background:${colorBadgeBg};color:${colorBadgeTxt};">${iconoBadge}${labelBadge}</span>
          ${m.nota?`<span style="font-size:10px;color:var(--text3);">${escHtml(m.nota)}</span>`:''}
        </div>
      </div>`;
      }
      const p=item;
      const descPago=p.nota?p.nota:'Abono a la deuda de '+(tc.nombre||'tu tarjeta')+' — no corresponde a una compra específica';
      const otrasPago=p.fuente?[{fuente:p.fuente,monto:-p.monto}]:null;
      return `<div class="gasto-item" ${_tcAttrs(p,'Tarjeta de crédito',otrasPago,'Abono a tu deuda')} style="border-color:rgba(200,240,96,.3);border-left:3px solid var(--accent);margin-bottom:7px;background:rgba(200,240,96,.04);cursor:pointer;">
        <div class="gasto-item-top">
          <div style="flex:1;min-width:0;"><div class="row-name" style="font-size:13px;">Abono a tu deuda</div><div class="row-sub">${p.fecha}</div></div>
          <div style="display:flex;align-items:center;gap:6px;">
            <span class="row-amount c-green">−${fmt(p.monto)}</span>
            <button type="button" ${Events.attr('tarjetas:eliminarPago',tc.id,p.id)} data-stop-propagation="true" style="background:none;border:none;cursor:pointer;padding:4px;color:var(--text3);opacity:.6;display:flex;align-items:center;" onmouseenter="this.style.opacity='1';this.style.color='var(--red)'" onmouseleave="this.style.opacity='.6';this.style.color='var(--text3)'">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
            </button>
          </div>
        </div>
        <div class="gasto-item-meta">
          <span class="badge bg-green" style="font-size:9px;"><i class="fa-solid fa-arrow-down" style="margin-right:3px;font-size:7px;"></i>Reduce deuda</span>
          <span class="badge ${fuenteBadgeClass(p.fuente)}" style="font-size:9px;">Desde ${escHtml(fuenteLabel(p.fuente))}</span>
          <span style="font-size:10px;color:var(--text3);">${escHtml(descPago)}</span>
        </div>
      </div>`;
    }).join('');
  }

  document.getElementById('detalle-tc-content').innerHTML=html;
  openSheet('detalle-tc');
}

async function eliminarCompraTC(tcId,compraId){
  const tc=getTCById(tcId);
  if(!tc)return;
  const compra=(tc.compras||[]).find(c=>c.id===compraId&&!c.eliminado);
  if(!compra)return;
  const ok=await dialogo('Eliminar compra','¿Eliminar esta compra de '+fmt(compra.monto)+'? Se reducirá la deuda de la tarjeta.','Eliminar',true);
  if(!ok)return;
  tcEliminarCompraInterna(tc,compraId);
  if(S.gastosVar)S.gastosVar=S.gastosVar.filter(g=>!(g._esCompraTC&&g._tcCompraId===compraId));
  save();refresh();renderTCScreen();
  abrirDetalleTCSheet(tcId);
  toast('Compra eliminada — deuda actualizada','ok');
}

async function eliminarPagoTC(tcId,pagoId){
  const tc=getTCById(tcId);
  if(!tc)return;
  const pago=(tc.pagos||[]).find(p=>p.id===pagoId&&!p.eliminado);
  if(!pago)return;
  const ok=await dialogo('Eliminar pago','¿Eliminar este pago de '+fmt(pago.monto)+'? Se devolverá el dinero a '+fuenteLabel(pago.fuente)+' y aumentará la deuda de la tarjeta.','Eliminar',true);
  if(!ok)return;
  tcEliminarPagoInterna(tc,pagoId);
  if(pago.fuente) sumarFuente(pago.fuente,pago.monto);
  if(S.gastosVar)S.gastosVar=S.gastosVar.filter(g=>!(g._esPagoTC&&g._tcPagoId===pagoId));
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
  pagar:            abrirPagarTC,
  verDetalle:       abrirDetalleTCSheet,
  pagoTotal:        ptcSetMonto,
  incrementarCuota: tcIncrementarCuotaPagada,
  eliminarCompra:   eliminarCompraTC,
  eliminarPago:     eliminarPagoTC,
  seleccionarColor: tcSelColor,          // usada por los 8 círculos de color estáticos en #sheet-nueva-tc
  verMov:           (...args) => abrirDetalleMov(...args), // función compartida (js/core/movimientos.js), envuelta por el mismo motivo que en prestado.js: se define más abajo (en movimientos.js, que carga DESPUÉS de este archivo), así que pasarla directo la capturaría como undefined al cargar. Envuelta así, la búsqueda del nombre global ocurre recién al hacer click.
  verTodo:          () => navTo('tarjetas') // navTo es global, definida en index.html
});
// ── Conectar botones TC al formulario y selects ───────────────────
document.addEventListener('DOMContentLoaded',function(){
  const btnGuardarTC=document.getElementById('btn-guardar-tc');
  if(btnGuardarTC)btnGuardarTC.addEventListener('click',guardarTC);

  const btnCompraTC=document.getElementById('btn-confirmar-compra-tc-tarjetas');
  if(btnCompraTC)btnCompraTC.addEventListener('click',confirmarCompraTC);

  const btnPagarTC=document.getElementById('btn-confirmar-pagar-tc');
  if(btnPagarTC)btnPagarTC.addEventListener('click',confirmarPagarTC);

  const ptcFuente=document.getElementById('ptc_fuente');
  if(ptcFuente)ptcFuente.addEventListener('change',ptcActualizarPreview);
  const ptcMonto=document.getElementById('ptc_monto');
  if(ptcMonto)ptcMonto.addEventListener('input',ptcActualizarPreview);

  const tccEsCuotas=document.getElementById('tcc_es_cuotas');
  if(tccEsCuotas)tccEsCuotas.addEventListener('change',tccToggleCuotas);
  const tccMonto=document.getElementById('tcc_monto');
  if(tccMonto)tccMonto.addEventListener('input',function(){
    if(document.getElementById('tcc_es_cuotas').checked) tccActualizarValorCuota();
  });
  const tccNumCuotas=document.getElementById('tcc_num_cuotas');
  if(tccNumCuotas)tccNumCuotas.addEventListener('input',tccActualizarValorCuota);
  const tccValorCuota=document.getElementById('tcc_valor_cuota');
  if(tccValorCuota)tccValorCuota.addEventListener('input',tccActualizarPreviewCuotas);
});

// Mostrar el label TC en el gasto variable al seleccionarlo
// Patch via window para asegurar que la referencia a la función original es correcta.
// Se ejecuta en DOMContentLoaded (o inmediatamente si ya cargó) para garantizar
// que mostrarAlertaFuente ya está definida cuando aplicamos el patch.
(function aplicarPatchMAF(){
  function _patch(){
    const _origMAF=window.mostrarAlertaFuente;
    if(typeof _origMAF!=='function'){
      console.warn('[TC] mostrarAlertaFuente no encontrada — patch de TC no aplicado.');
      return;
    }
    window.mostrarAlertaFuente=function(prefix){
      const sel=document.getElementById(prefix+'_fuente')||document.getElementById(prefix+'fuente');
      if(!sel)return _origMAF(prefix);
      const val=sel.value;
      if(val&&val.startsWith('tc:')){
        const id=val.split(':')[1];
        const tc=getTCById(id);
        const hint=document.getElementById(prefix+'_fuente_hint')||document.getElementById(prefix+'fuente_hint');
        const saldoEl=document.getElementById(prefix+'_fuente_saldo')||document.getElementById(prefix+'fuente_saldo');
        if(hint)hint.style.display='';
        if(tc&&hint)hint.textContent='El gasto se cargará a la TC — no sale plata de tus cuentas';
        if(tc&&hint)hint.style.color='var(--red)';
        if(saldoEl)saldoEl.textContent='Deuda actual en TC: '+fmt(tc?tc.deuda||0:0);
        if(saldoEl)saldoEl.style.color='var(--red)';
        return;
      }
      return _origMAF(prefix);
    };
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',_patch);
  } else {
    _patch();
  }
})();
