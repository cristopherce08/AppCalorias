/**
 * energy.js — Lógica de cálculo de gasto metabólico (Mifflin-St Jeor, Katch-McArdle),
 * calibración adaptativa empírica, escenarios proporcionales y estadísticas de peso.
 * Funciones puras independientes del DOM e IndexedDB.
 */
import { offsetDate } from './dates.js';
import { sumKcal } from './nutrition.js';

export const ACTIVITY_LABELS = {
  '1.20': 'Sedentario (x1.20)',
  '1.375': 'Actividad ligera (x1.375)',
  '1.55': 'Actividad moderada (x1.55)',
  '1.725': 'Actividad alta (x1.725)',
  '1.90': 'Actividad muy alta (x1.90)'
};

export const NEAT_LABELS = {
  '1.20': 'Escritorio / < 4 000 pasos (x1.20)',
  '1.30': 'Ligero / 4 000–7 000 pasos (x1.30)',
  '1.40': 'Activo / 7 000–10 000 pasos (x1.40)',
  '1.52': 'Muy activo / > 10 000 pasos (x1.52)'
};

export const PACE_CONFIG = {
  mild: { label: 'Suave', lossPct: 0.10, gainPct: 0.10 },
  moderate: { label: 'Moderado', lossPct: 0.15, gainPct: 0.12 },
  strong: { label: 'Marcado', lossPct: 0.20, gainPct: 0.15 }
};

function matchDecimalKey(factor, candidates) {
  const n = Number(factor);
  if (!Number.isFinite(n)) return '';
  for (const key of candidates) {
    if (Math.abs(n - Number(key)) < 0.001) return key;
  }
  return String(n);
}

/**
 * Normaliza claves decimales del selector de actividad ('1.2' -> '1.20', '1.9' -> '1.90')
 * @param {number|string} factor
 * @returns {string}
 */
export const normalizeActivityKey = factor => matchDecimalKey(factor, Object.keys(ACTIVITY_LABELS));

/**
 * Normaliza claves decimales del selector NEAT ('1.2' -> '1.20', '1.3' -> '1.30', etc.)
 * @param {number|string} factor
 * @returns {string}
 */
export const normalizeNeatKey = factor => matchDecimalKey(factor, Object.keys(NEAT_LABELS));

function validateBodyMetrics({ weightKg, heightCm, ageYears, bodyFatPct = null }) {
  const w = Number(weightKg);
  const h = Number(heightCm);
  const a = Number(ageYears);

  if (!Number.isFinite(w) || w < 20 || w > 400) {
    throw new Error('Introduce un peso válido entre 20 y 400 kg');
  }
  if (!Number.isFinite(h) || h < 80 || h > 260) {
    throw new Error('Introduce una estatura válida entre 80 y 260 cm');
  }
  if (!Number.isFinite(a) || a < 15 || a > 120) {
    throw new Error('Introduce una edad válida entre 15 y 120 años');
  }

  let bf = null;
  if (bodyFatPct !== null && bodyFatPct !== undefined && bodyFatPct !== '') {
    bf = Number(bodyFatPct);
    if (!Number.isFinite(bf) || bf < 3 || bf > 65) {
      throw new Error('Introduce un porcentaje de grasa corporal válido entre 3 % y 65 %');
    }
  }

  return { w, h, a, bf };
}

/**
 * Calcula el gasto energético basal (RMR) y total (TDEE) según la ecuación validada de Mifflin-St Jeor
 * @param {Object} params
 * @param {number|string} params.weightKg
 * @param {number|string} params.heightCm
 * @param {number|string} params.ageYears
 * @param {'male'|'female'|'unspecified'} params.physiologicalParam
 * @param {number|string} params.activityMultiplier
 * @returns {Object}
 */
