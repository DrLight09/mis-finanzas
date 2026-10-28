'use strict';
// tests/cobros.test.js — Cobro de un ingreso fijo (js/core/cobros.js): la plata cuenta cuando se registra su cobro, en el mes de la
// FECHA que escribe quien registra, y borrar el cobro revierte lo que tocó. Corre con: node --test tests/cobros.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const CORE = path.join(__dirname, '..', 'js', 'core');

function fresh({ nequi = 0, efectivo = 0, ingresosFijos } = {}) {
  const ctx = loadApp(['core-state.js', 'periodo.js', 'nu-calc.js', 'calc-helpers.js', 'cuenta-efectos.js', 'cobros.js'].map(f => path.join(CORE, f)), { permissive: true });
  Object.assign(ctx.S, {
    cuentas: [{ id: 'nequi', tipo: 'nequi', saldo: nequi }, { id: 'efectivo', tipo: 'efectivo', saldo: efectivo }],
    movimientos: [], gastosVar: [], cajitas: [],
    ingresosFijos: ingresosFijos || [{ id: 'if1', nombre: 'Sueldo', monto: 3000000, desde: '2026-01' }],
  });
  return ctx;
}
const saldo = (ctx, id) => ctx.S.cuentas.find(c => c.id === id).saldo;
const cobrar = (ctx, over = {}) => ctx.cobroRegistrar({ id: 'if1', mesCubre: '2026-09', monto: 3000000, fecha: '2026-09-30', destino: '', ...over });
const ingresosDelMes = (ctx, mes) => ctx.Periodo.ingresosDelMes(mes);

test('un ingreso fijo sin cobros no suma ingreso en ningún mes', () => {
  const ctx = fresh();
  assert.equal(ingresosDelMes(ctx, '2026-09').total, 0);
  assert.equal(ingresosDelMes(ctx, '2026-10').total, 0);
});

test('cobrar sin destino («lo gasté» / ya estaba en mi saldo): cuenta como ingreso de la fecha y NO toca saldos', () => {
  const ctx = fresh({ nequi: 500 });
  const r = cobrar(ctx);
  assert.equal(r.ok, true);
  assert.equal(saldo(ctx, 'nequi'), 500);
  assert.equal(ctx.S.movimientos.length, 0);
  assert.equal(ingresosDelMes(ctx, '2026-09').fijos, 3000000);
});

test('cobrar a una cuenta: sube el saldo, deja un espejo neutro y el ingreso se cuenta UNA sola vez', () => {
  const ctx = fresh({ nequi: 1000 });
  const { cobro } = cobrar(ctx, { destino: 'nequi', monto: 2000 });
  assert.equal(saldo(ctx, 'nequi'), 3000);
  const esp = ctx.S.movimientos.find(m => m.id === cobro._movSecId);
  assert.ok(esp && esp._secundario && esp._origenSeccion === 'Ingreso fijo' && esp.clase === 'neutro');
  assert.equal(esp.desc, 'Sueldo — cobro de Sep 2026');
  const ing = ingresosDelMes(ctx, '2026-09');
  assert.equal(ing.fijos, 2000);
  assert.equal(ing.entradas, 0, 'el espejo no se cuenta otra vez como entrada real');
  assert.equal(ing.total, 2000);
});

test('el mes que cubre es solo una etiqueta: el ingreso cuenta en el mes de la FECHA', () => {
  const ctx = fresh();
  cobrar(ctx, { mesCubre: '2026-01', fecha: '2026-10-26', monto: 80000 });
  assert.equal(ingresosDelMes(ctx, '2026-01').total, 0);
  assert.equal(ingresosDelMes(ctx, '2026-10').fijos, 80000);
  assert.equal(ctx.ingresoFijoEstadoMes(ctx.S.ingresosFijos[0], '2026-01').cobrado, 80000, 'pero el mes de enero sí queda cobrado');
});

