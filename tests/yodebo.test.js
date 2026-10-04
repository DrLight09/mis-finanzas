'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const CORE_DIR = process.env.MIS_FINANZAS_CORE_DIR
  || path.join(__dirname, '..', 'js', 'core');
const MODULES_DIR = process.env.MIS_FINANZAS_MODULES_DIR
  || path.join(__dirname, '..', 'js', 'modules');

// "Yo debo": lo que se prueba acá es el efecto financiero, sin pantalla.
// _planMovMiDeuda() lee el formulario (DOM) y arma el plan; _aplicarMovMiDeuda(plan)
// y _revertirMovMiDeuda(mov) son puras sobre S, así que se prueban directo con un plan armado a mano.
// Orden igual que index.html: core-state → cuenta-efectos → calc-helpers → módulos.
// permissive: prestado.js referencia funciones de UI (openSheet/toast/Events) a nivel de módulo.
function freshApp() {
  const ctx = loadApp([
    path.join(CORE_DIR, 'core-state.js'),
    path.join(CORE_DIR, 'cuenta-efectos.js'),
    path.join(CORE_DIR, 'calc-helpers.js'),
    path.join(MODULES_DIR, 'inicio.js'),
    path.join(MODULES_DIR, 'prestado.js'),
    path.join(MODULES_DIR, 'tarjetas_credito.js'),
  ], { permissive: true });
  Object.assign(ctx.S, {
    cuentas: [
      { id: 'nequi', tipo: 'nequi', saldo: 30000 },
      { id: 'efectivo', tipo: 'efectivo', saldo: 50000 },
    ],
    movimientos: [], gastosVar: [], cajitas: [], encargos: [], deudores: [],
    tarjetasCredito: [{ id: 'tc1', nombre: 'Visa', cupo: 100000, deuda: 0, estado: 'activa', compras: [], pagos: [], saldoInicial: null }],
    tcMovimientos: [],
    misDeudas: [{ id: 'y1', nombre: 'Beto', movimientos: [{ id: 'r0', tipo: 'recibido', monto: 90000, fecha: '2026-09-01' }] }],
  });
  return ctx;
}

const saldo = (ctx, id) => ctx.S.cuentas.find((c) => c.id === id).saldo;
const debe = (ctx) => ctx.getMiDeudaSaldo(ctx.S.misDeudas[0]);
function plan(ctx, o) {
  return Object.assign({ d: ctx.S.misDeudas[0], tipo: 'pago', fecha: '2026-10-02', nota: '', perdon: false, extra: 0, partido: false }, o);
}
function eliminar(ctx, mov) {
  ctx._revertirMovMiDeuda(mov);
  const d = ctx.S.misDeudas[0];
  d.movimientos = d.movimientos.filter((x) => x.id !== mov.id);
}

test('Yo debo — pago dividido entre dos cuentas: baja la deuda, no cambia el patrimonio, y eliminar lo revierte exacto', () => {
  const ctx = freshApp();
  const p0 = ctx.calcPatrimonioTotal();
  const mov = ctx._aplicarMovMiDeuda(plan(ctx, {
    monto: 40000, partido: true,
    cuentas: [{ cuenta: 'efectivo', monto: 25000 }, { cuenta: 'nequi', monto: 15000 }],
  }));
  assert.equal(saldo(ctx, 'efectivo'), 25000);
  assert.equal(saldo(ctx, 'nequi'), 15000);
  assert.equal(debe(ctx), 50000);
  assert.equal(ctx.calcPatrimonioTotal(), p0, 'pagar una deuda no cambia el patrimonio neto');
  assert.equal(mov.fuentes.length, 2);
  assert.equal(ctx.S.movimientos.filter((m) => m._secundario && m.tipo === 'salida').length, 2);
  eliminar(ctx, mov);
  assert.equal(saldo(ctx, 'efectivo'), 50000);
  assert.equal(saldo(ctx, 'nequi'), 30000);
  assert.equal(debe(ctx), 90000);
  assert.equal(ctx.S.movimientos.length, 0);
});

