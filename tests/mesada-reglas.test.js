'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const ROOT = process.env.MIS_FINANZAS_ROOT || path.join(__dirname, '..');
const CORE = process.env.MIS_FINANZAS_CORE_DIR || path.join(ROOT, 'js', 'core');
const MODS = process.env.MIS_FINANZAS_MODULES_DIR || path.join(ROOT, 'js', 'modules');

const clone = o => JSON.parse(JSON.stringify(o));

// Encargos real es otro grupo lazy: acá se simula SOLO su API pública (la misma que
// consulta mesada.js (Parte 1) con guards typeof), sobre S.encargos.
function stubEncargos(ctx) {
  const mov = (enc, cuenta) => (enc.movimientos || []).reduce((a, m) => {
    if ((m.cuenta || '') !== (cuenta || '')) return a;
    return a + (m.tipo === 'entrada' ? m.monto : -m.monto);
  }, 0);
  ctx.getEncargo = id => (ctx.S.encargos || []).find(e => e.id === id);
  ctx.encargoSaldo = enc => (enc.movimientos || []).reduce((a, m) => a + (m.tipo === 'entrada' ? m.monto : -m.monto), 0);
  ctx._getEncargoSaldoEnCuenta = (enc, cuenta) => mov(enc, cuenta);
  ctx._getEncargoSaldoSinCuenta = enc => mov(enc, '');
  ctx._getEncargoSaldoPorCuenta = enc => {
    const set = new Set((enc.movimientos || []).map(m => m.cuenta).filter(Boolean));
    return [...set].map(c => ({ cuenta: c, label: c, saldo: mov(enc, c) }));
  };
}

function fresh({ nequi = 0, efectivo = 0, encargos = [], extra = {} } = {}) {
  const ctx = loadApp([
    path.join(CORE, 'core-state.js'),
    path.join(CORE, 'calc-helpers.js'),
    path.join(CORE, 'cuenta-efectos.js'),
    path.join(CORE, 'split.js'),          // mesada.js registra su widget de split al cargar
    path.join(MODS, 'mesada.js'),         // reglas (Parte 1) + pantalla (Parte 2); solo se ejercitan las reglas
  ]);
  Object.assign(ctx.S, {
    cuentas: [{ id: 'nequi', tipo: 'nequi', saldo: nequi }, { id: 'efectivo', tipo: 'efectivo', saldo: efectivo }],
    movimientos: [],
    encargos,
    ...extra,
  });
  stubEncargos(ctx);
  return ctx;
}

const saldo = (ctx, id) => ctx.S.cuentas.find(c => c.id === id).saldo;
const enc = (id, nombre, movs) => ({ id, nombre, movimientos: movs });
const entrada = (monto, cuenta = '') => ({ id: 'm' + monto + cuenta, tipo: 'entrada', monto, cuenta });
const pago = (ctx, over = {}) => ctx.mesadaRegistrarPago({
  parent: 'papa', key: '2026-3', monto: 80000, fecha: '2026-04-05', nota: '', destino: '', ...over,
});

/* ── Registrar pago: forma de lo guardado (no cambió respecto a antes) ── */

test('registrar — a una cuenta: sube el saldo, deja espejo automático y guarda la forma de siempre', () => {
  const ctx = fresh({ nequi: 1000 });
  const r = pago(ctx, { destino: 'nequi', nota: 'n' });
  assert.equal(r.ok, true);
  assert.equal(saldo(ctx, 'nequi'), 81000);
  const info = ctx.getMesadaData('papa')['2026-3'];
  assert.deepEqual(Object.keys(info).sort(), ['_movSecId', 'destino', 'fecha', 'monto', 'nota']);
  const esp = ctx.S.movimientos.find(m => m.id === info._movSecId);
  assert.ok(esp && esp._secundario && esp._origenSeccion === 'Mesada' && esp.monto === 80000);
  assert.equal(esp.desc, 'Mesada — Papá · Abr 2026');
});

test('registrar — "no especificar / lo gasté": ningún saldo ni espejo, y cuenta como recibido', () => {
  const ctx = fresh({ nequi: 1000 });
  pago(ctx, { destino: '' });
  assert.equal(saldo(ctx, 'nequi'), 1000);
  assert.equal(ctx.S.movimientos.length, 0);
  assert.deepEqual(clone(ctx.getMesadaData('papa')['2026-3']), { monto: 80000, fecha: '2026-04-05', destino: '', nota: '' });
});

