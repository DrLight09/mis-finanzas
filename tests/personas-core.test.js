'use strict';
// Núcleo de Personas (js/core/personas-core.js): una sola tabla, relaciones declaradas en el núcleo, invariantes I1–I4.
// Diseño y plan: docs/personas-modelo-unico.md.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const RAIZ = path.join(__dirname, '..');
const plano = x => JSON.parse(JSON.stringify(x));
function entorno(estado) {
  const ctx = loadApp([path.join(RAIZ, 'js/core/core-state.js')]);
  Object.assign(ctx.S, plano(estado || {}));
  return ctx;
}
const P = (id, nombre, extra) => ({ id, nombre, color: '#60b0f0', creadoEn: '2026-01-01', ...(extra || {}) });

describe('Personas: lectura', () => {
  test('obtener / nombre / color con fallback', () => {
    const c = entorno({ personas: [P('p1', 'Ana', { color: '#f06868' })] });
    assert.equal(c.Personas.obtener('p1').nombre, 'Ana');
    assert.equal(c.Personas.nombre('p1'), 'Ana');
    assert.equal(c.Personas.color('p1'), '#f06868');
    assert.equal(c.Personas.nombre('nadie'), '—');
    assert.equal(c.Personas.color('nadie'), c.Personas.COLOR_DEFECTO);
    assert.equal(c.Personas.obtener(''), undefined);
  });
  test('buscarPorNombre ignora mayúsculas, tildes y espacios de más', () => {
    const c = entorno({ personas: [P('p1', 'José Pérez')] });
    assert.equal(c.Personas.buscarPorNombre('  jose   perez ').id, 'p1');
    assert.equal(c.Personas.buscarPorNombre('otro'), undefined);
    assert.equal(c.Personas.buscarPorNombre(''), undefined);
  });
});

describe('Personas.crear', () => {
  test('crea una persona nueva', () => {
    const c = entorno({ personas: [] });
    const r = c.Personas.crear({ nombre: ' Ana  Ruiz ', color: '#c060f0' });
    assert.equal(r.creada, true);
    assert.equal(r.persona.nombre, 'Ana Ruiz');
    assert.equal(c.S.personas.length, 1);
  });
  test('no duplica: con el mismo nombre devuelve la existente', () => {
    const c = entorno({ personas: [P('p1', 'Ánã')] });
    const r = c.Personas.crear({ nombre: 'ana' });
    assert.equal(r.creada, false);
    assert.equal(r.persona.id, 'p1');
    assert.equal(c.S.personas.length, 1);
  });
  test('nombre vacío → null y no crea nada', () => {
    const c = entorno({ personas: [] });
    assert.equal(c.Personas.crear({ nombre: '   ' }), null);
    assert.equal(c.S.personas.length, 0);
  });
});

describe('Personas.editar', () => {
  const base = () => entorno({
    personas: [P('p1', 'Ana'), P('p2', 'Luis')],
    deudores: [{ id: 'd1', personaId: 'p1', nombre: 'Ana', color: '#60b0f0', movimientos: [] }],
    misDeudas: [{ id: 'm1', personaId: 'p1', nombre: 'Ana', color: '#60b0f0', movimientos: [] }],
    encargos: [{ id: 'e1', personaId: 'p1', nombre: 'Ana', movimientos: [] }],
    spotify: { personas: [{ id: 's1', personaId: 'p1', nombre: 'Ana' }], historial: [] },
  });
  test('renombrar y recolorear deja iguales las copias de TODAS las relaciones', () => {
    const c = base();
    const r = c.Personas.editar('p1', { nombre: 'Ana María', color: '#f06868' });
    assert.equal(r.ok, true);
    assert.equal(c.S.deudores[0].nombre, 'Ana María');
    assert.equal(c.S.deudores[0].color, '#f06868');
    assert.equal(c.S.misDeudas[0].nombre, 'Ana María');
    assert.equal(c.S.misDeudas[0].color, '#f06868');
    assert.equal(c.S.encargos[0].nombre, 'Ana María');
    assert.equal(c.S.spotify.personas[0].nombre, 'Ana María');
    assert.deepEqual(plano(c.Personas.verificar()), []);
  });
  test('rechaza el nombre de OTRA persona, pero acepta cambiar solo mayúsculas del propio', () => {
    const c = base();
    assert.equal(c.Personas.editar('p1', { nombre: 'luis' }).error, 'duplicado');
    assert.equal(c.S.personas[0].nombre, 'Ana', 'no se tocó');
    assert.equal(c.Personas.editar('p1', { nombre: 'ANA' }).ok, true);
  });
  test('nombre vacío o persona inexistente', () => {
    const c = base();
    assert.equal(c.Personas.editar('p1', { nombre: ' ' }).error, 'sin-nombre');
    assert.equal(c.Personas.editar('nadie', { nombre: 'X' }).error, 'no-existe');
  });
});

