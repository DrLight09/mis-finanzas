'use strict';
// Clase explícita de movimientos (plan-clasificacion-movimientos.md, etapa 1):
// 1) registrarMovEspejo la escribe, 2) los lectores prefieren `clase` y caen a la cascada
// histórica si falta, 3) la migración v3 estampa lo mismo que decía la cascada (equivalencia).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadApp } = require('./support/load-app');
const CORE = process.env.MIS_FINANZAS_CORE_DIR || path.join(__dirname, '..', 'js', 'core');

function app(estado = {}) {
  const ctx = loadApp(['core-state.js', 'periodo.js', 'cuenta-efectos.js', 'nu-calc.js'].map(f => path.join(CORE, f)), { permissive: true });
  Object.assign(ctx.S, {
    modulos: {}, cuentas: [{ id: 'nequi', tipo: 'nequi', saldo: 0 }, { id: 'efectivo', tipo: 'efectivo', saldo: 0 }],
    movimientos: [], gastosVar: [], gastosFijos: [], pagosGastosFijos: {}, ingresosFijos: [], cajitas: [],
  }, estado);
  return ctx;
}

test('registrarMovEspejo — por defecto el espejo nace "neutro"; con banderas de plata nueva, "ingreso"; `clase` explícita manda', () => {
  const ctx = app();
  const a = ctx.registrarMovEspejo({ cuenta: 'nequi', flujo: 'entrada', monto: 10, fecha: '2026-10-01', desc: 'x', origen: 'Prestado · Me deben' });
  const b = ctx.registrarMovEspejo({ cuenta: 'nequi', flujo: 'entrada', monto: 5, fecha: '2026-10-01', desc: 'extra', origen: 'Prestado', extra: { _esExtraIngreso: true } });
  const c = ctx.registrarMovEspejo({ cuenta: 'nequi', flujo: 'salida', monto: 3, fecha: '2026-10-01', desc: 's', origen: 'Prestado' });
  const d = ctx.registrarMovEspejo({ cuenta: 'nequi', flujo: 'entrada', monto: 7, fecha: '2026-10-01', desc: 'y', origen: 'Z', clase: 'ingreso' });
  const por = id => ctx.S.movimientos.find(m => m.id === id).clase;
  assert.deepEqual([por(a), por(b), por(c), por(d)], ['neutro', 'ingreso', 'neutro', 'ingreso']);
});

test('lectores — `clase` manda sobre las etiquetas viejas; sin `clase` cae a la cascada histórica', () => {
  const ctx = app();
  assert.equal(ctx._esEntradaEspejoNoIngreso({ tipo: 'entrada', _origenSeccion: 'Mesada', clase: 'ingreso' }), false);
  assert.equal(ctx._esEntradaEspejoNoIngreso({ tipo: 'entrada', clase: 'neutro' }), true);
  assert.equal(ctx._esEntradaEspejoNoIngreso({ tipo: 'entrada', _origenSeccion: 'Mesada' }), true, 'sin clase: cascada');
  assert.equal(ctx._esEntradaEspejoNoIngreso({ tipo: 'entrada', desc: 'Sueldo' }), false);
  assert.equal(ctx._esGastoVarNoReal({ _esAlcancia: true, clase: 'gasto' }), false);
  assert.equal(ctx._esGastoVarNoReal({ clase: 'neutro' }), true);
  assert.equal(ctx._esGastoVarNoReal({ _esPagoTC: true }), true, 'sin clase: reglas históricas');
});

