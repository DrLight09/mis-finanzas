// js/core/sheet-stack.js
//
// Extraído de index.html — cierra el último bloque núcleo inline que
// quedaba (ver auditoria-tecnica.md, punto 1 de "Críticos": "de 18
// bloques <script> inline a 0"). Antes de esta extracción vivía repartido
// en dos <script> inline separados por js/core/money-input.js — se unifica
// acá en un solo archivo porque el mapeo de sesiones anteriores confirmó
// que es un solo sistema lógico (sheet-stack + showScreen + applyModulos +
// wiring legacy de _initEventListeners() + los 3 overrides de validación),
// no varios bloques independientes.
//
// Carga como <script> clásico (no type="module"), mismo criterio que
// js/core/core-state.js: así sus globales (openSheet, closeSheet,
// showScreen, applyModulos, _initEventListeners, addGastoVar/addGastoFijo
// ya sobrescritas, etc.) siguen siendo variables léxicas normales,
// accesibles desde cualquier otro <script> clásico del documento.
//
// ⚠️ Restricción de orden de carga (no mover el <script src> sin repetir
// esta verificación):
//   - Debe cargar DESPUÉS de js/modules/gastos.js y js/modules/spotify.js:
//     los overrides `addGastoVar = function(){...}` / `addGastoFijo =
//     function(){...}` de más abajo leen esos globales al parsear el
//     script (nivel superior, no dentro de una función), así que ya deben
//     existir en ese momento. (El override de `addSpotify`, en cambio,
//     vive dentro de `_injectErrorSpans()` y se resuelve recién cuando esa
//     función se invoca — sin esta restricción.)
//   - Debe cargar ANTES de js/modules/deudores-personas.js: ese archivo
//     monkey-patchea `openSheet()` (intercepta `id==='nueva-persona'`
//     antes de invocar el original) — necesita que `openSheet` ya exista
//     como global al momento de parsearse.
//   - Se mantiene en la misma posición relativa que tenía como bloque
//     inline: después de core-state.js/mesada.js/spotify.js/gastos.js/
//     prestado.js, antes de encargos.js.


// editarDeudorActual() migrada a js/modules/prestado.js — ver docs/prestado.md.

// editarEncargoActual() y guardarEditarEncargo() migradas a js/modules/encargos.js (ver docs/encargos.md).


function mostrarAlertaFuente(prefix){
  const fuenteEl=document.getElementById(prefix+'_fuente');
  if(fuenteEl){const val=fuenteEl.value;const hint=document.getElementById(prefix+'_fuente_hint');if(hint)hint.style.display=val?'block':'none';}
  const destEl=document.getElementById(prefix+'_destino');
  if(destEl){const val=destEl.value;const hint=document.getElementById(prefix+'_destino_hint');if(hint)hint.style.display=val?'block':'none';}
}

/* ---- NAV / SHEETS ---- */

/* ── Sheet stack manager ────────────────────────────────────────────────────
   Permite apilar sheets: cuando se abre uno sobre otro, el anterior se
   "empuja" hacia atrás con escala+opacidad reducida. Al cerrar el superior,
   el anterior recupera el foco automáticamente.
   ─────────────────────────────────────────────────────────────────────── */
const _sheetStack = [];

function openSheet(id){
  // Efectos secundarios por sheet específico
  if(id==='gasto-var'){poblarFuente('gv_fuente',true);const h=document.getElementById('gv_fuente_hint');if(h)h.style.display='none';document.getElementById('gv_fuente').onchange=function(){const sd=document.getElementById('gv_fuente_saldo');if(!sd)return;const val=this.value;if(!val){sd.textContent='';return;}const esTC=val.startsWith('tc:');const s=getSaldoFuente(val);if(esTC){const tcId=val.split(':')[1];const tc=(S.tarjetasCredito||[]).find(x=>x.id===tcId);const sinCupo=!tc||!tc.cupo;if(sinCupo){sd.textContent='El gasto se cargará a la TC — no sale plata de tus cuentas.';sd.style.color='var(--text2)';}else{sd.textContent='Cupo disponible: '+fmt(s);sd.style.color=s>0?'var(--accent)':'var(--red)';}}else{sd.textContent='Saldo disponible: '+fmt(s);sd.style.color=s>0?'var(--accent)':'var(--red)';}};}
  if(id==='nueva-persona'){initColorPicker();document.getElementById('np_nombre').value='';}
  if(id==='registrar-movimiento'){poblarFuente('mov_fuente');poblarFuente('mov_destino');}
  if(id==='agregar-dinero-menu'){save();openSheet_adMenu();}
  if(id==='pagar-spotify'){save();openSheet_pagarSpotify();}
  if(id==='spotify'){const fd=document.getElementById('sp_fecha_ingreso');if(fd&&!fd.value)fd.value=hoy();}
  if(id==='chequeo-nu'){poblarChequeoNu();}
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
}

