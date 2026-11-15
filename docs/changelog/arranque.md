# Historial: Arranque

> Parte del historial de cambios de «Mis Finanzas». Índice y últimas entradas: [`../CHANGELOG.md`](../CHANGELOG.md).

## Arranque

### ✅ Cambiado (2026-09-20) — Firebase Auth ya no carga el iframe ni gapi en el arranque normal (`initializeAuth` sin `popupRedirectResolver` + marca `mf_auth_hint`)

Con `getAuth()` el SDK arranca con `popupRedirectResolver` y, en CADA carga —aunque el usuario ya tenga sesión y nunca vaya a abrir un popup—, baja `auth/iframe.js` (~93 KiB, caché de 30 min, no controlable desde acá), `apis.google.com` (gapi, ~144 KiB y ~250 ms de CPU) y pide `getProjectConfig`. Esa es la cadena `iframe.js → getProjectConfig` del camino crítico ya documentada en `auditoria-tecnica.md` (punto 4, "el iframe de Firebase Auth domina el camino crítico") y casi la mitad de los 251 KiB de "cache lifetimes" de la corrida previa.

Cambio:
- `firebase-init.js`: `getAuth(app)` → `initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence], … })` (misma persistencia y mismo orden que trae `getAuth()`). El `popupRedirectResolver` se pasa SOLO si no hay marca de sesión previa.
- Marca `mf_auth_hint` en `localStorage`: `_onAuthState()` la pone en `'1'` cuando hay usuario y la borra cuando no. Lleva prefijo `mf_`, así que `_limpiarStorageLocal()` (eliminar cuenta) también la borra. Si `localStorage` falla, se cae al camino completo (con resolver = comportamiento anterior).
- `window._fb.popupResolver` (nuevo) = `browserPopupRedirectResolver`. En `firebase-sync.js`, `_fbSignIn()` y `_fbDeleteAccount()` (rama `reauthenticateWithPopup`) lo pasan como tercer argumento. Sin resolver por defecto, un `signInWithPopup`/`reauthenticateWithPopup` sin ese argumento lanza `auth/argument-error`.

**Por qué NO se quitó el resolver para todos:** en Safari/iOS un popup que se abre después de un `await` (esperar la carga del iframe) puede ser bloqueado. Sin marca (primera visita, sesión cerrada, cuenta eliminada) el resolver se precarga igual que antes, así que el login conserva su comportamiento. Los tres caminos de salida (`_fbSignOut`, `_fbDeleteAccount` y `_pinOlvide` de `pin-bio.js`) terminan en `location.reload()` con la marca ya borrada por `_onAuthState(null)`, y la carga siguiente vuelve al camino con resolver. `pin-bio.js` no usa popups (solo `signOut`): revisado, sin cambios.

**Relación con el bug de datos pisados (2026-09-19, más abajo):** este cambio no toca `_dataLoaded`, `_fbUser`, `_finishFirstLoad` ni ningún guardado. Los logs `[Sync] snapshot/carga` de la prueba en navegador real muestran el camino sano: `fromCache=true → applied confiable=true` y luego `fromCache=false → applied confiable=true`, mismo `updatedAt`, 38 claves.

**Confirmado en navegador real (usuario, 2026-09-20):** login con popup OK, carga de datos OK, y en Lighthouse ya no aparecen `auth/iframe`, `apis.google.com` ni `getProjectConfig` (ni en el árbol de red ni en terceros). `node --check` sin errores en ambos archivos.

**Pendiente:** probar el login en Safari/iPhone. Y el caso raro de marca vieja (sesión revocada con la marca puesta): el primer clic en "Entrar con Google" carga el iframe y en Safari podría salir el aviso de popup bloqueado; el segundo clic funciona.

Avisos de consola que NO vienen de este cambio: `Cross-Origin-Opener-Policy policy would block the window.closed call` (`popup.ts`) es un aviso conocido del SDK con los popups de Google y no bloquea el login; los errores de `content.js`/`content-scripts.js` (`Extension context invalidated`, `sendMessage`) son de una extensión del navegador.

### ✅ Cambiado (2026-09-20) — `preconnect`: quitados `firebaseapp.com` y `apis.google.com`; `fonts.googleapis.com` sin `crossorigin`

- `crossorigin` en un `preconnect` abre una conexión "anónima" (modo CORS: fuentes, módulos, `fetch`). Un `<link rel="stylesheet">`, un iframe o un `<script>` clásico usan la conexión con credenciales, así que la anónima queda sin usar. Eso explica los "Unused preconnect" de `fonts.googleapis.com` (solo sirve el CSS), `mis-finanzas-z.firebaseapp.com` (iframe) y `apis.google.com` (gapi). `fonts.gstatic.com`, `www.gstatic.com`, `firestore.googleapis.com` e `identitytoolkit.googleapis.com` sí se piden en modo CORS y conservan `crossorigin`.
- Los dos de Auth se sacaron (ya no se usan en el arranque normal, ver entrada anterior): quedan **5** preconnect (eran 7). Si algún día se vuelve a `getAuth()` o a un resolver siempre cargado, volver a agregarlos SIN `crossorigin`.
- Resultado: en las 6 corridas posteriores, 3 sin ninguna marca y 3 con una distinta cada vez (`fonts.googleapis.com`; `firestore.googleapis.com` en la corrida detenida en el PIN, donde Firestore todavía no se usa; `identitytoolkit.googleapis.com`). Sigue siendo una señal ruidosa, como ya se anotó el 2026-08-19: no vale la pena perseguirla por un solo reporte. Comentarios HTML de `index.html` balanceados (255/255); CSP sin cambios.

