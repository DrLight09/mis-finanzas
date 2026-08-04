/* ═══════════════════════════════════════════════════════════════
   js/modules/spotify-personas.js

   Integración de Spotify con el sistema unificado de Personas
   (S.personas). "Envuelve" (monkeypatch) varias funciones de
   js/modules/spotify.js para agregarles el manejo del selector de
   personas, sin duplicar su lógica original — mismo patrón que ya
   existía inline en index.html para Encargos, Deudores y Mis deudas.

   ⚠️ ORDEN DE CARGA: este archivo debe cargarse DESPUÉS de:
     1. js/modules/spotify.js (envuelve sus funciones: openSheet ya
        redefinido por otros módulos, addSpotify, editarSpotify,
        guardarEditarSpotify, renderSpotify).
     2. openSheet() y el sistema de Personas (getPersona, iniciales,
        abrirSelPersona, _inyectarPersonaSheets), definidos más abajo
        en index.html.
   Por eso su <script src> vive en el lugar donde antes estaba el
   bloque "INTEGRACIÓN SPOTIFY ↔ PERSONAS" inline — no al principio
   del documento junto a spotify.js. Si en algún momento se ve un
   "ReferenceError" acá, lo primero a revisar es si algo movió este
   <script> más arriba de donde debería estar.
   ═══════════════════════════════════════════════════════════════ */


/* ═══════════════════════════════════════════════════════════════
   INTEGRACIÓN SPOTIFY ↔ PERSONAS
   Conecta el módulo Spotify con el sistema de personas para que
   los miembros del plan sean personas reales de S.personas.
   ═══════════════════════════════════════════════════════════════ */

let _spPersonaId = null;       // personaId seleccionado en "Agregar"
let _spEditPersonaId = null;   // personaId en "Editar"

/* ── Reemplazar campo de texto en sheet-spotify con selector de persona ── */
function _initSpotifyPersonaSelector() {
  const sheet = document.getElementById('sheet-spotify');
  if (!sheet || sheet._personaHook) return;
  sheet._personaHook = true;

  const spNEl = document.getElementById('sp_n');
  if (!spNEl) return;
  const ig = spNEl.closest('.ig');
  if (!ig) return;

  ig.innerHTML = `
    <label class="il">¿Quién es?</label>
    <div id="sp-persona-btn" ${Events.attr('spotify:abrirSelectorPersona')}
      style="width:100%;padding:12px 14px;background:var(--bg3);border:1.5px solid var(--border2);
      border-radius:var(--radius-sm);color:var(--text2);font-size:15px;font-family:'DM Sans',sans-serif;
      cursor:pointer;display:flex;align-items:center;gap:10px;min-height:48px;transition:border-color .2s;">
      <div id="sp-persona-avatar" class="avatar" style="width:28px;height:28px;font-size:10px;margin:0;display:none;flex-shrink:0;"></div>
      <span id="sp-persona-label">Seleccionar persona...</span>
      <svg style="margin-left:auto;flex-shrink:0;" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
    </div>
    <input type="hidden" id="sp_n" value="">`;
}

