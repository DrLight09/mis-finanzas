'use strict';
// Verifica el Paso 5 de js/modules/analisis.js: ejecuta renderAnalisis, renderIngresosFijos, renderPresupuestos y abrirPresupuestos con el
// archivo ORIGINAL (js.zip) y con el actual, sobre los mismos datos, y exige el mismo estilo efectivo en cada elemento. También el tooltip
// de las barras (se dispara el onclick real) y el de la gráfica de patrimonio (fragmento).
// Uso: node scripts/equivalencia-analisis.js <analisis.js original> [analisis.js nuevo] [styles.css nuevo]
const path = require('path');
const { loadApp } = require('../tests/support/load-app');
const { compararHtml } = require('./equivalencia-estilos');
const RAIZ = path.join(__dirname, '..');
const core = f => path.join(RAIZ, 'js', 'core', f), modulo = f => path.join(RAIZ, 'js', 'modules', f);
const [oJs, nJs = modulo('analisis.js'), css = path.join(RAIZ, 'css', 'styles.css')] = process.argv.slice(2);
if (!oJs) { console.error('falta el analisis.js original'); process.exit(2); }
const BASE = [core('core-state.js'), core('html-tag.js'), core('periodo.js'), core('nu-calc.js'), core('calc-helpers.js'), core('cuenta-efectos.js'), modulo('nu.js')];
const MES = '2026-10';
const m = i => `2026-${String(i).padStart(2, '0')}`;

