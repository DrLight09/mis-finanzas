'use strict';
// Coherencia ESPEJO ↔ LIBRO (Libro.verificarEspejo): toda pata del libro con `origen.ref` y saldo neto ≠ 0 apunta a un registro que existe.
// Corre con:  node --test tests/consistencia-libro.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { cargarApp, generar, HOY } = require('./support/datos-sinteticos');

const CORTE = '2024-09';
const opciones = { hoy: HOY, mesActual: HOY.slice(0, 7), guardar: () => {}, aceptarWrappedSinGuardar: true };
const preparar = () => { const ctx = cargarApp(); generar(ctx, { dias: 1000 }); return ctx; };

test('los datos sintéticos (gastos, ingresos, gastos fijos, cuentas) son coherentes espejo ↔ libro', () => {
  const ctx = preparar();
  const r = ctx.Libro.verificarEspejo(ctx.S);
  assert.equal(r.ok, true, JSON.stringify(r.huerfanas.slice(0, 3)));
});

test('borrar un registro SIN revertir su plata deja una pata huérfana, con su módulo', () => {
  const ctx = preparar();
  const gasto = ctx.S.gastosVar[0];
  ctx.S.gastosVar.splice(0, 1);
  const r = ctx.Libro.verificarEspejo(ctx.S);
  assert.equal(r.ok, false);
  assert.equal(JSON.stringify(r.huerfanas.map(h => [h.ref, h.modulo])), JSON.stringify([[gasto.id, 'gastos']]));
});

test('borrarlo y REVERTIR su pata (misma ref, rev:true) vuelve a dejarlo coherente', () => {
  const ctx = preparar();
  const gasto = ctx.S.gastosVar[0];
  ctx.S.gastosVar.splice(0, 1);
  ctx.Libro.conOrigen({ modulo: 'gastos', ref: gasto.id, rev: true }, () => ctx.sumarFuente(gasto.fuente || 'cuenta:nequi', gasto.monto, { fecha: gasto.fecha }));
  const r = ctx.Libro.verificarEspejo(ctx.S);
  assert.equal(r.ok, true, JSON.stringify(r.huerfanas));
});

test('el cierre de períodos conserva la coherencia: no poda un registro dejando su pata ni al revés', () => {
  const ctx = preparar();
  assert.equal(ctx.Libro.verificarEspejo(ctx.S).ok, true);
  assert.equal(ctx.Cierre.ejecutar(CORTE, opciones).ok, true);
  const r = ctx.Libro.verificarEspejo(ctx.S);
  assert.equal(r.ok, true, JSON.stringify(r.huerfanas.slice(0, 3)));
  // y un segundo cierre, posterior
  assert.equal(ctx.Cierre.ejecutar('2024-10', Object.assign({}, opciones, { forzar: true })).ok, true);
  assert.equal(ctx.Libro.verificarEspejo(ctx.S).ok, true);
});

test('si el cierre rompiera la coherencia se aborta SIN escribir (pata de un tipo que no se pliega apuntando a un registro que sí se poda)', () => {
  const ctx = preparar();
  const viejo = ctx.S.gastosVar.find(g => g.fecha < '2024-09-01');
  // Una entrada `rendimiento` (no se pliega en el libro) que apunta a un gasto que el cierre sí poda: el cierre dejaría la pata sin su registro.
  ctx.Libro.registrar('cuenta:nequi', 10, { tipo: 'rendimiento', fecha: '2024-03-15', origen: { modulo: 'gastos', ref: viejo.id } });
  assert.equal(ctx.Libro.verificarEspejo(ctx.S).ok, true, 'antes del cierre todo era coherente');
  const antes = JSON.stringify(ctx.S);
  let guardado = 0;
  const r = ctx.Cierre.ejecutar(CORTE, Object.assign({}, opciones, { guardar: () => { guardado++; } }));
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'espejo-roto');
  assert.ok(r.huerfanas.some(h => h.ref === viejo.id));
  assert.equal(guardado, 0);
  assert.equal(JSON.stringify(ctx.S), antes, 'el estado real quedó intacto');
});

test('si el estado YA venía incoherente, el cierre no se bloquea por eso (solo se vigila que no empeore por el cierre)', () => {
  const ctx = preparar();
  ctx.S.gastosVar.splice(0, 1); // incoherente desde antes
  assert.equal(ctx.Libro.verificarEspejo(ctx.S).ok, false);
  const r = ctx.Cierre.ejecutar(CORTE, opciones);
  assert.notEqual(r.motivo, 'espejo-roto');
});
