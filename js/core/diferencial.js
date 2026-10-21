/* ═══════════════════════════════════════════════════════════════
   js/core/diferencial.js

   MOTOR DE DIFERENCIAL — Registro de margen entre "lo que dijiste/
   correspondía" (dijo) y "lo que realmente costó/recibiste" (real).
   margen = dijo - real. El margen se reparte en partes: cada parte
   es "alguien o algo se quedó con tanto", y opcionalmente puede ser
   un INTERCAMBIO (la plata salió de tu bolsillo y la recuperás del
   encargo en otra cuenta).

   Los 4 sheets que muestran este bloque ("Salió plata", "Pague con
   TC", "Préstamo con TC" y "Ya la usé") comparten ahora el mismo
   ícono y el mismo texto de header: "El valor real era diferente /
   Registrar margen cobrado". El sheet "¿Te dio extra de más?" usa
   el mismo motor para el cálculo dijo/real/margen, pero mantiene su
   propio render visual porque su reparto es un menú de tipos de
   destino, no beneficiarios simples. Cada sheet solo registra una
   instancia con su propia config (ids de elementos del DOM + qué
   capacidades habilita) y llama a las funciones genéricas de abajo.
   Para agregar un sheet nuevo con este patrón: copiar el bloque
   HTML de diffHtmlBloque(), llamar a diffRegistrarInstancia(), y
   usar diffAplicar() al confirmar. No hace falta escribir lógica
   nueva.

   ── ESTE ARCHIVO SE CARGA MUY TEMPRANO ──────────────────────────
   Justo después de js/core/events.js y antes que mesada.js/
   spotify.js/gastos.js/prestado.js/encargos.js/tarjetas_credito.js
   — todos ellos llaman a diffRegistrarInstancia()/diffAplicar()/
   diffValidarIntercambios()/diffRenderHistorial() durante su propia inicialización o al
   confirmar sus sheets. Esos módulos NO se tocaron acá: siguen
   llamando estas funciones por nombre, como siempre — son globales
   (script clásico), así que mover el archivo no rompe nada del lado
   de quien lo consume.

   ── QUÉ SE MIGRÓ REALMENTE ──────────────────────────────────────
   Los 4 sheets estáticos en index.html YA usaban data-action para
   sus toggles/agregar-persona (ej. "encargos:difToggle",
   "encargos:difAddBenef") — esos disparan wrappers definidos en los
   módulos externos, que a su vez llaman a las funciones genéricas
   de acá. Eso no se tocó: no hay visibilidad de este lado hacia esos
   wrappers y cambiar el nombre de la acción sin ver dónde se
   registra habría sido arriesgado.

   Lo que SÍ estaba 100% bajo control de este archivo y se migró:
     - diffRenderPartes(): generaba onclick/oninput/onchange en cada
       fila de beneficiario (removeParte, togglePagoYo, setNombre,
       setMonto, setCuentaSalida, setCuentaEntrada). Ahora los clicks
       usan data-action (diferencial:removeParte / diferencial:togglePagoYo)
       y los oninput/onchange se re-adjuntan con addEventListener
       después de cada render (Events solo despacha clicks).
     - diffHtmlBloque(): plantilla de referencia (no se llama desde
       ningún lado activo hoy — el HTML real de los 4 sheets fue
       copiado a mano en su momento, ver comentario arriba). Se
       actualizó igual para que quien la use de acá en más copie ya
       el patrón data-action correcto.

   buildFuentesOptsHtml() se QUEDÓ en index.html a propósito: es
   canónica y la usan muchos módulos más, no es exclusiva de este
   motor (ver su propio comentario ahí). _diffFuentesOptsHtml() es
   un envoltorio delgado específico de este motor, así que sí se
   movió acá.
   ═══════════════════════════════════════════════════════════════ */

// Registro de instancias activas: { [instanciaId]: { cfg, partes, abierto } }
const _diffInstancias = {};

