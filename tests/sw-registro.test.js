// sw-registro.js: el aviso «hay una versión nueva» y el botón «Actualizar» con varias pestañas abiertas.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { aClasico } = require('../scripts/modulos-a-clasico.js');

function montar({ conControlador = true } = {}) {
  const escuchas = {};
  const recargas = [];
  const mensajes = [];
  const elementos = new Map();
  const crear = tag => {
    const el = { tag, children: [], listeners: {}, attrs: {}, className: '', id: '', textContent: '',
      setAttribute(k, v) { this.attrs[k] = v; },
      addEventListener(ev, fn) { this.listeners[ev] = fn; },
      append(...h) { this.children.push(...h); }, appendChild(h) { this.children.push(h); if (h.id) elementos.set(h.id, h); },
      remove() { elementos.delete(this.id); } };
    return el;
  };
  const registro = { waiting: null, installing: null, addEventListener() {} };
  const ctx = {
    console: { info() {}, log() {}, warn() {} },
    Promise, setTimeout,
    navigator: { serviceWorker: {
      controller: conControlador ? {} : null,
      register: () => Promise.resolve(registro),
      addEventListener: (ev, fn) => { escuchas[ev] = fn; } } },
    document: { hidden: false, createElement: crear, getElementById: id => elementos.get(id) || null, body: crear('body'), addEventListener() {} },
    location: { reload: () => recargas.push(1) },
  };
  ctx.document.body.appendChild = h => { if (h.id) elementos.set(h.id, h); };
  ctx.window = ctx;
  vm.createContext(ctx);
  const codigo = aClasico(fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'sw-registro.js'), 'utf8'))
    .replace(/exponerGlobales\([^)]*\);?/, '').replace(/exponerVariables\([^)]*\);?/, '');
  vm.runInContext(codigo, ctx);
  const botonActualizar = () => elementos.get('sw-aviso').children.find(c => c.className === 'sw-aviso-btn');
  return { ctx, escuchas, recargas, mensajes, elementos, botonActualizar };
}

describe('aviso de versión nueva con varias pestañas', () => {
  test('con un worker en espera, «Actualizar» le manda SKIP_WAITING y recarga al cambiar el controlador', () => {
    const m = montar();
    const worker = { state: 'installed', postMessage: x => m.mensajes.push(x) };
    m.ctx.mostrarAvisoNuevaVersion(worker);
    m.botonActualizar().listeners.click();
    assert.equal(JSON.stringify(m.mensajes), JSON.stringify([{ tipo: 'SKIP_WAITING' }]));
    assert.equal(m.recargas.length, 0);
    m.escuchas.controllerchange();
    assert.equal(m.recargas.length, 1);
  });
  test('si otra pestaña ya activó esa versión, «Actualizar» recarga directamente (antes no hacía nada)', () => {
    const m = montar();
    const worker = { state: 'activated', postMessage: x => m.mensajes.push(x) };
    m.ctx.mostrarAvisoNuevaVersion(worker);
    m.botonActualizar().listeners.click();
    assert.equal(m.mensajes.length, 0);
    assert.equal(m.recargas.length, 1);
  });
  test('si el controlador cambia sin que esta pestaña lo pidiera, aparece el aviso y su botón recarga', () => {
    const m = montar();
    assert.equal(m.elementos.has('sw-aviso'), false);
    m.escuchas.controllerchange();
    assert.equal(m.recargas.length, 0, 'no recarga sola: la persona puede estar escribiendo');
    assert.ok(m.elementos.has('sw-aviso'));
    m.botonActualizar().listeners.click();
    assert.equal(m.recargas.length, 1);
  });
  test('en la primera instalación (sin controlador previo) no hay aviso ni recarga', () => {
    const m = montar({ conControlador: false });
    m.escuchas.controllerchange();
    assert.equal(m.elementos.has('sw-aviso'), false);
    assert.equal(m.recargas.length, 0);
  });
});
