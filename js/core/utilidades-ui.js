// js/core/utilidades-ui.js
//
// Utilidades de interfaz compartidas: Reversibles, debounceSave, estados vacíos, filaMovimiento, pedirPinAntesDe, mostrarSi y los guards de carga lazy de cuentas.js.
// Parte del antiguo core-state.js (dividido por responsabilidad). Clásico (<script defer>), sin type="module": sus globales son
// léxicos de script clásico. El ORDEN de carga en index.html es el de esta lista: estado → cuentas-fuentes → persistencia →
// patrimonio → ingresos → dialogos → utilidades-ui → refresh.

var Reversibles = (() => {
  const _reg = new Map();
  return {
    registrar(def) { [].concat(def.tipo).forEach(t => _reg.set(t, def)); },
    tiene(tipo) { return _reg.has(tipo); },
    async proteger(tipo, ref, ctx) {
      const def = _reg.get(tipo);
      const p = def && def.proteccion ? def.proteccion(ref, ctx) : null;
      if (!p) return { ok: true, confirmado: false };
      const nivel = nivelAntiguedadMovimiento(p.fecha, p.ops, p.modulo);
      if (nivel === 'bloqueado') { await avisarMovimientoBloqueado(); return { ok: false, confirmado: false }; }
      if (nivel === 'viejo') {
        const si = p.dialogo ? await p.dialogo() : await confirmarBorrarMovimientoViejo(p.nombre, p.monto, p.direccion, p.campo || 'saldo');
        return { ok: !!si, confirmado: !!si };
      }
      return { ok: true, confirmado: false };
    }
  };
})();

/* ---- DEBOUNCE SAVE ---- */
var _saveTimer=null;
// Flag: true solo si este dispositivo hizo cambios reales en esta sesión.
// Evita que un dispositivo que solo abrió y leyó datos pise Firestore al cerrar.
window._locallyModified = false;
function debounceSave(delay=800){
  window._locallyModified = true; // El usuario tocó algo en este dispositivo
  clearTimeout(_saveTimer);
  _saveTimer=setTimeout(()=>saveAndRefresh(),delay);
  // Exponer en window para que el módulo Firebase (scope de módulo) pueda cancelarlo en signOut
  window._debounceTimer=_saveTimer;
}

/* ---- GUARDADO DE EMERGENCIA al cerrar pestaña ---- */
// Evita pérdida de datos si el usuario cierra antes de que el debounce dispare.
window.addEventListener('beforeunload', function() {
  if (!window._dataLoaded) return; // Nunca guardar si los datos no se cargaron
  // CRÍTICO: Solo guardar si este dispositivo realmente modificó algo en esta sesión.
  // Si el dispositivo solo abrió y leyó datos (sin editar), NO sobreescribir Firestore.
  // Esto evita que abrir la app en PC/otra pestaña con datos desactualizados pise
  // los cambios recientes hechos desde otro dispositivo (ej: celular todo el día).
  if (!window._locallyModified) return;
  // Siempre intentar guardar al cerrar si hay datos cargados, haya o no timer pendiente
  if (window._fbUser && window._fb && window.S) {
    try {
      clearTimeout(_saveTimer); _saveTimer = null;
      clearTimeout(window._fbSaveTimer); window._fbSaveTimer = null;
      const {db, doc, setDoc} = window._fb;
      const data = JSON.parse(JSON.stringify(window.S));
      const closingTs = Date.now();
      // Persistir el timestamp ANTES de cerrar para que al reabrir
      // la página sepa que "yo fui el último en guardar" y no deje
      // que un snapshot antiguo de otro dispositivo pise estos datos.
      try { localStorage.setItem('mf_lastSavedAt', String(closingTs)); } catch(_){}
      window._lastSavedAt = closingTs;
      // Al cerrar no se puede esperar una transacción: se escribe con la revisión siguiente. Si otro dispositivo guardó en medio,
      // el próximo guardado de ese dispositivo lo detecta como conflicto y no se pierde nada sin aviso.
      setDoc(doc(db,'usuarios',window._fbUser.uid,'data','finanzas'),
        {payload: JSON.stringify(data), updatedAt: closingTs, rev: (window._revNube || 0) + 1}
      ).catch(()=>{});
    } catch(e) {}
  }
});

/* ---- CATEGORÍAS PERSONALIZADAS, BACKUP JSON: migrado a js/modules/configuracion.js ---- */

