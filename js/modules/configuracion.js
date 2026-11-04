/* ═══════════════════════════════════════════════════════════════
   js/modules/configuracion.js

   Módulo de Configuración: categorías personalizadas, copia de
   seguridad (exportar/importar JSON, exportar CSV), módulos activos
   y borrado de datos.

   Documentación del módulo: configuracion.md.

   Funciones que NO viven acá a propósito, por ser núcleo compartido con
   otras pantallas:
     - applyModulos() (js/core/sheet-stack.js): además de reflejar los toggles en esta pantalla,
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

   leerArchivoImport() valida la estructura del JSON (_validarEstructuraJSON) y pide
   confirmación antes de reemplazar nada; solo recarga la página cuando el guardado
   en la nube se confirmó.
   ═══════════════════════════════════════════════════════════════ */

/* ---- CATEGORÍAS PERSONALIZADAS ---- */
// Migrado a html`` (js/core/html-tag.js, ver auditoria-tecnica.md "Auditoría
// exhaustiva de .innerHTML"): `c` (nombre de categoría, texto libre creado por
// el usuario en agregarCat()) ya no depende de que alguien se acuerde de
// envolverlo en escHtml() a mano — html`` lo escapa por defecto.
// Events.attr(...) se deja envuelto en raw(): ya devuelve el atributo armado y
// escapado (serializa los argumentos a JSON y los pasa por escHtml() dentro de
// events.js), así que un nombre de categoría con comillas o HTML no rompe el
// atributo `data-action`.
function renderCatsConfig(){
  // Render lista de categorías variables
  const elVar=document.getElementById('cats-var-list');
  const elFijo=document.getElementById('cats-fijo-list');
  if(!elVar||!elFijo)return;

  const renderCatChips=(cats,defaults,tipo)=>cats.map(c=>{
    const esDefault=defaults.includes(c);
    return html`<span class="cat-chip">
      ${c}
      ${!esDefault?html`<button type="button" class="cat-chip-del" title="Eliminar" ${raw(Events.attr('config:eliminarCat',tipo,c))}>
        <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>`:''}
    </span>`;
  });

  elVar.innerHTML=html`<div class="cat-chips">${renderCatChips(getCatsVar(),CATS_VAR_DEFAULT,'var')}</div>`;
  elFijo.innerHTML=html`<div class="cat-chips">${renderCatChips(getCatsFijo(),CATS_FIJO_DEFAULT,'fijo')}</div>`;
  renderTamanoDatos();
  renderMisWrapped();
}

// «Mis Wrapped»: los años que el usuario guardó con el botón «Guardar este Wrapped» (S.wrappedAnios, ver wrapped.js). Solo lee datos: se ve
// aunque el módulo de Wrapped no haya cargado y se puede abrir un año en cualquier momento del año. Cada año se puede eliminar.
function renderMisWrapped(){
  const el=document.getElementById('cfg-mis-wrapped');
  if(!el)return;
  const guardados=S.wrappedAnios||{};
  const anios=Object.keys(guardados).sort().reverse();
  if(!anios.length){el.innerHTML='';return;}
  el.innerHTML=html`<div class="sec-title ix-mt4">Mis Wrapped</div>
    <div class="card cfg-wrapped-lista">
      ${anios.map(a=>html`<div class="cfg-wrapped-fila">
        <button type="button" class="cfg-wrapped-abrir" ${raw(Events.attr('config:abrirWrapped',a))}>
          <span class="cfg-wrapped-anio">${a}</span>
          <span class="cfg-wrapped-estado">${guardados[a]&&guardados[a].generadoEn?'Guardado el '+new Date(guardados[a].generadoEn+'T12:00:00').toLocaleDateString('es-CO',{day:'numeric',month:'long',year:'numeric'}):'Guardado'}</span>
          <svg aria-hidden="true" class="cfg-wrapped-chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        ${botonEliminarFila('config:eliminarWrapped',[a],'Eliminar el Wrapped de '+a)}
      </div>`)}
    </div>`;
}

// Eliminar un Wrapped guardado: confirmación y PIN (como «Borrar todos los datos»). Si el año sigue siendo el que se puede generar —enero—
// se puede volver a generar y guardar; fuera de la ventana, no: por eso el aviso es distinto.
async function eliminarWrapped(anio){
  const info=typeof window._wrappedVentanaInfo==='function'?window._wrappedVentanaInfo():null;
  const regenerable=!!(info&&info.disponible&&String(info.anioObjetivo)===String(anio));
  const aviso=regenerable
    ?'¿Eliminar el Wrapped de '+anio+'? Esta acción no se puede deshacer, pero mientras sea enero podrás generarlo de nuevo.'
    :'¿Eliminar el Wrapped de '+anio+'? Esta acción no se puede deshacer y no podrás generarlo otra vez.';
  const ok=await dialogo('Eliminar Wrapped '+anio,aviso,'Eliminar',true);
  if(!ok)return;
  if(!await pedirPinAntesDe('Para eliminar tu Wrapped de '+anio))return;
  if(S.wrappedAnios)delete S.wrappedAnios[anio];
  save();
  renderMisWrapped();
  toast('Wrapped de '+anio+' eliminado','ok');
}

