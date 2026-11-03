// tests/escenarios-financieros.test.js — Escenarios NEGATIVOS y de borde de Salud, Proyección, Hero, Wrapped, Análisis y push.
// Un estado sintético por escenario de mejoras-mis-finanzas.md (ya resueltas; ver CHANGELOG.md): la app estaba pensada para quien tiene
// plata y crece, y en deuda, con patrimonio negativo o con una caída sostenida a veces mostraba algo engañoso o se quedaba callada.
// Corre con:  node --test tests/escenarios-financieros.test.js   (o todo: npm test)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadApp } = require('./support/load-app');
const { createFakeDom, createHtmlTag } = require('./support/fake-dom');

const RAIZ = path.join(__dirname, '..');
const CORE = f => path.join(RAIZ, 'js', 'core', f);
const MOD = f => path.join(RAIZ, 'js', 'modules', f);

function app(sObj = {}, extra = []) {
  const ctx = loadApp([CORE('core-state.js'), CORE('periodo.js'), CORE('nu-calc.js'), CORE('calc-helpers.js'), CORE('umbrales.js'), MOD('inicio.js'), ...extra]);
  Object.assign(ctx.S, sObj);
  return ctx;
}
const mesHace = n => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
const mesAct = mesHace(0);
const cuentas = (nequi = 0) => [{ id: 'nequi', tipo: 'nequi', saldo: nequi }, { id: 'efectivo', tipo: 'efectivo', saldo: 0 }];
const yoDebo = monto => [{ id: 'd1', nombre: 'Fulano', movimientos: [{ tipo: 'recibido', monto }] }];
const ingresosEn = (monto, meses) => [{ id: 'ip', nombre: 'Sueldo', monto, desde: '2020-01', cobros: meses.map((m, i) => ({ id: 'c' + i, mesCubre: m, monto, fecha: m + '-15' })) }];
const ultimosN = (n, desde = 1) => Array.from({ length: n }, (_, i) => mesHace(i + desde));
const gastosEn = (monto, meses) => ({ gastosFijos: [{ id: 'g1', monto }], pagosGastosFijos: Object.fromEntries(meses.map(m => ['g1_' + m, { monto, fecha: m + '-02' }])) });
const cdt = (extra = {}) => [{ id: 'cj', nombre: 'Nu', saldo: 0, movimientos: [], cdts: [{ id: 'c1', monto: 1000000, tasa: 10, inicio: mesHace(1) + '-01', vence: mesHace(-6) + '-01', ...extra }] }];
const score = o => app(o).calcHealthScore();

/* ================= Salud financiera ================= */
test('A. solo deudas con personas: la Salud NO dice «registra más datos» y alerta', () => {
  const r = score({ cuentas: cuentas(100000), misDeudas: yoDebo(500000) });
  assert.equal(r.sinDatos, false);
  assert.ok(r.consejos.some(c => c.tipo === 'alerta' && c.texto.includes('Lo que debes a personas supera la plata que tienes disponible')));
});

test('F4. tener deuda de tarjeta manejable NO sube el puntaje; no deber nada es lo que suma', () => {
  const base = { cuentas: cuentas(3000000), ingresosFijos: ingresosEn(1000000, ultimosN(3)) };
  const sinDeuda = score(base).score;
  const deuda1x = score({ ...base, tarjetasCredito: [{ id: 't', deuda: 1000000, cupo: 5000000 }] }).score;
  const deuda29 = score({ ...base, tarjetasCredito: [{ id: 't', deuda: 2900000, cupo: 5000000 }] }).score;
  assert.ok(deuda1x < sinDeuda, `sin deuda ${sinDeuda}, con deuda de 1× el ingreso ${deuda1x}: antes la deuda SUBÍA el puntaje (50 → 55)`);
  assert.ok(deuda29 < deuda1x);
});

test('mes parcial: un mes que apenas empieza no regala puntos por «gastar poco» (el ratio mide meses completos)', () => {
  const base = { cuentas: cuentas(3000000), ingresosFijos: ingresosEn(1000000, ultimosN(3)) };
  const sinGasto = score(base).score;
  const gastoPequeno = score({ ...base, ...gastosEn(50000, [mesAct]) }).score;
  assert.equal(gastoPequeno, sinGasto, 'antes: 50 → 60 por haber gastado $50.000 en los primeros días del mes');
});