/* ---- EMPTY STATES ACCIONABLES ---- */
// btnFn siempre usa el despachador central de eventos (js/core/events.js):
// {action, args}. La forma vieja que esta función aceptaba por compatibilidad
// hacia atrás (string con onclick="..." crudo, para Gastos/Tarjetas de
// crédito mientras migraban) se sacó esta sesión: se revisaron TODAS las
// llamadas a emptyState() en toda la app (gastos.js ×2, spotify.js ×1 — las
// únicas 3 que existen) y las 3 ya usaban la forma nueva. El comentario
// viejo había quedado desactualizado — Gastos ya había migrado sin que
// nadie lo actualizara. Se saca la rama entera (no solo el comentario) para
// que ningún módulo futuro pueda reintroducir un onclick inline acá por
// costumbre. Ver auditoria-tecnica.md #1 y CHANGELOG.md#infraestructura--seguridad.
const ICONO_VACIO_CUENTAS = '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v11a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2"/><circle cx="16" cy="14" r="1.2"/></svg>';
// ÚNICO estado vacío de la app. Dos formas, según el sitio:
//   emptyState(icon, title, sub, btnLabel, btnFn, opts)  bloque con icono, título, texto y botón opcional (listas y pantallas
//       completas: «Sin tarjetas», «Nadie te debe por ahora»). `icon`, `title` y `sub` se insertan como HTML (iconos SVG y entidades);
//       lo que venga del usuario hay que escaparlo antes. Las partes vacías no se dibujan. opts.compacto reduce el relleno (dentro de
//       una tarjeta o de un historial).
//   emptyInline(texto, opts)  una línea de aviso dentro de una tarjeta o historial («Sin movimientos aún»). El texto se ESCAPA aquí.
//       opts: centro (centrado), grande (feeds de pantalla: más aire), clase (extra, p. ej. 'card card-sm').
// Ningún módulo debe armar su propio <div class="...-vacio">: los tests lo vigilan (tests/estados-vacios.test.js).
function emptyState(icon, title, sub, btnLabel, btnFn, opts){
  const o = opts || {};
  let btnHtml = '';
  if (btnLabel && btnFn && btnFn.action) {
    btnHtml = `<button type="button" class="empty-state-btn" ${Events.attr(btnFn.action, ...(btnFn.args || []))}>${btnLabel}</button>`;
  }
  return `<div class="empty-state${o.compacto ? ' empty-state-compacto' : ''}">
    ${icon ? `<div class="empty-state-icon">${icon}</div>` : ''}
    ${title ? `<div class="empty-state-title">${title}</div>` : ''}
    ${sub ? `<div class="empty-state-sub">${sub}</div>` : ''}
    ${btnHtml}
  </div>`;
}
function emptyInline(texto, opts){
  const o = opts || {};
  const cls = 'empty-inline' + (o.centro ? ' empty-inline-centro' : '') + (o.grande ? ' empty-inline-grande' : '') + (o.clase ? ' ' + o.clase : '');
  return `<div class="${cls}">${escHtml(texto)}</div>`;
}

/* ---- FILA DE MOVIMIENTO COMPARTIDA ----
   Una sola plantilla para las filas de historial de Tarjetas, Encargos, Gastos y Cuentas (antes cada módulo
   armaba el mismo esqueleto a mano con sus propios envoltorios). Estructura: .gasto-item > .gasto-item-top
   (nombre + fecha | monto + acciones) > bloques de meta. El aspecto (borde, color) sigue siendo una clase
   que pasa el módulo en `clase` (tc-item-b-*, enc-item-b-*): nunca estilos en línea.
   Opciones: clase, attrs (atributos ya escapados, p. ej. data-mov-*), nombre, nombreClase, nombreExtra (html),
   sub, subClase, monto + montoClase (o montoHtml para un monto propio), acciones (html), antesMeta (html),
   meta (contenido de .gasto-item-meta; sin él no se dibuja), metaClase, despues (html). Va en el núcleo,
   igual que emptyState(): html/raw se resuelven al llamar. */
function botonEliminarFila(accion, args, titulo) {
  return html`<button type="button" class="btn-delete-hover" data-stop-propagation="true" ${raw(Events.attr(accion, ...(args || [])))} title="${titulo || 'Eliminar'}"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>`;
}

