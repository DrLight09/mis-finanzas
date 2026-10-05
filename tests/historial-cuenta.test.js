// tests/historial-cuenta.test.js — historial de una cuenta: UNA función (cuentas.js)
// Corre con:  node --test tests/historial-cuenta.test.js
//
// PRUEBA DORADA: compara getMovimientosCuenta (función única, nueva) con las dos funciones
// anteriores congeladas en tests/support/historial-legacy.js, sobre los mismos datos, fila por
// fila. Lo único que puede diferir son los cambios deliberados de la unificación, y cada uno
// está enumerado abajo con su valor esperado. Cualquier otra diferencia hace fallar la prueba.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const RAIZ = path.join(__dirname, '..');
const core = f => path.join(RAIZ, 'js', 'core', f);
const modulo = f => path.join(RAIZ, 'js', 'modules', f);
const ARCHIVOS = [core('core-state.js'), core('calc-helpers.js'), core('cuenta-efectos.js'),
  modulo('cuentas.js'), path.join(__dirname, 'support', 'historial-legacy.js')];

const plano = x => JSON.parse(JSON.stringify(x)); // saca los undefined y los prototipos del vm

function fixture(S) {
  const D = (n) => '2026-10-0' + n;
  S.cuentas = [
    { id: 'nequi', tipo: 'nequi', saldo: 0 }, { id: 'efectivo', tipo: 'efectivo', saldo: 0 },
    { id: 'z', tipo: 'custom', nombre: 'Ahorro', saldo: 0, movimientos: [
      { id: 'zc1', tipo: 'ingreso', monto: 1000, fecha: D(2), nota: 'viejo con gemelo' },
      { id: 'zc2', tipo: 'egreso', monto: 200, fecha: D(3), nota: 'retiro propio' },
      { id: 'zc3', tipo: 'apertura', monto: 5000, fecha: '2026-09-01' },
      { id: 'zc4', tipo: 'ingreso', monto: 300, fecha: D(4), nota: 'espejo', _secundario: true, _esEspejo: true, _origenSeccion: 'Prestado · Me deben' },
      { id: 'zc5', tipo: 'entrada', monto: 10, fecha: D(4), desc: 'legacy entrada' },
      { id: 'zc6', tipo: 'salida_manual', monto: 20, fecha: D(4), desc: 'legacy salida' },
      { id: 'zc7', tipo: 'egreso', monto: 15, fecha: D(5) },
      { id: 'zc8', tipo: 'ingreso', monto: 9, fecha: D(5) },
    ] },
    { id: 'y', tipo: 'custom', nombre: 'Otra', saldo: 0, movimientos: [{ id: 'yc1', tipo: 'ingreso', monto: 7, fecha: D(5), nota: 'y' }] },
  ];
  S.cajitas = [
    { id: 'k1', nombre: 'K1', saldo: 0, historial: [
      { id: 'h1', tipo: 'entrada', monto: 100, fecha: D(2), nota: 'espejo', _secundario: true, _origenSeccion: 'Prestado · Me deben' },
      { id: 'h2', tipo: 'salida', monto: 50, fecha: D(3), desc: 'x', _secundario: true },
      { id: 'h3', tipo: 'entrada', monto: 1, fecha: D(3) } ] },
    { id: 'k2', nombre: 'K2', saldo: 0, historial: [{ id: 'h4', tipo: 'salida', monto: 4, fecha: D(1), _secundario: true }] },
  ];
  S.movimientos = [
    { id: 'm01', tipo: 'entrada', fuente: 'nequi', monto: 100000, fecha: D(1), desc: 'Sueldo' },
    { id: 'm02', tipo: 'salida_manual', fuente: 'efectivo', monto: 5000, fecha: D(1), desc: 'Almuerzo' },
    { id: 'm03', tipo: 'entrada', fuente: 'efectivo', monto: 800, fecha: D(1) },
    { id: 'm04', tipo: 'salida_manual', fuente: 'nequi', monto: 700, fecha: D(1) },
    { id: 'm05', tipo: 'apertura', fuente: 'nequi', monto: 60000, fecha: '2026-09-01' },
    { id: 'm06', tipo: 'transferencia', fuente: 'nequi', monto: 30, fecha: D(2), _esIntercambioEncargo: true, _encMovId: 'em1', _intercambioSalida: true, _fuenteDestino: 'efectivo' },
    { id: 'm07', tipo: 'transferencia', fuente: 'efectivo', monto: 30, fecha: D(2), _esIntercambioEncargo: true, _encMovId: 'em1', _intercambioEntrada: true, _fuenteDestino: 'nequi' },
    { id: 'm08', tipo: 'transferencia', fuente: 'nequi', monto: 12, fecha: D(2), _fuenteDestino: 'efectivo' },
    { id: 'm09', tipo: 'entrada', fuente: 'nequi', monto: 50, fecha: D(2), _esReposicionCP: true, desc: 'Reposición: algo' },
    { id: 'm10', tipo: 'entrada', fuente: 'nequi', monto: 60, fecha: D(2), desc: 'Margen de encargo' },
    { id: 'm11', tipo: 'entrada', fuente: 'nequi', monto: 8000, fecha: D(3), desc: 'Mesada papá', _secundario: true, _origenSeccion: 'Mesada' },
    { id: 'm12', tipo: 'entrada', fuente: 'nequi', monto: 99, fecha: D(3), _esAlcanciaIngreso: true, desc: 'alc' },
    { id: 'm13', tipo: 'entrada', fuente: 'cajita:k1', monto: 400, fecha: D(3), desc: 'Sueldo cajita' },
    { id: 'm14', tipo: 'salida_manual', fuente: 'cajita:k2', monto: 40, fecha: D(3) },
    { id: 'm15', tipo: 'entrada', fuente: 'custom:z', monto: 70, fecha: D(3), desc: 'Propina' },
    { id: 'm16', tipo: 'salida_manual', fuente: 'custom:z', monto: 80, fecha: D(3), desc: 'Retiro S' },
    { id: 'zc1', tipo: 'entrada', fuente: 'custom:z', monto: 1000, fecha: D(2), desc: 'gemelo viejo' },
    { id: 'm17', tipo: 'transferencia', fuente: 'custom:z', monto: 25, fecha: D(4), _esIntercambioEncargo: true, _encMovId: 'em2', _intercambioSalida: true, _fuenteDestino: 'nequi' },
    { id: 'm18', tipo: 'transferencia', fuente: 'nequi', monto: 25, fecha: D(4), _esIntercambioEncargo: true, _encMovId: 'em2', _intercambioEntrada: true, _fuenteDestino: 'custom:z' },
    { id: 'm19', tipo: 'entrada', fuente: 'custom:z', monto: 6000, fecha: D(4), desc: 'Mesada mamá', _secundario: true, _origenSeccion: 'Mesada' },
    { id: 'm20', tipo: 'entrada', fuente: 'custom:z', monto: 99, fecha: D(4), _esAlcanciaIngreso: true },
    { id: 'm21', tipo: 'entrada', fuente: 'custom:z', monto: 45, fecha: D(4), desc: 'Encargo X' },
    { id: 'm22', tipo: 'entrada', fuente: 'custom:y', monto: 11, fecha: D(4), desc: 'otra cuenta' },
    { tipo: 'entrada', fuente: 'nequi', monto: 1, fecha: D(5), desc: 'sin id A' },     // legado sin id: el orden depende de _idx
    { tipo: 'salida_manual', fuente: 'nequi', monto: 2, fecha: D(5), desc: 'sin id B' },
  ];
  S.gastosVar = [
    { id: 'g01', fuente: 'nequi', desc: 'Mercado', cat: 'Comida', nota: 'n1', monto: 9000, fecha: D(2) },
    { id: 'g02', fuente: 'efectivo', desc: 'Fijo', esPagoGastoFijo: true, monto: 100, fecha: D(2) },
    { id: 'g03', fuente: 'nequi', desc: 'Pago TC', _esPagoTC: true, monto: 200, fecha: D(2) },
    { id: 'g04', fuente: 'nequi', desc: 'Extra', _esExtraPrestamo: true, monto: 300, fecha: D(2) },
    { id: 'g05', fuente: 'nequi', desc: 'Con nota', nota: 'pagado por encargo', monto: 400, fecha: D(2) },
    { id: 'g06', fuente: 'nequi', desc: 'Alcancía', _esAlcancia: true, monto: 500, fecha: D(3) },
    { id: 'g07', fuente: 'nequi', desc: 'Espejo', _secundario: true, _origenSeccion: 'Prestado · Me deben', monto: 600, fecha: D(3) },
    { id: 'g08', fuente: 'cajita:k1', desc: 'Gasto cajita', cat: 'Otro', monto: 77, fecha: D(3) },
    { id: 'g09', fuente: 'custom:z', desc: 'Cine', cat: 'Ocio', nota: 'zn', monto: 88, fecha: D(3) },
    { id: 'g10', fuente: 'custom:z', desc: 'Mandado', nota: 'encargo foo', monto: 89, fecha: D(3) },
    { id: 'g11', fuente: 'custom:z', desc: 'Alc z', _esAlcancia: true, monto: 90, fecha: D(3) },
    { id: 'g12', fuente: 'custom:z', desc: 'Fijo z', esPagoGastoFijo: true, monto: 91, fecha: D(3) },
    { id: 'g13', fuente: 'custom:y', desc: 'y', monto: 3, fecha: D(3) },
    { fuente: 'nequi', desc: 'gasto sin id', monto: 5, fecha: D(5) },
  ];
  S.deudores = [{ id: 'd1', nombre: 'Ana', movimientos: [
    { id: 'p1', tipo: 'prestamo', fuente: 'nequi', monto: 30000, fecha: D(2), nota: 'a' },
    { id: 'p2', tipo: 'prestamo', fuente: '', monto: 30000, fecha: D(2), fuentes: [{ fuente: 'efectivo', monto: 20000 }, { fuente: 'nequi', monto: 10000 }] },
    { id: 'p3', tipo: 'prestamo', fuente: 'custom:z', monto: 5000, fecha: D(2) },
    { id: 'p4', tipo: 'prestamo', fuente: '', monto: 300, fecha: D(3), fuentes: [{ fuente: 'custom:z', monto: 100 }, { fuente: 'cajita:k1', monto: 200 }] },
    { id: 'p5', tipo: 'prestamo', fuente: 'nequi', monto: 50, fecha: D(3), fuentes: [{ fuente: 'efectivo', monto: 5 }] },
    { id: 'p6', tipo: 'abono', fuente: 'nequi', monto: 10, fecha: D(3) },
    { id: 'p7', tipo: 'prestamo', fuente: 'cajita:k2', monto: 9, fecha: D(3) },
  ] }];
  S.spotifyHistorial = [
    { id: 'sp1', tipo: 'cobro', nombre: 'Ana', fuente: 'nequi', fecha: D(2), monto: 15000, pendienteHistorial: [
      { id: 'ab1', fecha: D(3), monto: 5000, destino: 'efectivo' }, { id: 'ab2', fecha: D(3), monto: 2000, destino: 'custom:z' }, { id: 'ab3', fecha: D(3), monto: 1000, destino: 'cajita:k1' }] },
    { tipo: 'cobro', nombre: 'Sin id', fuente: 'custom:z', fecha: D(3), monto: 700 },
    { id: 'sp3', tipo: 'pago', nombre: 'Plan', fuente: 'nequi', fecha: D(3), monto: 1 },
    { id: 'sp4', tipo: 'cobro', nombre: 'Beto', fuente: 'cajita:k1', fecha: D(4), monto: 600 },
  ];
  S.transferencias = [
    { id: 't01', origen: 'nequi', destino: 'efectivo', monto: 1000, fecha: D(2), nota: 'nt' },
    { id: 't02', origen: 'efectivo', destino: 'cajita:k1', monto: 200, fecha: D(2) },
    { id: 't03', origen: 'cajita:k1', destino: 'cajita:k2', monto: 33, fecha: D(3) },
    { id: 't04', origen: 'nequi', destino: 'alcancia', monto: 44, fecha: D(3), desc: 'Depósito' },
    { id: 't05', origen: 'custom:z', destino: 'nequi', monto: 55, fecha: D(3) },
    { id: 't06', origen: 'nequi', destino: 'custom:z', monto: 66, fecha: D(3), _secundario: true },
    { id: 't07', origen: 'custom:y', destino: 'custom:z', monto: 12, fecha: D(3) },
    { origen: 'nequi', destino: 'efectivo', monto: 1, fecha: D(5) },
    { id: 't09', origen: 'custom:z', destino: 'alcancia', monto: 13, fecha: D(3) },
  ];
}

