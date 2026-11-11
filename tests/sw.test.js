'use strict';
// M8 — Service Worker: precaché atómico por versión, base derivada del scope, un solo aviso, notificationclick enfoca.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { listaPrecache } = require('../scripts/sellar-sw.js');

const raiz = path.join(__dirname, '..');
const swSrc = fs.readFileSync(path.join(raiz, 'sw.js'), 'utf8');

// Mini-entorno de Service Worker: caches, clients, registration y un registro de eventos.
function crearSW({ scope = 'https://x.github.io/mis-finanzas/', red = {} } = {}) {
  const almacenes = new Map(); // nombre → Map(url → respuesta)
  const norm = (req, ignoreSearch) => { const u = new URL(typeof req === 'string' ? req : req.url, scope); if (ignoreSearch) u.search = ''; return u.href; };
  const abrir = nombre => {
    if (!almacenes.has(nombre)) almacenes.set(nombre, new Map());
    const m = almacenes.get(nombre);
    return {
      match: async (req, o = {}) => {
        const u = norm(req, o.ignoreSearch);
        for (const [k, v] of m) { if ((o.ignoreSearch ? k.split('?')[0] : k) === u) return v; }
      },
      put: async (req, res) => { m.set(norm(req), res); },
      addAll: async reqs => {
        for (const r of reqs) { if (red[norm(r)] === 'falla') throw new Error('red ' + norm(r)); }
        reqs.forEach(r => m.set(norm(r), { url: norm(r), cuerpo: 'precache' }));
      },
    };
  };
  const eventos = {};
  const abiertas = [];
  const ventanas = [];
  const ctx = {
    console, URL, Request: class { constructor(u, o) { this.url = new URL(u, scope).href; this.mode = (o && o.mode) || 'cors'; this.method = 'GET'; this.cache = o && o.cache; } },
    Response: class { constructor(b, o) { this.cuerpo = b; this.status = (o && o.status) || 200; } },
    importScripts() {},
    firebase: { initializeApp() {}, messaging: () => ({ onBackgroundMessage(fn) { ctx._bg = fn; } }) },
    fetch: async req => { const u = typeof req === 'string' ? req : req.url; if (red[u] === 'falla') throw new Error('sin red'); return { ok: true, url: u, cuerpo: 'red' }; },
    caches: {
      open: async n => abrir(n),
      keys: async () => [...almacenes.keys()],
      delete: async n => almacenes.delete(n),
      match: async req => { for (const m of almacenes.values()) { const v = m.get(norm(req)); if (v) return v; } },
    },
    clients: { matchAll: async () => ventanas, openWindow: async u => { abiertas.push(u); }, claim: async () => {} },
  };
  ctx.self = ctx;
  ctx.self.registration = { scope, showNotification: async (t, o) => { ctx._mostradas.push({ t, o }); } };
  ctx.self.location = new URL(scope + 'sw.js');
  ctx.self.addEventListener = (n, f) => { eventos[n] = f; };
  ctx.self.skipWaiting = () => { ctx._skip = true; };
  ctx.self.clients = ctx.clients;
  ctx._mostradas = [];
  vm.createContext(ctx);
  vm.runInContext(swSrc, ctx);
  const esperar = async fn => { let p; fn({ waitUntil: x => { p = x; }, respondWith: x => { p = x; } }); return p; };
  return { ctx, almacenes, eventos, abiertas, ventanas, esperar };
}

describe('PRECACHE', () => {
  test('lo sellado coincide con lo desplegable y cubre index, css, js e iconos', () => {
    const m = /\/\/ <PRECACHE>[\s\S]*?const PRECACHE = (\[[\s\S]*?\]);\n\/\/ <\/PRECACHE>/.exec(swSrc);
    assert.ok(m, 'sw.js debe tener el bloque PRECACHE');
    const enSw = JSON.parse(m[1]);
    assert.deepEqual(enSw, listaPrecache(raiz), 'PRECACHE desactualizado: corre node scripts/sellar-sw.js');
    for (const f of ['./', 'index.html', 'css/styles.css', 'js/core/core-state.js', 'js/core/sw-registro.js', 'js/modules/spotify.js', 'manifest.webmanifest']) assert.ok(enSw.includes(f), f);
    assert.ok(!enSw.includes('sw.js'));
  });
  test('todo <script src> de index.html está en el precaché (offline completo)', () => {
    const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
    const lista = new Set(listaPrecache(raiz));
    const faltan = [...html.matchAll(/<script[^>]+src="(js\/[^"]+)"/g)].map(m => m[1]).filter(f => !lista.has(f));
    assert.deepEqual(faltan, []);
  });
});

