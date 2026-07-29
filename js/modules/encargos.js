/* ═══════════════════════════════════════════════════════════════
   js/modules/encargos.js

   Módulo Encargos — plata de otras personas que el usuario administra
   (no suma al patrimonio propio). Extraído de index.html como parte
   de la migración de arquitectura descrita en auditoria-tecnica.md
   (§1 onclick→data-action, §3 monolito) — mismo patrón ya usado en
   spotify.js y mesada.js. Ver docs/encargos.md para el detalle
   funcional del módulo (reglas de negocio, modelo de datos, flujos).

   ── Qué NO vive acá ──────────────────────────────────────────────
   - El motor de diferencial/margen (diffRegistrarInstancia, diffToggle,
     diffAddParte, diffResumen, diffAplicar, etc.) y el de split
     (crearSplitWidget, splitToggle, splitAgregarRow, splitGetData)
     siguen en index.html: los usan también Préstamos ("extra",
     "prtc") y otros módulos, no son exclusivos de Encargos. Acá solo
     viven las INSTANCIAS que este módulo registra en esos motores
     (diffRegistrarInstancia('movenc', ...), ('usarParte', ...),
     ('ctc', ...) y crearSplitWidget('movenc', ...), ('usarParte', ...)).
   - iniciales() y getCajitaNombre() se quedan en index.html porque
     también los usa el sistema de Personas.
   - _normEncargos(S) (normalización para el feed unificado de
     movimientos) se queda en index.html: vive anidada dentro de una
     misma factory compartida con _normDeudores/_normSpotify/_normTC/
     etc. — sacarla sola hubiera exigido reestructurar esa factory
     entera, que no es un cambio quirúrgico para este módulo.
   - La integración con el Sistema de Personas (selector de persona en
     "Nuevo encargo", hook que exige personaId, botones de perfil en
     lista/detalle) vive en js/modules/encargos-personas.js, cargado
     más abajo en index.html — mismo motivo que spotify-personas.js:
     depende de getPersona/abrirSelPersona/_inyectarPersonaSheets,
     definidos más adelante en el archivo.
   - La integración cruzada con Préstamos ("Pago de una deuda con
     plata de un encargo", dentro del sheet de abono de deudor) no se
     tocó: es código de Deudores que consume datos de Encargos, no al
     revés, y Deudores todavía no se migró (ver plan-migracion-personas.md).

   ── Correcciones de este mismo cambio ────────────────────────────
   Se migraron los onclick="..." inline de este módulo a data-action
   (ver js/core/events.js), y se corrigieron ~18 casos de texto libre
   sin escapar en .innerHTML/toast() — mismo patrón ya visto en
   Spotify (spNombreDe) y Mesada (fuenteLabel): el barrido original de
   escHtml() por nombre de campo no detecta texto libre que llega
   envuelto en una función auxiliar. Acá la función era fuenteLabel()
   (nombre de cajita/cuenta personalizada/tarjeta — todos campos de
   texto libre del usuario) e iniciales(). Detalle completo en
   CHANGELOG.md#encargos.
   ═══════════════════════════════════════════════════════════════ */

