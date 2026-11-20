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

const html = leer('index.html');
const lazy = leer('js/core/lazy-loader.js');
const eager = [...html.matchAll(/<script(?![^>]*type="module")[^>]*src="(js\/[^"]+)"/g)].map(m => m[1]);
const lazyF = [...lazy.matchAll(/'(js\/(?:core|modules)\/[a-z0-9-]+\.js)'/g)].map(m => m[1]).filter(f => !eager.includes(f) && existe(f));
const archivos = [...new Set([...eager, ...lazyF])].filter(f => existe(f) && !esModulo(f));

// Nombres que algún archivo (de cualquier tipo) deja en `window`: ESLint no sabe que ahí nacen globales.
const enWindow = new Set();
const todos = [...archivos, ...fs.readdirSync(path.join(raiz, 'js/core')).map(f => 'js/core/' + f), ...fs.readdirSync(path.join(raiz, 'js/modules')).map(f => 'js/modules/' + f)].filter(f => f.endsWith('.js'));
for (const f of new Set(todos)) {
  const t = leer(f);
  for (const m of t.matchAll(/\bwindow\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)) enWindow.add(m[1]);
  for (const m of t.matchAll(/Object\.assign\(\s*window\s*,\s*\{([^}]*)\}/g)) for (const k of m[1].matchAll(/([A-Za-z_$][\w$]*)\s*[:,]/g)) enWindow.add(k[1]);
}

const mapa = []; let out = '', linea = 1;
for (const f of archivos) { const t = leer(f) + '\n'; mapa.push([linea, f]); out += t; linea += t.split('\n').length - 1; }
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
console.log(`Análisis de ${archivos.length} archivos: ${errores} error(es), ${avisos} aviso(s) (los avisos no frenan).`);
process.exit(errores ? 1 : 0);