/**
 * Crea (o resetea) una instancia del motor de diferencial.
 * cfg:
 *   ids: { wrap, body, icon, real, partesList, resumen, miCuentaWrap, miCuenta }
 *   permiteBeneficiarios: bool — muestra lista "quién se quedó con qué"
 *   permiteIntercambio: bool — cada beneficiario puede ser "lo pagué yo" (sale de mi cuenta, entra a otra)
 *   origenSeccion: string (opcional) — si se define (ej. 'Encargos'), los movimientos que diffAplicar()
 *     escribe en S.movimientos (margen e intercambios) se marcan _secundario:true + _origenSeccion, así
 *     eliminarMovimiento() (movimientos.js) NO los deja borrar sueltos y manda al usuario a borrar el
 *     movimiento principal. Definirlo SOLO si el módulo dueño revierte esos movimientos al borrar el
 *     principal (Encargos lo hace vía _encMovId en deleteMovEncargo). Sin definir = comportamiento anterior.
 *   permiteMiCuenta: bool — muestra selector de cuenta propia para el sobrante libre
 *   getDijo: () => number — de dónde sacar el monto "dijiste/correspondía"
 *   exigeMargenPositivo: bool — si true, margen<=0 se muestra como error (no permite "cobré de más")
 *   labelMargenNegativo / placeholderSinReal: textos opcionales
 *   descMargen: (movimiento) => string — prefijo de la descripción del ingreso del sobrante libre
 *   onToggle / onResumen: hooks opcionales para sheets con comportamiento extra (preview de saldos, etc.)
 */
function diffRegistrarInstancia(instId, cfg) {
  _diffInstancias[instId] = { cfg, partes: [], abierto: false };
  return _diffInstancias[instId];
}

function diffInst(instId) { return _diffInstancias[instId]; }

function diffReset(instId) {
  const inst = diffInst(instId);
  if (!inst) return;
  inst.partes = [];
  inst.abierto = false;
  const { ids } = inst.cfg;
  const body = document.getElementById(ids.body);
  const icon = document.getElementById(ids.icon);
  const real = document.getElementById(ids.real);
  const resumen = document.getElementById(ids.resumen);
  if (body) body.style.display = 'none';
  if (icon) { icon.textContent = '›'; icon.style.transform = ''; }
  if (real) real.value = '';
  if (resumen) resumen.textContent = '';
  if (ids.miCuentaWrap) { const w = document.getElementById(ids.miCuentaWrap); if (w) w.style.display = 'none'; }
  if (ids.partesList) { const l = document.getElementById(ids.partesList); if (l) l.innerHTML = ''; }
  if (inst.cfg.onReset) inst.cfg.onReset();
}

function diffToggle(instId) {
  const inst = diffInst(instId);
  if (!inst) return;
  const { ids } = inst.cfg;
  const body = document.getElementById(ids.body);
  const icon = document.getElementById(ids.icon);
  if (!body) return;
  inst.abierto = body.style.display === 'none';
  body.style.display = inst.abierto ? '' : 'none';
  if (icon) { icon.textContent = inst.abierto ? '‹' : '›'; icon.style.transform = inst.abierto ? 'rotate(90deg)' : ''; }
  if (inst.abierto) diffResumen(instId);
  if (inst.cfg.onToggle) inst.cfg.onToggle(inst.abierto);
}

function diffEstaAbierto(instId) {
  const inst = diffInst(instId);
  if (!inst) return false;
  const body = document.getElementById(inst.cfg.ids.body);
  return !!body && body.style.display !== 'none';
}

function diffAddParte(instId) {
  const inst = diffInst(instId);
  if (!inst) return;
  inst.partes.push({ nombre: '', monto: 0, pagadoPorMi: false, miCuentaSalida: '', miCuentaEntrada: '' });
  diffRenderPartes(instId);
  diffResumen(instId);
}

function diffRemoveParte(instId, i) {
  const inst = diffInst(instId);
  if (!inst) return;
  inst.partes.splice(i, 1);
  diffRenderPartes(instId);
  diffResumen(instId);
}

function diffSetNombre(instId, i, v) { const inst = diffInst(instId); if (inst) inst.partes[i].nombre = v; }
function diffSetMonto(instId, i, v) { const inst = diffInst(instId); if (!inst) return; inst.partes[i].monto = parseMoney(v) || 0; diffResumen(instId); }

function diffTogglePagoYo(instId, i) {
  const inst = diffInst(instId);
  if (!inst) return;
  const p = inst.partes[i];
  p.pagadoPorMi = !(p.pagadoPorMi || false);
  if (!p.pagadoPorMi) { p.miCuentaSalida = ''; p.miCuentaEntrada = ''; }
  diffRenderPartes(instId);
  diffResumen(instId);
}

