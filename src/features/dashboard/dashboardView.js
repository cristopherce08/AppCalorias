/**
 * dashboardView.js — Controlador y renderizador del diario de alimentación (vista "Hoy")
 */
import { getState, setState, refreshState } from '../../app/state.js';
import { navigateTo } from '../../app/router.js';
import { fmt, esc } from '../../utils/formatting.js';
import { dateText, todayISO, offsetDate, validDate } from '../../utils/dates.js';
import { computeNutrition, sumKcal, sumProtein, dayEntries, MEALS } from '../../utils/nutrition.js';
import { deleteEntry as deleteEntryFromRepo } from '../../services/database/entriesRepo.js';
import { setSetting } from '../../services/database/settingsRepo.js';
import { MEAL_ICONS } from '../../components/icons.js';
import { toast } from '../../components/Toast.js';
import { openQuickAdd } from '../meals/quickAddModal.js';
import { openEditEntry } from '../meals/editEntryModal.js';

const $ = sel => document.querySelector(sel);

/**
 * Renderiza la vista del diario con los datos del estado actual
 */
export function renderDashboard() {
  const { entries, settings, currentDate } = getState();

  const diaryDateInput = $('#diary-date');
  const datePretty = $('#date-pretty');
  if (diaryDateInput) diaryDateInput.value = currentDate;
  if (datePretty) datePretty.textContent = dateText(currentDate);

  const day = dayEntries(entries, currentDate);
  const totalKcal = sumKcal(day);
  const protSummary = sumProtein(day);

  // Totales principales
  const dayKcalEl = $('#day-total-kcal');
  const dayProtEl = $('#day-total-protein');
  if (dayKcalEl) dayKcalEl.textContent = fmt(totalKcal);
  if (dayProtEl) {
    dayProtEl.textContent = protSummary.allUnknown ? '—' : fmt(protSummary.total);
  }

  // Indicador de proteínas parciales
  const badgeProt = $('#day-protein-partial-badge');
  const noteProt = $('#protein-partial-note');
  if (badgeProt) badgeProt.hidden = !protSummary.isPartial;
  if (noteProt) noteProt.hidden = !protSummary.isPartial;

  // Barra de progreso vs. Mantenimiento informativo de Calorías
  const goalKcal = Number(settings.goal || 0);
  const kcalWrap = $('#goal-kcal-wrapper');
  const maintWrap = $('#maint-ref-wrapper');

  if (goalKcal > 0) {
    if (kcalWrap) kcalWrap.hidden = false;
    if (maintWrap) maintWrap.hidden = true;
    const pct = Math.min(100, Math.round((totalKcal / goalKcal) * 100));
    const fillKcal = $('#progress-fill-kcal');
    const barKcal = $('#progress-bar-kcal');
    const textKcal = $('#goal-kcal-text');

    if (fillKcal) fillKcal.style.width = `${pct}%`;
    if (barKcal) {
      barKcal.setAttribute('aria-valuenow', String(Math.round(totalKcal)));
      barKcal.setAttribute('aria-valuemax', String(goalKcal));
    }
    if (textKcal) {
      if (totalKcal > goalKcal) {
        textKcal.textContent = `${fmt(totalKcal)} / ${fmt(goalKcal)} kcal (+${fmt(totalKcal - goalKcal)} kcal)`;
      } else {
        textKcal.textContent = `${fmt(totalKcal)} / ${fmt(goalKcal)} kcal (${pct}%)`;
      }
    }
  } else {
    if (kcalWrap) kcalWrap.hidden = true;
    const calcResult = settings.calcResult;
    if (calcResult && (calcResult.tdee || calcResult.tdeeMin)) {
      if (maintWrap) maintWrap.hidden = false;
      const maintText = $('#maint-ref-text');
      if (maintText) {
        if (calcResult.isRange) {
          maintText.textContent = `~${fmt(calcResult.tdeeMin)}–${fmt(calcResult.tdeeMax)} kcal/día`;
        } else {
          maintText.textContent = `~${fmt(calcResult.tdee)} kcal/día`;
        }
      }
    } else {
      if (maintWrap) maintWrap.hidden = true;
    }
  }

  // Barra de progreso de proteínas
  const goalProt = Number(settings.proteinGoal || 0);
  const protWrap = $('#goal-protein-wrapper');
  if (goalProt > 0) {
    if (protWrap) protWrap.hidden = false;
    const pct = Math.min(100, Math.round((protSummary.total / goalProt) * 100));
    const fillProt = $('#progress-fill-protein');
    const barProt = $('#progress-bar-protein');
    const textProt = $('#goal-protein-text');

    if (fillProt) fillProt.style.width = `${pct}%`;
    if (barProt) {
      barProt.setAttribute('aria-valuenow', String(Math.round(protSummary.total)));
      barProt.setAttribute('aria-valuemax', String(goalProt));
    }
    if (textProt) {
      if (protSummary.total > goalProt) {
        textProt.textContent = `${fmt(protSummary.total)} / ${fmt(goalProt)} g (+${fmt(protSummary.total - goalProt)} g)`;
      } else {
        textProt.textContent = `${fmt(protSummary.total)} / ${fmt(goalProt)} g (${pct}%)`;
      }
    }
  } else {
    if (protWrap) protWrap.hidden = true;
  }

  // Banner de aviso si cambió la estimación por nuevo peso
  const pending = settings.pendingGoalReview;
  const banner = $('#calc-update-banner');
  const bannerText = $('#calc-update-banner-text');
  if (pending && pending.oldGoal && pending.newTdee) {
    if (banner) banner.hidden = false;
    if (bannerText) {
      bannerText.textContent = `Tu mantenimiento se recalculó a ${fmt(pending.newTdee)} kcal/día con tu peso reciente (${fmt(pending.newWeight)} kg). Tu meta actual sigue en ${fmt(pending.oldGoal)} kcal. ¿Deseas revisarla?`;
    }
  } else {
    if (banner) banner.hidden = true;
  }

  // Renderizado de tarjetas de comida
  const container = $('#meals-container');
  if (!container) return;

  container.innerHTML = MEALS.map(meal => {
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

      let baseTxt = '';
      if (e.baseType === 'total_consumed') {
        baseTxt = `Valores totales (${fmt(e.kcalPer100)} kcal / 100 ${esc(e.unit)})`;
      } else if (e.baseType === 'portion') {
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
          <div class="meal-item-main">
            <div class="meal-item-name">${esc(e.name)}${brandTag}</div>
            <div class="meal-item-detail">${fmt(e.amount)} ${esc(e.unit)} · ${baseTxt}</div>
          </div>
          <div class="meal-item-side">
            <div class="item-nutri-badges">
              <span class="badge-kcal">${fmt(kcalVal)} kcal</span>
              ${protDisplay}
            </div>
            <div class="entry-menu-wrap">
              <button type="button" class="entry-more-btn" data-more-entry="${esc(e.id)}" aria-label="Opciones de ${esc(e.name)}" aria-haspopup="true" aria-expanded="false">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <circle cx="12" cy="5" r="2.2"/>
                  <circle cx="12" cy="12" r="2.2"/>
                  <circle cx="12" cy="19" r="2.2"/>
                </svg>
              </button>
              <div class="entry-menu-dropdown" id="entry-menu-${esc(e.id)}" hidden role="menu">
                <button type="button" class="entry-menu-item" data-edit-entry="${esc(e.id)}" role="menuitem">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  <span>Editar</span>
                </button>
                <button type="button" class="entry-menu-item item-delete" data-delete-entry="${esc(e.id)}" role="menuitem">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                  <span>Eliminar</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('')}</div>` : '<div class="meal-empty">Todavía no has registrado alimentos en esta comida</div>';

    return `
      <article class="meal-card">
        <div class="meal-top">
          <div class="meal-title-area">
            <div class="meal-emoji" aria-hidden="true">${MEAL_ICONS[meal.id] || ''}</div>
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

async function handleDeleteEntry(id) {
  const { entries } = getState();
  const e = entries.find(x => x.id === id);
  if (!e) return;
  if (!confirm(`¿Eliminar “${e.name}” de este día?`)) return;

  try {
    await deleteEntryFromRepo(id);
    await refreshState();
    renderDashboard();
    toast('Ingrediente eliminado');
  } catch (err) {
    console.error(err);
    toast('No se pudo eliminar');
  }
}

/**
 * Inicializa los escuchadores de eventos para la vista del diario
 */
export function initDashboardListeners() {
  const prevBtn = $('#btn-prev-date');
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      const { currentDate } = getState();
      setState({ currentDate: offsetDate(currentDate, -1) });
      renderDashboard();
    });
  }

  const nextBtn = $('#btn-next-date');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      const { currentDate } = getState();
      setState({ currentDate: offsetDate(currentDate, 1) });
      renderDashboard();
    });
  }

  const dateInput = $('#diary-date');
  if (dateInput) {
    dateInput.addEventListener('change', () => {
      if (validDate(dateInput.value)) {
        setState({ currentDate: dateInput.value });
        renderDashboard();
      }
    });
  }

  const todayBtn = $('#btn-today');
  if (todayBtn) {
    todayBtn.addEventListener('click', () => {
      setState({ currentDate: todayISO() });
      renderDashboard();
    });
  }

  const dismissGoalBtn = $('#btn-dismiss-goal-banner');
  if (dismissGoalBtn) {
    dismissGoalBtn.addEventListener('click', async () => {
      await setSetting('pendingGoalReview', null);
      await refreshState();
      renderDashboard();
    });
  }

  const reviewGoalBtn = $('#btn-review-goal-banner');
  if (reviewGoalBtn) {
    reviewGoalBtn.addEventListener('click', () => {
      navigateTo('calculadora');
    });
  }

  const quickAddMainBtn = $('#btn-quick-add-main');
  if (quickAddMainBtn) {
    quickAddMainBtn.addEventListener('click', () => {
      const hour = new Date().getHours();
      const defaultMeal = hour < 11 ? 'desayuno' : (hour < 16 ? 'almuerzo' : 'cena');
      openQuickAdd(defaultMeal);
    });
  }

  const mealsContainer = $('#meals-container');
  if (mealsContainer) {
    mealsContainer.addEventListener('click', event => {
      // Manejo de apertura y alternancia del menú de 3 puntos
      const moreBtn = event.target.closest('[data-more-entry]');
      if (moreBtn) {
        event.stopPropagation();
        const entryId = moreBtn.dataset.moreEntry;
        const dropdown = document.getElementById(`entry-menu-${entryId}`);
        const isCurrentlyOpen = dropdown && !dropdown.hidden;

        closeAllEntryMenus();

        if (dropdown && !isCurrentlyOpen) {
          dropdown.hidden = false;
          moreBtn.setAttribute('aria-expanded', 'true');
        }
        return;
      }

      const btn = event.target.closest('button');
      if (!btn) return;

      if (btn.dataset.addMeal) {
        closeAllEntryMenus();
        openQuickAdd(btn.dataset.addMeal);
      }
      if (btn.dataset.editEntry) {
        closeAllEntryMenus();
        openEditEntry(btn.dataset.editEntry);
      }
      if (btn.dataset.deleteEntry) {
        closeAllEntryMenus();
        handleDeleteEntry(btn.dataset.deleteEntry);
      }
    });
  }

  // Cerrar menús contextuales al tocar fuera de ellos
  document.addEventListener('click', event => {
    if (!event.target.closest('.entry-menu-wrap')) {
      closeAllEntryMenus();
    }
  });

  // Cerrar menús contextuales con la tecla Escape
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeAllEntryMenus();
    }
  });
}

/**
 * Cierra todos los menús desplegables de ingredientes
 */
export function closeAllEntryMenus() {
  document.querySelectorAll('.entry-menu-dropdown:not([hidden])').forEach(dd => {
    dd.hidden = true;
  });
  document.querySelectorAll('.entry-more-btn[aria-expanded="true"]').forEach(btn => {
    btn.setAttribute('aria-expanded', 'false');
  });
}
