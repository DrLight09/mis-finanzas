// Prueba de humo con la página REAL en jsdom: carga index.html y todos sus <script>, carga los grupos lazy, y toca cada
// botón data-action presente. Informa (a) acciones sin handler registrado y (b) excepciones al tocar cada botón.
// Uso: node scripts/smoke-browser.js [raiz-del-repo] [--verbose]   (por defecto, la raíz del repo; necesita `npm install`: jsdom ^27.4.0 está en devDependencies; atajo: `npm run smoke`)
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

  // ── Fase 4: estados vacíos (mejora 1) — un único botón de acción por estado vacío, sin «svg» visible, y todo vuelve con datos ──
  const fallos4 = [];
  const q = sel => w.document.querySelector(sel);
  const viz = el => !!el && el.style.display !== 'none';
  const nBtn = el => el.querySelectorAll('.empty-state-btn').length;
  const sinSvg = el => !/svg/i.test(el.textContent);
  const c4 = (cond, msg) => { if (!cond) fallos4.push(msg); };
  try {
    ev(`mesFilter='todos'; S.gastosVar=[]; renderGastosVar()`);
    c4(nBtn(q('#gastosVarList')) === 1 && !viz(q('.btn-open-gasto-var')), 'Gastos vacío: debe haber un solo botón (el del estado vacío)');
    c4(!viz(q('#gvTotalCard')), 'Gastos vacío: «Total filtrado» debe estar oculto');
    c4(sinSvg(q('#gastosVarList')), 'Gastos vacío: aparece el texto «svg»');
    ev(`S.gastosVar=[{id:'g1',desc:'Almuerzo',monto:10000,fecha:'2020-01-15',cat:'Comida',fuente:'efectivo',clase:'gasto'}]; mesFilter='2026-10'; renderGastosVar()`);
    c4(nBtn(q('#gastosVarList')) === 0 && viz(q('.btn-open-gasto-var')) && !viz(q('#gvTotalCard')), 'Gastos: un mes sin gastos debe dejar el botón de pie (no hay botón en su estado vacío) y ocultar el total');
    ev(`mesFilter='todos'; renderGastosVar()`);
    c4(nBtn(q('#gastosVarList')) === 0 && viz(q('.btn-open-gasto-var')) && viz(q('#gvTotalCard')), 'Gastos con datos: faltan el botón de pie o el total');

    ev(`S.gastosFijos=[]; S.spotify.costo=0; renderGastosFijos()`);
    c4(nBtn(q('#gastosFijosList')) === 1 && !viz(q('.btn-open-gasto-fijo')), 'Gastos fijos vacío: debe haber un solo botón');
    ev(`S.gastosFijos=[{id:'f1',nombre:'Arriendo',monto:500000,cat:'Hogar'}]; renderGastosFijos()`);
    c4(nBtn(q('#gastosFijosList')) === 0 && viz(q('.btn-open-gasto-fijo')), 'Gastos fijos con datos: falta el botón de pie');

    ev(`S.tarjetasCredito=[]; renderTCScreen()`);
    c4(nBtn(q('#tc-lista')) === 1 && !viz(q('#btn-nueva-tarjeta')) && sinSvg(q('#tc-lista')), 'Tarjetas vacío: un solo botón y sin «svg»');
    ev(`S.tarjetasCredito=[{id:'t1',nombre:'Visa',cupo:1000000,deuda:0,color:'#60b0f0',ultimos4:'1234'}]; renderTCScreen()`);
    c4(nBtn(q('#tc-lista')) === 0 && viz(q('#btn-nueva-tarjeta')), 'Tarjetas con datos: falta el botón de pie');

    ev(`S.spotify.personas=[]; S.spotify.historial=[]; renderSpotify(); renderSpHistorial(); renderSpStats()`);
    c4(nBtn(q('#spotifyList')) === 1 && !viz(q('#btn-add-spotify-persona')) && sinSvg(q('#spotifyList')), 'Spotify vacío: un solo «Agregar persona» y sin «svg»');
    c4(!viz(q('#spStatsTitulo')), 'Spotify vacío: el título «Estadísticas» debe estar oculto');
    c4(!!q('#spHistorial .sp-hist-vacio'), 'Spotify vacío: «Sin pagos registrados aún» debe quedar dentro del historial');
    ev(`S.spotify.personas.push({id:'sp9',nombre:'Luz',monto:5000,pagado:false,proximoPago:'2099-01-01',fechaIngreso:'2026-10-01',ultimoDestino:'',mesesAdelantados:0}); renderSpotify(); renderSpHistorial(); renderSpStats()`);
    c4(nBtn(q('#spotifyList')) === 0 && viz(q('#btn-add-spotify-persona')) && viz(q('#spStatsTitulo')), 'Spotify con persona: faltan el botón de pie o el título «Estadísticas»');

    ev(`S.deudores=[]; S.misDeudas=[]; renderDeudoresList(); renderMisDeudasList()`);
    const fv = q('#deudoresList'), ct = q('#misDeudasList');
    c4(nBtn(fv) === 1 && nBtn(ct) === 1 && !viz(q('#btn-nueva-persona')) && !viz(q('#btn-nueva-deuda')), 'Préstamos vacío: un solo botón en Me deben y en Yo debo');
    c4(fv.querySelector('.empty-state-btn').textContent.trim() === ct.querySelector('.empty-state-btn').textContent.trim(), 'Préstamos vacío: los dos botones deben llamarse igual');
    c4(fv.querySelector('.empty-state-title').textContent !== ct.querySelector('.empty-state-title').textContent, 'Préstamos vacío: los títulos deben distinguir quién debe a quién');
    c4(sinSvg(fv) && sinSvg(ct), 'Préstamos vacío: aparece el texto «svg»');
    ev(`Deudas.agregar('favor',{id:'d1',nombre:'Ana',color:'#60b0f0',movimientos:[]}); Deudas.agregar('contra',{id:'d2',nombre:'Beto',color:'#f06868',movimientos:[]}); renderDeudoresList(); renderMisDeudasList()`);
    c4(nBtn(fv) === 0 && nBtn(ct) === 0 && viz(q('#btn-nueva-persona')) && viz(q('#btn-nueva-deuda')), 'Préstamos con datos: faltan los botones de pie');

    ev(`S.encargos=[]; renderEncargosList()`);
    c4(nBtn(q('#encargosList')) === 1 && !viz(q('#btn-nuevo-encargo')), 'Encargos vacío: un solo botón');
    q('#encargosList .empty-state-btn').dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
    await esperar(30);
    c4(q('#sheet-nuevo-encargo').classList.contains('open'), 'Encargos vacío: el botón del estado vacío no abre «Nuevo encargo»');
    c4(/Sin especificar/.test(q('#enc_cuenta_ini').innerHTML), 'Encargos vacío: el botón del estado vacío no puebla el select de cuentas');
    ev(`closeSheet('nuevo-encargo')`);
    ev(`S.encargos=[{id:'e1',nombre:'Mamá',personaId:'',saldoInicial:0,movimientos:[],cuentas:[]}]; renderEncargosList()`);
    c4(nBtn(q('#encargosList')) === 0 && viz(q('#btn-nuevo-encargo')), 'Encargos con datos: falta el botón de pie');

    // .money-input: miles al escribir y cursor que no salta (campo real de la página)
    const gm = q('#gv_monto');
    gm.value = '1500000,5'; gm.setSelectionRange(9, 9);
    gm.dispatchEvent(new w.InputEvent('input', { bubbles: true, inputType: 'insertText', data: '5' }));
    c4(gm.value === '1.500.000,5' && ev(`parseMoney(document.getElementById('gv_monto').value)`) === 1500000.5, '.money-input: 1500000,5 debe verse 1.500.000,5 y leerse como 1500000.5');
    gm.value = '1.5000'; gm.setSelectionRange(3, 3);
    gm.dispatchEvent(new w.InputEvent('input', { bubbles: true, inputType: 'insertText', data: '0' }));
    c4(gm.value === '15.000' && gm.selectionStart === 2, '.money-input: escribir en medio no manda el cursor al final');
    gm.value = '';

    // Mejora 4: «Yo debo» marca el monto vacío en el propio campo, igual que «Me deben»
    ev(`abrirMiDeuda('d2'); abrirMovMiDeuda('recibido')`);
    c4(q('#mdMovSheetTitle').textContent === 'Nueva deuda', 'Yo debo: el sheet de nueva deuda debe titularse «Nueva deuda»');
    ev(`_injectErrorSpans()`); // en la app real lo llama firebase-sync.js (módulo ES, que jsdom no ejecuta)
    ev(`confirmarMovMiDeuda()`);
    c4(q('#md_monto').classList.contains('input-error') && q('#md_monto_err').textContent === 'Ingresa un monto mayor a 0', 'Yo debo: monto vacío debe marcar el campo con «Ingresa un monto mayor a 0»');
    ev(`closeSheet('mov-mi-deuda')`);

    // Mejora 6: balance de Análisis — un color, un signo y un mensaje por escenario
    const esc6 = (ing, gas) => {
      ev(`S.movimientos=[]; S.gastosVar=[]; S.gastosFijos=[]; S.pagosGastosFijos={}; S.cajitas=[]; S.mesadas=S.mesadas&&{}; S.ingresosFijos=${ing ? `[{id:'i6',nombre:'Sueldo',monto:${ing}}]` : '[]'};` +
         (gas ? `S.gastosVar=[{id:'g6',desc:'Compra',monto:${gas},fecha:hoy(),cat:'Comida',fuente:'efectivo',clase:'gasto'}];` : '') + `renderAnalisis()`);
      const h = q('#analisis-balance-hero');
      return { cls: h.className.replace('ix-analisis-balance-hero ', ''), monto: h.querySelector('.an-hero-monto').textContent.trim(), msg: h.querySelector('.an-hero-msg').textContent.trim(), ing: q('#an-ingresos').textContent.trim() };
    };
    let r6 = esc6(0, 0);
    c4(r6.cls === 'an-hero-neu' && /Aún no hay ingresos ni gastos que cuenten para este mes/.test(r6.msg), 'Balance sin ingresos ni gastos: neutro con «Aún no hay ingresos ni gastos que cuenten para este mes.»');
    r6 = esc6(0, 33.33);
    c4(r6.cls === 'an-hero-neg' && r6.monto === '-$33,33' && /Has gastado \$33,33 y aún no registras ingresos/.test(r6.msg) && /Registra tus ingresos para ver el balance del mes/.test(r6.msg) && !/Mesada/.test(r6.msg) && r6.ing === '—', 'Balance sin ingresos y con gastos: rojo, -$33,33 y mensaje de registrar ingresos');
    r6 = esc6(100000, 30000);
    c4(r6.cls === 'an-hero-pos' && r6.monto === '+$70.000' && /vas bien: has gastado menos de lo que has recibido/.test(r6.msg), 'Balance con ingresos > gastos: verde con signo +');
    r6 = esc6(50000, 50000);
    c4(r6.cls === 'an-hero-neu' && r6.monto === '$0' && /has gastado todo lo que has recibido/.test(r6.msg) && q('#an-tasa-ahorro').textContent === '0%' && q('#an-ahorrado').style.color === 'var(--text3)', 'Balance en cero: neutro, ni verde ni rojo (también en las tarjetas)');
    r6 = esc6(50000, 80000);
    c4(r6.cls === 'an-hero-neg' && r6.monto === '-$30.000' && /has gastado más de lo que has recibido/.test(r6.msg), 'Balance con gastos > ingresos: rojo con signo -');

    // Revisión de Análisis/Salud/Proyección (2026-10-27)
    // 3 · Mesada cobrada este mes que cubre otro mes: es plata de ESTE mes (regla de caja, una sola definición en Periodo)
    ev(`S.movimientos=[]; S.gastosVar=[]; S.gastosFijos=[]; S.pagosGastosFijos={}; S.cajitas=[]; S.ingresosFijos=[]; S.modulos=Object.assign({},S.modulos,{mesada:true});` +
       `const kOtro=new Date().getFullYear()+'-'+((new Date().getMonth()+1)%12); S.mesadas={papa:{cuotas:{},pagos:{[kOtro]:{monto:80000,fecha:hoy()}}},mama:{cuotas:{},pagos:{}}}; renderAnalisis()`);
    const h3 = q('#analisis-balance-hero');
    c4(h3.className.includes('an-hero-pos') && h3.querySelector('.an-hero-monto').textContent.trim() === '+$80.000' && q('#an-ingresos').textContent.trim() === '$80.000', 'Balance: una mesada cobrada este mes que cubre otro mes cuenta como ingreso de este mes (+$80.000)');
    ev(`S.mesadas={papa:{cuotas:{},pagos:{}},mama:{cuotas:{},pagos:{}}}; renderAnalisis()`);
    c4(q('#analisis-balance-hero').className.includes('an-hero-neu') && q('#an-ingresos').textContent.trim() === '—', 'Balance: sin mesada vuelve a neutro');
    // 5b / 5c · historial de patrimonio: sin base no hay porcentaje; el título cuenta días y el eje va por fecha
    const fh = `const dia=n=>{const x=new Date();x.setDate(x.getDate()-n);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0')};`;
    ev(fh + `S.patrimonioHistorial=[{fecha:dia(11),valor:0,valorVisible:0},{fecha:dia(10),valor:80000,valorVisible:80000},{fecha:dia(0),valor:80000,valorVisible:80000}]; renderAnalisis()`);
    const pat = q('#an-patrimonio-chart');
    const pts = JSON.parse(pat.querySelector('#_pat-overlay').dataset.pts);
    c4(pat.querySelector('.an-pat-pct').textContent.trim() === '—' && !/\+0\.0%/.test(pat.textContent), 'Historial de patrimonio: primer punto en 0 → porcentaje «—», no «+0.0%»');
    c4(/Últimos 12 días/.test(pat.querySelector('.an-pat-tit').textContent), 'Historial de patrimonio: «Últimos N días» cuenta días de la ventana (3 registros en 12 días → 12), no registros');
    c4(pts.length === 3 && pts[1].px < 40 && pts[2].px > 300, 'Historial de patrimonio: el eje reparte por fecha (el 2.º punto, a 1 día del 1.º, queda pegado al inicio; no a la mitad)');
    // 2 · Proyección: con menos de 30 días no hay cifras a 3/6/12 meses
    ev(fh + `S.cuentas=[{id:'nequi',tipo:'nequi',saldo:500000},{id:'efectivo',tipo:'efectivo',saldo:0}]; S.patrimonioHistorial=[{fecha:dia(9),valor:100000},{fecha:dia(0),valor:500000}]; renderProyeccion()`);
    const pr = q('#proyeccion-card');
    c4(/llevas 9 de 30 días/.test(pr.textContent) && !pr.querySelector('.inicio-proy-card') && /—/.test(pr.textContent), 'Proyección: con 9 días de historial no muestra 3/6/12 meses y dice cuánto falta (llevas 9 de 30)');
    ev(fh + `S.patrimonioHistorial=[{fecha:dia(35),valor:100000},{fecha:dia(0),valor:500000}]; renderProyeccion()`);
    c4(pr.querySelectorAll('.inicio-proy-card').length === 3 && !/PRELIMINAR/.test(pr.textContent), 'Proyección: con 35 días sí muestra las 3 cifras, sin chip PRELIMINAR');

    // Mejora 11: «Salud financiera» — el consejo del CDT es una sugerencia (no un check verde) y lleva a Cuentas
    ev(`S.movimientos=[]; S.gastosVar=[]; S.tarjetasCredito=[]; S.cajitas=S.cajitas||[]; S.cuentas=[{id:'nequi',tipo:'nequi',saldo:9000000},{id:'efectivo',tipo:'efectivo',saldo:0}]; S.ingresosFijos=[{id:'i11',nombre:'Sueldo',monto:3000000}]; S.gastosFijos=[{id:'f11',monto:1000000}]; S.pagosGastosFijos={['f11_'+mesActual()]:{monto:1000000}}; renderHealthScore()`);
    const tipCdt = [...w.document.querySelectorAll('#health-score-card .inicio-tip')].find(t => /CDT/.test(t.textContent));
    c4(!!tipCdt && tipCdt.classList.contains('inicio-tip-info') && !tipCdt.classList.contains('inicio-tip-ok') && !!tipCdt.querySelector('.fa-circle-info') && !tipCdt.querySelector('svg'), 'Salud financiera: el consejo del CDT debe verse como sugerencia (ícono de información, no check verde)');
    c4(!w.document.querySelector('#health-score-card .inicio-tip-ok'), 'Salud financiera: no debe haber checks verdes en recomendaciones');
    tipCdt.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
    await esperar(30);
    c4(q('#screen-cuentas').classList.contains('active'), 'Salud financiera: el consejo del CDT debe llevar a Cuentas');
    ev(`showScreen('inicio')`);

    // Mejora 8: Presupuestos mensuales con puntos de miles, guardando siempre el número
    ev(`S.presupuestos={}; S.presupuestos[getCatsVar()[0]]=500000; abrirPresupuestos()`);
    const pi = q('#presup-input-0');
    c4(pi && pi.value === '500.000', 'Presupuestos: 500000 debe verse 500.000 al abrir');
    pi.value = '1500000'; pi.setSelectionRange(7, 7);
    pi.dispatchEvent(new w.InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    c4(pi.value === '1.500.000', 'Presupuestos: al escribir 1500000 debe verse 1.500.000');
    pi.dispatchEvent(new w.Event('change', { bubbles: true }));
    c4(ev(`S.presupuestos[getCatsVar()[0]]`) === 1500000, 'Presupuestos: lo guardado debe ser el número 1500000');
    pi.value = '0'; pi.dispatchEvent(new w.Event('change', { bubbles: true }));
    c4(ev(`getCatsVar()[0] in S.presupuestos`) === false && pi.value === '', 'Presupuestos: 0 debe quitar el límite y vaciar el campo');
    ev(`closeSheet('presupuestos')`);
  } catch (e) { fallos4.push('Fase 4 lanzó: ' + e.message); }
  console.log('\nFASE 4 (estados vacíos) fallos (' + fallos4.length + '):'); fallos4.forEach(f => console.log('  ' + f));

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

  // ── Resumen final: qué es fallo real y qué es ruido de jsdom ──
  // Los módulos ES (<script type="module">) NO se ejecutan en jsdom, así que sus
  // handlers (authgate:*, pin:*) siempre aparecen como "sin handler" / "lanzan al
  // tocar". Eso NO es un fallo del producto: se excluye del veredicto.
  // Acciones de namespaces clásicos cuyo HANDLER vive en un módulo ES
  // (firebase-sync.js define _fbSignOut/_abrirEliminarCuenta, pero se exponen
  // bajo el namespace 'config'). jsdom no ejecuta módulos ES, así que estas
  // acciones no se pueden tocar aquí. No es un fallo del producto.
  const accionesQueDependenDeModuloES = new Set(['config:abrirEliminarCuenta', 'config:signOut']);
  const esDeModulo = a => {
    const ns = a.split(':')[0];
    return nsModulo.has(ns) || accionesQueDependenDeModuloES.has(a);
  };
  const sinHandlerReales = [...new Set(sinHandler)].filter(a => !esDeModulo(a));
  const lanzanReales = lanzan.filter(l => !esDeModulo(l.split(' →')[0].trim()));

  const fallosReales = [];
  if (jsFaltan.length) fallosReales.push(`${jsFaltan.length} archivo(s) .js faltante(s): ${jsFaltan.join(', ')}`);
  if (antes > 0) fallosReales.push(`${antes} error(es) no atribuible(s) a un botón durante la carga (ver --verbose)`);
  if (fallos.length) fallosReales.push(`${fallos.length} fallo(s) en FASE 2: ${fallos.join(' | ')}`);
  if (fallos4.length) fallosReales.push(`${fallos4.length} fallo(s) en FASE 4 (estados vacíos): ${fallos4.join(' | ')}`);
  if (sinHandlerReales.length) fallosReales.push(`${sinHandlerReales.length} acción(es) sin handler real: ${sinHandlerReales.join(', ')}`);
  if (lanzanReales.length) fallosReales.push(`${lanzanReales.length} acción(es) que lanzan al tocar: ${lanzanReales.join(' | ')}`);
  if (rotas.length) fallosReales.push(`${rotas.length} acción(es) usada(s) sin registrar: ${rotas.join(', ')}`);
  if (duplicadas.length) fallosReales.push(`${duplicadas.length} acción(es) registrada(s) dos veces: ${duplicadas.join(', ')}`);

  // Ruido esperado en jsdom (no cuenta como fallo)
  const ruido = [];
  const sinHandlerModulo = [...new Set(sinHandler)].filter(a => esDeModulo(a));
  const lanzanModulo = lanzan.filter(l => esDeModulo(l.split(' →')[0].trim()));
  if (sinHandlerModulo.length) ruido.push(`${sinHandlerModulo.length} sin handler en módulos ES (jsdom no los ejecuta): ${sinHandlerModulo.join(', ')}`);
  if (lanzanModulo.length) ruido.push(`${lanzanModulo.length} que lanzan en módulos ES (jsdom no los ejecuta): ${lanzanModulo.map(l => l.split(' →')[0]).join(', ')}`);
  if (dinamicas.length) ruido.push(`${dinamicas.length} acción(es) construida(s) dinámicamente (revisar a mano)`);

  console.log('\n══════════════════════════════════════════════════════════════');
  if (ruido.length) {
    console.log('ℹ️  Ruido esperado en jsdom (NO es fallo):');
    ruido.forEach(r => console.log('   · ' + r));
  }
  if (fallosReales.length) {
    console.log('\n❌ FALLOS (' + fallosReales.length + '):');
    fallosReales.forEach(f => console.log('   · ' + f));
    console.log('\n══════════════════════════════════════════════════════════════');
    process.exitCode = 1;
  } else {
    console.log('\n✅ TODO OK — sin fallos reales.');
    console.log('══════════════════════════════════════════════════════════════');
  }

  if (process.argv.includes('--verbose')) console.log('FASE 3 dinámicas:', dinamicas.slice(0, 15));
  if (process.argv.includes('--verbose')) { console.log('\nCARGA warn:', logs.warn.slice(0, 20)); console.log('CARGA error:', logs.error.slice(0, 20)); console.log('uncaught:', uncaught.slice(0, 20)); }
  w.close(); process.exit(process.exitCode || 0);
})().catch(e => { console.error('FALLÓ la prueba de humo:', e); process.exit(1); });