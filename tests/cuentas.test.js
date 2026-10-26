'use strict';
// tests/cuentas.test.js — Cuentas y Nu: historial de cada cuenta, interés de cajitas y CDT, chequeo rápido, Restar dinero.
// Un archivo por sección de la app. Cada bloque `describe` es lo que antes era un archivo suelto.
// Corre con:  node --test tests/cuentas.test.js   (o todo: npm test)
const { describe } = require('node:test');

describe('historial-cuenta', () => {
  // tests/historial-cuenta.test.js — historial de una cuenta: UNA función (cuentas.js)
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
  const ARCHIVOS = [core('core-state.js'), core('calc-helpers.js'), core('cuenta-efectos.js'), modulo('nu.js'), modulo('cuentas.js')];

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
      { id: 'g07', fuente: 'nequi', desc: 'Espejo', _secundario: true, _origenSeccion: 'Prestado · Me deben', monto: 600, fecha: D(3) },
      { id: 'g08', fuente: 'cajita:k1', desc: 'Gasto cajita', cat: 'Otro', monto: 77, fecha: D(3) },
      { id: 'g09', fuente: 'custom:z', desc: 'Cine', cat: 'Ocio', nota: 'zn', monto: 88, fecha: D(3) },
      { id: 'g10', fuente: 'custom:z', desc: 'Mandado', nota: 'encargo foo', monto: 89, fecha: D(3) },
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
    S.spotify.historial = [
      { id: 'sp1', tipo: 'cobro', nombre: 'Ana', fuente: 'nequi', fecha: D(2), monto: 15000, pendienteHistorial: [
        { id: 'ab1', fecha: D(3), monto: 5000, destino: 'efectivo' }, { id: 'ab2', fecha: D(3), monto: 2000, destino: 'custom:z' }, { id: 'ab3', fecha: D(3), monto: 1000, destino: 'cajita:k1' }] },
      { id: 'sp9', tipo: 'cobro', nombre: 'Ana', fuente: 'custom:z', fecha: D(3), monto: 700 },
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
      'nequi': '?,?,?,?,m18,t06,t05,t04,p5,m11,g07,t01,sp1,p2,p1,m10,m09,m08,m06,g05,g04,g03,g01,m04,m01,m05',
      'efectivo': '?,p5,ab1,t02,t01,p2,m07,g02,m03,m02',
      'nu': 'sp4,t03,t03,p7,p4,m14,m13,h2,g08,ab3,t02,h1,h4',
      'cajita:k1': 'sp4,t03,p4,m13,h2,g08,ab3,t02,h1',
      'custom:z': 'zc8,zc7,zc4,m21,m19,m17,zc2,t09,t07,t06,t05,sp9,p4,m16,m15,g12,g10,g09,ab2,zc1,p3,zc3',
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

  describe('el tipo de una salida manual es el mismo en todas las cuentas (movimientos.js elige el borrado por ese tipo)', () => {
    test('cuenta personalizada: "salida_manual", como las demás (ya no existe "egreso")', () => {
      const app = cargar();
      assert.equal(fila(app, 'custom:z', 'm16').tipo, 'salida_manual');
      assert.equal(fila(app, 'custom:z', 'zc2').tipo, 'salida_manual');
      assert.ok(!filas(app, 'custom:z').some(m => m.tipo === 'egreso'));
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
});

describe('calcC-calcCDT', () => {
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const path = require('node:path');
  const { loadApp } = require('./support/load-app');

  const CORE_DIR = process.env.MIS_FINANZAS_CORE_DIR
    || path.join(__dirname, '..', 'js', 'core');
  const MODULES_DIR = process.env.MIS_FINANZAS_MODULES_DIR
    || path.join(__dirname, '..', 'js', 'modules');

  // calcC/calcCDT viven en js/core/nu-calc.js (núcleo, carga de entrada); cuentas.js sigue cargándose
  // por sus funciones de UI/mutación (materializarIntereses, etc.). cuentas.js referencia funciones de UI de otros archivos core que no
  // están en este harness (openSheet/toast/dialogo — sheet-stack.js /
  // events.js) a nivel de módulo. permissive:true las deja caer a no-op.
  // Ver tests/support/load-app.js para el porqué y el riesgo de esto.
  //
  // Se cargan prestado.js y calc-helpers.js también (aunque estos tests no
  // prueban sus funciones directamente): calcPatrimonioTotal() consulta
  // `Deudas` (js/core/calc-helpers.js) con un guard `typeof Deudas!=='undefined'`
  // — en modo permissive ESE guard siempre da true (el Proxy inventa un valor
  // para cualquier nombre), así que sin calc-helpers.js real cargado el guard
  // pasaría y `Deudas.totalPendiente(...)` no devolvería un número (NaN en la
  // resta final). Cargar el archivo real evita ese falso positivo del guard.
  // Orden igual que index.html: core-state.js → calc-helpers.js → módulos.
  function freshApp(sOverrides = {}) {
    const ctx = loadApp([
      path.join(CORE_DIR, 'core-state.js'), path.join(CORE_DIR, 'periodo.js'), path.join(CORE_DIR, 'nu-calc.js'),
      path.join(CORE_DIR, 'calc-helpers.js'),
      path.join(MODULES_DIR, 'nu.js'),
      path.join(MODULES_DIR, 'cuentas.js'),
      path.join(MODULES_DIR, 'prestado.js'),
    ], { permissive: true });
    Object.assign(ctx.S, sOverrides);
    return ctx;
  }

  function daysAgo(n) {
    const d = new Date(Date.now() - n * 86400000);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  test('calcC — cajita sin fecha (recién creada, saldo aún no empezó a ganar) devuelve el saldo tal cual', () => {
    const ctx = freshApp({ nuRate: 9.3 });
    const c = { id: 'nu1', nombre: 'Ahorros', saldo: 500000, fecha: null };
    const r = ctx.calcC(c);
    assert.equal(r.val, 500000);
    assert.equal(r.ganado, 0);
  });

  test('calcC — 365 días exactos a 9.3003% EA gana aprox el 9.3003% del saldo (la tasa ES la EA por definición)', () => {
    // Este es justo el número que laboratorio-cajitas-nu.html validó contra
    // la app real de Nu (ver memoria del proyecto): 9.3003% EA, diario
    // compuesto, base 365. Un año exacto de interés compuesto diario a la
    // tasa EA X% debe dar como resultado EXACTAMENTE X% de crecimiento —
    // es la propiedad matemática que define qué es una tasa "efectiva anual".
    const ctx = freshApp({ nuRate: 9.3003 });
    const c = { id: 'nu1', nombre: 'Ahorros', saldo: 1000000, fecha: daysAgo(365) };
    const r = ctx.calcC(c);
    const esperado = 1000000 * 1.093003;
    assert.ok(Math.abs(r.val - esperado) < 1, `esperaba ~${esperado}, dio ${r.val}`);
    assert.equal(r.dias, 365);
  });

  test('calcC — cambio de tasa a mitad de periodo compone por tramos, no con la tasa de hoy sobre todo', () => {
    // Simula: la cajita lleva 20 días abierta; la tasa era 9.0% los
    // primeros 10 días y subió a 9.3% hace 10 días. Los primeros 10 días
    // deben componer a la tasa vieja, los últimos 10 a la nueva — NO los
    // 20 días completos a la tasa nueva (lo que daría un cálculo ingenuo
    // sin tramos).
    //
    // OJO con _tasaVigenteEnFecha: una fecha anterior a CUALQUIER entrada
    // de historialTasasNu usa hist[0].tasa, NO nuRate — por eso acá
    // hay que registrar la tasa vieja como su propia entrada del
    // historial (no alcanza con nuRate solo).
    const tasaVieja = 9.0;
    const tasaNueva = 9.3;
    const inicioPeriodo = daysAgo(20);
    const fechaCambio = daysAgo(10);
    const ctxTramos = freshApp({
      nuRate: tasaNueva,
      historialTasasNu: [
        { fecha: inicioPeriodo, tasa: tasaVieja },
        { fecha: fechaCambio, tasa: tasaNueva },
      ],
    });
    const c1 = { id: 'nu1', saldo: 1000000, fecha: inicioPeriodo };
    const porTramos = ctxTramos.calcC(c1).val;

    const ctxIngenuo = freshApp({ nuRate: tasaNueva }); // sin historial → toda la tasa nueva
    const c2 = { id: 'nu1', saldo: 1000000, fecha: inicioPeriodo };
    const ingenuo = ctxIngenuo.calcC(c2).val;

    // Con tasa nueva > tasa vieja, componer 10 días a la vieja + 10 a la
    // nueva debe dar MENOS que componer los 20 días completos a la nueva.
    assert.ok(porTramos < ingenuo, `por tramos (${porTramos}) debería ser menor que ingenuo (${ingenuo})`);
  });

  test('calcC — incluye el saldo de encargos guardados en esa cajita como base del interés (gana intereses también)', () => {
    const ctx = freshApp({
      nuRate: 9.3,
      cajitas: [{ id: 'nu1', saldo: 500000, fecha: daysAgo(30) }],
      encargos: [{ saldoInicial: 200000, cuentaInicial: 'cajita:nu1', movimientos: [] }],
    });
    const c = ctx.S.cajitas[0];
    const conEncargo = ctx.calcC(c).val;

    const ctxSinEncargo = freshApp({
      nuRate: 9.3,
      cajitas: [{ id: 'nu1', saldo: 500000, fecha: daysAgo(30) }],
    });
    const sinEncargo = ctxSinEncargo.calcC(ctxSinEncargo.S.cajitas[0]).val;

    // Con más base (500k + 200k de encargo) el saldo PROPIO calculado
    // (val, que ya excluye el encargo) debe ser mayor que sin encargo,
    // porque el encargo también generó interés que queda a favor de quien
    // presta la cajita — ver comentario de calcC() en cuentas.js.
    assert.ok(conEncargo > sinEncargo, `con encargo (${conEncargo}) debería ganar más que sin encargo (${sinEncargo})`);
  });

  test('calcCDT — CDT vencido hoy mismo, sin fecha de vencimiento futura, calcula sobre los días transcurridos', () => {
    const ctx = freshApp();
    const cdt = { monto: 5000000, tasa: 9.5, rte: 4, inicio: daysAgo(90) };
    const r = ctx.calcCDT(cdt);
    assert.equal(r.dias, 90);
    assert.ok(r.ganado > 0, 'debería haber ganado algo en 90 días');
    assert.ok(r.retencion > 0, 'debería haber retención (RTE)');
    assert.equal(r.val, cdt.monto + r.ganado);
  });

  test('calcCDT — el bruto se redondea a los $0,50 más cercanos antes de aplicar RTE (regla real de Nu)', () => {
    const ctx = freshApp();
    const cdt = { monto: 3173456, tasa: 9.12, rte: 4, inicio: daysAgo(47) };
    const r = ctx.calcCDT(cdt);
    // El bruto redondeado siempre debe ser múltiplo de 0.5
    const esMultiploDeMedio = Math.abs((r.ganado_bruto * 2) - Math.round(r.ganado_bruto * 2)) < 1e-9;
    assert.ok(esMultiploDeMedio, `ganado_bruto (${r.ganado_bruto}) no es múltiplo de 0.5`);
  });

  test('calcCDT — sin monto o sin fecha de inicio, devuelve el monto tal cual sin ganar nada', () => {
    const ctx = freshApp();
    // JSON.parse/stringify: el objeto que devuelve calcCDT() lo crea el
    // código corriendo DENTRO del contexto vm (su propio realm, con su
    // propio Object.prototype) — assert.deepEqual directo contra un
    // objeto literal de este archivo compara también el prototipo y da
    // un falso negativo aunque los valores sean idénticos. Round-trip
    // por JSON lo normaliza a un objeto plano de este realm.
    assert.deepEqual(JSON.parse(JSON.stringify(ctx.calcCDT(null))), { val: 0, ganado: 0, ganado_bruto: 0, retencion: 0, dias: 0 });
    assert.equal(ctx.calcCDT({ monto: 100000 }).val, 100000); // sin `inicio`
  });

  test('calcPatrimonioTotal — usa calcC (interés real de nu-calc.js), no el saldo crudo', () => {
    const ctx = freshApp({
      nuRate: 9.3003,
      cajitas: [{ id: 'nu1', saldo: 1000000, fecha: daysAgo(365) }],
    });
    const patrimonio = ctx.calcPatrimonioTotal();
    // Sin interés daría exactamente 1000000; con calcC debe ser ~1093003 (ver test de 365 días arriba).
    assert.ok(patrimonio > 1050000, `esperaba patrimonio > 1.05M con interés real, dio ${patrimonio}`);
  });


  // ── Rendimientos por mes (Periodo.rendimientosDelMes): el interés se reparte por mes y se anota al materializar ──
  const mesDe = f => f.slice(0, 7);

  test('rendimientoCajitaPorMes — repartido por mes suma exactamente calcC(c).ganado y cada mes cae en su mes', () => {
    const ctx = freshApp({ nuRate: 9.3, cajitas: [] });
    const c = { id: 'nu1', nombre: 'Ahorros', saldo: 1000000, fecha: daysAgo(75) };
    const porMes = ctx.rendimientoCajitaPorMes(c);
    const suma = Object.values(porMes).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(suma - ctx.calcC(c).ganado) < 0.01, `suma ${suma} vs ${ctx.calcC(c).ganado}`);
    assert.ok(Object.keys(porMes).length >= 3, 'más de 75 días cruzan al menos 3 meses');
    assert.ok(Object.keys(porMes).every(k => /^\d{4}-\d{2}$/.test(k) && k >= mesDe(c.fecha)));
    assert.ok(porMes[mesDe(daysAgo(0))] > 0, 'el mes en curso también rinde');
  });

  test('calcC(c, hasta) — sin argumento es idéntico a antes; con una fecha pasada da el valor a ese día', () => {
    const ctx = freshApp({ nuRate: 9.3 });
    const c = { id: 'nu1', nombre: 'Ahorros', saldo: 1000000, fecha: daysAgo(40) };
    assert.equal(ctx.calcC(c).val, ctx.calcC(c, daysAgo(0)).val);
    assert.equal(ctx.calcC(c, c.fecha).ganado, 0);
    assert.ok(ctx.calcC(c, daysAgo(20)).ganado < ctx.calcC(c).ganado);
  });

  test('materializarIntereses — anota lo ganado por mes en c.rendimientos y Periodo.rendimientosDelMes lo reporta sin tocar el ingreso', () => {
    const c = { id: 'nu1', nombre: 'Ahorros', saldo: 1000000, fecha: daysAgo(75) };
    const ctx = freshApp({ nuRate: 9.3, cajitas: [c], movimientos: [], gastosVar: [], modulos: {}, ingresosFijos: [], pagosGastosFijos: {} });
    const ganado = ctx.calcC(c).ganado;
    ctx.materializarIntereses(c);
    const anotado = Object.values(c.rendimientos).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(anotado - ganado) < 0.05, `anotado ${anotado} vs ganado ${ganado}`);
    assert.equal(c.fecha, daysAgo(0), 'el saldo ya incluye el interés y el conteo reinicia');
    const mes = mesDe(daysAgo(0));
    assert.ok(Math.abs(ctx.Periodo.rendimientosDelMes(mes).cajitas - c.rendimientos[mes]) < 0.05, 'materializado + pendiente (≈0)');
    assert.equal(ctx.Periodo.ingresosDelMes(mes).total, 0, 'los rendimientos NO entran al ingreso operativo');
    assert.ok(ctx.Periodo.balanceDelMes(mes).rendimientos.total > 0);
  });
});

describe('cdt-campos', () => {
  // tests/cdt-campos.test.js — validación de campos del CDT y edición de un CDT existente (cuentas.js)
  // validarCamposCDT es pura y la usan crear y editar (misma regla en los dos). La edición no depende del saldo
  // de la cajita: el capital ya está invertido. Antes, al editar corrían a la vez el listener de "crear" y el
  // de "guardar": con la cajita en $0 salía "Saldo insuficiente" y, con saldo, se creaba un CDT duplicado.
  const { test, describe } = require('node:test');
  const assert = require('node:assert/strict');
  const path = require('node:path');
  const { loadApp } = require('./support/load-app');

  const RAIZ = path.join(__dirname, '..');
  const core = f => path.join(RAIZ, 'js', 'core', f);
  const modulo = f => path.join(RAIZ, 'js', 'modules', f);
  const ARCHIVOS = [core('core-state.js'), core('periodo.js'), core('nu-calc.js'), core('calc-helpers.js'), core('cuenta-efectos.js'), modulo('nu.js'), modulo('cuentas.js')];
  const plano = x => JSON.parse(JSON.stringify(x));

  const AHORA = new Date('2026-10-05T12:00:00');
  const base = { tasa: '9,25', rte: '4,00', inicio: '2026-10-01', vence: '2027-01-01', tasaDefecto: 9.25, rteDefecto: 4, inicioDefecto: '2026-10-05' };

  describe('validarCamposCDT', () => {
    const app = loadApp(ARCHIVOS, { permissive: true });
    const v = (campos) => plano(app.validarCamposCDT({ ...base, ...campos }, AHORA));

    test('campos válidos: devuelve tasa, rte y fechas ya interpretadas', () => {
      assert.deepEqual(v({}), { ok: true, tasa: 9.25, rte: 4, inicio: '2026-10-01', vence: '2027-01-01' });
    });
    test('tasa vacía usa el valor por defecto; tasa 0, negativa o texto se rechaza (no se vuelve 9,25 en silencio)', () => {
      assert.equal(v({ tasa: '' }).tasa, 9.25);
      assert.equal(v({ tasa: '', tasaDefecto: 11.5 }).tasa, 11.5);
      for (const tasa of ['0', '0,00', 'abc', '-3']) {
        const r = v({ tasa });
        assert.equal(r.ok, false, `tasa ${tasa}`);
        assert.match(r.mensaje, /tasa/i);
      }
    });
    test('RTE: vacía usa el defecto, 0 se respeta, punto o coma valen', () => {
      assert.equal(v({ rte: '' }).rte, 4);
      assert.equal(v({ rte: '', rteDefecto: 7 }).rte, 7);
      assert.equal(v({ rte: '0' }).rte, 0);
      assert.equal(v({ rte: '3,5' }).rte, 3.5);
      assert.equal(v({ rte: '3.5' }).rte, 3.5);
    });
    test('RTE no numérica, negativa o mayor a 100 se rechaza', () => {
      for (const rte of ['abc', '-1', '4%', '4,5,6']) assert.match(v({ rte }).mensaje, /no es un número válido/, `rte ${rte}`);
      assert.match(v({ rte: '150' }).mensaje, /no puede pasar de 100/);
    });
    test('apertura vacía usa el defecto; una apertura futura se rechaza', () => {
      assert.equal(v({ inicio: '' }).inicio, '2026-10-05');
      assert.match(v({ inicio: '2030-01-01' }).mensaje, /no puede ser futura/);
    });
    test('vencimiento obligatorio y posterior a la apertura (el mismo día tampoco vale)', () => {
      assert.match(v({ vence: '' }).mensaje, /Debes definir la fecha de vencimiento/);
      assert.match(v({ vence: '2026-10-01' }).mensaje, /posterior a la apertura/);
      assert.match(v({ vence: '2026-09-01' }).mensaje, /posterior a la apertura/);
      assert.equal(v({ vence: '2026-10-02' }).ok, true);
    });
  });

  describe('editar un CDT existente', () => {
    function domFalso(app) {
      const cache = {};
      const el = () => ({ value: '', textContent: '', innerHTML: '', checked: false, style: {}, dataset: {}, readOnly: false, focus() {}, addEventListener() {},
        dispatchEvent() {}, querySelector: () => null, querySelectorAll: () => [], classList: { add() {}, remove() {}, toggle() {}, contains: () => false } });
      app.document.getElementById = id => (cache[id] = cache[id] || el());
      return cache;
    }
    function entorno({ saldo }) {
      const app = loadApp(ARCHIVOS, { permissive: true });
      Object.assign(app.S, { movimientos: [], gastosVar: [], encargos: [], historialTasasNu: [],
        cuentas: [{ id: 'nequi', tipo: 'nequi', saldo: 0 }, { id: 'efectivo', tipo: 'efectivo', saldo: 0 }],
        cajitas: [{ id: 'a', nombre: 'A', saldo, fecha: app.hoy(),
          cdts: [{ id: 'd1', monto: 1000000, tasa: 9.25, rte: 4, inicio: '2026-01-01', vence: '2027-01-01' }] }] });
      const campos = domFalso(app);
      const toasts = [], cerrados = [];
      let guardados = 0;
      app.toast = (msg, tipo) => toasts.push({ msg, tipo });
      app.dialogo = async () => true;
      app.closeSheet = n => cerrados.push(n);
      app.openSheet = () => {};
      app.save = () => { guardados++; };
      app.refresh = () => {};
      return { app, campos, toasts, cerrados, guardados: () => guardados, cajita: () => app.S.cajitas[0], cdt: () => app.S.cajitas[0].cdts[0] };
    }
    async function abrirEdicion(e) {
      await e.app.editarCDT('a', 'd1');
      assert.equal(e.campos.cdt_monto.readOnly, true, 'el capital queda de solo lectura');
      assert.equal(e.campos.cdtSheetTitle.textContent, 'Editar CDT');
      assert.equal(e.campos['btn-confirmar-crear-cdt'].textContent, 'Guardar cambios');
    }

    for (const saldo of [0, 5000000]) {
      test(`con la cajita en $${saldo}: solo "CDT actualizado", sin crear otro CDT ni mover plata`, async () => {
        const e = entorno({ saldo }); await abrirEdicion(e);
        e.campos.cdt_tasa.value = '10,5'; e.campos.cdt_vence.value = '2027-06-01';
        e.app.confirmarSheetCDT();
        assert.deepEqual(plano(e.toasts), [{ msg: 'CDT actualizado', tipo: 'ok' }]);
        assert.equal(e.cajita().cdts.length, 1);
        assert.equal(e.cajita().saldo, saldo);
        assert.equal(e.cdt().tasa, 10.5);
        assert.equal(e.cdt().vence, '2027-06-01');
        assert.equal(e.cdt().monto, 1000000, 'el capital no cambia');
        assert.deepEqual(plano(e.cerrados), ['crear-cdt']);
        assert.equal(e.campos['btn-confirmar-crear-cdt'].textContent, 'Crear CDT', 'el sheet vuelve a modo crear');
      });
    }
    test('un error de validación no modifica el CDT y el sheet sigue abierto para corregir', async () => {
      for (const [campo, valor] of [['cdt_vence', '2026-01-01'], ['cdt_vence', ''], ['cdt_rte', 'abc'], ['cdt_rte', '150'], ['cdt_tasa', '0'], ['cdt_inicio', '2030-01-01']]) {
        const e = entorno({ saldo: 0 }); await abrirEdicion(e);
        e.campos[campo].value = valor;
        e.app.confirmarSheetCDT();
        assert.equal(e.toasts.at(-1).tipo, 'err', `${campo}=${valor}`);
        assert.equal(e.cdt().tasa, 9.25, `${campo}=${valor}`);
        assert.equal(e.cerrados.length, 0, `${campo}=${valor}: no se cierra`);
        assert.equal(e.guardados(), 0, `${campo}=${valor}: no se guarda`);
      }
    });
    test('la RTE 0 se acepta al editar', async () => {
      const e = entorno({ saldo: 0 }); await abrirEdicion(e);
      e.campos.cdt_rte.value = '0'; e.app.confirmarSheetCDT();
      assert.equal(e.cdt().rte, 0);
    });
    test('cancelar la edición y abrir "crear": el sheet vuelve a modo crear y no pisa el CDT anterior', async () => {
      const e = entorno({ saldo: 5000000 }); await abrirEdicion(e);
      e.app.abrirCrearCDT('a');
      assert.equal(e.campos.cdt_monto.readOnly, false);
      assert.equal(e.campos.cdtSheetTitle.textContent, 'Crear CDT en cajita');
      assert.equal(e.campos['btn-confirmar-crear-cdt'].textContent, 'Crear CDT');
      e.campos.cdt_monto.value = '200.000,00'; e.campos.cdt_tasa.value = '8';
      e.campos.cdt_inicio.value = '2026-10-01'; e.campos.cdt_vence.value = '2027-06-01'; e.campos.cdt_rte.value = '4';
      e.app.confirmarSheetCDT();
      assert.equal(e.cajita().cdts.length, 2);
      assert.equal(Math.round(e.cajita().saldo), 4800000);
      assert.equal(e.cajita().cdts[0].tasa, 9.25, 'el CDT existente no se toca');
    });
  });
});

describe('chequeo-nu', () => {
  // tests/chequeo-nu.test.js — "Chequeo rápido de cajitas Nu" y "Agregar dinero" (cuentas.js)
  // Para el chequeo, un campo vacío o en 0 significa "no anoté nada": antes se guardaba como lectura real, ponía la cajita en
  // 0 y ensuciaba S.chequeosNu.
  const { test, describe } = require('node:test');
  const assert = require('node:assert/strict');
  const path = require('node:path');
  const { loadApp } = require('./support/load-app');

  const RAIZ = path.join(__dirname, '..');
  const core = f => path.join(RAIZ, 'js', 'core', f);
  const modulo = f => path.join(RAIZ, 'js', 'modules', f);
  const ARCHIVOS = [core('core-state.js'), core('periodo.js'), core('nu-calc.js'), core('calc-helpers.js'), core('cuenta-efectos.js'), modulo('nu.js'), modulo('cuentas.js')];
  const plano = x => JSON.parse(JSON.stringify(x));

  function entornoChequeo({ cajitas, lecturas, dialogoRespuesta = true }) {
    const app = loadApp(ARCHIVOS, { permissive: true });
    const hoyStr = app.hoy();
    // El chequeo solo existe con la tasa configurada y con cajitas que ya llevan un día completo de intereses
    // (por defecto, 3 días: así las pruebas de abajo siguen midiendo lo suyo; qué cajitas entran se prueba en
    // 'chequeo-nu — qué cajitas entran').
    const hace3 = new Date(Date.now() - 3 * 86400000);
    const fechaApta = hace3.getFullYear() + '-' + String(hace3.getMonth() + 1).padStart(2, '0') + '-' + String(hace3.getDate()).padStart(2, '0');
    Object.assign(app.S, { movimientos: [], gastosVar: [], encargos: [], chequeosNu: [], historialTasasNu: [], nuRate: 9.3,
      cuentas: [{ id: 'nequi', tipo: 'nequi', saldo: 0 }, { id: 'efectivo', tipo: 'efectivo', saldo: 0 }],
      cajitas: cajitas.map(c => ({ nombre: c.id.toUpperCase(), fecha: fechaApta, ...c })) });
    const inputs = Object.entries(lecturas).map(([id, value]) => ({ value, dataset: { chqCajita: id } }));
    app.document.querySelectorAll = sel => (String(sel).includes('data-chq-cajita') ? inputs : []);
    const toasts = [], dialogos = [], cerrados = [];
    let guardados = 0;
    app.toast = (msg, tipo) => toasts.push({ msg, tipo });
    app.dialogo = async (...a) => { dialogos.push(a); return dialogoRespuesta; };
    app.closeSheet = n => cerrados.push(n);
    app.save = () => { guardados++; };
    app.refresh = () => {};
    return { app, hoyStr, toasts, dialogos, cerrados, guardados: () => guardados,
      cajita: id => app.S.cajitas.find(c => c.id === id) };
  }

  describe('guardarChequeoNu — campos sin anotar', () => {
    test('una cajita real + otra que se tocó y quedó en 0,00: solo se guarda la real', async () => {
      const e = entornoChequeo({ cajitas: [{ id: 'a', saldo: 100000 }, { id: 'b', saldo: 500000 }], lecturas: { a: '100.500,00', b: '0,00' } });
      await e.app.guardarChequeoNu();
      assert.equal(e.cajita('a').saldo, 100500);
      assert.equal(e.cajita('b').saldo, 500000, 'la cajita sin anotar no se toca (antes quedaba en 0)');
      assert.deepEqual(plano(e.app.S.chequeosNu), [{ fecha: e.hoyStr, cajitaId: 'a', saldoReal: 100500 }]);
      assert.equal(e.guardados(), 1);
    });
    test('una cajita con saldo chico (< $1.000) tampoco se pone en 0 por tocarla', async () => {
      // Con el código anterior el aviso de "se aleja mucho" no saltaba por debajo de $1.000: se ponía en 0 en silencio.
      const e = entornoChequeo({ cajitas: [{ id: 'a', saldo: 100000 }, { id: 'b', saldo: 800 }], lecturas: { a: '100.000,00', b: '0,00' } });
      await e.app.guardarChequeoNu();
      assert.equal(e.cajita('b').saldo, 800);
      assert.equal(e.app.S.chequeosNu.some(c => c.cajitaId === 'b'), false);
    });
    test('todo en 0,00 o vacío: avisa y no guarda nada', async () => {
      for (const lecturas of [{ a: '0,00', b: '0,00' }, { a: '', b: '' }]) {
        const e = entornoChequeo({ cajitas: [{ id: 'a', saldo: 1000 }, { id: 'b', saldo: 2000 }], lecturas });
        await e.app.guardarChequeoNu();
        assert.match(e.toasts.at(-1).msg, /No pusiste ningún saldo/);
        assert.equal(e.guardados(), 0);
        assert.equal(e.cerrados.length, 0);
        assert.equal(e.app.S.chequeosNu.length, 0);
        assert.equal(e.cajita('a').saldo, 1000);
      }
    });
  });

  describe('guardarChequeoNu — comportamiento que no debe cambiar', () => {
    test('una lectura normal corrige el saldo, la fecha y guarda el chequeo', async () => {
      const e = entornoChequeo({ cajitas: [{ id: 'a', saldo: 100000, fecha: '2026-01-01' }], lecturas: { a: '100.300,00' } });
      // fecha vieja → el calculado ya incluye intereses de meses: se acepta lo anotado de todos modos
      await e.app.guardarChequeoNu();
      assert.equal(e.cajita('a').saldo, 100300);
      assert.equal(e.cajita('a').fecha, e.hoyStr);
      assert.equal(e.app.S.chequeosNu.length, 1);
    });
    test('un valor muy lejano al calculado pide confirmación; si se cancela no se guarda nada', async () => {
      const e = entornoChequeo({ cajitas: [{ id: 'a', saldo: 100000 }], lecturas: { a: '900.000,00' }, dialogoRespuesta: false });
      await e.app.guardarChequeoNu();
      assert.equal(e.dialogos.length, 1);
      assert.equal(e.cajita('a').saldo, 100000);
      assert.equal(e.app.S.chequeosNu.length, 0);
      assert.equal(e.guardados(), 0);
    });
    test('si se confirma el aviso, se guarda', async () => {
      const e = entornoChequeo({ cajitas: [{ id: 'a', saldo: 100000 }], lecturas: { a: '900.000,00' }, dialogoRespuesta: true });
      await e.app.guardarChequeoNu();
      assert.equal(e.cajita('a').saldo, 900000);
      assert.equal(e.app.S.chequeosNu.length, 1);
    });
    test('un segundo chequeo el mismo día reemplaza al primero (no duplica)', async () => {
      const e = entornoChequeo({ cajitas: [{ id: 'a', saldo: 100000 }], lecturas: { a: '100.100,00' } });
      await e.app.guardarChequeoNu();
      e.app.document.querySelectorAll = () => [{ value: '100.200,00', dataset: { chqCajita: 'a' } }];
      await e.app.guardarChequeoNu();
      assert.equal(e.app.S.chequeosNu.length, 1);
      assert.equal(e.app.S.chequeosNu[0].saldoReal, 100200);
    });
  });

  describe('confirmarAgregarDinero', () => {
    function entornoAgregar({ monto, desc = 'Mesada' }) {
      const app = loadApp(ARCHIVOS, { permissive: true });
      Object.assign(app.S, { cajitas: [], movimientos: [], gastosVar: [],
        cuentas: [{ id: 'nequi', tipo: 'nequi', saldo: 1000 }, { id: 'efectivo', tipo: 'efectivo', saldo: 0 }] });
      const el = (x = {}) => ({ value: '', textContent: '', innerHTML: '', checked: false, style: {}, focus() {}, ...x });
      const campos = { adTitle: el(), adSaldoActual: el(), adMonto: el(), adDesc: el(), adFecha: el(), adNota: el(), adPreview: el(), adEsApertura: el(), adDescLabel: el() };
      app.document.getElementById = id => campos[id] || null;
      const toasts = [], cerrados = [];
      let guardados = 0;
      app.toast = (msg, tipo) => toasts.push({ msg, tipo });
      app.closeSheet = n => cerrados.push(n);
      app.openSheet = () => {};
      app.save = () => { guardados++; };
      app.refresh = () => {};
      app.fuenteLabel = f => ({ nequi: 'Nequi' }[f] || f);
      app.abrirAgregarDinero('nequi', 'Nequi');
      guardados = 0;
      campos.adMonto.value = monto; campos.adDesc.value = desc; campos.adFecha.value = '2026-10-05';
      return { app, toasts, cerrados, guardados: () => guardados, saldo: () => app.getSaldoFuente('nequi') };
    }
    test('un monto válido suma, registra y cierra', () => {
      const e = entornoAgregar({ monto: '500,00' });
      e.app.confirmarAgregarDinero();
      assert.equal(e.saldo(), 1500);
      assert.equal(e.app.S.movimientos.length, 1);
      assert.deepEqual(plano(e.cerrados), ['agregar-dinero']);
    });
    test('monto 0 o vacío avisa (antes: no pasaba nada y no se sabía por qué) y no mueve nada', () => {
      for (const monto of ['0,00', '']) {
        const e = entornoAgregar({ monto });
        e.app.confirmarAgregarDinero();
        assert.equal(e.toasts.at(-1).msg, 'Ingresa un monto válido');
        assert.equal(e.saldo(), 1000);
        assert.equal(e.app.S.movimientos.length, 0);
        assert.equal(e.guardados(), 0);
      }
    });
    test('sin descripción pide la descripción', () => {
      const e = entornoAgregar({ monto: '500,00', desc: '' });
      e.app.confirmarAgregarDinero();
      assert.match(e.toasts.at(-1).msg, /Describe/);
      assert.equal(e.saldo(), 1000);
    });
  });
});

describe('nu-cdt', () => {
  // tests/nu-cdt.test.js — "Salió plata de Nu" y "Crear CDT" (cuentas.js)
  const { test, describe } = require('node:test');
  const assert = require('node:assert/strict');
  const path = require('node:path');
  const { loadApp } = require('./support/load-app');

  const RAIZ = path.join(__dirname, '..');
  const core = f => path.join(RAIZ, 'js', 'core', f);
  const modulo = f => path.join(RAIZ, 'js', 'modules', f);
  const ARCHIVOS = [core('core-state.js'), core('periodo.js'), core('nu-calc.js'), core('calc-helpers.js'), core('cuenta-efectos.js'), modulo('nu.js'), modulo('cuentas.js')];
  const plano = x => JSON.parse(JSON.stringify(x));

  // Elemento DOM falso que se crea al pedirlo por id (los campos del sheet se llenan DESPUÉS de abrirlo,
  // porque abrirNuMovimiento/abrirCrearCDT los limpian).
  function domFalso(app) {
    const cache = {};
    const el = () => ({ value: '', textContent: '', innerHTML: '', checked: false, style: {}, dataset: {}, focus() {}, addEventListener() {},
      querySelector: () => null, querySelectorAll: () => [], classList: { add() {}, remove() {}, toggle() {}, contains: () => false } });
    app.document.getElementById = id => (cache[id] = cache[id] || el());
    return cache;
  }

  function entornoNu({ tipo = 'salida', saldo = 5000, monto, desc = 'Pago', nombre = 'Cajita <A>' }) {
    const app = loadApp(ARCHIVOS, { permissive: true });
    Object.assign(app.S, { movimientos: [], gastosVar: [], encargos: [], historialTasasNu: [], nuRate: 9.3,
      cuentas: [{ id: 'nequi', tipo: 'nequi', saldo: 0 }, { id: 'efectivo', tipo: 'efectivo', saldo: 0 }],
      cajitas: [{ id: 'a', nombre, saldo, fecha: app.hoy() }] });
    const campos = domFalso(app);
    // La cajita única se auto-selecciona al abrir: se simula el click que dispara el handler real.
    const cajitaEl = { dataset: { nuCajita: 'cajita:a' }, style: {}, handlers: {}, addEventListener(ev, fn) { this.handlers[ev] = fn; }, click() { this.handlers.click.call(this); } };
    campos.nuMovCajitasWrap = { innerHTML: '', querySelectorAll: () => [cajitaEl], querySelector: () => cajitaEl };
    const toasts = [], cerrados = [];
    let guardados = 0;
    app.toast = (msg, t, ms) => toasts.push({ msg, tipo: t, ms });
    app.closeSheet = n => cerrados.push(n);
    app.openSheet = () => {};
    app.save = () => { guardados++; };
    app.refresh = () => {};
    app.abrirNuMovimiento(tipo);
    guardados = 0;
    campos.nuMovMonto.value = monto; campos.nuMovDesc.value = desc; campos.nuMovFecha.value = '2026-10-05';
    const saldoCajita = () => app.getSaldoFuente('cajita:a');
    return { app, toasts, cerrados, guardados: () => guardados, saldoCajita, cajita: () => app.S.cajitas[0] };
  }

  describe('confirmarNuMovimiento — salida', () => {
    test('sacar menos que el saldo: descuenta, registra el movimiento y cierra', () => {
      const e = entornoNu({ saldo: 5000, monto: '2.000,00' });
      e.app.confirmarNuMovimiento();
      assert.equal(Math.round(e.saldoCajita()), 3000);
      assert.equal(e.app.S.movimientos.length, 1);
      assert.equal(e.app.S.movimientos[0].monto, 2000);
      assert.equal(e.app.S.movimientos[0].fuente, 'cajita:a');
      assert.equal(e.guardados(), 1);
      assert.deepEqual(plano(e.cerrados), ['nu-movimiento']);
    });
    test('sacar exactamente todo el saldo funciona', () => {
      const e = entornoNu({ saldo: 5000, monto: '5.000,00' });
      e.app.confirmarNuMovimiento();
      assert.equal(Math.round(e.saldoCajita()), 0);
      assert.equal(e.app.S.movimientos.length, 1);
    });
    test('sacar MÁS que el saldo: no mueve nada, no toca la cajita y avisa (antes: saldo 0 y movimiento por el monto completo)', () => {
      const e = entornoNu({ saldo: 5000, monto: '20.000,00' });
      const antes = JSON.stringify(e.cajita());
      e.app.confirmarNuMovimiento();
      assert.equal(JSON.stringify(e.cajita()), antes, 'ni siquiera materializa intereses a medias');
      assert.equal(e.app.S.movimientos.length, 0);
      assert.equal(e.guardados(), 0);
      assert.equal(e.cerrados.length, 0);
      assert.match(e.toasts.at(-1).msg, /Saldo insuficiente en Cajita &lt;A&gt; \(\$5\.000\)/);
      assert.equal(e.toasts.at(-1).ms, 3500);
    });
    test('una ENTRADA no se limita por el saldo', () => {
      const e = entornoNu({ tipo: 'entrada', saldo: 100, monto: '20.000,00', desc: 'Sueldo' });
      e.app.confirmarNuMovimiento();
      assert.equal(Math.round(e.saldoCajita()), 20100);
      assert.equal(e.app.S.movimientos.length, 1);
    });
    test('monto 0 avisa y no mueve nada', () => {
      const e = entornoNu({ saldo: 5000, monto: '0,00' });
      e.app.confirmarNuMovimiento();
      assert.equal(e.app.S.movimientos.length, 0);
      assert.equal(e.guardados(), 0);
    });
  });

  describe('confirmarCrearCDT — RTE', () => {
    function entornoCDT({ rte, monto = '100.000,00', saldo = 1000000 }) {
      const app = loadApp(ARCHIVOS, { permissive: true });
      Object.assign(app.S, { movimientos: [], gastosVar: [], encargos: [], historialTasasNu: [],
        cuentas: [{ id: 'nequi', tipo: 'nequi', saldo: 0 }, { id: 'efectivo', tipo: 'efectivo', saldo: 0 }],
        cajitas: [{ id: 'a', nombre: 'A', saldo, fecha: app.hoy() }] });
      const campos = domFalso(app);
      const toasts = [], cerrados = [];
      let guardados = 0;
      app.toast = (msg, t) => toasts.push({ msg, tipo: t });
      app.closeSheet = n => cerrados.push(n);
      app.openSheet = () => {};
      app.save = () => { guardados++; };
      app.refresh = () => {};
      app.abrirCrearCDT('a');
      guardados = 0;
      const venceAnio = String(new Date().getFullYear() + 1) + '-06-15';
      Object.assign(campos.cdt_monto, { value: monto }); Object.assign(campos.cdt_tasa, { value: '9,25' });
      Object.assign(campos.cdt_rte, { value: rte }); Object.assign(campos.cdt_inicio, { value: app.hoy() });
      Object.assign(campos.cdt_vence, { value: venceAnio });
      return { app, toasts, cerrados, guardados: () => guardados, cdts: () => app.S.cajitas[0].cdts || [] };
    }
    test('RTE "4,00" (el valor por defecto del formulario) → 4', () => {
      const e = entornoCDT({ rte: '4,00' }); e.app.confirmarCrearCDT();
      assert.equal(e.cdts().length, 1); assert.equal(e.cdts()[0].rte, 4);
    });
    test('RTE vacío → 4 (por defecto)', () => {
      const e = entornoCDT({ rte: '' }); e.app.confirmarCrearCDT();
      assert.equal(e.cdts().length, 1); assert.equal(e.cdts()[0].rte, 4);
    });
    test('RTE 0 se respeta (antes la creación lo convertía en 4; la edición ya lo aceptaba)', () => {
      for (const rte of ['0', '0,00']) {
        const e = entornoCDT({ rte }); e.app.confirmarCrearCDT();
        assert.equal(e.cdts().length, 1, `rte ${rte}`); assert.equal(e.cdts()[0].rte, 0, `rte ${rte}`);
      }
    });
    test('RTE con decimales y punto o coma', () => {
      for (const [rte, esperado] of [['3,5', 3.5], ['3.5', 3.5], ['7', 7]]) {
        const e = entornoCDT({ rte }); e.app.confirmarCrearCDT();
        assert.equal(e.cdts()[0].rte, esperado, `rte ${rte}`);
      }
    });
    test('RTE no numérico, negativo o > 100 se rechaza y no crea nada ni toca el saldo', () => {
      for (const rte of ['abc', '-1', '4%', '150', '4,5,6']) {
        const e = entornoCDT({ rte }); e.app.confirmarCrearCDT();
        assert.equal(e.cdts().length, 0, `rte ${rte}`);
        assert.equal(e.guardados(), 0, `rte ${rte}`);
        assert.equal(Math.round(e.app.S.cajitas[0].saldo), 1000000, `rte ${rte}`);
        assert.equal(e.toasts.at(-1).tipo, 'err', `rte ${rte}`);
      }
    });
    test('un CDT válido descuenta el monto de la cajita', () => {
      const e = entornoCDT({ rte: '4,00', monto: '100.000,00' }); e.app.confirmarCrearCDT();
      assert.equal(Math.round(e.app.S.cajitas[0].saldo), 900000);
      assert.equal(e.cdts()[0].monto, 100000);
    });
    test('monto mayor al saldo de la cajita se rechaza', () => {
      const e = entornoCDT({ rte: '4,00', monto: '2.000.000,00' }); e.app.confirmarCrearCDT();
      assert.equal(e.cdts().length, 0);
      assert.match(e.toasts.at(-1).msg, /Saldo insuficiente/);
    });
  });
});

describe('restar-dinero', () => {
  // tests/restar-dinero.test.js — "Restar dinero" de una cuenta (cuentas.js)
  // descontarFuente() recorta el saldo en 0, pero registrarSalida() guarda el monto COMPLETO. Sin una
  // guarda de saldo, restar más de lo que hay deja el historial diciendo que salió más plata de la que
  // había, y borrar ese movimiento (sumarFuente(monto)) devuelve de más.
  const { test, describe } = require('node:test');
  const assert = require('node:assert/strict');
  const path = require('node:path');
  const { loadApp } = require('./support/load-app');

  const RAIZ = path.join(__dirname, '..');
  const core = f => path.join(RAIZ, 'js', 'core', f);
  const modulo = f => path.join(RAIZ, 'js', 'modules', f);
  const ARCHIVOS = [core('core-state.js'), core('calc-helpers.js'), core('fuentes-filtro.js'), core('cuenta-efectos.js'), modulo('nu.js'), modulo('cuentas.js')];
  const plano = x => JSON.parse(JSON.stringify(x));

  function entorno({ fuente = 'nequi', saldo = 5000, monto, desc = 'Retiro de prueba' }) {
    const app = loadApp(ARCHIVOS, { permissive: true });
    Object.assign(app.S, { cajitas: [], movimientos: [], gastosVar: [], cuentas: [
      { id: 'nequi', tipo: 'nequi', saldo: 0 }, { id: 'efectivo', tipo: 'efectivo', saldo: 0 },
      { id: 'z', tipo: 'custom', nombre: 'Ahorro <z>', saldo: 0, movimientos: [] }] });
    app.getCuenta('nequi').saldo = fuente === 'nequi' ? saldo : 0;
    app.getCuenta('z').saldo = fuente === 'custom:z' ? saldo : 0;
    const el = (extra = {}) => ({ value: '', textContent: '', style: {}, focus() {}, ...extra });
    const campos = { rdMonto: el(), rdDesc: el(), rdFecha: el(), rdNota: el(), rdTitle: el(), rdSaldoActual: el(), rdPreview: el() };
    app.document.getElementById = id => campos[id] || null;
    const toasts = [], cerrados = [];
    let guardados = 0;
    app.toast = (msg, tipo, ms) => toasts.push({ msg, tipo, ms });
    app.closeSheet = n => cerrados.push(n);
    app.openSheet = () => {};
    app.save = () => { guardados++; };
    app.refresh = () => {};
    app.fuenteLabel = f => ({ nequi: 'Nequi', efectivo: 'Efectivo', 'custom:z': 'Ahorro <z>' }[f] || f);
    app.abrirRestarDinero(fuente, 'Cuenta'); // abre el sheet y limpia los campos: se llenan DESPUÉS
    guardados = 0; // abrirRestarDinero() hace un save() al abrir: no cuenta como efecto de confirmar
    campos.rdMonto.value = monto; campos.rdDesc.value = desc; campos.rdFecha.value = '2026-10-05';
    return { app, toasts, cerrados, guardados: () => guardados, saldo: () => app.getSaldoFuente(fuente) };
  }

  describe('confirmarRestarDinero', () => {
    test('restar menos que el saldo: descuenta, registra el movimiento y cierra', () => {
      const e = entorno({ saldo: 5000, monto: '2.000,00' });
      e.app.confirmarRestarDinero();
      assert.equal(e.saldo(), 3000);
      assert.equal(e.app.S.movimientos.length, 1);
      assert.equal(e.app.S.movimientos[0].monto, 2000);
      assert.equal(e.app.S.movimientos[0].tipo, 'salida_manual');
      assert.equal(e.app.S.movimientos[0].clase, 'gasto', 'restar dinero es un gasto del mes');
      assert.equal(e.guardados(), 1);
      assert.deepEqual(plano(e.cerrados), ['restar-dinero']);
    });
    test('restar exactamente todo el saldo funciona', () => {
      const e = entorno({ saldo: 5000, monto: '5.000,00' });
      e.app.confirmarRestarDinero();
      assert.equal(e.saldo(), 0);
      assert.equal(e.app.S.movimientos.length, 1);
    });
    test('restar MÁS que el saldo: no mueve nada y avisa (antes: saldo 0 y movimiento por el monto completo)', () => {
      const e = entorno({ saldo: 5000, monto: '20.000,00' });
      e.app.confirmarRestarDinero();
      assert.equal(e.saldo(), 5000, 'el saldo no cambia');
      assert.equal(e.app.S.movimientos.length, 0, 'no se registra ningún movimiento');
      assert.equal(e.guardados(), 0);
      assert.equal(e.cerrados.length, 0, 'el sheet sigue abierto para corregir el monto');
      assert.match(e.toasts.at(-1).msg, /Saldo insuficiente en Nequi \(\$5\.000\)/);
      assert.equal(e.toasts.at(-1).tipo, 'err');
    });
    test('un centavo de más ya es "insuficiente" (compara en centavos)', () => {
      const e = entorno({ saldo: 5000, monto: '5.000,01' });
      e.app.confirmarRestarDinero();
      assert.equal(e.app.S.movimientos.length, 0);
      assert.match(e.toasts.at(-1).msg, /Saldo insuficiente/);
    });
    test('el nombre de la cuenta va escapado en el aviso', () => {
      const e = entorno({ fuente: 'custom:z', saldo: 100, monto: '500,00' });
      e.app.confirmarRestarDinero();
      assert.match(e.toasts.at(-1).msg, /Ahorro &lt;z&gt;/);
      assert.ok(!e.toasts.at(-1).msg.includes('<z>'));
    });
    test('monto 0 o vacío avisa (antes: no pasaba nada y no se sabía por qué) y no mueve nada', () => {
      for (const monto of ['0,00', '']) {
        const e = entorno({ saldo: 5000, monto });
        e.app.confirmarRestarDinero();
        assert.equal(e.saldo(), 5000);
        assert.equal(e.app.S.movimientos.length, 0);
        assert.equal(e.toasts.at(-1).msg, 'Ingresa un monto válido');
      }
    });
    test('sin descripción: avisa primero lo de la descripción y no mueve nada', () => {
      const e = entorno({ saldo: 5000, monto: '1.000,00', desc: '' });
      e.app.confirmarRestarDinero();
      assert.equal(e.saldo(), 5000);
      assert.match(e.toasts.at(-1).msg, /Describe/);
    });
    test('restar y borrar el movimiento deja el saldo como estaba (consistencia con la reversión)', () => {
      const e = entorno({ saldo: 5000, monto: '2.000,00' });
      e.app.confirmarRestarDinero();
      const m = e.app.S.movimientos[0];
      e.app.sumarFuente(m.fuente, m.monto); // lo que hace movimientos.js al borrar una salida_manual
      assert.equal(e.saldo(), 5000);
    });
  });
});

describe('transferir', () => {
  // tests/transferir.test.js — validación y confirmación de Transferir (cuentas.js)
  // Carga los archivos REALES con tests/support/load-app.js (permissive: cuentas.js
  // referencia funciones de UI que el harness no carga). Orden = index.html:
  // core-state → calc-helpers → cuenta-efectos → cuentas.
  const { test, describe } = require('node:test');
  const assert = require('node:assert/strict');
  const path = require('node:path');
  const { loadApp } = require('./support/load-app');

  const RAIZ = path.join(__dirname, '..');
  const core = f => path.join(RAIZ, 'js', 'core', f);
  const modulo = f => path.join(RAIZ, 'js', 'modules', f);
  const ARCHIVOS = [core('core-state.js'), core('calc-helpers.js'), core('cuenta-efectos.js'), modulo('nu.js'), modulo('cuentas.js')];
  const plano = x => JSON.parse(JSON.stringify(x)); // objetos del vm → datos planos

  function cargar() { return loadApp(ARCHIVOS, { permissive: true }); }
  const validar = cargar().validarTransferencia;
  const T = o => validar({ saldoOrigen: 1e9, ...o });

  describe('validarTransferencia — formulario incompleto o inválido', () => {
    test('sin origen o sin destino → falta_cuenta', () => {
      assert.equal(T({ origen: '', destino: 'nequi', monto: 100 }).codigo, 'falta_cuenta');
      assert.equal(T({ origen: 'nequi', destino: '', monto: 100 }).codigo, 'falta_cuenta');
      assert.equal(validar().codigo, 'falta_cuenta');
    });
    test('origen igual a destino → mismo (antes que el monto)', () => {
      assert.equal(T({ origen: 'nequi', destino: 'nequi', monto: 100 }).codigo, 'mismo');
      assert.equal(T({ origen: 'nequi', destino: 'nequi', monto: 0 }).codigo, 'mismo');
    });
    test('monto 0, negativo, NaN, Infinity, texto o ausente → sin_monto', () => {
      for (const monto of [0, -100, -0.01, NaN, Infinity, -Infinity, '100', null, undefined]) {
        const r = T({ origen: 'cajita:a', destino: 'cajita:b', monto });
        assert.equal(r.ok, false, `monto ${String(monto)} debía fallar`);
        assert.equal(r.codigo, 'sin_monto', `monto ${String(monto)}`);
      }
    });
    test('monto menor a medio centavo (redondea a 0) → sin_monto', () => {
      assert.equal(T({ origen: 'cajita:a', destino: 'cajita:b', monto: 0.004 }).codigo, 'sin_monto');
    });
  });

  describe('validarTransferencia — centavos', () => {
    test('entre cajitas de Nu SÍ se aceptan centavos', () => {
      assert.deepEqual(plano(T({ origen: 'cajita:a', destino: 'cajita:b', monto: 9.9 })), { ok: true });
      assert.deepEqual(plano(T({ origen: 'cajita:a', destino: 'cajita:b', monto: 0.01 })), { ok: true });
    });
    test('cajita → Nequi exige entero (9 y 10 sí, 9,90 no)', () => {
      assert.equal(T({ origen: 'cajita:a', destino: 'nequi', monto: 9 }).ok, true);
      assert.equal(T({ origen: 'cajita:a', destino: 'nequi', monto: 10 }).ok, true);
      const r = T({ origen: 'cajita:a', destino: 'nequi', monto: 9.9 });
      assert.equal(r.codigo, 'monto');
      assert.match(r.mensaje, /Solo entre cajitas de Nu/);
    });
    test('con cuenta personalizada exige entero, en cualquier dirección', () => {
      assert.equal(T({ origen: 'custom:x', destino: 'cajita:a', monto: 100.5 }).codigo, 'monto');
      assert.equal(T({ origen: 'cajita:a', destino: 'custom:x', monto: 100.5 }).codigo, 'monto');
      assert.equal(T({ origen: 'custom:x', destino: 'nequi', monto: 100.5 }).codigo, 'monto');
      assert.equal(T({ origen: 'custom:x', destino: 'nequi', monto: 100 }).ok, true);
    });
    test('con Efectivo y centavos, el mensaje habla del efectivo', () => {
      const r = T({ origen: 'efectivo', destino: 'nequi', monto: 100.5 });
      assert.equal(r.codigo, 'monto');
      assert.match(r.mensaje, /El efectivo no tiene centavos/);
    });
    test('0,1 + 0,2 (flotantes) no cuela centavos falsos', () => {
      assert.equal(T({ origen: 'nequi', destino: 'custom:x', monto: 0.1 + 0.2 }).codigo, 'monto');
    });
  });

  describe('validarTransferencia — mínimo con Efectivo', () => {
    test('$49 falla, $50 pasa (desde y hacia Efectivo)', () => {
      for (const [origen, destino] of [['efectivo', 'nequi'], ['nequi', 'efectivo'], ['cajita:a', 'efectivo'], ['efectivo', 'custom:x']]) {
        const bajo = T({ origen, destino, monto: 49 });
        assert.equal(bajo.codigo, 'monto', `${origen}→${destino}`);
        assert.match(bajo.mensaje, /mínimo.*Efectivo/i);
        assert.equal(T({ origen, destino, monto: 50 }).ok, true, `${origen}→${destino}`);
      }
    });
    test('sin Efectivo no hay mínimo ($1 entre Nequi y personalizada, o entre cajitas)', () => {
      assert.equal(T({ origen: 'nequi', destino: 'custom:x', monto: 1 }).ok, true);
      assert.equal(T({ origen: 'cajita:a', destino: 'cajita:b', monto: 1 }).ok, true);
    });
  });

  describe('validarTransferencia — saldo', () => {
    test('monto mayor al saldo → saldo, con la etiqueta recibida y fmt real', () => {
      const r = validar({ origen: 'nequi', destino: 'efectivo', monto: 500, saldoOrigen: 499, etiquetaOrigen: 'Nequi' });
      assert.equal(r.codigo, 'saldo');
      assert.match(r.mensaje, /Saldo insuficiente en Nequi \(\$499\)/);
    });
    test('monto igual al saldo pasa (mover todo)', () => {
      assert.equal(validar({ origen: 'nequi', destino: 'efectivo', monto: 500, saldoOrigen: 500 }).ok, true);
    });
    test('compara en centavos: 100,10 contra 100,10 pasa; contra 100,09 no', () => {
      assert.equal(validar({ origen: 'cajita:a', destino: 'cajita:b', monto: 100.1, saldoOrigen: 100.1 }).ok, true);
      assert.equal(validar({ origen: 'cajita:a', destino: 'cajita:b', monto: 100.1, saldoOrigen: 100.09 }).codigo, 'saldo');
    });
    test('sin saldoOrigen numérico no se valida saldo (uso de la vista previa)', () => {
      assert.equal(validar({ origen: 'nequi', destino: 'efectivo', monto: 500 }).ok, true);
      assert.equal(validar({ origen: 'nequi', destino: 'efectivo', monto: 500, saldoOrigen: NaN }).ok, true);
    });
    test('un error de monto se avisa antes que el de saldo', () => {
      assert.equal(validar({ origen: 'nequi', destino: 'efectivo', monto: 10, saldoOrigen: 1 }).codigo, 'monto');
    });
  });

  // ── confirmarTransferir: cableado completo con las funciones reales de saldo ──
  // confirmarTransferir con las funciones reales de saldo (getSaldoFuente/descontarFuente/sumarFuente/fmt/escHtml/parseMoney/uid).
  function entorno({ origen, destino, monto, nota = '', nequi = 0, efectivo = 0 }) {
    const app = cargar();
    const campos = { tr_origen: origen, tr_destino: destino, tr_monto: monto, tr_nota: nota, tr_fecha: '2026-10-04' };
    app.document.getElementById = id => (id in campos ? { value: campos[id] } : null);
    const toasts = [], cerrados = [];
    let guardados = 0;
    app.toast = (msg, tipo, ms) => toasts.push({ msg, tipo, ms });
    app.closeSheet = n => cerrados.push(n);
    app.save = () => { guardados++; };
    app.refresh = () => {};
    app.fuenteLabel = f => ({ nequi: 'Nequi', efectivo: 'Efectivo', 'custom:x': 'Ahorro <x>' }[f] || f);
    // window.S === S (core-state.js:127), así que el test lee/escribe el estado real.
    // Los saldos viven en S.cuentas[] (no en S.nequiSaldo, que es el modelo viejo).
    app.getCuenta('nequi').saldo = nequi; app.getCuenta('efectivo').saldo = efectivo; app.S.transferencias = [];
    const estado = () => plano({ n: app.getCuenta('nequi').saldo, e: app.getCuenta('efectivo').saldo, t: app.S.transferencias });
    return { app, toasts, cerrados, estado, guardados: () => guardados };
  }
  const intacto = (e, inicial) => {
    assert.deepEqual(e.estado(), inicial);
    assert.equal(e.guardados(), 0);
    assert.equal(e.cerrados.length, 0);
  };

  describe('confirmarTransferir', () => {
    test('transferencia válida: mueve el saldo, registra, guarda y cierra', () => {
      const e = entorno({ origen: 'nequi', destino: 'efectivo', monto: '1.000,00', nequi: 5000, efectivo: 200, nota: 'pasé plata' });
      e.app.confirmarTransferir();
      const s = e.estado();
      assert.equal(s.n, 4000);
      assert.equal(s.e, 1200);
      assert.equal(s.t.length, 1);
      assert.deepEqual({ ...s.t[0], id: 'x' }, { id: 'x', fecha: '2026-10-04', origen: 'nequi', destino: 'efectivo', monto: 1000, nota: 'pasé plata' });
      assert.equal(e.guardados(), 1);
      assert.deepEqual(plano(e.cerrados), ['transferir']);
      assert.equal(e.toasts.at(-1).tipo, 'ok');
    });
    test('la plata total no cambia (neto cero entre cuentas propias)', () => {
      const e = entorno({ origen: 'efectivo', destino: 'nequi', monto: '250,00', nequi: 100, efectivo: 1000 });
      e.app.confirmarTransferir();
      const s = e.estado();
      assert.equal(s.n + s.e, 1100);
    });
    test('monto negativo no mueve nada (red de seguridad: money-input no deja escribir "-")', () => {
      const e = entorno({ origen: 'nequi', destino: 'efectivo', monto: '-500', nequi: 5000 });
      e.app.confirmarTransferir();
      intacto(e, { n: 5000, e: 0, t: [] });
      assert.equal(e.toasts[0].msg, 'Ingresa un monto válido');
    });
    test('monto 0 o vacío no mueve nada', () => {
      for (const monto of ['0,00', '']) {
        const e = entorno({ origen: 'nequi', destino: 'efectivo', monto, nequi: 5000 });
        e.app.confirmarTransferir();
        intacto(e, { n: 5000, e: 0, t: [] });
      }
    });
    test('origen = destino y falta de cuenta no mueven nada', () => {
      let e = entorno({ origen: 'nequi', destino: 'nequi', monto: '100,00', nequi: 5000 });
      e.app.confirmarTransferir(); intacto(e, { n: 5000, e: 0, t: [] });
      assert.equal(e.toasts[0].msg, 'El origen y destino deben ser diferentes');
      e = entorno({ origen: '', destino: 'nequi', monto: '100,00', nequi: 5000 });
      e.app.confirmarTransferir(); intacto(e, { n: 5000, e: 0, t: [] });
      assert.equal(e.toasts[0].msg, 'Elige origen y destino');
    });
    test('mínimo con Efectivo: aviso de 3500 ms y nada se mueve', () => {
      const e = entorno({ origen: 'efectivo', destino: 'nequi', monto: '49,00', efectivo: 5000 });
      e.app.confirmarTransferir(); intacto(e, { n: 0, e: 5000, t: [] });
      assert.equal(e.toasts[0].ms, 3500);
      assert.match(e.toasts[0].msg, /mínimo/i);
    });
    test('saldo insuficiente: nada se mueve y el nombre de cuenta va escapado', () => {
      // 'custom:x' no tiene saldo en el simulador → 0, monto 1.000 → insuficiente
      const e = entorno({ origen: 'custom:x', destino: 'nequi', monto: '1.000,00' });
      e.app.confirmarTransferir(); intacto(e, { n: 0, e: 0, t: [] });
      assert.match(e.toasts[0].msg, /Saldo insuficiente en Ahorro &lt;x&gt; \(\$0\)/);
      assert.ok(!e.toasts[0].msg.includes('<x>'));
    });
    test('mover exactamente todo el saldo funciona', () => {
      const e = entorno({ origen: 'nequi', destino: 'efectivo', monto: '5.000,00', nequi: 5000 });
      e.app.confirmarTransferir();
      assert.equal(e.estado().n, 0);
      assert.equal(e.estado().e, 5000);
    });
  });
});

describe('spotify-cajita', () => {
  // REGRESIÓN: spotify.js llamaba a _calcCSafe() (eliminada del núcleo el 2026-10-08 al mover calcC a
  // js/core/nu-calc.js) y getSpCajitaSaldo() lanzaba ReferenceError al abrir Spotify. Ningún test lo cubría.
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const path = require('node:path');
  const { loadApp } = require('./support/load-app');

  const CORE_DIR = process.env.MIS_FINANZAS_CORE_DIR || path.join(__dirname, '..', 'js', 'core');
  const MODULES_DIR = process.env.MIS_FINANZAS_MODULES_DIR || path.join(__dirname, '..', 'js', 'modules');

  function freshApp(S = {}) {
    const ctx = loadApp([
      path.join(CORE_DIR, 'core-state.js'), path.join(CORE_DIR, 'periodo.js'), path.join(CORE_DIR, 'nu-calc.js'),
      path.join(CORE_DIR, 'calc-helpers.js'), path.join(MODULES_DIR, 'spotify.js'),
    ], { permissive: true });
    Object.assign(ctx.S, S);
    return ctx;
  }
  const hace = n => { const d = new Date(Date.now() - n * 86400000); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  test('getSpCajitaSaldo — sin cajita de Spotify da 0', () => {
    assert.equal(freshApp({ cajitas: [] }).getSpCajitaSaldo(), 0);
  });

  test('getSpCajitaSaldo — cajita recién creada (sin fecha) vale su saldo', () => {
    const ctx = freshApp({ cajitas: [{ id: 's1', nombre: 'Spotify', saldo: 12000 }] });
    assert.equal(ctx.getSpCajitaSaldo(), 12000);
  });

  test('getSpCajitaSaldo — suma el interés real de calcC cuando la cajita tiene fecha', () => {
    const ctx = freshApp({ nuRate: 9.3003, cajitas: [{ id: 's1', nombre: 'Spotify', saldo: 1000000, fecha: hace(365) }] });
    assert.ok(ctx.getSpCajitaSaldo() > 1050000);
  });
});

describe('gastos-ida-y-vuelta', () => {
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const path = require('node:path');
  const { loadApp } = require('./support/load-app');
  const { createFakeDom } = require('./support/fake-dom');
  const RAIZ = path.join(__dirname, '..');
  const core = f => path.join(RAIZ, 'js', 'core', f), modulo = f => path.join(RAIZ, 'js', 'modules', f);
  const ARCHIVOS = [core('core-state.js'), core('periodo.js'), core('nu-calc.js'), core('calc-helpers.js'), core('cuenta-efectos.js'), modulo('tarjetas_credito.js'), modulo('gastos.js')];
  const plano = x => JSON.parse(JSON.stringify(x));

  function entorno(campos) {
    const app = loadApp(ARCHIVOS, { permissive: true });
    Object.assign(app.S, { modulos: {}, libro: [], movimientos: [], gastosVar: [], cajitas: [], pagosGastosFijos: {}, tcMovimientos: [],
      tarjetasCredito: [{ id: 'tc1', nombre: 'Visa', cupo: 1e6, deuda: 0, estado: 'activa', compras: [], pagos: [], saldoInicial: null }],
      cuentas: [{ id: 'nequi', tipo: 'nequi', saldo: 0 }, { id: 'efectivo', tipo: 'efectivo', saldo: 0 }] });
    app.sumarFuente('nequi', 100000, { origen: { modulo: 't', ref: 'base' } });
    const dom = createFakeDom({ gv_desc: { value: 'Almuerzo' }, gv_monto: { value: '25.000,00' }, gv_fecha: { value: '' }, gv_cat: { value: 'Comida' }, gv_nota: { value: '' }, ...campos });
    app.document = dom.document;
    app.dialogo = async () => true; app.save = () => {}; app.refresh = () => {}; app.toast = () => {};
    return app;
  }
  const sinLibro = S => { const c = plano(S); delete c.libro; return c; };
  const netoLibroDesde = (S, n) => { const t = {}; S.libro.slice(n).forEach(e => { t[e.cuenta] = (t[e.cuenta] || 0) + e.monto; }); return Object.values(t).filter(v => Math.abs(v) > 1e-9); };

  test('gasto desde una cuenta: registrar y eliminar deja todo como estaba', async () => {
    const app = entorno({ gv_fuente: { value: 'nequi' } });
    const antes = sinLibro(app.S), n = app.S.libro.length;
    app.addGastoVar();
    assert.equal(app.getSaldoFuente('nequi'), 75000);
    assert.equal(app.S.gastosVar.length, 1);
    await app.deleteGastoVar(app.S.gastosVar[0].id);
    assert.deepEqual(sinLibro(app.S), antes);
    assert.deepEqual(netoLibroDesde(app.S, n), [], 'el libro suma cero');
    assert.equal(app.Libro.verificar().ok, true);
  });

  test('gasto con tarjeta: registrar y eliminar deja la deuda y las compras como estaban', async () => {
    const app = entorno({ gv_fuente: { value: 'tc:tc1' } });
    app.addGastoVar();
    assert.equal(app.S.tarjetasCredito[0].deuda, 25000);
    await app.deleteGastoVar(app.S.gastosVar[0].id);
    assert.equal(app.S.gastosVar.length, 0);
    assert.equal(app.S.tarjetasCredito[0].deuda, 0);
    assert.equal(app.getSaldoFuente('nequi'), 100000, 'ninguna cuenta se movió');
    app.tcNormalizarTarjetas();
    assert.equal(app.S.tarjetasCredito[0].deuda, 0, 'y sigue en 0 tras recalcular');
  });
});

describe('eliminar-movimiento', () => {
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const path = require('node:path');
  const { loadApp } = require('./support/load-app');
  const { createFakeDom } = require('./support/fake-dom');
  const RAIZ = path.join(__dirname, '..');
  const core = f => path.join(RAIZ, 'js', 'core', f), modulo = f => path.join(RAIZ, 'js', 'modules', f);
  const ARCHIVOS = [core('core-state.js'), core('periodo.js'), core('nu-calc.js'), core('calc-helpers.js'), core('cuenta-efectos.js'),
    modulo('tarjetas_credito.js'), modulo('nu.js'), modulo('cuentas.js'), modulo('gastos.js'), core('movimientos.js')];
  const plano = x => JSON.parse(JSON.stringify(x));
  const HOY = '2026-10-13';

  function entorno(campos = {}) {
    const app = loadApp(ARCHIVOS, { permissive: true });
    Object.assign(app.S, { modulos: {}, libro: [], movimientos: [], gastosVar: [], cajitas: [], transferencias: [], pagosGastosFijos: {}, tcMovimientos: [], tarjetasCredito: [],
      cuentas: [{ id: 'nequi', tipo: 'nequi', saldo: 0 }, { id: 'efectivo', tipo: 'efectivo', saldo: 0 }, { id: 'z', tipo: 'custom', nombre: 'Z', saldo: 0 }] });
    const dom = createFakeDom({ gv_desc: { value: 'Almuerzo' }, gv_monto: { value: '2.000,00' }, gv_fecha: { value: '' }, gv_cat: { value: 'Comida' }, gv_nota: { value: '' }, ...campos });
    app.document = dom.document;
    let dialogos = 0;
    app.dialogo = async () => { dialogos++; await Promise.resolve(); return true; };
    app.save = () => {}; app.refresh = () => {}; app.toast = () => {}; app.fuenteLabel = f => f;
    return { app, dialogos: () => dialogos, saldo: id => app.getSaldoFuente(id) };
  }
  // La fila que pinta la pantalla: los datos del movimiento viajan en dataset, y el botón sabe encontrar su fila.
  const boton = (tipo, id, fuente, monto) => { const item = { dataset: { movId: id, movTipo: tipo, movFuente: fuente, movMonto: String(monto), movFecha: HOY } }; return { closest: () => item }; };
  const neto = S => { const t = {}; S.libro.forEach(e => { t[e.cuenta] = (t[e.cuenta] || 0) + e.monto; }); return t; };

  test('saldo inicial: eliminar lo deja en 0 (no en −10), con UN solo diálogo', async () => {
    const e = entorno();
    e.app.registrarEntradaConApertura('efectivo', 10, HOY, 'Saldo inicial', true, '');
    const m = e.app.S.movimientos[0];
    assert.equal(e.saldo('efectivo'), 10);
    await e.app.eliminarMovimiento(boton('apertura', m.id, 'efectivo', 10));
    assert.equal(e.saldo('efectivo'), 0);
    assert.equal(e.dialogos(), 1, 'una sola confirmación');
    assert.equal(e.app.S.movimientos.length, 0);
    assert.equal(e.app.Libro.verificar().ok, true);
  });

  test('retiro de una cuenta: 10.000 − 2.000 = 8.000 y al eliminar vuelve a 10.000 (no a 12.000)', async () => {
    const e = entorno({ rdMonto: { value: '2.000,00' } });
    e.app.sumarFuente('nequi', 10000, { origen: { modulo: 't', ref: 'base' } });
    e.app.registrarSalida('nequi', 2000, HOY, 'Retiro', '');
    assert.equal(e.saldo('nequi'), 8000);
    const m = e.app.S.movimientos.find(x => x.tipo === 'salida_manual');
    await e.app.eliminarMovimiento(boton('salida_manual', m.id, 'nequi', 2000));
    assert.equal(e.saldo('nequi'), 10000);
    assert.equal(e.dialogos(), 1);
  });

  test('retiro de una cuenta personalizada: vuelve a 10.000 y no a 12.000', async () => {
    const e = entorno();
    e.app.sumarFuente('custom:z', 10000, { origen: { modulo: 't', ref: 'base' } });
    e.app.registrarSalida('custom:z', 2000, HOY, 'Retiro', '');
    assert.equal(e.saldo('custom:z'), 8000);
    const m = e.app.S.movimientos.find(x => x.tipo === 'salida_manual');
    await e.app.eliminarMovimiento(boton('salida_manual', m.id, 'custom:z', 2000));
    assert.equal(e.saldo('custom:z'), 10000);
    assert.equal(e.dialogos(), 1);
    assert.equal(e.app.Libro.verificar().ok, true);
  });

  test('ingreso manual: eliminarlo baja el saldo una sola vez', async () => {
    const e = entorno();
    e.app.registrarEntradaConApertura('nequi', 5000, HOY, 'Sueldo', false, '');
    const m = e.app.S.movimientos[0];
    await e.app.eliminarMovimiento(boton('entrada', m.id, 'nequi', 5000));
    assert.equal(e.saldo('nequi'), 0);
    assert.equal(e.dialogos(), 1);
  });

  test('transferencia: se revierte una sola vez, con UN solo diálogo', async () => {
    const e = entorno({ tr_origen: { value: 'nequi' }, tr_destino: { value: 'efectivo' }, tr_monto: { value: '3.000,00' }, tr_nota: { value: '' }, tr_fecha: { value: HOY } });
    e.app.sumarFuente('nequi', 10000, { origen: { modulo: 't', ref: 'base' } });
    e.app.confirmarTransferir();
    assert.equal(e.saldo('nequi'), 7000); assert.equal(e.saldo('efectivo'), 3000);
    const t = e.app.S.transferencias[0];
    await e.app.eliminarMovimiento(boton('transferencia', t.id, 'nequi', 3000));
    assert.equal(e.saldo('nequi'), 10000); assert.equal(e.saldo('efectivo'), 0);
    assert.equal(e.dialogos(), 1);
  });

  test('gasto desde la cuenta: un solo diálogo y se revierte bien', async () => {
    const e = entorno({ gv_fuente: { value: 'nequi' } });
    e.app.sumarFuente('nequi', 10000, { origen: { modulo: 't', ref: 'base' } });
    e.app.addGastoVar();
    assert.equal(e.saldo('nequi'), 8000);
    const g = e.app.S.gastosVar[0];
    await e.app.eliminarMovimiento(boton('gasto', g.id, 'nequi', 2000));
    assert.equal(e.saldo('nequi'), 10000);
    assert.equal(e.dialogos(), 1);
    assert.equal(e.app.S.gastosVar.length, 0);
  });

  test('SEGURIDAD — dos disparos del mismo clic: un diálogo, una reversión', async () => {
    const e = entorno();
    e.app.registrarEntradaConApertura('efectivo', 10, HOY, 'Saldo inicial', true, '');
    const m = e.app.S.movimientos[0], b = boton('apertura', m.id, 'efectivo', 10);
    await Promise.all([e.app.eliminarMovimiento(b), e.app.eliminarMovimiento(b)]);
    assert.equal(e.saldo('efectivo'), 0, 'antes: −10');
    assert.equal(e.dialogos(), 1);
  });

  test('SEGURIDAD — un movimiento que ya no existe no pregunta ni revierte (la fila quedó pintada)', async () => {
    const e = entorno();
    e.app.sumarFuente('nequi', 10000, { origen: { modulo: 't', ref: 'base' } });
    e.app.registrarSalida('nequi', 2000, HOY, 'Retiro', '');
    const m = e.app.S.movimientos.find(x => x.tipo === 'salida_manual');
    const b = boton('salida_manual', m.id, 'nequi', 2000);
    await e.app.eliminarMovimiento(b);
    assert.equal(e.saldo('nequi'), 10000);
    await e.app.eliminarMovimiento(b); // la pantalla todavía mostraba la fila
    assert.equal(e.saldo('nequi'), 10000, 'no se devuelve otra vez');
    assert.equal(e.dialogos(), 1, 'y no vuelve a preguntar');
    for (const [tipo, fuente] of [['apertura', 'nequi'], ['salida_manual', 'custom:z'], ['entrada', 'nequi'], ['gasto', 'nequi'], ['transferencia', 'nequi']]) {
      const antes = e.saldo(fuente);
      await e.app.eliminarMovimiento(boton(tipo, 'no-existe', fuente, 999));
      assert.equal(e.saldo(fuente), antes, `${tipo}: ningún saldo cambia`);
    }
    assert.equal(e.dialogos(), 1);
  });

  test('gasto dividido entre dos cuentas: aparece en CADA cuenta con su parte, y eliminarlo desde una devuelve las dos', async () => {
    const e = entorno();
    e.app.sumarFuente('nequi', 10000, { origen: { modulo: 't', ref: 'b1' } });
    e.app.sumarFuente('efectivo', 5000, { origen: { modulo: 't', ref: 'b2' } });
    // lo que deja addGastoVar en modo dividido: sin `fuente` y con la lista `splits`
    const g = { id: 'gs1', desc: 'Mercado', monto: 3000, fecha: HOY, cat: 'Comida', fuente: '', splits: [{ fuente: 'nequi', monto: 2000 }, { fuente: 'efectivo', monto: 1000 }], clase: 'gasto' };
    e.app.S.gastosVar.push(g);
    e.app.descontarFuente('nequi', 2000, { origen: { modulo: 'gastos', ref: 'gs1' } });
    e.app.descontarFuente('efectivo', 1000, { origen: { modulo: 'gastos', ref: 'gs1' } });
    const fila = (cuenta) => plano(e.app.getMovimientosCuenta(cuenta)).filter(m => m._movId === 'gs1');
    const fn = fila('nequi'), fe = fila('efectivo');
    assert.equal(fn.length, 1, 'aparece en Nequi'); assert.equal(fe.length, 1, 'aparece en Efectivo');
    assert.equal(fn[0].monto, -2000); assert.equal(fe[0].monto, -1000);
    assert.deepEqual(fn[0]._otrasCuentas, [{ fuente: 'efectivo', monto: -1000 }]);
    assert.equal(fila('custom:z').length, 0, 'y en ninguna otra cuenta');
    await e.app.eliminarMovimiento(boton('gasto', 'gs1', 'nequi', 2000));
    assert.equal(e.saldo('nequi'), 10000); assert.equal(e.saldo('efectivo'), 5000);
    assert.equal(e.dialogos(), 1);
    assert.equal(e.app.S.gastosVar.length, 0);
  });
});

describe('cuenta-iconos-colores', () => {
  // "Nueva cuenta" / "Editar cuenta": el ícono y el color elegidos se marcan (cuentas.js + js/core/color-picker.js).
  // Causa del bug: color-picker.js no tenía <script> en index.html, así que selColorNC() lanzaba ReferenceError antes de
  // que selIconoNC() terminara de pintar; la cuenta se guardaba bien pero la pantalla seguía mostrando "Otra".
  const { test, describe } = require('node:test');
  const assert = require('node:assert/strict');
  const fs = require('node:fs');
  const path = require('node:path');
  const { loadApp } = require('./support/load-app');

  const RAIZ = path.join(__dirname, '..');
  const core = f => path.join(RAIZ, 'js', 'core', f);
  const modulo = f => path.join(RAIZ, 'js', 'modules', f);
  const ARCHIVOS = [core('core-state.js'), core('periodo.js'), core('nu-calc.js'), core('calc-helpers.js'), core('color-picker.js'), core('cuenta-efectos.js'), modulo('nu.js'), modulo('cuentas.js')];
  const ACENTO = '2px solid var(--accent)';

  // Círculos de color e íconos falsos: lo único que importa es qué borde les queda.
  function pantalla(app, { colores = [], iconos = [] }) {
    const circulos = colores.map(color => ({ dataset: { color }, style: {} }));
    const botones = iconos.map(id => ({ dataset: { icono: id }, style: {} }));
    app.document.querySelectorAll = sel => (sel === '.nc-color-opt' ? circulos : sel === '.nc-icon-opt' ? botones : []);
    return { circulos, botones };
  }

  test('index.html carga color-picker.js (sin ese <script>, selColorNC no existía en la página)', () => {
    const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
    assert.match(html, /<script src="js\/core\/color-picker\.js" defer><\/script>/);
  });

  test('elegir un color marca solo ese círculo', () => {
    const app = loadApp(ARCHIVOS, { permissive: true });
    const p = pantalla(app, { colores: ['#60b0f0', '#f06868', '#b090f0'] });
    app.selColorNC('#f06868');
    assert.deepEqual(p.circulos.map(c => c.style.border), ['2px solid transparent', ACENTO, '2px solid transparent']);
    app.selColorNC('#b090f0');
    assert.deepEqual(p.circulos.map(c => c.style.border), ['2px solid transparent', '2px solid transparent', ACENTO]);
  });

  test('elegir un ícono no lanza, lo marca, desmarca "Otra" y marca el color de esa marca', () => {
    const app = loadApp(ARCHIVOS, { permissive: true });
    const colorNequi = app.getIconoData('nequi').color;
    const p = pantalla(app, { colores: ['#000001', colorNequi], iconos: ['otro', 'nequi'] });
    p.botones[0].style.border = ACENTO; // "Otra" viene marcada por defecto
    assert.doesNotThrow(() => app.selIconoNC('nequi'));
    assert.equal(p.botones[1].style.border, ACENTO);
    assert.notEqual(p.botones[0].style.border, ACENTO);
    assert.equal(p.circulos[1].style.border, ACENTO, 'el color de la marca queda marcado');
    assert.equal(p.circulos[0].style.border, '2px solid transparent');
  });

  test('editar una cuenta vuelve a dibujar el grid de íconos (marca SU ícono, no el último que se dibujó)', () => {
    const app = loadApp(ARCHIVOS, { permissive: true });
    app.S.cuentas = [{ id: 'c1', tipo: 'custom', nombre: 'Mi banco', icono: 'bbva', color: '#60b0f0', saldo: 0 }];
    const el = () => ({ value: '', style: {}, closest: () => ({ style: {} }), dataset: {} });
    app.document.getElementById = () => el();
    app.document.querySelector = () => el();
    pantalla(app, { colores: ['#60b0f0'] });
    let dibujos = 0;
    app.renderIconGrid = () => { dibujos++; };
    app.openSheet = () => {};
    app.editarCuentaCustom('c1');
    assert.equal(dibujos, 1);
  });
});

describe('nu-tasa-global', () => {
  // Una sola tasa EA para todas las cajitas de Nu: S.nuRate (null = sin configurar). Los CDT guardan la suya.
  const { test, describe } = require('node:test');
  const assert = require('node:assert/strict');
  const path = require('node:path');
  const { loadApp } = require('./support/load-app');

  const RAIZ = path.join(__dirname, '..');
  const core = f => path.join(RAIZ, 'js', 'core', f);
  const modulo = f => path.join(RAIZ, 'js', 'modules', f);
  const ARCHIVOS = [core('core-state.js'), core('periodo.js'), core('nu-calc.js'), core('calc-helpers.js'), core('fuentes-filtro.js'), core('cuenta-efectos.js'), modulo('nu.js'), modulo('cuentas.js')];
  const hace = n => { const d = new Date(Date.now() - n * 86400000); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const app = (S = {}) => { const a = loadApp(ARCHIVOS, { permissive: true }); Object.assign(a.S, S); return a; };

  describe('qué cuenta como "tasa configurada"', () => {
    test('el estado nuevo no trae tasa (ya no se inventa 9,25)', () => {
      const a = app();
      assert.equal(a.S.nuRate, null);
      assert.equal('nuTasaGlobal' in a.S, false);
      assert.equal(a.nuTasaConfigurada(), false);
      assert.equal(a.getNuTasaGlobal(), 0);
    });
    test('solo un número mayor que 0 cuenta', () => {
      for (const [v, ok] of [[9.25, true], [0.5, true], [0, false], [-1, false], [null, false], [undefined, false], ['9', false], [NaN, false]]) {
        assert.equal(app({ nuRate: v }).nuTasaConfigurada(), ok, String(v));
      }
    });
    test('nuTasaDesdeTexto: acepta "9,25" y "12.5"; vacío, texto, 0 y negativos son null', () => {
      const a = app();
      assert.equal(a.nuTasaDesdeTexto('9,25'), 9.25);
      assert.equal(a.nuTasaDesdeTexto('12.5'), 12.5);
      for (const t of ['', ' ', '0', '-3', 'abc', null, undefined]) assert.equal(a.nuTasaDesdeTexto(t), null, String(t));
    });
  });

  describe('todas las cajitas calculan con S.nuRate; el CDT con la suya', () => {
    test('calcC usa nuRate (una cajita sin campo `tasa`)', () => {
      const a = app({ nuRate: 12 });
      const c = { id: 'a', saldo: 100000, fecha: hace(10) };
      assert.equal(a.calcC(c).tasa, 12);
      const esperado = 100000 * (Math.pow(1.12, 10 / 365) - 1);
      assert.ok(Math.abs(a.calcC(c).ganado - esperado) < 0.01);
    });
    test('dos cajitas con distinto saldo usan la misma tasa; cambiar nuRate cambia las dos', () => {
      const a = app({ nuRate: 10 });
      const c1 = { id: 'a', saldo: 100000, fecha: hace(30) }, c2 = { id: 'b', saldo: 50000, fecha: hace(30) };
      assert.equal(a.calcC(c1).tasa, a.calcC(c2).tasa);
      const antes = a.calcC(c1).ganado;
      a.S.nuRate = 20;
      assert.ok(a.calcC(c1).ganado > antes);
    });
    test('sin tasa configurada no hay intereses (en vez de inventar una)', () => {
      const a = app({ nuRate: null });
      const r = a.calcC({ id: 'a', saldo: 100000, fecha: hace(30) });
      assert.equal(r.ganado, 0);
      assert.equal(r.val, 100000);
    });
    test('un CDT conserva su tasa propia aunque cambie la global', () => {
      const a = app({ nuRate: 12 });
      const cdt = { monto: 100000, tasa: 5, rte: 0, inicio: hace(73), vence: hace(-300) };
      const esperado = Math.round(100000 * (Math.pow(1.05, 73 / 365) - 1) * 2) / 2;
      assert.equal(a.calcCDT(cdt).ganado_bruto, esperado);
      a.S.nuRate = 30;
      assert.equal(a.calcCDT(cdt).ganado_bruto, esperado);
    });
    test('el historial de tasas manda sobre nuRate para los días anteriores al cambio', () => {
      const a = app({ nuRate: 9.3, historialTasasNu: [{ fecha: hace(20), tasa: 9 }, { fecha: hace(10), tasa: 9.3 }] });
      assert.equal(a.calcC({ id: 'a', saldo: 1000000, fecha: hace(20) }).tasa, 9.3, 'la tasa de hoy es la de nuRate');
      assert.ok(a.calcC({ id: 'a', saldo: 1000000, fecha: hace(20) }).val < 1000000 * Math.pow(1.093, 20 / 365));
    });
  });

  describe('el campo de tasa solo acepta números con coma o punto decimal', () => {
    test('nuTasaSanear quita letras, signos y separadores de más mientras se escribe', () => {
      const a = app();
      const casos = [['9,25', '9,25'], ['9.3', '9.3'], ['9abc,2', '9,2'], ['abc', ''], ['-9,2', '9,2'], ['1.234,5', '1.2345'],
        ['9,2,5', '9,25'], ['12345', '123'], ['9,123456', '9,1234'], ['', ''], [null, ''], ['9 %', '9']];
      for (const [entra, sale] of casos) assert.equal(a.nuTasaSanear(entra), sale, String(entra));
    });
    test('nuTasaDesdeTexto solo da número con un valor completo y razonable', () => {
      const a = app();
      for (const [t, v] of [['9,25', 9.25], ['12.5', 12.5], ['9', 9], ['100', 100], ['0,5', 0.5], ['9.3003', 9.3003], [' 9,25 ', 9.25]]) assert.equal(a.nuTasaDesdeTexto(t), v, t);
      for (const t of ['', ' ', '0', '0,0', '-3', 'abc', '9abc', '9,', ',5', '9,2,5', '1.234,5', '101', '1000', '9 %', null, undefined]) assert.equal(a.nuTasaDesdeTexto(t), null, String(t));
    });
    test('nuTasaATexto la muestra con coma decimal y vuelve a ser la misma tasa', () => {
      const a = app();
      assert.equal(a.nuTasaATexto(9.25), '9,25');
      assert.equal(a.nuTasaATexto(10), '10');
      assert.equal(a.nuTasaDesdeTexto(a.nuTasaATexto(9.3003)), 9.3003);
    });
    test('confirmarCambioTasaNu rechaza una tasa con letras o fuera de rango y no toca nada', () => {
      for (const malo of ['9abc', 'abc', '0', '150', '']) {
        const a = app({ nuRate: 9.3, historialTasasNu: [] });
        const avisos = [];
        a.toast = (m, t) => avisos.push({ m, t });
        a.closeSheet = () => {}; a.save = () => {}; a.refresh = () => {};
        a.document.getElementById = id => ({ id, value: id === 'ctn-tasa' ? malo : '', style: {} });
        a._abrirConfirmarTasaNu({ sugerida: 10, desde: hace(5) });
        a.confirmarCambioTasaNu();
        assert.equal(a.S.nuRate, 9.3, malo);
        assert.deepEqual(a.S.historialTasasNu, [], malo);
        assert.equal(avisos.at(-1).t, 'err', malo);
      }
    });
  });

  describe('guardar y precargar', () => {
    test('save() no copia la tasa a cada cajita', () => {
      const a = app({ nuRate: 9.3, cajitas: [{ id: 'a', nombre: 'A', saldo: 0, cdts: [] }] });
      a.save();
      assert.equal('tasa' in a.S.cajitas[0], false);
    });
    test('el CDT nuevo se precarga con la tasa global (se puede cambiar) y vacío si no hay tasa', () => {
      for (const [nuRate, esperado] of [[11.5, '11,5'], [null, '']]) {
        const a = app({ nuRate, cajitas: [{ id: 'a', nombre: 'A', saldo: 5000, fecha: hace(2), cdts: [] }] });
        const cache = {};
        const el = () => ({ value: 'x', textContent: '', innerHTML: '', style: {}, dataset: {}, focus() {}, readOnly: false });
        a.document.getElementById = id => (cache[id] = cache[id] || el());
        a.openSheet = () => {};
        a.abrirCrearCDT('a');
        assert.equal(cache.cdt_tasa.value, esperado);
      }
    });
  });
});

describe('nu-acciones', () => {
  // "Entró plata", "Salió plata", "Chequeo rápido" y "Agregar cajita" dependen de la tasa y de las cajitas: el botón sale
  // deshabilitado con su motivo y cada acción lo vuelve a comprobar (por si se llama de otra forma). Chequeo rápido: solo
  // entran las cajitas que ya generaron intereses un día completo, cada una por su cuenta.
  const { test, describe } = require('node:test');
  const assert = require('node:assert/strict');
  const path = require('node:path');
  const { loadApp } = require('./support/load-app');

  const RAIZ = path.join(__dirname, '..');
  const core = f => path.join(RAIZ, 'js', 'core', f);
  const modulo = f => path.join(RAIZ, 'js', 'modules', f);
  const ARCHIVOS = [core('core-state.js'), core('periodo.js'), core('nu-calc.js'), core('calc-helpers.js'), core('fuentes-filtro.js'), core('cuenta-efectos.js'), modulo('nu.js'), modulo('cuentas.js')];
  const hace = n => { const d = new Date(Date.now() - n * 86400000); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const caja = (id, saldo, fecha) => ({ id, nombre: 'Cajita ' + id, saldo, fecha, cdts: [] });

  function entorno({ nuRate = 9.3, cajitas = [], chequeosNu = [] } = {}) {
    const app = loadApp(ARCHIVOS, { permissive: true });
    Object.assign(app.S, { nuRate, cajitas, chequeosNu, movimientos: [], gastosVar: [], encargos: [], historialTasasNu: [], libro: [],
      cuentas: [{ id: 'nequi', tipo: 'nequi', saldo: 0 }, { id: 'efectivo', tipo: 'efectivo', saldo: 0 }] });
    const cache = {};
    const el = () => ({ value: '', textContent: '', innerHTML: '', disabled: false, title: '', style: {}, dataset: {}, attrs: {}, enfocado: false,
      setAttribute(k, v) { this.attrs[k] = v; }, focus() { this.enfocado = true; }, addEventListener() {},
      querySelector: () => null, querySelectorAll: () => [], classList: { add() {}, remove() {}, toggle() {}, contains: () => false } });
    app.document.getElementById = id => (cache[id] = cache[id] || el());
    const toasts = [], abiertos = [];
    app.toast = (msg, tipo, ms) => toasts.push({ msg, tipo, ms });
    app.openSheet = n => abiertos.push(n);
    app.closeSheet = () => {};
    app.save = () => {};
    app.refresh = () => {};
    return { app, campos: cache, toasts, abiertos, btn: id => app.document.getElementById(id) };
  }

  describe('botones de Nu', () => {
    test('sin cajitas: Entró, Salió y Chequeo salen deshabilitados', () => {
      const e = entorno({ cajitas: [] });
      e.app.actualizarBotonesNu();
      for (const id of ['btn-nu-entro', 'btn-nu-salio', 'btn-nu-chequeo']) {
        assert.equal(e.btn(id).disabled, true, id);
        assert.match(e.btn(id).title, /cajita/i, id + ': el título dice por qué');
      }
    });
    test('sin tasa: no se puede crear cajita, el aviso de tasa se ve y las acciones siguen cerradas', () => {
      const e = entorno({ nuRate: null, cajitas: [] });
      e.app.actualizarBotonesNu();
      assert.equal(e.btn('btnAddCajita').disabled, true);
      assert.notEqual(e.btn('nuTasaAviso').style.display, 'none');
      e.app.S.nuRate = 9.3; e.app.actualizarBotonesNu();
      assert.equal(e.btn('btnAddCajita').disabled, false);
      assert.equal(e.btn('nuTasaAviso').style.display, 'none');
    });
    test('cajita sin saldo: Entró sí; Salió y Chequeo no', () => {
      const e = entorno({ cajitas: [caja('a', 0, hace(0))] });
      e.app.actualizarBotonesNu();
      assert.equal(e.btn('btn-nu-entro').disabled, false);
      assert.equal(e.btn('btn-nu-salio').disabled, true);
      assert.equal(e.btn('btn-nu-chequeo').disabled, true);
    });
    test('cajita con saldo y un día de intereses: los tres se habilitan', () => {
      const e = entorno({ cajitas: [caja('a', 50000, hace(1))] });
      e.app.actualizarBotonesNu();
      for (const id of ['btn-nu-entro', 'btn-nu-salio', 'btn-nu-chequeo']) assert.equal(e.btn(id).disabled, false, id);
    });
    test('se actualizan solos cuando cambia el estado (renderCajitas los reevalúa)', () => {
      const e = entorno({ cajitas: [] });
      e.app.renderCajitas();
      assert.equal(e.btn('btn-nu-entro').disabled, true);
      e.app.S.cajitas.push(caja('a', 50000, hace(0)));
      e.app.renderCajitas();
      assert.equal(e.btn('btn-nu-entro').disabled, false);
      assert.equal(e.btn('btn-nu-chequeo').disabled, true, 'la cajita es de hoy: aún no cumple su primer día');
      e.app.S.cajitas[0].fecha = hace(1);
      e.app.renderCajitas();
      assert.equal(e.btn('btn-nu-chequeo').disabled, false);
    });
  });

  describe('la lógica de cada acción también lo comprueba', () => {
    test('abrirNuMovimiento sin cajitas no abre el sheet y explica', () => {
      const e = entorno({ cajitas: [] });
      e.app.abrirNuMovimiento('entrada'); e.app.abrirNuMovimiento('salida');
      assert.deepEqual(e.abiertos, []);
      assert.equal(e.toasts.length, 2);
      assert.match(e.toasts[0].msg, /cajita/i);
    });
    test('abrirNuMovimiento sin tasa no abre el sheet', () => {
      const e = entorno({ nuRate: null, cajitas: [caja('a', 1000, hace(1))] });
      e.app.abrirNuMovimiento('entrada');
      assert.deepEqual(e.abiertos, []);
      assert.match(e.toasts.at(-1).msg, /tasa/i);
    });
    test('"Salió plata" exige alguna cajita con saldo; "Entró plata" no', () => {
      const e = entorno({ cajitas: [caja('a', 0, hace(0))] });
      e.app.abrirNuMovimiento('salida');
      assert.deepEqual(e.abiertos, []);
      e.app.abrirNuMovimiento('entrada');
      assert.deepEqual(e.abiertos, ['nu-movimiento']);
    });
    test('addCajita sin tasa: no crea nada, avisa y lleva el cursor al campo de la tasa', () => {
      const e = entorno({ nuRate: null });
      e.app.addCajita();
      assert.equal(e.app.S.cajitas.length, 0);
      assert.match(e.toasts.at(-1).msg, /tasa/i);
      assert.equal(e.btn('nuTasaGlobal').enfocado, true);
      e.app.S.nuRate = 9.3;
      e.app.addCajita();
      assert.equal(e.app.S.cajitas.length, 1);
      assert.equal('tasa' in e.app.S.cajitas[0], false, 'la cajita no guarda tasa propia');
    });
  });

  describe('qué cajitas entran al Chequeo rápido (una por una)', () => {
    test('cajitaGeneraIntereses mide el reloj de los intereses: con saldo y al menos un día', () => {
      const e = entorno({ cajitas: [caja('a', 100000, hace(3)), caja('b', 100000, hace(0)), caja('c', 0, hace(9))] });
      const [a, b, c] = e.app.S.cajitas;
      assert.equal(e.app.cajitaGeneraIntereses(a), true);
      assert.equal(e.app.cajitaGeneraIntereses(b), false, 'de hoy: aún no cumple un día');
      assert.equal(e.app.cajitaGeneraIntereses(c), false, 'vacía: no genera nada aunque lleve días creada');
    });
    test('sin tasa ninguna cajita cuenta', () => {
      const e = entorno({ nuRate: null, cajitas: [caja('a', 100000, hace(3))] });
      assert.equal(e.app.cajitaGeneraIntereses(e.app.S.cajitas[0]), false);
    });
    test('una cajita nueva no sale en el chequeo mientras las que ya cumplen siguen', () => {
      const e = entorno({ cajitas: [caja('a', 100000, hace(3)), caja('b', 100000, hace(0))] });
      assert.deepEqual(e.app.cajitasChequeables().map(c => c.id), ['a']);
      e.app.S.cajitas[1].fecha = hace(1); // pasó su primer día
      assert.deepEqual(e.app.cajitasChequeables().map(c => c.id), ['a', 'b']);
    });
    test('una cajita ya chequeada HOY sigue disponible hoy (para corregir la lectura)', () => {
      const e = entorno({ cajitas: [caja('a', 100000, hace(0))], chequeosNu: [{ fecha: hace(0), cajitaId: 'a', saldoReal: 100000 }] });
      assert.deepEqual(e.app.cajitasChequeables().map(c => c.id), ['a']);
      e.app.S.chequeosNu[0].fecha = hace(1);
      assert.deepEqual(e.app.cajitasChequeables(), [], 'un chequeo de ayer no la mantiene');
    });
    test('abrirChequeoNu: no abre si ninguna cumple y explica; abre si alguna cumple', () => {
      const e = entorno({ cajitas: [caja('b', 100000, hace(0))] });
      e.app.abrirChequeoNu();
      assert.deepEqual(e.abiertos, []);
      assert.match(e.toasts.at(-1).msg, /día completo/);
      e.app.S.cajitas.push(caja('a', 100000, hace(2)));
      e.app.abrirChequeoNu();
      assert.deepEqual(e.abiertos, ['chequeo-nu']);
    });
    test('guardarChequeoNu ignora la cajita que aún no cumple aunque llegue su campo', async () => {
      const e = entorno({ cajitas: [caja('a', 100000, hace(3)), caja('b', 100000, hace(0))] });
      e.app.dialogo = async () => true;
      e.app.document.querySelectorAll = sel => (String(sel).includes('data-chq-cajita')
        ? [{ value: '100.500,00', dataset: { chqCajita: 'a' } }, { value: '999.999,00', dataset: { chqCajita: 'b' } }] : []);
      await e.app.guardarChequeoNu();
      assert.equal(e.app.S.cajitas[1].saldo, 100000, 'b no se toca');
      assert.deepEqual(e.app.S.chequeosNu.map(c => c.cajitaId), ['a']);
    });
    test('guardarChequeoNu sin ninguna cajita que cumpla: avisa y no guarda', async () => {
      const e = entorno({ cajitas: [caja('b', 100000, hace(0))] });
      e.app.document.querySelectorAll = () => [{ value: '100.000,00', dataset: { chqCajita: 'b' } }];
      await e.app.guardarChequeoNu();
      assert.deepEqual(e.app.S.chequeosNu, []);
      assert.match(e.toasts.at(-1).msg, /día completo/);
    });
  });

  describe('Chequeo rápido con encargos: se muestra y se anota el TOTAL que marca Nu', () => {
    // Una cajita con plata propia y plata de encargos (física en la misma cajita). Nu muestra la suma; antes el chequeo mostraba
    // solo lo propio y obligaba a restar los encargos a mano (y adivinaba qué número había anotado el usuario).
    const conEncargos = (propio = 100000, enc = 200000) => {
      const e = entorno({ cajitas: [caja('a', propio, hace(3))] });
      e.app.S.encargos = [{ id: 'e1', nombre: 'Papá', saldoInicial: enc, cuentaInicial: 'cajita:a', movimientos: [] }];
      e.app.dialogo = async () => true;
      return e;
    };
    const texto = n => n.toFixed(2).replace('.', ',');
    const lectura = (e, valor) => { e.app.document.querySelectorAll = sel => (String(sel).includes('data-chq-cajita') ? [{ value: valor, dataset: { chqCajita: 'a' } }] : []); };

    test('nuValorEsperadoCajita: total = propio con intereses + encargos guardados en la cajita', () => {
      const e = conEncargos();
      const v = e.app.nuValorEsperadoCajita(e.app.S.cajitas[0]);
      assert.equal(v.encargos, 200000);
      assert.ok(v.propio > 100000, 'el propio ya trae sus intereses');
      assert.ok(Math.abs(v.total - (v.propio + 200000)) < 0.001);
    });
    test('sin encargos el total es el propio (nada cambia para el resto de cajitas)', () => {
      const e = entorno({ cajitas: [caja('a', 100000, hace(3))] });
      const v = e.app.nuValorEsperadoCajita(e.app.S.cajitas[0]);
      assert.equal(v.encargos, 0);
      assert.equal(v.total, v.propio);
    });
    test('la lectura se interpreta siempre como total: saldo propio = lectura − encargos; la referencia es el total esperado', () => {
      const e = conEncargos();
      const c = e.app.S.cajitas[0];
      const t = e.app.nuValorEsperadoCajita(c).total;
      const r = e.app._interpretarLecturaChequeoNu(c, t);
      assert.ok(Math.abs(r.saldoPropio - e.app.nuValorEsperadoCajita(c).propio) < 0.001);
      assert.equal(r.referencia, t);
      assert.equal(r.encargos, 200000);
    });
    test('anotar el total de Nu corrige el saldo propio SIN contar los encargos, y no pide confirmar', async () => {
      const e = conEncargos();
      const c = e.app.S.cajitas[0];
      const total = Math.round(e.app.nuValorEsperadoCajita(c).total * 100) / 100;
      let preguntas = 0;
      e.app.dialogo = async () => { preguntas++; return true; };
      lectura(e, texto(total));
      await e.app.guardarChequeoNu();
      assert.equal(preguntas, 0, 'es justo lo que se esperaba');
      assert.ok(Math.abs(c.saldo - (total - 200000)) < 0.01, 'el saldo propio no incluye los encargos');
      assert.equal(e.app.S.chequeosNu.at(-1).saldoReal, total, 'el chequeo guarda lo que marcó Nu');
    });
    test('anotar solo lo propio (como antes) ya no se acepta en silencio: avisa que es menor que los encargos y no guarda nada', async () => {
      const e = conEncargos();
      const c = e.app.S.cajitas[0];
      const antes = c.saldo;
      lectura(e, texto(e.app.nuValorEsperadoCajita(c).propio));
      await e.app.guardarChequeoNu();
      assert.equal(c.saldo, antes);
      assert.deepEqual(e.app.S.chequeosNu, []);
      assert.equal(e.toasts.at(-1).tipo, 'err');
      assert.match(e.toasts.at(-1).msg, /encargos/);
    });
    test('un total que se aleja mucho de lo esperado sí pide confirmar (se compara contra el total, no contra lo propio)', async () => {
      const e = conEncargos();
      const c = e.app.S.cajitas[0];
      const total = e.app.nuValorEsperadoCajita(c).total;
      let mensaje = '';
      e.app.dialogo = async (t, m) => { mensaje = m; return false; };
      lectura(e, texto(total + 50000));
      await e.app.guardarChequeoNu();
      assert.match(mensaje, /anotaste/);
      assert.deepEqual(e.app.S.chequeosNu, [], 'cancelado: no se guarda');
    });
  });

  describe('el reloj de los intereses arranca con el primer depósito', () => {
    // materializarIntereses() solo avanzaba c.fecha si había intereses que sellar. Con la cajita en $0 se quedaba en el día
    // de creación y el primer depósito (días después) ganaba intereses retroactivos de los días que la cajita estuvo vacía.
    test('depósito en una cajita vacía creada hace 5 días: no hay intereses retroactivos', () => {
      const e = entorno({ cajitas: [caja('a', 0, hace(5))] });
      e.app.sumarFuente('cajita:a', 100000, { origen: { modulo: 'test', ref: 'r1' } });
      const c = e.app.S.cajitas[0];
      assert.equal(c.fecha, hace(0));
      assert.equal(e.app.calcC(c).dias, 0);
      assert.equal(e.app.calcC(c).ganado, 0);
      assert.equal(e.app.cajitaGeneraIntereses(c), false, 'recién depositada: aún no cumple su primer día');
    });
    test('con saldo ya existente no cambia nada: los intereses se sellan como siempre', () => {
      const e = entorno({ cajitas: [caja('a', 100000, hace(30))] });
      const antes = e.app.calcC(e.app.S.cajitas[0]).ganado;
      e.app.materializarIntereses(e.app.S.cajitas[0]);
      assert.ok(antes > 0);
      assert.ok(Math.abs(e.app.S.cajitas[0].saldo - (100000 + antes)) < 0.01);
    });
  });
});

describe('retirar-sin-saldo', () => {
  // Efectivo, Nequi y cuentas personalizadas (y cajitas): el botón de retirar sale deshabilitado con saldo 0 y abrirRestarDinero()
  // lo vuelve a comprobar. Que un monto mayor al saldo se rechace ya lo cubre 'restar-dinero'.
  const { test } = require('node:test');
  const assert = require('node:assert/strict');
  const path = require('node:path');
  const { loadApp } = require('./support/load-app');

  const RAIZ = path.join(__dirname, '..');
  const core = f => path.join(RAIZ, 'js', 'core', f);
  const modulo = f => path.join(RAIZ, 'js', 'modules', f);
  const ARCHIVOS = [core('core-state.js'), core('calc-helpers.js'), core('fuentes-filtro.js'), core('cuenta-efectos.js'), modulo('nu.js'), modulo('cuentas.js')];

  const FUENTES = [['efectivo', 'efectivo'], ['Nequi', 'nequi'], ['cuenta personalizada', 'custom:z']];

  function entorno(fuente, saldo) {
    const app = loadApp(ARCHIVOS, { permissive: true });
    Object.assign(app.S, { cajitas: [], movimientos: [], gastosVar: [], cuentas: [
      { id: 'nequi', tipo: 'nequi', saldo: fuente === 'nequi' ? saldo : 0 }, { id: 'efectivo', tipo: 'efectivo', saldo: fuente === 'efectivo' ? saldo : 0 },
      { id: 'z', tipo: 'custom', nombre: 'Ahorro', saldo: fuente === 'custom:z' ? saldo : 0 }] });
    const campos = {};
    const el = () => ({ value: '', textContent: '', style: {}, disabled: false, title: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, focus() {} });
    app.document.getElementById = id => (campos[id] = campos[id] || el());
    const toasts = [], abiertos = [];
    app.toast = (msg, tipo) => toasts.push({ msg, tipo });
    app.openSheet = n => abiertos.push(n);
    app.save = () => {};
    app.fuenteLabel = f => f;
    return { app, toasts, abiertos, boton: el() };
  }

  for (const [nombre, fuente] of FUENTES) {
    test(nombre + ': con saldo 0 el botón sale deshabilitado, con motivo; con saldo se habilita', () => {
      const e = entorno(fuente, 0);
      e.app.actualizarBotonRetirar(e.boton, fuente);
      assert.equal(e.boton.disabled, true);
      assert.equal(e.boton.attrs['aria-disabled'], 'true');
      assert.match(e.boton.title, /saldo/i);
      const e2 = entorno(fuente, 5000);
      e2.app.actualizarBotonRetirar(e2.boton, fuente);
      assert.equal(e2.boton.disabled, false);
      assert.equal(e2.boton.title, '');
    });
    test(nombre + ': abrirRestarDinero con saldo 0 no abre el sheet y explica por qué', () => {
      const e = entorno(fuente, 0);
      e.app.abrirRestarDinero(fuente, 'Cuenta');
      assert.deepEqual(e.abiertos, []);
      assert.match(e.toasts.at(-1).msg, /saldo/i);
      assert.equal(e.toasts.at(-1).tipo, 'err');
    });
    test(nombre + ': abrirRestarDinero con saldo abre el sheet', () => {
      const e = entorno(fuente, 5000);
      e.app.abrirRestarDinero(fuente, 'Cuenta');
      assert.deepEqual(e.abiertos, ['restar-dinero']);
    });
  }
  test('un centavo de saldo ya permite retirar; menos de un centavo no', () => {
    const e = entorno('efectivo', 0.01);
    e.app.actualizarBotonRetirar(e.boton, 'efectivo');
    assert.equal(e.boton.disabled, false);
    const e2 = entorno('efectivo', 0.004);
    e2.app.actualizarBotonRetirar(e2.boton, 'efectivo');
    assert.equal(e2.boton.disabled, true);
  });
});

describe('cuentas-textos', () => {
  // Misma nomenclatura en todas las cuentas ("Agregar dinero" / "Retirar dinero"), campos de tasa solo numéricos y toast de salida roja.
  const { test } = require('node:test');
  const assert = require('node:assert/strict');
  const fs = require('node:fs');
  const path = require('node:path');
  const RAIZ = path.join(__dirname, '..');
  const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
  const index = leer('index.html');
  const etiquetaDe = id => { const i = index.indexOf('id="' + id + '"'); return /cuenta-action-btn-label">([^<]+)</.exec(index.slice(i))[1].trim(); };

  test('Nu usa los mismos botones que las demás cuentas', () => {
    assert.equal(etiquetaDe('btn-nu-entro'), etiquetaDe('btn-agregar-cuenta-det'));
    assert.equal(etiquetaDe('btn-nu-salio'), etiquetaDe('btn-restar-cuenta-det'));
    assert.equal(etiquetaDe('btn-nu-entro'), 'Agregar dinero');
    assert.equal(etiquetaDe('btn-nu-salio'), 'Retirar dinero');
  });
  test('el detalle de una cajita también', () => {
    assert.equal(etiquetaDe('cajita-det-agregar'), 'Agregar dinero');
    assert.equal(etiquetaDe('cajita-det-retirar'), 'Retirar dinero');
  });
  test('los sheets y mensajes del retiro y del movimiento de Nu usan "retirar"/"agregar", no "restar"/"entró"/"salió"', () => {
    assert.match(index, /id="rdTitle">Retirar dinero</);
    assert.match(index, /id="btn-confirmar-restar">\s*Retirar\s+del saldo/);
    assert.match(index, /id="nuMovTitle">Agregar a Nu</);
    for (const f of ['js/modules/cuentas.js', 'js/modules/nu.js']) assert.doesNotMatch(leer(f), /'Entró plata a |'Salió plata de |'Restar de /, f);
  });
  const etiquetaInput = id => { const i = index.indexOf('id="' + id + '"'); return index.slice(index.lastIndexOf('<', i), index.indexOf('>', i)); };
  test('los campos de tasa son de solo números: maxlength, sin autocompletar y (CDT y sugerida) con el saneo delegado', () => {
    for (const id of ['nuTasaGlobal', 'ctn-tasa', 'cdt_tasa']) {
      const tag = etiquetaInput(id);
      assert.match(tag, /maxlength="8"/, id);
      assert.match(tag, /autocomplete="off"/, id);
      assert.match(tag, /inputmode="decimal"/, id);
    }
    assert.match(etiquetaInput('ctn-tasa'), /data-tasa-ea/);
    assert.match(etiquetaInput('cdt_tasa'), /data-tasa-ea/);
  });
  test('todas las formas de meter plata a una cuenta dicen "Agregar" (el menú +, sus sheets y los avisos), no "Sumar"', () => {
    assert.doesNotMatch(index, /Sumar dinero|Sumar al saldo/);
    assert.match(index, /action-card-label">Agregar dinero</);
    for (const f of ['js/modules/cuentas.js', 'js/modules/nu.js']) assert.doesNotMatch(leer(f), /'Sumaste dinero en |' sumado — |' sumado a /, f);
  });
  test('convención de toast: la plata que sale (retirar, gasto, pago de gasto fijo) es "salida"; transferir entre cuentas es éxito neutro ("ok")', () => {
    const gastos = leer('js/modules/gastos.js');
    assert.match(gastos, /toast\('Gasto registrado', 'salida'\)/);
    assert.match(gastos, /toast\('Gasto registrado — dividido entre ' \+ splits\.length \+ ' cuentas', 'salida'\)/);
    assert.match(gastos, /toast\('Pago registrado correctamente', 'salida'\)/);
    assert.match(leer('js/modules/cuentas.js'), /transferido de \$\{escHtml\(fuenteLabel\(origen\)\)\} a \$\{escHtml\(fuenteLabel\(destino\)\)\}`, 'ok'/);
  });
  test('cambiar la tasa ya no muestra el aviso "Cajitas recalculadas" (no recalculaba nada hacia atrás)', () => {
    assert.doesNotMatch(leer('js/core/firebase-sync.js'), /recalculadas/);
    assert.doesNotMatch(leer('js/core/firebase-sync.js'), /nuTasaVigenciaFecha/, 'el campo "Vigente desde" ya no existe en la página');
  });
  test('retirar dinero (cuentas y Nu) avisa con el toast de salida, no con el azul de info', () => {
    assert.match(leer('js/modules/cuentas.js'), /retirado — '\+escHtml\(desc\),'salida'/);
    assert.match(leer('js/modules/nu.js'), /escHtml\(desc\), 'salida'\)/);
    assert.match(index, /\.toast\.toast-salida\{/);
  });
});

describe('cuentas-nu-archivos', () => {
  // Cuentas se reparte en dos archivos del mismo grupo lazy: nu.js (todo lo de Nu) y cuentas.js (el resto). Estas pruebas
  // protegen esa estructura: dependencia en un solo sentido (Nu → Cuentas), orden de carga, botones registrados, y que ningún
  // test se olvide de cargar nu.js.
  const { test } = require('node:test');
  const assert = require('node:assert/strict');
  const fs = require('node:fs');
  const path = require('node:path');
  const { loadApp } = require('./support/load-app');
  const RAIZ = path.join(__dirname, '..');
  const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
  const core = f => path.join(RAIZ, 'js', 'core', f);
  const modulo = f => path.join(RAIZ, 'js', 'modules', f);
  const BASE = [core('core-state.js'), core('periodo.js'), core('nu-calc.js'), core('calc-helpers.js'), core('fuentes-filtro.js'), core('cuenta-efectos.js')];

  test('el grupo lazy "cuentas" carga los dos archivos (nu.js y cuentas.js)', () => {
    const m = /cuentas:\s*\[([^\]]*)\]/.exec(leer('js/core/lazy-loader.js'));
    assert.ok(m, 'no se encontró el grupo cuentas en lazy-loader.js');
    const archivos = [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
    assert.deepEqual([...archivos].sort(), ['js/modules/cuentas.js', 'js/modules/nu.js']);
  });

  test('cada archivo carga SOLO: ninguno necesita al otro al cargar (el orden no importa)', () => {
    assert.doesNotThrow(() => loadApp([...BASE, modulo('nu.js')]), 'nu.js solo');
    assert.doesNotThrow(() => loadApp([...BASE, modulo('cuentas.js')]), 'cuentas.js solo');
    assert.doesNotThrow(() => loadApp([...BASE, modulo('cuentas.js'), modulo('nu.js')]), 'en el orden contrario');
  });

  test('cada función vive en UN solo archivo: nada declarado a nivel superior en los dos', () => {
    const nombres = f => [...leer(f).matchAll(/^(?:async function |function |let |const |var )([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
    const enNu = new Set(nombres('js/modules/nu.js'));
    const repetidas = nombres('js/modules/cuentas.js').filter(n => enNu.has(n));
    assert.deepEqual(repetidas, []);
  });

  // Frontera entre las dos capas. Se lee el código SIN comentarios ni cadenas de documentación, porque lo que cuenta es qué usa de verdad.
  const sinComentarios = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
  const declaradas = t => new Set([...t.matchAll(/^(?:async function |function |let |const |var )([A-Za-z_$][\w$]*)/gm)].map(m => m[1]));
  const usadasDe = (codigo, nombres) => [...nombres].filter(n => new RegExp('(?<![\\w$.])' + n.replace(/\$/g, '\\$') + '(?![\\w$])').test(codigo)).sort();

  test('la dependencia va en UN solo sentido: cuentas.js no usa nada de nu.js (Nu se le presenta registrándose en CuentaPantallas)', () => {
    const usadas = usadasDe(sinComentarios(leer('js/modules/cuentas.js')), declaradas(leer('js/modules/nu.js')));
    assert.deepEqual(usadas, [], 'cuentas.js nombra cosas de nu.js: muévelas a nu.js o pásalas por CuentaPantallas');
    assert.match(leer('js/modules/nu.js'), /CuentaPantallas\.nu\s*=/);
    assert.match(leer('js/core/core-state.js'), /const CuentaPantallas\s*=\s*\{\s*\}/);
  });

  test('lo que Nu toma de cuentas.js es esta lista (si cambia, se decide a propósito y se actualiza la cabecera de nu.js)', () => {
    const usadas = usadasDe(sinComentarios(leer('js/modules/nu.js')), declaradas(leer('js/modules/cuentas.js')));
    assert.deepEqual(usadas, ['_MIN_RETIRO', '_aperturaToggleUI', '_descriptorCuenta', '_setBtnEstado', '_setBtnTransferir', '_showCuentasPanel',
      '_tituloCuentaHtml', 'abrirAgregarDinero', 'abrirRestarDinero', 'abrirTransferir', 'actualizarBotonRetirar', 'actualizarBotonesTransferir',
      'getMovimientosCuenta', 'registrarEntradaConApertura', 'registrarSalida', 'renderMovsCuenta']);
  });

  test('todo botón data-action="cuentas:…" / "nu:…" (en index.html y en el HTML que arman los módulos) está registrado en su namespace', () => {
    const fuentes = ['index.html', 'js/modules/cuentas.js', 'js/modules/nu.js'];
    const registrado = ns => {
      const claves = new Set();
      for (const f of ['js/modules/cuentas.js', 'js/modules/nu.js']) {
        const t = leer(f);
        const i = t.indexOf("Events.registerAll('" + ns + "', {");
        if (i < 0) continue;
        const bloque = t.slice(i, t.indexOf('\n});', i)).split('\n').slice(1).map(l => l.replace(/\/\/.*$/, '')).join('\n');
        for (const m of bloque.matchAll(/^\s*([A-Za-z_]\w*)\s*(?::|,)/gm)) claves.add(m[1]);
      }
      return claves;
    };
    const reg = { cuentas: registrado('cuentas'), nu: registrado('nu') };
    assert.ok(reg.cuentas.size > 3 && reg.nu.size > 10, 'no se pudieron leer los registros');
    const usadas = [];
    for (const f of fuentes) {
      const t = leer(f);
      for (const m of t.matchAll(/(?:data-action="|Events\.attr\(\s*')(cuentas|nu):([A-Za-z_]\w*)/g)) usadas.push([f, m[1], m[2]]);
    }
    assert.ok(usadas.length > 20, 'no se encontraron usos');
    const rotas = usadas.filter(([, ns, nombre]) => !reg[ns].has(nombre)).map(([f, ns, n]) => f + ' → ' + ns + ':' + n);
    assert.deepEqual([...new Set(rotas)], []);
  });

  test('ningún test carga cuentas.js sin cargar también nu.js (permissive lo taparía en silencio)', () => {
    const tests = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js'));
    const sinNu = tests.filter(f => {
      const t = fs.readFileSync(path.join(__dirname, f), 'utf8').split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
      return /['"]cuentas\.js['"]/.test(t) && !/['"]nu\.js['"]/.test(t);
    });
    assert.deepEqual(sinNu, []);
  });
});
