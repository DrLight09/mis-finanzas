'use strict';
// tests/sesion-y-despliegue.test.js — Sesión, sincronización y despliegue: PIN, Firestore y sello del service worker.
// Un archivo por sección de la app. Cada bloque `describe` es lo que antes era un archivo suelto (pin-seguridad.test.js, sync.test.js, sw-sellado.test.js).
// Corre con:  node --test tests/sesion-y-despliegue.test.js   (o todo: npm test)
const { describe: _describe } = require('node:test');

_describe('pin-seguridad', () => {
// tests/pin-seguridad.test.js — Seguridad del PIN (js/core/pin-bio.js): hash con sal, PINs débiles, bloqueo por intentos, bloqueo automático
// y cambio de PIN con verificación. No usa jsdom: la parte pura se corta del archivo y el resto corre con un DOM mínimo de mentira.
// Corre con: node --test tests/pin-seguridad.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto');

const FUENTE = fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'pin-bio.js'), 'utf8').replace(/\r/g, '');

// ── Parte pura ──────────────────────────────────────────────────────────────
const puro = (() => {
  const trozo = FUENTE.slice(FUENTE.indexOf('// INICIO-PIN-PURO'), FUENTE.indexOf('// FIN-PIN-PURO'));
  const ctx = vm.createContext({});
  vm.runInContext(trozo + '\nthis.api = { _sha256, _hashPin, _pinParaGuardar, _pinCoincideCon, _pinDebil, _segundosDeBloqueo };', ctx);
  return ctx.api;
})();

test('SHA-256 propio da lo mismo que el de Node (incluye los bordes de 55/56/63/64/65 bytes y textos largos)', () => {
  for (const t of ['', 'abc', '1234', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(63), 'a'.repeat(64), 'a'.repeat(65), 'x:1234'.repeat(80)]) {
    assert.equal(puro._sha256(t), crypto.createHash('sha256').update(t, 'latin1').digest('hex'), t.slice(0, 12));
  }
});

test('el PIN se guarda como h1:<sal>:<hash>, sin el PIN en texto, y solo coincide el correcto', () => {
  const g = puro._pinParaGuardar('2580', 'aabbcc');
  assert.match(g, /^h1:aabbcc:[0-9a-f]{64}$/);
  assert.ok(!g.includes('2580'));
  assert.equal(puro._pinCoincideCon(g, '2580'), true);
  assert.equal(puro._pinCoincideCon(g, '2581'), false);
  assert.notEqual(puro._pinParaGuardar('2580', 'otra'), g, 'otra sal, otro hash');
});

test('un PIN guardado en texto por la versión anterior sigue funcionando; lo vacío o dañado nunca coincide', () => {
  assert.equal(puro._pinCoincideCon('1234', '1234'), true);
  assert.equal(puro._pinCoincideCon('1234', '1235'), false);
  assert.equal(puro._pinCoincideCon('', ''), false);
  assert.equal(puro._pinCoincideCon('h1:solo-dos', '1234'), false);
  assert.equal(puro._pinCoincideCon('h1:a:b:c', '1234'), false);
});

test('PINs débiles: repetidos, escaleras y parejas; uno normal pasa', () => {
  for (const d of ['0000', '1111', '9999', '1234', '2345', '6789', '0123', '4321', '9876', '1212', '2828']) assert.equal(puro._pinDebil(d), true, d);
  for (const ok of ['2580', '1357', '4096', '7391', '1990']) assert.equal(puro._pinDebil(ok), false, ok);
});

test('bloqueo por intentos: nada hasta el 4.º fallo, 30 s el 5.º, se duplica y topa en 15 min', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(puro._segundosDeBloqueo), [0, 0, 0, 0, 0]);
  assert.deepEqual([5, 6, 7, 8].map(puro._segundosDeBloqueo), [30, 60, 120, 240]);
  assert.equal(puro._segundosDeBloqueo(12), 900);
  assert.equal(puro._segundosDeBloqueo(40), 900);
});

