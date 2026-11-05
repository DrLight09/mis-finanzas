'use strict';
// tests/reglas.test.js — js/core/reglas.js: reglas de alerta puras y compartidas (Atención + push). Corre en Node puro (sin vm).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Reglas = require('../js/core/reglas.js');
const UMBRALES = require('../js/core/umbrales.js');

const ev = (canal, ctx) => Reglas.evaluar(canal, { umbrales: UMBRALES, ...ctx });
const textos = (canal, ctx) => ev(canal, ctx).map(i => i.texto);
const HOY = '2026-11-05';

test('Reglas.dias: diferencia de días exacta, sin depender de zona horaria ni de cambios de hora', () => {
  assert.equal(Reglas.dias('2026-11-05', '2026-11-08'), 3);
  assert.equal(Reglas.dias('2026-11-05', '2026-11-04'), -1);
  assert.equal(Reglas.dias('2026-03-07', '2026-03-09'), 2);
  assert.equal(Reglas.dias('2026-1-5', '2026-01-06'), 1, 'tolera fechas sin ceros');
  assert.equal(Reglas.dias('2026-11-05', '2026-11-05T10:30:00'), 0, 'ignora la hora');
});

test('registro: ids únicos (reemplaza), validación y aislamiento de errores', () => {
  assert.throws(() => Reglas.registrar({ id: 'x', canales: [], evaluar() {} }));
  assert.throws(() => Reglas.registrar({ id: '', canales: ['push'], evaluar() {} }));
  Reglas.registrar({ id: 'prueba-rota', canales: ['canal-prueba'], evaluar() { throw new Error('boom'); } });
  Reglas.registrar({ id: 'prueba-sana', canales: ['canal-prueba'], evaluar() { return [{ tipo: 'amber', texto: 'ok' }]; } });
  const e = console.error; const log = []; console.error = (...a) => log.push(a);
  try { assert.deepEqual(textos('canal-prueba', {}), ['ok']); } finally { console.error = e; }
  assert.equal(log[0][0], '[Reglas:prueba-rota]');
  Reglas.registrar({ id: 'prueba-sana', canales: ['canal-prueba'], evaluar() { return [{ tipo: 'red', texto: 'nuevo' }]; } });
  assert.equal(Reglas.lista('canal-prueba').filter(r => r.id === 'prueba-sana').length, 1, 'mismo id no se duplica');
  assert.equal(ev('canal-prueba', {}).find(i => i.regla === 'prueba-sana').texto, 'nuevo');
});

test('los canales declarados: el push solo lleva las reglas basadas en S; Atención lleva todas las de situación', () => {
  const push = Reglas.lista('push').map(r => r.id);
  assert.deepEqual(push.filter(id => !id.startsWith('prueba')), ['spotify-vencido', 'cdt', 'encargos-comprometidos', 'wrapped-disponible']);
  const atn = Reglas.lista('atencion').map(r => r.id);
  ['liquidez', 'patrimonio-negativo', 'racha-deficit', 'gastos-fijos', 'gastos-fijos-sin-dia', 'ingresos-fijos', 'deudas-personas', 'mesada-pendiente', 'tarjetas', 'spotify-vencido', 'cdt', 'encargos-comprometidos'].forEach(id => assert.ok(atn.includes(id), id));
  assert.ok(!atn.includes('wrapped-disponible'), 'el aviso de Wrapped es solo del push');
});

test('PARIDAD: Atención y push dicen exactamente lo mismo para las reglas compartidas (el motivo de existir de este módulo)', () => {
  const S = {
    modulos: { spotify: true },
    personas: [{ id: 'p1', nombre: 'Ana Pérez' }],
    spotify: { personas: [{ personaId: 'p1', nombre: 'x', proximoPago: '2026-11-01', pagado: false }] },
    cajitas: [{ nombre: 'Nu', cdts: [{ vence: '2026-11-08' }, { vence: '2026-11-01' }] }],
    encargos: [{ nombre: 'Viaje', partes: [{ desc: 'Hotel', monto: 300000, fecha: '2026-11-05' }, { desc: 'Vuelo', monto: 500000, fecha: '2026-11-01' }] }],
  };
  const comp = ['spotify-vencido', 'cdt', 'encargos-comprometidos'];
  const sol = canal => ev(canal, { hoy: HOY, S }).filter(i => comp.includes(i.regla)).map(i => i.regla + '|' + i.tipo + '|' + i.texto);
  assert.deepEqual(sol('push'), sol('atencion'));
  assert.equal(sol('push').length, 5);
});

