// scripts/pruebas-navegador.js (npm run navegador) — pruebas en un Chromium REAL, que jsdom no puede dar:
//   1. Accesibilidad con axe-core en cada pantalla y cada hoja (sin contraste de color: eso va con los estilos).
//   2. Foco y teclado: la hoja es un diálogo, el foco entra y vuelve, Tab no se escapa.
//   3. Presupuesto de rendimiento: con 5 años de datos, la lista de movimientos de una cuenta no debe pintar miles de nodos.
//   4. Cero errores de página (pageerror) durante todo el recorrido.
// Sirve el repo con un servidor local y bloquea todo lo que no sea localhost (sin Firebase, sin sesión: se inyecta un estado sintético).
// Requiere el navegador de Playwright: `npx playwright install chromium` (en el CI lo hace el flujo). Sale con código 1 si algo falla.
// Opciones: --lento  = presupuestos x3 (máquina cargada). Los presupuestos son holgados a propósito: atrapan una regresión de orden de
// magnitud (volver a pintar 7.000 filas), no un 20 % de ruido.
'use strict';
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const RAIZ = path.join(__dirname, '..');
const { cargarApp, generar } = require(path.join(RAIZ, 'tests', 'support', 'datos-sinteticos.js'));
const { chromium } = require('playwright');
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const FACTOR = process.argv.includes('--lento') ? 3 : 1;

const PRESUPUESTO = { pintarListaMs: 80 * FACTOR, nodosLista: 4000, armarFilasMs: 150 * FACTOR };
const PANTALLAS = ['inicio', 'cuentas', 'gastos', 'tarjetas', 'historial', 'alcancia', 'comprometida', 'prestamos', 'mesada', 'spotify', 'encargos', 'analisis'];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

function servir() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      let f = path.join(RAIZ, decodeURIComponent(q.url.split('?')[0]));
      if (f.endsWith(path.sep)) f = path.join(f, 'index.html');
      fs.readFile(f, (e, b) => { if (e) { r.statusCode = 404; r.end(); return; } r.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream'); r.end(b); });
    }).listen(0, () => res(srv));
  });
}
const estadoSintetico = (desde, dias) => { const ctx = cargarApp(); generar(ctx, { desde, dias }); return JSON.parse(JSON.stringify(ctx.S)); };

