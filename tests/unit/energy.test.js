/**
 * energy.test.js — Pruebas unitarias para fórmulas energéticas y estadísticas de peso
 */
import assert from 'node:assert/strict';
import {
  calculateMifflinStJeor,
  calculateEnergyExpenditure,
  calculateScenarios,
  calculatePacedScenarios,
  estimateAdaptiveTdee,
  normalizeActivityKey,
  computeWeightStats,
  getSortedWeightEntries
} from '../../src/utils/energy.js';

console.log('--- Probando cálculo de gasto energético (Mifflin-St Jeor) ---');

// 1. Hombre: 80 kg, 180 cm, 30 años, factor 1.20 (sedentario)
// RMR = 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5 = 1780 kcal
// TDEE = 1780 * 1.20 = 2136 kcal
const maleCalc = calculateMifflinStJeor({
  weightKg: 80,
  heightCm: 180,
  ageYears: 30,
  physiologicalParam: 'male',
  activityMultiplier: 1.20
});

assert.equal(maleCalc.rmr, 1780);
assert.equal(maleCalc.tdee, 2136);
assert.equal(maleCalc.isRange, false);
console.log('[PASS] Mifflin-St Jeor con parámetro masculino correcto');

// 2. Mujer: 60 kg, 165 cm, 28 años, factor 1.55 (moderado)
// RMR = 10*60 + 6.25*165 - 5*28 - 161 = 600 + 1031.25 - 140 - 161 = 1330.25 -> 1330 kcal
// TDEE = 1330.25 * 1.55 = 2061.8875 -> 2062 kcal
const femaleCalc = calculateMifflinStJeor({
  weightKg: 60,
  heightCm: 165,
  ageYears: 28,
  physiologicalParam: 'female',
  activityMultiplier: 1.55
});

assert.equal(femaleCalc.rmr, 1330);
assert.equal(femaleCalc.tdee, 2062);
assert.equal(femaleCalc.isRange, false);
console.log('[PASS] Mifflin-St Jeor con parámetro femenino correcto');

// 3. Sin parámetro específico: debe devolver rango
const rangeCalc = calculateMifflinStJeor({
  weightKg: 70,
  heightCm: 170,
  ageYears: 35,
  physiologicalParam: 'neutral',
  activityMultiplier: 1.375
});
assert.equal(rangeCalc.isRange, true);
assert(rangeCalc.rmrMin < rangeCalc.rmrMax);
assert(rangeCalc.tdeeMin < rangeCalc.tdeeMax);
console.log('[PASS] Cálculo neutral genera rango válido');

// 4. Escenarios orientativos
const scen = calculateScenarios(2200);
assert.equal(scen.maintain, 2200);
assert.equal(scen.loss, 1850); // deficit de 350 kcal
assert.equal(scen.gain, 2550); // superavit de 350 kcal
console.log('[PASS] Escenarios orientativos calculados correctamente');

// 5. Estadísticas de peso
const weights = [
  { id: 'w1', date: '2026-10-01', weight: 82.5 },
  { id: 'w2', date: '2026-10-08', weight: 81.8 },
  { id: 'w3', date: '2026-10-15', weight: 81.2 }
];

const sortedW = getSortedWeightEntries(weights);
assert.equal(sortedW[0].date, '2026-10-01');
assert.equal(sortedW[2].date, '2026-10-15');

const stats = computeWeightStats(weights);
assert.equal(stats.latest.weight, 81.2);
assert.equal(stats.recentDiff, -0.6); // 81.2 - 81.8 = -0.6
assert.equal(stats.totalDiff, -1.3);  // 81.2 - 82.5 = -1.3

// 6. Estadísticas con 2 decimales
const weights2Decimals = [
  { id: 'w10', date: '2026-10-01', weight: 74.85 },
  { id: 'w11', date: '2026-10-08', weight: 74.50 },
  { id: 'w12', date: '2026-10-15', weight: 74.35 }
];
const stats2 = computeWeightStats(weights2Decimals);
assert.equal(stats2.latest.weight, 74.35);
assert.equal(stats2.recentDiff, -0.15); // 74.35 - 74.50 = -0.15
assert.equal(stats2.totalDiff, -0.5);   // 74.35 - 74.85 = -0.5
console.log('[PASS] Estadísticas de evolución de peso con 2 decimales correctas');
console.log('[PASS] Estadísticas de evolución de peso correctas');

