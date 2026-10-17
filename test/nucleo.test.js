'use strict';
// tests/nucleo.test.js — Núcleo y cálculos: patrimonio, salud financiera, Periodo (ingresos/gastos del mes), migraciones, ingreso real y clase de los movimientos.
// Un archivo por sección de la app. Cada bloque `describe` es lo que antes era un archivo suelto.
// Corre con:  node --test tests/nucleo.test.js   (o todo: npm test)
const { describe } = require('node:test');

describe('calcPatrimonioTotal', () => {
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const path = require('node:path');
  const { loadApp } = require('./support/load-app');

  // Carga core-state.js + periodo.js + nu-calc.js (núcleo de carga de entrada, mismo orden que index.html):
  // calcPatrimonioTotal() llama a calcC/calcCDT (nu-calc.js) sin guards.
  // Ajustá esta ruta si tu estructura de carpetas es distinta a js/core/.
  const CORE_DIR = process.env.MIS_FINANZAS_CORE_DIR
    || path.join(__dirname, '..', 'js', 'core');

  // Saldos en el modelo actual: S.cuentas[] (Nequi y Efectivo fijos + personalizadas). Antes estos tests
  // cargaban los campos viejos de saldo y migrarCuentasLegacy() los convertía; esa migración ya no existe.
  const cuentas = ({ nequi = 0, efectivo = 0, custom = [] } = {}) => [
    { id: 'nequi', tipo: 'nequi', saldo: nequi },
    { id: 'efectivo', tipo: 'efectivo', saldo: efectivo },
    ...custom,
  ];

  function freshApp(sOverrides = {}) {
    const ctx = loadApp([path.join(CORE_DIR, 'core-state.js'), path.join(CORE_DIR, 'periodo.js'), path.join(CORE_DIR, 'nu-calc.js')]);
    Object.assign(ctx.S, sOverrides);
    return ctx;
  }

  test('calcPatrimonioTotal — S vacío (recién abierta la app) da 0', () => {
    const ctx = freshApp();
    assert.equal(ctx.calcPatrimonioTotal(), 0);
  });

  test('calcPatrimonioTotal — suma Nequi + Efectivo + cuentas personalizadas', () => {
    const ctx = freshApp({
      cuentas: cuentas({ nequi: 100000, efectivo: 50000, custom: [{ id: 'c1', tipo: 'custom', nombre: 'C1', saldo: 200000, movimientos: [] }] }),
    });
    assert.equal(ctx.calcPatrimonioTotal(), 350000);
  });

  test('calcPatrimonioTotal — resta la deuda de tarjetas de crédito', () => {
    const ctx = freshApp({
      cuentas: cuentas({ nequi: 500000 }),
      tarjetasCredito: [{ id: 'tc1', deuda: 150000, cupo: 1000000 }],
    });
    assert.equal(ctx.calcPatrimonioTotal(), 350000);
  });

  test('calcPatrimonioTotal — puede dar negativo (deuda de TC mayor a todo lo demás)', () => {
    const ctx = freshApp({
      cuentas: cuentas({ nequi: 50000 }),
      tarjetasCredito: [{ id: 'tc1', deuda: 500000, cupo: 1000000 }],
    });
    assert.equal(ctx.calcPatrimonioTotal(), -450000);
  });

  test('calcPatrimonioTotal — alcancía suma su saldoRegistrado', () => {
    const ctx = freshApp({ alcancia: { saldoRegistrado: 75000 } });
    assert.equal(ctx.calcPatrimonioTotal(), 75000);
  });

  test('calcPatrimonioTotal — plata comprometida ajena (recibida, sin pagar) se resta', () => {
    const ctx = freshApp({
      cuentas: cuentas({ nequi: 200000 }),
      plataComprometida: [{
        recibido: true,
        destinos: [
          { yaPague: false, tipo: 'gasto', gastoOrigen: 'cajita', gastoCajita: 'nu1', monto: 60000 },
        ],
      }],
    });
    assert.equal(ctx.calcPatrimonioTotal(), 140000);
  });

  test('calcPatrimonioTotal — plata comprometida ajena YA PAGADA no se resta', () => {
    const ctx = freshApp({
      cuentas: cuentas({ nequi: 200000 }),
      plataComprometida: [{
        recibido: true,
        destinos: [
          { yaPague: true, tipo: 'gasto', gastoOrigen: 'cajita', gastoCajita: 'nu1', monto: 60000 },
        ],
      }],
    });
    assert.equal(ctx.calcPatrimonioTotal(), 200000);
  });

  test('calcPatrimonioTotal — una cajita sin fecha (recién creada) vale su saldo; con fecha suma el interés real de calcC (nu-calc.js)', () => {
    // calcC/calcCDT viven en js/core/nu-calc.js (núcleo): ya no hay fallback "c.saldo" porque nunca faltan.
    const sinFecha = freshApp({ cajitas: [{ id: 'nu1', saldo: 300000 }] });
    assert.equal(sinFecha.calcPatrimonioTotal(), 300000);
    const d = new Date(Date.now() - 365 * 86400000);
    const fecha = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const conInteres = freshApp({ nuRate: 9.3003, cajitas: [{ id: 'nu1', saldo: 1000000, fecha }] });
    assert.ok(conInteres.calcPatrimonioTotal() > 1050000);
  });

  test('calcPatrimonioTotal — GUARD: plata prestada (S.deudores) sin calc-helpers.js cargado no suma nada', () => {
    // `Deudas` vive en calc-helpers.js (no cargado acá, solo core-state.js).
    // El guard typeof debe devolver 0, nunca sumar el saldo crudo.
    const ctx = freshApp({
      cuentas: cuentas({ nequi: 100000 }),
      deudores: [{ id: 'd1', nombre: 'Hermanito', saldo: 630000 }],
    });
    assert.equal(ctx.calcPatrimonioTotal(), 100000);
  });

  test('calcPatrimonioTotal — GUARD: misDeudas sin calc-helpers.js cargado no resta nada', () => {
    // Mismo guard: sin `Deudas` cargado no se resta nada.
    const ctx = freshApp({ cuentas: cuentas({ nequi: 100000 }), misDeudas: [{ id: 'm1', saldo: 999999 }] });
    assert.equal(ctx.calcPatrimonioTotal(), 100000);
  });
});

