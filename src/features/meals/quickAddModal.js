/**
 * quickAddModal.js — Modal y flujo interactivo de registro rápido de comidas
 */
import { getState, setState, refreshState, beginAsyncOperation, endAsyncOperation } from '../../app/state.js';
import { navigateTo } from '../../app/router.js';
import { fmt, esc } from '../../utils/formatting.js';
import { makeId, keyName } from '../../utils/dates.js';
import { computeNutrition, convertTotalToPer100, sumKcal, sumProtein, MEALS } from '../../utils/nutrition.js';
import { saveEntry } from '../../services/database/entriesRepo.js';
import { saveFood } from '../../services/database/foodsRepo.js';
import { openModal, closeModal } from '../../components/Modal.js';
import { toast } from '../../components/Toast.js';

const $ = sel => document.querySelector(sel);

let stagedMeal = 'desayuno';
let stagedItems = [];
let selectedFoodForQuickAdd = null;
let isSaving = false;

export function openQuickAdd(meal = 'desayuno') {
  stagedMeal = meal;
  stagedItems = [];
  selectedFoodForQuickAdd = null;
  setState({ stagedItems: [] });

  document.querySelectorAll('.meal-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.mealChoice === stagedMeal);
  });

  setQuickAddMode('library');
  const searchInput = $('#quick-search-input');
  if (searchInput) searchInput.value = '';
  renderQuickFoodsList();
  hideSelectedFoodPanel();
  renderStagedSection();

  const dialog = $('#quick-add-dialog');
  if (dialog) openModal(dialog);
}

export function closeQuickAdd() {
  const dialog = $('#quick-add-dialog');
  if (dialog) closeModal(dialog);
}

function setQuickAddMode(mode) {
  const isLib = mode === 'library';
  const tabLib = $('#tab-mode-library');
  const tabMan = $('#tab-mode-manual');
  const panelLib = $('#quick-add-library-panel');
  const formMan = $('#quick-add-manual-form');

  if (tabLib) tabLib.classList.toggle('active', isLib);
  if (tabMan) tabMan.classList.toggle('active', !isLib);
  if (panelLib) panelLib.hidden = !isLib;
  if (formMan) formMan.hidden = isLib;
}

function renderQuickFoodsList() {
  const { foods } = getState();
  const searchInput = $('#quick-search-input');
  const query = searchInput ? keyName(searchInput.value) : '';
  let list = foods.slice();

  if (query) {
    list = list.filter(f => keyName(f.name).includes(query) || keyName(f.brand || '').includes(query));
  }

  list.sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    return a.name.localeCompare(b.name, 'es');
  });

  const container = $('#quick-foods-list');
  if (!container) return;

  if (!list.length) {
    container.innerHTML = `
      <div style="padding:16px;text-align:center;color:#8f98ae;font-size:12px">
        No hay alimentos coincidentes.<br>
        <button type="button" class="text-button-mini" id="btn-switch-to-manual" style="margin-top:6px">Usar ingreso manual</button>
      </div>
    `;
    const btn = $('#btn-switch-to-manual');
    if (btn) btn.addEventListener('click', () => setQuickAddMode('manual'));
    return;
  }

  container.innerHTML = list.map(f => {
    const isPortion = f.baseType === 'portion';
    const kcal = isPortion ? f.kcalPerPortion : f.kcalPer100;
    const prot = isPortion ? f.proteinPerPortion : f.proteinPer100;
    const unit = isPortion ? (f.portionUnit || 'scoop') : (f.unit || 'g');
    const brandTxt = f.brand ? ` · ${esc(f.brand)}` : '';
    const favStar = f.favorite ? ' ⭐' : '';

    return `
      <button type="button" class="quick-food-item ${selectedFoodForQuickAdd?.id === f.id ? 'selected' : ''}" data-select-quick-food="${esc(f.id)}">
        <div>
          <div class="qf-name">${esc(f.name)}${favStar}</div>
          <div class="qf-meta">${fmt(kcal)} kcal${prot ? ' · ' + fmt(prot) + ' g prot' : ''} / ${esc(unit)}${brandTxt}</div>
        </div>
        <div class="qf-badges">
          <span style="font-size:11px;font-weight:750;color:var(--purple)">Elegir ›</span>
        </div>
      </button>
    `;
  }).join('');
}

