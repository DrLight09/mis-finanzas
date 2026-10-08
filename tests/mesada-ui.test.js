'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadApp } = require('./support/load-app');
const { createFakeDom, createHtmlTag } = require('./support/fake-dom');

const ROOT = process.env.MIS_FINANZAS_ROOT || path.join(__dirname, '..');
const CORE = path.join(ROOT, 'js', 'core');
const MODS = path.join(ROOT, 'js', 'modules');
const clone = o => JSON.parse(JSON.stringify(o));

// Carga la capa de pantalla REAL (mesada.js) sobre el dominio real, con un DOM simulado.
// Modo permissive: las funciones de UI de otros archivos (openSheet, closeSheet, refresh...) son no-op.
function ui({ dom = {}, encargos = [] } = {}) {
  const ctx = loadApp([
    path.join(CORE, 'core-state.js'), path.join(CORE, 'calc-helpers.js'), path.join(CORE, 'cuenta-efectos.js'),
    path.join(CORE, 'split.js'), path.join(MODS, 'mesada.js'),
  ], { permissive: true });
  Object.assign(ctx.S, {
    cuentas: [{ id: 'nequi', tipo: 'nequi', saldo: 1000 }, { id: 'efectivo', tipo: 'efectivo', saldo: 0 }],
    movimientos: [], encargos,
  });
  const mov = (e, c) => (e.movimientos || []).reduce((a, m) => (m.cuenta || '') !== (c || '') ? a : a + (m.tipo === 'entrada' ? m.monto : -m.monto), 0);
  ctx.getEncargo = id => ctx.S.encargos.find(e => e.id === id);
  ctx.encargoSaldo = e => e.movimientos.reduce((a, m) => a + (m.tipo === 'entrada' ? m.monto : -m.monto), 0);
  ctx._getEncargoSaldoEnCuenta = mov; ctx._getEncargoSaldoSinCuenta = e => mov(e, '');
  ctx._getEncargoSaldoPorCuenta = e => [...new Set(e.movimientos.map(m => m.cuenta).filter(Boolean))].map(c => ({ cuenta: c, label: c, saldo: mov(e, c) }));
  const tag = createHtmlTag(ctx.escHtml); ctx.html = tag.html; ctx.raw = tag.raw;
  const toasts = []; ctx.toast = (m, t) => toasts.push([m, t]);
  ctx.save = () => {}; ctx.refresh = () => {};
  ctx.getPersona = id => ({ id, nombre: 'Persona ' + id }); // en permissive todo es no-op: sin esto parecería "persona inexistente"
  const d = createFakeDom(dom); ctx.document = d.document;
  ctx._msCablear(); // re-cablea los listeners sobre el DOM simulado
  ctx._ensureMesadas(); ctx.S.mesadas.papa.cuotas = { '2026': 80000 };
  return { ctx, d, toasts };
}
const enc = (id, nombre, monto, cuenta) => ({ id, nombre, movimientos: [{ id: 'in' + id, tipo: 'entrada', monto, cuenta }] });

test('UI — registrar un pago simple de punta a punta (abrir, escribir, confirmar)', () => {
  const { ctx, d } = ui();
  ctx.abrirRegistrarMesada('papa', '2026-3', 'Abr 2026');
  assert.equal(d.el('mpTitle').textContent, 'Papá · Abr 2026');
  assert.equal(d.el('mpMonto').value, 80000);
  d.el('mpMonto').value = '80000'; d.el('mpFecha').value = '2026-04-05'; d.el('mpDestino').value = 'nequi';
  d.fire('mpMonto', 'input');
  assert.match(d.el('mpPreview').textContent, /\+/);
  d.fire('btn-confirmar-mesada', 'click');
  assert.equal(ctx.S.cuentas[0].saldo, 81000);
  assert.equal(ctx.getMesadaData('papa')['2026-3'].destino, 'nequi');
});

test('UI — con encargo: el widget aparece, valida saldo y descuenta al confirmar', () => {
  const { ctx, d } = ui({ encargos: [enc('e1', 'Plata de papá', 100000, 'nequi')] });
  ctx.abrirRegistrarMesada('papa', '2026-3', 'Abr 2026');
  assert.equal(d.el('mpEncargoBox').style.display, '');
  assert.match(d.el('mpEncargoSub').textContent, /^Tienes .* guardados de Papá en encargos$/);
  d.el('mpMonto').value = '80000'; d.el('mpFecha').value = '2026-04-05';
  d.el('mpUsarEncargo').click();
  d.el('mpEncargoCuentaSel').value = 'nequi';
  assert.equal(d.el('mpEncargoDetalle').style.display, '');
  d.el('mpDestino').value = 'nequi';
  d.fire('btn-confirmar-mesada', 'click');
  assert.equal(ctx.encargoSaldo(ctx.S.encargos[0]), 20000);
  assert.equal(ctx.S.cuentas[0].saldo, 81000);
});

test('UI — sin candidatos el widget de encargo queda oculto', () => {
  const { ctx, d } = ui({ encargos: [enc('e1', 'Carlos', 100000, 'nequi')] });
  ctx.abrirRegistrarMesada('papa', '2026-3', 'Abr 2026');
  assert.equal(d.el('mpEncargoBox').style.display, 'none');
});

