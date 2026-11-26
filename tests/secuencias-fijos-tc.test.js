'use strict';
// Secuencias ALEATORIAS con las funciones REALES de gastos fijos y tarjetas de crédito, vigilando el libro después de CADA paso:
//   · pagar un gasto fijo con una cuenta (`abrirPagarGastoFijo` + `confirmarPagarGastoFijo`) o con la tarjeta (sube la deuda);
//   · pagar la tarjeta desde una cuenta (`abrirPagarTC` + `confirmarPagarTC`);
//   · comprar con la tarjeta como gasto variable (`addGastoVar` con la tarjeta como fuente; sube la deuda);
//   · eliminar un pago de gasto fijo (`eliminarMovimiento`, la ruta de la pantalla) o un pago de tarjeta (`eliminarPagoTC`).
// Tras cada paso: saldo de cada cuenta y deuda de la tarjeta == un modelo independiente; `pagosGastosFijos` == los gastos fijos que el modelo
// considera pagados este mes; Libro.verificar y Libro.verificarEspejo. Al final se elimina todo y todo vuelve al inicio. Semilla fija.
// Corre con:  node --test tests/secuencias-fijos-tc.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadApp } = require('./support/load-app');
const { createFakeDom } = require('./support/fake-dom');

const RAIZ = path.join(__dirname, '..');
const core = f => path.join(RAIZ, 'js', 'core', f), modulo = f => path.join(RAIZ, 'js', 'modules', f);
const ARCHIVOS = [core('core-state.js'), core('html-tag.js'), core('events.js'), core('periodo.js'), core('nu-calc.js'), core('calc-helpers.js'), core('cuenta-efectos.js'), core('fuentes-filtro.js'),
  modulo('tarjetas-credito.js'), modulo('nu.js'), modulo('cuentas.js'), core('split.js'), modulo('gastos.js'), core('movimientos.js')];
const CUENTAS = ['cuenta:nequi', 'cuenta:efectivo'];
const INICIAL = 9000000, DEUDA_INICIAL = 4000000;
const FIJOS = [{ id: 'f1', nombre: 'Renta', monto: 600000, cat: 'Vivienda' }, { id: 'f2', nombre: 'Internet', monto: 90000, cat: 'Servicios' }, { id: 'f3', nombre: 'Gym', monto: 120000, cat: 'Salud' }, { id: 'f4', nombre: 'Música', monto: 25000, cat: 'Ocio' }];
const clon = x => JSON.parse(JSON.stringify(x));

