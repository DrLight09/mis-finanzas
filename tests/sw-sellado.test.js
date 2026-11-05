'use strict';
// tests/sw-sellado.test.js — el Service Worker está sellado con la huella del contenido desplegable (scripts/sellar-sw.js).
// Si esta prueba falla es porque cambió algún archivo desplegable (index.html, css/, js/, icons/, manifest) y falta correr:
//     node scripts/sellar-sw.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { huella } = require('../scripts/sellar-sw.js');

const RAIZ = path.join(__dirname, '..');

test('sw.js está sellado: BUILD coincide con la huella actual de los archivos desplegables', () => {
  const sw = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8');
  const m = /^const BUILD = '([^']*)';/m.exec(sw);
  assert.ok(m, 'sw.js debe declarar const BUILD');
  assert.equal(m[1], huella(RAIZ).build, 'sw.js desactualizado: corre `node scripts/sellar-sw.js` antes de desplegar');
});

test('la caché se nombra con VERSION y BUILD, y se limpia con ese mismo nombre', () => {
  const sw = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8');
  assert.match(sw, /const CACHE = VERSION \+ '-' \+ BUILD;/);
  assert.doesNotMatch(sw.replace(/\/\/.*$/gm, ''), /caches\.open\(VERSION\)|k !== VERSION/, 'nadie debe seguir usando VERSION a secas como nombre de caché');
});

test('la huella cambia con cualquier archivo desplegable, es estable y no depende de CRLF ni de sw.js', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sellar-'));
  const w = (f, t) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), t); };
  w('index.html', '<html>\n</html>\n'); w('js/core/a.js', 'let a = 1;\n'); w('css/styles.css', 'a{}\n'); w('manifest.webmanifest', '{}\n');
  w('sw.js', "const BUILD = 'x';\n");
  const h1 = huella(dir).build;
  assert.equal(huella(dir).build, h1, 'estable');
  w('sw.js', "const BUILD = 'otro';\n// y más\n");
  assert.equal(huella(dir).build, h1, 'sw.js no entra en su propia huella');
  w('index.html', '<html>\r\n</html>\r\n');
  assert.equal(huella(dir).build, h1, 'CRLF y LF dan lo mismo');
  w('js/core/a.js', 'let a = 2;\n');
  assert.notEqual(huella(dir).build, h1, 'un cambio en js/ cambia la huella');
  const h2 = huella(dir).build;
  w('js/modules/nuevo.js', '\n');
  assert.notEqual(huella(dir).build, h2, 'un archivo nuevo también');
  w('docs/CHANGELOG.md', 'nada\n'); w('tests/x.test.js', 'nada\n');
  const h3 = huella(dir).build;
  w('docs/CHANGELOG.md', 'otra cosa\n');
  assert.equal(huella(dir).build, h3, 'docs/ y tests/ no se despliegan: no cuentan');
  fs.rmSync(dir, { recursive: true });
});

test('el script sella solo la línea BUILD; con --check falla (código 1) si está vieja y no toca nada', () => {
  const { spawnSync } = require('node:child_process');
  const script = path.join(RAIZ, 'scripts', 'sellar-sw.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sellar-'));
  fs.mkdirSync(path.join(dir, 'js'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), 'x'); fs.writeFileSync(path.join(dir, 'js', 'a.js'), 'a');
  const original = "const VERSION = 'v1';\nconst BUILD = 'sin-sellar';\nconst otra = 2;\n";
  fs.writeFileSync(path.join(dir, 'sw.js'), original);
  const chk = spawnSync(process.execPath, [script, '--check', dir], { encoding: 'utf8' });
  assert.equal(chk.status, 1, 'vieja → código 1');
  assert.equal(fs.readFileSync(path.join(dir, 'sw.js'), 'utf8'), original, '--check no escribe');
  const run = spawnSync(process.execPath, [script, dir], { encoding: 'utf8' });
  assert.equal(run.status, 0);
  const sellado = fs.readFileSync(path.join(dir, 'sw.js'), 'utf8');
  assert.match(sellado, /^const VERSION = 'v1';\nconst BUILD = '[0-9a-f]{12}'; \/\/ sellado por/);
  assert.ok(sellado.endsWith("\nconst otra = 2;\n"), 'el resto del archivo queda igual');
  assert.equal(spawnSync(process.execPath, [script, '--check', dir], { encoding: 'utf8' }).status, 0, 'recién sellado → al día');
  fs.rmSync(dir, { recursive: true });
});
