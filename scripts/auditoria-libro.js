'use strict';
// Auditoría del libro (solo lectura): ¿el saldo guardado de cada cuenta coincide con la suma de sus movimientos?
//   node scripts/auditoria-libro.js backup.json [--chequeos]
// --chequeos: además, para cada cajita con "Chequeo rápido", muestra cuánto cambió la diferencia entre lecturas
// (un salto grande entre dos fechas ubica un movimiento que nunca se registró).
const fs = require('fs'), path = require('path');
const Libro = require(path.join(process.env.MIS_FINANZAS_CORE_DIR || path.join(__dirname, '..', 'js', 'core'), 'libro.js'));
const ruta = process.argv[2];
if (!ruta) { console.error('Uso: node scripts/auditoria-libro.js backup.json [--chequeos]'); process.exit(2); }
const S = JSON.parse(fs.readFileSync(ruta, 'utf8'));
const r = Libro.auditar(S), n = x => (x < 0 ? '-' : ' ') + Math.abs(x).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(14);
console.log('Patas contadas desde ' + r.inicio + '\n');
console.log('cuenta'.padEnd(20), 'guardado'.padStart(15), 'derivado'.padStart(15), 'residuo'.padStart(15));
r.filas.forEach(f => console.log(f.nombre.padEnd(20), n(f.guardado), n(f.derivado), n(f.residuo), Math.abs(f.residuo) < 0.005 ? '  ✓' : ''));
const ajenas = Object.entries(r.patasAjenas); if (ajenas.length) console.log('\nPatas hacia cuentas que no son de saldo:', ajenas.map(([k, v]) => k + ' ' + v).join(', '));
console.log('\nSin verificar con datos reales:', r.cobertura.noVerificadoConDatosReales.join('; '));
if (process.argv.includes('--chequeos')) (S.cajitas || []).forEach(c => {
  const d = Libro.diferenciasPorChequeo(c.id, S); if (!d.length) return;
  console.log('\nChequeos de ' + c.nombre + ':'); d.forEach(x => console.log('  ' + x.fecha, 'real', n(x.real), 'dif', n(x.difAcumulada), 'cambio', n(x.cambio)));
});
