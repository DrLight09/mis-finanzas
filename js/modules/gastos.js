/* ═══════════════════════════════════════════════════════════════
   js/modules/gastos.js

   Módulo Gastos — gasto variable (día a día, incluidas compras y
   pagos de TC que aparecen en el historial) y gasto fijo
   (recurrentes mensuales, con su flujo de pago).

   Sexto módulo migrado desde el <script> inline de index.html
   (después de Spotify, Mesada, Encargos, Préstamos y Tarjetas de
   Crédito) — ver AUDITORIA-TECNICA.md, puntos 1, 2 y 3.

   Un solo archivo alcanza (como con Mesada): nada de acá depende de
   código definido más abajo en index.html. Sí depende de tres
   funciones de Tarjetas de Crédito (tcCrearCompra,
   tcEliminarCompraInterna, tcEliminarPagoInterna), pero solo se
   llaman dentro de handlers de click — nunca al cargar el script —
   así que el orden real de los <script src> no importa acá.

   onclick → data-action/Events: 6 casos migrados, 0 restantes en
   este módulo (filtro de mes, eliminar gasto variable, eliminar y
   pagar gasto fijo, y los dos botones de estado vacío). Los
   onmouseenter/onmouseleave de los botones "eliminar" (2 pares) se
   dejaron igual que en los cinco módulos anteriores en su momento —
   se migraron recién en una sesión posterior a la clase CSS
   compartida .btn-delete-hover (index.html), al detectarse que la CSP
   también bloquea handlers inline generados dinámicamente, no solo
   los que vienen del HTML estático — ver auditoria-tecnica.md #1 y
   CHANGELOG.md#infraestructura--seguridad. El resto de los módulos
   con el mismo patrón sigue pendiente.

   .innerHTML sin escapar: repetido un quinto módulo seguido — texto
   libre (fuenteLabel()/tc.nombre) sin escHtml(). 4 sitios
   corregidos: badge de fuente en cada gasto, los 2 toast() de error
   de addGastoVar, el toast() de "compra cargada a...", y el
   <option> del selector en abrirPagarGastoFijo() (reimplementaba su
   propio selector a mano en vez de usar poblarFuente(), mismo
   hallazgo puntual que ya tenía Tarjetas de Crédito).

   Hallazgo nuevo (mismo problema de fondo, no es un onclick): el
   sheet "pagar-gasto-fijo" tenía un onclick y un onchange inline en
   controles estáticos (no en plantillas de este módulo). En su
   momento se movieron al bloque de wiring centralizado de
   index.html, siguiendo la convención que existía entonces para
   controles estáticos de sheets. Esa convención cambió el
   2026-07-26 (ver auditoria-tecnica.md, punto 3): ahora cada módulo
   con su propio archivo también hace el wiring de sus propios
   controles estáticos, para poder vaciar _initEventListeners() del
   todo. Este archivo ya sigue el criterio nuevo — ver el bloque de
   wiring al final, antes de Events.registerAll.
   ═══════════════════════════════════════════════════════════════ */

let mesFilter = 'todos';
let gastoTab = 'var';
let pgfIdActual = null;

/* ── Split de fuentes — gasto variable (motor genérico, ver
   js/core/split.js). Sin TC en modo dividido: una compra en TC es un
   CARGO a la tarjeta, no un retiro de saldo de cuenta, y el motor de
   split trata cada fila igual (sumar/descontar saldo) — no distingue
   un cargo de un movimiento real de cuenta. Mismo criterio que el
   pago de Spotify dividido, ver spotify.js. El select simple de
   gv_fuente sigue permitiendo TC exactamente igual que antes. ── */
let gvSplitMode = false;

function getGvSplitFuentesOptions(selectedVal) {
  return buildFuentesOptsHtml({ selectedVal, placeholder: 'Selecciona una cuenta...', incluirTC: false });
}

crearSplitWidget('gv', {
  simpleId: 'gvModoSimple', splitId: 'gvModoDividido', toggleId: 'gvSplitToggle', rowsId: 'gvSplitRows',
  getModo: () => gvSplitMode, setModo: v => { gvSplitMode = v; },
  getFuentesFn: getGvSplitFuentesOptions,
  onPreview: actualizarGvSplitPreview
});
function toggleGvSplit() { splitToggle('gv'); }
function agregarGvSplitRow() { splitAgregarRow('gv'); }
function getGvSplitData() { return splitGetData('gv'); }

