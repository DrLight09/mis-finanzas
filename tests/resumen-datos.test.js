'use strict';
// resumirDatos / compararResumenes (js/core/resumen-datos.js): el resumen que se muestra antes de importar, restaurar o ver un respaldo.
// Corre con:  node --test tests/resumen-datos.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { cargarApp, generar } = require('./support/datos-sinteticos');

const cargar = () => import(pathToFileURL(path.join(__dirname, '..', 'js', 'core', 'resumen-datos.js')).href);

test('entradas raras o vacías dan un resumen en ceros, sin lanzar', async () => {
  const { resumirDatos } = await cargar();
  for (const raro of [undefined, null, {}, [], 'texto', 42, { cuentas: 'no-array', libro: { a: 1 } }]) {
    const r = resumirDatos(raro);
    assert.equal(r.cuentas, 0); assert.equal(r.movimientos, 0); assert.equal(r.saldoCuentas, 0);
    assert.equal(r.primeraFecha, null); assert.equal(r.esquema, null);
  }
});

test('datos sintéticos (≈ 33 meses): conteos, rango de fechas y saldo igual al que muestra la app', async () => {
  const { resumirDatos } = await cargar();
  const ctx = cargarApp(); generar(ctx, { dias: 1000 });
  const plano = JSON.parse(JSON.stringify(ctx.S)); // sin `saldo`: viaja solo el libro
  const r = resumirDatos(plano);
  assert.equal(r.cuentas, ctx.S.cuentas.length);
  assert.equal(r.movimientos, ctx.S.gastosVar.length + ctx.S.movimientos.length + (ctx.S.ingresosExtra || []).length + (ctx.S.transferencias || []).length);
  assert.ok(r.primeraFecha < r.ultimaFecha && r.primeraFecha.startsWith('2024-01'));
  const esperado = ctx.S.cuentas.filter(c => c.tipo !== 'ahorro').reduce((a, c) => a + c.saldo, 0) + ctx.S.cajitas.reduce((a, c) => a + c.saldo, 0);
  assert.equal(Math.round(r.saldoCuentas * 100), Math.round(esperado * 100));
  // el estado en memoria (con saldos derivados) da lo mismo que su versión serializada
  assert.equal(resumirDatos(ctx.S).saldoCuentas, r.saldoCuentas);
});

test('un respaldo VIEJO con `saldo` guardado usa ese saldo; uno nuevo lo deriva del libro; las cuentas de ahorro no suman por sí mismas', async () => {
  const { resumirDatos } = await cargar();
  const viejo = { schemaVersion: 12, cuentas: [{ id: 'a', tipo: 'banco', nombre: 'A', saldo: 1500.5 }, { id: 'n', tipo: 'ahorro', nombre: 'Nu', saldo: 999 }], cajitas: [{ id: 'c', cuentaId: 'n', saldo: 20 }], libro: [] };
  assert.equal(resumirDatos(viejo).saldoCuentas, 1520.5);
  assert.equal(resumirDatos(viejo).esquema, 12);
  const nuevo = { cuentas: [{ id: 'a', tipo: 'banco', nombre: 'A' }, { id: 'n', tipo: 'ahorro', nombre: 'Nu' }], cajitas: [{ id: 'c', cuentaId: 'n' }],
    libro: [{ cuenta: 'cuenta:a', monto: 1000.1 }, { cuenta: 'cuenta:a', monto: 0.2 }, { cuenta: 'cajita:c', monto: 20 }, { cuenta: 'cuenta:otra', monto: 5 }] };
  assert.equal(resumirDatos(nuevo).saldoCuentas, 1020.3, 'suma en centavos enteros, sin residuos');
});

test('compararResumenes omite las filas que son 0 en los dos lados y marca el dinero', async () => {
  const { resumirDatos, compararResumenes } = await cargar();
  const a = resumirDatos({ cuentas: [{ id: 'a', tipo: 'banco', nombre: 'A', saldo: 10 }] });
  const b = resumirDatos({ cuentas: [{ id: 'a', tipo: 'banco', nombre: 'A', saldo: 10 }, { id: 'b', tipo: 'banco', nombre: 'B', saldo: 5 }], tarjetasCredito: [{}], resumenMeses: { '2024-01': {} } });
  const filas = compararResumenes(a, b);
  assert.deepEqual(filas.map(f => f.clave), ['cuentas', 'saldoCuentas', 'tarjetas', 'mesesCerrados']);
  assert.deepEqual([filas[0].actual, filas[0].nuevo], [1, 2]);
  assert.equal(filas.find(f => f.clave === 'saldoCuentas').dinero, true);
  assert.deepEqual(compararResumenes(null, undefined), []);
});