test('el ratio gasto/ingreso usa los meses completos: gastar más de lo que ingresas casi siempre penaliza; gastar poco suma', () => {
  const ing = ingresosEn(1000000, ultimosN(3));
  const sano = score({ cuentas: cuentas(3000000), ingresosFijos: ing, ...gastosEn(500000, ultimosN(3)) });
  const mal = score({ cuentas: cuentas(3000000), ingresosFijos: ing, ...gastosEn(1500000, ultimosN(3)) });
  assert.ok(sano.score > mal.score);
  assert.ok(mal.tips.some(t => t.includes('gastando más de lo que ingresas')));
});

test('el mes en curso ya pasado del ingreso es déficit seguro y avisa', () => {
  const r = score({ cuentas: cuentas(3000000), ingresosFijos: ingresosEn(1000000, ultimosN(3)), ...gastosEn(1500000, [mesAct]) });
  assert.ok(r.tips.includes('Por ahora estás gastando más de lo que ingresas.'));
});

test('N-1. un ingreso de hace 10-12 meses NO es el ingreso de hoy: sigue el aviso «Registra tus ingresos»', () => {
  const ctx = app({ cuentas: cuentas(3000000), ingresosFijos: ingresosEn(4000000, [mesHace(10), mesHace(11), mesHace(12)]), ...gastosEn(800000, [mesAct]) });
  assert.deepEqual({ ...ctx.Periodo.ingresoPromedioPrevio(mesAct, 3) }, { promedio: 0, meses: 0 }, 'fuera de la ventana de 6 meses');
  assert.ok(ctx.calcHealthScore().tips.some(t => t.includes('Registra tus ingresos')));
});

test('N-1. el gasto típico también se limita a la ventana: un gasto de hace un año no mide el fondo de emergencia de hoy', () => {
  const ctx = app(gastosEn(1000000, [mesHace(12), mesHace(13)]));
  assert.equal(ctx.Periodo.gastoPromedioPrevio(mesAct, 3).meses, 0);
  assert.equal(ctx.Periodo.VENTANA_REFERENCIA_MESES, 6);
});

test('N-2. liquidez negativa con un CDT: el consejo NOMBRA la deuda (antes decía solo «tus ahorros están en CDTs»)', () => {
  const r = score({ cuentas: cuentas(100000), cajitas: cdt(), tarjetasCredito: [{ id: 't', deuda: 300000, cupo: 1000000 }], ...gastosEn(50000, [mesAct]) });
  const c = r.consejos.find(x => x.texto.includes('supera la plata que tienes disponible'));
  assert.ok(c, 'menciona la deuda');
  assert.equal(c.tipo, 'aviso', 'menos grave que sin CDT, porque la diferencia está cubierta');
  assert.ok(c.texto.includes('CDT'));
  assert.ok(!r.tips.some(t => t.includes('tus ahorros están en CDTs, no en cuentas libres')));
});

test('N-2. la misma deuda sin CDT que la cubra es una alerta', () => {
  const r = score({ cuentas: cuentas(100000), tarjetasCredito: [{ id: 't', deuda: 300000, cupo: 1000000 }], ...gastosEn(50000, [mesAct]) });
  assert.ok(r.consejos.some(c => c.tipo === 'alerta' && c.texto.includes('Tu deuda en tarjetas supera la plata que tienes disponible')));
});

test('el bono de CDT baja a +3 cuando la liquidez es negativa', () => {
  const sano = score({ cuentas: cuentas(5000000), cajitas: cdt({ monto: 1000000 }) });
  const negativa = score({ cuentas: cuentas(0), cajitas: cdt({ monto: 5000000 }), tarjetasCredito: [{ id: 't', deuda: 100000, cupo: 1000000 }] });
  // negativa: −15/−8 por liquidez + CDT con tope 3; no puede superar al caso sano
  assert.ok(negativa.score < sano.score);
});

test('N-7. un CDT ya vencido cuenta como liquidez (no está bloqueado); uno sin vencer, no', () => {
  const vencido = app({ cajitas: cdt({ monto: 20000000, inicio: mesHace(13) + '-01', vence: mesHace(1) + '-01' }) }).calcLiquidez();
  assert.ok(vencido.neta > 20000000);
  assert.equal(vencido.cdtsBloqueados, 0);
  assert.equal(vencido.conCDTs, vencido.neta + vencido.cdtsBloqueados);
  const vigente = app({ cajitas: cdt({ monto: 20000000 }) }).calcLiquidez();
  assert.equal(vigente.neta, 0);
  assert.ok(vigente.cdtsBloqueados > 20000000);
  assert.equal(vigente.cdtsVencidos, 0);
});

