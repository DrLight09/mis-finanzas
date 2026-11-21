// ── Mis Finanzas — Service Worker ────────────────────────────────────────────
// Sin número de versión a mano. BUILD es la huella del contenido desplegable y la escribe scripts/sellar-sw.js EN EL DESPLIEGUE
// (`npm run build` → dist/, que corre el job «deploy» de .github/workflows/ci.yml). En el repo queda 'dev' con PRECACHE vacío: un
// servidor local sirve todo por red, sin caché de versión. NO editar BUILD ni PRECACHE a mano: el despliegue los sobrescribe.
const PREFIJO_CACHE = 'mis-finanzas-v'; // toda caché con este prefijo es de una versión de la app: activate borra las que no son la actual
const BUILD = 'dev'; // sellado por scripts/sellar-sw.js en el despliegue — NO editar a mano (huella del contenido desplegable)
const CACHE = PREFIJO_CACHE + '-' + BUILD;
// Caché que SÍ sobrevive entre versiones: fuentes y SDK de Firebase (de otro origen, no forman parte de la versión de la app).
const CACHE_EXT = 'mis-finanzas-ext';

// Base del sitio, derivada de dónde está registrado este SW (nada de «/mis-finanzas/» escrito a mano: si el repo cambia de nombre
// o se sirve desde otro dominio, sigue funcionando).
const BASE = new URL('./', self.registration.scope).pathname;

// ── Precaché atómico ────────────────────────────────────────────────────────
// scripts/sellar-sw.js escribe acá TODOS los archivos desplegables. install los baja juntos a la caché de ESTA versión: si uno falla,
// la versión nueva no se instala y la gente sigue con la anterior completa. fetch sirve de esa misma caché: una versión = un
// conjunto coherente (nunca un index nuevo con JS viejo) y la app funciona completa sin conexión.
// <PRECACHE> — lo escribe scripts/sellar-sw.js en el despliegue: todo lo desplegable (una versión = un conjunto coherente y offline completo)
const PRECACHE = [];
// </PRECACHE>

// ── Avisos push (Firebase Cloud Messaging, sin su SDK en el Service Worker) ──
// El token FCM lo pide la página (js/core/notificaciones-push.js) sobre ESTE service worker; aquí solo se recibe el aviso con el evento
// `push` nativo. Así el SW no carga scripts de terceros (ni importScripts, ni worker-src externo en la CSP) ni repite la config de Firebase.
// Los avisos llegan como mensajes SOLO-DATOS ({title, body, link, icon}; ver scripts/notificaciones/run.js): FCM los entrega como JSON
// {data:{…}, from, fcmMessageId…}. También se acepta un campo `notification` por si algún día se envía así.
// Si la app está abierta y visible no se muestra nada (la persona ya la está viendo); es lo mismo que hacía el SDK.
function _leerPush(e) {
  if (!e.data) return {};
  try { return e.data.json() || {}; } catch (_) { return { data: { body: e.data.text() } }; }
}
self.addEventListener('push', (e) => {
  const payload = _leerPush(e);
  const d = payload.data || {};
  const n = payload.notification || {};
  e.waitUntil((async () => {
    const ventanas = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (ventanas.some(w => w.visibilityState === 'visible' && w.url.startsWith(self.registration.scope))) return;
    await self.registration.showNotification(d.title || n.title || 'Mis Finanzas', {
      body: d.body || n.body || '',
      icon: d.icon || n.icon || BASE + 'icons/icon-192.png',
      data: { url: d.link || (payload.fcmOptions && payload.fcmOptions.link) || BASE },
    });
  })());
});

// Tocar el aviso: si la app ya está abierta se enfoca esa ventana (en vez de abrir otra); si no, se abre.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || BASE, self.registration.scope).href;
  e.waitUntil((async () => {
    const ventanas = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const propia = ventanas.find(w => w.url.startsWith(self.registration.scope));
    if (propia) {
      await propia.focus();
      if (propia.navigate && propia.url !== url) { try { await propia.navigate(url); } catch (_) { /* misma página: basta con el foco */ } }
      return;
    }
    await clients.openWindow(url);
  })());
});

const CACHE_FONTS = [
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com'
];

self.addEventListener('install', e => {
  // Sin skipWaiting automático: una pestaña abierta sigue con su versión completa (JS + caché) hasta que la persona toque
  // «Actualizar» (js/core/sw-registro.js manda {tipo:'SKIP_WAITING'}). Así nunca se mezclan dos versiones en una pestaña.
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      // cache:'reload' salta la caché HTTP (GitHub Pages: 10 min): sin esto un SW nuevo podía guardar una copia vieja.
      cache.addAll(PRECACHE.map(p => new Request(BASE + (p === './' ? '' : p), { cache: 'reload' })))
    )
  );
});

self.addEventListener('message', e => {
  if (e.data && e.data.tipo === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      // Solo se borran las cachés de versiones anteriores de la app; la de fuentes/SDK se conserva.
      Promise.all(keys.filter(k => k.startsWith(PREFIJO_CACHE) && k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
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

  // Firestore y Auth NO pasan por el SW. El canal de escucha de Firestore (onSnapshot) es una respuesta larga que no termina
  // hasta que el SDK la corta; clonarla para cache.put() colgaba la escritura de caché, y el fallback respondía con una página
  // HTML 200 que el SDK no sabe interpretar. Sin respondWith, el navegador las maneja normal y el SDK ve errores reales.
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

  // La app (mismo origen): SIEMPRE de la caché de esta versión.
  if (new URL(url).origin === self.location.origin) {
    e.respondWith(servirDeLaVersion(e.request));
  }
});

// Mejor esfuerzo: si falla (respuesta cortada, sin conexión, cuota) no debe convertirse en un error sin manejar.
function guardarEnCache(request, response, nombre) {
  return caches.open(nombre || CACHE_EXT)
    .then(cache => cache.put(request, response))
    .catch(() => {});
}

async function servirDeLaVersion(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  if (request.mode === 'navigate') {
    const shell = await cache.match(BASE);
    if (shell) return shell;
  }
  try {
    return await fetch(request);
  } catch (_) {
    return new Response('', { status: 503 });
  }
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
    return cached || new Response('', { status: 503 });
  }
}
