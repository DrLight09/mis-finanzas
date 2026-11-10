// tests/notificaciones-push.test.js — botón «Notificaciones» (js/core/notificaciones-push.js): respuesta inmediata, reintento ante
// «push service error», mensajes por causa y un solo registro a la vez.
// Corre con:  node --test tests/notificaciones-push.test.js   (o todo: npm test)
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadApp } = require('./support/load-app');
const { createFakeDom } = require('./support/fake-dom');

const FILE = path.join(__dirname, '..', 'js', 'core', 'notificaciones-push.js');
const esperar = ms => new Promise(r => setTimeout(r, ms));
const PUSH_ERR = () => Object.assign(new Error('Registration failed - push service error'), { name: 'AbortError', code: 'messaging/token-subscribe-failed' });

function entorno({ getToken, permiso = 'granted', online = true, setDoc, ua = 'Chrome', brave = false } = {}) {
  const ctx = loadApp([FILE], { permissive: true });
  const dom = createFakeDom({ 'cfg-notificaciones-sub': { textContent: 'Avisos de Spotify, CDT y encargos por vencer' }, 'cfg-notificaciones-row': {} });
  ctx.document = dom.document;
  dom.document.getElementById('cfg-notificaciones-row').removeAttribute = () => {}; // el DOM simulado no lo trae
  const store = {};
  ctx.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  const toasts = []; ctx.toast = (m, t) => toasts.push({ m, t });
  const calls = { getToken: 0, deleteToken: 0, unsub: 0, setDoc: 0, permisoPedido: 0 };
  const swReg = { pushManager: { getSubscription: async () => ({ unsubscribe: async () => { calls.unsub++; return true; } }) } };
  const messaging = { getToken: async () => { calls.getToken++; return getToken(calls.getToken); }, deleteToken: async () => { calls.deleteToken++; } };
  ctx.firebase = { apps: [], initializeApp: () => ({ name: 'messaging' }), messaging: () => messaging };
  ctx.Notification = { permission: permiso, requestPermission: async () => { calls.permisoPedido++; return permiso; } };
  ctx.navigator = { serviceWorker: { ready: Promise.resolve(swReg) }, onLine: online, userAgent: ua, ...(brave ? { brave: { isBrave: async () => true } } : {}) };
  ctx.window = ctx.window || ctx;
  ctx.window.Notification = ctx.Notification;
  ctx.window._fbUser = { uid: 'u1' };
  ctx.window._fb = { db: {}, doc: () => ({}), arrayUnion: t => ({ t }), setDoc: setDoc || (async () => { calls.setDoc++; }) };
  ctx._fbUser = ctx.window._fbUser; ctx._fb = ctx.window._fb;
  const sub = () => dom.document.getElementById('cfg-notificaciones-sub').textContent;
  return { ctx, toasts, calls, store, sub, dom };
}

describe('notificaciones — mensajes por causa', () => {
  const { _mensajePushError: msg } = entorno().ctx;
  test('push service error: explica que es del navegador y da pistas según Brave / iPhone / otro', () => {
    assert.match(msg(PUSH_ERR(), {}), /servicio de notificaciones/);
    assert.match(msg(PUSH_ERR(), { brave: true }), /Brave.*mensajería push/);
    assert.match(msg(PUSH_ERR(), { ios: true }), /pantalla de inicio/);
  });
  test('sin conexión, permiso bloqueado, API key y error desconocido', () => {
    assert.match(msg(new Error('x'), { sinConexion: true }), /No hay conexión/);
    assert.match(msg({ code: 'messaging/permission-blocked' }), /bloqueadas/);
    assert.match(msg({ code: 'messaging/token-subscribe-failed', message: 'API key not valid' }), /clave de API/);
    assert.match(msg(new Error('algo raro')), /No se pudo activar: algo raro/);
  });
});

