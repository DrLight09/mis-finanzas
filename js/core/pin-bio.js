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

  const FAIL_KEY = 'mf_pin_fails';     // intentos fallidos seguidos (persisten al recargar la página)
  const LOCK_KEY = 'mf_pin_lock';      // hasta cuándo (ms) está bloqueado el teclado
  const AUTOBLOQUEO_MS = 2 * 60 * 1000; // con la app en segundo plano más de esto, al volver se pide el PIN otra vez

  let _pinBuf  = '';
  let _pinMode = 'unlock'; // 'unlock' | 'set-new' | 'confirm-new' | 'verify' (confirmar una acción destructiva)
  let _verifyResolve = null; // promesa pendiente de window._pinVerificar()
  let _pinTemp = '';
  let _subBase = 'Mis Finanzas';   // subtítulo normal de la pantalla del PIN (se restaura al terminar un bloqueo)
  let _lockTimer = null;           // cuenta regresiva del bloqueo por intentos
  let _relock = false;             // la pantalla del PIN es un re-bloqueo (la app ya estaba cargada): al desbloquear solo se cierra


  // ── Seguridad del PIN: funciones PURAS (sin DOM ni almacenamiento; las prueba tests/pin-seguridad.test.js) ──
  // INICIO-PIN-PURO
  // SHA-256 sobre texto ASCII (el PIN, la sal y los hash en hex). Es síncrono a propósito: el resto del PIN lo es.
  function _sha256(texto) {
    const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    const H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const bytes = [];
    for (let i = 0; i < texto.length; i++) bytes.push(texto.charCodeAt(i) & 0xff);
    const bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (let i = 7; i >= 0; i--) bytes.push(i >= 4 ? 0 : (bitLen >>> (i * 8)) & 0xff);
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let o = 0; o < bytes.length; o += 64) {
      const w = new Array(64);
      for (let i = 0; i < 16; i++) w[i] = (bytes[o+i*4] << 24) | (bytes[o+i*4+1] << 16) | (bytes[o+i*4+2] << 8) | bytes[o+i*4+3];
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(w[i-15], 7) ^ rotr(w[i-15], 18) ^ (w[i-15] >>> 3);
        const s1 = rotr(w[i-2], 17) ^ rotr(w[i-2], 19) ^ (w[i-2] >>> 10);
        w[i] = (w[i-16] + s0 + w[i-7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
  }
  // El PIN se guarda como `h1:<sal>:<hash>` (sal aleatoria por instalación + 3000 vueltas de SHA-256), no en texto. Con solo 4 dígitos
  // ningún hash es una defensa fuerte frente a quien lea el almacenamiento del navegador: la defensa real es el bloqueo por intentos
  // y el bloqueo automático; esto evita que el PIN se vea tal cual en el almacenamiento o en una copia.
  const PIN_VUELTAS = 3000;
  function _hashPin(pin, sal) {
    let h = _sha256(sal + ':' + pin);
    for (let i = 1; i < PIN_VUELTAS; i++) h = _sha256(h + sal + pin);
    return h;
  }
  function _pinParaGuardar(pin, sal) { return 'h1:' + sal + ':' + _hashPin(pin, sal); }
  // ¿El PIN escrito coincide con lo guardado? Acepta el formato nuevo y el anterior (4 dígitos en texto) hasta que se cambie el PIN.
  function _pinCoincideCon(guardado, ingresado) {
    if (!guardado || !ingresado) return false;
    if (guardado.indexOf('h1:') === 0) {
      const partes = guardado.split(':');
      return partes.length === 3 && _hashPin(ingresado, partes[1]) === partes[2];
    }
    return ingresado === guardado;
  }
  // PINs que se adivinan a la primera: cuatro iguales (1111), escaleras (1234, 4321) y parejas repetidas (1212).
  function _pinDebil(pin) {
    return /^(\d)\1{3}$/.test(pin) || '0123456789'.indexOf(pin) !== -1 || '9876543210'.indexOf(pin) !== -1 || /^(\d\d)\1$/.test(pin);
  }
  // Segundos de bloqueo tras `fallos` intentos fallidos seguidos: ninguno hasta el 4.º; el 5.º bloquea 30 s y cada fallo más duplica, con tope de 15 min.
  function _segundosDeBloqueo(fallos) {
    return fallos < 5 ? 0 : Math.min(900, 30 * Math.pow(2, fallos - 5));
  }
  // FIN-PIN-PURO

  // ── Storage ──────────────────────────────────────────────────────
  function _getPin()    { try { return localStorage.getItem(PIN_KEY)||''; }catch(e){return '';} }
  function _setPin(v)   { try { localStorage.setItem(PIN_KEY,v); }catch(e){} }
  function _delPin()    { try { localStorage.removeItem(PIN_KEY); localStorage.removeItem(FAIL_KEY); localStorage.removeItem(LOCK_KEY); }catch(e){} }
  function _nuevaSal()  {
    try { const a = new Uint8Array(16); crypto.getRandomValues(a); return Array.from(a, b => b.toString(16).padStart(2, '0')).join(''); }
    catch(e) { return Array.from({ length: 16 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join(''); }
  }
  function _guardarPinNuevo(pin) { _setPin(_pinParaGuardar(pin, _nuevaSal())); _limpiarFallos(); }
  function _lockRestanteMs() { try { return Math.max(0, Number(localStorage.getItem(LOCK_KEY) || 0) - Date.now()); }catch(e){ return 0; } }
  function _limpiarFallos() { try { localStorage.removeItem(FAIL_KEY); localStorage.removeItem(LOCK_KEY); }catch(e){} }
  function _registrarFallo() {
    try {
      const n = Number(localStorage.getItem(FAIL_KEY) || 0) + 1;
      localStorage.setItem(FAIL_KEY, String(n));
      const seg = _segundosDeBloqueo(n);
      if (seg > 0) localStorage.setItem(LOCK_KEY, String(Date.now() + seg * 1000));
    }catch(e){}
  }
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
    _subBase = sub || 'Mis Finanzas';
    document.getElementById('pin-sub').textContent   = _subBase;
    document.getElementById('pin-forgot-btn').style.display = mode==='unlock' ? '' : 'none';
    const cancelBtn = document.getElementById('pin-cancel-btn');
    if(cancelBtn) cancelBtn.style.display = mode==='verify' ? '' : 'none';
    // Confirmar una acción puede pedirse con un overlay encima (p. ej. «Eliminar cuenta»): el PIN va por delante de todo.
    document.getElementById('pin-screen').classList.toggle('pin-verificar', mode==='verify');
    _dots();
    document.getElementById('pin-screen').classList.add('open');
    _avisoBloqueo();
    // Mostrar botón biométrico sólo en modo unlock si está habilitado y hay PIN
    const bioBtn = document.getElementById('pin-bio-btn');
    if(bioBtn) {
      const showBio = mode==='unlock' && _bioEnabled() && _getCredId() && _bioAvailable();
      bioBtn.style.display = showBio ? 'flex' : 'none';
      if(showBio) _updateBioLabel();
    }
  }
  function _hidePin() {
    if(_lockTimer) { clearInterval(_lockTimer); _lockTimer = null; }
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

  // Bloqueo por intentos: mientras dura, el teclado no escribe y el subtítulo cuenta hacia atrás.
  function _avisoBloqueo() {
    const sub = document.getElementById('pin-sub');
    if(!sub) return;
    const ms = _lockRestanteMs();
    if(ms > 0 && _pinMode !== 'set-new' && _pinMode !== 'confirm-new') {
      const s = Math.ceil(ms / 1000);
      sub.textContent = 'Demasiados intentos. Intenta en ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
      if(!_lockTimer) _lockTimer = setInterval(_avisoBloqueo, 1000);
    } else {
      if(_lockTimer) { clearInterval(_lockTimer); _lockTimer = null; }
      sub.textContent = _subBase;
    }
  }
  function _bloqueado() { return (_pinMode === 'unlock' || _pinMode === 'verify') && _lockRestanteMs() > 0; }
  // Desbloqueo correcto (PIN o huella): se borran los fallos y, si era un re-bloqueo, la app ya está cargada.
  function _alDesbloquear() {
    _limpiarFallos();
    _hidePin();
    if(_relock) _relock = false; else _launchApp();
  }

  // ── Teclado ───────────────────────────────────────────────────────
  window._pinKey = function(d) {
    if(_bloqueado()) return;
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
      setTimeout(_alDesbloquear, 350);
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
    if(_pinMode==='unlock' || _pinMode==='verify') {
      if(_bloqueado()) { _pinBuf=''; _dots(); return; }
      if(_pinCoincideCon(stored, _pinBuf)) {
        if(_pinMode==='unlock') _alDesbloquear();
        else { _limpiarFallos(); _terminarVerificacion(true); }
      } else {
        _registrarFallo();
        _shake();
        _avisoBloqueo(); // si este fallo activó el bloqueo, la cuenta regresiva aparece de inmediato
      }
    } else if(_pinMode==='set-new') {
      if(_pinDebil(_pinBuf)) {
        _shake();
        if(window.toast) toast('Ese PIN es muy fácil de adivinar. Elige otro.','warn');
        setTimeout(()=>_showPin('set-new','Elige un PIN de 4 dígitos','Evita repetidos o seguidos (1111, 1234)'), 450);
        return;
      }
      _pinTemp = _pinBuf;
      _showPin('confirm-new','Confirma el PIN','Repite los 4 dígitos');
    } else if(_pinMode==='confirm-new') {
      if(_pinBuf===_pinTemp) {
        _guardarPinNuevo(_pinBuf);
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
      _relock = false;
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

  // ── Bloqueo automático ───────────────────────────────────────────
  // Con el PIN activo, si la app estuvo en segundo plano más de AUTOBLOQUEO_MS, al volver se pide el PIN otra vez (alguien que tome tu
  // teléfono con la app ya abierta no ve tus finanzas). Solo cuando la sesión ya está cargada y la pantalla del PIN no está abierta.
  let _ocultaDesde = 0;
  document.addEventListener('visibilitychange', function() {
    if(document.hidden) { _ocultaDesde = Date.now(); return; }
    const fuera = _ocultaDesde ? Date.now() - _ocultaDesde : 0;
    _ocultaDesde = 0;
    const pantalla = document.getElementById('pin-screen');
    if(!_getPin() || !window._fbUser || fuera < AUTOBLOQUEO_MS || (pantalla && pantalla.classList.contains('open'))) return;
    _relock = true;
    _showPin('unlock','Ingresa tu PIN','Mis Finanzas');
    if(_bioEnabled() && _getCredId() && _bioAvailable()) setTimeout(window._pinBioTrigger, 400);
  });

  // ── Config desde pantalla de configuración ───────────────────────
  window._pinSetNew = async function() {
    // Cambiar un PIN que ya existe exige escribir el actual (sin PIN activo, `_pinVerificar` responde true al instante).
    if(_getPin() && !(await window._pinVerificar('Para cambiar tu PIN'))) return;
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