function diffSetCuentaSalida(instId, i, v) { const inst = diffInst(instId); if (inst) { inst.partes[i].miCuentaSalida = v; diffResumen(instId); } }
function diffSetCuentaEntrada(instId, i, v) { const inst = diffInst(instId); if (inst) { inst.partes[i].miCuentaEntrada = v; diffResumen(instId); } }

function _diffFuentesOptsHtml(selectedVal, soloConSaldo) {
  return buildFuentesOptsHtml({
    selectedVal,
    soloConSaldo,
    mostrarSaldo: soloConSaldo,
    incluirTC: false,
    placeholder: soloConSaldo ? 'Seleccionar cuenta' : 'Sin especificar'
  });
}

function diffRenderPartes(instId) {
  const inst = diffInst(instId);
  if (!inst) return;
  const { ids, permiteIntercambio } = inst.cfg;
  if (!ids.partesList) return;
  const cont = document.getElementById(ids.partesList);
  if (!cont) return;
  cont.innerHTML = inst.partes.map((b, i) => {
    const pagoYo = permiteIntercambio && (b.pagadoPorMi || false);
    const montoFmt = b.monto ? (typeof fmtInput === 'function' ? fmtInput(b.monto) : String(b.monto)) : '';
    return `
    <div class="diferencial-parte">
      <div class="diferencial-parte-fila">
        <input type="text" placeholder="Nombre (ej: Mi mamá)" value="${escHtml(b.nombre)}"
          class="diff-nombre-input diferencial-input diferencial-input-nombre" data-i="${i}">
        <input type="text" inputmode="decimal" placeholder="Monto" value="${montoFmt}"
          class="diff-monto-input diferencial-input diferencial-input-monto" data-i="${i}">
        <button type="button" ${Events.attr('diferencial:removeParte', instId, i)} class="diferencial-quitar">&#x2715;</button>
      </div>
      ${permiteIntercambio ? `
      <button type="button" ${Events.attr('diferencial:togglePagoYo', instId, i)}
        class="diferencial-pago-yo${pagoYo ? ' activo' : ''}">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M0 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1H0zm0 3h16v5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2zm3 2a.5.5 0 0 0 0 1h1a.5.5 0 0 0 0-1zm2.5 0a.5.5 0 0 0 0 1h2a.5.5 0 0 0 0-1z"/></svg>
        ${pagoYo ? '<i class="fa-solid fa-check diferencial-check"></i> Lo pagué yo (de mi cuenta)' : 'Lo pagué yo (de mi cuenta)'}
      </button>
      ${pagoYo ? `
      <div class="diferencial-cuentas-grid">
        <div>
          <div class="diferencial-etiqueta">De mi cuenta (sale)</div>
          <div class="select-wrap"><select class="diff-cuenta-salida diferencial-select" data-i="${i}">${_diffFuentesOptsHtml(b.miCuentaSalida || '', true)}</select></div>
        </div>
        <div>
          <div class="diferencial-etiqueta diferencial-etiqueta-entra">Y recupero en (entra)</div>
          <div class="select-wrap"><select class="diff-cuenta-entrada diferencial-select" data-i="${i}">${_diffFuentesOptsHtml(b.miCuentaEntrada || '', false)}</select></div>
        </div>
      </div>
      <div class="diferencial-nota-intercambio">
        ↔ Intercambio: yo pago ${b.monto > 0 ? fmt(b.monto) : '?'} de mi cuenta, y recupero ese monto del encargo a la cuenta que elijo.
      </div>` : ''}` : ''}
    </div>`;
  }).join('');

  // oninput/onchange no pasan por el despachador central (Events solo
  // maneja clicks) — como este bloque se reconstruye entero en cada
  // agregar/quitar/toggle, hay que re-adjuntar estos listeners cada vez.
  cont.querySelectorAll('.diff-nombre-input').forEach(el => {
    el.addEventListener('input', function () { diffSetNombre(instId, parseInt(this.dataset.i, 10), this.value); });
  });
  cont.querySelectorAll('.diff-monto-input').forEach(el => {
    el.addEventListener('input', function () { diffSetMonto(instId, parseInt(this.dataset.i, 10), this.value); });
  });
  cont.querySelectorAll('.diff-cuenta-salida').forEach(el => {
    el.addEventListener('change', function () { diffSetCuentaSalida(instId, parseInt(this.dataset.i, 10), this.value); });
  });
  cont.querySelectorAll('.diff-cuenta-entrada').forEach(el => {
    el.addEventListener('change', function () { diffSetCuentaEntrada(instId, parseInt(this.dataset.i, 10), this.value); });
  });
}