const CASOS = [
  ['movimientos', { tipo: 'entrada', desc: 'Sueldo' }, 'ingreso'],
  ['movimientos', { tipo: 'entrada', _origenSeccion: 'Mesada' }, 'neutro'],
  ['movimientos', { tipo: 'entrada', _origenSeccion: 'Prestado · Me deben', _esExtraIngreso: true }, 'ingreso'],
  ['movimientos', { tipo: 'entrada', _origenSeccion: 'Prestado · Yo debo', _esPerdonRecibido: true }, 'ingreso'],
  ['movimientos', { tipo: 'entrada', _encMovId: 'e1', _esDiferencialEncargo: true }, 'ingreso'],
  ['movimientos', { tipo: 'entrada', _encMovId: 'e1' }, 'neutro'],
  ['movimientos', { tipo: 'entrada', desc: 'Alcancía destapada' }, 'neutro'],
  ['movimientos', { tipo: 'entrada', desc: 'Reposición: algo' }, 'neutro'],
  ['movimientos', { tipo: 'apertura' }, 'ajuste'],
  ['movimientos', { tipo: 'transferencia', _esIntercambioEncargo: true }, 'neutro'],
  ['movimientos', { tipo: 'salida', _esEspejo: true }, 'neutro'],
  ['movimientos', { tipo: 'salida_manual' }, 'gasto'],
  ['movimientos', { tipo: 'salida' }, null],
  ['custom', { tipo: 'ingreso', nota: 'x' }, 'ingreso'],
  ['cajita', { tipo: 'entrada', _esEspejo: true }, 'neutro'],
  ['gastosVar', { monto: 1 }, 'gasto'],
  ['gastosVar', { esPagoGastoFijo: true }, 'neutro'],
  ['gastosVar', { _esPagoTC: true }, 'neutro'],
  ['gastosVar', { _esAlcancia: true }, 'neutro'],
  ['gastosVar', { _esExtraPrestamo: true }, 'neutro'],
  ['gastosVar', { _esPerdonDeuda: true }, 'gasto'],
];

test('deducirClaseMovimiento — tabla de casos (lo que no es seguro devuelve null, no se adivina)', () => {
  const ctx = app();
  CASOS.forEach(([origen, m, esperado]) => assert.equal(ctx.deducirClaseMovimiento(m, origen), esperado, JSON.stringify(m)));
});

test('migración v3 — idempotente, no pisa una `clase` existente y sube schemaVersion', () => {
  const ctx = app();
  const d = { schemaVersion: 2, movimientos: CASOS.filter(c => c[0] === 'movimientos').map(c => ({ ...c[1] })),
    gastosVar: [{ monto: 1 }, { monto: 2, clase: 'neutro' }] };
  ctx.aplicarMigraciones(d);
  assert.equal(d.schemaVersion, 3);
  assert.equal(d.gastosVar[1].clase, 'neutro', 'respeta la clase existente');
  const antes = JSON.stringify(d);
  const r = ctx.estamparClasesMovimientos(d);
  assert.equal(r.estampados, 0);
  assert.equal(JSON.stringify(d), antes);
});

test('EQUIVALENCIA — estampar `clase` no cambia ingresos ni gastos reales del mes (plan §6)', () => {
  const ctx = app();
  const f = '2026-09-15';
  ctx.S.movimientos = CASOS.filter(c => c[0] === 'movimientos' && c[1].tipo === 'entrada').map((c, i) => ({ id: 'm' + i, fecha: f, monto: 100 + i, ...c[1] }));
  ctx.S.gastosVar = CASOS.filter(c => c[0] === 'gastosVar').map((c, i) => ({ id: 'g' + i, fecha: f, monto: 10 + i, ...c[1] }));
  const foto = () => { const i = ctx.Periodo.ingresosDelMes('2026-09'), g = ctx.Periodo.gastosDelMes('2026-09'); return JSON.stringify([i, g.gvTotal, g.gfTotal, g.total, g.variables.map(x => x.id)]); };
  const antes = foto();
  ctx.estamparClasesMovimientos(ctx.S);
  assert.ok(ctx.S.movimientos.every(m => m.clase) && ctx.S.gastosVar.every(g => g.clase));
  assert.equal(foto(), antes);
});

test('cajitas — un espejo con clase "ingreso" (extra de Spotify, extra de un pago) SÍ cuenta como ingreso del mes; uno neutro no', () => {
  const ctx = app({ cajitas: [{ id: 'c1', nombre: 'Sobra', saldo: 0, historial: [
    { id: 'a', tipo: 'entrada', monto: 400, fecha: '2026-10-06', nota: 'Extra de Spotify', _esExtraIngreso: true, clase: 'ingreso' },
    { id: 'b', tipo: 'entrada', monto: 5000, fecha: '2026-10-07', nota: 'Abono de deuda', clase: 'neutro' },
    { id: 'c', tipo: 'entrada', monto: 2000, fecha: '2026-10-08', nota: 'Extra de pago (dato viejo, sin clase)', _esExtraIngreso: true },
    { id: 'd', tipo: 'entrada', monto: 9000, fecha: '2026-10-09', nota: 'Espejo viejo sin etiquetas' },
  ] }] });
  assert.equal(ctx.Periodo.ingresosDelMes('2026-10').entradas, 2400, 'a + c; b y d son espejos');
  assert.equal(ctx.deducirClaseMovimiento({ tipo: 'entrada' }, 'cajita'), 'neutro');
});

