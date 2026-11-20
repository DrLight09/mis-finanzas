'use strict';
// Análisis estático: ningún script usa un nombre que no existe (scripts/lint-globales.js, ESLint no-undef y reglas parecidas).
// Cierra la clase «se renombró una función y quedó una referencia vieja»: el arnés `permissive` de los tests no la detecta.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('lint-globales: 0 errores (no-undef, no-redeclare, no-dupe-keys, valid-typeof…)', () => {
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'lint-globales.js')], { encoding: 'utf8' });
  assert.equal(r.status, 0, 'El análisis estático encontró errores:\n' + r.stdout + r.stderr);
});