test('registrar — dividido: cada fuente suma lo suyo con su espejo; lo sin asignar no mueve nada', () => {
  const ctx = fresh();
  const r = pago(ctx, { splitMode: true, splits: [{ fuente: 'nequi', monto: 50000 }, { fuente: 'efectivo', monto: 20000 }] });
  assert.equal(r.ok, true);
  assert.equal(saldo(ctx, 'nequi'), 50000);
  assert.equal(saldo(ctx, 'efectivo'), 20000);
  const info = ctx.getMesadaData('papa')['2026-3'];
  assert.equal(info.destino, '');
  assert.equal(info.monto, 80000);
  assert.ok(info.splits.every(s => s._movSecId));
  assert.equal(ctx.S.movimientos.length, 2);
});

test('registrar — dividido que excede el monto se rechaza sin tocar nada', () => {
  const ctx = fresh();
  const antes = clone(ctx.S);
  const r = pago(ctx, { splitMode: true, splits: [{ fuente: 'nequi', monto: 90000 }] });
  assert.deepEqual([r.ok, r.motivo], [false, 'split-excede']);
  assert.deepEqual(clone(ctx.S), antes);
});

test('registrar — datos incompletos', () => {
  const ctx = fresh();
  assert.equal(pago(ctx, { monto: 0 }).motivo, 'datos-incompletos');
  assert.equal(pago(ctx, { parent: '' }).motivo, 'datos-incompletos');
});

test('registrar — "quedó debiendo" usa la cuota del AÑO del mes, no la del año visible', () => {
  const ctx = fresh({ extra: { mesadaAnio: 2030 } });
  ctx._ensureMesadas();
  ctx.S.mesadas.papa.cuotas = { '2025': 90000, '2026': 100000 };
  const r = pago(ctx, { key: '2025-3', monto: 60000, quedaDebiendo: true });
  assert.equal(r.pendiente, 30000);
  const info = ctx.getMesadaData('papa')['2025-3'];
  assert.deepEqual(clone([info.cuotaEsperada, info.pendiente, info.pendienteHistorial]), [90000, 30000, []]);
});

test('registrar — monto menor a la cuota SIN marcar el toggle no genera deuda', () => {
  const ctx = fresh();
  ctx._ensureMesadas(); ctx.S.mesadas.papa.cuotas = { '2026': 90000 };
  pago(ctx, { monto: 60000, quedaDebiendo: false });
  assert.equal(ctx.getMesadaData('papa')['2026-3'].pendiente, undefined);
});

/* ── Pagar con plata de un encargo ───────────────────────────────── */

test('encargo — descuenta del encargo, suma a la cuenta destino y marca sumado', () => {
  const ctx = fresh({ encargos: [enc('e1', 'Plata de papá', [entrada(100000, 'nequi')])] });
  const r = pago(ctx, { destino: 'nequi', encargo: { id: 'e1', cuentaSel: 'nequi' } });
  assert.equal(r.ok, true);
  const info = ctx.getMesadaData('papa')['2026-3'];
  assert.deepEqual(clone(info.origenEncargo), { encargoId: 'e1', movId: info.origenEncargo.movId, nombre: 'Plata de papá', sumado: true });
  assert.equal(ctx.encargoSaldo(ctx.S.encargos[0]), 20000);
  assert.equal(saldo(ctx, 'nequi'), 80000);
});

test('encargo — saldo insuficiente se rechaza sin dejar rastro', () => {
  const ctx = fresh({ encargos: [enc('e1', 'Papá', [entrada(10000, 'nequi')])] });
  const antes = clone(ctx.S);
  const r = pago(ctx, { destino: 'nequi', encargo: { id: 'e1', cuentaSel: 'nequi' } });
  assert.deepEqual([r.ok, r.motivo, r.disponible, r.encNombre], [false, 'encargo-insuficiente', 10000, 'Papá']);
  assert.deepEqual(clone(ctx.S), antes);
});

test('encargo inexistente se rechaza', () => {
  const ctx = fresh();
  assert.equal(pago(ctx, { encargo: { id: 'nope', cuentaSel: '' } }).motivo, 'encargo-invalido');
});

