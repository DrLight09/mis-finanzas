// Init de Firebase (config, auth, onAuthStateChanged) + guard/timeout de
// seguridad para el botón de login — extraído de index.html (era
// <script type="module"> inline). Ver auditoria-tecnica.md #2.

      import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
      import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, deleteUser, reauthenticateWithPopup }
        from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
      import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDoc, setDoc, deleteDoc, onSnapshot }
        from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

      // NOTA DE SEGURIDAD: Esta API Key de Firebase es de dominio público por diseño
      // (Firebase requiere que esté en el cliente). Para reducir riesgos:
      // 1. Restringe la clave en Firebase Console → APIs & Services → Credentials
      //    → Application restrictions: HTTP referrers (solo tu dominio)
      //    → API restrictions: solo Firebase APIs necesarias
      // 2. Las reglas de seguridad de Firestore son la barrera real de acceso.
      const firebaseConfig = {
        apiKey: "AIzaSyBNGhKxrd6nuUXamRytHEgrv3ggrafr4HU",
        authDomain: "mis-finanzas-z.firebaseapp.com",
        projectId: "mis-finanzas-z",
        storageBucket: "mis-finanzas-z.firebasestorage.app",
        messagingSenderId: "469399538471",
        appId: "1:469399538471:web:adaf95bc43b3355b087702"
      };

      const app = initializeApp(firebaseConfig);
      const auth = getAuth(app);
      const db = initializeFirestore(app, {
        experimentalAutoDetectLongPolling: true,  // Evita ERR_QUIC_PROTOCOL_ERROR sin forzar long-polling siempre (ver auditoria-tecnica.md, punto de rendimiento #1)
        // FIX (2026-08-17): persistentLocalCache() por defecto solo permite
        // UNA pestaña a la vez tener acceso exclusivo al cache de IndexedDB
        // — una segunda pestaña (olvidada en otro dispositivo, o accidental
        // en el mismo) rompe con "Failed to obtain exclusive access to the
        // persistence layer" y esa pestaña cae a memoria (pierde el cache
        // offline). persistentMultipleTabManager() hace que Firestore
        // coordine el cache entre pestañas en vez de pelear por él. Ver
        // CHANGELOG.md#infraestructura--seguridad para el hallazgo completo
        // (Lighthouse ya avisaba de esto: "There may be stored data
        // affecting loading performance in this location: IndexedDB").
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
      });
      const provider = new GoogleAuthProvider();

      // Exponer globalmente para que el código existente pueda usar
      window._fb = { auth, db, provider, signInWithPopup, signOut, doc, getDoc, setDoc, deleteDoc, deleteUser, reauthenticateWithPopup, onAuthStateChanged, onSnapshot };

      // Escuchar estado de auth y arrancar la app
      //
      // NOTA (arranque async, ver docs/auditoria-tecnica.md #4 y
      // CHANGELOG.md#arranque): este archivo ahora carga con `async` en vez
      // de dejarlo como <script type="module"> normal (que el navegador
      // trata como defer). Esto deja correr la resolución de auth de
      // Firebase en paralelo con el JS clásico de la app, en vez de esperar
      // a que termine — pero significa que este módulo puede llegar a
      // ejecutar antes de lo habitual. onAuthStateChanged() en sí solo
      // registra el listener (no toca el DOM), así que eso es seguro
      // siempre. El callback de abajo sí toca el DOM (#fb-loading-screen,
      // #fb-login-screen, etc.) — como defensa barata, si el documento
      // todavía se está parseando cuando el callback dispara, se espera a
      // DOMContentLoaded antes de tocar nada. En la práctica no debería
      // activarse nunca (Firebase tarda más en resolver el estado de auth
      // que lo que tarda el parser en llegar a esas dos divs, que son de
      // las primeras cosas del <body>), pero es la misma clase de guard
      // defensivo que ya usa el resto de la cadena (window._pendingPinGate,
      // window._authgateReadyTimeout) — sin él, esto sería exactamente el
      // tipo de carrera que causó el bug real de `window.Events` vs
      // `typeof Events` documentado en CHANGELOG.md#infraestructura--seguridad.
      onAuthStateChanged(auth, (user) => {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => _onAuthState(user), { once: true });
        } else {
          _onAuthState(user);
        }
      });

      function _onAuthState(user) {
        if (user) {
          // Usuario logueado
          document.getElementById('fb-login-screen').style.display = 'none';
          document.getElementById('fb-loading-screen').style.display = 'flex';
          window._fbUser = user;
          // Actualizar avatar/nombre en config
          const nameEl = document.getElementById('fb-user-name');
          const emailEl = document.getElementById('fb-user-email');
          const avatarEl = document.getElementById('fb-user-avatar');
          if(nameEl) nameEl.textContent = user.displayName || 'Usuario';
          if(emailEl) emailEl.textContent = user.email || '';
          if(avatarEl && user.photoURL) {
            avatarEl.style.backgroundImage = `url(${user.photoURL})`;
            avatarEl.style.backgroundSize = 'cover';
            avatarEl.textContent = '';
          }
          // Cargar datos desde Firestore (con PIN si está configurado)
          if (typeof window._pinGate === 'function') {
            window._pinGate();
          } else {
            // El módulo PIN aún no cargó — esperar con timeout de seguridad
            window._pendingPinGate = true;
            // Si en 5s el módulo PIN no cargó (error de sintaxis, fallo de red, etc.)
            // arrancar la app directamente para no quedar en loading infinito.
            window._pinGateTimeout = setTimeout(function() {
              if (window._pendingPinGate) {
                console.warn('[Auth] Módulo PIN no cargó en 5s — arrancando app directamente.');
                window._pendingPinGate = false;
                if (typeof window._fbLoadData === 'function') window._fbLoadData();
              }
            }, 5000);
          }
        } else {
          // No logueado — mostrar pantalla de login
          document.getElementById('fb-loading-screen').style.display = 'none';
          document.getElementById('fb-login-screen').style.display = 'flex';
          // El botón "Entrar con Google" arranca disabled (ver el <button> en
          // el HTML) hasta que firebase-sync.js confirme que Events.registerAll
          // ('authgate', ...) ya corrió — evita la ventana en la que el botón
          // es visible pero su handler todavía no se registró (ver
          // CHANGELOG.md#infraestructura--seguridad para el bug real que esto
          // reemplaza — no era una carrera de timing, pero la precaución
          // sigue siendo válida para cuando firebase-sync.js vuelva a ser un
          // archivo externo). Si en 8s no se confirma, se habilita igual con
          // un aviso — mismo criterio que window._pinGateTimeout arriba.
          window._authgateReadyTimeout = setTimeout(function() {
            if (!window._authgateReady) {
              console.warn('[Auth] authgate no se registró en 8s — habilitando el botón de todas formas.');
              document.querySelectorAll('[data-action^="authgate:"]').forEach(function(b){ b.disabled = false; });
            }
          }, 8000);
        }
      }
