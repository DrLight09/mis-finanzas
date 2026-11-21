// js/core/eventos-base.js
//
// Cableado de eventos del esqueleto de la app (nav inferior, botón +, diálogos, hojas…) que no pertenece a ningún módulo de dominio,
// y el enlace de los inputs marcados con data-s-bind (cuota de Mesada, costo de Spotify) hacia S.
// Los listeners de cada módulo viven en su propio archivo (Events.registerAll / data-action).

function _initEventListeners() {
  // --- Categorías: eliminar — migrado a data-action="config:eliminarCat" (js/modules/configuracion.js), ya no necesita delegado propio ---

  // --- Navegación bottom nav ---
  document.querySelectorAll('.nav-item[data-screen]').forEach(btn => {
    btn.addEventListener('click', () => showScreen(btn.dataset.screen));
  });

  // --- Menú lateral (solo se ve en PC, ver css/pc.css y docs/version-pc.md): mismos destinos que la barra inferior ---
  document.querySelectorAll('.menu-lateral-item[data-screen]').forEach(btn => {
    btn.addEventListener('click', () => showScreen(btn.dataset.screen));
  });

  // --- Atajo de teclado de PC: Ctrl/Cmd + K abre la búsqueda global (mismo botón que el de la cabecera) ---
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'k') return;
    if (typeof window.matchMedia !== 'function' || !window.matchMedia('(min-width: 900px)').matches) return;
    const btnBuscar = document.getElementById('btn-buscar-global');
    if (!btnBuscar) return;
    e.preventDefault();
    btnBuscar.click();
  });

  // --- Esc cierra la hoja de arriba si tiene botón X (las de PC): mismo cierre que la X. Con un diálogo de confirmación abierto no hace nada ---
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    const dialogo = document.getElementById('dialog-overlay');
    if (dialogo && dialogo.classList.contains('open')) return;
    const id = _sheetStack[_sheetStack.length - 1];
    if (!id || !document.querySelector('#sheet-' + id + ' .sheet-x')) return;
    e.preventDefault();
    closeSheet(id);
  });

  // --- Teclado dentro de una hoja abierta: Tab no se escapa de la hoja de arriba (es modal) ---
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const id = _sheetStack[_sheetStack.length - 1];
    const hoja = id && document.querySelector('#sheet-' + id + ' .sheet');
    if (!hoja) return;
    const dialogo = document.getElementById('dialog-overlay');
    if (dialogo && dialogo.classList.contains('open')) return;
    const foco = [...hoja.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
      .filter(x => x.offsetParent !== null || x === document.activeElement);
    if (!foco.length) { e.preventDefault(); hoja.focus(); return; }
    const primero = foco[0], ultimo = foco[foco.length - 1], actual = document.activeElement;
    if (e.shiftKey && (actual === primero || actual === hoja || !hoja.contains(actual))) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && (actual === ultimo || actual === hoja || !hoja.contains(actual))) { e.preventDefault(); primero.focus(); }
  });

  // --- Lo clicable que no es un botón (tarjetas de acción, filas con data-action) también se alcanza y se activa con el teclado ---
  // Se marca con role="button" + tabindex="0" al aparecer (incluido lo que pintan los módulos después) y Enter / Espacio lo activan.
  // Un elemento que contiene botones/enlaces/campos NO puede ser role="button" (interactivos anidados): ahí solo se le da tabindex y Enter /
  // Espacio lo activan igual. Si no tiene texto ni nombre (p. ej. una muestra de color) se le da uno para los lectores de pantalla.
  const _SEL_CLICABLE_NO_BOTON = '[data-action]:not(button):not(a):not(input):not(select):not(textarea):not([data-teclado]), .action-card:not([data-teclado])';
  const _SEL_INTERACTIVO = 'button,a[href],input,select,textarea,[data-action]';
  const _volverBoton = (el) => {
    el.setAttribute('data-teclado', '1');
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    if (el.hasAttribute('role') || el.querySelector(_SEL_INTERACTIVO)) return;
    el.setAttribute('role', 'button');
    if (!el.textContent.trim() && !el.hasAttribute('aria-label') && !el.hasAttribute('title')) {
      el.setAttribute('aria-label', el.dataset.color ? 'Color ' + el.dataset.color : 'Opción');
    }
  };
  const _marcarClicables = (raiz) => {
    if (!raiz || raiz.nodeType !== 1) return;
    if (raiz.matches(_SEL_CLICABLE_NO_BOTON)) _volverBoton(raiz);
    raiz.querySelectorAll(_SEL_CLICABLE_NO_BOTON).forEach(_volverBoton);
  };
  _marcarClicables(document.body);
  new MutationObserver(muts => muts.forEach(m => m.addedNodes.forEach(_marcarClicables))).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('keydown', (e) => {
    if ((e.key !== 'Enter' && e.key !== ' ') || e.defaultPrevented) return;
    const el = e.target;
    if (!el || !el.hasAttribute || !el.hasAttribute('data-teclado')) return; // solo si el foco está en el propio elemento, no en un botón de dentro
    e.preventDefault();
    el.click();
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
  const menuAgregarDinero = document.getElementById('menu-agregar-dinero');
  if (menuAgregarDinero) menuAgregarDinero.addEventListener('click', () => { closeSheet('menu'); openSheet('agregar-dinero-menu'); });

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
  // Crédito — tarjetas-credito.js no referencia ninguno de estos ids, así
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

  // --- mesadaPagoSplitToggle / btn-add-split-row: migrados a js/modules/mesada.js ---

  // --- Inputs que escriben directo en S (data-s-bind) ---
  // S es la única fuente de verdad: el input actualiza S en cada cambio y luego se
  // guarda con debounce. save() ya no lee estos campos del DOM.
  _bindInputsAS();

  // --- Named input callbacks ---
  // gv_fuente: migrado a js/modules/gastos.js (su propio wiring).
  // mov_fuente: migrado a js/modules/prestado.js junto con el resto del
  // sheet "Registrar movimiento" — ver nota más arriba.
  // spPagarFuente/spPagarMonto: migrados a js/modules/spotify.js.
  // mesadaPagoDestino/mesadaPagoMonto, mesadaPagoDebeWrap/mesadaPagoQuedaDebiendo, mesadaPagoPendienteDestino/mesadaPagoPendienteMonto:
  // migrados a js/modules/mesada.js.
  // agregarDineroMenuDestino/agregarDineroMenuMonto, nuRate, tr_origen/tr_destino/tr_monto:
  // migrados a js/modules/cuentas.js (su propio wiring).
}

// Cuota de Mesada del año visible y costo de Spotify. Solo se graba una cuota explícita
// si difiere de la heredada (_getCuotaAnio): si no, escribir el valor «congelaría» el
// fallback de un año anterior y rompería la herencia hacia años futuros.
function _bindInputsAS(){
  document.querySelectorAll('[data-s-bind]').forEach(el => {
    el.addEventListener('input', () => {
      const bind = el.getAttribute('data-s-bind');
      if (bind === 'spotifyCosto') {
        S.spotify.costo = parseMoney(el.value) || 0;
      } else if (bind.startsWith('cuota:')) {
        const parent = bind.split(':')[1];
        const anio = S.mesadaAnio || new Date().getFullYear();
        const v = el.value.trim() ? parseMoney(el.value) : 0;
        if (v && v !== _getCuotaAnio(parent, anio)) S.mesadas[parent].cuotas[String(anio)] = v;
      }
      debounceSave(600);
    });
  });
}
