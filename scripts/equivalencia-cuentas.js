'use strict';
// Verifica el Paso 5 de js/modules/cuentas.js: ejecuta sus funciones de render con el archivo ORIGINAL (js.zip, antes de convertir)
// y con el actual, sobre los mismos datos, y exige el mismo estilo efectivo en cada elemento (scripts/equivalencia-estilos.js).
// Uso: node scripts/equivalencia-cuentas.js <cuentas.js original> [cuentas.js nuevo] [styles.css nuevo]
const path = require('path');
const { loadApp } = require('../tests/support/load-app');
const { compararHtml } = require('./equivalencia-estilos');
const RAIZ = path.join(__dirname, '..');
const core = f => path.join(RAIZ, 'js', 'core', f), modulo = f => path.join(RAIZ, 'js', 'modules', f);
const [oJs, nJs = modulo('cuentas.js'), css = path.join(RAIZ, 'css', 'styles.css')] = process.argv.slice(2);
if (!oJs) { console.error('falta el cuentas.js original'); process.exit(2); }
const BASE = [core('core-state.js'), core('html-tag.js'), core('periodo.js'), core('nu-calc.js'), core('calc-helpers.js'), core('cuenta-efectos.js'), modulo('nu.js')];

function entorno(jsPath) {
  const app = loadApp([...BASE, jsPath], { permissive: true });
  Object.assign(app.S, { movimientos: [], gastosVar: [], encargos: [], transferencias: [], modulos: {}, spotify: { personas: [], historial: [] }, deudores: [], misDeudas: [],
    cuentas: [{ id: 'nequi', tipo: 'nequi', saldo: 120000 }, { id: 'efectivo', tipo: 'efectivo', saldo: 5000 },
      { id: 'z', tipo: 'custom', nombre: 'Banco Z', icono: 'bancolombia', color: '#336699', saldo: 40000 }, { id: 'y', tipo: 'custom', nombre: 'Mi Caja', icono: 'otro', saldo: 700 }],
    cajitas: [{ id: 'k1', nombre: 'Viaje', saldo: 90000, fecha: '2026-10-01' }] });
  const els = {};
  const el = () => ({ value: '', textContent: '', innerHTML: '', checked: false, placeholder: '', style: { setProperty() {} }, dataset: {}, focus() {}, addEventListener() {}, dispatchEvent() {},
    querySelector: () => null, querySelectorAll: () => [], closest: () => null, classList: { add() {}, remove() {}, toggle() {}, contains: () => false } });
  app.document.getElementById = id => (els[id] = els[id] || el());
  app.document.querySelectorAll = () => [];
  app.toast = () => {}; app.openSheet = () => {};
  return { app, els };
}
const A = entorno(oJs), B = entorno(nJs);
let fallos = 0, n = 0;
function cmp(nombre, a, b) {
  n++; if (!a || !b) { console.log('FALLA sin salida:', nombre); fallos++; return; }
  const r = compararHtml(`<div>${a}</div>`, `<div>${b}</div>`, css);
  const otros = r.avisos.filter(x => !x.includes('@media'));
  if (r.diferencias.length || otros.length) { fallos++; console.log('FALLA', nombre, JSON.stringify(r.diferencias.slice(0, 4), null, 1), otros.slice(0, 3)); }
  else console.log('ok   ', nombre, `(${r.elementos} elementos)`);
}
const ambos = (nombre, fn) => cmp(nombre, fn(A.app, A.els), fn(B.app, B.els));
const innerDe = (id, f) => (app, els) => { els[id] = undefined; f(app); return els[id] && els[id].innerHTML; };

// Íconos, selector de cuentas y título del detalle
for (const f of ['nequi', 'efectivo', 'custom:z', 'custom:y']) {
  ambos('ícono ' + f, app => app._descriptorCuenta(f).iconoHtml(30));
  ambos('título ' + f, app => app._tituloCuentaHtml(app._descriptorCuenta(f)));
  ambos('selector ' + f, app => app._cuentaSelectorHtml(app._descriptorCuenta(f)));
}
ambos('ícono efectivo (selector)', app => app._iconoEfectivo(34));
// Cuadrícula de íconos con cada opción seleccionada
for (const id of ['nequi', 'nu', 'bancolombia', 'daviplata']) ambos('cuadrícula de íconos, sel=' + id, (app, els) => { app.selIconoNC(id); els['nc-icon-grid'] = undefined; app.renderIconGrid(); return els['nc-icon-grid'].innerHTML; });