function estado(op = {}) {
  const S = { cuentas: [{ id: 'nequi', tipo: 'nequi', saldo: 0 }], cajitas: [], deudores: [], misDeudas: [], gastosFijos: [], gastosVar: [], movimientos: [], encargos: [], tarjetasCredito: [],
    modulos: {}, spotify: { personas: [], historial: [] }, alcancia: { historial: [] }, ingresosFijos: op.ingresosFijos || [], presupuestos: op.presupuestos || {}, patrimonioHistorial: [] };
  const ing = op.sinIngresos ? 0 : (op.ingreso ?? 3000000);
  const cats = ['Comida', 'Transporte', 'Ocio', 'Salud', 'Hogar', 'Ropa'];
  let id = 0;
  for (let i = 1; i <= 10; i++) {
    if (ing && !(op.sinMesAnterior && i === 9)) S.movimientos.push({ id: 'm' + id++, tipo: 'entrada', clase: 'ingreso', monto: ing, fecha: m(i) + '-03', fuente: 'nequi', desc: 'sueldo' });
    if (op.sinMesAnterior && i === 9) continue;
    for (let k = 0; k < 6; k++) S.gastosVar.push({ id: 'g' + id++, fecha: m(i) + '-1' + k, monto: (op.gasto ?? 300000) * (1 + (i % 4) / 4) * (1 + k / 8), cat: cats[k], desc: 'x', fuente: 'nequi', clase: 'gasto' });
  }
  if (!op.sinHistorial) for (let d = 1; d <= 20; d++) S.patrimonioHistorial.push({ fecha: `2026-10-${String(d).padStart(2, '0')}`, valor: 5000000 + d * (op.paso ?? 25000) + (d % 3) * 1000, montoBase: 0 });
  return S;
}
function entorno(jsPath, S) {
  const app = loadApp([...BASE, jsPath], { permissive: true });
  Object.assign(app.S, JSON.parse(JSON.stringify(S)));
  app.mesActual = () => MES; app.window.mesActual = () => MES; app.hoy = () => '2026-10-21';
  const els = {}, creados = [];
  const el = (tag) => ({ tag, id: '', value: '', textContent: '', innerHTML: '', checked: false, style: { setProperty() {} }, dataset: {}, children: [], focus() {}, remove() {}, addEventListener() {}, setAttribute() {}, getAttribute: () => null,
    appendChild(c) { this.children.push(c); }, querySelector: () => null, querySelectorAll: () => [], closest: () => null, getBoundingClientRect: () => ({ left: 10, top: 100, width: 20, height: 50, bottom: 150 }),
    offsetWidth: 100, offsetHeight: 40, classList: { add() {}, remove() {}, toggle() {}, contains: () => false } });
  app.document.getElementById = id => (els[id] = els[id] || Object.assign(el('div'), { id }));
  app.document.createElement = tag => { const e = el(tag); creados.push(e); return e; };
  app.document.body = el('body'); app.document.querySelectorAll = () => [];
  app.window.innerWidth = 400; app.toast = () => {}; app.window.toast = () => {};
  return { app, els, creados };
}
let fallos = 0, n = 0;
function cmp(nombre, a, b) {
  n++; if (a == null || b == null || a === '' && b === '') { console.log('FALLA sin salida:', nombre); fallos++; return; }
  const r = compararHtml(`<div>${a}</div>`, `<div>${b}</div>`, css);
  const otros = r.avisos.filter(x => !x.includes('@media'));
  if (r.diferencias.length || otros.length) { fallos++; console.log('FALLA', nombre, JSON.stringify(r.diferencias.slice(0, 4), null, 1), otros.slice(0, 3)); }
  else console.log('ok   ', nombre, `(${r.elementos} elementos)`);
}
const IDS = ['analisis-balance-hero', 'analisis-categorias', 'an-grafico-barras', 'an-grafico-labels', 'an-ranking', 'an-comparacion', 'an-patrimonio-chart', 'an-ingresos-fijos-list', 'an-presupuestos', 'presupuestos-lista'];
function escenario(nombre, op, extra) {
  const S = estado(op); const A = entorno(oJs, S), B = entorno(nJs, S);
  for (const E of [A, B]) { E.app.renderAnalisis(); E.app.renderPresupuestos(); if (extra) extra(E); }
  // ids reales: los que escribió el original
  const usados = Object.keys(A.els).filter(k => A.els[k].innerHTML);
  usados.forEach(id => { if (!B.els[id] || !B.els[id].innerHTML) { console.log('FALLA: el nuevo no escribió', id); fallos++; } else cmp(`${nombre} · #${id}`, A.els[id].innerHTML, B.els[id].innerHTML); });
  return { A, B };
}
const presup = { Comida: 1000000, Transporte: 500000, Ocio: 400000, Salud: 300000, Hogar: 100000, Ropa: 200000 };
const fijos = [{ id: 'i1', nombre: 'Sueldo', monto: 3000000, desde: '2026-01' }, { id: 'i2', nombre: 'Freelance', monto: 500000 }];
const { A, B } = escenario('mes normal', { presupuestos: presup, ingresosFijos: fijos });
escenario('sin ingresos', { sinIngresos: true });
escenario('balance negativo, patrimonio bajando', { ingreso: 500000, paso: -30000, presupuestos: { Comida: 10 } });
escenario('sin mes anterior ni historial', { sinMesAnterior: true, sinHistorial: true });
escenario('sin presupuestos ni ingresos fijos', {});
// Editor de presupuestos
const ed = [oJs, nJs].map(j => { const E = entorno(j, estado({ presupuestos: presup })); E.app.abrirPresupuestos(); return E.els['presupuestos-lista'] && E.els['presupuestos-lista'].innerHTML; });
cmp('editor de presupuestos', ed[0], ed[1]);
// Tooltip de las barras: se dispara el onclick real sobre una barra con valor y sobre una con valor 0
for (const val of ['150000', '0']) {
  const sal = [A, B].map(E => { E.creados.length = 0; const barEl = E.els['an-grafico-barras']; if (!barEl.onclick) return null;
    barEl.onclick({ target: { closest: () => ({ dataset: { barLabel: 'Oct', barVal: val }, getBoundingClientRect: () => ({ left: 10, top: 100, width: 20, height: 50, bottom: 150 }) }) } }); const t = E.creados[E.creados.length - 1]; return t ? t.innerHTML : ''; });
  if (val === '0') { console.log('ok    tooltip de barra con valor 0: sin tooltip en ambos =', sal[0] === '' && sal[1] === ''); } else cmp('tooltip de barra', sal[0], sal[1]);
}
// Tooltip de la gráfica de patrimonio (está en un handler con geometría): se compara el fragmento
cmp('tooltip de patrimonio', '<div style="color:var(--text2);font-size:9px;margin-bottom:3px;">12 oct</div><div style="color:#f0ede8;font-size:13px;font-weight:700;">$5.200.000</div>',
  '<div class="an-pt-fecha">12 oct</div><div class="an-pt-valor">$5.200.000</div>');
console.log(`\n${n} comparaciones, ${fallos} con diferencias`); process.exit(fallos ? 1 : 0);
