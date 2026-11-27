'use strict';
// «Crear y eliminar deja todo igual», con el libro como juez, para los movimientos de Encargos que mueven plata propia. La creación de estos
// movimientos vive en formularios (lee el DOM), así que el estado que dejan se arma aquí a mano replicando EXACTAMENTE lo que escribe
// `encargos.js` (traspaso: l.2279–2311; «Yo puse la plata»: `_procesarMovimientoEncargoMia`, l.966–1030) y se elimina con la función real
// `deleteMovimientoEncargo`. Se comprueba que:
//   · antes de eliminar, espejo y libro son coherentes y cuadran con los saldos;
//   · después, el estado guardado (sin el libro) y los saldos vuelven exactamente a los de antes, cada pata tiene su reversión (neto 0)
//     y el espejo sigue siendo coherente.
// Corre con:  node --test tests/ida-y-vuelta-encargos.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadApp } = require('./support/load-app');
const RAIZ = path.join(__dirname, '..');
const core = f => path.join(RAIZ, 'js', 'core', f), modulo = f => path.join(RAIZ, 'js', 'modules', f);
const ARCHIVOS = [core('core-state.js'), core('calc-helpers.js'), core('cuenta-efectos.js'), core('periodo.js'), core('nu-calc.js'), modulo('nu.js'), modulo('cuentas.js'), modulo('mesada.js'), core('split.js'), core('diferencial.js'), modulo('encargos.js')];
const clon = x => JSON.parse(JSON.stringify(x));
const FECHA = new Date().toISOString().slice(0, 10);

function cargar() {
  const app = loadApp(ARCHIVOS, { permissive: true });
  Object.assign(app.S, {
    modulos: {}, libro: [], movimientos: [], gastosVar: [], cajitas: [], tcMovimientos: [], deudores: [], misDeudas: [],
    tarjetasCredito: [{ id: 'tc1', nombre: 'Visa', cupo: 5000000, deuda: 100000, estado: 'activa', compras: [], pagos: [] }],
    cuentas: [{ id: 'nequi', tipo: 'billetera', nombre: 'Nequi' }, { id: 'efectivo', tipo: 'efectivo', nombre: 'Efectivo' }],
    encargos: [{ id: 'e1', nombre: 'Encargo', saldoInicial: 0, cuentaInicial: '', movimientos: [] }],
  });
  app.Libro.hidratar(app.S);
  app.sumarFuente('cuenta:nequi', 500000, { origen: { modulo: 'test' } });
  app.sumarFuente('cuenta:efectivo', 200000, { origen: { modulo: 'test' } });
  app.dialogo = async () => true; app.confirmarEliminar = async () => true; app.avisarMovimientoBloqueado = async () => {};
  return app;
}
const saldos = app => JSON.stringify(app.S.cuentas.map(c => [c.id, c.saldo]));
// `save()` anota una foto del patrimonio del día (patrimonioCierres/Historial): es un efecto de guardar, no de lo que se revierte.
const sinLibro = app => { const c = clon(app.S); delete c.libro; delete c.patrimonioCierres; delete c.patrimonioHistorial; return c; };
function netoPorRef(app, desde) {
  const neto = new Map();
  app.S.libro.slice(desde).forEach(l => { const ref = l.origen && l.origen.ref; if (!ref) return; const k = ref + '|' + l.cuenta; neto.set(k, (neto.get(k) || 0) + Math.round(l.monto * 100)); });
  return Array.from(neto.entries()).filter(([, v]) => v !== 0).map(([k, v]) => k + '=' + v / 100);
}

