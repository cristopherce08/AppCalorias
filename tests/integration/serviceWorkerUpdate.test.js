/**
 * serviceWorkerUpdate.test.js — Prueba de integración automatizada del ciclo de actualización PWA
 * Simula la presencia de cachés obsoletas y verifica su purga, la preservación de cachés protegidas,
 * la lectura aislada desde kalora-shell-v4.0.4, navegación offline y persistencia IndexedDB.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const PORT = 3458;
const BASE_URL = `http://localhost:${PORT}/`;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

// 1. Iniciar servidor estático local con soporte de simulación de actualización SW
let servedSwContent = `
const CACHE_NAME = 'kalora-shell-v4.0.2';
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.put(new Request('/marker.txt'), new Response('v4.0.2')))
  );
  self.skipWaiting();
});
self.addEventListener('activate', e => self.clients.claim());
self.addEventListener('fetch', e => e.respondWith(fetch(e.request)));
`;

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];

  if (reqPath === '/sw.js') {
    res.writeHead(200, {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Service-Worker-Allowed': '/'
    });
    res.end(servedSwContent);
    return;
  }

  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join(process.cwd(), reqPath);

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_TYPES[ext] || 'application/octet-stream';

  res.writeHead(200, {
    'Content-Type': mime,
    'Access-Control-Allow-Origin': '*',
    'Service-Worker-Allowed': '/'
  });
  fs.createReadStream(filePath).pipe(res);
});

await new Promise(resolve => server.listen(PORT, resolve));
console.log(`[TEST-SW] Servidor local para pruebas de SW iniciado en ${BASE_URL}`);

let browser = null;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
  });
  const page = await context.newPage();
  page.on('console', msg => console.log('[BROWSER LOG]:', msg.type(), msg.text()));
  page.on('pageerror', err => console.error('[BROWSER ERROR]:', err));

  console.log('[TEST-SW 1/7] Instalando versión previa de la PWA (v4.0.2)...');
  await page.goto(BASE_URL);
  await page.waitForLoadState('networkidle');

  // Esperar a que el SW v4.0.2 se haya instalado
  await page.waitForTimeout(1000);

  // Inyectar cachés históricas y ajenas para comprobar el filtrado selectivo
  console.log('[TEST-SW 2/7] Inyectando cachés históricas en CacheStorage antes de la actualización...');
  await page.evaluate(async () => {
    // 1. Asegurar que kalora-shell-v4.0.2 existe
    const c402 = await caches.open('kalora-shell-v4.0.2');
    await c402.put(new Request('/test-v402.js'), new Response('console.log("v4.0.2");'));

    // 2. Caché obsoleta v3.1 (debe borrarse)
    const c31 = await caches.open('micalorias-shell-v3.1');
    await c31.put(new Request('/test-v31.js'), new Response('console.log("v3.1");'));

    // 3. Caché protegida de otra versión/proyecto (NO debe tocarse)
    const cEstable = await caches.open('micalorias-estable-shell-v2.0');
    await cEstable.put(new Request('/test-estable.js'), new Response('console.log("estable");'));

    // 4. Caché de terceros no relacionada (NO debe tocarse)
    const cOther = await caches.open('third-party-app-cache');
    await cOther.put(new Request('/test-other.js'), new Response('console.log("other");'));
  });

  const initialKeys = await page.evaluate(() => caches.keys());
  assert.ok(initialKeys.includes('kalora-shell-v4.0.2'), 'kalora-shell-v4.0.2 debe existir al inicio');
  assert.ok(initialKeys.includes('micalorias-shell-v3.1'), 'micalorias-shell-v3.1 debe existir al inicio');
  assert.ok(initialKeys.includes('micalorias-estable-shell-v2.0'), 'micalorias-estable-shell-v2.0 debe existir al inicio');
  assert.ok(initialKeys.includes('third-party-app-cache'), 'third-party-app-cache debe existir al inicio');
  console.log('[PASS 2/7] Cachés iniciales confirmadas en CacheStorage:', initialKeys);

  // Inyectar datos en IndexedDB micalorias-local-v1 para garantizar 0% pérdida de datos
  console.log('[TEST-SW 3/7] Inyectando datos de usuario en IndexedDB (DB_NAME=micalorias-local-v1)...');
  await page.evaluate(async () => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('micalorias-local-v1', 3);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(['entries', 'foods'], 'readwrite');
        const entries = tx.objectStore('entries');
        entries.put({
          id: 'test-entry-carambola',
          date: '2026-10-29',
          name: 'Fresco de carambola',
          amount: 600,
          unit: 'g',
          mode: 'total',
          totalKcal: 180,
          totalProtein: 0,
          calculatedKcal: 180,
          calculatedProtein: 0,
          createdAt: Date.now()
        });

        const foods = tx.objectStore('foods');
        foods.put({
          id: 'test-food-apple',
          name: 'Manzana Fuji',
          kcal100: 52,
          protein100: 0.3,
          isFavorite: true,
          createdAt: Date.now()
        });

        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  });
  console.log('[PASS 3/7] Datos de usuario inyectados en IndexedDB con éxito');

  // Ahora publicamos la versión kalora-shell-v4.0.7 en el servidor
  console.log('[TEST-SW 4/7] Publicando sw.js versión kalora-shell-v4.0.7 y disparando actualización...');
  servedSwContent = fs.readFileSync('sw.js', 'utf8');

  // Disparar actualización en el navegador
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) throw new Error('No se encontró registro de Service Worker');

    await reg.update();

    // Esperar a que el nuevo worker se active
    await new Promise(resolve => {
      let resolved = false;
      const done = () => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };

      const trackWorker = worker => {
        if (!worker) return;
        if (worker.state === 'activated') {
          done();
          return;
        }
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed') {
            worker.postMessage({ type: 'SKIP_WAITING' });
          }
          if (worker.state === 'activated') {
            done();
          }
        });
        if (worker.state === 'installed') {
          worker.postMessage({ type: 'SKIP_WAITING' });
        }
      };

      if (reg.waiting) trackWorker(reg.waiting);
      if (reg.installing) trackWorker(reg.installing);

      reg.addEventListener('updatefound', () => {
        trackWorker(reg.installing);
      });

      const interval = setInterval(() => {
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      }, 200);

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        clearInterval(interval);
        setTimeout(done, 500);
      });

      setTimeout(() => {
        clearInterval(interval);
        done();
      }, 6000);
    });
  });

  // Dar tiempo para la finalización de activate y caches.delete()
  await page.waitForTimeout(1000);

  console.log('[TEST-SW 5/7] Verificando purga selectiva de cachés en CacheStorage...');
  const postKeys = await page.evaluate(() => caches.keys());
  console.log('[INFO] Claves de caché presentes post-activación:', postKeys);

  // 1. La caché activa kalora-shell-v4.0.7 debe existir
  assert.ok(postKeys.includes('kalora-shell-v4.0.7'), 'kalora-shell-v4.0.7 debe existir');

  // 2. Las cachés obsoletas deben haber sido eliminadas
  assert.equal(postKeys.includes('kalora-shell-v4.0.2'), false, 'kalora-shell-v4.0.2 debe haber sido eliminada');
  assert.equal(postKeys.includes('micalorias-shell-v3.1'), false, 'micalorias-shell-v3.1 debe haber sido eliminada');

  // 3. Las cachés protegidas deben mantenerse intactas
  assert.ok(postKeys.includes('micalorias-estable-shell-v2.0'), 'micalorias-estable-shell-v2.0 debe seguir protegida e intacta');
  assert.ok(postKeys.includes('third-party-app-cache'), 'third-party-app-cache debe seguir protegida e intacta');
  console.log('[PASS 5/7] Purga selectiva verificada: solo las versiones obsoletas fueron eliminadas, cachés protegidas intactas');

  // Verificar que los recursos se almacenaron en kalora-shell-v4.0.7
  console.log('[TEST-SW 6/7] Verificando lectura de recursos aislados desde kalora-shell-v4.0.7...');
  const hasAssetsInActiveCache = await page.evaluate(async () => {
    const cache = await caches.open('kalora-shell-v4.0.7');
    const indexMatch = await cache.match('./index.html');
    const quickAddMatch = await cache.match('./src/features/meals/quickAddModal.js');
    if (!indexMatch || !quickAddMatch) return false;
    const quickAddText = await quickAddMatch.text();
    return quickAddText.includes('total_consumed') && quickAddText.includes('convertTotalToPer100');
  });
  assert.equal(hasAssetsInActiveCache, true, 'kalora-shell-v4.0.7 debe contener los scripts actualizados con la modalidad de valores totales');
  console.log('[PASS 6/7] Recursos verificados y aislados dentro de kalora-shell-v4.0.7');

  // Probar navegación offline y verificación de persistencia IndexedDB
  console.log('[TEST-SW 7/7] Probando navegación offline (context.setOffline) y verificación de IndexedDB...');
  await context.setOffline(true);

  await page.goto(BASE_URL);
  await page.waitForLoadState('domcontentloaded');

  const offlineTitle = await page.title();
  assert.match(offlineTitle, /Kalora 4\.0/);

  // Ir a Ajustes en modo offline y comprobar versión
  await page.click('[data-view="ajustes"]');
  const versionText = await page.locator('#app-version-label').textContent();
  assert.match(versionText, /Kalora · Versión 4\.0 · Build 4\.0\.7/);

  // Verificar que los datos en IndexedDB siguen existiendo al 100%
  const dbCheck = await page.evaluate(async () => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('micalorias-local-v1', 3);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(['entries', 'foods'], 'readonly');
        const entries = tx.objectStore('entries');
        const foods = tx.objectStore('foods');

        const eReq = entries.get('test-entry-carambola');
        const fReq = foods.get('test-food-apple');

        tx.oncomplete = () => {
          db.close();
          resolve({
            entry: eReq.result,
            food: fReq.result
          });
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  });

  assert.ok(dbCheck.entry, 'El registro de comida en IndexedDB debe existir');
  assert.equal(dbCheck.entry.name, 'Fresco de carambola');
  assert.equal(dbCheck.entry.totalKcal, 180);
  assert.equal(dbCheck.entry.amount, 600);
  assert.ok(dbCheck.food, 'El alimento en la biblioteca de IndexedDB debe existir');
  assert.equal(dbCheck.food.name, 'Manzana Fuji');
  console.log('[PASS 7/7] Modo offline y persistencia 100% de datos en IndexedDB verificados');

  await context.setOffline(false);
  console.log('\n✔ TODAS LAS COMPROBACIONES DE ACTUALIZACIÓN DEL SERVICE WORKER PASARON EXITOSAMENTE (100%)\n');

} catch (err) {
  console.error('\n✖ FALLO EN LA PRUEBA DE ACTUALIZACIÓN SW:', err);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
  console.log('[TEST-SW] Servidor local cerrado limpiamente');
}
