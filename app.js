/* MiCalorías 2.0 — Diario de alimentación y proteínas 100% local.
   Sin servidores externos, sin cuentas, compatible con Safari iOS y GitHub Pages. */
'use strict';

const DB_NAME = 'micalorias-local-v1';
const DB_VERSION = 2;

const MEALS = [
  { id: 'desayuno', title: 'Desayuno', emoji: '☀️' },
  { id: 'almuerzo', title: 'Almuerzo', emoji: '🍽️' },
  { id: 'cena', title: 'Cena', emoji: '🌙' },
  { id: 'snack', title: 'Snacks', emoji: '🍎' }
];

const $ = selector => document.querySelector(selector);
const numberFormat = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 1 });

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const validDate = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.valueOf()) && date.getFullYear() === y && date.getMonth() + 1 === m && date.getDate() === d;
};

const esc = value => String(value ?? '').replace(/[&<>"']/g, x => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[x]));

const fmt = number => {
  if (number === null || number === undefined || !Number.isFinite(Number(number))) return '0';
  return numberFormat.format(Number(number));
};

const keyName = text => String(text || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');

const dateText = date => {
  try {
    return new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${date}T12:00:00`));
  } catch {
    return date;
  }
};

const offsetDate = (date, days) => {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const makeId = () => (typeof crypto !== 'undefined' && crypto.randomUUID)
  ? crypto.randomUUID()
  : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

// ESTADO GLOBAL
let db;
let entries = [];
let foods = [];
let settings = {};
let currentDate = todayISO();
let currentView = 'diario';
let foodFilter = 'all'; // 'all' | 'favs'
let toastTimeout;

// Estado de flujos
let stagedMeal = 'desayuno';
let stagedItems = [];
let selectedFoodForQuickAdd = null;
let activeFoodForDirectUse = null;
let editingEntryId = null;
let editingFoodId = null;
let isSaving = false;

// -------------------------------------------------------------
// 1. BASE DE DATOS LOCAL (IndexedDB con migración a v2)
// -------------------------------------------------------------
function openDatabase() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const database = req.result;
      if (!database.objectStoreNames.contains('entries')) {
        const entryStore = database.createObjectStore('entries', { keyPath: 'id' });
        entryStore.createIndex('date', 'date', { unique: false });
      }
      if (!database.objectStoreNames.contains('foods')) {
        database.createObjectStore('foods', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('settings')) {
        database.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('No se pudo abrir IndexedDB'));
    req.onblocked = () => reject(new Error('La base de datos está bloqueada por otra pestaña. Ciérrala para continuar.'));
  });
}

function getAll(table) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(table, 'readonly');
    const req = tx.objectStore(table).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function mutate(table, method, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(table, 'readwrite');
    const store = tx.objectStore(table);
    store[method](value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Error guardando en el dispositivo'));
    tx.onabort = () => reject(tx.error || new Error('Operación cancelada'));
  });
}

async function refresh() {
  const [newEntries, newFoods, newSettings] = await Promise.all([
    getAll('entries'),
    getAll('foods'),
    getAll('settings')
  ]);
  entries = newEntries || [];
  foods = newFoods || [];
  settings = Object.fromEntries((newSettings || []).map(s => [s.key, s.value]));
  renderAll();
}

// -------------------------------------------------------------
// 2. FÓRMULAS DE CÁLCULO NUTRICIONAL (CALORÍAS Y PROTEÍNAS)
// -------------------------------------------------------------
function computeNutrition(item) {
  const amount = Number(item.amount) || 0;
  const isPortion = item.baseType === 'portion';
  let kcal = 0;
  let protein = null;

  if (isPortion) {
    const kpp = Number(item.kcalPerPortion);
    if (Number.isFinite(kpp)) kcal = amount * kpp;
    const ppp = item.proteinPerPortion;
    if (ppp !== null && ppp !== undefined && ppp !== '' && Number.isFinite(Number(ppp))) {
      protein = amount * Number(ppp);
    }
  } else {
    const kp100 = Number(item.kcalPer100);
    if (Number.isFinite(kp100)) kcal = (amount * kp100) / 100;
    const pp100 = item.proteinPer100;
    if (pp100 !== null && pp100 !== undefined && pp100 !== '' && Number.isFinite(Number(pp100))) {
      protein = (amount * Number(pp100)) / 100;
    }
  }

  return {
    kcal: Math.round(kcal * 10) / 10,
    protein: protein !== null ? Math.round(protein * 10) / 10 : null
  };
}

function sumKcal(list) {
  return list.reduce((total, e) => {
    const val = (Number.isFinite(e.kcal)) ? e.kcal : computeNutrition(e).kcal;
    return total + (Number.isFinite(val) ? val : 0);
  }, 0);
}

function sumProtein(list) {
  let total = 0;
  let knownCount = 0;
  let unknownCount = 0;

  for (const e of list) {
    const p = (e.protein !== undefined && e.protein !== null) ? Number(e.protein) : computeNutrition(e).protein;
    if (p !== null && Number.isFinite(p)) {
      total += p;
      knownCount++;
    } else {
      unknownCount++;
    }
  }

  return {
    total: Math.round(total * 10) / 10,
    isPartial: unknownCount > 0 && knownCount > 0,
    allUnknown: knownCount === 0 && list.length > 0,
    hasKnown: knownCount > 0,
    unknownCount
  };
}

function dayEntries(day) {
  return entries.filter(e => e.date === day);
}

// -------------------------------------------------------------
// 3. RENDERIZADO GENERAL
// -------------------------------------------------------------
function renderAll() {
  renderDiary();
  renderFoods();
  renderHistory();
  renderSettings();
}

function renderDiary() {
  $('#diary-date').value = currentDate;
  $('#date-pretty').textContent = dateText(currentDate);

  const day = dayEntries(currentDate);
  const totalKcal = sumKcal(day);
  const protSummary = sumProtein(day);

  // Totales principales
  $('#day-total-kcal').textContent = fmt(totalKcal);

  if (protSummary.allUnknown) {
    $('#day-total-protein').textContent = '—';
  } else {
    $('#day-total-protein').textContent = fmt(protSummary.total);
  }

  // Indicador de proteínas parciales
  $('#day-protein-partial-badge').hidden = !protSummary.isPartial;
  $('#protein-partial-note').hidden = !protSummary.isPartial;

  // Barra de progreso de calorías
  const goalKcal = Number(settings.goal || 0);
  const kcalWrap = $('#goal-kcal-wrapper');
  if (goalKcal > 0) {
    kcalWrap.hidden = false;
    const pct = Math.min(100, Math.round((totalKcal / goalKcal) * 100));
    $('#progress-fill-kcal').style.width = `${pct}%`;
    $('#progress-bar-kcal').setAttribute('aria-valuenow', String(Math.round(totalKcal)));
    $('#progress-bar-kcal').setAttribute('aria-valuemax', String(goalKcal));
    if (totalKcal > goalKcal) {
      $('#goal-kcal-text').textContent = `${fmt(totalKcal)} / ${fmt(goalKcal)} kcal (+${fmt(totalKcal - goalKcal)} kcal)`;
    } else {
      $('#goal-kcal-text').textContent = `${fmt(totalKcal)} / ${fmt(goalKcal)} kcal (${pct}%)`;
    }
  } else {
    kcalWrap.hidden = true;
  }

  // Barra de progreso de proteínas
  const goalProt = Number(settings.proteinGoal || 0);
  const protWrap = $('#goal-protein-wrapper');
  if (goalProt > 0) {
    protWrap.hidden = false;
    const pct = Math.min(100, Math.round((protSummary.total / goalProt) * 100));
    $('#progress-fill-protein').style.width = `${pct}%`;
    $('#progress-bar-protein').setAttribute('aria-valuenow', String(Math.round(protSummary.total)));
    $('#progress-bar-protein').setAttribute('aria-valuemax', String(goalProt));
    if (protSummary.total > goalProt) {
      $('#goal-protein-text').textContent = `${fmt(protSummary.total)} / ${fmt(goalProt)} g (+${fmt(protSummary.total - goalProt)} g)`;
    } else {
      $('#goal-protein-text').textContent = `${fmt(protSummary.total)} / ${fmt(goalProt)} g (${pct}%)`;
    }
  } else {
    protWrap.hidden = true;
  }

  // Renderizado de comidas
  $('#meals-container').innerHTML = MEALS.map(meal => {
    const list = day.filter(e => e.meal === meal.id).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    const mealKcal = sumKcal(list);
    const mealProt = sumProtein(list);

    let protBadge = '';
    if (mealProt.hasKnown) {
      protBadge = `<span class="pill-protein">${fmt(mealProt.total)} g prot${mealProt.isPartial ? '*' : ''}</span>`;
    } else if (list.length > 0) {
      protBadge = `<span class="pill-protein" style="opacity:.6">— prot</span>`;
    }

    const detail = list.length ? `<div class="meal-items">${list.map(e => {
      const kcalVal = Number.isFinite(e.kcal) ? e.kcal : computeNutrition(e).kcal;
      const protVal = (e.protein !== undefined && e.protein !== null) ? e.protein : computeNutrition(e).protein;

      // Base descriptiva
      let baseTxt = '';
      if (e.baseType === 'portion') {
        baseTxt = `${fmt(e.kcalPerPortion)} kcal${e.proteinPerPortion ? ' · ' + fmt(e.proteinPerPortion) + ' g prot' : ''} / ${esc(e.unit)}`;
      } else {
        baseTxt = `${fmt(e.kcalPer100)} kcal${e.proteinPer100 ? ' · ' + fmt(e.proteinPer100) + ' g prot' : ''} / 100 ${esc(e.unit)}`;
      }

      const brandTag = e.brand ? `<span class="meal-item-brand">${esc(e.brand)}</span>` : '';
      const protDisplay = protVal !== null
        ? `<span class="badge-prot">${fmt(protVal)} g prot</span>`
        : `<span class="badge-prot" style="opacity:.45;background:#f3f4f6;color:#6b7280">— prot</span>`;

      return `
        <div class="meal-item">
          <div>
            <div class="meal-item-name">${esc(e.name)}${brandTag}</div>
            <div class="meal-item-detail">${fmt(e.amount)} ${esc(e.unit)} · ${baseTxt}</div>
          </div>
          <div class="meal-item-side">
            <div class="item-nutri-badges">
              <span class="badge-kcal">${fmt(kcalVal)} kcal</span>
              ${protDisplay}
            </div>
            <button type="button" class="icon-action" data-edit-entry="${esc(e.id)}" aria-label="Editar ${esc(e.name)}">✎</button>
            <button type="button" class="icon-action" data-delete-entry="${esc(e.id)}" aria-label="Eliminar ${esc(e.name)}">×</button>
          </div>
        </div>
      `;
    }).join('')}</div>` : '<div class="meal-empty">Todavía no has registrado alimentos en esta comida</div>';

    return `
      <article class="meal-card">
        <div class="meal-top">
          <div class="meal-title-area">
            <div class="meal-emoji" aria-hidden="true">${meal.emoji}</div>
            <div>
              <div class="meal-name">${meal.title}</div>
              <div class="meal-count">${list.length} ingrediente${list.length === 1 ? '' : 's'}</div>
            </div>
          </div>
          <div class="meal-totals-pill">
            <span class="pill-kcal">${fmt(mealKcal)} kcal</span>
            ${protBadge}
          </div>
        </div>
        ${detail}
        <button type="button" data-add-meal="${meal.id}" class="meal-add">＋ Añadir a ${meal.title.toLowerCase()}</button>
      </article>
    `;
  }).join('');
}

// -------------------------------------------------------------
// 4. BIBLIOTECA "MIS ALIMENTOS"
// -------------------------------------------------------------
function renderFoods() {
  const query = keyName($('#food-search').value);
  const favsCount = foods.filter(f => f.favorite).length;

  $('#count-foods-all').textContent = String(foods.length);
  $('#count-foods-favs').textContent = String(favsCount);

  let filtered = foods.filter(f => {
    const matchesQuery = !query || keyName(f.name).includes(query) || keyName(f.brand || '').includes(query);
    const matchesFilter = (foodFilter === 'all') || (foodFilter === 'favs' && f.favorite);
    return matchesQuery && matchesFilter;
  });

  // Ordenar: favoritos primero, luego alfabéticamente
  filtered.sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    return a.name.localeCompare(b.name, 'es');
  });

  const container = $('#foods-container');
  if (!filtered.length) {
    container.innerHTML = `
      <div class="empty-state">
        <strong>No se encontraron alimentos</strong>
        ${query ? 'Intenta con otro término de búsqueda o crea uno nuevo.' : 'Presiona “＋ Nuevo alimento” para crear tu biblioteca personal de ingredientes habituales.'}
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(f => {
    const brandHtml = f.brand ? `<span class="food-brand-tag">${esc(f.brand)}</span>` : '';
    const isPortion = f.baseType === 'portion';
    const kcalVal = isPortion ? f.kcalPerPortion : f.kcalPer100;
    const protVal = isPortion ? f.proteinPerPortion : f.proteinPer100;
    const unitName = isPortion ? (f.portionUnit || 'porción') : (f.unit || 'g');

    const baseTxt = isPortion ? `por ${esc(unitName)}` : `por 100 ${esc(unitName)}`;
    const gramsTxt = (isPortion && f.portionGrams) ? ` · ${fmt(f.portionGrams)} g` : '';

    return `
      <article class="food-card">
        <div class="food-top">
          <div class="food-title-group">
            <div class="food-name">${esc(f.name)}${brandHtml}</div>
            <div class="food-nutri-line">
              <span class="nutri-pill-kcal">${fmt(kcalVal)} kcal ${baseTxt}</span>
              <span class="nutri-pill-prot">${protVal !== null && protVal !== undefined ? fmt(protVal) + ' g prot' : '— prot'}</span>
            </div>
            ${(isPortion && f.portionGrams) ? `<div class="food-portion-hint">Equivalencia: 1 ${esc(unitName)} = ${fmt(f.portionGrams)} g</div>` : ''}
          </div>
          <button type="button" class="btn-fav ${f.favorite ? 'active' : ''}" data-toggle-fav="${esc(f.id)}" aria-label="${f.favorite ? 'Quitar de favoritos' : 'Marcar favorito'}">
            ${f.favorite ? '★' : '☆'}
          </button>
        </div>
        <div class="food-actions-bar">
          <button type="button" class="btn-use-food" data-use-food-direct="${esc(f.id)}">＋ Usar en comida</button>
          <div class="food-left-actions">
            <button type="button" class="mini-action-btn" data-duplicate-food="${esc(f.id)}" title="Duplicar">Copiar</button>
            <button type="button" class="mini-action-btn" data-edit-food="${esc(f.id)}" aria-label="Editar">✎</button>
            <button type="button" class="mini-action-btn danger" data-delete-food="${esc(f.id)}" aria-label="Eliminar">×</button>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

// -------------------------------------------------------------
// 5. HISTORIAL DE COMIDAS
// -------------------------------------------------------------
function renderHistory() {
  const days = [...new Set(entries.map(e => e.date))].sort().reverse();
  const container = $('#history-container');

  if (!days.length) {
    container.innerHTML = `
      <div class="empty-state">
        <strong>Tu historial está vacío</strong>
        Cuando registres tus primeras comidas, podrás consultar aquí el resumen diario y tus avances.
      </div>
    `;
    return;
  }

  container.innerHTML = days.map(day => {
    const list = dayEntries(day);
    const dayKcal = sumKcal(list);
    const dayProt = sumProtein(list);

    let protTxt = '—';
    if (dayProt.hasKnown) {
      protTxt = `${fmt(dayProt.total)} g prot${dayProt.isPartial ? '*' : ''}`;
    }

    return `
      <button type="button" class="history-card" data-open-date="${day}">
        <span>
          <span class="history-name">${esc(dateText(day))}</span>
          <span class="history-meta">${list.length} ingrediente${list.length === 1 ? '' : 's'} registrado${list.length === 1 ? '' : 's'}</span>
        </span>
        <span class="history-right-stats">
          <span class="history-kcal">${fmt(dayKcal)} kcal</span>
          <span class="history-prot">${protTxt}</span>
        </span>
      </button>
    `;
  }).join('');
}

function renderSettings() {
  $('#goal-input').value = settings.goal ?? '';
  $('#protein-goal-input').value = settings.proteinGoal ?? '';
}

// -------------------------------------------------------------
// 6. MODAL 1: REGISTRO RÁPIDO DE COMIDA ("AGREGAR COMIDA")
// -------------------------------------------------------------
function openQuickAdd(meal = 'desayuno') {
  stagedMeal = meal;
  stagedItems = [];
  selectedFoodForQuickAdd = null;

  // Actualizar selector de comida
  document.querySelectorAll('.meal-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.mealChoice === stagedMeal);
  });

  // Mostrar tab de biblioteca por defecto
  setQuickAddMode('library');
  $('#quick-search-input').value = '';
  renderQuickFoodsList();
  hideSelectedFoodPanel();
  renderStagedSection();

  $('#quick-add-dialog').showModal();
}

function setQuickAddMode(mode) {
  const isLib = mode === 'library';
  $('#tab-mode-library').classList.toggle('active', isLib);
  $('#tab-mode-manual').classList.toggle('active', !isLib);
  $('#quick-add-library-panel').hidden = !isLib;
  $('#quick-add-manual-form').hidden = isLib;
}

function renderQuickFoodsList() {
  const query = keyName($('#quick-search-input').value);
  let list = foods.slice();

  if (query) {
    list = list.filter(f => keyName(f.name).includes(query) || keyName(f.brand || '').includes(query));
  }

  // Favoritos primero
  list.sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    return a.name.localeCompare(b.name, 'es');
  });

  const container = $('#quick-foods-list');
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

  $('#q-selected-name').textContent = `${food.name}${food.brand ? ' (' + food.brand + ')' : ''}`;
  const kcalBase = isPortion ? food.kcalPerPortion : food.kcalPer100;
  const protBase = isPortion ? food.proteinPerPortion : food.proteinPer100;
  $('#q-selected-meta').textContent = `${fmt(kcalBase)} kcal${protBase !== null && protBase !== undefined ? ' · ' + fmt(protBase) + ' g prot' : ''} por ${unit}`;
  $('#q-selected-unit-label').textContent = unit;

  // Cantidad sugerida
  const defAmount = food.defaultAmount || (isPortion ? 1 : 100);
  $('#q-amount-input').value = defAmount;

  // Chips de cantidad rápida
  renderQuickAmountChips(isPortion, unit);
  updateQuickPreview();

  $('#quick-selected-panel').hidden = false;
  $('#q-amount-input').focus();
}

function renderQuickAmountChips(isPortion, unit) {
  const chipsContainer = $('#quick-amount-chips');
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
  $('#quick-selected-panel').hidden = true;
}

function updateQuickPreview() {
  if (!selectedFoodForQuickAdd) return;
  const amount = Number($('#q-amount-input').value) || 0;
  const item = {
    amount,
    baseType: selectedFoodForQuickAdd.baseType,
    kcalPerPortion: selectedFoodForQuickAdd.kcalPerPortion,
    proteinPerPortion: selectedFoodForQuickAdd.proteinPerPortion,
    kcalPer100: selectedFoodForQuickAdd.kcalPer100,
    proteinPer100: selectedFoodForQuickAdd.proteinPer100
  };
  const computed = computeNutrition(item);
  $('#q-preview-kcal').textContent = `${fmt(computed.kcal)} kcal`;
  $('#q-preview-protein').textContent = computed.protein !== null ? `${fmt(computed.protein)} g` : '—';
}

function addStagedItemFromLibrary() {
  if (!selectedFoodForQuickAdd) return;
  const amount = Number($('#q-amount-input').value);
  if (!Number.isFinite(amount) || amount <= 0) {
    toast('Introduce una cantidad válida mayor a 0');
    return;
  }

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
  hideSelectedFoodPanel();
  renderStagedSection();
  toast(`“${staged.name}” añadido a la lista`);
}

function addStagedItemFromManual() {
  const name = $('#manual-name').value.trim();
  const brand = $('#manual-brand').value.trim();
  const baseType = document.querySelector('input[name="manual-base-type"]:checked').value;
  const saveToLibrary = $('#manual-save-to-library').checked;

  if (!name) {
    toast('Introduce el nombre del alimento');
    return;
  }

  let amount, unit, kcalPer100 = null, proteinPer100 = null, kcalPerPortion = null, proteinPerPortion = null, portionGrams = null;

  if (baseType === 'weight_volume') {
    amount = Number($('#manual-w-amount').value);
    unit = $('#manual-w-unit').value;
    const kcalRaw = Number($('#manual-w-kcal').value);
    const protRaw = $('#manual-w-protein').value.trim();

    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(kcalRaw) || kcalRaw < 0) {
      toast('Verifica la cantidad y las calorías por 100g/ml');
      return;
    }
    kcalPer100 = kcalRaw;
    if (protRaw !== '' && Number.isFinite(Number(protRaw)) && Number(protRaw) >= 0) {
      proteinPer100 = Number(protRaw);
    }
  } else {
    amount = Number($('#manual-p-amount').value);
    unit = $('#manual-p-unit').value.trim();
    const kcalRaw = Number($('#manual-p-kcal').value);
    const protRaw = $('#manual-p-protein').value.trim();
    const pGramsRaw = $('#manual-p-grams').value.trim();

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
    proteinPerPortion
  });

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
    kcal: computed.kcal,
    protein: computed.protein,
    saveToLibrary,
    createdAt: new Date().toISOString()
  };

  stagedItems.push(staged);

  // Limpiar formulario manual
  $('#quick-add-manual-form').reset();
  $('#manual-save-to-library').checked = true;
  updateManualPreview();

  renderStagedSection();
  toast(`“${staged.name}” añadido a la lista`);
}

function updateManualPreview() {
  const baseType = document.querySelector('input[name="manual-base-type"]:checked')?.value || 'weight_volume';
  let amount = 0, kcalBase = 0, protBase = null;

  if (baseType === 'weight_volume') {
    amount = Number($('#manual-w-amount').value) || 0;
    kcalBase = Number($('#manual-w-kcal').value) || 0;
    const p = $('#manual-w-protein').value.trim();
    if (p !== '' && Number.isFinite(Number(p))) protBase = Number(p);
  } else {
    amount = Number($('#manual-p-amount').value) || 0;
    kcalBase = Number($('#manual-p-kcal').value) || 0;
    const p = $('#manual-p-protein').value.trim();
    if (p !== '' && Number.isFinite(Number(p))) protBase = Number(p);
  }

  const computed = computeNutrition({
    amount,
    baseType,
    kcalPer100: baseType === 'weight_volume' ? kcalBase : null,
    proteinPer100: baseType === 'weight_volume' ? protBase : null,
    kcalPerPortion: baseType === 'portion' ? kcalBase : null,
    proteinPerPortion: baseType === 'portion' ? protBase : null
  });

  $('#manual-preview-kcal').textContent = `${fmt(computed.kcal)} kcal`;
  $('#manual-preview-protein').textContent = computed.protein !== null ? `${fmt(computed.protein)} g` : '—';
}

function renderStagedSection() {
  const section = $('#staged-section');
  if (!stagedItems.length) {
    section.hidden = true;
    return;
  }

  section.hidden = false;
  const mealObj = MEALS.find(m => m.id === stagedMeal) || MEALS[0];
  $('#staged-meal-name').textContent = mealObj.title;
  $('#staged-count').textContent = String(stagedItems.length);

  const totalKcal = sumKcal(stagedItems);
  const protSummary = sumProtein(stagedItems);

  $('#staged-total-kcal').textContent = `${fmt(totalKcal)} kcal`;
  $('#staged-total-protein').textContent = protSummary.hasKnown ? `${fmt(protSummary.total)} g prot` : '— prot';

  $('#staged-items-list').innerHTML = stagedItems.map((item, idx) => `
    <div class="staged-item">
      <div>
        <div class="staged-item-info">${esc(item.name)} (${fmt(item.amount)} ${esc(item.unit)})</div>
        <div class="staged-item-sub">${fmt(item.kcal)} kcal${item.protein !== null ? ' · ' + fmt(item.protein) + ' g prot' : ''}</div>
      </div>
      <button type="button" class="mini-action-btn danger" data-remove-staged="${idx}" aria-label="Eliminar">×</button>
    </div>
  `).join('');
}

async function saveEntireMeal() {
  if (!stagedItems.length || isSaving) return;
  isSaving = true;
  const saveBtn = $('#btn-save-entire-meal');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Guardando...';

  try {
    for (const item of stagedItems) {
      // Guardar entrada en el diario
      const entryRecord = { ...item };
      delete entryRecord.saveToLibrary;
      await mutate('entries', 'put', entryRecord);

      // Si el usuario marcó guardar en su biblioteca de Mis alimentos
      if (item.saveToLibrary) {
        const existing = foods.find(f => keyName(f.name) === keyName(item.name));
        const foodRecord = {
          id: existing?.id || makeId(),
          name: item.name,
          brand: item.brand || '',
          baseType: item.baseType,
          unit: item.baseType === 'weight_volume' ? item.unit : 'g',
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
        await mutate('foods', 'put', foodRecord);
      }
    }

    stagedItems = [];
    $('#quick-add-dialog').close();
    await refresh();
    showView('diario');
    toast('¡Comida registrada exitosamente!');
  } catch (error) {
    console.error(error);
    toast('Error al guardar la comida en el dispositivo');
  } finally {
    isSaving = false;
    saveBtn.disabled = false;
    saveBtn.textContent = 'Guardar comida';
  }
}

// -------------------------------------------------------------
// 7. MODAL 2: CREAR / EDITAR ALIMENTO EN "MIS ALIMENTOS"
// -------------------------------------------------------------
function openFoodEditor(food = null) {
  editingFoodId = food?.id || null;
  const isPortion = food?.baseType === 'portion';

  $('#food-form').reset();
  $('#food-dialog-title').textContent = food ? 'Editar alimento' : 'Nuevo alimento recurrente';
  $('#f-name').value = food?.name || '';
  $('#f-brand').value = food?.brand || '';

  const radios = document.querySelectorAll('input[name="f-base-type"]');
  radios.forEach(r => { r.checked = isPortion ? (r.value === 'portion') : (r.value === 'weight_volume'); });

  $('#f-fields-weight').hidden = isPortion;
  $('#f-fields-portion').hidden = !isPortion;

  if (isPortion) {
    $('#f-portion-unit').value = food?.portionUnit || 'scoop';
    $('#f-default-amount-p').value = food?.defaultAmount ?? 1;
    $('#f-kcal-portion').value = food?.kcalPerPortion ?? '';
    $('#f-protein-portion').value = food?.proteinPerPortion ?? '';
    $('#f-portion-grams').value = food?.portionGrams ?? '';
  } else {
    $('#f-unit').value = food?.unit || 'g';
    $('#f-default-amount-w').value = food?.defaultAmount ?? 100;
    $('#f-kcal100').value = food?.kcalPer100 ?? '';
    $('#f-protein100').value = food?.proteinPer100 ?? '';
  }

  $('#f-favorite').checked = Boolean(food?.favorite);
  $('#food-dialog').showModal();
}

async function saveFoodItem(event) {
  event.preventDefault();
  const name = $('#f-name').value.trim();
  const brand = $('#f-brand').value.trim();
  const baseType = document.querySelector('input[name="f-base-type"]:checked').value;
  const favorite = $('#f-favorite').checked;

  if (!name) {
    toast('Introduce el nombre del alimento');
    return;
  }

  let unit = 'g', portionUnit = '', portionGrams = null;
  let kcalPer100 = null, proteinPer100 = null, kcalPerPortion = null, proteinPerPortion = null;
  let defaultAmount = 1;

  if (baseType === 'weight_volume') {
    unit = $('#f-unit').value;
    const def = Number($('#f-default-amount-w').value);
    defaultAmount = (Number.isFinite(def) && def > 0) ? def : 100;
    const k = Number($('#f-kcal100').value);
    const p = $('#f-protein100').value.trim();

    if (!Number.isFinite(k) || k < 0 || k > 10000) {
      toast('Introduce calorías válidas por 100g/ml');
      return;
    }
    kcalPer100 = k;
    if (p !== '' && Number.isFinite(Number(p)) && Number(p) >= 0) {
      proteinPer100 = Number(p);
    }
  } else {
    portionUnit = $('#f-portion-unit').value.trim();
    if (!portionUnit) {
      toast('Introduce el nombre de la unidad o porción (ej.: scoop, lata, unidad)');
      return;
    }
    const def = Number($('#f-default-amount-p').value);
    defaultAmount = (Number.isFinite(def) && def > 0) ? def : 1;
    const k = Number($('#f-kcal-portion').value);
    const p = $('#f-protein-portion').value.trim();
    const g = $('#f-portion-grams').value.trim();

    if (!Number.isFinite(k) || k < 0 || k > 10000) {
      toast('Introduce calorías válidas por porción');
      return;
    }
    kcalPerPortion = k;
    if (p !== '' && Number.isFinite(Number(p)) && Number(p) >= 0) {
      proteinPerPortion = Number(p);
    }
    if (g !== '' && Number.isFinite(Number(g)) && Number(g) > 0) {
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
    await mutate('foods', 'put', record);
    $('#food-dialog').close();
    await refresh();
    toast(editingFoodId ? 'Alimento actualizado' : 'Alimento guardado en tu biblioteca');
  } catch (err) {
    console.error(err);
    toast('No se pudo guardar el alimento');
  }
}

async function duplicateFood(id) {
  const f = foods.find(x => x.id === id);
  if (!f) return;
  const clone = {
    ...f,
    id: null,
    name: `${f.name} (copia)`,
    favorite: false
  };
  openFoodEditor(clone);
}

async function toggleFoodFavorite(id) {
  const f = foods.find(x => x.id === id);
  if (!f) return;
  f.favorite = !f.favorite;
  f.updatedAt = new Date().toISOString();
  await mutate('foods', 'put', f);
  await refresh();
  toast(f.favorite ? 'Marcado como favorito ⭐' : 'Quitado de favoritos');
}

async function deleteFood(id) {
  const f = foods.find(x => x.id === id);
  if (!f) return;
  if (!confirm(`¿Eliminar “${f.name}” de tu biblioteca?\n\nLos registros que ya guardaste en tu historial se mantendrán intactos con sus calorías y proteínas originales.`)) {
    return;
  }
  try {
    await mutate('foods', 'delete', id);
    await refresh();
    toast('Alimento eliminado de la biblioteca');
  } catch (err) {
    console.error(err);
    toast('No se pudo eliminar');
  }
}

// -------------------------------------------------------------
// 8. MODAL 4: USAR ALIMENTO DIRECTO DESDE MIS ALIMENTOS
// -------------------------------------------------------------
function openDirectUseFood(food) {
  activeFoodForDirectUse = food;
  const isPortion = food.baseType === 'portion';
  const unit = isPortion ? (food.portionUnit || 'porción') : (food.unit || 'g');

  $('#u-food-name').textContent = `${food.name}${food.brand ? ' (' + food.brand + ')' : ''}`;
  const kcal = isPortion ? food.kcalPerPortion : food.kcalPer100;
  const prot = isPortion ? food.proteinPerPortion : food.proteinPer100;
  $('#u-food-meta').textContent = `${fmt(kcal)} kcal${prot ? ' · ' + fmt(prot) + ' g prot' : ''} por ${isPortion ? unit : '100 ' + unit}`;
  $('#u-unit-label').textContent = unit;

  // Cantidad por defecto
  const defAmount = food.defaultAmount || (isPortion ? 1 : 100);
  $('#u-amount-input').value = defAmount;

  // Selector de comida según hora
  const h = new Date().getHours();
  $('#u-meal-select').value = h < 11 ? 'desayuno' : h < 16 ? 'almuerzo' : 'cena';

  // Chips
  const chipsContainer = $('#u-amount-chips');
  const values = isPortion ? [0.5, 1, 1.5, 2, 3] : (unit === 'ml' ? [100, 150, 200, 250, 300] : [50, 100, 150, 200, 250]);
  chipsContainer.innerHTML = values.map(v => `
    <button type="button" class="qty-chip" data-set-u-qty="${v}">${v} ${unit}</button>
  `).join('');

  updateDirectUsePreview();
  $('#use-food-dialog').showModal();
}

function updateDirectUsePreview() {
  if (!activeFoodForDirectUse) return;
  const amount = Number($('#u-amount-input').value) || 0;
  const computed = computeNutrition({
    amount,
    baseType: activeFoodForDirectUse.baseType,
    kcalPerPortion: activeFoodForDirectUse.kcalPerPortion,
    proteinPerPortion: activeFoodForDirectUse.proteinPerPortion,
    kcalPer100: activeFoodForDirectUse.kcalPer100,
    proteinPer100: activeFoodForDirectUse.proteinPer100
  });

  $('#u-preview-kcal').textContent = `${fmt(computed.kcal)} kcal`;
  $('#u-preview-protein').textContent = computed.protein !== null ? `${fmt(computed.protein)} g` : '—';
}

async function confirmDirectUseFood(event) {
  event.preventDefault();
  if (!activeFoodForDirectUse || isSaving) return;
  const amount = Number($('#u-amount-input').value);
  if (!Number.isFinite(amount) || amount <= 0) {
    toast('Introduce una cantidad válida');
    return;
  }

  isSaving = true;
  const meal = $('#u-meal-select').value;
  const isPortion = activeFoodForDirectUse.baseType === 'portion';
  const computed = computeNutrition({
    amount,
    baseType: activeFoodForDirectUse.baseType,
    kcalPerPortion: activeFoodForDirectUse.kcalPerPortion,
    proteinPerPortion: activeFoodForDirectUse.proteinPerPortion,
    kcalPer100: activeFoodForDirectUse.kcalPer100,
    proteinPer100: activeFoodForDirectUse.proteinPer100
  });

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
    await mutate('entries', 'put', entry);
    $('#use-food-dialog').close();
    await refresh();
    showView('diario');
    toast(`Añadido a ${MEALS.find(m => m.id === meal)?.title || 'tu diario'}`);
  } catch (err) {
    console.error(err);
    toast('Error al guardar');
  } finally {
    isSaving = false;
  }
}

// -------------------------------------------------------------
// 9. MODAL 3: EDITAR INGREDIENTE YA GUARDADO EN EL DIARIO
// -------------------------------------------------------------
function openEditEntry(id) {
  const e = entries.find(x => x.id === id);
  if (!e) return;
  editingEntryId = id;

  $('#entry-form').reset();
  $('#edit-entry-meal').value = e.meal;
  $('#edit-entry-name').value = e.name;
  $('#edit-entry-brand').value = e.brand || '';
  $('#edit-entry-amount').value = e.amount;
  $('#edit-entry-unit').value = e.unit;

  const isPortion = e.baseType === 'portion';
  if (isPortion) {
    $('#edit-kcal-label').firstChild.textContent = `Calorías por ${e.unit}`;
    $('#edit-protein-label').firstChild.textContent = `Proteínas por ${e.unit} (opcional)`;
    $('#edit-entry-density-kcal').value = e.kcalPerPortion ?? '';
    $('#edit-entry-density-protein').value = e.proteinPerPortion ?? '';
  } else {
    $('#edit-kcal-label').firstChild.textContent = `Calorías por 100 ${e.unit}`;
    $('#edit-protein-label').firstChild.textContent = `Proteínas por 100 ${e.unit} (opcional)`;
    $('#edit-entry-density-kcal').value = e.kcalPer100 ?? '';
    $('#edit-entry-density-protein').value = e.proteinPer100 ?? '';
  }

  updateEditEntryPreview();
  $('#entry-dialog').showModal();
}

function updateEditEntryPreview() {
  const e = entries.find(x => x.id === editingEntryId);
  const isPortion = e?.baseType === 'portion';
  const amount = Number($('#edit-entry-amount').value) || 0;
  const kcalDensity = Number($('#edit-entry-density-kcal').value) || 0;
  const protRaw = $('#edit-entry-density-protein').value.trim();
  const protDensity = (protRaw !== '' && Number.isFinite(Number(protRaw))) ? Number(protRaw) : null;

  const computed = computeNutrition({
    amount,
    baseType: isPortion ? 'portion' : 'weight_volume',
    kcalPer100: !isPortion ? kcalDensity : null,
    proteinPer100: !isPortion ? protDensity : null,
    kcalPerPortion: isPortion ? kcalDensity : null,
    proteinPerPortion: isPortion ? protDensity : null
  });

  $('#edit-preview-kcal').textContent = `${fmt(computed.kcal)} kcal`;
  $('#edit-preview-protein').textContent = computed.protein !== null ? `${fmt(computed.protein)} g` : '—';
}

async function saveEditEntry(event) {
  event.preventDefault();
  const e = entries.find(x => x.id === editingEntryId);
  if (!e || isSaving) return;

  const name = $('#edit-entry-name').value.trim();
  const brand = $('#edit-entry-brand').value.trim();
  const meal = $('#edit-entry-meal').value;
  const amount = Number($('#edit-entry-amount').value);
  const unit = $('#edit-entry-unit').value.trim();
  const kcalDensity = Number($('#edit-entry-density-kcal').value);
  const protRaw = $('#edit-entry-density-protein').value.trim();

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
    await mutate('entries', 'put', updated);
    $('#entry-dialog').close();
    await refresh();
    toast('Ingrediente actualizado');
  } catch (err) {
    console.error(err);
    toast('Error al actualizar');
  } finally {
    isSaving = false;
  }
}

async function deleteEntry(id) {
  const e = entries.find(x => x.id === id);
  if (!e) return;
  if (!confirm(`¿Eliminar “${e.name}” de este día?`)) return;
  try {
    await mutate('entries', 'delete', id);
    await refresh();
    toast('Ingrediente eliminado');
  } catch (err) {
    console.error(err);
    toast('No se pudo eliminar');
  }
}

// -------------------------------------------------------------
// 10. AJUSTES (OBJETIVOS Y RESPALDOS JSON COMPATIBLES V1 Y V2)
// -------------------------------------------------------------
async function saveGoals() {
  const rawKcal = $('#goal-input').value.trim();
  const valKcal = rawKcal === '' ? null : Number(rawKcal);
  if (valKcal !== null && (!Number.isFinite(valKcal) || valKcal < 0 || valKcal > 20000)) {
    toast('Introduce un objetivo de calorías entre 0 y 20 000');
    return;
  }

  const rawProt = $('#protein-goal-input').value.trim();
  const valProt = rawProt === '' ? null : Number(rawProt);
  if (valProt !== null && (!Number.isFinite(valProt) || valProt < 0 || valProt > 1000)) {
    toast('Introduce un objetivo de proteínas entre 0 y 1 000');
    return;
  }

  try {
    await mutate('settings', 'put', { key: 'goal', value: valKcal });
    await mutate('settings', 'put', { key: 'proteinGoal', value: valProt });
    await refresh();
    toast('Objetivos guardados');
  } catch (err) {
    console.error(err);
    toast('No se pudieron guardar los objetivos');
  }
}

function getExportData() {
  return {
    app: 'MiCalorías',
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    entries,
    foods,
    settings: Object.entries(settings).map(([key, value]) => ({ key, value }))
  };
}

async function exportData() {
  try {
    const blob = new Blob([JSON.stringify(getExportData(), null, 2)], { type: 'application/json' });
    const name = `micalorias-respaldo-${todayISO()}.json`;
    const file = new File([blob], name, { type: 'application/json' });

    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Respaldo de MiCalorías' });
        toast('Elige dónde guardar tu respaldo');
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('Respaldo descargado');
  } catch (err) {
    console.error(err);
    toast('No se pudo exportar el respaldo');
  }
}

function validateAndMigrateImport(json) {
  if (!json || json.app !== 'MiCalorías' || ![1, 2].includes(json.schemaVersion) || !Array.isArray(json.entries) || !Array.isArray(json.foods) || !Array.isArray(json.settings)) {
    throw new Error('El archivo no es un respaldo compatible de MiCalorías');
  }

  if (json.entries.length > 200000 || json.foods.length > 20000 || json.settings.length > 100) {
    throw new Error('El archivo contiene demasiados registros');
  }

  const isV1 = json.schemaVersion === 1;
  const migratedEntries = [];
  const migratedFoods = [];
  const seenEntries = new Set();
  const seenFoods = new Set();

  for (const e of json.entries) {
    if (!e || typeof e.id !== 'string' || e.id.length > 150 || !validDate(e.date) || !MEALS.some(m => m.id === e.meal) || typeof e.name !== 'string' || !e.name.trim() || e.name.length > 120 || !Number.isFinite(e.amount) || e.amount <= 0 || seenEntries.has(e.id)) {
      throw new Error(`Entrada inválida en el respaldo: ${e?.name || 'sin nombre'}`);
    }
    seenEntries.add(e.id);

    // Compatibilidad v1 -> v2
    const baseType = e.baseType || 'weight_volume';
    const computed = computeNutrition({
      amount: e.amount,
      baseType,
      kcalPer100: e.kcalPer100 ?? null,
      proteinPer100: e.proteinPer100 ?? null,
      kcalPerPortion: e.kcalPerPortion ?? null,
      proteinPerPortion: e.proteinPerPortion ?? null
    });

    migratedEntries.push({
      id: e.id,
      date: e.date,
      meal: e.meal,
      name: e.name,
      brand: e.brand || '',
      baseType,
      amount: e.amount,
      unit: e.unit || 'g',
      portionGrams: e.portionGrams || null,
      kcalPer100: e.kcalPer100 ?? null,
      proteinPer100: e.proteinPer100 ?? null,
      kcalPerPortion: e.kcalPerPortion ?? null,
      proteinPerPortion: e.proteinPerPortion ?? null,
      kcal: (Number.isFinite(e.kcal)) ? e.kcal : computed.kcal,
      protein: (e.protein !== undefined && e.protein !== null) ? e.protein : computed.protein,
      createdAt: e.createdAt || new Date().toISOString()
    });
  }

  for (const f of json.foods) {
    if (!f || typeof f.id !== 'string' || f.id.length > 150 || typeof f.name !== 'string' || !f.name.trim() || f.name.length > 120 || seenFoods.has(f.id)) {
      throw new Error(`Alimento inválido en el respaldo: ${f?.name || 'sin nombre'}`);
    }
    seenFoods.add(f.id);

    migratedFoods.push({
      id: f.id,
      name: f.name,
      brand: f.brand || '',
      baseType: f.baseType || 'weight_volume',
      unit: f.unit || 'g',
      portionUnit: f.portionUnit || '',
      portionGrams: f.portionGrams || null,
      kcalPer100: f.kcalPer100 ?? null,
      proteinPer100: f.proteinPer100 ?? null,
      kcalPerPortion: f.kcalPerPortion ?? null,
      proteinPerPortion: f.proteinPerPortion ?? null,
      defaultAmount: f.defaultAmount || 1,
      favorite: Boolean(f.favorite),
      updatedAt: f.updatedAt || new Date().toISOString()
    });
  }

  const seenSettings = new Set();
  const migratedSettings = [];
  for (const s of json.settings) {
    if (!s || !['goal', 'proteinGoal'].includes(s.key) || seenSettings.has(s.key)) continue;
    seenSettings.add(s.key);
    if (s.value === null || (Number.isFinite(s.value) && s.value >= 0 && s.value <= 20000)) {
      migratedSettings.push(s);
    }
  }

  return {
    entries: migratedEntries,
    foods: migratedFoods,
    settings: migratedSettings
  };
}

function importTransaction(data) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['entries', 'foods', 'settings'], 'readwrite');
    for (const name of ['entries', 'foods', 'settings']) tx.objectStore(name).clear();
    for (const e of data.entries) tx.objectStore('entries').put(e);
    for (const f of data.foods) tx.objectStore('foods').put(f);
    for (const s of data.settings) tx.objectStore('settings').put(s);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function importData(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;

  try {
    if (file.size > 50_000_000) throw new Error('El archivo supera los 50 MB permitidos');
    const parsed = JSON.parse(await file.text());
    const migrated = validateAndMigrateImport(parsed);

    const versionNote = parsed.schemaVersion === 1 ? ' (migrado automáticamente desde v1.0)' : '';
    if (!confirm(`Este respaldo contiene ${migrated.entries.length} registros y ${migrated.foods.length} alimentos${versionNote}.\n\n¿Sustituir TODOS los datos actuales en este iPhone? Esta acción no se puede deshacer.`)) {
      return;
    }

    await importTransaction(migrated);
    currentDate = todayISO();
    await refresh();
    showView('diario');
    toast('Respaldo importado correctamente');
  } catch (err) {
    console.error(err);
    alert(`No se importó el respaldo: ${err.message || 'formato inválido'}`);
  }
}

// -------------------------------------------------------------
// 11. PERSISTENCIA Y EVENTOS
// -------------------------------------------------------------
async function checkStorage() {
  try {
    const protectedStorage = await navigator.storage?.persisted?.();
    $('#storage-status').textContent = protectedStorage
      ? '✓ Almacenamiento persistente concedido en este iPhone'
      : 'Almacenamiento local activo (sin garantía de permanencia)';
  } catch {
    $('#storage-status').textContent = 'Los datos están guardados localmente en tu iPhone';
  }
}

async function requestPersistence() {
  try {
    if (!navigator.storage?.persist) {
      toast('Tu navegador no admite solicitar protección persistente');
      return;
    }
    const granted = await navigator.storage.persist();
    await checkStorage();
    toast(granted ? 'Protección de almacenamiento concedida' : 'No se concedió protección; mantén respaldos periódicos');
  } catch {
    toast('No se pudo solicitar la protección');
  }
}

function showView(view) {
  if (!['diario', 'alimentos', 'historial', 'ajustes'].includes(view)) return;
  currentView = view;
  document.querySelectorAll('.view').forEach(el => {
    el.hidden = el.id !== `view-${view}`;
  });
  document.querySelectorAll('.nav-item').forEach(el => {
    const active = el.dataset.view === view;
    el.classList.toggle('active', active);
    if (active) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { el.hidden = true; }, 3200);
}

// -------------------------------------------------------------
// 12. VINCULACIÓN DE EVENTOS DEL DOM
// -------------------------------------------------------------
function attachEvents() {
  // Navegación
  document.querySelectorAll('[data-view]').forEach(button => {
    button.addEventListener('click', () => showView(button.dataset.view));
  });

  $('#nav-btn-add').addEventListener('click', () => {
    const h = new Date().getHours();
    openQuickAdd(h < 11 ? 'desayuno' : h < 16 ? 'almuerzo' : 'cena');
  });

  // Diario: navegación por fecha
  $('#btn-today').addEventListener('click', () => { currentDate = todayISO(); renderDiary(); });
  $('#btn-prev-date').addEventListener('click', () => { currentDate = offsetDate(currentDate, -1); renderDiary(); });
  $('#btn-next-date').addEventListener('click', () => { currentDate = offsetDate(currentDate, 1); renderDiary(); });
  $('#diary-date').addEventListener('change', event => {
    if (validDate(event.target.value)) {
      currentDate = event.target.value;
      renderDiary();
    }
  });

  // Botón registrar comida en pantalla principal
  $('#btn-quick-add-main').addEventListener('click', () => {
    const h = new Date().getHours();
    openQuickAdd(h < 11 ? 'desayuno' : h < 16 ? 'almuerzo' : 'cena');
  });

  // Delegación de eventos en las comidas del diario
  $('#meals-container').addEventListener('click', event => {
    const btn = event.target.closest('button');
    if (!btn) return;
    if (btn.dataset.addMeal) {
      openQuickAdd(btn.dataset.addMeal);
    }
    if (btn.dataset.editEntry) {
      openEditEntry(btn.dataset.editEntry);
    }
    if (btn.dataset.deleteEntry) {
      deleteEntry(btn.dataset.deleteEntry);
    }
  });

  // Delegación en Historial
  $('#history-container').addEventListener('click', event => {
    const btn = event.target.closest('[data-open-date]');
    if (btn) {
      currentDate = btn.dataset.openDate;
      showView('diario');
      renderDiary();
    }
  });

  // Biblioteca: Búsqueda y Filtros
  $('#food-search').addEventListener('input', renderFoods);
  $('#chip-filter-all').addEventListener('click', () => {
    foodFilter = 'all';
    $('#chip-filter-all').classList.add('active');
    $('#chip-filter-favs').classList.remove('active');
    renderFoods();
  });
  $('#chip-filter-favs').addEventListener('click', () => {
    foodFilter = 'favs';
    $('#chip-filter-favs').classList.add('active');
    $('#chip-filter-all').classList.remove('active');
    renderFoods();
  });

  // Delegación en tarjetas de Mis alimentos
  $('#foods-container').addEventListener('click', event => {
    const btn = event.target.closest('button');
    if (!btn) return;
    if (btn.dataset.useFoodDirect) {
      const f = foods.find(x => x.id === btn.dataset.useFoodDirect);
      if (f) openDirectUseFood(f);
    }
    if (btn.dataset.toggleFav) {
      toggleFoodFavorite(btn.dataset.toggleFav);
    }
    if (btn.dataset.duplicateFood) {
      duplicateFood(btn.dataset.duplicateFood);
    }
    if (btn.dataset.editFood) {
      const f = foods.find(x => x.id === btn.dataset.editFood);
      if (f) openFoodEditor(f);
    }
    if (btn.dataset.deleteFood) {
      deleteFood(btn.dataset.deleteFood);
    }
  });

  // Botón crear alimento en biblioteca
  $('#btn-create-food').addEventListener('click', () => openFoodEditor());
  $('#btn-close-food-dialog').addEventListener('click', () => $('#food-dialog').close());
  $('#food-form').addEventListener('submit', saveFoodItem);

  // Toggle de base en Food Editor
  document.querySelectorAll('input[name="f-base-type"]').forEach(radio => {
    radio.addEventListener('change', event => {
      const isPortion = event.target.value === 'portion';
      $('#f-fields-weight').hidden = isPortion;
      $('#f-fields-portion').hidden = !isPortion;
    });
  });

  // Quick Add Modal: botones y tabs
  $('#btn-close-quick-add').addEventListener('click', () => $('#quick-add-dialog').close());
  document.querySelectorAll('.meal-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      stagedMeal = chip.dataset.mealChoice;
      document.querySelectorAll('.meal-chip').forEach(c => c.classList.toggle('active', c === chip));
      renderStagedSection();
    });
  });

  $('#tab-mode-library').addEventListener('click', () => setQuickAddMode('library'));
  $('#tab-mode-manual').addEventListener('click', () => setQuickAddMode('manual'));
  $('#quick-search-input').addEventListener('input', renderQuickFoodsList);

  // Delegación en lista de alimentos en Quick Add
  $('#quick-foods-list').addEventListener('click', event => {
    const btn = event.target.closest('[data-select-quick-food]');
    if (!btn) return;
    const f = foods.find(x => x.id === btn.dataset.selectQuickFood);
    if (f) selectFoodForQuickAdd(f);
  });

  $('#btn-clear-selection').addEventListener('click', hideSelectedFoodPanel);
  $('#q-amount-input').addEventListener('input', updateQuickPreview);

  $('#quick-amount-chips').addEventListener('click', event => {
    const btn = event.target.closest('[data-set-qty]');
    if (!btn) return;
    $('#q-amount-input').value = btn.dataset.setQty;
    updateQuickPreview();
  });

  $('#btn-add-staged-item').addEventListener('click', addStagedItemFromLibrary);

  // Formulario Manual en Quick Add
  document.querySelectorAll('input[name="manual-base-type"]').forEach(r => {
    r.addEventListener('change', event => {
      const isPortion = event.target.value === 'portion';
      $('#manual-weight-fields').hidden = isPortion;
      $('#manual-portion-fields').hidden = !isPortion;
      updateManualPreview();
    });
  });

  $('#manual-w-unit').addEventListener('change', event => {
    document.querySelectorAll('.manual-unit-txt').forEach(el => { el.textContent = event.target.value; });
    updateManualPreview();
  });

  ['#manual-w-amount', '#manual-w-kcal', '#manual-w-protein', '#manual-p-amount', '#manual-p-kcal', '#manual-p-protein'].forEach(sel => {
    $(sel).addEventListener('input', updateManualPreview);
  });

  $('#btn-add-manual-item').addEventListener('click', addStagedItemFromManual);

  // Delegación en items staged (eliminar item acumulado)
  $('#staged-items-list').addEventListener('click', event => {
    const btn = event.target.closest('[data-remove-staged]');
    if (!btn) return;
    const idx = Number(btn.dataset.removeStaged);
    stagedItems.splice(idx, 1);
    renderStagedSection();
  });

  $('#btn-save-entire-meal').addEventListener('click', saveEntireMeal);

  // Modal Direct Use
  $('#btn-close-use-dialog').addEventListener('click', () => $('#use-food-dialog').close());
  $('#u-amount-input').addEventListener('input', updateDirectUsePreview);
  $('#u-amount-chips').addEventListener('click', event => {
    const btn = event.target.closest('[data-set-u-qty]');
    if (!btn) return;
    $('#u-amount-input').value = btn.dataset.setUQty;
    updateDirectUsePreview();
  });
  $('#use-food-form').addEventListener('submit', confirmDirectUseFood);

  // Modal Editar Entrada
  $('#btn-close-entry-dialog').addEventListener('click', () => $('#entry-dialog').close());
  ['#edit-entry-amount', '#edit-entry-density-kcal', '#edit-entry-density-protein'].forEach(sel => {
    $(sel).addEventListener('input', updateEditEntryPreview);
  });
  $('#entry-form').addEventListener('submit', saveEditEntry);

  // Ajustes: guardar objetivos y respaldos
  $('#btn-save-goal').addEventListener('click', saveGoals);
  $('#btn-export').addEventListener('click', exportData);
  $('#file-import').addEventListener('change', importData);
  $('#btn-persist').addEventListener('click', requestPersistence);
}

// -------------------------------------------------------------
// 13. INICIALIZACIÓN DE LA APLICACIÓN
// -------------------------------------------------------------
async function init() {
  try {
    db = await openDatabase();
    attachEvents();
    await refresh();
    await checkStorage();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js', { scope: './' })
        .catch(err => console.warn('Offline no disponible aún:', err));
    }
  } catch (error) {
    console.error(error);
    $('#main-content').innerHTML = `
      <section class="empty-state">
        <strong>No se pudo iniciar el almacenamiento local</strong>
        Asegúrate de no estar usando navegación privada restrictiva y de tener espacio disponible en tu dispositivo.
      </section>
    `;
  }
}

init();