// ── Comportamiento con un DOM mínimo ───────────────────────────────────────
function entorno({ pin = '1234', sesion = true } = {}) {
  const store = {}; if (pin) store.mf_pin = pin;
  const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  const els = {};
  const nuevo = id => ({ id, textContent: '', innerHTML: '', className: '', style: {}, addEventListener() {}, removeEventListener() {},
    classList: { _s: new Set(), add(...c) { c.forEach(x => this._s.add(x)); }, remove(...c) { c.forEach(x => this._s.delete(x)); }, toggle(c, f) { f ? this._s.add(c) : this._s.delete(c); }, contains(c) { return this._s.has(c); } } });
  const oyentes = {};
  const document = { hidden: false, readyState: 'complete', getElementById: id => els[id] || (els[id] = nuevo(id)), addEventListener: (t, fn) => { (oyentes[t] = oyentes[t] || []).push(fn); } };
  const lanzados = [], toasts = [];
  const window = { _fbLoadData: () => lanzados.push('app'), toast: (m, t) => toasts.push([m, t]), dialogo: async () => true };
  if (sesion) window._fbUser = { uid: 'u1' };
  const reloj = { t: 1_700_000_000_000 };
  const ctx = vm.createContext({ window, document, localStorage, toast: window.toast, dialogo: window.dialogo, navigator: { userAgent: '' }, crypto: crypto.webcrypto, console,
    Date: { now: () => reloj.t }, setTimeout, clearTimeout,
    setInterval: (f, ms) => { const h = setInterval(f, ms); if (h.unref) h.unref(); return h; }, clearInterval });
  vm.runInContext('const waitFor = () => {}; const hookGlobal = () => {};\n' + FUENTE.replace(/^import .*$/gm, ''), ctx);
  const espera = ms => new Promise(r => setTimeout(r, ms));
  // Tras escribir 4 dígitos el código envía el PIN a los 80 ms y, si es incorrecto, vacía el campo 430 ms después (la sacudida); los dígitos
  // que lleguen antes se descartan. Se espera a esa señal real —el campo vacío o la pantalla cerrada— y no a un tiempo fijo: con 520 ms el
  // margen era de 10 ms y la prueba fallaba bajo carga (sola pasaba; en la suite completa, con otros archivos en paralelo, a veces no).
  const hastaQue = async cond => { for (let i = 0; i < 600 && !cond(); i++) await espera(10); };
  const campoLleno = () => [0, 1, 2, 3].some(i => document.getElementById('pd' + i).classList.contains('filled'));
  const escribir = async txt => { for (const c of txt) window._pinKey(c); await hastaQue(() => !campoLleno() || !abierta()); };
  const abierta = () => els['pin-screen'] && els['pin-screen'].classList.contains('open');
  const texto = id => document.getElementById(id).textContent;
  const cambiarVisibilidad = oculta => { document.hidden = oculta; (oyentes.visibilitychange || []).forEach(f => f()); };
  return { window, store, lanzados, toasts, reloj, escribir, espera, abierta, texto, cambiarVisibilidad };
}

test('4 fallos no bloquean; el 5.º bloquea el teclado con cuenta regresiva y pasado el tiempo el PIN correcto entra y borra los fallos', async () => {
  const e = entorno();
  e.window._pinGate();
  assert.ok(e.abierta());
  for (let i = 0; i < 4; i++) await e.escribir('9876');
  assert.equal(e.store.mf_pin_fails, '4');
  assert.ok(!e.store.mf_pin_lock, 'todavía sin bloqueo');
  await e.escribir('0000');
  assert.equal(e.store.mf_pin_fails, '5');
  assert.match(e.texto('pin-sub'), /Demasiados intentos\. Intenta en 0:30/);
  await e.escribir('1234'); // con el teclado bloqueado ni el PIN correcto entra
  assert.deepEqual(e.lanzados, []);
  assert.ok(e.abierta());
  e.reloj.t += 31_000;
  await e.escribir('1234');
  assert.deepEqual(e.lanzados, ['app']);
  assert.ok(!e.abierta());
  assert.equal(e.store.mf_pin_fails, undefined);
  assert.equal(e.store.mf_pin_lock, undefined);
});

test('el bloqueo sobrevive a recargar la página (queda en el almacenamiento) y crece con cada fallo', async () => {
  const e = entorno();
  e.window._pinGate();
  for (let i = 0; i < 5; i++) await e.escribir('0000');
  const hasta1 = Number(e.store.mf_pin_lock);
  e.reloj.t += 31_000;
  await e.escribir('0000'); // 6.º fallo: 60 s
  assert.equal(Number(e.store.mf_pin_lock) - e.reloj.t, 60_000);
  assert.ok(Number(e.store.mf_pin_lock) > hasta1);
});

test('crear un PIN: uno débil se rechaza; uno normal se guarda con hash y después desbloquea', async () => {
  const e = entorno({ pin: '' });
  await e.window._pinSetNew();
  await e.escribir('1111');
  assert.ok(e.toasts.some(([m]) => m.includes('fácil de adivinar')));
  assert.ok(!e.store.mf_pin);
  await e.espera(500);
  await e.escribir('2580'); await e.escribir('2580');
  assert.match(e.store.mf_pin, /^h1:[0-9a-f]{32}:[0-9a-f]{64}$/);
  assert.ok(!e.store.mf_pin.includes('2580'));
  e.window._pinGate();
  await e.escribir('2580');
  assert.deepEqual(e.lanzados, ['app'], 'el PIN nuevo (con hash) desbloquea');
});

