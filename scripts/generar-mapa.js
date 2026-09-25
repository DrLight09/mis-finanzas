#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   scripts/generar-mapa.js

   Genera `mapa-codigo.md`: en qué archivo vive cada función global de
   mis-finanzas y cómo carga ese archivo (de entrada o lazy).

   Uso (desde la raíz del repo):
     node scripts/generar-mapa.js            → escribe mapa-codigo.md
     node scripts/generar-mapa.js --check    → no escribe; sale con código 1
                                                si mapa-codigo.md está desactualizado
                                                (para CI)

   Sin dependencias. La salida es determinista (sin fechas ni orden
   variable), así que --check solo falla si el código realmente cambió.

   Qué lee:
     - js/core/*.js y js/modules/*.js
     - index.html            → <script src="js/..."> = carga de entrada
                               (se ignoran los <!-- comentados -->)
     - js/core/lazy-loader.js → Loader.GROUPS = archivos lazy por grupo

   Qué lista de cada archivo (solo declaraciones en columna 0, o sea
   de nivel superior — es una heurística, no un parser de JS):
     - function nombre(...)  /  async function nombre(...)
     - const|let|var NOMBRE = function | flecha | IIFE | async
       (o un nombre en PascalCase / MAYÚSCULAS: objetos/constantes globales)
     - window.nombre = ...   (se listan aparte: suelen ser parches a una
                              función definida en otro archivo, no una definición)

   Límites conocidos (por eso el mapa dice "qué archivo mirar", no "qué hace"):
     - No ve funciones anidadas dentro de otras ni métodos de objetos.
     - Un `/*` dentro de un string o regex puede confundir el recorte de
       comentarios de bloque.
     - Funciones asignadas con parches (`X = function(){...}` sin
       const/let/var) no se listan.
   ═══════════════════════════════════════════════════════════════ */

'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = process.cwd();
const SALIDA = path.join(RAIZ, 'mapa-codigo.md');
const CARPETAS = ['js/core', 'js/modules'];
const SOLO_CHEQUEAR = process.argv.includes('--check');

