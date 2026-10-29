/**
 * weightView.js — Controlador y renderizador de la vista "Mi Peso" y gráfica SVG nativa
 */
import { getState, setState, refreshState } from '../../app/state.js';
import { fmt, esc } from '../../utils/formatting.js';
import { todayISO, dateText, dateShort, offsetDate } from '../../utils/dates.js';
import { computeWeightStats, getSortedWeightEntries } from '../../utils/energy.js';
import { deleteWeightEntry as deleteWeightFromRepo } from '../../services/database/weightRepo.js';
import { toast } from '../../components/Toast.js';
import { openWeightDialog } from './weightModal.js';

const $ = sel => document.querySelector(sel);

/**
 * Renderiza la pantalla completa de peso corporal
 */
export function renderWeightView() {
  const { weightEntries, weightChartPeriod } = getState();
  const stats = computeWeightStats(weightEntries);
  const sorted = getSortedWeightEntries(weightEntries);

  const lastWeightEl = $('#stat-last-weight');
  const lastDateEl = $('#stat-last-date');
  if (lastWeightEl) {
    lastWeightEl.textContent = stats.latest ? fmt(stats.latest.weight) : '—';
  }
  if (lastDateEl) {
    lastDateEl.textContent = stats.latest ? dateText(stats.latest.date) : 'Sin mediciones';
  }

  // Cambio reciente
  const recentEl = $('#stat-diff-recent');
  if (recentEl) {
    if (stats.recentDiff !== null) {
      const sign = stats.recentDiff > 0 ? '+' : '';
      recentEl.textContent = `${sign}${fmt(stats.recentDiff)} kg`;
      recentEl.style.color = stats.recentDiff < 0 ? '#047857' : (stats.recentDiff > 0 ? '#be123c' : 'var(--ink)');
    } else {
      recentEl.textContent = '—';
      recentEl.style.color = 'var(--ink)';
    }
  }

  // Cambio total
  const totalEl = $('#stat-diff-total');
  if (totalEl) {
    if (stats.totalDiff !== null) {
      const sign = stats.totalDiff > 0 ? '+' : '';
      totalEl.textContent = `${sign}${fmt(stats.totalDiff)} kg`;
      totalEl.style.color = stats.totalDiff < 0 ? '#047857' : (stats.totalDiff > 0 ? '#be123c' : 'var(--ink)');
    } else {
      totalEl.textContent = '—';
      totalEl.style.color = 'var(--ink)';
    }
  }

  const countLabel = $('#weight-count-label');
  if (countLabel) {
    countLabel.textContent = `${sorted.length} medicion${sorted.length === 1 ? '' : 'es'}`;
  }

  // Filtrar según período de gráfica
  let periodFiltered = sorted.slice();
  const today = todayISO();
  if (weightChartPeriod === '4w') {
    const start = offsetDate(today, -28);
    periodFiltered = periodFiltered.filter(w => w.date >= start);
  } else if (weightChartPeriod === '3m') {
    const start = offsetDate(today, -90);
    periodFiltered = periodFiltered.filter(w => w.date >= start);
  }

  renderWeightSvgChart(periodFiltered);
  renderWeightList(sorted);
  renderAccessibleWeightTable(sorted);
}

function renderWeightSvgChart(points) {
  const svg = $('#weight-svg-chart');
  const empty = $('#chart-empty-state');
  const rangeInfo = $('#chart-range-info');
  if (!svg) return;

  if (!points || points.length < 2) {
    svg.innerHTML = '';
    if (empty) empty.hidden = false;
    if (rangeInfo) rangeInfo.textContent = 'Se necesitan al menos 2 mediciones';
    return;
  }

  if (empty) empty.hidden = true;
  const weights = points.map(p => p.weight);
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  const padding = Math.max(0.8, (maxW - minW) * 0.15);
  const yMin = minW - padding;
  const yMax = maxW + padding;
  const yRange = yMax - yMin;

  const width = 500;
  const height = 220;
  const padLeft = 45;
  const padRight = 30;
  const padTop = 25;
  const padBottom = 35;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  if (rangeInfo) {
    rangeInfo.textContent = `${points.length} puntos (${dateShort(points[0].date)} — ${dateShort(points[points.length - 1].date)})`;
  }

  // Coordenadas
  const coords = points.map((p, idx) => {
    const x = padLeft + (idx / (points.length - 1)) * chartW;
    const y = padTop + chartH - ((p.weight - yMin) / yRange) * chartH;
    return { x, y, weight: p.weight, date: p.date };
  });

  // Líneas de guía horizontal
  const gridCount = 4;
  let gridLines = '';
  for (let i = 0; i <= gridCount; i++) {
    const yVal = yMin + (yRange / gridCount) * i;
    const yPos = padTop + chartH - (i / gridCount) * chartH;
    gridLines += `
      <line x1="${padLeft}" y1="${yPos}" x2="${width - padRight}" y2="${yPos}" stroke="#edf2f7" stroke-width="1" />
      <text x="${padLeft - 8}" y="${yPos + 4}" fill="#8c95a8" font-size="10" font-weight="700" text-anchor="end">${fmt(yVal)}</text>
    `;
  }

  // Trazado de línea
  const pathD = coords.reduce((acc, c, idx) => `${acc} ${idx === 0 ? 'M' : 'L'} ${c.x} ${c.y}`, '');
  // Área bajo la curva
  const areaD = `${pathD} L ${coords[coords.length - 1].x} ${padTop + chartH} L ${coords[0].x} ${padTop + chartH} Z`;

  // Puntos
  const circles = coords.map(c => `
    <g class="chart-point">
      <circle cx="${c.x}" cy="${c.y}" r="5" fill="#6352d8" stroke="#ffffff" stroke-width="2.5" />
      <text x="${c.x}" y="${c.y - 9}" fill="#4a3ec6" font-size="10" font-weight="800" text-anchor="middle">${fmt(c.weight)}</text>
      <text x="${c.x}" y="${height - 12}" fill="#8c95a8" font-size="9.5" font-weight="650" text-anchor="middle">${dateShort(c.date)}</text>
    </g>
  `).join('');

  svg.innerHTML = `
    <defs>
      <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#6352d8" stop-opacity="0.22" />
        <stop offset="100%" stop-color="#6352d8" stop-opacity="0.0" />
      </linearGradient>
    </defs>
    ${gridLines}
    <path d="${areaD}" fill="url(#chartGrad)" />
    <path d="${pathD}" fill="none" stroke="#6352d8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
    ${circles}
  `;
}

