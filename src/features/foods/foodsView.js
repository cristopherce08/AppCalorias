/**
 * foodsView.js — Controlador y renderizador de la biblioteca recurrente "Mis Alimentos"
 */
import { getState, setState, refreshState } from '../../app/state.js';
import { fmt, esc } from '../../utils/formatting.js';
import { keyName } from '../../utils/dates.js';
import { saveFood, deleteFood as deleteFoodFromRepo } from '../../services/database/foodsRepo.js';
import { toast } from '../../components/Toast.js';
import { openFoodEditor } from './foodEditorModal.js';
import { openDirectUseFood } from './directUseModal.js';

const $ = sel => document.querySelector(sel);

/**
 * Renderiza la lista de alimentos de la biblioteca
 */
export function renderFoodsView() {
  const { foods, foodFilter } = getState();

  const searchInput = $('#food-search');
  const query = searchInput ? keyName(searchInput.value) : '';
  const favsCount = foods.filter(f => f.favorite).length;

  const countAll = $('#count-foods-all');
  const countFavs = $('#count-foods-favs');
  if (countAll) countAll.textContent = String(foods.length);
  if (countFavs) countFavs.textContent = String(favsCount);

  let filtered = foods.filter(f => {
    const matchesQuery = !query || keyName(f.name).includes(query) || keyName(f.brand || '').includes(query);
    const matchesFilter = (foodFilter === 'all') || (foodFilter === 'favs' && f.favorite);
    return matchesQuery && matchesFilter;
  });

  filtered.sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    return a.name.localeCompare(b.name, 'es');
  });

  const container = $('#foods-container');
  if (!container) return;

  if (!filtered.length) {
    container.innerHTML = `
      <div class="empty-state">
        <strong>No se encontraron alimentos</strong>
        ${query ? 'Intenta con otro término de búsqueda o crea uno nuevo.' : 'Presiona «＋ Nuevo alimento» para crear tu biblioteca personal de ingredientes habituales.'}
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

async function handleToggleFavorite(id) {
  const { foods } = getState();
  const f = foods.find(x => x.id === id);
  if (!f) return;
  const updated = {
    ...f,
    favorite: !f.favorite,
    updatedAt: new Date().toISOString()
  };
  await saveFood(updated);
  await refreshState();
  renderFoodsView();
  toast(updated.favorite ? 'Marcado como favorito ⭐' : 'Quitado de favoritos');
}

function handleDuplicateFood(id) {
  const { foods } = getState();
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

async function handleDeleteFood(id) {
  const { foods } = getState();
  const f = foods.find(x => x.id === id);
  if (!f) return;
  if (!confirm(`¿Eliminar “${f.name}” de tu biblioteca?\n\nLos registros que ya guardaste en tu historial se mantendrán intactos con sus calorías y proteínas originales.`)) {
    return;
  }
  try {
    await deleteFoodFromRepo(id);
    await refreshState();
    renderFoodsView();
    toast('Alimento eliminado');
  } catch (err) {
    console.error(err);
    toast('No se pudo eliminar');
  }
}

/**
 * Inicializa los escuchadores de eventos para la vista de alimentos
 */
export function initFoodsListeners() {
  const searchInput = $('#food-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderFoodsView();
    });
  }

  const tabAll = $('#tab-foods-all') || $('#chip-filter-all');
  const tabFavs = $('#tab-foods-favs') || $('#chip-filter-favs');

  if (tabAll) {
    tabAll.addEventListener('click', () => {
      tabAll.classList.add('active');
      if (tabFavs) tabFavs.classList.remove('active');
      setState({ foodFilter: 'all' });
      renderFoodsView();
    });
  }

  if (tabFavs) {
    tabFavs.addEventListener('click', () => {
      tabFavs.classList.add('active');
      if (tabAll) tabAll.classList.remove('active');
      setState({ foodFilter: 'favs' });
      renderFoodsView();
    });
  }

  const btnNewFood = $('#btn-new-food') || $('#btn-create-food');
  if (btnNewFood) {
    btnNewFood.addEventListener('click', () => openFoodEditor(null));
  }

  const container = $('#foods-container');
  if (container) {
    container.addEventListener('click', event => {
      const btn = event.target.closest('button');
      if (!btn) return;
      if (btn.dataset.toggleFav) handleToggleFavorite(btn.dataset.toggleFav);
      if (btn.dataset.duplicateFood) handleDuplicateFood(btn.dataset.duplicateFood);
      if (btn.dataset.editFood) {
        const { foods } = getState();
        const f = foods.find(x => x.id === btn.dataset.editFood);
        if (f) openFoodEditor(f);
      }
      if (btn.dataset.deleteFood) handleDeleteFood(btn.dataset.deleteFood);
      if (btn.dataset.useFoodDirect) {
        const { foods } = getState();
        const f = foods.find(x => x.id === btn.dataset.useFoodDirect);
        if (f) openDirectUseFood(f);
      }
    });
  }
}
