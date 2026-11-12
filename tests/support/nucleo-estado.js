'use strict';
// El antiguo js/core/core-state.js se dividió por responsabilidad. Esta lista es el ORDEN de carga (el mismo de index.html; un test lo comprueba).
// Los tests siguen pidiendo «core-state.js» a loadApp(): se expande a estas partes. Para tests que leen el código fuente: leerEstado().
const fs = require('node:fs');
const path = require('node:path');
const RAIZ = path.join(__dirname, '..', '..');
const PARTES = ['estado.js', 'cuentas-fuentes.js', 'persistencia.js', 'patrimonio.js', 'ingresos.js', 'dialogos.js', 'utilidades-ui.js', 'refresh.js'];
const RUTAS = PARTES.map(p => path.join(RAIZ, 'js', 'core', p));
const REL = PARTES.map(p => 'js/core/' + p);
const leerEstado = () => RUTAS.map(r => fs.readFileSync(r, 'utf8')).join('\n');
const esParte = f => PARTES.some(p => f.endsWith('/' + p) || f.endsWith('\\' + p) || f === p);
module.exports = { PARTES, RUTAS, REL, leerEstado, esParte };