export function calculateMifflinStJeor({ weightKg, heightCm, ageYears, physiologicalParam, activityMultiplier }) {
  const { w, h, a } = validateBodyMetrics({ weightKg, heightCm, ageYears });
  const factor = Number(activityMultiplier);

  if (!Number.isFinite(factor) || factor < 1.0 || factor > 2.5) {
    throw new Error('Selecciona un nivel de actividad válido');
  }

  // Ecuación base Mifflin-St Jeor: 10 * peso + 6.25 * estatura - 5 * edad
  const base = (10 * w) + (6.25 * h) - (5 * a);

  const rmrMale = Math.round(base + 5);
  const rmrFemale = Math.round(base - 161);
  const tdeeMale = Math.round(rmrMale * factor);
  const tdeeFemale = Math.round(rmrFemale * factor);

  if (physiologicalParam === 'male') {
    return {
      isRange: false,
      param: 'male',
      formula: 'mifflin_st_jeor',
      rmr: rmrMale,
      tdee: tdeeMale,
      factor,
      weightKg: w,
      heightCm: h,
      ageYears: a
    };
  } else if (physiologicalParam === 'female') {
    return {
      isRange: false,
      param: 'female',
      formula: 'mifflin_st_jeor',
      rmr: rmrFemale,
      tdee: tdeeFemale,
      factor,
      weightKg: w,
      heightCm: h,
      ageYears: a
    };
  } else {
    // Parámetro no especificado: intervalo orientativo
    const rmrMin = Math.min(rmrMale, rmrFemale);
    const rmrMax = Math.max(rmrMale, rmrFemale);
    const tdeeMin = Math.min(tdeeMale, tdeeFemale);
    const tdeeMax = Math.max(tdeeMale, tdeeFemale);
    return {
      isRange: true,
      param: 'unspecified',
      formula: 'mifflin_st_jeor',
      rmrMin,
      rmrMax,
      tdeeMin,
      tdeeMax,
      rmr: Math.round((rmrMin + rmrMax) / 2),
      tdee: Math.round((tdeeMin + tdeeMax) / 2),
      factor,
      weightKg: w,
      heightCm: h,
      ageYears: a
    };
  }
}

/**
 * Calcula el gasto energético con soporte de composición corporal (Katch-McArdle)
 * y desglose NEAT + ejercicio semanal neto (MET - 1 para evitar doble conteo del metabolismo basal).
 * @param {Object} params
 * @returns {Object}
 */