test('REGRESIÓN bug 1 — encargo + dividido que excede NO deja la salida huérfana en el encargo', () => {
  // Antes: la salida se agregaba al encargo ANTES de validar el split; si fallaba, quedaba
  // descontada y al reintentar se descontaba dos veces.
  const ctx = fresh({ encargos: [enc('e1', 'Papá', [entrada(200000, 'nequi')])] });
  const antes = clone(ctx.S);
  const r = pago(ctx, { splitMode: true, splits: [{ fuente: 'nequi', monto: 99999 }], encargo: { id: 'e1', cuentaSel: 'nequi' } });
  assert.equal(r.motivo, 'split-excede');
  assert.deepEqual(clone(ctx.S), antes);
  assert.equal(ctx.encargoSaldo(ctx.S.encargos[0]), 200000);
});

test('encargo sin destino: la salida del encargo existe pero sumado=false y no sube ningún saldo', () => {
  const ctx = fresh({ encargos: [enc('e1', 'Papá', [entrada(100000)])] });
  pago(ctx, { destino: '', encargo: { id: 'e1', cuentaSel: '' } });
  assert.equal(ctx.getMesadaData('papa')['2026-3'].origenEncargo.sumado, false);
  assert.equal(saldo(ctx, 'nequi'), 0);
  assert.equal(ctx.encargoSaldo(ctx.S.encargos[0]), 20000);
});

/* ── Abonar lo pendiente ──────────────────────────────────────────── */

function conPendiente(ctx) {
  ctx._ensureMesadas(); ctx.S.mesadas.papa.cuotas = { '2026': 80000 };
  pago(ctx, { monto: 60000, destino: 'nequi', quedaDebiendo: true });
}

test('abonar — suma al monto, resta del pendiente y guarda el abono en el historial', () => {
  const ctx = fresh();
  conPendiente(ctx);
  const r = ctx.mesadaAbonarPendiente({ parent: 'papa', key: '2026-3', monto: 5000, fecha: '2026-05-01', nota: '', destino: 'efectivo' });
  assert.deepEqual([r.ok, r.pendiente], [true, 15000]);
  const info = ctx.getMesadaData('papa')['2026-3'];
  assert.deepEqual([info.monto, info.pendiente, info.pendienteHistorial.length], [65000, 15000, 1]);
  assert.equal(saldo(ctx, 'efectivo'), 5000);
});

test('abonar — recorta al pendiente si se pasa', () => {
  const ctx = fresh();
  conPendiente(ctx);
  const r = ctx.mesadaAbonarPendiente({ parent: 'papa', key: '2026-3', monto: 999999, fecha: '2026-05-01', destino: 'nequi' });
  assert.deepEqual([r.pendiente, r.monto], [0, 20000]);
  assert.equal(ctx.getMesadaData('papa')['2026-3'].monto, 80000);
});

test('abonar — mes sin pendiente se rechaza', () => {
  const ctx = fresh();
  pago(ctx, { destino: 'nequi' });
  assert.equal(ctx.mesadaAbonarPendiente({ parent: 'papa', key: '2026-3', monto: 1, destino: '' }).motivo, 'sin-pendiente');
});

test('abonar con encargo insuficiente se rechaza sin tocar nada', () => {
  const ctx = fresh({ encargos: [enc('e1', 'Papá', [entrada(1000, 'nequi')])] });
  conPendiente(ctx);
  const antes = clone(ctx.S);
  const r = ctx.mesadaAbonarPendiente({ parent: 'papa', key: '2026-3', monto: 5000, destino: 'nequi', encargo: { id: 'e1', cuentaSel: 'nequi' } });
  assert.equal(r.motivo, 'encargo-insuficiente');
  assert.deepEqual(clone(ctx.S), antes);
});

test('marcar como pendiente: retroactivo, y rechaza un mes ya completo', () => {
  const ctx = fresh();
  ctx._ensureMesadas(); ctx.S.mesadas.papa.cuotas = { '2026': 80000 };
  pago(ctx, { monto: 60000 });
  assert.equal(ctx.mesadaMarcarPendiente('papa', '2026-3').pendiente, 20000);
  pago(ctx, { key: '2026-4', monto: 80000 });
  assert.equal(ctx.mesadaMarcarPendiente('papa', '2026-4').motivo, 'completo');
});

/* ── Borrar y deshacer: ida y vuelta EXACTA ───────────────────────── */