describe('Personas.verificar (invariantes)', () => {
  test('estado limpio → sin violaciones', () => {
    const c = entorno({ personas: [P('p1', 'Ana')], deudores: [{ id: 'd1', personaId: 'p1', nombre: 'Ana', color: '#60b0f0' }] });
    assert.deepEqual(plano(c.Personas.verificar()), []);
  });
  test('I1: registro sin personaId y registro cuya persona ya no existe, en cualquier relación', () => {
    const c = entorno({
      personas: [P('p1', 'Ana')],
      encargos: [{ id: 'e1', nombre: 'Sin vínculo' }],
      spotify: { personas: [{ id: 's1', personaId: 'borrada', nombre: 'Fantasma' }], historial: [] },
    });
    const v = plano(c.Personas.verificar()).filter(x => x.regla === 'I1');
    assert.deepEqual(v.map(x => x.tipo + ':' + x.relacion).sort(), ['persona-inexistente:spotify', 'sin-personaId:encargos']);
  });
  test('I3: id repetido y nombre repetido', () => {
    const c = entorno({ personas: [P('p1', 'Ana'), P('p1', 'Otra'), P('p2', 'ana')] });
    const tipos = plano(c.Personas.verificar()).map(x => x.tipo).sort();
    assert.deepEqual(tipos, ['id-repetido', 'nombre-repetido']);
  });
  test('I4: dos «me deben» de la misma persona; Encargos sí admite varios', () => {
    const c = entorno({
      personas: [P('p1', 'Ana')],
      deudores: [{ id: 'd1', personaId: 'p1', nombre: 'Ana', color: '#60b0f0' }, { id: 'd2', personaId: 'p1', nombre: 'Ana', color: '#60b0f0' }],
      encargos: [{ id: 'e1', personaId: 'p1', nombre: 'Ana' }, { id: 'e2', personaId: 'p1', nombre: 'Ana' }],
    });
    const v = plano(c.Personas.verificar());
    assert.deepEqual(v.map(x => x.regla + ':' + x.relacion), ['I4:me-deben']);
  });
  test('I2: copia de nombre desfasada', () => {
    const c = entorno({ personas: [P('p1', 'Ana')], encargos: [{ id: 'e1', personaId: 'p1', nombre: 'Anita' }] });
    assert.deepEqual(plano(c.Personas.verificar()).map(x => x.tipo), ['copia-desfasada']);
  });
  test('no explota con colecciones ausentes', () => {
    const c = entorno({});
    delete c.S.spotify; delete c.S.deudores; delete c.S.misDeudas; delete c.S.encargos; delete c.S.personas;
    assert.deepEqual(plano(c.Personas.verificar()), []);
  });
});