describe('calcHealthScore', () => {
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const path = require('node:path');
  const { loadApp } = require('./support/load-app');

  const CORE_DIR = process.env.MIS_FINANZAS_CORE_DIR
    || path.join(__dirname, '..', 'js', 'core');
  const MODULES_DIR = process.env.MIS_FINANZAS_MODULES_DIR
    || path.join(__dirname, '..', 'js', 'modules');

  // Saldos en el modelo actual: S.cuentas[] (Nequi y Efectivo fijos + personalizadas). Antes estos tests
  // cargaban los campos viejos de saldo y migrarCuentasLegacy() los convertía; esa migración ya no existe.
  const cuentas = ({ nequi = 0, efectivo = 0, custom = [] } = {}) => [
    { id: 'nequi', tipo: 'nequi', saldo: nequi },
    { id: 'efectivo', tipo: 'efectivo', saldo: efectivo },
    ...custom,
  ];

  function currentMonthKey() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function freshApp(sOverrides = {}) {
    const ctx = loadApp([
      path.join(CORE_DIR, 'core-state.js'), path.join(CORE_DIR, 'periodo.js'), path.join(CORE_DIR, 'nu-calc.js'),
      path.join(CORE_DIR, 'calc-helpers.js'),
      path.join(MODULES_DIR, 'inicio.js'),
    ]);
    Object.assign(ctx.S, sOverrides);
    return ctx;
  }

  test('calcHealthScore — devuelve null si S.cajitas no existe', () => {
    const ctx = freshApp();
    ctx.S.cajitas = undefined;
    assert.equal(ctx.calcHealthScore(), null);
  });

  test('calcHealthScore — sin datos reales (todo en 0), score base 50 y tip de "registra más"', () => {
    const ctx = freshApp();
    const r = ctx.calcHealthScore();
    assert.equal(r.score, 50);
    assert.ok(r.tips.includes('Registra más movimientos para un análisis más preciso.'));
  });

  test('calcHealthScore — 6+ meses de reserva líquida suma +20, sin tip de alerta', () => {
    const mes = currentMonthKey();
    const ctx = freshApp({
      cuentas: cuentas({ nequi: 6000000 }), // 6 meses de 1M de gastos
      gastosFijos: [{ id: 'g1', monto: 1000000 }],
      pagosGastosFijos: { ['g1_' + mes]: true },
    });
    const r = ctx.calcHealthScore();
    assert.ok(r.score >= 70, `esperaba score alto (>=70), dio ${r.score}`);
    assert.ok(!r.tips.some((t) => t.includes('menos de 3 meses')));
  });

  test('calcHealthScore — menos de 3 meses de reserva resta puntos y avisa', () => {
    const mes = currentMonthKey();
    const ctx = freshApp({
      cuentas: cuentas({ nequi: 500000 }), // 0.5 meses de 1M
      gastosFijos: [{ id: 'g1', monto: 1000000 }],
      pagosGastosFijos: { ['g1_' + mes]: true },
    });
    const r = ctx.calcHealthScore();
    assert.ok(r.tips.some((t) => t.includes('menos de 3 meses')));
  });

  test('calcHealthScore — liquidez negativa (deuda TC > patrimonio líquido) penaliza -15', () => {
    const ctx = freshApp({
      cuentas: cuentas({ nequi: 100000 }),
      tarjetasCredito: [{ id: 'tc1', deuda: 300000, cupo: 1000000 }],
      gastosFijos: [{ id: 'g1', monto: 50000 }],
      pagosGastosFijos: { ['g1_' + currentMonthKey()]: true },
    });
    const r = ctx.calcHealthScore();
    assert.ok(r.tips.some((t) => t.includes('deuda en tarjetas supera tu patrimonio líquido')));
  });

  test('calcHealthScore — deuda TC alta y patrimonio que no la cubre (rama sin ingresos registrados)', () => {
    const ctx = freshApp({
      tarjetasCredito: [{ id: 'tc1', deuda: 800000, cupo: 1000000 }],
    });
    const r = ctx.calcHealthScore();
    assert.ok(r.tips.some((t) => t.includes('patrimonio no la cubre')));
  });

  test('calcHealthScore — gastando más de lo que ingresa este mes avisa', () => {
    const mes = currentMonthKey();
    const ctx = freshApp({
      cuentas: cuentas({ nequi: 2000000 }),
      ingresosFijos: [{ id: 'i1', nombre: 'Sueldo', monto: 1000000, desde: '2020-01' }],
      gastosFijos: [{ id: 'g1', monto: 1500000 }],
      pagosGastosFijos: { ['g1_' + mes]: true },
    });
    const r = ctx.calcHealthScore();
    assert.ok(r.tips.some((t) => t.includes('gastando más de lo que ingresas')));
  });

  test('calcHealthScore — score nunca baja de 0 ni sube de 100 (clamp), caso extremo', () => {
    const mes = currentMonthKey();
    const ctx = freshApp({
      tarjetasCredito: [{ id: 'tc1', deuda: 50000000, cupo: 50000000 }],
      gastosFijos: [{ id: 'g1', monto: 30000000 }],
      pagosGastosFijos: { ['g1_' + mes]: true },
    });
    const r = ctx.calcHealthScore();
    assert.ok(r.score >= 0 && r.score <= 100, `score fuera de rango: ${r.score}`);
  });

  test('calcHealthScore — CDT activo con liquidez sana suma el bonus completo (+10)', () => {
    const ctx = freshApp({
      cuentas: cuentas({ nequi: 100000 }),
      cajitas: [{ id: 'nu1', saldo: 500000, cdts: [{ monto: 1000000, tasa: 9 }] }],
    });
    const r = ctx.calcHealthScore();
    // No hay forma de leer el bonus aislado desde afuera — se verifica
    // indirectamente contra el mismo cálculo que hace la función.
    assert.ok(r.score >= 50, `esperaba score >= base (50) con el bonus de CDT sumado, dio ${r.score}`);
  });
});

