'use strict';
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

  test('la instantánea guarda id, mood, confetti y html; lleva versión y fecha de generación; es JSON puro', () => {
    const snap = I._wrappedSnapshotDe(slides);
    assert.equal(snap.version, 1);
    assert.equal(snap.version, I.WRAPPED_SNAPSHOT_VERSION);
    assert.equal(snap.generadoEn, '2026-10-30');
    assert.equal(snap.estado, 'completo');
    assert.equal(snap.slides.length, slides.length);
    assert.ok(snap.slides.every(s => typeof s.id === 'string' && typeof s.html === 'string'));
    assert.ok(snap.slides.some(s => s.confetti === true), 'la diapositiva final trae confeti');
    assert.deepEqual(plano(snap), JSON.parse(JSON.stringify(snap)), 'solo JSON: sobrevive a un backup');
    const msg = I._wrappedSnapshotDe(I._wrappedSlidesInsuficiente({ tier: 'nada', registros: 0, dias: 0 }, '2026'));
    assert.equal(msg.estado, 'insuficiente');
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
  const fuentes = ['css/styles.css', 'js/modules/wrapped.js', 'index.html'].map(f => fs.readFileSync(path.join(RAIZ, f), 'utf8')).join('\n');
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
