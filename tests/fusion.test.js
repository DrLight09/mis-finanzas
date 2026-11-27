// Fusión de tres vías (js/core/fusion.js) y saldo derivado del libro tras fusionar (Libro.hidratar).
// Idea que se prueba: dos dispositivos parten del mismo estado (base), cada uno cambia cosas y las dos versiones se UNEN cuando
// no tocan lo mismo; solo chocan los cambios sobre el mismo valor (gana el local).
const test = require('node:test'), { describe, before } = test;
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { pathToFileURL } = require('node:url');
const { loadApp } = require('./support/load-app');

const RAIZ = path.join(__dirname, '..');
let F;
before(async () => { F = await import(pathToFileURL(path.join(RAIZ, 'js', 'core', 'fusion.js')).href); });
const fus = (b, l, r) => F.fusionarEstados(b, l, r);

describe('fusión — objetos y valores', () => {
  test('cambios en cosas distintas se unen (el caso real: un saldo nuevo aquí, un nombre cambiado allá)', () => {
    const base = { cuentas: [{ id: 'nu', nombre: 'Nu', saldo: 10 }, { id: 'ef', nombre: 'Efectivo', saldo: 0 }] };
    const local = { cuentas: [{ id: 'nu', nombre: 'Nu', saldo: 10 }, { id: 'ef', nombre: 'Efectivo', saldo: 50000 }] };
    const remoto = { cuentas: [{ id: 'nu', nombre: 'Nu Bank', saldo: 10 }, { id: 'ef', nombre: 'Efectivo', saldo: 0 }] };
    const m = fus(base, local, remoto);
    assert.equal(m.cuentas.find(c => c.id === 'nu').nombre, 'Nu Bank');
    assert.equal(m.cuentas.find(c => c.id === 'ef').saldo, 50000);
  });
  test('claves de primer nivel: cada lado cambia una distinta', () => {
    const m = fus({ a: 1, b: 1 }, { a: 2, b: 1 }, { a: 1, b: 3 });
    assert.deepEqual(m, { a: 2, b: 3 });
  });
  test('choque real (los dos cambian el mismo valor): gana el local', () => {
    assert.deepEqual(fus({ a: 1 }, { a: 2 }, { a: 3 }), { a: 2 });
  });
  test('el mismo cambio en los dos lados queda una vez; sin cambios devuelve lo mismo', () => {
    assert.deepEqual(fus({ a: 1 }, { a: 2 }, { a: 2 }), { a: 2 });
    assert.deepEqual(fus({ a: 1 }, { a: 1 }, { a: 1 }), { a: 1 });
  });
  test('una clave borrada en un lado y sin tocar en el otro se borra; borrada y editada se conserva editada', () => {
    assert.deepEqual(fus({ a: 1, b: 1 }, { a: 1 }, { a: 1, b: 1 }), { a: 1 });
    assert.deepEqual(fus({ a: 1, b: 1 }, { a: 1 }, { a: 1, b: 9 }), { a: 1, b: 9 });
  });
  test('no modifica sus entradas', () => {
    const base = { l: [{ id: 'x', v: 1 }] }, local = { l: [{ id: 'x', v: 2 }] }, remoto = { l: [{ id: 'x', v: 1 }, { id: 'y', v: 1 }] };
    const copias = JSON.stringify([base, local, remoto]);
    fus(base, local, remoto);
    assert.equal(JSON.stringify([base, local, remoto]), copias);
  });
});

describe('fusión — listas con id', () => {
  const m = (id, extra = {}) => ({ id, monto: 100, ...extra });
  test('altas de los dos lados se conservan (nada se pierde) y no se duplican', () => {
    const base = { movimientos: [m('a')] };
    const r = fus(base, { movimientos: [m('a'), m('b')] }, { movimientos: [m('a'), m('c')] });
    assert.deepEqual(r.movimientos.map(x => x.id).sort(), ['a', 'b', 'c']);
  });
  test('el mismo registro agregado en los dos lados (mismo id) queda una vez', () => {
    const r = fus({ movimientos: [] }, { movimientos: [m('a')] }, { movimientos: [m('a')] });
    assert.equal(r.movimientos.length, 1);
  });
  test('borrado en un lado y sin tocar en el otro: se borra, sin marcas de borrado', () => {
    const base = { movimientos: [m('a'), m('b')] };
    const r = fus(base, { movimientos: [m('b')] }, { movimientos: [m('a'), m('b'), m('c')] });
    assert.deepEqual(r.movimientos.map(x => x.id).sort(), ['b', 'c']);
  });
  test('borrado en un lado y EDITADO en el otro: se conserva el editado', () => {
    const base = { movimientos: [m('a')] };
    const r = fus(base, { movimientos: [] }, { movimientos: [m('a', { desc: 'corregido' })] });
    assert.equal(r.movimientos.length, 1); assert.equal(r.movimientos[0].desc, 'corregido');
  });
  test('el mismo registro editado en campos distintos: se unen los dos campos', () => {
    const base = { gastosVar: [{ id: 'g', cat: 'Comida', monto: 10 }] };
    const r = fus(base, { gastosVar: [{ id: 'g', cat: 'Mercado', monto: 10 }] }, { gastosVar: [{ id: 'g', cat: 'Comida', monto: 25 }] });
    assert.deepEqual(r.gastosVar[0], { id: 'g', cat: 'Mercado', monto: 25 });
  });
  test('libro: el monto de una entrada que crece en el sitio (intereses) suma los dos aumentos', () => {
    const base = { libro: [{ id: 'l1', cuenta: 'cajita:c', monto: 100, tipo: 'rendimiento' }] };
    const r = fus(base, { libro: [{ id: 'l1', cuenta: 'cajita:c', monto: 130, tipo: 'rendimiento' }] }, { libro: [{ id: 'l1', cuenta: 'cajita:c', monto: 110, tipo: 'rendimiento' }] });
    assert.equal(r.libro[0].monto, 140);
  });
  test('lista vacía en la base y con registros en un lado', () => {
    const r = fus({ tcMovimientos: [] }, { tcMovimientos: [m('a')] }, { tcMovimientos: [] });
    assert.deepEqual(r.tcMovimientos.map(x => x.id), ['a']);
  });
});

