'use strict';
// tests/cierre-wrapped.test.js — Cierre de períodos y Wrapped: huella de invariantes, vista previa del cierre y Wrapped guardado.
// Un archivo por sección de la app. Cada bloque `describe` es lo que antes era un archivo suelto (huella.test.js, cierre.test.js, wrapped-guardado.test.js).
// Corre con:  node --test tests/cierre-wrapped.test.js   (o todo: npm test)
const { describe: _describe } = require('node:test');

_describe('huella', () => {
// tests/huella.test.js — huella de invariantes (js/core/huella.js): sondas, comparación, aislamiento de estado y verificación de
// transformaciones del almacenamiento. Es la herramienta que garantizará que un cierre/archivo no cambia la plata ni los resultados
// (docs/cierre-de-periodos.md). Usa historia sintética de ~2,7 años (tests/support/datos-sinteticos.js).
// Corre con:  node --test tests/huella.test.js   (o todo: npm test)
const { describe, test, before } = require('node:test');
const assert = require('node:assert/strict');
const { cargarApp, generar } = require('./support/datos-sinteticos');

const plano = x => JSON.parse(JSON.stringify(x));
const BASE = ['saldos', 'periodos', 'deudas', 'patrimonio', 'tarjetas', 'encargos', 'alcancia', 'wrapped'];

// Transformación de REFERENCIA sin pérdida: separa lo anterior a `anioVivo` en «archivos» por año y lo vuelve a unir (hidratar).
// Es un prototipo de la estrategia B del documento (archivo por año con hidratación transparente) y demuestra que la huella sirve
// tal cual para validarla. No es código de producción.
const PLANAS = ['libro', 'movimientos', 'gastosVar', 'transferencias'];
function partirPorAnio(est, anioVivo) {
  const archivos = {};
  PLANAS.forEach(k => {
    const vivos = [];
    (est[k] || []).forEach(r => {
      const a = String(r.fecha).slice(0, 4);
      if (a < anioVivo) { ((archivos[a] = archivos[a] || {})[k] = archivos[a][k] || []).push(r); } else vivos.push(r);
    });
    est[k] = vivos;
  });
  return archivos;
}
function hidratar(est, archivos) {
  PLANAS.forEach(k => {
    const previos = [];
    Object.keys(archivos).sort().forEach(a => (archivos[a][k] || []).forEach(r => previos.push(r)));
    est[k] = previos.concat(est[k] || []);
  });
}

describe('huella', () => {
  let ctx, snapshot, huella;
  before(() => {
    ctx = cargarApp();
    generar(ctx);
    snapshot = JSON.stringify(ctx.S);
    huella = ctx.Huella.calcular(ctx.S, { requeridas: BASE });
  });

  test('las 8 sondas base están registradas y calculan sin errores sobre una historia de 2,7 años', () => {
    assert.deepEqual(plano(ctx.Huella.SONDAS_BASE), BASE);
    BASE.forEach(n => assert.ok(ctx.Huella.registradas().includes(n), 'falta la sonda ' + n));
    assert.deepEqual(plano(huella.errores), {});
    assert.deepEqual(Object.keys(huella.sondas).sort(), BASE.slice().sort());
    assert.equal(Object.keys(huella.sondas.periodos).length, 33, 'un resultado por cada mes con datos');
    assert.deepEqual(Object.keys(huella.sondas.wrapped), ['2025'], 'Wrapped solo puede mostrar el año recién cerrado (hoy 2026-10-30 → 2025)');
  });

  test('POLÍTICA DE CORTE y Wrapped: podar todo lo anterior al corte permitido deja Wrapped IDÉNTICO (el año objetivo no se toca); lo que sí cambia son los períodos, que necesitan resumen', () => {
    const corte = ctx.Cierre.corteMasReciente(ctx.hoy()); // 2024-09
    assert.equal(corte, '2024-09');
    const r = ctx.Huella.verificarTransformacion(ctx.S, est => {
      PLANAS.forEach(k => { est[k] = est[k].filter(x => String(x.fecha).slice(0, 7) > corte); });
    }, { requeridas: BASE });
    const raices = new Set(r.diferencias.map(d => d.ruta.split('.')[0]));
    assert.ok(!raices.has('wrapped'), 'Wrapped intacto con un corte de política');
    assert.ok(raices.has('periodos'), 'los períodos podados sí cambian: por eso hace falta el resumen congelado antes de podar');
  });

  test('un corte que SÍ toca el año objetivo (2025) es detectado en Wrapped: la sonda protege justo lo que la pantalla puede mostrar', () => {
    const r = ctx.Huella.verificarTransformacion(ctx.S, est => {
      PLANAS.forEach(k => { est[k] = est[k].filter(x => String(x.fecha).slice(0, 4) >= '2026'); });
    }, { requeridas: BASE });
    assert.ok(r.diferencias.some(d => d.ruta.startsWith('wrapped.2025')));
  });

  test('calcular es PURO y determinista: no modifica S, restaura el S global y repetirlo da la misma huella', () => {
    const S0 = ctx.S;
    const otra = ctx.Huella.calcular(ctx.S, { requeridas: BASE });
    assert.equal(JSON.stringify(ctx.S), snapshot, 'S intacto');
    assert.equal(ctx.S, S0);
    assert.equal(ctx.Huella.digest(otra), ctx.Huella.digest(huella));
    assert.equal(ctx.Huella.comparar(huella, otra).ok, true);
    assert.equal(ctx.window._estadoAislado, undefined, 'la bandera de aislamiento no queda puesta');
  });

  test('sondas: lo que miden coincide con las reglas de cada módulo (libro, deudas, tarjetas, encargos, alcancía)', () => {
    const s = huella.sondas;
    assert.equal(s.saldos.libroOk, true);
    assert.equal(s.saldos.porCuenta['cuenta:nequi'].guardado, s.saldos.porCuenta['cuenta:nequi'].libro);
    assert.equal(s.deudas.entidades['favor:favorCerrada'].saldo, 0);
    assert.equal(s.deudas.entidades['favor:favorAbierta'].saldo, 100000);
    assert.equal(s.deudas.entidades['contra:contraAbierta'].saldo, 80000);
    assert.equal(s.tarjetas.entidades.tcCerrada.saldo, 0);
    assert.equal(s.tarjetas.entidades.tcAbierta.saldo, 2000000);
    assert.equal(s.tarjetas.entidades.tcAbierta.coherente, true);
    assert.equal(s.encargos.entidades.encCerrado.saldo, 0);
    assert.equal(s.encargos.entidades.encAbierto.saldo, 350000, 'saldo inicial + entradas − salidas');
    assert.equal(s.encargos.entidades.encAbierto.porCuenta['cuenta:nequi'], 350000);
    assert.equal(s.alcancia.entidades.alcancia.saldo, 70000);
    assert.equal(s.alcancia.ciclos[0].sumaMovimientos, 150000);
    assert.equal(s.patrimonio.total, ctx.calcPatrimonioDesglose().total, 'una sola definición de patrimonio');
  });

  test('sonda de tarjetas: detecta una deuda guardada desactualizada (coherente:false) sin corregirla', () => {
    const ctx2 = cargarApp(); generar(ctx2, { dias: 200 });
    ctx2.S.tarjetasCredito[1].deuda = 123; // guardada ≠ calculada
    const h = ctx2.Huella.calcular(ctx2.S, { solo: ['tarjetas'] });
    assert.equal(h.sondas.tarjetas.entidades.tcAbierta.coherente, false);
    assert.equal(ctx2.S.tarjetasCredito[1].deuda, 123, 'la sonda no escribe');
  });

  describe('comparar', () => {
    test('cualquier diferencia de saldo, mes o longitud se reporta con su ruta; la tolerancia deja pasar centavos', () => {
      const b = plano(huella);
      b.sondas.saldos.porCuenta['cuenta:nequi'].libro += 5;
      delete b.sondas.periodos['2024-03'];
      b.sondas.tarjetas.entidades.tcAbierta.saldo += 0.004;
      const r = ctx.Huella.comparar(huella, b);
      assert.equal(r.ok, false);
      const rutas = r.diferencias.map(d => d.ruta);
      assert.ok(rutas.includes('saldos.porCuenta.cuenta:nequi.libro'));
      assert.ok(rutas.some(x => x.startsWith('periodos.2024-03')));
      assert.ok(!rutas.includes('tarjetas.entidades.tcAbierta.saldo'), 'medio centavo está dentro de la tolerancia');
    });
    test('una sonda que lanza excepción o que no existe vuelve la comparación NO ok (nunca pasa en silencio)', () => {
      ctx.Huella.registrar('rota', () => { throw new Error('boom'); });
      const h = ctx.Huella.calcular(ctx.S, { solo: ['rota'] });
      assert.match(h.errores.rota, /boom/);
      assert.equal(ctx.Huella.comparar(h, h).ok, false);
      const sin = ctx.Huella.calcular(ctx.S, { solo: ['saldos'], requeridas: ['inexistente'] });
      assert.match(sin.errores.inexistente, /no registrada/);
      assert.equal(ctx.Huella.comparar(sin, sin).ok, false);
      ctx.Huella.registrar('rota', () => ({})); // deja el registro usable para el resto
    });
    test('un NaN no se confunde con 0', () => {
      const a = { sondas: { x: { v: NaN } }, errores: {} }, b = { sondas: { x: { v: 0 } }, errores: {} };
      ctx.Huella.registrar('nan', () => ({ v: NaN }));
      assert.equal(ctx.Huella.calcular(ctx.S, { solo: ['nan'] }).sondas.nan.v, 'NaN');
      assert.equal(ctx.Huella.comparar(a, b).ok, true, 'comparar solo ve los planos ya calculados; el NaN se normaliza al calcular');
    });
  });

  describe('conEstadoAislado', () => {
    test('el estado de la copia hace de S dentro y el real se restaura siempre, incluso si la función lanza', () => {
      const real = ctx.S, copia = plano(ctx.S);
      copia.gastosVar = [];
      const dentro = ctx.conEstadoAislado(copia, () => [ctx.S === copia, ctx.window.S === copia, ctx.window._estadoAislado, ctx.S.gastosVar.length]);
      assert.deepEqual(plano(dentro), [true, true, true, 0]);
      assert.throws(() => ctx.conEstadoAislado(copia, () => { throw new Error('x'); }), /x/);
      assert.equal(ctx.S, real);
      assert.equal(ctx.window.S, real);
      assert.equal(ctx.window._estadoAislado, undefined);
    });
    test('save() y _fbSaveToCloud no escriben nada mientras dura: un estado de prueba nunca llega a la nube', () => {
      let guardados = 0;
      ctx.window._fbSaveToCloud = () => { guardados++; return Promise.resolve({ ok: true }); };
      ctx.window._dataLoaded = true;
      const copia = plano(ctx.S);
      ctx.conEstadoAislado(copia, () => { ctx.save(); });
      assert.equal(guardados, 0);
      assert.equal(ctx.window._estadoAislado, undefined);
    });
    test('rechaza funciones asíncronas (su continuación correría con el S real) y entradas inválidas', () => {
      const lanza = (fn, re) => { let m = null; try { fn(); } catch (e) { m = String(e && e.message); } assert.match(m || '', re); }; // el Error nace en otro «realm» (vm): se compara el mensaje
      const real = ctx.S;
      lanza(() => ctx.conEstadoAislado(plano(ctx.S), async () => 1), /síncrona/);
      assert.equal(ctx.S, real, 'aunque rechace, el S real queda restaurado');
      assert.equal(ctx.window._estadoAislado, undefined);
      lanza(() => ctx.conEstadoAislado(null, () => 1), /estado/);
      lanza(() => ctx.conEstadoAislado({}, 'no'), /función/);
    });
  });

  describe('verificarTransformacion', () => {
    test('identidad: pasa y el estado original no se toca', () => {
      const r = ctx.Huella.verificarTransformacion(ctx.S, () => {}, { requeridas: BASE });
      assert.equal(r.ok, true, JSON.stringify(r.diferencias.slice(0, 3)));
      assert.equal(JSON.stringify(ctx.S), snapshot);
    });

    test('REFERENCIA SIN PÉRDIDA (archivo por año + hidratar): la huella completa queda igual — saldos, períodos, deudas, Wrapped', () => {
      const r = ctx.Huella.verificarTransformacion(ctx.S, est => {
        const arch = partirPorAnio(est, '2026');
        assert.ok(est.gastosVar.length < 3000 && Object.keys(arch).length === 2, 'de verdad se separó');
        hidratar(est, arch);
      }, { requeridas: BASE });
      assert.equal(r.ok, true, JSON.stringify(r.diferencias.slice(0, 3)));
    });

    test('PODA INGENUA (borrar lo anterior a 2026): la huella la DETECTA en períodos, Wrapped y libro — por eso no se poda sin resumen completo', () => {
      const r = ctx.Huella.verificarTransformacion(ctx.S, est => {
        PLANAS.forEach(k => { est[k] = est[k].filter(x => String(x.fecha).slice(0, 4) >= '2026'); });
      }, { requeridas: BASE });
      assert.equal(r.ok, false);
      const raices = new Set(r.diferencias.map(d => d.ruta.split('.')[0]));
      ['periodos', 'wrapped', 'saldos'].forEach(k => assert.ok(raices.has(k), 'debía detectar cambios en ' + k + ' → ' + [...raices]));
    });

    test('una transformación que descuadra el libro (borra una pata) se detecta en saldos', () => {
      const r = ctx.Huella.verificarTransformacion(ctx.S, est => { est.libro.pop(); }, { solo: ['saldos'] });
      assert.equal(r.ok, false);
      assert.ok(r.diferencias.some(d => d.ruta.startsWith('saldos')));
    });

    test('es repetible: aplicar la misma transformación dos veces no duplica ni cambia el resultado', () => {
      const t = est => { const a = partirPorAnio(est, '2026'); hidratar(est, a); };
      const r1 = ctx.Huella.verificarTransformacion(ctx.S, t, { requeridas: BASE });
      const r2 = ctx.Huella.verificarTransformacion(ctx.S, est => { t(est); t(est); }, { requeridas: BASE });
      assert.equal(r1.ok && r2.ok, true);
      assert.equal(ctx.Huella.digest(r1.despues), ctx.Huella.digest(r2.despues));
    });
  });

  test('un backup restaurado (JSON → estado nuevo en otra instancia de la app) tiene la MISMA huella: la huella es comparable entre sesiones', () => {
    const otra = cargarApp();
    Object.assign(otra.S, JSON.parse(snapshot)); // lo que hace importar un backup
    const h2 = otra.Huella.calcular(otra.S, { requeridas: BASE });
    const r = ctx.Huella.comparar(huella, plano(h2));
    assert.equal(r.ok, true, JSON.stringify(r.diferencias.slice(0, 3)));
    assert.equal(ctx.Huella.digest(huella), otra.Huella.digest(h2));
  });

  test('datos incompletos o antiguos: un estado casi vacío o con nulos no revienta (las sondas son tolerantes)', () => {
    const v = cargarApp();
    ['libro', 'movimientos', 'gastosVar', 'tarjetasCredito', 'encargos', 'deudores', 'misDeudas', 'cajitas'].forEach(k => { v.S[k] = []; });
    v.S.cuentas = [{ id: 'nequi', tipo: 'nequi', saldo: 0 }, { id: 'efectivo', tipo: 'efectivo', saldo: 0 }];
    v.S.alcancia = null;
    let h = v.Huella.calcular(v.S, { requeridas: BASE });
    assert.deepEqual(plano(h.errores), {}, JSON.stringify(h.errores));
    v.S.gastosVar = [{ id: 'x1', monto: 5, fecha: '2025-02-01', cat: null }, { id: 'x2', monto: 'abc', fecha: '2025-02-03' }];
    v.S.tarjetasCredito = [{ id: 'tcRara' }];
    v.S.encargos = [{ id: 'encRaro' }];
    h = v.Huella.calcular(v.S, { requeridas: BASE });
    assert.deepEqual(plano(h.errores), {}, JSON.stringify(h.errores));
    assert.equal(h.sondas.tarjetas.entidades.tcRara.saldo, 0);
    // Un registro nulo dentro de una lista (que la validación de carga ya descarta) NO lanza: la sonda lo reporta como error y la comparación falla.
    v.S.gastosVar = [null];
    h = v.Huella.calcular(v.S, { solo: ['periodos'] });
    assert.match(h.errores.periodos, /null/);
    assert.equal(v.Huella.comparar(h, h).ok, false);
  });

  test('ORDEN DE CARGA: huella.js se carga bajo demanda, DESPUÉS de los módulos; ninguna sonda se pierde (registrarSonda las deja en cola y huella.js las registra)', () => {
    const { loadApp } = require('./support/load-app');
    const path = require('node:path');
    const R = f => path.join(__dirname, '..', 'js', f);
    const base = ['core/core-state.js', 'core/cuenta-efectos.js', 'core/periodo.js', 'core/nu-calc.js', 'core/calc-helpers.js'];
    const modulos = ['core/split.js', 'core/diferencial.js', 'modules/tarjetas-credito.js', 'modules/encargos.js', 'modules/alcancia.js', 'modules/wrapped.js'];
    // 1) los módulos primero (como en la página: se precargan al arrancar), huella.js y cierre.js al final (grupo 'cierre')
    const v = loadApp(base.concat(modulos, ['core/huella.js', 'core/cierre.js']).map(R), { permissive: true });
    assert.deepEqual(plano(v.window._sondasPendientes), [], 'la cola quedó vacía al cargar huella.js');
    BASE.forEach(n => assert.ok(v.Huella.registradas().includes(n), 'falta la sonda ' + n + ' (se perdió al llegar huella.js después)'));
    // 2) y las sondas que llegaron por la cola funcionan igual que las registradas directamente
    generar(v, { dias: 120 });
    const h = v.Huella.calcular(v.S, { requeridas: BASE });
    assert.deepEqual(plano(h.errores), {});
    assert.equal(Object.keys(h.sondas).length, BASE.length);
    // 3) antes de que exista huella.js, registrarSonda deja la sonda en cola (no revienta ni la pierde)
    const antes = loadApp(base.concat(['modules/tarjetas-credito.js']).map(R), { permissive: true });
    assert.ok(plano(antes.window._sondasPendientes).length === 1, 'tarjetas dejó su sonda en cola');
    // 4) después de existir, registrarSonda registra directo
    v.registrarSonda('prueba-directa', () => ({ ok: 1 }));
    assert.ok(v.Huella.registradas().includes('prueba-directa'));
  });

  test('completa() carga por nombre los 4 grupos con sonda y NO depende de Loader.ensureAll (que se salta «wrapped» fuera de su ventana)', async () => {
    const v = cargarApp(); generar(v, { dias: 60 });
    const pedidos = [];
    v.Loader = { ensure: g => { pedidos.push(g); return Promise.resolve(); }, ensureAll: () => { throw new Error('no debe usarse'); } };
    const h = await v.Huella.completa(v.S);
    assert.deepEqual(pedidos.sort(), ['alcancia', 'encargos', 'tarjetas', 'wrapped']);
    assert.deepEqual(plano(v.Huella.GRUPOS_CON_SONDA).sort(), pedidos);
    assert.deepEqual(plano(h.errores), {});
  });

  test('completa() exige las 8 sondas: sin los módulos cargados, el resultado trae errores (un módulo ausente no hace pasar la verificación)', async () => {
    const { loadApp } = require('./support/load-app');
    const path = require('node:path');
    const R = f => path.join(__dirname, '..', 'js', 'core', f);
    const solo = loadApp(['core-state.js', 'cuenta-efectos.js', 'periodo.js', 'nu-calc.js', 'calc-helpers.js', 'huella.js'].map(R), { permissive: true });
    const h = await solo.Huella.completa(solo.S);
    ['tarjetas', 'encargos', 'alcancia', 'wrapped'].forEach(n => assert.match(h.errores[n], /no registrada/));
    assert.equal(solo.Huella.comparar(h, h).ok, false);
  });
});
});

