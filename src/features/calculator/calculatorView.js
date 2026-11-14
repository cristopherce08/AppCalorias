/**
 * calculatorView.js — Controlador de la Calculadora de Gasto Energético
 * Soporta Mifflin-St Jeor, Katch-McArdle (% grasa corporal), desglose NEAT + entrenamientos
 * y calibración adaptativa empírica con el historial real del usuario.
 */
import { getState, setState, refreshState } from '../../app/state.js';
import { navigateTo } from '../../app/router.js';
import { fmt } from '../../utils/formatting.js';
import { todayISO, dateShort } from '../../utils/dates.js';
import {
  ACTIVITY_LABELS,
  NEAT_LABELS,
  normalizeActivityKey,
  normalizeNeatKey,
  calculateEnergyExpenditure,
  calculatePacedScenarios,
  getScenarioTargetKcal,
  estimateAdaptiveTdee,
  getLatestWeightEntry
} from '../../utils/energy.js';
import { setSetting } from '../../services/database/settingsRepo.js';
import { toast } from '../../components/Toast.js';
import { openGoalConfirm } from './goalConfirmModal.js';

const $ = sel => document.querySelector(sel);

const DEFAULT_PARAM_NOTE = '<em>Nota fisiológica:</em> La fórmula Mifflin-St Jeor utiliza esta constante exclusivamente debido a diferencias estadísticas medias en masa magra libre de grasa observadas en estudios metabólicos. Si eliges «Sin especificar», se calculará un intervalo orientativo sin asumir un número único falsamente preciso.';
const BF_PARAM_NOTE = '<em>Modo Katch-McArdle activo:</em> Al indicar tu % de grasa corporal, el gasto en reposo se calcula directamente sobre tu masa magra estimada sin utilizar la constante +5 / -161.';

let lastSyncedProfileSig = null;
let lastSyncedPrefsSig = null;

function getProfileFormSignature(profile) {
  if (!profile) return 'null';
  return JSON.stringify([
    profile.weight ?? null,
    profile.height ?? null,
    profile.age ?? null,
    profile.bodyFatPct ?? null,
    profile.param ?? 'male',
    profile.activityMode ?? 'standard',
    normalizeActivityKey(profile.activity || '1.55'),
    normalizeNeatKey(profile.neatFactor || '1.30'),
    profile.workoutsPerWeek ?? 0,
    profile.workoutMinutes ?? 0,
    profile.workoutMet ?? 5.5
  ]);
}

function syncActivityModeVisibility(mode) {
  const isDetailed = mode === 'detailed';
  const stdWrap = $('#calc-activity-standard-wrap');
  const detWrap = $('#calc-activity-detailed-wrap');
  if (stdWrap) stdWrap.hidden = isDetailed;
  if (detWrap) detWrap.hidden = !isDetailed;
}

function syncBodyFatParamNote() {
  const bfVal = $('#calc-body-fat')?.value?.trim();
  const noteEl = $('#calc-param-note');
  if (noteEl) {
    noteEl.innerHTML = bfVal ? BF_PARAM_NOTE : DEFAULT_PARAM_NOTE;
  }
}

function syncProfileToForm(profile, weightEntries) {
  const wInput = $('#calc-weight');
  if (profile) {
    const hInput = $('#calc-height');
    const aInput = $('#calc-age');
    const bfInput = $('#calc-body-fat');
    const actSelect = $('#calc-activity');
    const neatSelect = $('#calc-neat');
    const daysInput = $('#calc-workout-days');
    const minsInput = $('#calc-workout-mins');
    const metSelect = $('#calc-workout-intensity');

    if (wInput && profile.weight) wInput.value = profile.weight;
    if (hInput && profile.height) hInput.value = profile.height;
    if (aInput && profile.age) aInput.value = profile.age;
    if (bfInput) bfInput.value = profile.bodyFatPct ?? '';

    const normalizedAct = normalizeActivityKey(profile.activity || '1.55');
    if (actSelect && normalizedAct) actSelect.value = normalizedAct;

    const normalizedNeat = normalizeNeatKey(profile.neatFactor || '1.30');
    if (neatSelect && normalizedNeat) neatSelect.value = normalizedNeat;

    if (daysInput && profile.workoutsPerWeek !== undefined) daysInput.value = profile.workoutsPerWeek;
    if (minsInput && profile.workoutMinutes !== undefined) minsInput.value = profile.workoutMinutes;
    if (metSelect && profile.workoutMet) metSelect.value = String(profile.workoutMet);

    const param = profile.param || 'male';
    document.querySelectorAll('input[name="calc-param"]').forEach(r => {
      r.checked = (r.value === param);
    });

    const actMode = profile.activityMode === 'detailed' ? 'detailed' : 'standard';
    document.querySelectorAll('input[name="calc-activity-mode"]').forEach(r => {
      r.checked = (r.value === actMode);
    });
    syncActivityModeVisibility(actMode);
    syncBodyFatParamNote();
  } else if (wInput && !wInput.value) {
    const latest = getLatestWeightEntry(weightEntries);
    if (latest) wInput.value = latest.weight;
  }
}

