'use strict';
// Secuencias ALEATORIAS de crear y eliminar movimientos con las funciones REALES de la app (ingreso, retiro, transferencia y gasto, creados con
// `registrarEntradaConApertura`, `registrarSalida`, `confirmarTransferir` y `addGastoVar`; eliminados con `eliminarMovimiento`, que es la
// ruta de la pantalla), vigilando el libro después de CADA paso. Semilla fija: si falla, se reproduce.
//   · el saldo de cada cuenta == lo que dice un modelo independiente (saldo inicial + movimientos vivos);
//   · el libro cuadra con los saldos (Libro.verificar) y es coherente con los registros (Libro.verificarEspejo);
//   · al eliminar TODO lo que quedó, cada saldo vuelve al inicial y el libro no deja plata neta por ningún ref.
// Corre con:  node --test tests/secuencias-libro.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadApp } = require('./support/load-app');
const { createFakeDom } = require('./support/fake-dom');

const RAIZ = path.join(__dirname, '..');
const core = f => path.join(RAIZ, 'js', 'core', f), modulo = f => path.join(RAIZ, 'js', 'modules', f);
const ARCHIVOS = [core('core-state.js'), core('periodo.js'), core('nu-calc.js'), core('calc-helpers.js'), core('cuenta-efectos.js'),
  modulo('tarjetas-credito.js'), modulo('nu.js'), modulo('cuentas.js'), core('split.js'), modulo('gastos.js'), core('movimientos.js')];
const HOY = '2026-10-13';
const CUENTAS = ['cuenta:nequi', 'cuenta:efectivo', 'cuenta:z'];
const INICIAL = 5000000;

function entorno() {
  const app = loadApp(ARCHIVOS, { permissive: true });
  Object.assign(app.S, { modulos: {}, libro: [], movimientos: [], gastosVar: [], cajitas: [], transferencias: [], pagosGastosFijos: {}, tcMovimientos: [], tarjetasCredito: [],
    cuentas: [{ id: 'nequi', tipo: 'billetera', nombre: 'Nequi' }, { id: 'efectivo', tipo: 'efectivo', nombre: 'Efectivo' }, { id: 'z', tipo: 'banco', nombre: 'Z' }] });
  app.Libro.hidratar(app.S);
  const dom = createFakeDom({ gv_desc: { value: 'Gasto' }, gv_monto: { value: '' }, gv_fecha: { value: '' }, gv_cat: { value: 'Comida' }, gv_nota: { value: '' }, gv_fuente: { value: '' },
    tr_origen: { value: '' }, tr_destino: { value: '' }, tr_monto: { value: '' }, tr_nota: { value: '' }, tr_fecha: { value: HOY } });
  app.document = dom.document;
  app.dialogo = async () => true; app.save = () => {}; app.refresh = () => {}; app.toast = () => {}; app.fuenteLabel = f => f;
  CUENTAS.forEach(c => app.sumarFuente(c, INICIAL, { origen: { modulo: 'test' } })); // saldo inicial sin ref: no cuenta como movimiento
  return { app, dom };
}
const boton = (tipo, id, fuente, monto) => { const item = { dataset: { movimientoId: id, movimientoTipo: tipo, movimientoFuente: fuente, movimientoMonto: String(monto), movimientoFecha: HOY } }; return { closest: () => item }; };
const campo = (dom, id, valor) => { dom.document.getElementById(id).value = valor; };
const montoTexto = n => String(n) + ',00';
const saldosApp = app => CUENTAS.map(c => app.getSaldoFuente(c));
function netoPorRef(app) {
  const neto = new Map();
  app.S.libro.forEach(l => { const ref = l.origen && l.origen.ref; if (!ref) return; const k = ref + '|' + l.cuenta; neto.set(k, (neto.get(k) || 0) + Math.round(l.monto * 100)); });
  return Array.from(neto.entries()).filter(([, v]) => v !== 0).map(([k, v]) => k + '=' + v / 100);
}

