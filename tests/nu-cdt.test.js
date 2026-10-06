// tests/nu-cdt.test.js — "Salió plata de Nu" y "Crear CDT" (cuentas.js)
// Corre con:  node --test tests/nu-cdt.test.js
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const RAIZ = path.join(__dirname, '..');
const core = f => path.join(RAIZ, 'js', 'core', f);
const modulo = f => path.join(RAIZ, 'js', 'modules', f);
const ARCHIVOS = [core('core-state.js'), core('calc-helpers.js'), core('cuenta-efectos.js'), modulo('cuentas.js')];
const plano = x => JSON.parse(JSON.stringify(x));

// Elemento DOM falso que se crea al pedirlo por id (los campos del sheet se llenan DESPUÉS de abrirlo,
// porque abrirNuMovimiento/abrirCrearCDT los limpian).
function domFalso(app) {
  const cache = {};
  const el = () => ({ value: '', textContent: '', innerHTML: '', checked: false, style: {}, dataset: {}, focus() {}, addEventListener() {},
    querySelector: () => null, querySelectorAll: () => [], classList: { add() {}, remove() {}, toggle() {}, contains: () => false } });
  app.document.getElementById = id => (cache[id] = cache[id] || el());
  return cache;
}

function entornoNu({ tipo = 'salida', saldo = 5000, monto, desc = 'Pago', nombre = 'Cajita <A>' }) {
  const app = loadApp(ARCHIVOS, { permissive: true });
  Object.assign(app.S, { movimientos: [], gastosVar: [], encargos: [], historialTasasNu: [],
    cuentas: [{ id: 'nequi', tipo: 'nequi', saldo: 0 }, { id: 'efectivo', tipo: 'efectivo', saldo: 0 }],
    cajitas: [{ id: 'a', nombre, saldo, fecha: app.hoy() }] });
  const campos = domFalso(app);
  // La cajita única se auto-selecciona al abrir: se simula el click que dispara el handler real.
  const cajitaEl = { dataset: { nuCajita: 'cajita:a' }, style: {}, handlers: {}, addEventListener(ev, fn) { this.handlers[ev] = fn; }, click() { this.handlers.click.call(this); } };
  campos.nuMovCajitasWrap = { innerHTML: '', querySelectorAll: () => [cajitaEl], querySelector: () => cajitaEl };
  const toasts = [], cerrados = [];
  let guardados = 0;
  app.toast = (msg, t, ms) => toasts.push({ msg, tipo: t, ms });
  app.closeSheet = n => cerrados.push(n);
  app.openSheet = () => {};
  app.save = () => { guardados++; };
  app.refresh = () => {};
  app.abrirNuMovimiento(tipo);
  guardados = 0;
  campos.nuMovMonto.value = monto; campos.nuMovDesc.value = desc; campos.nuMovFecha.value = '2026-10-05';
  const saldoCajita = () => app.getSaldoFuente('cajita:a');
  return { app, toasts, cerrados, guardados: () => guardados, saldoCajita, cajita: () => app.S.cajitas[0] };
}

describe('confirmarNuMovimiento — salida', () => {
  test('sacar menos que el saldo: descuenta, registra el movimiento y cierra', () => {
    const e = entornoNu({ saldo: 5000, monto: '2.000,00' });
    e.app.confirmarNuMovimiento();
    assert.equal(Math.round(e.saldoCajita()), 3000);
    assert.equal(e.app.S.movimientos.length, 1);
    assert.equal(e.app.S.movimientos[0].monto, 2000);
    assert.equal(e.app.S.movimientos[0].fuente, 'cajita:a');
    assert.equal(e.guardados(), 1);
    assert.deepEqual(plano(e.cerrados), ['nu-movimiento']);
  });
  test('sacar exactamente todo el saldo funciona', () => {
    const e = entornoNu({ saldo: 5000, monto: '5.000,00' });
    e.app.confirmarNuMovimiento();
    assert.equal(Math.round(e.saldoCajita()), 0);
    assert.equal(e.app.S.movimientos.length, 1);
  });
  test('sacar MÁS que el saldo: no mueve nada, no toca la cajita y avisa (antes: saldo 0 y movimiento por el monto completo)', () => {
    const e = entornoNu({ saldo: 5000, monto: '20.000,00' });
    const antes = JSON.stringify(e.cajita());
    e.app.confirmarNuMovimiento();
    assert.equal(JSON.stringify(e.cajita()), antes, 'ni siquiera materializa intereses a medias');
    assert.equal(e.app.S.movimientos.length, 0);
    assert.equal(e.guardados(), 0);
    assert.equal(e.cerrados.length, 0);
    assert.match(e.toasts.at(-1).msg, /Saldo insuficiente en Cajita &lt;A&gt; \(\$5\.000\)/);
    assert.equal(e.toasts.at(-1).ms, 3500);
  });
  test('una ENTRADA no se limita por el saldo', () => {
    const e = entornoNu({ tipo: 'entrada', saldo: 100, monto: '20.000,00', desc: 'Sueldo' });
    e.app.confirmarNuMovimiento();
    assert.equal(Math.round(e.saldoCajita()), 20100);
    assert.equal(e.app.S.movimientos.length, 1);
  });
  test('monto 0 avisa y no mueve nada', () => {
    const e = entornoNu({ saldo: 5000, monto: '0,00' });
    e.app.confirmarNuMovimiento();
    assert.equal(e.app.S.movimientos.length, 0);
    assert.equal(e.guardados(), 0);
  });
});

