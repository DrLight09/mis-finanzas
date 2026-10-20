// Prueba de humo con la página REAL en jsdom: carga index.html y todos sus <script>, carga los grupos lazy, y toca cada
// botón data-action presente. Informa (a) acciones sin handler registrado y (b) excepciones al tocar cada botón.
// Uso: node scripts/smoke-browser.js [raiz-del-repo] [--verbose]   (por defecto, la raíz del repo; necesita `npm i -D jsdom@24`)
// Vive en scripts/ y NO en la carpeta de tests: `node --test` ejecuta todo .js que encuentra ahí y esto necesita jsdom.
const { JSDOM, ResourceLoader, VirtualConsole } = require('jsdom');
const fs = require('fs'), path = require('path');
const RAIZ = path.resolve(process.argv.slice(2).find(a => !a.startsWith('--')) || path.join(__dirname, '..'));
const ORIGEN = 'http://app.test/';
const faltan = [];
const logs = { warn: [], error: [] }, uncaught = [];
const ESPIA_JS = '(function(){var r=Events.registerAll,o=Events.on;window.__reg=new Set();Events.registerAll=function(ns,m){Object.keys(m||{}).forEach(function(k){window.__reg.add(ns+":"+k)});return r(ns,m)};Events.on=function(a,h){window.__reg.add(a);return o(a,h)}})();';
class Local extends ResourceLoader {
  fetch(url) {
    if (url === ORIGEN + '__espia.js') return Promise.resolve(Buffer.from(ESPIA_JS));
    if (url.startsWith(ORIGEN) || url.startsWith('file://')) {
      const f = url.startsWith(ORIGEN) ? path.join(RAIZ, decodeURIComponent(url.slice(ORIGEN.length).split('?')[0])) : decodeURIComponent(url.slice(7));
      if (fs.existsSync(f)) return Promise.resolve(fs.readFileSync(f));
      faltan.push(path.relative(RAIZ, f)); // css, imágenes, etc. que no están en la carpeta
      return Promise.resolve(Buffer.from(''));
    }
    return Promise.resolve(Buffer.from('')); // sin red: fuentes, SDK de Firebase, etc.
  }
}
const vc = new VirtualConsole();
vc.on('warn', (...a) => logs.warn.push(a.join(' ')));
vc.on('error', (...a) => logs.error.push(a.join(' ')));
vc.on('jsdomError', e => uncaught.push(String(e.detail && e.detail.stack || e.message).split('\n').slice(0, 2).join(' | ')));
const esperar = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const ESPIA = '<script src="__espia.js" defer></script>'; // defer: corre justo después de events.js, en el orden del documento
  let html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const tagEv = html.match(/<script[^>]*src="js\/core\/events\.js"[^>]*><\/script>/);
  if (tagEv) html = html.replace(tagEv[0], tagEv[0] + ESPIA); else console.log('AVISO: index.html no carga js/core/events.js; no se puede mapear las acciones registradas');
  const dom = new JSDOM(html, { runScripts: 'dangerously', resources: new Local(), pretendToBeVisual: true, virtualConsole: vc, url: ORIGEN + 'index.html',
    beforeParse(win) { win.TextEncoder = TextEncoder; win.TextDecoder = TextDecoder; win.HTMLCanvasElement.prototype.getContext = () => ({ font: '', measureText: () => ({ width: 0 }) }); } });
  const w = dom.window;
  w.addEventListener('error', e => uncaught.push('window.error: ' + e.message));
  w.addEventListener('unhandledrejection', e => uncaught.push('rechazo: ' + (e.reason && e.reason.message || e.reason)));
  await esperar(1500);
  const ev = c => w.eval(c);
  const grupos = ev('Object.keys(Loader.GROUPS)');
  for (const g of grupos) { try { await ev(`Loader.ensure(${JSON.stringify(g)})`); } catch (e) { uncaught.push('carga lazy ' + g + ': ' + e.message); } }
  await esperar(500);
  const antes = logs.warn.length + logs.error.length + uncaught.length;
  const acciones = [...new Set([...w.document.querySelectorAll('[data-action]')].map(e => e.dataset.action))].sort();
  const sinHandler = [], lanzan = [];
  for (const a of acciones) {
    const el = w.document.querySelector(`[data-action="${a}"]`);
    const w0 = logs.warn.length, e0 = logs.error.length, u0 = uncaught.length;
    try { el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })); } catch (e) { lanzan.push(a + ' → ' + e.message); }
    await esperar(15);
    logs.warn.slice(w0).forEach(m => { if (/No hay handler/.test(m)) sinHandler.push(a); });
    uncaught.slice(u0).forEach(m => lanzan.push(a + ' → ' + m));
    logs.error.slice(e0).forEach(m => lanzan.push(a + ' → console.error: ' + m.slice(0, 160)));
    // cierra lo que haya abierto el clic para no contaminar el siguiente
    try { ev('typeof closeAllSheets==="function" && closeAllSheets()'); } catch (e) {}
  }
  const porNs = {}; acciones.forEach(a => { const n = a.split(':')[0]; porNs[n] = (porNs[n] || 0) + 1; });
  const jsFaltan = faltan.filter(f => f.endsWith('.js'));
  console.log('Archivos .js que la página pide y no existen:', jsFaltan.join(', ') || '—');
  console.log('Otros archivos ausentes (css, imágenes; ignorados):', faltan.length - jsFaltan.length);
  console.log('Grupos lazy cargados:', grupos.join(', '));
  console.log('Acciones distintas en el DOM:', acciones.length, JSON.stringify(porNs));
  console.log('Errores no atribuibles a un botón (carga):', antes ? antes + ' (ver --verbose)' : 0);
  console.log('SIN HANDLER (' + sinHandler.length + '):', [...new Set(sinHandler)].join(', ') || '—');
  console.log('LANZAN AL TOCAR (' + lanzan.length + '):'); lanzan.forEach(l => console.log('  ' + l));

  // ── Fase 2: Cuentas y Nu con datos, navegando como el usuario ──
  const fallos = [];
  const chequea = (cond, msg) => { if (!cond) fallos.push(msg); };
  const visibles = () => ev(`['selector','detalle-simple','detalle-nu','detalle-cajita','sub-meta','sub-cdts'].filter(i=>{const e=document.getElementById('cuentas-'+i);return e&&e.style.display!=='none'}).join(',')`);
  const hoy = new Date(), iso = n => { const d = new Date(hoy); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  ev(`S.nuRate=9.25; if(!S.historialTasasNu)S.historialTasasNu=[];
      S.cajitas.push({id:'ca',nombre:'Mi cajita',saldo:100000,fecha:'${iso(-8)}',cdts:[{id:'cd1',monto:20000,tasa:9,rte:0,inicio:'${iso(-3)}',vence:'${iso(60)}',nombre:'CDT uno'}]});
      S.libro.push({id:'lca',fecha:'${iso(-8)}',cuenta:'cajita:ca',monto:100000,tipo:'apertura',origen:{modulo:'smoke'}});
      S.cuentas.find(c=>c.id==='nequi').saldo=50000; S.libro.push({id:'lnq',fecha:'${iso(-8)}',cuenta:'nequi',monto:50000,tipo:'apertura',origen:{modulo:'smoke'}});`);
  const acc0 = new Set(acciones);
  const tocar = async (etapa) => {
    const nuevos = [...new Set([...w.document.querySelectorAll('#screen-cuentas [data-action]')].map(e => e.dataset.action))].filter(a => /^(nu|cuentas):/.test(a));
    for (const a of nuevos) {
      const el = w.document.querySelector(`#screen-cuentas [data-action="${a}"]`);
      const w0 = logs.warn.length, u0 = uncaught.length, e0 = logs.error.length;
      const estado = ev(`cuentaActual+'|'+_cajitaActualId`);
      try { el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })); } catch (e) { fallos.push(`${etapa}: ${a} lanzó ${e.message}`); }
      await esperar(10);
      logs.warn.slice(w0).filter(m => /No hay handler/.test(m)).forEach(() => fallos.push(`${etapa}: ${a} SIN HANDLER`));
      uncaught.slice(u0).forEach(m => fallos.push(`${etapa}: ${a} → ${m.slice(0, 170)}`));
      logs.error.slice(e0).forEach(m => fallos.push(`${etapa}: ${a} → console.error: ${m.slice(0, 120)}`));
      try { ev('closeAllSheets()'); } catch (e) {}
      // el clic puede haber navegado; volver a la pantalla de la etapa
      if (etapa === 'Nu') ev(`abrirCuenta('nu')`); else if (etapa === 'cajita') ev(`abrirCuenta('nu'); abrirDetalleCajita('ca')`); else ev(`volverSelector()`);
    }
    return nuevos;
  };
  ev(`volverSelector()`); chequea(visibles() === 'selector', 'volverSelector no deja solo el selector: ' + visibles());
  const tSel = await tocar('selector');
  ev(`abrirCuenta('nu')`); chequea(visibles() === 'detalle-nu', 'abrirCuenta(nu) no muestra solo el detalle de Nu: ' + visibles()); chequea(ev('cuentaActual') === 'nu', 'cuentaActual != nu');
  const tNu = await tocar('Nu');
  ev(`abrirCuenta('nu'); abrirDetalleCajita('ca')`); chequea(visibles() === 'detalle-cajita', 'abrirDetalleCajita no muestra solo el detalle de la cajita: ' + visibles()); chequea(ev('_cajitaActualId') === 'ca', '_cajitaActualId no quedó en ca');
  const tCaj = await tocar('cajita');
  ev(`abrirCuenta('nu'); abrirDetalleCajita('ca'); volverSelector()`); chequea(visibles() === 'selector', 'volver desde la cajita: ' + visibles()); chequea(ev('_cajitaActualId') === null, 'volverSelector no reinició la cajita abierta');
  ev(`abrirCuenta('nequi')`); chequea(visibles() === 'detalle-simple', 'abrirCuenta(nequi) no muestra el detalle simple: ' + visibles()); chequea(ev('_cajitaActualId') === null, 'quedó una cajita abierta al entrar a Nequi');
  const tSim = await tocar('simple');
  ev(`abrirCuenta('nequi'); renderDetalleCuenta('nequi')`);
  // Escenario de Spotify con datos (S.spotify): pinta la pantalla y toca sus botones
  ev(`S.spotify.costo=17500; S.spotify.personas.push({id:'sp1',nombre:'Ana',monto:5000,pagado:false,proximoPago:'${iso(5)}',fechaIngreso:'${iso(-30)}',ultimoDestino:'',mesesAdelantados:1});
      S.spotify.historial.push({id:'h1',tipo:'cobro',spId:'sp1',nombre:'Ana',fuente:'nequi',fecha:'${iso(-2)}',monto:5000});`);
  try { ev(`renderSpotify(); renderSpHistorial(); renderSpStats()`); } catch (e) { fallos.push('Spotify: render lanzó ' + e.message); }
  chequea(/Ana/.test(ev(`document.getElementById('spotifyList').innerHTML`)), 'Spotify: la lista no muestra al integrante guardado en S.spotify.personas');
  const accSp = [...new Set([...w.document.querySelectorAll('#screen-spotify [data-action]')].map(e => e.dataset.action))];
  for (const a of accSp) {
    const el = w.document.querySelector(`#screen-spotify [data-action="${a}"]`); const w0 = logs.warn.length, u0 = uncaught.length;
    try { el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })); } catch (e) { fallos.push(`Spotify: ${a} lanzó ${e.message}`); }
    await esperar(10);
    logs.warn.slice(w0).filter(m => /No hay handler/.test(m)).forEach(() => fallos.push(`Spotify: ${a} SIN HANDLER`));
    uncaught.slice(u0).forEach(m => fallos.push(`Spotify: ${a} → ${m.slice(0, 170)}`));
    try { ev('closeAllSheets()'); } catch (e) {}
  }
  console.log('FASE 2 Spotify: botones tocados', accSp.length, '→', accSp.join(' '));
  const todas = [...new Set([...tSel, ...tNu, ...tCaj, ...tSim])];
  console.log('\nFASE 2 (Cuentas/Nu con datos): botones tocados:', todas.length, '→', todas.join(' '));
  console.log('FASE 2 fallos (' + fallos.length + '):'); fallos.forEach(f => console.log('  ' + f));

  // ── Fase 3: mapa de acciones de TODO el proyecto (las usadas en index.html y en los .js vs las registradas) ──
  const leerRec = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (e.name === 'node_modules' ? [] : leerRec(path.join(d, e.name))) : [path.join(d, e.name)]);
  const sinComentarios = t => t.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
  const fuentes = [path.join(RAIZ, 'index.html'), ...leerRec(path.join(RAIZ, 'js')).filter(f => f.endsWith('.js'))];
  const textos = fuentes.map(f => [path.relative(RAIZ, f), sinComentarios(fs.readFileSync(f, 'utf8'))]);
  const registradas = new Set(ev('[...window.__reg]'));
  const nsConocidos = new Set([...registradas].map(a => a.split(':')[0]));
  // Namespaces que se registran en módulos ES (<script type="module">): jsdom no los ejecuta, así que no se pueden verificar aquí.
  const nsModulo = new Set();
  for (const [rel, t] of textos) {
    const esModulo = rel === 'index.html' ? false : /^\s*(import|export)\s/m.test(t);
    const bloques = rel === 'index.html' ? [...t.matchAll(/<script[^>]*type="module"[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]) : (esModulo ? [t] : []);
    bloques.forEach(b => { for (const m of b.matchAll(/registerAll\(\s*['"]([a-zA-Z0-9_-]+)['"]|Events\.on\(\s*['"]([a-zA-Z0-9_-]+):/g)) nsModulo.add(m[1] || m[2]); });
  }
  const usadas = new Map(), dinamicas = [];
  const anota = (a, rel) => (usadas.get(a) || usadas.set(a, new Set()).get(a)).add(rel);
  for (const [rel, t] of textos) {
    for (const m of t.matchAll(/data-action=["']([a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+)["']/g)) anota(m[1], rel);
    // cualquier literal 'ns:accion' con un namespace conocido (acciones guardadas en variables, p. ej. { abrir: 'prestado:abrirMiDeuda' })
    for (const m of t.matchAll(/['"`]([a-zA-Z0-9_-]+):([A-Za-z0-9_-]+)['"`]/g)) if (nsConocidos.has(m[1]) || nsModulo.has(m[1])) anota(m[1] + ':' + m[2], rel);
    for (const m of t.matchAll(/(?:data-action=["']|Events\.attr\(\s*['"`])[a-zA-Z0-9_-]*:?[^"'`)]*\$\{[^}]*\}/g)) dinamicas.push(rel + ': ' + m[0].slice(0, 70));
  }
  const rotas = [...usadas.keys()].filter(a => !registradas.has(a) && !nsModulo.has(a.split(':')[0])).sort();
  const enModulo = [...usadas.keys()].filter(a => !registradas.has(a) && nsModulo.has(a.split(':')[0])).length;
  const muertas = [...registradas].filter(a => !usadas.has(a)).sort();
  const duplicadas = [...new Set(logs.warn.filter(m => /ya estaba registrada/.test(m)).map(m => (m.match(/"([^"]+)"/) || [])[1]))];
  console.log('\nFASE 3 (mapa de acciones): usadas ' + usadas.size + ', registradas en tiempo de ejecución ' + registradas.size + ', usadas en módulos ES no verificables aquí (' + [...nsModulo].join(', ') + '): ' + enModulo + ', construidas dinámicamente ' + dinamicas.length);
  console.log('FASE 3 usadas SIN registrar (' + rotas.length + '):'); rotas.forEach(a => console.log('  ' + a + '  ← ' + [...usadas.get(a)].join(', ')));
  console.log('FASE 3 registradas que nadie nombra en el código (' + muertas.length + ', posible código muerto o uso dinámico):', muertas.join(' ') || '—');
  console.log('FASE 3 registradas dos veces (' + duplicadas.length + '):', duplicadas.join(' ') || '—');
  dinamicas.forEach(d => console.log('FASE 3 dinámica (revisar a mano): ' + d));
  if (rotas.length || fallos.length || duplicadas.length) process.exitCode = 1;
  if (process.argv.includes('--verbose')) console.log('FASE 3 dinámicas:', dinamicas.slice(0, 15));
  if (process.argv.includes('--verbose')) { console.log('\nCARGA warn:', logs.warn.slice(0, 20)); console.log('CARGA error:', logs.error.slice(0, 20)); console.log('uncaught:', uncaught.slice(0, 20)); }
  w.close(); process.exit(0);
})().catch(e => { console.error('FALLÓ la prueba de humo:', e); process.exit(1); });
