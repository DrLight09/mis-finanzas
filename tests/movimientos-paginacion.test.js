// Paginación «Mostrar más» de la lista de movimientos de una cuenta (js/modules/cuentas.js).
const test = require('node:test'), { describe } = test;
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadApp } = require('./support/load-app');
const { createFakeDom } = require('./support/fake-dom');
const RAIZ = path.join(__dirname, '..');
const core = f => path.join(RAIZ, 'js', 'core', f), modulo = f => path.join(RAIZ, 'js', 'modules', f);

function entorno(n) {
  const app = loadApp([core('core-state.js'), core('html-tag.js'), core('events.js'), modulo('cuentas.js'), modulo('nu.js')], { permissive: true });
  const dom = createFakeDom({ 'det-cuenta-movs': {} });
  app.document = dom.document;
  const el = dom.document.getElementById('det-cuenta-movs');
  el.closest = () => null;
  app.renderMovimientosFiltros = () => {};
  const movs = Array.from({ length: n }, (_, i) => ({ tipo: 'gasto', fecha: '2026-01-' + String(1 + (i % 28)).padStart(2, '0'), desc: 'Compra ' + i, monto: -1000, fuente: 'cuenta:nequi', _movimientoId: 'm' + i, _fuenteOrigen: 'cuenta:nequi' }));
  const pintar = () => app.renderMovimientosCuenta('det-cuenta-movs', movs, '#0af', 'cuenta:nequi', 'movs-filtros-cuenta');
  const filas = () => (el.innerHTML.match(/data-movimiento-id=/g) || []).length;
  return { app, el, pintar, filas };
}

describe('lista de movimientos de una cuenta — paginación', () => {
  test('con muchas filas solo pinta la primera página y ofrece «Mostrar más» con cuántas faltan', () => {
    const { el, pintar, filas } = entorno(250);
    pintar();
    assert.equal(filas(), 100);
    assert.match(el.innerHTML, /Mostrar más \(150 restantes\)/);
    assert.match(el.innerHTML, /cuentas:movimientosMas/);
  });
  test('con pocas filas pinta todas y no hay botón', () => {
    const { el, pintar, filas } = entorno(40);
    pintar();
    assert.equal(filas(), 40);
    assert.doesNotMatch(el.innerHTML, /Mostrar más/);
  });
  test('«Mostrar más» agrega otra página y al final desaparece el botón', () => {
    const { app, el, pintar, filas } = entorno(250);
    app.renderDetalleCuenta = pintar; // el refresco repinta el detalle
    pintar();
    app._movimientosMas('cuenta:nequi'); assert.equal(filas(), 200); assert.match(el.innerHTML, /50 restantes/);
    app._movimientosMas('cuenta:nequi'); assert.equal(filas(), 250); assert.doesNotMatch(el.innerHTML, /Mostrar más/);
  });
  test('cambiar un filtro vuelve a la primera página', () => {
    const { app, pintar, filas } = entorno(250);
    app.renderDetalleCuenta = pintar;
    pintar(); app._movimientosMas('cuenta:nequi'); assert.equal(filas(), 200);
    app._movimientosOnTipo('gasto', 'cuenta:nequi');
    assert.equal(filas(), 100);
  });
  test('las vistas que no son una cuenta (cajitas de Nu) pintan todo, sin botón que no repintaría', () => {
    const { app, el } = entorno(250);
    const movs = Array.from({ length: 250 }, (_, i) => ({ tipo: 'gasto', fecha: '2026-01-01', desc: 'x' + i, monto: -1, fuente: 'cajita:c1', _movimientoId: 'm' + i }));
    app.renderMovimientosCuenta('det-cuenta-movs', movs, '#0af', 'cajita:c1', 'movs-filtros-nu');
    assert.equal((el.innerHTML.match(/data-movimiento-id=/g) || []).length, 250);
    assert.doesNotMatch(el.innerHTML, /Mostrar más/);
  });
});
