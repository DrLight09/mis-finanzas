/* ==========================================================================
   js/core/movimientos.js — Núcleo compartido: detalle y eliminación de movimientos
   ==========================================================================
   No es un módulo de dominio (no pertenece a Cuentas, Préstamos, TC, etc.):
   son las dos funciones que usa TODA la app para mostrar y borrar cualquier
   movimiento desde el feed general de actividad y desde el detalle de cada
   cuenta — por eso vive en js/core/, junto a events.js, y no en js/modules/.

   - abrirDetalleMov(el)   — abre el sheet "detalle de movimiento" (saldo
     antes/después de la fuente involucrada). Reconstruye el saldo histórico
     recorriendo la lista de movimientos de la fuente hasta el índice del
     movimiento clickeado.
   - eliminarMovimiento(btn) — borra un movimiento genérico y revierte su
     efecto en los saldos de todas las cuentas involucradas. Bloquea el
     borrado si el movimiento es "secundario" (generado automáticamente por
     otra sección — encargos, cajitas, cuentas personalizadas, deudores,
     etc.) y redirige al usuario a la sección de origen.

   ¿CUÁNDO UN MOVIMIENTO NUEVO NECESITA `_secundario: true` + `_origenSeccion`?
   (regla fijada 2026-08-05, tras el bug de "Margen de encargo" borrable directo
   — ver CHANGELOG.md § Encargos, misma fecha)

   NO es "¿hay un objeto o dos?" — es "¿el borrado genérico de acá abajo sabe
   deshacer TODO lo que este movimiento implica?". Dos formas de que falle:

   (a) Estructural — el objeto vive en un array que ninguna rama del switch
       de abajo (movTipoEl === ...) sabe limpiar. Ej.: un "espejo" guardado
       en `cajita.historial` o en el historial propio de otro módulo — las
       ramas genéricas solo saben tocar S.movimientos, S.gastosVar,
       cuentasPersonalizadas[].movimientos y deudores[].movimientos.
       Si el array de destino no está ahí, borrar revierte el saldo pero
       deja el registro zombie parado para siempre.
   (b) Relacional — el objeto SÍ se borra limpio de su propio array, pero
       tiene un campo que lo liga a un "dueño" en otro módulo (_encMovId,
       spId, _viaEncargo, _tcId...) que no se entera del borrado y sigue
       mostrando el evento como vigente.

   Checklist al agregar un movimiento nuevo generado automáticamente:
     1. ¿En qué array vive realmente? (S.movimientos, cajita.historial,
        historial propio del módulo, etc.)
     2. ¿Hay una rama en el switch de abajo que busque y haga
        splice()/filter() de ESE array exacto para este movTipoEl? Si no →
        _secundario obligatorio (falla (a)).
     3. ¿Tiene un campo que lo liga a un registro "dueño" en otro módulo? Si
        sí, y ese dueño no se revierte solo cuando se borra este → _secundario
        obligatorio (falla (b)).
     4. Solo si las dos anteriores dan limpio (array propio bien barrido, sin
        dueño externo que sincronizar) es seguro dejarlo borrable directo —
        caso real: "Préstamo dado" (deudores[].movimientos), único registro
        del evento, con su propia rama que lo revierte completo.

   Se registran bajo el namespace Events 'core:' (no bajo el de ningún
   módulo) para no dar a entender que un dominio específico es dueño de esta
   lógica — mismo criterio ya usado cuando se migró Cuentas.

   Sin dependencia real de orden de carga: ambas funciones se llaman desde
   data-action="core:..." (click-time), nunca en el momento en que este
   script se parsea — así que basta con que carguen en algún punto antes de
   que Events.on('core:abrirDetalleMov', ...) / Events.on('core:eliminarMovimiento', ...)
   se ejecuten en index.html (que sigue siendo donde se registran, junto al
   resto del wiring de Events).

   Dependen de helpers ya definidos en el núcleo de index.html (S, save,
   refresh, escHtml, fmt, fuenteLabel, fuenteBadgeClass, getSaldoFuente,
   getMovimientosCuenta, sumarFuente, descontarFuente, openSheet, dialogo,
   toast, getMesadaData, mesKey) y de funciones de otros módulos ya migrados
   (tcEliminarCompraInterna/tcEliminarPagoInterna de Tarjetas de Crédito,
   abrirCustomCuenta/renderDetalleCuenta de Cuentas, getEncargo de Encargos)
   — todos ya cargados antes de este archivo en index.html.
   ========================================================================== */

// fuenteLabel() devuelve HTML de confianza (el ícono SVG) cuando el código es
// 'ganancia' — escHtml() sobre ese caso escapa el propio SVG y lo muestra como
// texto literal en vez del ícono. Para cualquier otro código (nombre de cajita/
// cuenta, texto libre del usuario) sigue escapando como siempre. Copia local
// (no importada de prestado.js) porque este archivo es núcleo compartido por
// los 4 módulos con historial de movimientos, y no se puede depender de que
// prestado.js ya haya cargado — mismo criterio de las demás funciones de este
// archivo que evitan acoplarse a un módulo de dominio específico.
function _fuenteLabelHtml(code){
  const raw = fuenteLabel(code);
  return code === 'ganancia' ? raw : escHtml(raw);
}

