/* ═══════════════════════════════════════════════════════════════
   js/modules/configuracion.js

   Módulo de Configuración: categorías personalizadas, copia de
   seguridad (exportar/importar JSON, exportar CSV), módulos activos
   y borrado de datos.

   Migrado desde index.html a js/core/events.js (data-action) con el
   mismo patrón que Spotify, Mesada, Encargos, Préstamos, Tarjetas de
   Crédito, Cuentas, Gastos, Plata Comprometida y Alcancía — ver
   docs/auditoria-tecnica.md.

   Funciones que se QUEDAN en index.html a propósito, por ser núcleo
   compartido con otras pantallas (mismo criterio ya aplicado con
   navTo()/refresh() en migraciones anteriores):
     - applyModulos(): además de reflejar los toggles en esta pantalla,
       oculta/muestra la pestaña de Spotify en el nav, la pantalla de
       Mesada, los banners de saldo inicial en Cuentas y dispara
       renderAttencion() en Inicio. toggleModulo() (acá abajo) la llama.
     - _fbSignOut() / _abrirEliminarCuenta() / _fbDeleteAccount(): viven
       en el módulo de autenticación de Firebase (núcleo — gestiona toda
       la sesión, no solo esta pantalla). Este archivo solo las invoca.
     - pin-config-container / bio-config-container: el gate de PIN y
       biometría es de toda la app (se muestra al abrir Mis Finanzas,
       no solo desde acá) — fuera de alcance de esta sesión.
     - getCatsVar()/getCatsFijo()/CATS_VAR_DEFAULT/CATS_FIJO_DEFAULT:
       compartidas con el módulo de Gastos (selectores de categoría).

   Nota sobre leerArchivoImport(): la versión de acá es la base. Más
   abajo en index.html sigue existiendo un override ("MEJORA 5:
   Validación") que la reemplaza por una versión con validación de
   estructura del JSON — mismo patrón que ya usa addGastoVar con
   Gastos. No se tocó: sigue funcionando igual mientras este archivo
   se cargue antes que ese bloque de overrides.
   ═══════════════════════════════════════════════════════════════ */

/* ---- CATEGORÍAS PERSONALIZADAS ---- */
// Migrado a html`` (js/core/html-tag.js, ver auditoria-tecnica.md "Auditoría
// exhaustiva de .innerHTML"): `c` (nombre de categoría, texto libre creado por
// el usuario en agregarCat()) ya no depende de que alguien se acuerde de
// envolverlo en escHtml() a mano — html`` lo escapa por defecto.
// Events.attr(...) se deja envuelto en raw(): ya arma su propio HTML de
// atributos (incluyendo `tipo`/`c`) y hoy se interpola sin pasar por
// escHtml() en ningún punto de este archivo, exactamente igual que antes de
// esta migración — no es un cambio de comportamiento. Si event.js no escapa
// `c` internamente, sigue siendo el mismo hallazgo pendiente de investigar
// (ver auditoria-tecnica.md), no algo que este migración deba resolver de paso.
function renderCatsConfig(){
  // Render lista de categorías variables
  const elVar=document.getElementById('cats-var-list');
  const elFijo=document.getElementById('cats-fijo-list');
  if(!elVar||!elFijo)return;

  const renderCatChips=(cats,defaults,tipo)=>cats.map(c=>{
    const esDefault=defaults.includes(c);
    return html`<span class="cat-chip" style="display:inline-flex;align-items:center;gap:4px;padding:4px 9px 4px 10px;background:var(--bg3);border:1px solid var(--border2);border-radius:20px;font-size:11px;font-family:'DM Mono',monospace;margin:0 4px 6px 0;color:var(--text2);">
      ${c}
      ${!esDefault?html`<button type="button" class="cat-chip-del" title="Eliminar" ${raw(Events.attr('config:eliminarCat',tipo,c))} style="background:none;border:none;cursor:pointer;color:var(--text3);padding:0 0 0 2px;line-height:1;display:flex;align-items:center;">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>`:''}
    </span>`;
  });

  elVar.innerHTML=html`<div style="display:flex;flex-wrap:wrap;">${renderCatChips(getCatsVar(),CATS_VAR_DEFAULT,'var')}</div>`;
  elFijo.innerHTML=html`<div style="display:flex;flex-wrap:wrap;">${renderCatChips(getCatsFijo(),CATS_FIJO_DEFAULT,'fijo')}</div>`;
}

