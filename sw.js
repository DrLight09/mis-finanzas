// ── Mis Finanzas — Service Worker ────────────────────────────────────────────
const VERSION = 'mis-finanzas-v69'; // v69 (2026-10-27): estado vacío de Alcancía igual al estándar (.empty-state suelto, botón .empty-state-btn, sin .card ni botón ámbar; fuera .ix-button-045). v68 (2026-10-27): fila de movimiento compartida (filaMovimiento/botonEliminarFila en core-state.js) en Tarjetas, Encargos, Gastos y Cuentas; planes .md retirados. v67 (2026-10-27): mejoras de la lista de octubre: precarga de dinero con miles (setMoneyInput), héroes con color propio, chips de acción unificados, estados vacíos estándar, toasts por resultado (nuevo tipo warn) sin aviso duplicado de «otro dispositivo», iconos de pestaña (apple-touch-icon correcto, favicon PNG, manifest.webmanifest con icono 512). v66 (2026-10-26): PIN antes de las acciones destructivas (borrar todo, eliminar cuenta, importar backup, quitar PIN/huella) y PIN con el teclado del PC (mejora 13). v65 (2026-10-26): Nu sin mensaje de historial de tasas; la tasa se aplica al confirmar y solo si cambió (mejora 10). v64 (2026-10-26): Salud financiera con tipos de consejo (mejora 11), abono+extra en un solo movimiento por cuenta (mejora 5), sin símbolos de texto como íconos y aria-hidden en los SVG decorativos. v63 (2026-10-25): Préstamos: «Nueva deuda» y validaciones comunes (mejora 4); balance de Análisis por escenario, comparación «por ahora» y extra «gastar» como ingreso+gasto (mejora 6). v62 (2026-10-25): .money-input con cursor libre, miles al escribir y decimales opcionales (se retira el estilo calculadora y su buffer de dígitos). v61 (2026-10-25): toda la app en tuteo (sin voseo), con prueba que lo vigila; se mantiene .miles-input en Presupuestos. v60 (2026-10-25): un solo botón por estado vacío (mejora 1) y separador de miles en Presupuestos mensuales (mejora 8). v59 (2026-10-24): eliminar un movimiento ya no deja rastro en el historial de patrimonio y la gráfica queda neutra con cambio $0 (mejora 14). v58 (2026-10-24): requisitos de «Pagar Spotify» y «Registrar gasto», sin tarjetas de crédito en «Me lo regalaron»/«Mover entre cuentas»/«Compra con TC», tope de filas al dividir, estilo del selector de mes (mejoras 2 y 3). v57 (2026-10-24): «+ Agregar» de Ingresos fijos abre el sheet; «Borrar todos los datos» también quita el PIN y la huella (mejoras 7 y 9). v56 (2026-10-24): correcciones tras verificar con jsdom (CSS inválido en .cp-dev-tag, margen condicional de Alcancía, #gv_fuente_hint). v55 (2026-10-23): estilos inline → clases en index.html (Paso 5, tanda 18). v54 (2026-10-23): estilos inline → clases en Plata comprometida (Paso 5, tanda 17). v53 (2026-10-23): estilos inline → clases en Personas (Paso 5, tanda 16). v52 (2026-10-23): estilos inline → clases en Encargos (Paso 5, tanda 15). v51 (2026-10-23): estilos inline → clases en Tarjetas de crédito (Paso 5, tanda 14). v50 (2026-10-23): estilos inline → clases en Alcancía (Paso 5, tanda 13). v49 (2026-10-23): estilos inline → clases en Nu (Paso 5, tanda 12); los colores por estado de la meta son clases (nu-estado-*, nu-fill-*). v48 (2026-10-23): estilos inline → clases en el detalle de movimientos (Paso 5, tanda 11); fuera los últimos restos de `_esAlcancia` en gastosVar. v47 (2026-10-23): estilos inline → clases en Prestado (Paso 5, tanda 10); el botón de quitar una parte del extra ahora sí se oculta con una sola parte. v46 (2026-10-22): estilos inline → clases en Spotify (Paso 5, tanda 9). v45 (2026-10-22): estilos inline → clases en Análisis (Paso 5, tanda 8). v44 (2026-10-21): estilos inline → clases en Cuentas (Paso 5, tanda 7). v43 (2026-10-21): estilos inline → clases en los archivos sueltos (mesada, wrapped-gate, core-state, pin-bio, gastos-fijos-progress; Paso 5, tanda 6). v42 (2026-10-21): estilos inline → clases en Wrapped (Paso 5, tanda 5). v41 (2026-10-21): estilos inline → clases en Inicio (Paso 5, tanda 4). v40 (2026-10-20): estilos inline → clases en la lista de Gastos (Paso 5, tanda 3). v39 (2026-10-20): estilos inline → clases en búsqueda global y chips de categorías (Paso 5, tanda 2). v38 (2026-10-20): estilos inline → clases en diferencial.js y split.js (Paso 5, tanda 1); limpieza de código de compatibilidad con datos anteriores (grupos de deudor, Spotify, alcancía 'split', alias getSaldoActual). v37 (2026-10-18): esquema 9 sin migraciones (la app nace limpia), sin restos de compatibilidad con formatos viejos de gastos fijos y de Diferencial. v36 (2026-10-18): todo el estado de Spotify en S.spotify (migración v9, esquema 9). v35 (2026-10-18): sin tipo 'egreso' (toda salida manual es 'salida_manual', etiqueta "Retiro"), 4 registros de acciones muertos fuera. v34 (2026-10-18): frontera limpia entre cuentas.js y nu.js (Nu se apoya en Cuentas, nunca al revés; CuentaPantallas en core-state.js). v33 (2026-10-17): cuentas.js se parte en nu.js + cuentas.js (botones de Nu: data-action nu:), vocabulario "Agregar/Retirar dinero" en todo, toast de salida en gastos. v32 (2026-10-17): sin aviso "Cajitas recalculadas", tasa solo numérica, "Agregar/Retirar dinero" en todas las cuentas, toast de salida (rojo) y rediseñado, Chequeo rápido con el total de Nu (encargos incluidos). v31 (2026-10-16): una sola tasa de Nu (S.nuRate, migración v8), color-picker.js cargado, acciones de Nu y retiros que se deshabilitan sin saldo ni cajitas, chequeo rápido por cajita con un día de intereses. v30 (2026-10-13): el payload de Firestore viaja comprimido (js/core/payload-codec.js), margen de Préstamo con TC enlazado al préstamo, saldo inicial de encargos sin descuento, origen en diffAplicar. v29 (2026-10-12): app limpia (esquema 7): el libro vive en core-state.js (sin libro.js), se retiran las migraciones v3-v6. v28 (2026-10-12): historial de TODAS las cuentas en S.movimientos (migración v6), cuenta-efectos escribe solo ahí. v27 (2026-10-11): libro de movimientos (S.libro, migración v5, js/core/libro.js). v26 (2026-10-10): interruptor "¿Es plata nueva?" en préstamos y migración v4. v25: préstamos/abonos sin cuenta = ajuste de base (tendencia y proyección). v24: Gastos muestra los retiros manuales, E5 (reglas históricas congeladas). v23: clase explícita en movimientos, Restar dinero = gasto, rendimientos de Nu (en el balance de Análisis), migraciones v1/v2 retiradas

