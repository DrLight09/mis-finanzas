// tests/ingreso-real.test.js — UNA definición de "ingreso real" (core-state.js)
// Corre con:  node --test tests/ingreso-real.test.js
// Fija qué cuenta como ingreso y comprueba que Inicio, Análisis (vía
// ingresosRealesDelMes) y Wrapped dan la MISMA cifra con los mismos datos.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const RAIZ = path.join(__dirname, '..');
const core = f => path.join(RAIZ, 'js', 'core', f);
const modulo = f => path.join(RAIZ, 'js', 'modules', f);
const BASE = [core('core-state.js'), core('calc-helpers.js'), core('cuenta-efectos.js')];
const TODO = [...BASE, modulo('cuentas.js'), modulo('inicio.js'), modulo('analisis.js'), core('wrapped-gate.js'), modulo('wrapped.js')];
const MES = '2026-10';

const cuentas = (custom = []) => [
  { id: 'nequi', tipo: 'nequi', saldo: 0 }, { id: 'efectivo', tipo: 'efectivo', saldo: 0 }, ...custom,
];
const mov = (id, monto, extra = {}) => ({ id, tipo: 'entrada', monto, fecha: '2026-10-05', fuente: 'nequi', desc: 'x', ...extra });

function app(archivos = BASE, estado = {}) {
  const a = loadApp(archivos, { permissive: true });
  Object.assign(a.S, { cajitas: [], deudores: [], misDeudas: [], ingresosFijos: [], gastosVar: [], gastosFijos: [], cuentas: cuentas(), movimientos: [] }, estado);
  return a;
}
// Los arrays nacidos dentro del vm tienen otro prototipo: se devuelven como array normal.
const ids = a => Array.from(a.entradasIngresoReal(), m => m.id).sort();

describe('qué cuenta como ingreso real (S.movimientos)', () => {
  test('sueldo, regalo y entradas a cuenta o cajita cuentan', () => {
    const a = app(BASE, { movimientos: [mov('a', 1), mov('b', 2, { fuente: 'efectivo' }), mov('c', 3, { fuente: 'cajita:k' }), mov('d', 4, { fuente: 'custom:z' })] });
    assert.deepEqual(ids(a), ['a', 'b', 'c', 'd']);
  });
  test('SIN cuenta ni bandera cuenta (regla única: no depende de la cuenta)', () => {
    const a = app(BASE, { movimientos: [mov('a', 11, { fuente: '' }), mov('b', 12, { fuente: undefined })] });
    assert.deepEqual(ids(a), ['a', 'b']);
  });
  test('perdón recibido y extra/margen de préstamo (espejos que SÍ son plata nueva) cuentan', () => {
    const a = app(BASE, { movimientos: [
      mov('perdon', 1, { fuente: '', _origenSeccion: 'Prestado · Yo debo', _esPerdonRecibido: true }),
      mov('extra', 2, { _secundario: true, _esEspejo: true, _origenSeccion: 'Prestado · Me deben', _esExtraIngreso: true }),
      mov('dif', 3, { _encMovId: 'e1', _esDiferencialEncargo: true }),
    ] });
    assert.deepEqual(ids(a), ['dif', 'extra', 'perdon']);
  });
  test('espejos y movimientos que NO son ingreso se excluyen', () => {
    const a = app(BASE, { movimientos: [
      mov('mesada', 1, { _origenSeccion: 'Mesada' }),
      mov('prestado', 2, { _origenSeccion: 'Prestado · Me deben' }),
      mov('espejo-nuevo', 3, { _esEspejo: true }),
      mov('repos', 4, { _esReposicionCP: true }),
      mov('repos-viejo', 5, { desc: 'Reposición: algo' }),
      mov('tc', 6, { desc: 'Para pagar TC (Nu)' }),
      mov('margen-viejo', 7, { desc: 'Margen de encargo' }),
      mov('intercambio', 8, { _esIntercambioEncargo: true }),
      mov('encmov', 9, { _encMovId: 'e1' }),
      mov('alcancia', 10, { desc: 'Alcancía destapada' }),
      mov('salida', 11, { tipo: 'salida' }),
    ] });
    assert.deepEqual(ids(a), []);
  });
  test('_esEspejo no anula una bandera de ingreso (la bandera tiene prioridad)', () => {
    const a = app(BASE, { movimientos: [mov('x', 1, { _esEspejo: true, _esExtraIngreso: true })] });
    assert.deepEqual(ids(a), ['x']);
  });
});

