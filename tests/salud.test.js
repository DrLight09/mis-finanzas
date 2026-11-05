'use strict';
// tests/salud.test.js — js/core/salud.js: pilares con semáforo, estado de situación (5 niveles) y tendencia del patrimonio. Node puro.
const test = require('node:test');
const assert = require('node:assert/strict');
const Salud = require('../js/core/salud.js');
const U = require('../js/core/umbrales.js');

const base = (o = {}) => ({
  patrimonio: 10e6, liquidezNeta: 6e6, activosLiquidos: 6e6, tcPropia: 0, deudaPropia: 0, meDeben: 0, ingresoTipico: 3e6, ingresoRef: 3e6, gastoTipico: 2e6,
  mesesCubiertos: 3, racha: { meses: 0, acumulado: 0 }, balances: [500000, 400000, 300000], deficitMesActual: false,
  tendencia: { dias: 90, delta: 1e6, pct: 10, inicio: 9e6, fin: 10e6 }, sinDatos: false, ...o,
});
const niv = (m, id) => Salud.pilares(m).find(p => p.id === id).nivel;
const hist = (puntos) => puntos.map(([fecha, v, montoBase]) => ({ fecha, valorVisible: v, montoBase: montoBase || 0 }));

test('pilar Liquidez: < 1 mes rojo, 1–3 ámbar, ≥ 3 verde, sin gasto típico «sin datos», liquidez negativa rojo', () => {
  assert.equal(niv(base({ mesesCubiertos: 0.5 }), 'liquidez'), 'rojo');
  assert.equal(niv(base({ mesesCubiertos: 1 }), 'liquidez'), 'ambar');
  assert.equal(niv(base({ mesesCubiertos: 2.9 }), 'liquidez'), 'ambar');
  assert.equal(niv(base({ mesesCubiertos: 3 }), 'liquidez'), 'verde');
  assert.equal(niv(base({ mesesCubiertos: null, liquidezNeta: 100 }), 'liquidez'), 'sin');
  const neg = Salud.pilares(base({ liquidezNeta: -200000, mesesCubiertos: 0, deudaPropia: 1e6 })).find(p => p.id === 'liquidez');
  assert.equal(neg.nivel, 'rojo'); assert.match(neg.texto, /deudas superan/);
  assert.match(Salud.pilares(base({ mesesCubiertos: 3.4 }))[0].texto, /^Cubres 3,4 meses de gastos$/);
});

test('pilar Deuda: manda el peor entre «× ingreso» y «% de activos líquidos»; sin deuda propia es verde', () => {
  const d = o => Salud.pilares(base(o)).find(p => p.id === 'deuda');
  assert.equal(d({}).nivel, 'verde'); assert.equal(d({}).texto, 'Sin deudas propias');
  assert.equal(d({ deudaPropia: 1e6 }).nivel, 'verde', '0,3× ingreso y 17 % de activos');
  assert.equal(d({ deudaPropia: 6e6 }).nivel, 'ambar', '2× el ingreso (1,5–3×)');
  assert.equal(d({ deudaPropia: 10e6 }).nivel, 'rojo', '3,3× el ingreso (> 3×) y más que los activos');
  assert.equal(d({ deudaPropia: 2e6, activosLiquidos: 1e6 }).nivel, 'rojo', 'poco ingreso relativo, pero debes más de lo que tienes líquido');
  assert.equal(d({ deudaPropia: 4e6, ingresoTipico: 0, activosLiquidos: 6e6 }).nivel, 'ambar', 'sin ingreso típico se mide solo contra activos (67 %: ámbar)');
  assert.match(d({ deudaPropia: 6e6 }).texto, /^Debes 2,0× tu ingreso mensual y 100 % de tus activos líquidos$/);
  assert.equal(d({ deudaPropia: 1e6 }).ir, 'prestamos');
});

