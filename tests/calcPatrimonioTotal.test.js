'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

// Ajustá esta ruta si tu estructura de carpetas es distinta a js/core/.
const CORE_DIR = process.env.MIS_FINANZAS_CORE_DIR
  || path.join(__dirname, '..', 'js', 'core');

function freshApp(sOverrides = {}) {
  const ctx = loadApp([path.join(CORE_DIR, 'core-state.js')]);
  Object.assign(ctx.S, sOverrides);
  return ctx;
}

test('calcPatrimonioTotal — S vacío (recién abierta la app) da 0', () => {
  const ctx = freshApp();
  assert.equal(ctx.calcPatrimonioTotal(), 0);
});

test('calcPatrimonioTotal — suma Nequi + Efectivo + cuentas personalizadas', () => {
  const ctx = freshApp({
    nequiSaldo: 100000,
    efectivoSaldo: 50000,
    cuentasPersonalizadas: [{ id: 'c1', saldo: 200000 }],
  });
  assert.equal(ctx.calcPatrimonioTotal(), 350000);
});

test('calcPatrimonioTotal — resta la deuda de tarjetas de crédito', () => {
  const ctx = freshApp({
    nequiSaldo: 500000,
    tarjetasCredito: [{ id: 'tc1', deuda: 150000, cupo: 1000000 }],
  });
  assert.equal(ctx.calcPatrimonioTotal(), 350000);
});

test('calcPatrimonioTotal — puede dar negativo (deuda de TC mayor a todo lo demás)', () => {
  const ctx = freshApp({
    nequiSaldo: 50000,
    tarjetasCredito: [{ id: 'tc1', deuda: 500000, cupo: 1000000 }],
  });
  assert.equal(ctx.calcPatrimonioTotal(), -450000);
});

test('calcPatrimonioTotal — alcancía suma su saldoRegistrado', () => {
  const ctx = freshApp({ alcancia: { saldoRegistrado: 75000 } });
  assert.equal(ctx.calcPatrimonioTotal(), 75000);
});

test('calcPatrimonioTotal — plata comprometida ajena (recibida, sin pagar) se resta', () => {
  const ctx = freshApp({
    nequiSaldo: 200000,
    plataCometida: [{
      recibido: true,
      destinos: [
        { yaPague: false, tipo: 'gasto', gastoOrigen: 'cajita', gastoCajita: 'nu1', monto: 60000 },
      ],
    }],
  });
  assert.equal(ctx.calcPatrimonioTotal(), 140000);
});

test('calcPatrimonioTotal — plata comprometida ajena YA PAGADA no se resta', () => {
  const ctx = freshApp({
    nequiSaldo: 200000,
    plataCometida: [{
      recibido: true,
      destinos: [
        { yaPague: true, tipo: 'gasto', gastoOrigen: 'cajita', gastoCajita: 'nu1', monto: 60000 },
      ],
    }],
  });
  assert.equal(ctx.calcPatrimonioTotal(), 200000);
});

test('calcPatrimonioTotal — GUARD: cajitas sin cuentas.js cargado usa fallback c.saldo (auditoria-tecnica.md #5)', () => {
  // cuentas.js (donde vive calcC real, con interés compuesto) es un grupo
  // lazy y NO está cargado acá a propósito — prueba el guard `_calcCSafe`
  // que evita el ReferenceError que ya rompió producción una vez.
  const ctx = freshApp({ cajitas: [{ id: 'nu1', saldo: 300000 }] });
  assert.equal(ctx.calcPatrimonioTotal(), 300000);
});

test('calcPatrimonioTotal — GUARD: plata prestada (S.deudores) sin prestado.js cargado no suma nada', () => {
  // getDeudorSaldoPatrimonio vive en prestado.js (lazy, no cargado acá).
  // El guard typeof debe devolver 0 por deudor, nunca sumar el saldo crudo.
  const ctx = freshApp({
    nequiSaldo: 100000,
    deudores: [{ id: 'd1', nombre: 'Hermanito', saldo: 630000 }],
  });
  assert.equal(ctx.calcPatrimonioTotal(), 100000);
});

test('calcPatrimonioTotal — GUARD: misDeudas sin prestado.js cargado no resta nada', () => {
  // totalMisDeudasPendiente también vive en prestado.js (lazy).
  const ctx = freshApp({ nequiSaldo: 100000, misDeudas: [{ id: 'm1', saldo: 999999 }] });
  assert.equal(ctx.calcPatrimonioTotal(), 100000);
});
