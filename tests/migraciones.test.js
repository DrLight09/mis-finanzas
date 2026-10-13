'use strict';
// VERSIÓN DEL ESQUEMA / aplicarMigraciones (core-state.js). La app nació limpia en el esquema 7: no migra datos anteriores.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const CORE_DIR = process.env.MIS_FINANZAS_CORE_DIR || path.join(__dirname, '..', 'js', 'core');
const app = () => loadApp([path.join(CORE_DIR, 'core-state.js')]);
const plano = x => JSON.parse(JSON.stringify(x));

test('datos nuevos (sin schemaVersion) nacen en la versión base (7)', () => {
  const d = plano(app().aplicarMigraciones({ cuentas: [] }));
  assert.equal(d.schemaVersion, 7);
});

test('es idempotente: aplicarla dos veces no cambia nada', () => {
  const ctx = app();
  const una = plano(ctx.aplicarMigraciones({ movimientos: [{ id: 'a', tipo: 'entrada', monto: 5, fecha: '2026-10-01' }] }));
  assert.deepEqual(plano(ctx.aplicarMigraciones(plano(una))), una);
});

test('datos de una versión MÁS NUEVA que la app no se tocan', () => {
  const d = plano(app().aplicarMigraciones({ schemaVersion: 999, algoNuevo: [{ id: 'a' }] }));
  assert.equal(d.schemaVersion, 999);
  assert.ok(d.algoNuevo, 'no se migra lo que esta versión no entiende');
});

test('datos de una versión ANTERIOR a la base no se tocan: se marcan (S._esquemaAnterior) para que la app avise y se empiece de cero', () => {
  for (const v of [2, 4, 6]) {
    const d = plano(app().aplicarMigraciones({ schemaVersion: v, movimientos: [{ id: 'a' }] }));
    assert.equal(d.schemaVersion, v, 'no se sube la versión: los datos viejos NO están en la forma nueva');
    assert.equal(d._esquemaAnterior, v);
    assert.equal(d.libro, undefined, 'y no se inventa un libro');
  }
});

test('valores que no son objeto se devuelven tal cual', () => {
  const ctx = app();
  assert.equal(ctx.aplicarMigraciones(null), null);
  assert.equal(ctx.aplicarMigraciones(undefined), undefined);
});
