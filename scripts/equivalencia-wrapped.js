'use strict';
// Verifica el Paso 5 de js/modules/wrapped.js: ejecuta _wrappedBuildSlides con el archivo ORIGINAL (antes de convertir) y con el
// actual, sobre los mismos datos, y exige (1) el mismo mood de cada slide y (2) el mismo estilo efectivo de cada elemento.
// El CSS de Wrapped vive dentro del propio archivo (un <style> inyectado): se extrae y se suma a css/styles.css.
// Uso:  node scripts/equivalencia-wrapped.js <wrapped.js original> [styles.css original] [wrapped.js nuevo] [styles.css nuevo]
const fs = require('fs'), path = require('path'), os = require('os');
const { loadApp } = require('../tests/support/load-app');
const { compararHtml } = require('./equivalencia-estilos');
const RAIZ = path.join(__dirname, '..');
const core = f => path.join(RAIZ, 'js', 'core', f), modulo = f => path.join(RAIZ, 'js', 'modules', f);
const [oJs, , nJs = modulo('wrapped.js'), nCss = path.join(RAIZ, 'css', 'styles.css')] = process.argv.slice(2);
if (!oJs) { console.error('falta el wrapped.js original'); process.exit(2); }
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wrapped-'));

// Copia de prueba con _wrappedBuildSlides expuesto (el archivo real no se toca)
function preparar(js, nombre) {
  const src = fs.readFileSync(js, 'utf8'), marca = '  _wrappedFraseDelAnio\n};';
  if (!src.includes(marca)) throw new Error('no encuentro el final de _wrappedInternals en ' + js);
  const dst = path.join(TMP, nombre); fs.writeFileSync(dst, src.replace(marca, '  _wrappedFraseDelAnio, _wrappedBuildSlides\n};')); return dst;
}
function cssInyectado(js) { // texto del template literal que _wrappedInyectarEstilos pone en el <style> (no lleva ${})
  const m = /style\.textContent = `([\s\S]*?)`;/.exec(fs.readFileSync(js, 'utf8')); if (!m) throw new Error('no encuentro el CSS inyectado en ' + js);
  if (m[1].includes('${')) throw new Error('el CSS inyectado lleva interpolaciones: evaluarlo');
  return m[1];
}