function renderAccessibleWeightTable(sorted) {
  const tbody = $('#accessible-weight-tbody');
  if (!tbody) return;

  if (!sorted.length) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center">Sin datos registrados</td></tr>';
    return;
  }

  tbody.innerHTML = sorted.slice().reverse().map((w, idx, arr) => {
    const prev = arr[idx + 1];
    let diffTxt = '—';
    if (prev) {
      const diff = Math.round((w.weight - prev.weight) * 10) / 10;
      diffTxt = `${diff > 0 ? '+' : ''}${fmt(diff)} kg`;
    }
    return `
      <tr>
        <td>${esc(dateText(w.date))}</td>
        <td><strong>${fmt(w.weight)} kg</strong></td>
        <td>${diffTxt}</td>
      </tr>
    `;
  }).join('');
}

function renderWeightList(sorted) {
  const container = $('#weights-list-container');
  if (!container) return;

  if (!sorted.length) {
    container.innerHTML = `
      <div class="empty-state">
        <strong>Aún no has registrado tu peso</strong>
        Presiona «＋ Registrar peso» para comenzar tu seguimiento histórico.
      </div>
    `;
    return;
  }

  const reversed = sorted.slice().reverse();

  container.innerHTML = reversed.map((item, idx) => {
    const prevItem = reversed[idx + 1];
    let diffBadge = '';
    if (prevItem) {
      const diff = Math.round((item.weight - prevItem.weight) * 10) / 10;
      if (diff < 0) {
        diffBadge = `<span class="w-diff-badge down">▼ ${fmt(Math.abs(diff))} kg</span>`;
      } else if (diff > 0) {
        diffBadge = `<span class="w-diff-badge up">▲ +${fmt(diff)} kg</span>`;
      } else {
        diffBadge = `<span class="w-diff-badge same">= 0 kg</span>`;
      }
    }

    const noteTxt = item.note ? `<span class="w-row-note">${esc(item.note)}</span>` : '';

    return `
      <article class="weight-row-item">
        <div class="weight-row-left">
          <span class="w-row-date">${esc(dateText(item.date))}</span>
          ${noteTxt}
        </div>
        <div class="weight-row-right">
          <span class="w-row-val">${fmt(item.weight)} kg</span>
          ${diffBadge}
          <button type="button" class="icon-action" data-edit-weight="${esc(item.id)}" aria-label="Editar peso del ${esc(item.date)}">✎</button>
          <button type="button" class="icon-action" data-delete-weight="${esc(item.id)}" aria-label="Eliminar registro">×</button>
        </div>
      </article>
    `;
  }).join('');
}

async function handleDeleteWeight(id) {
  const { weightEntries } = getState();
  const item = weightEntries.find(w => w.id === id);
  if (!item) return;
  if (!confirm(`¿Eliminar el registro de peso de ${item.weight} kg (${dateText(item.date)})?`)) return;

  try {
    await deleteWeightFromRepo(id);
    await refreshState();
    renderWeightView();
    toast('Registro de peso eliminado');
  } catch (err) {
    console.error(err);
    toast('No se pudo eliminar');
  }
}

/**
 * Inicializa los escuchadores de la vista de peso corporal
 */
export function initWeightListeners() {
  const btnOpen = $('#btn-open-weight-dialog') || $('#btn-add-weight');
  if (btnOpen) {
    btnOpen.addEventListener('click', () => openWeightDialog(null));
  }

  // Botones de período de gráfica (data-chart-period o id)
  document.querySelectorAll('[data-chart-period]').forEach(btn => {
    btn.addEventListener('click', () => {
      const period = btn.dataset.chartPeriod;
      document.querySelectorAll('[data-chart-period]').forEach(b => b.classList.toggle('active', b === btn));
      setState({ weightChartPeriod: period });
      renderWeightView();
    });
  });

  ['4w', '3m', 'all'].forEach(period => {
    const tab = $(`#tab-wperiod-${period}`);
    if (tab) {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.period-chip').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        setState({ weightChartPeriod: period });
        renderWeightView();
      });
    }
  });

  const btnToggleTable = $('#btn-toggle-accessible-table');
  if (btnToggleTable) {
    btnToggleTable.addEventListener('click', () => {
      const wrap = $('#accessible-weight-table-wrap');
      if (wrap) {
        wrap.hidden = !wrap.hidden;
        btnToggleTable.textContent = wrap.hidden
          ? 'Ver tabla de datos accesible'
          : 'Ocultar tabla de datos';
      }
    });
  }

  const listContainer = $('#weights-list-container');
  if (listContainer) {
    listContainer.addEventListener('click', event => {
      const btn = event.target.closest('button');
      if (!btn) return;
      if (btn.dataset.editWeight) {
        const { weightEntries } = getState();
        const item = weightEntries.find(w => w.id === btn.dataset.editWeight);
        if (item) openWeightDialog(item);
      }
      if (btn.dataset.deleteWeight) {
        handleDeleteWeight(btn.dataset.deleteWeight);
      }
    });
  }
}
