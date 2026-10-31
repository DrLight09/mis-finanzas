// Prueba de humo del Wrapped guardado y del mensaje «no alcanzó el tiempo» con la página REAL en jsdom.
// Recorre: abrir el año recién cerrado sin datos → se guarda; reabrirlo con datos nuevos → se muestra lo guardado (no se recalcula);
// fuera de enero: no se genera, pero sí se abre uno guardado; «Ocultar saldos» se aplica al mostrar; lista «Mis Wrapped» en Configuración
// y su botón. La lógica pura está en tests/wrapped-guardado.test.js; esto comprueba que todo está cableado en la página.
// Uso: node scripts/smoke-wrapped.js [raiz-del-repo]   (npm run smoke:wrapped; necesita `npm install`: jsdom está en devDependencies)
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
  await Loader.ensure('wrapped');
  await Loader.ensure('config');
  const overlay = () => d.getElementById('wrapped-overlay');
  const quitar = () => { const o = overlay(); if (o) o.remove(); };
  const slidesTxt = () => Array.from(d.querySelectorAll('#wrapped-overlay .wrapped-slide')).map(s => s.textContent.replace(/\s+/g, ' ').trim());
  const gasto = (i, f) => ({ id: 'g' + String(i).padStart(5, '0'), desc: 'x', monto: 1000, fecha: f, cat: 'Otro', fuente: 'nequi', clase: 'gasto' });

  console.log('1) Enero de 2027, sin ningún dato de 2026 → mensaje «no alcanzó el tiempo» y se guarda');
  w.hoy = () => '2027-01-10';
  w.S.gastosVar = []; w.S.movimientos = []; delete w.S.wrappedAnios;
  w.renderWrapped();
  ok(!!overlay(), 'se abre el Wrapped');
  const primera = slidesTxt();
  ok(primera.length === 2, 'sin datos son 2 diapositivas (mensaje + cierre): ' + primera.length);
  ok(/Tu 2026/.test(primera[0]), 'dice de qué año habla');
  ok(w.S.wrappedAnios && w.S.wrappedAnios['2026'] && w.S.wrappedAnios['2026'].estado === 'insuficiente', 'queda guardado como «insuficiente»');
  ok(w.S.wrappedAnios['2026'].version === 1 && w.S.wrappedAnios['2026'].generadoEn === '2027-01-10', 'con versión y fecha de generación');

  console.log('2) Aparecen datos después: se sigue mostrando lo GUARDADO (el recuerdo no se recalcula)');
  quitar();
  for (let i = 0; i < 40; i++) w.S.gastosVar.push(gasto(i + 1, '2026-' + String(10 + (i % 3)).padStart(2, '0') + '-' + String(1 + Math.floor(i / 3)).padStart(2, '0')));
  ok(w._wrappedDatosAnio('2026', w.S).tier === 'suficiente', '(con esos datos 2026 ya sería «suficiente»)');
  w.renderWrapped('2026');
  ok(JSON.stringify(slidesTxt()) === JSON.stringify(primera), 'las mismas 2 diapositivas, idénticas a la primera vez');

  console.log('3) Fuera de enero: no se genera uno nuevo, pero sí se abre uno guardado');
  quitar();
  w.hoy = () => '2027-06-10';
  w.renderWrapped('2025'); // no hay Wrapped guardado de 2025 y ya no es enero
  ok(!overlay(), 'un año sin guardar no se genera fuera de enero');
  w.renderWrapped('2026');
  ok(!!overlay() && slidesTxt().length === 2, 'el guardado de 2026 se abre en junio');

  console.log('4) _wrappedAbrir (lo que usa «Mis Wrapped») deja el año y renderWrapped lo consume');
  quitar();
  w._wrappedAbrir('2026');
  ok(!!overlay(), 'se abre por el camino real (showScreen)');
  ok(w._wrappedAnioVista === undefined, 'el año pedido se consumió (no se queda pegado)');

  console.log('5) «Ocultar saldos» se aplica al MOSTRAR, no al guardar');
  quitar();
  w.S.wrappedAnios['2025'] = { version: 1, generadoEn: '2026-01-05', estado: 'completo', slides: [
    { id: 'alcancia', mood: 'accent', html: '<div class="wrapped-slide-inner"><div class="wrapped-bignum c-amber" data-value="50000">0</div></div>' }] };
  w.localStorage.setItem('mf-saldos-ocultos', '1');
  w.renderWrapped('2025');
  ok(!!d.querySelector('#wrapped-overlay .wrapped-bignum.saldo-hidden'), 'con «ocultar saldos» activo el número sale desenfocado');
  quitar();
  w.localStorage.removeItem('mf-saldos-ocultos');
  w.renderWrapped('2025');
  ok(!d.querySelector('#wrapped-overlay .wrapped-bignum.saldo-hidden'), 'apagado, se ve normal (la instantánea no congeló el desenfoque)');
  ok(!/saldo-hidden/.test(w.S.wrappedAnios['2025'].slides[0].html), 'y lo guardado sigue sin la clase');
  quitar();

  console.log('6) Configuración → «Mis Wrapped»');
  w.renderCatsConfig();
  const lista = d.getElementById('cfg-mis-wrapped');
  ok(!!lista && /2026/.test(lista.textContent) && /2025/.test(lista.textContent), 'lista los años guardados');
  ok(/No alcanzó el tiempo/.test(lista.textContent) && /Completo/.test(lista.textContent), 'indica el estado de cada uno');
  ok(lista.innerHTML.indexOf('2026') < lista.innerHTML.indexOf('2025'), 'el más reciente primero');
  const boton = lista.querySelector('[data-action="config:abrirWrapped"]');
  ok(!!boton, 'cada año es un botón con su acción');
  let pedido = null; const original = w._wrappedAbrir; w._wrappedAbrir = a => { pedido = a; };
  if (boton) boton.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  ok(pedido === '2026', 'al tocarlo se pide abrir ese año: ' + pedido);
  w._wrappedAbrir = original;
  delete w.S.wrappedAnios; w.renderCatsConfig();
  ok(d.getElementById('cfg-mis-wrapped').innerHTML.trim() === '', 'sin años guardados no se muestra nada');

  console.log('7) Con datos suficientes se guarda el Wrapped COMPLETO');
  quitar();
  w.hoy = () => '2026-01-10';
  delete w.S.wrappedAnios; w.S.gastosVar = [];
  for (let i = 0; i < 45; i++) w.S.gastosVar.push(gasto(i + 1, '2025-' + String(10 + (i % 3)) + '-' + String(1 + Math.floor(i / 3)).padStart(2, '0')));
  w.renderWrapped();
  const completo = w.S.wrappedAnios && w.S.wrappedAnios['2025'];
  ok(!!completo && completo.estado === 'completo', 'queda guardado como «completo»');
  ok(!!completo && completo.slides.length > 5 && !completo.slides.some(x => x.id.startsWith('insuf-')), 'con varias diapositivas de datos, sin mensaje de «no alcanzó»: ' + (completo ? completo.slides.length : 0));
  ok(slidesTxt().length === (completo ? completo.slides.length : -1), 'y lo que se ve es exactamente lo guardado');
  quitar();

  console.log(fallos.length ? '\n✗ FALLÓ: ' + fallos.length + ' comprobación(es)' : '\n✅ TODO OK — Wrapped guardado y «no alcanzó el tiempo» funcionan en la página real.');
  w.close();
  process.exit(fallos.length ? 1 : 0);
})().catch(e => { console.error('FALLÓ la prueba de humo:', e); process.exit(1); });