function agregarCat(tipo){
  const inputId=tipo==='var'?'nueva-cat-var':'nueva-cat-fijo';
  const val=document.getElementById(inputId).value.trim();
  if(!val){toast('Escribe el nombre de la categoría','err');return;}
  if(val.length>30){toast('Máximo 30 caracteres','err');return;}
  const cats=tipo==='var'?getCatsVar():getCatsFijo();
  if(cats.map(c=>c.toLowerCase()).includes(val.toLowerCase())){toast('Esa categoría ya existe','err');return;}
  cats.push(val);
  if(tipo==='var')S.catsVar=cats;
  else S.catsFijo=cats;
  document.getElementById(inputId).value='';
  save();renderCatsConfig();
  toast(`Categoría "${escHtml(val)}" agregada`,'ok');
}

function eliminarCat(tipo,cat){
  const defaults=tipo==='var'?CATS_VAR_DEFAULT:CATS_FIJO_DEFAULT;
  if(defaults.includes(cat)){toast('Las categorías predeterminadas no se pueden eliminar','err');return;}
  // Verificar si está en uso
  let enUso=false;
  if(tipo==='var') enUso=(S.gastosVar||[]).some(g=>g.cat===cat);
  else enUso=(S.gastosFijos||[]).some(g=>g.cat===cat);
  if(enUso){toast(`"${escHtml(cat)}" está siendo usada en gastos existentes. Cámbiala primero.`,'err',4000);return;}
  const cats=tipo==='var'?getCatsVar():getCatsFijo();
  const nuevas=cats.filter(c=>c!==cat);
  if(tipo==='var')S.catsVar=nuevas;
  else S.catsFijo=nuevas;
  save();renderCatsConfig();
  toast(`Categoría "${escHtml(cat)}" eliminada`,'info');
}

/* ---- COPIA DE SEGURIDAD: EXPORTAR / IMPORTAR JSON ---- */
function exportarJSON(){
  save();
  const data=JSON.stringify(S,null,2);
  const blob=new Blob([data],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  const _fd=new Date();const fecha=_fd.getFullYear()+'-'+String(_fd.getMonth()+1).padStart(2,'0')+'-'+String(_fd.getDate()).padStart(2,'0');
  a.href=url;a.download=`mis-finanzas-backup-${fecha}.json`;
  a.click();URL.revokeObjectURL(url);
  toast('Copia de seguridad exportada','ok');
}

function importarJSON(){
  document.getElementById('importFileInput').click();
}

function leerArchivoImport(e){
  const file=e.target.files[0];
  if(!file)return;
  const reader=new FileReader();
  reader.onload=async function(ev){
    try{
      const data=JSON.parse(ev.target.result);
      const ok=await dialogo('Importar datos','¿Reemplazar todos los datos actuales con el archivo importado? Esta acción no se puede deshacer.','Importar',true);
      if(!ok)return;
      // Reemplazar CONTENIDO de S sin romper la referencia de window.S
      Object.keys(S).forEach(k => delete S[k]);
      Object.assign(S, data);
      // Marcar timestamp ANTES del debounce de guardado
      const _impTs = Date.now();
      window._lastSavedAt = _impTs;
      try { localStorage.setItem('mf_lastSavedAt', String(_impTs)); } catch(_){}
      window._importing = true;
      setTimeout(() => { window._importing = false; }, 5000);
      // Usar _fbSaveToCloud() en lugar de save() para guardar window.S
      // directamente sin leer del DOM (que aún muestra valores viejos).
      if(window._fbSaveToCloud) window._fbSaveToCloud();
      // Recargar cuando el debounce de 1.5s + escritura en Firestore hayan terminado.
      setTimeout(() => { location.reload(); }, 4000);
      toast('Datos importados correctamente — recargando…','ok');
    }catch(err){
      toast('Error al leer el archivo JSON','err');
    }
    e.target.value='';
  };
  reader.readAsText(file);
}

/* ---- EXPORTAR CSV (gastos) ---- */
function exportarCSV(){
  const rows = [['Fecha','Descripción','Categoría','Monto','Tipo','Cuenta']];
  (S.gastosVar||[]).sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||'')).forEach(g=>{
    rows.push([g.fecha||'',g.desc||'',g.cat||'',-(g.monto||0),'Variable',fuenteLabel?fuenteLabel(g.fuente):(g.fuente||'')]);
  });
  (S.gastosFijos||[]).forEach(g=>{
    Object.keys(S.pagosGastosFijos||{}).forEach(key=>{
      if(key.startsWith(g.id+'_')){
        const mes=key.split('_').pop();
        rows.push([mes+'-01',g.nombre,g.cat||'',-(g.monto||0),'Fijo','']);
      }
    });
  });
  const csv = rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
  const blob = new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const fd = new Date();
  a.href=url; a.download=`gastos-${fd.getFullYear()}-${String(fd.getMonth()+1).padStart(2,'0')}.csv`;
  a.click(); URL.revokeObjectURL(url);
  toast('CSV exportado','ok');
}

