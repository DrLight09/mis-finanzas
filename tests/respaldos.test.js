// tests/respaldos.test.js — Respaldos automáticos (docs/respaldos-automaticos.md).
// Parte 1: js/core/respaldos.js (módulo ES, se importa tal cual) contra un Firestore y un almacén de IndexedDB simulados.
// Parte 2: integración con js/core/firebase-sync.js real (vm, igual que tests/sesion-y-despliegue.test.js): cuándo se respalda,
//          que un respaldo roto nunca impide guardar, y qué pasa al importar / borrar todo.
// Corre con:  node --test tests/respaldos.test.js   (o todo: npm test)
const { describe, test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { pathToFileURL } = require('node:url');
const { loadApp } = require('./support/load-app');
const { createFakeDom } = require('./support/fake-dom');

const CORE = process.env.MIS_FINANZAS_CORE_DIR || path.join(__dirname, '..', 'js', 'core');
const leer = f => fs.readFileSync(path.join(CORE, f), 'utf8');
const gz = txt => 'gz1:' + zlib.gzipSync(txt).toString('base64');
const esperar = ms => new Promise(r => setTimeout(r, ms));
const hasta = async (cond, ms = 5000) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error('timeout esperando la condición'); await esperar(5); } };

// ── Firestore simulado: documentos por ruta + transacciones que exigen «leer antes de escribir» como el real ──────────
function crearNube(inicial = {}) {
  const docs = new Map(Object.entries(inicial));
  const rutaDe = ref => ref.ruta;
  const doc = (db, ...partes) => ({ ruta: partes.join('/'), id: partes[partes.length - 1] });
  const snap = (ref) => { const d = docs.get(rutaDe(ref)); return { id: ref.id, exists: () => d !== undefined, data: () => d }; };
  const fb = {
    db: {}, doc,
    getDoc: async ref => snap(ref),
    deleteDoc: async ref => { docs.delete(rutaDe(ref)); },
    setDoc: async (ref, datos) => { docs.set(rutaDe(ref), datos); },
    collection: (db, ...partes) => ({ prefijo: partes.join('/') + '/' }),
    getDocs: async col => {
      const hijos = [...docs.keys()].filter(k => k.startsWith(col.prefijo) && !k.slice(col.prefijo.length).includes('/'));
      return { forEach: f => hijos.forEach(k => f({ id: k.slice(col.prefijo.length), data: () => docs.get(k) })) };
    },
    runTransaction: async (db, fn) => {
      const pend = []; let escribio = false;
      const tx = {
        get: async ref => { if (escribio) throw new Error('Firestore: todas las lecturas deben ir antes de las escrituras'); return snap(ref); },
        set: (ref, datos) => { escribio = true; pend.push(['set', ref, datos]); },
        delete: ref => { escribio = true; pend.push(['delete', ref]); },
      };
      const r = await fn(tx);
      pend.forEach(([op, ref, datos]) => { if (op === 'set') docs.set(rutaDe(ref), datos); else docs.delete(rutaDe(ref)); });
      return r;
    },
  };
  return { docs, fb };
}
const PRINCIPAL = 'usuarios/u1/data/finanzas';
const INDICE = 'usuarios/u1/data/respaldos-indice';
const plano = o => JSON.stringify(o);
const decodificar = async p => (typeof p === 'string' && p.startsWith('gz1:') ? zlib.gunzipSync(Buffer.from(p.slice(4), 'base64')).toString('utf8') : p);
const AHORA = new Date(2026, 10, 9, 8, 30, 0).getTime(); // 9 nov 2026, 8:30 (hora local)
const DIA = 86400000;