describe('confirmarCrearCDT — RTE', () => {
  function entornoCDT({ rte, monto = '100.000,00', saldo = 1000000 }) {
    const app = loadApp(ARCHIVOS, { permissive: true });
    Object.assign(app.S, { movimientos: [], gastosVar: [], encargos: [], historialTasasNu: [],
      cuentas: [{ id: 'nequi', tipo: 'nequi', saldo: 0 }, { id: 'efectivo', tipo: 'efectivo', saldo: 0 }],
      cajitas: [{ id: 'a', nombre: 'A', saldo, fecha: app.hoy(), tasa: 9.25 }] });
    const campos = domFalso(app);
    const toasts = [], cerrados = [];
    let guardados = 0;
    app.toast = (msg, t) => toasts.push({ msg, tipo: t });
    app.closeSheet = n => cerrados.push(n);
    app.openSheet = () => {};
    app.save = () => { guardados++; };
    app.refresh = () => {};
    app.abrirCrearCDT('a');
    guardados = 0;
    const venceAnio = String(new Date().getFullYear() + 1) + '-06-15';
    Object.assign(campos.cdt_monto, { value: monto }); Object.assign(campos.cdt_tasa, { value: '9,25' });
    Object.assign(campos.cdt_rte, { value: rte }); Object.assign(campos.cdt_inicio, { value: app.hoy() });
    Object.assign(campos.cdt_vence, { value: venceAnio });
    return { app, toasts, cerrados, guardados: () => guardados, cdts: () => app.S.cajitas[0].cdts || [] };
  }
  test('RTE "4,00" (el valor por defecto del formulario) → 4', () => {
    const e = entornoCDT({ rte: '4,00' }); e.app.confirmarCrearCDT();
    assert.equal(e.cdts().length, 1); assert.equal(e.cdts()[0].rte, 4);
  });
  test('RTE vacío → 4 (por defecto)', () => {
    const e = entornoCDT({ rte: '' }); e.app.confirmarCrearCDT();
    assert.equal(e.cdts().length, 1); assert.equal(e.cdts()[0].rte, 4);
  });
  test('RTE 0 se respeta (antes la creación lo convertía en 4; la edición ya lo aceptaba)', () => {
    for (const rte of ['0', '0,00']) {
      const e = entornoCDT({ rte }); e.app.confirmarCrearCDT();
      assert.equal(e.cdts().length, 1, `rte ${rte}`); assert.equal(e.cdts()[0].rte, 0, `rte ${rte}`);
    }
  });
  test('RTE con decimales y punto o coma', () => {
    for (const [rte, esperado] of [['3,5', 3.5], ['3.5', 3.5], ['7', 7]]) {
      const e = entornoCDT({ rte }); e.app.confirmarCrearCDT();
      assert.equal(e.cdts()[0].rte, esperado, `rte ${rte}`);
    }
  });
  test('RTE no numérico, negativo o > 100 se rechaza y no crea nada ni toca el saldo', () => {
    for (const rte of ['abc', '-1', '4%', '150', '4,5,6']) {
      const e = entornoCDT({ rte }); e.app.confirmarCrearCDT();
      assert.equal(e.cdts().length, 0, `rte ${rte}`);
      assert.equal(e.guardados(), 0, `rte ${rte}`);
      assert.equal(Math.round(e.app.S.cajitas[0].saldo), 1000000, `rte ${rte}`);
      assert.equal(e.toasts.at(-1).tipo, 'err', `rte ${rte}`);
    }
  });
  test('un CDT válido descuenta el monto de la cajita', () => {
    const e = entornoCDT({ rte: '4,00', monto: '100.000,00' }); e.app.confirmarCrearCDT();
    assert.equal(Math.round(e.app.S.cajitas[0].saldo), 900000);
    assert.equal(e.cdts()[0].monto, 100000);
  });
  test('monto mayor al saldo de la cajita se rechaza', () => {
    const e = entornoCDT({ rte: '4,00', monto: '2.000.000,00' }); e.app.confirmarCrearCDT();
    assert.equal(e.cdts().length, 0);
    assert.match(e.toasts.at(-1).msg, /Saldo insuficiente/);
  });
});
