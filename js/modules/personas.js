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
// Datos vinculados a una persona, con la forma que usan las secciones del perfil y los badges del selector. La fuente es
// Personas.registros (js/core/personas-core.js): ninguna colección se recorre a mano aquí.
function _datosPersona(personaId) {
  const encargos = Personas.registros(personaId, 'encargos');
  const deudores = Personas.registros(personaId, 'me-deben');
  const misDeudas = Personas.registros(personaId, 'yo-debo');
  return {
    encargos, deudores, misDeudas,
    deudor: deudores[0] || null, // primer deudor, para referencias puntuales
    spotify: Personas.registros(personaId, 'spotify')[0] || null,
    saldoEncargos: encargos.reduce((a, e) => a + encargoSaldo(e), 0),
    saldoPrestamo: deudores.reduce((a, d) => a + getDeudorSaldo(d), 0),
    saldoMisDeudas: misDeudas.reduce((a, d) => a + getMiDeudaSaldo(d), 0), // lo que YO le debo a esta persona
  };
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
        <svg aria-hidden="true" class="pe-sel-lupa" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      </div>
      <div id="sel-persona-lista" class="pe-sel-lista"></div>
      <button type="button" class="btn btn-ghost pe-btn-nueva" ${Events.attr('personas:abrirCrearGlobal', false)}>
        <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
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
      <button type="button" class="btn btn-ghost pe-btn-cancelar" ${Events.attr('personas:volverASel')}><svg aria-hidden="true" class="pe-ico-volver" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg> Volver</button>
    </div>`;
  document.body.appendChild(sheetCreate);

  // Sheet: perfil de persona
  const sheetPerfil = document.createElement('div');
  sheetPerfil.className = 'overlay';
  sheetPerfil.id = 'sheet-perfil-persona';
  sheetPerfil.dataset.sheetId = 'perfil-persona';
  sheetPerfil.innerHTML = `
    <div class="sheet" aria-label="Perfil de la persona">
      <div class="sheet-handle"></div>
      <div id="pperf-header" class="pe-perf-cab">
        <div id="pperf-avatar" class="avatar pe-av-46"></div>
        <div class="pe-flex1-min0">
          <div id="pperf-nombre" class="pe-perf-nombre"></div>
          <div id="pperf-sub" class="pe-perf-sub"></div>
        </div>
        <button type="button" class="btn-icon pe-c-accent" ${Events.attr('personas:editarDesdePerfil')} title="Editar">
          <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
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
      <div class="ig"><label class="il" for="epg_alias">Apodo o alias (opcional)</label>
        <input type="text" id="epg_alias" placeholder="Ej: Mami, el flaco…" autocomplete="off"></div>
      <div class="ig"><label class="il" for="epg_notas">Notas (opcional)</label>
        <input type="text" id="epg_notas" placeholder="Ej: prima de Medellín, la del trabajo…" autocomplete="off"></div>
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
/* Tarjeta de PC (css/pc.css): relación bajo el nombre, saldo neto y etiquetas de dónde aparece la persona. En celular esos tres bloques
   están ocultos (css/styles.css) y la fila es la de siempre. Saldo neto = lo que me debe (préstamos) menos lo que yo le debo (Yo debo): el
   mismo criterio de Préstamos e Inicio. El saldo de un encargo NO entra: es plata suya que solo administras, no una deuda a tu favor.
   Todo sale de Personas.relaciones(id) (js/core/personas-core.js): la lista no sabe qué módulos existen. */
const _TONO_CLASE = { ambar: 'pe-c-amber', rojo: 'pe-c-red', ok: 'pe-c-accent' };
// Texto de PC bajo el nombre: lo que dice cada relación (resumen.pc), o «Al día» / «Solo en Spotify» / «Sin actividad».
function _relacionPersonaPc(rels) {
  const partes = rels.map(r => r.resumen && r.resumen.pc).filter(Boolean);
  const conDeudas = rels.some(r => r.tieneSaldo);
  if (partes.length === 1 && partes[0] === 'Spotify' && !conDeudas) return 'Solo en Spotify';
  if (partes.length) return partes.join(' · ');
  return conDeudas ? 'Al día' : 'Sin actividad';
}
function _pieTarjetaPersona(neto, tags) {
  const cls = neto > 0 ? 'pe-c-accent' : neto < 0 ? 'pe-c-red' : 'pe-c-text3';
  const monto = neto > 0 ? '+' + fmt(neto) : neto < 0 ? '\u2212' + fmt(-neto) : 'Al día';
  return html`<div class="personas-pie">
    <div><div class="personas-pie-titulo">Saldo neto</div><div class="personas-saldo-neto ${cls}">${monto}</div></div>
    <div class="personas-etiquetas">${tags.map(t => html`<span class="personas-etiqueta">${t}</span>`)}</div>
  </div>`;
}

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

  // Una fila por persona. No hay «sin perfil»: todo registro de un módulo tiene persona (invariante I1 de personas-core.js;
  // save() avisa si algún código lo rompe). Las archivadas no salen, salvo que se pidan con «Ver archivadas».
  const todas = Personas.lista();
  const archivadas = todas.filter(p => p && p.archivada);
  const personas = [...Personas.activas(), ...(_verArchivadas ? archivadas : [])];

  _pintarResumenPersonas();
  const total = Personas.activas().length;
  const pantallaPersonas = document.getElementById('screen-personas');
  if (pantallaPersonas) pantallaPersonas.dataset.listaVacia = todas.length ? 'no' : 'si'; // PC: sin personas no hay resumen (solo el estado vacío)
  const conteo = document.getElementById('personas-lista-conteo');
  if (conteo) conteo.textContent = total ? ' · ' + total : '';
  if (!todas.length) {
    body.innerHTML = '';
    if (empty) empty.style.display = '';
    _sincronizarFichaPersonas();
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
    const rels = Personas.relaciones(p.id);
    const partesFrag = rels.filter(r => r.resumen && r.resumen.corto).map(r => {
      const c = r.resumen.corto, cls = _TONO_CLASE[c.tono];
      return cls ? html`<span class="${cls}">${c.texto}</span>` : html`${c.texto}`;
    });
    // partesConSeparador: array plano de fragmentos html`` intercalados con
    // el string ' · ' — interpolar el array directo (sin .join()) deja que
    // el html`` exterior concatene cada elemento sin volver a escapar los
    // fragmentos ya seguros ni el separador (texto fijo, sin caracteres
    // especiales) — mismo patrón sin .join() ya validado en inicio.js/analisis.js.
    const partesConSeparador = partesFrag.flatMap((f, i) => i === 0 ? [f] : [' · ', f]);
    const subTexto = partesFrag.length
      ? partesConSeparador
      : html`<span class="pe-c-text3">Sin actividad</span>`;
    const subArchivada = p.archivada ? html`<span class="pe-c-text3">Archivada · </span>` : '';
    const tags = rels.map(r => (r.resumen ? r.resumen.tag : r.etiqueta));

    contenido.push(html`<div ${raw(Events.attr('personas:abrirPerfil', p.id))} class="_persona-row-hover pe-fila" data-hover-color="${color}">
      <div class="avatar pe-av-40" style="color:${color};background:${color}18;border-color:${color}33;">${iniciales(p.nombre)}</div>
      <div class="pe-flex1-min0">
        <div class="pe-nombre">${p.nombre}</div>
        <div class="pe-sub personas-sub-movil">${subArchivada}${subTexto}</div>
        <div class="pe-sub personas-sub-pc">${_relacionPersonaPc(rels)}</div>
      </div>
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2" stroke-linecap="round" class="pe-chev"><polyline points="9 18 15 12 9 6"/></svg>
      ${_pieTarjetaPersona(Personas.posicionNeta(p.id), tags)}
    </div>`);
  });

  if (archivadas.length) {
    contenido.push(html`<button type="button" class="btn btn-ghost" ${raw(Events.attr('personas:alternarArchivadas'))}>${_verArchivadas ? 'Ocultar archivadas' : 'Ver archivadas (' + archivadas.length + ')'}</button>`);
  }
  body.innerHTML = html`${contenido}`;

  // Hover effect (antes onmouseenter/onmouseleave inline — docs/auditoria-tecnica.md #1).
  // No puede ser un :hover en CSS porque el color varía por persona/deudor.
  body.querySelectorAll('._persona-row-hover').forEach(row => {
    const c = row.dataset.hoverColor;
    row.addEventListener('mouseenter', () => { row.style.borderColor = c + '44'; });
    row.addEventListener('mouseleave', () => { row.style.borderColor = 'var(--border)'; });
  });
  _sincronizarFichaPersonas(); // PC: la ficha de la persona abierta (o la primera) a la derecha de la lista
}