function editarEncargoActual() {
  if (!encargoActualId) return;
  const enc = getEncargo(encargoActualId);
  if (!enc) return;
  document.getElementById('enc_edit_nombre').value = enc.nombre || '';
  document.getElementById('enc_edit_nota').value = enc.nota || '';
  openSheet('editar-encargo');
}
function guardarEditarEncargo() {
  if (!encargoActualId) return;
  const enc = getEncargo(encargoActualId);
  if (!enc) return;
  const nombre = document.getElementById('enc_edit_nombre').value.trim();
  if (!nombre) { toast('Ingresa el nombre', 'err'); return; }
  enc.nombre = nombre;
  enc.nota = document.getElementById('enc_edit_nota').value.trim();
  // Sincronizar nombre en S.personas si hay vínculo
  if (enc.personaId) {
    const p = (S.personas || []).find(x => x.id === enc.personaId);
    if (p) p.nombre = nombre;
  }
  save();
  abrirEncargoDetalle(encargoActualId);
  closeSheet('editar-encargo');
  toast(nombre + ' actualizado', 'ok');
}
function renderEncargosEnCuenta(elId, tipoCuenta) {
  const el = document.getElementById(elId);
  if (!el) return;
  const encargos = S.encargos || [];

  // Para Nu: construir filas por cajita específica (no agrupado)
  // Para otras cuentas: comportamiento normal
  if (tipoCuenta === 'nu') {
    // Estructura: [{enc, cajitaId, saldoEncargo}]
    const filas = [];
    encargos.forEach(enc => {
      const mapRaw = {};
      if (enc.saldoInicial > 0) {
        const k = enc.cuentaInicial || '__sin__';
        mapRaw[k] = (mapRaw[k]||0) + enc.saldoInicial;
      }
      (enc.movimientos||[]).forEach(m => {
        const k = m.cuenta || '__sin__';
        if (m.tipo === 'entrada') mapRaw[k] = (mapRaw[k]||0) + m.monto;
        else mapRaw[k] = (mapRaw[k]||0) - m.monto;
      });
      // Una fila por cajita específica
      Object.entries(mapRaw).forEach(([k, v]) => {
        if (v > 0 && k && k.startsWith('cajita:')) {
          filas.push({ enc, cajitaId: k.split(':')[1], saldoEncargo: v });
        }
      });
    });
    if (!filas.length) { el.innerHTML = ''; return; }

    // Calcular intereses por cajita usando interés compuesto proporcional.
    // La porción del encargo crece al mismo ritmo que la cajita entera.
    // Proporción del encargo = saldoEncargo / saldo_base_cajita (el saldo guardado, sin intereses futuros)
    // Valor actual de esa porción = calcC(cajita).val * proporción
    // Interés de HOY de esa porción = valor_actual_porción * tasaDiaria
    // Esto replica exactamente lo que Nu hace: el dinero del encargo genera interés compuesto
    // acumulado desde que se depositó (fecha de la cajita), y el de hoy es sobre la base ya crecida.

    let totalEncargosNu = 0;      // saldo nominal (lo que le debes al encargante)
    let totalInteresesMios = 0;   // interés de hoy sobre la porción del encargo (es tuyo)
    let totalValorActual = 0;     // valor actual de la porción (nominal + intereses acumulados = ganancia tuya)
    const filasHtml = filas.map(({enc, cajitaId, saldoEncargo}) => {
      totalEncargosNu += saldoEncargo;
      const cajita = (S.cajitas||[]).find(x => x.id === cajitaId);
      const cajitaNombre = escHtml(cajita ? (cajita.nombre || 'Cajita Nu') : 'Cajita Nu');

      // Calcular valor actual proporcional de la porción del encargo
      let interesMioHoy = 0;
      let valorActualPorcion = saldoEncargo;
      let interesAcumulado = 0;
      if (cajita && cajita.saldo > 0) {
        const k = calcC(cajita);
        const proporcion = saldoEncargo / cajita.saldo; // fracción del saldo base que es del encargo
        valorActualPorcion = k.val * proporcion;        // valor actual de esa fracción (crece con la cajita)
        interesAcumulado = valorActualPorcion - saldoEncargo; // ganancia acumulada tuya hasta ahora
        // Interés de hoy = sobre la base ya crecida (interés compuesto)
        interesMioHoy = valorActualPorcion * k.tasaDiaria;
      } else {
        // Cajita sin fecha o sin saldo: usar tasa global simple
        const tasa = getNuTasaGlobal ? getNuTasaGlobal() : (S.nuTasaGlobal || 9.25);
        const tasaDiaria = Math.pow(1 + tasa / 100, 1 / 365) - 1;
        interesMioHoy = saldoEncargo * tasaDiaria;
      }
      totalInteresesMios += interesMioHoy;
      totalValorActual += valorActualPorcion;

      // Mostrar interés acumulado sólo si es significativo
      const acumuladoTag = interesAcumulado > 0.5
        ? `<span style="font-size:9px;color:var(--accent);font-family:'DM Mono',monospace;opacity:.8;">+${fmt(interesAcumulado)} acumulado tuyo</span>`
        : '';

      return `
        <div style="background:rgba(96,176,240,.04);border:1px solid rgba(96,176,240,.12);border-radius:9px;padding:10px 12px;margin-bottom:6px;cursor:pointer;" data-encargo-id="${enc.id}" ${Events.attr('encargos:abrirDesdeCuenta', enc.id)}>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <div class="avatar" style="width:26px;height:26px;font-size:9px;background:rgba(96,176,240,.15);color:var(--blue);border-color:rgba(96,176,240,.3);flex-shrink:0;margin-right:0;">${escHtml(iniciales(enc.nombre))}</div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(enc.nombre)}</div>
              ${enc.nota?`<div style="font-size:10px;color:var(--text3);">${escHtml(enc.nota)}</div>`:''}
            </div>
            <div style="text-align:right;flex-shrink:0;">
              <div style="font-size:14px;font-weight:600;font-family:'DM Mono',monospace;color:var(--blue);">${fmt(saldoEncargo)}</div>
              <div style="font-size:9px;color:var(--text3);font-family:'DM Mono',monospace;">de ${fmt(encargoSaldo(enc))} total</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;padding-top:6px;border-top:1px solid rgba(96,176,240,.1);">
            <span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;color:var(--nu-light);font-family:'DM Mono',monospace;">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>
              ${cajitaNombre}
            </span>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;">
              ${interesMioHoy >= 0.01 ? `<span style="font-size:10px;color:var(--accent);font-family:'DM Mono',monospace;">+${fmt(interesMioHoy)}/día <span style="font-size:9px;opacity:.7;">(tuyo)</span></span>` : ''}
              ${acumuladoTag}
            </div>
          </div>
        </div>`;
    }).join('');

    const totalAcumulado = totalValorActual - totalEncargosNu; // ganancia acumulada total tuya
    el.innerHTML = `
      <div class="sec-title">Encargos en Nu</div>
      <div style="background:rgba(96,176,240,.06);border:1px solid rgba(96,176,240,.18);border-radius:var(--radius-sm);padding:12px 14px;margin-bottom:10px;">
        <div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;margin-bottom:10px;">Plata que administrás de otras personas, guardada en tus cajitas — los intereses que genera son tuyos</div>
        ${filasHtml}
        <div style="display:flex;justify-content:space-between;align-items:center;padding-top:8px;margin-top:2px;border-top:1px solid rgba(96,176,240,.12);">
          <div>
            <div style="font-size:10px;color:var(--text3);">Total encargos en Nu</div>
            ${totalInteresesMios >= 0.01 ? `<div style="font-size:10px;color:var(--accent);font-family:'DM Mono',monospace;margin-top:2px;">+${fmt(totalInteresesMios)}/día que ganás vos</div>` : ''}
            ${totalAcumulado > 0.5 ? `<div style="font-size:10px;color:var(--accent);font-family:'DM Mono',monospace;margin-top:2px;opacity:.75;">+${fmt(totalAcumulado)} ganados hasta hoy</div>` : ''}
          </div>
          <span style="font-size:13px;font-weight:700;font-family:'DM Mono',monospace;color:var(--blue);">${fmt(totalEncargosNu)}</span>
        </div>
      </div>`;
    return;
  }

  // ── Comportamiento normal para cuentas no-Nu ──
  const filas = [];
  encargos.forEach(enc => {
    const mapRaw = {};
    if (enc.saldoInicial > 0) {
      const k = enc.cuentaInicial || '__sin__';
      mapRaw[k] = (mapRaw[k]||0) + enc.saldoInicial;
    }
    (enc.movimientos||[]).forEach(m => {
      const k = m.cuenta || '__sin__';
      if (m.tipo === 'entrada') mapRaw[k] = (mapRaw[k]||0) + m.monto;
      else mapRaw[k] = (mapRaw[k]||0) - m.monto;
    });
    let saldoEnCuenta = 0;
    Object.entries(mapRaw).forEach(([k, v]) => {
      const match = tipoCuenta.startsWith('custom:')
        ? k === tipoCuenta
        : k === tipoCuenta;
      if (match) saldoEnCuenta += v;
    });
    if (saldoEnCuenta > 0) {
      filas.push({ enc, saldo: saldoEnCuenta });
    }
  });
  if (!filas.length) { el.innerHTML = ''; return; }
  const colorMap = { nequi: '#ff4da6', efectivo: 'var(--amber)' };
  let color = colorMap[tipoCuenta] || 'var(--blue)';
  if (tipoCuenta.startsWith('custom:')) {
    const cId = tipoCuenta.split(':')[1];
    const cc = (S.cuentasPersonalizadas||[]).find(x=>x.id===cId);
    if (cc && cc.color) color = cc.color;
  }
  el.innerHTML = `
    <div class="sec-title">Encargos en esta cuenta</div>
    <div style="background:rgba(96,176,240,.06);border:1px solid rgba(96,176,240,.18);border-radius:var(--radius-sm);padding:12px 14px;margin-bottom:10px;">
      <div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;margin-bottom:8px;">Plata que administrás de otras personas guardada aquí</div>
      ${filas.map(({enc, saldo}) => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(96,176,240,.1);cursor:pointer;" data-encargo-id="${enc.id}" ${Events.attr('encargos:abrirDesdeCuenta', enc.id)}>
          <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;cursor:pointer;" ${Events.attr('encargos:abrirDesdeCuenta', enc.id)}>
            <div class="avatar" style="width:28px;height:28px;font-size:10px;background:rgba(96,176,240,.15);color:var(--blue);border-color:rgba(96,176,240,.3);flex-shrink:0;margin-right:0;">${escHtml(iniciales(enc.nombre))}</div>
            <div style="min-width:0;">
              <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(enc.nombre)}</div>
              ${enc.nota?`<div style="font-size:10px;color:var(--text3);">${escHtml(enc.nota)}</div>`:''}
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0;margin-left:8px;">
            <div style="font-size:14px;font-weight:600;font-family:'DM Mono',monospace;color:var(--blue);">${fmt(saldo)}</div>
            <div style="font-size:9px;color:var(--text3);font-family:'DM Mono',monospace;">de ${fmt(encargoSaldo(enc))} total</div>
          </div>
        </div>
      `).join('')}
      <div style="display:flex;justify-content:space-between;align-items:center;padding-top:8px;margin-top:4px;">
        <span style="font-size:10px;color:var(--text3);">Total encargos aquí</span>
        <span style="font-size:13px;font-weight:700;font-family:'DM Mono',monospace;color:var(--blue);">${fmt(filas.reduce((a,f)=>a+f.saldo,0))}</span>
      </div>
    </div>`;
}

function abrirEncargoDesdeCuenta(id) {
  // Navigate to encargos screen and open the detail
  showScreen('encargos');
  setTimeout(() => abrirEncargoDetalle(id), 80);
}

function getCajitaNombre(fuente) {
  if (!fuente || !fuente.startsWith('cajita:')) return null;
  const id = fuente.split(':')[1];
  const c = (S.cajitas || []).find(x => x.id === id);
  return c ? (c.nombre || 'Cajita') : null;
}
/* ================================================================
   ENCARGOS — plata de otros que administrás (NO suma al patrimonio)
   ================================================================ */

let encargoActualId = null;
let movEncargoTipo = 'entrada'; // 'entrada' | 'salida'

function getEncargo(id) {
  return (S.encargos||[]).find(e=>e.id===id);
}

function encargoSaldo(enc) {
  return (enc.movimientos||[]).reduce((a,m)=>{
    return a + (m.tipo==='entrada'?m.monto:-m.monto);
  }, enc.saldoInicial||0);
}

function renderEncargosList() {
  const el = document.getElementById('encargosList');
  const encargos = S.encargos||[];
  if (!encargos.length) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="1.8" stroke-linecap="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-4 0v2"/><line x1="12" y1="12" x2="12" y2="17"/><line x1="9.5" y1="14.5" x2="14.5" y2="14.5"/></svg></div>
      <div class="empty-state-title">Sin encargos</div>
      <div class="empty-state-sub">Cuando administres plata de alguien, créa un encargo para llevar el registro.</div>
    </div>`;
    return;
  }
  el.innerHTML = encargos.map(enc => {
    const saldo = encargoSaldo(enc);
    const ini = escHtml(iniciales(enc.nombre));
    return `<div class="card card-sm" style="cursor:pointer;margin-bottom:8px;" data-encargo-id="${enc.id}" ${Events.attr('encargos:abrirDetalle', enc.id)}>
      <div class="row">
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="avatar" style="background:rgba(96,176,240,.15);color:var(--blue);border-color:rgba(96,176,240,.3);flex-shrink:0;">${ini}</div>
          <div>
            <div class="row-name">${escHtml(enc.nombre)}</div>
            <div class="row-sub">${(enc.movimientos||[]).length} movimiento${(enc.movimientos||[]).length!==1?'s':''} · ${escHtml(enc.nota||'Encargo')}</div>
          </div>
        </div>
        <div style="text-align:right;">
          <div class="row-amount c-blue">${fmt(saldo)}</div>
          <span class="badge bg-blue" style="font-size:9px;">No es tuyo</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

function abrirEncargoDetalle(id) {
  encargoActualId = id;
  const enc = getEncargo(id);
  if (!enc) return;
  const saldo = encargoSaldo(enc);
  const entradas = (enc.movimientos||[]).filter(m=>m.tipo==='entrada').reduce((a,m)=>a+m.monto,0)+(enc.saldoInicial||0);
  const salidas = (enc.movimientos||[]).filter(m=>m.tipo==='salida').reduce((a,m)=>a+m.monto,0);

  document.getElementById('encargosListView').style.display = 'none';
  document.getElementById('encargoDetalle').style.display = '';
  document.getElementById('encargoAvatar').textContent = iniciales(enc.nombre);
  document.getElementById('encargoNombreDet').textContent = enc.nombre;
  document.getElementById('encargoSaldoLabel').textContent = enc.nota||'';
  document.getElementById('encargoSaldoHero').textContent = fmt(saldo);
  document.getElementById('encargoTotalEntradas').textContent = fmt(entradas);
  document.getElementById('encargoTotalSalidas').textContent = fmt(salidas);

  // Desglose por cuenta
  const desgEl = document.getElementById('encargoDesgloseCuentas');
  if (desgEl) {
    const cuentas = _getEncargoSaldoPorCuenta(enc);
    // También incluir sin especificar si hay plata ahí
    const mapRaw = {};
    if (enc.saldoInicial > 0) {
      const k = enc.cuentaInicial || '__sin__';
      mapRaw[k] = (mapRaw[k]||0) + enc.saldoInicial;
    }
    (enc.movimientos||[]).forEach(m => {
      const k = m.cuenta || '__sin__';
      if (m.tipo === 'entrada') mapRaw[k] = (mapRaw[k]||0) + m.monto;
      else mapRaw[k] = (mapRaw[k]||0) - m.monto;
    });
    const hayMultiple = Object.keys(mapRaw).filter(k => (mapRaw[k]||0) > 0).length > 0;
    if (hayMultiple && saldo > 0) {
      const tasaNU = getNuTasaGlobal ? getNuTasaGlobal() : (S.nuTasaGlobal || 9.25);
      const tasaDiaria = Math.pow(1 + tasaNU / 100, 1 / 365) - 1;
      const filas = Object.entries(mapRaw)
        .filter(([k,v]) => v > 0)
        .sort((a,b) => b[1]-a[1])
        .map(([k,v]) => {
          const lbl = escHtml(k === '__sin__' ? 'Sin especificar' : fuenteLabel(k));
          const pct = saldo > 0 ? Math.round(v/saldo*100) : 0;
          // Si está en una cajita de Nu, calcular interés diario que genera (es mío)
          const esCajita = k && k.startsWith('cajita:');
          const interesMio = esCajita ? v * tasaDiaria : 0;
          return `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
            <div>
              <span style="font-size:10px;color:rgba(96,176,240,.8);font-family:'DM Mono',monospace;">${lbl}</span>
              ${interesMio >= 0.01 ? `<div style="font-size:9px;color:var(--accent);font-family:'DM Mono',monospace;">+${fmt(interesMio)}/día tuyo</div>` : ''}
            </div>
            <span style="font-size:11px;font-weight:600;font-family:'DM Mono',monospace;color:var(--blue);">${fmt(v)} <span style="font-size:9px;opacity:.6;">${pct}%</span></span>
          </div>`;
        }).join('');
      desgEl.innerHTML = `<div style="border-top:1px solid rgba(96,176,240,.15);padding-top:8px;margin-bottom:6px;">${filas}</div>`;
    } else {
      desgEl.innerHTML = '';
    }
  }

  // Historial — mezclar saldo inicial con movimientos y ordenar todo por fecha desc
  const histEl = document.getElementById('encargoHistorial');
  // Construir lista unificada
  const todosMovs = [...(enc.movimientos||[]).map(m=>({...m, _esSaldoInicial:false}))];
  if (enc.saldoInicial > 0) {
    todosMovs.push({
      id: '__saldo_ini__',
      _esSaldoInicial: true,
      fecha: enc.fechaCreacion || '0000-00-00',
      tipo: 'entrada',
      monto: enc.saldoInicial,
      cuenta: enc.cuentaInicial || '',
      desc: 'Saldo inicial',
      nota: ''
    });
  }
  todosMovs.sort((a,b) => {
    const fechaDiff = b.fecha.localeCompare(a.fecha);
    if (fechaDiff !== 0) return fechaDiff;
    return (b.ts || 0) - (a.ts || 0);
  });

  // Precalcular saldo del encargo (antes/después) para cada movimiento
  const _encSaldoPorId = new Map();
  {
    let _saldoCorriente = saldo;
    todosMovs.forEach(m=>{
      const efecto = m.tipo==='entrada' ? +m.monto : -m.monto;
      const despues = _saldoCorriente;
      const antes = _saldoCorriente - efecto;
      _encSaldoPorId.set(m.id, {antes, despues});
      _saldoCorriente = antes;
    });
  }
  if (!todosMovs.length) {
    histEl.innerHTML = `<div class="empty-state" style="padding:16px 0;"><div class="empty-state-sub">Sin movimientos aún. Registrá entradas y salidas.</div></div>`;
  } else {
    let html = '';
    // Helper: construye atributos data-mov-* para abrir el sheet de detalle (saldo = saldo del encargo)
    const _encAttrs=(m, origenLbl)=>{
      const sd=_encSaldoPorId.get(m.id);
      if(!sd) return '';
      return `data-mov-id="${m.id}" data-mov-tipo="${m.tipo}" data-mov-monto="${Math.abs(m.monto)}" data-cuenta-key="encargo" data-mov-origen="${escHtml(origenLbl)}" data-mov-saldo-antes="${sd.antes}" data-mov-saldo-despues="${sd.despues}" data-mov-saldo-label="Saldo de ${escHtml(enc.nombre)}" data-mov-desc="${escHtml(m.desc||'')}" data-mov-fecha="${escHtml(m.fecha)}" style="cursor:pointer;" data-action="core:abrirDetalleMov"`;
    };
    html += todosMovs.map((m,i) => {
      if (m._esSaldoInicial) {
        const lblCuentaIni = m.cuenta ? escHtml(fuenteLabel(m.cuenta)) : '';
        return `<div class="gasto-item" ${_encAttrs(m,'Encargos · '+enc.nombre)} style="cursor:pointer;border-color:rgba(96,176,240,.2);">
          <div class="gasto-item-top">
            <div style="flex:1;"><div class="row-name" style="font-size:13px;">Saldo inicial</div><div class="row-sub">${m.fecha!=='0000-00-00'?m.fecha:''}${lblCuentaIni?' · '+lblCuentaIni:''}</div></div>
            <span class="row-amount c-blue">${fmt(m.monto)}</span>
          </div>
          <div class="gasto-item-meta"><span class="badge bg-blue" style="font-size:9px;">Inicio</span>${lblCuentaIni?`<span class="badge ${fuenteBadgeClass(m.cuenta)}" style="font-size:9px;">${lblCuentaIni}</span>`:''}</div>
        </div>`;
      }
      const esEntrada = m.tipo === 'entrada';
      const lblCuenta = m.cuenta ? escHtml(fuenteLabel(m.cuenta)) : '';
      const esAbonoPrestamo = !esEntrada && m._esAbonoDeudor;
      const esTcEncargo = !esEntrada && m._esTcEncargo;
      const esMia = !esEntrada && !!m._miaCuentaSale;
      const tcNombreLbl = esTcEncargo && m._tcId ? ((S.tarjetasCredito||[]).find(t=>t.id===m._tcId)||{}).nombre||'' : '';
      const miaSaleLbl  = esMia ? fuenteLabel(m._miaCuentaSale) : '';
      const miaEntraLbl = esMia && m._miaCuentaEntra ? fuenteLabel(m._miaCuentaEntra) : '';
      const origenEnc = esAbonoPrestamo ? ('Préstamos · ' + (((S.deudores||[]).find(x=>x.id===m._deudorId)||{}).nombre||'')) : ('Encargos · '+enc.nombre);
      return `<div class="gasto-item" ${_encAttrs(m,origenEnc)} style="cursor:pointer;border-color:${esEntrada?'rgba(96,176,240,.2)':esAbonoPrestamo?'rgba(240,184,64,.18)':esTcEncargo?'rgba(96,176,240,.25)':'rgba(240,104,104,.15)'};">
        <div class="gasto-item-top">
          <div style="flex:1;min-width:0;">
            <div class="row-name" style="font-size:13px;">${escHtml(m.desc)}</div>
            <div class="row-sub">${m.fecha}${lblCuenta?' · '+lblCuenta:''}${tcNombreLbl?' · '+tcNombreLbl:''}${esMia?' · Yo puse la plata':''}</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <span class="row-amount ${esEntrada?'c-blue':esAbonoPrestamo?'c-amber':'c-red'}">${esEntrada?'+':'−'}${fmt(m.monto)}</span>
            <button type="button" class="btn-delete-hover" data-stop-propagation="true" ${Events.attr('encargos:deleteMov', enc.id, m.id)} title="Eliminar (también elimina movimientos secundarios en tus cuentas)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </button>
          </div>
        </div>
        ${m.nota&&!esTcEncargo&&!esMia?`<div class="gasto-item-meta"><span style="font-size:10px;color:var(--text3);">${escHtml(m.nota)}</span></div>`:''}
        ${esMia?`<div class="gasto-item-meta" style="margin-top:3px;"><span style="font-size:10px;color:var(--text3);display:flex;align-items:center;gap:4px;flex-wrap:wrap;"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" style="width:10px;height:10px;fill:currentColor;flex-shrink:0;color:var(--amber);"><path fill-rule="evenodd" d="M1 11.5a.5.5 0 0 0 .5.5h11.793l-3.147 3.146a.5.5 0 0 0 .708.708l4-4a.5.5 0 0 0 0-.708l-4-4a.5.5 0 0 0-.708.708L13.293 11H1.5a.5.5 0 0 0-.5.5zm14-7a.5.5 0 0 1-.5.5H2.707l3.147 3.146a.5.5 0 1 1-.708.708l-4-4a.5.5 0 0 1 0-.708l4-4a.5.5 0 1 1 .708.708L2.707 4H14.5a.5.5 0 0 1 .5.5z"/></svg>Salió de <strong style="color:var(--text2);">${escHtml(miaSaleLbl)}</strong>${miaEntraLbl?' · Entró a <strong style="color:var(--text2);">'+escHtml(miaEntraLbl)+'</strong>':''}</span></div>`:''}
        <div class="gasto-item-meta">
          <span class="badge ${esEntrada?'bg-blue':esAbonoPrestamo?'bg-amber':esTcEncargo?'bg-blue':'bg-red'}" style="font-size:9px;">${esEntrada?'Entrada':esAbonoPrestamo?'Pago préstamo':esTcEncargo?'Pagado con TC':'Salida'}</span>
          ${esMia?`<span class="badge" style="font-size:9px;background:rgba(240,184,64,.15);color:var(--amber);border:none;">Yo puse la plata</span>`:''}
          ${lblCuenta?`<span class="badge ${fuenteBadgeClass(m.cuenta)}" style="font-size:9px;">${lblCuenta}</span>`:''}
          ${tcNombreLbl?`<span class="badge bg-blue" style="font-size:9px;">${escHtml(tcNombreLbl)}</span>`:''}
        </div>
        ${typeof _difRenderHistorial === 'function' ? _difRenderHistorial(m) : ''}
      </div>`;
    }).join('');
    histEl.innerHTML = html;
  }
}

/* ── PARTES COMPROMETIDAS DEL ENCARGO ─────────────────────────────────── */
let _parteEditId = null;

function renderEncargoParts(enc) {
  const el = document.getElementById('encargo-partes-lista');
  if (!el) return;
  const partes = (enc.partes || []).filter(p => !p.usada);
  const usadas = (enc.partes || []).filter(p => p.usada);
  const saldo = encargoSaldo(enc);
  const totalComp = partes.reduce((a, p) => a + (p.monto || 0), 0);
  const libre = Math.max(0, saldo - totalComp);

  if (!partes.length && !usadas.length) {
    el.innerHTML = `<div style="font-size:11px;color:var(--text3);padding:4px 0 10px;line-height:1.6;">
      Toda la plata está sin asignar — <b style="color:var(--text2);">tuyo para usar: ${fmt(saldo)}</b>.
      <br>Agrega partes para saber cuánto de este encargo ya tiene destino.
    </div>`;
    return;
  }

  // Resumen rápido
  let html = '';
  if (partes.length) {
    html += `<div style="background:rgba(96,176,240,.07);border:1px solid rgba(96,176,240,.2);border-radius:var(--radius-sm);padding:10px 12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.7px;font-family:'DM Mono',monospace;margin-bottom:2px;">Comprometido</div>
        <div style="font-size:15px;font-weight:700;font-family:'DM Mono',monospace;color:var(--red);">-${fmt(totalComp)}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.7px;font-family:'DM Mono',monospace;margin-bottom:2px;">Libre (de él)</div>
        <div style="font-size:15px;font-weight:700;font-family:'DM Mono',monospace;color:var(--accent);">+${fmt(libre)}</div>
      </div>
    </div>`;
  }

  // Lista activas
  html += partes.map(p => {
    const hoyStr = hoy();
    let fechaInfo = '';
    if (p.fecha) {
      const dias = Math.round((new Date(p.fecha + 'T00:00:00') - new Date(hoyStr + 'T00:00:00')) / 86400000);
      if (dias < 0) fechaInfo = `<span style="font-size:9px;color:var(--red);">venció hace ${Math.abs(dias)}d</span>`;
      else if (dias === 0) fechaInfo = `<span style="font-size:9px;color:var(--red);">hoy</span>`;
      else if (dias === 1) fechaInfo = `<span style="font-size:9px;color:var(--amber);">mañana</span>`;
      else if (dias <= 5) fechaInfo = `<span style="font-size:9px;color:var(--amber);">en ${dias}d (${p.fecha})</span>`;
      else fechaInfo = `<span style="font-size:9px;color:var(--text3);">uso: ${p.fecha}</span>`;
    }
    return `<div class="card card-sm" style="margin-bottom:7px;border-color:rgba(96,176,240,.25);">
      <div style="display:flex;align-items:center;gap:8px;">
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:600;">${escHtml(p.desc)}</div>
          ${fechaInfo ? `<div style="margin-top:2px;">${fechaInfo}</div>` : ''}
        </div>
        <div style="font-size:14px;font-weight:700;font-family:'DM Mono',monospace;color:var(--blue);white-space:nowrap;">${fmt(p.monto)}</div>
      </div>
      <div style="display:flex;gap:6px;margin-top:8px;">
        <button type="button" ${Events.attr('encargos:usarParte', enc.id, p.id)} style="flex:1;padding:7px 0;border-radius:var(--radius-sm);font-size:11px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;border:1.5px solid rgba(200,240,96,.4);background:rgba(200,240,96,.08);color:var(--accent);">
          <i class="fa-solid fa-check" style="margin-right:4px;"></i>Ya la usé
        </button>
        <button type="button" ${Events.attr('encargos:editarParte', enc.id, p.id)} style="padding:7px 11px;border-radius:var(--radius-sm);font-size:11px;cursor:pointer;border:1.5px solid var(--border2);background:transparent;color:var(--text2);">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button type="button" ${Events.attr('encargos:eliminarParte', enc.id, p.id)} style="padding:7px 11px;border-radius:var(--radius-sm);font-size:11px;cursor:pointer;border:1.5px solid rgba(240,104,104,.3);background:rgba(240,104,104,.06);color:var(--red);">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </div>`;
  }).join('');

  // Usadas recientes
  if (usadas.length) {
    html += `<div style="margin-top:6px;">`;
    html += usadas.slice(-3).reverse().map(p => `<div class="card card-sm" style="margin-bottom:5px;opacity:.5;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div style="font-size:11px;color:var(--text2);">${escHtml(p.desc)}</div>
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-size:11px;font-family:'DM Mono',monospace;color:var(--text2);"><s>${fmt(p.monto)}</s></span>
          ${typeof _difRenderHistorialParte === 'function' ? _difRenderHistorialParte(p) : ''}
          <button type="button" ${Events.attr('encargos:eliminarParte', enc.id, p.id)} style="font-size:9px;padding:2px 6px;border-radius:5px;border:1px solid rgba(240,104,104,.2);background:rgba(240,104,104,.05);color:var(--red);cursor:pointer;">&#x2715;</button>
        </div>
      </div>
    </div>`).join('');
    html += `</div>`;
  }

  el.innerHTML = html;
}

function abrirNuevaParte() {
  const enc = getEncargo(encargoActualId);
  if (!enc) return;
  _parteEditId = null;
  document.getElementById('parte-sheet-title').textContent = 'Agregar parte';
  document.getElementById('parte-desc').value = '';
  document.getElementById('parte-monto').value = '';
  document.getElementById('parte-fecha').value = '';
  _actualizarPartePreview(enc);
  openSheet('parte-encargo');
  setTimeout(() => { const d = document.getElementById('parte-desc'); if(d) d.focus(); }, 200);
}

function editarParte(encId, parteId) {
  const enc = getEncargo(encId);
  if (!enc) return;
  const parte = (enc.partes || []).find(p => p.id === parteId);
  if (!parte) return;
  encargoActualId = encId;
  _parteEditId = parteId;
  document.getElementById('parte-sheet-title').textContent = 'Editar parte';
  document.getElementById('parte-desc').value = parte.desc || '';
  if (typeof fmtInput === 'function') document.getElementById('parte-monto').value = fmtInput(parte.monto || 0);
  else document.getElementById('parte-monto').value = String(parte.monto || 0).replace('.', ',');
  document.getElementById('parte-fecha').value = parte.fecha || '';
  _actualizarPartePreview(enc);
  openSheet('parte-encargo');
}

function _actualizarPartePreview(enc) {
  const prevEl = document.getElementById('parte-balance-preview');
  if (!prevEl) return;
  const saldo = encargoSaldo(enc);
  const partes = (enc.partes || []).filter(p => !p.usada && p.id !== _parteEditId);
  const yaComp = partes.reduce((a, p) => a + (p.monto || 0), 0);
  const libre = saldo - yaComp;
  prevEl.textContent = 'Saldo del encargo: ' + fmt(saldo) + ' · Ya comprometido: ' + fmt(yaComp) + ' · Libre: ' + fmt(Math.max(0, libre));
}

function cerrarPartSheet() {
  _parteEditId = null;
}

function guardarParte() {
  const enc = getEncargo(encargoActualId);
  if (!enc) return;
  const desc = (document.getElementById('parte-desc').value || '').trim();
  if (!desc) { toast('Escribí para qué es', 'err'); return; }
  const montoStr = document.getElementById('parte-monto').value || '';
  const monto = typeof parseMoney === 'function' ? parseMoney(montoStr) : parseFloat(montoStr.replace(/\./g, '').replace(',', '.'));
  if (!monto || monto <= 0) { toast('Ingresá el monto', 'err'); return; }
  const fecha = document.getElementById('parte-fecha').value || '';

  // Validar que no sobrepase el saldo
  const saldo = encargoSaldo(enc);
  const otrasPartes = (enc.partes || []).filter(p => !p.usada && p.id !== _parteEditId).reduce((a, p) => a + (p.monto || 0), 0);
  if (otrasPartes + monto > saldo + 0.01) {
    toast('El total comprometido supera el saldo del encargo (' + fmt(saldo) + ')', 'err'); return;
  }

  if (!enc.partes) enc.partes = [];
  if (_parteEditId) {
    const p = enc.partes.find(x => x.id === _parteEditId);
    if (p) { p.desc = desc; p.monto = monto; p.fecha = fecha; }
    toast('Parte actualizada', 'ok');
  } else {
    enc.partes.push({ id: uid(), desc, monto, fecha, usada: false, creadaEn: hoy() });
    toast('Parte agregada', 'ok');
  }
  save();
  closeSheet('parte-encargo');
  _parteEditId = null;
  abrirEncargoDetalle(encargoActualId);
}

async function usarParte(encId, parteId) {
  // Abre el sheet de "Ya la usé" con opción de diferencial
  abrirUsarParteSheet(encId, parteId);
}

async function eliminarParte(encId, parteId) {
  const enc = getEncargo(encId);
  if (!enc) return;
  const ok = await dialogo('Eliminar parte', '¿Eliminar esta parte del registro?', 'Eliminar', true);
  if (!ok) return;
  enc.partes = (enc.partes || []).filter(p => p.id !== parteId);
  save();
  abrirEncargoDetalle(encId);
  toast('Parte eliminada', 'info');
}

// Hook: agregar renderEncargoParts al final de abrirEncargoDetalle
const _origAbrirDetalle = abrirEncargoDetalle;
abrirEncargoDetalle = function(id) {
  _origAbrirDetalle(id);
  const enc = getEncargo(id);
  if (enc) renderEncargoParts(enc);
  // Listener para preview en tiempo real del monto
  const montoInput = document.getElementById('parte-monto');
  if (montoInput && !montoInput._parteListenerAdded) {
    montoInput.addEventListener('input', () => {
      const e = getEncargo(encargoActualId);
      if (e) _actualizarPartePreview(e);
    });
    montoInput._parteListenerAdded = true;
  }
};

function volverEncargosLista() {
  encargoActualId = null;
  document.getElementById('encargoDetalle').style.display = 'none';
  document.getElementById('encargosListView').style.display = '';
  renderEncargosList();
}

function crearEncargo() {
  const nombre = document.getElementById('enc_nombre').value.trim();
  if (!nombre) { toast('Ingresa el nombre de la persona', 'err'); return; }
  const saldoIni = parseMoney(document.getElementById('enc_saldo').value)||0;
  const cuentaIni = document.getElementById('enc_cuenta_ini').value || '';
  const nota = document.getElementById('enc_nota').value.trim();
  if (!S.encargos) S.encargos = [];
  S.encargos.push({
    id: uid(),
    nombre,
    nota,
    saldoInicial: saldoIni,
    cuentaInicial: cuentaIni,
    fechaCreacion: hoy(),
    movimientos: []
  });
  document.getElementById('enc_nombre').value = '';
  document.getElementById('enc_saldo').value = '';
  document.getElementById('enc_nota').value = '';
  document.getElementById('enc_cuenta_ini').value = '';
  document.getElementById('enc_cuenta_wrap').style.display = 'none';
  save(); renderEncargosList();
  closeSheet('nuevo-encargo');
  if(window.logCambio){const _enomEl=document.getElementById('enc_nombre');logCambio('Creaste un encargo',_enomEl?_enomEl.value:'','','editar');}
  toast('Encargo creado', 'ok');
}

/* ═══════════════════════════════════════════════════════════════
   INSTANCIA 1 — "Salió plata" de un encargo (movenc-dif)
   ═══════════════════════════════════════════════════════════════ */

diffRegistrarInstancia('movenc', {
  ids: {
    wrap: 'movenc-dif-wrap', body: 'movenc-dif-body', icon: 'movenc-dif-toggle-icon',
    real: 'movenc_dif_real', partesList: 'movenc-dif-beneficiarios',
    resumen: 'movenc-dif-resumen', miCuentaWrap: 'movenc-dif-mi-cuenta-wrap', miCuenta: 'movenc_dif_mi_cuenta'
  },
  permiteBeneficiarios: true,
  permiteIntercambio: true,
  permiteMiCuenta: true,
  getDijo: () => parseMoney(document.getElementById('movenc_monto')?.value) || 0,
  descMargen: () => 'Margen de encargo — '
});

// Wrappers con los nombres viejos — el HTML del sheet sigue llamándolos igual, cero cambios de markup
function _difToggle() { diffToggle('movenc'); }
function _difAddBenef() { diffAddParte('movenc'); }
function _difRemoveBenef(i) { diffRemoveParte('movenc', i); }
function _difSetNombre(i, v) { diffSetNombre('movenc', i, v); }
function _difSetMonto(i, v) { diffSetMonto('movenc', i, v); }
function _difTogglePagoYo(i) { diffTogglePagoYo('movenc', i); }
function _difSetCuentaSalida(i, v) { diffSetCuentaSalida('movenc', i, v); }
function _difSetCuentaEntrada(i, v) { diffSetCuentaEntrada('movenc', i, v); }
function _difResumen() { diffResumen('movenc'); }
function _validarIntercambiosBenefs() { return diffValidarIntercambios('movenc'); }
// _difBenefs expuesto como alias en vivo por compatibilidad (algo viejo podría leer/asignar esta variable)
Object.defineProperty(window, '_difBenefs', { get() { return diffInst('movenc').partes; }, set(v) { diffInst('movenc').partes = v; } });

/* ─── "Yo puse la plata" — intercambio simple sin diferencial ─────
   Para cuando lo que dijiste = lo real, pero la plata no salió de la
   cuenta del encargo elegida arriba sino de tu bolsillo, y querés
   recuperar ese monto del encargo en una de tus cuentas.
   Genera el mismo par de transferencias _intercambioSalida/_intercambioEntrada
   que el sistema de "lo pagué yo" del diferencial, pero por el monto total
   del movimiento y sin tocar _difBenefs.
   ═══════════════════════════════════════════════════════════════ */

function _movEncMiaToggle() {
  const body = document.getElementById('movenc-mia-body');
  const icon = document.getElementById('movenc-mia-icon');
  if (!body) return;
  const abierto = body.style.display !== 'none';
  body.style.display = abierto ? 'none' : '';
  if (icon) { icon.textContent = abierto ? '›' : '‹'; icon.style.transform = abierto ? '' : 'rotate(90deg)'; }
  if (!abierto) {
    const saleSel  = document.getElementById('movenc_mia_cuenta_sale');
    const entraSel = document.getElementById('movenc_mia_cuenta_entra');
    if (saleSel)  saleSel.innerHTML  = _diffFuentesOptsHtml(saleSel.value, true);
    if (entraSel) entraSel.innerHTML = _diffFuentesOptsHtml(entraSel.value, false);
    _movEncMiaPreview();
  }
}

function _movEncMiaPreview() {
  const el = document.getElementById('movenc-mia-preview');
  if (!el) return;
  const monto = parseMoney(document.getElementById('movenc_monto').value) || 0;
  if (!monto) { el.textContent = ''; return; }
  const sale  = document.getElementById('movenc_mia_cuenta_sale').value;
  const entra = document.getElementById('movenc_mia_cuenta_entra').value;
  const saleTxt  = sale  ? escHtml(fuenteLabel(sale))  : '?';
  const entraTxt = entra ? escHtml(fuenteLabel(entra)) : '?';
  el.innerHTML = `↔ Sale ${fmt(monto)} de ${saleTxt} · Recupero ${fmt(monto)} en ${entraTxt}`;
}

function _validarMovEncMia() {
  const body = document.getElementById('movenc-mia-body');
  if (!body || body.style.display === 'none') return null;
  const monto = parseMoney(document.getElementById('movenc_monto').value) || 0;
  const sale  = document.getElementById('movenc_mia_cuenta_sale').value;
  if (!monto) return null;
  if (!sale) return 'Elegí de qué cuenta tuya salió la plata';
  const saldo = getSaldoFuente(sale);
  if (monto > saldo + 0.5) {
    return `No tenés ${fmt(monto)} en ${escHtml(fuenteLabel(sale))}. Disponible: ${fmt(saldo)}.`;
  }
  return null;
}

function _procesarMovEncMia(movimiento) {
  const body = document.getElementById('movenc-mia-body');
  if (!body || body.style.display === 'none') return;
  const sale  = document.getElementById('movenc_mia_cuenta_sale').value;
  const entra = document.getElementById('movenc_mia_cuenta_entra').value;
  if (!sale) return;
  const monto = movimiento.monto;
  const fecha = movimiento.fecha || hoy();
  if (!S.movimientos) S.movimientos = [];

  // Egreso de mi cuenta propia (lo que puse de mi bolsillo)
  descontarFuente(sale, monto);
  S.movimientos.push({
    id: uid(),
    tipo: 'transferencia',
    fuente: sale,
    _fuenteDestino: entra || '',
    _encMovId: movimiento.id,
    _esIntercambioEncargo: true,
    _intercambioSalida: true,
    _secundario: true,
    _origenSeccion: 'Encargos',
    monto,
    fecha,
    desc: `Yo puse la plata: ${escHtml(movimiento.desc || '')}`,
    nota: `Salida de ${fuenteLabel(sale)} — generado automáticamente al registrar "Yo puse la plata" en encargo.`,
    ts: Date.now() + 1
  });

  // Ingreso a mi cuenta destino (lo que recupero del encargo)
  if (entra) {
    sumarFuente(entra, monto);
    S.movimientos.push({
      id: uid(),
      tipo: 'transferencia',
      fuente: entra,
      _fuenteDestino: sale,
      _encMovId: movimiento.id,
      _esIntercambioEncargo: true,
      _intercambioEntrada: true,
      _secundario: true,
      _origenSeccion: 'Encargos',
      monto,
      fecha,
      desc: `Recupero de encargo: ${escHtml(movimiento.desc || '')}`,
      nota: `Entrada a ${fuenteLabel(entra)} — generado automáticamente al registrar "Yo puse la plata" en encargo.`,
      ts: Date.now() + 2
    });
  }

  movimiento._miaCuentaSale = sale;
  if (entra) movimiento._miaCuentaEntra = entra;
}

function _procesarDiferencial(movimiento) {
  diffAplicar('movenc', movimiento, movimiento.id);
}


/* ─── Diferencial en "Ya la usé" ────────────────────────────── */
/* ─── Diferencial en "Ya la usé" — instancia del motor común ───── */
let _usarParteEncId = null;
let _usarParteId    = null;

diffRegistrarInstancia('usarParte', {
  ids: {
    wrap: 'usar-parte-dif-wrap', body: 'usar-parte-dif-body', icon: 'usar-parte-dif-icon',
    real: 'usar_parte_dif_real', partesList: 'usar-parte-dif-benefs',
    resumen: 'usar-parte-dif-resumen', miCuentaWrap: 'usar-parte-dif-mi-cuenta-wrap', miCuenta: 'usar_parte_dif_mi_cuenta'
  },
  permiteBeneficiarios: true,
  permiteIntercambio: false, // "Ya la usé" no soporta intercambio "lo pagué yo" — el dinero ya estaba en el encargo
  permiteMiCuenta: true,
  // El "dijo" de esta instancia viene de la parte del encargo, no de un input del DOM
  getDijo: () => {
    const enc = _usarParteEncId ? getEncargo(_usarParteEncId) : null;
    const parte = enc ? (enc.partes || []).find(p => p.id === _usarParteId) : null;
    return parte ? (parte.monto || 0) : 0;
  },
  descMargen: (mov) => `Margen encargo ${mov._encNombre || ''} — `
});

// Wrappers con los nombres viejos — el HTML del sheet sigue llamándolos igual
function _usarParteDifToggle() { diffToggle('usarParte'); }
function _usarParteAddBenef() { diffAddParte('usarParte'); }
function _usarParteRemoveBenef(i) { diffRemoveParte('usarParte', i); }
function _usarParteSetNombre(i, v) { diffSetNombre('usarParte', i, v); }
function _usarParteSetMonto(i, v) { diffSetMonto('usarParte', i, v); }
function _usarParteDifResumen() { diffResumen('usarParte'); }

/* ─── Fuente (origen) en "Ya la usé" ──────────────────────────── */
let _usarParteSplitMode = false;
let _usarParteMargenPendiente = null;

crearSplitWidget('usarParte', {
  simpleId:'usarParteModoSimple', splitId:'usarParteModoDividido', toggleId:'usarParteSplitToggle', rowsId:'usarParteSplitRows',
  getModo:()=>_usarParteSplitMode, setModo:v=>{_usarParteSplitMode=v;},
  getFuentesFn:_getUsarParteFuentesOptions,
  onPreview:_usarParteFuentePreview
});

function _usarParteSplitToggle(){ splitToggle('usarParte'); }

function _getUsarParteFuentesOptions(selectedVal) {
  const enc = _usarParteEncId ? getEncargo(_usarParteEncId) : null;
  const fuentesConSaldo = enc ? _getEncargoSaldoPorCuenta(enc) : [];
  // Solo mostrar las cuentas donde el encargo tiene plata guardada.
  // Los items de fuentesConSaldo tienen { cuenta, label, saldo } — buildFuentesOptsHtml
  // los normaliza via { val: f.val ?? f.cuenta }.
  return buildFuentesOptsHtml({ selectedVal, mostrarSaldo: true, fuentesCustom: fuentesConSaldo });
}

function _usarParteAgregarSplitRow(){ splitAgregarRow('usarParte'); }

function _getUsarParteSplitData(){ return splitGetData('usarParte'); }

function _usarParteFuentePreview() {
  const el = document.getElementById('usar-parte-fuente-preview');
  if (!el) return;
  const enc = _usarParteEncId ? getEncargo(_usarParteEncId) : null;
  const parte = enc ? (enc.partes || []).find(p => p.id === _usarParteId) : null;
  const monto = parte ? (parte.monto || 0) : 0;
  if (!monto) { el.textContent = ''; return; }

  if (_usarParteSplitMode) {
    const splits = _getUsarParteSplitData();
    const total = splits.reduce((a, s) => a + s.monto, 0);
    const restante = monto - total;
    if (splits.length === 0) { el.textContent = ''; return; }
    let lines = splits.map(s => `${s.fuente ? fuenteLabel(s.fuente) : 'Sin esp.'}: ${fmt(s.monto)}`).join(' · ');
    if (restante > 0) { el.textContent = lines + ` · Sin asignar: ${fmt(restante)}`; el.style.color = 'var(--amber)'; }
    else if (restante < -0.5) { el.textContent = lines + ` · Excede: ${fmt(-restante)}`; el.style.color = 'var(--red)'; }
    else { el.textContent = lines + ' &#x2713;'; el.style.color = 'var(--accent)'; }
  } else {
    const sel = document.getElementById('usar_parte_fuente');
    const val = sel ? sel.value : '';
    if (val) {
      const enc2 = _usarParteEncId ? getEncargo(_usarParteEncId) : null;
      const saldoEnc = enc2 ? _getEncargoSaldoEnCuenta(enc2, val) : 0;
      el.innerHTML = `Del encargo guardado en ${escHtml(fuenteLabel(val))}: <span style="color:var(--text)">${fmt(saldoEnc)}</span>`;
      el.style.color = 'var(--text2)';

    } else {
      el.textContent = '';
    }
  }
}


async function _confirmarUsarParte() {
  const enc = getEncargo(_usarParteEncId);
  if (!enc) return;
  const parte = (enc.partes || []).find(p => p.id === _usarParteId);
  if (!parte) return;

  // Leer origen de la plata (fuente simple o split)
  let fuentesOrigen = [];
  if (_usarParteSplitMode) {
    fuentesOrigen = _getUsarParteSplitData();
  } else {
    const sel = document.getElementById('usar_parte_fuente');
    const val = sel ? sel.value : '';
    if (val) fuentesOrigen = [{ fuente: val, monto: parte.monto }];
  }

  // Validar que el saldo del encargo en esa cuenta alcance
  for (const f of fuentesOrigen) {
    if (!f.fuente) continue;
    const saldoEnc = _getEncargoSaldoEnCuenta(enc, f.fuente);
    if (f.monto > saldoEnc + 0.5) {
      toast(`El encargo solo tiene ${fmt(saldoEnc)} guardado en ${escHtml(fuenteLabel(f.fuente))}`, 'err');
      return;
    }
  }

  // Guardar diferencial y mover margen a cuenta propia si aplica — vía el motor común.
  // Nota: el sumarFuente/push del margen se difiere a _usarParteMargenPendiente (ver más abajo)
  // para que su uid() salga después de los movimientos de salida del encargo, igual que antes.
  if (diffEstaAbierto('usarParte')) {
    const calc = diffCalcular('usarParte');
    if (calc.real > 0) {
      const { dijo, real, margen, normales, asignadoNormal } = calc;
      const benefs = normales.map(b => ({ nombre: b.nombre, monto: b.monto }));
      const yoMeQuedo = Math.max(0, margen - asignadoNormal);

      const miCuentaSel = document.getElementById('usar_parte_dif_mi_cuenta');
      const miCuenta = miCuentaSel ? miCuentaSel.value : '';

      parte.diferencial = {
        dijo, real, margen,
        beneficiarios: benefs,
        miCuenta: (miCuenta && yoMeQuedo > 0.5) ? miCuenta : '',
        yoMeQuedo: (miCuenta && yoMeQuedo > 0.5) ? yoMeQuedo : 0
      };

      if (miCuenta && yoMeQuedo > 0.5) {
        sumarFuente(miCuenta, yoMeQuedo);
        _usarParteMargenPendiente = { fuente: miCuenta, monto: yoMeQuedo };
      }
    }
  }

  // Guardar origen en la parte
  if (fuentesOrigen.length === 1 && fuentesOrigen[0].fuente) {
    parte.fuente = fuentesOrigen[0].fuente;
    delete parte.fuentes;
  } else if (fuentesOrigen.length > 1) {
    parte.fuentes = fuentesOrigen;
    delete parte.fuente;
  }

  // Registrar la salida en los movimientos del encargo (descuenta del saldo del encargo en esa cuenta)
  if (fuentesOrigen.length > 0) {
    if (!enc.movimientos) enc.movimientos = [];
    if (fuentesOrigen.length === 1 && fuentesOrigen[0].fuente) {
      enc.movimientos.push({
        id: uid(),
        tipo: 'salida',
        monto: parte.monto,
        cuenta: fuentesOrigen[0].fuente,
        desc: `Parte usada: ${escHtml(parte.desc)}`,
        fecha: hoy(),
        _parteId: parte.id
      });
    } else if (fuentesOrigen.length > 1) {
      fuentesOrigen.forEach(f => {
        if (f.fuente && f.monto > 0) {
          enc.movimientos.push({
            id: uid(),
            tipo: 'salida',
            monto: f.monto,
            cuenta: f.fuente,
            desc: `Parte usada: ${escHtml(parte.desc)}`,
            fecha: hoy(),
            _parteId: parte.id
          });
        }
      });
    }
  }

  parte.usada = true;
  parte.usadaEn = hoy();

  // Registrar el ingreso del margen al final, para que su uid() sea mayor que los de salida del encargo
  if (_usarParteMargenPendiente) {
    const { fuente, monto } = _usarParteMargenPendiente;
    if (!S.movimientos) S.movimientos = [];
    S.movimientos.push({
      id: uid(),
      tipo: 'entrada',
      fuente,
      monto,
      fecha: hoy(),
      desc: `Margen encargo ${escHtml(enc.nombre)} — ${escHtml(parte.desc)}`
    });
    _usarParteMargenPendiente = null;
  }

  save();
  closeSheet('usar-parte');
  abrirEncargoDetalle(_usarParteEncId);
  toast('Listo — esa parte ya no está comprometida', 'ok');
}

function abrirUsarParteSheet(encId, parteId) {
  const enc = getEncargo(encId);
  if (!enc) return;
  const parte = (enc.partes || []).find(p => p.id === parteId);
  if (!parte) return;
  _usarParteEncId = encId;
  _usarParteId = parteId;

  const infoEl = document.getElementById('usar-parte-info');
  if (infoEl) infoEl.textContent = `"${escHtml(parte.desc)}" · Le dijiste: ${fmt(parte.monto)}`;

  // Reset fuente/split
  _usarParteSplitMode = false;
  document.getElementById('usarParteModoSimple').style.display = '';
  document.getElementById('usarParteModoDividido').style.display = 'none';
  document.getElementById('usarParteSplitRows').innerHTML = '';
  const splitBtn = document.getElementById('usarParteSplitToggle');
  if (splitBtn) {
    splitBtn.textContent = 'Dividir ÷';
    splitBtn.style.background = 'rgba(200,240,96,.1)';
    splitBtn.style.borderColor = 'rgba(200,240,96,.3)';
    splitBtn.style.color = 'var(--accent)';
  }
  // Poblar select con fuentes, preseleccionando la de mayor saldo en el encargo
  const sel = document.getElementById('usar_parte_fuente');
  if (sel) {
    sel.innerHTML = _getUsarParteFuentesOptions('');
    // Preseleccionar la cuenta con más saldo del encargo
    const cuentasConSaldo = _getEncargoSaldoPorCuenta(enc);
    if (cuentasConSaldo.length > 0) {
      sel.value = cuentasConSaldo[0].cuenta;
    }
    sel.onchange = _usarParteFuentePreview;
  }
  const prevEl = document.getElementById('usar-parte-fuente-preview');
  if (prevEl) { prevEl.textContent = ''; }
  _usarParteFuentePreview();

  // Reset diferencial
  diffReset('usarParte');

  openSheet('usar-parte');
}

function _difRenderHistorialParte(parte) {
  let out = '';
  // Mostrar origen de la plata si se registró
  if (parte.fuentes && parte.fuentes.length > 0) {
    const labels = parte.fuentes.map(f => `${escHtml(fuenteLabel(f.fuente))} ${fmt(f.monto)}`).join(' + ');
    out += `<span style="margin-left:5px;padding:2px 7px;background:rgba(96,176,240,.1);border-radius:5px;font-size:9px;color:var(--blue);"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" style="width:11px;height:11px;fill:currentColor;vertical-align:middle;"><path fill-rule="evenodd" d="M7.646 1.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 2.707V11.5a.5.5 0 0 1-1 0V2.707L5.354 4.854a.5.5 0 1 1-.708-.708l3-3z"/><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/></svg> ${labels}</span>`;
  } else if (parte.fuente) {
    out += `<span style="margin-left:5px;padding:2px 7px;background:rgba(96,176,240,.1);border-radius:5px;font-size:9px;color:var(--blue);"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" style="width:11px;height:11px;fill:currentColor;vertical-align:middle;"><path fill-rule="evenodd" d="M7.646 1.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 2.707V11.5a.5.5 0 0 1-1 0V2.707L5.354 4.854a.5.5 0 1 1-.708-.708l3-3z"/><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/></svg> ${escHtml(fuenteLabel(parte.fuente))}</span>`;
  }
  // Mostrar diferencial si existe
  if (parte.diferencial) {
    const d = parte.diferencial;
    const benefs = (d.beneficiarios || []).filter(b => b.nombre).map(b =>
      `${escHtml(b.nombre)} ${fmt(b.monto)}`
    ).join(' · ');
    const miParte = d.miCuenta && d.yoMeQuedo > 0 ? `Yo (${escHtml(fuenteLabel(d.miCuenta))}) ${fmt(d.yoMeQuedo)}` : '';
    const todas = [benefs, miParte].filter(Boolean).join(' · ');
    out += `<span style="margin-left:5px;padding:2px 7px;background:rgba(240,184,64,.12);border-radius:5px;font-size:9px;color:var(--amber);"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" style="width:15px;height:15px;fill:currentColor;vertical-align:middle;"><path d="M8 1a.5.5 0 0 1 .5.5V2h1a.75.75 0 0 1 0 1.5H8.5v1h.75a2.25 2.25 0 0 1 0 4.5H8.5V10h1a.75.75 0 0 1 0 1.5H8.5v.5a.5.5 0 0 1-1 0V11.5H6.75a.75.75 0 0 1 0-1.5H7.5V9H6.5A2.25 2.25 0 0 1 4.25 6.75v-.5A.75.75 0 0 1 5 5.5h2.5V4H6.5a.75.75 0 0 1 0-1.5H7.5V1.5A.5.5 0 0 1 8 1zM5.75 6.75A.75.75 0 0 0 6.5 7.5H7.5V6H6.5a.75.75 0 0 0-.75.75zM8.5 9v1.5h.25A.75.75 0 0 0 8.5 9z"/><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.2"/></svg> margen ${fmt(d.margen)}${todas ? ': ' + todas : ''}</span>`;
  }
  return out;
}

