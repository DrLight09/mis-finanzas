'use strict';
// tests/refresh.test.js — Refresh (js/core/core-state.js): registro de partes de refresh() en vez de una cadena de parches.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const RAIZ = path.join(__dirname, '..');
function nueva(activas = []) {
  const ctx = loadApp([path.join(RAIZ, 'js/core/core-state.js')], { permissive: true });
  ctx.document.getElementById = id => ({ classList: { contains: c => c === 'active' && activas.some(n => id === 'screen-' + n) } });
  ctx._refreshNucleo = () => {}; // el cuerpo de siempre (hero, listas) no es lo que se prueba aquí
  return ctx;
}
const silencio = fn => { const e = console.error; const l = []; console.error = (...a) => l.push(a); try { return [fn(), l]; } finally { console.error = e; } };

test('Refresh: corre las partes en orden de `orden` y, a igual orden, en orden de registro', () => {
  const { Refresh } = nueva(); const v = [];
  Refresh.registrar('c', () => v.push('c'), { orden: 200 });
  Refresh.registrar('a', () => v.push('a'));
  Refresh.registrar('b', () => v.push('b'));
  Refresh.registrar('z', () => v.push('z'), { orden: 1 });
  Refresh.ejecutar();
  assert.deepEqual(v, ['z', 'a', 'b', 'c']);
});

test('Refresh: una parte que falla no silencia a las siguientes, y deja rastro en consola con su id', () => {
  const { Refresh } = nueva(); const v = [];
  Refresh.registrar('rota', () => { throw new Error('boom'); });
  Refresh.registrar('sana', () => v.push('sana'));
  const [, log] = silencio(() => Refresh.ejecutar());
  assert.deepEqual(v, ['sana']);
  assert.equal(log.length, 1);
  assert.equal(log[0][0], '[Refresh:rota]');
});

test('Refresh: registrar el mismo id REEMPLAZA (un módulo lazy cargado dos veces no se duplica) y conserva su lugar', () => {
  const { Refresh } = nueva(); const v = [];
  Refresh.registrar('a', () => v.push('a1'));
  Refresh.registrar('b', () => v.push('b'));
  Refresh.registrar('a', () => v.push('a2'));
  Refresh.ejecutar();
  assert.deepEqual(v, ['a2', 'b']);
  assert.equal(Refresh.registrados().length, 2);
});

test('Refresh: `pantalla` limita la parte a cuando esa pantalla está activa (string o lista); sin `pantalla` corre siempre', () => {
  const { Refresh } = nueva(['encargos']); const v = [];
  Refresh.registrar('enc', () => v.push('enc'), { pantalla: 'encargos' });
  Refresh.registrar('hist', () => v.push('hist'), { pantalla: 'historial' });
  Refresh.registrar('varias', () => v.push('varias'), { pantalla: ['historial', 'encargos'] });
  Refresh.registrar('siempre', () => v.push('siempre'));
  Refresh.ejecutar();
  assert.deepEqual(v, ['enc', 'varias', 'siempre']);
});

test('Refresh: quitar() y validación de argumentos', () => {
  const { Refresh } = nueva(); const v = [];
  Refresh.registrar('a', () => v.push('a')); Refresh.quitar('a'); Refresh.ejecutar();
  assert.deepEqual(v, []);
  assert.throws(() => Refresh.registrar('', () => {}));
  assert.throws(() => Refresh.registrar('x', null));
});

test('refresh() corre primero el cuerpo de siempre y después las partes registradas', () => {
  const ctx = nueva(); const v = [];
  // refresh() llama a _refreshNucleo por nombre global: se reemplaza por una marca
  ctx._refreshNucleo = () => v.push('nucleo');
  ctx.Refresh.registrar('x', () => v.push('x'));
  ctx.refresh();
  assert.deepEqual(v, ['nucleo', 'x']);
});

test('guarda: ningún js/ vuelve a envolver window.refresh a mano ni con hookGlobal — se usa Refresh.registrar', () => {
  const sinComentarios = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
  const archivos = ['core', 'modules'].flatMap(d => fs.readdirSync(path.join(RAIZ, 'js', d)).map(f => path.join(RAIZ, 'js', d, f))).filter(f => f.endsWith('.js'));
  const re = /window\.refresh\s*=[^=]|(?:^|[^.\w])refresh\s*=\s*function|hookGlobal\(\s*['"]refresh['"]/m;
  const malos = archivos.filter(f => re.test(sinComentarios(fs.readFileSync(f, 'utf8')))).map(f => path.relative(RAIZ, f));
  assert.deepEqual(malos, []);
});