// Actualizar el sub-texto del ítem Personas (ahora en Configuración)
function _actualizarMasPersonasSub() {
  const total = Personas.activas().length;
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
  focusSheetField(buscarEl);
}

function _selPersonaFiltrar() {
  const q = (document.getElementById('sel-persona-buscar')?.value || '').toLowerCase().trim();
  const lista = document.getElementById('sel-persona-lista');
  if (!lista) return;
  const todas = Personas.activas();
  const excluidas = _selPersonaExcluir ? todas.filter(p => _selPersonaExcluir(p)) : [];
  const personas = todas.filter(p => !(_selPersonaExcluir && _selPersonaExcluir(p)) && (!q || p.nombre.toLowerCase().includes(q) || (p.alias || '').toLowerCase().includes(q)));
  if (!personas.length) {
    // Lo que escribió coincide exacto con alguien que ya está en esa lista: no tiene sentido ofrecer crearla de nuevo.
    const yaEsta = q && excluidas.find(p => p.nombre.trim().toLowerCase() === q);
    if (yaEsta) {
      lista.innerHTML = emptyInline(yaEsta.nombre+' ya está en esta lista.');
      return;
    }
    // Todas las personas que existen ya están en la lista: solo queda crear una nueva.
    if (!q && excluidas.length) {
      lista.innerHTML = emptyInline('Todas tus personas ya están en esta lista. Crea una nueva.');
      return;
    }
    lista.innerHTML = html`${q
      ? html`<div class="pe-pad10">
          <div class="pe-sin-res">No se encontró "${q}".</div>
          <button type="button" ${raw(Events.attr('personas:selCrearDirecto'))} class="pe-btn-crear">
            <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Crear a "${q}"
          </button>
        </div>`
      : raw(emptyInline('No hay personas todavía. Crea una nueva.'))}`;
    return;
  }
  // items: array de fragmentos html`` por persona — se interpolan directo
  // (sin .join('')) en el html`` final, igual criterio que arriba.
  const items = personas.map(p => {
    const datos = _datosPersona(p.id);
    const badges = [];
    if (datos.deudor) {
      const saldo = datos.saldoPrestamo;
      badges.push(saldo > 0
        ? html`<span class="badge bg-amber pe-fs9">Préstamo ${fmt(saldo)}</span>`
        : html`<span class="badge bg-blue pe-fs9">Préstamos</span>`);
    }
    if (datos.encargos.length) badges.push(html`<span class="badge bg-blue pe-fs9">${datos.encargos.length} encargo${datos.encargos.length !== 1 ? 's' : ''}</span>`);
    if (datos.misDeudas && datos.misDeudas.length) {
      const saldoMisDeudas = datos.saldoMisDeudas;
      badges.push(saldoMisDeudas > 0
        ? html`<span class="badge pe-badge-debes">Le debes ${fmt(saldoMisDeudas)}</span>`
        : html`<span class="badge bg-green pe-fs9">Deuda saldada</span>`);
    }
    return html`<div ${raw(Events.attr('personas:selElegir', p.id))} class="_sel-persona-row pe-sel-fila">
      <div class="avatar pe-av-36" style="background:${p.color}18;color:${p.color};border-color:${p.color}33;">${iniciales(p.nombre)}</div>
      <div class="pe-flex1-min0">
        <div class="pe-nombre">${p.nombre}</div>
        ${badges.length ? html`<div class="pe-badges">${badges}</div>` : ''}
      </div>
      <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
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
  focusSheetField('cpg_nombre');
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
  // Personas.crear no duplica: si ya hay una con ese nombre (sin mirar mayúsculas ni tildes) devuelve la existente.
  const r = Personas.crear({ nombre, color: _cpgColorSel });
  const p = r.persona;
  if (!r.creada) {
    if (_cpgDesdeListaPersonas) { toast('Ya existe «' + p.nombre + '». Si es otra persona, añade un apellido o apodo.', 'err', 4200); return; }
    // Desde un selector: se usa la existente en vez de obligar a cerrar y buscarla.
    toast('Ya existía «' + p.nombre + '»: se eligió esa persona', 'info', 3500);
    document.getElementById('sheet-crear-persona-global').classList.remove('open');
    setTimeout(() => { if (typeof _selPersonaCallback === 'function') _selPersonaCallback(p.id); }, 180);
    return;
  }
  save();
  toast(nombre + ' creado/a', 'ok');
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
  const p = Personas.obtener(personaId);
  if (!p) return;
  _editPersonaGlobalId = personaId;
  _epgColorSel = p.color || PERSONA_COLORES[0];
  _inyectarPersonaSheets();
  document.getElementById('epg_nombre').value = p.nombre;
  document.getElementById('epg_alias').value = p.alias || '';
  document.getElementById('epg_notas').value = p.notas || '';
  _renderColorPicker('epg_colores', '_epgColorSel');
  document.getElementById('sheet-editar-persona-global').classList.add('open');
  focusSheetField('epg_nombre');
}

function _guardarEditarPersonaGlobal() {
  const p = Personas.obtener(_editPersonaGlobalId);
  if (!p) return;
  const nombre = document.getElementById('epg_nombre').value.trim();
  if (!nombre) { toast('Escribe el nombre', 'err'); return; }
  // Personas.editar cambia la persona y deja iguales las copias de nombre/color de TODAS las relaciones (las declara cada una en
  // personas-core.js): un módulo nuevo no puede quedar fuera de la sincronización por olvido.
  const r = Personas.editar(p.id, { nombre, color: _epgColorSel, alias: document.getElementById('epg_alias').value, notas: document.getElementById('epg_notas').value });
  if (!r.ok) {
    toast(r.error === 'duplicado' ? 'Ya existe «' + r.persona.nombre + '». Usa otro nombre (apellido o apodo).' : 'No se pudo guardar', 'err', 4200);
    return;
  }
  save(); refresh();
  _renderListaPersonas();
  if (typeof renderEncargosList === 'function') renderEncargosList();
  if (typeof renderMisDeudasList === 'function') renderMisDeudasList();
  document.getElementById('sheet-editar-persona-global').classList.remove('open');
  toast(nombre + ' actualizado', 'ok');
  // Si había perfil abierto, refrescar
  if (_fichaAbierta && _perfilPersonaId === p.id) {
    setTimeout(() => abrirPerfilPersona(p.id), 200);
  }
  // Avisar a los módulos que muestran a esta persona (Préstamos refresca el detalle abierto) — js/core/ui.js
  Ui.emitir('persona-editada', p.id);
}

/* ── PERFIL DE PERSONA ─────────────────────────────────────────── */
let _perfilPersonaId = null;
let _verArchivadas = false; // la lista de Personas oculta las archivadas hasta que se pidan
let _fichaAbierta = false;
// PC (≥900 px): el perfil de una persona es una ficha dentro de la pantalla Personas (lista | ficha); en celular sigue siendo una hoja.
const _consultaPcPersonas = typeof window.matchMedia === 'function' ? window.matchMedia('(min-width: 900px)') : null;
function _esPcPersonas() { return !!_consultaPcPersonas && _consultaPcPersonas.matches; }
function _mostrarFichaPersona() {
  _fichaAbierta = true;
  const pantalla = document.getElementById('screen-personas');
  if (pantalla) pantalla.dataset.fichaAbierta = 'si';
  document.querySelectorAll('#lista-personas-body .pe-fila[data-args]').forEach(fila => {
    let id = null; try { id = JSON.parse(fila.getAttribute('data-args'))[0]; } catch (e) { /* data-args siempre es JSON */ }
    fila.classList.toggle('persona-fila-activa', fila.getAttribute('data-action') === 'personas:abrirPerfil' && id === _perfilPersonaId);
  });
}
// Como el prototipo, al abrir Personas en PC no hay nadie elegido: se ve el resumen y las tarjetas a todo el ancho, y la ficha aparece al
// tocar una persona (con una elegida el resumen se oculta para que quepan las tarjetas). Aquí solo se repinta la ficha de la persona
// abierta para que no quede vieja; si ya no existe, la ficha se cierra.
function _sincronizarFichaPersonas() {
  const pantalla = document.getElementById('screen-personas');
  if (!pantalla || !pantalla.classList.contains('active')) return;
  if (_perfilPersonaId && Personas.obtener(_perfilPersonaId)) abrirPerfilPersona(_perfilPersonaId);
  else _cerrarFichaPersonas();
}
function _cerrarFichaPersonas() {
  _perfilPersonaId = null;
  _fichaAbierta = false;
  const pantalla = document.getElementById('screen-personas');
  if (pantalla) pantalla.dataset.fichaAbierta = 'no';
  document.querySelectorAll('#lista-personas-body .persona-fila-activa').forEach(fila => fila.classList.remove('persona-fila-activa'));
}
// En PC, tocar la persona que ya está abierta cierra su ficha (así vuelve el resumen); en celular y en cualquier otro caso se abre su perfil.
function _alternarPerfilPersona(personaId) {
  const pantalla = document.getElementById('screen-personas');
  if (_esPcPersonas() && _fichaAbierta && personaId === _perfilPersonaId && pantalla && pantalla.classList.contains('active')) _cerrarFichaPersonas();
  else abrirPerfilPersona(personaId);
}
// Al salir de Personas la ficha se cierra: al volver, otra vez el resumen y nadie elegido.
Ui.pantalla('*', nombre => { if (nombre !== 'personas') _cerrarFichaPersonas(); }, { key: 'personas-cerrar-ficha' });
if (_consultaPcPersonas) {
  const alCambiarModo = e => { if (e.matches) _sincronizarFichaPersonas(); };
  if (_consultaPcPersonas.addEventListener) _consultaPcPersonas.addEventListener('change', alCambiarModo);
  else if (_consultaPcPersonas.addListener) _consultaPcPersonas.addListener(alCambiarModo);
}
// Resumen de la pantalla (solo se ve en PC): mismos totales que Inicio y Préstamos, y quiénes comparten Spotify.
function _pintarResumenPersonas() {
  const poner = (id, texto) => { const el = document.getElementById(id); if (el) el.textContent = texto; };
  const personas = dir => Deudas.lista(dir).filter(d => Deudas.saldo(d) > 0).length;
  const nFavor = personas('favor'), nContra = personas('contra');
  poner('pe-resumen-me-deben', fmtNoCents(Deudas.totalPendiente('favor')));
  poner('pe-resumen-yo-debo', fmtNoCents(Deudas.totalPendiente('contra')));
  poner('pe-resumen-me-deben-sub', nFavor ? nFavor + (nFavor === 1 ? ' persona' : ' personas') : 'Nadie te debe');
  poner('pe-resumen-yo-debo-sub', nContra ? nContra + (nContra === 1 ? ' persona' : ' personas') : 'No debes nada');
  const enSpotify = (S.spotify && S.spotify.integrantes) || [];
  const nombres = enSpotify.map(e => Personas.nombre(e.personaId));
  poner('pe-resumen-spotify', String(enSpotify.length));
  poner('pe-resumen-spotify-sub', nombres.length ? nombres.slice(0, 2).join(' y ') + (nombres.length > 2 ? ' y ' + (nombres.length - 2) + ' más' : '') : 'Nadie');
}

/* ── SECCIONES DEL PERFIL ──────────────────────────────────────────
   El perfil recorre Personas.relaciones(id) (js/core/personas-core.js) y, por cada relación viva, llama a su sección de _PERFIL_SECCIONES.
   Una relación sin sección propia (un módulo nuevo) sale con _perfilSeccionGenerica: etiqueta, saldo y «ver en el módulo». */
function _perfilSeccionPrestamos(datos) {
  const d = datos.deudor;
  const saldo = datos.saldoPrestamo;
  // Consolidar movimientos de TODOS los deudores vinculados a esta persona
  const movimientos = (datos.deudores || [datos.deudor]).flatMap(dd => dd.movimientos || [])
    .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
  const prestamos = movimientos.filter(m => m.tipo === 'prestamo');
  // Lo perdonado (m._perdon, "¿Se lo regalas?" en Préstamos) NO es plata que
  // te devolvió: no cuenta en "Abonado", ni en el progreso de pago, ni en "Mayor abono".
  const abonos   = movimientos.filter(m => esAbonoDeDeuda(m.tipo) && !m._perdon);
  const totalPrestado = prestamos.reduce((a, m) => a + (m.monto || 0), 0);
  const totalAbonado  = abonos.reduce((a, m) => a + (m.monto || 0), 0);
  const color2 = saldo > 0 ? 'pe-c-amber' : saldo < 0 ? 'pe-c-red' : 'pe-c-accent';
  const pct = totalPrestado > 0 ? Math.min(100, Math.round(totalAbonado / totalPrestado * 100)) : 0;

  // Stats interesantes
  const mayorPrestamo = prestamos.length ? prestamos.reduce((mx, m) => m.monto > mx.monto ? m : mx, prestamos[0]) : null;
  const mayorAbono    = abonos.length    ? abonos.reduce((mx, m) => m.monto > mx.monto ? m : mx, abonos[0])       : null;
  const cuantasveces  = prestamos.length;
  const diasDesde     = movimientos.length ? Fecha.diasEntre(movimientos[0].fecha, hoy()) : null;
  const ultimoMovimiento     = movimientos.length ? movimientos[movimientos.length - 1] : null;

  return html`<div class="pe-card-amber">
    <div class="pe-cab">
      <div class="pe-cab-cap-amber"><svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> Préstamos</div>
      <button type="button" ${raw(Events.attr('prestado-personas:irADeudor', d.id))} class="pe-ver-detalle">Ver detalle <i class="fa-solid fa-arrow-right"></i></button>
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
    ${ultimoMovimiento ? html`<div class="pe-ultimo">
      Último movimiento: <span class="pe-ultimo-val">${ultimoMovimiento.tipo === 'prestamo' ? 'Préstamo' : (ultimoMovimiento._perdon ? 'Deuda perdonada' : (ultimoMovimiento.tipo === TIPO_PAGO_COMPLETO ? 'Pago completo' : 'Abono'))} de ${fmt(ultimoMovimiento.monto)}</span>${ultimoMovimiento.fecha ? ' · ' + ultimoMovimiento.fecha : ''}${ultimoMovimiento.nota ? html` · <i>${ultimoMovimiento.nota}</i>` : ''}
    </div>` : ''}
  </div>`;
}

function _perfilSeccionEncargos(datos) {
  const totalEncargo = datos.saldoEncargos;
  // Stats encargos
  const todosMovimientoEncargo = datos.encargos.flatMap(e => (e.movimientos || []).map(m => ({...m, _encargo: e})));
  const entradasEncargo = todosMovimientoEncargo.filter(m => m.tipo === 'entrada' || m.tipo === 'deposito' || !m.tipo || m.monto > 0);
  const mayorEntrada = entradasEncargo.length ? entradasEncargo.reduce((mx, m) => (m.monto||0) > (mx.monto||0) ? m : mx, entradasEncargo[0]) : null;
  const encargoMayor = datos.encargos.length ? [...datos.encargos].sort((a,b) => encargoSaldo(b) - encargoSaldo(a))[0] : null;

  return html`<div class="pe-card-azul">
    <div class="pe-cab">
      <div class="pe-cab-cap-azul"><svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg> Encargos</div>
      <span class="pe-enc-n">${datos.encargos.length} encargo${datos.encargos.length !== 1 ? 's' : ''}</span>
    </div>
    <div class="pe-grid2-mb10">
      <div class="pe-celda">
        <div class="pe-celda-cap">Total activo</div>
        <div class="pe-val15-azul">${fmt(totalEncargo)}</div>
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
        <div class="pe-enc-nom">${e.nota || Personas.nombre(e.personaId)}</div>
        <div class="pe-enc-der">
          <div class="pe-enc-saldo">${fmt(saldoE)}</div>
          <button type="button" ${raw(Events.attr('encargos-personas:irAEncargo', e.id))} class="pe-ver-detalle">Ver <i class="fa-solid fa-arrow-right"></i></button>
        </div>
      </div>`;
    })}
  </div>`;
}

function _perfilSeccionSpotify(datos) {
  const spotifyEntry = datos.spotify;
  const diasRestantes = spotifyEntry.proximoPago
    ? Fecha.diasEntre(hoy(), spotifyEntry.proximoPago)
    : null;
  const vencido = diasRestantes !== null && diasRestantes < 0;
  const hoy0    = diasRestantes === 0;
  const badgeClass = vencido ? 'bg-red' : hoy0 ? 'bg-amber' : 'bg-purple';
  const badgeText  = diasRestantes === null ? '' :
    vencido ? 'Vencido hace ' + Math.abs(diasRestantes) + 'd' :
    hoy0    ? 'Vence hoy' :
              'Paga en ' + diasRestantes + 'd · ' + spotifyEntry.proximoPago;
  const estadoBadge = spotifyEntry.pagado
    ? html`<span class="badge bg-green pe-fs9">Pagó este ciclo</span>`
    : html`<span class="badge bg-red pe-fs9">Pendiente</span>`;

  // Stats Spotify de esta persona
  const historialSpotify = (S.spotify.historial || []).filter(h => h.tipo === 'cobro' && (h.spotifyId ? h.spotifyId === spotifyEntry.id : h.nombre === spotifyEntry.nombre));
  const totalCobradoSpotify = historialSpotify.reduce((a, h) => a + (h.monto || 0), 0);
  const mayorCobroSpotify   = historialSpotify.length ? historialSpotify.reduce((mx, h) => h.monto > mx.monto ? h : mx, historialSpotify[0]) : null;
  const diasEnPlan     = spotifyEntry.fechaIngreso
    ? Fecha.diasEntre(spotifyEntry.fechaIngreso, hoy())
    : null;
  const mesesEstimados = diasEnPlan !== null ? Math.floor(diasEnPlan / 30) : null;

  return html`<div class="pe-card-spotify">
    <div class="pe-cab">
      <div class="pe-cab-cap-spotify">
        <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 64 64" class="pe-sp-ico"><path d="M32 0C14.3 0 0 14.337 0 32c0 17.7 14.337 32 32 32 17.7 0 32-14.337 32-32S49.663 0 32 0zm14.68 46.184c-.573.956-1.797 1.223-2.753.65-7.532-4.588-16.975-5.62-28.14-3.097-1.07.23-2.14-.42-2.37-1.49s.42-2.14 1.49-2.37c12.196-2.79 22.67-1.606 31.082 3.556a2 2 0 0 1 .688 2.753zm3.9-8.717c-.726 1.185-2.256 1.53-3.44.84-8.602-5.276-21.716-6.805-31.885-3.747-1.338.382-2.714-.344-3.097-1.644-.382-1.338.344-2.714 1.682-3.097 11.622-3.517 26.074-1.835 35.976 4.244 1.147.688 1.49 2.217.765 3.403zm.344-9.1c-10.323-6.117-27.336-6.69-37.2-3.708-1.568.497-3.25-.42-3.747-1.988s.42-3.25 1.988-3.747c11.317-3.44 30.127-2.753 41.98 4.282 1.415.84 1.873 2.676 1.032 4.09-.765 1.453-2.638 1.912-4.053 1.07z" fill="#1ed760"/></svg>
        Spotify
      </div>
      <button type="button" ${raw(Events.attr('personas:irASpotify'))} class="pe-ver-detalle">Ver módulo <i class="fa-solid fa-arrow-right"></i></button>
    </div>
    <div class="pe-grid2-mb8">
      <div class="pe-celda">
        <div class="pe-celda-cap">Cuota</div>
        <div class="pe-val-text">${fmt(spotifyEntry.monto || 0)}/período</div>
      </div>
      <div class="pe-celda">
        <div class="pe-celda-cap">Estado</div>
        <div class="pe-mt4">${estadoBadge}</div>
      </div>
      ${totalCobradoSpotify > 0 ? html`<div class="pe-celda">
        <div class="pe-celda-cap">Total cobrado</div>
        <div class="pe-val14-spotify">${fmt(totalCobradoSpotify)}</div>
        <div class="pe-fecha10-mt1">${historialSpotify.length} cobro${historialSpotify.length !== 1 ? 's' : ''}</div>
      </div>` : ''}
      ${diasEnPlan !== null ? html`<div class="pe-celda">
        <div class="pe-celda-cap">En el plan</div>
        <div class="pe-val14-text">${mesesEstimados !== null ? mesesEstimados + ' período' + (mesesEstimados !== 1 ? 's' : '') : diasEnPlan + 'd'}</div>
        <div class="pe-fecha10-mt1">desde ${spotifyEntry.fechaIngreso}</div>
      </div>` : ''}
      ${mayorCobroSpotify ? html`<div class="pe-celda-full">
        <div class="pe-celda-cap">Mayor cobro registrado</div>
        <div class="pe-val14-spotify">${fmt(mayorCobroSpotify.monto)}${mayorCobroSpotify.nota ? html` <span class="pe-sp-nota">· ${mayorCobroSpotify.nota}</span>` : ''}</div>
        ${mayorCobroSpotify.fecha ? html`<div class="pe-fecha10-mt1">${mayorCobroSpotify.fecha}</div>` : ''}
      </div>` : ''}
    </div>
    ${badgeText ? html`<div>${spotifyEntry.pagado ? '' : html`<span class="badge ${badgeClass} pe-fs9">${badgeText}</span>`}</div>` : ''}
  </div>`;
}

function _perfilSeccionLeDebo(datos) {
  const totalMisDeudas = datos.saldoMisDeudas;
  const movimientosTodos = datos.misDeudas.flatMap(d => (d.movimientos || []).map(m => ({...m, _deuda: d})))
    .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
  const recibidos = movimientosTodos.filter(m => m.tipo === 'recibido');
  const pagos = movimientosTodos.filter(m => m.tipo === 'pago');
  const totalRecibido = recibidos.reduce((a, m) => a + (m.monto || 0), 0);
  const totalPagado = pagos.reduce((a, m) => a + (m.monto || 0), 0);
  const pct = totalRecibido > 0 ? Math.min(100, Math.round(totalPagado / totalRecibido * 100)) : 0;
  const mayorRecibido = recibidos.length ? recibidos.reduce((mx, m) => m.monto > mx.monto ? m : mx, recibidos[0]) : null;
  const mayorPago = pagos.length ? pagos.reduce((mx, m) => m.monto > mx.monto ? m : mx, pagos[0]) : null;
  const ultimoMovimiento = movimientosTodos.length ? movimientosTodos[movimientosTodos.length - 1] : null;
  const colorDeuda = totalMisDeudas > 0 ? 'pe-c-red' : 'pe-c-accent';
  const primerMiDeuda = datos.misDeudas[0];

  return html`<div class="pe-card-rojo">
    <div class="pe-cab">
      <div class="pe-cab-cap-rojo">
        <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> Le debo
      </div>
      <button type="button" ${raw(Events.attr('prestado-personas:irAMiDeuda', primerMiDeuda.id))} class="pe-ver-detalle">Ver detalle <i class="fa-solid fa-arrow-right"></i></button>
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
    ${ultimoMovimiento ? html`<div class="pe-ultimo">
      Último movimiento: <span class="pe-ultimo-val">${ultimoMovimiento.tipo === 'recibido' ? 'Recibí' : 'Pagué'} ${fmt(ultimoMovimiento.monto)}</span>${ultimoMovimiento.fecha ? ' · ' + ultimoMovimiento.fecha : ''}${ultimoMovimiento.nota ? html` · <i>${ultimoMovimiento.nota}</i>` : ''}
    </div>` : ''}
  </div>`;
}

// Sección de respaldo para relaciones registradas que no tienen sección propia: se ven en el perfil sin tocar este archivo.
function _perfilSeccionGenerica(datos, rel) {
  const n = rel.registros.length;
  return html`<div class="pe-card-azul">
    <div class="pe-cab">
      <div class="pe-cab-cap-azul">${rel.etiqueta}</div>
      ${rel.pantalla ? html`<button type="button" ${raw(Events.attr('personas:irAPantalla', rel.pantalla))} class="pe-ver-detalle">Ver módulo <i class="fa-solid fa-arrow-right"></i></button>` : ''}
    </div>
    <div class="pe-grid2-mb8">
      <div class="pe-celda">
        <div class="pe-celda-cap">Registros</div>
        <div class="pe-val-text">${n}</div>
      </div>
      ${rel.tieneSaldo ? html`<div class="pe-celda">
        <div class="pe-celda-cap">Saldo</div>
        <div class="pe-val-text">${fmt(Math.abs(rel.saldo))}</div>
      </div>` : ''}
    </div>
  </div>`;
}

const _PERFIL_SECCIONES = {
  'me-deben': _perfilSeccionPrestamos,
  'encargos': _perfilSeccionEncargos,
  'spotify': _perfilSeccionSpotify,
  'yo-debo': _perfilSeccionLeDebo,
};

// Saldo neto con la persona (lo que te debe menos lo que le debes), cuando tiene más de una relación con saldo: es el balance real que
// ninguna sección sola muestra. Mismo criterio que la lista: el saldo de un encargo no entra (es plata suya que solo administras).
function _perfilBalanceNeto(rels, neto) {
  const cls = neto > 0 ? 'pe-c-accent' : neto < 0 ? 'pe-c-red' : 'pe-c-text3';
  const monto = neto > 0 ? '+' + fmt(neto) : neto < 0 ? '\u2212' + fmt(-neto) : 'Al día';
  const detalle = rels.filter(r => r.tieneSaldo).map(r => r.resumen ? r.resumen.tag : r.etiqueta).join(' · ');
  return html`<div class="pe-grid2-mb8">
    <div class="pe-celda">
      <div class="pe-celda-cap">Saldo neto</div>
      <div class="pe-val15 ${cls}">${monto}</div>
    </div>
    <div class="pe-celda">
      <div class="pe-celda-cap">Incluye</div>
      <div class="pe-val-text">${detalle}</div>
    </div>
  </div>`;
}

// Archivar y eliminar: el ciclo de vida de la persona (Personas.archivar/restaurar/eliminar). Eliminar solo aparece si no tiene
// ninguna relación (con historial se archiva).
function _perfilAcciones(p, rels) {
  return html`<div class="pe-mt10">
    ${p.archivada ? html`<div class="pe-sub pe-c-text3">Archivada: no sale en la lista ni en los selectores. Sus préstamos y encargos siguen en su módulo.</div>` : ''}
    ${p.archivada
      ? html`<button type="button" class="btn btn-ghost pe-mt10" ${raw(Events.attr('personas:restaurar', p.id))}>Restaurar</button>`
      : html`<button type="button" class="btn btn-ghost pe-mt10" ${raw(Events.attr('personas:archivar', p.id))}>Archivar</button>`}
    ${rels.length ? '' : html`<button type="button" class="btn btn-ghost pe-mt10" ${raw(Events.attr('personas:eliminar', p.id))}>Eliminar</button>`}
  </div>`;
}

function abrirPerfilPersona(personaId) {
  const p = Personas.obtener(personaId);
  if (!p) return;
  _perfilPersonaId = personaId;
  _inyectarPersonaSheets();
  // El perfil va en la ficha de la pantalla Personas (se navega a ella si hace falta): en PC al lado de las tarjetas y en celular como
  // pantalla propia, como el prototipo (con un botón para volver a la lista).
  const enFicha = true;
  const pantallaPersonas = document.getElementById('screen-personas');
  if (enFicha && pantallaPersonas && !pantallaPersonas.classList.contains('active')) showScreen('personas');
  const pre = enFicha ? 'pficha' : 'pperf';

  const color = p.color || '#60b0f0';
  const av = document.getElementById(pre + '-avatar');
  const nm = document.getElementById(pre + '-nombre');
  const sb = document.getElementById(pre + '-sub');
  if (av) {
    av.textContent = iniciales(p.nombre);
    av.style.background = color + '22';
    av.style.color = color;
    av.style.borderColor = color + '44';
  }
  if (nm) nm.textContent = p.nombre;

  const datos = _datosPersona(personaId);
  const partes = Personas.relaciones(personaId).map(r => (r.resumen ? r.resumen.cab : r.etiqueta));
  if (sb) sb.textContent = partes.length ? partes.join(' · ') : 'Sin actividad registrada';

  const body = document.getElementById(pre + '-body');
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
  if (p.alias || p.notas) contenido.push(html`<div class="pe-sub pe-c-text3">${[p.alias ? '«' + p.alias + '»' : '', p.notas || ''].filter(Boolean).join(' · ')}</div>`);
  const rels = Personas.relaciones(personaId);
  if (rels.filter(r => r.tieneSaldo).length > 1) contenido.push(_perfilBalanceNeto(rels, Personas.posicionNeta(personaId)));
  rels.forEach(r => contenido.push((_PERFIL_SECCIONES[r.id] || _perfilSeccionGenerica)(datos, r)));
  if (!rels.length) contenido.push(raw(emptyInline('Esta persona no tiene préstamos, encargos ni está en Spotify todavía.')));
  contenido.push(_perfilAcciones(p, rels));

  body.innerHTML = html`${contenido}`;
  if (enFicha) _mostrarFichaPersona();
  else document.getElementById('sheet-perfil-persona').classList.add('open');
}

function _editarPersonaDesdePerfilSheet() {
  if (!_perfilPersonaId) return;
  abrirEditarPersonaGlobal(_perfilPersonaId);
  document.getElementById('sheet-perfil-persona').classList.remove('open');
}

/* ── CICLO DE VIDA: archivar, restaurar, eliminar ────── */
function _trasCambioDePersonas(abrirId) {
  save(); refresh();
  if (abrirId && Personas.obtener(abrirId)) _perfilPersonaId = abrirId; else _cerrarFichaPersonas();
  _renderListaPersonas();
}

async function _archivarPersona(personaId) {
  const p = Personas.obtener(personaId);
  if (!p) return;
  const ok = await dialogo('Archivar a ' + p.nombre, 'Deja de aparecer en la lista y en los selectores. Sus préstamos, encargos y movimientos no cambian y se siguen viendo en su módulo. La puedes restaurar cuando quieras.', 'Archivar');
  if (!ok) return;
  Personas.archivar(personaId);
  _trasCambioDePersonas(personaId);
  toast(p.nombre + ' archivado/a', 'ok');
}

function _restaurarPersona(personaId) {
  const p = Personas.obtener(personaId);
  if (!p) return;
  const r = Personas.restaurar(personaId);
  if (!r.ok) {
    toast(r.error === 'duplicado' ? 'Ya hay otra persona llamada «' + r.persona.nombre + '». Cámbiale el nombre a una de las dos antes de restaurar.' : 'No se pudo restaurar', 'err', 4500);
    return;
  }
  _trasCambioDePersonas(personaId);
  toast(p.nombre + ' restaurado/a', 'ok');
}

async function _eliminarPersona(personaId) {
  const p = Personas.obtener(personaId);
  if (!p) return;
  if (Personas.relaciones(personaId).length) {
    await avisarNoSePuede('No se puede eliminar', p.nombre + ' tiene préstamos, encargos o Spotify. Para no perder ese historial, archívala.');
    return;
  }
  const ok = await confirmarEliminar({ titulo: 'Eliminar persona', objeto: 'a ' + p.nombre });
  if (!ok) return;
  const r = Personas.eliminar(personaId);
  if (!r.ok) { toast('No se pudo eliminar', 'err'); return; }
  _trasCambioDePersonas(null);
  toast(p.nombre + ' eliminado/a', 'ok');
}

function _alternarArchivadas() { _verArchivadas = !_verArchivadas; _renderListaPersonas(); }

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


/* ── CAMPO «¿QUIÉN ES?» (PersonaPicker) ──────────────────────────────────────
   Un solo componente para todo campo que elige una persona de S.personas (Spotify agregar/editar, Nuevo encargo). El HTML es
   ESTÁTICO en index.html (no se reescribe en runtime): un <div class="persona-btn" id="PREFIJO-btn" data-action="personas:pickerAbrir"
   data-picker="PREFIJO"> con hijos PREFIJO-avatar, PREFIJO-label, PREFIJO-chevron y, opcional, PREFIJO-hint; más un <input type="hidden">
   con el id `inputId` que guarda el nombre (los formularios y validaciones existentes lo siguen leyendo).
   PersonaPicker.crear({ prefijo, inputId, titulo, alCambiar }) es idempotente por prefijo y devuelve:
     .valor                 personaId elegido (o null)
     .abrir()               abre el selector de personas (no hace nada si está bloqueado)
     .elegir(id)            lo que ocurre al elegir: guarda, pinta y llama alCambiar(id)
     .precargar({personaId, nombre})  muestra un estado existente (editar). Con personaId queda BLOQUEADO (no se puede cambiar de persona)
     .abiertoSinConfirmar   true si se abrió el buscador y se cerró sin elegir a nadie
     .limpiar()             vuelve a «Seleccionar persona…» y quita el bloqueo
     .marcarError()         borde rojo 2 s (para «Selecciona una persona»)  */
const PersonaPicker = (() => {
  const registro = new Map();
  function crear(cfg) {
    const prev = registro.get(cfg.prefijo);
    if (prev) { prev._cfg = cfg; return prev; }
    let valor = null, bloqueado = false, abierto = false, confirmado = false;
    const el = s => document.getElementById(cfg.prefijo + '-' + s);
    const input = () => document.getElementById(cfg.inputId);
    function pintar(persona, nombreLibre) {
      const btn = el('btn'), lbl = el('label'), av = el('avatar');
      const hay = !!(persona || nombreLibre);
      if (btn) { btn.classList.toggle('is-set', hay); btn.classList.remove('is-error'); }
      if (lbl) { lbl.textContent = persona ? persona.nombre : (nombreLibre || 'Seleccionar persona...'); lbl.classList.toggle('is-set', hay); }
      if (av) { if (persona) pintarAvatarPersona(av, persona, { mostrar: true }); else av.style.display = 'none'; }
    }
    function fijarBloqueo(b) {
      bloqueado = !!b;
      const btn = el('btn'), hint = el('hint');
      if (btn) btn.classList.toggle('is-locked', bloqueado); // CSS oculta el chevron
      if (hint) hint.hidden = !bloqueado;
    }
    const api = {
      _cfg: cfg,
      get valor() { return valor; },
      get bloqueado() { return bloqueado; },
      get abiertoSinConfirmar() { return abierto && !confirmado; },
      abrir() {
        if (bloqueado) return;
        abierto = true;
        abrirSelPersona(id => api.elegir(id), api._cfg.titulo || '¿Quién es?');
      },
      elegir(id) {
        const p = Personas.obtener(id);
        if (!p) return;
        valor = id; confirmado = true;
        const i = input(); if (i) i.value = p.nombre;
        pintar(p);
        if (api._cfg.alCambiar) api._cfg.alCambiar(id);
      },
      precargar({ personaId, nombre } = {}) {
        abierto = false; confirmado = false;
        const p = personaId ? Personas.obtener(personaId) : null;
        valor = p ? p.id : null;
        const i = input(); if (i) i.value = p ? p.nombre : (nombre || '');
        pintar(p, p ? '' : nombre);
        fijarBloqueo(!!p);
      },
      limpiar() {
        valor = null; abierto = false; confirmado = false;
        const i = input(); if (i) i.value = '';
        pintar(null);
        fijarBloqueo(false);
      },
      marcarError() {
        const btn = el('btn');
        if (!btn) return;
        btn.classList.add('is-error');
        setTimeout(() => btn.classList.remove('is-error'), 2000);
      },
    };
    registro.set(cfg.prefijo, api);
    return api;
  }
  return { crear, de: prefijo => registro.get(prefijo) || null };
})();
if (typeof window !== 'undefined') window.PersonaPicker = PersonaPicker;

/* ── REGISTRO DE EVENTOS (data-action → handler) ───────────────── */
// Reemplaza los onclick inline propios de este módulo. Los botones "Ver →" del perfil
// (encargos, deudores, mis deudas) usan data-action con el prefijo de su módulo
// ("encargos-personas:irAEncargo", "prestado-personas:irADeudor"...): el prefijo es solo el
// namespace del evento y se registra desde encargos.js / prestado.js, donde viven los handlers.
Events.registerAll('personas', {
  abrirPerfil: _alternarPerfilPersona,
  cerrarFicha: _cerrarFichaPersonas,
  abrirCrearGlobal: _abrirCrearPersonaGlobal,
  volverConfiguracion: () => showScreen('config'),
  confirmarCrear: _crearPersonaGlobal,
  volverASel: _volverASelPersona,
  editarDesdePerfil: _editarPersonaDesdePerfilSheet,
  guardarEdicion: _guardarEditarPersonaGlobal,
  selElegir: _selPersonaElegir,
  selCrearDirecto: _selPersonaCrearDirecto,
  irASpotify: _irASpotify,
  archivar: _archivarPersona,
  restaurar: _restaurarPersona,
  eliminar: _eliminarPersona,
  alternarArchivadas: _alternarArchivadas,
  irAPantalla: pantalla => showScreen(pantalla),
  seleccionarColor: _seleccionarColorPersona,
  pickerAbrir: (el) => { const p = PersonaPicker.de(el && el.dataset && el.dataset.picker); if (p) p.abrir(); },
});

Ui.pantalla('personas', () => {
  _inyectarPersonaSheets();
  if (typeof _renderListaPersonas === 'function') _renderListaPersonas();
  if (typeof _actualizarMasPersonasSub === 'function') _actualizarMasPersonasSub();
}, { key: 'personas-render' });
