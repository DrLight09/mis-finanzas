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

/* ─── TIPO ORIGEN TOGGLE ─────────────────────────────────────────────────── */
function _alcanciaActualizarTipo(){
  const tipo = (document.getElementById('alc_dep_tipo')||{}).value || 'yo-directo';
  const fuenteWrap = document.getElementById('alc_dep_fuente_wrap');
  const splitWrap  = document.getElementById('alc_dep_split_wrap');
  const montoLabel = document.querySelector('label[for="alc_dep_monto"]') ||
                     (() => { const ig = document.getElementById('alc_dep_monto'); return ig ? ig.closest('.ig')?.querySelector('label') : null; })();

  if(fuenteWrap) fuenteWrap.style.display = (tipo === 'yo-cuenta') ? '' : 'none';
  if(splitWrap)  splitWrap.style.display  = (tipo === 'split')    ? '' : 'none';
  const deudorWrap = document.getElementById('alc_dep_deudor_wrap');
  if(deudorWrap) deudorWrap.style.display = (tipo === 'cobro-deuda') ? '' : 'none';
  if(tipo === 'cobro-deuda') _alcDeudorSelActualizar();

  // Cuando es split el campo total se auto-llena
  const montoInput = document.getElementById('alc_dep_monto');
  if(montoInput){
    if(tipo === 'split'){
      // Deshabilitar edición manual del total cuando es split
      montoInput.readOnly = true;
      montoInput.style.opacity = '0.6';
    } else {
      montoInput.readOnly = false;
      montoInput.style.opacity = '';
    }
  }
}

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