function entorno() {
  const app = loadApp(ARCHIVOS, { permissive: true });
  Object.assign(app.S, { modulos: {}, libro: [], movimientos: [], gastosVar: [], cajitas: [], transferencias: [], pagosGastosFijos: {}, tcMovimientos: [], gastosFijos: clon(FIJOS),
    cuentas: [{ id: 'nequi', tipo: 'billetera', nombre: 'Nequi' }, { id: 'efectivo', tipo: 'efectivo', nombre: 'Efectivo' }],
    tarjetasCredito: [{ id: 'tc1', nombre: 'Visa', banco: '', franquicia: '', color: '', cupo: 20000000, deuda: 0, estado: 'activa', cajitaId: '', saldoInicial: { id: 'si', monto: DEUDA_INICIAL, fecha: '2026-01-01', nota: 'Saldo inicial', eliminado: false }, compras: [], pagos: [], creadoEn: '2026-01-01' }] });
  // La protección por antigüedad (un pago viejo con varias operaciones de tarjeta posteriores queda BLOQUEADO a propósito) tiene sus propias
  // pruebas; aquí se desactiva para poder eliminar libremente y vigilar solo el libro.
  app.S.config = { proteccionAntiguedad: { diasAviso: 99999, diasBloqueo: 99999 } };
  app.Libro.hidratar(app.S);
  const campos = {};
  ['pgf-fuente', 'pgf-fecha', 'pgf-nota', 'pgf-title', 'pgf-monto', 'pgf-cat-badge', 'pgf-saldo-info', 'gv_desc', 'gv_monto', 'gv_fecha', 'gv_cat', 'gv_nota', 'gv_fuente', 'ptc_monto', 'ptc_fuente', 'ptc_fecha', 'ptc_nota', 'ptc-preview', 'ptc-deuda-total', 'ptc-fuente-saldo', 'pagar-tc-title']
    .forEach(id => { campos[id] = { value: '', textContent: '', innerHTML: '', style: {} }; });
  campos['pgf-error'] = { value: '', textContent: '', style: {} };
  const dom = createFakeDom(campos);
  app.document = dom.document;
  app.dialogo = async () => true; app.confirmarEliminar = async () => true; app.save = () => {}; app.refresh = () => {}; app.toast = () => {}; app.fuenteLabel = f => f;
  app.closeSheet = () => {}; app.openSheet = () => {}; app.renderTCScreen = () => {}; app.abrirDetalleTCSheet = () => {};
  app.confirmarBorrarMovimientoViejo = async () => true; app.avisarMovimientoBloqueado = async () => {}; // rama «movimiento viejo» de la protección por antigüedad: se acepta
  CUENTAS.forEach(c => app.sumarFuente(c, INICIAL, { origen: { modulo: 'test' } }));
  app.tcRecalcular(app.S.tarjetasCredito[0]);
  return { app, dom };
}
const campo = (dom, id, valor) => { dom.document.getElementById(id).value = valor; };
const boton = (tipo, id, fuente, monto, fecha) => { const item = { dataset: { movimientoId: id, movimientoTipo: tipo, movimientoFuente: fuente, movimientoMonto: String(monto), movimientoFecha: fecha } }; return { closest: () => item }; };
function netoPorRef(app) {
  const neto = new Map();
  app.S.libro.forEach(l => { const ref = l.origen && l.origen.ref; if (!ref) return; const k = ref + '|' + l.cuenta; neto.set(k, (neto.get(k) || 0) + Math.round(l.monto * 100)); });
  return Array.from(neto.entries()).filter(([, v]) => v !== 0).map(([k, v]) => k + '=' + v / 100);
}

