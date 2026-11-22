'use strict';
// M6 — la app son módulos ES nativos (sin bundler): js/main.js importa el núcleo en orden, cada archivo importa lo que usa de los que
// cargan antes, y el resto se resuelve por el puente global (js/core/puente.js). Estas pruebas vigilan que esa estructura no se degrade.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { RE_IMPORT } = require('../scripts/modulos-a-clasico');
const raiz = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(raiz, f), 'utf8');
const sinComentarios = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

const main = leer('js/main.js');
const ordenMain = [...main.matchAll(/^import '\.\/([^']+)';/gm)].map(m => 'js/' + m[1]);
const html = leer('index.html').replace(/<!--[\s\S]*?-->/g, '');
const clasicos = [...html.matchAll(/<script(?![^>]*type="module")[^>]*src="(js\/[^"]+)"/g)].map(m => m[1]);
const lazy = (() => { const g = leer('js/core/lazy-loader.js').match(/const GROUPS = (\{[\s\S]*?\n  \});/)[1]; return [...new Set([...g.matchAll(/'(js\/[a-z/-]+\.js)'/g)].map(m => m[1]))]; })();
const ES_DE_FUERA = ['js/core/firebase-init.js', 'js/core/firebase-sync.js', 'js/core/pin-bio.js', 'js/core/payload-codec.js', 'js/core/fusion.js', 'js/core/validar-estado.js', 'js/core/respaldos.js'];
const LOGICA = ['js/core/umbrales.js', 'js/core/reglas.js', 'js/core/salud.js', 'js/core/plan-deudas.js'];
const modulosApp = [...ordenMain, ...lazy.filter(f => !ordenMain.includes(f))];
const exportados = f => new Set([...leer(f).matchAll(/^export\s+(?:async\s+)?(?:function\s*\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]));
const importsDe = f => [...leer(f).matchAll(/^import\s+\{([^}]*)\}\s+from\s+'([^']+)';/gm)].map(m => ({ nombres: m[1].split(',').map(x => x.trim()).filter(Boolean), de: path.posix.normalize(path.posix.join(path.posix.dirname(f), m[2])) }));

describe('módulos ES: js/main.js y el orden de carga', () => {
  test('index.html carga UN solo módulo de la app (js/main.js) y ya no lista los archivos uno por uno', () => {
    assert.equal([...html.matchAll(/<script type="module" src="js\/main\.js"><\/script>/g)].length, 1);
    const sueltos = [...html.matchAll(/<script[^>]*src="(js\/[^"]+)"[^>]*>/g)].map(m => m[1]).filter(f => !ES_DE_FUERA.includes(f) && f !== 'js/main.js');
    assert.deepEqual(sueltos, []);
  });
  test('ya no queda ningún <script> clásico de la app: todo entra por main.js', () => {
    assert.deepEqual(clasicos, []);
  });
  test('la lógica pura que también carga Node (umbrales, reglas, salud, plan-deudas) es módulo ES sin tocar window ni puente: la expone globales-logica.js', () => {
    for (const f of LOGICA) {
      const t = sinComentarios(leer(f));
      assert.ok(!/\bwindow\b|module\.exports|\brequire\(|puente\.js/.test(t), f + ' debe poder cargarse en Node sin navegador');
    }
    const g = sinComentarios(leer('js/core/globales-logica.js'));
    for (const n of LOGICA.flatMap(f => [...exportados(f)])) assert.ok(new RegExp('exponerGlobales\\(\\{[^}]*\\b' + n + '\\b').test(g), n + ' no se expone en globales-logica.js');
    const pos = f => ordenMain.indexOf(f);
    assert.ok(pos('js/core/globales-logica.js') > Math.max(...LOGICA.map(pos)) && pos('js/core/globales-logica.js') < pos('js/core/async-css.js'));
  });
  test('main.js importa puente.js primero y fecha.js segundo; no importa módulos lazy ni los de Firebase', () => {
    assert.equal(ordenMain[0], 'js/core/puente.js');
    assert.equal(ordenMain[1], 'js/core/fecha.js');
    for (const f of ordenMain) { assert.ok(fs.existsSync(path.join(raiz, f)), f + ' no existe'); assert.ok(!lazy.includes(f), f + ' es lazy: no va en main.js'); assert.ok(!ES_DE_FUERA.includes(f), f); }
    assert.equal(new Set(ordenMain).size, ordenMain.length, 'archivo repetido en main.js');
  });
  test('todo archivo de js/core y js/modules está en main.js, en un grupo lazy o es un módulo de fuera de la app', () => {
    const conocidos = new Set([...ordenMain, ...lazy, ...ES_DE_FUERA]);
    for (const carpeta of ['js/core', 'js/modules']) for (const n of fs.readdirSync(path.join(raiz, carpeta)).filter(x => x.endsWith('.js'))) assert.ok(conocidos.has(carpeta + '/' + n), carpeta + '/' + n + ' no se carga desde ningún sitio');
  });
});

describe('módulos ES: los imports', () => {
  test('cada import es de UNA línea, con llaves, y pide solo nombres que el otro archivo exporta', () => {
    for (const f of modulosApp) {
      const sin = sinComentarios(leer(f));
      const lineas = sin.split('\n').filter(l => /^import\b/.test(l));
      for (const l of lineas) assert.ok(/^import\s+\{[^}]*\}\s+from\s+'[^']+';\s*$/.test(l), f + ': import fuera de la forma de una línea: ' + l.slice(0, 80));
      for (const { nombres, de } of importsDe(f)) {
        assert.ok(fs.existsSync(path.join(raiz, de)), f + ' importa ' + de + ' que no existe');
        const ex = exportados(de);
        for (const n of nombres) assert.ok(ex.has(n), `${f} importa «${n}» de ${de}, que no lo exporta`);
      }
    }
  });
  test('el grafo de imports no tiene ciclos y solo apunta hacia archivos que cargan ANTES (así el orden de evaluación es el de main.js)', () => {
    const pos = Object.fromEntries(ordenMain.map((f, i) => [f, i]));
    for (const f of modulosApp) for (const { de } of importsDe(f)) {
      if (f === 'js/core/puente.js') continue;
      assert.ok(!lazy.includes(de), `${f} importa de forma estática el módulo lazy ${de}: usa el puente global (nombre suelto con guardia typeof)`);
      assert.ok(pos[de] !== undefined, `${f} importa ${de}, que no está en main.js`);
      if (pos[f] !== undefined) assert.ok(pos[de] < pos[f], `${f} importa ${de}, que carga DESPUÉS: crearía un ciclo o cambiaría el orden. Usa el puente global (nombre suelto).`);
    }
  });
  test('los nombres de nivel superior son únicos en toda la app (requisito del puente global y del arnés de tests)', () => {
    const dueño = new Map();
    for (const f of modulosApp) for (const n of exportados(f)) {
      assert.ok(!dueño.has(n), `${n} está declarado en ${dueño.get(n)} y en ${f}`);
      dueño.set(n, f);
    }
  });
});

