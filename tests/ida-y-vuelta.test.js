'use strict';
// «Aplicar y revertir deja todo igual», con el libro como juez. Por cada operación de Préstamos (Me deben) se comprueba que:
//   1. tras APLICAR: el espejo y el libro son coherentes (Libro.verificarEspejo) y el libro cuadra con los saldos;
//   2. tras REVERTIR: el estado guardado (sin el libro) y los saldos vuelven EXACTAMENTE a como estaban, el libro no deja plata neta
//      por ningún ref (cada pata tiene su reversión) y el espejo sigue siendo coherente.
// Mesada tiene el mismo contrato en tests/mesada.test.js («ida y vuelta»). Corre con:  node --test tests/ida-y-vuelta.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadApp } = require('./support/load-app');
const CORE = path.join(__dirname, '..', 'js', 'core');
const MODULES = path.join(__dirname, '..', 'js', 'modules');
const clon = x => JSON.parse(JSON.stringify(x));

function freshApp() {
  const ctx = loadApp([
    path.join(CORE, 'core-state.js'), path.join(CORE, 'cuenta-efectos.js'), path.join(CORE, 'calc-helpers.js'),
    path.join(CORE, 'split.js'), path.join(CORE, 'diferencial.js'), path.join(MODULES, 'prestado.js'), path.join(MODULES, 'tarjetas-credito.js'),
  ], { permissive: true });
  Object.assign(ctx.S, {
    cuentas: [{ id: 'nequi', tipo: 'billetera', nombre: 'Nequi', saldo: 200000 }, { id: 'efectivo', tipo: 'efectivo', nombre: 'Efectivo', saldo: 100000 }],
    movimientos: [], gastosVar: [], ingresosExtra: [], cajitas: [], tcMovimientos: [], tarjetasCredito: [],
    encargos: [{ id: 'e1', nombre: 'Enc', saldoInicial: 80000, cuentaInicial: 'cuenta:efectivo', movimientos: [] }],
    misDeudas: [],
    deudores: [{
      id: 'd1', nombre: 'Ana', color: '', movimientos: [{ id: 'm0', tipo: 'prestamo', monto: 100000, fecha: '2026-09-01', fuente: 'cuenta:nequi', grupoId: 'g0' }],
      grupos: [{ id: 'g0', nombre: 'Préstamo', fechaInicio: '2026-09-01', estado: 'abierto' }],
    }],
  });
  ctx.Libro.hidratar(ctx.S);
  return ctx;
}
const plan = (ctx, o) => Object.assign({ d: ctx.S.deudores[0], tipo: 'abono', fecha: '2026-10-02', nota: '', perdon: false, encargo: null, destinos: null, destino: '', tieneExtra: false, extraMonto: 0, extPartes: [] }, o);
const saldos = ctx => JSON.stringify(ctx.S.cuentas.map(c => [c.id, c.saldo]));
const sinLibro = ctx => { const c = clon(ctx.S); delete c.libro; return c; };
// Neto del libro por (ref, cuenta) para las entradas con ref: cada pata aplicada debe tener su reversión.
function netoPorRef(ctx, desde) {
  const neto = new Map();
  ctx.S.libro.slice(desde).forEach(l => { const ref = l.origen && l.origen.ref; if (!ref) return; const k = ref + '|' + l.cuenta; neto.set(k, (neto.get(k) || 0) + Math.round(l.monto * 100)); });
  return Array.from(neto.entries()).filter(([, v]) => v !== 0).map(([k, v]) => k + '=' + v / 100);
}

const OPERACIONES = {
  'préstamo simple': { tipo: 'prestamo', monto: 30000, montoSalio: 30000, hayMargen: false, fuentes: null, fuente: 'cuenta:efectivo' },
  'préstamo dividido entre cuentas': { tipo: 'prestamo', monto: 50000, montoSalio: 50000, hayMargen: false, fuente: '', fuentes: [{ fuente: 'cuenta:efectivo', monto: 20000 }, { fuente: 'cuenta:nequi', monto: 20000 }, { fuente: 'ganancia', monto: 10000 }] },
  'abono a una cuenta': { monto: 20000, destino: 'cuenta:nequi' },
  'abono dividido entre cuentas': { monto: 30000, destinos: [{ fuente: 'cuenta:nequi', monto: 12000 }, { fuente: 'cuenta:efectivo', monto: 18000 }] },
  'abono sin cuenta': { monto: 7000, destino: '' },
  'perdón (gasto real)': { tipo: 'pago_completo', monto: 100000, perdon: true },
};

for (const [nombre, operacion] of Object.entries(OPERACIONES)) {
  test('Me deben — ' + nombre + ': aplicar deja espejo y libro coherentes; revertir devuelve el estado exacto y el libro neto en 0', () => {
    const ctx = freshApp();
    const antes = sinLibro(ctx), saldosAntes = saldos(ctx), largoLibro = ctx.S.libro.length;
    ctx._aplicarMovimiento(plan(ctx, operacion));
    const movimiento = ctx.S.deudores[0].movimientos[ctx.S.deudores[0].movimientos.length - 1];
    const aplicado = ctx.Libro.verificarEspejo(ctx.S);
    assert.equal(aplicado.ok, true, 'tras aplicar: ' + JSON.stringify(aplicado.huerfanas));
    assert.equal(ctx.Libro.verificar(ctx.S).ok, true);
    ctx._revertirMovimientoDeudor(ctx.S.deudores[0], movimiento);
    assert.deepEqual(sinLibro(ctx), antes, 'el estado guardado vuelve exactamente a como estaba');
    assert.equal(saldos(ctx), saldosAntes, 'los saldos vuelven a ser los de antes');
    assert.equal(JSON.stringify(netoPorRef(ctx, largoLibro)), '[]', 'cada pata aplicada tiene su reversión');
    const revertido = ctx.Libro.verificarEspejo(ctx.S);
    assert.equal(revertido.ok, true, 'tras revertir: ' + JSON.stringify(revertido.huerfanas));
  });
}
