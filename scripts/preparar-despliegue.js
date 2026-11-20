#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   scripts/preparar-despliegue.js — arma la carpeta que se publica (por defecto dist/) y sella su Service Worker

   Qué hace: copia SOLO lo desplegable (index.html, manifest, css/, js/, icons/ — la misma lista que usa sellar-sw.js para la huella) y
   sw.js a la carpeta destino, y sella ahí `sw.js` (BUILD = huella del contenido, PRECACHE = todos esos archivos). El repo no se toca.
   Así GitHub Pages publica únicamente la app (no docs/, tests/, scripts/…) y la caché del Service Worker cambia de nombre
   exactamente cuando cambia algún archivo, sin pasos manuales.

   Uso:   npm run build                           → dist/
          node scripts/preparar-despliegue.js X   → X/   (los tests lo usan con una carpeta temporal)
   El job «deploy» de .github/workflows/ci.yml lo corre y publica la carpeta resultante.
   ═══════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { archivosDesplegables } = require('./sellar-sw.js');

const RAIZ = path.resolve(__dirname, '..');
const destino = path.resolve(process.argv.find((a, i) => i >= 2 && !a.startsWith('-')) || path.join(RAIZ, 'dist'));

if (destino === RAIZ || RAIZ.startsWith(destino + path.sep)) {
  console.error('El destino no puede ser la raíz del repo ni una carpeta que la contenga: ' + destino);
  process.exit(1);
}

fs.rmSync(destino, { recursive: true, force: true });
fs.mkdirSync(destino, { recursive: true });

const { archivos, rel } = archivosDesplegables(RAIZ);
const copiar = (origen, relativa) => {
  const a = path.join(destino, relativa);
  fs.mkdirSync(path.dirname(a), { recursive: true });
  fs.copyFileSync(origen, a);
};
archivos.forEach(f => copiar(f, rel(f)));
copiar(path.join(RAIZ, 'sw.js'), 'sw.js');
// La carpeta se ignora a sí misma en git (el `*` incluye este mismo archivo): `git add -A` nunca la sube por accidente.
fs.writeFileSync(path.join(destino, '.gitignore'), '*\n');

const sellador = path.join(__dirname, 'sellar-sw.js');
const sellar = spawnSync(process.execPath, [sellador, destino], { encoding: 'utf8' });
process.stdout.write(sellar.stdout || ''); process.stderr.write(sellar.stderr || '');
if (sellar.status !== 0) { console.error('No se pudo sellar sw.js en ' + destino); process.exit(1); }
// Comprobación final: lo que se va a publicar está sellado y su PRECACHE cubre todo lo copiado.
const check = spawnSync(process.execPath, [sellador, '--check', destino], { encoding: 'utf8' });
if (check.status !== 0) { process.stderr.write(check.stderr || ''); console.error('El sw.js de ' + destino + ' no quedó sellado.'); process.exit(1); }
console.log(`Despliegue listo en ${path.relative(process.cwd(), destino) || '.'}: ${archivos.length + 1} archivos.`);
