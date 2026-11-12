'use strict';
// M2 — PersonaPicker: un solo componente para los campos «¿Quién es?» (HTML estático en index.html, sin innerHTML en runtime).
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { loadApp } = require('./support/load-app');

const raiz = path.join(__dirname, '..');
const f = (...p) => path.join(raiz, ...p);
const html = fs.readFileSync(f('index.html'), 'utf8');

const CAMPO = pref => `<div id="${pref}-btn" class="persona-btn" data-picker="${pref}"><div id="${pref}-avatar" style="display:none"></div><span id="${pref}-label">Seleccionar persona...</span><svg id="${pref}-chevron"></svg></div><div id="${pref}-hint" hidden></div><input type="hidden" id="x_n" value="">`;

function entorno() {
  const app = loadApp([f('js/core/html-tag.js'), f('js/core/events.js'), f('js/core/core-state.js'), f('js/modules/personas.js')], { permissive: true });
  const doc = new JSDOM('<!doctype html><body>' + CAMPO('t-persona') + '</body>').window.document;
  app.document = doc;
  app.S.personas = [{ id: 'p1', nombre: 'Carlos', color: '#60b0f0' }, { id: 'p2', nombre: 'Ana', color: '#f06868' }];
  const abiertos = [];
  app.abrirSelPersona = (cb, titulo) => abiertos.push({ cb, titulo });
  app.pintarAvatarPersona = (av) => { av.style.display = 'flex'; };
  const pk = app.PersonaPicker.crear({ prefijo: 't-persona', inputId: 'x_n', titulo: 'T' });
  return { app, doc, pk, abiertos };
}

describe('PersonaPicker', () => {
  test('abrir → elegir guarda valor, nombre en el input, pinta y marca is-set', () => {
    const { doc, pk, abiertos } = entorno();
    pk.abrir();
    assert.equal(abiertos.length, 1);
    assert.equal(abiertos[0].titulo, 'T');
    abiertos[0].cb('p1');
    assert.equal(pk.valor, 'p1');
    assert.equal(doc.getElementById('x_n').value, 'Carlos');
    assert.equal(doc.getElementById('t-persona-label').textContent, 'Carlos');
    assert.ok(doc.getElementById('t-persona-btn').classList.contains('is-set'));
    assert.equal(doc.getElementById('t-persona-avatar').style.display, 'flex');
  });
  test('limpiar vuelve al estado inicial', () => {
    const { doc, pk } = entorno();
    pk.elegir('p2'); pk.limpiar();
    assert.equal(pk.valor, null);
    assert.equal(doc.getElementById('x_n').value, '');
    assert.equal(doc.getElementById('t-persona-label').textContent, 'Seleccionar persona...');
    assert.ok(!doc.getElementById('t-persona-btn').classList.contains('is-set'));
    assert.equal(doc.getElementById('t-persona-avatar').style.display, 'none');
  });
  test('precargar con personaId bloquea; abrir no hace nada y se ve el aviso', () => {
    const { doc, pk, abiertos } = entorno();
    pk.precargar({ personaId: 'p1', nombre: 'Carlos' });
    assert.equal(pk.valor, 'p1');
    assert.equal(pk.bloqueado, true);
    assert.ok(doc.getElementById('t-persona-btn').classList.contains('is-locked'));
    assert.equal(doc.getElementById('t-persona-hint').hidden, false);
    pk.abrir();
    assert.equal(abiertos.length, 0);
  });
  test('precargar sin vínculo muestra el nombre suelto y deja elegir una persona una vez', () => {
    const { doc, pk, abiertos } = entorno();
    pk.precargar({ nombre: 'Pepe' });
    assert.equal(pk.valor, null);
    assert.equal(pk.bloqueado, false);
    assert.equal(doc.getElementById('t-persona-label').textContent, 'Pepe');
    assert.equal(doc.getElementById('x_n').value, 'Pepe');
    assert.equal(doc.getElementById('t-persona-hint').hidden, true);
    pk.abrir();
    assert.equal(abiertos.length, 1);
  });
  test('abiertoSinConfirmar: true si se abrió y no se eligió; false tras elegir o precargar', () => {
    const { pk, abiertos } = entorno();
    pk.precargar({ nombre: 'Pepe' });
    assert.equal(pk.abiertoSinConfirmar, false);
    pk.abrir();
    assert.equal(pk.abiertoSinConfirmar, true);
    abiertos[0].cb('p2');
    assert.equal(pk.abiertoSinConfirmar, false);
  });
  test('alCambiar se llama al elegir; id inexistente se ignora', () => {
    const { app, pk } = entorno();
    const vistos = [];
    app.PersonaPicker.crear({ prefijo: 't-persona', inputId: 'x_n', alCambiar: id => vistos.push(id) });
    pk.elegir('nada'); pk.elegir('p2');
    assert.deepEqual(vistos, ['p2']);
    assert.equal(pk.valor, 'p2');
  });
  test('crear es idempotente por prefijo', () => {
    const { app, pk } = entorno();
    assert.equal(app.PersonaPicker.crear({ prefijo: 't-persona', inputId: 'x_n' }), pk);
  });
});

describe('PersonaPicker: markup estático en index.html', () => {
  for (const [pref, input] of [['sp-persona', 'sp_n'], ['sp-edit-persona', 'sp_edit_n'], ['enc-persona', 'enc_nombre']]) {
    test(`${pref}: botón, avatar, label, chevron e input oculto existen`, () => {
      for (const parte of ['btn', 'avatar', 'label', 'chevron']) assert.ok(html.includes(`id="${pref}-${parte}"`), pref + '-' + parte);
      assert.ok(html.includes(`data-picker="${pref}"`));
      assert.ok(new RegExp(`<input type="hidden" id="${input}"`).test(html));
    });
  }
  test('los módulos ya no reescriben el campo con innerHTML', () => {
    for (const m of ['spotify.js', 'encargos.js']) {
      const src = fs.readFileSync(f('js/modules', m), 'utf8');
      assert.ok(!/closest\('\.ig'\)/.test(src), m);
      assert.ok(!/_personaHook|_personaEditHook/.test(src), m);
    }
  });
});

describe('Encargos: la integración con Personas sigue dentro del módulo', () => {
  test('renderEncargosList y abrirEncargoDetalle llaman a helpers que existen', () => {
    const src = fs.readFileSync(f('js/modules/encargos.js'), 'utf8');
    for (const fn of ['_pintarEncargosList', '_pintarEncargoDetalle', '_encDetallePartes', '_encDetallePersona']) {
      assert.ok(new RegExp('^function ' + fn + '\\(', 'm').test(src), 'falta function ' + fn);
      assert.ok(new RegExp('[^\\w]' + fn + '\\(').test(src.replace(new RegExp('^function ' + fn + '\\(', 'm'), '')), fn + ' no se llama desde ningún lado');
    }
  });
});

test('Encargos: el avatar con color de persona y el clic al perfil vienen en el HTML de la fila (sin parchar el DOM después)', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'js/modules/encargos.js'), 'utf8');
  assert.ok(!/_encListaPerfiles/.test(src), 'ya no existe el parche de DOM');
  assert.match(src, /enc-av-perfil[^`]*personas:abrirPerfil|personas:abrirPerfil[^`]*enc-av-perfil/);
});