/** Calcula dijo/real/margen y el reparto actual de una instancia, sin tocar el DOM. */
function diffCalcular(instId) {
  const inst = diffInst(instId);
  if (!inst) return null;
  const { cfg } = inst;
  const realEl = document.getElementById(cfg.ids.real);
  const dijo = cfg.getDijo ? (cfg.getDijo() || 0) : 0;
  const real = realEl ? (parseMoney(realEl.value) || 0) : 0;
  const margen = dijo - real;

  const partes = cfg.permiteBeneficiarios ? inst.partes : [];
  const normales = partes.filter(b => !b.pagadoPorMi && (b.nombre || b.monto > 0));
  const intercambios = partes.filter(b => b.pagadoPorMi && b.monto > 0);
  const asignadoNormal = normales.reduce((a, b) => a + (b.monto || 0), 0);
  const asignadoIntercambio = intercambios.reduce((a, b) => a + (b.monto || 0), 0);
  const sinAsignar = margen - asignadoNormal - asignadoIntercambio;

  return { dijo, real, margen, normales, intercambios, asignadoNormal, asignadoIntercambio, sinAsignar };
}

function diffResumen(instId) {
  const inst = diffInst(instId);
  if (!inst) return;
  const { cfg } = inst;
  const el = document.getElementById(cfg.ids.resumen);
  if (!el) return;
  const calc = diffCalcular(instId);
  const { dijo, real, margen, normales, intercambios, sinAsignar } = calc;

  if (!dijo && !real) { el.textContent = ''; _diffActualizarMiCuenta(instId, false); if (cfg.onResumen) cfg.onResumen(calc); return; }
  if (!real) { el.textContent = cfg.placeholderSinReal || ''; el.style.color = 'var(--text3)'; _diffActualizarMiCuenta(instId, false); if (cfg.onResumen) cfg.onResumen(calc); return; }

  if (margen <= 0 && cfg.exigeMargenPositivo) {
    el.innerHTML = `<span class="diferencial-mal">${cfg.labelMargenNegativo || 'El valor real debe ser menor que el monto original'}</span>`;
    _diffActualizarMiCuenta(instId, false);
    if (cfg.onResumen) cfg.onResumen(calc);
    return;
  }

  el.style.color = 'var(--text2)';
  let html = `Dijiste: <span class="diferencial-txt">${fmt(dijo)}</span>  Real: <span class="diferencial-txt2">${fmt(real)}</span>  Margen: <span class="${margen >= 0 ? 'diferencial-ok' : 'diferencial-mal'}">${margen >= 0 ? '+' : ''}${fmt(margen)}</span>`;

  let sinAsignarMostrar = sinAsignar;
  if (cfg.permiteBeneficiarios && inst.partes.length && margen > 0) {
    const totalAsignado = calc.asignadoNormal + calc.asignadoIntercambio;
    html += `<br>Asignado: <span class="diferencial-txt2">${fmt(totalAsignado)}</span>  `;
    if (calc.asignadoIntercambio > 0) html += `<span class="diferencial-azul">Intercambio tuyo: ${fmt(calc.asignadoIntercambio)}</span>  `;
    if (Math.abs(sinAsignarMostrar) < 1) {
      html += `<span class="diferencial-ok">&#x2713; Cuadra</span>`;
      sinAsignarMostrar = 0;
    } else if (sinAsignarMostrar > 0) {
      html += `<span class="diferencial-ok">Tuyo: ${fmt(sinAsignarMostrar)}</span>`;
    } else {
      html += `<span class="diferencial-mal">Te pasaste: ${fmt(Math.abs(sinAsignarMostrar))}</span>`;
      sinAsignarMostrar = 0;
    }
  }

  intercambios.forEach(b => {
    if (b.monto > 0) {
      const salida = b.miCuentaSalida ? fuenteLabel(b.miCuentaSalida) : '?';
      const entrada = b.miCuentaEntrada ? fuenteLabel(b.miCuentaEntrada) : '?';
      html += `<br><span class="diferencial-azul">↔ ${escHtml(b.nombre || 'Tú')}: sale ${fmt(b.monto)} de ${salida} · entra ${fmt(b.monto)} a ${entrada}</span>`;
    }
  });

  el.innerHTML = html;

  const margenPositivoLibre = margen > 0 && sinAsignarMostrar > 0.5;
  _diffActualizarMiCuenta(instId, !!cfg.permiteMiCuenta && margenPositivoLibre);
  if (cfg.onResumen) cfg.onResumen(calc);
}

