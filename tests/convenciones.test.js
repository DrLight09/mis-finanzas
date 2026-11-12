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
