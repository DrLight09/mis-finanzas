/* ═══════════════════════════════════════════════════════════════
   js/modules/prestado-personas.js

   Integración de Préstamos con S.personas: crear/vincular persona al
   agregar un deudor o una deuda, refrescar el detalle abierto cuando
   se edita desde el sheet global de Personas, navegación cruzada
   entre el perfil de una persona y su deudor/deuda asociada, y el
   sheet "Editar mi deuda".

   Carga acá y no junto al resto de Préstamos (js/modules/prestado.js,
   cargado mucho más arriba) porque depende de funciones de Personas
   —getPersona, abrirPerfilPersona, _inyectarPersonaSheets,
   _guardarEditarPersonaGlobal— recién definidas en este punto del
   documento. Mismo motivo exacto que spotify-personas.js y
   encargos-personas.js. Ver también docs/prestado.md.
   ═══════════════════════════════════════════════════════════════ */

function _irADeudor(deudorId) {
  document.getElementById('sheet-perfil-persona').classList.remove('open');
  setTimeout(() => { showScreen('prestamos'); abrirDeudor(deudorId); }, 180);
}

const _origAddDeudorPersonas = addDeudor;
addDeudor = function() {
  // Cuando se crea un deudor, también crear/vincular en S.personas
  const nombre = document.getElementById('np_nombre').value.trim();
  const color = typeof npColorSel !== 'undefined' ? npColorSel : '#60b0f0';
  if (!nombre) { _origAddDeudorPersonas.apply(this, arguments); return; }

  // Llamar al original primero (crea el deudor en S.deudores)
  _origAddDeudorPersonas.apply(this, arguments);

  // Vincular el deudor recién creado a S.personas
  const deudor = (S.deudores || []).find(d => d.nombre === nombre && !d.personaId);
  if (deudor) {
    let p = (S.personas || []).find(x => x.nombre.trim().toLowerCase() === nombre.toLowerCase());
    if (!p) {
      if (!S.personas) S.personas = [];
      p = { id: uid(), nombre, color: color, creadoEn: hoy() };
      S.personas.push(p);
    } else {
      p.color = color;
    }
    deudor.personaId = p.id;
    save();
  }
};

/* ── Hook: si el detalle de un deudor (Préstamos > me deben) está abierto */
/* y se guarda desde el sheet unificado "Editar persona", refrescar su    */
/* encabezado (nombre/avatar) para reflejar el cambio al instante. ────── */
const _origGuardarEditarPersonaGlobalDeudor = _guardarEditarPersonaGlobal;
_guardarEditarPersonaGlobal = function() {
  const idEditado = _editPersonaGlobalId;
  _origGuardarEditarPersonaGlobalDeudor.apply(this, arguments);
  const d = (S.deudores || []).find(x => x.id === deudorActualId);
  if (d && d.personaId === idEditado) {
    const detalle = document.getElementById('deudorDetalle');
    if (detalle && detalle.style.display !== 'none') abrirDeudor(deudorActualId);
  }
};


const _origCrearMiDeudaPersonas = crearMiDeuda;
crearMiDeuda = function() {
  const nombre = (document.getElementById('nd_nombre').value || '').trim();
  if (!nombre) { _origCrearMiDeudaPersonas.apply(this, arguments); return; }
  _origCrearMiDeudaPersonas.apply(this, arguments);
  // Vincular la misDeuda recién creada a S.personas (crear si no existe)
  const deuda = (S.misDeudas || []).find(d => d.nombre === nombre && !d.personaId);
  if (deuda) {
    if (!S.personas) S.personas = [];
    let p = S.personas.find(x => x.nombre.trim().toLowerCase() === nombre.toLowerCase());
    if (!p) {
      p = { id: uid(), nombre, color: deuda.color || '#f06868', creadoEn: hoy() };
      S.personas.push(p);
    } else {
      // Si ya existe persona con ese nombre, usar su color en la deuda
      deuda.color = p.color || deuda.color;
    }
    deuda.personaId = p.id;
    save();
  }
};

/* ── Abrir perfil desde una misDeuda (crea persona si no tiene) ── */
function _abrirPerfilDesdeMiDeuda(miDeudaId) {
  if (!miDeudaId) return;
  const d = (S.misDeudas || []).find(x => x.id === miDeudaId);
  if (!d) return;
  _inyectarPersonaSheets();
  if (d.personaId) {
    abrirPerfilPersona(d.personaId);
    return;
  }
  // Crear persona vinculada on-the-fly
  if (!S.personas) S.personas = [];
  let p = S.personas.find(x => x.nombre.trim().toLowerCase() === (d.nombre || '').toLowerCase());
  if (!p) {
    p = { id: uid(), nombre: d.nombre, color: d.color || '#f06868', creadoEn: hoy() };
    S.personas.push(p);
  }
  d.personaId = p.id;
  save();
  abrirPerfilPersona(p.id);
}

