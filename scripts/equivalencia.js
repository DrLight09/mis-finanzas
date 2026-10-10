'use strict';
// Prueba de equivalencia (plan §6): ingresos, gastos y patrimonio por mes sobre un backup real.
//
//   node scripts/equivalencia.js <backup.json> [salida.json]       calcula y (opcional) guarda la foto
//   node scripts/equivalencia.js --comparar antes.json despues.json  compara dos fotos (sale con código 1 si difieren)
//
// Cubre TODOS los meses entre el primer y el último dato (movimientos, gastos, pagos fijos, mesadas, historial de
// patrimonio), no solo los que tienen movimientos: un mes con solo Mesada o ingresos fijos también cuenta.
// Además informa cuántos movimientos quedaron sin `clase` y avisa si el patrimonio no se pudo calcular.
// El patrimonio incluye interés diario de Nu: dos fotos tomadas en días distintos pueden diferir unos pesos sin que
// haya ningún cambio de código (por eso --comparar usa una tolerancia, ajustable con --tol=<pesos>, por defecto 5000).
const fs = require('fs'), path = require('path');

function comparar(rutaA, rutaB, tolPatrimonio) {
  const A = JSON.parse(fs.readFileSync(rutaA, 'utf8')), B = JSON.parse(fs.readFileSync(rutaB, 'utf8'));
  const difs = [];
  const eq = (a, b) => Math.abs(a - b) < 0.005;
  const meses = new Set([...Object.keys(A.meses || {}), ...Object.keys(B.meses || {})]);
  [...meses].sort().forEach(mes => {
    const a = (A.meses || {})[mes], b = (B.meses || {})[mes];
    if (!a || !b) { difs.push(`${mes}: solo está en ${a ? 'ANTES' : 'DESPUÉS'}`); return; }
    ['mesada', 'fijos', 'entradas', 'total'].forEach(k => { if (!eq(a.ingresos[k], b.ingresos[k])) difs.push(`${mes} ingresos.${k}: ${a.ingresos[k]} → ${b.ingresos[k]}`); });
    ['gv', 'gf', 'total'].forEach(k => { if (!eq(a.gastos[k], b.gastos[k])) difs.push(`${mes} gastos.${k}: ${a.gastos[k]} → ${b.gastos[k]}`); });
  });
  if (typeof A.patrimonio === 'number' && typeof B.patrimonio === 'number' && Math.abs(A.patrimonio - B.patrimonio) > tolPatrimonio)
    difs.push(`patrimonio: ${A.patrimonio} → ${B.patrimonio} (tolerancia ${tolPatrimonio})`);
  else if (typeof A.patrimonio !== 'number' || typeof B.patrimonio !== 'number') difs.push('patrimonio no calculable en una de las fotos: ' + A.patrimonio + ' / ' + B.patrimonio);
  if (!difs.length) { console.log('✅ EQUIVALENTE: ingresos y gastos idénticos mes a mes y patrimonio dentro de la tolerancia.'); return 0; }
  console.log('❌ DIFERENCIAS (' + difs.length + '):'); difs.forEach(d => console.log('  · ' + d)); return 1;
}

function foto(rutaBackup) {
  const { loadApp } = require('../tests/support/load-app');
  const CORE = process.env.MIS_FINANZAS_CORE_DIR || path.join(__dirname, '..', 'js', 'core'); // MIS_FINANZAS_CORE_DIR: calcular con otra copia del código (p. ej. la original, para la foto "antes")
  const files = ['core-state.js', 'periodo.js', 'cuenta-efectos.js', 'nu-calc.js', 'calc-helpers.js'].map(f => path.join(CORE, f));
  const ctx = loadApp(files, { permissive: true });
  Object.keys(ctx.S).forEach(k => delete ctx.S[k]);
  Object.assign(ctx.S, JSON.parse(JSON.stringify(JSON.parse(fs.readFileSync(rutaBackup, 'utf8')))));
  if (typeof ctx.aplicarMigraciones === 'function') ctx.aplicarMigraciones(ctx.S);
  const S = ctx.S;

  const claves = new Set();
  const add = f => { const m = /^(\d{4})-(\d{2})/.exec(f || ''); if (m) claves.add(+m[1] * 12 + (+m[2] - 1)); };
  (S.movimientos || []).forEach(m => add(m.fecha));
  (S.gastosVar || []).forEach(g => add(g.fecha));
  (S.cuentas || []).forEach(c => (c.movimientos || []).forEach(m => add(m.fecha)));
  (S.cajitas || []).forEach(c => (c.historial || []).forEach(m => add(m.fecha)));
  (S.patrimonioHistorial || []).forEach(h => add(h.fecha));
  Object.keys(S.pagosGastosFijos || {}).forEach(k => { const m = /(\d{4}-\d{2})$/.exec(k); if (m) add(m[1]); });
  ['papa', 'mama'].forEach(p => Object.keys(((S.mesadas || {})[p] || {}).pagos || {}).forEach(k => { // clave 'YYYY-<mes 0-11>'
    const m = /^(\d{4})-(\d{1,2})$/.exec(k); if (m) claves.add(+m[1] * 12 + (+m[2]));
  }));
  const out = { meses: {}, sinClase: 0 };
  if (claves.size) {
    const ord = [...claves].sort((a, b) => a - b);
    for (let c = ord[0]; c <= ord[ord.length - 1]; c++) { // rango continuo: ningún mes intermedio se salta
      const mes = Math.floor(c / 12) + '-' + String(c % 12 + 1).padStart(2, '0');
      const i = ctx.Periodo.ingresosDelMes(mes), g = ctx.Periodo.gastosDelMes(mes);
      out.meses[mes] = { ingresos: { mesada: i.mesada, fijos: i.fijos, entradas: i.entradas, total: i.total }, gastos: { gv: g.gvTotal, gf: g.gfTotal, total: g.total } };
    }
  }
  const sin = m => { if (m && typeof m === 'object' && !m.clase && !['salida', 'egreso'].includes(m.tipo)) out.sinClase++; };
  (S.movimientos || []).forEach(sin); (S.gastosVar || []).forEach(sin);
  (S.cuentas || []).forEach(c => (c.movimientos || []).forEach(sin)); (S.cajitas || []).forEach(c => (c.historial || []).forEach(sin));
  try { out.patrimonio = ctx.calcPatrimonioTotal(); } catch (e) { out.patrimonio = 'ERR ' + e.message; }
  if (typeof out.patrimonio !== 'number' || !Number.isFinite(out.patrimonio)) console.warn('⚠️  El patrimonio no se pudo calcular (' + out.patrimonio + '): no se podrá comparar.');
  return out;
}

const args = process.argv.slice(2);
if (args[0] === '--comparar') {
  const tol = Number((args.find(a => a.startsWith('--tol=')) || '--tol=5000').split('=')[1]);
  process.exit(comparar(args[1], args[2], tol));
} else if (args[0]) {
  const out = foto(args[0]);
  if (args[1]) fs.writeFileSync(args[1], JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 1));
} else { console.error('Uso: node scripts/equivalencia.js <backup.json> [salida.json]  |  --comparar antes.json despues.json [--tol=5000]'); process.exit(2); }