(async () => {
  const fallos = [], info = [];
  const falla = m => fallos.push(m);
  const srv = await servir();
  const navegador = await chromium.launch();
  try {
    const ctx = await navegador.newContext({ viewport: { width: 390, height: 800 }, bypassCSP: true });
    await ctx.route(u => !u.href.startsWith('http://localhost'), rt => rt.abort());
    const p = await ctx.newPage();
    const erroresPagina = []; p.on('pageerror', e => erroresPagina.push(e.message));
    await p.goto('http://localhost:' + srv.address().port + '/index.html');
    await p.waitForTimeout(2500);
    await p.addScriptTag({ content: AXE });

    // ── 1) Accesibilidad ──
    await p.evaluate(est => { Object.assign(S, est); try { _initEventListeners(); } catch (e) { /* sin sesión */ } }, estadoSintetico('2026-01-01', 300));
    const axeEn = (selector) => p.evaluate(async (sel) => {
      const raiz = sel ? document.querySelector(sel) : document;
      const r = await axe.run(raiz, { resultTypes: ['violations'], rules: { 'color-contrast': { enabled: false }, region: { enabled: !sel ? true : false } } });
      return r.violations.map(v => v.id + ' (' + v.impact + ', ' + v.nodes.length + '): ' + v.nodes[0].html.slice(0, 100));
    }, selector);
    for (const n of PANTALLAS) {
      await p.evaluate(n => showScreen(n), n).catch(e => falla('showScreen(' + n + '): ' + e.message.slice(0, 80)));
      await p.waitForTimeout(300);
      // La pantalla de carga (#fb-loading-screen) es previa a la app: su aviso de región no cuenta aquí.
      (await axeEn(null)).filter(v => !/^region /.test(v)).forEach(v => falla('axe en pantalla «' + n + '»: ' + v));
    }
    await p.evaluate(async () => { for (const g of Object.keys(Loader.GROUPS)) { try { await Loader.ensure(g); } catch (e) { /* */ } } });
    const hojas = await p.evaluate(() => [...document.querySelectorAll('[id^="sheet-"]')].map(e => e.id.slice(6)));
    for (const id of hojas) {
      await p.evaluate(id => { try { openSheet(id); } catch (e) { /* */ } }, id);
      await p.waitForTimeout(60);
      (await axeEn('#sheet-' + id)).forEach(v => falla('axe en hoja «' + id + '»: ' + v));
      await p.evaluate(id => { try { closeSheet(id); } catch (e) { /* */ } }, id);
    }
    info.push(`axe: ${PANTALLAS.length} pantallas y ${hojas.length} hojas`);

    // ── 2) Foco y teclado ──
    const comp = await p.evaluate(() => {
      const o = {}, b = document.createElement('button'); b.textContent = 'origen'; document.body.appendChild(b); b.focus();
      openSheet('menu'); const h = document.querySelector('#sheet-menu .sheet');
      o.dialogo = h.getAttribute('role') === 'dialog' && h.getAttribute('aria-modal') === 'true';
      o.nombre = !!document.getElementById(h.getAttribute('aria-labelledby') || '_')?.textContent.trim();
      o.focoEntra = h.contains(document.activeElement);
      closeSheet('menu'); o.focoVuelve = document.activeElement === b; b.remove();
      return o;
    });
    if (!comp.dialogo) falla('la hoja no es un diálogo modal');
    if (!comp.nombre) falla('la hoja no tiene nombre accesible');
    if (!comp.focoEntra) falla('el foco no entra a la hoja al abrirla');
    if (!comp.focoVuelve) falla('el foco no vuelve al cerrar la hoja');
    await p.evaluate(() => openSheet('menu'));
    let siempreDentro = true;
    for (let i = 0; i < 40 && siempreDentro; i++) { await p.keyboard.press('Tab'); siempreDentro = await p.evaluate(() => !!document.activeElement.closest('#sheet-menu .sheet')); }
    if (!siempreDentro) falla('Tab se escapó de la hoja abierta');
    await p.keyboard.press('Shift+Tab');
    if (!(await p.evaluate(() => !!document.activeElement.closest('#sheet-menu .sheet')))) falla('Shift+Tab se escapó de la hoja abierta');
    await p.evaluate(() => closeSheet('menu'));

    // ── 3) Rendimiento: 5 años de datos, lista de una cuenta ──
    const grande = estadoSintetico('2022-01-01', 1825);
    const med = await p.evaluate(async (est) => {
      Object.assign(S, est); await Loader.ensure('cuentas');
      const o = {}, t = (f) => { const a = performance.now(); const r = f(); return [performance.now() - a, r]; };
      const [msArmar, movs] = t(() => getMovimientosCuenta('cuenta:nequi')); o.filas = movs.length; o.msArmar = msArmar;
      if (!document.getElementById('det-cuenta-movs')) { const d = document.createElement('div'); d.id = 'det-cuenta-movs'; document.body.appendChild(d); }
      const [msPintar] = t(() => renderMovimientosCuenta('det-cuenta-movs', movs, '#0af', 'cuenta:nequi', 'movs-filtros-cuenta'));
      o.msPintar = msPintar; o.nodos = document.getElementById('det-cuenta-movs').querySelectorAll('*').length;
      o.botonMas = /Mostrar más/.test(document.getElementById('det-cuenta-movs').textContent);
      return o;
    }, grande);
    info.push(`lista de ${med.filas} filas: armar ${med.msArmar.toFixed(0)} ms, pintar ${med.msPintar.toFixed(0)} ms, ${med.nodos} nodos`);
    if (med.filas < 1000) falla('el estado sintético no generó filas suficientes (' + med.filas + ')');
    if (med.msPintar > PRESUPUESTO.pintarListaMs) falla(`pintar la lista tardó ${med.msPintar.toFixed(0)} ms (presupuesto ${PRESUPUESTO.pintarListaMs})`);
    if (med.nodos > PRESUPUESTO.nodosLista) falla(`la lista creó ${med.nodos} nodos (presupuesto ${PRESUPUESTO.nodosLista}): ¿volvió a pintar todas las filas?`);
    if (med.msArmar > PRESUPUESTO.armarFilasMs) falla(`armar las filas tardó ${med.msArmar.toFixed(0)} ms (presupuesto ${PRESUPUESTO.armarFilasMs})`);
    if (!med.botonMas) falla('con miles de filas debe haber botón «Mostrar más»');

    // ── 4) Errores de página ──
    erroresPagina.forEach(e => falla('error de página: ' + e.slice(0, 160)));
  } finally { await navegador.close(); srv.close(); }

  console.log('Pruebas en navegador real —', info.join(' · '));
  if (fallos.length) { console.log('\n❌ FALLOS (' + fallos.length + '):'); fallos.forEach(f => console.log('  · ' + f)); process.exit(1); }
  console.log('✅ TODO OK en Chromium real');
})().catch(e => { console.error(e); process.exit(1); });