function selectFoodForQuickAdd(food) {
  selectedFoodForQuickAdd = food;
  const isPortion = food.baseType === 'portion';
  const unit = isPortion ? (food.portionUnit || 'porción') : (food.unit || 'g');

  const nameEl = $('#q-selected-name');
  const metaEl = $('#q-selected-meta');
  const unitLabel = $('#q-selected-unit-label');
  const amountInput = $('#q-amount-input');
  const panel = $('#quick-selected-panel');

  if (nameEl) nameEl.textContent = `${food.name}${food.brand ? ' (' + food.brand + ')' : ''}`;
  const kcalBase = isPortion ? food.kcalPerPortion : food.kcalPer100;
  const protBase = isPortion ? food.proteinPerPortion : food.proteinPer100;
  if (metaEl) {
    metaEl.textContent = `${fmt(kcalBase)} kcal${protBase !== null && protBase !== undefined ? ' · ' + fmt(protBase) + ' g prot' : ''} por ${unit}`;
  }
  if (unitLabel) unitLabel.textContent = unit;

  const defAmount = food.defaultAmount || (isPortion ? 1 : 100);
  if (amountInput) amountInput.value = defAmount;

  renderQuickAmountChips(isPortion, unit);
  updateQuickPreview();

  if (panel) panel.hidden = false;
  if (amountInput) amountInput.focus();
}

function renderQuickAmountChips(isPortion, unit) {
  const chipsContainer = $('#quick-amount-chips');
  if (!chipsContainer) return;
  let values = [];
  if (isPortion) {
    values = [0.5, 1, 1.5, 2, 3];
  } else {
    values = (unit === 'ml') ? [100, 150, 200, 250, 300] : [50, 100, 150, 200, 250];
  }

  chipsContainer.innerHTML = values.map(v => `
    <button type="button" class="qty-chip" data-set-qty="${v}">${v} ${unit}</button>
  `).join('');
}

function hideSelectedFoodPanel() {
  selectedFoodForQuickAdd = null;
  const panel = $('#quick-selected-panel');
  if (panel) panel.hidden = true;
}

function updateQuickPreview() {
  if (!selectedFoodForQuickAdd) return;
  const amountInput = $('#q-amount-input');
  const amount = Number(amountInput?.value) || 0;
  const item = {
    amount,
    baseType: selectedFoodForQuickAdd.baseType,
    kcalPerPortion: selectedFoodForQuickAdd.kcalPerPortion,
    proteinPerPortion: selectedFoodForQuickAdd.proteinPerPortion,
    kcalPer100: selectedFoodForQuickAdd.kcalPer100,
    proteinPer100: selectedFoodForQuickAdd.proteinPer100
  };
  const computed = computeNutrition(item);
  const prevKcal = $('#q-preview-kcal');
  const prevProt = $('#q-preview-protein');
  if (prevKcal) prevKcal.textContent = `${fmt(computed.kcal)} kcal`;
  if (prevProt) prevProt.textContent = computed.protein !== null ? `${fmt(computed.protein)} g` : '—';
}