test('N-5. un saldo a favor en una tarjeta (deuda < 0) no suma al patrimonio', () => {
  const ctx = app({ cuentas: cuentas(100000), tarjetasCredito: [{ id: 't', deuda: -500000, cupo: 1000000 }] });
  assert.equal(ctx.calcPatrimonioTotal(), 100000);
  assert.equal(ctx.calcLiquidez().neta, 100000, 'patrimonio y liquidez coinciden');
});

test('N-6. un CDT sin tasa no deja el patrimonio en NaN ni congela el historial (se calcula sin rendimiento)', () => {
  const ctx = app({ cuentas: cuentas(100000), cajitas: cdt({ tasa: undefined }), patrimonioHistorial: [] });
  assert.equal(ctx.calcPatrimonioTotal(), 1100000);
  ctx.snapshotPatrimonio();
  assert.equal(ctx.S.patrimonioHistorial.length, 1, 'el historial sigue grabando');
});

test('N-6. «2026-9-26» (fecha sin cero) en un CDT sigue sin romper el patrimonio', () => {
  const ctx = app({ cuentas: cuentas(100000), cajitas: cdt({ inicio: '2026-9-26', vence: '2027-9-26' }) });
  assert.ok(Number.isFinite(ctx.calcPatrimonioTotal()));
});

/* ---- caída sostenida (racha de déficit) y runway ---- */
const racha = (n, ingreso = 1000000, gasto = 1500000) => ({
  ingresosFijos: ingresosEn(ingreso, ultimosN(6)),
  ...gastosEn(gasto, ultimosN(n)),
});

test('Periodo.rachaDeficit cuenta meses completos SEGUIDOS con balance negativo y se corta con un mes sano', () => {
  const ctx = app({ ...racha(3), gastosFijos: [{ id: 'g1', monto: 1 }] });
  const r = ctx.Periodo.rachaDeficit(mesAct, 6);
  assert.equal(r.meses, 3);
  assert.equal(r.acumulado, -1500000, 'tres meses de −$500.000');
  const sano = app({ ...gastosEn(900000, [mesHace(1), mesHace(3)]), ingresosFijos: ingresosEn(1000000, ultimosN(6)) });
  assert.equal(sano.Periodo.rachaDeficit(mesAct, 6).meses, 0);
});

test('N1. tres meses seguidos gastando más de lo que ingresas: alerta y baja el puntaje, aunque haya colchón', () => {
  const base = { cuentas: cuentas(2500000) }; // ~1,7 meses del gasto típico: sin fondo sólido
  const sano = score({ ...base, ingresosFijos: ingresosEn(1000000, ultimosN(6)), ...gastosEn(500000, ultimosN(3)) });
  const caida = score({ ...base, ...racha(3) });
  assert.ok(caida.score < sano.score);
  assert.equal(caida.rachaDeficit, 3);
  assert.ok(caida.consejos.some(c => c.tipo === 'alerta' && c.texto.includes('3 meses seguidos')));
  const dos = score({ ...base, ...racha(2) });
  assert.ok(dos.consejos.some(c => c.tipo === 'aviso' && c.texto.includes('2 meses seguidos')));
});

test('N1. un fondo sólido (≥ 6 meses de gasto) absorbe la racha: no se penaliza', () => {
  const r = score({ cuentas: cuentas(20000000), ...racha(3) });
  assert.equal(r.rachaDeficit, 0);
  assert.ok(!r.tips.some(t => t.includes('meses seguidos')));
});

test('N1. sin ingreso reciente registrado la racha no se declara (sería solo no haber anotado ingresos)', () => {
  const r = score({ cuentas: cuentas(2500000), ...gastosEn(1500000, ultimosN(3)) });
  assert.equal(r.rachaDeficit, 0);
});

