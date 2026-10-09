'use strict';
// Periodo (js/core/periodo.js): la ÚNICA definición de ingresos/gastos de un mes.
// Estos tests fijan las reglas y, en particular, los desalineamientos que tenían las pantallas
// antes de centralizarlo (ver CHANGELOG.md#infraestructura--seguridad, 2026-10-08).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const CORE_DIR = process.env.MIS_FINANZAS_CORE_DIR || path.join(__dirname, '..', 'js', 'core');

function app(estado = {}) {
  const ctx = loadApp([path.join(CORE_DIR, 'core-state.js'), path.join(CORE_DIR, 'periodo.js')]);
  Object.assign(ctx.S, {
    modulos: { mesada: true }, cuentas: [{ id: 'nequi', tipo: 'nequi', saldo: 0 }, { id: 'efectivo', tipo: 'efectivo', saldo: 0 }],
    movimientos: [], gastosVar: [], gastosFijos: [], pagosGastosFijos: {}, ingresosFijos: [], mesadas: undefined,
  }, estado);
  return ctx;
}
const P = ctx => ctx.Periodo;
const plano = x => JSON.parse(JSON.stringify(x));

test('cuotaMesada — año exacto, año anterior más cercano, el más antiguo, y 80.000 si no hay ninguna', () => {
  const { Periodo } = app();
  assert.equal(Periodo.cuotaMesada({ 2025: 70000, 2026: 90000 }, 2026), 90000);
  assert.equal(Periodo.cuotaMesada({ 2024: 60000, 2025: 70000 }, 2027), 70000);
  assert.equal(Periodo.cuotaMesada({ 2026: 90000 }, 2023), 90000, 'sin año anterior cae en el más antiguo');
  assert.equal(Periodo.cuotaMesada({}, 2026), 80000);
  assert.equal(Periodo.cuotaMesada(undefined, 2026), 80000);
});

test('mesadaDelMes — la clave es año-índice de mes (0-11): REGRESIÓN, la comparación con el mes anterior usaba "2026-09" y nunca la encontraba', () => {
  const ctx = app({ mesadas: { papa: { cuotas: { 2026: 80000 }, pagos: { '2026-8': { monto: 50000 }, '2026-7': {} } }, mama: { cuotas: {}, pagos: {} } } });
  assert.equal(P(ctx).mesadaDelMes('2026-09'), 50000, 'septiembre = índice 8');
  assert.equal(P(ctx).mesadaDelMes('2026-08'), 80000, 'sin monto en el pago usa la cuota del año');
  assert.equal(P(ctx).mesadaDelMes('2026-10'), 0);
});

test('mesadaDelMes — con el módulo apagado o sin datos da 0; suma papá y mamá', () => {
  const datos = { papa: { cuotas: { 2026: 10 }, pagos: { '2026-0': { monto: 10 } } }, mama: { cuotas: { 2026: 5 }, pagos: { '2026-0': { monto: 5 } } } };
  assert.equal(P(app({ mesadas: datos })).mesadaDelMes('2026-01'), 15);
  assert.equal(P(app({ mesadas: datos, modulos: {} })).mesadaDelMes('2026-01'), 0);
  assert.equal(P(app()).mesadaDelMes('2026-01'), 0);
});

test('ingresosFijosDelMes — solo cuenta los que ya estaban activos ese mes', () => {
  const ctx = app({ ingresosFijos: [{ monto: 1000, desde: '2026-01' }, { monto: 500, desde: '2026-10' }, { monto: 7 }] });
  assert.equal(P(ctx).ingresosFijosDelMes('2026-09'), 1007);
  assert.equal(P(ctx).ingresosFijosDelMes('2026-10'), 1507);
});

test('gastos fijos — se cuentan con el monto PAGADO (editar el gasto fijo no reescribe el pasado)', () => {
  const ctx = app({ gastosFijos: [{ id: 'g1', nombre: 'Arriendo', monto: 900, cat: 'Hogar' }], pagosGastosFijos: { 'g1_2026-09': { fecha: '2026-09-02', monto: 800 } } });
  const g = P(ctx).gastosDelMes('2026-09');
  assert.equal(g.gfTotal, 800);
  assert.equal(P(ctx).gastosDelMes('2026-10').gfTotal, 0);
});

test('gastos fijos — un pago cuyo gasto fijo ya se eliminó SIGUE contando (con la categoría que guardó el pago)', () => {
  const ctx = app({ pagosGastosFijos: { 'borrado_2026-09': { fecha: '2026-09-05', monto: 100, cat: 'Ocio', nombre: 'Netflix' } } });
  assert.equal(P(ctx).gastosDelMes('2026-09').gfTotal, 100);
  assert.deepEqual(plano(P(ctx).gastoPorCategoria('2026-09')), { Ocio: 100 });
});

