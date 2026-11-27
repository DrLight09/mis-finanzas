'use strict';
// Fusión de DOS dispositivos con estados completos de la app, con operaciones REALES (ingreso, retiro, transferencia, gasto, y su eliminación con
// `eliminarMovimiento`, la ruta de la pantalla). Los dos parten del mismo estado, trabajan por separado (incluso eliminando LOS MISMOS movimientos)
// y se fusionan con `fusionarEstados`. Se comprueba, contra un modelo independiente de qué movimientos siguen vivos:
//   · el saldo de cada cuenta del estado fusionado (cargado en una app nueva) == saldo inicial + efecto de los movimientos vivos;
//   · Libro.verificar y Libro.verificarEspejo (ninguna pata sin su registro);
//   · los registros vivos son exactamente los que el modelo espera, sin duplicados.
// Caso clave: cada dispositivo anota su PROPIA reversión al eliminar el mismo movimiento; sin `deduplicarReversionesConcurrentes` (fusion.js) la
// plata se devolvía dos veces. Semillas fijas. Corre con:  node --test tests/fusion-app-completa.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { loadApp } = require('./support/load-app');
const { createFakeDom } = require('./support/fake-dom');

const RAIZ = path.join(__dirname, '..');
const core = f => path.join(RAIZ, 'js', 'core', f), modulo = f => path.join(RAIZ, 'js', 'modules', f);
const ARCHIVOS = [core('core-state.js'), core('periodo.js'), core('nu-calc.js'), core('calc-helpers.js'), core('cuenta-efectos.js'),
  modulo('tarjetas-credito.js'), modulo('nu.js'), modulo('cuentas.js'), core('split.js'), modulo('gastos.js'), core('movimientos.js')];
const HOY = '2026-10-13';
const CUENTAS = ['cuenta:nequi', 'cuenta:efectivo', 'cuenta:z'];
const INICIAL = 5000000;
const clon = x => JSON.parse(JSON.stringify(x));
const dormir = ms => new Promise(r => setTimeout(r, ms));
let _numDispositivo = 0;

// Un «dispositivo»: una app cargada con el estado `plano` (o vacío con las cuentas). Cada uno genera ids propios (como los reales, que no coinciden).
function dispositivo(plano) {
  const app = loadApp(ARCHIVOS, { permissive: true });
  const prefijo = 'd' + (++_numDispositivo) + '-'; let n = 0;
  app.uid = () => prefijo + (++n);
  Object.assign(app.S, { modulos: {}, libro: [], movimientos: [], gastosVar: [], cajitas: [], transferencias: [], pagosGastosFijos: {}, tcMovimientos: [], tarjetasCredito: [],
    cuentas: [{ id: 'nequi', tipo: 'billetera', nombre: 'Nequi' }, { id: 'efectivo', tipo: 'efectivo', nombre: 'Efectivo' }, { id: 'z', tipo: 'banco', nombre: 'Z' }],
    config: { proteccionAntiguedad: { diasAviso: 99999, diasBloqueo: 99999 } } }, plano ? clon(plano) : {});
  app.Libro.hidratar(app.S);
  const dom = createFakeDom({ gv_desc: { value: 'G' }, gv_monto: { value: '' }, gv_fecha: { value: '' }, gv_cat: { value: 'Comida' }, gv_nota: { value: '' }, gv_fuente: { value: '' },
    tr_origen: { value: '' }, tr_destino: { value: '' }, tr_monto: { value: '' }, tr_nota: { value: '' }, tr_fecha: { value: HOY } });
  app.document = dom.document;
  app.dialogo = async () => true; app.confirmarEliminar = async () => true; app.save = () => {}; app.refresh = () => {}; app.toast = () => {}; app.fuenteLabel = f => f;
  return { app, dom };
}
const boton = (v) => { const item = { dataset: { movimientoId: v.id, movimientoTipo: v.tipo, movimientoFuente: v.fuente, movimientoMonto: String(v.monto), movimientoFecha: HOY } }; return { closest: () => item }; };
const delta = (cuenta, valor) => { const d = CUENTAS.map(() => 0); d[CUENTAS.indexOf(cuenta)] += valor; return d; };
const suma = (a, b) => a.map((v, i) => v + b[i]);