test('Spotify: usa el nombre de la ficha de Personas, y un «Pagó» deja de estar vigente cuando llega el próximo pago', () => {
  const S = { modulos: { spotify: true }, personas: [{ id: 'p1', nombre: 'Ana' }], spotify: { personas: [
    { personaId: 'p1', proximoPago: '2026-11-01', pagado: false },
    { nombre: 'Luis', proximoPago: '2026-11-01', pagado: true },        // pagó, pero su próximo pago (1 nov) ya pasó → pendiente otra vez
    { nombre: 'Eva', proximoPago: '2026-11-20', pagado: true },         // pagó y aún no le toca → no avisa
    { nombre: 'Sol', proximoPago: '2026-11-10', pagado: false },        // pendiente pero no vencido → no avisa
  ] } };
  assert.deepEqual(textos('push', { hoy: HOY, S }), ['Cobro Spotify de Ana vencido', 'Cobro Spotify de Luis vencido']);
  assert.deepEqual(textos('push', { hoy: HOY, S: { ...S, modulos: {} } }), [], 'sin el módulo Spotify activo no avisa');
});

test('CDT: avisa 7 días antes (ámbar, con «0d» el mismo día) y en rojo cuando ya venció; fuera de ventana, nada', () => {
  const c = vence => textos('push', { hoy: HOY, S: { cajitas: [{ nombre: 'Nu', cdts: [{ vence }] }] } });
  assert.deepEqual(c('2026-11-12'), ['CDT "Nu" vence en 7d']);
  assert.deepEqual(c('2026-11-05'), ['CDT "Nu" vence en 0d']);
  assert.deepEqual(c('2026-11-13'), []);
  assert.deepEqual(c('2026-11-04'), ['CDT "Nu" venció — ¡libera tu plata!']);
  assert.deepEqual(c('2026-11-8'), ['CDT "Nu" vence en 3d'], 'fecha sin ceros');
});

test('Encargos: «es hoy/mañana» en ámbar, vencida en rojo; usadas y sin fecha no cuentan', () => {
  const S = { encargos: [{ nombre: 'Viaje', partes: [
    { desc: 'a', monto: 1000, fecha: '2026-11-05' }, { desc: 'b', monto: 2000, fecha: '2026-11-06' }, { desc: 'c', monto: 3000, fecha: '2026-11-07' },
    { desc: 'd', monto: 4000, fecha: '2026-11-03' }, { desc: 'e', monto: 5000, fecha: '2026-11-03', usada: true }, { desc: 'f', monto: 6000 },
  ] }] };
  const r = ev('push', { hoy: HOY, S }).filter(i => i.regla === 'encargos-comprometidos');
  assert.deepEqual(r.map(i => i.tipo), ['amber', 'amber', 'red']);
  assert.match(r[0].texto, /"a" \(\$1\.000\) es hoy/);
  assert.match(r[1].texto, /"b" \(\$2\.000\) es mañana/);
  assert.match(r[2].texto, /"d" \(\$4\.000\) venció hace 2d sin usarse — sigue comprometida/);
});

test('Wrapped: solo el 1 de enero y solo en el push', () => {
  assert.deepEqual(textos('push', { hoy: '2027-01-01', S: {} }).length, 1);
  assert.deepEqual(textos('push', { hoy: '2027-01-02', S: {} }), []);
  assert.deepEqual(textos('atencion', { hoy: '2027-01-01', S: {} }), []);
});

test('sin `api` ni `situacion` (el push) las reglas de la app se callan en vez de fallar', () => {
  assert.deepEqual(ev('atencion', { hoy: HOY, S: {} }), []);
});

test('situación: liquidez negativa (rojo), runway crítico (ámbar), patrimonio negativo (rojo, NUEVO) y racha de déficit', () => {
  const sit = o => ({ patrimonio: 1e6, liquidezNeta: 1e6, mesesCubiertos: 5, ingresoTipico: 2e6, racha: { meses: 0, acumulado: 0 }, ...o });
  const t = (o) => ev('atencion', { hoy: HOY, S: {}, situacion: sit(o) }).map(i => i.regla + '|' + i.tipo + '|' + i.texto);
  assert.deepEqual(t({}), []);
  assert.deepEqual(t({ liquidezNeta: -250000, mesesCubiertos: 0 }), ['liquidez|red|Tus deudas superan la plata que tienes disponible en $250.000']);
  assert.deepEqual(t({ mesesCubiertos: 0.4 }), ['liquidez|amber|Cubres menos de 1 mes de gastos']);
  assert.deepEqual(t({ mesesCubiertos: 2 }), [], '2 meses ya no es crítico (solo ámbar en el pilar, no aviso)');
  assert.deepEqual(t({ patrimonio: -800000 }), ['patrimonio-negativo|red|Tu patrimonio es negativo: debes $800.000 más de lo que tienes']);
  assert.deepEqual(t({ patrimonio: 0 }), [], 'patrimonio exactamente 0 no es negativo');
  assert.deepEqual(t({ racha: { meses: 2, acumulado: -300000 } }), ['racha-deficit|amber|Llevas 2 meses seguidos gastando más de lo que ingresas ($300.000 en total)']);
  assert.equal(t({ racha: { meses: 3, acumulado: -450000 } })[0].split('|')[1], 'red');
  assert.deepEqual(t({ racha: { meses: 3, acumulado: -450000 }, ingresoTipico: 0 }), [], 'sin ingreso típico no es déficit: es no haber anotado ingresos');
  assert.deepEqual(t({ racha: { meses: 3, acumulado: -450000 }, mesesCubiertos: 8 }), [], 'un fondo sólido (≥ 6 meses) absorbe la racha');
});