/* ---- DETALLE DE MOVIMIENTO (sheet) ---- */
// Abre un sheet con el detalle de un movimiento y el saldo de la cuenta
// (de la fuente involucrada) antes y después de ese movimiento.
// `el` es el .gasto-item / .card clickeado, con data-mov-* attributes.
function abrirDetalleMov(el){
  if(!el) return;
  const movId = el.dataset.movId;
  const movTipo = el.dataset.movTipo || '';
  const fuente = el.dataset.movFuenteReal || el.dataset.movFuente || '';
  const montoAbs = parseFloat(el.dataset.movMonto) || 0;
  const cuentaKey = el.dataset.cuentaKey || '';
  let monto, fecha, desc, saldoAntes, saldoDespues, saldoLabel;

  if(cuentaKey==='deudor' || cuentaKey==='tc' || cuentaKey==='encargo'){
    // Movimiento que afecta una deuda/saldo de terceros (préstamo/abono, compra/pago TC, entrada/salida encargo)
    const aumentaSaldo = (movTipo === 'prestamo' || movTipo === 'compra' || movTipo === 'entrada');
    monto = aumentaSaldo ? montoAbs : -montoAbs;
    fecha = el.dataset.movFecha || '';
    desc = el.dataset.movDesc || (aumentaSaldo ? 'Entrada' : 'Salida');
    saldoAntes = parseFloat(el.dataset.movSaldoAntes) || 0;
    saldoDespues = parseFloat(el.dataset.movSaldoDespues) || 0;
    saldoLabel = el.dataset.movSaldoLabel || 'Saldo';
  } else if(!fuente){
    // Sin fuente identificable (ej: mesadas/Spotify legacy sin _fuenteOrigen) — no hay saldo que calcular
    return;
  } else {
  // Reconstruir la lista de movimientos de esta fuente para hallar el saldo histórico
  let lista, idx, signedFn;
  if(cuentaKey==='custom' && fuente.startsWith('custom:')){
    // Usar getMovimientosCuenta (mismo que cuentas estándar) para incluir todas las fuentes
    lista = getMovimientosCuenta(fuente);
    idx = lista.findIndex(m => m._movId === movId);
    if(idx===-1) return;
    signedFn = m => m.monto;
    const m = lista[idx];
    monto = m.monto; fecha = m.fecha; desc = m.desc;
  } else {
    // Cuentas estándar: nequi / efectivo / nu (cajitas) — m.monto ya viene con signo correcto
    const tipoCuenta = fuente.startsWith('cajita:') ? 'nu' : fuente;
    lista = getMovimientosCuenta(tipoCuenta).filter(m=>m.fuente===fuente);
    idx = lista.findIndex(m=> movId ? m._movId===movId : (m.fecha===el.dataset.movFecha && Math.abs(m.monto)===montoAbs));
    if(idx===-1) return;
    signedFn = m => m.monto;
    const m = lista[idx];
    monto = m.monto; fecha = m.fecha; desc = m.desc;
  }

  // saldoActual - suma de montos de movimientos más recientes (idx 0..idx-1) = saldo justo después de este mov
  const saldoActual = getSaldoFuente(fuente);
  let sumaPosteriores = 0;
  for(let j=0;j<idx;j++) sumaPosteriores += signedFn(lista[j]);
  saldoDespues = saldoActual - sumaPosteriores;
  saldoAntes = saldoDespues - monto;
  saldoLabel = fuenteLabel(fuente);
  }

  const esPositivo = monto >= 0;
  const colorMonto = esPositivo ? 'var(--accent)' : 'var(--red)';
  const signo = esPositivo ? '+' : '−';
  const tipoLabel = { gasto:'Gasto', ingreso:'Ingreso', egreso:'Retiro', apertura:'Apertura', prestamo:'Préstamo', abono:'Abono', compra:'Compra', mesada:'Mesada', transferencia:'Transferencia', salida_manual:'Salida' }[movTipo] || movTipo;

  // Sección de origen (módulo donde se registró este movimiento)
  const origenLabel = el.dataset.movOrigen || '';
  const origenHtml = origenLabel ? `
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:14px;font-size:11px;color:var(--text3);">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="flex-shrink:0;"><path d="M9 18l6-6-6-6"/></svg>
      Registrado desde <span style="color:var(--text2);font-weight:500;">${escHtml(origenLabel)}</span>
    </div>` : '';

  // Otras cuentas implicadas en este mismo movimiento (transferencias, splits, etc.)
  let otrasCuentas = [];
  try { otrasCuentas = JSON.parse(el.dataset.movOtras || '[]'); } catch(_){ otrasCuentas = []; }
  const otrasHtml = (otrasCuentas && otrasCuentas.length) ? `
    <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:var(--radius-sm);padding:14px 15px;margin-bottom:14px;">
      <div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px;">Otras cuentas implicadas</div>
      ${otrasCuentas.map(oc=>{
        const ocPos = oc.monto>=0;
        return `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;">
          <span class="badge ${fuenteBadgeClass(oc.fuente)}" style="font-size:9px;">${_fuenteLabelHtml(oc.fuente)}</span>
          <span style="font-size:13px;font-family:'DM Mono',monospace;color:${ocPos?'var(--accent)':'var(--red)'};">${ocPos?'+':'−'} ${fmt(Math.abs(oc.monto))}</span>
        </div>`;
      }).join('')}
    </div>` : '';

  // ── Buscar el objeto raw del movimiento para mostrar info rica ────────────
  let _rawMov = null;
  try {
    if (movId) {
      if (cuentaKey === 'encargo') {
        // Buscar en todos los encargos (no solo el activo, para cubrir casos donde el usuario navegó)
        const encIdHint = el.dataset.movEncId || null;
        const todosEncs = (S.encargos||[]);
        for (const enc of todosEncs) {
          const found = (enc.movimientos||[]).find(m=>m.id===movId);
          if (found) { _rawMov = found; break; }
        }
        // Fallback al encargo activo
        if (!_rawMov) {
          if (typeof getEncargo==='function') {
            const enc = getEncargo(encargoActualId);
            if (enc) _rawMov = (enc.movimientos||[]).find(m=>m.id===movId) || null;
          }
        }
      } else if (cuentaKey === 'deudor') {
        for (const d of (S.deudores||[])) {
          const found = (d.movimientos||[]).find(m=>m.id===movId);
          if (found) { _rawMov = found; break; }
        }
      } else if (cuentaKey === 'tc') {
        for (const tc of (S.tarjetasCredito||[])) {
          _rawMov = (tc.compras||[]).find(m=>m.id===movId)
                 || (tc.pagos||[]).find(m=>m.id===movId)
                 || null;
          if (_rawMov) break;
        }
        if (!_rawMov) _rawMov = (S.tcMovimientos||[]).find(m=>m.id===movId) || null;
      } else {
        // Cuentas estándar/custom: busca en gastosVar, S.movimientos, transferencias, deudores (abonos), mesadas, Spotify
        _rawMov = (S.gastosVar||[]).find(m=>m.id===movId)
               || (S.movimientos||[]).find(m=>m.id===movId)
               || (S.transferencias||[]).find(m=>m.id===movId)
               || null;
        if (!_rawMov) {
          for (const d of (S.deudores||[])) {
            const found = (d.movimientos||[]).find(m=>m.id===movId);
            if (found) { _rawMov = found; break; }
          }
        }
        if (!_rawMov && fuente.startsWith('custom:')) {
          const cid = fuente.split(':')[1];
          const c = (S.cuentasPersonalizadas||[]).find(x=>x.id===cid);
          if (c) _rawMov = (c.movimientos||[]).find(m=>m.id===movId) || null;
        }
      }
    }
  } catch(_){}

  // ── Info rica del movimiento raw en lenguaje claro ──────────────────────
  let richHtml = '';
  if (_rawMov) {
    const rm = _rawMov;
    const richParts = [];

    // Nota del movimiento (si es distinta a la descripción principal)
    if (rm.nota && rm.nota !== desc && !/automáticamente|contable neutro/i.test(rm.nota)) {
      richParts.push(`
        <div style="padding:10px 12px;background:var(--bg3);border:1px solid var(--border2);border-radius:var(--radius-sm);">
          <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Nota</div>
          <div style="font-size:12px;color:var(--text2);line-height:1.5;">${escHtml(rm.nota)}</div>
        </div>`);
    }

    // ── Sobrante del diferencial de encargo (ingreso generado automáticamente) ─
    if (rm._esDiferencialEncargo) {
      const encMovRef = rm._encMovId ? (() => {
        for (const enc of (S.encargos||[])) {
          const m = (enc.movimientos||[]).find(x=>x.id===rm._encMovId);
          if (m) return { enc, mov: m };
        }
        return null;
      })() : null;
      const dijo  = rm._difDijo  || (encMovRef?.mov?.monto) || 0;
      const real  = rm._difReal  || 0;
      const margenVal = rm._difMargen || (dijo - real) || 0;
      const encNombre = encMovRef?.enc?.nombre || '';
      const tcUsada = encMovRef?.mov?._tcId ? ((S.tarjetasCredito||[]).find(t=>t.id===encMovRef.mov._tcId)||{}).nombre : '';
      const destino = encMovRef?.mov?._destino ? fuenteLabel(encMovRef.mov._destino) : '';

      richParts.push(`
        <div style="padding:12px 14px;background:rgba(240,184,64,.07);border:1px solid rgba(240,184,64,.22);border-radius:var(--radius-sm);display:flex;flex-direction:column;gap:8px;">
          <div style="font-size:9px;color:var(--amber);text-transform:uppercase;letter-spacing:.5px;font-weight:600;">Sobrante del diferencial — generado automáticamente</div>
          <div style="font-size:12px;color:var(--text3);line-height:1.6;">
            Este ingreso es el margen que quedó a tu favor porque le dijiste al encargo un valor diferente al real cargado a la tarjeta.
          </div>
          ${dijo ? `<div style="display:flex;justify-content:space-between;gap:6px;font-size:12px;"><span style="color:var(--text2);">Le dijiste al encargo</span><span style="font-family:'DM Mono',monospace;font-weight:600;color:var(--text);">${fmt(dijo)}</span></div>` : ''}
          ${real ? `<div style="display:flex;justify-content:space-between;gap:6px;font-size:12px;"><span style="color:var(--text2);">Costó realmente (TC)</span><span style="font-family:'DM Mono',monospace;font-weight:600;color:var(--blue);">${fmt(real)}</span></div>` : ''}
          ${margenVal ? `<div style="display:flex;justify-content:space-between;gap:6px;font-size:12px;"><span style="color:var(--amber);">Margen a tu favor</span><span style="font-family:'DM Mono',monospace;font-weight:600;color:var(--amber);">+ ${fmt(margenVal)}</span></div>` : ''}
          ${tcUsada ? `<div style="display:flex;justify-content:space-between;gap:6px;font-size:12px;"><span style="color:var(--text2);">Tarjeta que se usó</span><span style="font-weight:600;color:var(--blue);">${escHtml(tcUsada)}</span></div>` : ''}
          ${encNombre ? `<div style="display:flex;justify-content:space-between;gap:6px;font-size:12px;"><span style="color:var(--text2);">Encargo origen</span><span style="font-weight:600;color:var(--text2);">${escHtml(encNombre)}</span></div>` : ''}
          ${destino ? `<div style="display:flex;justify-content:space-between;gap:6px;font-size:12px;"><span style="color:var(--text2);">Fondos para pagar la TC en</span><span style="font-weight:600;color:var(--accent);">${escHtml(destino)}</span></div>` : ''}
        </div>`);
    }

    // ── Diferencial / margen ────────────────────────────────────────────────
    if (rm.diferencial) {
      const d = rm.diferencial;
      const benefs = (d.beneficiarios || []).filter(b => b.nombre || b.monto > 0);
      const benefsNorm   = benefs.filter(b => !b.pagadoPorMi);
      const benefsYoPague = benefs.filter(b => b.pagadoPorMi);

      // Frase 1: qué dijo vs qué costó realmente
      richParts.push(`
        <div style="padding:12px 14px;background:rgba(240,184,64,.07);border:1px solid rgba(240,184,64,.2);border-radius:var(--radius-sm);display:flex;flex-direction:column;gap:8px;">
          <div style="font-size:9px;color:var(--amber);text-transform:uppercase;letter-spacing:.5px;font-weight:600;">¿Qué pasó con el precio?</div>
          <div style="font-size:12px;color:var(--text2);line-height:1.7;">
            Le dijiste que costó <strong style="color:var(--text1);">${fmt(d.dijo)}</strong>, pero en realidad costó <strong style="color:var(--text1);">${fmt(d.real)}</strong>.
            La diferencia de <strong style="color:var(--amber);">${fmt(d.margen)}</strong> ${d.margen > 0 ? 'es tu margen' : 'es pérdida tuya'}.
          </div>
          ${d.yoMeQuedo > 0 && d.miCuenta ? `
          <div style="font-size:12px;color:var(--text2);">
            Guardaste <strong style="color:var(--accent);">${fmt(d.yoMeQuedo)}</strong> en <strong>${_fuenteLabelHtml(d.miCuenta)}</strong>.
          </div>` : ''}
          ${benefsNorm.length ? `
          <div style="font-size:12px;color:var(--text2);">
            Del margen le diste:
            ${benefsNorm.map(b => `<span style="display:inline-block;margin-top:3px;padding:2px 8px;background:rgba(240,184,64,.12);border-radius:4px;font-size:11px;"><strong>${escHtml(b.nombre)}</strong> → ${fmt(b.monto)}</span>`).join(' ')}
          </div>` : ''}
          ${benefsYoPague.length ? `
          <div style="font-size:12px;color:var(--text2);">
            Pagaste de tu bolsillo por:
            ${benefsYoPague.map(b => `<span style="display:inline-block;margin-top:3px;padding:2px 8px;background:rgba(96,176,240,.1);border-radius:4px;font-size:11px;color:var(--blue);"><strong>${escHtml(b.nombre)}</strong> ${fmt(b.monto)}${b.miCuentaSalida ? ' desde ' + _fuenteLabelHtml(b.miCuentaSalida) : ''}${b.miCuentaEntrada ? ' → recuperas en ' + _fuenteLabelHtml(b.miCuentaEntrada) : ''}</span>`).join(' ')}
            <div style="font-size:11px;color:var(--text3);margin-top:4px;">Pusiste esa plata de tu cuenta pero se te descuenta del encargo, así que es plata neutra.</div>
          </div>` : ''}
        </div>`);
    }

    // ── Extra del abono (deudores: dónde fue el extra del pago) ───────────
    if (rm._extPartes && rm._extPartes.length) {
      const extraTotal = rm._extPartes.reduce((a,p)=>a+(p.monto||0),0);
      richParts.push(`
        <div style="padding:12px 14px;background:rgba(96,176,240,.06);border:1px solid rgba(96,176,240,.18);border-radius:var(--radius-sm);display:flex;flex-direction:column;gap:6px;">
          <div style="font-size:9px;color:var(--blue);text-transform:uppercase;letter-spacing:.5px;font-weight:600;">¿A dónde fue el extra del pago? (${fmt(extraTotal)})</div>
          ${rm._extPartes.map(p => {
            if (p.tipo==='guardar')   return `<div style="font-size:12px;color:var(--text2);">→ Guardaste <strong style="color:var(--accent);">${fmt(p.monto)}</strong> en <strong>${_fuenteLabelHtml(p.cuenta)}</strong></div>`;
            if (p.tipo==='gastar')    return `<div style="font-size:12px;color:var(--text2);">→ Se usó como gasto <strong>${fmt(p.monto)}</strong></div>`;
            if (p.tipo==='regalar')   return `<div style="font-size:12px;color:var(--text2);">→ Lo regalaste: <strong>${fmt(p.monto)}</strong></div>`;
            if (p.tipo==='pendiente') return `<div style="font-size:12px;color:var(--text2);">→ Quedó sin asignar: <strong>${fmt(p.monto)}</strong></div>`;
            return '';
          }).filter(Boolean).join('')}
        </div>`);
    }

    // ── Ganancia virtual en préstamo (no salió plata real) ─────────────────
    if (rm._gananciaVirtual) {
      richParts.push(`
        <div style="padding:12px 14px;background:rgba(200,240,96,.06);border:1px solid rgba(200,240,96,.18);border-radius:var(--radius-sm);">
          <div style="font-size:9px;color:var(--accent);text-transform:uppercase;letter-spacing:.5px;font-weight:600;margin-bottom:5px;">Ganancia incluida</div>
          <div style="font-size:12px;color:var(--text2);line-height:1.6;">
            De este préstamo, <strong style="color:var(--accent);">${fmt(rm._gananciaVirtual)}</strong> son ganancia tuya que se registró como si los hubieras prestado, pero no salieron de ninguna cuenta.
          </div>
        </div>`);
    }

    // ── Fuentes split del préstamo ──────────────────────────────────────────
    if (rm.fuentes && rm.fuentes.length && !otrasCuentas.length) {
      richParts.push(`
        <div style="padding:12px 14px;background:var(--bg3);border:1px solid var(--border2);border-radius:var(--radius-sm);">
          <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Salió de</div>
          ${rm.fuentes.map(f=>`<div style="font-size:12px;color:var(--text2);padding:2px 0;"><strong>${_fuenteLabelHtml(f.fuente)}</strong> → ${fmt(f.monto)}</div>`).join('')}
        </div>`);
    }

    // ── Destinos del abono ──────────────────────────────────────────────────
    if (!otrasCuentas.length && (rm.destinos?.length || rm.destino)) {
      const destinos = rm.destinos?.length ? rm.destinos : [{fuente: rm.destino, monto: rm.monto}];
      richParts.push(`
        <div style="padding:12px 14px;background:var(--bg3);border:1px solid var(--border2);border-radius:var(--radius-sm);">
          <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Entró a</div>
          ${destinos.map(r=>`<div style="font-size:12px;color:var(--text2);padding:2px 0;"><strong>${_fuenteLabelHtml(r.fuente)}</strong>${r.monto ? ' → ' + fmt(r.monto) : ''}</div>`).join('')}
        </div>`);
    }

    // ── Compra de encargo pagada con TC ────────────────────────────────────
    if (rm._esTcEncargo) {
      const tc = (S.tarjetasCredito||[]).find(t=>t.id===rm._tcId);
      const tcNombre = tc ? tc.nombre : (rm._tcId || 'tarjeta desconocida');
      const montoEnc = rm.monto;         // lo que salió del encargo (= lo que se le dijo)
      const montoReal = rm._tcMonto || montoEnc;  // lo que realmente se cargó a la TC
      const hayMargen = montoEnc !== montoReal && Math.abs(montoEnc - montoReal) > 0.5;
      const destinoLabel = rm._destino ? fuenteLabel(rm._destino) : '';

      richParts.push(`
        <div style="padding:12px 14px;background:rgba(96,176,240,.07);border:1px solid rgba(96,176,240,.22);border-radius:var(--radius-sm);display:flex;flex-direction:column;gap:8px;">
          <div style="font-size:9px;color:var(--blue);text-transform:uppercase;letter-spacing:.5px;font-weight:600;">Compra pagada con tarjeta de crédito</div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap;">
            <span style="font-size:12px;color:var(--text2);">Tarjeta usada</span>
            <span style="font-size:12px;font-weight:600;color:var(--blue);">${escHtml(tcNombre)}</span>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap;">
            <span style="font-size:12px;color:var(--text2);">Salió del encargo</span>
            <span style="font-size:13px;font-family:'DM Mono',monospace;font-weight:600;color:var(--red);">− ${fmt(montoEnc)}</span>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap;">
            <span style="font-size:12px;color:var(--text2);">Cargado a la TC</span>
            <span style="font-size:13px;font-family:'DM Mono',monospace;font-weight:600;color:var(--blue);">+ ${fmt(montoReal)}</span>
          </div>
          ${hayMargen ? `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap;">
            <span style="font-size:12px;color:var(--amber);">Diferencia (tu margen)</span>
            <span style="font-size:13px;font-family:'DM Mono',monospace;font-weight:600;color:var(--amber);">+ ${fmt(montoEnc - montoReal)}</span>
          </div>` : ''}
          ${destinoLabel ? `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap;">
            <span style="font-size:12px;color:var(--text2);">Fondos reservados para pagar la TC</span>
            <span style="font-size:12px;font-weight:600;color:var(--accent);">${escHtml(destinoLabel)}</span>
          </div>` : ''}
        </div>`);
    }

    // ── Vía tarjeta de crédito ──────────────────────────────────────────────
    if (rm._viaTC && rm._tcId) {
      const tcName = ((S.tarjetasCredito||[]).find(t=>t.id===rm._tcId)||{}).nombre||'';
      if (tcName) richParts.push(`
        <div style="padding:10px 12px;background:rgba(96,176,240,.06);border:1px solid rgba(96,176,240,.18);border-radius:var(--radius-sm);">
          <div style="font-size:12px;color:var(--text2);">Compra hecha con la tarjeta <strong>${escHtml(tcName)}</strong> — la deuda la tiene el deudor, no tu tarjeta.</div>
        </div>`);
    }

    // ── Vía encargo ─────────────────────────────────────────────────────────
    if (rm._viaEncargo && rm._encNombre) {
      richParts.push(`
        <div style="padding:10px 12px;background:rgba(96,176,240,.06);border:1px solid rgba(96,176,240,.18);border-radius:var(--radius-sm);">
          <div style="font-size:12px;color:var(--text2);">Este pago salió del encargo de <strong>${escHtml(rm._encNombre)}</strong>, no de tu bolsillo directamente.</div>
        </div>`);
    }

    if (richParts.length) {
      richHtml = `<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">${richParts.join('')}</div>`;
    }
  }

  document.getElementById('mvdContent').innerHTML = `
    <div style="text-align:center;padding:6px 0 18px;">
      <div style="font-size:11px;color:var(--text3);font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px;">${escHtml(tipoLabel)}</div>
      <div style="font-size:28px;font-weight:600;font-family:'DM Mono',monospace;color:${colorMonto};margin-bottom:6px;">${signo} ${fmt(Math.abs(monto))}</div>
      <div style="font-size:13px;color:var(--text2);">${escHtml(desc)}</div>
      <div style="font-size:11px;color:var(--text3);font-family:'DM Mono',monospace;margin-top:4px;">${escHtml(fecha)}</div>
    </div>
    ${origenHtml}
    <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:var(--radius-sm);padding:14px 15px;margin-bottom:14px;">
      <div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px;">${(cuentaKey==='deudor'||cuentaKey==='tc'||cuentaKey==='encargo') ? escHtml(saldoLabel) : 'Saldo en ' + escHtml(saldoLabel)}</div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <div>
          <div style="font-size:10px;color:var(--text3);margin-bottom:2px;">Antes</div>
          <div style="font-size:15px;font-family:'DM Mono',monospace;color:var(--text2);">${fmt(saldoAntes)}</div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2" stroke-linecap="round" style="flex-shrink:0;"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        <div style="text-align:right;">
          <div style="font-size:10px;color:var(--text3);margin-bottom:2px;">Después</div>
          <div style="font-size:15px;font-family:'DM Mono',monospace;color:${colorMonto};font-weight:600;">${fmt(saldoDespues)}</div>
        </div>
      </div>
    </div>
    ${otrasHtml}
    ${richHtml}`;
  openSheet('mov-detalle');
}