function _abrirPerfilDesdeMiDeudaActual() {
  _abrirPerfilDesdeMiDeuda(miDeudaActualId);
}

function _irAMiDeuda(miDeudaId) {
  const perfEl = document.getElementById('sheet-perfil-persona');
  if (perfEl) perfEl.classList.remove('open');
  setTimeout(() => {
    showScreen('prestamos');
    cambiarTabPrestamos('yo-debo');
    if (typeof abrirMiDeuda === 'function') setTimeout(() => abrirMiDeuda(miDeudaId), 60);
  }, 180);
}

/* ── Editar mi deuda ─────────────────────────────────────────────── */
const PERSONA_COLORES_MD = PERSONA_COLORES; // misma paleta unificada
window._miDeudaEditColor = null;

function editarMiDeudaActual() {
  if (!miDeudaActualId) return;
  const d = (S.misDeudas || []).find(x => x.id === miDeudaActualId);
  if (!d) return;
  // Usar el color real de la persona si está vinculada
  const _pEdit = d.personaId && typeof getPersona === 'function' ? getPersona(d.personaId) : null;
  window._miDeudaEditColor = (_pEdit && _pEdit.color) ? _pEdit.color : (d.color || PERSONA_COLORES[4]);
  const inp = document.getElementById('md_edit_nombre');
  if (inp) inp.value = d.nombre || '';
  _renderColorPicker('md_edit_colores', '_miDeudaEditColor');
  if (typeof openSheet === 'function') openSheet('editar-mi-deuda');
}

function _mdPickColor(c) {
  window._miDeudaEditColor = c;
  _renderColorPicker('md_edit_colores', '_miDeudaEditColor');
}

function guardarEditarMiDeuda() {
  if (!miDeudaActualId) return;
  const d = (S.misDeudas || []).find(x => x.id === miDeudaActualId);
  if (!d) return;
  const nombre = (document.getElementById('md_edit_nombre').value || '').trim();
  if (!nombre) { if (typeof toast === 'function') toast('Ingresa el nombre', 'err'); return; }
  const nuevoColor = window._miDeudaEditColor || d.color;
  d.nombre = nombre;
  d.color = nuevoColor;
  // Sincronizar en S.personas si está vinculada (persona es la fuente de verdad)
  if (d.personaId && typeof getPersona === 'function') {
    const p = getPersona(d.personaId);
    if (p) { p.nombre = nombre; p.color = nuevoColor; }
  }
  if (typeof save === 'function') save();
  if (typeof refresh === 'function') refresh();
  abrirMiDeuda(miDeudaActualId);
  if (typeof closeSheet === 'function') closeSheet('editar-mi-deuda');
  if (typeof toast === 'function') toast(nombre + ' actualizado', 'ok');
}

/* ═══════════════════════════════════════════════════════════════
   REGISTRO DE EVENTOS

   Reemplaza dos cosas:
   1. Los onclick="..." inline que llaman a estas funciones desde el
      HTML de Personas (perfil de persona, lista de "yo debo" en el
      perfil) — 2 sitios, convertidos a data-action en index.html.
   2. El hook `window.addEventListener('appDataLoaded', () => setTimeout(...))`
      que conectaba btn-editar-mi-deuda / btn-guardar-editar-mi-deuda
      con addEventListener + un flag `_mdHook` para no duplicar el
      listener. Ese patrón existía porque _initEventListeners() corre
      una sola vez y estos botones podían no estar en el DOM todavía
      en ese momento. Con Events (un único listener delegado en
      `document`, siempre activo) ese problema desaparece por
      completo: no importa cuándo aparezca el botón en el DOM, alcanza
      con que tenga el data-action correcto. Se puede borrar el hook
      entero, incluido el setTimeout de 300ms y el flag _mdHook.
   ═══════════════════════════════════════════════════════════════ */
Events.registerAll('prestado-personas', {
  irADeudor: _irADeudor,
  irAMiDeuda: _irAMiDeuda,
  abrirPerfilMiDeuda: _abrirPerfilDesdeMiDeuda,
  abrirPerfilMiDeudaActual: _abrirPerfilDesdeMiDeudaActual,
  editarMiDeudaActual: editarMiDeudaActual,
  guardarEditarMiDeuda: guardarEditarMiDeuda,
});
