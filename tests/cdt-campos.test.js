// tests/cdt-campos.test.js — validación de campos del CDT y edición de un CDT existente (cuentas.js)
// Corre con:  node --test tests/cdt-campos.test.js
// validarCamposCDT es pura y la usan crear y editar (misma regla en los dos). La edición no depende del saldo
// de la cajita: el capital ya está invertido. Antes, al editar corrían a la vez el listener de "crear" y el
// de "guardar": con la cajita en $0 salía "Saldo insuficiente" y, con saldo, se creaba un CDT duplicado.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const RAIZ = path.join(__dirname, '..');
const core = f => path.join(RAIZ, 'js', 'core', f);
const modulo = f => path.join(RAIZ, 'js', 'modules', f);
const ARCHIVOS = [core('core-state.js'), core('calc-helpers.js'), core('cuenta-efectos.js'), modulo('cuentas.js')];
const plano = x => JSON.parse(JSON.stringify(x));

const AHORA = new Date('2026-10-05T12:00:00');
const base = { tasa: '9,25', rte: '4,00', inicio: '2026-10-01', vence: '2027-01-01', tasaDefecto: 9.25, rteDefecto: 4, inicioDefecto: '2026-10-05' };

describe('validarCamposCDT', () => {
  const app = loadApp(ARCHIVOS, { permissive: true });
  const v = (campos) => plano(app.validarCamposCDT({ ...base, ...campos }, AHORA));

  test('campos válidos: devuelve tasa, rte y fechas ya interpretadas', () => {
    assert.deepEqual(v({}), { ok: true, tasa: 9.25, rte: 4, inicio: '2026-10-01', vence: '2027-01-01' });
  });
  test('tasa vacía usa el valor por defecto; tasa 0, negativa o texto se rechaza (no se vuelve 9,25 en silencio)', () => {
    assert.equal(v({ tasa: '' }).tasa, 9.25);
    assert.equal(v({ tasa: '', tasaDefecto: 11.5 }).tasa, 11.5);
    for (const tasa of ['0', '0,00', 'abc', '-3']) {
      const r = v({ tasa });
      assert.equal(r.ok, false, `tasa ${tasa}`);
      assert.match(r.mensaje, /tasa/i);
    }
  });
  test('RTE: vacía usa el defecto, 0 se respeta, punto o coma valen', () => {
    assert.equal(v({ rte: '' }).rte, 4);
    assert.equal(v({ rte: '', rteDefecto: 7 }).rte, 7);
    assert.equal(v({ rte: '0' }).rte, 0);
    assert.equal(v({ rte: '3,5' }).rte, 3.5);
    assert.equal(v({ rte: '3.5' }).rte, 3.5);
  });
  test('RTE no numérica, negativa o mayor a 100 se rechaza', () => {
    for (const rte of ['abc', '-1', '4%', '4,5,6']) assert.match(v({ rte }).mensaje, /no es un número válido/, `rte ${rte}`);
    assert.match(v({ rte: '150' }).mensaje, /no puede pasar de 100/);
  });
  test('apertura vacía usa el defecto; una apertura futura se rechaza', () => {
    assert.equal(v({ inicio: '' }).inicio, '2026-10-05');
    assert.match(v({ inicio: '2030-01-01' }).mensaje, /no puede ser futura/);
  });
  test('vencimiento obligatorio y posterior a la apertura (el mismo día tampoco vale)', () => {
    assert.match(v({ vence: '' }).mensaje, /Debes definir la fecha de vencimiento/);
    assert.match(v({ vence: '2026-10-01' }).mensaje, /posterior a la apertura/);
    assert.match(v({ vence: '2026-09-01' }).mensaje, /posterior a la apertura/);
    assert.equal(v({ vence: '2026-10-02' }).ok, true);
  });
});

