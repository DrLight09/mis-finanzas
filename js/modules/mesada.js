/* ═══════════════════════════════════════════════════════════════
   js/modules/mesada.js

   Módulo Mesada: cuota mensual que papá y mamá te dan, mes a mes. Un solo
   archivo con DOS PARTES, en este orden:

     PARTE 1 — Reglas de negocio (sin DOM): registrar un pago, abonar lo
               pendiente, borrar/deshacer, resumen del año, encargos
               candidatos. Funciones `mesada*` / `_mesada*`.
     PARTE 2 — Pantalla: lee formularios, llama a las reglas y pinta.
               Funciones de UI y helpers `_ms*`.

   La Parte 2 solo habla con la Parte 1 por su API (`mesadaRegistrarPago`,
   etc.): no toca `S.mesadas` directamente para escribir. Ver docs/mesada.md
   (modelo de datos, reglas, flujos) y docs/CHANGELOG.md#mesada.

   ── Dependencias ─────────────────────────────────────────────
   Grupo lazy (Loader.GROUPS.mesada en js/core/lazy-loader.js). Asume que ya
   existen en `window`:
     - El núcleo compartido: S, save, refresh, escHtml, fmt, fmtInput,
       parseMoney, hoy, uid, toast, openSheet, closeSheet, dialogo,
       buildFuentesOptsHtml, fuenteLabel, fuenteBadgeClass, getSaldoActual,
       sumarFuente, descontarFuente, MC, nivelAntiguedadMovimiento,
       avisarMovimientoBloqueado, confirmarBorrarMovimientoViejo, html/raw.
     - js/core/calc-helpers.js: _ensureMesadas, getMesadaData, _getCuotaAnio,
       _mesNombreDeKey, mesadaOrigenDeMovEncargo.
     - js/core/cuenta-efectos.js: registrarMovEspejo, borrarMovEspejo.
     - js/core/events.js (Events.attr/registerAll) y el motor de split
       (js/core/split.js: crearSplitWidget, splitToggle, splitAgregarRow,
       splitGetData, splitReset).
     - js/modules/personas.js (abrirSelPersona, getPersona) y Encargos
       (getEncargo, encargoSaldo, ...) solo de forma opcional, con guards.

   ── Por qué un solo archivo ────────────────────────────────────
   Se probó separarlo en mesada-dominio.js + mesada.js (2026-10-08) y se
   descartó: cada grupo lazy de la app es un único archivo y la separación
   no justificaba una excepción ni una dependencia de orden de carga. La
   separación lógica se mantiene con las dos partes de abajo.
   ═══════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════
   PARTE 1 — REGLAS DE NEGOCIO (sin DOM)

   Qué resolvió (2026-10-08, ver CHANGELOG.md#mesada): la lógica estaba
   mezclada con el DOM y repetida en tres sitios (pago original, abonos del
   pendiente y "deshacer abono"): crear la salida del encargo, sumar a la
   cuenta + movimiento espejo, y revertirlo. Ahora hay una sola versión:

     mesadaAbonosDe(info)        vista NORMALIZADA de un mes: el pago
                                 original + cada abono de
                                 pendienteHistorial, todos con la misma
                                 forma. No toca lo guardado (sin migración).
     _mesadaAplicarEntrada()     efecto de UN abono (salida de encargo +
                                 suma a cuenta(s) + espejo).
     mesadaRevertirAbono()       su inverso exacto.
     mesadaRegistrarPago()       pago de un mes.
     mesadaAbonarPendiente()     abono a lo pendiente.
     mesadaBorrarPago() / mesadaDeshacerAbono()

   Contrato de las funciones que cambian datos: VALIDAN TODO ANTES DE
   MUTAR (un rechazo nunca deja efectos a medias) y devuelven
   { ok:true, ... } o { ok:false, motivo, ... }. No llaman a save(),
   refresh(), toast() ni tocan el DOM: eso es de la Parte 2.

   Modelo guardado (sin cambios, ver mesada.md §4):
     S.mesadas[parent].pagos['2026-3'] = {
       monto, fecha, destino, nota, splits?, _movSecId?,
       origenEncargo?: { encargoId, movId, nombre, sumado? },
       cuotaEsperada?, pendiente?, pendienteHistorial?: [abono...]
     }
   ═══════════════════════════════════════════════════════════════ */

const MESADA_PADRES = ['papa', 'mama'];

function mesadaNombrePadre(parent) { return parent === 'papa' ? 'Papá' : 'Mamá'; }

function _mesadaAnioDeKey(key) { return parseInt(String(key).split('-')[0], 10); }

// Cuota que rige para el año del mes `key` (no para el año visible en pantalla).
function mesadaCuotaDeKey(parent, key) { return _getCuotaAnio(parent, _mesadaAnioDeKey(key)); }

/* ── Estado de cada mes (pantalla principal) ──────────────────────── */

// ¿Ya venció el mes `mesIdx` (0-11) del año `anio` para ese padre?
// Papá vence el día 30 del propio mes; mamá el día 1 del mes SIGUIENTE, así que
// dentro de su mes nunca está vencida (su vencimiento lo cubre `mesIdx < mes actual`).
function mesadaMesVencido(parent, anio, mesIdx, hoyDate) {
  const ya = hoyDate.getFullYear(), m = hoyDate.getMonth(), d = hoyDate.getDate();
  if (anio < ya) return true;
  if (anio > ya) return false;
  if (mesIdx < m) return true;
  if (mesIdx === m) return parent === 'papa' && d > 30;
  return false;
}

// 'pagado' | 'pendiente' (pagado con deuda) | 'perdido' (vencido sin pago) | 'vacio'
function mesadaEstadoMes(info, vencido) {
  if (info) return (info.pendiente || 0) > 0 ? 'pendiente' : 'pagado';
  return vencido ? 'perdido' : 'vacio';
}

// Todo lo que pinta renderMesada(), calculado una sola vez y sin DOM.
function mesadaResumenAnio(anio, hoyDate) {
  _ensureMesadas();
  hoyDate = hoyDate || new Date();
  const padres = {};
  let totalAnio = 0, pagadosAnio = 0;
  MESADA_PADRES.forEach(parent => {
    const data = getMesadaData(parent);
    const cuota = _getCuotaAnio(parent, anio);
    const r = { cuota, meses: [], totalRecibido: 0, mesesPagados: 0, mesesPerdidos: 0, totalPendiente: 0, mesesPendientes: 0 };
    MC.forEach((nombre, i) => {
      const key = anio + '-' + i;
      const info = data[key] || null;
      const estado = mesadaEstadoMes(info, mesadaMesVencido(parent, anio, i, hoyDate));
      if (info) { r.totalRecibido += (info.monto || cuota); r.mesesPagados++; }
      if (estado === 'pendiente') { r.totalPendiente += info.pendiente; r.mesesPendientes++; }
      if (estado === 'perdido') r.mesesPerdidos++;
      r.meses.push({ key, nombre, info, estado });
    });
    totalAnio += r.totalRecibido;
    pagadosAnio += r.mesesPagados;
    padres[parent] = r;
  });
  const ya = hoyDate.getFullYear();
  const mesesHastaHoy = anio < ya ? 12 : (anio === ya ? hoyDate.getMonth() + 1 : 0);
  return { anio, padres, totalAnio, pagadosAnio, esperadosAnio: mesesHastaHoy * MESADA_PADRES.length };
}

