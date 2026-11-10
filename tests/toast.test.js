'use strict';
// M6 — toast() trata el mensaje como TEXTO; el marcado solo entra con html``/raw(). Además, ninguna llamada vuelve a escapar con escHtml().
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { loadApp } = require('./support/load-app');

const raiz = path.join(__dirname, '..');
const core = f => path.join(raiz, 'js', 'core', f);

function entorno() {
  const app = loadApp([core('html-tag.js'), core('events.js'), core('core-state.js')], { permissive: true });
  const doc = new JSDOM('<!doctype html><body><div id="toast-container"></div></body>').window.document;
  app.document = doc;
  const ultimo = () => doc.querySelector('#toast-container').lastElementChild;
  return { app, doc, ultimo, msg: () => ultimo().querySelector('.toast-msg') };
}

describe('toast-texto-por-defecto', () => {
  test('un string con marcado se muestra como texto, sin crear elementos', () => {
    const { app, msg } = entorno();
    app.toast('a<b>negrita</b> & <img src=x onerror=alert(1)>', 'err');
    assert.equal(msg().textContent, 'a<b>negrita</b> & <img src=x onerror=alert(1)>');
    assert.equal(msg().children.length, 0);
  });
  test('un nombre con comillas y & se ve tal cual (sin &amp; ni &quot;)', () => {
    const { app, msg } = entorno();
    app.toast('Cuenta "Ahorros & Co" creada');
    assert.equal(msg().textContent, 'Cuenta "Ahorros & Co" creada');
  });
  test('html`` pinta marcado y escapa lo interpolado', () => {
    const { app, msg } = entorno();
    app.toast(app.html`Listo <i class="fa-solid fa-check"></i> ${'<script>x</script>'}`);
    assert.equal(msg().querySelectorAll('i').length, 1);
    assert.equal(msg().querySelectorAll('script').length, 0);
    assert.ok(msg().textContent.includes('<script>x</script>'));
  });
  test('raw() pinta marcado de confianza (p. ej. un <br> entre líneas)', () => {
    const { app, msg } = entorno();
    app.toast(app.raw('uno<br>dos'), 'info');
    assert.equal(msg().querySelectorAll('br').length, 1);
  });
  test('compatibilidad: un texto que llega ya escapado por un validador antiguo no se ve como «&amp;»', () => {
    const { app, msg } = entorno();
    app.toast('Saldo insuficiente en Ahorros &amp; Co. &lt;b&gt;', 'err');
    assert.equal(msg().textContent, 'Saldo insuficiente en Ahorros & Co. <b>');
  });
  test('null/undefined no muestran «undefined»; el rol y la clase siguen el tipo', () => {
    const { app, ultimo, msg } = entorno();
    app.toast(undefined, 'err');
    assert.equal(msg().textContent, '');
    assert.equal(ultimo().getAttribute('role'), 'alert');
    assert.ok(ultimo().classList.contains('toast-err'));
  });
  test('Plata.validarSalida devuelve el motivo en texto plano (sin escapar)', () => {
    const { app } = entorno();
    app.S.cuentas = [{ id: 'x', tipo: 'billetera', nombre: 'A & <B>', saldo: 0 }];
    const v = app.Plata.validarSalida('cuenta:x', 10);
    assert.equal(v.ok, false);
    assert.ok(v.motivo.includes('A & <B>'), v.motivo);
  });
});

describe('toast-sin-escHtml-en-llamadas', () => {
  const archivos = (dir, acc = []) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); e.isDirectory() ? archivos(f, acc) : e.name.endsWith('.js') && acc.push(f); } return acc; };
  test('ninguna llamada toast(…) escapa con escHtml() (el mensaje ya es texto)', () => {
    const malas = [];
    for (const f of archivos(path.join(raiz, 'js'))) {
      fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
        if (/^\s*(\/\/|\*)/.test(l)) return;
        if (/\btoast\([^;]*escHtml\(/.test(l)) malas.push(path.relative(raiz, f) + ':' + (i + 1));
      });
    }
    assert.deepEqual(malas, [], 'toast() pinta texto: quita escHtml() (si necesitas marcado, usa html``)');
  });
});
