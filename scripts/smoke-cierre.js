// Prueba de humo de la carga BAJO DEMANDA de la huella y el cierre de períodos (js/core/huella.js y js/core/cierre.js) con la página REAL en jsdom.
// Comprueba lo que las pruebas en Node no ven: que NO se cargan al arrancar ni las precarga ensureAll(), que las sondas de los módulos que llegan
// antes esperan en cola y no se pierden, que abrir Configuración los carga y pinta el medidor, y que si la descarga falla (sin conexión) la
// pantalla no se rompe.
// Uso: node scripts/smoke-cierre.js [raiz-del-repo]   (npm run smoke:cierre; necesita `npm install`: jsdom está en devDependencies)
// Vive en scripts/ y NO en tests/ por la misma razón que smoke-browser.js: necesita jsdom y levanta la página completa.
const { JSDOM, ResourceLoader, VirtualConsole } = require('jsdom');
const fs = require('fs'), path = require('path');
const RAIZ = path.resolve(process.argv.slice(2).find(a => !a.startsWith('--')) || path.join(__dirname, '..'));
const ORIGEN = 'http://app.test/';
class Local extends ResourceLoader {
  fetch(url) {
    if (url.startsWith(ORIGEN)) {
      const f = path.join(RAIZ, decodeURIComponent(url.slice(ORIGEN.length).split('?')[0]));
      return Promise.resolve(fs.existsSync(f) ? fs.readFileSync(f) : Buffer.from(''));
    }
    return Promise.resolve(Buffer.from('')); // sin red: fuentes, SDK de Firebase…
  }
}
const esperar = ms => new Promise(r => setTimeout(r, ms));
const fallos = [];
const ok = (cond, msg) => { if (cond) console.log('  ✓ ' + msg); else { fallos.push(msg); console.log('  ✗ ' + msg); } };

(async () => {
  const vc = new VirtualConsole(); // se silencia: la página real avisa de recursos externos que aquí no existen
  const dom = new JSDOM(fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8'), {
    runScripts: 'dangerously', resources: new Local(), pretendToBeVisual: true, virtualConsole: vc, url: ORIGEN + 'index.html',
    beforeParse(w) { w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder; w.HTMLCanvasElement.prototype.getContext = () => ({ font: '', measureText: () => ({ width: 0 }) }); },
  });
  const w = dom.window, d = w.document;
  await esperar(1500);
  const Loader = w.eval('Loader'); // un `const` de nivel superior no cuelga de window
  const tipo = n => w.eval('typeof ' + n);

  console.log('1) Al arrancar NO están cargados');
  ok(tipo('Huella') === 'undefined' && tipo('Cierre') === 'undefined', 'ni Huella ni Cierre existen tras arrancar la página');
  ok(!/huella\.js|cierre\.js/.test(fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8')), 'y index.html ya no tiene sus <script>');
  ok(tipo('registrarSonda') === 'function', 'pero registrarSonda (la cola, en js/core/persistencia.js) sí existe');

  console.log('2) Los módulos con sonda se precargan primero: sus sondas esperan en cola');
  for (const g of ['tarjetas', 'encargos', 'alcancia', 'wrapped']) await Loader.ensure(g);
  const enCola = (w._sondasPendientes || []).map(x => x[0]).sort();
  ok(JSON.stringify(enCola) === JSON.stringify(['alcancia', 'encargos', 'tarjetas', 'wrapped']), 'las 4 sondas están en cola: ' + enCola.join(', '));

  console.log('3) ensureAll() (la precarga de arranque) NO carga el grupo «cierre»');
  await Loader.ensureAll();
  ok(!Loader.isLoaded('cierre'), 'tras ensureAll el grupo «cierre» sigue sin cargar');
  ok(tipo('Cierre') === 'undefined', 'y Cierre sigue sin existir');
  ok(Array.isArray(Loader.GROUPS.cierre) && Loader.GROUPS.cierre[0].endsWith('huella.js') && Loader.GROUPS.cierre[1].endsWith('cierre.js'), 'el grupo existe con huella.js antes que cierre.js');

  console.log('4) Sin conexión: si la descarga falla, Configuración no se rompe ni pinta nada');
  await Loader.ensure('config');
  const ensureOriginal = Loader.ensure;
  Loader.ensure = g => (g === 'cierre' ? Promise.reject(new Error('sin conexión')) : ensureOriginal(g));
  let lanzo = false;
  try { w.renderCatsConfig(); await esperar(300); } catch (e) { lanzo = true; }
  ok(!lanzo, 'renderCatsConfig no lanza');
  ok(d.getElementById('cfg-tamano').innerHTML.trim() === '', 'el medidor queda vacío (sin error visible)');
  ok(tipo('Cierre') === 'undefined', 'y no se cargó nada a medias');
  Loader.ensure = ensureOriginal;

  console.log('5) Abrir Configuración carga huella y cierre y pinta el medidor');
  w.renderCatsConfig();
  for (let i = 0; i < 40 && !d.getElementById('cfg-tamano').innerHTML.trim(); i++) await esperar(100);
  const medidor = d.getElementById('cfg-tamano').textContent;
  ok(/Tamaño de tus datos/.test(medidor) && /KB de/.test(medidor), 'el medidor aparece: «' + medidor.replace(/\s+/g, ' ').slice(0, 70) + '…»');
  ok(Loader.isLoaded('cierre') && tipo('Huella') === 'object' && tipo('Cierre') === 'object', 'Huella y Cierre ya existen');
  ok((w._sondasPendientes || []).length === 0, 'la cola quedó vacía');
  ok(w.eval('Huella.registradas().length') === 8, 'las 8 sondas están registradas, también las que llegaron por la cola: ' + w.eval('Huella.registradas().join(",")'));

  console.log('6) La huella completa y la vista previa funcionan sobre la página real');
  const h = await w.eval('Huella.completa().then(h => JSON.stringify({ sondas: Object.keys(h.sondas).length, errores: h.errores }))');
  ok(h === '{"sondas":8,"errores":{}}', 'Huella.completa(): ' + h);
  const completo = await w.eval('Cierre.analizarCompleto("2026-09").then(r => r.completo)');
  ok(completo === true, 'Cierre.analizarCompleto() sale completo');

  console.log(fallos.length ? '\n✗ FALLÓ: ' + fallos.length + ' comprobación(es)' : '\n✅ TODO OK — la huella y el cierre se cargan solo cuando hacen falta y no pierden ninguna sonda.');
  w.close();
  process.exit(fallos.length ? 1 : 0);
})().catch(e => { console.error('FALLÓ la prueba de humo:', e); process.exit(1); });
