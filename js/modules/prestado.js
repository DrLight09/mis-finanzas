/* ═══════════════════════════════════════════════════════════════
   js/modules/prestado.js

   Módulo Préstamos ("Prestado"): Me deben (S.deudores) + Yo debo
   (S.misDeudas) + Préstamo con tarjeta de crédito.

   La integración con S.personas (crear/vincular persona automática,
   refrescar detalle al editar desde el sheet global, "Editar mi
   deuda", navegar desde el perfil de una persona) y el selector de
   persona compartido por "Agregar persona" (Me deben) y "Nueva
   deuda" (Yo debo) vivían en dos archivos aparte —
   js/modules/prestado-personas.js y js/modules/deudores-personas.js
   — que se fusionaron acá el 2026-08-03 (ver los bloques marcados
   "fusionado acá" más abajo) para no tener tres archivos separados
   dependiendo del mismo orden de carga. Ya no existen como archivos
   propios; todo su contenido vive en este mismo módulo.

   Ver docs/prestado.md (sección 6, integración con S.personas).

   Todos los onclick="..." inline de este módulo (24 en total: 6 en
   la plantilla de index.html, el resto generados dinámicamente en
   los render de listas/historial) se migraron a data-action con el
   sistema centralizado de js/core/events.js, siguiendo el mismo
   patrón que Spotify, Mesada y Encargos:

     `<button onclick="abrirDeudor('${d.id}')">`
     →
     `<button ${Events.attr('prestado:abrirDeudor', d.id)}>`

   Los onclick="event.stopPropagation()" sueltos (sin acción propia,
   solo para no burbujear el click) NO pasan por el registry de
   Events — no son "acciones" de negocio con nombre. Se resuelven con
   un addEventListener directo al final de la función que arma esas
   filas (ver extRenderPartes) — sigue sin ser un atributo inline, así
   que cumple el mismo objetivo de cara a la CSP.

   Depende de utilidades ya definidas en el núcleo de index.html:
   S, save, refresh, escHtml, fmt, fmtInput, parseMoney, uid, hoy,
   toast, dialogo, openSheet, closeSheet, showScreen, sumarFuente,
   descontarFuente, getFuentesSinTC, getFuentes, fuenteLabel,
   fuenteLabel2, fuenteBadgeClass, poblarFuente, buildFuentesOptsHtml,
   abrirDetalleMov, logCambio, _markError, calcC — y del motor
   genérico de diferencial (diffRegistrarInstancia/diffToggle/
   diffResumen/diffReset/diffEstaAbierto/diffCalcular/diffAplicar) y
   de split (crearSplitWidget/splitToggle/splitAgregarRow/splitGetData/
   splitPreview), ambos compartidos con Mesada y Encargos y por eso
   siguen viviendo en index.html. Este módulo registra sus PROPIAS
   instancias de esos motores ('prtc', 'abonoEncCuenta' y, desde esta
   migración, 'abonoDestino' — el split del destino del abono, que antes
   tenía su propia implementación casera con un botón "×" de texto en vez
   del ícono SVG del resto de la app), igual que ya hacía Encargos con
   las suyas.
   ═══════════════════════════════════════════════════════════════ */

/* ---- PRÉSTAMO CON ORIGEN DIVIDIDO ---- */
let _prestSplitMode = false;
let _prestSplitRows = []; // [{fuente, monto}]

function togglePrestSplit(){
  _prestSplitMode = !_prestSplitMode;
  document.getElementById('mov_fuente_simple').style.display = _prestSplitMode ? 'none' : '';
  document.getElementById('mov_fuente_split').style.display = _prestSplitMode ? '' : 'none';
  const btn = document.getElementById('mov_split_toggle');
  btn.textContent = _prestSplitMode ? 'Una sola fuente' : 'Dividir ÷';
  btn.style.background = _prestSplitMode ? 'rgba(240,184,64,.1)' : 'rgba(200,240,96,.1)';
  btn.style.borderColor = _prestSplitMode ? 'rgba(240,184,64,.3)' : 'rgba(200,240,96,.3)';
  btn.style.color = _prestSplitMode ? 'var(--amber)' : 'var(--accent)';
  if(_prestSplitMode && !_prestSplitRows.length){
    _prestSplitRows = [{fuente:'', monto:0}];
    _renderPrestSplit();
  }
}

function _renderPrestSplit(){
  const el = document.getElementById('mov_split_rows');
  if(!el) return;
  const fuentes = getFuentes();
  const opts = '<option value="">Sin especificar</option>' + fuentes.map(f=>`<option value="${f.val}">${escHtml(f.label)}</option>`).join('') + '<option value="ganancia"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block"><ellipse cx="12" cy="17" rx="8" ry="5"/><path d="M4 17v-4c0-2.76 3.58-5 8-5s8 2.24 8 5v4"/><path d="M4 13c0-2.76 3.58-5 8-5s8 2.24 8 5"/></svg> Ganancia (no salió plata)</option>';
  el.innerHTML = html`${_prestSplitRows.map((r,i)=>html`
    <div class="prest-split-row">
      <div class="select-wrap" style="flex:1;"><select class="_prest-split-fuente" data-i="${i}" style="font-size:13px;">${raw(opts.replace(`value="${r.fuente}"`,`value="${r.fuente}" selected`))}</select></div>
      <input type="text" inputmode="decimal" value="${r.monto?fmtInput(r.monto):''}" placeholder="$0" class="money-input _prest-split-monto" data-i="${i}" style="width:105px;">
      <button class="prest-split-del" ${raw(Events.attr('prestado:prestSplitDelRow', i))} ${raw(_prestSplitRows.length<=1?'style="visibility:hidden;"':'')}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`)}`;
  // onchange/oninput inline reemplazados por addEventListener delegado — docs/auditoria-tecnica.md #1
  el.querySelectorAll('._prest-split-fuente').forEach(sel => {
    sel.addEventListener('change', () => {
      _prestSplitRows[+sel.dataset.i].fuente = sel.value;
      _updatePrestSplitResumen();
    });
  });
  el.querySelectorAll('._prest-split-monto').forEach(inp => {
    inp.addEventListener('input', () => {
      _prestSplitRows[+inp.dataset.i].monto = parseMoney(inp.value)||0;
      _updatePrestSplitResumen();
    });
  });
  _updatePrestSplitResumen();
}

function _updatePrestSplitResumen(){
  const totalSplit = _prestSplitRows.reduce((a,r)=>a+(r.monto||0),0);
  const montoTotal = parseMoney(document.getElementById('mov_monto').value)||0;
  const resEl = document.getElementById('mov_split_resumen');
  if(resEl){
    const diff = montoTotal - totalSplit;
    if(montoTotal && Math.abs(diff)>1){
      resEl.innerHTML = html`<span style="color:var(--amber);">Total dividido: ${fmt(totalSplit)} de ${fmt(montoTotal)} · ${diff>0?'Faltan':'Sobran'} ${fmt(Math.abs(diff))}</span>`;
    } else if(montoTotal){
      resEl.innerHTML = html`<span style="color:var(--accent);">Total: ${fmt(totalSplit)}</span>`;
    } else { resEl.textContent = ''; }
  }
  // Mostrar aviso de la(s) fila(s) de "ganancia" (plata virtual)
  const metaEl = document.getElementById('mov_split_metas');
  if(!metaEl) return;
  const impactos = [];
  const gananciaTotal = _prestSplitRows.filter(r=>r.fuente==='ganancia').reduce((a,r)=>a+(r.monto||0),0);
  if(gananciaTotal>0){
    impactos.push(html`<div style="padding:7px 9px;background:rgba(200,240,96,.07);border:1px solid rgba(200,240,96,.25);border-radius:7px;margin-top:5px;">
      <div style="font-size:11px;color:var(--accent);"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block"><ellipse cx="12" cy="17" rx="8" ry="5"/><path d="M4 17v-4c0-2.76 3.58-5 8-5s8 2.24 8 5v4"/><path d="M4 13c0-2.76 3.58-5 8-5s8 2.24 8 5"/></svg> ${fmt(gananciaTotal)} de este préstamo es <b>ganancia tuya</b> que aún no recibiste — no se descuenta de ninguna cuenta. Cuando te paguen el préstamo completo, esa parte se sumará como ganancia.</div>
    </div>`);
  }
  _prestSplitRows.forEach(r=>{
    if(!r.fuente || !r.fuente.startsWith('cajita:') || !r.monto) return;
    const cajitaId = r.fuente.split(':')[1];
    const c = (S.cajitas||[]).find(x=>x.id===cajitaId);
    if(!c || !c.meta || typeof calcC!=='function') return;
    const saldoActual = calcC(c).val;
    const saldoTras = saldoActual - r.monto;
    const minimo = c.meta.minimo || 0;
    const obj = c.meta.objetivo || 0;
    impactos.push(html`<div style="padding:7px 9px;background:rgba(240,184,64,.07);border:1px solid rgba(240,184,64,.25);border-radius:7px;margin-top:5px;">
      <div style="font-size:10px;color:var(--amber);font-family:'DM Mono',monospace;font-weight:600;margin-bottom:4px;">${c.nombre}</div>
      <div style="font-size:11px;color:var(--text2);">Disponible ahora: <b style="color:var(--text);">${fmt(saldoActual)}</b> <i class="fa-solid fa-arrow-right" style="margin:0 3px;font-size:10px;"></i>tras préstamo: <b style="color:${saldoTras<0?'var(--red)':'var(--text)'};">${fmt(saldoTras)}</b></div>
      ${obj ? html`<div style="font-size:10px;color:var(--text3);margin-top:2px;">Meta: ${fmt(obj)} · ${fmt(Math.max(0,obj-saldoTras))} aún por ahorrar (tras préstamo)</div>` : ''}
      ${minimo && saldoTras < minimo ? html`<div style="font-size:10px;color:var(--red);margin-top:2px;">Quedarás ${fmt(minimo-saldoTras)} por debajo del mínimo (${fmt(minimo)})</div>` : ''}
    </div>`);
  });
  metaEl.innerHTML = html`${impactos}`;
}

function prestSplitDelRow(i) {
  _prestSplitRows.splice(i, 1);
  _renderPrestSplit();
  _updatePrestSplitResumen();
}

/* ---- FIN METAS / SPLIT ---- */
/* ---- DEUDORES (Personas a quienes presto) ---- */
let deudorActualId = null;
let movTipo = 'prestamo'; // 'prestamo' | 'abono'
let npColorSel = '#60b0f0';

function selColor(c) {
  npColorSel = c;
  document.querySelectorAll('.avatar-color-opt').forEach(el => {
    el.style.border = el.dataset.color === c ? '2px solid var(--accent)' : '2px solid transparent';
  });
}

// Wiring del color picker (sheet "Nueva persona") — migrado desde
// index.html (_initEventListeners). Se restauró acá tras una corrección
// (ver CHANGELOG.md/auditoria-tecnica.md, 2026-07-27) porque selColor()
// sí existe en este archivo — pero el override de `openSheet` más abajo en
// este mismo archivo (antes vivía en `deudores-personas.js`, un módulo
// aparte que ya no existe — se fusionó acá) intercepta id==='nueva-persona'
// con un `return` antes de mostrar este sheet, redirigiendo a
// `abrirSelPersona(_onSelPersonaMeDeben)` — el selector genérico de
// Personas. El sheet #sheet-nueva-persona, este picker, addDeudor() e
// initColorPicker() nunca se ejecutan en la app tal como está armada hoy.
// Se deja sin borrar, mismo criterio que el resto del código muerto ya
// documentado en este proyecto (toggleCDT/toggleCajita en Cuentas, etc.)
// — no se borra de paso, se anota.
document.querySelectorAll('[data-pick-color]').forEach(el => {
  el.addEventListener('click', () => selColor(el.dataset.pickColor));
});

function initColorPicker() {
  npColorSel = '#60b0f0';
  document.querySelectorAll('.avatar-color-opt').forEach((el, i) => {
    el.style.border = i === 0 ? '2px solid var(--accent)' : '2px solid transparent';
  });
}

function addDeudor() {
  const nombre = document.getElementById('np_nombre').value.trim();
  // Validación con foco+mensaje inline (antes vivía en un override aparte en
  // index.html — se integra directo acá ahora que el módulo es autocontenido).
  if (!nombre) { _markError('np_nombre', 'np_nombre_err', 'El nombre es obligatorio'); return; }
  if (!S.deudores) S.deudores = [];
  S.deudores.push({ id: uid(), nombre, color: npColorSel, movimientos: [] });
  document.getElementById('np_nombre').value = '';
  initColorPicker();
  save(); refresh(); closeSheet('nueva-persona');
  toast(`${escHtml(nombre)} agregado/a`,'ok');
}

function getDeudorSaldo(d) {
  return (d.movimientos || []).reduce((a, m) => m.tipo === 'prestamo' ? a + m.monto : a - m.monto, 0);
}
// Cuenta(s) realmente afectadas por un movimiento de deudor — la(s) fuente(s)
// si fue un préstamo dado, el destino si fue un abono/pago-completo recibido.
function _deudorCuentasDe(m) {
  if (m.tipo === 'prestamo') return (m.fuentes && m.fuentes.length) ? m.fuentes.map(f => f.fuente).filter(Boolean) : (m.fuente ? [m.fuente] : []);
  return m.destino ? [m.destino] : [];
}
// Cantidad de movimientos posteriores del mismo deudor que tocaron alguna de
// las mismas cuentas — criterio de "operaciones posteriores" de la
// protección por antigüedad (ver core-state.js#nivelAntiguedadMovimiento y
// docs/proteccion-antiguedad-movimientos.md §4).
function _deudorOpsPosteriores(d, m) {
  if (!m.fecha) return 0;
  const cuentas = _deudorCuentasDe(m);
  if (!cuentas.length) return 0;
  return (d.movimientos || []).filter(m2 => m2.id !== m.id && m2.fecha && m2.fecha > m.fecha && _deudorCuentasDe(m2).some(c => cuentas.includes(c))).length;
}
// True si borrar este movimiento de deudor realmente revierte el saldo de
// alguna cuenta real, un depósito de Alcancía, la deuda de una TC, o un
// movimiento de un encargo (ver docs/proteccion-antiguedad-movimientos.md).
// Un préstamo/abono íntegramente "Sin especificar" (o "Ganancia", que
// explícitamente no mueve plata) no toca nada de eso, así que no hay ningún
// saldo que la protección por antigüedad deba proteger.
function _deudorTieneCuentaAfectada(m) {
  if (m._viaAlcancia && m._alcanciaMovId) return true;
  if (m.tipo === 'prestamo') {
    if (m._viaTC) return true;
    if (m.fuentes && m.fuentes.length) return m.fuentes.some(f => f.fuente && f.fuente !== 'ganancia');
    return !!(m.fuente && m.fuente !== 'ganancia');
  }
  // Abono / pago-completo
  if (m._viaEncargo && m._encId && m._encMovId) return true;
  if (m.destinos && m.destinos.length) return m.destinos.some(r => r.fuente);
  if (m.destino) return true;
  return !!(m._extPartes && m._extPartes.some(p => p.tipo === 'guardar' && p.cuenta));
}
// Guardia de integridad: verifica que registrar/eliminar un movimiento cambió el saldo
// exactamente en lo esperado. Si no coincide, casi siempre significa que hay un movimiento
// duplicado o corrupto en d.movimientos que no se está viendo a simple vista.
function _verificarIntegridadSaldoDeudor(d, saldoAntes, deltaEsperado) {
  if (!d) return;
  const saldoDespues = getDeudorSaldo(d);
  const deltaReal = saldoDespues - saldoAntes;
  if (Math.abs(deltaReal - deltaEsperado) > 1) {
    console.warn(`[Integridad] Saldo de ${escHtml(d.nombre)} cambió ${deltaReal} en vez de ${deltaEsperado} (antes: ${saldoAntes}, después: ${saldoDespues}). Revisa d.movimientos por duplicados.`, d.movimientos);
    toast(`⚠️ El saldo de ${escHtml(d.nombre)} no cambió como se esperaba (esperado: ${fmt(deltaEsperado)}, real: ${fmt(deltaReal)}). Revisa su historial antes de seguir.`, 'err', 6000);
  }
}
// Saldo que impacta el patrimonio: todos los préstamos cuentan, sin excepción
function getDeudorSaldoPatrimonio(d) {
  return (d.movimientos || []).reduce((a, m) =>
    m.tipo === 'prestamo' ? a + m.monto : a - m.monto
  , 0);
}

// ── Grupos de préstamo dentro de un deudor ──────────────────────────────
// Permiten separar "préstamo viejo" de "préstamo nuevo" con una misma
// persona sin duplicarla en la lista de Prestado. Cada movimiento lleva
// m.grupoId apuntando a d.grupos[]. El saldo TOTAL de la persona
// (getDeudorSaldo) no cambia — grupoId es puramente organizativo.
// Ver prestado.md §2.4 para el diseño completo.

// Migra deudores viejos (sin d.grupos) creando un grupo "Histórico" que
// absorbe todos los movimientos sueltos. Idempotente — se puede llamar en
// cada abrirDeudor() sin costo si ya está migrado. No llama a save() —
// eso lo decide quien la invoque, para no generar escrituras de más si el
// deudor no tiene movimientos que migrar.
function _migrarGruposDeudor(d) {
  if (!d) return false;
  if (!d.grupos) d.grupos = [];
  const movs = d.movimientos || [];
  const sinGrupo = movs.filter(m => !m.grupoId);
  if (!sinGrupo.length) return false;
  let historico = d.grupos.find(g => g.id === '_historico');
  if (!historico) {
    historico = { id: '_historico', nombre: 'Histórico', creadoEn: (sinGrupo[0] && sinGrupo[0].fecha) || hoy(), cerrado: false };
    d.grupos.push(historico);
  }
  sinGrupo.forEach(m => { m.grupoId = historico.id; });
  return true;
}

// Saldo de un grupo específico dentro de un deudor (mismo criterio que
// getDeudorSaldo pero filtrado por grupoId).
function getGrupoSaldo(d, grupoId) {
  return (d.movimientos || []).filter(m => m.grupoId === grupoId).reduce((a, m) => m.tipo === 'prestamo' ? a + m.monto : a - m.monto, 0);
}

// Grupos abiertos (no cerrados manualmente) de un deudor, más recientes primero.
function _gruposAbiertos(d) {
  return (d.grupos || []).filter(g => !g.cerrado).sort((a, b) => (b.creadoEn || '').localeCompare(a.creadoEn || ''));
}

// Cierra automáticamente los grupos con saldo 0 que no estén ya cerrados.
// Se llama tras registrar/eliminar un movimiento para mantener la lista de
// "grupos abiertos" limpia sin pedirle al usuario que cierre nada a mano.
function _autoCerrarGruposEnCero(d) {
  if (!d || !d.grupos) return;
  d.grupos.forEach(g => {
    if (!g.cerrado && Math.abs(getGrupoSaldo(d, g.id)) < 1) g.cerrado = true;
    else if (g.cerrado && Math.abs(getGrupoSaldo(d, g.id)) >= 1) g.cerrado = false; // se reabrió (ej. se borró un abono)
  });
}

// Crea un grupo nuevo en el deudor y lo devuelve. nombre opcional — si no se
// da, se autogenera con la fecha para que nunca quede en blanco en la UI.
function _crearGrupoDeudor(d, fecha, nombre) {
  if (!d.grupos) d.grupos = [];
  const g = { id: uid(), nombre: (nombre || '').trim() || ('Préstamo ' + (fecha || hoy())), creadoEn: fecha || hoy(), cerrado: false };
  d.grupos.push(g);
  return g;
}

// Resolución automática de grupoId: último recurso cuando el selector no
// decidió nada (0 grupos abiertos, o el checkbox/select no aplicaba). Si hay
// exactamente un grupo abierto lo reutiliza, si hay 0 o ≥2 crea uno nuevo —
// nunca deja un movimiento sin grupoId, y nunca le adivina a cuál de varios
// pertenece.
function _autoGrupoIdMov(d, fecha) {
  const abiertos = _gruposAbiertos(d);
  if (abiertos.length === 1) return abiertos[0].id;
  return _crearGrupoDeudor(d, fecha).id;
}

// Resolución de grupoId para el sheet "Registrar movimiento" (initMovSheet /
// confirmarMovimiento). Dos caminos posibles según lo que _initMovGrupoSelector
// haya mostrado:
// 1. Selector visible (≥2 grupos abiertos): respeta lo elegido, incluyendo
//    crear uno nuevo si escogió "🆕 Es un préstamo nuevo".
// 2. Checkbox visible (exactamente 1 grupo abierto, tipo 'prestamo'): si el
//    usuario lo marcó, crea un grupo aparte en vez de fusionar con el único
//    abierto.
// Si ninguno de los dos se mostró, no hay nada que preguntar: automático.
function _resolverGrupoIdMov(d, fecha) {
  return _resolverGrupoIdSel('mov', d, fecha);
}