test('cambiar un PIN que ya existe pide el actual antes de ofrecer el nuevo', async () => {
  const e = entorno();
  const cambio = e.window._pinSetNew();
  assert.equal(e.texto('pin-title'), 'Confirma con tu PIN');
  await e.escribir('0000');
  assert.equal(e.texto('pin-title'), 'Confirma con tu PIN', 'con uno incorrecto no avanza');
  await e.escribir('1234');
  await cambio;
  assert.equal(e.texto('pin-title'), 'Elige un PIN de 4 dígitos');
});

test('bloqueo automático: tras 2 minutos en segundo plano pide el PIN y al desbloquear NO vuelve a cargar la app; con menos tiempo o sin sesión no hace nada', async () => {
  const e = entorno();
  e.cambiarVisibilidad(true); e.reloj.t += 30_000; e.cambiarVisibilidad(false);
  assert.ok(!e.abierta(), '30 s fuera: no bloquea');
  e.cambiarVisibilidad(true); e.reloj.t += 3 * 60_000; e.cambiarVisibilidad(false);
  assert.ok(e.abierta(), '3 min fuera: bloquea');
  await e.escribir('1234');
  assert.ok(!e.abierta());
  assert.deepEqual(e.lanzados, [], 'la app ya estaba cargada: no se recarga');
  const sin = entorno({ sesion: false });
  sin.cambiarVisibilidad(true); sin.reloj.t += 5 * 60_000; sin.cambiarVisibilidad(false);
  assert.ok(!sin.abierta(), 'sin sesión iniciada no hay nada que proteger');
  const sinPin = entorno({ pin: '' });
  sinPin.cambiarVisibilidad(true); sinPin.reloj.t += 5 * 60_000; sinPin.cambiarVisibilidad(false);
  assert.ok(!sinPin.abierta(), 'sin PIN activo no bloquea');
});

test('quitar el PIN borra también los fallos y el bloqueo', async () => {
  const e = entorno();
  e.window._pinGate();
  for (let i = 0; i < 5; i++) await e.escribir('0000');
  assert.ok(e.store.mf_pin_lock);
  e.window._pinReset();
  assert.equal(e.store.mf_pin, undefined);
  assert.equal(e.store.mf_pin_fails, undefined);
  assert.equal(e.store.mf_pin_lock, undefined);
});
});