test('gastos fijos: vencido (rojo), hoy / en N días (ámbar), brecha de caja; y SIN día solo desde el día 25 (NUEVO)', () => {
  const api = {
    gastosFijosProgramados: () => [{ nombre: 'Gym', monto: 50000, dias: -2 }, { nombre: 'Arriendo', monto: 900000, dias: 0 }, { nombre: 'Agua', monto: 40000, dias: 3 }, { nombre: 'Netflix', monto: 30000, dias: 4 }],
    calendarioCaja: () => ({ primerDeficit: { fecha: '2026-11-30', saldo: -850000, evento: { texto: 'Arriendo', monto: -900000 } } }),
    gastosFijosSinDia: () => [{ nombre: 'Gas', monto: 60000 }],
  };
  const t = hoy => ev('atencion', { hoy, S: {}, api }).map(i => i.regla + '|' + i.tipo + '|' + i.texto);
  const r = t('2026-11-05');
  assert.deepEqual(r, [
    'gastos-fijos|red|Gym venció hace 2 días y no está pagado ($50.000)',
    'gastos-fijos|amber|Arriendo vence hoy ($900.000)',
    'gastos-fijos|amber|Agua vence en 3 días ($40.000)',
    'gastos-fijos|red|El 30 de nov tu plata disponible quedaría en -$850.000 (vence Arriendo: $900.000)',
  ]);
  assert.ok(!t('2026-11-24').some(x => x.startsWith('gastos-fijos-sin-dia')), 'el 24 aún no avisa');
  assert.deepEqual(t('2026-11-25').filter(x => x.startsWith('gastos-fijos-sin-dia')), ['gastos-fijos-sin-dia|amber|Ya es 25 y Gas aún no está pagado este mes ($60.000)']);
  assert.match(ev('atencion', { hoy: HOY, S: {}, api: { gastosFijosProgramados: () => [{ nombre: 'Luz', monto: 1, dias: -1 }] } })[0].texto, /venció hace 1 día y no/, 'singular');
});

test('tarjetas, deudas y mesada: textos y severidades', () => {
  const S = { tarjetasCredito: [
    { nombre: 'Vieja', estado: 'cerrada', deuda: 80000, cupo: 1e6 }, { nombre: 'Llena', cupo: 1e6, deuda: 1e6 }, { nombre: 'Casi', cupo: 1e6, deuda: 9e5 }, { nombre: 'Sana', cupo: 1e6, deuda: 1e5 }, { nombre: 'SinCupo', deuda: 5 },
  ] };
  const api = {
    tcCupoUsadoPct: tc => tc.deuda / tc.cupo * 100,
    deudas: tipo => tipo === 'favor' ? [{ nombre: 'Ana', saldo: 100000 }, { nombre: 'Pagado', saldo: 0 }] : [{ nombre: 'Luis', saldo: 50000 }],
    mesadaPendientes: () => [{ quien: 'Papá', mes: 'Octubre 2026', pendiente: 20000 }],
  };
  const r = ev('atencion', { hoy: HOY, S, api }).map(i => i.tipo + '|' + i.texto);
  assert.deepEqual(r, [
    'amber|Ana te debe $100.000', 'amber|Le debes $50.000 a Luis', 'amber|Papá te debe $20.000 de la mesada de Octubre 2026',
    'amber|Vieja: tarjeta cerrada con deuda de $80.000', 'red|Llena: cupo agotado — deuda $1.000.000', 'amber|Casi: cupo casi agotado (90% usado)',
  ]);
});

test('ingresos fijos atrasados', () => {
  const r = ev('atencion', { hoy: HOY, S: {}, api: { ingresosFijosAtrasados: () => [{ nombre: 'Sueldo', dia: 1, monto: 2000000 }] } });
  assert.equal(r[0].texto, 'Sueldo debía llegar el día 1 y aún no lo registras ($2.000.000)');
});

test('el push sigue funcionando a través de checks.js (ruta real del script) y devuelve solo {tipo, texto}', () => {
  const { ejecutarChecks, CHECKS } = require(path.join('..', 'scripts', 'notificaciones', 'checks.js'));
  assert.deepEqual(CHECKS.map(c => c.id), ['spotify-vencido', 'cdt', 'encargos-comprometidos', 'wrapped-disponible']);
  const r = ejecutarChecks({ cajitas: [{ nombre: 'Nu', cdts: [{ vence: '2026-11-04' }] }] }, HOY);
  assert.deepEqual(r, [{ tipo: 'red', texto: 'CDT "Nu" venció — ¡libera tu plata!' }]);
  assert.deepEqual(ejecutarChecks({}, HOY), []);
});

test('guarda: checks.js ya no copia reglas (no define spPersonaPagadaVigente ni checkCDT propios)', () => {
  const src = require('node:fs').readFileSync(path.join(__dirname, '..', 'scripts', 'notificaciones', 'checks.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(src, /function (spPersonaPagadaVigente|checkCDT|checkEncargos|checkSpotifyVencido|checkWrapped)/);
});
