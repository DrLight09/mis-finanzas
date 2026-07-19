/* ═══════════════════════════════════════════════════════════════
   js/modules/encargos-personas.js

   Integración de Encargos con el Sistema de Personas (S.personas):
   selector de persona en "Nuevo encargo", el hook que exige y
   asigna personaId al crear, y los botones/avatares de "ver perfil"
   en la lista y en el detalle de un encargo. Ver docs/encargos.md.

   Se carga aparte de js/modules/encargos.js — y más abajo en
   index.html, no junto al resto de Encargos — porque depende de
   getPersona(), abrirSelPersona(), PERSONA_COLORES y
   _inyectarPersonaSheets(), que recién existen más adelante en el
   archivo. Mismo motivo y mismo patrón que spotify-personas.js.

   El bloque "Nueva persona de Préstamos también usa S.personas" que
   estaba intercalado entre estas dos secciones en el índice original
   es de Deudores, no de Encargos — se quedó en index.html tal cual,
   sin tocar (Deudores todavía no se migró; ver plan-migracion-personas.md).
   ═══════════════════════════════════════════════════════════════ */

function _irAEncargo(encargoId) {
  document.getElementById('sheet-perfil-persona').classList.remove('open');
  setTimeout(() => { showScreen('encargos'); abrirEncargoDetalle(encargoId); }, 180);
}
/* ═══════════════════════════════════════════════════════════════
   INTEGRACIÓN: Nuevo encargo usa selector de persona
   ═══════════════════════════════════════════════════════════════ */
let _nuevoEncargoPersonaId = null;

function _initNuevoEncargoPersonaSelector() {
  const sheet = document.getElementById('sheet-nuevo-encargo');
  if (!sheet || sheet._personaHook) return;
  sheet._personaHook = true;

  // Reemplazar el campo de texto "enc_nombre" con un selector de persona
  const encNombreEl = document.getElementById('enc_nombre');
  if (!encNombreEl) return;
  const ig = encNombreEl.closest('.ig');
  if (!ig) return;

  ig.innerHTML = `
    <label class="il">¿De quién es la plata?</label>
    <div id="enc-persona-btn" data-action="encargos:seleccionarPersonaNueva"
      style="width:100%;padding:12px 14px;background:var(--bg3);border:1.5px solid var(--border2);
      border-radius:var(--radius-sm);color:var(--text2);font-size:15px;font-family:'DM Sans',sans-serif;
      cursor:pointer;display:flex;align-items:center;gap:10px;min-height:48px;transition:border-color .2s;">
      <div id="enc-persona-avatar" class="avatar" style="width:28px;height:28px;font-size:10px;margin:0;display:none;flex-shrink:0;"></div>
      <span id="enc-persona-label">Seleccionar persona...</span>
      <svg style="margin-left:auto;flex-shrink:0;" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
    </div>
    <input type="hidden" id="enc_nombre" value="">`;
}

function _onSelPersonaNuevoEncargo(personaId) {
  const p = getPersona(personaId);
  if (!p) return;
  _nuevoEncargoPersonaId = personaId;
  document.getElementById('enc_nombre').value = p.nombre;

  const btn = document.getElementById('enc-persona-btn');
  const lbl = document.getElementById('enc-persona-label');
  const av = document.getElementById('enc-persona-avatar');
  if (btn) btn.style.borderColor = 'var(--accent)';
  if (lbl) { lbl.textContent = p.nombre; lbl.style.color = 'var(--text)'; }
  if (av) {
    av.style.display = 'flex';
    av.style.background = (p.color || '#60b0f0') + '22';
    av.style.color = p.color || '#60b0f0';
    av.style.borderColor = (p.color || '#60b0f0') + '44';
    av.textContent = iniciales(p.nombre);
  }
}

/* ── Hook en openSheet para inicializar el selector ───────────── */
const _origOpenSheetPersonas = openSheet;
openSheet = function(id) {
  if (id === 'nuevo-encargo') {
    _inyectarPersonaSheets();
    _nuevoEncargoPersonaId = null;
    // Inicializar el selector después de que el sheet sea visible
    setTimeout(_initNuevoEncargoPersonaSelector, 30);
    // Resetear UI del selector
    setTimeout(() => {
      const lbl = document.getElementById('enc-persona-label');
      const av = document.getElementById('enc-persona-avatar');
      const btn = document.getElementById('enc-persona-btn');
      if (lbl) { lbl.textContent = 'Seleccionar persona...'; lbl.style.color = 'var(--text2)'; }
      if (av) av.style.display = 'none';
      if (btn) btn.style.borderColor = 'var(--border2)';
      const encNombreEl = document.getElementById('enc_nombre');
      if (encNombreEl) encNombreEl.value = '';
    }, 50);
  }
  _origOpenSheetPersonas.apply(this, arguments);
};

