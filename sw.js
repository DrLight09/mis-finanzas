// ── Mis Finanzas — Service Worker ────────────────────────────────────────────
// Versión: incrementa este número cada vez que hagas cambios al sw.js
const VERSION = 'mis-finanzas-v2';

// Recursos que se cachean al instalar (app shell)
const APP_SHELL = [
  '/',           // index.html desde la raíz
  '/index.html'
];

// Recursos externos que se cachean cuando el usuario los solicita por primera vez
// (estrategia: cache-first para fuentes, network-first para Firebase)
const CACHE_FONTS = [
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com'
];

// ── INSTALL: cachear el shell de la app ──────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(cache => cache.addAll(APP_SHELL))
      .catch(() => {}) // Si falla (ej: sin red en la primera visita), continúa igual
  );
  self.skipWaiting(); // Activar inmediatamente sin esperar a que cierren las pestañas
});

// ── ACTIVATE: borrar cachés viejos ───────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))
    )
  );
  self.clients.claim(); // Tomar control de las pestañas abiertas sin recargar
});

// ── FETCH: estrategia según tipo de recurso ──────────────────────────────────
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return; // Solo cachear GETs

  const url = e.request.url;

  // 1. Fuentes de Google → Cache-first (muy estables, rara vez cambian)
  if (CACHE_FONTS.some(origin => url.startsWith(origin))) {
    e.respondWith(cacheFirst(e.request));
    return;
  }

  // 2. Firebase (Auth, Firestore, SDK) → Network-first (datos en tiempo real)
  if (
    url.includes('firestore.googleapis.com') ||
    url.includes('identitytoolkit.googleapis.com') ||
    url.includes('securetoken.googleapis.com') ||
    url.includes('www.gstatic.com/firebasejs')
  ) {
    e.respondWith(networkFirst(e.request));
    return;
  }

  // 3. El propio index.html → Network-first con fallback al caché
  //    Así siempre intentas tener la versión más reciente,
  //    pero si no hay red, la versión cacheada se muestra igual.
  if (url.endsWith('/') || url.endsWith('/index.html')) {
    e.respondWith(networkFirst(e.request));
    return;
  }

  // 4. Resto → Stale-while-revalidate (responde rápido con caché y actualiza en segundo plano)
  e.respondWith(staleWhileRevalidate(e.request));
});

// ── Estrategias de caché ─────────────────────────────────────────────────────

// Cache-first: devuelve caché si existe, si no va a la red y guarda el resultado
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 503, statusText: 'Sin conexión' });
  }
}

// Network-first: intenta la red, si falla usa caché
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(VERSION);
      cache.put(request, response.clone());
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

// Stale-while-revalidate: responde con caché y actualiza en segundo plano
async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) {
      caches.open(VERSION).then(cache => cache.put(request, response.clone()));
    }
    return response;
  }).catch(() => cached);
  return cached || fetchPromise;
}
