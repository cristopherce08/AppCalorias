const CACHE_NAME = 'micalorias-shell-v4.0';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
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
  './src/styles/tokens.css',
  './src/styles/base.css',
  './src/styles/layout.css',
  './src/styles/components.css',
  './src/styles/features.css'
];

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
      // Eliminar únicamente cachés shell antiguas, preservando cualquier otro almacenamiento
      caches.keys().then(keys => {
        return Promise.all(
          keys
            .filter(key => key.startsWith('micalorias-shell-') && key !== CACHE_NAME)
            .map(key => caches.delete(key))
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
    caches.match(request, { ignoreSearch: true }).then(cached => {
      if (cached) return cached;
      return fetch(request).catch(() => {
        if (request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return (typeof Response.error === 'function')
          ? Response.error()
          : new Response(null, { status: 408 });
      });
    })
  );
});