// ── utilidades ──────────────────────────────────────────────────
function leer(rel) {
  return fs.readFileSync(path.join(RAIZ, rel), 'utf8');
}
function existe(rel) {
  return fs.existsSync(path.join(RAIZ, rel));
}
function normalizarSrc(src) {
  return src.split('?')[0].split('#')[0].replace(/^\.\//, '').replace(/^\//, '');
}

// Quita comentarios /* */ y líneas que empiezan con // conservando el
// número de líneas (para no desalinear nada).
function sinComentarios(codigo) {
  let salida = '';
  let enBloque = false;
  for (const linea of codigo.split('\n')) {
    let l = linea;
    if (enBloque) {
      const fin = l.indexOf('*/');
      if (fin === -1) { salida += '\n'; continue; }
      l = ' '.repeat(fin + 2) + l.slice(fin + 2);
      enBloque = false;
    }
    // quitar bloques /* ... */ completos dentro de la línea
    l = l.replace(/\/\*.*?\*\//g, m => ' '.repeat(m.length));
    const ini = l.indexOf('/*');
    if (ini !== -1) { l = l.slice(0, ini); enBloque = true; }
    if (/^\s*\/\//.test(l)) l = '';
    salida += l + '\n';
  }
  return salida;
}

// ── 1. cómo carga cada archivo ─────────────────────────────────
// index.html: <script src="js/..."> fuera de comentarios HTML
function cargaDesdeIndex() {
  const mapa = new Map(); // ruta → 'defer' | 'async' | 'module' | 'sync'
  if (!existe('index.html')) return mapa;
  const html = leer('index.html').replace(/<!--[\s\S]*?-->/g, '');
  const re = /<script\b([^>]*)>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs);
    if (!src) continue;
    const ruta = normalizarSrc(src[1]);
    if (!ruta.startsWith('js/')) continue;
    let tipo = 'sync';
    if (/\btype\s*=\s*["']module["']/i.test(attrs)) tipo = 'module';
    else if (/\basync\b/i.test(attrs)) tipo = 'async';
    else if (/\bdefer\b/i.test(attrs)) tipo = 'defer';
    mapa.set(ruta, tipo);
  }
  return mapa;
}

// lazy-loader.js: const GROUPS = { grupo: ['js/...'], ... }
function gruposLazy() {
  const mapa = new Map(); // ruta → grupo
  const rel = 'js/core/lazy-loader.js';
  if (!existe(rel)) return mapa;
  const codigo = sinComentarios(leer(rel));
  const ini = codigo.search(/const\s+GROUPS\s*=\s*\{/);
  if (ini === -1) return mapa;
  // el objeto termina en la primera línea "  };" (2 espacios) posterior
  const resto = codigo.slice(ini);
  const fin = resto.search(/\n\s{2}\};/);
  const cuerpo = fin === -1 ? resto : resto.slice(0, fin);
  const re = /([A-Za-z_$][\w$]*)\s*:\s*\[([^\]]*)\]/g;
  let m;
  while ((m = re.exec(cuerpo))) {
    const grupo = m[1];
    const archivos = [...m[2].matchAll(/['"]([^'"]+)['"]/g)].map(x => normalizarSrc(x[1]));
    archivos.forEach(a => mapa.set(a, grupo));
  }
  return mapa;
}

// ── 2. qué declara cada archivo ────────────────────────────────
function declaraciones(codigo) {
  const funciones = new Set();
  const globales = new Set();
  const enWindow = new Set();
  for (const linea of sinComentarios(codigo).split('\n')) {
    let m;
    if ((m = /^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/.exec(linea))) {
      funciones.add(m[1]);
    } else if ((m = /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(.*)$/.exec(linea))) {
      const nombre = m[1], rhs = m[2];
      const esFuncion = /^(?:async\b|function\b|\(.*\)\s*=>|[A-Za-z_$][\w$]*\s*=>|\(\s*function|\(\s*\(|\(\s*async)/.test(rhs);
      const esGlobalNombrada = /^[A-Z][A-Za-z0-9]*$/.test(nombre) || /^[A-Z][A-Z0-9_]+$/.test(nombre);
      if (esFuncion) funciones.add(nombre);
      else if (esGlobalNombrada) globales.add(nombre);
    } else if ((m = /^window\.([A-Za-z_$][\w$]*)\s*=/.exec(linea))) {
      enWindow.add(m[1]);
    }
  }
  // Lo declarado con function/const no se repite en la lista de window.
  return {
    funciones: [...funciones].sort(cmp),
    globales: [...globales].filter(n => !funciones.has(n)).sort(cmp),
    enWindow: [...enWindow].filter(n => !funciones.has(n) && !globales.has(n)).sort(cmp),
  };
}
function cmp(a, b) { return a.localeCompare(b, 'en', { sensitivity: 'base' }) || (a < b ? -1 : a > b ? 1 : 0); }

// ── 3. armar el mapa ───────────────────────────────────────────
const carga = cargaDesdeIndex();
const lazy = gruposLazy();

const archivos = [];
for (const carpeta of CARPETAS) {
  if (!existe(carpeta)) continue;
  for (const nombre of fs.readdirSync(path.join(RAIZ, carpeta)).sort()) {
    if (!nombre.endsWith('.js')) continue;
    const ruta = `${carpeta}/${nombre}`;
    const { funciones, globales, enWindow } = declaraciones(leer(ruta));
    let cargaTxt;
    if (lazy.has(ruta)) cargaTxt = `lazy — grupo \`${lazy.get(ruta)}\``;
    else if (carga.has(ruta)) cargaTxt = carga.get(ruta) === 'module' ? 'de entrada (módulo ES)' : `de entrada (${carga.get(ruta)})`;
    else cargaTxt = 'sin <script> ni grupo lazy (¿lo importa otro archivo?)';
    archivos.push({ ruta, cargaTxt, funciones, globales, enWindow });
  }
}

// rutas referenciadas pero que no existen (sirve para detectar archivos movidos/borrados)
const referenciadasSinArchivo = [...new Set([...carga.keys(), ...lazy.keys()])]
  .filter(r => !existe(r))
  .sort();

// nombre → archivos donde se declara
const indice = new Map();      // todos los nombres (declarados o asignados a window)
const declarados = new Map();  // solo function/const/let/var — para detectar colisiones
for (const a of archivos) {
  for (const n of [...a.funciones, ...a.globales]) {
    if (!declarados.has(n)) declarados.set(n, []);
    declarados.get(n).push(a.ruta);
    if (!indice.has(n)) indice.set(n, []);
    indice.get(n).push({ ruta: a.ruta });
  }
  for (const n of a.enWindow) {
    if (!indice.has(n)) indice.set(n, []);
    indice.get(n).push({ ruta: a.ruta, nota: `window.${n} = …` });
  }
}
const duplicados = [...declarados.entries()].filter(([, r]) => r.length > 1).sort((x, y) => cmp(x[0], y[0]));

// ── 4. escribir markdown ───────────────────────────────────────
const L = [];
L.push('# Mapa de código — mis-finanzas');
L.push('');
L.push('> **Archivo generado — no editar a mano.** Se regenera con `node scripts/generar-mapa.js` (y `--check` en CI lo verifica). Sirve para saber **qué archivo mirar**, no qué hace cada función: el comportamiento real siempre está en el código. Reglas y advertencias escritas a mano: [`arquitectura-archivos.md`](./arquitectura-archivos.md).');
L.push('');
L.push('Lista solo declaraciones de nivel superior (funciones, y constantes/objetos globales en PascalCase o MAYÚSCULAS). No incluye funciones anidadas ni métodos de objetos. Ver los límites en la cabecera de `scripts/generar-mapa.js`.');
L.push('');
L.push('## 1. Archivos y cómo cargan');
L.push('');
L.push('| Archivo | Carga | Funciones | Globales |');
L.push('|---|---|---|---|');
for (const a of archivos) {
  L.push(`| \`${a.ruta}\` | ${a.cargaTxt} | ${a.funciones.length} | ${a.globales.length} |`);
}
L.push('');
if (referenciadasSinArchivo.length) {
  L.push('**Referenciados en `index.html` o `Loader.GROUPS` pero que no existen en las carpetas escaneadas:**');
  L.push('');
  referenciadasSinArchivo.forEach(r => L.push(`- \`${r}\``));
  L.push('');
}
L.push('## 2. Qué declara cada archivo');
L.push('');
for (const a of archivos) {
  L.push(`### \`${a.ruta}\``);
  L.push('');
  L.push(`Carga: ${a.cargaTxt}`);
  L.push('');
  L.push(a.funciones.length ? `**Funciones:** ${a.funciones.map(n => '`' + n + '`').join(', ')}` : '**Funciones:** —');
  if (a.globales.length) {
    L.push('');
    L.push(`**Globales:** ${a.globales.map(n => '`' + n + '`').join(', ')}`);
  }
  if (a.enWindow.length) {
    L.push('');
    L.push(`**Asigna a \`window\`:** ${a.enWindow.map(n => '`' + n + '`').join(', ')}`);
  }
  L.push('');
}
L.push('## 3. Nombres declarados en más de un archivo');
L.push('');
if (duplicados.length) {
  L.push('Un nombre declarado (function/const/let/var) en dos archivos es una posible colisión: la última carga pisa a la anterior. No cuenta `window.x = …`, que se usa a propósito para parchar.');
  L.push('');
  L.push('| Nombre | Archivos |');
  L.push('|---|---|');
  duplicados.forEach(([n, r]) => L.push(`| \`${n}\` | ${r.map(x => '`' + x + '`').join(', ')} |`));
} else {
  L.push('Ninguno.');
}
L.push('');
L.push('## 4. Índice inverso (nombre → archivo)');
L.push('');
L.push('| Nombre | Archivo |');
L.push('|---|---|');
[...indice.entries()].sort((x, y) => cmp(x[0], y[0])).forEach(([n, r]) => {
  L.push(`| \`${n}\` | ${r.map(x => '`' + x.ruta + '`' + (x.nota ? ' (' + x.nota + ')' : '')).join(', ')} |`);
});
L.push('');

const resultado = L.join('\n');

if (SOLO_CHEQUEAR) {
  const actual = fs.existsSync(SALIDA) ? fs.readFileSync(SALIDA, 'utf8') : null;
  if (actual === resultado) {
    console.log('mapa-codigo.md está al día.');
    process.exit(0);
  }
  console.error('mapa-codigo.md está desactualizado o no existe. Corre: node scripts/generar-mapa.js');
  process.exit(1);
}
fs.writeFileSync(SALIDA, resultado, 'utf8');
console.log(`mapa-codigo.md generado: ${archivos.length} archivos, ${indice.size} nombres.`);