describe('módulos ES: el puente global', () => {
  test('cada módulo deja en window todas sus funciones (al principio) y constantes/clases (al final)', () => {
    for (const f of modulosApp.filter(x => x !== 'js/core/puente.js' && !LOGICA.includes(x))) {
      const t = leer(f);
      const funciones = [...t.matchAll(/^export\s+(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
      const consts = [...t.matchAll(/^export\s+(?:const|class)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
      const expuestas = [...t.matchAll(/exponerGlobales\(\{([^}]*)\}\);/g)].flatMap(m => m[1].split(',').map(x => x.trim()).filter(Boolean));
      for (const n of [...funciones, ...consts]) assert.ok(expuestas.includes(n), `${f}: «${n}» no está en exponerGlobales (los módulos lazy y el código «hacia adelante» lo llaman por nombre)`);
    }
  });
  test('puente.js: las funciones definen propiedades de window y no revientan con propiedades nativas', () => {
    const vm = require('node:vm');
    const w = {}; const ctx = vm.createContext({ window: w, Object, Array });
    vm.runInContext(leer('js/core/puente.js').replace(/^export\s+/gm, '') + '\nthis.api = { exponerGlobales, exponerVariables };', ctx);
    let valor = 1; const sellada = {}; Object.defineProperty(w, 'top', { value: sellada, configurable: false });
    ctx.api.exponerGlobales({ f: () => 7, top: 5 });
    assert.equal(w.f(), 7); assert.equal(w.top, sellada, 'una propiedad nativa no configurable no se toca ni lanza');
    ctx.api.exponerVariables({ v: [() => valor, x => { valor = x; }] });
    assert.equal(w.v, 1); w.v = 9; assert.equal(valor, 9); valor = 3; assert.equal(w.v, 3, 'el accesor lee el valor actual, no una copia');
  });
  test('ningún módulo asigna una variable importada (p. ej. S: para reemplazar el estado completo se usa setEstado)', () => {
    const acorn = require('acorn'), escope = require('eslint-scope');
    for (const f of modulosApp) {
      const ast = acorn.parse(leer(f), { ecmaVersion: 'latest', sourceType: 'module', ranges: true, locations: true });
      const mod = escope.analyze(ast, { ecmaVersion: 2022, sourceType: 'module' }).globalScope.childScopes.find(x => x.type === 'module');
      const visitar = sc => {
        for (const ref of sc.references) if (ref.isWrite() && ref.resolved && ref.resolved.defs.some(d => d.type === 'ImportBinding')) assert.fail(`${f}:${ref.identifier.loc.start.line} asigna «${ref.identifier.name}», que es un import (solo lectura)`);
        sc.childScopes.forEach(visitar);
      };
      visitar(mod);
    }
  });
});

describe('módulos ES: el cargador de pantallas lazy', () => {
  test('lazy-loader usa import() (o el gancho de los humos de jsdom), no inyecta <script> clásico', () => {
    const t = sinComentarios(leer('js/core/lazy-loader.js'));
    assert.ok(/import\(u\)/.test(t) && /__cargarModulo/.test(t));
    assert.ok(!/createElement\('script'\)/.test(t));
  });
  test('un import suelto con forma distinta no pasa desapercibido para el arnés (RE_IMPORT cubre las líneas de import de una línea)', () => {
    assert.ok(RE_IMPORT.test("import { a, b } from './x.js';"));
  });
});
