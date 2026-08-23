/* ═══════════════════════════════════════════════════════════════
   js/modules/personas.js

   Módulo Personas — libreta central de identidad compartida por
   Encargos, Préstamos ("Me deben" / "Yo debo") y Spotify.

   Este archivo es el NÚCLEO del sistema de Personas: modelo de datos
   (S.personas), pantalla "Personas" (lista + perfil), y los sheets
   compartidos de seleccionar/crear/editar persona.

   La integración específica de cada módulo con Personas vive aparte,
   en su propio archivo (mismo motivo que llevó a partir Spotify y
   Encargos en dos: dependen de funciones — getPersona, abrirSelPersona,
   _inyectarPersonaSheets — recién definidas acá, por eso cargan
   DESPUÉS de este archivo, no junto al resto de su módulo):
     - js/modules/encargos-personas.js
     - js/modules/spotify-personas.js
     - js/modules/prestado-personas.js

   Ver docs/personas.md para el resto de la documentación funcional.
   ═══════════════════════════════════════════════════════════════ */

/* ── COLORES DE AVATAR ─────────────────────────────────────────── */
const PERSONA_COLORES = [
  '#60b0f0', // azul cielo
  '#4090d8', // azul medio
  '#60d8f4', // cyan
  '#c8f060', // lima (accent)
  '#60d0b0', // menta
  '#50c878', // esmeralda
  '#f0b840', // ámbar
  '#f0d060', // amarillo
  '#f4a830', // naranja dorado
  '#f09060', // naranja
  '#f07040', // naranja intenso
  '#f06868', // rojo suave
  '#e84040', // rojo
  '#f04090', // rosa fuerte
  '#f0a0c0', // rosa claro
  '#c060f0', // morado
  '#b090f0', // lila
  '#8060d0', // violeta
  '#60a890', // teal oscuro
  '#90c0e0', // azul pastel
];



/* ── HELPERS ───────────────────────────────────────────────────── */
function getPersona(id) {
  return (S.personas || []).find(p => p.id === id);
}

function getPersonaNombre(id) {
  const p = getPersona(id);
  return p ? p.nombre : '—';
}

function getPersonaColor(id) {
  const p = getPersona(id);
  return p ? (p.color || '#60b0f0') : '#60b0f0';
}

// Datos vinculados a una persona
function getPersonaDatos(personaId) {
  const encargos = (S.encargos || []).filter(e => e.personaId === personaId);
  const deudores = (S.deudores || []).filter(d => d.personaId === personaId);
  const deudor = deudores[0] || null; // compatibilidad: primer deudor para referencias puntuales
  const saldoEncargos = encargos.reduce((a, e) => a + encargoSaldo(e), 0);
  const saldoPrestamo = deudores.reduce((a, d) => a + (typeof getDeudorSaldo === 'function' ? getDeudorSaldo(d) : 0), 0);
  // misDeudas: lo que YO le debo a esta persona
  const misDeudas = (S.misDeudas || []).filter(d => d.personaId === personaId);
  const saldoMisDeudas = misDeudas.reduce((a, d) => a + getMiDeudaSaldo(d), 0);
  return { encargos, deudor, deudores, saldoEncargos, saldoPrestamo, misDeudas, saldoMisDeudas };
}

/* ── SHEET SELECTOR DE PERSONA ─────────────────────────────────── */
// Inyectar HTML del sheet selector y del sheet crear-persona-global
function _inyectarPersonaSheets() {
  if (document.getElementById('sheet-sel-persona')) return;

  // Sheet: seleccionar persona (para nuevo encargo)
  const sheetSel = document.createElement('div');
  sheetSel.className = 'overlay';
  sheetSel.id = 'sheet-sel-persona';
  sheetSel.dataset.sheetId = 'sel-persona';
  sheetSel.innerHTML = `
    <div class="sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-title">¿De quién es la plata?</div>
      <p style="font-size:12px;color:var(--text2);margin-bottom:14px;">Elige una persona existente o crea una nueva.</p>
      <div id="sel-persona-buscar-wrap" class="ig" style="position:relative;">
        <input type="text" id="sel-persona-buscar" placeholder="Buscar persona..." autocomplete="off"
          style="padding-left:36px;">
        <svg style="position:absolute;left:11px;top:50%;transform:translateY(-50%);pointer-events:none;" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      </div>
      <div id="sel-persona-lista" style="max-height:300px;overflow-y:auto;"></div>
      <button type="button" class="btn btn-ghost" style="margin-top:10px;display:flex;align-items:center;justify-content:center;gap:6px;" ${Events.attr('personas:abrirCrearGlobal', false)}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Nueva persona
      </button>
      <button type="button" class="btn btn-ghost" data-close-sheet="sel-persona" style="margin-top:6px;">Cancelar</button>
    </div>`;
  document.body.appendChild(sheetSel);
  // oninput inline reemplazado por addEventListener — docs/auditoria-tecnica.md #1
  const _buscarEl = document.getElementById('sel-persona-buscar');
  if (_buscarEl) _buscarEl.addEventListener('input', _selPersonaFiltrar);

  // Sheet: crear persona global (desde cualquier módulo)
  const sheetCreate = document.createElement('div');
  sheetCreate.className = 'overlay';
  sheetCreate.id = 'sheet-crear-persona-global';
  sheetCreate.dataset.sheetId = 'crear-persona-global';
  sheetCreate.innerHTML = `
    <div class="sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-title">Nueva persona</div>
      <div class="ig"><label class="il" for="cpg_nombre">Nombre</label>
        <input type="text" id="cpg_nombre" placeholder="Ej: Papá, Carlos, Mamá..."></div>
      <div class="ig"><div class="il">Color del avatar</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;padding:4px 0;" id="cpg_colores"></div>
      </div>
      <button type="button" class="btn btn-primary" ${Events.attr('personas:confirmarCrear')}>Crear persona</button>
      <button type="button" class="btn btn-ghost" ${Events.attr('personas:volverASel')} style="margin-top:6px;">← Volver</button>
    </div>`;
  document.body.appendChild(sheetCreate);

  // Sheet: perfil de persona
  const sheetPerfil = document.createElement('div');
  sheetPerfil.className = 'overlay';
  sheetPerfil.id = 'sheet-perfil-persona';
  sheetPerfil.dataset.sheetId = 'perfil-persona';
  sheetPerfil.innerHTML = `
    <div class="sheet">
      <div class="sheet-handle"></div>
      <div id="pperf-header" style="display:flex;align-items:center;gap:12px;margin-bottom:18px;">
        <div id="pperf-avatar" class="avatar" style="width:46px;height:46px;font-size:16px;margin-right:0;flex-shrink:0;"></div>
        <div style="flex:1;min-width:0;">
          <div id="pperf-nombre" style="font-size:17px;font-weight:700;"></div>
          <div id="pperf-sub" style="font-size:11px;color:var(--text3);font-family:'DM Mono',monospace;"></div>
        </div>
        <button type="button" class="btn-icon" ${Events.attr('personas:editarDesdePerfil')} title="Editar" style="color:var(--accent);">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
      </div>
      <div id="pperf-body"></div>
      <button type="button" class="btn btn-ghost" data-close-sheet="perfil-persona" style="margin-top:10px;">Cerrar</button>
    </div>`;
  document.body.appendChild(sheetPerfil);

  // Sheet: editar persona global
  const sheetEdit = document.createElement('div');
  sheetEdit.className = 'overlay';
  sheetEdit.id = 'sheet-editar-persona-global';
  sheetEdit.dataset.sheetId = 'editar-persona-global';
  sheetEdit.innerHTML = `
    <div class="sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-title">Editar persona</div>
      <div class="ig"><label class="il" for="epg_nombre">Nombre</label>
        <input type="text" id="epg_nombre" placeholder="Ej: Papá, Carlos, Mamá..."></div>
      <div class="ig"><div class="il">Color del avatar</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;padding:4px 0;" id="epg_colores"></div>
      </div>
      <button type="button" class="btn btn-primary" ${Events.attr('personas:guardarEdicion')}>Guardar cambios</button>
      <button type="button" class="btn btn-ghost" data-close-sheet="editar-persona-global" style="margin-top:6px;">Cancelar</button>
    </div>`;
  document.body.appendChild(sheetEdit);

  // Registrar swipe en todos los sheets de personas recién inyectados
  if(typeof window._makeSheetSwipeable === 'function') {
    ['sheet-sel-persona','sheet-crear-persona-global','sheet-perfil-persona'].forEach(id => {
      const el = document.getElementById(id);
      if(el) window._makeSheetSwipeable(el);
    });
  }
}

