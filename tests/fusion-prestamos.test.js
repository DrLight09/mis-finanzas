'use strict';
// Fusión de dos dispositivos con PRÉSTAMOS («Me deben») reales: abonos y reversiones hechos por separado con `_aplicarMovimiento` y
// `_revertirMovimientoDeudor`, y el estado fusionado cargado en una app nueva. Comprueba que lo que debe la persona y el saldo de las cuentas son los
// de un modelo independiente, sin plata de más ni de menos, y que el espejo ↔ libro sigue coherente. Incluye que los DOS dispositivos reviertan el
// MISMO abono (cada uno anota su propia reversión: sin la deduplicación de fusion.js se devolvía la plata dos veces).
// Corre con:  node --test tests/fusion-prestamos.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { loadApp } = require('./support/load-app');

const RAIZ = path.join(__dirname, '..');
const core = f => path.join(RAIZ, 'js', 'core', f), modulo = f => path.join(RAIZ, 'js', 'modules', f);
const ARCHIVOS = [core('core-state.js'), core('cuenta-efectos.js'), core('calc-helpers.js'), core('split.js'), core('diferencial.js'), modulo('prestado.js'), modulo('tarjetas-credito.js')];
const clon = x => JSON.parse(JSON.stringify(x));
const dormir = ms => new Promise(r => setTimeout(r, ms));
let _n = 0;

function dispositivo(plano) {
  const app = loadApp(ARCHIVOS, { permissive: true });
  const prefijo = 'p' + (++_n) + '-'; let c = 0; app.uid = () => prefijo + (++c);
  Object.assign(app.S, {
    modulos: {}, libro: [], movimientos: [], gastosVar: [], ingresosExtra: [], cajitas: [], tcMovimientos: [], tarjetasCredito: [], encargos: [], misDeudas: [],
    cuentas: [{ id: 'nequi', tipo: 'billetera', nombre: 'Nequi' }, { id: 'efectivo', tipo: 'efectivo', nombre: 'Efectivo' }],
    deudores: [{ id: 'd1', nombre: 'Ana', color: '', movimientos: [], grupos: [{ id: 'g0', nombre: 'Préstamo', fechaInicio: '2026-09-01', estado: 'abierto' }] }],
  }, plano ? clon(plano) : {});
  app.Libro.hidratar(app.S);
  return app;
}
const plan = (app, o) => Object.assign({ d: app.S.deudores[0], tipo: 'abono', fecha: '2026-10-02', nota: '', perdon: false, encargo: null, destinos: null, destino: '', tieneExtra: false, extraMonto: 0, extPartes: [] }, o);
const abonar = (app, monto, destino) => { app._aplicarMovimiento(plan(app, { monto, destino })); const d = app.S.deudores[0]; return d.movimientos[d.movimientos.length - 1]; };
const revertir = (app, movimiento) => app._revertirMovimientoDeudor(app.S.deudores[0], movimiento);
const debe = app => app.getDeudorSaldo(app.S.deudores[0]);
const saldos = app => [app.getSaldoFuente('cuenta:nequi'), app.getSaldoFuente('cuenta:efectivo')];

// Estado de partida: Ana debe 100.000 (préstamo desde Nequi) y las cuentas tienen saldo inicial.
function partida() {
  const d0 = dispositivo();
  d0.sumarFuente('cuenta:nequi', 500000, { origen: { modulo: 'test' } }); d0.sumarFuente('cuenta:efectivo', 200000, { origen: { modulo: 'test' } });
  d0._aplicarMovimiento(plan(d0, { tipo: 'prestamo', monto: 100000, montoSalio: 100000, hayMargen: false, fuentes: null, fuente: 'cuenta:nequi' }));
  return d0;
}
async function fusionar(plano, A, B) {
  const { fusionarEstados } = await import(pathToFileURL(core('fusion.js')).href);
  return dispositivo(fusionarEstados(plano, clon(A.S), clon(B.S)));
}
const verificar = (M, donde) => {
  assert.equal(M.Libro.verificar(M.S).ok, true, donde + ': el libro no cuadra con los saldos');
  const espejo = M.Libro.verificarEspejo(M.S);
  assert.equal(espejo.ok, true, donde + ': espejo roto ' + JSON.stringify(espejo.huerfanas.slice(0, 2)));
};

test('dos abonos distintos hechos a la vez (uno a Nequi, otro a Efectivo): Ana debe lo que falta y cada cuenta recibe lo suyo', async () => {
  const d0 = partida(); const plano = clon(d0.S); const base = [debe(d0), ...saldos(d0)];
  await dormir(4);
  const A = dispositivo(plano), B = dispositivo(plano);
  abonar(A, 20000, 'cuenta:nequi'); await dormir(4); abonar(B, 30000, 'cuenta:efectivo');
  const M = await fusionar(plano, A, B);
  assert.equal(debe(M), base[0] - 50000, 'lo que debe Ana');
  assert.deepEqual(saldos(M), [base[1] + 20000, base[2] + 30000]);
  verificar(M, 'abonos a la vez');
});

test('los DOS dispositivos revierten el MISMO abono: la plata sale una sola vez y la deuda vuelve a subir una sola vez', async () => {
  const d0 = partida(); abonar(d0, 40000, 'cuenta:nequi');
  const plano = clon(d0.S), movimiento = d0.S.deudores[0].movimientos[d0.S.deudores[0].movimientos.length - 1];
  const conAbono = [debe(d0), ...saldos(d0)];
  await dormir(4);
  const A = dispositivo(plano), B = dispositivo(plano);
  revertir(A, A.S.deudores[0].movimientos.find(m => m.id === movimiento.id)); await dormir(4); revertir(B, B.S.deudores[0].movimientos.find(m => m.id === movimiento.id));
  const M = await fusionar(plano, A, B);
  assert.equal(debe(M), conAbono[0] + 40000, 'la deuda vuelve a lo que era, una sola vez');
  assert.deepEqual(saldos(M), [conAbono[1] - 40000, conAbono[2]], 'el abono se devuelve una sola vez');
  verificar(M, 'reversión doble');
});

test('uno revierte un abono y el otro hace uno nuevo', async () => {
  const d0 = partida(); abonar(d0, 40000, 'cuenta:nequi');
  const plano = clon(d0.S), existente = d0.S.deudores[0].movimientos[d0.S.deudores[0].movimientos.length - 1];
  const conAbono = [debe(d0), ...saldos(d0)];
  await dormir(4);
  const A = dispositivo(plano), B = dispositivo(plano);
  revertir(A, A.S.deudores[0].movimientos.find(m => m.id === existente.id)); await dormir(4); abonar(B, 15000, 'cuenta:efectivo');
  const M = await fusionar(plano, A, B);
  assert.equal(debe(M), conAbono[0] + 40000 - 15000);
  assert.deepEqual(saldos(M), [conAbono[1] - 40000, conAbono[2] + 15000]);
  verificar(M, 'revertir y abonar');
});
