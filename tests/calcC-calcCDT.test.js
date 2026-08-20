'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const CORE_DIR = process.env.MIS_FINANZAS_CORE_DIR
  || path.join(__dirname, '..', 'js', 'core');
const MODULES_DIR = process.env.MIS_FINANZAS_MODULES_DIR
  || path.join(__dirname, '..', 'js', 'modules');

// cuentas.js referencia funciones de UI de otros archivos core que no
// están en este harness (openSheet/toast/dialogo — sheet-stack.js /
// events.js) a nivel de módulo. permissive:true las deja caer a no-op.
// Ver tests/support/load-app.js para el porqué y el riesgo de esto.
//
// Se carga prestado.js también (aunque estos tests no prueban sus
// funciones directamente): calcPatrimonioTotal() llama a
// getDeudorSaldoPatrimonio/totalMisDeudasPendiente con un guard
// `typeof X==='function'` — en modo permissive ESE guard siempre da
// true (el Proxy inventa una función para cualquier nombre), así que
// sin prestado.js real cargado, el guard llamaría al no-op fantasma
// (devuelve undefined) y contaminaría la resta final con NaN. Cargar
// el archivo real evita ese falso positivo del guard.
function freshApp(sOverrides = {}) {
  const ctx = loadApp([
    path.join(CORE_DIR, 'core-state.js'),
    path.join(MODULES_DIR, 'cuentas.js'),
    path.join(MODULES_DIR, 'prestado.js'),
  ], { permissive: true });
  Object.assign(ctx.S, sOverrides);
  return ctx;
}

