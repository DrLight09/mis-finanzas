'use strict';
// MIGRACIONES / aplicarMigraciones (core-state.js): cambios de modelo de datos con versión.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const CORE_DIR = process.env.MIS_FINANZAS_CORE_DIR || path.join(__dirname, '..', 'js', 'core');
// La migración v5 siembra el libro con Libro.sembrar(): hay que cargar libro.js junto con core-state.js.
const app = () => loadApp(['core-state.js', 'libro.js'].map(f => path.join(CORE_DIR, f)));
const plano = x => JSON.parse(JSON.stringify(x));

test('un objeto sin schemaVersion se migra y queda en la versión actual (5)', () => {
  const d = app().aplicarMigraciones({ cuentas: [] });
  assert.equal(d.schemaVersion, 5);
  assert.deepEqual(plano(d.libro), [], 'sin cuentas con saldo el libro nace vacío');
});

test('datos en v2 (los existentes) ejecutan v3, v4 y v5: estampan `clase`, siembran el libro y suben la versión', () => {
  const d = plano(app().aplicarMigraciones({ schemaVersion: 2, movimientos: [{ id: 'a', tipo: 'entrada', monto: 5, fecha: '2026-10-01', desc: 'Sueldo' }] }));
  assert.equal(d.schemaVersion, 5);
  assert.equal(d.movimientos[0].clase, 'ingreso');
});

test('es idempotente: aplicarla dos veces no cambia nada', () => {
  const ctx = app();
  const una = plano(ctx.aplicarMigraciones({ schemaVersion: 2, movimientos: [{ id: 'a', tipo: 'entrada', monto: 5, fecha: '2026-10-01' }], gastosVar: [{ id: 'g', monto: 1, fecha: '2026-10-01' }] }));
  const dos = plano(ctx.aplicarMigraciones(plano(una)));
  assert.deepEqual(dos, una);
});

test('datos de una versión MÁS NUEVA que la app no se tocan', () => {
  const d = plano(app().aplicarMigraciones({ schemaVersion: 999, plataCometida: [{ id: 'a' }] }));
  assert.equal(d.schemaVersion, 999);
  assert.ok(d.plataCometida, 'no se migra lo que esta versión no entiende');
});

test('valores que no son objeto se devuelven tal cual', () => {
  const ctx = app();
  assert.equal(ctx.aplicarMigraciones(null), null);
  assert.equal(ctx.aplicarMigraciones(undefined), undefined);
});


test('migración v4 — el regalo de la abuela ($500.000 a Padre, sin cuenta) pasa a clase "ingreso"; otro préstamo parecido no se toca; es idempotente', () => {
  const mov = (id, extra) => Object.assign({ id, tipo: 'prestamo', monto: 500000, fecha: '2026-09-25', fuente: '', nota: 'Regalo - Abuela' }, extra);
  const d = plano(app().aplicarMigraciones({ schemaVersion: 3, deudores: [{ id: 'p', nombre: 'Padre', movimientos: [
    mov('muhdltc2018'), mov('otro'), mov('muhdltc2018', { id: 'x1', fuente: 'nequi' })] }] }));
  const ms = d.deudores[0].movimientos;
  assert.equal(ms[0].clase, 'ingreso');
  assert.equal(ms[1].clase, undefined, 'otro id: intacto');
  assert.equal(d.schemaVersion, 5);
  assert.deepEqual(plano(app().aplicarMigraciones(plano(d))), d);
});