describe('Personas.reconciliar', () => {
  test('vincula huérfanos por nombre, crea la persona si no existe y toma el color del registro', () => {
    const c = entorno({
      personas: [P('p1', 'Ana')],
      deudores: [{ id: 'd1', nombre: 'ANA', color: '#f06868', movimientos: [] }, { id: 'd2', nombre: 'Beto', color: '#c060f0', movimientos: [] }],
      spotify: { personas: [{ id: 's1', personaId: 'borrada', nombre: 'Beto' }], historial: [] },
    });
    const r = c.Personas.reconciliar();
    assert.ok(r.cambios.length > 0);
    assert.equal(c.S.deudores[0].personaId, 'p1');
    const beto = c.S.personas.find(p => p.nombre === 'Beto');
    assert.equal(beto.color, '#c060f0');
    assert.equal(c.S.deudores[1].personaId, beto.id);
    assert.equal(c.S.spotify.personas[0].personaId, beto.id, 'el id colgante se rehace por nombre');
    assert.equal(c.S.personas.length, 2);
    assert.deepEqual(plano(c.Personas.verificar()), []);
  });
  test('une personas con el mismo nombre: conserva la más antigua, reasigna relaciones y rescata alias/notas', () => {
    const c = entorno({
      personas: [P('nueva', 'Luis', { creadoEn: '2026-05-01' }), P('vieja', 'luis', { creadoEn: '2026-01-01', alias: 'lucho' })],
      encargos: [{ id: 'e1', personaId: 'nueva', nombre: 'Luis' }],
    });
    c.Personas.reconciliar();
    assert.equal(c.S.personas.length, 1);
    assert.equal(c.S.personas[0].id, 'vieja');
    assert.equal(c.S.personas[0].alias, 'lucho');
    assert.equal(c.S.encargos[0].personaId, 'vieja');
  });
  test('no adivina: nombres parecidos no se unen, y dos registros de una relación única quedan en revisión', () => {
    const c = entorno({
      personas: [P('p1', 'Carlos'), P('p2', 'Carlos P.')],
      deudores: [{ id: 'd1', personaId: 'p1', nombre: 'Carlos', color: '#60b0f0' }, { id: 'd2', personaId: 'p1', nombre: 'Carlos', color: '#60b0f0' }],
    });
    const r = plano(c.Personas.reconciliar());
    assert.equal(c.S.personas.length, 2);
    assert.equal(c.S.deudores.length, 2, 'no se funden dos deudores');
    assert.deepEqual(r.revision.map(x => x.regla), ['I4']);
  });
  test('registro sin nombre: se vincula a «Sin nombre» en vez de quedar huérfano', () => {
    const c = entorno({ personas: [], encargos: [{ id: 'e1' }] });
    c.Personas.reconciliar();
    assert.equal(c.S.encargos[0].personaId, c.S.personas[0].id);
    assert.deepEqual(plano(c.Personas.verificar()), []);
  });
  test('es idempotente: la segunda pasada no cambia nada', () => {
    const c = entorno({
      personas: [P('a', 'Ana'), P('b', 'ana')],
      deudores: [{ id: 'd1', nombre: 'Zoe', color: '#60b0f0' }],
      encargos: [{ id: 'e1', personaId: 'b', nombre: 'otro' }],
    });
    c.Personas.reconciliar();
    const antes = plano(c.S);
    const r = c.Personas.reconciliar();
    assert.deepEqual(plano(r.cambios), []);
    assert.deepEqual(plano(c.S), antes);
  });
  test('sirve sobre datos crudos (migración/importación), no solo sobre el S global', () => {
    const c = entorno({ personas: [P('p1', 'Ana')] });
    const crudo = { deudores: [{ id: 'd1', nombre: 'Marta' }] };
    c.Personas.reconciliar(crudo);
    assert.equal(crudo.personas[0].nombre, 'Marta');
    assert.equal(c.S.personas.length, 1, 'el S real no se tocó');
  });
});

