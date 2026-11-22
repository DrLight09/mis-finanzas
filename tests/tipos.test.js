// Revisión de tipos (tsc --checkJs) de los archivos de lógica pura listados en tsconfig.json. Lo mismo que `npm run tipos`.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('tsc --checkJs no encuentra errores en los archivos listados en tsconfig.json', () => {
  const tsc = path.join(__dirname, '..', 'node_modules', 'typescript', 'bin', 'tsc');
  assert.ok(require('node:fs').existsSync(tsc), 'falta TypeScript en node_modules: ejecuta «npm ci»');
  const r = spawnSync(process.execPath, [tsc, '-p', path.join(__dirname, '..', 'tsconfig.json')], { encoding: 'utf8' });
  assert.equal(r.status, 0, 'errores de tipos:\n' + r.stdout + r.stderr);
});
