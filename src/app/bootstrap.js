/**
 * bootstrap.js — Inicialización de componentes, vistas y eventos globales de la aplicación
 */
import { getState, subscribe } from './state.js';
import { navigateTo } from './router.js';
import { setupDialogBackdropClick } from '../components/Modal.js';
import { mountDialogTemplates } from '../components/dialogTemplates.js';
import { renderDashboard, initDashboardListeners } from '../features/dashboard/dashboardView.js';
import { renderFoodsView, initFoodsListeners } from '../features/foods/foodsView.js';
import { renderWeightView, initWeightListeners } from '../features/weight/weightView.js';
import { renderCalculatorView, initCalculatorListeners } from '../features/calculator/calculatorView.js';
import { renderHistoryView, initHistoryListeners } from '../features/history/historyView.js';
import { renderSettingsView, initSettingsListeners } from '../features/settings/settingsView.js';
import { initQuickAddListeners, openQuickAdd } from '../features/meals/quickAddModal.js';
import { initEditEntryListeners } from '../features/meals/editEntryModal.js';
import { initFoodEditorListeners } from '../features/foods/foodEditorModal.js';
import { initDirectUseListeners } from '../features/foods/directUseModal.js';
import { initGoalConfirmListeners } from '../features/calculator/goalConfirmModal.js';
import { initWeightModalListeners } from '../features/weight/weightModal.js';

const $ = sel => document.querySelector(sel);

/**
 * Renderiza todas las pantallas activas
 */
export function renderAllViews() {
  renderDashboard();
  renderFoodsView();
  renderWeightView();
  renderCalculatorView();
  renderHistoryView();
  renderSettingsView();
}

/**
 * Registra todos los escuchadores de eventos y orquesta los componentes
 */
export function bootstrapApp() {
  // Asegurar que los cuadros de diálogo existan en el DOM
  mountDialogTemplates();

  // Inicializar escuchadores por módulo
  initDashboardListeners();
  initFoodsListeners();
  initWeightListeners();
  initCalculatorListeners();
  initHistoryListeners();
  initSettingsListeners();

  // Modales
  initQuickAddListeners();
  initEditEntryListeners();
  initFoodEditorListeners();
  initDirectUseListeners();
  initGoalConfirmListeners();
  initWeightModalListeners();

  // Cerrar modales al hacer clic en el backdrop
  [
    '#quick-add-dialog',
    '#entry-dialog',
    '#food-dialog',
    '#use-food-dialog',
    '#weight-dialog',
    '#goal-confirm-dialog'
  ].forEach(sel => {
    const dialog = $(sel);
    if (dialog) setupDialogBackdropClick(dialog);
  });

  // Barra de navegación inferior
  document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetView = btn.dataset.view;
      if (targetView) navigateTo(targetView);
    });
  });

  // Botón central de navegación rápida "Agregar"
  const navBtnAdd = $('#nav-btn-add');
  if (navBtnAdd) {
    navBtnAdd.addEventListener('click', () => {
      const h = new Date().getHours();
      const defaultMeal = h < 11 ? 'desayuno' : (h < 16 ? 'almuerzo' : 'cena');
      openQuickAdd(defaultMeal);
    });
  }

  // Suscribir renderizadores al almacén de estado reactivo
  subscribe(() => {
    renderAllViews();
  });

  // Render inicial
  renderAllViews();
}