// Cada escenario deja en `app.S` lo mismo que la pantalla y devuelve el id del movimiento del encargo.
const ESCENARIOS = {
  'Me lo regalaron (traspaso a cuenta propia)': app => {
    const id = 'mov-traspaso';
    app.S.encargos[0].movimientos.push({ id, tipo: 'salida', desc: 'Regalo a Nequi', monto: 40000, cuenta: '', fecha: FECHA, nota: 'Traspaso a cuenta propia', _traspasoEncargo: true, _destino: 'cuenta:nequi', ts: 1 });
    app.sumarFuente('cuenta:nequi', 40000, app.Libro.origen('encargos')(id));
    app.S.movimientos.push({ id: 'esp-1', tipo: 'entrada', fuente: 'cuenta:nequi', monto: 40000, fecha: FECHA, desc: 'Regalo (de encargo)', _encargoMovimientoId: id, clase: 'ingreso', _esExtraIngreso: true });
    return id;
  },
  'Compra pagada con tarjeta (la plata del encargo va a una cuenta y sube la deuda de la tarjeta)': app => {
    // Replica `confirmarCompraConTC` (encargos.js l.3142–3201), sin diferencial: salida en el encargo, plata a la cuenta destino, deuda de la tarjeta y su historial.
    const id = 'mov-tc', monto = 70000;
    app.S.encargos[0].movimientos.push({ id, tipo: 'salida', desc: 'Compra pagada con TC: Zapatos', monto, cuenta: '', fecha: FECHA, _esTcEncargo: true, _encargoId: 'e1', _destino: 'cuenta:nequi', _tcId: 'tc1', _tcMonto: monto, _dijoMonto: monto, _destinoMonto: monto, ts: 1 });
    app.sumarFuente('cuenta:nequi', monto, app.Libro.origen('encargos')(id));
    app.S.movimientos.push({ id: 'esp-tc', tipo: 'entrada', fuente: 'cuenta:nequi', _encargoMovimientoId: id, clase: 'neutro', _esTcEncargo: true, monto, fecha: FECHA, desc: 'TC encargo: Zapatos', ts: 1 });
    app.S.tarjetasCredito[0].deuda += monto;
    app.S.tcMovimientos.push({ id: 'tcm-1', tcId: 'tc1', tipo: 'cargo_encargo', desc: 'Compra encargo: Zapatos', monto, fecha: FECHA, encargoId: 'e1', _encargoMovimientoId: id });
    return id;
  },
  'Yo puse la plata (sale de una cuenta, sin recuperar)': app => {
    const id = 'mov-mia1';
    app.S.encargos[0].movimientos.push({ id, tipo: 'salida', desc: 'Compra', monto: 25000, fecha: FECHA, _miaCuentaSale: 'cuenta:efectivo', ts: 1 });
    app.descontarFuente('cuenta:efectivo', 25000, app.Libro.origen('encargos')(id));
    app.S.movimientos.push({ id: 'esp-1', tipo: 'transferencia', fuente: 'cuenta:efectivo', _encargoMovimientoId: id, clase: 'neutro', _esIntercambioEncargo: true, _intercambioSalida: true, _secundario: true, monto: 25000, fecha: FECHA, desc: 'Yo puse la plata: Compra' });
    return id;
  },
  'Yo puse la plata (sale de dos cuentas y recupero en una)': app => {
    const id = 'mov-mia2';
    app.S.encargos[0].movimientos.push({ id, tipo: 'salida', desc: 'Compra grande', monto: 60000, fecha: FECHA, _miaCuentaSale: 'cuenta:efectivo', ts: 1 });
    app.descontarFuente('cuenta:efectivo', 35000, app.Libro.origen('encargos')(id));
    app.descontarFuente('cuenta:nequi', 25000, app.Libro.origen('encargos')(id));
    app.sumarFuente('cuenta:nequi', 60000, app.Libro.origen('encargos')(id));
    [['cuenta:efectivo', 35000, 's'], ['cuenta:nequi', 25000, 's'], ['cuenta:nequi', 60000, 'e']].forEach(([fuente, monto, t], i) => {
      app.S.movimientos.push({ id: 'esp-' + i, tipo: 'transferencia', fuente, _encargoMovimientoId: id, clase: 'neutro', _esIntercambioEncargo: true, [t === 's' ? '_intercambioSalida' : '_intercambioEntrada']: true, _secundario: true, monto, fecha: FECHA, desc: 'Yo puse la plata: Compra grande' });
    });
    return id;
  },
};

for (const [nombre, armar] of Object.entries(ESCENARIOS)) {
  test('Encargos — ' + nombre + ': eliminar devuelve el estado exacto, el libro neto en 0 y el espejo coherente', async () => {
    const app = cargar();
    const antes = sinLibro(app), saldosAntes = saldos(app), largoLibro = app.S.libro.length;
    const id = armar(app);
    assert.notEqual(saldos(app), saldosAntes, 'el escenario sí movió plata');
    assert.equal(app.Libro.verificar(app.S).ok, true);
    const aplicado = app.Libro.verificarEspejo(app.S);
    assert.equal(aplicado.ok, true, 'tras crear: ' + JSON.stringify(aplicado.huerfanas));
    await app.deleteMovimientoEncargo('e1', id);
    assert.equal(app.S.encargos[0].movimientos.length, 0, 'el movimiento del encargo se eliminó');
    assert.equal(saldos(app), saldosAntes, 'los saldos vuelven a ser los de antes');
    assert.deepEqual(sinLibro(app), antes, 'el estado guardado vuelve exactamente a como estaba');
    assert.equal(JSON.stringify(netoPorRef(app, largoLibro)), '[]', 'cada pata creada tiene su reversión');
    const revertido = app.Libro.verificarEspejo(app.S);
    assert.equal(revertido.ok, true, 'tras eliminar: ' + JSON.stringify(revertido.huerfanas));
    assert.equal(app.Libro.verificar(app.S).ok, true);
  });
}