describe('respaldos — módulo (js/core/respaldos.js)', () => {
  let R;
  before(async () => { R = await import(pathToFileURL(path.join(CORE, 'respaldos.js')).href); });

  test('fechaLocal e ids: el día es el de la hora local y los ids son estables', () => {
    assert.equal(R.fechaLocal(new Date(2026, 10, 9, 23, 59, 59)), '2026-11-09');
    assert.equal(R.fechaLocal(new Date(2026, 0, 5, 0, 0, 1)), '2026-01-05');
    assert.equal(R.idDiario('2026-11-09'), 'respaldo-2026-11-09');
    assert.equal(R.idPrevio(new Date(2026, 10, 9, 15, 4, 7).getTime()), 'respaldo-previo-2026-11-09-150407');
  });

  test('planoTieneDatos: un objeto con claves sí; {} , null, arreglos y texto roto no', () => {
    assert.equal(R.planoTieneDatos('{"cuentas":[]}'), true);
    for (const x of ['{}', 'null', '[]', '[1]', 'esto no es json', '', undefined, 5]) assert.equal(R.planoTieneDatos(x), false, String(x));
  });

  test('podar: se queda con los más recientes de cada clase y no toca una clase desconocida', () => {
    const items = [];
    for (let i = 0; i < 33; i++) items.push({ id: 'd' + i, tipo: 'diario', creadoEn: i });
    for (let i = 0; i < 7; i++) items.push({ id: 'p' + i, tipo: 'previo', creadoEn: 100 + i });
    items.push({ id: 'x', tipo: 'futuro', creadoEn: 1 });
    const { conservar, borrar } = R.podar(items);
    assert.equal(conservar.filter(i => i.tipo === 'diario').length, 30);
    assert.equal(conservar.filter(i => i.tipo === 'previo').length, 5);
    assert.deepEqual(borrar.filter(i => i.tipo === 'diario').map(i => i.id).sort(), ['d0', 'd1', 'd2'], 'se borran los más viejos');
    assert.deepEqual(borrar.filter(i => i.tipo === 'previo').map(i => i.id).sort(), ['p0', 'p1']);
    assert.ok(conservar.some(i => i.id === 'x'));
    const loc = R.podar(items, R.LIMITES, true);
    assert.equal(loc.conservar.filter(i => i.tipo === 'diario').length, 7);
    assert.equal(loc.conservar.filter(i => i.tipo === 'previo').length, 2);
  });

  test('nube — la primera vez del día copia el documento TAL CUAL (comprimido), crea el índice y no duplica', async () => {
    const payload = gz(plano({ cuentas: [{ id: 'nequi', saldo: 5 }], libro: [] }));
    const { docs, fb } = crearNube({ [PRINCIPAL]: { payload, updatedAt: 111, rev: 7 } });
    const r = await R.respaldarEnNube({ fb, uid: 'u1', tipo: 'diario', ahora: AHORA, decodificar });
    assert.deepEqual({ estado: r.estado, id: r.id }, { estado: 'creado', id: 'respaldo-2026-11-09' });
    const copia = docs.get('usuarios/u1/data/respaldo-2026-11-09');
    assert.equal(copia.payload, payload, 'idéntico byte a byte: no se descomprime ni se recomprime');
    assert.equal(copia.rev, 7); assert.equal(copia.updatedAt, 111);
    const idx = docs.get(INDICE).items;
    assert.equal(idx.length, 1);
    assert.deepEqual({ id: idx[0].id, tipo: idx[0].tipo, fecha: idx[0].fecha, de: idx[0].de, rev: idx[0].rev, bytes: idx[0].bytes }, { id: 'respaldo-2026-11-09', tipo: 'diario', fecha: '2026-11-09', de: 111, rev: 7, bytes: payload.length });
    assert.equal(docs.get(PRINCIPAL).payload, payload, 'el documento principal no se toca');
    const otra = await R.respaldarEnNube({ fb, uid: 'u1', tipo: 'diario', ahora: AHORA + 3600000, decodificar });
    assert.equal(otra.estado, 'ya-existia');
    assert.equal(docs.get(INDICE).items.length, 1);
  });

  test('nube — un documento vacío ({}), sin payload o inexistente no se respalda', async () => {
    for (const principal of [undefined, { payload: '{}', updatedAt: 1 }, { payload: gz('{}'), updatedAt: 1 }, { updatedAt: 1 }]) {
      const { docs, fb } = crearNube(principal ? { [PRINCIPAL]: principal } : {});
      const r = await R.respaldarEnNube({ fb, uid: 'u1', tipo: 'diario', ahora: AHORA, decodificar });
      assert.equal(r.estado, 'sin-datos');
      assert.equal([...docs.keys()].filter(k => k.includes('respaldo')).length, 0);
    }
  });

  test('nube — 31 días seguidos: el día 31 borra el más viejo y el índice queda con 30', async () => {
    const { docs, fb } = crearNube({ [PRINCIPAL]: { payload: plano({ cuentas: [1] }), updatedAt: 1, rev: 1 } });
    for (let i = 0; i < 31; i++) await R.respaldarEnNube({ fb, uid: 'u1', tipo: 'diario', ahora: AHORA + i * DIA, decodificar });
    const items = docs.get(INDICE).items;
    assert.equal(items.length, 30);
    const ids = [...docs.keys()].filter(k => k.includes('/data/respaldo-'));
    assert.equal(ids.length, 30, 'el documento del día más viejo se borró de verdad');
    assert.ok(!docs.has('usuarios/u1/data/respaldo-2026-11-09'), 'el primero (más viejo) ya no está');
    assert.ok(docs.has('usuarios/u1/data/respaldo-2026-12-09'), 'el último sí');
  });

  test('nube — los «previos» no se mezclan con los diarios y se limitan a 5', async () => {
    const { docs, fb } = crearNube({ [PRINCIPAL]: { payload: plano({ cuentas: [1] }), updatedAt: 1, rev: 1 } });
    await R.respaldarEnNube({ fb, uid: 'u1', tipo: 'diario', ahora: AHORA, decodificar });
    for (let i = 0; i < 7; i++) await R.respaldarEnNube({ fb, uid: 'u1', tipo: 'previo', ahora: AHORA + i * 1000, decodificar });
    const items = docs.get(INDICE).items;
    assert.equal(items.filter(i => i.tipo === 'previo').length, 5);
    assert.equal(items.filter(i => i.tipo === 'diario').length, 1, 'el diario sigue ahí');
  });

  test('equipo — crea, no repite el mismo día, poda a 7 y no respalda estados vacíos', async () => {
    const almacen = R.almacenMemoria();
    const codificar = async t => gz(t);
    const est = plano({ cuentas: [{ id: 'nequi', saldo: 9 }] });
    assert.equal((await R.respaldarEnEquipo({ almacen, plano: est, tipo: 'diario', ahora: AHORA, codificar })).estado, 'creado');
    assert.equal((await R.respaldarEnEquipo({ almacen, plano: est, tipo: 'diario', ahora: AHORA + 1000, codificar })).estado, 'ya-existia');
    assert.equal((await R.respaldarEnEquipo({ almacen, plano: '{}', tipo: 'diario', ahora: AHORA + DIA, codificar })).estado, 'sin-datos');
    assert.equal((await R.respaldarEnEquipo({ almacen, plano: undefined, tipo: 'diario', ahora: AHORA + DIA, codificar })).estado, 'sin-datos');
    for (let i = 1; i <= 9; i++) await R.respaldarEnEquipo({ almacen, plano: est, tipo: 'diario', ahora: AHORA + i * DIA, codificar });
    const lista = await R.listarEnEquipo({ almacen });
    assert.equal(lista.length, 7);
    assert.ok(lista.every(i => i.payload === undefined), 'la lista no arrastra los payloads');
    assert.equal(await decodificar((await almacen.leer(lista[0].id)).payload), est);
  });

  test('fusionar: una fila por respaldo con sus fuentes, lo más reciente primero', () => {
    const f = R.fusionar(
      [{ id: 'respaldo-2026-11-08', tipo: 'diario', fecha: '2026-11-08', creadoEn: 10, bytes: 100 }, { id: 'respaldo-2026-11-09', tipo: 'diario', fecha: '2026-11-09', creadoEn: 20, bytes: 120 }],
      [{ id: 'respaldo-2026-11-09', tipo: 'diario', fecha: '2026-11-09', creadoEn: 21, bytes: 118 }, { id: 'respaldo-2026-11-07', tipo: 'diario', fecha: '2026-11-07', creadoEn: 5, bytes: 90 }]);
    assert.deepEqual(f.map(x => x.id), ['respaldo-2026-11-09', 'respaldo-2026-11-08', 'respaldo-2026-11-07']);
    assert.deepEqual(f[0].fuentes, ['nube', 'equipo']);
    assert.deepEqual(f[2].fuentes, ['equipo']);
  });

  test('leerRespaldo: prefiere la nube, cae al equipo si la nube falla o no lo tiene, y falla claro si no hay de dónde', async () => {
    const codificar = async t => gz(t);
    const est = plano({ cuentas: [{ id: 'a', saldo: 1 }] });
    const almacen = R.almacenMemoria();
    await R.respaldarEnEquipo({ almacen, plano: est, tipo: 'diario', ahora: AHORA, codificar });
    const fila = { id: 'respaldo-2026-11-09', fuentes: ['nube', 'equipo'] };
    const { fb } = crearNube({ 'usuarios/u1/data/respaldo-2026-11-09': { payload: gz(plano({ cuentas: [{ id: 'a', saldo: 2 }] })) } });
    assert.equal(JSON.parse(await R.leerRespaldo({ fb, uid: 'u1', almacen, fila, decodificar })).cuentas[0].saldo, 2, 'la nube primero');
    const sinDoc = crearNube().fb;
    assert.equal(JSON.parse(await R.leerRespaldo({ fb: sinDoc, uid: 'u1', almacen, fila, decodificar })).cuentas[0].saldo, 1, 'la nube no lo tiene: equipo');
    const roto = { ...fb, getDoc: async () => { throw new Error('sin red'); } };
    assert.equal(JSON.parse(await R.leerRespaldo({ fb: roto, uid: 'u1', almacen, fila, decodificar })).cuentas[0].saldo, 1, 'la nube falla: equipo');
    await assert.rejects(R.leerRespaldo({ fb: roto, uid: 'u1', almacen: R.almacenMemoria(), fila, decodificar }), /sin red/);
  });

  test('borrarRespaldosNube: borra el índice, los respaldos y los huérfanos; no toca el documento principal ni otros', async () => {
    const { docs, fb } = crearNube({
      [PRINCIPAL]: { payload: '{"a":1}' }, 'usuarios/u1/data/notificaciones': { fcmTokens: ['t'] },
      [INDICE]: { items: [{ id: 'respaldo-2026-11-09' }] }, 'usuarios/u1/data/respaldo-2026-11-09': { payload: 'x' },
      'usuarios/u1/data/respaldo-previo-2026-11-09-101010': { payload: 'y' }, // huérfano: no está en el índice
    });
    const r = await R.borrarRespaldosNube({ fb, uid: 'u1' });
    assert.equal(r.errores, 0); assert.equal(r.borrados, 3);
    assert.deepEqual([...docs.keys()].sort(), ['usuarios/u1/data/finanzas', 'usuarios/u1/data/notificaciones']);
  });

  test('borrarRespaldosNube nunca lanza aunque Firestore rechace todo', async () => {
    const rechaza = async () => { throw Object.assign(new Error('denegado'), { code: 'permission-denied' }); };
    const { fb } = crearNube();
    const r = await R.borrarRespaldosNube({ fb: { ...fb, getDoc: rechaza, getDocs: rechaza, deleteDoc: rechaza }, uid: 'u1' });
    assert.ok(r.errores >= 1);
  });
});

