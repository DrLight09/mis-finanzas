'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const CORE_DIR = process.env.MIS_FINANZAS_CORE_DIR
  || path.join(__dirname, '..', 'js', 'core');
const MODULES_DIR = process.env.MIS_FINANZAS_MODULES_DIR
  || path.join(__dirname, '..', 'js', 'modules');

// "Me deben": registrar un movimiento se divide en _planMovimiento() (lee el formulario y valida, sin escribir;
// necesita DOM, no se prueba acá) y _aplicarMovimiento(plan) (escribe, sin validaciones). Estos tests arman el plan
// a mano y comprueban el efecto financiero y que _revertirMovDeudor() lo deshace exacto.
// Orden igual que index.html: core-state → cuenta-efectos → calc-helpers → módulo.
function freshApp() {
  const ctx = loadApp([
    path.join(CORE_DIR, 'core-state.js'),
    path.join(CORE_DIR, 'cuenta-efectos.js'),
    path.join(CORE_DIR, 'calc-helpers.js'),
    path.join(MODULES_DIR, 'prestado.js'),
    path.join(MODULES_DIR, 'tarjetas_credito.js'),
  ], { permissive: true });
  Object.assign(ctx.S, {
    cuentas: [
      { id: 'nequi', tipo: 'nequi', saldo: 200000 },
      { id: 'efectivo', tipo: 'efectivo', saldo: 100000 },
    ],
    movimientos: [], gastosVar: [], ingresosExtra: [], cajitas: [], tcMovimientos: [], tarjetasCredito: [],
    encargos: [{ id: 'e1', nombre: 'Enc', saldoInicial: 80000, cuentaInicial: 'efectivo', movimientos: [] }],
    misDeudas: [],
    deudores: [{
      id: 'd1', nombre: 'Ana', color: '', movimientos: [{ id: 'm0', tipo: 'prestamo', monto: 100000, fecha: '2026-09-01', fuente: 'nequi', grupoId: 'g0' }],
      grupos: [{ id: 'g0', nombre: 'Préstamo', fechaInicio: '2026-09-01', estado: 'abierto' }],
    }],
  });
  return ctx;
}
const saldo = (ctx, id) => ctx.S.cuentas.find((c) => c.id === id).saldo;
const debe = (ctx) => ctx.getDeudorSaldo(ctx.S.deudores[0]);
const plan = (ctx, o) => Object.assign({ d: ctx.S.deudores[0], tipo: 'abono', fecha: '2026-10-02', nota: '', perdon: false, enc: null, destinos: null, destino: '', tieneExtra: false, extraMonto: 0, extPartes: [] }, o);
function aplicar(ctx, o) { const p = plan(ctx, o); ctx._aplicarMovimiento(p); return ctx.S.deudores[0].movimientos[ctx.S.deudores[0].movimientos.length - 1]; }
function revertir(ctx, mov) { ctx._revertirMovDeudor(ctx.S.deudores[0], mov); }

test('Me deben — préstamo simple: sale de la cuenta, la deuda sube, el patrimonio queda igual; revertir lo deja como estaba', () => {
  const ctx = freshApp(); const p0 = ctx.calcPatrimonioTotal();
  const mov = aplicar(ctx, { tipo: 'prestamo', monto: 30000, montoSalio: 30000, hayMargen: false, fuentes: null, fuente: 'efectivo' });
  assert.equal(saldo(ctx, 'efectivo'), 70000);
  assert.equal(debe(ctx), 130000);
  assert.equal(ctx.calcPatrimonioTotal(), p0, 'prestar no cambia el patrimonio (activo ↓, plata prestada ↑)');
  revertir(ctx, mov);
  assert.equal(saldo(ctx, 'efectivo'), 100000);
  assert.equal(debe(ctx), 100000);
});

test('Me deben — préstamo dividido entre cuentas (una fila "ganancia" no descuenta ninguna cuenta)', () => {
  const ctx = freshApp();
  const mov = aplicar(ctx, { tipo: 'prestamo', monto: 50000, montoSalio: 50000, hayMargen: false, fuente: '', fuentes: [{ fuente: 'efectivo', monto: 20000 }, { fuente: 'nequi', monto: 20000 }, { fuente: 'ganancia', monto: 10000 }] });
  assert.equal(saldo(ctx, 'efectivo'), 80000);
  assert.equal(saldo(ctx, 'nequi'), 180000);
  assert.equal(mov._gananciaVirtual, 10000);
  revertir(ctx, mov);
  assert.equal(saldo(ctx, 'efectivo'), 100000);
  assert.equal(saldo(ctx, 'nequi'), 200000);
});

