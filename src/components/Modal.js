/**
 * Modal.js — Controlador de ciclo de vida, accesibilidad y eventos de cuadros de diálogo
 */

/**
 * Abre un modal de forma segura con soporte nativo de <dialog>
 * @param {HTMLDialogElement} dialogEl 
 */
export function openModal(dialogEl) {
  if (!dialogEl) return;
  if (typeof dialogEl.showModal === 'function') {
    if (!dialogEl.open) dialogEl.showModal();
  } else {
    dialogEl.setAttribute('open', '');
  }
}

/**
 * Cierra un modal de forma segura
 * @param {HTMLDialogElement} dialogEl 
 */
export function closeModal(dialogEl) {
  if (!dialogEl) return;
  if (typeof dialogEl.close === 'function') {
    if (dialogEl.open) dialogEl.close();
  } else {
    dialogEl.removeAttribute('open');
  }
}

/**
 * Configura el cierre al hacer clic fuera del contenido del diálogo (backdrop click)
 * @param {HTMLDialogElement} dialogEl 
 */
export function setupDialogBackdropClick(dialogEl) {
  if (!dialogEl) return;
  dialogEl.addEventListener('click', event => {
    const rect = dialogEl.getBoundingClientRect();
    const isInDialog = (
      rect.top <= event.clientY &&
      event.clientY <= rect.top + rect.height &&
      rect.left <= event.clientX &&
      event.clientX <= rect.left + rect.width
    );
    if (!isInDialog) {
      closeModal(dialogEl);
    }
  });
}
