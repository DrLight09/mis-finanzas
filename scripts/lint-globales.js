#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   scripts/lint-globales.js — análisis estático: ¿algún archivo usa un nombre que no existe?

   La app son scripts clásicos que comparten el ámbito global. Si se renombra una función y queda una referencia con el nombre viejo,
   NADA lo avisa hasta que ese camino se ejecuta (y el arnés de tests en modo `permissive` convierte cualquier global que falta en una
   función vacía, así que tampoco falla ahí). Este script concatena los scripts clásicos en el orden de index.html + los grupos
   lazy, y corre ESLint (`no-undef` y reglas parecidas) sobre el resultado. Sale con código 1 si hay errores.

   Qué cuenta como «definido»: lo declarado en algún script, las globales del navegador y lo que algún archivo expone con
   `window.X = …` o `Object.assign(window, { … })` (esos no los ve ESLint). Los módulos ES (`import`/`export`) quedan fuera: ya fallan solos al cargar.
   Uso:  npm run lint
   ═══════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const raiz = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(raiz, f), 'utf8');
const existe = f => fs.existsSync(path.join(raiz, f));
const esModulo = f => /^(import|export)\s/m.test(leer(f));
const { aClasico, PRELUDIO } = require('./modulos-a-clasico');

const html = leer('index.html');
const lazy = leer('js/core/lazy-loader.js');
const clasicos = [...html.matchAll(/<script(?![^>]*type="module")[^>]*src="(js\/[^"]+)"/g)].map(m => m[1]);
// js/main.js importa, en orden, los módulos de carga inmediata (M6); los clásicos (lógica pura que también carga Node) van antes.
const deMain = [...leer('js/main.js').matchAll(/^import '\.\/([^']+)';/gm)].map(m => 'js/' + m[1]);
const eager = [...clasicos, ...deMain];
const modulosApp = new Set([...deMain]);
const lazyF = [...lazy.matchAll(/'(js\/(?:core|modules)\/[a-z0-9-]+\.js)'/g)].map(m => m[1]).filter(f => !eager.includes(f) && existe(f));
const archivos = [...new Set([...eager, ...lazyF])].filter(f => existe(f) && (!esModulo(f) || modulosApp.has(f) || lazyF.includes(f)) && f !== 'js/core/puente.js');

// Nombres que algún archivo (de cualquier tipo) deja en `window`: ESLint no sabe que ahí nacen globales.
const enWindow = new Set();
const todos = [...archivos, ...fs.readdirSync(path.join(raiz, 'js/core')).map(f => 'js/core/' + f), ...fs.readdirSync(path.join(raiz, 'js/modules')).map(f => 'js/modules/' + f)].filter(f => f.endsWith('.js'));
for (const f of new Set(todos)) {
  const t = leer(f);
  for (const m of t.matchAll(/\bwindow\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)) enWindow.add(m[1]);
  for (const m of t.matchAll(/Object\.assign\(\s*window\s*,\s*\{([^}]*)\}/g)) for (const k of m[1].matchAll(/([A-Za-z_$][\w$]*)\s*[:,]/g)) enWindow.add(k[1]);
}

const mapa = []; let out = PRELUDIO, linea = 1 + PRELUDIO.split('\n').length - 1;
for (const f of archivos) { const t = aClasico(leer(f)) + '\n'; mapa.push([linea, f]); out += t; linea += t.split('\n').length - 1; }
const dirLint = path.join(raiz, '.lint');
fs.mkdirSync(dirLint, { recursive: true });
fs.writeFileSync(path.join(dirLint, '.gitignore'), '*\n');   // la carpeta se ignora a sí misma en git
fs.writeFileSync(path.join(dirLint, 'todo.js'), out);

const eslintBin = path.join(raiz, 'node_modules', 'eslint', 'bin', 'eslint.js');   // (el paquete no exporta ese subpath: se arma la ruta)
const r = spawnSync(process.execPath, [eslintBin, '.lint/todo.js', '-f', 'json'], { cwd: raiz, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
let res;
try { res = JSON.parse(r.stdout)[0]; } catch (_) { console.error('ESLint no devolvió un resultado legible:\n' + (r.stderr || r.stdout)); process.exit(2); }

const archivoDe = l => { let f = ''; for (const [s, n] of mapa) { if (l >= s) f = n; else break; } return f; };
const lineaEn = l => { const base = (mapa.filter(([s]) => l >= s).pop() || [1])[0]; return l - base + 1; };
let errores = 0, avisos = 0;
for (const m of res.messages) {
  if (m.ruleId === 'no-undef' && enWindow.has((m.message.match(/'(.+?)'/) || [])[1])) continue;
  const donde = `${archivoDe(m.line)}:${lineaEn(m.line)}`;
  if (m.severity === 2) { errores++; console.log(`ERROR ${donde}  ${m.ruleId}: ${m.message}`); }
  else avisos++;
}
// ── Comprobación en modo MÓDULO (M6) ──────────────────────────────────────────────────────────────────────────────────────────
// Unir los archivos en un script (arriba) no ve un fallo que SÍ ocurre en el navegador: un módulo que usa «por nombre» una variable
// `let`/`var` de otro archivo. Las funciones, constantes y clases las deja en `window` el puente (js/core/puente.js), pero una `let` se
// reasigna y su copia en `window` sería vieja, así que solo se expone si el archivo lo declara a propósito. Aquí se exige que esa lectura
// sea un `import` (enlace vivo) o que la variable esté expuesta con exponerVariables.
try {
  const acorn = require('acorn'), escope = require('eslint-scope');
  const mods = archivos.filter(f => esModulo(f) && f !== 'js/core/fecha.js' || f === 'js/core/fecha.js');
  const dueño = {}, info = {};
  for (const f of mods) {
    const ast = acorn.parse(leer(f), { ecmaVersion: 'latest', sourceType: 'module', ranges: true, locations: true });
    const m = escope.analyze(ast, { ecmaVersion: 2022, sourceType: 'module' }).globalScope.childScopes.find(x => x.type === 'module');
    info[f] = { ast, m };
    for (const v of m.variables) if (v.defs.length && v.defs[0].type !== 'ImportBinding') dueño[v.name] = { f, kind: v.defs[0].parent && v.defs[0].parent.kind || 'fn' };
  }
  for (const f of mods) {
    const g = escope.analyze(info[f].ast, { ecmaVersion: 2022, sourceType: 'module' }).globalScope;
    const expuestas = new Set([...leer(f).matchAll(/exponerVariables\(\{([\s\S]*?)\}\);/g)].flatMap(x => [...x[1].matchAll(/([A-Za-z_$][\w$]*)\s*:\s*\[/g)].map(y => y[1])));
    const ya = new Set();
    for (const ref of g.through) {
      const n = ref.identifier.name, d = dueño[n];
      if (!d || d.f === f || ya.has(n)) continue;
      if ((d.kind === 'let' || d.kind === 'var') && !expuestas.has(n) && !(leer(d.f).match(new RegExp('exponerVariables\\(\\{[^}]*\\b' + n + '\\s*:\\s*\\[')))) {
        ya.add(n); errores++;
        console.log(`ERROR ${f}:${ref.identifier.loc.start.line}  modulo: usa por nombre la variable let '${n}' de ${d.f}; impórtala (import { ${n} } from …) o expónla con exponerVariables`);
      }
    }
  }
} catch (e) { console.log('AVISO: no se pudo hacer la comprobación en modo módulo: ' + e.message); }
console.log(`Análisis de ${archivos.length} archivos: ${errores} error(es), ${avisos} aviso(s) (los avisos no frenan).`);
process.exit(errores ? 1 : 0);