test('dividir entre cuentas reparte el saldo; un total mayor al monto se rechaza sin dejar efectos', () => {
  const ctx = fresh({ nequi: 0, efectivo: 0 });
  const mal = cobrar(ctx, { monto: 100, splitMode: true, splits: [{ fuente: 'nequi', monto: 80 }, { fuente: 'efectivo', monto: 80 }] });
  assert.deepEqual([mal.ok, mal.motivo], [false, 'split-excede']);
  assert.equal(saldo(ctx, 'nequi'), 0);
  assert.equal(ctx.S.ingresosFijos[0].cobros, undefined);
  const bien = cobrar(ctx, { monto: 100, splitMode: true, splits: [{ fuente: 'nequi', monto: 60 }, { fuente: 'efectivo', monto: 40 }] });
  assert.equal(bien.ok, true);
  assert.deepEqual([saldo(ctx, 'nequi'), saldo(ctx, 'efectivo')], [60, 40]);
  assert.equal(ctx.S.movimientos.length, 2);
});

test('validaciones: ingreso inexistente, monto, mes que cubre', () => {
  const ctx = fresh();
  assert.equal(cobrar(ctx, { id: 'nope' }).motivo, 'ingreso-inexistente');
  assert.equal(cobrar(ctx, { monto: 0 }).motivo, 'monto-invalido');
  assert.equal(cobrar(ctx, { mesCubre: '' }).motivo, 'mes-invalido');
  assert.equal(cobrar(ctx, { mesCubre: '2026-13' }).motivo, 'mes-invalido');
  assert.equal(ctx.S.ingresosFijos[0].cobros, undefined);
});

test('borrar un cobro revierte la cuenta exacta, quita el espejo y deja de contar', () => {
  const ctx = fresh({ nequi: 1000 });
  const { cobro } = cobrar(ctx, { destino: 'nequi', monto: 2000 });
  assert.equal(ctx.cobroBorrar('if1', cobro.id), true);
  assert.equal(saldo(ctx, 'nequi'), 1000);
  assert.equal(ctx.S.movimientos.length, 0);
  assert.equal(ingresosDelMes(ctx, '2026-09').total, 0);
  assert.equal(ctx.cobroBorrar('if1', cobro.id), false, 'ya no existe');
});

test('cobroRevertirTodos (antes de eliminar un ingreso fijo) devuelve toda la plata que había entrado', () => {
  const ctx = fresh({ nequi: 0, efectivo: 0 });
  cobrar(ctx, { destino: 'nequi', monto: 50 });
  cobrar(ctx, { mesCubre: '2026-10', fecha: '2026-10-30', destino: 'efectivo', monto: 70 });
  cobrar(ctx, { mesCubre: '2026-11', fecha: '2026-11-30', monto: 99 });
  ctx.cobroRevertirTodos(ctx.S.ingresosFijos[0]);
  assert.deepEqual([saldo(ctx, 'nequi'), saldo(ctx, 'efectivo')], [0, 0]);
  assert.equal(ctx.S.movimientos.length, 0);
  assert.equal(ctx.cobrosDeIngresoFijo(ctx.S.ingresosFijos[0]).length, 0);
});

test('ingresoFijoEstadoMes: esperado según «desde» y cobrado según los cobros que cubren ese mes', () => {
  const ctx = fresh({ ingresosFijos: [{ id: 'if1', nombre: 'Sueldo', monto: 10, desde: '2026-10' }] });
  const ing = ctx.S.ingresosFijos[0];
  assert.deepEqual([ctx.ingresoFijoEstadoMes(ing, '2026-09').esperado, ctx.ingresoFijoEstadoMes(ing, '2026-10').esperado], [false, true]);
  cobrar(ctx, { mesCubre: '2026-10', fecha: '2026-10-05', monto: 4 });
  cobrar(ctx, { mesCubre: '2026-10', fecha: '2026-10-20', monto: 6 });
  assert.equal(ctx.ingresoFijoEstadoMes(ing, '2026-10').cobrado, 10);
});

test('cobroAvisoMes: avisa solo cuando la fecha cae en otro mes que el que cubre', () => {
  const ctx = fresh();
  assert.equal(ctx.cobroAvisoMes('2026-01', '2026-01-15'), '');
  assert.equal(ctx.cobroAvisoMes('2026-01', ''), '');
  assert.equal(ctx.cobroAvisoMes('2026-01', '2026-02-03'), 'Cubre Ene 2026, pero cuenta como ingreso de Feb 2026: el mes en que te pagaron.');
});
