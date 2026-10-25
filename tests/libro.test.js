'use strict';
// tests/libro.test.js — Libro de movimientos: puerta única de saldos, origen/reversión, módulos que la usan y la guardia estática (nadie escribe `.saldo`; toda llamada con `origen`).
// Un archivo por sección de la app. Cada bloque `describe` es lo que antes era un archivo suelto.
// Corre con:  node --test tests/libro.test.js   (o todo: npm test)
const { describe } = require('node:test');

describe('libro', () => {
  // tests/libro.test.js — el libro de movimientos (core-state.js): saldo de cada cuenta == suma de sus entradas.
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const path = require('node:path');
  const { loadApp } = require('./support/load-app');
  const CORE = process.env.MIS_FINANZAS_CORE_DIR || path.join(__dirname, '..', 'js', 'core');
  const plano = x => JSON.parse(JSON.stringify(x));

  function app(estado = {}) {
    const ctx = loadApp(['core-state.js', 'cuenta-efectos.js', 'periodo.js', 'nu-calc.js'].map(f => path.join(CORE, f)), { permissive: true });
    Object.assign(ctx.S, {
      modulos: {}, libro: [], movimientos: [], gastosVar: [], tarjetasCredito: [],
      cuentas: [{ id: 'nequi', tipo: 'nequi', saldo: 0 }, { id: 'efectivo', tipo: 'efectivo', saldo: 0 }, { id: 'cu1', tipo: 'custom', nombre: 'Madre', saldo: 0 }],
      cajitas: [{ id: 'c1', nombre: 'Sobra', saldo: 0 }],
    }, estado);
    return ctx;
  }
  const saldo = (ctx, id) => ctx.S.cuentas.concat(ctx.S.cajitas).find(c => c.id === id).saldo;

  test('registrar — tipo "movimiento" y origen "sin-origen" por defecto; solo cuentas con saldo; monto 0 no entra', () => {
    const ctx = app();
    const id = ctx.Libro.registrar('nequi', 100, { fecha: '2026-10-01' });
    const e = plano(ctx.S.libro[0]);
    assert.deepEqual([e.id === id, e.cuenta, e.monto, e.tipo, e.origen.modulo], [true, 'nequi', 100, 'movimiento', 'sin-origen']);
    assert.equal(ctx.Libro.registrar('tc:x', 5, {}), null, 'una tarjeta de crédito no es cuenta con saldo');
    assert.equal(ctx.Libro.registrar('alcancia', 5, {}), null);
    assert.equal(ctx.Libro.registrar('nequi', 0, {}), null);
    assert.equal(ctx.S.libro.length, 1);
  });

  test('registrar — rendimiento: una sola entrada por cuenta y mes', () => {
    const ctx = app(); const st = { libro: [] };
    ctx.Libro.registrar('cajita:c1', 10, { tipo: 'rendimiento', fecha: '2026-10-01' }, st);
    ctx.Libro.registrar('cajita:c1', 5, { tipo: 'rendimiento', fecha: '2026-10-20' }, st);
    ctx.Libro.registrar('cajita:c1', 7, { tipo: 'rendimiento', fecha: '2026-11-02' }, st);
    ctx.Libro.registrar('cajita:c2', 3, { tipo: 'rendimiento', fecha: '2026-10-05' }, st);
    assert.deepEqual(plano(st.libro.map(l => [l.cuenta, l.fecha.slice(0, 7), l.monto])), [['cajita:c1', '2026-10', 15], ['cajita:c1', '2026-11', 7], ['cajita:c2', '2026-10', 3]]);
  });

  test('conOrigen — lo que se mueva dentro lleva ese origen; con rev:true es una "reversion" con el mismo ref', () => {
    const ctx = app();
    ctx.Libro.conOrigen({ modulo: 'prestado', ref: 'm1' }, () => ctx.sumarFuente('nequi', 10));
    ctx.Libro.conOrigen({ modulo: 'prestado', ref: 'm1', rev: true }, () => ctx.descontarFuente('nequi', 10));
    const [a, b] = plano(ctx.S.libro);
    assert.deepEqual([a.tipo, a.monto, a.origen.ref, b.tipo, b.monto, b.origen.ref, b.origen.rev], ['movimiento', 10, 'm1', 'reversion', -10, 'm1', true]);
    ctx.sumarFuente('nequi', 1);
    assert.equal(plano(ctx.S.libro[2]).origen.modulo, 'sin-origen', 'fuera del bloque vuelve a no haber contexto');
  });

  test('puerta única — sumarFuente/descontarFuente cambian el saldo Y dejan su entrada; el libro cuadra', () => {
    const ctx = app();
    ctx.sumarFuente('efectivo', 50, { origen: { modulo: 't', ref: 'r1' } });
    ctx.sumarFuente('custom:cu1', 20);
    ctx.sumarFuente('cajita:c1', 7.5);
    ctx.descontarFuente('efectivo', 20, { origen: { modulo: 't', ref: 'r2' } });
    assert.deepEqual([saldo(ctx, 'efectivo'), saldo(ctx, 'cu1'), saldo(ctx, 'c1')], [30, 20, 7.5]);
    assert.deepEqual(plano(ctx.S.libro.filter(l => l.cuenta === 'efectivo').map(l => [l.monto, l.origen.ref])), [[50, 'r1'], [-20, 'r2']]);
    assert.equal(ctx.Libro.verificar().ok, true);
    assert.equal(ctx.Libro.saldo('efectivo'), 30);
  });

  test('el saldo NUNCA se recorta: restar más de lo que hay deja la cuenta negativa y visible', () => {
    const ctx = app();
    ctx.descontarFuente('nequi', 300);
    assert.equal(saldo(ctx, 'nequi'), -300);
    assert.equal(ctx.Libro.verificar().ok, true);
  });

  test('una tarjeta de crédito no pasa por el libro (su deuda se deriva de sus propios registros)', () => {
    const ctx = app({ tarjetasCredito: [{ id: 'tc1', nombre: 'TC', deuda: 0 }] });
    ctx.descontarFuente('tc:tc1', 100);
    assert.equal(ctx.S.tarjetasCredito[0].deuda, 100);
    assert.equal(ctx.S.libro.length, 0);
  });

  test('ajustarSaldoCuenta — registra la DIFERENCIA; sin cambio no deja entrada', () => {
    const ctx = app();
    ctx.sumarFuente('cajita:c1', 100);
    assert.equal(ctx.ajustarSaldoCuenta('cajita:c1', 112.5, { tipo: 'ajuste', desc: 'chequeo' }), 12.5);
    assert.equal(ctx.ajustarSaldoCuenta('cajita:c1', 112.5, { tipo: 'ajuste' }), 0);
    const ult = plano(ctx.S.libro[ctx.S.libro.length - 1]);
    assert.deepEqual([ult.tipo, ult.monto, ult.desc, ctx.S.libro.length], ['ajuste', 12.5, 'chequeo', 2]);
    assert.equal(ctx.Libro.verificar().ok, true);
  });

  test('verificar — detecta un saldo que se movió sin pasar por la puerta única, con el nombre de la cuenta', () => {
    const ctx = app();
    ctx.sumarFuente('nequi', 100);
    ctx.S.cuentas.find(c => c.id === 'cu1').saldo = 40;   // alguien escribe c.saldo directamente
    ctx.S.cajitas[0].saldo = -5;
    const v = plano(ctx.Libro.verificar());
    assert.equal(v.ok, false);
    assert.deepEqual(v.descuadres.map(f => [f.nombre, f.dif]).sort(), [['Madre', 40], ['Sobra (Nu)', -5]]);
  });

  test('verificar — ignora entradas de cuentas que ya no existen', () => {
    const ctx = app();
    ctx.sumarFuente('custom:cu1', 10);
    ctx.S.cuentas = ctx.S.cuentas.filter(c => c.id !== 'cu1');
    assert.equal(ctx.Libro.verificar().ok, true);
  });

  test('entradasVisibles — solo lo que ningún registro de módulo representa (intereses, ajustes, CDT)', () => {
    const ctx = app();
    const st = { libro: [] };
    ['movimiento', 'reversion', 'apertura', 'rendimiento', 'ajuste', 'cdt'].forEach((t, i) => ctx.Libro.registrar('nequi', i + 1, { tipo: t, fecha: '2026-10-0' + (i + 1) }, st));
    assert.deepEqual(plano(ctx.Libro.entradasVisibles(st).map(l => l.tipo)), ['rendimiento', 'ajuste', 'cdt']);
  });

  test('espejo y libro van juntos: registrarMovEspejo escribe en S.movimientos con `fuente` para cualquier cuenta', () => {
    const ctx = app();
    const a = ctx.registrarMovEspejo({ cuenta: 'cajita:c1', flujo: 'entrada', monto: 5, fecha: '2026-10-01', desc: 'x', origen: 'Prestado' });
    assert.deepEqual(plano(ctx.S.movimientos.find(m => m.id === a)), plano({ ...ctx.S.movimientos[0] }));
    assert.equal(ctx.S.movimientos[0].fuente, 'cajita:c1');
    assert.equal(ctx.borrarMovEspejo('cajita:c1', a), true);
    assert.equal(ctx.S.movimientos.length, 0);
  });
});