function closeSheet(id){
  const _csEl = document.getElementById('sheet-' + id);
  if(_csEl){ _csEl.classList.remove('open'); _csEl.classList.remove('sheet-background'); }
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
  // Reset deudor detalle when leaving prestamos
  if(name!=='prestamos'){
    deudorActualId=null;
    miDeudaActualId=null;
    const det=document.getElementById('deudorDetalle');
    const detMD=document.getElementById('miDeudaDetalle');
    const vis=document.getElementById('deudoresView');
    const visMD=document.getElementById('misDeudasView');
    if(det)det.style.display='none';
    if(detMD)detMD.style.display='none';
    // Restaurar solo la lista de la pestaña que estaba activa (Me deben / Yo debo).
    // Antes esto siempre forzaba "Me deben" visible sin ocultar "Yo debo", así que
    // si volvías a Prestado estando en "Yo debo" aparecían las dos listas juntas.
    if(prestamosTabActiva==='yo-debo'){
      if(vis)vis.style.display='none';
      if(visMD)visMD.style.display='';
    } else {
      if(vis)vis.style.display='';
      if(visMD)visMD.style.display='none';
    }
  }
  if(name==='config') { renderCatsConfig(); if(typeof window._pinRenderBtn==='function') window._pinRenderBtn(); }
  if(name==='analisis') renderAnalisis();
  if(name==='personas') { _inyectarPersonaSheets(); _renderListaPersonas(); _actualizarMasPersonasSub(); }
  // Re-renderizar la cuenta abierta al volver a cuentas, para reflejar cambios
  // hechos en otras pantallas (ej: eliminar un encargo desde Más → Encargos)
  if(name==='cuentas') {
    if(cuentaActual) renderDetalleCuenta(cuentaActual);
    if(typeof _customCuentaActualId!=='undefined' && _customCuentaActualId) {
      if(typeof renderDetalleCustomCuenta==='function') renderDetalleCustomCuenta(_customCuentaActualId);
    }
  }
  // Re-renderizar lista de encargos al entrar a esa pantalla
  if(name==='encargos') {
    if(typeof renderEncargosList==='function') renderEncargosList();
  }
  // Re-renderizar mesada al entrar a esa pantalla
  if(name==='mesada') {
    if(typeof renderMesada==='function') renderMesada();
  }
}

function applyModulos(){
  const mod=S.modulos||{mesada:true,spotify:true,corregirSaldo:true};
  // Spotify nav tab
  const navSp=document.getElementById('nav-spotify');
  if(navSp)navSp.style.display=mod.spotify?'':'none';
  // Mesada screen in Más menu
  const mesScreen=document.getElementById('screen-mesada');
  if(mesScreen && !mod.mesada) mesScreen.classList.remove('active');
  // Update config toggles
  const cfgMesada=document.getElementById('cfg-mesada');
  const cfgSpotify=document.getElementById('cfg-spotify');
  const cfgCorregirSaldo=document.getElementById('cfg-corregirSaldo');
  if(cfgMesada)cfgMesada.checked=!!mod.mesada;
  if(cfgSpotify)cfgSpotify.checked=!!mod.spotify;
  if(cfgCorregirSaldo)cfgCorregirSaldo.checked=(mod.corregirSaldo!==false);
  // If currently on spotify screen and it's disabled, go to inicio
  if(!mod.spotify&&document.getElementById('screen-spotify').classList.contains('active')){
    showScreen('inicio');
  }
  // Mostrar u ocultar banners de saldo inicial completos
  const mostrarBanners=(mod.corregirSaldo!==false);
  ['nequi','efectivo'].forEach(f=>{
    const b=document.getElementById('banner-apertura-'+f);
    if(b)b.style.display=mostrarBanners?'':'none';
  });
  // Ocultar el toggle "Es saldo inicial" en el sheet de agregar dinero
  const adAperturaWrap=document.getElementById('adAperturaWrap');
  if(adAperturaWrap)adAperturaWrap.style.display=mostrarBanners?'flex':'none';
  // Ocultar el toggle "Es saldo inicial" en el sheet de Nu (entra plata)
  const nuMovAperturaWrap=document.getElementById('nuMovAperturaWrap');
  if(nuMovAperturaWrap&&!mostrarBanners)nuMovAperturaWrap.style.display='none';
  // Actualizar "Necesita atención" en Inicio para reflejar el nuevo estado de módulos
  // (ej: avisos de Spotify deben aparecer/desaparecer al activar/desactivar el módulo)
  if(typeof renderAttencion==='function') renderAttencion();
}