// Versión genérica de _resolverGrupoIdMov, parametrizada por el prefijo de
// los ids en el DOM (ej. 'mov' para "Registrar movimiento", 'prtc' para
// "Préstamo con TC"). Así ambos sheets comparten la misma lógica de elegir
// a cuál préstamo abierto va el movimiento, o si arranca uno aparte.
function _resolverGrupoIdSel(prefix, d, fecha) {
  const wrap = document.getElementById(prefix + '_grupo_wrap');
  if (wrap && wrap.style.display !== 'none') {
    const sel = document.getElementById(prefix + '_grupo');
    const val = sel ? sel.value : '';
    if (val === '__nuevo__') {
      const nombreInput = document.getElementById(prefix + '_grupo_nombre');
      return _crearGrupoDeudor(d, fecha, nombreInput ? nombreInput.value : '').id;
    }
    if (val) return val;
  }
  const checkWrap = document.getElementById(prefix + '_grupo_check_wrap');
  const check = document.getElementById(prefix + '_grupo_check');
  if (checkWrap && checkWrap.style.display !== 'none' && check && check.checked) {
    const nombreInput = document.getElementById(prefix + '_grupo_nombre');
    return _crearGrupoDeudor(d, fecha, nombreInput ? nombreInput.value : '').id;
  }
  return _autoGrupoIdMov(d, fecha);
}

function renderDeudoresList() {
  const el = document.getElementById('deudoresList');
  // Ordenado de mayor a menor por lo que te deben: quien más te debe (saldo
  // positivo más alto) aparece primero. Saldo a favor de él/ella (negativo)
  // y al día (0) quedan después, en ese mismo orden descendente.
  const list = [...(S.deudores || [])].sort((a, b) => getDeudorSaldo(b) - getDeudorSaldo(a));
  if (typeof _actualizarMasPersonasSub === 'function') _actualizarMasPersonasSub();
  if (!list.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--text3);padding:4px 0 10px;">Aún no has agregado personas. Puedes crear a tu papá, mamá, amigos...</div>';
    return;
  }
  el.innerHTML = html`${list.map(d => {
    const saldo = getDeudorSaldo(d);
    const initials = d.nombre.substring(0, 2).toUpperCase();
    const ultimoMov = (d.movimientos || []).slice(-1)[0];
    const tienePerfil = !!d.personaId;
    return html`<div class="card card-sm" style="margin-bottom:8px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <button type="button" class="avatar" ${raw(Events.attr(tienePerfil ? 'prestado:abrirPerfilDeudor' : 'prestado:abrirDeudor', d.id))}
          style="color:${raw(d.color)};border-color:${raw(d.color)}33;background:${raw(d.color)}18;width:38px;height:38px;font-size:13px;margin-right:0;flex-shrink:0;border:1px solid;cursor:pointer;${raw(tienePerfil ? 'box-shadow:0 0 0 2px '+d.color+'33;' : '')}"
          title="${tienePerfil ? 'Ver perfil de '+d.nombre : d.nombre}">${initials}</button>
        <div style="flex:1;min-width:0;cursor:pointer;" ${raw(Events.attr('prestado:abrirDeudor', d.id))}>
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <div class="row-name">${d.nombre}</div>
            <div class="row-amount ${raw(saldo > 0 ? 'c-amber' : saldo < 0 ? 'c-red' : 'c-green')}">${fmt(saldo)}</div>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:3px;">
            <div class="row-sub">${saldo > 0 ? 'Pendiente por cobrar' : saldo < 0 ? 'Saldo a favor de él/ella' : 'Al día'}</div>
            ${ultimoMov ? html`<span style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;">${ultimoMov.fecha}</span>` : ''}
          </div>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2" stroke-linecap="round" style="flex-shrink:0;cursor:pointer;" ${raw(Events.attr('prestado:abrirDeudor', d.id))}><polyline points="9 18 15 12 9 6"/></svg>
      </div>
    </div>`;
  })}`;
}

