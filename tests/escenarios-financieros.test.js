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
  const ctx = loadApp([CORE('core-state.js'), CORE('periodo.js'), CORE('nu-calc.js'), CORE('calc-helpers.js'), CORE('umbrales.js'), CORE('reglas.js'), CORE('salud.js'), CORE('plan-deudas.js'), MOD('inicio.js'), ...extra]);
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
  const ctx = loadApp([CORE('core-state.js'), CORE('periodo.js'), CORE('nu-calc.js'), CORE('calc-helpers.js'), CORE('html-tag.js'), CORE('cobros.js'), MOD('analisis.js')], { permissive: true });
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

/* ================= P7: gastos fijos con día de vencimiento ================= */
test('P7. Periodo.gastosFijosProgramados: días hasta el vencimiento, ordenados; vencidos con días negativos', () => {
  const ctx = app({ gastosFijos: [
    { id: 'a', nombre: 'Arriendo', monto: 900000, cat: 'Vivienda', dia: 5 },
    { id: 'b', nombre: 'Internet', monto: 80000, cat: 'Servicios', dia: 20 },
    { id: 'c', nombre: 'Gimnasio', monto: 50000, cat: 'Salud', dia: 1 },
  ] });
  const r = ctx.Periodo.gastosFijosProgramados('2026-11', '2026-11-03');
  assert.equal(JSON.stringify(r.map(g => [g.nombre, g.dias])), JSON.stringify([['Gimnasio', -2], ['Arriendo', 2], ['Internet', 17]]));
  assert.equal(r[1].fecha, '2026-11-05');
});

test('P7. un «día 31» vence el último día de un mes corto; días inválidos y gastos sin día no entran', () => {
  const ctx = app({ gastosFijos: [
    { id: 'a', nombre: 'Cuota', monto: 1, dia: 31 }, { id: 'b', nombre: 'Cero', monto: 1, dia: 0 },
    { id: 'c', nombre: 'Treinta y dos', monto: 1, dia: 32 }, { id: 'd', nombre: 'Texto', monto: 1, dia: 'x' }, { id: 'e', nombre: 'Sin día', monto: 1 },
  ] });
  const feb = ctx.Periodo.gastosFijosProgramados('2027-02', '2027-02-10');
  assert.equal(feb.length, 1);
  assert.equal(feb[0].fecha, '2027-02-28');
  assert.equal(ctx.Periodo.gastosFijosProgramados('2028-02', '2028-02-10')[0].fecha, '2028-02-29', 'bisiesto');
});

test('P7. un gasto fijo ya pagado ese mes deja de aparecer como pendiente; el del mes siguiente sí', () => {
  const ctx = app({ gastosFijos: [{ id: 'a', nombre: 'Arriendo', monto: 900000, dia: 5 }], pagosGastosFijos: { 'a_2026-11': { monto: 900000, fecha: '2026-11-02' } } });
  assert.equal(ctx.Periodo.gastosFijosProgramados('2026-11', '2026-11-03').length, 0);
  assert.equal(ctx.Periodo.gastosFijosProgramados('2026-12', '2026-11-03').length, 1);
});

test('P7. Atención avisa «vence hoy», «venció hace N días sin pagar» y la brecha de caja', () => {
  const hoyD = new Date();
  const diaHoy = hoyD.getDate();
  const ctx = app({ cuentas: cuentas(100000), gastosFijos: [
    { id: 'a', nombre: 'Arriendo', monto: 900000, dia: diaHoy },
    { id: 'b', nombre: 'Gimnasio', monto: 50000, dia: 1 },
  ] });
  const l = createHtmlTag(ctx.escHtml); ctx.html = l.html; ctx.raw = l.raw;
  const dom = createFakeDom(); ctx.document = dom.document;
  ctx.renderAttencion();
  const t = String(dom.el('s-attn-list').innerHTML);
  assert.match(t, /Arriendo vence hoy/);
  if (diaHoy >= 2) assert.match(t, /Gimnasio venció hace \d+ días? y no está pagado/);
  assert.match(t, /tu plata disponible quedaría en -\$?850\.000 \(vence Arriendo: \$?900\.000\)/, '100.000 − 900.000 de arriendo − 50.000 del gimnasio vencido, el mismo día');
});

test('P7. con la plata alcanzando y sin vencimientos cerca, no hay alertas de gastos fijos', () => {
  const ctx = app({ cuentas: cuentas(5000000), gastosFijos: [{ id: 'a', nombre: 'Arriendo', monto: 900000 }] });
  const l = createHtmlTag(ctx.escHtml); ctx.html = l.html; ctx.raw = l.raw;
  const dom = createFakeDom(); ctx.document = dom.document;
  ctx.renderAttencion();
  assert.ok(!/vence|venció|próximos 7 días/.test(String((dom.el('s-attn-list') || {}).innerHTML || '')));
});

/* ================= P7b: día esperado de ingresos fijos y edición de gastos fijos ================= */
test('P7b. Periodo.diaDelMes: recorta al último día, cuenta días y rechaza lo que no es 1–31', () => {
  const { Periodo } = app();
  assert.equal(JSON.stringify(Periodo.diaDelMes(30, '2026-11', '2026-11-03')), JSON.stringify({ dia: 30, fecha: '2026-11-30', dias: 27 }));
  assert.equal(Periodo.diaDelMes(31, '2027-02', '2027-02-10').fecha, '2027-02-28');
  assert.equal(Periodo.diaDelMes(1, '2026-11', '2026-11-03').dias, -2);
  [0, 32, 'x', null, undefined, 1.5].forEach(v => assert.equal(Periodo.diaDelMes(v, '2026-11', '2026-11-03'), null, String(v)));
});

function atencionConIngresos(sObj) {
  const ctx = app(sObj, [CORE('cobros.js')]);
  const l = createHtmlTag(ctx.escHtml); ctx.html = l.html; ctx.raw = l.raw;
  const dom = createFakeDom(); ctx.document = dom.document;
  ctx.renderAttencion();
  return String((dom.el('s-attn-list') || {}).innerHTML || '');
}

test('P7b. un ingreso fijo con día esperado que ya pasó y sin cobro registrado este mes avisa', () => {
  if (new Date().getDate() < 2) return; // el día 1 no hay un «día 1» ya pasado
  const t = atencionConIngresos({ cuentas: cuentas(5000000), ingresosFijos: [{ id: 'i', nombre: 'Sueldo', monto: 2000000, desde: '2020-01', dia: 1 }] });
  assert.match(t, /Sueldo debía llegar el día 1 y aún no lo registras/);
});

test('P7b. con un cobro de este mes registrado, o sin día esperado, o con el día todavía por llegar, no avisa', () => {
  if (new Date().getDate() < 2) return;
  const cobrado = atencionConIngresos({ cuentas: cuentas(5000000), ingresosFijos: [{ id: 'i', nombre: 'Sueldo', monto: 2000000, desde: '2020-01', dia: 1, cobros: [{ id: 'c', mesCubre: mesAct, monto: 2000000, fecha: mesAct + '-01' }] }] });
  assert.ok(!/debía llegar/.test(cobrado));
  const sinDia = atencionConIngresos({ cuentas: cuentas(5000000), ingresosFijos: [{ id: 'i', nombre: 'Sueldo', monto: 2000000, desde: '2020-01' }] });
  assert.ok(!/debía llegar/.test(sinDia));
  const futuro = atencionConIngresos({ cuentas: cuentas(5000000), ingresosFijos: [{ id: 'i', nombre: 'Sueldo', monto: 2000000, desde: '2020-01', dia: 31 }] });
  assert.ok(!/debía llegar/.test(futuro) || new Date().getDate() >= 28, 'el día 31 todavía no pasó');
  const aunNoEmpieza = atencionConIngresos({ cuentas: cuentas(5000000), ingresosFijos: [{ id: 'i', nombre: 'Sueldo', monto: 2000000, desde: '2099-01', dia: 1 }] });
  assert.ok(!/debía llegar/.test(aunNoEmpieza), 'todavía no lo esperas (desde en el futuro)');
});

