// Sistema de PIN + biometría (WebAuthn) — extraído de index.html (era
// <script type="module"> inline). Ver auditoria-tecnica.md #2.
//
// import de waitFor (js/core/wait-for-module.js — versión ES module
// independiente de js/core/wait-for.js, ver ese archivo para el porqué):
// reemplaza los dos reintentos manuales con setInterval que tenía este
// archivo (registro de Events('pin',...) y el hook de refresh(), más
// abajo). Se usa `import` en vez de asumir un global porque este archivo
// carga como `type="module" async`, sin garantía de orden frente a ningún
// <script defer>. Ver CHANGELOG.md#infraestructura--seguridad.
import { waitFor } from './wait-for-module.js';
// import de hookGlobal (js/core/hook-global-module.js — versión ES module
// de js/core/hook-global.js, mismo motivo/mismo patrón que waitFor arriba):
// reemplaza el wrap manual de window.refresh() de más abajo, que tenía dos
// ramas casi idénticas (refresh ya existía vs. había que esperarlo con
// waitFor) — la misma duplicación que hookGlobal() ya resuelve para
// gastos-fijos-progress.js/mejoras.js.
import { hookGlobal } from './hook-global-module.js';

/* ================================================================
   PIN + BIOMETRÍA — Sistema de bloqueo con PIN de 4 dígitos y
   soporte opcional para WebAuthn (huella dactilar / Face ID).
   Punto de entrada: window._pinGate() llamado por onAuthStateChanged.
   ================================================================ */
