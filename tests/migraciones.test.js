'use strict';
// MIGRACIONES / aplicarMigraciones (core-state.js): cambios de modelo de datos con versión.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const CORE_DIR = process.env.MIS_FINANZAS_CORE_DIR || path.join(__dirname, '..', 'js', 'core');
const app = () => loadApp([path.join(CORE_DIR, 'core-state.js')]);
const plano = x => JSON.parse(JSON.stringify(x));

test('un objeto sin schemaVersion se migra y queda en la versión actual', () => {
  const d = app().aplicarMigraciones({ cuentas: [] });
  assert.ok(d.schemaVersion >= 2);
});

test('v2 — plataCometida (typo histórico) pasa a plataComprometida y el campo viejo desaparece', () => {
  const d = plano(app().aplicarMigraciones({ plataCometida: [{ id: 'a', monto: 1 }] }));
  assert.deepEqual(d.plataComprometida, [{ id: 'a', monto: 1 }]);
  assert.equal('plataCometida' in d, false);
});

test('v2 — si existen los dos campos (app vieja escribió el viejo) se juntan sin repetir ids', () => {
  const d = plano(app().aplicarMigraciones({ plataComprometida: [{ id: 'a' }], plataCometida: [{ id: 'a' }, { id: 'b' }] }));
  assert.deepEqual(d.plataComprometida.map(i => i.id), ['a', 'b']);
  assert.equal('plataCometida' in d, false);
});

test('es idempotente: aplicarla dos veces no cambia nada', () => {
  const ctx = app();
  const una = plano(ctx.aplicarMigraciones({ plataCometida: [{ id: 'a' }] }));
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