describe('fusión — listas sin id (conjuntos)', () => {
  test('categorías: lo agregado por cada lado se conserva y lo quitado se quita', () => {
    const r = fus({ catsVar: ['Comida', 'Ocio', 'Taxi'] }, { catsVar: ['Comida', 'Ocio', 'Taxi', 'Gym'] }, { catsVar: ['Comida', 'Taxi', 'Ropa'] });
    assert.deepEqual(r.catsVar.sort(), ['Comida', 'Gym', 'Ropa', 'Taxi']);
  });
  test('historial por fecha (objetos sin id): cada lado agrega sus días', () => {
    const r = fus({ h: [{ fecha: '2026-11-01', v: 1 }] }, { h: [{ fecha: '2026-11-01', v: 1 }, { fecha: '2026-11-02', v: 2 }] }, { h: [{ fecha: '2026-11-01', v: 1 }, { fecha: '2026-11-03', v: 3 }] });
    assert.deepEqual(r.h.map(x => x.fecha).sort(), ['2026-11-01', '2026-11-02', '2026-11-03']);
  });
});

describe('reversiones del libro hechas a la vez por los dos dispositivos (eliminación doble)', () => {
  const entrada = (id, monto, extra) => Object.assign({ id, cuenta: 'cuenta:ef', monto, tipo: 'movimiento', fecha: '2026-11-20', origen: { modulo: 'gastos', ref: 'g1' } }, extra || {});
  const reversion = (id, monto, ref, modulo) => entrada(id, monto, { tipo: 'reversion', origen: { modulo: modulo || 'movimientos', ref: ref || 'g1', rev: true } });
  const base = { libro: [entrada('l1', -50000)] };
  const con = (...entradas) => ({ libro: [entrada('l1', -50000), ...entradas] });
  const saldo = estado => Math.round(estado.libro.reduce((a, l) => a + l.monto * 100, 0)) / 100;

  test('los dos eliminan el MISMO movimiento: la plata se devuelve UNA vez (antes quedaba devuelta dos veces)', () => {
    const A = con(reversion('lA', 50000)), B = con(reversion('lB', 50000));
    const m = fus(base, A, B), n = fus(base, B, A);
    assert.equal(m.libro.length, 2); assert.equal(saldo(m), 0);
    assert.deepEqual(m.libro.map(l => l.id).sort(), n.libro.map(l => l.id).sort(), 'no depende de qué lado es el local');
  });
  test('una reversión en un solo lado se conserva', () => {
    const m = fus(base, con(reversion('lA', 50000)), base);
    assert.equal(m.libro.length, 2); assert.equal(saldo(m), 0);
  });
  test('reversiones de DISTINTO ref, monto, cuenta o módulo no se confunden', () => {
    for (const otra of [reversion('lB', 50000, 'g2'), reversion('lB', 40000), reversion('lB', 50000, 'g1', 'tarjetas'), Object.assign(reversion('lB', 50000), { cuenta: 'cuenta:nq' })]) {
      const m = fus(base, con(reversion('lA', 50000)), con(otra));
      assert.equal(m.libro.length, 3, 'las dos reversiones se conservan: ' + JSON.stringify(otra.origen));
    }
  });
  test('un movimiento normal (no reversión) hecho igual en los dos lados NO se deduplica: son dos movimientos', () => {
    const m = fus(base, con(entrada('lA', -1000, { origen: { modulo: 'gastos', ref: 'g9' } })), con(entrada('lB', -1000, { origen: { modulo: 'gastos', ref: 'g9' } })));
    assert.equal(m.libro.length, 3);
  });
  test('una reversión que ya estaba en la base no se toca', () => {
    const b2 = con(reversion('lR', 50000));
    const m = fus(b2, JSON.parse(JSON.stringify(b2)), JSON.parse(JSON.stringify(b2)));
    assert.equal(m.libro.length, 2);
  });
  test('tres reversiones idénticas nuevas en un lado y una en el otro: solo se emparejan una a una', () => {
    const m = fus(base, con(reversion('lA1', 10), reversion('lA2', 10), reversion('lA3', 10)), con(reversion('lB1', 10)));
    assert.equal(m.libro.length, 1 + 3, 'la de B se empareja con una de A; las otras dos de A quedan');
  });
});