### 🔍 Medido (2026-09-20) — Lighthouse antes y después del cambio de Auth y del arreglo de "Necesita atención"

| Etapa | Perf | LCP | TBT | CLS | Notas |
|---|---|---|---|---|---|
| Antes (misma mañana) | 46 | 6,1 s | 1.120 ms | 0,144 (`div.grid3`) | iframe 93 KiB + gapi 144 KiB en terceros; camino crítico 3.356 ms; caché 251 KiB |
| Tras el cambio de Auth (3 corridas) | 71 (PIN activo) / 70 / 70 | 4,6 / 2,9 / 4,7 s | 420 / 660 / 430 ms | 0,001 / 0,145 (`div.grid3`) / 0,001 | sin iframe ni gapi; camino crítico 1.293–2.233 ms (una corrida con un canal `Listen` de 33 s por long-polling, artefacto de esa corrida) |
| Tras el arreglo de "Necesita atención" (3 corridas) | 50 / 62 / 65 | 4,6 / 4,7 / 4,7 s | 780 / 710 / 610 ms | 0,248 (`health-score-card` 0,236 + `grid2` 0,012) / 0,012 / 0,012 | `div.grid3` ya no aparece en ninguna |

Lectura:
- **Sin PIN (app completa cargada): de 46–51 (4 corridas, mediana 48,5) a 50–70 (5 corridas, mediana 65).** La corrida detenida en la pantalla del PIN solo mide esa pantalla y no es comparable: 71 ahora, 64 y 77 el 2026-08-19, o sea sin cambio. Lo único que cambió entre la corrida de 46 y las siguientes es lo de Auth y `preconnect`, así que es lo más probable detrás del salto (acortó el camino crítico y sacó ~240 KiB de terceros), aunque no se pueden aislar los dos efectos.
- **TBT 430–780 ms en las 6 corridas**, sin ningún cambio de código que lo explique; los archivos que aparecen en las tareas largas son los mismos antes y después (el propio HTML, `inicio.js`, `encargos.js`, `cuentas.js`, `mejoras-adicionales.js`). Las tres corridas del segundo lote traen además el aviso "the page loaded too slowly". Se trata como ruido: para comparar conviene la mediana de 5 corridas.
- **"Agentic Browsing"** (sin nota 0–100, es una fracción de checks) dio 1/2 solo en las corridas con CLS > 0,1 y 2/2 en el resto, en las 6.
- **LCP ~4,6 s y TBT** son lo que queda (≈ 17 y 15 puntos). El LCP depende de la cadena Auth → Firestore ya diagnosticada (ver `auditoria-tecnica.md`).

### ✅ Corregido — La nube se pisaba con el estado por defecto tras borrar el storage del navegador

*(2026-09-19)*

Con la caché local de Firestore vacía o inconsistente (por ejemplo tras "Clear site data" con la app abierta), el listener de `onSnapshot` puede decir "sin documento" — incluso con `fromCache=false`, o sea, aparentemente confirmado por el servidor — para un documento que SÍ existe. `_finishFirstLoad()` lo tomaba como carga válida: marcaba `_dataLoaded = true` con `S` todavía por defecto y el siguiente guardado (`setDoc` sin `merge`, que reemplaza el documento completo y, una vez encolado en el SDK, no se cancela) pisaba la nube.

Escenario concreto: borrar el storage con la app abierta, volver a iniciar sesión (los datos se ven porque `S` seguía en memoria), recargar y encontrar la nube vacía. Reproducido con logs: `fromCache=false exists=false` mientras Firebase Console mostraba el documento con datos.

Fix (`firebase-sync.js` y `firebase-init.js`):
- `_applyCloudData()` devuelve qué pasó (`applied` / `empty` / `nodoc` / `parse-error`). `_cargaConfiable()` solo da por bueno un payload leído bien.
- "Sin documento" y "payload vacío" nunca se creen tal cual: se verifican con una lectura directa al servidor (`runTransaction` de solo lectura, sin pasar por la caché ni el listener). Si el documento existe, se aplican sus datos; si no existe, es un usuario nuevo y se habilita el guardado; si no se pudo verificar, la app queda en modo lectura.
- `_finishFirstLoad(confiable)`: en modo lectura `_dataLoaded` queda en `false`, así `_fbSaveToCloud()` responde `not-loaded`. Aviso al usuario tras 8 s sin confirmación, o de inmediato si el listener falla.
- `_fbSignOut` ya no hace su `setDoc` final si `_dataLoaded` es `false`.
- `firebase-init.js` expone `runTransaction` en `window._fb`.
- Logs de diagnóstico `[Sync] snapshot: ...` y `[Sync] carga: ...` (tipo de evento, `fromCache`, estado y confianza) para poder ver en consola qué llegó en cada arranque.

**Pendiente, fuera de esta corrección:**
- Con la caché sin el documento, la app pinta un instante sin datos hasta que termina la verificación (~1 s).
- Si el listener muere por error, la app queda en modo lectura hasta recargar; no hay reintento automático.
- Lo que se cargue en pantalla durante el modo lectura no se guarda.
- `_onAuthState(null)` no limpia `window._fbUser` ni `_dataLoaded`.
- Si un dispositivo abre con una caché más vieja que la nube y el servidor tarda más de 1,5 s en responder, el guardado automático del snapshot diario de patrimonio (`_finishFirstLoad`) puede escribir datos viejos encima. No es nuevo; no se probó.

---
