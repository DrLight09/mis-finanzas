'use strict';
// Convenciones de nombres (docs/glosario-dominio.md y docs/arquitectura-archivos.md §5).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ABREVIATURAS, BASE, contar } = require('../scripts/convenciones');
const raiz = path.join(__dirname, '..');

test('los nombres de archivo de js/, tests/, scripts/ y docs/ son kebab-case en minúsculas (sin «_», tildes ni mayúsculas)', () => {
  const EXCEPCIONES = new Set(['README.md', 'CHANGELOG.md']);
  const malos = [];
  (function recorrer(d) {
    for (const f of fs.readdirSync(path.join(raiz, d))) {
      const rel = d + '/' + f;
      if (fs.statSync(path.join(raiz, rel)).isDirectory()) { recorrer(rel); continue; }
      if (!EXCEPCIONES.has(f) && !/^[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z0-9]+$/.test(f)) malos.push(rel);
    }
  })('js');
  ['tests', 'scripts', 'docs'].forEach(function recorrer(d) {
    for (const f of fs.readdirSync(path.join(raiz, d))) {
      const rel = d + '/' + f;
      if (f === 'node_modules') continue;
      if (fs.statSync(path.join(raiz, rel)).isDirectory()) { recorrer(rel); continue; }
      if (!EXCEPCIONES.has(f) && !/^[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z0-9]+$/.test(f)) malos.push(rel);
    }
  });
  assert.deepEqual(malos, [], 'Nombres que no son kebab-case: ' + malos.join(', '));
});

test('trinquete de abreviaturas: ninguna sube (código nuevo) y las que bajan quedan registradas', () => {
  const base = JSON.parse(fs.readFileSync(BASE, 'utf8'));
  const { porArchivo } = contar();
  const suben = [], bajan = [];
  for (const f of new Set([...Object.keys(base), ...Object.keys(porArchivo)])) {
    const antes = base[f] || 0, ahora = porArchivo[f] || 0;
    if (ahora > antes) suben.push(`${f}: ${antes} → ${ahora}`);
    else if (ahora < antes) bajan.push(`${f}: ${antes} → ${ahora}`);
  }
  assert.deepEqual(suben, [], 'Abreviaturas nuevas (escríbelas completas, ver docs/glosario-dominio.md §3): ' + suben.join('; '));
  assert.deepEqual(bajan, [], 'Bajaron abreviaturas: registra la mejora con «node scripts/convenciones.js --actualizar» (' + bajan.join('; ') + ')');
});

test('cada abreviatura vigilada está documentada en el glosario con su forma completa', () => {
  const glosario = fs.readFileSync(path.join(raiz, 'docs', 'glosario-dominio.md'), 'utf8');
  for (const [abrev, completa] of Object.entries(ABREVIATURAS)) {
    assert.ok(glosario.includes('`' + abrev + '`'), `«${abrev}» no aparece en docs/glosario-dominio.md`);
    assert.ok(glosario.includes('`' + completa + '`'), `«${completa}» (forma completa de ${abrev}) no aparece en docs/glosario-dominio.md`);
  }
});