/* ---- editar un gasto fijo (gastos.js) ---- */
function gastosApp(sObj) {
  const ctx = loadApp([CORE('core-state.js'), CORE('periodo.js'), CORE('nu-calc.js'), CORE('calc-helpers.js'), CORE('html-tag.js'), CORE('umbrales.js'), CORE('reglas.js'), CORE('salud.js'), CORE('plan-deudas.js'), MOD('inicio.js'), MOD('gastos.js')], { permissive: true });
  Object.assign(ctx.S, sObj);
  const valores = {};
  const el = id => (valores[id] = valores[id] || { value: '', textContent: '', classList: { add() {}, remove() {} } });
  ctx.document = { getElementById: id => el(id), querySelectorAll: () => [], querySelector: () => null };
  ctx.window.document = ctx.document;
  const toasts = []; ctx.toast = (m, t) => toasts.push(m); ctx.poblarCatSelect = () => {};
  ctx.openSheet = () => {}; ctx.closeSheet = () => {}; ctx.save = () => {}; ctx.refresh = () => {};
  return { ctx, el, toasts };
}

test('P7b. editar un gasto fijo cambia el día sin crear otro, conserva el id y no toca los pagos ya registrados', () => {
  const { ctx, el, toasts } = gastosApp({ gastosFijos: [{ id: 'a', nombre: 'Arriendo', monto: 900000, cat: 'Vivienda' }], pagosGastosFijos: { 'a_2026-10': { monto: 900000, fecha: '2026-10-05' } } });
  ctx.abrirEditarGastoFijo('a');
  assert.equal(el('gf_n').value, 'Arriendo');
  assert.equal(el('gf-sheet-title').textContent, 'Editar gasto fijo');
  el('gf_d').value = '5';
  el('gf_m').value = '950.000,00';
  ctx.addGastoFijo();
  assert.equal(ctx.S.gastosFijos.length, 1);
  assert.equal(ctx.S.gastosFijos[0].id, 'a');
  assert.equal(ctx.S.gastosFijos[0].dia, 5);
  assert.equal(ctx.S.pagosGastosFijos['a_2026-10'].monto, 900000, 'el pago de octubre conserva su monto');
  assert.ok(toasts.includes('Gasto fijo actualizado'));
});

test('P7b. dejar el día vacío al editar lo quita; un día fuera de 1–31 se rechaza y no cambia nada', () => {
  const { ctx, el, toasts } = gastosApp({ gastosFijos: [{ id: 'a', nombre: 'Arriendo', monto: 900000, cat: 'Vivienda', dia: 5 }] });
  ctx.abrirEditarGastoFijo('a');
  el('gf_d').value = '40';
  ctx.addGastoFijo();
  assert.equal(ctx.S.gastosFijos[0].dia, 5);
  assert.ok(toasts.some(m => m.includes('entre 1 y 31')));
  el('gf_d').value = '';
  ctx.addGastoFijo();
  assert.ok(!('dia' in ctx.S.gastosFijos[0]));
});

test('P7b. un gasto fijo nuevo después de editar otro NO sobrescribe al editado', () => {
  const { ctx, el } = gastosApp({ gastosFijos: [{ id: 'a', nombre: 'Arriendo', monto: 900000, cat: 'Vivienda' }] });
  ctx.abrirEditarGastoFijo('a');
  ctx.abrirNuevoGastoFijo();
  el('gf_n').value = 'Internet'; el('gf_m').value = '80.000,00'; el('gf_c').value = 'Servicios';
  ctx.addGastoFijo();
  assert.equal(ctx.S.gastosFijos.length, 2);
  assert.equal(ctx.S.gastosFijos[0].nombre, 'Arriendo');
});

/* ================= Compra grande (una moto): golpe real al stock, no un hábito del flujo ================= */
const moto = (monto, mes, extra = {}) => ({ id: 'moto', desc: 'Moto', monto, fecha: mes + '-10', cat: 'Transporte', fuente: 'nequi', clase: 'gasto', ...extra });
// 3 meses de ingreso 3 M y gasto fijo 1 M; ahorro de `ahorro` DESPUÉS de comprar la moto el mes pasado.
// grande: true = la marcó el usuario · false = el usuario dijo que NO es compra grande · undefined = sin decisión (la app la detecta)
const conMoto = (grande, ahorro = 5000000) => ({
  cuentas: cuentas(ahorro),
  ingresosFijos: ingresosEn(3000000, ultimosN(6)),
  ...gastosEn(1000000, ultimosN(3)),
  gastosVar: [moto(15000000, mesHace(1), grande === undefined ? {} : { grande })],
});

test('Compra grande: el gasto real del mes la cuenta completa, y separa lo recurrente y lo extraordinario', () => {
  const ctx = app(conMoto(true));
  const g = ctx.Periodo.gastosDelMes(mesHace(1));
  assert.equal(g.total, 16000000, 'total real: 1 M de fijos + 15 M de moto');
  assert.equal(g.extraTotal, 15000000);
  assert.equal(g.recurrenteTotal, 1000000);
  const b = ctx.Periodo.balanceDelMes(mesHace(1));
  assert.equal(b.balance, 3000000 - 16000000, 'el balance real sigue mostrando el golpe');
  assert.equal(b.balanceRecurrente, 2000000, 'el ritmo del mes sin la moto');
});

test('Compra grande: el gasto TÍPICO no se infla con la moto (y sin la marca sí)', () => {
  assert.equal(app(conMoto(true)).Periodo.gastoPromedioPrevio(mesAct, 3).promedio, 1000000);
  assert.ok(app(conMoto(false)).Periodo.gastoPromedioPrevio(mesAct, 3).promedio > 1000000, 'si el usuario dijo que NO es compra grande, se respeta: la moto cuenta como gasto habitual');
});

test('Compra grande: el golpe es REAL en Salud (runway sobre la liquidez que queda) y no se lee como déficit habitual', () => {
  const marcada = score(conMoto(true));
  const sinMarca = score(conMoto(false));
  assert.equal(marcada.mesesCubiertos, 5, '5 M que quedan ÷ 1 M de gasto típico: la moto ya bajó la liquidez');
  assert.ok(!marcada.tips.some(t => t.includes('gastando más de lo que ingresas')), 'un mes con moto no es un hábito de déficit');
  assert.equal(marcada.rachaDeficit, 0);
  assert.ok(sinMarca.mesesCubiertos < marcada.mesesCubiertos, 'sin marcar, el gasto típico se infla y el runway se subestima');
  assert.ok(marcada.score > sinMarca.score);
});

