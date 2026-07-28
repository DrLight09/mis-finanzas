// Init de Firebase (config, auth, onAuthStateChanged) + guard/timeout de
// seguridad para el botón de login — extraído de index.html (era
// <script type="module"> inline). Ver auditoria-tecnica.md #2.

      import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
      import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, deleteUser, reauthenticateWithPopup }
        from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
      import { initializeFirestore, persistentLocalCache, doc, getDoc, setDoc, deleteDoc, onSnapshot }
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
        experimentalForceLongPolling: true,  // Evita ERR_QUIC_PROTOCOL_ERROR
        localCache: persistentLocalCache()   // Guarda offline en IndexedDB
      });
      const provider = new GoogleAuthProvider();

      // Exponer globalmente para que el código existente pueda usar
      window._fb = { auth, db, provider, signInWithPopup, signOut, doc, getDoc, setDoc, deleteDoc, deleteUser, reauthenticateWithPopup, onAuthStateChanged, onSnapshot };

      // Escuchar estado de auth y arrancar la app
      onAuthStateChanged(auth, (user) => {
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
      });