function abrirMovEncargo(tipo) {
  const enc = getEncargo(encargoActualId);
  if (!enc) return;
  movEncargoTipo = tipo;
  const saldo = encargoSaldo(enc);
  if (tipo === 'salida' && saldo <= 0) { toast('El encargo no tiene saldo disponible', 'err'); return; }
  document.getElementById('movEncTitle').textContent = tipo==='entrada'?'Registrar entrada de plata':'Registrar salida de plata';
  document.getElementById('movEncNombre').textContent = enc.nombre;
  document.getElementById('movEncSaldo').textContent = fmt(saldo);
  document.getElementById('movenc_desc').value = '';
  document.getElementById('movenc_monto').value = '';
  document.getElementById('movenc_nota').value = '';
  document.getElementById('movenc_fecha').value = hoy();

  // Resetear modo split
  _movEncSplitMode = false;
  const splitToggleBtn = document.getElementById('movenc_split_toggle');
  const simpleModo     = document.getElementById('movenc_cuenta_simple');
  const splitModo      = document.getElementById('movenc_cuenta_split');
  const splitPreview   = document.getElementById('movenc_split_preview');
  if (splitToggleBtn) { splitToggleBtn.textContent = 'Dividir ÷'; splitToggleBtn.style.background='rgba(200,240,96,.1)'; splitToggleBtn.style.borderColor='rgba(200,240,96,.3)'; splitToggleBtn.style.color='var(--accent)'; }
  if (simpleModo) simpleModo.style.display = '';
  if (splitModo)  { splitModo.style.display = 'none'; document.getElementById('movencSplitRows').innerHTML = ''; }
  if (splitPreview) splitPreview.textContent = '';

  // Poblar select de cuentas (modo simple)
  const sel = document.getElementById('movenc_cuenta');

  // Cambiar label según tipo y mostrar/ocultar botón dividir
  const label = document.getElementById('movenc_cuenta_label');
  if (tipo === 'entrada') {
    // Entrada: mostrar fuentes reales (sin TC — no se puede guardar plata ajena en una TC)
    const fuentes = getFuentesSinTC();
    sel.innerHTML = '<option value="">Sin especificar</option>' + fuentes.map(f=>`<option value="${f.val}">${f.label}</option>`).join('');
    label.textContent = '¿En qué cuenta guardaste esa plata?';
    if (splitToggleBtn) splitToggleBtn.style.display = 'none';
  } else {
    // Salida: solo cuentas donde el encargo tiene plata
    const cuentasConSaldo = _getEncargoSaldoPorCuenta(enc);
    if (cuentasConSaldo.length === 0) {
      // Si no hay distribución por cuenta, mostrar todas (sin TC)
      const fuentes = getFuentesSinTC();
      sel.innerHTML = '<option value="">Sin especificar</option>' + fuentes.map(f=>`<option value="${f.val}">${f.label}</option>`).join('');
    } else {
      sel.innerHTML = '<option value="">Sin especificar</option>' +
        cuentasConSaldo.map(f=>`<option value="${f.cuenta}">${f.label} (${fmt(f.saldo)})</option>`).join('');
    }
    label.textContent = '¿De qué cuenta sacaste esa plata?';
    if (splitToggleBtn) splitToggleBtn.style.display = '';
    // Pre-seleccionar la cuenta con más saldo del encargo
    if (cuentasConSaldo.length > 0) {
      sel.value = cuentasConSaldo[0].cuenta;
      _actualizarMovEncCuentaHint(enc, cuentasConSaldo[0].cuenta);
    }
  }

  // Listener para mostrar saldo de encargo en esa cuenta
  sel.onchange = function() { _actualizarMovEncCuentaHint(enc, sel.value); };

  // Mostrar/ocultar diferencial según tipo
  const difWrap = document.getElementById('movenc-dif-wrap');
  if (difWrap) {
    if (tipo === 'salida') {
      difWrap.style.display = '';
      diffReset('movenc');
    } else {
      difWrap.style.display = 'none';
    }
  }

  // Mostrar/ocultar y resetear "Yo puse la plata" según tipo
  const miaWrap = document.getElementById('movenc-mia-wrap');
  const miaBody = document.getElementById('movenc-mia-body');
  const miaIcon = document.getElementById('movenc-mia-icon');
  if (miaWrap) {
    if (tipo === 'salida') {
      miaWrap.style.display = '';
      if (miaBody) miaBody.style.display = 'none';
      if (miaIcon) { miaIcon.textContent = '›'; miaIcon.style.transform = ''; }
      const saleSel  = document.getElementById('movenc_mia_cuenta_sale');
      const entraSel = document.getElementById('movenc_mia_cuenta_entra');
      if (saleSel)  saleSel.value  = '';
      if (entraSel) entraSel.value = '';
      const miaPrev = document.getElementById('movenc-mia-preview');
      if (miaPrev) miaPrev.textContent = '';
    } else {
      miaWrap.style.display = 'none';
    }
  }

  // Style the confirm button
  const btn = document.getElementById('btn-confirmar-mov-encargo');
  if (tipo === 'entrada') {
    btn.style.background = 'rgba(96,176,240,.25)';
    btn.style.color = 'var(--blue)';
    btn.style.border = '1px solid rgba(96,176,240,.5)';
    btn.style.boxShadow = 'none';
  } else {
    btn.style.background = 'rgba(240,104,104,.85)';
    btn.style.color = '#fff';
    btn.style.border = 'none';
    btn.style.boxShadow = 'none';
  }
  openSheet('mov-encargo');
}

