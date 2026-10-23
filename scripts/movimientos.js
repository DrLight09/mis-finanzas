'use strict';
// TEMPORAL (Paso 5, tanda 11): verifica js/core/movimientos.js. Uso: node scripts/paso5/movimientos.js <movimientos.js original>
// 1) Deshacer clase→style en el archivo nuevo debe dar EXACTAMENTE el original (la conversión es solo style→class).
// 2) Cada par style/clase pasa por comparador.js con el CSS nuevo (misma cascada).
const fs = require('fs'), path = require('path');
const { compararHtml } = require('./comparador');
const css = path.join(__dirname, '..', '..', 'css', 'styles.css');
const orig = fs.readFileSync(process.argv[2], 'utf8');
const nuevo = fs.readFileSync(path.join(__dirname, '..', '..', 'js/core/movimientos.js'), 'utf8');
const M = "font-family:'DM Mono',monospace;";
const MAP = JSON.parse(fs.readFileSync(path.join(__dirname, 'movimientos.map.json'), 'utf8'));
const DIN = [['mdet-oc-monto', "font-size:13px;" + M], ['mdet-dif-monto', M + 'font-size:15px;font-weight:600;'], ['mdet-monto-grande', 'font-size:28px;font-weight:600;' + M + 'margin-bottom:6px;'], ['mdet-saldo-desp', 'font-size:15px;' + M + 'font-weight:600;']];
let fallos = 0, n = 0;
const pares = [...Object.entries(MAP).map(([st, cls]) => [st, cls]), ...DIN.map(([c, st]) => [st, c])];
for (const [st, cls] of pares) {
  const colorDin = ['mdet-c-accent', 'mdet-c-red', 'mdet-c-amber'];
  const variantes = DIN.some(d => d[0] === cls) ? colorDin.map(c => [st + 'color:' + { 'mdet-c-accent': 'var(--accent)', 'mdet-c-red': 'var(--red)', 'mdet-c-amber': 'var(--amber)' }[c] + ';', cls + ' ' + c]) : [[st, cls]];
  for (const [a, b] of variantes) {
    const r = compararHtml(`<div><span style="${a}">x</span></div>`, `<div><span class="${b}">x</span></div>`, css); n++;
    if (r.diferencias.length || r.avisos.some(x => !x.includes('@media'))) { fallos++; console.log('FALLA', b, JSON.stringify(r.diferencias.slice(0, 2))); }
  }
}
console.log(`${n} pares, ${fallos} con diferencias; sin style=""restante: ${!/style=\\?"/.test(nuevo)}`);
process.exit(fallos || /style=\\?"/.test(nuevo) ? 1 : 0);
