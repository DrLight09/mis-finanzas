// Prueba de humo del Wrapped guardado y del mensaje «no alcanzó el tiempo» con la página REAL en jsdom.
// Recorre: abrir NO guarda; el botón «Guardar este Wrapped» guarda; dentro de enero un guardado se actualiza al abrirlo; fuera de enero
// queda fijo y no se genera uno nuevo; el mensaje «no alcanzó el tiempo» no se guarda; «Ocultar saldos» se aplica al mostrar; y «Mis Wrapped»
// lista, abre y elimina (con confirmación y PIN). La lógica pura está en tests/wrapped-guardado.test.js; esto comprueba que todo está
// cableado en la página.
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
  const datos2026 = n => { for (let i = 0; i < n; i++) w.S.gastosVar.push(gasto(i + 1, '2026-' + String(10 + (i % 3)) + '-' + String(1 + Math.floor(i / 3)).padStart(2, '0'))); };
  const botonGuardar = () => d.querySelector('#wrapped-overlay [data-wrapped-action="guardar"]');

  console.log('1) Enero de 2027, sin datos de 2026 → mensaje «no alcanzó el tiempo»; NO se guarda ni ofrece guardar');
  w.hoy = () => '2027-01-10';
  w.S.gastosVar = []; w.S.movimientos = []; delete w.S.wrappedAnios;
  w.renderWrapped();
  ok(!!overlay(), 'se abre el Wrapped');
  ok(slidesTxt().length === 2 && /Tu 2026/.test(slidesTxt()[0]), 'sin datos son 2 diapositivas (mensaje + cierre), y dicen de qué año hablan');
  ok(!botonGuardar(), 'no hay botón de guardar en el mensaje');
  ok(!w.S.wrappedAnios, 'y no queda nada guardado (no hay nada que recordar)');
  quitar();

  console.log('2) Con datos suficientes: abrir NO guarda; el botón «Guardar este Wrapped» sí');
  datos2026(45);
  w.renderWrapped();
  const completoTxt = slidesTxt();
  ok(completoTxt.length > 5, 'Wrapped completo: ' + completoTxt.length + ' diapositivas');
  ok(!w.S.wrappedAnios, 'abrirlo (aunque sea varias veces) no guarda nada');
  quitar(); w.renderWrapped(); quitar(); w.renderWrapped();
  ok(!w.S.wrappedAnios, '…ni siquiera la tercera vez');
  const btn = botonGuardar();
  ok(!!btn && /Guardar este Wrapped/.test(btn.textContent), 'la última diapositiva trae el botón «Guardar este Wrapped»');
  if (btn) btn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const g = w.S.wrappedAnios && w.S.wrappedAnios['2026'];
  ok(!!g && g.version === 1 && g.generadoEn === '2027-01-10' && g.slides.length === completoTxt.length, 'al pulsarlo queda guardado con versión, fecha y todas las diapositivas');
  ok(!botonGuardar() && /Guardado/.test(d.querySelector('#wrapped-overlay .wrapped-cta[disabled]') ? d.querySelector('#wrapped-overlay .wrapped-cta[disabled]').textContent : ''), 'el botón pasa a «Guardado» (deshabilitado)');
  ok(g && !g.slides.some(x => /data-wrapped-action="guardar"/.test(x.html)), 'y lo guardado ya está en estado «Guardado»');
  quitar();

  console.log('3) Dentro de enero, un guardado se ACTUALIZA al abrirlo');
  w.S.wrappedAnios['2026'].generadoEn = '2000-01-01';
  w.S.gastosVar.push(gasto(900, '2026-12-30'));
  w.renderWrapped();
  ok(w.S.wrappedAnios['2026'].generadoEn === '2027-01-10', 'se recalculó y reemplazó el guardado (fecha de generación nueva)');
  ok(!botonGuardar(), 'y como ya estaba guardado, no ofrece guardar otra vez');
  quitar();

  console.log('4) Si en enero ya no hay datos suficientes, se CONSERVA lo guardado');
  const antes = JSON.stringify(w.S.wrappedAnios['2026']);
  const nGuardadas = w.S.wrappedAnios['2026'].slides.length;
  w.S.gastosVar = [];
  w.renderWrapped();
  ok(slidesTxt().length === nGuardadas && nGuardadas > 5, 'se sigue viendo el Wrapped guardado (' + nGuardadas + ' diapositivas) y no el mensaje de 2');
  ok(JSON.stringify(w.S.wrappedAnios['2026']) === antes, 'y el guardado no cambió');
  quitar();

  console.log('5) Fuera de enero queda FIJO; no se genera uno nuevo pero sí se ve el guardado');
  w.hoy = () => '2027-06-10';
  w.S.wrappedAnios['2026'].generadoEn = '2027-01-10';
  datos2026(80); // datos nuevos: no deben cambiar el recuerdo
  const fijo = JSON.stringify(w.S.wrappedAnios['2026']);
  w.renderWrapped('2026');
  ok(!!overlay() && slidesTxt().length === nGuardadas, 'el guardado se abre en junio');
  ok(JSON.stringify(w.S.wrappedAnios['2026']) === fijo, 'y no se recalcula ni se reemplaza');
  quitar();
  w.renderWrapped('2025');
  ok(!overlay(), 'un año sin guardar no se genera fuera de enero');

  console.log('6) _wrappedAbrir (lo que usa «Mis Wrapped») deja el año y renderWrapped lo consume');
  w._wrappedAbrir('2026');
  ok(!!overlay(), 'se abre por el camino real (showScreen)');
  ok(w._wrappedAnioVista === undefined, 'el año pedido se consumió (no se queda pegado)');
  quitar();

  console.log('7) «Ocultar saldos» se aplica al MOSTRAR, no al guardar');
  w.S.wrappedAnios['2025'] = { version: 1, generadoEn: '2026-01-05', slides: [
    { id: 'alcancia', mood: 'accent', html: '<div class="wrapped-slide-inner"><div class="wrapped-bignum c-amber" data-value="50000">0</div></div>' }] };
  w.localStorage.setItem('mf-saldos-ocultos', '1');
  w.renderWrapped('2025');
  ok(!!d.querySelector('#wrapped-overlay .wrapped-bignum.saldo-hidden'), 'con «ocultar saldos» activo el número sale desenfocado');
  quitar();
  w.localStorage.removeItem('mf-saldos-ocultos');
  w.renderWrapped('2025');
  ok(!d.querySelector('#wrapped-overlay .wrapped-bignum.saldo-hidden'), 'apagado, se ve normal');
  ok(!/saldo-hidden/.test(w.S.wrappedAnios['2025'].slides[0].html), 'y lo guardado sigue sin la clase');
  quitar();

  console.log('8) Configuración → «Mis Wrapped»: lista, abre y elimina');
  w.renderCatsConfig();
  const lista = d.getElementById('cfg-mis-wrapped');
  ok(!!lista && /2026/.test(lista.textContent) && /2025/.test(lista.textContent), 'lista los años guardados');
  ok(/Guardado el 10 de enero de 2027/.test(lista.textContent), 'con su fecha de guardado: ' + (lista.querySelector('.cfg-wrapped-estado') || {}).textContent);
  ok(lista.innerHTML.indexOf('2026') < lista.innerHTML.indexOf('2025'), 'el más reciente primero');
  const abrir = lista.querySelector('[data-action="config:abrirWrapped"]');
  let pedido = null; const original = w._wrappedAbrir; w._wrappedAbrir = a => { pedido = a; };
  if (abrir) abrir.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  ok(pedido === '2026', 'al tocar un año se pide abrir ese año: ' + pedido);
  w._wrappedAbrir = original;

  const borrar = () => d.getElementById('cfg-mis-wrapped').querySelector('[data-action="config:eliminarWrapped"]');
  ok(!!borrar(), 'cada año tiene su botón de eliminar');
  let dialogos = 0, pines = 0, confirma = false, pinOk = false, textoDialogo = '';
  w.dialogo = async (t, msg) => { dialogos++; textoDialogo = msg; return confirma; };
  w.pedirPinAntesDe = async () => { pines++; return pinOk; };
  const tocarBorrar = async () => { borrar().dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await esperar(50); };
  await tocarBorrar();
  ok(dialogos === 1 && pines === 0 && !!w.S.wrappedAnios['2026'], 'si cancelas la confirmación no se pide el PIN y no se borra nada');
  ok(/no se puede deshacer/.test(textoDialogo), 'la advertencia dice que es irreversible');
  confirma = true; pinOk = false;
  await tocarBorrar();
  ok(pines === 1 && !!w.S.wrappedAnios['2026'], 'si el PIN no es correcto tampoco se borra');
  pinOk = true;
  await tocarBorrar();
  ok(!w.S.wrappedAnios['2026'] && !!w.S.wrappedAnios['2025'], 'con confirmación y PIN se elimina solo ese año');
  const aniosListados = () => Array.from(d.querySelectorAll('#cfg-mis-wrapped .cfg-wrapped-anio')).map(x => x.textContent);
  ok(JSON.stringify(aniosListados()) === '["2025"]', 'y desaparece de la lista: ' + JSON.stringify(aniosListados()));
  w.hoy = () => '2027-06-10';
  w.S.wrappedAnios['2026'] = { version: 1, generadoEn: '2027-01-10', slides: [] };
  w.renderCatsConfig(); await tocarBorrar();
  ok(/no podrás generarlo otra vez/.test(textoDialogo), 'fuera de enero la advertencia dice que no se podrá generar de nuevo');
  w.hoy = () => '2027-01-15';
  w.S.wrappedAnios['2026'] = { version: 1, generadoEn: '2027-01-10', slides: [] };
  w.renderCatsConfig(); await tocarBorrar();
  ok(/mientras sea enero podrás generarlo de nuevo/.test(textoDialogo), 'dentro de enero la advertencia dice que se puede volver a generar');
  delete w.S.wrappedAnios; w.renderCatsConfig();
  ok(d.getElementById('cfg-mis-wrapped').innerHTML.trim() === '', 'sin años guardados no se muestra nada');

  console.log(fallos.length ? '\n✗ FALLÓ: ' + fallos.length + ' comprobación(es)' : '\n✅ TODO OK — Wrapped guardado y «no alcanzó el tiempo» funcionan en la página real.');
  w.close();
  process.exit(fallos.length ? 1 : 0);
})().catch(e => { console.error('FALLÓ la prueba de humo:', e); process.exit(1); });