test('cajitas — sin duplicar: el mismo id no se cuenta dos veces', () => {
  const ctx = app({ cajitas: [{ id: 'c1', historial: [{ id: 'x', tipo: 'entrada', monto: 10, fecha: '2026-10-01', clase: 'ingreso' }] }],
    movimientos: [{ id: 'x', tipo: 'entrada', monto: 10, fecha: '2026-10-01', fuente: 'nequi' }] });
  assert.equal(ctx.Periodo.ingresosDelMes('2026-10').entradas, 10);
});

test('Restar dinero (salida_manual) cuenta como gasto del mes, en categoría Ajuste, y se agrupa con los variables', () => {
  const ctx = app({
    gastosVar: [{ id: 'g1', fecha: '2026-10-02', monto: 1000, cat: 'Comida' }],
    movimientos: [
      { id: 'r1', tipo: 'salida_manual', fuente: 'nequi', monto: 40000, fecha: '2026-10-01', desc: '40', clase: 'gasto' },
      { id: 'r2', tipo: 'salida_manual', fuente: 'nequi', monto: 500, fecha: '2026-10-03', desc: 'dato viejo sin clase' },
      { id: 'r3', tipo: 'salida', fuente: 'nequi', monto: 7000, fecha: '2026-10-03', _esEspejo: true, clase: 'neutro' },
      { id: 'r4', tipo: 'salida_manual', fuente: 'nequi', monto: 9, fecha: '2026-09-30', desc: 'otro mes' },
    ] });
  const g = ctx.Periodo.gastosDelMes('2026-10');
  assert.equal(g.gvTotal, 41500, '1.000 gasto + 40.000 + 500 retiros; el espejo (neutro) no cuenta');
  assert.equal(g.total, 41500);
  assert.equal(ctx.Periodo.gastoPorCategoria('2026-10').Ajuste, 40500);
  assert.equal(ctx.Periodo.gastosPorMes()['2026-09'], 9);
});

test('balanceDelMes — con { conRendimientos } los intereses de Nu suben ingresos, balance y tasa de ahorro; sin la opción queda como flujo de caja', () => {
  const ctx = app({
    movimientos: [{ id: 'i1', tipo: 'entrada', fuente: 'nequi', monto: 1000, fecha: '2026-09-10', desc: 'Sueldo', clase: 'ingreso' }],
    gastosVar: [{ id: 'g1', fecha: '2026-09-11', monto: 400, clase: 'gasto' }],
    cajitas: [{ id: 'c1', nombre: 'Ahorros', saldo: 0, rendimientos: { '2026-09': 100 } }] });
  const sin = ctx.Periodo.balanceDelMes('2026-09');
  const con = ctx.Periodo.balanceDelMes('2026-09', undefined, { conRendimientos: true });
  assert.equal(sin.ingresos.total, 1000);
  assert.equal(sin.balance, 600);
  assert.equal(con.ingresos.total, 1100);
  assert.equal(con.ingresos.rendimientos, 100);
  assert.equal(con.balance, 700);
  assert.ok(Math.abs(con.tasaAhorro - 700 / 1100 * 100) < 1e-9);
  assert.equal(ctx.Periodo.ingresosDelMes('2026-09').total, 1000, 'ingresosDelMes (Inicio, Salud financiera, Wrapped) no cambia');
});

test('Periodo.retirosManuales — solo los salida_manual de clase gasto, ya con clase para que Gastos los cuente igual que Análisis', () => {
  const ctx = app({ movimientos: [
    { id: 'a', tipo: 'salida_manual', fuente: 'efectivo', monto: 400, fecha: '2026-10-09', desc: 'Ajuste', clase: 'gasto' },
    { id: 'b', tipo: 'salida', fuente: 'nequi', monto: 9, fecha: '2026-10-09', _esEspejo: true, clase: 'neutro' },
    { id: 'c', tipo: 'entrada', fuente: 'nequi', monto: 5, fecha: '2026-10-09', clase: 'ingreso' }] });
  const r = ctx.Periodo.retirosManuales();
  assert.equal(r.length, 1);
  assert.deepEqual([r[0].id, r[0].cat, r[0].clase, r[0].monto], ['a', 'Ajuste', 'gasto', 400]);
  assert.equal(ctx._esGastoVarNoReal(r[0]), false, 'cuenta como gasto real');
});