// Motor de filtros de movimientos (renderMovsCuenta y compañía) migrado a js/modules/cuentas.js.

/* ---- ELIMINAR MOVIMIENTO (con reversión bidireccional) ---- */
// Cantidad de movimientos manuales (S.movimientos: salida_manual/ingreso/
// apertura/entrada) o transferencias (S.transferencias) posteriores que
// tocaron la misma cuenta — criterio de "operaciones posteriores" de la
// protección por antigüedad (ver core-state.js#nivelAntiguedadMovimiento y
// docs/proteccion-antiguedad-movimientos.md §4). No cuenta movimientos de
// módulos con su propio historial (Mesada, Spotify, etc.) ni de Alcancía/
// CDT/Plata Comprometida, que llevan su propio registro aparte.
function _cuentaOpsPosteriores(cuenta, fecha, excludeId) {
  if (!cuenta || !fecha) return 0;
  let count = 0;
  (S.movimientos || []).forEach(m => {
    if (m.id === excludeId || !m.fecha || m.fecha <= fecha) return;
    if (m.fuente === cuenta) count++;
  });
  (S.transferencias || []).forEach(t => {
    if (t.id === excludeId || !t.fecha || t.fecha <= fecha) return;
    if (t.origen === cuenta || t.destino === cuenta) count++;
  });
  return count;
}