const APP_SHELL = [
  '/mis-finanzas/',
  '/mis-finanzas/index.html'
];

// ── Firebase Cloud Messaging (notificaciones en segundo plano) ─────────────
// Mismo config que en js/core/notificaciones-push.js. Tiene que repetirse
// acá porque el Service Worker corre en su propio contexto global, sin
// acceso a `window` ni a lo que carga firebase-init.js en la página — no
// hay forma de compartir el objeto entre los dos archivos.
// Requiere sumar https://www.gstatic.com a worker-src en la CSP de
// index.html (importScripts() cae bajo worker-src, no bajo script-src) y
// https://fcm.googleapis.com, https://fcmregistrations.googleapis.com,
// https://firebaseinstallations.googleapis.com a connect-src.
importScripts('https://www.gstatic.com/firebasejs/11.1.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.1.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBNGhKxrd6nuUXamRytHEgrv3ggrafr4HU',
  authDomain: 'mis-finanzas-z.firebaseapp.com',
  projectId: 'mis-finanzas-z',
  storageBucket: 'mis-finanzas-z.firebasestorage.app',
  messagingSenderId: '469399538471',
  appId: '1:469399538471:web:adaf95bc43b3355b087702',
});

const _messaging = firebase.messaging();
_messaging.onBackgroundMessage((payload) => {
  const { title, body, icon } = payload.notification || {};
  self.registration.showNotification(title || 'Mis Finanzas', {
    body: body || '',
    icon,
    data: { url: (payload.fcmOptions && payload.fcmOptions.link) || '/mis-finanzas/' },
  });
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/mis-finanzas/';
  e.waitUntil(clients.openWindow(url));
});