function renderAdaptiveCalibration(adaptive, useAdaptiveTdee) {
  const titleEl = $('#calc-adaptive-title');
  const badgeEl = $('#calc-adaptive-badge');
  const descEl = $('#calc-adaptive-desc');
  const toggleBtn = $('#btn-toggle-adaptive-source');
  if (!titleEl || !descEl) return;

  if (adaptive.available) {
    const trendSign = adaptive.weeklyTrendKg > 0 ? '+' : '';
    const diffText = adaptive.diffFromFormula !== null
      ? ` (${adaptive.diffFromFormula > 0 ? '+' : ''}${fmt(adaptive.diffFromFormula)} kcal vs. fórmula)`
      : '';

    titleEl.textContent = `Gasto real estimado: ${fmt(adaptive.empiricalTdee)} kcal/día`;
    if (badgeEl) {
      badgeEl.hidden = false;
      badgeEl.textContent = adaptive.confidence === 'high' ? 'Confianza alta' : 'Confianza media';
      badgeEl.classList.toggle('high', adaptive.confidence === 'high');
    }
    descEl.textContent = `Calculado con tu historial real (${adaptive.validDaysCount} días válidos en ${adaptive.spanDays} días, ingesta media de ${fmt(adaptive.avgDailyIntake)} kcal/día y tendencia de ${trendSign}${fmt(adaptive.weeklyTrendKg)} kg/sem)${diffText}.`;

    if (toggleBtn) {
      toggleBtn.hidden = false;
      toggleBtn.textContent = useAdaptiveTdee
        ? '✓ Usando gasto real en escenarios (volver a fórmula)'
        : 'Usar gasto real en escenarios';
    }
    return;
  }

  if (badgeEl) badgeEl.hidden = true;
  if (toggleBtn) toggleBtn.hidden = true;
  titleEl.textContent = 'Calibración adaptativa con tu historial real';

  if (adaptive.reason === 'insufficient_weights') {
    descEl.textContent = 'Registra al menos 2 pesajes separados por 14 días en «Mi peso» para calibrar tu gasto real según tu evolución.';
  } else if (adaptive.reason === 'short_span') {
    descEl.textContent = `Tienes pesajes en un rango de ${adaptive.spanDays} días; al completar al menos 14 días se calculará tu gasto real automáticamente.`;
  } else if (adaptive.reason === 'insufficient_logs') {
    descEl.textContent = `Llevas ${adaptive.validDaysCount} días con registro válido en la ventana actual (se requieren al menos ${adaptive.minDays} días y 55 % de cobertura para estimar tu gasto real sin sesgos).`;
  } else {
    descEl.textContent = 'La variación reciente de peso supera el rango fisiológico habitual (p. ej., cambios rápidos de agua corporal o días sin registrar). Sigue registrando para estabilizar la calibración.';
  }
}