function _actualizarMovEncCuentaHint(enc, cuentaVal) {
  const hint = document.getElementById('movenc_cuenta_hint');
  if (!hint) return;
  if (!cuentaVal) { hint.textContent = ''; return; }
  const saldoEnCuenta = _getEncargoSaldoEnCuenta(enc, cuentaVal);
  hint.textContent = 'Del encargo en esta cuenta: ' + fmt(saldoEnCuenta);
}

/* ─── Split de fuente en "Retirar plata" del encargo ─────────────── */
let _movEncSplitMode = false;

crearSplitWidget('movenc', {
  simpleId:'movenc_cuenta_simple', splitId:'movenc_cuenta_split', toggleId:'movenc_split_toggle', rowsId:'movencSplitRows',
  getModo:()=>_movEncSplitMode, setModo:v=>{_movEncSplitMode=v;},
  getFuentesFn:_movEncGetFuentesOptions,
  onPreview:_movEncSplitPreview
});

function _movEncSplitToggle(){ splitToggle('movenc'); }

function _movEncGetFuentesOptions(selectedVal) {
  const enc = encargoActualId ? getEncargo(encargoActualId) : null;
  const cuentasConSaldo = enc ? _getEncargoSaldoPorCuenta(enc) : [];
  // Si el encargo no tiene distribución por cuenta, mostrar todas las fuentes sin saldo.
  // Con distribución, mostrar solo las cuentas del encargo con su saldo.
  if (cuentasConSaldo.length === 0) {
    return buildFuentesOptsHtml({ selectedVal });
  }
  return buildFuentesOptsHtml({ selectedVal, mostrarSaldo: true, fuentesCustom: cuentasConSaldo });
}

