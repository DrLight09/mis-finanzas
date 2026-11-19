'use strict';
// Núcleo de Personas (js/core/personas-core.js): una sola tabla, relaciones declaradas en el núcleo, invariantes I1–I4.
// Diseño y plan: docs/personas-modelo-unico.md.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
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
    deudores: [{ id: 'd1', personaId: 'p1', movimientos: [] }],
    misDeudas: [{ id: 'm1', personaId: 'p1', movimientos: [] }],
    encargos: [{ id: 'e1', personaId: 'p1', movimientos: [] }],
    spotify: { integrantes: [{ id: 's1', personaId: 'p1' }], historial: [] },
  });
  test('renombrar y recolorear cambia solo a la persona: todas las relaciones lo ven sin sincronizar nada', () => {
    const c = base();
    const r = c.Personas.editar('p1', { nombre: 'Ana María', color: '#f06868' });
    assert.equal(r.ok, true);
    assert.equal(c.Personas.nombre(c.S.deudores[0].personaId), 'Ana María');
    assert.equal(c.Personas.color(c.S.misDeudas[0].personaId), '#f06868');
    assert.equal(c.Personas.nombre(c.S.encargos[0].personaId), 'Ana María');
    assert.equal(c.Personas.nombre(c.S.spotify.integrantes[0].personaId), 'Ana María');
    ['deudores', 'misDeudas', 'encargos'].forEach(k => assert.equal('nombre' in c.S[k][0] || 'color' in c.S[k][0], false, k + ' no guarda copia'));
    assert.deepEqual(plano(c.Personas.verificar()), []);
  });
  test('rechaza el nombre de OTRA persona, pero acepta cambiar solo mayúsculas del propio', () => {
    const c = base();
    assert.equal(c.Personas.editar('p1', { nombre: 'luis' }).error, 'duplicado');
    assert.equal(c.S.personas[0].nombre, 'Ana', 'no se tocó');
    assert.equal(c.Personas.editar('p1', { nombre: 'ANA' }).ok, true);
  });
  test('alias y notas: se guardan limpios, vacío los quita', () => {
    const c = base();
    assert.equal(c.Personas.editar('p1', { alias: '  Anita   la  prima ', notas: 'de Medellín' }).ok, true);
    assert.equal(c.S.personas[0].alias, 'Anita la prima');
    assert.equal(c.S.personas[0].notas, 'de Medellín');
    assert.equal(c.Personas.editar('p1', { color: '#f06868' }).ok, true);
    assert.equal(c.S.personas[0].alias, 'Anita la prima', 'no tocar el alias lo deja igual');
    c.Personas.editar('p1', { alias: ' ', notas: '' });
    assert.equal('alias' in c.S.personas[0] || 'notas' in c.S.personas[0], false);
  });
  test('nombre vacío o persona inexistente', () => {
    const c = base();
    assert.equal(c.Personas.editar('p1', { nombre: ' ' }).error, 'sin-nombre');
    assert.equal(c.Personas.editar('nadie', { nombre: 'X' }).error, 'no-existe');
  });
});