test('Compra grande: la racha de déficit usa el balance recurrente (una moto sola no cuenta como racha)', () => {
  const ctx = app({ ingresosFijos: ingresosEn(3000000, ultimosN(6)), ...gastosEn(1000000, ultimosN(6)), gastosVar: [moto(15000000, mesHace(1), { grande: true }), moto(15000000, mesHace(2), { grande: true, id: 'm2' })] });
  assert.equal(ctx.Periodo.rachaDeficit(mesAct, 6).meses, 0);
  const sin = app({ ingresosFijos: ingresosEn(3000000, ultimosN(6)), ...gastosEn(1000000, ultimosN(6)), gastosVar: [moto(15000000, mesHace(1), { grande: false }), moto(15000000, mesHace(2), { id: 'm2', grande: false })] });
  assert.equal(sin.Periodo.rachaDeficit(mesAct, 6).meses, 2, 'si el usuario dijo que no son compras grandes, son dos meses de «déficit»');
});

test('Compra grande reciente que dejó las reservas bajas: Salud la nombra y dice qué hacer', () => {
  const r = score(conMoto(true, 1500000));
  assert.ok(r.tips.some(t => t.includes('Tu compra grande reciente (Moto') && t.includes('reconstruir tu fondo')));
  const holgado = score(conMoto(true, 20000000));
  assert.ok(!holgado.tips.some(t => t.includes('compra grande reciente')), 'con fondo sólido no hace falta');
});

test('Impacto antes de comprar: qué parte de lo disponible es y cuántos meses cubrirías después', () => {
  const ctx = app({ cuentas: cuentas(20000000), ingresosFijos: ingresosEn(3000000, ultimosN(6)), ...gastosEn(1000000, ultimosN(3)) });
  assert.equal(ctx.calcImpactoCompra(100000), null, 'bajo el mínimo no hay nada que advertir');
  const i = ctx.calcImpactoCompra(15000000);
  assert.equal(i.grande, true);
  assert.equal(i.pctLiquidez, 0.75);
  assert.equal(i.antes, 20); assert.equal(i.despues, 5);
  assert.match(i.texto, /Es el 75 % de tu plata disponible/);
  assert.match(i.texto, /Después cubrirías 5,0 meses de gastos \(hoy: 20,0 meses\)/);
  assert.equal(i.nivel, 'gris');
  const justo = ctx.calcImpactoCompra(19500000);
  assert.equal(justo.nivel, 'red', 'queda menos de 1 mes de gastos');
  const pasado = ctx.calcImpactoCompra(25000000);
  assert.equal(pasado.nivel, 'red'); assert.match(pasado.texto, /tus deudas superarían tu plata disponible en/);
  const pequeno = ctx.calcImpactoCompra(1000000);
  assert.equal(pequeno.grande, false, '1 M de 20 M no es una compra grande');
});

test('Impacto antes de comprar: sin gasto típico solo dice el porcentaje; pagar con tarjeta pesa igual que pagar de una cuenta', () => {
  const sinHist = app({ cuentas: cuentas(10000000) }).calcImpactoCompra(6000000);
  assert.equal(sinHist.despues, null);
  assert.match(sinHist.texto, /Es el 60 % de tu plata disponible/);
  assert.ok(!sinHist.texto.includes('cubrirías'));
  const conTarjeta = app({ cuentas: cuentas(10000000), tarjetasCredito: [{ id: 't', nombre: 'TC', deuda: 4000000, cupo: 20000000 }] }).calcImpactoCompra(6000000);
  assert.equal(conTarjeta.netaDespues, 10000000 - 4000000 - 6000000, 'la deuda propia ya resta de la liquidez, igual que la salida de una cuenta');
});

test('Proyección: una compra grande marcada no se extrapola como ritmo, y se dice con claridad', () => {
  const dias = 100;
  const hist = historial(dias, 3000000, 10000);              // sube 10.000/día
  hist.forEach((p, i) => { if (i >= 50) { p.valor -= 5000000; p.valorVisible -= 5000000; } }); // la moto cae el día 50
  const fechaMoto = hist[50].fecha;
  const base = { cuentas: cuentas(3000000), patrimonioHistorial: hist };
  const marcada = proyeccion({ ...base, gastosVar: [{ id: 'm', desc: 'Moto <x>', monto: 5000000, fecha: fechaMoto, cat: 'Transporte', fuente: 'nequi', clase: 'gasto', grande: true }] });
  assert.ok(marcada.includes('ESTABLE'), 'sin la moto el ritmo fue consistente en los tres tercios');
  assert.match(marcada, /Sin contar tu compra grande \(Moto &lt;x&gt;: \$?5\.000\.000\)/, 'escapa el nombre');
  assert.match(marcada, /\+\$?300\.000 al mes/, '10.000/día × 30');
  assert.match(marcada, /data-proy-key="3m"[^>]*data-proy-val="3900000"/, 'patrimonio de hoy + 3 × 300.000');
  const sinMarca = proyeccion({ ...base, gastosVar: [{ id: 'm', desc: 'Moto', monto: 5000000, fecha: fechaMoto, cat: 'Transporte', fuente: 'nequi', clase: 'gasto' }] });
  assert.ok(!sinMarca.includes('ESTABLE'));
  assert.ok(!sinMarca.includes('Sin contar tu compra grande'));
});

test('Gastos: la casilla «compra grande» sigue a la sugerencia del monto hasta que el usuario decide', () => {
  const { ctx, el } = gastosApp({ cuentas: cuentas(20000000), ingresosFijos: ingresosEn(3000000, ultimosN(6)), ...gastosEn(1000000, ultimosN(3)) });
  const chk = el('gv_grande');
  el('gv_monto').value = '15.000.000,00';
  ctx.actualizarGvImpacto();
  assert.equal(chk.checked, true, 'sugerida: es el 75 % de lo disponible');
  assert.match(el('gv-impacto').textContent, /Es el 75 %/);
  el('gv_monto').value = '60.000,00';
  ctx.actualizarGvImpacto();
  assert.equal(chk.checked, false);
  assert.equal(el('gv-impacto').textContent, '');
});

test('Gastos: marcar o quitar «grande» guarda siempre una decisión explícita (true/false)', () => {
  const { ctx, toasts } = gastosApp({ gastosVar: [{ id: 'g1', desc: 'Moto', monto: 15000000, fecha: mesAct + '-02', cat: 'Transporte', clase: 'gasto' }] });
  ctx.toggleCompraGrande('g1');
  assert.equal(ctx.S.gastosVar[0].grande, true);
  assert.ok(toasts.some(m => m.includes('compra grande')));
  ctx.toggleCompraGrande('g1');
  assert.equal(ctx.S.gastosVar[0].grande, false, 'dijo que no: se guarda false, no se borra (si no, la detección automática podría volver a marcarla)');
});

test('Análisis: el balance del mes muestra la compra grande incluida y cómo habría sido sin ella (sin esconder el golpe)', () => {
  const { ctx, dom } = analisis({ cuentas: cuentas(5000000), ingresosFijos: ingresosEn(3000000, [mesAct, ...ultimosN(6)]), ...gastosEn(1000000, [mesAct, ...ultimosN(3)]), gastosVar: [moto(15000000, mesAct, { grande: true })] });
  ctx.document.getElementById = id => dom.el(id);
  ctx.renderAnalisis();
  const h = String(dom.el('analisis-balance-hero').innerHTML);
  assert.match(h, /Incluye \$?15\.000\.000 en una compra grande \(Moto\)/);
  assert.match(h, /sin ella, tu balance del mes fue/);
  assert.match(h, /Por ahora has gastado más de lo que has recibido este mes/, 'el estado real sigue siendo el real');
});

