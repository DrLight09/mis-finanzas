'use strict';

/**
 * Stub mínimo de `document`, suficiente para que core-state.js/inicio.js
 * puedan CARGARSE (parsear y ejecutar su código de nivel superior) sin
 * reventar. No intenta simular un DOM real — las funciones bajo test
 * (calcPatrimonioTotal, calcHealthScore) no tocan el DOM.
 *
 * Existe solo porque core-state.js tiene líneas de nivel superior que
 * corren al cargar el archivo, no adentro de una función:
 *   - línea ~158: const _medirCtx = document.createElement('canvas').getContext('2d')
 *     (medirAnchoTexto — mide texto sin tocar el DOM)
 *   - línea ~858: document.getElementById('dialog-overlay').addEventListener(...)
 *   - línea ~940: window.addEventListener('beforeunload', ...)
 * Sin este stub, cargar core-state.js en Node explota ahí mismo.
 */
function createCanvasContextStub() {
  return {
    font: '',
    measureText() { return { width: 0 }; },
  };
}

function createElementStub(tag) {
  return {
    addEventListener() {},
    removeEventListener() {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    style: {},
    dataset: {},
    setAttribute() {},
    getAttribute() { return null; },
    appendChild() {},
    remove() {},
    querySelector() { return createElementStub(); },
    querySelectorAll() { return []; },
    getContext(type) { return tag === 'canvas' ? createCanvasContextStub() : null; },
  };
}

function createDocumentStub() {
  return {
    getElementById() { return createElementStub(); },
    querySelector() { return createElementStub(); },
    querySelectorAll() { return []; },
    createElement(tag) { return createElementStub(tag); },
    addEventListener() {},
    removeEventListener() {},
    body: createElementStub(),
  };
}

module.exports = { createDocumentStub, createElementStub };