test('pilar Flujo: de los últimos 3 meses completos, 0 déficit verde, 1 ámbar, 2+ rojo; sin meses «sin datos»', () => {
  const f = b => niv(base({ balances: b }), 'flujo');
  assert.equal(f([1, 1, 1]), 'verde'); assert.equal(f([-1, 1, 1]), 'ambar'); assert.equal(f([-1, -1, 1]), 'rojo'); assert.equal(f([-1, -1, -1]), 'rojo');
  assert.equal(f([]), 'sin');
  assert.equal(f([-1, 1, 1, -1, -1]), 'ambar', 'solo cuentan los 3 más recientes');
  assert.equal(Salud.pilares(base({ balances: [-1, 1] })).find(p => p.id === 'flujo').texto, '1 mes en déficit de los últimos 2');
});

test('pilar Tendencia: cayendo rojo, plano ámbar, subiendo verde; sin 30 días de historial «sin datos»', () => {
  const t = (pct, delta) => niv(base({ tendencia: { dias: 90, delta, pct, inicio: 10e6, fin: 10e6 + delta } }), 'tendencia');
  assert.equal(t(-10, -1e6), 'rojo'); assert.equal(t(0, 0), 'ambar'); assert.equal(t(2.9, 1), 'ambar'); assert.equal(t(3.1, 1), 'verde');
  assert.equal(niv(base({ tendencia: null }), 'tendencia'), 'sin');
  // base no positiva: no hay %, se compara contra un cuarto del gasto mensual típico (500.000 con gasto 2 M)
  const neg = d => niv(base({ tendencia: { dias: 90, delta: d, pct: null, inicio: -1e6, fin: -1e6 + d } }), 'tendencia');
  assert.equal(neg(-600000), 'rojo'); assert.equal(neg(300000), 'ambar'); assert.equal(neg(600000), 'verde');
});

test('cada pilar lleva la pantalla donde se actúa (`ir`) y siempre son cuatro, en orden', () => {
  const p = Salud.pilares(base({ deudaPropia: 1e6 }));
  assert.deepEqual(p.map(x => x.id), ['liquidez', 'deuda', 'flujo', 'tendencia']);
  p.forEach(x => assert.ok(x.ir, x.id));
});

test('tendenciaPatrimonio: variación a 90 días SIN contar depósitos/retiros (montoBase) y con mínimo de 30 días de historial', () => {
  assert.equal(Salud.tendenciaPatrimonio([], '2026-11-05'), null);
  assert.equal(Salud.tendenciaPatrimonio(hist([['2026-10-20', 100]]), '2026-11-05'), null, 'un solo punto');
  assert.equal(Salud.tendenciaPatrimonio(hist([['2026-10-20', 100], ['2026-11-05', 200]]), '2026-11-05'), null, 'solo 16 días');
  const t = Salud.tendenciaPatrimonio(hist([['2026-08-10', 1000], ['2026-09-10', 1100, 50], ['2026-11-05', 1400, 200]]), '2026-11-05');
  assert.equal(t.dias, 87);
  assert.equal(t.delta, (1400 - 1000) - (50 + 200), 'los 250 que entraron como depósito no son crecimiento');
  assert.equal(t.pct, 15);
  const sinPct = Salud.tendenciaPatrimonio(hist([['2026-08-10', -500], ['2026-11-05', -100]]), '2026-11-05');
  assert.equal(sinPct.pct, null); assert.equal(sinPct.delta, 400);
  const corte = Salud.tendenciaPatrimonio(hist([['2026-01-01', 1], ['2026-08-10', 1000], ['2026-11-05', 1200]]), '2026-11-05');
  assert.equal(corte.inicio, 1000, 'solo mira los últimos 90 días');
  assert.equal(Salud.tendenciaPatrimonio(hist([['2026-8-10', 1000], ['2026-11-05', 1200]]), '2026-11-05').delta, 200, 'fechas sin ceros');
});