/* ---- Detección automática de la compra grande (el usuario manda; si no dijo nada, se detecta) ---- */
// 6 meses de historia con 1 M de gasto fijo al mes
const historia6 = () => ({ ingresosFijos: ingresosEn(3000000, ultimosN(6)), ...gastosEn(1000000, ultimosN(6)) });

test('Compra grande automática: un gasto que supera tu gasto mensual normal se detecta solo, sin que marques nada', () => {
  const ctx = app({ ...historia6(), gastosVar: [moto(15000000, mesHace(1))] });
  const P = ctx.Periodo;
  assert.equal(P.umbralCompraGrande(), 1000000, 'la mediana de tu gasto mensual (los meses anteriores)');
  assert.equal(P.compraGrandeEstado(ctx.S.gastosVar[0], P.umbralCompraGrande()), 'auto');
  assert.equal(P.gastoPromedioPrevio(mesAct, 3).promedio, 1000000, 'sin que marques nada, la moto no infla tu gasto típico');
  assert.equal(P.gastosDelMes(mesHace(1)).extraTotal, 15000000);
  assert.equal(P.rachaDeficit(mesAct, 6).meses, 0);
});

test('Compra grande automática: lo que decide el usuario manda, en los dos sentidos, y no cambia sola', () => {
  const si = app({ ...historia6(), gastosVar: [moto(600000, mesHace(1), { grande: true })] });
  assert.equal(si.Periodo.compraGrandeEstado(si.S.gastosVar[0], si.Periodo.umbralCompraGrande()), 'si', 'marcado a mano, aunque no pase el umbral');
  const no = app({ ...historia6(), gastosVar: [moto(15000000, mesHace(1), { grande: false })] });
  assert.equal(no.Periodo.compraGrandeEstado(no.S.gastosVar[0], no.Periodo.umbralCompraGrande()), 'no', 'dijo que NO: se respeta aunque sea una moto');
  assert.equal(no.Periodo.gastosDelMes(mesHace(1)).extraTotal, 0);
});

test('Compra grande automática: no se detecta sola sin historia suficiente, bajo el mínimo, ni en retiros manuales', () => {
  const sinHist = app({ gastosVar: [moto(15000000, mesHace(1))] });
  assert.equal(sinHist.Periodo.umbralCompraGrande(), Infinity, 'con menos de 2 meses completos no hay con qué juzgar');
  assert.equal(sinHist.Periodo.compraGrandeEstado(sinHist.S.gastosVar[0], sinHist.Periodo.umbralCompraGrande()), 'no');
  const ctx = app({ ...historia6() });
  assert.equal(ctx.Periodo.umbralCompraGrande(), 1000000);
  assert.equal(ctx.Periodo.compraGrandeEstado({ monto: 400000 }, 100), 'no', 'bajo el mínimo de 500.000 nunca');
  assert.equal(ctx.Periodo.compraGrandeEstado({ monto: 5000000, _esRetiroManual: true }, 1000000), 'no', 'un retiro manual para cuadrar no es una compra');
  assert.equal(ctx.Periodo.COMPRA_GRANDE_AUTO.minimo, ctx.UMBRALES.compraGrande.minimo, 'una sola cifra de mínimo en periodo.js y umbrales.js');
});

test('Compra grande automática: la mediana no se mueve con la moto, así que un gasto normal sigue siendo normal', () => {
  const ctx = app({ ...historia6(), gastosVar: [moto(15000000, mesHace(2)), { id: 'c', desc: 'Mercado', monto: 700000, fecha: mesHace(3) + '-05', cat: 'Alimentación', clase: 'gasto' }] });
  assert.equal(ctx.Periodo.umbralCompraGrande(), 1000000 + 0, 'mediana de los meses anteriores: robusta a un mes con moto');
  const mercado = ctx.S.gastosVar[1];
  assert.equal(ctx.Periodo.compraGrandeEstado(mercado, ctx.Periodo.umbralCompraGrande()), 'no');
});