function filaMovimiento(o) {
  const nombreClase = o.nombreClase || 'row-name row-name-13';
  const monto = o.montoHtml !== undefined ? o.montoHtml : html`<span class="row-amount ${o.montoClase || ''}">${o.monto}</span>`;
  return html`<div class="gasto-item${o.clase ? ' ' + o.clase : ''}" ${raw(o.attrs || '')}>
    <div class="gasto-item-top">
      <div class="gasto-item-info">
        <div class="${nombreClase}">${o.nombre}${o.nombreExtra || ''}</div>
        <div class="row-sub${o.subClase ? ' ' + o.subClase : ''}">${o.sub}</div>
      </div>
      <div class="gasto-acciones">${monto}${o.acciones || ''}</div>
    </div>
    ${o.antesMeta || ''}${o.meta !== undefined ? html`<div class="gasto-item-meta${o.metaClase ? ' ' + o.metaClase : ''}">${o.meta}</div>` : ''}${o.despues || ''}
  </div>`;
}

// Segundo candado de las acciones destructivas (mejora 13): con PIN activo, vuelve a pedirlo ANTES de ejecutar la acción.
// Devuelve true si se puede seguir: no hay PIN (todo como antes) o se escribió el correcto; false si se canceló o con un PIN
// activo no se pudo verificar (módulo del PIN sin cargar): en ese caso no se ejecuta nada. Se llama justo después de la
// confirmación propia de cada acción: `if (!await pedirPinAntesDe('Para borrar todos los datos')) return;`
// Acciones que lo piden: borrarTodo, importar un backup, eliminar la cuenta, quitar el PIN y quitar la huella.
async function pedirPinAntesDe(motivo) {
  let hayPin = false;
  try { hayPin = !!localStorage.getItem('mf_pin'); } catch (e) { /* sin acceso a localStorage: no hay PIN que pedir */ }
  if (!hayPin) return true;
  if (typeof window._pinVerificar !== 'function') return false;
  const ok = await window._pinVerificar(motivo);
  if (!ok && typeof toast === 'function') toast('Acción cancelada', 'info');
  return ok;
}

// Muestra u oculta un elemento según el estado de la pantalla (JS, no CSS):
// lo usan los botones de pie de lista que sobran cuando el estado vacío ya
// trae su propio botón de acción (un solo botón por estado vacío).
function mostrarSi(el, visible) {
  if (el) el.style.display = visible ? '' : 'none';
}

// renderAttencion() migrada a js/modules/inicio.js — ver auditoria-tecnica.md.
// De paso se corrigió un caso más de .innerHTML sin escapar (spNombreDe()
// interpolado directo, mismo patrón ya visto 5 veces en otros módulos).

// ── Guards de carga bajo demanda para cuentas.js (FIX 2026-08-13) ──────────

/* ---- REFRESH: un registro en vez de una cadena de parches ----
   Antes `window.refresh` se envolvía a mano en inicio.js, encargos.js, actividad_reciente.js y (con hookGlobal) en otros cuatro
   archivos: un error en un parche cortaba a los siguientes y el resultado dependía del orden de carga. Ahora cada módulo registra su
   parte con Refresh.registrar(id, fn, { pantalla, orden }) y refresh() las recorre en orden, cada una en su try/catch con log:
   una que falle no silencia a las demás.
     · id        — único: registrar otra vez el mismo id REEMPLAZA la anterior (un módulo lazy que se carga dos veces no se duplica).
     · pantalla  — opcional, 'encargos' o ['encargos','historial']: la parte solo corre si esa pantalla (#screen-<nombre>) está activa.
                   Es lo que permite no renderizar pantallas que nadie está viendo; sin `pantalla` corre siempre (como antes).
     · orden     — opcional (100 por defecto): menor corre antes; a igual orden, el orden de registro.
   El cuerpo de refresh() de siempre (hero, cuentas, listas) vive en _refreshNucleo() y corre primero. */

// «Sin dato» (reemplaza el guion largo «—» que se mostraba como texto copiable en tarjetas y estadísticas). Es un ícono SVG: no se
// selecciona ni se copia, hereda el color de la tarjeta y lleva aria-label para lectores de pantalla.
// En html`` va como raw(SIN_DATO); en una plantilla normal o en innerHTML, directo.
const SIN_DATO = '<svg class="sin-dato" role="img" aria-label="Sin datos" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="7" y1="12" x2="17" y2="12"/></svg>';
