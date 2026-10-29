'use strict';
// Conciliación: ¿lo que cambió el patrimonio lo explican los ingresos, gastos y rendimientos que calcula la app?
//   node scripts/conciliacion.js backup.json [--umbral=30000]
// Para cada mes compara  Δpatrimonio − montoBase  contra  ingresos + mesada − gastos − retiros − fijos (+ rendimientos).
// Lo que queda "sin explicar" son movimientos que tocan el patrimonio sin estar clasificados (así se detectó que un préstamo
// sin cuenta de $500.000 inflaba la proyección). Es una guía, no una igualdad exacta: el patrimonio se fotografía por día de
// guardado y los movimientos por su fecha (ver analisis-financiero.md §5), y hay intereses de Nu y de TC.
const fs = require('fs'), path = require('path');
const { loadApp } = require(require('path').join(__dirname, '..', require('fs').existsSync(require('path').join(__dirname, '..', 'tests')) ? 'tests' : 'test', 'support', 'load-app'));
const CORE = process.env.MIS_FINANZAS_CORE_DIR || path.join(__dirname, '..', 'js', 'core');
const ruta = process.argv[2];
if (!ruta) { console.error('Uso: node scripts/conciliacion.js backup.json [--umbral=30000]'); process.exit(2); }
const umbral = Number((process.argv.find(a => a.startsWith('--umbral=')) || '--umbral=30000').split('=')[1]);
const ctx = loadApp(['core-state.js', 'periodo.js', 'cuenta-efectos.js', 'nu-calc.js', 'calc-helpers.js'].map(f => path.join(CORE, f)), { permissive: true });
Object.keys(ctx.S).forEach(k => delete ctx.S[k]);
Object.assign(ctx.S, JSON.parse(fs.readFileSync(ruta, 'utf8')));
const S = ctx.S;
if (typeof ctx.aplicarMigraciones === 'function') ctx.aplicarMigraciones(S); // como load(): primero las migraciones
if (typeof ctx.recalcularMontoBaseHistorial === 'function' && (S.patrimonioHistorial || []).length) ctx.recalcularMontoBaseHistorial(); // lo mismo que hace load() en la app
const H = (S.patrimonioHistorial || []).slice().sort((a, b) => a.fecha < b.fecha ? -1 : 1);
if (H.length < 2) { console.log('Historial de patrimonio insuficiente.'); process.exit(0); }
const mesDe = f => f.slice(0, 7);
const meses = [...new Set(H.map(h => mesDe(h.fecha)))];
const fmt = n => (n < 0 ? '-' : ' ') + Math.abs(Math.round(n)).toLocaleString('es-CO').padStart(11);
console.log('mes      Δpatrimonio   − base    explicado  sin explicar  rendimientos');
meses.forEach((mes, i) => {
  const prev = i === 0 ? H[0] : H.filter(h => mesDe(h.fecha) === meses[i - 1]).pop();
  const fin = H.filter(h => mesDe(h.fecha) === mes).pop();
  const d0 = prev.fecha, d1 = fin.fecha, en = f => f > d0 && f <= d1;
  const base = H.filter(h => en(h.fecha)).reduce((a, h) => a + (h.montoBase || 0), 0);
  const ing = ctx.entradasIngresoReal().filter(m => en(m.fecha)).reduce((a, m) => a + (m.monto || 0), 0)
    + ctx.Periodo.spotifyEntradas().filter(e => en(e.fecha)).reduce((a, e) => a + e.monto, 0)        // cuotas de Spotify cobradas (2026-10-28)
    + ctx.Periodo.ingresosFijosEntradas().filter(e => en(e.fecha)).reduce((a, e) => a + e.monto, 0); // cobros de ingresos fijos
  let mesada = 0; ['papa', 'mama'].forEach(p => Object.values(((S.mesadas || {})[p] || {}).pagos || {}).forEach(x => { if (x && en(x.fecha || '')) mesada += x.monto || 0; }));
  const gv = (S.gastosVar || []).filter(g => en(g.fecha) && !ctx._esGastoVarNoReal(g)).reduce((a, g) => a + (g.monto || 0), 0);
  const ret = ctx.Periodo.retirosManuales().filter(r => en(r.fecha)).reduce((a, r) => a + r.monto, 0);
  let gf = 0; Object.values(S.pagosGastosFijos || {}).forEach(p => { if (p && en(p.fecha || '')) gf += p.monto || 0; });
  const rend = ctx.Periodo.rendimientosDelMes(mes).total;
  const explicado = ing + mesada - gv - ret - gf + rend;
  const delta = fin.valor - prev.valor;
  const sin = delta - base - explicado;
  console.log(mes.padEnd(8), fmt(delta), fmt(base), fmt(explicado), fmt(sin), fmt(rend), Math.abs(sin) > umbral ? ' ⚠️' : '');
});
console.log('\n⚠️ = más de ' + umbral.toLocaleString('es-CO') + ' sin explicar: revisar movimientos de ese mes que cambien el patrimonio sin ser ingreso ni gasto.');
