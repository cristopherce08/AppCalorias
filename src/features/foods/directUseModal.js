/**
 * directUseModal.js — Modal para incorporar directamente un alimento de la biblioteca a una comida
 */
import { getState, refreshState, beginAsyncOperation, endAsyncOperation } from '../../app/state.js';
import { navigateTo } from '../../app/router.js';
import { fmt } from '../../utils/formatting.js';
import { makeId } from '../../utils/dates.js';
import { computeNutrition, MEALS } from '../../utils/nutrition.js';
import { saveEntry } from '../../services/database/entriesRepo.js';
import { openModal, closeModal } from '../../components/Modal.js';
import { toast } from '../../components/Toast.js';

const $ = sel => document.querySelector(sel);

let activeFoodForDirectUse = null;
let isSaving = false;

export function openDirectUseFood(food) {
  if (!food) return;
  activeFoodForDirectUse = food;
  const isPortion = food.baseType === 'portion';
  const unit = isPortion ? (food.portionUnit || 'porción') : (food.unit || 'g');

  const nameEl = $('#u-food-name');
  const metaEl = $('#u-food-meta');
  const unitLabel = $('#u-unit-label');
  const amountInput = $('#u-amount-input');
  const mealSelect = $('#u-meal-select');
  const chipsContainer = $('#u-amount-chips');

  if (nameEl) nameEl.textContent = `${food.name}${food.brand ? ' (' + food.brand + ')' : ''}`;
  const kcal = isPortion ? food.kcalPerPortion : food.kcalPer100;
  const prot = isPortion ? food.proteinPerPortion : food.proteinPer100;
  if (metaEl) {
    metaEl.textContent = `${fmt(kcal)} kcal${prot ? ' · ' + fmt(prot) + ' g prot' : ''} por ${isPortion ? unit : '100 ' + unit}`;
  }
  if (unitLabel) unitLabel.textContent = unit;

  const defAmount = food.defaultAmount || (isPortion ? 1 : 100);
  if (amountInput) amountInput.value = defAmount;

  if (mealSelect) {
    const h = new Date().getHours();
    mealSelect.value = h < 11 ? 'desayuno' : h < 16 ? 'almuerzo' : 'cena';
  }

  if (chipsContainer) {
    const values = isPortion ? [0.5, 1, 1.5, 2, 3] : (unit === 'ml' ? [100, 150, 200, 250, 300] : [50, 100, 150, 200, 250]);
    chipsContainer.innerHTML = values.map(v => `
      <button type="button" class="qty-chip" data-set-u-qty="${v}">${v} ${unit}</button>
    `).join('');
  }

  updateDirectUsePreview();
  const dialog = $('#use-food-dialog');
  if (dialog) openModal(dialog);
}

export function closeDirectUseModal() {
  const dialog = $('#use-food-dialog');
  if (dialog) closeModal(dialog);
}

function updateDirectUsePreview() {
  if (!activeFoodForDirectUse) return;
  const amount = Number($('#u-amount-input')?.value) || 0;
  const computed = computeNutrition({
    amount,
    baseType: activeFoodForDirectUse.baseType,
    kcalPerPortion: activeFoodForDirectUse.kcalPerPortion,
    proteinPerPortion: activeFoodForDirectUse.proteinPerPortion,
    kcalPer100: activeFoodForDirectUse.kcalPer100,
    proteinPer100: activeFoodForDirectUse.proteinPer100
  });

  const prevKcal = $('#u-preview-kcal');
  const prevProt = $('#u-preview-protein');
  if (prevKcal) prevKcal.textContent = `${fmt(computed.kcal)} kcal`;
  if (prevProt) prevProt.textContent = computed.protein !== null ? `${fmt(computed.protein)} g` : '—';
}

async function handleConfirmDirectUse(event) {
  event.preventDefault();
  if (!activeFoodForDirectUse || isSaving) return;

  const amount = Number($('#u-amount-input')?.value);
  if (!Number.isFinite(amount) || amount <= 0) {
    toast('Introduce una cantidad válida');
    return;
  }

  isSaving = true;
  beginAsyncOperation('direct-use');
  const meal = $('#u-meal-select')?.value || 'desayuno';
  const isPortion = activeFoodForDirectUse.baseType === 'portion';
  const computed = computeNutrition({
    amount,
    baseType: activeFoodForDirectUse.baseType,
    kcalPerPortion: activeFoodForDirectUse.kcalPerPortion,
    proteinPerPortion: activeFoodForDirectUse.proteinPerPortion,
    kcalPer100: activeFoodForDirectUse.kcalPer100,
    proteinPer100: activeFoodForDirectUse.proteinPer100
  });

  const { currentDate } = getState();
  const entry = {
    id: makeId(),
    date: currentDate,
    meal,
    name: activeFoodForDirectUse.name,
    brand: activeFoodForDirectUse.brand || '',
    baseType: activeFoodForDirectUse.baseType || 'weight_volume',
    amount,
    unit: isPortion ? (activeFoodForDirectUse.portionUnit || 'porción') : (activeFoodForDirectUse.unit || 'g'),
    portionGrams: activeFoodForDirectUse.portionGrams || null,
    kcalPer100: activeFoodForDirectUse.kcalPer100 || null,
    proteinPer100: activeFoodForDirectUse.proteinPer100 ?? null,
    kcalPerPortion: activeFoodForDirectUse.kcalPerPortion || null,
    proteinPerPortion: activeFoodForDirectUse.proteinPerPortion ?? null,
    kcal: computed.kcal,
    protein: computed.protein,
    createdAt: new Date().toISOString()
  };

  try {
    await saveEntry(entry);
    closeDirectUseModal();
    await refreshState();
    navigateTo('diario');
    const mealTitle = MEALS.find(m => m.id === meal)?.title || 'tu diario';
    toast(`Añadido a ${mealTitle}`);
  } catch (err) {
    console.error(err);
    toast('Error al guardar');
  } finally {
    isSaving = false;
    endAsyncOperation('direct-use');
  }
}

/**
 * Inicializa los escuchadores del modal de uso directo
 */
export function initDirectUseListeners() {
  const form = $('#use-food-form');
  if (form) form.addEventListener('submit', handleConfirmDirectUse);

  const amountInput = $('#u-amount-input');
  if (amountInput) amountInput.addEventListener('input', updateDirectUsePreview);

  const chipsContainer = $('#u-amount-chips');
  if (chipsContainer) {
    chipsContainer.addEventListener('click', event => {
      const btn = event.target.closest('[data-set-u-qty]');
      if (!btn) return;
      if (amountInput) {
        amountInput.value = btn.dataset.setUQty;
        updateDirectUsePreview();
      }
    });
  }

  const btnClose = $('#btn-close-use-dialog');
  if (btnClose) btnClose.addEventListener('click', closeDirectUseModal);
}
