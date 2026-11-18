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

describe('Personas.registrarRelacion', () => {
  test('un módulo nuevo se conecta con una llamada y entra en verificación y edición', () => {
    const c = entorno({ personas: [P('p1', 'Ana')], tandas: [{ id: 't1', nombre: 'Ana' }, { id: 't2', personaId: 'p1', nombre: 'Ana' }] });
    c.Personas.registrarRelacion({ id: 'tandas', etiqueta: 'Tanda', unica: true, copia: { nombre: true }, coleccion: d => d.tandas || [] });
    assert.equal(c.Personas.verificar().some(v => v.relacion === 'tandas' && v.regla === 'I1'), true);
    c.S.tandas.shift();
    c.Personas.editar('p1', { nombre: 'Ana Paula' });
    assert.equal(c.S.tandas[0].nombre, 'Ana Paula');
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
    deudores: [{ id: 'd1', personaId: 'ana', nombre: 'Ana', color: '#60b0f0', movimientos: [{ tipo: 'prestamo', monto: 100000 }, { tipo: 'abono', monto: 30000 }] }],
    misDeudas: [{ id: 'm1', personaId: 'ana', nombre: 'Ana', color: '#60b0f0', movimientos: [{ tipo: 'recibido', monto: 20000 }] }],
    encargos: [{ id: 'e1', personaId: 'ana', nombre: 'Ana', saldoInicial: 500000, movimientos: [] }, { id: 'e2', personaId: 'beto', nombre: 'Beto', saldoInicial: 10, movimientos: [] }],
    spotify: { personas: [{ id: 's1', personaId: 'beto', nombre: 'Beto' }], historial: [] },
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
      deudores: [{ id: 'd', personaId: 'a', nombre: 'A', color: '#60b0f0', movimientos: [{ tipo: 'prestamo', monto: 5 }, { tipo: 'abono', monto: 5 }] }],
      misDeudas: [{ id: 'm', personaId: 'a', nombre: 'A', color: '#60b0f0', movimientos: [{ tipo: 'recibido', monto: 5 }, { tipo: 'pago', monto: 5 }] }],
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
    deudores: [{ id: 'd1', personaId: 'ana', nombre: 'Ana', color: '#60b0f0', movimientos: [{ tipo: 'prestamo', monto: 100000 }, { tipo: 'abono', monto: 30000 }] }],
    misDeudas: [{ id: 'm1', personaId: 'ana', nombre: 'Ana', color: '#60b0f0', movimientos: [{ tipo: 'recibido', monto: 20000 }] }],
    encargos: [{ id: 'e1', personaId: 'ana', nombre: 'Ana', saldoInicial: 5000, movimientos: [] }],
    spotify: { personas: [{ id: 's1', personaId: 'beto', nombre: 'Beto' }], historial: [] },
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
  test('Spotify en el perfil cuenta los cobros por spotifyId, no solo por nombre', () => {
    const e = estado();
    e.spotify.personas[0] = { id: 's1', personaId: 'beto', nombre: 'Beto', monto: 15000, proximoPago: '2026-12-01', pagado: false };
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
    deudores: [{ id: 'd1', personaId: 'ana', nombre: 'Ana María', color: '#60b0f0', movimientos: [{ tipo: 'prestamo', monto: 100, nota: 'almuerzo' }] }],
    misDeudas: [{ id: 'm1', personaId: 'ana', nombre: 'Ana María', color: '#60b0f0', movimientos: [] }],
    encargos: [{ id: 'e1', personaId: 'ana', nombre: 'Ana María', nota: 'Regalo mamá', saldoInicial: 5000, movimientos: [] }],
    spotify: { personas: [{ id: 's1', personaId: 'ana', nombre: 'Ana María' }], historial: [] },
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
      encargos: [{ id: 'e1', personaId: 'p2', nombre: 'Beto', movimientos: [] }],
      spotify: { personas: [{ id: 's1', personaId: 'p3', nombre: 'Carla' }], historial: [] },
      misDeudas: [{ id: 'm1', personaId: 'p1', nombre: 'Ana', color: '#60b0f0', movimientos: [] }],
    }));
    app._pintarResumenPersonas = () => {};
    app._sincronizarFichaPersonas = () => {};
    app._renderListaPersonas();
    const nombres = [...app.document.querySelectorAll('.pe-nombre')].map(e => e.textContent).sort();
    assert.deepEqual(nombres, ['Ana', 'Beto', 'Carla']);
  });
});
