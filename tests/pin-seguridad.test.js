'use strict';
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
  // Tras un PIN incorrecto el campo se vacía a los 430 ms (la sacudida): se espera ese tiempo antes del siguiente intento.
  const escribir = async txt => { for (const c of txt) window._pinKey(c); await espera(520); };
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
