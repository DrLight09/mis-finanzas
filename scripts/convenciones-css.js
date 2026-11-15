'use strict';
/* Trinquete de las clases CSS (regla de nombres de docs/guia-estilo-sheets.md §0 bis).
   Cuenta lo que el rediseño no debe ampliar: clases con prefijo abreviado, clases que no están en kebab-case, y los `!important` y los
   colores hex escritos fuera de las variables de :root. Las que ya existían quedan en tests/fixtures/css-base.json; tests/convenciones.test.js
   falla si aparece algo nuevo y también si algo baja sin registrarlo, así el número solo puede bajar.

     node scripts/convenciones-css.js              muestra el recuento
     node scripts/convenciones-css.js --actualizar baja el trinquete (se niega si hay algo nuevo)
     node scripts/convenciones-css.js --actualizar --forzar   lo reescribe aunque haya algo nuevo (solo para fijar la línea base) */
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const BASE = path.join(RAIZ, 'tests', 'fixtures', 'css-base.json');

// Primer trozo del nombre (antes del primer «-») que es una abreviatura opaca. Las oficiales (`tc`, `nu`, `cdt`) y los compartidos
// (`btn`, `field`, `c` de color semántico…) no están acá. Al renombrar el prefijo de una pantalla, sus clases salen de esta cuenta.
const PREFIJOS_OPACOS = ['ix', 'cp', 'an', 'enc', 'pe', 'pr', 'ms', 'mdet', 'cfg', 'fb', 'sp', 'alc', 'caj', 'gv', 'gf', 'ctc', 'prtc', 'mp', 'mpp', 'movs', 'mov', 'ing', 'dif', 'rte', 'ad', 'nc'];
const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

const leer = rel => fs.readFileSync(path.join(RAIZ, rel), 'utf8');
const sinComentariosCss = s => s.replace(/\/\*[\s\S]*?\*\//g, '');

function archivosJs() {
  const out = [];
  (function recorrer(d) { for (const f of fs.readdirSync(path.join(RAIZ, d))) { const rel = d + '/' + f; if (fs.statSync(path.join(RAIZ, rel)).isDirectory()) recorrer(rel); else if (/\.js$/.test(f)) out.push(rel); } })('js');
  return out;
}

function clases() {
  const css = sinComentariosCss(leer('css/styles.css'));
  const set = new Set();
  // Selectores: se ignoran los números decimales de los valores (`.5s`) porque un nombre de clase no empieza con dígito.
  for (const m of css.replace(/\{[^{}]*\}/g, '{}').matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) set.add(m[1]);
  // Atributos class="…" escritos en index.html y en las plantillas de js/ (los nombres armados con variables no se ven).
  for (const rel of ['index.html', ...archivosJs()])
    for (const m of leer(rel).matchAll(/\bclass=\\?"([^"<>$]*)\\?"/g)) for (const c of m[1].split(/\s+/)) if (/^-?[a-zA-Z_][\w-]*$/.test(c)) set.add(c);
  return set;
}

function medir() {
  const todas = clases();
  const opacas = [...todas].filter(c => PREFIJOS_OPACOS.includes(c.split('-')[0]) && c.includes('-')).sort();
  const noKebab = [...todas].filter(c => !KEBAB.test(c)).sort();
  const css = sinComentariosCss(leer('css/styles.css'));
  const sinRaiz = css.replace(/:root\s*\{[^}]*\}/g, '');
  return {
    opacas, noKebab,
    importantes: (css.match(/!important/g) || []).length,
    hex: (sinRaiz.match(/#[0-9a-fA-F]{3,8}\b(?![\w-])/g) || []).filter(h => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(h)).length,
  };
}

function comparar(actual, base) {
  const nuevas = k => actual[k].filter(c => !base[k].includes(c));
  const bajan = k => base[k].filter(c => !actual[k].includes(c));
  return {
    opacasNuevas: nuevas('opacas'), opacasQueBajan: bajan('opacas'),
    noKebabNuevas: nuevas('noKebab'), noKebabQueBajan: bajan('noKebab'),
    importantesSuben: actual.importantes > base.importantes, importantesBajan: actual.importantes < base.importantes,
    hexSuben: actual.hex > base.hex, hexBajan: actual.hex < base.hex,
  };
}

module.exports = { BASE, PREFIJOS_OPACOS, medir, comparar };

if (require.main === module) {
  const actual = medir();
  if (process.argv.includes('--actualizar')) {
    const base = fs.existsSync(BASE) ? JSON.parse(fs.readFileSync(BASE, 'utf8')) : null;
    if (base && !process.argv.includes('--forzar')) {
      const d = comparar(actual, base);
      if (d.opacasNuevas.length || d.noKebabNuevas.length || d.importantesSuben || d.hexSuben) {
        console.error('Hay cosas NUEVAS (el trinquete no se sube):');
        if (d.opacasNuevas.length) console.error('  clases con prefijo abreviado: ' + d.opacasNuevas.join(', '));
        if (d.noKebabNuevas.length) console.error('  clases que no son kebab-case: ' + d.noKebabNuevas.join(', '));
        if (d.importantesSuben) console.error('  más `!important` que en la base (' + actual.importantes + ' > ' + base.importantes + ')');
        if (d.hexSuben) console.error('  más colores hex fuera de :root que en la base (' + actual.hex + ' > ' + base.hex + ')');
        process.exit(1);
      }
    }
    fs.mkdirSync(path.dirname(BASE), { recursive: true });
    fs.writeFileSync(BASE, JSON.stringify(actual, null, 1) + '\n');
    console.log('Trinquete de CSS actualizado: ' + actual.opacas.length + ' clases con prefijo abreviado, ' + actual.noKebab.length + ' no kebab, ' + actual.importantes + ' !important, ' + actual.hex + ' hex fuera de :root.');
  } else {
    const porPrefijo = {};
    for (const c of actual.opacas) { const p = c.split('-')[0]; porPrefijo[p] = (porPrefijo[p] || 0) + 1; }
    console.log('Clases con prefijo abreviado:', actual.opacas.length, Object.entries(porPrefijo).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + '=' + v).join(' '));
    console.log('No kebab-case:', actual.noKebab.join(', ') || '(ninguna)');
    console.log('!important:', actual.importantes, '· hex fuera de :root:', actual.hex);
  }
}
