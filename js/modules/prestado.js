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

/* ---- PRÉSTAMO CON ORIGEN DIVIDIDO ----
   Migrado al motor genérico de split.js (crearSplitWidget/splitToggle/
   splitAgregarRow/splitGetData), igual que ya hacía 'abonoDestino' más
   abajo en este mismo archivo y Encargos en el suyo. Antes esta instancia
   tenía su propia implementación casera (_prestSplitRows + _renderPrestSplit)
   que había quedado desalineada del motor común: arrancaba con 1 sola fila
   en vez de 2, dejaba elegir tarjetas de crédito como fuente (getFuentes()
   en vez de getFuentesSinTC()) y no evitaba repetir la misma cuenta en dos
   filas (splitActualizarOpciones, que sí tienen el resto de instancias).
   Al pasar por el motor genérico las tres quedan resueltas de una: mínimo
   2 filas, exclusión de TC vía getFuentesSinTC(), y no-repetir-cuenta
   entre filas. */
let _prestSplitMode = false;

crearSplitWidget('prest', {
  simpleId:'mov_fuente_simple', splitId:'mov_fuente_split', toggleId:'mov_split_toggle', rowsId:'mov_split_rows',
  getModo:()=>_prestSplitMode, setModo:v=>{_prestSplitMode=v;},
  getFuentesFn:_getPrestSplitFuentesOptions,
  onPreview:_updatePrestSplitResumen
});

/* ---- "EL VALOR ERA DIFERENTE" EN NUEVO PRÉSTAMO (instancia 'prestamoDif') ----
   Caso: compré algo por 698.000 y le cobro 700.000 a la persona (siempre redondea).
   mov_monto = lo que le cobro (la deuda), real = lo que realmente salió de mi cuenta.
   El margen (dijo - real) es un ingreso mío, pero nunca tocó una cuenta (quedó prestado
   directamente) → mismo criterio que "Préstamo con TC" (instancia 'prtc'): ingreso fantasma
   fuente:'' (permiteMiCuenta:false), enlazado al préstamo para poder borrarlo con él. */
diffRegistrarInstancia('prestamoDif', {
  ids: { wrap: 'mov-dif-wrap', body: 'mov-dif-body', icon: 'mov-dif-icon', real: 'mov_dif_real', resumen: 'mov-dif-resumen' },
  permiteBeneficiarios: false,
  permiteIntercambio: false,
  permiteMiCuenta: false,
  exigeMargenPositivo: true,
  labelMargenNegativo: 'El valor real debe ser menor que lo que le cobras',
  flagIngresoFantasma: '_prestadoDirectamente',
  getDijo: () => parseMoney(document.getElementById('mov_monto')?.value) || 0,
  descMargen: (mov) => `Margen préstamo — ${mov._deudorNombre || ''}: `,
  // Con el split de cuentas abierto, "lo que falta repartir" depende del valor real.
  onToggle: () => { if (_prestSplitMode) _updatePrestSplitResumen(); },
  onResumen: () => { if (_prestSplitMode) _updatePrestSplitResumen(); }
});

// Plata que de verdad sale de las cuentas en este préstamo: el valor real si el bloque
// "El valor era diferente" está abierto y es menor que el monto cobrado; si no, el monto.
function _prestMontoSalida() {
  const monto = parseMoney(document.getElementById('mov_monto')?.value) || 0;
  if (!diffEstaAbierto('prestamoDif')) return monto;
  const calc = diffCalcular('prestamoDif');
  const real = calc ? calc.real : 0;
  return (real > 0 && real < monto - 0.5) ? real : monto;
}

function _movDifToggle() { diffToggle('prestamoDif'); }
function _movDifResumen() { diffResumen('prestamoDif'); }

function togglePrestSplit(){ splitToggle('prest'); }
function _prestAddSplitRow(){ splitAgregarRow('prest'); }

// Un préstamo dado nunca sale de una tarjeta de crédito propia (eso es
// "Préstamo con TC", un flujo aparte) — mismo filtro que ya usa
// _getAbonoDestinoFuentesOptions más abajo. Se agrega además la opción
// "ganancia" (plata virtual que nunca salió de ninguna cuenta), propia
// de esta instancia.
function _getPrestSplitFuentesOptions(selectedVal) {
  // Solo cuentas con saldo >= $1,00: de una cuenta vacía no puede salir el préstamo
  // (FuentesFiltro, js/core/fuentes-filtro.js). "Sin especificar" y "Ganancia" no se filtran.
  const fuentes = FuentesFiltro.filtrar(getFuentesSinTC(), FuentesFiltro.PRESET.SALIDA);
  let out = '<option value="">Sin especificar</option>';
  for (const f of fuentes) {
    out += `<option value="${f.val}"${f.val===selectedVal?' selected':''}>${escHtml(f.label)}</option>`;
  }
  out += `<option value="ganancia"${selectedVal==='ganancia'?' selected':''}><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block"><ellipse cx="12" cy="17" rx="8" ry="5"/><path d="M4 17v-4c0-2.76 3.58-5 8-5s8 2.24 8 5v4"/><path d="M4 13c0-2.76 3.58-5 8-5s8 2.24 8 5"/></svg> Ganancia (no salió plata)</option>`;
  return out;
}

