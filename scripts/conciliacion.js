'use strict';
// Conciliación: ¿lo que cambió el patrimonio lo explican los ingresos, gastos y rendimientos que calcula la app?
//   node scripts/conciliacion.js backup.json [--umbral=30000]
// Para cada mes compara  Δpatrimonio − montoBase  contra  ingresos + mesada − gastos − retiros − fijos (+ rendimientos), con Periodo.conciliar.
// Lo que queda "sin explicar" son movimientos que tocan el patrimonio sin estar clasificados (así se detectó que un préstamo
// sin cuenta de $500.000 inflaba la proyección). Es una guía, no una igualdad exacta: el patrimonio se fotografía por día de
// guardado y los movimientos por su fecha (ver analisis-financiero.md §5), y hay intereses de Nu y de TC.
const fs = require('fs'), path = require('path');
const { loadApp } = require(require('path').join(__dirname, '..', require('fs').existsSync(require('path').join(__dirname, '..', 'tests')) ? 'tests' : 'test', 'support', 'load-app'));
const CORE = process.env.MIS_FINANZAS_CORE_DIR || path.join(__dirname, '..', 'js', 'core');
const ruta = process.argv[2];
if (!ruta) { console.error('Uso: node scripts/conciliacion.js backup.json [--umbral=30000]'); process.exit(2); }
const umbral = Number((process.argv.find(a => a.startsWith('--umbral=')) || '--umbral=30000').split('=')[1]);
const ctx = loadApp(['el núcleo', 'periodo.js', 'cuenta-efectos.js', 'nu-calc.js', 'calc-helpers.js'].map(f => path.join(CORE, f)), { permissive: true });
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
// La cuenta la hace Periodo.conciliar (la misma de la tarjeta «¿Por qué cambió tu patrimonio?» de Análisis): una sola definición.
meses.forEach(mes => {
  const c = ctx.Periodo.conciliar(mes);
  if (!c) { console.log(mes.padEnd(8), '  (sin una foto anterior para comparar)'); return; }
  console.log(mes.padEnd(8), fmt(c.delta), fmt(c.base), fmt(c.explicado), fmt(c.sinExplicar), fmt(c.rendimientos), Math.abs(c.sinExplicar) > umbral ? ' ⚠️' : '');
});
console.log('\n⚠️ = más de ' + umbral.toLocaleString('es-CO') + ' sin explicar: revisar movimientos de ese mes que cambien el patrimonio sin ser ingreso ni gasto.');