// «Tamaño de tus datos» (Configuración → Datos). SOLO LECTURA: mide con Cierre.tamano (js/core/cierre.js, mismo códec del guardado) y
// muestra cuánto del límite de la nube se usa y, con la historia que hay, cuándo se llegaría al aviso. No archiva ni borra nada:
// cerrar períodos antiguos es la etapa siguiente (docs/cierre-de-periodos.md) y solo se plantea al pasar del disparador. El aviso no ofrece
// ningún botón porque esa función aún no existe: solo dice que ya toca revisarla.
let _tamanoSeq=0;
async function renderTamanoDatos(){
  const el=document.getElementById('cfg-tamano');
  if(!el)return;
  const mi=++_tamanoSeq; // si se reabre la pantalla mientras mide, solo pinta la última medición
  try{
    // Cierre y Huella se cargan bajo demanda (Loader, grupo 'cierre'): solo se descargan al abrir Configuración, no al arrancar la app.
    if(typeof Loader!=='undefined'&&typeof Loader.ensure==='function')await Loader.ensure('cierre');
    if(typeof Cierre==='undefined'||typeof Cierre.tamano!=='function')return;
    const t=await Cierre.tamano(S);
    if(mi!==_tamanoSeq)return;
    const kb=b=>Math.round(b/1000).toLocaleString('es-CO')+' KB';
    const pct=Math.min(100,t.porcentajeDelLimite);
    const p=t.proyeccion, d=Cierre.disparador(t);
    let proy='Aún no hay historia suficiente para proyectar el crecimiento.';
    if(p.diasHastaAviso!=null&&p.fechaAviso){
      const cuando=new Date(p.fechaAviso+'T12:00:00').toLocaleDateString('es-CO',{month:'long',year:'numeric'});
      proy=p.confianza==='baja'?'Con tan poca historia aún no se puede proyectar con fiabilidad.':'Al ritmo actual llegarías al aviso de tamaño hacia '+cuando+'.';
    }
    el.innerHTML=html`<div class="cfg-tamano-titulo">Tamaño de tus datos</div>
      <progress class="cfg-tamano-barra" max="100" value="${pct.toFixed(1)}"></progress>
      <div class="cfg-tamano-cifra">${kb(t.comprimido)} de ${kb(t.limites.limite)} (${pct.toFixed(1).replace('.',',')} %)${t.comprimidoEstimado?' · estimado':''}</div>
      <div class="cfg-tamano-nota">${proy}</div>
      ${d.recomendado?html`<div class="cfg-tamano-alerta">Tus datos ya pesan bastante; es momento de revisar el cierre de períodos.</div>`:''}
      ${d.avisos.map(a=>html`<div class="cfg-tamano-nota">${a}</div>`)}`;
  }catch(e){
    if(mi===_tamanoSeq)el.innerHTML='';
    console.warn('[config] No se pudo medir el tamaño de los datos:',e);
  }
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
  toast(`Categoría "${escHtml(cat)}" eliminada`,'ok');
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

// Validación de estructura al importar un backup JSON. Devuelve la lista de
// errores (vacía = válido). Deliberadamente laxa: exige al menos un campo
// conocido y el tipo correcto de los que estén presentes.
function _validarEstructuraJSON(data){
  const errores=[];
  if(typeof data!=='object'||Array.isArray(data)){
    return ['El archivo no tiene el formato esperado (debe ser un objeto JSON).'];
  }
  // Verificar campos clave
  const camposOpcionales=['nuRate','cajitas','cuentas',
    'deudores','gastosFijos','gastosVar','modulos'];
  const tieneAlgunCampo=camposOpcionales.some(c=>c in data);
  if(!tieneAlgunCampo){
    errores.push('El archivo no parece ser un backup de Mis Finanzas (no se encontraron campos conocidos).');
  }
  // Verificar tipos básicos
  // Un backup anterior a la unificación de cuentas (2026-10-01) trae nequiSaldo / efectivoSaldo /
  // cuentasPersonalizadas en vez de 'cuentas'. Ya no se convierte: importarlo dejaría Nequi,
  // Efectivo y las personalizadas en cero sin avisar, así que se rechaza con un mensaje claro.
  if(!('cuentas' in data)&&('nequiSaldo' in data||'efectivoSaldo' in data||'cuentasPersonalizadas' in data)){
    return ['Este backup usa el formato anterior de cuentas y ya no se puede importar.'];
  }
  if('cuentas' in data&&!Array.isArray(data.cuentas)){
    errores.push('El campo "cuentas" debe ser un array.');
  }
  if('cajitas' in data&&!Array.isArray(data.cajitas)){
    errores.push('El campo "cajitas" debe ser un array.');
  }
  if('spotify' in data&&(!data.spotify||typeof data.spotify!=='object'||Array.isArray(data.spotify))){
    errores.push('El campo "spotify" debe ser un objeto { personas, costo, cajitaId, historial }.');
  }
  if('gastosVar' in data&&!Array.isArray(data.gastosVar)){
    errores.push('El campo "gastosVar" debe ser un array.');
  }
  if('deudores' in data&&!Array.isArray(data.deudores)){
    errores.push('El campo "deudores" debe ser un array.');
  }
  // nuRate es la tasa EA de las cajitas de Nu; null = todavía sin configurar (un backup exportado así debe poder importarse).
  if('nuRate' in data&&data.nuRate!==null&&typeof data.nuRate!=='number'){
    errores.push('El campo "nuRate" debe ser un número (o null si no se configuró).');
  }
  ['gastosFijos','ingresosFijos','movimientos','misDeudas','encargos','tarjetasCredito','personas','libro','bienes'].forEach(k=>{
    if(k in data&&!Array.isArray(data[k]))errores.push('El campo "'+k+'" debe ser un array.');
  });
  ['pagosGastosFijos','mesadas','presupuestos','wrappedAnios'].forEach(k=>{
    if(k in data&&(data[k]===null||typeof data[k]!=='object'))errores.push('El campo "'+k+'" debe ser un objeto.');
  });
  // Un backup de una versión más nueva del modelo de datos que esta app no sabe leer: importarlo lo dejaría a medio
  // interpretar. Uno anterior a la versión base tampoco se puede importar: esta versión nació limpia y no migra datos viejos.
  const _sv=Number(data.schemaVersion);
  if(_sv>SCHEMA_VERSION_ACTUAL){
    errores.push('Este backup es de una versión más nueva de la app. Actualiza la app antes de importarlo.');
  } else if(_sv>0&&_sv<SCHEMA_BASE){
    errores.push('Este backup es de una versión anterior (esquema '+_sv+'): esta versión de la app empieza de cero y no importa datos de versiones anteriores.');
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
      // Validar estructura antes de reemplazar nada.
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
      if(!await pedirPinAntesDe('Para reemplazar todos tus datos con el backup')){e.target.value='';return;}
      // Llevar el backup al modelo de datos actual (si falla, el catch avisa y NO se reemplaza nada).
      aplicarMigraciones(data);
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
      // El toast de éxito y el reload dependen del resultado REAL del guardado:
      // _fbSaveToCloud() devuelve una promesa {ok, reason}. Si no llegó a escribir
      // (p.ej. window._dataLoaded todavía en false), recargar traería de vuelta el
      // dato viejo de la nube y el aviso de éxito habría mentido.
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
  // Mismo criterio de "gasto real" que el resto de la app (core-state.js + periodo.js): los pagos
  // de gasto fijo salen como filas "Fijo" (con el monto realmente pagado), no también como variables.
  (S.gastosVar||[]).filter(g=>!_esGastoVarNoReal(g)).sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||'')).forEach(g=>{
    rows.push([g.fecha||'',g.desc||'',g.cat||'',-(g.monto||0),'Variable',fuenteLabel?fuenteLabel(g.fuente):(g.fuente||'')]);
  });
  Periodo.pagosFijos().sort((a,b)=>b.mes.localeCompare(a.mes)).forEach(p=>{
    rows.push([p.mes+'-01',p.nombre||'Gasto fijo',p.cat||'',-p.monto,'Fijo','']);
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
// Entre la confirmación y el location.reload() final la app queda bloqueada con el
// overlay #fb-loading-screen (cubre toda la pantalla, z-index 99999). Es obligatorio:
// borrarTodo() no vacía window.S en memoria, solo escribe {} en Firestore; si en esa
// ventana se pudiera tocar "Cerrar sesión", el guardado final de _fbSignOut() volvería
// a subir el S viejo y pisaría el borrado. Mismo criterio en _fbSignOut/_fbDeleteAccount
// (firebase-sync.js).
async function borrarTodo(){
  const ok=await dialogo('Borrar todos los datos','¿Seguro que quieres borrar TODO? Esta acción no se puede deshacer y perderás toda tu información financiera.','Borrar todo',true);
  if(!ok)return;
  if(!await pedirPinAntesDe('Para borrar todos los datos'))return;
  const _overlay = document.getElementById('fb-loading-screen');
  if(_overlay) _overlay.style.display = 'flex';
  // Borrar en Firebase: payload "{}" a propósito — la carga lo lee como "vacío", lo verifica
  // contra el servidor y arranca con el estado por defecto de S (ver firebase-sync.js).
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
  // El PIN y la huella son locales a este dispositivo y protegían datos que ya no existen. Solo se
  // quitan si el borrado en la nube se confirmó: si falló, los datos viejos pueden volver al reabrir
  // y tienen que seguir protegidos. Al recargar, _pinGate() ya no encuentra PIN y no lo pide.
  if(_borradoFirebaseOk && typeof window._pinReset==='function') window._pinReset();
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
  // «Mis Wrapped»: abre un año guardado (wrapped-gate.js lo deja listo para renderWrapped)
  abrirWrapped: (anio) => window._wrappedAbrir(anio),
  eliminarWrapped: (anio) => eliminarWrapped(anio),
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