describe('Personas.registrarRelacion', () => {
  test('un módulo nuevo se conecta con una llamada y entra en verificación, edición y reconciliación', () => {
    const c = entorno({ personas: [P('p1', 'Ana')], tandas: [{ id: 't1', nombre: 'Ana' }] });
    c.Personas.registrarRelacion({ id: 'tandas', etiqueta: 'Tanda', unica: true, copia: { nombre: true }, coleccion: d => d.tandas || [] });
    assert.equal(c.Personas.verificar().some(v => v.relacion === 'tandas' && v.regla === 'I1'), true);
    c.Personas.reconciliar();
    assert.equal(c.S.tandas[0].personaId, 'p1');
    c.Personas.editar('p1', { nombre: 'Ana Paula' });
    assert.equal(c.S.tandas[0].nombre, 'Ana Paula');
  });
  test('exige id y coleccion', () => {
    const c = entorno({});
    assert.throws(() => c.Personas.registrarRelacion({ id: 'x' }));
  });
});

describe('Personas: cableado en la app', () => {
  const fs = require('node:fs');
  const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
  test('index.html carga personas-core.js justo después de estado.js y antes de persistencia.js', () => {
    const h = leer('index.html');
    const i = h.indexOf('js/core/estado.js'), j = h.indexOf('js/core/personas-core.js'), k = h.indexOf('js/core/persistencia.js');
    assert.ok(i > 0 && j > i && k > j);
  });
  test('sw.js precachea personas-core.js', () => {
    assert.match(leer('sw.js'), /"js\/core\/personas-core\.js"/);
  });
  test('la pantalla Personas ya no tiene bloques «sin perfil» ni lee personaId a mano para listar', () => {
    const t = leer('js/modules/personas.js');
    assert.doesNotMatch(t, /sinPerfil/);
    assert.doesNotMatch(t, /filter\(d => !d\.personaId\)/);
  });
  test('editar una persona no sincroniza colecciones a mano: lo hace Personas.editar', () => {
    const t = leer('js/modules/personas.js');
    const f = t.slice(t.indexOf('function _guardarEditarPersonaGlobal'), t.indexOf('/* ── PERFIL DE PERSONA'));
    assert.match(f, /Personas\.editar\(/);
    assert.doesNotMatch(f, /forEach\(/);
  });
});

describe('Pantalla Personas: nadie queda fuera', () => {
  const { JSDOM } = require('jsdom');
  const f = (...p) => path.join(RAIZ, ...p);
  // El caso que el md documentó con un respaldo de cuatro casos: encargo sin personaId, integrante de Spotify sin personaId,
  // deudor cuyo personaId apunta a una persona borrada, y un «yo debo» sin vínculo.
  test('encargos, Spotify, vínculos rotos y «yo debo» sin vincular aparecen, una fila por persona, y se reparan', () => {
    const app = loadApp([f('js/core/html-tag.js'), f('js/core/events.js'), f('js/core/core-state.js'), f('js/core/calc-helpers.js'), f('js/modules/personas.js')], { permissive: true });
    app.document = new JSDOM('<!doctype html><body><div id="screen-personas"></div><div id="lista-personas-body"></div><div id="lista-personas-empty"></div><span id="personas-lista-conteo"></span></body>').window.document;
    Object.assign(app.S, plano({
      personas: [P('p1', 'Ana')],
      encargos: [{ id: 'e1', nombre: 'Beto', movimientos: [] }],
      spotify: { personas: [{ id: 's1', nombre: 'Carla' }], historial: [] },
      deudores: [{ id: 'd1', personaId: 'borrada', nombre: 'Dani', color: '#60b0f0', movimientos: [] }],
      misDeudas: [{ id: 'm1', nombre: 'Ana', color: '#60b0f0', movimientos: [] }],
    }));
    app.save = () => { app._guardado = true; };
    app._pintarResumenPersonas = () => {};
    app._sincronizarFichaPersonas = () => {};
    app._renderListaPersonas();
    const nombres = [...app.document.querySelectorAll('.pe-nombre')].map(e => e.textContent).sort();
    assert.deepEqual(nombres, ['Ana', 'Beto', 'Carla', 'Dani']);
    assert.equal(app._guardado, true, 'lo reparado se guarda');
    assert.deepEqual(plano(app.Personas.verificar()), []);
    assert.equal(app.S.misDeudas[0].personaId, 'p1', '«yo debo» de Ana se une a la Ana existente, no crea otra');
  });
});