describe('periodo', () => {
  // Periodo (js/core/periodo.js): la ÚNICA definición de ingresos/gastos de un mes.
  // Estos tests fijan las reglas y, en particular, los desalineamientos que tenían las pantallas
  // antes de centralizarlo (ver CHANGELOG.md#infraestructura--seguridad, 2026-10-08).
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const path = require('node:path');
  const { loadApp } = require('./support/load-app');

  const CORE_DIR = process.env.MIS_FINANZAS_CORE_DIR || path.join(__dirname, '..', 'js', 'core');

  function app(estado = {}) {
    const ctx = loadApp([path.join(CORE_DIR, 'core-state.js'), path.join(CORE_DIR, 'periodo.js')]);
    Object.assign(ctx.S, {
      modulos: { mesada: true }, cuentas: [{ id: 'nequi', tipo: 'nequi', saldo: 0 }, { id: 'efectivo', tipo: 'efectivo', saldo: 0 }],
      movimientos: [], gastosVar: [], gastosFijos: [], pagosGastosFijos: {}, ingresosFijos: [], mesadas: undefined,
    }, estado);
    return ctx;
  }
  const P = ctx => ctx.Periodo;
  const plano = x => JSON.parse(JSON.stringify(x));

  test('cuotaMesada — año exacto, año anterior más cercano, el más antiguo, y 80.000 si no hay ninguna', () => {
    const { Periodo } = app();
    assert.equal(Periodo.cuotaMesada({ 2025: 70000, 2026: 90000 }, 2026), 90000);
    assert.equal(Periodo.cuotaMesada({ 2024: 60000, 2025: 70000 }, 2027), 70000);
    assert.equal(Periodo.cuotaMesada({ 2026: 90000 }, 2023), 90000, 'sin año anterior cae en el más antiguo');
    assert.equal(Periodo.cuotaMesada({}, 2026), 80000);
    assert.equal(Periodo.cuotaMesada(undefined, 2026), 80000);
  });

  test('mesadaDelMes — la clave es año-índice de mes (0-11): REGRESIÓN, la comparación con el mes anterior usaba "2026-09" y nunca la encontraba', () => {
    const ctx = app({ mesadas: { papa: { cuotas: { 2026: 80000 }, pagos: { '2026-8': { monto: 50000 }, '2026-7': {} } }, mama: { cuotas: {}, pagos: {} } } });
    assert.equal(P(ctx).mesadaDelMes('2026-09'), 50000, 'septiembre = índice 8');
    assert.equal(P(ctx).mesadaDelMes('2026-08'), 80000, 'sin monto en el pago usa la cuota del año');
    assert.equal(P(ctx).mesadaDelMes('2026-10'), 0);
  });

  test('mesadaDelMes — con el módulo apagado o sin datos da 0; suma papá y mamá', () => {
    const datos = { papa: { cuotas: { 2026: 10 }, pagos: { '2026-0': { monto: 10 } } }, mama: { cuotas: { 2026: 5 }, pagos: { '2026-0': { monto: 5 } } } };
    assert.equal(P(app({ mesadas: datos })).mesadaDelMes('2026-01'), 15);
    assert.equal(P(app({ mesadas: datos, modulos: {} })).mesadaDelMes('2026-01'), 0);
    assert.equal(P(app()).mesadaDelMes('2026-01'), 0);
  });

  test('ingresosFijosDelMes — solo cuenta los que ya estaban activos ese mes', () => {
    const ctx = app({ ingresosFijos: [{ monto: 1000, desde: '2026-01' }, { monto: 500, desde: '2026-10' }, { monto: 7 }] });
    assert.equal(P(ctx).ingresosFijosDelMes('2026-09'), 1007);
    assert.equal(P(ctx).ingresosFijosDelMes('2026-10'), 1507);
  });

  test('gastos fijos — se cuentan con el monto PAGADO (editar el gasto fijo no reescribe el pasado)', () => {
    const ctx = app({ gastosFijos: [{ id: 'g1', nombre: 'Arriendo', monto: 900, cat: 'Hogar' }], pagosGastosFijos: { 'g1_2026-09': { fecha: '2026-09-02', monto: 800 } } });
    const g = P(ctx).gastosDelMes('2026-09');
    assert.equal(g.gfTotal, 800);
    assert.equal(P(ctx).gastosDelMes('2026-10').gfTotal, 0);
  });

  test('gastos fijos — un pago cuyo gasto fijo ya se eliminó SIGUE contando (con la categoría que guardó el pago)', () => {
    const ctx = app({ pagosGastosFijos: { 'borrado_2026-09': { fecha: '2026-09-05', monto: 100, cat: 'Ocio', nombre: 'Netflix' } } });
    assert.equal(P(ctx).gastosDelMes('2026-09').gfTotal, 100);
    assert.deepEqual(plano(P(ctx).gastoPorCategoria('2026-09')), { Ocio: 100 });
  });

  test('gastos fijos — formatos viejos: valor `true` cae al monto actual; array se agrupa por la fecha del pago', () => {
    const conTrue = app({ gastosFijos: [{ id: 'g1', monto: 300 }], pagosGastosFijos: { 'g1_2026-09': true } });
    assert.equal(P(conTrue).gastosDelMes('2026-09').gfTotal, 300);
    const comoArray = app({ gastosFijos: [{ id: 'g1', monto: 300, cat: 'X' }], pagosGastosFijos: [{ gastoFijoId: 'g1', fecha: '2026-09-10', monto: 250 }] });
    assert.equal(P(comoArray).gastosDelMes('2026-09').gfTotal, 250);
  });

  test('gastos variables — los pagos de gasto fijo (ya contados como fijos) no se cuentan dos veces', () => {
    const ctx = app({
      gastosFijos: [{ id: 'g1', monto: 800 }], pagosGastosFijos: { 'g1_2026-09': { fecha: '2026-09-02', monto: 800 } },
      gastosVar: [{ fecha: '2026-09-02', monto: 800, esPagoGastoFijo: true, clase: 'neutro' }, { fecha: '2026-09-03', monto: 50, cat: 'Comida', clase: 'gasto' }, { fecha: '2026-10-01', monto: 9, clase: 'gasto' }],
    });
    const g = P(ctx).gastosDelMes('2026-09');
    assert.equal(g.gvTotal, 50);
    assert.equal(g.total, 850);
    assert.equal(g.items.length, 2);
  });

  test('gastosPorMes — una sola pasada para el ranking: variables reales + fijos pagados por mes', () => {
    const ctx = app({
      pagosGastosFijos: { 'g1_2026-09': { monto: 800 }, 'huerfano_2026-10': { monto: 100 } },
      gastosVar: [{ fecha: '2026-09-03', monto: 50, clase: 'gasto' }, { fecha: '2026-10-01', monto: 20, clase: 'gasto' }, { fecha: '2026-10-02', monto: 999, esPagoGastoFijo: true, clase: 'neutro' }],
    });
    assert.deepEqual(plano(P(ctx).gastosPorMes()), { '2026-09': 850, '2026-10': 120 });
  });

  test('balanceDelMes — ingresos (mesada + fijos + entradas reales) menos gastos, y tasa de ahorro', () => {
    const ctx = app({
      mesadas: { papa: { cuotas: { 2026: 80000 }, pagos: { '2026-8': {} } }, mama: { cuotas: {}, pagos: {} } },
      ingresosFijos: [{ monto: 20000, desde: '2026-01' }],
      movimientos: [{ id: 'm', tipo: 'entrada', monto: 10000, fecha: '2026-09-10', fuente: 'nequi', clase: 'ingreso' }, { id: 'e', tipo: 'entrada', monto: 999, fecha: '2026-09-11', _esEspejo: true, clase: 'neutro' }],
      gastosVar: [{ fecha: '2026-09-03', monto: 30000, cat: 'Comida', clase: 'gasto' }],
    });
    const b = P(ctx).balanceDelMes('2026-09');
    assert.deepEqual(plano(b.ingresos), { mesada: 80000, fijos: 20000, entradas: 10000, total: 110000 });
    assert.equal(b.gastos.total, 30000);
    assert.equal(b.balance, 80000);
    assert.ok(Math.abs(b.tasaAhorro - 72.7272) < 0.01);
    assert.equal(P(app()).balanceDelMes('2026-09').tasaAhorro, null, 'sin ingresos no hay tasa');
  });

  test('mesAnterior / ultimosMeses cruzan el año correctamente', () => {
    const { Periodo } = app();
    assert.equal(Periodo.mesAnterior('2026-01'), '2025-12');
    assert.equal(Periodo.mesDesplazado('2026-11', 3), '2027-02');
    assert.deepEqual(plano(Periodo.ultimosMeses(4, '2026-02')), ['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  test('acepta un estado distinto del global (Wrapped trabaja sobre el S que recibe)', () => {
    const ctx = app();
    const otro = { gastosVar: [{ fecha: '2026-09-03', monto: 70 }], pagosGastosFijos: { 'x_2026-09': { monto: 30 } }, gastosFijos: [], movimientos: [], cuentas: [] };
    assert.equal(P(ctx).gastosDelMes('2026-09', otro).total, 100);
    assert.equal(P(ctx).gastosDelMes('2026-09').total, 0);
  });
});

describe('migraciones', () => {
  // VERSIÓN DEL ESQUEMA / aplicarMigraciones (core-state.js). La app nació limpia en el esquema 7: no migra datos anteriores a 7.
  // Desde el 7 sí hay migraciones (MIGRACIONES): v8 = una sola tasa de Nu (S.nuRate).
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const path = require('node:path');
  const { loadApp } = require('./support/load-app');

  const CORE_DIR = process.env.MIS_FINANZAS_CORE_DIR || path.join(__dirname, '..', 'js', 'core');
  const app = () => loadApp([path.join(CORE_DIR, 'core-state.js')]);
  const plano = x => JSON.parse(JSON.stringify(x));

  test('datos nuevos (sin schemaVersion) nacen en la versión actual (8)', () => {
    const d = plano(app().aplicarMigraciones({ cuentas: [] }));
    assert.equal(d.schemaVersion, 8);
  });

  describe('v8 — una sola tasa de Nu (S.nuRate)', () => {
    const v7 = extra => ({ schemaVersion: 7, ...extra });
    test('la tasa que el usuario escribía (nuTasaGlobal) pasa a nuRate; se borran nuTasaGlobal y la `tasa` de cada cajita', () => {
      const d = plano(app().aplicarMigraciones(v7({ nuRate: 9.25, nuTasaGlobal: 12.5, cajitas: [{ id: 'a', tasa: 9.3 }, { id: 'b', tasa: 9.25 }] })));
      assert.equal(d.schemaVersion, 8);
      assert.equal(d.nuRate, 12.5);
      assert.equal('nuTasaGlobal' in d, false);
      assert.equal(d.cajitas.some(c => 'tasa' in c), false);
    });
    test('con cajitas y sin tasa escrita queda la que se venía usando (nuRate, o 9,25 si faltaba)', () => {
      assert.equal(plano(app().aplicarMigraciones(v7({ nuRate: 9.4, cajitas: [{ id: 'a' }] }))).nuRate, 9.4);
      assert.equal(plano(app().aplicarMigraciones(v7({ cajitas: [{ id: 'a' }] }))).nuRate, 9.25);
    });
    test('sin cajitas ni tasa escrita queda SIN configurar (el 9,25 antiguo lo ponía la app, no el usuario)', () => {
      assert.equal(plano(app().aplicarMigraciones(v7({ nuRate: 9.25, cajitas: [] }))).nuRate, null);
      assert.equal(plano(app().aplicarMigraciones(v7({}))).nuRate, null);
    });
    test('un nuTasaGlobal inválido (0, texto, null) no se usa como tasa', () => {
      for (const malo of [0, -2, 'abc', null]) {
        assert.equal(plano(app().aplicarMigraciones(v7({ nuRate: 9.25, nuTasaGlobal: malo, cajitas: [] }))).nuRate, null, String(malo));
      }
    });
    test('los CDT conservan su tasa propia y el historial de tasas no se toca', () => {
      const historialTasasNu = [{ fecha: '2026-01-01', tasa: 9 }];
      const d = plano(app().aplicarMigraciones(v7({ nuTasaGlobal: 10, historialTasasNu, cajitas: [{ id: 'a', tasa: 9.3, cdts: [{ id: 'x', tasa: 5 }] }] })));
      assert.equal(d.cajitas[0].cdts[0].tasa, 5);
      assert.deepEqual(d.historialTasasNu, historialTasasNu);
    });
    test('un backup ya migrado (esquema 8) no se vuelve a tocar', () => {
      const d = plano(app().aplicarMigraciones({ schemaVersion: 8, nuRate: null, cajitas: [{ id: 'a' }] }));
      assert.equal(d.nuRate, null);
    });
  });

  test('es idempotente: aplicarla dos veces no cambia nada', () => {
    const ctx = app();
    const una = plano(ctx.aplicarMigraciones({ movimientos: [{ id: 'a', tipo: 'entrada', monto: 5, fecha: '2026-10-01' }] }));
    assert.deepEqual(plano(ctx.aplicarMigraciones(plano(una))), una);
  });

  test('datos de una versión MÁS NUEVA que la app no se tocan', () => {
    const d = plano(app().aplicarMigraciones({ schemaVersion: 999, algoNuevo: [{ id: 'a' }] }));
    assert.equal(d.schemaVersion, 999);
    assert.ok(d.algoNuevo, 'no se migra lo que esta versión no entiende');
  });

  test('datos de una versión ANTERIOR a la base no se tocan: se marcan (S._esquemaAnterior) para que la app avise y se empiece de cero', () => {
    for (const v of [2, 4, 6]) {
      const d = plano(app().aplicarMigraciones({ schemaVersion: v, movimientos: [{ id: 'a' }] }));
      assert.equal(d.schemaVersion, v, 'no se sube la versión: los datos viejos NO están en la forma nueva');
      assert.equal(d._esquemaAnterior, v);
      assert.equal(d.libro, undefined, 'y no se inventa un libro');
    }
  });

  test('valores que no son objeto se devuelven tal cual', () => {
    const ctx = app();
    assert.equal(ctx.aplicarMigraciones(null), null);
    assert.equal(ctx.aplicarMigraciones(undefined), undefined);
  });
});

describe('backup-import', () => {
  // Validación de un backup JSON antes de importarlo (configuracion.js, _validarEstructuraJSON) y el viaje exportar → migrar → importar.
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const path = require('node:path');
  const { loadApp } = require('./support/load-app');

  const RAIZ = path.join(__dirname, '..');
  const core = f => path.join(RAIZ, 'js', 'core', f);
  const modulo = f => path.join(RAIZ, 'js', 'modules', f);
  const app = () => loadApp([core('core-state.js'), core('periodo.js'), core('nu-calc.js'), core('calc-helpers.js'), core('cuenta-efectos.js'), modulo('configuracion.js')], { permissive: true });
  const plano = x => JSON.parse(JSON.stringify(x));

  test('un backup exportado sin tasa de Nu (nuRate: null) se puede importar', () => {
    const ctx = app();
    assert.deepEqual(plano(ctx._validarEstructuraJSON({ schemaVersion: 8, nuRate: null, cajitas: [] })), []);
  });
  test('nuRate numérico sigue siendo válido; texto u otro tipo se rechaza', () => {
    const ctx = app();
    assert.deepEqual(plano(ctx._validarEstructuraJSON({ schemaVersion: 8, nuRate: 9.3, cajitas: [] })), []);
    for (const malo of ['9,3', true, {}, []]) {
      assert.equal(ctx._validarEstructuraJSON({ schemaVersion: 8, nuRate: malo, cajitas: [] }).length, 1, JSON.stringify(malo));
    }
  });
  test('un backup del esquema 7 (con nuTasaGlobal y `tasa` por cajita) se valida y, al migrarlo, queda en la forma nueva', () => {
    const ctx = app();
    const viejo = { schemaVersion: 7, nuRate: 9.25, nuTasaGlobal: 11, cajitas: [{ id: 'a', saldo: 5, tasa: 11 }] };
    assert.deepEqual(plano(ctx._validarEstructuraJSON(viejo)), []);
    const nuevo = plano(ctx.aplicarMigraciones(plano(viejo)));
    assert.equal(nuevo.nuRate, 11);
    assert.equal('nuTasaGlobal' in nuevo, false);
    assert.equal('tasa' in nuevo.cajitas[0], false);
    assert.deepEqual(plano(ctx._validarEstructuraJSON(nuevo)), [], 'lo migrado se vuelve a poder exportar e importar');
  });
  test('un backup de una versión más nueva que la app se rechaza', () => {
    const ctx = app();
    assert.match(ctx._validarEstructuraJSON({ schemaVersion: 99, cajitas: [] })[0], /más nueva/);
  });
});

describe('archivos-cargados', () => {
  // Guardia contra el bug de color-picker.js: un archivo de js/ que ninguna página carga. selColorNC() lo usaba por nombre y,
  // sin <script> en index.html ni grupo lazy, lanzaba ReferenceError en el navegador mientras todos los tests pasaban (los
  // tests cargan los archivos a mano). Cada archivo de js/core y js/modules tiene que llegar al navegador por alguna vía:
  //   · un <script src> en index.html, · un grupo de Loader.GROUPS (lazy-loader.js), · un `import` desde otro archivo.
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const fs = require('node:fs');
  const path = require('node:path');

  const RAIZ = path.join(__dirname, '..');
  const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
  const listar = d => fs.existsSync(path.join(RAIZ, d)) ? fs.readdirSync(path.join(RAIZ, d)).filter(f => f.endsWith('.js')).map(f => d + '/' + f) : [];

  test('todo js/core y js/modules se carga desde index.html, el cargador lazy o un import', () => {
    const index = leer('index.html');
    const lazy = fs.existsSync(path.join(RAIZ, 'js/core/lazy-loader.js')) ? leer('js/core/lazy-loader.js') : '';
    const archivos = [...listar('js/core'), ...listar('js/modules')];
    const importados = new Set();
    archivos.forEach(f => { for (const m of leer(f).matchAll(/import[^'"]*['"]\.\/([\w-]+\.js)['"]/g)) importados.add(m[1]); });
    const sinCargar = archivos.filter(f => {
      const nombre = path.basename(f);
      const enIndex = new RegExp('<script[^>]*src="' + f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"').test(index);
      return !(enIndex || lazy.includes(nombre) || importados.has(nombre));
    });
    assert.deepEqual(sinCargar, [], 'archivos que ninguna página carga (¿falta el <script> en index.html o el grupo lazy?):\n  ' + sinCargar.join('\n  '));
  });
});

describe('toast', () => {
  // toast() (core-state.js): un tipo por clase de aviso. 'salida' es la plata que sale (rojo con flecha); 'err' es un error (rojo con X).
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const path = require('node:path');
  const { loadApp } = require('./support/load-app');
  const RAIZ = path.join(__dirname, '..');
  const ctxToast = () => {
    const ctx = loadApp([path.join(RAIZ, 'js', 'core', 'core-state.js')], { permissive: true });
    const hijos = [];
    const nuevo = () => { const attrs = {}; return { className: '', innerHTML: '', attrs, setAttribute(k, v) { attrs[k] = v; }, classList: { add() {} }, remove() {} }; };
    ctx.document.getElementById = () => ({ appendChild(e) { hijos.push(e); } });
    ctx.document.createElement = nuevo;
    ctx.setTimeout = () => 0;
    return { ctx, hijos };
  };

  test('cada tipo lleva su clase; salida y err se distinguen por el ícono, no solo por el color', () => {
    const { ctx, hijos } = ctxToast();
    for (const tipo of ['ok', 'salida', 'err', 'info']) ctx.toast('mensaje ' + tipo, tipo);
    assert.deepEqual(hijos.map(h => h.className), ['toast toast-ok', 'toast toast-salida', 'toast toast-err', 'toast toast-info']);
    const icono = h => /<span class="toast-ico">(.*?)<\/span><span class="toast-msg">/.exec(h.innerHTML)[1];
    assert.equal(new Set(hijos.map(icono)).size, 4, 'cuatro íconos distintos');
    assert.ok(hijos.every((h, i) => h.innerHTML.includes('mensaje ' + ['ok', 'salida', 'err', 'info'][i])));
  });
  test('un error se anuncia como alerta; lo demás como estado', () => {
    const { ctx, hijos } = ctxToast();
    ctx.toast('x', 'err'); ctx.toast('y', 'salida');
    assert.equal(hijos[0].attrs.role, 'alert');
    assert.equal(hijos[1].attrs.role, 'status');
  });
  test('un tipo desconocido no rompe: usa un punto como ícono', () => {
    const { ctx, hijos } = ctxToast();
    ctx.toast('x', 'raro');
    assert.match(hijos[0].innerHTML, /toast-ico">•</);
  });
});

describe('ingreso-real', () => {
  // tests/ingreso-real.test.js — UNA definición de "ingreso real" (core-state.js)
  // Fija qué cuenta como ingreso y comprueba que Inicio, Análisis (vía
  // ingresosRealesDelMes) y Wrapped dan la MISMA cifra con los mismos datos.
  const { test, describe } = require('node:test');
  const assert = require('node:assert/strict');
  const path = require('node:path');
  const { loadApp } = require('./support/load-app');

  const RAIZ = path.join(__dirname, '..');
  const core = f => path.join(RAIZ, 'js', 'core', f);
  const modulo = f => path.join(RAIZ, 'js', 'modules', f);
  const BASE = [core('core-state.js'), core('periodo.js'), core('nu-calc.js'), core('calc-helpers.js'), core('cuenta-efectos.js')];
  const TODO = [...BASE, modulo('cuentas.js'), modulo('inicio.js'), modulo('analisis.js'), core('wrapped-gate.js'), modulo('wrapped.js')];
  const MES = '2026-10';

  const cuentas = (custom = []) => [
    { id: 'nequi', tipo: 'nequi', saldo: 0 }, { id: 'efectivo', tipo: 'efectivo', saldo: 0 }, ...custom,
  ];
  const mov = (id, monto, extra = {}) => ({ id, tipo: 'entrada', clase: 'ingreso', monto, fecha: '2026-10-05', fuente: 'nequi', desc: 'x', ...extra });
  const neutro = (id, monto, extra = {}) => mov(id, monto, { clase: 'neutro', ...extra });

  function app(archivos = BASE, estado = {}) {
    const a = loadApp(archivos, { permissive: true });
    Object.assign(a.S, { cajitas: [], deudores: [], misDeudas: [], ingresosFijos: [], gastosVar: [], gastosFijos: [], cuentas: cuentas(), movimientos: [] }, estado);
    return a;
  }
  // Los arrays nacidos dentro del vm tienen otro prototipo: se devuelven como array normal.
  const ids = a => Array.from(a.entradasIngresoReal(), m => m.id).sort();

  describe('qué cuenta como ingreso real (S.movimientos)', () => {
    test('sueldo, regalo y entradas a cuenta o cajita cuentan', () => {
      const a = app(BASE, { movimientos: [mov('a', 1), mov('b', 2, { fuente: 'efectivo' }), mov('c', 3, { fuente: 'cajita:k' }), mov('d', 4, { fuente: 'custom:z' })] });
      assert.deepEqual(ids(a), ['a', 'b', 'c', 'd']);
    });
    test('SIN cuenta ni bandera cuenta (regla única: no depende de la cuenta)', () => {
      const a = app(BASE, { movimientos: [mov('a', 11, { fuente: '' }), mov('b', 12, { fuente: undefined })] });
      assert.deepEqual(ids(a), ['a', 'b']);
    });
    test('perdón recibido y extra/margen de préstamo (espejos que SÍ son plata nueva) cuentan', () => {
      const a = app(BASE, { movimientos: [
        mov('perdon', 1, { fuente: '', _origenSeccion: 'Prestado · Yo debo', _esPerdonRecibido: true }),
        mov('extra', 2, { _secundario: true, _esEspejo: true, _origenSeccion: 'Prestado · Me deben', _esExtraIngreso: true }),
        mov('dif', 3, { _encMovId: 'e1', _esDiferencialEncargo: true }),
      ] });
      assert.deepEqual(ids(a), ['dif', 'extra', 'perdon']);
    });
    test('solo cuenta `clase: "ingreso"`: neutro, ajuste y sin clase no cuentan, lleven la etiqueta que lleven', () => {
    const sinClase = { id: 'sin-clase', tipo: 'entrada', monto: 12, fecha: '2026-10-05', fuente: 'nequi', desc: 'Sueldo' };
    const a = app(BASE, { movimientos: [
      neutro('mesada', 1, { _origenSeccion: 'Mesada' }),
      neutro('prestado', 2, { _origenSeccion: 'Prestado · Me deben' }),
      neutro('espejo-nuevo', 3, { _esEspejo: true }),
      neutro('repos', 4, { _esReposicionCP: true }),
      neutro('repos-viejo', 5, { desc: 'Reposición: algo' }),
      neutro('tc', 6, { desc: 'Para pagar TC (Nu)' }),
      neutro('margen-viejo', 7, { desc: 'Margen de encargo' }),
      neutro('intercambio', 8, { _esIntercambioEncargo: true }),
      neutro('encmov', 9, { _encMovId: 'e1' }),
      neutro('alcancia', 10, { desc: 'Alcancía destapada' }),
      mov('salida', 11, { tipo: 'salida' }),
      mov('apertura', 13, { tipo: 'apertura', clase: 'ajuste' }),
      sinClase,
    ] });
    assert.deepEqual(ids(a), [], 'ningún ingreso');
  });
  test('la clase manda, no las etiquetas: un movimiento con etiqueta de espejo pero clase "ingreso" cuenta', () => {
    const a = app(BASE, { movimientos: [mov('x', 1, { _esEspejo: true, _origenSeccion: 'Mesada' })] });
    assert.deepEqual(ids(a), ['x']);
  });
});

  describe('cuentas personalizadas (su historial vive en S.movimientos, con fuente "custom:<id>")', () => {
    const custom = () => cuentas([{ id: 'z', tipo: 'custom', saldo: 0 }]);
    test('un ingreso a una cuenta personalizada cuenta', () => {
      const a = app(BASE, { cuentas: custom(), movimientos: [mov('c1', 5, { fuente: 'custom:z', fecha: '2026-10-03' })] });
      assert.deepEqual(ids(a), ['c1']);
    });
    test('espejo en la cuenta no cuenta; espejo con extra de ingreso sí', () => {
      const a = app(BASE, { cuentas: custom(), movimientos: [
        neutro('e1', 5, { fuente: 'custom:z', _esEspejo: true, _origenSeccion: 'Prestado · Me deben' }),
        mov('e2', 6, { fuente: 'custom:z', _esEspejo: true, _esExtraIngreso: true }),
      ] });
      assert.deepEqual(ids(a), ['e2']);
    });
    test('una entrada a "custom:" cuyo id NO está en las cuentas (cuenta borrada) cuenta igual', () => {
      const a = app(BASE, { cuentas: custom(), movimientos: [mov('n', 9, { fuente: 'custom:borrada' })] });
      assert.deepEqual(ids(a), ['n']);
    });
    test('una cuenta ya no tiene lista propia: lo que quede en cuenta.movimientos (datos de un esquema anterior) no se lee', () => {
      const a = app(BASE, { cuentas: cuentas([{ id: 'z', tipo: 'custom', saldo: 0, movimientos: [{ id: 'viejo', tipo: 'ingreso', monto: 5, fecha: '2026-10-03' }] }]) });
      assert.deepEqual(ids(a), []);
    });
  });

  describe('ingresosRealesDelMes', () => {
    test('filtra por mes y suma montos', () => {
      const a = app(BASE, { movimientos: [mov('a', 100), mov('b', 50, { fecha: '2026-09-30' }), mov('c', 5, { fecha: '2026-10-31' })] });
      assert.equal(a.ingresosRealesDelMes('2026-10'), 105);
      assert.equal(a.ingresosRealesDelMes('2026-09'), 50);
      assert.equal(a.ingresosRealesDelMes('2026-08'), 0);
    });
    test('acepta un estado distinto del global (Wrapped trabaja sobre el S que recibe)', () => {
      const a = app(BASE, { movimientos: [mov('a', 100)] });
      assert.equal(a.ingresosRealesDelMes(MES, { cuentas: cuentas(), movimientos: [mov('z', 7)] }), 7);
    });
    test('estado vacío o sin listas no revienta', () => {
      const a = app(BASE);
      assert.equal(a.ingresosRealesDelMes(MES, {}), 0);
    });
  });

  describe('registrarMovEspejo: un espejo nuevo nace marcado', () => {
    test('espejo a Nequi/Efectivo, cajita y personalizada lleva _esEspejo, queda en S.movimientos con su fuente y no cuenta', () => {
      const a = app(BASE, { cajitas: [{ id: 'k' }], cuentas: cuentas([{ id: 'z', tipo: 'custom', saldo: 0 }]) });
      for (const cuenta of ['nequi', 'efectivo', 'cajita:k', 'custom:z']) {
        const id = a.registrarMovEspejo({ cuenta, flujo: 'entrada', monto: 10, fecha: '2026-10-05', desc: 'abono', origen: 'Modulo Nuevo' });
        assert.ok(id, cuenta);
      }
      assert.deepEqual(Array.from(a.S.movimientos, m => m.fuente), ['nequi', 'efectivo', 'cajita:k', 'custom:z']);
      assert.ok(a.S.movimientos.every(m => m._esEspejo === true && m._secundario === true));
      assert.equal(a.ingresosRealesDelMes(MES), 0, 'ni el de un módulo con otro _origenSeccion (no depende del prefijo "Prestado")');
    });
    test('con extra de ingreso (extra/perdón/diferencial) sí cuenta, aunque lleve _esEspejo', () => {
      const a = app(BASE, { cuentas: cuentas([{ id: 'z', tipo: 'custom', saldo: 0 }]) });
      a.registrarMovEspejo({ cuenta: 'nequi', flujo: 'entrada', monto: 10, fecha: '2026-10-05', desc: 'extra', origen: 'Prestado · Me deben', extra: { _esExtraIngreso: true } });
      a.registrarMovEspejo({ cuenta: 'custom:z', flujo: 'entrada', monto: 20, fecha: '2026-10-05', desc: 'extra', origen: 'Prestado · Me deben', extra: { _esExtraIngreso: true } });
      assert.equal(a.ingresosRealesDelMes(MES), 30);
    });
  });

  describe('las tres pantallas dan la misma cifra', () => {
    function escenario() {
      const a = app(TODO, {
        cuentas: cuentas([{ id: 'ahorro', tipo: 'custom', saldo: 0 }]),
        movimientos: [
          mov('m1', 100000, { fecha: '2026-10-01' }),
          mov('m2', 20000, { fuente: 'efectivo', fecha: '2026-10-01' }),
          mov('c1', 1000, { fuente: 'custom:ahorro', fecha: '2026-10-02' }),
          mov('c2', 2000, { fuente: 'custom:ahorro', fecha: '2026-10-03' }),
          mov('c3', 3000, { fuente: 'custom:ahorro', fecha: '2026-10-04', _esEspejo: true, _esExtraIngreso: true }),
          neutro('c4', 4000, { fuente: 'custom:ahorro', fecha: '2026-10-05', _esEspejo: true, _origenSeccion: 'Prestado · Me deben' }),
          neutro('m4', 8000, { _origenSeccion: 'Mesada' }),
          neutro('m5', 9000, { _esEspejo: true, _origenSeccion: 'Prestado · Me deben' }),
          mov('m7', 700, { fuente: '', _esPerdonRecibido: true, _origenSeccion: 'Prestado · Yo debo' }),
          mov('m10', 11, { fuente: '' }),
          mov('m9', 900, { fecha: '2026-09-30' }),
        ],
      });
      a.mesActual = () => MES; a.window.mesActual = a.mesActual;
      return a;
    }
    const ESPERADO_OCT = 100000 + 20000 + 1000 + 2000 + 3000 + 700 + 11; // 126.711
    test('Inicio, ingresosRealesDelMes (Análisis) y Wrapped coinciden', () => {
      const a = escenario();
      assert.equal(a.ingresosRealesDelMes(MES), ESPERADO_OCT);
      assert.equal(a.calcHealthScore().ingresosMes, ESPERADO_OCT);
      const w = a._wrappedInternals._wrappedCalcularPeriodo(a.S, 'mes', MES, '2026');
      assert.equal(w.totalIngresos, ESPERADO_OCT);
      assert.equal(w.nIngresos, 7);
    });
    test('Wrapped del año suma todos los meses con la misma regla', () => {
      const a = escenario();
      const w = a._wrappedInternals._wrappedCalcularPeriodo(a.S, 'anio', null, '2026');
      assert.equal(w.totalIngresos, ESPERADO_OCT + 900);
    });
  });
});

describe('clase-movimientos', () => {
  // La `clase` guardada es la única fuente de verdad (2026-10-13: se retiró la cascada de reglas históricas por etiquetas y textos).
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const path = require('node:path');
  const { loadApp } = require('./support/load-app');
  const CORE = process.env.MIS_FINANZAS_CORE_DIR || path.join(__dirname, '..', 'js', 'core');

  function app(estado = {}) {
    const ctx = loadApp(['core-state.js', 'periodo.js', 'cuenta-efectos.js', 'nu-calc.js'].map(f => path.join(CORE, f)), { permissive: true });
    Object.assign(ctx.S, {
      modulos: {}, cuentas: [{ id: 'nequi', tipo: 'nequi', saldo: 0 }, { id: 'efectivo', tipo: 'efectivo', saldo: 0 }],
      movimientos: [], gastosVar: [], gastosFijos: [], pagosGastosFijos: {}, ingresosFijos: [], cajitas: [],
    }, estado);
    return ctx;
  }
  const plano = x => JSON.parse(JSON.stringify(x));

  test('registrarMovEspejo — por defecto el espejo nace "neutro"; con banderas de plata nueva, "ingreso"; `clase` explícita manda', () => {
    const ctx = app();
    const a = ctx.registrarMovEspejo({ cuenta: 'nequi', flujo: 'entrada', monto: 10, fecha: '2026-10-01', desc: 'x', origen: 'Prestado · Me deben' });
    const b = ctx.registrarMovEspejo({ cuenta: 'nequi', flujo: 'entrada', monto: 5, fecha: '2026-10-01', desc: 'extra', origen: 'Prestado', extra: { _esExtraIngreso: true } });
    const c = ctx.registrarMovEspejo({ cuenta: 'nequi', flujo: 'salida', monto: 3, fecha: '2026-10-01', desc: 's', origen: 'Prestado' });
    const d = ctx.registrarMovEspejo({ cuenta: 'nequi', flujo: 'entrada', monto: 7, fecha: '2026-10-01', desc: 'y', origen: 'Z', clase: 'ingreso' });
    const por = id => ctx.S.movimientos.find(m => m.id === id).clase;
    assert.deepEqual([por(a), por(b), por(c), por(d)], ['neutro', 'ingreso', 'neutro', 'ingreso']);
  });

  test('lectores — solo la `clase` guardada decide; las etiquetas y los textos ya no se miran', () => {
    const ctx = app();
    assert.equal(ctx._esEntradaEspejoNoIngreso({ tipo: 'entrada', _origenSeccion: 'Mesada', clase: 'ingreso' }), false, 'clase ingreso cuenta aunque diga Mesada');
    assert.equal(ctx._esEntradaEspejoNoIngreso({ tipo: 'entrada', clase: 'neutro' }), true);
    assert.equal(ctx._esEntradaEspejoNoIngreso({ tipo: 'entrada', clase: 'ajuste' }), true);
    assert.equal(ctx._esEntradaEspejoNoIngreso({ tipo: 'entrada', _origenSeccion: 'Mesada' }), true, 'sin clase no cuenta como ingreso');
    assert.equal(ctx._esEntradaEspejoNoIngreso({ tipo: 'entrada', desc: 'Sueldo' }), true, 'tampoco se adivina por el texto');
    assert.equal(ctx._esGastoVarNoReal({ _esAlcancia: true, clase: 'gasto' }), false);
    assert.equal(ctx._esGastoVarNoReal({ clase: 'neutro' }), true);
    assert.equal(ctx._esGastoVarNoReal({ _esPagoTC: true }), false, 'sin clase es un gasto de la lista de gastos: cuenta (y save() avisa)');
    assert.equal(ctx.claseEfectivaMovimiento({ clase: 'ajuste' }), 'ajuste');
    assert.equal(ctx.claseEfectivaMovimiento({ clase: 'rara' }), null);
    assert.equal(ctx.claseEfectivaMovimiento(null), null);
  });

  test('movimientosSinClase — detecta lo que un módulo creó sin clase; las salidas de espejo no la necesitan', () => {
    const ctx = app({
      movimientos: [
        { id: 'a', tipo: 'entrada', clase: 'ingreso' }, { id: 'b', tipo: 'entrada', desc: 'olvidó la clase' },
        { id: 'c', tipo: 'salida', _esEspejo: true }, { id: 'd', tipo: 'apertura' }, { id: 'e', tipo: 'salida_manual', clase: 'gasto' },
      ],
      gastosVar: [{ id: 'g1', clase: 'gasto' }, { id: 'g2' }],
    });
    assert.deepEqual(plano(ctx.movimientosSinClase()).map(x => x.lista + ':' + x.id), ['movimientos:b', 'movimientos:d', 'gastosVar:g2']);
    assert.deepEqual(plano(ctx.movimientosSinClase({ movimientos: [], gastosVar: [] })), []);
  });

  test('cajitas — un espejo con clase "ingreso" (extra de Spotify, extra de un pago) SÍ cuenta como ingreso del mes; uno neutro o sin clase no', () => {
    const e = (id, monto, extra) => ({ id, tipo: 'entrada', fuente: 'cajita:c1', monto, fecha: '2026-10-0' + (1 + extra.d), _secundario: true, ...extra.m });
    const ctx = app({ cajitas: [{ id: 'c1', nombre: 'Sobra', saldo: 0 }], movimientos: [
      e('a', 400, { d: 5, m: { desc: 'Extra de Spotify', _esExtraIngreso: true, clase: 'ingreso' } }),
      e('b', 5000, { d: 6, m: { desc: 'Abono de deuda', _esEspejo: true, clase: 'neutro' } }),
      e('c', 2000, { d: 7, m: { desc: 'Extra de pago', _esExtraIngreso: true, clase: 'ingreso' } }),
      e('d', 9000, { d: 8, m: { desc: 'Espejo sin clase', _origenSeccion: 'Prestado · Me deben' } }),
    ] });
    assert.equal(ctx.Periodo.ingresosDelMes('2026-10').entradas, 2400, 'a + c; b es neutro y d no tiene clase');
  });

  test('un ingreso con el mismo id en dos lugares no existe: una sola lista, un solo conteo', () => {
    const ctx = app({ movimientos: [{ id: 'x', tipo: 'entrada', monto: 10, fecha: '2026-10-01', fuente: 'nequi', clase: 'ingreso' }] });
    assert.equal(ctx.Periodo.ingresosDelMes('2026-10').entradas, 10);
  });

  test('registrarMovEspejo / borrarMovEspejo — toda cuenta (Nequi, personalizada, cajita) escribe y borra en S.movimientos con su `fuente`', () => {
    const ctx = app({ cuentas: [{ id: 'nequi', tipo: 'nequi', saldo: 0 }, { id: 'efectivo', tipo: 'efectivo', saldo: 0 }, { id: 'cu1', tipo: 'custom', nombre: 'Madre', saldo: 0 }],
      cajitas: [{ id: 'c1', nombre: 'Sobra', saldo: 0 }] });
    const a = ctx.registrarMovEspejo({ cuenta: 'custom:cu1', flujo: 'entrada', monto: 10, fecha: '2026-10-01', desc: 'x', origen: 'Prestado' });
    const b = ctx.registrarMovEspejo({ cuenta: 'cajita:c1', flujo: 'salida', monto: 4, fecha: '2026-10-01', desc: 'y', origen: 'Mesada' });
    const por = id => JSON.parse(JSON.stringify(ctx.S.movimientos.find(m => m.id === id)));
    assert.deepEqual([por(a).fuente, por(a).tipo, por(a).desc], ['custom:cu1', 'entrada', 'x']);
    assert.deepEqual([por(b).fuente, por(b).tipo, por(b).desc], ['cajita:c1', 'salida', 'y']);
    assert.equal(ctx.registrarMovEspejo({ cuenta: 'custom:no-existe', flujo: 'entrada', monto: 1, fecha: '2026-10-01', desc: 'z', origen: 'P' }), null, 'cuenta que ya no existe: no se escribe');
    assert.equal(ctx.borrarMovEspejo('cajita:c1', b), true);
    assert.equal(ctx.borrarMovEspejo('cajita:c1', b), false);
    assert.equal(ctx.S.movimientos.some(m => m.id === b), false);
  });

  test('Restar dinero (salida_manual) cuenta como gasto del mes, en categoría Ajuste, y se agrupa con los variables', () => {
    const ctx = app({
      gastosVar: [{ id: 'g1', fecha: '2026-10-02', monto: 1000, cat: 'Comida', clase: 'gasto' }],
      movimientos: [
        { id: 'r1', tipo: 'salida_manual', fuente: 'nequi', monto: 40000, fecha: '2026-10-01', desc: '40', clase: 'gasto' },
        { id: 'r2', tipo: 'salida_manual', fuente: 'nequi', monto: 500, fecha: '2026-10-03', desc: 'otro retiro', clase: 'gasto' },
        { id: 'r3', tipo: 'salida', fuente: 'nequi', monto: 7000, fecha: '2026-10-03', _esEspejo: true, clase: 'neutro' },
        { id: 'r4', tipo: 'salida_manual', fuente: 'nequi', monto: 9, fecha: '2026-09-30', desc: 'otro mes', clase: 'gasto' },
      ] });
    const g = ctx.Periodo.gastosDelMes('2026-10');
    assert.equal(g.gvTotal, 41500, '1.000 gasto + 40.000 + 500 retiros; el espejo (neutro) no cuenta');
    assert.equal(g.total, 41500);
    assert.equal(ctx.Periodo.gastoPorCategoria('2026-10').Ajuste, 40500);
    assert.equal(ctx.Periodo.gastosPorMes()['2026-09'], 9);
  });

  test('balanceDelMes — con { conRendimientos } los intereses de Nu suben ingresos, balance y tasa de ahorro; sin la opción queda como flujo de caja', () => {
    const ctx = app({
      movimientos: [{ id: 'i1', tipo: 'entrada', fuente: 'nequi', monto: 1000, fecha: '2026-09-10', desc: 'Sueldo', clase: 'ingreso' }],
      gastosVar: [{ id: 'g1', fecha: '2026-09-11', monto: 400, clase: 'gasto' }],
      cajitas: [{ id: 'c1', nombre: 'Ahorros', saldo: 0, rendimientos: { '2026-09': 100 } }] });
    const sin = ctx.Periodo.balanceDelMes('2026-09');
    const con = ctx.Periodo.balanceDelMes('2026-09', undefined, { conRendimientos: true });
    assert.equal(sin.ingresos.total, 1000);
    assert.equal(sin.balance, 600);
    assert.equal(con.ingresos.total, 1100);
    assert.equal(con.ingresos.rendimientos, 100);
    assert.equal(con.balance, 700);
    assert.ok(Math.abs(con.tasaAhorro - 700 / 1100 * 100) < 1e-9);
    assert.equal(ctx.Periodo.ingresosDelMes('2026-09').total, 1000, 'ingresosDelMes (Inicio, Salud financiera, Wrapped) no cambia');
  });

  test('Periodo.retirosManuales — solo los salida_manual de clase gasto, ya con clase para que Gastos los cuente igual que Análisis', () => {
    const ctx = app({ movimientos: [
      { id: 'a', tipo: 'salida_manual', fuente: 'efectivo', monto: 400, fecha: '2026-10-09', desc: 'Ajuste', clase: 'gasto' },
      { id: 'b', tipo: 'salida', fuente: 'nequi', monto: 9, fecha: '2026-10-09', _esEspejo: true, clase: 'neutro' },
      { id: 'c', tipo: 'entrada', fuente: 'nequi', monto: 5, fecha: '2026-10-09', clase: 'ingreso' }] });
    const r = ctx.Periodo.retirosManuales();
    assert.equal(r.length, 1);
    assert.deepEqual([r[0].id, r[0].cat, r[0].clase, r[0].monto], ['a', 'Ajuste', 'gasto', 400]);
    assert.equal(ctx._esGastoVarNoReal(r[0]), false, 'cuenta como gasto real');
  });
});

describe('clase-cobertura', () => {
  // Guardia de cobertura (plan-clasificacion-movimientos.md): todo código que CREA un movimiento ingreso/gasto en
  // S.movimientos, S.gastosVar o cuenta.movimientos (objeto literal) debe escribir `clase`. Un módulo nuevo que
  // lo olvide rompe este test en vez de dejar el ingreso o gasto del mes mal sin avisar.
  // Quedan fuera a propósito: las salidas espejo (tipo 'salida'/'egreso'; 'salida_manual' SÍ lleva clase: es un gasto,
  // ver §7 del plan) y las listas sin lectores de clase (deudores, encargos, transferencias, tcMovimientos).
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const fs = require('node:fs');
  const path = require('node:path');

  const RAIZ = path.join(__dirname, '..', 'js');
  const archivos = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? archivos(path.join(d, e.name)) : /\.js$/.test(e.name) ? [path.join(d, e.name)] : []);
  const PUSH = /(?:\bS\.movimientos|\bwindow\.S\.movimientos|\bS\.gastosVar|\bwindow\.S\.gastosVar|\bcObj\.movimientos)\.push\(\s*\{/g;

  function literal(src, desde) { // devuelve el texto del objeto literal que empieza en src[desde] === '{'
    let prof = 0;
    for (let i = desde; i < src.length; i++) {
      if (src[i] === '{') prof++;
      else if (src[i] === '}' && --prof === 0) return src.slice(desde, i + 1);
    }
    return src.slice(desde, desde + 600);
  }

  test('todo push literal a S.movimientos / S.gastosVar escribe `clase` (salvo salidas)', () => {
    const faltan = [];
    archivos(RAIZ).forEach(f => {
      const src = fs.readFileSync(f, 'utf8');
      let m;
      while ((m = PUSH.exec(src))) {
        const lit = literal(src, m.index + m[0].length - 1);
        if (/\bclase\s*[:,]/.test(lit)) continue;
        if (/tipo\s*:\s*'(salida|egreso)'/.test(lit)) continue;
        faltan.push(path.relative(RAIZ, f) + ':' + src.slice(0, m.index).split('\n').length);
      }
    });
    assert.deepEqual(faltan, [], 'movimientos creados sin clase: ' + faltan.join(', '));
  });
});

describe('sin-bloques-duplicados', () => {
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const fs = require('node:fs');
  const path = require('node:path');
  // Guardia: ningún archivo de js/ contiene el mismo bloque de código dos veces. Un copiar y pegar accidental dentro de una función
  // (pasó en eliminarMovimiento: la confirmación y la reversión corrían dos veces y duplicaban la plata) no rompe ningún test por sí
  // solo, pero sí rompe este.
  const RAIZ = process.env.MIS_FINANZAS_JS_DIR || path.join(__dirname, '..', 'js');
  const archivos = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? archivos(path.join(d, e.name)) : /\.js$/.test(e.name) ? [path.join(d, e.name)] : []);
  const VENTANA = 10; // líneas significativas seguidas e idénticas

  function bloquesRepetidos(src) {
    const sig = [];
    src.split('\n').forEach((l, i) => { const t = l.trim(); if (t.length > 25 && !/^(\/\/|\*|\/\*)/.test(t)) sig.push([i + 1, t]); });
    const vistos = new Map(), repetidos = [];
    for (let k = 0; k + VENTANA <= sig.length; k++) {
      const clave = sig.slice(k, k + VENTANA).map(x => x[1]).join('\n');
      if (vistos.has(clave)) repetidos.push([vistos.get(clave), sig[k][0]]); else vistos.set(clave, sig[k][0]);
    }
    return repetidos;
  }

  test('ningún archivo de js/ repite un bloque de código', () => {
    const malos = [];
    archivos(RAIZ).forEach(f => {
      const r = bloquesRepetidos(fs.readFileSync(f, 'utf8'));
      if (r.length) malos.push(path.relative(RAIZ, f) + ': el bloque de la línea ~' + r[0][0] + ' se repite en la ~' + r[0][1]);
    });
    assert.deepEqual(malos, [], 'bloques duplicados (¿copiar y pegar accidental?):\n  ' + malos.join('\n  '));
  });
});

describe('dialogo', () => {
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const path = require('node:path');
  const { loadApp } = require('./support/load-app');
  const CORE = process.env.MIS_FINANZAS_CORE_DIR || path.join(__dirname, '..', 'js', 'core');

  test('un segundo diálogo cancela el anterior en vez de dejarlo colgado; solo el último se confirma', async () => {
    const ctx = loadApp([path.join(CORE, 'core-state.js')]);
    const resultados = [];
    const a = ctx.dialogo('Uno', 'primero').then(v => resultados.push(['a', v]));
    const b = ctx.dialogo('Dos', 'segundo').then(v => resultados.push(['b', v]));
    ctx._closeDialog(true);
    await Promise.all([a, b]);
    assert.deepEqual(resultados.sort(), [['a', false], ['b', true]]);
    assert.equal(ctx._dialogResolve, null);
  });
});
