'use strict';
// Registro local de errores no atrapados (js/core/registro-errores.js) y el tope de tamaño del payload frente a firestore.rules.
// Corre con:  node --test tests/registro-errores.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const RAIZ = path.join(__dirname, '..');

// El módulo es ES y en Node no hay `window`: no instala oyentes ni toca el puente, solo expone sus funciones. localStorage se simula.
function almacenamiento() {
  const datos = new Map();
  return { getItem: k => (datos.has(k) ? datos.get(k) : null), setItem: (k, v) => datos.set(k, String(v)), removeItem: k => datos.delete(k) };
}
let _n = 0;
async function cargar() {
  globalThis.localStorage = almacenamiento();
  const modulo = await import(pathToFileURL(path.join(RAIZ, 'js', 'core', 'registro-errores.js')).href + '?t=' + (++_n));
  return Object.assign({ localStorage: globalThis.localStorage }, modulo);
}

test('registrarError guarda mensaje y pila; listarErrores los devuelve; limpiarErrores borra', async () => {
  const ctx = await cargar();
  ctx.registrarError('error', new Error('algo falló'));
  const lista = ctx.listarErrores();
  assert.equal(lista.length, 1);
  assert.equal(lista[0].mensaje, 'algo falló');
  assert.equal(lista[0].origen, 'error');
  assert.match(lista[0].pila, /algo falló/);
  ctx.limpiarErrores();
  assert.equal(ctx.listarErrores().length, 0);
});

test('el mismo error seguido solo sube el contador (un bucle no desplaza los demás)', async () => {
  const ctx = await cargar();
  ctx.registrarError('promesa', 'uno');
  for (let i = 0; i < 50; i++) ctx.registrarError('promesa', 'repetido');
  const lista = ctx.listarErrores();
  assert.equal(lista.length, 2);
  assert.equal(lista[1].veces, 50);
});

test('solo se guardan los 30 más recientes', async () => {
  const ctx = await cargar();
  for (let i = 0; i < 45; i++) ctx.registrarError('error', 'error ' + i);
  const lista = ctx.listarErrores();
  assert.equal(lista.length, 30);
  assert.equal(lista[0].mensaje, 'error 15');
  assert.equal(lista[29].mensaje, 'error 44');
});

test('ignora el aviso inofensivo de ResizeObserver y nunca lanza (valores raros, almacenamiento roto)', async () => {
  const ctx = await cargar();
  ctx.registrarError('error', 'ResizeObserver loop completed with undelivered notifications.');
  assert.equal(ctx.listarErrores().length, 0);
  assert.doesNotThrow(() => { ctx.registrarError('error', undefined); ctx.registrarError('error', null); ctx.registrarError('promesa', { a: 1 }); });
  ctx.localStorage.getItem = () => { throw new Error('almacenamiento bloqueado'); };
  assert.doesNotThrow(() => ctx.registrarError('error', 'x'));
  assert.deepEqual(ctx.listarErrores(), []);
});

test('erroresATexto arma un texto pegable con el contador', async () => {
  const ctx = await cargar();
  ctx.registrarError('error', 'a'); ctx.registrarError('error', 'a');
  assert.match(ctx.erroresATexto(), /error ×2: a/);
});

test('el límite de tamaño del cliente queda por debajo del que rechazan las reglas de Firestore', () => {
  const reglas = fs.readFileSync(path.join(RAIZ, 'firestore.rules'), 'utf8');
  const tope = Number(/payload\.size\(\)\s*<\s*(\d+)/.exec(reglas)[1]);
  const sync = fs.readFileSync(path.join(RAIZ, 'js', 'core', 'firebase-sync.js'), 'utf8');
  const [, aviso, limite] = /PAYLOAD_AVISO_BYTES\s*=\s*(\d+),\s*PAYLOAD_LIMITE_BYTES\s*=\s*(\d+)/.exec(sync).map(Number);
  assert.ok(limite < tope, `el límite del cliente (${limite}) debe ser menor que el de las reglas (${tope}): si no, la escritura falla sin aviso`);
  assert.ok(aviso < limite);
});