// Una operación de creación en `d` (un dispositivo): devuelve el registro vivo { id, tipo, fuente, monto, efecto }.
function crear(d, azar) {
  const { app, dom } = d;
  const elegir = lista => lista[Math.floor(azar() * lista.length)];
  const monto = (1 + Math.floor(azar() * 99)) * 100, r = azar();
  const campo = (id, valor) => { dom.document.getElementById(id).value = valor; };
  if (r < 0.3) {
    const fuente = elegir(CUENTAS); app.registrarEntradaConApertura(fuente, monto, HOY, 'Ingreso', false, '');
    return { id: app.S.movimientos[app.S.movimientos.length - 1].id, tipo: 'entrada', fuente, monto, efecto: delta(fuente, monto) };
  }
  if (r < 0.5) {
    const fuente = elegir(CUENTAS); app.registrarSalida(fuente, monto, HOY, 'Retiro', '');
    return { id: app.S.movimientos[app.S.movimientos.length - 1].id, tipo: 'salida_manual', fuente, monto, efecto: delta(fuente, -monto) };
  }
  if (r < 0.75) {
    const origen = elegir(CUENTAS), destino = elegir(CUENTAS.filter(c => c !== origen));
    campo('tr_origen', origen); campo('tr_destino', destino); campo('tr_monto', monto + ',00'); campo('tr_nota', ''); campo('tr_fecha', HOY);
    app.confirmarTransferir();
    return { id: app.S.transferencias[app.S.transferencias.length - 1].id, tipo: 'transferencia', fuente: origen, monto, efecto: suma(delta(origen, -monto), delta(destino, monto)) };
  }
  const fuente = elegir(CUENTAS);
  campo('gv_fuente', fuente); campo('gv_monto', monto + ',00'); campo('gv_desc', 'Gasto'); campo('gv_cat', 'Comida');
  app.addGastoVar();
  return { id: app.S.gastosVar[app.S.gastosVar.length - 1].id, tipo: 'gasto', fuente, monto, efecto: delta(fuente, -monto) };
}

async function correrFusion(semilla) {
  let s = semilla;
  const azar = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  // Estado de partida: saldo inicial + unos cuantos movimientos.
  const d0 = dispositivo();
  CUENTAS.forEach(c => d0.app.sumarFuente(c, INICIAL, { origen: { modulo: 'test' } }));
  const vivosBase = [];
  for (let i = 0; i < 14; i++) vivosBase.push(crear(d0, azar));
  const plano = clon(d0.app.S);
  await dormir(4);

  // Cada dispositivo trabaja por su cuenta: crea movimientos nuevos y elimina algunos de la base (los MISMOS posibles) o suyos.
  const trabajo = async (d) => {
    const propios = [], eliminadosBase = new Set(), eliminadosPropios = new Set();
    for (let i = 0; i < 10; i++) {
      if (azar() < 0.55) { propios.push(crear(d, azar)); continue; }
      const candidatos = vivosBase.filter(v => !eliminadosBase.has(v.id)).map(v => ({ v, base: true })).concat(propios.filter(v => !eliminadosPropios.has(v.id)).map(v => ({ v, base: false })));
      if (!candidatos.length) continue;
      const { v, base } = candidatos[Math.floor(azar() * candidatos.length)];
      await d.app.eliminarMovimiento(boton(v));
      (base ? eliminadosBase : eliminadosPropios).add(v.id);
    }
    return { propios, eliminadosBase, eliminadosPropios };
  };
  const A = dispositivo(plano), B = dispositivo(plano);
  const tA = await trabajo(A); await dormir(4); const tB = await trabajo(B);

  const { fusionarEstados } = await import(pathToFileURL(core('fusion.js')).href);
  const fusionado = fusionarEstados(plano, clon(A.app.S), clon(B.app.S));
  const M = dispositivo(fusionado);

  // Modelo: vivos = base − eliminados por cualquiera + propios de cada uno no eliminados.
  const vivos = vivosBase.filter(v => !tA.eliminadosBase.has(v.id) && !tB.eliminadosBase.has(v.id))
    .concat(tA.propios.filter(v => !tA.eliminadosPropios.has(v.id)), tB.propios.filter(v => !tB.eliminadosPropios.has(v.id)));
  const esperado = vivos.reduce((a, v) => suma(a, v.efecto), CUENTAS.map(() => INICIAL));
  const donde = `semilla ${semilla}`;
  assert.deepEqual(CUENTAS.map(c => M.app.getSaldoFuente(c)), esperado, `${donde}: el saldo fusionado no coincide con el modelo`);
  assert.equal(M.app.Libro.verificar(M.app.S).ok, true, `${donde}: el libro no cuadra con los saldos`);
  const espejo = M.app.Libro.verificarEspejo(M.app.S);
  assert.equal(espejo.ok, true, `${donde}: espejo roto ${JSON.stringify(espejo.huerfanas.slice(0, 3))}`);
  const registros = [...M.app.S.movimientos, ...M.app.S.gastosVar, ...M.app.S.transferencias].map(x => x.id).sort();
  assert.equal(new Set(registros).size, registros.length, `${donde}: registros duplicados`);
  assert.deepEqual(registros, vivos.map(v => v.id).sort(), `${donde}: los registros vivos no son los esperados`);
  return { eliminadosEnAmbos: [...tA.eliminadosBase].filter(id => tB.eliminadosBase.has(id)).length };
}

let solapadas = 0;
for (const semilla of [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233]) {
  test('dos dispositivos con operaciones reales (algunas eliminan lo mismo) se fusionan sin perder ni duplicar plata, semilla ' + semilla, async () => {
    const r = await correrFusion(semilla);
    solapadas += r.eliminadosEnAmbos;
  });
}
test('las secuencias ejercitaron de verdad la eliminación doble del mismo movimiento (si no, la prueba no vigilaría el caso clave)', () => {
  assert.ok(solapadas >= 3, 'eliminaciones dobles ejercitadas: ' + solapadas);
});
