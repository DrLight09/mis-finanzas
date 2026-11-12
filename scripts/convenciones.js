'use strict';
// Convenciones de nombres (docs/glosario-dominio.md): cuenta las abreviaturas opacas que siguen en los identificadores de js/ e index.html.
//   node scripts/convenciones.js             muestra el recuento por archivo y por abreviatura
//   node scripts/convenciones.js --actualizar  baja el «trinquete» (tests/fixtures/convenciones-base.json); nunca lo sube
// tests/convenciones.test.js falla si una abreviatura SUBE en algún archivo (código nuevo) o si BAJA sin actualizar el trinquete
// (así lo que se limpia no se pierde). Solo cuentan identificadores: textos entre comillas, comentarios, ids del HTML y clases CSS no.
const fs = require('fs'), path = require('path');
const RAIZ = path.join(__dirname, '..');
const BASE = path.join(RAIZ, 'tests', 'fixtures', 'convenciones-base.json');

// Abreviaturas del dominio que deben escribirse completas (glosario §3). Se amplía a medida que se limpian otras.
const ABREVIATURAS = {
  enc: 'encargo', mov: 'movimiento', movs: 'movimientos', sp: 'spotify', gv: 'gastoVariable', gf: 'gastoFijo',
  cp: 'plataComprometida', alc: 'alcancia', caj: 'cajita', ctc: 'compraConTc', prtc: 'prestamoConTc',
  movenc: 'movimientoEncargo', mpp: 'mesadaPagoPendiente', rte: 'retencion', ing: 'ingreso', dif: 'diferencial',
};

function archivos() {
  const out = [];
  (function walk(d) {
    for (const f of fs.readdirSync(path.join(RAIZ, d))) {
      const rel = d + '/' + f;
      if (fs.statSync(path.join(RAIZ, rel)).isDirectory()) walk(rel); else if (/\.js$/.test(f)) out.push(rel);
    }
  })('js');
  out.push('index.html');
  return out.sort();
}

// Quita comentarios y textos entre comillas; de index.html solo se miran los <script> sin src.
function codigoDe(rel) {
  let s = fs.readFileSync(path.join(RAIZ, rel), 'utf8');
  if (rel.endsWith('.html')) s = [...s.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/(["'`])(?:\\.|(?!\1)[^\\\n])*\1/g, '""');
}
const trozos = n => n.replace(/^[_$]+/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase().split(' ').filter(Boolean);

function contar() {
  const porArchivo = {}, porAbreviatura = {};
  for (const rel of archivos()) {
    let n = 0;
    for (const m of codigoDe(rel).matchAll(/[A-Za-z_$][\w$]*/g))
      for (const t of trozos(m[0])) if (Object.prototype.hasOwnProperty.call(ABREVIATURAS, t)) { n++; porAbreviatura[t] = (porAbreviatura[t] || 0) + 1; }
    if (n) porArchivo[rel] = n;
  }
  return { porArchivo, porAbreviatura };
}

module.exports = { ABREVIATURAS, BASE, contar, archivos };

if (require.main === module) {
  const { porArchivo, porAbreviatura } = contar();
  if (process.argv.includes('--actualizar')) {
    const base = fs.existsSync(BASE) ? JSON.parse(fs.readFileSync(BASE, 'utf8')) : null;
    if (base) {
      const sube = Object.keys(porArchivo).filter(f => porArchivo[f] > (base[f] || 0));
      if (sube.length) { console.error('Hay abreviaturas NUEVAS (el trinquete no se sube):\n  ' + sube.join('\n  ')); process.exit(1); }
    }
    fs.mkdirSync(path.dirname(BASE), { recursive: true });
    fs.writeFileSync(BASE, JSON.stringify(porArchivo, null, 2) + '\n');
    console.log('Trinquete actualizado: ' + Object.values(porArchivo).reduce((a, b) => a + b, 0) + ' apariciones en ' + Object.keys(porArchivo).length + ' archivos.');
  } else {
    console.log('Por abreviatura:', Object.entries(porAbreviatura).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + '=' + v).join(' '));
    console.log('Por archivo:'); Object.entries(porArchivo).sort((a, b) => b[1] - a[1]).forEach(([f, n]) => console.log('  ' + String(n).padStart(5) + '  ' + f));
  }
}
