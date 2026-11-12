'use strict';
const { leerEstado, REL: PARTES_ESTADO, esParte } = require('./support/nucleo-estado');

// Piezas de pantalla únicas: confirmar eliminación (confirmarEliminar / avisarNoSePuede) y estados vacíos (emptyState / emptyInline).
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const raiz = path.join(__dirname, '..');
const core = f => path.join(raiz, 'js', 'core', f);

function nuevo() {
  const app = loadApp([core('html-tag.js'), core('events.js'), core('core-state.js')], { permissive: true });
  const llamadas = [];
  app.dialogo = (titulo, msg, btn, peligro) => { llamadas.push({ titulo, msg, btn, peligro }); return Promise.resolve(true); };
  return { app, llamadas };
}

function archivosJs(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) archivosJs(f, acc);
    else if (e.name.endsWith('.js')) acc.push(f);
  }
  return acc;
}

describe('confirmar-eliminacion-unica', () => {
  test('arma título, pregunta, detalle y aviso de irreversible; botón rojo', async () => {
    const { app, llamadas } = nuevo();
    assert.equal(await app.confirmarEliminar({ titulo: 'Eliminar gasto', objeto: 'este gasto' }), true);
    assert.deepEqual({ ...llamadas[0] }, { titulo: 'Eliminar gasto', msg: '¿Eliminar este gasto? Esta acción no se puede deshacer.', btn: 'Eliminar', peligro: true });
  });
  test('con detalle: la pregunta, el detalle y al final «no se puede deshacer» (sin repetirlo si el detalle ya lo dice)', async () => {
    const { app, llamadas } = nuevo();
    await app.confirmarEliminar({ titulo: 'X', objeto: 'la cuenta "Nequi"', detalle: 'Se conserva el historial.' });
    assert.equal(llamadas[0].msg, '¿Eliminar la cuenta "Nequi"? Se conserva el historial. Esta acción no se puede deshacer.');
    await app.confirmarEliminar({ titulo: 'X', objeto: 'esto', detalle: 'Esta acción no se puede deshacer, pero puedes volver a crearlo.' });
    assert.equal(llamadas[1].msg.match(/no se puede deshacer/g).length, 1);
    await app.confirmarEliminar({ titulo: 'X', objeto: 'esto', irreversible: false });
    assert.equal(llamadas[2].msg, '¿Eliminar esto?');
  });
  test('verbo y etiqueta propios («Borrar», «Deshacer»)', async () => {
    const { app, llamadas } = nuevo();
    await app.confirmarEliminar({ titulo: 'Borrar cobro', verbo: 'Borrar', etiqueta: 'Borrar', objeto: 'este cobro', irreversible: false });
    assert.equal(llamadas[0].msg, '¿Borrar este cobro?');
    assert.equal(llamadas[0].btn, 'Borrar');
  });
  test('NO escapa el texto (dialogo pinta con textContent): un nombre con & o < sale tal cual', async () => {
    const { app, llamadas } = nuevo();
    await app.confirmarEliminar({ titulo: 'X', objeto: 'a Pérez & <Cía>' });
    assert.match(llamadas[0].msg, /Pérez & <Cía>/);
  });
  test('avisarNoSePuede: un solo botón «Entendido», sin color de peligro', async () => {
    const { app, llamadas } = nuevo();
    await app.avisarNoSePuede('No se puede eliminar', 'Tiene movimientos.');
    assert.deepEqual({ ...llamadas[0] }, { titulo: 'No se puede eliminar', msg: 'Tiene movimientos.', btn: 'Entendido', peligro: false });
  });
  test('ningún módulo vuelve a armar a mano «Eliminar…» ni «No se puede…» con dialogo() ni usa escHtml dentro de un diálogo', () => {
    const malos = [];
    for (const f of archivosJs(path.join(raiz, 'js'))) {
      const t = fs.readFileSync(f, 'utf8');
      if (/dialogo\(\s*['"`](Eliminar|Borrar|No se puede)/.test(t)) malos.push(path.relative(raiz, f) + ': dialogo(' + t.match(/dialogo\(\s*['"`][^'"`]*/)[0].slice(9) + ')');
      if (/\bconfirm\(/.test(t.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/[A-Za-z_]confirm\(/g, ''))) malos.push(path.relative(raiz, f) + ': confirm() nativo');
    }
    assert.deepEqual(malos, []);
  });
  test('ningún diálogo recibe markup (<svg>, <b>…) ni escHtml: dialogo() usa textContent', () => {
    const malos = [];
    for (const f of archivosJs(path.join(raiz, 'js'))) {
      const t = fs.readFileSync(f, 'utf8');
      const re = /(confirmarEliminar|avisarNoSePuede|dialogo)\(([^;]*?)\);/gs;
      let m;
      while ((m = re.exec(t))) if (/escHtml\(|<svg|<b>|<br>/.test(m[2])) malos.push(path.relative(raiz, f) + ': ' + m[1]);
    }
    assert.deepEqual(malos, []);
  });
});

describe('estados-vacios-unicos', () => {
  test('emptyState dibuja solo las partes que vienen y el botón con el despachador', () => {
    const { app } = nuevo();
    const h = app.emptyState('<svg></svg>', 'Sin cosas', 'Agrega una', 'Agregar', { action: 'mod:nueva' });
    assert.match(h, /empty-state-icon/);
    assert.match(h, /empty-state-title">Sin cosas/);
    assert.match(h, /data-action="mod:nueva"/);
    const solo = app.emptyState('', '', 'Solo texto', null, null, { compacto: true });
    assert.ok(!/empty-state-icon|empty-state-title|empty-state-btn/.test(solo));
    assert.match(solo, /empty-state empty-state-compacto/);
  });
  test('emptyInline escapa el texto y aplica las variantes', () => {
    const { app } = nuevo();
    assert.equal(app.emptyInline('Sin <b>datos</b> & más'), '<div class="empty-inline">Sin &lt;b&gt;datos&lt;/b&gt; &amp; más</div>');
    assert.match(app.emptyInline('x', { centro: true, grande: true, clase: 'card' }), /^<div class="empty-inline empty-inline-centro empty-inline-grande card">/);
  });
  test('los módulos no arman su propio estado vacío: nada de class="…-vacio" / «empty-state» fuera de las partes del núcleo (estado/utilidades-ui…)', () => {
    const malos = [];
    for (const f of archivosJs(path.join(raiz, 'js'))) {
      if (esParte(f)) continue;
      const t = fs.readFileSync(f, 'utf8');
      // Los comentarios no cuentan.
      const sinCom = t.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of sinCom.matchAll(/class="([^"]*)"/g)) {
        if (/(^|\s)(empty-state[\w-]*)(\s|$)/.test(m[1]) || /(^|\s)[\w]+-vac(io|ia)(-[\w]+)?(\s|$)/.test(m[1])) malos.push(path.relative(raiz, f) + ': ' + m[1]);
      }
    }
    // Excepciones declaradas: la tarjeta-invitación de Inicio (lleva su propio botón × y estilos), la tarjeta que envuelve emptyState
    // y el bloque «apertura» de la cuenta (es un botón, no un estado vacío).
    const permitidos = /ix-cuentas-vacio|nu-cdt-vacio|nu-meta-vacia|cuenta-apertura-vacia|cuenta-movs-bloque-vacio|nu-meta-vacia/;
    assert.deepEqual(malos.filter(x => !permitidos.test(x)), []);
  });
  test('las clases del helper existen en el CSS', () => {
    const css = fs.readFileSync(path.join(raiz, 'css', 'styles.css'), 'utf8');
    for (const c of ['empty-state', 'empty-state-compacto', 'empty-inline', 'empty-inline-centro', 'empty-inline-grande', 'empty-inline-sep', 'dialog-ok-peligro', 'dialog-ok-normal']) {
      assert.ok(css.includes('.' + c), c);
    }
  });
});
