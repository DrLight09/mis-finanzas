// js/core/navegacion.js
//
// Navegación: pila de hojas (openSheet/closeSheet) y cambio de pantalla (showScreen), con carga bajo demanda de las pantallas lazy
// (Loader). Esta es la ÚNICA pieza que conoce el ciclo; lo que cada hoja o pantalla hace al abrirse lo registra su módulo dueño:
//   · Ui.hoja(id, fn, {fase})     al abrir la hoja `id`;
//   · Ui.pantalla(nombre, fn)     cuando showScreen(nombre) terminó (re-pintar la lista, resetear un detalle…).
// Ver js/core/ui.js. Carga como <script> clásico, después del núcleo y antes de los módulos que llaman openSheet/showScreen.

/* ── Sheet stack manager ────────────────────────────────────────────────────
   Permite apilar sheets: cuando se abre uno sobre otro, el anterior se
   "empuja" hacia atrás con escala+opacidad reducida. Al cerrar el superior,
   el anterior recupera el foco automáticamente.
   ─────────────────────────────────────────────────────────────────────── */
const _sheetStack = [];

function openSheet(id){
  // Ganchos registrados por los módulos (Ui.hoja, fase 'antes'). Si alguno devuelve false, la hoja no se abre.
  if(Ui.antesDeAbrirHoja(id)===false) return;
  // Si ya estaba en la pila, sacarlo para reposicionarlo al tope
  const _ssExist = _sheetStack.indexOf(id);
  if(_ssExist !== -1) _sheetStack.splice(_ssExist, 1);
  // Empujar el sheet actual hacia atrás (escala + opacidad reducida)
  if(_sheetStack.length > 0){
    const _ssPrevId = _sheetStack[_sheetStack.length - 1];
    const _ssPrevEl = document.getElementById('sheet-' + _ssPrevId);
    if(_ssPrevEl) _ssPrevEl.classList.add('sheet-background');
  }
  _sheetStack.push(id);
  const _ssEl = document.getElementById('sheet-' + id);
  if(_ssEl){ _ssEl.classList.add('open'); _ssEl.classList.remove('sheet-background'); }
  Ui.despuesDeAbrirHoja(id);
}

function closeSheet(id){
  const _csEl = document.getElementById('sheet-' + id);
  if(_csEl){
    // Si el foco (y con él el teclado) está dentro del sheet que se cierra, soltarlo
    // de forma explícita: así el teclado se cierra siempre a la vez que el sheet y
    // no depende de cuándo decida el navegador limpiar el foco de un nodo oculto.
    const _csAe = document.activeElement;
    if(_csAe && _csAe !== document.body && _csEl.contains(_csAe) && typeof _csAe.blur === 'function') _csAe.blur();
    _csEl.classList.remove('open'); _csEl.classList.remove('sheet-background');
  }
  // Quitar de la pila
  const _csIdx = _sheetStack.indexOf(id);
  if(_csIdx !== -1) _sheetStack.splice(_csIdx, 1);
  // Restaurar el sheet anterior si queda alguno en la pila
  if(_sheetStack.length > 0){
    const _csPrevId = _sheetStack[_sheetStack.length - 1];
    const _csPrevEl = document.getElementById('sheet-' + _csPrevId);
    if(_csPrevEl){ _csPrevEl.classList.remove('sheet-background'); }
  }
}

function showScreen(name){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
  document.getElementById('screen-'+name).classList.add('active');
  const navEl=document.getElementById('nav-'+name);
  if(navEl)navEl.classList.add('active');
  document.getElementById('scrollArea').scrollTop=0;
  // Carga bajo demanda (docs/auditoria-tecnica.md #4, fase 1 de la
  // modularización — piloto: solo Alcancía por ahora, ver
  // js/core/lazy-loader.js). Si "name" es una pantalla lazy y todavía
  // no cargó, mostrar un estado de carga breve y volver a llamar a
  // showScreen(name) una vez que el script termine de bajar — así
  // cubre tanto a los módulos que se integran con una rama if(name===X)
  // acá abajo (Mesada, Encargos, ...) como a los que se integran
  // parchando showScreen() ellos mismos al cargar (Alcancía): en
  // cualquiera de los dos casos, volver a invocar showScreen(name)
  // desde cero dispara el camino correcto, sin que este archivo tenga
  // que saber cuál de los dos patrones usa cada módulo.
  if (typeof Loader !== 'undefined' && Loader.GROUPS[name] && !Loader.isLoaded(name)) {
    _showScreenLoading(name);
    Loader.ensure(name).then(() => {
      _hideScreenLoading(name);
      showScreen(name);
    }).catch(err => {
      _hideScreenLoading(name);
      if (typeof toast === 'function') toast('No se pudo cargar esta sección. Revisa tu conexión.', 'err');
      console.error('[Loader]', err);
    });
    return;
  }

  // Lo que cada pantalla hace al mostrarse lo registran sus módulos con Ui.pantalla().
  Ui.alMostrarPantalla(name);
}

// Estado de carga mínimo mientras se descarga el script de una pantalla
// lazy: un texto centrado, insertado/quitado del contenedor de la propia
// pantalla. A propósito no es más elaborado (spinner, skeleton) — con un
// solo grupo en el piloto (Alcancía, ~14 KiB) la descarga es rápida en la
// enorme mayoría de las conexiones; si el piloto se extiende a módulos más
// pesados (Cuentas, Encargos) vale la pena revisar si esto sigue alcanzando.
function _showScreenLoading(name) {
  const scr = document.getElementById('screen-' + name);
  if (!scr || scr.querySelector('.screen-loading')) return;
  const el = document.createElement('div');
  el.className = 'screen-loading';
  el.style.cssText = 'display:flex;align-items:center;justify-content:center;padding:60px 20px;color:var(--text3);font-family:"DM Mono",monospace;font-size:13px;';
  el.textContent = 'Cargando…';
  scr.appendChild(el);
}
function _hideScreenLoading(name) {
  const scr = document.getElementById('screen-' + name);
  const el = scr && scr.querySelector('.screen-loading');
  if (el) el.remove();
}
