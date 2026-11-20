// Validador de forma del estado (js/core/validar-estado.js) y redondeo a centavos en la puerta única de saldos.
const test = require('node:test'), { describe, before } = test;
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { loadApp } = require('./support/load-app');
const RAIZ = path.join(__dirname, '..');
let V;
before(async () => { V = await import(pathToFileURL(path.join(RAIZ, 'js', 'core', 'validar-estado.js')).href); });

describe('validarEstado', () => {
  test('un estado normal es válido', () => {
    const r = V.validarEstado({ cuentas: [{ id: 'a', saldo: 10 }], libro: [{ id: 'l', cuenta: 'cuenta:a', monto: -5.5 }], movimientos: [], otra: { NaN: NaN } });
    assert.equal(r.ok, true); assert.deepEqual(r.graves, []);
  });
  test('un saldo o monto NaN/Infinity es grave (JSON lo guardaría como null sin avisar)', () => {
    const r = V.validarEstado({ cuentas: [{ id: 'a', saldo: NaN }], movimientos: [{ id: 'm', monto: Infinity }] });
    assert.equal(r.ok, false); assert.equal(r.graves.length, 2);
    assert.match(r.graves[0], /cuentas.*saldo/);
  });
  test('una lista que no es lista, o un elemento que no es registro, es grave', () => {
    assert.equal(V.validarEstado({ movimientos: {} }).ok, false);
    assert.equal(V.validarEstado({ movimientos: [1] }).ok, false);
    assert.equal(V.validarEstado(null).ok, false);
  });
  test('ids repetidos son leves: se avisa pero no frena el guardado', () => {
    const r = V.validarEstado({ movimientos: [{ id: 'x' }, { id: 'x' }] });
    assert.equal(r.ok, true); assert.equal(r.leves.length, 1);
  });
  test('las claves ausentes no son error (estado nuevo o de una versión anterior)', () => {
    assert.equal(V.validarEstado({}).ok, true);
  });
});

describe('dinero a centavos', () => {
  const app = () => {
    const ctx = loadApp([path.join(RAIZ, 'js', 'core', 'core-state.js')], { permissive: true });
    Object.assign(ctx.S, { libro: [], cuentas: [{ id: 'ef', tipo: 'efectivo', nombre: 'Efectivo', saldo: 0 }], cajitas: [] });
    return ctx;
  };
  test('0,1 + 0,2 no deja residuos en el saldo ni en el libro, y el libro sigue cuadrando', () => {
    const ctx = app();
    ctx.sumarFuente('cuenta:ef', 0.1, { origen: { modulo: 't' } });
    ctx.sumarFuente('cuenta:ef', 0.2, { origen: { modulo: 't' } });
    assert.equal(ctx.S.cuentas[0].saldo, 0.3);
    assert.equal(ctx.S.libro.reduce((a, l) => a + l.monto, 0), 0.30000000000000004, 'la suma cruda del libro sí tiene residuo…');
    assert.equal(ctx.Libro.verificar().ok, true, '…pero la verificación (con tolerancia) cuadra');
  });
  test('un monto con muchos decimales se redondea a 2 antes de entrar al saldo y al libro', () => {
    const ctx = app();
    ctx.sumarFuente('cuenta:ef', 1234.5678, { origen: { modulo: 't' } });
    assert.equal(ctx.S.cuentas[0].saldo, 1234.57);
    assert.equal(ctx.S.libro[0].monto, 1234.57);
  });
  test('muchas operaciones seguidas: el saldo no se aleja del libro', () => {
    const ctx = app();
    for (let i = 0; i < 500; i++) { ctx.sumarFuente('cuenta:ef', 0.1, { origen: { modulo: 't' } }); ctx.descontarFuente('cuenta:ef', 0.07, { origen: { modulo: 't' } }); }
    assert.equal(ctx.S.cuentas[0].saldo, 15);
    assert.equal(ctx.Libro.verificar().ok, true);
  });
});