function addStagedItemFromLibrary() {
  if (!selectedFoodForQuickAdd) return;
  const amount = Number($('#q-amount-input')?.value);
  if (!Number.isFinite(amount) || amount <= 0) {
    toast('Introduce una cantidad válida mayor a 0');
    return;
  }

  const { currentDate } = getState();
  const isPortion = selectedFoodForQuickAdd.baseType === 'portion';
  const computed = computeNutrition({
    amount,
    baseType: selectedFoodForQuickAdd.baseType,
    kcalPerPortion: selectedFoodForQuickAdd.kcalPerPortion,
    proteinPerPortion: selectedFoodForQuickAdd.proteinPerPortion,
    kcalPer100: selectedFoodForQuickAdd.kcalPer100,
    proteinPer100: selectedFoodForQuickAdd.proteinPer100
  });

  const staged = {
    id: makeId(),
    date: currentDate,
    meal: stagedMeal,
    name: selectedFoodForQuickAdd.name,
    brand: selectedFoodForQuickAdd.brand || '',
    baseType: selectedFoodForQuickAdd.baseType || 'weight_volume',
    amount,
    unit: isPortion ? (selectedFoodForQuickAdd.portionUnit || 'porción') : (selectedFoodForQuickAdd.unit || 'g'),
    portionGrams: selectedFoodForQuickAdd.portionGrams || null,
    kcalPer100: selectedFoodForQuickAdd.kcalPer100 || null,
    proteinPer100: selectedFoodForQuickAdd.proteinPer100 ?? null,
    kcalPerPortion: selectedFoodForQuickAdd.kcalPerPortion || null,
    proteinPerPortion: selectedFoodForQuickAdd.proteinPerPortion ?? null,
    kcal: computed.kcal,
    protein: computed.protein,
    createdAt: new Date().toISOString()
  };

  stagedItems.push(staged);
  setState({ stagedItems: stagedItems.slice() });
  hideSelectedFoodPanel();
  renderStagedSection();
  toast(`“${staged.name}” añadido a la lista`);
}

function addStagedItemFromManual() {
  const nameInput = $('#manual-name');
  const brandInput = $('#manual-brand');
  const checkedBase = document.querySelector('input[name="manual-base-type"]:checked');
  const saveLibCheck = $('#manual-save-to-library');

  const name = nameInput ? nameInput.value.trim() : '';
  const brand = brandInput ? brandInput.value.trim() : '';
  const baseType = checkedBase ? checkedBase.value : 'weight_volume';
  const saveToLibrary = saveLibCheck ? saveLibCheck.checked : false;

  if (!name) {
    toast('Introduce el nombre del alimento');
    return;
  }

  let amount, unit, kcalPer100 = null, proteinPer100 = null, kcalPerPortion = null, proteinPerPortion = null, portionGrams = null;
  let totalKcalInput = null, totalProteinInput = null;

  if (baseType === 'total_consumed') {
    amount = Number($('#manual-t-amount')?.value);
    unit = $('#manual-t-unit')?.value || 'g';
    const kcalRaw = Number($('#manual-t-kcal')?.value);
    const protRaw = $('#manual-t-protein')?.value.trim() || '';

    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(kcalRaw) || kcalRaw < 0) {
      toast('Verifica la cantidad y las calorías totales consumidas');
      return;
    }

    totalKcalInput = kcalRaw;
    if (protRaw !== '' && Number.isFinite(Number(protRaw)) && Number(protRaw) >= 0) {
      totalProteinInput = Number(protRaw);
    }

    const equiv = convertTotalToPer100(totalKcalInput, totalProteinInput, amount);
    kcalPer100 = equiv.kcalPer100;
    proteinPer100 = equiv.proteinPer100;
  } else if (baseType === 'weight_volume') {
    amount = Number($('#manual-w-amount')?.value);
    unit = $('#manual-w-unit')?.value || 'g';
    const kcalRaw = Number($('#manual-w-kcal')?.value);
    const protRaw = $('#manual-w-protein')?.value.trim() || '';

    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(kcalRaw) || kcalRaw < 0) {
      toast('Verifica la cantidad y las calorías');
      return;
    }
    kcalPer100 = kcalRaw;
    if (protRaw !== '' && Number.isFinite(Number(protRaw)) && Number(protRaw) >= 0) {
      proteinPer100 = Number(protRaw);
    }
  } else {
    amount = Number($('#manual-p-amount')?.value);
    unit = $('#manual-p-unit')?.value.trim() || '';
    const kcalRaw = Number($('#manual-p-kcal')?.value);
    const protRaw = $('#manual-p-protein')?.value.trim() || '';
    const pGramsRaw = $('#manual-p-grams')?.value.trim() || '';

    if (!Number.isFinite(amount) || amount <= 0 || !unit || !Number.isFinite(kcalRaw) || kcalRaw < 0) {
      toast('Verifica la cantidad, unidad y calorías por porción');
      return;
    }
    kcalPerPortion = kcalRaw;
    if (protRaw !== '' && Number.isFinite(Number(protRaw)) && Number(protRaw) >= 0) {
      proteinPerPortion = Number(protRaw);
    }
    if (pGramsRaw !== '' && Number.isFinite(Number(pGramsRaw)) && Number(pGramsRaw) > 0) {
      portionGrams = Number(pGramsRaw);
    }
  }

  const computed = computeNutrition({
    amount,
    baseType,
    kcalPer100,
    proteinPer100,
    kcalPerPortion,
    proteinPerPortion,
    totalKcal: totalKcalInput,
    totalProtein: totalProteinInput
  });

  const { currentDate } = getState();
  const staged = {
    id: makeId(),
    date: currentDate,
    meal: stagedMeal,
    name,
    brand,
    baseType,
    amount,
    unit,
    portionGrams,
    kcalPer100,
    proteinPer100,
    kcalPerPortion,
    proteinPerPortion,
    totalKcal: totalKcalInput,
    totalProtein: totalProteinInput,
    kcal: computed.kcal,
    protein: computed.protein,
    saveToLibrary,
    createdAt: new Date().toISOString()
  };

  stagedItems.push(staged);
  setState({ stagedItems: stagedItems.slice() });
  const form = $('#quick-add-manual-form');
  if (form) form.reset();
  if (saveLibCheck) saveLibCheck.checked = true;
  updateManualPreview();
  renderStagedSection();
  toast(`“${staged.name}” añadido a la lista`);
}