// ── Integración con firebase-sync.js real ────────────────────────────────────────────────────────────────────────────
describe('respaldos — integración con el guardado (firebase-sync.js)', () => {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'respaldos-'));
  const escribir = (nombre, codigo) => { const p = path.join(TMP, nombre); fs.writeFileSync(p, codigo); return p; };
  const CODEC = escribir('codec.js', leer('payload-codec.js').replace(/^export\s+/gm, ''));
  const RESPALDOS = escribir('respaldos.js', leer('respaldos.js').replace(/^export\s+/gm, ''));
  const SYNC = escribir('sync.js', 'const waitFor = () => {};\n' + leer('firebase-sync.js').replace(/^import .*$/gm, ''));
  const guardar = app => { const p = app._fbSaveToCloud(); app._fbFlushSave(); return p; };
  let R;
  before(async () => { R = await import(pathToFileURL(path.join(CORE, 'respaldos.js')).href); });

  // Una app cargada con la nube simulada. `nubeInicial`: lo que ya hay en usuarios/u1/data/finanzas.
  async function entorno(nubeInicial, { denegarRespaldos = false } = {}) {
    const app = loadApp([CODEC, RESPALDOS, SYNC], { permissive: true });
    app.document = createFakeDom().document;
    Object.assign(app, { CompressionStream, DecompressionStream, Blob, Response, btoa, atob, TextEncoder, Uint8Array });
    const nube = crearNube(nubeInicial ? { [PRINCIPAL]: nubeInicial } : {});
    const store = {};
    app.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
    const avisos = []; app.toast = (m, tipo) => avisos.push({ m, tipo });
    app.load = () => {}; app.refresh = () => {}; app.applyModulos = () => {};
    app.window = app.window || app; app.window.dispatchEvent = () => {};
    const listeners = {};
    const base = nube.fb.runTransaction;
    let intentosRespaldo = 0;
    app._fb = {
      ...nube.fb,
      onSnapshot: (ref, opts, next, error) => { listeners.next = next; listeners.error = error; return () => {}; },
      // Simula reglas que NO dejan tocar los respaldos: cualquier transacción que escriba/lea fuera del documento principal falla.
      runTransaction: !denegarRespaldos ? base : async (db, fn) => {
        const tocaRespaldos = fn.toString().includes('ID_INDICE');
        if (tocaRespaldos) { intentosRespaldo++; throw Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }); }
        return base(db, fn);
      },
    };
    app._fbUser = { uid: 'u1' };
    app.S = { cuentas: [{ id: 'nequi', saldo: 1 }], libro: [] };
    app._almacenRespaldosPrueba = R.almacenMemoria();
    app._fbLoadData();
    listeners.next({ exists: () => nube.docs.has(PRINCIPAL), data: () => nube.docs.get(PRINCIPAL), metadata: { fromCache: false, hasPendingWrites: false } });
    await hasta(() => app._dataLoaded);
    return { app, nube, store, avisos, intentos: () => intentosRespaldo };
  }
  const doc0 = (saldo, rev = 3) => ({ payload: gz(plano({ cuentas: [{ id: 'nequi', saldo }], libro: [] })), updatedAt: Date.now() - 600000, rev });
  const respaldosNube = n => [...n.docs.keys()].filter(k => k.includes('/data/respaldo-'));

  test('el primer guardado del día deja el estado ANTERIOR en la nube y en el equipo; el segundo del mismo día no crea otro', async () => {
    const e = await entorno(doc0(1));
    e.app.S.cuentas[0].saldo = 50;
    assert.equal((await guardar(e.app)).ok, true);
    const hoy = R.fechaLocal();
    const copia = e.nube.docs.get('usuarios/u1/data/respaldo-' + hoy);
    assert.ok(copia, 'respaldo diario en la nube');
    assert.equal(JSON.parse(await decodificar(copia.payload)).cuentas[0].saldo, 1, 'contiene lo que había ANTES de guardar, no lo nuevo');
    assert.equal(JSON.parse(await decodificar(e.nube.docs.get(PRINCIPAL).payload)).cuentas[0].saldo, 50, 'y el guardado se hizo');
    const local = await e.app._almacenRespaldosPrueba.leer('respaldo-' + hoy);
    assert.ok(local, 'copia en el equipo');
    assert.equal(JSON.parse(await decodificar(local.payload)).cuentas[0].saldo, 1);
    e.app.S.cuentas[0].saldo = 60;
    await guardar(e.app);
    assert.equal(respaldosNube(e.nube).length, 1, 'nada nuevo el mismo día');
    assert.equal(JSON.parse(await decodificar(e.nube.docs.get('usuarios/u1/data/respaldo-' + hoy).payload)).cuentas[0].saldo, 1, 'el respaldo del día no se sobrescribe');
    assert.equal(e.store.mf_respaldoDia, hoy + '|u1');
  });

  test('al día siguiente se crea otro respaldo (con el estado con que terminó el día anterior)', async () => {
    const e = await entorno(doc0(1));
    e.app.S.cuentas[0].saldo = 50; await guardar(e.app);
    e.store.mf_respaldoDia = 'ayer|u1'; e.store.mf_respaldoEquipoDia = 'ayer|u1'; // pasa la medianoche
    e.nube.docs.delete('usuarios/u1/data/respaldo-' + R.fechaLocal()); e.nube.docs.delete(INDICE);
    await e.app._almacenRespaldosPrueba.borrar('respaldo-' + R.fechaLocal());
    e.app.S.cuentas[0].saldo = 70; await guardar(e.app);
    const copia = e.nube.docs.get('usuarios/u1/data/respaldo-' + R.fechaLocal());
    assert.equal(JSON.parse(await decodificar(copia.payload)).cuentas[0].saldo, 50, 'lo que terminó el día anterior');
  });

  test('un guardado sin cambios no genera respaldo (no hay nada que sobrescribir)', async () => {
    const e = await entorno(doc0(1));
    const r = await guardar(e.app);
    assert.equal(r.reason, 'no-changes');
    assert.equal(respaldosNube(e.nube).length, 0);
  });

  test('sin datos previos en la nube (usuario nuevo o documento vacío) no se respalda nada', async () => {
    const e = await entorno(null);
    e.app.S.cuentas[0].saldo = 5;
    assert.equal((await guardar(e.app)).ok, true);
    assert.equal(respaldosNube(e.nube).length, 0);
    assert.equal(e.store.mf_respaldoDia, undefined, 'el día no se marca: el próximo guardado vuelve a intentarlo cuando ya haya algo');
    e.app.S.cuentas[0].saldo = 6;
    await guardar(e.app);
    assert.equal(respaldosNube(e.nube).length, 1, 'ahora sí hay un estado anterior que proteger');
  });

  test('REGLAS DENEGADAS: guardar sigue funcionando, se avisa una sola vez y no se insiste en la sesión', async () => {
    const e = await entorno(doc0(1), { denegarRespaldos: true });
    e.app.S.cuentas[0].saldo = 50;
    const r = await guardar(e.app);
    assert.equal(r.ok, true, 'el guardado de los datos NO depende del respaldo');
    assert.equal(JSON.parse(await decodificar(e.nube.docs.get(PRINCIPAL).payload)).cuentas[0].saldo, 50);
    assert.equal(e.intentos(), 1);
    assert.equal(e.store.mf_respaldoError, 'permisos');
    assert.equal(e.avisos.filter(a => /respaldo/i.test(a.m)).length, 1);
    assert.equal(e.app._fbRespaldos.estado().bloqueado, true);
    e.app.S.cuentas[0].saldo = 51; await guardar(e.app);
    e.app.S.cuentas[0].saldo = 52; await guardar(e.app);
    assert.equal(e.intentos(), 1, 'no insiste: cero peticiones fallidas extra');
    assert.equal(e.avisos.filter(a => /respaldo/i.test(a.m)).length, 1, 'ni vuelve a avisar');
    assert.ok(await e.app._almacenRespaldosPrueba.leer('respaldo-' + R.fechaLocal()), 'la copia en el equipo funciona igual');
  });

  test('importar / restaurar (guardado forzado) deja un respaldo «previo» con lo que se pisa, aunque ya hubiera uno del día', async () => {
    const e = await entorno(doc0(1));
    e.app.S.cuentas[0].saldo = 50; await guardar(e.app); // diario del día
    e.app.S.cuentas[0].saldo = 999;                      // «el archivo importado»
    const p = e.app._fbSaveToCloud({ forzar: true }); e.app._fbFlushSave();
    assert.equal((await p).ok, true);
    const items = e.nube.docs.get(INDICE).items;
    const previo = items.find(i => i.tipo === 'previo');
    assert.ok(previo, 'hay un previo');
    assert.equal(JSON.parse(await decodificar(e.nube.docs.get('usuarios/u1/data/' + previo.id).payload)).cuentas[0].saldo, 50, 'guarda lo que había justo antes de pisar');
    assert.equal(JSON.parse(await decodificar(e.nube.docs.get(PRINCIPAL).payload)).cuentas[0].saldo, 999);
    assert.ok(items.some(i => i.tipo === 'diario'), 'el diario sigue');
  });

  test('«borrar todo»: la escritura vacía no deja previo y borrarTodos() limpia nube y equipo (y las marcas del día)', async () => {
    const e = await entorno(doc0(1));
    e.app.S.cuentas[0].saldo = 50; await guardar(e.app);
    assert.equal(respaldosNube(e.nube).length, 1);
    await e.app._fbEscribirDoc(plano({}), Date.now(), true, { sinRespaldo: true });
    assert.equal(e.nube.docs.get(INDICE).items.filter(i => i.tipo === 'previo').length, 0, 'sin previo');
    const r = await e.app._fbRespaldos.borrarTodos();
    assert.equal(r.errores, 0);
    assert.equal(respaldosNube(e.nube).length, 0);
    assert.equal(e.nube.docs.has(INDICE), false);
    assert.equal((await e.app._almacenRespaldosPrueba.listar()).length, 0);
    assert.equal(e.store.mf_respaldoDia, undefined);
    assert.ok(e.nube.docs.has(PRINCIPAL), 'el documento principal no lo toca borrarTodos()');
  });

  test('API para Configuración: listar junta nube y equipo; leer devuelve el JSON plano', async () => {
    const e = await entorno(doc0(1));
    e.app.S.cuentas[0].saldo = 50; await guardar(e.app);
    const { filas, errorNube } = await e.app._fbRespaldos.listar();
    assert.equal(errorNube, null);
    assert.equal(filas.length, 1);
    assert.deepEqual([...filas[0].fuentes], ['nube', 'equipo']); // copia al arreglo de este contexto (el de la app viene de otro `vm`)
    assert.equal(filas[0].tipo, 'diario');
    assert.equal(JSON.parse(await e.app._fbRespaldos.leer(filas[0])).cuentas[0].saldo, 1);
    assert.ok(e.app._fbRespaldos.estado().ultimo, 'recuerda cuándo se creó el último');
  });
});

