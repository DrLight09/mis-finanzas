'use strict';
// Equivalencia de estilos para el Paso 5 (estilos inline → clases CSS).
// Compara dos fragmentos HTML (el de antes, con style="…", y el de después, con clases) y comprueba que CADA elemento
// queda con el mismo estilo efectivo. A diferencia de getComputedStyle de jsdom (que ignora la especificidad), aquí se
// calcula la cascada de verdad: declaraciones de styles.css que casan con el elemento + su style="", ordenadas por
// !important → especificidad → orden, y aplicadas sobre un CSSStyleDeclaration (que expande los shorthands).
//   const { compararHtml } = require('./equivalencia-estilos');
//   const r = compararHtml(htmlAntes, htmlDespues, 'css/styles.css');   // { diferencias: [...], avisos: [...], elementos: n }
// Uso suelto:  node scripts/equivalencia-estilos.js antes.html despues.html [css/styles.css]
// Qué NO cubre: @media (se avisa si hay reglas que casen), herencia (el contexto es el mismo en los dos lados) y estilos que un
// script ponga después con element.style. Las reglas de estado (:hover, :focus, :active, :disabled…) se revisan aparte: un
// style="" ganaba siempre a esas reglas, una clase no necesariamente (avisos).
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');

const ESTADOS = /:(hover|focus|focus-visible|focus-within|active|disabled|checked|invalid|placeholder-shown|visited)\b/g;