(function() {
  const PIN_KEY  = 'mf_pin';
  const BIO_KEY  = 'mf_bio_enabled';   // 'true' si el usuario activó biometría
  const CRED_KEY = 'mf_bio_cred';      // credentialId (base64url) guardado
  const VER_KEY  = 'mf_bio_ver';       // versión de la credencial guardada (ver BIO_VERSION)
  // Versión 2 (2026-10-29): credencial NO descubrible (ver _bioRegister). Las de la versión 1 eran passkeys (residentKey 'preferred'):
  // el gestor de contraseñas las guardaba y las mostraba al desbloquear. Una huella activada con la versión 1 se trata como
  // desactivada: Configuración vuelve a ofrecer «Activar huella» y la nueva credencial ya no pasa por el gestor.
  const BIO_VERSION = '2';

  let _pinBuf  = '';
  let _pinMode = 'unlock'; // 'unlock' | 'set-new' | 'confirm-new' | 'verify' (confirmar una acción destructiva)
  let _verifyResolve = null; // promesa pendiente de window._pinVerificar()
  let _pinTemp = '';

  // ── Storage ──────────────────────────────────────────────────────
  function _getPin()    { try { return localStorage.getItem(PIN_KEY)||''; }catch(e){return '';} }
  function _setPin(v)   { try { localStorage.setItem(PIN_KEY,v); }catch(e){} }
  function _delPin()    { try { localStorage.removeItem(PIN_KEY); }catch(e){} }
  function _bioEnabled(){ try { return localStorage.getItem(BIO_KEY)==='true' && localStorage.getItem(VER_KEY)===BIO_VERSION; }catch(e){return false;} }
  function _setBioEnabled(v){ try { localStorage.setItem(BIO_KEY, v?'true':'false'); if(v) localStorage.setItem(VER_KEY, BIO_VERSION); else localStorage.removeItem(VER_KEY); }catch(e){} }
  function _getCredId() { try { return localStorage.getItem(CRED_KEY)||''; }catch(e){return '';} }
  function _setCredId(v){ try { localStorage.setItem(CRED_KEY,v); }catch(e){} }
  function _delCred()   { try { localStorage.removeItem(CRED_KEY); localStorage.removeItem(BIO_KEY); localStorage.removeItem(VER_KEY); }catch(e){} }

  // ── WebAuthn helpers ─────────────────────────────────────────────
  function _b64urlToUint8(b64) {
    const pad = b64.replace(/-/g,'+').replace(/_/g,'/');
    const bin = atob(pad);
    return Uint8Array.from(bin, c=>c.charCodeAt(0));
  }
  function _uint8ToB64url(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)))
      .replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
  }
  function _bioAvailable() {
    return !!(window.PublicKeyCredential &&
              typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function');
  }

  // Registrar nueva credencial biométrica.
  // Es un candado LOCAL de este dispositivo (la app no tiene servidor que verifique la firma), así que no necesita una passkey:
  //  · residentKey 'discouraged' + requireResidentKey false → credencial NO descubrible: queda en el sensor/enclave del dispositivo
  //    y no se sincroniza ni se ofrece en el gestor de contraseñas (Google Password Manager, iCloud, etc.). Una passkey
  //    (descubrible) era lo que abría el gestor.
  //  · user.id aleatorio y nombre genérico: no se expone el uid ni el correo de la cuenta.
  //  · hints 'client-device': pide directamente el sensor de este equipo (sin ofrecer llave USB ni teléfono por QR).
  async function _bioRegister() {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const options = {
      challenge,
      rp: { name: 'Mis Finanzas' },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'Mis Finanzas', displayName: 'Mis Finanzas' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged', requireResidentKey: false },
      attestation: 'none',
      hints: ['client-device'],
      timeout: 60000,
    };
    const cred = await navigator.credentials.create({ publicKey: options });
    _setCredId(_uint8ToB64url(cred.rawId));
    return true;
  }

  // Autenticar con la credencial guardada.
  // Sin credencial guardada NO se pide nada: un allowCredentials vacío le deja al navegador elegir entre las passkeys del gestor.
  async function _bioAuthenticate() {
    const credId = _getCredId();
    if(!credId) throw new Error('sin credencial biométrica');
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const options = {
      challenge,
      allowCredentials: [{ type: 'public-key', id: _b64urlToUint8(credId) }],
      userVerification: 'required',
      hints: ['client-device'],
      timeout: 60000,
    };
    await navigator.credentials.get({ publicKey: options });
    return true;
  }

  // ── UI ───────────────────────────────────────────────────────────
  function _showPin(mode, title, sub) {
    _pinMode = mode;
    _pinBuf  = '';
    document.getElementById('pin-title').textContent = title||'Ingresa tu PIN';
    document.getElementById('pin-sub').textContent   = sub  ||'Mis Finanzas';
    document.getElementById('pin-forgot-btn').style.display = mode==='unlock' ? '' : 'none';
    const cancelBtn = document.getElementById('pin-cancel-btn');
    if(cancelBtn) cancelBtn.style.display = mode==='verify' ? '' : 'none';
    // Confirmar una acción puede pedirse con un overlay encima (p. ej. «Eliminar cuenta»): el PIN va por delante de todo.
    document.getElementById('pin-screen').classList.toggle('pin-verificar', mode==='verify');
    _dots();
    document.getElementById('pin-screen').classList.add('open');
    // Mostrar botón biométrico sólo en modo unlock si está habilitado y hay PIN
    const bioBtn = document.getElementById('pin-bio-btn');
    if(bioBtn) {
      const showBio = mode==='unlock' && _bioEnabled() && _getCredId() && _bioAvailable();
      bioBtn.style.display = showBio ? 'flex' : 'none';
      if(showBio) _updateBioLabel();
    }
  }
  function _hidePin() {
    document.getElementById('pin-screen').classList.remove('open', 'pin-verificar');
    _setBioState('idle');
  }
  function _dots(err) {
    for(let i=0;i<4;i++){
      const d=document.getElementById('pd'+i);
      d.classList.toggle('filled', i<_pinBuf.length);
      d.classList.toggle('error', !!err);
    }
  }
  function _shake() {
    _dots(true);
    setTimeout(()=>{ _pinBuf=''; _dots(false); }, 430);
  }

  // ── Estado visual del botón biométrico ───────────────────────────
  function _setBioState(state) {
    const icon  = document.getElementById('pin-bio-icon');
    const label = document.getElementById('pin-bio-label');
    if(!icon||!label) return;
    icon.className  = 'pin-bio-icon' + (state!=='idle' ? ' '+state : '');
    if(state==='scanning') {
      icon.style.animation = 'bioScan .8s ease-in-out infinite';
      label.textContent = 'Verificando…';
    } else if(state==='success') {
      icon.style.animation = '';
      label.textContent = '¡Listo!';
    } else if(state==='error') {
      icon.style.animation = '';
      label.textContent = 'Intenta de nuevo';
      setTimeout(()=>_setBioState('idle'), 2000);
    } else {
      icon.style.animation = '';
      _updateBioLabel();
    }
  }
  function _updateBioLabel() {
    const label = document.getElementById('pin-bio-label');
    if(!label) return;
    // Intentar detectar si es Face ID o huella (heurística por plataforma)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    label.textContent = isIOS ? 'Face ID / Huella' : 'Usar huella';
  }

  // ── Teclado ───────────────────────────────────────────────────────
  window._pinKey = function(d) {
    if(_pinBuf.length>=4) return;
    _pinBuf += d;
    _dots();
    if(_pinBuf.length===4) setTimeout(_submit, 80);
  };
  window._pinDel = function() {
    if(_pinBuf.length>0){ _pinBuf=_pinBuf.slice(0,-1); _dots(); }
  };

  // Teclado del computador: dígitos (fila superior y teclado numérico) escriben el PIN, Retroceso borra un dígito y Escape
  // cancela una confirmación. Solo actúa con la pantalla del PIN abierta y sin el mini-diálogo encima.
  document.addEventListener('keydown', function(e) {
    const pantalla = document.getElementById('pin-screen');
    if(!pantalla || !pantalla.classList.contains('open')) return;
    const dlg = document.getElementById('pin-dialog');
    if(dlg && dlg.style.display === 'flex') return;
    if(e.ctrlKey || e.metaKey || e.altKey) return;
    if(/^[0-9]$/.test(e.key)) { e.preventDefault(); window._pinKey(e.key); }
    else if(e.key === 'Backspace') { e.preventDefault(); window._pinDel(); }
    else if(e.key === 'Escape' && _pinMode === 'verify') { e.preventDefault(); window._pinCancelar(); }
  });

  // ── Confirmar una acción destructiva con el PIN ──────────────────
  // Devuelve una promesa: true si se escribió el PIN correcto; false si se canceló (botón o Escape). Con PIN incorrecto la
  // pantalla se sacude y se puede reintentar o cancelar: la acción solo sigue con true. Sin PIN activo devuelve true
  // enseguida (todo se comporta como antes). Las acciones lo llaman vía pedirPinAntesDe() (core-state.js).
  window._pinVerificar = function(motivo) {
    return new Promise(res => {
      if(!_getPin()) { res(true); return; }
      if(_verifyResolve) { res(false); return; } // ya hay una confirmación abierta
      _verifyResolve = res;
      _showPin('verify', 'Confirma con tu PIN', motivo || 'Esta acción borra datos');
    });
  };
  function _terminarVerificacion(ok) {
    const res = _verifyResolve;
    _verifyResolve = null;
    _hidePin();
    if(res) res(ok);
  }
  window._pinCancelar = function() { if(_pinMode === 'verify') _terminarVerificacion(false); };

  // ── Trigger biométrico (botón en pantalla de unlock) ─────────────
  window._pinBioTrigger = async function() {
    if(!_bioEnabled()||!_getCredId()) return;
    _setBioState('scanning');
    try {
      await _bioAuthenticate();
      _setBioState('success');
      setTimeout(()=>{ _hidePin(); _launchApp(); }, 350);
    } catch(e) {
      console.warn('[Bio] Auth failed:', e.name, e.message);
      _setBioState('error');
    }
  };

  // ── Mini-diálogo interno ─────────────────────────────────────────
  function _pinDialogo(titulo, msg, btnOkText) {
    return new Promise(res => {
      const overlay = document.getElementById('pin-dialog');
      document.getElementById('pin-dialog-title').textContent = titulo;
      document.getElementById('pin-dialog-msg').textContent = msg;
      document.getElementById('pin-dialog-confirm').textContent = btnOkText;
      overlay.style.display = 'flex';
      function cleanup(val) {
        overlay.style.display = 'none';
        document.getElementById('pin-dialog-confirm').removeEventListener('click', onOk);
        document.getElementById('pin-dialog-cancel').removeEventListener('click', onCancel);
        res(val);
      }
      function onOk() { cleanup(true); }
      function onCancel() { cleanup(false); }
      document.getElementById('pin-dialog-confirm').addEventListener('click', onOk);
      document.getElementById('pin-dialog-cancel').addEventListener('click', onCancel);
    });
  }

  window._pinOlvide = async function() {
    const ok = await _pinDialogo('\u00bfOlvidaste el PIN?', 'Se cerrar\u00e1 la sesi\u00f3n y podr\u00e1s volver a entrar con Google.', 'Cerrar sesi\u00f3n');
    if(!ok) return;
    if(!window._fb) return;
    clearTimeout(window._fbSaveTimer);
    _delPin();
    _delCred();
    window._fbUser = null;
    const {auth, signOut} = window._fb;
    await signOut(auth);
    location.reload();
  };

  function _submit() {
    const stored = _getPin();
    if(_pinMode==='unlock') {
      if(_pinBuf===stored) { _hidePin(); _launchApp(); }
      else _shake();
    } else if(_pinMode==='verify') {
      if(_pinBuf===stored) _terminarVerificacion(true);
      else _shake();
    } else if(_pinMode==='set-new') {
      _pinTemp = _pinBuf;
      _showPin('confirm-new','Confirma el PIN','Repite los 4 dígitos');
    } else if(_pinMode==='confirm-new') {
      if(_pinBuf===_pinTemp) {
        _setPin(_pinBuf);
        _hidePin();
        if(window.toast) toast('PIN activado','ok');
        _renderBtn();
        setTimeout(_renderBtn, 100);
        if(window._pendingLaunch) { window._pendingLaunch=false; _launchApp(); }
      } else {
        _shake();
        setTimeout(()=>_showPin('set-new','Elige un PIN de 4 dígitos','Los PINs no coinciden, intenta de nuevo'), 450);
      }
    }
  }

  // ── Punto de entrada ─────────────────────────────────────────────
  window._pinGate = function() {
    const stored = _getPin();
    if(stored) {
      document.getElementById('fb-loading-screen').style.display='none';
      _showPin('unlock','Ingresa tu PIN','Mis Finanzas');
      // Auto-trigger biometría si está activa (sin que el usuario toque nada)
      if(_bioEnabled() && _getCredId() && _bioAvailable()) {
        setTimeout(window._pinBioTrigger, 400);
      }
    } else {
      _launchApp();
    }
  };

  // Chequeo de gate pendiente (docs/auditoria-tecnica.md #4, paso 2): si
  // firebase-init.js (que ya carga con `async`) resolvió el auth ANTES de
  // que este módulo cargara, dejó `window._pendingPinGate = true` y un
  // timeout de seguridad de 5s. window._pinGate() toca el DOM (vía
  // _showPin → document.getElementById('pin-screen'), etc.), así que si
  // este archivo también pasa a `async` y llega a ejecutar antes de que el
  // documento termine de parsearse, hace falta el mismo guard de
  // document.readyState que ya usa firebase-init.js.
  function _checkPendingPinGate() {
    if(window._pendingPinGate) {
      window._pendingPinGate = false;
      window._pinGate();
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _checkPendingPinGate, { once: true });
  } else {
    _checkPendingPinGate();
  }

  // `firebase-init.js` (que define window._fbLoadData) y este archivo cargan
  // ambos como `type="module" async` (ver comentarios en index.html), así que
  // no hay garantía de orden de ejecución entre los dos: si pin-bio.js
  // termina de cargar/ejecutar primero, _launchApp() puede correr antes de
  // que firebase-init.js haya llegado a definir window._fbLoadData, tronando
  // con "window._fbLoadData is not a function". Mismo criterio que el guard
  // de window._pendingPinGate de más arriba: reintentar acotado en vez de
  // asumir que ya existe.
  function _launchApp(_intentos) {
    if (typeof window._fbLoadData === 'function') {
      window._fbLoadData();
    } else if ((_intentos || 0) < 100) { // hasta ~5s (100 x 50ms)
      setTimeout(() => _launchApp((_intentos || 0) + 1), 50);
    } else {
      console.error('[pin-bio] window._fbLoadData nunca apareció tras 5s; firebase-init.js no cargó o falló.');
      if (window.toast) toast('No se pudo cargar tus datos. Recarga la página.', 'err');
    }
  }

  // ── Config desde pantalla de configuración ───────────────────────
  window._pinSetNew = function() {
    _showPin('set-new','Elige un PIN de 4 dígitos','Este PIN protegerá el acceso a la app');
    window._pendingLaunch = false;
  };
  // Borrar todos los datos (configuracion.js → borrarTodo): el PIN y la huella son locales a este
  // dispositivo y protegían datos que ya no existen, así que se quitan con ellos. _delCred() borra
  // la huella (activación y credencial); el sensor del dispositivo no se toca, solo la config de la app.
  window._pinReset = function() {
    _delPin();
    _delCred();
    _renderBtn();
  };
  window._pinDisable = async function() {
    const ok = await dialogo('Quitar PIN','¿Seguro que quieres desactivar el PIN de acceso?','Quitar PIN',true);
    if(ok && await window._pinVerificar('Para quitar el PIN de acceso')){
      _delPin();
      _delCred();
      if(window.toast) toast('PIN desactivado','ok');
      _renderBtn();
      setTimeout(_renderBtn, 100);
      _renderBioBtn();
    }
  };

  // Activar biometría desde config
  window._bioSetup = async function() {
    if(!_bioAvailable()) { if(window.toast) toast('Biometría no disponible en este dispositivo','err'); return; }
    try {
      const avail = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      if(!avail) { if(window.toast) toast('Este dispositivo no tiene sensor biométrico','err'); return; }
    } catch(e) {}
    try {
      await _bioRegister();
      _setBioEnabled(true);
      if(window.toast) toast('Huella activada','ok');
      _renderBioBtn();
    } catch(e) {
      console.warn('[Bio] Setup failed:', e.name, e.message);
      if(e.name==='NotAllowedError') {
        if(window.toast) toast('Permiso denegado','err');
      } else {
        if(window.toast) toast('No se pudo activar la biometría','err');
      }
    }
  };
  window._bioDisable = async function() {
    const ok = await dialogo('Quitar huella','¿Quieres desactivar el desbloqueo con huella?','Quitar',true);
    if(ok && await window._pinVerificar('Para quitar el desbloqueo con huella')){ _delCred(); if(window.toast) toast('Huella desactivada','ok'); _renderBioBtn(); }
  };

  // Registro bajo Events (docs/auditoria-tecnica.md #1). window._pinKey recibe
  // el dígito como argumento (data-args="[...]"" en el teclado); el resto no
  // recibe argumentos. _pinSetNew/_pinDisable/_bioSetup/_bioDisable se llaman
  // también desde el HTML generado dinámicamente en _renderBtn()/_renderBioBtn()
  // más abajo en este mismo archivo.
  //
  // Con reintento (docs/auditoria-tecnica.md #4, paso 2): mismo motivo que el
  // reintento equivalente en firebase-sync.js — el guard `typeof Events`
  // dejó de ser garantía suficiente al pasar este archivo a `async`, porque
  // ya no está asegurado que js/core/events.js (clásico) haya cargado antes.
  function _registrarEventosPin() {
    if(typeof Events === 'undefined' || typeof Events.registerAll !== 'function') return false;
    Events.registerAll('pin', {
      key: window._pinKey,
      del: window._pinDel,
      bioTrigger: window._pinBioTrigger,
      olvide: window._pinOlvide,
      cancelar: window._pinCancelar,
      setNew: window._pinSetNew,
      disable: window._pinDisable,
      bioSetup: window._bioSetup,
      bioDisable: window._bioDisable,
    });
    return true;
  }
  // Antes era un setInterval propio (ver CHANGELOG.md#infraestructura--
  // seguridad, entrada de consolidación de este patrón). _registrarEventosPin
  // ya hace el registro Y devuelve si tuvo éxito, así que sirve directo como
  // checkFn — waitFor solo lo vuelve a llamar hasta que dé true.
  if (!_registrarEventosPin()) {
    waitFor(_registrarEventosPin, () => {});
  }

  window._pinRenderBtn = _renderBtn;
  function _renderBtn() {
    const c = document.getElementById('pin-config-container');
    if(!c) return;
    const has = !!_getPin();
    c.innerHTML = has
      ? `<div class="pin-fila-btns">
           <button class="btn btn-ghost btn-sm btn-flex1" data-action="pin:setNew">Cambiar PIN</button>
           <button class="btn btn-ghost btn-sm btn-flex1 btn-peligro" data-action="pin:disable">Quitar PIN</button>
         </div>`
      : `<button class="btn btn-primary btn-sm btn-block" data-action="pin:setNew">
           Activar PIN de acceso
         </button>`;
    _renderBioBtn();
  }

  function _renderBioBtn() {
    // Mostrar card de biometría sólo si hay PIN activo y WebAuthn está disponible
    const card = document.getElementById('bio-config-card');
    const c    = document.getElementById('bio-config-container');
    if(!card||!c) return;
    const hasPIN = !!_getPin();
    const bioOk  = _bioAvailable();
    card.style.display = (hasPIN && bioOk) ? '' : 'none';
    if(!hasPIN||!bioOk) return;
    const enabled = _bioEnabled() && !!_getCredId();
    const isIOS   = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const label   = isIOS ? 'Face ID / Huella' : 'Huella dactilar';
    c.innerHTML = enabled
      ? `<button class="btn btn-ghost btn-sm btn-block btn-peligro" data-action="pin:bioDisable">Desactivar ${label}</button>`
      : `<button class="btn btn-primary btn-sm btn-block" data-action="pin:bioSetup">Activar ${label}</button>`;
  }

  // Hook en refresh para re-renderizar botones cuando se abre Config —
  // ver js/core/hook-global-module.js. Antes esto tenía dos ramas casi
  // idénticas según si window.refresh ya existía o había que esperarlo
  // con waitFor(); solo la rama de espera hacía un _renderBtn() inicial
  // apenas se enganchaba, sin esperar al próximo refresh() real. Acá se
  // llama siempre, en las dos rutas — _renderBtn()/_renderBioBtn() son
  // idempotentes (solo pintan según el estado actual de PIN/biometría),
  // así que una llamada de más no cambia nada visible, y así el botón
  // queda pintado de una desde el arranque sin importar si refresh() ya
  // existía o no en este punto.
  hookGlobal('refresh', _renderBtn);
  _renderBtn();
})();