function cargar() {
  const app = loadApp(ARCHIVOS, { permissive: true });
  fixture(app.S);
  return app;
}
const CUENTAS = ['nequi', 'efectivo', 'nu', 'cajita:k1', 'custom:z', 'custom:y'];
function ambas(app, tipo) {
  const legacy = plano(app._legacyGetMovimientosCuenta(tipo));
  const nuevo = plano(app.getMovimientosCuenta(tipo));
  return { legacy, nuevo };
}
// _idx es un número interno de recolección (solo desempata filas sin id, y el orden ya se compara);
// _secundario se normaliza a booleano.
const norm = m => { const o = { ...m }; delete o._idx; o._secundario = !!o._secundario; return o; };
const clavesDistintas = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k]));

// Cambios DELIBERADOS de la unificación — solo en cuentas personalizadas (las demás no cambian nada).
const PERMITIDAS = nuevo => {
  if (nuevo.tipo === 'gasto') return ['cat', 'nota', '_origen'];               // ahora lleva categoría, nota y el origen "Encargos"
  if (nuevo.tipo === 'prestamo') return ['_otrasCuentas'];                       // ahora muestra las otras cuentas de un préstamo dividido
  if (nuevo._secundario && nuevo._origenSeccion) return ['_origen'];             // ahora usa la sección de origen (Mesada, …)
  return [];
};

