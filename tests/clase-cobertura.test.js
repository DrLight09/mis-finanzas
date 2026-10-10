'use strict';
// Guardia de cobertura (plan-clasificacion-movimientos.md): todo código que CREA un movimiento ingreso/gasto en
// S.movimientos, S.gastosVar o cuenta.movimientos (objeto literal) debe escribir `clase`. Un módulo nuevo que
// lo olvide rompe este test en vez de dejar el ingreso o gasto del mes mal sin avisar.
// Quedan fuera a propósito: las salidas espejo (tipo 'salida'/'egreso'; 'salida_manual' SÍ lleva clase: es un gasto,
// ver §7 del plan) y las listas sin lectores de clase (deudores, encargos, transferencias, tcMovimientos).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..', 'js');
const archivos = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? archivos(path.join(d, e.name)) : /\.js$/.test(e.name) ? [path.join(d, e.name)] : []);
const PUSH = /(?:\bS\.movimientos|\bwindow\.S\.movimientos|\bS\.gastosVar|\bwindow\.S\.gastosVar|\bcObj\.movimientos)\.push\(\s*\{/g;

function literal(src, desde) { // devuelve el texto del objeto literal que empieza en src[desde] === '{'
  let prof = 0;
  for (let i = desde; i < src.length; i++) {
    if (src[i] === '{') prof++;
    else if (src[i] === '}' && --prof === 0) return src.slice(desde, i + 1);
  }
  return src.slice(desde, desde + 600);
}

test('todo push literal a S.movimientos / S.gastosVar escribe `clase` (salvo salidas)', () => {
  const faltan = [];
  archivos(RAIZ).forEach(f => {
    const src = fs.readFileSync(f, 'utf8');
    let m;
    while ((m = PUSH.exec(src))) {
      const lit = literal(src, m.index + m[0].length - 1);
      if (/\bclase\s*[:,]/.test(lit)) continue;
      if (/tipo\s*:\s*'(salida|egreso)'/.test(lit)) continue;
      faltan.push(path.relative(RAIZ, f) + ':' + src.slice(0, m.index).split('\n').length);
    }
  });
  assert.deepEqual(faltan, [], 'movimientos creados sin clase: ' + faltan.join(', '));
});
