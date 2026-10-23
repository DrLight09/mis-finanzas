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

// Archivos ya convertidos: { archivo, prefijos de clase propios, style="" que se permiten (texto exacto o RegExp: display:none que JS conmuta, o valores calculados) }
const CONVERTIDOS = [
  { f: 'js/core/diferencial.js', prefijos: ['diferencial-'], permitidos: ['display:none;'] },
  { f: 'js/core/split.js', prefijos: ['split-'], permitidos: [] },
  // búsqueda global: solo quedan el color del tipo y el fondo del ícono, que salen del resultado
  { f: 'js/core/busqueda-global.js', prefijos: ['busqueda-'], permitidos: [/^(background|color):\$\{/] },
  { f: 'js/modules/configuracion.js', prefijos: ['cat-chip'], permitidos: [] },
  { f: 'js/modules/gastos.js', prefijos: ['gasto-', 'badge-xs', 'row-name-13'], permitidos: [] },
  // inicio: solo queda el display:none del tooltip de la proyección, que JS conmuta (showTT)
  { f: 'js/modules/inicio.js', prefijos: ['inicio-'], permitidos: ['display:none;'] },
  // sueltos de 1-6 estilos
  { f: 'js/modules/mesada.js', prefijos: ['badge-xs'], permitidos: [] },
  { f: 'js/core/wrapped-gate.js', prefijos: ['wrapped-gate-'], permitidos: [] },
  { f: 'js/core/core-state.js', prefijos: ['ico-inline'], permitidos: [] },
  { f: 'js/core/pin-bio.js', prefijos: ['pin-fila', 'btn-flex1', 'btn-block', 'btn-peligro'], permitidos: [] },
  { f: 'js/core/gastos-fijos-progress.js', prefijos: ['fijos-progress'], permitidos: [] },
  // feed de actividad: solo quedan el fondo del ícono y el color del monto, que salen de cada movimiento
  { f: 'js/modules/actividad_reciente.js', prefijos: ['feed-'], permitidos: [/^(background|color):\$\{/] },
  // cuentas: solo quedan valores calculados: tamaño/colores del ícono de cada cuenta (elegidos por el usuario), el fondo/color de cada
  // opción de la cuadrícula de íconos y las variables --cuenta/--cuenta-rgb de cada tarjeta del selector
  { f: 'js/modules/cuentas.js', prefijos: ['cuenta-', 'gasto-item-', 'gasto-nombre-fila', 'badge-xs', 'ico-inline', 'nc-icon-opt'],
    permitidos: [/^width:\$\{/, /^background:\$\{/, /^color:\$\{/, '${vars}'] },
  // analisis: solo quedan los anchos/alturas de las barras (porcentaje calculado) y el display:none del tooltip del patrimonio, que JS conmuta
  { f: 'js/modules/analisis.js', prefijos: ['an-', 'presup-bar-fill', 'presup-input'], armadas: ['an-t-', 'an-bg-'], permitidos: [/^width:\$\{/, /^height:\$\{/, 'display:none;'] },
  // spotify: solo quedan 3 display:none (avatares y aviso del selector de persona) que el JS conmuta
  { f: 'js/modules/spotify.js', prefijos: ['sp-', 'badge-xs', 'row-name-13', 'cuenta-flecha'], permitidos: ['display:none;'] },
  // prestado: solo queda el color/fondo del avatar de cada persona (lo elige el usuario)
  { f: 'js/modules/prestado.js', prefijos: ['pr-', 'badge-xs', 'ico-inline', 'cuenta-flecha', 'cuenta-svg-mid'], permitidos: [/^color:\$\{/] },
  // wrapped: su CSS vive en el <style> que inyecta el propio archivo (cssEn). Solo queda el retraso de animación de cada punto de la línea,
  // un valor distinto por punto (i*0.09s) que no puede ser una clase.
  { f: 'js/modules/wrapped.js', prefijos: ['wrapped-'], cssEn: ['js/modules/wrapped.js'], permitidos: [/^animation-delay:\$\{/] },
];

CONVERTIDOS.forEach(({ f, prefijos, permitidos, cssEn = [], armadas = [] }) => {
  const css = CSS + cssEn.map(leer).join('\n');
  const src = leer(f);
  test(`${f} — no queda ningún style="" estático (solo lo permitido: display:none que JS conmuta o valores calculados)`, () => {
    const usados = [...src.matchAll(/style=\\?"([^"]*)"/g)].map(m => m[1]);
    const extra = usados.filter(v => !permitidos.some(p => (p instanceof RegExp ? p.test(v) : p === v)));
    assert.deepEqual(extra, [], 'estilo inline nuevo: muévelo a una clase en css/styles.css');
  });
  test(`${f} — toda clase ${prefijos.join('/')}* que usa existe en styles.css`, () => {
    const re = new RegExp(`\\b((?:${prefijos.map(p => p.replace('-', '\\-')).join('|')})[a-z0-9-]*)`, 'g');
    // solo lo que está dentro de class="…" / className = '…' (los ids de DOM con el mismo prefijo no cuentan)
    const trozos = [...src.matchAll(/class=\\?"([^"]*)"|className\s*=\s*'([^']*)'/g)].map(m => m[1] || m[2]).join(' ');
    // `armadas`: prefijos de clases que el código completa con una variable (p. ej. an-t-${tono}); se verifican aparte, valor por valor
    const clases = [...new Set([...trozos.matchAll(re)].map(m => m[1]))].filter(c => !armadas.includes(c));
    assert.ok(clases.length > 0);
    const faltan = clases.filter(c => !new RegExp('\\.' + c.replace(/-/g, '\\-') + '(?![\\w-])').test(css));
    assert.deepEqual(faltan, []);
  });
});

test('el resumen vacío del diferencial se colapsa (antes lo hacía [style*="min-height"]:empty sobre el style inline)', () => {
  assert.match(CSS, /\.diferencial-resumen:empty\{min-height:0;?\}/);
});

test('wrapped: el mood de cada slide se lee de la clase de color del número grande (antes leía el style inline)', () => {
  const w = leer('js/modules/wrapped.js');
  assert.match(w, /_moodRegex = \/\(\?:\^\|\[\\s"\]\)\(c-purple\|c-blue\|c-amber\|c-red\|c-green\)/);
  // todo color que se le pasa a _wrappedSlideBignum tiene clase en _wrappedColorClase
  const mapa = /const mapa = \{([^}]*)\}/.exec(w)[1];
  const usados = new Set([...w.matchAll(/_wrappedSlideBignum\([\s\S]*?'(var\(--[a-z]+\))'\s*,\s*\{/g)].map(m => m[1]));
  assert.ok(usados.size >= 5);
  usados.forEach(c => assert.ok(mapa.includes(`'${c}'`), `color sin clase en wrapped: ${c}`));
});

test('analisis: los tonos que arma el código (an-t-X, an-bg-X) existen todos en styles.css', () => {
  const css = leer('css/styles.css'), src = leer('js/modules/analisis.js');
  // los tonos posibles salen de los arreglos/ternarios que arman `tono`
  const tonos = ['red', 'amber', 'accent', 'blue', 'purple', 'text2'];
  tonos.forEach(t => { ['an-t-', 'an-bg-'].forEach(p => assert.ok(new RegExp('\\.' + p + t + '(?![\\w-])').test(css), `falta .${p}${t}`)); });
  // y el código no usa un tono que no esté en la lista
  const usados = new Set([...src.matchAll(/'(red|amber|accent|blue|purple|text2)'/g)].map(m => m[1]));
  usados.forEach(t => assert.ok(tonos.includes(t), t));
});

test('spotify: los colores de cV() (c-green, c-red, sp-t-neu) existen en styles.css', () => {
  const css = leer('css/styles.css');
  ['c-green', 'c-red', 'sp-t-neu'].forEach(c => assert.ok(new RegExp('\\.' + c + '(?![\\w-])').test(css), c));
  assert.match(leer('js/modules/spotify.js'), /const cV=\(v\)=>v>0\?'c-green':v<0\?'c-red':'sp-t-neu'/);
});

test('prestado: las clases de color de los tipos de extra (clase: en _extTipos) existen en styles.css', () => {
  const css = leer('css/styles.css'), src = leer('js/modules/prestado.js');
  const clases = [...src.matchAll(/color: 'var\(--[a-z0-9]+\)', clase: '([a-z0-9-]+)'/g)].map(m => m[1]);
  assert.ok(clases.length === 4, 'debe haber 4 tipos de extra con clase');
  clases.forEach(c => assert.ok(new RegExp('\\.' + c + '(?![\\w-])').test(css), c));
});