function _diffActualizarMiCuenta(instId, mostrar) {
  const inst = diffInst(instId);
  if (!inst) return;
  const { ids } = inst.cfg;
  if (!ids.miCuentaWrap || !ids.miCuenta) return;
  const wrap = document.getElementById(ids.miCuentaWrap);
  const sel = document.getElementById(ids.miCuenta);
  if (!wrap || !sel) return;
  wrap.style.display = mostrar ? '' : 'none';
  if (mostrar) {
    const prevVal = sel.value;
    sel.innerHTML = '<option value="">Sin especificar (queda como nota)</option>' +
      getFuentesSinTC().map(f => `<option value="${f.val}"${f.val === prevVal ? ' selected' : ''}>${f.label}</option>`).join('');
  }
}

/** Valida que los intercambios "lo pagué yo" tengan saldo suficiente. Retorna string de error o null. */
function diffValidarIntercambios(instId) {
  const inst = diffInst(instId);
  if (!inst) return null;
  const intercambios = inst.partes.filter(b => b.pagadoPorMi && b.monto > 0);
  for (const b of intercambios) {
    if (!b.miCuentaSalida) continue;
    const saldo = getSaldoFuente(b.miCuentaSalida);
    if (b.monto > saldo + 0.5) {
      const nombre = b.nombre ? `"${escHtml(b.nombre)}"` : 'una persona';
      return `No tenés ${fmt(b.monto)} en ${escHtml(fuenteLabel(b.miCuentaSalida))} para pagarle a ${nombre}. Disponible: ${fmt(saldo)}.`;
    }
  }
  return null;
}

/**
 * Valida el reparto del sobrante en varias cuentas (solo si la instancia define
 * cfg.getMiCuentaSplit y el usuario activó "Dividir ÷"). Retorna string de error o null.
 * Con el split apagado, o sin filas con monto, no valida nada (igual que "Sin especificar").
 */
function diffValidarMiCuenta(instId) {
  const inst = diffInst(instId);
  if (!inst || !inst.cfg.permiteMiCuenta || !inst.cfg.getMiCuentaSplit) return null;
  const filas = inst.cfg.getMiCuentaSplit();
  if (!filas || !filas.length) return null;
  if (!diffEstaAbierto(instId)) return null;
  const calc = diffCalcular(instId);
  if (!calc || !calc.real || calc.margen <= 0 || calc.sinAsignar <= 0.5) return null;
  if (filas.some(r => !r.fuente)) return 'Elegí la cuenta en cada fila donde se reparte el sobrante';
  const total = filas.reduce((a, r) => a + r.monto, 0);
  if (Math.abs(total - calc.sinAsignar) > 0.5) {
    return `El sobrante es ${fmt(calc.sinAsignar)} y repartiste ${fmt(total)}. Tienen que coincidir.`;
  }
  return null;
}

/**
 * Aplica los efectos del diferencial sobre `movimiento` (un objeto que ya
 * existe — el préstamo, el abono, el movimiento del encargo, etc).
 * Genera el campo movimiento.diferencial = {dijo, real, margen, beneficiarios, miCuenta, yoMeQuedo}
 * y, si linkId está presente, encadena cada efecto secundario con _encMovId=linkId
 * para que deleteMovEncargo() pueda revertirlos (mismo contrato que usaba el código viejo).
 *
 * Si cfg.permiteMiCuenta es false (ej. "Préstamo con TC": el margen quedó
 * prestado directamente, nunca tocó una cuenta), el sobrante sin asignar se
 * registra igual como un ingreso "fantasma" (fuente:'', sin sumarFuente) para
 * que siga contando en analíticas de ingresos, marcado con cfg.flagIngresoFantasma.
 *
 * Retorna el objeto diferencial guardado, o null si no había nada que aplicar.
 */
