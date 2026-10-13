'use strict';
// tests/libro.test.js — el libro de movimientos (core-state.js): saldo de cada cuenta == suma de sus entradas.
// Corre con:  node --test tests/libro.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadApp } = require('./support/load-app');
const CORE = process.env.MIS_FINANZAS_CORE_DIR || path.join(__dirname, '..', 'js', 'core');
const plano = x => JSON.parse(JSON.stringify(x));

function app(estado = {}) {
  const ctx = loadApp(['core-state.js', 'cuenta-efectos.js', 'periodo.js', 'nu-calc.js'].map(f => path.join(CORE, f)), { permissive: true });
  Object.assign(ctx.S, {
    modulos: {}, libro: [], movimientos: [], gastosVar: [], tarjetasCredito: [],
    cuentas: [{ id: 'nequi', tipo: 'nequi', saldo: 0 }, { id: 'efectivo', tipo: 'efectivo', saldo: 0 }, { id: 'cu1', tipo: 'custom', nombre: 'Madre', saldo: 0 }],
    cajitas: [{ id: 'c1', nombre: 'Sobra', saldo: 0 }],
  }, estado);
  return ctx;
}
const saldo = (ctx, id) => ctx.S.cuentas.concat(ctx.S.cajitas).find(c => c.id === id).saldo;

test('registrar — tipo "movimiento" y origen "sin-origen" por defecto; solo cuentas con saldo; monto 0 no entra', () => {
  const ctx = app();
  const id = ctx.Libro.registrar('nequi', 100, { fecha: '2026-10-01' });
  const e = plano(ctx.S.libro[0]);
  assert.deepEqual([e.id === id, e.cuenta, e.monto, e.tipo, e.origen.modulo], [true, 'nequi', 100, 'movimiento', 'sin-origen']);
  assert.equal(ctx.Libro.registrar('tc:x', 5, {}), null, 'una tarjeta de crédito no es cuenta con saldo');
  assert.equal(ctx.Libro.registrar('alcancia', 5, {}), null);
  assert.equal(ctx.Libro.registrar('nequi', 0, {}), null);
  assert.equal(ctx.S.libro.length, 1);
});

test('registrar — rendimiento: una sola entrada por cuenta y mes', () => {
  const ctx = app(); const st = { libro: [] };
  ctx.Libro.registrar('cajita:c1', 10, { tipo: 'rendimiento', fecha: '2026-10-01' }, st);
  ctx.Libro.registrar('cajita:c1', 5, { tipo: 'rendimiento', fecha: '2026-10-20' }, st);
  ctx.Libro.registrar('cajita:c1', 7, { tipo: 'rendimiento', fecha: '2026-11-02' }, st);
  ctx.Libro.registrar('cajita:c2', 3, { tipo: 'rendimiento', fecha: '2026-10-05' }, st);
  assert.deepEqual(plano(st.libro.map(l => [l.cuenta, l.fecha.slice(0, 7), l.monto])), [['cajita:c1', '2026-10', 15], ['cajita:c1', '2026-11', 7], ['cajita:c2', '2026-10', 3]]);
});

test('conOrigen — lo que se mueva dentro lleva ese origen; con rev:true es una "reversion" con el mismo ref', () => {
  const ctx = app();
  ctx.Libro.conOrigen({ modulo: 'prestado', ref: 'm1' }, () => ctx.sumarFuente('nequi', 10));
  ctx.Libro.conOrigen({ modulo: 'prestado', ref: 'm1', rev: true }, () => ctx.descontarFuente('nequi', 10));
  const [a, b] = plano(ctx.S.libro);
  assert.deepEqual([a.tipo, a.monto, a.origen.ref, b.tipo, b.monto, b.origen.ref, b.origen.rev], ['movimiento', 10, 'm1', 'reversion', -10, 'm1', true]);
  ctx.sumarFuente('nequi', 1);
  assert.equal(plano(ctx.S.libro[2]).origen.modulo, 'sin-origen', 'fuera del bloque vuelve a no haber contexto');
});

