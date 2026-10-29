/**
 * foodEditorModal.js — Modal para creación y edición de alimentos en la biblioteca recurrente
 */
import { getState, refreshState } from '../../app/state.js';
import { makeId } from '../../utils/dates.js';
import { saveFood } from '../../services/database/foodsRepo.js';
import { openModal, closeModal } from '../../components/Modal.js';
import { toast } from '../../components/Toast.js';

const $ = sel => document.querySelector(sel);

let editingFoodId = null;

export function openFoodEditor(food = null) {
  editingFoodId = food?.id || null;
  const isPortion = food?.baseType === 'portion';

  const form = $('#food-form');
  if (form) form.reset();

  const title = $('#food-dialog-title');
  if (title) title.textContent = food ? 'Editar alimento' : 'Nuevo alimento recurrente';

  const nameInput = $('#f-name');
  const brandInput = $('#f-brand');
  if (nameInput) nameInput.value = food?.name || '';
  if (brandInput) brandInput.value = food?.brand || '';

  document.querySelectorAll('input[name="f-base-type"]').forEach(r => {
    r.checked = isPortion ? (r.value === 'portion') : (r.value === 'weight_volume');
  });

  const fWeight = $('#f-fields-weight');
  const fPortion = $('#f-fields-portion');
  if (fWeight) fWeight.hidden = isPortion;
  if (fPortion) fPortion.hidden = !isPortion;

  if (isPortion) {
    const pUnit = $('#f-portion-unit');
    const pDef = $('#f-default-amount-p');
    const pKcal = $('#f-kcal-portion');
    const pProt = $('#f-protein-portion');
    const pGrams = $('#f-portion-grams');

    if (pUnit) pUnit.value = food?.portionUnit || 'scoop';
    if (pDef) pDef.value = food?.defaultAmount ?? 1;
    if (pKcal) pKcal.value = food?.kcalPerPortion ?? '';
    if (pProt) pProt.value = food?.proteinPerPortion ?? '';
    if (pGrams) pGrams.value = food?.portionGrams ?? '';
  } else {
    const wUnit = $('#f-unit');
    const wDef = $('#f-default-amount-w');
    const wKcal = $('#f-kcal100');
    const wProt = $('#f-protein100');

    if (wUnit) wUnit.value = food?.unit || 'g';
    if (wDef) wDef.value = food?.defaultAmount ?? 100;
    if (wKcal) wKcal.value = food?.kcalPer100 ?? '';
    if (wProt) wProt.value = food?.proteinPer100 ?? '';
  }

  const favInput = $('#f-favorite');
  if (favInput) favInput.checked = Boolean(food?.favorite);

  const dialog = $('#food-dialog');
  if (dialog) openModal(dialog);
}

export function closeFoodEditor() {
  const dialog = $('#food-dialog');
  if (dialog) closeModal(dialog);
}

async function handleSaveFoodItem(event) {
  event.preventDefault();
  const name = $('#f-name')?.value.trim();
  const brand = $('#f-brand')?.value.trim() || '';
  const baseType = document.querySelector('input[name="f-base-type"]:checked')?.value || 'weight_volume';
  const favorite = Boolean($('#f-favorite')?.checked);

  if (!name) {
    toast('Introduce el nombre del alimento');
    return;
  }

  let unit = 'g', portionUnit = '', portionGrams = null;
  let kcalPer100 = null, proteinPer100 = null, kcalPerPortion = null, proteinPerPortion = null;
  let defaultAmount = 1;

  if (baseType === 'weight_volume') {
    unit = $('#f-unit')?.value || 'g';
    const def = Number($('#f-default-amount-w')?.value);
    defaultAmount = (Number.isFinite(def) && def > 0) ? def : 100;
    const k = Number($('#f-kcal100')?.value);
    const p = $('#f-protein100')?.value.trim();

    if (!Number.isFinite(k) || k < 0 || k > 10000) {
      toast('Introduce calorías válidas por 100g/ml');
      return;
    }
    kcalPer100 = k;
    if (p && Number.isFinite(Number(p)) && Number(p) >= 0) {
      proteinPer100 = Number(p);
    }
  } else {
    portionUnit = $('#f-portion-unit')?.value.trim() || '';
    if (!portionUnit) {
      toast('Introduce el nombre de la unidad o porción (ej.: scoop, lata)');
      return;
    }
    const def = Number($('#f-default-amount-p')?.value);
    defaultAmount = (Number.isFinite(def) && def > 0) ? def : 1;
    const k = Number($('#f-kcal-portion')?.value);
    const p = $('#f-protein-portion')?.value.trim();
    const g = $('#f-portion-grams')?.value.trim();

    if (!Number.isFinite(k) || k < 0 || k > 10000) {
      toast('Introduce calorías válidas por porción');
      return;
    }
    kcalPerPortion = k;
    if (p && Number.isFinite(Number(p)) && Number(p) >= 0) {
      proteinPerPortion = Number(p);
    }
    if (g && Number.isFinite(Number(g)) && Number(g) > 0) {
      portionGrams = Number(g);
    }
  }

  const record = {
    id: editingFoodId || makeId(),
    name,
    brand,
    baseType,
    unit,
    portionUnit,
    portionGrams,
    kcalPer100,
    proteinPer100,
    kcalPerPortion,
    proteinPerPortion,
    defaultAmount,
    favorite,
    updatedAt: new Date().toISOString()
  };

  try {
    await saveFood(record);
    closeFoodEditor();
    await refreshState();
    toast(editingFoodId ? 'Alimento actualizado' : 'Alimento guardado');
  } catch (err) {
    console.error(err);
    toast('No se pudo guardar');
  }
}

/**
 * Inicializa los escuchadores para el modal de edición de alimentos
 */
export function initFoodEditorListeners() {
  const form = $('#food-form');
  if (form) form.addEventListener('submit', handleSaveFoodItem);

  document.querySelectorAll('input[name="f-base-type"]').forEach(r => {
    r.addEventListener('change', () => {
      const isPortion = r.value === 'portion';
      const fWeight = $('#f-fields-weight');
      const fPortion = $('#f-fields-portion');
      if (fWeight) fWeight.hidden = isPortion;
      if (fPortion) fPortion.hidden = !isPortion;
    });
  });

  const btnClose = $('#btn-close-food-dialog');
  if (btnClose) btnClose.addEventListener('click', closeFoodEditor);
}
