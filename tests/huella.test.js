'use strict';
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
    assert.equal(s.saldos.porCuenta.nequi.guardado, s.saldos.porCuenta.nequi.libro);
    assert.equal(s.deudas.entidades['favor:favorCerrada'].saldo, 0);
    assert.equal(s.deudas.entidades['favor:favorAbierta'].saldo, 100000);
    assert.equal(s.deudas.entidades['contra:contraAbierta'].saldo, 80000);
    assert.equal(s.tarjetas.entidades.tcCerrada.saldo, 0);
    assert.equal(s.tarjetas.entidades.tcAbierta.saldo, 2000000);
    assert.equal(s.tarjetas.entidades.tcAbierta.coherente, true);
    assert.equal(s.encargos.entidades.encCerrado.saldo, 0);
    assert.equal(s.encargos.entidades.encAbierto.saldo, 350000, 'saldo inicial + entradas − salidas');
    assert.equal(s.encargos.entidades.encAbierto.porCuenta.nequi, 350000);
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
      b.sondas.saldos.porCuenta.nequi.libro += 5;
      delete b.sondas.periodos['2024-03'];
      b.sondas.tarjetas.entidades.tcAbierta.saldo += 0.004;
      const r = ctx.Huella.comparar(huella, b);
      assert.equal(r.ok, false);
      const rutas = r.diferencias.map(d => d.ruta);
      assert.ok(rutas.includes('saldos.porCuenta.nequi.libro'));
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