function _movEncAgregarSplitRow(){ splitAgregarRow('movenc'); }

function _movEncGetSplitData(){ return splitGetData('movenc'); }

function _movEncSplitPreview() {
  const el = document.getElementById('movenc_split_preview');
  if (el) {
    const montoTotal = parseMoney(document.getElementById('movenc_monto').value) || 0;
    if (!_movEncSplitMode) { el.textContent = ''; }
    else {
      const splits  = _movEncGetSplitData();
      const asignado = splits.reduce((a, s) => a + s.monto, 0);
      const restante = montoTotal - asignado;
      if (splits.length === 0) { el.textContent = ''; }
      else {
        let lines = splits.map(s => `${s.fuente ? fuenteLabel(s.fuente) : 'Sin esp.'}: ${fmt(s.monto)}`).join(' · ');
        if (montoTotal > 0) {
          if (restante > 0.5)       { el.textContent = lines + ` · Sin asignar: ${fmt(restante)}`; el.style.color = 'var(--amber)'; }
          else if (restante < -0.5) { el.textContent = lines + ` · Excede: ${fmt(-restante)}`;     el.style.color = 'var(--red)'; }
          else                      { el.textContent = lines + ' \u2713';                               el.style.color = 'var(--accent)'; }
        } else {
          el.textContent = lines; el.style.color = 'var(--text2)';
        }
      }
    }
  }
  _movEncMiaPreview();
}

function _getEncargoSaldoPorCuenta(enc) {
  // Returns [{cuenta, label, saldo}] sorted by saldo desc
  const map = {};
  // Saldo inicial
  const cuentaIni = enc.cuentaInicial || '';
  if (enc.saldoInicial > 0) {
    const k = cuentaIni || '__sin__';
    map[k] = (map[k]||0) + enc.saldoInicial;
  }
  // Movimientos
  (enc.movimientos||[]).forEach(m => {
    const k = m.cuenta || '__sin__';
    if (m.tipo === 'entrada') map[k] = (map[k]||0) + m.monto;
    else map[k] = (map[k]||0) - m.monto;
  });
  return Object.entries(map)
    .filter(([k,v]) => k !== '__sin__' && v > 0)
    .map(([k,v]) => ({ cuenta: k, label: fuenteLabel(k), saldo: v }))
    .sort((a,b) => b.saldo - a.saldo);
}

function _getEncargoSaldoSinCuenta(enc) {
  // Cuánto del encargo NO está ligado a ninguna cuenta específica ("Sin especificar")
  const cuentaIni = enc.cuentaInicial || '';
  let saldo = 0;
  if (enc.saldoInicial > 0 && !cuentaIni) saldo += enc.saldoInicial;
  (enc.movimientos||[]).forEach(m => {
    if (!m.cuenta) {
      if (m.tipo === 'entrada') saldo += m.monto;
      else saldo -= m.monto;
    }
  });
  return saldo;
}

function _getEncargoSaldoEnCuenta(enc, cuentaVal) {
  const map = {};
  const cuentaIni = enc.cuentaInicial || '';
  if (enc.saldoInicial > 0) {
    const k = cuentaIni || '__sin__';
    map[k] = (map[k]||0) + enc.saldoInicial;
  }
  (enc.movimientos||[]).forEach(m => {
    const k = m.cuenta || '__sin__';
    if (m.tipo === 'entrada') map[k] = (map[k]||0) + m.monto;
    else map[k] = (map[k]||0) - m.monto;
  });
  return map[cuentaVal] || 0;
}

function confirmarMovEncargo() {
  const desc  = document.getElementById('movenc_desc').value.trim();
  const monto = parseMoney(document.getElementById('movenc_monto').value) || 0;
  if (!desc)  { toast('Ingresa una descripción', 'err'); return; }
  if (!monto) { toast('Ingresa un monto válido', 'err'); return; }
  const enc = getEncargo(encargoActualId);
  if (!enc) return;
  if (!enc.movimientos) enc.movimientos = [];

  if (movEncargoTipo === 'salida' && _movEncSplitMode) {
    // ── MODO SPLIT ──────────────────────────────────────────────────
    const splits = _movEncGetSplitData();
    const totalSplit = splits.reduce((a, s) => a + s.monto, 0);
    if (splits.length === 0) { toast('Agrega al menos una cuenta en el split', 'err'); return; }
    if (Math.abs(totalSplit - monto) > 0.5) {
      toast(`La suma del split (${fmt(totalSplit)}) debe ser igual al monto (${fmt(monto)})`, 'err'); return;
    }
    // Validar saldo del encargo total
    const saldoActual = encargoSaldo(enc);
    if (monto > saldoActual) {
      toast(`El saldo del encargo es solo ${fmt(saldoActual)}`, 'err'); return;
    }
    // Validar saldo por cuenta individualmente
    for (const s of splits) {
      if (!s.fuente) continue;
      const saldoEnCuenta = _getEncargoSaldoEnCuenta(enc, s.fuente);
      if (s.monto > saldoEnCuenta + 0.5) {
        toast(`En ${escHtml(fuenteLabel(s.fuente))} solo hay ${fmt(saldoEnCuenta)} de este encargo`, 'err'); return;
      }
    }
    // Validar intercambios antes de registrar
    const _errIntSplit = _validarIntercambiosBenefs();
    if (_errIntSplit) { toast(_errIntSplit, 'err', 5000); return; }
    const _errMiaSplit = _validarMovEncMia();
    if (_errMiaSplit) { toast(_errMiaSplit, 'err', 5000); return; }
    // Registrar un movimiento por cada porción del split
    const fecha = document.getElementById('movenc_fecha').value || hoy();
    const nota  = document.getElementById('movenc_nota').value.trim();
    splits.forEach((s, i) => {
      const mov = {
        id: uid(),
        tipo: 'salida',
        desc,
        monto: s.monto,
        cuenta: s.fuente || '',
        fecha,
        nota,
        ts: Date.now() + i,
        ...(splits.length > 1 ? { _splitTotal: monto, _splitParte: i + 1, _splitDe: splits.length } : {})
      };
      enc.movimientos.push(mov);
      // Procesar diferencial e intercambio "yo puse la plata" solo en el primer movimiento del grupo
      if (i === 0) { _procesarDiferencial(mov); _procesarMovEncMia(mov); }
    });
    save();
    refresh();
    closeSheet('mov-encargo');
    abrirEncargoDetalle(encargoActualId);
    toast('Salida registrada', 'ok');

  } else {
    // ── MODO SIMPLE ──────────────────────────────────────────────────
    const cuenta = document.getElementById('movenc_cuenta').value;
    // Validar que no quede saldo negativo al salir
    if (movEncargoTipo === 'salida') {
      const saldoActual = encargoSaldo(enc);
      if (monto > saldoActual) {
        toast(`El saldo del encargo es solo ${fmt(saldoActual)}`, 'err'); return;
      }
      if (cuenta) {
        const saldoEnCuenta = _getEncargoSaldoEnCuenta(enc, cuenta);
        if (monto > saldoEnCuenta) {
          toast(`En ${escHtml(fuenteLabel(cuenta))} solo hay ${fmt(saldoEnCuenta)} de este encargo`, 'err'); return;
        }
      }
    }
    const nuevoMov = {
      id: uid(),
      tipo: movEncargoTipo,
      desc,
      monto,
      cuenta: cuenta || '',
      fecha: document.getElementById('movenc_fecha').value || hoy(),
      nota: document.getElementById('movenc_nota').value.trim(),
      ts: Date.now()
    };
    if (movEncargoTipo === 'salida') {
      const _errInt = _validarIntercambiosBenefs();
      if (_errInt) { toast(_errInt, 'err', 5000); return; }
      const _errMia = _validarMovEncMia();
      if (_errMia) { toast(_errMia, 'err', 5000); return; }
    }
    enc.movimientos.push(nuevoMov);
    if (movEncargoTipo === 'salida') {
      _procesarDiferencial(nuevoMov);
      _procesarMovEncMia(nuevoMov);
    }
    save();
    refresh();
    closeSheet('mov-encargo');
    abrirEncargoDetalle(encargoActualId);
    toast(movEncargoTipo === 'entrada' ? 'Entrada registrada' : 'Salida registrada', 'ok');
  }
}