_describe('cierre', () => {
// tests/cierre.test.js — cierre de períodos, etapa 1 (js/core/cierre.js): vista previa de SOLO LECTURA, grafo de enlaces por valor,
// entidades, clasificación de las claves de S y medidor de tamaño con proyección. Diseño: docs/cierre-de-periodos.md.
// Corre con:  node --test tests/cierre.test.js   (o todo: npm test)
const { describe, test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { cargarApp, generar } = require('./support/datos-sinteticos');

const plano = x => JSON.parse(JSON.stringify(x));
const RAIZ = path.join(__dirname, '..');
const MES_ACTUAL = '2026-10';
const CORTE = '2025-12';

function lanza(fn, re) { let m = null; try { fn(); } catch (e) { m = String(e && e.message); } assert.match(m || '', re); } // el Error nace en otro «realm» (vm)

describe('cierre — vista previa (analizar)', () => {
  let ctx, snapshot, huella, informe;
  before(() => {
    ctx = cargarApp();
    generar(ctx);
    snapshot = JSON.stringify(ctx.S);
    huella = ctx.Huella.calcular(ctx.S, { requeridas: ctx.Huella.SONDAS_BASE });
    informe = ctx.Cierre.analizar(CORTE, ctx.S, { huella, mesActual: MES_ACTUAL });
  });
  const analizar = (corte, estado, extra) => ctx.Cierre.analizar(corte, estado || ctx.S, Object.assign({ mesActual: MES_ACTUAL }, extra));

  test('NO modifica nada: S igual byte a byte, S global restaurado y repetirlo da el mismo informe', () => {
    const real = ctx.S;
    const otra = analizar(CORTE, ctx.S, { huella });
    assert.equal(JSON.stringify(ctx.S), snapshot);
    assert.equal(ctx.S, real);
    assert.deepEqual(plano(otra), plano(informe));
  });

  test('cuentas cuadran: archivables ⊆ candidatos ⊆ total, por fuente suman el total y bloqueados = candidatos − archivables', () => {
    const { total, candidatos, archivables, bloqueados, porFuente } = informe;
    assert.ok(archivables.registros <= candidatos.registros && candidatos.registros <= total.registros);
    assert.equal(bloqueados.registros, candidatos.registros - archivables.registros);
    assert.equal(Object.values(porFuente).reduce((a, f) => a + f.total.registros, 0), total.registros);
    assert.equal(Object.values(porFuente).reduce((a, f) => a + f.archivables.registros, 0), archivables.registros);
    assert.equal(Object.values(bloqueados.porMotivo).reduce((a, n) => a + n, 0), bloqueados.registros);
    assert.ok(archivables.bytes > 0 && archivables.unidades > 0 && informe.completo === true);
    assert.equal(informe.huella, ctx.Huella.digest(huella), 'el informe lleva la huella de ANTES, para compararla con la de después');
  });

  test('entidades: cerradas solo con saldo 0 y toda su historia anterior al corte; abiertas con su motivo', () => {
    const e = id => informe.entidades.find(x => x.id === id);
    ['tcCerrada', 'favor:favorCerrada', 'encCerrado'].forEach(id => assert.equal(e(id).estado, 'cerrada', id));
    ['tcAbierta', 'favor:favorAbierta', 'contra:contraAbierta', 'encAbierto', 'alcancia'].forEach(id => { assert.equal(e(id).estado, 'abierta', id); assert.equal(e(id).motivo, 'saldo-pendiente', id); });
    assert.equal(e('tcAbierta').saldo, 2000000, 'el saldo sale de la sonda de la huella (una sola fuente)');
  });

  test('los registros de una entidad abierta NO son archivables aunque sean anteriores al corte', () => {
    const bloq = informe.bloqueados.detalle.filter(d => d.motivo.startsWith('entidad-abierta'));
    assert.ok(bloq.length > 0);
    assert.ok(bloq.every(d => d.fecha <= CORTE + '-31'));
    assert.equal(informe.porFuente.tarjetas.candidatos.registros - informe.porFuente.tarjetas.archivables.registros, 2, 'las 2 compras de tcAbierta anteriores al corte quedan');
  });

  test('transferencia con una pata a cada lado del corte: TODA la unidad queda retenida (espejos, fila de transferencias y patas del libro)', () => {
    const v = cargarApp(); generar(v, { dias: 900 });
    const tr = v.S.transferencias.find(t => t.fecha === '2025-12-31');
    assert.ok(tr, 'hay una transferencia el último día del corte');
    v.S.libro.find(l => l.origen.ref === tr.id && l.monto > 0).fecha = '2026-01-02'; // una pata cae después del corte
    const r = v.Cierre.analizar(CORTE, v.S, { mesActual: MES_ACTUAL });
    const antes = informe.archivables.registros;
    assert.ok(r.archivables.registros < antes, 'ya no son archivables');
    assert.equal(antes - r.archivables.registros, 5, 'la fila + 2 espejos + 2 patas = 5 registros que viajan juntos');
    assert.ok((r.bloqueados.porMotivo['enlazado-con-registro-bloqueado-o-posterior'] || 0) >= 4);
  });

  test('reversión partida por el corte: el original (≤ corte) y su reversión (fecha posterior, mismo ref) no se separan', () => {
    const v = cargarApp(); generar(v, { dias: 900 });
    const g = v.S.gastosVar.find(x => x.fecha === '2025-11-10');
    v.Libro.conOrigen({ modulo: 'gastos', ref: g.id, rev: true }, () => v.sumarFuente(g.fuente, g.monto, { fecha: '2026-02-01' }));
    assert.equal(v.S.libro[v.S.libro.length - 1].tipo, 'reversion');
    const r = v.Cierre.analizar(CORTE, v.S, { mesActual: MES_ACTUAL });
    assert.equal(informe.archivables.registros - r.archivables.registros, 2, 'el gasto y su pata original quedan retenidos junto a la reversión');
    assert.equal(v.Libro.verificar(v.S).ok, true);
  });

  test('un registro SIN fecha o con fecha inválida bloquea toda su unidad y se informa como «sin-fecha»', () => {
    const v = cargarApp(); generar(v, { dias: 900 });
    const g = v.S.gastosVar.find(x => x.fecha === '2025-03-03');
    delete g.fecha;
    const r = v.Cierre.analizar(CORTE, v.S, { mesActual: MES_ACTUAL });
    assert.equal(r.bloqueados.porMotivo['sin-fecha'], 1);
    assert.ok(r.bloqueados.porMotivo['enlazado-con-registro-bloqueado-o-posterior'] >= 1, 'su pata del libro viaja con él');
  });

  test('una entidad SIN sonda (Spotify) se informa y no se cierra: es conservador y se enciende al registrar su sonda', () => {
    const v = cargarApp(); generar(v, { dias: 900 });
    v.S.spotify = { historial: [{ id: 'sp0001', tipo: 'cobro', monto: 10000, fecha: '2024-05-05' }] };
    const r = v.Cierre.analizar(CORTE, v.S, { mesActual: MES_ACTUAL });
    assert.equal(r.bloqueados.porMotivo['entidad-abierta:sin-sonda'], 1);
    assert.equal(r.entidades.find(x => x.id === 'spotify').estado, 'abierta');
  });

  test('una entidad con historia posterior al corte no se cierra aunque su saldo sea 0 («registros-posteriores»)', () => {
    const v = cargarApp(); generar(v, { dias: 900 });
    const enc = v.S.encargos.find(x => x.id === 'encCerrado');
    enc.movimientos.push({ id: 'z00001', tipo: 'entrada', monto: 10, fecha: '2026-05-05', cuenta: 'efectivo' }, { id: 'z00002', tipo: 'salida', monto: 10, fecha: '2026-05-06', cuenta: 'efectivo' });
    const r = v.Cierre.analizar(CORTE, v.S, { mesActual: MES_ACTUAL });
    assert.equal(r.entidades.find(x => x.id === 'encCerrado').motivo, 'registros-posteriores');
    assert.equal(r.porFuente.encargos.archivables.registros, informe.porFuente.encargos.archivables.registros - 2);
  });

  test('enlace por VALOR: un campo de enlace que ninguna lista conoce (inventado ahora) también une registros', () => {
    const v = cargarApp(); generar(v, { dias: 900 });
    const a = v.S.gastosVar.find(x => x.fecha === '2025-02-02'), b = v.S.gastosVar.find(x => x.fecha === '2026-03-03');
    b.campoNuncaVisto = { otro: [a.id] }; // un registro posterior apunta (en un campo anidado) a uno anterior
    const r = v.Cierre.analizar(CORTE, v.S, { mesActual: MES_ACTUAL });
    assert.equal(informe.archivables.registros - r.archivables.registros, 2, 'a + su pata del libro quedan retenidos');
  });

  test('copias (alcancía): un depósito activo que comparte id con la copia de un ciclo destapado retiene también al ciclo', () => {
    const v = cargarApp(); generar(v, { dias: 900 });
    const copia = v.S.alcancia.historial[0].movimientos[0];
    v.S.alcancia.movimientos.push(Object.assign({}, copia)); // el mismo depósito sigue en la lista activa
    const r = v.Cierre.analizar(CORTE, v.S, { mesActual: MES_ACTUAL });
    assert.equal(r.porFuente.alcancia.archivables.registros, 0);
    assert.equal(informe.porFuente.alcancia.archivables.registros, 1, 'sin la copia, el ciclo cerrado sí es archivable');
  });

  test('validaciones: el corte debe ser AAAA-MM y un mes ya terminado', () => {
    lanza(() => analizar('2025-13'), /AAAA-MM/);
    lanza(() => analizar('25-12'), /AAAA-MM/);
    lanza(() => analizar(MES_ACTUAL), /terminado/);
    lanza(() => analizar('2027-01'), /terminado/);
    assert.equal(analizar('2024-12', ctx.S, { huella }).corte, '2024-12');
  });

  test('sin huella completa el informe lo dice (completo:false) y las entidades quedan abiertas por «sin-sonda»', () => {
    const parcial = ctx.Huella.calcular(ctx.S, { solo: ['saldos', 'periodos'] });
    const r = analizar(CORTE, ctx.S, { huella: parcial });
    assert.equal(r.completo, false);
    assert.equal(r.entidades.filter(e => e.estado === 'cerrada').length, 0);
    assert.equal(r.archivables.registros < informe.archivables.registros, true);
  });

  test('datos antiguos o incompletos: estado casi vacío, listas ausentes y registros raros no rompen el análisis', () => {
    const v = cargarApp();
    v.S.cuentas = [{ id: 'nequi', tipo: 'nequi', saldo: 0 }, { id: 'efectivo', tipo: 'efectivo', saldo: 0 }];
    const vacio = v.Cierre.analizar('2024-01', v.S, { mesActual: MES_ACTUAL, huella: { sondas: {}, errores: {} } });
    assert.equal(vacio.total.registros, 0);
    v.S.gastosVar = [{ id: 'g00001', monto: 5, fecha: '2023-01-05' }];
    v.S.deudores = [{ id: 'd1', movimientos: null }];
    v.S.tarjetasCredito = [{ id: 'tc1' }];
    v.S.mesadas = { padre: { pagos: { '2023-0': { monto: 1 }, raro: 3 } } };
    const r = v.Cierre.analizar('2024-01', v.S, { mesActual: MES_ACTUAL });
    assert.equal(r.total.registros >= 1, true);
  });

  test('corteMasReciente: último mes completo con ≥ 24 meses de antigüedad', () => {
    assert.equal(ctx.Cierre.corteMasReciente('2026-10-29'), '2024-09');
    assert.equal(ctx.Cierre.corteMasReciente('2028-10-18'), '2026-09');
  });

  test('AVISO DEL WRAPPED: un año sin su Wrapped guardado se AVISA (no bloquea) — el informe lista los años con Wrapped y cuáles no están guardados', () => {
    assert.deepEqual(plano(informe.wrapped.conWrapped), ['2024', '2025']);
    assert.deepEqual(plano(informe.wrapped.sinGuardar), ['2024', '2025']);
    assert.ok(informe.advertencias.includes('wrapped-sin-guardar'));
    assert.ok(informe.archivables.registros > 0, 'y el análisis sigue dando archivables: es un aviso, no un bloqueo');
    const v = cargarApp(); generar(v, { dias: 900 });
    v.S.wrappedAnios = { 2024: { version: 1, slides: [] }, 2025: { version: 1, slides: [] } };
    const r = v.Cierre.analizar(CORTE, v.S, { mesActual: MES_ACTUAL });
    assert.deepEqual(plano(r.wrapped.sinGuardar), [], 'con ambos guardados ya no hay nada que avisar');
    assert.ok(!r.advertencias.includes('wrapped-sin-guardar'));
    const parcial = cargarApp(); generar(parcial, { dias: 900 });
    parcial.S.wrappedAnios = { 2024: { version: 1, slides: [] } };
    assert.deepEqual(plano(parcial.Cierre.analizar(CORTE, parcial.S, { mesActual: MES_ACTUAL }).wrapped.sinGuardar), ['2025']);
  });

  test('un año SIN datos suficientes no tendría Wrapped (solo el mensaje, que no se guarda): no se avisa de él', () => {
    const v = cargarApp(); generar(v, { dias: 900 });
    v.window._wrappedDatosAnio = a => ({ tier: a === '2024' ? 'suficiente' : 'poco' }); // el criterio real vive en wrapped-gate.js (probado en wrapped-guardado.test.js)
    const r = v.Cierre.analizar(CORTE, v.S, { mesActual: MES_ACTUAL });
    assert.deepEqual(plano(r.wrapped.conWrapped), ['2024']);
    assert.deepEqual(plano(r.wrapped.sinGuardar), ['2024']);
  });

  test('el año en curso no cuenta (todavía no se puede generar) y un corte anterior solo considera los años que toca', () => {
    const r = analizar('2024-09', ctx.S, { huella });
    assert.deepEqual(plano(r.wrapped.conWrapped), ['2024']);
    assert.ok(!r.wrapped.conWrapped.includes('2026'));
  });

  test('corteMasReciente es EXACTO en ~2.600 fechas: nunca menos de 24 meses, siempre el más reciente posible y nunca llega al año anterior al actual', () => {
    const finMes = ym => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
    const sig = ym => { let [y, m] = ym.split('-').map(Number); m++; if (m > 12) { m = 1; y++; } return y + '-' + String(m).padStart(2, '0'); };
    const menos24 = h => { const [y, m, d] = h.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1 - 24 + 1, 0)).getUTCDate(); return new Date(Date.UTC(y, m - 1 - 24, Math.min(d, t))).toISOString().slice(0, 10); };
    const malos = [];
    for (const d = new Date('2026-10-18T12:00:00Z'); d < new Date('2034-01-01T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
      const h = d.toISOString().slice(0, 10), co = ctx.Cierre.corteMasReciente(h), lim = menos24(h);
      if (finMes(co) > lim) malos.push(h + ' <24 meses');
      if (finMes(sig(co)) <= lim) malos.push(h + ' no es el más reciente');
      if (co > (Number(h.slice(0, 4)) - 2) + '-12') malos.push(h + ' llega al año anterior');
    }
    assert.deepEqual(malos, []);
    assert.equal(ctx.Cierre.corteMasReciente('2027-03-30'), '2025-02', 'caso que desbordaba el día con Date.setMonth (30-mar − 25 meses = «feb 30»)');
    assert.equal(ctx.Cierre.corteMasReciente('2026-10-31'), '2024-10', 'el último día del mes sí completa el mes de hace 24 meses');
  });

  describe('componentes (diagnóstico del grafo de enlaces)', () => {
    test('en datos normales las unidades atómicas son pequeñas (un gasto + su pata = 2, una transferencia = 5) y no hay advertencias', () => {
      assert.ok(informe.componentes.maxRegistros <= 10, 'máximo ' + informe.componentes.maxRegistros);
      assert.ok(!informe.advertencias.includes('componente-grande'));
      assert.ok(informe.componentes.total > 3000);
      assert.equal(informe.componentes.mayores.length, 3);
    });

    test('con ids de formato REAL (uid(): Date.now en base 36 + 3 caracteres al azar) las unidades siguen siendo pequeñas: el enlace por valor no fusiona registros ajenos', () => {
      const v = cargarApp();
      let i = 0; const sufijo = n => (Math.imul(n, 2654435761) >>> 0).toString(36).slice(-3).padStart(3, 'k'); // determinista: 3 caracteres «al azar» como uid()
      v.uid = () => (1790000000000 + 7 * (++i)).toString(36) + sufijo(i);
      generar(v, { dias: 900 });
      assert.ok(v.S.gastosVar[0].id.length >= 10 && !/^x\d+$/.test(v.S.gastosVar[0].id), 'ids con formato real: ' + v.S.gastosVar[0].id);
      const r = v.Cierre.analizar(CORTE, v.S, { mesActual: MES_ACTUAL });
      assert.ok(r.componentes.maxRegistros <= 10, 'máximo ' + r.componentes.maxRegistros);
      assert.ok(!r.advertencias.includes('componente-grande'));
      assert.equal(r.archivables.registros > r.candidatos.registros * 0.9, true);
    });

    test('compartir un texto largo NO enlaza: solo une un campo cuyo valor es EXACTAMENTE el id de otro registro (300 gastos con la misma descripción siguen siendo 300 unidades)', () => {
      const v = cargarApp(); generar(v, { dias: 900 });
      v.S.gastosVar.slice(0, 300).forEach(g => { g.desc = 'Mercado semanal de la plaza'; g.nota = 'ref x00001 dentro de un texto'; });
      const r = v.Cierre.analizar(CORTE, v.S, { mesActual: MES_ACTUAL });
      assert.ok(r.componentes.maxRegistros <= 10, 'máximo ' + r.componentes.maxRegistros);
      assert.ok(!r.advertencias.includes('componente-grande'));
    });

    test('un enlace FALSO real (300 gastos cuyo campo vale exactamente el id de otro registro) forma una componente enorme: se reporta con advertencia', () => {
      const v = cargarApp(); generar(v, { dias: 900 });
      const ancla = v.S.gastosVar[0].id;
      v.S.gastosVar.slice(1, 301).forEach(g => { g.campoRaro = ancla; });
      const r = v.Cierre.analizar(CORTE, v.S, { mesActual: MES_ACTUAL });
      assert.ok(r.componentes.maxRegistros >= 300);
      assert.ok(r.advertencias.includes('componente-grande'));
      assert.ok(r.componentes.mayores[0].fuentes.gastosVar >= 300);
    });
  });
});

describe('cierre — clasificación de las claves de S', () => {
  const ctx = cargarApp();
  const CLASES = new Set(['historica', 'entidad-con-historia', 'derivada', 'congelada', 'estado-actual', 'configuracion', 'meta']);

  function clavesUsadasEnElCodigo() {
    const usadas = new Set();
    const rec = dir => fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return rec(p);
      if (!p.endsWith('.js')) return;
      const t = fs.readFileSync(p, 'utf8');
      for (const m of t.matchAll(/(?<![\w.$])(?:window\.)?S\.([A-Za-z_]\w*)/g)) usadas.add(m[1]);
    });
    rec(path.join(RAIZ, 'js'));
    return usadas;
  }

  test('TODA clave de primer nivel de S (la inicial y las que el código toca) está clasificada: una colección nueva no pasa desapercibida', () => {
    const conocidas = ctx.Cierre.CLASIFICACION;
    Object.values(conocidas).forEach(c => assert.ok(CLASES.has(c), 'clase desconocida ' + c));
    const sinClasificar = [...clavesUsadasEnElCodigo(), ...Object.keys(ctx.S)].filter(k => !(k in conocidas));
    assert.deepEqual([...new Set(sinClasificar)].sort(), [], 'Clasifica estas claves en Cierre.CLASIFICACION (js/core/cierre.js) y, si guardan registros con fecha, descríbelas con Cierre.registrarFuente');
  });

  test('toda clave «historica» o «entidad-con-historia» está cubierta por alguna fuente descrita (nada con historia queda fuera del análisis)', () => {
    const cubiertas = new Set(ctx.Cierre.fuentes().flatMap(f => f.raiz));
    const faltan = Object.entries(ctx.Cierre.CLASIFICACION).filter(([, c]) => c === 'historica' || c === 'entidad-con-historia').map(([k]) => k).filter(k => !cubiertas.has(k));
    assert.deepEqual(faltan, []);
  });

  test('toda fuente con sonda apunta a una sonda que existe (la sonda da el saldo de sus entidades)', () => {
    ctx.Cierre.fuentes().filter(f => f.sonda).forEach(f => assert.ok(ctx.Huella.registradas().includes(f.sonda), f.clave + ' → ' + f.sonda));
  });
});

