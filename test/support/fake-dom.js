'use strict';
/**
 * DOM simulado con eventos, suficiente para ejercitar la capa de pantalla de los módulos
 * (lectura de inputs, escritura de textContent/innerHTML/style, listeners que se pueden
 * disparar). No es un navegador: no hay layout, ni CSS, ni parseo de HTML.
 *
 *   const dom = createFakeDom({ mpMonto: { value: '80000' } });
 *   ctx.document = dom.document;          // reemplaza el stub del harness
 *   dom.fire('btn-confirmar-mesada', 'click');
 */
function createFakeDom(initial = {}) {
  const els = {};
  function make(id) {
    const handlers = {};
    const el = {
      id, value: '', checked: false, textContent: '', disabled: false,
      style: {}, dataset: {}, children: [], options: [], selectedIndex: 0,
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      addEventListener(t, f) { (handlers[t] || (handlers[t] = [])).push(f); },
      removeEventListener() {},
      querySelector() { return null; }, querySelectorAll() { return []; },
      setAttribute() {}, getAttribute() { return null; }, appendChild() {}, remove() {},
      focus() {},
      click() { if (this.type === 'checkbox' || /^(mpp?UsarEncargo|mpQuedaDebiendo)$/.test(id)) this.checked = !this.checked; fire(id, 'change'); fire(id, 'click', { target: el }); },
      _handlers: handlers,
    };
    // Como el DOM real: lo asignado a innerHTML se convierte a string.
    let inner = '';
    Object.defineProperty(el, 'innerHTML', { get: () => inner, set: v => { inner = String(v); }, enumerable: true });
    return el;
  }
  const get = id => els[id] || (els[id] = make(id));
  function fire(id, type, ev) {
    const el = get(id);
    (el._handlers[type] || []).forEach(f => f(ev || { target: el, stopPropagation() {} }));
  }
  Object.entries(initial).forEach(([id, v]) => Object.assign(get(id), v));
  const document = {
    getElementById: get, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => make('_tmp'), addEventListener() {}, removeEventListener() {},
    body: get('body'), activeElement: null,
  };
  return { document, el: get, fire, els };
}

// Implementación mínima de html``/raw() del núcleo para probar templates: escapa lo interpolado
// salvo que venga de raw() o de otro html``.
function createHtmlTag(escHtml) {
  class Safe { constructor(s) { this.s = s; } toString() { return this.s; } }
  const raw = s => new Safe(String(s));
  const html = (strings, ...vals) => new Safe(strings.reduce((a, s, i) =>
    a + s + (i < vals.length ? (vals[i] instanceof Safe ? vals[i].s : escHtml(vals[i])) : ''), ''));
  return { html, raw };
}

module.exports = { createFakeDom, createHtmlTag };