// Preview del split de gasto — mismo estilo que actualizarSpPagarPreview
// en spotify.js (modo dividido: todo o nada, sin margen de "sin asignar").
function actualizarGvSplitPreview() {
  const prev = document.getElementById('gvSplitPreview');
  if (!prev) return;
  const monto = parseMoney(document.getElementById('gv_monto').value) || 0;
  const splits = getGvSplitData();
  if (!monto) { prev.textContent = ''; return; }
  const totalSplit = splits.reduce((a, s) => a + s.monto, 0);
  const restante = monto - totalSplit;
  if (splits.length === 0) { prev.textContent = fmt(monto) + ' por repartir entre cuentas'; prev.style.color = 'var(--text2)'; return; }
  const lines = splits.map(s => fuenteLabel(s.fuente || '') + ': \u2212' + fmt(s.monto)).join(' · ');
  if (restante > 0) { prev.textContent = lines + ' · Sin asignar: ' + fmt(restante); prev.style.color = 'var(--amber)'; }
  else if (restante < 0) { prev.textContent = lines + ' · Excede por: ' + fmt(-restante); prev.style.color = 'var(--red)'; }
  else { prev.textContent = lines + ' · Todo repartido'; prev.style.color = 'var(--accent)'; }
}

/* ---- TABS ---- */

function switchGastoTab(t) {
  gastoTab = t;
  document.getElementById('tab-var').classList.toggle('active', t === 'var');
  document.getElementById('tab-fijo').classList.toggle('active', t === 'fijo');
  document.getElementById('panel-var').style.display = t === 'var' ? '' : 'none';
  document.getElementById('panel-fijo').style.display = t === 'fijo' ? '' : 'none';
}

/* ---- ESTADO VACÍO: helpers que unifican el flujo con el botón fantasma ---- */

function abrirNuevoGastoVar() {
  poblarCatSelect('gv_cat', getCatsVar());
  // Resetear split (mismo patrón que abrirRegistrarMesada en mesada.js /
  // openSheet_pagarSpotify en spotify.js)
  gvSplitMode = false;
  document.getElementById('gvModoSimple').style.display = '';
  document.getElementById('gvModoDividido').style.display = 'none';
  document.getElementById('gvSplitRows').innerHTML = '';
  const gvToggleBtn = document.getElementById('gvSplitToggle');
  if (gvToggleBtn) {
    gvToggleBtn.textContent = 'Dividir ÷';
    gvToggleBtn.style.background = 'rgba(200,240,96,.1)';
    gvToggleBtn.style.borderColor = 'rgba(200,240,96,.3)';
    gvToggleBtn.style.color = 'var(--accent)';
  }
  const gvSplitPrev = document.getElementById('gvSplitPreview');
  if (gvSplitPrev) gvSplitPrev.textContent = '';
  openSheet('gasto-var');
}

function abrirNuevoGastoFijo() {
  poblarCatSelect('gf_c', getCatsFijo());
  openSheet('gasto-fijo');
}

/* ---- GASTOS VARIABLES ---- */

function renderMesFiltros() {
  const meses = new Set();
  meses.add('todos');
  (S.gastosVar || []).forEach(g => { if (g.fecha) meses.add(mesKey(g.fecha)); });
  const sorted = ['todos', ...[...meses].filter(m => m !== 'todos').sort().reverse()];
  document.getElementById('mesFilter').innerHTML = sorted.map(m => `
    <div class="mf-chip ${mesFilter === m ? 'active' : ''}" ${Events.attr('gastos:setMesFiltro', m)}>
      ${m === 'todos' ? 'Todos' : MC[parseInt(m.split('-')[1]) - 1] + ' ' + m.split('-')[0]}
    </div>`).join('');
  renderGastosVar();
}

function setMesFiltro(m) { mesFilter = m; renderMesFiltros(); }

