const CACHE_NAME = 'kalora-shell-v4.0.8';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/logo.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './src/app/main.js',
  './src/app/state.js',
  './src/app/router.js',
  './src/app/bootstrap.js',
  './src/components/icons.js',
  './src/components/Modal.js',
  './src/components/Toast.js',
  './src/components/dialogTemplates.js',
  './src/features/dashboard/dashboardView.js',
  './src/features/meals/quickAddModal.js',
  './src/features/meals/editEntryModal.js',
  './src/features/foods/foodsView.js',
  './src/features/foods/foodEditorModal.js',
  './src/features/foods/directUseModal.js',
  './src/features/calculator/calculatorView.js',
  './src/features/calculator/goalConfirmModal.js',
  './src/features/weight/weightView.js',
  './src/features/weight/weightModal.js',
  './src/features/history/historyView.js',
  './src/features/settings/settingsView.js',
  './src/features/backup/backupService.js',
  './src/services/database/db.js',
  './src/services/database/entriesRepo.js',
  './src/services/database/foodsRepo.js',
  './src/services/database/settingsRepo.js',
  './src/services/database/weightRepo.js',
  './src/services/pwa/touch.js',
  './src/services/pwa/serviceWorker.js',
  './src/utils/dates.js',
  './src/utils/formatting.js',
  './src/utils/nutrition.js',
  './src/utils/energy.js',
  './src/utils/validation.js',
  './src/utils/version.js',
  './src/styles/tokens.css',
  './src/styles/base.css',
  './src/styles/layout.css',
  './src/styles/components.css',
  './src/styles/features.css'
];

/**
 * Determina si una clave de CacheStorage pertenece a versiones obsoletas de esta aplicación.
 * Preserva estrictamente:
 * 1. La caché activa (CACHE_NAME).
 * 2. Cachés protegidas de otras instancias/variantes (p. ej. micalorias-estable-shell-*).
 * 3. Cachés desconocidas o ajenas a este proyecto.
 */
function isLegacyAppCache(key) {
  if (key === CACHE_NAME) return false;
  if (key.startsWith('micalorias-estable-shell-')) return false;
  return key.startsWith('kalora-shell-') || key.startsWith('micalorias-shell-');
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      // Forzar obtención limpia desde el servidor evitando respuestas HTTP locales obsoletas
      const requests = ASSETS.map(url => new Request(url, { cache: 'reload' }));
      await cache.addAll(requests);
    })
  );
  // En primera instalación (sin controlador previo), activarse inmediatamente para habilitar modo offline
  if (!self.registration.active) {
    self.skipWaiting();
  }
});

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      // Eliminar únicamente cachés shell obsoletas de esta aplicación
      caches.keys().then(keys => {
        return Promise.all(
          keys
            .filter(isLegacyAppCache)
            .map(key => {
              console.log(`[SW] Purgando caché previa obsoleta: ${key}`);
              return caches.delete(key);
            })
        );
      }),
      self.clients.claim()
    ])
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      // Buscar exclusivamente dentro de la caché activa de la versión actual
      const cached = await cache.match(request, { ignoreSearch: true });
      if (cached) return cached;

      try {
        return await fetch(request);
      } catch (err) {
        if (request.mode === 'navigate') {
          const fallback = (await cache.match('./index.html')) || (await cache.match('./'));
          if (fallback) return fallback;
        }
        return (typeof Response.error === 'function')
          ? Response.error()
          : new Response(null, { status: 408 });
      }
    })
  );
});
