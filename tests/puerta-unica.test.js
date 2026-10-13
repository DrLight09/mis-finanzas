'use strict';
// Guardia estática del libro de movimientos (libro-de-movimientos.md §3, reglas 2 y 3):
//   · nadie escribe `c.saldo` fuera de la puerta única (sumarFuente / descontarFuente / ajustarSaldoCuenta en core-state.js);
//   · toda llamada a sumarFuente / descontarFuente lleva `origen` (directo, vía _og…(), o con un `opts` ya armado).
// Un módulo nuevo que se salte cualquiera de las dos rompe este test en vez de dejar una entrada 'sin-origen' o un
// descuadre que solo avisaría `save()` una vez por sesión.
// Corre con:  node --test tests/puerta-unica.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..', 'js');
const archivos = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? archivos(path.join(d, e.name)) : /\.js$/.test(e.name) ? [path.join(d, e.name)] : []);

// Quita comentarios (conservando saltos de línea) sin tocar el contenido de strings ni de plantillas.
function sinComentarios(src) {
  let out = '', i = 0;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') out += '\n'; i++; } i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; out += c; i++;
      while (i < src.length && src[i] !== q) { if (src[i] === '\\') { out += src[i++]; } out += src[i++]; }
      out += q; i++; continue;
    }
    out += c; i++;
  }
  return out;
}

// Texto de los argumentos de la llamada que empieza en src[abre] === '('.
function argumentos(src, abre) {
  let prof = 0;
  for (let i = abre; i < src.length; i++) {
    if (src[i] === '(') prof++;
    else if (src[i] === ')' && --prof === 0) return src.slice(abre + 1, i);
  }
  return src.slice(abre + 1, abre + 300);
}

const lineaDe = (src, idx) => src.slice(0, idx).split('\n').length;

test('nadie escribe `.saldo` fuera de la puerta única', () => {
  const fuera = [];
  archivos(RAIZ).forEach(f => {
    let src = sinComentarios(fs.readFileSync(f, 'utf8'));
    if (path.basename(f) === 'core-state.js') { // la puerta única misma
      const a = src.indexOf('function ajustarSaldoCuenta'), b = src.indexOf('function _listaFuentes');
      assert.ok(a > 0 && b > a, 'no se encontró el bloque de la puerta única en core-state.js');
      src = src.slice(0, a) + src.slice(a, b).replace(/[^\n]/g, ' ') + src.slice(b);
    }
    const re = /\.saldo\s*(?:\+|-|\*|\/)?=(?!=)/g;
    let m;
    while ((m = re.exec(src))) fuera.push(path.relative(RAIZ, f) + ':' + lineaDe(src, m.index));
  });
  assert.deepEqual(fuera, [], 'escrituras directas de saldo (usar sumarFuente/descontarFuente/ajustarSaldoCuenta con origen): ' + fuera.join(', '));
});

// Llamadas que NO llevan `origen` en su texto porque se ejecutan dentro de Libro.conOrigen(...) (las reversiones de Préstamos,
// vía _enReversion). Cada una se identifica por archivo y texto exacto: una llamada nueva sin origen NO queda cubierta.
const CUBIERTAS_POR_CONTEXTO = {
  'modules/prestado.js': new Set([
    'destino, monto', 'f.fuente, f.monto', 'm.fuente, m.monto', 'p.cuenta, p.monto', 'r.fuente, r.monto',
  ]),
};

test('toda llamada a sumarFuente/descontarFuente lleva `origen` (o corre dentro de Libro.conOrigen)', () => {
  const sin = [];
  archivos(RAIZ).forEach(f => {
    const rel = path.relative(RAIZ, f).split(path.sep).join('/');
    if (rel === 'core/core-state.js') return; // define las funciones
    const src = sinComentarios(fs.readFileSync(f, 'utf8'));
    const re = /\b(?:sumarFuente|descontarFuente)\s*\(/g;
    let m;
    while ((m = re.exec(src))) {
      const args = argumentos(src, m.index + m[0].length - 1).replace(/\s+/g, ' ').trim();
      if (/origen|\b_og\w*|\bopts\b|\bog\b/.test(args)) continue;
      if ((CUBIERTAS_POR_CONTEXTO[rel] || new Set()).has(args)) continue;
      sin.push(rel + ':' + lineaDe(src, m.index) + '  (' + args + ')');
    }
  });
  assert.deepEqual(sin, [], 'llamadas de saldo sin origen: pasa { origen: { modulo, ref } } (libro-de-movimientos.md §3.3):\n  ' + sin.join('\n  '));
});