function renderGastosVar() {
  const el = document.getElementById('gastosVarList');
  let gastos = S.gastosVar || [];
  if (mesFilter !== 'todos') gastos = gastos.filter(g => mesKey(g.fecha) === mesFilter);
  gastos = [...gastos].sort((a, b) => b.fecha.localeCompare(a.fecha));
  // Separar: pagos de fijos van al total de fijos, no al de variables
  const gastosVarPuros = gastos.filter(g => !_esGastoVarNoReal(g));
  const gastosFijosEnHistorial = gastos.filter(g => g.esPagoGastoFijo);
  const gastosTC = gastos.filter(g => g._esCompraTC);
  const gastosPagoTC = gastos.filter(g => g._esPagoTC);
  // Solo sumar al total los gastos que salieron de cuentas reales (no TC, no pagos de fijos)
  const total = gastosVarPuros.filter(g => !g._esCompraTC).reduce((a, g) => a + (g.monto || 0), 0);
  const totalTC = gastosTC.reduce((a, g) => a + (g.monto || 0), 0);
  document.getElementById('totalGVFilt').textContent = fmt(total);
  // Mostrar total TC si hay
  const tcTotalEl = document.getElementById('totalGVFiltTC');
  if (tcTotalEl) {
    if (totalTC > 0) { tcTotalEl.textContent = '+ ' + fmt(totalTC) + ' en TC'; tcTotalEl.style.display = ''; }
    else { tcTotalEl.style.display = 'none'; }
  }
  if (!gastos.length) {
    el.innerHTML = emptyState(
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="1.8" stroke-linecap="round"><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 3 14 9 20 9"/><line x1="8" y1="13" x2="16" y2="13"/></svg>',
      'Sin gastos registrados',
      mesFilter === 'todos' ? 'Aún no has registrado ningún gasto. Añade el primero para ver tu resumen mensual.' : 'No hay gastos en este mes.',
      mesFilter === 'todos' ? 'Registrar primer gasto' : '',
      { action: 'gastos:abrirNuevoGastoVar', args: [] }
    );
    return;
  }

  function itemHtml(g) {
    const esFijo = !!g.esPagoGastoFijo;
    const esTC = !!g._esCompraTC;
    const esPagoTC = !!g._esPagoTC;
    const esSecundario = !!g._secundario;
    const colorMonto = esFijo ? 'var(--text2)' : esTC ? 'var(--red)' : esPagoTC ? 'var(--accent)' : 'var(--red)';
    return `<div class="gasto-item" style="${(esFijo || esPagoTC) ? 'opacity:.75;' : ''}">
      <div class="gasto-item-top">
        <div style="flex:1;min-width:0;">
          <div class="row-name" style="font-size:13px;display:flex;align-items:center;gap:6px;">${escHtml(g.desc)}${esSecundario ? `<span style="display:inline-flex;align-items:center;gap:2px;font-size:9px;color:var(--text3);background:var(--bg2);border-radius:4px;padding:1px 5px;white-space:nowrap;"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>Automático</span>` : ''}</div>
          <div class="row-sub">${g.fecha}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="row-amount" style="color:${colorMonto};">${esPagoTC ? '-' : ''}${fmt(g.monto)}</span>
          ${esSecundario
            ? `<span title="Generado automáticamente — elimínalo desde ${escHtml(g._origenSeccion || 'la sección de origen')}" style="display:flex;align-items:center;justify-content:center;padding:4px;color:var(--text3);opacity:.4;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>`
            : `<button type="button" class="btn-delete-hover" ${Events.attr('gastos:deleteGastoVar', g.id)} title="Eliminar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>`}
        </div>
      </div>
      <div class="gasto-item-meta">
        ${esFijo ? `<span class="badge" style="font-size:9px;background:rgba(200,240,96,.1);color:var(--accent);border:1px solid rgba(200,240,96,.2);">Fijo — ya sumado en Fijos mensuales</span>` :
          esTC ? `<span class="badge bg-red" style="font-size:9px;">TC — deuda</span><span class="badge bg-blue" style="font-size:9px;">${escHtml(g.cat)}</span>` :
          esPagoTC ? `<span class="badge bg-green" style="font-size:9px;">Pago TC</span>` :
          `<span class="badge bg-blue" style="font-size:9px;">${escHtml(g.cat)}</span>`}
        ${g.splits && g.splits.length ? `<span class="badge" style="font-size:9px;">Dividido: ${escHtml(g.splits.map(s => fuenteLabel(s.fuente || '')).join(', '))}</span>` : (g.fuente ? `<span class="badge ${fuenteBadgeClass(g.fuente)}" style="font-size:9px;">${escHtml(fuenteLabel(g.fuente))}</span>` : '')}
        ${(!(esFijo || esTC) && g.nota) ? `<span style="font-size:10px;color:var(--text3);">${escHtml(g.nota)}</span>` : ''}
      </div>
    </div>`;
  }

  let html = '';
  // Primero los gastos variables puros (excluir TC y pagos TC de este bloque)
  const gastosPurosNoTC = gastosVarPuros.filter(g => !g._esCompraTC);
  html += gastosPurosNoTC.map(itemHtml).join('');
  // Compras en TC
  if (gastosTC.length) {
    html += `<div style="margin:14px 0 8px;display:flex;align-items:center;gap:8px;">
      <div style="flex:1;height:1px;background:var(--border);"></div>
      <span style="font-size:10px;color:var(--red);font-family:'DM Mono',monospace;white-space:nowrap;">Compras en TC (${fmt(totalTC)})</span>
      <div style="flex:1;height:1px;background:var(--border);"></div>
    </div>`;
    html += gastosTC.map(itemHtml).join('');
  }
  // Pagos de TC
  if (gastosPagoTC.length) {
    html += `<div style="margin:14px 0 8px;display:flex;align-items:center;gap:8px;">
      <div style="flex:1;height:1px;background:var(--border);"></div>
      <span style="font-size:10px;color:var(--accent);font-family:'DM Mono',monospace;white-space:nowrap;">Pagos de TC</span>
      <div style="flex:1;height:1px;background:var(--border);"></div>
    </div>`;
    html += gastosPagoTC.map(itemHtml).join('');
  }
  // Pagos de fijos
  if (gastosFijosEnHistorial.length) {
    html += `<div style="margin:14px 0 8px;display:flex;align-items:center;gap:8px;">
      <div style="flex:1;height:1px;background:var(--border);"></div>
      <span style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;white-space:nowrap;">Pagos de fijos (no se suman aquí)</span>
      <div style="flex:1;height:1px;background:var(--border);"></div>
    </div>`;
    html += gastosFijosEnHistorial.map(itemHtml).join('');
  }
  el.innerHTML = html;
}

function addGastoVar() {
  const desc = document.getElementById('gv_desc').value.trim();
  const monto = parseMoney(document.getElementById('gv_monto').value) || 0;
  if (!desc) { toast('Ingresa una descripción del gasto', 'err'); return; }
  if (!monto) { toast('Ingresa un monto válido', 'err'); return; }

  let fuente = '';
  let splits = null;
  if (gvSplitMode) {
    splits = getGvSplitData();
    const totalSplit = splits.reduce((a, s) => a + s.monto, 0);
    if (splits.length === 0 || Math.abs(totalSplit - monto) > 1) {
      const prev = document.getElementById('gvSplitPreview');
      if (prev) {
        prev.textContent = totalSplit < monto ? 'Falta asignar ' + fmt(monto - totalSplit) + ' a alguna cuenta' : 'El total dividido supera el monto del gasto';
        prev.style.color = 'var(--red)';
      }
      return;
    }
    for (const s of splits) {
      const saldoDisp = getSaldoFuente(s.fuente);
      if (saldoDisp < s.monto) { toast('Saldo insuficiente en ' + escHtml(fuenteLabel(s.fuente)) + ' — disponible: ' + fmt(saldoDisp), 'err'); return; }
    }
  } else {
    fuente = document.getElementById('gv_fuente').value;
    if (!fuente) { toast('Selecciona de dónde salió la plata', 'err'); return; }
    const saldoDisp = getSaldoFuente(fuente);
    if (fuente.startsWith('tc:')) {
      // Validar cupo solo si la TC tiene cupo configurado
      const tcId = fuente.split(':')[1];
      const tc = (S.tarjetasCredito || []).find(x => x.id === tcId);
      if (tc && tc.cupo && saldoDisp < monto) { toast('Cupo insuficiente en ' + escHtml(fuenteLabel(fuente)) + ' — cupo disponible: ' + fmt(saldoDisp), 'err'); return; }
    } else {
      if (saldoDisp < monto) { toast('Saldo insuficiente en ' + escHtml(fuenteLabel(fuente)) + ' — disponible: ' + fmt(saldoDisp), 'err'); return; }
    }
  }

  const compraId = uid();
  const fechaGasto = document.getElementById('gv_fecha').value || hoy();
  const catGasto = document.getElementById('gv_cat').value;
  const notaGasto = document.getElementById('gv_nota').value.trim();
  if (!S.gastosVar) S.gastosVar = [];
  const esTCFuente = fuente && fuente.startsWith('tc:');
  const gastoObj = { id: compraId, desc, monto, fecha: fechaGasto, cat: catGasto, fuente, splits: splits || undefined, nota: notaGasto };
  // Si la fuente es TC, registrar la compra a través del mismo servicio que
  // usa el módulo de tarjetas (tcCrearCompra) — misma lógica, un solo lugar.
  if (esTCFuente) {
    const tcId = fuente.split(':')[1];
    const tc = (S.tarjetasCredito || []).find(x => x.id === tcId);
    if (tc) {
      const compra = tcCrearCompra(tc, { desc, monto, fecha: fechaGasto, cat: catGasto, nota: notaGasto });
      gastoObj._esCompraTC = true;
      gastoObj._tcId = tcId;
      gastoObj._tcCompraId = compra.id;
      S.gastosVar.push(gastoObj);
      toast('Compra cargada a ' + escHtml(tc.nombre) + ' — deuda: ' + fmt(tc.deuda), 'info', 3500);
    } else {
      S.gastosVar.push(gastoObj);
    }
  } else if (splits) {
    S.gastosVar.push(gastoObj);
    splits.forEach(s => descontarFuente(s.fuente, s.monto));
    toast('Gasto registrado — dividido entre ' + splits.length + ' cuentas', 'ok');
    if (window.logCambio) { const _gvd = document.getElementById('gv_desc'); logCambio('Registraste un gasto', _gvd ? _gvd.value : '', monto, 'gasto'); }
  } else {
    S.gastosVar.push(gastoObj);
    descontarFuente(fuente, monto);
    toast('Gasto registrado', 'ok');
    if (window.logCambio) { const _gvd = document.getElementById('gv_desc'); const _gvm = parseMoney(document.getElementById('gv_monto').value); logCambio('Registraste un gasto', _gvd ? _gvd.value : '', _gvm, 'gasto'); }
  }
  document.getElementById('gv_desc').value = '';
  document.getElementById('gv_monto').value = '';
  document.getElementById('gv_nota').value = '';
  document.getElementById('gv_fecha').value = hoy();
  gvSplitMode = false;
  save(); refresh(); closeSheet('gasto-var');
}

async function deleteGastoVar(id) {
  const g = (S.gastosVar || []).find(x => x.id === id);
  if (g && g._secundario) {
    const seccion = g._origenSeccion || 'la sección de origen';
    await dialogo('Movimiento vinculado', `Este gasto fue generado automáticamente desde ${seccion}. Para eliminarlo, ve a ${seccion} y borra el registro allá — eso revertirá todo correctamente.`, 'Entendido', false);
    return;
  }
  const ok = await dialogo('Eliminar gasto', '¿Seguro que quieres eliminar este gasto? Esta acción no se puede deshacer.', 'Eliminar', true);
  if (!ok) return;
  if (g) {
    if (g._esCompraTC && g._tcId) {
      // Revertir: marcar la compra como eliminada (nunca se borra físicamente) y recalcular
      const tc = (S.tarjetasCredito || []).find(x => x.id === g._tcId);
      if (tc && g._tcCompraId) tcEliminarCompraInterna(tc, g._tcCompraId);
    } else if (g._esPagoTC && g._tcId) {
      // Revertir pago: restaurar la deuda en la TC y devolver plata a la cuenta
      const tc = (S.tarjetasCredito || []).find(x => x.id === g._tcId);
      if (tc && g._tcPagoId) tcEliminarPagoInterna(tc, g._tcPagoId);
      if (g.fuente) sumarFuente(g.fuente, g.monto);
    } else {
      // Gasto normal: devolver el dinero a la cuenta origen (una sola cuenta,
      // o cada una de las cuentas del split si el gasto se dividió — ver
      // addGastoVar)
      if (g.splits && g.splits.length) {
        g.splits.forEach(s => { if (s.fuente) sumarFuente(s.fuente, s.monto || 0); });
      } else if (g.fuente) {
        sumarFuente(g.fuente, g.monto);
      }
    }
    // Bug fix: si era pago de gasto fijo, desmarcar como pagado
    if (g.esPagoGastoFijo && g.gastoFijoId) {
      const mes = mesKey(g.fecha);
      if (S.pagosGastosFijos) delete S.pagosGastosFijos[g.gastoFijoId + '_' + mes];
    }
  }
  S.gastosVar = (S.gastosVar || []).filter(x => x.id !== id);
  save(); refresh();
  toast('Gasto eliminado', 'ok');
  if (window.logCambio && g) logCambio('Eliminaste un gasto', g.desc || '', g.monto, 'eliminar');
}

/* ---- GASTOS FIJOS ---- */

function renderGastosFijos() {
  const el = document.getElementById('gastosFijosList');
  const g = S.gastosFijos || [];
  // Incluir Spotify como gasto fijo virtual si está configurado y no fue pagado este mes
  const spCosto = S.spotifyCosto || 0;
  const spotifyModuloActivo = !!(S.modulos && S.modulos.spotify);
  const yaExisteSpotify = g.some(x => x.nombre && x.nombre.toLowerCase().includes('spotify'));
  const spYaPagadoMes = (S.gastosVar || []).some(gv => mesKey(gv.fecha) === mesActual() && gv.desc && gv.desc.toLowerCase().includes('spotify'));
  // Si el módulo Spotify está activo ya gestiona el costo; no mostrarlo como gasto fijo virtual para evitar doble conteo
  const extras = spCosto > 0 && !yaExisteSpotify && !spYaPagadoMes && !spotifyModuloActivo ? [{ id: '__spotify__', nombre: 'Spotify Premium', monto: spCosto, cat: 'Suscripciones', _virtual: true }] : [];
  const todos = [...extras, ...g];
  // totalGF: solo contar gastos fijos reales que ya fueron PAGADOS este mes (no los virtuales ni los pendientes)
  const mesClaveTot = mesActual();
  const pagosTot = S.pagosGastosFijos || {};
  const totalGFPagado = g.reduce((a, x) => pagosTot[x.id + '_' + mesClaveTot] ? a + (x.monto || 0) : a, 0);
  document.getElementById('totalGF').textContent = fmt(totalGFPagado);
  if (!todos.length) {
    el.innerHTML = emptyState(
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
      'Sin gastos fijos',
      'Agrega tus gastos recurrentes como arriendo, Netflix o servicios para tenerlos siempre visibles.',
      'Agregar gasto fijo',
      { action: 'gastos:abrirNuevoGastoFijo', args: [] }
    );
    return;
  }
  const mesClave = mesActual();
  el.innerHTML = todos.map((x, i) => {
    const pagos = S.pagosGastosFijos || {};
    const infoPago = (!x._virtual && x.id) ? pagos[x.id + '_' + mesClave] : null;
    const pagado = !!infoPago;
    let accionHtml = '';
    if (pagado) {
      accionHtml = `<div style="text-align:right;">
        <span class="badge" style="background:rgba(100,220,100,.15);color:#4caf50;border:1px solid rgba(100,220,100,.3);font-size:9px;padding:3px 7px;">Pagado</span>
        <div style="font-size:10px;color:var(--text3);margin-top:3px;">${infoPago.fecha || ''}</div>
      </div>`;
    } else if (!x._virtual) {
      accionHtml = `<button type="button" ${Events.attr('gastos:abrirPagarGastoFijo', x.id)} style="font-size:11px;padding:5px 10px;background:rgba(200,240,96,.12);border:1px solid rgba(200,240,96,.3);color:var(--accent);border-radius:var(--radius-sm);cursor:pointer;white-space:nowrap;font-family:'DM Sans',sans-serif;font-weight:600;">Pagar</button>`;
    } else {
      accionHtml = `<span style="font-size:10px;color:var(--text3);">Spotify</span>`;
    }
    return `<div class="gasto-item">
      <div class="gasto-item-top">
        <div><div class="row-name" style="font-size:13px;">${escHtml(x.nombre)}</div></div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="row-amount c-red">${fmt(x.monto)}</span>
          ${!x._virtual ? `<button type="button" class="btn-delete-hover" ${Events.attr('gastos:deleteGastoFijo', x.id)} title="Eliminar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>` : ''}
        </div>
      </div>
      <div class="gasto-item-meta" style="display:flex;align-items:center;justify-content:space-between;margin-top:6px;">
        <span class="badge bg-blue" style="font-size:9px;">${escHtml(x.cat)}</span>
        ${accionHtml}
      </div>
    </div>`;
  }).join('');
}

function addGastoFijo() {
  const n = document.getElementById('gf_n').value.trim(), m = parseMoney(document.getElementById('gf_m').value) || 0;
  if (!n) { toast('Ingresa el nombre del gasto fijo', 'err'); return; }
  if (!m) { toast('Ingresa el monto mensual', 'err'); return; }
  S.gastosFijos.push({ id: uid(), nombre: n, monto: m, cat: document.getElementById('gf_c').value });
  document.getElementById('gf_n').value = ''; document.getElementById('gf_m').value = '';
  save(); refresh(); closeSheet('gasto-fijo');
  if (window.logCambio) { const _gfn = document.getElementById('gf_n'); const _gfm = parseMoney(document.getElementById('gf_m').value); logCambio('Agregaste gasto fijo', _gfn ? _gfn.value : '', _gfm, 'gasto_fijo'); }
  toast('Gasto fijo agregado', 'ok');
}

async function deleteGastoFijo(id) {
  const ok = await dialogo('Eliminar gasto fijo', '¿Seguro que quieres eliminar este gasto fijo? Se perderá también su historial de pagos del mes.', 'Eliminar', true);
  if (!ok) return;
  S.gastosFijos = (S.gastosFijos || []).filter(x => x.id !== id);
  // Limpiar pagos registrados de este gasto fijo
  const pagos = S.pagosGastosFijos || {};
  Object.keys(pagos).forEach(k => { if (k.startsWith(id + '_')) delete pagos[k]; });
  save(); refresh();
  toast('Gasto fijo eliminado', 'ok');
}

/* ---- PAGO DE GASTOS FIJOS ---- */

function abrirPagarGastoFijo(id) {
  const gf = (S.gastosFijos || []).find(x => x.id === id);
  if (!gf) return;
  pgfIdActual = id;
  document.getElementById('pgf-title').textContent = 'Pagar: ' + gf.nombre;
  document.getElementById('pgf-monto').textContent = fmt(gf.monto);
  document.getElementById('pgf-cat-badge').textContent = gf.cat;
  document.getElementById('pgf-fecha').value = hoy();
  document.getElementById('pgf-error').style.display = 'none';
  if (document.getElementById('pgf-nota')) document.getElementById('pgf-nota').value = '';
  // Poblar fuentes
  const sel = document.getElementById('pgf-fuente');
  const fuentes = getFuentes();
  sel.innerHTML = '<option value="">Seleccionar cuenta</option>' + fuentes.map(f => `<option value="${f.val}">${escHtml(f.label)}</option>`).join('');
  document.getElementById('pgf-saldo-info').textContent = '';
  openSheet('pagar-gasto-fijo');
}

function pgfActualizarSaldo() {
  const fuente = document.getElementById('pgf-fuente').value;
  const info = document.getElementById('pgf-saldo-info');
  if (!fuente) { info.textContent = ''; return; }
  const gf = (S.gastosFijos || []).find(x => x.id === pgfIdActual);
  const monto = gf ? gf.monto : 0;
  // Pagar con tarjeta de crédito es un CARGO (sube la deuda de la tarjeta), no un
  // retiro de saldo — mismo criterio que addGastoVar() (tcCrearCompra) y
  // confirmarPagarSpotify() (spotify.js). Antes este preview trataba la TC como
  // una cuenta con saldo, mostrando "Saldo disponible" de algo que en realidad es cupo.
  if (fuente.startsWith('tc:')) {
    const tcId = fuente.split(':')[1];
    const tc = (S.tarjetasCredito || []).find(x => x.id === tcId);
    if (tc) {
      const nuevaDeuda = (tc.deuda || 0) + monto;
      const cupoDisp = tc.cupo ? tcCupoDisponible(tc) : null;
      info.innerHTML = 'Deuda: ' + fmt(tc.deuda || 0) + ' <i class="fa-solid fa-arrow-right" style="margin:0 3px;font-size:10px;"></i> ' + fmt(nuevaDeuda);
      info.style.color = (cupoDisp !== null && monto > cupoDisp) ? 'var(--red)' : 'var(--accent)';
    } else {
      info.textContent = '';
    }
    return;
  }
  const saldo = getSaldoActual(fuente);
  const suficiente = saldo >= monto;
  info.textContent = 'Saldo disponible: ' + fmt(saldo);
  info.style.color = suficiente ? 'var(--accent)' : 'var(--red)';
}

function confirmarPagarGastoFijo() {
  const fuente = document.getElementById('pgf-fuente').value;
  const fecha = document.getElementById('pgf-fecha').value || hoy();
  const errEl = document.getElementById('pgf-error');
  errEl.style.display = 'none';
  if (!fuente) { errEl.textContent = 'Selecciona una cuenta para el pago.'; errEl.style.display = 'block'; return; }
  if (!pgfIdActual) return;
  const gf = (S.gastosFijos || []).find(x => x.id === pgfIdActual);
  if (!gf) return;
  // Verificar si ya fue pagado este mes
  if (!S.pagosGastosFijos) S.pagosGastosFijos = {};
  if (S.pagosGastosFijos[gf.id + '_' + mesActual()]) {
    errEl.textContent = 'Este gasto ya fue pagado este mes.'; errEl.style.display = 'block'; return;
  }
  const nota = document.getElementById('pgf-nota') ? document.getElementById('pgf-nota').value.trim() : '';
  if (!S.gastosVar) S.gastosVar = [];
  const gastoObj = { id: uid(), desc: 'Pago de ' + gf.nombre, monto: gf.monto, fecha, cat: gf.cat, fuente, nota: nota || 'Pago de gasto fijo', esPagoGastoFijo: true, gastoFijoId: gf.id };
  if (fuente.startsWith('tc:')) {
    // Cargar el pago a la tarjeta (sube tc.deuda) en vez de descontar saldo de una
    // cuenta — misma ruta que addGastoVar() usa para un gasto variable con TC.
    const tcId = fuente.split(':')[1];
    const tc = (S.tarjetasCredito || []).find(x => x.id === tcId);
    if (!tc) { errEl.textContent = 'Tarjeta no encontrada.'; errEl.style.display = 'block'; return; }
    if (tc.cupo && tcCupoDisponible(tc) < gf.monto) {
      errEl.textContent = 'Cupo insuficiente. Disponible: ' + fmt(tcCupoDisponible(tc)) + ' — Necesario: ' + fmt(gf.monto);
      errEl.style.display = 'block';
      return;
    }
    const compra = tcCrearCompra(tc, { desc: 'Pago de ' + gf.nombre, monto: gf.monto, fecha, cat: gf.cat, nota: nota || 'Pago de gasto fijo' });
    gastoObj._esCompraTC = true;
    gastoObj._tcId = tcId;
    gastoObj._tcCompraId = compra.id;
    S.gastosVar.push(gastoObj);
  } else {
    const saldo = getSaldoActual(fuente);
    if (saldo < gf.monto) {
      errEl.textContent = 'Saldo insuficiente. Disponible: ' + fmt(saldo) + ' — Necesario: ' + fmt(gf.monto);
      errEl.style.display = 'block';
      return;
    }
    descontarFuente(fuente, gf.monto);
    S.gastosVar.push(gastoObj);
  }
  // Registrar pago del mes
  if (!S.pagosGastosFijos) S.pagosGastosFijos = {};
  S.pagosGastosFijos[gf.id + '_' + mesActual()] = { fecha, fuente, monto: gf.monto };
  save(); refresh();
  closeSheet('pagar-gasto-fijo');
  if (window.logCambio) { const _pgfg = (S.gastosFijos || []).find(x => x.id === pgfIdActual); if (_pgfg) logCambio('Pagaste ' + _pgfg.nombre, '', _pgfg.monto, 'gasto_fijo'); }
  toast('Pago registrado correctamente', 'ok');
}

/* ── Wiring de controles propios de la pantalla ──────────────────────────
   Movido desde _initEventListeners() (index.html) el 2026-07-26 — ver
   auditoria-tecnica.md, punto 3. No son onclick inline (no hay problema
   de CSP acá), es solo mover el addEventListener directo a su módulo
   dueño en vez de dejarlo mezclado con el de otros dominios en
   index.html. Todos estos ids ya existen en el DOM estático antes de
   este <script> (verificado contra index.html), así que no hace falta
   esperar a DOMContentLoaded.

   Los botones fantasma (.btn-open-gasto-var/fijo) reimplementaban a
   mano poblarCatSelect+openSheet en vez de llamar a
   abrirNuevoGastoVar()/abrirNuevoGastoFijo() (que ya existen acá arriba
   y ya se usan para el botón del estado vacío) — se dedupe de paso. ── */
const _gBtnGastoVar = document.querySelector('.btn-open-gasto-var');
if (_gBtnGastoVar) _gBtnGastoVar.addEventListener('click', abrirNuevoGastoVar);
const _gBtnGastoFijo = document.querySelector('.btn-open-gasto-fijo');
if (_gBtnGastoFijo) _gBtnGastoFijo.addEventListener('click', abrirNuevoGastoFijo);

const _gBtnGVSave = document.getElementById('btn-guardar-gasto-var');
// OJO: llamar addGastoVar() dentro de una flecha, no pasar la referencia
// directa. index.html sobrescribe el global addGastoVar más abajo
// (_injectErrorSpans(), le agrega validación inline) DESPUÉS de que este
// módulo se carga — si se captura la referencia acá, el botón queda
// pegado a la versión sin validar. Mismo motivo que editarSpotify en
// spotify.js. Ídem addGastoFijo.
if (_gBtnGVSave) _gBtnGVSave.addEventListener('click', () => addGastoVar());
const _gBtnGFSave = document.getElementById('btn-guardar-gasto-fijo');
if (_gBtnGFSave) _gBtnGFSave.addEventListener('click', () => addGastoFijo());
const _gBtnPGFConfirm = document.getElementById('btn-confirmar-pagar-gf');
if (_gBtnPGFConfirm) _gBtnPGFConfirm.addEventListener('click', confirmarPagarGastoFijo);
const _gPgfFuenteSel = document.getElementById('pgf-fuente');
if (_gPgfFuenteSel) _gPgfFuenteSel.addEventListener('change', pgfActualizarSaldo);

// gv_fuente: llama al helper compartido mostrarAlertaFuente() (núcleo,
// también lo usa Cuentas con el prefijo 'mov') — el elemento es propio
// de Gastos, así que el wiring vive acá aunque el helper sea de núcleo.
const _gGvFuente = document.getElementById('gv_fuente');
if (_gGvFuente) _gGvFuente.addEventListener('change', () => mostrarAlertaFuente('gv'));

// ── Split de fuentes — gasto variable (gv), ver crearSplitWidget arriba ──
const _gGvSplitToggle = document.getElementById('gvSplitToggle');
if (_gGvSplitToggle) _gGvSplitToggle.addEventListener('click', toggleGvSplit);
const _gGvBtnAddRow = document.getElementById('btn-add-gv-split-row');
if (_gGvBtnAddRow) _gGvBtnAddRow.addEventListener('click', agregarGvSplitRow);
const _gGvMonto = document.getElementById('gv_monto');
if (_gGvMonto) _gGvMonto.addEventListener('input', actualizarGvSplitPreview);

/* ---- Registro de acciones en el sistema centralizado de eventos ---- */
Events.registerAll('gastos', {
  setMesFiltro,
  deleteGastoVar,
  deleteGastoFijo,
  abrirPagarGastoFijo,
  abrirNuevoGastoVar,
  abrirNuevoGastoFijo,
});
