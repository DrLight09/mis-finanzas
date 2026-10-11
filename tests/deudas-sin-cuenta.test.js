'use strict';
// Deudas sin pata de caja (core-state.js _movsDeudaSinCuenta): un préstamo/abono/pago que mueve el patrimonio sin
// pasar por ninguna cuenta es un AJUSTE de base (como una apertura), no crecimiento ni ingreso/gasto del mes.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadApp } = require('./support/load-app');
const CORE = process.env.MIS_FINANZAS_CORE_DIR || path.join(__dirname, '..', 'js', 'core');

function app(estado = {}) {
  const ctx = loadApp(['core-state.js', 'periodo.js', 'cuenta-efectos.js', 'nu-calc.js'].map(f => path.join(CORE, f)), { permissive: true });
  Object.assign(ctx.S, { modulos: {}, cuentas: [], movimientos: [], gastosVar: [], gastosFijos: [], pagosGastosFijos: {}, ingresosFijos: [], cajitas: [], deudores: [], misDeudas: [] }, estado);
  return ctx;
}
const plano = x => JSON.parse(JSON.stringify(x)); // el objeto viene de otro contexto (vm): se compara en plano
const d = (movimientos) => [{ id: 'd1', nombre: 'Padre', movimientos }];

test('Me deben — un préstamo sin cuenta es ajuste (+); con cuenta, con TC, con fuentes repartidas o de monto 0 no', () => {
  const ctx = app({ deudores: d([
    { id: 'a', tipo: 'prestamo', monto: 500000, fecha: '2026-09-25', fuente: '' },
    { id: 'b', tipo: 'prestamo', monto: 797000, fecha: '2026-09-30' },
    { id: 'c', tipo: 'prestamo', monto: 28000, fecha: '2026-09-23', fuente: 'efectivo' },
    { id: 'e', tipo: 'prestamo', monto: 108000, fecha: '2026-10-02', _viaTC: true },
    { id: 'f', tipo: 'prestamo', monto: 90000, fecha: '2026-10-03', fuentes: [{ fuente: 'nequi', monto: 80000 }] },
  ]) });
  assert.deepEqual(plano(ctx._ajusteDeudasSinCuentaPorFecha()), { '2026-09-25': 500000, '2026-09-30': 797000 });
});

test('Me deben — un abono o pago recibido sin cuenta destino es ajuste (−); con destino/destinos o perdón no', () => {
  const ctx = app({ deudores: d([
    { id: 'a', tipo: 'abono', monto: 600, fecha: '2026-09-17' },
    { id: 'b', tipo: 'pago-completo', monto: 1000, fecha: '2026-09-18', destino: '' },
    { id: 'c', tipo: 'abono', monto: 5000, fecha: '2026-09-19', destino: 'efectivo' },
    { id: 'e', tipo: 'abono', monto: 308000, fecha: '2026-10-03', destinos: [{ fuente: 'cajita:x', monto: 308000 }] },
    { id: 'f', tipo: 'abono', monto: 7000, fecha: '2026-10-04', _perdon: true },
  ]) });
  assert.deepEqual(plano(ctx._ajusteDeudasSinCuentaPorFecha()), { '2026-09-17': -600, '2026-09-18': -1000 });
});

test('Yo debo — recibido sin cuenta es ajuste (−) y un pago sin cuenta (+)', () => {
  const ctx = app({ misDeudas: [{ id: 'm1', nombre: 'Tío', movimientos: [
    { id: 'a', tipo: 'recibido', monto: 200000, fecha: '2026-10-01' },
    { id: 'b', tipo: 'pago', monto: 50000, fecha: '2026-10-02' },
    { id: 'c', tipo: 'recibido', monto: 9000, fecha: '2026-10-03', destino: 'nequi' },
  ] }] });
  assert.deepEqual(plano(ctx._ajusteDeudasSinCuentaPorFecha()), { '2026-10-01': -200000, '2026-10-02': 50000 });
});

test('clase "ingreso" en un préstamo sin cuenta = plata nueva (p. ej. un regalo): cuenta como ingreso del mes y NO como ajuste', () => {
  const ctx = app({ deudores: d([{ id: 'a', tipo: 'prestamo', monto: 500000, fecha: '2026-09-25', fuente: '', nota: 'Regalo - Abuela', clase: 'ingreso' }]) });
  assert.deepEqual(plano(ctx._ajusteDeudasSinCuentaPorFecha()), {});
  assert.equal(ctx.Periodo.ingresosDelMes('2026-09').entradas, 500000);
});

test('sin la clase explícita el préstamo sin cuenta NO es ingreso del mes (solo ajuste de base)', () => {
  const ctx = app({ deudores: d([{ id: 'a', tipo: 'prestamo', monto: 500000, fecha: '2026-09-25', fuente: '' }]) });
  assert.equal(ctx.Periodo.ingresosDelMes('2026-09').entradas, 0);
});

test('recalcularMontoBaseHistorial — el préstamo sin cuenta queda como montoBase del día en el historial (retroactivo, sin migración)', () => {
  const ctx = app({
    deudores: d([{ id: 'a', tipo: 'prestamo', monto: 500000, fecha: '2026-09-25', fuente: '' }]),
    patrimonioHistorial: [{ fecha: '2026-09-24', valor: 1000000 }, { fecha: '2026-09-25', valor: 1508837 }, { fecha: '2026-09-26', valor: 1509000 }] });
  ctx.recalcularMontoBaseHistorial();
  const h = plano(ctx.S.patrimonioHistorial);
  assert.equal(h[1].montoBase, 500000);
  assert.equal(h[0].montoBase, undefined);
  assert.equal(h[2].montoBase, undefined);
  ctx.S.deudores = []; // borrar el préstamo: el ajuste desaparece solo
  ctx.recalcularMontoBaseHistorial();
  assert.equal(plano(ctx.S.patrimonioHistorial)[1].montoBase, undefined);
});