describe('prueba dorada: la función única no pierde, duplica ni reordena filas', () => {
  for (const tipo of CUENTAS) {
    test(`${tipo}: mismas filas, mismo orden`, () => {
      const { legacy, nuevo } = ambas(cargar(), tipo);
      assert.ok(legacy.length > 0, 'el fixture debe producir filas para esta cuenta');
      assert.equal(nuevo.length, legacy.length, 'misma cantidad de filas');
      assert.deepEqual(nuevo.map(m => [m._movId, m.tipo, m.monto, m.fecha, m.fuente]), legacy.map(m => [m._movId, m.tipo, m.monto, m.fecha, m.fuente]));
    });
  }
  for (const tipo of ['nequi', 'efectivo', 'nu', 'cajita:k1']) {
    test(`${tipo} (cuenta estándar): resultado IDÉNTICO campo por campo`, () => {
      const { legacy, nuevo } = ambas(cargar(), tipo);
      assert.deepEqual(nuevo.map(norm), legacy.map(norm));
    });
  }
  for (const tipo of ['custom:z', 'custom:y']) {
    test(`${tipo}: solo difieren los cambios deliberados`, () => {
      const { legacy, nuevo } = ambas(cargar(), tipo);
      nuevo.forEach((n, i) => {
        const dif = clavesDistintas(norm(legacy[i]), norm(n));
        const permitidas = PERMITIDAS(n);
        const noPermitidas = dif.filter(k => !permitidas.includes(k));
        assert.deepEqual(noPermitidas, [], `fila ${n._movId} (${n.tipo}) difiere en campos no previstos`);
      });
    });
  }
});