_describe('sync', () => {
// tests/sync.test.js — Sincronización con Firestore: códec gzip del payload, guardado, listener.
// Un archivo por sección de la app. Cada bloque `describe` es lo que antes era un archivo suelto.
// Corre con:  node --test tests/sync.test.js   (o todo: npm test)
const { describe } = require('node:test');

describe('firebase-sync', () => {
  // firebase-sync.js + payload-codec.js: el payload viaja comprimido (gz1:) y el listener/guardado se portan igual que antes.
  // Se carga el archivo REAL (módulo ES) en un contexto vm con un Firestore simulado: sin red ni navegador.
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const zlib = require('node:zlib');
  const { loadApp } = require('./support/load-app');
  const { createFakeDom } = require('./support/fake-dom');

  const CORE = process.env.MIS_FINANZAS_CORE_DIR || path.join(__dirname, '..', 'js', 'core');
  const leer = f => fs.readFileSync(path.join(CORE, f), 'utf8');
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fbsync-'));
  const escribir = (nombre, codigo) => { const p = path.join(TMP, nombre); fs.writeFileSync(p, codigo); return p; };

  // Un módulo ES se carga como script clásico: sin `export` ni `import`.
  const codecSrc = leer('payload-codec.js').replace(/^export\s+/gm, '');
  const respaldosSrc = leer('respaldos.js').replace(/^export\s+/gm, ''); // firebase-sync.js importa sus funciones (respaldos automáticos)
  const syncSrc = leer('firebase-sync.js').replace(/^import .*$/gm, '');
  const CODEC = escribir('codec.js', codecSrc);
  const RESPALDOS = escribir('respaldos.js', respaldosSrc);
  const SYNC = escribir('sync.js', 'const waitFor = () => {};\n' + syncSrc);
  const plano = x => JSON.parse(JSON.stringify(x));
  const guardar = app => { const p = app._fbSaveToCloud(); app._fbFlushSave(); return p; }; // encola y fuerza el guardado sin esperar el debounce
  const esperar = ms => new Promise(r => setTimeout(r, ms));
  // Espera a una condición en vez de dormir un tiempo fijo: en una máquina lenta (OneDrive, antivirus) 50 ms no alcanzan para descomprimir y el test fallaba sin que la app tuviera un error.
  const hasta = async (cond, ms = 5000) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error('timeout esperando la condición'); await esperar(5); } };
  // Cuenta las descompresiones que arranca el listener para poder esperar a que TODAS terminen (sirve también en los tests que esperan que algo NO ocurra).
  const espiar = app => { const orig = app.decodificarPayload, p = []; app.decodificarPayload = t => { const r = orig(t); p.push(r); return r; }; return () => Promise.allSettled(p); };
  const gz = txt => 'gz1:' + zlib.gzipSync(txt).toString('base64');

  function entorno(estado) {
    const app = loadApp([CODEC, RESPALDOS, SYNC], { permissive: true });
    const dom = createFakeDom();
    app.document = dom.document;
    Object.assign(app.globalThis.document || {}, {});
    app.CompressionStream = CompressionStream; app.DecompressionStream = DecompressionStream;
    app.Blob = Blob; app.Response = Response; app.btoa = btoa; app.atob = atob; app.TextEncoder = TextEncoder; app.Uint8Array = Uint8Array;
    const escritos = []; const listeners = {};
    app._fb = {
      db: {}, doc: (...a) => ({ ruta: a.slice(1).join('/') }),
      setDoc: async (ref, datos) => { escritos.push(datos); },
      onSnapshot: (ref, opts, onNext, onError) => { listeners.next = onNext; listeners.error = onError; return () => {}; },
      runTransaction: async () => { throw new Error('no usado'); },
    };
    app._fbUser = { uid: 'u1' };
    app.S = estado || { cuentas: [{ id: 'nequi', saldo: 5 }], libro: [] };
    return { app, escritos, listeners };
  }
  const snap = (payload, extra = {}) => ({ exists: () => payload != null, data: () => ({ payload, updatedAt: 1 }), metadata: { fromCache: false, hasPendingWrites: false, ...extra } });

  test('códec — ida y vuelta con tildes y emojis, prefijo gz1: y bastante más chico', async () => {
    const app = loadApp([CODEC], { permissive: true });
    Object.assign(app, { CompressionStream, DecompressionStream, Blob, Response, btoa, atob, Uint8Array });
    const texto = JSON.stringify({ libro: Array.from({ length: 800 }, (_, i) => ({ id: 'l' + i, fecha: '2026-10-13', cuenta: 'nequi', monto: -i * 7, tipo: 'movimiento', desc: 'Almuerzo — niño ñandú 🍕' })) });
    const c = await app.codificarPayload(texto);
    assert.ok(c.startsWith('gz1:'));
    assert.ok(c.length < texto.length / 4, `ratio ${(texto.length / c.length).toFixed(1)}x`);
    assert.equal(await app.decodificarPayload(c), texto);
    assert.equal(await app.decodificarPayload(texto), texto, 'JSON plano pasa sin tocarse');
    assert.equal(await app.decodificarPayload('gz1:esto-no-es-gzip'), 'gz1:esto-no-es-gzip', 'ilegible: se devuelve igual (para que JSON.parse falle y nunca se guarde encima)');
  });

  test('códec — sin CompressionStream guarda en plano', async () => {
    const app = loadApp([CODEC], { permissive: true });
    app.CompressionStream = undefined;
    assert.equal(await app.codificarPayload('{"a":1}'), '{"a":1}');
  });

  test('guardado — escribe el payload comprimido y descomprimido es exactamente el estado', async () => {
    const { app, escritos } = entorno();
    app._dataLoaded = true;
    await guardar(app);
    assert.equal(escritos.length, 1);
    assert.ok(escritos[0].payload.startsWith('gz1:'));
    assert.equal(await app.decodificarPayload(escritos[0].payload), JSON.stringify(plano(app.S)));
  });

  test('guardado — se serializa una sola vez y lo escrito es EXACTAMENTE JSON.stringify(S), también con valores raros; un segundo guardado sin cambios no escribe', async () => {
    const { app, escritos } = entorno();
    app._dataLoaded = true;
    Object.assign(app.S, { raro: { a: undefined, b: NaN, c: Infinity, d: -0, e: [undefined, 1, null], f: { 10: 1, 2: 2, x: 3 }, g: 'ñ\u2028"\\', h: { k: undefined } } });
    await guardar(app);
    assert.equal(escritos.length, 1);
    assert.equal(await app.decodificarPayload(escritos[0].payload), JSON.stringify(app.S), 'idéntico a serializar S directamente (sin pasar por un clon)');
    assert.equal(JSON.stringify(app.S), JSON.stringify(JSON.parse(JSON.stringify(app.S))), 'y el clon era redundante: la cadena no cambia');
    const r = await guardar(app);
    assert.equal(escritos.length, 1, 'sin cambios no se vuelve a escribir (la comparación con el último guardado sigue funcionando)');
    assert.equal(r && r.reason, 'no-changes');
  });

  test('guardado — dos guardados seguidos: el viejo no pisa al nuevo y la nube termina con el estado más reciente', async () => {
    const { app, escritos } = entorno();
    app._dataLoaded = true;
    const original = app.codificarPayload; let n = 0;
    app.codificarPayload = async t => { if (++n === 1) await esperar(40); return original(t); }; // el primero (estado viejo) termina DESPUÉS del segundo
    const a = guardar(app);
    app.S.cuentas[0].saldo = 99;
    const b = guardar(app);
    await Promise.all([a, b]);
    const ultimo = JSON.parse(await app.decodificarPayload(escritos[escritos.length - 1].payload));
    assert.equal(ultimo.cuentas[0].saldo, 99);
  });

  test('guardado — por encima del tope de tamaño no escribe y lo dice (en vez de "revisa conexión")', async () => {
    const { app, escritos } = entorno();
    app._dataLoaded = true;
    app.S.basura = require('node:crypto').randomBytes(900000).toString('hex'); // incompresible: > 1.000.000 de bytes ya comprimido
    const r = await guardar(app);
    assert.equal(escritos.length, 0);
    assert.equal(r && r.reason, 'too-large');
  });

  test('listener — carga inicial con payload comprimido aplica los datos y habilita el guardado', async () => {
    const { app, listeners } = entorno({ cuentas: [], libro: [] });
    app._fbLoadData();
    listeners.next(snap(gz(JSON.stringify({ cuentas: [{ id: 'nequi', saldo: 123 }], libro: [{ id: 'l1' }] }))));
    await hasta(() => app._dataLoaded);
    assert.equal(app.S.cuentas[0].saldo, 123);
    assert.equal(app._dataLoaded, true);
  });

  test('listener — payload en JSON plano (formato anterior) también se lee', async () => {
    const { app, listeners } = entorno({ cuentas: [], libro: [] });
    app._fbLoadData();
    listeners.next(snap(JSON.stringify({ cuentas: [{ id: 'efectivo', saldo: 7 }] })));
    await hasta(() => app._dataLoaded);
    assert.equal(app.S.cuentas[0].saldo, 7);
    assert.equal(app._dataLoaded, true);
  });

  test('listener — un payload comprimido ilegible NO habilita el guardado (nunca se pisa la nube)', async () => {
    const { app, listeners, escritos } = entorno({ cuentas: [], libro: [] });
    const terminadas = espiar(app);
    app._fbLoadData();
    listeners.next(snap('gz1:basura-no-gzip'));
    await terminadas(); await esperar(30); // la descompresión ya falló; margen para que el listener reaccione
    assert.ok(!app._dataLoaded, 'sigue en modo lectura');
    assert.equal(escritos.length, 0);
  });

  test('listener — los snapshots se procesan en el orden en que llegaron', async () => {
    const { app, listeners } = entorno({ cuentas: [], libro: [] });
    app._fbLoadData();
    const grande = JSON.stringify({ cuentas: [{ id: 'nequi', saldo: 1 }], relleno: Array.from({ length: 4000 }, (_, i) => 'x' + i) });
    const terminadas = espiar(app);
    listeners.next(snap(gz(grande)));                                              // tarda más en descomprimir
    listeners.next(snap(JSON.stringify({ cuentas: [{ id: 'nequi', saldo: 2 }] }))); // llega después y es instantáneo
    await hasta(() => app.S.cuentas[0] && app.S.cuentas[0].saldo === 2); await terminadas(); await esperar(30); // el lento ya terminó: si se colara, pisaría el 2 con el 1
    assert.equal(app.S.cuentas[0].saldo, 2, 'gana el último en llegar, no el que terminó de descomprimir primero');
  });

  test('listener — la misma carga que llega varias veces (caché, servidor, cambio de metadatos) no avisa «Datos actualizados desde otro dispositivo»', async () => {
    const { app, listeners } = entorno({ cuentas: [], libro: [] });
    const avisos = [];
    app.toast = (m) => avisos.push(m); app.window = app.window || app; app.window.toast = app.toast;
    app.load = () => {}; app.refresh = () => {}; app.applyModulos = () => {};
    app._fbLoadData();
    const payload = JSON.stringify({ cuentas: [{ id: 'nequi', saldo: 9 }] });
    // updatedAt muy posterior a lo guardado localmente (mf_lastSavedAt vacío en un dispositivo recién abierto)
    const ts = Date.now() - 600000; // el mismo updatedAt en los tres: es el mismo documento de la nube
    app.window.dispatchEvent = () => {};
    const s = (extra) => ({ exists: () => true, data: () => ({ payload, updatedAt: ts }), metadata: { fromCache: false, hasPendingWrites: false, ...extra } });
    listeners.next(s({ fromCache: true }));   // 1) caché
    await hasta(() => app._dataLoaded || app.S.cuentas[0]); await esperar(30);
    listeners.next(s({}));                    // 2) confirmación del servidor
    await esperar(60);
    listeners.next(s({}));                    // 3) mismo dato otra vez (cambio de metadatos)
    await esperar(60);
    assert.deepEqual(avisos.filter(m => /otro dispositivo/.test(m)), [], 'el mismo dato ya aplicado no es una actualización de otro dispositivo');
  });

  test('listener — un cambio real de otro dispositivo (updatedAt más nuevo) sí se aplica y avisa una sola vez', async () => {
    const { app, listeners } = entorno({ cuentas: [], libro: [] });
    const avisos = [];
    app.toast = (m) => avisos.push(m); app.window = app.window || app; app.window.toast = app.toast; app.window.dispatchEvent = () => {};
    app.load = () => {}; app.refresh = () => {}; app.applyModulos = () => {};
    app._fbLoadData();
    const base = Date.now() - 600000;
    const s = (saldo, ts) => ({ exists: () => true, data: () => ({ payload: JSON.stringify({ cuentas: [{ id: 'nequi', saldo }] }), updatedAt: ts }), metadata: { fromCache: false, hasPendingWrites: false } });
    listeners.next(s(1, base)); await hasta(() => app._dataLoaded); await esperar(40);
    listeners.next(s(2, base + 120000)); await hasta(() => app.S.cuentas[0].saldo === 2); await esperar(40);
    listeners.next(s(2, base + 120000)); await esperar(60); // repetido: no vuelve a avisar
    assert.equal(avisos.filter(m => /otro dispositivo/.test(m)).length, 1);
  });

  // ── Control de revisión (`rev`): dos dispositivos con la misma cuenta ────────────────────────────────────────────
  function entornoRev(nube) {
    const e = entorno({ cuentas: [{ id: 'nequi', saldo: 1 }], libro: [] });
    const almacen = { doc: nube }; // lo que hay en «Firestore»: { payload, updatedAt, rev } o null
    const store = {};
    e.app.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
    e.app._fb.setDoc = async (ref, datos) => { almacen.doc = datos; e.escritos.push(datos); };
    // El «Firestore» distingue los documentos por ruta: `finanzas` es el principal; los demás (respaldos automáticos, su índice) van aparte.
    almacen.otros = new Map();
    const esPrincipal = ref => /\/data\/finanzas$/.test(ref.ruta);
    e.app._fb.runTransaction = async (db, fn) => {
      const pend = [];
      const tx = {
        get: async (ref) => {
          const d = esPrincipal(ref) ? almacen.doc : (almacen.otros.get(ref.ruta) || null);
          return { exists: () => d != null, data: () => d };
        },
        set: (ref, datos) => { pend.push(['set', ref, datos]); },
        delete: (ref) => { pend.push(['delete', ref]); },
      };
      const r = await fn(tx);
      pend.forEach(([op, ref, datos]) => {
        if (esPrincipal(ref)) { if (op === 'set') { almacen.doc = datos; e.escritos.push(datos); } return; }
        if (op === 'set') almacen.otros.set(ref.ruta, datos); else almacen.otros.delete(ref.ruta);
      });
      return r;
    };
    e.app.toast = () => {}; e.app.load = () => {}; e.app.refresh = () => {}; e.app.applyModulos = () => {};
    e.almacen = almacen; e.store = store;
    return e;
  }
  const nubeDoc = (saldo, rev, updatedAt = Date.now() - 600000) => ({ payload: JSON.stringify({ cuentas: [{ id: 'nequi', saldo }], libro: [] }), updatedAt, ...(rev == null ? {} : { rev }) });
  const cargar = async (e) => { e.app._fbLoadData(); e.listeners.next({ exists: () => e.almacen.doc != null, data: () => e.almacen.doc, metadata: { fromCache: false, hasPendingWrites: false } }); await hasta(() => e.app._dataLoaded); };

  test('rev — un guardado normal escribe rev+1 con una transacción y recuerda la revisión', async () => {
    const e = entornoRev(nubeDoc(1, 3));
    await cargar(e);
    assert.equal(e.app._revNube, 3);
    e.app.S.cuentas[0].saldo = 50;
    const r = await guardar(e.app);
    assert.equal(r.ok, true);
    assert.equal(e.almacen.doc.rev, 4);
    assert.equal(e.app._revNube, 4);
  });

  test('rev — documento anterior sin `rev` cuenta como 0: el primer guardado escribe rev 1', async () => {
    const e = entornoRev(nubeDoc(1, null));
    await cargar(e);
    assert.equal(e.app._revNube, 0);
    e.app.S.cuentas[0].saldo = 7;
    await guardar(e.app);
    assert.equal(e.almacen.doc.rev, 1);
  });

  test('rev — si otro dispositivo guardó en medio NO se pisa: se carga su versión y la copia local queda en mf_conflicto', async () => {
    const e = entornoRev(nubeDoc(1, 3));
    await cargar(e);
    e.almacen.doc = nubeDoc(500, 4, Date.now()); // el otro dispositivo guardó la revisión 4
    const avisos = []; e.app.toast = m => avisos.push(m);
    e.app.S.cuentas[0].saldo = 99; // cambio local sobre la revisión 3
    const r = await guardar(e.app);
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'conflict');
    assert.equal(e.escritos.length, 0, 'no se escribió nada en la nube');
    assert.equal(e.almacen.doc.rev, 4, 'la nube sigue intacta');
    assert.equal(e.app.S.cuentas[0].saldo, 500, 'se cargó la versión de la nube');
    assert.equal(e.app._revNube, 4);
    const copia = JSON.parse(e.store.mf_conflicto);
    assert.equal(JSON.parse(copia.payload).cuentas[0].saldo, 99, 'lo local descartado quedó guardado');
    assert.ok(avisos.some(m => /otro dispositivo/i.test(m)));
    // y con la versión nueva ya cargada, el siguiente guardado pasa
    e.app.S.cuentas[0].saldo = 501;
    assert.equal((await guardar(e.app)).ok, true);
    assert.equal(e.almacen.doc.rev, 5);
  });

  test('rev — forzar (importar un backup) pisa la nube aunque haya cambiado y sube la revisión', async () => {
    const e = entornoRev(nubeDoc(1, 3));
    await cargar(e);
    e.almacen.doc = nubeDoc(500, 8, Date.now());
    e.app.S.cuentas[0].saldo = 77;
    const p = e.app._fbSaveToCloud({ forzar: true }); e.app._fbFlushSave();
    const r = await p;
    assert.equal(r.ok, true);
    assert.equal(e.almacen.doc.rev, 9, 'sube sobre la revisión que había en la nube');
    assert.equal(JSON.parse(await e.app.decodificarPayload(e.almacen.doc.payload)).cuentas[0].saldo, 77);
  });

  test('rev — sin conexión la transacción falla y el guardado se encola con setDoc (no se pierde)', async () => {
    const e = entornoRev(nubeDoc(1, 3));
    await cargar(e);
    e.app._fb.runTransaction = async () => { const err = new Error('Failed to get document because the client is offline.'); err.code = 'unavailable'; throw err; };
    e.app.S.cuentas[0].saldo = 12;
    const r = await guardar(e.app);
    assert.equal(r.ok, true);
    assert.equal(e.escritos.length, 1);
    assert.equal(e.escritos[0].rev, 4);
  });

  test('rev — el listener decide por revisión, no por reloj: una revisión nueva con hora ANTERIOR sí se aplica', async () => {
    const e = entornoRev(nubeDoc(1, 3, Date.now()));
    const avisos = []; e.app.toast = m => avisos.push(m); e.app.window = e.app.window || e.app; e.app.window.toast = e.app.toast; e.app.window.dispatchEvent = () => {};
    await cargar(e); await esperar(30);
    const viva = (saldo, rev, ts) => ({ exists: () => true, data: () => nubeDoc(saldo, rev, ts), metadata: { fromCache: false, hasPendingWrites: false } });
    e.listeners.next(viva(300, 4, Date.now() - 3600000)); // reloj del otro dispositivo atrasado una hora
    await hasta(() => e.app.S.cuentas[0].saldo === 300);
    assert.equal(e.app._revNube, 4);
  });

  test('rev — el eco del propio guardado (misma revisión) no avisa «otro dispositivo»', async () => {
    const e = entornoRev(nubeDoc(1, 3));
    const avisos = []; e.app.toast = m => avisos.push(m); e.app.window = e.app.window || e.app; e.app.window.toast = e.app.toast;
    await cargar(e); await esperar(30);
    e.app.S.cuentas[0].saldo = 60;
    await guardar(e.app);
    e.listeners.next({ exists: () => true, data: () => e.almacen.doc, metadata: { fromCache: false, hasPendingWrites: false } });
    await esperar(60);
    assert.deepEqual(avisos.filter(m => /otro dispositivo/i.test(m)), []);
    assert.equal(e.app.S.cuentas[0].saldo, 60);
  });
});
});