async function deleteMovEncargo(encId, movId) {
  const ok = await dialogo('Eliminar movimiento', '¿Eliminar este movimiento del encargo? Se revertirán todos los efectos en tus cuentas.', 'Eliminar', true);
  if (!ok) return;
  const enc = getEncargo(encId);
  if (!enc) return;

  const mov = (enc.movimientos||[]).find(m=>m.id===movId);

  // Revertir efectos secundarios de un pago de préstamo vía encargo
  if (mov && mov._esAbonoDeudor && mov._deudorId) {
    const d = (S.deudores || []).find(x => x.id === mov._deudorId);
    if (d) {
      // Eliminar el abono correspondiente del deudor (vinculado por _encMovId,
      // o por _encMovIds si el pago salió de varias cuentas del encargo)
      d.movimientos = (d.movimientos || []).filter(x => !(x._viaEncargo && (x._encMovId === movId || (x._encMovIds && x._encMovIds.includes(movId)))));
    }
    // Si este pago salió de varias cuentas del encargo (mismo _grupoAbonoId),
    // borrar TODAS esas salidas ahora — no solo la que el usuario clickeó —
    // para no dejar un pago "a medias" repartido entre cuentas.
    if (mov._grupoAbonoId) {
      enc.movimientos = (enc.movimientos || []).filter(x => x._grupoAbonoId !== mov._grupoAbonoId);
    }
  }

  // Revertir efectos secundarios de una compra TC de encargo
  if (mov && mov._esTcEncargo) {
    // Revertir el sumarFuente del paso 2: usar _destinoMonto si existe (tcMonto guardado),
    // con fallback a _tcMonto y luego a monto para compatibilidad con registros anteriores.
    if (mov._destino) {
      const montoARevertir = mov._destinoMonto || mov._tcMonto || mov.monto;
      if (montoARevertir) descontarFuente(mov._destino, montoARevertir);
    }

    // Revertir la deuda de la TC (paso 3)
    if (mov._tcId && mov._tcMonto) {
      const tc = (S.tarjetasCredito||[]).find(t=>t.id===mov._tcId);
      if (tc) tc.deuda = Math.max(0, (tc.deuda||0) - mov._tcMonto);
    }

    // Borrar el movimiento de historial de TC vinculado (paso 4)
    if (S.tcMovimientos) {
      S.tcMovimientos = S.tcMovimientos.filter(t => t._encMovId !== movId);
    }

    // Borrar todos los S.movimientos vinculados (destino + diferencial, pasos 2 y 5)
    // y revertir sus sumas. Excluye los de intercambio — esos los maneja el bloque siguiente.
    if (S.movimientos) {
      const difMovs = S.movimientos.filter(m => m._encMovId === movId && !m._esIntercambioEncargo);
      difMovs.forEach(m => { if (m.fuente && m.monto) descontarFuente(m.fuente, m.monto); });
      S.movimientos = S.movimientos.filter(m => !(m._encMovId === movId && !m._esIntercambioEncargo));
    }
  }

  // Revertir "Me lo regalaron" (traspaso de encargo a cuenta propia)
  if (mov && mov._traspasoEncargo) {
    // Revertir el sumarFuente que se hizo en el paso 2
    if (mov._destino && mov.monto) descontarFuente(mov._destino, mov.monto);
    // Borrar el movimiento de ingreso vinculado (puede estar en c.movimientos de una
    // cuenta custom o en S.movimientos para cuentas estándar).
    if (mov._destino && mov._destino.startsWith('custom:')) {
      const customId = mov._destino.split(':')[1];
      const cDest = (S.cuentasPersonalizadas || []).find(x => x.id === customId);
      if (cDest && cDest.movimientos) {
        cDest.movimientos = cDest.movimientos.filter(m => m._encMovId !== movId);
      }
    } else if (S.movimientos) {
      S.movimientos = S.movimientos.filter(m => m._encMovId !== movId);
    }
  }

  // Revertir intercambios "lo pagué yo" del diferencial (salida normal sin _esTcEncargo)
  if (mov && mov.diferencial && (mov.diferencial.beneficiarios || []).some(b => b.pagadoPorMi)) {
    if (S.movimientos) {
      const intercambioMovs = S.movimientos.filter(m => m._encMovId === movId && m._esIntercambioEncargo);
      intercambioMovs.forEach(m => {
        if (!m.fuente || !m.monto) return;
        if (m._intercambioSalida) {
          sumarFuente(m.fuente, m.monto);
        } else if (m._intercambioEntrada) {
          descontarFuente(m.fuente, m.monto);
        }
      });
      S.movimientos = S.movimientos.filter(m => !(m._encMovId === movId && m._esIntercambioEncargo));
    }
  }

  // Revertir intercambio simple "Yo puse la plata" (sin diferencial — _miaCuentaSale en el mov principal)
  if (mov && mov._miaCuentaSale && !(mov.diferencial && (mov.diferencial.beneficiarios || []).some(b => b.pagadoPorMi))) {
    if (S.movimientos) {
      const intercambioMovs = S.movimientos.filter(m => m._encMovId === movId && m._esIntercambioEncargo);
      intercambioMovs.forEach(m => {
        if (!m.fuente || !m.monto) return;
        if (m._intercambioSalida) {
          // Pagué de mi bolsillo → revertir sumando de vuelta a esa cuenta
          sumarFuente(m.fuente, m.monto);
        } else if (m._intercambioEntrada) {
          // Recuperé en mi cuenta → revertir descontando
          descontarFuente(m.fuente, m.monto);
        }
      });
      S.movimientos = S.movimientos.filter(m => !(m._encMovId === movId && m._esIntercambioEncargo));
    }
  }

  enc.movimientos = (enc.movimientos||[]).filter(m=>m.id!==movId);
  save();
  refresh();
  if (cuentaActual) renderDetalleCuenta(cuentaActual);
  abrirEncargoDetalle(encId);
  toast('Movimiento eliminado y saldos revertidos', 'info');
}

async function eliminarEncargoActual() {
  const enc = getEncargo(encargoActualId);
  if (!enc) return;
  const saldo = encargoSaldo(enc);
  // Un encargo solo se puede eliminar en $0. Si todavía tiene saldo (a favor
  // o en contra) hay plata pendiente de resolver — no tiene sentido borrar
  // el registro que la está rastreando.
  if (Math.abs(saldo) > 0.5) {
    toast(`Este encargo todavía tiene ${fmt(saldo)} registrado — dejalo en $0 antes de eliminarlo`, 'err', 4500);
    return;
  }

  const ok = await dialogo(
    'Eliminar encargo',
    `¿Eliminar el encargo de ${escHtml(enc.nombre)}? Esta acción no se puede deshacer. Los movimientos que ya pasaron (compras con TC, pagos de deudas, traspasos, etc.) quedan tal cual — eliminar el encargo no revierte nada, solo deja de llevarle el registro a esta persona.`,
    'Eliminar', true
  );
  if (!ok) return;

  // A propósito NO se revierte ni se borra ningún movimiento vinculado
  // (S.movimientos, S.tcMovimientos, movimientos de deudores, cuentas
  // custom, etc.). Si el encargo está en $0, todo lo que pasó mientras
  // existió ya quedó correctamente reflejado en tus cuentas/tarjetas/deudas
  // — eliminar el encargo es solo dejar de administrarle plata a esa
  // persona, no deshacer los favores o pagos que ya ocurrieron.
  S.encargos = (S.encargos||[]).filter(e=>e.id!==encargoActualId);
  save();
  volverEncargosLista();
  if(window.logCambio)logCambio('Eliminaste un encargo','','','eliminar');
  toast('Encargo eliminado', 'info');
}

function abrirTraspasoEncargo() {
  const enc = getEncargo(encargoActualId);
  if (!enc) return;
  const saldo = encargoSaldo(enc);
  if (saldo <= 0) { toast('El encargo no tiene saldo disponible', 'err'); return; }

  document.getElementById('traspasoEncNombre').textContent = enc.nombre;
  document.getElementById('traspasoEncSaldo').textContent = fmt(saldo);
  document.getElementById('traspaso_monto').value = '';
  document.getElementById('traspaso_desc').value = 'Sobrante de encargo — ' + enc.nombre;
  document.getElementById('traspaso_fecha').value = hoy();
  document.getElementById('traspaso_preview').textContent = '';

  // Poblar select destino con mis cuentas
  const fuentes = getFuentes();
  const sel = document.getElementById('traspaso_destino');
  sel.innerHTML = '<option value="">Seleccionar cuenta</option>' + fuentes.map(f=>`<option value="${f.val}">${f.label}</option>`).join('');

  // Pre-seleccionar la cuenta donde más saldo tiene el encargo
  const cuentasEnc = _getEncargoSaldoPorCuenta(enc);
  if (cuentasEnc.length > 0) {
    sel.value = cuentasEnc[0].cuenta;
  }
  _actualizarTraspasoHint();
  _actualizarTraspasoPreview(enc);

  sel.onchange = function() { _actualizarTraspasoHint(); _actualizarTraspasoPreview(enc); };
  document.getElementById('traspaso_monto').oninput = function() { _actualizarTraspasoPreview(enc); };

  openSheet('traspaso-encargo');
  setTimeout(()=>document.getElementById('traspaso_monto').focus(), 200);
}

function _actualizarTraspasoHint() {
  const sel = document.getElementById('traspaso_destino');
  const hint = document.getElementById('traspaso_saldo_hint');
  if (!hint) return;
  const val = sel.value;
  if (!val) { hint.textContent = ''; return; }
  hint.textContent = 'Saldo actual: ' + fmt(getSaldoActual(val));
}

function _actualizarTraspasoPreview(enc) {
  const monto = parseMoney(document.getElementById('traspaso_monto').value) || 0;
  const destino = document.getElementById('traspaso_destino').value;
  const prev = document.getElementById('traspaso_preview');
  if (!prev) return;
  if (!monto || !destino) { prev.textContent = ''; return; }
  const saldoEnc = encargoSaldo(enc);
  const saldoCuenta = getSaldoActual(destino);
  const nuevoEnc = saldoEnc - monto;
  const nuevoCuenta = saldoCuenta + monto;
  const colorEnc = nuevoEnc < 0 ? 'var(--red)' : 'var(--blue)';
  prev.innerHTML =
    `<span style="color:${colorEnc};">Encargo: ${fmt(saldoEnc)} → ${fmt(nuevoEnc)}</span><br>` +
    `<span style="color:var(--accent);">${escHtml(fuenteLabel(destino))}: ${fmt(saldoCuenta)} → ${fmt(nuevoCuenta)}</span>` +
    (nuevoEnc < 0 ? `<br><span style="color:var(--red);font-size:10px;">Más de lo que tiene el encargo</span>` : '');
}

function confirmarTraspasoEncargo() {
  const monto = parseMoney(document.getElementById('traspaso_monto').value) || 0;
  const destino = document.getElementById('traspaso_destino').value;
  const desc = document.getElementById('traspaso_desc').value.trim();
  const fecha = document.getElementById('traspaso_fecha').value || hoy();

  if (!monto) { toast('Ingresa un monto válido', 'err'); return; }
  if (!destino) { toast('Selecciona la cuenta destino', 'err'); return; }
  if (!desc) { toast('Ingresa una descripción', 'err'); return; }

  const enc = getEncargo(encargoActualId);
  if (!enc) return;
  const saldoActual = encargoSaldo(enc);
  if (monto > saldoActual) {
    toast(`El encargo solo tiene ${fmt(saldoActual)}`, 'err'); return;
  }

  // 1. Registrar salida en el encargo
  if (!enc.movimientos) enc.movimientos = [];
  // Determinar de qué cuenta física salió (la que más saldo tiene del encargo)
  const cuentasEnc = _getEncargoSaldoPorCuenta(enc);
  const cuentaOrigen = cuentasEnc.length > 0 ? cuentasEnc[0].cuenta : '';
  const encMovId = uid();
  enc.movimientos.push({
    id: encMovId,
    tipo: 'salida',
    desc: desc + ' → ' + fuenteLabel(destino),
    monto,
    cuenta: cuentaOrigen,
    fecha,
    nota: 'Traspaso a cuenta propia',
    _traspasoEncargo: true,   // marca para reversión en deleteMovEncargo
    _destino: destino,        // cuenta destino (para revertir sumarFuente)
    ts: Date.now()
  });

  // 2. Sumar a mi cuenta (cambia "de quién es" la plata)
  sumarFuente(destino, monto);

  // 3. Registrar ingreso visible en el historial de la cuenta destino.
  //    Cuentas custom: va en c.movimientos (lo que renderMovsCustom lee).
  //    Cuentas estándar: va en S.movimientos.
  if (destino.startsWith('custom:')) {
    const customId = destino.split(':')[1];
    const cDest = (S.cuentasPersonalizadas || []).find(x => x.id === customId);
    if (cDest) {
      if (!cDest.movimientos) cDest.movimientos = [];
      cDest.movimientos.push({
        id: uid(),
        tipo: 'ingreso',
        monto,
        fecha,
        nota: desc + ' (de encargo ' + enc.nombre + ')',
        _secundario: true,
        _origenSeccion: 'Encargos',
        _encMovId: encMovId,
        ts: Date.now()
      });
    }
  } else {
    if (!S.movimientos) S.movimientos = [];
    S.movimientos.push({
      id: uid(),
      tipo: 'entrada',
      fuente: destino,
      monto,
      fecha,
      desc: desc + ' (de encargo ' + enc.nombre + ')',
      _encMovId: encMovId
    });
  }

  save();
  refresh();
  closeSheet('traspaso-encargo');
  abrirEncargoDetalle(encargoActualId);
  toast(`${fmt(monto)} traspasado a ${escHtml(fuenteLabel(destino))}`, 'ok', 3500);
}


// ── MOVER PLATA DE ENCARGO ENTRE CUENTAS ──────────────────────────────────
// Permite reubicar fisicamente la plata de un encargo de una cuenta a otra
// sin alterar el saldo total del encargo.