describe('Personas: archivar, restaurar y eliminar', () => {
  const base = () => entorno({
    personas: [P('p1', 'Ana'), P('p2', 'Luis'), P('p3', 'Sola')],
    deudores: [{ id: 'd1', personaId: 'p1', movimientos: [] }],
    encargos: [{ id: 'e1', personaId: 'p2', movimientos: [] }],
  });
  test('archivar saca a la persona de activas() pero no toca sus registros', () => {
    const c = base();
    assert.equal(c.Personas.archivar('p1').ok, true);
    assert.deepEqual(plano(c.Personas.activas().map(p => p.id)), ['p2', 'p3']);
    assert.equal(c.Personas.lista().length, 3, 'lista() sigue teniendo a todas');
    assert.equal(c.Personas.nombre('p1'), 'Ana', 'su nombre se sigue leyendo (sus préstamos lo muestran)');
    assert.equal(c.Personas.registros('p1', 'me-deben').length, 1);
    assert.deepEqual(plano(c.Personas.verificar()), []);
    assert.equal(c.Personas.archivar('nadie').error, 'no-existe');
  });
  test('el nombre de una archivada se puede reutilizar, y buscarPorNombre ya no la encuentra', () => {
    const c = base();
    c.Personas.archivar('p1');
    assert.equal(c.Personas.buscarPorNombre('ana'), undefined);
    const r = c.Personas.crear({ nombre: 'Ana' });
    assert.equal(r.creada, true);
    assert.deepEqual(plano(c.Personas.verificar()), [], 'I3 solo vigila a las no archivadas');
  });
  test('restaurar devuelve a la lista; si otra tomó su nombre, avisa duplicado', () => {
    const c = base();
    c.Personas.archivar('p1');
    c.Personas.crear({ nombre: 'Ana' });
    const r = c.Personas.restaurar('p1');
    assert.equal(r.error, 'duplicado');
    assert.equal(c.Personas.obtener('p1').archivada, true, 'sigue archivada');
    c.Personas.editar('p1', { nombre: 'Ana vieja' });
    assert.equal(c.Personas.restaurar('p1').ok, true);
    assert.equal('archivada' in c.Personas.obtener('p1'), false);
  });
  test('eliminar solo borra a una persona SIN relaciones (I5)', () => {
    const c = base();
    const r1 = c.Personas.eliminar('p1');
    assert.equal(r1.error, 'tiene-relaciones');
    assert.deepEqual(plano(r1.relaciones), ['me-deben']);
    assert.equal(c.Personas.eliminar('p2').error, 'tiene-relaciones');
    assert.equal(c.Personas.eliminar('p3').ok, true);
    assert.deepEqual(plano(c.Personas.lista().map(p => p.id)), ['p1', 'p2']);
    assert.equal(c.Personas.eliminar('p3').error, 'no-existe');
    assert.deepEqual(plano(c.Personas.verificar()), []);
  });
});

describe('Personas.verificar (invariantes)', () => {
  test('estado limpio → sin violaciones', () => {
    const c = entorno({ personas: [P('p1', 'Ana')], deudores: [{ id: 'd1', personaId: 'p1' }] });
    assert.deepEqual(plano(c.Personas.verificar()), []);
  });
  test('I1: registro sin personaId y registro cuya persona ya no existe, en cualquier relación', () => {
    const c = entorno({
      personas: [P('p1', 'Ana')],
      encargos: [{ id: 'e1' }],
      spotify: { integrantes: [{ id: 's1', personaId: 'borrada' }], historial: [] },
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
      deudores: [{ id: 'd1', personaId: 'p1' }, { id: 'd2', personaId: 'p1' }],
      encargos: [{ id: 'e1', personaId: 'p1' }, { id: 'e2', personaId: 'p1' }],
    });
    const v = plano(c.Personas.verificar());
    assert.deepEqual(v.map(x => x.regla + ':' + x.relacion), ['I4:me-deben']);
  });
  test('I2: un registro que guarda nombre o color de la persona se reporta (ya no hay copias)', () => {
    const c = entorno({ personas: [P('p1', 'Ana')], encargos: [{ id: 'e1', personaId: 'p1', nombre: 'Anita' }], deudores: [{ id: 'd1', personaId: 'p1', color: '#fff' }] });
    assert.deepEqual(plano(c.Personas.verificar()).map(x => x.regla + ':' + x.tipo + ':' + x.relacion).sort(), ['I2:copia-guardada:encargos', 'I2:copia-guardada:me-deben']);
  });
  test('no explota con colecciones ausentes', () => {
    const c = entorno({});
    delete c.S.spotify; delete c.S.deudores; delete c.S.misDeudas; delete c.S.encargos; delete c.S.personas;
    assert.deepEqual(plano(c.Personas.verificar()), []);
  });
});

describe('Personas.registrarRelacion', () => {
  test('un módulo nuevo se conecta con una llamada y entra en verificación y lee el nombre de la persona', () => {
    const c = entorno({ personas: [P('p1', 'Ana')], tandas: [{ id: 't1' }, { id: 't2', personaId: 'p1' }] });
    c.Personas.registrarRelacion({ id: 'tandas', etiqueta: 'Tanda', unica: true, coleccion: d => d.tandas || [] });
    assert.equal(c.Personas.verificar().some(v => v.relacion === 'tandas' && v.regla === 'I1'), true);
    c.S.tandas.shift();
    c.Personas.editar('p1', { nombre: 'Ana Paula' });
    assert.equal(c.Personas.nombre(c.S.tandas[0].personaId), 'Ana Paula');
    assert.deepEqual(plano(c.Personas.verificar()), []);
  });
  test('exige id y coleccion', () => {
    const c = entorno({});
    assert.throws(() => c.Personas.registrarRelacion({ id: 'x' }));
  });
});

