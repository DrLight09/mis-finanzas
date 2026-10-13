'use strict';
// tests/libro-modulos.test.js — los módulos pasan su origen a la puerta única y dejan el libro cuadrado.
// Corre con:  node --test tests/libro-modulos.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadApp } = require('./support/load-app');
const RAIZ = path.join(__dirname, '..');
const core = f => path.join(RAIZ, 'js', 'core', f), modulo = f => path.join(RAIZ, 'js', 'modules', f);
const ARCHIVOS = [core('core-state.js'), core('calc-helpers.js'), core('cuenta-efectos.js'), core('periodo.js'), core('nu-calc.js'), modulo('cuentas.js'), modulo('mesada.js'), modulo('encargos.js')];
const plano = x => JSON.parse(JSON.stringify(x));

function cargar() {
  const app = loadApp(ARCHIVOS, { permissive: true });
  Object.assign(app.S, { modulos: { mesada: true }, libro: [], movimientos: [], gastosVar: [], cajitas: [],
    cuentas: [{ id: 'nequi', tipo: 'nequi', saldo: 0 }, { id: 'efectivo', tipo: 'efectivo', saldo: 0 }] });
  return app;
}
const ultima = app => plano(app.S.libro[app.S.libro.length - 1]);

test('Sumar dinero (cuentas.js) — la entrada del libro apunta al movimiento que crea', () => {
  const app = cargar();
  app.registrarEntradaConApertura('efectivo', 1000, '2026-10-11', 'Sueldo', false, '');
  const mov = plano(app.S.movimientos[app.S.movimientos.length - 1]), e = ultima(app);
  assert.deepEqual([e.monto, e.origen.modulo, e.origen.ref], [1000, 'cuentas', mov.id]);
  assert.equal(app.Libro.verificar().ok, true);
});

test('Restar dinero (cuentas.js) — salida registrada completa y apuntando a su movimiento', () => {
  const app = cargar();
  app.registrarSalida('efectivo', 400, '2026-10-11', 'Ajuste', '');
  const mov = plano(app.S.movimientos[app.S.movimientos.length - 1]), e = ultima(app);
  assert.deepEqual([e.monto, e.origen.modulo, e.origen.ref], [-400, 'cuentas', mov.id]);
  assert.equal(app.S.cuentas.find(c => c.id === 'efectivo').saldo, -400, 'sin recorte: la cuenta queda negativa y se ve');
  assert.equal(app.Libro.verificar().ok, true);
});

test('Mesada — abonar y quitar el abono: la entrada apunta al espejo y la reversión lleva el mismo ref', () => {
  const app = cargar();
  const id = app._mesadaEntrar('nequi', 500, '2026-10-11', 'Mesada');
  assert.ok(id);
  assert.deepEqual([ultima(app).origen.modulo, ultima(app).origen.ref, ultima(app).tipo], ['mesada', id, 'movimiento']);
  app._mesadaSacar('nequi', 500, id, true);
  const r = ultima(app);
  assert.deepEqual([r.tipo, r.monto, r.origen.ref, r.origen.rev], ['reversion', -500, id, true]);
  assert.equal(app.Libro.verificar().ok, true);
});

test('un saldo cambiado sin pasar por la puerta única lo detecta verificar()', () => {
  const app = cargar();
  app.sumarFuente('nequi', 100);
  app.S.cuentas.find(c => c.id === 'nequi').saldo += 5;
  assert.equal(plano(app.Libro.verificar()).descuadres[0].dif, 5);
});

test('Encargos — eliminar el saldo inicial NO toca el saldo de la cuenta ni el libro (es plata ajena, no está en c.saldo)', async () => {
  const app = cargar();
  app.dialogo = async () => true;
  app.S.cuentas.find(c => c.id === 'nequi').saldo = 0; app.sumarFuente('nequi', 1000, { origen: { modulo: 't', ref: 'x' } });
  app.S.encargos = [{ id: 'e1', nombre: 'Ana', saldoInicial: 300, cuentaInicial: 'nequi', movimientos: [] }];
  const antes = app.S.libro.length;
  await app.deleteMovEncargo('e1', '__saldo_ini__');
  assert.equal(app.S.cuentas.find(c => c.id === 'nequi').saldo, 1000, 'el saldo propio queda intacto');
  assert.equal(app.S.libro.length, antes, 'sin entrada nueva en el libro');
  assert.equal(app.S.encargos[0].saldoInicial, 0);
  assert.equal(app.Libro.verificar().ok, true);
});
