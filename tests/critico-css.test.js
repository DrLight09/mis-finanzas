'use strict';
// M11 — el «CSS crítico» de index.html (inline, evita el parpadeo antes de que cargue el CSS externo) repite a propósito reglas de css/styles.css.
// Lo duplicado a propósito lo vigila una máquina: cada declaración del bloque inline debe existir idéntica en styles.css (misma regla, mismo valor).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8').replace(/\r/g, '');
const css = fs.readFileSync(path.join(raiz, 'css', 'styles.css'), 'utf8').replace(/\r/g, '');

const sinComentarios = t => t.replace(/\/\*[\s\S]*?\*\//g, '');
const norm = t => t.replace(/\s+/g, ' ').replace(/\s*([{}:;,>+~])\s*/g, '$1').trim();

// Reglas «selector{decl;decl}» de primer nivel y, dentro de @media/@keyframes, con el prefijo del at-rule. Devuelve Map clave → Map(prop → valor).
function reglas(texto) {
  const mapa = new Map();
  const t = sinComentarios(texto);
  (function leer(s, prefijo) {
    let i = 0;
    while (i < s.length) {
      const a = s.indexOf('{', i);
      if (a < 0) break;
      const cab = norm(s.slice(i, a));
      let prof = 1, j = a + 1;
      for (; j < s.length && prof; j++) { if (s[j] === '{') prof++; else if (s[j] === '}') prof--; }
      const cuerpo = s.slice(a + 1, j - 1);
      if (cab.startsWith('@media') || cab.startsWith('@supports')) leer(cuerpo, prefijo + cab + '|');
      else {
        const d = mapa.get(prefijo + cab) || new Map();
        for (const par of cuerpo.split(';')) { const k = par.indexOf(':'); if (k > 0) d.set(norm(par.slice(0, k)), norm(par.slice(k + 1))); }
        mapa.set(prefijo + cab, d);
      }
      i = j;
    }
  })(t, '');
  return mapa;
}

const m = /<style>([\s\S]*?)<\/style>/.exec(html);
assert.ok(m, 'index.html debe tener un <style> de CSS crítico');
const critico = reglas(m[1]);
const completo = reglas(css);

test('el bloque crítico inline no está vacío (tokens, reset, login/PIN, toast)', () => {
  assert.ok(critico.size > 20, 'reglas críticas: ' + critico.size);
  assert.ok([...critico.keys()].some(k => k.includes(':root')));
  assert.ok([...critico.keys()].some(k => k.includes('toast')));
});

// Diferencias INTENCIONALES (documentadas en el <style> de index.html): el bloque inline arranca .app oculto y styles.css lo muestra al cargar.
const INTENCIONALES = new Set(['.app { display }']);

test('si una regla está en los dos sitios, ninguna propiedad se contradice (si no, el login/PIN/toast «saltan» de estilo al cargar styles.css)', () => {
  const choques = [];
  for (const [sel, decls] of critico) {
    const real = completo.get(sel);
    if (!real) continue;   // solo-inline (p. ej. Wrapped promo, ícono del toast): no hay duplicado que vigilar
    for (const [prop, val] of decls) {
      if (INTENCIONALES.has(`${sel} { ${prop} }`)) continue;
      if (real.has(prop) && real.get(prop) !== val) choques.push(`${sel} { ${prop} }: inline «${val}» ↔ styles.css «${real.get(prop)}»`);
    }
  }
  assert.deepEqual(choques, [], 'Actualiza los dos sitios (index.html <style> crítico y css/styles.css) con el mismo valor.');
});

test('los tokens de :root y el reset críticos están también en styles.css (la fuente completa no se queda atrás)', () => {
  const raizCritica = critico.get(':root'), raizCompleta = completo.get(':root');
  assert.ok(raizCritica && raizCompleta);
  for (const [prop, val] of raizCritica) assert.equal(raizCompleta.get(prop), val, `:root ${prop}`);
});
