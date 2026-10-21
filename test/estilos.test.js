'use strict';
// tests/estilos.test.js — Paso 5 (estilos inline → clases): guardia de lo ya convertido.
// Corre con:  node --test tests/estilos.test.js   (o todo: npm test)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const CSS = fs.readFileSync(path.join(RAIZ, 'css', 'styles.css'), 'utf8');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

// Archivos ya convertidos: { archivo, prefijos de clase propios, style="" que se permiten (solo display:none que JS conmuta) }
const CONVERTIDOS = [
  { f: 'js/core/diferencial.js', prefijos: ['diferencial-'], permitidos: ['display:none;'] },
  { f: 'js/core/split.js', prefijos: ['split-'], permitidos: [] },
];

CONVERTIDOS.forEach(({ f, prefijos, permitidos }) => {
  const src = leer(f);
  test(`${f} — no queda ningún style="" estático salvo el display:none que JS conmuta`, () => {
    const usados = [...src.matchAll(/style=\\?"([^"]*)"/g)].map(m => m[1]);
    const extra = usados.filter(v => !permitidos.includes(v));
    assert.deepEqual(extra, [], 'estilo inline nuevo: muévelo a una clase en css/styles.css');
  });
  test(`${f} — toda clase ${prefijos.join('/')}* que usa existe en styles.css`, () => {
    const re = new RegExp(`\\b((?:${prefijos.map(p => p.replace('-', '\\-')).join('|')})[a-z0-9-]+)`, 'g');
    const clases = [...new Set([...src.matchAll(re)].map(m => m[1]))];
    assert.ok(clases.length > 0);
    const faltan = clases.filter(c => !new RegExp('\\.' + c.replace(/-/g, '\\-') + '(?![\\w-])').test(CSS));
    assert.deepEqual(faltan, []);
  });
});

test('el resumen vacío del diferencial se colapsa (antes lo hacía [style*="min-height"]:empty sobre el style inline)', () => {
  assert.match(CSS, /\.diferencial-resumen:empty\{min-height:0;?\}/);
});