function updateManualPreview() {
  const baseType = document.querySelector('input[name="manual-base-type"]:checked')?.value || 'weight_volume';
  let amount = 0, kcalBase = 0, protBase = null, totalKcal = null, totalProtein = null;

  const hint = $('#manual-t-equiv-hint');
  const hintText = $('#manual-t-equiv-text');

  if (baseType === 'total_consumed') {
    amount = Number($('#manual-t-amount')?.value) || 0;
    const unit = $('#manual-t-unit')?.value || 'g';
    totalKcal = Number($('#manual-t-kcal')?.value) || 0;
    const p = $('#manual-t-protein')?.value.trim();
    if (p !== '' && Number.isFinite(Number(p)) && Number(p) >= 0) {
      totalProtein = Number(p);
    }

    if (hint && hintText) {
      if (amount > 0 && totalKcal >= 0) {
        const equiv = convertTotalToPer100(totalKcal, totalProtein, amount);
        hint.hidden = false;
        hintText.textContent = `${fmt(equiv.kcalPer100)} kcal${equiv.proteinPer100 !== null ? ' · ' + fmt(equiv.proteinPer100) + ' g prot' : ''} por 100 ${unit}`;
      } else {
        hint.hidden = true;
      }
    }
  } else if (baseType === 'weight_volume') {
    if (hint) hint.hidden = true;
    amount = Number($('#manual-w-amount')?.value) || 0;
    kcalBase = Number($('#manual-w-kcal')?.value) || 0;
    const p = $('#manual-w-protein')?.value.trim();
    if (p && Number.isFinite(Number(p))) protBase = Number(p);
  } else {
    if (hint) hint.hidden = true;
    amount = Number($('#manual-p-amount')?.value) || 0;
    kcalBase = Number($('#manual-p-kcal')?.value) || 0;
    const p = $('#manual-p-protein')?.value.trim();
    if (p && Number.isFinite(Number(p))) protBase = Number(p);
  }

  const computed = computeNutrition({
    amount,
    baseType,
    kcalPer100: baseType === 'weight_volume' ? kcalBase : null,
    proteinPer100: baseType === 'weight_volume' ? protBase : null,
    kcalPerPortion: baseType === 'portion' ? kcalBase : null,
    proteinPerPortion: baseType === 'portion' ? protBase : null,
    totalKcal: baseType === 'total_consumed' ? totalKcal : null,
    totalProtein: baseType === 'total_consumed' ? totalProtein : null
  });

  const prevKcal = $('#manual-preview-kcal');
  const prevProt = $('#manual-preview-protein');
  if (prevKcal) prevKcal.textContent = `${fmt(computed.kcal)} kcal`;
  if (prevProt) prevProt.textContent = computed.protein !== null ? `${fmt(computed.protein)} g` : '—';
}