function daysAgo(n) {
  const d = new Date(Date.now() - n * 86400000);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

test('calcC — cajita sin fecha (recién creada, saldo aún no empezó a ganar) devuelve el saldo tal cual', () => {
  const ctx = freshApp({ nuTasaGlobal: 9.3 });
  const c = { id: 'nu1', nombre: 'Ahorros', saldo: 500000, fecha: null };
  const r = ctx.calcC(c);
  assert.equal(r.val, 500000);
  assert.equal(r.ganado, 0);
});

test('calcC — 365 días exactos a 9.3003% EA gana aprox el 9.3003% del saldo (la tasa ES la EA por definición)', () => {
  // Este es justo el número que laboratorio-cajitas-nu.html validó contra
  // la app real de Nu (ver memoria del proyecto): 9.3003% EA, diario
  // compuesto, base 365. Un año exacto de interés compuesto diario a la
  // tasa EA X% debe dar como resultado EXACTAMENTE X% de crecimiento —
  // es la propiedad matemática que define qué es una tasa "efectiva anual".
  const ctx = freshApp({ nuTasaGlobal: 9.3003 });
  const c = { id: 'nu1', nombre: 'Ahorros', saldo: 1000000, fecha: daysAgo(365) };
  const r = ctx.calcC(c);
  const esperado = 1000000 * 1.093003;
  assert.ok(Math.abs(r.val - esperado) < 1, `esperaba ~${esperado}, dio ${r.val}`);
  assert.equal(r.dias, 365);
});

test('calcC — cambio de tasa a mitad de periodo compone por tramos, no con la tasa de hoy sobre todo', () => {
  // Simula: la cajita lleva 20 días abierta; la tasa era 9.0% los
  // primeros 10 días y subió a 9.3% hace 10 días. Los primeros 10 días
  // deben componer a la tasa vieja, los últimos 10 a la nueva — NO los
  // 20 días completos a la tasa nueva (lo que daría un cálculo ingenuo
  // sin tramos).
  //
  // OJO con _tasaVigenteEnFecha: una fecha anterior a CUALQUIER entrada
  // de historialTasasNu usa hist[0].tasa, NO nuTasaGlobal — por eso acá
  // hay que registrar la tasa vieja como su propia entrada del
  // historial (no alcanza con nuTasaGlobal solo).
  const tasaVieja = 9.0;
  const tasaNueva = 9.3;
  const inicioPeriodo = daysAgo(20);
  const fechaCambio = daysAgo(10);
  const ctxTramos = freshApp({
    nuTasaGlobal: tasaNueva,
    historialTasasNu: [
      { fecha: inicioPeriodo, tasa: tasaVieja },
      { fecha: fechaCambio, tasa: tasaNueva },
    ],
  });
  const c1 = { id: 'nu1', saldo: 1000000, fecha: inicioPeriodo };
  const porTramos = ctxTramos.calcC(c1).val;

  const ctxIngenuo = freshApp({ nuTasaGlobal: tasaNueva }); // sin historial → toda la tasa nueva
  const c2 = { id: 'nu1', saldo: 1000000, fecha: inicioPeriodo };
  const ingenuo = ctxIngenuo.calcC(c2).val;

  // Con tasa nueva > tasa vieja, componer 10 días a la vieja + 10 a la
  // nueva debe dar MENOS que componer los 20 días completos a la nueva.
  assert.ok(porTramos < ingenuo, `por tramos (${porTramos}) debería ser menor que ingenuo (${ingenuo})`);
});

test('calcC — incluye el saldo de encargos guardados en esa cajita como base del interés (gana intereses también)', () => {
  const ctx = freshApp({
    nuTasaGlobal: 9.3,
    cajitas: [{ id: 'nu1', saldo: 500000, fecha: daysAgo(30) }],
    encargos: [{ saldoInicial: 200000, cuentaInicial: 'cajita:nu1', movimientos: [] }],
  });
  const c = ctx.S.cajitas[0];
  const conEncargo = ctx.calcC(c).val;

  const ctxSinEncargo = freshApp({
    nuTasaGlobal: 9.3,
    cajitas: [{ id: 'nu1', saldo: 500000, fecha: daysAgo(30) }],
  });
  const sinEncargo = ctxSinEncargo.calcC(ctxSinEncargo.S.cajitas[0]).val;

  // Con más base (500k + 200k de encargo) el saldo PROPIO calculado
  // (val, que ya excluye el encargo) debe ser mayor que sin encargo,
  // porque el encargo también generó interés que queda a favor de quien
  // presta la cajita — ver comentario de calcC() en cuentas.js.
  assert.ok(conEncargo > sinEncargo, `con encargo (${conEncargo}) debería ganar más que sin encargo (${sinEncargo})`);
});

test('calcCDT — CDT vencido hoy mismo, sin fecha de vencimiento futura, calcula sobre los días transcurridos', () => {
  const ctx = freshApp();
  const cdt = { monto: 5000000, tasa: 9.5, rte: 4, inicio: daysAgo(90) };
  const r = ctx.calcCDT(cdt);
  assert.equal(r.dias, 90);
  assert.ok(r.ganado > 0, 'debería haber ganado algo en 90 días');
  assert.ok(r.retencion > 0, 'debería haber retención (RTE)');
  assert.equal(r.val, cdt.monto + r.ganado);
});

test('calcCDT — el bruto se redondea a los $0,50 más cercanos antes de aplicar RTE (regla real de Nu)', () => {
  const ctx = freshApp();
  const cdt = { monto: 3173456, tasa: 9.12, rte: 4, inicio: daysAgo(47) };
  const r = ctx.calcCDT(cdt);
  // El bruto redondeado siempre debe ser múltiplo de 0.5
  const esMultiploDeMedio = Math.abs((r.ganado_bruto * 2) - Math.round(r.ganado_bruto * 2)) < 1e-9;
  assert.ok(esMultiploDeMedio, `ganado_bruto (${r.ganado_bruto}) no es múltiplo de 0.5`);
});

test('calcCDT — sin monto o sin fecha de inicio, devuelve el monto tal cual sin ganar nada', () => {
  const ctx = freshApp();
  // JSON.parse/stringify: el objeto que devuelve calcCDT() lo crea el
  // código corriendo DENTRO del contexto vm (su propio realm, con su
  // propio Object.prototype) — assert.deepEqual directo contra un
  // objeto literal de este archivo compara también el prototipo y da
  // un falso negativo aunque los valores sean idénticos. Round-trip
  // por JSON lo normaliza a un objeto plano de este realm.
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.calcCDT(null))), { val: 0, ganado: 0, ganado_bruto: 0, retencion: 0, dias: 0 });
  assert.equal(ctx.calcCDT({ monto: 100000 }).val, 100000); // sin `inicio`
});

test('calcPatrimonioTotal — con cuentas.js real cargado, usa calcC (interés real) en vez del fallback c.saldo', () => {
  const ctx = freshApp({
    nuTasaGlobal: 9.3003,
    cajitas: [{ id: 'nu1', saldo: 1000000, fecha: daysAgo(365) }],
  });
  const patrimonio = ctx.calcPatrimonioTotal();
  // Con el fallback (guard, sin cuentas.js) esto daría exactamente
  // 1000000 — con calcC real cargado debe ser ~1093003 (ver test de
  // 365 días arriba). Confirma que _calcCSafe está usando la función
  // real, no el fallback, cuando calcC() sí está definida.
  assert.ok(patrimonio > 1050000, `esperaba patrimonio > 1.05M con interés real, dio ${patrimonio}`);
});
