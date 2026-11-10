/* ================================================================
   js/core/notificaciones-push.js
   ================================================================
   Registro del dispositivo para notificaciones push (Firebase Cloud
   Messaging). El envío real lo hace la Cloud Function programada
   `chequeoDiarioNotificaciones` (functions/index.js) — este archivo
   SOLO pide permiso, obtiene el token de FCM y lo guarda en
   Firestore. No manda notificaciones por sí mismo.

   Usa el SDK "compat" de Firebase (cargado aparte, ver los dos
   <script src="https://www.gstatic.com/firebasejs/.../firebase-*-
   compat.js"> que van justo antes de este archivo en index.html),
   bajo un nombre de app propio ('messaging') para no interferir con
   la instancia modular que ya usan firebase-init.js/firebase-sync.js
   para Firestore/Auth — son dos SDKs de Firebase distintos corriendo
   en paralelo a propósito, sin compartir estado entre sí.

   Requiere:
     - Que window._fb (firebase-init.js) exponga también `arrayUnion`
       de 'firebase/firestore' (hoy solo expone db/doc/setDoc/etc. —
       hay que agregar esa línea ahí).
     - Reusa el Service Worker que YA registra la app (sw.js) para
       recibir el token, en vez de que Firebase registre uno propio
       (firebase-messaging-sw.js) — por eso sw.js también necesita el
       bloque de Firebase Messaging agregado (ver ese archivo).

   Disparo: cualquier elemento con data-action="notificaciones:activar"
   (ej. un botón en Configuración) llama a activarNotificaciones().
   ================================================================ */

const _FCM_CONFIG = {
  apiKey: 'AIzaSyBNGhKxrd6nuUXamRytHEgrv3ggrafr4HU',
  authDomain: 'mis-finanzas-z.firebaseapp.com',
  projectId: 'mis-finanzas-z',
  storageBucket: 'mis-finanzas-z.firebasestorage.app',
  messagingSenderId: '469399538471',
  appId: '1:469399538471:web:adaf95bc43b3355b087702',
};

const _FCM_VAPID_KEY = 'BHg62p-K530SMQ0Vx7EsZVpkG8NnXv_eD25AQz-w6gOL5MBdGGjCchPKnbuX2XFJXjoigwPWpxK39PtlvHRvsWw';

// ── Estado visible en la fila de Configuración (#cfg-notificaciones-sub) ────────────────────────────────────────────────────
// El texto original de la fila se recuerda la primera vez para poder volver a él si falla. `mf_push_ok` (localStorage) = este
// dispositivo ya dejó su token guardado; si el permiso se revoca en el navegador la marca se ignora y se limpia.
let _textoOriginalPush = null;
function _estadoPush(texto) {
  const el = document.getElementById('cfg-notificaciones-sub');
  if (!el) return;
  if (_textoOriginalPush === null) _textoOriginalPush = el.textContent;
  el.textContent = texto == null ? _textoOriginalPush : texto;
}
function _pushYaActivo() {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') { localStorage.removeItem('mf_push_ok'); return false; }
    return localStorage.getItem('mf_push_ok') === '1';
  } catch (_) { return false; }
}
function _refrescarEstadoPush() { if (_pushYaActivo()) _estadoPush('Activadas en este dispositivo'); }

// Mensaje claro según la causa. «Registration failed - push service error» NO es un fallo de Firebase ni de la app: lo devuelve el
// navegador cuando no logra suscribirse a SU servicio de notificaciones (Google en Chrome/Edge/Brave, Mozilla en Firefox).
function _mensajePushError(e, ent) {
  ent = ent || {};
  const msg = String((e && e.message) || e || '');
  const cod = String((e && (e.code || e.name)) || '');
  if (ent.sinConexion) return 'No hay conexión a internet. Conéctate e intenta de nuevo.';
  if (/messaging\/permission-blocked|permission.*(denied|blocked)/i.test(cod + ' ' + msg)) {
    return 'Las notificaciones están bloqueadas para este sitio. Actívalas en los ajustes del navegador (candado junto a la dirección, opción Notificaciones) y vuelve a intentar.';
  }
  if (/push service error|AbortError/i.test(cod + ' ' + msg)) {
    if (ent.brave) return 'Brave bloquea por defecto el servicio de notificaciones de Google. Actívalo en brave://settings/privacy, opción «Usar servicios de Google para mensajería push» y reinicia el navegador.';
    if (ent.ios) return 'En iPhone/iPad las notificaciones solo funcionan con la app instalada en la pantalla de inicio (botón Compartir, luego «Añadir a pantalla de inicio»).';
    return 'Tu navegador no pudo conectarse a su servicio de notificaciones. Prueba: desactivar VPN o bloqueadores, usar otra red, cerrar la ventana de incógnito o actualizar el navegador.';
  }
  if (/messaging\/token-subscribe-failed|API key|PERMISSION_DENIED|403/i.test(cod + ' ' + msg)) {
    return 'Firebase rechazó el registro del dispositivo (revisa que la clave de API permita «Firebase Cloud Messaging API»).';
  }
  return 'No se pudo activar: ' + (msg || 'error desconocido');
}