test('Yo debo — recibido dividido: patrimonio neutro (el activo sube y la deuda también)', () => {
  const ctx = freshApp();
  const p0 = ctx.calcPatrimonioTotal();
  ctx._aplicarMovMiDeuda(plan(ctx, {
    tipo: 'recibido', monto: 20000, partido: true,
    cuentas: [{ cuenta: 'efectivo', monto: 5000 }, { cuenta: 'nequi', monto: 15000 }],
  }));
  assert.equal(saldo(ctx, 'efectivo'), 55000);
  assert.equal(saldo(ctx, 'nequi'), 45000);
  assert.equal(debe(ctx), 110000);
  assert.equal(ctx.calcPatrimonioTotal(), p0);
});

test('Yo debo — perdón = ingreso real: deuda a 0, ninguna cuenta se mueve, patrimonio +lo perdonado', () => {
  const ctx = freshApp();
  const p0 = ctx.calcPatrimonioTotal();
  const mov = ctx._aplicarMovMiDeuda(plan(ctx, { monto: 90000, perdon: true, cuentas: [] }));
  assert.equal(debe(ctx), 0);
  assert.equal(saldo(ctx, 'efectivo'), 50000);
  assert.equal(saldo(ctx, 'nequi'), 30000);
  assert.equal(ctx.calcPatrimonioTotal() - p0, 90000);
  const ing = ctx.S.movimientos.find((m) => m._esPerdonRecibido);
  assert.equal(ing.fuente, '');
  assert.equal(ctx._esEntradaEspejoNoIngreso(ing), false, 'tiene que contar como ingreso, no como espejo');
  assert.equal(mov._perdon, true);
  eliminar(ctx, mov);
  assert.equal(debe(ctx), 90000);
  assert.equal(ctx.S.movimientos.length, 0);
  assert.equal(ctx.calcPatrimonioTotal(), p0);
});

test('Yo debo — pagar de más = gasto real: las cuentas descuentan monto + extra, la deuda baja solo el monto', () => {
  const ctx = freshApp();
  ctx.S.cuentas.find((c) => c.id === 'efectivo').saldo = 100000;
  const p0 = ctx.calcPatrimonioTotal();
  const mov = ctx._aplicarMovMiDeuda(plan(ctx, { monto: 90000, extra: 5000, cuentas: [{ cuenta: 'efectivo', monto: 95000 }] }));
  assert.equal(saldo(ctx, 'efectivo'), 5000);
  assert.equal(debe(ctx), 0);
  assert.equal(ctx.calcPatrimonioTotal() - p0, -5000, 'solo el extra es gasto');
  assert.equal(ctx.S.gastosVar.length, 1);
  assert.equal(ctx.S.gastosVar[0].monto, 5000);
  assert.equal(ctx._esGastoVarNoReal(ctx.S.gastosVar[0]), false, 'cuenta como gasto real');
  eliminar(ctx, mov);
  assert.equal(saldo(ctx, 'efectivo'), 100000);
  assert.equal(debe(ctx), 90000);
  assert.equal(ctx.S.gastosVar.length, 0);
});

test('Yo debo — pago con tarjeta: deuda PROPIA de la TC, patrimonio igual, sobrevive al refresh y se revierte', () => {
  const ctx = freshApp();
  const p0 = ctx.calcPatrimonioTotal();
  const mov = ctx._aplicarMovMiDeuda(plan(ctx, { monto: 40000, cuentas: [{ cuenta: 'tc:tc1', monto: 40000 }] }));
  const tc = ctx.S.tarjetasCredito[0];
  assert.equal(tc.deuda, 40000);
  assert.equal(debe(ctx), 50000);
  assert.equal(ctx.S.tcMovimientos[0].tipo, 'cargo_deuda');
  assert.equal(ctx.calcDeudaAjenaDeTarjeta(tc), 0, 'no es deuda ajena');
  assert.equal(ctx.calcDeudaTcPropiaDeTarjeta(tc), 40000, 'es deuda propia');
  assert.equal(ctx.calcPatrimonioTotal(), p0, 'cambiar deuda con el prestamista por deuda de tarjeta no cambia el patrimonio');
  assert.equal(ctx.S.movimientos.length, 0, 'sin movimiento espejo: una tarjeta no tiene saldo');
  // tcRecalcular corre en cada refresh y reconstruye tc.deuda desde los cargos:
  ctx.tcNormalizarTarjetas();
  assert.equal(tc.deuda, 40000, 'si cargo_deuda no estuviera en _tcEsCargoExterno, esto daría 0');
  eliminar(ctx, mov);
  assert.equal(tc.deuda, 0);
  assert.equal(ctx.S.tcMovimientos.length, 0);
  ctx.tcNormalizarTarjetas();
  assert.equal(tc.deuda, 0);
  assert.equal(debe(ctx), 90000);
});