/* ---- MÓDULOS ACTIVOS ---- */
function toggleModulo(nombre){
  if(!S.modulos)S.modulos={mesada:true,spotify:true,corregirSaldo:true};
  const el=document.getElementById('cfg-'+nombre);
  S.modulos[nombre]=el?el.checked:!S.modulos[nombre];
  save();applyModulos();
}

/* ---- BORRAR TODOS LOS DATOS ---- */
async function borrarTodo(){
  const ok=await dialogo('Borrar todos los datos','¿Seguro que quieres borrar TODO? Esta acción no se puede deshacer y perderás toda tu información financiera.','Borrar todo',true);
  if(!ok)return;
  // Registrar en historial antes de borrar todo (quedará como primer evento visible si el historial no se borra)
  // Luego limpiar también el historial local para que no queden registros huérfanos
  localStorage.removeItem('mf_historial_v1');
  // Borrar en Firebase — guardar estructura vacía correcta (no {} vacío que rompe el payload)
  let _borradoFirebaseOk = true;
  if(window._fbUser && window._fb){
    try{
      const {db, doc, setDoc} = window._fb;
      const resetTs = Date.now();
      try { localStorage.setItem('mf_lastSavedAt', String(resetTs)); } catch(_){}
      window._lastSavedAt = resetTs;
      await setDoc(doc(db,'usuarios',window._fbUser.uid,'data','finanzas'),{
        payload: JSON.stringify({}),
        updatedAt: resetTs
      });
    }catch(e){
      console.error('Error borrando en Firebase:',e);
      _borradoFirebaseOk = false;
    }
  }
  if(!_borradoFirebaseOk){
    // No se pudo confirmar el borrado en la nube (ej. sin conexión). Avisar antes de
    // recargar para que el usuario sepa que debe reintentar — si no, al reabrir con
    // conexión, el snapshot viejo de Firestore podría volver a sincronizarse.
    toast('Se borró localmente, pero no se pudo confirmar el borrado en la nube. Revisa tu conexión y vuelve a intentarlo si el problema persiste.', 'err', 6000);
    await new Promise(r=>setTimeout(r, 2500));
  }
  location.reload();
}

/* ---- EVENTOS: acciones con data-action="config:..." ---- */
Events.registerAll('config', {
  agregarCat: agregarCat,
  eliminarCat: eliminarCat,
  signOut: () => window._fbSignOut(),
  abrirEliminarCuenta: () => window._abrirEliminarCuenta(),
  // Accesos directos de "Herramientas" (Personas, Actividad reciente)
  irA: (screen) => showScreen(screen),
});

/* ---- WIRING de controles que no son clicks simples (change/keydown/inputs de archivo) ---- */
// Toggles de "Módulos activos": son <input type="checkbox">, Events solo
// despacha clicks — se quedan con addEventListener('change', ...) directo,
// igual que ya estaban (no eran onclick inline, no había violación de CSP acá).
document.querySelectorAll('[data-modulo]').forEach(el => {
  el.addEventListener('change', () => toggleModulo(el.dataset.modulo));
});

// Backup: botones con id fijo, sin argumentos variables — addEventListener
// directo es más simple que envolverlos en data-action para este caso.
const _btnExportarJSON = document.getElementById('btn-exportar-json');
if (_btnExportarJSON) _btnExportarJSON.addEventListener('click', exportarJSON);
const _btnImportarJSON = document.getElementById('btn-importar-json');
if (_btnImportarJSON) _btnImportarJSON.addEventListener('click', importarJSON);
const _btnExportarCSV = document.getElementById('btn-exportar-csv');
if (_btnExportarCSV) _btnExportarCSV.addEventListener('click', exportarCSV);
const _btnBorrarTodo = document.getElementById('btn-borrar-todo');
if (_btnBorrarTodo) _btnBorrarTodo.addEventListener('click', borrarTodo);
const _importFileInput = document.getElementById('importFileInput');
// Wrapper en vez de pasar la referencia directa: así, si index.html sobreescribe
// leerArchivoImport más abajo (override de MEJORA 5, validación de estructura),
// el listener siempre invoca la versión vigente en vez de quedar "pegado" a esta.
if (_importFileInput) _importFileInput.addEventListener('change', (e) => leerArchivoImport(e));

// Enter en los inputs de nueva categoría
['nueva-cat-var','nueva-cat-fijo'].forEach(id=>{
  const el=document.getElementById(id);
  if(el) el.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();agregarCat(id.includes('var')?'var':'fijo');}});
});
