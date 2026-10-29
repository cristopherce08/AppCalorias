/**
 * energy.js — Lógica de cálculo de gasto metabólico (Mifflin-St Jeor), escenarios y estadísticas de peso
 * Funciones puras independientes del DOM e IndexedDB.
 */

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
  const w = Number(weightKg);
  const h = Number(heightCm);
  const a = Number(ageYears);
  const factor = Number(activityMultiplier);

  if (!Number.isFinite(w) || w <= 0 || w > 400) {
    throw new Error('Introduce un peso válido entre 20 y 400 kg');
  }
  if (!Number.isFinite(h) || h <= 0 || h > 260) {
    throw new Error('Introduce una estatura válida entre 80 y 260 cm');
  }
  if (!Number.isFinite(a) || a <= 0 || a > 120) {
    throw new Error('Introduce una edad válida entre 15 y 120 años');
  }
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

  const recentDiff = previous ? Math.round((latest.weight - previous.weight) * 10) / 10 : null;
  const totalDiff = sorted.length >= 2 ? Math.round((latest.weight - first.weight) * 10) / 10 : null;

  return {
    latest,
    previous,
    recentDiff,
    totalDiff,
    count: sorted.length
  };
}
