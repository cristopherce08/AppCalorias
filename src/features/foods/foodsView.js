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
          <div class="entry-menu-wrap">
            <button type="button" class="entry-more-btn" data-more-food="${esc(f.id)}" aria-label="Opciones de ${esc(f.name)}" aria-haspopup="true" aria-expanded="false">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="12" cy="5" r="2.2"/>
                <circle cx="12" cy="12" r="2.2"/>
                <circle cx="12" cy="19" r="2.2"/>
              </svg>
            </button>
            <div class="entry-menu-dropdown food-menu-dropdown" id="food-menu-${esc(f.id)}" hidden role="menu">
              <button type="button" class="entry-menu-item" data-duplicate-food="${esc(f.id)}" role="menuitem">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                <span>Copiar</span>
              </button>
              <button type="button" class="entry-menu-item" data-edit-food="${esc(f.id)}" role="menuitem">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                <span>Editar</span>
              </button>
              <button type="button" class="entry-menu-item item-delete" data-delete-food="${esc(f.id)}" role="menuitem">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                <span>Eliminar</span>
              </button>
            </div>
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
      // Manejo de apertura y alternancia del menú de 3 puntos
      const moreBtn = event.target.closest('[data-more-food]');
      if (moreBtn) {
        event.stopPropagation();
        const foodId = moreBtn.dataset.moreFood;
        const dropdown = document.getElementById(`food-menu-${foodId}`);
        const isCurrentlyOpen = dropdown && !dropdown.hidden;

        closeAllFoodMenus();

        if (dropdown && !isCurrentlyOpen) {
          dropdown.hidden = false;
          moreBtn.setAttribute('aria-expanded', 'true');
        }
        return;
      }

      const btn = event.target.closest('button');
      if (!btn) return;

      if (btn.dataset.toggleFav) {
        closeAllFoodMenus();
        handleToggleFavorite(btn.dataset.toggleFav);
      }
      if (btn.dataset.duplicateFood) {
        closeAllFoodMenus();
        handleDuplicateFood(btn.dataset.duplicateFood);
      }
      if (btn.dataset.editFood) {
        closeAllFoodMenus();
        const { foods } = getState();
        const f = foods.find(x => x.id === btn.dataset.editFood);
        if (f) openFoodEditor(f);
      }
      if (btn.dataset.deleteFood) {
        closeAllFoodMenus();
        handleDeleteFood(btn.dataset.deleteFood);
      }
      if (btn.dataset.useFoodDirect) {
        closeAllFoodMenus();
        const { foods } = getState();
        const f = foods.find(x => x.id === btn.dataset.useFoodDirect);
        if (f) openDirectUseFood(f);
      }
    });
  }

  // Cerrar menús contextuales al tocar fuera de ellos
  document.addEventListener('click', event => {
    if (!event.target.closest('.entry-menu-wrap')) {
      closeAllFoodMenus();
    }
  });

  // Cerrar menús contextuales con Escape
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeAllFoodMenus();
    }
  });
}

/**
 * Cierra todos los menús desplegables de alimentos
 */
export function closeAllFoodMenus() {
  document.querySelectorAll('.food-menu-dropdown:not([hidden])').forEach(dd => {
    dd.hidden = true;
  });
  document.querySelectorAll('[data-more-food][aria-expanded="true"]').forEach(btn => {
    btn.setAttribute('aria-expanded', 'false');
  });
}
