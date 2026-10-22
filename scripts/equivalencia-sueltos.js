'use strict';
// Verifica los archivos sueltos del Paso 5 (mesada, wrapped-gate, core-state, pin-bio, gastos-fijos-progress): compara por pares el
// fragmento ANTES (con style="") y DESPUÉS (con clases) usando el CSS nuevo, con scripts/equivalencia-estilos.js.
// Uso: node scripts/equivalencia-sueltos.js   (los fragmentos son los de la tanda de 2026-10-21, tal como estaban en js.zip)
const path = require('path');
const { compararHtml } = require('./equivalencia-estilos');
const css = path.join(__dirname, '..', 'css', 'styles.css');
const svgIni = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"';
const pares = [
  ['mesada: etiqueta de fuente (badge 9px)',
    '<div class="ms-split-row"><span class="badge badge-nequi" style="font-size:9px;">Nequi</span><span class="ms-split-monto">+$1</span></div>',
    '<div class="ms-split-row"><span class="badge badge-xs badge-nequi">Nequi</span><span class="ms-split-monto">+$1</span></div>'],
  ['wrapped-gate: flecha del botón',
    `<button class="btn btn-primary">Ver ${svgIni} style="vertical-align:-2px;"><polyline points="9 18 15 12 9 6"/></svg></button>`,
    `<button class="btn btn-primary">Ver ${svgIni} class="wrapped-gate-flecha"><polyline points="9 18 15 12 9 6"/></svg></button>`],
  ['core-state: ícono de ganancia',
    '<span>x<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" style="vertical-align:middle;display:inline-block"><ellipse cx="12" cy="17" rx="8" ry="3"/></svg></span>',
    '<span>x<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" class="ico-inline"><ellipse cx="12" cy="17" rx="8" ry="3"/></svg></span>'],
  ['pin-bio: con PIN (dos botones en fila)',
    '<div style="display:flex;gap:8px;"><button class="btn btn-ghost btn-sm" data-action="pin:setNew" style="flex:1;">Cambiar PIN</button><button class="btn btn-ghost btn-sm" data-action="pin:disable" style="flex:1;color:var(--red);border-color:rgba(240,104,104,.4);">Quitar PIN</button></div>',
    '<div class="pin-fila-btns"><button class="btn btn-ghost btn-sm btn-flex1" data-action="pin:setNew">Cambiar PIN</button><button class="btn btn-ghost btn-sm btn-flex1 btn-peligro" data-action="pin:disable">Quitar PIN</button></div>'],
  ['pin-bio: sin PIN', '<button class="btn btn-primary btn-sm" data-action="pin:setNew" style="width:100%;">Activar PIN</button>', '<button class="btn btn-primary btn-sm btn-block" data-action="pin:setNew">Activar PIN</button>'],
  ['pin-bio: desactivar biometría', '<button class="btn btn-ghost btn-sm" data-action="pin:bioDisable" style="width:100%;color:var(--red);border-color:rgba(240,104,104,.4);">Desactivar huella</button>', '<button class="btn btn-ghost btn-sm btn-block btn-peligro" data-action="pin:bioDisable">Desactivar huella</button>'],
  ['pin-bio: activar biometría', '<button class="btn btn-primary btn-sm" data-action="pin:bioSetup" style="width:100%;">Activar huella</button>', '<button class="btn btn-primary btn-sm btn-block" data-action="pin:bioSetup">Activar huella</button>'],
  ['gastos-fijos: barra de progreso (width:0% inline → regla de la clase)',
    '<div class="fijos-progress-bar"><div class="fijos-progress-fill" id="fijos-progress-fill" style="width:0%"></div></div>',
    '<div class="fijos-progress-bar"><div class="fijos-progress-fill" id="fijos-progress-fill"></div></div>'],
];
let fallos = 0;
for (const [nombre, a, b] of pares) {
  const r = compararHtml(`<div>${a}</div>`, `<div>${b}</div>`, css);
  const otros = r.avisos.filter(x => !x.includes('@media'));
  if (r.diferencias.length || otros.length) { fallos++; console.log('FALLA', nombre, JSON.stringify(r.diferencias.slice(0, 3), null, 1), otros); }
  else console.log('ok   ', nombre, `(${r.elementos} elementos)`);
}
console.log(`\n${pares.length} pares, ${fallos} con diferencias`); process.exit(fallos ? 1 : 0);
