'use strict';
// Cierre de períodos, etapa 2 (Cierre.ejecutar): resumen congelado + poda por componentes + libro plegado, SIEMPRE verificado con la huella antes
// de escribir. Datos sintéticos de tests/support/datos-sinteticos.js (≈ 33 meses; nada de datos reales).
// Corre con:  node --test tests/cierre-ejecucion.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { cargarApp, generar, HOY } = require('./support/datos-sinteticos');

const MES_ACTUAL = HOY.slice(0, 7);
const CORTE = '2024-09'; // Cierre.corteMasReciente(HOY): el mes completo con ≥ 24 meses de antigüedad
const opciones = (extra) => Object.assign({ hoy: HOY, mesActual: MES_ACTUAL, guardar: () => {}, aceptarWrappedSinGuardar: true }, extra || {});
const clon = x => JSON.parse(JSON.stringify(x));
const saldos = ctx => JSON.stringify([ctx.S.cuentas.filter(c => c.tipo !== 'ahorro').map(c => [c.id, c.saldo]), ctx.S.cajitas.map(c => [c.id, c.saldo])]);
function preparar(dias = 1000) { const ctx = cargarApp(); generar(ctx, { dias }); return ctx; }

test('el corte de política es el mes 2024-09 con la fecha de los datos sintéticos', () => {
  const ctx = preparar();
  assert.equal(ctx.Cierre.corteMasReciente(HOY), CORTE);
});

test('simular verifica con la huella y NO modifica nada', () => {
  const ctx = preparar();
  const antes = JSON.stringify(ctx.S);
  const r = ctx.Cierre.ejecutar(CORTE, opciones({ simular: true }));
  assert.equal(r.ok, true, JSON.stringify(r.diferencias || r));
  assert.equal(r.simulado, true);
  assert.ok(r.quitados.registros > 0, 'había algo que cerrar');
  assert.equal(r.huellaAntes, r.huellaDespues);
  assert.equal(JSON.stringify(ctx.S), antes);
});

test('ejecutar: saldos, libro, huella y Periodo de todos los meses quedan igual; el detalle viejo sale', () => {
  const ctx = preparar();
  const saldosAntes = saldos(ctx), libroAntes = ctx.S.libro.length, gastosAntes = ctx.S.gastosVar.length;
  const huellaAntes = ctx.Huella.digest(ctx.Huella.calcular(ctx.S, { requeridas: ctx.Huella.SONDAS_BASE }));
  const meses = Object.keys(ctx.Periodo.ingresosPorMes()).concat(Object.keys(ctx.Periodo.gastosPorMes())).filter((m, i, a) => a.indexOf(m) === i).sort();
  // Totales y agregados de cada mes. Las LISTAS de registros (variables, fijos, items) quedan con lo que no se podó: no se comparan.
  const variantes = m => { const b = ctx.Periodo.balanceDelMes(m, ctx.S), g = b.gastos; return JSON.stringify([b.ingresos, b.balance, b.balanceRecurrente, b.extraordinarios, b.ingresosExtra, b.tasaAhorro,
    g.gastoVariableTotal, g.gastoFijoTotal, g.total, g.extraTotal, g.recurrenteTotal, ctx.Periodo.ingresosDelMes(m, ctx.S), ctx.Periodo.gastoPorCategoria(m, ctx.S),
    ctx.Periodo.ingresosPorMes(ctx.S, { sinExtra: true })[m], ctx.Periodo.gastosPorMes(ctx.S, { sinExtraordinarios: true })[m]]); };
  const periodoAntes = meses.map(variantes);

  const r = ctx.Cierre.ejecutar(CORTE, opciones());
  assert.equal(r.ok, true, JSON.stringify(r.diferencias || r));

  assert.equal(saldos(ctx), saldosAntes, 'el saldo de cada cuenta y cajita no cambia');
  assert.equal(ctx.Libro.verificar(ctx.S).ok, true);
  assert.equal(ctx.Huella.digest(ctx.Huella.calcular(ctx.S, { requeridas: ctx.Huella.SONDAS_BASE })), huellaAntes, 'la huella completa es idéntica');
  assert.deepEqual(meses.map(variantes), periodoAntes, 'Periodo da lo mismo en TODOS los meses (los cerrados salen del resumen)');
  assert.ok(ctx.S.libro.length < libroAntes && ctx.S.gastosVar.length < gastosAntes, 'el detalle viejo se podó');
  assert.deepEqual(Object.keys(ctx.S.resumenMeses).sort().filter(m => m > CORTE), [], 'solo hay resumen de meses ≤ corte');
  assert.equal(ctx.S.cierre.corte, CORTE);
  const cierres = ctx.S.libro.filter(l => l.tipo === 'cierre');
  assert.ok(cierres.length > 0 && cierres.every(l => l.origen.modulo === 'cierre' && l.fecha.startsWith(CORTE)));
  assert.equal(new Set(cierres.map(l => l.cuenta)).size, cierres.length, 'una sola entrada de cierre por cuenta');
});

