'use strict';
// M9 — lo que está repetido a propósito se vigila con una máquina, no con un comentario «recuerda actualizar…».
//   1) La configuración de Firebase vive en TRES archivos (firebase-init.js, notificaciones-push.js, sw.js): tienen que ser idénticas.
//   2) payload-codec.js (navegador, ES) y scripts/notificaciones/payload-codec.js (Node, CommonJS) sirven al mismo formato 'gz1:':
//      lo que escribe uno lo tiene que leer el otro, en los dos sentidos.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const leer = rel => fs.readFileSync(path.join(raiz, rel), 'utf8').replace(/\r/g, '');

// Extrae el literal `{ ... }` que sigue a «<nombre> = » y lo evalúa (son objetos planos de strings).
function objeto(rel, nombre) {
  const src = leer(rel);
  const i = src.search(new RegExp('\\b' + nombre + '\\s*=\\s*\\{'));
  assert.ok(i >= 0, `${rel}: no encuentro ${nombre}`);
  const ini = src.indexOf('{', i);
  let prof = 0, fin = ini;
  for (; fin < src.length; fin++) { if (src[fin] === '{') prof++; else if (src[fin] === '}' && --prof === 0) break; }
  return JSON.parse(JSON.stringify(vm.runInNewContext('(' + src.slice(ini, fin + 1) + ')')));
}
function objetoSW() {   // sw.js: firebase.initializeApp({ ... })
  const src = leer('sw.js');
  const ini = src.indexOf('{', src.indexOf('firebase.initializeApp('));
  let prof = 0, fin = ini;
  for (; fin < src.length; fin++) { if (src[fin] === '{') prof++; else if (src[fin] === '}' && --prof === 0) break; }
  return JSON.parse(JSON.stringify(vm.runInNewContext('(' + src.slice(ini, fin + 1) + ')')));
}

describe('paridad-config-firebase', () => {
  const init = objeto('js/core/firebase-init.js', 'firebaseConfig');
  const push = objeto('js/core/notificaciones-push.js', '_FCM_CONFIG');
  const sw = objetoSW();
  test('la config tiene los 6 campos esperados', () => {
    for (const k of ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId']) assert.ok(init[k], k);
  });
  test('notificaciones-push.js repite exactamente la config de firebase-init.js', () => assert.deepEqual(push, init));
  test('sw.js repite exactamente la config de firebase-init.js', () => assert.deepEqual(sw, init));
  test('el proyecto es coherente en todos los campos (no queda mezcla de dos proyectos)', () => {
    assert.ok(init.authDomain.startsWith(init.projectId + '.'));
    assert.ok(init.storageBucket.startsWith(init.projectId + '.'));
    assert.ok(init.appId.includes(':web:'));
  });
  test('el SDK de FCM del sw.js y el de la página usan la misma versión', () => {
    const v = rel => [...new Set([...leer(rel).matchAll(/firebasejs\/(\d+\.\d+\.\d+)\//g)].map(m => m[1]))];
    const dePagina = [...new Set([...leer('js/core/firebase-init.js').matchAll(/firebasejs\/(\d+\.\d+\.\d+)\//g), ...leer('js/core/notificaciones-push.js').matchAll(/firebasejs\/(\d+\.\d+\.\d+)\//g)].map(m => m[1]))];
    const delSW = v('sw.js');
    assert.equal(delSW.length, 1, 'sw.js usa una sola versión del SDK');
    assert.deepEqual(dePagina, delSW, 'página y SW: misma versión del SDK de Firebase');
  });
});

describe('paridad-codec-gz1', () => {
  // El códec del navegador es un módulo ES: se evalúa sin los `export` en un contexto con las APIs web que trae Node.
  const navegador = (() => {
    const src = leer('js/core/payload-codec.js').replace(/^export\s+/gm, '');
    const ctx = vm.createContext({ btoa, atob, Blob, Response, CompressionStream, DecompressionStream, console, Uint8Array, String, TextEncoder, TextDecoder });
    vm.runInContext(src + '\nthis.api = { PREFIJO_GZ, codificarPayload, decodificarPayload };', ctx);
    return ctx.api;
  })();
  const nodeCodec = require(path.join(raiz, 'scripts', 'notificaciones', 'payload-codec.js'));
  const textos = ['{"a":1}', JSON.stringify({ nombre: 'Ahorró ñandú 🎉 "comillas"', n: Array.from({ length: 4000 }, (_, i) => i) }), 'x'.repeat(100000)];

  test('mismo prefijo', () => assert.equal(navegador.PREFIJO_GZ, nodeCodec.PREFIJO_GZ));
  test('lo que codifica el navegador lo decodifica Node (y viceversa), con acentos, emoji y textos grandes', async () => {
    for (const t of textos) {
      const deNavegador = await navegador.codificarPayload(t);
      const deNode = await nodeCodec.codificarPayload(t);
      assert.ok(deNavegador.startsWith('gz1:') && deNode.startsWith('gz1:'));
      assert.equal(await nodeCodec.decodificarPayload(deNavegador), t, 'navegador → Node');
      assert.equal(await navegador.decodificarPayload(deNode), t, 'Node → navegador');
      assert.equal(await navegador.decodificarPayload(deNavegador), t, 'navegador → navegador');
      assert.equal(await nodeCodec.decodificarPayload(deNode), t, 'Node → Node');
    }
  });
  test('un texto sin prefijo (datos antiguos sin comprimir) pasa tal cual por los dos', async () => {
    assert.equal(await navegador.decodificarPayload('{"x":1}'), '{"x":1}');
    assert.equal(await nodeCodec.decodificarPayload('{"x":1}'), '{"x":1}');
  });
  test('un gz1: dañado se devuelve tal cual en los dos (JSON.parse fallará → parse-error, nunca se pisa la nube)', async () => {
    const malo = 'gz1:esto-no-es-gzip';
    const silenciar = console.error; console.error = () => {};
    try {
      assert.equal(await nodeCodec.decodificarPayload(malo), malo);
      assert.equal(await navegador.decodificarPayload(malo), malo);
    } finally { console.error = silenciar; }
  });
});