// ── v5: libro de movimientos (plan-libro-de-movimientos.md) ──────────────────────────────────────────────────
const backupV4 = () => ({ schemaVersion: 4,
  cuentas: [{ id: 'nequi', tipo: 'nequi', saldo: 1150 }, { id: 'efectivo', tipo: 'efectivo', saldo: 500 }],
  cajitas: [
    { id: 'cSp', nombre: 'Spotify', saldo: 1200, historial: [], cdts: [] },
    { id: 'cNu', nombre: 'Ahorro', saldo: 1007, historial: [], cdts: [] },
    { id: 'cCdt', nombre: 'CDTS', saldo: 0, historial: [], cdts: [{ id: 'cdt1', monto: 2000, inicio: '2026-08-05', tasa: 10 }] }],
  movimientos: [
    { id: 'a1', tipo: 'apertura', fuente: 'nequi', monto: 1000, fecha: '2026-09-07' },
    { id: 'a2', tipo: 'apertura', fuente: 'cajita:cNu', monto: 1000, fecha: '2026-09-07' },
    { id: 'a3', tipo: 'apertura', fuente: 'cajita:cCdt', monto: 2000, fecha: '2026-09-07' },
    { id: 'e1', tipo: 'entrada', fuente: 'nequi', monto: 200, fecha: '2026-09-10', desc: 'Sueldo' },
    { id: 'x1', tipo: 'entrada', fuente: 'efectivo', monto: 40, fecha: '2026-09-11', desc: 'Directo a la alcancía', _esAlcanciaIngreso: true }],
  gastosVar: [{ id: 'g1', fecha: '2026-09-12', monto: 50, fuente: 'nequi', desc: 'Comida' }],
  spotifyHistorial: [
    { id: 's1', tipo: 'cobro', monto: 300, fecha: '2026-08-01', fuente: 'cajita:cSp' },
    { id: 's2', tipo: 'cobro', monto: 300, fecha: '2026-08-15', fuente: 'cajita:cSp' }],
});

test('migración v5 — siembra el libro y CADA cuenta cuadra con su saldo guardado (Libro.verificar)', () => {
  const ctx = app();
  const d = plano(ctx.aplicarMigraciones(backupV4()));
  assert.equal(d.schemaVersion, 5);
  const v = ctx.Libro.verificar(d);
  assert.equal(v.ok, true, JSON.stringify(v.descuadres));
  assert.equal(v.filas.length, 5);
});

test('migración v5 — lo que no está en ninguna lista queda como entrada EXPLÍCITA y etiquetada (no se oculta)', () => {
  const ctx = app();
  const d = plano(ctx.aplicarMigraciones(backupV4()));
  const de = c => d.libro.filter(l => l.cuenta === c);
  // Nequi: apertura + sueldo − gasto, sin ajustes. `_esAlcanciaIngreso` NO es pata de ninguna cuenta (Efectivo no sube 40).
  assert.deepEqual(de('nequi').map(l => l.monto).sort((a, b) => a - b), [-50, 200, 1000]);
  assert.equal(de('nequi').some(l => l.origen.modulo === 'migracion-v5'), false);
  // Efectivo: saldo 500 sin ningún registro → ajuste "sin explicar".
  assert.deepEqual(de('efectivo').map(l => [l.tipo, l.monto, l.origen.modulo]), [['ajuste', 500, 'migracion-v5']]);
  // Spotify: saldo previo al reinicio (cobros de agosto, sin apertura) → apertura de 600; el resto (600) = intereses.
  const sp = de('cajita:cSp');
  assert.deepEqual(sp.map(l => [l.tipo, l.monto]), [['apertura', 600], ['rendimiento', 600]]);
  assert.equal(sp[0].fecha, '2026-09-07', 'la apertura lleva la fecha de inicio');
  // Cajita normal: su apertura + 7 de intereses de Nu que nunca se registraron.
  assert.deepEqual(de('cajita:cNu').map(l => [l.tipo, l.monto]).sort(), [['apertura', 1000], ['rendimiento', 7]]);
  // CDT: el capital sale del saldo de la cajita sin registro → pata inferida de tipo 'cdt'.
  assert.deepEqual(de('cajita:cCdt').map(l => [l.tipo, l.monto]).sort(), [['apertura', 2000], ['cdt', -2000]]);
});

test('migración v5 — idempotente y NO resiembra un libro que ya existe', () => {
  const ctx = app();
  const una = plano(ctx.aplicarMigraciones(backupV4()));
  assert.deepEqual(plano(ctx.aplicarMigraciones(plano(una))), una);
  const d = plano(una); d.schemaVersion = 4; d.libro.push({ id: 'mio', fecha: '2026-10-11', cuenta: 'efectivo', monto: 1, tipo: 'ajuste' });
  const n = d.libro.length;
  ctx.aplicarMigraciones(d);
  assert.equal(d.libro.length, n, 'con un libro ya sembrado no se vuelve a sembrar ni duplica');
});