// toggleModulo/borrarTodo: migrado a js/modules/configuracion.js.
// Selector de cuentas (abrirCuenta/volverSelector/renderDetalleCuenta) migrado a js/modules/cuentas.js.

// Movimientos por cuenta (_getMovimientosCuentaCustom/getMovimientosCuenta) migrados a js/modules/cuentas.js.

// abrirDetalleMov() y eliminarMovimiento() — extraídas a js/core/movimientos.js.
// Núcleo compartido por toda la app (feed general + detalle de cada cuenta),
// no un módulo de dominio — por eso vive en js/core/ y no en js/modules/.
// Se registran ahí mismo bajo el namespace Events 'core:'.

// Agregar/restar dinero, apertura, movimiento Nu y transferir migrados a js/modules/cuentas.js.


/* ================================================================
   EVENTOS CENTRALIZADOS (Mejora 1 + 3)
   Todos los listeners del HTML inline ahora están aquí
   ================================================================ */

function _initEventListeners() {
  // --- Categorías: eliminar — migrado a data-action="config:eliminarCat" (js/modules/configuracion.js), ya no necesita delegado propio ---

  // --- Navegación bottom nav ---
  document.querySelectorAll('.nav-item[data-screen]').forEach(btn => {
    btn.addEventListener('click', () => showScreen(btn.dataset.screen));
  });

  // --- Header add button ---
  const btnHeaderAdd = document.getElementById('btn-header-add');
  if (btnHeaderAdd) btnHeaderAdd.addEventListener('click', () => openSheet('menu'));

  // --- Dialog buttons ---
  const btnDialogCancel = document.getElementById('dialog-cancel');
  const btnDialogConfirm = document.getElementById('dialog-confirm');
  if (btnDialogCancel) btnDialogCancel.addEventListener('click', () => _closeDialog(false));
  if (btnDialogConfirm) btnDialogConfirm.addEventListener('click', () => _closeDialog(true));

  // --- Tab bar gastos ---
  document.querySelectorAll('.tab-bar .tab[data-tab]').forEach(tab => {
    tab.addEventListener('click', () => switchGastoTab(tab.dataset.tab));
  });

  // --- Botones ghost de listas: migrados a js/modules/gastos.js (su propio wiring) ---


  // --- Año mesada: migrado a js/modules/mesada.js (su propio wiring) ---

  // --- Spotify: migrado a js/modules/spotify.js (su propio wiring) ---

  // --- Config toggles / Backup: migrado a js/modules/configuracion.js (su propio wiring, ver final del archivo) ---

  // --- Menu action cards ---
  // menu-gasto-var/fijo delegan a abrirNuevoGastoVar()/abrirNuevoGastoFijo()
  // (js/modules/gastos.js) en vez de reimplementar poblarCatSelect+openSheet
  // a mano — mismas funciones que ya usa el botón del estado vacío.
  const menuGastoVar = document.getElementById('menu-gasto-var');
  if (menuGastoVar) menuGastoVar.addEventListener('click', () => { closeSheet('menu'); abrirNuevoGastoVar(); });

  const menuGastoFijo = document.getElementById('menu-gasto-fijo');
  if (menuGastoFijo) menuGastoFijo.addEventListener('click', () => { closeSheet('menu'); abrirNuevoGastoFijo(); });
  const menuAD = document.getElementById('menu-agregar-dinero');
  if (menuAD) menuAD.addEventListener('click', () => { closeSheet('menu'); openSheet('agregar-dinero-menu'); });

  const menuTransferir = document.getElementById('menu-transferir');
  if (menuTransferir) menuTransferir.addEventListener('click', () => { closeSheet('menu'); abrirTransferir(); });

  // --- Cuentas personalizadas, CDT y meta de ahorro en cajita:
  // migrados a js/modules/cuentas.js (su propio wiring) ---

  // btn-guardar-gasto-var/fijo, btn-confirmar-pagar-gf, pgf-fuente,
  // gv_fuente: migrados a js/modules/gastos.js (su propio wiring).
  // btn-guardar-ingreso-fijo: migrado a js/modules/analisis.js (su propio wiring).

  // Controles de Encargos ("Nuevo movimiento" y "Compra con TC") y de
  // Préstamos ("Registrar movimiento") que tenían oninput/onchange
  // inline, migrados a js/modules/encargos.js y js/modules/prestado.js
  // respectivamente — su propio wiring, igual que Mesada/Spotify/Gastos/
  // Cuentas. Nota de corrección: "ctc_*" es un flujo de Encargos (comprar
  // con plata de un encargo cargándola a una TC), no de Tarjetas de
  // Crédito — tarjetas_credito.js no referencia ninguno de estos ids, así
  // que el grupo "entrelazado" nunca fue en realidad Encargos/TC/Préstamos,
  // sino solo Encargos/Préstamos.

  // Inputs "real" de los 4 sheets con motor Diferencial (js/core/diferencial.js):
  // migrados junto con lo anterior a encargos.js (movenc/ctc/usarParte)
  // y prestado.js (prtc).
  // btn-guardar-spotify, btn-confirmar-sp-destino, spMesesSelect,
  // btn-confirmar-pagar-spotify: migrados a js/modules/spotify.js.
  // btn-confirmar-mesada, btn-confirmar-mesada-pend: migrados a
  // js/modules/mesada.js.
  // btn-confirmar-agregar-dinero(-menu), btn-confirmar-restar,
  // btn-confirmar-editar-apertura, btn-confirmar-transferir,
  // btn-switch-to-transferir: migrados a js/modules/cuentas.js.

  // --- Close sheets via data-close-sheet (delegated — cubre sheets inyectados dinámicamente) ---
  document.addEventListener('click', function(e) {
    const btn = e.target.closest('[data-close-sheet]');
    if (btn) closeSheet(btn.dataset.closeSheet);
  });

  // --- Close sheets on overlay click (backdrop) — delegated ---
  document.addEventListener('click', function(e) {
    if (e.target.classList.contains('overlay') && e.target.dataset.sheetId) {
      closeSheet(e.target.dataset.sheetId);
    }
  });

  // --- Cuenta selector, Nequi/Efectivo, Nu (entró/salió plata) y
  // cajita (agregar): migrados a js/modules/cuentas.js. ---

  // --- Avatar color picker (sheet "Nueva persona"): wiring migrado a
  // js/modules/prestado.js (junto a selColor(), que sí existe ahí).
  // Con deudores-personas.js cargado, este sheet nunca se muestra:
  // ese módulo sobrescribe openSheet() e intercepta 'nueva-persona'
  // antes de llegar al sheet real, redirigiendo al selector genérico
  // de Personas. Código muerto documentado, no borrado — ver detalle
  // en prestado.js y en auditoria-tecnica.md/CHANGELOG.md (2026-07-27).

  // --- mpSplitToggle / btn-add-split-row: migrados a js/modules/mesada.js ---

  // --- data-save-refresh inputs: use debounced save ---
  document.querySelectorAll('[data-save-refresh]').forEach(el => {
    el.addEventListener('input', () => debounceSave(600));
  });

  // --- Named input callbacks ---
  // gv_fuente: migrado a js/modules/gastos.js (su propio wiring).
  // mov_fuente: migrado a js/modules/prestado.js junto con el resto del
  // sheet "Registrar movimiento" — ver nota más arriba.
  // spPagarFuente/spPagarMonto: migrados a js/modules/spotify.js.
  // mpDestino/mpMonto, mpDebeWrap/mpQuedaDebiendo, mppDestino/mppMonto:
  // migrados a js/modules/mesada.js.
  // adMenuDest/adMenuMonto, nuRate, tr_origen/tr_destino/tr_monto:
  // migrados a js/modules/cuentas.js (su propio wiring).
}

