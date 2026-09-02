/* ═══════════════════════════════════════════════════════════════
   js/modules/plata_comprometida.js

   Módulo "Plata comprometida" — ver docs/plata-comprometida.md para
   el modelo de datos y las reglas de negocio completas.

   Migrado desde el <script> inline que vivía en index.html (mismo
   patrón que Spotify, Mesada, Encargos y Tarjetas de Crédito — ver
   auditoria-tecnica.md #1 y #3):

   - Los 27 onclick/onchange inline que tenía (26 onclick + 1 onchange
     sobre un <select> oculto que en la práctica nunca se disparaba)
     pasaron a data-action + Events.attr(), despachados por el sistema
     centralizado en js/core/events.js. Se registran todos al final de
     este archivo con Events.registerAll('cp', {...}).
   - Un solo archivo alcanzó (a diferencia de Spotify/Encargos): el
     módulo no depende de nada definido más abajo en index.html — usa
     S.deudores directo para "Me devuelven", no funciones de Personas.
   - Las funciones de acción (_cpAbrirNuevo, _cpGuardar, etc.) y el
     estado de los sheets en construcción (_cpMarcarId, _cpMarcarTmp,
     _cpdGastoOrigenVal, _cpdYaSaqueVal, _cpdYaPagueVal) vivían
     innecesariamente en `window` — solo para que los onclick inline
     pudieran llamarlos. Ya no hace falta: quedaron como funciones y
     `let` locales al módulo.
   - Auditoría de `.innerHTML` (auditoria-tecnica.md #2): se encontró
     y corrigió el mismo patrón ya visto en Spotify/Mesada/Encargos/TC
     — texto libre que llega envuelto en una función auxiliar
     (_cpFuenteLabel(), que envuelve a fuenteLabel()) y se interpolaba
     sin escapar. 5 sitios corregidos:
       1. item.cuentaDestino sin escapar en la card principal de la lista.
       2-3. tc.nombre (tarjeta) sin escapar en el plan de "Recibir",
            en dos ramas de subLabel (pagado / pendiente con TC).
       4-5. _cpFuenteLabel(d.gastoCajita) sin escapar en las dos alertas
            de "Necesita atención" (gasto vencido / vence mañana).
     Un sexto sitio (toast() con errores.join(', '), que junta
     descripciones libres de destinos) también se corrigió.
     Los usos de _cpFuenteLabel() dentro de logCambio(...) NO se
     tocaron: van al feed de actividad, que ya escapa en su propio
     renderer — mismo criterio ya aplicado a toast()/buildFuentesOptsHtml()
     en la sesión de TC (núcleo/otro módulo compartido, fuera de alcance).

   Integración a index.html: originalmente eager (confirmado 2026-07-23,
   ver auditoria-tecnica.md) — el <script src="js/modules/plata_comprometida.js">
   estaba agregado justo después de <script src="js/core/events.js">, en
   el mismo lugar donde vivía el <script> inline original.

   Carga LAZY desde una sesión posterior (docs/auditoria-tecnica.md #4,
   CHANGELOG.md#arranque): el <script> se sacó de index.html — ahora lo
   descarga js/core/lazy-loader.js (Loader.GROUPS.comprometida) la
   primera vez que alguien entra a la pantalla. El HTML que
   _injectScreen() y _injectMasItem() (más abajo en este archivo)
   generaban en tiempo de ejecución se copió tal cual a index.html
   (#screen-comprometida y #mas-comprometida) — sin eso, el ítem de
   menú que dispara la carga lazy no existiría hasta que el módulo ya
   hubiera cargado (círculo vicioso). Ambas funciones se dejaron SIN
   TOCAR: sus propios guards por id (`document.getElementById(...)`)
   ya las vuelven no-op automáticamente al encontrar el HTML estático
   — mismo mecanismo, sin cambios de código acá, que ya usa
   _injectMasItem() cuando alguien más se adelantó (ver el `anchor`
   que busca #mas-alcancia). _injectSheet() (el otro sheet dinámico
   del archivo) NO se estaticó a propósito: nadie puede interactuar
   con ese sheet antes de que la pantalla esté activa, y la pantalla
   no se activa hasta que el módulo ya cargó — no hay carrera ahí.
   ═══════════════════════════════════════════════════════════════ */