function diffAplicar(instId, movimiento, linkId) {
  const inst = diffInst(instId);
  if (!inst) return null;
  if (!diffEstaAbierto(instId)) return null;
  const calc = diffCalcular(instId);
  if (!calc) return null;
  const { dijo, real, margen, normales, intercambios, asignadoNormal, asignadoIntercambio } = calc;
  if (!real) return null;
  if (margen <= 0 && !inst.partes.length) return null;

  const fecha = movimiento.fecha || hoy();
  if (!S.movimientos) S.movimientos = [];
  // Origen de las patas de saldo de este margen (libro-de-movimientos.md §3.3): el módulo es 'diferencial' y el `ref` es
  // el movimiento que lo enlaza (linkId), el mismo con el que quien lo revierte pasa `rev: true`.
  const _ogDif = { origen: { modulo: 'diferencial', ...(linkId ? { ref: linkId } : {}) } };

  const sinAsignar = margen - asignadoNormal - asignadoIntercambio;
  const miCuentaSel = inst.cfg.permiteMiCuenta && inst.cfg.ids.miCuenta ? document.getElementById(inst.cfg.ids.miCuenta) : null;
  // Si la instancia tiene split del sobrante (cfg.getMiCuentaSplit) y está activo,
  // devuelve [{fuente,monto}]; si está en modo "una sola cuenta" devuelve null.
  const repartoMi = (inst.cfg.permiteMiCuenta && inst.cfg.getMiCuentaSplit) ? inst.cfg.getMiCuentaSplit() : null;
  const filasMi = repartoMi ? repartoMi.filter(r => r.fuente && r.monto > 0) : null;
  const miCuenta = filasMi ? (filasMi[0] ? filasMi[0].fuente : '') : (miCuentaSel ? miCuentaSel.value : '');
  const totalFilasMi = filasMi ? filasMi.reduce((a, r) => a + r.monto, 0) : 0;
  const yoMeQuedo = filasMi
    ? (sinAsignar > 0.5 ? Math.min(totalFilasMi, sinAsignar) : 0)
    : ((sinAsignar > 0.5 && miCuenta) ? sinAsignar : 0);
  // Modo "ingreso fantasma": no hay selector de cuenta propia en este sheet, pero el sobrante
  // sigue siendo plata tuya — se registra igual, sin tocar ninguna fuente.
  const yoMeQuedoFantasma = (!inst.cfg.permiteMiCuenta && sinAsignar > 0.5) ? sinAsignar : 0;

  const beneficiariosGuardados = [
    ...normales.map(b => ({ nombre: b.nombre, monto: b.monto })),
    ...intercambios.map(b => ({ nombre: b.nombre, monto: b.monto, pagadoPorMi: true, miCuentaSalida: b.miCuentaSalida || '', miCuentaEntrada: b.miCuentaEntrada || '' }))
  ];

  // Marca de "movimiento secundario" (ver cfg.origenSeccion arriba). Vacío si el módulo no la definió.
  const _sec = inst.cfg.origenSeccion ? { _secundario: true, _origenSeccion: inst.cfg.origenSeccion } : {};

  const diferencial = { dijo, real, margen, beneficiarios: beneficiariosGuardados, miCuenta: yoMeQuedo > 0 ? miCuenta : '', yoMeQuedo: yoMeQuedo || yoMeQuedoFantasma };
  if (filasMi && yoMeQuedo > 0 && filasMi.length > 1) diferencial.miCuentas = filasMi.map(r => ({ cuenta: r.fuente, monto: r.monto }));
  movimiento.diferencial = diferencial;

  // 1) Sobrante libre → ingreso a mi cuenta
  if (yoMeQuedo > 0 && miCuenta) {
    // Una entrada por cada cuenta donde el usuario repartió el sobrante
    // (una sola si no usó "Dividir ÷"). Todas comparten _encMovId para poder revertirse juntas.
    const destinosMi = (filasMi && filasMi.length) ? filasMi : [{ fuente: miCuenta, monto: yoMeQuedo }];
    destinosMi.forEach(r => {
      sumarFuente(r.fuente, r.monto, _ogDif);
      S.movimientos.push({
        id: uid(), tipo: 'entrada', fuente: r.fuente,
        ...(linkId ? { _encMovId: linkId } : {}),
        clase: 'ingreso', _esDiferencialEncargo: true,
        ..._sec,
        _difDijo: dijo, _difReal: real, _difMargen: margen,
        monto: r.monto, fecha,
        desc: (inst.cfg.descMargen ? inst.cfg.descMargen(movimiento) : 'Margen — ') + (movimiento.desc || ''),
        nota: 'Generado automáticamente por el diferencial.',
        ts: Date.now()
      });
    });
  }

  // 1b) Sobrante libre sin cuenta propia disponible en este sheet → ingreso fantasma (fuente vacía)
  if (yoMeQuedoFantasma > 0) {
    S.movimientos.push({
      id: uid(), tipo: 'entrada', fuente: '',
      ...(linkId ? { _encMovId: linkId } : {}),
      clase: 'ingreso', _esDiferencialEncargo: true,
      ..._sec,
      _difDijo: dijo, _difReal: real, _difMargen: margen,
      monto: yoMeQuedoFantasma, fecha,
      desc: (inst.cfg.descMargen ? inst.cfg.descMargen(movimiento) : 'Margen — ') + (movimiento.desc || ''),
      [inst.cfg.flagIngresoFantasma || '_prestadoDirectamente']: true,
      ts: Date.now()
    });
  }

  // 2) Intercambios "lo pagué yo" → egreso de mi cuenta + ingreso equivalente a mi cuenta destino
  intercambios.forEach((b, idx) => {
    if (!b.monto || b.monto <= 0) return;
    const cuentaSalida = b.miCuentaSalida;
    const cuentaEntrada = b.miCuentaEntrada;
    const nombreBenef = b.nombre || 'Persona';

    if (cuentaSalida) {
      descontarFuente(cuentaSalida, b.monto, _ogDif);
      S.movimientos.push({
        id: uid(), tipo: 'transferencia', fuente: cuentaSalida, _fuenteDestino: cuentaEntrada || '',
        ...(linkId ? { _encMovId: linkId } : {}),
        clase: 'neutro', _esIntercambioEncargo: true, _intercambioSalida: true,
        ..._sec,
        monto: b.monto, fecha,
        desc: `Intercambio: le di a ${nombreBenef} de mi ${fuenteLabel(cuentaSalida)}`,
        nota: 'Movimiento contable neutro — no es ingreso ni gasto. Pagué de mi bolsillo, recupero del encargo.',
        ts: Date.now() + idx + 1
      });
    }
    if (cuentaEntrada) {
      sumarFuente(cuentaEntrada, b.monto, _ogDif);
      S.movimientos.push({
        id: uid(), tipo: 'transferencia', fuente: cuentaEntrada, _fuenteDestino: cuentaSalida || '',
        ...(linkId ? { _encMovId: linkId } : {}),
        clase: 'neutro', _esIntercambioEncargo: true, _intercambioEntrada: true,
        ..._sec,
        monto: b.monto, fecha,
        desc: `Intercambio: recupero de ${nombreBenef} en ${fuenteLabel(cuentaEntrada)}`,
        nota: 'Movimiento contable neutro — no es ingreso ni gasto. Equivale al efectivo que di de mi bolsillo.',
        ts: Date.now() + idx + 2
      });
    }
  });

  return diferencial;
}

