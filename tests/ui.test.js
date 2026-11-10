'use strict';
// M1/M3 — ciclo de vida de la interfaz: registro Ui + guarda contra el patrón «const _orig = X; X = function(){…}».
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const leer = rel => fs.readFileSync(path.join(raiz, rel), 'utf8');

function cargarUi() {
  const ctx = { console: { error() {}, log() {} } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(leer('js/core/ui.js') + '\nthis.Ui = Ui;', ctx);
  return ctx.Ui;
}

test('Ui.hoja: corre en orden de registro y la misma key reemplaza (no duplica)', () => {
  const Ui = cargarUi();
  const log = [];
  Ui.hoja('x', () => log.push('a'), { key: 'a' });
  Ui.hoja('x', () => log.push('b'), { key: 'b' });
  Ui.hoja('x', () => log.push('a2'), { key: 'a' });
  Ui.antesDeAbrirHoja('x');
  assert.deepEqual(log, ['a2', 'b']);
});

test('Ui.hoja: devolver false en «antes» cancela la apertura; «despues» no cancela', () => {
  const Ui = cargarUi();
  Ui.hoja('y', () => false, { key: 'cancela' });
  assert.equal(Ui.antesDeAbrirHoja('y'), false);
  assert.equal(Ui.antesDeAbrirHoja('otra'), true);
  let n = 0;
  Ui.hoja('z', () => { n++; return false; }, { fase: 'despues', key: 'k' });
  Ui.despuesDeAbrirHoja('z');
  assert.equal(n, 1);
});

test('Ui: un gancho que lanza no rompe a los demás; el comodín «*» recibe el id', () => {
  const Ui = cargarUi();
  const vistos = [];
  Ui.hoja('w', () => { throw new Error('boom'); }, { key: 'roto' });
  Ui.hoja('*', id => vistos.push(id), { fase: 'despues', key: 'todos' });
  Ui.hoja('w', () => vistos.push('ok'), { fase: 'despues', key: 'ok' });
  assert.equal(Ui.antesDeAbrirHoja('w'), true);
  Ui.despuesDeAbrirHoja('w');
  assert.deepEqual(vistos.sort(), ['ok', 'w']);
});

test('Ui.pantalla y eventos libres', () => {
  const Ui = cargarUi();
  const v = [];
  Ui.pantalla('alcancia', n => v.push('p:' + n), { key: 'a' });
  Ui.pantalla('*', n => v.push('*:' + n), { key: 'todas' });
  Ui.alMostrarPantalla('alcancia');
  Ui.en('modulos', () => v.push('m'), { key: 'm' });
  Ui.emitir('modulos');
  assert.deepEqual(v, ['p:alcancia', '*:alcancia', 'm']);
  Ui.quitar('modulos', 'm');
  Ui.emitir('modulos');
  assert.equal(v.length, 3);
});

// Guarda: los módulos no vuelven a parchear funciones globales ni usar hookGlobal.
const ARCHIVOS = fs.readdirSync(path.join(raiz, 'js'), { recursive: true })
  .filter(f => f.endsWith('.js')).map(f => path.join('js', f));

test('ningún módulo parchea una función global (const _origX = X; X = function…)', () => {
  const culpables = [];
  for (const f of ARCHIVOS) {
    const src = leer(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const re = /(?:const|let|var)\s+(_orig[A-Za-z0-9_]*)\s*=\s*([A-Za-z_$][\w$.]*)\s*;/g;
    let m;
    while ((m = re.exec(src))) {
      const nombre = m[2];
      const reasigna = new RegExp('(^|[^\\w$.])' + nombre.replace(/\./g, '\\.') + '\\s*=\\s*(?:async\\s+)?function', 'm');
      if (reasigna.test(src)) culpables.push(f + ': ' + m[1] + ' → ' + nombre);
    }
  }
  assert.deepEqual(culpables, []);
});

test('hookGlobal y hook-global.js ya no existen', () => {
  assert.equal(fs.existsSync(path.join(raiz, 'js/core/hook-global.js')), false);
  const usos = ARCHIVOS.filter(f => /(^|[^\w$])hookGlobal\s*\(/.test(leer(f).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')));
  assert.deepEqual(usos, []);
  assert.ok(!/hook-global\.js/.test(leer('index.html').replace(/<!--[\s\S]*?-->/g, '')));
});

test('index.html carga ui.js antes de core-state.js, sheet-stack.js y los módulos', () => {
  const orden = [...leer('index.html').matchAll(/<script[^>]+src="(js\/[^"]+)"/g)].map(m => m[1]);
  const i = orden.indexOf('js/core/ui.js');
  assert.ok(i >= 0);
  for (const f of ['js/core/core-state.js', 'js/core/sheet-stack.js']) assert.ok(orden.indexOf(f) > i, f);
});

test('nadie reasigna openSheet/showScreen desde fuera de sheet-stack.js', () => {
  const malos = ARCHIVOS.filter(f => !f.endsWith('sheet-stack.js')).filter(f => {
    const src = leer(f).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    return /(^|[^\w$.])(openSheet|showScreen)\s*=\s*(?:async\s+)?function/m.test(src);
  });
  assert.deepEqual(malos, []);
});
