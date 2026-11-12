'use strict';
const { leerEstado, REL: PARTES_ESTADO, esParte } = require('./support/nucleo-estado');

// M5 — Fecha: una sola forma de trabajar con fechas. Las pruebas de huso horario corren en procesos hijos con TZ distinta
// (el huso se fija al arrancar Node): el bug que se vigila solo aparece al este de UTC o con la hora del equipo distinta a Colombia.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { loadApp } = require('./support/load-app');

const raiz = path.join(__dirname, '..');
const FECHA_JS = path.join(raiz, 'js', 'core', 'fecha.js');
const nuevo = () => loadApp([FECHA_JS]).Fecha;

describe('fecha-api', () => {
  test('iso/mes/mesKey/hoy en hora local', () => {
    const F = nuevo();
    assert.equal(F.iso(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
    assert.equal(F.iso(new Date(2026, 11, 31, 0, 0)), '2026-12-31');
    assert.equal(F.mes(new Date(2026, 8, 30)), '2026-09');
    assert.equal(F.mes('2026-09-30'), '2026-09');
    assert.equal(F.mesKey(2026, 4), '2026-04');
    assert.match(F.hoy(), /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(F.mes(), F.hoy().slice(0, 7));
  });
  test('parsear acepta ceros omitidos (el bug del CDT en $0) y devuelve Invalid Date, no excepción, con basura', () => {
    const F = nuevo();
    assert.equal(F.iso(F.parsear('2026-9-26')), '2026-09-26');
    assert.equal(F.iso(F.parsear('2026-09-26T15:30:00')), '2026-09-26');
    for (const malo of [null, undefined, '', 'hola', '2026-09', '2026-xx-01']) assert.ok(isNaN(F.parsear(malo).getTime()), String(malo));
  });
  test('esValida distingue fechas reales de calendario', () => {
    const F = nuevo();
    assert.equal(F.esValida('2024-02-29'), true);
    assert.equal(F.esValida('2026-02-29'), false);
    assert.equal(F.esValida('2026-02-31'), false);
    assert.equal(F.esValida('2026-9-6'), true);
    assert.equal(F.esValida(''), false);
  });
  test('sumarDias cruza mes, año y bisiesto; admite negativos; fecha inválida → cadena vacía', () => {
    const F = nuevo();
    assert.equal(F.sumarDias('2026-01-31', 1), '2026-02-01');
    assert.equal(F.sumarDias('2024-02-28', 1), '2024-02-29');
    assert.equal(F.sumarDias('2026-02-28', 1), '2026-03-01');
    assert.equal(F.sumarDias('2026-12-31', 1), '2027-01-01');
    assert.equal(F.sumarDias('2026-03-01', -1), '2026-02-28');
    assert.equal(F.sumarDias('2026-06-08', 30), '2026-07-08');
    assert.equal(F.sumarDias('2026-9-26', 0), '2026-09-26');
    assert.equal(F.sumarDias('', 5), '');
  });
  test('sumarDias(f, 30·k) equivale al antiguo nextMonthFixed(f, k)', () => {
    const F = nuevo();
    let f = '2026-01-08';
    for (let k = 1; k <= 14; k++) { f = F.sumarDias(f, 30); assert.equal(f, F.sumarDias('2026-01-08', 30 * k)); }
  });
  test('sumarMeses conserva el día o cae en el último del mes', () => {
    const F = nuevo();
    assert.equal(F.sumarMeses('2026-01-31', 1), '2026-02-28');
    assert.equal(F.sumarMeses('2024-01-31', 1), '2024-02-29');
    assert.equal(F.sumarMeses('2026-11-10', 3), '2027-02-10');
    assert.equal(F.sumarMeses('2026-03-15', -4), '2025-11-15');
  });
  test('diasEntre cuenta días de calendario (signo, mes, año, bisiesto)', () => {
    const F = nuevo();
    assert.equal(F.diasEntre('2026-11-10', '2026-11-10'), 0);
    assert.equal(F.diasEntre('2026-11-10', '2026-11-13'), 3);
    assert.equal(F.diasEntre('2026-11-13', '2026-11-10'), -3);
    assert.equal(F.diasEntre('2024-02-28', '2024-03-01'), 2);
    assert.equal(F.diasEntre('2025-02-28', '2025-03-01'), 1);
    assert.equal(F.diasEntre('2025-12-31', '2026-01-01'), 1);
    assert.equal(F.diasEntre('2026-01-01', '2027-01-01'), 365);
    assert.ok(Number.isNaN(F.diasEntre('x', '2026-01-01')));
  });
  test('diasEntre equivale al antiguo Math.ceil((fecha − ahora)/86400000) a cualquier hora del día', () => {
    const F = nuevo();
    const venc = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-20', '2027-01-01'];
    for (const hora of [0, 1, 7, 12, 15, 23]) {
      const ahora = new Date(2026, 10, 10, hora, 30);
      for (const v of venc) {
        const antes = Math.ceil((F.parsear(v) - ahora) / 86400000);
        assert.equal(F.diasEntre(F.iso(ahora), v) + 0, antes + 0, `${v} a las ${hora}h`);
      }
    }
  });
  test('nombreMes: corto y largo; fuera de rango → vacío', () => {
    const F = nuevo();
    assert.equal(F.nombreMes(1), 'Ene');
    assert.equal(F.nombreMes(12), 'Dic');
    assert.equal(F.nombreMes(9, { largo: true }), 'Septiembre');
    assert.equal(F.nombreMes(13), '');
    assert.deepEqual([...F.MESES_CORTOS], ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']);
  });
  test('el núcleo delega: hoy(), mesActual(), _fechaSafe() y MC salen de Fecha', () => {
    const app = loadApp([path.join(raiz, 'js', 'core', 'core-state.js')], { permissive: true });
    assert.equal(app.hoy(), app.Fecha.hoy());
    assert.equal(app.mesActual(), app.Fecha.mes());
    assert.equal(app.Fecha.iso(app._fechaSafe('2026-9-26')), '2026-09-26');
    assert.ok(/const MC\s*=\s*Fecha\.MESES_CORTOS/.test(leerEstado()), 'MC es un alias de la lista única');
  });
});

describe('fecha-husos-horarios', () => {
  // Cada huso en un proceso aparte. Se imprime JSON con lo que importa; las expectativas son las mismas en TODOS los husos.
  const guion = `
    const fs=require('fs'),vm=require('vm');
    const ctx={console,Date,Math,String,Number,isNaN};ctx.window=ctx;vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(${JSON.stringify(FECHA_JS)},'utf8')+';this.F=Fecha;',ctx);
    const F=ctx.F;
    // Una Date a medianoche LOCAL: toISOString() la corre un día en husos al este de UTC (el bug de Spotify)
    const medianoche=new Date(2026,9,31,0,0);
    console.log(JSON.stringify({
      iso:F.iso(medianoche),
      utcIngenuo:medianoche.toISOString().slice(0,10),
      mas30:F.sumarDias('2026-10-31',30),
      diasOctNov:F.diasEntre('2026-10-31','2026-11-10'),
      cambioHora:F.diasEntre('2026-03-07','2026-03-09'),
      cambioHora2:F.diasEntre('2026-10-31','2026-11-02'),
      mes:F.mes(new Date(2026,0,1,0,5)),
    }));`;
  const correr = tz => JSON.parse(execFileSync(process.execPath, ['-e', guion], { env: { ...process.env, TZ: tz }, encoding: 'utf8' }));
  for (const tz of ['America/Bogota', 'Asia/Tokyo', 'Pacific/Auckland', 'America/New_York', 'Europe/Madrid', 'UTC']) {
    test(`TZ=${tz}: mismas fechas y mismos días (sin correrse un día)`, () => {
      const r = correr(tz);
      assert.equal(r.iso, '2026-10-31');
      assert.equal(r.mas30, '2026-11-30');
      assert.equal(r.diasOctNov, 10);
      assert.equal(r.cambioHora, 2, 'un cambio de hora no suma ni resta días');
      assert.equal(r.cambioHora2, 2);
      assert.equal(r.mes, '2026-01');
    });
  }
  test('control: toISOString() SÍ se corre en un huso al este de UTC (por eso no se usa)', () => {
    assert.equal(correr('Asia/Tokyo').utcIngenuo, '2026-10-30');
  });
});

describe('fecha-spotify-sin-corrimiento', () => {
  // El bug latente de la revisión: spotify.js calculaba el próximo pago con toISOString() (UTC). Con el huso de Tokio daba un día menos.
  const guion = `
    const { loadApp } = require(${JSON.stringify(path.join(__dirname, 'support', 'load-app.js'))});
    const ctx = loadApp(['core/core-state.js', 'core/periodo.js', 'core/nu-calc.js', 'core/calc-helpers.js', 'core/split.js', 'modules/spotify.js'].map(f => require('path').join(${JSON.stringify(path.join(raiz, 'js'))}, f)), { permissive: true });
    ctx.S.spotify = { personas: [], historial: [] };
    console.log(JSON.stringify({
      a: ctx.spSumarDias('2026-10-31', 30),
      b: ctx.spSumarDias('2026-01-08', 60),
      venc: ctx.spPeriodosVencidos({ proximoPago: '2026-10-01' }, '2026-11-10'),
      vencEstricto: ctx.spPeriodosVencidos({ proximoPago: '2026-10-11' }, '2026-11-10', true),
      vencIgual: ctx.spPeriodosVencidos({ proximoPago: '2026-10-11' }, '2026-11-10', false),
      invalida: ctx.spPeriodosVencidos({ proximoPago: 'no-fecha' }, '2026-11-10'),
    }));`;
  for (const tz of ['America/Bogota', 'Asia/Tokyo', 'Pacific/Auckland', 'America/Los_Angeles']) {
    test(`TZ=${tz}: spSumarDias y spPeriodosVencidos dan lo mismo`, () => {
      const r = JSON.parse(execFileSync(process.execPath, ['-e', guion], { env: { ...process.env, TZ: tz }, encoding: 'utf8' }));
      assert.equal(r.a, '2026-11-30');
      assert.equal(r.b, '2026-03-09');
      assert.equal(r.venc, 2);          // 1-oct y 31-oct
      assert.equal(r.vencEstricto, 1);  // 11-oct (el 10-nov exacto NO cuenta en modo estricto)
      assert.equal(r.vencIgual, 2);
      assert.equal(r.invalida, 0);
    });
  }
});

describe('fecha-sin-formulas-sueltas', () => {
  const archivos = (dir, acc = []) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); e.isDirectory() ? archivos(f, acc) : e.name.endsWith('.js') && acc.push(f); } return acc; };
  // Excepciones con motivo: respaldos.js es un módulo ES que se prueba suelto en Node, y salud.js/reglas.js los carga también el
  // script de push (Node, sin globales de la página): cada uno ya calcula en UTC o con su propia función local, sin depender de Fecha.
  const EXCEPCIONES = new Set(['core/fecha.js', 'core/respaldos.js', 'core/salud.js', 'core/reglas.js']);
  function hallazgos(regex) {
    const out = [];
    for (const f of archivos(path.join(raiz, 'js'))) {
      const rel = path.relative(path.join(raiz, 'js'), f).split(path.sep).join('/');
      if (EXCEPCIONES.has(rel)) continue;
      fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => { if (!/^\s*(\/\/|\*)/.test(l) && regex.test(l)) out.push(rel + ':' + (i + 1)); });
    }
    return out;
  }
  test('ningún toISOString().slice/split fuera de fecha.js (devuelve la fecha en UTC: el día se corre según el huso)', () => {
    assert.deepEqual(hallazgos(/toISOString\(\)\s*\.\s*(slice|split|substring|substr)/), []);
  });
  test('nadie arma «AAAA-MM» a mano con getMonth()+1 y padStart: usa Fecha.mes / Fecha.mesKey / Fecha.iso', () => {
    assert.deepEqual(hallazgos(/getMonth\(\)\s*\+\s*1\s*\)\s*\.padStart/), []);
  });
  test('ningún 86400000 / 864e5 suelto: días de calendario → Fecha.diasEntre; marcas de tiempo → Fecha.MS_DIA', () => {
    const permitidos = new Set(['core/periodo.js', 'core/salud.js', 'core/reglas.js']);   // UTC exactos y autosuficientes
    const malos = hallazgos(/86400000|864e5/).filter(h => !permitidos.has(h.split(':')[0]));
    assert.deepEqual(malos, []);
  });
  test('nextMonthFixed ya no existe (era spSumarDias(f, 30·k) con otro nombre)', () => {
    assert.ok(!fs.readFileSync(path.join(raiz, 'js/modules/spotify.js'), 'utf8').includes('function nextMonthFixed'));
  });
  test('index.html carga fecha.js ANTES del núcleo (estado.js)', () => {
    const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
    const a = html.indexOf('js/core/fecha.js'), b = html.indexOf('js/core/estado.js" defer');
    assert.ok(a > 0 && b > 0 && a < b);
  });
});