const CACHE_FONTS = [
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(cache => cache.addAll(APP_SHELL))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = e.request.url;

  // Ignore non-http(s) schemes (chrome-extension://, blob:, data:, etc.)
  if (!url.startsWith('http://') && !url.startsWith('https://')) return;

  if (CACHE_FONTS.some(origin => url.startsWith(origin))) {
    e.respondWith(cacheFirst(e.request));
    return;
  }

  // FIX (2026-09-19): Firestore y Auth NO pasan por el SW. El canal de
  // escucha de Firestore (onSnapshot) es una respuesta larga que no termina
  // hasta que el SDK la corta; clonarla para cache.put() dejaba la escritura
  // de caché colgada y, al cortarse el stream, fallaba con "Cache.put()
  // encountered a network error". Además el fallback de networkFirst
  // respondía a una request de Firestore con una página HTML con status 200
  // en vez de un error de red, que el SDK no sabe interpretar. Sin
  // respondWith, el navegador las maneja normal y el SDK ve errores reales.
  if (
    url.includes('firestore.googleapis.com') ||
    url.includes('identitytoolkit.googleapis.com') ||
    url.includes('securetoken.googleapis.com')
  ) {
    return;
  }

  // El SDK de Firebase (scripts completos, no streams) sí se cachea.
  if (url.includes('www.gstatic.com/firebasejs')) {
    e.respondWith(networkFirst(e.request));
    return;
  }

  if (url.endsWith('/') || url.endsWith('/index.html')) {
    e.respondWith(networkFirst(e.request));
    return;
  }

  e.respondWith(staleWhileRevalidate(e.request));
});

// Escribir en caché es "mejor esfuerzo": si falla (respuesta cortada por una
// recarga, sin conexión, cuota), no debe convertirse en un error sin manejar.
function guardarEnCache(request, response) {
  return caches.open(VERSION)
    .then(cache => cache.put(request, response))
    .catch(() => {});
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok && request.url.startsWith('http')) {
      guardarEnCache(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok && request.url.startsWith('http')) {
      guardarEnCache(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response(
      `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Sin conexión</title></head>
      <body style="font-family:sans-serif;text-align:center;padding:60px;background:#0f0f0f;color:#f0ede8">
      <h2 style="color:#c8f060">Sin conexión</h2>
      <p>Vuelve a abrir la app cuando tengas internet para sincronizar.</p>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const fetchPromise = fetch(request).then(response => {
    if (response.ok && request.url.startsWith('http')) {
      guardarEnCache(request, response.clone());
    }
    return response;
  }).catch(() => cached);
  return cached || fetchPromise;
}
