'use strict';
// Propiedades de la fusión de tres vías (js/core/fusion.js) sobre estados con libro, listas con `id` y listas sin `id`, probadas con
// secuencias aleatorias (semilla fija: si falla, se reproduce) de operaciones hechas por dos «dispositivos» a partir de la misma base.
//   · conmutativa: fusionar(base, A, B) == fusionar(base, B, A) cuando no chocan en el mismo valor;
//   · idempotente y con identidad: fusionar(base, A, A) == A; fusionar(base, A, base) == A;
//   · saldo aditivo: tras hidratar, saldo fusionado == base + (A − base) + (B − base), al centavo;
//   · sin ids duplicados y montos a centavos (sin residuos binarios).
// Corre con:  node --test tests/fusion-propiedades.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { loadApp } = require('./support/load-app');
const RAIZ = path.join(__dirname, '..');

const FUENTES = ['cuenta:nequi', 'cuenta:efectivo', 'cajita:c1'];
const clon = x => JSON.parse(JSON.stringify(x));

function crearBase(ctx) {
  const base = {
    nombre: 'Base', moneda: 'COP',
    cuentas: [{ id: 'nequi', tipo: 'billetera', nombre: 'Nequi' }, { id: 'efectivo', tipo: 'efectivo', nombre: 'Efectivo' }],
    cajitas: [{ id: 'c1', nombre: 'Sobra', cuentaId: 'nequi' }],
    libro: [], movimientos: [], etiquetas: ['uno', 'dos'],
  };
  for (const f of FUENTES) {
    ctx.Libro.registrar(f, 1000, { tipo: 'movimiento', fecha: '2026-10-01', origen: { modulo: 'base' } }, base);
    ctx.Libro.registrar(f, 3.07, { tipo: 'rendimiento', fecha: '2026-11-01' }, base);
  }
  for (let i = 0; i < 4; i++) base.movimientos.push({ id: 'm' + i, monto: 10 * (i + 1), desc: 'm' + i, nota: '' });
  return base;
}

// Cada lado solo toca lo suyo: A escribe `desc` y etiquetas «a…»; B escribe `nota` y etiquetas «b…» (así no hay choques sobre el mismo valor).
function operar(ctx, estado, lado, azar) {
  const pasos = 1 + Math.floor(azar() * 6);
  for (let i = 0; i < pasos; i++) {
    const r = azar(), f = FUENTES[Math.floor(azar() * FUENTES.length)];
    const monto = Math.round(azar() * 100000) / 100 + 0.01;
    if (r < 0.25) ctx.Libro.registrar(f, monto, { tipo: 'movimiento', fecha: '2026-11-1' + Math.floor(azar() * 9), origen: { modulo: lado } }, estado);
    else if (r < 0.45) ctx.Libro.registrar(f, Math.round(azar() * 900) / 100 + 0.01, { tipo: 'rendimiento', fecha: '2026-11-0' + (1 + Math.floor(azar() * 9)) }, estado); // crece en su sitio
    else if (r < 0.60) estado.movimientos.push({ id: lado + 'm' + Math.floor(azar() * 1e6), monto, desc: lado, nota: '' });
    else if (r < 0.75 && estado.movimientos.length) { const m = estado.movimientos[Math.floor(azar() * estado.movimientos.length)]; m[lado === 'a' ? 'desc' : 'nota'] = lado + Math.floor(azar() * 100); }
    else if (r < 0.85 && estado.movimientos.length) estado.movimientos.splice(Math.floor(azar() * estado.movimientos.length), 1);
    else if (r < 0.95) estado.etiquetas.push(lado + 'etq' + Math.floor(azar() * 1000));
    else estado[lado === 'a' ? 'nombre' : 'moneda'] = lado + Math.floor(azar() * 100);
  }
}

// Forma comparable: listas con `id` ordenadas por id, listas sin `id` como conjuntos ordenados (la fusión no promete un orden).
function normalizar(x) {
  if (Array.isArray(x)) {
    const hijos = x.map(normalizar);
    if (x.length && x.every(e => e && typeof e === 'object' && !Array.isArray(e) && e.id != null)) return hijos.sort((p, q) => (p.id < q.id ? -1 : p.id > q.id ? 1 : 0));
    return hijos.sort((p, q) => (JSON.stringify(p) < JSON.stringify(q) ? -1 : 1));
  }
  if (x && typeof x === 'object') { const o = {}; Object.keys(x).sort().forEach(k => { o[k] = normalizar(x[k]); }); return o; }
  return x;
}
const centavos = (estado, fuente) => estado.libro.filter(l => l.cuenta === fuente).reduce((s, l) => s + Math.round(l.monto * 100), 0);

test('fusión: propiedades sobre secuencias aleatorias de dos dispositivos', async () => {
  const { fusionarEstados: fus } = await import(pathToFileURL(path.join(RAIZ, 'js', 'core', 'fusion.js')).href);
  const ctx = loadApp([path.join(RAIZ, 'js', 'core', 'core-state.js')], { permissive: true });
  let semilla = 20261123;
  const azar = () => (semilla = (semilla * 1664525 + 1013904223) % 4294967296) / 4294967296;

  for (let iter = 0; iter < 300; iter++) {
    const base = crearBase(ctx);
    const A = clon(base), B = clon(base);
    operar(ctx, A, 'a', azar); operar(ctx, B, 'b', azar);
    const contexto = `iteración ${iter}`;

    const ab = fus(clon(base), clon(A), clon(B));
    const ba = fus(clon(base), clon(B), clon(A));
    assert.deepEqual(normalizar(ab), normalizar(ba), `${contexto}: no es conmutativa`);
    assert.deepEqual(normalizar(fus(clon(base), clon(A), clon(A))), normalizar(A), `${contexto}: no es idempotente`);
    assert.deepEqual(normalizar(fus(clon(base), clon(A), clon(base))), normalizar(A), `${contexto}: base como remoto debe dar lo local`);
    assert.deepEqual(normalizar(fus(clon(base), clon(base), clon(B))), normalizar(B), `${contexto}: base como local debe dar lo remoto`);

    for (const lista of ['libro', 'movimientos', 'cuentas', 'cajitas']) {
      const ids = ab[lista].map(x => x.id);
      assert.equal(new Set(ids).size, ids.length, `${contexto}: ids duplicados en ${lista}`);
    }
    for (const l of ab.libro) assert.equal(Math.round(l.monto * 100) / 100, l.monto, `${contexto}: monto con residuo binario (${l.monto})`);
    for (const f of FUENTES) {
      assert.equal(centavos(ab, f), centavos(base, f) + (centavos(A, f) - centavos(base, f)) + (centavos(B, f) - centavos(base, f)), `${contexto}: el saldo de ${f} no suma los dos cambios`);
    }
    ctx.Libro.hidratar(ab);
    assert.equal(ab.cuentas[0].saldo, centavos(ab, 'cuenta:nequi') / 100);
  }
});
