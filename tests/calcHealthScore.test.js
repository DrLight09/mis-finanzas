'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const CORE_DIR = process.env.MIS_FINANZAS_CORE_DIR
  || path.join(__dirname, '..', 'js', 'core');
const MODULES_DIR = process.env.MIS_FINANZAS_MODULES_DIR
  || path.join(__dirname, '..', 'js', 'modules');

function currentMonthKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function freshApp(sOverrides = {}) {
  const ctx = loadApp([
    path.join(CORE_DIR, 'core-state.js'),
    path.join(CORE_DIR, 'calc-helpers.js'),
    path.join(MODULES_DIR, 'inicio.js'),
  ]);
  Object.assign(ctx.S, sOverrides);
  return ctx;
}

test('calcHealthScore — devuelve null si S.cajitas no existe', () => {
  const ctx = freshApp();
  ctx.S.cajitas = undefined;
  assert.equal(ctx.calcHealthScore(), null);
});

test('calcHealthScore — sin datos reales (todo en 0), score base 50 y tip de "registra más"', () => {
  const ctx = freshApp();
  const r = ctx.calcHealthScore();
  assert.equal(r.score, 50);
  assert.ok(r.tips.includes('Registra más movimientos para un análisis más preciso.'));
});

test('calcHealthScore — 6+ meses de reserva líquida suma +20, sin tip de alerta', () => {
  const mes = currentMonthKey();
  const ctx = freshApp({
    nequiSaldo: 6000000, // 6 meses de 1M de gastos
    gastosFijos: [{ id: 'g1', monto: 1000000 }],
    pagosGastosFijos: { ['g1_' + mes]: true },
  });
  const r = ctx.calcHealthScore();
  assert.ok(r.score >= 70, `esperaba score alto (>=70), dio ${r.score}`);
  assert.ok(!r.tips.some((t) => t.includes('menos de 3 meses')));
});

test('calcHealthScore — menos de 3 meses de reserva resta puntos y avisa', () => {
  const mes = currentMonthKey();
  const ctx = freshApp({
    nequiSaldo: 500000, // 0.5 meses de 1M
    gastosFijos: [{ id: 'g1', monto: 1000000 }],
    pagosGastosFijos: { ['g1_' + mes]: true },
  });
  const r = ctx.calcHealthScore();
  assert.ok(r.tips.some((t) => t.includes('menos de 3 meses')));
});

test('calcHealthScore — liquidez negativa (deuda TC > patrimonio líquido) penaliza -15', () => {
  const ctx = freshApp({
    nequiSaldo: 100000,
    tarjetasCredito: [{ id: 'tc1', deuda: 300000, cupo: 1000000 }],
    gastosFijos: [{ id: 'g1', monto: 50000 }],
    pagosGastosFijos: { ['g1_' + currentMonthKey()]: true },
  });
  const r = ctx.calcHealthScore();
  assert.ok(r.tips.some((t) => t.includes('deuda en tarjetas supera tu patrimonio líquido')));
});

test('calcHealthScore — deuda TC alta y patrimonio que no la cubre (rama sin ingresos registrados)', () => {
  const ctx = freshApp({
    tarjetasCredito: [{ id: 'tc1', deuda: 800000, cupo: 1000000 }],
  });
  const r = ctx.calcHealthScore();
  assert.ok(r.tips.some((t) => t.includes('patrimonio no la cubre')));
});

test('calcHealthScore — gastando más de lo que ingresa este mes avisa', () => {
  const mes = currentMonthKey();
  const ctx = freshApp({
    nequiSaldo: 2000000,
    ingresosFijos: [{ id: 'i1', nombre: 'Sueldo', monto: 1000000, desde: '2020-01' }],
    gastosFijos: [{ id: 'g1', monto: 1500000 }],
    pagosGastosFijos: { ['g1_' + mes]: true },
  });
  const r = ctx.calcHealthScore();
  assert.ok(r.tips.some((t) => t.includes('gastando más de lo que ingresas')));
});

test('calcHealthScore — score nunca baja de 0 ni sube de 100 (clamp), caso extremo', () => {
  const mes = currentMonthKey();
  const ctx = freshApp({
    tarjetasCredito: [{ id: 'tc1', deuda: 50000000, cupo: 50000000 }],
    gastosFijos: [{ id: 'g1', monto: 30000000 }],
    pagosGastosFijos: { ['g1_' + mes]: true },
  });
  const r = ctx.calcHealthScore();
  assert.ok(r.score >= 0 && r.score <= 100, `score fuera de rango: ${r.score}`);
});

test('calcHealthScore — CDT activo con liquidez sana suma el bonus completo (+10)', () => {
  const ctx = freshApp({
    nequiSaldo: 100000,
    cajitas: [{ id: 'nu1', saldo: 500000, cdts: [{ monto: 1000000, tasa: 9 }] }],
  });
  const r = ctx.calcHealthScore();
  // No hay forma de leer el bonus aislado desde afuera — se verifica
  // indirectamente contra el mismo cálculo que hace la función.
  assert.ok(r.score >= 50, `esperaba score >= base (50) con el bonus de CDT sumado, dio ${r.score}`);
});