function especificidad(sel) {
  const s = sel.replace(/"[^"]*"|'[^']*'/g, '').replace(/::?[a-z-]+\([^)]*\)/gi, m => /^:(not|is|where|has)\(/i.test(m) ? ' ' + m.slice(m.indexOf('(') + 1, -1) + ' ' : ':x');
  const ids = (s.match(/#[\w-]+/g) || []).length;
  const clases = (s.match(/\.[\w-]+|\[[^\]]*\]|(?<!:):(?!:)[a-z-]+/gi) || []).length;
  const tipos = (s.replace(/#[\w-]+|\.[\w-]+|\[[^\]]*\]|::?[a-z-]+/gi, ' ').match(/(^|[\s>+~])[a-z][\w-]*/gi) || []).length + (s.match(/::[a-z-]+/gi) || []).length;
  return ids * 10000 + clases * 100 + tipos;
}

// Parser mínimo de CSS (el de jsdom/cssstyle descarta declaraciones válidas, p. ej. rgba(0,0,0,.15) o toda la lista de un style="").
function partir(txt, sep) { // parte por `sep` fuera de paréntesis y comillas
  const out = []; let d = 0, q = null, ini = 0;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) { if (c === q && txt[i - 1] !== '\\') q = null; continue; }
    if (c === '"' || c === "'") q = c; else if (c === '(') d++; else if (c === ')') d--; else if (c === sep && d === 0) { out.push(txt.slice(ini, i)); ini = i + 1; }
  }
  out.push(txt.slice(ini)); return out;
}
function declaraciones(txt) {
  return partir(txt, ';').map(x => x.trim()).filter(Boolean).map(x => {
    const i = x.indexOf(':'); if (i < 0) return null;
    let v = x.slice(i + 1).trim(), imp = false;
    if (/!important\s*$/i.test(v)) { imp = true; v = v.replace(/\s*!important\s*$/i, ''); }
    return [x.slice(0, i).trim().toLowerCase(), v.replace(/\s+/g, ' '), imp];
  }).filter(Boolean);
}
function leerReglas(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const reglas = []; let orden = 0;
  const bloques = (txt, media) => {
    let i = 0;
    while (i < txt.length) {
      const ab = txt.indexOf('{', i); if (ab < 0) break;
      const sel = txt.slice(i, ab).trim();
      let d = 1, j = ab + 1, q = null;
      for (; j < txt.length && d > 0; j++) { const c = txt[j]; if (q) { if (c === q && txt[j - 1] !== '\\') q = null; continue; } if (c === '"' || c === "'") q = c; else if (c === '{') d++; else if (c === '}') d--; }
      const cuerpo = txt.slice(ab + 1, j - 1);
      if (sel.startsWith('@media')) bloques(cuerpo, sel.slice(6).trim());
      else if (sel.startsWith('@')) { /* @keyframes, @font-face…: no son reglas de elemento */ }
      else { const decls = declaraciones(cuerpo); partir(sel, ',').map(x => x.trim()).filter(Boolean).forEach(x => reglas.push({ sel: x, spec: especificidad(x), orden: orden++, decls, media })); }
      i = j;
    }
  };
  bloques(css, ''); return reglas;
}

function casa(el, sel) { try { return el.matches(sel); } catch (e) { return false; } }

// Qué longhands borra un shorthand al aplicarse después de ellos.
const BORRA = { margin: /^margin-/, padding: /^padding-/, border: /^border-(?!radius)|^border-image/, 'border-radius': /^border-.*-radius$/, 'border-color': /^border-(top|right|bottom|left)-color$/, 'border-style': /^border-(top|right|bottom|left)-style$/, 'border-width': /^border-(top|right|bottom|left)-width$/, background: /^background-/, font: /^font-(?!family$)|^line-height$|^font-family$/, flex: /^flex-(grow|shrink|basis)$/, gap: /^(row|column)-gap$/, overflow: /^overflow-/, transition: /^transition-/, outline: /^outline-/ };
function resolver(decls) {
  decls.sort((a, b) => (a.imp - b.imp) || (a.spec - b.spec) || (a.orden - b.orden));
  const m = new Map();
  decls.forEach(d => { if (BORRA[d.p]) [...m.keys()].forEach(k => { if (BORRA[d.p].test(k)) m.delete(k); }); m.delete(d.p); m.set(d.p, d.v); });
  return [...m.entries()].map(([k, v]) => k + ': ' + v).sort().join('; ');
}

function efectivo(el, reglas) {
  const decls = [], estado = [], media = [];
  reglas.forEach(r => {
    if (r.sel.includes('::')) return; // pseudo-elementos: no son el elemento
    const conEstado = ESTADOS.test(r.sel); ESTADOS.lastIndex = 0;
    if (conEstado) { if (casa(el, r.sel.replace(ESTADOS, ''))) estado.push(r); ESTADOS.lastIndex = 0; return; }
    if (!casa(el, r.sel)) return;
    if (r.media) { media.push(r); return; }
    r.decls.forEach(([p, v, imp]) => decls.push({ p, v, imp, spec: r.spec, orden: r.orden }));
  });
  const inline = el.getAttribute('style');
  if (inline) declaraciones(inline).forEach(([p, v, imp], i) => decls.push({ p, v, imp, spec: 1e9, orden: 1e9 + i }));
  const css = resolver(decls.slice());
  const propias = new Set(decls.filter(d => d.spec === 1e9).map(d => d.p.split('-')[0])); // lo que el style="" fijaba
  return { css, estado, media, decls, propias };
}

const ruta = el => { const a = []; for (let e = el; e && e.nodeType === 1 && e.id !== '__lado'; e = e.parentElement) { const hijos = e.parentElement ? Array.from(e.parentElement.children) : []; a.unshift(e.tagName.toLowerCase() + (hijos.length > 1 ? ':' + hijos.indexOf(e) : '')); } return a.join('>'); };
const norm = css => css;

function compararHtml(antes, despues, rutaCss) {
  const css = fs.readFileSync(rutaCss, 'utf8');
  const dom = new JSDOM(`<!doctype html><html><head></head><body><div id="a"><div id="__lado">${antes}</div></div><div id="b"><div id="__lado">${despues}</div></div></body></html>`);
  const doc = dom.window.document;
  const reglas = leerReglas(css);
  const A = doc.querySelector('#a #__lado'), B = doc.querySelector('#b #__lado');
  const diferencias = [], avisos = []; let n = 0;
  const ea = Array.from(A.querySelectorAll('*')), eb = Array.from(B.querySelectorAll('*'));
  if (ea.length !== eb.length) diferencias.push(`distinto número de elementos: ${ea.length} vs ${eb.length}`);
  ea.forEach((x, i) => {
    const y = eb[i]; if (!y) return; n++;
    if (x.tagName !== y.tagName) { diferencias.push(`${ruta(x)}: etiqueta ${x.tagName} vs ${y.tagName}`); return; }
    const fx = efectivo(x, reglas), fy = efectivo(y, reglas);
    if (norm(fx.css) !== norm(fy.css)) diferencias.push(`${ruta(x)}\n    antes:   ${norm(fx.css)}\n    después: ${norm(fy.css)}`);
    // reglas de estado que ahora podrían ganar y antes no (el inline les ganaba siempre)
    const propias = fy.decls.filter(d => d.spec < 1e8);
    const claseSpec = Math.max(0, ...propias.map(d => d.spec)), claseOrden = Math.max(-1, ...propias.filter(d => d.spec === claseSpec).map(d => d.orden));
    fy.estado.forEach(r => {
      const pisa = r.decls.filter(([p, , imp]) => !imp && fx.propias.has(p.split('-')[0]));
      if (pisa.length && (r.spec > claseSpec || (r.spec === claseSpec && r.orden > claseOrden))) avisos.push(`${ruta(y)}: la regla de estado «${r.sel}» (${pisa.map(d => d[0]).join(', ')}) antes perdía contra el style="" y ahora gana a la clase`);
    });
    fy.media.forEach(r => avisos.push(`${ruta(y)}: regla en @media ${r.media} «${r.sel}» casa con el elemento (revisar a mano)`));
  });
  return { diferencias, avisos: [...new Set(avisos)], elementos: n };
}

module.exports = { compararHtml, especificidad };

if (require.main === module) {
  const [a, b, c] = process.argv.slice(2);
  if (!a || !b) { console.error('Uso: node scripts/equivalencia-estilos.js antes.html despues.html [css/styles.css]'); process.exit(2); }
  const r = compararHtml(fs.readFileSync(a, 'utf8'), fs.readFileSync(b, 'utf8'), c || path.join(__dirname, '..', 'css', 'styles.css'));
  console.log(`elementos comparados: ${r.elementos}`);
  r.diferencias.forEach(d => console.log('DIFERENCIA ' + d)); r.avisos.forEach(d => console.log('AVISO ' + d));
  console.log(r.diferencias.length ? '❌ NO equivalente' : r.avisos.length ? '⚠️ equivalente, con avisos a revisar' : '✅ equivalente');
  process.exitCode = r.diferencias.length ? 1 : 0;
}
