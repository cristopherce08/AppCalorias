/**
 * calculatorView.js — Controlador de la Calculadora de Gasto Energético (Mifflin-St Jeor)
 */
import { getState, setState, refreshState } from '../../app/state.js';
import { navigateTo } from '../../app/router.js';
import { fmt } from '../../utils/formatting.js';
import { todayISO, dateShort } from '../../utils/dates.js';
import { calculateMifflinStJeor, calculateScenarios, getLatestWeightEntry } from '../../utils/energy.js';
import { setSetting } from '../../services/database/settingsRepo.js';
import { toast } from '../../components/Toast.js';
import { openGoalConfirm } from './goalConfirmModal.js';

const $ = sel => document.querySelector(sel);

/**
 * Renderiza los valores guardados y resultados de la calculadora
 */
export function renderCalculatorView() {
  const { settings, activeScenario } = getState();

  const profile = settings.calcProfile;
  if (profile) {
    const w = $('#calc-weight');
    const h = $('#calc-height');
    const a = $('#calc-age');
    const act = $('#calc-activity');
    if (w && profile.weight) w.value = profile.weight;
    if (h && profile.height) h.value = profile.height;
    if (a && profile.age) a.value = profile.age;
    if (act && profile.activity) act.value = profile.activity;

    const param = profile.param || 'male';
    document.querySelectorAll('input[name="calc-param"]').forEach(r => {
      r.checked = (r.value === param);
    });
  }

  const res = settings.calcResult;
  const resCard = $('#calc-results-card');
  if (res && (res.tdee || res.tdeeMin)) {
    if (resCard) resCard.hidden = false;
    const resDate = $('#calc-res-date');
    const resRmr = $('#calc-res-rmr');
    const resTdee = $('#calc-res-tdee');
    const metaDetails = $('#calc-meta-details');

    if (resDate) resDate.textContent = res.date ? dateShort(res.date) : 'Estimación activa';

    if (res.isRange) {
      if (resRmr) resRmr.textContent = `${fmt(res.rmrMin)}–${fmt(res.rmrMax)} kcal`;
      if (resTdee) resTdee.textContent = `${fmt(res.tdeeMin)}–${fmt(res.tdeeMax)} kcal`;
    } else {
      if (resRmr) resRmr.textContent = `${fmt(res.rmr)} kcal`;
      if (resTdee) resTdee.textContent = `${fmt(res.tdee)} kcal`;
    }

    const actMap = {
      '1.20': 'Sedentario (x1.20)',
      '1.375': 'Actividad ligera (x1.375)',
      '1.55': 'Actividad moderada (x1.55)',
      '1.725': 'Actividad alta (x1.725)',
      '1.90': 'Actividad muy alta (x1.90)'
    };

    const paramTxt = res.param === 'male' ? 'Parámetro masculino' : (res.param === 'female' ? 'Parámetro femenino' : 'Sin parámetro específico');
    if (metaDetails) {
      metaDetails.textContent = `Basado en ${fmt(res.weight)} kg · ${fmt(res.height)} cm · ${fmt(res.age)} años · ${actMap[String(res.factor)] || 'Factor ' + res.factor} · ${paramTxt}`;
    }

    // Escenarios orientativos
    const baseTdee = res.tdee || Math.round((res.tdeeMin + res.tdeeMax) / 2);
    const scen = calculateScenarios(baseTdee);
    const scenMaintain = $('#scen-val-maintain');
    const scenLoss = $('#scen-val-loss');
    const scenGain = $('#scen-val-gain');

    if (scenMaintain) scenMaintain.textContent = `${fmt(scen.maintain)} kcal`;
    if (scenLoss) scenLoss.textContent = `${fmt(scen.loss)} kcal`;
    if (scenGain) scenGain.textContent = `${fmt(scen.gain)} kcal`;

    document.querySelectorAll('.scenario-item').forEach(el => {
      el.classList.toggle('active', el.dataset.scenario === activeScenario);
    });
  } else {
    if (resCard) resCard.hidden = true;
  }
}