/* ================================================================
   MEJORA 7: Validación inline en formularios
   ================================================================ */

function _markError(inputId, msgId, mensaje) {
  const el = document.getElementById(inputId);
  const msg = document.getElementById(msgId);
  if (el) { el.classList.add('input-error'); el.focus(); }
  if (msg) { msg.textContent = mensaje; msg.classList.add('visible'); }
  setTimeout(() => {
    if (el) el.classList.remove('input-error');
    if (msg) msg.classList.remove('visible');
  }, 3000);
}

// Override addGastoVar with inline validation
const _origAddGastoVar = addGastoVar;
addGastoVar = function() {
  const desc = document.getElementById('gv_desc').value.trim();
  const monto = parseMoney(document.getElementById('gv_monto').value) || 0;
  let valid = true;
  if (!desc) {
    _markError('gv_desc', 'gv_desc_err', 'La descripción es obligatoria');
    valid = false;
  }
  if (!monto) {
    _markError('gv_monto', 'gv_monto_err', 'Ingresa un monto mayor a 0');
    if (valid) valid = false; // only focus first error
  }
  if (!valid) return;
  _origAddGastoVar();
};

// Override addGastoFijo with inline validation
const _origAddGastoFijo = addGastoFijo;
addGastoFijo = function() {
  const n = document.getElementById('gf_n').value.trim();
  const m = parseMoney(document.getElementById('gf_m').value) || 0;
  let valid = true;
  if (!n) {
    _markError('gf_n', 'gf_n_err', 'El nombre es obligatorio');
    valid = false;
  }
  if (!m) {
    _markError('gf_m', 'gf_m_err', 'Ingresa un monto mayor a 0');
    if (valid) valid = false;
  }
  if (!valid) return;
  _origAddGastoFijo();
};