export function calculateEnergyExpenditure({
  weightKg,
  heightCm,
  ageYears,
  physiologicalParam = 'male',
  bodyFatPct = null,
  activityMode = 'standard',
  activityMultiplier = 1.55,
  neatFactor = 1.30,
  workoutsPerWeek = 0,
  workoutMinutes = 0,
  workoutMet = 5.5
}) {
  const { w, h, a, bf } = validateBodyMetrics({ weightKg, heightCm, ageYears, bodyFatPct });
  const mode = activityMode === 'detailed' ? 'detailed' : 'standard';

  let rmrBase;
  if (bf !== null) {
    const rawLeanMass = w * (1 - bf / 100);
    const rmr = Math.round(370 + (21.6 * rawLeanMass));
    rmrBase = {
      isRange: false,
      param: physiologicalParam,
      formula: 'katch_mcardle',
      bodyFatPct: bf,
      leanMassKg: Math.round(rawLeanMass * 10) / 10,
      rmr
    };
  } else {
    const msj = calculateMifflinStJeor({
      weightKg: w,
      heightCm: h,
      ageYears: a,
      physiologicalParam,
      activityMultiplier: 1.0
    });
    rmrBase = {
      isRange: msj.isRange,
      param: msj.param,
      formula: 'mifflin_st_jeor',
      bodyFatPct: null,
      leanMassKg: null,
      rmr: msj.rmr,
      rmrMin: msj.rmrMin,
      rmrMax: msj.rmrMax
    };
  }

  if (mode === 'detailed') {
    const neat = Number(neatFactor);
    const days = Number(workoutsPerWeek || 0);
    const mins = Number(workoutMinutes || 0);
    const met = Number(workoutMet || 5.5);

    if (!Number.isFinite(neat) || neat < 1.0 || neat > 2.2) {
      throw new Error('Selecciona un nivel de actividad diaria válido');
    }
    if (!Number.isFinite(days) || days < 0 || days > 14) {
      throw new Error('Los días de entrenamiento por semana deben estar entre 0 y 14');
    }
    if (!Number.isFinite(mins) || mins < 0 || mins > 360) {
      throw new Error('Los minutos por sesión deben estar entre 0 y 360');
    }
    if (!Number.isFinite(met) || met < 1.5 || met > 14) {
      throw new Error('Selecciona una intensidad de entrenamiento válida');
    }

    const weeklyHours = (days * mins) / 60;
    // MET neto = (MET - 1) porque 1 MET en reposo ya está incluido en RMR * NEAT
    const exerciseKcalDay = (days > 0 && mins > 0)
      ? Math.round(((met - 1) * w * weeklyHours) / 7)
      : 0;
    const neatKcalDay = Math.round(rmrBase.rmr * neat);

    if (rmrBase.isRange) {
      const tdeeMin = Math.round(rmrBase.rmrMin * neat) + exerciseKcalDay;
      const tdeeMax = Math.round(rmrBase.rmrMax * neat) + exerciseKcalDay;
      const tdee = Math.round((tdeeMin + tdeeMax) / 2);
      return {
        ...rmrBase,
        activityMode: 'detailed',
        factor: rmrBase.rmr > 0 ? Math.round((tdee / rmrBase.rmr) * 100) / 100 : neat,
        neatFactor: neat,
        neatKcalDay,
        exerciseKcalDay,
        workoutsPerWeek: days,
        workoutMinutes: mins,
        workoutMet: met,
        tdeeMin,
        tdeeMax,
        tdee,
        weightKg: w,
        heightCm: h,
        ageYears: a
      };
    }

    const tdee = neatKcalDay + exerciseKcalDay;
    return {
      ...rmrBase,
      activityMode: 'detailed',
      factor: rmrBase.rmr > 0 ? Math.round((tdee / rmrBase.rmr) * 100) / 100 : neat,
      neatFactor: neat,
      neatKcalDay,
      exerciseKcalDay,
      workoutsPerWeek: days,
      workoutMinutes: mins,
      workoutMet: met,
      tdee,
      weightKg: w,
      heightCm: h,
      ageYears: a
    };
  }

  const factor = Number(activityMultiplier);
  if (!Number.isFinite(factor) || factor < 1.0 || factor > 2.5) {
    throw new Error('Selecciona un nivel de actividad válido');
  }

  if (rmrBase.isRange) {
    const tdeeMin = Math.round(rmrBase.rmrMin * factor);
    const tdeeMax = Math.round(rmrBase.rmrMax * factor);
    return {
      ...rmrBase,
      activityMode: 'standard',
      factor,
      neatFactor: null,
      neatKcalDay: null,
      exerciseKcalDay: 0,
      workoutsPerWeek: 0,
      workoutMinutes: 0,
      workoutMet: 5.5,
      tdeeMin,
      tdeeMax,
      tdee: Math.round((tdeeMin + tdeeMax) / 2),
      weightKg: w,
      heightCm: h,
      ageYears: a
    };
  }

  return {
    ...rmrBase,
    activityMode: 'standard',
    factor,
    neatFactor: null,
    neatKcalDay: null,
    exerciseKcalDay: 0,
    workoutsPerWeek: 0,
    workoutMinutes: 0,
    workoutMet: 5.5,
    tdee: Math.round(rmrBase.rmr * factor),
    weightKg: w,
    heightCm: h,
    ageYears: a
  };
}

/**
 * Calcula los escenarios de ingesta calórica orientativa a partir del TDEE
 * @param {number} tdee 
 * @returns {{ maintain: number, loss: number, gain: number }}
 */
export function calculateScenarios(tdee) {
  const maintain = Math.round(tdee);
  const loss = Math.max(1200, Math.round(tdee - 350));
  const gain = Math.round(tdee + 350);
  return { maintain, loss, gain };
}

/**
 * Calcula escenarios proporcionales al TDEE según el ritmo elegido, incluyendo cambio semanal estimado.
 * @param {number} tdee
 * @param {'mild'|'moderate'|'strong'} [pace='moderate']
 * @returns {Object}
 */
