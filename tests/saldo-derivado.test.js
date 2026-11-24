'use strict';
// Saldo derivado del libro (docs/diseno-saldo-derivado-y-cierre.md): el saldo de una cuenta o cajita no se guarda, se deriva de S.libro.
// Corre con:  node --test tests/saldo-derivado.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadApp } = require('./support/load-app');
const CORE = path.join(__dirname, '..', 'js', 'core');

function app(extra = {}) {
  const ctx = loadApp(['core-state.js', 'cuenta-efectos.js', 'periodo.js', 'nu-calc.js'].map(f => path.join(CORE, f)), { permissive: true });
  Object.assign(ctx.S, {
    modulos: {}, libro: [], movimientos: [], gastosVar: [], tarjetasCredito: [],
    cuentas: [{ id: 'nequi', tipo: 'billetera', nombre: 'Nequi' }, { id: 'efectivo', tipo: 'efectivo', nombre: 'Efectivo' }, { id: 'ahorro', tipo: 'ahorro', nombre: 'Nu' }],
    cajitas: [{ id: 'c1', nombre: 'Sobra', cuentaId: 'ahorro' }],
  }, extra);
  ctx.Libro.hidratar(ctx.S);
  return ctx;
}
const sumaLibro = (ctx, fuente) => Math.round(ctx.S.libro.filter(l => l.cuenta === fuente).reduce((a, l) => a + Math.round(l.monto * 100), 0)) / 100;

test('el saldo no se serializa: ni JSON.stringify ni un clon lo llevan', () => {
  const ctx = app();
  ctx.sumarFuente('cuenta:nequi', 1500.5);
  ctx.sumarFuente('cajita:c1', 20);
  const texto = JSON.stringify(ctx.S);
  const plano = JSON.parse(texto);
  assert.equal(plano.cuentas.some(c => 'saldo' in c), false);
  assert.equal(plano.cajitas.some(c => 'saldo' in c), false);
  assert.equal(ctx.S.cuentas.find(c => c.id === 'nequi').saldo, 1500.5);
  assert.equal(ctx.S.cajitas[0].saldo, 20);
  assert.equal(ctx.S.cuentas.find(c => c.id === 'ahorro').saldo, undefined, 'la cuenta de ahorro no tiene saldo propio');
});

test('un estado cargado desde JSON se hidrata y da el mismo saldo (ida y vuelta por el texto)', () => {
  const a = app();
  a.sumarFuente('cuenta:efectivo', 700); a.descontarFuente('cuenta:efectivo', 200.25); a.sumarFuente('cajita:c1', 5);
  const b = app();
  Object.keys(b.S).forEach(k => delete b.S[k]);
  Object.assign(b.S, JSON.parse(JSON.stringify(a.S)));
  b.Libro.hidratar(b.S);
  assert.equal(b.S.cuentas.find(c => c.id === 'efectivo').saldo, 499.75);
  assert.equal(b.S.cajitas[0].saldo, 5);
});

test('un respaldo viejo con `saldo` guardado conserva el saldo: la diferencia queda como ajuste «Saldo importado»', () => {
  const ctx = app({ libro: [], cuentas: [{ id: 'nequi', tipo: 'billetera', nombre: 'Nequi', saldo: 321.1 }] });
  ctx.Libro.hidratar(ctx.S);
  assert.equal(ctx.S.cuentas[0].saldo, 321.1);
  assert.deepEqual(ctx.S.libro.map(l => [l.tipo, l.monto, l.origen.modulo]), [['ajuste', 321.1, 'hidratacion']]);
  assert.equal('saldo' in JSON.parse(JSON.stringify(ctx.S)).cuentas[0], false);
});

test('hidratar es idempotente y no duplica ajustes', () => {
  const ctx = app({ cuentas: [{ id: 'nequi', tipo: 'billetera', nombre: 'Nequi', saldo: 50 }] });
  ctx.Libro.hidratar(ctx.S); ctx.Libro.hidratar(ctx.S); ctx.Libro.hidratar(ctx.S);
  assert.equal(ctx.S.libro.length, 1);
  assert.equal(ctx.S.cuentas[0].saldo, 50);
});

test('modo estricto: asignar saldo lanza; sumarFuente/descontarFuente/ajustarSaldoCuenta siguen funcionando', () => {
  const ctx = app();
  ctx.Libro.estricto = true;
  ctx.sumarFuente('cuenta:nequi', 100); ctx.descontarFuente('cuenta:nequi', 30); ctx.ajustarSaldoCuenta('cuenta:nequi', 90);
  const c = ctx.S.cuentas.find(x => x.id === 'nequi');
  assert.equal(c.saldo, 90);
  assert.throws(() => { c.saldo = 5; }, /libro/);
  assert.equal(c.saldo, 90);
});

test('el índice incremental coincide con recalcular desde cero tras muchas operaciones aleatorias (incluido rendimiento que crece en su sitio)', () => {
  const ctx = app();
  let semilla = 12345; const azar = () => (semilla = (semilla * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const fuentes = ['cuenta:nequi', 'cuenta:efectivo', 'cajita:c1'];
  for (let i = 0; i < 600; i++) {
    const f = fuentes[Math.floor(azar() * fuentes.length)];
    const monto = Math.round(azar() * 100000) / 100 + 0.01;
    const r = azar();
    if (r < 0.4) ctx.sumarFuente(f, monto);
    else if (r < 0.8) ctx.descontarFuente(f, monto);
    else ctx.Libro.registrar(f, monto, { tipo: 'rendimiento', fecha: '2026-11-0' + (1 + Math.floor(azar() * 9)) });
  }
  for (const f of fuentes) {
    const objeto = f.startsWith('cajita:') ? ctx.S.cajitas[0] : ctx.S.cuentas.find(c => 'cuenta:' + c.id === f);
    assert.equal(objeto.saldo, sumaLibro(ctx, f), f);
  }
  const antes = fuentes.map(f => ctx.Libro.saldo(f));
  ctx.Libro.reindexar();
  assert.deepEqual(fuentes.map(f => ctx.Libro.saldo(f)), antes, 'reconstruir el índice no cambia nada');
});

test('un push al libro hecho por fuera se detecta (el índice se reconstruye por el largo)', () => {
  const ctx = app();
  ctx.sumarFuente('cuenta:nequi', 10);
  ctx.S.libro.push({ id: 'x', cuenta: 'cuenta:nequi', monto: 5, tipo: 'ajuste', fecha: '2026-11-23', origen: { modulo: 'x' } });
  assert.equal(ctx.S.cuentas.find(c => c.id === 'nequi').saldo, 15);
});

test('conEstadoAislado: la copia se hidrata sola y el real se restaura', () => {
  const ctx = app();
  ctx.sumarFuente('cuenta:nequi', 40);
  const copia = JSON.parse(JSON.stringify(ctx.S));
  const visto = ctx.conEstadoAislado(copia, () => ctx.S.cuentas.find(c => c.id === 'nequi').saldo);
  assert.equal(visto, 40);
  assert.equal(ctx.S.cuentas.find(c => c.id === 'nequi').saldo, 40);
});
