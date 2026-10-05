// tests/transferir.test.js — validación y confirmación de Transferir (cuentas.js)
// Corre con:  node --test tests/transferir.test.js
// Carga los archivos REALES con tests/support/load-app.js (permissive: cuentas.js
// referencia funciones de UI que el harness no carga). Orden = index.html:
// core-state → calc-helpers → cuenta-efectos → cuentas.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const RAIZ = path.join(__dirname, '..');
const core = f => path.join(RAIZ, 'js', 'core', f);
const modulo = f => path.join(RAIZ, 'js', 'modules', f);
const ARCHIVOS = [core('core-state.js'), core('calc-helpers.js'), core('cuenta-efectos.js'), modulo('cuentas.js')];
const plano = x => JSON.parse(JSON.stringify(x)); // objetos del vm → datos planos

function cargar() { return loadApp(ARCHIVOS, { permissive: true }); }
const validar = cargar().validarTransferencia;
const T = o => validar({ saldoOrigen: 1e9, ...o });

describe('validarTransferencia — formulario incompleto o inválido', () => {
  test('sin origen o sin destino → falta_cuenta', () => {
    assert.equal(T({ origen: '', destino: 'nequi', monto: 100 }).codigo, 'falta_cuenta');
    assert.equal(T({ origen: 'nequi', destino: '', monto: 100 }).codigo, 'falta_cuenta');
    assert.equal(validar().codigo, 'falta_cuenta');
  });
  test('origen igual a destino → mismo (antes que el monto)', () => {
    assert.equal(T({ origen: 'nequi', destino: 'nequi', monto: 100 }).codigo, 'mismo');
    assert.equal(T({ origen: 'nequi', destino: 'nequi', monto: 0 }).codigo, 'mismo');
  });
  test('monto 0, negativo, NaN, Infinity, texto o ausente → sin_monto', () => {
    for (const monto of [0, -100, -0.01, NaN, Infinity, -Infinity, '100', null, undefined]) {
      const r = T({ origen: 'cajita:a', destino: 'cajita:b', monto });
      assert.equal(r.ok, false, `monto ${String(monto)} debía fallar`);
      assert.equal(r.codigo, 'sin_monto', `monto ${String(monto)}`);
    }
  });
  test('monto menor a medio centavo (redondea a 0) → sin_monto', () => {
    assert.equal(T({ origen: 'cajita:a', destino: 'cajita:b', monto: 0.004 }).codigo, 'sin_monto');
  });
});

describe('validarTransferencia — centavos', () => {
  test('entre cajitas de Nu SÍ se aceptan centavos', () => {
    assert.deepEqual(plano(T({ origen: 'cajita:a', destino: 'cajita:b', monto: 9.9 })), { ok: true });
    assert.deepEqual(plano(T({ origen: 'cajita:a', destino: 'cajita:b', monto: 0.01 })), { ok: true });
  });
  test('cajita → Nequi exige entero (9 y 10 sí, 9,90 no)', () => {
    assert.equal(T({ origen: 'cajita:a', destino: 'nequi', monto: 9 }).ok, true);
    assert.equal(T({ origen: 'cajita:a', destino: 'nequi', monto: 10 }).ok, true);
    const r = T({ origen: 'cajita:a', destino: 'nequi', monto: 9.9 });
    assert.equal(r.codigo, 'monto');
    assert.match(r.mensaje, /Solo entre cajitas de Nu/);
  });
  test('con cuenta personalizada exige entero, en cualquier dirección', () => {
    assert.equal(T({ origen: 'custom:x', destino: 'cajita:a', monto: 100.5 }).codigo, 'monto');
    assert.equal(T({ origen: 'cajita:a', destino: 'custom:x', monto: 100.5 }).codigo, 'monto');
    assert.equal(T({ origen: 'custom:x', destino: 'nequi', monto: 100.5 }).codigo, 'monto');
    assert.equal(T({ origen: 'custom:x', destino: 'nequi', monto: 100 }).ok, true);
  });
  test('con Efectivo y centavos, el mensaje habla del efectivo', () => {
    const r = T({ origen: 'efectivo', destino: 'nequi', monto: 100.5 });
    assert.equal(r.codigo, 'monto');
    assert.match(r.mensaje, /El efectivo no tiene centavos/);
  });
  test('0,1 + 0,2 (flotantes) no cuela centavos falsos', () => {
    assert.equal(T({ origen: 'nequi', destino: 'custom:x', monto: 0.1 + 0.2 }).codigo, 'monto');
  });
});