/* ── LISTA DE PERSONAS (desde menú Más) ────────────────────────── */
function _abrirListaPersonas() {
  _inyectarPersonaSheets();
  _renderListaPersonas();
  showScreen('personas');
  // Cerrar el menú Más si está abierto
  const masOverlay = document.getElementById('mas-menu-overlay');
  if (masOverlay) masOverlay.classList.remove('open');
}

function _renderListaPersonas() {
  const body = document.getElementById('lista-personas-body');
  const empty = document.getElementById('lista-personas-empty');
  if (!body) return;

  // Reunir personas: las de S.personas + deudores sin personaId que aún no están
  const personas = [...(S.personas || [])];
  // También incluir deudores no vinculados como "sin perfil"
  const sinPerfil = (S.deudores || []).filter(d => !d.personaId);
  // misDeudas sin vincular (sin personaId)
  const sinPerfilMisDeudas = (S.misDeudas || []).filter(d => !d.personaId);

  const total = personas.length + sinPerfil.length + sinPerfilMisDeudas.length;
  if (!total) {
    body.innerHTML = '';
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  let html = '';

  // Personas con perfil
  personas.forEach(p => {
    const color = p.color || '#60b0f0';
    const datos = getPersonaDatos(p.id);
    const partes = [];
    if (datos.deudor) {
      const saldo = datos.saldoPrestamo;
      if (saldo !== 0) partes.push('<span style="color:var(--amber);">' + fmt(saldo) + ' pendiente</span>');
      else partes.push('<span style="color:var(--accent);">Al día</span>');
    }
    if (datos.encargos.length) partes.push(datos.encargos.length + ' encargo' + (datos.encargos.length !== 1 ? 's' : ''));
    if (datos.misDeudas && datos.misDeudas.length) {
      const saldoMD = datos.saldoMisDeudas;
      if (saldoMD > 0) partes.push('<span style="color:var(--red);">Le debes ' + fmt(saldoMD) + '</span>');
      else partes.push('<span style="color:var(--accent);">Deuda saldada</span>');
    }
    const subTexto = partes.length ? partes.join(' · ') : '<span style="color:var(--text3);">Sin actividad</span>';

    html += `<div ${Events.attr('personas:abrirPerfil', p.id)} class="_persona-row-hover" data-hover-color="${color}" style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);cursor:pointer;transition:border-color .15s;">
      <div class="avatar" style="width:40px;height:40px;font-size:14px;margin-right:0;flex-shrink:0;color:${color};background:${color}18;border-color:${color}33;">${escHtml(iniciales(p.nombre))}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:14px;font-weight:600;">${escHtml(p.nombre)}</div>
        <div style="font-size:11px;margin-top:2px;font-family:'DM Mono',monospace;">${subTexto}</div>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2" stroke-linecap="round" style="flex-shrink:0;"><polyline points="9 18 15 12 9 6"/></svg>
    </div>`;
  });

  // Deudores sin perfil vinculado
  sinPerfil.forEach(d => {
    const color = d.color || '#60b0f0';
    const saldo = getDeudorSaldo(d);
    const sub = saldo > 0
      ? `<span style="color:var(--amber);">${fmt(saldo)} pendiente</span>`
      : saldo < 0
        ? `<span style="color:var(--red);">Saldo a su favor</span>`
        : `<span style="color:var(--accent);">Al día</span>`;
    html += `<div ${Events.attr('prestado:abrirPerfilDeudor', d.id)} class="_persona-row-hover" data-hover-color="${color}" style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);cursor:pointer;transition:border-color .15s;">
      <div class="avatar" style="width:40px;height:40px;font-size:14px;margin-right:0;flex-shrink:0;color:${color};background:${color}18;border-color:${color}33;">${escHtml(d.nombre.substring(0,2).toUpperCase())}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:14px;font-weight:600;">${escHtml(d.nombre)}</div>
        <div style="font-size:11px;margin-top:2px;font-family:'DM Mono',monospace;">${sub}</div>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2" stroke-linecap="round" style="flex-shrink:0;"><polyline points="9 18 15 12 9 6"/></svg>
    </div>`;
  });

  // misDeudas sin perfil vinculado (le debo a alguien sin persona)
  sinPerfilMisDeudas.forEach(d => {
    const color = d.color || '#f06868';
    const saldo = getMiDeudaSaldo(d);
    const sub = saldo > 0
      ? `<span style="color:var(--red);">Le debes ${fmt(saldo)}</span>`
      : `<span style="color:var(--accent);">Saldado</span>`;
    html += `<div ${Events.attr('prestado-personas:abrirPerfilMiDeuda', d.id)} class="_persona-row-hover" data-hover-color="${color}" style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);cursor:pointer;transition:border-color .15s;">
      <div class="avatar" style="width:40px;height:40px;font-size:14px;margin-right:0;flex-shrink:0;color:${color};background:${color}18;border-color:${color}33;">${escHtml(d.nombre.substring(0,2).toUpperCase())}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:14px;font-weight:600;">${escHtml(d.nombre)}</div>
        <div style="font-size:11px;margin-top:2px;font-family:'DM Mono',monospace;">${sub}</div>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2" stroke-linecap="round" style="flex-shrink:0;"><polyline points="9 18 15 12 9 6"/></svg>
    </div>`;
  });

  body.innerHTML = html;

  // Hover effect (antes onmouseenter/onmouseleave inline — docs/auditoria-tecnica.md #1).
  // No puede ser un :hover en CSS porque el color varía por persona/deudor.
  body.querySelectorAll('._persona-row-hover').forEach(row => {
    const c = row.dataset.hoverColor;
    row.addEventListener('mouseenter', () => { row.style.borderColor = c + '44'; });
    row.addEventListener('mouseleave', () => { row.style.borderColor = 'var(--border)'; });
  });
}

// Actualizar el sub-texto del ítem Personas (ahora en Configuración)
function _actualizarMasPersonasSub() {
  const total = (S.personas || []).length + (S.deudores || []).filter(d => !d.personaId).length + (S.misDeudas || []).filter(d => !d.personaId).length;
  const txt = total ? total + ' persona' + (total !== 1 ? 's' : '') + ' registrada' + (total !== 1 ? 's' : '') : 'Perfiles y actividad financiera';
  // Actualizar en Config
  const cfgSub = document.getElementById('cfg-personas-sub');
  if (cfgSub) cfgSub.textContent = txt;
}
let _selPersonaCallback = null; // fn(personaId) llamada al seleccionar
let _selPersonaTitulo = '¿De quién es la plata?'; // título del sheet, según quién lo abrió

function abrirSelPersona(callback, titulo) {
  _selPersonaCallback = callback;
  _selPersonaTitulo = titulo || '¿De quién es la plata?';
  _inyectarPersonaSheets();
  const tituloEl = document.querySelector('#sheet-sel-persona .sheet-title');
  if (tituloEl) tituloEl.textContent = _selPersonaTitulo;
  const buscarEl = document.getElementById('sel-persona-buscar');
  if (buscarEl) buscarEl.value = '';
  _selPersonaFiltrar();
  document.getElementById('sheet-sel-persona').classList.add('open');
  setTimeout(() => { if (buscarEl) buscarEl.focus(); }, 200);
}

function _selPersonaFiltrar() {
  const q = (document.getElementById('sel-persona-buscar')?.value || '').toLowerCase().trim();
  const lista = document.getElementById('sel-persona-lista');
  if (!lista) return;
  const personas = (S.personas || []).filter(p => !q || p.nombre.toLowerCase().includes(q));
  if (!personas.length) {
    lista.innerHTML = q
      ? `<div style="padding:10px 0;">
          <div style="font-size:12px;color:var(--text3);margin-bottom:10px;">No se encontró "${escHtml(q)}".</div>
          <button type="button" ${Events.attr('personas:selCrearDirecto')} style="width:100%;display:flex;align-items:center;justify-content:center;gap:6px;padding:11px;border-radius:var(--radius-sm);background:rgba(200,240,96,.12);border:1.5px solid var(--accent);color:var(--accent);font-size:13px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Crear a "${escHtml(q)}"
          </button>
        </div>`
      : `<div style="font-size:12px;color:var(--text3);padding:10px 0;">No hay personas todavía. Creá una nueva.</div>`;
    return;
  }
  lista.innerHTML = personas.map(p => {
    const datos = getPersonaDatos(p.id);
    const badges = [];
    if (datos.deudor) {
      const saldo = datos.saldoPrestamo;
      if (saldo > 0) badges.push(`<span class="badge bg-amber" style="font-size:9px;">Préstamo ${fmt(saldo)}</span>`);
      else badges.push(`<span class="badge bg-blue" style="font-size:9px;">Préstamos</span>`);
    }
    if (datos.encargos.length) badges.push(`<span class="badge bg-blue" style="font-size:9px;">${datos.encargos.length} encargo${datos.encargos.length !== 1 ? 's' : ''}</span>`);
    if (datos.misDeudas && datos.misDeudas.length) {
      const saldoMD = datos.saldoMisDeudas;
      if (saldoMD > 0) badges.push(`<span class="badge" style="font-size:9px;background:rgba(240,104,104,.18);color:var(--red);">Le debes ${fmt(saldoMD)}</span>`);
      else badges.push(`<span class="badge bg-green" style="font-size:9px;">Deuda saldada</span>`);
    }
    return `<div ${Events.attr('personas:selElegir', p.id)} style="display:flex;align-items:center;gap:10px;padding:11px 4px;border-bottom:1px solid var(--border);cursor:pointer;" class="_sel-persona-row">
      <div class="avatar" style="width:36px;height:36px;font-size:12px;margin-right:0;flex-shrink:0;background:${p.color}18;color:${p.color};border-color:${p.color}33;">${escHtml(iniciales(p.nombre))}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:14px;font-weight:600;">${escHtml(p.nombre)}</div>
        ${badges.length ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:3px;">${badges.join('')}</div>` : ''}
      </div>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
    </div>`;
  }).join('');
  // Hover effect
  lista.querySelectorAll('._sel-persona-row').forEach(row => {
    row.addEventListener('mouseenter', () => { row.style.background = 'var(--bg3)'; row.style.borderRadius = '8px'; });
    row.addEventListener('mouseleave', () => { row.style.background = ''; });
  });
}

function _selPersonaElegir(personaId) {
  document.getElementById('sheet-sel-persona').classList.remove('open');
  if (typeof _selPersonaCallback === 'function') {
    setTimeout(() => { _selPersonaCallback(personaId); }, 180);
  }
}

// Un solo tap desde "No se encontró": precarga el nombre ya escrito y abre
// directamente "Nueva persona", en vez de obligar a escribirlo de nuevo.
function _selPersonaCrearDirecto() {
  const q = document.getElementById('sel-persona-buscar')?.value.trim() || '';
  _abrirCrearPersonaGlobal();
  setTimeout(() => {
    const nEl = document.getElementById('cpg_nombre');
    if (nEl) nEl.value = q;
  }, 210);
}

/* ── CREAR PERSONA GLOBAL ──────────────────────────────────────── */
var _cpgColorSel = '#60b0f0';

let _cpgDesdeListaPersonas = false;

function _abrirCrearPersonaGlobal(desdeListaPersonas) {
  _cpgDesdeListaPersonas = !!desdeListaPersonas;
  _inyectarPersonaSheets();
  _cpgColorSel = PERSONA_COLORES[0];
  document.getElementById('cpg_nombre').value = '';
  _renderColorPicker('cpg_colores', '_cpgColorSel');
  // Abrir el nuevo sheet primero (antes de cerrar el anterior) para evitar el flash del fondo
  document.getElementById('sheet-crear-persona-global').classList.add('open');
  if (!desdeListaPersonas) {
    document.getElementById('sheet-sel-persona').classList.remove('open');
  }
  setTimeout(() => document.getElementById('cpg_nombre').focus(), 200);
}

function _volverASelPersona() {
  if (_cpgDesdeListaPersonas) {
    _abrirListaPersonas();
  } else {
    abrirSelPersona(_selPersonaCallback, _selPersonaTitulo);
  }
  document.getElementById('sheet-crear-persona-global').classList.remove('open');
}

function _crearPersonaGlobal() {
  const nombre = document.getElementById('cpg_nombre').value.trim();
  if (!nombre) { toast('Escribe el nombre', 'err'); return; }
  if (!S.personas) S.personas = [];
  const p = { id: uid(), nombre, color: _cpgColorSel, creadoEn: hoy() };
  S.personas.push(p);
  save();
  toast(escHtml(nombre) + ' creado/a', 'ok');
  if (_cpgDesdeListaPersonas) {
    _renderListaPersonas();
    document.getElementById('sheet-crear-persona-global').classList.remove('open');
    showScreen('personas');
  } else {
    document.getElementById('sheet-crear-persona-global').classList.remove('open');
    setTimeout(() => {
      if (typeof _selPersonaCallback === 'function') _selPersonaCallback(p.id);
    }, 180);
  }
}

/* ── EDITAR PERSONA GLOBAL ─────────────────────────────────────── */
let _editPersonaGlobalId = null;
var _epgColorSel = '#60b0f0';

function abrirEditarPersonaGlobal(personaId) {
  const p = getPersona(personaId);
  if (!p) return;
  _editPersonaGlobalId = personaId;
  _epgColorSel = p.color || PERSONA_COLORES[0];
  _inyectarPersonaSheets();
  document.getElementById('epg_nombre').value = p.nombre;
  _renderColorPicker('epg_colores', '_epgColorSel');
  document.getElementById('sheet-editar-persona-global').classList.add('open');
  setTimeout(() => document.getElementById('epg_nombre').focus(), 200);
}

function _guardarEditarPersonaGlobal() {
  const p = getPersona(_editPersonaGlobalId);
  if (!p) return;
  const nombre = document.getElementById('epg_nombre').value.trim();
  if (!nombre) { toast('Escribe el nombre', 'err'); return; }
  const nombreAnterior = p.nombre;
  p.nombre = nombre;
  p.color = _epgColorSel;
  // Sincronizar nombre en deudores vinculados
  (S.deudores || []).forEach(d => { if (d.personaId === p.id) { d.nombre = nombre; d.color = _epgColorSel; } });
  // Sincronizar nombre en encargos vinculados
  (S.encargos || []).forEach(e => { if (e.personaId === p.id) e.nombre = nombre; });
  // Sincronizar nombre y color en misDeudas vinculadas
  (S.misDeudas || []).forEach(d => { if (d.personaId === p.id) { d.nombre = nombre; d.color = _epgColorSel; } });
  // Sincronizar nombre en integrantes de Spotify vinculados (el campo crudo .nombre
  // se usa directo en la validación de nombres duplicados de addSpotify)
  (S.spotifyPersonas || []).forEach(sp => { if (sp.personaId === p.id) sp.nombre = nombre; });
  save(); refresh();
  _renderListaPersonas();
  if (typeof renderEncargosList === 'function') renderEncargosList();
  if (typeof renderMisDeudasList === 'function') renderMisDeudasList();
  document.getElementById('sheet-editar-persona-global').classList.remove('open');
  toast(escHtml(nombre) + ' actualizado', 'ok');
  // Si había perfil abierto, refrescar
  if (document.getElementById('sheet-perfil-persona')?.classList.contains('open')) {
    setTimeout(() => abrirPerfilPersona(p.id), 200);
  }
}

/* ── PERFIL DE PERSONA ─────────────────────────────────────────── */
let _perfilPersonaId = null;

function abrirPerfilPersona(personaId) {
  const p = getPersona(personaId);
  if (!p) return;
  _perfilPersonaId = personaId;
  _inyectarPersonaSheets();

  const color = p.color || '#60b0f0';
  const av = document.getElementById('pperf-avatar');
  const nm = document.getElementById('pperf-nombre');
  const sb = document.getElementById('pperf-sub');
  if (av) {
    av.textContent = iniciales(p.nombre);
    av.style.background = color + '22';
    av.style.color = color;
    av.style.borderColor = color + '44';
  }
  if (nm) nm.textContent = p.nombre;

  const datos = getPersonaDatos(personaId);
  const spEntry = (S.spotifyPersonas || []).find(sp => sp.personaId === personaId);
  const partes = [];
  if (datos.deudor) partes.push('Préstamos');
  if (datos.encargos.length) partes.push(datos.encargos.length + ' encargo' + (datos.encargos.length !== 1 ? 's' : ''));
  if (spEntry) partes.push('Spotify');
  if (datos.misDeudas && datos.misDeudas.length) partes.push('Le debo');
  if (sb) sb.textContent = partes.length ? partes.join(' · ') : 'Sin actividad registrada';

  const body = document.getElementById('pperf-body');
  if (!body) return;

  let html = '';

  // ── Sección Préstamos ──
  if (datos.deudor) {
    const d = datos.deudor;
    const saldo = datos.saldoPrestamo;
    // Consolidar movimientos de TODOS los deudores vinculados a esta persona
    const movs = (datos.deudores || [datos.deudor]).flatMap(dd => dd.movimientos || [])
      .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
    const prestamos = movs.filter(m => m.tipo === 'prestamo');
    const abonos   = movs.filter(m => m.tipo === 'abono' || m.tipo === 'pago-completo');
    const totalPrestado = prestamos.reduce((a, m) => a + (m.monto || 0), 0);
    const totalAbonado  = abonos.reduce((a, m) => a + (m.monto || 0), 0);
    const color2 = saldo > 0 ? 'var(--amber)' : saldo < 0 ? 'var(--red)' : 'var(--accent)';
    const pct = totalPrestado > 0 ? Math.min(100, Math.round(totalAbonado / totalPrestado * 100)) : 0;

    // Stats interesantes
    const mayorPrestamo = prestamos.length ? prestamos.reduce((mx, m) => m.monto > mx.monto ? m : mx, prestamos[0]) : null;
    const mayorAbono    = abonos.length    ? abonos.reduce((mx, m) => m.monto > mx.monto ? m : mx, abonos[0])       : null;
    const cuantasveces  = prestamos.length;
    const diasDesde     = movs.length ? Math.floor((new Date() - new Date(movs[0].fecha + 'T00:00:00')) / 86400000) : null;
    const ultimoMov     = movs.length ? movs[movs.length - 1] : null;

    html += `<div style="background:rgba(240,184,64,.07);border:1px solid rgba(240,184,64,.2);border-radius:var(--radius-sm);padding:13px 14px;margin-bottom:10px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <div style="font-size:10px;color:var(--amber);text-transform:uppercase;letter-spacing:1px;font-family:'DM Mono',monospace;font-weight:600;display:flex;align-items:center;gap:5px;"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> Préstamos</div>
        <button type="button" ${Events.attr('prestado-personas:irADeudor', d.id)} style="font-size:11px;color:var(--accent);background:none;border:none;cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:600;">Ver detalle →</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px;">
        <div style="background:var(--bg3);border-radius:8px;padding:9px 10px;">
          <div style="font-size:9px;color:var(--text3);font-family:'DM Mono',monospace;text-transform:uppercase;margin-bottom:3px;">Pendiente</div>
          <div style="font-size:15px;font-weight:600;font-family:'DM Mono',monospace;color:${color2};">${fmt(saldo)}</div>
        </div>
        <div style="background:var(--bg3);border-radius:8px;padding:9px 10px;">
          <div style="font-size:9px;color:var(--text3);font-family:'DM Mono',monospace;text-transform:uppercase;margin-bottom:3px;">Prestado</div>
          <div style="font-size:15px;font-weight:600;font-family:'DM Mono',monospace;color:var(--text);">${fmt(totalPrestado)}</div>
        </div>
        <div style="background:var(--bg3);border-radius:8px;padding:9px 10px;">
          <div style="font-size:9px;color:var(--text3);font-family:'DM Mono',monospace;text-transform:uppercase;margin-bottom:3px;">Abonado</div>
          <div style="font-size:15px;font-weight:600;font-family:'DM Mono',monospace;color:var(--accent);">${fmt(totalAbonado)}</div>
        </div>
      </div>
      ${totalPrestado > 0 ? `<div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text3);margin-bottom:4px;font-family:'DM Mono',monospace;">
          <span>Progreso de pago</span><span>${pct}%</span>
        </div>
        <div style="height:4px;background:var(--bg4);border-radius:2px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:${pct===100?'var(--accent)':'var(--amber)'};border-radius:2px;transition:width .4s;"></div>
        </div>
      </div>` : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;">
        ${mayorPrestamo ? `<div style="background:var(--bg3);border-radius:8px;padding:9px 10px;">
          <div style="font-size:9px;color:var(--text3);font-family:'DM Mono',monospace;text-transform:uppercase;margin-bottom:3px;">Mayor préstamo</div>
          <div style="font-size:14px;font-weight:600;font-family:'DM Mono',monospace;color:var(--amber);">${fmt(mayorPrestamo.monto)}</div>
          ${mayorPrestamo.fecha ? `<div style="font-size:10px;color:var(--text3);margin-top:2px;">${mayorPrestamo.fecha}</div>` : ''}
        </div>` : ''}
        ${mayorAbono ? `<div style="background:var(--bg3);border-radius:8px;padding:9px 10px;">
          <div style="font-size:9px;color:var(--text3);font-family:'DM Mono',monospace;text-transform:uppercase;margin-bottom:3px;">Mayor abono</div>
          <div style="font-size:14px;font-weight:600;font-family:'DM Mono',monospace;color:var(--accent);">${fmt(mayorAbono.monto)}</div>
          ${mayorAbono.fecha ? `<div style="font-size:10px;color:var(--text3);margin-top:2px;">${mayorAbono.fecha}</div>` : ''}
        </div>` : ''}
        <div style="background:var(--bg3);border-radius:8px;padding:9px 10px;">
          <div style="font-size:9px;color:var(--text3);font-family:'DM Mono',monospace;text-transform:uppercase;margin-bottom:3px;">Veces prestado</div>
          <div style="font-size:14px;font-weight:600;font-family:'DM Mono',monospace;color:var(--text);">${cuantasveces}x</div>
        </div>
        ${diasDesde !== null ? `<div style="background:var(--bg3);border-radius:8px;padding:9px 10px;">
          <div style="font-size:9px;color:var(--text3);font-family:'DM Mono',monospace;text-transform:uppercase;margin-bottom:3px;">Relación activa</div>
          <div style="font-size:14px;font-weight:600;font-family:'DM Mono',monospace;color:var(--text);">${diasDesde}d</div>
        </div>` : ''}
      </div>
      ${ultimoMov ? `<div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border);font-size:11px;color:var(--text3);">
        Último movimiento: <span style="color:var(--text2);font-weight:500;">${ultimoMov.tipo === 'prestamo' ? 'Préstamo' : (ultimoMov.tipo === 'pago-completo' ? 'Pago completo' : 'Abono')} de ${fmt(ultimoMov.monto)}</span>${ultimoMov.fecha ? ' · ' + ultimoMov.fecha : ''}${ultimoMov.nota ? ' · <i>' + escHtml(ultimoMov.nota) + '</i>' : ''}
      </div>` : ''}
    </div>`;
  }

  // ── Sección Encargos ──
  if (datos.encargos.length) {
    const totalEnc = datos.saldoEncargos;
    // Stats encargos
    const todosMovEnc = datos.encargos.flatMap(e => (e.movimientos || []).map(m => ({...m, _enc: e})));
    const entradasEnc = todosMovEnc.filter(m => m.tipo === 'entrada' || m.tipo === 'deposito' || !m.tipo || m.monto > 0);
    const mayorEntrada = entradasEnc.length ? entradasEnc.reduce((mx, m) => (m.monto||0) > (mx.monto||0) ? m : mx, entradasEnc[0]) : null;
    const encargoMayor = datos.encargos.length ? [...datos.encargos].sort((a,b) => encargoSaldo(b) - encargoSaldo(a))[0] : null;

    html += `<div style="background:rgba(96,176,240,.07);border:1px solid rgba(96,176,240,.2);border-radius:var(--radius-sm);padding:13px 14px;margin-bottom:10px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <div style="font-size:10px;color:var(--blue);text-transform:uppercase;letter-spacing:1px;font-family:'DM Mono',monospace;font-weight:600;display:flex;align-items:center;gap:5px;"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg> Encargos</div>
        <span style="font-size:12px;color:var(--text2);">${datos.encargos.length} encargo${datos.encargos.length !== 1 ? 's' : ''}</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:10px;">
        <div style="background:var(--bg3);border-radius:8px;padding:9px 10px;">
          <div style="font-size:9px;color:var(--text3);font-family:'DM Mono',monospace;text-transform:uppercase;margin-bottom:3px;">Total activo</div>
          <div style="font-size:15px;font-weight:600;font-family:'DM Mono',monospace;color:var(--blue);">${fmt(totalEnc)}</div>
        </div>
        <div style="background:var(--bg3);border-radius:8px;padding:9px 10px;">
          <div style="font-size:9px;color:var(--text3);font-family:'DM Mono',monospace;text-transform:uppercase;margin-bottom:3px;">Cantidad</div>
          <div style="font-size:15px;font-weight:600;font-family:'DM Mono',monospace;color:var(--text);">${datos.encargos.length}</div>
        </div>
        ${encargoMayor ? `<div style="background:var(--bg3);border-radius:8px;padding:9px 10px;">
          <div style="font-size:9px;color:var(--text3);font-family:'DM Mono',monospace;text-transform:uppercase;margin-bottom:3px;">Encargo mayor</div>
          <div style="font-size:13px;font-weight:600;font-family:'DM Mono',monospace;color:var(--blue);">${fmt(encargoSaldo(encargoMayor))}</div>
          <div style="font-size:10px;color:var(--text3);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(encargoMayor.nota||encargoMayor.nombre)}</div>
        </div>` : ''}
        ${mayorEntrada ? `<div style="background:var(--bg3);border-radius:8px;padding:9px 10px;">
          <div style="font-size:9px;color:var(--text3);font-family:'DM Mono',monospace;text-transform:uppercase;margin-bottom:3px;">Mayor entrada</div>
          <div style="font-size:13px;font-weight:600;font-family:'DM Mono',monospace;color:var(--accent);">${fmt(mayorEntrada.monto)}</div>
          ${mayorEntrada.fecha ? `<div style="font-size:10px;color:var(--text3);margin-top:1px;">${mayorEntrada.fecha}</div>` : ''}
        </div>` : ''}
      </div>
      ${datos.encargos.map(e => {
        const saldoE = encargoSaldo(e);
        return `<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border);">
          <div style="font-size:13px;font-weight:500;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(e.nota || e.nombre)}</div>
          <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
            <div style="font-size:14px;font-weight:600;font-family:'DM Mono',monospace;color:var(--blue);">${fmt(saldoE)}</div>
            <button type="button" ${Events.attr('encargos-personas:irAEncargo', e.id)} style="font-size:11px;color:var(--accent);background:none;border:none;cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:600;">Ver →</button>
          </div>
        </div>`;
      }).join('')}
    </div>`;
  }

  // ── Sección Spotify ──
  if (spEntry) {
    const diasRestantes = spEntry.proximoPago
      ? Math.ceil((new Date(spEntry.proximoPago + 'T00:00:00') - new Date()) / 86400000)
      : null;
    const vencido = diasRestantes !== null && diasRestantes < 0;
    const hoy0    = diasRestantes === 0;
    const badgeClass = vencido ? 'bg-red' : hoy0 ? 'bg-amber' : 'bg-purple';
    const badgeText  = diasRestantes === null ? '' :
      vencido ? 'Vencido hace ' + Math.abs(diasRestantes) + 'd' :
      hoy0    ? 'Vence hoy' :
                'Paga en ' + diasRestantes + 'd · ' + spEntry.proximoPago;
    const estadoBadge = spEntry.pagado
      ? '<span class="badge bg-green" style="font-size:9px;">Pagó este ciclo</span>'
      : '<span class="badge bg-red" style="font-size:9px;">Pendiente</span>';

    // Stats Spotify de esta persona
    const histSp = (S.spotifyHistorial || []).filter(h => h.tipo === 'cobro' && h.nombre === spEntry.nombre);
    const totalCobradoSp = histSp.reduce((a, h) => a + (h.monto || 0), 0);
    const mayorCobroSp   = histSp.length ? histSp.reduce((mx, h) => h.monto > mx.monto ? h : mx, histSp[0]) : null;
    const diasEnPlan     = spEntry.fechaIngreso
      ? Math.floor((new Date() - new Date(spEntry.fechaIngreso + 'T00:00:00')) / 86400000)
      : null;
    const mesesEstimados = diasEnPlan !== null ? Math.floor(diasEnPlan / 30) : null;

    html += `<div style="background:rgba(30,215,96,.06);border:1px solid rgba(30,215,96,.25);border-radius:var(--radius-sm);padding:13px 14px;margin-bottom:10px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <div style="font-size:10px;color:#1ed760;text-transform:uppercase;letter-spacing:1px;font-family:'DM Mono',monospace;font-weight:600;">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 64 64" style="vertical-align:middle;margin-right:3px;"><path d="M32 0C14.3 0 0 14.337 0 32c0 17.7 14.337 32 32 32 17.7 0 32-14.337 32-32S49.663 0 32 0zm14.68 46.184c-.573.956-1.797 1.223-2.753.65-7.532-4.588-16.975-5.62-28.14-3.097-1.07.23-2.14-.42-2.37-1.49s.42-2.14 1.49-2.37c12.196-2.79 22.67-1.606 31.082 3.556a2 2 0 0 1 .688 2.753zm3.9-8.717c-.726 1.185-2.256 1.53-3.44.84-8.602-5.276-21.716-6.805-31.885-3.747-1.338.382-2.714-.344-3.097-1.644-.382-1.338.344-2.714 1.682-3.097 11.622-3.517 26.074-1.835 35.976 4.244 1.147.688 1.49 2.217.765 3.403zm.344-9.1c-10.323-6.117-27.336-6.69-37.2-3.708-1.568.497-3.25-.42-3.747-1.988s.42-3.25 1.988-3.747c11.317-3.44 30.127-2.753 41.98 4.282 1.415.84 1.873 2.676 1.032 4.09-.765 1.453-2.638 1.912-4.053 1.07z" fill="#1ed760"/></svg>
          Spotify
        </div>
        <button type="button" ${Events.attr('personas:irASpotify')} style="font-size:11px;color:var(--accent);background:none;border:none;cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:600;">Ver módulo →</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:8px;">
        <div style="background:var(--bg3);border-radius:8px;padding:9px 10px;">
          <div style="font-size:9px;color:var(--text3);font-family:'DM Mono',monospace;text-transform:uppercase;margin-bottom:3px;">Cuota</div>
          <div style="font-size:15px;font-weight:600;font-family:'DM Mono',monospace;color:var(--text);">${fmt(spEntry.monto || 0)}/período</div>
        </div>
        <div style="background:var(--bg3);border-radius:8px;padding:9px 10px;">
          <div style="font-size:9px;color:var(--text3);font-family:'DM Mono',monospace;text-transform:uppercase;margin-bottom:3px;">Estado</div>
          <div style="margin-top:4px;">${estadoBadge}</div>
        </div>
        ${totalCobradoSp > 0 ? `<div style="background:var(--bg3);border-radius:8px;padding:9px 10px;">
          <div style="font-size:9px;color:var(--text3);font-family:'DM Mono',monospace;text-transform:uppercase;margin-bottom:3px;">Total cobrado</div>
          <div style="font-size:14px;font-weight:600;font-family:'DM Mono',monospace;color:#1ed760;">${fmt(totalCobradoSp)}</div>
          <div style="font-size:10px;color:var(--text3);margin-top:1px;">${histSp.length} cobro${histSp.length !== 1 ? 's' : ''}</div>
        </div>` : ''}
        ${diasEnPlan !== null ? `<div style="background:var(--bg3);border-radius:8px;padding:9px 10px;">
          <div style="font-size:9px;color:var(--text3);font-family:'DM Mono',monospace;text-transform:uppercase;margin-bottom:3px;">En el plan</div>
          <div style="font-size:14px;font-weight:600;font-family:'DM Mono',monospace;color:var(--text);">${mesesEstimados !== null ? mesesEstimados + ' período' + (mesesEstimados !== 1 ? 's' : '') : diasEnPlan + 'd'}</div>
          <div style="font-size:10px;color:var(--text3);margin-top:1px;">desde ${spEntry.fechaIngreso}</div>
        </div>` : ''}
        ${mayorCobroSp ? `<div style="background:var(--bg3);border-radius:8px;padding:9px 10px;grid-column:1/-1;">
          <div style="font-size:9px;color:var(--text3);font-family:'DM Mono',monospace;text-transform:uppercase;margin-bottom:3px;">Mayor cobro registrado</div>
          <div style="font-size:14px;font-weight:600;font-family:'DM Mono',monospace;color:#1ed760;">${fmt(mayorCobroSp.monto)}${mayorCobroSp.nota ? ' <span style="font-size:10px;color:var(--text3);font-weight:400;">· ' + escHtml(mayorCobroSp.nota) + '</span>' : ''}</div>
          ${mayorCobroSp.fecha ? `<div style="font-size:10px;color:var(--text3);margin-top:1px;">${mayorCobroSp.fecha}</div>` : ''}
        </div>` : ''}
      </div>
      ${badgeText ? `<div>${spEntry.pagado ? '' : `<span class="badge ${badgeClass}" style="font-size:9px;">${badgeText}</span>`}</div>` : ''}
    </div>`;
  }

  // ── Sección Le debo (misDeudas) ──
  if (datos.misDeudas && datos.misDeudas.length) {
    const totalMisDeudas = datos.saldoMisDeudas;
    const movsTodos = datos.misDeudas.flatMap(d => (d.movimientos || []).map(m => ({...m, _deuda: d})))
      .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
    const recibidos = movsTodos.filter(m => m.tipo === 'recibido');
    const pagos = movsTodos.filter(m => m.tipo === 'pago');
    const totalRecibido = recibidos.reduce((a, m) => a + (m.monto || 0), 0);
    const totalPagado = pagos.reduce((a, m) => a + (m.monto || 0), 0);
    const pct = totalRecibido > 0 ? Math.min(100, Math.round(totalPagado / totalRecibido * 100)) : 0;
    const mayorRecibido = recibidos.length ? recibidos.reduce((mx, m) => m.monto > mx.monto ? m : mx, recibidos[0]) : null;
    const mayorPago = pagos.length ? pagos.reduce((mx, m) => m.monto > mx.monto ? m : mx, pagos[0]) : null;
    const ultimoMov = movsTodos.length ? movsTodos[movsTodos.length - 1] : null;
    const colorDeuda = totalMisDeudas > 0 ? 'var(--red)' : 'var(--accent)';
    const primerMiDeuda = datos.misDeudas[0];

    html += `<div style="background:rgba(240,104,104,.07);border:1px solid rgba(240,104,104,.22);border-radius:var(--radius-sm);padding:13px 14px;margin-bottom:10px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <div style="font-size:10px;color:var(--red);text-transform:uppercase;letter-spacing:1px;font-family:'DM Mono',monospace;font-weight:600;display:flex;align-items:center;gap:5px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> Le debo
        </div>
        <button type="button" ${Events.attr('prestado-personas:irAMiDeuda', primerMiDeuda.id)} style="font-size:11px;color:var(--accent);background:none;border:none;cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:600;">Ver detalle →</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px;">
        <div style="background:var(--bg3);border-radius:8px;padding:9px 10px;">
          <div style="font-size:9px;color:var(--text3);font-family:'DM Mono',monospace;text-transform:uppercase;margin-bottom:3px;">Pendiente</div>
          <div style="font-size:15px;font-weight:600;font-family:'DM Mono',monospace;color:${colorDeuda};">${fmt(totalMisDeudas)}</div>
        </div>
        <div style="background:var(--bg3);border-radius:8px;padding:9px 10px;">
          <div style="font-size:9px;color:var(--text3);font-family:'DM Mono',monospace;text-transform:uppercase;margin-bottom:3px;">Recibido</div>
          <div style="font-size:15px;font-weight:600;font-family:'DM Mono',monospace;color:var(--amber);">${fmt(totalRecibido)}</div>
        </div>
        <div style="background:var(--bg3);border-radius:8px;padding:9px 10px;">
          <div style="font-size:9px;color:var(--text3);font-family:'DM Mono',monospace;text-transform:uppercase;margin-bottom:3px;">He pagado</div>
          <div style="font-size:15px;font-weight:600;font-family:'DM Mono',monospace;color:var(--accent);">${fmt(totalPagado)}</div>
        </div>
      </div>
      ${totalRecibido > 0 ? `<div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text3);margin-bottom:4px;font-family:'DM Mono',monospace;">
          <span>Progreso de pago</span><span>${pct}%</span>
        </div>
        <div style="height:4px;background:var(--bg4);border-radius:2px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:${pct===100?'var(--accent)':'var(--red)'};border-radius:2px;transition:width .4s;"></div>
        </div>
      </div>` : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;">
        ${mayorRecibido ? `<div style="background:var(--bg3);border-radius:8px;padding:9px 10px;">
          <div style="font-size:9px;color:var(--text3);font-family:'DM Mono',monospace;text-transform:uppercase;margin-bottom:3px;">Mayor préstamo</div>
          <div style="font-size:14px;font-weight:600;font-family:'DM Mono',monospace;color:var(--red);">${fmt(mayorRecibido.monto)}</div>
          ${mayorRecibido.fecha ? `<div style="font-size:10px;color:var(--text3);margin-top:2px;">${mayorRecibido.fecha}</div>` : ''}
        </div>` : ''}
        ${mayorPago ? `<div style="background:var(--bg3);border-radius:8px;padding:9px 10px;">
          <div style="font-size:9px;color:var(--text3);font-family:'DM Mono',monospace;text-transform:uppercase;margin-bottom:3px;">Mayor pago</div>
          <div style="font-size:14px;font-weight:600;font-family:'DM Mono',monospace;color:var(--accent);">${fmt(mayorPago.monto)}</div>
          ${mayorPago.fecha ? `<div style="font-size:10px;color:var(--text3);margin-top:2px;">${mayorPago.fecha}</div>` : ''}
        </div>` : ''}
      </div>
      ${ultimoMov ? `<div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border);font-size:11px;color:var(--text3);">
        Último mov: <span style="color:var(--text2);font-weight:500;">${ultimoMov.tipo === 'recibido' ? 'Recibí' : 'Pagué'} ${fmt(ultimoMov.monto)}</span>${ultimoMov.fecha ? ' · ' + ultimoMov.fecha : ''}${ultimoMov.nota ? ' · <i>' + escHtml(ultimoMov.nota) + '</i>' : ''}
      </div>` : ''}
    </div>`;
  }

  if (!datos.deudor && !datos.encargos.length && !spEntry && !(datos.misDeudas && datos.misDeudas.length)) {
    html += `<div style="font-size:12px;color:var(--text3);padding:8px 0 14px;line-height:1.6;">Esta persona no tiene préstamos, encargos ni está en Spotify todavía.</div>`;
  }

  body.innerHTML = html;
  document.getElementById('sheet-perfil-persona').classList.add('open');
}

function _editarPersonaDesdePerfilSheet() {
  if (!_perfilPersonaId) return;
  abrirEditarPersonaGlobal(_perfilPersonaId);
  document.getElementById('sheet-perfil-persona').classList.remove('open');
}

// _irADeudor() migrada a js/modules/prestado-personas.js.

// _irAEncargo() migrada a js/modules/encargos-personas.js.

function _irASpotify() {
  document.getElementById('sheet-perfil-persona').classList.remove('open');
  setTimeout(() => { showScreen('spotify'); }, 180);
}

/* ── RENDERIZADO DEL COLOR PICKER ──────────────────────────────── */
function _renderColorPicker(containerId, varName) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const current = window[varName] || PERSONA_COLORES[0];
  el.innerHTML = PERSONA_COLORES.map(c =>
    `<div ${Events.attr('personas:seleccionarColor', containerId, varName, c)}
      style="width:30px;height:30px;border-radius:50%;background:${c};cursor:pointer;
      border:${c === current ? '2.5px solid var(--accent)' : '2px solid transparent'};
      box-shadow:${c === current ? '0 0 0 2px rgba(200,240,96,.35)' : 'none'};
      transition:all .15s;"></div>`
  ).join('');
}

// Handler del color picker: window[varName] sigue el mismo patrón que ya usaba
// el onclick inline (_cpgColorSel / _epgColorSel son variables globales reales,
// no strings mágicos) — solo se movió la asignación de un atributo HTML a acá.
function _seleccionarColorPersona(containerId, varName, color) {
  window[varName] = color;
  _renderColorPicker(containerId, varName);
}

// Selector de persona en "Nuevo encargo" (+ hooks de openSheet/crearEncargo) migrado a js/modules/encargos-personas.js.

// Integración "nueva persona de Préstamos también usa S.personas" y el hook
// de refresco al editar desde el sheet global migrados a
// js/modules/prestado-personas.js — ver docs/prestado.md.

// Integración de Encargos con Personas migrada a js/modules/encargos-personas.js
// — mismo motivo que spotify-personas.js: depende de openSheet, getPersona,
// abrirSelPersona y _inyectarPersonaSheets, recién definidos en este punto
// del archivo, por eso carga acá y no junto al resto de Encargos (que está
// arriba, en encargos.js). Ver también docs/encargos.md.

/* ── REGISTRO DE EVENTOS (data-action → handler) ───────────────── */
// Reemplaza los onclick inline propios de este módulo. El botón "Ver →" de
// cada encargo en el perfil de persona (arriba) ya usa
// data-action="encargos-personas:irAEncargo" en vez de onclick — se registra
// desde encargos-personas.js, no desde acá, porque _irAEncargo() vive ahí
// (ver docs/auditoria-tecnica.md, nota 2026-07-29).
Events.registerAll('personas', {
  abrirPerfil: abrirPerfilPersona,
  abrirCrearGlobal: _abrirCrearPersonaGlobal,
  confirmarCrear: _crearPersonaGlobal,
  volverASel: _volverASelPersona,
  editarDesdePerfil: _editarPersonaDesdePerfilSheet,
  guardarEdicion: _guardarEditarPersonaGlobal,
  selElegir: _selPersonaElegir,
  selCrearDirecto: _selPersonaCrearDirecto,
  irASpotify: _irASpotify,
  seleccionarColor: _seleccionarColorPersona,
});
