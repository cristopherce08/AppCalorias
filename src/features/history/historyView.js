/**
 * historyView.js — Controlador y renderizador del historial alimentario cronológico
 */
import { getState, setState } from '../../app/state.js';
import { navigateTo } from '../../app/router.js';
import { fmt, esc } from '../../utils/formatting.js';
import { dateText } from '../../utils/dates.js';
import { sumKcal, sumProtein, dayEntries } from '../../utils/nutrition.js';

const $ = sel => document.querySelector(sel);

/**
 * Renderiza el historial agrupado por fechas
 */
export function renderHistoryView() {
  const { entries } = getState();
  const days = [...new Set(entries.map(e => e.date))].sort().reverse();
  const container = $('#history-container');
  if (!container) return;

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
    const list = dayEntries(entries, day);
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
        <span class="history-totals">
          <span class="pill-kcal">${fmt(dayKcal)} kcal</span>
          <span class="pill-protein">${protTxt}</span>
        </span>
      </button>
    `;
  }).join('');
}

/**
 * Inicializa los escuchadores para la vista de historial
 */
export function initHistoryListeners() {
  const container = $('#history-container');
  if (container) {
    container.addEventListener('click', event => {
      const btn = event.target.closest('[data-open-date]');
      if (!btn) return;
      const targetDate = btn.dataset.openDate;
      if (targetDate) {
        setState({ currentDate: targetDate });
        navigateTo('diario');
      }
    });
  }
}
