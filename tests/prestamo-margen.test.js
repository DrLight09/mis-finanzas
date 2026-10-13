'use strict';
// Borrar un préstamo con "El valor era diferente" lo revierte TODO, margen incluido: como si nunca hubiera pasado.
// Corre con:  node --test tests/prestamo-margen.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./support/load-app');
const { createFakeDom } = require('./support/fake-dom');
const RAIZ = path.join(__dirname, '..');
const core = f => path.join(RAIZ, 'js', 'core', f), modulo = f => path.join(RAIZ, 'js', 'modules', f);
const ARCHIVOS = [core('core-state.js'), core('periodo.js'), core('nu-calc.js'), core('calc-helpers.js'), core('cuenta-efectos.js'), core('diferencial.js'), modulo('prestado.js')];

function cargar(inst) {
  const app = loadApp(ARCHIVOS, { permissive: true });
  Object.assign(app.S, { modulos: {}, libro: [], movimientos: [], gastosVar: [], cajitas: [], deudores: [], misDeudas: [], tarjetasCredito: [{ id: 'tc1', nombre: 'TC', deuda: 0, cupo: 1e7 }],
    cuentas: [{ id: 'nequi', tipo: 'nequi', saldo: 0 }, { id: 'efectivo', tipo: 'efectivo', saldo: 0 }] });
  const dom = createFakeDom({ [inst + '_monto']: { value: '700000' }, [inst + '_dif_real']: { value: '698000' }, [inst + '-dif-body']: { style: { display: '' } } });
  app.document = dom.document;
  return app;
}

test('Préstamo con TC — el margen queda enlazado al préstamo y borrarlo lo quita (no sigue contando como ingreso)', () => {
  const app = cargar('prtc');
  const movId = 'mp1';
  const d = { id: 'd1', nombre: 'Ana', movimientos: [] };
  const m = { id: movId, tipo: 'prestamo', monto: 700000, fecha: '2026-10-13', _viaTC: true, _tcId: 'tc1', _tcMonto: 698000 };
  d.movimientos.push(m); app.S.deudores.push(d); app.S.tarjetasCredito[0].deuda = 698000;
  m.diferencial = app.diffAplicar('prtc', { desc: 'x', fecha: '2026-10-13', _deudorNombre: 'Ana' }, movId);
  assert.ok(m.diferencial, 'hubo margen');
  assert.equal(app.Periodo.ingresosDelMes('2026-10').entradas, 2000, 'el margen cuenta como ingreso mientras exista');
  app._revertirMovDeudor(d, m);
  assert.equal(app.S.movimientos.length, 0, 'el margen se fue con el préstamo');
  assert.equal(app.Periodo.ingresosDelMes('2026-10').entradas, 0);
  assert.equal(app.S.tarjetasCredito[0].deuda, 0);
});

test('toda llamada a diffAplicar pasa linkId: sin él el efecto no se puede revertir con su movimiento principal', () => {
  const sin = [];
  ['modules/prestado.js', 'modules/encargos.js'].forEach(rel => {
    const src = fs.readFileSync(path.join(RAIZ, 'js', rel), 'utf8');
    const re = /\bdiffAplicar\(/g; let m;
    while ((m = re.exec(src))) {
      let prof = 0, i = m.index + m[0].length - 1, ini = i;
      for (; i < src.length; i++) { if (src[i] === '(') prof++; else if (src[i] === ')' && --prof === 0) break; }
      const args = src.slice(ini + 1, i);
      let comas = 0, p2 = 0; for (const c of args) { if ('({['.includes(c)) p2++; else if (')}]'.includes(c)) p2--; else if (c === ',' && p2 === 0) comas++; }
      if (comas < 2) sin.push(rel + ':' + src.slice(0, m.index).split('\n').length);
    }
  });
  assert.deepEqual(sin, [], 'diffAplicar sin linkId: ' + sin.join(', '));
});