describe('validarTransferencia — mínimo con Efectivo', () => {
  test('$49 falla, $50 pasa (desde y hacia Efectivo)', () => {
    for (const [origen, destino] of [['efectivo', 'nequi'], ['nequi', 'efectivo'], ['cajita:a', 'efectivo'], ['efectivo', 'custom:x']]) {
      const bajo = T({ origen, destino, monto: 49 });
      assert.equal(bajo.codigo, 'monto', `${origen}→${destino}`);
      assert.match(bajo.mensaje, /mínimo.*Efectivo/i);
      assert.equal(T({ origen, destino, monto: 50 }).ok, true, `${origen}→${destino}`);
    }
  });
  test('sin Efectivo no hay mínimo ($1 entre Nequi y personalizada, o entre cajitas)', () => {
    assert.equal(T({ origen: 'nequi', destino: 'custom:x', monto: 1 }).ok, true);
    assert.equal(T({ origen: 'cajita:a', destino: 'cajita:b', monto: 1 }).ok, true);
  });
});

describe('validarTransferencia — saldo', () => {
  test('monto mayor al saldo → saldo, con la etiqueta recibida y fmt real', () => {
    const r = validar({ origen: 'nequi', destino: 'efectivo', monto: 500, saldoOrigen: 499, etiquetaOrigen: 'Nequi' });
    assert.equal(r.codigo, 'saldo');
    assert.match(r.mensaje, /Saldo insuficiente en Nequi \(\$499\)/);
  });
  test('monto igual al saldo pasa (mover todo)', () => {
    assert.equal(validar({ origen: 'nequi', destino: 'efectivo', monto: 500, saldoOrigen: 500 }).ok, true);
  });
  test('compara en centavos: 100,10 contra 100,10 pasa; contra 100,09 no', () => {
    assert.equal(validar({ origen: 'cajita:a', destino: 'cajita:b', monto: 100.1, saldoOrigen: 100.1 }).ok, true);
    assert.equal(validar({ origen: 'cajita:a', destino: 'cajita:b', monto: 100.1, saldoOrigen: 100.09 }).codigo, 'saldo');
  });
  test('sin saldoOrigen numérico no se valida saldo (uso de la vista previa)', () => {
    assert.equal(validar({ origen: 'nequi', destino: 'efectivo', monto: 500 }).ok, true);
    assert.equal(validar({ origen: 'nequi', destino: 'efectivo', monto: 500, saldoOrigen: NaN }).ok, true);
  });
  test('un error de monto se avisa antes que el de saldo', () => {
    assert.equal(validar({ origen: 'nequi', destino: 'efectivo', monto: 10, saldoOrigen: 1 }).codigo, 'monto');
  });
});

// ── confirmarTransferir: cableado completo con las funciones reales de saldo ──
// getSaldoActual vive en index.html (no se carga acá): se enlaza a getSaldoFuente
// de core-state. El resto (descontarFuente/sumarFuente/fmt/escHtml/parseMoney/uid) es el real.
function entorno({ origen, destino, monto, nota = '', nequi = 0, efectivo = 0 }) {
  const app = cargar();
  const campos = { tr_origen: origen, tr_destino: destino, tr_monto: monto, tr_nota: nota, tr_fecha: '2026-10-04' };
  app.document.getElementById = id => (id in campos ? { value: campos[id] } : null);
  const toasts = [], cerrados = [];
  let guardados = 0;
  app.toast = (msg, tipo, ms) => toasts.push({ msg, tipo, ms });
  app.closeSheet = n => cerrados.push(n);
  app.save = () => { guardados++; };
  app.refresh = () => {};
  app.fuenteLabel = f => ({ nequi: 'Nequi', efectivo: 'Efectivo', 'custom:x': 'Ahorro <x>' }[f] || f);
  // window.S === S (core-state.js:127), así que el test lee/escribe el estado real.
  app.getSaldoActual = f => app.getSaldoFuente(f);
  // Los saldos viven en S.cuentas[] (no en S.nequiSaldo, que es el modelo viejo).
  app.getCuenta('nequi').saldo = nequi; app.getCuenta('efectivo').saldo = efectivo; app.S.transferencias = [];
  const estado = () => plano({ n: app.getCuenta('nequi').saldo, e: app.getCuenta('efectivo').saldo, t: app.S.transferencias });
  return { app, toasts, cerrados, estado, guardados: () => guardados };
}
const intacto = (e, inicial) => {
  assert.deepEqual(e.estado(), inicial);
  assert.equal(e.guardados(), 0);
  assert.equal(e.cerrados.length, 0);
};