// Invariante central: registrar (+ abonar) y luego borrar deja S exactamente como estaba.
function idaYVuelta(nombre, preparar) {
  test('ida y vuelta — ' + nombre, () => {
    const ctx = fresh({ nequi: 5000, efectivo: 700, encargos: [enc('e1', 'Mamá', [entrada(300000, 'nequi'), entrada(50000)])] });
    ctx.S.cuentas.push({ id: 'c1', tipo: 'custom', nombre: 'C1', saldo: 100, movimientos: [] });
    ctx._ensureMesadas(); ctx.S.mesadas.papa.cuotas = { '2026': 80000 };
    const antes = clone(ctx.S);
    preparar(ctx);
    assert.notDeepEqual(clone(ctx.S), antes, 'el escenario debería haber cambiado algo');
    assert.equal(ctx.mesadaBorrarPago('papa', '2026-3'), true);
    assert.deepEqual(clone(ctx.S), antes);
  });
}

idaYVuelta('cuenta simple', ctx => pago(ctx, { destino: 'nequi' }));
idaYVuelta('cuenta personalizada', ctx => pago(ctx, { destino: 'custom:c1' }));
idaYVuelta('dividido', ctx => pago(ctx, { splitMode: true, splits: [{ fuente: 'nequi', monto: 30000 }, { fuente: 'custom:c1', monto: 50000 }] }));
idaYVuelta('con encargo y cuenta simple', ctx => pago(ctx, { destino: 'efectivo', encargo: { id: 'e1', cuentaSel: 'nequi' } }));
idaYVuelta('con encargo y dividido', ctx => pago(ctx, { splitMode: true, splits: [{ fuente: 'nequi', monto: 40000 }, { fuente: 'efectivo', monto: 40000 }], encargo: { id: 'e1', cuentaSel: 'nequi' } }));
idaYVuelta('con encargo sin destino', ctx => pago(ctx, { monto: 40000, destino: '', encargo: { id: 'e1', cuentaSel: '' } }));
idaYVuelta('sin especificar', ctx => pago(ctx, { destino: '' }));
idaYVuelta('con abonos del pendiente a cuentas distintas (incl. uno con encargo)', ctx => {
  pago(ctx, { monto: 50000, destino: 'nequi', quedaDebiendo: true });
  ctx.mesadaAbonarPendiente({ parent: 'papa', key: '2026-3', monto: 10000, fecha: '2026-05-01', destino: 'efectivo' });
  ctx.mesadaAbonarPendiente({ parent: 'papa', key: '2026-3', monto: 10000, fecha: '2026-05-02', destino: 'custom:c1', encargo: { id: 'e1', cuentaSel: 'nequi' } });
});

test('deshacer un abono deja el mes exactamente como antes de ese abono', () => {
  const ctx = fresh({ encargos: [enc('e1', 'Papá', [entrada(300000, 'nequi')])] });
  conPendiente(ctx);
  ctx.mesadaAbonarPendiente({ parent: 'papa', key: '2026-3', monto: 5000, fecha: '2026-05-01', destino: 'efectivo' });
  const antes = clone(ctx.S);
  ctx.mesadaAbonarPendiente({ parent: 'papa', key: '2026-3', monto: 7000, fecha: '2026-05-02', destino: 'nequi', encargo: { id: 'e1', cuentaSel: 'nequi' } });
  assert.equal(ctx.mesadaDeshacerAbono('papa', '2026-3', 1), true);
  assert.deepEqual(clone(ctx.S), antes);
  assert.equal(ctx.mesadaDeshacerAbono('papa', '2026-3', 9), false);
});

test('REGRESIÓN bug 2 — si la salida del encargo ya no existe, borrar IGUAL devuelve la plata a la cuenta', () => {
  // Antes: el monto a devolver se leía del movimiento del encargo; sin él quedaba en 0, no se
  // descontaba nada y el espejo sí se borraba → saldo inflado y sin rastro.
  const ctx = fresh({ nequi: 1000, encargos: [enc('e1', 'Papá', [entrada(100000, 'nequi')])] });
  pago(ctx, { destino: 'nequi', encargo: { id: 'e1', cuentaSel: 'nequi' } });
  assert.equal(saldo(ctx, 'nequi'), 81000);
  ctx.S.encargos[0].movimientos = ctx.S.encargos[0].movimientos.filter(m => m.tipo === 'entrada'); // alguien la borró
  ctx.mesadaBorrarPago('papa', '2026-3');
  assert.equal(saldo(ctx, 'nequi'), 1000);
  assert.equal(ctx.S.movimientos.length, 0);
});