test('gastos fijos — formatos viejos: valor `true` cae al monto actual; array se agrupa por la fecha del pago', () => {
  const conTrue = app({ gastosFijos: [{ id: 'g1', monto: 300 }], pagosGastosFijos: { 'g1_2026-09': true } });
  assert.equal(P(conTrue).gastosDelMes('2026-09').gfTotal, 300);
  const comoArray = app({ gastosFijos: [{ id: 'g1', monto: 300, cat: 'X' }], pagosGastosFijos: [{ gastoFijoId: 'g1', fecha: '2026-09-10', monto: 250 }] });
  assert.equal(P(comoArray).gastosDelMes('2026-09').gfTotal, 250);
});

test('gastos variables — los pagos de gasto fijo (ya contados como fijos) no se cuentan dos veces', () => {
  const ctx = app({
    gastosFijos: [{ id: 'g1', monto: 800 }], pagosGastosFijos: { 'g1_2026-09': { fecha: '2026-09-02', monto: 800 } },
    gastosVar: [{ fecha: '2026-09-02', monto: 800, esPagoGastoFijo: true }, { fecha: '2026-09-03', monto: 50, cat: 'Comida' }, { fecha: '2026-10-01', monto: 9 }],
  });
  const g = P(ctx).gastosDelMes('2026-09');
  assert.equal(g.gvTotal, 50);
  assert.equal(g.total, 850);
  assert.equal(g.items.length, 2);
});

test('gastosPorMes — una sola pasada para el ranking: variables reales + fijos pagados por mes', () => {
  const ctx = app({
    pagosGastosFijos: { 'g1_2026-09': { monto: 800 }, 'huerfano_2026-10': { monto: 100 } },
    gastosVar: [{ fecha: '2026-09-03', monto: 50 }, { fecha: '2026-10-01', monto: 20 }, { fecha: '2026-10-02', monto: 999, esPagoGastoFijo: true }],
  });
  assert.deepEqual(plano(P(ctx).gastosPorMes()), { '2026-09': 850, '2026-10': 120 });
});

test('balanceDelMes — ingresos (mesada + fijos + entradas reales) menos gastos, y tasa de ahorro', () => {
  const ctx = app({
    mesadas: { papa: { cuotas: { 2026: 80000 }, pagos: { '2026-8': {} } }, mama: { cuotas: {}, pagos: {} } },
    ingresosFijos: [{ monto: 20000, desde: '2026-01' }],
    movimientos: [{ id: 'm', tipo: 'entrada', monto: 10000, fecha: '2026-09-10', fuente: 'nequi' }, { id: 'e', tipo: 'entrada', monto: 999, fecha: '2026-09-11', _esEspejo: true }],
    gastosVar: [{ fecha: '2026-09-03', monto: 30000, cat: 'Comida' }],
  });
  const b = P(ctx).balanceDelMes('2026-09');
  assert.deepEqual(plano(b.ingresos), { mesada: 80000, fijos: 20000, entradas: 10000, total: 110000 });
  assert.equal(b.gastos.total, 30000);
  assert.equal(b.balance, 80000);
  assert.ok(Math.abs(b.tasaAhorro - 72.7272) < 0.01);
  assert.equal(P(app()).balanceDelMes('2026-09').tasaAhorro, null, 'sin ingresos no hay tasa');
});

test('mesAnterior / ultimosMeses cruzan el año correctamente', () => {
  const { Periodo } = app();
  assert.equal(Periodo.mesAnterior('2026-01'), '2025-12');
  assert.equal(Periodo.mesDesplazado('2026-11', 3), '2027-02');
  assert.deepEqual(plano(Periodo.ultimosMeses(4, '2026-02')), ['2025-11', '2025-12', '2026-01', '2026-02']);
});

test('acepta un estado distinto del global (Wrapped trabaja sobre el S que recibe)', () => {
  const ctx = app();
  const otro = { gastosVar: [{ fecha: '2026-09-03', monto: 70 }], pagosGastosFijos: { 'x_2026-09': { monto: 30 } }, gastosFijos: [], movimientos: [], cuentas: [] };
  assert.equal(P(ctx).gastosDelMes('2026-09', otro).total, 100);
  assert.equal(P(ctx).gastosDelMes('2026-09').total, 0);
});