async function handleRunCalculator(event) {
  event.preventDefault();
  const weight = Number($('#calc-weight')?.value);
  const height = Number($('#calc-height')?.value);
  const age = Number($('#calc-age')?.value);
  const param = document.querySelector('input[name="calc-param"]:checked')?.value || 'male';
  const activity = Number($('#calc-activity')?.value);

  try {
    const result = calculateMifflinStJeor({
      weightKg: weight,
      heightCm: height,
      ageYears: age,
      physiologicalParam: param,
      activityMultiplier: activity
    });

    const profileData = {
      weight,
      height,
      age,
      param,
      activity: String(activity),
      updatedAt: new Date().toISOString()
    };

    const resultData = {
      ...result,
      weight,
      height,
      age,
      date: todayISO()
    };

    await setSetting('calcProfile', profileData);
    await setSetting('calcResult', resultData);
    await refreshState();
    renderCalculatorView();

    const resCard = $('#calc-results-card');
    if (resCard) resCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    toast('Gasto energético estimado con éxito');
  } catch (err) {
    toast(err.message || 'Error en los datos ingresados');
  }
}

function handleOptionA() {
  const { settings } = getState();
  if (!settings.calcResult) {
    toast('Primero realiza un cálculo');
    return;
  }
  navigateTo('diario');
  toast('Estimación guardada como referencia informativa en Hoy');
}

function handleOptionB() {
  const { settings, activeScenario } = getState();
  if (!settings.calcResult) {
    toast('Primero realiza un cálculo');
    return;
  }

  const baseTdee = settings.calcResult.tdee || Math.round((settings.calcResult.tdeeMin + settings.calcResult.tdeeMax) / 2);
  const scen = calculateScenarios(baseTdee);
  const proposed = scen[activeScenario] || baseTdee;
  openGoalConfirm(proposed);
}

async function handleClearGoal() {
  if (!confirm('¿Quitar tu meta calórica activa?\n\nTu diario volverá a mostrar solo el total consumido y la estimación de mantenimiento como referencia, sin barras de progreso.')) {
    return;
  }

  try {
    const { settings } = getState();
    await setSetting('goal', null);
    if (settings.pendingGoalReview) {
      await setSetting('pendingGoalReview', null);
    }
    await refreshState();
    navigateTo('diario');
    toast('Meta calórica quitada (modo solo informativo)');
  } catch (err) {
    console.error(err);
    toast('No se pudo quitar la meta');
  }
}

/**
 * Inicializa los escuchadores para la vista de la calculadora
 */
export function initCalculatorListeners() {
  const form = $('#calc-form');
  if (form) form.addEventListener('submit', handleRunCalculator);

  const btnRun = $('#btn-run-calculation');
  if (btnRun) btnRun.addEventListener('click', handleRunCalculator);

  const btnBack = $('#btn-calc-back-diario');
  if (btnBack) btnBack.addEventListener('click', () => navigateTo('diario'));

  const btnLatestW = $('#btn-use-latest-weight');
  if (btnLatestW) {
    btnLatestW.addEventListener('click', () => {
      const { weightEntries } = getState();
      const latest = getLatestWeightEntry(weightEntries);
      if (latest) {
        const wInput = $('#calc-weight');
        if (wInput) wInput.value = latest.weight;
        toast(`Peso de ${fmt(latest.weight)} kg aplicado al cálculo`);
      } else {
        toast('Aún no has registrado ningún peso');
      }
    });
  }

  document.querySelectorAll('.scenario-item').forEach(el => {
    el.addEventListener('click', () => {
      const scenario = el.dataset.scenario;
      if (scenario) {
        setState({ activeScenario: scenario });
        document.querySelectorAll('.scenario-item').forEach(s => {
          s.classList.toggle('active', s.dataset.scenario === scenario);
        });
      }
    });
  });

  const btnOptA = $('#btn-opt-a-save-ref') || $('#btn-calc-opt-a');
  if (btnOptA) btnOptA.addEventListener('click', handleOptionA);

  const btnOptB = $('#btn-opt-b-set-goal') || $('#btn-calc-opt-b');
  if (btnOptB) btnOptB.addEventListener('click', handleOptionB);

  const btnClearGoal = $('#btn-clear-goal') || $('#btn-clear-kcal-goal');
  if (btnClearGoal) btnClearGoal.addEventListener('click', handleClearGoal);
}