/* ── Encargos como fuente del pago ────────────────────────────────── */
// Encargos.js es otro grupo lazy: Mesada lo consulta solo con guards. Sin él, la
// opción "pagar con plata de un encargo" simplemente no se ofrece.

function _mesadaApiEncargos() {
  if (typeof getEncargo !== 'function') return null;
  return {
    get: getEncargo,
    enCuenta: typeof _getEncargoSaldoEnCuenta === 'function' ? _getEncargoSaldoEnCuenta : () => 0,
    sinCuenta: typeof _getEncargoSaldoSinCuenta === 'function' ? _getEncargoSaldoSinCuenta : () => 0,
    porCuenta: typeof _getEncargoSaldoPorCuenta === 'function' ? _getEncargoSaldoPorCuenta : () => [],
  };
}

// Cuánta plata hay disponible en el encargo, en la cuenta elegida ('' = "sin cuenta").
// Devuelve { enc, disponible } o null si el encargo no existe / Encargos no cargó.
function mesadaDisponibleEncargo(encId, cuentaSel) {
  const api = _mesadaApiEncargos();
  const enc = api ? api.get(encId) : null;
  if (!enc) return null;
  return { enc, disponible: cuentaSel ? api.enCuenta(enc, cuentaSel) : api.sinCuenta(enc) };
}

// Opciones del selector "¿de cuál cuenta sale esa plata?": [{val,label,saldo}] + sinCuenta.
function mesadaCuentasDeEncargo(encId) {
  const api = _mesadaApiEncargos();
  const enc = api ? api.get(encId) : null;
  if (!enc) return null;
  return { enc, cuentas: api.porCuenta(enc), sinCuenta: api.sinCuenta(enc) };
}

const _MESADA_CLAVES = {
  papa: ['papa', 'papi', 'papito', 'padre'],
  mama: ['mama', 'mami', 'mamita', 'madre'],
};

