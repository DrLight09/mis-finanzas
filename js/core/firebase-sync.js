// Sync con Firestore: setSyncStatus, _fbSaveToCloud (guardado con debounce),
// _fbLoadData, onSnapshot, registro de Events('authgate',...) + habilitación
// del botón de login — extraído de index.html (era <script type="module">
// inline). Ver auditoria-tecnica.md #2 y CHANGELOG.md#infraestructura--seguridad.

  // ── Helpers de estado de sync ──────────────────────────────────────────────
  function setSyncStatus(state, text) {
    const dot = document.getElementById('fb-sync-dot');
    const txt = document.getElementById('fb-sync-text');
    if(dot) { dot.className = 'fb-sync-dot' + (state !== 'ok' ? ' '+state : ''); }
    if(txt) txt.textContent = text;
  }

  // ── Guardar en Firestore con debounce ─────────────────────────────────────
  let _saveTimer = null;
  window._fbSaveToCloud = function() {
    // PROTECCIÓN CRÍTICA: nunca guardar si los datos no se han cargado
    // desde Firestore. Evita sobreescribir la nube con datos vacíos
    // si la app se reinicia abruptamente antes de terminar de cargar.
    if(!window._dataLoaded) return;
    clearTimeout(_saveTimer);
    setSyncStatus('syncing', 'Guardando…');
    _saveTimer = window._fbSaveTimer = setTimeout(async () => {
      if(!window._fbUser || !window._fb) return;
      try {
        const {db, doc, setDoc} = window._fb;
        // Firestore no acepta undefined — limpiamos el objeto
        if(!window.S){setSyncStatus("error","Error: datos no inicializados");return;}
        const data = JSON.parse(JSON.stringify(window.S));
        const savedAt = Date.now();
        await setDoc(
          doc(db, 'usuarios', window._fbUser.uid, 'data', 'finanzas'),
          { payload: JSON.stringify(data), updatedAt: savedAt }
        );
        window._lastSavedAt = savedAt; // Registrar cuándo guardamos por última vez
        // Persistir en localStorage para sobrevivir recargas de página
        try { localStorage.setItem('mf_lastSavedAt', String(savedAt)); } catch(_){}
        setSyncStatus('ok', 'Guardado en la nube · ' + new Date().toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'}));
      } catch(e) {
        console.error('Firebase save error:', e);
        setSyncStatus('error', 'Error al guardar — revisa conexión');
      }
    }, 1500);
  };

  // ── Inicializar la app una sola vez tras la primera carga ─────────────────
  function _initAppUI() {
    load();
    (function(){
      const el=document.getElementById('nuTasaGlobal');
      const elFecha=document.getElementById('nuTasaVigenciaFecha');
      if(el&&window.S.nuTasaGlobal!=null)el.value=String(window.S.nuTasaGlobal).replace('.',',');
      if(elFecha&&!elFecha.value)elFecha.value=hoy();
      _renderTasaHistorialTag();
      if(el){
        el.addEventListener('input',function(){
          const raw=this.value.replace(',','.');
          const v=raw===''?null:(parseFloat(raw)||null);
          window.S.nuTasaGlobal=v;
          if(v!=null){
            const fecha=(elFecha&&elFecha.value)?elFecha.value:hoy();
            registrarTasaNuHistorial(fecha,v);
          }
          save();refresh();
          _renderTasaHistorialTag();
        });
        el.addEventListener('blur',function(){
          if(this.value&&parseFloat(this.value)<=0)this.value='';
          if(this.value&&window.toast){
            const total=(S.cajitas||[]).reduce((a,c)=>a+calcC(c).val,0);
            toast('Cajitas recalculadas: '+fmt(total)+' — compara con la app de Nu','ok',4000);
          }
        });
      }
      if(elFecha){
        elFecha.addEventListener('change',function(){
          if(el&&el.value){
            const raw=el.value.replace(',','.');
            const v=parseFloat(raw);
            if(!isNaN(v)){
              registrarTasaNuHistorial(this.value,v);
              save();refresh();
              _renderTasaHistorialTag();
            }
          }
        });
      }
    })();
    // Materializar intereses de todas las cajitas al arrancar la app.
    // Así la fecha base nunca queda muy atrás y los redondeos acumulados
    // respecto a Nu son mínimos (máx. 1 día de diferencia).
    (S.cajitas||[]).forEach(c=>{ if(typeof materializarIntereses==='function') materializarIntereses(c); });
    refresh(); applyModulos();
    poblarCatSelect('gv_cat',getCatsVar());
    poblarCatSelect('gf_c',getCatsFijo());
    _initEventListeners();
    _injectErrorSpans();
    verificarVencimientosCDT();
  }

  // ── Diagnóstico: consultar el log de errores de conexión de Firestore ─────
  // Uso desde la consola del navegador: _verSyncErrors()
  // Devuelve los últimos errores de onSnapshot (ver handler de error arriba),
  // con timestamp, código de error de Firestore y mensaje. Útil para
  // confirmar si volvió el problema de conexión sin tener que reproducirlo
  // en vivo con la consola abierta.
  window._verSyncErrors = function() {
    try {
      const log = JSON.parse(localStorage.getItem('mf_syncErrors') || '[]');
      return log.map(e => ({ cuando: new Date(e.t).toLocaleString('es-CO'), code: e.code, msg: e.msg }));
    } catch(_) { return []; }
  };

  // ── Cargar datos desde Firestore con escucha en tiempo real ───────────────
  // Usamos onSnapshot en lugar de getDoc para que cualquier cambio desde otro
  // dispositivo o pestaña se refleje automáticamente sin recargar la página.
  let _unsubscribeSnapshot = null; // Para poder cancelar el listener si hace falta

  window._fbLoadData = function() {
    if(!window._fbUser || !window._fb) return;
    const {db, doc, onSnapshot} = window._fb;
    const docRef = doc(db, 'usuarios', window._fbUser.uid, 'data', 'finanzas');

    // Cancelar listener anterior si existía (ej: re-login)
    if(_unsubscribeSnapshot) { _unsubscribeSnapshot(); _unsubscribeSnapshot = null; }

    // Restaurar _lastSavedAt desde localStorage para sobrevivir recargas.
    // Esto evita que al recargar la página, un snapshot del servidor con
    // timestamp reciente sobreescriba datos que nosotros mismos acabamos de guardar.
    if(!window._lastSavedAt) {
      try {
        const saved = localStorage.getItem('mf_lastSavedAt');
        if(saved) window._lastSavedAt = parseInt(saved, 10);
      } catch(_){}
    }

    // (docs/auditoria-tecnica.md #4 — reestructuración del arranque, sesión
    // posterior). Antes: si la primera entrega venía del caché local
    // (fromCache=true), NO se pintaba nada — se esperaba hasta 8s la
    // confirmación del servidor "para no mostrar datos obsoletos" (ver
    // CHANGELOG.md#arranque). En la práctica esos 8s eran casi siempre
    // puro spinner: el caché de persistentLocalCache() es el mismo
    // dispositivo releyendo su propio último guardado (setDoc), así que
    // casi nunca es "obsoleto" — y aunque lo fuera, un snapshot del
    // servidor con datos más nuevos sigue llegando después y se reconcilia
    // igual que ya reconciliábamos actualizaciones en tiempo real de otro
    // dispositivo (misma rama `remoteTs > localTs + 5000` de abajo).
    //
    // _firstLoad: true hasta que cerramos la "primera carga" con datos
    // confirmados del servidor (o con error/sin conexión).
    // _firstPaintDone: true en cuanto mostramos la app por primera vez —
    // separado de _firstLoad porque ahora pueden llegar DOS eventos
    // "primera carga" (caché, después servidor): el primero pinta y llama
    // _finishFirstLoad() (inicializa listeners, UNA sola vez); si llega un
    // segundo con datos del servidor, solo debe reconciliar sin volver a
    // inicializar nada — mismo tipo de bug que ya se vio antes con
    // _initEventListeners() duplicando listeners si se llama dos veces.
    let _firstLoad = true;
    let _firstPaintDone = false;

    _unsubscribeSnapshot = onSnapshot(docRef,
      { includeMetadataChanges: true },
      (snap) => {
        const fromCache = snap.metadata.fromCache;
        const hasPendingWrites = snap.metadata.hasPendingWrites;

        // Si tenemos escrituras locales pendientes Y la app ya está corriendo,
        // es un eco de nuestro propio guardado → ignorar para no hacer refresh
        // innecesario y no crear bucle.
        // CRÍTICO: durante _firstLoad NO ignorar — el celular que nunca abrió la app
        // no tiene caché local. Si el servidor manda el snapshot con hasPendingWrites
        // (porque otro dispositivo acaba de guardar) y lo ignoramos, el celular se
        // queda sin datos y muestra todo en cero.
        if(hasPendingWrites && !_firstLoad) return;
        // Si hay una importación en curso, ignorar snapshots de Firestore
        // para evitar que los datos viejos de la nube pisen los recién importados.
        if(window._importing && !_firstLoad) return;

        if(_firstLoad) {
          _applyCloudData(snap);
          if(!_firstPaintDone) {
            // Primer pintado real — con lo que haya llegado primero (caché
            // o servidor). Esto es lo que baja el LCP: ya no se espera.
            _firstPaintDone = true;
            _finishFirstLoad();
          } else if(!fromCache) {
            // Ya pintamos con caché; esto es la confirmación del servidor
            // llegando después. Si trajo algo distinto ya se aplicó arriba
            // (_applyCloudData) — solo falta reflejarlo sin re-inicializar
            // listeners (_initAppUI ya corrió una vez, en el pintado de arriba).
            (window.S&&window.S.cajitas||[]).forEach(c=>{ if(typeof materializarIntereses==='function') materializarIntereses(c); });
            if(window._dataLoaded) {
              load(); refresh();
              if(window.applyModulos) applyModulos();
              setSyncStatus('ok', 'Sincronizado con Firebase');
            }
          }
          // Solo cerramos "primera carga" con datos confirmados del servidor
          // (fromCache=false) — si lo que acabamos de pintar fue caché,
          // seguimos esperando esa confirmación en la próxima entrega.
          if(!fromCache) _firstLoad = false;
        } else {
          // Actualización en tiempo real desde otro dispositivo/pestaña.
          // Solo aplicar si los datos de la nube son más nuevos que los locales.
          // Esto evita que un dispositivo lento pise cambios recientes de otro.
          if(!snap.exists()) return;
          const remoteData = snap.data();
          const remoteTs = remoteData.updatedAt || 0;
          const localTs = window._lastSavedAt || 0;

          // Si los datos remotos son más nuevos que lo que guardamos por última
          // vez (con margen de 5s para latencia de red y desfase de relojes), aplicar la actualización.
          if(remoteTs > localTs + 5000) {
            console.log('[Sync] Datos más nuevos del servidor — aplicando actualización en tiempo real.');
            _applyCloudData(snap);
            // Materializar intereses antes de renderizar para minimizar diferencia con Nu
            (window.S&&window.S.cajitas||[]).forEach(c=>{ if(typeof materializarIntereses==='function') materializarIntereses(c); });
            // Re-renderizar la UI sin reinicializar event listeners
            if(window._dataLoaded) {
              load();
              refresh();
              if(window.applyModulos) applyModulos();
              setSyncStatus('ok', 'Sincronizado · ' + new Date().toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'}));
              if(window.toast) window.toast('Datos actualizados desde otro dispositivo', 'info', 3000);
            }
          }
        }
      },
      (error) => {
        console.error('[Sync] Error en onSnapshot:', error);
        setSyncStatus('error', 'Error de conexión — reintentando…');
        // Registro persistente en localStorage (sobrevive a cerrar la consola
        // y a recargar la página) — para poder confirmar más tarde si el
        // problema de conexión de Firestore reapareció (ver
        // auditoria-tecnica.md, cambio a experimentalAutoDetectLongPolling)
        // sin depender de tener la consola abierta justo en el momento en
        // que pasa. Clave con prefijo 'mf_' a propósito: así queda incluida
        // en la limpieza de _limpiarStorageLocal() si el usuario borra su
        // cuenta. Se guardan solo los últimos 20 para no crecer sin límite.
        try {
          const log = JSON.parse(localStorage.getItem('mf_syncErrors') || '[]');
          log.push({ t: Date.now(), code: error.code || null, msg: error.message || String(error) });
          while (log.length > 20) log.shift();
          localStorage.setItem('mf_syncErrors', JSON.stringify(log));
        } catch(_){}
        // Si ni el caché ni el servidor entregaron nada todavía, no dejar a
        // la persona colgada en el spinner — arrancar igual con S por defecto.
        if(!_firstPaintDone) { _firstPaintDone = true; _finishFirstLoad(); }
        _firstLoad = false;
      }
    );
  };

  // Aplica datos de un snapshot de Firestore a window.S
  function _applyCloudData(snap) {
    if(snap.exists() && snap.data().payload) {
      try {
        const cloudData = JSON.parse(snap.data().payload);
        console.log('[Sync] _applyCloudData: keys=' + Object.keys(cloudData).length + ' updatedAt=' + snap.data().updatedAt);
        if(Object.keys(cloudData).length === 0) {
          // Nube vacía — no pisar S con objeto vacío, dejar los valores por defecto de S intactos.
          console.warn('[Sync] Nube vacía (sin payload real) — manteniendo estado por defecto.');
        } else {
          Object.assign(window.S, cloudData);
          // La migración y auto-sanación de tarjetas de crédito ahora vive en
          // tcNormalizarTarjetas(), que se ejecuta en cada refresh() — no hace
          // falta un parche puntual aquí.
        }
      } catch(e) {
        console.error('[Sync] Error al parsear datos de la nube:', e);
      }
    } else {
      console.warn('[Sync] _applyCloudData: snap.exists()=' + snap.exists() + ' — sin datos en nube.');
    }
  }

  // Finaliza la primera carga: muestra la app e inicializa la UI
  function _finishFirstLoad() {
    document.getElementById('fb-loading-screen').style.display = 'none';
    // PROTECCIÓN: marcar que los datos ya se cargaron correctamente.
    // _fbSaveToCloud no guardará nada hasta que esta bandera esté activa.
    window._dataLoaded = true;
    _initAppUI();
    // Snapshot diario: guardar patrimonio del día aunque no haya otros cambios.
    // Esto llena la gráfica de patrimonio sin que el usuario tenga que hacer nada.
    if(typeof snapshotPatrimonio === 'function'){
      snapshotPatrimonio();
      if(typeof window._fbSaveToCloud === 'function') window._fbSaveToCloud();
    }
    // Resumen de cierre de mes: detectar si cambió el mes desde la última apertura
    _checkCierreMes();
    setSyncStatus('ok', 'Sincronizado con Firebase');
    // Notificar a módulos inline que los datos están listos.
    // Los scripts inline no pueden sobrescribir window._fbLoadData de forma confiable
    // porque este módulo (type="module") se ejecuta DESPUÉS que ellos, sobreescribiendo
    // cualquier wrapper que hayan puesto. El evento 'appDataLoaded' es el canal correcto.
    window.dispatchEvent(new CustomEvent('appDataLoaded'));
  }

  // ── Resumen de cierre de mes ─────────────────────────────────────────────
  function _checkCierreMes(){
    if(!window.S || !window._dataLoaded) return;
    const mesHoy = typeof mesActual === 'function' ? mesActual() : '';
    if(!mesHoy) return;
    const ultimoMesVisto = window.S._ultimoMesVisto || '';
    // Guardar el mes actual para la próxima apertura
    window.S._ultimoMesVisto = mesHoy;
    // Solo mostrar resumen si había un mes anterior registrado y es diferente al actual
    if(!ultimoMesVisto || ultimoMesVisto === mesHoy) return;
    // Calcular datos del mes que acaba de cerrar
    const fmt = window.fmt || (x=>x.toLocaleString('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}));
    const S = window.S;
    const mesK = ultimoMesVisto;
    const pagosGF = S.pagosGastosFijos || {};
    const gvMes = (S.gastosVar||[]).filter(g=>(g.fecha||'').startsWith(mesK)&&!_esGastoVarNoReal(g)).reduce((a,g)=>a+(g.monto||0),0);
    const gfMes = (S.gastosFijos||[]).reduce((a,g)=>pagosGF[g.id+'_'+mesK]?a+(g.monto||0):a,0);
    const totalGastos = gvMes + gfMes;
    // Patrimonio al cierre (último registro del mes anterior en el historial)
    const hist = S.patrimonioHistorial || [];
    const snapMes = [...hist].filter(h=>(h.fecha||'').startsWith(mesK)).pop();
    const patrimonioMes = snapMes ? snapMes.valor : null;
    const [anioM, mesM] = mesK.split('-').map(Number);
    const nombreMes = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][mesM-1];
    // Construir mensaje
    let lineas = [`<b>Resumen de ${nombreMes} ${anioM}</b>`];
    if(patrimonioMes != null) lineas.push(`Patrimonio al cierre: <b>${fmt(patrimonioMes)}</b>`);
    if(totalGastos > 0) lineas.push(`Total gastado: <b>${fmt(totalGastos)}</b>`);
    else lineas.push('Sin gastos registrados ese mes.');
    if(typeof toast === 'function') toast(lineas.join('<br>'), 'info', 7000);
  }

  // ── Login con Google ──────────────────────────────────────────────────────
  window._fbSignIn = async function() {
    if(!window._fb) return;
    const {auth, provider, signInWithPopup} = window._fb;
    try {
      await signInWithPopup(auth, provider);
      // onAuthStateChanged se encarga del resto
    } catch(e) {
      if(e.code !== 'auth/popup-closed-by-user') {
        console.error('Error al iniciar sesión:', e.code, e.message);
        // Mensaje claro para el usuario según el tipo de error — el mensaje crudo de
        // Firebase (ej. "Firebase: Error (auth/internal-error).") no dice nada útil.
        const MENSAJES_AUTH = {
          'auth/popup-blocked': 'El navegador bloqueó la ventana de inicio de sesión. Revisa que no esté bloqueando pop-ups para este sitio e intenta de nuevo.',
          'auth/cancelled-popup-request': 'Se abrió más de una ventana de inicio de sesión a la vez. Intenta de nuevo.',
          'auth/network-request-failed': 'No hay conexión a internet. Revisa tu red e intenta de nuevo.',
          'auth/internal-error': 'No se pudo completar el inicio de sesión con Google. Intenta de nuevo en unos segundos.',
          'auth/unauthorized-domain': 'Este dominio no está autorizado para iniciar sesión. Contacta al administrador.',
        };
        const msg = MENSAJES_AUTH[e.code] || 'No se pudo iniciar sesión. Intenta de nuevo en unos segundos.';
        if(typeof toast === 'function') toast(msg, 'err', 5000);
      }
    }
  };

  // ── Cerrar sesión ─────────────────────────────────────────────────────────
  window._fbSignOut = async function() {
    const ok = await dialogo('Cerrar sesión', '¿Seguro que quieres salir? Tus datos quedan guardados en la nube.', 'Cerrar sesión', true);
    if(!ok) return;
    if(!window._fb) return;
    // Cancelar cualquier guardado pendiente antes de salir para evitar
    // que un timer de debounce guarde datos vacíos o corruptos post-signout.
    // Ambos timers se exponen en window para que este módulo pueda cancelarlos.
    clearTimeout(window._debounceTimer);     // timer de debounceSave (script global)
    clearTimeout(window._fbSaveTimer);       // timer de _fbSaveToCloud (módulo Firebase)
    // Guardar una última vez de forma inmediata si hay datos válidos
    if(window._fbUser && window.S) {
      try {
        const {db, doc, setDoc} = window._fb;
        const data = JSON.parse(JSON.stringify(window.S));
        const signOutTs = Date.now();
        try { localStorage.setItem('mf_lastSavedAt', String(signOutTs)); } catch(_){}
        await setDoc(
          doc(db, 'usuarios', window._fbUser.uid, 'data', 'finanzas'),
          { payload: JSON.stringify(data), updatedAt: signOutTs }
        );
      } catch(e) {
        console.warn('Error en guardado final antes de cerrar sesión:', e);
        // No seguir con el cierre de sesión: si este guardado no llegó a Firestore,
        // cerrar sesión igual arriesga perder en silencio el último cambio financiero.
        if(typeof toast === 'function') toast('No se pudo guardar el último cambio en la nube. Revisa tu conexión e intenta cerrar sesión de nuevo.', 'err', 6000);
        return;
      }
    }
    // Cancelar el listener de tiempo real para evitar actualizaciones fantasma tras logout
    if(typeof _unsubscribeSnapshot === 'function') {
      _unsubscribeSnapshot();
      _unsubscribeSnapshot = null;
    }
    // window._fbCacheFallbackTimer ya no se crea en ningún lado (ver
    // _fbLoadData, docs/auditoria-tecnica.md #4) — esta línea queda
    // inofensiva a propósito (el `if` nunca entra) en vez de borrarla, para
    // no tocar código de limpieza de sesión sin necesidad real.
    if(window._fbCacheFallbackTimer) { clearTimeout(window._fbCacheFallbackTimer); window._fbCacheFallbackTimer = null; }
    // Bloquear futuros guardados limpiando el usuario ANTES del signOut
    window._dataLoaded = false;
    window._lastSavedAt = 0;
    window._fbUser = null;
    const {auth, signOut} = window._fb;
    await signOut(auth);
    location.reload();
  };

  // ── Eliminar cuenta (borra todos los datos y cierra sesión) ────────────────
  window._abrirEliminarCuenta = function() {
    const input = document.getElementById('del-account-input');
    const btn = document.getElementById('del-account-confirm');
    input.value = '';
    btn.disabled = true;
    document.getElementById('del-account-overlay').classList.add('open');
    setTimeout(() => input.focus(), 50);
  };
  window._cerrarEliminarCuenta = function() {
    document.getElementById('del-account-overlay').classList.remove('open');
  };

  // Wiring del overlay "Eliminar cuenta" (docs/auditoria-tecnica.md #4,
  // paso 2 de la reestructuración de arranque). Este bloque corría a nivel
  // superior del módulo, tocando el DOM sin null-checks (`document.
  // getElementById('del-account-overlay').addEventListener(...)` directo).
  // Con este archivo cargando <script type="module"> sin `async`, eso era
  // seguro porque el navegador no lo ejecuta hasta terminar de parsear todo
  // el documento. Al pasar a `async` (mismo cambio ya hecho en
  // firebase-init.js) esa garantía desaparece: si el módulo llega a
  // ejecutar antes de que el parser llegue a estos elementos, cualquiera
  // de esos `getElementById(...)` devuelve `null` y el `.addEventListener`
  // encadenado tira un TypeError — que corta la ejecución del resto del
  // archivo completo, incluyendo el registro de Events('authgate',...) de
  // más abajo. Se envuelve con el mismo guard de document.readyState que
  // ya usa firebase-init.js, más null-checks por las dudas.
  function _wireDeleteAccountOverlay() {
    const overlay = document.getElementById('del-account-overlay');
    const input   = document.getElementById('del-account-input');
    const confirm = document.getElementById('del-account-confirm');
    if (overlay) {
      overlay.addEventListener('click', function(e){
        if(e.target === this) window._cerrarEliminarCuenta();
      });
    }
    if (input) {
      input.addEventListener('input', function(){
        if (confirm) confirm.disabled = (this.value.trim() !== 'ELIMINAR');
      });
      input.addEventListener('keydown', function(e){
        if(e.key === 'Enter' && this.value.trim() === 'ELIMINAR') window._fbDeleteAccount();
      });
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _wireDeleteAccountOverlay, { once: true });
  } else {
    _wireDeleteAccountOverlay();
  }

  // Limpia todo el almacenamiento local propio de la app (claves 'mf_*')
  function _limpiarStorageLocal() {
    try {
      const keys = [];
      for(let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if(k && k.startsWith('mf_')) keys.push(k);
      }
      keys.forEach(k => localStorage.removeItem(k));
    } catch(_){}
    try { sessionStorage.clear(); } catch(_){}
  }

  window._fbDeleteAccount = async function() {
    const input = document.getElementById('del-account-input');
    if(input.value.trim() !== 'ELIMINAR') return;
    if(!window._fb || !window._fbUser) return;

    const btn = document.getElementById('del-account-confirm');
    const textoOriginal = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Eliminando…';

    const {auth, db, doc, deleteDoc, deleteUser, reauthenticateWithPopup, provider, signOut} = window._fb;
    const uid = window._fbUser.uid;

    // Cancelar guardados/listeners pendientes para que nada reescriba datos a mitad de la eliminación
    clearTimeout(window._debounceTimer);
    clearTimeout(window._fbSaveTimer);
    if(typeof _unsubscribeSnapshot === 'function') {
      _unsubscribeSnapshot();
      _unsubscribeSnapshot = null;
    }
    // Ver nota equivalente en _fbSignOut — código de limpieza inofensivo,
    // dejado a propósito.
    if(window._fbCacheFallbackTimer) { clearTimeout(window._fbCacheFallbackTimer); window._fbCacheFallbackTimer = null; }
    window._dataLoaded = false;

    try {
      // 1) Borrar el documento de datos en Firestore
      await deleteDoc(doc(db, 'usuarios', uid, 'data', 'finanzas'));
      // 2) Borrar el usuario de Firebase Auth
      await deleteUser(auth.currentUser);
    } catch(e) {
      // Si Firebase exige un login reciente para borrar la cuenta, se re-autentica y se reintenta
      if(e && e.code === 'auth/requires-recent-login') {
        try {
          await reauthenticateWithPopup(auth.currentUser, provider);
          await deleteDoc(doc(db, 'usuarios', uid, 'data', 'finanzas'));
          await deleteUser(auth.currentUser);
        } catch(e2) {
          btn.disabled = false;
          btn.textContent = textoOriginal;
          if(typeof toast === 'function') toast('No se pudo eliminar la cuenta: ' + (e2.message || e2), 'err');
          return;
        }
      } else {
        btn.disabled = false;
        btn.textContent = textoOriginal;
        if(typeof toast === 'function') toast('No se pudo eliminar la cuenta: ' + (e.message || e), 'err');
        return;
      }
    }

    // 3) Limpiar todo rastro local y cerrar sesión
    window._lastSavedAt = 0;
    window._fbUser = null;
    _limpiarStorageLocal();
    try { await signOut(auth); } catch(_){}
    location.reload();
  };

  // Registro bajo Events (docs/auditoria-tecnica.md #1): estas tres funciones
  // son núcleo de sesión (compartidas más allá de una sola pantalla), pero los
  // botones que las disparan sí son exclusivos de esta pantalla de login/
  // eliminar-cuenta — mismo criterio ya usado con config:signOut, que también
  // envuelve una función de auth compartida bajo el namespace del botón que
  // la llama, no de dónde vive la función.
  //
  // Con reintento (docs/auditoria-tecnica.md #4, paso 2): `Events` lo define
  // js/core/events.js, un <script> clásico. El guard `typeof Events !==
  // 'undefined'` ya existía porque en algún momento este archivo podía
  // ejecutar antes de que events.js cargara — pero antes, sin `async`, el
  // navegador garantizaba que TODO el JS clásico (incluyendo events.js) ya
  // había corrido antes de que este módulo arrancara, así que el guard
  // nunca fallaba en la práctica. Con `async`, esa garantía ya no existe: si
  // falla el guard, antes simplemente no se registraba nada y quedaba así
  // para siempre (el botón de login se habilitaba solo por el timeout de
  // 8s de firebase-init.js, pero sin listener real detrás — clickearlo no
  // hacía nada). Mismo patrón de reintento que ya usa este mismo archivo
  // para el overlay de eliminar cuenta, y que ya usa pin-bio.js para su
  // propio hook de refresh().
  function _registrarEventosAuthgate() {
    if(typeof Events === 'undefined' || typeof Events.registerAll !== 'function') return false;
    Events.registerAll('authgate', {
      signIn: window._fbSignIn,
      cerrarEliminarCuenta: window._cerrarEliminarCuenta,
      eliminarCuenta: window._fbDeleteAccount,
    });
    // Confirmado: ya se puede usar el botón de login (ver el timeout de
    // seguridad en el bloque de arriba, junto a onAuthStateChanged).
    window._authgateReady = true;
    clearTimeout(window._authgateReadyTimeout);
    document.querySelectorAll('[data-action^="authgate:"]').forEach(function(b){ b.disabled = false; });
    return true;
  }
  if (!_registrarEventosAuthgate()) {
    const _tAuthgate = setInterval(function() {
      if (_registrarEventosAuthgate()) clearInterval(_tAuthgate);
    }, 200);
  }