function _updatePrestSplitResumen(){
  const splitData = splitGetData('prest');
  const totalSplit = splitData.reduce((a,r)=>a+(r.monto||0),0);
  const montoTotal = _prestMontoSalida();
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
  const gananciaTotal = splitData.filter(r=>r.fuente==='ganancia').reduce((a,r)=>a+(r.monto||0),0);
  if(gananciaTotal>0){
    impactos.push(html`<div style="padding:7px 9px;background:rgba(200,240,96,.07);border:1px solid rgba(200,240,96,.25);border-radius:7px;margin-top:5px;">
      <div style="font-size:11px;color:var(--accent);"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block"><ellipse cx="12" cy="17" rx="8" ry="5"/><path d="M4 17v-4c0-2.76 3.58-5 8-5s8 2.24 8 5v4"/><path d="M4 13c0-2.76 3.58-5 8-5s8 2.24 8 5"/></svg> ${fmt(gananciaTotal)} de este préstamo es <b>ganancia tuya</b> que aún no recibiste — no se descuenta de ninguna cuenta. Cuando te paguen el préstamo completo, esa parte se sumará como ganancia.</div>
    </div>`);
  }
  splitData.forEach(r=>{
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

/* ---- FIN METAS / SPLIT ---- */
/* ---- DEUDORES (Personas a quienes presto) ---- */
let deudorActualId = null;
let movTipo = 'prestamo'; // 'prestamo' | 'abono'

// getDeudorSaldo() se movió a js/core/calc-helpers.js (2026-09-20): es un
// reduce puro sobre d.movimientos y "Necesita atención" (inicio.js) lo necesita
// en el PRIMER render — con este archivo lazy, las tarjetas "X te debe $…"
// aparecían recién al cargarlo y empujaban todo Inicio hacia abajo (CLS).
// Sigue siendo global: el resto de este archivo lo usa igual que antes.
// Cuenta(s) realmente afectadas por un movimiento de deudor — la(s) fuente(s)
// si fue un préstamo dado, el destino si fue un abono/pago-completo recibido.
// Cuentas que tocó un movimiento de deuda, de cualquier dirección. Los tipos son
// disjuntos, así que no hace falta saber la dirección:
//   prestamo → sale de fuente(s) · recibido → entra a destino
//   abono / pago-completo → entra a destino · pago → sale de fuente
function _deudaCuentasDe(m) {
  if (m.tipo === 'prestamo') return (m.fuentes && m.fuentes.length) ? m.fuentes.map(f => f.fuente).filter(Boolean) : (m.fuente ? [m.fuente] : []);
  if (m.tipo === 'pago') return (m.fuentes && m.fuentes.length) ? m.fuentes.map(f => f.fuente).filter(Boolean) : (m.fuente ? [m.fuente] : []);
  if (m.destinos && m.destinos.length) return m.destinos.map(r => r.fuente).filter(Boolean);
  return m.destino ? [m.destino] : [];
}
// Cantidad de movimientos posteriores de la misma deuda que tocaron alguna de
// las mismas cuentas — criterio de "operaciones posteriores" de la
// protección por antigüedad (ver core-state.js#nivelAntiguedadMovimiento y
// docs/proteccion-antiguedad-movimientos.md §4).
function _deudaOpsPosteriores(d, m) {
  if (!m.fecha) return 0;
  const cuentas = _deudaCuentasDe(m);
  if (!cuentas.length) return 0;
  return (d.movimientos || []).filter(m2 => m2.id !== m.id && m2.fecha && m2.fecha > m.fecha && _deudaCuentasDe(m2).some(c => cuentas.includes(c))).length;
}
// True si borrar este movimiento de deuda realmente revierte el saldo de
// alguna cuenta real, un depósito de Alcancía, la deuda de una TC, o un
// movimiento de un encargo (ver docs/proteccion-antiguedad-movimientos.md).
// Un movimiento íntegramente "Sin especificar" (o "Ganancia", que
// explícitamente no mueve plata) no toca nada de eso, así que no hay ningún
// saldo que la protección por antigüedad deba proteger.
function _deudaTieneCuentaAfectada(m) {
  // "Yo debo": un recibido sin destino o un pago sin fuente no mueven nada.
  if (m.tipo === 'recibido') return !!m.destino || !!(m.destinos && m.destinos.some(r => r.fuente));
  if (m.tipo === 'pago') {
    // Un perdón recibido (ingreso) o un pago de más (gasto) no mueven ninguna cuenta,
    // pero borrarlos quita un ingreso/gasto real del mes: misma protección.
    if (m._perdon && m._ingresoPerdonId) return true;
    if (m.extra && m.extra.gastoId) return true;
    return !!m.fuente || !!(m.fuentes && m.fuentes.some(f => f.fuente));
  }
  if (m._viaAlcancia && m._alcanciaMovId) return true;
  // Perdón de deuda: no toca ninguna cuenta, pero borrarlo quita un gasto real
  // del mes en que se registró — mismo criterio de protección por antigüedad.
  if (m._perdon && m._gastoPerdonId) return true;
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
  if (Math.abs(deltaReal - deltaEsperado) > Deudas.TOL) {
    console.warn(`[Integridad] Saldo de ${escHtml(d.nombre)} cambió ${deltaReal} en vez de ${deltaEsperado} (antes: ${saldoAntes}, después: ${saldoDespues}). Revisa d.movimientos por duplicados.`, d.movimientos);
    toast(`El saldo de ${escHtml(d.nombre)} no cambió como se esperaba (esperado: ${fmt(deltaEsperado)}, real: ${fmt(deltaReal)}). Revisa su historial antes de seguir.`, 'err', 6000);
  }
}
// Revierte el efecto de UN abono sobre su cuenta destino: quita el movimiento espejo del
// historial y descuenta el saldo que había sumado. Si el abono guardó el id del espejo
// pero el espejo ya no existe, el saldo NO se descuenta otra vez (evita doble descuento).
// Sin id (abono antiguo, anterior al espejo) se descuenta igual.
function _revertirDestinoAbono(destino, movId, monto) {
  if (!destino) return;
  const existe = movId ? borrarMovEspejo(destino, movId) : true;
  if (existe) descontarFuente(destino, monto, { exacto: true });
}
// Igual, para un abono repartido entre varias cuentas (m.destinos[]).
function _revertirDestinosAbono(destinos) {
  (destinos || []).forEach(r => {
    if (!r.fuente) return;
    _revertirDestinoAbono(r.fuente, r._movId, r.monto);
  });
}
// ── Grupos de préstamo dentro de un deudor ──────────────────────────────
// Permiten separar "préstamo viejo" de "préstamo nuevo" con una misma
// persona sin duplicarla en la lista de Prestado. Cada movimiento lleva
// m.grupoId apuntando a d.grupos[]. El saldo TOTAL de la persona
// (getDeudorSaldo) no cambia — grupoId es puramente organizativo.
// Ver prestado.md §2.4 para el diseño completo.

// Obtiene el grupo "Histórico" del deudor, creándolo si todavía no existe.
// Es el balde por defecto: mientras el usuario no abra un grupo aparte a
// propósito (checkbox/selector), todo movimiento cae acá. Nunca se cierra
// solo por saldo — ver _autoCerrarGruposEnCero — así que una vez creado
// sigue contando como "1 grupo abierto" para siempre, y _autoGrupoIdMov no
// vuelve a crear otro por defecto.
function _getOrCrearHistorico(d, fecha) {
  if (!d.grupos) d.grupos = [];
  let historico = d.grupos.find(g => g.id === '_historico');
  if (!historico) {
    historico = { id: '_historico', nombre: 'Histórico', creadoEn: fecha || hoy(), cerrado: false };
    d.grupos.push(historico);
  }
  return historico;
}

// Migra deudores viejos (sin d.grupos) metiendo todos sus movimientos sueltos
// al grupo "Histórico" (ver _getOrCrearHistorico). Idempotente — se puede
// llamar en cada abrirDeudor() sin costo si ya está migrado. No llama a
// save() — eso lo decide quien la invoque, para no generar escrituras de más
// si el deudor no tiene movimientos que migrar.
function _migrarGruposDeudor(d) {
  if (!d) return false;
  if (!d.grupos) d.grupos = [];
  const movs = d.movimientos || [];
  const sinGrupo = movs.filter(m => !m.grupoId);
  if (!sinGrupo.length) return false;
  const historico = _getOrCrearHistorico(d, sinGrupo[0] && sinGrupo[0].fecha);
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
// Excepción: "_historico" nunca se cierra solo, así llegue a $0 — es el
// balde por defecto y debe seguir contando como grupo abierto para que
// _autoGrupoIdMov nunca tenga que crear uno nuevo sin que el usuario lo pida.
function _autoCerrarGruposEnCero(d) {
  if (!d || !d.grupos) return;
  d.grupos.forEach(g => {
    if (g.id === '_historico') return;
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
// decidió nada (0 grupos abiertos, o el checkbox/select no aplicaba).
// - 1 grupo abierto → lo reutiliza (caso normal: cae en Histórico).
// - 0 grupos abiertos → usa/crea el Histórico (nunca un grupo nuevo con
//   nombre de fecha "por sorpresa" — solo el usuario abre grupos aparte,
//   a propósito, con el checkbox/selector).
// - ≥2 grupos abiertos → esto solo pasa si igual no hubo selector visible
//   (ambigüedad real sin cómo resolverla sola); crea uno nuevo para no
//   adivinar a cuál de varios pertenece.
function _autoGrupoIdMov(d, fecha) {
  const abiertos = _gruposAbiertos(d);
  if (abiertos.length === 1) return abiertos[0].id;
  if (abiertos.length === 0) return _getOrCrearHistorico(d, fecha).id;
  return _crearGrupoDeudor(d, fecha).id;
}

// Resolución de grupoId para el sheet "Registrar movimiento" (initMovSheet /
// confirmarMovimiento). Dos caminos posibles según lo que _initMovGrupoSelector
// haya mostrado:
// 1. Selector visible (≥2 grupos abiertos): respeta lo elegido, incluyendo
//    crear uno nuevo si escogió "Es un préstamo nuevo".
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
  const list = [...Deudas.lista('favor')].sort((a, b) => getDeudorSaldo(b) - getDeudorSaldo(a));
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
  const d = Deudas.lista('favor').find(x => x.id === id);
  if (!d) return;
  _actualizarBtnPrestamoTC();
  // Migración silenciosa de deudores creados antes de que existieran los
  // grupos de préstamo — todo movimiento suelto cae en un grupo "Histórico".
  if (_migrarGruposDeudor(d)) save();
  const saldo = getDeudorSaldo(d);
  const totalPrestado = (d.movimientos || []).filter(m => m.tipo === 'prestamo').reduce((a, m) => a + m.monto, 0);
  // Lo perdonado (_perdon) NO es plata que pagó: no entra en "Pagado" (queda en el historial como "Perdonado").
  const totalAbonado = (d.movimientos || []).filter(m => (m.tipo === 'abono' || m.tipo === 'pago-completo') && !m._perdon).reduce((a, m) => a + m.monto, 0);

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
      if (m._perdon) {
        destinoInfo = html` <span style="background:rgba(240,96,96,.12);color:var(--red);border:1px solid rgba(240,96,96,.3);border-radius:4px;padding:1px 5px;font-size:9px;font-family:'DM Mono',monospace;">se lo regalé · cuenta como gasto</span>`;
      } else if (m._viaEncargo && m._encNombre) {
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
      const _cardHtml = html`<div class="card card-sm" style="margin-bottom:7px;cursor:pointer;" data-mov-id="${m.id}" data-mov-tipo="${m.tipo}" data-mov-monto="${Math.abs(m.monto)}" data-cuenta-key="deudor" data-mov-origen="${origenDD}" ${dataOtrasDD} data-mov-saldo-antes="${saldoAntesDeuda}" data-mov-saldo-despues="${saldoDespuesDeuda}" data-mov-saldo-label="Deuda de ${d.nombre}" data-mov-desc="${m.nota || (esPrestamo?'Préstamo': m._perdon?'Deuda perdonada': esPagoCompleto?'Pago completo':'Abono')}" data-mov-fecha="${m.fecha}" ${raw(Events.attr('prestado:abrirDetalleMov'))}>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <span class="badge ${esPrestamo ? 'bg-amber' : m._perdon ? 'bg-red' : 'bg-green'}" style="font-size:9px;">${esPrestamo ? 'Préstamo' : m._perdon ? 'Perdonado' : esPagoCompleto ? 'Pago completo' : 'Abono'}</span>
              ${m._gananciaVirtual ? html` <span style="background:rgba(200,240,96,.15);color:var(--accent);border:1px solid rgba(200,240,96,.3);border-radius:4px;padding:1px 5px;font-size:9px;font-family:'DM Mono',monospace;"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block"><ellipse cx="12" cy="17" rx="8" ry="5"/><path d="M4 17v-4c0-2.76 3.58-5 8-5s8 2.24 8 5v4"/><path d="M4 13c0-2.76 3.58-5 8-5s8 2.24 8 5"/></svg> Incluye ${fmt(m._gananciaVirtual)} de ganancia</span>` : ''}
              ${m._viaTC ? html` <span style="background:rgba(96,176,240,.15);color:var(--blue);border:1px solid rgba(96,176,240,.3);border-radius:4px;padding:1px 5px;font-size:9px;font-family:'DM Mono',monospace;">TC${m._tcId ? ' · ' + ((S.tarjetasCredito||[]).find(t=>t.id===m._tcId)||{nombre:''}).nombre : ''}</span>` : ''}
              ${m.nota ? html` <span style="font-size:11px;color:var(--text2);">${m.nota}</span>` : ''}
            </div>
            <div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;margin-top:3px;">${m.fecha}${m._viaTC ? '' : raw(m.fuentes ? ' · ' + m.fuentes.map(f=>_fuenteLabelHtml(f.fuente)+' '+fmt(f.monto)).join(' + ') : (m.fuente ? ' · ' + _fuenteLabelHtml(m.fuente) : ''))}${destinoInfo}</div>
            ${extraHtml}
            ${esPrestamo && m.diferencial && !m._viaTC ? raw(diffRenderHistorial(m.diferencial)) : ''}
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
  const d = Deudas.lista('favor').find(x => x.id === deudorId);
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
  const d = Deudas.lista('favor').find(x => x.id === deudorActualId);
  if (!d) return;
  const ok = await dialogo('Eliminar persona', `¿Eliminar a ${escHtml(d.nombre)} y todo su historial? Esta acción no se puede deshacer.`, 'Eliminar', true);
  if (!ok) return;
  Deudas.quitar('favor', deudorActualId);
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

// opts.desdeFeed: true cuando lo invoca eliminarMovimiento() (movimientos.js) al
// borrar un préstamo/abono desde el feed o el detalle de una cuenta. Todo el
// flujo (protección por antigüedad, confirmación, reversión) es el mismo, pero
// al terminar NO navega al detalle del deudor — el usuario sigue en la cuenta
// desde donde borró, y movimientos.js la vuelve a pintar.
// Revierte EXACTAMENTE los efectos de un movimiento de "Me deben" (saldos de cuentas, movimientos espejo, deuda de la
// TC, salidas del encargo, extras, gasto del perdón, margen) y lo quita de la deuda. No pregunta ni valida nada: todo
// lo que puede impedir el borrado (antigüedad, confirmación, que Alcancía cargue) se resuelve ANTES, en eliminarMovDeudor,
// así que acá no hay ningún `return` que pueda dejar la reversión a medias. También la usa movimientos.js (desdeFeed).
function _revertirMovDeudor(d, m) {
  const esPrestamo = m.tipo === 'prestamo';
  // Efecto en las cuentas
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
    // Margen de "El valor era diferente" (ingreso sin cuenta, enlazado por _encMovId): no hay
    // saldo que revertir, solo se quita para que deje de contar como ingreso.
    if (m.diferencial && S.movimientos) {
      S.movimientos = S.movimientos.filter(x => !(x._esDiferencialEncargo && x._encMovId === m.id));
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
        _revertirDestinoAbono(m.destino, m._abonoDestinoMovId, m.monto);
      } else if (m.destinos && m.destinos.length) {
        _revertirDestinosAbono(m.destinos);
      }
    } else if (m.destinos && m.destinos.length) {
      _revertirDestinosAbono(m.destinos);
    } else if (m.destino) {
      _revertirDestinoAbono(m.destino, m._abonoDestinoMovId, m.monto);
    }

    // Revertir el extra si lo tenía
    if (m._extPartes && m._extPartes.length) {
      for (const p of m._extPartes) {
        if (p.tipo === 'guardar' && p.cuenta) {
          // Quitar el saldo que se sumó
          descontarFuente(p.cuenta, p.monto, { exacto: true });
          // Eliminar el movimiento de historial asociado
          if (p.movExtraId) borrarMovEspejo(p.cuenta, p.movExtraId);
        } else if (p.tipo === 'gastar' && p.gastoId) {
          if (S.gastosVar) S.gastosVar = S.gastosVar.filter(x => x.id !== p.gastoId);
        } else if (p.tipo === 'pendiente' && p.ingrId) {
          if (S.ingresosExtra) S.ingresosExtra = S.ingresosExtra.filter(x => x.id !== p.ingrId);
        }
      }
    }

    // Perdón de deuda ("se lo regalé"): revertir el gasto que se registró con él.
    if (m._perdon && m._gastoPerdonId && S.gastosVar) {
      S.gastosVar = S.gastosVar.filter(x => x.id !== m._gastoPerdonId);
    }
  }

  d.movimientos = (d.movimientos || []).filter(x => x.id !== m.id);
}

async function eliminarMovDeudor(deudorId, movId, opts) {
  const desdeFeed = !!(opts && opts.desdeFeed === true);
  const d = Deudas.lista('favor').find(x => x.id === deudorId);
  if (!d) return;
  const m = (d.movimientos || []).find(x => x.id === movId);
  if (!m) return;

  // Protección por antigüedad — ver docs/proteccion-antiguedad-movimientos.md.
  // Este mismo movimiento también se puede borrar desde la vista de cuenta
  // genérica: eliminarMovimiento() (movimientos.js) NO tiene lógica propia para
  // 'prestamo'/'abono', delega acá con { desdeFeed: true } — una sola
  // implementación de la reversión (antes había una copia incompleta allá).
  // Solo aplica si _deudaTieneCuentaAfectada(m) — un préstamo/abono 100%
  // "Sin especificar"/"Ganancia" no revierte ningún saldo real, así que no
  // hay nada que proteger.
  let nivel = 'reciente';
  if (_deudaTieneCuentaAfectada(m)) {
    const opsPosteriores = _deudaOpsPosteriores(d, m);
    nivel = nivelAntiguedadMovimiento(m.fecha, opsPosteriores, 'prestamos');
    if (nivel === 'bloqueado') {
      await avisarMovimientoBloqueado();
      return;
    }
  }
  const esPrestamo = m.tipo === 'prestamo';
  const esPerdon = !esPrestamo && !!m._perdon;
  const label = esPrestamo ? 'préstamo' : esPerdon ? 'perdón' : 'pago';
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
  const efectoAviso = esPerdon
    ? 'El gasto que se registró al perdonarla también se borrará.'
    : `El saldo de ${cuentaAviso} se revertirá automáticamente.`;
  const ok = await dialogo(
    'Eliminar ' + label,
    `¿Eliminar este ${label} de ${fmt(m.monto)}? ${efectoAviso} La deuda de ${escHtml(d.nombre)} pasará de ${fmt(_saldoAntesDel)} a ${fmt(_saldoTrasDel)}.${extraAviso}${tcAviso}${antiguedadAviso}`,
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

  _revertirMovDeudor(d, m);
  _autoCerrarGruposEnCero(d); // el grupo pudo saldarse (o reabrirse) al borrar este movimiento
  _verificarIntegridadSaldoDeudor(d, _saldoAntesDel, _deltaEsperadoDel);
  save(); refresh();
  if (!desdeFeed) abrirDeudor(deudorId);
  toast(`${esPrestamo ? 'Préstamo' : esPerdon ? 'Perdón' : 'Abono'} eliminado — ${esPerdon ? 'la deuda y el gasto se revirtieron' : 'saldo revertido'}`, 'ok');
}

function initMovSheet(tipo) {
  // Preservar 'pago-completo' para distinguirlo de un abono normal
  movTipo = tipo; // 'prestamo' | 'abono' | 'pago-completo'
  // incluirTC=false (3er parámetro de poblarFuente): en ninguno de los dos selects
  // (modo simple) puede aparecer una tarjeta de crédito.
  //  - mov_destino: una TC nunca recibe plata entrante (pagarle a una TC es otro flujo).
  //  - mov_fuente: un préstamo pagado con TC se registra SOLO por "Préstamo con TC"
  //    (confirmarPrestamoTC): valida cupo, pide la descripción de la compra, crea el
  //    cargo enlazado en S.tcMovimientos (tipo 'cargo_prestamo') y marca _viaTC. Por
  //    este camino simple tc.deuda subía (descontarFuente) pero sin ese cargo
  //    enlazado, y calcDeudaAjenaDeTarjeta() (core-state.js) no lo veía como deuda
  //    ajena → contaba como deuda PROPIA. Decisión 2026-09-19: no unir los sheets.
  // Los modos divididos de ambos campos ya excluían las TC (getFuentesSinTC).
  poblarFuente('mov_fuente', false, false);
  poblarFuente('mov_destino', false, false);
  // "¿De dónde sacó la plata?" (nuevo préstamo, modo simple): solo cuentas con saldo >= $1,00.
  // (openSheet('registrar-movimiento') ya lo pobló sin filtrar; este es el último en escribirlo.)
  // mov_destino NO se filtra: es plata que entra (un abono puede ir a una cuenta vacía).
  FuentesFiltro.podar('mov_fuente', FuentesFiltro.PRESET.SALIDA);
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
  // "El valor era diferente": solo en Nuevo préstamo (abonos/pago completo no lo usan).
  diffReset('prestamoDif');
  { const difWrap = document.getElementById('mov-dif-wrap'); if (difWrap) difWrap.style.display = esPrestamo ? '' : 'none'; }
  document.getElementById('mov_destino_wrap').style.display = esAbono ? '' : 'none';
  document.getElementById('mov_extra_wrap').style.display = esAbono ? '' : 'none';
  // "¿Se lo regalas?" (perdonar lo que falta) solo existe en "Pagar préstamo completo".
  const perdonWrap = document.getElementById('mov_perdon_wrap');
  const perdonChk = document.getElementById('mov_perdon');
  if (perdonChk) perdonChk.checked = false;
  if (perdonWrap) perdonWrap.style.display = esPagoCompleto ? '' : 'none';
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
  const _tieneEncargoVinculado = esAbono && _movTieneEncargoVinculado();
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

function _movTieneEncargoVinculado() {
  const d = Deudas.lista('favor').find(x => x.id === deudorActualId);
  return !!(d && d.personaId && (S.encargos || []).some(e => e.personaId === d.personaId && encargoLibre(e) > 0));
}

// ── Perdonar lo que falta ("se lo regalé") — solo en "Pagar préstamo completo" ──
// Queda como un 'pago-completo' con _perdon:true (así saldo, grupos y reversión
// funcionan igual que siempre), pero NO entra plata a ninguna cuenta y, además,
// registra un gasto real en S.gastosVar (fuente '', _secundario, _esPerdonDeuda)
// enlazado por _gastoPerdonId / _deudorMovId. Ver CHANGELOG 2026-09-19.
function _movEsPerdon() {
  const chk = document.getElementById('mov_perdon');
  return movTipo === 'pago-completo' && !!(chk && chk.checked);
}
function toggleMovPerdon() {
  const perdon = _movEsPerdon();
  if (perdon) {
    // Lo que deja de aplicar se apaga, para que no quede un estado oculto.
    const encChk = document.getElementById('mov_desde_encargo');
    if (encChk && encChk.checked) { encChk.checked = false; toggleDesdeEncargo(); }
    const extChk = document.getElementById('mov_tiene_extra');
    if (extChk && extChk.checked) { extChk.checked = false; toggleExtraSection(); }
  }
  document.getElementById('mov_destino_wrap').style.display = perdon ? 'none' : '';
  document.getElementById('mov_extra_wrap').style.display = perdon ? 'none' : '';
  const encWrap = document.getElementById('mov_enc_wrap');
  if (encWrap) encWrap.style.display = (!perdon && _movTieneEncargoVinculado()) ? '' : 'none';
  document.getElementById('movSheetTitle').textContent = perdon ? 'Perdonar deuda' : 'Pagar préstamo completo';
  document.getElementById('movBtnConfirm').textContent = perdon ? 'Perdonar deuda' : 'Confirmar pago total';
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
  const d = Deudas.lista('favor').find(x => x.id === deudorActualId);
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
      sel.innerHTML = html`${abiertos.map(g => html`<option value="${g.id}">${g.nombre} (${fmt(getGrupoSaldo(d, g.id))})</option>`)}<option value="__nuevo__">Es un préstamo nuevo</option>`;
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

// Un abono que cubre TODO lo que la persona debe es, en la práctica, un pago completo: si abrieron
// "Registrar abono" pero el monto iguala el saldo, se guarda como 'pago-completo' (mismo tipo,
// descripción del movimiento secundario y etiqueta en el historial que si hubieran abierto ese sheet).
// movTipo se promueve solo durante este guardado y se restaura al terminar: si una validación
// aborta, el sheet sigue siendo "abono" y el siguiente intento se evalúa de nuevo desde cero.
function confirmarMovimiento() {
  const tipoOriginal = movTipo;
  try {
    if (movTipo === 'abono') {
      const d = Deudas.lista('favor').find(x => x.id === deudorActualId);
      const monto = parseMoney(document.getElementById('mov_monto').value) || 0;
      const saldo = d ? getDeudorSaldo(d) : 0;
      if (d && saldo > 0 && monto > 0 && Math.abs(monto - saldo) <= Deudas.TOL_FINO) movTipo = 'pago-completo';
    }
    return _confirmarMovimientoInterno();
  } finally {
    movTipo = tipoOriginal;
  }
}

/* ── Registrar un movimiento de "Me deben": validar → aplicar ─────────────
   _planMovimiento() lee el formulario y valida TODO sin escribir nada: devuelve
   { error } o un plan con cada valor que hará falta. _aplicarMovimiento(plan) escribe
   y no tiene ningún `return` de validación, así que un error no puede dejar la deuda a
   medias (ese era el bug del abono con extra: el abono ya estaba aplicado cuando se
   descubría que el extra estaba mal). Incluye resolver el grupo del movimiento, que
   puede CREAR un grupo nuevo: por eso se hace al aplicar y no antes de validar.
   Cada rama (perdón, préstamo, abono desde encargo, abono normal) tiene su par
   _plan…/_aplicar…. Los extras ("¿pagaron de más?") los comparten las dos ramas de abono. */
function _planErr(msg, dur) { return { error: { msg, dur } }; }

function _planMovimiento() {
  const monto = parseMoney(document.getElementById('mov_monto').value) || 0;
  // Validación con foco+mensaje inline (antes vivía en un override aparte).
  if (!monto) return { error: { field: 'mov_monto', msg: 'Ingresa un monto mayor a 0' } };
  if (!deudorActualId) return _planErr('Error: no hay persona seleccionada');
  const d = Deudas.porId('favor', deudorActualId);
  if (!d) return { silencio: true };
  const base = {
    d, monto, tipo: movTipo,
    fecha: document.getElementById('mov_fecha').value || hoy(),
    nota: document.getElementById('mov_nota').value.trim(),
    perdon: _movEsPerdon(),
    // Para verificar al final que el cambio real coincidió con el esperado (_verificarIntegridadSaldoDeudor).
    saldoAntes: getDeudorSaldo(d),
    deltaEsperado: movTipo === 'prestamo' ? monto : -monto
  };
  if (base.perdon) return base;
  if (movTipo === 'prestamo') return _planPrestamo(base);
  return _abonoDesdeEncargo ? _planAbonoEncargo(base) : _planAbonoNormal(base);
}

function _aplicarMovimiento(p) {
  // A qué grupo de préstamo pertenece — ver _resolverGrupoIdMov. Puede crear un grupo, así que va acá.
  p.grupoId = _resolverGrupoIdMov(p.d, p.fecha);
  if (p.perdon) return _aplicarPerdon(p);
  if (p.tipo === 'prestamo') return _aplicarPrestamo(p);
  return p.enc ? _aplicarAbonoEncargo(p) : _aplicarAbonoNormal(p);
}

/* ── Perdón: le regalas lo que falta ──────────────────────────────── */
// No entra plata a ninguna cuenta (por eso destino '' y nada de sumarFuente), pero SÍ cuenta como
// gasto real del mes: la plata ya había salido de tus cuentas cuando prestaste y ahora la das por
// perdida. El gasto no descuenta ningún saldo (fuente ''), es _secundario (solo se borra desde acá)
// y _esGastoVarNoReal() no lo excluye, así que entra a Gastos/Análisis/salud.
function _aplicarPerdon(p) {
  const { d, monto, fecha, nota } = p;
  if (!S.gastosVar) S.gastosVar = [];
  const perdonMovId = uid();
  const gastoPerdonId = uid();
  S.gastosVar.push({
    id: gastoPerdonId, monto, fecha, cat: 'Otro',
    desc: `Perdoné deuda — ${d.nombre}`, nota, fuente: '', ts: Date.now(),
    _secundario: true, _origenSeccion: 'Prestado · Me deben',
    _esPerdonDeuda: true, _deudorId: d.id, _deudorMovId: perdonMovId
  });
  d.movimientos.push({
    id: perdonMovId, tipo: 'pago-completo', monto, fecha, destino: '', nota,
    grupoId: p.grupoId, ts: Date.now(), _perdon: true, _gastoPerdonId: gastoPerdonId
  });
}

/* ── Préstamo ─────────────────────────────────────────────────────── */
// "El valor era diferente": monto = lo que le cobro (la deuda); real = lo que salió. real vacío/0 = sin diferencial.
function _planPrestamo(base) {
  const { monto } = base;
  let montoSalio = monto;
  let hayMargen = false;
  if (diffEstaAbierto('prestamoDif')) {
    const real = (diffCalcular('prestamoDif') || {}).real || 0;
    if (real > monto + Deudas.TOL_FINO) {
      return _planErr(`El valor real (${fmt(real)}) no puede ser mayor que lo que le cobras (${fmt(monto)})`, 4000);
    }
    if (real > 0 && monto - real > Deudas.TOL_FINO) { montoSalio = real; hayMargen = true; }
  }
  let fuentes = null, fuente = '';
  if (_prestSplitMode) {
    fuentes = splitGetData('prest');
    const totalSplit = fuentes.reduce((a, r) => a + (r.monto || 0), 0);
    if (Math.abs(totalSplit - montoSalio) > Deudas.TOL) {
      return _planErr(`La suma de las fuentes (${fmt(totalSplit)}) no coincide con ${hayMargen ? 'el valor real' : 'el monto'} (${fmt(montoSalio)})`, 4000);
    }
  } else {
    fuente = document.getElementById('mov_fuente').value;
  }
  return { ...base, montoSalio, hayMargen, fuentes, fuente };
}

function _aplicarPrestamo(p) {
  const { d, monto, fecha, nota, montoSalio, hayMargen, fuentes, fuente } = p;
  const movId = uid();
  let movObj;
  if (fuentes) {
    fuentes.forEach(r => { if (r.fuente) descontarFuente(r.fuente, r.monto); });
    const gananciaVirtual = fuentes.filter(r => r.fuente === 'ganancia').reduce((a, r) => a + r.monto, 0);
    movObj = { id: movId, tipo: 'prestamo', monto, fecha, fuentes: fuentes.map(r => ({ fuente: r.fuente, monto: r.monto })), nota, _gananciaVirtual: gananciaVirtual || undefined, grupoId: p.grupoId, ts: Date.now() };
  } else {
    if (hayMargen && fuente) {
      // Con margen, de la cuenta sale `montoSalio`, no `monto`. Se guarda como `fuentes`
      // (misma forma que el préstamo dividido) para que revertir, el historial de la cuenta
      // y el detalle usen el monto real sin ningún caso especial.
      movObj = { id: movId, tipo: 'prestamo', monto, fecha, fuentes: [{ fuente, monto: montoSalio }], nota, grupoId: p.grupoId, ts: Date.now() };
    } else {
      movObj = { id: movId, tipo: 'prestamo', monto, fecha, fuente, nota, grupoId: p.grupoId, ts: Date.now() };
    }
    descontarFuente(fuente, montoSalio);
  }
  d.movimientos.push(movObj);
  // El margen queda como ingreso (fantasma, sin cuenta) enlazado a este préstamo (linkId = movId)
  // para que eliminarMovDeudor() lo borre junto con él.
  if (hayMargen) {
    const diferencial = diffAplicar('prestamoDif', { desc: nota || 'Préstamo', fecha, _deudorNombre: d.nombre }, movId);
    if (diferencial) movObj.diferencial = diferencial;
  }
}

/* ── Extras ("¿pagaron de más?") — comparten las dos ramas de abono ── */
// Lee y valida el extra del formulario. Devuelve { tieneExtra, extraMonto, extPartes } o { error }.
// `exigirMonto`: en la rama normal un extra marcado sin monto es error; en la de encargo se ignora.
function _planExtra(exigirMonto) {
  const tieneExtra = document.getElementById('mov_tiene_extra').checked;
  const extraMonto = tieneExtra ? (parseMoney(document.getElementById('mov_extra_monto').value) || 0) : 0;
  const extPartes = _extPartes.map(x => ({ ...x }));
  if (!tieneExtra) return { tieneExtra, extraMonto, extPartes };
  if (exigirMonto && !extraMonto) return _planErr('Ingresa el monto del extra');
  if (extraMonto > 0 || exigirMonto) {
    if (!extPartes.length) return _planErr('Agrega al menos una parte para el extra');
    const totalPartes = extPartes.reduce((a, x) => a + (x.monto || 0), 0);
    if (Math.abs(totalPartes - extraMonto) > Deudas.TOL) {
      return _planErr(`Falta asignar ${fmt(extraMonto - totalPartes)} del extra antes de continuar.`, 4000);
    }
  }
  return { tieneExtra, extraMonto, extPartes };
}

// Aplica las partes del extra sobre el último movimiento registrado (`mov`), guardando en él lo que hace falta
// para revertirlas. `v` distingue las dos ramas, que escriben descripciones distintas:
//   v.desc(p)    descripción base · v.extraIngreso  marca _esExtraIngreso en lo guardado (solo la rama normal:
//   el extra/propina de un pago SÍ es ingreso real, ver _esEntradaEspejoNoIngreso()) · v.notaPendiente
function _aplicarExtraPartes(p, mov, v) {
  const { d, fecha, extPartes } = p;
  mov._extPartes = [];
  for (const x of extPartes) {
    if (!x.monto || x.monto <= 0) continue;
    if (x.tipo === 'guardar') {
      if (!x.cuenta) continue;
      sumarFuente(x.cuenta, x.monto);
      const movExtraId = registrarMovEspejo({ cuenta: x.cuenta, flujo: 'entrada', monto: x.monto, fecha, desc: v.descGuardar, origen: 'Prestado · Me deben', extra: v.extraIngreso ? { _esExtraIngreso: true } : undefined });
      mov._extPartes.push({ tipo: 'guardar', cuenta: x.cuenta, monto: x.monto, movExtraId });
    } else if (x.tipo === 'gastar') {
      if (!S.gastosVar) S.gastosVar = [];
      const gastoId = uid();
      S.gastosVar.push({ id: gastoId, monto: x.monto, fecha, cat: 'Varios', desc: x.desc || v.descGastar, fuente: '', ts: Date.now(), _esExtraPrestamo: true });
      mov._extPartes.push({ tipo: 'gastar', gastoId, monto: x.monto });
    } else if (x.tipo === 'regalar') {
      // No entra a ninguna cuenta — solo queda registrado en el abono del deudor
      mov._extPartes.push({ tipo: 'regalar', monto: x.monto });
    } else if (x.tipo === 'pendiente') {
      if (!S.ingresosExtra) S.ingresosExtra = [];
      const ingrId = uid();
      S.ingresosExtra.push({ id: ingrId, monto: x.monto, fecha, nota: v.notaPendiente, ts: Date.now() });
      mov._extPartes.push({ tipo: 'pendiente', ingrId, monto: x.monto });
    }
  }
}

/* ── Abono desde un encargo ───────────────────────────────────────── */
function _planAbonoEncargo(base) {
  const { monto } = base;
  if (!_abonoEncId) return _planErr('Selecciona un encargo');
  const enc = (S.encargos || []).find(e => e.id === _abonoEncId);
  if (!enc) return _planErr('Encargo no encontrado');
  const saldoTotal = encargoLibre(enc);
  if (monto > saldoTotal + Deudas.TOL_FINO) {
    return _planErr(`El encargo solo tiene ${fmt(saldoTotal)} disponible (el resto ya está comprometido)`);
  }
  // ¿La plata del encargo sale de VARIAS cuentas a la vez?
  let encCuentaSplits = null;
  if (_abonoEncCuentaSplitMode) {
    const splits = _getAbonoEncCuentaSplitData().filter(s => s.fuente && s.monto > 0);
    if (!splits.length) return _planErr('Agrega al menos una cuenta del encargo con monto');
    const totalSplit = splits.reduce((a, s) => a + s.monto, 0);
    if (Math.abs(totalSplit - monto) > Deudas.TOL) {
      return _planErr(`La suma de las cuentas del encargo (${fmt(totalSplit)}) no coincide con el pago (${fmt(monto)})`, 4000);
    }
    // Sumar por cuenta (por si repitió la misma cuenta en dos filas) y validar saldo
    const porCuenta = {};
    splits.forEach(s => { porCuenta[s.fuente] = (porCuenta[s.fuente] || 0) + s.monto; });
    for (const cuenta in porCuenta) {
      const saldoEnCuenta = _getEncargoSaldoEnCuenta(enc, cuenta);
      if (porCuenta[cuenta] > saldoEnCuenta + Deudas.TOL_FINO) {
        return _planErr(`En ${_fuenteLabelHtml(cuenta)} solo hay ${fmt(saldoEnCuenta)} de este encargo`);
      }
    }
    encCuentaSplits = Object.entries(porCuenta).map(([fuente, m]) => ({ fuente, monto: m }));
  } else if (_abonoEncCuenta) {
    const esSinEsp = _abonoEncCuenta === '__sinesp__';
    const saldoEnCuenta = esSinEsp ? _getEncargoSaldoSinCuenta(enc) : _getEncargoSaldoEnCuenta(enc, _abonoEncCuenta);
    if (monto > saldoEnCuenta + Deudas.TOL_FINO) {
      return _planErr(`En ${esSinEsp ? 'la parte sin especificar' : _fuenteLabelHtml(_abonoEncCuenta)} solo hay ${fmt(saldoEnCuenta)} de este encargo`);
    }
  }
  // Extra: reparto y saldo del encargo para abono + extra (saldo antes de cualquier escritura)
  const ex = _planExtra(false);
  if (ex.error) return ex;
  if (ex.tieneExtra && ex.extraMonto > 0) {
    if (monto + ex.extraMonto > saldoTotal + Deudas.TOL_FINO) {
      return _planErr(`El encargo solo tiene ${fmt(saldoTotal)} disponible — no alcanza para el abono (${fmt(monto)}) más el extra (${fmt(ex.extraMonto)})`, 4500);
    }
    if (_abonoEncCuenta) {
      const esSinEsp2 = _abonoEncCuenta === '__sinesp__';
      const saldoEnCuenta2 = esSinEsp2 ? _getEncargoSaldoSinCuenta(enc) : _getEncargoSaldoEnCuenta(enc, _abonoEncCuenta);
      if (monto + ex.extraMonto > saldoEnCuenta2 + Deudas.TOL_FINO) {
        return _planErr(`En ${esSinEsp2 ? 'la parte sin especificar' : _fuenteLabelHtml(_abonoEncCuenta)} solo hay ${fmt(saldoEnCuenta2)} — no alcanza para abono + extra`, 4500);
      }
    }
  }
  // Destino(s) de la plata del abono
  let destinos = null, destino = '';
  if (_abonoSplitMode) {
    destinos = _getAbonoDestinoSplitData().map(r => ({ ...r }));
    const totalSplitPre = destinos.reduce((a, r) => a + (r.monto || 0), 0);
    if (Math.abs(totalSplitPre - monto) > Deudas.TOL) {
      return _planErr(`La suma de cuentas (${fmt(totalSplitPre)}) no coincide con el abono (${fmt(monto)})`, 4000);
    }
  } else {
    destino = document.getElementById('mov_destino').value;
  }
  return { ...base, enc, encCuentaSplits, encCuenta: _abonoEncCuenta, destinos, destino, ...ex };
}

function _aplicarAbonoEncargo(p) {
  const { d, monto, fecha, nota, enc, encCuentaSplits, encCuenta, destinos, destino, tieneExtra, extraMonto } = p;
  // 1. Registrar salida del abono en el encargo (descuenta su saldo). Si sale de varias cuentas del
  // encargo a la vez, se registra un movimiento de salida POR CADA cuenta (mismo _grupoAbonoId) — así
  // el saldo por cuenta del encargo cuadra y el conjunto se puede revertir o eliminar como una unidad.
  if (!enc.movimientos) enc.movimientos = [];
  let encMovId, encMovIds;
  if (encCuentaSplits) {
    const grupoAbonoId = uid();
    encMovIds = encCuentaSplits.map(s => {
      const id = uid();
      enc.movimientos.push({
        id, tipo: 'salida', monto: s.monto, cuenta: s.fuente,
        desc: `Pago de deuda — ${d.nombre}`, fecha, nota, ts: Date.now(),
        _esAbonoDeudor: true, _deudorId: d.id, _grupoAbonoId: grupoAbonoId
      });
      return id;
    });
    encMovId = encMovIds[0];
  } else {
    encMovId = uid();
    encMovIds = [encMovId];
    enc.movimientos.push({
      id: encMovId, tipo: 'salida', monto,
      cuenta: encCuenta === '__sinesp__' ? '' : (encCuenta || ''),
      desc: `Pago de deuda — ${d.nombre}`, fecha, nota, ts: Date.now(),
      _esAbonoDeudor: true, _deudorId: d.id
    });
  }

  // 2. El dinero llega a una cuenta del usuario
  const abonMovId = uid();
  const esPagoCompleto = p.tipo === 'pago-completo';
  const tipoGuardar = esPagoCompleto ? 'pago-completo' : 'abono';
  const descDestino = esPagoCompleto
    ? `Pago de deuda completo — ${d.nombre} (vía encargo ${enc.nombre})`
    : `Abono de deuda — ${d.nombre} (vía encargo ${enc.nombre})`;
  let mov;
  if (destinos) {
    destinos.forEach(r => { if (r.fuente) sumarFuente(r.fuente, r.monto); });
    // Movimiento visible en el historial de cada cuenta destino (igual que el destino simple)
    destinos.forEach(r => {
      r._movId = registrarMovEspejo({ cuenta: r.fuente, flujo: 'entrada', monto: r.monto, fecha, desc: descDestino, origen: 'Prestado · Me deben' });
    });
    mov = {
      id: abonMovId, tipo: tipoGuardar, monto, fecha, nota,
      destinos: destinos.map(r => ({ fuente: r.fuente, monto: r.monto, _movId: r._movId })),
      _viaEncargo: true, _encId: enc.id, _encNombre: enc.nombre, _encMovId: encMovId, _encMovIds: encMovIds,
      grupoId: p.grupoId, ts: Date.now()
    };
  } else {
    if (destino) sumarFuente(destino, monto);
    // Movimiento visible en el historial de la cuenta destino
    const abonoDestinoMovId = destino
      ? registrarMovEspejo({ cuenta: destino, flujo: 'entrada', monto, fecha, desc: descDestino, origen: 'Prestado · Me deben' })
      : null;
    mov = {
      id: abonMovId, tipo: tipoGuardar, monto, fecha, nota, destino,
      _viaEncargo: true, _encId: enc.id, _encNombre: enc.nombre, _encMovId: encMovId, _encMovIds: encMovIds,
      _abonoDestinoMovId: abonoDestinoMovId, grupoId: p.grupoId, ts: Date.now()
    };
  }
  d.movimientos.push(mov);

  // 3. Extra (también sale del encargo). Reparto y saldo ya validados en _planAbonoEncargo.
  if (tieneExtra && extraMonto > 0) {
    // Salida del extra en el encargo (movimiento separado y descriptivo)
    const encExtraMovId = uid();
    enc.movimientos.push({
      id: encExtraMovId, tipo: 'salida', monto: extraMonto,
      cuenta: encCuenta === '__sinesp__' ? '' : (encCuenta || ''),
      desc: `Extra / propina — ${d.nombre} (parte del pago de deuda)`, fecha, ts: Date.now(),
      _esExtraAbonoDeudor: true, _deudorId: d.id, _abonoEncMovId: encMovId
    });
    mov._encExtraMovId = encExtraMovId;
    _aplicarExtraPartes(p, mov, {
      descGuardar: `Extra del pago de ${d.nombre} — vía encargo ${enc.nombre}`,
      descGastar: `Extra del pago de ${d.nombre} — vía encargo ${enc.nombre}`,
      notaPendiente: `Extra sin asignar — ${d.nombre} vía encargo ${enc.nombre}`,
      extraIngreso: false
    });
  }
}

/* ── Abono a una cuenta propia ────────────────────────────────────── */
function _planAbonoNormal(base) {
  const { monto } = base;
  // El extra se valida ANTES de escribir nada (ver Fase 0 en CHANGELOG): un extra inválido no puede dejar el abono aplicado.
  const ex = _planExtra(true);
  if (ex.error) return ex;
  let destinos = null, destino = '';
  if (_abonoSplitMode) {
    destinos = _getAbonoDestinoSplitData().map(r => ({ ...r }));
    const totalSplit = destinos.reduce((a, r) => a + (r.monto || 0), 0);
    if (Math.abs(totalSplit - monto) > Deudas.TOL) {
      return _planErr(`La suma de cuentas (${fmt(totalSplit)}) no coincide con el abono (${fmt(monto)})`, 4000);
    }
  } else {
    destino = document.getElementById('mov_destino').value;
  }
  return { ...base, enc: null, destinos, destino, ...ex };
}

function _aplicarAbonoNormal(p) {
  const { d, monto, fecha, nota, destinos, destino, tieneExtra } = p;
  const esPagoCompleto = p.tipo === 'pago-completo';
  const tipoGuardar = esPagoCompleto ? 'pago-completo' : 'abono';
  const desc = esPagoCompleto ? `Pago de deuda completo — ${d.nombre}` : `Abono de deuda — ${d.nombre}`;
  let mov;
  if (destinos) {
    destinos.forEach(r => { if (r.fuente) sumarFuente(r.fuente, r.monto); });
    // Movimiento visible en cada cuenta destino
    destinos.forEach(r => {
      r._movId = registrarMovEspejo({ cuenta: r.fuente, flujo: 'entrada', monto: r.monto, fecha, desc, origen: 'Prestado · Me deben' });
    });
    mov = { id: uid(), tipo: tipoGuardar, monto, fecha, destinos: destinos.map(r => ({ fuente: r.fuente, monto: r.monto, _movId: r._movId })), nota, grupoId: p.grupoId, ts: Date.now() };
  } else {
    const abonoMovId = uid();
    sumarFuente(destino, monto);
    // Movimiento visible en la cuenta destino (null si no hay cuenta rastreable)
    const abonoDestinoMovId = registrarMovEspejo({ cuenta: destino, flujo: 'entrada', monto, fecha, desc, origen: 'Prestado · Me deben' });
    mov = { id: abonoMovId, tipo: tipoGuardar, monto, fecha, destino, nota, _abonoDestinoMovId: abonoDestinoMovId, grupoId: p.grupoId, ts: Date.now() };
  }
  d.movimientos.push(mov);
  // Extra (sistema de partes libres; ya validado en _planAbonoNormal). Se guarda un snapshot de las partes en el abono
  // para poder revertirlas si se elimina.
  if (tieneExtra) {
    _aplicarExtraPartes(p, mov, {
      descGuardar: `Extra de pago — ${d.nombre}`,
      descGastar: `Extra de pago — ${d.nombre}`,
      notaPendiente: `Extra sin asignar — ${d.nombre}`,
      extraIngreso: true // el extra/propina de un pago SÍ es ingreso real, no un espejo de plata ya contada
    });
  }
}

function _confirmarMovimientoInterno() {
  const plan = _planMovimiento();
  if (plan.silencio) return;
  if (plan.error) {
    if (plan.error.field) _markError(plan.error.field, plan.error.field + '_err', plan.error.msg);
    else if (plan.error.dur) toast(plan.error.msg, 'err', plan.error.dur);
    else toast(plan.error.msg, 'err');
    return;
  }
  const { d, monto, perdon, tipo, enc, extraMonto } = plan;
  _aplicarMovimiento(plan);

  // Log cambio
  if (window.logCambio) {
    if (enc) logCambio(`Abono de ${escHtml(d.nombre)} vía encargo de ${escHtml(enc.nombre)}`, d.nombre, monto, 'abono');
    else logCambio(tipo === 'prestamo' ? 'Prestaste a ' + d.nombre : (perdon ? 'Perdonaste la deuda de ' + d.nombre : 'Registraste abono de ' + d.nombre), d.nombre, monto, tipo === 'prestamo' ? 'prestamo' : 'abono');
  }
  _autoCerrarGruposEnCero(d);
  _verificarIntegridadSaldoDeudor(d, plan.saldoAntes, plan.deltaEsperado);
  save(); refresh(); closeSheet('registrar-movimiento');
  abrirDeudor(deudorActualId);
  if (enc) {
    const msgExtra = extraMonto > 0 ? ` + ${fmt(extraMonto)} de extra` : '';
    toast(`${fmt(monto)}${msgExtra} descontados del encargo de ${escHtml(enc.nombre)}`, 'ok', 3500);
  } else if (perdon) {
    toast(`Deuda de ${escHtml(d.nombre)} perdonada — quedó como gasto de ${fmt(monto)}`, 'ok', 4000);
  }
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
  const d = Deudas.lista('favor').find(x => x.id === deudorActualId);
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

/* ── MIS DEUDAS (yo le debo a una persona) ───────────────────────────────
   Simétrico a S.deudores, pero con efecto inverso: cuando "me prestan"
   plata, ENTRA a una de mis cuentas (sumarFuente) y queda como pasivo
   pendiente. Cuando pago, SALE de una cuenta (descontarFuente) y el
   pasivo baja. El saldo pendiente se RESTA de calcPatrimonioTotal(),
   igual que ya se hace con la deuda de tarjeta de crédito — es plata
   que tengo físicamente pero no es mía. */
let miDeudaActualId = null;


let prestamosTabActiva = 'me-deben'; // Recuerda qué pestaña (Me deben / Yo debo) quedó activa, para restaurarla al volver a la pantalla
// Pinta una pestaña (Me deben / Yo debo) como activa o inactiva.
function _pintarTabPrestamos(el, activa) {
  if (!el) return;
  el.classList.toggle('btn-tab-activa', activa);
  el.classList.toggle('btn-ghost', !activa);
}
function cambiarTabPrestamos(tab) {
  prestamosTabActiva = tab;
  const yoDebo = tab === 'yo-debo';
  _pintarTabPrestamos(document.getElementById('tab-me-deben'), !yoDebo);
  _pintarTabPrestamos(document.getElementById('tab-yo-debo'), yoDebo);
  // Cada dirección tiene su lista y su detalle; el detalle siempre arranca oculto.
  const mostrar = (id, visible) => { const e = document.getElementById(id); if (e) e.style.display = visible ? '' : 'none'; };
  mostrar('deudoresView', !yoDebo);
  mostrar('deudorDetalle', false);
  mostrar('misDeudasView', yoDebo);
  mostrar('miDeudaDetalle', false);
  if (yoDebo) renderMisDeudasList();
}

function renderMisDeudasList() {
  const el = document.getElementById('misDeudasList');
  if (!el) return;
  const list = Deudas.lista('contra');
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
  const d = Deudas.lista('contra').find(x => x.id === id);
  if (!d) return;
  const saldo = getMiDeudaSaldo(d);
  const totalRecibido = (d.movimientos || []).filter(m => m.tipo === 'recibido').reduce((a, m) => a + m.monto, 0);
  // Lo perdonado (_perdon) no es plata que pagó: queda en el historial como "Perdonada".
  const totalPagado = (d.movimientos || []).filter(m => m.tipo === 'pago' && !m._perdon).reduce((a, m) => a + m.monto, 0);

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
      const esPerdon = !esRecibido && !!m._perdon;
      const cuentasRef = _deudaCuentasDe(m);
      return html`<div class="card card-sm" style="margin-bottom:7px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <span class="badge ${esRecibido ? 'bg-amber' : esPerdon ? 'bg-blue' : 'bg-green'}" style="font-size:9px;">${esRecibido ? 'Me prestó' : esPerdon ? 'Perdonada' : 'Pago'}</span>
              ${m.nota ? html` <span style="font-size:11px;color:var(--text2);">${m.nota}</span>` : ''}
            </div>
            <div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;margin-top:3px;">${m.fecha}${cuentasRef.length ? raw(' · ' + cuentasRef.map(_fuenteLabelHtml).join(' + ')) : ''}</div>
            ${m.extra ? html`<div style="font-size:10px;color:var(--amber);font-family:'DM Mono',monospace;margin-top:2px;">Pagaste de más ${fmt(m.extra.monto)} · queda como gasto</div>` : ''}
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

/* ── YO DEBO: registrar un movimiento (validar → aplicar) ────────────────
   Mismas capacidades que "Me deben", con el efecto financiero que le toca a
   cada una desde el lado de quien debe:
   - Recibido / pago repartidos entre varias cuentas (Dividir ÷): `destinos[]`
     / `fuentes[]`, cada fila con el id de su movimiento espejo para revertirla.
   - Perdón ("¿Te lo perdonaron?"): lo que faltaba se borra de la deuda sin mover
     ninguna cuenta, y SÍ es un ingreso real (tu patrimonio neto sube). Queda un
     ingreso "fantasma" (fuente '', como el margen de un préstamo) enlazado al
     pago por `_ingresoPerdonId`; el pago lleva `_perdon: true`.
   - Pago de más ("¿Pagaste de más?"): el pago baja la deuda solo hasta el saldo;
     el extra sale de la cuenta pero NO baja la deuda, así que es un gasto real
     (`S.gastosVar`, enlazado por `extra.gastoId`). Las cuentas descuentan
     monto + extra.
   Todo el movimiento se valida ANTES de escribir nada (_planMovMiDeuda); aplicar
   (_aplicarMovMiDeuda) no tiene ningún `return` de validación, así que un error
   no puede dejar la deuda a medias. */
let _mdMovTipo = 'recibido';
let _mdSplitMode = false;

function _getMdSplitFuentesOptions(selectedVal) {
  // 'recibido' = plata que entra: sin tarjetas (nunca son destino) y sin filtrar por saldo.
  // 'pago' = plata que sale: cuentas con saldo >= $1,00 y tarjetas con cupo disponible.
  const fuentes = _mdMovTipo === 'recibido' ? getFuentesSinTC() : FuentesFiltro.filtrar(getFuentes(), FuentesFiltro.PRESET.SALIDA);
  let out = '<option value="">Elige cuenta</option>';
  for (const f of fuentes) {
    out += `<option value="${f.val}"${f.val === selectedVal ? ' selected' : ''}>${escHtml(f.label)}</option>`;
  }
  return out;
}

crearSplitWidget('mdSplit', {
  simpleId: 'md_cuenta_simple', splitId: 'md_cuenta_split', toggleId: 'md_split_toggle', rowsId: 'md_split_rows',
  getModo: () => _mdSplitMode, setModo: v => { _mdSplitMode = v; },
  getFuentesFn: _getMdSplitFuentesOptions,
  onPreview: _updateMdSplitResumen
});

function _mdEl(id) { return document.getElementById(id); }
function _mdEsPerdon() {
  const c = _mdEl('md_perdon');
  return _mdMovTipo === 'pago' && !!(c && c.checked);
}
// Extra pagado de más (solo en pagos, y nunca junto con un perdón).
function _mdExtra() {
  const c = _mdEl('md_tiene_extra');
  if (_mdMovTipo !== 'pago' || _mdEsPerdon() || !c || !c.checked) return 0;
  return parseMoney((_mdEl('md_extra_monto') || {}).value) || 0;
}
// Plata que pasa por las cuentas: el monto, más el extra si lo hay.
function _mdTotalCuentas() {
  return (parseMoney((_mdEl('md_monto') || {}).value) || 0) + _mdExtra();
}
function toggleMdSplit() { splitToggle('mdSplit'); }
function _mdAddSplitRow() { splitAgregarRow('mdSplit'); }

function _updateMdSplitResumen() {
  const resEl = _mdEl('md_split_resumen');
  if (!resEl || !_mdSplitMode) return;
  const total = _mdTotalCuentas();
  const repartido = splitGetData('mdSplit').reduce((a, r) => a + (r.monto || 0), 0);
  const diff = total - repartido;
  if (total && Math.abs(diff) > Deudas.TOL) {
    resEl.innerHTML = html`<span style="color:var(--amber);">Total dividido: ${fmt(repartido)} de ${fmt(total)} · ${diff > 0 ? 'Faltan' : 'Sobran'} ${fmt(Math.abs(diff))}</span>`;
  } else if (total) {
    resEl.innerHTML = html`<span style="color:var(--accent);">Total: ${fmt(repartido)}</span>`;
  } else { resEl.textContent = ''; }
}

function _mdTitulo() {
  if (_mdEsPerdon()) return 'Perdonar deuda';
  return _mdMovTipo === 'recibido' ? 'Me prestó más' : 'Registrar pago';
}
function toggleMdExtra() {
  const c = _mdEl('md_tiene_extra');
  const body = _mdEl('md_extra_body');
  if (body) body.style.display = (c && c.checked) ? '' : 'none';
  _updateMdSplitResumen();
}
function toggleMdPerdon() {
  const perdon = _mdEsPerdon();
  if (perdon) {
    // Lo que deja de aplicar se apaga, para que no quede un estado oculto.
    const ex = _mdEl('md_tiene_extra');
    if (ex && ex.checked) { ex.checked = false; toggleMdExtra(); }
    if (_mdSplitMode) splitToggle('mdSplit');
    const d = Deudas.porId('contra', miDeudaActualId);
    const saldo = d ? Deudas.saldo(d) : 0;
    _mdEl('md_monto').value = fmtInput(saldo > 0 ? saldo : 0);
  }
  _mdEl('md_cuenta_wrap').style.display = perdon ? 'none' : '';
  _mdEl('md_extra_wrap').style.display = (perdon || _mdMovTipo !== 'pago') ? 'none' : '';
  _mdEl('mdMovSheetTitle').textContent = _mdTitulo();
}

function abrirMovMiDeuda(tipo) {
  _mdMovTipo = tipo;
  splitReset('mdSplit');
  const pago = tipo === 'pago';
  const perdon = _mdEl('md_perdon'); if (perdon) perdon.checked = false;
  const extra = _mdEl('md_tiene_extra'); if (extra) extra.checked = false;
  const extraMonto = _mdEl('md_extra_monto'); if (extraMonto) extraMonto.value = '';
  const extraBody = _mdEl('md_extra_body'); if (extraBody) extraBody.style.display = 'none';
  const perdonWrap = _mdEl('md_perdon_wrap'); if (perdonWrap) perdonWrap.style.display = pago ? '' : 'none';
  const extraWrap = _mdEl('md_extra_wrap'); if (extraWrap) extraWrap.style.display = pago ? '' : 'none';
  _mdEl('md_cuenta_wrap').style.display = '';
  _mdEl('mdMovSheetTitle').textContent = _mdTitulo();
  _mdEl('md_cuenta_label').textContent = tipo === 'recibido' ? '¿A qué cuenta entró la plata?' : '¿De qué cuenta sale el pago?';
  _mdEl('md_cuenta_hint').textContent = tipo === 'recibido' ? 'Se sumará automáticamente al saldo de esa cuenta' : 'Se descontará del saldo de esa cuenta (en una tarjeta, sube su deuda)';
  const sel = _mdEl('md_cuenta');
  // 'recibido' = plata que entra (sin tarjetas ni filtro de saldo); 'pago' = plata que sale: cuentas con
  // saldo >= $1,00 y tarjetas de crédito con cupo disponible (el pago queda como deuda de la tarjeta).
  const fuentes = tipo === 'recibido' ? getFuentesSinTC() : FuentesFiltro.filtrar(getFuentes(), FuentesFiltro.PRESET.SALIDA);
  sel.innerHTML = html`<option value>Sin especificar</option>${fuentes.map(f => html`<option value="${f.val}">${f.label}</option>`)}`;
  _mdEl('md_monto').value = '';
  _mdEl('md_fecha').value = hoy();
  _mdEl('md_nota').value = '';
  openSheet('mov-mi-deuda');
}

// Lee el formulario y devuelve { error } o el plan completo. NO escribe nada.
function _planMovMiDeuda() {
  const d = Deudas.porId('contra', miDeudaActualId);
  if (!d) return null;
  const tipo = _mdMovTipo;
  const monto = parseMoney(_mdEl('md_monto').value) || 0;
  if (!monto) return { error: 'Ingresa un monto' };
  const fecha = _mdEl('md_fecha').value || hoy();
  const cuentaSimple = _mdEl('md_cuenta').value;
  const nota = (_mdEl('md_nota').value || '').trim();
  const perdon = _mdEsPerdon();
  const extra = _mdExtra();
  const extraChk = _mdEl('md_tiene_extra');
  if (tipo === 'pago' && !perdon && extraChk && extraChk.checked && !extra) return { error: 'Ingresa el monto del extra' };

  if (tipo === 'pago') {
    const saldo = Deudas.saldo(d);
    if (perdon) {
      if (saldo <= Deudas.TOL_FINO) return { error: 'No hay saldo pendiente' };
      if (Math.abs(monto - saldo) > Deudas.TOL) return { error: `El perdón cubre todo lo que falta (${fmt(saldo)})` };
    } else if (monto > saldo + Deudas.TOL) {
      return { error: `Solo le debes ${fmt(saldo)}` };
    }
  }

  // Cuentas por las que pasa la plata (el perdón no mueve ninguna).
  let cuentas = [];
  if (!perdon) {
    const total = monto + extra;
    if (_mdSplitMode) {
      const filas = splitGetData('mdSplit');
      if (!filas.length || filas.some(r => !r.fuente)) return { error: 'Elige la cuenta en cada fila del reparto' };
      const suma = filas.reduce((a, r) => a + r.monto, 0);
      if (Math.abs(suma - total) > Deudas.TOL) return { error: `La suma de las cuentas (${fmt(suma)}) no coincide con ${fmt(total)}` };
      cuentas = filas.map(r => ({ cuenta: r.fuente, monto: r.monto }));
    } else if (cuentaSimple) {
      cuentas = [{ cuenta: cuentaSimple, monto: total }];
    }
    // Una tarjeta nunca es destino de plata que entra (regla del proyecto).
    if (tipo === 'recibido' && cuentas.some(c => c.cuenta.startsWith('tc:'))) return { error: 'Una tarjeta de crédito no puede recibir plata' };
    if (tipo === 'pago') {
      for (const c of cuentas) {
        const disponible = getSaldoFuente(c.cuenta); // en una tarjeta es el cupo disponible
        if (c.monto > disponible + Deudas.TOL_FINO) {
          return { error: c.cuenta.startsWith('tc:')
            ? `Cupo insuficiente en ${escHtml(fuenteLabel(c.cuenta))} — disponible: ${fmt(disponible)}`
            : `En ${escHtml(fuenteLabel(c.cuenta))} solo hay ${fmt(disponible)}` };
        }
      }
    }
  }
  return { d, tipo, monto, fecha, nota, perdon, extra, cuentas, partido: _mdSplitMode && cuentas.length > 1 };
}

// Aplica un plan ya validado. Sin returns de validación: no puede quedar a medias.
function _aplicarMovMiDeuda(p) {
  const { d, tipo, monto, fecha, nota, perdon, extra, cuentas, partido } = p;
  const origen = 'Prestado · Yo debo';
  const entra = tipo === 'recibido';
  const desc = entra ? `Me prestó — ${d.nombre}` : `Pago de deuda — ${d.nombre}`;
  const movId = uid();
  const efectos = cuentas.map(c => {
    if (entra) sumarFuente(c.cuenta, c.monto); else descontarFuente(c.cuenta, c.monto);
    if (c.cuenta.startsWith('tc:')) {
      // Pago con tarjeta: sube la deuda de la TC. descontarFuente ya la subió; falta el cargo que la respalda
      // (tcRecalcular reconstruye tc.deuda desde sus registros en cada refresh). Es deuda PROPIA, no ajena.
      const tcMovId = uid();
      if (!S.tcMovimientos) S.tcMovimientos = [];
      S.tcMovimientos.push({ id: tcMovId, tcId: c.cuenta.split(':')[1], tipo: 'cargo_deuda', desc, monto: c.monto, fecha,
        nota: 'Pago de una deuda propia con la tarjeta — no es un gasto', miDeudaId: d.id, _miDeudaMovId: movId });
      return { fuente: c.cuenta, monto: c.monto, _tcMovId: tcMovId };
    }
    return { fuente: c.cuenta, monto: c.monto, _movId: registrarMovEspejo({ cuenta: c.cuenta, flujo: entra ? 'entrada' : 'salida', monto: c.monto, fecha, desc, origen }) || undefined };
  });
  const unica = (!partido && efectos.length === 1) ? efectos[0] : null;
  const mov = entra
    ? { id: movId, tipo, monto, fecha, destino: unica ? unica.fuente : undefined, nota, ts: Date.now(), _movSecId: unica ? unica._movId : undefined }
    : { id: movId, tipo, monto, fecha, fuente: unica ? unica.fuente : undefined, nota, ts: Date.now(), _movSecId: unica ? unica._movId : undefined, _tcMovId: unica ? unica._tcMovId : undefined };
  if (partido) mov[entra ? 'destinos' : 'fuentes'] = efectos;
  if (perdon) {
    // Ingreso real que no tocó ninguna cuenta: fuente '' (mismo criterio que el margen de un préstamo).
    if (!S.movimientos) S.movimientos = [];
    const ingId = uid();
    S.movimientos.push({
      id: ingId, tipo: 'entrada', fuente: '', monto, fecha, desc: `Me perdonó la deuda — ${d.nombre}`, nota,
      _secundario: true, _origenSeccion: origen, _esPerdonRecibido: true, _deudaId: d.id, _deudaMovId: mov.id, ts: Date.now()
    });
    mov._perdon = true;
    mov._ingresoPerdonId = ingId;
  }
  if (extra > 0) {
    // El extra salió de las cuentas pero no bajó la deuda: gasto real, no descuenta ningún saldo
    // por su cuenta (fuente '') porque las cuentas ya descontaron monto + extra arriba.
    if (!S.gastosVar) S.gastosVar = [];
    const gastoId = uid();
    S.gastosVar.push({
      id: gastoId, monto: extra, fecha, cat: 'Otro', desc: `Pagué de más — ${d.nombre}`, nota, fuente: '', ts: Date.now(),
      _secundario: true, _origenSeccion: origen, _esExtraDeuda: true, _deudaId: d.id, _deudaMovId: mov.id
    });
    mov.extra = { monto: extra, gastoId };
  }
  d.movimientos.push(mov);
  return mov;
}

function confirmarMovMiDeuda() {
  const plan = _planMovMiDeuda();
  if (!plan) return;
  if (plan.error) { toast(plan.error, 'err', 4000); return; }
  _aplicarMovMiDeuda(plan);
  save(); refresh(); closeSheet('mov-mi-deuda');
  abrirMiDeuda(plan.d.id);
  toast(plan.perdon ? 'Deuda perdonada' : 'Movimiento registrado', 'ok');
}

// Revierte EXACTAMENTE lo que hizo _aplicarMovMiDeuda (o el registro antiguo, de una sola cuenta).
function _revertirMovMiDeuda(m) {
  const entra = m.tipo === 'recibido';
  const total = (m.monto || 0) + (m.extra ? m.extra.monto : 0);
  let filas;
  if (entra) filas = (m.destinos && m.destinos.length) ? m.destinos : (m.destino ? [{ fuente: m.destino, monto: m.monto, _movId: m._movSecId }] : []);
  else filas = (m.fuentes && m.fuentes.length) ? m.fuentes : (m.fuente ? [{ fuente: m.fuente, monto: total, _movId: m._movSecId, _tcMovId: m._tcMovId }] : []);
  filas.forEach(r => {
    if (!r.fuente) return;
    if (r.fuente.startsWith('tc:')) {
      // Pago con tarjeta: se quita el cargo y baja la deuda de la TC. Si el cargo ya no existe, no se resta otra vez.
      const antes = (S.tcMovimientos || []).length;
      if (r._tcMovId) S.tcMovimientos = (S.tcMovimientos || []).filter(x => x.id !== r._tcMovId);
      if (!r._tcMovId || (S.tcMovimientos || []).length !== antes) sumarFuente(r.fuente, r.monto);
      return;
    }
    // Si el movimiento espejo ya no existe, el saldo no se toca otra vez (evita doble reversión).
    const existe = r._movId ? borrarMovEspejo(r.fuente, r._movId) : true;
    if (!existe) return;
    if (entra) descontarFuente(r.fuente, r.monto, { exacto: true }); else sumarFuente(r.fuente, r.monto);
  });
  if (m._perdon && m._ingresoPerdonId) S.movimientos = (S.movimientos || []).filter(x => x.id !== m._ingresoPerdonId);
  if (m.extra && m.extra.gastoId) S.gastosVar = (S.gastosVar || []).filter(x => x.id !== m.extra.gastoId);
}

async function eliminarMovMiDeuda(deudaId, movId) {
  const d = Deudas.porId('contra', deudaId);
  if (!d) return;
  const m = (d.movimientos || []).find(x => x.id === movId);
  if (!m) return;

  // Protección por antigüedad — ver docs/proteccion-antiguedad-movimientos.md.
  // Solo aplica si _deudaTieneCuentaAfectada(m) — un movimiento "Sin
  // especificar" no revierte ningún saldo real.
  if (_deudaTieneCuentaAfectada(m)) {
    const opsPosteriores = _deudaOpsPosteriores(d, m);
    const nivel = nivelAntiguedadMovimiento(m.fecha, opsPosteriores, 'prestamos');
    if (nivel === 'bloqueado') {
      await avisarMovimientoBloqueado();
      return;
    }
    if (nivel === 'viejo') {
      const cuentas = _deudaCuentasDe(m);
      const nombreCuenta = cuentas.length > 1 ? `${cuentas.length} cuentas` : (cuentas.length ? fuenteLabel(cuentas[0]) : (m._perdon ? 'tus ingresos' : 'tus gastos'));
      const ok = await confirmarBorrarMovimientoViejo(nombreCuenta, m.monto || 0, m.tipo === 'recibido' ? 'baja' : 'sube');
      if (!ok) return;
    }
  }

  _revertirMovMiDeuda(m);
  d.movimientos = d.movimientos.filter(x => x.id !== movId);
  save(); refresh();
  abrirMiDeuda(deudaId);
}


async function eliminarMiDeuda() {
  const d = Deudas.lista('contra').find(x => x.id === miDeudaActualId);
  if (!d) return;
  const saldo = getMiDeudaSaldo(d);
  if (Math.abs(saldo) > Deudas.TOL) {
    await dialogo('No se puede eliminar', `Aún le debes ${fmt(saldo)} a ${escHtml(d.nombre)}. Registra el pago completo antes de eliminar.`, 'Entendido', false);
    return;
  }
  const ok = await dialogo('Eliminar deuda', `¿Eliminar el registro de deuda con ${escHtml(d.nombre)}? Esta acción no se puede deshacer.`, 'Eliminar', true);
  if (!ok) return;
  Deudas.quitar('contra', miDeudaActualId);
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

// El botón "Préstamo con TC" se ve atenuado (y al tocarlo explica por qué no se puede, ver
// abrirSheetPrestamoTC) cuando ninguna TC activa tiene cupo disponible. No usa `disabled`
// a propósito: en móvil un botón deshabilitado no explica nada, y el toast sí.
function _actualizarBtnPrestamoTC() {
  const btn = document.getElementById('btn-prestamo-tc');
  if (!btn) return;
  const ok = FuentesFiltro.hayTCConCupo();
  btn.setAttribute('aria-disabled', ok ? 'false' : 'true');
  btn.style.opacity = ok ? '' : '.45';
}

function abrirSheetPrestamoTC() {
  if (!deudorActualId) return;
  const tcs = (S.tarjetasCredito || []).filter(tc => (tc.estado||'activa')==='activa');
  if (!tcs.length) { toast('No tenés tarjetas de crédito activas configuradas', 'err', 3000); return; }
  // Un préstamo con TC es un cargo a la tarjeta: solo tiene sentido con las que tienen cupo
  // disponible (FuentesFiltro.tcConCupo, js/core/fuentes-filtro.js). Sin ninguna, no se abre el sheet.
  const tcsConCupo = tcs.filter(tc => FuentesFiltro.tcConCupo(tc));
  if (!tcsConCupo.length) { toast('No se puede: ninguna de tus tarjetas tiene cupo disponible', 'err', 3500); return; }
  const sel = document.getElementById('prtc_tarjeta');
  if (sel) {
    sel.innerHTML = html`<option value="">Seleccionar TC</option>${tcsConCupo.map(tc => html`<option value="${tc.id}">${tc.nombre} — cupo: ${fmt(tcCupoDisponible(tc))}</option>`)}`;
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
  const d = Deudas.lista('favor').find(x => x.id === deudorActualId);
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

  // Validación de cupo — mismo patrón que tarjetas_credito.js:confirmarCompraTC.
  // A diferencia de un cargo bancario (interés/comisión), esto SÍ es una
  // compra que decidiste hacer con tu TC, así que sí debe respetar el cupo.
  // Se valida contra montoTC (lo que realmente carga la tarjeta), no contra
  // `dijo` (lo que le dijiste al deudor) — con diferencial activo esos dos
  // valores pueden ser distintos, y lo que importa acá es cuánto va a la TC.
  if (tc.cupo && tcCupoDisponible(tc) < montoTC) {
    toast('Cupo insuficiente en '+escHtml(tc.nombre)+' — cupo disponible: '+fmt(tcCupoDisponible(tc)), 'err', 4000);
    return;
  }

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
  if (margen > Deudas.TOL_FINO) {
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
      if (porCuenta[cuenta] > _getEncargoSaldoEnCuenta(enc, cuenta) + Deudas.TOL_FINO) { excedeCuenta = true; break; }
    }
  }

  if (excedeCuenta) { el.innerHTML = html`${lines} · <span style="color:var(--red);">excede el saldo de esa cuenta</span>`; el.style.color = 'var(--red)'; }
  else if (Math.abs(restante) < 1) { el.innerHTML = html`${lines} &#x2713;`; el.style.color = 'var(--accent)'; }
  else if (restante > 0) { el.innerHTML = html`${lines} · Sin asignar: ${fmt(restante)}`; el.style.color = 'var(--amber)'; }
  else { el.innerHTML = html`${lines} · Excede: ${fmt(-restante)}`; el.style.color = 'var(--red)'; }
}
function editarDeudorActual() {
  if (!deudorActualId) return;
  const d = Deudas.lista('favor').find(x => x.id === deudorActualId);
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
  const d = Deudas.lista('favor').find(x => x.id === deudorActualId);
  if (!d) return;
  const saldo = getDeudorSaldo(d);
  if (saldo <= 0) { toast('No hay saldo pendiente', 'info'); return; }
  openSheet('registrar-movimiento');
  initMovSheet('abono');
}

function _abrirSheetPagoCompleto() {
  const d = Deudas.lista('favor').find(x => x.id === deudorActualId);
  if (!d) return;
  const saldo = getDeudorSaldo(d);
  if (saldo <= 0) { toast('No hay saldo pendiente', 'info'); return; }
  openSheet('registrar-movimiento');
  initMovSheet('pago-completo');
  document.getElementById('mov_monto').value = fmtInput(saldo);
}

function _abrirSheetNuevaDeuda() {
  openSheet('nueva-deuda'); // el hook de openSheet (más abajo) abre el selector de personas
}

function _abrirMovMiDeudaRecibido() {
  abrirMovMiDeuda('recibido');
}

function _abrirMovMiDeudaPago() {
  const d = Deudas.lista('contra').find(x => x.id === miDeudaActualId);
  if (!d) return;
  const saldo = getMiDeudaSaldo(d);
  if (saldo <= 0) { toast('No hay saldo pendiente', 'info'); return; }
  abrirMovMiDeuda('pago');
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
  abrirSheetNuevaPersona: _abrirSheetNuevaPersona,

  // Sheet "nuevo movimiento" (préstamo / abono / pago completo)
  abrirSheetNuevoPrestamo: _abrirSheetNuevoPrestamo,
  abrirSheetAbono: _abrirSheetAbono,
  abrirSheetPagoCompleto: _abrirSheetPagoCompleto,
  confirmarMovimientoGuard: _confirmarMovimientoConGuard,
  togglePrestSplit: togglePrestSplit,
  prestAddSplitRow: _prestAddSplitRow,
  toggleMdSplit: toggleMdSplit,
  mdAddSplitRow: _mdAddSplitRow,
  movDifToggle: _movDifToggle,
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
    // Con "El valor era diferente" abierto, "dijiste" cambia con el monto: refresca el resumen
    // (que a su vez refresca el split si está abierto). Si no, solo el split.
    if (diffEstaAbierto('prestamoDif')) _movDifResumen();
    else if (_prestSplitMode) _updatePrestSplitResumen();
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
  ['mov_perdon', 'change', toggleMovPerdon],
  ['md_perdon', 'change', toggleMdPerdon],
  ['md_tiene_extra', 'change', toggleMdExtra],
  ['md_monto', 'input', _updateMdSplitResumen],
  ['md_extra_monto', 'input', _updateMdSplitResumen],
  ['mov_extra_monto', 'input', extResumenPartes],
  ['prtc_dif_real', 'input', _prtcDifResumen],
  ['mov_dif_real', 'input', _movDifResumen],
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

/* ── Hook: si el detalle de un deudor (Préstamos > me deben) está abierto */
/* y se guarda desde el sheet unificado "Editar persona", refrescar su    */
/* encabezado (nombre/avatar) para reflejar el cambio al instante. ────── */
const _origGuardarEditarPersonaGlobalDeudor = _guardarEditarPersonaGlobal;
_guardarEditarPersonaGlobal = function() {
  const idEditado = _editPersonaGlobalId;
  _origGuardarEditarPersonaGlobalDeudor.apply(this, arguments);
  const d = Deudas.lista('favor').find(x => x.id === deudorActualId);
  if (d && d.personaId === idEditado) {
    const detalle = document.getElementById('deudorDetalle');
    if (detalle && detalle.style.display !== 'none') abrirDeudor(deudorActualId);
  }
};


/* ── Abrir perfil desde una misDeuda (crea persona si no tiene) ── */
function _abrirPerfilDesdeMiDeuda(miDeudaId) {
  if (!miDeudaId) return;
  const d = Deudas.lista('contra').find(x => x.id === miDeudaId);
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
  const d = Deudas.lista('contra').find(x => x.id === miDeudaActualId);
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
  const d = Deudas.lista('contra').find(x => x.id === miDeudaActualId);
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

   Mismo selector de persona (existente o nueva) en "Agregar persona"
   (Me deben) y "Nueva deuda" (Yo debo): cada uno con su título y sin
   ofrecer a quien ya está en esa lista. Necesita openSheet definido
   (sheet-stack.js). Ver prestado.md.
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
  const existente = Deudas.lista('favor').find(d => d.personaId === personaId);
  if (existente) {
    closeSheet('nueva-persona');
    toast(`${escHtml(p.nombre)} ya está en tu lista de "Me deben"`, 'info');
    showScreen('prestamos');
    cambiarTabPrestamos('me-deben');
    setTimeout(() => abrirDeudor(existente.id), 200);
    return;
  }
  const d = Deudas.agregar('favor', { id: uid(), nombre: p.nombre, color: p.color || '#60b0f0', personaId: p.id, movimientos: [] });
  save(); refresh();
  toast(`${escHtml(p.nombre)} agregado/a`, 'ok');
  showScreen('prestamos');
  cambiarTabPrestamos('me-deben');
  abrirDeudor(d.id);
}

/* ── Yo debo: "Nueva deuda" abre directamente el mismo selector ────
   Igual que Me deben: se elige (o crea) a la persona, queda la deuda
   vacía y se abre su detalle; el primer "Me prestó" se registra desde
   ahí (con Dividir ÷, movimiento espejo, etc.). */
function _onSelPersonaYoDebo(personaId) {
  const p = getPersona(personaId);
  if (!p) return;
  // Red de seguridad: el selector ya no ofrece a quien tiene deuda (excluir), pero si llegara, se abre la existente.
  const existente = Deudas.porPersona('contra', personaId);
  if (existente) {
    toast(`Ya tienes una deuda registrada con ${escHtml(p.nombre)}`, 'info');
    showScreen('prestamos');
    cambiarTabPrestamos('yo-debo');
    setTimeout(() => abrirMiDeuda(existente.id), 200);
    return;
  }
  const d = Deudas.agregar('contra', { id: uid(), nombre: p.nombre, color: p.color || '#f06868', personaId: p.id, movimientos: [] });
  save(); refresh();
  toast(`${escHtml(p.nombre)} agregado/a`, 'ok');
  showScreen('prestamos');
  cambiarTabPrestamos('yo-debo');
  abrirMiDeuda(d.id);
}

/* ── Hook en openSheet: 'nueva-persona' (Me deben) y 'nueva-deuda' (Yo debo)
     abren el selector de personas directo, cada uno con su título y su filtro ── */
const _origOpenSheetMeDebenYoDebo = openSheet;
openSheet = function(id) {
  if (id === 'nueva-persona') {
    _inyectarPersonaSheets();
    abrirSelPersona(_onSelPersonaMeDeben, '¿Quién te debe?', { excluir: pe => !!Deudas.porPersona('favor', pe.id) });
    return;
  }
  if (id === 'nueva-deuda') {
    _inyectarPersonaSheets();
    abrirSelPersona(_onSelPersonaYoDebo, '¿A quién le debes?', { excluir: pe => !!Deudas.porPersona('contra', pe.id) });
    return;
  }
  _origOpenSheetMeDebenYoDebo.apply(this, arguments);
};