test('Libro.registrar — rendimiento: una entrada por cajita y mes; reversión por contexto: tipo "reversion" con el mismo ref', () => {
  const ctx = app();
  const st = { libro: [] };
  ctx.Libro.registrar('cajita:c1', 10, { tipo: 'rendimiento', fecha: '2026-10-01' }, st);
  ctx.Libro.registrar('cajita:c1', 5, { tipo: 'rendimiento', fecha: '2026-10-20' }, st);
  ctx.Libro.registrar('cajita:c1', 7, { tipo: 'rendimiento', fecha: '2026-11-02' }, st);
  assert.deepEqual(st.libro.map(l => [l.fecha.slice(0, 7), l.monto]), [['2026-10', 15], ['2026-11', 7]]);
  ctx.Libro.conOrigen({ modulo: 'prestado', ref: 'm1', rev: true }, () => ctx.Libro.registrar('nequi', 100, { fecha: '2026-10-21' }, st));
  const u = st.libro[st.libro.length - 1];
  assert.deepEqual([u.tipo, u.origen.modulo, u.origen.ref, u.origen.rev], ['reversion', 'prestado', 'm1', true]);
  assert.equal(ctx.Libro.registrar('tc:x', 5, {}, st), null, 'una tarjeta de crédito no es cuenta con saldo: no entra al libro');
});

test('sumarFuente / descontarFuente — cada cambio deja su pata en el libro y el saldo ya NO se recorta en 0', () => {
  const ctx = app();
  Object.assign(ctx.S, { cuentas: [{ id: 'nequi', tipo: 'nequi', saldo: 0 }, { id: 'efectivo', tipo: 'efectivo', saldo: 0 }], cajitas: [], libro: [] });
  ctx.sumarFuente('efectivo', 50, { origen: { modulo: 't', ref: 'r1' } });
  ctx.descontarFuente('nequi', 300, { origen: { modulo: 't', ref: 'r2' } });
  assert.equal(ctx.S.cuentas.find(c => c.id === 'nequi').saldo, -300, 'antes se recortaba en 0 y la salida de $300 se perdía');
  assert.deepEqual(plano(ctx.S.libro.map(l => [l.cuenta, l.monto, l.origen.ref])), [['efectivo', 50, 'r1'], ['nequi', -300, 'r2']]);
  assert.equal(ctx.Libro.verificar().ok, true);
  ctx.ajustarSaldoCuenta('efectivo', 80, { tipo: 'ajuste', desc: 'chequeo' });
  assert.equal(ctx.S.libro[ctx.S.libro.length - 1].monto, 30, 'ajustarSaldoCuenta registra la DIFERENCIA');
  assert.equal(ctx.Libro.verificar().ok, true);
});

test('Libro.entradasVisibles — solo lo que ningún registro heredado representa (intereses, ajustes, CDT, saldo previo del reinicio)', () => {
  const ctx = app();
  const d = plano(ctx.aplicarMigraciones(backupV4()));
  const v = plano(ctx.Libro.entradasVisibles(d));
  const etiqueta = l => l.cuenta + ':' + l.tipo;
  assert.deepEqual(v.map(etiqueta).sort(), ['cajita:cCdt:cdt', 'cajita:cNu:rendimiento', 'cajita:cSp:apertura', 'cajita:cSp:rendimiento', 'efectivo:ajuste']);
  assert.equal(v.some(l => l.cuenta === 'nequi'), false, 'Nequi no tiene nada sin fila: sus movimientos ya salen de las listas heredadas');
  assert.equal(v.some(l => l.tipo === 'apertura' && l.origen.modulo !== 'migracion-v5'), false, 'una apertura con su propia fila (S.movimientos) no se duplica');
  assert.equal(v.reduce((a, l) => a + l.monto, 0), 600 + 600 + 7 - 2000 + 500, 'suma de lo que añaden al historial');
});