test('REGRESIÓN bug 3 — el nombre del encargo se escapa en el toast de saldo insuficiente', () => {
  const nombre = 'Papá <img src=x onerror=alert(1)>';
  const { ctx, d, toasts } = ui({ encargos: [enc('e1', nombre, 1000, 'nequi')] });
  ctx.abrirRegistrarMesada('papa', '2026-3', 'Abr 2026');
  d.el('mpMonto').value = '80000';
  d.el('mpUsarEncargo').click();
  d.fire('btn-confirmar-mesada', 'click');
  assert.equal(toasts.length, 1);
  assert.ok(!toasts[0][0].includes('<img'), toasts[0][0]);
  assert.ok(toasts[0][0].includes('&lt;img'));
  assert.equal(ctx.encargoSaldo(ctx.S.encargos[0]), 1000); // y no se tocó nada
});

test('UI — dividido que excede muestra el aviso y NO deja la salida del encargo huérfana', () => {
  const { ctx, d } = ui({ encargos: [enc('e1', 'Papá', 200000, 'nequi')] });
  ctx.abrirRegistrarMesada('papa', '2026-3', 'Abr 2026');
  d.el('mpMonto').value = '80000';
  d.el('mpUsarEncargo').click();
  d.el('mpEncargoCuentaSel').value = 'nequi';
  d.el('mpSplitRows').children = [
    { style: {}, querySelector: q => q === 'select' ? { value: 'nequi' } : q === 'input' ? { value: '99999' } : null },
  ];
  ctx.splitToggle('mp'); // modo dividido
  d.fire('btn-confirmar-mesada', 'click');
  assert.match(d.el('mpPreview').textContent, /supera el monto/);
  assert.equal(ctx.encargoSaldo(ctx.S.encargos[0]), 200000);
  assert.equal(ctx.S.mesadas.papa.pagos['2026-3'], undefined);
});

test('UI — pago de lo pendiente: abrir, previsualizar y confirmar', () => {
  const { ctx, d } = ui();
  ctx.mesadaRegistrarPago({ parent: 'papa', key: '2026-3', monto: 60000, fecha: '2026-04-05', destino: 'nequi', quedaDebiendo: true });
  ctx.abrirResolverPendiente('papa', '2026-3');
  assert.equal(d.el('mppDesc').textContent.startsWith('Te debía'), true);
  d.el('mppMonto').value = '20000'; d.el('mppDestino').value = 'efectivo';
  d.fire('mppMonto', 'input');
  assert.match(d.el('mppPreview').textContent, /saldado/);
  d.fire('btn-confirmar-mesada-pend', 'click');
  assert.equal(ctx.getMesadaData('papa')['2026-3'].pendiente, 0);
  assert.equal(ctx.S.cuentas[1].saldo, 20000);
});

test('UI — pantalla principal: pinta la grilla, el resumen y el banner de pendiente', () => {
  const { ctx, d } = ui();
  ctx.mesadaRegistrarPago({ parent: 'papa', key: '2026-0', monto: 60000, fecha: '2026-01-05', destino: '', quedaDebiendo: true });
  ctx.S.mesadaAnio = 2026;
  ctx.renderMesada();
  assert.match(d.el('mesadaGridPapa').innerHTML, /mes-dot on mes-dot-pend/);
  assert.match(d.el('ms-pendiente-banner').textContent, /Papá te debe/);
  assert.match(d.el('ms-papa-sub').textContent, /pendiente/);
});

test('UI — detalle de un mes con abonos usa las clases (sin estilos inline) y escapa textos libres', () => {
  const { ctx, d } = ui();
  ctx.mesadaRegistrarPago({ parent: 'papa', key: '2026-3', monto: 60000, fecha: '2026-04-05', nota: '<b>x</b>', destino: 'nequi', quedaDebiendo: true });
  ctx.mesadaAbonarPendiente({ parent: 'papa', key: '2026-3', monto: 5000, fecha: '2026-05-01', nota: '<i>y</i>', destino: 'efectivo' });
  ctx.abrirDetalleMesada('papa', '2026-3', 'Abr 2026');
  const h = d.el('mdContent').innerHTML;
  assert.match(h, /ms-pend-card debe/);
  assert.match(h, /ms-hist-row/);
  assert.ok(!h.includes('<b>x</b>') && !h.includes('<i>y</i>'));
  assert.ok(!/style="margin-bottom/.test(h));
});

test('UI — vincular persona: se guarda y cambia qué encargos se ofrecen', () => {
  const { ctx, d } = ui({ encargos: [{ ...enc('e1', 'Carlos', 100000, 'nequi'), personaId: 'p1' }] });
  ctx.abrirRegistrarMesada('papa', '2026-3', 'x');
  assert.equal(d.el('mpEncargoBox').style.display, 'none');
  ctx.abrirSelPersona = cb => cb('p1');
  d.fire('ms-papa-persona', 'click');
  assert.equal(ctx.mesadaPersonaDe('papa'), 'p1');
  ctx.abrirRegistrarMesada('papa', '2026-3', 'x');
  assert.equal(d.el('mpEncargoBox').style.display, '');
  d.fire('ms-papa-persona-x', 'click');
  assert.equal(ctx.mesadaPersonaDe('papa'), '');
});

test('UI — borrar un mes revierte todo', async () => {
  const { ctx, d } = ui({ encargos: [enc('e1', 'Papá', 100000, 'nequi')] });
  ctx.mesadaRegistrarPago({ parent: 'papa', key: '2026-3', monto: 80000, fecha: hoyISO(), destino: 'nequi', encargo: { id: 'e1', cuentaSel: 'nequi' } });
  await ctx.eliminarMesadaPago('papa', '2026-3');
  assert.equal(ctx.S.cuentas[0].saldo, 1000);
  assert.equal(ctx.encargoSaldo(ctx.S.encargos[0]), 100000);
  assert.equal(ctx.S.mesadas.papa.pagos['2026-3'], undefined);
});
function hoyISO() { return new Date().toISOString().slice(0, 10); }