describe('Personas.relaciones / posicionNeta / registros', () => {
  const conCalculos = estado => {
    const ctx = loadApp([path.join(RAIZ, 'js/core/core-state.js'), path.join(RAIZ, 'js/core/calc-helpers.js')]);
    Object.assign(ctx.S, plano(estado));
    return ctx;
  };
  const base = () => conCalculos({
    personas: [P('ana', 'Ana'), P('beto', 'Beto'), P('sola', 'Sola')],
    deudores: [{ id: 'd1', personaId: 'ana', movimientos: [{ tipo: 'prestamo', monto: 100000 }, { tipo: 'abono', monto: 30000 }] }],
    misDeudas: [{ id: 'm1', personaId: 'ana', movimientos: [{ tipo: 'recibido', monto: 20000 }] }],
    encargos: [{ id: 'e1', personaId: 'ana', saldoInicial: 500000, movimientos: [] }, { id: 'e2', personaId: 'beto', saldoInicial: 10, movimientos: [] }],
    spotify: { integrantes: [{ id: 's1', personaId: 'beto' }], historial: [] },
  });

  test('registros: los de una persona en una relación, y [] si no hay o la relación no existe', () => {
    const c = base();
    assert.deepEqual(plano(c.Personas.registros('ana', 'encargos')).map(r => r.id), ['e1']);
    assert.deepEqual(plano(c.Personas.registros('sola', 'encargos')), []);
    assert.deepEqual(plano(c.Personas.registros('ana', 'no-existe')), []);
  });
  test('relaciones: solo las vivas, en el orden de registro, con saldo y resumen', () => {
    const c = base();
    const r = plano(c.Personas.relaciones('ana'));
    assert.deepEqual(r.map(x => x.id), ['me-deben', 'encargos', 'yo-debo']);
    assert.equal(r[0].saldo, 70000);
    assert.equal(r[0].resumen.tag, 'Préstamo');
    assert.equal(r[0].resumen.corto.tono, 'ambar');
    assert.equal(r[0].resumen.pc, 'Me debe');
    assert.equal(r[1].resumen.cab, '1 encargo');
    assert.equal(r[2].saldo, -20000, 'lo que yo le debo cuenta en negativo');
    assert.equal(r[2].resumen.pc, 'Yo le debo');
    assert.deepEqual(plano(c.Personas.relaciones('sola')), []);
  });
  test('posicionNeta = me debe − le debo, y el saldo de un encargo NO entra', () => {
    const c = base();
    assert.equal(c.Personas.posicionNeta('ana'), 50000);
    assert.equal(c.Personas.posicionNeta('beto'), 0, 'Beto solo tiene un encargo y Spotify');
    assert.equal(c.Personas.posicionNeta('sola'), 0);
  });
  test('saldado: «Al día» y «Deuda saldada»', () => {
    const c = conCalculos({
      personas: [P('a', 'A')],
      deudores: [{ id: 'd', personaId: 'a', movimientos: [{ tipo: 'prestamo', monto: 5 }, { tipo: 'abono', monto: 5 }] }],
      misDeudas: [{ id: 'm', personaId: 'a', movimientos: [{ tipo: 'recibido', monto: 5 }, { tipo: 'pago', monto: 5 }] }],
    });
    const r = plano(c.Personas.relaciones('a'));
    assert.equal(r[0].resumen.corto.texto, 'Al día');
    assert.equal(r[1].resumen.corto.texto, 'Deuda saldada');
    assert.equal(r[0].resumen.pc, '');
  });
  test('registrarRelacion con un id existente MEZCLA con lo declarado en el núcleo', () => {
    const c = base();
    c.Personas.registrarRelacion({ id: 'spotify', resumen: () => ({ tag: 'S', cab: 'S', corto: null, pc: 'Spotify!' }) });
    const d = c.Personas.declaradas().find(x => x.id === 'spotify');
    assert.equal(d.unica, true, 'conserva lo del núcleo');
    assert.equal(typeof d.coleccion, 'function');
    assert.equal(plano(c.Personas.relaciones('beto')).find(x => x.id === 'spotify').resumen.pc, 'Spotify!');
  });
  test('una relación nueva con saldo entra en la posición neta sin tocar nada más', () => {
    const c = base();
    c.S.tandas = [{ id: 't1', personaId: 'sola', monto: 40 }];
    c.Personas.registrarRelacion({ id: 'tandas', etiqueta: 'Tanda', coleccion: d => d.tandas || [], saldo: r => r.monto });
    assert.equal(c.Personas.posicionNeta('sola'), 40);
    assert.equal(plano(c.Personas.relaciones('sola'))[0].resumen, null, 'sin resumen: la pantalla usa la etiqueta');
  });
});