function _normTxt(s) {
  return (s || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// Coincidencia por PALABRA completa (o su plural): "Plata de papá" sí; "papayera" y
// "Papas fritas" no (antes era includes() y daba falsos positivos).
function _mesadaNombreCoincide(nombre, claves) {
  return _normTxt(nombre).split(/[^a-z0-9ñ]+/).some(t => claves.some(c => t === c || t === c + 's'));
}

// Persona del sistema unificado vinculada a papá/mamá (S.mesadas[parent].personaId), o ''.
function mesadaPersonaDe(parent) {
  _ensureMesadas();
  const id = S.mesadas[parent].personaId || '';
  // Si la persona ya no existe, el vínculo se ignora (vuelve la búsqueda por nombre) en vez de
  // dejar a papá/mamá sin ningún encargo candidato.
  if (id && typeof getPersona === 'function' && !getPersona(id)) return '';
  return id;
}

function mesadaVincularPersona(parent, personaId) {
  _ensureMesadas();
  if (personaId) S.mesadas[parent].personaId = personaId;
  else delete S.mesadas[parent].personaId;
}

// Encargos con saldo que pueden haber financiado la mesada de ese padre.
// Con persona vinculada: SOLO los de esa persona (vínculo explícito, sin adivinar).
// Sin vínculo: por nombre (palabra completa), como antes — ver mesada.md §8.
function mesadaEncargosDelParent(parent) {
  if (typeof encargoSaldo !== 'function' || !S.encargos || !S.encargos.length) return [];
  const personaId = mesadaPersonaDe(parent);
  const claves = _MESADA_CLAVES[parent];
  return S.encargos
    .filter(e => personaId ? e.personaId === personaId : _mesadaNombreCoincide(e.nombre, claves))
    .map(e => ({ enc: e, saldo: encargoSaldo(e) }))
    .filter(x => x.saldo > 0.5)
    .sort((a, b) => b.saldo - a.saldo);
}

/* ── Efectos de UN abono (aplicar / revertir) ─────────────────────── */

// Sube el saldo de la cuenta y deja el movimiento espejo. Devuelve el id del espejo
// (null si no hay cuenta rastreable).
function _mesadaEntrar(destino, monto, fecha, desc) {
  if (!destino || !monto) return null;
  sumarFuente(destino, monto);
  return registrarMovEspejo({ cuenta: destino, flujo: 'entrada', monto, fecha, desc, origen: 'Mesada' });
}

// Inverso de _mesadaEntrar. `descontar=false` solo borra el espejo (ver mesadaRevertirAbono).
function _mesadaSacar(destino, monto, movSecId, descontar) {
  if (!destino) return;
  if (descontar) descontarFuente(destino, monto, { exacto: true });
  borrarMovEspejo(destino, movSecId);
}

function _mesadaCrearSalidaEncargo(enc, monto, cuentaSel, fecha, desc, nota) {
  const mov = { id: uid(), tipo: 'salida', desc, monto, cuenta: cuentaSel || '', fecha, nota, ts: Date.now() };
  if (!enc.movimientos) enc.movimientos = [];
  enc.movimientos.push(mov);
  return mov;
}

function _mesadaQuitarSalidaEncargo(oe) {
  const api = _mesadaApiEncargos();
  const enc = api && oe ? api.get(oe.encargoId) : null;
  if (!enc || !enc.movimientos) return false;
  const antes = enc.movimientos.length;
  enc.movimientos = enc.movimientos.filter(m => m.id !== oe.movId);
  return enc.movimientos.length < antes;
}

// Valida que el encargo exista y tenga plata suficiente. NO muta nada.
function _mesadaValidarEncargo(encargo, monto) {
  const d = mesadaDisponibleEncargo(encargo.id, encargo.cuentaSel);
  if (!d) return { ok: false, motivo: 'encargo-invalido' };
  if (monto > d.disponible + 0.5) return { ok: false, motivo: 'encargo-insuficiente', disponible: d.disponible, encNombre: d.enc.nombre };
  return { ok: true, enc: d.enc, disponible: d.disponible };
}

// Aplica UN abono y devuelve su registro, con la misma forma para el pago original y
// para cada entrada de pendienteHistorial.
//   b = { monto, fecha, nota, destino, splits|null }
//   encargo = { enc, cuentaSel, nota } | null  (plata que ya estaba guardada en un encargo)
function _mesadaAplicarEntrada(b, desc, encargo) {
  const reg = { monto: b.monto, fecha: b.fecha, nota: b.nota };
  if (encargo) {
    const mov = _mesadaCrearSalidaEncargo(encargo.enc, b.monto, encargo.cuentaSel, b.fecha, desc, encargo.nota);
    reg.origenEncargo = { encargoId: encargo.enc.id, movId: mov.id, nombre: encargo.enc.nombre };
  }
  if (b.splits) {
    reg.destino = '';
    reg.splits = b.splits;
    b.splits.forEach(s => { if (s.fuente) s._movSecId = _mesadaEntrar(s.fuente, s.monto, b.fecha, desc); });
  } else {
    reg.destino = b.destino || '';
    if (reg.destino) reg._movSecId = _mesadaEntrar(reg.destino, b.monto, b.fecha, desc);
    // `sumado`: ¿esa plata del encargo entró de verdad a una cuenta? (si no, al borrar no hay saldo que devolver)
    if (reg.origenEncargo) reg.origenEncargo.sumado = !!reg.destino;
  }
  return reg;
}

// Vista normalizada de un mes: [pagoOriginal, ...abonosDelPendiente], todos con la forma
//   { esOriginal, monto, fecha, nota, destino, splits, _movSecId, origenEncargo }
// `info.monto` incluye los abonos posteriores, así que el original = monto − Σ abonos.
function mesadaAbonosDe(info) {
  const hist = info.pendienteHistorial || [];
  const totalHist = hist.reduce((a, h) => a + (h.monto || 0), 0);
  const norm = (x, esOriginal, monto) => ({
    esOriginal, monto, fecha: x.fecha, nota: x.nota,
    destino: x.destino || '', splits: x.splits || null,
    _movSecId: x._movSecId || null, origenEncargo: x.origenEncargo || null,
  });
  return [norm(info, true, Math.max(0, (info.monto || 0) - totalHist))]
    .concat(hist.map(h => norm(h, false, h.monto || 0)));
}

// Deshace los efectos de UN abono: devuelve la salida al encargo (si la hubo) y saca la
// plata de la(s) cuenta(s) donde entró, con su espejo.
// Usa el monto GUARDADO en el abono, no el del movimiento del encargo: si ese movimiento
// ya no existe, igual se devuelve la plata a la cuenta (antes quedaba el saldo inflado).
function mesadaRevertirAbono(ab) {
  const oe = ab.origenEncargo;
  if (oe) _mesadaQuitarSalidaEncargo(oe);
  if (ab.splits && ab.splits.length) {
    ab.splits.forEach(s => { if (s.fuente) _mesadaSacar(s.fuente, s.monto, s._movSecId, true); });
    return;
  }
  // Con encargo, solo se había sumado a la cuenta si `sumado`; sin encargo, siempre.
  _mesadaSacar(ab.destino, ab.monto, ab._movSecId, oe ? !!oe.sumado : true);
}

/* ── Casos de uso ─────────────────────────────────────────────────── */

const _mesadaSumaSplits = splits => splits.reduce((a, s) => a + s.monto, 0);

// p = { parent, key, monto, fecha, nota, destino, splits, splitMode,
//       quedaDebiendo, encargo: { id, cuentaSel } | null }
function mesadaRegistrarPago(p) {
  const monto = p.monto || 0;
  if (!monto || !p.parent || !p.key) return { ok: false, motivo: 'datos-incompletos' };
  const fecha = p.fecha || hoy();
  const splits = p.splitMode ? (p.splits || []).map(s => ({ fuente: s.fuente, monto: s.monto })) : null;

  // 1) Validar TODO antes de tocar nada.
  let val = null;
  if (p.encargo) {
    val = _mesadaValidarEncargo(p.encargo, monto);
    if (!val.ok) return val;
  }
  if (splits && _mesadaSumaSplits(splits) > monto + 1) return { ok: false, motivo: 'split-excede' };

  // 2) Aplicar.
  const desc = 'Mesada — ' + mesadaNombrePadre(p.parent) + ' · ' + _mesNombreDeKey(p.key);
  const reg = _mesadaAplicarEntrada(
    { monto, fecha, nota: p.nota || '', destino: p.destino, splits },
    desc,
    val ? { enc: val.enc, cuentaSel: p.encargo.cuentaSel, nota: 'Usado para mesada' } : null
  );
  const cuotaDelMes = mesadaCuotaDeKey(p.parent, p.key);
  const pendiente = p.quedaDebiendo ? Math.max(0, cuotaDelMes - monto) : 0;
  if (pendiente > 0) {
    reg.cuotaEsperada = cuotaDelMes;
    reg.pendiente = pendiente;
    reg.pendienteHistorial = [];
  }
  getMesadaData(p.parent)[p.key] = reg;
  return { ok: true, pendiente, usoEncargo: !!val };
}

// p = { parent, key, monto, fecha, nota, destino, encargo: { id, cuentaSel } | null }
function mesadaAbonarPendiente(p) {
  const info = getMesadaData(p.parent)[p.key];
  if (!info || !((info.pendiente || 0) > 0)) return { ok: false, motivo: 'sin-pendiente' };
  const monto = Math.min(p.monto || 0, info.pendiente); // no se puede saldar más de lo pendiente
  if (monto <= 0) return { ok: false, motivo: 'datos-incompletos' };
  const fecha = p.fecha || hoy();

  let val = null;
  if (p.encargo) {
    val = _mesadaValidarEncargo(p.encargo, monto);
    if (!val.ok) return val;
  }
  const desc = 'Mesada (pendiente) — ' + mesadaNombrePadre(p.parent) + ' · ' + _mesNombreDeKey(p.key);
  const reg = _mesadaAplicarEntrada(
    { monto, fecha, nota: p.nota || '', destino: p.destino, splits: null },
    desc,
    val ? { enc: val.enc, cuentaSel: p.encargo.cuentaSel, nota: 'Usado para mesada (pendiente)' } : null
  );
  if (!info.pendienteHistorial) info.pendienteHistorial = [];
  info.pendienteHistorial.push(reg);
  info.pendiente = Math.max(0, info.pendiente - monto);
  info.monto = (info.monto || 0) + monto;
  return { ok: true, pendiente: info.pendiente, monto };
}

// Convierte retroactivamente un mes cerrado con menos plata que la cuota en uno con deuda.
function mesadaMarcarPendiente(parent, key) {
  const info = getMesadaData(parent)[key];
  if (!info) return { ok: false, motivo: 'no-existe' };
  const cuota = mesadaCuotaDeKey(parent, key);
  const pend = Math.max(0, cuota - (info.monto || 0));
  if (pend <= 0) return { ok: false, motivo: 'completo' };
  info.cuotaEsperada = cuota;
  info.pendiente = pend;
  if (!info.pendienteHistorial) info.pendienteHistorial = [];
  return { ok: true, pendiente: pend };
}

// Borra el registro del mes y revierte TODO (pago original + cada abono).
function mesadaBorrarPago(parent, key) {
  const data = getMesadaData(parent);
  const info = data[key];
  if (!info) return false;
  mesadaAbonosDe(info).forEach(mesadaRevertirAbono);
  delete data[key];
  return true;
}

// Deshace un abono puntual del pendiente: revierte sus efectos y vuelve a dejar esa plata como deuda.
function mesadaDeshacerAbono(parent, key, idx) {
  const info = getMesadaData(parent)[key];
  const h = info && info.pendienteHistorial && info.pendienteHistorial[idx];
  if (!h) return false;
  mesadaRevertirAbono(mesadaAbonosDe(info)[idx + 1]);
  info.monto = Math.max(0, (info.monto || 0) - h.monto);
  info.pendiente = (info.pendiente || 0) + h.monto;
  info.pendienteHistorial.splice(idx, 1);
  return true;
}

/* ── Insumos de la protección por antigüedad al borrar ────────────── */

// Cuentas realmente afectadas por el mes (pago original Y abonos del pendiente).
function mesadaFuentesDe(info) {
  const out = [];
  mesadaAbonosDe(info).forEach(ab => {
    if (ab.splits && ab.splits.length) ab.splits.forEach(s => { if (s.fuente) out.push(s.fuente); });
    else if (ab.destino) out.push(ab.destino);
  });
  return Array.from(new Set(out));
}

// ¿Borrar este mes movería el saldo de alguna cuenta o encargo? Si todo fue
// "no especificar / lo gasté", no hay nada que proteger.
function mesadaTieneCuentaAfectada(info) {
  return mesadaAbonosDe(info).some(ab => ab.origenEncargo || (ab.splits && ab.splits.length) || ab.destino);
}

// Pagos de mesada (papá + mamá) posteriores a este que tocaron alguna de las mismas cuentas.
function mesadaOpsPosteriores(parentActual, keyActual, info) {
  const fuentes = mesadaFuentesDe(info);
  if (!fuentes.length || !info.fecha) return 0;
  let count = 0;
  MESADA_PADRES.forEach(p => {
    const data = getMesadaData(p);
    Object.keys(data).forEach(k => {
      if (p === parentActual && k === keyActual) return;
      const otro = data[k];
      if (!otro || !otro.fecha || otro.fecha <= info.fecha) return;
      if (mesadaFuentesDe(otro).some(f => fuentes.includes(f))) count++;
    });
  });
  return count;
}


/* ═══════════════════════════════════════════════════════════════
   PARTE 2 — PANTALLA

   Solo capa de pantalla: lee formularios, llama a las reglas de la Parte 1
   y pinta.

   ── Dos sheets, un solo widget de encargo ─────────────────────
   "Registrar pago" (prefijo mp) y "Pago de lo pendiente" (prefijo mpp) usan el
   MISMO bloque "Me pagó con plata de un encargo". Antes eran dos copias de
   funciones idénticas salvo el prefijo del id; ahora _crearEncargoPicker(prefijo)
   arma una instancia por sheet (mismo patrón que crearSplitWidget).

   ── Eventos (CSP) ──────────────────────────────────────────────
   Los clicks de las template strings se emiten con Events.attr('mesada:accion', ...)
   y se registran al final con Events.registerAll('mesada', {...}). Los controles
   estáticos de los sheets se cablean en las tablas de _msCablear() más abajo.
   ═══════════════════════════════════════════════════════════════ */

const _msEl = id => document.getElementById(id);
const _msVal = id => { const e = _msEl(id); return e ? e.value : ''; };

// Estado de cada sheet. mp = registrar pago, mpp = pago de lo pendiente.
const _msFlujos = {
  mp:  { parent: '', key: '', usarEncargo: false, encargoId: '' },
  mpp: { parent: '', key: '', usarEncargo: false, encargoId: '' },
};
let mpSplitMode = false; // lo lee/escribe el motor de split (ver crearSplitWidget abajo)

/* ── Widget "Me pagó con plata de un encargo" (uno por sheet) ───────── */

function _crearEncargoPicker(p, f, onCambio) {
  const chk = () => _msEl(p + 'UsarEncargo');

  const picker = {
    // El destino sigue siendo elegible aunque la cuenta del encargo sea conocida: esa
    // cuenta solo dice de dónde SALE la plata (para validar cuánta hay), no a dónde ENTRA.
    // Se precarga con la misma cuenta como sugerencia, pero es editable.
    sincronizarDestino() {
      const cuentaSel = _msEl(p + 'EncargoCuentaSel'), dest = _msEl(p + 'Destino');
      if (!cuentaSel || !dest) return;
      const val = cuentaSel.value;
      dest.value = (val && [...dest.options].some(o => o.value === val)) ? val : '';
    },

    poblarCuentas() {
      const sel = _msEl(p + 'EncargoCuentaSel');
      if (!sel) return;
      const d = mesadaCuentasDeEncargo(f.encargoId);
      if (!d) { sel.innerHTML = ''; return; }
      let opts = d.cuentas.map(c => html`<option value="${c.cuenta}">${c.label} (${fmt(c.saldo)})</option>`).join('');
      if (d.sinCuenta > 0.5) opts += `<option value="">Sin especificar (${fmt(d.sinCuenta)})</option>`;
      sel.innerHTML = opts || '<option value="">Sin especificar</option>';
      onCambio();
    },

    // Deja el widget apagado y, si hay encargos candidatos del padre, lo muestra.
    abrir(parent) {
      f.usarEncargo = false;
      f.encargoId = '';
      if (chk()) chk().checked = false;
      const det = _msEl(p + 'EncargoDetalle');
      if (det) det.style.display = 'none';
      const box = _msEl(p + 'EncargoBox');
      if (!box) return;
      const cands = mesadaEncargosDelParent(parent);
      if (!cands.length) { box.style.display = 'none'; return; }
      box.style.display = '';
      const sub = _msEl(p + 'EncargoSub');
      if (sub) sub.textContent = 'Tienes ' + fmt(cands.reduce((a, x) => a + x.saldo, 0)) + ' guardados de ' + mesadaNombrePadre(parent) + ' en encargos';
      const sel = _msEl(p + 'EncargoSel');
      if (sel) sel.innerHTML = cands.map(x => html`<option value="${x.enc.id}">${x.enc.nombre} (${fmt(x.saldo)})</option>`).join('');
      const wrap = _msEl(p + 'EncargoSelWrap');
      if (wrap) wrap.style.display = cands.length > 1 ? '' : 'none';
      f.encargoId = cands[0].enc.id;
      picker.poblarCuentas();
    },

    // { id, cuentaSel } si está activo; null si el pago no sale de un encargo.
    seleccion() {
      return f.usarEncargo ? { id: f.encargoId, cuentaSel: _msVal(p + 'EncargoCuentaSel') } : null;
    },

    cablear() {
      _msOn(p + 'UsarEncargo', 'change', () => {
        f.usarEncargo = chk().checked;
        const det = _msEl(p + 'EncargoDetalle');
        if (det) det.style.display = f.usarEncargo ? '' : 'none';
        if (f.usarEncargo) picker.sincronizarDestino();
        onCambio();
      });
      _msOn(p + 'EncargoSel', 'change', () => { f.encargoId = _msVal(p + 'EncargoSel'); picker.poblarCuentas(); });
      _msOn(p + 'EncargoCuentaSel', 'change', () => { if (f.usarEncargo) picker.sincronizarDestino(); onCambio(); });
      _msFilaClickeable(p + 'EncargoToggleWrap', p + 'UsarEncargo');
    },
  };
  return picker;
}

const _msPickers = {
  mp:  _crearEncargoPicker('mp',  _msFlujos.mp,  () => actualizarMpPreview()),
  mpp: _crearEncargoPicker('mpp', _msFlujos.mpp, () => actualizarMppPreview()),
};

/* ── Pantalla principal ──────────────────────────────────────────── */

function renderMesada() {
  _ensureMesadas();
  const a = S.mesadaAnio || new Date().getFullYear();
  const hoyAnio = new Date().getFullYear();
  _msEl('anioLabel').textContent = a;
  if (_msEl('btn-anio-prev')) _msEl('btn-anio-prev').disabled = (a <= hoyAnio - 2);
  if (_msEl('btn-anio-next')) _msEl('btn-anio-next').disabled = (a >= hoyAnio + 2);
  MESADA_PADRES.forEach(p => { if (_msEl('ms-' + p + '-anio-label')) _msEl('ms-' + p + '-anio-label').textContent = a; });

  const r = mesadaResumenAnio(a);

  // Inputs de cuota del año visible (sin pisar lo que el usuario está escribiendo).
  MESADA_PADRES.forEach(p => {
    const inp = _msEl(p === 'papa' ? 'mesadaMontoPapa' : 'mesadaMontoMama');
    if (inp && document.activeElement !== inp) inp.value = fmtInput(r.padres[p].cuota);
  });

  MESADA_PADRES.forEach(parent => {
    const x = r.padres[parent];
    _msEl(parent === 'papa' ? 'mesadaGridPapa' : 'mesadaGridMama').innerHTML = x.meses.map(m => _htmlMesDot(parent, m, a)).join('');
    let sub = fmt(x.totalRecibido) + ' recibidos (' + x.mesesPagados + '/12)';
    if (x.mesesPerdidos > 0) sub += ' · ' + x.mesesPerdidos + ' sin pagar';
    if (x.mesesPendientes > 0) sub += ' · ' + fmt(x.totalPendiente) + ' pendiente';
    _msEl('ms-' + parent + '-sub').textContent = sub;
  });
  _renderPersonaLink('papa');
  _renderPersonaLink('mama');

  // Banner combinado (papá + mamá): deuda pendiente a la vista.
  const banner = _msEl('ms-pendiente-banner');
  if (banner) {
    const partes = [];
    if (r.padres.papa.totalPendiente > 0) partes.push('Papá te debe ' + fmt(r.padres.papa.totalPendiente));
    if (r.padres.mama.totalPendiente > 0) partes.push('Mamá te debe ' + fmt(r.padres.mama.totalPendiente));
    banner.style.display = partes.length ? '' : 'none';
    if (partes.length) banner.textContent = partes.join(' · ');
  }

  _msEl('ms-total').textContent = fmt(r.totalAnio);
  _msEl('ms-count').textContent = r.pagadosAnio + '/' + (r.esperadosAnio || '—');
}

const _MES_DOT_CLASE = { pendiente: 'mes-dot on mes-dot-pend', pagado: 'mes-dot on', perdido: 'mes-dot perdido', vacio: 'mes-dot' };

function _htmlMesDot(parent, m, anio) {
  const info = m.info;
  const tooltip = m.estado === 'pendiente' ? fmt(info.monto) + ' recibidos · debe ' + fmt(info.pendiente)
    : m.estado === 'pagado' ? (info.fecha || 'pagado')
    : m.estado === 'perdido' ? 'Sin pagar' : '';
  return `<div class="${_MES_DOT_CLASE[m.estado]}" title="${tooltip}"
    ${Events.attr('mesada:clickMesDot', parent, m.key, m.nombre + ' ' + anio)}>${m.nombre}</div>`;
}

function clickMesDot(parent, key, nombre) {
  if (getMesadaData(parent)[key]) abrirDetalleMesada(parent, key, nombre); // ya pagado → detalle
  else abrirRegistrarMesada(parent, key, nombre);                          // no pagado → registrar
}

function cambiarAnio(d) {
  const hoyAnio = new Date().getFullYear();
  const nuevo = (S.mesadaAnio || hoyAnio) + d;
  if (nuevo < hoyAnio - 2 || nuevo > hoyAnio + 2) return;
  save(); S.mesadaAnio = nuevo; renderMesada();
}

/* ── Vínculo de papá/mamá con una persona (encargos por vínculo, no por nombre) ── */

function _renderPersonaLink(parent) {
  const btn = _msEl('ms-' + parent + '-persona'), x = _msEl('ms-' + parent + '-persona-x');
  if (!btn) return;
  const pid = mesadaPersonaDe(parent);
  const persona = pid && typeof getPersona === 'function' ? getPersona(pid) : null;
  btn.textContent = persona ? 'Vinculado a ' + persona.nombre : 'Vincular a una persona';
  if (x) x.style.display = persona ? '' : 'none';
}

function vincularPersonaMesada(parent) {
  if (typeof abrirSelPersona !== 'function') { toast('Personas todavía no cargó, intenta de nuevo', 'err'); return; }
  abrirSelPersona(personaId => {
    mesadaVincularPersona(parent, personaId);
    save(); _renderPersonaLink(parent);
    toast('Ahora se ofrecen los encargos de esa persona', 'ok', 2500);
  }, parent === 'papa' ? '¿Quién es papá?' : '¿Quién es mamá?');
}

function desvincularPersonaMesada(parent) {
  mesadaVincularPersona(parent, '');
  save(); _renderPersonaLink(parent);
  toast('Desvinculado: se buscan encargos por nombre', 'info', 2500);
}

/* ── Sheet "Registrar pago" (mp) ─────────────────────────────────── */

crearSplitWidget('mp', {
  simpleId: 'mpModoSimple', splitId: 'mpModoDividido', toggleId: 'mpSplitToggle', rowsId: 'mpSplitRows',
  getModo: () => mpSplitMode, setModo: v => { mpSplitMode = v; },
  getFuentesFn: getFuentesOptions,
  onPreview: () => actualizarMpPreview(),
});

function getFuentesOptions(selectedVal) {
  return buildFuentesOptsHtml({ selectedVal, placeholder: 'No especificar', incluirTC: false });
}

// <select> de destino: cuentas rastreables (sin TC: es plata que entra) + "no especificar".
function _poblarDestinoMesada(selectId) {
  const sel = _msEl(selectId);
  if (sel) sel.innerHTML = buildFuentesOptsHtml({ placeholder: 'No especificar / lo gasté', incluirTC: false });
}

function abrirRegistrarMesada(parent, key, nombre) {
  const f = _msFlujos.mp;
  f.parent = parent; f.key = key;
  _msEl('mpTitle').textContent = mesadaNombrePadre(parent) + ' · ' + nombre;
  _msEl('mpDesc').textContent = 'Registra cuándo te pagó y qué hiciste con esa plata.';
  _msEl('mpMonto').value = mesadaCuotaDeKey(parent, key) || '';
  _msEl('mpFecha').value = hoy();
  _msEl('mpNota').value = '';
  _msEl('mpPreview').textContent = '';
  splitReset('mp'); // vuelve el widget de dividir a su estado base (modo simple, sin filas)
  _msEl('mpSplitToggle').style.display = '';
  _poblarDestinoMesada('mpDestino');
  // "Quedó debiendo la diferencia": siempre empieza apagado.
  if (_msEl('mpQuedaDebiendo')) _msEl('mpQuedaDebiendo').checked = false;
  if (_msEl('mpDebeWrap')) _msEl('mpDebeWrap').style.display = 'none';
  _msPickers.mp.abrir(parent);
  openSheet('mesada-pago');
}

// Texto de preview cuando se reparte entre cuentas (con o sin encargo de origen).
function _previewSplit(prev, v, splits, deEncargo) {
  const total = splits.reduce((a, s) => a + s.monto, 0);
  const restante = v - total;
  if (!splits.length) { prev.textContent = fmt(v) + (deEncargo ? ' de ' + deEncargo : '') + ' por distribuir'; prev.style.color = 'var(--text2)'; return; }
  const lineas = splits.map(s => fuenteLabel(s.fuente || '') + ': +' + fmt(s.monto)).join(' · ');
  if (restante > 0) { prev.textContent = lineas + ' · Sin asignar: ' + fmt(restante); prev.style.color = 'var(--amber)'; }
  else if (restante < 0) { prev.textContent = lineas + ' · Excede por: ' + fmt(-restante); prev.style.color = 'var(--red)'; }
  else { prev.textContent = lineas + ' · Todo distribuido' + (deEncargo ? ' (de ' + deEncargo + ')' : ''); prev.style.color = 'var(--accent)'; }
}

// Valida lo disponible en el encargo para el preview. Devuelve {enc,disponible} o null (ya pintó el motivo).
function _previewDisponible(prev, picker, v) {
  const sel = picker.seleccion();
  const d = mesadaDisponibleEncargo(sel.id, sel.cuentaSel);
  if (!d) { prev.textContent = ''; return null; }
  if (v > d.disponible + 0.5) { prev.textContent = 'Ahí solo tienes ' + fmt(d.disponible) + ' de ' + d.enc.nombre; prev.style.color = 'var(--red)'; return null; }
  return d;
}

function actualizarMpPreview() {
  const f = _msFlujos.mp;
  const v = parseMoney(_msVal('mpMonto')) || 0;
  const prev = _msEl('mpPreview');
  _syncMpDebeWrap(v);
  if (!v) { prev.textContent = ''; return; }
  if (f.usarEncargo) {
    const d = _previewDisponible(prev, _msPickers.mp, v);
    if (!d) return;
    if (mpSplitMode) { _previewSplit(prev, v, splitGetData('mp'), d.enc.nombre); return; }
    prev.textContent = 'Se descuenta de lo que le tenías guardado a ' + d.enc.nombre + ' · queda ' + fmt(d.disponible - v);
    prev.style.color = 'var(--blue)';
    return;
  }
  if (mpSplitMode) { _previewSplit(prev, v, splitGetData('mp'), ''); return; }
  const dest = _msVal('mpDestino');
  if (dest) {
    const actual = getSaldoActual(dest);
    prev.textContent = fuenteLabel(dest) + ': ' + fmt(actual) + ' + ' + fmt(v) + ' = ' + fmt(actual + v);
    prev.style.color = 'var(--accent)';
  } else {
    prev.textContent = fmt(v) + ' registrados';
    prev.style.color = 'var(--text2)';
  }
}

// Muestra/oculta "me quedó debiendo la diferencia" según monto vs. la cuota del mes.
function _syncMpDebeWrap(v) {
  const wrap = _msEl('mpDebeWrap'), chk = _msEl('mpQuedaDebiendo');
  if (!wrap || !chk) return;
  const f = _msFlujos.mp;
  const diff = (f.parent ? mesadaCuotaDeKey(f.parent, f.key) : 0) - v;
  if (v > 0 && diff > 0) {
    wrap.style.display = 'flex';
    if (_msEl('mpDebeLabel')) _msEl('mpDebeLabel').textContent = 'Te está debiendo ' + fmt(diff) + ' — ¿marcar como pendiente?';
  } else {
    wrap.style.display = 'none';
    chk.checked = false;
  }
}

// Muestra al usuario por qué el dominio rechazó la operación. `enc.nombre` es texto libre
// y toast() inserta con innerHTML: se escapa acá.
function _mesadaMostrarError(r, previewId) {
  if (r.motivo === 'encargo-invalido') toast('Selecciona un encargo válido', 'err');
  else if (r.motivo === 'encargo-insuficiente') toast('Ahí solo hay ' + fmt(r.disponible) + ' guardados de ' + escHtml(r.encNombre), 'err');
  else if (r.motivo === 'split-excede') {
    const prev = _msEl(previewId);
    prev.textContent = 'El total dividido supera el monto recibido';
    prev.style.color = 'var(--red)';
  }
  // 'datos-incompletos' / 'sin-pendiente': nada que decir (el botón simplemente no hace nada, como siempre)
}

function confirmarMesadaPago() {
  const f = _msFlujos.mp;
  const chk = _msEl('mpQuedaDebiendo');
  const r = mesadaRegistrarPago({
    parent: f.parent, key: f.key,
    monto: parseMoney(_msVal('mpMonto')) || 0,
    fecha: _msVal('mpFecha') || hoy(),
    nota: _msVal('mpNota').trim(),
    destino: _msVal('mpDestino'),
    splitMode: mpSplitMode,
    splits: mpSplitMode ? splitGetData('mp') : null,
    quedaDebiendo: !!(chk && chk.checked),
    encargo: _msPickers.mp.seleccion(),
  });
  if (!r.ok) { _mesadaMostrarError(r, 'mpPreview'); return; }
  save(); refresh();
  closeSheet('mesada-pago');
  if (r.pendiente > 0) toast('Guardado — quedó pendiente ' + fmt(r.pendiente), 'info', 3500);
  else if (r.usoEncargo) toast('Guardado — se descontó de lo que le tenías guardado', 'ok', 3000);
}

/* ── Detalle de un mes ───────────────────────────────────────────── */

function abrirDetalleMesada(parent, key, nombre) {
  const info = getMesadaData(parent)[key];
  _msEl('mdTitle').textContent = mesadaNombrePadre(parent) + ' · ' + nombre;

  const origenEncargoHtml = info.origenEncargo
    ? html`<div class="row ms-fila"><span class="ms-lbl">Pagó con</span><span class="badge ms-badge-enc">Plata guardada de ${info.origenEncargo.nombre}</span></div>`
    : '';
  let destinoHtml = '';
  if (info.splits && info.splits.length) {
    destinoHtml = html`<div class="ms-fila"><span class="ms-lbl">Dividido en</span>
      <div class="ms-splits">
        ${raw(info.splits.map(s => html`<div class="ms-split-row"><span class="badge ${raw(fuenteBadgeClass(s.fuente || ''))}" style="font-size:9px;">${fuenteLabel(s.fuente || '')}</span><span class="ms-split-monto">+${fmt(s.monto)}</span></div>`).join(''))}
      </div></div>`;
  } else if (info.destino) {
    destinoHtml = html`<div class="row ms-fila"><span class="ms-lbl">Lo metiste en</span><span class="badge ${raw(fuenteBadgeClass(info.destino))}">${fuenteLabel(info.destino)}</span></div>`;
  }

  // ── Pendiente: estado y acciones ──
  const cuotaDelMes = mesadaCuotaDeKey(parent, key);
  const debe = (info.pendiente || 0) > 0;
  const tieneHistorial = !!(info.pendienteHistorial && info.pendienteHistorial.length);
  const puedeMarcarPendiente = !info.cuotaEsperada && !debe && (info.monto || 0) < cuotaDelMes;

  let pendienteHtml = '';
  if (info.cuotaEsperada && (debe || tieneHistorial)) {
    pendienteHtml = html`
    <div class="card card-sm ms-pend-card ${debe ? 'debe' : 'saldado'}">
      <div class="row ms-fila"><span class="ms-lbl">Cuota esperada</span><span class="ms-mono">${fmt(info.cuotaEsperada)}</span></div>
      ${debe
        ? html`<div class="row ms-fila-pend"><span class="ms-lbl ms-lbl-amber">Pendiente</span><span class="row-amount c-amber">${fmt(info.pendiente)}</span></div>`
        : html`<div class="ms-saldado"><i class="fa-solid fa-check"></i>Ya te dio todo lo que faltaba</div>`}
      ${tieneHistorial ? html`<div class="ms-historial">${raw(info.pendienteHistorial.map((h, idx) => html`<div class="ms-hist-row"><span class="ms-hist-txt">${h.fecha || ''}${h.origenEncargo ? ' · Plata guardada de ' + h.origenEncargo.nombre : (h.destino ? ' · ' + fuenteLabel(h.destino) : '')}${h.nota ? ' · ' + h.nota : ''}</span><span class="ms-hist-acc"><span class="ms-hist-monto">+${fmt(h.monto)}</span><span ${raw(Events.attr('mesada:deshacerPendiente', parent, key, idx))} class="ms-hist-undo" title="Deshacer este abono"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span></span></div>`).join(''))}</div>` : ''}
      ${debe ? html`<button type="button" class="btn btn-soft-amber ms-btn-top" ${raw(Events.attr('mesada:resolverPendiente', parent, key))}>Registrar pago de lo pendiente</button>` : ''}
    </div>`;
  } else if (puedeMarcarPendiente) {
    pendienteHtml = html`
    <div class="card card-sm ms-pend-card">
      <div class="ms-sugerir-txt">Este mes recibiste menos que la cuota (${fmt(cuotaDelMes)}). ¿Te quedó debiendo la diferencia?</div>
      <button type="button" class="btn btn-soft-amber" ${raw(Events.attr('mesada:marcarPendiente', parent, key))}>Marcar diferencia como pendiente</button>
    </div>`;
  }

  _msEl('mdContent').innerHTML = html`
    <div class="card card-sm ms-card-mb">
      <div class="row ms-fila"><span class="ms-lbl">Monto</span><span class="row-amount c-green">${fmt(info.monto)}</span></div>
      <div class="row ms-fila"><span class="ms-lbl">Fecha</span><span class="ms-mono">${info.fecha || '—'}</span></div>
      ${raw(origenEncargoHtml)}${raw(destinoHtml)}
      ${info.nota ? html`<div class="ms-nota">${info.nota}</div>` : ''}
    </div>
    ${raw(pendienteHtml)}
    <button type="button" class="btn btn-soft-red" ${raw(Events.attr('mesada:eliminarPago', parent, key))}>Borrar este registro</button>
  `;
  openSheet('mesada-det');
}

/* ── Borrar un mes ────────────────────────────────────────────────── */

async function eliminarMesadaPago(parent, key) {
  const info = getMesadaData(parent)[key];
  if (!info) return;

  // Protección por antigüedad (docs/proteccion-antiguedad-movimientos.md): solo si borrar
  // realmente movería el saldo de alguna cuenta o encargo. Un pago 100% "no especificar"
  // no revierte nada, así que no hay saldo que proteger.
  if (mesadaTieneCuentaAfectada(info)) {
    const nivel = nivelAntiguedadMovimiento(info.fecha, mesadaOpsPosteriores(parent, key, info), 'mesada');
    if (nivel === 'bloqueado') { await avisarMovimientoBloqueado(); return; }
    if (nivel === 'viejo') {
      const fuentes = mesadaFuentesDe(info);
      const nombreCuenta = fuentes.length > 1 ? `${fuentes.length} cuentas` : (fuentes.length ? fuenteLabel(fuentes[0]) : 'Encargos');
      if (!await confirmarBorrarMovimientoViejo(nombreCuenta, info.monto || 0, 'baja')) return;
    }
  }
  mesadaBorrarPago(parent, key);
  save(); refresh();
  closeSheet('mesada-det');
}

/* ── Pago parcial con deuda pendiente ─────────────────────────────── */

function marcarMesadaComoPendiente(parent, key) {
  const r = mesadaMarcarPendiente(parent, key);
  if (!r.ok) {
    if (r.motivo === 'completo') toast('Ese mes ya está completo, no hay diferencia pendiente', 'info');
    return;
  }
  save(); refresh();
  toast('Marcado como pendiente — debe ' + fmt(r.pendiente), 'info', 3000);
  abrirDetalleMesada(parent, key, _mesNombreDeKey(key));
}

// Sheet "Pago de lo pendiente" (mpp).
function abrirResolverPendiente(parent, key) {
  const info = getMesadaData(parent)[key];
  if (!info || !(info.pendiente > 0)) return;
  const f = _msFlujos.mpp;
  f.parent = parent; f.key = key;
  _msEl('mppTitle').textContent = mesadaNombrePadre(parent) + ' · ' + _mesNombreDeKey(key);
  _msEl('mppDesc').textContent = 'Te debía ' + fmt(info.pendiente) + '. ¿Cuánto te dio ahora?';
  _msEl('mppMonto').value = fmtInput(info.pendiente);
  _msEl('mppFecha').value = hoy();
  _msEl('mppNota').value = '';
  _poblarDestinoMesada('mppDestino');
  _msPickers.mpp.abrir(parent);
  actualizarMppPreview();
  openSheet('mesada-pend');
}

function actualizarMppPreview() {
  const f = _msFlujos.mpp;
  const prev = _msEl('mppPreview');
  const info = getMesadaData(f.parent)[f.key];
  const v = parseMoney(_msVal('mppMonto')) || 0;
  if (!info || !v) { prev.textContent = ''; return; }
  if (v > info.pendiente + 1) {
    prev.textContent = 'Eso es más de lo que quedó pendiente (' + fmt(info.pendiente) + ')';
    prev.style.color = 'var(--red)';
    return;
  }
  let d = null;
  if (f.usarEncargo) { d = _previewDisponible(prev, _msPickers.mpp, v); if (!d) return; }
  const restante = info.pendiente - v;
  prev.textContent = (restante > 0 ? 'Quedaría debiendo ' + fmt(restante) + ' más' : 'Con esto queda saldado')
    + (d ? ' · se descuenta de lo guardado de ' + d.enc.nombre : '');
  prev.style.color = restante > 0 ? 'var(--amber)' : 'var(--accent)';
}

function confirmarPendienteMesada() {
  const f = _msFlujos.mpp;
  const monto = parseMoney(_msVal('mppMonto')) || 0;
  if (monto <= 0) return;
  const r = mesadaAbonarPendiente({
    parent: f.parent, key: f.key, monto,
    fecha: _msVal('mppFecha') || hoy(),
    nota: _msVal('mppNota').trim(),
    destino: _msVal('mppDestino'),
    encargo: _msPickers.mpp.seleccion(),
  });
  if (!r.ok) { _mesadaMostrarError(r, 'mppPreview'); return; }
  save(); refresh();
  closeSheet('mesada-pend');
  toast(r.pendiente > 0 ? ('Abono registrado — todavía debe ' + fmt(r.pendiente)) : '¡Pendiente saldado!', 'ok', 3000);
  abrirDetalleMesada(f.parent, f.key, _mesNombreDeKey(f.key));
}

// Deshace un abono puntual de lo pendiente (por si se registró por error).
async function deshacerPendienteMesada(parent, key, idx) {
  const info = getMesadaData(parent)[key];
  if (!info || !info.pendienteHistorial || !info.pendienteHistorial[idx]) return;
  const ok = await dialogo('Deshacer abono', '¿Deshacer este abono de lo pendiente? La plata se restará de la cuenta donde la registraste y volverá a quedar como deuda.', 'Deshacer', true);
  if (!ok) return;
  mesadaDeshacerAbono(parent, key, idx);
  save(); refresh();
  toast('Abono deshecho', 'ok', 2000);
  abrirDetalleMesada(parent, key, _mesNombreDeKey(key));
}

/* ── Wiring de controles estáticos de la pantalla ─────────────────────
   Los ids ya existen en el DOM antes de este script (index.html). Todo el wiring
   vive en estas tablas: agregar un control = agregar una fila. ── */

function _msOn(id, evt, fn) {
  const el = _msEl(id);
  if (el) el.addEventListener(evt, fn);
}

// La fila entera es clickeable y delega en su checkbox (sin re-disparar su propio click).
function _msFilaClickeable(wrapId, chkId) {
  const wrap = _msEl(wrapId), chk = _msEl(chkId);
  if (wrap && chk) wrap.addEventListener('click', e => { if (e.target !== chk) chk.click(); });
}

function _msCablear() {
  [
    ['btn-anio-prev',             'click',  () => cambiarAnio(-1)],
    ['btn-anio-next',             'click',  () => cambiarAnio(1)],
    ['btn-confirmar-mesada',      'click',  confirmarMesadaPago],
    ['btn-confirmar-mesada-pend', 'click',  confirmarPendienteMesada],
    ['mpMonto',                   'input',  actualizarMpPreview],
    ['mpDestino',                 'change', actualizarMpPreview],
    ['mpQuedaDebiendo',           'change', actualizarMpPreview],
    ['mppMonto',                  'input',  actualizarMppPreview],
    ['mppDestino',                'change', actualizarMppPreview],
    ['mpSplitToggle',             'click',  () => splitToggle('mp')],
    ['btn-add-split-row',         'click',  () => splitAgregarRow('mp')],
    ['ms-papa-persona',           'click',  () => vincularPersonaMesada('papa')],
    ['ms-mama-persona',           'click',  () => vincularPersonaMesada('mama')],
    ['ms-papa-persona-x',         'click',  () => desvincularPersonaMesada('papa')],
    ['ms-mama-persona-x',         'click',  () => desvincularPersonaMesada('mama')],
  ].forEach(([id, evt, fn]) => _msOn(id, evt, fn));

  _msFilaClickeable('mpDebeWrap', 'mpQuedaDebiendo');
  _msPickers.mp.cablear();
  _msPickers.mpp.cablear();
}
_msCablear();

/* ── Acciones del despachador central de eventos (reemplaza onclick inline). Ver js/core/events.js. ── */
Events.registerAll('mesada', {
  clickMesDot: clickMesDot,
  eliminarPago: eliminarMesadaPago,
  resolverPendiente: abrirResolverPendiente,
  marcarPendiente: marcarMesadaComoPendiente,
  deshacerPendiente: deshacerPendienteMesada,
});