test('Compra grande automática: la Proyección y Salud la tratan igual que a una marcada, y la lista dice «automática»', () => {
  const r = score({ cuentas: cuentas(5000000), ...historia6(), gastosVar: [moto(15000000, mesHace(1))] });
  assert.equal(r.mesesCubiertos, 5, 'el golpe es real y el gasto típico no se infla');
  assert.ok(r.tips.some(t => t.includes('Tu compra grande reciente (Moto')));
  const h = proyeccion({ cuentas: cuentas(3000000), patrimonioHistorial: (() => { const x = historial(100, 3000000, 10000); x.forEach((p, i) => { if (i >= 50) { p.valor -= 5000000; p.valorVisible -= 5000000; } }); return x; })(), ...historia6(), gastosVar: [{ id: 'm', desc: 'Moto', monto: 5000000, fecha: historial(100, 0, 0)[50].fecha, cat: 'Transporte', fuente: 'nequi', clase: 'gasto' }] });
  assert.match(h, /Sin contar tu compra grande \(Moto/, 'detectada sola');
});

/* ================= P5.2: bienes (una moto vale algo, pero va aparte) ================= */
const haceAnios = n => { const d = new Date(); d.setFullYear(d.getFullYear() - n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

test('Bienes: el valor baja con la depreciación anual compuesta desde su fecha; sin depreciación se queda igual; nunca por debajo de 0', () => {
  const ctx = app();
  assert.equal(ctx.calcValorBien({ valor: 15000000, fecha: haceAnios(3) }), 15000000, 'sin depreciación, vale lo que dijiste');
  assert.equal(ctx.calcValorBien({ valor: 10000000, fecha: haceAnios(1), depreciacionAnual: 15 }) / 1000000 | 0, 8, '≈ 8,5 M tras un año al 15 %');
  const dosAnios = ctx.calcValorBien({ valor: 10000000, fecha: haceAnios(2), depreciacionAnual: 10 });
  assert.ok(Math.abs(dosAnios - 8100000) < 40000, 'compuesto: 10 M × 0,9² = 8,1 M, no 8 M');
  assert.equal(ctx.calcValorBien({ valor: 10000000, fecha: '2999-01-01', depreciacionAnual: 20 }), 10000000, 'una fecha futura no revaloriza');
  assert.equal(ctx.calcValorBien({ valor: 10000000, fecha: haceAnios(5), depreciacionAnual: 100 }), 0);
  assert.ok(Number.isFinite(ctx.calcValorBien({ valor: 5, fecha: 'basura', depreciacionAnual: 10 })), 'una fecha ilegible no produce NaN');
});

test('Bienes: van APARTE: no cambian el patrimonio del inicio, ni la liquidez, ni el runway, ni la Salud', () => {
  const base = { cuentas: cuentas(5000000), ...gastosEn(1000000, ultimosN(3)), ingresosFijos: ingresosEn(3000000, ultimosN(3)) };
  const sin = app(base);
  const con = app({ ...base, bienes: [{ id: 'b', nombre: 'Moto', valor: 15000000, fecha: haceAnios(0) }] });
  assert.equal(con.calcPatrimonioVisible(), sin.calcPatrimonioVisible(), 'el hero no cambia');
  assert.equal(con.calcPatrimonioTotal(), sin.calcPatrimonioTotal());
  assert.equal(con.calcLiquidez().neta, sin.calcLiquidez().neta, 'un bien no se puede gastar sin venderlo');
  assert.equal(JSON.stringify(con.calcHealthScore()), JSON.stringify(sin.calcHealthScore()), 'la Salud ni lo mira');
  assert.equal(con.calcPatrimonioConBienes(), 5000000 + 15000000, 'solo el patrimonio CON bienes los suma');
  assert.equal(con.calcBienes().total, 15000000);
});

test('Bienes: la moto marcada como compra grande baja el patrimonio financiero (el golpe se ve) y el bien aparece aparte', () => {
  const ctx = app({ cuentas: cuentas(5000000), bienes: [{ id: 'b', nombre: 'Moto', valor: 14000000, fecha: haceAnios(0), origenGastoId: 'moto' }] });
  assert.equal(ctx.calcPatrimonioVisible(), 5000000, 'después de pagar 15 M, queda lo que queda');
  assert.equal(ctx.calcPatrimonioConBienes(), 19000000, 'con la moto, a su valor estimado (menos que lo que costó)');
});

test('Bienes: abrir desde un gasto pre-llena nombre, valor y fecha; guardar enlaza el gasto de origen', () => {
  const { ctx, el, toasts } = gastosApp({ gastosVar: [{ id: 'moto', desc: 'Moto', monto: 15000000, fecha: '2026-10-20', cat: 'Transporte', clase: 'gasto', grande: true }] });
  ctx.abrirSheetBien('moto');
  assert.equal(el('bien_n').value, 'Moto');
  assert.equal(el('bien_f').value, '2026-10-20');
  assert.match(el('bien_v').value, /15\.000\.000/);
  assert.equal(el('bien-sheet-title').textContent, 'Registrar bien');
  el('bien_d').value = '15,5';
  ctx.guardarBien();
  assert.equal(ctx.S.bienes.length, 1);
  assert.equal(ctx.S.bienes[0].origenGastoId, 'moto');
  assert.equal(ctx.S.bienes[0].valor, 15000000);
  assert.equal(ctx.S.bienes[0].depreciacionAnual, 15.5);
  assert.ok(toasts.some(m => m.includes('Bien registrado')));
});

test('Bienes: validaciones (nombre, valor, fecha, depreciación 0–100) y la edición conserva el id sin duplicar', () => {
  const { ctx, el, toasts } = gastosApp({ bienes: [{ id: 'b1', nombre: 'Moto', valor: 14000000, fecha: '2026-10-20', depreciacionAnual: 10 }] });
  ctx.abrirSheetBien();
  ctx.guardarBien(); assert.ok(toasts.at(-1).includes('nombre'));
  el('bien_n').value = 'PC'; ctx.guardarBien(); assert.ok(toasts.at(-1).includes('valor'));
  el('bien_v').value = '3.000.000,00'; el('bien_f').value = ''; ctx.guardarBien(); assert.ok(toasts.at(-1).includes('fecha'));
  el('bien_f').value = '2026-11-01'; el('bien_d').value = '120'; ctx.guardarBien(); assert.ok(toasts.at(-1).includes('entre 0 y 100'));
  assert.equal(ctx.S.bienes.length, 1, 'nada se guardó mientras algo era inválido');
  ctx.abrirEditarBien('b1');
  assert.equal(el('bien_n').value, 'Moto'); assert.equal(el('bien_d').value, '10');
  assert.equal(el('bien-sheet-title').textContent, 'Editar bien');
  el('bien_v').value = '12.000.000,00'; el('bien_d').value = '';
  ctx.guardarBien();
  assert.equal(ctx.S.bienes.length, 1); assert.equal(ctx.S.bienes[0].id, 'b1'); assert.equal(ctx.S.bienes[0].valor, 12000000);
  assert.ok(!('depreciacionAnual' in ctx.S.bienes[0]), 'dejar la depreciación vacía la quita');
});

test('Bienes: quitar un bien no toca el gasto con el que se compró', async () => {
  const { ctx } = gastosApp({ gastosVar: [{ id: 'moto', desc: 'Moto', monto: 15000000, fecha: '2026-10-20', clase: 'gasto', grande: true }], bienes: [{ id: 'b', nombre: 'Moto', valor: 1, fecha: '2026-10-20', origenGastoId: 'moto' }] });
  ctx.dialogo = async () => true;
  await ctx.eliminarBien('b');
  assert.equal(ctx.S.bienes.length, 0);
  assert.equal(ctx.S.gastosVar.length, 1);
});

test('Bienes: la tarjeta de Análisis solo aparece si hay bienes, muestra el valor aparte y escapa el nombre', () => {
  const vacio = analisis({ cuentas: cuentas(5000000) });
  vacio.ctx.document.getElementById = id => vacio.dom.el(id);
  vacio.ctx.renderBienes();
  assert.equal(String(vacio.dom.el('an-bienes').innerHTML), '');
  const { ctx, dom } = analisis({ cuentas: cuentas(5000000), bienes: [{ id: 'b', nombre: 'Moto <b>', valor: 15000000, fecha: haceAnios(0), depreciacionAnual: 12 }] });
  ctx.document.getElementById = id => dom.el(id);
  ctx.renderBienes();
  const h = String(dom.el('an-bienes').innerHTML);
  assert.match(h, /Moto &lt;b&gt;/);
  assert.match(h, /Valor estimado de tus bienes/);
  assert.match(h, /Patrimonio con bienes/);
  assert.match(h, /20\.000\.000/, '5 M en cuentas + 15 M de moto');
  assert.match(h, /Se deprecia 12 % al año/);
  assert.match(h, /no cuenta en tu plata disponible/);
});

test('Bienes: el respaldo con bienes que no son un array se rechaza al importar', () => {
  const ctx = loadApp([CORE('core-state.js'), MOD('configuracion.js')], { permissive: true });
  const errores = ctx._validarEstructuraJSON({ cuentas: [], bienes: 'no-array' });
  assert.ok(errores.some(e => e.includes('"bienes" debe ser un array')));
  assert.equal(ctx._validarEstructuraJSON({ cuentas: [], bienes: [] }).length, 0);
});

/* ================= Calendario de caja a 30 días (lo ya programado) ================= */
test('Calendario: Periodo.saldoProyectado netea cada día, mira solo el horizonte, calcula el mínimo y el primer déficit', () => {
  const { Periodo } = app();
  const ev = [
    { fecha: '2026-11-05', monto: -900000, texto: 'Arriendo' },
    { fecha: '2026-11-05', monto: 2000000, texto: 'Sueldo' },      // mismo día: se netea (no se sabe el orden)
    { fecha: '2026-11-12', monto: -1500000, texto: 'Seguro' },
    { fecha: '2026-11-20', monto: 500000, texto: 'CDT' },
    { fecha: '2026-12-30', monto: -9999999, texto: 'Fuera del horizonte' },
    { fecha: '2026-11-02', monto: -5, texto: 'Ya pasó' },
  ];
  const r = Periodo.saldoProyectado(300000, ev, '2026-11-03', 30);
  assert.equal(r.limite, '2026-12-03');
  assert.equal(r.puntos.length, 3);
  assert.equal(r.puntos[0].saldo, 300000 - 900000 + 2000000, 'entradas y salidas del mismo día se netean: sin falso déficit');
  assert.equal(r.puntos[1].saldo, 1400000 - 1500000);
  assert.equal(r.final, -100000 + 500000);
  assert.equal(JSON.stringify(r.minimo), JSON.stringify({ fecha: '2026-11-12', saldo: -100000 }));
  assert.equal(r.primerDeficit.fecha, '2026-11-12');
  assert.equal(r.primerDeficit.evento.texto, 'Seguro', 'lo que lo causó: la mayor salida de ese día');
});

test('Calendario: si el saldo ya es negativo hoy no es una «sorpresa futura»; sin eventos no hay puntos', () => {
  const { Periodo } = app();
  assert.equal(Periodo.saldoProyectado(-50000, [{ fecha: '2026-11-05', monto: -1, texto: 'x' }], '2026-11-03', 30).primerDeficit, null);
  const vacio = Periodo.saldoProyectado(1000, [], '2026-11-03', 30);
  assert.equal(vacio.puntos.length, 0); assert.equal(vacio.final, 1000); assert.equal(vacio.primerDeficit, null);
});

const hoyISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

test('Calendario: _eventosCaja usa gastos fijos sin pagar (el vencido, hoy), ingresos esperados por llegar y CDT que vencen; no el ingreso atrasado ni lo pagado', () => {
  const hoyD = new Date(), dia = hoyD.getDate();
  const ctx = app({ cuentas: cuentas(100000),
    gastosFijos: [{ id: 'a', nombre: 'Arriendo', monto: 900000, dia }, { id: 'p', nombre: 'Pagado', monto: 1, dia }, { id: 's', nombre: 'Sin día', monto: 5 }],
    pagosGastosFijos: { ['p_' + mesAct]: { monto: 1, fecha: hoyISO() } },
    ingresosFijos: [{ id: 'i', nombre: 'Sueldo', monto: 2000000, desde: '2020-01', dia }],
    cajitas: cdt({ vence: (() => { const d = new Date(); d.setDate(d.getDate() + 10); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })() }) }, [CORE('cobros.js')]);
  const ev = ctx._eventosCaja(hoyISO(), 30);
  const textos = ev.map(e => e.texto);
  assert.ok(textos.includes('Arriendo'));
  assert.ok(!ev.some(e => e.texto === 'Pagado' && e.fecha.startsWith(mesAct)), 'pagado este mes: no sale otra vez este mes (sí recurre el mes siguiente si cae en el horizonte)');
  assert.ok(!textos.includes('Sin día'));
  assert.ok(textos.includes('Sueldo'), 'ingreso esperado hoy y sin cobrar');
  assert.ok(textos.some(t => t.startsWith('CDT de')), 'CDT que vence dentro del horizonte');
  const cdtEv = ev.find(e => e.tipo === 'cdt');
  assert.ok(cdtEv.monto > 1000000, 'capital + rendimiento');
});

test('Calendario: un ingreso fijo atrasado NO se da por hecho como entrada (igual que lo que te deben)', () => {
  if (new Date().getDate() < 2) return;
  const ctx = app({ cuentas: cuentas(100000), ingresosFijos: [{ id: 'i', nombre: 'Sueldo', monto: 2000000, desde: '2020-01', dia: 1 }] }, [CORE('cobros.js')]);
  assert.ok(!ctx._eventosCaja(hoyISO(), 30).some(e => e.texto === 'Sueldo' && e.fecha <= hoyISO()));
});

test('Calendario: con el sueldo el mismo día que el arriendo no hay déficit; sin el sueldo, sí (y Atención lo dice con el día y la causa)', () => {
  const dia = new Date().getDate();
  const base = { cuentas: cuentas(100000), gastosFijos: [{ id: 'a', nombre: 'Arriendo', monto: 900000, dia }] };
  const sinSueldo = atencionConIngresos(base);
  assert.match(sinSueldo, /tu plata disponible quedaría en -\$?800\.000 \(vence Arriendo/);
  const conSueldo = atencionConIngresos({ ...base, ingresosFijos: [{ id: 'i', nombre: 'Sueldo', monto: 2000000, desde: '2020-01', dia }] });
  assert.ok(!/tu plata disponible quedaría/.test(conSueldo), 'el sueldo del mismo día cubre el arriendo');
});

test('Calendario: la Proyección lo muestra aunque no haya historial (de a cuánto pasa tu plata, lo más bajo y el día del déficit)', () => {
  const dia = new Date().getDate();
  const h = proyeccion({ cuentas: cuentas(100000), gastosFijos: [{ id: 'a', nombre: 'Arriendo <x>', monto: 900000, dia }] });
  assert.match(h, /Próximos 30 días, con lo ya programado/);
  assert.match(h, /pasaría de \$?100\.000 a -/, 'termina en negativo: el gasto fijo recurre el mes siguiente si cae dentro de los 30 días');
  assert.match(h, /quedaría en -\$?800\.000 \(vence Arriendo &lt;x&gt;\)/, 'escapa el nombre');
});

/* ================= Reglas compartidas (reglas.js), pilares y estado en la app ================= */
function pintarAtencion(ctx) {
  const l = createHtmlTag(ctx.escHtml); ctx.html = l.html; ctx.raw = l.raw;
  const dom = createFakeDom(); ctx.document = dom.document;
  ctx.renderAttencion();
  return String((dom.el('s-attn-list') || {}).innerHTML || '');
}

test('B6. Atención lista el patrimonio negativo (antes solo el hero lo mostraba en rojo)', () => {
  const t = pintarAtencion(app({ cuentas: cuentas(100000), misDeudas: yoDebo(900000) }));
  assert.match(t, /Tu patrimonio es negativo: debes/);
});

test('B6. Periodo.gastosFijosSinDia: solo los fijos sin día y sin pagar en el mes', () => {
  const { Periodo } = app({ gastosFijos: [
    { id: 'a', nombre: 'Arriendo', monto: 900000 },            // sin día, sin pagar → entra
    { id: 'b', nombre: 'Gas', monto: 60000 },                    // sin día, pagado → no
    { id: 'c', nombre: 'Gym', monto: 50000, dia: 3 },            // con día → lo cubre gastosFijosProgramados
  ], pagosGastosFijos: { ['b_' + mesAct]: { monto: 60000, fecha: mesAct + '-02' } } });
  assert.deepEqual(Periodo.gastosFijosSinDia(mesAct).map(g => g.nombre), ['Arriendo']);
  assert.deepEqual(Periodo.gastosFijosSinDia(mesHace(1)).map(g => g.nombre), ['Arriendo', 'Gas'], 'otro mes: ninguno está pagado');
});

test('B6. «Ya es N y el arriendo no está pagado»: solo desde el día configurado y solo sin día de vencimiento', () => {
  const dia = new Date().getDate();
  const t = pintarAtencion(app({ cuentas: cuentas(5000000), gastosFijos: [{ id: 'a', nombre: 'Arriendo', monto: 900000 }] }));
  const hay = /Arriendo aún no está pagado este mes/.test(t);
  assert.equal(hay, dia >= 25, 'avisa solo desde el día 25 (hoy es ' + dia + ')');
});

test('Salud en la app: el estado y los 4 pilares salen de las mismas métricas que Atención y se pintan en la tarjeta', () => {
  const ctx = app({ cuentas: cuentas(100000), misDeudas: yoDebo(900000) });
  const l = createHtmlTag(ctx.escHtml); ctx.html = l.html; ctx.raw = l.raw;
  const dom = createFakeDom(); ctx.document = dom.document;
  ctx.renderHealthScore();
  const h = String(dom.el('health-score-card').innerHTML);
  assert.match(h, /inicio-estado-rojo/, 'patrimonio negativo con liquidez negativa = crisis');
  assert.match(h, /Lo urgente primero/);
  assert.equal((h.match(/class="inicio-pilar /g) || []).length, 4);
  assert.match(h, /inicio-pilar-rojo/);
});

/* ================= P6: conciliación («¿por qué cambió mi patrimonio?») ================= */
const hp = (fecha, valor, extra = {}) => ({ fecha, valor, valorVisible: valor, ...extra });
test('P6. Periodo.conciliar: lo que no explican ingresos y gastos queda «sin explicar», y los saldos iniciales (montoBase) no cuentan', () => {
  const m = mesHace(1), p = mesHace(2);
  const { Periodo } = app({
    patrimonioHistorial: [hp(p + '-28', 1000000), hp(m + '-10', 1000000 + 500000, { montoBase: 500000 }), hp(m + '-28', 1000000 + 500000 - 180000 - 250000)],
    gastosVar: [{ id: 'g', fecha: m + '-12', monto: 180000, cat: 'Otro', desc: 'x' }],
  });
  const c = Periodo.conciliar(m);
  assert.equal(c.delta, 70000, 'delta del valor visible: 1.500.000 − 430.000 − 1.000.000');
  assert.equal(c.base, 500000);
  assert.equal(c.gastos, 180000);
  assert.equal(c.explicado, -180000);
  assert.equal(c.sinExplicar, -250000, 'la plata que desapareció sin ser gasto ni ingreso');
  assert.equal(Periodo.conciliar(p), null, 'sin una foto anterior no hay con qué comparar');
});

test('P6. la tarjeta de Análisis avisa lo sin explicar y, si todo cuadra, lo dice', () => {
  const m = mesHace(1), p = mesHace(2);
  const pintar = hist => {
    const ctx = loadApp([CORE('core-state.js'), CORE('periodo.js'), CORE('nu-calc.js'), CORE('calc-helpers.js'), CORE('html-tag.js'), CORE('umbrales.js'), CORE('cobros.js'), MOD('analisis.js')], { permissive: true });
    Object.assign(ctx.S, { patrimonioHistorial: hist, gastosVar: [{ id: 'g', fecha: m + '-12', monto: 180000, cat: 'Otro', desc: 'x' }] });
    const l = createHtmlTag(ctx.escHtml); ctx.html = l.html; ctx.raw = l.raw;
    const dom = createFakeDom(); ctx.document = dom.document; dom.el('an-conciliacion');
    ctx.renderConciliacion();
    return String(dom.el('an-conciliacion').innerHTML);
  };
  const raro = pintar([hp(p + '-28', 1000000), hp(m + '-28', 1000000 - 180000 - 250000)]);
  assert.match(raro, /bajó \$?430\.000/); assert.match(raro, /250\.000<\/b> sin explicar/);
  const ok = pintar([hp(p + '-28', 1000000), hp(m + '-28', 1000000 - 180000)]);
  assert.match(ok, /Todo cuadra/); assert.doesNotMatch(ok, /sin explicar/);
  assert.equal(pintar([hp(m + '-28', 5)]), '', 'sin historial previo no pinta nada');
});

/* ================= P2/P3: plan de salida de deudas en Inicio ================= */
test('P3. el plan de deudas lista tus deudas propias (no las ajenas), con tasa opcional y el ritmo de pago', () => {
  const m1 = mesHace(1), m2 = mesHace(2), m3 = mesHace(3);
  const ctx = app({
    cuentas: cuentas(0),
    ingresosFijos: ingresosEn(2000000, [m1, m2, m3]), ...gastosEn(1500000, [m1, m2, m3]),
    misDeudas: yoDebo(600000),
    tarjetasCredito: [{ id: 't', nombre: 'Visa', deuda: 1000000, cupo: 5000000, tasaEA: 28 }],
  });
  const d = ctx.planDeudasDatos();
  assert.deepEqual(Array.from(d.plan.orden, x => x.nombre), ['Visa', 'Fulano'], 'avalancha por defecto con una tasa: la tarjeta primero');
  assert.equal(d.plan.saldoTotal, 1600000);
  assert.equal(Math.round(d.balance), 500000, 'te sobran 500.000 al mes');
  assert.equal(d.plan.baja, true);
  assert.ok(d.plan.mesesLibre >= 4 && d.plan.mesesLibre <= 5);
  assert.ok(Math.abs(d.plan.costoMensualTotal - 20785) < 2, '28 % E.A. sobre 1.000.000');
});

test('P3. con balance negativo la deuda «no baja» y se dice cuánto liberar; sin deudas propias no hay plan', () => {
  const m1 = mesHace(1);
  const c = app({ ingresosFijos: ingresosEn(1000000, [m1]), ...gastosEn(1500000, [m1]), misDeudas: yoDebo(600000) }).planDeudasDatos();
  assert.equal(c.plan.baja, false); assert.ok(c.plan.necesitasLiberar > 0);
  assert.equal(app({ cuentas: cuentas(1000) }).planDeudasDatos(), null);
});

test('B1. calcLiquidez expone neta (lo ajeno de la tarjeta lo pagan) y netaPeorCaso (toda la deuda de tarjeta es tuya) + saldo a favor aparte', () => {
  const ctx = app({ cuentas: cuentas(1000000), tarjetasCredito: [{ id: 't', deuda: 400000, cupo: 1000000 }, { id: 'u', deuda: -50000, cupo: 1000000 }] });
  const l = ctx.calcLiquidez();
  assert.equal(l.tcTotal, 400000);
  assert.equal(l.saldoAFavorTC, 50000);
  assert.equal(l.netaPeorCaso, 600000);
  assert.ok(l.netaPeorCaso <= l.neta + 1e-9, 'el peor caso nunca supera a la neta');
});

test('B3. con saldos pero sin historial la tarjeta de Salud dice «Sin base», no «Regular»', () => {
  const ctx = app({ cuentas: cuentas(500000) });
  const el = { innerHTML: '', style: {} };
  ctx.document.getElementById = id => id === 'health-score-card' ? el : null;
  ctx.renderHealthScore();
  assert.ok(el.innerHTML.includes('Sin base'));
  assert.ok(!el.innerHTML.includes('Regular'));
});

test('P1. calcEstadoSituacion marca «serio» solo en presión/crisis y la franja se pinta bajo el hero', () => {
  const crisis = app({ cuentas: cuentas(0), misDeudas: yoDebo(900000) });
  const e = crisis.calcEstadoSituacion();
  assert.ok(e && e.serio, 'patrimonio negativo y sin liquidez → serio');
  const el = { hidden: true, innerHTML: '', className: '' };
  crisis.document.getElementById = id => id === 'inicio-franja-estado' ? el : null;
  crisis.renderFranjaEstado();
  assert.equal(el.hidden, false);
  assert.ok(el.innerHTML.includes(e.etiqueta));
  assert.equal(app({}).calcEstadoSituacion(), null, 'sin datos no hay estado');
});

test('B5. resumenFlujo cuenta superávit/déficit solo en meses con movimiento y acumula', () => {
  const m1 = mesHace(1), m2 = mesHace(2);
  const ctx = app({ cuentas: cuentas(0), ingresosFijos: ingresosEn(1000000, [m2, m1]), ...gastosEn(1500000, [m1]) });
  const r = ctx.Periodo.resumenFlujo(6, mesAct);
  assert.equal(r.meses.length, 6);
  assert.equal(r.deficit, 1);
  assert.equal(r.superavit, 1);
  assert.equal(r.acumulado, r.meses.reduce((a, x) => a + x.balance, 0));
});

test('B5. fraseTendencia: causa principal según el signo del flujo', () => {
  const S = app({}).Salud;
  assert.match(S.fraseTendencia(-420000, 90, -310000, 5000000), /bajó \$420\.000 en los últimos 3 meses.*gastaste \$310\.000 más/);
  assert.match(S.fraseTendencia(200000, 30, 250000, 1000000), /subió.*ingresos/);
  assert.match(S.fraseTendencia(100, 30, 0, 5000000), /estable/);
  assert.equal(S.fraseTendencia(null, 30, 0, 0), '');
});

test('B7. Wrapped mide el año completo con el cierre de diciembre anterior aunque la serie diaria ya no tenga enero', () => {
  const ctx = wrapped();
  const st = {
    patrimonioHistorial: [{ fecha: '2026-01-20', valor: 900, valorVisible: 900 }, { fecha: '2026-06-01', valor: 1200, valorVisible: 1200 }],
    patrimonioCierres: { '2025-12': { valor: 1000, valorVisible: 1000, base: 0 }, '2026-01': { valor: 900, valorVisible: 900, base: 0 }, '2026-06': { valor: 1200, valorVisible: 1200, base: 100 } },
  };
  const p = ctx._wrappedPatrimonioAnio(st, '2026');
  assert.equal(p.inicio, 1000);
  assert.equal(p.fin, 1200);
  assert.equal(p.diff, 100, 'sube 200 pero 100 fueron aperturas, no crecimiento');
});

test('B7. «balance honesto»: patrimonio en rojo o gastos sin ingresos → año difícil; año sano → null', () => {
  const ctx = wrapped();
  assert.equal(ctx._wrappedAnioDificil({ fin: -5, diff: 10 }, { totalGastos: 1, totalIngresos: 5, balance: 4 }), 'patrimonio');
  assert.equal(ctx._wrappedAnioDificil({ fin: 50, diff: -10 }, { totalGastos: 9, totalIngresos: 5, balance: -4 }), 'patrimonio');
  assert.equal(ctx._wrappedAnioDificil({ fin: 50, diff: 10 }, { totalGastos: 9, totalIngresos: 0, balance: -9 }), 'sin-ingresos');
  assert.equal(ctx._wrappedAnioDificil({ fin: 50, diff: 10 }, { totalGastos: 3, totalIngresos: 5, balance: 2 }), null);
});

test('B7. cierres mensuales: se rellenan desde la serie diaria y sobreviven a la poda', () => {
  const ctx = app({ cuentas: cuentas(500000), patrimonioHistorial: [{ fecha: '2025-12-30', valor: 100, valorVisible: 100 }, { fecha: '2025-12-31', valor: 120, valorVisible: 120, montoBase: 20 }] });
  ctx.snapshotPatrimonio();
  assert.equal(ctx.S.patrimonioCierres['2025-12'].valor, 120);
  assert.equal(ctx.S.patrimonioCierres['2025-12'].base, 20);
  ctx.S.patrimonioHistorial = ctx.S.patrimonioHistorial.filter(h => h.fecha > '2026');
  ctx.snapshotPatrimonio();
  assert.equal(ctx.S.patrimonioCierres['2025-12'].valor, 120, 'un mes sin puntos en la serie conserva su cierre');
});

test('P9. en situaciones difíciles todo consejo de alerta o aviso lleva una acción con destino', () => {
  const escenarios = [
    { cuentas: cuentas(100000), misDeudas: yoDebo(500000) },
    { cuentas: cuentas(300000), tarjetasCredito: [{ id: 't', deuda: 2900000, cupo: 5000000 }], ingresosFijos: ingresosEn(1000000, ultimosN(3)) },
    { cuentas: cuentas(100000), ...gastosEn(900000, ultimosN(3)), ingresosFijos: ingresosEn(500000, ultimosN(3)) },
  ];
  for (const e of escenarios) {
    const r = score(e);
    const sinIr = r.consejos.filter(c => (c.tipo === 'alerta' || c.tipo === 'aviso') && !c.ir);
    assert.deepEqual(Array.from(sinIr.map(c => c.texto)), []);
  }
});

test('P8. simulador: gastar menos e ingresar más mejora el balance; pagar deuda no cambia la liquidez neta pero baja la deuda y los intereses', () => {
  const { Salud } = app({});
  const m = { gastoTipico: 1000000, ingresoTipico: 1200000, liquidezNeta: 3000000, deudaPropia: 2000000, costoDeuda: 40000 };
  const base = Salud.simular(m, {});
  assert.equal(base.balance, 200000);
  assert.equal(base.mesesLibre, 10);
  const r = Salud.simular(m, { gastoPct: 10, ingresoExtra: 100000 });
  assert.equal(r.balance, 400000);
  assert.equal(r.mejoraMensual, 200000);
  assert.equal(r.mesesLibre, 5);
  const p = Salud.simular(m, { pagoDeuda: 1000000 });
  assert.equal(p.deudaPropia, 1000000);
  assert.equal(p.ahorroIntereses, 20000);
  assert.equal(p.mesesCubiertos, base.mesesCubiertos, 'la liquidez neta no cambia al pagar deuda');
  assert.equal(Salud.simular({ ...m, ingresoTipico: 900000 }, {}).mesesLibre, null, 'con balance negativo la deuda no baja');
  assert.equal(Salud.simular(m, { pagoDeuda: 9e9 }).deudaPropia, 0, 'no se paga más de lo que se debe');
});

test('P-presup. ritmoPresupuesto avisa solo si vas ≥15 puntos adelantado, desde el día 5 y sin haberte pasado', () => {
  const { Periodo } = app({});
  const r = Periodo.ritmoPresupuesto(700000, 1000000, '2026-11-10');
  assert.equal(r.esperadoPct, 33); assert.equal(r.usadoPct, 70); assert.equal(r.adelantado, true);
  assert.equal(Periodo.ritmoPresupuesto(700000, 1000000, '2026-11-03').adelantado, false, 'muy pronto en el mes');
  assert.equal(Periodo.ritmoPresupuesto(400000, 1000000, '2026-11-10').adelantado, false, 'ritmo normal');
  assert.equal(Periodo.ritmoPresupuesto(1200000, 1000000, '2026-11-10').adelantado, false, 'ya se pasó: lo dice el presupuesto');
});

test('P3. el plan de deudas compara la tasa de la tarjeta con lo que rinde la cajita', () => {
  const ctx = app({ cuentas: cuentas(100000), nuRate: 9, tarjetasCredito: [{ id: 't', nombre: 'Visa', deuda: 500000, cupo: 1000000, tasaEA: 28 }] });
  const el = { innerHTML: '' };
  ctx.document.getElementById = id => id === 'plan-deudas-card' ? el : null;
  ctx.renderPlanDeudas();
  assert.match(el.innerHTML, /Tu cajita rinde 9 % y «Visa» cuesta 28 %/);
});

test('B5. un ingreso marcado extraordinario cuenta en el balance real pero no en el balanceRecurrente', () => {
  const mes = mesAct;
  const ctx = app({ cuentas: cuentas(0), movimientos: [
    { id: 'a', tipo: 'entrada', clase: 'ingreso', fuente: 'nequi', monto: 1000000, fecha: mes + '-02', desc: 'Sueldo' },
    { id: 'b', tipo: 'entrada', clase: 'ingreso', fuente: 'nequi', monto: 800000, fecha: mes + '-03', desc: 'Aguinaldo', extraordinario: true },
  ] });
  const b = ctx.Periodo.balanceDelMes(mes);
  assert.equal(b.ingresosExtra, 800000);
  assert.equal(b.balance - b.balanceRecurrente, 800000);
});
