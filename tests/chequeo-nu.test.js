// tests/chequeo-nu.test.js — "Chequeo rápido de cajitas Nu" y "Agregar dinero" (cuentas.js)
// Corre con:  node --test tests/chequeo-nu.test.js
// Un campo .money-input se rellena con "0,00" apenas se toca y nada lo limpia al salir (money-input.js).
// Para el chequeo, 0 significa "no anoté nada": antes se guardaba como lectura real, ponía la cajita en
// 0 y ensuciaba S.chequeosNu.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const RAIZ = path.join(__dirname, '..');
const core = f => path.join(RAIZ, 'js', 'core', f);
const modulo = f => path.join(RAIZ, 'js', 'modules', f);
const ARCHIVOS = [core('core-state.js'), core('calc-helpers.js'), core('cuenta-efectos.js'), modulo('cuentas.js')];
const plano = x => JSON.parse(JSON.stringify(x));

function entornoChequeo({ cajitas, lecturas, dialogoRespuesta = true }) {
  const app = loadApp(ARCHIVOS, { permissive: true });
  const hoyStr = app.hoy();
  Object.assign(app.S, { movimientos: [], gastosVar: [], encargos: [], chequeosNu: [], historialTasasNu: [],
    cuentas: [{ id: 'nequi', tipo: 'nequi', saldo: 0 }, { id: 'efectivo', tipo: 'efectivo', saldo: 0 }],
    cajitas: cajitas.map(c => ({ nombre: c.id.toUpperCase(), fecha: hoyStr, ...c })) });
  const inputs = Object.entries(lecturas).map(([id, value]) => ({ value, dataset: { chqCajita: id } }));
  app.document.querySelectorAll = sel => (String(sel).includes('data-chq-cajita') ? inputs : []);
  const toasts = [], dialogos = [], cerrados = [];
  let guardados = 0;
  app.toast = (msg, tipo) => toasts.push({ msg, tipo });
  app.dialogo = async (...a) => { dialogos.push(a); return dialogoRespuesta; };
  app.closeSheet = n => cerrados.push(n);
  app.save = () => { guardados++; };
  app.refresh = () => {};
  return { app, hoyStr, toasts, dialogos, cerrados, guardados: () => guardados,
    cajita: id => app.S.cajitas.find(c => c.id === id) };
}

describe('guardarChequeoNu — campos sin anotar', () => {
  test('una cajita real + otra que se tocó y quedó en 0,00: solo se guarda la real', async () => {
    const e = entornoChequeo({ cajitas: [{ id: 'a', saldo: 100000 }, { id: 'b', saldo: 500000 }], lecturas: { a: '100.500,00', b: '0,00' } });
    await e.app.guardarChequeoNu();
    assert.equal(e.cajita('a').saldo, 100500);
    assert.equal(e.cajita('b').saldo, 500000, 'la cajita sin anotar no se toca (antes quedaba en 0)');
    assert.deepEqual(plano(e.app.S.chequeosNu), [{ fecha: e.hoyStr, cajitaId: 'a', saldoReal: 100500 }]);
    assert.equal(e.guardados(), 1);
  });
  test('una cajita con saldo chico (< $1.000) tampoco se pone en 0 por tocarla', async () => {
    // Con el código anterior el aviso de "se aleja mucho" no saltaba por debajo de $1.000: se ponía en 0 en silencio.
    const e = entornoChequeo({ cajitas: [{ id: 'a', saldo: 100000 }, { id: 'b', saldo: 800 }], lecturas: { a: '100.000,00', b: '0,00' } });
    await e.app.guardarChequeoNu();
    assert.equal(e.cajita('b').saldo, 800);
    assert.equal(e.app.S.chequeosNu.some(c => c.cajitaId === 'b'), false);
  });
  test('todo en 0,00 o vacío: avisa y no guarda nada', async () => {
    for (const lecturas of [{ a: '0,00', b: '0,00' }, { a: '', b: '' }]) {
      const e = entornoChequeo({ cajitas: [{ id: 'a', saldo: 1000 }, { id: 'b', saldo: 2000 }], lecturas });
      await e.app.guardarChequeoNu();
      assert.match(e.toasts.at(-1).msg, /No pusiste ningún saldo/);
      assert.equal(e.guardados(), 0);
      assert.equal(e.cerrados.length, 0);
      assert.equal(e.app.S.chequeosNu.length, 0);
      assert.equal(e.cajita('a').saldo, 1000);
    }
  });
});

