'use strict';
// tests/prestamos.test.js — Préstamos: Me deben / Yo debo, saldos de deudas, deudas sin cuenta y margen de "El valor era diferente".
// Un archivo por sección de la app. Cada bloque `describe` es lo que antes era un archivo suelto.
// Corre con:  node --test tests/prestamos.test.js   (o todo: npm test)
const { describe } = require('node:test');

describe('medeben', () => {
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const path = require('node:path');
  const { loadApp } = require('./support/load-app');

  const CORE_DIR = process.env.MIS_FINANZAS_CORE_DIR
    || path.join(__dirname, '..', 'js', 'core');
  const MODULES_DIR = process.env.MIS_FINANZAS_MODULES_DIR
    || path.join(__dirname, '..', 'js', 'modules');

  // "Me deben": registrar un movimiento se divide en _planMovimiento() (lee el formulario y valida, sin escribir;
  // necesita DOM, no se prueba acá) y _aplicarMovimiento(plan) (escribe, sin validaciones). Estos tests arman el plan
  // a mano y comprueban el efecto financiero y que _revertirMovDeudor() lo deshace exacto.
  // Orden igual que index.html: core-state → cuenta-efectos → calc-helpers → módulo.
  function freshApp() {
    const ctx = loadApp([
      path.join(CORE_DIR, 'core-state.js'),
      path.join(CORE_DIR, 'cuenta-efectos.js'),
      path.join(CORE_DIR, 'calc-helpers.js'),
      path.join(MODULES_DIR, 'prestado.js'),
      path.join(MODULES_DIR, 'tarjetas_credito.js'),
    ], { permissive: true });
    Object.assign(ctx.S, {
      cuentas: [
        { id: 'nequi', tipo: 'nequi', saldo: 200000 },
        { id: 'efectivo', tipo: 'efectivo', saldo: 100000 },
      ],
      movimientos: [], gastosVar: [], ingresosExtra: [], cajitas: [], tcMovimientos: [], tarjetasCredito: [],
      encargos: [{ id: 'e1', nombre: 'Enc', saldoInicial: 80000, cuentaInicial: 'efectivo', movimientos: [] }],
      misDeudas: [],
      deudores: [{
        id: 'd1', nombre: 'Ana', color: '', movimientos: [{ id: 'm0', tipo: 'prestamo', monto: 100000, fecha: '2026-09-01', fuente: 'nequi', grupoId: 'g0' }],
        grupos: [{ id: 'g0', nombre: 'Préstamo', fechaInicio: '2026-09-01', estado: 'abierto' }],
      }],
    });
    return ctx;
  }
  const saldo = (ctx, id) => ctx.S.cuentas.find((c) => c.id === id).saldo;
  const debe = (ctx) => ctx.getDeudorSaldo(ctx.S.deudores[0]);
  const plan = (ctx, o) => Object.assign({ d: ctx.S.deudores[0], tipo: 'abono', fecha: '2026-10-02', nota: '', perdon: false, enc: null, destinos: null, destino: '', tieneExtra: false, extraMonto: 0, extPartes: [] }, o);
  function aplicar(ctx, o) { const p = plan(ctx, o); ctx._aplicarMovimiento(p); return ctx.S.deudores[0].movimientos[ctx.S.deudores[0].movimientos.length - 1]; }
  function revertir(ctx, mov) { ctx._revertirMovDeudor(ctx.S.deudores[0], mov); }

  test('Me deben — préstamo simple: sale de la cuenta, la deuda sube, el patrimonio queda igual; revertir lo deja como estaba', () => {
    const ctx = freshApp(); const p0 = ctx.calcPatrimonioTotal();
    const mov = aplicar(ctx, { tipo: 'prestamo', monto: 30000, montoSalio: 30000, hayMargen: false, fuentes: null, fuente: 'efectivo' });
    assert.equal(saldo(ctx, 'efectivo'), 70000);
    assert.equal(debe(ctx), 130000);
    assert.equal(ctx.calcPatrimonioTotal(), p0, 'prestar no cambia el patrimonio (activo ↓, plata prestada ↑)');
    revertir(ctx, mov);
    assert.equal(saldo(ctx, 'efectivo'), 100000);
    assert.equal(debe(ctx), 100000);
  });

  test('Me deben — préstamo dividido entre cuentas (una fila "ganancia" no descuenta ninguna cuenta)', () => {
    const ctx = freshApp();
    const mov = aplicar(ctx, { tipo: 'prestamo', monto: 50000, montoSalio: 50000, hayMargen: false, fuente: '', fuentes: [{ fuente: 'efectivo', monto: 20000 }, { fuente: 'nequi', monto: 20000 }, { fuente: 'ganancia', monto: 10000 }] });
    assert.equal(saldo(ctx, 'efectivo'), 80000);
    assert.equal(saldo(ctx, 'nequi'), 180000);
    assert.equal(mov._gananciaVirtual, 10000);
    revertir(ctx, mov);
    assert.equal(saldo(ctx, 'efectivo'), 100000);
    assert.equal(saldo(ctx, 'nequi'), 200000);
  });

  test('Me deben — abono a una cuenta: la deuda baja, el patrimonio queda igual, y deja movimiento espejo en la cuenta', () => {
    const ctx = freshApp(); const p0 = ctx.calcPatrimonioTotal();
    const mov = aplicar(ctx, { monto: 20000, destino: 'nequi' });
    assert.equal(saldo(ctx, 'nequi'), 220000);
    assert.equal(debe(ctx), 80000);
    assert.equal(ctx.calcPatrimonioTotal(), p0);
    assert.equal(ctx.S.movimientos.filter((m) => m._secundario && m.tipo === 'entrada').length, 1);
    revertir(ctx, mov);
    assert.equal(saldo(ctx, 'nequi'), 200000);
    assert.equal(debe(ctx), 100000);
    assert.equal(ctx.S.movimientos.length, 0);
  });

  test('Me deben — abono dividido entre cuentas, y el que va "sin cuenta" no mueve ningún saldo', () => {
    const ctx = freshApp();
    const mov = aplicar(ctx, { monto: 30000, destinos: [{ fuente: 'nequi', monto: 12000 }, { fuente: 'efectivo', monto: 18000 }] });
    assert.equal(saldo(ctx, 'nequi'), 212000);
    assert.equal(saldo(ctx, 'efectivo'), 118000);
    revertir(ctx, mov);
    assert.equal(saldo(ctx, 'nequi'), 200000);
    assert.equal(saldo(ctx, 'efectivo'), 100000);
    const sin = aplicar(ctx, { monto: 7000, destino: '' });
    assert.equal(saldo(ctx, 'nequi'), 200000);
    assert.equal(debe(ctx), 93000);
    revertir(ctx, sin);
    assert.equal(debe(ctx), 100000);
  });

  test('Me deben — perdón = gasto real: la deuda queda en 0, ninguna cuenta se mueve, el patrimonio baja lo perdonado', () => {
    const ctx = freshApp(); const p0 = ctx.calcPatrimonioTotal();
    const mov = aplicar(ctx, { tipo: 'pago-completo', monto: 100000, perdon: true });
    assert.equal(debe(ctx), 0);
    assert.equal(saldo(ctx, 'nequi'), 200000);
    assert.equal(ctx.calcPatrimonioTotal() - p0, -100000, 'lo que te debían deja de ser un activo');
    assert.equal(ctx.S.gastosVar.length, 1);
    assert.equal(ctx._esGastoVarNoReal(ctx.S.gastosVar[0]), false, 'cuenta como gasto real');
    revertir(ctx, mov);
    assert.equal(debe(ctx), 100000);
    assert.equal(ctx.S.gastosVar.length, 0);
  });

  test('Me deben — abono con extra: guardar es ingreso real, gastar es gasto, pendiente es ingreso sin cuenta, regalar no mueve nada', () => {
    const ctx = freshApp();
    const mov = aplicar(ctx, {
      monto: 20000, destino: 'nequi', tieneExtra: true, extraMonto: 10000,
      extPartes: [{ tipo: 'guardar', cuenta: 'efectivo', monto: 4000 }, { tipo: 'gastar', monto: 2000, desc: 'x' }, { tipo: 'regalar', monto: 1000 }, { tipo: 'pendiente', monto: 3000 }],
    });
    assert.equal(saldo(ctx, 'efectivo'), 104000);
    assert.equal(ctx.S.gastosVar.length, 1);
    assert.equal(ctx.S.ingresosExtra.length, 1);
    const ing = ctx.S.movimientos.find((m) => m._esExtraIngreso);
    assert.ok(ing, 'el extra guardado en una cuenta cuenta como ingreso real');
    assert.equal(ctx._esEntradaEspejoNoIngreso(ing), false);
    assert.equal(mov._extPartes.length, 4);
    revertir(ctx, mov);
    assert.equal(saldo(ctx, 'efectivo'), 100000);
    assert.equal(saldo(ctx, 'nequi'), 200000);
    assert.equal(ctx.S.gastosVar.length + ctx.S.ingresosExtra.length + ctx.S.movimientos.length, 0);
  });

  test('Me deben — abono vía encargo: descuenta el encargo, no el patrimonio total; revertir devuelve la salida del encargo', () => {
    const ctx = freshApp();
    const enc = ctx.S.encargos[0];
    const mov = aplicar(ctx, { monto: 30000, destino: 'nequi', enc, encCuentaSplits: null, encCuenta: 'efectivo' });
    assert.equal(saldo(ctx, 'nequi'), 230000);
    assert.equal(enc.movimientos.length, 1);
    assert.equal(enc.movimientos[0].tipo, 'salida');
    assert.equal(enc.movimientos[0].cuenta, 'efectivo');
    assert.equal(mov._viaEncargo, true);
    revertir(ctx, mov);
    assert.equal(saldo(ctx, 'nequi'), 200000);
    assert.equal(enc.movimientos.length, 0);
  });

  test('Me deben — abono vía encargo con la plata saliendo de dos cuentas del encargo: una salida por cuenta, todas se revierten', () => {
    const ctx = freshApp();
    const enc = ctx.S.encargos[0];
    const mov = aplicar(ctx, { monto: 30000, destino: 'nequi', enc, encCuentaSplits: [{ fuente: 'efectivo', monto: 10000 }, { fuente: 'nequi', monto: 20000 }], encCuenta: '' });
    assert.equal(enc.movimientos.length, 2);
    assert.equal(new Set(enc.movimientos.map((m) => m._grupoAbonoId)).size, 1, 'comparten el mismo grupo para tratarse como una unidad');
    revertir(ctx, mov);
    assert.equal(enc.movimientos.length, 0);
  });

  test('Me deben — préstamo vía tarjeta: revertir baja la deuda de la TC y quita su cargo', () => {
    const ctx = freshApp();
    ctx.S.tarjetasCredito = [{ id: 'tc1', nombre: 'Visa', cupo: 100000, deuda: 30000, estado: 'activa', compras: [], pagos: [], saldoInicial: null }];
    ctx.S.tcMovimientos = [{ id: 'x', tcId: 'tc1', tipo: 'cargo_prestamo', monto: 30000, _deudorMovId: 'mt' }];
    const d = ctx.S.deudores[0];
    d.movimientos.push({ id: 'mt', tipo: 'prestamo', monto: 30000, fecha: '2026-09-20', _viaTC: true, _tcId: 'tc1', _tcMonto: 30000 });
    ctx._revertirMovDeudor(d, d.movimientos.find((m) => m.id === 'mt'));
    assert.equal(ctx.S.tarjetasCredito[0].deuda, 0);
    assert.equal(ctx.S.tcMovimientos.length, 0);
    assert.equal(d.movimientos.some((m) => m.id === 'mt'), false);
  });

  test('Me deben — revertir un abono cuyo espejo ya no existe NO devuelve el saldo otra vez', () => {
    const ctx = freshApp();
    const mov = aplicar(ctx, { monto: 30000, destino: 'nequi' });
    assert.equal(saldo(ctx, 'nequi'), 230000);
    ctx.S.movimientos = []; // alguien borró el espejo a mano
    revertir(ctx, mov);
    assert.equal(saldo(ctx, 'nequi'), 230000);
  });

  test('Me deben — perdonar UNA PARTE: la deuda baja, ninguna cuenta se mueve, el gasto es lo perdonado y revertir devuelve solo esa parte', () => {
    const ctx = freshApp(); const p0 = ctx.calcPatrimonioTotal();
    const parcial = aplicar(ctx, { tipo: 'abono', monto: 30000, perdon: true });
    assert.equal(debe(ctx), 70000);
    assert.equal(parcial.tipo, 'abono', 'una parte se guarda como abono (con _perdon)');
    assert.equal(parcial._perdon, true);
    assert.equal(saldo(ctx, 'nequi'), 200000);
    assert.equal(ctx.S.gastosVar.length, 1);
    assert.equal(ctx.S.gastosVar[0].monto, 30000);
    assert.equal(ctx._esGastoVarNoReal(ctx.S.gastosVar[0]), false, 'cuenta como gasto real');
    assert.equal(ctx.calcPatrimonioTotal() - p0, -30000);
    // perdonar lo que queda = pago completo
    const resto = aplicar(ctx, { tipo: 'abono', monto: 70000, perdon: true });
    assert.equal(resto.tipo, 'pago-completo');
    assert.equal(debe(ctx), 0);
    assert.equal(ctx.S.gastosVar.length, 2);
    // revertir solo la primera
    revertir(ctx, parcial);
    assert.equal(debe(ctx), 30000);
    assert.equal(ctx.S.gastosVar.length, 1);
    assert.equal(ctx.S.gastosVar[0].monto, 70000);
  });

  test('Me deben — lo perdonado no cuenta como plata recibida (los totales filtran _perdon)', () => {
    const ctx = freshApp();
    aplicar(ctx, { tipo: 'abono', monto: 30000, perdon: true });
    const d = ctx.S.deudores[0];
    const recibido = d.movimientos.filter((m) => (m.tipo === 'abono' || m.tipo === 'pago-completo') && !m._perdon);
    assert.equal(recibido.length, 0);
  });
});