describe('ciclo de vida del SW', () => {
  test('install baja todo a la caché de la versión; si uno falla, la instalación falla (no queda a medias)', async () => {
    const { ctx, eventos, almacenes, esperar } = crearSW();
    await esperar(eventos.install);
    const nombre = [...almacenes.keys()].find(k => k.startsWith('mis-finanzas-v'));
    assert.ok(nombre);
    assert.ok(almacenes.get(nombre).has('https://x.github.io/mis-finanzas/index.html'));
    assert.ok(almacenes.get(nombre).has('https://x.github.io/mis-finanzas/'));
    assert.equal(ctx._skip, undefined, 'no se activa solo');
    const roto = crearSW({ red: { 'https://x.github.io/mis-finanzas/js/core/ui.js': 'falla' } });
    await assert.rejects(roto.esperar(roto.eventos.install));
  });
  test('SKIP_WAITING solo por mensaje', () => {
    const { ctx, eventos } = crearSW();
    eventos.message({ data: { tipo: 'otra' } });
    assert.equal(ctx._skip, undefined);
    eventos.message({ data: { tipo: 'SKIP_WAITING' } });
    assert.equal(ctx._skip, true);
  });
  test('activate borra versiones viejas de la app pero conserva la caché de fuentes/SDK', async () => {
    const { ctx, eventos, almacenes, esperar } = crearSW();
    await esperar(eventos.install);
    almacenes.set('mis-finanzas-v1-viejo', new Map());
    almacenes.set('mis-finanzas-ext', new Map([['x', 1]]));
    await esperar(eventos.activate);
    assert.ok(!almacenes.has('mis-finanzas-v1-viejo'));
    assert.ok(almacenes.has('mis-finanzas-ext'));
    assert.equal([...almacenes.keys()].filter(k => k.startsWith('mis-finanzas-v')).length, 1);
  });
});

describe('fetch', () => {
  const get = (u, extra) => ({ method: 'GET', url: u, mode: 'no-cors', ...extra });
  test('la app se sirve de la caché de la versión (también con ?query), sin ir a la red', async () => {
    const s = crearSW();
    await s.esperar(s.eventos.install);
    s.ctx.fetch = async () => { throw new Error('no debe ir a la red'); };
    let resp;
    s.eventos.fetch({ request: get('https://x.github.io/mis-finanzas/js/core/ui.js?v=3'), respondWith: p => { resp = p; } });
    const res = await resp;
    assert.equal(res.cuerpo, 'precache');
  });
  test('navegar sin conexión devuelve el index precacheado', async () => {
    const s = crearSW();
    await s.esperar(s.eventos.install);
    let resp;
    s.eventos.fetch({ request: get('https://x.github.io/mis-finanzas/otra-ruta', { mode: 'navigate' }), respondWith: p => { resp = p; } });
    const res = await resp;
    assert.equal(res.url, 'https://x.github.io/mis-finanzas/');
  });
  test('Firestore no pasa por el SW', () => {
    const s = crearSW();
    let llamado = false;
    s.eventos.fetch({ request: get('https://firestore.googleapis.com/x'), respondWith: () => { llamado = true; } });
    assert.equal(llamado, false);
  });
});

describe('notificaciones', () => {
  test('el handler muestra UN aviso desde un mensaje solo-datos, con base derivada del scope', async () => {
    const s = crearSW({ scope: 'https://otro.dominio/app/' });
    await s.ctx._bg({ data: { title: 'T', body: 'B' } });
    assert.equal(s.ctx._mostradas.length, 1);
    assert.equal(s.ctx._mostradas[0].t, 'T');
    assert.equal(s.ctx._mostradas[0].o.icon, '/app/icons/icon-192.png');
    assert.equal(s.ctx._mostradas[0].o.data.url, '/app/');
  });
  test('notificationclick enfoca la ventana abierta en vez de abrir otra', async () => {
    const s = crearSW();
    let enfocada = false, navegada = null;
    s.ventanas.push({ url: 'https://x.github.io/mis-finanzas/', focus: async () => { enfocada = true; }, navigate: async u => { navegada = u; } });
    await s.esperar(f => s.eventos.notificationclick({ notification: { close() {}, data: { url: 'https://x.github.io/mis-finanzas/' } }, waitUntil: f.waitUntil }));
    assert.equal(enfocada, true);
    assert.equal(s.abiertas.length, 0);
  });
  test('notificationclick abre ventana si la app no está abierta', async () => {
    const s = crearSW();
    await s.esperar(f => s.eventos.notificationclick({ notification: { close() {}, data: {} }, waitUntil: f.waitUntil }));
    assert.deepEqual(s.abiertas, ['https://x.github.io/mis-finanzas/']);
  });
});

describe('sin rutas fijas', () => {
  test('ningún archivo del cliente ni sw.js escribe «/mis-finanzas/» (el repo puede cambiar de nombre)', () => {
    const archivos = ['sw.js', ...fs.readdirSync(path.join(raiz, 'js'), { recursive: true }).filter(f => f.endsWith('.js')).map(f => path.join('js', f))];
    const malos = archivos.filter(f => /['"`]\/mis-finanzas\//.test(fs.readFileSync(path.join(raiz, f), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')));
    assert.deepEqual(malos, []);
  });
  test('el mensaje de push es solo-datos', () => {
    const src = fs.readFileSync(path.join(raiz, 'scripts/notificaciones/run.js'), 'utf8').replace(/\/\/.*$/gm, '');
    assert.ok(!/notification:\s*\{\s*title/.test(src));
    assert.ok(/data:\s*\{\s*title/.test(src));
  });
});
