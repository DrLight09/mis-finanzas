#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   scripts/sellar-sw.js — sella el Service Worker con una huella del contenido desplegable

   Problema que resuelve (mejoras-mis-finanzas.md §A10): `VERSION` en sw.js se sube a mano. Si se olvida, el navegador conserva la
   caché vieja y sirve los .js anteriores por «stale-while-revalidate» sin avisar. Ahora el nombre de la caché es
   `${VERSION}-${BUILD}`, y BUILD es un hash (SHA-256, 12 caracteres) de los archivos que se despliegan: cualquier cambio en
   index.html, css/, js/, manifest o icons/ cambia BUILD → el SW nuevo se instala y borra la caché anterior, aunque se olvide subir VERSION.
   VERSION se sigue subiendo a propósito (es el número que se lee en el CHANGELOG); BUILD es la red de seguridad.
   Además escribe en sw.js el bloque `// <PRECACHE> … // </PRECACHE>` con TODOS los archivos desplegables: el SW los baja juntos al
   instalarse (si falta uno, la versión nueva no se instala y sigue la anterior) y los sirve de esa misma caché.

   Uso (desde la raíz del repo):
     node scripts/sellar-sw.js            → calcula la huella y la escribe en sw.js (línea `const BUILD = '…'`)
     node scripts/sellar-sw.js --check    → no escribe; sale con código 1 si sw.js no coincide con los archivos
                                            (lo corre `npm test`, tests/sesion-y-despliegue.test.js)

   Sin dependencias. Determinista: los saltos de línea se normalizan a LF (Windows con autocrlf da el mismo hash) y las rutas se
   ordenan. Qué entra: index.html, manifest.webmanifest, css/**, js/**, icons/**. Qué NO entra: sw.js (se sella a sí mismo),
   docs/, tests/, scripts/, node_modules/ (no se despliegan).
   ═══════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RAIZ = path.resolve(process.argv.find(a => !a.startsWith('-') && a !== process.argv[0] && a !== process.argv[1]) || process.cwd());
const ARCHIVOS_RAIZ = ['index.html', 'manifest.webmanifest'];
const CARPETAS = ['css', 'js', 'icons'];
const TEXTO = /\.(html|css|js|json|webmanifest|svg|md|txt)$/i;

function listar(dir, acc) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listar(p, acc); else acc.push(p);
  }
  return acc;
}

function archivosDesplegables(raiz) {
  const archivos = [];
  ARCHIVOS_RAIZ.forEach(f => { if (fs.existsSync(path.join(raiz, f))) archivos.push(path.join(raiz, f)); });
  CARPETAS.forEach(c => listar(path.join(raiz, c), archivos));
  const rel = f => path.relative(raiz, f).split(path.sep).join('/');
  archivos.sort((a, b) => (rel(a) < rel(b) ? -1 : 1));
  return { archivos, rel };
}

// Lista (rutas relativas a la raíz del sitio) que el SW precachea: todo lo desplegable. Una versión = un conjunto coherente.
function listaPrecache(raiz) {
  const { archivos, rel } = archivosDesplegables(raiz);
  return ['./'].concat(archivos.map(rel));
}

function huella(raiz) {
  const { archivos, rel } = archivosDesplegables(raiz);
  const h = crypto.createHash('sha256');
  for (const f of archivos) {
    let buf = fs.readFileSync(f);
    if (TEXTO.test(f)) buf = Buffer.from(buf.toString('utf8').replace(/\r\n?/g, '\n'), 'utf8');
    h.update(rel(f) + '\0').update(buf).update('\0');
  }
  return { build: h.digest('hex').slice(0, 12), archivos: archivos.length };
}

const RE_BUILD = /^const BUILD = '([^']*)';.*$/m;
const RE_PRECACHE = /\/\/ <PRECACHE>[\s\S]*?\/\/ <\/PRECACHE>/;
const bloquePrecache = lista => `// <PRECACHE> — lo escribe scripts/sellar-sw.js: todo lo desplegable (una versión = un conjunto coherente y offline completo)\nconst PRECACHE = ${JSON.stringify(lista, null, 2)};\n// </PRECACHE>`;

function sellar({ chequear }) {
  const swPath = path.join(RAIZ, 'sw.js');
  const sw = fs.readFileSync(swPath, 'utf8');
  const m = RE_BUILD.exec(sw);
  if (!m) { console.error("sw.js no tiene la línea `const BUILD = '…';`."); return 1; }
  const { build, archivos } = huella(RAIZ);
  const conPrecache = RE_PRECACHE.test(sw);
  const bloque = bloquePrecache(listaPrecache(RAIZ));
  const precacheAlDia = !conPrecache || RE_PRECACHE.exec(sw)[0] === bloque;
  if (m[1] === build && precacheAlDia) { console.log(`sw.js ya está sellado (BUILD ${build}, ${archivos} archivos).`); return 0; }
  if (chequear) {
    console.error(`sw.js está desactualizado: BUILD ${m[1]} ≠ ${build} o PRECACHE distinto (cambió algún archivo desplegable). Corre: node scripts/sellar-sw.js`);
    return 1;
  }
  let nuevo = sw.replace(RE_BUILD, `const BUILD = '${build}'; // sellado por scripts/sellar-sw.js — NO editar a mano (huella del contenido desplegable)`);
  if (conPrecache) nuevo = nuevo.replace(RE_PRECACHE, () => bloque);
  fs.writeFileSync(swPath, nuevo, 'utf8');
  console.log(`sw.js sellado: BUILD ${m[1]} → ${build} (${archivos} archivos).`);
  return 0;
}

if (require.main === module) process.exit(sellar({ chequear: process.argv.includes('--check') }));
module.exports = { huella, sellar, listaPrecache };
