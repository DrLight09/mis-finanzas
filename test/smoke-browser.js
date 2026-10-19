// Prueba de humo con la página REAL en jsdom: carga index.html y todos sus <script>, carga los grupos lazy, y toca cada
// botón data-action presente. Informa (a) acciones sin handler registrado y (b) excepciones al tocar cada botón.
// Uso: node tests/smoke-browser.js [raiz-del-repo]   (por defecto, la carpeta que contiene tests/)
const { JSDOM, ResourceLoader, VirtualConsole } = require('jsdom');
const fs = require('fs'), path = require('path');
const RAIZ = path.resolve(process.argv.slice(2).find(a => !a.startsWith('--')) || path.join(__dirname, '..'));
const ORIGEN = 'http://app.test/';
const faltan = [];
const logs = { warn: [], error: [] }, uncaught = [];
class Local extends ResourceLoader {
  fetch(url) {
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
  const dom = new JSDOM(fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8'), { runScripts: 'dangerously', resources: new Local(), pretendToBeVisual: true, virtualConsole: vc, url: ORIGEN + 'index.html',
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
  const todas = [...new Set([...tSel, ...tNu, ...tCaj, ...tSim])];
  console.log('\nFASE 2 (Cuentas/Nu con datos): botones tocados:', todas.length, '→', todas.join(' '));
  console.log('FASE 2 fallos (' + fallos.length + '):'); fallos.forEach(f => console.log('  ' + f));
  if (process.argv.includes('--verbose')) { console.log('\nCARGA warn:', logs.warn.slice(0, 20)); console.log('CARGA error:', logs.error.slice(0, 20)); console.log('uncaught:', uncaught.slice(0, 20)); }
  w.close(); process.exit(0);
})().catch(e => { console.error('FALLÓ la prueba de humo:', e); process.exit(1); });