describe('editar un CDT existente', () => {
  function domFalso(app) {
    const cache = {};
    const el = () => ({ value: '', textContent: '', innerHTML: '', checked: false, style: {}, dataset: {}, readOnly: false, focus() {}, addEventListener() {},
      dispatchEvent() {}, querySelector: () => null, querySelectorAll: () => [], classList: { add() {}, remove() {}, toggle() {}, contains: () => false } });
    app.document.getElementById = id => (cache[id] = cache[id] || el());
    return cache;
  }
  function entorno({ saldo }) {
    const app = loadApp(ARCHIVOS, { permissive: true });
    Object.assign(app.S, { movimientos: [], gastosVar: [], encargos: [], historialTasasNu: [],
      cuentas: [{ id: 'nequi', tipo: 'nequi', saldo: 0 }, { id: 'efectivo', tipo: 'efectivo', saldo: 0 }],
      cajitas: [{ id: 'a', nombre: 'A', saldo, fecha: app.hoy(), tasa: 9.25,
        cdts: [{ id: 'd1', monto: 1000000, tasa: 9.25, rte: 4, inicio: '2026-01-01', vence: '2027-01-01' }] }] });
    const campos = domFalso(app);
    const toasts = [], cerrados = [];
    let guardados = 0;
    app.toast = (msg, tipo) => toasts.push({ msg, tipo });
    app.dialogo = async () => true;
    app.closeSheet = n => cerrados.push(n);
    app.openSheet = () => {};
    app.save = () => { guardados++; };
    app.refresh = () => {};
    return { app, campos, toasts, cerrados, guardados: () => guardados, cajita: () => app.S.cajitas[0], cdt: () => app.S.cajitas[0].cdts[0] };
  }
  async function abrirEdicion(e) {
    await e.app.editarCDT('a', 'd1');
    assert.equal(e.campos.cdt_monto.readOnly, true, 'el capital queda de solo lectura');
    assert.equal(e.campos.cdtSheetTitle.textContent, 'Editar CDT');
    assert.equal(e.campos['btn-confirmar-crear-cdt'].textContent, 'Guardar cambios');
  }

  for (const saldo of [0, 5000000]) {
    test(`con la cajita en $${saldo}: solo "CDT actualizado", sin crear otro CDT ni mover plata`, async () => {
      const e = entorno({ saldo }); await abrirEdicion(e);
      e.campos.cdt_tasa.value = '10,5'; e.campos.cdt_vence.value = '2027-06-01';
      e.app.confirmarSheetCDT();
      assert.deepEqual(plano(e.toasts), [{ msg: 'CDT actualizado', tipo: 'ok' }]);
      assert.equal(e.cajita().cdts.length, 1);
      assert.equal(e.cajita().saldo, saldo);
      assert.equal(e.cdt().tasa, 10.5);
      assert.equal(e.cdt().vence, '2027-06-01');
      assert.equal(e.cdt().monto, 1000000, 'el capital no cambia');
      assert.deepEqual(plano(e.cerrados), ['crear-cdt']);
      assert.equal(e.campos['btn-confirmar-crear-cdt'].textContent, 'Crear CDT', 'el sheet vuelve a modo crear');
    });
  }
  test('un error de validación no modifica el CDT y el sheet sigue abierto para corregir', async () => {
    for (const [campo, valor] of [['cdt_vence', '2026-01-01'], ['cdt_vence', ''], ['cdt_rte', 'abc'], ['cdt_rte', '150'], ['cdt_tasa', '0'], ['cdt_inicio', '2030-01-01']]) {
      const e = entorno({ saldo: 0 }); await abrirEdicion(e);
      e.campos[campo].value = valor;
      e.app.confirmarSheetCDT();
      assert.equal(e.toasts.at(-1).tipo, 'err', `${campo}=${valor}`);
      assert.equal(e.cdt().tasa, 9.25, `${campo}=${valor}`);
      assert.equal(e.cerrados.length, 0, `${campo}=${valor}: no se cierra`);
      assert.equal(e.guardados(), 0, `${campo}=${valor}: no se guarda`);
    }
  });
  test('la RTE 0 se acepta al editar', async () => {
    const e = entorno({ saldo: 0 }); await abrirEdicion(e);
    e.campos.cdt_rte.value = '0'; e.app.confirmarSheetCDT();
    assert.equal(e.cdt().rte, 0);
  });
  test('cancelar la edición y abrir "crear": el sheet vuelve a modo crear y no pisa el CDT anterior', async () => {
    const e = entorno({ saldo: 5000000 }); await abrirEdicion(e);
    e.app.abrirCrearCDT('a');
    assert.equal(e.campos.cdt_monto.readOnly, false);
    assert.equal(e.campos.cdtSheetTitle.textContent, 'Crear CDT en cajita');
    assert.equal(e.campos['btn-confirmar-crear-cdt'].textContent, 'Crear CDT');
    e.campos.cdt_monto.value = '200.000,00'; e.campos.cdt_tasa.value = '8';
    e.campos.cdt_inicio.value = '2026-10-01'; e.campos.cdt_vence.value = '2027-06-01'; e.campos.cdt_rte.value = '4';
    e.app.confirmarSheetCDT();
    assert.equal(e.cajita().cdts.length, 2);
    assert.equal(Math.round(e.cajita().saldo), 4800000);
    assert.equal(e.cajita().cdts[0].tasa, 9.25, 'el CDT existente no se toca');
  });
});
