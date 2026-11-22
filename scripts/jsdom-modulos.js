// scripts/jsdom-modulos.js — jsdom no ejecuta <script type="module">. Los archivos que migran a módulo ES (M6) SIN `import` (hojas puras como
// js/core/fecha.js) se sirven a los humos de jsdom como scripts clásicos con `defer` y sin la palabra `export`: el mismo código, en el mismo
// orden del documento. Los módulos con `import` (firebase-*, pin-bio, payload-codec, fusion…) siguen sin ejecutarse aquí, como antes.
'use strict';
const clasicos = html => html.replace(/<script type="module" src="(js\/[^"]+)"><\/script>/g, '<script src="$1" defer></script>');
const sinExport = (contenido, archivo) => (/\.js$/.test(archivo) ? Buffer.from(contenido.toString('utf8').replace(/^export\s+/gm, '')) : contenido);
module.exports = { clasicos, sinExport };