/** Genera el HTML del bloque colapsable de diferencial para un sheet nuevo.
 *  NOTA: esta función no se llama desde ningún lado activo hoy — es una
 *  plantilla de referencia (ver comentario de cabecera). Se actualizó
 *  igual al patrón data-action para que copiarla en el futuro ya salga
 *  compatible con una CSP estricta. */
function diffHtmlBloque(ids, opts) {
  opts = opts || {};
  const titulo = opts.titulo || 'El valor real era diferente';
  const subtitulo = opts.subtitulo || 'Registrar margen cobrado';
  return `
  <div id="${ids.wrap}" class="diferencial-wrap" style="display:none;">
    <div class="diferencial-cabecera" ${Events.attr('diferencial:toggle', opts.instId)}>
      <div class="diferencial-cabecera-izq">
        <span class="diferencial-icono"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" class="diferencial-svg"><path d="M8 1a.5.5 0 0 1 .5.5V2h1a.75.75 0 0 1 0 1.5H8.5v1h.75a2.25 2.25 0 0 1 0 4.5H8.5V10h1a.75.75 0 0 1 0 1.5H8.5v.5a.5.5 0 0 1-1 0V11.5H6.75a.75.75 0 0 1 0-1.5H7.5V9H6.5A2.25 2.25 0 0 1 4.25 6.75v-.5A.75.75 0 0 1 5 5.5h2.5V4H6.5a.75.75 0 0 1 0-1.5H7.5V1.5A.5.5 0 0 1 8 1zM5.75 6.75A.75.75 0 0 0 6.5 7.5H7.5V6H6.5a.75.75 0 0 0-.75.75zM8.5 9v1.5h.25A.75.75 0 0 0 8.5 9z"/><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.2"/></svg></span>
        <div>
          <div class="diferencial-titulo">${titulo}</div>
          <div class="diferencial-subtitulo">${subtitulo}</div>
        </div>
      </div>
      <div id="${ids.icon}" class="diferencial-chevron">›</div>
    </div>
    <div id="${ids.body}" class="diferencial-cuerpo" style="display:none;">
      <div class="ig diferencial-ig">
        <label class="il diferencial-lbl-amber">${opts.labelReal || '¿Cuánto era en realidad?'}</label>
        <input type="text" inputmode="decimal" id="${ids.real}" placeholder="0,00" class="money-input diff-real-input" data-inst-id="${opts.instId}">
      </div>
      ${opts.permiteBeneficiarios ? `
      <div class="diferencial-seccion">Quién se quedó con qué (opcional)</div>
      <div id="${ids.partesList}"></div>
      <button type="button" ${Events.attr('diferencial:addParte', opts.instId)} class="diferencial-agregar">+ Agregar persona</button>
      ` : ''}
      <div id="${ids.resumen}" class="diferencial-resumen"></div>
      ${opts.permiteMiCuenta ? `
      <div id="${ids.miCuentaWrap}" class="diferencial-micuenta" style="display:none;">
        <label class="il diferencial-lbl-accent">¿A cuál de tus cuentas entra ese sobrante?</label>
        <div class="select-wrap"><select id="${ids.miCuenta}"><option value="">Sin especificar</option></select></div>
      </div>` : ''}
    </div>
  </div>`;
  // Nota para quien copie este bloque: el input con clase "diff-real-input"
  // necesita su propio addEventListener('input', () => diffResumen(instId))
  // después de insertarlo en el DOM — Events no despacha oninput, solo clicks.
}