export function calculatePacedScenarios(tdee, pace = 'moderate') {
  const resolvedPace = Object.hasOwn(PACE_CONFIG, pace) ? pace : 'moderate';
  const cfg = PACE_CONFIG[resolvedPace];
  const maintain = Math.round(tdee);
  const loss = Math.min(maintain, Math.max(1200, Math.round(tdee * (1 - cfg.lossPct))));
  const gain = Math.round(tdee * (1 + cfg.gainPct));
  const lossDelta = maintain - loss;
  const gainDelta = gain - maintain;

  return {
    pace: resolvedPace,
    label: cfg.label,
    maintain,
    loss,
    gain,
    lossPct: Math.round(cfg.lossPct * 100),
    gainPct: Math.round(cfg.gainPct * 100),
    lossDelta,
    gainDelta,
    lossWeeklyKg: Math.round(((-lossDelta * 7) / 7700) * 100) / 100,
    gainWeeklyKg: Math.round(((gainDelta * 7) / 7700) * 100) / 100
  };
}

/**
 * Devuelve las calorías objetivo para un escenario y ritmo dados
 * @param {number} tdee
 * @param {'maintain'|'loss'|'gain'} [scenario='maintain']
 * @param {'mild'|'moderate'|'strong'} [pace='moderate']
 * @returns {number}
 */
export function getScenarioTargetKcal(tdee, scenario = 'maintain', pace = 'moderate') {
  const scen = calculatePacedScenarios(tdee, pace);
  return scen[scenario] ?? scen.maintain;
}

function isoToDayIndex(isoDate) {
  return Math.round(new Date(`${isoDate}T12:00:00Z`).getTime() / 86400000);
}

/**
 * Estima el gasto calórico real (TDEE empírico) combinando ingesta registrada en el diario
 * y la pendiente por regresión lineal de los pesajes corporales.
 * @param {Object} params
 * @param {Array<Object>} params.entries
 * @param {Array<Object>} params.weightEntries
 * @param {number|null} [params.formulaTdee]
 * @param {number} [params.lookbackDays=35]
 * @param {number} [params.minDayKcal=500]
 * @returns {Object}
 */
