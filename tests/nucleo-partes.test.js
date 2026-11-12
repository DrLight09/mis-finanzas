'use strict';
// El núcleo (antes core-state.js) son 8 archivos clásicos; index.html los carga en el MISMO orden que usa loadApp.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { REL, RUTAS } = require('./support/nucleo-estado');
const raiz = path.join(__dirname, '..');

test('index.html carga las partes del núcleo en orden, seguidas y después de fecha/ui/formulario', () => {
  const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
  const pos = REL.map(f => html.indexOf('<script src="' + f + '" defer>'));
  pos.forEach((p, i) => assert.ok(p > 0, REL[i] + ' falta en index.html'));
  assert.deepEqual([...pos].sort((a, b) => a - b), pos, 'orden distinto al de nucleo-estado.js');
  assert.ok(html.indexOf('js/core/fecha.js') < pos[0]);
});
test('core-state.js ya no existe y ningún archivo de la app lo carga', () => {
  assert.ok(!fs.existsSync(path.join(raiz, 'js/core/core-state.js')));
  assert.ok(!/core-state/.test(fs.readFileSync(path.join(raiz, 'index.html'), 'utf8')));
});
test('cada parte es JS válido y ninguna declara dos veces el mismo nombre top-level', () => {
  const vistos = new Map();
  for (const r of RUTAS) {
    const src = fs.readFileSync(r, 'utf8');
    assert.doesNotThrow(() => new Function(src), r);
    for (const m of src.matchAll(/^(?:function|async function|const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) {
      assert.ok(!vistos.has(m[1]), `${m[1]} está en ${vistos.get(m[1])} y en ${path.basename(r)}`);
      vistos.set(m[1], path.basename(r));
    }
  }
});
