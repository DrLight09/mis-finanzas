// scripts/modulos-a-clasico.js — convierte un módulo ES de la app en el «script clásico» equivalente (quita `import …;` y la palabra `export`).
// Lo usan las herramientas que evalúan el código sin un navegador con módulos: el arnés de tests (tests/support/load-app.js, vm), los humos de
// jsdom (no soporta import) y el lint de globales. Es seguro porque en la app TODOS los nombres de nivel superior son únicos (un test lo
// comprueba), así que unir los archivos en un solo ámbito global da el mismo comportamiento que tenían como scripts clásicos.
// Los imports van siempre en UNA línea (`import { a, b } from './x.js';`); un test vigila que no aparezca otra forma.
'use strict';
const RE_IMPORT = /^import\s[^\n]*;[ \t]*$/gm;
const RE_EXPORT = /^export\s+(?=(?:async\s+)?(?:function|class|const|let|var)\b)/gm;
const aClasico = codigo => String(codigo).replace(RE_IMPORT, '').replace(RE_EXPORT, '');
// Las dos funciones del puente (js/core/puente.js) no existen sin el import: en el entorno clásico no hacen nada (los nombres ya son globales).
const PRELUDIO = 'function exponerGlobales() {}\nfunction exponerVariables() {}\n';
module.exports = { aClasico, PRELUDIO, RE_IMPORT, RE_EXPORT };