function _onSelPersonaSpotify(personaId) {
  const p = getPersona(personaId);
  if (!p) return;
  _spPersonaId = personaId;
  document.getElementById('sp_n').value = p.nombre;

  const btn = document.getElementById('sp-persona-btn');
  const lbl = document.getElementById('sp-persona-label');
  const av  = document.getElementById('sp-persona-avatar');
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

/* ── Reemplazar campo de texto en sheet-editar-spotify con selector ── */
function _initSpotifyEditPersonaSelector() {
  const sheet = document.getElementById('sheet-editar-spotify');
  if (!sheet || sheet._personaEditHook) return;
  sheet._personaEditHook = true;

  const spEditNEl = document.getElementById('sp_edit_n');
  if (!spEditNEl) return;
  const ig = spEditNEl.closest('.ig');
  if (!ig) return;

  ig.innerHTML = `
    <label class="il">¿Quién es?</label>
    <div id="sp-edit-persona-btn" ${Events.attr('spotify:onClickEditPersonaBtn')}
      style="width:100%;padding:12px 14px;background:var(--bg3);border:1.5px solid var(--border2);
      border-radius:var(--radius-sm);color:var(--text2);font-size:15px;font-family:'DM Sans',sans-serif;
      cursor:pointer;display:flex;align-items:center;gap:10px;min-height:48px;transition:border-color .2s;">
      <div id="sp-edit-persona-avatar" class="avatar" style="width:28px;height:28px;font-size:10px;margin:0;display:none;flex-shrink:0;"></div>
      <span id="sp-edit-persona-label">Seleccionar persona...</span>
      <svg id="sp-edit-persona-chevron" style="margin-left:auto;flex-shrink:0;" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
    </div>
    <div id="sp-edit-persona-hint" style="font-size:11px;color:var(--text3);margin-top:5px;display:none;">Para asignarle este cobro a otra persona, eliminá este integrante y agregá uno nuevo — así el historial no se mezcla entre los dos.</div>
    <input type="hidden" id="sp_edit_n" value="">`;
}

// Si la persona editada ya está vinculada a alguien (personaId), el botón queda
// bloqueado: cambiar de persona a mitad de camino es justo lo que causaba
// desincronizaciones. Para eso ya existe un camino simple y confiable: eliminar
// este integrante y agregar uno nuevo (ver hint debajo del botón).
let _spEditPersonaLocked = false;
function _onClickSpEditPersonaBtn() {
  if (_spEditPersonaLocked) return;
  _abrirSelPersonaSpotifyEdit();
}

let _spEditPersonaPickerAbierto = false;    // se puso true al abrir el buscador en "Editar"
let _spEditPersonaPickerConfirmado = false; // se puso true solo si de verdad se eligió/creó alguien

// Wrapper del botón "¿Quién es?" en Editar: además de abrir el buscador, marca que
// se abrió, para poder detectar si se cierra sin confirmar ninguna selección nueva.
function _abrirSelPersonaSpotifyEdit() {
  _spEditPersonaPickerAbierto = true;
  abrirSelPersona(_onSelPersonaSpotifyEdit, '¿Quién es?');
}

function _onSelPersonaSpotifyEdit(personaId) {
  const p = getPersona(personaId);
  if (!p) return;
  _spEditPersonaId = personaId;
  _spEditPersonaPickerConfirmado = true;
  document.getElementById('sp_edit_n').value = p.nombre;

  const btn = document.getElementById('sp-edit-persona-btn');
  const lbl = document.getElementById('sp-edit-persona-label');
  const av  = document.getElementById('sp-edit-persona-avatar');
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

/* ── Hook en openSheet para inicializar los selectores ─────────── */
const _origOpenSheetSpotifyPersonas = openSheet;
openSheet = function(id) {
  if (id === 'spotify') {
    _inyectarPersonaSheets();
    _spPersonaId = null;
    _initSpotifyPersonaSelector();
    // Resetear UI del selector
    const lbl = document.getElementById('sp-persona-label');
    const av  = document.getElementById('sp-persona-avatar');
    const btn = document.getElementById('sp-persona-btn');
    if (lbl) { lbl.textContent = 'Seleccionar persona...'; lbl.style.color = 'var(--text2)'; }
    if (av)  av.style.display = 'none';
    if (btn) btn.style.borderColor = 'var(--border2)';
    const spN = document.getElementById('sp_n');
    if (spN) spN.value = '';
  }
  if (id === 'editar-spotify') {
    _inyectarPersonaSheets();
    _initSpotifyEditPersonaSelector();
  }
  _origOpenSheetSpotifyPersonas.apply(this, arguments);
};

/* ── Hook en addSpotify para guardar personaId ──────────────────── */
const _origAddSpotifyPersonas = addSpotify;
addSpotify = function() {
  // Validar que se seleccionó una persona (ya que sp_n es ahora input oculto)
  const spN = document.getElementById('sp_n');
  if (spN && !spN.value.trim()) {
    const btn = document.getElementById('sp-persona-btn');
    if (btn) {
      btn.style.borderColor = 'var(--red)';
      setTimeout(() => { if (btn) btn.style.borderColor = 'var(--border2)'; }, 2000);
    }
    toast('Seleccioná una persona', 'err');
    return;
  }
  const pId = _spPersonaId;
  if (pId && (S.spotifyPersonas||[]).some(x=>x.personaId===pId)) {
    toast('Esta persona ya está agregada en Spotify','err');
    return;
  }
  _origAddSpotifyPersonas.apply(this, arguments);
  // Asignar personaId al último spotifyPersona creado
  if (pId && S.spotifyPersonas && S.spotifyPersonas.length) {
    const last = S.spotifyPersonas[S.spotifyPersonas.length - 1];
    if (last && !last.personaId) {
      last.personaId = pId;
      // Sincronizar nombre con la persona
      const p = getPersona(pId);
      if (p) last.nombre = p.nombre;
      save();
    }
  }
  _spPersonaId = null;
};

/* ── Hook en editarSpotify para pre-cargar la persona vinculada ─── */
const _origEditarSpotifyPersonas = editarSpotify;
editarSpotify = function(i) {
  _origEditarSpotifyPersonas.apply(this, arguments);
  const sp = (S.spotifyPersonas || [])[i];
  if (!sp) return;
  _spEditPersonaId = sp.personaId || null;
  _spEditPersonaLocked = !!sp.personaId;
  // Pre-cargar UI del selector tras abrir el sheet
  setTimeout(() => {
    _initSpotifyEditPersonaSelector();
    const btn = document.getElementById('sp-edit-persona-btn');
    const chevron = document.getElementById('sp-edit-persona-chevron');
    const hint = document.getElementById('sp-edit-persona-hint');
    if (sp.personaId) {
      const p = getPersona(sp.personaId);
      if (p) _onSelPersonaSpotifyEdit(sp.personaId);
      // Bloqueado: ya hay una persona vinculada — se ve como texto, no como control
      if (btn) { btn.style.cursor = 'default'; btn.style.background = 'var(--bg2)'; }
      if (chevron) chevron.style.display = 'none';
      if (hint) hint.style.display = 'block';
    } else {
      // Rellenar con el nombre directo si no tiene personaId
      const lbl = document.getElementById('sp-edit-persona-label');
      const spEditN = document.getElementById('sp_edit_n');
      if (lbl && sp.nombre) { lbl.textContent = sp.nombre; lbl.style.color = 'var(--text)'; }
      if (btn && sp.nombre) btn.style.borderColor = 'var(--accent)';
      if (spEditN) spEditN.value = sp.nombre || '';
      // Sin vínculo todavía: queda disponible para elegir/crear la persona una vez
      if (btn) { btn.style.cursor = 'pointer'; btn.style.background = 'var(--bg3)'; }
      if (chevron) chevron.style.display = '';
      if (hint) hint.style.display = 'none';
    }
    // Resetear banderas DESPUÉS de precargar: mostrar el estado actual no cuenta
    // como una selección nueva confirmada por el usuario.
    _spEditPersonaPickerAbierto = false;
    _spEditPersonaPickerConfirmado = false;
  }, 80);
};

/* ── Hook en guardarEditarSpotify para guardar personaId ────────── */
const _origGuardarEditarSpotifyPersonas = guardarEditarSpotify;
guardarEditarSpotify = function() {
  // Si se abrió el buscador de "¿Quién es?" pero se cerró sin confirmar ninguna
  // selección (ni elegir a alguien de la lista, ni crear una persona nueva), el
  // input oculto sigue con el nombre anterior — avisar en vez de guardarlo en silencio.
  if (_spEditPersonaPickerAbierto && !_spEditPersonaPickerConfirmado) {
    const spActual = (S.spotifyPersonas || [])[_spEditIdx];
    toast(`No se seleccionó una persona nueva — se mantuvo a "${spActual ? escHtml(spActual.nombre) : 'la persona anterior'}"`, 'err', 4000);
  }
  // Capturar idx ANTES de llamar al original (que lo pone a null)
  const idxAntes = _spEditIdx;
  // Si se vinculó (por primera vez) a una persona que ya está usada por OTRO integrante
  // de Spotify, bloquear — mismo criterio que ya aplica en addSpotify.
  if (_spEditPersonaId) {
    const yaUsadaPorOtro = (S.spotifyPersonas || []).some((x, idx) => idx !== idxAntes && x.personaId === _spEditPersonaId);
    if (yaUsadaPorOtro) {
      toast('Esta persona ya está agregada en Spotify', 'err');
      return;
    }
  }
  _origGuardarEditarSpotifyPersonas.apply(this, arguments);
  // Asignar personaId al spotifyPersona editado (si se confirmó una selección nueva)
  if (idxAntes !== null && S.spotifyPersonas && S.spotifyPersonas[idxAntes]) {
    const sp = S.spotifyPersonas[idxAntes];
    if (_spEditPersonaId) {
      sp.personaId = _spEditPersonaId;
    }
    // Sincronización final: si el registro sigue vinculado a una persona (personaId,
    // ya sea la que había antes o la recién elegida), el nombre SIEMPRE se resuelve
    // desde ese vínculo — nunca se deja el texto crudo que haya quedado en el campo
    // oculto. Así nombre y personaId no pueden quedar desincronizados, así falle
    // silenciosamente la confirmación del buscador de personas.
    if (sp.personaId) {
      sp.nombre = spNombreDe(sp);
    }
    save();
    refresh();
  }
  _spEditPersonaId = null;
  _spEditPersonaPickerAbierto = false;
  _spEditPersonaPickerConfirmado = false;
};

/* ── Hook en renderSpotify para aplicar color de persona ─────────── */
const _origRenderSpotifyPersonas = renderSpotify;
renderSpotify = function() {
  _origRenderSpotifyPersonas.apply(this, arguments);
  // Aplicar color y nombre correcto a cada avatar del listado Spotify
  const lista = document.getElementById('spotifyList');
  if (!lista) return;
  const p = S.spotifyPersonas || [];
  // Ordenar igual que en renderSpotify
  const pOrdenado = [...p].map((x, i) => ({ ...x, _origIdx: i })).sort((a, b) => {
    const far = 99999;
    const dA = a.proximoPago ? Math.ceil((new Date(a.proximoPago + 'T00:00:00') - new Date()) / 86400000) : far;
    const dB = b.proximoPago ? Math.ceil((new Date(b.proximoPago + 'T00:00:00') - new Date()) / 86400000) : far;
    return dA - dB;
  });
  const rows = lista.querySelectorAll('.sp-row');
  rows.forEach((row, idx) => {
    const sp = pOrdenado[idx];
    if (!sp || !sp.personaId) return;
    const persona = getPersona(sp.personaId);
    if (!persona) return;
    const av = row.querySelector('.avatar');
    if (av) {
      const color = persona.color || '#60b0f0';
      av.style.background = color + '22';
      av.style.color = color;
      av.style.border = '1.5px solid ' + color + '44';
      av.textContent = iniciales(persona.nombre);
    }
    // Actualizar nombre si cambió
    const nameEl = row.querySelector('.row-name');
    if (nameEl) nameEl.textContent = persona.nombre;
  });
};

/* ═══════════════════════════════════════════════════════════════
   REGISTRO DE EVENTOS (acciones propias de la integración con
   Personas — el resto vive en spotify.js)
   ═══════════════════════════════════════════════════════════════ */

Events.registerAll('spotify', {
  abrirSelectorPersona: () => abrirSelPersona(_onSelPersonaSpotify, '¿Quién es?'),
  onClickEditPersonaBtn: _onClickSpEditPersonaBtn,
});