async function correrSecuencia(semilla, pasos) {
  const { app, dom } = entorno();
  const HOY = app.hoy();
  const [anio, mesNum] = HOY.split('-').map(Number);
  const MES_ANTERIOR = new Date(Date.UTC(anio, mesNum - 2, 15)).toISOString().slice(0, 10); // un pago puede llevar fecha de OTRO mes que el que cubre
  let s = semilla;
  const azar = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const elegir = lista => lista[Math.floor(azar() * lista.length)];
  const modelo = { saldos: CUENTAS.map(() => INICIAL), deuda: DEUDA_INICIAL, pagados: new Set() };
  const vivos = [];   // { clase: 'fijo'|'pagoTc', id, ... , deshacer() }
  const revisar = (paso, que) => {
    const donde = `semilla ${semilla}, paso ${paso} (${que})`;
    assert.deepEqual(CUENTAS.map(c => app.getSaldoFuente(c)), modelo.saldos, `${donde}: el saldo no coincide con el modelo`);
    assert.equal(app.tcDeudaCalculada(app.S.tarjetasCredito[0]), modelo.deuda, `${donde}: la deuda de la tarjeta no coincide con el modelo`);
    assert.deepEqual(Object.keys(app.S.pagosGastosFijos).sort(), Array.from(modelo.pagados).sort(), `${donde}: gastos fijos marcados como pagados`);
    assert.equal(app.Libro.verificar(app.S).ok, true, `${donde}: el libro no cuadra con los saldos`);
    const espejo = app.Libro.verificarEspejo(app.S);
    assert.equal(espejo.ok, true, `${donde}: espejo roto ${JSON.stringify(espejo.huerfanas.slice(0, 2))}`);
  };
  const clave = f => f.id + '_' + app.mesActual();

  async function eliminar(v) {
    if (v.clase === 'fijo') {
      await app.eliminarMovimiento(boton('gasto', v.gastoId, v.fuente, v.monto, v.fecha));
      assert.equal(app.S.gastosVar.some(g => g.id === v.gastoId), false, `semilla ${semilla}: el pago del gasto fijo NO se eliminó (fuente ${v.fuente}, fecha ${v.fecha}, id ${v.gastoId})`);
    } else {
      await app.eliminarPagoTC('tc1', v.pagoId);
      assert.equal(app.S.tarjetasCredito[0].pagos.some(p => p.id === v.pagoId && !p.eliminado), false, `semilla ${semilla}: el pago de la tarjeta NO se eliminó (¿protección por antigüedad?)`);
    }
    v.deshacer();
  }

  for (let paso = 1; paso <= pasos; paso++) {
    const r = azar();
    if (r < 0.28) {                                   // pagar un gasto fijo (cuenta o tarjeta)
      const libres = FIJOS.filter(f => !modelo.pagados.has(clave(f)));
      if (!libres.length) continue;
      const f = elegir(libres), fuente = azar() < 0.7 ? elegir(CUENTAS) : 'tc:tc1';
      app.abrirPagarGastoFijo(f.id);
      const fecha = azar() < 0.35 ? MES_ANTERIOR : HOY;
      campo(dom, 'pgf-fuente', fuente); campo(dom, 'pgf-fecha', fecha);
      const antes = app.S.gastosVar.length;
      app.confirmarPagarGastoFijo();
      assert.equal(app.S.gastosVar.length, antes + 1, `semilla ${semilla}, paso ${paso}: el pago del gasto fijo no se creó`);
      const g = app.S.gastosVar[app.S.gastosVar.length - 1];
      const i = CUENTAS.indexOf(fuente);
      if (i >= 0) modelo.saldos[i] -= f.monto; else modelo.deuda += f.monto;
      modelo.pagados.add(clave(f));
      vivos.push({ clase: 'fijo', gastoId: g.id, fuente, fecha, monto: f.monto, deshacer() { if (i >= 0) modelo.saldos[i] += f.monto; else modelo.deuda -= f.monto; modelo.pagados.delete(clave(f)); } });
      revisar(paso, 'pagar gasto fijo');
    } else if (r < 0.50) {                            // pagar la tarjeta desde una cuenta
      const monto = (1 + Math.floor(azar() * 40)) * 10000, fuente = elegir(CUENTAS), i = CUENTAS.indexOf(fuente);
      if (monto > modelo.deuda) continue;
      app.abrirPagarTC('tc1');
      campo(dom, 'ptc_monto', String(monto) + ',00'); campo(dom, 'ptc_fuente', fuente); campo(dom, 'ptc_fecha', HOY); campo(dom, 'ptc_nota', '');
      const antes = app.S.tarjetasCredito[0].pagos.length;
      app.confirmarPagarTC();
      assert.equal(app.S.tarjetasCredito[0].pagos.length, antes + 1, `semilla ${semilla}, paso ${paso}: el pago de la tarjeta no se creó`);
      const pago = app.S.tarjetasCredito[0].pagos[app.S.tarjetasCredito[0].pagos.length - 1];
      modelo.saldos[i] -= monto; modelo.deuda -= monto;
      vivos.push({ clase: 'pagoTc', pagoId: pago.id, deshacer() { modelo.saldos[i] += monto; modelo.deuda += monto; } });
      revisar(paso, 'pagar tarjeta');
    } else if (r < 0.72) {                            // comprar con la tarjeta (gasto variable)
      const monto = (1 + Math.floor(azar() * 60)) * 5000, fecha = azar() < 0.35 ? MES_ANTERIOR : HOY;
      campo(dom, 'gv_fuente', 'tc:tc1'); campo(dom, 'gv_monto', String(monto) + ',00'); campo(dom, 'gv_desc', 'Compra'); campo(dom, 'gv_cat', 'Comida'); campo(dom, 'gv_fecha', fecha);
      const antes = app.S.gastosVar.length, comprasAntes = app.S.tarjetasCredito[0].compras.length;
      app.addGastoVar();
      assert.equal(app.S.gastosVar.length, antes + 1, `semilla ${semilla}, paso ${paso}: la compra con tarjeta no se creó`);
      assert.equal(app.S.tarjetasCredito[0].compras.length, comprasAntes + 1, `semilla ${semilla}, paso ${paso}: la compra no quedó en la tarjeta`);
      const g = app.S.gastosVar[app.S.gastosVar.length - 1];
      modelo.deuda += monto;
      vivos.push({ clase: 'fijo', gastoId: g.id, fuente: 'tc:tc1', fecha, monto, deshacer() { modelo.deuda -= monto; } });
      revisar(paso, 'compra con tarjeta');
    } else if (vivos.length) {                        // eliminar uno al azar
      const k = Math.floor(azar() * vivos.length), v = vivos[k];
      await eliminar(v); vivos.splice(k, 1);
      revisar(paso, 'eliminar ' + v.clase);
    }
  }
  while (vivos.length) { const v = vivos.pop(); await eliminar(v); }
  assert.deepEqual(CUENTAS.map(c => app.getSaldoFuente(c)), CUENTAS.map(() => INICIAL), `semilla ${semilla}: los saldos no vuelven al inicial`);
  assert.equal(app.tcDeudaCalculada(app.S.tarjetasCredito[0]), DEUDA_INICIAL, `semilla ${semilla}: la deuda no vuelve a la inicial`);
  assert.deepEqual(Object.keys(app.S.pagosGastosFijos), [], `semilla ${semilla}: quedó algún gasto fijo marcado como pagado`);
  assert.equal(JSON.stringify(netoPorRef(app)), '[]', `semilla ${semilla}: quedó plata neta en el libro`);
  assert.equal(app.Libro.verificarEspejo(app.S).ok, true);
}