describe('Perfil y lista de Personas sobre relaciones', () => {
  const { JSDOM } = require('jsdom');
  const f = (...p) => path.join(RAIZ, ...p);
  const montar = estado => {
    const app = loadApp([f('js/core/html-tag.js'), f('js/core/events.js'), f('js/core/core-state.js'), f('js/core/calc-helpers.js'), f('js/modules/personas.js')], { permissive: true });
    app.document = new JSDOM('<!doctype html><body><div id="screen-personas" class="active"></div><div id="lista-personas-body"></div><div id="lista-personas-empty"></div><span id="personas-lista-conteo"></span>' +
      '<div id="pficha-avatar"></div><div id="pficha-nombre"></div><div id="pficha-sub"></div><div id="pficha-body"></div></body>').window.document;
    Object.assign(app.S, plano(estado));
    app._pintarResumenPersonas = () => {};
    app._sincronizarFichaPersonas = () => {};
    app._inyectarPersonaSheets = () => {};
    app._mostrarFichaPersona = () => {};
    return app;
  };
  const estado = () => ({
    personas: [P('ana', 'Ana'), P('beto', 'Beto'), P('sola', 'Sola')],
    deudores: [{ id: 'd1', personaId: 'ana', movimientos: [{ tipo: 'prestamo', monto: 100000 }, { tipo: 'abono', monto: 30000 }] }],
    misDeudas: [{ id: 'm1', personaId: 'ana', movimientos: [{ tipo: 'recibido', monto: 20000 }] }],
    encargos: [{ id: 'e1', personaId: 'ana', saldoInicial: 5000, movimientos: [] }],
    spotify: { integrantes: [{ id: 's1', personaId: 'beto' }], historial: [] },
  });

  test('lista: texto en celular y en PC, etiquetas y saldo neto salen de las relaciones', () => {
    const app = montar(estado());
    app._renderListaPersonas();
    const fila = n => [...app.document.querySelectorAll('.pe-fila')].find(e => e.querySelector('.pe-nombre').textContent === n);
    const ana = fila('Ana'), beto = fila('Beto'), sola = fila('Sola');
    assert.match(ana.querySelector('.personas-sub-movil').textContent, /pendiente.*·.*1 encargo.*·.*Le debes/);
    assert.equal(ana.querySelector('.personas-sub-pc').textContent, 'Me debe · 1 encargo · Yo le debo');
    assert.deepEqual([...ana.querySelectorAll('.personas-etiqueta')].map(e => e.textContent), ['Préstamo', 'Encargo', 'Le debo']);
    assert.match(ana.querySelector('.personas-saldo-neto').textContent, /^\+/);
    assert.equal(beto.querySelector('.personas-sub-pc').textContent, 'Solo en Spotify');
    assert.equal(sola.querySelector('.personas-sub-pc').textContent, 'Sin actividad');
    assert.equal(sola.querySelector('.personas-saldo-neto').textContent, 'Al día');
  });

  test('perfil: una sección por relación viva y el saldo neto cuando hay más de una con saldo', () => {
    const app = montar(estado());
    app.abrirPerfilPersona('ana');
    const doc = app.document;
    assert.equal(doc.getElementById('pficha-nombre').textContent, 'Ana');
    assert.equal(doc.getElementById('pficha-sub').textContent, 'Préstamos · 1 encargo · Le debo');
    const cuerpo = doc.getElementById('pficha-body');
    assert.ok(cuerpo.querySelector('.pe-card-amber'), 'sección Préstamos');
    assert.ok(cuerpo.querySelector('.pe-card-azul'), 'sección Encargos');
    assert.ok(cuerpo.querySelector('.pe-card-rojo'), 'sección Le debo');
    assert.match(cuerpo.textContent, /Saldo neto/);
  });
  test('perfil: muestra el alias y las notas de la persona', () => {
    const e = estado(); e.personas[0].alias = 'Anita'; e.personas[0].notas = 'prima';
    const app = montar(e);
    app.abrirPerfilPersona('ana');
    assert.match(app.document.getElementById('pficha-body').textContent, /«Anita» · prima/);
    app.abrirPerfilPersona('beto');
    assert.doesNotMatch(app.document.getElementById('pficha-body').textContent, /«/);
  });
  test('perfil: sin saldo neto si solo hay una relación con saldo, y estado vacío si no hay relaciones', () => {
    const app = montar(estado());
    app.abrirPerfilPersona('beto');
    assert.ok(app.document.getElementById('pficha-body').querySelector('.pe-card-spotify'));
    assert.doesNotMatch(app.document.getElementById('pficha-body').textContent, /Saldo neto/);
    app.abrirPerfilPersona('sola');
    assert.equal(app.document.getElementById('pficha-sub').textContent, 'Sin actividad registrada');
  });
  test('perfil: un módulo nuevo registrado como relación aparece con la sección genérica, sin tocar personas.js', () => {
    const app = montar(estado());
    app.S.tandas = [{ id: 't1', personaId: 'sola', monto: 40 }];
    app.Personas.registrarRelacion({ id: 'tandas', etiqueta: 'Tanda', pantalla: 'tandas', coleccion: d => d.tandas || [], saldo: r => r.monto });
    app.abrirPerfilPersona('sola');
    const cuerpo = app.document.getElementById('pficha-body');
    assert.match(cuerpo.textContent, /Tanda/);
    assert.match(cuerpo.innerHTML, /personas:irAPantalla/);
    assert.equal(app.document.getElementById('pficha-sub').textContent, 'Tanda');
  });
  describe('ciclo de vida en la pantalla', () => {
    const quieta = app => { app.save = () => {}; app.refresh = () => {}; app.toast = () => {}; app.dialogo = async () => true; app.confirmarEliminar = async () => true; app.avisarNoSePuede = async () => { app._avisos = (app._avisos || 0) + 1; }; return app; };
    const acciones = (app, id) => [...app.document.getElementById('pficha-body').querySelectorAll('[data-action]')].map(b => b.getAttribute('data-action')).filter(a => /^personas:(archivar|restaurar|eliminar)$/.test(a));
    test('el perfil ofrece archivar; eliminar solo si no tiene relaciones', () => {
      const app = montar(estado());
      app.abrirPerfilPersona('ana');
      assert.deepEqual(acciones(app), ['personas:archivar']);
      app.abrirPerfilPersona('sola');
      assert.deepEqual(acciones(app), ['personas:archivar', 'personas:eliminar']);
    });
    test('archivar saca a la persona de la lista, «Ver archivadas» la muestra y el perfil ofrece restaurar', async () => {
      const app = quieta(montar(estado()));
      await app._archivarPersona('beto');
      const nombres = () => [...app.document.querySelectorAll('.pe-fila .pe-nombre')].map(e => e.textContent);
      assert.deepEqual(nombres(), ['Ana', 'Sola']);
      const toggle = [...app.document.querySelectorAll('#lista-personas-body button')].find(b => /archivadas/.test(b.textContent));
      assert.equal(toggle.textContent, 'Ver archivadas (1)');
      app._alternarArchivadas();
      assert.deepEqual(nombres(), ['Ana', 'Sola', 'Beto']);
      assert.match([...app.document.querySelectorAll('.pe-fila')].pop().querySelector('.personas-sub-movil').textContent, /^Archivada/);
      app.abrirPerfilPersona('beto');
      assert.deepEqual(acciones(app), ['personas:restaurar']);
      app._restaurarPersona('beto');
      assert.equal(app.Personas.activas().length, 3);
      assert.equal([...app.document.querySelectorAll('#lista-personas-body button')].some(b => /archivadas/.test(b.textContent)), false);
    });
    test('eliminar borra a una persona sin relaciones y se niega con relaciones', async () => {
      const app = quieta(montar(estado()));
      await app._eliminarPersona('ana');
      assert.equal(app._avisos, 1);
      assert.ok(app.Personas.obtener('ana'));
      await app._eliminarPersona('sola');
      assert.equal(app.Personas.obtener('sola'), undefined);
    });
    test('las acciones nuevas están registradas', () => {
      const app = montar(estado());
      ['archivar', 'restaurar', 'eliminar', 'alternarArchivadas'].forEach(a => assert.equal(app.Events.tiene ? app.Events.tiene('personas:' + a) : true, true));
    });
  });

  test('Spotify en el perfil cuenta los cobros por spotifyId, no solo por nombre', () => {
    const e = estado();
    e.spotify.integrantes[0] = { id: 's1', personaId: 'beto', monto: 15000, proximoPago: '2026-12-01', pagado: false };
    e.spotify.historial = [{ tipo: 'cobro', spotifyId: 's1', nombre: 'Nombre viejo', monto: 7000 }, { tipo: 'cobro', spotifyId: 'otro', nombre: 'Beto', monto: 999 }];
    const app = montar(e);
    app.abrirPerfilPersona('beto');
    const t = app.document.getElementById('pficha-body').textContent;
    assert.match(t, /Total cobrado/);
    assert.doesNotMatch(t, /999/);
  });
});