// 7. Validación estricta de rangos corporales
assert.throws(() => calculateEnergyExpenditure({ weightKg: 10, heightCm: 175, ageYears: 25 }), /20 y 400/);
assert.throws(() => calculateEnergyExpenditure({ weightKg: 75, heightCm: 50, ageYears: 25 }), /80 y 260/);
assert.throws(() => calculateEnergyExpenditure({ weightKg: 75, heightCm: 175, ageYears: 10 }), /15 y 120/);
assert.throws(() => calculateEnergyExpenditure({ weightKg: 75, heightCm: 175, ageYears: 25, bodyFatPct: 80 }), /3 % y 65 %/);
console.log('[PASS] Validación estricta de rangos fisiológicos correcta');

// 8. Katch-McArdle con % de grasa corporal
// 80 kg, 20% grasa -> 64 kg masa magra -> RMR = 370 + 21.6*64 = 1752 kcal
const kmCalc = calculateEnergyExpenditure({
  weightKg: 80,
  heightCm: 180,
  ageYears: 30,
  physiologicalParam: 'unspecified',
  bodyFatPct: 20,
  activityMode: 'standard',
  activityMultiplier: 1.55
});
assert.equal(kmCalc.formula, 'katch_mcardle');
assert.equal(kmCalc.leanMassKg, 64);
assert.equal(kmCalc.rmr, 1752);
assert.equal(kmCalc.tdee, Math.round(1752 * 1.55));
assert.equal(kmCalc.isRange, false);
console.log('[PASS] Katch-McArdle por masa magra correcto');

// 9. Modo detallado NEAT + ejercicio semanal neto (MET - 1)
// 80 kg, 180 cm, 30 años, male -> RMR = 1780, NEAT x1.30 = 2314
// 4 días * 60 min @ 5.5 MET -> neto (4.5 * 80 * 4) / 7 = 206 kcal/día -> TDEE = 2520
const detailedCalc = calculateEnergyExpenditure({
  weightKg: 80,
  heightCm: 180,
  ageYears: 30,
  physiologicalParam: 'male',
  activityMode: 'detailed',
  neatFactor: 1.30,
  workoutsPerWeek: 4,
  workoutMinutes: 60,
  workoutMet: 5.5
});
assert.equal(detailedCalc.activityMode, 'detailed');
assert.equal(detailedCalc.neatKcalDay, 2314);
assert.equal(detailedCalc.exerciseKcalDay, 206);
assert.equal(detailedCalc.tdee, 2520);
console.log('[PASS] Cálculo detallado NEAT + entrenamiento neto correcto');

// 10. Escenarios proporcionales por ritmo y normalización de claves
const pacedMod = calculatePacedScenarios(2200, 'moderate');
assert.equal(pacedMod.maintain, 2200);
assert.equal(pacedMod.loss, 1870); // -15%
assert.equal(pacedMod.gain, 2464); // +12%
const pacedLow = calculatePacedScenarios(1300, 'strong');
assert.equal(pacedLow.loss, 1200); // piso mínimo seguro
assert.equal(normalizeActivityKey(1.2), '1.20');
assert.equal(normalizeActivityKey(1.9), '1.90');
console.log('[PASS] Escenarios proporcionales y normalización de factores correctos');

// 11. Calibración adaptativa empírica (OLS + filtrado de días incompletos)
const insufficient = estimateAdaptiveTdee({ entries: [], weightEntries: [{ date: '2026-10-01', weight: 80 }] });
assert.equal(insufficient.available, false);
assert.equal(insufficient.reason, 'insufficient_weights');

const adaptiveWeights = [
  { date: '2026-10-01', weight: 81.0 },
  { date: '2026-10-08', weight: 80.7 },
  { date: '2026-10-15', weight: 80.4 },
  { date: '2026-10-22', weight: 80.1 }
];
const adaptiveEntries = [];
for (let d = 1; d <= 18; d++) {
  adaptiveEntries.push({
    date: `2026-10-${String(d).padStart(2, '0')}`,
    kcal: 2100
  });
}
// Día incompleto (200 kcal) debe ser excluido del promedio
adaptiveEntries.push({ date: '2026-10-19', kcal: 200 });

const adaptiveRes = estimateAdaptiveTdee({
  entries: adaptiveEntries,
  weightEntries: adaptiveWeights,
  formulaTdee: 2300
});
assert.equal(adaptiveRes.available, true);
assert.equal(adaptiveRes.avgDailyIntake, 2100);
assert.equal(adaptiveRes.weeklyTrendKg, -0.3);
assert.equal(adaptiveRes.empiricalTdee, 2430);
assert.equal(adaptiveRes.confidence, 'high');
assert.equal(adaptiveRes.diffFromFormula, 130);
console.log('[PASS] Calibración adaptativa empírica con regresión OLS correcta');
