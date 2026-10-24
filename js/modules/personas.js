/* ═══════════════════════════════════════════════════════════════
   js/modules/personas.js

   Módulo Personas — libreta central de identidad compartida por
   Encargos, Préstamos ("Me deben" / "Yo debo") y Spotify.

   Este archivo es el NÚCLEO del sistema de Personas: modelo de datos
   (S.personas), pantalla "Personas" (lista + perfil), y los sheets
   compartidos de seleccionar/crear/editar persona.

   La integración de cada módulo con Personas vive en el propio módulo, no
   en este archivo (los archivos *-personas.js que existieron se fusionaron
   de vuelta el 2026-08-03):
     - Encargos:  js/modules/encargos.js (selector en "Nuevo encargo",
                  hook que exige personaId, botones de perfil, _irAEncargo)
     - Spotify:   js/modules/spotify.js
     - Préstamos: js/modules/prestado.js
   Este archivo no las llama a nivel superior: personas.js carga antes que
   esos módulos y ellos usan sus funciones (getPersona, abrirSelPersona,
   _inyectarPersonaSheets) solo dentro de handlers, es decir en el click.

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
  const deudores = Deudas.lista('favor').filter(d => d.personaId === personaId);
  const deudor = deudores[0] || null; // compatibilidad: primer deudor para referencias puntuales
  const saldoEncargos = encargos.reduce((a, e) => a + encargoSaldo(e), 0);
  const saldoPrestamo = deudores.reduce((a, d) => a + (typeof getDeudorSaldo === 'function' ? getDeudorSaldo(d) : 0), 0);
  // misDeudas: lo que YO le debo a esta persona
  const misDeudas = Deudas.lista('contra').filter(d => d.personaId === personaId);
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
      <p class="pe-intro">Elige una persona existente o crea una nueva.</p>
      <div id="sel-persona-buscar-wrap" class="ig pe-sel-wrap">
        <input type="text" id="sel-persona-buscar" placeholder="Buscar persona..." autocomplete="off"
          class="pe-sel-input">
        <svg class="pe-sel-lupa" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      </div>
      <div id="sel-persona-lista" class="pe-sel-lista"></div>
      <button type="button" class="btn btn-ghost pe-btn-nueva" ${Events.attr('personas:abrirCrearGlobal', false)}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Nueva persona
      </button>
      <button type="button" class="btn btn-ghost pe-btn-cancelar" data-close-sheet="sel-persona">Cancelar</button>
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
        <div class="pe-colores" id="cpg_colores"></div>
      </div>
      <button type="button" class="btn btn-primary" ${Events.attr('personas:confirmarCrear')}>Crear persona</button>
      <button type="button" class="btn btn-ghost pe-btn-cancelar" ${Events.attr('personas:volverASel')}>← Volver</button>
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
      <div id="pperf-header" class="pe-perf-cab">
        <div id="pperf-avatar" class="avatar pe-av-46"></div>
        <div class="pe-flex1-min0">
          <div id="pperf-nombre" class="pe-perf-nombre"></div>
          <div id="pperf-sub" class="pe-perf-sub"></div>
        </div>
        <button type="button" class="btn-icon pe-c-accent" ${Events.attr('personas:editarDesdePerfil')} title="Editar">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
      </div>
      <div id="pperf-body"></div>
      <button type="button" class="btn btn-ghost pe-mt10" data-close-sheet="perfil-persona">Cerrar</button>
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
        <div class="pe-colores" id="epg_colores"></div>
      </div>
      <button type="button" class="btn btn-primary" ${Events.attr('personas:guardarEdicion')}>Guardar cambios</button>
      <button type="button" class="btn btn-ghost pe-btn-cancelar" data-close-sheet="editar-persona-global">Cancelar</button>
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
  const sinPerfil = Deudas.lista('favor').filter(d => !d.personaId);
  // misDeudas sin vincular (sin personaId)
  const sinPerfilMisDeudas = Deudas.lista('contra').filter(d => !d.personaId);

  const total = personas.length + sinPerfil.length + sinPerfilMisDeudas.length;
  if (!total) {
    body.innerHTML = '';
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  // contenido: array de fragmentos html`` — no `let html=''` para no tapar
  // la función global html`` (mismo hallazgo de sombra de variable ya
  // corregido en mesada.js/gastos.js, ver auditoria-tecnica.md).
  const contenido = [];

  // Personas con perfil
  personas.forEach(p => {
    const color = p.color || '#60b0f0';
    const datos = getPersonaDatos(p.id);
    const partesFrag = [];
    if (datos.deudor) {
      const saldo = datos.saldoPrestamo;
      partesFrag.push(saldo !== 0
        ? html`<span class="pe-c-amber">${fmt(saldo)} pendiente</span>`
        : html`<span class="pe-c-accent">Al día</span>`);
    }
    if (datos.encargos.length) partesFrag.push(html`${datos.encargos.length} encargo${datos.encargos.length !== 1 ? 's' : ''}`);
    if (datos.misDeudas && datos.misDeudas.length) {
      const saldoMD = datos.saldoMisDeudas;
      partesFrag.push(saldoMD > 0
        ? html`<span class="pe-c-red">Le debes ${fmt(saldoMD)}</span>`
        : html`<span class="pe-c-accent">Deuda saldada</span>`);
    }
    // partesConSeparador: array plano de fragmentos html`` intercalados con
    // el string ' · ' — interpolar el array directo (sin .join()) deja que
    // el html`` exterior concatene cada elemento sin volver a escapar los
    // fragmentos ya seguros ni el separador (texto fijo, sin caracteres
    // especiales) — mismo patrón sin .join() ya validado en inicio.js/analisis.js.
    const partesConSeparador = partesFrag.flatMap((f, i) => i === 0 ? [f] : [' · ', f]);
    const subTexto = partesFrag.length
      ? partesConSeparador
      : html`<span class="pe-c-text3">Sin actividad</span>`;

    contenido.push(html`<div ${raw(Events.attr('personas:abrirPerfil', p.id))} class="_persona-row-hover pe-fila" data-hover-color="${color}">
      <div class="avatar pe-av-40" style="color:${color};background:${color}18;border-color:${color}33;">${iniciales(p.nombre)}</div>
      <div class="pe-flex1-min0">
        <div class="pe-nombre">${p.nombre}</div>
        <div class="pe-sub">${subTexto}</div>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2" stroke-linecap="round" class="pe-chev"><polyline points="9 18 15 12 9 6"/></svg>
    </div>`);
  });

  // Deudores sin perfil vinculado
  sinPerfil.forEach(d => {
    const color = d.color || '#60b0f0';
    const saldo = getDeudorSaldo(d);
    const sub = saldo > 0
      ? html`<span class="pe-c-amber">${fmt(saldo)} pendiente</span>`
      : saldo < 0
        ? html`<span class="pe-c-red">Saldo a su favor</span>`
        : html`<span class="pe-c-accent">Al día</span>`;
    contenido.push(html`<div ${raw(Events.attr('prestado:abrirPerfilDeudor', d.id))} class="_persona-row-hover pe-fila" data-hover-color="${color}">
      <div class="avatar pe-av-40" style="color:${color};background:${color}18;border-color:${color}33;">${d.nombre.substring(0,2).toUpperCase()}</div>
      <div class="pe-flex1-min0">
        <div class="pe-nombre">${d.nombre}</div>
        <div class="pe-sub">${sub}</div>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2" stroke-linecap="round" class="pe-chev"><polyline points="9 18 15 12 9 6"/></svg>
    </div>`);
  });

  // misDeudas sin perfil vinculado (le debo a alguien sin persona)
  sinPerfilMisDeudas.forEach(d => {
    const color = d.color || '#f06868';
    const saldo = getMiDeudaSaldo(d);
    const sub = saldo > 0
      ? html`<span class="pe-c-red">Le debes ${fmt(saldo)}</span>`
      : html`<span class="pe-c-accent">Saldado</span>`;
    contenido.push(html`<div ${raw(Events.attr('prestado-personas:abrirPerfilMiDeuda', d.id))} class="_persona-row-hover pe-fila" data-hover-color="${color}">
      <div class="avatar pe-av-40" style="color:${color};background:${color}18;border-color:${color}33;">${d.nombre.substring(0,2).toUpperCase()}</div>
      <div class="pe-flex1-min0">
        <div class="pe-nombre">${d.nombre}</div>
        <div class="pe-sub">${sub}</div>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2" stroke-linecap="round" class="pe-chev"><polyline points="9 18 15 12 9 6"/></svg>
    </div>`);
  });

  body.innerHTML = html`${contenido}`;

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
  const total = (S.personas || []).length + Deudas.lista('favor').filter(d => !d.personaId).length + Deudas.lista('contra').filter(d => !d.personaId).length;
  const txt = total ? total + ' persona' + (total !== 1 ? 's' : '') + ' registrada' + (total !== 1 ? 's' : '') : 'Perfiles y actividad financiera';
  // Actualizar en Config
  const cfgSub = document.getElementById('cfg-personas-sub');
  if (cfgSub) cfgSub.textContent = txt;
}
let _selPersonaCallback = null; // fn(personaId) llamada al seleccionar
let _selPersonaTitulo = '¿De quién es la plata?'; // título del sheet, según quién lo abrió
let _selPersonaExcluir = null; // fn(persona) → true si NO se debe ofrecer (ej. ya está en la lista donde se agrega)

// abrirSelPersona(callback, titulo, opts)
//   callback(personaId)  se llama al elegir (o al crear una persona nueva desde el selector).
//   titulo               texto del sheet; sin él queda el de Encargos ("¿De quién es la plata?").
//   opts.excluir         fn(persona) → true para ocultar a esa persona (ej. quien ya tiene una deuda
//                        en la lista donde se está agregando: no se puede agregar dos veces).
function abrirSelPersona(callback, titulo, opts) {
  _selPersonaCallback = callback;
  _selPersonaTitulo = titulo || '¿De quién es la plata?';
  _selPersonaExcluir = (opts && typeof opts.excluir === 'function') ? opts.excluir : null;
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
  const todas = S.personas || [];
  const excluidas = _selPersonaExcluir ? todas.filter(p => _selPersonaExcluir(p)) : [];
  const personas = todas.filter(p => !(_selPersonaExcluir && _selPersonaExcluir(p)) && (!q || p.nombre.toLowerCase().includes(q)));
  if (!personas.length) {
    // Lo que escribió coincide exacto con alguien que ya está en esa lista: no tiene sentido ofrecer crearla de nuevo.
    const yaEsta = q && excluidas.find(p => p.nombre.trim().toLowerCase() === q);
    if (yaEsta) {
      lista.innerHTML = html`<div class="pe-vacio-12">${yaEsta.nombre} ya está en esta lista.</div>`;
      return;
    }
    // Todas las personas que existen ya están en la lista: solo queda crear una nueva.
    if (!q && excluidas.length) {
      lista.innerHTML = html`<div class="pe-vacio-12">Todas tus personas ya están en esta lista. Crea una nueva.</div>`;
      return;
    }
    lista.innerHTML = html`${q
      ? html`<div class="pe-pad10">
          <div class="pe-sin-res">No se encontró "${q}".</div>
          <button type="button" ${raw(Events.attr('personas:selCrearDirecto'))} class="pe-btn-crear">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Crear a "${q}"
          </button>
        </div>`
      : html`<div class="pe-vacio-12">No hay personas todavía. Creá una nueva.</div>`}`;
    return;
  }
  // items: array de fragmentos html`` por persona — se interpolan directo
  // (sin .join('')) en el html`` final, igual criterio que arriba.
  const items = personas.map(p => {
    const datos = getPersonaDatos(p.id);
    const badges = [];
    if (datos.deudor) {
      const saldo = datos.saldoPrestamo;
      badges.push(saldo > 0
        ? html`<span class="badge bg-amber pe-fs9">Préstamo ${fmt(saldo)}</span>`
        : html`<span class="badge bg-blue pe-fs9">Préstamos</span>`);
    }
    if (datos.encargos.length) badges.push(html`<span class="badge bg-blue pe-fs9">${datos.encargos.length} encargo${datos.encargos.length !== 1 ? 's' : ''}</span>`);
    if (datos.misDeudas && datos.misDeudas.length) {
      const saldoMD = datos.saldoMisDeudas;
      badges.push(saldoMD > 0
        ? html`<span class="badge pe-badge-debes">Le debes ${fmt(saldoMD)}</span>`
        : html`<span class="badge bg-green pe-fs9">Deuda saldada</span>`);
    }
    return html`<div ${raw(Events.attr('personas:selElegir', p.id))} class="_sel-persona-row pe-sel-fila">
      <div class="avatar pe-av-36" style="background:${p.color}18;color:${p.color};border-color:${p.color}33;">${iniciales(p.nombre)}</div>
      <div class="pe-flex1-min0">
        <div class="pe-nombre">${p.nombre}</div>
        ${badges.length ? html`<div class="pe-badges">${badges}</div>` : ''}
      </div>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
    </div>`;
  });
  lista.innerHTML = html`${items}`;
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
    abrirSelPersona(_selPersonaCallback, _selPersonaTitulo, { excluir: _selPersonaExcluir });
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
  Deudas.lista('favor').forEach(d => { if (d.personaId === p.id) { d.nombre = nombre; d.color = _epgColorSel; } });
  // Sincronizar nombre en encargos vinculados
  (S.encargos || []).forEach(e => { if (e.personaId === p.id) e.nombre = nombre; });
  // Sincronizar nombre y color en misDeudas vinculadas
  Deudas.lista('contra').forEach(d => { if (d.personaId === p.id) { d.nombre = nombre; d.color = _epgColorSel; } });
  // Sincronizar nombre en integrantes de Spotify vinculados (el campo crudo .nombre
  // se usa directo en la validación de nombres duplicados de addSpotify)
  (S.spotify.personas || []).forEach(sp => { if (sp.personaId === p.id) sp.nombre = nombre; });
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
  const spEntry = (S.spotify.personas || []).find(sp => sp.personaId === personaId);
  const partes = [];
  if (datos.deudor) partes.push('Préstamos');
  if (datos.encargos.length) partes.push(datos.encargos.length + ' encargo' + (datos.encargos.length !== 1 ? 's' : ''));
  if (spEntry) partes.push('Spotify');
  if (datos.misDeudas && datos.misDeudas.length) partes.push('Le debo');
  if (sb) sb.textContent = partes.length ? partes.join(' · ') : 'Sin actividad registrada';

  const body = document.getElementById('pperf-body');
  if (!body) return;

  // contenido: array de fragmentos html`` — no `let html=''` para no tapar
  // la función global html`` (mismo hallazgo de sombra de variable ya
  // corregido en mesada.js/gastos.js). Cada bloque condicional que antes
  // era un template string suelto (`${cond ? \`<div>...\` : ''}`) ahora
  // usa el tag html`` también en la rama anidada — así el fragmento
  // interno llega ya marcado __raw y el html`` exterior lo interpola sin
  // volver a escaparlo (verificado contra la implementación real de
  // js/core/html-tag.js, ver auditoria-tecnica.md nota 2026-08-26).
  const contenido = [];

  // ── Sección Préstamos ──
  if (datos.deudor) {
    const d = datos.deudor;
    const saldo = datos.saldoPrestamo;
    // Consolidar movimientos de TODOS los deudores vinculados a esta persona
    const movs = (datos.deudores || [datos.deudor]).flatMap(dd => dd.movimientos || [])
      .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
    const prestamos = movs.filter(m => m.tipo === 'prestamo');
    // Lo perdonado (m._perdon, "¿Se lo regalas?" en Préstamos) NO es plata que
    // te devolvió: no cuenta en "Abonado", ni en el progreso de pago, ni en "Mayor abono".
    const abonos   = movs.filter(m => (m.tipo === 'abono' || m.tipo === 'pago-completo') && !m._perdon);
    const totalPrestado = prestamos.reduce((a, m) => a + (m.monto || 0), 0);
    const totalAbonado  = abonos.reduce((a, m) => a + (m.monto || 0), 0);
    const color2 = saldo > 0 ? 'pe-c-amber' : saldo < 0 ? 'pe-c-red' : 'pe-c-accent';
    const pct = totalPrestado > 0 ? Math.min(100, Math.round(totalAbonado / totalPrestado * 100)) : 0;

    // Stats interesantes
    const mayorPrestamo = prestamos.length ? prestamos.reduce((mx, m) => m.monto > mx.monto ? m : mx, prestamos[0]) : null;
    const mayorAbono    = abonos.length    ? abonos.reduce((mx, m) => m.monto > mx.monto ? m : mx, abonos[0])       : null;
    const cuantasveces  = prestamos.length;
    const diasDesde     = movs.length ? Math.floor((new Date() - new Date(movs[0].fecha + 'T00:00:00')) / 86400000) : null;
    const ultimoMov     = movs.length ? movs[movs.length - 1] : null;

    contenido.push(html`<div class="pe-card-amber">
      <div class="pe-cab">
        <div class="pe-cab-cap-amber"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> Préstamos</div>
        <button type="button" ${raw(Events.attr('prestado-personas:irADeudor', d.id))} class="pe-ver-detalle">Ver detalle →</button>
      </div>
      <div class="pe-grid3">
        <div class="pe-celda">
          <div class="pe-celda-cap">Pendiente</div>
          <div class="pe-val15 ${color2}">${fmt(saldo)}</div>
        </div>
        <div class="pe-celda">
          <div class="pe-celda-cap">Prestado</div>
          <div class="pe-val-text">${fmt(totalPrestado)}</div>
        </div>
        <div class="pe-celda">
          <div class="pe-celda-cap">Abonado</div>
          <div class="pe-val-accent">${fmt(totalAbonado)}</div>
        </div>
      </div>
      ${totalPrestado > 0 ? html`<div class="pe-mb10">
        <div class="pe-prog-cab">
          <span>Progreso de pago</span><span>${pct}%</span>
        </div>
        <div class="pe-prog-barra">
          <div class="pe-fill ${pct===100?'pe-bg-accent':'pe-bg-amber'}" style="width:${pct}%;"></div>
        </div>
      </div>` : ''}
      <div class="pe-grid2-gap7">
        ${mayorPrestamo ? html`<div class="pe-celda">
          <div class="pe-celda-cap">Mayor préstamo</div>
          <div class="pe-val14-amber">${fmt(mayorPrestamo.monto)}</div>
          ${mayorPrestamo.fecha ? html`<div class="pe-fecha10">${mayorPrestamo.fecha}</div>` : ''}
        </div>` : ''}
        ${mayorAbono ? html`<div class="pe-celda">
          <div class="pe-celda-cap">Mayor abono</div>
          <div class="pe-val14-accent">${fmt(mayorAbono.monto)}</div>
          ${mayorAbono.fecha ? html`<div class="pe-fecha10">${mayorAbono.fecha}</div>` : ''}
        </div>` : ''}
        <div class="pe-celda">
          <div class="pe-celda-cap">Veces prestado</div>
          <div class="pe-val14-text">${cuantasveces}x</div>
        </div>
        ${diasDesde !== null ? html`<div class="pe-celda">
          <div class="pe-celda-cap">Relación activa</div>
          <div class="pe-val14-text">${diasDesde}d</div>
        </div>` : ''}
      </div>
      ${ultimoMov ? html`<div class="pe-ultimo">
        Último movimiento: <span class="pe-ultimo-val">${ultimoMov.tipo === 'prestamo' ? 'Préstamo' : (ultimoMov._perdon ? 'Deuda perdonada' : (ultimoMov.tipo === 'pago-completo' ? 'Pago completo' : 'Abono'))} de ${fmt(ultimoMov.monto)}</span>${ultimoMov.fecha ? ' · ' + ultimoMov.fecha : ''}${ultimoMov.nota ? html` · <i>${ultimoMov.nota}</i>` : ''}
      </div>` : ''}
    </div>`);
  }

  // ── Sección Encargos ──
  if (datos.encargos.length) {
    const totalEnc = datos.saldoEncargos;
    // Stats encargos
    const todosMovEnc = datos.encargos.flatMap(e => (e.movimientos || []).map(m => ({...m, _enc: e})));
    const entradasEnc = todosMovEnc.filter(m => m.tipo === 'entrada' || m.tipo === 'deposito' || !m.tipo || m.monto > 0);
    const mayorEntrada = entradasEnc.length ? entradasEnc.reduce((mx, m) => (m.monto||0) > (mx.monto||0) ? m : mx, entradasEnc[0]) : null;
    const encargoMayor = datos.encargos.length ? [...datos.encargos].sort((a,b) => encargoSaldo(b) - encargoSaldo(a))[0] : null;

    contenido.push(html`<div class="pe-card-azul">
      <div class="pe-cab">
        <div class="pe-cab-cap-azul"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg> Encargos</div>
        <span class="pe-enc-n">${datos.encargos.length} encargo${datos.encargos.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="pe-grid2-mb10">
        <div class="pe-celda">
          <div class="pe-celda-cap">Total activo</div>
          <div class="pe-val15-azul">${fmt(totalEnc)}</div>
        </div>
        <div class="pe-celda">
          <div class="pe-celda-cap">Cantidad</div>
          <div class="pe-val-text">${datos.encargos.length}</div>
        </div>
        ${encargoMayor ? html`<div class="pe-celda">
          <div class="pe-celda-cap">Encargo mayor</div>
          <div class="pe-val13-azul">${fmt(encargoSaldo(encargoMayor))}</div>
          <div class="pe-nota10">${encargoMayor.nota||encargoMayor.nombre}</div>
        </div>` : ''}
        ${mayorEntrada ? html`<div class="pe-celda">
          <div class="pe-celda-cap">Mayor entrada</div>
          <div class="pe-val13-accent">${fmt(mayorEntrada.monto)}</div>
          ${mayorEntrada.fecha ? html`<div class="pe-fecha10-mt1">${mayorEntrada.fecha}</div>` : ''}
        </div>` : ''}
      </div>
      ${datos.encargos.map(e => {
        const saldoE = encargoSaldo(e);
        return html`<div class="pe-enc-fila">
          <div class="pe-enc-nom">${e.nota || e.nombre}</div>
          <div class="pe-enc-der">
            <div class="pe-enc-saldo">${fmt(saldoE)}</div>
            <button type="button" ${raw(Events.attr('encargos-personas:irAEncargo', e.id))} class="pe-ver-detalle">Ver →</button>
          </div>
        </div>`;
      })}
    </div>`);
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
      ? html`<span class="badge bg-green pe-fs9">Pagó este ciclo</span>`
      : html`<span class="badge bg-red pe-fs9">Pendiente</span>`;

    // Stats Spotify de esta persona
    const histSp = (S.spotify.historial || []).filter(h => h.tipo === 'cobro' && h.nombre === spEntry.nombre);
    const totalCobradoSp = histSp.reduce((a, h) => a + (h.monto || 0), 0);
    const mayorCobroSp   = histSp.length ? histSp.reduce((mx, h) => h.monto > mx.monto ? h : mx, histSp[0]) : null;
    const diasEnPlan     = spEntry.fechaIngreso
      ? Math.floor((new Date() - new Date(spEntry.fechaIngreso + 'T00:00:00')) / 86400000)
      : null;
    const mesesEstimados = diasEnPlan !== null ? Math.floor(diasEnPlan / 30) : null;

    contenido.push(html`<div class="pe-card-spotify">
      <div class="pe-cab">
        <div class="pe-cab-cap-spotify">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 64 64" class="pe-sp-ico"><path d="M32 0C14.3 0 0 14.337 0 32c0 17.7 14.337 32 32 32 17.7 0 32-14.337 32-32S49.663 0 32 0zm14.68 46.184c-.573.956-1.797 1.223-2.753.65-7.532-4.588-16.975-5.62-28.14-3.097-1.07.23-2.14-.42-2.37-1.49s.42-2.14 1.49-2.37c12.196-2.79 22.67-1.606 31.082 3.556a2 2 0 0 1 .688 2.753zm3.9-8.717c-.726 1.185-2.256 1.53-3.44.84-8.602-5.276-21.716-6.805-31.885-3.747-1.338.382-2.714-.344-3.097-1.644-.382-1.338.344-2.714 1.682-3.097 11.622-3.517 26.074-1.835 35.976 4.244 1.147.688 1.49 2.217.765 3.403zm.344-9.1c-10.323-6.117-27.336-6.69-37.2-3.708-1.568.497-3.25-.42-3.747-1.988s.42-3.25 1.988-3.747c11.317-3.44 30.127-2.753 41.98 4.282 1.415.84 1.873 2.676 1.032 4.09-.765 1.453-2.638 1.912-4.053 1.07z" fill="#1ed760"/></svg>
          Spotify
        </div>
        <button type="button" ${raw(Events.attr('personas:irASpotify'))} class="pe-ver-detalle">Ver módulo →</button>
      </div>
      <div class="pe-grid2-mb8">
        <div class="pe-celda">
          <div class="pe-celda-cap">Cuota</div>
          <div class="pe-val-text">${fmt(spEntry.monto || 0)}/período</div>
        </div>
        <div class="pe-celda">
          <div class="pe-celda-cap">Estado</div>
          <div class="pe-mt4">${estadoBadge}</div>
        </div>
        ${totalCobradoSp > 0 ? html`<div class="pe-celda">
          <div class="pe-celda-cap">Total cobrado</div>
          <div class="pe-val14-spotify">${fmt(totalCobradoSp)}</div>
          <div class="pe-fecha10-mt1">${histSp.length} cobro${histSp.length !== 1 ? 's' : ''}</div>
        </div>` : ''}
        ${diasEnPlan !== null ? html`<div class="pe-celda">
          <div class="pe-celda-cap">En el plan</div>
          <div class="pe-val14-text">${mesesEstimados !== null ? mesesEstimados + ' período' + (mesesEstimados !== 1 ? 's' : '') : diasEnPlan + 'd'}</div>
          <div class="pe-fecha10-mt1">desde ${spEntry.fechaIngreso}</div>
        </div>` : ''}
        ${mayorCobroSp ? html`<div class="pe-celda-full">
          <div class="pe-celda-cap">Mayor cobro registrado</div>
          <div class="pe-val14-spotify">${fmt(mayorCobroSp.monto)}${mayorCobroSp.nota ? html` <span class="pe-sp-nota">· ${mayorCobroSp.nota}</span>` : ''}</div>
          ${mayorCobroSp.fecha ? html`<div class="pe-fecha10-mt1">${mayorCobroSp.fecha}</div>` : ''}
        </div>` : ''}
      </div>
      ${badgeText ? html`<div>${spEntry.pagado ? '' : html`<span class="badge ${badgeClass} pe-fs9">${badgeText}</span>`}</div>` : ''}
    </div>`);
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
    const colorDeuda = totalMisDeudas > 0 ? 'pe-c-red' : 'pe-c-accent';
    const primerMiDeuda = datos.misDeudas[0];

    contenido.push(html`<div class="pe-card-rojo">
      <div class="pe-cab">
        <div class="pe-cab-cap-rojo">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> Le debo
        </div>
        <button type="button" ${raw(Events.attr('prestado-personas:irAMiDeuda', primerMiDeuda.id))} class="pe-ver-detalle">Ver detalle →</button>
      </div>
      <div class="pe-grid3">
        <div class="pe-celda">
          <div class="pe-celda-cap">Pendiente</div>
          <div class="pe-val15 ${colorDeuda}">${fmt(totalMisDeudas)}</div>
        </div>
        <div class="pe-celda">
          <div class="pe-celda-cap">Recibido</div>
          <div class="pe-val15-amber">${fmt(totalRecibido)}</div>
        </div>
        <div class="pe-celda">
          <div class="pe-celda-cap">He pagado</div>
          <div class="pe-val-accent">${fmt(totalPagado)}</div>
        </div>
      </div>
      ${totalRecibido > 0 ? html`<div class="pe-mb10">
        <div class="pe-prog-cab">
          <span>Progreso de pago</span><span>${pct}%</span>
        </div>
        <div class="pe-prog-barra">
          <div class="pe-fill ${pct===100?'pe-bg-accent':'pe-bg-red'}" style="width:${pct}%;"></div>
        </div>
      </div>` : ''}
      <div class="pe-grid2-gap7">
        ${mayorRecibido ? html`<div class="pe-celda">
          <div class="pe-celda-cap">Mayor préstamo</div>
          <div class="pe-val14-red">${fmt(mayorRecibido.monto)}</div>
          ${mayorRecibido.fecha ? html`<div class="pe-fecha10">${mayorRecibido.fecha}</div>` : ''}
        </div>` : ''}
        ${mayorPago ? html`<div class="pe-celda">
          <div class="pe-celda-cap">Mayor pago</div>
          <div class="pe-val14-accent">${fmt(mayorPago.monto)}</div>
          ${mayorPago.fecha ? html`<div class="pe-fecha10">${mayorPago.fecha}</div>` : ''}
        </div>` : ''}
      </div>
      ${ultimoMov ? html`<div class="pe-ultimo">
        Último mov: <span class="pe-ultimo-val">${ultimoMov.tipo === 'recibido' ? 'Recibí' : 'Pagué'} ${fmt(ultimoMov.monto)}</span>${ultimoMov.fecha ? ' · ' + ultimoMov.fecha : ''}${ultimoMov.nota ? html` · <i>${ultimoMov.nota}</i>` : ''}
      </div>` : ''}
    </div>`);
  }

  if (!datos.deudor && !datos.encargos.length && !spEntry && !(datos.misDeudas && datos.misDeudas.length)) {
    contenido.push(html`<div class="pe-vacio-sin-prestamo">Esta persona no tiene préstamos, encargos ni está en Spotify todavía.</div>`);
  }

  body.innerHTML = html`${contenido}`;
  document.getElementById('sheet-perfil-persona').classList.add('open');
}

function _editarPersonaDesdePerfilSheet() {
  if (!_perfilPersonaId) return;
  abrirEditarPersonaGlobal(_perfilPersonaId);
  document.getElementById('sheet-perfil-persona').classList.remove('open');
}

// _irADeudor() vive en js/modules/prestado.js; _irAEncargo() en js/modules/encargos.js.

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
      class="pe-swatch ${c === current ? 'pe-swatch-sel' : 'pe-swatch-no'}" style="background:${c};"></div>`
  ).join('');
}

// Handler del color picker: window[varName] sigue el mismo patrón que ya usaba
// el onclick inline (_cpgColorSel / _epgColorSel son variables globales reales,
// no strings mágicos) — solo se movió la asignación de un atributo HTML a acá.
function _seleccionarColorPersona(containerId, varName, color) {
  window[varName] = color;
  _renderColorPicker(containerId, varName);
}

// El selector de persona en "Nuevo encargo", la integración de Préstamos con S.personas y el
// refresco al editar desde el sheet global viven en encargos.js y prestado.js. Ver docs/encargos.md
// y docs/prestado.md.

/* ── REGISTRO DE EVENTOS (data-action → handler) ───────────────── */
// Reemplaza los onclick inline propios de este módulo. Los botones "Ver →" del perfil
// (encargos, deudores, mis deudas) usan data-action con el prefijo de su módulo
// ("encargos-personas:irAEncargo", "prestado-personas:irADeudor"...): el prefijo es solo el
// namespace del evento y se registra desde encargos.js / prestado.js, donde viven los handlers.
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
