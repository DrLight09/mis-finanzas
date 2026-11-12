'use strict';
const { leerEstado, REL: PARTES_ESTADO, esParte } = require('./support/nucleo-estado');

// M4 — fuentes de dinero: un solo parseo del código (Fuente), etiquetas con contrato explícito (texto / HTML) y un solo constructor de <option>.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const raiz = path.join(__dirname, '..');
const leer = rel => fs.readFileSync(path.join(raiz, rel), 'utf8');
const JS = fs.readdirSync(path.join(raiz, 'js'), { recursive: true }).filter(f => f.endsWith('.js')).map(f => path.join('js', f));
const sinComentarios = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/.*$/gm, '');

function app(S) {
  const a = loadApp([path.join(raiz, 'js/core/html-tag.js'), path.join(raiz, 'js/core/core-state.js')], { permissive: true });
  Object.assign(a.S, S || {});
  return a;
}
const plano = x => JSON.parse(JSON.stringify(x));

describe('Fuente.parsear', () => {
  test('reconoce cada tipo de código', () => {
    const { Fuente } = app();
    assert.deepEqual(plano(Fuente.parsear('')), { tipo: 'vacia', id: '' });
    assert.deepEqual(plano(Fuente.parsear(null)), { tipo: 'vacia', id: '' });
    assert.deepEqual(plano(Fuente.parsear('alcancia')), { tipo: 'alcancia', id: '' });
    assert.deepEqual(plano(Fuente.parsear('ganancia')), { tipo: 'ganancia', id: '' });
    assert.deepEqual(plano(Fuente.parsear('cuenta:nequi')), { tipo: 'cuenta', id: 'nequi' });
    assert.deepEqual(plano(Fuente.parsear('cajita:abc')), { tipo: 'cajita', id: 'abc' });
    assert.deepEqual(plano(Fuente.parsear('tc:t1')), { tipo: 'tc', id: 't1' });
    assert.deepEqual(plano(Fuente.parsear('xyz')), { tipo: 'otra', id: '' });
  });
  test('esTC/esCajita/esCuenta son seguros con valores que no son texto', () => {
    const { Fuente } = app();
    for (const v of [undefined, null, 5, {}]) {
      assert.equal(Fuente.esTC(v), false); assert.equal(Fuente.esCajita(v), false); assert.equal(Fuente.esCuenta(v), false);
    }
    assert.equal(Fuente.esTC('tc:1'), true);
    assert.equal(Fuente.id('tc:1'), '1');
    assert.equal(Fuente.de('cajita', 'q'), 'cajita:q');
  });
});

describe('fuenteTexto / fuenteHtml', () => {
  test('texto plano siempre; ganancia ya no devuelve un <svg> en el texto', () => {
    const a = app();
    assert.equal(a.fuenteTexto('ganancia'), 'Ganancia (no desembolsada)');
    assert.ok(!a.fuenteTexto('ganancia').includes('<'));
    assert.equal(a.fuenteTexto(''), 'Sin especificar');
    assert.equal(a.fuenteTexto('alcancia'), 'Alcancía');
    assert.equal(a.fuenteTexto('cuenta:no-existe'), 'Cuenta eliminada');
    assert.equal(a.fuenteLabel('ganancia'), a.fuenteTexto('ganancia'));
  });
  test('HTML: escapa nombres; ganancia lleva su ícono', () => {
    const a = app({ tarjetasCredito: [{ id: 't1', nombre: '<b>Visa</b> & Co' }] });
    assert.equal(a.fuenteHtml('tc:t1'), '&lt;b&gt;Visa&lt;/b&gt; &amp; Co');
    assert.ok(a.fuenteHtml('ganancia').startsWith('<svg'));
    assert.ok(a.fuenteHtml('ganancia').includes('Ganancia'));
  });
});

describe('opcionesCuenta es el único constructor de <option>s de cuentas', () => {
  test('opcionesCuenta escapa el nombre y marca la seleccionada', () => {
    const a = app({ cuentas: [{ id: 'z', nombre: 'Ahorro <z>', tipo: 'banco', saldo: 1000 }] });
    const h = a.opcionesCuenta({ selectedVal: 'cuenta:z', placeholder: 'Elige' });
    assert.ok(h.startsWith('<option value="">Elige</option>'));
    assert.ok(h.includes('Ahorro &lt;z&gt;'));
    assert.ok(/<option value="cuenta:z" selected>/.test(h));
  });
  test('nadie fuera de core-state.js llama al constructor privado ni reintroduce el nombre viejo', () => {
    const malos = JS.filter(f => /buildFuentesOptsHtml/.test(sinComentarios(leer(f))));
    assert.deepEqual(malos, []);
    const privados = JS.filter(f => !esParte(f) && /_buildFuentesOpts\s*\(/.test(sinComentarios(leer(f))));
    assert.deepEqual(privados, []);
  });
});

describe('guardas: el prefijo del código se interpreta solo en Fuente', () => {
  test("ningún archivo (salvo el núcleo (cuentas-fuentes.js)) usa startsWith('tc:' | 'cajita:' | 'cuenta:')", () => {
    const malos = JS.filter(f => !esParte(f) && /startsWith\(['"](tc|cajita|cuenta):['"]\)/.test(sinComentarios(leer(f))));
    assert.deepEqual(malos, []);
    const enCore = (sinComentarios(leerEstado()).match(/startsWith\(['"](tc|cajita|cuenta):['"]\)/g) || []);
    assert.deepEqual(enCore, []);
  });
  test('los envoltorios de etiqueta (_fuenteLabelHtml, _fuenteTexto, _cpFuenteLabel, fuenteLabel2) ya no existen', () => {
    const malos = JS.filter(f => /\b(_fuenteLabelHtml|_fuenteTexto|_cpFuenteLabel|fuenteLabel2)\b/.test(sinComentarios(leer(f))));
    assert.deepEqual(malos, []);
  });
});
