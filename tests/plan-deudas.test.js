'use strict';
// tests/plan-deudas.test.js — js/core/plan-deudas.js (P2 costo de la deuda, P3 plan de salida). Node puro.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/core/plan-deudas.js');

const tc = (nombre, saldo, tasaEA) => ({ id: nombre, nombre, tipo: 'tarjeta', saldo, tasaEA });
const per = (nombre, saldo) => ({ id: nombre, nombre, tipo: 'persona', saldo });

test('tasaMensual: E.A. → mensual con (1+ea)^(1/12) − 1; sin tasa no hay costo', () => {
  assert.ok(Math.abs(P.tasaMensual(28) - 0.02078) < 0.00005, '28 % E.A. ≈ 2,08 % mensual');
  assert.equal(P.tasaMensual(0), 0); assert.equal(P.tasaMensual(null), 0); assert.equal(P.tasaMensual(undefined), 0);
  assert.equal(Math.round(P.costoMensual(1000000, 28)), 20785);
  assert.equal(P.costoMensual(1000000, null), 0); assert.equal(P.costoMensual(-5, 28), 0);
});

test('ordenar: avalancha = la más cara primero (sin tasa al final); bola de nieve = la más pequeña primero; ignora saldos 0', () => {
  const d = [tc('A', 500000, 20), tc('B', 2000000, 30), per('Luis', 100000), tc('C', 0, 40), tc('D', 300000, 20)];
  assert.deepEqual(P.ordenar(d, 'avalancha').map(x => x.nombre), ['B', 'D', 'A', 'Luis']);
  assert.deepEqual(P.ordenar(d, 'bola').map(x => x.nombre), ['Luis', 'D', 'A', 'B']);
  assert.deepEqual(P.ordenar(d).map(x => x.nombre), ['B', 'D', 'A', 'Luis'], 'por defecto avalancha');
  assert.deepEqual(P.ordenar([], 'bola'), []);
});

test('construir: sin deudas → libre ya; con balance positivo → meses hasta quedar libre; el orden afecta el costo, no el sentido', () => {
  const vacio = P.construir({ deudas: [], balancePromedio: 100 });
  assert.equal(vacio.mesesLibre, 0); assert.equal(vacio.baja, true);
  const r = P.construir({ deudas: [per('Luis', 1000000)], balancePromedio: 250000 });
  assert.equal(r.mesesLibre, 4); assert.equal(r.baja, true); assert.equal(r.costoMensualTotal, 0);
  const c = P.construir({ deudas: [tc('T', 1000000, 28)], balancePromedio: 250000 });
  assert.equal(c.mesesLibre, 5, 'con intereses del 2,08 % mensual cuesta un mes más');
  assert.equal(Math.round(c.costoMensualTotal), 20785);
});

test('construir: el sobrante que libera una deuda pasa a la siguiente (cascada)', () => {
  const r = P.construir({ deudas: [per('A', 300000), per('B', 700000)], balancePromedio: 400000, estrategia: 'bola' });
  assert.deepEqual(r.orden.map(d => d.nombre), ['A', 'B']);
  assert.equal(r.mesesLibre, 3, '1.000.000 con 400.000 al mes = 2,5 → 3 meses (el sobrante del mes 1 ya ataca la deuda B)');
});

test('construir: balance ≤ 0 o menor que los intereses → «no baja» y cuánto habría que liberar al mes', () => {
  const a = P.construir({ deudas: [tc('T', 2000000, 30)], balancePromedio: -50000 });
  assert.equal(a.baja, false); assert.equal(a.mesesLibre, null); assert.equal(a.pagoMensual, 0);
  assert.ok(a.necesitasLiberar > a.costoMensualTotal, 'la cuota cubre al menos los intereses');
  assert.equal(a.necesitasLiberar % 1000, 0, 'redondeado a $1.000');
  const b = P.construir({ deudas: [tc('T', 10000000, 30)], balancePromedio: 10000 }); // paga menos de lo que le cobran de interés
  assert.equal(b.baja, false);
  const c = P.construir({ deudas: [per('P', 1200000)], balancePromedio: 0, metaMeses: 12 });
  assert.equal(c.necesitasLiberar, 100000, 'sin tasa: saldo ÷ meta');
});

test('avalancha cuesta menos que bola de nieve cuando hay tasas distintas (el motivo de ofrecer los dos criterios)', () => {
  const deudas = [tc('Barata', 500000, 10), tc('Cara', 3000000, 35)];
  const av = P.construir({ deudas, balancePromedio: 400000, estrategia: 'avalancha' });
  const bo = P.construir({ deudas, balancePromedio: 400000, estrategia: 'bola' });
  assert.equal(av.orden[0].nombre, 'Cara'); assert.equal(bo.orden[0].nombre, 'Barata');
  assert.ok(av.mesesLibre <= bo.mesesLibre);
});

test('pagarConviene: «tu cajita rinde 9 % y tu tarjeta cuesta 28 %»', () => {
  assert.deepEqual(P.pagarConviene(28, 9), { conviene: true, diferenciaPts: 19 });
  assert.equal(P.pagarConviene(8, 10).conviene, false);
  assert.equal(P.pagarConviene(null, 10), null); assert.equal(P.pagarConviene(28, undefined), null);
});
