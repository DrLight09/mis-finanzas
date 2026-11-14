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