describe('listas sin id con clave natural (una fila por fecha): patrimonioHistorial e historialTasas', () => {
  const base = { patrimonioHistorial: [{ fecha: '2026-11-23', valor: 100 }], cuentas: [{ id: 'a', tipo: 'ahorro', historialTasas: [{ fecha: '2026-01-01', tasa: 8 }] }] };
  const copia = () => JSON.parse(JSON.stringify(base));
  test('el mismo día registrado en los dos dispositivos deja UNA fila (antes quedaban dos)', () => {
    const A = copia(), B = copia();
    A.patrimonioHistorial.push({ fecha: '2026-11-24', valor: 120 }); B.patrimonioHistorial.push({ fecha: '2026-11-24', valor: 125 });
    A.cuentas[0].historialTasas.push({ fecha: '2026-06-01', tasa: 9 }); B.cuentas[0].historialTasas.push({ fecha: '2026-06-01', tasa: 9.5 });
    const m = fus(base, A, B), n = fus(base, B, A);
    assert.equal(m.patrimonioHistorial.length, 2); assert.equal(m.cuentas[0].historialTasas.length, 2);
    assert.deepEqual(m, n, 'el resultado no depende de qué lado es el local');
  });
  test('días distintos se suman, y la lista queda ordenada por fecha (el último es el más reciente)', () => {
    const A = copia(), B = copia();
    A.patrimonioHistorial.push({ fecha: '2026-11-25', valor: 1 }); B.patrimonioHistorial.push({ fecha: '2026-11-24', valor: 2 });
    const m = fus(base, A, B);
    assert.deepEqual(m.patrimonioHistorial.map(h => h.fecha), ['2026-11-23', '2026-11-24', '2026-11-25']);
  });
  test('editar un día en un lado y no en el otro conserva la edición; borrar en uno sin tocar en el otro lo borra', () => {
    const A = copia(), B = copia();
    A.patrimonioHistorial[0].valor = 111;
    assert.equal(fus(base, A, B).patrimonioHistorial[0].valor, 111);
    const C = copia(); C.patrimonioHistorial = [];
    assert.equal(fus(base, C, B).patrimonioHistorial.length, 0);
  });
});

describe('saldo derivado — tras fusionar, el saldo es la suma del libro unido (no hay nada que recalcular)', () => {
  const app = () => loadApp([path.join(RAIZ, 'js', 'core', 'core-state.js')], { permissive: true });
  const e = (id, monto) => ({ id, cuenta: 'cuenta:ef', monto, tipo: 'movimiento', fecha: '2026-11-20', origen: { modulo: 'x' } });
  test('dos dispositivos suman a la misma cuenta: la unión del libro da la suma de las dos entradas', () => {
    const ctx = app();
    const cuenta = { id: 'ef', tipo: 'efectivo', nombre: 'Efectivo' };
    const base = { cuentas: [cuenta], libro: [e('l0', 100)] };
    const local = { cuentas: [cuenta], libro: [e('l0', 100), e('l1', 50)] };
    const remoto = { cuentas: [cuenta], libro: [e('l0', 100), e('l2', 30)] };
    const merged = fus(base, local, remoto);
    ctx.Libro.hidratar(merged);
    assert.equal(merged.cuentas[0].saldo, 180, '100 + 50 + 30');
    assert.equal('saldo' in JSON.parse(JSON.stringify(merged)).cuentas[0], false, 'el saldo no viaja en el estado');
  });
  test('el orden de las entradas no cambia el saldo (centavos enteros: sin residuos binarios)', () => {
    const ctx = app();
    const montos = [0.1, 0.2, 0.3, 1234.56, -0.07, 99.99, 0.01];
    const arma = ms => ({ cuentas: [{ id: 'ef', tipo: 'efectivo', nombre: 'Efectivo' }], libro: ms.map((m, i) => e('l' + i, m)) });
    const a = arma(montos), b = arma([...montos].reverse());
    ctx.Libro.hidratar(a); ctx.Libro.hidratar(b);
    assert.equal(a.cuentas[0].saldo, b.cuentas[0].saldo);
    assert.equal(a.cuentas[0].saldo, 1335.09);
  });
});

describe('módulo de sincronización — importaciones', () => {
  test('firebase-sync.js no importa dos veces el mismo nombre (sería un error de sintaxis en el navegador, invisible en los tests)', () => {
    const src = fs.readFileSync(path.join(RAIZ, 'js', 'core', 'firebase-sync.js'), 'utf8');
    const nombres = [...src.matchAll(/^import\s*\{([^}]*)\}\s*from/gm)].flatMap(m => m[1].split(',').map(x => x.trim().split(/\s+as\s+/).pop()).filter(Boolean));
    const repetidos = nombres.filter((n, i) => nombres.indexOf(n) !== i);
    assert.deepEqual(repetidos, []);
  });
});