describe('cierre — tamaño y proyección', () => {
  let ctx;
  before(() => { ctx = cargarApp(); generar(ctx); });
  const gz = async txt => zlib.gzipSync(txt).toString('base64').length + 4; // misma forma que el códec real: gzip + base64 + prefijo
  const HOY = '2026-10-29';

  test('bruto = largo del JSON; por clave ordenado de mayor a menor; el comprimido es mucho menor', async () => {
    const t = await ctx.Cierre.tamano(ctx.S, { hoy: HOY, comprimir: gz });
    assert.equal(t.bruto, JSON.stringify(ctx.S).length);
    const b = t.porClave.map(x => x.bytes);
    assert.deepEqual(b.slice().sort((x, y) => y - x), b);
    assert.ok(t.comprimido < t.bruto / 3 && t.comprimidoEstimado === false);
    assert.ok(t.porcentajeDelLimite > 0 && t.porcentajeDelLimite < 100);
    assert.equal(t.antiguedad.masAntigua, '2024-01-01');
  });

  test('con el MISMO códec que usa el guardado (js/core/payload-codec.js) el tamaño medido es el real', async () => {
    // import() de ESM exige una URL file:// (en Windows una ruta suelta «C:\\…» da ERR_UNSUPPORTED_ESM_URL_SCHEME).
    const codec = await import(require('node:url').pathToFileURL(path.join(RAIZ, 'js', 'core', 'payload-codec.js')).href);
    const real = (await codec.codificarPayload(JSON.stringify(ctx.S))).length;
    const t = await ctx.Cierre.tamano(ctx.S, { hoy: HOY, comprimir: async txt => (await codec.codificarPayload(txt)).length });
    assert.equal(t.comprimido, real);
  });

  test('proyección: con 2,7 años de datos a ~11 registros/día queda lejos del aviso (años de margen) y las fechas son coherentes', async () => {
    const t = await ctx.Cierre.tamano(ctx.S, { hoy: HOY, comprimir: gz });
    const p = t.proyeccion;
    assert.ok(p.diasHastaAviso > 365 * 3, 'más de 3 años hasta el aviso: ' + p.diasHastaAviso);
    assert.ok(p.diasHastaLimite > p.diasHastaAviso);
    assert.ok(p.fechaAviso > HOY && p.fechaLimite > p.fechaAviso);
    assert.equal(p.confianza, 'media');
    assert.equal(ctx.Cierre.disparador(t).recomendado, false);
  });

  test('con poca historia la confianza es baja, y sin historia no hay proyección (sin divisiones por cero)', async () => {
    const poco = cargarApp(); generar(poco, { desde: '2026-10-01', dias: 20 });
    Object.assign(poco.S, { encargos: [], deudores: [], misDeudas: [], alcancia: null, tarjetasCredito: [] }); // el generador siembra entidades de 2024/2025
    assert.equal((await poco.Cierre.tamano(poco.S, { hoy: '2026-10-21', comprimir: gz })).proyeccion.confianza, 'baja');
    const vacio = cargarApp(); vacio.S.cuentas = [];
    const t = await vacio.Cierre.tamano(vacio.S, { hoy: HOY, comprimir: gz });
    assert.equal(t.proyeccion.diasHastaAviso, null);
    assert.equal(t.antiguedad.dias, 0);
  });

  test('sin códec disponible el tamaño se estima y se marca como estimado', async () => {
    const t = await ctx.Cierre.tamano(ctx.S, { hoy: HOY, comprimir: async () => { throw new Error('sin CompressionStream'); } });
    assert.equal(t.comprimidoEstimado, true);
    assert.equal(t.comprimido, Math.round(t.bruto * 0.14));
  });

  test('disparador acordado: solo el comprimido sobre 500 KB recomienda la etapa siguiente; ≥ 2 años de datos es un aviso, no un disparo', () => {
    const base = { comprimido: 100000, antiguedad: { dias: 100 } };
    assert.equal(ctx.Cierre.disparador(base).recomendado, false);
    assert.equal(ctx.Cierre.disparador(Object.assign({}, base, { comprimido: 500001 })).recomendado, true);
    const viejo = ctx.Cierre.disparador(Object.assign({}, base, { antiguedad: { dias: 800 } }));
    assert.equal(viejo.recomendado, false);
    assert.equal(viejo.avisos.length, 1);
    assert.match(viejo.avisos[0], /paginarlas/, 'la lentitud de las listas se arregla paginando, no cerrando períodos');
  });

  test('los umbrales de aviso y límite coinciden con los de firebase-sync.js (una sola cifra, vigilada)', () => {
    const src = fs.readFileSync(path.join(RAIZ, 'js', 'core', 'firebase-sync.js'), 'utf8');
    const m = /PAYLOAD_AVISO_BYTES = (\d+), PAYLOAD_LIMITE_BYTES = (\d+)/.exec(src);
    assert.ok(m);
    assert.deepEqual([ctx.Cierre.LIMITES.aviso, ctx.Cierre.LIMITES.limite], [Number(m[1]), Number(m[2])]);
  });
});