test('atributos data-*: todo dataset / getAttribute / selector que el código lee tiene su atributo escrito en alguna plantilla', () => {
  // Excepciones que ya existían antes de esta prueba: se leen sin que nada los escriba (lectura opcional o atributos dinámicos).
  const EXCEPCIONES = new Set(['movimiento-encargo-id', 'w', 'h']);
  const kebab = k => k.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
  const archivos = [];
  (function recorrer(d) { for (const f of fs.readdirSync(path.join(raiz, d))) { const rel = d + '/' + f; if (fs.statSync(path.join(raiz, rel)).isDirectory()) recorrer(rel); else if (/\.js$/.test(f)) archivos.push(rel); } })('js');
  archivos.push('index.html');
  const leidos = new Map(), escritos = new Set();
  const leer = (k, f) => { if (!leidos.has(k)) leidos.set(k, new Set()); leidos.get(k).add(f); };
  for (const f of archivos) {
    const s = fs.readFileSync(path.join(raiz, f), 'utf8');
    for (const m of s.matchAll(/dataset\.([A-Za-z0-9_]+)(\s*=(?!=))?/g)) { if (m[2]) escritos.add(kebab(m[1])); else leer(kebab(m[1]), f); }
    for (const m of s.matchAll(/dataset\[\s*['"]([A-Za-z0-9_]+)['"]\s*\]/g)) leer(kebab(m[1]), f);
    for (const m of s.matchAll(/getAttribute\(\s*['"]data-([a-z0-9-]+)['"]\s*\)/g)) leer(m[1], f);
    for (const m of s.matchAll(/\[data-([a-z0-9-]+)[\]=~|^$*]/g)) leer(m[1], f);
    for (const m of s.matchAll(/(?<![A-Za-z0-9-])data-([a-z0-9-]+)(?==|\s|>|\\")/g)) escritos.add(m[1]);
    for (const m of s.matchAll(/setAttribute\(\s*['"]data-([a-z0-9-]+)['"]/g)) escritos.add(m[1]);
  }
  for (const m of fs.readFileSync(path.join(raiz, 'css', 'styles.css'), 'utf8').matchAll(/\[data-([a-z0-9-]+)/g)) leer(m[1], 'css/styles.css');
  const sinEscribir = [...leidos].filter(([k]) => !escritos.has(k) && !EXCEPCIONES.has(k)).map(([k, f]) => 'data-' + k + ' (' + [...f].join(', ') + ')');
  assert.deepEqual(sinEscribir, [], 'Se lee un atributo que ninguna plantilla escribe (¿se renombró solo uno de los dos lados?): ' + sinEscribir.join('; '));
});

// ── Helpers de lectura estática (sin parser: comentarios fuera y búsqueda por patrones) ──────────────────────────────────────────────
const archivosApp = () => {
  const out = ['index.html'];
  (function recorrer(d) { for (const f of fs.readdirSync(path.join(raiz, d))) { const rel = d + '/' + f; if (fs.statSync(path.join(raiz, rel)).isDirectory()) recorrer(rel); else if (/\.js$/.test(f)) out.push(rel); } })('js');
  return out;
};
// Quita comentarios (bloque y línea; un «//» precedido de «:» o de comilla es parte de una URL o de un texto y se conserva).
const sinComentarios = (rel, s) => rel.endsWith('.html')
  ? s.replace(/<!--[\s\S]*?-->/g, '')
  : s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
const leerSinComentarios = rel => sinComentarios(rel, fs.readFileSync(path.join(raiz, rel), 'utf8'));

test('valores guardados con constante (estado.js): no se escriben como texto suelto en el resto de js/', () => {
  // Cada valor tiene su constante en js/core/estado.js (TIPO_PAGO_COMPLETO, TIPO_ALCANCIA). El texto suelto solo se permite allí.
  const VALORES = { pago_completo: 'TIPO_PAGO_COMPLETO', yo_cuenta: 'TIPO_ALCANCIA.yoCuenta', yo_directo: 'TIPO_ALCANCIA.yoDirecto', cobro_deuda: 'TIPO_ALCANCIA.cobroDeuda' };
  const sueltos = [];
  for (const rel of archivosApp()) {
    if (rel === 'js/core/estado.js' || rel === 'index.html') continue;
    const s = leerSinComentarios(rel);
    for (const [valor, constante] of Object.entries(VALORES))
      if (new RegExp('[\'"`]' + valor + '[\'"`]').test(s)) sueltos.push(rel + ': «' + valor + '» → ' + constante);
  }
  assert.deepEqual(sueltos, [], 'Usa la constante en vez del texto suelto: ' + sueltos.join('; '));
});

test('data-action: toda acción que una plantilla escribe está registrada, y toda acción registrada se usa en algún sitio', () => {
  // Registradas: Events.on('ns:accion', fn) y Events.registerAll('ns', { accion: fn, ... }).
  const bloque = (s, i) => { let d = 0, j = i; for (; j < s.length; j++) { if (s[j] === '{') d++; else if (s[j] === '}') { d--; if (d === 0) break; } } return s.slice(i, j + 1); };
  const registradas = new Map(), escritas = new Map(), mencionadas = new Set();
  const sumar = (mapa, k, f) => { if (!mapa.has(k)) mapa.set(k, new Set()); mapa.get(k).add(f); };
  for (const rel of archivosApp()) {
    const s = leerSinComentarios(rel);
    for (const m of s.matchAll(/Events\.on\(\s*['"`]([\w-]+:[\w-]+)['"`]/g)) sumar(registradas, m[1], rel);
    for (const m of s.matchAll(/Events\.registerAll\(\s*['"`]([\w-]+)['"`]\s*,\s*\{/g)) {
      const cuerpo = bloque(s, m.index + m[0].length - 1).slice(1, -1);
      let prof = 0, actual = '';
      const partes = [];
      for (const c of cuerpo) {
        if ('{(['.includes(c)) prof++; else if ('})]'.includes(c)) prof--;
        if (c === ',' && prof === 0) { partes.push(actual); actual = ''; } else actual += c;
      }
      partes.push(actual);
      for (const p of partes) { const k = p.trim().match(/^['"]?([\w-]+)['"]?\s*(?::|$|\()/); if (k) sumar(registradas, m[1] + ':' + k[1], rel); }
    }
    for (const m of s.matchAll(/data-action=\\?"([\w-]+:[\w-]+)\\?"/g)) sumar(escritas, m[1], rel);
    for (const m of s.matchAll(/(?:Events\.)?attr\(\s*['"`]([\w-]+:[\w-]+)['"`]/g)) sumar(escritas, m[1], rel);
    // «Mencionada»: cualquier texto 'ns:accion' que no sea el propio registro (hay plantillas que arman la acción con una variable).
    for (const m of s.matchAll(/['"`]([\w-]+:[\w-]+)['"`]/g)) if (!/Events\.on\(\s*['"`]$/.test(s.slice(Math.max(0, m.index - 14), m.index + 1))) mencionadas.add(m[1]);
  }
  assert.ok(registradas.size > 150 && escritas.size > 150, 'el análisis dejó de ver las acciones (¿cambió la forma de registrarlas?): ' + registradas.size + ' / ' + escritas.size);
  const sinRegistrar = [...escritas.keys()].filter(a => !registradas.has(a)).map(a => a + ' (' + [...escritas.get(a)].join(', ') + ')');
  assert.deepEqual(sinRegistrar, [], 'Acción escrita en una plantilla que nadie registra (¿se renombró solo un lado?): ' + sinRegistrar.join('; '));
  const sinUso = [...registradas.keys()].filter(a => !escritas.has(a) && !mencionadas.has(a));
  assert.deepEqual(sinUso, [], 'Acción registrada que ninguna plantilla escribe (código muerto o nombre desfasado): ' + sinUso.join(', '));
});

test('referencias a documentos: todo «algo.md» que citan js/, tests/ y scripts/ existe en docs/ (o en docs/changelog/)', () => {
  const existentes = new Set();
  (function recorrer(d) { for (const f of fs.readdirSync(path.join(raiz, d))) { const rel = d + '/' + f; if (fs.statSync(path.join(raiz, rel)).isDirectory()) recorrer(rel); else if (f.endsWith('.md')) existentes.add(rel.slice('docs/'.length)); } })('docs');
  const fuera = new Set(['README.md', 'mapa-codigo.md', 'pendientes-mejora-12.md']);
  const colgantes = [];
  for (const dir of ['js', 'tests', 'scripts']) {
    (function recorrer(d) {
      for (const f of fs.readdirSync(path.join(raiz, d))) {
        const rel = d + '/' + f;
        if (fs.statSync(path.join(raiz, rel)).isDirectory()) { if (f !== 'fixtures') recorrer(rel); continue; }
        if (!f.endsWith('.js') || rel === 'tests/convenciones.test.js') continue;
        for (const m of fs.readFileSync(path.join(raiz, rel), 'utf8').matchAll(/(?<![\w/.-])(?:docs\/)?((?:changelog\/)?[a-z0-9-]+\.md)\b/g))
          if (!existentes.has(m[1]) && !fuera.has(m[1])) colgantes.push(rel + ' → ' + m[1]);
      }
    })(dir);
  }
  assert.deepEqual(colgantes, [], 'Se cita un documento que no existe (¿se borró o se renombró?): ' + [...new Set(colgantes)].join('; '));
});

test('trinquete de CSS: no aparecen clases con prefijo abreviado ni fuera de kebab-case, ni más !important ni colores hex fuera de :root', () => {
  // Reglas en docs/guia-estilo-sheets.md §0 bis. `node scripts/convenciones-css.js` muestra el recuento; `--actualizar` baja el trinquete.
  const css = require('../scripts/convenciones-css');
  const base = JSON.parse(fs.readFileSync(css.BASE, 'utf8'));
  const d = css.comparar(css.medir(), base);
  assert.deepEqual(d.opacasNuevas, [], 'Clases nuevas con prefijo abreviado (usa el nombre completo del módulo, ver guia-estilo-sheets.md §0 bis): ' + d.opacasNuevas.join(', '));
  assert.deepEqual(d.noKebabNuevas, [], 'Clases nuevas que no son kebab-case: ' + d.noKebabNuevas.join(', '));
  assert.ok(!d.importantesSuben, 'Hay más `!important` que en la base: arregla el orden de las reglas en vez de forzarlo');
  assert.ok(!d.hexSuben, 'Hay más colores hex sueltos que en la base: usa una variable de :root (o agrégala allí)');
  const bajan = [...d.opacasQueBajan, ...d.noKebabQueBajan];
  assert.ok(!bajan.length && !d.importantesBajan && !d.hexBajan, 'Algo bajó (¡bien!): registra la mejora con `node scripts/convenciones-css.js --actualizar`');
});
