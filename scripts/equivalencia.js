'use strict';
// Prueba de equivalencia (plan §6): ingresos, gastos y patrimonio por mes sobre un backup real.
// Uso: node scripts/equivalencia.js <backup.json> [salida.json]
const fs = require('fs'), path = require('path');
const { loadApp } = require('../tests/support/load-app');
const CORE = path.join(__dirname, '..', 'js', 'core');
const MOD = path.join(__dirname, '..', 'js', 'modules');
const files = ['core-state.js','periodo.js','cuenta-efectos.js','nu-calc.js','calc-helpers.js'].map(f => path.join(CORE, f));
const backup = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const ctx = loadApp(files, { permissive: true });
Object.keys(ctx.S).forEach(k => delete ctx.S[k]);
Object.assign(ctx.S, JSON.parse(JSON.stringify(backup)));
if (typeof ctx.aplicarMigraciones === 'function') ctx.aplicarMigraciones(ctx.S);
const meses = new Set();
const add = f => { const m = /^(\d{4}-\d{2})/.exec(f || ''); if (m) meses.add(m[1]); };
(ctx.S.movimientos||[]).forEach(m => add(m.fecha));
(ctx.S.gastosVar||[]).forEach(g => add(g.fecha));
(ctx.S.cuentas||[]).forEach(c => (c.movimientos||[]).forEach(m => add(m.fecha)));
(ctx.S.cajitas||[]).forEach(c => (c.historial||[]).forEach(m => add(m.fecha)));
Object.keys(ctx.S.pagosGastosFijos||{}).forEach(k => { const m = /(\d{4}-\d{2})$/.exec(k); if (m) meses.add(m[1]); });
const out = { meses: {} };
[...meses].sort().forEach(mes => {
  const i = ctx.Periodo.ingresosDelMes(mes), g = ctx.Periodo.gastosDelMes(mes);
  out.meses[mes] = { ingresos: { mesada: i.mesada, fijos: i.fijos, entradas: i.entradas, total: i.total }, gastos: { gv: g.gvTotal, gf: g.gfTotal, total: g.total } };
});
try { out.patrimonio = ctx.calcPatrimonioTotal(); } catch (e) { out.patrimonio = 'ERR ' + e.message; }
if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 1));