test('runway: «cubres X meses» = liquidez ÷ gasto típico; 0 si no hay liquidez; null sin gasto típico', () => {
  assert.equal(score({ cuentas: cuentas(3400000), ...gastosEn(1000000, ultimosN(3)) }).mesesCubiertos, 3.4);
  assert.equal(score({ cuentas: cuentas(0), misDeudas: yoDebo(100000), ...gastosEn(1000000, ultimosN(3)) }).mesesCubiertos, 0);
  assert.equal(score({ cuentas: cuentas(3000000) }).mesesCubiertos, null);
  const ctx = app();
  assert.equal(ctx._textoRunway(3.44), 'Cubres 3,4 meses de gastos');
  assert.equal(ctx._textoRunway(0.5), 'Cubres menos de 1 mes de gastos');
  assert.equal(ctx._textoRunway(0), 'Tu plata disponible no cubre tus gastos');
  assert.equal(ctx._nivelRunway(0.5), 'critico');
  assert.equal(ctx._nivelRunway(2), 'atencion');
  assert.equal(ctx._nivelRunway(5), 'ok');
});

test('con ahorros y sin gasto típico se explica por qué no hay medición (no queda un «Regular» mudo)', () => {
  const r = score({ cuentas: cuentas(3000000), ingresosFijos: ingresosEn(1000000, ultimosN(3)) });
  assert.ok(r.tips.some(t => t.includes('Cuando completes un mes de gastos')));
});

test('el criterio de «configurar la app» ya no puntúa (≥ 2 gastos fijos / una sola categoría)', () => {
  const base = { cuentas: cuentas(3000000), ingresosFijos: ingresosEn(1000000, ultimosN(3)) };
  const a = score(base).score;
  const b = score({ ...base, gastosFijos: [{ id: 'a', monto: 1 }, { id: 'b', monto: 1 }] }).score;
  assert.equal(a, b);
});

test('no regresión del caso feliz: 3 M de ahorro, 1 M de ingreso, gasto sano y sin deuda sigue en «Regular» alto o más', () => {
  const r = score({ cuentas: cuentas(6000000), ingresosFijos: ingresosEn(1000000, ultimosN(3)), ...gastosEn(500000, ultimosN(3)) });
  assert.ok(r.score >= 80, `dio ${r.score}`);
});

/* ================= Hero ================= */
test('F2. estados del hero: negativo (rojo), cero (neutro), liquidez negativa con patrimonio positivo (ámbar), «sin contar lo que te deben»', () => {
  const neg = app({ cuentas: cuentas(100000), misDeudas: yoDebo(500000) }).calcEstadoHero();
  assert.equal(neg.estado, 'negativo'); assert.equal(neg.clase, 'c-red'); assert.match(neg.mensaje, /Debes más de lo que tienes/);

  const cero = app({ cuentas: cuentas(100000), misDeudas: yoDebo(100000) }).calcEstadoHero();
  assert.equal(cero.estado, 'cero'); assert.equal(cero.clase, 'c-text2');

  const ambar = app({ cuentas: cuentas(100000), cajitas: cdt(), tarjetasCredito: [{ id: 't', deuda: 300000, cupo: 1000000 }] }).calcEstadoHero();
  assert.equal(ambar.estado, 'liquidez-negativa'); assert.equal(ambar.clase, 'c-amber');

  const prestado = app({ cuentas: cuentas(100000), deudores: [{ id: 'f', nombre: 'Ana', movimientos: [{ tipo: 'prestamo', monto: 900000 }] }] }).calcEstadoHero();
  assert.equal(prestado.estado, 'prestado'); assert.match(prestado.mensaje, /Sin contar lo que te deben/);

  const sano = app({ cuentas: cuentas(5000000) }).calcEstadoHero();
  assert.equal(sano.estado, 'sano'); assert.equal(sano.clase, 'c-green'); assert.equal(sano.mensaje, '');
});

test('renderHeroEstado cambia la clase del monto y escribe el mensaje, sin perder otras clases (saldo-hidden)', () => {
  const ctx = app({ cuentas: cuentas(100000), misDeudas: yoDebo(500000) });
  const clases = new Set(['hero-amount', 'c-green', 'saldo-hidden']);
  const hero = { classList: { add: c => clases.add(c), remove: c => clases.delete(c) } };
  const est = { textContent: '', classList: { add() {}, remove() {} } };
  ctx.document = { getElementById: id => (id === 'heroTotal' ? hero : id === 'hero-estado' ? est : null) };
  ctx.renderHeroEstado();
  assert.ok(clases.has('c-red') && !clases.has('c-green') && clases.has('saldo-hidden') && clases.has('hero-amount'));
  assert.match(est.textContent, /Debes más de lo que tienes/);
});