test('lo que no está cerrado no se toca: préstamos y tarjetas con saldo, encargo abierto, alcancía activa', () => {
  const ctx = preparar();
  const foto = () => JSON.stringify([ctx.S.deudores.find(d => d.id === 'favorAbierta'), ctx.S.misDeudas, ctx.S.tarjetasCredito.find(t => t.id === 'tcAbierta'), ctx.S.encargos.find(e => e.id === 'encAbierto'), ctx.S.alcancia.movimientos]);
  const antes = foto();
  assert.equal(ctx.Cierre.ejecutar(CORTE, opciones()).ok, true);
  assert.equal(foto(), antes);
});

test('una entidad cerrada (tarjeta pagada, encargo y préstamo saldados) sí se poda, con su deuda en 0 antes y después', () => {
  const ctx = preparar();
  const n = () => [ctx.S.tarjetasCredito.find(t => t.id === 'tcCerrada').compras.length, ctx.S.encargos.find(e => e.id === 'encCerrado').movimientos.length, ctx.S.deudores.find(d => d.id === 'favorCerrada').movimientos.length];
  const antes = n();
  assert.equal(ctx.Cierre.ejecutar(CORTE, opciones()).ok, true);
  const despues = n();
  assert.ok(despues[0] < antes[0] || despues[1] < antes[1] || despues[2] < antes[2], 'alguna entidad cerrada perdió historia: ' + antes + ' → ' + despues);
});

test('repetir el cierre no cambia nada (idempotente)', () => {
  const ctx = preparar();
  assert.equal(ctx.Cierre.ejecutar(CORTE, opciones()).ok, true);
  const tras = JSON.stringify(ctx.S);
  const otra = ctx.Cierre.ejecutar(CORTE, opciones());
  assert.equal(otra.ok, true); assert.equal(otra.sinCambios, true); assert.equal(otra.motivo, 'ya-cerrado');
  assert.equal(JSON.stringify(ctx.S), tras);
});

test('un cierre posterior pliega también el «Saldo anterior» del primero (una sola entrada por cuenta) y los saldos siguen iguales', () => {
  const ctx = preparar(1100);
  assert.equal(ctx.Cierre.ejecutar('2024-06', opciones({ forzar: true })).ok, true);
  const saldosMedio = saldos(ctx);
  assert.equal(ctx.Cierre.ejecutar(CORTE, opciones()).ok, true);
  assert.equal(saldos(ctx), saldosMedio);
  const cierres = ctx.S.libro.filter(l => l.tipo === 'cierre');
  assert.equal(new Set(cierres.map(l => l.cuenta)).size, cierres.length);
  assert.ok(cierres.every(l => l.id.includes(CORTE)), 'solo queda el del último corte');
});

test('la política se exige: un corte más reciente que corteMasReciente se rechaza sin tocar nada', () => {
  const ctx = preparar();
  const antes = JSON.stringify(ctx.S);
  const r = ctx.Cierre.ejecutar('2025-06', opciones());
  assert.equal(r.ok, false); assert.equal(r.motivo, 'corte-reciente'); assert.equal(r.corteMasReciente, CORTE);
  assert.equal(JSON.stringify(ctx.S), antes);
});

test('si la huella cambia tras el cierre, se aborta SIN escribir (interrupción)', () => {
  const ctx = preparar();
  ctx.Huella.registrar('sabotaje', estado => ({ registrosDeLibro: estado.libro.length })); // una sonda que sí nota que el libro se pliega
  const antes = JSON.stringify(ctx.S);
  let guardado = 0;
  const r = ctx.Cierre.ejecutar(CORTE, opciones({ guardar: () => { guardado++; } }));
  assert.equal(r.ok, false); assert.equal(r.motivo, 'huella-distinta');
  assert.ok(r.diferencias.some(d => d.ruta.includes('sabotaje')));
  assert.equal(guardado, 0, 'no se guardó nada');
  assert.equal(JSON.stringify(ctx.S), antes, 'el estado real quedó intacto');
});