describe('libro-modulos', () => {
  // tests/libro-modulos.test.js — los módulos pasan su origen a la puerta única y dejan el libro cuadrado.
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const path = require('node:path');
  const { loadApp } = require('./support/load-app');
  const RAIZ = path.join(__dirname, '..');
  const core = f => path.join(RAIZ, 'js', 'core', f), modulo = f => path.join(RAIZ, 'js', 'modules', f);
  const ARCHIVOS = [core('core-state.js'), core('calc-helpers.js'), core('cuenta-efectos.js'), core('periodo.js'), core('nu-calc.js'), modulo('nu.js'), modulo('cuentas.js'), modulo('mesada.js'), modulo('encargos.js')];
  const plano = x => JSON.parse(JSON.stringify(x));

  function cargar() {
    const app = loadApp(ARCHIVOS, { permissive: true });
    Object.assign(app.S, { modulos: { mesada: true }, libro: [], movimientos: [], gastosVar: [], cajitas: [],
      cuentas: [{ id: 'nequi', tipo: 'nequi', saldo: 0 }, { id: 'efectivo', tipo: 'efectivo', saldo: 0 }] });
    return app;
  }
  const ultima = app => plano(app.S.libro[app.S.libro.length - 1]);

  test('Sumar dinero (cuentas.js) — la entrada del libro apunta al movimiento que crea', () => {
    const app = cargar();
    app.registrarEntradaConApertura('efectivo', 1000, '2026-10-11', 'Sueldo', false, '');
    const mov = plano(app.S.movimientos[app.S.movimientos.length - 1]), e = ultima(app);
    assert.deepEqual([e.monto, e.origen.modulo, e.origen.ref], [1000, 'cuentas', mov.id]);
    assert.equal(app.Libro.verificar().ok, true);
  });

  test('Restar dinero (cuentas.js) — salida registrada completa y apuntando a su movimiento', () => {
    const app = cargar();
    app.registrarSalida('efectivo', 400, '2026-10-11', 'Ajuste', '');
    const mov = plano(app.S.movimientos[app.S.movimientos.length - 1]), e = ultima(app);
    assert.deepEqual([e.monto, e.origen.modulo, e.origen.ref], [-400, 'cuentas', mov.id]);
    assert.equal(app.S.cuentas.find(c => c.id === 'efectivo').saldo, -400, 'sin recorte: la cuenta queda negativa y se ve');
    assert.equal(app.Libro.verificar().ok, true);
  });

  test('Mesada — abonar y quitar el abono: la entrada apunta al espejo y la reversión lleva el mismo ref', () => {
    const app = cargar();
    const id = app._mesadaEntrar('nequi', 500, '2026-10-11', 'Mesada');
    assert.ok(id);
    assert.deepEqual([ultima(app).origen.modulo, ultima(app).origen.ref, ultima(app).tipo], ['mesada', id, 'movimiento']);
    app._mesadaSacar('nequi', 500, id, true);
    const r = ultima(app);
    assert.deepEqual([r.tipo, r.monto, r.origen.ref, r.origen.rev], ['reversion', -500, id, true]);
    assert.equal(app.Libro.verificar().ok, true);
  });

  test('un saldo cambiado sin pasar por la puerta única lo detecta verificar()', () => {
    const app = cargar();
    app.sumarFuente('nequi', 100);
    app.S.cuentas.find(c => c.id === 'nequi').saldo += 5;
    assert.equal(plano(app.Libro.verificar()).descuadres[0].dif, 5);
  });

  test('Encargos — eliminar el saldo inicial NO toca el saldo de la cuenta ni el libro (es plata ajena, no está en c.saldo)', async () => {
    const app = cargar();
    app.dialogo = async () => true;
    app.S.cuentas.find(c => c.id === 'nequi').saldo = 0; app.sumarFuente('nequi', 1000, { origen: { modulo: 't', ref: 'x' } });
    app.S.encargos = [{ id: 'e1', nombre: 'Ana', saldoInicial: 300, cuentaInicial: 'nequi', movimientos: [] }];
    const antes = app.S.libro.length;
    await app.deleteMovEncargo('e1', '__saldo_ini__');
    assert.equal(app.S.cuentas.find(c => c.id === 'nequi').saldo, 1000, 'el saldo propio queda intacto');
    assert.equal(app.S.libro.length, antes, 'sin entrada nueva en el libro');
    assert.equal(app.S.encargos[0].saldoInicial, 0);
    assert.equal(app.Libro.verificar().ok, true);
  });
});