// ── Pantalla: Configuración → Datos → Respaldos automáticos (js/modules/configuracion.js) ─────────────────────────────
describe('respaldos — pantalla de Configuración', () => {
  const MOD = f => path.join(__dirname, '..', 'js', 'modules', f);
  function pantalla({ filas = [], estado = { ultimo: null, error: null }, leerPlano, errorNube = null } = {}) {
    const ctx = loadApp([path.join(CORE, 'core-state.js'), path.join(CORE, 'html-tag.js'), path.join(CORE, 'events.js'), MOD('configuracion.js')], { permissive: true });
    const dom = createFakeDom();
    ctx.document = dom.document;
    const toasts = [], dialogos = [], pins = [], guardados = [];
    ctx.toast = (m, t) => toasts.push({ m, t });
    ctx.dialogo = async (titulo, msg) => { dialogos.push({ titulo, msg }); return true; };
    ctx.pedirPinAntesDe = async motivo => { pins.push(motivo); return true; };
    ctx.refresh = () => {};
    ctx.location = { reload() { ctx.__recargo = true; } };
    ctx.window = ctx.window || ctx; ctx.window._fbRespaldos = { estado: () => estado, listar: async () => ({ filas, errorNube }), leer: async fila => leerPlano(fila) };
    ctx.window._fbSaveToCloud = async opts => { guardados.push(opts); return { ok: true }; };
    ctx._fbRespaldos = ctx.window._fbRespaldos; ctx._fbSaveToCloud = ctx.window._fbSaveToCloud;
    return { ctx, dom, toasts, dialogos, pins, guardados };
  }
  const fila = (id, extra = {}) => ({ id, tipo: 'diario', fecha: '2026-11-09', creadoEn: AHORA, bytes: 12345, fuentes: ['nube', 'equipo'], ...extra });
  const valido = (saldo = 1) => plano({ schemaVersion: undefined, cuentas: [{ id: 'nequi', nombre: 'Nequi', tipo: 'billetera', saldo }], libro: [], gastosVar: [] });

  test('estado: sin respaldos todavía, con el último creado y con permisos denegados', () => {
    let p = pantalla();
    p.ctx.renderRespaldos();
    const html1 = p.dom.document.getElementById('cfg-respaldos').innerHTML;
    assert.match(html1, /Todavía no se ha creado ningún respaldo/);
    assert.match(html1, /data-action="config:verRespaldos"/);
    p = pantalla({ estado: { ultimo: { creadoEn: AHORA }, error: null } });
    p.ctx.renderRespaldos();
    assert.match(p.dom.document.getElementById('cfg-respaldos').innerHTML, /Último respaldo creado: 9 de noviembre de 2026/);
    p = pantalla({ estado: { ultimo: null, error: 'permisos' } });
    p.ctx.renderRespaldos();
    const h = p.dom.document.getElementById('cfg-respaldos').innerHTML;
    assert.match(h, /reglas de Firestore/); assert.match(h, /cfg-resp-aviso/);
  });

  test('lista: una fila por respaldo con fecha, tamaño, dónde está y un botón Restaurar con su id', async () => {
    const p = pantalla({ filas: [fila('respaldo-2026-11-09'), fila('respaldo-previo-2026-11-09-153000', { tipo: 'previo', fuentes: ['nube'], creadoEn: new Date(2026, 10, 9, 15, 30).getTime() })] });
    p.ctx.renderRespaldos();
    await p.ctx.verRespaldos();
    const h = p.dom.document.getElementById('cfg-respaldos-lista').innerHTML;
    assert.match(h, /9 de noviembre de 2026/);
    assert.match(h, /Así quedó todo al empezar el día · 12 KB · nube y este dispositivo/);
    assert.match(h, /Antes de importar o restaurar · 12 KB · nube/);
    assert.match(h, /9 de noviembre de 2026, 15:30/);
    assert.equal((h.match(/data-action="config:restaurarRespaldo"/g) || []).length, 2);
    assert.match(h, /respaldo-previo-2026-11-09-153000/);
  });

  test('el botón alterna «Ver respaldos» ⇄ «Ocultar respaldos»: el segundo clic oculta la lista y no vuelve a cargarla', async () => {
    let cargas = 0;
    const p = pantalla({ filas: [fila('respaldo-2026-11-09')] });
    const orig = p.ctx.window._fbRespaldos.listar;
    p.ctx.window._fbRespaldos.listar = async () => { cargas++; return orig(); };
    p.ctx.renderRespaldos();
    const doc = p.dom.document;
    const btn = () => doc.getElementById('cfg-resp-ver-btn');
    assert.match(doc.getElementById('cfg-respaldos').innerHTML, /id="cfg-resp-ver-btn"[^>]*aria-expanded="false"[^>]*>Ver respaldos</);
    await p.ctx.verRespaldos();
    assert.equal(btn().textContent, 'Ocultar respaldos');
    assert.match(doc.getElementById('cfg-respaldos-lista').innerHTML, /cfg-resp-fila/);
    await p.ctx.verRespaldos();
    assert.equal(doc.getElementById('cfg-respaldos-lista').innerHTML, '');
    assert.equal(btn().textContent, 'Ver respaldos');
    assert.equal(cargas, 1, 'ocultar no vuelve a pedir la lista');
    await p.ctx.verRespaldos();
    assert.equal(cargas, 2); assert.match(doc.getElementById('cfg-respaldos-lista').innerHTML, /cfg-resp-fila/);
  });

  test('lista vacía y lista con la nube caída: mensajes claros', async () => {
    let p = pantalla();
    p.ctx.renderRespaldos(); await p.ctx.verRespaldos();
    assert.match(p.dom.document.getElementById('cfg-respaldos-lista').innerHTML, /Aún no hay respaldos/);
    p = pantalla({ filas: [fila('respaldo-2026-11-09', { fuentes: ['equipo'] })], errorNube: 'unavailable' });
    p.ctx.renderRespaldos(); await p.ctx.verRespaldos();
    assert.match(p.dom.document.getElementById('cfg-respaldos-lista').innerHTML, /No se pudo leer la lista de la nube \(unavailable\)/);
  });

  test('restaurar: valida, confirma, pide el PIN, reemplaza los datos y guarda con escritura FORZADA (deja un previo)', async () => {
    const p = pantalla({ filas: [fila('respaldo-2026-11-09')], leerPlano: async () => valido(777) });
    p.ctx.S.cuentas = [{ id: 'otra', nombre: 'Otra', tipo: 'banco', saldo: 1 }]; p.ctx.S.cuentasViejas = true;
    p.ctx.renderRespaldos(); await p.ctx.verRespaldos();
    await p.ctx.restaurarRespaldo('respaldo-2026-11-09');
    assert.equal(p.dialogos.length, 1);
    assert.match(p.dialogos[0].msg, /9 de noviembre de 2026/); assert.match(p.dialogos[0].msg, /también podrás deshacerlo/);
    assert.deepEqual(p.pins, ['Para restaurar el respaldo del 9 de noviembre de 2026']);
    assert.equal(p.ctx.S.cuentas[0].saldo, 777);
    assert.equal(p.ctx.S.cuentasViejas, undefined, 'S se reemplaza completo, no se mezcla');
    assert.deepEqual(p.guardados.map(g => ({ ...g })), [{ forzar: true }]);
    assert.ok(p.toasts.some(t => /Respaldo restaurado/.test(t.m)));
    await esperar(900); assert.equal(p.ctx.__recargo, true, 'recarga solo tras confirmar el guardado');
  });

  test('restaurar: un respaldo ilegible o que no pasa la validación NO reemplaza nada ni pregunta', async () => {
    for (const [leerPlano, esperado] of [[async () => 'gz1:esto-no-es-json', /No se pudo leer/], [async () => plano({ cuentas: 'no-array' }), /no es válido/], [async () => { throw new Error('sin red'); }, /No se pudo leer/]]) {
      const p = pantalla({ filas: [fila('respaldo-2026-11-09')], leerPlano });
      p.ctx.S.cuentas = [{ id: 'a', nombre: 'A', tipo: 'banco', saldo: 5 }];
      p.ctx.renderRespaldos(); await p.ctx.verRespaldos();
      await p.ctx.restaurarRespaldo('respaldo-2026-11-09');
      assert.match(p.toasts[p.toasts.length - 1].m, esperado);
      assert.equal(p.dialogos.length, 0); assert.equal(p.guardados.length, 0);
      assert.equal(p.ctx.S.cuentas[0].saldo, 5, 'los datos actuales siguen intactos');
    }
  });

  test('restaurar: si se cancela el PIN no se toca nada', async () => {
    const p = pantalla({ filas: [fila('respaldo-2026-11-09')], leerPlano: async () => valido(777) });
    p.ctx.pedirPinAntesDe = async () => false;
    p.ctx.S.cuentas = [{ id: 'a', nombre: 'A', tipo: 'banco', saldo: 5 }];
    p.ctx.renderRespaldos(); await p.ctx.verRespaldos();
    await p.ctx.restaurarRespaldo('respaldo-2026-11-09');
    assert.equal(p.ctx.S.cuentas[0].saldo, 5); assert.equal(p.guardados.length, 0);
  });
});