test('Yo debo — pago dividido efectivo + tarjeta, y eliminarlo devuelve ambos', () => {
  const ctx = freshApp();
  const mov = ctx._aplicarMovMiDeuda(plan(ctx, {
    monto: 60000, partido: true,
    cuentas: [{ cuenta: 'efectivo', monto: 20000 }, { cuenta: 'tc:tc1', monto: 40000 }],
  }));
  assert.equal(saldo(ctx, 'efectivo'), 30000);
  assert.equal(ctx.S.tarjetasCredito[0].deuda, 40000);
  assert.equal(debe(ctx), 30000);
  eliminar(ctx, mov);
  assert.equal(saldo(ctx, 'efectivo'), 50000);
  assert.equal(ctx.S.tarjetasCredito[0].deuda, 0);
  assert.equal(ctx.S.movimientos.length + ctx.S.tcMovimientos.length, 0);
});

test('Yo debo — registro antiguo (una sola cuenta, sin ids nuevos) se elimina igual que antes', () => {
  const ctx = freshApp();
  const d = ctx.S.misDeudas[0];
  d.movimientos.push({ id: 'viejo', tipo: 'pago', monto: 10000, fecha: '2026-09-01', fuente: 'efectivo' });
  ctx.S.cuentas.find((c) => c.id === 'efectivo').saldo = 40000;
  eliminar(ctx, d.movimientos.find((m) => m.id === 'viejo'));
  assert.equal(saldo(ctx, 'efectivo'), 50000);
});

test('Yo debo — si el movimiento espejo ya no existe, eliminar NO devuelve el saldo otra vez (evita doble reversión)', () => {
  const ctx = freshApp();
  const mov = ctx._aplicarMovMiDeuda(plan(ctx, { monto: 10000, cuentas: [{ cuenta: 'efectivo', monto: 10000 }] }));
  assert.equal(saldo(ctx, 'efectivo'), 40000);
  ctx.S.movimientos = []; // alguien borró el espejo a mano
  eliminar(ctx, mov);
  assert.equal(saldo(ctx, 'efectivo'), 40000);
});

test('cuenta-efectos — registrarMovEspejo / borrarMovEspejo: sin cuenta, tipo desconocido o cuenta borrada devuelven null/false', () => {
  const ctx = freshApp();
  ctx.S.cuentas.push({ id: 'c1', tipo: 'custom', nombre: 'Cta', saldo: 0, movimientos: [] });
  ctx.S.cajitas.push({ id: 'cj1', nombre: 'Caj', saldo: 0, historial: [] });
  const r = (cuenta, flujo) => ctx.registrarMovEspejo({ cuenta, flujo, monto: 1000, fecha: '2026-10-02', desc: 'x', origen: 'T' });
  assert.equal(r('', 'entrada'), null);
  assert.equal(r('ganancia', 'entrada'), null);
  assert.equal(r('custom:noexiste', 'entrada'), null);
  assert.equal(r('cajita:noexiste', 'salida'), null);
  const a = r('nequi', 'entrada');
  const b = r('custom:c1', 'salida');
  const c = r('cajita:cj1', 'entrada');
  assert.ok(a && b && c);
  assert.equal(ctx.S.cuentas.find((x) => x.id === 'c1').movimientos[0].tipo, 'egreso');
  assert.equal(ctx.S.cajitas[0].historial[0].tipo, 'entrada');
  assert.equal(ctx.borrarMovEspejo('nequi', a), true);
  assert.equal(ctx.borrarMovEspejo('nequi', a), false);
  assert.equal(ctx.borrarMovEspejo('custom:c1', b), true);
  assert.equal(ctx.borrarMovEspejo('cajita:cj1', c), true);
  assert.equal(ctx.S.movimientos.length, 0);
});