describe('deudas', () => {
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const path = require('node:path');
  const { loadApp } = require('./support/load-app');

  const CORE_DIR = process.env.MIS_FINANZAS_CORE_DIR
    || path.join(__dirname, '..', 'js', 'core');

  // `Deudas` (capa de acceso a "Me deben"/"Yo debo") vive en calc-helpers.js. Es un `const` de
  // nivel superior, así que no se ve como propiedad del contexto: se prueba por las funciones que
  // la envuelven (getDeudorSaldo, totalPrestadoPendiente, calcPatrimonioTotal...), que es lo que usa el resto de la app.
  // Saldos en el modelo actual: S.cuentas[] (Nequi y Efectivo fijos + personalizadas). Antes estos tests
  // cargaban los campos viejos de saldo y migrarCuentasLegacy() los convertía; esa migración ya no existe.
  const cuentas = ({ nequi = 0, efectivo = 0, custom = [] } = {}) => [
    { id: 'nequi', tipo: 'nequi', saldo: nequi },
    { id: 'efectivo', tipo: 'efectivo', saldo: efectivo },
    ...custom,
  ];

  function freshApp(sOverrides = {}) {
    const ctx = loadApp([
      path.join(CORE_DIR, 'core-state.js'),
      path.join(CORE_DIR, 'calc-helpers.js'),
    ]);
    Object.assign(ctx.S, sOverrides);
    return ctx;
  }

  test('Deudas — sin S.deudores ni S.misDeudas todo da 0 (listas ausentes no rompen)', () => {
    const ctx = freshApp();
    ctx.S.deudores = undefined;
    ctx.S.misDeudas = undefined;
    assert.equal(ctx.totalPrestadoPendiente(), 0);
    assert.equal(ctx.totalMisDeudasPendiente(), 0);
    assert.equal(ctx.calcPatrimonioTotal(), 0);
  });

  test('Deudas — totales por dirección ignoran los saldos en 0 o negativos', () => {
    const ctx = freshApp({
      deudores: [
        { id: 'a', movimientos: [{ tipo: 'prestamo', monto: 100 }] },
        { id: 'b', movimientos: [{ tipo: 'prestamo', monto: 50 }, { tipo: 'abono', monto: 80 }] },
      ],
      misDeudas: [
        { id: 'c', movimientos: [{ tipo: 'recibido', monto: 40 }] },
        { id: 'd', movimientos: [{ tipo: 'recibido', monto: 20 }, { tipo: 'pago', monto: 20 }] },
      ],
    });
    assert.equal(ctx.totalPrestadoPendiente(), 100);
    assert.equal(ctx.totalMisDeudasPendiente(), 40);
  });

  test('Deudas — el patrimonio suma lo que te deben y resta lo que debes, con la misma definición de saldo que la pantalla', () => {
    const ctx = freshApp({
      cuentas: cuentas({ nequi: 100000 }),
      deudores: [{ id: 'a', movimientos: [{ tipo: 'prestamo', monto: 300000 }, { tipo: 'abono', monto: 100000 }] }],
      misDeudas: [{ id: 'b', movimientos: [{ tipo: 'recibido', monto: 50000 }] }],
    });
    assert.equal(ctx.calcPatrimonioTotal(), 100000 + 200000 - 50000);
  });

  test('Deudas — un perdón de Yo debo (tipo "pago") deja la deuda en 0 igual que cualquier otro pago', () => {
    const ctx = freshApp({
      misDeudas: [{ id: 'b', movimientos: [{ tipo: 'recibido', monto: 90000 }, { tipo: 'pago', monto: 90000, _perdon: true }] }],
    });
    assert.equal(ctx.totalMisDeudasPendiente(), 0);
  });
});

