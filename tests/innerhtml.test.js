// A11: ningún `x.innerHTML = \`…${…}…\`` nuevo sin la etiqueta html``. Lo que ya había se revisó a mano: solo interpola números
// (fmt), clases/íconos internos o texto ya escapado con escHtml(); por eso se fija la cantidad por archivo. Si este test falla:
// usa html`…` (escapa solo) en vez de plantilla normal, o, si de verdad solo interpolas números o constantes, súbelo aquí.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..', 'js');
const REVISADOS = {
  'modules/plata_comprometida.js': 4,
  'modules/inicio.js': 4,
  'modules/analisis.js': 2,
  'core/diferencial.js': 1,
  'core-state.js': 1, // toast(): el mensaje es HTML por contrato; quien llama escapa nombres con escHtml()
};
function archivos(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? archivos(path.join(dir, e.name)) : e.name.endsWith('.js') ? [path.join(dir, e.name)] : []);
}
test('innerHTML con interpolación sin html``: solo los casos revisados', () => {
  const hallados = {};
  for (const f of archivos(RAIZ)) {
    const rel = path.relative(RAIZ, f).split(path.sep).join('/');
    const n = fs.readFileSync(f, 'utf8').split('\n').filter(l => /innerHTML\s*\+?=\s*`[^`]*\$\{/.test(l) && !/html`/.test(l)).length;
    if (n) hallados[rel.replace(/^core\/core-state/, 'core-state')] = n;
  }
  assert.deepEqual(hallados, REVISADOS);
});