describe('puerta-unica', () => {
  // Guardia estática del libro de movimientos (libro-de-movimientos.md §3, reglas 2 y 3):
  //   · nadie escribe `c.saldo` fuera de la puerta única (sumarFuente / descontarFuente / ajustarSaldoCuenta en core-state.js);
  //   · toda llamada a sumarFuente / descontarFuente lleva `origen` (directo, vía _og…(), o con un `opts` ya armado).
  // Un módulo nuevo que se salte cualquiera de las dos rompe este test en vez de dejar una entrada 'sin-origen' o un
  // descuadre que solo avisaría `save()` una vez por sesión.
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const fs = require('node:fs');
  const path = require('node:path');

  const RAIZ = path.join(__dirname, '..', 'js');
  const archivos = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? archivos(path.join(d, e.name)) : /\.js$/.test(e.name) ? [path.join(d, e.name)] : []);

  // Quita comentarios (conservando saltos de línea) sin tocar el contenido de strings ni de plantillas.
  function sinComentarios(src) {
    let out = '', i = 0;
    while (i < src.length) {
      const c = src[i], n = src[i + 1];
      if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (c === '/' && n === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') out += '\n'; i++; } i += 2; continue; }
      if (c === '"' || c === "'" || c === '`') {
        const q = c; out += c; i++;
        while (i < src.length && src[i] !== q) { if (src[i] === '\\') { out += src[i++]; } out += src[i++]; }
        out += q; i++; continue;
      }
      out += c; i++;
    }
    return out;
  }

  // Texto de los argumentos de la llamada que empieza en src[abre] === '('.
  function argumentos(src, abre) {
    let prof = 0;
    for (let i = abre; i < src.length; i++) {
      if (src[i] === '(') prof++;
      else if (src[i] === ')' && --prof === 0) return src.slice(abre + 1, i);
    }
    return src.slice(abre + 1, abre + 300);
  }

  const lineaDe = (src, idx) => src.slice(0, idx).split('\n').length;

  test('nadie escribe `.saldo` fuera de la puerta única', () => {
    const fuera = [];
    archivos(RAIZ).forEach(f => {
      let src = sinComentarios(fs.readFileSync(f, 'utf8'));
      if (path.basename(f) === 'core-state.js') { // la puerta única misma
        const a = src.indexOf('function ajustarSaldoCuenta'), b = src.indexOf('function _listaFuentes');
        assert.ok(a > 0 && b > a, 'no se encontró el bloque de la puerta única en core-state.js');
        src = src.slice(0, a) + src.slice(a, b).replace(/[^\n]/g, ' ') + src.slice(b);
      }
      const re = /\.saldo\s*(?:\+|-|\*|\/)?=(?!=)/g;
      let m;
      while ((m = re.exec(src))) fuera.push(path.relative(RAIZ, f) + ':' + lineaDe(src, m.index));
    });
    assert.deepEqual(fuera, [], 'escrituras directas de saldo (usar sumarFuente/descontarFuente/ajustarSaldoCuenta con origen): ' + fuera.join(', '));
  });

  // Llamadas que NO llevan `origen` en su texto porque se ejecutan dentro de Libro.conOrigen(...) (las reversiones de Préstamos,
  // vía _enReversion). Cada una se identifica por archivo y texto exacto: una llamada nueva sin origen NO queda cubierta.
  const CUBIERTAS_POR_CONTEXTO = {
    'modules/prestado.js': new Set([
      'destino, monto', 'f.fuente, f.monto', 'm.fuente, m.monto', 'p.cuenta, p.monto', 'r.fuente, r.monto',
    ]),
  };

  test('toda llamada a sumarFuente/descontarFuente lleva `origen` (o corre dentro de Libro.conOrigen)', () => {
    const sin = [];
    archivos(RAIZ).forEach(f => {
      const rel = path.relative(RAIZ, f).split(path.sep).join('/');
      if (rel === 'core/core-state.js') return; // define las funciones
      const src = sinComentarios(fs.readFileSync(f, 'utf8'));
      const re = /\b(?:sumarFuente|descontarFuente)\s*\(/g;
      let m;
      while ((m = re.exec(src))) {
        const args = argumentos(src, m.index + m[0].length - 1).replace(/\s+/g, ' ').trim();
        if (/origen|\b_og\w*|\bopts\b|\bog\b/.test(args)) continue;
        if ((CUBIERTAS_POR_CONTEXTO[rel] || new Set()).has(args)) continue;
        sin.push(rel + ':' + lineaDe(src, m.index) + '  (' + args + ')');
      }
    });
    assert.deepEqual(sin, [], 'llamadas de saldo sin origen: pasa { origen: { modulo, ref } } (libro-de-movimientos.md §3.3):\n  ' + sin.join('\n  '));
  });
});

describe('plata-comprometida', () => {
  const test = require('node:test');
  const fs = require('node:fs');
  const os = require('node:os');
  const assert = require('node:assert/strict');
  const path = require('node:path');
  const { loadApp } = require('./support/load-app');
  const { createFakeDom } = require('./support/fake-dom');
  const RAIZ = path.join(__dirname, '..');
  const core = f => path.join(RAIZ, 'js', 'core', f), modulo = f => path.join(RAIZ, 'js', 'modules', f);
  // El módulo vive dentro de una función: lo único que expone es lo que registra con Events.registerAll('cp', {...}).
  // Un archivo previo reemplaza ese registro para capturar los handlers (así es como la app misma los usa).
  const CAPTURA = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cp-')), 'captura.js');
  fs.writeFileSync(CAPTURA, "Events.registerAll = function(ns, mapa){ (window.__reg = window.__reg || {})[ns] = mapa; };");
  const ARCHIVOS = [CAPTURA, core('core-state.js'), core('periodo.js'), core('nu-calc.js'), core('calc-helpers.js'), core('cuenta-efectos.js'), modulo('nu.js'), modulo('cuentas.js'), modulo('plata_comprometida.js')];
  const plano = x => JSON.parse(JSON.stringify(x));

  function entorno(item, { sobranteCuenta = 'nequi', extraCuentas = [] } = {}) {
    const app = loadApp(ARCHIVOS, { permissive: true });
    Object.assign(app.S, { modulos: {}, libro: [], movimientos: [], gastosVar: [], cajitas: [], tarjetasCredito: [], plataComprometida: [item],
      cuentas: [{ id: 'nequi', tipo: 'nequi', saldo: 0 }, { id: 'efectivo', tipo: 'efectivo', saldo: 0 }, ...extraCuentas] });
    app.sumarFuente('nequi', 1000, { origen: { modulo: 't', ref: 'base-n' } });
    app.sumarFuente('efectivo', 50000, { origen: { modulo: 't', ref: 'base-e' } });
    const dom = createFakeDom({ 'cp-recibir-fecha': { value: '2026-10-13' }, 'cp-recibir-sobrante-cuenta': { value: sobranteCuenta } });
    app.document = dom.document;
    app.dialogo = async () => true; app.save = () => {}; app.refresh = () => {}; app.toast = () => {};
    const cp = app.__reg.cp;
    const og = (ref, rev) => ({ origen: { modulo: 'plata-comprometida', ref, ...(rev ? { rev: true } : {}) } });
    const saldo = id => app.getSaldoFuente(id);
    const neto = () => { const n = {}; app.S.libro.forEach(e => { n[e.cuenta] = (n[e.cuenta] || 0) + e.monto; }); return n; };
    return { app, cp, og, saldo, neto };
  }
  const recibir = e => { e.cp.abrirRecibir('cp1'); e.cp.confirmarRecibir(); };
  const item = destinos => ({ id: 'cp1', desc: 'Arriendo', montoTotal: 100000, cuentaDestino: 'nequi', recibido: false, destinos });

  test('recibir con reposición y sobrante deja el libro cuadrado y cada patada con su origen', () => {
    const e = entorno(item([{ id: 'd1', tipo: 'reposicion', desc: 'Reponer', monto: 30000, cuentaId: 'efectivo', yaSaque: false }]));
    recibir(e);
    assert.equal(e.saldo('efectivo'), 80000);
    assert.equal(e.saldo('nequi'), 71000, '1.000 + 70.000 de sobrante');
    const orig = e.app.S.libro.filter(l => l.origen.modulo === 'plata-comprometida').map(l => l.origen.ref).sort();
    assert.deepEqual(plano(orig), ['cp1', 'd1']);
    assert.equal(e.app.Libro.verificar().ok, true);
  });

  test('eliminar un ingreso ya recibido devuelve TODO, sobrante incluido (como si nunca hubiera pasado)', async () => {
    const e = entorno(item([{ id: 'd1', tipo: 'reposicion', desc: 'Reponer', monto: 30000, cuentaId: 'efectivo', yaSaque: false }]));
    recibir(e);
    await e.cp.eliminar('cp1');
    assert.equal(e.saldo('efectivo'), 50000);
    assert.equal(e.saldo('nequi'), 1000, 'antes: el sobrante se quedaba en la cuenta');
    assert.equal(e.app.S.movimientos.length, 0);
    assert.equal(e.app.S.plataComprometida.length, 0);
    assert.equal(e.app.Libro.verificar().ok, true);
    assert.deepEqual(plano(e.neto()), { nequi: 1000, efectivo: 50000 }, 'lo que sumó el módulo y lo que revirtió se cancelan');
  });

  test('eliminar un ingreso recibido que tenía un adelanto devuelve también el adelanto', async () => {
    const e = entorno(item([{ id: 'd1', tipo: 'reposicion', desc: 'Reponer', monto: 30000, cuentaId: 'efectivo', yaSaque: true }]));
    // el adelanto ya se había hecho antes de recibir (como lo deja _cpdConfirmar / _cpGuardarMarcados)
    e.app.sumarFuente('efectivo', -30000, e.og('d1'));
    e.app.S.movimientos.push({ id: 'adel', tipo: 'salida', fuente: 'efectivo', monto: 30000, fecha: '2026-10-01', desc: 'Adelanto comprometido: Reponer' });
    recibir(e);
    assert.equal(e.saldo('efectivo'), 50000, 'adelanto (−30.000) y reposición (+30.000)');
    await e.cp.eliminar('cp1');
    assert.equal(e.saldo('efectivo'), 50000, 'antes quedaba en 20.000: el adelanto no se devolvía');
    assert.equal(e.saldo('nequi'), 1000);
    assert.equal(e.app.S.movimientos.length, 0, 'ni la fila del adelanto ni la de la reposición');
    assert.equal(e.app.Libro.verificar().ok, true);
  });

  test('eliminar un ingreso recibido con un gasto de cajita ya pagado devuelve también el pago', async () => {
    const e = entorno(item([{ id: 'd2', tipo: 'gasto', desc: 'Luz', monto: 20000, gastoOrigen: 'cajita', gastoCajita: 'efectivo', yaPague: true }]));
    e.app.sumarFuente('efectivo', -20000, e.og('d2'));
    e.app.S.movimientos.push({ id: 'pago', tipo: 'salida', fuente: 'efectivo', monto: 20000, fecha: '2026-10-02', desc: 'Pago: Luz' });
    recibir(e);
    assert.equal(e.saldo('efectivo'), 50000);
    await e.cp.eliminar('cp1');
    assert.equal(e.saldo('efectivo'), 50000);
    assert.equal(e.saldo('nequi'), 1000);
    assert.equal(e.app.S.movimientos.length, 0);
    assert.equal(e.app.Libro.verificar().ok, true);
  });

  test('eliminar un ingreso NO recibido con adelanto devuelve el adelanto (con el mismo ref)', async () => {
    const e = entorno(item([{ id: 'd1', tipo: 'reposicion', desc: 'Reponer', monto: 30000, cuentaId: 'efectivo', yaSaque: true }]));
    e.app.sumarFuente('efectivo', -30000, e.og('d1'));
    e.app.S.movimientos.push({ id: 'adel', tipo: 'salida', fuente: 'efectivo', monto: 30000, fecha: '2026-10-01', desc: 'Adelanto comprometido: Reponer' });
    await e.cp.eliminar('cp1');
    assert.equal(e.saldo('efectivo'), 50000);
    const rev = e.app.S.libro.find(l => l.origen.rev && l.origen.modulo === 'plata-comprometida');
    assert.deepEqual([rev.tipo, rev.origen.ref, rev.monto], ['reversion', 'd1', 30000]);
    assert.equal(e.app.Libro.verificar().ok, true);
  });

  test('el sobrante que entra a una cuenta personalizada no escribe la lista vieja cuenta.movimientos', () => {
    const e = entorno({ ...item([]), cuentaDestino: 'custom:z' }, { sobranteCuenta: 'custom:z', extraCuentas: [{ id: 'z', tipo: 'custom', nombre: 'Z', saldo: 0 }] });
    recibir(e);
    assert.equal(e.saldo('custom:z'), 100000);
    assert.equal(e.app.S.cuentas.find(c => c.id === 'z').movimientos, undefined);
    assert.equal(e.app.S.movimientos.filter(m => m.fuente === 'custom:z' && m.clase === 'ingreso').length, 1, 'el ingreso vive en S.movimientos');
    assert.equal(e.app.Libro.verificar().ok, true);
  });
});