// getToken con un reintento: un «push service error» muchas veces viene de una suscripción vieja del navegador (hecha con otra
// clave o ya caducada). Se borra esa suscripción y el token anterior y se vuelve a pedir una sola vez.
async function _obtenerTokenPush(messaging, swReg) {
  const pedir = () => messaging.getToken({ vapidKey: _FCM_VAPID_KEY, serviceWorkerRegistration: swReg });
  try {
    return await pedir();
  } catch (e) {
    if (!/push service error|AbortError/i.test(String((e && (e.code || e.name)) || '') + ' ' + String((e && e.message) || e))) throw e;
    try { await messaging.deleteToken(); } catch (_) { /* no había token */ }
    try { const sub = await swReg.pushManager.getSubscription(); if (sub) await sub.unsubscribe(); } catch (_) { /* nada que borrar */ }
    return await pedir();
  }
}

let _activandoPush = false;
async function activarNotificaciones() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    if (typeof toast === 'function') toast('Este navegador no soporta notificaciones', 'err');
    return;
  }
  if (!window._fbUser) {
    if (typeof toast === 'function') toast('Inicia sesión primero', 'err');
    return;
  }
  if (_activandoPush) return; // otro toque mientras ya está registrando: se ignora (antes lanzaba otro registro en paralelo)
  _activandoPush = true;
  const fila = document.getElementById('cfg-notificaciones-row');
  if (fila) fila.setAttribute('aria-busy', 'true');
  // Respuesta inmediata: registrar el dispositivo tarda unos segundos (el navegador se suscribe a su servicio de push y se guarda
  // el token en la nube); sin esto parecía que el botón no hacía nada.
  _estadoPush('Activando…');
  try {
    const permiso = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permiso !== 'granted') {
      _estadoPush(null);
      if (typeof toast === 'function') toast(permiso === 'denied'
        ? _mensajePushError({ code: 'messaging/permission-blocked' }) : 'Permiso de notificaciones no concedido', 'err', 7000);
      return;
    }
    if (typeof navigator.onLine === 'boolean' && !navigator.onLine) throw Object.assign(new Error('offline'), { sinConexion: true });

    const app = firebase.apps.find((a) => a.name === 'messaging') || firebase.initializeApp(_FCM_CONFIG, 'messaging');
    const messaging = firebase.messaging(app);

    // Reusa el SW que sw.js ya registra al arrancar la app, en vez de que Firebase registre uno nuevo aparte.
    const swReg = await navigator.serviceWorker.ready;
    const token = await _obtenerTokenPush(messaging, swReg);
    if (!token) throw new Error('No se pudo generar el token de notificaciones');

    const { db, doc, setDoc, arrayUnion } = window._fb;
    const guardado = setDoc(
      doc(db, 'usuarios', window._fbUser.uid, 'data', 'notificaciones'),
      { fcmTokens: arrayUnion(token) },
      { merge: true }
    );
    // La confirmación del servidor puede tardar; la escritura ya queda en la cola local de Firestore y sube sola. Se espera un
    // máximo de 3 s: si pasa ese tiempo sin error, se da por activado (un fallo tardío se avisa igual).
    const pendiente = Symbol('pendiente');
    const r = await Promise.race([guardado.then(() => 'ok'), new Promise((res) => setTimeout(() => res(pendiente), 3000))]);
    if (r === pendiente) guardado.catch((e) => { console.error('Guardado tardío del token falló:', e); if (typeof toast === 'function') toast('No se pudo guardar el aviso en la nube: ' + (e.message || e), 'err'); });

    try { localStorage.setItem('mf_push_ok', '1'); } catch (_) {}
    _estadoPush('Activadas en este dispositivo');
    if (typeof toast === 'function') toast('Notificaciones activadas', 'ok');
  } catch (e) {
    console.error('Error activando notificaciones:', e);
    _estadoPush(null);
    const ent = {
      sinConexion: !!(e && e.sinConexion),
      brave: !!(navigator.brave && typeof navigator.brave.isBrave === 'function' && await navigator.brave.isBrave().catch(() => false)),
      ios: /iPad|iPhone|iPod/.test(navigator.userAgent || ''),
    };
    if (typeof toast === 'function') toast(_mensajePushError(e, ent), 'err', 9000);
  } finally {
    _activandoPush = false;
    if (fila) fila.removeAttribute('aria-busy');
  }
}

_refrescarEstadoPush();

if (typeof Events !== 'undefined' && typeof Events.registerAll === 'function') {
  Events.registerAll('notificaciones', { activar: activarNotificaciones });
}
