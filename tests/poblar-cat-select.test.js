'use strict';
// poblarCatSelect(): las categorías son texto libre de la persona, así que se escapan al pintarlas en el <select>.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const CORE = path.join(__dirname, '..', 'js', 'core');
const app = () => {
  const a = loadApp([path.join(CORE, 'estado.js'), path.join(CORE, 'html-tag.js')], { permissive: true });
  // Como el DOM real: lo que se asigna a innerHTML se convierte a texto (html`` devuelve un objeto con toString).
  let texto = '';
  const sel = { get innerHTML() { return texto; }, set innerHTML(v) { texto = String(v); } };
  a.document = { getElementById: id => (id === 'sel' ? sel : null) };
  return { a, sel };
};

describe('poblarCatSelect', () => {
  test('una categoría con comillas conserva su valor completo y queda seleccionada', () => {
    const { a, sel } = app();
    a.poblarCatSelect('sel', ['Comida', 'Ropa "bonita"'], 'Ropa "bonita"');
    assert.ok(sel.innerHTML.includes('value="Ropa &quot;bonita&quot;"'), sel.innerHTML);
    assert.match(sel.innerHTML, /value="Ropa &quot;bonita&quot;" selected>/);
    assert.equal((sel.innerHTML.match(/ selected/g) || []).length, 1, 'solo una opción seleccionada');
  });

  test('una categoría con < no rompe el marcado', () => {
    const { a, sel } = app();
    a.poblarCatSelect('sel', ['<b>x</b>', 'Otros'], 'Otros');
    assert.ok(!sel.innerHTML.includes('<b>'), sel.innerHTML);
    assert.ok(sel.innerHTML.includes('&lt;b&gt;x&lt;/b&gt;'));
  });

  test('categorías normales: una opción por categoría', () => {
    const { a, sel } = app();
    a.poblarCatSelect('sel', ['Comida', 'Transporte'], 'Comida');
    assert.equal((sel.innerHTML.match(/<option /g) || []).length, 2);
  });
});
