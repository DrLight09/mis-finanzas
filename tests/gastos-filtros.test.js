'use strict';
// tests/gastos-filtros.test.js — Gastos: el filtro por mes y el «Total mensual fijo» solo aparecen cuando aportan algo.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const CORE_DIR = process.env.MIS_FINANZAS_CORE_DIR || path.join(__dirname, '..', 'js', 'core');
const MODULES_DIR = process.env.MIS_FINANZAS_MODULES_DIR || path.join(__dirname, '..', 'js', 'modules');

function app(S = {}) {
  const ctx = loadApp([
    path.join(CORE_DIR, 'core-state.js'), path.join(CORE_DIR, 'periodo.js'), path.join(CORE_DIR, 'nu-calc.js'),
    path.join(CORE_DIR, 'calc-helpers.js'), path.join(CORE_DIR, 'html-tag.js'), path.join(MODULES_DIR, 'gastos.js'),
  ], { permissive: true });
  Object.assign(ctx.S, S);
  // document que recuerda el estado de cada id (el stub normal devuelve un elemento nuevo en cada llamada)
  const els = {};
  const base = ctx.document;
  ctx.document = Object.assign({}, base, {
    getElementById(id) { return els[id] || (els[id] = Object.assign(base.getElementById(id), { innerHTML: '', textContent: '', style: {} })); },
    querySelector(sel) { return els[sel] || (els[sel] = Object.assign(base.querySelector(sel), { style: {} })); },
  });
  return { ctx, els };
}
const gasto = (id, fecha, monto = 1000) => ({ id, fecha, monto, desc: 'x', cat: 'Otros', fuente: 'nequi' });
const oculto = (el) => el.style.display === 'none';

describe('gastos — filtro por mes', () => {
  test('sin gastos o con un solo mes el filtro no aparece (filtrar por ese mes es lo mismo que «Todos»)', () => {
    for (const gastosVar of [[], [gasto('a', '2026-10-05'), gasto('b', '2026-10-20')]]) {
      const { ctx, els } = app({ gastosVar });
      ctx.renderMesFiltros();
      assert.ok(oculto(els.mesFilter), 'oculto');
      assert.equal(els.mesFilter.innerHTML, '');
    }
  });

  test('desde el segundo mes con gastos aparece, con «Todos» y un chip por mes', () => {
    const { ctx, els } = app({ gastosVar: [gasto('a', '2026-09-30'), gasto('b', '2026-10-05')] });
    ctx.renderMesFiltros();
    assert.ok(!oculto(els.mesFilter));
    assert.ok(String(els.mesFilter.innerHTML).includes('Todos'));
    assert.equal((String(els.mesFilter.innerHTML).match(/mf-chip/g) || []).length, 3);
  });

  test('un mes que solo tiene un retiro manual también cuenta como mes elegible', () => {
    const { ctx, els } = app({
      gastosVar: [gasto('a', '2026-10-05')],
      movimientos: [{ id: 'r1', tipo: 'salida_manual', clase: 'gasto', fecha: '2026-09-10', monto: 5000, fuente: 'nequi' }],
    });
    ctx.renderMesFiltros();
    assert.ok(!oculto(els.mesFilter));
  });

  test('si el mes filtrado deja de existir (se borraron sus gastos) el filtro vuelve a «todos» y la lista no queda vacía', () => {
    const { ctx, els } = app({ gastosVar: [gasto('a', '2026-09-30'), gasto('b', '2026-10-05')] });
    ctx.setMesFiltro('2026-09');
    ctx.S.gastosVar = ctx.S.gastosVar.filter((g) => g.id !== 'a'); // ya solo queda octubre
    ctx.renderMesFiltros();
    assert.ok(oculto(els.mesFilter));
    // La lista muestra el gasto de octubre (no queda filtrada a septiembre, que ya no tiene gastos).
    assert.equal(els.totalGVFilt.textContent, ctx.fmt(1000));
  });
});

describe('gastos — total mensual fijo', () => {
  test('sin gastos fijos el «Total mensual fijo» se oculta; con uno aparece', () => {
    const sin = app({ gastosFijos: [] });
    sin.ctx.renderGastosFijos();
    assert.ok(oculto(sin.els.gfTotalCard));
    const con = app({ gastosFijos: [{ id: 'g1', nombre: 'Arriendo', monto: 500000, cat: 'Hogar', dia: 1 }] });
    con.ctx.renderGastosFijos();
    assert.ok(!oculto(con.els.gfTotalCard));
  });
});
