/**
 * serviceWorker.js — Gestión del ciclo de vida y actualizaciones automáticas del Service Worker en iOS
 */
import { getState } from '../../app/state.js';

let swRegistration = null;
let waitingWorker = null;
let lastUpdateCheck = 0;
const MIN_CHECK_INTERVAL_MS = 60 * 1000;

function isUserBusy() {
  const state = getState();
  if (state.isSaving || state.isExporting) return true;
  if (Array.isArray(state.stagedItems) && state.stagedItems.length > 0) return true;

  // Comprobar si algún diálogo modal se encuentra abierto
  if (typeof document !== 'undefined') {
    const openDialogs = document.querySelectorAll('dialog[open]');
    if (openDialogs.length > 0) return true;

    // Comprobar si hay foco activo en campos de entrada
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) {
      return true;
    }
  }

  return false;
}

function showUpdateBanner() {
  if (typeof document === 'undefined') return;
  const banner = document.getElementById('update-banner');
  if (banner) {
    banner.hidden = false;
  }
}

export function applyPendingUpdate() {
  const targetWorker = waitingWorker || swRegistration?.waiting;
  if (targetWorker) {
    targetWorker.postMessage({ type: 'SKIP_WAITING' });
  }
}

export function checkPendingUpdateOnIdle() {
  if (waitingWorker && !isUserBusy()) {
    showUpdateBanner();
  }
}

function handleWaitingWorker(worker) {
  waitingWorker = worker;
  if (!isUserBusy()) {
    applyPendingUpdate();
  } else {
    showUpdateBanner();
  }
}

export async function checkForUpdates(registration = swRegistration) {
  if (!registration || !navigator.onLine) return;
  const now = Date.now();
  if (now - lastUpdateCheck < MIN_CHECK_INTERVAL_MS) return;
  lastUpdateCheck = now;

  try {
    await registration.update();
  } catch (err) {
    console.debug('Comprobación de actualización omitida o sin conexión:', err);
  }
}

export function setupServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  const btnApply = document.getElementById('btn-apply-update');
  if (btnApply) {
    btnApply.addEventListener('click', applyPendingUpdate);
  }

  let isRefreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (isRefreshing) return;
    isRefreshing = true;
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

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          if (waitingWorker && !isUserBusy()) {
            applyPendingUpdate();
          } else {
            checkForUpdates(registration);
          }
        }
      });

      window.addEventListener('focus', () => {
        if (waitingWorker && !isUserBusy()) {
          applyPendingUpdate();
        } else {
          checkForUpdates(registration);
        }
      });

      window.addEventListener('online', () => {
        checkForUpdates(registration);
      });
    })
    .catch(err => {
      console.warn('Registro de Service Worker falló:', err);
    });
}
