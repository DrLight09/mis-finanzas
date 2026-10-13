// tests/historial-cuenta.test.js — historial de una cuenta: UNA función (cuentas.js)
// Corre con:  node --test tests/historial-cuenta.test.js
//
// getMovimientosCuenta junta lo que afecta a una cuenta desde todas las fuentes: S.movimientos (el historial de TODAS las
// cuentas, con `fuente`), gastos variables, préstamos dados, transferencias, cobros de Spotify y las entradas del libro sin
// fila propia (intereses, ajustes, CDT). Estas pruebas fijan lo que debe mostrar cada cuenta y las reglas de presentación.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const RAIZ = path.join(__dirname, '..');
const core = f => path.join(RAIZ, 'js', 'core', f);
const modulo = f => path.join(RAIZ, 'js', 'modules', f);
const ARCHIVOS = [core('core-state.js'), core('calc-helpers.js'), core('cuenta-efectos.js'), modulo('cuentas.js')];

const plano = x => JSON.parse(JSON.stringify(x)); // saca los undefined y los prototipos del vm

// Fixture en la forma única: S.movimientos con `fuente` (ninguna cuenta tiene lista propia).
function fixture(S) {
  const D = (n) => '2026-10-0' + n;
  S.cuentas = [
    { id: 'nequi', tipo: 'nequi', saldo: 0 }, { id: 'efectivo', tipo: 'efectivo', saldo: 0 },
    { id: 'z', tipo: 'custom', nombre: 'Ahorro', saldo: 0 }, { id: 'y', tipo: 'custom', nombre: 'Otra', saldo: 0 },
  ];
  S.cajitas = [{ id: 'k1', nombre: 'K1', saldo: 0 }, { id: 'k2', nombre: 'K2', saldo: 0 }];
  S.libro = [];
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
    { id: 'm17', tipo: 'transferencia', fuente: 'custom:z', monto: 25, fecha: D(4), _esIntercambioEncargo: true, _encMovId: 'em2', _intercambioSalida: true, _fuenteDestino: 'nequi' },
    { id: 'm18', tipo: 'transferencia', fuente: 'nequi', monto: 25, fecha: D(4), _esIntercambioEncargo: true, _encMovId: 'em2', _intercambioEntrada: true, _fuenteDestino: 'custom:z' },
    { id: 'm19', tipo: 'entrada', fuente: 'custom:z', monto: 6000, fecha: D(4), desc: 'Mesada mamá', _secundario: true, _origenSeccion: 'Mesada' },
    { id: 'm20', tipo: 'entrada', fuente: 'custom:z', monto: 99, fecha: D(4), _esAlcanciaIngreso: true },
    { id: 'm21', tipo: 'entrada', fuente: 'custom:z', monto: 45, fecha: D(4), desc: 'Encargo X' },
    { id: 'm22', tipo: 'entrada', fuente: 'custom:y', monto: 11, fecha: D(4), desc: 'otra cuenta' },
    // lo que antes vivía en cuenta.movimientos / cajita.historial, ya en la lista única
    { id: 'zc1', tipo: 'entrada', fuente: 'custom:z', monto: 1000, fecha: D(2), desc: 'ingreso de la cuenta' },
    { id: 'zc2', tipo: 'salida', fuente: 'custom:z', monto: 200, fecha: D(3), desc: 'retiro propio' },
    { id: 'zc3', tipo: 'apertura', fuente: 'custom:z', monto: 5000, fecha: '2026-09-01' },
    { id: 'zc4', tipo: 'entrada', fuente: 'custom:z', monto: 300, fecha: D(4), desc: 'espejo', _secundario: true, _esEspejo: true, _origenSeccion: 'Prestado · Me deben' },
    { id: 'zc7', tipo: 'salida', fuente: 'custom:z', monto: 15, fecha: D(5) },
    { id: 'zc8', tipo: 'entrada', fuente: 'custom:z', monto: 9, fecha: D(5) },
    { id: 'yc1', tipo: 'entrada', fuente: 'custom:y', monto: 7, fecha: D(5), desc: 'y' },
    { id: 'h1', tipo: 'entrada', fuente: 'cajita:k1', monto: 100, fecha: D(2), desc: 'espejo', _secundario: true, _origenSeccion: 'Prestado · Me deben' },
    { id: 'h2', tipo: 'salida', fuente: 'cajita:k1', monto: 50, fecha: D(3), desc: 'x', _secundario: true },
    { id: 'h4', tipo: 'salida', fuente: 'cajita:k2', monto: 4, fecha: D(1), _secundario: true },
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
const filas = (app, tipo) => plano(app.getMovimientosCuenta(tipo));
const ids = (app, tipo) => filas(app, tipo).map(m => m._movId || '?');
const fila = (app, tipo, id) => filas(app, tipo).find(m => m._movId === id);

describe('qué filas muestra cada cuenta, y en qué orden (fecha desc; misma fecha: id más reciente primero)', () => {
  const ESPERADO = {
    'nequi': '?,?,?,?,m18,t06,t05,t04,p5,m11,g07,g06,t01,sp1,p2,p1,m10,m09,m08,m06,g05,g04,g03,g01,m04,m01,m05',
    'efectivo': '?,p5,ab1,t02,t01,p2,m07,g02,m03,m02',
    'nu': 'sp4,t03,t03,p7,p4,m14,m13,h2,g08,ab3,t02,h1,h4',
    'cajita:k1': 'sp4,t03,p4,m13,h2,g08,ab3,t02,h1',
    'custom:z': 'zc8,zc7,zc4,m21,m19,m17,zc2,t09,t07,t06,t05,sp_legacy_1,p4,m16,m15,g12,g11,g10,g09,ab2,zc1,p3,zc3',
    'custom:y': 'yc1,m22,t07,g13',
  };
  for (const [cuenta, esperado] of Object.entries(ESPERADO)) {
    test(cuenta, () => assert.equal(ids(cargar(), cuenta).join(','), esperado));
  }
  test('una cuenta cuyo historial está todo en S.movimientos no necesita ninguna lista propia', () => {
    const app = cargar();
    assert.ok(app.S.cuentas.every(c => !('movimientos' in c)) && app.S.cajitas.every(c => !('historial' in c)));
    assert.ok(filas(app, 'custom:z').length > 0 && filas(app, 'cajita:k1').length > 0);
  });
});

describe('el tipo de una salida manual depende del tipo de cuenta (movimientos.js elige el borrado por ese tipo)', () => {
  test('cuenta personalizada: siempre "egreso"', () => {
    const app = cargar();
    assert.equal(fila(app, 'custom:z', 'm16').tipo, 'egreso');
    assert.equal(fila(app, 'custom:z', 'zc2').tipo, 'egreso');
    assert.ok(!filas(app, 'custom:z').some(m => m.tipo === 'salida_manual'));
  });
  test('Nequi, Efectivo y cajitas: "salida_manual"', () => {
    const app = cargar();
    for (const [tipo, id] of [['nequi', 'm04'], ['efectivo', 'm02'], ['nu', 'm14']]) assert.equal(fila(app, tipo, id).tipo, 'salida_manual', tipo);
  });
});

describe('cómo se presenta cada fila', () => {
  test('un gasto trae categoría y nota', () => {
    const g = fila(cargar(), 'custom:z', 'g09');
    assert.equal(g.cat, 'Ocio'); assert.equal(g.nota, 'zn');
  });
  test('un gasto con "encargo" en la nota se etiqueta Encargos', () => {
    const app = cargar();
    assert.equal(fila(app, 'custom:z', 'g10')._origen, 'Encargos');
    assert.equal(fila(app, 'nequi', 'g05')._origen, 'Encargos');
  });
  test('un préstamo dividido muestra las otras cuentas', () => {
    assert.deepEqual(fila(cargar(), 'custom:z', 'p4')._otrasCuentas, [{ fuente: 'cajita:k1', monto: -200 }]);
  });
  test('un movimiento automático lleva la sección que lo originó (Mesada, Préstamos…) y candado', () => {
    const app = cargar();
    assert.equal(fila(app, 'custom:z', 'm19')._origen, 'Mesada');
    assert.equal(fila(app, 'custom:z', 'm19')._secundario, true);
    assert.equal(fila(app, 'cajita:k1', 'h1')._origen, 'Prestado · Me deben');
  });
});

describe('reglas que la función debe cumplir', () => {
  test('un ingreso de Alcancía sin cuenta de origen no aparece en el historial', () => {
    const app = cargar();
    for (const tipo of ['nequi', 'custom:z']) assert.ok(!filas(app, tipo).some(m => m._movId === 'm12' || m._movId === 'm20'), tipo);
  });
  test('un depósito a la alcancía sale como fila "alcancia" con monto oculto, en cuenta estándar y personalizada', () => {
    const app = cargar();
    const e = fila(app, 'nequi', 't04'), c = fila(app, 'custom:z', 't09');
    assert.equal(e.tipo, 'alcancia'); assert.equal(e._alcOculto, true);
    assert.equal(c.tipo, 'alcancia'); assert.equal(c._alcOculto, true);
  });
  test('el cobro de Spotify descuenta los abonos ya recibidos (no cuenta la plata dos veces)', () => {
    const app = cargar();
    assert.equal(fila(app, 'nequi', 'sp1').monto, 15000 - (5000 + 2000 + 1000));
    assert.equal(fila(app, 'efectivo', 'ab1').monto, 5000);
    assert.equal(fila(app, 'custom:z', 'ab2').monto, 2000);
  });
  test('un cobro de Spotify sin id recibe un id estable (sp_legacy_<índice>)', () => {
    assert.equal(filas(cargar(), 'custom:z').find(m => m.desc === 'Cobro Spotify (Sin id)')._movId, 'sp_legacy_1');
  });
  test('la pantalla de Nu ("nu") junta las filas de TODAS las cajitas, y solo de cajitas', () => {
    const fuentes = new Set(filas(cargar(), 'nu').map(m => m.fuente));
    assert.ok(fuentes.has('cajita:k1') && fuentes.has('cajita:k2'));
    assert.ok([...fuentes].every(f => f.startsWith('cajita:')));
  });
  test('los espejos de una cajita salen en su cajita y en "nu", no en otras cuentas', () => {
    const app = cargar();
    const nu = ids(app, 'nu');
    assert.ok(nu.includes('h1') && nu.includes('h2') && nu.includes('h4'));
    assert.ok(ids(app, 'cajita:k1').includes('h2') && !ids(app, 'cajita:k1').includes('h4'));
    assert.ok(!ids(app, 'nequi').includes('h1'));
  });
  test('una cuenta personalizada que ya no existe no revienta y aún muestra lo que apuntaba a ella', () => {
    const app = cargar();
    app.S.cuentas = app.S.cuentas.filter(c => c.id !== 'z');
    assert.ok(ids(app, 'custom:z').includes('zc1'));
  });
  test('sin datos devuelve una lista vacía', () => {
    const app = loadApp(ARCHIVOS, { permissive: true });
    assert.deepEqual(plano(app.getMovimientosCuenta('nequi')), []);
    assert.deepEqual(plano(app.getMovimientosCuenta('custom:nada')), []);
  });
  test('orden: fecha descendente', () => {
    const fs = filas(cargar(), 'nequi').map(m => m.fecha);
    assert.deepEqual(fs, [...fs].sort((a, b) => b.localeCompare(a)));
  });
});

describe('entradas del libro sin fila de módulo: intereses, ajustes y CDT salen como filas con candado', () => {
  const conLibro = () => {
    const app = cargar();
    app.S.libro = [
      { id: 'l1', fecha: '2026-10-05', cuenta: 'cajita:k1', monto: 12.5, tipo: 'rendimiento', desc: 'Intereses de Nu', origen: { modulo: 'cuentas' } },
      { id: 'l2', fecha: '2026-10-06', cuenta: 'cajita:k2', monto: -2000, tipo: 'cdt', desc: 'Capital invertido en CDT', origen: { modulo: 'cuentas' } },
      { id: 'l3', fecha: '2026-10-07', cuenta: 'efectivo', monto: -30, tipo: 'ajuste', desc: 'Diferencia sin explicar', origen: { modulo: 'cuentas' } },
      { id: 'l4', fecha: '2026-10-07', cuenta: 'efectivo', monto: 99, tipo: 'movimiento', origen: { modulo: 'prestado', ref: 'x' } },
    ];
    return app;
  };
  test('aparecen en la cuenta que cambiaron, en "nu" para las cajitas, con candado y origen "Libro"', () => {
    const app = conLibro();
    const r = fila(app, 'cajita:k1', 'l1');
    assert.deepEqual([r.tipo, r.monto, r._secundario, r._origen], ['ingreso', 12.5, true, 'Libro · Intereses de Nu']);
    assert.ok(ids(app, 'nu').includes('l1') && ids(app, 'nu').includes('l2'));
    const c = fila(app, 'nu', 'l2');
    assert.deepEqual([c.tipo, c.monto, c._origen], ['salida_manual', -2000, 'Libro · CDT']);
    assert.deepEqual([fila(app, 'efectivo', 'l3').tipo, fila(app, 'efectivo', 'l3')._origen], ['salida_manual', 'Libro · Ajuste']);
  });
  test('los movimientos de módulos del libro NO se duplican como fila: ya tienen la suya', () => {
    assert.ok(!ids(conLibro(), 'efectivo').includes('l4'));
  });
  test('no aparecen en otras cuentas', () => {
    assert.ok(!ids(conLibro(), 'nequi').includes('l1') && !ids(conLibro(), 'custom:z').includes('l3'));
  });
});