const BASE = [core('core-state.js'), core('periodo.js'), core('nu-calc.js'), core('calc-helpers.js'), core('cuenta-efectos.js'), modulo('nu.js'), modulo('cuentas.js'), modulo('inicio.js'), modulo('analisis.js'), core('wrapped-gate.js')];
const mes = i => `2026-${String(i + 1).padStart(2, '0')}`;
function estado() {
  const S = {
    cuentas: [{ id: 'nequi', tipo: 'nequi', saldo: 0 }, { id: 'efectivo', tipo: 'efectivo', saldo: 0 }],
    cajitas: [], deudores: [], misDeudas: [], ingresosFijos: [], gastosFijos: [], gastosVar: [], movimientos: [], patrimonioHistorial: [], tarjetasCredito: [], encargos: [], modulos: {},
    alcancia: { historial: [] }, spotify: { personas: [], historial: [] },
  };
  let id = 0;
  for (let i = 0; i < 10; i++) {
    const ing = [3000000, 2500000, 2000000, 2800000, 1500000, 2600000, 3200000, 2000000, 2000000, 2400000][i];
    S.movimientos.push({ id: 'm' + id++, tipo: 'entrada', clase: 'ingreso', monto: ing, fecha: mes(i) + '-03', fuente: 'nequi', desc: 'sueldo' });
    const gastos = [1200000, 2600000, 2000000, 900000, 2400000, 1000000, 1100000, 2300000, 1500000, 2500000][i];
    const cats = ['Comida', 'Transporte', 'Ocio', 'Salud', 'Hogar'];
    for (let k = 0; k < 6; k++) S.gastosVar.push({ id: 'g' + id++, fecha: mes(i) + '-1' + k, monto: Math.round(gastos / 6) + (k === 5 && i === 7 ? 900000 : 0), cat: cats[k % 5], desc: k === 5 && i === 7 ? 'Zapatos raros' : 'gasto ' + cats[k % 5], fuente: 'nequi', clase: 'gasto' });
    S.patrimonioHistorial.push({ fecha: mes(i) + '-01', valor: 8000000 + i * 400000 - (i === 9 ? 900000 : 0), montoBase: 0 }, { fecha: mes(i) + '-20', valor: 8200000 + i * 400000 - (i === 9 ? 900000 : 0), montoBase: 0 });
  }
  return S;
}
const hoyFijo = '2026-10-21';
function render(jsPath, S, pre) {
  const app = loadApp([...BASE, jsPath], { permissive: true });
  Object.assign(app.S, JSON.parse(JSON.stringify(S)));
  app.hoy = () => hoyFijo; app._wrappedAnioObjetivo = () => '2026'; app.window._wrappedAnioObjetivo = () => '2026';
  if (pre) pre(app);
  const logs = []; const w = console.warn; console.warn = (...a) => logs.push(a.join(' '));
  let slides; try { slides = app._wrappedInternals._wrappedBuildSlides(app.S, x => '$' + Math.round(x)); } finally { console.warn = w; }
  return { slides: Array.from(slides, s => ({ id: s.id, mood: s.mood, html: s.html })), logs };
}
// Escenarios: cada uno enciende ramas distintas (los insights compiten por un cupo, así que se prueban por separado)
const mov = (tipo, monto, fecha, extra = {}) => ({ id: 'x' + Math.random(), tipo, monto, fecha, ...extra });
const ESCENARIOS = [
  ['base', S => S, null],
  ['racha de alcancía', S => { S.alcancia.historial = [{ id: 'a1', fecha: '2026-09-01', monto: 10000 }, { id: 'a2', fecha: '2026-10-01', monto: 10000 }]; return S; }, app => { app._alcRachaAhorro = () => 5; }],
  ['préstamo devuelto rápido', S => { S.deudores = [{ id: 'd1', nombre: 'Ana', movimientos: [mov('prestamo', 500000, '2026-03-01'), mov('abono', 500000, '2026-03-11')] }, { id: 'd2', nombre: 'Luis', movimientos: [mov('prestamo', 200000, '2026-05-01')] }]; return S; }, null],
  ['mes con balance exacto 0', S => { const may = S.gastosVar.filter(g => g.fecha.startsWith('2026-05')).reduce((t, g) => t + g.monto, 0); S.movimientos.filter(m => m.fecha.startsWith('2026-05')).forEach(m => { m.monto = may; }); return S; }, null],
  ['un gasto raro que no es el mayor', S => { S.gastosVar.push({ id: 'graro', fecha: '2026-06-20', monto: 700000, cat: 'Ocio', desc: 'Concierto', fuente: 'nequi', clase: 'gasto' }); return S; }, null],
];
const oPrep = preparar(oJs, 'wrapped-antes.js'), nPrep = preparar(nJs, 'wrapped-despues.js');
const cssNuevo = path.join(TMP, 'css-despues.css');
fs.writeFileSync(cssNuevo, fs.readFileSync(nCss, 'utf8') + '\n' + cssInyectado(nJs));
const NUEVAS = ['wrapped-svg-block', 'wrapped-hit', 'wrapped-mes-dot-ok', 'wrapped-mes-dot-mal', 'wrapped-mes-dot-cero', 'wrapped-sub-sep', 'wrapped-icono-sep', 'wrapped-c-text', 'c-green', 'c-red', 'c-amber', 'c-purple', 'c-blue'];
module.exports = { render, oPrep, nPrep, cssNuevo, estado };
if (require.main === module) {
  let fallos = 0, total = 0, media = 0; const vistas = new Set();
  for (const [nombre, mod, pre] of ESCENARIOS) {
    const S0 = mod(estado());
    const A = render(oPrep, S0, pre), B = render(nPrep, S0, pre);
    console.log(`\n── ${nombre}: ${B.slides.map(s => s.id).join(', ')}`);
    if (B.logs.length) { console.log('   avisos del código nuevo:', B.logs); fallos++; }
    if (A.slides.map(s => s.id).join() !== B.slides.map(s => s.id).join()) { console.log('FALLA: distintos slides'); fallos++; continue; }
    A.slides.forEach((a, i) => {
      const b = B.slides[i]; total++;
      NUEVAS.forEach(c => { if (new RegExp('class="[^"]*\\b' + c + '\\b').test(b.html)) vistas.add(c); });
      if (a.mood !== b.mood) { console.log(`FALLA mood ${a.id}: ${a.mood} vs ${b.mood}`); fallos++; }
      const r = compararHtml(a.html, b.html, cssNuevo);
      media += r.avisos.filter(x => x.includes('@media')).length;
      const otros = r.avisos.filter(x => !x.includes('@media'));
      if (r.diferencias.length || otros.length) { fallos++; console.log('FALLA', a.id, JSON.stringify(r.diferencias.slice(0, 3), null, 1), otros); }
    });
  }
  console.log(`\n${total} slides comparados, ${fallos} con diferencias (avisos @media: ${media}, las mismas reglas casan antes y después)`);
  const faltan = NUEVAS.filter(c => !vistas.has(c));
  console.log('clases nuevas ejercitadas:', [...vistas].join(', ')); console.log('SIN ejercitar (comparar por pares a mano):', faltan.join(', ') || '—');
  process.exit(fallos ? 1 : 0);
}
