// tests/restar-dinero.test.js — "Restar dinero" de una cuenta (cuentas.js)
// Corre con:  node --test tests/restar-dinero.test.js
// descontarFuente() recorta el saldo en 0, pero registrarSalida() guarda el monto COMPLETO. Sin una
// guarda de saldo, restar más de lo que hay deja el historial diciendo que salió más plata de la que
// había, y borrar ese movimiento (sumarFuente(monto)) devuelve de más.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const RAIZ = path.join(__dirname, '..');
const core = f => path.join(RAIZ, 'js', 'core', f);
const modulo = f => path.join(RAIZ, 'js', 'modules', f);
const ARCHIVOS = [core('core-state.js'), core('calc-helpers.js'), core('cuenta-efectos.js'), modulo('cuentas.js')];
const plano = x => JSON.parse(JSON.stringify(x));

function entorno({ fuente = 'nequi', saldo = 5000, monto, desc = 'Retiro de prueba' }) {
  const app = loadApp(ARCHIVOS, { permissive: true });
  Object.assign(app.S, { cajitas: [], movimientos: [], gastosVar: [], cuentas: [
    { id: 'nequi', tipo: 'nequi', saldo: 0 }, { id: 'efectivo', tipo: 'efectivo', saldo: 0 },
    { id: 'z', tipo: 'custom', nombre: 'Ahorro <z>', saldo: 0, movimientos: [] }] });
  app.getCuenta('nequi').saldo = fuente === 'nequi' ? saldo : 0;
  app.getCuenta('z').saldo = fuente === 'custom:z' ? saldo : 0;
  const el = (extra = {}) => ({ value: '', textContent: '', style: {}, focus() {}, ...extra });
  const campos = { rdMonto: el(), rdDesc: el(), rdFecha: el(), rdNota: el(), rdTitle: el(), rdSaldoActual: el(), rdPreview: el() };
  app.document.getElementById = id => campos[id] || null;
  const toasts = [], cerrados = [];
  let guardados = 0;
  app.toast = (msg, tipo, ms) => toasts.push({ msg, tipo, ms });
  app.closeSheet = n => cerrados.push(n);
  app.openSheet = () => {};
  app.save = () => { guardados++; };
  app.refresh = () => {};
  app.getSaldoActual = f => app.getSaldoFuente(f);
  app.fuenteLabel = f => ({ nequi: 'Nequi', efectivo: 'Efectivo', 'custom:z': 'Ahorro <z>' }[f] || f);
  app.abrirRestarDinero(fuente, 'Cuenta'); // abre el sheet y limpia los campos: se llenan DESPUÉS
  guardados = 0; // abrirRestarDinero() hace un save() al abrir: no cuenta como efecto de confirmar
  campos.rdMonto.value = monto; campos.rdDesc.value = desc; campos.rdFecha.value = '2026-10-05';
  return { app, toasts, cerrados, guardados: () => guardados, saldo: () => app.getSaldoFuente(fuente) };
}

describe('confirmarRestarDinero', () => {
  test('restar menos que el saldo: descuenta, registra el movimiento y cierra', () => {
    const e = entorno({ saldo: 5000, monto: '2.000,00' });
    e.app.confirmarRestarDinero();
    assert.equal(e.saldo(), 3000);
    assert.equal(e.app.S.movimientos.length, 1);
    assert.equal(e.app.S.movimientos[0].monto, 2000);
    assert.equal(e.app.S.movimientos[0].tipo, 'salida_manual');
    assert.equal(e.app.S.movimientos[0].clase, 'gasto', 'restar dinero es un gasto del mes');
    assert.equal(e.guardados(), 1);
    assert.deepEqual(plano(e.cerrados), ['restar-dinero']);
  });
  test('restar exactamente todo el saldo funciona', () => {
    const e = entorno({ saldo: 5000, monto: '5.000,00' });
    e.app.confirmarRestarDinero();
    assert.equal(e.saldo(), 0);
    assert.equal(e.app.S.movimientos.length, 1);
  });
  test('restar MÁS que el saldo: no mueve nada y avisa (antes: saldo 0 y movimiento por el monto completo)', () => {
    const e = entorno({ saldo: 5000, monto: '20.000,00' });
    e.app.confirmarRestarDinero();
    assert.equal(e.saldo(), 5000, 'el saldo no cambia');
    assert.equal(e.app.S.movimientos.length, 0, 'no se registra ningún movimiento');
    assert.equal(e.guardados(), 0);
    assert.equal(e.cerrados.length, 0, 'el sheet sigue abierto para corregir el monto');
    assert.match(e.toasts.at(-1).msg, /Saldo insuficiente en Nequi \(\$5\.000\)/);
    assert.equal(e.toasts.at(-1).tipo, 'err');
  });
  test('un centavo de más ya es "insuficiente" (compara en centavos)', () => {
    const e = entorno({ saldo: 5000, monto: '5.000,01' });
    e.app.confirmarRestarDinero();
    assert.equal(e.app.S.movimientos.length, 0);
    assert.match(e.toasts.at(-1).msg, /Saldo insuficiente/);
  });
  test('el nombre de la cuenta va escapado en el aviso', () => {
    const e = entorno({ fuente: 'custom:z', saldo: 100, monto: '500,00' });
    e.app.confirmarRestarDinero();
    assert.match(e.toasts.at(-1).msg, /Ahorro &lt;z&gt;/);
    assert.ok(!e.toasts.at(-1).msg.includes('<z>'));
  });
  test('monto 0 o vacío avisa (antes: no pasaba nada y no se sabía por qué) y no mueve nada', () => {
    for (const monto of ['0,00', '']) {
      const e = entorno({ saldo: 5000, monto });
      e.app.confirmarRestarDinero();
      assert.equal(e.saldo(), 5000);
      assert.equal(e.app.S.movimientos.length, 0);
      assert.equal(e.toasts.at(-1).msg, 'Ingresa un monto válido');
    }
  });
  test('sin descripción: avisa primero lo de la descripción y no mueve nada', () => {
    const e = entorno({ saldo: 5000, monto: '1.000,00', desc: '' });
    e.app.confirmarRestarDinero();
    assert.equal(e.saldo(), 5000);
    assert.match(e.toasts.at(-1).msg, /Describe/);
  });
  test('restar y borrar el movimiento deja el saldo como estaba (consistencia con la reversión)', () => {
    const e = entorno({ saldo: 5000, monto: '2.000,00' });
    e.app.confirmarRestarDinero();
    const m = e.app.S.movimientos[0];
    e.app.sumarFuente(m.fuente, m.monto); // lo que hace movimientos.js al borrar una salida_manual
    assert.equal(e.saldo(), 5000);
  });
});