describe('cambios deliberados en cuentas personalizadas (cuenta z)', () => {
  const fila = (arr, id, extra = () => true) => arr.find(m => m._movId === id && extra(m));
  test('un gasto ahora trae categoría y nota', () => {
    const { legacy, nuevo } = ambas(cargar(), 'custom:z');
    assert.equal(fila(legacy, 'g09').cat, undefined);
    assert.equal(fila(nuevo, 'g09').cat, 'Ocio');
    assert.equal(fila(nuevo, 'g09').nota, 'zn');
  });
  test('un gasto con "encargo" en la nota se etiqueta Encargos (antes: Gastos)', () => {
    const { legacy, nuevo } = ambas(cargar(), 'custom:z');
    assert.equal(fila(legacy, 'g10')._origen, 'Gastos');
    assert.equal(fila(nuevo, 'g10')._origen, 'Encargos');
  });
  test('un préstamo dividido muestra las otras cuentas (antes: ninguna)', () => {
    const { legacy, nuevo } = ambas(cargar(), 'custom:z');
    assert.equal(fila(legacy, 'p4')._otrasCuentas, null);
    assert.deepEqual(fila(nuevo, 'p4')._otrasCuentas, [{ fuente: 'cajita:k1', monto: -200 }]);
  });
  test('un movimiento de Mesada en la cuenta ya no sale como "Movimiento manual"', () => {
    const { legacy, nuevo } = ambas(cargar(), 'custom:z');
    assert.equal(fila(legacy, 'm19')._origen, 'Cuentas · Movimiento manual');
    assert.equal(fila(nuevo, 'm19')._origen, 'Mesada');
  });
  test('el tipo de una salida manual sigue siendo "egreso" (movimientos.js elige el borrado por ese tipo)', () => {
    const { nuevo } = ambas(cargar(), 'custom:z');
    assert.equal(fila(nuevo, 'm16').tipo, 'egreso');
    assert.equal(fila(nuevo, 'zc2').tipo, 'egreso');
    assert.ok(!nuevo.some(m => m.tipo === 'salida_manual'));
  });
});