describe('notificaciones — activar', () => {
  test('camino feliz: «Activando…» al instante, un solo getToken, guarda el token y queda «Activadas»', async () => {
    const e = entorno({ getToken: async () => 'tok1' });
    assert.equal(e.sub(), 'Avisos de Spotify, CDT y encargos por vencer');
    const p = e.ctx.activarNotificaciones();
    assert.equal(e.sub(), 'Activando…', 'respuesta inmediata, antes de esperar nada');
    await p;
    assert.equal(e.calls.getToken, 1); assert.equal(e.calls.setDoc, 1);
    assert.equal(e.sub(), 'Activadas en este dispositivo');
    assert.deepEqual(e.toasts.map(t => t.m), ['Notificaciones activadas']);
    assert.equal(e.store.mf_push_ok, '1');
    assert.equal(e.calls.permisoPedido, 0, 'permiso ya concedido: no se vuelve a pedir');
  });

  test('«push service error» se reintenta una vez borrando la suscripción vieja y funciona', async () => {
    const e = entorno({ getToken: async n => { if (n === 1) throw PUSH_ERR(); return 'tok2'; } });
    await e.ctx.activarNotificaciones();
    assert.equal(e.calls.getToken, 2);
    assert.equal(e.calls.unsub, 1); assert.equal(e.calls.deleteToken, 1);
    assert.deepEqual(e.toasts.map(t => t.t), ['ok']);
  });

  test('si el reintento también falla: mensaje claro, el texto de la fila vuelve y no queda marcado como activo', async () => {
    const e = entorno({ getToken: async () => { throw PUSH_ERR(); } });
    await e.ctx.activarNotificaciones();
    assert.equal(e.calls.getToken, 2, 'un solo reintento, no un bucle');
    assert.equal(e.toasts.length, 1); assert.equal(e.toasts[0].t, 'err');
    assert.match(e.toasts[0].m, /servicio de notificaciones/);
    assert.equal(e.sub(), 'Avisos de Spotify, CDT y encargos por vencer');
    assert.equal(e.store.mf_push_ok, undefined);
  });

  test('en Brave el mensaje dice qué ajuste activar', async () => {
    const e = entorno({ getToken: async () => { throw PUSH_ERR(); }, brave: true });
    await e.ctx.activarNotificaciones();
    assert.match(e.toasts[0].m, /brave:\/\/settings\/privacy/);
  });

  test('sin conexión no intenta registrar', async () => {
    const e = entorno({ getToken: async () => 'x', online: false });
    await e.ctx.activarNotificaciones();
    assert.equal(e.calls.getToken, 0);
    assert.match(e.toasts[0].m, /No hay conexión/);
  });

  test('permiso denegado: dice cómo desbloquearlo y no registra nada', async () => {
    const e = entorno({ getToken: async () => 'x', permiso: 'denied' });
    await e.ctx.activarNotificaciones();
    assert.equal(e.calls.getToken, 0);
    assert.match(e.toasts[0].m, /bloqueadas para este sitio/);
    assert.equal(e.sub(), 'Avisos de Spotify, CDT y encargos por vencer');
  });

  test('un segundo toque mientras registra se ignora (un solo registro)', async () => {
    const e = entorno({ getToken: async () => { await esperar(40); return 'tok'; } });
    const a = e.ctx.activarNotificaciones(); const b = e.ctx.activarNotificaciones();
    await Promise.all([a, b]);
    assert.equal(e.calls.getToken, 1); assert.equal(e.toasts.length, 1);
  });

  test('si Firestore tarda en confirmar no se hace esperar más de ~3 s, y un fallo tardío se avisa', async () => {
    let rechazar;
    const e = entorno({ getToken: async () => 'tok', setDoc: () => new Promise((_, rej) => { rechazar = rej; }) });
    const t0 = Date.now();
    await e.ctx.activarNotificaciones();
    assert.ok(Date.now() - t0 < 4500, 'no se queda esperando la nube');
    assert.equal(e.toasts[0].m, 'Notificaciones activadas');
    rechazar(new Error('sin permiso')); await esperar(20);
    assert.ok(e.toasts.some(t => t.t === 'err' && /sin permiso/.test(t.m)), 'el fallo tardío no se pierde en silencio');
  });

  test('al abrir la app, si ya estaba activo y el permiso sigue concedido, la fila lo dice; si se revocó, no', () => {
    const e = entorno({ getToken: async () => 'x' });
    e.store.mf_push_ok = '1'; e.ctx._refrescarEstadoPush();
    assert.equal(e.sub(), 'Activadas en este dispositivo');
    const e2 = entorno({ getToken: async () => 'x', permiso: 'denied' });
    e2.store.mf_push_ok = '1'; e2.ctx._refrescarEstadoPush();
    assert.equal(e2.sub(), 'Avisos de Spotify, CDT y encargos por vencer');
    assert.equal(e2.store.mf_push_ok, undefined, 'la marca vieja se limpia');
  });
});