describe('confirmarTransferir', () => {
  test('transferencia válida: mueve el saldo, registra, guarda y cierra', () => {
    const e = entorno({ origen: 'nequi', destino: 'efectivo', monto: '1.000,00', nequi: 5000, efectivo: 200, nota: 'pasé plata' });
    e.app.confirmarTransferir();
    const s = e.estado();
    assert.equal(s.n, 4000);
    assert.equal(s.e, 1200);
    assert.equal(s.t.length, 1);
    assert.deepEqual({ ...s.t[0], id: 'x' }, { id: 'x', fecha: '2026-10-04', origen: 'nequi', destino: 'efectivo', monto: 1000, nota: 'pasé plata' });
    assert.equal(e.guardados(), 1);
    assert.deepEqual(plano(e.cerrados), ['transferir']);
    assert.equal(e.toasts.at(-1).tipo, 'ok');
  });
  test('la plata total no cambia (neto cero entre cuentas propias)', () => {
    const e = entorno({ origen: 'efectivo', destino: 'nequi', monto: '250,00', nequi: 100, efectivo: 1000 });
    e.app.confirmarTransferir();
    const s = e.estado();
    assert.equal(s.n + s.e, 1100);
  });
  test('monto negativo no mueve nada (red de seguridad: money-input no deja escribir "-")', () => {
    const e = entorno({ origen: 'nequi', destino: 'efectivo', monto: '-500', nequi: 5000 });
    e.app.confirmarTransferir();
    intacto(e, { n: 5000, e: 0, t: [] });
    assert.equal(e.toasts[0].msg, 'Ingresa un monto válido');
  });
  test('monto 0 o vacío no mueve nada', () => {
    for (const monto of ['0,00', '']) {
      const e = entorno({ origen: 'nequi', destino: 'efectivo', monto, nequi: 5000 });
      e.app.confirmarTransferir();
      intacto(e, { n: 5000, e: 0, t: [] });
    }
  });
  test('origen = destino y falta de cuenta no mueven nada', () => {
    let e = entorno({ origen: 'nequi', destino: 'nequi', monto: '100,00', nequi: 5000 });
    e.app.confirmarTransferir(); intacto(e, { n: 5000, e: 0, t: [] });
    assert.equal(e.toasts[0].msg, 'El origen y destino deben ser diferentes');
    e = entorno({ origen: '', destino: 'nequi', monto: '100,00', nequi: 5000 });
    e.app.confirmarTransferir(); intacto(e, { n: 5000, e: 0, t: [] });
    assert.equal(e.toasts[0].msg, 'Elige origen y destino');
  });
  test('mínimo con Efectivo: aviso de 3500 ms y nada se mueve', () => {
    const e = entorno({ origen: 'efectivo', destino: 'nequi', monto: '49,00', efectivo: 5000 });
    e.app.confirmarTransferir(); intacto(e, { n: 0, e: 5000, t: [] });
    assert.equal(e.toasts[0].ms, 3500);
    assert.match(e.toasts[0].msg, /mínimo/i);
  });
  test('saldo insuficiente: nada se mueve y el nombre de cuenta va escapado', () => {
    // 'custom:x' no tiene saldo en el simulador → 0, monto 1.000 → insuficiente
    const e = entorno({ origen: 'custom:x', destino: 'nequi', monto: '1.000,00' });
    e.app.confirmarTransferir(); intacto(e, { n: 0, e: 0, t: [] });
    assert.match(e.toasts[0].msg, /Saldo insuficiente en Ahorro &lt;x&gt; \(\$0\)/);
    assert.ok(!e.toasts[0].msg.includes('<x>'));
  });
  test('mover exactamente todo el saldo funciona', () => {
    const e = entorno({ origen: 'nequi', destino: 'efectivo', monto: '5.000,00', nequi: 5000 });
    e.app.confirmarTransferir();
    assert.equal(e.estado().n, 0);
    assert.equal(e.estado().e, 5000);
  });
});
