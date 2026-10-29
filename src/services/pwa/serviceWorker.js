/**
 * serviceWorker.js — Gestión del ciclo de vida y actualizaciones automáticas del Service Worker en iOS
 * Implementa salvaguardas contra recargas intempestivas cuando el usuario tiene operaciones activas o datos sin guardar.
 */
import { getState, isPerformingAsyncOperation } from '../../app/state.js';
import { toast } from '../../components/Toast.js';

let swRegistration = null;
let waitingWorker = null;
let lastUpdateCheck = 0;
const MIN_CHECK_INTERVAL_MS = 60 * 1000;

/**
 * Evalúa de forma exhaustiva si existen operaciones en curso o datos sin guardar
 * @returns {boolean}
 */
export function hasUnsavedChanges() {
  const state = getState();

  // 1. Operaciones asíncronas activas (guardado, exportación, importación)
  if (state.isSaving || state.isExporting || state.isImporting) return true;
  if (isPerformingAsyncOperation()) return true;

  // 2. Alimentos en bandeja (staged) aún no guardados en IndexedDB
  if (Array.isArray(state.stagedItems) && state.stagedItems.length > 0) return true;

  if (typeof document === 'undefined') return false;

  // 3. Inspeccionar diálogos modales abiertos con información pendiente
  const quickAdd = document.getElementById('quick-add-dialog');
  if (quickAdd && quickAdd.open) {
    const manualName = document.getElementById('manual-name')?.value?.trim();
    const stagedCount = document.getElementById('staged-items-list')?.children?.length || 0;
    const selectedPanel = document.getElementById('quick-selected-panel');
    if (stagedCount > 0 || manualName || (selectedPanel && !selectedPanel.hidden)) {
      return true;
    }
  }

  const foodDialog = document.getElementById('food-dialog');
  if (foodDialog && foodDialog.open) {
    const name = document.getElementById('f-name')?.value?.trim();
    if (name) return true;
  }

  const weightDialog = document.getElementById('weight-dialog');
  if (weightDialog && weightDialog.open) {
    const wVal = document.getElementById('w-val-input')?.value?.trim();
    if (wVal) return true;
  }

  const entryDialog = document.getElementById('entry-dialog');
  if (entryDialog && entryDialog.open) {
    return true; // Edición de comida en curso
  }

  const useFoodDialog = document.getElementById('use-food-dialog');
  if (useFoodDialog && useFoodDialog.open) {
    return true;
  }

  const goalDialog = document.getElementById('goal-confirm-dialog');
  if (goalDialog && goalDialog.open) {
    return true;
  }

  // 4. Campos con foco activo donde el usuario pueda estar escribiendo
  const active = document.activeElement;
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
    if (active.type !== 'button' && active.type !== 'submit' && active.type !== 'date' && active.type !== 'checkbox') {
      if (active.value && active.value.trim().length > 0) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Determina si el usuario está ocupado (alias para control de ciclo de vida)
 */
export function isUserBusy() {
  return hasUnsavedChanges();
}

export function showUpdateBanner() {
  if (typeof document === 'undefined') return;
  const banner = document.getElementById('update-banner');
  if (banner) {
    banner.hidden = false;
  }
}

export function hideUpdateBanner() {
  if (typeof document === 'undefined') return;
  const banner = document.getElementById('update-banner');
  if (banner) {
    banner.hidden = true;
  }
}

/**
 * Solicita al Service Worker en espera que se active
 * @param {boolean} [force=false] Forzar actualización ignorando cambios sin guardar tras confirmación expresa
 * @returns {boolean} Retorna true si se envió el mensaje de activación
 */
export function applyPendingUpdate(force = false) {
  const targetWorker = waitingWorker || swRegistration?.waiting;
  if (!targetWorker || targetWorker.state === 'redundant') return false;

  if (!force && hasUnsavedChanges()) {
    showUpdateBanner();
    return false;
  }

  targetWorker.postMessage({ type: 'SKIP_WAITING' });
  return true;
}

export function checkPendingUpdateOnIdle() {
  if (waitingWorker && !hasUnsavedChanges()) {
    // Si ya no hay tareas en curso, mostrar aviso o aplicar actualización segura
    showUpdateBanner();
  }
}

function handleWaitingWorker(worker) {
  waitingWorker = worker;
  if (!hasUnsavedChanges()) {
    applyPendingUpdate(false);
  } else {
    showUpdateBanner();
  }
}

/**
 * Consulta activamente al servidor si existe una nueva versión de sw.js
 * @param {ServiceWorkerRegistration} [registration=swRegistration]
 * @param {boolean} [force=false] Bypassear el intervalo mínimo de verificación
 */
export async function checkForUpdates(registration = swRegistration, force = false) {
  if (!registration || !navigator.onLine) {
    return { status: !navigator.onLine ? 'offline' : 'no_registration' };
  }
  const now = Date.now();
  if (!force && now - lastUpdateCheck < MIN_CHECK_INTERVAL_MS) {
    return { status: 'throttled' };
  }
  lastUpdateCheck = now;

  try {
    const reg = await registration.update();
    if (reg.installing || reg.waiting) {
      return { status: 'found' };
    }
    return { status: 'latest' };
  } catch (err) {
    console.debug('Comprobación de actualización omitida o sin conexión:', err);
    return { status: 'error', error: err };
  }
}

export function setupServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  // Manejo del botón manual de actualización del banner
  const btnApply = document.getElementById('btn-apply-update');
  if (btnApply) {
    btnApply.addEventListener('click', () => {
      if (hasUnsavedChanges()) {
        const proceed = confirm('Tienes datos o formularios sin guardar en pantalla.\n\n¿Deseas descartarlos y actualizar a la nueva versión ahora?');
        if (proceed) {
          applyPendingUpdate(true);
        } else {
          toast('Actualización pospuesta. Guarda tus cambios antes de actualizar.');
        }
      } else {
        applyPendingUpdate(true);
      }
    });
  }

  // Prevención de bucles infinitos de recarga y control de activación
  const hadExistingController = Boolean(navigator.serviceWorker.controller);
  let isRefreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (isRefreshing) return;

    // Si es la primera instalación limpia sin controlador anterior, evitar recarga
    if (!hadExistingController) {
      return;
    }

    // Salvaguarda contra recargas cíclicas (< 3 segundos desde la última)
    const lastReload = Number(sessionStorage.getItem('sw_last_reload') || 0);
    const now = Date.now();
    if (now - lastReload < 3000) {
      console.warn('Recarga suprimida para evitar bucle de actualización');
      return;
    }

    isRefreshing = true;
    sessionStorage.setItem('sw_last_reload', String(now));
    window.location.reload();
  });

  navigator.serviceWorker.register('./sw.js', { scope: './' })
    .then(registration => {
      swRegistration = registration;

      if (registration.waiting) {
        handleWaitingWorker(registration.waiting);
      }

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            handleWaitingWorker(newWorker);
          }
        });
      });

      checkForUpdates(registration);

      // Comprobaciones inteligentes al reanudar aplicación desde segundo plano en iOS
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          if (waitingWorker && !hasUnsavedChanges()) {
            applyPendingUpdate(false);
          } else {
            checkForUpdates(registration);
          }
        }
      });

      window.addEventListener('focus', () => {
        if (waitingWorker && !hasUnsavedChanges()) {
          applyPendingUpdate(false);
        } else {
          checkForUpdates(registration);
        }
      });

      window.addEventListener('online', () => {
        checkForUpdates(registration);
      });

      // Escuchar cuando se cierran diálogos para evaluar si la app quedó en reposo (idle)
      document.querySelectorAll('dialog').forEach(dlg => {
        dlg.addEventListener('close', () => {
          setTimeout(checkPendingUpdateOnIdle, 300);
        });
      });
    })
    .catch(err => {
      console.warn('Registro de Service Worker falló:', err);
    });
}