test('Me deben — abono a una cuenta: la deuda baja, el patrimonio queda igual, y deja movimiento espejo en la cuenta', () => {
  const ctx = freshApp(); const p0 = ctx.calcPatrimonioTotal();
  const mov = aplicar(ctx, { monto: 20000, destino: 'nequi' });
  assert.equal(saldo(ctx, 'nequi'), 220000);
  assert.equal(debe(ctx), 80000);
  assert.equal(ctx.calcPatrimonioTotal(), p0);
  assert.equal(ctx.S.movimientos.filter((m) => m._secundario && m.tipo === 'entrada').length, 1);
  revertir(ctx, mov);
  assert.equal(saldo(ctx, 'nequi'), 200000);
  assert.equal(debe(ctx), 100000);
  assert.equal(ctx.S.movimientos.length, 0);
});

test('Me deben — abono dividido entre cuentas, y el que va "sin cuenta" no mueve ningún saldo', () => {
  const ctx = freshApp();
  const mov = aplicar(ctx, { monto: 30000, destinos: [{ fuente: 'nequi', monto: 12000 }, { fuente: 'efectivo', monto: 18000 }] });
  assert.equal(saldo(ctx, 'nequi'), 212000);
  assert.equal(saldo(ctx, 'efectivo'), 118000);
  revertir(ctx, mov);
  assert.equal(saldo(ctx, 'nequi'), 200000);
  assert.equal(saldo(ctx, 'efectivo'), 100000);
  const sin = aplicar(ctx, { monto: 7000, destino: '' });
  assert.equal(saldo(ctx, 'nequi'), 200000);
  assert.equal(debe(ctx), 93000);
  revertir(ctx, sin);
  assert.equal(debe(ctx), 100000);
});

test('Me deben — perdón = gasto real: la deuda queda en 0, ninguna cuenta se mueve, el patrimonio baja lo perdonado', () => {
  const ctx = freshApp(); const p0 = ctx.calcPatrimonioTotal();
  const mov = aplicar(ctx, { tipo: 'pago-completo', monto: 100000, perdon: true });
  assert.equal(debe(ctx), 0);
  assert.equal(saldo(ctx, 'nequi'), 200000);
  assert.equal(ctx.calcPatrimonioTotal() - p0, -100000, 'lo que te debían deja de ser un activo');
  assert.equal(ctx.S.gastosVar.length, 1);
  assert.equal(ctx._esGastoVarNoReal(ctx.S.gastosVar[0]), false, 'cuenta como gasto real');
  revertir(ctx, mov);
  assert.equal(debe(ctx), 100000);
  assert.equal(ctx.S.gastosVar.length, 0);
});

test('Me deben — abono con extra: guardar es ingreso real, gastar es gasto, pendiente es ingreso sin cuenta, regalar no mueve nada', () => {
  const ctx = freshApp();
  const mov = aplicar(ctx, {
    monto: 20000, destino: 'nequi', tieneExtra: true, extraMonto: 10000,
    extPartes: [{ tipo: 'guardar', cuenta: 'efectivo', monto: 4000 }, { tipo: 'gastar', monto: 2000, desc: 'x' }, { tipo: 'regalar', monto: 1000 }, { tipo: 'pendiente', monto: 3000 }],
  });
  assert.equal(saldo(ctx, 'efectivo'), 104000);
  assert.equal(ctx.S.gastosVar.length, 1);
  assert.equal(ctx.S.ingresosExtra.length, 1);
  const ing = ctx.S.movimientos.find((m) => m._esExtraIngreso);
  assert.ok(ing, 'el extra guardado en una cuenta cuenta como ingreso real');
  assert.equal(ctx._esEntradaEspejoNoIngreso(ing), false);
  assert.equal(mov._extPartes.length, 4);
  revertir(ctx, mov);
  assert.equal(saldo(ctx, 'efectivo'), 100000);
  assert.equal(saldo(ctx, 'nequi'), 200000);
  assert.equal(ctx.S.gastosVar.length + ctx.S.ingresosExtra.length + ctx.S.movimientos.length, 0);
});

test('Me deben — abono vía encargo: descuenta el encargo, no el patrimonio total; revertir devuelve la salida del encargo', () => {
  const ctx = freshApp();
  const enc = ctx.S.encargos[0];
  const mov = aplicar(ctx, { monto: 30000, destino: 'nequi', enc, encCuentaSplits: null, encCuenta: 'efectivo' });
  assert.equal(saldo(ctx, 'nequi'), 230000);
  assert.equal(enc.movimientos.length, 1);
  assert.equal(enc.movimientos[0].tipo, 'salida');
  assert.equal(enc.movimientos[0].cuenta, 'efectivo');
  assert.equal(mov._viaEncargo, true);
  revertir(ctx, mov);
  assert.equal(saldo(ctx, 'nequi'), 200000);
  assert.equal(enc.movimientos.length, 0);
});