describe('cierre — medidor en Configuración (renderTamanoDatos)', () => {
  const { loadApp } = require('./support/load-app');
  const R = f => path.join(RAIZ, 'js', f);
  function pantalla() {
    const ctx = loadApp(['core/core-state.js', 'core/cuenta-efectos.js', 'core/periodo.js', 'core/nu-calc.js', 'core/calc-helpers.js', 'core/html-tag.js', 'core/huella.js', 'core/cierre.js', 'modules/tarjetas-credito.js', 'modules/configuracion.js'].map(R), { permissive: true });
    let n = 0; ctx.uid = () => 'y' + String(++n).padStart(5, '0');
    const el = { innerHTML: '' }, otros = ctx.document.getElementById;
    ctx.document.getElementById = id => (id === 'cfg-tamano' ? el : otros(id));
    return { ctx, el };
  }

  test('pinta cifra, barra (<progress>, sin estilos inline), proyección y se puede leer sin tocar los datos', async () => {
    const { ctx, el } = pantalla();
    generar(ctx);
    const antes = JSON.stringify(ctx.S);
    await ctx.renderTamanoDatos();
    const h = String(el.innerHTML);
    assert.match(h, /Tamaño de tus datos/);
    assert.match(h, /<progress class="cfg-tamano-barra"/);
    assert.match(h, /KB de 1\.000 KB/);
    assert.match(h, /llegarías al aviso de tamaño hacia/);
    assert.doesNotMatch(h, /style=/);
    assert.doesNotMatch(h, /conviene empezar a archivar/, 'con 2,7 años a este ritmo aún no toca archivar');
    assert.equal(JSON.stringify(ctx.S), antes, 'solo lectura');
  });

  test('cuando el tamaño pasa del disparador avisa que conviene archivar; si la medición falla, deja el espacio vacío (no rompe la pantalla)', async () => {
    const { ctx, el } = pantalla();
    ctx.Cierre.tamano = async () => ({ comprimido: 650000, comprimidoEstimado: false, limites: { aviso: 800000, limite: 1000000 }, porcentajeDelLimite: 65, antiguedad: { dias: 900 }, proyeccion: { diasHastaAviso: 400, fechaAviso: '2027-12-01', confianza: 'media' } });
    await ctx.renderTamanoDatos();
    assert.match(String(el.innerHTML), /es momento de revisar el cierre de períodos/);
    assert.match(String(el.innerHTML), /datos de más de 2 años/);
    ctx.Cierre.tamano = async () => { throw new Error('boom'); };
    const aviso = console.warn; console.warn = () => {};
    try { await ctx.renderTamanoDatos(); } finally { console.warn = aviso; }
    assert.equal(el.innerHTML, '');
  });
});
});