// Historial de movimientos: una fila de cada clase
const D = n => '2026-10-0' + n;
const movs = [
  { tipo: 'apertura', monto: 50000, fecha: D(1), desc: 'Saldo inicial', fuente: 'nequi', _movId: 'a1' },
  { tipo: 'ingreso', monto: 200000, fecha: D(2), desc: 'Sueldo', fuente: 'nequi', _movId: 'i1', nota: 'quincena' },
  { tipo: 'gasto', monto: -15000, fecha: D(2), desc: 'Almuerzo', fuente: 'nequi', _movId: 'g1', cat: 'Comida' },
  { tipo: 'salida_manual', monto: -8000, fecha: D(3), desc: 'Retiro', fuente: 'nequi', _movId: 's1' },
  { tipo: 'transferencia', monto: -30000, fecha: D(3), desc: 'A Banco Z', fuente: 'nequi', _fuenteOrigen: 'nequi', _fuenteDestino: 'custom:z', _movId: 't1' },
  { tipo: 'prestamo', monto: -9000, fecha: D(3), desc: 'Préstamo auto', fuente: 'nequi', _secundario: true, _movId: 'p1', _origenSeccion: 'Prestado' },
  { tipo: 'alcancia', monto: -44, fecha: D(3), desc: 'Depósito', fuente: 'nequi', _alcOculto: true, _secundario: true, _origen: 'Alcancía oculta' },
  { tipo: 'ingreso', monto: 600, fecha: D(4), desc: 'Interés', fuente: 'cajita:k1', _movId: 'c1' },
  { tipo: 'abono', monto: 10, fecha: D(4), desc: 'Abono sin id', fuente: '' },
];
ambos('historial: todas las filas', (app, els) => { els['hist'] = undefined; app.renderMovsCuenta('hist', JSON.parse(JSON.stringify(movs)), '#ff4da6', 'nequi', 'filtros-x'); return els['hist'].innerHTML; });
ambos('historial: filtros', (app, els) => { els['filtros-x'] = undefined; app.renderMovsFiltros('filtros-x', 'nequi', JSON.parse(JSON.stringify(movs)), '#ff4da6'); return els['filtros-x'].innerHTML; });
ambos('historial: con filtro de fechas (botón limpiar)', (app, els) => { app._getMovsFilter('nequi').desde = '2026-10-02'; els['filtros-x'] = undefined; app.renderMovsFiltros('filtros-x', 'nequi', JSON.parse(JSON.stringify(movs)), '#ff4da6'); return els['filtros-x'].innerHTML; });
ambos('historial: sin resultados', (app, els) => { app._getMovsFilter('nequi').desde = ''; app._getMovsFilter('nequi').q = 'zzzzzz'; els['hist'] = undefined; app.renderMovsCuenta('hist', JSON.parse(JSON.stringify(movs)), '#ff4da6', 'nequi', 'filtros-x'); return els['hist'].innerHTML; });
ambos('historial: vacío', (app, els) => { els['hist'] = undefined; app.renderMovsCuenta('hist', [], '#ff4da6', null, 'filtros-x'); return els['hist'].innerHTML; });

// Banner de saldo inicial: con y sin apertura
ambos('banner sin apertura', (app, els) => { els['b'] = undefined; app.renderBannerApertura('efectivo', { elId: 'b' }); return els['b'].innerHTML; });
for (const A_ of [A, B]) A_.app.S.movimientos.push({ id: 'ap1', tipo: 'apertura', fuente: 'nequi', monto: 77000, fecha: D(1), desc: 'Saldo inicial', clase: 'neutro' });
ambos('banner con apertura', (app, els) => { els['b'] = undefined; app.renderBannerApertura('nequi', { elId: 'b' }); return els['b'].innerHTML; });

// Etiqueta de "Agregar dinero" (con y sin la casilla de apertura)
for (const marcado of [true, false]) ambos('etiqueta de apertura, marcada=' + marcado, (app, els) => {
  els.chk = undefined; els.lbl = undefined; els.inp = undefined; app.document.getElementById('chk').checked = marcado;
  app._aperturaToggleUI({ chk: 'chk', lbl: 'lbl', inp: 'inp' }); return els.lbl.innerHTML; });

// Vista previa de transferir (normal, con saldo insuficiente)
for (const [nombre, monto] of [['normal', '1000'], ['saldo insuficiente', '99999999']]) ambos('transferir: ' + nombre, (app, els) => {
  for (const k of ['tr_origen', 'tr_destino', 'tr_monto', 'tr_preview']) els[k] = undefined;
  app.document.getElementById('tr_origen').value = 'nequi'; app.document.getElementById('tr_destino').value = 'efectivo'; app.document.getElementById('tr_monto').value = monto;
  app.actualizarTransfPreview(); return els.tr_preview.innerHTML; });

// Vista previa de "Corregir saldo inicial": está en un listener de document; se compara el fragmento
const fragViejo = `$50.000 <i class="fa-solid fa-arrow-right" style="margin:0 3px;font-size:10px;"></i> $60.000 (+$10.000)`;
const fragNuevo = `$50.000 <i class="fa-solid fa-arrow-right cuenta-flecha"></i> $60.000 (+$10.000)`;
cmp('corregir saldo inicial: flecha', fragViejo, fragNuevo);

console.log(`\n${n} comparaciones, ${fallos} con diferencias`); process.exit(fallos ? 1 : 0);
