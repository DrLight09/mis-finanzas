// scripts/jsdom-modulos.js — jsdom no ejecuta módulos ES ni import(). La app (M6) carga js/main.js, que importa sus archivos; aquí se la
// sirve a jsdom como lo que era antes: la lista equivalente de <script defer> en el mismo orden, con cada archivo sin `import`/`export`
// (scripts/modulos-a-clasico.js), y los grupos lazy se inyectan como script clásico por el gancho `window.__cargarModulo` del cargador
// (js/core/lazy-loader.js). Es el mismo código y el mismo orden; lo que NO comprueba es el cableado de los imports: eso lo hace
// `npm run navegador`, en un Chromium real.
// Los módulos que no son de la app (firebase-init/sync, pin-bio, payload-codec, fusion, validar-estado…) importan cosas de la red o entre sí
// y siguen sin ejecutarse aquí, como antes.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { aClasico } = require('./modulos-a-clasico');
const RAIZ = path.join(__dirname, '..');
const clasicos = html => {
  const main = fs.readFileSync(path.join(RAIZ, 'js', 'main.js'), 'utf8');
  const lista = [...main.matchAll(/^import '\.\/([^']+)';/gm)].map(m => '<script src="js/' + m[1] + '" defer></script>').join('\n');
  return html.replace(/<script type="module" src="js\/main\.js"><\/script>/, lista);
};
const sinExport = (contenido, archivo) => (/\.js$/.test(archivo) ? Buffer.from(aClasico(contenido.toString('utf8'))) : contenido);
// Para `beforeParse(win)`: el cargador lazy inyecta cada archivo como script clásico.
const prepararVentana = win => {
  win.__cargarModulo = url => new Promise((ok, mal) => {
    const s = win.document.createElement('script');
    s.src = url; s.onload = () => ok(); s.onerror = () => mal(new Error('No se pudo cargar ' + url));
    win.document.body.appendChild(s);
  });
};
module.exports = { clasicos, sinExport, prepararVentana };