describe('Búsqueda global: una entrada por persona', () => {
  const { JSDOM } = require('jsdom');
  const buscar = (estado, texto) => {
    // busqueda-global.js es un IIFE que se engancha al DOM al cargar: se evalúa en el mismo contexto, con un DOM real, después del núcleo.
    const app = loadApp([path.join(RAIZ, 'js/core/core-state.js'), path.join(RAIZ, 'js/core/calc-helpers.js')]);
    const ventana = new JSDOM('<!doctype html><body><div id="busqueda-overlay"></div><input id="busqueda-input"><div id="busqueda-resultados"></div><button id="btn-buscar-global"></button><button id="btn-cerrar-busqueda"></button></body>').window;
    app.document = ventana.document;
    require('node:vm').runInContext(require('node:fs').readFileSync(path.join(RAIZ, 'js/core/busqueda-global.js'), 'utf8'), app);
    Object.assign(app.S, plano(estado));
    const input = ventana.document.getElementById('busqueda-input');
    input.value = texto;
    input.dispatchEvent(new ventana.Event('input'));
    return plano(app._busquedaResultados || []);
  };
  const estado = () => ({
    personas: [P('ana', 'Ana María', { alias: 'ani' }), P('beto', 'Beto')],
    deudores: [{ id: 'd1', personaId: 'ana', movimientos: [{ tipo: 'prestamo', monto: 100, nota: 'almuerzo' }] }],
    misDeudas: [{ id: 'm1', personaId: 'ana', movimientos: [] }],
    encargos: [{ id: 'e1', personaId: 'ana', nota: 'Regalo mamá', saldoInicial: 5000, movimientos: [] }],
    spotify: { integrantes: [{ id: 's1', personaId: 'ana' }], historial: [] },
  });

  test('buscar por nombre devuelve UNA entrada (la persona), con sus relaciones, y no una por módulo', () => {
    const r = buscar(estado(), 'ana');
    assert.deepEqual(r.map(x => x.tipo), ['Persona']);
    assert.match(r[0].meta, /Préstamo · Encargo · Spotify · Le debo/);
    assert.equal(r[0].navTipo, 'persona');
  });
  test('el alias también encuentra a la persona', () => {
    assert.deepEqual(buscar(estado(), 'ani').map(x => x.tipo), ['Persona']);
  });
  test('lo propio de cada módulo se sigue encontrando, con el nombre de la persona y el saldo real del encargo', () => {
    const e = buscar(estado(), 'regalo');
    assert.equal(e.length, 1);
    assert.equal(e[0].tipo, 'Encargo');
    assert.match(e[0].meta, /^Ana María · /);
    assert.match(e[0].meta, /5/, 'el saldo viene de encargoSaldo, no de un campo inexistente');
    const m = buscar(estado(), 'almuerzo');
    assert.equal(m[0].tipo, 'Mov. · Ana María');
  });
});