test('estado: las cinco situaciones, con su prioridad (crisis > presión > atención > creciendo > estable)', () => {
  const e = o => Salud.estado(base(o)).id;
  assert.equal(e({}), 'creciendo');
  assert.equal(e({ tendencia: { dias: 90, delta: 0, pct: 0, inicio: 1, fin: 1 } }), 'estable');
  assert.equal(e({ tendencia: { dias: 90, delta: 0, pct: 0, inicio: 1, fin: 1 }, mesesCubiertos: 2 }), 'atencion', 'reservas de 1 a 3 meses');
  assert.equal(e({ tendencia: { dias: 90, delta: -5, pct: -10, inicio: 1, fin: 1 } }), 'atencion', 'patrimonio cayendo');
  assert.equal(e({ deficitMesActual: true }), 'atencion');
  assert.equal(e({ balances: [-1, -1, 1], mesesCubiertos: 0.5 , racha: { meses: 2 } }), 'presion', '2+ meses de déficit con < 1 mes de reservas');
  assert.equal(e({ liquidezNeta: -1, mesesCubiertos: 0 }), 'presion', 'valor, pero tus deudas superan tu plata disponible');
  assert.equal(e({ patrimonio: -1e6, liquidezNeta: -1e6, mesesCubiertos: 0 }), 'crisis');
  assert.equal(e({ patrimonio: -1e6, liquidezNeta: 5e6, balances: [-1, 1, 1] }), 'crisis', 'patrimonio negativo y el último mes en déficit');
  assert.equal(e({ patrimonio: -1e6, liquidezNeta: 5e6, balances: [1, 1, 1] }), 'atencion', 'patrimonio negativo pero con liquidez y balance sano: no es crisis');
  assert.equal(e({ mesesCubiertos: null }), 'creciendo', 'sin gasto típico no se inventa un problema de reservas');
  assert.equal(Salud.estado(base({ sinDatos: true })), null);
  assert.equal(e({ balances: [1, -1, -1] }), 'estable', 'creciendo exige balance ≥ 0 en 2 de los últimos 3');
});

test('tono: presión y crisis llevan acciones concretas (máx. 3, con pantalla) y NUNCA celebración; creciendo/estable no llevan acciones', () => {
  const p = Salud.estado(base({ liquidezNeta: -1, mesesCubiertos: 0, deudaPropia: 2e6, tcPropia: 2e6, meDeben: 500000 }));
  assert.equal(p.id, 'presion'); assert.equal(p.tono, 'rojo'); assert.equal(p.frase, 'Lo urgente primero.');
  assert.equal(p.acciones.length, 3);
  assert.deepEqual(p.acciones.map(a => a.ir), ['tarjetas', 'prestamos', 'gastos']);
  assert.match(p.acciones[0].texto, /Ver y priorizar tus deudas \(\$2\.000\.000\)/);
  assert.match(p.acciones[1].texto, /Cobrar lo que te deben \(\$500\.000\)/);
  const todo = JSON.stringify(Salud.ESTADOS);
  assert.doesNotMatch(Salud.ESTADOS.presion.frase + Salud.ESTADOS.crisis.frase, /¡|🎉|felic|excelente/i);
  assert.deepEqual(Salud.estado(base({})).acciones, []);
  assert.ok(todo.length > 0);
});

test('fechaAgotamiento (P4): cuándo se acaba la plata disponible al ritmo actual; null sin tendencia negativa o sin liquidez', () => {
  const f = Salud.fechaAgotamiento(3000000, -1000000, '2026-11-05');
  assert.equal(f.meses, 3); assert.equal(f.dias, 90); assert.equal(f.fecha, '2027-02-03'); assert.equal(f.mes, '2027-02');
  assert.equal(Salud.fechaAgotamiento(100000, -1000000, '2026-11-05').meses, 1, 'mínimo 1 mes');
  assert.equal(Salud.fechaAgotamiento(1000000, -1000000, '2026-12-20').mes, '2027-01', 'cruza de año');
  assert.equal(Salud.fechaAgotamiento(0, -1, '2026-11-05'), null);
  assert.equal(Salud.fechaAgotamiento(5, 100, '2026-11-05'), null);
  assert.equal(Salud.fechaAgotamiento(-5, -100, '2026-11-05'), null);
});