_describe('sw-sellado', () => {
// tests/sw-sellado.test.js — el Service Worker está sellado con la huella del contenido desplegable (scripts/sellar-sw.js).
// Si esta prueba falla es porque cambió algún archivo desplegable (index.html, css/, js/, icons/, manifest) y falta correr:
//     node scripts/sellar-sw.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { huella } = require('../scripts/sellar-sw.js');

const RAIZ = path.join(__dirname, '..');

test('sw.js está sellado: BUILD coincide con la huella actual de los archivos desplegables', () => {
  const sw = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8');
  const m = /^const BUILD = '([^']*)';/m.exec(sw);
  assert.ok(m, 'sw.js debe declarar const BUILD');
  assert.equal(m[1], huella(RAIZ).build, 'sw.js desactualizado: corre `node scripts/sellar-sw.js` antes de desplegar');
});

test('la caché se nombra con VERSION y BUILD, y se limpia con ese mismo nombre', () => {
  const sw = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8');
  assert.match(sw, /const CACHE = VERSION \+ '-' \+ BUILD;/);
  assert.doesNotMatch(sw.replace(/\/\/.*$/gm, ''), /caches\.open\(VERSION\)|k !== VERSION/, 'nadie debe seguir usando VERSION a secas como nombre de caché');
});

