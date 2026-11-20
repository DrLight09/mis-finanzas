'use strict';
// uid(): ids únicos dentro de la sesión (aunque sean del mismo milisegundo) y con el formato que otros archivos leen.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const ESTADO_JS = path.join(__dirname, '..', 'js', 'core', 'estado.js');
const nuevo = () => loadApp([ESTADO_JS], { permissive: true });

describe('uid', () => {
  test('100.000 ids seguidos no se repiten (casi todos caen en el mismo milisegundo)', () => {
    const { uid } = nuevo();
    const vistos = new Set();
    for (let i = 0; i < 100000; i++) vistos.add(uid());
    assert.equal(vistos.size, 100000);
  });

  test('con el reloj congelado, 46.656 ids (todo el espacio del sufijo) siguen siendo distintos', () => {
    const { uid } = nuevo();
    const real = Date.now;
    Date.now = () => 1.8e12;
    try {
      const vistos = new Set();
      for (let i = 0; i < 46656; i++) vistos.add(uid());
      assert.equal(vistos.size, 46656);
    } finally { Date.now = real; }
  });

  test('formato: 11 caracteres [0-9a-z]; lo anterior a los 3 últimos es la hora en base 36 (diaCreacionMovimiento lo lee así)', () => {
    const { uid } = nuevo();
    const antes = Date.now();
    const id = uid();
    const despues = Date.now();
    assert.match(id, /^[0-9a-z]{11}$/);
    const ms = parseInt(id.slice(0, -3), 36);
    assert.ok(ms >= antes && ms <= despues, 'la hora del id está entre antes y después de crearlo');
  });

  test('si el reloj retrocede, los ids no se repiten ni retroceden', () => {
    const { uid } = nuevo();
    const real = Date.now;
    try {
      Date.now = () => 1.8e12 + 5;
      const a = uid();
      Date.now = () => 1.8e12;          // retrocede 5 ms
      const b = uid();
      assert.notEqual(a, b);
      assert.ok(parseInt(b.slice(0, -3), 36) >= parseInt(a.slice(0, -3), 36));
    } finally { Date.now = real; }
  });
});