/** Renderiza el resumen de un diferencial ya guardado, para el historial. */
function diffRenderHistorial(diferencial) {
  if (!diferencial) return '';
  const d = diferencial;
  const benefs = (d.beneficiarios || []).filter(b => b.nombre).map(b => `${escHtml(b.nombre)} ${fmt(b.monto)}`).join(' · ');
  const miParte = (d.miCuentas && d.miCuentas.length > 1 && d.yoMeQuedo > 0)
    ? `Yo → ${d.miCuentas.map(r => `${escHtml(fuenteLabel(r.cuenta))} ${fmt(r.monto)}`).join(' + ')}`
    : (d.miCuenta && d.yoMeQuedo > 0 ? `Yo → ${escHtml(fuenteLabel(d.miCuenta))} ${fmt(d.yoMeQuedo)}` : (d.yoMeQuedo > 0 ? `Yo ${fmt(d.yoMeQuedo)}` : ''));
  const todas = [benefs, miParte].filter(Boolean).join(' · ');
  return `<div class="diferencial-badge">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" class="diferencial-svg"><path d="M8 1a.5.5 0 0 1 .5.5V2h1a.75.75 0 0 1 0 1.5H8.5v1h.75a2.25 2.25 0 0 1 0 4.5H8.5V10h1a.75.75 0 0 1 0 1.5H8.5v.5a.5.5 0 0 1-1 0V11.5H6.75a.75.75 0 0 1 0-1.5H7.5V9H6.5A2.25 2.25 0 0 1 4.25 6.75v-.5A.75.75 0 0 1 5 5.5h2.5V4H6.5a.75.75 0 0 1 0-1.5H7.5V1.5A.5.5 0 0 1 8 1zM5.75 6.75A.75.75 0 0 0 6.5 7.5H7.5V6H6.5a.75.75 0 0 0-.75.75zM8.5 9v1.5h.25A.75.75 0 0 0 8.5 9z"/><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.2"/></svg> Margen ${fmt(d.margen)} (real: ${fmt(d.real)})${todas ? ' · ' + todas : ''}
  </div>`;
}

/* ---- EVENTOS: acciones con data-action="diferencial:..." ----
   Nota: diffToggle/diffAddParte quedan registradas para diffHtmlBloque()
   (la plantilla) y para cualquier sheet nuevo que use el namespace genérico
   directamente. Los 4 sheets existentes siguen usando sus propios wrappers
   con nombres de módulo (encargos:difToggle, prestado:prtcDifToggle, etc.),
   definidos en sus respectivos archivos — no se tocaron. */
Events.registerAll('diferencial', {
  toggle: diffToggle,
  addParte: diffAddParte,
  removeParte: diffRemoveParte,
  togglePagoYo: diffTogglePagoYo,
});

