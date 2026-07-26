/* ═══════════════════════════════════════════════════════════════
   js/core/split.js

   MOTOR GENÉRICO "SPLIT DE FUENTES" (mismo patrón que diffRegistrarInstancia,
   ver js/core/diferencial.js)
   ───────────────────────────────────────────────────────────────
   Esto estaba triplicado: Mesada, MovEnc y UsarParte tenían cada
   uno su propio toggle / agregarRow / getData, casi idénticos.
   Ahora hay un solo motor parametrizado por instancia. Cada módulo
   registra su config con crearSplitWidget() y expone wrappers con
   el nombre de siempre (toggleMpSplit, _movEncSplitToggle, etc.)
   para no tener que tocar el resto del archivo ni el HTML, que
   siguen llamando a esas funciones por su nombre de toda la vida.

   crearSplitWidget(instId, cfg):
     simpleId, splitId, toggleId, rowsId : ids de los elementos del DOM
     getModo()/setModo(v)  : leer/escribir el flag de modo split.
                              Es un closure sobre el `let` propio de
                              cada módulo (mpSplitMode, etc.) — así el
                              resto del archivo, que lee esa variable
                              directamente, sigue funcionando sin tocar
                              una sola línea más.
     getFuentesFn(selectedVal) : HTML de <option>s — la única pieza
                              que de verdad difiere entre módulos.
     onPreview()            : se llama tras cualquier cambio (toggle,
                              agregar/borrar fila, escribir un monto).

   Nota: las filas ahora usan input type="text" + class="money-input"
   (igual que el resto de la app, parseMoney) en vez del type="number"
   + parseFloat que tenía Mesada — eso era una inconsistencia real
   preexistente (mpMonto, el campo padre, ya usaba money-input), no
   un cambio de comportamiento que se inventa este refactor.

   ── QUÉ CAMBIÓ EN ESTA MIGRACIÓN (respecto a index.html) ─────────
   Igual que con el motor Diferencial: crearSplitWidget/splitToggle/
   splitGetData/splitPreview se movieron TAL CUAL (misma firma, mismos
   nombres globales) — los módulos externos (mesada.js, encargos.js,
   prestado.js) que llaman a estas funciones por nombre no necesitan
   ningún cambio de su lado.

   Lo único que sí se tocó es splitAgregarRow(): generaba una fila con
   onchange/oninput/onclick inline (el botón de borrar además mezclaba
   dos sentencias en un solo onclick). Como cada llamada crea UNA sola
   fila nueva vía document.createElement + innerHTML + appendChild (no
   reconstruye la lista entera cada vez, a diferencia de
   diffRenderPartes), alcanza con adjuntar los listeners una sola vez
   por fila, justo antes de insertarla — no hace falta re-adjuntar nada
   en renders posteriores. ═══════════════════════════════════════════════════════════════ */
const _splitInstancias = {};

function crearSplitWidget(instId, cfg){
  _splitInstancias[instId] = cfg;
  return cfg;
}

function splitToggle(instId){
  const cfg = _splitInstancias[instId]; if(!cfg) return;
  const modo = !cfg.getModo();
  cfg.setModo(modo);
  const simple = document.getElementById(cfg.simpleId);
  const split  = document.getElementById(cfg.splitId);
  if(simple) simple.style.display = modo ? 'none' : '';
  if(split)  split.style.display  = modo ? '' : 'none';
  const btn = document.getElementById(cfg.toggleId);
  if(btn){
    btn.textContent   = modo ? 'Una sola cuenta' : 'Dividir ÷';
    btn.style.background  = modo ? 'rgba(240,184,64,.1)' : 'rgba(200,240,96,.1)';
    btn.style.borderColor = modo ? 'rgba(240,184,64,.3)' : 'rgba(200,240,96,.3)';
    btn.style.color       = modo ? 'var(--amber)' : 'var(--accent)';
  }
  const rows = document.getElementById(cfg.rowsId);
  if(modo && rows && rows.children.length===0){
    splitAgregarRow(instId);
    splitAgregarRow(instId);
  }
  cfg.onPreview && cfg.onPreview();
}

function splitAgregarRow(instId){
  const cfg = _splitInstancias[instId]; if(!cfg) return;
  const container = document.getElementById(cfg.rowsId);
  if(!container) return;
  const id = 'spr_'+uid();
  const div = document.createElement('div');
  div.id = id;
  div.style.cssText = 'display:grid;grid-template-columns:1fr auto auto;gap:6px;align-items:center;margin-bottom:7px;';
  div.innerHTML = `
    <div class="select-wrap"><select style="padding:8px 10px;background:var(--bg3);border:1px solid var(--border2);border-radius:var(--radius-sm);color:var(--text);font-size:12px;font-family:'DM Sans',sans-serif;outline:none;">${cfg.getFuentesFn('')}</select></div>
    <input type="text" inputmode="decimal" placeholder="monto" class="money-input" style="width:96px;padding:8px 10px;background:var(--bg3);border:1px solid var(--border2);border-radius:var(--radius-sm);color:var(--text);font-size:12px;font-family:'DM Mono',monospace;outline:none;">
    <button type="button" style="width:28px;height:36px;background:rgba(240,104,104,.1);border:1px solid rgba(240,104,104,.2);border-radius:7px;color:var(--red);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>`;

  // onchange/oninput/onclick no pasan por Events (solo despacha clicks con
  // data-action) — como cada fila se crea UNA vez y no se reconstruye, alcanza
  // con adjuntar los listeners acá mismo, antes de insertar la fila en el DOM.
  const sel = div.querySelector('select');
  const inp = div.querySelector('input');
  const btn = div.querySelector('button');
  if (sel) sel.addEventListener('change', () => splitPreview(instId));
  if (inp) inp.addEventListener('input', () => splitPreview(instId));
  if (btn) btn.addEventListener('click', () => { div.remove(); splitPreview(instId); });

  container.appendChild(div);
}

function splitGetData(instId){
  const cfg = _splitInstancias[instId]; if(!cfg) return [];
  const rows = document.getElementById(cfg.rowsId);
  if(!rows) return [];
  const result = [];
  for(const row of rows.children){
    const sel = row.querySelector('select');
    const inp = row.querySelector('input');
    const fuente = sel ? sel.value : '';
    const monto = parseMoney(inp ? inp.value : '') || 0;
    if(monto>0) result.push({fuente,monto});
  }
  return result;
}

function splitPreview(instId){
  const cfg = _splitInstancias[instId]; if(!cfg) return;
  cfg.onPreview && cfg.onPreview();
}
