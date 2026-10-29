/**
 * editEntryModal.js — Modal para la edición de registros puntuales de alimentos consumidos
 */
import { getState, refreshState } from '../../app/state.js';
import { fmt } from '../../utils/formatting.js';
import { computeNutrition } from '../../utils/nutrition.js';
import { saveEntry } from '../../services/database/entriesRepo.js';
import { openModal, closeModal } from '../../components/Modal.js';
import { toast } from '../../components/Toast.js';

const $ = sel => document.querySelector(sel);

let editingEntryId = null;
let isSaving = false;

export function openEditEntry(id) {
  const { entries } = getState();
  const e = entries.find(x => x.id === id);
  if (!e) return;
  editingEntryId = id;

  const form = $('#entry-form');
  if (form) form.reset();

  const mealEl = $('#edit-entry-meal');
  const nameEl = $('#edit-entry-name');
  const brandEl = $('#edit-entry-brand');
  const amountEl = $('#edit-entry-amount');
  const unitEl = $('#edit-entry-unit');
  const kcalLabel = $('#edit-kcal-label');
  const protLabel = $('#edit-protein-label');
  const densityKcal = $('#edit-entry-density-kcal');
  const densityProt = $('#edit-entry-density-protein');

  if (mealEl) mealEl.value = e.meal;
  if (nameEl) nameEl.value = e.name;
  if (brandEl) brandEl.value = e.brand || '';
  if (amountEl) amountEl.value = e.amount;
  if (unitEl) unitEl.value = e.unit;

  const isPortion = e.baseType === 'portion';
  if (isPortion) {
    if (kcalLabel && kcalLabel.firstChild) kcalLabel.firstChild.textContent = `Calorías por ${e.unit}`;
    if (protLabel && protLabel.firstChild) protLabel.firstChild.textContent = `Proteínas por ${e.unit} (opcional)`;
    if (densityKcal) densityKcal.value = e.kcalPerPortion ?? '';
    if (densityProt) densityProt.value = e.proteinPerPortion ?? '';
  } else {
    if (kcalLabel && kcalLabel.firstChild) kcalLabel.firstChild.textContent = `Calorías por 100 ${e.unit}`;
    if (protLabel && protLabel.firstChild) protLabel.firstChild.textContent = `Proteínas por 100 ${e.unit} (opcional)`;
    if (densityKcal) densityKcal.value = e.kcalPer100 ?? '';
    if (densityProt) densityProt.value = e.proteinPer100 ?? '';
  }

  updateEditEntryPreview();
  const dialog = $('#entry-dialog');
  if (dialog) openModal(dialog);
}

export function closeEditEntry() {
  const dialog = $('#entry-dialog');
  if (dialog) closeModal(dialog);
}

function updateEditEntryPreview() {
  const { entries } = getState();
  const e = entries.find(x => x.id === editingEntryId);
  const isPortion = e?.baseType === 'portion';
  const amount = Number($('#edit-entry-amount')?.value) || 0;
  const kcalDensity = Number($('#edit-entry-density-kcal')?.value) || 0;
  const protRaw = $('#edit-entry-density-protein')?.value.trim() || '';
  const protDensity = (protRaw !== '' && Number.isFinite(Number(protRaw))) ? Number(protRaw) : null;

  const computed = computeNutrition({
    amount,
    baseType: isPortion ? 'portion' : 'weight_volume',
    kcalPer100: !isPortion ? kcalDensity : null,
    proteinPer100: !isPortion ? protDensity : null,
    kcalPerPortion: isPortion ? kcalDensity : null,
    proteinPerPortion: isPortion ? protDensity : null
  });

  const prevKcal = $('#edit-preview-kcal');
  const prevProt = $('#edit-preview-protein');
  if (prevKcal) prevKcal.textContent = `${fmt(computed.kcal)} kcal`;
  if (prevProt) prevProt.textContent = computed.protein !== null ? `${fmt(computed.protein)} g` : '—';
}

async function handleSaveEditEntry(event) {
  event.preventDefault();
  const { entries } = getState();
  const e = entries.find(x => x.id === editingEntryId);
  if (!e || isSaving) return;

  const name = $('#edit-entry-name')?.value.trim() || '';
  const brand = $('#edit-entry-brand')?.value.trim() || '';
  const meal = $('#edit-entry-meal')?.value || 'desayuno';
  const amount = Number($('#edit-entry-amount')?.value);
  const unit = $('#edit-entry-unit')?.value.trim() || 'g';
  const kcalDensity = Number($('#edit-entry-density-kcal')?.value);
  const protRaw = $('#edit-entry-density-protein')?.value.trim() || '';

  if (!name || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(kcalDensity) || kcalDensity < 0) {
    toast('Revisa los valores del ingrediente');
    return;
  }

  isSaving = true;
  const isPortion = e.baseType === 'portion';
  let protDensity = null;
  if (protRaw !== '' && Number.isFinite(Number(protRaw)) && Number(protRaw) >= 0) {
    protDensity = Number(protRaw);
  }

  const computed = computeNutrition({
    amount,
    baseType: isPortion ? 'portion' : 'weight_volume',
    kcalPer100: !isPortion ? kcalDensity : null,
    proteinPer100: !isPortion ? protDensity : null,
    kcalPerPortion: isPortion ? kcalDensity : null,
    proteinPerPortion: isPortion ? protDensity : null
  });

  const updated = {
    ...e,
    meal,
    name,
    brand,
    amount,
    unit,
    kcalPer100: !isPortion ? kcalDensity : null,
    proteinPer100: !isPortion ? protDensity : null,
    kcalPerPortion: isPortion ? kcalDensity : null,
    proteinPerPortion: isPortion ? protDensity : null,
    kcal: computed.kcal,
    protein: computed.protein
  };

  try {
    await saveEntry(updated);
    closeEditEntry();
    await refreshState();
    toast('Ingrediente actualizado');
  } catch (err) {
    console.error(err);
    toast('Error al actualizar');
  } finally {
    isSaving = false;
  }
}

/**
 * Inicializa los escuchadores para el modal de edición de comida
 */
export function initEditEntryListeners() {
  const form = $('#entry-form');
  if (form) form.addEventListener('submit', handleSaveEditEntry);

  ['#edit-entry-amount', '#edit-entry-density-kcal', '#edit-entry-density-protein'].forEach(sel => {
    const el = $(sel);
    if (el) el.addEventListener('input', updateEditEntryPreview);
  });

  const btnClose = $('#btn-close-entry-dialog');
  if (btnClose) btnClose.addEventListener('click', closeEditEntry);
}