test('borrar un mes que no existe devuelve false', () => {
  assert.equal(fresh().mesadaBorrarPago('papa', '2026-0'), false);
});

/* ── Vista normalizada y protección por antigüedad ────────────────── */

test('mesadaAbonosDe — el original es monto − abonos y todos tienen la misma forma', () => {
  const ctx = fresh();
  conPendiente(ctx);
  ctx.mesadaAbonarPendiente({ parent: 'papa', key: '2026-3', monto: 5000, fecha: '2026-05-01', destino: 'efectivo' });
  const abs = ctx.mesadaAbonosDe(ctx.getMesadaData('papa')['2026-3']);
  assert.deepEqual(clone(abs.map(a => [a.esOriginal, a.monto, a.destino])), [[true, 60000, 'nequi'], [false, 5000, 'efectivo']]);
  assert.deepEqual(Object.keys(abs[0]).sort(), Object.keys(abs[1]).sort());
});

test('antigüedad — las cuentas de los abonos también cuentan (antes solo las del pago original)', () => {
  const ctx = fresh();
  pago(ctx, { monto: 50000, destino: '', quedaDebiendo: true });
  ctx.S.mesadas.papa.cuotas = { '2026': 80000 };
  ctx.mesadaMarcarPendiente('papa', '2026-3');
  ctx.mesadaAbonarPendiente({ parent: 'papa', key: '2026-3', monto: 5000, fecha: '2026-05-01', destino: 'nequi' });
  const info = ctx.getMesadaData('papa')['2026-3'];
  assert.deepEqual(ctx.mesadaFuentesDe(info), ['nequi']);
  assert.equal(ctx.mesadaTieneCuentaAfectada(info), true);
});

test('antigüedad — un pago 100% "no especificar" no tiene nada que proteger', () => {
  const ctx = fresh();
  pago(ctx, { destino: '' });
  assert.equal(ctx.mesadaTieneCuentaAfectada(ctx.getMesadaData('papa')['2026-3']), false);
});

test('antigüedad — cuenta los pagos POSTERIORES que tocaron las mismas cuentas', () => {
  const ctx = fresh();
  pago(ctx, { key: '2026-1', fecha: '2026-02-05', destino: 'nequi' });
  pago(ctx, { key: '2026-2', fecha: '2026-03-05', destino: 'nequi' });
  pago(ctx, { key: '2026-3', fecha: '2026-04-05', destino: 'efectivo' });
  pago(ctx, { parent: 'mama', key: '2026-3', fecha: '2026-04-06', destino: 'nequi' });
  const info = ctx.getMesadaData('papa')['2026-1'];
  assert.equal(ctx.mesadaOpsPosteriores('papa', '2026-1', info), 2);
});

/* ── Pantalla principal: estados y vencimientos ───────────────────── */

const d = (y, m, dia) => new Date(y, m, dia);

test('vencimiento — papá vence el día 30 del propio mes; mamá el día 1 del mes siguiente', () => {
  const ctx = fresh();
  // Mes en curso: octubre 2026 (mes 9) con 31 días
  assert.equal(ctx.mesadaMesVencido('papa', 2026, 9, d(2026, 9, 30)), false);
  assert.equal(ctx.mesadaMesVencido('papa', 2026, 9, d(2026, 9, 31)), true);
  assert.equal(ctx.mesadaMesVencido('mama', 2026, 9, d(2026, 9, 31)), false);
  assert.equal(ctx.mesadaMesVencido('mama', 2026, 8, d(2026, 9, 1)), true);
  assert.equal(ctx.mesadaMesVencido('papa', 2026, 10, d(2026, 9, 31)), false);
  assert.equal(ctx.mesadaMesVencido('papa', 2025, 11, d(2026, 0, 1)), true);
  assert.equal(ctx.mesadaMesVencido('papa', 2027, 0, d(2026, 9, 31)), false);
});

