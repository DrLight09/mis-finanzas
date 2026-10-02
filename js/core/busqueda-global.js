/* ================================================================
   BÚSQUEDA GLOBAL — js/core/busqueda-global.js

   Extraído de index.html (auditoria-tecnica.md, punto 3) el 2026-07-26.
   Vive en js/core/ y no en js/modules/ porque es transversal por
   naturaleza: busca sobre S.gastosVar, S.gastosFijos, S.deudores,
   S.cajitas, S.cuentas, S.encargos, S.personas,
   S.misDeudas, S.spotifyPersonas/S.spotifyHistorial y S.movimientos —
   no pertenece a un solo dominio.

   Sin dependencia real de orden de carga: no llama a ninguna función
   de un módulo de dominio en el momento en que este script se parsea.
   Cada navegación a un módulo específico (abrirDeudor, abrirEncargoDetalle,
   abrirCuenta, abrirMiDeuda, abrirDetalleCajita, abrirPerfilPersona,
   spNombreDe, spPersonaPagadaVigente) se resuelve en tiempo de click vía
   `typeof X === 'function'`, igual que ya hacía en index.html — por eso
   no hizo falta partir el archivo en dos ni reordenar ningún <script src>
   existente: se carga en el mismo punto donde antes vivía el IIFE.

   Depende de núcleo compartido ya definido antes de este punto: S, escHtml,
   showScreen, cambiarTabPrestamos, window.fmt, window.calcC,
   window.getDeudorSaldo, window.getMiDeudaSaldo.
   ================================================================ */