test('Me deben — abono vía encargo con la plata saliendo de dos cuentas del encargo: una salida por cuenta, todas se revierten', () => {
  const ctx = freshApp();
  const enc = ctx.S.encargos[0];
  const mov = aplicar(ctx, { monto: 30000, destino: 'nequi', enc, encCuentaSplits: [{ fuente: 'efectivo', monto: 10000 }, { fuente: 'nequi', monto: 20000 }], encCuenta: '' });
  assert.equal(enc.movimientos.length, 2);
  assert.equal(new Set(enc.movimientos.map((m) => m._grupoAbonoId)).size, 1, 'comparten el mismo grupo para tratarse como una unidad');
  revertir(ctx, mov);
  assert.equal(enc.movimientos.length, 0);
});

test('Me deben — préstamo vía tarjeta: revertir baja la deuda de la TC y quita su cargo', () => {
  const ctx = freshApp();
  ctx.S.tarjetasCredito = [{ id: 'tc1', nombre: 'Visa', cupo: 100000, deuda: 30000, estado: 'activa', compras: [], pagos: [], saldoInicial: null }];
  ctx.S.tcMovimientos = [{ id: 'x', tcId: 'tc1', tipo: 'cargo_prestamo', monto: 30000, _deudorMovId: 'mt' }];
  const d = ctx.S.deudores[0];
  d.movimientos.push({ id: 'mt', tipo: 'prestamo', monto: 30000, fecha: '2026-09-20', _viaTC: true, _tcId: 'tc1', _tcMonto: 30000 });
  ctx._revertirMovDeudor(d, d.movimientos.find((m) => m.id === 'mt'));
  assert.equal(ctx.S.tarjetasCredito[0].deuda, 0);
  assert.equal(ctx.S.tcMovimientos.length, 0);
  assert.equal(d.movimientos.some((m) => m.id === 'mt'), false);
});

test('Me deben — revertir un abono cuyo espejo ya no existe NO devuelve el saldo otra vez', () => {
  const ctx = freshApp();
  const mov = aplicar(ctx, { monto: 30000, destino: 'nequi' });
  assert.equal(saldo(ctx, 'nequi'), 230000);
  ctx.S.movimientos = []; // alguien borró el espejo a mano
  revertir(ctx, mov);
  assert.equal(saldo(ctx, 'nequi'), 230000);
});

test('Me deben — perdonar UNA PARTE: la deuda baja, ninguna cuenta se mueve, el gasto es lo perdonado y revertir devuelve solo esa parte', () => {
  const ctx = freshApp(); const p0 = ctx.calcPatrimonioTotal();
  const parcial = aplicar(ctx, { tipo: 'abono', monto: 30000, perdon: true });
  assert.equal(debe(ctx), 70000);
  assert.equal(parcial.tipo, 'abono', 'una parte se guarda como abono (con _perdon)');
  assert.equal(parcial._perdon, true);
  assert.equal(saldo(ctx, 'nequi'), 200000);
  assert.equal(ctx.S.gastosVar.length, 1);
  assert.equal(ctx.S.gastosVar[0].monto, 30000);
  assert.equal(ctx._esGastoVarNoReal(ctx.S.gastosVar[0]), false, 'cuenta como gasto real');
  assert.equal(ctx.calcPatrimonioTotal() - p0, -30000);
  // perdonar lo que queda = pago completo
  const resto = aplicar(ctx, { tipo: 'abono', monto: 70000, perdon: true });
  assert.equal(resto.tipo, 'pago-completo');
  assert.equal(debe(ctx), 0);
  assert.equal(ctx.S.gastosVar.length, 2);
  // revertir solo la primera
  revertir(ctx, parcial);
  assert.equal(debe(ctx), 30000);
  assert.equal(ctx.S.gastosVar.length, 1);
  assert.equal(ctx.S.gastosVar[0].monto, 70000);
});

test('Me deben — lo perdonado no cuenta como plata recibida (los totales filtran _perdon)', () => {
  const ctx = freshApp();
  aplicar(ctx, { tipo: 'abono', monto: 30000, perdon: true });
  const d = ctx.S.deudores[0];
  const recibido = d.movimientos.filter((m) => (m.tipo === 'abono' || m.tipo === 'pago-completo') && !m._perdon);
  assert.equal(recibido.length, 0);
});
