'use strict';
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

  test('REGLA DEL WRAPPED: no se cierra ningún año sin su Wrapped guardado — el informe lista los años que se tocarían y cuáles faltan', () => {
    assert.deepEqual(plano(informe.wrapped.requeridos), ['2024', '2025']);
    assert.deepEqual(plano(informe.wrapped.faltan), ['2024', '2025']);
    assert.ok(informe.advertencias.includes('wrapped-sin-guardar'));
    const v = cargarApp(); generar(v, { dias: 900 });
    v.S.wrappedAnios = { 2024: { version: 1, estado: 'completo', slides: [] }, 2025: { version: 1, estado: 'insuficiente', slides: [] } };
    const r = v.Cierre.analizar(CORTE, v.S, { mesActual: MES_ACTUAL });
    assert.deepEqual(plano(r.wrapped.faltan), [], 'con ambos guardados (también el «no alcanzó el tiempo») ya no falta ninguno');
    assert.ok(!r.advertencias.includes('wrapped-sin-guardar'));
    const parcial = cargarApp(); generar(parcial, { dias: 900 });
    parcial.S.wrappedAnios = { 2024: { version: 1, estado: 'completo', slides: [] } };
    assert.deepEqual(plano(parcial.Cierre.analizar(CORTE, parcial.S, { mesActual: MES_ACTUAL }).wrapped.faltan), ['2025']);
  });

  test('el año en curso no exige Wrapped (todavía no se puede generar) y un corte anterior solo exige los años que toca', () => {
    const r = analizar('2024-09', ctx.S, { huella });
    assert.deepEqual(plano(r.wrapped.requeridos), ['2024']);
    assert.ok(!r.wrapped.requeridos.includes('2026'));
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
    const codec = await import(path.join(RAIZ, 'js', 'core', 'payload-codec.js'));
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
    const ctx = loadApp(['core/core-state.js', 'core/cuenta-efectos.js', 'core/periodo.js', 'core/nu-calc.js', 'core/calc-helpers.js', 'core/html-tag.js', 'core/huella.js', 'core/cierre.js', 'modules/tarjetas_credito.js', 'modules/configuracion.js'].map(R), { permissive: true });
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
    assert.match(String(el.innerHTML), /conviene empezar a archivar los años cerrados/);
    assert.match(String(el.innerHTML), /datos de más de 2 años/);
    ctx.Cierre.tamano = async () => { throw new Error('boom'); };
    const aviso = console.warn; console.warn = () => {};
    try { await ctx.renderTamanoDatos(); } finally { console.warn = aviso; }
    assert.equal(el.innerHTML, '');
  });
});