function updateScenarioUI(effectiveTdee, res, activeAdaptive, activeScenario, activePace) {
  const scen = calculatePacedScenarios(effectiveTdee, activePace);
  const showRange = Boolean(res.isRange && !activeAdaptive);
  const scenMin = showRange ? calculatePacedScenarios(res.tdeeMin, activePace) : null;
  const scenMax = showRange ? calculatePacedScenarios(res.tdeeMax, activePace) : null;

  const scenMaintain = $('#scen-val-maintain');
  const scenLoss = $('#scen-val-loss');
  const scenGain = $('#scen-val-gain');
  const subMaintain = $('#scen-sub-maintain');
  const subLoss = $('#scen-sub-loss');
  const subGain = $('#scen-sub-gain');

  if (scenMaintain) {
    scenMaintain.textContent = showRange
      ? `${fmt(scenMin.maintain)}–${fmt(scenMax.maintain)} kcal`
      : `${fmt(scen.maintain)} kcal`;
  }
  if (scenLoss) {
    scenLoss.textContent = showRange
      ? `${fmt(scenMin.loss)}–${fmt(scenMax.loss)} kcal`
      : `${fmt(scen.loss)} kcal`;
  }
  if (scenGain) {
    scenGain.textContent = showRange
      ? `${fmt(scenMin.gain)}–${fmt(scenMax.gain)} kcal`
      : `${fmt(scen.gain)} kcal`;
  }

  if (subMaintain) {
    subMaintain.textContent = activeAdaptive
      ? 'Equilibrio según tu gasto real estimado'
      : 'Equilibrio energético estimado';
  }
  if (subLoss) {
    subLoss.textContent = `Déficit del ${scen.lossPct} % (-${fmt(scen.lossDelta)} kcal/día · ≈ ${fmt(scen.lossWeeklyKg)} kg/sem)`;
  }
  if (subGain) {
    subGain.textContent = `Superávit del ${scen.gainPct} % (+${fmt(scen.gainDelta)} kcal/día · ≈ +${fmt(scen.gainWeeklyKg)} kg/sem)`;
  }

  document.querySelectorAll('#calc-pace-toggle [data-calc-pace]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.calcPace === scen.pace);
  });

  document.querySelectorAll('.scenario-item').forEach(el => {
    const isActive = el.dataset.scenario === activeScenario;
    el.classList.toggle('active', isActive);
    el.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function getEffectiveTdeeContext(state) {
  const { entries, weightEntries, settings, useAdaptiveTdee } = state;
  const res = settings.calcResult;
  if (!res || !(res.tdee || res.tdeeMin)) return null;

  const formulaTdee = res.tdee || Math.round((res.tdeeMin + res.tdeeMax) / 2);
  const adaptive = estimateAdaptiveTdee({ entries, weightEntries, formulaTdee });
  const activeAdaptive = Boolean(adaptive.available && useAdaptiveTdee);
  const effectiveTdee = activeAdaptive ? adaptive.empiricalTdee : formulaTdee;

  return { res, formulaTdee, adaptive, activeAdaptive, effectiveTdee };
}

/**
 * Renderiza los valores guardados y resultados de la calculadora
 */
export function renderCalculatorView() {
  const state = getState();
  const { settings, weightEntries, activeScenario, activePace } = state;

  const profile = settings.calcProfile || null;
  const sig = getProfileFormSignature(profile);
  if (sig !== lastSyncedProfileSig) {
    syncProfileToForm(profile, weightEntries);
    lastSyncedProfileSig = sig;
  } else if (!profile) {
    syncProfileToForm(null, weightEntries);
  }

  const prefs = settings.calcPrefs || (profile ? {
    scenario: profile.scenario || 'maintain',
    pace: profile.pace || 'moderate',
    useAdaptive: Boolean(profile.useAdaptive)
  } : null);
  const prefsSig = JSON.stringify(prefs);
  if (prefsSig !== lastSyncedPrefsSig) {
    lastSyncedPrefsSig = prefsSig;
    if (prefs) {
      const updates = {};
      if (prefs.scenario && prefs.scenario !== activeScenario) updates.activeScenario = prefs.scenario;
      if (prefs.pace && prefs.pace !== activePace) updates.activePace = prefs.pace;
      if (prefs.useAdaptive !== undefined && Boolean(prefs.useAdaptive) !== state.useAdaptiveTdee) {
        updates.useAdaptiveTdee = Boolean(prefs.useAdaptive);
      }
      if (Object.keys(updates).length) {
        setState(updates);
        return;
      }
    }
  }

  const resCard = $('#calc-results-card');
  const ctx = getEffectiveTdeeContext(state);
  if (!ctx) {
    if (resCard) resCard.hidden = true;
    return;
  }

  const { res, adaptive, activeAdaptive, effectiveTdee } = ctx;
  if (resCard) resCard.hidden = false;

  const resDate = $('#calc-res-date');
  const badgeFormula = $('#calc-formula-badge');
  const resRmr = $('#calc-res-rmr');
  const resTdee = $('#calc-res-tdee');
  const metaDetails = $('#calc-meta-details');

  if (resDate) resDate.textContent = res.date ? dateShort(res.date) : 'Estimación activa';
  if (badgeFormula) {
    if (activeAdaptive) {
      badgeFormula.textContent = 'CALIBRADO CON TU HISTORIAL REAL';
    } else if (res.formula === 'katch_mcardle') {
      badgeFormula.textContent = 'KATCH-MCARDLE (MASA MAGRA)';
    } else {
      badgeFormula.textContent = 'MIFFLIN-ST JEOR';
    }
  }

  if (res.isRange) {
    if (resRmr) resRmr.textContent = `${fmt(res.rmrMin)}–${fmt(res.rmrMax)} kcal`;
    if (resTdee) resTdee.textContent = `${fmt(res.tdeeMin)}–${fmt(res.tdeeMax)} kcal`;
  } else {
    if (resRmr) resRmr.textContent = `${fmt(res.rmr)} kcal`;
    if (resTdee) resTdee.textContent = `${fmt(res.tdee)} kcal`;
  }

  if (metaDetails) {
    const baseTxt = `${fmt(res.weight)} kg · ${fmt(res.height)} cm · ${fmt(res.age)} años`;
    const eqTxt = res.formula === 'katch_mcardle'
      ? `Katch-McArdle (${fmt(res.bodyFatPct)} % grasa · ${fmt(res.leanMassKg)} kg masa magra)`
      : (res.param === 'male' ? 'Mifflin-St Jeor masculino' : (res.param === 'female' ? 'Mifflin-St Jeor femenino' : 'Mifflin-St Jeor (intervalo)'));

    let actTxt;
    if (res.activityMode === 'detailed') {
      const neatLbl = NEAT_LABELS[normalizeNeatKey(res.neatFactor)] || `NEAT x${res.neatFactor}`;
      const exTxt = res.exerciseKcalDay > 0
        ? ` + ${fmt(res.exerciseKcalDay)} kcal/día entreno (${res.workoutsPerWeek}×${res.workoutMinutes} min)`
        : ' (sin entrenamientos)';
      actTxt = `${neatLbl}${exTxt}`;
    } else {
      actTxt = ACTIVITY_LABELS[normalizeActivityKey(res.factor)] || `Factor ${res.factor}`;
    }
    metaDetails.textContent = `Basado en ${baseTxt} · ${eqTxt} · ${actTxt}`;
  }

  renderAdaptiveCalibration(adaptive, activeAdaptive);
  updateScenarioUI(effectiveTdee, res, activeAdaptive, activeScenario, activePace);
}

async function persistScenarioPreferences(updates = {}) {
  const state = getState();
  const currentPrefs = state.settings.calcPrefs || {
    scenario: state.activeScenario,
    pace: state.activePace,
    useAdaptive: state.useAdaptiveTdee
  };
  const nextPrefs = { ...currentPrefs, ...updates };
  lastSyncedPrefsSig = JSON.stringify(nextPrefs);
  await setSetting('calcPrefs', nextPrefs);
}

async function handleRunCalculator(event) {
  event.preventDefault();
  const weight = Number($('#calc-weight')?.value);
  const height = Number($('#calc-height')?.value);
  const age = Number($('#calc-age')?.value);
  const rawBf = $('#calc-body-fat')?.value?.trim() || '';
  const bodyFatPct = rawBf === '' ? null : Number(rawBf);
  const param = document.querySelector('input[name="calc-param"]:checked')?.value || 'male';
  const activityMode = document.querySelector('input[name="calc-activity-mode"]:checked')?.value || 'standard';
  const activityKey = $('#calc-activity')?.value || '1.55';
  const neatKey = $('#calc-neat')?.value || '1.30';
  const workoutsPerWeek = Number($('#calc-workout-days')?.value || 0);
  const workoutMinutes = Number($('#calc-workout-mins')?.value || 0);
  const workoutMet = Number($('#calc-workout-intensity')?.value || 5.5);
  const { activeScenario, activePace, useAdaptiveTdee } = getState();

  try {
    const result = calculateEnergyExpenditure({
      weightKg: weight,
      heightCm: height,
      ageYears: age,
      physiologicalParam: param,
      bodyFatPct,
      activityMode,
      activityMultiplier: Number(activityKey),
      neatFactor: Number(neatKey),
      workoutsPerWeek,
      workoutMinutes,
      workoutMet
    });

    const profileData = {
      weight,
      height,
      age,
      bodyFatPct,
      param,
      activityMode,
      activity: normalizeActivityKey(activityKey),
      neatFactor: normalizeNeatKey(neatKey),
      workoutsPerWeek,
      workoutMinutes,
      workoutMet,
      updatedAt: new Date().toISOString()
    };

    const resultData = {
      ...result,
      weight,
      height,
      age,
      date: todayISO()
    };

    lastSyncedProfileSig = getProfileFormSignature(profileData);
    await setSetting('calcProfile', profileData);
    await setSetting('calcPrefs', {
      scenario: activeScenario,
      pace: activePace,
      useAdaptive: useAdaptiveTdee
    });
    await setSetting('calcResult', resultData);
    await refreshState();
    renderCalculatorView();

    const resCard = $('#calc-results-card');
    if (resCard) resCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    toast(result.formula === 'katch_mcardle'
      ? 'Gasto calculado con Katch-McArdle (masa magra)'
      : 'Gasto energético estimado con éxito');
  } catch (err) {
    toast(err.message || 'Error en los datos ingresados');
  }
}

async function handleOptionA() {
  const { settings, activeScenario, activePace, useAdaptiveTdee } = getState();
  if (!settings.calcResult) {
    toast('Primero realiza un cálculo');
    return;
  }
  await persistScenarioPreferences({ scenario: activeScenario, pace: activePace, useAdaptive: useAdaptiveTdee });
  await refreshState();
  navigateTo('diario');
  toast('Estimación guardada como referencia informativa en Hoy');
}

function handleOptionB() {
  const state = getState();
  const ctx = getEffectiveTdeeContext(state);
  if (!ctx) {
    toast('Primero realiza un cálculo');
    return;
  }
  const proposed = getScenarioTargetKcal(ctx.effectiveTdee, state.activeScenario, state.activePace);
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

  const btnBack = $('#btn-calc-back-diario');
  if (btnBack) btnBack.addEventListener('click', () => navigateTo('diario'));

  const bfInput = $('#calc-body-fat');
  if (bfInput) bfInput.addEventListener('input', syncBodyFatParamNote);

  document.querySelectorAll('input[name="calc-activity-mode"]').forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.checked) syncActivityModeVisibility(radio.value);
    });
  });

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

  document.querySelectorAll('#calc-pace-toggle [data-calc-pace]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pace = btn.dataset.calcPace;
      if (pace) {
        setState({ activePace: pace });
        await persistScenarioPreferences({ pace });
        await refreshState();
      }
    });
  });

  document.querySelectorAll('.scenario-item').forEach(el => {
    el.addEventListener('click', async () => {
      const scenario = el.dataset.scenario;
      if (scenario) {
        setState({ activeScenario: scenario });
        await persistScenarioPreferences({ scenario });
        await refreshState();
      }
    });
  });

  const btnToggleAdaptive = $('#btn-toggle-adaptive-source');
  if (btnToggleAdaptive) {
    btnToggleAdaptive.addEventListener('click', async () => {
      const next = !getState().useAdaptiveTdee;
      setState({ useAdaptiveTdee: next });
      await persistScenarioPreferences({ useAdaptive: next });
      await refreshState();
    });
  }

  const btnOptA = $('#btn-opt-a-save-ref') || $('#btn-calc-opt-a');
  if (btnOptA) btnOptA.addEventListener('click', handleOptionA);

  const btnOptB = $('#btn-opt-b-set-goal') || $('#btn-calc-opt-b');
  if (btnOptB) btnOptB.addEventListener('click', handleOptionB);

  const btnClearGoal = $('#btn-clear-goal') || $('#btn-clear-kcal-goal');
  if (btnClearGoal) btnClearGoal.addEventListener('click', handleClearGoal);
}