function abrirMoverEntreCuentasEncargo() {
  const enc = getEncargo(encargoActualId);
  if (!enc) return;
  const saldo = encargoSaldo(enc);
  if (saldo <= 0) { toast('El encargo no tiene saldo disponible', 'err'); return; }

  document.getElementById('moverEncNombre').textContent = enc.nombre;
  document.getElementById('moverEncSaldo').textContent = fmt(saldo);
  document.getElementById('moverenc_monto').value = '';
  document.getElementById('moverenc_fecha').value = hoy();
  document.getElementById('moverenc_preview').innerHTML = '';
  document.getElementById('moverenc_origen_hint').textContent = '';
  document.getElementById('moverenc_destino_hint').textContent = '';

  const fuentes = getFuentes();
  const cuentasConSaldo = _getEncargoSaldoPorCuenta(enc); // [{cuenta, saldo}]
  const saldoSinCuenta = _getEncargoSaldoSinCuenta(enc);

  // Select origen: solo cuentas donde el encargo tiene plata (incluye "Sin especificar")
  const selOrigen = document.getElementById('moverenc_origen');
  const fuentesConSaldo = fuentes.filter(f => {
    const encargoEnCuenta = cuentasConSaldo.find(c => c.cuenta === f.val);
    return encargoEnCuenta && encargoEnCuenta.saldo > 0;
  });
  let origenOptsHtml = fuentesConSaldo.map(f => {
    const encargoEnCuenta = cuentasConSaldo.find(c => c.cuenta === f.val);
    const saldoEnc = encargoEnCuenta.saldo;
    return '<option value="' + f.val + '">' + f.label + ' (' + fmt(saldoEnc) + ' del encargo)</option>';
  }).join('');
  if (saldoSinCuenta > 0) {
    origenOptsHtml += '<option value="__sinesp__">Sin especificar (' + fmt(saldoSinCuenta) + ' del encargo)</option>';
  }
  selOrigen.innerHTML = '<option value="">Seleccionar cuenta origen</option>' + origenOptsHtml;

  // Pre-seleccionar la cuenta con más saldo del encargo (o "Sin especificar" si es lo único que hay)
  if (cuentasConSaldo.length > 0) {
    selOrigen.value = cuentasConSaldo[0].cuenta;
    _actualizarMoverEncOrigenHint(enc);
  } else if (saldoSinCuenta > 0) {
    selOrigen.value = '__sinesp__';
    _actualizarMoverEncOrigenHint(enc);
  }

  // Select destino: todas las cuentas
  const selDestino = document.getElementById('moverenc_destino');
  selDestino.innerHTML = '<option value="">Seleccionar cuenta destino</option>' +
    fuentes.map(f => '<option value="' + f.val + '">' + f.label + '</option>').join('');

  // Listeners
  selOrigen.onchange = function() {
    _actualizarMoverEncOrigenHint(enc);
    _actualizarMoverEncPreview(enc);
    // Si destino es igual al nuevo origen, limpiar destino
    if (selDestino.value === selOrigen.value) selDestino.value = '';
  };
  selDestino.onchange = function() {
    _actualizarMoverEncDestinoHint();
    _actualizarMoverEncPreview(enc);
  };
  document.getElementById('moverenc_monto').oninput = function() {
    _actualizarMoverEncPreview(enc);
  };

  openSheet('mover-enc-cuentas');
  setTimeout(() => document.getElementById('moverenc_monto').focus(), 220);
}

function _actualizarMoverEncOrigenHint(enc) {
  const sel = document.getElementById('moverenc_origen');
  const hint = document.getElementById('moverenc_origen_hint');
  if (!hint) return;
  const val = sel.value;
  if (!val) { hint.textContent = ''; return; }
  const saldoEnc = val === '__sinesp__'
    ? _getEncargoSaldoSinCuenta(enc)
    : (_getEncargoSaldoPorCuenta(enc).find(c => c.cuenta === val)?.saldo || 0);
  hint.textContent = saldoEnc > 0
    ? 'Del encargo en esta cuenta: ' + fmt(saldoEnc)
    : 'El encargo no tiene plata en esta cuenta';
  hint.style.color = saldoEnc > 0 ? 'var(--amber)' : 'var(--red)';
}

function _actualizarMoverEncDestinoHint() {
  const sel = document.getElementById('moverenc_destino');
  const hint = document.getElementById('moverenc_destino_hint');
  if (!hint) return;
  const val = sel.value;
  if (!val) { hint.textContent = ''; return; }
  hint.textContent = 'Saldo actual de la cuenta: ' + fmt(getSaldoActual(val));
  hint.style.color = 'var(--text3)';
}

function _actualizarMoverEncPreview(enc) {
  const monto = parseMoney(document.getElementById('moverenc_monto').value) || 0;
  const origen = document.getElementById('moverenc_origen').value;
  const destino = document.getElementById('moverenc_destino').value;
  const prev = document.getElementById('moverenc_preview');
  if (!prev) return;
  if (!monto || !origen || !destino) { prev.innerHTML = ''; return; }
  if (origen === destino) {
    prev.innerHTML = '<span style="color:var(--red);">Origen y destino no pueden ser la misma cuenta</span>';
    return;
  }
  const cuentas = _getEncargoSaldoPorCuenta(enc);
  const labelOrigen = origen === '__sinesp__' ? 'Sin especificar' : escHtml(fuenteLabel(origen));
  const saldoEnOrigen = origen === '__sinesp__'
    ? _getEncargoSaldoSinCuenta(enc)
    : (cuentas.find(c => c.cuenta === origen)?.saldo || 0);
  const excede = monto > saldoEnOrigen;
  const colorOrigen = excede ? 'var(--red)' : 'var(--amber)';
  const nuevoOrigen = saldoEnOrigen - monto;
  const cuentaDestEnc = cuentas.find(c => c.cuenta === destino);
  const saldoEnDestino = cuentaDestEnc ? cuentaDestEnc.saldo : 0;
  const nuevoDestino = saldoEnDestino + monto;
  prev.innerHTML =
    '<span style="color:' + colorOrigen + ';">' + labelOrigen + ' (encargo): ' + fmt(saldoEnOrigen) + ' → ' + fmt(nuevoOrigen) + '</span><br>' +
    '<span style="color:var(--blue);">' + escHtml(fuenteLabel(destino)) + ' (encargo): ' + fmt(saldoEnDestino) + ' → ' + fmt(nuevoDestino) + '</span>' +
    (excede ? '<br><span style="color:var(--red);font-size:10px;">Excede lo que el encargo tiene en esa cuenta</span>' : '');
}

function confirmarMoverEncCuentas() {
  const monto = parseMoney(document.getElementById('moverenc_monto').value) || 0;
  const origen = document.getElementById('moverenc_origen').value;
  const destino = document.getElementById('moverenc_destino').value;
  const fecha = document.getElementById('moverenc_fecha').value || hoy();

  if (!monto) { toast('Ingresa un monto válido', 'err'); return; }
  if (!origen) { toast('Selecciona la cuenta de origen', 'err'); return; }
  if (!destino) { toast('Selecciona la cuenta de destino', 'err'); return; }
  if (origen === destino) { toast('Origen y destino no pueden ser la misma cuenta', 'err'); return; }

  const enc = getEncargo(encargoActualId);
  if (!enc) return;

  const esOrigenSinEspecificar = origen === '__sinesp__';
  const labelOrigen = esOrigenSinEspecificar ? 'Sin especificar' : escHtml(fuenteLabel(origen));

  // Verificar saldo del encargo en la cuenta origen (o en "Sin especificar")
  const saldoEnOrigen = esOrigenSinEspecificar
    ? _getEncargoSaldoSinCuenta(enc)
    : (_getEncargoSaldoPorCuenta(enc).find(c => c.cuenta === origen)?.saldo || 0);
  if (monto > saldoEnOrigen) {
    toast('El encargo solo tiene ' + fmt(saldoEnOrigen) + ' en ' + labelOrigen, 'err');
    return;
  }

  // Registrar dos movimientos internos: salida de origen, entrada a destino
  if (!enc.movimientos) enc.movimientos = [];

  enc.movimientos.push({
    id: uid(),
    tipo: 'salida',
    desc: 'Reubicación → ' + fuenteLabel(destino),
    monto,
    // Si el origen es "Sin especificar" se guarda sin cuenta (así lo interpreta el resto del sistema)
    cuenta: esOrigenSinEspecificar ? '' : origen,
    fecha,
    nota: 'Movimiento interno entre cuentas',
    ts: Date.now()
  });

  enc.movimientos.push({
    id: uid(),
    tipo: 'entrada',
    desc: 'Reubicación ← ' + labelOrigen,
    monto,
    cuenta: destino,
    fecha,
    nota: 'Movimiento interno entre cuentas',
    ts: Date.now() + 1
  });

  save();
  closeSheet('mover-enc-cuentas');
  abrirEncargoDetalle(encargoActualId);
  toast(fmt(monto) + ' reubicados de ' + labelOrigen + ' a ' + escHtml(fuenteLabel(destino)), 'ok', 3500);
}

// Listener para el botón confirmar
(function() {
  const btn = document.getElementById('btn-confirmar-mover-enc-cuentas');
  if (btn) btn.addEventListener('click', confirmarMoverEncCuentas);
})();

// Hook into refresh
const _origRefreshEncargos = refresh;
refresh = function() {
  _origRefreshEncargos();
  if (document.getElementById('screen-encargos')?.classList.contains('active')) {
    if (encargoActualId) {
      abrirEncargoDetalle(encargoActualId);
    } else {
      renderEncargosList();
    }
  }
};

// Init event listeners for encargos
document.addEventListener('DOMContentLoaded', function(){}, false);
(function initEncargosListeners(){
  const btn_nuevo = document.getElementById('btn-nuevo-encargo');
  if (btn_nuevo) btn_nuevo.addEventListener('click', () => {
    // Poblar select de cuentas para saldo inicial
    const sel = document.getElementById('enc_cuenta_ini');
    if (sel) {
      const fuentes = getFuentesSinTC();
      sel.innerHTML = '<option value="">Sin especificar</option>' + fuentes.map(f=>`<option value="${f.val}">${f.label}</option>`).join('');
    }
    openSheet('nuevo-encargo');
  });

  // Mostrar/ocultar campo de cuenta inicial según si hay saldo
  const encSaldo = document.getElementById('enc_saldo');
  if (encSaldo) {
    encSaldo.addEventListener('input', function() {
      const v = parseMoney(this.value) || 0;
      const wrap = document.getElementById('enc_cuenta_wrap');
      if (wrap) wrap.style.display = v > 0 ? '' : 'none';
    });
  }

  const btn_crear = document.getElementById('btn-crear-encargo');
  // Nota: se llama como () => crearEncargo() (no crearEncargo directo) para que cada clic
  // lea el valor ACTUAL de la variable global. Más abajo en el archivo (línea ~21597)
  // crearEncargo se reasigna para adjuntar personaId; pasar la referencia directa acá
  // congelaba esa versión vieja y el override nunca corría.
  if (btn_crear) btn_crear.addEventListener('click', () => crearEncargo());

  const btn_volver = document.getElementById('btn-volver-encargos');
  if (btn_volver) btn_volver.addEventListener('click', volverEncargosLista);

  const btn_eliminar = document.getElementById('btn-eliminar-encargo');
  if (btn_eliminar) btn_eliminar.addEventListener('click', eliminarEncargoActual);

  const btn_editar_enc = document.getElementById('btn-editar-encargo');
  if (btn_editar_enc) btn_editar_enc.addEventListener('click', editarEncargoActual);

  const btn_guardar_edit_enc = document.getElementById('btn-guardar-editar-encargo');
  if (btn_guardar_edit_enc) btn_guardar_edit_enc.addEventListener('click', guardarEditarEncargo);

  const btn_guardar_edit_sp = document.getElementById('btn-guardar-editar-spotify');
  if (btn_guardar_edit_sp) btn_guardar_edit_sp.addEventListener('click', guardarEditarSpotify);

  const btn_mov = document.getElementById('btn-confirmar-mov-encargo');
  if (btn_mov) btn_mov.addEventListener('click', confirmarMovEncargo);

  const btn_traspaso = document.getElementById('btn-confirmar-traspaso-encargo');
  if (btn_traspaso) btn_traspaso.addEventListener('click', confirmarTraspasoEncargo);
})();

// Render encargos when tab is clicked
const _origNavEncargos = document.getElementById('nav-encargos');
if (_origNavEncargos) {
  _origNavEncargos.addEventListener('click', function(){
    // Rendered by the nav click handler, but ensure list is shown
    setTimeout(()=>{
      if (!encargoActualId) renderEncargosList();
    }, 50);
  });
}


/* ================================================================
   COMPRA DE ENCARGO CON TARJETA DE CREDITO
   - El encargo pierde el saldo (salida)
   - El dinero NO desaparece: se mueve a una cuenta propia (para pagar TC)
   - La deuda de la TC sube por el valor REAL de la compra
   - El diferencial usa el motor común (instancia 'ctc'): sin beneficiarios
     ni intercambio, solo "real" + cuenta propia para el margen.
   ================================================================ */

diffRegistrarInstancia('ctc', {
  ids: {
    wrap: 'ctc-dif-wrap', body: 'ctc-dif-body', icon: 'ctc-dif-icon',
    real: 'ctc_dif_real', resumen: 'ctc-dif-resumen',
    miCuentaWrap: 'ctc-dif-margen-wrap', miCuenta: 'ctc_dif_margen_cuenta'
  },
  permiteBeneficiarios: false,
  permiteIntercambio: false,
  permiteMiCuenta: true,
  exigeMargenPositivo: true,
  placeholderSinReal: 'Ingresa el valor real para ver el resumen',
  labelMargenNegativo: 'El valor real debe ser menor que el monto del encargo',
  getDijo: () => parseMoney(document.getElementById('ctc_monto')?.value) || 0,
  descMargen: (mov) => `Diferencial encargo ${mov._encNombre || ''} — `,
  onResumen: () => _ctcActualizarPreview()
});

// Wrappers con los nombres viejos — el HTML del sheet sigue llamándolos igual
function _ctcDifToggle() { diffToggle('ctc'); }
function _ctcDifResumen() { diffResumen('ctc'); }

