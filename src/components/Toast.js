/**
 * Toast.js — Componente visual para notificaciones temporales de estado
 */

let toastTimeout = null;

/**
 * Muestra un aviso flotante temporal al usuario
 * @param {string} message 
 * @param {number} [duration=2800] 
 */
export function toast(message, duration = 3000) {
  if (typeof document === 'undefined') return;

  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }

  el.textContent = message;
  el.hidden = false;
  el.classList.add('show');

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    el.hidden = true;
    el.classList.remove('show');
  }, duration);
}