test('resumen del año — estados, totales y esperados', () => {
  const ctx = fresh();
  ctx._ensureMesadas(); ctx.S.mesadas.papa.cuotas = { '2026': 80000 }; ctx.S.mesadas.mama.cuotas = { '2026': 80000 };
  pago(ctx, { key: '2026-0', monto: 80000, destino: '' });
  pago(ctx, { key: '2026-1', monto: 60000, destino: '', quedaDebiendo: true });
  pago(ctx, { parent: 'mama', key: '2026-0', monto: 80000, destino: '' });
  const r = ctx.mesadaResumenAnio(2026, d(2026, 3, 15)); // 15 de abril: marzo ya venció, abril (mes en curso) no
  const papa = r.padres.papa;
  assert.deepEqual(clone(papa.meses.slice(0, 4).map(m => m.estado)), ['pagado', 'pendiente', 'perdido', 'vacio']);
  assert.deepEqual(clone([papa.totalRecibido, papa.mesesPagados, papa.mesesPerdidos, papa.totalPendiente, papa.mesesPendientes]), [140000, 2, 1, 20000, 1]);
  assert.deepEqual(clone([r.totalAnio, r.pagadosAnio, r.esperadosAnio]), [220000, 3, 8]);
  assert.equal(ctx.mesadaResumenAnio(2027, d(2026, 3, 15)).esperadosAnio, 0);
  assert.equal(ctx.mesadaResumenAnio(2025, d(2026, 3, 15)).esperadosAnio, 24);
});

/* ── Encargos candidatos ──────────────────────────────────────────── */

const candidatos = (ctx, p) => ctx.mesadaEncargosDelParent(p).map(x => x.enc.id);

test('encargos candidatos — por nombre, palabra completa, con saldo y de mayor a menor', () => {
  const ctx = fresh({ encargos: [
    enc('a', 'Plata de papá para el mercado', [entrada(1000)]),
    enc('b', 'Papi', [entrada(5000)]),
    enc('c', 'papayera', [entrada(9000)]),
    enc('d', 'Papás', [entrada(100)]),
    enc('e', 'Papá sin saldo', []),
    enc('f', 'Mamá', [entrada(7000)]),
    enc('g', 'MADRE', [entrada(100)]),
  ] });
  // 'Papás' (plural) entra; 'papayera' no. 'Papas' a secas (las del almuerzo) es indistinguible de 'Papás':
  // la forma de evitarlo es ponerle otro nombre al encargo.
  assert.deepEqual(candidatos(ctx, 'papa'), ['b', 'a', 'd']);
  assert.deepEqual(candidatos(ctx, 'mama'), ['f', 'g']);
});

test('sin Encargos cargado no hay candidatos (guard)', () => {
  const ctx = fresh({ encargos: [enc('a', 'Papá', [entrada(1000)])] });
  ctx.encargoSaldo = undefined;
  assert.deepEqual(clone(ctx.mesadaEncargosDelParent('papa')), []);
});

/* ── Protección en Encargos ───────────────────────────────────────── */

test('mesadaOrigenDeMovEncargo — reconoce la salida de un pago y la de un abono; ignora las demás', () => {
  const ctx = fresh({ encargos: [enc('e1', 'Papá', [entrada(300000, 'nequi')])] });
  ctx._ensureMesadas(); ctx.S.mesadas.papa.cuotas = { '2026': 80000 };
  pago(ctx, { monto: 50000, destino: 'nequi', quedaDebiendo: true, encargo: { id: 'e1', cuentaSel: 'nequi' } });
  ctx.mesadaAbonarPendiente({ parent: 'papa', key: '2026-3', monto: 10000, destino: '', encargo: { id: 'e1', cuentaSel: 'nequi' } });
  const info = ctx.getMesadaData('papa')['2026-3'];
  assert.deepEqual(clone(ctx.mesadaOrigenDeMovEncargo(info.origenEncargo.movId)), { parent: 'papa', key: '2026-3' });
  assert.deepEqual(clone(ctx.mesadaOrigenDeMovEncargo(info.pendienteHistorial[0].origenEncargo.movId)), { parent: 'papa', key: '2026-3' });
  assert.equal(ctx.mesadaOrigenDeMovEncargo('m300000nequi'), null);
  assert.equal(ctx.mesadaOrigenDeMovEncargo(''), null);
});

test('mesadaOrigenDeMovEncargo — tras borrar el mes ya no bloquea (la salida desapareció)', () => {
  const ctx = fresh({ encargos: [enc('e1', 'Papá', [entrada(300000, 'nequi')])] });
  pago(ctx, { destino: 'nequi', encargo: { id: 'e1', cuentaSel: 'nequi' } });
  const movId = ctx.getMesadaData('papa')['2026-3'].origenEncargo.movId;
  ctx.mesadaBorrarPago('papa', '2026-3');
  assert.equal(ctx.mesadaOrigenDeMovEncargo(movId), null);
});

