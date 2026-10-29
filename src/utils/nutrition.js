/**
 * nutrition.js — Fórmulas puras de cálculo nutricional (Calorías y Proteínas)
 * Desacoplado de DOM e IndexedDB para pruebas unitarias deterministas.
 */

export const MEALS = [
  { id: 'desayuno', title: 'Desayuno' },
  { id: 'almuerzo', title: 'Almuerzo' },
  { id: 'cena', title: 'Cena' },
  { id: 'snack', title: 'Snacks' }
];

/**
 * Calcula calorías y proteínas a partir de los datos de un ingrediente o porción
 * @param {Object} item 
 * @returns {{ kcal: number, protein: number|null }}
 */
export function computeNutrition(item) {
  if (!item) return { kcal: 0, protein: null };
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

/**
 * Suma total de calorías en una lista de entradas de diario
 * @param {Array<Object>} list 
 * @returns {number}
 */
export function sumKcal(list) {
  if (!Array.isArray(list)) return 0;
  return list.reduce((total, e) => {
    const val = (Number.isFinite(e.kcal)) ? e.kcal : computeNutrition(e).kcal;
    return total + (Number.isFinite(val) ? val : 0);
  }, 0);
}

/**
 * Suma de proteínas evaluando si el total diario es parcial por ingredientes antiguos
 * @param {Array<Object>} list 
 * @returns {{ total: number, isPartial: boolean, allUnknown: boolean, hasKnown: boolean, unknownCount: number }}
 */
export function sumProtein(list) {
  if (!Array.isArray(list)) {
    return { total: 0, isPartial: false, allUnknown: false, hasKnown: false, unknownCount: 0 };
  }
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

/**
 * Filtra las entradas correspondientes a una fecha ISO determinada
 * @param {Array<Object>} entries 
 * @param {string} day 
 * @returns {Array<Object>}
 */
export function dayEntries(entries, day) {
  if (!Array.isArray(entries)) return [];
  return entries.filter(e => e.date === day);
}
