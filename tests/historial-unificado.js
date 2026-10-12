'use strict';
// Foto de comportamiento para comparar ANTES/DESPUÉS de unificar el historial de cuentas (migración v6):
//   MIS_FINANZAS_ROOT=<raíz> node tests/historial-unificado.js backup.json salida.json
//   node tests/historial-unificado.js --comparar antes.json despues.json
// Foto = filas del historial de cada cuenta (getMovimientosCuenta), ingresos/gastos por mes (Periodo), lista de ingresos reales
// (entradasIngresoReal), patrimonio y estado del libro (Libro.verificar). Requiere: npm i jsdom.
const fs = require('fs'), path = require('path'), vm = require('vm');

function foto(rutaBackup) {
  const { JSDOM } = require('jsdom');
  const ROOT = process.env.MIS_FINANZAS_ROOT || process.cwd();
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://localhost/', runScripts: 'outside-only' });
  const w = dom.window, ctx = dom.getInternalVMContext();
  w.HTMLCanvasElement.prototype.getContext = () => ({ measureText: () => ({ width: 10 }), font: '' });
  vm.runInContext("window.Events={on(){},attr(){},registerAll(){}};function crearSplitWidget(){} window.openSheet=window.closeSheet=function(){};", ctx);
  ['core/core-state.js', 'core/cuenta-efectos.js', 'core/periodo.js', 'core/nu-calc.js', 'core/libro.js', 'core/diferencial.js', 'modules/cuentas.js']
    .filter(f => fs.existsSync(path.join(ROOT, 'js', f))).forEach(f => { try { vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'), ctx); } catch (e) { /* arranque de DOM: se ignora */ } });
  vm.runInContext("window.Deudas={lista:k=>k==='favor'?(S.deudores||[]):(S.misDeudas||[])};", ctx);
  const run = c => vm.runInContext(c, ctx);
  run('Object.keys(S).forEach(k=>delete S[k])');
  Object.assign(w.S, JSON.parse(fs.readFileSync(rutaBackup, 'utf8')));
  run('aplicarMigraciones(S)');
  const S = w.S, out = { schemaVersion: S.schemaVersion, historial: {}, meses: {}, ingresosReales: [] };
  const claves = ['nequi', 'efectivo', 'nu', ...(S.cuentas || []).filter(c => c.tipo === 'custom').map(c => 'custom:' + c.id)];
  claves.forEach(k => {
    const filas = JSON.parse(JSON.stringify(run(`getMovimientosCuenta(${JSON.stringify(k)})`)));
    // Las filas del libro (intereses, ajustes, CDT) llevan un id generado en cada migración: se identifican por contenido.
    out.historial[k] = filas.map(m => ({ id: String(m._origen || '').indexOf('Libro') === 0 ? 'libro:' + m.fuente + ':' + m.desc : m._movId, fuente: m.fuente, tipo: m.tipo, monto: m.monto, fecha: m.fecha, desc: m.desc, sec: !!m._secundario }))
      .sort((a, b) => (a.id + '|' + a.fuente + '|' + a.monto).localeCompare(b.id + '|' + b.fuente + '|' + b.monto));
  });
  const meses = new Set(); (S.patrimonioHistorial || []).forEach(h => meses.add(h.fecha.slice(0, 7)));
  (S.gastosVar || []).forEach(g => meses.add(g.fecha.slice(0, 7))); (S.movimientos || []).forEach(m => m.fecha && meses.add(m.fecha.slice(0, 7)));
  [...meses].sort().forEach(m => { const i = run(`Periodo.ingresosDelMes('${m}')`), g = run(`Periodo.gastosDelMes('${m}')`); out.meses[m] = { mesada: i.mesada, fijos: i.fijos, entradas: i.entradas, total: i.total, gv: g.gvTotal, gf: g.gfTotal, gasto: g.total }; });
  out.ingresosReales = JSON.parse(JSON.stringify(run('entradasIngresoReal()'))).map(m => ({ id: m.id, monto: m.monto, fecha: m.fecha })).sort((a, b) => (a.id + a.monto).localeCompare(b.id + b.monto));
  // Patrimonio de cuentas (sin deudas: Deudas viene de un archivo que este entorno no carga): saldos + Nu con intereses.
  try { out.patrimonio = run('(S.cuentas||[]).reduce((a,c)=>a+(c.saldo||0),0)+nuTotal()'); } catch (e) { out.patrimonio = 'ERR ' + e.message; }
  out.libro = typeof w.Libro !== 'undefined' ? JSON.parse(JSON.stringify(run('Libro.verificar()'))).ok : null;
  return out;
}

function comparar(a, b, tol) {
  const A = JSON.parse(fs.readFileSync(a, 'utf8')), B = JSON.parse(fs.readFileSync(b, 'utf8')), difs = [];
  Object.keys(A.historial).forEach(k => {
    const fa = A.historial[k], fb = B.historial[k] || [], key = m => m.id + '|' + m.fuente + '|' + m.monto;
    const mb = new Map(fb.map(m => [key(m), m])), ma = new Map(fa.map(m => [key(m), m]));
    fa.forEach(m => { const o = mb.get(key(m)); if (!o) difs.push(`historial ${k}: falta ${key(m)} «${m.desc}»`); else ['tipo', 'fecha', 'desc', 'sec'].forEach(c => { if (o[c] !== m[c]) difs.push(`historial ${k} ${key(m)}: ${c} «${m[c]}» → «${o[c]}»`); }); });
    fb.forEach(m => { if (!ma.has(key(m))) difs.push(`historial ${k}: sobra ${key(m)} «${m.desc}»`); });
  });
  Object.keys(A.meses).forEach(m => Object.keys(A.meses[m]).forEach(c => { if (Math.abs(A.meses[m][c] - ((B.meses[m] || {})[c])) > 0.005) difs.push(`mes ${m} ${c}: ${A.meses[m][c]} → ${(B.meses[m] || {})[c]}`); }));
  if (JSON.stringify(A.ingresosReales) !== JSON.stringify(B.ingresosReales)) difs.push('entradasIngresoReal difiere: ' + A.ingresosReales.length + ' → ' + B.ingresosReales.length);
  if (typeof A.patrimonio === 'number' && Math.abs(A.patrimonio - B.patrimonio) > tol) difs.push(`patrimonio ${A.patrimonio} → ${B.patrimonio}`);
  if (B.libro === false) difs.push('el libro NO cuadra después');
  console.log(`schemaVersion ${A.schemaVersion} → ${B.schemaVersion}`);
  if (!difs.length) { console.log('✅ EQUIVALENTE: mismo historial en cada cuenta, mismos ingresos/gastos por mes, mismo patrimonio y el libro cuadra.'); return 0; }
  console.log('❌ DIFERENCIAS (' + difs.length + '):'); difs.slice(0, 60).forEach(d => console.log('  · ' + d)); return 1;
}

const args = process.argv.slice(2);
if (args[0] === '--comparar') process.exit(comparar(args[1], args[2], Number((args.find(a => a.startsWith('--tol=')) || '--tol=5000').split('=')[1])));
else if (args[0]) { const f = foto(args[0]); if (args[1]) fs.writeFileSync(args[1], JSON.stringify(f, null, 1)); console.log('filas por cuenta:', Object.entries(f.historial).map(([k, v]) => k + ':' + v.length).join(' · '), '\nmeses:', Object.keys(f.meses).length, '· ingresos reales:', f.ingresosReales.length, '· patrimonio:', f.patrimonio, '· libro cuadra:', f.libro); }
else { console.error('Uso: node tests/historial-unificado.js backup.json salida.json | --comparar antes.json despues.json'); process.exit(2); }
