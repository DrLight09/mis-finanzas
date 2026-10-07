'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const CORE_DIR = process.env.MIS_FINANZAS_CORE_DIR
  || path.join(__dirname, '..', 'js', 'core');

// `Deudas` (capa de acceso a "Me deben"/"Yo debo") vive en calc-helpers.js. Es un `const` de
// nivel superior, así que no se ve como propiedad del contexto: se prueba por las funciones que
// la envuelven (getDeudorSaldo, totalPrestadoPendiente, calcPatrimonioTotal...), que es lo que usa el resto de la app.
// Saldos en el modelo actual: S.cuentas[] (Nequi y Efectivo fijos + personalizadas). Antes estos tests
// cargaban los campos viejos de saldo y migrarCuentasLegacy() los convertía; esa migración ya no existe.
const cuentas = ({ nequi = 0, efectivo = 0, custom = [] } = {}) => [
  { id: 'nequi', tipo: 'nequi', saldo: nequi },
  { id: 'efectivo', tipo: 'efectivo', saldo: efectivo },
  ...custom,
];

function freshApp(sOverrides = {}) {
  const ctx = loadApp([
    path.join(CORE_DIR, 'core-state.js'),
    path.join(CORE_DIR, 'calc-helpers.js'),
  ]);
  Object.assign(ctx.S, sOverrides);
  return ctx;
}

test('Deudas — sin S.deudores ni S.misDeudas todo da 0 (listas ausentes no rompen)', () => {
  const ctx = freshApp();
  ctx.S.deudores = undefined;
  ctx.S.misDeudas = undefined;
  assert.equal(ctx.totalPrestadoPendiente(), 0);
  assert.equal(ctx.totalMisDeudasPendiente(), 0);
  assert.equal(ctx.calcPatrimonioTotal(), 0);
});

test('Deudas — totales por dirección ignoran los saldos en 0 o negativos', () => {
  const ctx = freshApp({
    deudores: [
      { id: 'a', movimientos: [{ tipo: 'prestamo', monto: 100 }] },
      { id: 'b', movimientos: [{ tipo: 'prestamo', monto: 50 }, { tipo: 'abono', monto: 80 }] },
    ],
    misDeudas: [
      { id: 'c', movimientos: [{ tipo: 'recibido', monto: 40 }] },
      { id: 'd', movimientos: [{ tipo: 'recibido', monto: 20 }, { tipo: 'pago', monto: 20 }] },
    ],
  });
  assert.equal(ctx.totalPrestadoPendiente(), 100);
  assert.equal(ctx.totalMisDeudasPendiente(), 40);
});

test('Deudas — el patrimonio suma lo que te deben y resta lo que debes, con la misma definición de saldo que la pantalla', () => {
  const ctx = freshApp({
    cuentas: cuentas({ nequi: 100000 }),
    deudores: [{ id: 'a', movimientos: [{ tipo: 'prestamo', monto: 300000 }, { tipo: 'abono', monto: 100000 }] }],
    misDeudas: [{ id: 'b', movimientos: [{ tipo: 'recibido', monto: 50000 }] }],
  });
  assert.equal(ctx.calcPatrimonioTotal(), 100000 + 200000 - 50000);
});

test('Deudas — un perdón de Yo debo (tipo "pago") deja la deuda en 0 igual que cualquier otro pago', () => {
  const ctx = freshApp({
    misDeudas: [{ id: 'b', movimientos: [{ tipo: 'recibido', monto: 90000 }, { tipo: 'pago', monto: 90000, _perdon: true }] }],
  });
  assert.equal(ctx.totalMisDeudasPendiente(), 0);
});
