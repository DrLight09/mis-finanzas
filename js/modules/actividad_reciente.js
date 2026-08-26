/* ═══════════════════════════════════════════════════════════════
   js/modules/actividad_reciente.js

   Módulo: Feed de actividad financiera ("Actividad reciente" /
   screen-historial). Migrado desde el <script> que compartía con
   Tarjetas de Crédito y navTo() en index.html — ver
   auditoria-tecnica.md, punto 3, y la nota del 2026-07-20 sobre TC
   ("Feed de actividad financiera... módulo sin relación con TC que
   vivía ahí por casualidad de cómo se fue armando el archivo").

   Sin dependencia real de orden de carga: lee `window.S`,
   `window.fmt`, `window.escHtml`, `fuenteLabel` y `hoy` en tiempo de
   ejecución (dentro de renderFeedActividad(), no al cargar el
   archivo), todos con fallback si no existen todavía — mismo caso
   que Mesada/Gastos/Alcancía/Configuración. Único punto sensible al
   orden: el wrap de `window.refresh()` al final se ejecuta al
   parsear el archivo (no dentro de una función), así que este
   <script src> debe cargar DESPUÉS de que `refresh()` ya exista —
   se mantiene en la misma posición del documento que tenía el
   <script> original para preservar esa garantía.

   ── Onclick / Events: nada que migrar ────────────────────────────
   A diferencia de los otros diez módulos, esta pantalla es de solo
   lectura (mismo caso que Inicio) — no tiene ningún onclick inline
   propio, ni en el IIFE ni en el HTML estático de `screen-historial`.
   No se registra ningún namespace en `Events` porque no hay ninguna
   acción de usuario que despachar.

   Sí había un patrón a limpiar, aunque no sea un onclick: el módulo
   registra su propio `document.addEventListener('click', ...)` para
   detectar cuándo el usuario entra a la pantalla y disparar un
   refresco del feed. Esto duplica el listener delegado que
   `js/core/events.js` centraliza para toda la app — pero no se
   convirtió a `Events.on()` porque no es una acción puntual con
   handler+argumentos, sino un observador de navegación sobre varios
   selectores distintos, un caso que `Events` no está pensado para
   cubrir. Se deja así, pero limpio: de los tres selectores que
   escuchaba el original, dos no existen en el HTML actual y nunca se
   disparaban (`[data-screen="historial"]`: ningún ítem del nav
   inferior lo usa; `#mas-historial`: no existe esa entrada en el
   menú "Más") — se eliminan del selector y se deja esta nota en vez
   de borrar en silencio, mismo criterio que `toggleCDT()`/
   `toggleCajita()` en Cuentas. Solo `#cfg-historial-row` (el atajo
   "Actividad reciente" en Configuración) es real. Ese elemento
   todavía tiene su propio `onclick="showScreen('historial')"`
   inline en index.html — pertenece a la migración de Configuración,
   no a este módulo, así que no se toca acá.

   ── .innerHTML: migrado a html`` ──────────────────────────────────
   Los dos únicos usos de `.innerHTML` (mensaje de "vacío" y el
   render principal de `renderFeedActividad()`) ya pasaban todo el
   texto libre (`item.titulo`, `item.subtitulo`) por `esc()` a mano
   en el único punto de salida — sin bug real, esta migración es solo
   consistencia con el resto de módulos (ver "Lo que queda" en
   auditoria-tecnica.md, punto 2). Convertido a fragmentos html``
   anidados (por fecha → por ítem), sin `.join()` explícito, mismo
   patrón que inicio.js/analisis.js: el html`` exterior concatena los
   fragmentos internos sin volver a escapar lo que cada uno ya
   escapó. `ik.bg`/`ik.svg` (del diccionario fijo `ICONOS`) y
   `colorReal` (siempre `var(--accent)`/`var(--red)`/`#1ed760`, nunca
   texto libre) se envuelven en `raw()` a propósito — no son datos
   del usuario. Se renombró la variable local `html` a `contenido`
   (implícito al reescribir la función: ya no existe una variable
   `html` de string, sino el uso directo de la función global) para
   no repetir el hallazgo de sombra de variable ya corregido en
   mesada.js. Sin verificar en navegador real.
   ═══════════════════════════════════════════════════════════════ */