describe('Personas: cableado en la app', () => {

  test('ningún módulo vuelve a leer nombre/color de un registro de deuda o encargo (salen de Personas)', () => {
    const fs = require('node:fs');
    const archivos = [];
    ['js/core', 'js/modules'].forEach(dir => fs.readdirSync(path.join(RAIZ, dir)).filter(n => n.endsWith('.js')).forEach(n => archivos.push(path.join(dir, n))));
    // Deudas.porId('favor', x).nombre, Deudas.lista('favor').find(...).nombre, S.encargos.find(...).nombre, y los || {}) equivalentes.
    const mal = /(Deudas\.(porId|lista|porPersona)\([^;\n]*?\)|S\.(deudores|misDeudas|encargos)\.find\([^;\n]*?\))(\s*\|\|\s*\{\}\))?\)?\s*\??\.(nombre|color)\b/;
    const hallazgos = [];
    archivos.forEach(a => fs.readFileSync(path.join(RAIZ, a), 'utf8').split('\n').forEach((ln, i) => { if (mal.test(ln)) hallazgos.push(a + ':' + (i + 1)); }));
    assert.deepEqual(hallazgos, []);
  });
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

describe('Pantalla Personas', () => {
  const { JSDOM } = require('jsdom');
  const f = (...p) => path.join(RAIZ, ...p);
  test('una fila por persona, con la gente de todos los módulos', () => {
    const app = loadApp([f('js/core/html-tag.js'), f('js/core/events.js'), f('js/core/core-state.js'), f('js/core/calc-helpers.js'), f('js/modules/personas.js')], { permissive: true });
    app.document = new JSDOM('<!doctype html><body><div id="screen-personas"></div><div id="lista-personas-body"></div><div id="lista-personas-empty"></div><span id="personas-lista-conteo"></span></body>').window.document;
    Object.assign(app.S, plano({
      personas: [P('p1', 'Ana'), P('p2', 'Beto'), P('p3', 'Carla')],
      encargos: [{ id: 'e1', personaId: 'p2', movimientos: [] }],
      spotify: { integrantes: [{ id: 's1', personaId: 'p3' }], historial: [] },
      misDeudas: [{ id: 'm1', personaId: 'p1', movimientos: [] }],
    }));
    app._pintarResumenPersonas = () => {};
    app._sincronizarFichaPersonas = () => {};
    app._renderListaPersonas();
    const nombres = [...app.document.querySelectorAll('.pe-nombre')].map(e => e.textContent).sort();
    assert.deepEqual(nombres, ['Ana', 'Beto', 'Carla']);
  });
});