describe('deudas-sin-cuenta', () => {
  // Deudas sin pata de caja (core-state.js _movsDeudaSinCuenta): un préstamo/abono/pago que mueve el patrimonio sin
  // pasar por ninguna cuenta es un AJUSTE de base (como una apertura), no crecimiento ni ingreso/gasto del mes.
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const path = require('node:path');
  const { loadApp } = require('./support/load-app');
  const CORE = process.env.MIS_FINANZAS_CORE_DIR || path.join(__dirname, '..', 'js', 'core');

  function app(estado = {}) {
    const ctx = loadApp(['core-state.js', 'periodo.js', 'cuenta-efectos.js', 'nu-calc.js'].map(f => path.join(CORE, f)), { permissive: true });
    Object.assign(ctx.S, { modulos: {}, cuentas: [], movimientos: [], gastosVar: [], gastosFijos: [], pagosGastosFijos: {}, ingresosFijos: [], cajitas: [], deudores: [], misDeudas: [] }, estado);
    return ctx;
  }
  const plano = x => JSON.parse(JSON.stringify(x)); // el objeto viene de otro contexto (vm): se compara en plano
  const d = (movimientos) => [{ id: 'd1', nombre: 'Padre', movimientos }];

  test('Me deben — un préstamo sin cuenta es ajuste (+); con cuenta, con TC, con fuentes repartidas o de monto 0 no', () => {
    const ctx = app({ deudores: d([
      { id: 'a', tipo: 'prestamo', monto: 500000, fecha: '2026-09-25', fuente: '' },
      { id: 'b', tipo: 'prestamo', monto: 797000, fecha: '2026-09-30' },
      { id: 'c', tipo: 'prestamo', monto: 28000, fecha: '2026-09-23', fuente: 'efectivo' },
      { id: 'e', tipo: 'prestamo', monto: 108000, fecha: '2026-10-02', _viaTC: true },
      { id: 'f', tipo: 'prestamo', monto: 90000, fecha: '2026-10-03', fuentes: [{ fuente: 'nequi', monto: 80000 }] },
    ]) });
    assert.deepEqual(plano(ctx._ajusteDeudasSinCuentaPorFecha()), { '2026-09-25': 500000, '2026-09-30': 797000 });
  });

  test('Me deben — un abono o pago recibido sin cuenta destino es ajuste (−); con destino/destinos o perdón no', () => {
    const ctx = app({ deudores: d([
      { id: 'a', tipo: 'abono', monto: 600, fecha: '2026-09-17' },
      { id: 'b', tipo: 'pago-completo', monto: 1000, fecha: '2026-09-18', destino: '' },
      { id: 'c', tipo: 'abono', monto: 5000, fecha: '2026-09-19', destino: 'efectivo' },
      { id: 'e', tipo: 'abono', monto: 308000, fecha: '2026-10-03', destinos: [{ fuente: 'cajita:x', monto: 308000 }] },
      { id: 'f', tipo: 'abono', monto: 7000, fecha: '2026-10-04', _perdon: true },
    ]) });
    assert.deepEqual(plano(ctx._ajusteDeudasSinCuentaPorFecha()), { '2026-09-17': -600, '2026-09-18': -1000 });
  });

  test('Yo debo — recibido sin cuenta es ajuste (−) y un pago sin cuenta (+)', () => {
    const ctx = app({ misDeudas: [{ id: 'm1', nombre: 'Tío', movimientos: [
      { id: 'a', tipo: 'recibido', monto: 200000, fecha: '2026-10-01' },
      { id: 'b', tipo: 'pago', monto: 50000, fecha: '2026-10-02' },
      { id: 'c', tipo: 'recibido', monto: 9000, fecha: '2026-10-03', destino: 'nequi' },
    ] }] });
    assert.deepEqual(plano(ctx._ajusteDeudasSinCuentaPorFecha()), { '2026-10-01': -200000, '2026-10-02': 50000 });
  });

  test('clase "ingreso" en un préstamo sin cuenta = plata nueva (p. ej. un regalo): cuenta como ingreso del mes y NO como ajuste', () => {
    const ctx = app({ deudores: d([{ id: 'a', tipo: 'prestamo', monto: 500000, fecha: '2026-09-25', fuente: '', nota: 'Regalo - Abuela', clase: 'ingreso' }]) });
    assert.deepEqual(plano(ctx._ajusteDeudasSinCuentaPorFecha()), {});
    assert.equal(ctx.Periodo.ingresosDelMes('2026-09').entradas, 500000);
  });

  test('sin la clase explícita el préstamo sin cuenta NO es ingreso del mes (solo ajuste de base)', () => {
    const ctx = app({ deudores: d([{ id: 'a', tipo: 'prestamo', monto: 500000, fecha: '2026-09-25', fuente: '' }]) });
    assert.equal(ctx.Periodo.ingresosDelMes('2026-09').entradas, 0);
  });

  test('recalcularMontoBaseHistorial — el préstamo sin cuenta queda como montoBase del día en el historial (retroactivo, sin migración)', () => {
    const ctx = app({
      deudores: d([{ id: 'a', tipo: 'prestamo', monto: 500000, fecha: '2026-09-25', fuente: '' }]),
      patrimonioHistorial: [{ fecha: '2026-09-24', valor: 1000000 }, { fecha: '2026-09-25', valor: 1508837 }, { fecha: '2026-09-26', valor: 1509000 }] });
    ctx.recalcularMontoBaseHistorial();
    const h = plano(ctx.S.patrimonioHistorial);
    assert.equal(h[1].montoBase, 500000);
    assert.equal(h[0].montoBase, undefined);
    assert.equal(h[2].montoBase, undefined);
    ctx.S.deudores = []; // borrar el préstamo: el ajuste desaparece solo
    ctx.recalcularMontoBaseHistorial();
    assert.equal(plano(ctx.S.patrimonioHistorial)[1].montoBase, undefined);
  });
});