async function correrSecuencia(semilla, pasos) {
  const { app, dom } = entorno();
  let s = semilla;
  const azar = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const elegir = lista => lista[Math.floor(azar() * lista.length)];
  const modelo = CUENTAS.map(() => INICIAL);           // saldo esperado por cuenta
  const vivos = [];                                     // { tipo, id, fuente, monto, efecto: [delta por cuenta] }
  const delta = (cuenta, valor) => { const d = CUENTAS.map(() => 0); d[CUENTAS.indexOf(cuenta)] += valor; return d; };
  const aplicar = efecto => efecto.forEach((v, i) => { modelo[i] += v; });
  const revisar = (paso, que) => {
    assert.deepEqual(saldosApp(app), modelo, `semilla ${semilla}, paso ${paso} (${que}): el saldo no coincide con el modelo`);
    assert.equal(app.Libro.verificar(app.S).ok, true, `semilla ${semilla}, paso ${paso} (${que}): el libro no cuadra con los saldos`);
    const espejo = app.Libro.verificarEspejo(app.S);
    assert.equal(espejo.ok, true, `semilla ${semilla}, paso ${paso} (${que}): espejo roto ${JSON.stringify(espejo.huerfanas.slice(0, 2))}`);
  };

  for (let paso = 1; paso <= pasos; paso++) {
    const monto = (1 + Math.floor(azar() * 99)) * 100;       // 100 … 9.900
    const r = azar();
    if (r < 0.22) {
      const fuente = elegir(CUENTAS);
      app.registrarEntradaConApertura(fuente, monto, HOY, 'Ingreso', false, '');
      const m = app.S.movimientos[app.S.movimientos.length - 1];
      vivos.push({ tipo: 'entrada', id: m.id, fuente, monto, efecto: delta(fuente, monto) }); aplicar(delta(fuente, monto)); revisar(paso, 'ingreso');
    } else if (r < 0.40) {
      const fuente = elegir(CUENTAS);
      app.registrarSalida(fuente, monto, HOY, 'Retiro', '');
      const m = app.S.movimientos[app.S.movimientos.length - 1];
      vivos.push({ tipo: 'salida_manual', id: m.id, fuente, monto, efecto: delta(fuente, -monto) }); aplicar(delta(fuente, -monto)); revisar(paso, 'retiro');
    } else if (r < 0.58) {
      const origen = elegir(CUENTAS), destino = elegir(CUENTAS.filter(c => c !== origen));
      campo(dom, 'tr_origen', origen); campo(dom, 'tr_destino', destino); campo(dom, 'tr_monto', montoTexto(monto)); campo(dom, 'tr_nota', ''); campo(dom, 'tr_fecha', HOY);
      const antes = app.S.transferencias.length;
      app.confirmarTransferir();
      assert.equal(app.S.transferencias.length, antes + 1, `semilla ${semilla}, paso ${paso}: la transferencia no se creó`);
      const t = app.S.transferencias[app.S.transferencias.length - 1];
      const efecto = delta(origen, -monto).map((v, i) => v + delta(destino, monto)[i]);
      vivos.push({ tipo: 'transferencia', id: t.id, fuente: origen, monto, efecto }); aplicar(efecto); revisar(paso, 'transferencia');
    } else if (r < 0.74) {
      const fuente = elegir(CUENTAS);
      campo(dom, 'gv_fuente', fuente); campo(dom, 'gv_monto', montoTexto(monto)); campo(dom, 'gv_desc', 'Gasto'); campo(dom, 'gv_cat', 'Comida'); // el formulario se limpia tras crear: se llena de nuevo
      const antes = app.S.gastosVar.length;
      app.addGastoVar();
      assert.equal(app.S.gastosVar.length, antes + 1, `semilla ${semilla}, paso ${paso}: el gasto no se creó`);
      const g = app.S.gastosVar[app.S.gastosVar.length - 1];
      vivos.push({ tipo: 'gasto', id: g.id, fuente, monto, efecto: delta(fuente, -monto) }); aplicar(delta(fuente, -monto)); revisar(paso, 'gasto');
    } else if (vivos.length) {
      const i = Math.floor(azar() * vivos.length), v = vivos[i];
      await app.eliminarMovimiento(boton(v.tipo, v.id, v.fuente, v.monto));
      vivos.splice(i, 1); aplicar(v.efecto.map(x => -x)); revisar(paso, 'eliminar ' + v.tipo);
    }
  }
  // Se elimina TODO lo que quedó: los saldos vuelven al inicial y el libro no deja plata neta por ningún ref.
  while (vivos.length) {
    const v = vivos.pop();
    await app.eliminarMovimiento(boton(v.tipo, v.id, v.fuente, v.monto));
    aplicar(v.efecto.map(x => -x));
  }
  assert.deepEqual(saldosApp(app), CUENTAS.map(() => INICIAL), `semilla ${semilla}: tras eliminar todo los saldos no vuelven al inicial`);
  assert.equal(JSON.stringify(netoPorRef(app)), '[]', `semilla ${semilla}: quedó plata neta en el libro tras eliminar todo`);
  assert.equal(app.S.movimientos.length + app.S.gastosVar.length + app.S.transferencias.length, 0, 'no queda ningún registro');
  assert.equal(app.Libro.verificarEspejo(app.S).ok, true);
}

for (const semilla of [11, 2026, 424242, 7, 99, 31337, 5150, 8675309]) {
  test('secuencia aleatoria de crear y eliminar (ingreso, retiro, transferencia, gasto), semilla ' + semilla + ': saldos, libro y espejo coherentes en cada paso', async () => {
    await correrSecuencia(semilla, 150);
  });
}