(function(){
  'use strict';

  const MAX_ITEMS = 50;

  // ── SVG ICONOS ────────────────────────────────────────────────────
  const ICONOS = {
    ingreso: {
      bg: 'rgba(200,240,96,.15)',
      svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#c8f060" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`
    },
    gasto: {
      bg: 'rgba(240,104,104,.15)',
      svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#f06868" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>`
    },
    prestamo: {
      bg: 'rgba(96,176,240,.15)',
      svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#60b0f0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
    },
    abono: {
      bg: 'rgba(200,240,96,.12)',
      svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#c8f060" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><polyline points="20 6 9 17 4 12"/></svg>`
    },
    spotify: {
      bg: 'rgba(30,215,96,.12)',
      svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#1ed760" stroke-width="2" stroke-linecap="round" width="18" height="18"><circle cx="12" cy="12" r="10"/><path d="M8 14.5c2.5-1 5.5-.8 7.5.5"/><path d="M7.5 11.5c3-1.3 7-1 9.5.8"/><path d="M7 8.5c3.5-1.5 8.5-1.2 11 1"/></svg>`
    },
    encargo: {
      bg: 'rgba(176,144,240,.15)',
      svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#b090f0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`
    },
    tc: {
      bg: 'rgba(240,184,64,.12)',
      svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#f0b840" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`
    },
    comprometida: {
      bg: 'rgba(96,216,240,.12)',
      svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#60d8f0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`
    },
    corte: {
      bg: 'rgba(240,104,104,.15)',
      svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#f06868" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>`
    },
  };

  // ── NORMALIZAR FUENTES ─────────────────────────────────────────────

  function _normCP(S) {
    // Muestra los registros de plata comprometida en el feed (solo los recibidos y los pendientes)
    // Los movimientos individuales (Reposición, Ingreso libre) ya aparecen en _normMovimientos.
    // Aquí mostramos el evento de alto nivel: "Llegó plata comprometida" o "Plata comprometida pendiente".
    var items = [];
    (S.plataCometida || []).forEach(function(item) {
      if (!item || !item.monto) return;
      if (item.recibido) {
        // Ya llegó: mostrar el evento de recibo
        items.push({
          id:        'cp_' + item.id,
          fecha:     item.fechaRecibido || item.fecha || '0000-00-00',
          ts:        item.tsRecibido || item.ts || 0,
          tipo:      'comprometida',
          signo:     '+',
          monto:     item.monto || 0,
          titulo:    'Llegó: ' + (item.desc || 'Plata comprometida'),
          subtitulo: (item.destinos && item.destinos.length)
                       ? item.destinos.length + ' destino' + (item.destinos.length !== 1 ? 's' : '')
                       : '',
          fuente:    'plataCometida',
        });
      } else {
        // Pendiente: mostrar la expectativa registrada
        items.push({
          id:        'cp_pend_' + item.id,
          fecha:     item.fecha || '0000-00-00',
          ts:        item.ts || 0,
          tipo:      'comprometida',
          signo:     '+',
          monto:     item.monto || 0,
          titulo:    'Esperando: ' + (item.desc || 'Plata comprometida'),
          subtitulo: 'Registrado, pendiente de recibo',
          fuente:    'plataCometida',
        });
      }
    });
    return items;
  }

  function _normMovimientos(S) {
    // S.movimientos unifica Nequi, Efectivo, Cajitas Nu y cuentas custom via campo fuente
    // Tipos: 'entrada' | 'salida_manual' | 'salida' | 'apertura' (apertura excluida)
    // Excluimos movimientos internos generados automáticamente por encargos (_encMovId,
    // "Margen de encargo", "Margen encargo") para evitar duplicados con _normEncargos.
    var fl = (typeof fuenteLabel === 'function') ? fuenteLabel : function(v){ return v || ''; };
    var items = (S.movimientos || [])
      .filter(function(m){
        if (m.tipo === 'apertura') return false;
        if (m.tipo === 'transferencia') return false; // intercambios contables, no son ingresos ni gastos
        if (m._encMovId) return false; // generado como efecto secundario de un encargo
        if (m._esAlcancia) return false; // movimientos internos de alcancía oculta
        var desc = (m.desc || '').toLowerCase();
        if (desc.indexOf('margen de encargo') === 0) return false;
        if (desc.indexOf('margen encargo') === 0) return false;
        return true;
      })
      .map(function(m){
        var esEntrada = m.tipo === 'entrada';
        var fLabel = m.fuente ? fl(m.fuente) : '';
        return {
          id:        'mov_' + m.id,
          fecha:     m.fecha || '0000-00-00',
          ts:        m.ts || 0,
          tipo:      esEntrada ? 'ingreso' : 'gasto',
          signo:     esEntrada ? '+' : '-',
          monto:     m.monto || 0,
          titulo:    m.desc || (esEntrada ? 'Ingreso' : 'Retiro'),
          subtitulo: fLabel,
          fuente:    'movimientos',
        };
      });

    // Cuentas personalizadas tienen sus propios movimientos[{tipo:'ingreso'|'egreso'}]
    (S.cuentasPersonalizadas || []).forEach(function(c){
      (c.movimientos || []).forEach(function(m){
        var esIngreso = m.tipo === 'ingreso';
        items.push({
          id:        'custom_' + c.id + '_' + m.id,
          fecha:     m.fecha || '0000-00-00',
          ts:        m.ts || 0,
          tipo:      esIngreso ? 'ingreso' : 'gasto',
          signo:     esIngreso ? '+' : '-',
          monto:     m.monto || 0,
          titulo:    m.nota || (esIngreso ? 'Ingreso' : 'Retiro'),
          subtitulo: c.nombre || '',
          fuente:    'cuentasPersonalizadas',
        });
      });
    });

    return items;
  }

  function _normGastos(S) {
    return (S.gastosVar || []).filter(function(g){ return !g._esAlcancia; }).map(function(g){
      return {
        id:          'gv_' + g.id,
        fecha:       g.fecha || '0000-00-00',
        ts:          g.ts || 0,
        tipo:        'gasto',
        signo:       '-',
        monto:       g.monto || 0,
        titulo:      g.desc || 'Gasto',
        subtitulo:   g.cat || '',
        fuente:      'gastosVar',
        _esPagoFijo: !!g.esPagoGastoFijo,
      };
    });
  }

  function _normDeudores(S) {
    var items = [];
    (S.deudores || []).forEach(function(d){
      (d.movimientos || []).forEach(function(m){
        var esPrestamo = m.tipo === 'prestamo';
        items.push({
          id:        'deu_' + d.id + '_' + m.id,
          fecha:     m.fecha || '0000-00-00',
          ts:        m.ts || 0,
          tipo:      esPrestamo ? 'prestamo' : 'abono',
          signo:     esPrestamo ? '-' : '+',
          monto:     m.monto || 0,
          titulo:    esPrestamo ? 'Préstamo a ' + d.nombre : 'Abono de ' + d.nombre,
          subtitulo: m.nota || '',
          fuente:    'deudores',
        });
      });
    });
    return items;
  }

  function _normSpotify(S) {
    return (S.spotifyHistorial || [])
      .filter(function(h){ return h.tipo === 'cobro'; })
      .map(function(h){
        return {
          id:        'sp_' + (h.id || Math.random()),
          fecha:     h.fecha || '0000-00-00',
          ts:        h.ts || 0,
          tipo:      'spotify',
          signo:     '+',
          monto:     h.monto || 0,
          titulo:    'Cobro Spotify · ' + (h.nombre || ''),
          subtitulo: h.nota || '',
          fuente:    'spotifyHistorial',
        };
      });
  }

  function _normEncargos(S) {
    // enc.movimientos usa tipo: 'entrada' | 'salida'
    // 'entrada' = dinero que entra al encargo (abono recibido)
    // 'salida'  = dinero que sale del encargo (pago, gasto, traspaso)
    // Excluimos:
    //   - reubicaciones internas entre cuentas (_parteId sin desc real, nota 'Movimiento interno...')
    //   - movimientos de abono a deudor (_esAbonoDeudor) — ya aparecen en _normDeudores
    var items = [];
    (S.encargos || []).forEach(function(enc){
      (enc.movimientos || []).forEach(function(m){
        // Saltar movimientos internos de reubicación
        if (m._esAbonoDeudor) return;
        var nota = (m.nota || '').toLowerCase();
        if (nota === 'movimiento interno entre cuentas') return;
        if (nota === 'traspaso a cuenta propia') return;

        var esEntrada = m.tipo === 'entrada';
        items.push({
          id:        'enc_' + enc.id + '_' + m.id,
          fecha:     m.fecha || '0000-00-00',
          ts:        m.ts || 0,
          tipo:      'encargo',
          signo:     esEntrada ? '+' : '-',
          monto:     m.monto || 0,
          titulo:    (esEntrada ? 'Entrada encargo' : 'Salida encargo') + ' · ' + (enc.nombre || ''),
          subtitulo: m.desc || m.nota || '',
          fuente:    'encargos',
        });
      });
    });
    return items;
  }

  function _normTC(S) {
    var items = [];
    (S.tarjetasCredito || []).forEach(function(tc){
      (tc.pagos || []).forEach(function(p){
        items.push({
          id:        'tc_' + tc.id + '_' + p.id,
          fecha:     p.fecha || '0000-00-00',
          ts:        p.ts || 0,
          tipo:      'tc',
          signo:     '-',
          monto:     p.monto || 0,
          titulo:    'Abono a deuda · ' + (tc.nombre || ''),
          subtitulo: p.nota || 'No corresponde a una compra específica',
          fuente:    'tarjetasCredito',
        });
      });
    });
    // Avisos de corte: tcMovimientos con tipo 'corte_aviso'
    (S.tcMovimientos || []).filter(function(m){ return m.tipo === 'corte_aviso'; }).forEach(function(m){
      var tc = (S.tarjetasCredito || []).find(function(x){ return x.id === m.tcId; });
      items.push({
        id:        'tcaviso_' + m.id,
        fecha:     m.fecha || '0000-00-00',
        ts:        m.ts || 0,
        tipo:      'corte',
        signo:     '-',
        monto:     m.monto || 0,
        titulo:    'Corte llegó · ' + (tc ? tc.nombre : ''),
        subtitulo: 'Debes ' + (window.fmt ? window.fmt(m.monto) : m.monto) + ' antes del límite de pago',
        fuente:    'tcMovimientos',
      });
    });
    return items;
  }

  // ── LABEL DE FECHA AGRUPADA ────────────────────────────────────────

  function _labelFecha(fechaStr) {
    if (!fechaStr || fechaStr === '0000-00-00') return 'Sin fecha';
    var hoyStr = (typeof hoy === 'function') ? hoy() : new Date().toISOString().slice(0, 10);
    if (fechaStr === hoyStr) return 'Hoy';
    var dHoy = new Date(hoyStr + 'T12:00:00');
    dHoy.setDate(dHoy.getDate() - 1);
    var ayerStr = dHoy.toISOString().slice(0, 10);
    if (fechaStr === ayerStr) return 'Ayer';
    var meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    var partes = fechaStr.split('-');
    return parseInt(partes[2], 10) + ' ' + meses[parseInt(partes[1], 10) - 1];
  }

  // ── RENDER PRINCIPAL ───────────────────────────────────────────────

  function renderFeedActividad() {
    var el = document.getElementById('feed-historial');
    if (!el) return;

    var Sx = window.S || {};
    var f  = window.fmt || function(v){ return '$' + Math.round(v).toLocaleString('es-CO'); };

    // Recopilar y mezclar todas las fuentes
    var todos = [].concat(
      _normMovimientos(Sx),
      _normGastos(Sx),
      _normDeudores(Sx),
      _normSpotify(Sx),
      _normEncargos(Sx),
      _normTC(Sx),
      _normCP(Sx)
    );

    // Ordenar: fecha desc, ts como desempate
    todos.sort(function(a, b) {
      var fc = b.fecha.localeCompare(a.fecha);
      if (fc !== 0) return fc;
      return (b.ts || 0) - (a.ts || 0);
    });

    // Actualizar badge del menú Más y Config
    var visibleCount = Math.min(todos.length, MAX_ITEMS);
    var badgeTxt = todos.length > MAX_ITEMS
      ? 'últimos ' + MAX_ITEMS
      : visibleCount + ' movimiento' + (visibleCount !== 1 ? 's' : '');
    var sub = document.getElementById('mas-historial-sub');
    if (sub) sub.textContent = badgeTxt;
    var cfgSub = document.getElementById('cfg-historial-sub');
    if (cfgSub) cfgSub.textContent = badgeTxt;
    var countEl = document.getElementById('feed-historial-count');
    if (countEl) countEl.textContent = todos.length > MAX_ITEMS ? 'últimos ' + MAX_ITEMS : '';

    // Tomar los primeros MAX_ITEMS
    var visibles = todos.slice(0, MAX_ITEMS);

    if (!visibles.length) {
      el.innerHTML = html`<div class="feed-empty">Aún no hay actividad registrada.</div>`;
      return;
    }

    // Agrupar por fecha
    var grupos = {};
    var orden  = [];
    visibles.forEach(function(item) {
      if (!grupos[item.fecha]) {
        grupos[item.fecha] = [];
        orden.push(item.fecha);
      }
      grupos[item.fecha].push(item);
    });

    // Construir HTML — fragmentos html`` anidados (sin .join() explícito:
    // el html`` exterior sabe concatenarlos sin volver a escapar lo que
    // cada uno ya escapó, mismo patrón que inicio.js/analisis.js).
    var grupoFrags = orden.map(function(fecha) {
      var label = _labelFecha(fecha);
      var itemFrags = grupos[fecha].map(function(item) {
        var ik  = ICONOS[item.tipo] || ICONOS.gasto;
        var colorMonto = item.signo === '+' ? 'var(--accent)' : 'var(--red)';
        var colorReal  = item.tipo === 'spotify' ? '#1ed760' : colorMonto;
        var badge = item._esPagoFijo ? html`<span class="feed-badge-fijo">Gasto fijo</span>` : '';
        return html`<div class="feed-item">
          <div class="feed-icon" style="background:${raw(ik.bg)};">${raw(ik.svg)}</div>
          <div class="feed-body">
            <div class="feed-titulo">${item.titulo}${badge}</div>
            ${item.subtitulo ? html`<div class="feed-sub">${item.subtitulo}</div>` : ''}
          </div>
          <div class="feed-monto" style="color:${raw(colorReal)};">${item.signo}${raw(f(item.monto))}</div>
        </div>`;
      });
      return html`<div class="feed-group-header">${label}</div>${itemFrags}`;
    });

    el.innerHTML = html`${grupoFrags}`;
  }

  // Exponer globalmente
  window.renderFeedActividad = renderFeedActividad;

  // Hook: refrescar el feed al entrar a la pantalla desde el atajo
  // de Configuración. Nota: el selector original también escuchaba
  // '[data-screen="historial"]' y '#mas-historial' — ninguno de los
  // dos existe en el HTML actual (ningún ítem del nav inferior usa
  // data-screen="historial", y el menú "Más" no tiene entrada
  // "Actividad reciente"), así que nunca se disparaban. Se quitan
  // acá; si en el futuro se agrega un acceso directo desde el nav o
  // el menú "Más", hay que sumar su selector a esta lista.
  document.addEventListener('click', function(e) {
    var ni = e.target.closest('#cfg-historial-row');
    if (ni) { setTimeout(renderFeedActividad, 80); }
  });

  // Wrap refresh() para mantener el feed actualizado
  var _origRefresh = window.refresh;
  window.refresh = function() {
    if (typeof _origRefresh === 'function') _origRefresh.apply(this, arguments);
    var activa = document.querySelector('.screen.active');
    if (activa && activa.id === 'screen-historial') renderFeedActividad();
    // El badge (mas-historial-sub / cfg-historial-sub) lo actualiza renderFeedActividad
    // con el texto correcto — no se toca aquí para evitar mostrar totales brutos.
  };

  // logCambio sigue existiendo como no-op para no romper el código que lo llama
  window.logCambio = function(){ /* no-op: el feed ahora lee de S directamente */ };

  // Render inicial tras carga de datos
  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(renderFeedActividad, 600);
  });
  // Actualizar badge cuando Firebase termina de cargar (puede tardar más que DOMContentLoaded)
  window.addEventListener('appDataLoaded', function() {
    setTimeout(renderFeedActividad, 300);
  });

  // (docs/auditoria-tecnica.md #4 — carga bajo demanda) Si este archivo
  // carga tarde — que es SIEMPRE el caso si se vuelve lazy, disparado
  // por el clic en #cfg-historial-row — ninguno de los 3 triggers de
  // arriba se activa nunca: DOMContentLoaded y appDataLoaded ya pasaron
  // hace rato, y el listener de clic recién se registra en la línea
  // 435 de este archivo, demasiado tarde para capturar el mismo clic
  // que disparó la carga. Sin esto, la pantalla se queda pegada en
  // "Cargando..." para siempre la primera vez. Se agrega un cuarto
  // trigger sin condición de evento — mismo criterio que usa
  // _cpInit() en plata_comprometida.js ("Render inicial si hay
  // datos"). renderFeedActividad() ya lee `S` con fallback si no
  // existe todavía (ver comentario del encabezado), así que llamarla
  // acá es seguro incluso si por algún motivo se cargara antes de
  // tiempo. Redundante pero sin costo real en el caso eager (los otros
  // 3 triggers ya cubrían ese caso; esto solo suma una llamada más a
  // una función idempotente).
  renderFeedActividad();

})();
