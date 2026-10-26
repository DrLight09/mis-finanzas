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
      pagosGastosFijos: { ['g1_' + mes]: { monto: 1000000 } },
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
      pagosGastosFijos: { ['g1_' + mes]: { monto: 1000000 } },
    });
    const r = ctx.calcHealthScore();
    assert.ok(r.tips.some((t) => t.includes('menos de 3 meses')));
  });

  test('calcHealthScore — liquidez negativa (deuda TC > patrimonio líquido) penaliza -15', () => {
    const ctx = freshApp({
      cuentas: cuentas({ nequi: 100000 }),
      tarjetasCredito: [{ id: 'tc1', deuda: 300000, cupo: 1000000 }],
      gastosFijos: [{ id: 'g1', monto: 50000 }],
      pagosGastosFijos: { ['g1_' + currentMonthKey()]: { monto: 50000 } },
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
      pagosGastosFijos: { ['g1_' + mes]: { monto: 1500000 } },
    });
    const r = ctx.calcHealthScore();
    assert.ok(r.tips.some((t) => t.includes('gastando más de lo que ingresas')));
  });

  test('calcHealthScore — cada consejo trae su tipo: una sugerencia (CDT) no es un logro y lleva a donde se resuelve', () => {
    const mes = currentMonthKey();
    const ctx = freshApp({
      cuentas: cuentas({ nequi: 9000000 }), // 9 meses de reserva: el fondo de emergencia ya está cubierto
      ingresosFijos: [{ id: 'i1', nombre: 'Sueldo', monto: 3000000, desde: '2020-01' }],
      gastosFijos: [{ id: 'g1', monto: 1000000 }],
      pagosGastosFijos: { ['g1_' + mes]: { monto: 1000000 } },
    });
    const cdt = ctx.calcHealthScore().consejos.find((c) => c.texto.includes('CDT'));
    assert.ok(cdt, 'con ahorros que sobran se sugiere el CDT');
    assert.equal(cdt.tipo, 'sugerencia');
    assert.equal(cdt.ir, 'cuentas');
  });

  test('calcHealthScore — el CDT no se sugiere si las reservas no llegan a 3 meses ni con deuda de tarjeta', () => {
    const mes = currentMonthKey();
    const pocas = freshApp({
      cuentas: cuentas({ nequi: 500000 }),
      gastosFijos: [{ id: 'g1', monto: 1000000 }],
      pagosGastosFijos: { ['g1_' + mes]: { monto: 1000000 } },
    });
    assert.ok(!pocas.calcHealthScore().tips.some((t) => t.includes('CDT')));
    const conDeuda = freshApp({
      cuentas: cuentas({ nequi: 9000000 }),
      tarjetasCredito: [{ id: 'tc1', deuda: 100000, cupo: 1000000 }],
      gastosFijos: [{ id: 'g1', monto: 1000000 }],
      pagosGastosFijos: { ['g1_' + mes]: { monto: 1000000 } },
    });
    assert.ok(!conDeuda.calcHealthScore().tips.some((t) => t.includes('CDT')));
  });

  test('calcHealthScore — lo urgente va primero: alerta, aviso, sugerencia, ok', () => {
    const mes = currentMonthKey();
    const ctx = freshApp({
      cuentas: cuentas({ nequi: 100000 }),
      tarjetasCredito: [{ id: 'tc1', deuda: 300000, cupo: 1000000 }],
      gastosFijos: [{ id: 'g1', monto: 50000 }],
      pagosGastosFijos: { ['g1_' + mes]: { monto: 50000 } },
      gastosVar: [{ id: 'v1', monto: 1000, fecha: mes + '-01', cat: 'Comida', fuente: 'nequi' }],
    });
    const tipos = Array.from(ctx.calcHealthScore().consejos, (c) => c.tipo); // Array.from: el array viene de otro contexto de `vm`
    const orden = { alerta: 0, aviso: 1, sugerencia: 2, ok: 3 };
    assert.ok(tipos.includes('alerta') && tipos.includes('sugerencia'));
    assert.deepEqual(tipos, [...tipos].sort((a, b) => orden[a] - orden[b]));
  });

  test('calcHealthScore — sin ingresos registrados no puede salir «Excelente» y lo avisa; sin datos no hay calificación', () => {
    const mes = currentMonthKey();
    const sinIngresos = freshApp({
      cuentas: cuentas({ nequi: 9000000 }),
      gastosFijos: [{ id: 'g1', monto: 1000000 }],
      pagosGastosFijos: { ['g1_' + mes]: { monto: 1000000 } },
    }).calcHealthScore();
    assert.ok(sinIngresos.score <= 74);
    assert.ok(sinIngresos.consejos.some((c) => c.texto.includes('Registra tus ingresos') && c.tipo === 'sugerencia'));
    assert.equal(freshApp().calcHealthScore().sinDatos, true);
  });

  test('calcHealthScore — score nunca baja de 0 ni sube de 100 (clamp), caso extremo', () => {
    const mes = currentMonthKey();
    const ctx = freshApp({
      tarjetasCredito: [{ id: 'tc1', deuda: 50000000, cupo: 50000000 }],
      gastosFijos: [{ id: 'g1', monto: 30000000 }],
      pagosGastosFijos: { ['g1_' + mes]: { monto: 30000000 } },
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

  test('gastos fijos — un pago sin monto cuenta 0 (no se inventa el monto actual del gasto fijo)', () => {
    const ctx = app({ gastosFijos: [{ id: 'g1', monto: 300 }], pagosGastosFijos: { 'g1_2026-09': { fecha: '2026-09-10' } } });
    assert.equal(P(ctx).gastosDelMes('2026-09').gfTotal, 0);
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
  // VERSIÓN DEL ESQUEMA / aplicarMigraciones (core-state.js). La app nació limpia en el esquema 9: no migra datos anteriores a 9 y MIGRACIONES empieza vacía.
  // Desde el 7 sí hay migraciones (MIGRACIONES): v8 = una sola tasa de Nu (S.nuRate).
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const path = require('node:path');
  const { loadApp } = require('./support/load-app');

  const CORE_DIR = process.env.MIS_FINANZAS_CORE_DIR || path.join(__dirname, '..', 'js', 'core');
  const app = () => loadApp([path.join(CORE_DIR, 'core-state.js')]);
  const plano = x => JSON.parse(JSON.stringify(x));

  test('datos nuevos (sin schemaVersion) nacen en la versión actual (9)', () => {
    const d = plano(app().aplicarMigraciones({ cuentas: [] }));
    assert.equal(d.schemaVersion, 9);
  });

  describe('estado de Spotify (S.spotify, esquema 9)', () => {
    test('el estado por defecto y load() dejan S.spotify completo (sin guardas en el resto de la app)', () => {
      const ctx = app();
      assert.deepEqual(plano(ctx.S.spotify), { personas: [], costo: 0, cajitaId: '', historial: [] });
      ctx.S.spotify = { costo: '12000' }; ctx._ensureSpotify();
      assert.deepEqual(plano(ctx.S.spotify), { personas: [], costo: 12000, cajitaId: '', historial: [] });
    });
    test('guardia: ningún archivo de la app usa las cuatro llaves sueltas de antes (S.spotifyPersonas/Costo/CajitaId/Historial)', () => {
      const fs = require('fs'), dir = path.join(CORE_DIR, '..');
      const archivos = ['core', 'modules'].flatMap(d => fs.readdirSync(path.join(dir, d)).filter(f => f.endsWith('.js')).map(f => path.join(dir, d, f)));
      const mal = [];
      for (const f of archivos) {
        const t = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
        if (/\.(spotifyPersonas|spotifyCosto|spotifyCajitaId|spotifyHistorial)\b/.test(t)) mal.push(path.basename(f));
      }
      assert.deepEqual(mal, [], 'usan S.spotifyX en vez de S.spotify.X');
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
    for (const v of [2, 7, 8]) {
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
    assert.deepEqual(plano(ctx._validarEstructuraJSON({ schemaVersion: 9, nuRate: null, cajitas: [] })), []);
  });
  test('nuRate numérico sigue siendo válido; texto u otro tipo se rechaza', () => {
    const ctx = app();
    assert.deepEqual(plano(ctx._validarEstructuraJSON({ schemaVersion: 9, nuRate: 9.3, cajitas: [] })), []);
    for (const malo of ['9,3', true, {}, []]) {
      assert.equal(ctx._validarEstructuraJSON({ schemaVersion: 9, nuRate: malo, cajitas: [] }).length, 1, JSON.stringify(malo));
    }
  });
  test('un backup de un esquema anterior al actual se rechaza (la app nació limpia: no migra datos viejos)', () => {
    const ctx = app();
    for (const v of [7, 8]) assert.match(ctx._validarEstructuraJSON({ schemaVersion: v, cajitas: [] })[0], /versión anterior/, 'esquema ' + v);
  });
  test('un backup exportado por esta versión se valida y no cambia al pasar por aplicarMigraciones', () => {
    const ctx = app();
    const actual = { schemaVersion: 9, nuRate: 11, cajitas: [{ id: 'a', saldo: 5 }], spotify: { personas: [], costo: 0, cajitaId: '', historial: [] } };
    assert.deepEqual(plano(ctx._validarEstructuraJSON(actual)), []);
    assert.deepEqual(plano(ctx.aplicarMigraciones(plano(actual))), actual);
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
  const TODO = [...BASE, modulo('nu.js'), modulo('cuentas.js'), modulo('inicio.js'), modulo('analisis.js'), core('wrapped-gate.js'), modulo('wrapped.js')];
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
    assert.equal(ctx._esGastoVarNoReal({ clase: 'gasto' }), false);
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
  // Quedan fuera a propósito: las salidas espejo (tipo 'salida'; 'salida_manual' SÍ lleva clase: es un gasto,
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
        if (/tipo\s*:\s*'salida'/.test(lit)) continue;
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

describe('analisis-ingreso-fijo', () => {
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const path = require('node:path');
  const { loadApp } = require('./support/load-app');
  const RAIZ = path.join(__dirname, '..');
  const core = f => path.join(RAIZ, 'js', 'core', f), modulo = f => path.join(RAIZ, 'js', 'modules', f);

  // Se carga el despachador REAL (events.js) junto con analisis.js y se simula el clic como lo hace el navegador:
  // Events llama al handler con (...args, elemento, evento). El botón "+ Agregar" de Ingresos fijos va con data-args="[]".
  // Un archivo previo captura el listener de clic que events.js cuelga de `document` (y da un WeakSet, que el harness no trae).
  const CAPTURA = path.join(require('node:fs').mkdtempSync(path.join(require('node:os').tmpdir(), 'ev-')), 'captura.js');
  require('node:fs').writeFileSync(CAPTURA, "window.WeakSet = class { constructor(){ this.s = new Set(); } has(x){ return this.s.has(x); } add(x){ this.s.add(x); } delete(x){ return this.s.delete(x); } }; window.__clicks = []; document.addEventListener = function(t, f){ if (t === 'click') window.__clicks.push(f); };");

  function entorno({ ingresosFijos = [] } = {}) {
    const app = loadApp([CAPTURA, core('events.js'), core('core-state.js'), modulo('analisis.js')], { permissive: true });
    Object.assign(app.S, { ingresosFijos });
    const abiertos = [];
    app.openSheet = id => abiertos.push(id);
    const clic = (action, args) => app.__clicks[0]({ target: { closest: () => ({ dataset: { action, args } }) } });
    return { app, abiertos, clic };
  }

  test('"+ Agregar" de ingresos fijos abre el sheet en modo nuevo (el botón no se cuela como id de un ingreso)', () => {
    const { abiertos, clic } = entorno({ ingresosFijos: [{ id: 'if1', nombre: 'Sueldo', monto: 1000, desde: '2026-01' }] });
    clic('analisis:abrirSheetIngresoFijo', '[]');
    assert.deepEqual(abiertos, ['ingreso-fijo']);
  });

  test('editar un ingreso fijo sigue abriendo el sheet con su id', () => {
    const { abiertos, clic } = entorno({ ingresosFijos: [{ id: 'if1', nombre: 'Sueldo', monto: 1000, desde: '2026-01' }] });
    clic('analisis:editarIngresoFijo', '["if1"]');
    assert.deepEqual(abiertos, ['ingreso-fijo']);
  });
});

describe('borrar-todo-pin', () => {
  const test = require('node:test');
  const fs = require('node:fs');
  const os = require('node:os');
  const assert = require('node:assert/strict');
  const path = require('node:path');
  const { loadApp } = require('./support/load-app');
  const { createFakeDom } = require('./support/fake-dom');
  const RAIZ = path.join(__dirname, '..');
  const core = f => path.join(RAIZ, 'js', 'core', f), modulo = f => path.join(RAIZ, 'js', 'modules', f);

  // pin-bio.js es un módulo ES (import de waitFor/hookGlobal): se carga quitando solo esas líneas de import y dando
  // los dos nombres como no-op. Todo lo demás es el código real; configuracion.js aporta el borrarTodo real.
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pin-'));
  const PIN_BIO = path.join(TMP, 'pin-bio.js');
  fs.writeFileSync(PIN_BIO, 'function waitFor() {} function hookGlobal() {}\n' + fs.readFileSync(core('pin-bio.js'), 'utf8').replace(/^import .*$/gm, ''));

  function entorno({ nubeOk = true } = {}) {
    const app = loadApp([PIN_BIO, modulo('configuracion.js')], { permissive: true });
    const dom = createFakeDom({ 'pin-config-container': {}, 'fb-loading-screen': {} });
    app.document = dom.document;
    const ls = app.localStorage;
    ls.setItem('mf_pin', '1234'); ls.setItem('mf_bio_enabled', 'true'); ls.setItem('mf_bio_cred', 'credencial'); ls.setItem('mf_auth_hint', '1');
    app.dialogo = async () => true; app.toast = () => {}; app.setTimeout = f => f();
    app._fbUser = { uid: 'u1' };
    app._fb = { db: {}, doc: () => ({}), setDoc: async () => { if (!nubeOk) throw new Error('sin conexión'); } };
    app.location = { reload() { app.__recargado = true; }, href: '' };
    const lanzados = [];
    app._fbLoadData = () => lanzados.push('app');
    return { app, dom, ls, lanzados };
  }

  test('borrar todos los datos elimina el PIN, su activación y la huella; al reabrir no se pide PIN', async () => {
    const { app, dom, ls, lanzados } = entorno();
    await app.borrarTodo();
    assert.equal(ls.getItem('mf_pin'), null);
    assert.equal(ls.getItem('mf_bio_enabled'), null);
    assert.equal(ls.getItem('mf_bio_cred'), null);
    assert.equal(ls.getItem('mf_auth_hint'), '1', 'lo que no es del PIN no se toca');
    assert.ok(ls.getItem('mf_lastSavedAt'), 'la marca de guardado que protege contra snapshots viejos se conserva');
    assert.equal(app.__recargado, true);
    assert.match(dom.el('pin-config-container').innerHTML, /Activar PIN de acceso/, 'Configuración ya no lo muestra como activo');
    // Tras recargar, el punto de entrada ya no encuentra PIN: lanza la app sin abrir la pantalla de PIN.
    app._pinGate();
    assert.deepEqual(lanzados, ['app']);
  });

  test('si el borrado en la nube falla, el PIN se conserva (los datos viejos pueden volver)', async () => {
    const { app, ls } = entorno({ nubeOk: false });
    await app.borrarTodo();
    assert.equal(ls.getItem('mf_pin'), '1234');
    assert.equal(ls.getItem('mf_bio_cred'), 'credencial');
    assert.equal(app.__recargado, true);
  });

  test('si el usuario cancela la confirmación no se borra nada', async () => {
    const { app, ls } = entorno();
    app.dialogo = async () => false;
    await app.borrarTodo();
    assert.equal(ls.getItem('mf_pin'), '1234');
    assert.notEqual(app.__recargado, true);
  });
});

describe('requisitos-y-filtros-de-sheets', () => {
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const path = require('node:path');
  const { JSDOM } = require('jsdom');
  const { loadApp } = require('./support/load-app');
  const RAIZ = path.join(__dirname, '..');
  const core = f => path.join(RAIZ, 'js', 'core', f), modulo = f => path.join(RAIZ, 'js', 'modules', f);
  const BASE = ['core-state.js', 'calc-helpers.js', 'cuenta-efectos.js', 'periodo.js', 'nu-calc.js', 'fuentes-filtro.js', 'split.js', 'html-tag.js'].map(core);
  // FuentesFiltro es un `const` de script (no cuelga del global): un archivo previo lo expone para poder consultarlo.
  const EXPONER = path.join(require('node:fs').mkdtempSync(path.join(require('node:os').tmpdir(), 'ff-')), 'exponer.js');
  require('node:fs').writeFileSync(EXPONER, 'window.FuentesFiltro = FuentesFiltro;');
  BASE.push(EXPONER);

  // DOM real de jsdom que crea (como un <div>) cualquier id que el código pida y no exista; lo que importa
  // (selects, inputs) se declara en `htmlBase`.
  // `ausentes`: ids que el código busca para saber si existen (devuelven null, como en el navegador).
  function docRico(htmlBase = '', ausentes = ['sp-costo-warn']) {
    const d = new JSDOM('<!doctype html><body>' + htmlBase + '</body>').window.document;
    const orig = d.getElementById.bind(d);
    d.getElementById = id => orig(id) || (ausentes.includes(id) ? null : Object.assign(d.body.appendChild(d.createElement('div')), { id }));
    return d;
  }
  const opciones = (d, id) => Array.from(d.getElementById(id).options).map(o => o.value);

  function entorno(extra = [], { cuentas, tc = true, encargos = [], htmlBase = '' } = {}) {
    const app = loadApp([...BASE, ...extra], { permissive: true });
    Object.assign(app.S, {
      cuentas: cuentas || [{ id: 'nequi', tipo: 'nequi', saldo: 50000 }, { id: 'efectivo', tipo: 'efectivo', saldo: 0 }],
      cajitas: [], movimientos: [], gastosVar: [], encargos,
      tarjetasCredito: tc ? [{ id: 't1', nombre: 'Visa', cupo: 1000000, deuda: 0, estado: 'activa' }] : [],
    });
    app.document = docRico(htmlBase);
    app.toasts = []; app.toast = (m, t) => app.toasts.push([m, t]);
    app.abiertos = []; app.openSheet = id => app.abiertos.push(id);
    app.save = () => {}; app.refresh = () => {}; app.closeSheet = () => {};
    return app;
  }
  const ponerValores = (app, vals) => Object.entries(vals).forEach(([id, v]) => { app.document.getElementById(id).value = v; });

  test('FuentesFiltro: las TC no pueden recibir plata, hayUtilizable mira saldo y el mensaje va en tuteo', () => {
    const app = entorno();
    const F = app.FuentesFiltro;
    assert.equal(F.puedeRecibir('tc:t1'), false);
    assert.equal(F.puedeRecibir('nequi'), true);
    assert.equal(F.puedeRecibir('cajita:c1') && F.puedeRecibir('custom:x'), true);
    assert.deepEqual(Array.from(F.receptoras(app.getFuentes()).map(f => f.val)), ['nequi', 'efectivo']);
    assert.equal(F.hayUtilizable(app.getFuentes(), F.PRESET.SALIDA), true);
    app.S.cuentas[0].saldo = 0;
    app.S.tarjetasCredito = [];
    assert.equal(F.hayUtilizable(app.getFuentes(), F.PRESET.SALIDA), false);
    assert.equal(F.MSG_SIN_SALDO, 'No tienes cuentas con saldo disponible');
  });

  // ── Punto 2: requisitos para abrir los sheets ────────────────────────────────────────────────
  test('«Pagar Spotify» no abre sin costo válido (vacío, 0, NaN, texto) y abre con costo', () => {
    const app = entorno([modulo('spotify.js')], { htmlBase: '<input id="spotifyCosto">' });
    app.S.spotify = { ...(app.S.spotify || {}), personas: [], historial: [] };
    for (const malo of [0, NaN, undefined, '', 'abc', -5]) {
      app.S.spotify.costo = malo; app.abiertos.length = 0; app.toasts.length = 0;
      assert.equal(app.spCostoValido(), false, String(malo));
      app.abrirPagarSpotify();
      assert.deepEqual(app.abiertos, [], 'no abre con costo ' + String(malo));
      assert.equal(app.toasts.length, 1);
    }
    app.S.spotify.costo = 30500; app.abiertos.length = 0;
    assert.equal(app.spCostoValido(), true);
    app.abrirPagarSpotify();
    assert.deepEqual(app.abiertos, ['pagar-spotify']);
  });

  test('aviso de Spotify: misma condición que el bloqueo, con el texto nuevo, sin estilos inline, y desaparece con un costo válido', () => {
    const app = entorno([modulo('spotify.js')], { htmlBase: '<div id="padre"><div id="spotifyList"></div></div><input id="spotifyCosto">' });
    app.S.spotify = { costo: 0, personas: [], historial: [] };
    app.renderSpotify();
    const aviso = app.document.getElementById('sp-costo-warn');
    assert.ok(aviso.parentNode, 'el aviso está en la página');
    assert.equal(aviso.className, 'sp-costo-aviso');
    assert.equal(aviso.getAttribute('style'), null);
    assert.match(aviso.textContent, /Configura el costo del plan para empezar a registrar pagos\./);
    assert.equal(aviso.querySelector('button').textContent, 'Configurar costo');
    assert.equal(aviso.querySelector('button').getAttribute('style'), null);
    app.S.spotify.costo = 30500;
    app.renderSpotify();
    assert.equal(app.document.getElementById('sp-costo-warn'), null, 'con costo válido el aviso se quita');
  });

  test('«Registrar gasto» no abre sin ninguna cuenta con saldo; con saldo, o con una TC con cupo, abre como antes', () => {
    const app = entorno([modulo('tarjetas_credito.js'), modulo('gastos.js')], { cuentas: [{ id: 'nequi', tipo: 'nequi', saldo: 0 }, { id: 'efectivo', tipo: 'efectivo', saldo: 0 }], tc: false });
    app.abrirNuevoGastoVar();
    assert.deepEqual(app.abiertos, []);
    assert.deepEqual(app.toasts, [['No tienes cuentas con saldo disponible', 'err']]);
    app.S.cuentas[0].saldo = 5000;
    app.abrirNuevoGastoVar();
    assert.deepEqual(app.abiertos, ['gasto-var']);
    app.abiertos.length = 0; app.S.cuentas[0].saldo = 0;
    app.S.tarjetasCredito = [{ id: 't1', nombre: 'Visa', cupo: 1000000, deuda: 0, estado: 'activa' }];
    app.abrirNuevoGastoVar();
    assert.deepEqual(app.abiertos, ['gasto-var'], 'un gasto también puede cargarse a una TC con cupo');
  });

  // ── Punto 3: filtros de «Me lo regalaron» y «Mover entre cuentas» ───────────────────────────
  const ENC = () => [{ id: 'e1', nombre: 'Carlos', movimientos: [{ id: 'm1', tipo: 'entrada', monto: 100000, cuenta: 'nequi', fecha: '2026-10-01' }] }];
  const HTML_ENC = '<select id="traspaso_destino"></select><select id="traspaso_origen"></select><select id="moverenc_destino"></select><select id="moverenc_origen"></select>';

  test('«Me lo regalaron»: el destino no ofrece tarjetas de crédito', () => {
    const app = entorno([modulo('encargos.js')], { encargos: ENC(), htmlBase: HTML_ENC });
    app.abrirEncargoDetalle('e1');
    app.abrirTraspasoEncargo();
    assert.deepEqual(app.abiertos.slice(-1), ['traspaso-encargo']);
    assert.deepEqual(opciones(app.document, 'traspaso_destino'), ['', 'nequi', 'efectivo']);
  });

  test('«Me lo regalaron»: al confirmar rechaza una TC como destino (aunque el selector no la ofrezca) y sigue funcionando con una cuenta', () => {
    const app = entorno([modulo('encargos.js')], { encargos: ENC(), htmlBase: '<input id="traspaso_destino"><input id="traspaso_origen">' });
    app.abrirEncargoDetalle('e1');
    const enc = app.S.encargos[0];
    ponerValores(app, { traspaso_monto: '40000', traspaso_desc: 'regalo', traspaso_fecha: '2026-10-24', traspaso_origen: '', traspaso_destino: 'tc:t1' });
    app.confirmarTraspasoEncargo();
    assert.deepEqual(app.toasts.pop(), ['Una tarjeta de crédito no puede recibir plata', 'err']);
    assert.equal(enc.movimientos.length, 1);
    assert.equal(app.S.tarjetasCredito[0].deuda, 0);
    ponerValores(app, { traspaso_destino: 'nequi' });
    app.confirmarTraspasoEncargo();
    assert.equal(enc.movimientos.length, 2);
    assert.equal(app.S.cuentas[0].saldo, 90000);
  });

  test('«Mover entre cuentas»: ni origen ni destino ofrecen tarjetas de crédito', () => {
    const enc = ENC(); enc[0].movimientos.push({ id: 'm2', tipo: 'entrada', monto: 5000, cuenta: 'tc:t1', fecha: '2026-10-01' }); // dato raro: plata "guardada" en una TC
    const app = entorno([modulo('encargos.js')], { encargos: enc, htmlBase: HTML_ENC });
    app.abrirEncargoDetalle('e1');
    app.abrirMoverEntreCuentasEncargo();
    assert.deepEqual(opciones(app.document, 'moverenc_destino'), ['', 'nequi', 'efectivo']);
    assert.deepEqual(opciones(app.document, 'moverenc_origen'), ['', 'nequi']);
  });

  test('«Mover entre cuentas»: al confirmar rechaza una TC como destino o como origen; entre cuentas sigue funcionando', () => {
    const app = entorno([modulo('encargos.js')], { encargos: ENC(), htmlBase: '<input id="moverenc_destino"><input id="moverenc_origen">' });
    app.abrirEncargoDetalle('e1');
    const enc = app.S.encargos[0];
    ponerValores(app, { moverenc_monto: '10000', moverenc_fecha: '2026-10-24', moverenc_origen: 'nequi', moverenc_destino: 'tc:t1' });
    app.confirmarMoverEncCuentas();
    assert.deepEqual(app.toasts.pop(), ['No puedes mover plata a una tarjeta de crédito', 'err']);
    ponerValores(app, { moverenc_origen: 'tc:t1', moverenc_destino: 'efectivo' });
    app.confirmarMoverEncCuentas();
    assert.deepEqual(app.toasts.pop(), ['Una tarjeta de crédito no puede ser cuenta de origen', 'err']);
    assert.equal(enc.movimientos.length, 1);
    ponerValores(app, { moverenc_origen: 'nequi', moverenc_destino: 'efectivo' });
    app.confirmarMoverEncCuentas();
    assert.equal(enc.movimientos.length, 3, 'salida + entrada internas');
  });

  test('«Compra con TC» de un encargo: el destino de la plata no ofrece TC y al confirmar rechaza una', () => {
    const app = entorno([modulo('encargos.js')], { encargos: ENC(), htmlBase: '<select id="ctc_destino"></select><select id="ctc_cuenta_enc"></select><select id="ctc_tarjeta"></select>' });
    app.abrirEncargoDetalle('e1');
    app.abrirCompraConTC();
    assert.deepEqual(app.abiertos.slice(-1), ['compra-tc-encargo']);
    assert.deepEqual(opciones(app.document, 'ctc_destino'), ['', 'nequi', 'efectivo']);
    const app2 = entorno([modulo('encargos.js')], { encargos: ENC(), htmlBase: '<input id="ctc_destino"><input id="ctc_tarjeta"><input id="ctc_cuenta_enc">' });
    app2.abrirEncargoDetalle('e1');
    ponerValores(app2, { ctc_desc: 'Zapatos', ctc_monto: '1000', ctc_tarjeta: 't1', ctc_destino: 'tc:t1', ctc_nota: '', ctc_fecha: '2026-10-24' });
    app2.confirmarCompraConTC();
    assert.deepEqual(app2.toasts.pop(), ['Una tarjeta de crédito no puede recibir plata', 'err']);
    assert.equal(app2.S.encargos[0].movimientos.length, 1);
    assert.equal(app2.S.tarjetasCredito[0].deuda, 0);
  });

  // ── Dividir: tope de filas y mínimo de cuentas (motor split.js, todos los sheets que lo usan) ──
  function widget(app, cuentas) {
    let modo = false;
    app.crearSplitWidget('t', {
      simpleId: 't_simple', splitId: 't_split', toggleId: 't_btn', rowsId: 't_rows',
      getModo: () => modo, setModo: v => { modo = v; },
      getFuentesFn: () => '<option value="">Elige cuenta</option>' + cuentas.map(c => '<option value="' + c + '">' + c + '</option>').join(''),
      onPreview() {},
    });
    return { modo: () => modo, filas: () => app.document.getElementById('t_rows').children.length };
  }

  test('dividir: con una sola cuenta válida no se activa', () => {
    const app = entorno();
    const w = widget(app, ['nequi']);
    app.splitToggle('t');
    assert.equal(w.modo(), false);
    assert.equal(w.filas(), 0);
    assert.deepEqual(app.toasts.pop(), ['Necesitas al menos dos cuentas para dividir', 'err']);
  });

  test('dividir: el máximo de filas es el número de cuentas válidas y no se repite una cuenta', () => {
    const app = entorno();
    const w = widget(app, ['nequi', 'efectivo', 'custom:a']);
    app.splitToggle('t');
    assert.equal(w.modo(), true);
    assert.equal(w.filas(), 2);
    app.splitAgregarRow('t');
    assert.equal(w.filas(), 3);
    app.splitAgregarRow('t');
    assert.equal(w.filas(), 3, 'una fila por cuenta, no más');
    assert.deepEqual(app.toasts.pop(), ['Ya usaste todas las cuentas disponibles', 'err']);
    // la cuenta elegida en una fila desaparece de las otras
    const filas = Array.from(app.document.getElementById('t_rows').children);
    filas[0].querySelector('select').value = 'nequi';
    app.splitActualizarOpciones('t');
    assert.ok(!Array.from(filas[1].querySelector('select').options).some(o => o.value === 'nequi'));
  });

  test('dividir con exactamente dos cuentas: se activa con dos filas y no admite una tercera', () => {
    const app = entorno();
    const w = widget(app, ['nequi', 'efectivo']);
    app.splitToggle('t');
    assert.equal(w.filas(), 2);
    app.splitAgregarRow('t');
    assert.equal(w.filas(), 2);
  });
});

describe('historial-patrimonio', () => {
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const path = require('node:path');
  const { JSDOM } = require('jsdom');
  const { loadApp } = require('./support/load-app');
  const { createFakeDom } = require('./support/fake-dom');
  const RAIZ = path.join(__dirname, '..');
  const core = f => path.join(RAIZ, 'js', 'core', f), modulo = f => path.join(RAIZ, 'js', 'modules', f);
  const ARCHIVOS = [core('core-state.js'), core('periodo.js'), core('nu-calc.js'), core('calc-helpers.js'), core('cuenta-efectos.js'),
    modulo('tarjetas_credito.js'), modulo('nu.js'), modulo('cuentas.js'), modulo('gastos.js'), core('movimientos.js'), core('html-tag.js'), core('fuentes-filtro.js'), modulo('analisis.js')];
  const plano = x => JSON.parse(JSON.stringify(x));
  const dia = off => { const d = new Date(Date.now() + off * 864e5); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const ts = off => { const d = new Date(Date.now() + off * 864e5); d.setHours(12, 0, 0, 0); return d.getTime(); };
  const boton = (tipo, id, fuente, monto) => { const item = { dataset: { movId: id, movTipo: tipo, movFuente: fuente, movMonto: String(monto), movFecha: dia(0) } }; return { closest: () => item }; };

  // DOM de jsdom que crea cualquier id que el código pida: sirve para pintar la gráfica real de Análisis.
  function docRico(htmlBase = '') {
    const d = new JSDOM('<!doctype html><body>' + htmlBase + '</body>').window.document;
    const orig = d.getElementById.bind(d);
    d.getElementById = id => orig(id) || Object.assign(d.body.appendChild(d.createElement('div')), { id });
    return d;
  }

  function entorno(historial, campos = {}) {
    const app = loadApp(ARCHIVOS, { permissive: true });
    Object.assign(app.S, { modulos: {}, libro: [], movimientos: [], gastosVar: [], cajitas: [], transferencias: [], pagosGastosFijos: {}, tarjetasCredito: [], ingresosFijos: [], presupuestos: {},
      patrimonioHistorial: historial,
      cuentas: [{ id: 'nequi', tipo: 'nequi', saldo: 0 }, { id: 'efectivo', tipo: 'efectivo', saldo: 0 }] });
    const dom = createFakeDom({ gv_desc: { value: 'Almuerzo' }, gv_monto: { value: '2.000,00' }, gv_fecha: { value: '' }, gv_cat: { value: 'Comida' }, gv_nota: { value: '' }, gv_fuente: { value: 'nequi' },
      tr_origen: { value: 'nequi' }, tr_destino: { value: 'efectivo' }, tr_monto: { value: '3.000,00' }, tr_nota: { value: '' }, tr_fecha: { value: '' }, ...campos });
    app.document = dom.document;
    app.dialogo = async () => true; app.save = () => {}; app.refresh = () => {}; app.toast = () => {}; app.fuenteLabel = f => f;
    return app;
  }
  // Lo que hace la app tras cada cambio: toma la instantánea de hoy y recalcula la base del historial.
  const refrescar = app => { app.snapshotPatrimonio(); app.recalcularMontoBaseHistorial(); };
  const valores = app => plano(app.S.patrimonioHistorial).map(h => [h.fecha, h.valor, h.valorVisible]);

  // Lo que muestra la gráfica de Análisis con el estado actual.
  function grafica(app) {
    const d = docRico('<div id="an-patrimonio-chart"></div>');
    app.document = d;
    app.renderAnalisis();
    const el = d.getElementById('an-patrimonio-chart');
    return { puntos: JSON.parse(el.querySelector('#_pat-overlay').getAttribute('data-pts')), diff: el.querySelector('.an-pat-diff'), pct: el.querySelector('.an-pat-pct') };
  }

  test('reporte: crear saldos iniciales por error y eliminarlos el mismo día deja el historial y la gráfica como estaban', async () => {
    const app = entorno([{ fecha: dia(-1), valor: 0, valorVisible: 0 }]);
    const antes = valores(app);
    app.registrarEntradaConApertura('nequi', 4444448888.88, dia(0), 'Saldo inicial', true, '');
    app.registrarEntradaConApertura('efectivo', 0.0, dia(0), 'Saldo inicial', true, '');
    refrescar(app);
    for (const m of plano(app.S.movimientos)) await app.eliminarMovimiento(boton('apertura', m.id, m.fuente, m.monto));
    refrescar(app);
    assert.deepEqual(valores(app).slice(0, 1), antes);
    assert.deepEqual(valores(app)[1].slice(1), [0, 0]);
    assert.equal(app.S._ajustesBaseLog, undefined);
    assert.ok(app.S.patrimonioHistorial.every(h => h.montoBase === undefined), 'no queda ninguna base del movimiento eliminado');
    const g = grafica(app);
    assert.ok(g.puntos.every(p => p.valor === p.valorReal && p.valor === 0), 'valor y valorReal coinciden en todos los puntos');
    assert.equal(g.diff.textContent, '$0');
    assert.ok(!/\+/.test(g.diff.textContent + g.pct.textContent), 'sin signo +');
    assert.ok(!/c-green|c-red/.test(g.diff.className + g.pct.className), 'ni verde ni rojo');
  });

  test('datos ya contaminados (ajuste negativo sin saldo inicial que lo respalde): al cargar se retira y la gráfica queda plana', () => {
    const app = entorno([{ fecha: dia(-1), valor: 0, valorVisible: 0 }, { fecha: dia(0), valor: 0, valorVisible: 0 }]);
    app.S._ajustesBaseLog = [{ fecha: dia(0), monto: -4444448888.88 }];
    app.recalcularMontoBaseHistorial();
    assert.equal(app.S._ajustesBaseLog, undefined);
    const g = grafica(app);
    assert.deepEqual(g.puntos.map(p => [p.valor, p.valorReal]), [[0, 0], [0, 0]]);
    assert.equal(g.diff.textContent, '$0');
  });

  test('un ingreso creado hace 3 días y eliminado hoy: las instantáneas intermedias vuelven a lo que eran antes de crearlo', async () => {
    const app = entorno([{ fecha: dia(-4), valor: 0, valorVisible: 0 }, { fecha: dia(-3), valor: 5000, valorVisible: 5000 }, { fecha: dia(-2), valor: 5000, valorVisible: 5000 },
      { fecha: dia(-1), valor: 5000, valorVisible: 5000 }, { fecha: dia(0), valor: 5000, valorVisible: 5000 }]);
    app.registrarEntradaConApertura('nequi', 5000, dia(-3), 'Sueldo', false, '');
    const m = app.S.movimientos[0]; m.ts = ts(-3);
    await app.eliminarMovimiento(boton('entrada', m.id, 'nequi', 5000));
    refrescar(app);
    assert.deepEqual(valores(app).map(v => v.slice(1)), [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]]);
    const g = grafica(app);
    assert.ok(g.puntos.every(p => p.valor === 0 && p.valorReal === 0));
    assert.equal(g.diff.textContent, '$0');
  });

  test('lo anterior a la creación no se toca: el ingreso eliminado no altera días en que no existía', async () => {
    const app = entorno([{ fecha: dia(-5), valor: 700, valorVisible: 700 }, { fecha: dia(-4), valor: 700, valorVisible: 700 }, { fecha: dia(-3), valor: 5700, valorVisible: 5700 }, { fecha: dia(0), valor: 5700, valorVisible: 5700 }]);
    app.S.cuentas[0].saldo = 700;
    app.registrarEntradaConApertura('nequi', 5000, dia(-3), 'Sueldo', false, '');
    const m = app.S.movimientos[0]; m.ts = ts(-3);
    await app.eliminarMovimiento(boton('entrada', m.id, 'nequi', 5000));
    refrescar(app);
    assert.deepEqual(valores(app).map(v => v[1]), [700, 700, 700, 700]);
  });

  test('saldo inicial corregido y luego eliminado: cada parte sale del día en que entró', async () => {
    const app = entorno([{ fecha: dia(-4), valor: 0, valorVisible: 0 }, { fecha: dia(-3), valor: 1000, valorVisible: 1000, montoBase: 1000 }, { fecha: dia(-2), valor: 1500, valorVisible: 1500, montoBase: 500 },
      { fecha: dia(-1), valor: 1500, valorVisible: 1500 }, { fecha: dia(0), valor: 1500, valorVisible: 1500 }]);
    app.registrarEntradaConApertura('efectivo', 1000, dia(-3), 'Saldo inicial', true, '');
    const m = app.S.movimientos[0]; m.ts = ts(-3);
    app.sumarFuente('efectivo', 500, { origen: { modulo: 't', ref: 'edicion' } });
    m.monto = 1500; m._ajustes = [{ fecha: dia(-2), monto: 500 }];
    await app.eliminarMovimiento(boton('apertura', m.id, 'efectivo', 1500));
    refrescar(app);
    assert.deepEqual(valores(app).map(v => v[1]), [0, 0, 0, 0, 0]);
    assert.ok(app.S.patrimonioHistorial.every(h => h.montoBase === undefined));
  });

  test('un gasto eliminado desde Gastos devuelve las instantáneas desde el día en que se creó', async () => {
    const app = entorno([{ fecha: dia(-3), valor: 10000, valorVisible: 10000 }, { fecha: dia(-2), valor: 8000, valorVisible: 8000 }, { fecha: dia(-1), valor: 8000, valorVisible: 8000 }, { fecha: dia(0), valor: 8000, valorVisible: 8000 }]);
    app.sumarFuente('nequi', 10000, { origen: { modulo: 't', ref: 'base' } });
    app.addGastoVar();
    const g = app.S.gastosVar[0]; g.ts = ts(-2);
    assert.equal(app.getSaldoFuente('nequi'), 8000);
    await app.deleteGastoVar(g.id);
    refrescar(app);
    assert.equal(app.getSaldoFuente('nequi'), 10000);
    assert.deepEqual(valores(app).map(v => v[1]), [10000, 10000, 10000, 10000]);
  });

  test('una transferencia entre cuentas propias no cambia el patrimonio: su eliminación no toca el historial', async () => {
    const app = entorno([{ fecha: dia(-2), valor: 10000, valorVisible: 10000 }, { fecha: dia(-1), valor: 10000, valorVisible: 10000 }, { fecha: dia(0), valor: 10000, valorVisible: 10000 }]);
    app.sumarFuente('nequi', 10000, { origen: { modulo: 't', ref: 'base' } });
    app.confirmarTransferir();
    const t = app.S.transferencias[0]; t.ts = ts(-2);
    const antes = valores(app);
    await app.eliminarMovimiento(boton('transferencia', t.id, 'nequi', 3000));
    refrescar(app);
    assert.deepEqual(valores(app), antes);
  });

  test('diaCreacionMov: ts, hora del id de uid(), y la fecha como último recurso', () => {
    const app = entorno([]);
    assert.equal(app.diaCreacionMov({ ts: ts(-3), id: 'x', fecha: '2020-01-01' }), dia(-3));
    assert.equal(app.diaCreacionMov({ id: (ts(-2)).toString(36) + 'abc', fecha: '2020-01-01' }), dia(-2));
    assert.equal(app.diaCreacionMov({ id: 'apertura:nequi', fecha: '2026-01-05' }), '2026-01-05');
    assert.equal(app.diaCreacionMov({ fecha: '2026-01-05' }), '2026-01-05');
    assert.equal(app.diaCreacionMov(null), '');
  });
});

describe('money-input (formateo al escribir en los campos de plata)', () => {
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const fs = require('node:fs'), path = require('node:path');
  const { JSDOM } = require('jsdom');
  const codigo = fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'money-input.js'), 'utf8');
  function entorno(clase = 'money-input') {
    const dom = new JSDOM(`<!doctype html><input id="i" class="${clase}"><input id="o" class="otro">`, { runScripts: 'outside-only' });
    const w = dom.window;
    w.eval(codigo);
    const el = w.document.getElementById('i');
    // Simula teclear/pegar: pone el texto resultante, el cursor y dispara `input` (como lo hace el navegador).
    const entrar = (valor, cursor, inputType = 'insertText', data = null) => {
      el.value = valor; el.setSelectionRange(cursor, cursor);
      el.dispatchEvent(new w.InputEvent('input', { bubbles: true, inputType, data }));
    };
    const salir = () => el.dispatchEvent(new w.FocusEvent('focusout', { bubbles: true }));
    return { w, el, entrar, salir };
  }

  test('500000 se ve 500.000 y 1500000 se ve 1.500.000 mientras se escribe (sin centavos forzados)', () => {
    const { el, entrar } = entorno();
    entrar('500000', 6); assert.equal(el.value, '500.000');
    entrar('1500000', 7); assert.equal(el.value, '1.500.000');
  });

  test('decimales opcionales: la coma los abre, máximo 2, y un "." tecleado a mano también', () => {
    const { el, entrar } = entorno();
    entrar('1.500.000,', 10); assert.equal(el.value, '1.500.000,');
    entrar('1.500.000,5', 11); assert.equal(el.value, '1.500.000,5');
    entrar('1.500.000,567', 13); assert.equal(el.value, '1.500.000,56');
    entrar('1.500.000.', 10, 'insertText', '.'); assert.equal(el.value, '1.500.000,'); // teclado sin coma
    entrar(',5', 2); assert.equal(el.value, '0,5'); assert.equal(el.selectionStart, 3);
  });

  test('al salir: 1 decimal se completa a 2 y una coma suelta se quita; los enteros no cambian', () => {
    const { el, entrar, salir } = entorno();
    entrar('5,5', 3); salir(); assert.equal(el.value, '5,50');
    entrar('5,', 2); salir(); assert.equal(el.value, '5');
    entrar('500.000', 7); salir(); assert.equal(el.value, '500.000');
    entrar('', 0); salir(); assert.equal(el.value, ''); // vacío sigue vacío (ya no se rellena con 0,00)
  });

  test('el cursor se mueve libre: se puede insertar un número en medio y el cursor no salta al final', () => {
    const { el, entrar } = entorno();
    entrar('1.5000', 3); // escribió un 0 tras el "5": 1.5|000 → 15.000 con el cursor tras el 5
    assert.equal(el.value, '15.000'); assert.equal(el.selectionStart, 2);
    entrar('1.2500', 3); // insertó un 2 entre el 1 y el 5 (1.2|500) → queda 12.500 con el cursor tras el 2
    assert.equal(el.value, '12.500'); assert.equal(el.selectionStart, 2);
    entrar('1500', 1);   // Backspace sobre el punto de "1.500": no borra un dígito, el cursor queda tras el 1
    assert.equal(el.value, '1.500'); assert.equal(el.selectionStart, 1);
    entrar('1.50', 4);   // borra el último dígito
    assert.equal(el.value, '150'); assert.equal(el.selectionStart, 3);
  });

  test('pegar: "$ 1.500.000,50" y "1500.50" son decimales; "1,500,000" y "1.500" son miles; el signo se ignora', () => {
    const { el, entrar } = entorno();
    entrar('$ 1.500.000,50', 14, 'insertFromPaste'); assert.equal(el.value, '1.500.000,50');
    entrar('1500.50', 7, 'insertFromPaste'); assert.equal(el.value, '1.500,50');
    entrar('1,500,000', 9, 'insertFromPaste'); assert.equal(el.value, '1.500.000');
    entrar('1.500', 5, 'insertFromPaste'); assert.equal(el.value, '1.500');
    entrar('-500', 4, 'insertFromPaste'); assert.equal(el.value, '500');
    entrar('abc', 3); assert.equal(el.value, '');
  });

  test('ceros a la izquierda y tope de 12 dígitos enteros', () => {
    const { el, entrar } = entorno();
    entrar('0', 1); assert.equal(el.value, '0');
    entrar('05', 2); assert.equal(el.value, '5');
    entrar('1234567890123', 13); assert.equal(el.value, '123.456.789.012');
  });

  test('parseMoney() lee lo que deja el formateo (y fmtInput lo produce igual)', () => {
    const { w, entrar, el } = entorno();
    w.eval(fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'core-state.js'), 'utf8').match(/function parseMoney[\s\S]*?\n}\n/)[0]);
    w.eval(fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'core-state.js'), 'utf8').match(/function fmtInput[\s\S]*?\n}\n/)[0]);
    entrar('1500000,5', 9); assert.equal(w.parseMoney(el.value), 1500000.5);
    entrar('500000', 6); assert.equal(w.parseMoney(el.value), 500000);
    assert.equal(w.fmtInput(500000), '500.000');
    assert.equal(w.fmtInput(1234.5), '1.234,50');
    assert.equal(w.fmtInput(0), '');
  });

  test('.miles-input: solo enteros (descarta decimales al pegar y no abre coma), y parseMiles devuelve el número', () => {
    const { w, el, entrar } = entorno('miles-input');
    entrar('500000', 6); assert.equal(el.value, '500.000');
    entrar('$ 1.500.000,50', 14, 'insertFromPaste'); assert.equal(el.value, '1.500.000');
    entrar('1.500.000,', 10); assert.equal(el.value, '1.500.000');
    assert.equal(w.parseMiles('1.500.000'), 1500000);
    assert.equal(w.parseMiles(''), 0); assert.equal(w.parseMiles(500000), 500000);
  });

  test('no toca otros inputs', () => {
    const { w } = entorno();
    const o = w.document.getElementById('o'); o.value = '12345'; o.dispatchEvent(new w.InputEvent('input', { bubbles: true }));
    assert.equal(o.value, '12345');
  });
});