function _alcSplitActualizarTotal(){
  const yo   = _getMoneyVal('alc_split_yo')   || 0;
  const mama = _getMoneyVal('alc_split_mama') || 0;
  const total = yo + mama;
  const hint  = document.getElementById('alc_split_total_hint');
  const montoInput = document.getElementById('alc_dep_monto');

  if(hint){
    if(yo > 0 || mama > 0){
      hint.textContent = 'Total: ' + (typeof fmt === 'function' ? fmt(total) : total);
      hint.style.color = 'var(--amber)';
    } else {
      hint.textContent = '';
    }
  }

  // Sincronizar el campo de monto total
  if(montoInput && total > 0){
    // Formatear igual que lo hacen los money-inputs: sin símbolo, con coma decimal
    const formatted = total.toFixed(2).replace('.', ',');
    montoInput.value = formatted;
    montoInput.dispatchEvent(new Event('input'));
  } else if(montoInput && total === 0){
    montoInput.value = '';
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
        <label class="il">¿De dónde viene este dinero?</label>
        <div class="select-wrap">
          <select id="alc_dep_tipo">
            <option value="yo-directo"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block"><ellipse cx="12" cy="17" rx="8" ry="5"/><path d="M4 17v-4c0-2.76 3.58-5 8-5s8 2.24 8 5v4"/><path d="M4 13c0-2.76 3.58-5 8-5s8 2.24 8 5"/></svg> Lo tenía yo (no sale de ninguna cuenta)</option>
            <option value="yo-cuenta"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block"><line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 20 7 4 7"/></svg> Lo saqué de una de mis cuentas</option>
            <option value="regalo"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg> Me lo regaló mi mamá</option>
            <option value="mandado"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg> Me lo dio mi mamá por un mandado</option>
            <option value="split"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block"><path d="M17 11H9l-2-2H3v8h4l2 2h8l4-4v-4h-4z"/><path d="M9 11V7l4-4 4 4v4"/></svg> Pusimos entre los dos</option>
            <option value="cobro-deuda"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block"><circle cx="12" cy="12" r="10"/><polyline points="8 12 12 16 16 12"/><line x1="12" y1="8" x2="12" y2="16"/></svg> Me pagaron una deuda que me tenían</option>
          </select>
        </div>
      </div>
      <div class="ig" id="alc_dep_deudor_wrap" style="display:none;">
        <label class="il">¿Quién te pagó?</label>
        <div class="select-wrap">
          <select id="alc_dep_deudor"><option value="">Seleccionar persona</option></select>
        </div>
        <div class="ig" id="alc_dep_deudor_grupo_wrap" style="display:none;margin-top:8px;">
          <label class="il">¿De cuál préstamo?</label>
          <div class="select-wrap"><select id="alc_dep_deudor_grupo"></select></div>
        </div>
        <div id="alc_dep_deudor_saldo_hint" style="font-size:11px;color:var(--text3);margin-top:4px;"></div>
      </div>
      <div class="ig" id="alc_dep_fuente_wrap">
        <label class="il">¿De qué cuenta sale?</label>
        <div class="select-wrap">
          <select id="alc_dep_fuente"></select>
        </div>
        <div id="alc_dep_saldo_hint" style="font-size:11px;color:var(--text3);margin-top:4px;"></div>
      </div>
      <div class="ig" id="alc_dep_split_wrap" style="display:none;">
        <label class="il">¿Cuánto puso cada uno?</label>
        <div style="display:flex;gap:10px;align-items:flex-start;">
          <div style="flex:1;">
            <div style="font-size:11px;color:var(--text3);margin-bottom:4px;font-weight:500;">Vos</div>
            <input type="text" inputmode="decimal" class="money-input" id="alc_split_yo" placeholder="0,00" autocomplete="off">
          </div>
          <div style="flex:1;">
            <div style="font-size:11px;color:var(--text3);margin-bottom:4px;font-weight:500;">Tu mamá</div>
            <input type="text" inputmode="decimal" class="money-input" id="alc_split_mama" placeholder="0,00" autocomplete="off">
          </div>
        </div>
        <div id="alc_split_total_hint" style="font-size:12px;color:var(--text3);margin-top:6px;font-family:'DM Mono',monospace;"></div>
        <div id="alc_split_fuente_wrap" style="margin-top:10px;">
          <div style="font-size:11px;color:var(--text3);margin-bottom:4px;">¿De qué cuenta sale tu parte? <span style="opacity:.6;">(opcional)</span></div>
          <div class="select-wrap">
            <select id="alc_split_fuente"></select>
          </div>
          <div id="alc_split_saldo_hint" style="font-size:11px;color:var(--text3);margin-top:4px;"></div>
        </div>
      </div>
      <div class="ig">
        <label class="il">Monto total</label>
        <input type="text" inputmode="decimal" class="money-input" id="alc_dep_monto" placeholder="0,00" autocomplete="off">
      </div>
      <div class="ig">
        <label class="il">Fecha</label>
        <input type="date" id="alc_dep_fecha" class="input-fecha">
      </div>
      <div class="ig">
        <label class="il">Descripción <span style="font-size:10px;color:var(--text3);font-weight:400;">(opcional)</span></label>
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
        <label class="il">¿Cuánto dinero encontraste realmente?</label>
        <input type="text" inputmode="decimal" class="money-input" id="alc_real_monto" placeholder="0,00" autocomplete="off">
        <div id="alc_diferencia_hint" style="font-size:12px;margin-top:6px;font-family:'DM Mono',monospace;"></div>
      </div>
      <div class="ig">
        <label class="il">¿Dónde vas a guardar este dinero?</label>
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
  _initMoneyInput('alc_dep_monto');
  _initMoneyInput('alc_real_monto');
  _initMoneyInput('alc_split_yo');
  _initMoneyInput('alc_split_mama');

  /* ---------- Split: recalcular total al cambiar cada campo ---------- */
  ['alc_split_yo','alc_split_mama'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.addEventListener('input', _alcSplitActualizarTotal);
  });

  /* ---------- Tipo origen selector (muestra/oculta fuente) ---------- */
  const tipoSel = document.getElementById('alc_dep_tipo');
  if(tipoSel){
    tipoSel.addEventListener('change', _alcanciaActualizarTipo);
  }

  /* ---------- Cobro de deuda: selector de deudor ---------- */
  const deudorSel = document.getElementById('alc_dep_deudor');
  if(deudorSel){
    deudorSel.addEventListener('change', _alcDeudorSelActualizar);
  }

  /* ---------- Fuente selector hint ---------- */
  const fuenteSel = document.getElementById('alc_dep_fuente');
  if(fuenteSel){
    fuenteSel.addEventListener('change', function(){
      const hint = document.getElementById('alc_dep_saldo_hint');
      if(!hint) return;
      const s = (typeof getSaldoFuente==='function') ? getSaldoFuente(this.value) : 0;
      hint.textContent = this.value ? 'Saldo disponible: ' + (typeof fmt==='function'?fmt(s):s) : '';
      hint.style.color = s > 0 ? 'var(--accent)' : 'var(--red)';
    });
  }

  /* ---------- Split fuente selector hint ---------- */
  const splitFuenteSel = document.getElementById('alc_split_fuente');
  if(splitFuenteSel){
    splitFuenteSel.addEventListener('change', function(){
      const hint = document.getElementById('alc_split_saldo_hint');
      if(!hint) return;
      if(!this.value){
        hint.textContent = '';
        return;
      }
      const s = (typeof getSaldoFuente==='function') ? getSaldoFuente(this.value) : 0;
      hint.textContent = 'Saldo disponible: ' + (typeof fmt==='function'?fmt(s):s);
      hint.style.color = s > 0 ? 'var(--accent)' : 'var(--red)';
    });
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

function _initMoneyInput(id){
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

/* ─── OPEN SHEET HOOK ───────────────────────────────────────────────────── */
const _origOpenSheetAlcancia = openSheet;
openSheet = function(id){
  if(id === 'alcancia-depositar'){
    _inyectarAlcanciaSheets();
    setTimeout(()=>{
      const fsel = document.getElementById('alc_dep_fuente');
      if(fsel && typeof buildFuentesOptsHtml==='function'){
        fsel.innerHTML = buildFuentesOptsHtml({incluirTC:false,placeholder:'Seleccionar cuenta'});
      }
      const fd = document.getElementById('alc_dep_fecha');
      if(fd) fd.value = (typeof hoy==='function'?hoy():new Date().toISOString().slice(0,10));
      const mi = document.getElementById('alc_dep_monto');
      if(mi){ mi.value = '0,00'; if(typeof moneyInputAttach==='function') moneyInputAttach(mi); }
      const h = document.getElementById('alc_dep_saldo_hint');
      if(h) h.textContent = '';
      const desc = document.getElementById('alc_dep_desc');
      if(desc) desc.value = '';
      // Reset split
      const splitYo   = document.getElementById('alc_split_yo');
      const splitMama = document.getElementById('alc_split_mama');
      if(splitYo)   { splitYo.value = '0,00';   if(typeof moneyInputAttach==='function') moneyInputAttach(splitYo); }
      if(splitMama) { splitMama.value = '0,00'; if(typeof moneyInputAttach==='function') moneyInputAttach(splitMama); }
      const splitHint = document.getElementById('alc_split_total_hint');
      if(splitHint) splitHint.textContent = '';
      // Split fuente: poblar y limpiar hint
      const splitFsel = document.getElementById('alc_split_fuente');
      if(splitFsel && typeof buildFuentesOptsHtml==='function'){
        splitFsel.innerHTML = buildFuentesOptsHtml({incluirTC:false,placeholder:'Lo tenía yo (efectivo)'});
      }
      const splitSaldoHint = document.getElementById('alc_split_saldo_hint');
      if(splitSaldoHint) splitSaldoHint.textContent = '';
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
      const tipo = document.getElementById('alc_dep_tipo');
      if(tipo) { tipo.value = 'yo-directo'; _alcanciaActualizarTipo(); }
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
  _origOpenSheetAlcancia.apply(this, arguments);
};

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
            <span class="alc-dep-monto" data-shown="0" data-mov-id="${m.id}" ${Events.attr('alcancia:toggleMontoDeposito', m.id)} title="Toca para ver el monto" style="font-size:13px;font-weight:700;font-family:'DM Mono',monospace;color:var(--text3);flex-shrink:0;cursor:pointer;letter-spacing:1px;">••••</span>
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

/* Confirmar depósito */
window.alcanciaConfirmarDeposito = function(){
  const monto  = _getMoneyVal('alc_dep_monto');
  const tipo   = (document.getElementById('alc_dep_tipo')||{}).value || 'yo-directo';
  const fuente = (document.getElementById('alc_dep_fuente')||{}).value || '';
  const fecha  = (document.getElementById('alc_dep_fecha')||{}).value  || (typeof hoy==='function'?hoy():'');
  const descEl = document.getElementById('alc_dep_desc');
  const descVal = (descEl ? descEl.value.trim() : '') || '';

  // Valores split
  const splitYo      = tipo === 'split' ? (_getMoneyVal('alc_split_yo')   || 0) : 0;
  const splitMama    = tipo === 'split' ? (_getMoneyVal('alc_split_mama') || 0) : 0;
  const splitFuente  = tipo === 'split' ? ((document.getElementById('alc_split_fuente')||{}).value || '') : '';

  if(!monto || monto <= 0){
    if(typeof toast==='function') toast('Ingresá un monto válido', 'err'); return;
  }

  // Validación split: que la suma cuadre con el total
  if(tipo === 'split'){
    if(splitYo <= 0 && splitMama <= 0){
      if(typeof toast==='function') toast('Ingresá cuánto puso cada uno', 'err'); return;
    }
    const sumaPartes = Math.round((splitYo + splitMama) * 100);
    const totalMonto = Math.round(monto * 100);
    if(sumaPartes !== totalMonto){
      if(typeof toast==='function') toast('La suma de las partes no coincide con el total', 'err'); return;
    }
  }

  // Solo requiere fuente cuando el dinero sale de una cuenta
  if(tipo === 'yo-cuenta'){
    if(!fuente){
      if(typeof toast==='function') toast('Seleccioná la cuenta de origen', 'err'); return;
    }
    const saldoDisp = typeof getSaldoFuente==='function' ? getSaldoFuente(fuente) : 0;
    if(monto > saldoDisp + 0.5){
      if(typeof toast==='function') toast('Saldo insuficiente en la cuenta seleccionada', 'err'); return;
    }
  }

  // Split con fuente: validar que hay saldo suficiente para la parte tuya
  if(tipo === 'split' && splitFuente && splitYo > 0){
    const saldoDisp = typeof getSaldoFuente==='function' ? getSaldoFuente(splitFuente) : 0;
    if(splitYo > saldoDisp + 0.5){
      if(typeof toast==='function') toast('Saldo insuficiente en la cuenta seleccionada para tu parte', 'err'); return;
    }
  }

  // Cobro de deuda: validar persona + (si aplica) grupo, y que el monto no
  // supere lo que esa persona (o ese préstamo puntual) todavía debe.
  let cobroDeudorId = '', cobroGrupoId = '', cobroDeudorNombre = '';
  if(tipo === 'cobro-deuda'){
    cobroDeudorId = (document.getElementById('alc_dep_deudor')||{}).value || '';
    if(!cobroDeudorId){ if(typeof toast==='function') toast('Seleccioná quién te pagó', 'err'); return; }
    const dCheck = (window.S && window.S.deudores || []).find(x => x.id === cobroDeudorId);
    if(!dCheck){ if(typeof toast==='function') toast('Esa persona ya no existe', 'err'); return; }
    if(typeof _migrarGruposDeudor === 'function') _migrarGruposDeudor(dCheck);
    cobroDeudorNombre = dCheck.nombre;
    const grupoWrapCheck = document.getElementById('alc_dep_deudor_grupo_wrap');
    if(grupoWrapCheck && grupoWrapCheck.style.display !== 'none'){
      cobroGrupoId = (document.getElementById('alc_dep_deudor_grupo')||{}).value || '';
      if(!cobroGrupoId){ if(typeof toast==='function') toast('Seleccioná a cuál préstamo corresponde', 'err'); return; }
    }
    const saldoDisp = cobroGrupoId ? getGrupoSaldo(dCheck, cobroGrupoId) : getDeudorSaldo(dCheck);
    if(monto > saldoDisp + 0.5){
      if(typeof toast==='function') toast(`${dCheck.nombre} solo debe ${typeof fmt==='function'?fmt(saldoDisp):saldoDisp}`, 'err'); return;
    }
  }

  _initA();
  const a = window.S.alcancia;

  const movId = typeof uid==='function' ? uid() : Date.now().toString(36);
  const tipoLabel = {
    'yo-directo':  'Propio (directo)',
    'yo-cuenta':   'Propio (de cuenta)',
    'regalo':      'Regalo mamá',
    'mandado':     'Mandado mamá',
    'split':       'Entre los dos',
    'cobro-deuda': 'Cobro de deuda'
  }[tipo] || tipo;

  const descFinal = descVal || {
    'yo-directo':  'Depósito en alcancía',
    'yo-cuenta':   'Depósito en alcancía',
    'regalo':      'Regalo de mamá',
    'mandado':     'Mandado de mamá',
    'split':       'Depósito compartido',
    'cobro-deuda': 'Cobro de deuda — ' + cobroDeudorNombre
  }[tipo] || 'Depósito en alcancía';

  // ── yo-cuenta: descuenta de la cuenta elegida (gasto interno de alcancía)
  if(tipo === 'yo-cuenta'){
    window.S.gastosVar = window.S.gastosVar || [];
    window.S.gastosVar.push({
      id: movId,
      desc: descFinal || 'Alcancía',
      monto: monto,
      fecha: fecha,
      cat: 'Ahorro',
      fuente: fuente,
      nota: 'Guardado en alcancía oculta' + (descVal ? ': ' + descVal : ''),
      _esAlcancia: true,
      _alcTipo: tipo,
      _secundario: true, _origenSeccion: 'Alcancía',
      ts: Date.now()
    });
    // Restar el saldo físico de la cuenta de origen
    if(typeof sumarFuente === 'function') sumarFuente(fuente, -monto);
  }

  // ── yo-directo: plata que tenías en efectivo sin registrar → es un ingreso nuevo
  if(tipo === 'yo-directo'){
    window.S.movimientos = window.S.movimientos || [];
    window.S.movimientos.push({
      id: movId,
      tipo: 'entrada',
      fuente: 'efectivo',
      monto: monto,
      fecha: fecha,
      desc: descFinal || 'Depósito en alcancía',
      nota: 'Ingreso registrado al guardar en alcancía (dinero directo)',
      _esAlcanciaIngreso: true,
      _secundario: true, _origenSeccion: 'Alcancía',
      ts: Date.now()
    });
    // Suma a efectivo para que el saldo refleje ese dinero... y luego lo resta
    // porque ahora está "en" la alcancía (no disponible en efectivo).
    // Neto: 0 en efectivo, pero el ingreso queda en estadísticas del mes.
    if(typeof sumarFuente === 'function'){
      sumarFuente('efectivo', monto);
      sumarFuente('efectivo', -monto);
    }
  }

  // ── regalo: dinero que mamá regaló → es un ingreso real tuyo
  if(tipo === 'regalo'){
    window.S.movimientos = window.S.movimientos || [];
    window.S.movimientos.push({
      id: movId,
      tipo: 'entrada',
      fuente: 'efectivo',
      monto: monto,
      fecha: fecha,
      desc: descFinal || 'Regalo de mamá',
      nota: 'Ingreso: regalo de mamá guardado en alcancía',
      _esAlcanciaIngreso: true,
      _secundario: true, _origenSeccion: 'Alcancía',
      ts: Date.now()
    });
    // Igual que yo-directo: el ingreso se registra pero no queda disponible en efectivo
    if(typeof sumarFuente === 'function'){
      sumarFuente('efectivo', monto);
      sumarFuente('efectivo', -monto);
    }
  }

  // ── mandado: pago de mamá por un servicio → es un ingreso tuyo
  if(tipo === 'mandado'){
    window.S.movimientos = window.S.movimientos || [];
    window.S.movimientos.push({
      id: movId,
      tipo: 'entrada',
      fuente: 'efectivo',
      monto: monto,
      fecha: fecha,
      desc: descFinal || 'Mandado de mamá',
      nota: 'Ingreso: pago de mandado guardado en alcancía',
      _esAlcanciaIngreso: true,
      _secundario: true, _origenSeccion: 'Alcancía',
      ts: Date.now()
    });
    if(typeof sumarFuente === 'function'){
      sumarFuente('efectivo', monto);
      sumarFuente('efectivo', -monto);
    }
  }

  // ── split: tu parte puede venir de cuenta (resta) o de efectivo directo (ingreso).
  //    La parte de mamá siempre es ingreso nuevo para ti.
  let splitMamaMovId = null;
  if(tipo === 'split'){
    // Parte de mamá → ingreso real (ella te dio esa plata)
    if(splitMama > 0){
      splitMamaMovId = (typeof uid==='function' ? uid() : Date.now().toString(36)+'_m');
      window.S.movimientos = window.S.movimientos || [];
      window.S.movimientos.push({
        id: splitMamaMovId,
        tipo: 'entrada',
        fuente: 'efectivo',
        monto: splitMama,
        fecha: fecha,
        desc: (descVal || 'Depósito compartido') + ' (parte mamá)',
        nota: 'Ingreso: aporte de mamá al split de alcancía',
        _esAlcanciaIngreso: true,
        _secundario: true, _origenSeccion: 'Alcancía',
        ts: Date.now()
      });
      // El ingreso de mamá se registra pero no queda en efectivo (va a la alcancía)
      if(typeof sumarFuente === 'function'){
        sumarFuente('efectivo', splitMama);
        sumarFuente('efectivo', -splitMama);
      }
    }

    // Tu parte: si viene de una cuenta → restar esa cuenta (movimiento interno)
    if(splitFuente && splitYo > 0){
      window.S.gastosVar = window.S.gastosVar || [];
      window.S.gastosVar.push({
        id: movId,
        desc: descFinal || 'Alcancía',
        monto: splitYo,
        fecha: fecha,
        cat: 'Ahorro',
        fuente: splitFuente,
        nota: 'Guardado en alcancía (tu parte)' + (descVal ? ': ' + descVal : ''),
        _esAlcancia: true,
        _alcTipo: 'split',
        _secundario: true, _origenSeccion: 'Alcancía',
        ts: Date.now()
      });
      // Restar el saldo físico de la cuenta de origen
      if(typeof sumarFuente === 'function') sumarFuente(splitFuente, -splitYo);
    } else if(!splitFuente && splitYo > 0){
      // Tu parte es efectivo directo (sin cuenta) → ingreso nuevo
      window.S.movimientos = window.S.movimientos || [];
      window.S.movimientos.push({
        id: movId,
        tipo: 'entrada',
        fuente: 'efectivo',
        monto: splitYo,
        fecha: fecha,
        desc: (descVal || 'Depósito compartido') + ' (tu parte)',
        nota: 'Ingreso: tu aporte al split de alcancía (efectivo directo)',
        _esAlcanciaIngreso: true,
        _secundario: true, _origenSeccion: 'Alcancía',
        ts: Date.now()
      });
      if(typeof sumarFuente === 'function'){
        sumarFuente('efectivo', splitYo);
        sumarFuente('efectivo', -splitYo);
      }
    }
  }

  // ── cobro-deuda: registra el abono en la persona (descuenta la deuda).
  //    No toca ninguna cuenta real ni cuenta como ingreso — es plata que ya
  //    era tuya (estaba prestada) cambiando de "por cobrar" a "en la
  //    alcancía", igual que un 'prestamo' de salida tampoco genera entrada
  //    secundaria en ninguna cuenta (ver prestado.md §4.1).
  let cobroAbonoMovId = null;
  if(tipo === 'cobro-deuda'){
    const d = (window.S.deudores || []).find(x => x.id === cobroDeudorId);
    if(d){
      if(!d.movimientos) d.movimientos = [];
      // Deudores creados antes de que existieran los grupos (o nunca abiertos
      // desde entonces) no tienen d.grupos — sin esto, _autoGrupoIdMov ve 0
      // grupos abiertos y crea uno en blanco, dejando la deuda vieja huérfana
      // sin grupo (ver prestado.md §2.4, migración silenciosa).
      if(typeof _migrarGruposDeudor === 'function') _migrarGruposDeudor(d);
      const grupoIdFinal = cobroGrupoId || (typeof _autoGrupoIdMov === 'function' ? _autoGrupoIdMov(d, fecha) : undefined);
      cobroAbonoMovId = typeof uid==='function' ? uid() : Date.now().toString(36) + '_ab';
      d.movimientos.push({
        id: cobroAbonoMovId,
        tipo: 'abono',
        monto,
        fecha,
        nota: 'Cobrado y guardado directo en la alcancía' + (descVal ? ': ' + descVal : ''),
        destino: '',
        grupoId: grupoIdFinal,
        _viaAlcancia: true,
        _alcanciaMovId: movId,
        ts: Date.now()
      });
      if(typeof _autoCerrarGruposEnCero === 'function') _autoCerrarGruposEnCero(d);
      if(typeof logCambio === 'function') logCambio('Abono de ' + escHtml(d.nombre) + ' guardado directo en la alcancía', d.nombre, monto, 'abono');
    }
  }

  // Actualizar estado alcancía
  a.saldoRegistrado = (a.saldoRegistrado || 0) + monto;
  a.depositos = (a.depositos || 0) + 1;
  a.movimientos = a.movimientos || [];
  const movEntry = {
    id: movId,
    monto,
    fecha,
    fuenteOrigen: tipo === 'yo-cuenta' ? fuente : (tipo === 'split' && splitFuente ? splitFuente : null),
    tipo,
    tipoLabel,
    desc: descFinal,
    ts: Date.now()
  };
  // Guardar las partes del split
  if(tipo === 'split'){
    movEntry._splitYo     = splitYo;
    movEntry._splitMama   = splitMama;
    if(splitFuente) movEntry._splitFuente = splitFuente;
    if(splitMamaMovId) movEntry._splitMamaMovId = splitMamaMovId;
  }
  // Guardar el enlace de vuelta hacia el abono del deudor (ver prestado.md §4.2:
  // toda entrada secundaria necesita su id de vuelta para poder revertirse).
  if(tipo === 'cobro-deuda'){
    movEntry._prestamoDeudorId = cobroDeudorId;
    movEntry._prestamoMovId = cobroAbonoMovId;
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
      comparHtml = `
        <div class="card" style="margin-top:10px;padding:12px 14px;background:rgba(255,255,255,.04);">
          <div style="font-size:11px;color:var(--text3);margin-bottom:8px;font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:.6px;">vs. alcancía anterior</div>
          <div class="row" style="margin-bottom:4px;">
            <span style="font-size:12px;color:var(--text3);">Monto</span>
            <span style="font-size:12px;font-family:'DM Mono',monospace;color:${difMonto>=0?'var(--accent)':'var(--red)'};">${difMonto>=0?'+':''} ${fmt2(difMonto)}</span>
          </div>
          <div class="row">
            <span style="font-size:12px;color:var(--text3);">Duración</span>
            <span style="font-size:12px;color:${difDias>=0?'var(--accent)':'var(--red)'};">${difDias>=0?'+':''} ${difDias} días</span>
          </div>
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
   Por defecto la lista muestra "••••" en vez del monto — mostrarlos todos
   de una permitiría sumarlos a mano y reconstruir el total que heroSaldo
   mantiene oculto ("$??"). El monto real nunca se guarda en el HTML antes
   de que el usuario lo pida: se busca en window.S.alcancia recién al
   tocar, y solo para esa fila. */
window.alcanciaToggleMontoDeposito = function(movId, el){
  if(!el || el.dataset.movId === undefined) return;
  const montoEl = el;
  const shown = montoEl.dataset.shown === '1';
  if(shown){
    montoEl.textContent = '••••';
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

  const dialogoTexto = entry.tipo === 'cobro-deuda'
    ? `¿Eliminar este depósito de ${typeof fmt==='function'?fmt(entry.monto):entry.monto} del ${entry.fecha}? Se le volverá a sumar esa plata a la deuda de la persona.`
    : `¿Eliminar este depósito de ${typeof fmt==='function'?fmt(entry.monto):entry.monto} del ${entry.fecha}? ${entry.fuenteOrigen || entry._splitFuente ? 'Se devolverá el dinero a la cuenta de origen.' : 'No afecta ningún saldo (fue un ingreso registrado sin mover plata real).'}`;
  const ok = await dialogo('Eliminar depósito', dialogoTexto, 'Eliminar', true);
  if(!ok) return;

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
};

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

/* ─── showScreen HOOK ────────────────────────────────────────────────────── */
const _origShowScreenAlcancia = showScreen;
showScreen = function(name){
  _origShowScreenAlcancia.apply(this, arguments);
  if(name === 'alcancia') window.renderAlcancia();
};

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
  let _alcTries = 0;
  const _alcPoll = setInterval(()=>{
    _alcTries++;
    if(window.S && window._dataLoaded){
      clearInterval(_alcPoll);
      _alcanciaInit();
    } else if(_alcTries > 40) clearInterval(_alcPoll);
  }, 300);
}

})(); // end IIFE
