/**
 * goalConfirmModal.js — Modal de confirmación para activar meta calórica desde la calculadora
 */
import { getState, refreshState } from '../../app/state.js';
import { navigateTo } from '../../app/router.js';
import { fmt } from '../../utils/formatting.js';
import { setSetting } from '../../services/database/settingsRepo.js';
import { openModal, closeModal } from '../../components/Modal.js';
import { toast } from '../../components/Toast.js';

const $ = sel => document.querySelector(sel);

export function openGoalConfirm(proposedKcal) {
  const input = $('#goal-confirm-input');
  const preview = $('#goal-preview-display');
  if (input) input.value = proposedKcal;
  if (preview) preview.textContent = `${fmt(proposedKcal)} kcal`;

  const dialog = $('#goal-confirm-dialog');
  if (dialog) openModal(dialog);
}

export function closeGoalConfirm() {
  const dialog = $('#goal-confirm-dialog');
  if (dialog) closeModal(dialog);
}

async function handleConfirmSetGoal(event) {
  event.preventDefault();
  const val = Number($('#goal-confirm-input')?.value);
  if (!Number.isFinite(val) || val < 500 || val > 15000) {
    toast('Introduce una meta válida entre 500 y 15 000 kcal');
    return;
  }

  try {
    const { settings } = getState();
    await setSetting('goal', val);
    if (settings.pendingGoalReview) {
      await setSetting('pendingGoalReview', null);
    }
    closeGoalConfirm();
    await refreshState();
    navigateTo('diario');
    toast(`Meta de ${fmt(val)} kcal activada en Hoy`);
  } catch (err) {
    console.error(err);
    toast('Error al guardar la meta');
  }
}

/**
 * Inicializa los escuchadores del modal de confirmación de meta
 */
export function initGoalConfirmListeners() {
  const form = $('#goal-confirm-form');
  if (form) form.addEventListener('submit', handleConfirmSetGoal);

  const input = $('#goal-confirm-input');
  if (input) {
    input.addEventListener('input', () => {
      const v = Number(input.value);
      const prev = $('#goal-preview-display');
      if (prev) prev.textContent = Number.isFinite(v) ? `${fmt(v)} kcal` : '— kcal';
    });
  }

  const btnClose = $('#btn-close-goal-dialog');
  if (btnClose) btnClose.addEventListener('click', closeGoalConfirm);
}
