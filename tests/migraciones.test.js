'use strict';
// MIGRACIONES / aplicarMigraciones (core-state.js): cambios de modelo de datos con versión.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const CORE_DIR = process.env.MIS_FINANZAS_CORE_DIR || path.join(__dirname, '..', 'js', 'core');
const app = () => loadApp([path.join(CORE_DIR, 'core-state.js')]);
const plano = x => JSON.parse(JSON.stringify(x));

test('un objeto sin schemaVersion se migra y queda en la versión actual (3)', () => {
  const d = app().aplicarMigraciones({ cuentas: [] });
  assert.equal(d.schemaVersion, 3);
});

test('datos en v2 (los existentes) solo ejecutan v3: estampan `clase` y suben la versión', () => {
  const d = plano(app().aplicarMigraciones({ schemaVersion: 2, movimientos: [{ id: 'a', tipo: 'entrada', monto: 5, fecha: '2026-10-01', desc: 'Sueldo' }] }));
  assert.equal(d.schemaVersion, 3);
  assert.equal(d.movimientos[0].clase, 'ingreso');
});

test('es idempotente: aplicarla dos veces no cambia nada', () => {
  const ctx = app();
  const una = plano(ctx.aplicarMigraciones({ schemaVersion: 2, movimientos: [{ id: 'a', tipo: 'entrada', monto: 5, fecha: '2026-10-01' }], gastosVar: [{ id: 'g', monto: 1, fecha: '2026-10-01' }] }));
  const dos = plano(ctx.aplicarMigraciones(plano(una)));
  assert.deepEqual(dos, una);
});

test('datos de una versión MÁS NUEVA que la app no se tocan', () => {
  const d = plano(app().aplicarMigraciones({ schemaVersion: 999, plataCometida: [{ id: 'a' }] }));
  assert.equal(d.schemaVersion, 999);
  assert.ok(d.plataCometida, 'no se migra lo que esta versión no entiende');
});

test('valores que no son objeto se devuelven tal cual', () => {
  const ctx = app();
  assert.equal(ctx.aplicarMigraciones(null), null);
  assert.equal(ctx.aplicarMigraciones(undefined), undefined);
});