// La validación de addDeudor/confirmarMovimiento ya no vive acá como override:
// se integró directo en las funciones dentro de js/modules/prestado.js (ver
// docs/prestado.md) ahora que el módulo es autocontenido.

/* ================================================================
   MEJORA 4: Renderizado selectivo (evitar refresh total innecesario)
   ================================================================ */

// Track what actually needs re-rendering
const _dirty = new Set();

function markDirty(...sections) {
  sections.forEach(s => _dirty.add(s));
}

// Smarter saveAndRefresh - only refresh what changed
function saveAndRefresh() {
  save();
  refresh();
}

// MEJORA 6 (alerta de gasto alto en el hero): _checkGastoAlto() y su hook a
// refresh() migrados a js/modules/inicio.js — ver auditoria-tecnica.md.

/* ================================================================
   AÑADIR error msg spans al DOM (Mejora 7)
   ================================================================ */

function _injectErrorSpans() {
  const campos = [
    { inputId: 'gv_desc', errId: 'gv_desc_err' },
    { inputId: 'gv_monto', errId: 'gv_monto_err' },
    { inputId: 'gf_n', errId: 'gf_n_err' },
    { inputId: 'gf_m', errId: 'gf_m_err' },
    { inputId: 'np_nombre', errId: 'np_nombre_err' },
    { inputId: 'mov_monto', errId: 'mov_monto_err' },
    { inputId: 'sp_n', errId: 'sp_n_err' },
    { inputId: 'sp_m', errId: 'sp_m_err' },
  ];
  campos.forEach(({ inputId, errId }) => {
    const el = document.getElementById(inputId);
    if (!el || document.getElementById(errId)) return;
    const span = document.createElement('span');
    span.id = errId;
    span.className = 'field-error-msg';
    el.parentNode.insertBefore(span, el.nextSibling);
  });

  // Also add validation to addSpotify
  const _origAddSpotify = addSpotify;
  addSpotify = function() {
    const n = document.getElementById('sp_n').value.trim();
    const m = parseMoney(document.getElementById('sp_m').value) || 0;
    let valid = true;
    if (!n) {
      _markError('sp_n', 'sp_n_err', 'El nombre es obligatorio');
      valid = false;
    }
    if (!m) {
      _markError('sp_m', 'sp_m_err', 'Ingresa una cuota mayor a 0');
      if (valid) valid = false;
    }
    if (!valid) return;
    _origAddSpotify();
  };
}

// Módulo Encargos migrado a js/modules/encargos.js — ver docs/encargos.md.
// Carga acá y no más arriba (donde vivía antes) por el mismo motivo que
// Mesada: depende de crearSplitWidget() y diffRegistrarInstancia(), ya
// definidos en este punto del archivo. iniciales() se queda acá porque
// también la usa el sistema de Personas más abajo — no es exclusiva de
// Encargos. La integración con Personas (selector en "Nuevo encargo",
// hooks de perfil) vive aparte, en encargos-personas.js, cargada más
// abajo — ver el comentario de ese archivo.