function abrirDeudor(id) {
  deudorActualId = id;
  const d = (S.deudores || []).find(x => x.id === id);
  if (!d) return;
  // Migración silenciosa de deudores creados antes de que existieran los
  // grupos de préstamo — todo movimiento suelto cae en un grupo "Histórico".
  if (_migrarGruposDeudor(d)) save();
  const saldo = getDeudorSaldo(d);
  const totalPrestado = (d.movimientos || []).filter(m => m.tipo === 'prestamo').reduce((a, m) => a + m.monto, 0);
  const totalAbonado = (d.movimientos || []).filter(m => m.tipo === 'abono' || m.tipo === 'pago-completo').reduce((a, m) => a + m.monto, 0);

  document.getElementById('ddAvatar').textContent = d.nombre.substring(0, 2).toUpperCase();
  document.getElementById('ddAvatar').style.color = d.color;
  document.getElementById('ddAvatar').style.borderColor = d.color + '44';
  document.getElementById('ddAvatar').style.background = d.color + '20';
  document.getElementById('ddNombre').textContent = d.nombre;
  document.getElementById('ddSaldoLabel').textContent = saldo > 0 ? 'Te debe ' + fmt(saldo) : saldo < 0 ? 'Saldo a su favor: ' + fmt(-saldo) : 'Está al día';
  document.getElementById('ddSaldoLabel').style.color = saldo > 0 ? 'var(--amber)' : saldo < 0 ? 'var(--red)' : 'var(--accent)';
  document.getElementById('ddDebe').textContent = fmt(totalPrestado);
  document.getElementById('ddPago').textContent = fmt(totalAbonado);

  // Render historial
  const movs = [...(d.movimientos || [])].sort((a,b)=>{
    const fechaDiff = (b.fecha||'').localeCompare(a.fecha||'');
    if (fechaDiff !== 0) return fechaDiff;
    return (b.ts || 0) - (a.ts || 0);
  });
  const histEl = document.getElementById('ddHistorial');
  if (!movs.length) {
    histEl.innerHTML = '<div style="font-size:12px;color:var(--text3);padding:4px 0 8px;">Sin movimientos aún.</div>';
  } else {
    let saldoCorriente = saldo; // saldo de deuda ANTES de descontar la entry actual (al iterar desc, arranca en el saldo actual = saldo "después" del primer item)
    // Los movimientos se siguen recorriendo TODOS juntos y en orden cronológico
    // para que saldoAntes/saldoDespues reflejen el saldo real de la persona a
    // través del tiempo (igual que antes de los grupos). El agrupamiento por
    // grupoId es solo de presentación: cada card cae en el balde de su grupo.
    const _porGrupo = {}; // grupoId -> [cardHtml (fragmento html``), ...]
    movs.forEach(m => {
      const esPrestamo = m.tipo === 'prestamo';
      const esPagoCompleto = m.tipo === 'pago-completo';
      const efectoDeuda = esPrestamo ? +m.monto : -m.monto; // cuánto sumó/restó esta entry a la deuda
      const saldoDespuesDeuda = saldoCorriente;
      const saldoAntesDeuda = saldoCorriente - efectoDeuda;
      saldoCorriente = saldoAntesDeuda;
      // Destino info line
      const arrowSvg = raw(`<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`);
      let destinoInfo = '';
      if (m._viaEncargo && m._encNombre) {
        destinoInfo = html` <span style="background:rgba(96,176,240,.15);color:var(--blue);border:1px solid rgba(96,176,240,.3);border-radius:4px;padding:1px 5px;font-size:9px;font-family:'DM Mono',monospace;">encargo de ${m._encNombre}</span>`;
      } else if (m._viaAlcancia) {
        destinoInfo = html` <span style="background:rgba(240,184,64,.15);color:var(--amber);border:1px solid rgba(240,184,64,.3);border-radius:4px;padding:1px 5px;font-size:9px;font-family:'DM Mono',monospace;">→ Alcancía</span>`;
      } else if (m.destinos && m.destinos.length) {
        destinoInfo = html` ${arrowSvg} ${raw(m.destinos.map(r => _fuenteLabelHtml(r.fuente) + ' ' + fmt(r.monto)).join(' + '))}`;
      } else if (m.destino) {
        destinoInfo = html` ${arrowSvg} ${raw(_fuenteLabelHtml(m.destino))}`;
      }
      // Extra parts breakdown
      let extraHtml = '';
      if (!esPrestamo && m._extPartes && m._extPartes.length) {
        const extraTotal = m._extPartes.reduce((a,p)=>a+(p.monto||0),0);
        const partesTexto = m._extPartes.map(p => {
          if (p.tipo === 'guardar') return `${_fuenteLabelHtml(p.cuenta)} ${fmt(p.monto)}`;
          if (p.tipo === 'gastar') return `Gasto ${fmt(p.monto)}`;
          if (p.tipo === 'regalar') return `Regalo ${fmt(p.monto)}`;
          if (p.tipo === 'pendiente') return `Sin asignar ${fmt(p.monto)}`;
          return '';
        }).filter(Boolean).join(' · ');
        extraHtml = html`<div style="margin-top:5px;padding:5px 7px;background:rgba(96,176,240,.07);border:1px solid rgba(96,176,240,.2);border-radius:6px;font-size:10px;font-family:'DM Mono',monospace;color:var(--blue);">
          Extra ${fmt(extraTotal)}: ${raw(partesTexto)}
        </div>`;
      }
      // Origen y otras cuentas implicadas (para sheet de detalle)
      const origenDD = m._viaTC ? 'Tarjeta de crédito' : m._viaEncargo ? ('Encargos · ' + (m._encNombre||'')) : ('Préstamos · ' + d.nombre);
      let otrasCuentasDD = [];
      if (esPrestamo) {
        if (m.fuentes && m.fuentes.length) otrasCuentasDD = m.fuentes.map(f=>({fuente:f.fuente, monto:-f.monto}));
        else if (m.fuente) otrasCuentasDD = [{fuente:m.fuente, monto:-m.monto}];
      } else {
        if (m.destinos && m.destinos.length) otrasCuentasDD = m.destinos.map(r=>({fuente:r.fuente, monto:+r.monto}));
        else if (m.destino) otrasCuentasDD = [{fuente:m.destino, monto:+m.monto}];
      }
      const dataOtrasDD = otrasCuentasDD.length ? html`data-mov-otras="${JSON.stringify(otrasCuentasDD)}"` : '';
      const _cardHtml = html`<div class="card card-sm" style="margin-bottom:7px;cursor:pointer;" data-mov-id="${m.id}" data-mov-tipo="${m.tipo}" data-mov-monto="${Math.abs(m.monto)}" data-cuenta-key="deudor" data-mov-origen="${origenDD}" ${dataOtrasDD} data-mov-saldo-antes="${saldoAntesDeuda}" data-mov-saldo-despues="${saldoDespuesDeuda}" data-mov-saldo-label="Deuda de ${d.nombre}" data-mov-desc="${m.nota || (esPrestamo?'Préstamo': esPagoCompleto?'Pago completo':'Abono')}" data-mov-fecha="${m.fecha}" ${raw(Events.attr('prestado:abrirDetalleMov'))}>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <span class="badge ${esPrestamo ? 'bg-amber' : 'bg-green'}" style="font-size:9px;">${esPrestamo ? 'Préstamo' : esPagoCompleto ? 'Pago completo' : 'Abono'}</span>
              ${m._gananciaVirtual ? html` <span style="background:rgba(200,240,96,.15);color:var(--accent);border:1px solid rgba(200,240,96,.3);border-radius:4px;padding:1px 5px;font-size:9px;font-family:'DM Mono',monospace;"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block"><ellipse cx="12" cy="17" rx="8" ry="5"/><path d="M4 17v-4c0-2.76 3.58-5 8-5s8 2.24 8 5v4"/><path d="M4 13c0-2.76 3.58-5 8-5s8 2.24 8 5"/></svg> Incluye ${fmt(m._gananciaVirtual)} de ganancia</span>` : ''}
              ${m._viaTC ? html` <span style="background:rgba(96,176,240,.15);color:var(--blue);border:1px solid rgba(96,176,240,.3);border-radius:4px;padding:1px 5px;font-size:9px;font-family:'DM Mono',monospace;">TC${m._tcId ? ' · ' + ((S.tarjetasCredito||[]).find(t=>t.id===m._tcId)||{nombre:''}).nombre : ''}</span>` : ''}
              ${m.nota ? html` <span style="font-size:11px;color:var(--text2);">${m.nota}</span>` : ''}
            </div>
            <div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;margin-top:3px;">${m.fecha}${m._viaTC ? '' : raw(m.fuentes ? ' · ' + m.fuentes.map(f=>_fuenteLabelHtml(f.fuente)+' '+fmt(f.monto)).join(' + ') : (m.fuente ? ' · ' + _fuenteLabelHtml(m.fuente) : ''))}${destinoInfo}</div>
            ${extraHtml}
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
            <div style="font-size:14px;font-weight:500;font-family:'DM Mono',monospace;color:${esPrestamo ? 'var(--amber)' : 'var(--accent)'};">${esPrestamo ? '+' : '−'} ${fmt(m.monto)}</div>
            <button type="button" class="btn-icon" style="color:var(--text3);min-width:36px;min-height:36px;" ${raw(Events.attr('prestado:eliminarMovDeudor', id, m.id))} data-stop-propagation="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
          </div>
        </div>
      </div>`;
      const _gid = m.grupoId || '_historico';
      (_porGrupo[_gid] = _porGrupo[_gid] || []).push(_cardHtml);
    });

    // Orden de secciones: grupos abiertos primero (más nuevo primero),
    // luego cerrados. Si por alguna razón un grupoId no está en d.grupos
    // (dato corrupto), se muestra igual como sección suelta al final.
    const gruposOrdenados = [...(d.grupos || [])].sort((a, b) => {
      if (!!a.cerrado !== !!b.cerrado) return a.cerrado ? 1 : -1;
      return (b.creadoEn || '').localeCompare(a.creadoEn || '');
    });
    const idsConocidos = new Set(gruposOrdenados.map(g => g.id));
    Object.keys(_porGrupo).forEach(gid => { if (!idsConocidos.has(gid)) gruposOrdenados.push({ id: gid, nombre: 'Otros', cerrado: false }); });

    const soloUnGrupo = gruposOrdenados.filter(g => _porGrupo[g.id]).length <= 1;
    histEl.innerHTML = html`${gruposOrdenados.filter(g => _porGrupo[g.id]).map(g => {
      const cards = _porGrupo[g.id]; // array de fragmentos html`` ya escapados — html`` externo los concatena sin re-escapar
      const saldoGrupo = getGrupoSaldo(d, g.id);
      const saldoTxt = saldoGrupo > 0 ? fmt(saldoGrupo) + ' pendiente' : saldoGrupo < 0 ? 'a favor ' + fmt(-saldoGrupo) : 'al día';
      if (soloUnGrupo) {
        // Un solo grupo: no vale la pena el acordeón, se ve como el historial plano de siempre.
        return cards;
      }
      return html`<details class="card card-sm" style="margin-bottom:9px;padding:0;overflow:hidden;" ${raw(g.cerrado ? '' : 'open')}>
        <summary style="cursor:pointer;padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:8px;list-style:none;">
          <span style="display:flex;align-items:center;gap:6px;min-width:0;">
            <span style="font-size:12px;font-weight:500;color:var(--text1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${g.nombre}</span>
            ${g.cerrado ? html` <span class="badge" style="font-size:9px;opacity:.6;">Cerrado</span>` : ''}
          </span>
          <span style="font-size:11px;font-family:'DM Mono',monospace;color:${raw(saldoGrupo > 0 ? 'var(--amber)' : saldoGrupo < 0 ? 'var(--red)' : 'var(--text3)')};flex-shrink:0;">${saldoTxt}</span>
        </summary>
        <div style="padding:0 10px 10px;">${cards}</div>
      </details>`;
    })}`;
  }

  // Mostrar detalle, ocultar lista y las pestañas Me deben/Yo debo (no
  // tiene sentido cambiar de pestaña estando adentro del detalle de alguien).
  document.getElementById('deudoresView').style.display = 'none';
  document.getElementById('deudorDetalle').style.display = 'block';
  const _pt1 = document.getElementById('prestamos-tabs');
  if (_pt1) _pt1.style.display = 'none';
  document.getElementById('scrollArea').scrollTop = 0;

  // Mostrar chip "Ver perfil" si tiene personaId
  const chip = document.getElementById('dd-perfil-chip');
  if (chip) chip.style.display = d.personaId ? '' : 'none';
}

// Abre el perfil de un deudor; si aún no tiene personaId crea/vincula uno automáticamente
function _abrirPerfilDesdeDeudor(deudorId) {
  if (!deudorId) return;
  const d = (S.deudores || []).find(x => x.id === deudorId);
  if (!d) return;
  _inyectarPersonaSheets();
  if (d.personaId) {
    abrirPerfilPersona(d.personaId);
    return;
  }
  // Crear persona vinculada
  if (!S.personas) S.personas = [];
  let p = S.personas.find(x => x.nombre.trim().toLowerCase() === d.nombre.trim().toLowerCase());
  if (!p) {
    p = { id: uid(), nombre: d.nombre, color: d.color || '#60b0f0', creadoEn: hoy() };
    S.personas.push(p);
  }
  d.personaId = p.id;
  save();
  abrirPerfilPersona(p.id);
}

function volverDeudores() {
  deudorActualId = null;
  document.getElementById('deudoresView').style.display = '';
  document.getElementById('deudorDetalle').style.display = 'none';
  const _pt2 = document.getElementById('prestamos-tabs');
  // Ojo: 'flex' explícito, no ''. #prestamos-tabs trae display:flex inline
  // en el HTML (para poner los botones lado a lado); al ocultarlo con
  // 'none' se sobreescribe ese inline style, y volver a '' no lo restaura
  // — cae al display:block por defecto del div y los botones quedan
  // apilados verticalmente en vez de en fila.
  if (_pt2) _pt2.style.display = 'flex';
}

async function eliminarDeudorActual() {
  if (!deudorActualId) return;
  const d = (S.deudores || []).find(x => x.id === deudorActualId);
  if (!d) return;
  const ok = await dialogo('Eliminar persona', `¿Eliminar a ${escHtml(d.nombre)} y todo su historial? Esta acción no se puede deshacer.`, 'Eliminar', true);
  if (!ok) return;
  S.deudores = (S.deudores || []).filter(x => x.id !== deudorActualId);
  save(); refresh(); volverDeudores();
  toast(`${escHtml(d.nombre)} eliminado`, 'ok');
}

// Alcancía es un grupo de carga diferida (Loader.GROUPS.alcancia, ver
// alcancia.md) — solo se descarga la primera vez que el usuario entra a esa
// pantalla en la sesión. Un abono registrado con "Guardar en la alcancía →
// cobro de deuda" puede borrarse desde Prestado sin haber visitado nunca
// Alcancía, así que hay que asegurar la carga antes de poder revertir su
// mitad del depósito (mismo patrón que _spEnsureTC() en spotify.js).
async function _prEnsureAlcancia() {
  if (typeof window._alcanciaQuitarPorCobroDeuda === 'function') return true;
  if (typeof Loader === 'undefined' || typeof Loader.ensure !== 'function') return false;
  try {
    await Loader.ensure('alcancia');
    return typeof window._alcanciaQuitarPorCobroDeuda === 'function';
  } catch (e) {
    return false;
  }
}

async function eliminarMovDeudor(deudorId, movId) {
  const d = (S.deudores || []).find(x => x.id === deudorId);
  if (!d) return;
  const m = (d.movimientos || []).find(x => x.id === movId);
  if (!m) return;

  // Protección por antigüedad — ver docs/proteccion-antiguedad-movimientos.md.
  // Este mismo movimiento también se puede borrar desde la vista de cuenta
  // genérica (rama 'prestamo'/'abono' de eliminarMovimiento() en
  // movimientos.js), que aplica la misma protección por su cuenta.
  // Solo aplica si _deudorTieneCuentaAfectada(m) — un préstamo/abono 100%
  // "Sin especificar"/"Ganancia" no revierte ningún saldo real, así que no
  // hay nada que proteger.
  let nivel = 'reciente';
  if (_deudorTieneCuentaAfectada(m)) {
    const opsPosteriores = _deudorOpsPosteriores(d, m);
    nivel = nivelAntiguedadMovimiento(m.fecha, opsPosteriores, 'prestamos');
    if (nivel === 'bloqueado') {
      await avisarMovimientoBloqueado();
      return;
    }
  }
  const esPrestamo = m.tipo === 'prestamo';
  const label = esPrestamo ? 'préstamo' : 'pago';
  const tieneExtra = !esPrestamo && m._extPartes && m._extPartes.length > 0;
  const tieneExtraEncargo = !esPrestamo && m._viaEncargo && m._encExtraMovId;
  const extraAviso = tieneExtra
    ? (tieneExtraEncargo
        ? ' El extra (que también salió del encargo) y sus destinos se revertirán.'
        : ' El extra (cajitas, gastos, etc.) también se revertirá.')
    : '';
  const tcAviso = esPrestamo && m._viaTC ? ' La deuda en la TC también se revertirá automáticamente.' : '';
  const antiguedadAviso = nivel === 'viejo' ? ' Este movimiento ya tiene tiempo y puede estar mezclado con operaciones más recientes de esa cuenta — revisa bien antes de confirmar.' : '';
  // Mostrar explícitamente cómo va a cambiar la deuda de la persona, para poder
  // detectar a tiempo si el número resultante no cuadra con lo esperado.
  const _saldoAntesDel = getDeudorSaldo(d);
  const _deltaEsperadoDel = esPrestamo ? -m.monto : m.monto;
  const _saldoTrasDel = _saldoAntesDel + _deltaEsperadoDel;
  const cuentaAviso = m._viaAlcancia
    ? 'el depósito correspondiente en la Alcancía'
    : (esPrestamo ? (m._viaTC ? 'la TC' : 'la cuenta origen') : 'la cuenta destino');
  const ok = await dialogo(
    'Eliminar ' + label,
    `¿Eliminar este ${label} de ${fmt(m.monto)}? El saldo de ${cuentaAviso} se revertirá automáticamente. La deuda de ${escHtml(d.nombre)} pasará de ${fmt(_saldoAntesDel)} a ${fmt(_saldoTrasDel)}.${extraAviso}${tcAviso}${antiguedadAviso}`,
    'Eliminar', true
  );
  if (!ok) return;

  // Abono guardado directo en la Alcancía (ver alcancia.md): su único rastro
  // fuera de este deudor vive en S.alcancia.movimientos[], no en ninguna
  // cuenta real — hay que revertir ese lado antes de tocar d.movimientos.
  // Se aborta si Alcancía no carga, para no dejar el borrado a medias
  // (mismo criterio que tcEliminarCompraInterna/getMesadaData en movimientos.js).
  if (m._viaAlcancia && m._alcanciaMovId) {
    const alcOk = await _prEnsureAlcancia();
    if (!alcOk) {
      toast('No se pudo cargar Alcancía para revertir el depósito — intenta de nuevo', 'err', 4000);
      return;
    }
    window._alcanciaQuitarPorCobroDeuda(m._alcanciaMovId);
  }

  // Revertir efecto en las cuentas
  if (esPrestamo) {
    // Era un préstamo: plata salió de la(s) fuente(s) → devolver
    if (m._viaTC) {
      // Préstamo vía TC: revertir la deuda de la TC y limpiar tcMovimientos
      const tc = (S.tarjetasCredito || []).find(t => t.id === m._tcId);
      if (tc) tc.deuda = Math.max(0, (tc.deuda || 0) - (m._tcMonto || m.monto));
      if (S.tcMovimientos) S.tcMovimientos = S.tcMovimientos.filter(x => x._deudorMovId !== m.id);
    } else if (m.fuentes && m.fuentes.length) {
      m.fuentes.forEach(f => { if (f.fuente) sumarFuente(f.fuente, f.monto); });
    } else if (m.fuente) {
      sumarFuente(m.fuente, m.monto);
    }
  } else {
    // Era un abono: plata entró al destino → quitar
    if (m._viaEncargo && m._encId && m._encMovId) {
      // Abono vía encargo: revertir la salida del encargo (abono principal y extra si hubo).
      // Si el abono salió de varias cuentas del encargo (_encMovIds), hay que
      // eliminar TODAS esas salidas, no solo la primera.
      const enc = (S.encargos || []).find(e => e.id === m._encId);
      if (enc) {
        const idsAEliminar = (m._encMovIds && m._encMovIds.length) ? m._encMovIds : [m._encMovId];
        enc.movimientos = (enc.movimientos || []).filter(x => !idsAEliminar.includes(x.id));
        // Si el abono tenía extra, también eliminar su salida del encargo
        if (m._encExtraMovId) {
          enc.movimientos = (enc.movimientos || []).filter(x => x.id !== m._encExtraMovId);
        }
      }
      // Revertir el saldo de la cuenta destino del abono y su movimiento de historial
      if (m.destino) {
        // Verificar si el movimiento en cuenta destino aún existe antes de descontar
        // (protege contra doble descuento si el movimiento ya fue eliminado de alguna forma)
        let movDestinoExiste = false;
        if (m._abonoDestinoMovId) {
          if (m.destino === 'efectivo' || m.destino === 'nequi') {
            movDestinoExiste = !!(S.movimientos || []).find(x => x.id === m._abonoDestinoMovId);
            if (movDestinoExiste) S.movimientos = S.movimientos.filter(x => x.id !== m._abonoDestinoMovId);
          } else if (m.destino.startsWith('custom:')) {
            const cId = m.destino.split(':')[1];
            const cObj = (S.cuentasPersonalizadas || []).find(x => x.id === cId);
            if (cObj && cObj.movimientos) {
              movDestinoExiste = !!(cObj.movimientos.find(x => x.id === m._abonoDestinoMovId));
              if (movDestinoExiste) cObj.movimientos = cObj.movimientos.filter(x => x.id !== m._abonoDestinoMovId);
            }
          } else if (m.destino.startsWith('cajita:')) {
            const cId = m.destino.split(':')[1];
            const cObj = (S.cajitas || []).find(x => x.id === cId);
            if (cObj && cObj.historial) {
              movDestinoExiste = !!(cObj.historial.find(x => x.id === m._abonoDestinoMovId));
              if (movDestinoExiste) cObj.historial = cObj.historial.filter(x => x.id !== m._abonoDestinoMovId);
            }
          }
        } else {
          // Sin _abonoDestinoMovId (abono antiguo sin el mov registrado): igual descontamos
          movDestinoExiste = true;
        }
        if (movDestinoExiste) descontarFuente(m.destino, m.monto);
      } else if (m.destinos && m.destinos.length) {
        m.destinos.forEach(r => { if (r.fuente) descontarFuente(r.fuente, r.monto); });
      }
    } else if (m.destinos && m.destinos.length) {
      m.destinos.forEach(r => {
        if (!r.fuente) return;
        let movDestinoExiste = true;
        if (r._movId) {
          movDestinoExiste = false;
          if (r.fuente === 'efectivo' || r.fuente === 'nequi') {
            movDestinoExiste = !!(S.movimientos || []).find(x => x.id === r._movId);
            if (movDestinoExiste) S.movimientos = S.movimientos.filter(x => x.id !== r._movId);
          } else if (r.fuente.startsWith('custom:')) {
            const cId = r.fuente.split(':')[1];
            const cObj = (S.cuentasPersonalizadas || []).find(x => x.id === cId);
            if (cObj && cObj.movimientos) {
              movDestinoExiste = !!(cObj.movimientos.find(x => x.id === r._movId));
              if (movDestinoExiste) cObj.movimientos = cObj.movimientos.filter(x => x.id !== r._movId);
            }
          } else if (r.fuente.startsWith('cajita:')) {
            const cId = r.fuente.split(':')[1];
            const cObj = (S.cajitas || []).find(x => x.id === cId);
            if (cObj && cObj.historial) {
              movDestinoExiste = !!(cObj.historial.find(x => x.id === r._movId));
              if (movDestinoExiste) cObj.historial = cObj.historial.filter(x => x.id !== r._movId);
            }
          }
        }
        if (movDestinoExiste) descontarFuente(r.fuente, r.monto);
      });
    } else if (m.destino) {
      let movDestinoExiste = true;
      if (m._abonoDestinoMovId) {
        movDestinoExiste = false;
        if (m.destino === 'efectivo' || m.destino === 'nequi') {
          movDestinoExiste = !!(S.movimientos || []).find(x => x.id === m._abonoDestinoMovId);
          if (movDestinoExiste) S.movimientos = S.movimientos.filter(x => x.id !== m._abonoDestinoMovId);
        } else if (m.destino.startsWith('custom:')) {
          const cId = m.destino.split(':')[1];
          const cObj = (S.cuentasPersonalizadas || []).find(x => x.id === cId);
          if (cObj && cObj.movimientos) {
            movDestinoExiste = !!(cObj.movimientos.find(x => x.id === m._abonoDestinoMovId));
            if (movDestinoExiste) cObj.movimientos = cObj.movimientos.filter(x => x.id !== m._abonoDestinoMovId);
          }
        } else if (m.destino.startsWith('cajita:')) {
          const cId = m.destino.split(':')[1];
          const cObj = (S.cajitas || []).find(x => x.id === cId);
          if (cObj && cObj.historial) {
            movDestinoExiste = !!(cObj.historial.find(x => x.id === m._abonoDestinoMovId));
            if (movDestinoExiste) cObj.historial = cObj.historial.filter(x => x.id !== m._abonoDestinoMovId);
          }
        }
      }
      if (movDestinoExiste) descontarFuente(m.destino, m.monto);
    }

    // Revertir el extra si lo tenía
    if (m._extPartes && m._extPartes.length) {
      for (const p of m._extPartes) {
        if (p.tipo === 'guardar' && p.cuenta) {
          // Quitar el saldo que se sumó
          descontarFuente(p.cuenta, p.monto);
          // Eliminar el movimiento de historial asociado
          if (p.movExtraId) {
            if (p.cuenta === 'efectivo' || p.cuenta === 'nequi') {
              if (S.movimientos) S.movimientos = S.movimientos.filter(x => x.id !== p.movExtraId);
            } else if (p.cuenta.startsWith('custom:')) {
              const cId = p.cuenta.split(':')[1];
              const cObj = (S.cuentasPersonalizadas || []).find(x => x.id === cId);
              if (cObj && cObj.movimientos) cObj.movimientos = cObj.movimientos.filter(x => x.id !== p.movExtraId);
            } else if (p.cuenta.startsWith('cajita:')) {
              const cId = p.cuenta.split(':')[1];
              const cObj = (S.cajitas || []).find(x => x.id === cId);
              if (cObj && cObj.historial) cObj.historial = cObj.historial.filter(x => x.id !== p.movExtraId);
            }
          }
        } else if (p.tipo === 'gastar' && p.gastoId) {
          if (S.gastosVar) S.gastosVar = S.gastosVar.filter(x => x.id !== p.gastoId);
        } else if (p.tipo === 'pendiente' && p.ingrId) {
          if (S.ingresosExtra) S.ingresosExtra = S.ingresosExtra.filter(x => x.id !== p.ingrId);
        }
      }
    }
  }

  d.movimientos = (d.movimientos || []).filter(x => x.id !== movId);
  _autoCerrarGruposEnCero(d); // el grupo pudo saldarse (o reabrirse) al borrar este movimiento
  _verificarIntegridadSaldoDeudor(d, _saldoAntesDel, _deltaEsperadoDel);
  save(); refresh();
  abrirDeudor(deudorId);
  toast(`${esPrestamo ? 'Préstamo' : 'Abono'} eliminado — saldo revertido`, 'ok');
}

function initMovSheet(tipo) {
  // Preservar 'pago-completo' para distinguirlo de un abono normal
  movTipo = tipo; // 'prestamo' | 'abono' | 'pago-completo'
  poblarFuente('mov_fuente');
  poblarFuente('mov_destino');
  // ext selects se pueblan dinámicamente en extRenderPartes()
  const esPrestamo = tipo === 'prestamo';
  const esPagoCompleto = tipo === 'pago-completo';
  const esAbono = tipo === 'abono' || esPagoCompleto;
  document.getElementById('movSheetTitle').textContent = esPrestamo ? 'Nuevo préstamo' : esPagoCompleto ? 'Pagar préstamo completo' : 'Registrar abono';
  document.getElementById('movBtnConfirm').textContent = esPrestamo ? 'Guardar préstamo' : esPagoCompleto ? 'Confirmar pago total' : 'Guardar abono';
  document.getElementById('movBtnConfirm').style.background = esPrestamo ? 'var(--accent)' : esPagoCompleto ? 'rgba(240,184,64,.2)' : 'rgba(200,240,96,.2)';
  document.getElementById('movBtnConfirm').style.color = esPrestamo ? '#0a0a0a' : esPagoCompleto ? 'var(--amber)' : 'var(--accent)';
  document.getElementById('movBtnConfirm').style.border = esPrestamo ? 'none' : esPagoCompleto ? '1px solid rgba(240,184,64,.4)' : '1px solid rgba(200,240,96,.4)';
  document.getElementById('movBtnConfirm').style.boxShadow = esPrestamo ? '0 2px 14px rgba(200,240,96,.25)' : 'none';
  document.getElementById('mov_fuente_wrap').style.display = esPrestamo ? '' : 'none';
  document.getElementById('mov_destino_wrap').style.display = esAbono ? '' : 'none';
  document.getElementById('mov_extra_wrap').style.display = esAbono ? '' : 'none';
  document.getElementById('mov_monto').value = '';
  const montoInput = document.getElementById('mov_monto');
  if (esPagoCompleto) {
    montoInput.readOnly = true;
    montoInput.style.opacity = '0.6';
    montoInput.style.cursor = 'default';
  } else {
    montoInput.readOnly = false;
    montoInput.style.opacity = '';
    montoInput.style.cursor = '';
  }
  document.getElementById('mov_fecha').value = hoy();
  document.getElementById('mov_nota').value = '';
  const hint = document.getElementById('mov_fuente_hint');
  if (hint) hint.style.display = 'none';
  const dhint = document.getElementById('mov_destino_hint');
  if (dhint) dhint.style.display = 'none';
  // Reset split préstamo fuente
  _prestSplitMode = false;
  _prestSplitRows = [];
  document.getElementById('mov_fuente_simple').style.display = '';
  document.getElementById('mov_fuente_split').style.display = 'none';
  { const btn = document.getElementById('mov_split_toggle');
    if (btn) { btn.textContent = 'Dividir ÷'; btn.style.background = 'rgba(200,240,96,.1)'; btn.style.borderColor = 'rgba(200,240,96,.3)'; btn.style.color = 'var(--accent)'; } }
  document.getElementById('mov_split_rows').innerHTML = '';
  document.getElementById('mov_split_resumen').textContent = '';
  if(document.getElementById('mov_split_metas')) document.getElementById('mov_split_metas').innerHTML = '';
  // Reset split abono destino
  _abonoSplitMode = false;
  document.getElementById('mov_destino_simple').style.display = '';
  document.getElementById('mov_destino_split').style.display = 'none';
  { const b = document.getElementById('mov_dest_split_toggle');
    if (b) { b.textContent = 'Dividir ÷'; b.style.background = 'rgba(200,240,96,.1)'; b.style.borderColor = 'rgba(200,240,96,.3)'; b.style.color = 'var(--accent)'; } }
  document.getElementById('mov_dest_split_rows').innerHTML = '';
  document.getElementById('mov_dest_split_resumen').textContent = '';
  // Reset extra (sistema de partes libres)
  _extPartes = [];
  document.getElementById('mov_tiene_extra').checked = false;
  document.getElementById('mov_extra_body').style.display = 'none';
  document.getElementById('mov_extra_monto').value = '';
  const extList = document.getElementById('ext_partes_list');
  if (extList) extList.innerHTML = '';
  const extRes = document.getElementById('ext_partes_resumen');
  if (extRes) extRes.innerHTML = '';
  // Reset desde-encargo
  _abonoDesdeEncargo = false;
  _abonoEncId = '';
  _abonoEncCuenta = '';
  _abonoEncCuentaSplitMode = false;
  const encCuentaSimpleReset = document.getElementById('mov_enc_cuenta_simple');
  const encCuentaSplitReset  = document.getElementById('mov_enc_cuenta_split');
  const encCuentaSplitRowsReset = document.getElementById('mov_enc_cuenta_split_rows');
  if (encCuentaSimpleReset) encCuentaSimpleReset.style.display = '';
  if (encCuentaSplitReset)  encCuentaSplitReset.style.display = 'none';
  if (encCuentaSplitRowsReset) encCuentaSplitRowsReset.innerHTML = '';
  _resetEncCuentaSplitToggleStyle();
  const encWrap = document.getElementById('mov_enc_wrap');
  const encChk  = document.getElementById('mov_desde_encargo');
  const encBody = document.getElementById('mov_enc_body');
  const encSel  = document.getElementById('mov_enc_sel');
  const encCuentaWrap = document.getElementById('mov_enc_cuenta_wrap');
  const encPreview    = document.getElementById('mov_enc_saldo_preview');
  // Solo tiene sentido ofrecer "¿Viene de un encargo?" si la persona vinculada
  // a este deudor tiene al menos un encargo con saldo disponible.
  let _tieneEncargoVinculado = false;
  if (esAbono) {
    const d = (S.deudores || []).find(x => x.id === deudorActualId);
    if (d && d.personaId) {
      _tieneEncargoVinculado = (S.encargos || []).some(e => e.personaId === d.personaId && encargoLibre(e) > 0);
    }
  }
  if (encWrap)      encWrap.style.display = (esAbono && _tieneEncargoVinculado) ? '' : 'none';
  if (encChk)       encChk.checked = false;
  if (encBody)      encBody.style.display = 'none';
  if (encCuentaWrap) encCuentaWrap.style.display = 'none';
  if (encPreview)   encPreview.textContent = '';
  if (encSel)       encSel.innerHTML = '<option value="">Seleccionar encargo</option>';
  // ── Selector de grupo de préstamo ──────────────────────────────────
  // Solo se muestra cuando de verdad hay ambigüedad (≥2 grupos abiertos
  // con esta persona). Con 0 o 1 grupo abierto no se pregunta nada — se
  // resuelve solo en confirmarMovimiento() vía _resolverGrupoIdMov.
  _initMovGrupoSelector();
}

function _initMovGrupoSelector() {
  _initGrupoSelector('mov', movTipo === 'prestamo');
}

// Versión genérica de _initMovGrupoSelector, parametrizada por el prefijo de
// los ids en el DOM. `esPrestamoNuevo` indica si el movimiento que se está
// creando en este sheet es siempre/puede-ser un préstamo (y por tanto tiene
// sentido ofrecer el checkbox "préstamo aparte" cuando hay 1 solo abierto).
function _initGrupoSelector(prefix, esPrestamoNuevo) {
  const wrap = document.getElementById(prefix + '_grupo_wrap');
  if (!wrap) return; // sheet aún no tiene el markup — no romper si falta
  const nombreWrap = document.getElementById(prefix + '_grupo_nombre_wrap');
  const sel = document.getElementById(prefix + '_grupo');
  const nombreInput = document.getElementById(prefix + '_grupo_nombre');
  const checkWrap = document.getElementById(prefix + '_grupo_check_wrap');
  const check = document.getElementById(prefix + '_grupo_check');
  const d = (S.deudores || []).find(x => x.id === deudorActualId);
  const abiertos = d ? _gruposAbiertos(d) : [];

  if (check) check.checked = false;
  if (nombreInput) nombreInput.value = '';
  if (nombreWrap) nombreWrap.style.display = 'none';

  if (d && abiertos.length >= 2) {
    // Ambigüedad real: hay que elegir a cuál de los préstamos abiertos
    // corresponde este movimiento (o arrancar uno nuevo).
    wrap.style.display = '';
    if (checkWrap) checkWrap.style.display = 'none';
    if (sel) {
      sel.innerHTML = html`${abiertos.map(g => html`<option value="${g.id}">${g.nombre} (${fmt(getGrupoSaldo(d, g.id))})</option>`)}<option value="__nuevo__">🆕 Es un préstamo nuevo</option>`;
      sel.value = abiertos[0].id; // por defecto, el grupo abierto más reciente
      sel.onchange = () => {
        if (nombreWrap) nombreWrap.style.display = sel.value === '__nuevo__' ? '' : 'none';
      };
    }
    return;
  }

  wrap.style.display = 'none';
  // Caso normal (0 o 1 grupo abierto): nada que preguntar en un abono —
  // solo puede ir al único grupo abierto (o no hay a dónde ir todavía).
  // Pero para un PRÉSTAMO nuevo sí puede ser el arranque de un préstamo
  // aparte (ej. "papá ya me debía uno viejo, este es de la moto") — sin
  // este checkbox nunca se podría llegar a tener 2 grupos abiertos, porque
  // con 1 solo abierto todo se fusionaría ahí automáticamente. Solo tiene
  // sentido ofrecerlo si ya existe al menos un grupo (si es el primer
  // préstamo de la persona, no hay nada de qué separarlo).
  const mostrarCheck = d && esPrestamoNuevo && abiertos.length === 1;
  if (checkWrap) {
    checkWrap.style.display = mostrarCheck ? '' : 'none';
    if (mostrarCheck && check) {
      check.onchange = () => {
        if (nombreWrap) nombreWrap.style.display = check.checked ? '' : 'none';
      };
    }
  }
}

function confirmarMovimiento() {
  const monto = parseMoney(document.getElementById('mov_monto').value) || 0;
  // Validación con foco+mensaje inline (antes vivía en un override aparte).
  if (!monto) { _markError('mov_monto', 'mov_monto_err', 'Ingresa un monto mayor a 0'); return; }
  if (!deudorActualId) { toast('Error: no hay persona seleccionada', 'err'); return; }
  const d = (S.deudores || []).find(x => x.id === deudorActualId);
  if (!d) return;
  const fecha = document.getElementById('mov_fecha').value || hoy();
  const nota  = document.getElementById('mov_nota').value.trim();
  // Saldo justo antes de tocar d.movimientos, para poder verificar al final
  // que el cambio real coincidió con el esperado (ver _verificarIntegridadSaldoDeudor).
  const _saldoAntesMov = getDeudorSaldo(d);
  const _deltaEsperadoMov = movTipo === 'prestamo' ? monto : -monto;
  // A qué grupo de préstamo pertenece este movimiento — ver _resolverGrupoIdMov.
  const _grupoIdMov = _resolverGrupoIdMov(d, fecha);

  if (movTipo === 'prestamo') {
    if (_prestSplitMode) {
      const totalSplit = _prestSplitRows.reduce((a,r)=>a+(r.monto||0),0);
      if(Math.abs(totalSplit - monto) > 1){
        toast(`La suma de las fuentes (${fmt(totalSplit)}) no coincide con el monto (${fmt(monto)})`,'err',4000);
        return;
      }
      const fuentes = _prestSplitRows.filter(r=>r.monto>0);
      fuentes.forEach(r=>{ if(r.fuente) descontarFuente(r.fuente, r.monto); });
      const _gananciaVirtual = fuentes.filter(r=>r.fuente==='ganancia').reduce((a,r)=>a+r.monto,0);
      d.movimientos.push({ id: uid(), tipo: 'prestamo', monto, fecha, fuentes: fuentes.map(r=>({fuente:r.fuente,monto:r.monto})), nota, _gananciaVirtual: _gananciaVirtual||undefined, grupoId: _grupoIdMov, ts: Date.now() });
    } else {
      const fuente = document.getElementById('mov_fuente').value;
      d.movimientos.push({ id: uid(), tipo: 'prestamo', monto, fecha, fuente, nota, grupoId: _grupoIdMov, ts: Date.now() });
      descontarFuente(fuente, monto);
    }

  } else {
    // ── ABONO ──

    // ── Rama: viene de un encargo ──────────────────────────────────
    if (_abonoDesdeEncargo) {
      if (!_abonoEncId) { toast('Selecciona un encargo', 'err'); return; }
      const enc = (S.encargos || []).find(e => e.id === _abonoEncId);
      if (!enc) { toast('Encargo no encontrado', 'err'); return; }

      const saldoTotal = encargoLibre(enc);
      if (monto > saldoTotal + 0.5) {
        toast(`El encargo solo tiene ${fmt(saldoTotal)} disponible (el resto ya está comprometido)`, 'err'); return;
      }

      // ── ¿La plata del encargo sale de VARIAS cuentas a la vez? ──────────
      let _abonoEncCuentaSplits = null;
      if (_abonoEncCuentaSplitMode) {
        const splits = _getAbonoEncCuentaSplitData().filter(s => s.fuente && s.monto > 0);
        if (!splits.length) { toast('Agrega al menos una cuenta del encargo con monto', 'err'); return; }
        const totalSplit = splits.reduce((a, s) => a + s.monto, 0);
        if (Math.abs(totalSplit - monto) > 1) {
          toast(`La suma de las cuentas del encargo (${fmt(totalSplit)}) no coincide con el pago (${fmt(monto)})`, 'err', 4000);
          return;
        }
        // Sumar por cuenta (por si repitió la misma cuenta en dos filas) y validar saldo
        const porCuenta = {};
        splits.forEach(s => { porCuenta[s.fuente] = (porCuenta[s.fuente] || 0) + s.monto; });
        for (const cuenta in porCuenta) {
          const saldoEnCuenta = _getEncargoSaldoEnCuenta(enc, cuenta);
          if (porCuenta[cuenta] > saldoEnCuenta + 0.5) {
            toast(`En ${_fuenteLabelHtml(cuenta)} solo hay ${fmt(saldoEnCuenta)} de este encargo`, 'err'); return;
          }
        }
        _abonoEncCuentaSplits = Object.entries(porCuenta).map(([fuente, monto]) => ({ fuente, monto }));
      } else if (_abonoEncCuenta) {
        const _esSinEspVal = _abonoEncCuenta === '__sinesp__';
        const saldoEnCuenta = _esSinEspVal ? _getEncargoSaldoSinCuenta(enc) : _getEncargoSaldoEnCuenta(enc, _abonoEncCuenta);
        if (monto > saldoEnCuenta + 0.5) {
          toast(`En ${_esSinEspVal ? 'la parte sin especificar' : _fuenteLabelHtml(_abonoEncCuenta)} solo hay ${fmt(saldoEnCuenta)} de este encargo`, 'err'); return;
        }
      }

      // Verificar si hay extra y si el encargo tiene saldo suficiente para cubrirlo también
      // IMPORTANTE: todas las validaciones deben ocurrir ANTES de escribir datos
      const tieneExtra = document.getElementById('mov_tiene_extra').checked;
      const extraMonto = tieneExtra ? (parseMoney(document.getElementById('mov_extra_monto').value) || 0) : 0;
      if (tieneExtra && extraMonto > 0) {
        // Validar reparto del extra antes de tocar el encargo
        if (!_extPartes.length) { toast('Agrega al menos una parte para el extra', 'err'); return; }
        const totalPartesPreview = _extPartes.reduce((a,p)=>a+(p.monto||0),0);
        if (Math.abs(totalPartesPreview - extraMonto) > 1) {
          toast(`Falta asignar ${fmt(extraMonto - totalPartesPreview)} del extra antes de continuar.`, 'err', 4000);
          return;
        }
        // Validar saldo del encargo para abono + extra (usando saldo antes de cualquier escritura)
        if (monto + extraMonto > saldoTotal + 0.5) {
          toast(`El encargo solo tiene ${fmt(saldoTotal)} disponible — no alcanza para el abono (${fmt(monto)}) más el extra (${fmt(extraMonto)})`, 'err', 4500);
          return;
        }
        if (_abonoEncCuenta) {
          const _esSinEspVal2 = _abonoEncCuenta === '__sinesp__';
          const saldoEnCuenta2 = _esSinEspVal2 ? _getEncargoSaldoSinCuenta(enc) : _getEncargoSaldoEnCuenta(enc, _abonoEncCuenta);
          if (monto + extraMonto > saldoEnCuenta2 + 0.5) {
            toast(`En ${_esSinEspVal2 ? 'la parte sin especificar' : _fuenteLabelHtml(_abonoEncCuenta)} solo hay ${fmt(saldoEnCuenta2)} — no alcanza para abono + extra`, 'err', 4500);
            return;
          }
        }
      }
      // Validar split destino antes de escribir datos
      if (_abonoSplitMode) {
        const totalSplitPre = _getAbonoDestinoSplitData().reduce((a,r)=>a+(r.monto||0),0);
        if(Math.abs(totalSplitPre - monto) > 1){
          toast(`La suma de cuentas (${fmt(totalSplitPre)}) no coincide con el abono (${fmt(monto)})`,'err',4000);
          return;
        }
      }

      // 1. Registrar salida del abono en el encargo (descuenta su saldo).
      // Si sale de varias cuentas del encargo a la vez, se registra un
      // movimiento de salida POR CADA cuenta (mismo _grupoAbonoId) — así el
      // saldo por cuenta del encargo cuadra y el conjunto se puede revertir
      // o eliminar como una sola unidad.
      if (!enc.movimientos) enc.movimientos = [];
      let encMovId, encMovIds;
      if (_abonoEncCuentaSplits) {
        const grupoAbonoId = uid();
        encMovIds = _abonoEncCuentaSplits.map(s => {
          const id = uid();
          enc.movimientos.push({
            id,
            tipo: 'salida',
            monto: s.monto,
            cuenta: s.fuente,
            desc: `Pago de deuda — ${d.nombre}`,
            fecha,
            nota,
            ts: Date.now(),
            _esAbonoDeudor: true,
            _deudorId: deudorActualId,
            _grupoAbonoId: grupoAbonoId
          });
          return id;
        });
        encMovId = encMovIds[0];
      } else {
        encMovId = uid();
        encMovIds = [encMovId];
        enc.movimientos.push({
          id: encMovId,
          tipo: 'salida',
          monto,
          cuenta: _abonoEncCuenta === '__sinesp__' ? '' : (_abonoEncCuenta || ''),
          desc: `Pago de deuda — ${d.nombre}`,
          fecha,
          nota,
          ts: Date.now(),
          _esAbonoDeudor: true,
          _deudorId: deudorActualId
        });
      }

      // 2. Leer destino (el dinero llega a una cuenta del usuario)
      let abonoDestino = '';
      let abonMovId = uid();
      const esPagoCompletoEncargo = movTipo === 'pago-completo';
      const tipoGuardarEncargo = esPagoCompletoEncargo ? 'pago-completo' : 'abono';
      if (_abonoSplitMode) {
        const destinos = _getAbonoDestinoSplitData();
        destinos.forEach(r=>{ if(r.fuente) sumarFuente(r.fuente, r.monto); });
        // Registrar abono con destinos múltiples
        d.movimientos.push({
          id: abonMovId,
          tipo: tipoGuardarEncargo,
          monto,
          fecha,
          nota,
          destinos: destinos.map(r=>({fuente:r.fuente,monto:r.monto})),
          _viaEncargo: true,
          _encId: enc.id,
          _encNombre: enc.nombre,
          _encMovId: encMovId,
          _encMovIds: encMovIds,
          grupoId: _grupoIdMov,
          ts: Date.now()
        });
      } else {
        abonoDestino = document.getElementById('mov_destino').value;
        if (abonoDestino) sumarFuente(abonoDestino, monto);
        // Registrar movimiento visible en el historial de la cuenta destino
        let abonoDestinoMovId = null;
        if (abonoDestino) {
          abonoDestinoMovId = uid();
          const descAbonoDest = esPagoCompletoEncargo
            ? `Pago de deuda completo — ${d.nombre} (vía encargo ${enc.nombre})`
            : `Abono de deuda — ${d.nombre} (vía encargo ${enc.nombre})`;
          if (abonoDestino === 'efectivo' || abonoDestino === 'nequi') {
            if (!S.movimientos) S.movimientos = [];
            S.movimientos.push({ id: abonoDestinoMovId, tipo: 'entrada', fuente: abonoDestino, monto, fecha, desc: descAbonoDest, _secundario: true, _origenSeccion: 'Prestado · Me deben' });
          } else if (abonoDestino.startsWith('custom:')) {
            const cId = abonoDestino.split(':')[1];
            const cObj = (S.cuentasPersonalizadas || []).find(x => x.id === cId);
            if (cObj) {
              if (!cObj.movimientos) cObj.movimientos = [];
              cObj.movimientos.push({ id: abonoDestinoMovId, tipo: 'ingreso', monto, fecha, nota: descAbonoDest, _secundario: true, _origenSeccion: 'Prestado · Me deben' });
            }
          } else if (abonoDestino.startsWith('cajita:')) {
            const cId = abonoDestino.split(':')[1];
            const cObj = (S.cajitas || []).find(x => x.id === cId);
            if (cObj) {
              if (!cObj.historial) cObj.historial = [];
              cObj.historial.push({ id: abonoDestinoMovId, tipo: 'entrada', monto, fecha, nota: descAbonoDest, _secundario: true, _origenSeccion: 'Prestado · Me deben' });
            }
          }
        }
        // Registrar abono con destino simple
        d.movimientos.push({
          id: abonMovId,
          tipo: tipoGuardarEncargo,
          monto,
          fecha,
          nota,
          destino: abonoDestino,
          _viaEncargo: true,
          _encId: enc.id,
          _encNombre: enc.nombre,
          _encMovId: encMovId,
          _encMovIds: encMovIds,
          _abonoDestinoMovId: abonoDestinoMovId,
          grupoId: _grupoIdMov,
          ts: Date.now()
        });
      }

      // 3. Manejar el extra si aplica (también sale del encargo)
      // (Validaciones de reparto y saldo ya hechas antes del paso 1)
      if (tieneExtra && extraMonto > 0) {

        // Registrar la salida del extra en el encargo (movimiento separado y descriptivo)
        const encExtraMovId = uid();
        enc.movimientos.push({
          id: encExtraMovId,
          tipo: 'salida',
          monto: extraMonto,
          cuenta: _abonoEncCuenta === '__sinesp__' ? '' : (_abonoEncCuenta || ''),
          desc: `Extra / propina — ${d.nombre} (parte del pago de deuda)`,
          fecha,
          ts: Date.now(),
          _esExtraAbonoDeudor: true,
          _deudorId: deudorActualId,
          _abonoEncMovId: encMovId
        });

        // Adjuntar referencia al abono del deudor para reversión
        const ultimoMov = d.movimientos[d.movimientos.length - 1];
        if (ultimoMov) {
          ultimoMov._extPartes = [];
          ultimoMov._encExtraMovId = encExtraMovId;
        }

        for (const p of _extPartes) {
          if (!p.monto || p.monto <= 0) continue;
          if (p.tipo === 'guardar') {
            if (!p.cuenta) continue;
            sumarFuente(p.cuenta, p.monto);
            const descMovExtra = `Extra del pago de ${d.nombre} — vía encargo ${enc.nombre}`;
            let movExtraId = uid();
            if (p.cuenta === 'efectivo' || p.cuenta === 'nequi') {
              if (!S.movimientos) S.movimientos = [];
              S.movimientos.push({ id: movExtraId, tipo: 'entrada', fuente: p.cuenta, monto: p.monto, fecha, desc: descMovExtra, _secundario: true, _origenSeccion: 'Prestado · Me deben' });
            } else if (p.cuenta.startsWith('custom:')) {
              const cId = p.cuenta.split(':')[1];
              const cObj = (S.cuentasPersonalizadas || []).find(x => x.id === cId);
              if (cObj) {
                if (!cObj.movimientos) cObj.movimientos = [];
                cObj.movimientos.push({ id: movExtraId, tipo: 'ingreso', monto: p.monto, fecha, nota: descMovExtra, _secundario: true, _origenSeccion: 'Prestado · Me deben' });
              }
            } else if (p.cuenta.startsWith('cajita:')) {
              const cId = p.cuenta.split(':')[1];
              const cObj = (S.cajitas || []).find(x => x.id === cId);
              if (cObj) {
                if (!cObj.historial) cObj.historial = [];                cObj.historial.push({ id: movExtraId, tipo: 'entrada', monto: p.monto, fecha, nota: descMovExtra, _secundario: true, _origenSeccion: 'Prestado · Me deben' });
              }
            }
            if (ultimoMov) ultimoMov._extPartes.push({ tipo: 'guardar', cuenta: p.cuenta, monto: p.monto, movExtraId });
          } else if (p.tipo === 'gastar') {
            if (!S.gastosVar) S.gastosVar = [];
            const gastoId = uid();
            S.gastosVar.push({ id: gastoId, monto: p.monto, fecha, cat: 'Varios', desc: p.desc || `Extra del pago de ${d.nombre} — vía encargo ${enc.nombre}`, fuente: '', ts: Date.now(), _esExtraPrestamo: true });
            if (ultimoMov) ultimoMov._extPartes.push({ tipo: 'gastar', gastoId, monto: p.monto });
          } else if (p.tipo === 'regalar') {
            if (ultimoMov) ultimoMov._extPartes.push({ tipo: 'regalar', monto: p.monto });
          } else if (p.tipo === 'pendiente') {
            if (!S.ingresosExtra) S.ingresosExtra = [];
            const ingrId = uid();
            S.ingresosExtra.push({ id: ingrId, monto: p.monto, fecha, nota: `Extra sin asignar — ${d.nombre} vía encargo ${enc.nombre}`, ts: Date.now() });
            if (ultimoMov) ultimoMov._extPartes.push({ tipo: 'pendiente', ingrId, monto: p.monto });
          }
        }
      }

      if(window.logCambio) logCambio(`Abono de ${escHtml(d.nombre)} vía encargo de ${escHtml(enc.nombre)}`, d.nombre, monto, 'abono');
      _autoCerrarGruposEnCero(d);
      _verificarIntegridadSaldoDeudor(d, _saldoAntesMov, _deltaEsperadoMov);
      save(); refresh(); closeSheet('registrar-movimiento');
      abrirDeudor(deudorActualId);
      const msgExtra = extraMonto > 0 ? ` + ${fmt(extraMonto)} de extra` : '';
      toast(`${fmt(monto)}${msgExtra} descontados del encargo de ${escHtml(enc.nombre)}`, 'ok', 3500);
      return;
    }

    // ── Rama normal: destino a cuenta propia ──────────────────────
    // 1. Registrar el abono (con o sin split de destino)
    const esPagoCompletoActual = movTipo === 'pago-completo';
    const tipoGuardar = esPagoCompletoActual ? 'pago-completo' : 'abono';
    const descMovSecundario = esPagoCompletoActual ? `Pago de deuda completo — ${d.nombre}` : `Abono de deuda — ${d.nombre}`;
    if (_abonoSplitMode) {
      const totalSplit = _getAbonoDestinoSplitData().reduce((a,r)=>a+(r.monto||0),0);
      if(Math.abs(totalSplit - monto) > 1){
        toast(`La suma de cuentas (${fmt(totalSplit)}) no coincide con el abono (${fmt(monto)})`,'err',4000);
        return;
      }
      const destinos = _getAbonoDestinoSplitData().map(r=>({...r, _movId: uid()}));
      destinos.forEach(r=>{ if(r.fuente) sumarFuente(r.fuente, r.monto); });
      // Registrar movimiento visible en cada cuenta destino
      destinos.forEach(r=>{
        if (!r.fuente) return;
        const descSplit = descMovSecundario;
        if (r.fuente === 'efectivo' || r.fuente === 'nequi') {
          if (!S.movimientos) S.movimientos = [];
          S.movimientos.push({ id: r._movId, tipo: 'entrada', fuente: r.fuente, monto: r.monto, fecha, desc: descSplit, _secundario: true, _origenSeccion: 'Prestado · Me deben' });
        } else if (r.fuente.startsWith('custom:')) {
          const cId = r.fuente.split(':')[1];
          const cObj = (S.cuentasPersonalizadas || []).find(x => x.id === cId);
          if (cObj) {
            if (!cObj.movimientos) cObj.movimientos = [];
            cObj.movimientos.push({ id: r._movId, tipo: 'ingreso', monto: r.monto, fecha, nota: descSplit, _secundario: true, _origenSeccion: 'Prestado · Me deben' });
          }
        } else if (r.fuente.startsWith('cajita:')) {
          const cId = r.fuente.split(':')[1];
          const cObj = (S.cajitas || []).find(x => x.id === cId);
          if (cObj) {
            if (!cObj.historial) cObj.historial = [];
            cObj.historial.push({ id: r._movId, tipo: 'entrada', monto: r.monto, fecha, nota: descSplit, _secundario: true, _origenSeccion: 'Prestado · Me deben' });
          }
        }
      });
      d.movimientos.push({ id: uid(), tipo: tipoGuardar, monto, fecha, destinos: destinos.map(r=>({fuente:r.fuente,monto:r.monto,_movId:r._movId})), nota, grupoId: _grupoIdMov, ts: Date.now() });
    } else {
      const destino = document.getElementById('mov_destino').value;
      const abonoMovId = uid();
      const abonoDestinoMovId = destino ? uid() : null;
      d.movimientos.push({ id: abonoMovId, tipo: tipoGuardar, monto, fecha, destino, nota, _abonoDestinoMovId: abonoDestinoMovId, grupoId: _grupoIdMov, ts: Date.now() });
      sumarFuente(destino, monto);
      // Registrar movimiento visible en la cuenta destino
      if (destino === 'efectivo' || destino === 'nequi') {
        if (!S.movimientos) S.movimientos = [];
        S.movimientos.push({ id: abonoDestinoMovId, tipo: 'entrada', fuente: destino, monto, fecha, desc: descMovSecundario, _secundario: true, _origenSeccion: 'Prestado · Me deben' });
      } else if (destino.startsWith('custom:')) {
        const cId = destino.split(':')[1];
        const cObj = (S.cuentasPersonalizadas || []).find(x => x.id === cId);
        if (cObj) {
          if (!cObj.movimientos) cObj.movimientos = [];
          cObj.movimientos.push({ id: abonoDestinoMovId, tipo: 'ingreso', monto, fecha, nota: descMovSecundario, _secundario: true, _origenSeccion: 'Prestado · Me deben' });
        }
      } else if (destino.startsWith('cajita:')) {
        const cId = destino.split(':')[1];
        const cObj = (S.cajitas || []).find(x => x.id === cId);
        if (cObj) {
          if (!cObj.historial) cObj.historial = [];
          cObj.historial.push({ id: abonoDestinoMovId, tipo: 'entrada', monto, fecha, nota: descMovSecundario, _secundario: true, _origenSeccion: 'Prestado · Me deben' });
        }
      }
    }

    // 2. Manejar el extra si aplica (sistema de partes libres)
    if (document.getElementById('mov_tiene_extra').checked) {
      const extra = parseMoney(document.getElementById('mov_extra_monto').value) || 0;
      if (!extra) { toast('Ingresa el monto del extra', 'err'); return; }
      if (!_extPartes.length) { toast('Agrega al menos una parte para el extra', 'err'); return; }
      const totalPartes = _extPartes.reduce((a,p)=>a+(p.monto||0),0);
      if (Math.abs(totalPartes - extra) > 1) {
        toast(`Falta asignar ${fmt(extra - totalPartes)} del extra antes de continuar.`, 'err', 4000);
        return;
      }
      const nombreDeudor = d ? d.nombre : 'préstamo';
      // Guardar snapshot de las partes en el último movimiento registrado (el abono recién guardado)
      // para poder revertirlas si se elimina
      const ultimoMov = d.movimientos[d.movimientos.length - 1];
      if (ultimoMov) ultimoMov._extPartes = [];

      for (const p of _extPartes) {
        if (!p.monto || p.monto <= 0) continue;
        if (p.tipo === 'guardar') {
          if (!p.cuenta) continue;
          // Sumar saldo
          sumarFuente(p.cuenta, p.monto);
          // Registrar movimiento visible en el historial de la cuenta
          const descMovExtra = `Extra de pago — ${nombreDeudor}`;
          let movExtraId = uid();
          if (p.cuenta === 'efectivo' || p.cuenta === 'nequi') {
            if (!S.movimientos) S.movimientos = [];
            S.movimientos.push({ id: movExtraId, tipo: 'entrada', fuente: p.cuenta, monto: p.monto, fecha, desc: descMovExtra, _secundario: true, _origenSeccion: 'Prestado · Me deben' });
          } else if (p.cuenta.startsWith('custom:')) {
            const cId = p.cuenta.split(':')[1];
            const cObj = (S.cuentasPersonalizadas || []).find(x => x.id === cId);
            if (cObj) {
              if (!cObj.movimientos) cObj.movimientos = [];
              cObj.movimientos.push({ id: movExtraId, tipo: 'ingreso', monto: p.monto, fecha, nota: descMovExtra, _secundario: true, _origenSeccion: 'Prestado · Me deben' });
            }
          } else if (p.cuenta.startsWith('cajita:')) {
            const cId = p.cuenta.split(':')[1];
            const cObj = (S.cajitas || []).find(x => x.id === cId);
            if (cObj) {
              if (!cObj.historial) cObj.historial = [];
              cObj.historial.push({ id: movExtraId, tipo: 'entrada', monto: p.monto, fecha, nota: descMovExtra, _secundario: true, _origenSeccion: 'Prestado · Me deben' });
            }
          }
          // Guardar referencia para reversión
          if (ultimoMov) ultimoMov._extPartes.push({ tipo: 'guardar', cuenta: p.cuenta, monto: p.monto, movExtraId });
        } else if (p.tipo === 'gastar') {
          if (!S.gastosVar) S.gastosVar = [];
          const gastoId = uid();
          S.gastosVar.push({ id: gastoId, monto: p.monto, fecha, cat: 'Varios', desc: p.desc || `Extra de pago — ${nombreDeudor}`, fuente: '', ts: Date.now(), _esExtraPrestamo: true });
          // Guardar referencia para reversión
          if (ultimoMov) ultimoMov._extPartes.push({ tipo: 'gastar', gastoId, monto: p.monto });
        } else if (p.tipo === 'regalar') {
          // No entra a ninguna cuenta — solo queda registrado en el abono del deudor
          if (ultimoMov) ultimoMov._extPartes.push({ tipo: 'regalar', monto: p.monto });
        } else if (p.tipo === 'pendiente') {
          if (!S.ingresosExtra) S.ingresosExtra = [];
          const ingrId = uid();
          S.ingresosExtra.push({ id: ingrId, monto: p.monto, fecha, nota: `Extra sin asignar — ${nombreDeudor}`, ts: Date.now() });
          if (ultimoMov) ultimoMov._extPartes.push({ tipo: 'pendiente', ingrId, monto: p.monto });
        }
      }
    }
  }

  // Log cambio
  if(window.logCambio && d){
    const tipolog = movTipo === 'prestamo' ? 'prestamo' : 'abono';
    logCambio(movTipo==='prestamo'?'Prestaste a '+d.nombre:'Registraste abono de '+d.nombre, d.nombre, monto, tipolog);
  }
  _autoCerrarGruposEnCero(d);
  _verificarIntegridadSaldoDeudor(d, _saldoAntesMov, _deltaEsperadoMov);
  save(); refresh(); closeSheet('registrar-movimiento');
  abrirDeudor(deudorActualId);
}

function fuenteLabel2(f){ return f ? fuenteLabel(f) : '—'; }

// _fuenteLabelHtml() vive en js/core/movimientos.js (núcleo, eager, carga
// antes que este módulo) — estaba redefinida acá idéntica, byte a byte.

/* ── ABONO: desde un encargo ──────────────────────────────────────── */
function toggleDesdeEncargo() {
  const chk  = document.getElementById('mov_desde_encargo');
  const body = document.getElementById('mov_enc_body');
  const destWrap = document.getElementById('mov_destino_wrap');
  _abonoDesdeEncargo = chk.checked;
  if (!body) return;
  body.style.display = _abonoDesdeEncargo ? '' : 'none';
  // El destino siempre aplica — el dinero del encargo entra a una cuenta tuya
  if (destWrap) destWrap.style.display = '';

  if (!_abonoDesdeEncargo) {
    _abonoEncId = '';
    _abonoEncCuenta = '';
    _abonoEncCuentaSplitMode = false;
    document.getElementById('mov_enc_cuenta_simple').style.display = '';
    document.getElementById('mov_enc_cuenta_split').style.display = 'none';
    document.getElementById('mov_enc_cuenta_split_rows').innerHTML = '';
    _resetEncCuentaSplitToggleStyle();
    document.getElementById('mov_enc_saldo_preview').textContent = '';
    document.getElementById('mov_enc_cuenta_wrap').style.display = 'none';
    return;
  }

  // Poblar el select de encargos con saldo > 0
  const sel = document.getElementById('mov_enc_sel');
  const d = (S.deudores || []).find(x => x.id === deudorActualId);
  const encargosDisponibles = (S.encargos || []).filter(e => encargoLibre(e) > 0);

  // Ordenar: primero los vinculados a la misma persona
  const mismaPersona = d && d.personaId
    ? encargosDisponibles.filter(e => e.personaId === d.personaId)
    : [];
  const otros = encargosDisponibles.filter(e => !mismaPersona.includes(e));

  let opts = [html`<option value="">Seleccionar encargo</option>`];
  if (mismaPersona.length > 0) {
    opts.push(html`<optgroup label="De ${d.nombre}">`);
    mismaPersona.forEach(e => {
      opts.push(html`<option value="${e.id}">${e.nombre} (${fmt(encargoLibre(e))})</option>`);
    });
    opts.push(raw('</optgroup>'));
  }
  if (otros.length > 0) {
    if (mismaPersona.length > 0) opts.push(raw('<optgroup label="Otros encargos">'));
    otros.forEach(e => {
      opts.push(html`<option value="${e.id}">${e.nombre} (${fmt(encargoLibre(e))})</option>`);
    });
    if (mismaPersona.length > 0) opts.push(raw('</optgroup>'));
  }
  sel.innerHTML = html`${opts}`;

  // Auto-seleccionar si solo hay uno vinculado a la misma persona
  if (mismaPersona.length === 1) {
    sel.value = mismaPersona[0].id;
    onChangeMov_enc_sel();
  } else {
    _abonoEncId = '';
    _abonoEncCuenta = '';
    document.getElementById('mov_enc_cuenta_wrap').style.display = 'none';
    document.getElementById('mov_enc_saldo_preview').textContent = '';
  }
}

function onChangeMov_enc_sel() {
  const sel = document.getElementById('mov_enc_sel');
  _abonoEncId = sel.value;
  _abonoEncCuenta = '';
  // Cambiar de encargo invalida cualquier división que hubiera armado antes
  _abonoEncCuentaSplitMode = false;
  const splitSimpleEl = document.getElementById('mov_enc_cuenta_simple');
  const splitDivEl    = document.getElementById('mov_enc_cuenta_split');
  const splitRowsEl   = document.getElementById('mov_enc_cuenta_split_rows');
  const splitToggleEl = document.getElementById('mov_enc_cuenta_split_toggle');
  if (splitSimpleEl) splitSimpleEl.style.display = '';
  if (splitDivEl)    splitDivEl.style.display = 'none';
  if (splitRowsEl)   splitRowsEl.innerHTML = '';
  _resetEncCuentaSplitToggleStyle();
  const enc = _abonoEncId ? (S.encargos || []).find(e => e.id === _abonoEncId) : null;
  const cuentaWrap = document.getElementById('mov_enc_cuenta_wrap');
  const preview    = document.getElementById('mov_enc_saldo_preview');
  const cuentaSel  = document.getElementById('mov_enc_cuenta');
  if (!enc) {
    if (cuentaWrap) cuentaWrap.style.display = 'none';
    if (preview) preview.textContent = '';
    return;
  }
  // Poblar cuentas del encargo con saldo
  const cuentasConSaldo = _getEncargoSaldoPorCuenta(enc);
  const saldoSinCuenta = _getEncargoSaldoSinCuenta(enc);
  // Solo tiene sentido "dividir" si la plata del encargo está repartida en 2+ cuentas
  if (splitToggleEl) splitToggleEl.style.display = cuentasConSaldo.length >= 2 ? '' : 'none';
  if (cuentasConSaldo.length === 0) {
    if (cuentaWrap) cuentaWrap.style.display = 'none';
    if (preview) {
      preview.style.color = 'var(--accent)';
      preview.textContent = `Saldo disponible: ${fmt(encargoLibre(enc))} (sin cuenta especificada)`;
    }
    _abonoEncCuenta = '';
    return;
  }
  if (cuentaSel) {
    // "Sin especificar" ahora es una opción explícita (__sinesp__) que representa
    // SOLO la porción del encargo que no está ligada a ninguna cuenta — ya no se
    // usa como valor "sin restricción" que dejaba tomar plata de cualquier cuenta.
    let optsHtml = cuentasConSaldo.map(f => html`<option value="${f.cuenta}">${f.label} (${fmt(f.saldo)})</option>`);
    if (saldoSinCuenta > 0) {
      optsHtml.push(html`<option value="__sinesp__">Sin especificar (${fmt(saldoSinCuenta)} del encargo)</option>`);
    }
    cuentaSel.innerHTML = html`${optsHtml}`;
    // Pre-seleccionar la de mayor saldo
    cuentaSel.value = cuentasConSaldo[0].cuenta;
    _abonoEncCuenta = cuentasConSaldo[0].cuenta;
  }
  if (cuentaWrap) cuentaWrap.style.display = '';
  _actualizarEncPreview(enc);
}

function onChangeMov_enc_cuenta() {
  const sel = document.getElementById('mov_enc_cuenta');
  _abonoEncCuenta = sel ? sel.value : '';
  const enc = _abonoEncId ? (S.encargos || []).find(e => e.id === _abonoEncId) : null;
  if (enc) _actualizarEncPreview(enc);
}

function _actualizarEncPreview(enc) {
  const preview = document.getElementById('mov_enc_saldo_preview');
  const monto   = parseMoney(document.getElementById('mov_monto').value) || 0;
  const hint    = document.getElementById('mov_enc_cuenta_hint');
  if (!enc || !preview) return;
  const saldoTotal = encargoLibre(enc);
  if (_abonoEncCuenta) {
    const esSinEsp = _abonoEncCuenta === '__sinesp__';
    const labelCuenta = esSinEsp ? 'Sin especificar' : fuenteLabel(_abonoEncCuenta);
    const saldoEnCuenta = esSinEsp ? _getEncargoSaldoSinCuenta(enc) : _getEncargoSaldoEnCuenta(enc, _abonoEncCuenta);
    // El hint estático ("Disponible en X: $Y") es redundante: el <option> de
    // mov_enc_cuenta ya muestra ese mismo monto en su texto (ver onChangeMov_enc_sel
    // más arriba). Se deja oculto — ver reglas-visuales.md#selectores-con-saldo.
    if (hint) hint.style.display = 'none';
    preview.style.color = monto > saldoEnCuenta ? 'var(--red)' : 'var(--accent)';
    preview.textContent = monto > saldoEnCuenta
      ? `\u26a0 Solo hay ${fmt(saldoEnCuenta)} en ${esSinEsp ? 'la parte sin especificar' : 'esa cuenta'} del encargo`
      : monto > 0 ? `\u2713 El encargo tiene ${fmt(saldoEnCuenta)} en ${labelCuenta}` : '';
  } else {
    if (hint) hint.style.display = 'none';
    preview.style.color = monto > saldoTotal ? 'var(--red)' : 'var(--accent)';
    preview.textContent = monto > saldoTotal
      ? `\u26a0 El encargo solo tiene ${fmt(saldoTotal)} disponible (el resto ya está comprometido)`
      : monto > 0 ? `\u2713 Disponible del encargo: ${fmt(saldoTotal)}` : '';
  }
}

function _onMovMontoInput() {
  if (_abonoDesdeEncargo && _abonoEncId) {
    const enc = (S.encargos || []).find(e => e.id === _abonoEncId);
    if (enc) _actualizarEncPreview(enc);
  }
  if (_abonoEncCuentaSplitMode) _abonoEncCuentaSplitPreview();
}

// ── ABONO: split destino + extra ───────────────────────────────────────────
// Split del destino del abono MIGRADO al motor genérico de split.js
// (crearSplitWidget/splitToggle/splitAgregarRow/splitGetData) — antes tenía
// su propia implementación casera (array _abonoSplitRows + render manual con
// botón "×" de texto), duplicando el mismo patrón que ya vivía en split.js
// para movenc/usarParte (Encargos) y abonoEncCuenta (más abajo en este mismo
// archivo). Con esto las tres pantallas de "dividir" quedan con el mismo
// diseño (fila con ícono SVG) y el mismo mínimo de 2 filas no borrables.
//
// _abonoSplitMode se deja con el mismo nombre porque el resto de este
// archivo (más abajo, en el flujo de guardado) lo sigue leyendo directo
// como flag booleano — getModo/setModo son un closure sobre este `let`,
// igual que documenta split.js, así que no hace falta tocar esas lecturas.
let _abonoSplitMode    = false;
let _abonoDesdeEncargo = false;
let _abonoEncId        = '';
let _abonoEncCuenta    = '';
let _extPartes         = []; // sistema de partes libres del extra

crearSplitWidget('abonoDestino', {
  simpleId:'mov_destino_simple', splitId:'mov_destino_split', toggleId:'mov_dest_split_toggle', rowsId:'mov_dest_split_rows',
  getModo:()=>_abonoSplitMode, setModo:v=>{_abonoSplitMode=v;},
  getFuentesFn:_getAbonoDestinoFuentesOptions,
  onPreview:abonoSplitResumen
});

function toggleAbonoSplit(){ splitToggle('abonoDestino'); }
function abonoAddSplitRow(){ splitAgregarRow('abonoDestino'); }
function _getAbonoDestinoSplitData(){ return splitGetData('abonoDestino'); }

// El destino de un abono nunca es una tarjeta de crédito (una TC jamás es
// destino de plata entrante) — mismo filtro que ya aplicaba getFuentesSinTC()
// en el render casero que reemplaza este bloque.
function _getAbonoDestinoFuentesOptions(selectedVal) {
  const fuentes = getFuentesSinTC();
  let out = '<option value="">Sin especificar</option>';
  for (const f of fuentes) {
    out += `<option value="${f.val}"${f.val===selectedVal?' selected':''}>${escHtml(f.label)}</option>`;
  }
  return out;
}

function abonoSplitResumen() {
  const monto = parseMoney(document.getElementById('mov_monto').value)||0;
  const total = _getAbonoDestinoSplitData().reduce((a,r)=>a+(r.monto||0),0);
  const diff  = monto - total;
  const el    = document.getElementById('mov_dest_split_resumen');
  if(!el) return;
  if(Math.abs(diff)<1)  el.innerHTML=html`<span style="color:var(--accent);"><i class="fa-solid fa-check" style="margin-right:4px;"></i>Suma exacta ${fmt(total)}</span>`;
  else if(diff>0)       el.innerHTML=html`<span style="color:var(--amber);">Faltan ${fmt(diff)} por asignar</span>`;
  else                  el.innerHTML=html`<span style="color:var(--red);">Excede el abono en ${fmt(-diff)}</span>`;
}

/* ─── "¿Te dio extra de más?" — usa el motor común para el cálculo
   dijo/real/margen (instancia 'extra'), con dijo=0 fijo: aquí no hay
   "le dije X", solo "me dieron de más". margen = dijo - real = 0 - (-extra) = extra,
   el mismo fenómeno matemático que el resto de instancias, solo que el reparto
   usa un menú de tipos de destino (guardar/gastar/regalar/pendiente) en vez de
   simples beneficiarios — por eso el render de partes vive aparte (extRenderPartes),
   pero los números (toggle/resumen) sí vienen del motor. ─── */

diffRegistrarInstancia('extra', {
  ids: { wrap: 'mov_extra_wrap', body: 'mov_extra_body', real: 'mov_extra_monto', resumen: 'ext_partes_resumen' },
  permiteBeneficiarios: false, // el reparto de "extra" usa su propio render (extRenderPartes), no beneficiarios genéricos
  permiteIntercambio: false,
  permiteMiCuenta: false,
  getDijo: () => 0 // no hay "dijiste X" — el extra siempre es 100% margen
});

/* Toggle extra */
function toggleExtraSection() {
  const checked = document.getElementById('mov_tiene_extra').checked;
  document.getElementById('mov_extra_body').style.display = checked?'':'none';
  if (checked && !_extPartes.length) extAddParte();
}

/* ── Sistema de partes libres para el extra ──────────────────────── */
// Cada parte: { tipo: 'guardar'|'gastar'|'regalar'|'pendiente', monto: 0, cuenta: '', desc: '', quien: '' }
// _extPartes declarado globalmente arriba junto a _abonoSplitMode etc.

const _extTipos = {
  guardar:   { label: 'Lo guardé en cuenta', color: 'var(--blue)',
    icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>' },
  gastar:    { label: 'Lo gasté',             color: 'var(--amber)',
    icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>' },
  regalar:   { label: 'Lo regalé / lo di',   color: 'var(--purple)',
    icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>' },
  pendiente: { label: 'Sin decidir aún',      color: 'var(--text2)',
    icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' },
};

function extAddParte() {
  _extPartes.push({ tipo: 'guardar', monto: 0, cuenta: '', desc: '', quien: '' });
  extRenderPartes();
  extResumenPartes();
}

function extDelParte(i) {
  _extPartes.splice(i, 1);
  extRenderPartes();
  extResumenPartes();
}

function extSetTipo(i, tipo) {
  _extPartes[i].tipo = tipo;
  extRenderPartes();
  extResumenPartes();
}

function extSetMonto(i, v) { _extPartes[i].monto = parseMoney(v)||0; extResumenPartes(); }
function extSetCuenta(i, v) { _extPartes[i].cuenta = v; }
function extSetDesc(i, v)   { _extPartes[i].desc = v; }
function extSetQuien(i, v)  { _extPartes[i].quien = v; }

function extRenderPartes() {
  const cont = document.getElementById('ext_partes_list');
  if (!cont) return;
  const fuentes = getFuentesSinTC();
  cont.innerHTML = html`${_extPartes.map((p, i) => {
    const tipoInfo = _extTipos[p.tipo] || _extTipos.guardar;
    const extraDetails = p.tipo === 'guardar' ? html`
      <div class="select-wrap" style="margin-top:7px;">
        <select class="_ext-set-cuenta" data-i="${i}" data-stop-click="true" style="font-size:12px;padding:7px 26px 7px 9px;">
          <option value="">¿A cuál cuenta?</option>
          ${fuentes.map(f=>html`<option value="${f.val}" ${raw(p.cuenta===f.val?'selected':'')}>${f.label}</option>`)}
        </select>
      </div>` :
    p.tipo === 'gastar' ? html`
      <input type="text" value="${p.desc||''}" placeholder="¿En qué? (opcional)" data-stop-click="true"
        class="_ext-set-desc" data-i="${i}"
        style="margin-top:7px;width:100%;background:var(--bg4);border:1px solid var(--border2);border-radius:7px;padding:7px 10px;font-size:12px;color:var(--text);font-family:inherit;">` :
    p.tipo === 'regalar' ? html`
      <input type="text" value="${p.quien||''}" placeholder="¿A quién? (opcional)" data-stop-click="true"
        class="_ext-set-quien" data-i="${i}"
        style="margin-top:7px;width:100%;background:var(--bg4);border:1px solid var(--border2);border-radius:7px;padding:7px 10px;font-size:12px;color:var(--text);font-family:inherit;">` : '';

    return html`<div style="border-radius:9px;border:1.5px solid var(--border2);background:var(--bg3);padding:10px 11px;position:relative;">
      <!-- Fila principal: tipo + monto + borrar -->
      <div style="display:flex;align-items:center;gap:7px;">
        <!-- Selector de tipo -->
        <div style="position:relative;flex:1;">
          <select class="_ext-set-tipo" data-i="${i}" data-stop-click="true"
            style="width:100%;appearance:none;background:var(--bg4);border:1px solid var(--border2);border-radius:7px;padding:7px 28px 7px 32px;font-size:12px;font-weight:600;color:${raw(tipoInfo.color)};font-family:inherit;cursor:pointer;">
            ${Object.entries(_extTipos).map(([k,v])=>html`<option value="${k}" ${raw(p.tipo===k?'selected':'')}>${v.label}</option>`)}
          </select>
          <span style="position:absolute;left:9px;top:50%;transform:translateY(-50%);pointer-events:none;color:${raw(tipoInfo.color)};">${raw(tipoInfo.icon)}</span>
          <svg style="position:absolute;right:8px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--text3);" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
        <!-- Monto -->
        <input type="text" inputmode="decimal" value="${p.monto?fmtInput(p.monto):''}" placeholder="0,00"
          class="money-input _ext-set-monto" data-i="${i}" data-stop-click="true"
          style="width:100px;padding:7px 9px;font-size:13px;flex-shrink:0;">
        <!-- Borrar -->
        <button type="button" ${raw(Events.attr('prestado:extDelParte', i))} data-stop-propagation="true"
          style="background:none;border:none;cursor:pointer;color:var(--text3);min-width:24px;min-height:24px;display:flex;align-items:center;justify-content:center;flex-shrink:0;" ${raw(_extPartes.length<=1?'style="visibility:hidden;"':'')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      ${extraDetails}
    </div>`;
  })}`;
  // Estos campos solo necesitan no burbujear el click hacia un contenedor
  // ancestro (defensivo) — no son "acciones" de negocio, así que no pasan por
  // el registry de Events; alcanza con un addEventListener directo acá mismo,
  // que ya cumple igual el objetivo de la CSP (no es un atributo inline).
  cont.querySelectorAll('[data-stop-click]').forEach(el => el.addEventListener('click', e => e.stopPropagation()));
  // onchange/oninput inline reemplazados por addEventListener delegado — docs/auditoria-tecnica.md #1
  cont.querySelectorAll('._ext-set-cuenta').forEach(el => el.addEventListener('change', () => extSetCuenta(+el.dataset.i, el.value)));
  cont.querySelectorAll('._ext-set-desc').forEach(el => el.addEventListener('input', () => extSetDesc(+el.dataset.i, el.value)));
  cont.querySelectorAll('._ext-set-quien').forEach(el => el.addEventListener('input', () => extSetQuien(+el.dataset.i, el.value)));
  cont.querySelectorAll('._ext-set-tipo').forEach(el => el.addEventListener('change', () => extSetTipo(+el.dataset.i, el.value)));
  cont.querySelectorAll('._ext-set-monto').forEach(el => el.addEventListener('input', () => extSetMonto(+el.dataset.i, el.value)));
}

function extResumenPartes() {
  // El motor común calcula dijo=0 y real=extra recibido (margen=dijo-real=-extra,
  // así que para esta instancia el monto a repartir es directamente "real", no "margen").
  const extra = diffCalcular('extra').real;
  const total = _extPartes.reduce((a,p)=>a+(p.monto||0),0);
  const diff  = extra - total;
  const el    = document.getElementById('ext_partes_resumen');
  if (!el) return;
  if (!extra) { el.innerHTML=''; return; }
  if (Math.abs(diff)<1) el.innerHTML=html`<span style="color:var(--accent);">Suma exacta — listo</span>`;
  else if (diff>0)      el.innerHTML=html`<span style="color:var(--amber);">Faltan ${fmt(diff)} por asignar</span>`;
  else                  el.innerHTML=html`<span style="color:var(--red);">Excede el extra en ${fmt(-diff)}</span>`;
}

// Calcular total prestado para el resumen
function totalPrestadoPendiente() {
  return (S.deudores || []).reduce((a, d) => {
    const saldo = getDeudorSaldo(d);
    return a + (saldo > 0 ? saldo : 0);
  }, 0);
}

/* ── MIS DEUDAS (yo le debo a una persona) ───────────────────────────────
   Simétrico a S.deudores, pero con efecto inverso: cuando "me prestan"
   plata, ENTRA a una de mis cuentas (sumarFuente) y queda como pasivo
   pendiente. Cuando pago, SALE de una cuenta (descontarFuente) y el
   pasivo baja. El saldo pendiente se RESTA de calcPatrimonioTotal(),
   igual que ya se hace con la deuda de tarjeta de crédito — es plata
   que tengo físicamente pero no es mía. */
let miDeudaActualId = null;

function getMiDeudaSaldo(d) {
  return (d.movimientos || []).reduce((a, m) => m.tipo === 'recibido' ? a + m.monto : a - m.monto, 0);
}

function totalMisDeudasPendiente() {
  return (S.misDeudas || []).reduce((a, d) => {
    const saldo = getMiDeudaSaldo(d);
    return a + (saldo > 0 ? saldo : 0);
  }, 0);
}

let prestamosTabActiva = 'me-deben'; // Recuerda qué pestaña (Me deben / Yo debo) quedó activa, para restaurarla al volver a la pantalla
function cambiarTabPrestamos(tab) {
  prestamosTabActiva = tab;
  const tabMeDeben = document.getElementById('tab-me-deben');
  const tabYoDebo = document.getElementById('tab-yo-debo');
  const viewMeDeben = document.getElementById('deudoresView');
  const detalleMeDeben = document.getElementById('deudorDetalle');
  const viewYoDebo = document.getElementById('misDeudasView');
  const detalleYoDebo = document.getElementById('miDeudaDetalle');
  if (tab === 'yo-debo') {
    tabYoDebo.className = 'btn';
    tabYoDebo.style.background = 'rgba(200,240,96,.12)';
    tabYoDebo.style.borderColor = 'rgba(200,240,96,.4)';
    tabYoDebo.style.color = 'var(--accent)';
    tabMeDeben.className = 'btn btn-ghost';
    tabMeDeben.style.background = '';
    tabMeDeben.style.borderColor = '';
    tabMeDeben.style.color = '';
    viewMeDeben.style.display = 'none';
    detalleMeDeben.style.display = 'none';
    viewYoDebo.style.display = '';
    detalleYoDebo.style.display = 'none';
    renderMisDeudasList();
  } else {
    tabMeDeben.className = 'btn';
    tabMeDeben.style.background = 'rgba(200,240,96,.12)';
    tabMeDeben.style.borderColor = 'rgba(200,240,96,.4)';
    tabMeDeben.style.color = 'var(--accent)';
    tabYoDebo.className = 'btn btn-ghost';
    tabYoDebo.style.background = '';
    tabYoDebo.style.borderColor = '';
    tabYoDebo.style.color = '';
    viewYoDebo.style.display = 'none';
    detalleYoDebo.style.display = 'none';
    viewMeDeben.style.display = '';
  }
}

function _ndPoblarSelectDestino() {
  const sel = document.getElementById('nd_destino');
  if (!sel) return;
  const fuentes = getFuentesSinTC();
  sel.innerHTML = html`<option value>Sin especificar</option>${fuentes.map(f => html`<option value="${f.val}">${f.label}</option>`)}`;
}

function crearMiDeuda() {
  const nombre = (document.getElementById('nd_nombre').value || '').trim();
  if (!nombre) { toast('Ingresa el nombre de la persona', 'err'); return; }
  const monto = parseMoney(document.getElementById('nd_monto').value) || 0;
  if (!monto) { toast('Ingresa cuánto te prestó', 'err'); return; }
  const fecha = document.getElementById('nd_fecha').value || hoy();
  const destino = document.getElementById('nd_destino').value;
  const nota = (document.getElementById('nd_nota').value || '').trim();
  if (!S.misDeudas) S.misDeudas = [];
  // Vincular a una persona existente si ya hay alguien con ese nombre
  let personaId = null;
  if (S.personas) {
    const p = S.personas.find(x => x.nombre.trim().toLowerCase() === nombre.toLowerCase());
    if (p) personaId = p.id;
  }
  const colores = ['#60b0f0', '#c8f060', '#f0b840', '#b090f0', '#f06868', '#c060f0'];
  const d = {
    id: uid(), nombre, personaId,
    color: colores[(S.misDeudas.length) % colores.length],
    movimientos: [{ id: uid(), tipo: 'recibido', monto, fecha, destino: destino || undefined, nota, ts: Date.now() }]
  };
  if (destino) sumarFuente(destino, monto);
  S.misDeudas.push(d);
  document.getElementById('nd_nombre').value = '';
  document.getElementById('nd_monto').value = '';
  document.getElementById('nd_nota').value = '';
  save(); refresh(); closeSheet('nueva-deuda');
  toast(`Deuda con ${escHtml(nombre)} agregada`, 'ok');
}

function renderMisDeudasList() {
  const el = document.getElementById('misDeudasList');
  if (!el) return;
  const list = S.misDeudas || [];
  if (!list.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--text3);padding:4px 0 10px;">Aún no registras deudas. Si alguien te presta plata, agrégala aquí.</div>';
    return;
  }
  el.innerHTML = html`${list.map(d => {
    const saldo = getMiDeudaSaldo(d);
    const initials = d.nombre.substring(0, 2).toUpperCase();
    const ultimoMov = (d.movimientos || []).slice(-1)[0];
    const tienePerfil = !!d.personaId;
    // Color: la persona es fuente de verdad
    const _rPersona = tienePerfil && typeof getPersona === 'function' ? getPersona(d.personaId) : null;
    const color = (_rPersona && _rPersona.color) ? _rPersona.color : (d.color || '#60b0f0');
    return html`<div class="card card-sm" style="margin-bottom:8px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <button type="button" class="avatar" ${raw(Events.attr(tienePerfil ? 'prestado:abrirPerfilPersonaDeDeuda' : 'prestado:abrirMiDeuda', tienePerfil ? d.personaId : d.id))}
          style="color:${raw(color)};border-color:${raw(color)}33;background:${raw(color)}18;width:38px;height:38px;font-size:13px;margin-right:0;flex-shrink:0;border:1px solid;cursor:pointer;${raw(tienePerfil ? 'box-shadow:0 0 0 2px ' + color + '33;' : '')}"
          title="${tienePerfil ? 'Ver perfil de ' + d.nombre : d.nombre}">${initials}</button>
        <div style="flex:1;min-width:0;cursor:pointer;" ${raw(Events.attr('prestado:abrirMiDeuda', d.id))}>
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <div class="row-name">${d.nombre}</div>
            <div class="row-amount ${raw(saldo > 0 ? 'c-red' : 'c-green')}">${fmt(Math.abs(saldo))}</div>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:3px;">
            <div class="row-sub">${saldo > 0 ? 'Le debes' : saldo < 0 ? 'Saldo a tu favor' : 'Al día'}</div>
            ${ultimoMov ? html`<span style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;">${ultimoMov.fecha}</span>` : ''}
          </div>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2" stroke-linecap="round" style="flex-shrink:0;"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
    </div>`;
  })}`;
}

function abrirMiDeuda(id) {
  miDeudaActualId = id;
  const d = (S.misDeudas || []).find(x => x.id === id);
  if (!d) return;
  const saldo = getMiDeudaSaldo(d);
  const totalRecibido = (d.movimientos || []).filter(m => m.tipo === 'recibido').reduce((a, m) => a + m.monto, 0);
  const totalPagado = (d.movimientos || []).filter(m => m.tipo === 'pago').reduce((a, m) => a + m.monto, 0);

  const mdAv = document.getElementById('mdAvatar');
  // Color: la persona es la fuente de verdad; d.color es fallback
  const _mdPersona = d.personaId && typeof getPersona === 'function' ? getPersona(d.personaId) : null;
  const _mdColor = (_mdPersona && _mdPersona.color) ? _mdPersona.color : (d.color || '#60b0f0');
  mdAv.textContent = d.nombre.substring(0, 2).toUpperCase();
  mdAv.style.color = _mdColor;
  mdAv.style.borderColor = _mdColor + '44';
  mdAv.style.background = _mdColor + '20';
  mdAv.style.boxShadow = d.personaId ? '0 0 0 2px ' + _mdColor + '44' : '';
  document.getElementById('mdNombre').textContent = d.nombre;
  document.getElementById('mdSaldoLabel').textContent = saldo > 0 ? 'Le debes ' + fmt(saldo) : saldo < 0 ? 'Saldo a tu favor: ' + fmt(-saldo) : 'Estás al día';
  document.getElementById('mdSaldoLabel').style.color = saldo > 0 ? 'var(--red)' : saldo < 0 ? 'var(--amber)' : 'var(--accent)';
  const mdChip = document.getElementById('md-perfil-chip');
  if (mdChip) mdChip.style.display = d.personaId ? '' : 'none';
  document.getElementById('mdRecibido').textContent = fmt(totalRecibido);
  document.getElementById('mdPagado').textContent = fmt(totalPagado);

  const movs = [...(d.movimientos || [])].sort((a, b) => {
    const fechaDiff = (b.fecha || '').localeCompare(a.fecha || '');
    if (fechaDiff !== 0) return fechaDiff;
    return (b.ts || 0) - (a.ts || 0);
  });
  const histEl = document.getElementById('mdHistorial');
  if (!movs.length) {
    histEl.innerHTML = '<div style="font-size:12px;color:var(--text3);padding:4px 0 8px;">Sin movimientos aún.</div>';
  } else {
    histEl.innerHTML = html`${movs.map(m => {
      const esRecibido = m.tipo === 'recibido';
      const cuentaRef = esRecibido ? m.destino : m.fuente;
      return html`<div class="card card-sm" style="margin-bottom:7px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <span class="badge ${esRecibido ? 'bg-amber' : 'bg-green'}" style="font-size:9px;">${esRecibido ? 'Me prestó' : 'Pago'}</span>
              ${m.nota ? html` <span style="font-size:11px;color:var(--text2);">${m.nota}</span>` : ''}
            </div>
            <div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;margin-top:3px;">${m.fecha}${cuentaRef ? raw(' · ' + _fuenteLabelHtml(cuentaRef)) : ''}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
            <div style="font-size:14px;font-weight:500;font-family:'DM Mono',monospace;color:${esRecibido ? 'var(--red)' : 'var(--accent)'};">${esRecibido ? '+' : '−'} ${fmt(m.monto)}</div>
            <button type="button" class="btn-icon" style="color:var(--text3);min-width:36px;min-height:36px;" ${raw(Events.attr('prestado:eliminarMovMiDeuda', d.id, m.id))}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
          </div>
        </div>
      </div>`;
    })}`;
  }

  document.getElementById('misDeudasView').style.display = 'none';
  document.getElementById('miDeudaDetalle').style.display = 'block';
  const _pt3 = document.getElementById('prestamos-tabs');
  if (_pt3) _pt3.style.display = 'none';
  document.getElementById('scrollArea').scrollTop = 0;
}

function volverMisDeudas() {
  miDeudaActualId = null;
  document.getElementById('misDeudasView').style.display = '';
  document.getElementById('miDeudaDetalle').style.display = 'none';
  const _pt4 = document.getElementById('prestamos-tabs');
  if (_pt4) _pt4.style.display = 'flex'; // ver nota en volverDeudores() — no usar ''
}

let _mdMovTipo = 'recibido';
function abrirMovMiDeuda(tipo) {
  _mdMovTipo = tipo;
  document.getElementById('mdMovSheetTitle').textContent = tipo === 'recibido' ? 'Me prestó más' : 'Registrar pago';
  document.getElementById('md_cuenta_label').textContent = tipo === 'recibido' ? '¿A qué cuenta entró la plata?' : '¿De qué cuenta sale el pago?';
  document.getElementById('md_cuenta_hint').textContent = tipo === 'recibido' ? 'Se sumará automáticamente al saldo de esa cuenta' : 'Se descontará automáticamente del saldo de esa cuenta';
  const sel = document.getElementById('md_cuenta');
  const fuentes = getFuentesSinTC();
  sel.innerHTML = html`<option value>Sin especificar</option>${fuentes.map(f => html`<option value="${f.val}">${f.label}</option>`)}`;
  document.getElementById('md_monto').value = '';
  document.getElementById('md_fecha').value = hoy();
  document.getElementById('md_nota').value = '';
  openSheet('mov-mi-deuda');
}

function confirmarMovMiDeuda() {
  const d = (S.misDeudas || []).find(x => x.id === miDeudaActualId);
  if (!d) return;
  const monto = parseMoney(document.getElementById('md_monto').value) || 0;
  if (!monto) { toast('Ingresa un monto', 'err'); return; }
  const fecha = document.getElementById('md_fecha').value || hoy();
  const cuenta = document.getElementById('md_cuenta').value;
  const nota = (document.getElementById('md_nota').value || '').trim();

  if (_mdMovTipo === 'recibido') {
    let movSecId = null;
    if (cuenta) {
      sumarFuente(cuenta, monto);
      movSecId = uid();
      const descSec = `Me prestó — ${d.nombre}`;
      if (cuenta === 'efectivo' || cuenta === 'nequi') {
        if (!S.movimientos) S.movimientos = [];
        S.movimientos.push({ id: movSecId, tipo: 'entrada', fuente: cuenta, monto, fecha, desc: descSec, _secundario: true, _origenSeccion: 'Prestado · Yo debo' });
      } else if (cuenta.startsWith('custom:')) {
        const cId = cuenta.split(':')[1];
        const cObj = (S.cuentasPersonalizadas || []).find(x => x.id === cId);
        if (cObj) {
          if (!cObj.movimientos) cObj.movimientos = [];
          cObj.movimientos.push({ id: movSecId, tipo: 'ingreso', monto, fecha, nota: descSec, _secundario: true, _origenSeccion: 'Prestado · Yo debo' });
        }
      } else if (cuenta.startsWith('cajita:')) {
        const cId = cuenta.split(':')[1];
        const cObj = (S.cajitas || []).find(x => x.id === cId);
        if (cObj) {
          if (!cObj.historial) cObj.historial = [];
          cObj.historial.push({ id: movSecId, tipo: 'entrada', monto, fecha, nota: descSec, _secundario: true, _origenSeccion: 'Prestado · Yo debo' });
        }
      }
    }
    d.movimientos.push({ id: uid(), tipo: 'recibido', monto, fecha, destino: cuenta || undefined, nota, ts: Date.now(), _movSecId: movSecId || undefined });
  } else {
    const saldoActual = getMiDeudaSaldo(d);
    if (monto > saldoActual + 1) {
      toast(`Solo le debes ${fmt(saldoActual)}`, 'err');
      return;
    }
    let movSecId = null;
    if (cuenta) {
      descontarFuente(cuenta, monto);
      movSecId = uid();
      const descSec = `Pago de deuda — ${d.nombre}`;
      if (cuenta === 'efectivo' || cuenta === 'nequi') {
        if (!S.movimientos) S.movimientos = [];
        S.movimientos.push({ id: movSecId, tipo: 'salida', fuente: cuenta, monto, fecha, desc: descSec, _secundario: true, _origenSeccion: 'Prestado · Yo debo' });
      } else if (cuenta.startsWith('custom:')) {
        const cId = cuenta.split(':')[1];
        const cObj = (S.cuentasPersonalizadas || []).find(x => x.id === cId);
        if (cObj) {
          if (!cObj.movimientos) cObj.movimientos = [];
          cObj.movimientos.push({ id: movSecId, tipo: 'egreso', monto, fecha, nota: descSec, _secundario: true, _origenSeccion: 'Prestado · Yo debo' });
        }
      } else if (cuenta.startsWith('cajita:')) {
        const cId = cuenta.split(':')[1];
        const cObj = (S.cajitas || []).find(x => x.id === cId);
        if (cObj) {
          if (!cObj.historial) cObj.historial = [];
          cObj.historial.push({ id: movSecId, tipo: 'salida', monto, fecha, nota: descSec, _secundario: true, _origenSeccion: 'Prestado · Yo debo' });
        }
      }
    }
    d.movimientos.push({ id: uid(), tipo: 'pago', monto, fecha, fuente: cuenta || undefined, nota, ts: Date.now(), _movSecId: movSecId || undefined });
  }
  save(); refresh(); closeSheet('mov-mi-deuda');
  abrirMiDeuda(d.id);
  toast('Movimiento registrado', 'ok');
}

// Cuenta afectada por un movimiento de "mis deudas" — destino si fue plata
// recibida, fuente si fue un pago hecho.
function _miDeudaCuentasDe(m) {
  if (m.tipo === 'recibido') return m.destino ? [m.destino] : [];
  return m.fuente ? [m.fuente] : [];
}
function _miDeudaOpsPosteriores(d, m) {
  if (!m.fecha) return 0;
  const cuentas = _miDeudaCuentasDe(m);
  if (!cuentas.length) return 0;
  return (d.movimientos || []).filter(m2 => m2.id !== m.id && m2.fecha && m2.fecha > m.fecha && _miDeudaCuentasDe(m2).some(c => cuentas.includes(c))).length;
}
// True si borrar este movimiento de "mis deudas" realmente revierte el
// saldo de una cuenta real. Un "recibido" sin destino o un "pago" sin
// fuente (ambos "Sin especificar") no mueven nada.
function _miDeudaTieneCuentaAfectada(m) {
  return m.tipo === 'recibido' ? !!m.destino : !!m.fuente;
}

async function eliminarMovMiDeuda(deudaId, movId) {
  const d = (S.misDeudas || []).find(x => x.id === deudaId);
  if (!d) return;
  const m = (d.movimientos || []).find(x => x.id === movId);
  if (!m) return;

  // Protección por antigüedad — ver docs/proteccion-antiguedad-movimientos.md.
  // Solo aplica si _miDeudaTieneCuentaAfectada(m) — un movimiento "Sin
  // especificar" no revierte ningún saldo real.
  if (_miDeudaTieneCuentaAfectada(m)) {
    const opsPosteriores = _miDeudaOpsPosteriores(d, m);
    const nivel = nivelAntiguedadMovimiento(m.fecha, opsPosteriores, 'prestamos');
    if (nivel === 'bloqueado') {
      await avisarMovimientoBloqueado();
      return;
    }
    if (nivel === 'viejo') {
      const cuentas = _miDeudaCuentasDe(m);
      const nombreCuenta = cuentas.length > 1 ? `${cuentas.length} cuentas` : fuenteLabel(cuentas[0]);
      const ok = await confirmarBorrarMovimientoViejo(nombreCuenta, m.monto || 0, m.tipo === 'recibido' ? 'baja' : 'sube');
      if (!ok) return;
    }
  }

  // Revertir el efecto en la cuenta involucrada
  if (m.tipo === 'recibido' && m.destino) {
    descontarFuente(m.destino, m.monto);
    // Eliminar movimiento secundario si existe
    if (m._movSecId) {
      if (m.destino === 'efectivo' || m.destino === 'nequi') {
        S.movimientos = (S.movimientos || []).filter(x => x.id !== m._movSecId);
      } else if (m.destino.startsWith('custom:')) {
        const cId = m.destino.split(':')[1];
        const cObj = (S.cuentasPersonalizadas || []).find(x => x.id === cId);
        if (cObj && cObj.movimientos) cObj.movimientos = cObj.movimientos.filter(x => x.id !== m._movSecId);
      } else if (m.destino.startsWith('cajita:')) {
        const cId = m.destino.split(':')[1];
        const cObj = (S.cajitas || []).find(x => x.id === cId);
        if (cObj && cObj.historial) cObj.historial = cObj.historial.filter(x => x.id !== m._movSecId);
      }
    }
  } else if (m.tipo === 'pago' && m.fuente) {
    sumarFuente(m.fuente, m.monto);
    // Eliminar movimiento secundario si existe
    if (m._movSecId) {
      if (m.fuente === 'efectivo' || m.fuente === 'nequi') {
        S.movimientos = (S.movimientos || []).filter(x => x.id !== m._movSecId);
      } else if (m.fuente.startsWith('custom:')) {
        const cId = m.fuente.split(':')[1];
        const cObj = (S.cuentasPersonalizadas || []).find(x => x.id === cId);
        if (cObj && cObj.movimientos) cObj.movimientos = cObj.movimientos.filter(x => x.id !== m._movSecId);
      } else if (m.fuente.startsWith('cajita:')) {
        const cId = m.fuente.split(':')[1];
        const cObj = (S.cajitas || []).find(x => x.id === cId);
        if (cObj && cObj.historial) cObj.historial = cObj.historial.filter(x => x.id !== m._movSecId);
      }
    }
  }

  d.movimientos = d.movimientos.filter(x => x.id !== movId);
  save(); refresh();
  abrirMiDeuda(deudaId);
}

async function eliminarMiDeuda() {
  const d = (S.misDeudas || []).find(x => x.id === miDeudaActualId);
  if (!d) return;
  const saldo = getMiDeudaSaldo(d);
  if (Math.abs(saldo) > 1) {
    await dialogo('No se puede eliminar', `Aún le debes ${fmt(saldo)} a ${escHtml(d.nombre)}. Registra el pago completo antes de eliminar.`, 'Entendido', false);
    return;
  }
  const ok = await dialogo('Eliminar deuda', `¿Eliminar el registro de deuda con ${escHtml(d.nombre)}? Esta acción no se puede deshacer.`, 'Eliminar', true);
  if (!ok) return;
  S.misDeudas = (S.misDeudas || []).filter(x => x.id !== miDeudaActualId);
  save(); refresh();
  volverMisDeudas();
}

/* ── PRÉSTAMO CON TARJETA DE CRÉDITO ─────────────────────────────────────── */

diffRegistrarInstancia('prtc', {
  ids: { wrap: 'prtc-dif-wrap', body: 'prtc-dif-body', icon: 'prtc-dif-icon', real: 'prtc_dif_real', resumen: 'prtc-dif-resumen' },
  permiteBeneficiarios: false,
  permiteIntercambio: false,
  permiteMiCuenta: false, // el margen quedó prestado directamente — nunca tocó una cuenta tuya
  flagIngresoFantasma: '_prestadoDirectamente',
  getDijo: () => parseMoney(document.getElementById('prtc_monto')?.value) || 0,
  descMargen: (mov) => `Margen préstamo TC — ${mov._deudorNombre || ''}: `
});

// Wrappers con los nombres viejos — el HTML del sheet sigue llamándolos igual
function _prtcDifToggle() { diffToggle('prtc'); }
function _prtcDifResumen() { diffResumen('prtc'); }

function abrirSheetPrestamoTC() {
  if (!deudorActualId) return;
  const tcs = (S.tarjetasCredito || []).filter(tc => (tc.estado||'activa')==='activa');
  if (!tcs.length) { toast('No tenés tarjetas de crédito activas configuradas', 'err', 3000); return; }
  const sel = document.getElementById('prtc_tarjeta');
  if (sel) {
    sel.innerHTML = html`<option value="">Seleccionar TC</option>${tcs.map(tc => html`<option value="${tc.id}">${tc.nombre}${tc.deuda ? ' — deuda: ' + fmt(tc.deuda) : ''}</option>`)}`;
  }
  const fecEl = document.getElementById('prtc_fecha');
  if (fecEl) fecEl.value = hoy();
  const descEl = document.getElementById('prtc_desc'); if (descEl) descEl.value = '';
  const montoEl = document.getElementById('prtc_monto'); if (montoEl) montoEl.value = '';
  const notaEl = document.getElementById('prtc_nota'); if (notaEl) notaEl.value = '';
  const prev = document.getElementById('prtc_preview'); if (prev) prev.textContent = '';
  diffReset('prtc');
  // Selector de a cuál préstamo va (o si es uno aparte) — mismo mecanismo
  // que "Registrar movimiento". El préstamo con TC siempre es tipo
  // 'prestamo', así que el checkbox "es un préstamo aparte" aplica igual.
  _initGrupoSelector('prtc', true);
  openSheet('prestamo-tc');
}

function confirmarPrestamoTC() {
  const d = (S.deudores || []).find(x => x.id === deudorActualId);
  if (!d) return;
  const desc  = (document.getElementById('prtc_desc').value || '').trim();
  const dijo  = parseMoney(document.getElementById('prtc_monto').value) || 0;
  const tcId  = document.getElementById('prtc_tarjeta').value;
  const fecha = document.getElementById('prtc_fecha').value || hoy();
  const nota  = (document.getElementById('prtc_nota').value || '').trim();

  if (!desc)  { toast('Ingresa una descripción', 'err'); return; }
  if (!dijo)  { toast('Ingresa un monto válido', 'err'); return; }
  if (!tcId)  { toast('Selecciona la tarjeta de crédito', 'err'); return; }

  const tc = (S.tarjetasCredito || []).find(t => t.id === tcId);
  if (!tc) { toast('TC no encontrada', 'err'); return; }

  // Leer diferencial si está activo, vía el motor común
  const difActivo = diffEstaAbierto('prtc');
  const calc = difActivo ? diffCalcular('prtc') : null;
  const real = calc ? calc.real : 0;
  // Monto real que cobró la TC: si hay diferencial es 'real', si no es igual a lo que dijiste
  const montoTC = (real > 0) ? real : dijo;
  const margen  = dijo - montoTC; // >0 cuando dijiste más de lo que costó

  // 1. Registrar el préstamo en el deudor con el monto que le dijiste
  if (!d.movimientos) d.movimientos = [];
  const movId = uid();
  const movObj = {
    id: movId,
    tipo: 'prestamo',
    monto: dijo,
    fecha,
    nota: nota || `Compra con ${tc.nombre}: ${desc}`,
    _viaTC: true,
    _tcId: tcId,
    _tcMonto: montoTC,
    _tcDesc: desc,
    grupoId: _resolverGrupoIdSel('prtc', d, fecha),
    ts: Date.now()
  };
  d.movimientos.push(movObj);

  // 2. La TC se carga solo con lo que realmente costó
  tc.deuda = (tc.deuda || 0) + montoTC;

  // 3. tcMovimientos con el monto real de la TC
  if (!S.tcMovimientos) S.tcMovimientos = [];
  S.tcMovimientos.push({
    id: uid(),
    tcId,
    tipo: 'cargo_prestamo',
    desc: `Préstamo ${d.nombre}: ${desc}`,
    monto: montoTC,
    fecha,
    nota: nota || 'Compra a nombre propio para prestarle a alguien — no es gasto tuyo',
    deudorId: d.id,
    _deudorMovId: movId
  });

  // 4. El margen es un ingreso real — solo que quedó prestado directamente, nunca tocó una cuenta.
  //    El motor lo registra como ingreso fantasma (fuente:'', flag _prestadoDirectamente) y
  //    deja el resumen en movObj.diferencial para futuro uso en el historial.
  if (margen > 0.5) {
    const diferencial = diffAplicar('prtc', { desc, fecha, _deudorNombre: d.nombre });
    if (diferencial) movObj.diferencial = diferencial;
  }

  save(); refresh();
  closeSheet('prestamo-tc');
  abrirDeudor(deudorActualId);
  toast(`Préstamo con TC registrado — ${escHtml(d.nombre)} te debe ${fmt(dijo)}`, 'ok', 3500);
}
/* ── ABONO desde encargo: dividir entre VARIAS cuentas del encargo ──────────
   (ej: el encargo tiene 400mil en Nequi y 100mil en efectivo, y el abono de
   500mil sale de ambas a la vez). Reutiliza el motor genérico de splits. ── */
let _abonoEncCuentaSplitMode = false;

crearSplitWidget('abonoEncCuenta', {
  simpleId: 'mov_enc_cuenta_simple', splitId: 'mov_enc_cuenta_split',
  toggleId: 'mov_enc_cuenta_split_toggle', rowsId: 'mov_enc_cuenta_split_rows',
  getModo: () => _abonoEncCuentaSplitMode, setModo: v => { _abonoEncCuentaSplitMode = v; },
  getFuentesFn: _getAbonoEncCuentaFuentesOptions,
  onPreview: _abonoEncCuentaSplitPreview
});

function _abonoEncCuentaSplitToggle() { splitToggle('abonoEncCuenta'); }
function _abonoEncCuentaAgregarSplitRow() { splitAgregarRow('abonoEncCuenta'); }
function _getAbonoEncCuentaSplitData() { return splitGetData('abonoEncCuenta'); }

// Resetea el botón "Dividir ÷" de abonoEncCuenta a su estado visual por defecto
// (texto Y color). Antes había 3 resets parciales sueltos que solo tocaban el
// texto y dejaban el botón pintado de ámbar si el usuario venía de estar en
// modo "dividir" — ver docs/CHANGELOG.md.
function _resetEncCuentaSplitToggleStyle() {
  const btn = document.getElementById('mov_enc_cuenta_split_toggle');
  if (!btn) return;
  btn.textContent = 'Dividir ÷';
  btn.style.background = 'rgba(200,240,96,.1)';
  btn.style.borderColor = 'rgba(200,240,96,.3)';
  btn.style.color = 'var(--accent)';
}

function _getAbonoEncCuentaFuentesOptions(selectedVal) {
  const enc = _abonoEncId ? (S.encargos || []).find(e => e.id === _abonoEncId) : null;
  const cuentasConSaldo = enc ? _getEncargoSaldoPorCuenta(enc) : [];
  return buildFuentesOptsHtml({ selectedVal, mostrarSaldo: true, fuentesCustom: cuentasConSaldo });
}

function _abonoEncCuentaSplitPreview() {
  const el = document.getElementById('mov_enc_cuenta_split_resumen');
  if (!el) return;
  const monto = parseMoney(document.getElementById('mov_monto').value) || 0;
  const enc = _abonoEncId ? (S.encargos || []).find(e => e.id === _abonoEncId) : null;
  const splits = _getAbonoEncCuentaSplitData();
  if (!splits.length) { el.textContent = ''; return; }
  const total = splits.reduce((a, s) => a + (s.monto || 0), 0);
  const restante = monto - total;
  const lines = raw(splits.map(s => `${s.fuente ? _fuenteLabelHtml(s.fuente) : 'Sin esp.'}: ${fmt(s.monto)}`).join(' · '));

  // Validar que ninguna cuenta del encargo se pase de lo que tiene guardado
  let excedeCuenta = false;
  if (enc) {
    const porCuenta = {};
    splits.forEach(s => { if (s.fuente) porCuenta[s.fuente] = (porCuenta[s.fuente] || 0) + s.monto; });
    for (const cuenta in porCuenta) {
      if (porCuenta[cuenta] > _getEncargoSaldoEnCuenta(enc, cuenta) + 0.5) { excedeCuenta = true; break; }
    }
  }

  if (excedeCuenta) { el.innerHTML = html`${lines} · <span style="color:var(--red);">excede el saldo de esa cuenta</span>`; el.style.color = 'var(--red)'; }
  else if (Math.abs(restante) < 1) { el.innerHTML = html`${lines} &#x2713;`; el.style.color = 'var(--accent)'; }
  else if (restante > 0) { el.innerHTML = html`${lines} · Sin asignar: ${fmt(restante)}`; el.style.color = 'var(--amber)'; }
  else { el.innerHTML = html`${lines} · Excede: ${fmt(-restante)}`; el.style.color = 'var(--red)'; }
}
function editarDeudorActual() {
  if (!deudorActualId) return;
  const d = (S.deudores || []).find(x => x.id === deudorActualId);
  if (!d) return;
  // Todo deudor está vinculado a una persona en S.personas. Si por algún
  // motivo un registro legado no tiene el vínculo todavía, se crea aquí
  // para no perder su nombre/color al editar.
  if (!d.personaId) {
    let p = (S.personas || []).find(x => x.nombre.trim().toLowerCase() === (d.nombre || '').trim().toLowerCase());
    if (!p) {
      if (!S.personas) S.personas = [];
      p = { id: uid(), nombre: d.nombre || '', color: d.color || '#60b0f0', creadoEn: hoy() };
      S.personas.push(p);
    }
    d.personaId = p.id;
    save();
  }
  // Usar el sheet unificado "Editar persona" (misma paleta completa y misma
  // lógica de sincronización que en la sección Personas), en vez del sheet
  // desactualizado propio de Préstamos.
  abrirEditarPersonaGlobal(d.personaId);
}

/* ═══════════════════════════════════════════════════════════════
   WRAPPERS — dan nombre a acciones que antes eran arrow functions
   inline en el addEventListener ad-hoc de index.html (_initEventListeners),
   para poder registrarlas en Events con un nombre, igual que el resto.
   ═══════════════════════════════════════════════════════════════ */

function _abrirSheetNuevaPersona() {
  openSheet('nueva-persona');
}

// Wrapper para el avatar del header de "Me deben" — el HTML es estático
// (no se re-renderiza en cada abrirDeudor), así que no puede llevar el id
// del deudor "quemado" en data-args: necesita leer deudorActualId en el
// momento del click, igual que ya hacía _abrirPerfilDesdeMiDeudaActual()
// del lado de "Yo debo".
function _abrirPerfilDesdeDeudorActual() {
  _abrirPerfilDesdeDeudor(deudorActualId);
}

function _abrirSheetNuevoPrestamo() {
  openSheet('registrar-movimiento');
  initMovSheet('prestamo');
}

function _abrirSheetAbono() {
  const d = (S.deudores || []).find(x => x.id === deudorActualId);
  if (!d) return;
  const saldo = getDeudorSaldo(d);
  if (saldo <= 0) { toast('No hay saldo pendiente', 'info'); return; }
  openSheet('registrar-movimiento');
  initMovSheet('abono');
}

function _abrirSheetPagoCompleto() {
  const d = (S.deudores || []).find(x => x.id === deudorActualId);
  if (!d) return;
  const saldo = getDeudorSaldo(d);
  if (saldo <= 0) { toast('No hay saldo pendiente', 'info'); return; }
  openSheet('registrar-movimiento');
  initMovSheet('pago-completo');
  document.getElementById('mov_monto').value = fmtInput(saldo);
}

function _abrirSheetNuevaDeuda() {
  document.getElementById('nd_fecha').value = hoy();
  _ndPoblarSelectDestino();
  openSheet('nueva-deuda');
}

function _abrirMovMiDeudaRecibido() {
  abrirMovMiDeuda('recibido');
}

function _abrirMovMiDeudaPago() {
  const d = (S.misDeudas || []).find(x => x.id === miDeudaActualId);
  if (!d) return;
  const saldo = getMiDeudaSaldo(d);
  if (saldo <= 0) { toast('No hay saldo pendiente', 'info'); return; }
  abrirMovMiDeuda('pago');
}

function _prestAddSplitRow() {
  _prestSplitRows.push({ fuente: '', monto: 0 });
  _renderPrestSplit();
}

// Antes vivía como función anónima inline sobre movBtnConfirm en
// _initEventListeners. El bloqueo anti doble-click/doble-tap se preserva
// igual — Events le pasa el propio <button> como último argumento, así
// que no hace falta buscarlo por id.
function _confirmarMovimientoConGuard(el) {
  if (el.disabled) return;
  el.disabled = true;
  try { confirmarMovimiento(); }
  finally { setTimeout(() => { el.disabled = false; }, 500); }
}

/* ═══════════════════════════════════════════════════════════════
   REGISTRO DE EVENTOS — todo lo que antes eran onclick="..." inline
   (24 en el HTML/renders de este módulo) o addEventListener sueltos
   en el _initEventListeners de index.html, ahora en un solo lugar.

   abrirDetalleMov y abrirPerfilPersona se envuelven en una función
   anónima (en vez de pasarse directo) porque se definen más abajo en
   index.html — pasarlas directo acá las capturaría como `undefined`
   en el momento en que este script carga. Envueltas así, la búsqueda
   del nombre global ocurre recién al hacer click, cuando la página ya
   terminó de cargar por completo. Mismo motivo, en el fondo, por el
   que Spotify y Encargos necesitaron un archivo -personas.js aparte;
   acá alcanza con esto porque son solo dos referencias sueltas, no un
   bloque entero de integración.
   ═══════════════════════════════════════════════════════════════ */
Events.registerAll('prestado', {
  // Me deben
  cambiarTabPrestamos: cambiarTabPrestamos,
  abrirDeudor: abrirDeudor,
  abrirPerfilDeudor: _abrirPerfilDesdeDeudor,
  abrirPerfilDeudorActual: _abrirPerfilDesdeDeudorActual,
  volverDeudores: volverDeudores,
  eliminarDeudorActual: eliminarDeudorActual,
  editarDeudorActual: editarDeudorActual,
  eliminarMovDeudor: eliminarMovDeudor,
  abrirDetalleMov: (el, evt) => abrirDetalleMov(el, evt),
  addDeudor: addDeudor,
  abrirSheetNuevaPersona: _abrirSheetNuevaPersona,

  // Sheet "nuevo movimiento" (préstamo / abono / pago completo)
  abrirSheetNuevoPrestamo: _abrirSheetNuevoPrestamo,
  abrirSheetAbono: _abrirSheetAbono,
  abrirSheetPagoCompleto: _abrirSheetPagoCompleto,
  confirmarMovimientoGuard: _confirmarMovimientoConGuard,
  togglePrestSplit: togglePrestSplit,
  prestAddSplitRow: _prestAddSplitRow,
  prestSplitDelRow: prestSplitDelRow,
  toggleAbonoSplit: toggleAbonoSplit,
  abonoAddSplitRow: abonoAddSplitRow,
  toggleExtraSection: toggleExtraSection,
  extAddParte: extAddParte,
  extDelParte: extDelParte,
  abonoEncCuentaSplitToggle: _abonoEncCuentaSplitToggle,
  abonoEncCuentaAgregarSplitRow: _abonoEncCuentaAgregarSplitRow,

  // Préstamo con TC
  abrirSheetPrestamoTC: abrirSheetPrestamoTC,
  prtcDifToggle: _prtcDifToggle,
  confirmarPrestamoTC: confirmarPrestamoTC,

  // Yo debo
  abrirSheetNuevaDeuda: _abrirSheetNuevaDeuda,
  crearMiDeuda: (...args) => crearMiDeuda(...args), // arrow-wrap: se reasigna más abajo en este mismo archivo (antes lo hacían prestado-personas.js y deudores-personas.js, hoy fusionados acá — mismo patrón que encargos.js)
  volverMisDeudas: volverMisDeudas,
  eliminarMiDeuda: eliminarMiDeuda,
  abrirMiDeuda: abrirMiDeuda,
  abrirPerfilPersonaDeDeuda: (personaId) => abrirPerfilPersona(personaId),
  eliminarMovMiDeuda: eliminarMovMiDeuda,
  abrirMovMiDeudaRecibido: _abrirMovMiDeudaRecibido,
  abrirMovMiDeudaPago: _abrirMovMiDeudaPago,
  confirmarMovMiDeuda: confirmarMovMiDeuda,
});

/* Único listener que no es de click (Events solo despacha clicks): igual
   que antes, sigue como addEventListener directo — nunca fue un atributo
   inline, así que no aportaba nada al conteo de onclick pendientes ni a
   la CSP. Se preserva tal cual estaba en _initEventListeners.
   Se le agregó _onMovMontoInput (antes un segundo listener aparte en
   index.html, sobre el mismo mov_monto) para no dejar dos addEventListener
   separados sobre el mismo campo. */
{
  const movMonto = document.getElementById('mov_monto');
  if (movMonto) movMonto.addEventListener('input', () => {
    if (_prestSplitMode) _updatePrestSplitResumen();
    _onMovMontoInput();
  });
}

/* ═══════════════════════════════════════════════════════════════
   WIRING MIGRADO DESDE index.html (_initEventListeners) — resto de
   inputs/selects con oninput/onchange del sheet "Registrar
   movimiento" (préstamo/abono/pago completo, sección "Extra") y el
   preview del motor Diferencial de "Préstamo con TC" (instancia
   'prtc'). mov_fuente también es de este sheet, pese al nombre
   parecido a otros selectores _fuente ya migrados a Cuentas/Gastos.
   ═══════════════════════════════════════════════════════════════ */
[
  ['mov_desde_encargo', 'change', toggleDesdeEncargo],
  ['mov_enc_sel', 'change', onChangeMov_enc_sel],
  ['mov_enc_cuenta', 'change', onChangeMov_enc_cuenta],
  ['mov_tiene_extra', 'change', toggleExtraSection],
  ['mov_extra_monto', 'input', extResumenPartes],
  ['prtc_dif_real', 'input', _prtcDifResumen],
].forEach(([elId, evt, fn]) => {
  const el = document.getElementById(elId);
  if (el) el.addEventListener(evt, fn);
});

const movFuente = document.getElementById('mov_fuente');
if (movFuente) movFuente.addEventListener('change', () => mostrarAlertaFuente('mov'));

/* ═══════════════════════════════════════════════════════════════
   INTEGRACIÓN CON EL SISTEMA DE PERSONAS
   (antes js/modules/prestado-personas.js — fusionado acá el 2026-08-03)

   Crear/vincular persona al agregar un deudor o una deuda, refrescar
   el detalle abierto cuando se edita desde el sheet global de
   Personas, navegación cruzada entre perfil y deudor/deuda, y el
   sheet "Editar mi deuda". Ver docs/prestado.md.

   A diferencia de encargos-personas.js/spotify-personas.js, ESTE
   archivo sí tenía una dependencia real de nivel superior contra
   personas.js (PERSONA_COLORES, _guardarEditarPersonaGlobal, leídos
   al parsear, no dentro de una función) — confirmado, no una premisa
   falsa. Por eso el archivo fusionado completo (prestado.js +
   prestado-personas.js + deudores-personas.js) se movió a cargar
   después de personas.js Y después de sheet-stack.js (que define
   openSheet, necesario por deudores-personas.js más abajo) — ver el
   nuevo comentario de posición en index.html y CHANGELOG.md#préstamos.
   ═══════════════════════════════════════════════════════════════ */

function _irADeudor(deudorId) {
  document.getElementById('sheet-perfil-persona').classList.remove('open');
  setTimeout(() => { showScreen('prestamos'); abrirDeudor(deudorId); }, 180);
}

const _origAddDeudorPersonas = addDeudor;
addDeudor = function() {
  // Cuando se crea un deudor, también crear/vincular en S.personas
  const nombre = document.getElementById('np_nombre').value.trim();
  const color = typeof npColorSel !== 'undefined' ? npColorSel : '#60b0f0';
  if (!nombre) { _origAddDeudorPersonas.apply(this, arguments); return; }

  // Llamar al original primero (crea el deudor en S.deudores)
  _origAddDeudorPersonas.apply(this, arguments);

  // Vincular el deudor recién creado a S.personas
  const deudor = (S.deudores || []).find(d => d.nombre === nombre && !d.personaId);
  if (deudor) {
    let p = (S.personas || []).find(x => x.nombre.trim().toLowerCase() === nombre.toLowerCase());
    if (!p) {
      if (!S.personas) S.personas = [];
      p = { id: uid(), nombre, color: color, creadoEn: hoy() };
      S.personas.push(p);
    } else {
      p.color = color;
    }
    deudor.personaId = p.id;
    save();
  }
};

/* ── Hook: si el detalle de un deudor (Préstamos > me deben) está abierto */
/* y se guarda desde el sheet unificado "Editar persona", refrescar su    */
/* encabezado (nombre/avatar) para reflejar el cambio al instante. ────── */
const _origGuardarEditarPersonaGlobalDeudor = _guardarEditarPersonaGlobal;
_guardarEditarPersonaGlobal = function() {
  const idEditado = _editPersonaGlobalId;
  _origGuardarEditarPersonaGlobalDeudor.apply(this, arguments);
  const d = (S.deudores || []).find(x => x.id === deudorActualId);
  if (d && d.personaId === idEditado) {
    const detalle = document.getElementById('deudorDetalle');
    if (detalle && detalle.style.display !== 'none') abrirDeudor(deudorActualId);
  }
};


const _origCrearMiDeudaPersonas = crearMiDeuda;
crearMiDeuda = function() {
  const nombre = (document.getElementById('nd_nombre').value || '').trim();
  if (!nombre) { _origCrearMiDeudaPersonas.apply(this, arguments); return; }
  _origCrearMiDeudaPersonas.apply(this, arguments);
  // Vincular la misDeuda recién creada a S.personas (crear si no existe)
  const deuda = (S.misDeudas || []).find(d => d.nombre === nombre && !d.personaId);
  if (deuda) {
    if (!S.personas) S.personas = [];
    let p = S.personas.find(x => x.nombre.trim().toLowerCase() === nombre.toLowerCase());
    if (!p) {
      p = { id: uid(), nombre, color: deuda.color || '#f06868', creadoEn: hoy() };
      S.personas.push(p);
    } else {
      // Si ya existe persona con ese nombre, usar su color en la deuda
      deuda.color = p.color || deuda.color;
    }
    deuda.personaId = p.id;
    save();
  }
};

/* ── Abrir perfil desde una misDeuda (crea persona si no tiene) ── */
function _abrirPerfilDesdeMiDeuda(miDeudaId) {
  if (!miDeudaId) return;
  const d = (S.misDeudas || []).find(x => x.id === miDeudaId);
  if (!d) return;
  _inyectarPersonaSheets();
  if (d.personaId) {
    abrirPerfilPersona(d.personaId);
    return;
  }
  // Crear persona vinculada on-the-fly
  if (!S.personas) S.personas = [];
  let p = S.personas.find(x => x.nombre.trim().toLowerCase() === (d.nombre || '').toLowerCase());
  if (!p) {
    p = { id: uid(), nombre: d.nombre, color: d.color || '#f06868', creadoEn: hoy() };
    S.personas.push(p);
  }
  d.personaId = p.id;
  save();
  abrirPerfilPersona(p.id);
}

function _abrirPerfilDesdeMiDeudaActual() {
  _abrirPerfilDesdeMiDeuda(miDeudaActualId);
}

function _irAMiDeuda(miDeudaId) {
  const perfEl = document.getElementById('sheet-perfil-persona');
  if (perfEl) perfEl.classList.remove('open');
  setTimeout(() => {
    showScreen('prestamos');
    cambiarTabPrestamos('yo-debo');
    if (typeof abrirMiDeuda === 'function') setTimeout(() => abrirMiDeuda(miDeudaId), 60);
  }, 180);
}

/* ── Editar mi deuda ─────────────────────────────────────────────── */
const PERSONA_COLORES_MD = PERSONA_COLORES; // misma paleta unificada
window._miDeudaEditColor = null;

function editarMiDeudaActual() {
  if (!miDeudaActualId) return;
  const d = (S.misDeudas || []).find(x => x.id === miDeudaActualId);
  if (!d) return;
  // Usar el color real de la persona si está vinculada
  const _pEdit = d.personaId && typeof getPersona === 'function' ? getPersona(d.personaId) : null;
  window._miDeudaEditColor = (_pEdit && _pEdit.color) ? _pEdit.color : (d.color || PERSONA_COLORES[4]);
  const inp = document.getElementById('md_edit_nombre');
  if (inp) inp.value = d.nombre || '';
  _renderColorPicker('md_edit_colores', '_miDeudaEditColor');
  if (typeof openSheet === 'function') openSheet('editar-mi-deuda');
}

function _mdPickColor(c) {
  window._miDeudaEditColor = c;
  _renderColorPicker('md_edit_colores', '_miDeudaEditColor');
}

function guardarEditarMiDeuda() {
  if (!miDeudaActualId) return;
  const d = (S.misDeudas || []).find(x => x.id === miDeudaActualId);
  if (!d) return;
  const nombre = (document.getElementById('md_edit_nombre').value || '').trim();
  if (!nombre) { if (typeof toast === 'function') toast('Ingresa el nombre', 'err'); return; }
  const nuevoColor = window._miDeudaEditColor || d.color;
  d.nombre = nombre;
  d.color = nuevoColor;
  // Sincronizar en S.personas si está vinculada (persona es la fuente de verdad)
  if (d.personaId && typeof getPersona === 'function') {
    const p = getPersona(d.personaId);
    if (p) { p.nombre = nombre; p.color = nuevoColor; }
  }
  if (typeof save === 'function') save();
  if (typeof refresh === 'function') refresh();
  abrirMiDeuda(miDeudaActualId);
  if (typeof closeSheet === 'function') closeSheet('editar-mi-deuda');
  if (typeof toast === 'function') toast(escHtml(nombre) + ' actualizado', 'ok');
}

/* ═══════════════════════════════════════════════════════════════
   REGISTRO DE EVENTOS

   Reemplaza dos cosas:
   1. Los onclick="..." inline que llaman a estas funciones desde el
      HTML de Personas (perfil de persona, lista de "yo debo" en el
      perfil) — 2 sitios, convertidos a data-action en index.html.
   2. El hook `window.addEventListener('appDataLoaded', () => setTimeout(...))`
      que conectaba btn-editar-mi-deuda / btn-guardar-editar-mi-deuda
      con addEventListener + un flag `_mdHook` para no duplicar el
      listener. Ese patrón existía porque _initEventListeners() corre
      una sola vez y estos botones podían no estar en el DOM todavía
      en ese momento. Con Events (un único listener delegado en
      `document`, siempre activo) ese problema desaparece por
      completo: no importa cuándo aparezca el botón en el DOM, alcanza
      con que tenga el data-action correcto. Se puede borrar el hook
      entero, incluido el setTimeout de 300ms y el flag _mdHook.
   ═══════════════════════════════════════════════════════════════ */
Events.registerAll('prestado-personas', {
  irADeudor: _irADeudor,
  irAMiDeuda: _irAMiDeuda,
  abrirPerfilMiDeuda: _abrirPerfilDesdeMiDeuda,
  abrirPerfilMiDeudaActual: _abrirPerfilDesdeMiDeudaActual,
  editarMiDeudaActual: editarMiDeudaActual,
  guardarEditarMiDeuda: guardarEditarMiDeuda,
});

/* ═══════════════════════════════════════════════════════════════
   INTEGRACIÓN "DEUDORES + PERSONAS"
   (antes js/modules/deudores-personas.js — fusionado acá el 2026-08-03)

   Mismo selector de persona (existente o nueva) en "Agregar persona"
   (Me deben) y "Nueva deuda" (Yo debo). Necesita openSheet y
   crearMiDeuda ya definidos/envueltos una vez (por el bloque de
   arriba) — satisfecho por estar en este mismo archivo, en este
   orden. Ver docs/prestado.md.
   ═══════════════════════════════════════════════════════════════ */


/* ── Me deben: "Agregar persona" abre directamente el selector ─── */
function _onSelPersonaMeDeben(personaId) {
  const p = getPersona(personaId);
  if (!p) return;
  // Antes se permitía a propósito que una misma persona tuviera varios
  // deudores separados (uno por cada préstamo). Ahora que existen los
  // grupos de préstamo (d.grupos[] — ver prestado.md §2.4), un préstamo
  // nuevo con alguien que ya está en la lista se maneja como un grupo
  // aparte DENTRO del mismo deudor, no como una persona duplicada en la
  // lista. Mismo patrón que _onSelPersonaNuevaDeuda (lado "Yo debo").
  const existente = (S.deudores || []).find(d => d.personaId === personaId);
  if (existente) {
    closeSheet('nueva-persona');
    toast(`${escHtml(p.nombre)} ya está en tu lista de "Me deben"`, 'info');
    showScreen('prestamos');
    cambiarTabPrestamos('me-deben');
    setTimeout(() => abrirDeudor(existente.id), 200);
    return;
  }
  if (!S.deudores) S.deudores = [];
  const d = { id: uid(), nombre: p.nombre, color: p.color || '#60b0f0', personaId: p.id, movimientos: [] };
  S.deudores.push(d);
  save(); refresh();
  toast(`${escHtml(p.nombre)} agregado/a`, 'ok');
  showScreen('prestamos');
  cambiarTabPrestamos('me-deben');
  abrirDeudor(d.id);
}

/* ── Yo debo: selector de persona dentro de "Nueva deuda" ───────── */
let _nuevaDeudaPersonaId = null;

function _initNuevaDeudaPersonaSelector() {
  const sheet = document.getElementById('sheet-nueva-deuda');
  if (!sheet || sheet._personaHook) return;
  sheet._personaHook = true;
  const ndNombreEl = document.getElementById('nd_nombre');
  if (!ndNombreEl) return;
  const ig = ndNombreEl.closest('.ig');
  if (!ig) return;
  ig.innerHTML = `
    <div class="il">¿A quién le debes?</div>
    <div id="nd-persona-btn"
      style="width:100%;padding:12px 14px;background:var(--bg3);border:1.5px solid var(--border2);
      border-radius:var(--radius-sm);color:var(--text2);font-size:15px;font-family:'DM Sans',sans-serif;
      cursor:pointer;display:flex;align-items:center;gap:10px;min-height:48px;transition:border-color .2s;">
      <div id="nd-persona-avatar" class="avatar" style="width:28px;height:28px;font-size:10px;margin:0;display:none;flex-shrink:0;"></div>
      <span id="nd-persona-label">Seleccionar persona...</span>
      <svg style="margin-left:auto;flex-shrink:0;" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
    </div>
    <input type="hidden" id="nd_nombre" value="">`;
  // Antes onclick="abrirSelPersona(_onSelPersonaNuevaDeuda)" inline — este bloque
  // solo se renderiza una vez (guardado por sheet._personaHook), así que alcanza
  // con adjuntar el listener una sola vez acá, igual que en splitAgregarRow.
  const ndBtn = document.getElementById('nd-persona-btn');
  if (ndBtn) ndBtn.addEventListener('click', () => abrirSelPersona(_onSelPersonaNuevaDeuda));
}

function _onSelPersonaNuevaDeuda(personaId) {
  const p = getPersona(personaId);
  if (!p) return;
  // ¿Ya existe una deuda registrada con esa persona?
  const existente = (S.misDeudas || []).find(d => d.personaId === personaId);
  if (existente) {
    closeSheet('nueva-deuda');
    toast(`Ya tienes una deuda registrada con ${escHtml(p.nombre)}`, 'info');
    showScreen('prestamos');
    cambiarTabPrestamos('yo-debo');
    setTimeout(() => abrirMiDeuda(existente.id), 200);
    return;
  }
  _nuevaDeudaPersonaId = personaId;
  document.getElementById('nd_nombre').value = p.nombre;
  const btn = document.getElementById('nd-persona-btn');
  const lbl = document.getElementById('nd-persona-label');
  const av = document.getElementById('nd-persona-avatar');
  if (btn) btn.style.borderColor = 'var(--accent)';
  if (lbl) { lbl.textContent = p.nombre; lbl.style.color = 'var(--text)'; }
  if (av) pintarAvatarPersona(av, p, { mostrar: true });
}

/* ── Hook en openSheet: 'nueva-persona' abre el selector directo;
     'nueva-deuda' inicializa su propio selector interno ────────── */
const _origOpenSheetMeDebenYoDebo = openSheet;
openSheet = function(id) {
  if (id === 'nueva-persona') {
    _inyectarPersonaSheets();
    abrirSelPersona(_onSelPersonaMeDeben);
    return;
  }
  if (id === 'nueva-deuda') {
    _inyectarPersonaSheets();
    _nuevaDeudaPersonaId = null;
    setTimeout(_initNuevaDeudaPersonaSelector, 30);
    setTimeout(() => {
      const lbl = document.getElementById('nd-persona-label');
      const av = document.getElementById('nd-persona-avatar');
      const btn = document.getElementById('nd-persona-btn');
      if (lbl) { lbl.textContent = 'Seleccionar persona...'; lbl.style.color = 'var(--text2)'; }
      if (av) av.style.display = 'none';
      if (btn) btn.style.borderColor = 'var(--border2)';
      const ndN = document.getElementById('nd_nombre');
      if (ndN) ndN.value = '';
    }, 50);
  }
  _origOpenSheetMeDebenYoDebo.apply(this, arguments);
};

/* ── Hook en crearMiDeuda: exigir persona seleccionada y usar su
     personaId real en vez de adivinar por coincidencia de nombre ── */
const _origCrearMiDeudaSelector = crearMiDeuda;
crearMiDeuda = function() {
  const ndN = document.getElementById('nd_nombre');
  if (ndN && !ndN.value.trim()) {
    const btn = document.getElementById('nd-persona-btn');
    if (btn) {
      btn.style.borderColor = 'var(--red)';
      setTimeout(() => { if (btn) btn.style.borderColor = 'var(--border2)'; }, 2000);
    }
    toast('Selecciona una persona', 'err');
    return;
  }
  const pId = _nuevaDeudaPersonaId;
  _origCrearMiDeudaSelector.apply(this, arguments);
  if (pId && S.misDeudas && S.misDeudas.length) {
    const last = S.misDeudas[S.misDeudas.length - 1];
    const p = getPersona(pId);
    if (last && p) {
      last.personaId = pId;
      last.nombre = p.nombre;
      last.color = p.color || last.color;
      save();
    }
  }
  _nuevaDeudaPersonaId = null;
};