test('Yo debo — grupos de préstamo: el primer "Me prestó" crea el Histórico y getGrupoSaldo cuenta lo recibido como deuda que sube', () => {
  const ctx = freshApp();
  ctx.S.misDeudas[0].movimientos = [];
  const mov = ctx._aplicarMovMiDeuda(plan(ctx, { tipo: 'recibido', monto: 50000, cuentas: [{ cuenta: 'efectivo', monto: 50000 }] }));
  const d = ctx.S.misDeudas[0];
  assert.equal(d.grupos.length, 1);
  assert.equal(mov.grupoId, d.grupos[0].id);
  assert.equal(ctx.getGrupoSaldo(d, d.grupos[0].id), 50000);
});

test('Yo debo — un préstamo aparte se cierra solo al saldarse y se reabre si se revierte el pago (el Histórico nunca se cierra solo)', () => {
  const ctx = freshApp();
  const d = ctx.S.misDeudas[0];
  d.movimientos = [];
  ctx._aplicarMovMiDeuda(plan(ctx, { tipo: 'recibido', monto: 50000, cuentas: [{ cuenta: 'efectivo', monto: 50000 }] })); // cae en el Histórico
  const moto = ctx._crearGrupoDeudor(d, '2026-10-03', 'Moto');
  d.movimientos.push({ id: 'm1', tipo: 'recibido', monto: 30000, fecha: '2026-10-03', grupoId: moto.id });
  d.movimientos.push({ id: 'p1', tipo: 'pago', monto: 30000, fecha: '2026-10-04', grupoId: moto.id });
  ctx._autoCerrarGruposEnCero(d);
  assert.equal(moto.cerrado, true, 'el grupo saldado se cierra solo');
  assert.ok(!d.grupos[0].cerrado, 'el Histórico queda abierto aunque su saldo sea distinto de 0');
  d.movimientos = d.movimientos.filter((x) => x.id !== 'p1');
  ctx._autoCerrarGruposEnCero(d);
  assert.equal(moto.cerrado, false, 'al borrar el pago el grupo se reabre');
});

test('Yo debo — una deuda anterior a los grupos se migra al Histórico sin cambiar su saldo', () => {
  const ctx = freshApp();
  const d = ctx.S.misDeudas[0];
  d.movimientos = [{ id: 'a', tipo: 'recibido', monto: 90000, fecha: '2026-09-01' }, { id: 'b', tipo: 'pago', monto: 20000, fecha: '2026-09-10' }];
  const antes = ctx.getMiDeudaSaldo(d);
  assert.equal(ctx._migrarGruposDeudor(d), true);
  assert.ok(d.movimientos.every((m) => m.grupoId === '_historico'));
  assert.equal(ctx.getMiDeudaSaldo(d), antes);
  assert.equal(ctx._migrarGruposDeudor(d), false, 'es idempotente');
});

function hoyISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

test('Yo debo — el perdón cuenta en el ingreso del mes de Inicio (sin _prestadoDirectamente, una entrada sin cuenta no se contaba)', () => {
  const ctx = freshApp();
  const antes = ctx.calcHealthScore().ingresosMes;
  ctx._aplicarMovMiDeuda(plan(ctx, { monto: 90000, perdon: true, cuentas: [], fecha: hoyISO() }));
  assert.equal(ctx.calcHealthScore().ingresosMes - antes, 90000);
});

test('Yo debo — pagar o recibir una deuda NO cuenta como ingreso ni gasto del mes (solo el perdón y el pago de más lo son)', () => {
  const ctx = freshApp();
  ctx.S.cuentas.find((c) => c.id === 'efectivo').saldo = 500000;
  const antes = ctx.calcHealthScore().ingresosMes;
  ctx._aplicarMovMiDeuda(plan(ctx, { tipo: 'recibido', monto: 40000, cuentas: [{ cuenta: 'efectivo', monto: 40000 }], fecha: hoyISO() }));
  ctx._aplicarMovMiDeuda(plan(ctx, { monto: 20000, cuentas: [{ cuenta: 'efectivo', monto: 20000 }], fecha: hoyISO() }));
  assert.equal(ctx.calcHealthScore().ingresosMes, antes, 'recibir un préstamo no es un ingreso');
  assert.equal(ctx.S.gastosVar.length, 0, 'pagar la deuda no es un gasto');
});