describe('cuentas personalizadas (c.movimientos)', () => {
  const custom = movs => cuentas([{ id: 'z', tipo: 'custom', saldo: 0, movimientos: movs }]);
  test('un ingreso que solo vive en la cuenta cuenta', () => {
    const a = app(BASE, { cuentas: custom([{ id: 'c1', tipo: 'ingreso', monto: 5, fecha: '2026-10-03' }]) });
    assert.deepEqual(ids(a), ['c1']);
  });
  test('espejo en la cuenta no cuenta; espejo con extra de ingreso sí', () => {
    const a = app(BASE, { cuentas: custom([
      { id: 'e1', tipo: 'ingreso', monto: 5, fecha: '2026-10-03', _esEspejo: true, _origenSeccion: 'Prestado · Me deben' },
      { id: 'e2', tipo: 'ingreso', monto: 6, fecha: '2026-10-03', _esEspejo: true, _esExtraIngreso: true },
    ]) });
    assert.deepEqual(ids(a), ['e2']);
  });
  test('datos viejos con gemelo (mismo id en las dos listas) cuentan UNA vez', () => {
    const a = app(BASE, {
      cuentas: custom([{ id: 'g', tipo: 'ingreso', monto: 1000, fecha: '2026-10-02' }]),
      movimientos: [mov('g', 1000, { fuente: 'custom:z', fecha: '2026-10-02' })],
    });
    assert.deepEqual(ids(a), ['g']);
    assert.equal(a.ingresosRealesDelMes(MES), 1000);
  });
  test('un gemelo en otra cuenta personalizada tampoco se cuenta dos veces', () => {
    const a = app(BASE, {
      cuentas: cuentas([{ id: 'z', tipo: 'custom', movimientos: [{ id: 'g', tipo: 'ingreso', monto: 7, fecha: '2026-10-02' }] }, { id: 'y', tipo: 'custom', movimientos: [] }]),
      movimientos: [mov('g', 7, { fuente: 'custom:y', fecha: '2026-10-02' })],
    });
    assert.equal(a.ingresosRealesDelMes(MES), 7);
  });
  test('una entrada a "custom:" cuyo id NO está en la cuenta (datos nuevos) cuenta', () => {
    const a = app(BASE, { cuentas: custom([]), movimientos: [mov('n', 9, { fuente: 'custom:z' })] });
    assert.deepEqual(ids(a), ['n']);
  });
});

describe('ingresosRealesDelMes', () => {
  test('filtra por mes y suma montos', () => {
    const a = app(BASE, { movimientos: [mov('a', 100), mov('b', 50, { fecha: '2026-09-30' }), mov('c', 5, { fecha: '2026-10-31' })] });
    assert.equal(a.ingresosRealesDelMes('2026-10'), 105);
    assert.equal(a.ingresosRealesDelMes('2026-09'), 50);
    assert.equal(a.ingresosRealesDelMes('2026-08'), 0);
  });
  test('acepta un estado distinto del global (Wrapped trabaja sobre el S que recibe)', () => {
    const a = app(BASE, { movimientos: [mov('a', 100)] });
    assert.equal(a.ingresosRealesDelMes(MES, { cuentas: cuentas(), movimientos: [mov('z', 7)] }), 7);
  });
  test('estado vacío o sin listas no revienta', () => {
    const a = app(BASE);
    assert.equal(a.ingresosRealesDelMes(MES, {}), 0);
  });
});