export function estimateAdaptiveTdee({
  entries = [],
  weightEntries = [],
  formulaTdee = null,
  lookbackDays = 35,
  minDayKcal = 500
}) {
  const sortedWeights = getSortedWeightEntries(weightEntries)
    .filter(w => w && typeof w.date === 'string' && Number.isFinite(Number(w.weight)) && Number(w.weight) > 0);

  if (sortedWeights.length < 2) {
    return {
      available: false,
      reason: 'insufficient_weights',
      weightCount: sortedWeights.length,
      minWeights: 2
    };
  }

  const latestDate = sortedWeights[sortedWeights.length - 1].date;
  const windowStart = offsetDate(latestDate, -lookbackDays);
  const weightsInWindow = sortedWeights.filter(w => w.date >= windowStart && w.date <= latestDate);

  if (weightsInWindow.length < 2) {
    return {
      available: false,
      reason: 'insufficient_weights',
      weightCount: weightsInWindow.length,
      minWeights: 2
    };
  }

  const startDate = weightsInWindow[0].date;
  const endDate = weightsInWindow[weightsInWindow.length - 1].date;
  const baseDay = isoToDayIndex(startDate);
  const spanDays = isoToDayIndex(endDate) - baseDay;

  if (spanDays < 14) {
    return {
      available: false,
      reason: 'short_span',
      spanDays,
      minSpanDays: 14,
      weightCount: weightsInWindow.length
    };
  }

  // Regresión lineal ordinaria (OLS) sobre los pesajes para filtrar retención de agua puntual
  const points = weightsInWindow.map(w => ({
    x: isoToDayIndex(w.date) - baseDay,
    y: Number(w.weight)
  }));
  const n = points.length;
  const meanX = points.reduce((acc, p) => acc + p.x, 0) / n;
  const meanY = points.reduce((acc, p) => acc + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - meanX) * (p.y - meanY);
    den += (p.x - meanX) * (p.x - meanX);
  }
  const slopeKgPerDay = den > 0 ? num / den : 0;
  const weeklyTrendKg = Math.round(slopeKgPerDay * 7 * 100) / 100;

  // Agrupar entradas de comida por día dentro de la ventana exacta [startDate, endDate]
  const dayGroups = new Map();
  for (const entry of (entries || [])) {
    if (!entry || typeof entry.date !== 'string') continue;
    if (entry.date < startDate || entry.date > endDate) continue;
    if (!dayGroups.has(entry.date)) dayGroups.set(entry.date, []);
    dayGroups.get(entry.date).push(entry);
  }

  const validDayTotals = [];
  for (const list of dayGroups.values()) {
    const kcal = sumKcal(list);
    if (Number.isFinite(kcal) && kcal >= minDayKcal) {
      validDayTotals.push(kcal);
    }
  }

  const totalWindowDays = spanDays + 1;
  const validDaysCount = validDayTotals.length;
  const coverage = validDaysCount / totalWindowDays;

  if (validDaysCount < 10 || coverage < 0.55) {
    return {
      available: false,
      reason: 'insufficient_logs',
      validDaysCount,
      minDays: 10,
      totalWindowDays,
      coveragePct: Math.round(coverage * 100),
      spanDays,
      weightCount: weightsInWindow.length
    };
  }

  const avgDailyIntake = Math.round(validDayTotals.reduce((a, b) => a + b, 0) / validDaysCount);
  const empiricalTdee = Math.round(avgDailyIntake - (slopeKgPerDay * 7700));

  if (!Number.isFinite(empiricalTdee) || empiricalTdee < 900 || empiricalTdee > 6500) {
    return {
      available: false,
      reason: 'outlier',
      rawEmpiricalTdee: empiricalTdee,
      avgDailyIntake,
      weeklyTrendKg,
      validDaysCount,
      totalWindowDays,
      coveragePct: Math.round(coverage * 100),
      spanDays,
      weightCount: weightsInWindow.length
    };
  }

  const confidence = (validDaysCount >= 18 && weightsInWindow.length >= 4 && spanDays >= 21 && coverage >= 0.75)
    ? 'high'
    : 'medium';

  const hasFormula = Number.isFinite(Number(formulaTdee)) && Number(formulaTdee) > 0;
  const diffFromFormula = hasFormula ? empiricalTdee - Math.round(Number(formulaTdee)) : null;
  const diffPct = hasFormula ? Math.round(((empiricalTdee - Number(formulaTdee)) / Number(formulaTdee)) * 100) : null;

  return {
    available: true,
    empiricalTdee,
    avgDailyIntake,
    weeklyTrendKg,
    validDaysCount,
    totalWindowDays,
    coveragePct: Math.round(coverage * 100),
    weightCount: weightsInWindow.length,
    spanDays,
    confidence,
    startDate,
    endDate,
    diffFromFormula,
    diffPct
  };
}

/**
 * Ordena cronológicamente los registros de peso
 * @param {Array<Object>} weightEntries 
 * @returns {Array<Object>}
 */
export function getSortedWeightEntries(weightEntries) {
  if (!Array.isArray(weightEntries)) return [];
  return weightEntries.slice().sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Obtiene el registro de peso más reciente
 * @param {Array<Object>} weightEntries 
 * @returns {Object|null}
 */
export function getLatestWeightEntry(weightEntries) {
  const sorted = getSortedWeightEntries(weightEntries);
  return sorted.length ? sorted[sorted.length - 1] : null;
}

/**
 * Computa estadísticas y variaciones entre registros de peso
 * @param {Array<Object>} weightEntries 
 * @returns {Object}
 */
export function computeWeightStats(weightEntries) {
  const sorted = getSortedWeightEntries(weightEntries);
  if (!sorted.length) {
    return {
      latest: null,
      previous: null,
      recentDiff: null,
      totalDiff: null,
      count: 0
    };
  }

  const latest = sorted[sorted.length - 1];
  const previous = sorted.length >= 2 ? sorted[sorted.length - 2] : null;
  const first = sorted[0];

  const recentDiff = previous ? Math.round((latest.weight - previous.weight) * 100) / 100 : null;
  const totalDiff = sorted.length >= 2 ? Math.round((latest.weight - first.weight) * 100) / 100 : null;

  return {
    latest,
    previous,
    recentDiff,
    totalDiff,
    count: sorted.length
  };
}