test('la huella cambia con cualquier archivo desplegable, es estable y no depende de CRLF ni de sw.js', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sellar-'));
  const w = (f, t) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), t); };
  w('index.html', '<html>\n</html>\n'); w('js/core/a.js', 'let a = 1;\n'); w('css/styles.css', 'a{}\n'); w('manifest.webmanifest', '{}\n');
  w('sw.js', "const BUILD = 'x';\n");
  const h1 = huella(dir).build;
  assert.equal(huella(dir).build, h1, 'estable');
  w('sw.js', "const BUILD = 'otro';\n// y más\n");
  assert.equal(huella(dir).build, h1, 'sw.js no entra en su propia huella');
  w('index.html', '<html>\r\n</html>\r\n');
  assert.equal(huella(dir).build, h1, 'CRLF y LF dan lo mismo');
  w('js/core/a.js', 'let a = 2;\n');
  assert.notEqual(huella(dir).build, h1, 'un cambio en js/ cambia la huella');
  const h2 = huella(dir).build;
  w('js/modules/nuevo.js', '\n');
  assert.notEqual(huella(dir).build, h2, 'un archivo nuevo también');
  w('docs/CHANGELOG.md', 'nada\n'); w('tests/x.test.js', 'nada\n');
  const h3 = huella(dir).build;
  w('docs/CHANGELOG.md', 'otra cosa\n');
  assert.equal(huella(dir).build, h3, 'docs/ y tests/ no se despliegan: no cuentan');
  fs.rmSync(dir, { recursive: true });
});