function renderStagedSection() {
  const section = $('#staged-section');
  if (!section) return;

  if (!stagedItems.length) {
    section.hidden = true;
    return;
  }

  section.hidden = false;
  const mealObj = MEALS.find(m => m.id === stagedMeal) || MEALS[0];
  const mealNameEl = $('#staged-meal-name');
  const countEl = $('#staged-count');
  if (mealNameEl) mealNameEl.textContent = mealObj.title;
  if (countEl) countEl.textContent = String(stagedItems.length);

  const totalKcal = sumKcal(stagedItems);
  const protSummary = sumProtein(stagedItems);

  const totalKcalEl = $('#staged-total-kcal');
  const totalProtEl = $('#staged-total-protein');
  if (totalKcalEl) totalKcalEl.textContent = `${fmt(totalKcal)} kcal`;
  if (totalProtEl) totalProtEl.textContent = protSummary.hasKnown ? `${fmt(protSummary.total)} g prot` : '— prot';

  const listContainer = $('#staged-items-list');
  if (listContainer) {
    listContainer.innerHTML = stagedItems.map((item, idx) => `
      <div class="staged-item">
        <div>
          <div class="staged-item-info">${esc(item.name)} (${fmt(item.amount)} ${esc(item.unit)})</div>
          <div class="staged-item-sub">${fmt(item.kcal)} kcal${item.protein !== null ? ' · ' + fmt(item.protein) + ' g prot' : ''}</div>
        </div>
        <button type="button" class="mini-action-btn danger" data-remove-staged="${idx}" aria-label="Eliminar">×</button>
      </div>
    `).join('');
  }
}

async function saveEntireMeal() {
  if (!stagedItems.length || isSaving) return;
  isSaving = true;
  beginAsyncOperation('save-meal');
  const saveBtn = $('#btn-save-entire-meal');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Guardando...';
  }

  try {
    const { foods } = getState();

    for (const item of stagedItems) {
      const entryRecord = { ...item };
      delete entryRecord.saveToLibrary;
      await saveEntry(entryRecord);

      if (item.saveToLibrary) {
        const existing = foods.find(f => keyName(f.name) === keyName(item.name));
        const foodRecord = {
          id: existing?.id || makeId(),
          name: item.name,
          brand: item.brand || '',
          baseType: item.baseType === 'portion' ? 'portion' : 'weight_volume',
          unit: item.baseType === 'portion' ? 'g' : (item.unit || 'g'),
          portionUnit: item.baseType === 'portion' ? item.unit : '',
          portionGrams: item.portionGrams || null,
          kcalPer100: item.kcalPer100,
          proteinPer100: item.proteinPer100,
          kcalPerPortion: item.kcalPerPortion,
          proteinPerPortion: item.proteinPerPortion,
          defaultAmount: item.amount,
          favorite: existing?.favorite || false,
          updatedAt: new Date().toISOString()
        };
        await saveFood(foodRecord);
      }
    }

    stagedItems = [];
    setState({ stagedItems: [] });
    closeQuickAdd();
    await refreshState();
    navigateTo('diario');
    toast('¡Comida guardada exitosamente!');
  } catch (error) {
    console.error(error);
    toast('Error al guardar la comida');
  } finally {
    isSaving = false;
    endAsyncOperation('save-meal');
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Guardar comida';
    }
  }
}

/**
 * Inicializa los escuchadores del diálogo Quick Add
 */