function abrirCompraConTC() {
  const enc = getEncargo(encargoActualId);
  if (!enc) return;
  const saldo = encargoSaldo(enc);
  if (saldo <= 0) { toast('El encargo no tiene saldo disponible', 'err'); return; }

  document.getElementById('compraTcEncNombre').textContent = enc.nombre;
  document.getElementById('compraTcEncSaldo').textContent = fmt(saldo);
  document.getElementById('ctc_desc').value = '';
  document.getElementById('ctc_monto').value = '';
  document.getElementById('ctc_nota').value = '';
  document.getElementById('ctc_fecha').value = hoy();
  diffReset('ctc');

  // Poblar select de cuentas del encargo
  const selEnc = document.getElementById('ctc_cuenta_enc');
  const cuentasConSaldo = _getEncargoSaldoPorCuenta(enc);
  if (cuentasConSaldo.length === 0) {
    const fuentes = getFuentes();
    selEnc.innerHTML = '<option value="">Sin especificar</option>' + fuentes.map(f => `<option value="${f.val}">${f.label}</option>`).join('');
  } else {
    selEnc.innerHTML = '<option value="">Sin especificar</option>' +
      cuentasConSaldo.map(f => `<option value="${f.cuenta}">${f.label} (${fmt(f.saldo)})</option>`).join('');
    selEnc.value = cuentasConSaldo[0].cuenta;
  }
  _ctcActualizarCuentaEncHint();

  // Poblar tarjetas de credito
  const selTC = document.getElementById('ctc_tarjeta');
  const tarjetas = (S.tarjetasCredito || []);
  if (tarjetas.length === 0) {
    selTC.innerHTML = '<option value="">No hay TC registradas</option>';
  } else {
    selTC.innerHTML = '<option value="">Seleccionar TC</option>' +
      tarjetas.map(t => `<option value="${t.id}">${escHtml(t.nombre)} (deuda: ${fmt(t.deuda||0)})</option>`).join('');
    // Pre-seleccionar si solo hay una
    if (tarjetas.length === 1) selTC.value = tarjetas[0].id;
  }

  // Poblar destino del dinero (mis cuentas)
  const selDest = document.getElementById('ctc_destino');
  const fuentes = getFuentes();
  selDest.innerHTML = '<option value="">Seleccionar cuenta</option>' + fuentes.map(f => `<option value="${f.val}">${f.label} (${fmt(getSaldoActual(f.val))})</option>`).join('');
  // Buscar cajita que tenga "tarjeta" o "TC" o "pago" en el nombre para pre-seleccionar
  const cajitaTC = (S.cajitas || []).find(c => {
    const n = (c.nombre||'').toLowerCase();
    return n.includes('tarjeta') || n.includes(' tc') || n.includes('pago tc') || n.includes('tc ');
  });
  if (cajitaTC) selDest.value = 'cajita:' + cajitaTC.id;

  _ctcActualizarDestinoHint();
  _ctcActualizarPreview();

  openSheet('compra-tc-encargo');
  setTimeout(() => { const d = document.getElementById('ctc_desc'); if(d) d.focus(); }, 200);
}

function _ctcActualizarCuentaEncHint() {
  const sel = document.getElementById('ctc_cuenta_enc');
  const hint = document.getElementById('ctc_cuenta_enc_hint');
  if (!hint) return;
  const val = sel.value;
  if (!val) { hint.textContent = ''; return; }
  const enc = getEncargo(encargoActualId);
  if (!enc) { hint.textContent = ''; return; }
  const saldoEnCuenta = _getEncargoSaldoEnCuenta(enc, val);
  hint.textContent = saldoEnCuenta > 0
    ? 'Del encargo en esta cuenta: ' + fmt(saldoEnCuenta)
    : 'El encargo no tiene saldo en esta cuenta';
  hint.style.color = saldoEnCuenta > 0 ? 'var(--text3)' : 'var(--red)';
}

function _ctcActualizarDestinoHint() {
  const sel = document.getElementById('ctc_destino');
  const hint = document.getElementById('ctc_destino_hint');
  if (!hint) return;
  const val = sel.value;
  if (!val) { hint.textContent = ''; return; }
  hint.textContent = 'Saldo actual: ' + fmt(getSaldoActual(val));
  hint.style.color = 'var(--text3)';
}

function _ctcActualizarPreview() {
  const prev = document.getElementById('ctc_preview');
  if (!prev) return;
  const monto = parseMoney(document.getElementById('ctc_monto').value) || 0;
  const cuentaEnc = document.getElementById('ctc_cuenta_enc').value;
  const tcId = document.getElementById('ctc_tarjeta').value;
  const destino = document.getElementById('ctc_destino').value;
  if (!monto) { prev.style.display = 'none'; prev.innerHTML = ''; return; }

  const enc = getEncargo(encargoActualId);
  const saldoEnc = enc ? encargoSaldo(enc) : 0;
  const saldoEncCuenta = (enc && cuentaEnc) ? _getEncargoSaldoEnCuenta(enc, cuentaEnc) : saldoEnc;

  // Diferencial — vía motor común
  const difActivo = diffEstaAbierto('ctc');
  const calc = difActivo ? diffCalcular('ctc') : null;
  const real = calc ? calc.real : 0;
  const tcMonto = calc && real > 0 && real < monto ? real : monto;
  const margen = calc && real > 0 && real < monto ? calc.margen : 0;

  // TC info
  const tc = tcId ? (S.tarjetasCredito||[]).find(t=>t.id===tcId) : null;
  const deudaTC = tc ? (tc.deuda||0) : 0;
  const nombreTC = escHtml(tc ? tc.nombre : (tcId ? tcId : 'TC'));

  // Destino
  const saldoDest = destino ? getSaldoActual(destino) : 0;
  const lblDest = destino ? escHtml(fuenteLabel(destino)) : '';

  let lines = [];
  lines.push(`<span style="color:var(--red);">Encargo ${enc?escHtml(enc.nombre):''}: ${fmt(saldoEncCuenta)} → ${fmt(saldoEncCuenta - monto)}</span>`);
  if (destino) lines.push(`<span style="color:var(--accent);">${lblDest}: ${fmt(saldoDest)} → ${fmt(saldoDest + monto)}</span>`);
  if (tc) lines.push(`<span style="color:var(--red);">Deuda ${nombreTC}: ${fmt(deudaTC)} → ${fmt(deudaTC + tcMonto)}</span>`);
  if (margen > 0) lines.push(`<span style="color:var(--accent);">Diferencial tuyo: +${fmt(margen)}</span>`);

  prev.innerHTML = lines.join('<br>');
  prev.style.display = '';
}

function confirmarCompraConTC() {
  const desc  = document.getElementById('ctc_desc').value.trim();
  const monto = parseMoney(document.getElementById('ctc_monto').value) || 0;
  const cuentaEnc = document.getElementById('ctc_cuenta_enc').value;
  const tcId  = document.getElementById('ctc_tarjeta').value;
  const destino = document.getElementById('ctc_destino').value;
  const nota  = document.getElementById('ctc_nota').value.trim();
  const fecha = document.getElementById('ctc_fecha').value || hoy();

  if (!desc)  { toast('Ingresa una descripción', 'err'); return; }
  if (!monto) { toast('Ingresa un monto válido', 'err'); return; }
  if (!tcId)  { toast('Selecciona la tarjeta de crédito', 'err'); return; }
  if (!destino) { toast('Selecciona a dónde va el dinero para pagar la TC', 'err'); return; }

  const enc = getEncargo(encargoActualId);
  if (!enc) return;

  const saldoActual = encargoSaldo(enc);
  if (monto > saldoActual) {
    toast(`El encargo solo tiene ${fmt(saldoActual)}`, 'err'); return;
  }
  if (cuentaEnc) {
    const saldoEnCuenta = _getEncargoSaldoEnCuenta(enc, cuentaEnc);
    if (monto > saldoEnCuenta + 0.5) {
      toast(`En ${escHtml(fuenteLabel(cuentaEnc))} solo hay ${fmt(saldoEnCuenta)} de este encargo`, 'err'); return;
    }
  }

  // Diferencial — vía motor común. tcMonto/margen dependen de si el real es válido (real>0 y real<monto).
  const difActivo = diffEstaAbierto('ctc');
  const calc = difActivo ? diffCalcular('ctc') : null;
  const realValido = calc && calc.real > 0 && calc.real < monto;
  const tcMonto = realValido ? calc.real : monto;
  const margen = realValido ? calc.margen : 0;

  // ── 1. Registrar SALIDA en el encargo (el dinero deja de ser de ellos)
  if (!enc.movimientos) enc.movimientos = [];
  const _encMovId = uid(); // ID del movimiento del encargo — usado para vincular efectos secundarios
  const movEncargo = {
    id: _encMovId,
    tipo: 'salida',
    desc: `Compra pagada con TC: ${desc}`,
    monto,
    cuenta: cuentaEnc || '',
    fecha,
    nota: nota || 'Compra de encargo pagada con TC — dinero convertido para pago de tarjeta.',
    _esTcEncargo: true,
    _encId: enc.id,      // guardar encargo origen para poder encontrar el raw desde detalle
    _destino: destino,   // guardar destino para poder revertir el sumarFuente al eliminar
    _tcId: tcId,         // guardar TC para revertir la deuda al eliminar
    _tcMonto: tcMonto,      // monto real cargado a la TC
    _dijoMonto: monto,      // monto que se le dijo al encargo (puede diferir del real si hay margen)
    _destinoMonto: tcMonto, // monto que realmente entra a la cuenta destino (= tcMonto, para reversión)
    ts: Date.now()
  };
  enc.movimientos.push(movEncargo);

  // ── 2. Mover el dinero del encargo a la cuenta destino
  //    Solo entra el valor real cobrado por la TC (tcMonto), no el total del encargo.
  //    La diferencia (margen) ya fue separada como ganancia tuya en el paso diferencial.
  sumarFuente(destino, tcMonto);
  if (!S.movimientos) S.movimientos = [];
  S.movimientos.push({
    id: uid(),
    tipo: 'entrada',
    fuente: destino,
    _encMovId,
    _esTcEncargo: true,
    monto: tcMonto,
    fecha,
    desc: `TC encargo ${escHtml(enc.nombre)}: ${desc}`,
    nota: 'Dinero del encargo recibido para pagar la tarjeta de crédito.',
    ts: Date.now()
  });

  // ── 3. Aumentar la deuda de la TC por el valor REAL (no margen)
  const tc = (S.tarjetasCredito||[]).find(t=>t.id===tcId);
  if (tc) {
    tc.deuda = (tc.deuda||0) + tcMonto;
  }

  // ── 4. Registrar en el historial de la TC (sin contar como gasto propio)
  if (!S.tcMovimientos) S.tcMovimientos = [];
  S.tcMovimientos.push({
    id: uid(),
    tcId,
    tipo: 'cargo_encargo',
    desc: `Compra encargo ${escHtml(enc.nombre)}: ${desc}`,
    monto: tcMonto,
    fecha,
    nota: nota || 'Cargo de encargo — no es gasto propio',
    encId: enc.id,
    _encMovId  // vínculo para poder limpiar al eliminar el movimiento del encargo
  });

  // ── 5. Si hay diferencial, registrar el margen vía el motor común (usa el mismo _encMovId para poder revertir)
  if (margen > 0.5) {
    const movTemp = { desc, fecha, _encNombre: enc.nombre };
    const diferencial = diffAplicar('ctc', movTemp, _encMovId);
    if (diferencial) movEncargo.diferencial = diferencial;
  }

  // ── 6. Registrar en historial de cambios
  if (window.logCambio) {
    logCambio(
      `Compra TC encargo ${escHtml(enc.nombre)}`,
      fmt(monto),
      tc ? tc.nombre : tcId,
      'tc_encargo'
    );
  }

  save();
  refresh();
  closeSheet('compra-tc-encargo');
  abrirEncargoDetalle(encargoActualId);
  toast(`${fmt(monto)} del encargo → ${escHtml(fuenteLabel(destino))} · TC sube ${fmt(tcMonto)}`, 'ok', 4000);
}

// Conectar el botón confirmar al cargar
(function() {
  const btn = document.getElementById('btn-confirmar-compra-tc');
  if (btn) btn.addEventListener('click', confirmarCompraConTC);
  // Listeners de cambio en los selects del sheet
  const selEnc = document.getElementById('ctc_cuenta_enc');
  if (selEnc) selEnc.addEventListener('change', _ctcActualizarCuentaEncHint);
  const selDest = document.getElementById('ctc_destino');
  if (selDest) selDest.addEventListener('change', _ctcActualizarDestinoHint);
})();

/* ═══════════════════════════════════════════════════════════════
   WIRING MIGRADO DESDE index.html (_initEventListeners) — previews
   en vivo de "Retirar plata" (movenc), "Compra con TC" (ctc) y los
   tres inputs "valor real" del motor Diferencial (movenc/ctc/
   usarParte). Documentado como hecho en CHANGELOG.md (2026-07-27),
   pero nunca había llegado a este archivo — agregado ahora. Mismo
   patrón que el bloque equivalente ya existente en prestado.js.
   ═══════════════════════════════════════════════════════════════ */
[
  ['movenc_monto', 'input', _movEncSplitPreview],
  ['movenc_mia_cuenta_sale', 'change', _movEncMiaPreview],
  ['movenc_mia_cuenta_entra', 'change', _movEncMiaPreview],
  ['ctc_monto', 'input', _ctcActualizarPreview],
  ['ctc_cuenta_enc', 'change', _ctcActualizarPreview],
  ['ctc_tarjeta', 'change', _ctcActualizarPreview],
  ['ctc_destino', 'change', _ctcActualizarPreview],
  ['movenc_dif_real', 'input', _difResumen],
  ['ctc_dif_real', 'input', _ctcDifResumen],
  ['usar_parte_dif_real', 'input', _usarParteDifResumen],
].forEach(([elId, evt, fn]) => {
  const el = document.getElementById(elId);
  if (el) el.addEventListener(evt, fn);
});

/* ═══════════════════════════════════════════════════════════════
   REGISTRO DE EVENTOS (js/core/events.js)
   Reemplaza los onclick="..." inline que tenía este módulo — mismo
   patrón que spotify.js y mesada.js. Los handlers con argumentos
   dinámicos (ids de encargo/movimiento/parte) se generan en el HTML
   con Events.attr(...); los que no llevan argumento (botones fijos
   de los sheets) se registran acá con el mismo nombre de acción que
   ya tenía el atributo data-action escrito a mano en el markup.
   ═══════════════════════════════════════════════════════════════ */

Events.registerAll('encargos', {
  abrirMov:               abrirMovEncargo,          // data-args: ["entrada"] | ["salida"]
  abrirTraspaso:          abrirTraspasoEncargo,
  abrirMoverCuentas:      abrirMoverEntreCuentasEncargo,
  abrirCompraTC:          abrirCompraConTC,
  abrirNuevaParte:        abrirNuevaParte,
  movSplitToggle:         _movEncSplitToggle,
  movAgregarSplitRow:     _movEncAgregarSplitRow,
  difToggle:              _difToggle,
  difAddBenef:            _difAddBenef,
  miaToggle:              _movEncMiaToggle,
  guardarParte:           guardarParte,
  cerrarParteSheet:       cerrarPartSheet,
  usarParteSplitToggle:   _usarParteSplitToggle,
  usarParteAgregarSplitRow: _usarParteAgregarSplitRow,
  usarParteDifToggle:     _usarParteDifToggle,
  usarParteAddBenef:      _usarParteAddBenef,
  confirmarUsarParte:     _confirmarUsarParte,
  ctcDifToggle:           _ctcDifToggle,
  // Con argumentos dinámicos (id de encargo / movimiento / parte):
  abrirDetalle:           abrirEncargoDetalle,       // (encId)
  abrirDesdeCuenta:       abrirEncargoDesdeCuenta,   // (encId)
  deleteMov:              deleteMovEncargo,          // (encId, movId)
  usarParte:              usarParte,                 // (encId, parteId)
  editarParte:            editarParte,               // (encId, parteId)
  eliminarParte:          eliminarParte,              // (encId, parteId)
});