test('el script sella solo la línea BUILD; con --check falla (código 1) si está vieja y no toca nada', () => {
  const { spawnSync } = require('node:child_process');
  const script = path.join(RAIZ, 'scripts', 'sellar-sw.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sellar-'));
  fs.mkdirSync(path.join(dir, 'js'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), 'x'); fs.writeFileSync(path.join(dir, 'js', 'a.js'), 'a');
  const original = "const VERSION = 'v1';\nconst BUILD = 'sin-sellar';\nconst otra = 2;\n";
  fs.writeFileSync(path.join(dir, 'sw.js'), original);
  const chk = spawnSync(process.execPath, [script, '--check', dir], { encoding: 'utf8' });
  assert.equal(chk.status, 1, 'vieja → código 1');
  assert.equal(fs.readFileSync(path.join(dir, 'sw.js'), 'utf8'), original, '--check no escribe');
  const run = spawnSync(process.execPath, [script, dir], { encoding: 'utf8' });
  assert.equal(run.status, 0);
  const sellado = fs.readFileSync(path.join(dir, 'sw.js'), 'utf8');
  assert.match(sellado, /^const VERSION = 'v1';\nconst BUILD = '[0-9a-f]{12}'; \/\/ sellado por/);
  assert.ok(sellado.endsWith("\nconst otra = 2;\n"), 'el resto del archivo queda igual');
  assert.equal(spawnSync(process.execPath, [script, '--check', dir], { encoding: 'utf8' }).status, 0, 'recién sellado → al día');
  fs.rmSync(dir, { recursive: true });
});
});
