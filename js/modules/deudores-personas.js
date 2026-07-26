/* ═══════════════════════════════════════════════════════════════
   js/modules/deudores-personas.js

   Integración "Deudores + Personas": mismo selector de persona
   (existente o nueva) en "Agregar persona" (Me deben) y en "Nueva
   deuda" (Yo debo), igual que ya funciona en Encargos y Spotify.

   Carga acá y no junto al resto de Préstamos (js/modules/prestado.js,
   cargado mucho más arriba) porque depende de funciones de Personas
   —getPersona, abrirSelPersona, _inyectarPersonaSheets— recién
   definidas en este punto del documento. Mismo motivo exacto que
   spotify-personas.js, encargos-personas.js y prestado-personas.js.
   Además envuelve `openSheet` y `crearMiDeuda` ya envueltos por
   prestado-personas.js, así que debe cargar después de ese archivo.
   Ver también docs/prestado.md.
   ═══════════════════════════════════════════════════════════════ */

/* ── Me deben: "Agregar persona" abre directamente el selector ─── */
function _onSelPersonaMeDeben(personaId) {
  const p = getPersona(personaId);
  if (!p) return;
  // Nota: una misma persona puede tener varias deudas separadas (por distintos
  // conceptos), así que NO se bloquea si ya existe un deudor con este personaId.
  if (!S.deudores) S.deudores = [];
  const d = { id: uid(), nombre: p.nombre, color: p.color || '#60b0f0', personaId: p.id, movimientos: [] };
  S.deudores.push(d);
  save(); refresh();
  toast(`${escHtml(p.nombre)} agregado/a`, 'ok');
  showScreen('prestamos');
  cambiarTabPrestamos('me-deben');
  abrirDeudor(d.id);
}

/* ── Yo debo: selector de persona dentro de "Nueva deuda" ───────── */
let _nuevaDeudaPersonaId = null;

function _initNuevaDeudaPersonaSelector() {
  const sheet = document.getElementById('sheet-nueva-deuda');
  if (!sheet || sheet._personaHook) return;
  sheet._personaHook = true;
  const ndNombreEl = document.getElementById('nd_nombre');
  if (!ndNombreEl) return;
  const ig = ndNombreEl.closest('.ig');
  if (!ig) return;
  ig.innerHTML = `
    <label class="il">¿A quién le debes?</label>
    <div id="nd-persona-btn"
      style="width:100%;padding:12px 14px;background:var(--bg3);border:1.5px solid var(--border2);
      border-radius:var(--radius-sm);color:var(--text2);font-size:15px;font-family:'DM Sans',sans-serif;
      cursor:pointer;display:flex;align-items:center;gap:10px;min-height:48px;transition:border-color .2s;">
      <div id="nd-persona-avatar" class="avatar" style="width:28px;height:28px;font-size:10px;margin:0;display:none;flex-shrink:0;"></div>
      <span id="nd-persona-label">Seleccionar persona...</span>
      <svg style="margin-left:auto;flex-shrink:0;" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
    </div>
    <input type="hidden" id="nd_nombre" value="">`;
  // Antes onclick="abrirSelPersona(_onSelPersonaNuevaDeuda)" inline — este bloque
  // solo se renderiza una vez (guardado por sheet._personaHook), así que alcanza
  // con adjuntar el listener una sola vez acá, igual que en splitAgregarRow.
  const ndBtn = document.getElementById('nd-persona-btn');
  if (ndBtn) ndBtn.addEventListener('click', () => abrirSelPersona(_onSelPersonaNuevaDeuda));
}

function _onSelPersonaNuevaDeuda(personaId) {
  const p = getPersona(personaId);
  if (!p) return;
  // ¿Ya existe una deuda registrada con esa persona?
  const existente = (S.misDeudas || []).find(d => d.personaId === personaId);
  if (existente) {
    closeSheet('nueva-deuda');
    toast(`Ya tienes una deuda registrada con ${escHtml(p.nombre)}`, 'info');
    showScreen('prestamos');
    cambiarTabPrestamos('yo-debo');
    setTimeout(() => abrirMiDeuda(existente.id), 200);
    return;
  }
  _nuevaDeudaPersonaId = personaId;
  document.getElementById('nd_nombre').value = p.nombre;
  const btn = document.getElementById('nd-persona-btn');
  const lbl = document.getElementById('nd-persona-label');
  const av = document.getElementById('nd-persona-avatar');
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

/* ── Hook en openSheet: 'nueva-persona' abre el selector directo;
     'nueva-deuda' inicializa su propio selector interno ────────── */
const _origOpenSheetMeDebenYoDebo = openSheet;
openSheet = function(id) {
  if (id === 'nueva-persona') {
    _inyectarPersonaSheets();
    abrirSelPersona(_onSelPersonaMeDeben);
    return;
  }
  if (id === 'nueva-deuda') {
    _inyectarPersonaSheets();
    _nuevaDeudaPersonaId = null;
    setTimeout(_initNuevaDeudaPersonaSelector, 30);
    setTimeout(() => {
      const lbl = document.getElementById('nd-persona-label');
      const av = document.getElementById('nd-persona-avatar');
      const btn = document.getElementById('nd-persona-btn');
      if (lbl) { lbl.textContent = 'Seleccionar persona...'; lbl.style.color = 'var(--text2)'; }
      if (av) av.style.display = 'none';
      if (btn) btn.style.borderColor = 'var(--border2)';
      const ndN = document.getElementById('nd_nombre');
      if (ndN) ndN.value = '';
    }, 50);
  }
  _origOpenSheetMeDebenYoDebo.apply(this, arguments);
};

/* ── Hook en crearMiDeuda: exigir persona seleccionada y usar su
     personaId real en vez de adivinar por coincidencia de nombre ── */
const _origCrearMiDeudaSelector = crearMiDeuda;
crearMiDeuda = function() {
  const ndN = document.getElementById('nd_nombre');
  if (ndN && !ndN.value.trim()) {
    const btn = document.getElementById('nd-persona-btn');
    if (btn) {
      btn.style.borderColor = 'var(--red)';
      setTimeout(() => { if (btn) btn.style.borderColor = 'var(--border2)'; }, 2000);
    }
    toast('Selecciona una persona', 'err');
    return;
  }
  const pId = _nuevaDeudaPersonaId;
  _origCrearMiDeudaSelector.apply(this, arguments);
  if (pId && S.misDeudas && S.misDeudas.length) {
    const last = S.misDeudas[S.misDeudas.length - 1];
    const p = getPersona(pId);
    if (last && p) {
      last.personaId = pId;
      last.nombre = p.nombre;
      last.color = p.color || last.color;
      save();
    }
  }
  _nuevaDeudaPersonaId = null;
};