describe('registrarMovEspejo: un espejo nuevo nace marcado', () => {
  test('espejo a Nequi/Efectivo, cajita y personalizada lleva _esEspejo y no cuenta', () => {
    const a = app(BASE, { cajitas: [{ id: 'k', historial: [] }], cuentas: cuentas([{ id: 'z', tipo: 'custom', movimientos: [] }]) });
    for (const cuenta of ['nequi', 'efectivo', 'cajita:k', 'custom:z']) {
      const id = a.registrarMovEspejo({ cuenta, flujo: 'entrada', monto: 10, fecha: '2026-10-05', desc: 'abono', origen: 'Modulo Nuevo' });
      assert.ok(id, cuenta);
    }
    const marcados = [a.S.movimientos, a.S.cajitas[0].historial, a.getCuentaCustom('z').movimientos].flat();
    assert.equal(marcados.length, 4);
    assert.ok(marcados.every(m => m._esEspejo === true && m._secundario === true));
    assert.equal(a.ingresosRealesDelMes(MES), 0, 'ni el de un módulo con otro _origenSeccion (no depende del prefijo "Prestado")');
  });
  test('con extra de ingreso (extra/perdón/diferencial) sí cuenta, aunque lleve _esEspejo', () => {
    const a = app(BASE, { cuentas: cuentas([{ id: 'z', tipo: 'custom', movimientos: [] }]) });
    a.registrarMovEspejo({ cuenta: 'nequi', flujo: 'entrada', monto: 10, fecha: '2026-10-05', desc: 'extra', origen: 'Prestado · Me deben', extra: { _esExtraIngreso: true } });
    a.registrarMovEspejo({ cuenta: 'custom:z', flujo: 'entrada', monto: 20, fecha: '2026-10-05', desc: 'extra', origen: 'Prestado · Me deben', extra: { _esExtraIngreso: true } });
    assert.equal(a.ingresosRealesDelMes(MES), 30);
  });
});

describe('las tres pantallas dan la misma cifra', () => {
  function escenario() {
    const a = app(TODO, {
      cuentas: cuentas([{ id: 'ahorro', tipo: 'custom', saldo: 0, movimientos: [
        { id: 'c1', tipo: 'ingreso', monto: 1000, fecha: '2026-10-02' },
        { id: 'c2', tipo: 'ingreso', monto: 2000, fecha: '2026-10-03' },
        { id: 'c3', tipo: 'ingreso', monto: 3000, fecha: '2026-10-04', _esEspejo: true, _esExtraIngreso: true },
        { id: 'c4', tipo: 'ingreso', monto: 4000, fecha: '2026-10-05', _esEspejo: true, _origenSeccion: 'Prestado · Me deben' },
      ] }]),
      movimientos: [
        mov('m1', 100000, { fecha: '2026-10-01' }),
        mov('m2', 20000, { fuente: 'efectivo', fecha: '2026-10-01' }),
        mov('c1', 1000, { fuente: 'custom:ahorro', fecha: '2026-10-02' }),
        mov('m4', 8000, { _origenSeccion: 'Mesada' }),
        mov('m5', 9000, { _esEspejo: true, _origenSeccion: 'Prestado · Me deben' }),
        mov('m7', 700, { fuente: '', _esPerdonRecibido: true, _origenSeccion: 'Prestado · Yo debo' }),
        mov('m10', 11, { fuente: '' }),
        mov('m9', 900, { fecha: '2026-09-30' }),
      ],
    });
    a.mesActual = () => MES; a.window.mesActual = a.mesActual;
    return a;
  }
  const ESPERADO_OCT = 100000 + 20000 + 1000 + 2000 + 3000 + 700 + 11; // 126.711
  test('Inicio, ingresosRealesDelMes (Análisis) y Wrapped coinciden', () => {
    const a = escenario();
    assert.equal(a.ingresosRealesDelMes(MES), ESPERADO_OCT);
    assert.equal(a.calcHealthScore().ingresosMes, ESPERADO_OCT);
    const w = a._wrappedInternals._wrappedCalcularPeriodo(a.S, 'mes', MES, '2026');
    assert.equal(w.totalIngresos, ESPERADO_OCT);
    assert.equal(w.nIngresos, 7);
  });
  test('Wrapped del año suma todos los meses con la misma regla', () => {
    const a = escenario();
    const w = a._wrappedInternals._wrappedCalcularPeriodo(a.S, 'anio', null, '2026');
    assert.equal(w.totalIngresos, ESPERADO_OCT + 900);
  });
});