describe('prestamo-margen', () => {
  // Borrar un préstamo con "El valor era diferente" lo revierte TODO, margen incluido: como si nunca hubiera pasado.
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const fs = require('node:fs');
  const path = require('node:path');
  const { loadApp } = require('./support/load-app');
  const { createFakeDom } = require('./support/fake-dom');
  const RAIZ = path.join(__dirname, '..');
  const core = f => path.join(RAIZ, 'js', 'core', f), modulo = f => path.join(RAIZ, 'js', 'modules', f);
  const ARCHIVOS = [core('core-state.js'), core('periodo.js'), core('nu-calc.js'), core('calc-helpers.js'), core('cuenta-efectos.js'), core('diferencial.js'), modulo('prestado.js')];

  function cargar(inst) {
    const app = loadApp(ARCHIVOS, { permissive: true });
    Object.assign(app.S, { modulos: {}, libro: [], movimientos: [], gastosVar: [], cajitas: [], deudores: [], misDeudas: [], tarjetasCredito: [{ id: 'tc1', nombre: 'TC', deuda: 0, cupo: 1e7 }],
      cuentas: [{ id: 'nequi', tipo: 'nequi', saldo: 0 }, { id: 'efectivo', tipo: 'efectivo', saldo: 0 }] });
    const dom = createFakeDom({ [inst + '_monto']: { value: '700000' }, [inst + '_dif_real']: { value: '698000' }, [inst + '-dif-body']: { style: { display: '' } } });
    app.document = dom.document;
    return app;
  }

  test('Préstamo con TC — el margen queda enlazado al préstamo y borrarlo lo quita (no sigue contando como ingreso)', () => {
    const app = cargar('prtc');
    const movId = 'mp1';
    const d = { id: 'd1', nombre: 'Ana', movimientos: [] };
    const m = { id: movId, tipo: 'prestamo', monto: 700000, fecha: '2026-10-13', _viaTC: true, _tcId: 'tc1', _tcMonto: 698000 };
    d.movimientos.push(m); app.S.deudores.push(d); app.S.tarjetasCredito[0].deuda = 698000;
    m.diferencial = app.diffAplicar('prtc', { desc: 'x', fecha: '2026-10-13', _deudorNombre: 'Ana' }, movId);
    assert.ok(m.diferencial, 'hubo margen');
    assert.equal(app.Periodo.ingresosDelMes('2026-10').entradas, 2000, 'el margen cuenta como ingreso mientras exista');
    app._revertirMovDeudor(d, m);
    assert.equal(app.S.movimientos.length, 0, 'el margen se fue con el préstamo');
    assert.equal(app.Periodo.ingresosDelMes('2026-10').entradas, 0);
    assert.equal(app.S.tarjetasCredito[0].deuda, 0);
  });

  test('toda llamada a diffAplicar pasa linkId: sin él el efecto no se puede revertir con su movimiento principal', () => {
    const sin = [];
    ['modules/prestado.js', 'modules/encargos.js'].forEach(rel => {
      const src = fs.readFileSync(path.join(RAIZ, 'js', rel), 'utf8');
      const re = /\bdiffAplicar\(/g; let m;
      while ((m = re.exec(src))) {
        let prof = 0, i = m.index + m[0].length - 1, ini = i;
        for (; i < src.length; i++) { if (src[i] === '(') prof++; else if (src[i] === ')' && --prof === 0) break; }
        const args = src.slice(ini + 1, i);
        let comas = 0, p2 = 0; for (const c of args) { if ('({['.includes(c)) p2++; else if (')}]'.includes(c)) p2--; else if (c === ',' && p2 === 0) comas++; }
        if (comas < 2) sin.push(rel + ':' + src.slice(0, m.index).split('\n').length);
      }
    });
    assert.deepEqual(sin, [], 'diffAplicar sin linkId: ' + sin.join(', '));
  });
});