(function(){
  /* ====================================================
     2. BÚSQUEDA GLOBAL
  ==================================================== */
  const busquedaOverlay = document.getElementById('busqueda-overlay');
  const busquedaInput = document.getElementById('busqueda-input');
  const busquedaResultados = document.getElementById('busqueda-resultados');

  document.getElementById('btn-buscar-global').addEventListener('click', () => {
    busquedaOverlay.classList.add('open');
    setTimeout(() => busquedaInput.focus(), 100);
  });
  document.getElementById('btn-cerrar-busqueda').addEventListener('click', () => {
    busquedaOverlay.classList.remove('open');
    busquedaInput.value = '';
    busquedaResultados.innerHTML = '';
  });

  // ── Función para cerrar búsqueda y navegar ──────────────────────────────
  function _busquedaNavegar(r) {
    // Cerrar overlay
    busquedaOverlay.classList.remove('open');
    busquedaInput.value = '';
    busquedaResultados.innerHTML = '';

    // Navegar según tipo
    if (r.navTipo === 'cajita') {
      showScreen('cuentas');
      setTimeout(() => {
        if (typeof abrirDetalleCajita === 'function') abrirDetalleCajita(r.navId);
      }, 80);
    } else if (r.navTipo === 'deudor') {
      showScreen('prestamos');
      setTimeout(() => {
        if (typeof abrirDeudor === 'function') abrirDeudor(r.navId);
      }, 80);
    } else if (r.navTipo === 'encargo') {
      showScreen('encargos');
      setTimeout(() => {
        if (typeof abrirEncargoDetalle === 'function') abrirEncargoDetalle(r.navId);
      }, 80);
    } else if (r.navTipo === 'mi-deuda') {
      showScreen('prestamos');
      cambiarTabPrestamos('yo-debo');
      setTimeout(() => {
        if (typeof abrirMiDeuda === 'function') abrirMiDeuda(r.navId);
      }, 80);
    } else if (r.navTipo === 'prestamo_mov') {
      // Navegar al deudor dueño del préstamo
      showScreen('prestamos');
      setTimeout(() => {
        if (typeof abrirDeudor === 'function') abrirDeudor(r.navId);
      }, 80);
    } else if (r.navTipo === 'encargo_mov') {
      showScreen('encargos');
      setTimeout(() => {
        if (typeof abrirEncargoDetalle === 'function') abrirEncargoDetalle(r.navId);
      }, 80);
    } else if (r.navTipo === 'cuenta_custom') {
      showScreen('cuentas');
      setTimeout(() => {
        if (typeof abrirCuenta === 'function') abrirCuenta(r.navId);
      }, 80);
    } else if (r.navTipo === 'nequi') {
      showScreen('cuentas');
      setTimeout(() => {
        if (typeof abrirCuenta === 'function') abrirCuenta('nequi');
      }, 80);
    } else if (r.navTipo === 'efectivo') {
      showScreen('cuentas');
      setTimeout(() => {
        if (typeof abrirCuenta === 'function') abrirCuenta('efectivo');
      }, 80);
    } else if (r.navTipo === 'gastos') {
      showScreen('gastos');
    } else if (r.navTipo === 'persona') {
      // Abrir perfil de persona directamente
      setTimeout(() => {
        if (typeof abrirPerfilPersona === 'function') abrirPerfilPersona(r.navId);
      }, 80);
    } else if (r.navTipo === 'spotify') {
      // Ir directo a la pantalla real de Spotify
      showScreen('spotify');
    } else if (r.navTipo === 'alcancia') {
      // Ir directo a la pantalla de Alcancía (sin detalle de fila puntual: el
      // monto oculto no tiene una vista individual a la que navegar)
      showScreen('alcancia');
    } else if (r.navTipo === 'movimiento_general') {
      // Movimiento de cuenta personalizada o general → ir a cuentas
      if (r.navId) {
        showScreen('cuentas');
        setTimeout(() => {
          if (typeof abrirCuenta === 'function') abrirCuenta(r.navId);
        }, 80);
      } else {
        showScreen('cuentas');
      }
    } else {
      // fallback: solo cerrar
    }
  }

  // ── Ícono por tipo de resultado ──────────────────────────────────────────
  function _busquedaIcono(navTipo, color) {
    const icons = {
      cajita: `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>`,
      deudor: `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
      prestamo_mov: `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
      encargo: `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`,
      encargo_mov: `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`,
      cuenta_custom: `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`,
      nequi: `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`,
      efectivo: `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/></svg>`,
      gastos: `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>`,
      persona: `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
      spotify: `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><circle cx="12" cy="12" r="10"/><path d="M8 11.8c2.5-1.1 5.5-1.1 8 0"/><path d="M7 15c2.9-1.2 6.1-1.2 9 0"/><path d="M9 8.6c2.1-.9 4.9-.9 7 0"/></svg>`,
      movimiento_general: `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
      'mi-deuda': `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
      alcancia: `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
    };
    return icons[navTipo] || `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
  }

  // ── Flecha de navegación SVG ─────────────────────────────────────────────
  const _arrowRight = `<svg viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" style="flex-shrink:0;"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`;

  busquedaInput.addEventListener('input', function(){
    const q = this.value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    if(q.length < 2){ busquedaResultados.innerHTML = '<div style="text-align:center;padding:24px 0;font-size:13px;color:var(--text3);">Escribe al menos 2 caracteres</div>'; return; }
    const S = window.S || {};
    const resultados = [];
    // Ícono (SVG inline) que reemplaza al monto de los depósitos de Alcancía. `meta` se escapa con escHtml(),
    // así que el ícono viaja aparte en `metaHtml` (el texto va escapado dentro de él).
    const _iconoOculto = '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="5" viewBox="0 0 26 5" fill="currentColor" role="img" aria-label="Monto oculto" style="display:inline-block;vertical-align:middle"><circle cx="1.6" cy="2.5" r="1.6"/><circle cx="9.2" cy="2.5" r="1.6"/><circle cx="16.8" cy="2.5" r="1.6"/><circle cx="24.4" cy="2.5" r="1.6"/></svg>';

    // Gastos variables
    // Depósitos a la alcancía (`_esAlcancia`) — desde el 2026-09-27 los depósitos con cuenta de
    // origen ya no se guardan acá (ver bloque de S.transferencias más abajo); esta rama queda
    // solo como red de seguridad por si sobrevive algún registro viejo sin migrar.
    (S.gastosVar||[]).forEach(g => {
      if((g.desc||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(q) || (g.cat||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(q) || (g.nota||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(q)){
        const montoTxt = g._esAlcancia ? '' : (window.fmt?window.fmt(g.monto):'');
        const restoMeta = ' · ' + (g.cat||'') + ' · ' + (g.fecha||'');
        const tipoResultado = g._esAlcancia ? (g.cat||'Ahorro') : 'Gasto variable';
        resultados.push({ tipo:tipoResultado, desc:g.desc||'Sin descripción', meta: montoTxt + restoMeta, metaHtml: g._esAlcancia ? _iconoOculto + escHtml(restoMeta) : null, color: g._esAlcancia ? 'var(--accent)' : 'var(--red)', navTipo:'gastos', navId:null });
      }
    });

    // Gastos fijos
    (S.gastosFijos||[]).forEach(g => {
      if((g.nombre||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(q)){
        resultados.push({ tipo:'Gasto fijo', desc:g.nombre, meta: (window.fmt?window.fmt(g.monto):'') + ' / mes · ' + (g.cat||''), color:'var(--amber)', navTipo:'gastos', navId:null });
      }
    });

    // Préstamos / deudores
    (S.deudores||[]).forEach(d => {
      if((d.nombre||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(q)){
        const s = window.getDeudorSaldo ? window.getDeudorSaldo(d) : 0;
        resultados.push({ tipo:'Persona prestada', desc:d.nombre, meta: 'Pendiente: ' + (window.fmt?window.fmt(s):''), color:'var(--blue)', navTipo:'deudor', navId:d.id });
      }
    });

    // Cajitas
    (S.cajitas||[]).forEach(c => {
      if((c.nombre||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(q)){
        const k = window.calcC ? window.calcC(c) : {val:c.saldo||0};
        resultados.push({ tipo:'Cajita Nu', desc:c.nombre, meta: window.fmt?window.fmt(k.val):'', color:'var(--nu-light)', navTipo:'cajita', navId:c.id });
      }
    });

    // Cuentas personalizadas
    cuentasCustom().forEach(c => {
      if((c.nombre||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(q)){
        resultados.push({ tipo:'Cuenta', desc:c.nombre, meta: window.fmt?window.fmt(c.saldo||0):'', color:'var(--blue)', navTipo:'cuenta_custom', navId:c.id });
      }
    });

    // Encargos
    (S.encargos||[]).forEach(e => {
      if((e.nombre||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(q) || (e.nota||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(q)){
        resultados.push({ tipo:'Encargo', desc:e.nombre||'Encargo', meta: window.fmt?window.fmt(e.saldo||0):'', color:'var(--blue)', navTipo:'encargo', navId:e.id });
      }
      // Movimientos de encargos
      (e.movimientos||[]).forEach(m => {
        if((m.desc||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(q)||(m.nota||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(q)){
          resultados.push({ tipo:'Mov. encargo', desc:(m.desc||e.nombre||'Encargo'), meta:(window.fmt?window.fmt(m.monto):'')+(m.fecha?' · '+m.fecha:''), color:'var(--blue)', navTipo:'encargo_mov', navId:e.id });
        }
      });
    });

    // Préstamos individuales
    (S.deudores||[]).forEach(d => {
      (d.abonos||[]).forEach(a => {
        if((a.nota||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(q)){
          resultados.push({ tipo:'Abono · '+d.nombre, desc:a.nota||'Abono', meta:(window.fmt?window.fmt(a.monto):'')+(a.fecha?' · '+a.fecha:''), color:'var(--accent)', navTipo:'prestamo_mov', navId:d.id });
        }
      });
      // También buscar en movimientos unificados del deudor
      (d.movimientos||[]).forEach(m => {
        if((m.concepto||m.nota||m.desc||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(q)){
          const already = resultados.find(r => r.navTipo==='prestamo_mov' && r.navId===d.id && r.desc===(m.concepto||m.nota||m.desc||''));
          if(!already) resultados.push({ tipo:'Mov. · '+d.nombre, desc:m.concepto||m.nota||m.desc||'Movimiento', meta:(window.fmt?window.fmt(m.monto):'')+(m.fecha?' · '+m.fecha:''), color:'var(--blue)', navTipo:'prestamo_mov', navId:d.id });
        }
      });
    });

    // Movimientos cuentas personalizadas
    cuentasCustom().forEach(c => {
      (c.movimientos||[]).forEach(m => {
        if((m.desc||m.nota||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(q)){
          resultados.push({ tipo:'Mov. '+c.nombre, desc:m.desc||m.nota||'Movimiento', meta:(window.fmt?window.fmt(m.monto):'')+(m.fecha?' · '+m.fecha:''), color:'var(--blue)', navTipo:'cuenta_custom', navId:c.id });
        }
      });
    });

    // Personas
    (S.personas||[]).forEach(p => {
      if((p.nombre||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(q)||(p.alias||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(q)||(p.notas||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(q)){
        resultados.push({ tipo:'Persona', desc:p.nombre, meta:(p.alias?'@'+p.alias+' · ':'')+(p.notas||'Sin notas'), color:p.color||'var(--blue)', navTipo:'persona', navId:p.id });
      }
    });

    // Mis Deudas (Yo debo)
    (S.misDeudas||[]).forEach(d => {
      if((d.nombre||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(q)){
        const s = window.getMiDeudaSaldo ? window.getMiDeudaSaldo(d) : 0;
        resultados.push({ tipo:'Yo debo', desc:d.nombre, meta:'Pendiente: '+(window.fmt?window.fmt(s):''), color:'var(--red)', navTipo:'mi-deuda', navId:d.id });
      }
      (d.movimientos||[]).forEach(m => {
        if((m.nota||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(q)){
          resultados.push({ tipo:'Mov. · '+d.nombre, desc:m.nota||'Movimiento', meta:(window.fmt?window.fmt(m.monto):'')+(m.fecha?' · '+m.fecha:''), color:'var(--red)', navTipo:'mi-deuda', navId:d.id });
        }
      });
    });

    // Spotify — personas del plan
    (S.spotifyPersonas||[]).forEach(p => {
      const nombreActual = (typeof spNombreDe==='function') ? spNombreDe(p) : p.nombre;
      if((nombreActual||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(q)){
        const estado = (typeof spPersonaPagadaVigente==='function') ? (spPersonaPagadaVigente(p)?'Al día':'Pendiente') : (p.pagado?'Al día':'Pendiente');
        resultados.push({ tipo:'Spotify', desc:nombreActual, meta:(window.fmt?window.fmt(p.monto||0):'')+' / mes · '+estado, color:'#1db954', navTipo:'spotify', navId:null });
      }
    });
    // Spotify — historial de cobros y pagos
    (S.spotifyHistorial||[]).forEach(h => {
      const texto = h.tipo==='pago' ? 'Pago a Spotify' : 'Cobro de '+(h.nombre||'');
      if(texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(q)||(h.nota||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(q)){
        resultados.push({ tipo:'Mov. Spotify', desc:texto, meta:(window.fmt?window.fmt(h.monto||0):'')+(h.fecha?' · '+h.fecha:''), color:'#1db954', navTipo:'spotify', navId:null });
      }
    });

    // Movimientos generales de cuentas (S.movimientos)
    // Ingresos neto-cero de Alcancía (`_esAlcanciaIngreso`): mismo criterio que los depósitos con cuenta
    // de origen (arriba, S.transferencias) — se agrupan como "Ahorro", monto oculto, y navegan a la
    // pantalla de Alcancía en vez de a "Efectivo" (la `fuente:'efectivo'` de estas entradas es un truco
    // interno para que cuenten en ingresosMes — ver alcancia.js — no es dónde realmente "vive" el registro,
    // así que ir ahí con "Ir ahí" sería engañoso: cuentas.js las salta del historial de Efectivo a propósito).
    // Los movimientos del destape (`_esAlcancia` en S.movimientos) NO se ocultan: el total ya se reveló al destapar.
    (S.movimientos||[]).forEach(m => {
      if((m.desc||m.nota||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(q)){
        const esAlcIngreso = !!m._esAlcanciaIngreso;
        const fuente = (!esAlcIngreso && m.fuente) ? ' · '+m.fuente : '';
        const montoTxt = esAlcIngreso ? '' : (window.fmt?window.fmt(m.monto):'');
        const restoMeta = esAlcIngreso ? ' · Ahorro · '+(m.fecha||'') : (m.fecha?' · '+m.fecha:'')+fuente;
        resultados.push({
          tipo: esAlcIngreso ? 'Ahorro' : 'Movimiento',
          desc: m.desc||m.nota||'Movimiento',
          meta: montoTxt+restoMeta,
          metaHtml: esAlcIngreso ? _iconoOculto + escHtml(restoMeta) : null,
          color:'var(--accent)',
          navTipo: esAlcIngreso ? 'alcancia' : (m.fuente==='nequi'?'nequi':m.fuente==='efectivo'?'efectivo':'movimiento_general'),
          navId: esAlcIngreso ? null : (m.fuente||null)
        });
      }
    });

    // Depósitos a la alcancía desde una cuenta real (S.transferencias, destino:'alcancia').
    // Desde el 2026-09-27 viven acá en vez de en S.gastosVar (ver CHANGELOG.md#alcancia) —
    // mismo criterio de monto oculto que ya aplicaba antes del cambio (ver alcancia.md §3).
    (S.transferencias||[]).forEach(t => {
      if(t.destino !== 'alcancia') return;
      if(((t.desc||'')+' '+(t.nota||'')).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(q)){
        const restoMeta = ' · Ahorro · ' + (t.fecha||'');
        resultados.push({ tipo:'Ahorro', desc:t.desc||'Depósito en alcancía', meta:restoMeta, metaHtml: _iconoOculto + escHtml(restoMeta), color:'var(--accent)', navTipo:'alcancia', navId:null });
      }
    });

    if(!resultados.length){
      busquedaResultados.innerHTML = '<div style="text-align:center;padding:48px 0;"><div style="margin-bottom:10px;display:flex;justify-content:center;"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div><div style="font-size:13px;color:var(--text3);">Sin resultados para <b style="color:var(--text);">"'+escHtml(q)+'"</b></div></div>';
      return;
    }

    // Guardar resultados para acceso por índice
    window._busquedaResultados = resultados;

    // Agrupar por tipo
    const grupos = {};
    resultados.forEach((r, idx) => {
      const g = r.tipo.split(' · ')[0];
      if(!grupos[g]) grupos[g] = [];
      grupos[g].push({ ...r, _idx: idx });
    });

    let html = '';
    Object.keys(grupos).forEach(g => {
      const items = grupos[g];
      html += `<div class="busqueda-section-title">${escHtml(g)} (${items.length})</div>`;
      html += items.slice(0,8).map(r => {
        const tieneNav = !!r.navTipo;
        const iconoSvg = _busquedaIcono(r.navTipo, r.color);
        const navHint = tieneNav
          ? `<div style="display:flex;align-items:center;gap:4px;margin-top:6px;font-size:10px;font-family:'DM Mono',monospace;color:var(--text3);letter-spacing:.3px;">
               <span>Ir ahí</span>${_arrowRight}
             </div>`
          : '';
        return `
        <div class="busqueda-item" data-bidx="${r._idx}" style="cursor:${tieneNav?'pointer':'default'};">
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:36px;height:36px;border-radius:10px;background:${r.color.replace('var(--red)','rgba(240,104,104,.12)').replace('var(--amber)','rgba(240,184,64,.12)').replace('var(--blue)','rgba(96,176,240,.12)').replace('var(--nu-light)','rgba(192,96,240,.12)').replace('var(--accent)','rgba(200,240,96,.12)').replace('#ff4da6','rgba(255,77,166,.12)').replace('#1db954','rgba(29,185,84,.12)')};display:flex;align-items:center;justify-content:center;flex-shrink:0;">${iconoSvg}</div>
            <div style="flex:1;min-width:0;">
              <div class="busqueda-tipo" style="color:${r.color};">${escHtml(r.tipo)}</div>
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                <div class="busqueda-desc" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(r.desc)}</div>
              </div>
              <div class="busqueda-meta">${r.metaHtml || escHtml(r.meta)}</div>
              ${navHint}
            </div>
            ${tieneNav ? `<div style="color:var(--text3);flex-shrink:0;">${_arrowRight}</div>` : ''}
          </div>
        </div>`;
      }).join('');
    });
    busquedaResultados.innerHTML = html;

    // Añadir listeners de navegación
    busquedaResultados.querySelectorAll('.busqueda-item[data-bidx]').forEach(el => {
      const idx = parseInt(el.getAttribute('data-bidx'), 10);
      const r = window._busquedaResultados[idx];
      if (r && r.navTipo) {
        el.addEventListener('click', () => _busquedaNavegar(r));
        // Feedback táctil visual
        el.addEventListener('touchstart', () => el.style.background = 'var(--bg3)', {passive:true});
        el.addEventListener('touchend', () => el.style.background = '', {passive:true});
      }
    });
  });
})();
