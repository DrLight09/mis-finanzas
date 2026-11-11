'use strict';
// M10 — Formulario: validación inline única (campo con borde rojo + mensaje bajo el campo), llamada desde cada módulo.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const leer = rel => fs.readFileSync(path.join(raiz, rel), 'utf8');

function entorno(htmlBody) {
  const dom = new JSDOM('<!doctype html><body>' + htmlBody + '</body>');
  const ctx = { document: dom.window.document, setTimeout, clearTimeout, console, parseMoney: v => parseFloat(String(v).replace(',', '.')) || 0 };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(leer('js/core/formulario.js') + '\nthis.Formulario = Formulario;', ctx);
  return { F: ctx.Formulario, doc: dom.window.document, dom };
}
const CAMPOS = '<div class="ig"><input id="a" value=""></div><div class="ig"><input id="b" value="0"></div><div class="ig"><input id="c" value="ok"></div>';

describe('Formulario.validar', () => {
  test('todos válidos → true y no marca nada', () => {
    const { F, doc } = entorno(CAMPOS);
    assert.equal(F.validar([{ campo: 'c', mensaje: 'x' }]), true);
    assert.equal(doc.querySelectorAll('.input-error').length, 0);
    assert.equal(doc.getElementById('c_err'), null);
  });
  test('marca TODOS los que fallan, crea el mensaje junto al campo y enfoca solo el primero', () => {
    const { F, doc } = entorno(CAMPOS);
    const ok = F.validar([
      { campo: 'a', mensaje: 'Falta a' },
      { campo: 'b', mensaje: 'b debe ser > 0', regla: 'monto' },
      { campo: 'c', mensaje: 'c ok' },
    ]);
    assert.equal(ok, false);
    assert.ok(doc.getElementById('a').classList.contains('input-error'));
    assert.ok(doc.getElementById('b').classList.contains('input-error'));
    assert.ok(!doc.getElementById('c').classList.contains('input-error'));
    const ea = doc.getElementById('a_err');
    assert.equal(ea.textContent, 'Falta a');
    assert.ok(ea.classList.contains('visible'));
    assert.equal(ea.previousElementSibling, doc.getElementById('a'));
    assert.equal(doc.activeElement, doc.getElementById('a'));
  });
  test('regla función recibe (valor, elemento); el mensaje es texto, no HTML', () => {
    const { F, doc } = entorno(CAMPOS);
    F.validar([{ campo: 'c', mensaje: '<b>mal</b>', regla: (v, el) => v === 'otro' && el.id === 'c' }]);
    assert.equal(doc.getElementById('c_err').textContent, '<b>mal</b>');
    assert.equal(doc.getElementById('c_err').children.length, 0);
  });
  test('un mismo campo no duplica el mensaje al fallar dos veces', () => {
    const { F, doc } = entorno(CAMPOS);
    F.validar([{ campo: 'a', mensaje: 'uno' }]);
    F.validar([{ campo: 'a', mensaje: 'dos' }]);
    assert.equal(doc.querySelectorAll('#a_err').length, 1);
    assert.equal(doc.getElementById('a_err').textContent, 'dos');
  });
  test('escribir en el campo quita el error; limpiar() también', () => {
    const { F, doc, dom } = entorno(CAMPOS);
    F.error('a', 'falta');
    doc.getElementById('a').dispatchEvent(new dom.window.Event('input'));
    assert.ok(!doc.getElementById('a').classList.contains('input-error'));
    assert.ok(!doc.getElementById('a_err').classList.contains('visible'));
    F.error('b', 'x'); F.limpiar('b');
    assert.ok(!doc.getElementById('b').classList.contains('input-error'));
  });
  test('un campo inexistente no lanza', () => {
    const { F } = entorno('');
    assert.doesNotThrow(() => F.error('nada', 'x'));
    assert.equal(F.validar([{ campo: 'nada', mensaje: 'x' }]), false);
  });
});

describe('guardas M10', () => {
  const JS = fs.readdirSync(path.join(raiz, 'js'), { recursive: true }).filter(f => f.endsWith('.js')).map(f => path.join('js', f));
  test('_markError y _injectErrorSpans ya no existen en el código', () => {
    const malos = JS.filter(f => /\b(_markError|_injectErrorSpans)\b/.test(leer(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')));
    assert.deepEqual(malos, []);
  });
  test('el núcleo no conoce los ids de los formularios (sp_n, gv_desc, gf_n…)', () => {
    for (const f of ['js/core/navegacion.js', 'js/core/eventos-base.js', 'js/core/core-state.js']) {
      const src = leer(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      assert.ok(!/['"](gv_desc|gv_monto|gf_n|gf_m|sp_m)['"]/.test(src), f);
    }
  });
  test('index.html carga formulario.js', () => {
    assert.ok(/js\/core\/formulario\.js/.test(leer('index.html')));
  });
});