/* ================= Proyección ================= */
function proyeccion(sObj) {
  const ctx = app(sObj);
  const dom = createFakeDom();
  ctx.document = dom.document;
  ctx.renderProyeccion();
  return dom.el('proyeccion-card').innerHTML;
}
const fechaHace = dias => { const d = new Date(); d.setDate(d.getDate() - dias); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
// Historial diario de `dias` días que termina en `final` y cambia `paso` por día.
const historial = (dias, final, paso) => Array.from({ length: dias + 1 }, (_, i) => ({ fecha: fechaHace(dias - i), valor: final - (dias - i) * paso, valorVisible: final - (dias - i) * paso, montoBase: 0 }));

test('F1. patrimonio −200.000 bajando 150.000/mes: la Proyección muestra −1.100.000 a 6 meses, no $0', () => {
  const h = proyeccion({ misDeudas: yoDebo(200000), patrimonioHistorial: historial(60, -200000, -5000) });
  assert.match(h, /data-proy-key="6m"[^>]*data-proy-val="-1100000"/);
  assert.match(h, /data-proy-pct=""/, 'sin porcentaje sobre una base negativa (antes «0.0»)');
  assert.ok(!/inicio-proy-card-v [^"]*">\$0</.test(h), 'ninguna tarjeta dice $0');
  assert.match(h, /-\$?1\.100\.000|-\$ ?1\.100\.000/);
});

test('patrimonio exactamente 0 con cuentas y deudas es un dato real, no «sin datos»', () => {
  const h = proyeccion({ cuentas: cuentas(100000), misDeudas: yoDebo(100000), patrimonioHistorial: historial(40, 0, 0) });
  assert.ok(!h.includes('Sin datos suficientes'));
  assert.ok(h.includes('data-proy-key="3m"'));
  assert.ok(proyeccion({}).includes('Sin datos suficientes'), 'sin nada, sí es «sin datos»');
});

test('una fecha sin padding en el historial («2026-9-26») no produce NaN en la Proyección', () => {
  const hist = historial(60, 1000000, 1000);
  hist[10].fecha = '2026-9-26';
  const h = proyeccion({ cuentas: cuentas(1000000), patrimonioHistorial: hist });
  assert.ok(!h.includes('NaN'));
});

test('«ESTABLE» exige 90 días y un ritmo consistente en los tres tercios; una compra grande en un tercio lo vuelve «estimación»', () => {
  const estable = proyeccion({ cuentas: cuentas(2000000), patrimonioHistorial: historial(100, 2000000, 10000) });
  assert.ok(estable.includes('ESTABLE'));
  const corto = proyeccion({ cuentas: cuentas(2000000), patrimonioHistorial: historial(70, 2000000, 10000) });
  assert.ok(!corto.includes('ESTABLE') && corto.includes('estimación'), 'antes bastaban 60 días');
  // una caída de −3 M en el primer tercio y subidas después
  const hist = historial(100, 2000000, 10000);
  hist.forEach((p, i) => { if (i >= 10) { p.valor -= 3000000; p.valorVisible -= 3000000; } });
  const irregular = proyeccion({ cuentas: cuentas(2000000), patrimonioHistorial: hist });
  assert.ok(!irregular.includes('ESTABLE'));
  assert.ok(irregular.includes('Tu ritmo cambió mucho'));
});

test('N-4. el texto de deuda dice la deuda TOTAL descontada y cuánto es propia', () => {
  const tc = [{ id: 't', nombre: 'TC', deuda: 1000000, cupo: 5000000 }];
  const h = proyeccion({ cuentas: cuentas(3000000), tarjetasCredito: tc, patrimonioHistorial: historial(40, 2000000, 0) });
  assert.match(h, /Deuda TC: \$?1\.000\.000/);
  assert.ok(!h.includes('Deuda TC propia'));
});

test('con tendencia negativa y plata disponible, la Proyección dice cuánto aguanta', () => {
  const h = proyeccion({ cuentas: cuentas(3000000), patrimonioHistorial: historial(60, 3000000, -50000) });
  assert.match(h, /tu plata disponible duraría unos 2 meses/);
});

/* ================= Atención ================= */
test('Atención avisa liquidez negativa, «Yo debo», déficit sostenido y tarjetas no activas con deuda', () => {
  const ctx = app({ cuentas: cuentas(100000), misDeudas: yoDebo(500000), tarjetasCredito: [{ id: 't', nombre: 'Vieja', estado: 'cerrada', deuda: 80000, cupo: 1000000 }], ...racha(3) });
  const { html, raw } = (() => { const l = createHtmlTag(ctx.escHtml); return l; })();
  ctx.html = html; ctx.raw = raw;
  const dom = createFakeDom();
  ctx.document = dom.document;
  ctx.hoy = () => mesAct + '-15';
  dom.el('s-attn-section').querySelector = () => null;
  ctx.renderAttencion();
  const t = String(dom.el('s-attn-list').innerHTML);
  assert.match(t, /Tus deudas superan la plata que tienes disponible/);
  assert.match(t, /Le debes .* a Fulano/);
  assert.match(t, /Vieja: tarjeta cerrada con deuda/);
  assert.match(t, /3 meses seguidos gastando más de lo que ingresas/);
});

/* ================= Umbrales ================= */
test('UMBRALES está congelado a fondo: nadie lo cambia desde otro archivo', () => {
  const ctx = app();
  assert.ok(Object.isFrozen(ctx.UMBRALES) && Object.isFrozen(ctx.UMBRALES.salud) && Object.isFrozen(ctx.UMBRALES.salud.fondoMeses));
  assert.equal(ctx.UMBRALES.salud.fondoMeses.minimo, 3);
});

/* ================= Wrapped ================= */
function wrapped() {
  const { cargarApp } = require('./support/datos-sinteticos');
  return cargarApp(['core/wrapped-gate.js']).window._wrappedInternals;
}
const anioHist = (inicio, fin) => ({ patrimonioHistorial: [{ fecha: '2025-01-05', valor: inicio, valorVisible: inicio, montoBase: 0 }, { fecha: '2025-12-20', valor: fin, valorVisible: fin, montoBase: 0 }] });
const frase = (ctx, inicio, fin, extra) => { const p = ctx._wrappedPatrimonioAnio(anioHist(inicio, fin), '2025'); return { p, f: ctx._wrappedCopyPatrimonio(p, extra) }; };

test('F5. Wrapped: sobre una base mínima o negativa no hay porcentaje (+39.900 %, −800 %, «casi se duplicó» siguiendo en deuda)', () => {
  const ctx = wrapped();
  const mini = frase(ctx, 5000, 2000000);
  assert.equal(mini.p.pct, null); assert.ok(!mini.f.includes('%'));
  const sigueDebiendo = frase(ctx, -900000, -100000);
  assert.equal(sigueDebiendo.p.pct, null); assert.ok(!sigueDebiendo.f.includes('%')); assert.match(sigueDebiendo.f, /debiendo|rojos/);
  assert.ok(!/duplic|redonde/.test(sigueDebiendo.f));
  const hundeMas = frase(ctx, -100000, -900000);
  assert.equal(hundeMas.p.pct, null); assert.match(hundeMas.f, /debiendo más|más/);
});

test('F5. Wrapped: cruzar el cero se dice con palabras (a deuda / fuera de deuda), nunca con un −160 %', () => {
  const ctx = wrapped();
  const entra = frase(ctx, 500000, -300000);
  assert.ok(!entra.f.includes('%')); assert.match(entra.f, /deb|rojos/);
  const sale = frase(ctx, -500000, 300000);
  assert.ok(!sale.f.includes('%')); assert.match(sale.f, /rojos/);
});

test('F5. Wrapped: tres niveles de caída (leve < 5 %, moderada 5-15 %, fuerte ≥ 15 %); −24 % ya no es «un poco» ni «nada que no se recupere»', () => {
  const ctx = wrapped();
  const leve = frase(ctx, 2000000, 1950000).f;        // −2,5 %
  const moderada = frase(ctx, 2000000, 1800000).f;    // −10 %
  const fuerte = frase(ctx, 2000000, 1520000).f;      // −24 %
  assert.ok(/-3%|-2%/.test(leve));
  assert.ok(/-10%|10%/.test(moderada));
  assert.ok(/-24%/.test(fuerte));
  assert.ok(!/un poco|no se recupere/.test(fuerte + moderada));
  assert.ok(!/redonde/.test(frase(ctx, 1000000, 1600000).f), 'la frase «casi se redondeó» ya no existe');
});

test('F5. Wrapped: la caída lleva su CAUSA (una compra, gastar más de lo ingresado, o algo que los ingresos y gastos no explican)', () => {
  const ctx = wrapped();
  const compra = frase(ctx, 3000000, 900000, { balance: 100000, gastoMasGrande: { desc: 'Moto <b>', monto: 2000000 } }).f;
  assert.match(compra, /Casi toda la caída fue por una compra: Moto &lt;b&gt;/, 'escapa el texto del usuario');
  assert.match(frase(ctx, 3000000, 2000000, { balance: -900000, gastoMasGrande: { desc: 'x', monto: 10000 } }).f, /Gastaste .* más de lo que ingresaste/);
  assert.match(frase(ctx, 3000000, 2000000, { balance: 500000, gastoMasGrande: { desc: 'x', monto: 10000 } }).f, /ingresos superaron tus gastos/);
  assert.ok(!/Gastaste|compra:|ingresos superaron/.test(frase(ctx, 3000000, 2000000).f), 'sin contexto no se inventa una causa');
  assert.ok(!/Gastaste|compra:|ingresos superaron/.test(frase(ctx, 2000000, 3000000, { balance: -1, gastoMasGrande: { desc: 'x', monto: 1 } }).f), 'si subió, no hay causa de caída');
});

/* ================= Análisis ================= */
function analisis(sObj) {
  const l = createHtmlTag(null);
  const ctx = loadApp([CORE('core-state.js'), CORE('periodo.js'), CORE('nu-calc.js'), CORE('calc-helpers.js'), CORE('html-tag.js'), MOD('analisis.js')], { permissive: true });
  Object.assign(ctx.S, sObj);
  const dom = createFakeDom();
  ctx.document = dom.document;
  const toasts = [];
  ctx.toast = (m, t) => toasts.push([m, t]); ctx.window.toast = ctx.toast;
  ctx.localStorage.clear && ctx.localStorage.clear();
  return { ctx, dom, toasts };
}

test('presupuestos: avisa al SUPERAR el 100 %, muestra el exceso y no repite el aviso en cada refresh', () => {
  const { ctx, dom, toasts } = analisis({ presupuestos: { Comida: 100000 }, gastosVar: [{ id: 'g', monto: 180000, fecha: mesAct + '-03', cat: 'Comida', fuente: 'nequi' }] });
  ctx.renderPresupuestos();
  ctx.renderPresupuestos();
  const html = String(dom.el('an-presupuestos').innerHTML);
  assert.equal(toasts.filter(([m]) => m.includes('Superaste el presupuesto de Comida')).length, 1);
  assert.match(html, /\+\$?80\.000/);
  assert.match(html, /width:100%/);
});

test('presupuestos: un límite en 0 no produce NaN en la barra', () => {
  const { ctx, dom } = analisis({ presupuestos: { Ocio: 0 }, gastosVar: [] });
  ctx.renderPresupuestos();
  assert.ok(!String(dom.el('an-presupuestos').innerHTML).includes('NaN'));
});

/* ================= Push ================= */
test('F6. el chequeo de Spotify vencido lee S.spotify.personas (esquema 9) y avisa', () => {
  const { ejecutarChecks } = require('../scripts/notificaciones/checks.js');
  const S = { modulos: { spotify: true }, personas: [], spotify: { personas: [{ nombre: 'Ana', proximoPago: '2026-10-01' }] } };
  const items = ejecutarChecks(S, '2026-10-20');
  assert.ok(items.some(i => i.texto.includes('Cobro Spotify de Ana vencido')));
});

/* ================= Service Worker ================= */
test('A10. la línea de VERSION de sw.js es corta: el historial de versiones vive en CHANGELOG.md, no en un comentario de 12 KB', () => {
  const sw = require('node:fs').readFileSync(path.join(RAIZ, 'sw.js'), 'utf8');
  const linea = sw.split('\n').find(l => l.startsWith('const VERSION'));
  assert.ok(linea && linea.length < 200, 'la línea de VERSION mide ' + (linea || '').length);
  assert.match(linea, /mis-finanzas-v\d+/);
});
