'use strict';
// Verifica el Paso 5 de js/modules/inicio.js: renderiza las tarjetas de Inicio con el archivo ORIGINAL (antes de convertir)
// y con el actual, sobre los mismos datos, y exige el mismo estilo efectivo en cada elemento (scripts/equivalencia-estilos.js).
// Uso:  node scripts/equivalencia-inicio.js <inicio.js original> <styles.css original> [inicio.js nuevo] [styles.css nuevo]
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const { compararHtml } = require('./equivalencia-estilos');
const raiz = path.join(__dirname, '..');
const [oJs, oCss, nJs = path.join(raiz, 'js/modules/inicio.js'), nCss = path.join(raiz, 'css/styles.css')] = process.argv.slice(2);
if (!oJs || !oCss) { console.error('faltan argumentos'); process.exit(2); }
const htmlTag = fs.readFileSync(path.join(raiz, 'js/core/html-tag.js'), 'utf8');

function montar(jsPath, S, extra = {}) {
  const dom = new JSDOM(`<body><div id="s-attn-section"><div class="sec-title">x</div></div><div id="s-attn-list"></div>
    <div id="health-score-card" style="min-height:148px"></div><div id="proyeccion-card"></div></body>`, { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  w.S = S; w.hoy = () => '2026-10-21'; w.fmt = x => '$' + Math.round(x);
  w.Deudas = { lista: () => [] }; w._fechaSafe = d => new Date(d + 'T00:00:00');
  w.tcCupoUsadoPct = tc => tc._pct; w.calcPatrimonioTotal = () => extra.patrimonio ?? 5000000; w.calcDeudaTcPropia = () => extra.deudaTc ?? 0;
  w.escHtml = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); w.eval(htmlTag); w.eval(fs.readFileSync(jsPath, 'utf8'));
  if (extra.score !== undefined) w.calcHealthScore = () => ({ score: extra.score, tips: extra.tips || [] });
  return w;
}
const hist = dias => Array.from({ length: dias }, (_, i) => ({ fecha: new Date(Date.UTC(2026, 9, 21 - (dias - 1 - i))).toISOString().slice(0, 10), valor: 5000000 + i * (extra_paso), montoBase: 0 }));
let extra_paso = 20000;

let fallos = 0, n = 0;
function comparar(nombre, a, b) {
  n++;
  const r = compararHtml(a, b, nCss);
  const mal = r.diferencias.length;
  if (mal) { fallos++; console.log('FALLA', nombre, JSON.stringify(r.diferencias.slice(0, 4), null, 1)); }
  if (r.avisos.length) console.log('aviso', nombre, JSON.stringify(r.avisos));
  else if (!mal) console.log('ok   ', nombre, `(${r.elementos} elementos)`);
}
function escenario(nombre, S, extra, fn) {
  const A = montar(oJs, JSON.parse(JSON.stringify(S)), extra), B = montar(nJs, JSON.parse(JSON.stringify(S)), extra);
  const salidas = [A, B].map(w => fn(w));
  salidas.forEach((o, i) => { if (!o) throw new Error(nombre + ': sin salida'); });
  comparar(nombre, salidas[0], salidas[1]);
}
const tarjetas = (...t) => ({ tarjetasCredito: t, spotify: { personas: [] }, modulos: {}, patrimonioHistorial: [], cajitas: [], encargos: [] });

// Necesita atención: solo ámbar, ámbar + rojo
for (const [nom, tcs] of [['atención ámbar', [{ id: 1, nombre: 'Visa', cupo: 100, deuda: 90, _pct: 90 }]],
  ['atención roja', [{ id: 1, nombre: 'Visa', cupo: 100, deuda: 100, _pct: 100 }, { id: 2, nombre: 'MC', cupo: 100, deuda: 90, _pct: 90 }]]])
  for (const abierto of ['1', '0']) escenario(`${nom} (abierto=${abierto})`, tarjetas(...tcs), {}, w => {
    w.localStorage.setItem('attn-open', abierto); w.localStorage.setItem('attn-fingerprint', 'x');
    w.renderAttencion(); return w.document.getElementById('s-attn-section').outerHTML + w.document.getElementById('s-attn-list').outerHTML;
  });

// Salud financiera: >=75, 50-74, <50, 100 (círculo lleno), sin datos
const tipsMix = ['¡Excelente ritmo!', 'Gastas demasiado en X', 'Considera poner una meta'];
for (const sc of [100, 80, 60, 30]) escenario(`salud score=${sc}`, tarjetas(), { score: sc, tips: tipsMix }, w => { w.renderHealthScore(); return w.document.getElementById('health-score-card').outerHTML; });
escenario('salud sin datos', tarjetas(), {}, w => { w.calcHealthScore = () => null; w.renderHealthScore(); return w.document.getElementById('health-score-card').outerHTML; });

// Proyección: sin patrimonio, historial insuficiente, preliminar, normal, estable, tendencia negativa, con deuda TC
const casos = [['sin patrimonio', 0, 0, 0], ['historial insuficiente', 3, 20000, 0], ['preliminar', 15, 20000, 150000], ['normal', 40, 20000, 0], ['estable', 70, 20000, 300000], ['negativa', 70, -30000, 0]];
for (const [nom, dias, paso, deuda] of casos) {
  const S = tarjetas(); extra_paso = paso; S.patrimonioHistorial = nom === 'sin patrimonio' ? [] : hist(dias);
  escenario(`proyección ${nom}`, S, { patrimonio: nom === 'sin patrimonio' ? 0 : 5000000, deudaTc: deuda }, w => {
    w.renderProyeccion(); return w.document.getElementById('proyeccion-card').outerHTML;
  });
  if (!['sin patrimonio', 'historial insuficiente'].includes(nom)) {
    // tooltips: tocar la cabecera y cada tarjeta, y comparar el tooltip que aparece
    for (const sel of ['#_proy-header', '[data-proy-key="3m"]', '[data-proy-key="12m"]'])
      escenario(`tooltip ${nom} ${sel}`, S, { patrimonio: 5000000 }, w => {
        w.renderProyeccion(); const el = w.document.querySelector(sel);
        el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
        const tt = w.document.getElementById('_proy-tt'); return '<div id="x">' + tt.innerHTML + '</div>';
      });
  }
}
console.log(`\n${n} comparaciones, ${fallos} con diferencias`);
process.exit(fallos ? 1 : 0);