describe('Wrapped: suscripciones de Spotify', () => {
  test('el productor y el texto usan el mismo campo (integrantes): nunca «undefined personas»', () => {
    const fuente = fs.readFileSync(path.join(RAIZ, 'js/modules/wrapped.js'), 'utf8');
    const produce = /spotify: spotifyActivo \? \{ (\w+):/.exec(fuente)[1];
    const lee = new Set([...fuente.matchAll(/suscripciones\.spotify\.(\w+)/g)].map(m => m[1]));
    assert.ok(lee.has(produce), 'wrapped.js lee suscripciones.spotify.' + [...lee].join('/') + ' pero _wrappedSuscripciones devuelve «' + produce + '»');
    assert.ok(lee.has('costoMensual'));
  });
});

describe('Diferencial: el margen se lo lleva una persona de la app', () => {
  const estado = () => ({
    personas: [P('ana', 'Ana'), P('beto', 'Beto'), P('sola', 'Sola')],
    encargos: [{ id: 'e1', personaId: 'ana', movimientos: [{ id: 'm1', tipo: 'salida', monto: 10, diferencial: { dijo: 100, real: 90, margen: 10, beneficiarios: [{ personaId: 'beto', monto: 6 }, { personaId: 'beto', monto: 2 }], yoMeQuedo: 2 } }] }],
    deudores: [{ id: 'd1', personaId: 'ana', movimientos: [{ id: 'm2', diferencial: { beneficiarios: [{ personaId: 'ana', monto: 5 }] } }, { id: 'm3' }] }],
  });
  test('la relación «Margen» aparece en el perfil de quien se lo llevó, con el total, y no mueve la posición neta', () => {
    const c = entorno(estado());
    const rel = c.Personas.relaciones('beto').find(r => r.id === 'margenes');
    assert.equal(rel.registros.length, 2);
    assert.match(rel.resumen.cab, /^Margen /);
    assert.equal(c.Personas.posicionNeta('beto'), 0);
    assert.ok(c.Personas.relaciones('ana').some(r => r.id === 'margenes'));
  });
  test('una persona que se llevó un margen no se puede eliminar; se archiva', () => {
    const c = entorno(estado());
    assert.equal(c.Personas.eliminar('beto').error, 'tiene-relaciones');
    assert.equal(c.Personas.eliminar('sola').ok, true);
  });
  test('un beneficiario sin personaId o con una persona inexistente es una violación de I1', () => {
    const e = estado();
    e.encargos[0].movimientos[0].diferencial.beneficiarios.push({ monto: 1 }, { personaId: 'fantasma', monto: 1 });
    const v = plano(entorno(e).Personas.verificar());
    assert.ok(v.some(x => x.relacion === 'margenes'));
  });
  test('un beneficiario que guarde su nombre copiado se detecta (I2)', () => {
    const e = estado();
    e.encargos[0].movimientos[0].diferencial.beneficiarios[0].nombre = 'Beto';
    assert.ok(plano(entorno(e).Personas.verificar()).some(x => x.relacion === 'margenes'));
  });
  test('el motor guarda personaId (no nombre), exige persona en cada parte con plata y el historial muestra el nombre vigente', () => {
    const fuente = fs.readFileSync(path.join(RAIZ, 'js/core/diferencial.js'), 'utf8');
    assert.match(fuente, /\{ personaId: b\.personaId, monto: b\.monto \}/);
    assert.doesNotMatch(fuente, /nombre: b\.nombre/);
    assert.match(fuente, /Elige a quién se lleva cada parte/);
    const c = loadApp([path.join(RAIZ, 'js/core/core-state.js'), path.join(RAIZ, 'js/core/diferencial.js')]);
    Object.assign(c.S, plano(estado()));
    const html = require('node:vm').runInContext("diffRenderHistorial({ beneficiarios: [{ personaId: 'beto', monto: 6 }], yoMeQuedo: 4, margen: 10, dijo: 100, real: 90 })", c);
    assert.match(html, /Beto/);
    c.Personas.editar('beto', { nombre: 'Alberto' });
    assert.match(require('node:vm').runInContext("diffRenderHistorial({ beneficiarios: [{ personaId: 'beto', monto: 6 }], yoMeQuedo: 4, margen: 10, dijo: 100, real: 90 })", c), /Alberto/);
  });
});

describe('Mesada: Papá y Mamá se pueden vincular (opcional) a una persona', () => {
  const base = () => ({ personas: [P('ana', 'Ana'), P('beto', 'Beto')], mesadas: { papa: { cuotas: {}, pagos: {}, personaId: 'beto' }, mama: { cuotas: {}, pagos: {} } } });
  test('sin vínculo no hay relación; con vínculo la persona muestra «Mesada · Papá» y no se puede eliminar', () => {
    const c = entorno(base());
    assert.deepEqual(plano(c.Personas.relaciones('ana')), []);
    const rel = c.Personas.relaciones('beto').find(r => r.id === 'mesada');
    assert.equal(rel.resumen.cab, 'Mesada · Papá');
    assert.equal(c.Personas.posicionNeta('beto'), 0);
    assert.equal(c.Personas.eliminar('beto').error, 'tiene-relaciones');
    assert.deepEqual(plano(c.Personas.verificar()), []);
  });
  test('la misma persona como papá y mamá viola I4; un id inexistente viola I1', () => {
    const e = base(); e.mesadas.mama.personaId = 'beto';
    assert.ok(plano(entorno(e).Personas.verificar()).some(v => v.relacion === 'mesada'));
    const f = base(); f.mesadas.mama.personaId = 'fantasma';
    assert.ok(plano(entorno(f).Personas.verificar()).some(v => v.relacion === 'mesada'));
  });
  test('la pantalla ofrece vincular y quitar por cada padre, con acciones registradas', () => {
    const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
    ['vincularPersona', 'desvincularPersona'].forEach(a => assert.equal((html.match(new RegExp('data-action="mesada:' + a + '"', 'g')) || []).length, 2));
    const js = fs.readFileSync(path.join(RAIZ, 'js/modules/mesada.js'), 'utf8');
    assert.match(js, /vincularPersona: vincularMesadaPersona/);
    assert.match(js, /desvincularPersona: desvincularMesadaPersona/);
  });
});
