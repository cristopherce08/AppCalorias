/**
 * router.js — Coordinador de navegación y visualización de pantallas
 */
import { getState, setState } from './state.js';

export const VALID_VIEWS = ['diario', 'alimentos', 'peso', 'calculadora', 'historial', 'ajustes'];

/**
 * Muestra la vista seleccionada y sincroniza la barra de navegación inferior
 * @param {'diario'|'alimentos'|'peso'|'calculadora'|'historial'|'ajustes'} targetView 
 */
export function navigateTo(targetView) {
  if (!VALID_VIEWS.includes(targetView)) {
    targetView = 'diario';
  }

  // Ocultar todas las vistas y mostrar únicamente la deseada
  document.querySelectorAll('.view').forEach(view => {
    view.hidden = (view.id !== `view-${targetView}`);
  });

  // Sincronizar botones de la barra de navegación inferior (.nav-item)
  document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
    const isTarget = btn.dataset.view === targetView;
    btn.classList.toggle('active', isTarget);
    if (isTarget) {
      btn.setAttribute('aria-current', 'page');
    } else {
      btn.removeAttribute('aria-current');
    }
  });

  window.scrollTo({ top: 0, behavior: 'auto' });
  setState({ currentView: targetView });
}

export function getCurrentView() {
  return getState().currentView;
}