(function(){
'use strict';

/* ── INYECTAR PANTALLA EN EL DOM ─────────────────────────────────── */
function _injectScreen(){
  const main = document.getElementById('scrollArea');
  if(!main || document.getElementById('screen-comprometida')) return;

  const screen = document.createElement('div');
  screen.className = 'screen';
  screen.id = 'screen-comprometida';
  screen.innerHTML = `
    <!-- Hero -->
    <div style="background:linear-gradient(135deg,rgba(240,184,64,.12) 0%,rgba(240,184,64,.04) 100%);border:1px solid rgba(240,184,64,.25);border-radius:var(--radius);padding:20px;margin-bottom:10px;position:relative;overflow:hidden;">
      <div style="position:absolute;top:-30px;right:-30px;width:110px;height:110px;background:rgba(240,184,64,.06);border-radius:50%;"></div>
      <div style="font-size:10px;color:rgba(240,184,64,.7);letter-spacing:1.5px;text-transform:uppercase;font-family:'DM Mono',monospace;font-weight:600;">Plata por llegar</div>
      <div style="font-size:36px;font-weight:300;margin:6px 0 4px;letter-spacing:-2px;font-family:'DM Mono',monospace;color:var(--amber);" id="cp-hero-total">$0</div>
      <div style="font-size:11px;color:var(--text3);" id="cp-hero-sub">En ingresos futuros registrados</div>
    </div>

    <!-- Stats -->
    <div class="grid2" style="margin-bottom:9px;">
      <div class="stat"><div class="stat-label">Ya comprometido</div><div class="stat-value c-red" id="cp-stat-comprometido">$0</div></div>
      <div class="stat"><div class="stat-label">Libre al llegar</div><div class="stat-value c-green" id="cp-stat-libre">$0</div></div>
    </div>

    <!-- Lista -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin:18px 0 8px;">
      <div class="sec-title" style="margin:0;">Ingresos comprometidos</div>
      <button type="button" ${Events.attr('cp:abrirNuevo')} style="display:flex;align-items:center;gap:5px;background:rgba(240,184,64,.12);border:1px solid rgba(240,184,64,.35);color:var(--amber);border-radius:8px;padding:5px 11px;font-size:11px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Nuevo
      </button>
    </div>
    <div id="cp-lista"></div>

    <!-- Tip -->
    <div style="background:rgba(200,240,96,.05);border:1px solid rgba(200,240,96,.15);border-radius:var(--radius-sm);padding:12px 14px;margin-top:10px;">
      <div style="font-size:10px;font-weight:700;color:rgba(200,240,96,.6);text-transform:uppercase;letter-spacing:1px;font-family:'DM Mono',monospace;margin-bottom:5px;">¿Cómo funciona?</div>
      <div style="font-size:11px;color:var(--text3);line-height:1.6;">Registrá aquí ingresos que todavía no te han llegado pero que ya sabés que van a tener destino. Cuando la plata llegue de verdad, tocás <b style="color:var(--text2);">Recibir</b> y la app te guía a distribuirla sin enredos.</div>
    </div>
  `;
  main.appendChild(screen);
}

/* ── INYECTAR ÍTEM EN MENÚ MÁS ──────────────────────────────────── */
function _injectMasItem(){
  const masMenu = document.getElementById('mas-menu');
  if(!masMenu || document.getElementById('mas-comprometida')) return;
  const item = document.createElement('div');
  item.className = 'mas-item';
  item.id = 'mas-comprometida';
  item.setAttribute('data-screen', 'comprometida');
  item.innerHTML = `
    <div class="mas-item-icon" style="background:rgba(240,184,64,.1);border-color:rgba(240,184,64,.25);">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="6" width="20" height="13" rx="2"/>
        <path d="M2 10h20"/>
        <path d="M12 14v2M8 14h2M14 14h2"/>
        <path d="M6 6V4M18 6V4"/>
      </svg>
    </div>
    <div>
      <div class="mas-item-label">Plata comprometida</div>
      <div class="mas-item-sub">Ingresos futuros con destino</div>
    </div>
  `;
  // Insertar antes de Alcancía o antes de Configuración
  const masAlcancia = document.getElementById('mas-alcancia');
  const masConfig   = document.getElementById('mas-config');
  const anchor = masAlcancia || masConfig;
  if(anchor) masMenu.insertBefore(item, anchor);
  else masMenu.appendChild(item);

  item.addEventListener('click', ()=>{
    if(typeof closeMas === 'function') closeMas();
    _injectScreen();
    _injectSheet();
    if(typeof showScreen === 'function') showScreen('comprometida');
  });
}

/* ── INYECTAR SHEET PRINCIPAL ───────────────────────────────────── */
function _injectSheet(){
  if(document.getElementById('sheet-cp-nuevo')) return;
  const html = `
  <!-- NUEVO INGRESO COMPROMETIDO -->
  <div class="overlay" id="sheet-cp-nuevo" data-sheet-id="cp-nuevo">
    <div class="sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-title" id="cp-sheet-title">Nuevo ingreso comprometido</div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:16px;line-height:1.5;">Registrá plata que todavía no llegó pero que ya tiene destino.<br>Los saldos <b style="color:var(--text);">no se tocan</b> hasta que vos confirmes que llegó.</div>

      <div class="ig">
        <label class="il" for="cp-desc">¿Qué plata es? <span style="color:var(--red);">*</span></label>
        <input type="text" id="cp-desc" placeholder="Ej: Arriendo de mamá, Pago de Juan..." maxlength="80">
      </div>
      <div class="ig">
        <label class="il" for="cp-monto-total">Monto total que va a llegar <span style="color:var(--red);">*</span></label>
        <input type="text" inputmode="decimal" id="cp-monto-total" placeholder="0,00" class="money-input">
      </div>
      <div class="ig">
        <label class="il" for="cp-fecha-llegada">¿Cuándo llega? <span style="color:var(--red);">*</span></label>
        <input type="date" id="cp-fecha-llegada">
      </div>
      <div class="ig">
        <label class="il" for="cp-cuenta-destino">¿A qué cuenta cae?</label>
        <div class="select-wrap"><select id="cp-cuenta-destino"><option value="">Sin especificar</option></select></div>
      </div>

      <!-- Destinos / compromisos -->
      <div style="margin-top:6px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <div class="il" style="margin:0;">¿A dónde va esta plata?</div>
          <button type="button" ${Events.attr('cp:agregarDestino')} style="font-size:10px;background:rgba(200,240,96,.1);border:1px solid rgba(200,240,96,.3);color:var(--accent);border-radius:6px;padding:3px 9px;cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:600;">+ Agregar destino</button>
        </div>
        <div id="cp-destinos-list"></div>
        <div id="cp-balance-preview" style="font-size:12px;font-family:'DM Mono',monospace;min-height:18px;padding:8px 0;"></div>
      </div>

      <button type="button" class="btn btn-primary" ${Events.attr('cp:guardar')} style="background:var(--amber);color:#0a0a0a;border:none;box-shadow:0 2px 14px rgba(240,184,64,.3);">Guardar</button>
      <button type="button" class="btn btn-ghost" data-close-sheet="cp-nuevo" ${Events.attr('cp:cancelarSheet')}>Cancelar</button>
    </div>
  </div>

  <!-- SHEET DESTINO -->
  <div class="overlay" id="sheet-cp-destino" data-sheet-id="cp-destino">
    <div class="sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-title">Agregar destino</div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:14px;">¿Para qué va a usarse parte de este ingreso?</div>

      <!-- Tipo: tarjetas visuales -->
      <div style="margin-bottom:14px;">
        <div class="il" style="font-size:10px;text-transform:uppercase;letter-spacing:1px;font-family:'DM Mono',monospace;color:var(--text3);margin-bottom:8px;font-weight:700;">Tipo de destino</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;" id="cpd-tipo-cards">
          <button type="button" class="cpd-tipo-card" data-tipo="reposicion" ${Events.attr('cp:dSetTipo','reposicion')}
            style="padding:11px 10px;border-radius:var(--radius-sm);cursor:pointer;font-family:'DM Sans',sans-serif;text-align:left;border:1.5px solid rgba(176,144,240,.35);background:rgba(176,144,240,.1);color:var(--purple);transition:all .15s;">
            <div style="font-size:13px;margin-bottom:2px;"><i class="fa-solid fa-rotate-left" style="margin-right:5px;font-size:12px;"></i>Reponer</div>
            <div style="font-size:9px;opacity:.75;line-height:1.3;">Devolver plata de una cajita que ya usé</div>
          </button>
          <button type="button" class="cpd-tipo-card" data-tipo="gasto" ${Events.attr('cp:dSetTipo','gasto')}
            style="padding:11px 10px;border-radius:var(--radius-sm);cursor:pointer;font-family:'DM Sans',sans-serif;text-align:left;border:1.5px solid var(--border2);background:transparent;color:var(--text2);transition:all .15s;">
            <div style="font-size:13px;margin-bottom:2px;"><i class="fa-solid fa-receipt" style="margin-right:5px;font-size:12px;"></i>Gasto</div>
            <div style="font-size:9px;opacity:.75;line-height:1.3;">Cubrir un pago próximo o en TC</div>
          </button>
          <button type="button" class="cpd-tipo-card" data-tipo="abono_deuda" ${Events.attr('cp:dSetTipo','abono_deuda')}
            style="padding:11px 10px;border-radius:var(--radius-sm);cursor:pointer;font-family:'DM Sans',sans-serif;text-align:left;border:1.5px solid var(--border2);background:transparent;color:var(--text2);transition:all .15s;">
            <div style="font-size:13px;margin-bottom:2px;"><i class="fa-solid fa-handshake" style="margin-right:5px;font-size:12px;"></i>Me devuelven</div>
            <div style="font-size:9px;opacity:.75;line-height:1.3;">Abono a lo que me deben</div>
          </button>
          <button type="button" class="cpd-tipo-card" data-tipo="otro" ${Events.attr('cp:dSetTipo','otro')}
            style="padding:11px 10px;border-radius:var(--radius-sm);cursor:pointer;font-family:'DM Sans',sans-serif;text-align:left;border:1.5px solid var(--border2);background:transparent;color:var(--text2);transition:all .15s;">
            <div style="font-size:13px;margin-bottom:2px;"><i class="fa-solid fa-tag" style="margin-right:5px;font-size:12px;"></i>Otro</div>
            <div style="font-size:9px;opacity:.75;line-height:1.3;">Solo registro, sin mover saldos</div>
          </button>
        </div>
        <!-- Hidden select para compatibilidad con el código existente -->
        <select id="cpd-tipo" style="display:none;">
          <option value="reposicion">Repone plata que ya saqué de una cajita/cuenta</option>
          <option value="gasto">Cubre un gasto (servicios, internet, etc.)</option>
          <option value="abono_deuda">Abono a lo que me deben</option>
          <option value="otro">Otro (solo registro, sin efecto)</option>
        </select>
      </div>

      <div class="ig">
        <label class="il" for="cpd-desc">Descripción <span style="color:var(--red);">*</span></label>
        <input type="text" id="cpd-desc" placeholder="Ej: Internet + servicios, Abono mamá..." maxlength="60">
      </div>
      <div class="ig">
        <label class="il" for="cpd-monto">Monto <span style="color:var(--red);">*</span></label>
        <input type="text" inputmode="decimal" id="cpd-monto" placeholder="0,00" class="money-input">
      </div>
      <!-- Selector de persona (para abono_deuda) — solo personas que me deben -->
      <div class="ig" id="cpd-persona-wrap" style="display:none;">
        <label class="il" for="cpd-persona">¿Quién te devuelve?</label>
        <div class="select-wrap"><select id="cpd-persona"><option value="">Seleccionar persona</option></select></div>
        <div style="font-size:10px;color:var(--text3);margin-top:4px;line-height:1.4;"><i class="fa-solid fa-circle-info" style="margin-right:4px;color:var(--blue);font-size:9px;"></i>Solo aparecen personas que te deben plata.</div>
      </div>
      <!-- ¿De dónde salió el gasto? (para gasto) -->
      <div class="ig" id="cpd-gasto-origen-wrap" style="display:none;">
        <div class="il" style="margin-bottom:8px;">¿De dónde salió o va a salir esta plata?</div>
        <div style="display:flex;gap:7px;margin-bottom:8px;">
          <button type="button" id="cpd-origen-cajita-btn"
            ${Events.attr('cp:dSetGastoOrigen','cajita')}
            style="flex:1;padding:9px 0;border-radius:var(--radius-sm);font-size:12px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;border:1.5px solid rgba(176,144,240,.4);color:var(--purple);background:rgba(176,144,240,.1);transition:all .15s;">
            <i class="fa-solid fa-box" style="margin-right:5px;"></i>De una cajita
          </button>
          <button type="button" id="cpd-origen-tc-btn"
            ${Events.attr('cp:dSetGastoOrigen','tc')}
            style="flex:1;padding:9px 0;border-radius:var(--radius-sm);font-size:12px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;border:1.5px solid var(--border2);color:var(--text2);background:transparent;transition:all .15s;">
            <i class="fa-solid fa-credit-card" style="margin-right:5px;"></i>De la tarjeta
          </button>
        </div>
        <div id="cpd-gasto-cajita-wrap" style="display:none;">
          <label class="il" for="cpd-gasto-cajita" style="font-size:11px;margin-bottom:4px;">¿Qué cajita o cuenta?</label>
          <div class="select-wrap"><select id="cpd-gasto-cajita"><option value="">Sin especificar</option></select></div>
        </div>
        <div id="cpd-gasto-tc-wrap" style="display:none;">
          <label class="il" for="cpd-gasto-tc" style="font-size:11px;margin-bottom:4px;">¿Qué tarjeta?</label>
          <div class="select-wrap"><select id="cpd-gasto-tc"><option value="">Sin especificar</option></select></div>
          <div style="margin-top:10px;">
            <label class="il" for="cpd-gasto-tc-cajita" style="font-size:11px;margin-bottom:4px;">¿A qué cajita va esta plata cuando llegue el ingreso?</label>
            <div class="select-wrap"><select id="cpd-gasto-tc-cajita"><option value="">Sin especificar</option></select></div>
            <div style="font-size:10px;color:var(--text3);margin-top:5px;line-height:1.5;">Ej: tu cajita "Tarjeta" para tener la plata lista al pagar el extracto.</div>
          </div>
          <!-- Aviso: deuda de TC como favor -->
          <div style="margin-top:10px;padding:9px 11px;background:rgba(96,176,240,.07);border:1px solid rgba(96,176,240,.2);border-radius:var(--radius-sm);display:flex;align-items:flex-start;gap:8px;">
            <i class="fa-solid fa-circle-info" style="color:var(--blue);font-size:11px;margin-top:1px;flex-shrink:0;"></i>
            <div style="font-size:10px;color:var(--text3);line-height:1.5;">La deuda de la TC va a subir, pero la app sabe que <b style="color:var(--text2);">no es deuda tuya</b> — es un favor cubierto por este ingreso. Se marcará así en la pantalla de tarjetas.</div>
          </div>
        </div>
      </div>
      <!-- Cuenta destino: solo para reposicion -->
      <div class="ig" id="cpd-cuenta-wrap" style="display:none;">
        <label class="il" for="cpd-cuenta">¿A qué cajita/cuenta reponer?</label>
        <div class="select-wrap"><select id="cpd-cuenta"><option value="">Sin especificar</option></select></div>
      </div>
      <!-- ¿Ya saqué esta plata? (solo para reposicion) -->
      <div class="ig" id="cpd-ya-saque-wrap" style="display:none;">
        <div class="il" style="margin-bottom:8px;">¿Ya adelantaste esta plata?</div>
        <div style="display:flex;gap:8px;">
          <button type="button" id="cpd-ya-saque-si"
            ${Events.attr('cp:dSetYaSaque',true)}
            style="flex:1;padding:9px 0;border-radius:var(--radius-sm);font-size:12px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;border:1.5px solid var(--border2);color:var(--text2);background:transparent;transition:all .15s;">
            <i class="fa-solid fa-check" style="margin-right:5px;"></i>Sí, ya la saqué
          </button>
          <button type="button" id="cpd-ya-saque-no"
            ${Events.attr('cp:dSetYaSaque',false)}
            style="flex:1;padding:9px 0;border-radius:var(--radius-sm);font-size:12px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;border:1.5px solid rgba(200,240,96,.4);color:var(--accent);background:rgba(200,240,96,.08);transition:all .15s;">
            <i class="fa-regular fa-circle" style="margin-right:5px;"></i>No, esperaré
          </button>
        </div>
        <div style="font-size:10px;color:var(--text3);margin-top:5px;line-height:1.5;">Si ya la sacaste, la app descuenta el saldo ahora y lo repone cuando llegue el ingreso.</div>
      </div>
      <!-- Fecha límite de pago (para gastos de cajita no pagados) -->
      <div class="ig" id="cpd-fecha-pago-wrap" style="display:none;">
        <label class="il" for="cpd-fecha-pago">¿Para cuándo hay que pagarlo? <span style="font-size:10px;color:var(--text3);font-weight:400;">(opcional)</span></label>
        <input type="date" id="cpd-fecha-pago">
        <div style="font-size:10px;color:var(--text3);margin-top:4px;line-height:1.4;"><i class="fa-solid fa-bell" style="margin-right:4px;color:var(--amber);"></i>Unos días antes te recordamos que usés la plata de la cajita.</div>
      </div>
      <!-- ¿Ya lo pagué? (para servicios, tc, otro) -->
      <div class="ig" id="cpd-ya-pague-wrap" style="display:none;">
        <div class="il" style="margin-bottom:8px;">¿Ya lo pagaste?</div>
        <div style="display:flex;gap:8px;">
          <button type="button" id="cpd-ya-pague-si"
            ${Events.attr('cp:dSetYaPague',true)}
            style="flex:1;padding:9px 0;border-radius:var(--radius-sm);font-size:12px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;border:1.5px solid var(--border2);color:var(--text2);background:transparent;transition:all .15s;">
            <i class="fa-solid fa-check" style="margin-right:5px;"></i>Sí, ya lo pagué
          </button>
          <button type="button" id="cpd-ya-pague-no"
            ${Events.attr('cp:dSetYaPague',false)}
            style="flex:1;padding:9px 0;border-radius:var(--radius-sm);font-size:12px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;border:1.5px solid rgba(240,184,64,.4);color:var(--amber);background:rgba(240,184,64,.08);transition:all .15s;">
            <i class="fa-regular fa-circle" style="margin-right:5px;"></i>Pendiente de pagar
          </button>
        </div>
      </div>
      <button type="button" class="btn btn-primary" ${Events.attr('cp:dConfirmar')} style="background:var(--amber);color:#0a0a0a;border:none;">Agregar este destino</button>
      <button type="button" class="btn btn-ghost" data-close-sheet="cp-destino">Cancelar</button>
    </div>
  </div>

  <!-- SHEET RECIBIR (ejecutar el ingreso) -->
  <div class="overlay" id="sheet-cp-recibir" data-sheet-id="cp-recibir">
    <div class="sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-title">¡Llegó la plata! <i class="fa-solid fa-star" style="margin-left:4px;color:var(--accent);font-size:14px;"></i></div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:4px;">Revisá el plan y confirma qué se va a hacer con cada parte.</div>

      <div id="cp-recibir-desc-card" style="background:rgba(240,184,64,.08);border:1px solid rgba(240,184,64,.2);border-radius:var(--radius-sm);padding:12px 14px;margin-bottom:14px;">
        <div style="font-size:10px;color:rgba(240,184,64,.7);text-transform:uppercase;letter-spacing:.8px;font-family:'DM Mono',monospace;margin-bottom:3px;">Ingreso</div>
        <div style="font-size:16px;font-weight:600;" id="cp-recibir-desc">—</div>
        <div style="font-size:13px;font-family:'DM Mono',monospace;color:var(--amber);margin-top:2px;" id="cp-recibir-monto">$0</div>
      </div>

      <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1.2px;font-family:'DM Mono',monospace;margin-bottom:8px;">Distribución</div>
      <div id="cp-recibir-plan"></div>

      <div id="cp-recibir-sobrante-wrap" style="display:none;margin-top:8px;padding:12px 14px;background:rgba(200,240,96,.07);border:1px solid rgba(200,240,96,.2);border-radius:var(--radius-sm);">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(200,240,96,.8)" stroke-width="2.5" stroke-linecap="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
          <div style="font-size:10px;color:rgba(200,240,96,.7);text-transform:uppercase;letter-spacing:.8px;font-family:'DM Mono',monospace;font-weight:700;">Ingreso libre</div>
        </div>
        <div style="font-size:18px;font-weight:600;font-family:'DM Mono',monospace;color:var(--accent);margin-bottom:8px;" id="cp-recibir-sobrante">$0</div>
        <label class="il" for="cp-recibir-sobrante-cuenta" style="font-size:10px;margin-bottom:6px;">¿A dónde va este ingreso?</label>
        <div class="select-wrap"><select id="cp-recibir-sobrante-cuenta" style="font-size:13px;padding:9px 12px;"><option value="">Sin especificar</option></select></div>
        <div style="font-size:10px;color:var(--text3);margin-top:5px;line-height:1.4;">Esta plata es tuya — entra como ingreso a la cuenta que elijas.</div>
      </div>

      <div id="cp-recibir-recordatorios" style="display:none;"></div>

      <div class="ig" style="margin-top:14px;">
        <label class="il" for="cp-recibir-fecha">Fecha de recibo</label>
        <input type="date" id="cp-recibir-fecha">
      </div>

      <button type="button" class="btn btn-primary" ${Events.attr('cp:confirmarRecibir')} style="background:var(--accent);color:#0a0a0a;border:none;box-shadow:0 2px 14px rgba(200,240,96,.25);">Confirmar y distribuir</button>
      <button type="button" class="btn btn-ghost" data-close-sheet="cp-recibir">Cancelar</button>
    </div>
  </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);
}

/* ── ESTADO DEL MÓDULO ───────────────────────────────────────────── */
let _cpEditId = null;
let _cpDestinosTmp = [];   // destinos mientras se construye el nuevo ingreso
let _cpRecibirId = null;
let _cpMarcarId = null;         // id del ingreso cuyo sheet "Pagos" está abierto
let _cpMarcarTmp = null;        // copia de trabajo de destinos mientras se marca
let _cpdGastoOrigenVal = 'cajita'; // origen elegido en el destino "Gasto" que se está armando
let _cpdYaSaqueVal = false;        // ¿ya adelantó? (destino "Reposición" en construcción)
let _cpdYaPagueVal = false;        // ¿ya pagó/cargó? (destino "Gasto"/"Otro" en construcción)

/* ── HELPERS ─────────────────────────────────────────────────────── */
function _cpData(){
  if(!window.S) return [];
  if(!S.plataCometida) S.plataCometida = [];
  return S.plataCometida;
}

function _cpPoblarCuentas(selId, incluirTC){
  const sel = document.getElementById(selId);
  if(!sel) return;
  sel.innerHTML = buildFuentesOptsHtml({ incluirTC: !!incluirTC });
}

function _cpPoblarPersonas(selId){
  const sel = document.getElementById(selId);
  if(!sel) return;
  const deudores = (window.S && S.deudores) ? S.deudores : [];
  // Solo mostrar personas que realmente me deben plata (saldo > 0)
  const conDeuda = deudores.filter(d => {
    const saldo = typeof getDeudorSaldo === 'function' ? getDeudorSaldo(d) : 0;
    return saldo > 0;
  });
  sel.innerHTML = '<option value="">Seleccionar persona</option>';
  if(conDeuda.length === 0){
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '— Nadie te debe plata aún —';
    opt.disabled = true;
    sel.appendChild(opt);
  } else {
    conDeuda.forEach(d => {
      const saldo = typeof getDeudorSaldo === 'function' ? getDeudorSaldo(d) : 0;
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = d.nombre + ' — te debe ' + fmt(saldo);
      sel.appendChild(opt);
    });
  }
}

function _cpPoblarTC(selId){
  const sel = document.getElementById(selId);
  if(!sel) return;
  const tcs = (window.S && S.tarjetasCredito) ? S.tarjetasCredito : [];
  sel.innerHTML = '<option value="">Sin especificar</option>';
  tcs.forEach(tc => {
    const opt = document.createElement('option');
    opt.value = tc.id;
    opt.textContent = tc.nombre + (tc.deuda ? ' — deuda '+fmt(tc.deuda) : '');
    sel.appendChild(opt);
  });
}

function _cpFuenteLabel(val){
  return typeof fuenteLabel === 'function' ? fuenteLabel(val) : (val||'Sin especificar');
}

/* ── TIPOS DE DESTINO ────────────────────────────────────────────── */
const _CP_TIPO_LABELS = {
  reposicion:  { label:'Repone cajita/cuenta que ya usé', color:'var(--purple)', bg:'rgba(176,144,240,.1)',  border:'rgba(176,144,240,.3)' },
  gasto:       { label:'Gasto pendiente',                  color:'var(--amber)',  bg:'rgba(240,184,64,.08)', border:'rgba(240,184,64,.2)' },
  abono_deuda: { label:'Abono a deuda pendiente',          color:'var(--accent)', bg:'rgba(200,240,96,.08)', border:'rgba(200,240,96,.2)' },
  otro:        { label:'Otro (sin efecto en saldos)',       color:'var(--text2)',  bg:'rgba(136,136,128,.08)', border:'rgba(136,136,128,.2)' },
};

/* ── RENDER LISTA PRINCIPAL ──────────────────────────────────────── */
function _cpRenderLista(){
  const el = document.getElementById('cp-lista');
  if(!el) return;
  const items = _cpData();
  const pendientes = items.filter(i => !i.recibido);
  const recibidos = items.filter(i => i.recibido);

  // Stats hero
  const totalPorLlegar = pendientes.reduce((a,i)=>a+(i.montoTotal||0),0);
  const totalComprometido = pendientes.reduce((a,i)=>{
    return a + (i.destinos||[]).filter(d=>d.tipo!=='libre').reduce((s,d)=>s+(d.monto||0),0);
  },0);
  const totalLibre = pendientes.reduce((a,i)=>{
    const comp = (i.destinos||[]).filter(d=>d.tipo!=='libre').reduce((s,d)=>s+(d.monto||0),0);
    return a + Math.max(0,(i.montoTotal||0)-comp);
  },0);

  const heroEl = document.getElementById('cp-hero-total');
  const subEl = document.getElementById('cp-hero-sub');
  const statComp = document.getElementById('cp-stat-comprometido');
  const statLibre = document.getElementById('cp-stat-libre');
  if(heroEl) heroEl.textContent = fmt(totalPorLlegar);
  if(subEl) subEl.textContent = pendientes.length
    ? pendientes.length + ' ingreso'+(pendientes.length>1?'s':'')+' por llegar'
    : 'Sin ingresos futuros registrados';
  if(statComp) statComp.textContent = fmt(totalComprometido);
  if(statLibre) statLibre.textContent = fmt(totalLibre);

  if(!items.length){
    el.innerHTML = `<div style="text-align:center;padding:32px 16px;">
      <div style="width:48px;height:48px;border-radius:14px;background:rgba(240,184,64,.1);border:1px solid rgba(240,184,64,.2);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" stroke-width="1.7" stroke-linecap="round"><rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 10h20"/><path d="M6 6V4M18 6V4"/></svg>
      </div>
      <div style="font-size:13px;font-weight:600;margin-bottom:5px;">Sin ingresos registrados</div>
      <div style="font-size:11px;color:var(--text3);line-height:1.5;">Tocá <b style="color:var(--text2);">Nuevo</b> para registrar plata que va a llegar.</div>
    </div>`;
    return;
  }

  let contenido = '';

  // Pendientes
  if(pendientes.length){
    contenido += '<div class="sec-title" style="margin-top:4px;">Por llegar</div>';
    pendientes.sort((a,b)=>(a.fechaLlegada||'').localeCompare(b.fechaLlegada||''));
    pendientes.forEach(item => {
      const comp = (item.destinos||[]).filter(d=>d.tipo!=='libre').reduce((s,d)=>s+(d.monto||0),0);
      const libre = Math.max(0,(item.montoTotal||0)-comp);
      const pctComp = item.montoTotal > 0 ? Math.min(100,(comp/item.montoTotal)*100) : 0;
      const diasStr = _cpDiasHastaStr(item.fechaLlegada);

      // Bloque de barra de compromisos: solo números/labels fijos, sin texto
      // libre del usuario — se arma aparte y se interpola con raw() (mismo
      // criterio que un fragmento de HTML de confianza ya armado).
      const barraCompromiso = pctComp > 0 ? `
        <div style="margin-bottom:10px;">
          <div style="height:4px;background:var(--bg3);border-radius:2px;overflow:hidden;margin-bottom:4px;">
            <div style="height:100%;width:${pctComp.toFixed(1)}%;background:var(--red);border-radius:2px;transition:width .4s;"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:10px;font-family:'DM Mono',monospace;">
            <span style="color:var(--red);">Comprometido: ${fmt(comp)}</span>
            <span style="color:var(--accent);">Le sobra: ${fmt(libre)}</span>
          </div>
        </div>` : `
        <div style="font-size:10px;color:var(--accent);font-family:'DM Mono',monospace;margin-bottom:10px;">Le sobra: ${fmt(item.montoTotal)} (nada comprometido)</div>`;

      // Chips de destinos: cada uno arma su propio estadoBadge (markup fijo,
      // sin texto libre) y pasa por html`` para escapar d.desc; el join('')
      // final se interpola con raw() en el card exterior, mismo criterio ya
      // documentado (mesada.js/gastos.js) para fragmentos ya escapados.
      const chipsDestinos = (item.destinos||[]).length ? html`
        <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px;">
          ${raw((item.destinos||[]).map(d=>{
            const ti = _CP_TIPO_LABELS[d.tipo]||_CP_TIPO_LABELS.otro;
            let estadoBadge = '';
            if(d.tipo === 'reposicion'){
              estadoBadge = d.yaSaque
                ? ` <span style="font-size:8px;padding:1px 5px;border-radius:8px;background:rgba(176,144,240,.2);color:var(--purple);vertical-align:middle;"><i class="fa-solid fa-check" style="margin-right:2px;"></i>saqué</span>`
                : ` <span style="font-size:8px;padding:1px 5px;border-radius:8px;background:rgba(200,240,96,.1);color:var(--accent);vertical-align:middle;">pendiente</span>`;
            } else if(d.tipo === 'gasto'){
              const origenTag = d.gastoOrigen === 'tc'
                ? ` <span style="font-size:8px;padding:1px 5px;border-radius:8px;background:rgba(240,104,104,.12);color:var(--red);vertical-align:middle;"><i class="fa-solid fa-credit-card" style="margin-right:3px;"></i>TC</span>`
                : ` <span style="font-size:8px;padding:1px 5px;border-radius:8px;background:rgba(176,144,240,.12);color:var(--purple);vertical-align:middle;"><i class="fa-solid fa-box" style="margin-right:3px;"></i>cajita</span>`;
              const pagoTag = d.yaPague
                ? ` <span style="font-size:8px;padding:1px 5px;border-radius:8px;background:rgba(200,240,96,.15);color:var(--accent);vertical-align:middle;"><i class="fa-solid fa-check"></i></span>`
                : ` <span style="font-size:8px;padding:1px 5px;border-radius:8px;background:rgba(240,184,64,.12);color:var(--amber);vertical-align:middle;"><i class="fa-regular fa-clock"></i></span>`;
              estadoBadge = origenTag + pagoTag;
            } else {
              estadoBadge = d.yaPague
                ? ` <span style="font-size:8px;padding:1px 5px;border-radius:8px;background:rgba(200,240,96,.15);color:var(--accent);vertical-align:middle;"><i class="fa-solid fa-check" style="margin-right:2px;"></i>pagado</span>`
                : ` <span style="font-size:8px;padding:1px 5px;border-radius:8px;background:rgba(240,184,64,.12);color:var(--amber);vertical-align:middle;"><i class="fa-regular fa-clock" style="margin-right:3px;"></i>por pagar</span>`;
            }
            return html`<span style="font-size:10px;font-weight:600;padding:3px 9px;border-radius:20px;background:${ti.bg};border:1px solid ${ti.border};color:${ti.color};font-family:'DM Mono',monospace;">${d.desc}: ${fmt(d.monto)}${raw(estadoBadge)}</span>`;
          }).join(''))}
        </div>` : '';

      contenido += html`<div class="card" style="margin-bottom:9px;padding:15px 15px 12px;">
        <!-- Header -->
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px;">
          <div style="flex:1;min-width:0;">
            <div style="font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.desc}</div>
            <div style="font-size:11px;color:${diasStr.urgente?'var(--amber)':'var(--text3)'};font-family:'DM Mono',monospace;margin-top:2px;">${diasStr.texto}</div>
          </div>
          <div style="text-align:right;flex-shrink:0;margin-left:10px;">
            <div style="font-size:17px;font-weight:600;font-family:'DM Mono',monospace;color:var(--amber);">${fmt(item.montoTotal)}</div>
            ${item.cuentaDestino ? html`<div style="font-size:9px;color:var(--text3);margin-top:1px;">${_cpFuenteLabel(item.cuentaDestino)}</div>` : ''}
          </div>
        </div>

        <!-- Barra de compromisos -->
        ${raw(barraCompromiso)}

        <!-- Destinos chips con estado -->
        ${chipsDestinos}

        <!-- Acciones -->
        <div style="display:flex;gap:7px;flex-wrap:wrap;">
          <button type="button" ${raw(Events.attr('cp:abrirRecibir', item.id))}
            style="flex:1;min-width:80px;padding:8px;border-radius:var(--radius-sm);font-size:12px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;background:rgba(200,240,96,.12);border:1.5px solid rgba(200,240,96,.35);color:var(--accent);display:flex;align-items:center;justify-content:center;gap:5px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            ¡Llegó!
          </button>
          <button type="button" ${raw(Events.attr('cp:marcarPagos', item.id))}
            style="padding:8px 12px;border-radius:var(--radius-sm);font-size:12px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;background:rgba(240,184,64,.08);border:1.5px solid rgba(240,184,64,.3);color:var(--amber);"
            title="Marcar qué ya pagaste">
            <i class="fa-solid fa-check-double" style="margin-right:5px;"></i>Pagos
          </button>
          <button type="button" ${raw(Events.attr('cp:abrirEditar', item.id))}
            style="padding:8px 12px;border-radius:var(--radius-sm);font-size:12px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;background:rgba(136,136,128,.08);border:1.5px solid var(--border2);color:var(--text2);">
            Editar
          </button>
          <button type="button" ${raw(Events.attr('cp:eliminar', item.id))}
            style="padding:8px 12px;border-radius:var(--radius-sm);font-size:12px;cursor:pointer;background:rgba(240,104,104,.08);border:1.5px solid rgba(240,104,104,.2);color:var(--red);">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
          </button>
        </div>
      </div>`;
    });
  }

  // Recibidos recientes: solo mostrar los que tienen pagos de cajita AÚN pendientes
  const recibidosConPendientes = recibidos.filter(item =>
    (item.destinos||[]).some(d => d.tipo==='gasto' && !d.yaPague && d.gastoOrigen==='cajita' && d.gastoCajita)
  );
  if(recibidosConPendientes.length){
    const hoyMs = new Date(hoy()+'T00:00:00').getTime();
    contenido += '<div class="sec-title" style="margin-top:14px;">Plata guardada para pagar</div>';
    recibidosConPendientes.sort((a,b)=>(b.fechaRecibido||'').localeCompare(a.fechaRecibido||'')).slice(0,5).forEach(item=>{
      // Gastos pendientes de cajita con plata guardada
      const gastosGuardados = (item.destinos||[]).filter(d =>
        d.tipo === 'gasto' && !d.yaPague && d.gastoOrigen === 'cajita' && d.gastoCajita
      );
      let guardadaHtml = '';
      if(gastosGuardados.length){
        guardadaHtml = html`<div style="margin-top:9px;padding:9px 11px;background:rgba(200,240,96,.06);border:1px solid rgba(200,240,96,.18);border-radius:var(--radius-sm);">
          <div style="display:flex;align-items:center;gap:5px;margin-bottom:6px;">
            <i class="fa-solid fa-vault" style="color:var(--accent);font-size:10px;"></i>
            <span style="font-size:10px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.7px;font-family:'DM Mono',monospace;">Plata guardada para pagar</span>
          </div>
          ${raw(gastosGuardados.map(d => {
            const cajLabel = typeof _cpFuenteLabel==='function' ? _cpFuenteLabel(d.gastoCajita) : d.gastoCajita;
            let fechaInfo = '';
            if(d.fechaPago){
              const diasFecha = Math.round((new Date(d.fechaPago+'T00:00:00').getTime() - hoyMs)/86400000);
              let colorFecha = 'var(--text3)';
              let iconoFecha = 'fa-calendar';
              let textoFecha = 'Pagar el '+d.fechaPago;
              if(diasFecha < 0){ colorFecha='var(--red)'; iconoFecha='fa-triangle-exclamation'; textoFecha='¡Venció! ('+d.fechaPago+')'; }
              else if(diasFecha === 0){ colorFecha='var(--amber)'; iconoFecha='fa-bell'; textoFecha='¡Pagar hoy!'; }
              else if(diasFecha === 1){ colorFecha='var(--amber)'; iconoFecha='fa-bell'; textoFecha='Pagar mañana'; }
              else if(diasFecha <= 4){ colorFecha='var(--amber)'; iconoFecha='fa-clock'; textoFecha='Pagar en '+diasFecha+' días ('+d.fechaPago+')'; }
              fechaInfo = ` · <i class="fa-solid ${iconoFecha}" style="color:${colorFecha};font-size:9px;margin-right:2px;"></i><span style="color:${colorFecha};">${textoFecha}</span>`;
            }
            return html`<div style="display:flex;align-items:flex-start;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(200,240,96,.1);">
              <div style="min-width:0;flex:1;">
                <div style="font-size:11px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${d.desc}</div>
                <div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;margin-top:1px;"><i class="fa-solid fa-box" style="font-size:9px;margin-right:3px;color:var(--purple);"></i>${cajLabel}${raw(fechaInfo)}</div>
              </div>
              <span style="font-size:11px;font-weight:600;font-family:'DM Mono',monospace;color:var(--accent);margin-left:8px;flex-shrink:0;">${fmt(d.monto)}</span>
            </div>`;
          }).join(''))}
        </div>`;
      }

      const tieneUrgente = gastosGuardados.some(d => {
        if(!d.fechaPago) return false;
        const dias = Math.round((new Date(d.fechaPago+'T00:00:00').getTime() - hoyMs)/86400000);
        return dias <= 3;
      });

      contenido += html`<div class="card card-sm" style="margin-bottom:7px;${tieneUrgente?'border-color:rgba(240,184,64,.4);':''}">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div style="min-width:0;flex:1;">
            <div style="font-size:13px;font-weight:600;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.desc}</div>
            <div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;margin-top:1px;">Recibido el ${item.fechaRecibido||'—'}${raw(tieneUrgente?' <span style="color:var(--amber);font-weight:700;">· Pago próximo</span>':'')}</div>
          </div>
          <span style="font-size:13px;font-weight:600;font-family:'DM Mono',monospace;color:var(--text2);margin-left:8px;flex-shrink:0;">${fmt(item.montoTotal)}</span>
        </div>
        ${guardadaHtml}
        <button type="button" ${raw(Events.attr('cp:marcarPagos', item.id))}
          style="width:100%;margin-top:10px;padding:9px 0;border-radius:var(--radius-sm);font-size:12px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;background:rgba(200,240,96,.1);border:1.5px solid rgba(200,240,96,.3);color:var(--accent);">
          <i class="fa-solid fa-check" style="margin-right:5px;"></i>Marcar como pagado
        </button>
      </div>`;
    });
  }

  el.innerHTML = contenido;
}


function _cpDiasHastaStr(fecha){
  if(!fecha) return { texto:'Sin fecha definida', urgente:false };
  const hoyMs = new Date(hoy()+'T00:00:00').getTime();
  const llegaMs = new Date(fecha+'T00:00:00').getTime();
  const dias = Math.round((llegaMs - hoyMs)/86400000);
  if(dias < 0)  return { texto:`Llegaba hace ${Math.abs(dias)} día${Math.abs(dias)!==1?'s':''} — ¿ya recibiste?`, urgente:true };
  if(dias === 0) return { texto:'Llega hoy', urgente:true };
  if(dias === 1) return { texto:'Llega mañana', urgente:true };
  if(dias <= 5)  return { texto:`Llega en ${dias} días (${fecha})`, urgente:true };
  return { texto:`Llega el ${fecha}`, urgente:false };
}

/* ── NUEVO / EDITAR ──────────────────────────────────────────────── */
function _cpAbrirNuevo(){
  _cpEditId = null;
  _cpDestinosTmp = [];
  document.getElementById('cp-sheet-title').textContent = 'Nuevo ingreso comprometido';
  document.getElementById('cp-desc').value = '';
  document.getElementById('cp-monto-total').value = '';
  document.getElementById('cp-fecha-llegada').value = '';
  _cpPoblarCuentas('cp-cuenta-destino', false);
  document.getElementById('cp-cuenta-destino').value = '';
  _cpRenderDestinosTmp();
  openSheet('cp-nuevo');
  setTimeout(()=>document.getElementById('cp-desc').focus(), 200);
};

function _cpAbrirEditar(id){
  const items = _cpData();
  const item = items.find(i=>i.id===id);
  if(!item) return;
  _cpEditId = id;
  _cpDestinosTmp = JSON.parse(JSON.stringify(item.destinos||[]));
  document.getElementById('cp-sheet-title').textContent = 'Editar ingreso';
  document.getElementById('cp-desc').value = item.desc||'';
  if(typeof window._moneyDigits !== 'undefined' && window.fmtInput)
    document.getElementById('cp-monto-total').value = fmtInput(item.montoTotal||0);
  else
    document.getElementById('cp-monto-total').value = String(item.montoTotal||0).replace('.',',');
  document.getElementById('cp-fecha-llegada').value = item.fechaLlegada||'';
  _cpPoblarCuentas('cp-cuenta-destino', false);
  document.getElementById('cp-cuenta-destino').value = item.cuentaDestino||'';
  _cpRenderDestinosTmp();
  openSheet('cp-nuevo');
};

function _cpCancelSheet(){
  _cpEditId = null;
  _cpDestinosTmp = [];
};

function _cpGuardar(){
  const desc = (document.getElementById('cp-desc').value||'').trim();
  if(!desc){ toast('Escribí de qué plata es','err'); return; }

  const montoStr = document.getElementById('cp-monto-total').value||'';
  const monto = typeof parseMoney === 'function' ? parseMoney(montoStr) : parseFloat(montoStr.replace(/\./g,'').replace(',','.'));
  if(!monto || monto <= 0){ toast('Ingresá el monto total','err'); return; }

  const fecha = document.getElementById('cp-fecha-llegada').value;
  if(!fecha){ toast('Indicá cuándo llega','err'); return; }

  const cuentaDestino = document.getElementById('cp-cuenta-destino').value||'';

  const totalComp = _cpDestinosTmp.reduce((a,d)=>a+(d.monto||0),0);
  if(totalComp > monto){
    toast('Los destinos superan el monto total','err'); return;
  }

  _cpData(); // asegurar que existe S.plataCometida
  if(_cpEditId){
    const item = S.plataCometida.find(i=>i.id===_cpEditId);
    if(item){
      item.desc = desc;
      item.montoTotal = monto;
      item.fechaLlegada = fecha;
      item.cuentaDestino = cuentaDestino;
      item.destinos = JSON.parse(JSON.stringify(_cpDestinosTmp));
    }
  } else {
    S.plataCometida.push({
      id: uid(),
      desc,
      montoTotal: monto,
      fechaLlegada: fecha,
      cuentaDestino,
      destinos: JSON.parse(JSON.stringify(_cpDestinosTmp)),
      recibido: false,
      creadoEn: hoy(),
    });
  }

  save();
  closeSheet('cp-nuevo');
  _cpRenderLista();
  toast(_cpEditId ? 'Ingreso actualizado' : 'Ingreso registrado <i class="fa-solid fa-check"></i>', 'ok');
  _cpEditId = null;
  _cpDestinosTmp = [];

  if(window.logCambio) logCambio(
    (_cpEditId?'Editaste':'Registraste')+' plata comprometida: "'+desc+'"', '', monto, 'ingreso'
  );

  // Agregar a "Necesita atención" si llega pronto
  if(typeof renderAttencion === 'function') renderAttencion();
};

/* ── DESTINOS TEMPORALES ─────────────────────────────────────────── */
function _cpdSetTipo(tipo){
  // Actualizar hidden select
  const sel = document.getElementById('cpd-tipo');
  if(sel){ sel.value = tipo; }
  // Actualizar tarjetas visuales
  const colors = {
    reposicion: { border:'rgba(176,144,240,.4)', bg:'rgba(176,144,240,.12)', color:'var(--purple)' },
    gasto:      { border:'rgba(240,184,64,.4)',  bg:'rgba(240,184,64,.08)',  color:'var(--amber)' },
    abono_deuda:{ border:'rgba(200,240,96,.4)',  bg:'rgba(200,240,96,.08)', color:'var(--accent)' },
    otro:       { border:'rgba(136,136,128,.35)',bg:'rgba(136,136,128,.08)',color:'var(--text2)' },
  };
  document.querySelectorAll('.cpd-tipo-card').forEach(btn => {
    const t = btn.getAttribute('data-tipo');
    if(t === tipo){
      const c = colors[t]||colors.otro;
      btn.style.borderColor = c.border;
      btn.style.background = c.bg;
      btn.style.color = c.color;
    } else {
      btn.style.borderColor = 'var(--border2)';
      btn.style.background = 'transparent';
      btn.style.color = 'var(--text3)';
    }
  });
  // Llamar el handler original
  if(typeof _cpdTipoChange === 'function') _cpdTipoChange();
};

function _cpAgregarDestino(){
  _cpPoblarPersonas('cpd-persona');
  _cpPoblarTC('cpd-tc');
  _cpPoblarCuentas('cpd-cuenta', false);
  document.getElementById('cpd-desc').value = '';
  document.getElementById('cpd-monto').value = '';
  const fpInput = document.getElementById('cpd-fecha-pago');
  if(fpInput) fpInput.value = '';
  // Activar "reposicion" por defecto con UI de tarjeta
  _cpdSetTipo('reposicion');
  openSheet('cp-destino');
  setTimeout(()=>document.getElementById('cpd-desc').focus(), 200);
};

function _cpdTipoChange(){
  const tipo = document.getElementById('cpd-tipo').value;
  const personaWrap     = document.getElementById('cpd-persona-wrap');
  const gastoOrigenWrap = document.getElementById('cpd-gasto-origen-wrap');
  const cuentaWrap      = document.getElementById('cpd-cuenta-wrap');
  const yaSaqueWrap     = document.getElementById('cpd-ya-saque-wrap');
  const yaPagueWrap     = document.getElementById('cpd-ya-pague-wrap');

  if(personaWrap)     personaWrap.style.display     = tipo==='abono_deuda' ? '' : 'none';
  if(gastoOrigenWrap) gastoOrigenWrap.style.display  = tipo==='gasto' ? '' : 'none';
  if(cuentaWrap)      cuentaWrap.style.display       = tipo==='reposicion' ? '' : 'none';
  if(yaSaqueWrap)     yaSaqueWrap.style.display      = tipo==='reposicion' ? '' : 'none';
  if(yaPagueWrap)     yaPagueWrap.style.display      = (tipo==='gasto'||tipo==='otro') ? '' : 'none';
  // fechaPago solo aplica a gastos de cajita, se controla después en _cpdSetYaPague/_cpdSetGastoOrigen
  const fechaPagoWrap = document.getElementById('cpd-fecha-pago-wrap');
  if(fechaPagoWrap) fechaPagoWrap.style.display = 'none';

  if(tipo==='gasto'){
    _cpdSetGastoOrigen(_cpdGastoOrigenVal||'cajita');
    _cpdPoblarGastoSelectores();
  }

  _cpdSetYaSaque(false);
  _cpdSetYaPague(false);

  const descInput = document.getElementById('cpd-desc');
  if(descInput && !descInput.value){
    const sugs = {
      reposicion:'Plata que ya saqué de la cajita', gasto:'Servicios públicos',
      abono_deuda:'Abono de mamá', otro:'Otro'
    };
    descInput.placeholder = sugs[tipo]||'Descripción';
  }
};

function _cpdPoblarGastoSelectores(){
  const selCaj = document.getElementById('cpd-gasto-cajita');
  if(selCaj && selCaj.options.length <= 1){
    (S.cajitas||[]).forEach(c=>{
      const o = document.createElement('option');
      o.value = 'cajita:'+c.id;
      o.textContent = c.nombre||c.id;
      selCaj.appendChild(o);
    });
    (S.cuentas||[]).forEach(c=>{
      const o = document.createElement('option');
      o.value = 'cuenta:'+c.id;
      o.textContent = c.nombre||c.id;
      selCaj.appendChild(o);
    });
  }
  const selTc = document.getElementById('cpd-gasto-tc');
  if(selTc && selTc.options.length <= 1){
    (S.tarjetasCredito||[]).filter(t=>(t.estado||'activa')==='activa').forEach(t=>{
      const o = document.createElement('option');
      o.value = t.id;
      o.textContent = t.nombre||t.id;
      selTc.appendChild(o);
    });
  }
  // Selector de cajita destino para gastos con TC (siempre repoblar)
  const selTcCaj = document.getElementById('cpd-gasto-tc-cajita');
  if(selTcCaj){
    selTcCaj.innerHTML = '<option value="">Sin especificar</option>';
    (S.cajitas||[]).forEach(c=>{
      const o = document.createElement('option');
      o.value = 'cajita:'+c.id;
      o.textContent = c.nombre||c.id;
      selTcCaj.appendChild(o);
    });
    (S.cuentas||[]).forEach(c=>{
      const o = document.createElement('option');
      o.value = 'cuenta:'+c.id;
      o.textContent = c.nombre||c.id;
      selTcCaj.appendChild(o);
    });
  }
}

function _cpdSetGastoOrigen(val){
  _cpdGastoOrigenVal = val;
  const cajBtn  = document.getElementById('cpd-origen-cajita-btn');
  const tcBtn   = document.getElementById('cpd-origen-tc-btn');
  const cajWrap = document.getElementById('cpd-gasto-cajita-wrap');
  const tcWrap  = document.getElementById('cpd-gasto-tc-wrap');
  if(!cajBtn) return;
  if(val==='cajita'){
    cajBtn.style.cssText += ';background:rgba(176,144,240,.15);border-color:var(--purple);color:var(--purple);';
    tcBtn.style.cssText  += ';background:transparent;border-color:var(--border2);color:var(--text2);';
    if(cajWrap) cajWrap.style.display = '';
    if(tcWrap)  tcWrap.style.display  = 'none';
    _cpdPoblarGastoSelectores();
    // Mostrar fecha pago solo si es cajita y no está ya pagado
    const fechaPagoWrapG = document.getElementById('cpd-fecha-pago-wrap');
    if(fechaPagoWrapG) fechaPagoWrapG.style.display = _cpdYaPagueVal ? 'none' : '';
  } else {
    tcBtn.style.cssText  += ';background:rgba(240,104,104,.12);border-color:rgba(240,104,104,.5);color:var(--red);';
    cajBtn.style.cssText += ';background:transparent;border-color:var(--border2);color:var(--text2);';
    if(tcWrap)  tcWrap.style.display  = '';
    if(cajWrap) cajWrap.style.display = 'none';
    _cpdPoblarGastoSelectores();
    // Ocultar fecha pago para TC
    const fechaPagoWrapG = document.getElementById('cpd-fecha-pago-wrap');
    if(fechaPagoWrapG) fechaPagoWrapG.style.display = 'none';
  }
};

function _cpdSetYaSaque(val){
  _cpdYaSaqueVal = val;
  const si = document.getElementById('cpd-ya-saque-si');
  const no = document.getElementById('cpd-ya-saque-no');
  if(!si || !no) return;
  if(val){
    si.style.background = 'rgba(176,144,240,.2)';
    si.style.borderColor = 'var(--purple)';
    si.style.color = 'var(--purple)';
    no.style.background = 'transparent';
    no.style.borderColor = 'var(--border2)';
    no.style.color = 'var(--text2)';
  } else {
    no.style.background = 'rgba(200,240,96,.08)';
    no.style.borderColor = 'rgba(200,240,96,.4)';
    no.style.color = 'var(--accent)';
    si.style.background = 'transparent';
    si.style.borderColor = 'var(--border2)';
    si.style.color = 'var(--text2)';
  }
};

function _cpdSetYaPague(val){
  _cpdYaPagueVal = val;
  const si = document.getElementById('cpd-ya-pague-si');
  const no = document.getElementById('cpd-ya-pague-no');
  if(!si || !no) return;
  if(val){
    si.style.background = 'rgba(200,240,96,.15)';
    si.style.borderColor = 'var(--accent)';
    si.style.color = 'var(--accent)';
    no.style.background = 'transparent';
    no.style.borderColor = 'var(--border2)';
    no.style.color = 'var(--text2)';
  } else {
    no.style.background = 'rgba(240,184,64,.08)';
    no.style.borderColor = 'rgba(240,184,64,.4)';
    no.style.color = 'var(--amber)';
    si.style.background = 'transparent';
    si.style.borderColor = 'var(--border2)';
    si.style.color = 'var(--text2)';
  }
  // Controlar visibilidad de fecha de pago: solo cuando no está pagado y es cajita
  const fpWrap = document.getElementById('cpd-fecha-pago-wrap');
  if(fpWrap){
    const esGastoCajita = document.getElementById('cpd-tipo') && document.getElementById('cpd-tipo').value === 'gasto'
      && _cpdGastoOrigenVal === 'cajita';
    fpWrap.style.display = (esGastoCajita && !val) ? '' : 'none';
  }
};


function _cpdConfirmar(){
  const tipo  = document.getElementById('cpd-tipo').value;
  const desc  = (document.getElementById('cpd-desc').value||'').trim();
  if(!desc){ toast('Describí para qué es','err'); return; }

  const montoStr = document.getElementById('cpd-monto').value||'';
  const monto = typeof parseMoney === 'function' ? parseMoney(montoStr) : parseFloat(montoStr.replace(/\./g,'').replace(',','.'));
  if(!monto || monto <= 0){ toast('Ingresá el monto','err'); return; }

  const personaId = document.getElementById('cpd-persona') ? document.getElementById('cpd-persona').value : '';
  const cuentaId  = document.getElementById('cpd-cuenta')  ? document.getElementById('cpd-cuenta').value  : '';

  // Para tipo gasto: leer origen (cajita o TC)
  let gastoOrigen = '';   // 'cajita' | 'tc'
  let gastoCajita = '';   // id de cajita/cuenta si origen=cajita
  let gastoTcId   = '';   // id de TC si origen=tc
  let gastoTcCajita = ''; // cajita donde va la plata al llegar el ingreso (si origen=tc)
  if(tipo === 'gasto'){
    gastoOrigen = _cpdGastoOrigenVal || 'cajita';
    if(gastoOrigen === 'cajita'){
      gastoCajita = document.getElementById('cpd-gasto-cajita') ? document.getElementById('cpd-gasto-cajita').value : '';
    } else {
      gastoTcId = document.getElementById('cpd-gasto-tc') ? document.getElementById('cpd-gasto-tc').value : '';
      if(!gastoTcId){ toast('Elegí una tarjeta de crédito','err'); return; }
      gastoTcCajita = document.getElementById('cpd-gasto-tc-cajita') ? document.getElementById('cpd-gasto-tc-cajita').value : '';
    }
  }

  const yaSaque = tipo === 'reposicion' ? (_cpdYaSaqueVal === true) : false;
  const yaPague = (tipo === 'gasto' || tipo === 'otro') ? (_cpdYaPagueVal === true) : false;

  // Si ya adelantó plata de una cajita (reposicion)
  if(yaSaque && cuentaId && typeof sumarFuente === 'function'){
    try {
      if(cuentaId.startsWith('cajita:')){
        const cajId = cuentaId.split(':')[1];
        const caj = (S.cajitas||[]).find(x=>x.id===cajId);
        if(caj && typeof materializarIntereses === 'function') materializarIntereses(caj);
      }
      sumarFuente(cuentaId, -monto);
      if(!S.movimientos) S.movimientos = [];
      S.movimientos.push({ id:uid(), tipo:'salida', fuente:cuentaId, monto, fecha:hoy(), desc:'Adelanto comprometido: '+desc });
      if(window.logCambio) logCambio('Adelantaste plata de '+_cpFuenteLabel(cuentaId), fmt(monto)+' — será repuesto al llegar el ingreso', monto, 'gasto');
      if(typeof refresh === 'function') refresh();
    } catch(e){ toast('No se pudo descontar el saldo: '+e.message,'err'); }
  }

  // Leer fecha de pago (solo para gastos de cajita no pagados)
  let fechaPago = '';
  if(tipo === 'gasto' && gastoOrigen === 'cajita' && !yaPague){
    const fpEl = document.getElementById('cpd-fecha-pago');
    fechaPago = fpEl ? (fpEl.value || '') : '';
  }

  _cpDestinosTmp.push({ id:uid(), tipo, desc, monto, personaId, cuentaId, yaSaque, yaPague, gastoOrigen, gastoCajita, gastoTcId, gastoTcCajita, fechaPago });
  closeSheet('cp-destino');
  _cpRenderDestinosTmp();
};

function _cpRenderDestinosTmp(){
  const el = document.getElementById('cp-destinos-list');
  const balEl = document.getElementById('cp-balance-preview');
  if(!el) return;

  const _tipoIcon = {
    reposicion:  `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.7"/></svg>`,
    gasto:       `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>`,
    abono_deuda: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M11 7H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-5"/><path d="M10 14L20 4"/><path d="M15 4h5v5"/></svg>`,
    otro:        `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/></svg>`,
  };

  if(!_cpDestinosTmp.length){
    el.innerHTML = `<div style="display:flex;align-items:center;gap:8px;padding:12px;background:var(--bg3);border-radius:var(--radius-sm);border:1px dashed var(--border2);">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      <div style="font-size:11px;color:var(--text3);font-family:'DM Mono',monospace;">Sin destinos — todo queda libre para vos.</div>
    </div>`;
  } else {
    el.innerHTML = _cpDestinosTmp.map((d,i)=>{
      const ti = _CP_TIPO_LABELS[d.tipo]||_CP_TIPO_LABELS.otro;
      const icon = _tipoIcon[d.tipo]||_tipoIcon.otro;
      let badges = '';
      if(d.tipo === 'reposicion'){
        badges = d.yaSaque
          ? `<span style="display:inline-flex;align-items:center;gap:3px;font-size:9px;padding:2px 7px;border-radius:10px;background:rgba(176,144,240,.18);border:1px solid rgba(176,144,240,.4);color:var(--purple);font-family:'DM Mono',monospace;"><i class="fa-solid fa-check" style="font-size:8px;"></i>Ya saqué</span>`
          : `<span style="display:inline-flex;align-items:center;gap:3px;font-size:9px;padding:2px 7px;border-radius:10px;background:rgba(200,240,96,.08);border:1px solid rgba(200,240,96,.3);color:var(--accent);font-family:'DM Mono',monospace;"><i class="fa-regular fa-clock" style="font-size:8px;"></i>Pendiente</span>`;
        if(d.cuentaId){
          const label = typeof _cpFuenteLabel==='function' ? _cpFuenteLabel(d.cuentaId) : d.cuentaId;
          badges += html` <span style="font-size:9px;padding:2px 7px;border-radius:10px;background:rgba(176,144,240,.1);color:var(--purple);font-family:'DM Mono',monospace;">${label}</span>`;
        }
      } else if(d.tipo === 'gasto'){
        const origenBadge = d.gastoOrigen === 'tc'
          ? `<span style="display:inline-flex;align-items:center;gap:3px;font-size:9px;padding:2px 7px;border-radius:10px;background:rgba(240,104,104,.12);border:1px solid rgba(240,104,104,.3);color:var(--red);font-family:'DM Mono',monospace;"><i class="fa-solid fa-credit-card" style="font-size:8px;"></i>TC</span>`
          : `<span style="display:inline-flex;align-items:center;gap:3px;font-size:9px;padding:2px 7px;border-radius:10px;background:rgba(176,144,240,.12);border:1px solid rgba(176,144,240,.3);color:var(--purple);font-family:'DM Mono',monospace;"><i class="fa-solid fa-box" style="font-size:8px;"></i>Cajita</span>`;
        const pagoBadge = d.yaPague
          ? `<span style="font-size:9px;padding:2px 7px;border-radius:10px;background:rgba(200,240,96,.15);border:1px solid rgba(200,240,96,.4);color:var(--accent);font-family:'DM Mono',monospace;"><i class="fa-solid fa-check"></i> Pagado</span>`
          : `<span style="font-size:9px;padding:2px 7px;border-radius:10px;background:rgba(240,184,64,.1);border:1px solid rgba(240,184,64,.35);color:var(--amber);font-family:'DM Mono',monospace;"><i class="fa-regular fa-clock"></i> Pendiente</span>`;
        badges = origenBadge + ' ' + pagoBadge;
      } else if(d.tipo === 'abono_deuda' && d.personaId){
        const deu = (window.S && S.deudores) ? (S.deudores||[]).find(x=>x.id===d.personaId) : null;
        if(deu) badges = html`<span style="font-size:9px;padding:2px 7px;border-radius:10px;background:rgba(200,240,96,.08);border:1px solid rgba(200,240,96,.25);color:var(--accent);font-family:'DM Mono',monospace;"><i class="fa-solid fa-user" style="font-size:8px;margin-right:2px;"></i>${deu.nombre}</span>`;
      } else {
        badges = d.yaPague
          ? `<span style="font-size:9px;padding:2px 7px;border-radius:10px;background:rgba(200,240,96,.15);color:var(--accent);font-family:'DM Mono',monospace;"><i class="fa-solid fa-check"></i> Pagado</span>`
          : `<span style="font-size:9px;padding:2px 7px;border-radius:10px;background:rgba(240,184,64,.1);color:var(--amber);font-family:'DM Mono',monospace;"><i class="fa-regular fa-clock"></i> Pendiente</span>`;
      }
      return html`<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:${ti.bg};border:1px solid ${ti.border};border-radius:var(--radius-sm);margin-bottom:7px;">
        <div style="width:28px;height:28px;border-radius:8px;background:${ti.bg};border:1px solid ${ti.border};display:flex;align-items:center;justify-content:center;flex-shrink:0;color:${ti.color};">${raw(icon)}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;font-weight:600;color:${ti.color};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${d.desc}</div>
          <div style="display:flex;align-items:center;gap:5px;margin-top:4px;flex-wrap:wrap;">${raw(badges)}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="font-size:14px;font-weight:700;font-family:'DM Mono',monospace;color:${ti.color};">${fmt(d.monto)}</div>
          <button type="button" ${raw(Events.attr('cp:quitarDestino', i))} style="background:none;border:none;cursor:pointer;color:var(--text3);padding:2px;line-height:1;margin-top:2px;" title="Quitar">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>`;
    }).join('');
  }

  // Preview balance
  if(balEl){
    const montoStr = document.getElementById('cp-monto-total') ? document.getElementById('cp-monto-total').value : '';
    const total = typeof parseMoney === 'function' ? parseMoney(montoStr)||0 : 0;
    const comp = _cpDestinosTmp.reduce((a,d)=>a+(d.monto||0),0);
    const ganancia = total - comp;
    if(total > 0){
      if(ganancia < 0){
        balEl.style.cssText = 'color:var(--red);font-size:11px;font-family:"DM Mono",monospace;padding:8px 10px;background:rgba(240,104,104,.07);border:1px solid rgba(240,104,104,.2);border-radius:var(--radius-sm);';
        balEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="margin-right:5px;"></i>Los destinos superan el total por ${fmt(Math.abs(ganancia))}`;
      } else if(ganancia > 0.99){
        balEl.style.cssText = 'font-size:11px;font-family:"DM Mono",monospace;padding:8px 10px;background:rgba(200,240,96,.07);border:1px solid rgba(200,240,96,.2);border-radius:var(--radius-sm);display:flex;justify-content:space-between;align-items:center;';
        balEl.innerHTML = `<span style="color:var(--text3);">Comprometido: ${fmt(comp)}</span><b style="color:var(--accent);">Libre: ${fmt(ganancia)} <i class="fa-solid fa-check" style="font-size:10px;"></i></b>`;
      } else if(comp > 0){
        balEl.style.cssText = 'font-size:11px;font-family:"DM Mono",monospace;padding:8px 10px;background:rgba(200,240,96,.05);border:1px solid rgba(200,240,96,.15);border-radius:var(--radius-sm);color:var(--text3);text-align:center;';
        balEl.innerHTML = `<i class="fa-solid fa-circle-check" style="color:var(--accent);margin-right:5px;"></i>Todo asignado — ${fmt(comp)} comprometido`;
      } else {
        balEl.style.cssText = 'font-size:11px;font-family:"DM Mono",monospace;padding:8px 10px;background:rgba(200,240,96,.05);border:1px solid rgba(200,240,96,.15);border-radius:var(--radius-sm);color:var(--accent);';
        balEl.innerHTML = `<i class="fa-solid fa-infinity" style="margin-right:5px;"></i>Libre: ${fmt(total)} (nada comprometido)`;
      }
    } else {
      balEl.style.cssText = '';
      balEl.textContent = '';
    }
  }
}

function _cpQuitarDestino(i){
  _cpDestinosTmp.splice(i,1);
  _cpRenderDestinosTmp();
};

/* ── RECIBIR ─────────────────────────────────────────────────────── */
function _cpAbrirRecibir(id){
  const item = _cpData().find(i=>i.id===id);
  if(!item) return;
  _cpRecibirId = id;

  document.getElementById('cp-recibir-desc').textContent = item.desc||'';
  document.getElementById('cp-recibir-monto').textContent = fmt(item.montoTotal);
  document.getElementById('cp-recibir-fecha').value = hoy();

  const comp = (item.destinos||[]).reduce((a,d)=>a+(d.monto||0),0);
  const sobrante = Math.max(0,(item.montoTotal||0)-comp);

  // Render plan
  const planEl = document.getElementById('cp-recibir-plan');
  if(planEl){
    if(!(item.destinos||[]).length){
      planEl.innerHTML = `<div style="font-size:12px;color:var(--text3);padding:4px 0 10px;">Sin compromisos — todo el monto queda libre.</div>`;
    } else {
      planEl.innerHTML = (item.destinos||[]).map(d=>{
        const ti = _CP_TIPO_LABELS[d.tipo]||_CP_TIPO_LABELS.otro;
        let detalle = '';
        let subLabel = ti.label;
        let extraInfo = '';

        if(d.tipo==='abono_deuda'||d.tipo==='prestamo'){
          const deu = (S.deudores||[]).find(x=>x.id===d.personaId);
          if(deu) detalle = html` · ${deu.nombre}`;
        }
        if(d.tipo==='tc'){
          const tc = (S.tarjetasCredito||[]).find(x=>x.id===d.tcId);
          if(tc) detalle = html` · ${tc.nombre}`;
        }

        // Reposición: mostrar qué cajita/cuenta recibe la plata
        if(d.tipo==='reposicion'){
          const cuentaId = d.cuentaId || item.cuentaDestino;
          if(cuentaId){
            const label = typeof _cpFuenteLabel==='function' ? _cpFuenteLabel(cuentaId) : cuentaId;
            subLabel = 'Repone cajita/cuenta';
            extraInfo = html`<div style="display:flex;align-items:center;gap:5px;margin-top:5px;padding:5px 8px;background:rgba(176,144,240,.12);border-radius:6px;">
              <i class="fa-solid fa-box" style="font-size:9px;color:var(--purple);"></i>
              <span style="font-size:10px;font-weight:600;color:var(--purple);font-family:'DM Mono',monospace;">${label} recibe ${fmt(d.monto)}</span>
            </div>`;
          }
        }

        // Gasto: mostrar estado real (pagado con TC / pendiente en cajita)
        if(d.tipo==='gasto'){
          if(d.gastoOrigen==='tc' && d.gastoTcId){
            const tc = (S.tarjetasCredito||[]).find(x=>x.id===d.gastoTcId);
            const tcNombre = tc ? tc.nombre : 'Tarjeta de crédito';
            const cajDestLabel = d.gastoTcCajita && typeof _cpFuenteLabel==='function' ? _cpFuenteLabel(d.gastoTcCajita) : null;
            if(d.yaPague){
              subLabel = html`Pagado con ${tcNombre}`;
              extraInfo = html`<div style="display:flex;align-items:center;gap:5px;margin-top:5px;padding:5px 8px;background:rgba(200,240,96,.1);border-radius:6px;">
                <i class="fa-solid fa-check" style="font-size:9px;color:var(--accent);"></i>
                <span style="font-size:10px;font-weight:600;color:var(--accent);font-family:'DM Mono',monospace;">Ya pagado${cajDestLabel ? html` · La plata va a "${cajDestLabel}"` : ''}</span>
              </div>`;
            } else {
              subLabel = html`Pendiente · Se cargará a ${tcNombre}`;
              extraInfo = html`<div style="display:flex;align-items:center;gap:5px;margin-top:5px;padding:5px 8px;background:rgba(240,104,104,.1);border-radius:6px;">
                <i class="fa-solid fa-credit-card" style="font-size:9px;color:var(--red);"></i>
                <span style="font-size:10px;font-weight:600;color:var(--red);font-family:'DM Mono',monospace;">Se cargará a ${tcNombre}${cajDestLabel ? html` · plata → "${cajDestLabel}"` : ''}</span>
              </div>`;
            }
          } else if(d.gastoOrigen==='cajita' && d.gastoCajita){
            const cajLabel = typeof _cpFuenteLabel==='function' ? _cpFuenteLabel(d.gastoCajita) : d.gastoCajita;
            if(d.yaPague){
              subLabel = 'Ya pagado';
              extraInfo = html`<div style="display:flex;align-items:center;gap:5px;margin-top:5px;padding:5px 8px;background:rgba(200,240,96,.1);border-radius:6px;">
                <i class="fa-solid fa-check" style="font-size:9px;color:var(--accent);"></i>
                <span style="font-size:10px;font-weight:600;color:var(--accent);font-family:'DM Mono',monospace;">Repone "${cajLabel}"</span>
              </div>`;
            } else {
              subLabel = 'Gasto pendiente';
              extraInfo = html`<div style="display:flex;align-items:center;gap:5px;margin-top:5px;padding:5px 8px;background:rgba(240,184,64,.08);border-radius:6px;">
                <i class="fa-regular fa-clock" style="font-size:9px;color:var(--amber);"></i>
                <span style="font-size:10px;font-weight:600;color:var(--amber);font-family:'DM Mono',monospace;">Guardada en "${cajLabel}" hasta vencimiento</span>
              </div>`;
            }
          } else {
            subLabel = d.yaPague ? 'Ya pagado' : 'Gasto pendiente';
          }
        }

        return html`<div style="padding:10px 12px;background:${ti.bg};border:1px solid ${ti.border};border-radius:var(--radius-sm);margin-bottom:6px;">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
            <div style="flex:1;min-width:0;">
              <div style="font-size:12px;font-weight:600;color:${ti.color};display:flex;align-items:center;gap:5px;">${d.desc}${detalle}${raw(d.tipo==='abono_deuda'?'<span style="font-size:8px;padding:1px 5px;border-radius:6px;background:rgba(200,240,96,.15);color:var(--accent);font-family:\'DM Mono\',monospace;">te devuelven</span>':'')}</div>
              <div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;margin-top:2px;">${subLabel}</div>
              ${extraInfo}
              ${raw((d.tipo==='gasto' && d.gastoOrigen==='tc') ? `<div style="display:inline-flex;align-items:center;gap:4px;margin-top:5px;font-size:9px;padding:3px 7px;background:rgba(96,176,240,.1);border:1px solid rgba(96,176,240,.2);border-radius:6px;color:var(--blue);font-family:'DM Mono',monospace;"><i class="fa-solid fa-handshake" style="font-size:8px;"></i>La app sabe que es un favor</div>` : '')}
            </div>
            <div style="font-size:15px;font-weight:700;font-family:'DM Mono',monospace;color:${ti.color};flex-shrink:0;">${fmt(d.monto)}</div>
          </div>
        </div>`;
      }).join('');
    }
  }

  // Sobrante
  const sobWrap = document.getElementById('cp-recibir-sobrante-wrap');
  const sobEl   = document.getElementById('cp-recibir-sobrante');
  const sobCuenta = document.getElementById('cp-recibir-sobrante-cuenta');
  if(sobWrap && sobEl){
    if(sobrante > 0 || !(item.destinos||[]).length){
      sobWrap.style.display = '';
      sobEl.textContent = fmt(sobrante > 0 ? sobrante : item.montoTotal||0);
      // Poblar selector de destino del sobrante
      if(sobCuenta){
        _cpPoblarCuentas('cp-recibir-sobrante-cuenta', false);
        sobCuenta.value = item.cuentaDestino || '';
      }
    } else {
      sobWrap.style.display = 'none';
    }
  }

  // Recordatorios de gastos pendientes (no pagados, sin TC)
  const recWrap = document.getElementById('cp-recibir-recordatorios');
  if(recWrap){
    const pendientesConFecha = (item.destinos||[]).filter(d =>
      d.tipo === 'gasto' && !d.yaPague && d.gastoOrigen !== 'tc' && d.gastoCajita
    );
    if(pendientesConFecha.length){
      recWrap.style.display = '';
      recWrap.innerHTML = html`
        <div style="margin-top:10px;padding:10px 12px;background:rgba(240,184,64,.07);border:1px solid rgba(240,184,64,.22);border-radius:var(--radius-sm);">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:7px;">
            <i class="fa-solid fa-bell" style="color:var(--amber);font-size:11px;"></i>
            <span style="font-size:10px;font-weight:700;color:var(--amber);text-transform:uppercase;letter-spacing:.8px;font-family:'DM Mono',monospace;">Recordatorio de pagos pendientes</span>
          </div>
          ${raw(pendientesConFecha.map(d=>{
            const cajLabel = typeof _cpFuenteLabel==='function' ? _cpFuenteLabel(d.gastoCajita) : d.gastoCajita;
            return html`<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(240,184,64,.12);">
              <div>
                <div style="font-size:11px;font-weight:600;">${d.desc}</div>
                <div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;">La plata queda en "${cajLabel}"</div>
              </div>
              <span style="font-size:11px;font-weight:600;font-family:'DM Mono',monospace;color:var(--amber);">${fmt(d.monto)}</span>
            </div>`;
          }).join(''))}
          <div style="font-size:10px;color:var(--text3);margin-top:7px;line-height:1.4;"><i class="fa-solid fa-circle-info" style="margin-right:4px;color:var(--text3);"></i>Cuando llegue la fecha de pago, usá la plata de esas cajitas.</div>
        </div>`;
    } else {
      recWrap.style.display = 'none';
      recWrap.innerHTML = '';
    }
  }

  openSheet('cp-recibir');
};

function _cpConfirmarRecibir(){
  const id = _cpRecibirId;
  const items = _cpData();
  const item = items.find(i=>i.id===id);
  if(!item){ closeSheet('cp-recibir'); return; }

  const fecha = document.getElementById('cp-recibir-fecha').value || hoy();

  // Ejecutar cada destino
  let errores = [];
  (item.destinos||[]).forEach(d => {
    try {
      if(d.tipo === 'reposicion'){
        // Repone la cajita/cuenta — SOLO si no la había adelantado antes (evitar doble conteo)
        if(!d.yaSaque){
          const cuenta = d.cuentaId || item.cuentaDestino;
          if(cuenta && typeof sumarFuente === 'function'){
            if(cuenta.startsWith('cajita:')){
              const cajId = cuenta.split(':')[1];
              const caj = (S.cajitas||[]).find(x=>x.id===cajId);
              if(caj && typeof materializarIntereses === 'function') materializarIntereses(caj);
            }
            sumarFuente(cuenta, d.monto);
            if(!S.movimientos) S.movimientos = [];
            // _esReposicionCP:true → excluido del análisis de tendencia (no es ingreso nuevo, es devolución)
            S.movimientos.push({id:uid(), tipo:'entrada', fuente:cuenta, monto:d.monto, fecha, desc:'Reposición: '+item.desc, _esReposicionCP:true});
            if(window.logCambio) logCambio('Reposición en '+_cpFuenteLabel(cuenta), fmt(d.monto)+' de "'+item.desc+'"', d.monto, 'ingreso');
          }
        } else {
          // Ya fue adelantada: la plata ya estaba descontada, ahora entra el arriendo y repone
          const cuenta = d.cuentaId || item.cuentaDestino;
          if(cuenta && typeof sumarFuente === 'function'){
            if(cuenta.startsWith('cajita:')){
              const cajId = cuenta.split(':')[1];
              const caj = (S.cajitas||[]).find(x=>x.id===cajId);
              if(caj && typeof materializarIntereses === 'function') materializarIntereses(caj);
            }
            sumarFuente(cuenta, d.monto);
            if(!S.movimientos) S.movimientos = [];
            // _esReposicionCP:true → excluido del análisis de tendencia (devolución de plata que ya salió)
            S.movimientos.push({id:uid(), tipo:'entrada', fuente:cuenta, monto:d.monto, fecha, desc:'Reposición (adelantada): '+item.desc, _esReposicionCP:true});
            if(window.logCambio) logCambio('Reposición (ya adelantada) en '+_cpFuenteLabel(cuenta), fmt(d.monto)+' repuesto', d.monto, 'ingreso');
          }
        }
      }
      else if(d.tipo === 'abono_deuda' && d.personaId){
        const deu = (S.deudores||[]).find(x=>x.id===d.personaId);
        if(deu){
          if(!deu.movimientos) deu.movimientos = [];
          deu.movimientos.push({id:uid(), tipo:'abono', monto:d.monto, fecha, nota:'Abono desde: '+item.desc, ts:Date.now()});
          if(window.logCambio) logCambio('Registraste abono de '+deu.nombre, fmt(d.monto)+' de plata comprometida', d.monto, 'abono');
        }
      }
      else if(d.tipo === 'gasto'){
        if(d.gastoOrigen === 'tc' && d.gastoTcId){
          // Gasto pagado con TC: sumar deuda a la TC y llevar la plata a la cajita elegida
          // Nota: esta deuda es un FAVOR — la plata del ingreso cubre la TC, NO es deuda propia
          const tc = (S.tarjetasCredito||[]).find(x=>x.id===d.gastoTcId);
          if(tc){
            // FIX double-entry: si el usuario ya marcó yaPague=true via _cpGuardarMarcados,
            // la deuda ya fue subida allí. No volver a subirla al confirmar el recibo.
            if(!d.yaPague){
              const _compraTc=tcCrearCompra(tc,{
                desc:d.desc, monto:d.monto, fecha,
                cat:'Plata comprometida', nota:'Favor — cubierto por ingreso: '+item.desc,
                _desdeCP:true, _esFavor:true
              });
              d._tcCompraId=_compraTc.id;
              if(window.logCambio) logCambio('Gasto con TC "'+tc.nombre+'" registrado (favor)', fmt(d.monto)+' sumado a la deuda — cubierto por "'+item.desc+'"', d.monto, 'gasto');
            }
            // Llevar la plata a la cajita que el usuario eligió (gastoTcCajita)
            const destCajita = d.gastoTcCajita;
            if(destCajita && typeof sumarFuente === 'function'){
              if(destCajita.startsWith('cajita:')){
                const cajId = destCajita.split(':')[1];
                const caj = (S.cajitas||[]).find(x=>x.id===cajId);
                if(caj && typeof materializarIntereses === 'function') materializarIntereses(caj);
              }
              sumarFuente(destCajita, d.monto);
              if(!S.movimientos) S.movimientos = [];
              // _esReposicionCP:true → excluido del análisis de tendencia (es plata del ingreso comprometido, no tuya)
              S.movimientos.push({id:uid(), tipo:'entrada', fuente:destCajita, monto:d.monto, fecha, desc:'Para pagar TC ('+d.desc+'): '+item.desc, _esReposicionCP:true});
              if(window.logCambio) logCambio('Plata para pagar TC → '+_cpFuenteLabel(destCajita), fmt(d.monto)+' por "'+d.desc+'"', d.monto, 'ingreso');
            }
          }
        } else if(d.gastoOrigen === 'cajita' && d.gastoCajita){
          // Gasto de cajita: reponer esa cajita con el ingreso
          if(typeof sumarFuente === 'function'){
            if(d.gastoCajita.startsWith('cajita:')){
              const cajId = d.gastoCajita.split(':')[1];
              const caj = (S.cajitas||[]).find(x=>x.id===cajId);
              if(caj && typeof materializarIntereses === 'function') materializarIntereses(caj);
            }
            sumarFuente(d.gastoCajita, d.monto);
            if(!S.movimientos) S.movimientos = [];
            // _esReposicionCP:true → excluido del análisis de tendencia (repone cajita, no es ingreso nuevo)
            S.movimientos.push({id:uid(), tipo:'entrada', fuente:d.gastoCajita, monto:d.monto, fecha, desc:'Reposición gasto: '+d.desc, _esReposicionCP:true});
            if(window.logCambio) logCambio('Repuesto gasto en '+_cpFuenteLabel(d.gastoCajita), fmt(d.monto)+' por "'+d.desc+'"', d.monto, 'ingreso');
          }
        }
        // si no tiene origen definido: solo registro, sin efecto
      }
      // otro: solo registro, sin efecto en saldos
    } catch(e){
      errores.push(d.desc);
    }
  });

  // ── SOBRANTE: lo que sobre después de todos los destinos
  // Este dinero SÍ es tuyo — entra como ingreso a la cuenta destino
  const totalAsignado = (item.destinos||[]).reduce((a,d)=>a+(d.monto||0),0);
  const ganancia = Math.max(0,(item.montoTotal||0)-totalAsignado);
  const sobranteCuentaEl = document.getElementById('cp-recibir-sobrante-cuenta');
  const sobranteCuenta = (sobranteCuentaEl && sobranteCuentaEl.value) ? sobranteCuentaEl.value : item.cuentaDestino;
  if(ganancia > 0.99 && sobranteCuenta){
    try {
      if(typeof sumarFuente === 'function'){
        if(sobranteCuenta.startsWith('cajita:')){
          const cajId = sobranteCuenta.split(':')[1];
          const caj = (S.cajitas||[]).find(x=>x.id===cajId);
          if(caj && typeof materializarIntereses === 'function') materializarIntereses(caj);
        }
        sumarFuente(sobranteCuenta, ganancia);
        if(!S.movimientos) S.movimientos = [];
        S.movimientos.push({id:uid(), tipo:'entrada', fuente:sobranteCuenta, monto:ganancia, fecha,
          desc:'Ingreso libre: '+item.desc, _esSobrante:true});
        // Si es cuenta personalizada: registrar también en sus movimientos para que cuente en análisis
        if(sobranteCuenta.startsWith('custom:')){
          const cId = sobranteCuenta.split(':')[1];
          const cObj = (S.cuentasPersonalizadas||[]).find(x=>x.id===cId);
          if(cObj){
            if(!cObj.movimientos) cObj.movimientos = [];
            cObj.movimientos.push({id:uid(), tipo:'ingreso', monto:ganancia, fecha,
              nota:'Ingreso libre de "'+item.desc+'"'});
          }
        }
        if(window.logCambio) logCambio(
          '<i class="fa-solid fa-sack-dollar" style="margin-right:4px;"></i>¡Ingreso libre de "'+item.desc+'"!',
          fmt(ganancia)+' → '+_cpFuenteLabel(sobranteCuenta),
          ganancia, 'ingreso'
        );
      }
    } catch(e){ errores.push('Sobrante'); }
  }

  // Marcar como recibido
  item.recibido = true;
  item.fechaRecibido = fecha;

  save();
  if(typeof refresh === 'function') refresh();
  closeSheet('cp-recibir');
  _cpRenderLista();
  _cpRecibirId = null;

  if(errores.length){
    toast('Recibido con errores menores en: '+escHtml(errores.join(', ')),'err');
  } else {
    const gananciaMsg = ganancia > 0.99
      ? ` · <b>+${fmt(ganancia)}</b> libres`
      : (totalAsignado > 0.99 ? ' · Todo asignado' : '');
    toast('¡Plata distribuida! <i class="fa-solid fa-check" style="margin-left:3px;"></i>'+gananciaMsg,'ok');
  }

  if(typeof renderAttencion === 'function') renderAttencion();
};

/* ── MARCAR PAGOS INDIVIDUALES ───────────────────────────────────── */
function _cpMarcarPagos(id){
  const item = _cpData().find(i=>i.id===id);
  if(!item || !(item.destinos||[]).length){
    toast('Este ingreso no tiene destinos para marcar','err'); return;
  }

  // Construir un mini-modal inline rápido (usamos el alert/dialogo nativo con un approach diferente)
  // Creamos un sheet temporal o usamos un approach de confirm encadenados
  // Para no añadir un sheet extra, lo hacemos con toggles directos en la lista
  // Flip individual: recorremos los destinos y les cambiamos el estado
  let cambiado = false;
  const pendientes = item.destinos.filter(d => d.tipo !== 'reposicion' && !d.yaPague);
  const pendientesSaque = item.destinos.filter(d => d.tipo === 'reposicion' && !d.yaSaque);

  if(!pendientes.length && !pendientesSaque.length){
    toast('¡Todo ya está marcado como pagado!','ok'); return;
  }

  // Mostrar sheet dinámico de marcado
  let existingSheet = document.getElementById('sheet-cp-marcar');
  if(!existingSheet){
    const div = document.createElement('div');
    div.className = 'overlay';
    div.id = 'sheet-cp-marcar';
    div.setAttribute('data-sheet-id','cp-marcar');
    div.innerHTML = `<div class="sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-title">Marcar estado de pagos</div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:14px;">Tocá cada ítem para cambiar su estado.</div>
      <div id="cp-marcar-list"></div>
      <button type="button" class="btn btn-primary" ${Events.attr('cp:guardarMarcados')} style="background:var(--accent);color:#0a0a0a;border:none;margin-top:8px;">Guardar</button>
      <button type="button" class="btn btn-ghost" data-close-sheet="cp-marcar" ${Events.attr('cp:cerrarMarcar')}>Cancelar</button>
    </div>`;
    document.body.appendChild(div);
    // Swipe — usando la función unificada (sección 7)
    if(typeof window._makeSheetSwipeable === 'function'){
      window._makeSheetSwipeable(div);
    }
  }

  _cpMarcarId = id;
  _cpMarcarTmp = JSON.parse(JSON.stringify(item.destinos));

  const listEl = document.getElementById('cp-marcar-list');
  if(listEl) _cpRenderMarcarList();

  if(typeof openSheet === 'function') openSheet('cp-marcar');
  else { const el=document.getElementById('sheet-cp-marcar'); if(el) el.classList.add('open'); }
};

function _cpRenderMarcarList(){
  const listEl = document.getElementById('cp-marcar-list');
  if(!listEl) return;
  listEl.innerHTML = (_cpMarcarTmp||[]).map((d,i)=>{
    const ti = _CP_TIPO_LABELS[d.tipo]||_CP_TIPO_LABELS.otro;
    const esReposicion = d.tipo === 'reposicion';
    const esAbono = d.tipo === 'abono_deuda';
    if(esAbono) return ''; // los abonos son plata que te llega, no hay nada que marcar como pagado
    const esGastoTC = d.tipo === 'gasto' && d.gastoOrigen === 'tc';
    const estado = esReposicion ? d.yaSaque : d.yaPague;
    const labelOff = esReposicion ? '<i class="fa-regular fa-circle" style="margin-right:4px;"></i>No la saqué aún' : '<i class="fa-regular fa-clock" style="margin-right:3px;"></i>Pendiente de pagar';
    const labelOn  = esReposicion ? '<i class="fa-solid fa-check" style="margin-right:4px;"></i>Ya la saqué' : (esGastoTC ? '<i class="fa-solid fa-check" style="margin-right:4px;"></i>Ya lo cargué a la TC' : '<i class="fa-solid fa-check" style="margin-right:4px;"></i>Ya lo pagué');
    const colorOn  = esReposicion ? 'var(--purple)' : 'var(--accent)';
    const bgOn     = esReposicion ? 'rgba(176,144,240,.15)' : 'rgba(200,240,96,.12)';
    const borderOn = esReposicion ? 'rgba(176,144,240,.4)' : 'rgba(200,240,96,.4)';
    return html`<div style="padding:12px 0;border-bottom:1px solid var(--border);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px;">
        <div>
          <div style="font-size:13px;font-weight:600;">${d.desc}</div>
          <div style="font-size:10px;color:${ti.color};font-family:'DM Mono',monospace;">${fmt(d.monto)} · ${ti.label}</div>
        </div>
      </div>
      <div style="display:flex;gap:7px;">
        <button type="button" ${raw(Events.attr('cp:toggleMarcar', i, false))}
          style="flex:1;padding:8px 0;border-radius:var(--radius-sm);font-size:11px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .15s;
          background:${!estado?'rgba(136,136,128,.15)':'transparent'};border:1.5px solid ${!estado?'var(--border2)':'var(--border)'};color:${!estado?'var(--text2)':'var(--text3)'};">
          ${raw(labelOff)}
        </button>
        <button type="button" ${raw(Events.attr('cp:toggleMarcar', i, true))}
          style="flex:1;padding:8px 0;border-radius:var(--radius-sm);font-size:11px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .15s;
          background:${estado?bgOn:'transparent'};border:1.5px solid ${estado?borderOn:'var(--border)'};color:${estado?colorOn:'var(--text3)'};">
          ${raw(labelOn)}
        </button>
      </div>
    </div>`;
  }).join('');
}

function _cpToggleMarcar(i, val){
  if(!_cpMarcarTmp || !_cpMarcarTmp[i]) return;
  const d = _cpMarcarTmp[i];
  if(d.tipo === 'reposicion') d.yaSaque = val;
  else d.yaPague = val;
  _cpRenderMarcarList();
};

function _cpGuardarMarcados(){
  const id = _cpMarcarId;
  const item = _cpData().find(i=>i.id===id);
  if(!item){ if(typeof closeSheet==='function') closeSheet('cp-marcar'); return; }

  // Detectar si alguna reposicion pasó de false→true (acaba de marcarla como "ya saqué")
  (_cpMarcarTmp||[]).forEach((dNuevo,i)=>{
    const dViejo = item.destinos[i];
    if(dNuevo.tipo==='reposicion' && !dViejo.yaSaque && dNuevo.yaSaque){
      // Descontar el saldo ahora
      const cuentaId = dNuevo.cuentaId || item.cuentaDestino;
      if(cuentaId && typeof sumarFuente === 'function'){
        try {
          if(cuentaId.startsWith('cajita:')){
            const cajId = cuentaId.split(':')[1];
            const caj = (S.cajitas||[]).find(x=>x.id===cajId);
            if(caj && typeof materializarIntereses === 'function') materializarIntereses(caj);
          }
          sumarFuente(cuentaId, -dNuevo.monto);
          if(!S.movimientos) S.movimientos = [];
          S.movimientos.push({id:uid(),tipo:'salida',fuente:cuentaId,monto:dNuevo.monto,fecha:hoy(),desc:'Adelanto comprometido: '+dNuevo.desc});
          if(window.logCambio) logCambio('Adelantaste plata de '+_cpFuenteLabel(cuentaId), fmt(dNuevo.monto)+' — será repuesto al llegar el ingreso', dNuevo.monto, 'gasto');
        } catch(e){}
      }
    }
    // Detectar si un gasto de cajita pasó de false→true (acaba de marcar "ya lo pagué")
    // La plata ya estaba guardada en la cajita desde _cpConfirmarRecibir → ahora hay que descontarla
    if(dNuevo.tipo==='gasto' && dNuevo.gastoOrigen==='cajita' && dNuevo.gastoCajita && !dViejo.yaPague && dNuevo.yaPague){
      try {
        const cajId2 = dNuevo.gastoCajita.startsWith('cajita:') ? dNuevo.gastoCajita.split(':')[1] : null;
        const caj2 = cajId2 ? (S.cajitas||[]).find(x=>x.id===cajId2) : null;
        if(caj2 && typeof materializarIntereses==='function') materializarIntereses(caj2);
        if(typeof descontarFuente==='function') descontarFuente(dNuevo.gastoCajita, dNuevo.monto);
        else if(typeof sumarFuente==='function') sumarFuente(dNuevo.gastoCajita, -dNuevo.monto);
        if(!S.movimientos) S.movimientos = [];
        S.movimientos.push({id:uid(), tipo:'salida', fuente:dNuevo.gastoCajita, monto:dNuevo.monto,
          fecha:hoy(), desc:'Pago: '+dNuevo.desc});
        if(window.logCambio) logCambio('Pagaste '+dNuevo.desc, fmt(dNuevo.monto)+' de '+_cpFuenteLabel(dNuevo.gastoCajita), dNuevo.monto, 'gasto');
      } catch(e){ console.warn('[CP] Error descontando cajita al marcar pago:', e); }
    }
    // Detectar si un gasto de cajita pasó de true→false (desmarcó — revertir el descuento)
    if(dNuevo.tipo==='gasto' && dNuevo.gastoOrigen==='cajita' && dNuevo.gastoCajita && dViejo.yaPague && !dNuevo.yaPague){
      try {
        const cajId3 = dNuevo.gastoCajita.startsWith('cajita:') ? dNuevo.gastoCajita.split(':')[1] : null;
        const caj3 = cajId3 ? (S.cajitas||[]).find(x=>x.id===cajId3) : null;
        if(caj3 && typeof materializarIntereses==='function') materializarIntereses(caj3);
        if(typeof sumarFuente==='function') sumarFuente(dNuevo.gastoCajita, dNuevo.monto);
        if(S.movimientos) S.movimientos = S.movimientos.filter(m=>!(
          m.tipo==='salida' && m.fuente===dNuevo.gastoCajita && m.monto===dNuevo.monto &&
          (m.desc||'').startsWith('Pago: '+dNuevo.desc)
        ));
        if(window.logCambio) logCambio('Revertiste pago de '+dNuevo.desc, fmt(dNuevo.monto)+' devuelto a '+_cpFuenteLabel(dNuevo.gastoCajita), dNuevo.monto, 'ingreso');
      } catch(e){ console.warn('[CP] Error revirtiendo pago cajita:', e); }
    }
    // Detectar si un gasto con TC pasó de false→true (acaba de marcar "ya lo cargué a la TC")
    // Esto significa que el gasto ya se realizó con la tarjeta → la deuda SUBE
    // Nota: esta deuda es un FAVOR — cubierta por la plata del ingreso comprometido
    if(dNuevo.tipo==='gasto' && dNuevo.gastoOrigen==='tc' && dNuevo.gastoTcId && !dViejo.yaPague && dNuevo.yaPague){
      try {
        const tc = (S.tarjetasCredito||[]).find(x=>x.id===dNuevo.gastoTcId);
        if(tc){
          const _compraTc=tcCrearCompra(tc,{desc:dNuevo.desc, monto:dNuevo.monto, fecha:hoy(),
            cat:'Plata comprometida', nota:'Favor — cubierto por ingreso comprometido',
            _desdeCP:true, _esFavor:true});
          dNuevo._tcCompraId=_compraTc.id;
          if(window.logCambio) logCambio('Gasto cargado a '+tc.nombre+' (plata comprometida — favor)', fmt(dNuevo.monto)+' sumado a la deuda', dNuevo.monto, 'gasto');
        }
      } catch(e){}
    }
    // Detectar si un gasto con TC pasó de true→false (desmarcó — revertir la deuda)
    if(dNuevo.tipo==='gasto' && dNuevo.gastoOrigen==='tc' && dNuevo.gastoTcId && dViejo.yaPague && !dNuevo.yaPague){
      try {
        const tc = (S.tarjetasCredito||[]).find(x=>x.id===dNuevo.gastoTcId);
        if(tc){
          // Preferir el id exacto guardado al crear la compra; si no existe
          // (registros de antes de este cambio) caer de vuelta a desc+monto.
          const _compraVieja=tcBuscarCompraPorIdOMatch(tc, dViejo._tcCompraId, dNuevo.desc, dNuevo.monto);
          if(_compraVieja) tcEliminarCompraInterna(tc, _compraVieja.id);
          delete dNuevo._tcCompraId;
          if(window.logCambio) logCambio('Revertiste cargo a '+tc.nombre+' (plata comprometida)', fmt(dNuevo.monto)+' quitado de la deuda', dNuevo.monto, 'ingreso');
        }
      } catch(e){}
    }
  });

  item.destinos = JSON.parse(JSON.stringify(_cpMarcarTmp));
  save();
  if(typeof refresh === 'function') refresh();
  if(typeof closeSheet==='function') closeSheet('cp-marcar');
  _cpRenderLista();
  toast('Estados actualizados <i class="fa-solid fa-check"></i>','ok');
};


async function _cpEliminar(id){
  const item = _cpData().find(i=>i.id===id);
  if(!item) return;

  // ── Calcular efectos secundarios que se revertirán ───────────────
  const hayAdelantos = (item.destinos||[]).some(d=>d.tipo==='reposicion' && d.yaSaque);
  const hayTcMarcada = (item.destinos||[]).some(d=>d.tipo==='gasto' && d.gastoOrigen==='tc' && d.yaPague);
  const yaRecibido   = !!item.recibido;

  // Construir mensaje de advertencia con el detalle de lo que se revertirá
  let advertencia = '¿Eliminar «' + item.desc + '»?';
  if(yaRecibido){
    advertencia += '\n\n<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Este ingreso ya fue marcado como recibido. Al eliminarlo se revertirán todos los movimientos generados (reposiciones en cuentas, entradas en cajitas) y las compras de TC asociadas.';
  } else {
    if(hayAdelantos){
      advertencia += '\n\n<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Hay plata adelantada de tus cuentas. Al eliminar se revertirán esos descuentos y quedarán como si nunca se hubieron hecho.';
    }
    if(hayTcMarcada){
      advertencia += '\n\n<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Hay gastos marcados como cargados a TC. Al eliminar se revertirá la deuda sumada a la tarjeta.';
    }
    if(!hayAdelantos && !hayTcMarcada){
      advertencia += '\n\nEste ingreso no ha generado movimientos — se puede eliminar sin efectos secundarios.';
    }
  }
  advertencia += '\n\nEsta acción no se puede deshacer.';

  // Protección por antigüedad — ver docs/proteccion-antiguedad-movimientos.md.
  // Solo aplica si hay algo real que revertir (yaRecibido / hayAdelantos /
  // hayTcMarcada); si el ingreso "no ha generado movimientos" (rama de
  // arriba), no hay ningún saldo que proteger.
  // Limitación conocida: acá no hay una fecha exacta por cada adelanto/marca
  // individual (solo un booleano yaSaque/yaPague, sin su propia fecha) — se
  // usa item.fechaRecibido si ya se recibió (que es cuando de verdad se
  // generaron los movimientos reales), o item.fechaLlegada como mejor
  // aproximación disponible si aún no se ha recibido pero ya hay adelantos/
  // marcas de TC. Si en el futuro se guarda una fecha propia por destino,
  // hay que actualizar esto para usarla en vez de esta aproximación.
  if(yaRecibido || hayAdelantos || hayTcMarcada){
    const fechaRef = yaRecibido ? item.fechaRecibido : item.fechaLlegada;
    const cuentasAfectadas = new Set();
    (item.destinos||[]).forEach(d=>{
      if(yaRecibido){
        if(d.tipo==='reposicion'){
          const cuenta=d.cuentaId||item.cuentaDestino;
          if(cuenta)cuentasAfectadas.add(cuenta);
        } else if(d.tipo==='gasto'&&d.gastoOrigen==='tc'&&d.gastoTcId){
          cuentasAfectadas.add('tc:'+d.gastoTcId);
          if(d.gastoTcCajita)cuentasAfectadas.add(d.gastoTcCajita);
        } else if(d.tipo==='gasto'&&d.gastoOrigen==='cajita'&&d.gastoCajita){
          cuentasAfectadas.add(d.gastoCajita);
        }
      } else {
        if(d.tipo==='reposicion'&&d.yaSaque){
          const cuenta=d.cuentaId||item.cuentaDestino;
          if(cuenta)cuentasAfectadas.add(cuenta);
        } else if(d.tipo==='gasto'&&d.gastoOrigen==='tc'&&d.gastoTcId&&d.yaPague){
          cuentasAfectadas.add('tc:'+d.gastoTcId);
        }
      }
    });
    let opsPosteriores=0;
    if(fechaRef){
      cuentasAfectadas.forEach(c=>{
        let ops=0;
        if(c.startsWith('tc:')){
          const tc=(S.tarjetasCredito||[]).find(x=>x.id===c.slice(3));
          if(tc && typeof _tcOpsPosteriores==='function') ops=_tcOpsPosteriores(tc,fechaRef,null);
        } else if(typeof _cuentaOpsPosteriores==='function'){
          ops=_cuentaOpsPosteriores(c,fechaRef,null);
        }
        if(ops>opsPosteriores)opsPosteriores=ops;
      });
    }
    if(fechaRef && typeof nivelAntiguedadMovimiento==='function'){
      const nivel=nivelAntiguedadMovimiento(fechaRef,opsPosteriores,'plata_comprometida');
      if(nivel==='bloqueado'){
        if(typeof avisarMovimientoBloqueado==='function') await avisarMovimientoBloqueado();
        return;
      }
      if(nivel==='viejo'){
        advertencia += '\n\n<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block"><path d="M12 8v4"/><path d="M12 16h.01"/><circle cx="12" cy="12" r="10"/></svg> Esto ya tiene tiempo y puede estar mezclado con operaciones más recientes de las cuentas involucradas — revertirlo hoy ajusta esos saldos actuales, no recalcula el historial completo.';
      }
    }
  }

  const ok = typeof dialogo === 'function'
    ? await dialogo('Eliminar ingreso comprometido', advertencia, 'Sí, eliminar y revertir', true)
    : confirm(advertencia);
  if(!ok) return;

  // ── Revertir efectos secundarios ─────────────────────────────────
  try {
    if(yaRecibido){
      // El ingreso ya se distribuyó: revertir todos los movimientos generados en _cpConfirmarRecibir
      // 1) Revertir entradas en S.movimientos que fueron creadas por este ingreso comprometido
      //    Identificamos los movimientos por su desc que contiene el nombre del item.
      //    Usamos la bandera _esReposicionCP para los de reposición,
      //    y para los de "Ingreso libre" buscamos por desc exacta.
      if(S.movimientos){
        S.movimientos = S.movimientos.filter(m => {
          const desc = m.desc || '';
          // Reposiciones marcadas con el flag (nuevo formato)
          if(m._esReposicionCP && desc.includes(item.desc)) return false;
          // Ingreso libre: coincide desc e id generado desde este item
          if(m._esSobrante && desc.includes(item.desc)) return false;
          // Reposiciones antiguas (sin flag): buscar por desc exacta
          if(m.tipo==='entrada' && (
            desc === 'Reposición: '+item.desc ||
            desc === 'Reposición (adelantada): '+item.desc ||
            desc.startsWith('Para pagar TC (') && desc.endsWith('): '+item.desc) ||
            desc === 'Ingreso libre: '+item.desc
          )) return false;
          return true;
        });
      }
      // 2) Revertir sumarFuente de cada destino de reposición
      (item.destinos||[]).forEach(d => {
        try {
          if(d.tipo==='reposicion'){
            const cuenta = d.cuentaId || item.cuentaDestino;
            if(cuenta && typeof descontarFuente==='function'){
              if(cuenta.startsWith('cajita:')){
                const caj=(S.cajitas||[]).find(x=>x.id===cuenta.split(':')[1]);
                if(caj && typeof materializarIntereses==='function') materializarIntereses(caj);
              }
              descontarFuente(cuenta, d.monto);
            }
          } else if(d.tipo==='gasto' && d.gastoOrigen==='tc' && d.gastoTcId){
            // Revertir deuda y compra de TC generada al recibir
            const tc=(S.tarjetasCredito||[]).find(x=>x.id===d.gastoTcId);
            if(tc){
              const _compraVieja=tcBuscarCompraPorIdOMatch(tc, d._tcCompraId, d.desc, d.monto);
              if(_compraVieja) tcEliminarCompraInterna(tc, _compraVieja.id);
              // También revertir la cajita a la que se movió la plata para pagar TC
              if(d.gastoTcCajita && typeof descontarFuente==='function'){
                if(d.gastoTcCajita.startsWith('cajita:')){
                  const caj=(S.cajitas||[]).find(x=>x.id===d.gastoTcCajita.split(':')[1]);
                  if(caj && typeof materializarIntereses==='function') materializarIntereses(caj);
                }
                descontarFuente(d.gastoTcCajita, d.monto);
              }
            }
          } else if(d.tipo==='gasto' && d.gastoOrigen==='cajita' && d.gastoCajita){
            // Revertir la reposición del gasto de cajita
            if(typeof descontarFuente==='function'){
              if(d.gastoCajita.startsWith('cajita:')){
                const caj=(S.cajitas||[]).find(x=>x.id===d.gastoCajita.split(':')[1]);
                if(caj && typeof materializarIntereses==='function') materializarIntereses(caj);
              }
              descontarFuente(d.gastoCajita, d.monto);
            }
          }
        } catch(e){ console.warn('[CP] Error revirtiendo destino al eliminar:', e); }
      });
    } else {
      // No recibido: solo revertir adelantos (yaSaque) y TC marcadas (yaPague)
      (item.destinos||[]).forEach(d => {
        try {
          if(d.tipo==='reposicion' && d.yaSaque){
            const cuenta = d.cuentaId || item.cuentaDestino;
            if(cuenta && typeof sumarFuente==='function'){
              if(cuenta.startsWith('cajita:')){
                const caj=(S.cajitas||[]).find(x=>x.id===cuenta.split(':')[1]);
                if(caj && typeof materializarIntereses==='function') materializarIntereses(caj);
              }
              // Revertir el descuento que se hizo al adelantar (devolver la plata a la cajita)
              sumarFuente(cuenta, d.monto);
              // Quitar el movimiento de salida generado por el adelanto
              if(S.movimientos){
                S.movimientos = S.movimientos.filter(m => !(
                  m.tipo==='salida' &&
                  m.fuente===cuenta &&
                  m.monto===d.monto &&
                  (m.desc||'').includes(d.desc||item.desc)
                ));
              }
            }
          } else if(d.tipo==='gasto' && d.gastoOrigen==='tc' && d.gastoTcId && d.yaPague){
            const tc=(S.tarjetasCredito||[]).find(x=>x.id===d.gastoTcId);
            if(tc){
              const _compraVieja=tcBuscarCompraPorIdOMatch(tc, d._tcCompraId, d.desc, d.monto);
              if(_compraVieja) tcEliminarCompraInterna(tc, _compraVieja.id);
            }
          }
        } catch(e){ console.warn('[CP] Error revirtiendo adelanto al eliminar:', e); }
      });
    }
  } catch(e){ console.error('[CP] Error en reversión al eliminar:', e); }

  // ── Eliminar el registro ─────────────────────────────────────────
  S.plataCometida = S.plataCometida.filter(i=>i.id!==id);
  save();
  if(typeof refresh==='function') refresh();
  _cpRenderLista();
  toast('Ingreso eliminado y efectos revertidos <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block"><polyline points="20 6 9 17 4 12"/></svg>','ok');
};

/* ── INTEGRACIÓN CON renderAttencion ────────────────────────────── */
(function(){
  const _origRA = window.renderAttencion;
  window.renderAttencion = function(){
    if(typeof _origRA === 'function') _origRA();
    // Agregar alertas de plata que llega pronto o ya llegó
    const items = _cpData ? _cpData() : [];
    const list = document.getElementById('s-attn-list');
    const sec  = document.getElementById('s-attn-section');
    if(!list || !sec) return;
    const hoyStr = hoy();
    items.filter(i=>!i.recibido).forEach(item => {
      const dias = item.fechaLlegada
        ? Math.round((new Date(item.fechaLlegada+'T00:00:00')-new Date(hoyStr+'T00:00:00'))/86400000)
        : null;
      if(dias === null) return;
      let txt = '', tipo = '';
      if(dias < 0){ txt = html`"${item.desc}" ya debía haber llegado — ¿recibiste?`; tipo='amber'; }
      else if(dias === 0){ txt = html`Hoy llega "${item.desc}" (${fmt(item.montoTotal)})`; tipo='amber'; }
      else if(dias === 1){ txt = html`Mañana llega "${item.desc}" (${fmt(item.montoTotal)})`; tipo='amber'; }
      else if(dias <= 3){ txt = html`En ${dias} días llega "${item.desc}" (${fmt(item.montoTotal)})`; tipo='amber'; }
      if(txt){
        sec.style.display = '';
        const chip = document.createElement('div');
        chip.className = 'card card-sm attn-card';
        chip.style.marginBottom='7px';
        chip.style.cursor='pointer';
        chip.innerHTML = html`<div style="font-size:12px;color:var(--amber);">${txt}</div>`;
        chip.onclick = ()=>{ if(typeof showScreen==='function') showScreen('comprometida'); setTimeout(_cpRenderLista,100); };
        list.appendChild(chip);
      }
    });

    // Alertas de gastos pendientes con fecha de pago próxima (plata guardada en cajita)
    items.filter(i => i.recibido).forEach(item => {
      (item.destinos||[]).filter(d =>
        d.tipo === 'gasto' && !d.yaPague && d.gastoOrigen === 'cajita' && d.gastoCajita && d.fechaPago
      ).forEach(d => {
        const diasG = Math.round((new Date(d.fechaPago+'T00:00:00') - new Date(hoyStr+'T00:00:00'))/86400000);
        let txtG = '', tipoG = '';
        const cajLabelG = typeof _cpFuenteLabel==='function'?_cpFuenteLabel(d.gastoCajita):d.gastoCajita;
        if(diasG < 0){ txtG = html`Vencido: "${d.desc}" de "${item.desc}" debía pagarse el ${d.fechaPago} — tenés ${fmt(d.monto)} en ${cajLabelG}`; tipoG='red'; }
        else if(diasG === 0){ txtG = html`¡Hoy hay que pagar "${d.desc}"! Tenés ${fmt(d.monto)} guardado`; tipoG='amber'; }
        else if(diasG === 1){ txtG = html`Mañana vence "${d.desc}" — tenés ${fmt(d.monto)} en ${cajLabelG}`; tipoG='amber'; }
        else if(diasG <= 3){ txtG = html`En ${diasG} días vence "${d.desc}" (${d.fechaPago}) — tenés ${fmt(d.monto)} guardado`; tipoG='amber'; }
        if(txtG){
          sec.style.display = '';
          const chipG = document.createElement('div');
          chipG.className = 'card card-sm attn-card';
          chipG.style.marginBottom='7px';
          chipG.style.cursor='pointer';
          chipG.style.borderColor = tipoG==='red' ? 'rgba(240,104,104,.4)' : '';
          chipG.innerHTML = html`<div style="font-size:12px;color:var(--${raw(tipoG)});">${txtG}</div>`;
          chipG.onclick = ()=>{ if(typeof showScreen==='function') showScreen('comprometida'); setTimeout(_cpRenderLista,100); };
          list.appendChild(chipG);
        }
      });
    });
  };
})();

/* ── INTEGRACIÓN: swipe/sheet handle para los nuevos sheets ─────── */
function _cpInitSwipe(){
  // Usa la función unificada _makeSheetSwipeable (sección 7)
  ['cp-nuevo','cp-destino','cp-recibir'].forEach(sheetId=>{
    const overlay = document.getElementById('sheet-'+sheetId);
    if(overlay && typeof window._makeSheetSwipeable === 'function'){
      window._makeSheetSwipeable(overlay);
    }
  });
}

/* ── INICIALIZAR ─────────────────────────────────────────────────── */
function _cpInit(){
  _injectScreen();
  _injectMasItem();
  _injectSheet();
  _cpInitSwipe();

  // El acceso a Plata comprometida está en el menú Más (#mas-comprometida).
  // El listener se conecta en _injectMasItem() al inyectar el ítem.

  // Actualizar input de balance en tiempo real cuando cambia el monto total
  const montoInput = document.getElementById('cp-monto-total');
  if(montoInput){
    montoInput.addEventListener('input', ()=>_cpRenderDestinosTmp());
  }

  // Select oculto de tipo de destino: por defensividad, si algo llega a
  // cambiar su valor y disparar 'change' (hoy no ocurre — _cpdSetTipo ya
  // llama a _cpdTipoChange() directo), lo conectamos igual sin onchange inline.
  const cpdTipoSel = document.getElementById('cpd-tipo');
  if(cpdTipoSel){
    cpdTipoSel.addEventListener('change', ()=>_cpdTipoChange());
  }

  // Conectar botones data-close-sheet de los nuevos sheets
  document.querySelectorAll('[data-close-sheet="cp-nuevo"],[data-close-sheet="cp-destino"],[data-close-sheet="cp-recibir"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.getAttribute('data-close-sheet');
      closeSheet(id);
    });
  });

  // Render cuando se navega a la pantalla (via click en cualquier parte del DOM)
  document.addEventListener('click', e=>{
    const target = e.target.closest('[data-screen="comprometida"], #mas-comprometida');
    if(target) setTimeout(_cpRenderLista, 100);
  });

  // Integrar con refresh global para mantener stats actualizados
  const _origRefreshCP = window.refresh;
  if(typeof _origRefreshCP === 'function'){
    window.refresh = function(){
      _origRefreshCP.apply(this, arguments);
      // Actualizar stats si la pantalla está activa
      const screen = document.getElementById('screen-comprometida');
      if(screen && screen.classList.contains('active')) _cpRenderLista();
    };
  }

  // Render inicial si hay datos
  if(window.S && (window.S.plataCometida||[]).length) _cpRenderLista();
}

/* ── EVENTOS: registrar acciones en el despachador central ─────────
   Namespace "cp" — ver js/core/events.js. Reemplaza los onclick
   inline que tenía este módulo (27 en total: 26 onclick + 1 onchange
   sobre un <select> oculto que en la práctica nunca se disparaba). */
Events.registerAll('cp', {
  abrirNuevo:       _cpAbrirNuevo,
  abrirEditar:      _cpAbrirEditar,
  cancelarSheet:    _cpCancelSheet,
  guardar:          _cpGuardar,
  agregarDestino:   _cpAgregarDestino,
  dSetTipo:         _cpdSetTipo,
  dSetGastoOrigen:  _cpdSetGastoOrigen,
  dSetYaSaque:      _cpdSetYaSaque,
  dSetYaPague:      _cpdSetYaPague,
  dConfirmar:       _cpdConfirmar,
  quitarDestino:    _cpQuitarDestino,
  abrirRecibir:     _cpAbrirRecibir,
  confirmarRecibir: _cpConfirmarRecibir,
  marcarPagos:      _cpMarcarPagos,
  guardarMarcados:  _cpGuardarMarcados,
  toggleMarcar:     _cpToggleMarcar,
  eliminar:         _cpEliminar,
  // Cierre del sheet dinámico "cp-marcar" — no tenía addEventListener
  // propio (se crea después de que _cpInit ya conectó los data-close-sheet
  // estáticos), así que antes dependía por completo del onclick inline.
  cerrarMarcar:     ()=>{ if(typeof closeSheet==='function') closeSheet('cp-marcar'); },
});

// Arrancar: esperar a que la app esté lista
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', ()=>setTimeout(_cpInit, 400));
} else {
  setTimeout(_cpInit, 400);
}

// Arrancar también cuando Firebase termina de cargar los datos.
// Usamos el evento 'appDataLoaded' en lugar de sobrescribir window._fbLoadData,
// porque este script es inline y se ejecuta ANTES que los módulos (type="module"),
// por lo que cualquier wrapper sobre _fbLoadData quedaría sobreescrito por el módulo.
window.addEventListener('appDataLoaded', function(){ setTimeout(_cpInit, 800); });

})();
