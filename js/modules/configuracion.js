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

   Nota sobre leerArchivoImport(): incluye validación de estructura del JSON
   (_validarEstructuraJSON) directo en el cuerpo — hasta 2026-08-30 vivía como
   un override en un archivo aparte (import-validado.js, cargado después en el
   mismo grupo lazy) que reemplazaba esta función por una versión con
   validación, dejando el cuerpo de acá como código muerto (nunca se
   ejecutaba, pero tenía que existir para que el override pudiera capturar su
   referencia antes de reemplazarla). Se fusionó en una sola función real: sin
   depender del orden de carga entre dos archivos, sin una implementación
   fantasma que alguien podría editar por error pensando que hace algo. Ver
   CHANGELOG.md#configuración.
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

// Validación de estructura al importar un backup JSON (fusionada acá desde
// import-validado.js el 2026-08-30 — ver nota de cabecera del archivo).
function _validarEstructuraJSON(data){
  const errores=[];
  if(typeof data!=='object'||Array.isArray(data)){
    return ['El archivo no tiene el formato esperado (debe ser un objeto JSON).'];
  }
  // Verificar campos clave
  const camposOpcionales=['nuRate','cajitas','nequiSaldo','efectivoSaldo',
    'deudores','gastosFijos','gastosVar','modulos'];
  const tieneAlgunCampo=camposOpcionales.some(c=>c in data);
  if(!tieneAlgunCampo){
    errores.push('El archivo no parece ser un backup de Mis Finanzas (no se encontraron campos conocidos).');
  }
  // Verificar tipos básicos
  if('cajitas' in data&&!Array.isArray(data.cajitas)){
    errores.push('El campo "cajitas" debe ser un array.');
  }
  if('gastosVar' in data&&!Array.isArray(data.gastosVar)){
    errores.push('El campo "gastosVar" debe ser un array.');
  }
  if('deudores' in data&&!Array.isArray(data.deudores)){
    errores.push('El campo "deudores" debe ser un array.');
  }
  if('nuRate' in data&&typeof data.nuRate!=='number'){
    errores.push('El campo "nuRate" debe ser un número.');
  }
  return errores;
}

function leerArchivoImport(e){
  const file=e.target.files[0];
  if(!file)return;
  const reader=new FileReader();
  reader.onload=async function(ev){
    try{
      const data=JSON.parse(ev.target.result);
      // MEJORA 5: validar estructura antes de reemplazar nada.
      const errores=_validarEstructuraJSON(data);
      if(errores.length>0){
        toast('Archivo inválido: '+errores[0],'err');
        setTimeout(()=>{
          if(errores.length>1)toast(errores.slice(1).join(' · '),'err');
        },1200);
        e.target.value='';
        return;
      }
      const ok=await dialogo('Importar datos','¿Reemplazar todos los datos actuales con el archivo importado? Esta acción no se puede deshacer.','Importar',true);
      if(!ok)return;
      // Reemplazar CONTENIDO de S sin romper la referencia de window.S
      Object.keys(S).forEach(k => delete S[k]);
      Object.assign(S, data);
      // Repintar YA la pantalla activa con los datos recién importados — sin esto,
      // S ya tiene los datos nuevos pero la UI sigue mostrando lo que había antes
      // de importar hasta que el location.reload() de más abajo confirme el guardado.
      if (typeof refresh === 'function') refresh();
      // Marcar timestamp ANTES del debounce de guardado
      const _impTs = Date.now();
      window._lastSavedAt = _impTs;
      try { localStorage.setItem('mf_lastSavedAt', String(_impTs)); } catch(_){}
      window._importing = true;
      setTimeout(() => { window._importing = false; }, 5000);
      // FIX (2026-09-05): antes se llamaba a _fbSaveToCloud() sin revisar el
      // resultado y se mostraba "Datos importados correctamente" + reload a
      // los 4s pase lo que pase. Si _fbSaveToCloud() no llegaba a escribir
      // (p.ej. window._dataLoaded todavía en false justo después de un
      // reinicio de la app), el toast mentía: no se había guardado nada, y
      // el reload de los 4s volvía a traer el dato viejo de Firestore. Ver
      // auditoria-tecnica.md — caso real: cajita Spotify import que "quedó
      // bien" en pantalla pero no sobrevivió al recargar.
      // Ahora _fbSaveToCloud() devuelve una promesa con el resultado real, y
      // el toast + el reload dependen de que esa promesa diga ok:true.
      if(!window._fbSaveToCloud){
        toast('Los datos se cargaron en la app pero no se pudo confirmar el guardado en la nube (función de guardado no disponible). No recargues la página todavía — avisa antes de seguir.','err',7000);
        return;
      }
      toast('Importando y guardando en la nube…','info',3000);
      const _saveResult = await window._fbSaveToCloud();
      if(_saveResult && _saveResult.ok){
        toast('Datos importados correctamente — recargando…','ok');
        // Recargar solo una vez confirmado el guardado (ya no hace falta
        // esperar un tiempo fijo — el await de arriba ya cubrió el debounce
        // de 1.5s y el setDoc()).
        setTimeout(() => { location.reload(); }, 800);
      } else {
        const _motivo = (_saveResult && _saveResult.reason) || 'desconocido';
        toast('No se pudo guardar en la nube (motivo: '+_motivo+'). Los datos quedaron cargados localmente, pero NO recargues la página — se perderían. Reintenta importar en unos segundos.','err',8000);
      }
    }catch(err){
      if(err instanceof SyntaxError){
        toast('El archivo no es un JSON válido','err');
      }else{
        toast('Error al procesar el archivo: '+err.message,'err');
      }
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
if (_importFileInput) _importFileInput.addEventListener('change', leerArchivoImport);

// Enter en los inputs de nueva categoría
['nueva-cat-var','nueva-cat-fijo'].forEach(id=>{
  const el=document.getElementById(id);
  if(el) el.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();agregarCat(id.includes('var')?'var':'fijo');}});
});