describe('cuentas estándar: el tipo de una salida manual sigue siendo "salida_manual"', () => {
  test('Nequi, Efectivo y cajitas', () => {
    const app = cargar();
    for (const [tipo, id] of [['nequi', 'm04'], ['efectivo', 'm02'], ['nu', 'm14']]) {
      assert.equal(app.getMovimientosCuenta(tipo).find(m => m._movId === id).tipo, 'salida_manual', tipo);
    }
  });
});

describe('reglas que la función debe cumplir', () => {
  test('datos viejos con gemelo (mismo id en c.movimientos y S.movimientos): una sola fila', () => {
    const { nuevo } = ambas(cargar(), 'custom:z');
    assert.equal(nuevo.filter(m => m._movId === 'zc1').length, 1);
    assert.equal(nuevo.find(m => m._movId === 'zc1').desc, 'viejo con gemelo', 'queda la de la cuenta, no la de S.movimientos');
  });
  test('un ingreso de Alcancía sin cuenta de origen no aparece en el historial', () => {
    const app = cargar();
    for (const tipo of ['nequi', 'custom:z']) assert.ok(!app.getMovimientosCuenta(tipo).some(m => m._movId === 'm12' || m._movId === 'm20'), tipo);
  });
  test('un depósito a la alcancía sale como fila "alcancia" con monto oculto, en cuenta estándar y personalizada', () => {
    const app = cargar();
    const e = app.getMovimientosCuenta('nequi').find(m => m._movId === 't04');
    const c = app.getMovimientosCuenta('custom:z').find(m => m._movId === 't09');
    assert.equal(e.tipo, 'alcancia'); assert.equal(e._alcOculto, true);
    assert.equal(c.tipo, 'alcancia'); assert.equal(c._alcOculto, true);
  });
  test('el cobro de Spotify descuenta los abonos ya recibidos (no cuenta la plata dos veces)', () => {
    const app = cargar();
    const cobro = app.getMovimientosCuenta('nequi').find(m => m._movId === 'sp1');
    assert.equal(cobro.monto, 15000 - (5000 + 2000 + 1000));
    assert.equal(app.getMovimientosCuenta('efectivo').find(m => m._movId === 'ab1').monto, 5000);
    assert.equal(app.getMovimientosCuenta('custom:z').find(m => m._movId === 'ab2').monto, 2000);
  });
  test('un cobro de Spotify sin id recibe un id estable (sp_legacy_<índice>)', () => {
    const f = cargar().getMovimientosCuenta('custom:z').find(m => m.desc === 'Cobro Spotify (Sin id)');
    assert.equal(f._movId, 'sp_legacy_1');
  });
  test('la pantalla de Nu ("nu") junta las filas de TODAS las cajitas', () => {
    const fuentes = new Set(cargar().getMovimientosCuenta('nu').map(m => m.fuente));
    assert.ok(fuentes.has('cajita:k1') && fuentes.has('cajita:k2'));
    assert.ok([...fuentes].every(f => f.startsWith('cajita:')));
  });
  test('los espejos de cajita.historial solo aparecen para "nu", y solo los _secundario', () => {
    const app = cargar();
    const nu = app.getMovimientosCuenta('nu').map(m => m._movId);
    assert.ok(nu.includes('h1') && nu.includes('h2') && nu.includes('h4'));
    assert.ok(!nu.includes('h3'), 'h3 no es secundario');
    assert.ok(!app.getMovimientosCuenta('nequi').some(m => m._movId === 'h1'));
  });
  test('una cuenta personalizada que ya no existe no revienta y aún muestra lo que apuntaba a ella', () => {
    const app = cargar();
    app.S.cuentas = app.S.cuentas.filter(c => c.id !== 'z');
    const filas = app.getMovimientosCuenta('custom:z');
    assert.ok(filas.length > 0);
    assert.ok(filas.some(m => m._movId === 'zc1'), 'sin la cuenta no hay gemelo que saltar: queda la fila de S.movimientos');
  });
  test('sin datos devuelve una lista vacía', () => {
    const app = loadApp(ARCHIVOS, { permissive: true });
    assert.deepEqual(plano(app.getMovimientosCuenta('nequi')), []);
    assert.deepEqual(plano(app.getMovimientosCuenta('custom:nada')), []);
  });
  test('orden: fecha descendente; en la misma fecha, el id más reciente primero', () => {
    const fs = Array.from(cargar().getMovimientosCuenta('nequi'), m => m.fecha);
    assert.deepEqual(fs, [...fs].sort((a, b) => b.localeCompare(a)));
  });
});
