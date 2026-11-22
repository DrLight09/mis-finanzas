'use strict';
// El index.html ya no lista los archivos de la app uno por uno: carga un solo módulo (js/main.js) que los importa en orden. Los tests que
// vigilan «qué se carga y en qué orden» leen el HTML con esta función, que expande esa línea en la lista equivalente de <script> (en el orden
// de js/main.js). Así comprueban el orden real de carga sin depender de cómo se escriba.
const fs = require('node:fs');
const path = require('node:path');
const RAIZ = path.join(__dirname, '..', '..');
function htmlClasico(html) {
  const main = fs.readFileSync(path.join(RAIZ, 'js', 'main.js'), 'utf8');
  const lista = [...main.matchAll(/^import '\.\/([^']+)';/gm)].map(m => '<script src="js/' + m[1] + '" defer></script>').join('\n');
  return String(html).replace(/<script type="module" src="js\/main\.js"><\/script>/, lista);
}
module.exports = { htmlClasico };