describe('guardarChequeoNu — comportamiento que no debe cambiar', () => {
  test('una lectura normal corrige el saldo, la fecha y guarda el chequeo', async () => {
    const e = entornoChequeo({ cajitas: [{ id: 'a', saldo: 100000, fecha: '2026-01-01' }], lecturas: { a: '100.300,00' } });
    // fecha vieja → el calculado ya incluye intereses de meses: se acepta lo anotado de todos modos
    await e.app.guardarChequeoNu();
    assert.equal(e.cajita('a').saldo, 100300);
    assert.equal(e.cajita('a').fecha, e.hoyStr);
    assert.equal(e.app.S.chequeosNu.length, 1);
  });
  test('un valor muy lejano al calculado pide confirmación; si se cancela no se guarda nada', async () => {
    const e = entornoChequeo({ cajitas: [{ id: 'a', saldo: 100000 }], lecturas: { a: '900.000,00' }, dialogoRespuesta: false });
    await e.app.guardarChequeoNu();
    assert.equal(e.dialogos.length, 1);
    assert.equal(e.cajita('a').saldo, 100000);
    assert.equal(e.app.S.chequeosNu.length, 0);
    assert.equal(e.guardados(), 0);
  });
  test('si se confirma el aviso, se guarda', async () => {
    const e = entornoChequeo({ cajitas: [{ id: 'a', saldo: 100000 }], lecturas: { a: '900.000,00' }, dialogoRespuesta: true });
    await e.app.guardarChequeoNu();
    assert.equal(e.cajita('a').saldo, 900000);
    assert.equal(e.app.S.chequeosNu.length, 1);
  });
  test('un segundo chequeo el mismo día reemplaza al primero (no duplica)', async () => {
    const e = entornoChequeo({ cajitas: [{ id: 'a', saldo: 100000 }], lecturas: { a: '100.100,00' } });
    await e.app.guardarChequeoNu();
    e.app.document.querySelectorAll = () => [{ value: '100.200,00', dataset: { chqCajita: 'a' } }];
    await e.app.guardarChequeoNu();
    assert.equal(e.app.S.chequeosNu.length, 1);
    assert.equal(e.app.S.chequeosNu[0].saldoReal, 100200);
  });
});

describe('confirmarAgregarDinero', () => {
  function entornoAgregar({ monto, desc = 'Mesada' }) {
    const app = loadApp(ARCHIVOS, { permissive: true });
    Object.assign(app.S, { cajitas: [], movimientos: [], gastosVar: [],
      cuentas: [{ id: 'nequi', tipo: 'nequi', saldo: 1000 }, { id: 'efectivo', tipo: 'efectivo', saldo: 0 }] });
    const el = (x = {}) => ({ value: '', textContent: '', innerHTML: '', checked: false, style: {}, focus() {}, ...x });
    const campos = { adTitle: el(), adSaldoActual: el(), adMonto: el(), adDesc: el(), adFecha: el(), adNota: el(), adPreview: el(), adEsApertura: el(), adDescLabel: el() };
    app.document.getElementById = id => campos[id] || null;
    const toasts = [], cerrados = [];
    let guardados = 0;
    app.toast = (msg, tipo) => toasts.push({ msg, tipo });
    app.closeSheet = n => cerrados.push(n);
    app.openSheet = () => {};
    app.save = () => { guardados++; };
    app.refresh = () => {};
    app.getSaldoActual = f => app.getSaldoFuente(f);
    app.fuenteLabel = f => ({ nequi: 'Nequi' }[f] || f);
    app.abrirAgregarDinero('nequi', 'Nequi');
    guardados = 0;
    campos.adMonto.value = monto; campos.adDesc.value = desc; campos.adFecha.value = '2026-10-05';
    return { app, toasts, cerrados, guardados: () => guardados, saldo: () => app.getSaldoFuente('nequi') };
  }
  test('un monto válido suma, registra y cierra', () => {
    const e = entornoAgregar({ monto: '500,00' });
    e.app.confirmarAgregarDinero();
    assert.equal(e.saldo(), 1500);
    assert.equal(e.app.S.movimientos.length, 1);
    assert.deepEqual(plano(e.cerrados), ['agregar-dinero']);
  });
  test('monto 0 o vacío avisa (antes: no pasaba nada y no se sabía por qué) y no mueve nada', () => {
    for (const monto of ['0,00', '']) {
      const e = entornoAgregar({ monto });
      e.app.confirmarAgregarDinero();
      assert.equal(e.toasts.at(-1).msg, 'Ingresa un monto válido');
      assert.equal(e.saldo(), 1000);
      assert.equal(e.app.S.movimientos.length, 0);
      assert.equal(e.guardados(), 0);
    }
  });
  test('sin descripción pide la descripción', () => {
    const e = entornoAgregar({ monto: '500,00', desc: '' });
    e.app.confirmarAgregarDinero();
    assert.match(e.toasts.at(-1).msg, /Describe/);
    assert.equal(e.saldo(), 1000);
  });
});
