/**
 * touch.js — Control táctil nativo y prevención de zoom accidental para iOS Safari y PWA instalada
 */

/**
 * Detecta si la aplicación se ejecuta en modo standalone (instalada en pantalla de inicio de iPhone)
 * @returns {boolean}
 */
export function isStandalonePWA() {
  return (
    (typeof window !== 'undefined' && window.navigator && window.navigator.standalone === true) ||
    (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
  );
}

/**
 * Aplica configuración estricta de viewport en modo standalone para eliminar ampliaciones accidentales
 */
export function enforceStandaloneViewport() {
  if (typeof document !== 'undefined' && isStandalonePWA()) {
    let vp = document.querySelector('meta[name="viewport"]');
    if (!vp) {
      vp = document.createElement('meta');
      vp.name = 'viewport';
      document.head.appendChild(vp);
    }
    vp.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
  }
}

/**
 * Inicializa todos los interceptores táctiles para emular el comportamiento de una app nativa en iOS
 */
export function initTouchControls() {
  if (typeof document === 'undefined') return;

  enforceStandaloneViewport();
  document.addEventListener('DOMContentLoaded', enforceStandaloneViewport);

  // 1. Bloqueo de gestos multitáctiles (pinch-to-zoom) en PWA instalada
  document.addEventListener('gesturestart', event => {
    if (isStandalonePWA()) event.preventDefault();
  }, { passive: false });

  document.addEventListener('gesturechange', event => {
    if (isStandalonePWA()) event.preventDefault();
  }, { passive: false });

  document.addEventListener('gestureend', event => {
    if (isStandalonePWA()) event.preventDefault();
  }, { passive: false });

  // Bloqueo de inicio de gestos multi-dedo (2 o más dedos)
  document.addEventListener('touchstart', event => {
    if (isStandalonePWA() && event.touches && event.touches.length > 1) {
      event.preventDefault();
    }
  }, { passive: false });

  // 2. Bloqueo activo del doble toque accidental (double-tap to zoom)
  let lastTapEndTime = 0;
  let lastTapX = 0;
  let lastTapY = 0;

  document.addEventListener('touchend', event => {
    if (!isStandalonePWA()) return;
    const touch = event.changedTouches?.[0];
    if (!touch) return;

    const now = Date.now();
    const delta = now - lastTapEndTime;
    const dist = Math.hypot(touch.clientX - lastTapX, touch.clientY - lastTapY);

    lastTapEndTime = now;
    lastTapX = touch.clientX;
    lastTapY = touch.clientY;

    // Detectar segundo toque rápido en la misma zona (<= 350ms y <= 32px)
    if (delta > 0 && delta <= 350 && dist <= 32) {
      const target = event.target;
      const isInteractive = target && target.closest && target.closest(
        'button, input, select, textarea, a, label, [role="button"], [contenteditable="true"]'
      );
      // Neutralizar zoom en tarjetas, fondos, contenedores y textos
      if (!isInteractive) {
        event.preventDefault();
      }
    }
  }, { passive: false });

  // 3. Prevenir evento dblclick nativo de ampliación
  document.addEventListener('dblclick', event => {
    if (isStandalonePWA()) {
      const isInteractive = event.target?.closest?.(
        'button, input, select, textarea, a, label, [role="button"], [contenteditable="true"]'
      );
      if (!isInteractive) {
        event.preventDefault();
      }
    }
  }, { passive: false });
}
