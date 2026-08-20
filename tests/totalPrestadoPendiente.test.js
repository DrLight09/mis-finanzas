'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const CORE_DIR = process.env.MIS_FINANZAS_CORE_DIR
  || path.join(__dirname, '..', 'js', 'core');
const MODULES_DIR = process.env.MIS_FINANZAS_MODULES_DIR
  || path.join(__dirname, '..', 'js', 'modules');

// prestado.js también referencia funciones de UI de otros archivos core
// (openSheet/toast/dialogo) a nivel de módulo — mismo caso que cuentas.js,
// ver tests/support/load-app.js.
function freshApp(sOverrides = {}) {
  const ctx = loadApp([
    path.join(CORE_DIR, 'core-state.js'),
    path.join(MODULES_DIR, 'prestado.js'),
  ], { permissive: true });
  Object.assign(ctx.S, sOverrides);
  return ctx;
}

test('getDeudorSaldoPatrimonio — suma préstamos y resta abonos, sin importar el signo neto', () => {
  const ctx = freshApp();
  const d = {
    movimientos: [
      { tipo: 'prestamo', monto: 500000 },
      { tipo: 'abono', monto: 200000 },
    ],
  };
  assert.equal(ctx.getDeudorSaldoPatrimonio(d), 300000);
});

test('getDeudorSaldoPatrimonio — puede dar negativo si abonó de más (a diferencia de totalPrestadoPendiente, que no lo pisa a 0)', () => {
  const ctx = freshApp();
  const d = {
    movimientos: [
      { tipo: 'prestamo', monto: 100000 },
      { tipo: 'abono', monto: 150000 },
    ],
  };
  assert.equal(ctx.getDeudorSaldoPatrimonio(d), -50000);
});

test('totalPrestadoPendiente — suma solo los deudores con saldo positivo, ignora los saldados o negativos', () => {
  const ctx = freshApp({
    deudores: [
      { nombre: 'Debe', movimientos: [{ tipo: 'prestamo', monto: 300000 }] },
      { nombre: 'Saldado', movimientos: [{ tipo: 'prestamo', monto: 100000 }, { tipo: 'abono', monto: 100000 }] },
      { nombre: 'Abonó de más', movimientos: [{ tipo: 'prestamo', monto: 50000 }, { tipo: 'abono', monto: 80000 }] },
    ],
  });
  assert.equal(ctx.totalPrestadoPendiente(), 300000);
});

test('totalPrestadoPendiente — con varios deudores activos, suma todos', () => {
  const ctx = freshApp({
    deudores: [
      { nombre: 'A', movimientos: [{ tipo: 'prestamo', monto: 200000 }] },
      { nombre: 'B', movimientos: [{ tipo: 'prestamo', monto: 150000 }] },
    ],
  });
  assert.equal(ctx.totalPrestadoPendiente(), 350000);
});

test('totalPrestadoPendiente — sin deudores, da 0', () => {
  const ctx = freshApp();
  assert.equal(ctx.totalPrestadoPendiente(), 0);
});

test('totalMisDeudasPendiente — simétrico a totalPrestadoPendiente pero con S.misDeudas (tipo "recibido")', () => {
  const ctx = freshApp({
    misDeudas: [
      { nombre: 'Le debo a mamá', movimientos: [{ tipo: 'recibido', monto: 400000 }] },
      { nombre: 'Ya pagué', movimientos: [{ tipo: 'recibido', monto: 100000 }, { tipo: 'pago', monto: 100000 }] },
    ],
  });
  assert.equal(ctx.totalMisDeudasPendiente(), 400000);
});

test('calcPatrimonioTotal — con prestado.js real cargado, la plata prestada SÍ suma al patrimonio', () => {
  const ctx = freshApp({
    nequiSaldo: 100000,
    deudores: [{ nombre: 'Hermanito', movimientos: [{ tipo: 'prestamo', monto: 630000 }] }],
  });
  // Sin prestado.js (guard) esto daba 100000 — ver calcPatrimonioTotal.test.js.
  // Con prestado.js real cargado, getDeudorSaldoPatrimonio() SÍ corre.
  assert.equal(ctx.calcPatrimonioTotal(), 730000);
});

test('calcPatrimonioTotal — con prestado.js real cargado, misDeudas SÍ resta del patrimonio', () => {
  const ctx = freshApp({
    nequiSaldo: 500000,
    misDeudas: [{ nombre: 'Le debo a papá', movimientos: [{ tipo: 'recibido', monto: 200000 }] }],
  });
  assert.equal(ctx.calcPatrimonioTotal(), 300000);
});