/* ── Hook en crearEncargo para exigir y guardar personaId ───────── */
const _origCrearEncargo = crearEncargo;
crearEncargo = function() {
  // personaId es obligatorio: no debe existir un encargo sin persona vinculada.
  const pId = _nuevoEncargoPersonaId;
  if (!pId) { toast('Selecciona una persona', 'err'); return; }
  _origCrearEncargo.apply(this, arguments);
  // Asignar personaId al último encargo creado
  if (pId && S.encargos && S.encargos.length) {
    const last = S.encargos[S.encargos.length - 1];
    if (last && !last.personaId) {
      last.personaId = pId;
      // También asegurar nombre sincronizado
      const p = getPersona(pId);
      if (p) last.nombre = p.nombre;
      save();
    }
  }
  _nuevoEncargoPersonaId = null;
};
/* ═══════════════════════════════════════════════════════════════
   BOTÓN DE PERFIL EN LISTA DE ENCARGOS Y DEUDORES
   ═══════════════════════════════════════════════════════════════ */

// Agregar botón "perfil" al avatar del encargo en la lista
const _origRenderEncargosList = renderEncargosList;
renderEncargosList = function() {
  _origRenderEncargosList.apply(this, arguments);
  // Agregar mini botón perfil en cada card de encargo
  const lista = document.getElementById('encargosList');
  if (!lista) return;
  (S.encargos || []).forEach(enc => {
    if (!enc.personaId) return;
    const card = lista.querySelector(`[data-encargo-id="${enc.id}"]`);
    if (!card) return;
    const av = card.querySelector('.avatar');
    if (av && !av._perfilHook) {
      av._perfilHook = true;
      av.title = 'Ver perfil';
      av.style.cursor = 'pointer';
      av.addEventListener('click', e => {
        e.stopPropagation();
        abrirPerfilPersona(enc.personaId);
      });
      // Aplicar color de persona
      const p = getPersona(enc.personaId);
      if (p) {
        av.style.background = (p.color || '#60b0f0') + '1a';
        av.style.color = p.color || '#60b0f0';
        av.style.borderColor = (p.color || '#60b0f0') + '33';
      }
    }
  });
};

// Agregar botón de perfil al header del detalle de encargo
const _origAbrirEncargoDetallePersonas = abrirEncargoDetalle;
abrirEncargoDetalle = function(id) {
  _origAbrirEncargoDetallePersonas.apply(this, arguments);
  const enc = getEncargo(id);
  if (!enc || !enc.personaId) return;
  const p = getPersona(enc.personaId);
  if (!p) return;
  // Aplicar color de la persona al avatar del detalle
  const av = document.getElementById('encargoAvatar');
  if (av) {
    av.style.background = (p.color || '#60b0f0') + '22';
    av.style.color = p.color || '#60b0f0';
    av.style.borderColor = (p.color || '#60b0f0') + '44';
    // Hacer clickeable para abrir perfil
    av.onclick = () => abrirPerfilPersona(p.id);
    av.title = 'Ver perfil de ' + p.nombre;
    av.style.cursor = 'pointer';
  }
  // Agregar chip de "Ver perfil" bajo el nombre si no existe
  const nombreEl = document.getElementById('encargoNombreDet');
  if (nombreEl && !document.getElementById('enc-det-perfil-chip')) {
    const chip = document.createElement('button');
    chip.id = 'enc-det-perfil-chip';
    chip.type = 'button';
    chip.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" style="width:12px;height:12px;fill:currentColor;vertical-align:middle;"><path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm2-3a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm4 8c0 1-1 1-1 1H3s-1 0-1-1 1-4 6-4 6 3 6 4zm-1-.004c-.001-.246-.154-.986-.832-1.664C11.516 10.68 10.029 10 8 10c-2.029 0-3.516.68-4.168 1.332-.678.678-.83 1.418-.832 1.664h10z"/></svg> Ver perfil completo';
    chip.style.cssText = 'font-size:10px;color:var(--text3);background:none;border:none;cursor:pointer;font-family:"DM Mono",monospace;padding:0;margin-top:2px;display:block;';
    chip.addEventListener('click', () => abrirPerfilPersona(p.id));
    nombreEl.after(chip);
  } else if (document.getElementById('enc-det-perfil-chip')) {
    const chip = document.getElementById('enc-det-perfil-chip');
    chip.onclick = () => abrirPerfilPersona(p.id);
  }
};

/* ── Registro de eventos ──────────────────────────────────────── */
function _encAbrirSelectorPersonaNueva() { abrirSelPersona(_onSelPersonaNuevoEncargo); }
Events.on('encargos:seleccionarPersonaNueva', _encAbrirSelectorPersonaNueva);