test('puerta única — sumarFuente/descontarFuente cambian el saldo Y dejan su entrada; el libro cuadra', () => {
  const ctx = app();
  ctx.sumarFuente('efectivo', 50, { origen: { modulo: 't', ref: 'r1' } });
  ctx.sumarFuente('custom:cu1', 20);
  ctx.sumarFuente('cajita:c1', 7.5);
  ctx.descontarFuente('efectivo', 20, { origen: { modulo: 't', ref: 'r2' } });
  assert.deepEqual([saldo(ctx, 'efectivo'), saldo(ctx, 'cu1'), saldo(ctx, 'c1')], [30, 20, 7.5]);
  assert.deepEqual(plano(ctx.S.libro.filter(l => l.cuenta === 'efectivo').map(l => [l.monto, l.origen.ref])), [[50, 'r1'], [-20, 'r2']]);
  assert.equal(ctx.Libro.verificar().ok, true);
  assert.equal(ctx.Libro.saldo('efectivo'), 30);
});

test('el saldo NUNCA se recorta: restar más de lo que hay deja la cuenta negativa y visible', () => {
  const ctx = app();
  ctx.descontarFuente('nequi', 300);
  assert.equal(saldo(ctx, 'nequi'), -300);
  assert.equal(ctx.Libro.verificar().ok, true);
});

test('una tarjeta de crédito no pasa por el libro (su deuda se deriva de sus propios registros)', () => {
  const ctx = app({ tarjetasCredito: [{ id: 'tc1', nombre: 'TC', deuda: 0 }] });
  ctx.descontarFuente('tc:tc1', 100);
  assert.equal(ctx.S.tarjetasCredito[0].deuda, 100);
  assert.equal(ctx.S.libro.length, 0);
});

test('ajustarSaldoCuenta — registra la DIFERENCIA; sin cambio no deja entrada', () => {
  const ctx = app();
  ctx.sumarFuente('cajita:c1', 100);
  assert.equal(ctx.ajustarSaldoCuenta('cajita:c1', 112.5, { tipo: 'ajuste', desc: 'chequeo' }), 12.5);
  assert.equal(ctx.ajustarSaldoCuenta('cajita:c1', 112.5, { tipo: 'ajuste' }), 0);
  const ult = plano(ctx.S.libro[ctx.S.libro.length - 1]);
  assert.deepEqual([ult.tipo, ult.monto, ult.desc, ctx.S.libro.length], ['ajuste', 12.5, 'chequeo', 2]);
  assert.equal(ctx.Libro.verificar().ok, true);
});

test('verificar — detecta un saldo que se movió sin pasar por la puerta única, con el nombre de la cuenta', () => {
  const ctx = app();
  ctx.sumarFuente('nequi', 100);
  ctx.S.cuentas.find(c => c.id === 'cu1').saldo = 40;   // alguien escribe c.saldo directamente
  ctx.S.cajitas[0].saldo = -5;
  const v = plano(ctx.Libro.verificar());
  assert.equal(v.ok, false);
  assert.deepEqual(v.descuadres.map(f => [f.nombre, f.dif]).sort(), [['Madre', 40], ['Sobra (Nu)', -5]]);
});

test('verificar — ignora entradas de cuentas que ya no existen', () => {
  const ctx = app();
  ctx.sumarFuente('custom:cu1', 10);
  ctx.S.cuentas = ctx.S.cuentas.filter(c => c.id !== 'cu1');
  assert.equal(ctx.Libro.verificar().ok, true);
});

test('entradasVisibles — solo lo que ningún registro de módulo representa (intereses, ajustes, CDT)', () => {
  const ctx = app();
  const st = { libro: [] };
  ['movimiento', 'reversion', 'apertura', 'rendimiento', 'ajuste', 'cdt'].forEach((t, i) => ctx.Libro.registrar('nequi', i + 1, { tipo: t, fecha: '2026-10-0' + (i + 1) }, st));
  assert.deepEqual(plano(ctx.Libro.entradasVisibles(st).map(l => l.tipo)), ['rendimiento', 'ajuste', 'cdt']);
});

test('espejo y libro van juntos: registrarMovEspejo escribe en S.movimientos con `fuente` para cualquier cuenta', () => {
  const ctx = app();
  const a = ctx.registrarMovEspejo({ cuenta: 'cajita:c1', flujo: 'entrada', monto: 5, fecha: '2026-10-01', desc: 'x', origen: 'Prestado' });
  assert.deepEqual(plano(ctx.S.movimientos.find(m => m.id === a)), plano({ ...ctx.S.movimientos[0] }));
  assert.equal(ctx.S.movimientos[0].fuente, 'cajita:c1');
  assert.equal(ctx.borrarMovEspejo('cajita:c1', a), true);
  assert.equal(ctx.S.movimientos.length, 0);
});