export function initQuickAddListeners() {
  // Cambio de comida
  document.querySelectorAll('.meal-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      stagedMeal = chip.dataset.mealChoice;
      document.querySelectorAll('.meal-chip').forEach(c => c.classList.toggle('active', c === chip));
      renderStagedSection();
    });
  });

  // Pestañas Biblioteca vs Manual
  const tabLib = $('#tab-mode-library');
  const tabMan = $('#tab-mode-manual');
  if (tabLib) tabLib.addEventListener('click', () => setQuickAddMode('library'));
  if (tabMan) tabMan.addEventListener('click', () => setQuickAddMode('manual'));

  // Búsqueda en biblioteca
  const searchInput = $('#quick-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderQuickFoodsList();
    });
  }

  // Selección de alimento en biblioteca
  const foodsList = $('#quick-foods-list');
  if (foodsList) {
    foodsList.addEventListener('click', event => {
      const btn = event.target.closest('[data-select-quick-food]');
      if (!btn) return;
      const { foods } = getState();
      const food = foods.find(f => f.id === btn.dataset.selectQuickFood);
      if (food) selectFoodForQuickAdd(food);
    });
  }

  // Chips de cantidad en panel seleccionado
  const chipsContainer = $('#quick-amount-chips');
  if (chipsContainer) {
    chipsContainer.addEventListener('click', event => {
      const btn = event.target.closest('[data-set-qty]');
      if (!btn) return;
      const amountInput = $('#q-amount-input');
      if (amountInput) {
        amountInput.value = btn.dataset.setQty;
        updateQuickPreview();
      }
    });
  }

  const qAmountInput = $('#q-amount-input');
  if (qAmountInput) {
    qAmountInput.addEventListener('input', updateQuickPreview);
  }

  const btnClearSel = $('#btn-clear-selection');
  if (btnClearSel) {
    btnClearSel.addEventListener('click', hideSelectedFoodPanel);
  }

  const btnAddStagedLib = $('#btn-add-staged-from-lib') || $('#btn-add-staged-item');
  if (btnAddStagedLib) {
    btnAddStagedLib.addEventListener('click', addStagedItemFromLibrary);
  }

  // Cambio de tipo en formulario manual (porción vs peso/volumen vs valores totales)
  document.querySelectorAll('input[name="manual-base-type"]').forEach(r => {
    r.addEventListener('change', () => {
      const mode = r.value;
      const fWeight = $('#manual-fields-weight') || $('#manual-weight-fields');
      const fPortion = $('#manual-fields-portion') || $('#manual-portion-fields');
      const fTotal = $('#manual-fields-total') || $('#manual-total-fields');
      if (fWeight) fWeight.hidden = (mode !== 'weight_volume');
      if (fPortion) fPortion.hidden = (mode !== 'portion');
      if (fTotal) fTotal.hidden = (mode !== 'total_consumed');
      updateManualPreview();
    });
  });

  const manualWUnit = $('#manual-w-unit');
  if (manualWUnit) {
    manualWUnit.addEventListener('change', event => {
      document.querySelectorAll('.manual-unit-txt').forEach(el => { el.textContent = event.target.value; });
      updateManualPreview();
    });
  }

  const manualTUnit = $('#manual-t-unit');
  if (manualTUnit) {
    manualTUnit.addEventListener('change', () => {
      updateManualPreview();
    });
  }

  // Inputs en formulario manual
  [
    '#manual-w-amount', '#manual-w-kcal', '#manual-w-protein',
    '#manual-p-amount', '#manual-p-kcal', '#manual-p-protein',
    '#manual-t-amount', '#manual-t-kcal', '#manual-t-protein'
  ].forEach(sel => {
    const el = $(sel);
    if (el) el.addEventListener('input', updateManualPreview);
  });

  const btnAddStagedMan = $('#btn-add-staged-from-manual') || $('#btn-add-manual-item');
  if (btnAddStagedMan) {
    btnAddStagedMan.addEventListener('click', addStagedItemFromManual);
  }

  // Eliminar elemento en bandeja
  const stagedList = $('#staged-items-list');
  if (stagedList) {
    stagedList.addEventListener('click', event => {
      const btn = event.target.closest('[data-remove-staged]');
      if (!btn) return;
      const idx = Number(btn.dataset.removeStaged);
      if (Number.isFinite(idx)) {
        stagedItems.splice(idx, 1);
        setState({ stagedItems: stagedItems.slice() });
        renderStagedSection();
      }
    });
  }

  // Guardar comida entera
  const btnSaveMeal = $('#btn-save-entire-meal');
  if (btnSaveMeal) {
    btnSaveMeal.addEventListener('click', saveEntireMeal);
  }

  // Botón cerrar
  const btnClose = $('#btn-close-quick-add');
  if (btnClose) {
    btnClose.addEventListener('click', closeQuickAdd);
  }
}
