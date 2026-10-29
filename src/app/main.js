/**
 * main.js — Punto de entrada principal de la aplicación MiCalorías
 * Arquitectura modular sobre ES Modules nativos para Safari iOS PWA
 */
import { openDatabase } from '../services/database/db.js';
import { refreshState } from './state.js';
import { bootstrapApp } from './bootstrap.js';
import { initTouchControls } from '../services/pwa/touch.js';
import { setupServiceWorker } from '../services/pwa/serviceWorker.js';

async function init() {
  try {
    // 1. Configurar optimizaciones táctiles nativas de iOS (anti-zoom por doble toque)
    initTouchControls();

    // 2. Conectar a IndexedDB de forma asíncrona
    await openDatabase();

    // 3. Cargar colecciones en el almacén de estado central
    await refreshState();

    // 4. Inicializar interfaz, navegación y escuchadores
    bootstrapApp();

    // 5. Configurar Service Worker y gestión transparente de actualizaciones
    setupServiceWorker();
  } catch (error) {
    console.error('Error durante la inicialización de MiCalorías:', error);
    const main = document.getElementById('main-content');
    if (main) {
      const errBox = document.createElement('div');
      errBox.className = 'empty-state';
      errBox.innerHTML = `
        <strong>Error de inicialización</strong>
        <p>No se pudo cargar la base de datos local en este dispositivo. Intenta recargar la página.</p>
      `;
      main.prepend(errBox);
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
