'use strict';
// «Depositar y eliminar deja todo igual», con el libro como juez, para Alcancía. Crear un depósito vive en un formulario (lee el DOM), así
// que el estado que deja se arma aquí a mano replicando lo que escribe `alcanciaConfirmarDeposito` (alcancia.js l.880–990) y se elimina con
// la función real `alcanciaEliminarDeposito`. Se comprueba, tras eliminar: estado guardado y saldos exactos, libro neto en 0 por ref
// y espejo coherente (Libro.verificarEspejo). Corre con:  node --test tests/ida-y-vuelta-alcancia.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadApp } = require('./support/load-app');
const RAIZ = path.join(__dirname, '..');
const core = f => path.join(RAIZ, 'js', 'core', f), modulo = f => path.join(RAIZ, 'js', 'modules', f);
const clon = x => JSON.parse(JSON.stringify(x));
const FECHA = new Date().toISOString().slice(0, 10);

function cargar() {
  const app = loadApp([core('core-state.js'), core('calc-helpers.js'), core('cuenta-efectos.js'), modulo('alcancia.js')], { permissive: true });
  Object.assign(app.S, {
    modulos: {}, libro: [], movimientos: [], gastosVar: [], transferencias: [], cajitas: [], deudores: [], misDeudas: [], encargos: [],
    cuentas: [{ id: 'nequi', tipo: 'billetera', nombre: 'Nequi' }, { id: 'efectivo', tipo: 'efectivo', nombre: 'Efectivo' }],
    alcancia: { saldoRegistrado: 0, depositos: 0, fechaInicio: FECHA, movimientos: [], historial: [] },
  });
  app.Libro.hidratar(app.S);
  app.sumarFuente('cuenta:nequi', 300000, { origen: { modulo: 'test' } });
  app.sumarFuente('cuenta:efectivo', 100000, { origen: { modulo: 'test' } });
  app.confirmarEliminar = async () => true; app.refresh = () => {};
  app.TextEncoder = TextEncoder; app.TextDecoder = TextDecoder; app.btoa = btoa; app.atob = atob; // el saldo oculto de la alcancía se ofusca con esto
  return app;
}
const saldos = app => JSON.stringify(app.S.cuentas.map(c => [c.id, c.saldo]));
// `save()` anota una foto del patrimonio del día: es un efecto de guardar, no de lo que se revierte.
// `alcanciaSaldoOfuscado` es el saldo oculto recalculado al borrar (queda cifrando 0): un efecto del borrado que no cambia el dinero.
const sinLibro = app => { const c = clon(app.S); delete c.libro; delete c.patrimonioCierres; delete c.patrimonioHistorial; delete c.alcanciaSaldoOfuscado; return c; };
function netoPorRef(app, desde) {
  const neto = new Map();
  app.S.libro.slice(desde).forEach(l => { const ref = l.origen && l.origen.ref; if (!ref) return; const k = ref + '|' + l.cuenta; neto.set(k, (neto.get(k) || 0) + Math.round(l.monto * 100)); });
  return Array.from(neto.entries()).filter(([, v]) => v !== 0).map(([k, v]) => k + '=' + v / 100);
}
const origen = app => app.Libro.origen('alcancia');
function transferenciaDeCuenta(app, id, fuente, monto) {
  app.S.transferencias.push({ id, fecha: FECHA, origen: fuente, destino: 'alcancia', monto, desc: 'Depósito en alcancía', _esAlcancia: true, _secundario: true, _origenSeccion: 'Alcancía', ts: 1 });
  app.descontarFuente(fuente, monto, origen(app)(id));
}
function ingresoSinCuenta(app, id, monto) {
  app.S.movimientos.push({ id, tipo: 'entrada', fuente: 'alcancia', monto, fecha: FECHA, desc: 'Ingreso directo', clase: 'ingreso', _esAlcanciaIngreso: true, _secundario: true, _origenSeccion: 'Alcancía', ts: 1 });
}
function registrarEntrada(app, entrada) {
  const a = app.S.alcancia;
  a.saldoRegistrado += entrada.monto; a.depositos += 1; a.movimientos.push(Object.assign({ fecha: FECHA, ts: 1 }, entrada));
}

const ESCENARIOS = {
  'depósito propio desde una cuenta': app => {
    transferenciaDeCuenta(app, 'dep-1', 'cuenta:nequi', 50000);
    registrarEntrada(app, { id: 'dep-1', monto: 50000, tipo: 'yo_cuenta', fuenteOrigen: 'cuenta:nequi', desc: 'Depósito en alcancía' });
  },
  'depósito directo (plata que nunca estuvo en una cuenta)': app => {
    ingresoSinCuenta(app, 'dep-2', 20000);
    registrarEntrada(app, { id: 'dep-2', monto: 20000, tipo: 'yo_directo', fuenteOrigen: null, desc: 'Ingreso directo' });
  },
  'depósito dividido (dos cuentas + plata directa)': app => {
    transferenciaDeCuenta(app, 'dep-3', 'cuenta:nequi', 30000);
    transferenciaDeCuenta(app, 'dep-3b', 'cuenta:efectivo', 10000);
    ingresoSinCuenta(app, 'dep-3c', 5000);
    registrarEntrada(app, { id: 'dep-3', monto: 45000, tipo: 'multi', fuenteOrigen: null, desc: 'Depósito de varias fuentes', partes: [
      { origen: 'cuenta', monto: 30000, movimientoId: 'dep-3', fuente: 'cuenta:nequi' },
      { origen: 'cuenta', monto: 10000, movimientoId: 'dep-3b', fuente: 'cuenta:efectivo' },
      { origen: 'propio', monto: 5000, movimientoId: 'dep-3c' }] });
  },
};

for (const [nombre, armar] of Object.entries(ESCENARIOS)) {
  test('Alcancía — ' + nombre + ': eliminar devuelve el estado exacto, el libro neto en 0 y el espejo coherente', async () => {
    const app = cargar();
    const antes = sinLibro(app), saldosAntes = saldos(app), largoLibro = app.S.libro.length;
    armar(app);
    assert.equal(app.Libro.verificar(app.S).ok, true);
    const aplicado = app.Libro.verificarEspejo(app.S);
    assert.equal(aplicado.ok, true, 'tras depositar: ' + JSON.stringify(aplicado.huerfanas));
    const a = app.S.alcancia;
    await app.alcanciaEliminarDeposito(a.movimientos[0].id);
    assert.equal(a.movimientos.length, 0);
    assert.equal(saldos(app), saldosAntes, 'los saldos vuelven a ser los de antes');
    assert.deepEqual(sinLibro(app), antes, 'el estado guardado vuelve exactamente a como estaba');
    assert.equal(JSON.stringify(netoPorRef(app, largoLibro)), '[]', 'cada pata creada tiene su reversión');
    const revertido = app.Libro.verificarEspejo(app.S);
    assert.equal(revertido.ok, true, 'tras eliminar: ' + JSON.stringify(revertido.huerfanas));
    assert.equal(app.Libro.verificar(app.S).ok, true);
  });
}