_describe('wrapped-guardado', () => {
// tests/wrapped-guardado.test.js — Wrapped cuando «no alcanzó el tiempo» (datos insuficientes) y Wrapped guardado por año.
//   · criterio de datos suficientes (js/core/wrapped-gate.js, `_wrappedDatosAnio`): 'nada' / 'poco' / 'suficiente';
//   · banco de frases y diapositivas de «no alcanzó el tiempo» (js/modules/wrapped.js);
//   · instantáneas (`S.wrappedAnios`): qué se guarda, qué NO se congela (el desenfoque de saldos), peso;
//   · contrato de CSS: el HTML guardado usa clases que no pueden desaparecer (tests/fixtures/wrapped-clases.json).
// El recorrido completo en una página real (abrir, guardar, reabrir, ocultar saldos, «Mis Wrapped») está en scripts/smoke-wrapped.js
// (necesita jsdom, como scripts/smoke-browser.js). Corre con:  node --test tests/wrapped-guardado.test.js
const { describe, test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { cargarApp, generar } = require('./support/datos-sinteticos');

const RAIZ = path.join(__dirname, '..');
const plano = x => JSON.parse(JSON.stringify(x));
const fmt = v => '$' + Math.round(v).toLocaleString('es-CO');
const nueva = () => cargarApp(['core/wrapped-gate.js']);
const gasto = (i, fecha) => ({ id: 'g' + String(i).padStart(5, '0'), desc: 'x', monto: 1000, fecha, cat: 'Otro', fuente: 'nequi', clase: 'gasto' });
const dia = (anio, mes, d) => `${anio}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

describe('wrapped — ¿hay datos suficientes? (wrapped-gate.js)', () => {
  test('sin ningún registro del año → «nada»; las transferencias y los movimientos neutros NO cuentan como actividad', () => {
    const c = nueva();
    c.S.cuentas = [{ id: 'nequi', tipo: 'nequi', saldo: 0 }, { id: 'efectivo', tipo: 'efectivo', saldo: 0 }];
    assert.equal(c.window._wrappedDatosAnio('2025', c.S).tier, 'nada');
    for (let i = 0; i < 100; i++) c.S.movimientos.push({ id: 'm' + String(i).padStart(5, '0'), tipo: 'salida', fuente: 'nequi', monto: 5, fecha: dia(2025, 1 + (i % 12), 1 + (i % 28)), clase: 'neutro', desc: 'Transferencia' });
    const d = c.window._wrappedDatosAnio('2025', c.S);
    assert.equal(d.tier, 'nada');
    assert.equal(d.registros, 0);
  });

  test('límites exactos: 29 días en 3 meses es «poco»; 30 días en 3 meses es «suficiente»; 30 días en solo 2 meses es «poco»', () => {
    const c = nueva();
    const U = c.window._wrappedUmbrales;
    assert.deepEqual(plano(U), { dias: 30, meses: 3 });
    const con = (n, meses) => { // n días distintos repartidos en `meses` meses de 2025
      c.S.gastosVar = [];
      for (let i = 0; i < n; i++) c.S.gastosVar.push(gasto(i + 1, dia(2025, 10 + (i % meses), 1 + Math.floor(i / meses))));
      return c.window._wrappedDatosAnio('2025', c.S);
    };
    let d = con(29, 3); assert.deepEqual([d.dias, d.meses, d.tier], [29, 3, 'poco']);
    d = con(30, 3); assert.deepEqual([d.dias, d.meses, d.tier], [30, 3, 'suficiente']);
    d = con(60, 2); assert.deepEqual([d.dias, d.meses, d.tier], [60, 2, 'poco'], 'muchos días pero solo 2 meses');
    d = con(30, 3); assert.equal(d.primera, '2025-10-01');
  });

  test('varios registros el mismo día cuentan como UN día; los pagos de gastos fijos y los ingresos reales también cuentan', () => {
    const c = nueva();
    for (let i = 0; i < 50; i++) c.S.gastosVar.push(gasto(i + 1, '2025-03-10')); // 50 gastos, un solo día
    let d = c.window._wrappedDatosAnio('2025', c.S);
    assert.deepEqual([d.registros, d.dias], [50, 1]);
    c.S.pagosGastosFijos = { 'gfRenta_2025-04': { fecha: '2025-04-05', fuente: 'nequi', monto: 600000, cat: 'Hogar', nombre: 'Arriendo' } };
    c.S.gastosFijos = [{ id: 'gfRenta', nombre: 'Arriendo', monto: 600000, cat: 'Hogar', dia: 5 }];
    c.S.movimientos.push({ id: 'i00001', tipo: 'entrada', fuente: 'nequi', monto: 3000000, fecha: '2025-05-01', desc: 'Sueldo', clase: 'ingreso' });
    d = c.window._wrappedDatosAnio('2025', c.S);
    assert.equal(d.meses, 3, 'marzo + abril (pago fijo) + mayo (ingreso)');
    assert.ok(d.dias >= 3);
  });

  test('una historia larga (2,7 años sintéticos) es «suficiente» en cada año; el primer tramo (oct–dic 2026, ~74 días de la app) también', () => {
    const c = nueva(); generar(c);
    ['2024', '2025'].forEach(a => assert.equal(c.window._wrappedDatosAnio(a, c.S).tier, 'suficiente', a));
    const c2 = nueva(); generar(c2, { desde: '2026-10-18', dias: 74 });
    const d = c2.window._wrappedDatosAnio('2026', c2.S);
    assert.deepEqual([d.tier, d.meses], ['suficiente', 3], 'si de verdad se usa la app desde el 18-oct, 2026 alcanza');
    const c3 = nueva(); generar(c3, { desde: '2026-12-10', dias: 22 });
    assert.equal(c3.window._wrappedDatosAnio('2026', c3.S).tier, 'poco', 'tres semanas de uso no alcanzan');
  });
});

describe('wrapped — «no alcanzó el tiempo»: banco de frases y diapositivas', () => {
  let c, I;
  before(() => { c = nueva(); I = c.window._wrappedInternals; });
  const B = () => I.WRAPPED_BANCO_INSUFICIENTE;
  const vacia = () => { const v = nueva(); v.S.cuentas = [{ id: 'nequi', tipo: 'nequi', saldo: 0 }, { id: 'efectivo', tipo: 'efectivo', saldo: 0 }]; return v; };

  test('el banco tiene variedad suficiente y ninguna frase repetida', () => {
    const listas = { 'nada.titular': B().nada.titular, 'nada.explica': B().nada.explica, 'poco.titular': B().poco.titular, 'poco.explica': B().poco.explica, promesa: B().promesa };
    Object.entries(listas).forEach(([k, l]) => {
      assert.ok(l.length >= 8, k + ' debe tener al menos 8 frases (tiene ' + l.length + ')');
      assert.equal(new Set(l).size, l.length, k + ' tiene frases repetidas');
      l.forEach(f => assert.ok(typeof f === 'string' && f.trim().length > 8, k + ': frase vacía o demasiado corta'));
    });
  });

  test('todos los marcadores de cada frase existen y se resuelven (no queda ningún «{…}» sin llenar) y «poco» no usa marcadores que «nada» no tiene', () => {
    const conocidos = new Set(['anio', 'dias', 'registros', 'desde', 'minDias', 'minMeses']);
    const todas = [].concat(B().nada.titular, B().nada.explica, B().poco.titular, B().poco.explica, B().promesa);
    todas.forEach(f => { for (const m of f.matchAll(/\{(\w+)\}/g)) assert.ok(conocidos.has(m[1]), 'marcador desconocido {' + m[1] + '} en «' + f + '»'); });
    [].concat(B().nada.titular, B().nada.explica, B().promesa).forEach(f => assert.ok(!/\{(dias|registros|desde)\}/.test(f), '«nada» no tiene días/registros/desde: «' + f + '»'));
    // y a través del armado real, con cada frase forzada: nunca queda una llave
    for (let anio = 2026; anio < 2060; anio++) {
      ['nada', 'poco'].forEach(tier => {
        const sl = I._wrappedSlidesInsuficiente({ tier, registros: 1234, dias: 21, primera: '2026-10-18' }, String(anio));
        sl.forEach(s => assert.doesNotMatch(s.html, /\{\w+\}/, 'marcador sin resolver en ' + anio + '/' + tier));
      });
    }
  });

  test('«nada»: 2 diapositivas (mensaje + cierre); «poco»: 3 (mensaje + lo poco que hay + cierre) con los números reales y sin montos', () => {
    const nada = I._wrappedSlidesInsuficiente({ tier: 'nada', registros: 0, dias: 0 }, '2026');
    assert.deepEqual(plano(nada.map(s => s.id)), ['insuf-titular', 'insuf-cierre']);
    const poco = I._wrappedSlidesInsuficiente({ tier: 'poco', registros: 12, dias: 5, primera: '2026-10-18' }, '2026');
    assert.deepEqual(plano(poco.map(s => s.id)), ['insuf-titular', 'insuf-lo-que-hay', 'insuf-cierre']);
    const pills = poco[1].html;
    assert.match(pills, /5 días con registros/);
    assert.match(pills, /12 movimientos/);
    assert.match(pills, /Desde el 18 de octubre/);
    poco.concat(nada).forEach(s => assert.doesNotMatch(s.html, /\$\s?\d|data-value/, 'no debe mostrar montos'));
    assert.match(poco[2].html, /data-wrapped-action="cerrar"/, 'se puede cerrar desde la última diapositiva');
  });

  test('singular correcto: 1 día y 1 movimiento', () => {
    const sl = I._wrappedSlidesInsuficiente({ tier: 'poco', registros: 1, dias: 1, primera: '2026-12-31' }, '2026');
    assert.match(sl[1].html, /1 día con registros/);
    assert.match(sl[1].html, /1 movimiento</);
  });

  test('determinista: el mismo año y nivel dan SIEMPRE las mismas frases; años distintos varían (el banco se aprovecha)', () => {
    const a = JSON.stringify(I._wrappedSlidesInsuficiente({ tier: 'nada', registros: 0, dias: 0 }, '2027'));
    const b = JSON.stringify(I._wrappedSlidesInsuficiente({ tier: 'nada', registros: 0, dias: 0 }, '2027'));
    assert.equal(a, b);
    const titulares = new Set();
    for (let anio = 2026; anio < 2056; anio++) titulares.add(I._wrappedSlidesInsuficiente({ tier: 'nada', registros: 0, dias: 0 }, String(anio))[0].html.match(/wrapped-headline">([^<]*)</)[1]);
    assert.ok(titulares.size >= 8, 'en 30 años salieron solo ' + titulares.size + ' titulares distintos');
  });

  test('integración: _wrappedBuildSlides devuelve el mensaje cuando no hay datos y el Wrapped completo cuando sí (año explícito)', () => {
    const v = vacia();
    const I2 = v.window._wrappedInternals;
    assert.deepEqual(plano(I2._wrappedBuildSlides(v.S, fmt, '2026').map(s => s.id)), ['insuf-titular', 'insuf-cierre']);
    v.S.gastosVar.push(gasto(1, '2026-12-20'));
    const poco = I2._wrappedBuildSlides(v.S, fmt, '2026');
    assert.deepEqual(plano(poco.map(s => s.id)), ['insuf-titular', 'insuf-lo-que-hay', 'insuf-cierre'], 'un solo gasto ya no arma un Wrapped de 17 diapositivas');
    const lleno = nueva(); generar(lleno);
    const slides = lleno.window._wrappedInternals._wrappedBuildSlides(lleno.S, fmt, '2025');
    assert.ok(slides.length > 12);
    assert.ok(!slides.some(s => s.id.startsWith('insuf-')));
  });
});

describe('wrapped — instantáneas guardadas', () => {
  let c, I, slides;
  before(() => { c = nueva(); generar(c); I = c.window._wrappedInternals; slides = I._wrappedBuildSlides(c.S, fmt, '2024'); });

  test('la instantánea guarda id, mood, confetti y html; lleva versión y fecha de generación (sin «estado»: lo único que se guarda es un Wrapped real); es JSON puro', () => {
    const snap = I._wrappedSnapshotDe(slides);
    assert.equal(snap.version, 1);
    assert.equal(snap.version, I.WRAPPED_SNAPSHOT_VERSION);
    assert.equal(snap.generadoEn, '2026-10-30');
    assert.equal(snap.estado, undefined);
    assert.equal(snap.slides.length, slides.length);
    assert.ok(snap.slides.every(s => typeof s.id === 'string' && typeof s.html === 'string'));
    assert.ok(snap.slides.some(s => s.confetti === true), 'la diapositiva final trae confeti');
    assert.deepEqual(plano(snap), JSON.parse(JSON.stringify(snap)), 'solo JSON: sobrevive a un backup');
  });

  test('GUARDAR ES EXPLÍCITO: la última diapositiva del Wrapped recién calculado trae el botón «Guardar este Wrapped»; el guardado ya viene en estado «Guardado» y sin la acción', () => {
    const cierre = slides.find(s => s.id === 'cierre');
    assert.equal((cierre.html.match(/data-wrapped-action="guardar"/g) || []).length, 1, 'un solo botón de guardar');
    assert.match(cierre.html, /Guardar este Wrapped/);
    assert.equal(slides.filter(s => s.id !== 'cierre').some(s => /data-wrapped-action="guardar"/.test(s.html)), false, 'solo en la última');
    const snap = I._wrappedSnapshotDe(slides);
    const guardada = snap.slides.find(s => s.id === 'cierre');
    assert.doesNotMatch(guardada.html, /data-wrapped-action="guardar"/);
    assert.match(guardada.html, /<button type="button" class="wrapped-cta ghost" disabled>Guardado<\/button>/);
    assert.equal(I._wrappedMarcarGuardado(I._wrappedMarcarGuardado(slides)).find(s => s.id === 'cierre').html, I._wrappedMarcarGuardado(slides).find(s => s.id === 'cierre').html, 'marcar dos veces no cambia nada');
    assert.match(cierre.html, /data-wrapped-action="replay"/, 'los demás botones siguen');
  });

  test('el mensaje «no alcanzó el tiempo» NO se puede guardar (no hay nada que recordar) y no trae botón de guardar', () => {
    const mensaje = I._wrappedSlidesInsuficiente({ tier: 'poco', registros: 12, dias: 5, primera: '2026-10-18' }, '2026');
    assert.equal(mensaje.some(s => /data-wrapped-action="guardar"/.test(s.html)), false);
    const v = nueva();
    let msg = null; try { v.window._wrappedInternals._wrappedGuardar(v.S, '2026', mensaje); } catch (e) { msg = String(e && e.message); }
    assert.match(msg || '', /no alcanzó el tiempo/);
    assert.equal(v.S.wrappedAnios, undefined, 'y no se tocó S');
  });

  test('_wrappedGuardar escribe S.wrappedAnios[año] con la instantánea y reemplaza el guardado anterior de ese año', () => {
    const v = nueva(); generar(v, { dias: 900 });
    const I2 = v.window._wrappedInternals;
    const frescas = I2._wrappedBuildSlides(v.S, fmt, '2025');
    I2._wrappedGuardar(v.S, '2025', frescas);
    assert.equal(v.S.wrappedAnios['2025'].slides.length, frescas.length);
    v.S.wrappedAnios['2025'].generadoEn = '2000-01-01';
    I2._wrappedGuardar(v.S, '2025', frescas);
    assert.equal(v.S.wrappedAnios['2025'].generadoEn, '2026-10-30', 'guardar de nuevo reemplaza (es lo que hace la actualización dentro de enero)');
    assert.deepEqual(Object.keys(v.S.wrappedAnios), ['2025']);
  });

  test('pesa poco: ≈ 4–5 KB comprimidos por año (diez años no llegan a 60 KB)', () => {
    const snap = I._wrappedSnapshotDe(slides);
    const kb = Buffer.byteLength(zlib.gzipSync(JSON.stringify(snap)).toString('base64')) / 1024;
    assert.ok(kb < 7, 'una instantánea pesó ' + kb.toFixed(1) + ' KB comprimidos');
    assert.ok(kb * 10 < 60);
  });

  test('«Ocultar saldos» NO se congela: se quita al guardar y se aplica al mostrar según la preferencia de ese momento', () => {
    const conMascara = '<div class="wrapped-slide-inner"><div class="wrapped-bignum c-amber saldo-hidden" data-value="50000">0</div></div>';
    const snap = I._wrappedSnapshotDe([{ id: 'alcancia', html: conMascara }, { id: 'otra', html: '<div class="saldo-hidden">x</div>' }]);
    assert.doesNotMatch(snap.slides[0].html, /saldo-hidden/, 'guardado sin desenfoque');
    c.localStorage = { getItem: k => (k === 'mf-saldos-ocultos' ? '1' : null) };
    let vista = I._wrappedSlidesDeSnapshot(snap);
    assert.match(vista[0].html, /class="wrapped-bignum c-amber saldo-hidden"/, 'con la preferencia activa, la diapositiva de la alcancía se desenfoca al mostrar');
    assert.doesNotMatch(vista[1].html, /saldo-hidden/, 'otras diapositivas no se tocan');
    c.localStorage = { getItem: () => null };
    vista = I._wrappedSlidesDeSnapshot(snap);
    assert.doesNotMatch(vista[0].html, /saldo-hidden/, 'con la preferencia apagada se ve sin desenfoque, aunque al guardar estuviera activa');
    assert.equal(I._wrappedConMascara(I._wrappedConMascara(conMascara)), I._wrappedConMascara(conMascara), 'aplicar dos veces no duplica la clase');
  });
});

describe('wrapped — contrato de CSS del HTML guardado', () => {
  const fuentes = ['css/styles.css', 'js/modules/wrapped.js', 'index.html'].map(f => fs.readFileSync(path.join(RAIZ, !fs.existsSync(path.join(RAIZ, f)) && f === 'css/styles.css' ? 'styles.css' : f), 'utf8')).join('\n');
  const definida = cls => cls.startsWith('fa-') || new RegExp('\\.' + cls.replace(/[-]/g, '\\-') + '(?![\\w-])').test(fuentes); // fa-*: FontAwesome (externo)
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'wrapped-clases.json'), 'utf8'));
  const clasesDe = sl => { const s = new Set(); sl.forEach(x => { for (const m of x.html.matchAll(/class="([^"]+)"/g)) m[1].split(/\s+/).forEach(k => s.add(k)); }); return s; };

  test('cada clase que usa un Wrapped guardado (instantánea de referencia) sigue definida: renombrar o borrar una rompería los recuerdos viejos en silencio', () => {
    const rotas = fixture.filter(k => !definida(k));
    assert.deepEqual(rotas, [], 'Estas clases las usa el HTML ya guardado y dejaron de existir. No las renombres: añade la nueva y conserva la vieja (contrato solo aditivo).');
  });

  test('el contrato crece, no se queda atrás: si el Wrapped actual usa una clase que no está en la instantánea de referencia, hay que añadirla', () => {
    const c = nueva(); generar(c, { desde: '2024-01-01', dias: 1000 });
    const I = c.window._wrappedInternals;
    const usadas = new Set();
    ['2024', '2025'].forEach(a => clasesDe(I._wrappedBuildSlides(c.S, fmt, a)).forEach(k => usadas.add(k)));
    clasesDe(I._wrappedSlidesInsuficiente({ tier: 'nada', registros: 0, dias: 0 }, '2026')).forEach(k => usadas.add(k));
    clasesDe(I._wrappedSlidesInsuficiente({ tier: 'poco', registros: 12, dias: 5, primera: '2026-10-18' }, '2026')).forEach(k => usadas.add(k));
    const nuevas = [...usadas].filter(k => !fixture.includes(k));
    assert.deepEqual(nuevas, [], 'Añade estas clases a tests/fixtures/wrapped-clases.json (orden alfabético): ahora las usa el HTML que se guarda.');
  });
});
});
