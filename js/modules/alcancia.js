/* ═══════════════════════════════════════════════════════════════
   js/modules/alcancia.js

   Módulo Alcancía oculta — extraído de index.html (ver
   auditoria-tecnica.md, punto 3 "Arquitectura monolítica").

   Depende de `Events` (js/core/events.js) — debe cargarse en
   index.html DESPUÉS de ese script. No tuvo que partirse en dos
   archivos (a diferencia de Spotify/Encargos): su única integración
   es con las cuentas (`getSaldoFuente`, `sumarFuente`,
   `buildFuentesOptsHtml`), ya definidas más arriba en index.html
   antes de que este script se cargue — mismo caso que Mesada.

   Todas las funciones y el estado (`window.S.alcancia`) siguen
   viviendo tal cual estaban; lo único que cambia es que los onclick
   inline pasan a ser `data-action="alcancia:..."` despachados por
   Events, y el archivo deja de vivir dentro de index.html.
   ═══════════════════════════════════════════════════════════════ */
(function(){
'use strict';

/* ─── OFUSCACIÓN XOR+BASE64 ────────────────────────────────────────────────
   Clave fija. No es cifrado fuerte — solo esconde el número del JSON plano.  */
const _ALC_KEY = 0x4D;
// Ícono (SVG inline) que reemplaza al texto "••••" cuando el monto de un depósito está oculto.
const _ALC_ICONO_OCULTO = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Monto oculto" style="display:block"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
function _alcEncode(saldo){
  const raw = JSON.stringify({s: saldo});
  const bytes = new TextEncoder().encode(raw);
  const xored = bytes.map(b => b ^ _ALC_KEY);
  return btoa(String.fromCharCode(...xored));
}
function _alcDecode(str){
  try {
    const xored = Uint8Array.from(atob(str), c => c.charCodeAt(0));
    const raw = new TextDecoder().decode(xored.map(b => b ^ _ALC_KEY));
    return JSON.parse(raw).s || 0;
  } catch(e){ return 0; }
}

/* ─── ESTADO INTERNO ────────────────────────────────────────────────────── */
function _getA(){ return window.S.alcancia || null; }
function _initA(){
  if(!window.S.alcancia){
    window.S.alcancia = {
      saldoRegistrado: 0,
      depositos: 0,
      fechaInicio: (typeof hoy==='function'?hoy():new Date().toISOString().slice(0,10)),
      movimientos: [],
      historial: []
    };
  }
}
function _saldoRegistrado(){
  const a = _getA(); if(!a) return 0;
  return a.saldoRegistrado || 0;
}
function _setSaldoOfuscado(saldo){
  window.S.alcanciaSaldoOfuscado = _alcEncode(saldo);
}
function _getSaldoOfuscado(){
  const str = window.S.alcanciaSaldoOfuscado;
  if(!str) return _saldoRegistrado();
  return _alcDecode(str);
}

/* ─── TIEMPO ────────────────────────────────────────────────────────────── */
function _diasDesde(fechaStr){
  if(!fechaStr) return 0;
  const inicio = new Date(fechaStr + 'T12:00:00');
  const ahora  = new Date();
  return Math.max(0, Math.round((ahora - inicio) / 86400000));
}
function _fmtTiempo(dias){
  if(dias === 0) return 'Hoy';
  if(dias < 7) return dias + (dias===1?' día':' días');
  if(dias < 30){ const s=Math.round(dias/7); return s+(s===1?' semana':' semanas'); }
  const m=Math.round(dias/30); return m+(m===1?' mes':' meses');
}

/* ─── DESGLOSE DE ORIGEN ─────────────────────────────────────────────────── */
/**
 * Genera el HTML del desglose de origen de los depósitos de una alcancía.
 * @param {Array} movimientos  - Array de movimientos de la alcancía
 * @param {Function} fmtFn     - Función de formateo de moneda
 * @returns {string} HTML del desglose (vacío si no hay movimientos)
 */
function _alcDesgloseHtml(movimientos, fmtFn){
  if(!movimientos || !movimientos.length) return '';
  const f = typeof fmtFn === 'function' ? fmtFn : v => '$' + Math.round(v).toLocaleString('es-CO');

  // Acumular por categoría
  let yo      = 0; // yo-directo + yo-cuenta + tu parte del split + cobro-deuda (es plata tuya)
  let mandado = 0; // tipo === 'mandado'
  let mama    = 0; // regalo de mamá (tipo === 'regalo') + parte de mamá en splits

  movimientos.forEach(m => {
    const tipo = m.tipo || '';
    const monto = m.monto || 0;
    if(tipo === 'yo-directo' || tipo === 'yo-cuenta' || tipo === 'cobro-deuda'){
      yo += monto;
    } else if(tipo === 'mandado'){
      mandado += monto;
    } else if(tipo === 'regalo'){
      mama += monto;
    } else if(tipo === 'split'){
      const splitYo   = m._splitYo   || 0;
      const splitMama = m._splitMama || 0;
      yo   += splitYo;
      mama += splitMama;
    } else if(tipo === 'multi'){
      (m.partes || []).forEach(pt => {
        if(pt.origen === 'regalo') mama += pt.monto || 0;
        else if(pt.origen === 'mandado') mandado += pt.monto || 0;
        else yo += pt.monto || 0; // cuenta / propio
      });
    }
  });

  // Construir filas sólo con montos > 0
  const iconYo      = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v2m0 8v2M9.5 9.5a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 3.5m0 1h.01"/></svg>';
  const iconMandado = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/><path d="M10 18H6.5M14 18h3.5M4 10h12l2 5H2l2-5z"/><path d="M10 10V7l4-2"/></svg>';
  const iconMama    = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12v10H4V12"/><path d="M22 7H2v5h20V7z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>';

  const filas = [];
  if(yo > 0)      filas.push({ icon: iconYo,      label: 'Ahorrado con mi propio dinero',      monto: yo      });
  if(mandado > 0) filas.push({ icon: iconMandado,  label: 'Mamá me pagó por hacer un mandado', monto: mandado });
  if(mama > 0)    filas.push({ icon: iconMama,     label: 'Me regaló mamá',                    monto: mama    });

  if(!filas.length) return '';

  const filasHtml = filas.map(row => `
    <div class="row" style="margin-bottom:5px;align-items:center;gap:6px;">
      <span style="flex-shrink:0;display:inline-flex;align-items:center;">${row.icon}</span>
      <span style="font-size:11px;color:var(--text3);flex:1;min-width:0;">${row.label}</span>
      <span style="font-size:12px;font-family:'DM Mono',monospace;color:var(--amber);flex-shrink:0;">${f(row.monto)}</span>
    </div>`).join('');

  return `
  <div class="card card-sm" style="margin-top:10px;padding:12px 14px;background:rgba(240,184,64,.04);border-color:rgba(240,184,64,.15);">
    <div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px;display:flex;align-items:center;gap:5px;"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> Origen del dinero acumulado</div>
    ${filasHtml}
  </div>`;
}

/* ─── ORÍGENES DEL DEPÓSITO ──────────────────────────────────────────────
   Antes había un selector de "tipo" (yo-directo / yo-cuenta / regalo / mandado /
   split / cobro-deuda). Ahora cada depósito se arma con UNO o VARIOS orígenes:
   una cuenta real (resta saldo), o uno de tres orígenes "sin cuenta" (plata que
   nunca estuvo en ninguna cuenta → ingreso registrado, sin tocar saldos), o el
   cobro de una deuda (solo en modo de un único origen). "Dividir ÷" reparte el
   monto entre varios orígenes con el motor genérico js/core/split.js.
   Con UN solo origen el registro guardado es idéntico al de siempre (tipo
   yo-cuenta / yo-directo / regalo / mandado / cobro-deuda); con varios se guarda
   tipo 'multi' con `partes[]`. Los depósitos 'split' viejos se siguen leyendo.  */
const _ALC_VALOR_DEUDA = '@deuda';
const _ALC_ORIGENES_SIN_CUENTA = {
  '@propio':  { origen: 'propio',  tipo: 'yo-directo', label: 'Plata mía (no estaba en ninguna cuenta)', corto: 'Propio',        desc: 'Depósito en alcancía', nota: 'Ingreso registrado al guardar en alcancía (dinero directo)' },
  '@regalo':  { origen: 'regalo',  tipo: 'regalo',     label: 'Regalo de mamá',                          corto: 'Regalo mamá',   desc: 'Regalo de mamá',       nota: 'Ingreso: regalo de mamá guardado en alcancía' },
  '@mandado': { origen: 'mandado', tipo: 'mandado',    label: 'Pago de mamá por un mandado',             corto: 'Mandado mamá',  desc: 'Mandado de mamá',      nota: 'Ingreso: pago de mandado guardado en alcancía' }
};
const _ALC_INFO_ORIGEN = {};
Object.keys(_ALC_ORIGENES_SIN_CUENTA).forEach(k => { _ALC_INFO_ORIGEN[_ALC_ORIGENES_SIN_CUENTA[k].origen] = _ALC_ORIGENES_SIN_CUENTA[k]; });

let _alcSplitMode = false; // true = "Dividir ÷" activo (varios orígenes)

function _alcNombreFuente(f){
  if(!f) return '';
  if(typeof fuenteLabel === 'function'){ try { const l = fuenteLabel(f); if(l) return l; } catch(e){} }
  if(f === 'nequi') return 'Nequi';
  if(f === 'efectivo') return 'Efectivo';
  if(f.startsWith('cajita:')){ const c=(window.S&&window.S.cajitas||[]).find(x=>x.id===f.split(':')[1]); return c?c.nombre:'Cajita'; }
  if(f.startsWith('custom:')){ const c=(window.S&&window.S.cuentasPersonalizadas||[]).find(x=>x.id===f.split(':')[1]); return c?c.nombre:'Cuenta'; }
  return f;
}

// <option>s del selector de origen: cuentas con saldo + orígenes sin cuenta (+ deuda si aplica).
// `conDeuda` solo en modo de un único origen (un cobro de deuda necesita elegir persona/préstamo).
function _alcOrigenOptsHtml(selected, conDeuda){
  const tmp = document.createElement('select');
  tmp.innerHTML = (typeof buildFuentesOptsHtml === 'function')
    ? buildFuentesOptsHtml({incluirTC:false, placeholder:'Elegí de dónde viene'})
    : '<option value="">Elegí de dónde viene</option>';
  _alcFiltrarFuentesPorSaldo(tmp);
  const ph = tmp.querySelector('option[value=""]');
  if(ph) ph.textContent = 'Elegí de dónde viene'; // _alcFiltrarFuentesPorSaldo pone un texto de "sin cuentas" que aquí no aplica
  let extra = '<optgroup label="Sin cuenta">'
    + Object.keys(_ALC_ORIGENES_SIN_CUENTA).map(v => `<option value="${v}">${_ALC_ORIGENES_SIN_CUENTA[v].label}</option>`).join('')
    + '</optgroup>';
  if(conDeuda && (window.S && window.S.deudores || []).some(d => typeof getDeudorSaldo === 'function' && getDeudorSaldo(d) > 0.5)){
    extra += `<optgroup label="Deudas"><option value="${_ALC_VALOR_DEUDA}">Me pagaron una deuda</option></optgroup>`;
  }
  return tmp.innerHTML + extra;
}

// valor de un <select> de origen → parte { origen, monto, [fuente] }
function _alcParteDesdeValor(v, monto){
  if(v === _ALC_VALOR_DEUDA) return { origen: 'deuda', monto };
  const info = _ALC_ORIGENES_SIN_CUENTA[v];
  if(info) return { origen: info.origen, monto };
  return { origen: 'cuenta', fuente: v, monto };
}

// Muestra/oculta lo que depende del origen elegido (persona del cobro, saldo disponible, monto editable).
function _alcOrigenActualizar(){
  const sel = document.getElementById('alc_dep_origen');
  const v = sel ? sel.value : '';
  const esDeuda = !_alcSplitMode && v === _ALC_VALOR_DEUDA;
  const deudorWrap = document.getElementById('alc_dep_deudor_wrap');
  if(deudorWrap) deudorWrap.style.display = esDeuda ? '' : 'none';
  if(esDeuda) _alcDeudorSelActualizar();
  const hint = document.getElementById('alc_dep_saldo_hint');
  if(hint){
    if(!_alcSplitMode && v && v.charAt(0) !== '@'){
      const s = (typeof getSaldoFuente === 'function') ? getSaldoFuente(v) : 0;
      hint.textContent = 'Saldo disponible: ' + (typeof fmt === 'function' ? fmt(s) : s);
      hint.style.color = s > 0 ? 'var(--accent)' : 'var(--red)';
    } else {
      hint.textContent = '';
    }
  }
  // En modo dividido el total es la suma de las filas: no se edita a mano.
  const montoInput = document.getElementById('alc_dep_monto');
  if(montoInput){
    montoInput.readOnly = _alcSplitMode;
    montoInput.style.opacity = _alcSplitMode ? '0.6' : '';
  }
}

// onPreview del motor split: recalcula el total a partir de las filas.
function _alcSplitPreview(){
  _alcOrigenActualizar();
  if(!_alcSplitMode) return;
  const filas = (typeof splitGetData === 'function') ? splitGetData('alcancia') : [];
  const total = Math.round(filas.reduce((t, f) => t + f.monto, 0) * 100) / 100;
  const hint = document.getElementById('alc_split_total_hint');
  if(hint){
    hint.textContent = total > 0 ? 'Total: ' + (typeof fmt === 'function' ? fmt(total) : total) : '';
    hint.style.color = 'var(--amber)';
  }
  const montoInput = document.getElementById('alc_dep_monto');
  if(montoInput){
    montoInput.value = total > 0 ? total.toFixed(2).replace('.', ',') : '';
    montoInput.dispatchEvent(new Event('input'));
  }
}

window.alcanciaToggleDividir = function(){ if(typeof splitToggle === 'function') splitToggle('alcancia'); };
window.alcanciaAgregarOrigen = function(){ if(typeof splitAgregarRow === 'function') splitAgregarRow('alcancia'); };

/* ─── COBRO DE DEUDA: selector de deudor/grupo dentro de Depositar ───────
   Espejo simplificado de _initMovGrupoSelector (prestado.js): si la
   persona elegida tiene ≥2 préstamos abiertos hay que preguntar a cuál
   corresponde el cobro (nunca se adivina); con 0 o 1 se resuelve solo.
   No hay opción de "préstamo aparte" acá — un cobro nunca abre un grupo
   nuevo, solo puede reducir uno existente. */
function _alcDeudorSelActualizar(){
  const sel = document.getElementById('alc_dep_deudor');
  const grupoWrap = document.getElementById('alc_dep_deudor_grupo_wrap');
  const grupoSel = document.getElementById('alc_dep_deudor_grupo');
  const hint = document.getElementById('alc_dep_deudor_saldo_hint');
  const deudorId = sel ? sel.value : '';
  if(!deudorId){
    if(grupoWrap) grupoWrap.style.display = 'none';
    if(hint) hint.textContent = '';
    return;
  }
  const d = (window.S && window.S.deudores || []).find(x => x.id === deudorId);
  if(!d) return;
  // Migrar antes de leer d.grupos — un deudor viejo sin d.grupos parece tener
  // "0 grupos abiertos" aunque tenga deuda real, y eso hace que el auto-resolver
  // le cree un grupo nuevo en blanco en vez de reutilizar la deuda existente.
  if(typeof _migrarGruposDeudor === 'function') _migrarGruposDeudor(d);
  const abiertos = (typeof _gruposAbiertos === 'function') ? _gruposAbiertos(d) : [];
  if(abiertos.length >= 2){
    if(grupoWrap) grupoWrap.style.display = '';
    if(grupoSel){
      grupoSel.innerHTML = abiertos.map(g => `<option value="${g.id}">${escHtml(g.nombre)} (${fmt(getGrupoSaldo(d, g.id))})</option>`).join('');
      grupoSel.onchange = _alcDeudorSaldoHintActualizar;
    }
  } else if(grupoWrap){
    grupoWrap.style.display = 'none';
  }
  _alcDeudorSaldoHintActualizar();
}

function _alcDeudorSaldoHintActualizar(){
  const sel = document.getElementById('alc_dep_deudor');
  const grupoWrap = document.getElementById('alc_dep_deudor_grupo_wrap');
  const grupoSel = document.getElementById('alc_dep_deudor_grupo');
  const hint = document.getElementById('alc_dep_deudor_saldo_hint');
  const deudorId = sel ? sel.value : '';
  if(!deudorId) return;
  const d = (window.S && window.S.deudores || []).find(x => x.id === deudorId);
  if(!d) return;
  const grupoVisible = grupoWrap && grupoWrap.style.display !== 'none';
  const saldo = (grupoVisible && grupoSel && grupoSel.value) ? getGrupoSaldo(d, grupoSel.value) : getDeudorSaldo(d);
  // El hint quedaría repitiendo un monto que ya se ve en la opción elegida
  // (el select de persona siempre trae el saldo total en el texto, y el de
  // préstamo/grupo trae el saldo de ese grupo) — se deja oculto. `saldo` se
  // sigue calculando porque se usa para precargar el monto más abajo.
  // Ver reglas-visuales.md#selectores-con-saldo.
  if(hint) hint.style.display = 'none';
  // Precarga el monto con el saldo pendiente (editable — puede ser un abono parcial)
  const montoInput = document.getElementById('alc_dep_monto');
  if(montoInput && saldo > 0){
    montoInput.value = saldo.toFixed(2).replace('.', ',');
    montoInput.dispatchEvent(new Event('input'));
  }
}

/* ─── INYECTAR SHEETS ───────────────────────────────────────────────────── */
function _inyectarAlcanciaSheets(){
  if(document.getElementById('sheet-alcancia-depositar')) return;

  /* ---------- SHEET: Depositar ---------- */
  const sheetDep = document.createElement('div');
  sheetDep.className = 'overlay';
  sheetDep.id = 'sheet-alcancia-depositar';
  sheetDep.setAttribute('data-sheet-id','alcancia-depositar');
  sheetDep.innerHTML = `
    <div class="sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-title">Guardar en la alcancía</div>
      <div class="ig">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px;">
          <label class="il" for="alc_dep_origen" style="margin:0;">¿De dónde viene este dinero?</label>
          <button type="button" id="alc_split_toggle" ${Events.attr('alcancia:toggleDividir')} style="padding:5px 10px;font-size:11px;font-weight:600;border-radius:7px;cursor:pointer;background:rgba(200,240,96,.1);border:1px solid rgba(200,240,96,.3);color:var(--accent);font-family:'DM Sans',sans-serif;">Dividir ÷</button>
        </div>
        <div id="alc_origen_simple">
          <div class="select-wrap">
            <select id="alc_dep_origen"></select>
          </div>
          <div id="alc_dep_saldo_hint" style="font-size:11px;color:var(--text3);margin-top:4px;"></div>
        </div>
        <div id="alc_origen_split" style="display:none;">
          <div id="alc_split_rows"></div>
          <button type="button" ${Events.attr('alcancia:agregarOrigen')} style="width:100%;padding:8px;font-size:12px;font-weight:600;border-radius:7px;cursor:pointer;background:transparent;border:1px dashed var(--border2);color:var(--text2);font-family:'DM Sans',sans-serif;">+ Agregar otro origen</button>
          <div id="alc_split_total_hint" style="font-size:12px;color:var(--text3);margin-top:6px;font-family:'DM Mono',monospace;"></div>
        </div>
      </div>
      <div class="ig" id="alc_dep_deudor_wrap" style="display:none;">
        <label class="il" for="alc_dep_deudor">¿Quién te pagó?</label>
        <div class="select-wrap">
          <select id="alc_dep_deudor"><option value="">Seleccionar persona</option></select>
        </div>
        <div class="ig" id="alc_dep_deudor_grupo_wrap" style="display:none;margin-top:8px;">
          <label class="il" for="alc_dep_deudor_grupo">¿De cuál préstamo?</label>
          <div class="select-wrap"><select id="alc_dep_deudor_grupo"></select></div>
        </div>
        <div id="alc_dep_deudor_saldo_hint" style="font-size:11px;color:var(--text3);margin-top:4px;"></div>
      </div>
      <div class="ig">
        <label class="il" for="alc_dep_monto">Monto total</label>
        <input type="text" inputmode="decimal" class="money-input" id="alc_dep_monto" placeholder="0,00" autocomplete="off">
      </div>
      <div class="ig">
        <label class="il" for="alc_dep_fecha">Fecha</label>
        <input type="date" id="alc_dep_fecha" class="input-fecha">
      </div>
      <div class="ig">
        <label class="il" for="alc_dep_desc">Descripción <span style="font-size:10px;color:var(--text3);font-weight:400;">(opcional)</span></label>
        <input type="text" id="alc_dep_desc" placeholder="Ej: ahorro semanal, regalo, vuelto...">
      </div>
      <button type="button" class="btn btn-primary" ${Events.attr('alcancia:confirmarDeposito')} style="background:var(--amber);color:#0a0a0a;border:none;box-shadow:0 2px 14px rgba(240,184,64,.25);">Guardar</button>
      <button type="button" class="btn btn-ghost" data-close-sheet="alcancia-depositar" style="margin-top:6px;">Cancelar</button>
    </div>`;
  document.body.appendChild(sheetDep);

  /* ---------- SHEET: Destapar paso 1 — resumen ---------- */
  const sheetD1 = document.createElement('div');
  sheetD1.className = 'overlay';
  sheetD1.id = 'sheet-alcancia-destapar';
  sheetD1.setAttribute('data-sheet-id','alcancia-destapar');
  sheetD1.innerHTML = `
    <div class="sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-title">Destapar alcancía</div>
      <div id="alc-destapar-resumen" style="margin-bottom:18px;"></div>
      <div class="ig">
        <label class="il" for="alc_real_monto">¿Cuánto dinero encontraste realmente?</label>
        <input type="text" inputmode="decimal" class="money-input" id="alc_real_monto" placeholder="0,00" autocomplete="off">
        <div id="alc_diferencia_hint" style="font-size:12px;margin-top:6px;font-family:'DM Mono',monospace;"></div>
      </div>
      <div class="ig">
        <label class="il" for="alc_destino">¿Dónde vas a guardar este dinero?</label>
        <div class="select-wrap">
          <select id="alc_destino"></select>
        </div>
      </div>
      <button type="button" class="btn btn-primary" ${Events.attr('alcancia:confirmarDestapar')} style="background:var(--amber);color:#0a0a0a;border:none;box-shadow:0 2px 14px rgba(240,184,64,.25);">Confirmar y destapar</button>
      <button type="button" class="btn btn-ghost" data-close-sheet="alcancia-destapar" style="margin-top:6px;">Cancelar</button>
    </div>`;
  document.body.appendChild(sheetD1);

  /* ---------- SHEET: Destapar resultado ---------- */
  const sheetRes = document.createElement('div');
  sheetRes.className = 'overlay';
  sheetRes.id = 'sheet-alcancia-resultado';
  sheetRes.setAttribute('data-sheet-id','alcancia-resultado');
  sheetRes.innerHTML = `
    <div class="sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-title">Resultado</div>
      <div id="alc-resultado-body" style="margin-bottom:18px;"></div>
      <button type="button" class="btn btn-primary" ${Events.attr('alcancia:iniciarNueva')} style="background:var(--amber);color:#0a0a0a;border:none;margin-bottom:8px;">Iniciar nueva alcancía</button>
      <button type="button" class="btn btn-ghost" data-close-sheet="alcancia-resultado">Cerrar</button>
    </div>`;
  document.body.appendChild(sheetRes);

  /* ---------- Swipe y data-close-sheet para los nuevos sheets ---------- */
  [sheetDep, sheetD1, sheetRes].forEach(sh => {
    const panel = sh.querySelector('.sheet');
    if(panel && typeof makeSwipeable === 'function'){
      const sid = sh.getAttribute('data-sheet-id');
      makeSwipeable(panel, ()=>{ if(typeof closeSheet==='function') closeSwipeSheet(sid, sh); });
    }
    sh.querySelectorAll('[data-close-sheet]').forEach(btn => {
      const sid = btn.getAttribute('data-close-sheet');
      btn.addEventListener('click', ()=>{ if(typeof closeSheet==='function') closeSheet(sid); });
    });
    sh.addEventListener('click', e => {
      if(e.target === sh){
        const sid = sh.getAttribute('data-sheet-id');
        if(typeof closeSheet==='function') closeSheet(sid);
      }
    });
  });

  /* ---------- Money inputs ---------- */
  _alcInitMoneyInput('alc_dep_monto');
  _alcInitMoneyInput('alc_real_monto');
  /* ---------- Motor de "Dividir ÷" (js/core/split.js) ---------- */
  if(typeof crearSplitWidget === 'function'){
    crearSplitWidget('alcancia', {
      simpleId: 'alc_origen_simple', splitId: 'alc_origen_split', toggleId: 'alc_split_toggle', rowsId: 'alc_split_rows',
      getModo: () => _alcSplitMode,
      setModo: v => { _alcSplitMode = !!v; },
      getFuentesFn: sel => _alcOrigenOptsHtml(sel, false),   // en filas no hay "cobro de deuda"
      onPreview: _alcSplitPreview
    });
  }

  /* ---------- Selector de origen (modo un solo origen) ---------- */
  const origenSel = document.getElementById('alc_dep_origen');
  if(origenSel) origenSel.addEventListener('change', _alcOrigenActualizar);

  /* ---------- Cobro de deuda: selector de deudor ---------- */
  const deudorSel = document.getElementById('alc_dep_deudor');
  if(deudorSel){
    deudorSel.addEventListener('change', _alcDeudorSelActualizar);
  }

  /* ---------- Diferencia hint en destapar ---------- */
  const realInput = document.getElementById('alc_real_monto');
  if(realInput){
    realInput.addEventListener('input', _actualizarDiferenciaHint);
  }
}

function closeSwipeSheet(sid, el){
  if(typeof closeSheet==='function') closeSheet(sid);
}

// RENOMBRADA (2026-09-10, ver CHANGELOG.md#infraestructura--seguridad):
// se llamaba `_initMoneyInput`, mismo nombre EXACTO que la función global
// de js/core/money-input.js — pero con firma incompatible (esta toma un
// `id` de string, la de money-input.js toma el elemento DOM directo).
// Al ser ambos <script> clásicos en el mismo scope global, cuando este
// archivo cargaba (lazy, al entrar a Alcancía) su `function
// _initMoneyInput` PISABA la definición real de money-input.js — y el
// focusin global de money-input.js (usado por TODOS los inputs de plata
// de la app, no solo los de Alcancía) empezaba a llamar a ESTA función en
// su lugar, con un elemento DOM donde se esperaba un id de string. El
// resultado: `document.getElementById(elementoDOM)` no encuentra nada,
// esta función no hace nada, y el buffer de dígitos de money-input.js
// nunca se inicializa — cualquier input de plata con un valor ya cargado
// (ej. editar un gasto existente) mostraba "0,00" al primer click en vez
// de conservar el valor. Bug real, no cosmético, y silencioso: no tira
// ningún error, solo deja de funcionar. Ver también moneyInputAttach()
// más abajo — nunca estuvo definida en ningún archivo del proyecto, así
// que esta función SIEMPRE tomó la rama de fallback (que no usa el
// mismo buffer/formateo de money-input.js) — hallazgo aparte, no
// corregido acá porque cambiaría el comportamiento visible de los
// inputs de Alcancía y no es lo mismo que la colisión de nombres.
function _alcInitMoneyInput(id){
  const el = document.getElementById(id);
  if(!el || el._alcInited) return;
  el._alcInited = true;
  if(typeof moneyInputAttach === 'function'){
    moneyInputAttach(el);
  } else {
    // Fallback: parseMoney/fmt nativo
    el.addEventListener('input', function(){
      const raw = this.value.replace(/[^\d,]/g,'').replace(',','.');
      const n = parseFloat(raw) || 0;
      el._rawVal = n;
    });
  }
}

function _getMoneyVal(id){
  const el = document.getElementById(id);
  if(!el) return 0;
  if(typeof parseMoney === 'function') return parseMoney(el.value) || 0;
  return parseFloat((el.value||'').replace(/\./g,'').replace(',','.')) || 0;
}

/* ─── FILTRAR SELECTOR DE FUENTE POR SALDO ─────────────────────────────────
   Solo aplica a selectores de ORIGEN de plata (de dónde sale el dinero que
   entra a la alcancía) — nunca al selector de destino del destape, donde la
   plata entra a la cuenta y no hace falta saldo previo. Umbral fijo: se
   considera "sin plata utilizable" una cuenta con saldo <= 50 pesos.        */
const _ALC_SALDO_MIN_FUENTE = 50;
function _alcFiltrarFuentesPorSaldo(selectEl){
  if(!selectEl || typeof getSaldoFuente !== 'function') return;
  let quedanCuentas = false;
  Array.from(selectEl.querySelectorAll('option')).forEach(opt => {
    if(!opt.value) return; // placeholder ("Seleccionar cuenta"), nunca se filtra
    const saldo = getSaldoFuente(opt.value) || 0;
    if(saldo <= _ALC_SALDO_MIN_FUENTE){
      opt.remove();
    } else {
      quedanCuentas = true;
    }
  });
  if(!quedanCuentas){
    const ph = selectEl.querySelector('option[value=""]');
    if(ph) ph.textContent = 'No tenés cuentas con saldo disponible';
  }
}

/* ─── "WRAPPED" DE ALCANCÍA: progreso de ahorro entre ciclos ──────────────
   Todo se calcula en vivo desde S.alcancia.historial — no se guarda ningún
   número nuevo aparte (mismo principio que el resto de la app: los
   movimientos/registros ya guardados son la única fuente de verdad, nunca
   un valor cacheado que pueda desincronizarse). Estas funciones son la
   ÚNICA fuente de esta cifra: tanto la tarjeta persistente en la pantalla
   principal como la sheet de resultado al destapar llaman a las mismas. */

/* Racha: cuántos ciclos consecututivos, contando desde el más reciente hacia
   atrás, ahorraron más que el ciclo inmediatamente anterior. 0 si el último
   ciclo ahorró igual o menos que el anterior. */
function _alcRachaAhorro(hist){
  if(!hist || hist.length < 2) return 0;
  let racha = 0;
  for(let i = hist.length - 1; i > 0; i--){
    if((hist[i].saldoRegistrado||0) > (hist[i-1].saldoRegistrado||0)) racha++;
    else break;
  }
  return racha;
}

/* Mejor ciclo histórico por saldoRegistrado (nunca por saldoReal, para no
   premiar diferencias que en realidad fueron un error de conteo). */
function _alcMejorCiclo(hist){
  if(!hist || !hist.length) return null;
  return hist.reduce((mejor, h) => (h.saldoRegistrado||0) > (mejor.saldoRegistrado||0) ? h : mejor, hist[0]);
}

// Expuestas en window (2026-09-07): el módulo Wrapped general (js/modules/
// wrapped.js) las reutiliza para no duplicar el cálculo de racha/mejor
// ciclo — misma fuente de verdad que la tarjeta de Alcancía. Con guard
// typeof en quien las llama, por si Alcancía todavía no cargó (es un grupo
// lazy independiente).
window._alcRachaAhorro = _alcRachaAhorro;
window._alcMejorCiclo = _alcMejorCiclo;

/* Mini gráfico de barras (SVG inline, sin dependencias) de los últimos hasta
   6 ciclos por saldoRegistrado. Devuelve '' si hay menos de 2 ciclos —no
   tiene sentido "comparar" con un solo punto. */
function _alcWrappedBarrasSvg(hist){
  if(!hist || hist.length < 2) return '';
  const datos = hist.slice(-6);
  const max = Math.max(...datos.map(h => h.saldoRegistrado||0), 1);
  const w = 280, h = 70, gap = 8;
  const barW = (w - gap*(datos.length-1)) / datos.length;
  const bars = datos.map((d,i) => {
    const val = d.saldoRegistrado || 0;
    const barH = Math.max(4, (val/max) * (h-10));
    const x = i * (barW + gap);
    const y = h - barH;
    const esUltimo = i === datos.length - 1;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="3" fill="${esUltimo?'var(--amber)':'var(--accent)'}" opacity="${esUltimo?'1':'0.5'}"/>`;
  }).join('');
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" style="display:block;overflow:visible;">${bars}</svg>`;
}

/* Arma el HTML de la tarjeta persistente de progreso (pantalla principal de
   Alcancía). '' si no hay al menos 2 ciclos destapados para comparar. */
function _alcWrappedProgresoHtml(hist, fmtFn){
  if(!hist || hist.length < 2) return '';
  const fmt2 = fmtFn || (typeof fmt==='function' ? fmt : v=>'$'+Math.round(v).toLocaleString('es-CO'));
  const racha = _alcRachaAhorro(hist);
  const mejor = _alcMejorCiclo(hist);
  const ultimo = hist[hist.length-1];
  const esMejorHastaAhora = mejor === ultimo;
  const rachaMsg = racha >= 2
    ? `🔥 Llevas ${racha} alcancías seguidas ahorrando más que la anterior`
    : (racha === 1 ? '📈 Ahorraste más que en tu alcancía anterior' : null);
  return `
    <div class="card" style="padding:14px 16px;background:rgba(240,184,64,.05);border-color:rgba(240,184,64,.2);">
      <div style="font-size:11px;color:var(--text3);margin-bottom:10px;font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:.6px;">Tu progreso ahorrando</div>
      ${_alcWrappedBarrasSvg(hist)}
      <div style="margin-top:10px;">
        ${rachaMsg ? `<div style="font-size:12px;color:var(--amber);margin-bottom:6px;">${rachaMsg}</div>` : ''}
        <div style="font-size:12px;color:var(--text3);">Mejor alcancía hasta ahora: <span style="color:var(--text2);font-family:'DM Mono',monospace;">${fmt2(mejor.saldoRegistrado||0)}</span>${esMejorHastaAhora ? ' <span style="color:var(--amber);">← tu última</span>' : ''}</div>
      </div>
    </div>`;
}

function _actualizarDiferenciaHint(){
  const hint = document.getElementById('alc_diferencia_hint');
  if(!hint) return;
  const real = _getMoneyVal('alc_real_monto');
  const reg  = _saldoRegistrado();
  if(!real){ hint.textContent = ''; return; }
  const dif = real - reg;
  if(Math.abs(dif) < 1){
    hint.style.color = 'var(--text3)';
    hint.textContent = 'Todo el dinero estaba registrado.';
  } else if(dif > 0){
    hint.style.color = 'var(--accent)';
    hint.textContent = '+ ' + (typeof fmt==='function'?fmt(dif):dif) + ' encontrados sin registro → se suman al patrimonio.';
  } else {
    hint.style.color = 'var(--red)';
    hint.textContent = '− ' + (typeof fmt==='function'?fmt(Math.abs(dif)):Math.abs(dif)) + ' de diferencia → se restan del patrimonio.';
  }
}

/* ─── OPEN SHEET HOOK ─── ver js/core/hook-global.js ───────────────────── */
hookGlobal('openSheet', function(id){
  if(id === 'alcancia-depositar'){
    _inyectarAlcanciaSheets();
    setTimeout(()=>{
      const fd = document.getElementById('alc_dep_fecha');
      if(fd) fd.value = (typeof hoy==='function'?hoy():new Date().toISOString().slice(0,10));
      const mi = document.getElementById('alc_dep_monto');
      if(mi){ mi.value = '0,00'; if(typeof moneyInputAttach==='function') moneyInputAttach(mi); }
      const desc = document.getElementById('alc_dep_desc');
      if(desc) desc.value = '';
      // Reset de orígenes: salir del modo dividido, vaciar filas y repoblar el selector
      if(_alcSplitMode && typeof splitToggle === 'function') splitToggle('alcancia');
      const splitRows = document.getElementById('alc_split_rows');
      if(splitRows) splitRows.innerHTML = '';
      const splitHint = document.getElementById('alc_split_total_hint');
      if(splitHint) splitHint.textContent = '';
      const origenSel = document.getElementById('alc_dep_origen');
      if(origenSel){ origenSel.innerHTML = _alcOrigenOptsHtml('', true); origenSel.value = ''; }
      // Cobro de deuda: poblar personas con saldo pendiente y resetear el wrap
      const deudorSelReset = document.getElementById('alc_dep_deudor');
      if(deudorSelReset){
        const deudoresConSaldo = (window.S && window.S.deudores || [])
          .filter(d => typeof getDeudorSaldo === 'function' && getDeudorSaldo(d) > 0.5);
        deudorSelReset.innerHTML = '<option value="">Seleccionar persona</option>'
          + deudoresConSaldo.map(d => `<option value="${d.id}">${escHtml(d.nombre)} (${fmt(getDeudorSaldo(d))})</option>`).join('');
      }
      const deudorGrupoWrapReset = document.getElementById('alc_dep_deudor_grupo_wrap');
      if(deudorGrupoWrapReset) deudorGrupoWrapReset.style.display = 'none';
      const deudorHintReset = document.getElementById('alc_dep_deudor_saldo_hint');
      if(deudorHintReset) deudorHintReset.textContent = '';
      _alcOrigenActualizar();
    }, 30);
  }
  if(id === 'alcancia-destapar'){
    _inyectarAlcanciaSheets();
    setTimeout(()=>{
      const mi = document.getElementById('alc_real_monto');
      if(mi){ mi.value = '0,00'; if(typeof moneyInputAttach==='function') moneyInputAttach(mi); }
      const dest = document.getElementById('alc_destino');
      if(dest && typeof buildFuentesOptsHtml==='function'){
        dest.innerHTML = buildFuentesOptsHtml({incluirTC:false,placeholder:'Seleccionar cuenta'});
      }
      const hint = document.getElementById('alc_diferencia_hint');
      if(hint) hint.textContent = '';
      // Resumen
      const a = _getA();
      const res = document.getElementById('alc-destapar-resumen');
      if(res && a){
        const dias = _diasDesde(a.fechaInicio);
        res.innerHTML = `
          <div class="card" style="background:rgba(240,184,64,.07);border-color:rgba(240,184,64,.2);padding:14px 16px;">
            <div class="row" style="margin-bottom:8px;">
              <span style="font-size:12px;color:var(--text3);">Tiempo activa</span>
              <span style="font-size:13px;font-weight:600;color:var(--amber);">${_fmtTiempo(dias)}</span>
            </div>
            <div class="row" style="margin-bottom:8px;">
              <span style="font-size:12px;color:var(--text3);">Depósitos registrados</span>
              <span style="font-size:13px;font-weight:600;color:var(--text);">${a.depositos || 0}</span>
            </div>
            <div class="row">
              <span style="font-size:12px;color:var(--text3);">Saldo esperado (registrado)</span>
              <span style="font-size:13px;font-weight:600;font-family:'DM Mono',monospace;color:var(--amber);">${typeof fmt==='function'?fmt(a.saldoRegistrado||0):'$'+a.saldoRegistrado}</span>
            </div>
          </div>`;
      }
    }, 30);
  }
});

/* ─── RENDER PANTALLA ───────────────────────────────────────────────────── */
window.renderAlcancia = function(){
  const a = _getA();
  // Una alcancía destapada pero no reiniciada se trata como "no activa"
  // para que la pantalla principal no muestre una alcancía fantasma vacía.
  const activa = !!(a && !a._destapada && (a.fechaInicio || a.depositos > 0 || a.saldoRegistrado > 0));

  const elNoIniciada = document.getElementById('alcancia-no-iniciada');
  const elActiva     = document.getElementById('alcancia-activa');
  if(elNoIniciada) elNoIniciada.style.display = activa ? 'none' : '';
  if(elActiva)     elActiva.style.display     = activa ? '' : 'none';

  const heroSaldo = document.getElementById('alcancia-hero-saldo');
  if(heroSaldo){
    heroSaldo.textContent = activa ? '$??' : '$0';
    heroSaldo.style.filter = activa ? 'blur(8px)' : 'none';
  }
  const heroSub = document.getElementById('alcancia-hero-sub');
  if(heroSub){
    if(!activa) heroSub.textContent = 'Sin alcancía activa';
    else {
      const dias = _diasDesde(a.fechaInicio);
      heroSub.textContent = 'Activa hace ' + _fmtTiempo(dias);
    }
  }

  if(activa && a){
    const statDep = document.getElementById('alcancia-stat-depositos');
    const statTiempo = document.getElementById('alcancia-stat-tiempo');
    if(statDep) statDep.textContent = a.depositos || 0;
    if(statTiempo) statTiempo.textContent = _fmtTiempo(_diasDesde(a.fechaInicio));

    // ── Movimientos: se ven dentro de Alcancía (detalle por depósito), pero
    // el TOTAL acumulado sigue oculto (heroSaldo con blur) — eso es lo único
    // que debe seguir siendo sorpresa. Sin esta lista no hay forma de
    // corregir un depósito mal anotado, porque cuentas.js también los
    // esconde mientras la alcancía sigue activa.
    const movsTitulo = document.getElementById('alcancia-movs-titulo');
    const movsEl = document.getElementById('alcancia-movimientos-lista');
    if(movsTitulo) movsTitulo.style.display = '';
    if(movsEl){
      movsEl.style.display = '';
      const movs = (a.movimientos || []);
      if(!movs.length){
        movsEl.innerHTML = '<div class="feed-empty">Aún no hay movimientos en esta alcancía.</div>';
      } else {
        const tipoIcon = { yo: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block"><ellipse cx="12" cy="17" rx="8" ry="5"/><path d="M4 17v-4c0-2.76 3.58-5 8-5s8 2.24 8 5v4"/><path d="M4 13c0-2.76 3.58-5 8-5s8 2.24 8 5"/></svg>', regalo: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>', mandado: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>', split: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block"><path d="M17 11H9l-2-2H3v8h4l2 2h8l4-4v-4h-4z"/><path d="M9 11V7l4-4 4 4v4"/></svg>', 'cobro-deuda': '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block"><circle cx="12" cy="12" r="10"/><polyline points="8 12 12 16 16 12"/><line x1="12" y1="8" x2="12" y2="16"/></svg>' };
        const tipoColor = { yo: 'var(--accent)', regalo: 'var(--amber)', mandado: 'var(--amber)', split: 'var(--amber)', 'cobro-deuda': 'var(--accent)' };
        movsEl.innerHTML = [...movs].reverse().map(m => {
          const icon  = tipoIcon[m.tipo]  || '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block"><ellipse cx="12" cy="17" rx="8" ry="5"/><path d="M4 17v-4c0-2.76 3.58-5 8-5s8 2.24 8 5v4"/><path d="M4 13c0-2.76 3.58-5 8-5s8 2.24 8 5"/></svg>';
          const color = tipoColor[m.tipo] || 'var(--accent)';
          const label = m.tipoLabel || (m.fuenteOrigen ? 'Propio' : 'Externo');
          const fmtFuente = m.fuenteOrigen
            ? (() => {
                const f = m.fuenteOrigen;
                if(f === 'nequi') return 'Nequi';
                if(f === 'efectivo') return 'Efectivo';
                if(f.startsWith('cajita:')){ const id=f.split(':')[1]; const c=(window.S&&window.S.cajitas||[]).find(x=>x.id===id); return c?c.nombre:'Cajita'; }
                if(f.startsWith('custom:')){ const id=f.split(':')[1]; const c=(window.S&&window.S.cuentasPersonalizadas||[]).find(x=>x.id===id); return c?c.nombre:'Cuenta'; }
                return f;
              })()
            : (m.tipo === 'cobro-deuda' && m._prestamoDeudorId
                ? (() => { const dd=(window.S&&window.S.deudores||[]).find(x=>x.id===m._prestamoDeudorId); return dd?dd.nombre:null; })()
                : null);
          return `
          <div class="card card-sm" style="margin-bottom:8px;display:flex;align-items:flex-start;gap:10px;">
            <div style="font-size:18px;flex-shrink:0;margin-top:1px;">${icon}</div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:2px;">${escHtml(m.desc || 'Depósito')}</div>
              <div style="font-size:11px;color:var(--text3);">${m.fecha}${fmtFuente ? ' · de ' + fmtFuente : ''}</div>
              <div style="font-size:10px;color:${color};margin-top:2px;">${label}</div>
            </div>
            <span class="alc-dep-monto" data-shown="0" data-mov-id="${m.id}" ${Events.attr('alcancia:toggleMontoDeposito', m.id)} title="Toca para ver el monto" style="display:inline-flex;align-items:center;min-height:20px;font-size:13px;font-weight:700;font-family:'DM Mono',monospace;color:var(--text3);flex-shrink:0;cursor:pointer;">${_ALC_ICONO_OCULTO}</span>
            <button type="button" class="btn-delete-hover" data-stop-propagation="true" ${Events.attr('alcancia:eliminarDeposito', m.id)} title="Eliminar este depósito" style="flex-shrink:0;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
            </button>
          </div>`;
        }).join('');
      }
    }
  }

  // ── Historial de alcancías destapadas (siempre visible, haya o no alcancía activa)
  if(a){
    const listaEl  = document.getElementById('alcancia-historial-lista');
    const tituloEl = document.getElementById('alcancia-historial-titulo');

    // "Wrapped" de progreso: se recalcula en cada render desde a.historial,
    // así que se actualiza solo apenas se destapa una alcancía nueva —
    // ninguna cifra propia que persistir ni sincronizar aparte.
    const wrapEl = document.getElementById('alcancia-wrapped-progreso');
    if(wrapEl){
      const html = _alcWrappedProgresoHtml(a.historial || []);
      wrapEl.style.display = html ? '' : 'none';
      wrapEl.innerHTML = html;
    }

    if(listaEl){
      const hist = a.historial || [];
      if(tituloEl) tituloEl.style.display = hist.length ? '' : 'none';
      if(!hist.length){
        listaEl.innerHTML = '<div class="feed-empty">Aún no has destapado ninguna alcancía.</div>';
      } else {
        listaEl.innerHTML = [...hist].reverse().map((h,i) => {
          const dif = (h.saldoReal||0) - (h.saldoRegistrado||0);
          const difFmt = Math.abs(dif) < 1 ? 'Exacto'
            : dif > 0 ? '+' + (typeof fmt==='function'?fmt(dif):dif)
            : '−' + (typeof fmt==='function'?fmt(Math.abs(dif)):Math.abs(dif));
          const difColor = Math.abs(dif) < 1 ? 'var(--text3)' : dif > 0 ? 'var(--accent)' : 'var(--red)';
          const histIdx = hist.length - i; // número de alcancía (1-based, más reciente = mayor)
          const desgloseId = 'alc-hist-desglose-' + histIdx;
          const desgloseFmt = typeof fmt === 'function' ? fmt : v => '$' + Math.round(v).toLocaleString('es-CO');
          const desgloseHtml = _alcDesgloseHtml(h.movimientos || [], desgloseFmt);
          return `
          <div class="card card-sm" style="margin-bottom:8px;">
            <div class="row" style="margin-bottom:6px;">
              <span style="font-size:12px;font-weight:700;color:var(--text);">Alcancía #${histIdx}</span>
              <span style="font-size:11px;color:var(--text3);">${h.fechaInicio||''} → ${h.fechaFin||''}</span>
            </div>
            <div class="row" style="margin-bottom:4px;">
              <span style="font-size:11px;color:var(--text3);">Duración</span>
              <span style="font-size:12px;color:var(--text2);">${_fmtTiempo(h.diasDuracion||0)}</span>
            </div>
            <div class="row" style="margin-bottom:4px;">
              <span style="font-size:11px;color:var(--text3);">Depósitos</span>
              <span style="font-size:12px;color:var(--text2);">${h.depositos||0}</span>
            </div>
            <div class="row" style="margin-bottom:4px;">
              <span style="font-size:11px;color:var(--text3);">Registrado</span>
              <span style="font-size:12px;font-family:'DM Mono',monospace;color:var(--amber);">${typeof fmt==='function'?fmt(h.saldoRegistrado||0):'$'+h.saldoRegistrado}</span>
            </div>
            <div class="row" style="margin-bottom:4px;">
              <span style="font-size:11px;color:var(--text3);">Real encontrado</span>
              <span style="font-size:12px;font-family:'DM Mono',monospace;color:var(--text);">${typeof fmt==='function'?fmt(h.saldoReal||0):'$'+h.saldoReal}</span>
            </div>
            <div class="row">
              <span style="font-size:11px;color:var(--text3);">Diferencia</span>
              <span style="font-size:12px;font-family:'DM Mono',monospace;color:${difColor};">${difFmt}</span>
            </div>
            ${desgloseHtml ? `
            <div style="margin-top:8px;border-top:1px solid var(--border);padding-top:6px;">
              <button type="button" ${Events.attr('alcancia:toggleDesglose', desgloseId)} style="display:flex;align-items:center;gap:5px;background:none;border:none;padding:0;cursor:pointer;color:var(--amber);font-size:11px;font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:.5px;width:100%;">
                <span style="display:inline-flex;align-items:center;gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> Ver origen del dinero</span>
                <svg class="alc-hist-chevron" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-left:auto;transition:transform .2s;"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              <div id="${desgloseId}" style="display:none;margin-top:4px;">${desgloseHtml}</div>
            </div>` : ''}
          </div>`;
        }).join('');
      }
    }
  }
};

/* ─── ACCIONES ──────────────────────────────────────────────────────────── */

/* Iniciar nueva alcancía (o reiniciar tras destapar) */
window.alcanciaIniciarNueva = function(){
  _initA();
  const a = window.S.alcancia;
  a.saldoRegistrado = 0;
  a.depositos = 0;
  a.fechaInicio = (typeof hoy==='function'?hoy():new Date().toISOString().slice(0,10));
  a.movimientos = [];
  if(!a.historial) a.historial = [];
  delete a._destapada;
  _setSaldoOfuscado(0);
  if(typeof save==='function') save();
  if(typeof closeSheet==='function') closeSheet('alcancia-resultado');
  window.renderAlcancia();
  if(typeof showScreen==='function') showScreen('alcancia');
  if(typeof toast==='function') toast('Alcancía iniciada', 'ok');
};

/* Confirmar depósito
   Un depósito = uno o varios ORÍGENES (ver "ORÍGENES DEL DEPÓSITO" arriba).
   Por cada origen se crea su movimiento espejo:
     · cuenta          → gasto interno en S.gastosVar (_esAlcancia) + resta saldo real
     · propio/regalo/mandado → ingreso en S.movimientos (_esAlcanciaIngreso). NO toca ningún
                         saldo: es plata que nunca estuvo en una cuenta. (Antes se sumaba y
                         restaba el mismo monto a Efectivo para "cancelarlo".)
     · deuda           → abono en el deudor (solo con un único origen)
   Un único origen guarda el mismo registro de siempre (tipo yo-cuenta/yo-directo/...);
   varios orígenes guardan tipo 'multi' con partes[]. */
window.alcanciaConfirmarDeposito = function(){
  const fecha  = (document.getElementById('alc_dep_fecha')||{}).value  || (typeof hoy==='function'?hoy():'');
  const descEl = document.getElementById('alc_dep_desc');
  const descVal = (descEl ? descEl.value.trim() : '') || '';
  const err = m => { if(typeof toast==='function') toast(m, 'err'); };

  /* ── 1. Armar las partes ── */
  let partes = [];
  if(_alcSplitMode){
    const filas = (typeof splitGetData === 'function') ? splitGetData('alcancia') : [];
    if(!filas.length){ err('Ingresá cuánto viene de cada origen'); return; }
    if(filas.some(f => !f.fuente)){ err('Elegí el origen de cada monto'); return; }
    partes = filas.map(f => _alcParteDesdeValor(f.fuente, f.monto));
  } else {
    const v = (document.getElementById('alc_dep_origen')||{}).value || '';
    if(!v){ err('Elegí de dónde viene el dinero'); return; }
    const m = _getMoneyVal('alc_dep_monto');
    if(!m || m <= 0){ err('Ingresá un monto válido'); return; }
    partes = [_alcParteDesdeValor(v, m)];
  }
  const monto = Math.round(partes.reduce((t, p) => t + p.monto, 0) * 100) / 100;
  if(!(monto > 0)){ err('Ingresá un monto válido'); return; }
  const unica = partes.length === 1;

  /* ── 2. Validar ── */
  for(const p of partes){
    if(p.origen !== 'cuenta') continue;
    const saldoDisp = typeof getSaldoFuente==='function' ? getSaldoFuente(p.fuente) : 0;
    if(p.monto > saldoDisp + 0.5){
      err(unica ? 'Saldo insuficiente en la cuenta seleccionada' : 'Saldo insuficiente en ' + _alcNombreFuente(p.fuente)); return;
    }
  }

  // Cobro de deuda: persona + (si aplica) préstamo, y que el monto no supere lo que todavía debe.
  let cobroDeudorId = '', cobroGrupoId = '', cobroDeudorNombre = '';
  const esCobro = unica && partes[0].origen === 'deuda';
  if(esCobro){
    cobroDeudorId = (document.getElementById('alc_dep_deudor')||{}).value || '';
    if(!cobroDeudorId){ err('Seleccioná quién te pagó'); return; }
    const dCheck = (window.S && window.S.deudores || []).find(x => x.id === cobroDeudorId);
    if(!dCheck){ err('Esa persona ya no existe'); return; }
    if(typeof _migrarGruposDeudor === 'function') _migrarGruposDeudor(dCheck);
    cobroDeudorNombre = dCheck.nombre;
    const grupoWrapCheck = document.getElementById('alc_dep_deudor_grupo_wrap');
    if(grupoWrapCheck && grupoWrapCheck.style.display !== 'none'){
      cobroGrupoId = (document.getElementById('alc_dep_deudor_grupo')||{}).value || '';
      if(!cobroGrupoId){ err('Seleccioná a cuál préstamo corresponde'); return; }
    }
    const saldoDisp = cobroGrupoId ? getGrupoSaldo(dCheck, cobroGrupoId) : getDeudorSaldo(dCheck);
    if(monto > saldoDisp + 0.5){
      err(`${escHtml(dCheck.nombre)} solo debe ${typeof fmt==='function'?fmt(saldoDisp):saldoDisp}`); return;
    }
  }

  /* ── 3. Crear los movimientos espejo ── */
  _initA();
  const a = window.S.alcancia;
  const uidF = () => typeof uid==='function' ? uid() : Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const entryId = uidF();
  partes.forEach((p, i) => { p.movId = i === 0 ? entryId : uidF(); }); // la 1ª parte comparte id con la entrada (como siempre)

  partes.forEach(p => {
    if(p.origen === 'cuenta'){
      window.S.gastosVar = window.S.gastosVar || [];
      window.S.gastosVar.push({
        id: p.movId,
        desc: descVal || 'Depósito en alcancía',
        monto: p.monto,
        fecha,
        cat: 'Ahorro',
        fuente: p.fuente,
        nota: (unica ? 'Guardado en alcancía oculta' : 'Guardado en alcancía oculta (depósito dividido)') + (descVal ? ': ' + descVal : ''),
        _esAlcancia: true,
        _alcTipo: unica ? 'yo-cuenta' : 'multi',
        _secundario: true, _origenSeccion: 'Alcancía',
        ts: Date.now()
      });
      if(typeof sumarFuente === 'function') sumarFuente(p.fuente, -p.monto);
    } else if(p.origen !== 'deuda'){
      const info = _ALC_INFO_ORIGEN[p.origen];
      window.S.movimientos = window.S.movimientos || [];
      window.S.movimientos.push({
        id: p.movId,
        tipo: 'entrada',
        // NO cambiar `fuente`: inicio.js (ingresosMes) solo suma entradas de S.movimientos cuya fuente sea
        // nequi/efectivo/cajita:/custom:, así que con otra fuente este ingreso dejaría de contar en el mes.
        // No mueve ningún saldo y no aparece en el historial de Efectivo (cuentas.js lo salta).
        fuente: 'efectivo',
        monto: p.monto,
        fecha,
        desc: unica ? (descVal || info.desc) : (descVal ? descVal + ' (' + info.corto + ')' : info.desc),
        nota: info.nota,
        _esAlcanciaIngreso: true,
        _secundario: true, _origenSeccion: 'Alcancía',
        ts: Date.now()
      });
    }
  });

  // Cobro de deuda: abono en la persona (descuenta la deuda). No toca ninguna cuenta ni cuenta como ingreso.
  let cobroAbonoMovId = null;
  if(esCobro){
    const d = (window.S.deudores || []).find(x => x.id === cobroDeudorId);
    if(d){
      if(!d.movimientos) d.movimientos = [];
      // Deudores viejos sin d.grupos: migrar antes, si no _autoGrupoIdMov crea un grupo en blanco (ver prestado.md §2.4).
      if(typeof _migrarGruposDeudor === 'function') _migrarGruposDeudor(d);
      const grupoIdFinal = cobroGrupoId || (typeof _autoGrupoIdMov === 'function' ? _autoGrupoIdMov(d, fecha) : undefined);
      cobroAbonoMovId = uidF();
      d.movimientos.push({
        id: cobroAbonoMovId,
        tipo: 'abono',
        monto,
        fecha,
        nota: 'Cobrado y guardado directo en la alcancía' + (descVal ? ': ' + descVal : ''),
        destino: '',
        grupoId: grupoIdFinal,
        _viaAlcancia: true,
        _alcanciaMovId: entryId,
        ts: Date.now()
      });
      if(typeof _autoCerrarGruposEnCero === 'function') _autoCerrarGruposEnCero(d);
      if(typeof logCambio === 'function') logCambio('Abono de ' + escHtml(d.nombre) + ' guardado directo en la alcancía', d.nombre, monto, 'abono');
    }
  }

  /* ── 4. Registro propio de la alcancía ── */
  a.saldoRegistrado = (a.saldoRegistrado || 0) + monto;
  a.depositos = (a.depositos || 0) + 1;
  a.movimientos = a.movimientos || [];
  const movEntry = { id: entryId, monto, fecha, fuenteOrigen: null, ts: Date.now() };
  if(unica){
    const p = partes[0];
    if(p.origen === 'cuenta'){
      movEntry.tipo = 'yo-cuenta'; movEntry.tipoLabel = 'Propio (de cuenta)'; movEntry.fuenteOrigen = p.fuente;
      movEntry.desc = descVal || 'Depósito en alcancía';
    } else if(p.origen === 'deuda'){
      movEntry.tipo = 'cobro-deuda'; movEntry.tipoLabel = 'Cobro de deuda';
      movEntry.desc = descVal || ('Cobro de deuda — ' + cobroDeudorNombre);
      movEntry._prestamoDeudorId = cobroDeudorId;
      movEntry._prestamoMovId = cobroAbonoMovId;
    } else {
      const info = _ALC_INFO_ORIGEN[p.origen];
      movEntry.tipo = info.tipo;
      movEntry.tipoLabel = { propio: 'Propio (directo)', regalo: 'Regalo mamá', mandado: 'Mandado mamá' }[p.origen];
      movEntry.desc = descVal || info.desc;
    }
  } else {
    movEntry.tipo = 'multi';
    movEntry.tipoLabel = partes.map(p => p.origen === 'cuenta' ? _alcNombreFuente(p.fuente) : _ALC_INFO_ORIGEN[p.origen].corto).join(' + ');
    movEntry.desc = descVal || 'Depósito de varias fuentes';
    movEntry.partes = partes.map(p => {
      const o = { origen: p.origen, monto: p.monto, movId: p.movId };
      if(p.fuente) o.fuente = p.fuente;
      return o;
    });
  }
  a.movimientos.push(movEntry);
  _setSaldoOfuscado(a.saldoRegistrado);

  if(typeof save==='function') save();
  if(typeof closeSheet==='function') closeSheet('alcancia-depositar');
  if(typeof refresh==='function') refresh();
  window.renderAlcancia();
  if(typeof toast==='function') toast('Guardado en la alcancía', 'ok');
};

/* Confirmar destapar */
window.alcanciaConfirmarDestapar = function(){
  const saldoReal = _getMoneyVal('alc_real_monto');
  const destino   = (document.getElementById('alc_destino')||{}).value || '';

  if(saldoReal <= 0){
    if(typeof toast==='function') toast('Ingresá el monto real encontrado', 'err'); return;
  }
  if(!destino){
    if(typeof toast==='function') toast('Seleccioná una cuenta destino', 'err'); return;
  }

  _initA();
  const a = window.S.alcancia;
  const saldoReg = a.saldoRegistrado || 0;
  const dif = saldoReal - saldoReg;
  const hoyStr = typeof hoy==='function' ? hoy() : new Date().toISOString().slice(0,10);

  // ── Movimiento 1: transferir saldo registrado desde alcancía → destino
  // Los gastos marcados _esAlcancia ya descontaron el dinero de las cuentas.
  // Ahora lo reponemos en la cuenta destino como ingreso neutral interno.
  if(saldoReg > 0){
    window.S.movimientos = window.S.movimientos || [];
    window.S.movimientos.push({
      id: typeof uid==='function' ? uid() : Date.now().toString(36),
      tipo: 'transferencia',
      fuente: destino,
      monto: saldoReg,
      fecha: hoyStr,
      desc: 'Alcancía destapada — saldo registrado',
      nota: 'Transferencia interna desde alcancía',
      _esAlcancia: true,
      _secundario: true, _origenSeccion: 'Alcancía',
      ts: Date.now()
    });
    // Actualizar saldo de la cuenta destino
    _sumarASaldo(destino, saldoReg);
  }

  // ── Movimiento 2: diferencia positiva → ingreso real
  if(dif > 1){
    window.S.movimientos = window.S.movimientos || [];
    window.S.movimientos.push({
      id: typeof uid==='function' ? uid() : Date.now().toString(36),
      tipo: 'entrada',
      fuente: destino,
      monto: dif,
      fecha: hoyStr,
      desc: 'Dinero extra encontrado en alcancía',
      nota: 'Ajuste: dinero físico no registrado previamente',
      _esAlcancia: true,
      _secundario: true, _origenSeccion: 'Alcancía',
      ts: Date.now()
    });
    _sumarASaldo(destino, dif);
  }

  // ── Movimiento 3: diferencia negativa → gasto de ajuste
  if(dif < -1){
    const absDif = Math.abs(dif);
    window.S.gastosVar = window.S.gastosVar || [];
    window.S.gastosVar.push({
      id: typeof uid==='function' ? uid() : Date.now().toString(36),
      desc: 'Ajuste alcancía — faltante',
      monto: absDif,
      fecha: hoyStr,
      cat: 'Ajuste',
      fuente: destino,
      nota: 'Diferencia negativa al destapar alcancía',
      _esAlcanciaAjuste: true,
      _secundario: true, _origenSeccion: 'Alcancía',
      ts: Date.now()
    });
    // Restar la diferencia del saldo de la cuenta destino
    _sumarASaldo(destino, -absDif);
  }

  // ── Resetear saldoRegistrado: ya se transfirió arriba a la cuenta destino
  // vía _sumarASaldo(). Si se deja el valor viejo, calcPatrimonioTotal()
  // (core-state.js) lo sigue sumando SIEMPRE (tapada o destapada, por
  // diseño — es plata real), y como la alcancía queda en estado
  // `_destapada` sin reiniciar hasta que el usuario elija "Iniciar nueva
  // alcancía", ese monto queda contado DOS veces (una en la cuenta destino,
  // otra acá) — duplicando patrimonio, tendencia mensual y la proyección
  // 3m/6m/12m. El valor para historial ya quedó capturado arriba en
  // `saldoReg`, así que resetear acá no afecta el registro histórico.
  a.saldoRegistrado = 0;
  _setSaldoOfuscado(0);

  // ── Guardar en historial
  const diasDuracion = _diasDesde(a.fechaInicio);
  if(!a.historial) a.historial = [];
  const entradaHist = {
    fechaInicio:      a.fechaInicio,
    fechaFin:         hoyStr,
    diasDuracion,
    depositos:        a.depositos || 0,
    saldoRegistrado:  saldoReg,
    saldoReal,
    diferencia:       dif,
    movimientos:      [...(a.movimientos || [])]
  };
  a.historial.push(entradaHist);

  // ── Preparar resultado para mostrar
  const resBody = document.getElementById('alc-resultado-body');
  if(resBody){
    const fmt2 = typeof fmt==='function' ? fmt : v=>'$'+Math.round(v).toLocaleString('es-CO');
    const hist = a.historial;
    const prev = hist.length >= 2 ? hist[hist.length - 2] : null;
    let comparHtml = '';
    if(!prev){
      comparHtml = `<div style="font-size:12px;color:var(--text3);text-align:center;margin-top:10px;">Esta es tu primera alcancía. ¡Se inicia tu historial de ahorro!</div>`;
    } else {
      const difMonto  = saldoReg - (prev.saldoRegistrado||0);
      const difDias   = diasDuracion - (prev.diasDuracion||0);
      const racha = _alcRachaAhorro(hist);
      const rachaMsg = racha >= 2 ? `🔥 Racha de ${racha} alcancías seguidas ahorrando más` : '';
      comparHtml = `
        <div class="card" style="margin-top:10px;padding:12px 14px;background:rgba(255,255,255,.04);">
          <div style="font-size:11px;color:var(--text3);margin-bottom:8px;font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:.6px;">vs. alcancía anterior</div>
          <div class="row" style="margin-bottom:4px;">
            <span style="font-size:12px;color:var(--text3);">Monto</span>
            <span style="font-size:12px;font-family:'DM Mono',monospace;color:${difMonto>=0?'var(--accent)':'var(--red)'};">${difMonto>=0?'+':''} ${fmt2(difMonto)}</span>
          </div>
          <div class="row"${rachaMsg ? ' style="margin-bottom:8px;"' : ''}>
            <span style="font-size:12px;color:var(--text3);">Duración</span>
            <span style="font-size:12px;color:${difDias>=0?'var(--accent)':'var(--red)'};">${difDias>=0?'+':''} ${difDias} días</span>
          </div>
          ${rachaMsg ? `<div style="font-size:12px;color:var(--amber);">${rachaMsg}</div>` : ''}
        </div>`;
    }
    const difMsgColor = Math.abs(dif)<1 ? 'var(--text3)' : dif>0 ? 'var(--accent)' : 'var(--red)';
    const difMsg = Math.abs(dif)<1
      ? 'El dinero encontrado coincide exactamente con lo registrado.'
      : dif > 0
        ? `Encontraste ${fmt2(dif)} adicionales que no estaban registrados. Se suman al patrimonio.`
        : `Faltan ${fmt2(Math.abs(dif))} respecto a lo registrado. Se ajusta el patrimonio.`;
    resBody.innerHTML = `
      <div class="card" style="background:rgba(240,184,64,.07);border-color:rgba(240,184,64,.3);padding:16px;margin-bottom:10px;text-align:center;">
        <div style="font-size:28px;font-weight:700;font-family:'DM Mono',monospace;color:var(--amber);margin-bottom:4px;">${fmt2(saldoReal)}</div>
        <div style="font-size:12px;color:var(--text3);">encontraste en la alcancía</div>
      </div>
      <div class="card card-sm" style="margin-bottom:8px;">
        <div class="row" style="margin-bottom:6px;">
          <span style="font-size:12px;color:var(--text3);">Registrado por la app</span>
          <span style="font-size:13px;font-family:'DM Mono',monospace;color:var(--amber);">${fmt2(saldoReg)}</span>
        </div>
        <div class="row" style="margin-bottom:6px;">
          <span style="font-size:12px;color:var(--text3);">Real encontrado</span>
          <span style="font-size:13px;font-family:'DM Mono',monospace;color:var(--text);">${fmt2(saldoReal)}</span>
        </div>
        <div class="row">
          <span style="font-size:12px;color:var(--text3);">Diferencia</span>
          <span style="font-size:13px;font-family:'DM Mono',monospace;color:${difMsgColor};">${Math.abs(dif)<1?'$0':dif>0?'+'+fmt2(dif):'−'+fmt2(Math.abs(dif))}</span>
        </div>
      </div>
      <div style="font-size:12px;color:${difMsgColor};padding:8px 12px;background:${Math.abs(dif)<1?'rgba(255,255,255,.04)':dif>0?'rgba(200,240,96,.06)':'rgba(240,104,104,.06)'};border-radius:var(--radius-sm);margin-bottom:4px;">${difMsg}</div>
      ${_alcDesgloseHtml(a.movimientos, fmt2)}
      ${comparHtml}`;
  }

  // ── Marcar la alcancía como destapada (sin iniciar una nueva automáticamente)
  // El reset real ocurre solo cuando el usuario elige "Iniciar nueva alcancía".
  // Si pulsa "Cerrar", la alcancía queda en estado _destapada hasta que decida.
  a._destapada = true;

  // ── Sincronizar DOM antes de save() ─────────────────────────────────────
  // _sumarASaldo actualiza S.nequiSaldo y S.efectivoSaldo directamente,
  // pero save() los vuelve a leer del input DOM (document.getElementById('nequiSaldo').value).
  // Si el input no se actualiza primero, save() sobreescribe S con el valor
  // viejo del DOM, y snapshotPatrimonio() registra un patrimonio incorrecto
  // (sin los 70k del destapar), distorsionando la tendencia mensual.
  if(typeof fmtInput === 'function'){
    const _elNq = document.getElementById('nequiSaldo');
    const _elEf = document.getElementById('efectivoSaldo');
    if(_elNq) _elNq.value = fmtInput(window.S.nequiSaldo || 0);
    if(_elEf) _elEf.value = fmtInput(window.S.efectivoSaldo || 0);
    // Si el destino fue una cajita, sincronizar también su input de saldo
    if(destino && destino.startsWith('cajita:')){
      const _cajId = destino.split(':')[1];
      const _cajEl = document.getElementById('cs_' + _cajId);
      const _caj = (window.S.cajitas||[]).find(c=>c.id===_cajId);
      if(_cajEl && _caj && !(_caj.cdts && _caj.cdts.length)) _cajEl.value = fmtInput(_caj.saldo || 0);
    }
  }

  if(typeof save==='function') save();
  if(typeof closeSheet==='function') closeSheet('alcancia-destapar');
  setTimeout(()=>{ if(typeof openSheet==='function') openSheet('alcancia-resultado'); }, 200);
  if(typeof refresh==='function') refresh();
  window.renderAlcancia();
};

/* ─── TOGGLE DESGLOSE (historial) ───────────────────────────────────────── */
/**
 * Handler de 'alcancia:toggleDesglose'. Events le pasa el propio elemento
 * clickeado (el botón) como argumento extra al final — lo usamos para
 * encontrar el chevron a rotar sin depender de `this` (como hacía la
 * IIFE inline original armada con onclick="(function(btn){...})(this)").
 */
function _alcanciaToggleDesglose(desgloseId, el){
  const box = document.getElementById(desgloseId);
  if(!box) return;
  const open = box.style.display !== 'none';
  box.style.display = open ? 'none' : '';
  const chevron = el && el.querySelector('.alc-hist-chevron');
  if(chevron) chevron.style.transform = open ? '' : 'rotate(180deg)';
}

/* ─── SUMAR A SALDO DE CUENTA ───────────────────────────────────────────── */
function _sumarASaldo(fuente, monto){
  if(!fuente || !monto) return;
  const S = window.S;
  if(fuente === 'nequi'){ S.nequiSaldo = (S.nequiSaldo||0) + monto; return; }
  if(fuente === 'efectivo'){ S.efectivoSaldo = (S.efectivoSaldo||0) + monto; return; }
  if(fuente.startsWith('cajita:')){
    const id = fuente.split(':')[1];
    const c  = (S.cajitas||[]).find(x=>x.id===id);
    if(c) c.saldo = (c.saldo||0) + monto;
    return;
  }
  if(fuente.startsWith('custom:')){
    const id = fuente.split(':')[1];
    const c  = (S.cuentasPersonalizadas||[]).find(x=>x.id===id);
    if(c){
      c.saldo = (c.saldo||0) + monto;
      c.movimientos = c.movimientos || [];
      const esNegativo = monto < 0;
      c.movimientos.push({
        id: typeof uid==='function'?uid():Date.now().toString(36),
        tipo: esNegativo ? 'egreso' : 'ingreso',
        monto: Math.abs(monto),
        fecha: typeof hoy==='function'?hoy():'',
        desc: esNegativo ? 'Ajuste alcancía — faltante' : 'Alcancía destapada',
        nota: ''
      });
    }
    return;
  }
}

/* ─── REVELAR EL MONTO DE UN DEPÓSITO (uno a la vez) ─────────────────────
   Por defecto la lista muestra un ícono de "oculto" (ojo tachado) en vez del monto — mostrarlos todos
   de una permitiría sumarlos a mano y reconstruir el total que heroSaldo
   mantiene oculto ("$??"). El monto real nunca se guarda en el HTML antes
   de que el usuario lo pida: se busca en window.S.alcancia recién al
   tocar, y solo para esa fila. */
window.alcanciaToggleMontoDeposito = function(movId, el){
  if(!el || el.dataset.movId === undefined) return;
  const montoEl = el;
  const shown = montoEl.dataset.shown === '1';
  if(shown){
    montoEl.innerHTML = _ALC_ICONO_OCULTO;
    montoEl.dataset.shown = '0';
    montoEl.style.color = 'var(--text3)';
  } else {
    _initA();
    const a = window.S.alcancia;
    const entry = a && (a.movimientos || []).find(m => m.id === movId);
    montoEl.textContent = entry ? '+' + (typeof fmt==='function'?fmt(entry.monto):entry.monto) : '?';
    montoEl.dataset.shown = '1';
    montoEl.style.color = 'var(--amber)';
  }
};

/* ─── ELIMINAR UN DEPÓSITO ───────────────────────────────────────────────
   Revierte según el tipo del depósito (ver depositAlcancia() arriba):
   - 'yo-directo' / 'regalo' / 'mandado' / la parte de mamá en 'split':
     fueron un ingreso neto-cero en S.movimientos (sumarFuente(+) seguido
     de sumarFuente(-)) — no tocan saldo real, así que basta con quitar el
     registro, sin revertir ningún saldo.
   - 'yo-cuenta' / la parte propia de 'split' cuando vino de una cuenta:
     fueron un gasto real en S.gastosVar que sí descontó saldo — hay que
     devolver la plata con sumarFuente().
   No usa eliminarMovimiento() de movimientos.js porque esos registros ya
   quedan marcados _secundario (ver arriba), así que esa función los
   bloquea a propósito — este es el único camino real para deshacerlos. */
window.alcanciaEliminarDeposito = async function(movId){
  _initA();
  const a = window.S.alcancia;
  if(!a || !a.movimientos) return;
  const idx = a.movimientos.findIndex(m => m.id === movId);
  if(idx === -1){ if(typeof toast==='function') toast('No se encontró ese depósito', 'err'); return; }
  const entry = a.movimientos[idx];

  // Protección por antigüedad — ver docs/proteccion-antiguedad-movimientos.md.
  // A diferencia de un ingreso neto-cero suelto, acá SIEMPRE hay algo que
  // proteger: a.saldoRegistrado es un total corrido que se ajusta
  // incrementalmente al borrar (igual que enc.movimientos en Encargos o
  // tc.deuda en Tarjetas), así que se mezcla con depósitos/retiros
  // posteriores muevan o no, además, una cuenta externa. "Operaciones
  // posteriores" se cuenta contra la alcancía completa (mismo criterio que
  // se usa en Encargos desde 2026-09-01 — ver CHANGELOG.md#encargos).
  let deudorParaAviso = null;
  if(entry.tipo === 'cobro-deuda' && entry._prestamoDeudorId){
    deudorParaAviso = (window.S.deudores || []).find(x => x.id === entry._prestamoDeudorId) || null;
  }
  if(typeof nivelAntiguedadMovimiento === 'function'){
    const opsPosteriores = entry.fecha ? (a.movimientos||[]).filter(m => m.id!==entry.id && m.fecha && m.fecha>entry.fecha).length : 0;
    const nivel = nivelAntiguedadMovimiento(entry.fecha, opsPosteriores, 'alcancia');
    if(nivel === 'bloqueado'){
      if(typeof avisarMovimientoBloqueado === 'function') await avisarMovimientoBloqueado();
      return;
    }
    if(nivel === 'viejo' && typeof confirmarBorrarMovimientoViejo === 'function'){
      let nombreCuenta, direccion;
      if(entry.tipo === 'yo-cuenta' && entry.fuenteOrigen){ nombreCuenta = fuenteLabel(entry.fuenteOrigen); direccion = 'sube'; }
      else if(entry.tipo === 'split' && entry._splitFuente){ nombreCuenta = fuenteLabel(entry._splitFuente); direccion = 'sube'; }
      else if(entry.tipo === 'multi' && (entry.partes||[]).some(pt => pt.origen === 'cuenta')){ nombreCuenta = entry.partes.filter(pt => pt.origen === 'cuenta').map(pt => _alcNombreFuente(pt.fuente)).join(' y '); direccion = 'sube'; }
      else if(entry.tipo === 'cobro-deuda' && deudorParaAviso){ nombreCuenta = 'la deuda de ' + deudorParaAviso.nombre; direccion = 'sube'; }
      else { nombreCuenta = 'tu alcancía'; direccion = 'baja'; }
      const ok = await confirmarBorrarMovimientoViejo(nombreCuenta, entry.monto || 0, direccion);
      if(!ok) return;

      // Ya se confirmó con el aviso específico de arriba — no repetir con el
      // genérico de abajo, igual que en Spotify (_borrarSpHistorial).
      return _alcanciaEjecutarEliminarDeposito(a, idx, entry);
    }
  }

  const dialogoTexto = entry.tipo === 'cobro-deuda'
    ? `¿Eliminar este depósito de ${typeof fmt==='function'?fmt(entry.monto):entry.monto} del ${entry.fecha}? Se le volverá a sumar esa plata a la deuda de la persona.`
    : `¿Eliminar este depósito de ${typeof fmt==='function'?fmt(entry.monto):entry.monto} del ${entry.fecha}? ${entry.fuenteOrigen || entry._splitFuente || (entry.tipo === 'multi' && (entry.partes||[]).some(pt => pt.origen === 'cuenta')) ? 'Se devolverá el dinero a la cuenta de origen.' : 'No afecta ningún saldo (fue un ingreso registrado sin mover plata real).'}`;
  const ok = await dialogo('Eliminar depósito', dialogoTexto, 'Eliminar', true);
  if(!ok) return;

  return _alcanciaEjecutarEliminarDeposito(a, idx, entry);
};

async function _alcanciaEjecutarEliminarDeposito(a, idx, entry){
  // Revertir el/los registro(s) reales según el tipo
  if(entry.tipo === 'yo-cuenta'){
    window.S.gastosVar = (window.S.gastosVar || []).filter(x => x.id !== entry.id);
    if(entry.fuenteOrigen && typeof sumarFuente === 'function') sumarFuente(entry.fuenteOrigen, entry.monto);
  } else if(entry.tipo === 'split'){
    if(entry._splitFuente){
      window.S.gastosVar = (window.S.gastosVar || []).filter(x => x.id !== entry.id);
      if(typeof sumarFuente === 'function') sumarFuente(entry._splitFuente, entry._splitYo || 0);
    } else if(entry._splitYo > 0){
      window.S.movimientos = (window.S.movimientos || []).filter(x => x.id !== entry.id);
    }
    if(entry._splitMamaMovId){
      window.S.movimientos = (window.S.movimientos || []).filter(x => x.id !== entry._splitMamaMovId);
    }
  } else if(entry.tipo === 'multi'){
    // Varios orígenes: cada parte tiene su propio movimiento espejo (partes[].movId).
    (entry.partes || []).forEach(pt => {
      if(pt.origen === 'cuenta'){
        window.S.gastosVar = (window.S.gastosVar || []).filter(x => x.id !== pt.movId);
        if(pt.fuente && typeof sumarFuente === 'function') sumarFuente(pt.fuente, pt.monto);
      } else {
        window.S.movimientos = (window.S.movimientos || []).filter(x => x.id !== pt.movId);
      }
    });
  } else if(entry.tipo === 'cobro-deuda'){
    // No hay cuenta real ni movimiento en S.movimientos que revertir — el
    // rastro real es el abono en el deudor. Quitarlo de ahí reabre la deuda.
    if(entry._prestamoDeudorId && entry._prestamoMovId){
      const d = (window.S.deudores || []).find(x => x.id === entry._prestamoDeudorId);
      if(d && d.movimientos){
        d.movimientos = d.movimientos.filter(x => x.id !== entry._prestamoMovId);
        if(typeof _autoCerrarGruposEnCero === 'function') _autoCerrarGruposEnCero(d);
      }
    }
  } else {
    // 'yo-directo' / 'regalo' / 'mandado' — ingreso neto-cero
    window.S.movimientos = (window.S.movimientos || []).filter(x => x.id !== entry.id);
  }

  // Revertir el estado propio de la alcancía
  a.movimientos.splice(idx, 1);
  a.saldoRegistrado = Math.max(0, (a.saldoRegistrado || 0) - entry.monto);
  a.depositos = Math.max(0, (a.depositos || 0) - 1);
  _setSaldoOfuscado(a.saldoRegistrado);

  if(typeof save==='function') save();
  if(typeof refresh==='function') refresh();
  window.renderAlcancia();
  if(typeof toast==='function') toast('Depósito eliminado', 'info');
}

/* Quita SOLO el lado de la alcancía de un depósito 'cobro-deuda', sin tocar
   al deudor — para cuando el borrado se inició desde Préstamos
   (eliminarMovDeudor ya revirtió/confirmó ese lado). Sin diálogo de
   confirmación propio: quien llama ya confirmó una sola vez. */
window._alcanciaQuitarPorCobroDeuda = function(alcMovId){
  _initA();
  const a = window.S.alcancia;
  if(!a || !a.movimientos) return false;
  const idx = a.movimientos.findIndex(m => m.id === alcMovId);
  if(idx === -1) return false;
  const entry = a.movimientos[idx];
  a.movimientos.splice(idx, 1);
  a.saldoRegistrado = Math.max(0, (a.saldoRegistrado || 0) - entry.monto);
  a.depositos = Math.max(0, (a.depositos || 0) - 1);
  _setSaldoOfuscado(a.saldoRegistrado);
  return true;
};

/* ─── REGISTRO EN EVENTS ─────────────────────────────────────────────────
   Los dos primeros (abrirDepositar/abrirDestapar) reemplazan los
   onclick="openSheet('alcancia-...')" que vivían como HTML estático en
   index.html (mismo patrón ya usado en Préstamos/TC: cada acción se
   nombra por lo que hace, no por el nombre genérico de la función que
   invoca por debajo). El resto envuelve las funciones ya expuestas en
   `window` — se mantienen colgadas de window por compatibilidad, Events
   solo agrega la forma de dispararlas desde el HTML sin onclick inline. */
Events.registerAll('alcancia', {
  abrirDepositar:     function(){ if(typeof openSheet === 'function') openSheet('alcancia-depositar'); },
  abrirDestapar:      function(){ if(typeof openSheet === 'function') openSheet('alcancia-destapar'); },
  iniciarNueva:       window.alcanciaIniciarNueva,
  confirmarDeposito:  window.alcanciaConfirmarDeposito,
  confirmarDestapar:  window.alcanciaConfirmarDestapar,
  eliminarDeposito:   window.alcanciaEliminarDeposito,
  toggleMontoDeposito: window.alcanciaToggleMontoDeposito,
  toggleDividir:      window.alcanciaToggleDividir,
  agregarOrigen:      window.alcanciaAgregarOrigen,
  toggleDesglose:     _alcanciaToggleDesglose
});

/* ─── INYECTAR MAS MENU ITEM ─────────────────────────────────────────────── */
// CÓDIGO MUERTO EN LA PRÁCTICA (confirmado, no borrado — ver auditoria-tecnica.md
// "Alcancía: regresión del ítem de menú", cierre 2026-08-18): este era el fix del
// piloto de carga lazy de Alcancía — el ítem "Alcancía" del menú "Más" se generaba
// acá porque el módulo (y su ítem de menú) recién existían tras la primera carga
// lazy. En algún momento posterior #mas-alcancia pasó a vivir como HTML estático
// en index.html (junto a #mas-config, con su mismo data-screen="alcancia") y ya
// lo wirea el handler genérico de js/core/mas-menu.js (querySelectorAll
// ('.mas-item[data-screen]')) — el guard de la línea de abajo (elemento ya
// existe) hace que esta función retorne siempre antes de crear nada. El hook de
// showScreen() más abajo sigue siendo necesario (dispara renderAlcancia() sin
// importar cómo se llegó a la pantalla) — eso no es código muerto.
function _inyectarMasMenuItem(){
  const masMenu = document.getElementById('mas-menu');
  if(!masMenu || document.getElementById('mas-alcancia')) return;
  const configItem = document.getElementById('mas-config');
  const item = document.createElement('div');
  item.className = 'mas-item';
  item.id = 'mas-alcancia';
  item.setAttribute('data-screen','alcancia');
  item.innerHTML = `
    <div class="mas-item-icon" style="background:rgba(240,184,64,.1);border-color:rgba(240,184,64,.25);">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2a4 4 0 0 1 4 4v1h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1V6a4 4 0 0 1 4-4z"/>
        <circle cx="12" cy="14" r="1.5" fill="var(--amber)" stroke="none"/>
      </svg>
    </div>
    <div>
      <div class="mas-item-label">Alcancía oculta</div>
      <div class="mas-item-sub">Ahorro sorpresa — saldo oculto</div>
    </div>`;
  if(configItem) masMenu.insertBefore(item, configItem);
  else masMenu.appendChild(item);

  // Registrar en el sistema de navegación
  item.addEventListener('click', ()=>{
    if(typeof closeMas==='function') closeMas();
    else {
      const ov = document.getElementById('mas-menu-overlay');
      const mn = document.getElementById('mas-menu');
      if(ov) ov.style.display='none'; if(mn) mn.style.display='none';
    }
    if(typeof showScreen==='function'){
      showScreen('alcancia');
      window.renderAlcancia();
    }
  });
}

/* ─── showScreen HOOK — ver js/core/hook-global.js ──────────────────────── */
hookGlobal('showScreen', function(name){
  if(name === 'alcancia') window.renderAlcancia();
});

/* ─── INTEGRACIÓN CON data-screen en el mas-menu ────────────────────────── */
// El sistema nativo usa data-screen en .mas-item → querySelectorAll detecta el click.
// Pero nuestro item es inyectado dinámicamente, así que usamos addEventListener arriba.
// Aun así hay que registrar el screen en el mapa de nombres si la app los valida.
if(window._screenNames){
  window._screenNames['screen-alcancia'] = 'Alcancía';
}

/* ─── ARRANQUE ──────────────────────────────────────────────────────────── */
function _alcanciaInit(){
  _inyectarMasMenuItem();
  _inyectarAlcanciaSheets();
  // Registrar refresh en el sistema de navegación nativo (mas-item data-screen clicks)
  document.querySelectorAll('.nav-item[data-screen]').forEach(btn => {
    if(btn.getAttribute('data-screen') === 'alcancia'){
      btn.addEventListener('click', ()=> window.renderAlcancia());
    }
  });
}

window.addEventListener('appDataLoaded', function(){
  setTimeout(_alcanciaInit, 700);
});

// Fallback si ya cargó
if(window._dataLoaded){
  setTimeout(_alcanciaInit, 500);
} else if(document.readyState !== 'loading'){
  // Antes era un setInterval propio con contador a mano (ver
  // CHANGELOG.md#infraestructura--seguridad, entrada de consolidación de
  // este patrón — se había cerrado como "cero copias en todo el proyecto"
  // sin haber revisado todavía js/modules/, donde vivía esta 8ª copia).
  // alcancia.js carga vía lazy-loader.js (script clásico inyectado
  // dinámicamente con document.createElement, mucho después de que
  // wait-for.js — <script defer> del HTML inicial — ya terminó de correr),
  // así que puede usar waitFor() como global sin ningún riesgo de carrera
  // (a diferencia de pin-bio.js/firebase-sync.js).
  //
  // onGiveUp (agregado 2026-09-08): antes, si los 40 intentos (~12s) se
  // agotaban sin que window.S/window._dataLoaded aparecieran, la falla era
  // 100% silenciosa — Alcancía simplemente nunca se inicializaba, sin nada
  // en consola. No cambia el camino exitoso, solo le da un rastro
  // diagnosticable al que hoy fallaba sin ninguna pista.
  waitFor(() => window.S && window._dataLoaded, _alcanciaInit, {
    intervalMs: 300,
    maxAttempts: 40,
    onGiveUp: () => console.warn('[alcancia] window.S/_dataLoaded no aparecieron tras 40 intentos (~12s) — Alcancía no se inicializó.')
  });
}

})(); // end IIFE