test('datos incompletos: si falta una sonda base el cierre se detiene sin modificar nada', () => {
  const ctx = preparar();
  const antes = JSON.stringify(ctx.S);
  const sondas = ctx.Huella.SONDAS_BASE;
  sondas.push('sonda-que-no-existe'); // simula un módulo diferido que no cargó
  try {
    const r = ctx.Cierre.ejecutar(CORTE, opciones());
    assert.equal(r.ok, false); assert.equal(r.motivo, 'huella-incompleta');
  } finally { sondas.pop(); }
  assert.equal(JSON.stringify(ctx.S), antes);
});

test('un respaldo anterior al cierre sigue siendo importable y da los mismos saldos', () => {
  const ctx = preparar();
  const respaldo = clon(ctx.S);
  const saldosAntes = saldos(ctx);
  assert.equal(ctx.Cierre.ejecutar(CORTE, opciones()).ok, true);
  const otra = cargarApp();
  Object.assign(otra.S, respaldo); otra.Libro.hidratar(otra.S);
  assert.equal(saldos(otra), saldosAntes);
});

test('sin resumen, Periodo se comporta exactamente como antes (el cambio es no-op hasta que existe un resumen)', () => {
  const ctx = preparar();
  const antes = JSON.stringify([ctx.Periodo.ingresosPorMes(ctx.S), ctx.Periodo.gastosPorMes(ctx.S), ctx.Periodo.balanceDelMes('2024-05', ctx.S)]);
  ctx.S.resumenMeses = {}; // presente pero vacío
  assert.equal(JSON.stringify([ctx.Periodo.ingresosPorMes(ctx.S), ctx.Periodo.gastosPorMes(ctx.S), ctx.Periodo.balanceDelMes('2024-05', ctx.S)]), antes);
});

test('las operaciones posteriores al cierre siguen funcionando y no descuadran el libro', () => {
  const ctx = preparar();
  assert.equal(ctx.Cierre.ejecutar(CORTE, opciones()).ok, true);
  const nequi = ctx.S.cuentas.find(c => c.id === 'nequi'), antes = nequi.saldo;
  ctx.Libro.conOrigen({ modulo: 'gastos', ref: 'g-post' }, () => ctx.descontarFuente('cuenta:nequi', 12345, { fecha: '2026-09-28' }));
  assert.equal(nequi.saldo, Math.round((antes - 12345) * 100) / 100);
  assert.equal(ctx.Libro.verificar(ctx.S).ok, true);
});

test('candado: tras cerrar, ningún registro de un mes cerrado se edita ni se elimina, aunque diasBloqueo sea enorme', () => {
  const { loadApp } = require('./support/load-app');
  const path = require('node:path');
  const ctx = loadApp([path.join(__dirname, '..', 'js', 'core', 'core-state.js'), path.join(__dirname, '..', 'js', 'core', 'fecha.js'), path.join(__dirname, '..', 'js', 'core', 'dialogos.js')], { permissive: true });
  ctx.hoy = () => HOY;
  ctx.S.config = { proteccionAntiguedad: { diasAviso: 99999, diasBloqueo: 99999 } };
  assert.equal(ctx.nivelAntiguedadMovimiento('2024-08-15', 0, 'gastos'), 'reciente', 'sin cierre no cambia nada');
  ctx.S.cierre = { corte: CORTE };
  assert.equal(ctx.nivelAntiguedadMovimiento('2024-08-15', 0, 'gastos'), 'bloqueado');
  assert.equal(ctx.nivelAntiguedadMovimiento('2024-09-30', 0, 'gastos'), 'bloqueado', 'el último día del mes cerrado también');
  assert.equal(ctx.nivelAntiguedadMovimiento('2024-10-01', 0, 'gastos'), 'reciente', 'el mes siguiente sigue editable');
});

test('el historial de la cuenta muestra «Saldo anterior» (Libro.entradasVisibles incluye el tipo cierre)', () => {
  const ctx = preparar();
  assert.equal(ctx.Cierre.ejecutar(CORTE, opciones()).ok, true);
  const visibles = ctx.Libro.entradasVisibles(ctx.S).filter(l => l.tipo === 'cierre');
  assert.ok(visibles.length > 0);
});

