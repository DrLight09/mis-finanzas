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

async function activarNotificaciones() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    if (typeof toast === 'function') toast('Este navegador no soporta notificaciones', 'err');
    return;
  }
  if (!window._fbUser) {
    if (typeof toast === 'function') toast('Inicia sesión primero', 'err');
    return;
  }

  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') {
    if (typeof toast === 'function') toast('Permiso de notificaciones denegado', 'err');
    return;
  }

  try {
    const app = firebase.apps.find((a) => a.name === 'messaging') || firebase.initializeApp(_FCM_CONFIG, 'messaging');
    const messaging = firebase.messaging(app);

    // Reusa el SW que sw.js ya registra al arrancar la app, en vez de que
    // Firebase registre uno nuevo aparte.
    const swReg = await navigator.serviceWorker.ready;
    const token = await messaging.getToken({ vapidKey: _FCM_VAPID_KEY, serviceWorkerRegistration: swReg });
    if (!token) throw new Error('No se pudo generar el token de notificaciones');

    const { db, doc, setDoc, arrayUnion } = window._fb;
    await setDoc(
      doc(db, 'usuarios', window._fbUser.uid, 'data', 'notificaciones'),
      { fcmTokens: arrayUnion(token) },
      { merge: true }
    );

    if (typeof toast === 'function') toast('Notificaciones activadas ✓', 'ok');
  } catch (e) {
    console.error('Error activando notificaciones:', e);
    if (typeof toast === 'function') toast('No se pudo activar: ' + (e.message || e), 'err');
  }
}

if (typeof Events !== 'undefined' && typeof Events.registerAll === 'function') {
  Events.registerAll('notificaciones', { activar: activarNotificaciones });
}