for (const semilla of [3, 77, 2026, 90210, 123456, 8080]) {
  test('secuencia aleatoria de gastos fijos y tarjeta (pagar y eliminar), semilla ' + semilla + ': saldos, deuda, marcas de pago y libro coherentes en cada paso', async () => {
    await correrSecuencia(semilla, 120);
  });
}

test('regresión: pagar un gasto fijo con fecha de OTRO mes y luego eliminar el pago desmarca el mes que cubría (antes quedaba «pagado» sin plata y seguía contando)', async () => {
  const { app, dom } = entorno();
  const HOY = app.hoy(), [anio, mesNum] = HOY.split('-').map(Number);
  const anterior = new Date(Date.UTC(anio, mesNum - 2, 15)).toISOString().slice(0, 10);
  app.abrirPagarGastoFijo('f1'); campo(dom, 'pgf-fuente', 'cuenta:nequi'); campo(dom, 'pgf-fecha', anterior);
  app.confirmarPagarGastoFijo();
  const g = app.S.gastosVar[0];
  assert.deepEqual(Object.keys(app.S.pagosGastosFijos), ['f1_' + app.mesActual()], 'se marca el mes actual, que es el que cubre');
  assert.equal(g.mesCubre, app.mesActual());
  await app.eliminarMovimiento(boton('gasto', g.id, 'cuenta:nequi', 600000, anterior));
  assert.deepEqual(Object.keys(app.S.pagosGastosFijos), [], 'el pago se desmarca');
  assert.equal(app.getSaldoFuente('cuenta:nequi'), INICIAL);
  assert.equal(app.S.gastosVar.length, 0);
  // y se puede volver a pagar este mes
  app.abrirPagarGastoFijo('f1'); campo(dom, 'pgf-fuente', 'cuenta:nequi'); campo(dom, 'pgf-fecha', HOY);
  app.confirmarPagarGastoFijo();
  assert.equal(app.S.gastosVar.length, 1);
});

test('compatibilidad: un pago creado ANTES de `mesCubre` se desmarca por el mes de su fecha, como siempre', async () => {
  const { app, dom } = entorno();
  const HOY = app.hoy();
  app.abrirPagarGastoFijo('f1'); campo(dom, 'pgf-fuente', 'cuenta:nequi'); campo(dom, 'pgf-fecha', HOY);
  app.confirmarPagarGastoFijo();
  const g = app.S.gastosVar[0]; delete g.mesCubre; // simula un pago viejo
  await app.eliminarMovimiento(boton('gasto', g.id, 'cuenta:nequi', 600000, HOY));
  assert.deepEqual(Object.keys(app.S.pagosGastosFijos), []);
});