test('un año cuyo Wrapped no está guardado exige aceptarlo expresamente: sin eso no se cierra nada', () => {
  const ctx = preparar();
  const antes = JSON.stringify(ctx.S);
  const r = ctx.Cierre.ejecutar(CORTE, opciones({ aceptarWrappedSinGuardar: false }));
  if (r.ok) { assert.equal(r.sinCambios, true); return; } // si los datos de prueba no tienen un año con Wrapped posible, no aplica
  assert.equal(r.motivo, 'wrapped-sin-guardar');
  assert.ok(Array.isArray(r.anios) && r.anios.length > 0);
  assert.equal(JSON.stringify(ctx.S), antes);
});

test('Periodo.resumenDelMes: hay resumen de un mes cerrado con sus categorías y no de uno abierto', () => {
  const ctx = preparar();
  assert.equal(ctx.Periodo.resumenDelMes('2024-05', ctx.S), null, 'antes de cerrar no hay resumen');
  assert.equal(ctx.Cierre.ejecutar(CORTE, opciones()).ok, true);
  const r = ctx.Periodo.resumenDelMes('2024-05', ctx.S);
  assert.ok(r && typeof r.gastos === 'number' && typeof r.porCategoria === 'object');
  assert.equal(ctx.Periodo.resumenDelMes('2025-05', ctx.S), null, 'un mes posterior al corte sigue con su detalle');
  const suma = Object.values(r.porCategoria).reduce((a, v) => a + v, 0);
  assert.ok(Math.abs(suma - r.gastos) < 0.5, 'las categorías suman el gasto del mes (' + suma + ' vs ' + r.gastos + ')');
});

test('ejecutarCompleto (la entrada que usa la pantalla) espera las sondas y cierra igual que ejecutar', async () => {
  const ctx = preparar();
  const saldosAntes = saldos(ctx);
  const r = await ctx.Cierre.ejecutarCompleto(CORTE, opciones());
  assert.equal(r.ok, true, JSON.stringify(r.diferencias || r));
  assert.equal(saldos(ctx), saldosAntes);
  assert.equal(ctx.S.cierre.corte, CORTE);
});

test('verificarGuardado: lo releído igual a lo de memoria pasa; distinto o no releíble se avisa', async () => {
  const ctx = preparar();
  assert.equal(ctx.Cierre.ejecutar(CORTE, opciones()).ok, true);
  const igual = await ctx.Cierre.verificarGuardado(async () => ({ ok: true, rev: 7, estado: clon(ctx.S) }), ctx.S);
  assert.deepEqual([igual.ok, igual.rev], [true, 7]);
  const otro = clon(ctx.S); otro.libro.pop();
  assert.equal((await ctx.Cierre.verificarGuardado(async () => ({ ok: true, estado: otro }), ctx.S)).motivo, 'distinto-al-releer');
  assert.equal((await ctx.Cierre.verificarGuardado(async () => ({ ok: false, reason: 'sin-documento' }), ctx.S)).motivo, 'no-se-pudo-releer');
  assert.equal((await ctx.Cierre.verificarGuardado(async () => { throw new Error('sin red'); }, ctx.S)).motivo, 'no-se-pudo-releer');
});

test('registrosDeMesesCerrados: un dispositivo atrasado que creó un gasto de un mes ya cerrado se detecta; lo ya existente no', () => {
  const ctx = preparar();
  const base = clon(ctx.S);
  const atrasado = clon(ctx.S);
  atrasado.gastosVar.push({ id: 'g-atrasado', desc: 'Olvidado', monto: 5000, fecha: '2024-05-10', cat: 'Comida', fuente: 'cuenta:nequi', clase: 'gasto' });
  atrasado.gastosVar.push({ id: 'g-reciente', desc: 'Normal', monto: 100, fecha: '2026-09-10', cat: 'Comida', fuente: 'cuenta:nequi', clase: 'gasto' });
  const huerfanos = ctx.Cierre.registrosDeMesesCerrados(base, atrasado, CORTE);
  assert.deepEqual(huerfanos.map(h => h.id), ['g-atrasado'], 'solo el de un mes ≤ corte que no estaba en la base');
  assert.deepEqual(ctx.Cierre.registrosDeMesesCerrados(base, clon(base), CORTE), [], 'sin cambios no hay nada que revisar');
  // el lado que SÍ cerró (sus registros viejos ya existían en la base y las entradas `cierre` del libro no cuentan)
  assert.equal(ctx.Cierre.ejecutar(CORTE, opciones()).ok, true);
  assert.deepEqual(ctx.Cierre.registrosDeMesesCerrados(base, clon(ctx.S), CORTE), []);
});
