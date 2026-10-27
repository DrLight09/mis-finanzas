'use strict';
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
  const syncSrc = leer('firebase-sync.js').replace(/^import .*$/gm, '');
  const CODEC = escribir('codec.js', codecSrc);
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
    const app = loadApp([CODEC, SYNC], { permissive: true });
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
});