async function eliminarMovimiento(btn) {
  const item = btn.closest('.gasto-item');
  if (!item) return;
  const movId = item.dataset.movId;
  const movTipoEl = item.dataset.movTipo;
  const fuenteOrigen = item.dataset.movFuente;
  const fuenteDestino = item.dataset.movDestino;
  const monto = parseFloat(item.dataset.movMonto) || 0;
  const fechaItem = item.dataset.movFecha || '';

  // Bloquear si es un movimiento secundario (generado automáticamente por otra sección)
  const movObj = (S.movimientos || []).find(x => x.id === movId)
    || (() => { for (const enc of (S.encargos||[])) { const m=(enc.movimientos||[]).find(x=>x.id===movId); if(m) return m; } return null; })()
    || (() => { for (const caj of (S.cajitas||[])) { const m=(caj.historial||[]).find(x=>x.id===movId); if(m) return m; } return null; })()
    || (() => { for (const cc of (S.cuentasPersonalizadas||[])) { const m=(cc.movimientos||[]).find(x=>x.id===movId); if(m) return m; } return null; })()
    || (() => { for (const d of (S.deudores||[])) { const m=(d.movimientos||[]).find(x=>x.id===movId); if(m) return m; } return null; })()
    || (S.gastosVar || []).find(x => x.id === movId)
    || (S.spotifyHistorial || []).find(x => x.id === movId);
  if (movObj && movObj._secundario) {
    const seccion = movObj._origenSeccion || 'la sección de origen';
    await dialogo('Movimiento vinculado', `Este movimiento fue generado automáticamente desde ${seccion}. Para eliminarlo, ve a ${seccion} y borra el movimiento principal — eso revertirá todo.`, 'Entendido', false);
    return;
  }

  // Protección por antigüedad — ver docs/proteccion-antiguedad-movimientos.md.
  // Resuelto ANTES de la confirmación genérica de abajo porque el nivel
  // 'viejo'/'bloqueado' usa su propio diálogo en vez del genérico. Cubre
  // todos los tipos que maneja esta función: 'mesada', 'prestamo'/'abono' y
  // TC (dentro de 'gasto') tienen además su propio punto de entrada en su
  // módulo (mesada.js, prestado.js, tarjetas_credito.js respectivamente, que
  // aplican la misma protección por su cuenta); 'transferencia',
  // 'salida_manual', 'ingreso'/'apertura'/'entrada' y el 'gasto' genérico
  // (no-TC) solo se pueden borrar desde acá, así que es su único punto de
  // entrada.
  let confirmado = false;
  if (movTipoEl === 'mesada') {
    let target = null;
    ['papa', 'mama'].forEach(parent => {
      const data = getMesadaData(parent);
      Object.keys(data).forEach(k => { if (data[k] && data[k]._id === movId) target = { parent, key: k, info: data[k] }; });
    });
    if (target) {
      const opsPosteriores = _mesadaOpsPosteriores(target.parent, target.key, target.info);
      const nivel = nivelAntiguedadMovimiento(target.info.fecha, opsPosteriores, 'mesada');
      if (nivel === 'bloqueado') { await avisarMovimientoBloqueado(); return; }
      if (nivel === 'viejo') {
        const fuentes = _mesadaFuentesDe(target.info);
        const nombreCuenta = fuentes.length > 1 ? `${fuentes.length} cuentas` : fuenteLabel(fuentes[0]);
        confirmado = await confirmarBorrarMovimientoViejo(nombreCuenta, target.info.monto || 0, 'baja');
        if (!confirmado) return;
      }
    }
  } else if (movTipoEl === 'gasto') {
    const g = (S.gastosVar || []).find(x => x.id === movId);
    if (g && (g._esCompraTC || g._esPagoTC) && g._tcId) {
      const tc = (S.tarjetasCredito || []).find(x => x.id === g._tcId);
      const item = g._esCompraTC
        ? (tc && (tc.compras || []).find(c => c.id === g._tcCompraId))
        : (tc && (tc.pagos || []).find(p => p.id === g._tcPagoId));
      if (tc && item) {
        const opsPosteriores = _tcOpsPosteriores(tc, item.fecha, item.id);
        const nivel = nivelAntiguedadMovimiento(item.fecha, opsPosteriores, 'tarjetas');
        if (nivel === 'bloqueado') { await avisarMovimientoBloqueado(); return; }
        if (nivel === 'viejo') {
          confirmado = await confirmarBorrarMovimientoViejo(tc.nombre, item.monto || 0, g._esCompraTC ? 'baja' : 'sube', 'deuda');
          if (!confirmado) return;
        }
      }
    } else if (g && g.fuente) {
      // Gasto variable genérico (no TC): plata salió de g.fuente.
      const opsPosteriores = _cuentaOpsPosteriores(g.fuente, g.fecha, g.id);
      const nivel = nivelAntiguedadMovimiento(g.fecha, opsPosteriores, 'gastos');
      if (nivel === 'bloqueado') { await avisarMovimientoBloqueado(); return; }
      if (nivel === 'viejo') {
        confirmado = await confirmarBorrarMovimientoViejo(fuenteLabel(g.fuente), g.monto || 0, 'sube');
        if (!confirmado) return;
      }
    }
  } else if (movTipoEl === 'transferencia') {
    const tr = (S.transferencias || []).find(t => t.id === movId);
    if (tr) {
      const fecha = tr.fecha || fechaItem;
      const opsPosteriores = Math.max(_cuentaOpsPosteriores(tr.origen, fecha, tr.id), _cuentaOpsPosteriores(tr.destino, fecha, tr.id));
      const nivel = nivelAntiguedadMovimiento(fecha, opsPosteriores, 'cuentas');
      if (nivel === 'bloqueado') { await avisarMovimientoBloqueado(); return; }
      if (nivel === 'viejo') {
        // Dos cuentas afectadas en direcciones opuestas — no encaja en
        // confirmarBorrarMovimientoViejo() (una cuenta, una dirección), así
        // que se arma un diálogo propio con el mismo espíritu.
        confirmado = await dialogo(
          'Movimiento antiguo',
          `Esta transferencia ya tiene tiempo y puede estar mezclada con operaciones más recientes. Si la eliminas, "${fuenteLabel(tr.origen)}" recupera ${fmt(tr.monto)} y "${fuenteLabel(tr.destino)}" pierde ${fmt(tr.monto)} ahora mismo — no se recalcula el historial completo. ¿Eliminar de todas formas?`,
          'Eliminar de todas formas', true
        );
        if (!confirmado) return;
      }
    }
  } else if (movTipoEl === 'salida_manual') {
    const m = (S.movimientos || []).find(x => x.id === movId);
    if (m && m.fuente) {
      const fecha = m.fecha || fechaItem;
      const opsPosteriores = _cuentaOpsPosteriores(m.fuente, fecha, m.id);
      const nivel = nivelAntiguedadMovimiento(fecha, opsPosteriores, 'cuentas');
      if (nivel === 'bloqueado') { await avisarMovimientoBloqueado(); return; }
      if (nivel === 'viejo') {
        confirmado = await confirmarBorrarMovimientoViejo(fuenteLabel(m.fuente), m.monto || 0, 'sube');
        if (!confirmado) return;
      }
    }
  } else if (movTipoEl === 'ingreso' || movTipoEl === 'apertura' || movTipoEl === 'entrada' || movTipoEl === 'egreso') {
    const m = (S.movimientos || []).find(x => x.id === movId);
    const fuente = (m && m.fuente) || fuenteOrigen;
    const fecha = (m && m.fecha) || fechaItem;
    if (fuente) {
      const opsPosteriores = _cuentaOpsPosteriores(fuente, fecha, m ? m.id : null);
      const nivel = nivelAntiguedadMovimiento(fecha, opsPosteriores, 'cuentas');
      if (nivel === 'bloqueado') { await avisarMovimientoBloqueado(); return; }
      if (nivel === 'viejo') {
        confirmado = await confirmarBorrarMovimientoViejo(fuenteLabel(fuente), (m ? m.monto : monto) || 0, movTipoEl === 'egreso' ? 'sube' : 'baja');
        if (!confirmado) return;
      }
    }
  } else if (movTipoEl === 'prestamo' || movTipoEl === 'abono') {
    let target = null;
    (S.deudores || []).forEach(d => {
      const m = (d.movimientos || []).find(x => x.id === movId);
      if (m) target = { d, m };
    });
    if (target) {
      const opsPosteriores = _deudorOpsPosteriores(target.d, target.m);
      const nivel = nivelAntiguedadMovimiento(target.m.fecha, opsPosteriores, 'prestamos');
      if (nivel === 'bloqueado') { await avisarMovimientoBloqueado(); return; }
      if (nivel === 'viejo') {
        const cuentas = _deudorCuentasDe(target.m);
        const nombreCuenta = cuentas.length > 1 ? `${cuentas.length} cuentas` : fuenteLabel(cuentas[0]);
        confirmado = await confirmarBorrarMovimientoViejo(nombreCuenta, target.m.monto || 0, movTipoEl === 'prestamo' ? 'sube' : 'baja');
        if (!confirmado) return;
      }
    }
  }

  // Confirmación
  if (!confirmado) {
    const ok = await dialogo('Eliminar movimiento', '¿Eliminar este movimiento? Se revertirá el efecto en los saldos de todas las cuentas involucradas.', 'Eliminar', true);
    if (!ok) return;
  }

  // Revertir según el tipo
  if (movTipoEl === 'transferencia') {
    // Una transferencia afecta dos cuentas: origen pierde, destino gana.
    // Para revertir: origen recupera, destino pierde.
    const tr = (S.transferencias || []).find(t => t.id === movId);
    if (tr) {
      sumarFuente(tr.origen, tr.monto);   // devolver al origen
      descontarFuente(tr.destino, tr.monto); // quitar del destino
      S.transferencias = S.transferencias.filter(t => t.id !== movId);
    }
  } else if (movTipoEl === 'salida_manual') {
    // Fue una salida manual (S.movimientos tipo 'salida_manual')
    const m = (S.movimientos || []).find(x => x.id === movId);
    if (m) {
      sumarFuente(m.fuente, m.monto);
      // Si era movimiento de cuenta custom, eliminar también de c.movimientos (doble-escritura)
      if (m.fuente && m.fuente.startsWith('custom:')) {
        const cid = m.fuente.split(':')[1];
        const cc = (S.cuentasPersonalizadas || []).find(x => x.id === cid);
        if (cc) cc.movimientos = (cc.movimientos || []).filter(x => x.id !== movId);
      }
      S.movimientos = S.movimientos.filter(x => x.id !== movId);
    }
  } else if (movTipoEl === 'ingreso' || movTipoEl === 'apertura' || movTipoEl === 'entrada') {
    // Fue una entrada manual (S.movimientos tipo 'entrada', 'apertura', o legacy 'ingreso')
    const m = (S.movimientos || []).find(x => x.id === movId);
    if (m) {
      const fuente = m.fuente || fuenteOrigen;
      if (fuente) descontarFuente(fuente, m.monto);
      else if (monto > 0 && fuenteOrigen) descontarFuente(fuenteOrigen, monto);
      if (m.tipo === 'apertura') {
        if(!S._ajustesBaseLog) S._ajustesBaseLog = [];
        S._ajustesBaseLog.push({ fecha: hoy(), monto: -(m.monto||0) });
      }
      // Si era movimiento de cuenta custom, eliminar también de c.movimientos (doble-escritura)
      if (fuente && fuente.startsWith('custom:')) {
        const cid = fuente.split(':')[1];
        const cc = (S.cuentasPersonalizadas || []).find(x => x.id === cid);
        if (cc) cc.movimientos = (cc.movimientos || []).filter(x => x.id !== movId);
      }
      S.movimientos = S.movimientos.filter(x => x.id !== movId);
    } else if (fuenteOrigen && monto > 0) {
      // El registro no vive en S.movimientos — caso típico de la "Saldo inicial"
      // de una cuenta personalizada: crearMovimientoApertura() (core-state.js)
      // solo devuelve el objeto, y cuentas.js lo empuja directo a c.movimientos
      // (línea ~239) sin pasar nunca por S.movimientos. Antes este fallback
      // revertía el saldo pero no limpiaba nada más, dejando el registro
      // huérfano en c.movimientos para siempre — visible en pantalla aunque la
      // plata ya se hubiera devuelto. Ver CHANGELOG.md#cuentas (2026-08-31).
      descontarFuente(fuenteOrigen, monto);
      if (fuenteOrigen.startsWith('custom:')) {
        const cid = fuenteOrigen.split(':')[1];
        const cc = (S.cuentasPersonalizadas || []).find(x => x.id === cid);
        if (cc) cc.movimientos = (cc.movimientos || []).filter(x => x.id !== movId);
      }
      if (movTipoEl === 'apertura') {
        if(!S._ajustesBaseLog) S._ajustesBaseLog = [];
        S._ajustesBaseLog.push({ fecha: hoy(), monto: -monto });
      }
    }
  } else if (movTipoEl === 'egreso') {
    // Retiro manual de una cuenta personalizada. _getMovimientosCuentaCustom()
    // (cuentas.js) muestra así CUALQUIER salida de una cuenta custom — tanto si
    // el registro original vive en S.movimientos (tipo 'salida_manual') como si
    // solo vive en c.movimientos (tipo 'egreso'/'salida_manual', doble-escritura
    // de confirmarMovCustom()). Hasta ahora ninguna rama de este switch coincidía
    // con 'egreso': el borrado no revertía el saldo (c.saldo) ni quitaba el
    // registro de ninguno de los dos arrays, y aun así caía en el
    // save()+refresh()+toast de éxito de más abajo — ver CHANGELOG.md#cuentas
    // (2026-08-30).
    const fuente = fuenteOrigen; // siempre 'custom:ID' para este tipoDisplay (ver dataFuente en cuentas.js)
    if (fuente && monto > 0) sumarFuente(fuente, monto);
    S.movimientos = (S.movimientos || []).filter(x => x.id !== movId);
    if (fuente && fuente.startsWith('custom:')) {
      const cid = fuente.split(':')[1];
      const cc = (S.cuentasPersonalizadas || []).find(x => x.id === cid);
      if (cc) cc.movimientos = (cc.movimientos || []).filter(x => x.id !== movId);
    }
  } else if (movTipoEl === 'gasto') {
    // Gasto variable (S.gastosVar)
    const g = (S.gastosVar || []).find(x => x.id === movId);
    if (g) {
      if (g._esCompraTC && g._tcId) {
        // Compra de TC: marcar como eliminada en tc.compras (nunca se borra
        // físicamente) y recalcular la deuda — NO usar sumarFuente aquí.
        // FIX: tcEliminarCompraInterna es una mutación real (revierte deuda),
        // no un render — si tarjetas_credito.js no está cargado, hay que
        // esperarlo (Loader.ensure) y abortar todo el borrado si falla, en
        // vez de borrar el gasto y dejar la tarjeta con la deuda vieja.
        if (typeof tcEliminarCompraInterna!=='function') {
          try { await Loader.ensure('tarjetas'); }
          catch(err) { toast('No se pudo cargar Tarjetas de Crédito. Intenta de nuevo.', 'err', 4000); return; }
        }
        const tc = (S.tarjetasCredito || []).find(x => x.id === g._tcId);
        if (tc && g._tcCompraId) tcEliminarCompraInterna(tc, g._tcCompraId);
      } else if (g._esPagoTC && g._tcId) {
        // Pago de TC: restaurar la deuda en la tarjeta Y devolver la plata a
        // la cuenta origen (antes solo se hacía lo segundo — la deuda de la
        // TC quedaba mal para siempre).
        if (typeof tcEliminarPagoInterna!=='function') {
          try { await Loader.ensure('tarjetas'); }
          catch(err) { toast('No se pudo cargar Tarjetas de Crédito. Intenta de nuevo.', 'err', 4000); return; }
        }
        const tc = (S.tarjetasCredito || []).find(x => x.id === g._tcId);
        if (tc && g._tcPagoId) tcEliminarPagoInterna(tc, g._tcPagoId);
        if (g.fuente) sumarFuente(g.fuente, g.monto);
      } else if (g.fuente) {
        sumarFuente(g.fuente, g.monto); // devolver el dinero
      }
      // Bug fix: si era pago de gasto fijo, desmarcar como pagado
      if(g.esPagoGastoFijo && g.gastoFijoId){
        const mes = mesKey(g.fecha);
        if(S.pagosGastosFijos) delete S.pagosGastosFijos[g.gastoFijoId+'_'+mes];
      }
      S.gastosVar = S.gastosVar.filter(x => x.id !== movId);
    }
  } else if (movTipoEl === 'prestamo') {
    // Préstamo dado (S.deudores[].movimientos)
    let found = false;
    (S.deudores || []).forEach(d => {
      const idx = (d.movimientos || []).findIndex(m => m.id === movId);
      if (idx !== -1) {
        const mov = d.movimientos[idx];
        if (mov.fuente) sumarFuente(mov.fuente, mov.monto); // devolver plata a la fuente
        d.movimientos.splice(idx, 1);
        found = true;
      }
    });
  } else if (movTipoEl === 'abono') {
    // Abono recibido (S.deudores[].movimientos)
    (S.deudores || []).forEach(d => {
      const idx = (d.movimientos || []).findIndex(m => m.id === movId);
      if (idx !== -1) {
        const mov = d.movimientos[idx];
        if (mov.destino) descontarFuente(mov.destino, mov.monto); // retirar el abono
        d.movimientos.splice(idx, 1);
      }
    });
  } else if (movTipoEl === 'mesada') {
    // Mesada
    // FIX: getMesadaData es una mutación real (encuentra y borra el registro
    // original + revierte la plata al destino) — mesada.js ya es un grupo
    // lazy real, así que esto rompía HOY (no solo en un escenario futuro) si
    // se eliminaba un movimiento de mesada desde el feed general sin haber
    // visitado antes la pantalla Mesada.
    if (typeof getMesadaData!=='function') {
      try { await Loader.ensure('mesada'); }
      catch(err) { toast('No se pudo cargar Mesada. Intenta de nuevo.', 'err', 4000); return; }
    }
    let found = false;
    ['papa', 'mama'].forEach(parent => {
      const data = getMesadaData(parent);
      Object.keys(data).forEach(k => {
        const info = data[k];
        if (info && info._id === movId) {
          // Revertir destino(s)
          if (info.splits && info.splits.length) {
            info.splits.forEach(s => { if (s.fuente) descontarFuente(s.fuente, s.monto); });
          } else if (info.destino) {
            descontarFuente(info.destino, info.monto);
          }
          delete data[k];
          found = true;
        }
      });
    });
  }

  save(); refresh();
  // Re-render la cuenta activa
  if (cuentaActual) {
    if (cuentaActual === 'custom' && _customCuentaActualId) {
      // Re-abrir la cuenta custom activa para refrescar saldo + movimientos
      if (typeof abrirCustomCuenta==='function') abrirCustomCuenta(_customCuentaActualId);
    } else {
      if (typeof renderDetalleCuenta==='function') renderDetalleCuenta(cuentaActual);
    }
  }
  toast('Movimiento eliminado y saldos revertidos', 'info');
}

// Registro bajo el namespace 'core' — ver nota de cabecera de este archivo.
Events.on('core:abrirDetalleMov', abrirDetalleMov);
Events.on('core:eliminarMovimiento', eliminarMovimiento);
