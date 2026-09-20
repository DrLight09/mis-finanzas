// ── Mis Finanzas — Service Worker ────────────────────────────────────────────
const VERSION = 'mis-finanzas-v6';

const APP_SHELL = [
  '/mis-finanzas/',
  '/mis-finanzas/index.html'
];

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
